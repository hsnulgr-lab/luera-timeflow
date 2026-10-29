import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deny, identify } from '../_shared/auth.ts';
import { featureOn, sendWA, type Admin, type OrgWa, type SendResult, type WaKind } from '../_shared/wa.ts';
import { checkAccess } from '../_shared/entitlement.ts';
import { normalizePhone } from '../_shared/phone.ts';
import * as M from '../_shared/booking/messages.ts';
import { greetingName } from '../_shared/booking/identity.ts';
import { formatDateTr } from '../_shared/booking/slots.ts';
import { relativeDayLabel, timeLocativeKi } from '../_shared/booking/tr.ts';
import {
    istanbulMs, nudgeDueMs, OFFER_TTL_MIN, sendDecision, todayIstanbul, type JobKind,
} from '../_shared/scheduler/timing.ts';

// ============================================================
// wa-scheduler — WhatsApp Sekreter v2 · P1: zamanlayıcı
// ------------------------------------------------------------
// VPS cron'u dakikada bir çağırır (x-cron-secret). Göç 131'in planladığı
// işlerden zamanı gelenleri alır (wa_claim_jobs, iki çağrı aynı işi alamaz)
// ve her biri için:
//   1. Randevuyu yeniden okur; planlandıktan sonra taşındıysa iş bayattır.
//   2. Saati sorar (timing.ts): gece 03:00'te zamanı gelen hatırlatma sabaha
//      kayar, randevuya çok az kaldıysa hiç gitmez.
//   3. Şablonla gönderir (sendWA: opt-out, kota, log tek kapıda).
//
// Yalnız features.scheduler_v2 açık işletmede iş olur (131'in tetikleyicisi);
// diğerlerinde remind eskisi gibi sürer.
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Hat düştüyse ya da geçici hata varsa bu kadar sonra yeniden denenir. */
const RETRY_MS = 30 * 60_000;
/** Çalışan 60 sn'de kesiliyor; bu süreden sonra yeni iş alınmaz. */
const RUN_BUDGET_MS = 40_000;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface Job {
    id: number;
    organization_id: string;
    reservation_id: string | null;
    kind: JobKind;
    stamp: string | null;
    attempts: number;
    created_at: string;
}

interface Reservation {
    id: string;
    status: string;
    date: string;
    start_time: string;
    end_time: string | null;
    service: string;
    service_color: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    customer_id: string | null;
    customer_confirm: string | null;
    review_sent: boolean | null;
    staff_id: string | null;
    resource_id: string | null;
}

interface OrgCtx {
    orgWa: OrgWa;
    accessOk: boolean;
    businessName: string;
    comms: M.Comms;
    mapsUrl: string | null;
}

type Outcome = 'sent' | 'skipped' | 'cancelled' | 'postponed' | 'failed';

const hhmm = (t: string | null) => String(t ?? '').slice(0, 5);

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const caller = await identify(admin, req);
    if (caller.kind !== 'cron' && caller.kind !== 'service') {
        return deny(401, 'Bu uç yalnız zamanlayıcı tarafından çağrılabilir', corsHeaders);
    }

    const started = Date.now();
    const { data, error } = await admin.rpc('wa_claim_jobs', { p_limit: 60 });
    if (error) {
        console.error('wa-scheduler claim', error);
        return json({ error: 'claim_failed' }, 500);
    }
    const jobs = (data ?? []) as Job[];
    const orgs = new Map<string, OrgCtx | null>();
    const tally: Record<Outcome, number> = { sent: 0, skipped: 0, cancelled: 0, postponed: 0, failed: 0 };

    for (const job of jobs) {
        // Bütçe bittiyse kalan işleri geri bırak; bir sonraki tur alır.
        if (Date.now() - started > RUN_BUDGET_MS) {
            await setJob(admin, job, 'pending', 'bütçe', { due_at: new Date().toISOString() });
            continue;
        }
        try {
            if (!orgs.has(job.organization_id)) orgs.set(job.organization_id, await loadOrg(admin, job.organization_id));
            tally[await runJob(admin, job, orgs.get(job.organization_id) ?? null)]++;
        } catch (e) {
            console.error('wa-scheduler job', job.id, e);
            await setJob(admin, job, job.attempts >= 3 ? 'failed' : 'pending', 'hata',
                { due_at: new Date(Date.now() + RETRY_MS).toISOString() });
            tally.failed++;
        }
    }

    console.log(`wa-scheduler claimed=${jobs.length} sent=${tally.sent} skipped=${tally.skipped} `
        + `cancelled=${tally.cancelled} postponed=${tally.postponed} failed=${tally.failed}`);
    return json({ claimed: jobs.length, ...tally });
});

// ── Yardımcılar ─────────────────────────────────────────────────────────────

async function setJob(
    admin: Admin, job: Job, status: string, note: string | null, extra: Record<string, unknown> = {},
): Promise<void> {
    const now = new Date().toISOString();
    await admin.from('wa_jobs').update({
        status, note, updated_at: now, ...(status === 'sent' ? { sent_at: now } : {}), ...extra,
    }).eq('id', job.id);
}

async function loadOrg(admin: Admin, orgId: string): Promise<OrgCtx | null> {
    const [{ data: orgWa }, { data: settings }, { data: org }] = await Promise.all([
        admin.from('org_whatsapp')
            .select('organization_id, instance, status, webhook_secret, features, schedule_config')
            .eq('organization_id', orgId).maybeSingle(),
        admin.from('settings').select('business_name, comms').eq('organization_id', orgId).limit(1).maybeSingle(),
        admin.from('organizations').select('name, maps_url').eq('id', orgId).maybeSingle(),
    ]);
    if (!orgWa) return null;
    const access = await checkAccess(admin, orgId);
    return {
        orgWa: orgWa as OrgWa,
        accessOk: access.ok,
        businessName: settings?.business_name || org?.name || 'İşletme',
        comms: M.resolveComms(settings?.comms),
        mapsUrl: org?.maps_url ?? null,
    };
}

/** "Yarın, 30 Ekim Cuma" · hafta içi/uzak tarihte yalnız tarih. */
function dateLabel(date: string, todayISO: string): string {
    const rel = relativeDayLabel(date, todayISO);
    return rel === 'Bugün' || rel === 'Yarın' ? `${rel}, ${formatDateTr(date)}` : formatDateTr(date);
}

/** Gönderim sonucunu işe yansıtır. Kuyruğa alınan (079) gönderilmiş sayılır. */
async function settle(admin: Admin, job: Job, res: SendResult): Promise<Outcome> {
    if (res.ok || res.queued) { await setJob(admin, job, 'sent', res.queued ? 'kuyrukta' : null); return 'sent'; }
    if (res.reason === 'not_connected') {
        await setJob(admin, job, 'pending', 'hat bağlı değil', { due_at: new Date(Date.now() + RETRY_MS).toISOString() });
        return 'postponed';
    }
    // Opt-out, geçersiz numara, kota: tekrar denemek aynı sonucu verir.
    await setJob(admin, job, res.reason === 'failed' ? 'failed' : 'skipped', res.reason ?? null);
    return res.reason === 'failed' ? 'failed' : 'skipped';
}

// ── Bir iş ──────────────────────────────────────────────────────────────────

async function runJob(admin: Admin, job: Job, org: OrgCtx | null): Promise<Outcome> {
    if (!org) { await setJob(admin, job, 'skipped', 'hat yok'); return 'skipped'; }
    if (!featureOn(org.orgWa, 'scheduler_v2', false)) { await setJob(admin, job, 'cancelled', 'kapalı'); return 'cancelled'; }
    // Abonelik bitti: işletmenin müşterisine "aboneliğiniz bitti" yazılmaz, susulur.
    if (!org.accessOk) { await setJob(admin, job, 'skipped', 'abonelik'); return 'skipped'; }
    if (!job.reservation_id) { await setJob(admin, job, 'cancelled', 'randevu yok'); return 'cancelled'; }

    const { data } = await admin.from('reservations')
        .select('id, status, date, start_time, end_time, service, service_color, customer_name, customer_phone, '
            + 'customer_id, customer_confirm, review_sent, staff_id, resource_id')
        .eq('id', job.reservation_id).maybeSingle();
    const r = data as Reservation | null;
    if (!r) { await setJob(admin, job, 'cancelled', 'randevu silindi'); return 'cancelled'; }
    // Planlandıktan sonra taşındıysa bu iş bayattır (yenisi zaten planlandı).
    if (job.stamp && job.stamp !== `${r.date} ${hhmm(r.start_time)}`) {
        await setJob(admin, job, 'cancelled', 'bayat'); return 'cancelled';
    }

    const startMs = istanbulMs(r.date, r.start_time);
    const endMs = istanbulMs(r.date, r.end_time || r.start_time);
    const decision = sendDecision(job.kind, Date.now(), startMs, endMs);
    if (decision.action === 'postpone') {
        await setJob(admin, job, 'pending', 'sessiz saat', { due_at: new Date(decision.dueMs).toISOString() });
        return 'postponed';
    }
    if (decision.action === 'skip') { await setJob(admin, job, 'skipped', decision.reason); return 'skipped'; }

    if (job.kind === 'slot_offer') return runSlotOffer(admin, job, org, r);

    if (job.kind === 'satisfaction') {
        if (r.status !== 'confirmed' && r.status !== 'completed') { await setJob(admin, job, 'cancelled', r.status); return 'cancelled'; }
    } else if (r.status !== 'pending' && r.status !== 'confirmed') {
        await setJob(admin, job, 'cancelled', r.status); return 'cancelled';
    }
    if (!r.customer_phone) { await setJob(admin, job, 'skipped', 'telefon yok'); return 'skipped'; }

    const ctx: M.Ctx = { comms: org.comms, businessName: org.businessName, firstName: greetingName(r.customer_name) };
    const today = todayIstanbul();
    const time = hhmm(r.start_time);
    const send = (text: string, kind: WaKind) => sendWA(admin, {
        org: org.orgWa, phone: r.customer_phone!, text, kind, customerId: r.customer_id,
    });

    if (job.kind === 'reminder_24h') {
        // Soru yalnız cevabı okuyan biri varken: asistan kapalıyken "Evet"e kimse bakmaz.
        const askConfirm = featureOn(org.orgWa, 'assistant', false);
        const res = await send(M.reminder24h(ctx, {
            service: r.service, dateLabel: dateLabel(r.date, today), time, mapsUrl: org.mapsUrl, askConfirm,
        }), 'reminder_24h');
        const outcome = await settle(admin, job, res);
        if (outcome === 'sent') {
            await admin.from('reservations').update({ reminder_24h_sent: true }).eq('id', r.id);
            const nudgeAt = askConfirm ? nudgeDueMs(Date.now(), startMs) : null;
            if (nudgeAt) {
                await admin.from('wa_jobs').insert({
                    organization_id: job.organization_id, reservation_id: r.id, kind: 'nudge',
                    due_at: new Date(nudgeAt).toISOString(), stamp: job.stamp,
                });
            }
        }
        return outcome;
    }

    if (job.kind === 'reminder_2h') {
        const res = await send(M.reminder2h(ctx, { service: r.service, time, mapsUrl: org.mapsUrl }), 'reminder_2h');
        const outcome = await settle(admin, job, res);
        if (outcome === 'sent') await admin.from('reservations').update({ reminder_2h_sent: true }).eq('id', r.id);
        return outcome;
    }

    if (job.kind === 'nudge') {
        if (r.customer_confirm) { await setJob(admin, job, 'skipped', 'cevaplandı'); return 'skipped'; }
        // Hatırlatmadan sonra müşteri başka bir şey yazdıysa (soru, istek)
        // konuşma zaten sürüyor; üstüne dürtme gitmez.
        const phone = normalizePhone(r.customer_phone) ?? r.customer_phone;
        const { count } = await admin.from('wa_message_log')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', job.organization_id).eq('phone', phone).eq('direction', 'in')
            .gte('created_at', job.created_at);
        if ((count ?? 0) > 0) { await setJob(admin, job, 'skipped', 'müşteri yazdı'); return 'skipped'; }
        const rel = relativeDayLabel(r.date, today);
        const day = rel === 'Bugün' || rel === 'Yarın' ? rel.toLocaleLowerCase('tr') : rel;
        const res = await send(M.attendanceNudge(ctx, { when: `${day} *${time}*${timeLocativeKi(time)}` }), 'nudge');
        return settle(admin, job, res);
    }

    // satisfaction — "Google değerlendirme" anahtarı bu akışın da anahtarı.
    if (!featureOn(org.orgWa, 'review')) { await setJob(admin, job, 'skipped', 'kapalı'); return 'skipped'; }
    if (r.review_sent) { await setJob(admin, job, 'skipped', 'daha önce soruldu'); return 'skipped'; }
    const phone = normalizePhone(r.customer_phone) ?? r.customer_phone;
    const { error: fbErr } = await admin.from('wa_feedback').insert({
        organization_id: job.organization_id, reservation_id: r.id, customer_id: r.customer_id, phone,
    });
    if (fbErr) { await setJob(admin, job, 'skipped', 'daha önce soruldu'); return 'skipped'; }
    const res = await send(M.satisfactionAsk(ctx, { sameDay: r.date === today }), 'satisfaction');
    const outcome = await settle(admin, job, res);
    if (outcome === 'sent') {
        await admin.from('reservations').update({ review_sent: true }).eq('id', r.id);
    } else {
        await admin.from('wa_feedback').update({ status: 'expired' }).eq('reservation_id', r.id);
    }
    return outcome;
}

// ── Boşalan saat → bekleme listesi ──────────────────────────────────────────

interface WaitlistRow {
    id: string;
    customer_name: string;
    customer_phone: string;
    service_id: string | null;
    preferred_date: string | null;
}

/**
 * İptal edilen saati bekleme listesine SIRAYLA teklif eder: bir kişiye, 30
 * dakika süreyle. "Evet" derse saat onundur (scheduler/replies). Demezse süre
 * dolunca bu iş sıradakine geçer. Eski notify-waitlist ilk 10 kişiye aynı anda
 * link atıyordu: ilk tıklayan alıyor, diğer dokuzu boş yere heveslenmiş oluyordu.
 */
async function runSlotOffer(admin: Admin, job: Job, org: OrgCtx, r: Reservation): Promise<Outcome> {
    if (r.status !== 'cancelled') { await setJob(admin, job, 'cancelled', 'iptal geri alındı'); return 'cancelled'; }
    const nowIso = new Date().toISOString();

    // Süresi dolan teklifler kapanır; kabul edilen varsa zincir bitmiştir.
    await admin.from('wa_waitlist_offers').update({ status: 'expired' })
        .eq('freed_reservation_id', r.id).eq('status', 'sent').lte('expires_at', nowIso);
    const { data: offers } = await admin.from('wa_waitlist_offers')
        .select('waitlist_id, status').eq('freed_reservation_id', r.id);
    if ((offers ?? []).some((o: { status: string }) => o.status === 'accepted')) {
        await setJob(admin, job, 'sent', 'kabul edildi'); return 'sent';
    }
    if ((offers ?? []).some((o: { status: string }) => o.status === 'sent')) {
        await setJob(admin, job, 'skipped', 'açık teklif var'); return 'skipped';
    }

    // Saat bu arada başkasına verildiyse teklif edilecek bir şey yok.
    let busy = admin.from('reservations').select('id', { count: 'exact', head: true })
        .eq('organization_id', job.organization_id).eq('date', r.date).neq('status', 'cancelled')
        .lt('start_time', r.end_time || r.start_time).gt('end_time', r.start_time);
    if (r.staff_id) busy = busy.eq('staff_id', r.staff_id);
    const { count: taken } = await busy;
    if ((taken ?? 0) > 0) { await setJob(admin, job, 'skipped', 'saat doldu'); return 'skipped'; }

    const offered = new Set((offers ?? []).map((o: { waitlist_id: string }) => o.waitlist_id));
    const { data: svc } = await admin.from('services').select('id')
        .eq('organization_id', job.organization_id).eq('name', r.service).limit(1).maybeSingle();
    const { data: waiting } = await admin.from('waitlist')
        .select('id, customer_name, customer_phone, service_id, preferred_date')
        .eq('organization_id', job.organization_id).in('status', ['waiting', 'notified'])
        .order('created_at', { ascending: true }).limit(50);
    const candidates = ((waiting ?? []) as WaitlistRow[]).filter((w) =>
        !offered.has(w.id)
        && (!w.service_id || !svc?.id || w.service_id === svc.id)
        && (!w.preferred_date || w.preferred_date === r.date));

    const time = hhmm(r.start_time);
    const expiresMs = Date.now() + OFFER_TTL_MIN * 60_000;
    // Gönderilemeyen (opt-out, geçersiz numara) aday atlanır, sıradakine geçilir.
    for (const w of candidates.slice(0, 5)) {
        const phone = normalizePhone(w.customer_phone) ?? w.customer_phone;
        const { data: offer, error } = await admin.from('wa_waitlist_offers').insert({
            organization_id: job.organization_id, freed_reservation_id: r.id, waitlist_id: w.id, phone,
            slot: {
                date: r.date, start_time: r.start_time, end_time: r.end_time || r.start_time,
                service: r.service, color: r.service_color, staff_id: r.staff_id, resource_id: r.resource_id,
            },
            expires_at: new Date(expiresMs).toISOString(),
        }).select('id').single();
        if (error || !offer) continue;

        const ctx: M.Ctx = { comms: org.comms, businessName: org.businessName, firstName: greetingName(w.customer_name) };
        const res = await sendWA(admin, {
            org: org.orgWa, phone, kind: 'waitlist',
            text: M.slotOffer(ctx, { service: r.service, dateLabel: formatDateTr(r.date), time, minutes: OFFER_TTL_MIN }),
        });
        if (!(res.ok || res.queued)) {
            await admin.from('wa_waitlist_offers').update({ status: 'declined', answered_at: nowIso }).eq('id', offer.id);
            continue;
        }
        await admin.from('waitlist').update({ status: 'notified', notified_at: nowIso }).eq('id', w.id);
        await setJob(admin, job, 'sent', `teklif: ${w.id}`);
        // Süre dolunca sıradakine geç.
        await admin.from('wa_jobs').insert({
            organization_id: job.organization_id, reservation_id: r.id, kind: 'slot_offer',
            due_at: new Date(expiresMs).toISOString(), stamp: job.stamp,
        });
        return 'sent';
    }
    await setJob(admin, job, 'skipped', candidates.length ? 'gönderilemedi' : 'bekleyen yok');
    return 'skipped';
}
