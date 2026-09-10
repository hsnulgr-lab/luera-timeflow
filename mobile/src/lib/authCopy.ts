/**
 * Giriş ekranlarının React'ten bağımsız durum metinleri.
 *
 * Kimlik doğrulama sonucu sunucudan ya da geçici stub'dan gelir; ekranlar bu
 * dosyadaki saf fonksiyonlarla yalnız kullanıcıya gösterilecek metni üretir.
 */

export type AuthKind = 'manager' | 'staff';

function nonNegativeInteger(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

/** Yanlış e-posta ile yanlış şifreyi birbirinden ayırmadan güvenli hata metni üretir. */
export function remainingAttemptText(
    kind: AuthKind,
    remainingAttempts: number,
    lockMinutes = 15,
): string {
    const remaining = nonNegativeInteger(remainingAttempts);
    const minutes = nonNegativeInteger(lockMinutes);

    if (kind === 'manager') {
        return `E-posta ve şifre eşleşmedi. ${remaining} denemeniz kaldı; sonra hesap ${minutes} dakika kapanır.`;
    }

    return `Şifre yanlış. ${remaining} denemeniz kaldı. Üç kere yanlış girilirse bu telefon ${minutes} dakika kilitlenir ve işletme sahibine haber gider.`;
}

/** Kilitli düğmenin içinde gösterilecek, yukarı yuvarlanmış dakika:saniye sayacı. */
export function lockCountdownText(secondsRemaining: number): string {
    const seconds = Number.isFinite(secondsRemaining)
        ? Math.max(0, Math.ceil(secondsRemaining))
        : 0;
    if (seconds === 0) return 'Yeniden dene';

    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `Yeniden dene · ${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * Bağlantısızlık girişte tam ekrandır, bant değil.
 *
 * Uygulamanın içinde ince bir amber bant yeter çünkü iş devam eder: personel
 * çevrimdışıyken de adisyon yazar, yazdığı sıraya girer. Girişte iş devam
 * ETMEZ — kimliği yalnız sunucu doğrulayabilir. Yarım açık bir form bırakmak,
 * denenebilirmiş gibi göstermek olurdu.
 */
export const offlineGate = {
    title: 'İnternet bağlantısı\ngörünmüyor',
    body: 'Girişi bağlantısız yapamıyoruz. Wi-Fi veya mobil veriyi açıp tekrar deneyin — yazdıklarınız kaybolmadı.',
    action: 'Tekrar dene',
} as const;

/**
 * Oturum OKUNAMADI — "oturum yok" değil.
 *
 * İkisi ayrı şeydir ve ayrı metin ister: oturumu olmayan kullanıcı girişe
 * gider, oturumu okunamayan kullanıcı bir daha denemelidir. Bağlantı metnini
 * ödünç almak yanlış olurdu — sorun internette değil, cihazın kendisinde.
 */
export const sessionGate = {
    title: 'Oturum bilgisi\nokunamadı',
    body: 'Kim olduğunuzu cihazdan okuyamadık. Bu genelde geçicidir — tekrar deneyin. Sürerse çıkış yapıp yeniden girin.',
    action: 'Tekrar dene',
} as const;

/**
 * Giriş 15c. "Eşleşmedi" ile "süresi doldu" bilerek AYRI metinlerdir.
 *
 * Birincisi kullanıcının düzeltebileceği bir yazım hatası — aynı ekranda kalır.
 * İkincisi başkasından bir şey istemeyi gerektirir. Aynı metni vermek,
 * kullanıcıyı aynı kodu üç kez yazmaya iterdi.
 */
export const expiredPairCode = {
    title: 'Bu kodun\nsüresi doldu',
    body: 'Kodlar 10 dakika geçerli. İşletme sahibi bilgisayardaki Luera ekranından yeni bir kod üretebilir; yeni kodu alınca buraya yazın.',
    ownerStatus: 'Kodu o üretir',
    retype: 'Yeni kodu yaz',
    call: 'İşletme sahibini ara',
} as const;

/**
 * Giriş 15d ve 15e. İki varyant, iki farklı sorumluluk.
 *
 * Müdür ödeyebilir, personel ödeyemez — bu yüzden metin ve eylemler ayrı.
 * Personele "yetkiniz yok" DENMEZ: sebep yazılır ve yapabileceği tek somut
 * şey verilir.
 *
 * Hiçbir varyantta fiyat, plan ya da ödeme butonu YOK. Abonelik uygulama
 * dışında satılıyor; App Store kuralı 3.1.1 uygulama içinden satın almaya
 * yönlendirmeye izin vermiyor.
 */
export const subscriptionLocked = {
    manager: {
        title: 'Aboneliğiniz bitti',
        body: 'Uygulama şu an randevu göstermiyor ve yeni randevu almıyor. Randevularınız ve müşteri bilgileriniz olduğu gibi duruyor.',
        cardLabel: 'Yenileme bilgisayardan yapılır',
        cardBody: 'Bilgisayarınızda Luera’yı açın ve hesabınıza girin. Aboneliğinizi orada yenileyebilirsiniz; yenilendikten sonra uygulama kendiliğinden açılır.',
        retention: 'Bilgileriniz 90 gün saklanır. Bu süre içinde yenilerseniz hiçbir şey kaybolmaz.',
        retry: 'Yeniledim, tekrar dene',
        signOut: 'Oturumu kapat',
    },
    staff: {
        title: 'Uygulama şu an\nkullanılamıyor',
        body: 'İşletmenin Luera aboneliği bitti. Bu bir hata değil ve sizinle ilgili değil — işletme sahibi yeniledikten sonra uygulama kendiliğinden açılır.',
        ownerStatus: 'Bilgilendirildi',
        call: 'İşletme sahibini ara',
        retry: 'Tekrar dene',
    },
} as const;

function turkishList(values: readonly string[]): string {
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]} ve ${values[1]}`;
    return `${values.slice(0, -1).join(', ')} ve ${values.at(-1)}`;
}

function genitiveSuffix(value: string): string {
    const lower = value.toLocaleLowerCase('tr-TR');
    const lastVowel = Array.from(lower).reverse().find((char) => 'aeıioöuü'.includes(char));
    const vowel = lastVowel && 'ei'.includes(lastVowel)
        ? 'i'
        : lastVowel && 'ou'.includes(lastVowel)
            ? 'u'
            : lastVowel && 'öü'.includes(lastVowel)
                ? 'ü'
                : 'ı';
    const endsWithVowel = /[aeıioöuü]$/u.test(lower);
    return `’${endsWithVowel ? 'n' : ''}${vowel}n`;
}

/** Hesap silme diyaloğunun veri, personel, yasal kayıt ve süre maddeleri. */
export function accountDeletionItems(businessNames: readonly string[]): string[] {
    const names = businessNames.map((name) => name.trim()).filter(Boolean);
    const scope = names.length === 0
        ? 'İşletmelerinizin'
        : `${turkishList(names)}${genitiveSuffix(names.at(-1) ?? '')}`;

    return [
        `${scope} tüm randevuları ve müşteri bilgileri silinir.`,
        'Personelinizin telefon bağlantıları kesilir; uygulamaya giremezler.',
        'Yasal olarak tutmamız gereken satış kayıtları 10 yıl saklanır, adınıza bağlı kalmaz.',
        'Silme 30 gün içinde tamamlanır. Bu süre içinde girerseniz işlem durur.',
    ];
}
