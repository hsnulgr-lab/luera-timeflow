/**
 * Müdür 27 — Müdür profili.
 *
 * Bu ekran bir AYAR PANELİ değil. Sahibin salonda gerçekten yapacağı işlerin
 * yeri: bugünün saatleri, yedi günün planı, hizmet fiyatları, hesabı.
 *
 * Sıralamanın kuralı "değeri bugün değişen şey önce": çalışma saati bir
 * cumartesi "18:00'de kapatıyoruz" denince değişir ve yanlış olduğunda para
 * kaybettirir — müşteri kapıda döner. Fiyat ayda bir, tema bir kez, şifre
 * yılda bir değişir.
 *
 * Saf: React yok, react-native yok, Expo yok.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 27 Profil.html`.
 */

import { upperTR } from './text.ts';

// ── Çalışma saatleri ────────────────────────────────────────────────────────

/** Pazartesi 0 → Pazar 6. `Date.getUTCDay()` pazarı 0 verir, kaydırılır. */
export const WEEKDAYS = [
    'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
] as const;

export interface DaySchedule {
    /** 0 = Pazartesi … 6 = Pazar. */
    day: number;
    /** Dakika cinsinden açılış. Kapalı günde de saklanır: gün açılınca geri gelir. */
    open: number;
    close: number;
    closed: boolean;
}

/** Saat aritmetiği tek adımda 15 dakika ilerler. */
export const STEP_MINUTES = 15;

/** Salon gece yarısını geçemez; açılış kapanıştan sonra olamaz. */
export const DAY_MIN = 0;
export const DAY_MAX = 24 * 60;

export function hhmm(minutes: number): string {
    const clamped = Math.max(DAY_MIN, Math.min(DAY_MAX, minutes));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * "09:00 – 20:00". Tire EN DASH ve boşluklu — tasarımın ölçü tablosunda
 * ayrıca belirtilmiş.
 */
export function rangeLabel(day: DaySchedule): string | null {
    if (day.closed) return null;
    return `${hhmm(day.open)} – ${hhmm(day.close)}`;
}

/** Kapalı gün saat yerine KELİME gösterir; renge emanet edilmez. */
export function dayValueLabel(day: DaySchedule): string {
    return rangeLabel(day) ?? 'Kapalı';
}

export function dayName(day: number): string {
    return WEEKDAYS[((day % 7) + 7) % 7];
}

/**
 * Basamak düğmesi. Açılış kapanışı geçemez, kapanış açılışın altına inemez —
 * ikisi arasında en az bir adım kalır.
 */
export function stepHour(
    day: DaySchedule,
    field: 'open' | 'close',
    direction: -1 | 1,
): DaySchedule {
    const next = (field === 'open' ? day.open : day.close) + direction * STEP_MINUTES;
    if (field === 'open') {
        const limit = day.close - STEP_MINUTES;
        return { ...day, open: Math.max(DAY_MIN, Math.min(limit, next)) };
    }
    const limit = day.open + STEP_MINUTES;
    return { ...day, close: Math.min(DAY_MAX, Math.max(limit, next)) };
}

/**
 * "Tüm günlere uygula" — saatleri kopyalar, KAPALI GÜNLERİ AÇMAZ.
 *
 * Pazar kapalıysa kapalı kalır. Salonların çoğunda yedi günün altısı aynı
 * saat; bu düğme 12 dokunuşu 1'e indiriyor — ama bir günü sessizce açsaydı
 * o gün için randevu alınabilir hâle gelirdi ve kimse fark etmezdi.
 */
export function applyToAllDays(
    hours: readonly DaySchedule[],
    source: DaySchedule,
): DaySchedule[] {
    return hours.map((day) => (
        day.closed ? day : { ...day, open: source.open, close: source.close }
    ));
}

/** "7 gün · Pazar kapalı" — satıra basmadan içeride ne olduğu okunur. */
export function hoursSummary(hours: readonly DaySchedule[]): string {
    const closed = hours.filter((day) => day.closed);
    if (closed.length === 0) return `${hours.length} gün · her gün açık`;
    if (closed.length === 1) return `${hours.length} gün · ${dayName(closed[0].day)} kapalı`;
    return `${hours.length} gün · ${closed.length} gün kapalı`;
}

// ── Bugün kartı ─────────────────────────────────────────────────────────────

export interface TodayCard {
    /** "BUGÜN · PERŞEMBE" — tr-TR büyütmeyle. */
    kicker: string;
    /** "09:00 – 20:00" ya da kapalı günde `null`. */
    range: string | null;
    open: boolean;
    /** "Şu anda açık" / "Şu anda kapalı" — durum KELİMEYLE yazılır. */
    statusWord: string;
    /**
     * "kapanışa 10 sa 19 dk". Kapalı günde ve kapanıştan sonra `null` —
     * satır HİÇ çizilmez, "0 dk" yazılmaz.
     */
    countdown: string | null;
}

function spanLabel(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} dk`;
    if (m === 0) return `${h} sa`;
    return `${h} sa ${m} dk`;
}

/**
 * Kart hem cümle hem kapı: hangi gün, hangi saatler, şu an açık mı.
 *
 * `weekday` 0 = Pazartesi. Kapalı günde geri sayım satırı çizilmez; açılışa
 * kalan süre de yazılmaz — bugün kapalıysa müdürün bekleyeceği bir şey yok.
 */
export function todayCard(
    hours: readonly DaySchedule[],
    weekday: number,
    nowMinutes: number,
): TodayCard {
    const index = ((weekday % 7) + 7) % 7;
    const day = hours.find((candidate) => candidate.day === index)
        ?? { day: index, open: 9 * 60, close: 19 * 60, closed: true };
    const kicker = upperTR(`Bugün · ${dayName(index)}`);

    if (day.closed) {
        return {
            kicker,
            range: null,
            open: false,
            statusWord: 'Şu anda kapalı',
            countdown: null,
        };
    }

    const open = nowMinutes >= day.open && nowMinutes < day.close;
    return {
        kicker,
        range: rangeLabel(day),
        open,
        statusWord: open ? 'Şu anda açık' : 'Şu anda kapalı',
        countdown: open ? `kapanışa ${spanLabel(day.close - nowMinutes)}` : null,
    };
}

// ── Hizmetler ───────────────────────────────────────────────────────────────

export interface SalonService {
    id: string;
    name: string;
    /** Dakika. */
    minutes: number;
    /** `null` FİYAT YOK demek — sıfır bir fiyattır, boşluk fiyat yok demektir. */
    price: number | null;
    color: string;
}

/** Takvim renkleri. Turuncu, kırmızı, amber ve yeşil DIŞINDA: o dördü durum taşır. */
export const SERVICE_COLORS = [
    { hex: '#4FA3A0', name: 'Deniz' },
    { hex: '#5B8FD9', name: 'Mavi' },
    { hex: '#8C7BC4', name: 'Mor' },
    { hex: '#C9748F', name: 'Gül' },
    { hex: '#8FA65A', name: 'Zeytin' },
    { hex: '#7E8A96', name: 'Duman' },
] as const;

export function colorName(hex: string): string | null {
    return SERVICE_COLORS.find((color) => color.hex === hex)?.name ?? null;
}

/**
 * "₺1.800" ya da "fiyat yok".
 *
 * "₺0" HİÇBİR ZAMAN yazılmaz: sıfır bir fiyattır (ücretsiz hizmet), boşluk
 * ise fiyatın girilmemiş olmasıdır. İkisini aynı metne toplamak müşteriye
 * "bu hizmet bedava" dedirtir.
 */
export function formatPrice(price: number | null): string {
    if (price === null) return 'fiyat yok';
    return `₺${Math.round(price).toLocaleString('tr-TR')}`;
}

export function hasPrice(service: SalonService): boolean {
    return service.price !== null;
}

/** "9 hizmet · 2 fiyatsız". Hepsinin fiyatı varsa ikinci parça yazılmaz. */
export function servicesSummary(services: readonly SalonService[]): string {
    const missing = services.filter((service) => service.price === null).length;
    const base = `${services.length} hizmet`;
    return missing > 0 ? `${base} · ${missing} fiyatsız` : base;
}

/** Liste altındaki uyarı. Eksik yoksa satır hiç çizilmez. */
export function priceWarning(services: readonly SalonService[]): string | null {
    const missing = services.filter((service) => service.price === null).length;
    if (missing === 0) return null;
    return `${missing} hizmetin fiyatı girilmemiş. Fiyatı olmayan hizmet müşteriye fiyatsız görünür.`;
}

/** Süre kısayolları — basamağın yanındaki haplar. */
export const DURATION_CHIPS = [30, 45, 60, 90, 120] as const;

export function stepDuration(minutes: number, direction: -1 | 1): number {
    return Math.max(5, Math.min(480, minutes + direction * 5));
}

/** Ad boşsa kaydedilemez; süre her zaman dolu. Fiyat İSTEĞE BAĞLI. */
export function serviceValid(draft: { name: string; minutes: number }): boolean {
    return draft.name.trim().length > 0 && draft.minutes > 0;
}

/**
 * Fiyat alanının metni sayıya döner. Boş metin `null` verir — "0" ile boş
 * AYNI ŞEY DEĞİL.
 */
export function parsePrice(text: string): number | null {
    const cleaned = text.replace(/[^\d]/g, '');
    if (cleaned.length === 0) return null;
    return Number(cleaned);
}

// ── Bildirimler ─────────────────────────────────────────────────────────────

export type NotificationKey = 'booked' | 'cancelled' | 'noshow' | 'daily';

export const NOTIFICATIONS: { key: NotificationKey; label: string }[] = [
    { key: 'booked', label: 'Yeni randevu' },
    { key: 'cancelled', label: 'Randevu iptali' },
    { key: 'noshow', label: 'Müşteri gelmedi' },
    { key: 'daily', label: 'Gün sonu özeti' },
];

/** "3 açık" — hiçbiri açık değilse de kelime yazılır. */
export function notificationsSummary(state: Record<NotificationKey, boolean>): string {
    const on = NOTIFICATIONS.filter((item) => state[item.key]).length;
    return on === 0 ? 'Kapalı' : `${on} açık`;
}

export const NOTIFICATION_FOOT =
    'Dördü de kapalıysa bildirim gelmez; ayrı bir ana anahtar yok.';

// ── Görünüm ─────────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light' | 'system';

export const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
    { key: 'dark', label: 'Koyu' },
    { key: 'light', label: 'Aydınlık' },
    { key: 'system', label: 'Sistem' },
];

export function themeLabel(mode: ThemeMode): string {
    return THEME_OPTIONS.find((option) => option.key === mode)?.label ?? 'Sistem';
}

export const THEME_FOOT = 'Sistem seçilirse tema cihazın ayarını izler.';

// ── Yasal ───────────────────────────────────────────────────────────────────

export interface LegalLink {
    key: 'kvkk' | 'privacy';
    label: string;
    /** Gösterilen alan adı. */
    host: string;
    url: string;
}

/**
 * KVKK metni ÜRÜNE gömülü değil, org başına URL.
 *
 * Sebep hukuki: veri sorumlusu her salonun kendisidir, Luera yalnız veri
 * işleyendir. Metin salonun kendi beyanıdır. URL boşsa satır PASİF DEĞİL,
 * HİÇ ÇİZİLMEZ — masaüstünden girilince belirir.
 */
export function legalLinks(kvkkUrl: string | null): LegalLink[] {
    const links: LegalLink[] = [];
    if (kvkkUrl && kvkkUrl.trim()) {
        links.push({
            key: 'kvkk',
            label: 'KVKK aydınlatma metni',
            host: hostOf(kvkkUrl),
            url: kvkkUrl,
        });
    }
    links.push({
        key: 'privacy',
        label: 'Gizlilik politikası',
        host: 'luera.app',
        url: 'https://luera.app/gizlilik',
    });
    return links;
}

function hostOf(url: string): string {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

/** Profil ana ekranındaki sağ değer. */
export function legalSummary(kvkkUrl: string | null): string {
    return kvkkUrl && kvkkUrl.trim() ? 'KVKK · Gizlilik' : 'Gizlilik';
}

// ── Hesap silme ─────────────────────────────────────────────────────────────

export interface DeletionInput {
    businessName: string;
    businessLocation: string;
    managerName: string;
    managerEmail: string | null;
    /** Bu işletmede başka müdür var mı? Sunucudan gelir; bilinmeden ekran açılmaz. */
    soleManager: boolean;
    appointments: number;
    customers: number;
    services: number;
    /** Erişimi düşecek personel adları. */
    staff: string[];
}

export interface DeletionLine {
    title: string;
    detail: string;
}

export interface DeletionCopy {
    /** Tek müdürse işletme de gider; ikinci müdür varsa yalnız kişisel hesap. */
    soleManager: boolean;
    lead: string;
    lines: DeletionLine[];
    /** Onay kutusu YALNIZ tek müdürde çizilir — yıkım o zaman işletmeyi kapsıyor. */
    consent: string | null;
    kept: string;
    timing: string;
    action: string;
    cancel: string;
}

/**
 * Silme akışının metni.
 *
 * "30 gün geri alınabilir bekleyen silme" REDDEDİLDİ: Apple 5.1.1(v) gerçek
 * silme istiyor ve geri alma penceresi zaten ulaşılamaz — oturumu kapanmış,
 * girişi engellenmiş kullanıcı iptal düğmesine nasıl basacak? Yedeklerdeki
 * kopyaların 30 gün içinde döngüden çıkması bir SAKLAMA SÜRESİDİR, bir
 * vazgeçme penceresi değil, ve öyle yazılır.
 */
export function deletionCopy(input: DeletionInput): DeletionCopy {
    const business = `${input.businessName} · ${input.businessLocation}`;
    const account: DeletionLine = {
        title: 'Hesabınız',
        detail: input.managerEmail
            ? `${input.managerName} · ${input.managerEmail}`
            : input.managerName,
    };

    if (!input.soleManager) {
        return {
            soleManager: false,
            lead: `${input.businessName} işletmesinin başka müdürleri var. Yalnız kişisel hesabınız silinir; işletme, randevular ve müşteriler yerinde kalır.`,
            lines: [
                account,
                { title: 'Bu işletmedeki yetkiniz', detail: business },
            ],
            consent: null,
            kept: 'Mevzuat gereği saklanan ödeme belgeleri kalır; pazarlama için kullanılmaz.',
            timing: 'Silme hemen başlar; oturumunuz kapanır. Yedeklerdeki kopyalar 30 gün içinde döngüden çıkar — bu bir vazgeçme süresi değildir.',
            action: 'Hesabı sil — basılı tutun',
            cancel: 'Vazgeç',
        };
    }

    const lines: DeletionLine[] = [
        account,
        {
            title: business,
            detail: `${input.appointments} randevu · ${input.customers} müşteri · ${input.services} hizmet · çalışma saatleri`,
        },
    ];
    if (input.staff.length > 0) {
        lines.push({
            title: `${input.staff.length} personelin bu işletmeye erişimi`,
            detail: `${input.staff.join(', ')} — kendi hesapları silinmez, bu işletme listelerinden düşer`,
        });
    }

    return {
        soleManager: true,
        lead: `${input.businessName}'ün tek müdürü sizsiniz. Hesabınız silinince işletme de silinir.`,
        lines,
        consent: 'İşletmenin ve içindeki tüm randevuların silineceğini anlıyorum.',
        kept: 'Mevzuat gereği saklanan ödeme belgeleri kalır; pazarlama için kullanılmaz.',
        timing: 'Silme hemen başlar; oturumunuz kapanır. Yedeklerdeki kopyalar 30 gün içinde döngüden çıkar — bu bir vazgeçme süresi değildir.',
        action: 'Hesabı sil — basılı tutun',
        cancel: 'Vazgeç',
    };
}

/** Basılı tutma süresi. Bir güvenlik ölçüsü, bir efekt değil. */
export const HOLD_MS = 2000;

/** Onay kutusu işaretlenmeden silme düğmesi çalışmaz. */
export function canDelete(copy: DeletionCopy, consented: boolean): boolean {
    return copy.consent === null || consented;
}

export const DELETE_TITLE = 'Hesabı sil';
export const DELETE_WARN = 'Bu işlem geri alınamaz.';
export const DELETE_KEPT_LABEL = 'Silinmeyen';

/**
 * Silmeden ÖNCE dışa aktarma.
 *
 * Salon, vergi mevzuatı gereği kendi finansal kayıtlarını saklamak zorunda —
 * ve biz onun bütün verisini siliyoruz. Uyarmadan silmek, "bütün ciro geçmişim
 * gitti" cümlesinin sorumluluğunu bize bırakır.
 *
 * Dışa aktarma masaüstünde ZATEN var (Ayarlar → Veri; CSV). Cepte ikinci bir
 * dışa aktarma yazmak yerine oraya yönlendiriliyor: yıllık kayıt indirmek
 * telefonda yapılacak bir iş değil. Bağlantı ödeme değil veri indirme
 * olduğu için App Store 3.1.1 kapsamına girmiyor.
 */
export const DELETE_EXPORT_LABEL = 'Önce kayıtlarınızı indirin';
export const DELETE_EXPORT_BODY =
    'Müşteri, randevu ve tahsilat kayıtlarınız silinince geri getirilemez. '
    + 'Masaüstünde Ayarlar → Veri’den CSV olarak indirebilirsiniz.';
export const DELETE_EXPORT_ACTION = 'Masaüstünde aç';
/** Web uygulamasındaki dışa aktarma sekmesi. */
export const DELETE_EXPORT_PATH = '/settings?tab=data';
export const DELETE_TIMING_LABEL = 'SÜRE';
export const DELETE_HOLD_HINT = 'Bırakmayın';

/**
 * Sunucu hatası satırı.
 *
 * "Hesabınız silindi" YALNIZ sunucu başarıyla döndükten sonra yazılır.
 * Başarısız her yolda ekran yerinde kalır ve hesabın DURDUĞU söylenir —
 * çünkü gerçekten duruyor.
 */
export const DELETE_FAILED =
    'Silme tamamlanamadı. Hesabınız ve verileriniz olduğu gibi duruyor.';

/**
 * Neden başarısız olduğunu söyleyen cümle.
 *
 * Tek bir "bir hata oldu" yetmiyor: sebepler kullanıcının atacağı adımı
 * değiştiriyor. Yetkisi yoksa tekrar denemenin anlamı yok; oturumu düşmüşse
 * tekrar girmesi gerekiyor; abonelik takıldıysa sorun bizde ve tekrar denemek
 * işe yarayabilir.
 *
 * Hiçbirinde teknik ayrıntı yazılmıyor ve hepsinde aynı güvence tekrarlanıyor:
 * hesap duruyor.
 */
export type DeleteFailureReason =
    'not-configured' | 'no-session' | 'forbidden' | 'subscription' | 'server';

export function deleteFailureText(reason: DeleteFailureReason | null): string {
    if (reason === 'forbidden') {
        return 'Bu işletmeyi yalnız sahibi silebilir. Hesabınız olduğu gibi duruyor.';
    }
    if (reason === 'no-session') {
        return 'Oturumunuz kapanmış. Tekrar girip deneyin. Hesabınız olduğu gibi duruyor.';
    }
    if (reason === 'subscription') {
        return 'Aboneliğiniz iptal edilemediği için silme yapılmadı. Hesabınız ve verileriniz olduğu gibi duruyor.';
    }
    return DELETE_FAILED;
}
