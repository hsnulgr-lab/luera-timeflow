/**
 * Randevu kartının MÜŞTERİ KÜNYESİ — saf karar katmanı.
 *
 * `ApptInfo` bugüne kadar yalnız `mockDay` içinde elle yazılmıştı. Burada
 * gerçek satırlardan türüyor.
 *
 * ── Neden "hiç künye yok" ayrı bir cevap ────────────────────────────────────
 * `visitSummary` künye yoksa "Yeni müşteri · ilk ziyaret · geçmiş kayıt yok"
 * diye AYRI bir kart çiziyor. Bu bir eksiklik değil, bir bilgi. Ama boş bir
 * künye nesnesi dönersek o kart hiç çıkmaz ve müdür on yıllık müşterisini
 * "0. ziyaret" diye görür. O yüzden bilinmeyen `null`.
 */

import { formatDayMonth, type Appt, type ApptInfo } from './calendar.ts';
import { riskList } from './customerFileMap.ts';

export interface PackageRow {
    name: string;
    total_sessions: number;
    used_sessions: number;
}

export interface HistoryRow {
    date: string;
    service: string | null;
    status: string;
}

export interface RiskRule { key?: string; label?: string; note?: string | null }

/**
 * Gösterilecek paket.
 *
 * Birden çok paket olabiliyor (`customer_packages` müşteri başına çok satır).
 * HAKKI KALAN ilk paket seçiliyor — bitmiş bir paketi kartın kahraman
 * rakamına koymak, müdüre "8/8" diye tükenmiş bir şey göstermek olurdu.
 */
export function activePackage(packages: readonly PackageRow[]): PackageRow | null {
    return packages.find((pack) => pack.used_sessions < pack.total_sessions) ?? null;
}

/**
 * Bu randevudan ÖNCEKİ ziyaretler.
 *
 * İptal SAYILMIYOR: gelinmemiş bir randevu bir ziyaret değil. Aynı günün
 * kendisi de sayılmıyor — "bugün kaçıncı geliş" sorusunun cevabı bugünü
 * kapsamaz, yoksa müşteri her zaman bir fazla görünürdü.
 */
export function pastVisits(
    history: readonly HistoryRow[],
    beforeISO: string,
): HistoryRow[] {
    return history
        .filter((row) => row.status !== 'cancelled' && row.date < beforeISO)
        .sort((a, b) => b.date.localeCompare(a.date));
}

/** "12 Tem · Kesim" — hizmeti bilinmeyen ziyaret yalnız tarihini söyler. */
export function lastVisitLine(row: HistoryRow | undefined): string | null {
    if (!row) return null;
    const service = String(row.service ?? '').trim();
    return service ? `${formatDayMonth(row.date)} · ${service}` : formatDayMonth(row.date);
}

export interface InfoInput {
    riskRules: readonly RiskRule[];
    customFields: Record<string, unknown> | null | undefined;
    packages: readonly PackageRow[];
    history: readonly HistoryRow[];
    /** Künyesi kurulan randevunun günü. */
    dateISO: string;
}

/**
 * Künye.
 *
 * `balance` BİLEREK konmuyor. Bakiyenin tek doğruluk kaynağı masaüstündeki
 * `patientBalance.ts` ve kuralı dört maddelik: hangi plan borç sayılır, hangi
 * ödeme mahsup edilir, iptal plana yapılan ödeme ne olur, fazla tahsilat nasıl
 * gösterilir. O kuralı burada ikinci kez yazmak, aynı müşteri için iki farklı
 * rakam demekti — ve bu tam olarak o dosyanın var olma sebebi.
 *
 * Alan `undefined` kalınca `visitSummary` bakiye rozetini HİÇ çizmiyor;
 * "₺0" diye bir varsayım üretmiyor. Yani eksik bilgi yanlış bilgiye
 * dönüşmüyor.
 */
export function apptInfoOf(input: InfoInput): ApptInfo | null {
    const past = pastVisits(input.history, input.dateISO);
    const pack = activePackage(input.packages);
    const risks = riskList(input.riskRules, input.customFields);

    // Ne geçmiş var ne paket: bu gerçekten yeni bir müşteri ve kartın kendi
    // "Yeni müşteri" hâli var. Boş bir künye o hâli öldürürdü.
    if (past.length === 0 && !pack) return null;

    return {
        // Birden çok kural işliyorsa hepsi tek satırda: kart tek bir risk
        // cümlesi taşıyor, liste değil.
        risk: risks.length > 0 ? risks.map((line) => line.text).join(' · ') : null,
        pkg: pack
            ? { name: pack.name, used: pack.used_sessions, total: pack.total_sessions }
            : null,
        // Bu ziyaret KAÇINCI: geçmişin bir fazlası.
        visitNo: past.length + 1,
        lastVisit: lastVisitLine(past[0]),
    };
}

/** Künyeyi randevunun üstüne oturtur; randevunun kendisi değişmez. */
export function withInfo(appointment: Appt, info: ApptInfo | null): Appt {
    return { ...appointment, info };
}
