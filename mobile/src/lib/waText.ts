/**
 * Müşteriye giden WhatsApp metinleri — masaüstüyle TEK SES (1.0.2, 2026-11-09).
 *
 * Telefon eskiden kendi onay metnini yazıyordu ("Merhaba X 👋 … kaydınız
 * oluşturuldu ✅"); aynı müşteri bir randevuyu masaüstünden, birini telefondan
 * alınca iki farklı ses duyuyordu, Hanım/Bey hitabı ve hazırlık notu da
 * yoktu. Kalıplar artık sunucununkilerin birebir kopyası (`waShared/`);
 * burası yalnız telefonun elindeki bilgiyi onlara çevirir — masaüstündeki
 * `src/services/waTemplates.ts`'in karşılığı.
 *
 * Tarih etiketi ("Yarın, 9 Kasım Pazartesi") telefonun kendi takviminden:
 * sunucununki `Intl` ile çiziyor, Hermes'te ona güvenilmiyor. Aynı metni
 * çıkardığı `tests/mobil-wa-tek-ses.test.mjs` ile kilitli.
 */
import * as M from './waShared/messages.ts';
import { greetingName } from './waShared/identity.ts';
import { dayNameLong, formatDayMonth } from './calendar.ts';

/** "9 Kasım Pazartesi". */
export function waDateLong(dateISO: string): string {
    return `${formatDayMonth(dateISO)} ${dayNameLong(dateISO)}`;
}

/** Sunucunun `bookingDateLabel`ı: bugün/yarın önekli, gerisi yalnız tarih. */
export function waDateLabel(dateISO: string, todayISO: string): string {
    const diff = Math.round((Date.parse(`${dateISO}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86_400_000);
    const full = waDateLong(dateISO);
    if (diff === 0) return `Bugün, ${full}`;
    if (diff === 1) return `Yarın, ${full}`;
    return full;
}

/** "10:30:00" → "10:30". */
const hhmm = (t: string) => String(t ?? '').slice(0, 5);

/** settings.comms (ham) + ad → kalıp bağlamı; ad Hanım/Bey ile, yer tutucu ad elenir. */
function ctx(customerName: string | null | undefined, businessName: string, comms: unknown): M.Ctx {
    return {
        comms: M.resolveComms(comms),
        businessName: businessName || 'İşletmeniz',
        firstName: greetingName(customerName),
    };
}

/** Randevu onayı — masaüstünün `buildConfirmationMessage`ı. */
export function waConfirmation(p: {
    customerName: string;
    dateISO: string;
    startTime: string;
    service: string;
    businessName: string;
    todayISO: string;
    staffName?: string | null;
    mapsUrl?: string | null;
    /** settings.comms — sektör tonu (066); yoksa nötr. */
    comms?: unknown;
    /** Hizmetin hazırlık notu (138). */
    prepNote?: string | null;
}): string {
    return M.bookingConfirmation(ctx(p.customerName, p.businessName, p.comms), {
        items: [{
            service: p.service,
            dateLabel: waDateLabel(p.dateISO, p.todayISO),
            time: hhmm(p.startTime),
            staff: p.staffName ?? undefined,
            prep: p.prepNote ?? undefined,
        }],
        mapsUrl: p.mapsUrl ?? undefined,
    });
}

/** İşletme randevuyu iptal etti — masaüstünün `buildCancelMessage`ı. */
export function waCancellation(p: {
    customerName: string;
    dateISO: string;
    startTime: string;
    service: string;
    businessName: string;
    todayISO: string;
    comms?: unknown;
}): string {
    return M.cancelledByBusiness(ctx(p.customerName, p.businessName, p.comms), {
        service: p.service,
        dateLabel: waDateLabel(p.dateISO, p.todayISO),
        time: hhmm(p.startTime),
    });
}

/**
 * İşletme randevuyu aynı gün başka saate taşıdı (2026-11-10) — sunucunun
 * `rescheduledByBusiness`ı. Telefonun "taşındı" sayfasındaki düğmeden gider.
 */
export function waReschedule(p: {
    customerName: string;
    dateISO: string;
    startTime: string;
    /** Taşımadan önceki saat — yeni saatin yanında "(önceki: 09:00)". */
    oldStartTime: string;
    service: string;
    businessName: string;
    todayISO: string;
    comms?: unknown;
}): string {
    return M.rescheduledByBusiness(ctx(p.customerName, p.businessName, p.comms), {
        service: p.service,
        dateLabel: waDateLabel(p.dateISO, p.todayISO),
        time: hhmm(p.startTime),
        oldTime: hhmm(p.oldStartTime),
    });
}
