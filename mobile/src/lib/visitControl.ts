/**
 * Personel 05/06 — işlem kumandasının karar katmanı. Saf, React'siz.
 *
 * Kaynak: Claude Design "Personel 05" (tam tasarım) + "Personel 06" (rötuş).
 *
 * Bir randevunun tamamı tek sayfada, üç evrede yaşıyor. EVRE VERİDEN OKUNUR;
 * çağıran seçmez. Ekranın ortasındaki kadran üç evrede de aynı yerde durur,
 * yalnız içeriği değişir — personel 80 cm'den baktığında gözü hep aynı
 * noktaya gider.
 */

import { toMinutes } from './calendar.ts';
import { cardState, localStamp, type StaffCardSource } from './staffCard.ts';

export type VisitPhase = 'before' | 'running' | 'closing' | 'closed';

/**
 * A evresinin kadranı: bir sayı, altında bir kelime. Üç durum, tek gramer.
 *
 * `planlanan saat` kadranda DEĞİL plakada duruyor — personel randevunun
 * saatini zaten biliyor, o haber değil. Kadranda haber olan durur.
 */
export type DialAKind = 'waiting' | 'late' | 'ahead';

export interface DialA {
    kind: DialAKind;
    /** Dakika. Birim ayrı çiziliyor: "10" + "dk". */
    value: number;
    /** Sayının altındaki kelime. */
    unit: string;
    /** Amber mi sönük mü — bekleme ve gecikme haber, kalan süre değil. */
    tone: 'am' | 'mut';
    /** Kadranın altındaki hap. Yoksa çizilmez. */
    chip: string | null;
    chipTone: 'am' | 'cool';
}

export function phaseOf(appointment: StaffCardSource, nowMs: number = Date.now()): VisitPhase {
    const state = cardState(appointment, nowMs);
    switch (state.kind) {
        case 'running':
        case 'over':
            return 'running';
        case 'unbilled':
            return 'closing';
        case 'atcash':
        case 'paid':
            return 'closed';
        default:
            return 'before';
    }
}

/** "10:00" → dakikaya çevirip bugünün damgasıyla karşılaştırır. */
export function dialA(
    appointment: StaffCardSource,
    nowMs: number = Date.now(),
): DialA {
    const startMs = localStamp(appointment.date, appointment.start_time);
    const start = appointment.start_time.slice(0, 5);

    const arrived = appointment.customer_arrived_at
        ? Date.parse(appointment.customer_arrived_at)
        : NaN;
    if (Number.isFinite(arrived)) {
        return {
            kind: 'waiting',
            value: Math.max(0, Math.floor((nowMs - arrived) / 60000)),
            unit: 'BEKLİYOR',
            tone: 'am',
            chip: null,
            chipTone: 'am',
        };
    }

    const diff = Math.floor((nowMs - startMs) / 60000);
    if (diff > 0) {
        return {
            kind: 'late',
            value: diff,
            unit: 'GECİKME',
            tone: 'am',
            chip: `${start}'da başlayacaktı`,
            chipTone: 'am',
        };
    }

    // Saat henüz gelmedi: bu bir haber değil, o yüzden sönük.
    return {
        kind: 'ahead',
        value: Math.max(0, -diff),
        unit: 'BAŞLAMAYA',
        tone: 'mut',
        chip: `${start}'da başlıyor`,
        chipTone: 'cool',
    };
}

export interface PlanBar {
    /** Geçen sürenin plana oranı, 1'i aşabilir — çubuk kırpar. */
    progress: number;
    /** Planın çubuk üzerindeki yeri. Aşımda 1'den küçük. */
    marker: number;
    /** Aşılan dakika; aşılmadıysa 0. */
    overMinutes: number;
    /** Çubuğun altındaki cümle. */
    label: string;
}

/**
 * Geçen süre çubuğu. Aşım TURUNCUYLA DEĞİL kırmızıyla söylenir — turuncu
 * zaman rengidir, durum rengi değil.
 */
export function planBar(
    appointment: Pick<StaffCardSource, 'start_time' | 'end_time'>,
    elapsedSeconds: number,
): PlanBar {
    const span = toMinutes(appointment.end_time) - toMinutes(appointment.start_time);
    const planned = span < 0 ? span + 24 * 60 : span;
    const elapsed = Math.floor(elapsedSeconds / 60);

    if (planned <= 0) {
        return { progress: 0, marker: 1, overMinutes: 0, label: '' };
    }

    const over = elapsed - planned;
    if (over > 0) {
        // Aşımda çubuk dolu, plan işareti geriye kayıyor: ne kadar aştığı
        // işaretin nerede durduğundan okunuyor.
        return {
            progress: 1,
            marker: planned / elapsed,
            overMinutes: over,
            label: `${planned} dk plan`,
        };
    }
    return {
        progress: elapsed / planned,
        marker: 1,
        overMinutes: 0,
        label: `${planned} dk plan · ${planned - elapsed} dk kaldı`,
    };
}

/** "12:04" — bekleme sayacı dakika:saniye. */
export function mmss(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Bekleme sayacının kademesi. Ses ve bildirim yok; ekran tek güvence. */
export type WaitLevel = 'calm' | 'hot' | 'zero';

export function waitLevel(remainingSeconds: number): WaitLevel {
    if (remainingSeconds <= 0) return 'zero';
    // Son beş dakikada renk değişir, biçim değişmez: halkanın ölçüsü ve yeri
    // sabit kalır, hareket eden tek şey çevresindeki hat.
    return remainingSeconds <= 300 ? 'hot' : 'calm';
}

/** Komşu işin şeridi de aynı kademeleri kullanıyor — sesi kalan süreyle yükseliyor. */
export function neighbourLevel(remainingSeconds: number): WaitLevel {
    if (remainingSeconds <= 0) return 'zero';
    if (remainingSeconds <= 300) return 'hot';
    return remainingSeconds <= 900 ? 'calm' : 'calm';
}

/** Kadranın arkasındaki sıcak ışığın rengi — okumadan durum veriyor. */
export function glowTone(
    phase: VisitPhase,
    wait: WaitLevel | null,
): 'or' | 'am' | 'rd' {
    if (wait === 'zero' || wait === 'hot') return 'rd';
    if (wait === 'calm') return 'am';
    return phase === 'running' ? 'or' : 'or';
}
