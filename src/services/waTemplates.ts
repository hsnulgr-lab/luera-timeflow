import type { SectorComms } from '@/lib/sectorProfiles';
import * as M from '../../supabase/functions/_shared/booking/messages.ts';
import { greetingName } from '../../supabase/functions/_shared/booking/identity.ts';
import { bookingDateLabel } from '../../supabase/functions/_shared/booking/tr.ts';

// WhatsApp mesaj şablonları — SAF fonksiyonlar, ağ erişimi yok.
//
// Tek ses (2026-11-07): metinlerin TEK kaynağı sunucudaki
// supabase/functions/_shared/booking/messages.ts. Burası yalnız panelin
// elindeki parametreleri oradaki fonksiyonlara çevirir (göreli yol: node
// testleri de bu dosyayı doğrudan import ediyor, @shared takma adını bilmez). Eskiden her şablonun
// burada ayrı bir kopyası vardı ("sunucudaki eşi aynı metni üretir"); kopyalar
// zamanla ayrıştı ve Ayarlar'daki önizleme gerçekte gidenden farklı bir mesaj
// gösteriyordu. Artık önizleme gönderilenin ta kendisi.
//
// Gönderim src/services/whatsapp.ts üzerinden whatsapp-proxy edge function'ına
// gider; Evolution anahtarı tarayıcıya asla girmez.

/** Panelin bildiği müşteri adı + işletme → şablon bağlamı (Hanım/Bey dahil). */
function ctx(customerName: string | null | undefined, businessName: string, comms?: SectorComms | M.Comms): M.Ctx {
    return {
        comms: M.resolveComms(comms),
        businessName: businessName || 'İşletmeniz',
        firstName: greetingName(customerName),
    };
}

/** Tarayıcının bugünü (YYYY-MM-DD, yerel saat). */
function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysISO(iso: string, days: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** "27 Temmuz Pazartesi" — şablonlarda okunabilir tarih. */
export function formatTrDate(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}

// ─── Randevu onayı ───────────────────────────────────────────────────────────

// Randevu oluşturulur oluşturulmaz gider — müşteri elinde yazılı bir kayıt olsun
// diye. Online randevu (public-booking) aynı fonksiyonu çağırır.
export function buildConfirmationMessage(params: {
    customerName: string;
    date: string;              // ISO (YYYY-MM-DD)
    startTime: string;
    service: string;
    businessName: string;
    staffName?: string;
    mapsUrl?: string;
    comms?: SectorComms;
}): string {
    return M.bookingConfirmation(ctx(params.customerName, params.businessName, params.comms), {
        items: [{
            service: params.service,
            dateLabel: bookingDateLabel(params.date, todayISO()),
            time: params.startTime,
            staff: params.staffName,
        }],
        mapsUrl: params.mapsUrl,
    });
}

// ─── Google değerlendirme daveti ─────────────────────────────────────────────

export function buildReviewMessage(params: {
    customerName: string;
    businessName: string;
    reviewUrl: string;
    comms?: SectorComms;
}): string {
    return M.reviewInvite(ctx(params.customerName, params.businessName, params.comms), { reviewUrl: params.reviewUrl });
}

// ─── Hatırlatmalar ───────────────────────────────────────────────────────────

/** `askConfirm`: asistan açıkken sonda "Gelebilecek misiniz?" sorulur. */
export function build24hMessage(params: {
    customerName: string;
    startTime: string;
    service: string;
    businessName: string;
    mapsUrl?: string;
    comms?: SectorComms;
    askConfirm?: boolean;
}): string {
    const today = todayISO();
    return M.reminder24h(ctx(params.customerName, params.businessName, params.comms), {
        service: params.service,
        dateLabel: bookingDateLabel(addDaysISO(today, 1), today),
        time: params.startTime,
        mapsUrl: params.mapsUrl,
        askConfirm: Boolean(params.askConfirm),
    });
}

export function build2hMessage(params: {
    customerName: string;
    startTime: string;
    service: string;
    businessName: string;
    mapsUrl?: string;
    comms?: SectorComms;
}): string {
    return M.reminder2h(ctx(params.customerName, params.businessName, params.comms), {
        service: params.service, time: params.startTime, mapsUrl: params.mapsUrl,
    });
}

// Dönüş (recall) — sektörün kavramıyla: diş kontrolü / dip boyası…
export function buildRecallMessage(params: {
    customerName: string;
    businessName: string;
    comms?: SectorComms;
}): string {
    return M.recallInvite(ctx(params.customerName, params.businessName, params.comms));
}

// ─── Sırasız bekleme ─────────────────────────────────────────────────────────

export function buildQueueJoinMessage(params: {
    customerName: string;
    businessName: string;
    position: number;     // önünde kaç kişi + 1 (1 = sıradaki)
    etaMin: number;
    comms?: SectorComms;
}): string {
    return M.queueJoined(ctx(params.customerName, params.businessName, params.comms), {
        position: params.position, etaMin: params.etaMin,
    });
}

export function buildQueueReadyMessage(params: { customerName: string; businessName: string; comms?: SectorComms }): string {
    return M.queueReady(ctx(params.customerName, params.businessName, params.comms));
}

// ─── Sıradaki randevu daveti ─────────────────────────────────────────────────

// Zamanlayıcı açık işletmede sunucudan (132), kapalıysa panelden gider; ikisi
// de aynı metin.
export function buildRebookInvite(params: {
    customerName: string;
    service: string;
    note?: string;
    bookingUrl?: string;
    /** Sektörün emojisi. */
    emoji?: string;
    businessName?: string;
}): string {
    const comms = params.emoji ? { ...M.NEUTRAL_COMMS, emoji: params.emoji } : undefined;
    return M.rebookInvite(ctx(params.customerName, params.businessName ?? '', comms), {
        service: params.service, note: params.note, bookingUrl: params.bookingUrl,
    });
}

/** Zamanlayıcısız işletmede randevu tamamlanınca panelden giden davet. */
export function buildRebookMessage(params: {
    customerName: string;
    service: string;
    businessName: string;
    note?: string;        // teşvik satırı (ör. "%10 erken rezervasyon indirimi")
    bookingUrl?: string;
    comms?: SectorComms;
}): string {
    return M.rebookInvite(ctx(params.customerName, params.businessName, params.comms), {
        service: params.service, note: params.note, bookingUrl: params.bookingUrl,
    });
}

// ─── Sizi özledik + indirim ──────────────────────────────────────────────────

/**
 * "Sizi özledik" mesajının sonuna eklenen indirim teklifi — 071. Kodu remind
 * üretir (müşteriye özel, Kasa'da tanınır); burada önizleme için.
 */
export function buildDiscountLine(percent: number, days: number, code: string): string {
    const until = days > 0
        ? new Date(Date.now() + days * 86400_000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
        : null;
    return M.discountLine({ percent, code, until });
}

export function buildWinbackMessage(params: {
    customerName: string;
    businessName: string;
    comms?: SectorComms;
}): string {
    return M.winback(ctx(params.customerName, params.businessName, params.comms));
}

// Biten pakete yenileme teklifi.
export function buildRenewalMessage(params: {
    customerName: string;
    packageTitle: string;
    businessName: string;
    comms?: SectorComms;
}): string {
    return M.renewalInvite(ctx(params.customerName, params.businessName, params.comms), { packageTitle: params.packageTitle });
}
