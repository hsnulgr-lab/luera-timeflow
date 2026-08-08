// Abonelik planları — TEK kayıt defteri.
//
// Bu liste ÜÇ yerde gösteriliyor: Ayarlar→Faturalandırma, herkese açık
// /fiyatlar sayfası ve denemesi biten kullanıcının gördüğü /abonelik duvarı.
// Üç kopya fiyat, er ya da geç üç FARKLI fiyat demektir — müşteri sayfada
// 599 görüp 649 ödediğinde kaybedilen şey para değil güvendir.
//
// Fiyatlar Dodo'daki ürünlerle eşleşmek ZORUNDA. Buradaki rakam yalnız
// vitrindir; tahsilat Dodo ürününden yapılır (DODO_PRODUCT_MAP → plan_cycle).
// Birini değiştirip diğerini unutmak, sayfada bir fiyat gösterip başka bir
// tutar çekmek demek.
//
// Saf modül: tests/plans.test.mjs doğrudan import eder, `@/` alias'ı
// kullanılmaz.

export type PlanId = 'baslangic' | 'pro' | 'isletme';
export type Cycle = 'monthly' | 'yearly';

export interface PlanFeature {
    label: string;
    /** Henüz yok — satmıyoruz, görsel olarak ayrışmalı. */
    soon?: boolean;
}

export interface Plan {
    id: PlanId;
    name: string;
    tagline: string;
    /** Aylık ödemede aylık ücret (TL). */
    monthly: number;
    /** Yıllık ödemede AYLIĞA DÜŞEN ücret (TL) — vitrinde böyle gösteriliyor. */
    yearly: number;
    popular?: boolean;
    features: PlanFeature[];
}

const f = (label: string, soon?: boolean): PlanFeature => ({ label, soon });

export const PLANS: readonly Plan[] = [
    {
        id: 'baslangic', name: 'Başlangıç', tagline: 'Yeni başlayan işletmeler',
        monthly: 299, yearly: 239,
        features: [
            f('1 şube'), f('3 personele kadar'), f('Randevu & takvim'),
            f('Online randevu sayfası'), f('Temel raporlar'),
        ],
    },
    {
        id: 'pro', name: 'Pro', tagline: 'Büyüyen işletmeler için',
        monthly: 599, yearly: 479, popular: true,
        features: [
            f('Sınırsız personel'), f('WhatsApp hatırlatma'), f('Kasa & tahsilat'),
            f('Gelişmiş analiz'), f('Müşteri paketleri'), f('E-posta destek'),
        ],
    },
    {
        id: 'isletme', name: 'İşletme', tagline: 'Çoklu şube & yüksek hacim',
        monthly: 1199, yearly: 959,
        features: [
            f('Çoklu şube yönetimi', true), f('API erişimi'), f('Öncelikli destek'),
            f('Özel raporlar'), f('Rol & yetki yönetimi', true), f('Kurulum desteği'),
        ],
    },
];

/** Ücretsiz deneme uzunluğu — checkout'ta Dodo'ya geçilen değerle aynı olmalı. */
export const TRIAL_DAYS = 7;

export function planById(id: string | null | undefined): Plan | undefined {
    return PLANS.find((p) => p.id === id);
}

export function priceOf(plan: Plan, cycle: Cycle): number {
    return cycle === 'yearly' ? plan.yearly : plan.monthly;
}

/** "1.199" — TL biçimi tek yerde; üç sayfada üç farklı biçim görünmesin. */
export function formatTRY(n: number): string {
    return n.toLocaleString('tr-TR');
}

/**
 * Yıllık ödemedeki indirim yüzdesi. Sabit yazılmıyor: fiyat değişince
 * "%20 indirim" yazısı sessizce yalan olurdu.
 */
export function yearlyDiscountPercent(plan: Plan): number {
    if (!plan.monthly) return 0;
    return Math.round((1 - plan.yearly / plan.monthly) * 100);
}

/**
 * Denemenin bittiği (ilk tahsilatın yapılacağı) gün.
 *
 * Satın alma sayfası bu tarihi AÇIKÇA yazıyor. "7 gün ücretsiz" deyip ne zaman
 * para çekileceğini söylememek, kart isteyen bir denemede güveni bitiren şeydir.
 */
export function firstChargeDate(from: Date = new Date(), trialDays = TRIAL_DAYS): Date {
    return new Date(from.getTime() + trialDays * 86_400_000);
}
