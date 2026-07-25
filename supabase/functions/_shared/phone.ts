// Telefon normalizasyonu — src/lib/phone.ts'in birebir kopyası.
// Edge function'lar src/'den import edemediği için iki taraf ayrı duruyor;
// birini değiştirirken diğerini de değiştir.

const CC = '90'; // Türkiye

/**
 * Numarayı WhatsApp'ın beklediği biçime çevirir: 90XXXXXXXXXX (12 hane).
 * Çevrilemiyorsa null döner.
 */
export function normalizePhone(raw?: string | null): string | null {
    const d = (raw || '').replace(/\D/g, '');
    if (!d) return null;

    let n = d.startsWith('00') ? d.slice(2) : d;

    if (n.length === 12 && n.startsWith(CC)) {
        // zaten doğru
    } else if (n.length === 11 && n.startsWith('0')) {
        n = CC + n.slice(1);
    } else if (n.length === 10 && n.startsWith('5')) {
        n = CC + n;
    } else {
        if (n.length >= 11 && n.length <= 15 && !n.startsWith('0')) return n;
        return null;
    }

    if (n.length !== 12 || n[2] !== '5') return null;
    return n;
}

export function hasWa(raw?: string | null): boolean {
    return normalizePhone(raw) !== null;
}
