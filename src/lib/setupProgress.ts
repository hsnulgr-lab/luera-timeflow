// Kurulum sihirbazının adımları, ekranları ve ilerleme hesabı — saf modül.
//
// Neden ayrı dosya: "kurulum bitti mi" sorusunu ÜÇ yer soruyor — sihirbazın
// kendi ilerleme göstergesi, bitiş özeti ve uygulamanın üstündeki "devam et"
// şeridi. Üçü ayrı hesaplasaydı biri "2 / 3" derken diğeri "tamamlandı"
// diyebilirdi.
//
// Bir adımın "tamam" olması, kullanıcının o adımı GÖRMESİ değil VERİNİN
// bulunması demek. Böylece sihirbazı hiç açmamış eski bir org da doğru okunur:
// hizmetleri varsa o adım zaten tamamdır, sihirbaz onu tekrar sormaz.
//
// İki katman var (Kurulum v2, 2026-10-25):
//   · ADIM (StepKey) — veri olgusu. Ödeme duvarı (`PaywallPage` ·
//     afterPaymentPath) kaldığı yeri adım anahtarıyla taşır
//     (/kurulum?adim=identity); eski şeridin bağlantıları da öyle.
//   · EKRAN (ScreenKey) — kullanıcının gördüğü üç ekran. Her adım bir ekrana
//     düşer; sihirbaz, şerit ve bitiş ekran sayacını okur.
//
// tests/setup-progress.test.mjs doğrudan import eder — `@/` alias'ı node'da
// çözülmediği için burada hiçbir alias import'u olmamalı.

export type StepKey =
    | 'welcome' | 'sector' | 'identity' | 'hours'
    | 'services' | 'resources' | 'team' | 'whatsapp';

export interface StepDef {
    key: StepKey;
    /** Atlanabilir adım "kurulum yapıldı" kararına girmez. */
    skippable?: boolean;
}

export const SETUP_STEPS: readonly StepDef[] = [
    { key: 'welcome' },
    { key: 'sector' },
    { key: 'identity' },
    { key: 'hours' },
    { key: 'services' },
    { key: 'resources', skippable: true },
    { key: 'team', skippable: true },
    { key: 'whatsapp', skippable: true },
];

/** Sihirbazın okuduğu dünya durumu — hangi verinin VAR olduğu. */
export interface SetupFacts {
    sector?: string | null;
    businessName?: string | null;
    address?: string | null;
    phone?: string | null;
    /** Açık (isOff olmayan) gün sayısı. */
    openDays: number;
    /** Veritabanındaki hizmet sayısı — yer tutucular sayılmaz (`isSavedServiceId`). */
    serviceCount: number;
    resourceCount: number;
    /** Sektörün hiç kaynak türü yoksa bu adım GEREKSİZDİR, atlanmış sayılmaz. */
    resourcesApply: boolean;
    staffCount: number;
    /** "Yalnız ben çalışıyorum" seçildi — ekip adımı bilinçli olarak boş. */
    soloDeclared: boolean;
    whatsappConnected: boolean;
}

/**
 * Adım tamam mı?
 *
 * 'welcome' her zaman tamamdır: v1'in karşılama ekranıydı, v2'de yok. Anahtar
 * duruyor çünkü zorunlu adımların listesi (ödeme dönüşü) onu sayıyor.
 */
export function isStepDone(key: StepKey, f: SetupFacts): boolean {
    switch (key) {
        case 'welcome': return true;
        case 'sector': return Boolean(f.sector) && f.sector !== 'genel';
        case 'identity': return Boolean(f.businessName?.trim()) && Boolean(f.address?.trim() || f.phone?.trim());
        case 'hours': return f.openDays > 0;
        case 'services': return f.serviceCount > 0;
        // Kaynak kavramı olmayan sektörde (danışmanlık, restoran) bu adım
        // sorulmaz; "atlandı" damgası vurmak da yanlış olur — yok sayılır.
        case 'resources': return !f.resourcesApply || f.resourceCount > 0;
        case 'team': return f.soloDeclared || f.staffCount > 0;
        case 'whatsapp': return f.whatsappConnected;
    }
}

/** Atlanamayan adımlar — "kurulum yapıldı" bunlara bakar. */
export const CORE_STEPS: readonly StepKey[] = SETUP_STEPS.filter((s) => !s.skippable).map((s) => s.key);

/**
 * Zorunlu adım, sihirbazın GEÇİT koşuluyla geçildi mi. Kimlikte sihirbaz
 * yalnız işletme adını ister; adres ve telefon hiç sorulmaz (Ayarlar ›
 * İşletme profili). Test B'de (2026-10-22) adressiz, telefonsuz kurulumu
 * bitiren salon ödemeden sonra yine Kimlik adımına düştü — `isStepDone`
 * ikisinden birini arıyor.
 */
function coreStepDone(key: StepKey, f: SetupFacts): boolean {
    return key === 'identity' ? Boolean(f.businessName?.trim()) : isStepDone(key, f);
}

/** İlk eksik zorunlu adım; kurulum yapıldıysa null. */
export function nextCoreStep(f: SetupFacts): StepKey | null {
    return CORE_STEPS.find((k) => !coreStepDone(k, f)) ?? null;
}

/**
 * Kurulum yapıldı mı? Ödemeden dönüş buna bakar (kullanıcı kararı
 * 2026-10-22: yapıldıysa ana sayfa, yapılmadıysa kurulum). Atlanabilir
 * adımlar (kaynak, ekip, WhatsApp) ve sihirbazın sormadan geçtiği alanlar
 * sayılmaz: sihirbazı bitiren kurulumu yapmıştır. Şerit
 * (`screenProgress().complete`) daha katı; WhatsApp'ı da hatırlatır.
 */
export function coreSetupDone(f: SetupFacts): boolean {
    return nextCoreStep(f) === null;
}

// ── Ekranlar ────────────────────────────────────────────────────────────────

export type ScreenKey = 'isletme' | 'hizmetler' | 'whatsapp';

export interface ScreenDef {
    key: ScreenKey;
    /** Göstergenin ve şeridin "Sırada: …" metni. */
    label: string;
}

/** Kullanıcı kararı 2026-10-19: "çok az adım, az ve öz" — üç ekran + bitiş. */
export const SETUP_SCREENS: readonly ScreenDef[] = [
    { key: 'isletme', label: 'İşletmeniz' },
    { key: 'hizmetler', label: 'Hizmetler ve saatler' },
    { key: 'whatsapp', label: 'WhatsApp' },
];

/** Her adım hangi ekranda soruluyor. Ekip ve yer sayısı İşletmeniz'de. */
const STEP_SCREEN: Record<StepKey, ScreenKey> = {
    welcome: 'isletme', sector: 'isletme', identity: 'isletme', team: 'isletme', resources: 'isletme',
    hours: 'hizmetler', services: 'hizmetler',
    whatsapp: 'whatsapp',
};

/**
 * `?adim=` değerinin ekranı: ekran anahtarı (şerit) ya da adım anahtarı
 * (ödeme duvarı, eski bağlantılar). Tanınmazsa null.
 */
export function screenFor(adim: string | null | undefined): ScreenKey | null {
    if (!adim) return null;
    if (SETUP_SCREENS.some((s) => s.key === adim)) return adim as ScreenKey;
    return (STEP_SCREEN as Record<string, ScreenKey | undefined>)[adim] ?? null;
}

/**
 * Ekran tamam mı — yine VERİDEN. İlk iki ekran zorunlu adımların geçit
 * kuralıyla okunur; böylece ödeme dönüşünün gittiği ekran (`nextCoreStep`)
 * ile şeridin "Sırada"sı hep aynıdır. Ekip ve yer sayısı İşletmeniz'de
 * sorulur ama sayılmaz: v1'den kalan eski org'larda bu bilgi saklı değil ve
 * hepsini "1 / 3"e düşürmek yanlış olurdu.
 */
export function isScreenDone(key: ScreenKey, f: SetupFacts): boolean {
    switch (key) {
        case 'isletme': return coreStepDone('sector', f) && coreStepDone('identity', f);
        case 'hizmetler': return coreStepDone('hours', f) && coreStepDone('services', f);
        case 'whatsapp': return f.whatsappConnected;
    }
}

export interface ScreenProgress {
    /** Tamamlanmış ekranlar, sırayla. */
    done: ScreenKey[];
    /** Sıradaki (ilk eksik) ekran; hepsi tamamsa null. */
    next: ScreenKey | null;
    /** Hepsi bittiyse true — şerit gösterilmez. */
    complete: boolean;
}

export function screenProgress(f: SetupFacts): ScreenProgress {
    const done = SETUP_SCREENS.filter((s) => isScreenDone(s.key, f)).map((s) => s.key);
    const next = SETUP_SCREENS.find((s) => !isScreenDone(s.key, f))?.key ?? null;
    return { done, next, complete: next === null };
}

/**
 * Kayıtlı işletme adı gerçekten işletmenin mi? Kayıt anında sunucunun yazdığı
 * ad işletmenin adı DEĞİL (göç 121): e-postayla kayıtta e-posta adresi,
 * Apple/Google'da kişinin kendi adı (`personName`), satır yoksa uygulamanın
 * varsayılanı. Sihirbaz alanı bunlarla doldurmaz, boş açar (v1 kusuru, devir
 * 12 §2.1). İşletmenin adı değilse ''.
 */
const PLACEHOLDER_NAMES = new Set(['luera timeflow', 'workspace']);
export function ownBusinessName(value: string | null | undefined, personName?: string | null): string {
    const v = (value ?? '').trim();
    if (!v || v.includes('@') || PLACEHOLDER_NAMES.has(v.toLocaleLowerCase('tr'))) return '';
    return personName && v === personName.trim() ? '' : v;
}

/**
 * Hizmet veritabanından mı geldi? Hizmeti olmayan işletmede ayarlar beş
 * YER TUTUCU hizmet taşır (kimlik '1'…'5', `useReservations` ·
 * defaultServices). Onlar sayılsaydı yeni işletme "hizmetleri var"
 * görünürdü; `updateSettings`'e gönderilseler veritabanına yazılırlardı ve
 * sihirbaz sektörün hazır listesi yerine "Genel Randevu, Konsültasyon…"
 * gösterirdi. Veritabanı kimlikleri UUID.
 */
export function isSavedServiceId(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
