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

/**
 * Yanlış e-posta ile yanlış şifreyi birbirinden ayırmadan güvenli hata metni üretir.
 *
 * ── Sayı BİLİNMİYORSA yazılmıyor ────────────────────────────────────────────
 * `remainingAttempts` artık `null` olabiliyor ve bu "sıfır" DEĞİL. Müdür
 * yolunda kimliği doğrulayan katman kalan deneme diye bir şey bildirmiyor;
 * ekran `?? 0` yazdığı için ilk yanlış şifrede "0 denemeniz kaldı; sonra hesap
 * kapanır" diyordu. Hesap kapanmıyordu — uydurulmuş bir sayı, uydurulmuş bir
 * tehdit üretiyordu.
 *
 * Personel yolunda sayı GERÇEK: sunucu yanlış PIN'de kalan hakkı gönderiyor ve
 * kimlik katmanı onu taşıyor.
 *
 * ── Eşik sayısı da yazılmıyor ───────────────────────────────────────────────
 * Metin "Üç kere yanlış girilirse" diyordu. Sunucudaki sınır BEŞ
 * (`PIN_MAX_ATTEMPTS`); üç, yalnız sahte katmanın sayısıydı. Canlıya geçince
 * cümle yanlış oldu, o yüzden sabit sayı kalktı.
 *
 * "İşletme sahibine haber gider" cümlesi de kalktı: kilitlenme bir denetim
 * satırı yazıyor, kimseye haber GİTMİYOR. Verilmeyen bir söz, eksik bilgiden
 * kötü.
 */
export function remainingAttemptText(
    kind: AuthKind,
    remainingAttempts: number | null,
    lockMinutes = 15,
): string {
    const minutes = nonNegativeInteger(lockMinutes);
    const known = typeof remainingAttempts === 'number' && Number.isFinite(remainingAttempts);
    const remaining = known ? nonNegativeInteger(remainingAttempts as number) : null;

    if (kind === 'manager') {
        return remaining === null
            ? `E-posta ve şifre eşleşmedi. Üst üste yanlış denemeden sonra hesap ${minutes} dakika kapanır.`
            : `E-posta ve şifre eşleşmedi. ${remaining} denemeniz kaldı; sonra hesap ${minutes} dakika kapanır.`;
    }

    return remaining === null
        ? `Şifre yanlış. Üst üste yanlış denemeden sonra şifre girişi ${minutes} dakika kilitlenir.`
        : `Şifre yanlış. ${remaining} denemeniz kaldı; sonra şifre girişi ${minutes} dakika kilitlenir.`;
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
 * Uygulamanın İÇİNDE beklenmedik bir hata — kök `ErrorBoundary`.
 *
 * Bağlantı ve oturum ekranlarından AYRI metin: sorun ne internette ne
 * cihazda, uygulamanın kendisinde. Kullanıcıyı suçlamıyor ve veriyi tehdit
 * etmiyor — sunucuya yazılmış hiçbir şey bu ekran yüzünden kaybolmaz,
 * gönderilemeyenler kuyruğu da cihazda durur.
 */
export const crashGate = {
    title: 'Bir şey ters\ngitti',
    body: 'Bu ekranı açarken beklenmedik bir hata oldu. Kayıtlı bilgileriniz yerinde — tekrar deneyin.',
    action: 'Tekrar dene',
} as const;

/**
 * E-postayla şifre sıfırlama AÇIK MI.
 *
 * Sunucuda SMTP yok (2026-09-25): kurtarma bağlantısı hiç gitmiyordu ama
 * ekran "Bağlantıyı gönderdik" diyordu. Şifresini unutan kişi bir daha
 * giremezdi ve bunu bilmezdi. SMTP kurulup bir e-posta gerçekten ulaştığında
 * `true` yapılır; form ve "gönderdik" ekranı olduğu gibi geri gelir.
 */
export const EMAIL_RECOVERY_READY = false;

/** Sıfırlama e-postası gidemezken kurtarma ekranının dürüst hâli. */
export const recoveryUnavailable = {
    title: 'Şifre bağlantısı\nşu an gönderilemiyor',
    body: 'E-posta gönderimimiz henüz açık değil. Bilgisayarda girişiniz açıksa şifrenizi orada değiştirebilirsiniz. '
        + 'Değilse hesabınızın e-postasıyla info@lueratech.com adresine yazın, şifrenizi birlikte yenileyelim.',
    action: 'E-posta yaz',
    back: 'Girişe dön',
    mailto: 'mailto:info@lueratech.com?subject=' + encodeURIComponent('Şifre yenileme'),
} as const;

/**
 * Müdür · Profil › Hesap › Şifreyi değiştir (2026-09-25).
 *
 * Giriş yapmış kişi e-postasız değiştiriyor. Önce ŞU ANKİ şifre soruluyor:
 * açık kalmış telefonu eline alan başkası müdürü dışarıda bırakamasın.
 */
export const passwordChange = {
    title: 'Şifreyi değiştir',
    current: 'Şu anki şifre',
    next: 'Yeni şifre',
    action: 'Şifreyi değiştir',
    busy: 'Kaydediliyor…',
    done: 'Şifreniz değişti.',
    note: 'Yeni şifre bilgisayardaki girişiniz için de geçerli.',
} as const;

/**
 * Hatanın cümlesi. Her biri şifrenin DEĞİŞMEDİĞİNİ ya da neyin değişmesi
 * gerektiğini söylüyor — kişi eski şifresinin hâlâ geçerli olduğunu bilmeli.
 */
export function passwordChangeProblem(error: string): string {
    switch (error) {
        case 'invalid_credentials': return 'Şu anki şifreniz bu değil. Şifreniz değişmedi.';
        case 'same_password': return 'Yeni şifre eskisiyle aynı. Farklı bir şifre seçin.';
        case 'weak_password': return 'Bu şifre yeterince güçlü değil. En az 8 karakter olsun, içinde bir rakam bulunsun.';
        case 'offline': return 'Bağlantı yok. Şifreniz değişmedi.';
        case 'locked': return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.';
        default: return 'Şifreniz değişmedi. Çıkış yapıp yeniden girin, sonra tekrar deneyin.';
    }
}

/**
 * Giriş 15c. "Eşleşmedi" ile "süresi doldu" bilerek AYRI metinlerdir.
 *
 * Birincisi kullanıcının düzeltebileceği bir yazım hatası — aynı ekranda kalır.
 * İkincisi başkasından bir şey istemeyi gerektirir. Aynı metni vermek,
 * kullanıcıyı aynı kodu üç kez yazmaya iterdi.
 */
export const expiredPairCode = {
    title: 'Bu kodun\nsüresi doldu',
    // 099 tasarımı §P1: kod YAŞLANDI, kimse yeni kod üretmedi — müdürün üretmesi gerekiyor.
    body: 'Kodlar 15 dakika geçerli. Müdürünüzden yeni bir kod üretmesini isteyin; bu ekranda kaldığınız yerden devam edeceksiniz.',
    ownerStatus: 'Kodu o üretir',
    retype: 'Yeni kodu yazacağım',
    call: 'İşletme sahibini ara',
} as const;

/**
 * Eşleştirme KİLİDİ — "kod yanlış"tan ayrı, çünkü çözümü farklı.
 *
 * `staff-api` yirmi yanlış denemeden sonra (099, önce on) IP'yi 15 dakika kilitliyor
 * (`PAIR_MAX_ATTEMPTS`) ve o andan itibaren kodu HİÇ BAKMADAN reddediyor.
 * Ekran bunu "bu kod eşleşmedi" diye gösteriyordu: kişi doğru kodu tekrar
 * tekrar yazıyor, her deneme kilidi besliyor ve ekran hep kodu suçluyordu.
 *
 * İkinci gerçek: kilit 15 dakika, kod 10 dakika geçerli. Yani kilit
 * açıldığında eldeki kodun süresi KESİNLİKLE dolmuş oluyor. Beklemeyi
 * söyleyip yeni kod istemeyi söylememek, kişiyi bir kez daha duvara
 * sürerdi — o yüzden ikisi aynı cümlede.
 */
/**
 * KAPANMIŞ kod (099) — doğru yazıldı ama artık geçerli değil: müdür yeni kod
 * üretti ya da tek kişilik kod kullanıldı. "Eşleşmedi" DEĞİL: kişi rakamları
 * kontrol etmeye değil, yeni kod istemeye yönlendirilmeli.
 */
export const usedPairCode = {
    title: 'Bu kod artık\ngeçerli değil',
    // Doğru kod şu anda salonda: üretilecek değil, BULUNACAK.
    body: 'Müdürünüz daha yeni bir kod üretti. Güncel kod şu anda onun ekranında görünüyor; yeni kodu sorun.',
} as const;

export const pairLocked = {
    title: 'Çok fazla\nyanlış deneme',
    // Sayaç BAĞLANTIYA ait (IP), işletmeye değil: aynı Wi‑Fi'daki herkes aynı bütçeyi harcıyor.
    body: 'Bu bağlantıdan kod girişi 15 dakika kapandı. Süre dolunca bu ekran kendiliğinden açılır; bir şey yapmanız gerekmiyor.',
    hint: 'Aynı Wi‑Fi’daki herkes aynı sayacı kullanır. Beklerken müdürünüzden güncel kodu isteyin.',
    call: 'İşletme sahibini ara',
    retry: 'Yeni kodu yaz',
} as const;

/** Kilit bitişine kalan süre — "12 dakika" / "40 saniye". */
export function lockWaitText(secondsRemaining: number): string {
    const seconds = nonNegativeInteger(Math.ceil(secondsRemaining));
    if (seconds === 0) return 'Şimdi deneyebilirsiniz';
    if (seconds < 60) return `${seconds} saniye sonra tekrar deneyebilirsiniz`;
    return `${Math.ceil(seconds / 60)} dakika sonra tekrar deneyebilirsiniz`;
}

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
/**
 * Apple Eşiği · C — kapalı kapı.
 *
 * Hata değil, kapalı bir kapı: durum rengi yok, "tekrar dene" yok. Metinde
 * GEÇMEYENLER: abonelik, plan, paket, fiyat, tutar, "yükselt", satın alma
 * anlamında "yenile", deneme süresi.
 *
 * ── "NEREDEN AÇILACAĞI" DA ÇIKARILDI (2026-09-24) ───────────────────────────
 * Metin bir zamanlar "Bilgisayardan <adres> — hesabınızla girip erişimi
 * oradan açabilirsiniz" diyordu ve dayanağı 3.1.3(f) olarak yazılmıştı.
 * Dayanak DOĞRU, koşulu atlanmıştı: 3.1.3(f) ücretli bir web hizmetinin
 * ücretsiz yardımcı uygulamasını IAP zorunluluğundan muaf tutuyor — ancak
 * "uygulama içinde satın alma YA DA uygulama dışında satın almaya ÇAĞRI
 * olmaması" şartıyla. Adresi ve "oradan açabilirsiniz"i yazmak tam olarak o
 * çağrıydı; muafiyetin kendisini riske atıyordu.
 *
 * Yerine destek adresi kondu. Bir destek e-postası satın alma yolu değil;
 * müdür yine ne yapacağını biliyor, uygulama ise hiçbir yere yönlendirmiyor.
 *
 * Eski metin "Bilgileriniz 90 gün saklanır" diyordu; bunu söyleyen bir
 * kural hiçbir yerde YOK (087 okumaya dokunmuyor, hiçbir iş silmiyor). Doğru
 * olan cümle kaldı: hiçbir kayıt silinmedi.
 */
export const subscriptionLocked = {
    title: 'Uygulama şu an kapalı',
    manager: {
        cardLabel: 'Sorularınız için',
        // Adres ALMIYOR: bir zamanlar `host` yazıyordu ve o, dışarıda satın
        // almaya çağrıydı. İmza sabit kalsın diye parametre korunmadı —
        // çağıran yerde de kalmasın istiyoruz.
        cardTitle: 'info@lueratech.com',
        cardBody: 'Hesabınızın durumu hakkında buradan bilgi alabilirsiniz.',
        kept: 'Randevular, müşteriler ve kasa geçmişi olduğu gibi duruyor — hiçbir kayıt silinmedi.',
    },
    staff: {
        kept: 'Bu sizin hesabınızla ilgili değil — randevularınız ve müşteri kayıtları olduğu gibi duruyor. Erişimi işletme sahibi açabilir.',
    },
    refresh: 'Durumu yenile',
    stillClosed: (hhmm: string) => `Hâlâ kapalı. ${hhmm}’de kontrol edildi.`,
    signOut: 'Oturumu kapat',
} as const;

const MONTHS_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

/** Bulunma eki ayın adına göre: Ocak'ta, Nisan'da, Eylül'de… (ünlü uyumu + sertleşme). */
const MONTH_SUFFIX = ['ta', 'ta', 'ta', 'da', 'ta', 'da', 'da', 'ta', 'de', 'de', 'da', 'ta'] as const;
/** Yılın okunuşunun son kelimesi: bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz. */
const ONES_SUFFIX = ['', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'] as const;
/** on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan. */
const TENS_SUFFIX = ['', 'da', 'de', 'da', 'ta', 'de', 'ta', 'te', 'de', 'da'] as const;

/** 2025'te, 2026'da, 2030'da, 2000'de — okunuşun son kelimesine göre. */
function yearSuffix(year: number): string {
    const ones = year % 10;
    if (ones) return ONES_SUFFIX[ones];
    const tens = Math.floor(year / 10) % 10;
    if (tens) return TENS_SUFFIX[tens];
    return 'de'; // yüz → yüzde, bin → binde
}

/**
 * "Studio Ayla için Luera erişimi 12 Eylül’de sona erdi."
 *
 * Tarih bilinmiyorsa tarih YAZILMIYOR — uydurulmuyor. Ad bilinmiyorsa "Bu
 * işletme". İsme ek getirilmiyor ("için"): salon adının son sesini bilmeden
 * yazılan ek, hiç ekten kötü duruyor.
 */
export function lockedLead(businessName: string, until: string | null, now: Date = new Date()): string {
    const who = businessName.trim() ? `${businessName.trim()} için` : 'Bu işletme için';
    const at = until ? new Date(until) : null;
    if (!at || Number.isNaN(at.getTime())) return `${who} Luera erişimi sona erdi.`;
    const month = at.getMonth();
    const sameYear = at.getFullYear() === now.getFullYear();
    const date = sameYear
        ? `${at.getDate()} ${MONTHS_TR[month]}’${MONTH_SUFFIX[month]}`
        : `${at.getDate()} ${MONTHS_TR[month]} ${at.getFullYear()}’${yearSuffix(at.getFullYear())}`;
    return `${who} Luera erişimi ${date} sona erdi.`;
}

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
