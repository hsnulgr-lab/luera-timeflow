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
}

export interface Plan {
    id: PlanId;
    name: string;
    tagline: string;
    /** Aylık ödemede aylık ücret (TL, KDV dahil). */
    monthly: number;
    /**
     * Yıllık ödemede YILDA TEK SEFERDE çekilen tutar (TL). Aylığa düşen
     * tutar buradan hesaplanır (`yearlyPerMonth`), tersi değil: 7.990 / 12
     * kuruşlu bir sayı; Dodo ürünü toplamı çeker.
     */
    yearlyTotal: number;
    /** En çok kaç aktif çalışan — yoksa sınırsız. Ödeme anında uygulanır (dodo-checkout). */
    maxStaff?: number;
    popular?: boolean;
    features: PlanFeature[];
}

const f = (label: string): PlanFeature => ({ label });

// Fiyat turu 2026-10 (docs/devir/15). Yıllık = 10 × aylık ("2 ay bedava").
// Listede yalnız uygulamada BUGÜN olan özellikler: "yakında" satılmaz.
export const PLANS: readonly Plan[] = [
    {
        id: 'baslangic', name: 'Tek kişilik', tagline: 'Tek başına çalışanlar için',
        monthly: 799, yearlyTotal: 7990, maxStaff: 1,
        features: [
            f('1 çalışan'), f('Randevu & takvim'), f('Online randevu sayfası'),
            f('WhatsApp hatırlatma'), f('Kasa & tahsilat'), f('Müşteri paketleri'),
            f('Raporlar'), f('E-posta destek'),
        ],
    },
    {
        id: 'pro', name: 'Ekip', tagline: 'Ekibiyle çalışan işletmeler',
        monthly: 1299, yearlyTotal: 12990, popular: true,
        features: [
            f('Tek kişilikteki her şey'), f('Sınırsız personel'),
            f('Personel uygulaması'), f('Personel raporları'),
        ],
    },
    {
        id: 'isletme', name: 'İşletme', tagline: 'Yoğun işletmeler, birebir destek',
        monthly: 1999, yearlyTotal: 19990,
        features: [
            f("Ekip'teki her şey"), f('Öncelikli destek'), f('Birebir kurulum desteği'),
        ],
    },
];

/** Ücretsiz deneme uzunluğu — checkout'ta Dodo'ya geçilen değerle aynı olmalı. */
export const TRIAL_DAYS = 7;

export function planById(id: string | null | undefined): Plan | undefined {
    return PLANS.find((p) => p.id === id);
}

/** Bir dönemde ÇEKİLEN tutar: aylıkta aylık, yıllıkta yıllık toplam. */
export function priceOf(plan: Plan, cycle: Cycle): number {
    return cycle === 'yearly' ? plan.yearlyTotal : plan.monthly;
}

/** Yıllık ödemede aylığa düşen, tam TL'ye yuvarlı — yalnız vitrin. */
export function yearlyPerMonth(plan: Plan): number {
    return Math.round(plan.yearlyTotal / 12);
}

/** Yıllıkta yılda ne kadar az ödenir (TL). */
export function yearlySaving(plan: Plan): number {
    return plan.monthly * 12 - plan.yearlyTotal;
}

/**
 * Yıllık ödemede kaç ay bedava. "2 ay bedava" sabit yazılmıyor: fiyat
 * değişince yazı sessizce yalan olurdu.
 */
export function yearlyFreeMonths(plan: Plan): number {
    if (!plan.monthly) return 0;
    return Math.round(yearlySaving(plan) / plan.monthly);
}

/**
 * Bu plan bu kadar aktif çalışanlı işletmeye satılabilir mi. Sayı
 * bilinmiyorsa (herkese açık /fiyatlar) engellenmez; sunucu yine bakar.
 */
export function fitsTeam(plan: Plan, activeStaff: number | null | undefined): boolean {
    return plan.maxStaff == null || activeStaff == null || activeStaff <= plan.maxStaff;
}

/**
 * Yükseltme mi: daha büyük paket, ya da aynı pakette aylıktan yıllığa.
 * dodo-checkout · isUpgrade ile AYNI kural (tests/plan-degisimi eşler):
 * yükseltme hemen, düşürme bir sonraki fatura gününde.
 */
export function isUpgrade(fromPlan: string | null | undefined, fromCycle: string | null | undefined, toPlan: PlanId, toCycle: Cycle): boolean {
    const a = PLANS.findIndex((p) => p.id === fromPlan);
    const b = PLANS.findIndex((p) => p.id === toPlan);
    if (a !== b) return b > a;
    return fromCycle !== 'yearly' && toCycle === 'yearly';
}

const gunAy = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

export interface PlanChangeCopy { title: string; description: string; confirmLabel: string }

/**
 * Plan değiştirme onayının metni: ne zaman, ne kadar. Düşürmede sahibine
 * açıkça "bundan sonraki aylarda … ücreti çekilir" denir (kullanıcı kararı
 * 2026-10-22). `until`: dönem ya da deneme sonu (ekranda gösterilen gün).
 */
export function planChangeCopy(
    from: { plan: string | null | undefined; cycle: string | null | undefined },
    to: { plan: PlanId; cycle: Cycle },
    until: string | null | undefined,
    trial: boolean,
): PlanChangeCopy {
    const target = planById(to.plan) ?? PLANS[0];
    // Bölünmez boşluk: "₺1.299 /" ile "ay" ayrı satıra düşmesin.
    const price = `₺${formatTRY(priceOf(target, to.cycle))}\u00a0/\u00a0${to.cycle === 'yearly' ? 'yıl' : 'ay'}`;
    const day = until ? gunAy.format(new Date(until)) : null;
    const title = `${target.name} paketine geçilsin mi?`;
    const confirmLabel = `${target.name} paketine geç`;
    if (isUpgrade(from.plan, from.cycle, to.plan, to.cycle)) {
        return {
            title, confirmLabel,
            description: trial
                ? `Geçiş hemen olur. Deneme sürüyor; bugün ücret alınmaz. Deneme bittiğinde${day ? ` (${day})` : ''} ${price} çekilir.`
                : `Geçiş hemen olur. Bu dönemin kalan günlerinin farkı bugün kartınızdan çekilir; ${day ? `${day} tarihinden` : 'sonraki dönemden'} itibaren ${price} çekilir.`,
        };
    }
    const current = planById(from.plan)?.name ?? 'şimdiki';
    return {
        title, confirmLabel,
        description: `Geçiş ${day ? `${day} tarihinde` : 'bir sonraki fatura gününde'} başlar. O güne kadar ${current} paketiniz açık kalır; bundan sonraki ${to.cycle === 'yearly' ? 'yıllarda' : 'aylarda'} aboneliğinizden ${target.name} ücreti (${price}) çekilir.`,
    };
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
    return Math.round((yearlySaving(plan) / (plan.monthly * 12)) * 100);
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
