/**
 * TÜRKÇE TUTAR ALANI — tek ayrıştırıcı, tek biçimleyici. Saf.
 *
 * ── Kusur (2026-11-12 · Paket C, madde 3) ───────────────────────────────────
 * Üç alan (`cash.parseAmount`, `managerProfile.parsePrice`,
 * `planPayment.parsePlanAmount`) rakam dışı HER ŞEYİ siliyordu; taslak ise
 * `String(149.5)` = "149.5" ile kuruluyordu. Sonuç: ₺149,50'lik tahsilatta
 * yalnız yöntemi değiştirip Kaydet'e basmak ₺1.495 yazıyordu; ₺149,90'lık
 * hizmetin yalnız adını değiştirmek fiyatı 1499 yapıyordu.
 *
 * ── Kural ───────────────────────────────────────────────────────────────────
 *   • `,` ve `.` ikisi de ondalık olabilir; en çok 2 hane.
 *   • İkisi birlikteyse SONDAKİ ondalık, öteki binlik ("1.495,50").
 *   • Yalnız `.` var ve ardından tam üçlü gruplar geliyorsa binlik
 *     ("1.495", "1.234.567"). "149.50" ondalık.
 *   • Yalnız `,` varsa ondalık (Türkçe). Ardından 3+ hane → anlaşılmıyor,
 *     `null` (alan geçersiz, düğme kapalı — tahmin edip 10× yazmaktan iyi).
 *   • ₺, boşluk, "TL" gibi rakam dışı işaretler atılıyor.
 *   • Boş → `null`. "0" → 0 (sıfırın geçerli olup olmadığına çağıran karar
 *     veriyor: hizmet fiyatı 0 olabilir, tahsilat olamaz).
 */

export function parseTRAmount(text: string): number | null {
    const raw = String(text ?? '').replace(/[^\d.,]/g, '');
    if (!/\d/.test(raw)) return null;

    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    let whole: string;
    let fraction = '';

    if (lastComma >= 0 && lastDot >= 0) {
        const decimalAt = Math.max(lastComma, lastDot);
        const other = decimalAt === lastComma ? '.' : ',';
        const head = raw.slice(0, decimalAt);
        // Ondalık işareti baştaki kısımda bir daha geçemez.
        if (head.includes(raw[decimalAt])) return null;
        whole = head.split(other).join('');
        fraction = raw.slice(decimalAt + 1);
    } else if (lastComma >= 0) {
        if (raw.indexOf(',') !== lastComma) return null;
        whole = raw.slice(0, lastComma);
        fraction = raw.slice(lastComma + 1);
    } else if (lastDot >= 0) {
        if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
            whole = raw.split('.').join('');
        } else {
            if (raw.indexOf('.') !== lastDot) return null;
            whole = raw.slice(0, lastDot);
            fraction = raw.slice(lastDot + 1);
        }
    } else {
        whole = raw;
    }

    if (fraction.length > 2) return null;
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null;
    if (!whole && !fraction) return null;
    const value = Number(`${whole || '0'}.${fraction || '0'}`);
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
}

/**
 * Taslağın metni — `parseTRAmount`un eşleniği: geri okununca AYNI sayı.
 * Tam sayıda kuruş yazılmıyor ("1495"); kuruşlu tutar iki haneli ("149,50").
 * Binlik ayırıcı KONMUYOR: düzenlenen alanda nokta kafa karıştırır.
 */
export function formatTRAmountDraft(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '';
    const cents = Math.round(value * 100);
    if (cents % 100 === 0) return String(cents / 100);
    return (cents / 100).toFixed(2).replace('.', ',');
}

/** İki tutar kuruş toleransıyla aynı mı? (`149.5` ile `149.499999` aynı.) */
export function sameAmount(a: number | null | undefined, b: number | null | undefined): boolean {
    if (a == null || b == null) return a == b;
    return Math.abs(a - b) < 0.005;
}
