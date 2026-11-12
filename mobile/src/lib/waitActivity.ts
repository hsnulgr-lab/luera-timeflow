/**
 * BEKLEME SAYACI — Dinamik Ada + kilit ekranı (Live Activity), saf karar
 * katmanı (2026-11-12, 1. aşama: yalnız YEREL).
 *
 * Kullanıcı kararı: boya beklerken telefon tezgâhta ve kilitli; kalan süre
 * uygulamayı açmadan görünsün. Bekleme bitti BİLDİRİMİ zaten var
 * (`waitAlarm.ts`); bu katman onun YANINDA, yerine değil.
 *
 * ── Neden yalnız yerel ──────────────────────────────────────────────────────
 * Beklemeyi kuran telefon bitiş anını biliyor. Geri sayımı iOS kendisi
 * akıtıyor (`Text timerInterval`), yani etkinliğin her saniye güncellenmesi
 * gerekmiyor: başlat, bitiş değişirse güncelle, bekleme kalkınca bitir.
 * Sunucudan (APNs) itme 2. aşamanın işi.
 *
 * ── Randevu başına TEK etkinlik ─────────────────────────────────────────────
 * iOS etkinliğin içeriğini uygulamaya geri VERMİYOR (`expo-widgets` yalnız
 * kimliği döndürüyor). Hangi etkinliğin hangi randevuya ait olduğunu telefon
 * kendisi saklıyor (`WaitActivityRecord`); kaydı olmayan etkinlik SAHİPSİZ
 * sayılıyor ve bitiriliyor.
 *
 * ── Kilit ekranı ───────────────────────────────────────────────────────────
 * Yalnız İLK AD (bildirim kararı 2: telefon tezgâhta, ekran herkese açık) —
 * bekleme bildirimiyle aynı kural.
 *
 * Saf — Expo taşımıyor; cihaz tarafı `waitActivityDevice.ts`, görünüm
 * `waitActivityView.tsx`.
 */

import { pushTargetOf, type PushActor } from './pushRoute.ts';
import { waitAlarmData } from './waitAlarm.ts';

/** `createLiveActivity`e verilen ad — yalnız o çağrıyla eşleşmesi gerekiyor. */
export const WAIT_ACTIVITY_NAME = 'BeklemeSayaci';

/** Etkinliğin props'u. JSON'la uzantıya gidiyor: tarih değil ms. */
export interface WaitActivityProps {
    /** Müşterinin İLK adı. */
    name: string;
    service: string;
    /** Beklemenin başladığı an, ms — ilerleme çubuğunun alt ucu. */
    startsAt: number;
    /** Bitiş anı, ms. */
    endsAt: number;
    minutes: number;
}

/** "Tuğçe Erden" → "Tuğçe"; boşsa "Müşteri" (`waitAlarmText` ile aynı kural). */
export function firstNameOf(customerName: string): string {
    return customerName.trim().split(/\s+/)[0] || 'Müşteri';
}

/**
 * Başlangıç bitişten geri sayılıyor: sunucunun saati benimsenince
 * (`writeVisitWait`) bitiş kayıyor, süre aynı kalıyor — çubuk yine tam
 * doluyla başlıyor.
 */
export function waitActivityProps(input: {
    customerName: string;
    service: string;
    endsAt: number;
    minutes: number;
}): WaitActivityProps {
    return {
        name: firstNameOf(input.customerName),
        service: input.service.trim(),
        startsAt: input.endsAt - input.minutes * 60_000,
        endsAt: input.endsAt,
        minutes: input.minutes,
    };
}

/** Bu telefonda etkinliği kimin kabuğu kurdu — dokununca aynı kabuğa dönülüyor. */
export type WaitActivityActor = Extract<PushActor, 'staff' | 'solo'>;

/** Etkinliğin derin bağlantısı. `+native-intent` bunu çözüyor (`waitActivityTarget`). */
const LINK = /^luera:\/{2,3}bekleme\?(.*)$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Etkinliğe dokununca açılan adres: `luera://bekleme?id=…&date=…&kim=…`.
 *
 * Doğrudan `/kumanda` DEĞİL: uygulama kapalıyken o adres oturum kapısını ve
 * kabuğu atlayıp kumandayı tek başına açardı (geri ok gidecek yer bulamaz).
 * Onun yerine bildirime dokunmayla AYNI yol — niyet saklanıyor, kabuk
 * yerleşince tüketiliyor (`pushIntent.ts`).
 */
export function waitActivityUrl(reservationId: string, dateISO: string, actor: WaitActivityActor): string {
    const parts = [`id=${encodeURIComponent(reservationId)}`];
    if (ISO_DATE.test(dateISO)) parts.push(`date=${dateISO}`);
    parts.push(`kim=${actor === 'solo' ? 'tek' : 'personel'}`);
    return `luera://bekleme?${parts.join('&')}`;
}

/** `URLSearchParams`siz: `+native-intent` yönlendirici kurulmadan da çalışıyor. */
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
 * Derin bağlantı → { hedef, kabuk }. Bizim bağlantımız değilse `null`
 * (dokunulmadan geçiyor). Hedef, bekleme bildiriminin hedefiyle BİREBİR aynı:
 * `pushTargetOf` + `waitAlarmData` — iki yol ayrı ayrı yazılınca biri kayardı.
 */
export function waitActivityTarget(url: string | null | undefined): { href: string; actor: WaitActivityActor } | null {
    if (typeof url !== 'string') return null;
    const match = LINK.exec(url);
    if (!match) return null;
    const query = queryOf(match[1]);
    const id = query.id ?? '';
    if (!UUID.test(id)) return null;
    const actor: WaitActivityActor = query.kim === 'tek' ? 'solo' : 'staff';
    const href = pushTargetOf(waitAlarmData(id, ISO_DATE.test(query.date ?? '') ? query.date : ''), actor);
    return href ? { href, actor } : null;
}

/**
 * Etkinlik açık tutulur mu: bitiş en az bir saniye ileride. Bekleme
 * bildirimiyle aynı eşik (`waitAlarmDue`).
 */
export function waitActivityDue(endsAt: number, nowMs: number): boolean {
    return Number.isFinite(endsAt) && endsAt - nowMs >= 1000;
}

/** Telefonun sakladığı kayıt: etkinlik kimliği → randevu ve son props. */
export interface WaitActivityRecord {
    activityId: string;
    reservationId: string;
    props: WaitActivityProps;
}

export type WaitActivityStep = 'start' | 'update' | 'end' | 'none';

/**
 * Kumanda beklemeyi kurdu / kaydırdı / kaldırdı: etkinliğe ne olacak.
 *   bekleme yok ya da süresi geçmiş → varsa bitir
 *   etkinlik yok                    → başlat
 *   bitiş ya da süre değişti        → güncelle (aynı randevuya ikinci etkinlik açılmıyor)
 */
export function waitActivityStep(
    current: Pick<WaitActivityRecord, 'props'> | null,
    next: Pick<WaitActivityProps, 'endsAt' | 'minutes'> | null,
    nowMs: number,
): WaitActivityStep {
    if (!next || !waitActivityDue(next.endsAt, nowMs)) return current ? 'end' : 'none';
    if (!current) return 'start';
    if (current.props.endsAt !== next.endsAt || current.props.minutes !== next.minutes) return 'update';
    return 'none';
}

/** Günün bir randevusunun beklemesi — okunmuş listeden. `endsAt: null` = bekleme yok. */
export interface DayWait {
    reservationId: string;
    endsAt: number | null;
}

/**
 * MUTABAKAT — telefondaki etkin etkinlikler × günün beklemeleri: hangileri
 * bitirilecek.
 *
 * `waits` `null` ise liste OKUNMADI (çevrimdışı, başka gün): yalnız kesin
 * olanlar bitiriliyor — kaydı olmayan (sahipsiz) ve süresi geçmiş. Liste
 * okunduysa ayrıca: randevu listede yok (silindi, başkasına geçti) ya da
 * beklemesi kalkmış (başka cihazdan kaldırıldı). Aynı randevuya birden fazla
 * etkinlik varsa (yarış) kayıttaki dışındakiler.
 */
export function waitActivitiesToEnd(
    activeIds: readonly string[],
    records: readonly WaitActivityRecord[],
    waits: readonly DayWait[] | null,
    nowMs: number,
): string[] {
    const byActivity = new Map(records.map((record) => [record.activityId, record]));
    const byReservation = waits ? new Map(waits.map((wait) => [wait.reservationId, wait])) : null;
    const kept = new Set<string>();
    const out: string[] = [];
    for (const id of activeIds) {
        const record = byActivity.get(id);
        if (!record || kept.has(record.reservationId) || !waitActivityDue(record.props.endsAt, nowMs)) {
            out.push(id);
            continue;
        }
        if (byReservation) {
            const wait = byReservation.get(record.reservationId);
            if (!wait || wait.endsAt === null || !waitActivityDue(wait.endsAt, nowMs)) {
                out.push(id);
                continue;
            }
        }
        kept.add(record.reservationId);
    }
    return out;
}
