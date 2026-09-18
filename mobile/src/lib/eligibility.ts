/**
 * Hizmet uygunluğu (kontrendikasyon) — telefonun kopyası. Saf, React'siz.
 *
 * Tek kaynak masaüstünde: `src/lib/serviceEligibility.ts`. Kurallar oradaki
 * sektör profilinden `settings.risk_rules`a yazılıyor (076 · syncSectorRules)
 * ve veritabanının kendi guard'ı da onları okuyor — yani telefon kuralı
 * UYDURMUYOR, masaüstünün yazdığını okuyor. Burada yalnız aynı iki karar var:
 * bayrak açık mı, hizmet bu bayrağın kapattığı gruba giriyor mu.
 *
 * Müdür 23 v2: kart "BU MÜŞTERİYE VERİLEMEZ" diyor, randevu ekranı aynı
 * hizmeti basılamaz yapıyor. Tek veri, iki yer, aynı kelime: kapalı. Ekran
 * atlansa bile son söz veritabanının (guard_reservation_eligibility).
 */

export interface EligibilityRule {
    key?: string;
    label?: string;
    note?: string | null;
    /** Kapattığı hizmet etiketleri: `lazer`, `medikal`… */
    blocks?: string[] | null;
    /** Etiketsiz eski hizmetler için ASCII desen kaynağı. */
    legacyNamePattern?: string | null;
}

export interface EligibilityTarget {
    name: string;
    tags?: readonly string[] | null;
}

export interface ActiveFlag {
    key: string;
    label: string;
    /** Tam cümle: "gebelikte uygulanmaz". Yoksa boş. */
    note: string;
    blocks: string[];
}

/** Masaüstüyle AYNI katlama — `/i` "İ"yi, `toLowerCase` "I"yı yanlış çeviriyor. */
export const foldTr = (s: string): string => s
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Checkbox `true`, metin alanı doluysa açık — masaüstünün `flagActive`i. */
function flagActive(fields: Record<string, unknown> | null | undefined, key: string): boolean {
    const raw = fields?.[key];
    if (raw === true) return true;
    if (typeof raw === 'string') return raw.trim().length > 0;
    return false;
}

/** Müşteride açık olan bayraklar, kural sırasıyla. */
export function activeFlags(
    rules: readonly EligibilityRule[],
    fields: Record<string, unknown> | null | undefined,
): ActiveFlag[] {
    return rules
        .filter((rule) => rule.key && flagActive(fields, rule.key))
        .map((rule) => ({
            key: String(rule.key),
            label: String(rule.label ?? '').trim() || 'Uyarı',
            note: String(rule.note ?? '').trim(),
            blocks: (rule.blocks ?? []).filter(Boolean),
        }));
}

function patternOf(rule: EligibilityRule): RegExp | null {
    if (!rule.legacyNamePattern) return null;
    try { return new RegExp(rule.legacyNamePattern); } catch { return null; }
}

/**
 * Bu hizmet bu müşteriye kapalı mı? Kapalıysa SEBEBİ: bayrağın adı ve notu.
 * Etiket varsa etikete, yoksa ada bakılıyor (masaüstünün `targetMatches`i).
 */
export function closedBy(
    rules: readonly EligibilityRule[],
    fields: Record<string, unknown> | null | undefined,
    target: EligibilityTarget,
): { label: string; note: string } | null {
    for (const rule of rules) {
        if (!rule.key || !flagActive(fields, rule.key)) continue;
        const tags = target.tags ?? [];
        const hit = tags.length > 0
            ? tags.some((tag) => (rule.blocks ?? []).includes(tag))
            : patternOf(rule)?.test(foldTr(target.name)) ?? false;
        if (hit) {
            return {
                label: String(rule.label ?? '').trim() || 'Uyarı',
                note: String(rule.note ?? '').trim(),
            };
        }
    }
    return null;
}

/** "Hamilelik · gebelikte uygulanmaz" — kapalı satırın altındaki sebep. */
export function closedReason(reason: { label: string; note: string }): string {
    return reason.note ? `${reason.label} · ${reason.note}` : reason.label;
}

/** Etiket → çip: `lazer` → "Lazer". Büyük harf Türkçe kuralıyla. */
export function blockLabel(tag: string): string {
    const clean = tag.trim().replace(/[_-]+/g, ' ');
    if (!clean) return '';
    return clean.charAt(0).toLocaleUpperCase('tr-TR') + clean.slice(1);
}
