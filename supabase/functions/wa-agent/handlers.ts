// wa-agent · araç işleyicileri.
//
// Her araç YAZAN NUMARAYA bağlıdır: müşteri kimliği bağlamdan gelir, modelin
// argümanından değil. Yazma iki adımlı: propose_* öneri kaydı açar, randevuya
// dokunmaz; commit_proposal kod kurallarından (guard.commitBlock) geçerse
// uygular ve onay mesajını ŞABLONDAN kendisi yollar — model "alındı" diyemez.
//
// Sonuçlar modele JSON olarak döner. Hata da bir sonuçtur ({ ok:false, reason })
// ve model müşteriye sade dille aktarır; burada fırlatılan istisna yalnız
// beklenmeyen arızadır.

import type { Admin, OrgWa } from '../_shared/wa.ts';
import { sendWA } from '../_shared/wa.ts';
import * as M from '../_shared/booking/messages.ts';
import { isSaneDate } from '../_shared/booking/dates.ts';
import { formatDateTr, minToTime, timeToMin, type WorkingHour } from '../_shared/booking/slots.ts';
import { addDays, daySlots, loadWindow, type StaffHours, type WindowData } from '../_shared/booking/availability.ts';
import { computeBalance, formatTL } from '../_shared/booking/finance.ts';
import { packageRights, type PackageResInput } from '../_shared/booking/packages.ts';
import { eligibilityBlock, isReservationConflict } from '../_shared/booking/reservationErrors.ts';
import { announceFreedSlot, firstNameOf, notifyOwner } from '../_shared/notify.ts';
import type { Profile } from '../_shared/agent/profile.ts';
import type { IstanbulClock } from '../_shared/agent/prompt.ts';
import {
    commitBlock, filterTimes, PROPOSAL_TTL_MS, refPrefix, shortRef, suggestTimes, type PartOfDay,
} from '../_shared/agent/guard.ts';

const APP_ORIGIN = 'https://timeflow.lueratech.com';
/** Bugün için en erken saat: şimdiden bu kadar sonrası. */
const LEAD_MIN = 15;
/** Gün belirtilmeden sorulduğunda kaç gün ileriye bakılır. */
const SEARCH_DAYS = 14;

export interface TurnCtx {
    admin: Admin;
    orgWa: OrgWa;
    orgId: string;
    phone: string;
    conversationId: string;
    runId: string;
    profile: Profile;
    orgHours: WorkingHour[];
    slotDuration: number;
    staff: StaffHours[];
    staffName: Map<string, string>;
    ownerId: string | null;
    autoConfirm: boolean;
    businessPhone: string | null;
    webhookUrl: string | null;
    clock: IstanbulClock;
    customer: { id: string; name: string } | null;
    pushName: string | null;
    /** Bu turda müşterinin yazdığı metin (onay/ret denetimi için). */
    lastCustomerText: string;
    msgCtx: M.Ctx;
    toolsUsed: string[];
    /** commit_proposal onay şablonunu yolladıysa true. */
    sentTemplate: boolean;
}

interface UpcomingRow {
    id: string;
    service: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    staff_id: string | null;
    customer_token: string | null;
    reminder_24h_sent: boolean | null;
    customer_confirm: string | null;
}

interface ProposalRow {
    id: string;
    kind: 'book' | 'reschedule' | 'cancel';
    payload: Record<string, unknown>;
    run_id: string;
    status: string;
    expires_at: string;
}

const hhmm = (t: string) => String(t).slice(0, 5);
const compact = (uuid: string) => String(uuid).replace(/-/g, '');

// ── Okuma yardımcıları ──────────────────────────────────────────────────────

/** Yazan müşterinin yaklaşan randevuları; bugünün geçmiş saatleri hariç. */
export async function loadUpcoming(
    admin: Admin, orgId: string, customerId: string, clock: IstanbulClock,
): Promise<UpcomingRow[]> {
    const { data } = await admin.from('reservations')
        .select('id, service, date, start_time, end_time, status, staff_id, customer_token, reminder_24h_sent, customer_confirm')
        .eq('organization_id', orgId).eq('customer_id', customerId)
        .gte('date', clock.todayISO).in('status', ['pending', 'confirmed'])
        .order('date', { ascending: true }).order('start_time', { ascending: true })
        .limit(6);
    return ((data ?? []) as UpcomingRow[]).filter((r) =>
        r.date > clock.todayISO || timeToMin(hhmm(r.start_time)) >= clock.nowMin);
}

/** Konuşmanın açık, süresi dolmamış son önerisi — BAĞLAM'a yazılır. */
export async function openProposal(
    admin: Admin, conversationId: string,
): Promise<{ ref: string; summary: string } | null> {
    const { data } = await admin.from('wa_pending_actions')
        .select('id, kind, payload, expires_at')
        .eq('conversation_id', conversationId).eq('status', 'open')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    const p = data.payload as Record<string, string>;
    const what = data.kind === 'book' ? 'yeni randevu' : data.kind === 'reschedule' ? 'taşıma' : 'iptal';
    const when = p.date ? `${formatDateTr(p.date)} ${p.time ?? ''}`.trim() : '';
    return { ref: shortRef('o', data.id), summary: [what, p.service, when].filter(Boolean).join(' · ') };
}

function findUpcoming(rows: UpcomingRow[], ref: string): UpcomingRow | null {
    const prefix = refPrefix(ref, 'r');
    if (!prefix) return null;
    return rows.find((r) => compact(r.id).startsWith(prefix)) ?? null;
}

function slotInput(ctx: TurnCtx, date: string, duration: number) {
    return {
        date,
        orgHours: ctx.orgHours,
        staff: ctx.staff,
        serviceDuration: duration,
        slotDuration: ctx.slotDuration,
        minStart: date === ctx.clock.todayISO ? ctx.clock.nowMin + LEAD_MIN : 0,
    };
}

/** İstenen saate en yakın boş saatler — "o saat dolu" cevabının devamı. */
function nearest(times: string[], wanted: string, n = 4): string[] {
    const w = timeToMin(wanted);
    return [...times].sort((a, b) => Math.abs(timeToMin(a) - w) - Math.abs(timeToMin(b) - w))
        .slice(0, n).sort();
}

/** Önümüzdeki günlerden boş olanlar ve her birinin ilk saatleri. */
function nextDays(
    ctx: TurnCtx, w: WindowData, from: string, duration: number,
    staffId: string | null, part: PartOfDay | null, limit: number,
) {
    const out: { date: string; date_label: string; times: string[] }[] = [];
    for (let i = 0; i < SEARCH_DAYS && out.length < limit; i++) {
        const date = addDays(from, i);
        const d = daySlots(w, { ...slotInput(ctx, date, duration), onlyStaffId: staffId });
        const times = filterTimes(d.times, part);
        if (times.length > 0) out.push({ date, date_label: formatDateTr(date), suggested: suggestTimes(times) });
    }
    return out;
}

async function supersedeOpen(ctx: TurnCtx): Promise<void> {
    await ctx.admin.from('wa_pending_actions')
        .update({ status: 'superseded' })
        .eq('conversation_id', ctx.conversationId).eq('status', 'open');
}

async function insertProposal(
    ctx: TurnCtx, kind: ProposalRow['kind'], payload: Record<string, unknown>,
): Promise<string> {
    await supersedeOpen(ctx);
    const { data, error } = await ctx.admin.from('wa_pending_actions').insert({
        organization_id: ctx.orgId,
        conversation_id: ctx.conversationId,
        kind, payload,
        run_id: ctx.runId,
        expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    }).select('id').single();
    if (error || !data) throw new Error(`proposal insert: ${error?.message ?? 'no row'}`);
    return shortRef('o', data.id);
}

async function reply(ctx: TurnCtx, text: string): Promise<void> {
    await sendWA(ctx.admin, {
        org: ctx.orgWa, phone: ctx.phone, text, kind: 'booking',
        customerId: ctx.customer?.id ?? null, ignoreOptOut: true,
    });
}

// ── Araçlar ─────────────────────────────────────────────────────────────────

type Input = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function findSlots(ctx: TurnCtx, input: Input) {
    const svc = ctx.profile.serviceByRef.get(String(input.service_ref));
    if (!svc) return { ok: false, reason: 'unknown_service', hint: 'İŞLETME listesindeki h kodlarından birini kullan.' };
    let staffId: string | null = null;
    const staffRef = str(input.staff_ref);
    if (staffRef) {
        const st = ctx.profile.staffByRef.get(staffRef);
        if (!st) return { ok: false, reason: 'unknown_staff' };
        staffId = st.id;
    }
    const part = (str(input.part_of_day) as PartOfDay | null) ?? null;
    const today = ctx.clock.todayISO;
    const date = str(input.date);

    if (!date) {
        const w = await loadWindow(ctx.admin, ctx.orgId, today, addDays(today, SEARCH_DAYS - 1));
        return { ok: true, service: svc.name, days: nextDays(ctx, w, today, svc.duration, staffId, part, 4) };
    }
    if (!isSaneDate(date, today)) {
        return { ok: false, reason: 'invalid_date', hint: 'Tarih bugün ya da sonrası olmalı, en fazla 90 gün ileri.' };
    }
    const w = await loadWindow(ctx.admin, ctx.orgId, date, addDays(date, SEARCH_DAYS - 1));
    const d = daySlots(w, { ...slotInput(ctx, date, svc.duration), onlyStaffId: staffId });
    const times = filterTimes(d.times, part);
    const out: Record<string, unknown> = {
        ok: true, service: svc.name, date, date_label: formatDateTr(date),
        // Müşteriye bunlar önerilir; all_times yalnız müşteri başka saat
        // sorarsa bakmak için.
        suggested: suggestTimes(times),
        all_times: times.slice(0, 24), total: times.length,
    };
    if (times.length === 0) {
        out.day_has_other_times = d.times.length > 0;
        out.next_days = nextDays(ctx, w, addDays(date, 1), svc.duration, staffId, part, 3);
    }
    return out;
}

async function myAppointments(ctx: TurnCtx) {
    if (!ctx.customer) return { known: false, hint: 'Bu numarada kayıtlı müşteri yok.' };
    const rows = await loadUpcoming(ctx.admin, ctx.orgId, ctx.customer.id, ctx.clock);
    const token = rows.find((r) => r.customer_token)?.customer_token;
    return {
        known: true,
        appointments: rows.map((r) => ({
            ref: shortRef('r', r.id),
            service: r.service,
            date_label: formatDateTr(r.date),
            time: hhmm(r.start_time),
            staff: r.staff_id ? ctx.staffName.get(r.staff_id) ?? null : null,
            status: r.status === 'pending' ? 'işletme onayı bekliyor' : 'onaylı',
        })),
        manage_url: token ? `${APP_ORIGIN}/booking/${token}` : null,
    };
}

async function myPackagesAndBalance(ctx: TurnCtx) {
    if (!ctx.customer) return { known: false, hint: 'Bu numarada kayıtlı müşteri yok.' };
    const cid = ctx.customer.id;
    const today = ctx.clock.todayISO;
    const [{ data: plans }, { data: linked }, { data: allPlans }, { data: pays }] = await Promise.all([
        ctx.admin.from('treatment_plans')
            .select('id, title, session_count, sessions_done')
            .eq('organization_id', ctx.orgId).eq('customer_id', cid).eq('status', 'active')
            .order('created_at', { ascending: false }).limit(5),
        ctx.admin.from('reservations')
            .select('date, status, custom_fields')
            .eq('organization_id', ctx.orgId).eq('customer_id', cid)
            .gte('date', today).neq('status', 'cancelled'),
        ctx.admin.from('treatment_plans').select('id, total_amount, status')
            .eq('organization_id', ctx.orgId).eq('customer_id', cid),
        ctx.admin.from('payments').select('amount, treatment_plan_id, type')
            .eq('organization_id', ctx.orgId).eq('customer_id', cid)
            // Düzeltilen ya da geri alınan eski kayıt para değil (111).
            .is('voided_at', null),
    ]);
    const resIn: PackageResInput[] = (linked ?? []).map(
        (r: { date: string; status: string; custom_fields: PackageResInput['customFields'] }) => ({
            date: r.date, status: r.status, customFields: r.custom_fields,
        }),
    );
    // Tek seanslık plan paket değil; Paketler ekranıyla aynı formül (packageRights).
    const packages = (plans ?? [])
        .filter((p: { session_count: number }) => Number(p.session_count) > 1)
        .map((p: { id: string; title: string; session_count: number; sessions_done: number }) => {
            const k = packageRights({
                id: p.id, sessionCount: Number(p.session_count), sessionsDone: Number(p.sessions_done),
            }, resIn, today);
            return { title: p.title, used: k.used, total: k.total, reserved: k.reserved, available: k.available };
        });
    // Bakiye src/lib/patientBalance.ts ile AYNI formül (finance.ts aynası).
    const fin = computeBalance(
        (allPlans ?? []).map((p: { id: string; total_amount: number; status: 'proposed' | 'active' | 'completed' | 'cancelled' }) => ({
            id: p.id, totalAmount: Number(p.total_amount) || 0, status: p.status,
        })),
        (pays ?? []).map((p: { amount: number; treatment_plan_id: string | null; type: string }) => ({
            amount: Number(p.amount) || 0, treatmentPlanId: p.treatment_plan_id ?? undefined, type: p.type,
        })),
    );
    return {
        known: true,
        packages,
        balance_text: fin.balance > 0 ? formatTL(fin.balance) : null,
        overpaid_text: fin.overpaid > 0 ? formatTL(fin.overpaid) : null,
    };
}

async function proposeBooking(ctx: TurnCtx, input: Input) {
    const svc = ctx.profile.serviceByRef.get(String(input.service_ref));
    if (!svc) return { ok: false, reason: 'unknown_service' };
    const date = String(input.date);
    const time = String(input.time);
    if (!isSaneDate(date, ctx.clock.todayISO)) return { ok: false, reason: 'invalid_date' };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, reason: 'invalid_time' };

    let staffId: string | null = null;
    const staffRef = str(input.staff_ref);
    if (staffRef) {
        const st = ctx.profile.staffByRef.get(staffRef);
        if (!st) return { ok: false, reason: 'unknown_staff' };
        staffId = st.id;
    }

    const name = ctx.customer?.name ?? str(input.customer_name) ?? ctx.pushName;
    if (!name) return { ok: false, reason: 'need_name', hint: 'Randevuyu kimin adına açacağını müşteriye sor.' };

    const w = await loadWindow(ctx.admin, ctx.orgId, date, date);
    const d = daySlots(w, { ...slotInput(ctx, date, svc.duration), onlyStaffId: staffId });
    const min = timeToMin(time);
    if (!d.resourceAt.has(min)) {
        return { ok: false, reason: 'not_available', alternatives: nearest(d.times, time) };
    }
    const chosenStaff = d.staffAt.get(min) ?? null;
    const endTime = minToTime(min + svc.duration);
    const ref = await insertProposal(ctx, 'book', {
        service_id: svc.id, service: svc.name, color: svc.color, duration: svc.duration,
        date, time, end_time: endTime,
        staff_id: chosenStaff, staff_fixed: Boolean(staffId),
        resource_id: d.resourceAt.get(min) ?? null,
        customer_name: name,
    });
    return {
        ok: true,
        proposal_id: ref,
        summary: {
            service: svc.name,
            date_label: formatDateTr(date),
            time,
            end_time: endTime,
            staff: chosenStaff ? ctx.staffName.get(chosenStaff) ?? null : null,
            price: svc.price !== null && Number(svc.price) > 0 ? formatTL(Number(svc.price)) : null,
            customer_name: name,
        },
        next: 'Özeti müşteriye yaz ve onaylayıp onaylamadığını sor. Onay bir sonraki mesajda gelirse commit_proposal çağır.',
    };
}

async function proposeReschedule(ctx: TurnCtx, input: Input) {
    if (!ctx.customer) return { known: false };
    const rows = await loadUpcoming(ctx.admin, ctx.orgId, ctx.customer.id, ctx.clock);
    const r = findUpcoming(rows, String(input.appointment_ref));
    if (!r) return { ok: false, reason: 'unknown_appointment', hint: 'my_appointments ile güncel kodlara bak.' };
    const date = String(input.date);
    const time = String(input.time);
    if (!isSaneDate(date, ctx.clock.todayISO)) return { ok: false, reason: 'invalid_date' };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, reason: 'invalid_time' };

    const duration = Math.max(timeToMin(hhmm(r.end_time)) - timeToMin(hhmm(r.start_time)), ctx.slotDuration);
    const w = await loadWindow(ctx.admin, ctx.orgId, date, date);
    const base = { ...slotInput(ctx, date, duration), excludeReservationId: r.id };
    const min = timeToMin(time);
    // Aynı uzman boşsa onda kalır; değilse o saati verebilen herhangi biri.
    const same = r.staff_id ? daySlots(w, { ...base, onlyStaffId: r.staff_id }) : null;
    const d = same && same.resourceAt.has(min) ? same : daySlots(w, base);
    if (!d.resourceAt.has(min)) return { ok: false, reason: 'not_available', alternatives: nearest(d.times, time) };

    const staffId = d.staffAt.get(min) ?? null;
    const endTime = minToTime(min + duration);
    const ref = await insertProposal(ctx, 'reschedule', {
        reservation_id: r.id, service: r.service,
        from_date: r.date, from_time: hhmm(r.start_time),
        date, time, end_time: endTime, duration,
        staff_id: staffId, resource_id: d.resourceAt.get(min) ?? null,
    });
    return {
        ok: true,
        proposal_id: ref,
        summary: {
            service: r.service,
            from: `${formatDateTr(r.date)} ${hhmm(r.start_time)}`,
            to: `${formatDateTr(date)} ${time}`,
            staff: staffId ? ctx.staffName.get(staffId) ?? null : null,
        },
        next: 'Değişikliği müşteriye yaz ve onay iste.',
    };
}

async function proposeCancel(ctx: TurnCtx, input: Input) {
    if (!ctx.customer) return { known: false };
    const rows = await loadUpcoming(ctx.admin, ctx.orgId, ctx.customer.id, ctx.clock);
    const r = findUpcoming(rows, String(input.appointment_ref));
    if (!r) return { ok: false, reason: 'unknown_appointment', hint: 'my_appointments ile güncel kodlara bak.' };
    const ref = await insertProposal(ctx, 'cancel', {
        reservation_id: r.id, service: r.service, date: r.date, time: hhmm(r.start_time),
    });
    return {
        ok: true,
        proposal_id: ref,
        summary: { service: r.service, date_label: formatDateTr(r.date), time: hhmm(r.start_time) },
        next: 'İptal edeceğin randevuyu müşteriye yaz ve onay iste.',
    };
}

async function commitProposal(ctx: TurnCtx, input: Input) {
    const prefix = refPrefix(String(input.proposal_id), 'o');
    const { data: rows } = await ctx.admin.from('wa_pending_actions')
        .select('id, kind, payload, run_id, status, expires_at')
        .eq('conversation_id', ctx.conversationId)
        .order('created_at', { ascending: false }).limit(10);
    const p = prefix ? ((rows ?? []) as ProposalRow[]).find((r) => compact(r.id).startsWith(prefix)) ?? null : null;

    const block = commitBlock(
        p ? { status: p.status, runId: p.run_id, expiresAt: p.expires_at } : null,
        ctx.runId, ctx.lastCustomerText, Date.now(),
    );
    if (block) {
        if (block === 'expired' && p) {
            await ctx.admin.from('wa_pending_actions').update({ status: 'expired' }).eq('id', p.id);
        }
        const hint: Record<string, string> = {
            same_turn: 'Müşteri bu öneriyi henüz görmedi. Özeti yaz ve onayını bekle.',
            customer_declined: 'Müşteri onaylamadı. Ne istediğini sor.',
            expired: 'Önerinin süresi doldu. Uygunluğa yeniden bakıp yeni öneri aç.',
            not_open: 'Bu öneri zaten uygulandı ya da yerine yenisi açıldı.',
            not_found: 'Böyle bir öneri yok.',
        };
        return { ok: false, reason: block, hint: hint[block] };
    }

    // Taşıma ve iptal kayıtlı müşterinin kendi randevusuna dokunur.
    if (p!.kind !== 'book' && !ctx.customer) return { ok: false, reason: 'unknown_customer' };

    const done = (result: Record<string, unknown>) => ctx.admin.from('wa_pending_actions')
        .update({ status: 'committed', committed_at: new Date().toISOString(), result })
        .eq('id', p!.id).eq('status', 'open');
    const failed = (result: Record<string, unknown>) => ctx.admin.from('wa_pending_actions')
        .update({ status: 'failed', result }).eq('id', p!.id);

    if (p!.kind === 'book') return commitBook(ctx, p!, done, failed);
    if (p!.kind === 'reschedule') return commitReschedule(ctx, p!, done, failed);
    return commitCancel(ctx, p!, done, failed);
}

type Mark = (result: Record<string, unknown>) => Promise<unknown>;

async function commitBook(ctx: TurnCtx, p: ProposalRow, done: Mark, failed: Mark) {
    const x = p.payload as {
        service_id: string; service: string; color: string | null; duration: number;
        date: string; time: string; end_time: string;
        staff_id: string | null; staff_fixed: boolean; resource_id: string | null; customer_name: string;
    };
    // Öneriden bu yana saat dolmuş olabilir: yeniden bak, önerilen uzman hâlâ
    // boşsa onda kal.
    const w = await loadWindow(ctx.admin, ctx.orgId, x.date, x.date);
    const min = timeToMin(x.time);
    const base = slotInput(ctx, x.date, x.duration);
    const preferred = x.staff_id ? daySlots(w, { ...base, onlyStaffId: x.staff_id }) : null;
    let d = preferred && preferred.resourceAt.has(min) ? preferred : null;
    // Müşteri uzmanı kendisi seçtiyse başka uzmana kaydırılmaz.
    if (!d && !x.staff_fixed) d = daySlots(w, base);
    if (!d || !d.resourceAt.has(min)) {
        await failed({ reason: 'slot_taken' });
        return { ok: false, reason: 'slot_taken', alternatives: nearest((d ?? preferred)?.times ?? [], x.time) };
    }
    const staffId = d.staffAt.get(min) ?? null;
    const resourceId = d.resourceAt.get(min) ?? null;

    let customerId = ctx.customer?.id ?? null;
    if (!customerId) {
        const { data: created, error } = await ctx.admin.from('customers').insert({
            user_id: ctx.ownerId, organization_id: ctx.orgId, name: x.customer_name, phone: ctx.phone,
        }).select('id').single();
        if (error || !created?.id) {
            console.error('wa-agent customer create', error);
            await failed({ reason: 'customer_create' });
            return { ok: false, reason: 'failed' };
        }
        customerId = created.id as string;
        ctx.customer = { id: customerId, name: x.customer_name };
    }

    const status = ctx.autoConfirm ? 'confirmed' : 'pending';
    const { data: reservation, error } = await ctx.admin.from('reservations').insert({
        user_id: ctx.ownerId, organization_id: ctx.orgId, customer_id: customerId,
        customer_name: ctx.customer!.name, customer_phone: ctx.phone,
        date: x.date, start_time: x.time, end_time: x.end_time,
        service: x.service, service_color: x.color || '#FF5A1F',
        status, notes: 'WhatsApp asistanı',
        staff_id: staffId, resource_id: resourceId, source: 'whatsapp',
    }).select('id, customer_token').single();

    if (error || !reservation) {
        if (isReservationConflict(error)) {
            await failed({ reason: 'slot_taken' });
            return { ok: false, reason: 'slot_taken', alternatives: nearest(d.times.filter((t) => t !== x.time), x.time) };
        }
        const blocked = eligibilityBlock(error);
        if (blocked) {
            await failed({ reason: 'eligibility', detail: blocked.reason });
            return { ok: false, reason: 'needs_staff_approval', detail: blocked.reason, hint: 'Ekibin onayı gerekiyor; request_human çağır.' };
        }
        console.error('wa-agent reservation insert', error);
        await failed({ reason: 'insert_failed' });
        return { ok: false, reason: 'failed' };
    }

    await done({ reservation_id: reservation.id });

    // LeadFlow webhook'u — eski botla aynı gövde.
    if (ctx.webhookUrl) {
        fetch(ctx.webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'reservation.created', source: 'timeflow', timestamp: new Date().toISOString(),
                data: {
                    id: reservation.id, customer_name: ctx.customer!.name, customer_phone: ctx.phone,
                    date: x.date, start_time: x.time, end_time: x.end_time, service: x.service,
                    status, source: 'whatsapp',
                },
            }),
        }).catch(() => {});
    }
    // Müdüre push veritabanından gider (notify_push_on_reservation · 118).

    await reply(ctx, M.created(ctx.msgCtx, {
        service: x.service, dateLabel: formatDateTr(x.date), time: x.time,
        manageUrl: reservation.customer_token ? `${APP_ORIGIN}/booking/${reservation.customer_token}` : null,
        pending: !ctx.autoConfirm,
    }));
    ctx.sentTemplate = true;
    return {
        ok: true, confirmation_sent: true, status,
        note: 'Onay mesajı müşteriye gönderildi. Bilgileri tekrar yazma; gerekirse tek kısa cümle ekle.',
    };
}

async function commitReschedule(ctx: TurnCtx, p: ProposalRow, done: Mark, failed: Mark) {
    const x = p.payload as {
        reservation_id: string; service: string; from_date: string; from_time: string;
        date: string; time: string; end_time: string; duration: number;
        staff_id: string | null; resource_id: string | null;
    };
    const w = await loadWindow(ctx.admin, ctx.orgId, x.date, x.date);
    const min = timeToMin(x.time);
    const base = { ...slotInput(ctx, x.date, x.duration), excludeReservationId: x.reservation_id };
    const preferred = x.staff_id ? daySlots(w, { ...base, onlyStaffId: x.staff_id }) : null;
    const d = preferred && preferred.resourceAt.has(min) ? preferred : daySlots(w, base);
    if (!d.resourceAt.has(min)) {
        await failed({ reason: 'slot_taken' });
        return { ok: false, reason: 'slot_taken', alternatives: nearest(d.times, x.time) };
    }

    const { data: moved, error } = await ctx.admin.from('reservations')
        .update({
            date: x.date, start_time: x.time, end_time: x.end_time,
            staff_id: d.staffAt.get(min) ?? null, resource_id: d.resourceAt.get(min) ?? null,
            // Yeni saat için hatırlatma ve müşteri yanıtı sıfırlanır.
            reminder_24h_sent: false, reminder_2h_sent: false,
            customer_confirm: null, customer_confirm_at: null,
        })
        .eq('id', x.reservation_id).eq('organization_id', ctx.orgId)
        .eq('customer_id', ctx.customer!.id)
        .in('status', ['pending', 'confirmed'])
        .select('id, service').maybeSingle();

    if (error && isReservationConflict(error)) {
        await failed({ reason: 'slot_taken' });
        return { ok: false, reason: 'slot_taken', alternatives: nearest(d.times.filter((t) => t !== x.time), x.time) };
    }
    if (error || !moved) {
        if (error) console.error('wa-agent reschedule', error);
        await failed({ reason: 'too_late' });
        return { ok: false, reason: 'too_late', business_phone: ctx.businessPhone };
    }

    await done({ reservation_id: moved.id });
    // Taşıma için veritabanı tetikleyicisi yok; eski botla aynı bildirim.
    notifyOwner(ctx.admin, ctx.orgId, {
        title: 'Randevu ertelendi',
        body: `${firstNameOf(ctx.customer?.name)} · ${formatDateTr(x.from_date)} ${x.from_time} → ${formatDateTr(x.date)} ${x.time}`,
        url: `/takvim?date=${x.date}`,
        tag: `res-${moved.id}`,
    });
    await reply(ctx, M.rescheduleDone(ctx.msgCtx, {
        service: moved.service, dateLabel: formatDateTr(x.date), time: x.time,
        fromLabel: formatDateTr(x.from_date), fromTime: x.from_time,
    }));
    ctx.sentTemplate = true;
    return { ok: true, confirmation_sent: true, note: 'Onay mesajı gönderildi; tekrar yazma.' };
}

async function commitCancel(ctx: TurnCtx, p: ProposalRow, done: Mark, failed: Mark) {
    const x = p.payload as { reservation_id: string; service: string; date: string; time: string };
    const { data: cancelled } = await ctx.admin.from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', x.reservation_id).eq('organization_id', ctx.orgId)
        .eq('customer_id', ctx.customer!.id)
        .in('status', ['pending', 'confirmed'])
        .select('id, service, date, start_time').maybeSingle();
    if (!cancelled) {
        await failed({ reason: 'too_late' });
        return { ok: false, reason: 'too_late', business_phone: ctx.businessPhone };
    }
    await done({ reservation_id: cancelled.id });
    announceFreedSlot(ctx.admin, ctx.orgId, cancelled.date);
    // Müdüre haber veritabanından gider (118 · iptal tetikleyicisi).
    await reply(ctx, M.cancelDone(ctx.msgCtx, {
        service: cancelled.service, dateLabel: formatDateTr(cancelled.date), time: hhmm(cancelled.start_time),
    }));
    ctx.sentTemplate = true;
    return { ok: true, confirmation_sent: true, note: 'İptal mesajı gönderildi; tekrar yazma.' };
}

async function confirmAttendance(ctx: TurnCtx, input: Input) {
    if (!ctx.customer) return { known: false };
    const rows = await loadUpcoming(ctx.admin, ctx.orgId, ctx.customer.id, ctx.clock);
    const r = findUpcoming(rows, String(input.appointment_ref));
    if (!r) return { ok: false, reason: 'unknown_appointment' };
    await ctx.admin.from('reservations')
        .update({ customer_confirm: 'yes', customer_confirm_at: new Date().toISOString() })
        .eq('id', r.id).eq('organization_id', ctx.orgId).eq('customer_id', ctx.customer.id);
    return { ok: true, service: r.service, date_label: formatDateTr(r.date), time: hhmm(r.start_time) };
}

function requestHuman(ctx: TurnCtx, input: Input) {
    const reason = String(input.reason ?? '').slice(0, 120);
    notifyOwner(ctx.admin, ctx.orgId, {
        title: 'Müşteri sizinle görüşmek istiyor',
        body: `${firstNameOf(ctx.customer?.name ?? ctx.pushName)}: ${reason}`,
        url: '/mesajlar',
        tag: `handoff-${ctx.phone}`,
    });
    return { ok: true, business_phone: ctx.businessPhone };
}

export async function runTool(ctx: TurnCtx, name: string, input: Input): Promise<unknown> {
    ctx.toolsUsed.push(name);
    switch (name) {
        case 'find_slots': return findSlots(ctx, input);
        case 'my_appointments': return myAppointments(ctx);
        case 'my_packages_and_balance': return myPackagesAndBalance(ctx);
        case 'propose_booking': return proposeBooking(ctx, input);
        case 'propose_reschedule': return proposeReschedule(ctx, input);
        case 'propose_cancel': return proposeCancel(ctx, input);
        case 'commit_proposal': return commitProposal(ctx, input);
        case 'confirm_attendance': return confirmAttendance(ctx, input);
        case 'request_human': return requestHuman(ctx, input);
        default: return { ok: false, reason: 'unknown_tool' };
    }
}

