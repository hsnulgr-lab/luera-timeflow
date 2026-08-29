// Telefon normalizasyonu — mobilin TEK KAYNAĞI.
//
// `src/lib/phone.ts`nin (masaüstü) birebir aynası. İki taraf ayrı duruyor
// çünkü mobil web kaynağından import edemez; birini değiştirirken ötekini de
// değiştir. Üçüncü kopya `supabase/functions/_shared/phone.ts` içinde.
//
// Neden gerekli: numaralar veritabanına "0532 111 22 33", "+90 532…", "532…"
// gibi birbirinden farklı biçimlerde giriliyor. Mobilde bugüne kadar
// normalizasyon HİÇ yoktu — `(staff-flow)/customer.tsx` wa.me linkini ham
// rakamlardan kuruyordu. Sahte veri E.164 olduğu için görünmüyordu; gerçek
// veride 0'la başlayan kayıtlara mesaj gitmezdi.
//
// SAF KATMAN: React, react-native ve Expo import edilmez.

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
        n = CC + n.slice(1);
    } else if (n.length === 10 && n.startsWith('5')) {
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

/** Yazılabilir bir numara mı? Gözü çizmeden ÖNCE sorulur. */
export function hasWa(raw?: string | null): boolean {
    return normalizePhone(raw) !== null;
}

/**
 * Aranabilir numara — `tel:` için.
 *
 * `hasWa`den ayrı tutuluyor çünkü ikisi aynı şey değil: yurt dışı bir numara
 * aranabilir ama WhatsApp'a normalize edilemeyebilir. Bugün ikisi de aynı
 * kontrolden geçiyor; ayrı fonksiyon olması, ayrıldıkları gün çağıranların
 * değişmemesi için.
 */
export function dialable(raw?: string | null): string | null {
    const n = normalizePhone(raw);
    return n ? `+${n}` : null;
}

/** wa.me bağlantısı — isteğe bağlı hazır metinle. Numara geçersizse null. */
export function waLink(raw?: string | null, text?: string): string | null {
    const n = normalizePhone(raw);
    if (!n) return null;
    return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
