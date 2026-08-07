// Numaradan kişiyi çözme — hangi kaydın "o kişi" sayılacağı.
//
// Neden gerekli: customers'taki tekillik indeksi (072) HAM telefon metni
// üzerinde. "05468158380" ile "5468158380" Postgres için iki ayrı anahtar,
// aynı insan için iki kayıt. Canlıda bir numarada üç kayıt görüldü: ikisi
// "Geçici / Walk-in", biri gerçek ad.
//
// findCustomerByPhone varyantları .in() ile sorgulayıp .limit(1) diyordu —
// SIRALAMA YOK. Hangi satırın döneceği belirsizdi ve bot müşteriye
// "Merhaba Geçici!" diye yazdı.
//
// Saf modül: tests/wa-booking.test.mjs doğrudan import eder.

/**
 * Sistemin kendi ürettiği yer tutucu adlar. Bunlar isim DEĞİL; müşteriye
 * hitap ederken kullanılmamalı ve kayıt seçerken gerçek adın gerisinde
 * kalmalı.
 *
 * Desen ASCII yazılır ve ad katlanarak karşılaştırılır (Türkçe İ/ı).
 */
const PLACEHOLDER = /^(gecici|walk\s*-?\s*in|misafir|isimsiz|bilinmiyor|musteri|whatsapp\s*\d*)([\s/·,-]+.*)?$/;

function fold(s: string): string {
    return s
        .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/Ş/g, 's').replace(/ş/g, 's')
        .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
        .replace(/Ü/g, 'u').replace(/ü/g, 'u')
        .replace(/Ö/g, 'o').replace(/ö/g, 'o')
        .replace(/Ç/g, 'c').replace(/ç/g, 'c')
        .toLowerCase().trim();
}

/** Ad gerçek bir ad mı, yoksa sistemin doldurduğu bir yer tutucu mu? */
export function isPlaceholderName(name: string | null | undefined): boolean {
    const n = fold(String(name ?? ''));
    if (!n) return true;
    return PLACEHOLDER.test(n);
}

/**
 * Hitapta kullanılacak ilk ad. Yer tutucu ya da boşsa null döner — çağıran o
 * zaman "Merhaba!" der. "Merhaba Geçici!" demek, hiç ad kullanmamaktan kötü.
 */
export function greetingName(name: string | null | undefined): string | null {
    if (isPlaceholderName(name)) return null;
    const first = String(name).trim().split(/\s+/)[0];
    return first ? first.charAt(0).toLocaleUpperCase('tr') + first.slice(1) : null;
}

export interface CustomerRow {
    id: string;
    name: string | null;
    phone?: string | null;
    wa_opt_out?: boolean | null;
    is_active?: boolean | null;
    created_at?: string | null;
}

/**
 * Aynı numaraya birden çok kayıt düştüğünde hangisi "o kişi"?
 *
 * Sıra: aktif olan → gerçek adı olan → en eski (geçmişi en zengin olan).
 * Belirlenimci olması şart: aynı numara her seferinde aynı kayda düşmezse
 * müşteri bir gün adıyla, ertesi gün "Geçici" diye selamlanır.
 */
export function pickCustomer<T extends CustomerRow>(rows: T[]): T | null {
    if (!rows?.length) return null;
    const score = (r: T): number => {
        let s = 0;
        if (r.is_active !== false) s += 4;
        if (!isPlaceholderName(r.name)) s += 2;
        return s;
    };
    return [...rows].sort((a, b) => {
        const d = score(b) - score(a);
        if (d !== 0) return d;
        // Eşitlikte en eski kayıt: alt kayıtları (randevu, ödeme, paket) onda.
        const ta = Date.parse(a.created_at || '') || Number.MAX_SAFE_INTEGER;
        const tb = Date.parse(b.created_at || '') || Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return String(a.id).localeCompare(String(b.id));
    })[0];
}
