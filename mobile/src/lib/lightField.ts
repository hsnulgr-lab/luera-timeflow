/**
 * Giriş v3 · ışık alanının karar katmanı.
 *
 * Referans videodaki etki mesh gradyandan gelmiyor — Skia olmadan mesh zaten
 * yazamayız — **kayan renkli kütlelerden** geliyor. Beş radyal gradyan, hepsi
 * ekrandan taşacak kadar büyük, üstlerinde tek bir tam ekran bulanıklık.
 * Kütlelerin kenarı hiçbir zaman görünmüyor; görünen şey alanın kendisi.
 *
 * Bu dosyada React yok, RN yok, animasyon yok: yalnız SAYILAR ve onlardan
 * türeyen kararlar. Donuk karenin (`reduceMotion`) hangi ana denk geldiği de
 * burada hesaplanıyor — çünkü o bir kompozisyon kararı, bir çizim ayrıntısı
 * değil.
 */

/**
 * Alanın KÜRESEL saati.
 *
 * Tasarım "üç adım aynı ekranın üç hâli, üç ayrı ekran değil" diyor ve
 * gerekçesi alanın fazının kesilmemesi. Üç rotayı tek ekrana indirmek yerine
 * — bu geri tuşunu, testleri ve akışı yeniden kurmak olurdu — alanın kendisi
 * mount'a değil bu saate bağlandı. Ekran değişince kütleler kaldıkları yerden
 * devam ediyor; kullanıcı tek bir yüzey görüyor.
 */
const EPOCH = Date.now();

/** Uygulama açıldığından beri geçen saniye. */
export function fieldClock(): number {
    return (Date.now() - EPOCH) / 1000;
}

/** Bir kütlenin zaman içindeki tek anı — yüzde cinsinden kayma, ölçek, saydamlık. */
export interface MassFrame {
    /** Kendi genişliğinin yüzdesi olarak kayma. */
    x: number;
    y: number;
    scale: number;
    /** 0–1; kütlenin tavanıyla ÇARPILIR, tavanın kendisi değildir. */
    opacity: number;
}

export interface MassKey extends MassFrame {
    /** Döngü içindeki konumu, 0–1. */
    at: number;
}

export interface Mass {
    id: 'kor' | 'murekkep' | 'erik' | 'teal' | 'sis';
    /**
     * Kütlenin rengi — ve bu renk tasarımda yazandan DAHA DOYGUN.
     *
     * Mock'ta alanın üstünde `saturate(160%)` var; görüntüleri o filtre
     * canlandırıyor. RN'de filtre yok, `expo-blur` yalnız yoğunluk ve ton
     * veriyor. Karşılığı: doygunluğu bileşiğe değil KAYNAĞA uyguladık —
     * CSS'in kendi saturate matrisi her renge tek tek işlendi.
     *   #FF5A1F → #FF4700 · #2A40A8 → #1B3EE5 · #963478 → #C12591
     *   #14968C → #00A797 · #FFD6AA → #FFD38C
     * Marka turuncusu `#FF5A1F` bundan etkilenmiyor: o arayüzün rengi,
     * bu alanın malzemesi.
     *
     * Alanın renkleri ANLAM TAŞIMAZ — bkz. §6.
     */
    color: string;
    /** Çap, pt. Ekrandan taşar; kırpılan kısım bilinçli. */
    size: number;
    /** Ekrana çakıldığı yer. Yüzde verilirse ekranın kendi ölçüsüne göre. */
    left?: number | string;
    right?: number | string;
    top?: number | string;
    bottom?: number | string;
    /** Tam tur süresi, saniye. */
    duration: number;
    /** Döngüye kaçıncı saniyeden girer — beşi aynı anda başlamasın diye. */
    offset: number;
    /** Saydamlık tavanı (koyu tema). Aydınlıkta ×0,62. */
    ceiling: number;
    keys: MassKey[];
}

/**
 * Beş kütle.
 *
 * Süreler **19 · 23 · 27 · 34 · 41** — üçü asal, ortak katları dört saatin
 * ötesinde. Bu yüzden "aynı animasyonu yine gördüm" hissi oluşmuyor. Süreleri
 * yuvarlarken bu özelliği bozmayın.
 */
export const MASSES: readonly Mass[] = [
    {
        id: 'kor', color: '#FF4700', size: 440,
        left: -90, top: '44%', duration: 34, offset: 0, ceiling: 0.74,
        keys: [
            { at: 0, x: -4, y: 10, scale: 1, opacity: 0.9 },
            { at: 0.25, x: 20, y: -6, scale: 1.2, opacity: 1 },
            { at: 0.5, x: 8, y: -24, scale: 0.92, opacity: 0.78 },
            { at: 0.75, x: -18, y: -8, scale: 1.12, opacity: 0.95 },
            { at: 1, x: -4, y: 10, scale: 1, opacity: 0.9 },
        ],
    },
    {
        id: 'murekkep', color: '#1B3EE5', size: 390,
        right: -120, top: -40, duration: 27, offset: 4, ceiling: 0.60,
        keys: [
            { at: 0, x: 6, y: -4, scale: 1, opacity: 0.85 },
            { at: 0.33, x: -18, y: 16, scale: 1.24, opacity: 1 },
            { at: 0.66, x: -4, y: 42, scale: 0.96, opacity: 0.7 },
            { at: 1, x: 6, y: -4, scale: 1, opacity: 0.85 },
        ],
    },
    {
        id: 'erik', color: '#C12591', size: 360,
        right: -100, top: '46%', duration: 41, offset: 11, ceiling: 0.56,
        keys: [
            { at: 0, x: 4, y: 0, scale: 1.06, opacity: 0.8 },
            { at: 0.3, x: -22, y: -18, scale: 1.3, opacity: 1 },
            { at: 0.6, x: -10, y: 18, scale: 0.9, opacity: 0.66 },
            { at: 1, x: 4, y: 0, scale: 1.06, opacity: 0.8 },
        ],
    },
    {
        id: 'teal', color: '#00A797', size: 320,
        left: '22%', bottom: -110, duration: 23, offset: 7, ceiling: 0.52,
        keys: [
            { at: 0, x: 0, y: 4, scale: 1, opacity: 0.9 },
            { at: 0.4, x: -24, y: -26, scale: 1.22, opacity: 1 },
            { at: 0.7, x: 16, y: -10, scale: 0.94, opacity: 0.72 },
            { at: 1, x: 0, y: 4, scale: 1, opacity: 0.9 },
        ],
    },
    {
        // Renk değil IŞIK: altındaki kütleleri açıyor, alanın "aydınlandığı"
        // yeri bu taşıyor. Kaldırılırsa alan söner, kararmaz.
        id: 'sis', color: '#FFD38C', size: 280,
        left: '8%', top: '8%', duration: 19, offset: 2, ceiling: 0.42,
        keys: [
            { at: 0, x: 0, y: 0, scale: 1, opacity: 0.7 },
            { at: 0.35, x: 26, y: 24, scale: 1.28, opacity: 1 },
            { at: 0.7, x: 40, y: -6, scale: 0.9, opacity: 0.55 },
            { at: 1, x: 0, y: 0, scale: 1, opacity: 0.7 },
        ],
    },
] as const;

// ── Katmanlar: OS'a değil CİHAZ YAŞINA bakılıyor ───────────────────────────
//
// 2024 model bir Android beş kütleyi rahat çeviriyor; 2019 model bir iPhone
// zorlanabiliyor. Kararı markaya bağlamak, kullanıcıların yarısına sebepsiz
// yere sönük bir ürün vermek olurdu.

export type FieldTier = 'rich' | 'lite';

/** `deviceYearClass` bilinmiyorsa DÜŞÜK varsayılır — şüphede akıcılık kazanır. */
export function tierForYear(yearClass: number | null | undefined): FieldTier {
    if (typeof yearClass !== 'number' || !Number.isFinite(yearClass)) return 'lite';
    return yearClass >= 2021 ? 'rich' : 'lite';
}

/** Düşük katmanda üç kütle kalıyor: kor, mürekkep, teal. Erik ve sis düşer. */
const LITE_IDS: readonly Mass['id'][] = ['kor', 'murekkep', 'teal'];

/**
 * Ekranın alandan ne beklediği.
 *
 *   welcome — ömürde bir kez görülür, gösterinin tamamı burada
 *   form    — iş var, form doldurulacak; alan arkaya çekilir
 *   lock    — günde otuz kez; iki kütle, iki buçuk kat yavaş
 */
export type FieldProfile = 'welcome' | 'form' | 'lock';

export interface FieldPlan {
    masses: {
        mass: Mass;
        duration: number;
        ceiling: number;
        /** Kayma genliği çarpanı — kilit ekranında yol 220 pt'den 40 pt'ye iner. */
        amp: number;
        /** Ölçek sapması çarpanı — ±%30'dan ±%8'e. */
        scaleAmp: number;
        size: number;
    }[];
    blur: number;
    /** Bulanıklık nefes alıyor mu (±6 / 14 s)? Düşük katmanda ve Android'de hayır. */
    breathe: boolean;
    saturation: number;
}

export interface FieldOptions {
    profile: FieldProfile;
    tier: FieldTier;
    dark: boolean;
    small: boolean;
    /** Android'de `BlurView.intensity` animasyonu her karede yeni çizim geçişi
     *  tetikliyor — nefes orada kapalı, bulanıklık 44'te sabit. */
    android: boolean;
    /** Klavye açık: alan durmaz, GERİYE ÇEKİLİR. */
    keyboard?: boolean;
}

export function fieldPlan(o: FieldOptions): FieldPlan {
    const lock = o.profile === 'lock';
    const ids: readonly Mass['id'][] = lock
        ? ['kor', 'sis']
        : o.tier === 'lite' ? LITE_IDS : MASSES.map((m) => m.id);

    // Aydınlık temada aynı alfa krem zemin üstünde mor bir leke gibi duruyordu.
    // Hue'lar değişmiyor, yalnız saydamlık iniyor.
    let ceilingScale = o.dark ? 1 : 0.62;
    let durationScale = 1;
    let amp = 1;
    let scaleAmp = 1;

    // Form ekranlarında alan KISILMIYOR.
    //
    // Tasarımın düzyazısı "saydamlık tavanı ×0,6, süreler ×1,4" diyor — ama
    // mock'un kendi HTML'inde müdür ve personel ekranları düpedüz `field`
    // sınıfını kullanıyor, yani karşılamayla AYNI alanı. Beğenilen görüntüler
    // o hâlden çıkmış. Düzyazıyı uygulamak ekranı siyahlatıyordu.
    //
    // Klavye tepkisi duruyor: o bir hâl, bir kısıntı değil.
    if (o.profile === 'form') durationScale = 1.4;
    if (lock) {
        // Mock'un `.calm`'ı: kor .74×.42 ≈ .31, sis .42×.5 ≈ .21.
        ceilingScale *= 0.44;
        amp = 0.18;              // ≈220 pt → ≈40 pt
        scaleAmp = 0.27;         // ±%30 → ±%8
    }
    // Klavye açıkken alan bir kademe daha geriye gider. Çarpan, formun kendi
    // ×0,6'sının ÜSTÜNE biniyor: "daha da geriye" ancak böyle olur.
    if (o.keyboard) ceilingScale *= 0.7;
    if (o.tier === 'lite') durationScale *= 1.5;

    const lockDuration: Record<string, number> = { kor: 67, sis: 54 };

    const masses = MASSES.filter((m) => ids.includes(m.id)).map((mass) => ({
        mass,
        duration: lock ? lockDuration[mass.id] : mass.duration * durationScale,
        ceiling: mass.ceiling * ceilingScale,
        amp,
        scaleAmp,
        // 375 pt'de alan küçültülmüyor, YAKLAŞTIRILIYOR: daha azı görünüyor,
        // desen sadeleşiyor ama malzeme aynı kalıyor.
        size: mass.size * (o.small ? 0.88 : 1),
    }));

    let blur = o.dark ? 58 : 46;
    if (lock) blur = 66;
    if (o.tier === 'lite') blur = 30;
    else if (o.android) blur = 44;
    if (o.small && o.tier !== 'lite' && !lock) blur = Math.round(blur * 0.86);
    if (o.keyboard) blur = 70;

    return {
        masses,
        blur,
        breathe: o.tier === 'rich' && !o.android && !lock,
        saturation: lock ? 105 : o.dark ? 155 : 125,
    };
}

// ── Olgunlaşma: koreografinin 1.–5. saniyesi ───────────────────────────────

/**
 * Alan sıfırıncı saniyede ZATEN ORADA — doğmuyor. Ama gençtir: yalnız kor ve
 * sis görünür, öteki üçü saydamlığı 0'dan alır. Bulanıklık 34'ten başlar.
 *
 * Bu ayrım koreografinin belkemiği: arayüz 1,0 s'de tamamlanıp durur,
 * alan 5,0 s'ye kadar olgunlaşmaya devam eder. Yani kullanıcı 1. saniyeden
 * sonra HİÇBİR ŞEY beklemiyor — kaçırabileceği bir şey yok, sadece ortam
 * derinleşiyor.
 */
export const INTRO_SECONDS = 5;
export const INTRO_BLUR_FROM = 34;
export const INTRO_BLUR_UNTIL = 2.6;

/** Kütlenin saydamlığının 0'dan tavanına çıktığı pencere, saniye. */
export const INTRO_WINDOW: Partial<Record<Mass['id'], [number, number]>> = {
    murekkep: [1.0, 2.2],
    teal: [1.2, 2.6],
    erik: [1.4, 3.0],
};

/**
 * `t` saniyede kütlenin olgunlaşma çarpanı (0–1). Kor ve sis her zaman 1.
 *
 * `'worklet'` ZORUNLU: bu fonksiyon `useAnimatedStyle`'ın içinden, yani UI iş
 * parçacığından çağrılıyor. İşaretlenmemiş bir fonksiyonu oradan çağırmak
 * çalışma zamanında patlar — Node tarafında ise bu satır zararsız bir ifade.
 */
export function introFactor(id: Mass['id'], t: number): number {
    'worklet';
    const w = INTRO_WINDOW[id];
    if (!w) return 1;
    if (t <= w[0]) return 0;
    if (t >= w[1]) return 1;
    const u = (t - w[0]) / (w[1] - w[0]);
    // Easing.inOut(quad) — kütle belirirken ne çarpıyor ne de sürünüyor.
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

// ── Donuk kare — `reduceMotion` ────────────────────────────────────────────

/**
 * Erişilebilirlik ayarı açık olan kullanıcı BOZULMUŞ bir ekran değil, DURGUN
 * bir ekran görmeli. Bu yüzden alan sıfırıncı saniyeye değil **elle seçilmiş
 * bir kareye** donuyor: t = 3,2 s — kor solda, mürekkep sağ üstte, sis
 * markanın arkasında bir ışık.
 */
export const FROZEN_AT = 3.2;

/** Kütlenin `t` saniyedeki hâli. Anahtarlar arasında doğrusal geçiş. */
export function frameAt(mass: Mass, t: number, duration = mass.duration): MassFrame {
    const p = (((t + mass.offset) % duration) + duration) % duration / duration;
    const keys = mass.keys;
    for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i];
        const b = keys[i + 1];
        if (p >= a.at && p <= b.at) {
            const span = b.at - a.at;
            const k = span === 0 ? 0 : (p - a.at) / span;
            return {
                x: a.x + (b.x - a.x) * k,
                y: a.y + (b.y - a.y) * k,
                scale: a.scale + (b.scale - a.scale) * k,
                opacity: a.opacity + (b.opacity - a.opacity) * k,
            };
        }
    }
    return keys[keys.length - 1];
}

/** Kütlenin donuk karedeki hâli — genlik çarpanları uygulanmış. */
export function frozenFrame(
    entry: FieldPlan['masses'][number],
    at = FROZEN_AT,
): MassFrame {
    const f = frameAt(entry.mass, at, entry.duration);
    return {
        x: f.x * entry.amp,
        y: f.y * entry.amp,
        scale: 1 + (f.scale - 1) * entry.scaleAmp,
        opacity: f.opacity,
    };
}

// ── Perde ──────────────────────────────────────────────────────────────────

/**
 * Bulanıklığın üstünde, kütlelerden BAĞIMSIZ bir koyuluk katmanı.
 *
 * Camın altındaki en parlak an bile bundan geçiyor. Kontrast garantisinin
 * ikinci ayağı bu (birincisi camın kendi dolgusu): alan hangi renge dönerse
 * dönsün, üstündeki metnin altındaki zemin bir tabanın altına inemiyor.
 */
export function veilStops(dark: boolean): {
    colors: [string, string, string, string];
    locations: [number, number, number, number];
} {
    return dark
        ? {
            colors: [
                // CSS'in kendi değerleri. Düzyazı "üstte .30, altta .52"
                // diyordu; mock .20 ve .42 ile çiziliyor ve fark görünür —
                // ağır perde alanı boğuyordu.
                'rgba(18,14,8,0.20)', 'rgba(18,14,8,0.04)',
                'rgba(18,14,8,0.18)', 'rgba(18,14,8,0.42)',
            ],
            locations: [0, 0.32, 0.68, 1],
        }
        : {
            colors: [
                'rgba(255,253,251,0.26)', 'rgba(255,253,251,0.08)',
                'rgba(255,253,251,0.30)', 'rgba(255,253,251,0.58)',
            ],
            locations: [0, 0.34, 0.70, 1],
        };
}
