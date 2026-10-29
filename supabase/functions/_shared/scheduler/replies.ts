// Zamanlayıcının sorduğu sorulara gelen cevaplar (131).
//
// Bekleme listesi teklifine "Evet" ve memnuniyet sorusuna "5" botun (eski ya
// da Claude) işi değil: cevabı kod yorumlar, kaydı kod yazar. whatsapp-booking
// bunu bota göndermeden ÖNCE çağırır; tanınmayan mesaj null döner ve normal
// akışa gider ("saat 5te gelebilir miyim" puan sanılmaz, feedback.ts).
//
// Yalnız features.scheduler_v2 açık işletmede çağrılır.

import type { Admin } from '../wa.ts';
import { normalizePhone } from '../phone.ts';
import * as M from '../booking/messages.ts';
import { detectConfirm } from '../booking/intent.ts';
import { formatDateTr } from '../booking/slots.ts';
import { greetingName } from '../booking/identity.ts';
import { isReservationConflict } from '../booking/reservationErrors.ts';
import { firstNameOf, notifyOwner } from '../notify.ts';
import { findCustomerByPhone } from '../wa.ts';
import { isUnhappy, parseRating, shouldSendReviewLink } from './feedback.ts';

const APP_ORIGIN = 'https://timeflow.lueratech.com';
/** Süresi dolmuş teklife bu kadar içinde gelen "evet"e "süresi doldu" denir. */
const LATE_REPLY_MS = 2 * 3600_000;
/** Memnuniyet sorusu bu kadar süre cevap bekler. */
const FEEDBACK_OPEN_MS = 48 * 3600_000;

export interface ReplyContext {
    orgId: string;
    phone: string;
    text: string;
    msgCtx: M.Ctx;
    ownerId: string | null;
    autoConfirm: boolean;
    reviewUrl: string | null;
}

export interface ScheduledReply {
    text: string;
    kind: 'feedback' | 'booking';
}

interface OfferRow {
    id: string;
    freed_reservation_id: string;
    waitlist_id: string;
    slot: {
        date: string; start_time: string; end_time: string; service: string;
        color: string | null; staff_id: string | null; resource_id: string | null;
    };
    status: string;
    expires_at: string;
}

export async function handleScheduledReply(admin: Admin, o: ReplyContext): Promise<ScheduledReply | null> {
    const phone = normalizePhone(o.phone) ?? o.phone;
    return (await handleOfferReply(admin, o, phone)) ?? (await handleFeedbackReply(admin, o, phone));
}

// ── Bekleme listesi teklifi ─────────────────────────────────────────────────

async function handleOfferReply(admin: Admin, o: ReplyContext, phone: string): Promise<ScheduledReply | null> {
    const answer = detectConfirm(o.text);
    if (!answer) return null;
    const { data } = await admin.from('wa_waitlist_offers')
        .select('id, freed_reservation_id, waitlist_id, slot, status, expires_at')
        .eq('organization_id', o.orgId).eq('phone', phone)
        .in('status', ['sent', 'expired']).is('answered_at', null)
        .gt('expires_at', new Date(Date.now() - LATE_REPLY_MS).toISOString())
        .order('sent_at', { ascending: false }).limit(1).maybeSingle();
    const offer = data as OfferRow | null;
    if (!offer) return null;
    const now = new Date().toISOString();

    if (offer.status === 'expired' || Date.parse(offer.expires_at) <= Date.now()) {
        await admin.from('wa_waitlist_offers').update({ status: 'expired', answered_at: now }).eq('id', offer.id);
        return { text: M.slotOfferExpired(), kind: 'booking' };
    }

    if (answer === 'no') {
        await admin.from('wa_waitlist_offers').update({ status: 'declined', answered_at: now }).eq('id', offer.id);
        // Sıradaki bekleyene hemen geç; zamanlayıcı 30 dakikayı beklemesin.
        // Bekleyen iş zaten varsa tekil indeks reddeder; sorun değil.
        await admin.from('wa_jobs').insert({
            organization_id: o.orgId, reservation_id: offer.freed_reservation_id,
            kind: 'slot_offer', due_at: now, note: 'önceki aday istemedi',
        });
        return { text: M.slotDeclined(), kind: 'booking' };
    }

    // "Evet": saati ayır. Çakışma koruması (060) yarışı çözer — bu arada biri
    // aldıysa kayıt reddedilir.
    const { data: waiting } = await admin.from('waitlist')
        .select('customer_name').eq('id', offer.waitlist_id).maybeSingle();
    const name = String(waiting?.customer_name || o.msgCtx.firstName || `WhatsApp ${phone.slice(-4)}`);
    let customer = await findCustomerByPhone(admin, o.orgId, phone);
    if (!customer) {
        const { data: created } = await admin.from('customers').insert({
            user_id: o.ownerId, organization_id: o.orgId, name, phone,
        }).select('id, name, wa_opt_out').single();
        customer = created ?? null;
    }
    const s = offer.slot;
    const { data: reservation, error } = await admin.from('reservations').insert({
        user_id: o.ownerId, organization_id: o.orgId, customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? name, customer_phone: phone,
        date: s.date, start_time: s.start_time, end_time: s.end_time,
        service: s.service, service_color: s.color || '#FF5A1F',
        status: o.autoConfirm ? 'confirmed' : 'pending', notes: 'Bekleme listesinden (WhatsApp)',
        staff_id: s.staff_id, resource_id: s.resource_id, source: 'whatsapp',
    }).select('id, customer_token').single();

    if (error || !reservation) {
        if (!isReservationConflict(error)) console.error('waitlist offer booking', error);
        await admin.from('wa_waitlist_offers').update({ status: 'taken', answered_at: now }).eq('id', offer.id);
        return { text: M.slotTaken(), kind: 'booking' };
    }

    await admin.from('wa_waitlist_offers')
        .update({ status: 'accepted', answered_at: now, reservation_id: reservation.id }).eq('id', offer.id);
    await admin.from('waitlist').update({ status: 'fulfilled' }).eq('id', offer.waitlist_id);
    // Zincir bitti: bu boşluk için bekleyen teklif işi kalmasın.
    await admin.from('wa_jobs').update({ status: 'cancelled', note: 'teklif kabul edildi', updated_at: now })
        .eq('reservation_id', offer.freed_reservation_id).eq('kind', 'slot_offer').eq('status', 'pending');

    const ctx: M.Ctx = { ...o.msgCtx, firstName: greetingName(customer?.name ?? name) };
    return {
        text: M.created(ctx, {
            service: s.service, dateLabel: formatDateTr(s.date), time: String(s.start_time).slice(0, 5),
            manageUrl: reservation.customer_token ? `${APP_ORIGIN}/booking/${reservation.customer_token}` : null,
            pending: !o.autoConfirm,
        }),
        kind: 'booking',
    };
}

// ── Memnuniyet ──────────────────────────────────────────────────────────────

async function handleFeedbackReply(admin: Admin, o: ReplyContext, phone: string): Promise<ScheduledReply | null> {
    const { data: fb } = await admin.from('wa_feedback')
        .select('id, reservation_id')
        .eq('organization_id', o.orgId).eq('phone', phone).eq('status', 'asked')
        .gt('asked_at', new Date(Date.now() - FEEDBACK_OPEN_MS).toISOString())
        .order('asked_at', { ascending: false }).limit(1).maybeSingle();
    if (!fb) return null;
    const parsed = parseRating(o.text);
    if (!parsed) return null;

    const { data: cfg } = await admin.from('org_whatsapp')
        .select('schedule_config').eq('organization_id', o.orgId).maybeSingle();
    const link = shouldSendReviewLink(parsed.rating, cfg?.schedule_config?.review_policy, Boolean(o.reviewUrl));
    const unhappy = isUnhappy(parsed.rating);

    await admin.from('wa_feedback').update({
        status: 'answered', rating: parsed.rating, comment: parsed.comment,
        answered_at: new Date().toISOString(), review_link_sent: link, owner_notified: unhappy,
    }).eq('id', fb.id);

    if (unhappy) {
        const { data: r } = await admin.from('reservations')
            .select('customer_name, service, date').eq('id', fb.reservation_id).maybeSingle();
        const note = parsed.comment ? ` · "${parsed.comment.slice(0, 80)}"` : '';
        notifyOwner(admin, o.orgId, {
            title: 'Olumsuz geri bildirim',
            body: `${firstNameOf(r?.customer_name)} · ${parsed.rating}/5 · ${r?.service ?? ''}${note}`,
            url: r?.date ? `/takvim?date=${r.date}` : '/takvim',
            tag: `geri-bildirim-${fb.id}`,
        });
    }

    const url = link ? o.reviewUrl : null;
    return {
        text: unhappy ? M.feedbackUnhappy(o.msgCtx, { reviewUrl: url }) : M.feedbackHappy(o.msgCtx, { reviewUrl: url }),
        kind: 'feedback',
    };
}
