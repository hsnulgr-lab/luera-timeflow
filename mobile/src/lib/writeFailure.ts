/**
 * GÖNDERİLEMEYEN YAZMALAR — saf karar ve dil katmanı.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * `flushQueue` kalıcı olarak reddedilen işi kuyruktan ATIYOR ve çağırana
 * `dropped` listesiyle bildiriyordu. Tek çağıran `backgroundSync` ve o listeyi
 * HİÇ OKUMUYORDU:
 *
 *     await flushQueue();        // sonuç yere düşüyor
 *
 * Sonuç şuydu: personel uçak modunda adisyonu gönderiyor, "Sırada" yazısını
 * görüyor, sinyal gelince kuyruk sayacı 3'ten 0'a iniyor ve her şey gitmiş
 * gibi duruyor. Oysa iş silinmişti. Çevrimdışı bandı ve kuyruk sayacı yalnız
 * BEKLEYEN işi gösteriyor; atılan iş artık beklemiyor, yani hiçbir yerde
 * görünmüyor.
 *
 * Kaybı söylemek kötü haberdir; kaybı söylememek yalandır.
 *
 * Saf: React yok, react-native yok, AsyncStorage yok.
 */

export interface WriteFailure {
    /** Kuyruk işinin idempotens anahtarı — aynı iş iki kez listelenmesin. */
    key: string;
    action: string;
    /** Sunucunun kodu ya da `network`. */
    error: string;
    at: number;
    /** Hangi ziyaret — personelin gideceği yer. Bilinmiyorsa null. */
    reservationId: string | null;
}

/**
 * Listenin tavanı.
 *
 * Dolarsa ESKİLER düşüyor: yeni kayıp, eskisinden daha eyleme çevrilebilir —
 * personel bugünkü adisyonu yeniden girebilir, üç hafta öncekini giremez.
 * Sessizce kırpılmıyor, sayı ekranda duruyor.
 */
export const FAILURE_LIMIT = 20;

/** Kayıtları birleştirir: aynı anahtar iki kez girmiyor, en yeni başta. */
export function mergeFailures(
    existing: readonly WriteFailure[],
    incoming: readonly WriteFailure[],
): WriteFailure[] {
    const seen = new Set(incoming.map((item) => item.key));
    const merged = [
        ...incoming,
        ...existing.filter((item) => !seen.has(item.key)),
    ];
    merged.sort((a, b) => b.at - a.at);
    return merged.slice(0, FAILURE_LIMIT);
}

/**
 * NE kaybedildi.
 *
 * Eylem adı değil, personelin kaybettiği ŞEY yazılıyor: `visit.items` bir
 * kavram değil, "adisyon kalemleri" bir kayıp.
 */
export function lostThing(action: string): string {
    switch (action) {
        case 'visit.items': return 'Adisyon kalemleri';
        case 'visit.finish': return 'Kasaya gönderme';
        case 'visit.formula': return 'Formül';
        case 'visit.start': return 'İşleme başlama damgası';
        default: return 'Bir işlem';
    }
}

/**
 * NEDEN gitmedi.
 *
 * Bilinmeyen kod SEBEP UYDURMUYOR. "Kabul edilmedi" az şey söylüyor ama
 * yanlış bir şey söylemiyor; personeli olmayan bir sorunu çözmeye göndermek
 * kaybın kendisinden daha çok zaman yakar.
 *
 * "Sunucu" demiyor: tur teknik sözlüğü yasaklıyor ve zaten personelin
 * yapabileceği bir şey değil.
 */
export function failureReason(code: string): string {
    switch (code) {
        case 'items_stale': return 'adisyon başka bir cihazda değişmişti';
        case 'forbidden': return 'bu ziyarete yazma yetkiniz yok';
        case 'not_found': return 'randevu bulunamadı';
        case 'reservation_cancelled': return 'randevu iptal edilmiş';
        case 'formula_locked': return 'ziyaret kasaya gitmişti';
        case 'already_open': return 'adisyon kasada zaten açıktı';
        case 'idempotency_key_reused': return 'aynı iş başka bir işlemle çakıştı';
        case 'no_session': return 'oturum kapanmıştı';
        default: return 'kabul edilmedi';
    }
}

/** Tek satırın tam cümlesi: ne, neden. */
export function failureLine(failure: WriteFailure): string {
    return `${lostThing(failure.action)} gitmedi · ${failureReason(failure.error)}`;
}

/**
 * Başlığın sayısı GERÇEK sayı.
 *
 * "Bazı işlemler" demek, üç kaybı bir kayıp gibi okutur. Personel kaç
 * adisyonu yeniden gireceğini bilmek zorunda.
 *
 * KELİME: "kayıt" DEĞİL "işlem". Tur teknik sözlüğü açıkça yasaklıyor
 * (`Durumlar.html` · Ortak kurallar: "senkronize", "kayıt", "sunucu",
 * "hata kodu") ve burada ilk yazımda tam o kelime kullanılmıştı. Turun kendi
 * dili de "işlem": "İşleminiz kaybolmadı, telefonda duruyor."
 */
export function failureTitle(count: number): string {
    return count === 1 ? 'Bir işlem gönderilemedi' : `${count} işlem gönderilemedi`;
}

/**
 * Ne YAPILACAĞI — yalnız yapılabilecek bir şey varsa.
 *
 * Adisyon kalemi yeniden girilebilir; iptal edilmiş bir randevuya yazmanın
 * yolu yok ve orada eylem cümlesi kurmak boş bir umut olurdu.
 */
export function failureAdvice(items: readonly WriteFailure[]): string | null {
    if (items.some((item) => item.action === 'visit.items' || item.action === 'visit.finish')) {
        return 'Adisyonu açıp kalemleri yeniden girin.';
    }
    if (items.some((item) => item.action === 'visit.formula')) {
        return 'Formülü ziyaretten yeniden yazabilirsiniz.';
    }
    return null;
}
