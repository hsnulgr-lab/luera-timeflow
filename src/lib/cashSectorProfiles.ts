import {
    Briefcase, Brush, Dumbbell, HeartPulse, Scale, Scissors, Shirt, Sparkles,
    Stethoscope, Store, type LucideIcon,
} from 'lucide-react';

// ── Kasanın sektör profili — TEK KAYNAK ──────────────────────────────────────
// Ortak kasa (BeautyCashRegister) randevulu bütün sektörlerin yüzüdür: kuyruk →
// hesap → ödeme omurgası her yerde aynıdır, sektör farkı yalnız bu tablodadır.
// Yeni bir sektör eklemek = buraya bir satır.
//
// Bu listede OLMAYAN sektör eski KasaPage'e düşer ve bu bilinçlidir: kasası
// gerçekten farklı çalışan tek sektör kaldı — restoran (masa/adisyon kuyruğu).
// Diş, `allocatePlans` bayrağıyla ortak kasaya taşındı: tahsilat açık tedavi
// planlarına FIFO mahsup edilir, mahsup dökümü makbuzda görünür.

export type CashVariant =
    | 'genel' | 'guzellik' | 'kuafor' | 'berber' | 'estetik' | 'saglik'
    | 'fizyoterapi' | 'tattoo' | 'avukat' | 'danismanlik' | 'gym' | 'gelinlikci'
    | 'dis';

export interface CashProfile {
    /** İşletme adı girilmemişse başlıkta görünen marka. */
    fallbackBrand: string;
    /**
     * Paket motoru güzellik ve kuaförde gerçek: paket_plan_id'yi BeautySessionModal
     * yazar, planları BeautyPackages yönetir, PackagesPage guzellik ve kuafor'da
     * paket yüzünü açar. Diğer sektörlerde açmak, arkasında veri olmayan bir
     * "Pakete say" butonu göstermek olurdu.
     */
    packagesEnabled: boolean;
    customerHref: (id: string) => string;
    icon: LucideIcon;
    /** Sıcak krem kabuk; güzellik kendi gradyanını korur. */
    warmShell: boolean;
    /**
     * Diş: tahsilat, hastanın açık tedavi planlarına FIFO mahsup edilir
     * (lib/allocatePayment) ve vadesi gelen taksitler kuyruk altında listelenir.
     */
    allocatePlans?: boolean;
}

const customerCard = (id: string) => `/customers?open=${encodeURIComponent(id)}`;

export const CASH_PROFILES = {
    genel:       { fallbackBrand: 'LUERA',             packagesEnabled: false, customerHref: customerCard, icon: Store,       warmShell: true },
    guzellik:    { fallbackBrand: 'LUERA BEAUTY',      packagesEnabled: true,  customerHref: (id: string) => `/beauty-customer/${id}`, icon: Sparkles, warmShell: false },
    kuafor:      { fallbackBrand: 'LUERA HAIR',        packagesEnabled: true,  customerHref: customerCard, icon: Scissors,    warmShell: true },
    berber:      { fallbackBrand: 'LUERA BARBER',      packagesEnabled: false, customerHref: customerCard, icon: Scissors,    warmShell: true },
    estetik:     { fallbackBrand: 'LUERA ESTETİK',     packagesEnabled: false, customerHref: customerCard, icon: Sparkles,    warmShell: true },
    saglik:      { fallbackBrand: 'LUERA KLİNİK',      packagesEnabled: false, customerHref: customerCard, icon: Stethoscope, warmShell: true },
    fizyoterapi: { fallbackBrand: 'LUERA FİZYO',       packagesEnabled: false, customerHref: customerCard, icon: HeartPulse,  warmShell: true },
    tattoo:      { fallbackBrand: 'LUERA STUDIO',      packagesEnabled: false, customerHref: customerCard, icon: Brush,       warmShell: true },
    avukat:      { fallbackBrand: 'LUERA HUKUK',       packagesEnabled: false, customerHref: customerCard, icon: Scale,       warmShell: true },
    danismanlik: { fallbackBrand: 'LUERA DANIŞMANLIK', packagesEnabled: false, customerHref: customerCard, icon: Briefcase,   warmShell: true },
    gym:         { fallbackBrand: 'LUERA FIT',         packagesEnabled: false, customerHref: customerCard, icon: Dumbbell,    warmShell: true },
    gelinlikci:  { fallbackBrand: 'LUERA ATÖLYE',      packagesEnabled: false, customerHref: customerCard, icon: Shirt,       warmShell: true },
    dis:         { fallbackBrand: 'LUERA DENTAL',      packagesEnabled: false, customerHref: (id: string) => `/patient-file/${id}`, icon: Stethoscope, warmShell: true, allocatePlans: true },
} satisfies Record<CashVariant, CashProfile>;

/** KasaPage bununla ortak kasaya mı yoksa sektöre özel kasaya mı yönlendirir. */
export const isCashVariant = (sector: string): sector is CashVariant =>
    Object.prototype.hasOwnProperty.call(CASH_PROFILES, sector);
