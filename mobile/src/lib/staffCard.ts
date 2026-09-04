/**
 * Personel 02 — sıra kartının karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Kaynak: `docs/personel-02-sira-kartlari.md` ve Claude Design'ın
 * "Luera Mobil - Personel 02 Sira Kartlari.html" çıktısı.
 *
 * Kartın dokuz hâli VAR OLAN damgalardan türer; çağıran hâl seçemez. Ekranın
 * hangi kartı nasıl çizeceğini burası söyler, bileşen yalnız çizer — aksi
 * hâlde "sürüyor" ile "uzadı" ayrımı üç ayrı dosyada üç kez yazılırdı.
 */

import { addDaysISO, toMinutes } from './calendar.ts';

export type StaffCardKind =
    | 'upcoming'    // 01 · gelecek randevu
    | 'waiting'     // 02 · kapıda
    | 'running'     // 03 · sürüyor
    | 'over'        // 04 · uzadı
    | 'late'        // 05 · gecikti
    | 'unbilled'    // 06 · bitti, adisyon gönderilmedi
    | 'atcash'      // 07 · bitti, kasaya gitti
    | 'paid'        // 08 · tahsil edildi
    | 'cancelled';  // 09 · iptal

/** Durum kelimesinin rengi. `tx` nötr: normal akış kendi rengini istemiyor. */
export type StaffCardTone = 'am' | 'rd' | 'gr' | 'tx';

/**
 * Karar için gereken en dar randevu. `api/staff.ts` içindeki `Appointment` bu
 * arayüzü karşılar; test bunun için sahte Supabase kaydı kurmak zorunda değil.
 */
export interface StaffCardSource {
    date: string;
    start_time: string;
    end_time: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    arrived_at: string | null;
    service_ended_at: string | null;
    adisyon_items: unknown[] | null;
    is_paid: boolean;
    /**
     * Müşteri KAPIDA. Sütun 043'ten beri veritabanında, `staff-api` uçlarına
     * 2026-09-02'de eklendi. Eski sürümden gelen kayıtlarda YOK sayılır.
     */
    customer_arrived_at?: string | null;
}

export interface StaffCardState {
    kind: StaffCardKind;
    /** Her hâl kendi kelimesini söyler; renk yalnız hızlandırıcı. */
    word: string | null;
    tone: StaffCardTone | null;
    /** Kelimenin yanındaki sayı taşıyan ek: "6 dk bekliyor", "7 dk aştı". */
    suffix: string | null;
    /** Geçen süre, mm:ss. Doluysa `duration` çizilmez — ikisi aynı anda yok. */
    counter: string | null;
    /** Planlanan süre, "45 dk". Sayaç varken null. */
    duration: string | null;
    /** 0 normal · 1 kasada · 2 kapanmış. Opaklık değil, dolgu + metin alfası. */
    dim: 0 | 1 | 2;
    /** İptalde adın üstündeki çizgi: renkten önce okunan işaret. */
    strike: boolean;
    /**
     * Eşik nabzının anahtarı. DEĞİŞTİĞİNDE kart bir kez vuruyor.
     *
     * Nabız süre değil EŞİK olayı: bekleyen müşteri 15 · 30 · 45 dakikayı
     * geçtiğinde bir kez. Sürekli nabız görülmez olur; 12 dakikalık gecikme
     * ile 90 dakikalık gecikme aynı görünür, fark 90 dakikalık olanın altı kez
     * vurmuş olmasıdır.
     *
     * Hareketi olmayan hâllerde `null`.
     */
    beatKey: string | null;
}

/** Eşik nabzı bu dakikada bir vuruyor: 15 · 30 · 45 … */
export const BEAT_MINUTES = 15;

/** "45 dk" · "1 sa 30 dk" — kartın en sessiz sayısı. */
export function formatDuration(minutes: number): string {
    const total = Math.max(0, Math.round(minutes));
    if (total < 60) return `${total} dk`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

/**
 * Geçen süre "66:12" — saate ÇEVRİLMEZ. Personel bir işlemin kaç dakikadır
 * sürdüğünü sayar; "1:06:12" aynı bilgiyi bir kademe yavaş okutur.
 */
export function formatCounter(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/** `YYYY-MM-DD` + `HH:MM` → yerel zaman damgası (ms). */
export function localStamp(dateISO: string, time: string): number {
    const [y, m, d] = dateISO.split('-').map(Number);
    const minutes = toMinutes(time);
    return new Date(y, (m ?? 1) - 1, d ?? 1, Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();
}

const parse = (stamp: string | null | undefined): number | null => {
    if (!stamp) return null;
    const ms = Date.parse(stamp);
    return Number.isFinite(ms) ? ms : null;
};

/**
 * Randevunun kart hâli.
 *
 * Sıra ÖNEMLİ ve tersine çevrilemez: kapanmış hâller (iptal, tahsil, kasa)
 * damgaların üstünde durur, çünkü tahsil edilmiş bir randevu aynı zamanda
 * "saati geçti, damga yok" testini de geçerdi ve GECİKTİ görünürdü.
 */
export function cardState(appointment: StaffCardSource, nowMs: number = Date.now()): StaffCardState {
    // Gece yarısını AŞAN randevu: bitiş saati başlangıçtan küçük görünür
    // (23:58 → 00:28 = 28 − 1438). Eskiden bu negatif fark sıfıra kırpılıyor
    // ve kart "0 dk" diye YALAN söylüyordu. Sıfır bir ölçümdür; burada ölçüm
    // sıfır değil, gün değişmiş.
    const span = toMinutes(appointment.end_time) - toMinutes(appointment.start_time);
    const planned = span < 0 ? span + 24 * 60 : span;
    const duration = formatDuration(planned);
    const base = { suffix: null, counter: null, duration, strike: false, beatKey: null } as const;

    if (appointment.status === 'cancelled') {
        return { ...base, kind: 'cancelled', word: 'İptal', tone: 'rd', dim: 2, strike: true };
    }

    if (appointment.is_paid) {
        return { ...base, kind: 'paid', word: 'Tahsil edildi', tone: 'gr', dim: 2 };
    }

    // Adisyon gönderilmiş ama tahsil edilmemiş: yeşil "benden çıktı" demek,
    // "ödendi" demek DEĞİL — tahsilat kasanın işi, kart bunu iddia etmiyor.
    if (appointment.adisyon_items != null && appointment.adisyon_items.length > 0) {
        return { ...base, kind: 'atcash', word: 'Kasada', tone: 'gr', dim: 1 };
    }

    const ended = parse(appointment.service_ended_at);
    if (ended != null) {
        // Bitmiş ama SÖNÜKLEŞMEYEN tek hâl: iş bitti, personelin işi bitmedi.
        // Sönükleşme "buna dönmene gerek yok" demektir; burada gerek var.
        return { ...base, kind: 'unbilled', word: 'Adisyon gönderilmedi', tone: 'am', dim: 0 };
    }

    const started = parse(appointment.arrived_at);
    if (started != null) {
        const elapsedSec = Math.max(0, (nowMs - started) / 1000);
        const overMin = Math.floor(elapsedSec / 60) - planned;
        const counter = formatCounter(elapsedSec);
        if (planned > 0 && overMin > 0) {
            return {
                kind: 'over',
                word: 'Uzadı',
                tone: 'rd',
                suffix: `${overMin} dk aştı`,
                counter,
                duration: null,
                dim: 0,
                strike: false,
                // Kartta zaten dönen halka var; bir kartta tek hareket olur.
                beatKey: null,
            };
        }
        return {
            kind: 'running',
            word: 'Sürüyor',
            tone: 'tx',
            // Planlanan süre sayacın yanında değil durum satırında: kıyaslanacak
            // şey o, ve sağ üstte iki sayı yan yana okunmuyor.
            suffix: planned > 0 ? `${planned} dk planlandı` : null,
            counter,
            duration: null,
            dim: 0,
            strike: false,
            beatKey: null,
        };
    }

    const arrived = parse(appointment.customer_arrived_at);
    if (arrived != null) {
        const waited = Math.max(0, Math.floor((nowMs - arrived) / 60000));
        return {
            ...base,
            kind: 'waiting',
            word: 'Kapıda',
            tone: 'am',
            // Dakika büyüdükçe kelime aynı kalır, sayı baskı yapar.
            suffix: `${waited} dk bekliyor`,
            dim: 0,
            beatKey: `w${Math.floor(waited / BEAT_MINUTES)}`,
        };
    }

    const startMs = localStamp(appointment.date, appointment.start_time);
    const lateMin = Math.floor((nowMs - startMs) / 60000);
    if (lateMin > 0) {
        return {
            ...base,
            kind: 'late',
            word: 'Gecikti',
            tone: 'rd',
            suffix: `${lateMin} dk`,
            dim: 0,
            beatKey: `l${Math.floor(lateMin / BEAT_MINUTES)}`,
        };
    }

    // 01 · Durum satırı yok, işaret yok: kart iki satır. Listenin nefesi
    // buradan geliyor, çünkü günün çoğu kartı bu hâlde.
    return { ...base, kind: 'upcoming', word: null, tone: null, dim: 0 };
}

/** Şimdi çizgisi hangi karttan SONRA gelir; hiçbiri değilse -1. */
export function nowLineAfter(
    appointments: readonly { date: string; start_time: string }[],
    nowMs: number = Date.now(),
): number {
    let index = -1;
    for (let i = 0; i < appointments.length; i += 1) {
        const item = appointments[i];
        if (localStamp(item.date, item.start_time) <= nowMs) index = i;
    }
    return index;
}

/**
 * Gün şeridinin yedi günü: bugünün ETRAFINDA, pazartesi başlangıçlı takvim
 * haftası DEĞİL.
 *
 * Fark önemli: pazar günü açılan pazartesi başlangıçlı bir şeritte bugün en
 * sağda durur ve personel yarını göremez. Merkezli pencerede önünde her zaman
 * üç gün var.
 */
export function stripDays(todayISO: string): string[] {
    return [-3, -2, -1, 0, 1, 2, 3].map((offset) => addDaysISO(todayISO, offset));
}
