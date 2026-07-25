// Telefon normalizasyonu — TEK KAYNAK.
//
// Neden var: numaralar veritabanına "0532 111 22 33", "+90 532…", "532…",
// "5321112233" gibi birbirinden farklı biçimlerde giriliyor. wa.me linkleri her
// dosyada kendi kopyasıyla normalize ediyordu; Evolution'a giden gönderim yolunda
// ise hiç normalizasyon yoktu — 0'la başlayan kayıtlara mesaj gitmiyordu.
//
// Bu dosyanın birebir kopyası supabase/functions/_shared/phone.ts içinde;
// edge function'lar src/'den import edemediği için iki taraf ayrı duruyor.
// Birini değiştirirken diğerini de değiştir.

const CC = '90'; // Türkiye

/**
 * Numarayı WhatsApp'ın beklediği biçime çevirir: 90XXXXXXXXXX (12 hane).
 * Çevrilemiyorsa null döner — çağıran taraf "yazılabilir numara değil" der.
 */
export function normalizePhone(raw?: string | null): string | null {
    const d = (raw || '').replace(/\D/g, '');
    if (!d) return null;

    // 00 90 532… → 90532…
    let n = d.startsWith('00') ? d.slice(2) : d;

    if (n.length === 12 && n.startsWith(CC)) {
        // 90 5XX XXX XX XX — zaten doğru
    } else if (n.length === 11 && n.startsWith('0')) {
        // 0 5XX XXX XX XX
        n = CC + n.slice(1);
    } else if (n.length === 10 && n.startsWith('5')) {
        // 5XX XXX XX XX
        n = CC + n;
    } else {
        // 13+ hane (yurt dışı) olduğu gibi kabul edilir; gerisi geçersiz.
        if (n.length >= 11 && n.length <= 15 && !n.startsWith('0')) return n;
        return null;
    }

    // 90'dan sonrası cep için 5 ile başlamalı
    if (n.length !== 12 || n[2] !== '5') return null;
    return n;
}

/** WhatsApp yazılabilir bir numara mı? (ikon/buton göstermeden önce) */
export function hasWa(raw?: string | null): boolean {
    return normalizePhone(raw) !== null;
}

/** wa.me bağlantısı — isteğe bağlı hazır metinle. Numara geçersizse null. */
export function waLink(raw?: string | null, text?: string): string | null {
    const n = normalizePhone(raw);
    if (!n) return null;
    return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
