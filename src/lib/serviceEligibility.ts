// Göreli + uzantılı import: bu modül node ile doğrudan test edilir ve orada
// '@/' alias'ı çözülmez (aynı desen: lib/appointmentFlow.ts).
import { profileForSector, type RiskFlag } from './sectorProfiles.ts';

// ── Hizmet uygunluğu (kontrendikasyon) — TEK KAYNAK ──────────────────────────
// "Bu müşteriye bu işlem uygulanabilir mi?" sorusunun tek cevap yeri. Randevu
// oluşturan, düzenleyen ve paket satan BÜTÜN yüzeyler buradan geçer.
//
// Daha önce kural yalnız BeautySessionModal'daki bir regex'ti; takvim, mobil
// oluşturucu, düzenleme modalları ve paket satışı aynı müşteriye aynı işlemi
// serbestçe seçtiriyordu. Üstelik ikinci bir kopyası (BeautyCustomerPage) farklı
// bir regex kullandığı için aynı paket bir ekranda kapalı, diğerinde açıktı.
//
// Bu modül SAFTIR — React'a, Supabase'e ve DOM'a bağlı değildir; node ile
// doğrudan test edilir (bkz. tests/service-eligibility.test.mjs).

/** Uygunluk sorgusu için gereken en az müşteri bilgisi. */
export interface EligibilitySubject {
    customFields?: Record<string, unknown> | null;
}

/** Hizmet ya da paket — ikisi de ad taşır, hizmetin ayrıca etiketi olur. */
export interface EligibilityTarget {
    name: string;
    tags?: string[];
}

export interface EligibilityVerdict {
    blocked: boolean;
    /** Kısa rozet metni: "Hamilelik". Bloklu değilse undefined. */
    reason?: string;
    /** Kullanıcıya gösterilecek tam cümle: "Hamilelik — gebelikte uygulanmaz". */
    message?: string;
}

const OK: EligibilityVerdict = { blocked: false };

/** Müşteride bu bayrak aktif mi? Checkbox `true`, metin alanı doluysa aktif sayılır. */
function flagActive(subject: EligibilitySubject | null | undefined, flag: RiskFlag): boolean {
    const raw = subject?.customFields?.[flag.key];
    if (raw === true) return true;
    if (typeof raw === 'string') return raw.trim().length > 0;
    return false;
}

/**
 * Türkçe duyarlı ad katlaması — eşleşme öncesi ASCII'ye indirger.
 * Gerekçe: JS'te /i bayrağı "İ" (U+0130) harfini ASCII "i" ile eşleştirmez, ve
 * `toLowerCase()` "I" harfini Türkçede "ı" yapmaz. İkisi de sessizce yanlış
 * sonuç verir: "Bölgesel İncelme" ya da "ZAYIFLAMA" gibi tamamen olağan hizmet
 * adları kontrendikasyon kontrolünden kaçardı.
 */
export const foldTr = (s: string): string => s
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Hizmet bu bayrağın kapattığı gruba giriyor mu? Etiket varsa etikete, yoksa ada bakılır. */
function targetMatches(target: EligibilityTarget, flag: RiskFlag): boolean {
    const tags = target.tags ?? [];
    if (tags.length > 0) return tags.some((t) => flag.blocks.includes(t));
    // Etiketsiz (eski) kayıt — geriye dönük ad eşleşmesi. Tek kaynak: profil.
    return flag.legacyNamePattern?.test(foldTr(target.name)) ?? false;
}

/**
 * Bir hizmet/paket bu müşteriye uygulanabilir mi?
 * Sektörün riskFlags listesi boşsa her şey serbesttir (kuaför, berber…).
 */
export function evaluateEligibility(
    subject: EligibilitySubject | null | undefined,
    target: EligibilityTarget | null | undefined,
    sector?: string | null,
): EligibilityVerdict {
    if (!target) return OK;
    const flags = profileForSector(sector).riskFlags;
    if (!flags?.length) return OK;

    for (const flag of flags) {
        if (!flagActive(subject, flag)) continue;
        if (!targetMatches(target, flag)) continue;
        return {
            blocked: true,
            reason: flag.label,
            message: flag.note ? `${flag.label} — ${flag.note}` : flag.label,
        };
    }
    return OK;
}

/** Kısa yol: yalnız "kapalı mı" sorusu. */
export const isBlockedFor = (
    subject: EligibilitySubject | null | undefined,
    target: EligibilityTarget | null | undefined,
    sector?: string | null,
): boolean => evaluateEligibility(subject, target, sector).blocked;

/**
 * Çok hizmetli seansta ilk engel. Tek seansta birden çok işlem seçilebildiği
 * için (kaş + cilt bakımı) kaydetmeden önce hepsi kontrol edilmeli.
 */
export function firstBlocked(
    subject: EligibilitySubject | null | undefined,
    targets: EligibilityTarget[],
    sector?: string | null,
): { target: EligibilityTarget; verdict: EligibilityVerdict } | null {
    for (const target of targets) {
        const verdict = evaluateEligibility(subject, target, sector);
        if (verdict.blocked) return { target, verdict };
    }
    return null;
}

/**
 * Sektörde anlamı olan uygunluk etiketleri — Ayarlar'daki hizmet etiketi
 * seçenekleri buradan üretilir. Sektörün kuralları hangi etiketleri
 * kapatıyorsa, işletmenin seçebileceği etiketler de onlardır; ikinci bir
 * elle yazılmış liste tutulmaz. Boş dönerse o sektörde etiket UI'ı gizlenir.
 */
export function eligibilityTagsFor(sector?: string | null): string[] {
    const flags = profileForSector(sector).riskFlags ?? [];
    return [...new Set(flags.flatMap((f) => f.blocks))];
}

/** Müşterinin aktif risk bayrakları — uyarı şeritlerinde listelenir. */
export function activeRiskFlags(
    subject: EligibilitySubject | null | undefined,
    sector?: string | null,
): RiskFlag[] {
    return (profileForSector(sector).riskFlags ?? []).filter((flag) => flagActive(subject, flag));
}
