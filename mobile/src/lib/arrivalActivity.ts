/**
 * "MÜŞTERİ BEKLİYOR" — Dinamik Ada + kilit ekranı (Live Activity), saf karar
 * katmanı (göç 144 · 1.0.3, plan: docs/dinamik-ada-musteri-bekliyor-plan.md).
 *
 * Resepsiyon "Geldi" deyince SUNUCU Apple'a doğrudan itiyor (push-to-start)
 * ve personelin telefonunda "Ayşe bekliyor · 4:12" açılıyor — uygulama
 * kapalıyken de. Bu dosya telefonun o etkinlikle ne yapacağını söylüyor:
 * hangi randevuya ait, ne zaman biter, sunucuya hangi jeton yazılır.
 *
 * ── Uzaktan açılan etkinliğin randevusu ─────────────────────────────────────
 * iOS etkinliğin içeriğini uygulamaya VERMİYOR (`expo-widgets` yalnız kimlik
 * ve jeton döndürüyor). Uzaktan açılan bir etkinlik telefona KİMLİKSİZ düşüyor.
 * Telefon onu günün okunmuş listesiyle eşliyor (`planArrivalActivities`):
 *   • tek bilinmeyen etkinlik + tek eşlenmemiş bekleyen müşteri → o (içerik
 *     o müşteriyle yeniden yazılıyor ki yanlış ad asla görünmesin)
 *   • başka her durum (iki müşteri birden bekliyor) → bilinmeyenler
 *     bitiriliyor, bekleyenler için telefon kendisi yerel etkinlik açıyor
 *     (yerel açılış uyarı çaldırmaz; artık hangisinin hangisi olduğu belli)
 * Eşlenen etkinliğin güncelleme jetonu sunucuya randevusuyla yazılıyor; iş
 * başlayınca / iptal olunca sunucu onunla bitiriyor.
 *
 * ── Kilit ekranı ───────────────────────────────────────────────────────────
 * Yalnız İLK AD (bildirim kararı 2) — bekleme sayacıyla aynı kural.
 *
 * Saf — Expo taşımıyor; cihaz tarafı `arrivalActivityDevice.ts`, görünüm
 * `arrivalActivityView.tsx`. Sunucudaki karşılığı
 * `supabase/functions/send-live-activity/apns.ts` (ad, props, bağlantı AYNI).
 */

import { pushTargetOf } from './pushRoute.ts';
import { waitAlarmData } from './waitAlarm.ts';
import { firstNameOf } from './waitActivity.ts';

/** `createLiveActivity`e verilen ad. Sunucu (`apns.ts · ACTIVITY_NAME`) aynısını yazıyor. */
export const ARRIVAL_ACTIVITY_NAME = 'MusteriBekliyor';

/** Sayacın üst ucu: geliş + 2 saat (sayaç orada durur). Plan kararı. */
export const ARRIVAL_MAX_MS = 2 * 60 * 60 * 1000;

/** Etkinliğin props'u. JSON'la uzantıya gidiyor. Sunucunun `ArrivalProps`ı ile AYNI alanlar. */
export interface ArrivalActivityProps {
    /** Müşterinin İLK adı. */
    name: string;
    service: string;
    /** Randevu saati "HH:MM" (boş olabilir). */
    time: string;
    /** Geliş anı, ms — sayaç buradan yukarı sayıyor. */
    arrivedAt: number;
}

/** Günün bir satırından okunan, bekleme kararına yeten alanlar (`AgendaRow` uyar). */
export interface ArrivalRow {
    id: string;
    staff_id?: string | null;
    customer_name: string;
    service: string;
    start_time: string;
    date: string;
    status: string;
    customer_arrived_at?: string | null;
    arrived_at?: string | null;
    service_ended_at?: string | null;
}

/** Kapıda bekleyen bir müşteri: telefonda etkinliği olabilecek randevu. */
export interface Waiting {
    reservationId: string;
    dateISO: string;
    props: ArrivalActivityProps;
}

/**
 * Günün okunmuş listesinden BENİM bekleyen müşterilerim: geldi, işi
 * başlamadı, iptal değil, yalnız benim (salonun tamamını gören rolde de),
 * geliş iki saatten eski değil.
 */
export function waitingOf(rows: readonly ArrivalRow[], myStaffId: string, nowMs: number): Waiting[] {
    const out: Waiting[] = [];
    for (const row of rows) {
        if (row.staff_id !== myStaffId) continue;
        if (!row.customer_arrived_at || row.arrived_at || row.service_ended_at) continue;
        if (row.status === 'cancelled') continue;
        const arrivedAt = Date.parse(row.customer_arrived_at);
        if (!Number.isFinite(arrivedAt) || nowMs - arrivedAt >= ARRIVAL_MAX_MS) continue;
        out.push({
            reservationId: row.id,
            dateISO: row.date,
            props: {
                name: firstNameOf(row.customer_name),
                service: row.service.trim(),
                time: row.start_time.slice(0, 5),
                arrivedAt,
            },
        });
    }
    return out;
}

// ── Bağlantı ────────────────────────────────────────────────────────────────

const LINK = /^luera:\/{2,3}bekliyor\?(.*)$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Etkinliğe dokununca açılan adres. Sunucu (`apns.ts · arrivalUrl`) birebir aynısını yazıyor. */
export function arrivalActivityUrl(reservationId: string, dateISO: string): string {
    const parts = [`id=${encodeURIComponent(reservationId)}`];
    if (ISO_DATE.test(dateISO)) parts.push(`date=${dateISO}`);
    return `luera://bekliyor?${parts.join('&')}`;
}

function queryOf(query: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of query.split('&')) {
        const [key, value = ''] = pair.split('=');
        if (!key) continue;
        try {
            out[decodeURIComponent(key)] = decodeURIComponent(value);
        } catch {
            // bozuk kaçış: o parça yok sayılıyor
        }
    }
    return out;
}

/**
 * Derin bağlantı → o işin KUMANDASI (personel kabuğu; tek kişilikte bu
 * etkinlik hiç açılmıyor). Hedef bekleme sayacınınkiyle aynı yoldan
 * (`pushTargetOf` + `waitAlarmData`) — iki yol ayrı yazılınca biri kayardı.
 * Bizim bağlantımız değilse `null`.
 */
export function arrivalActivityTarget(url: string | null | undefined): { href: string; actor: 'staff'; id: string } | null {
    if (typeof url !== 'string') return null;
    const match = LINK.exec(url);
    if (!match) return null;
    const query = queryOf(match[1]);
    const id = query.id ?? '';
    if (!UUID.test(id)) return null;
    const href = pushTargetOf(waitAlarmData(id, ISO_DATE.test(query.date ?? '') ? query.date : ''), 'staff');
    return href ? { href, actor: 'staff', id } : null;
}

// ── Mutabakat ───────────────────────────────────────────────────────────────

/** Telefonun sakladığı eşleşme: etkinlik → randevu (+ sunucuya yazılan jeton). */
export interface ArrivalRecord {
    activityId: string;
    reservationId: string;
    arrivedAt: number;
    /** Sunucuya en son yazılan güncelleme jetonu; yoksa henüz yazılmadı. */
    token?: string | null;
}

export interface ArrivalPlan {
    /** Bitirilecek etkinlikler. */
    end: string[];
    /** Bilinmeyen (uzaktan açılmış) etkinlik → bu randevu; içerik yeniden yazılır. */
    adopt: { activityId: string; waiting: Waiting }[];
    /** Telefonun yerel açacağı etkinlikler. */
    start: Waiting[];
}

/**
 * Telefondaki etkin "Müşteri bekliyor" etkinlikleri × günün bekleyenleri.
 *
 * `waiting` `null` ise liste OKUNMADI (çevrimdışı, açılış anı): yalnız kesin
 * olanlar — iki saati geçmiş kayıtlar — bitiyor; bilinmeyenlere dokunulmuyor
 * (az önce uzaktan açılmış olabilirler).
 *
 * Liste okunduysa: kaydın randevusu artık beklemiyor → bitir; aynı randevuya
 * ikinci kayıt → bitir; bilinmeyenler yukarıdaki kuralla (dosya başı).
 * Bilinmeyen yokken telefon kendiliğinden etkinlik AÇMIYOR: kullanıcı
 * kilit ekranından kaydırıp kapattıysa uygulama onu geri getirmesin.
 */
export function planArrivalActivities(
    activeIds: readonly string[],
    records: readonly ArrivalRecord[],
    waiting: readonly Waiting[] | null,
    nowMs: number,
): ArrivalPlan {
    const plan: ArrivalPlan = { end: [], adopt: [], start: [] };
    const byActivity = new Map(records.map((record) => [record.activityId, record]));
    const unknown: string[] = [];
    const kept = new Set<string>();
    const waitingById = waiting ? new Map(waiting.map((w) => [w.reservationId, w])) : null;

    for (const id of activeIds) {
        const record = byActivity.get(id);
        if (!record) {
            unknown.push(id);
            continue;
        }
        const tooOld = nowMs - record.arrivedAt >= ARRIVAL_MAX_MS;
        const gone = waitingById !== null && !waitingById.has(record.reservationId);
        if (tooOld || gone || kept.has(record.reservationId)) {
            plan.end.push(id);
            continue;
        }
        kept.add(record.reservationId);
    }

    if (!waiting || unknown.length === 0) return plan;

    const free = waiting.filter((w) => !kept.has(w.reservationId));
    if (unknown.length === 1 && free.length === 1) {
        plan.adopt.push({ activityId: unknown[0], waiting: free[0] });
        return plan;
    }
    // Belirsiz: bilinmeyenler gidiyor; yerlerine en son gelenler, en çok
    // bilinmeyen kadar (fazlası kullanıcının kapattığı olabilir).
    plan.end.push(...unknown);
    plan.start.push(...[...free].sort((a, b) => b.props.arrivedAt - a.props.arrivedAt).slice(0, unknown.length));
    return plan;
}

// ── Sunucu kaydı ────────────────────────────────────────────────────────────

/** Derlemenin APNs ortamı: geliştirme derlemesi sandbox, TestFlight/mağaza production. */
export function apnsEnvironmentOf(isDev: boolean): 'sandbox' | 'production' {
    return isDev ? 'sandbox' : 'production';
}

/** Başlatma jetonunun son BAŞARILI kaydı (cihazda saklı). */
export interface StartRegistration {
    token: string | null;
    staffId: string | null;
    at: number;
}

/** Bu kadar zaman geçtiyse hiçbir şey değişmese de kayıt tazelenir (`pushRegistration` ile aynı). */
export const START_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** Başlatma jetonunu sunucuya yeniden yazmalı mıyız? */
export function shouldRegisterStart(input: {
    token: string | null;
    staffId: string | null;
    last: StartRegistration;
    now: number;
}): boolean {
    if (!input.token || !input.staffId) return false;
    if (input.token !== input.last.token || input.staffId !== input.last.staffId) return true;
    return input.now - input.last.at >= START_REFRESH_MS;
}
