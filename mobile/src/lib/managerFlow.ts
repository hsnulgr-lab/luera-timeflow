/**
 * Müdür ana ekranının karar katmanı — saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Ekranın tamamı dört katman: dev başlık · personel şeridi · özet şeridi ·
 * olay akışı. Burada yalnız son üçünün verisi ve kuralları var.
 */

import { todayISO } from './calendar.ts';
import { CURRENCY, formatAmount, waitLabel, type Pending } from './cash.ts';
import { accusative, dative } from './text.ts';

export type StaffState = 'busy' | 'free' | 'leave' | 'off';

export interface StaffPresence {
    id: string;
    initials: string;
    name: string;
    state: StaffState;
    /** Yalnız `busy` için: işlemin başlamasından bu yana geçen dakika. */
    minutes?: number;
}

/**
 * Olay türleri. Her biri akışta bir satır; renk noktası türü söyler ama
 * ANLAMI KELİME taşır — renk tek başına anlam taşımaz.
 */
export type FlowKind =
    | 'next'        // sıradaki randevu
    | 'arrived'     // müşteri geldi
    | 'started'     // işlem başladı
    | 'finished'    // işlem bitti
    | 'due'         // adisyon bekliyor
    | 'paid'        // tahsilat alındı
    | 'booked'      // yeni online randevu
    | 'cancelled'   // randevu iptal edildi
    | 'noshow';     // müşteri gelmedi

export type FlowTone = 'orange' | 'green' | 'amber' | 'red' | 'neutral';

export interface FlowEvent {
    id: string;
    /** HH:MM */
    time: string;
    kind: FlowKind;
    firstName: string;
    lastName: string;
    /** "Keratin bakımı · 45 dk · Selin ile" */
    detail: string;
    /** Canlı işlem: saniye cinsinden geçen süre. */
    elapsedSeconds?: number;
    startedAt?: string;
    staffInitials?: string;
    staffName?: string;
    amount?: string;

    // ── Müdür 17 · sıradaki randevu kartı ────────────────────────────────
    /**
     * Randevu saatine göre şu an. ARTI = girmesine kalan dakika, EKSİ =
     * gecikilen dakika. Yalnız `kind === 'next'` için anlamlı.
     *
     * Bu değer İSTEMCİDE SAYAÇLA ÜRETİLMİYOR: sunucu her yenilemede kendi
     * saatinden hesaplayıp gönderecek. Telefonun saati yanlışsa randevu
     * yanlış gecikmez.
     */
    etaMinutes?: number;
    /** Baş harfler — A2 kartının yuvarlağı. Yoksa addan türetilir. */
    customerInitials?: string;
    /** Müşteri bağlamı. Hiçbiri yoksa A1, en az biri varsa A2 çizilir. */
    context?: ApptContext;
    /** Randevunun atandığı personel; şeritteki durumla eşleşmek için. */
    staffId?: string;
    /** Hizmet süresi — A1 panelinin alt satırı ("11:30 · 45 dk"). */
    durationMinutes?: number;
    /**
     * Bu olayın işaret ettiği randevu. Varsa satırın ⋮ düğmesi detayı açar;
     * YOKSA düğme HİÇ ÇİZİLMEZ — dokunulup hiçbir şey olmayan bir nokta,
     * olmayan bir noktadan kötüdür.
     */
    appointmentId?: string;

    // ── Müdür 20 · bekleme kartı ─────────────────────────────────────────
    /**
     * Müşterinin salona girmesinden bu yana geçen dakika. Yalnız
     * `kind === 'arrived'` için anlamlı.
     *
     * `etaMinutes` gibi SUNUCUDAN gelir, istemcide telefonun saatinden
     * hesaplanmaz: yanlış ayarlı bir telefon müşteriyi 40 dakika bekletmiş
     * gibi gösterip müdürü boşuna personelin üstüne yollardı.
     */
    waitMinutes?: number;
    /** Randevusuz gelen müşteri: geri sayım yoktu, ölçülecek tek şey bekleme. */
    walkin?: boolean;
    /** Personel az önce boşaldı, bu müşteriye geçiyor — kart yerine devir satırı. */
    handoff?: boolean;
    /**
     * Müdür personele söylediğinde beklemenin kaçıncı dakikasıydı.
     *
     * Boole DEĞİL, çünkü söz BAYATLAR: 1 dakika önce söylenmiş ile 6 dakika
     * önce söylenmiş aynı şey değil. Saat de tutmuyoruz — `waitMinutes` zaten
     * sunucudan geliyor, damga onun farkından türüyor.
     */
    remindedAt?: number;
    /** Müdür beklemeyi kabul etti: eşik tırmanışı susar. */
    parked?: boolean;

    // ── Müdür 21 · tahsilat ve gelmedi ───────────────────────────────────
    /** Tutar — SAYI. Biçim (binlik ayırıcı, ₺'nin yeri) görünüm katmanının işi. */
    amountValue?: number;
    /** Adisyon kasada kaç dakikadır bekliyor. */
    dueMinutes?: number;
    /** Dünden devreden adisyon — bekleme saatle yazılır. */
    carriedOver?: boolean;
    /** Hizmeti kim verdi. Personel hapı değil CÜMLE: "Merve verdi". */
    servedBy?: string;
    /** Tahsilatın alındığı saat — D3 satırı. */
    paidAt?: string;
    /** Randevu saatinden bu yana geçen dakika. `noshow` için. */
    noshowMinutes?: number;
    /** Otomatik düşme anı — "Müşteri kartına yazıldı · 12:00". */
    droppedAt?: string;
}

/**
 * Müşteri bağlamı — üçü de İSTEĞE BAĞLI.
 *
 * Alan boşsa kutusu hiç çizilmez; boş etiketli boş satır bırakılmaz. Bu
 * yüzden kart bağlam arttıkça uzar, azaldıkça kısalır — sabit yükseklik yok.
 */
export interface ApptContext {
    /** "₺450 borç var" */
    balance?: string;
    /** "Saç boyasına alerjisi var" */
    note?: string;
    /** "10 seanslık bakım · 4/10" */
    package?: string;
}

/** Akışta noktanın rengi. Kelime her zaman yanında yazar. */
export function toneOf(kind: FlowKind): FlowTone {
    switch (kind) {
        case 'next':
        case 'started':
            return 'orange';
        case 'paid':
        case 'finished':
            return 'green';
        // "Müşteri geldi" YEŞİL DEĞİL. Yeşil "bitti" der; oysa burada hiçbir şey
        // bitmedi — müşteri içeride ve bir şey BEKLENİYOR. Masaüstü de bu satırı
        // amber çiziyor (`GuzellikDashboard` PHASE_UI: arrived → waiting).
        // Uzun beklemede kırmızıya döner; onu `waitCard().level` söyler.
        case 'arrived':
        case 'due':
            return 'amber';
        case 'cancelled':
        case 'noshow':
            return 'red';
        default:
            return 'neutral';
    }
}

const LABELS: Record<FlowKind, string> = {
    next: 'sıradaki randevu',
    // Satırın etiketi bekleme seviyesine göre değişir (`waitCard().label`);
    // bu yalnız sakin hâlin karşılığı ve seviyesiz çağıranlar için yedek.
    arrived: 'geldi · bekliyor',
    started: 'işlem başladı',
    finished: 'işlem bitti',
    due: 'adisyon bekliyor',
    paid: 'tahsilat alındı',
    booked: 'yeni randevu',
    cancelled: 'randevu iptal edildi',
    noshow: 'müşteri gelmedi',
};

export function labelOf(kind: FlowKind): string {
    return LABELS[kind];
}

/**
 * Olmuş bitmiş olaylar soluk gösterilir; yapılacak bir şey kalmadı.
 * "Gelmedi" SOLUK DEĞİL: müdürün görmesi gereken bir şey.
 */
export function isSettled(kind: FlowKind): boolean {
    return kind === 'finished' || kind === 'paid' || kind === 'cancelled';
}

/**
 * Kartın içindeki eylemler. Üç nokta menüsüne gömülmez — Instagram'da beğeni
 * kartın içindedir, bizde de "Geldi" ve "Tahsil et" öyle.
 */
export interface FlowAction {
    label: string;
    kind: 'primary' | 'secondary';
}

export function actionsOf(kind: FlowKind): FlowAction[] {
    if (kind === 'next') {
        return [
            { label: 'Geldi', kind: 'primary' },
            { label: 'Gelmedi', kind: 'secondary' },
        ];
    }
    if (kind === 'due') return [{ label: 'Tahsil et', kind: 'primary' }];
    return [];
}

/** Personel şeridi sırası: işlemde olanlar önce, sonra müsait, sonra çalışmayanlar. */
const STATE_ORDER: Record<StaffState, number> = { busy: 0, free: 1, leave: 2, off: 3 };

export function sortPresence(list: readonly StaffPresence[]): StaffPresence[] {
    return [...list].sort((a, b) => {
        const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
        if (byState !== 0) return byState;
        // İşlemdekiler kendi aralarında en uzun sürene göre: müdürün ilk
        // bakacağı kişi en uzun süredir işlemde olandır.
        if (a.state === 'busy' && b.state === 'busy') {
            return (b.minutes ?? 0) - (a.minutes ?? 0);
        }
        return a.name.localeCompare(b.name, 'tr-TR');
    });
}

/**
 * "6 dk" · "51 dk" — GERİ SAYIM rakamı.
 *
 * `durationBadge`den tek farkı sıfırla doldurmaması, ama fark bilinçli:
 * rozet dar bir kutuda sabit genişlik ister ("08 dk" · "41 dk" yan yana
 * zıplamasın), kahraman rakam istemez. Tasarım da böyle yazıyor: "6 dk",
 * "8 dk", "51 dk" — "06 dk" değil.
 */
export function minuteLabel(minutes: number): string {
    const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
    if (safe < 60) return `${safe} dk`;
    const hours = Math.floor(safe / 60);
    const rest = safe % 60;
    return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

/** "24 dk" — süre rozeti. Saat aşarsa saate döner, üç haneli dakika okunmaz. */
export function durationBadge(minutes: number): string {
    const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
    if (safe < 60) return `${String(safe).padStart(2, '0')} dk`;
    const hours = Math.floor(safe / 60);
    const rest = safe % 60;
    return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

export interface DaySummary {
    revenue: string;
    occupancy: string;
}

export interface ManagerDay {
    dateISO: string;
    appointmentCount: number;
    presence: StaffPresence[];
    summary: DaySummary;
    events: FlowEvent[];
}

/**
 * Kasada bekleyen adisyonların TOPLAMI — akıştaki `due` satırlarından türer.
 *
 * Kasa ekranı kendi sabit sayısını taşıyordu (`cash.mockPending`, 2 adisyon /
 * ₺2.650) ve akış üç adisyon gösteriyordu. Aynı salonun iki ekranı iki farklı
 * gerçek söylüyordu; müdür hangisine inanacağını bilemez.
 */
export function pendingOf(events: readonly FlowEvent[]): Pending {
    const dues = events.filter((event) => event.kind === 'due');
    const oldest = dues.reduce((max, event) => Math.max(max, event.dueMinutes ?? 0), 0);
    return {
        count: dues.length,
        amount: dues.reduce((sum, event) => sum + (event.amountValue ?? 0), 0),
        oldestMinutes: oldest,
        // "Dünden kaldı" bir tanesi bile devrediyorsa doğrudur.
        carriedOver: dues.some((event) => event.carriedOver) || undefined,
    };
}

/**
 * Şu an işlemde olan personel sayısı — akışın değil ŞERİDİN gerçeği.
 *
 * Önce `mockDay.activeCount` diye sabit bir sayıydı: akışta bir işlem
 * görünürken başlık "3 işlem sürüyor" yazıyordu. Aynı ekranda iki farklı
 * gerçek, en çok güven kaybettiren şeydir.
 */
export function activeCountOf(presence: readonly StaffPresence[]): number {
    return presence.filter((person) => person.state === 'busy').length;
}

/** "Perşembe · 14 randevu · 3 işlem sürüyor" — sürmeyen işlem yazılmaz. */
export function headline(weekday: string, appointments: number, active: number): string {
    const base = `${weekday} · ${appointments} randevu`;
    return active > 0 ? `${base} · ${active} işlem sürüyor` : base;
}

/**
 * Yeni kurulan randevunun AKIŞTAKİ karşılığı.
 *
 * `booked` ("yeni randevu") türü baştan beri tanımlıydı ama hiç üretilmiyordu:
 * müdür randevu kuruyor, onay ekranını görüyor, Akış'a dönüyor ve randevu
 * orada YOK. Uygulama yaptığını söylediği şeyi göstermiyordu.
 *
 * Saat randevunun kendi saati — "şu an kuruldu" damgası uydurulmuyor; akış
 * kronolojik ve satır kendi yerine oturuyor.
 */
export function bookedEvent(appointment: {
    id: string; customer_name: string; start_time: string;
    service: string; staff_id?: string | null;
}, staffName?: string | null): FlowEvent {
    const [first = '', ...rest] = appointment.customer_name.trim().split(/\s+/);
    const detail = staffName
        ? `${appointment.service} · ${staffName} ile`
        : appointment.service;
    return {
        id: `booked-${appointment.id}`,
        time: appointment.start_time.slice(0, 5),
        kind: 'booked',
        firstName: first,
        lastName: rest.join(' '),
        detail,
        appointmentId: appointment.id,
        staffId: appointment.staff_id ?? undefined,
        staffName: staffName ?? undefined,
    };
}

/**
 * Seçilen günün boş hâli — cetvel başka bir güne kayınca.
 *
 * Bugün boşsa gün HENÜZ BAŞLAMAMIŞTIR; başka bir gün boşsa o gün gerçekten
 * boş geçmiştir. İki farklı şey, iki farklı cümle: hiçbiri "bir hata var"
 * hissi vermemeli.
 */
export function emptyFlow(isToday: boolean, dayLabel: string): { label: string; hint: string } {
    return isToday
        ? {
            label: 'Bugün henüz bir şey olmadı',
            hint: 'Randevu geldiğinde, müşteri girdiğinde ve tahsilat alındığında burada görünür.',
        }
        : {
            label: `${dayLabel} boş geçti`,
            hint: 'O gün randevu, işlem ve tahsilat kaydı yok.',
        };
}

/**
 * Akış GÜNDE BİTER. Sonsuz kaydırma yok: dünü görmek ayrı bir eylem.
 * Bu satır listenin sonunda görünür.
 */
export const FLOW_END = 'Bugünlük bu kadar';

// ── Müdür 17 · sıradaki randevu kartı ───────────────────────────────────────
//
// Tek bir karar ağacı, iki kart, iki hâl:
//
//            bağlam yok            bağlam var
//   zamanında  A1 · zamanında      A2 · zamanında
//   gecikmiş   A1 · gecikmiş       A2 · gecikmiş
//
// "Bağlamı ağır" ayrı bir kart DEĞİL: A2'nin üç alanı birden dolu hâli. Kart
// içerik kadar uzar, boş kutu bırakmaz.

/**
 * Gecikme toleransı. Müşteri randevu saatinden bu kadar dakika sonra hâlâ
 * gelmediyse rezervasyon otomatik düşer.
 *
 * DİKKAT — burada yalnız EŞİK var, düşürme işi yok. Randevuyu gerçekten iptal
 * edip müşteri kartına yazacak sunucu işi (cron ya da uç) HENÜZ YAZILMADI.
 * `autoCancelled` istemcide yalnız GÖRÜNÜMÜ değiştirir; sunucu bunu doğrulayana
 * kadar kalıcı bir şey olmaz.
 */
export const LATE_LIMIT_MINUTES = 30;

/** Bağlamdan en az biri dolu mu? Boş dize bağlam sayılmaz. */
export function hasContext(context?: ApptContext): boolean {
    if (!context) return false;
    return Boolean(context.balance?.trim() || context.note?.trim() || context.package?.trim());
}

export type NextCardKind = 'a1' | 'a2';

/**
 * Hangi kart çizilecek. Karar VERİDEN gelir — çağıran seçmez, seçemez.
 * Not/bakiye/paket girildiği anda A1 kendiliğinden A2'ye döner.
 */
export function nextCardKind(event: Pick<FlowEvent, 'context'>): NextCardKind {
    return hasContext(event.context) ? 'a2' : 'a1';
}

/** Gecikilen dakika. Zamanında ya da erkense 0. */
export function lateMinutes(etaMinutes?: number): number {
    if (etaMinutes == null || !Number.isFinite(etaMinutes)) return 0;
    return etaMinutes < 0 ? Math.floor(-etaMinutes) : 0;
}

export function isLate(etaMinutes?: number): boolean {
    return lateMinutes(etaMinutes) > 0;
}

/** Otomatik düşmeye kalan dakika. Gecikme yoksa tolerans da tükenmiyor. */
export function graceLeft(etaMinutes?: number): number {
    const late = lateMinutes(etaMinutes);
    if (late === 0) return LATE_LIMIT_MINUTES;
    return Math.max(0, LATE_LIMIT_MINUTES - late);
}

/** Tolerans doldu mu? 30 dakika ve üstü. */
export function autoCancelled(etaMinutes?: number): boolean {
    return lateMinutes(etaMinutes) >= LATE_LIMIT_MINUTES;
}

// ── Türkçe saat çekimi ──────────────────────────────────────────────────────
// "11:30’da bekleniyordu" · "12:15’te bekleniyordu". Ek okunuşa göre değişir,
// rakama göre değil; bu yüzden tablo. Kısaltma yapılmaz, yanlış ek okumayı
// bozar ve hedef kitle 40–55 yaş.

const MINUTE_LOCATIVE: Record<number, string> = {
    5: 'te', 10: 'da', 15: 'te', 20: 'de', 25: 'te', 30: 'da',
    35: 'te', 40: 'ta', 45: 'te', 50: 'de', 55: 'te',
};

const HOUR_LOCATIVE: Record<number, string> = {
    0: 'da', 1: 'de', 2: 'de', 3: 'te', 4: 'te', 5: 'te', 6: 'da', 7: 'de',
    8: 'de', 9: 'da', 10: 'da', 11: 'de', 12: 'de', 13: 'te', 14: 'te',
    15: 'te', 16: 'da', 17: 'de', 18: 'de', 19: 'da', 20: 'de', 21: 'de',
    22: 'de', 23: 'te',
};

/** "11:30" → "11:30’da". Dakika 00 ise ek SAATİN okunuşundan gelir. */
export function atClock(time: string): string {
    const [rawHour, rawMinute] = time.split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
    const suffix = minute === 0
        ? HOUR_LOCATIVE[hour] ?? 'de'
        : MINUTE_LOCATIVE[minute] ?? 'de';
    return `${time}’${suffix}`;
}

/** A1 panelinin üç satırı. */
export interface EtaPanel {
    /** "girmesine" · "gecikti" */
    label: string;
    /** "6 dk" */
    value: string;
    /** "11:30 · 45 dk" · "11:30’da bekleniyordu" */
    sub: string;
    late: boolean;
}

export function etaPanel(event: Pick<FlowEvent, 'time' | 'etaMinutes' | 'durationMinutes'>): EtaPanel {
    const late = isLate(event.etaMinutes);
    if (late) {
        return {
            label: 'gecikti',
            value: minuteLabel(lateMinutes(event.etaMinutes)),
            sub: `${atClock(event.time)} bekleniyordu`,
            late: true,
        };
    }
    const remaining = Math.max(0, Math.floor(event.etaMinutes ?? 0));
    const sub = event.durationMinutes != null
        ? `${event.time} · ${durationBadge(event.durationMinutes)}`
        : event.time;
    return { label: 'girmesine', value: minuteLabel(remaining), sub, late: false };
}

/** A2 kartının sağ sütunu: büyük rakam + altında ne olduğu. */
export function etaColumn(event: Pick<FlowEvent, 'time' | 'etaMinutes'>): {
    value: string; sub: string; late: boolean;
} {
    const late = isLate(event.etaMinutes);
    if (late) {
        return { value: minuteLabel(lateMinutes(event.etaMinutes)), sub: 'gecikti', late: true };
    }
    const remaining = Math.max(0, Math.floor(event.etaMinutes ?? 0));
    return { value: minuteLabel(remaining), sub: event.time, late: false };
}

/** A2 not kutusunun satırları. Boş alan satır üretmez. */
export interface ContextRow {
    label: string;
    text: string;
}

export function contextRows(context?: ApptContext): ContextRow[] {
    if (!context) return [];
    const rows: ContextRow[] = [];
    // Sıra sabit: para → uyarı → hak. Kart her müşteride aynı yerde okunur.
    if (context.balance?.trim()) rows.push({ label: 'bakiye', text: context.balance.trim() });
    if (context.note?.trim()) rows.push({ label: 'not', text: context.note.trim() });
    if (context.package?.trim()) rows.push({ label: 'paket', text: context.package.trim() });
    return rows;
}

/**
 * Gecikme rozeti — panelin ALTINDA, kartın içinde değil.
 *
 * Sebep: panelin kendi satırları randevunun ölçüsünü söylüyor; toleransın
 * geri sayımı randevunun değil KURALIN ölçüsü. Ayrı düzlemde durur.
 * Gecikme yokken hiç çizilmez.
 */
export function toleranceLabel(etaMinutes?: number): string | null {
    if (!isLate(etaMinutes)) return null;
    if (autoCancelled(etaMinutes)) return 'otomatik düştü';
    return `${graceLeft(etaMinutes)} dk sonra düşer`;
}

/**
 * "Selin şu an işlemde · 08 dk".
 *
 * Randevunun personeli ŞU AN başka işlemdeyse müdürün bilmesi gerekir:
 * müşteri geldiğinde bekleyecek. Şeritteki gerçek duruma bakılır, sabit metin
 * yazılmaz — personel boşsa satır hiç çizilmez.
 */
export function staffConflict(
    event: Pick<FlowEvent, 'staffId'>,
    presence: readonly StaffPresence[],
): { name: string; badge: string } | null {
    if (!event.staffId) return null;
    const person = presence.find((p) => p.id === event.staffId);
    if (!person || person.state !== 'busy' || person.minutes == null) return null;
    return { name: person.name, badge: durationBadge(person.minutes) };
}

/** A2 kartının yuvarlağı. Veri baş harf taşımıyorsa addan türer. */
/**
 * Kart eylemlerinin akışta karşılığı — saf.
 *
 * "Geldi" bir görüntü değişikliği değil, olayın TÜRÜNÜN değişmesidir: satır
 * sıradaki randevu olmaktan çıkıp müşteri geldiye döner, rengi ve eylemleri
 * kendiliğinden değişir.
 *
 * SAAT DEĞİŞMİYOR. Olayın gerçekleştiği an sunucudan gelecek; istemcide
 * telefonun saatinden uydurmak, sahte veriyle dolu bir günde 11:30'lar
 * arasında 02:15 yazan bir satır üretirdi.
 *
 * Tanınmayan eylem `null` döner — çağıran hiçbir şey değiştirmez.
 */
export function applyFlowAction(event: FlowEvent, label: string): FlowEvent | null {
    if (event.kind === 'next' && label === 'Geldi') {
        // Müşteri içeride: geri sayım yerini bekleme sayacına bırakır, sıfırdan.
        //
        // `etaMinutes` SİLİNMİYOR — önceden siliniyordu, ama artık bu adımın
        // geri alması var ("Geri al", 5 sn). Silinseydi geri dönen satır geri
        // sayımını kaybederdi. Kind değiştiği için hiçbir yerde çizilmiyor.
        return { ...event, kind: 'arrived', waitMinutes: 0 };
    }
    if (event.kind === 'next' && label === 'Gelmedi') {
        const { etaMinutes: _eta, ...rest } = event;
        return { ...rest, kind: 'noshow' };
    }
    if (event.kind === 'due' && label === 'Tahsil et') {
        return { ...event, kind: 'paid' };
    }
    return null;
}

// ── Müdür 20 · bekleme ──────────────────────────────────────────────────────
//
// Akış kararı veritabanında yazılı (`supabase/043_customer_arrived.sql`):
// müdür "Geldi"ye basar → personele bildirim gider → hizmeti PERSONEL başlatır.
// Müdür başlatmaz; personelin elinde başka müşteri ya da mola olabilir.
//
// İki damga ayrı: `customer_arrived_at` = geldi, `arrived_at` = hizmet başladı.
// Aradaki boşluk bu dosyada `kind:'arrived'` + `waitMinutes` ile modellenir.

/** Müşteri bu kadar dakikadır bekliyorsa müdür karşılamaya yönlendirilir. */
export const WAIT_WARN_MINUTES = 5;
/**
 * Uzun bekleme eşiği. Masaüstünün baskın eşiğiyle AYNI sayı
 * (`KuaforReservationsPage` lateWaits, `GuzellikDashboard` uyarısı): aynı
 * müşteri iki ekranda iki farklı renkte görünmesin.
 */
export const WAIT_LATE_MINUTES = 10;

/**
 * Damga bu kadar dakika taze kalır, sonra söner ve düğme geri gelir.
 *
 * Kartın ölmemesi için: müşteri hâlâ bekliyorsa 6 dakika önce söylenmiş söz
 * yenilenmelidir. İlk uygulamada damgalar hiç sönmüyordu ve 14 dakikadır
 * bekleyen bir müşterinin kartında yapılacak hiçbir şey kalmıyordu.
 */
export const STAMP_FRESH_MINUTES = 5;

/** "şimdi" · "3 dk" — damganın üstündeki tazelik. */
export function stampAge(minutes: number): string {
    return minutes <= 0 ? 'şimdi' : `${minutes} dk`;
}

export type WaitLevel = 'calm' | 'warn' | 'late';

export function waitLevel(minutes?: number): WaitLevel {
    const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes as number)) : 0;
    if (safe >= WAIT_LATE_MINUTES) return 'late';
    if (safe >= WAIT_WARN_MINUTES) return 'warn';
    return 'calm';
}

/**
 * Kahraman rakam iki parçaya bölünür: sayı ve birim.
 *
 * Sebep tasarımdan: sayı tabular (SF Pro), birim metin (Hanken) ve 17 pt —
 * "4 dk" tek düğüm olsaydı birim de rakam gibi davranırdı. Aynı bölünme
 * bekleme sayacını canlı sayaçtan da ayırıyor: `24:18` iki nokta ile konuşur,
 * bekleme birimini KELİMEYLE söyler.
 */
export function waitHero(minutes?: number): { value: string; unit: string } {
    const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes as number)) : 0;
    if (safe < 60) return { value: String(safe), unit: 'dk' };
    const hours = Math.floor(safe / 60);
    const rest = safe % 60;
    if (rest === 0) return { value: String(hours), unit: 'sa' };
    return { value: `${hours} sa ${rest}`, unit: 'dk' };
}

export interface WaitAction {
    label: string;
    /**
     * `fill` yalnız 10. dakikadaki "Hatırlat"ta — kartın tek dolu hapı.
     * `stamp` basılamaz: tüketilen düğmenin yerinde duran DAMGA. Düğme
     * kaybolup yerinde boşluk bırakmıyor, damgaya dönüşüyor — müdür ne
     * yaptığını kartta görüyor.
     */
    kind: 'hap' | 'fill' | 'ghost' | 'stamp';
    /** Damgada yeşil nokta — "bitti" anlamı. Yalnız tamamlanmış işlerde. */
    done?: boolean;
}

export interface WaitCard {
    level: WaitLevel;
    label: string;
    value: string;
    unit: string;
    /** Alt satır. Çakışma satırı çizilecekse null. */
    sub: string | null;
    /** "Selin şu an işlemde · 08 dk" — yalnız sakin hâlde. */
    conflict: string | null;
    actions: WaitAction[];
}

/**
 * Bekleme kartının tamamı — tek karar, tek yerde.
 *
 * `fresh` = müdür "Geldi"ye BU OTURUMDA bastı. O zaman kart yalnız geri almayı
 * sunar: personel müsaitse müdürün yapacağı bir şey yok, kart kendi kendine
 * ilerler; kartta bu yüzden sadece yanlış basışın çıkışı durur.
 */
export function waitCard(
    event: FlowEvent,
    presence: readonly StaffPresence[] = [],
    fresh = false,
): WaitCard {
    const level = event.parked ? 'calm' : waitLevel(event.waitMinutes);
    const hero = waitHero(event.waitMinutes);
    const staff = event.staffName?.trim() ?? '';
    const busy = level === 'calm' ? staffConflict(event, presence) : null;

    let label: string;
    if (level === 'late') label = 'uzun bekliyor';
    else if (level === 'warn') label = 'bekliyor · karşıla';
    else label = event.walkin ? 'randevusuz · bekliyor' : 'geldi · bekliyor';

    let sub: string | null;
    if (busy) {
        sub = null;
    } else if (level === 'late') {
        // Masaüstünün cümlesi birebir: "{ad} {n} dakikadır bekliyor".
        sub = `${event.firstName} ${Math.max(0, Math.floor(event.waitMinutes ?? 0))} dakikadır bekliyor`;
    } else if (event.parked) {
        sub = staff ? `Beklemeye alındı · ${accusative(staff)} bekliyor` : 'Beklemeye alındı';
    } else if (level === 'warn') {
        sub = staff ? `Bekleme alanı · ${accusative(staff)} bekliyor` : 'Bekleme alanı';
    } else {
        // "düştü" — durumu söyler, TESLİMAT İDDİA ETMEZ. Bildirim kanalı
        // değişse de (bugün web push, yarın Expo) bu cümle doğru kalır.
        sub = staff ? `Bekleme alanı · ${dative(staff)} düştü` : 'Bekleme alanı';
    }
    // Damga ne kadar süredir orada? Tazeliğini yitirince yerini yeniden
    // düğmeye bırakır — söz bayatlar, kart ölmez.
    const now = Math.max(0, Math.floor(event.waitMinutes ?? 0));
    const since = (at?: number) => (at == null ? null : Math.max(0, now - at));
    const stamp = (at: number | null, who: string): WaitAction | null => (
        at != null && at < STAMP_FRESH_MINUTES
            ? { label: `${who} · ${stampAge(at)}`, kind: 'stamp' }
            : null
    );

    // Her seviyede TEK eylem.
    //
    // Burada bir de "Müşteriye söyle" vardı ve KALDIRILDI: kaydı okuyan hiçbir
    // yer yok — ne masaüstünde böyle bir alan var, ne personel görüyor, ne gün
    // sonunda bir yere yazılıyor. Düğme yalnız müdüre kendi yaptığını beş
    // dakika hatırlatıyordu. Müdürün ihtiyacı olan şey NE SÖYLEYECEĞİ ve o
    // zaten kartta yazılı ("Selin şu an işlemde · 08 dk").
    //
    // Çok kişili resepsiyon senaryosu için geri gelebilir — ama o zaman kaydı
    // OKUYAN bir yerle birlikte (personel ekranı ya da müşteri kartı).
    const actions: WaitAction[] = [];
    if (fresh) actions.push({ label: 'Geri al', kind: 'ghost' });
    else if (level === 'late') {
        actions.push(stamp(since(event.remindedAt), 'Personele')
            ?? { label: 'Personele söyle', kind: 'fill' });
    } else if (level === 'warn') {
        actions.push({ label: 'Karşılamayı aç', kind: 'ghost' });
    } else if (!event.parked) {
        actions.push({ label: 'Beklemeye al', kind: 'hap' });
    }

    return {
        level,
        label,
        value: hero.value,
        unit: hero.unit,
        sub,
        conflict: busy ? `${busy.name} şu an işlemde · ${busy.badge}` : null,
        actions,
    };
}

/**
 * Bekleme kartının eylemleri — saf.
 *
 * DİKKAT: hiçbiri sunucuya gitmiyor. `visit.arrive` ucu ve Expo bildirim kanalı
 * henüz yazılmadı; bu ekran `mockDay` üstünde çalışıyor ve buradaki geçişler
 * yalnız YEREL. Bu yüzden hiçbir eylem teslimat iddia eden bir metin üretmiyor:
 * "Hatırlat" hapı kendini tüketir, "bildirim gönderildi" yazmaz.
 */
export function applyWaitAction(event: FlowEvent, label: string): FlowEvent | null {
    if (event.kind !== 'arrived') return null;
    if (label === 'Geri al') {
        // Kayıpsız dönüş: "Geldi" `etaMinutes`i silmediği için geri sayım
        // olduğu gibi geri gelir.
        const { waitMinutes: _w, remindedAt: _r, parked: _p, ...rest } = event;
        return { ...rest, kind: 'next' };
    }
    // Damga saat değil, beklemenin KAÇINCI DAKİKASI olduğunu saklıyor.
    const now = Math.max(0, Math.floor(event.waitMinutes ?? 0));
    if (label === 'Personele söyle') return { ...event, remindedAt: now };
    if (label === 'Beklemeye al') return { ...event, parked: true };
    // "Karşılamayı aç" bir durum değişikliği değil, bir GEÇİŞ: randevu detayını
    // açar. Ekran onu ayrı ele alır; burada değişecek bir şey yok.
    return null;
}

// ── DEMO SÜRÜCÜSÜ ───────────────────────────────────────────────────────────
//
// SİLİNECEK. Tasarımın iki hareketi — eşik geçişi (5 → 10 dk) ve
// BEKLİYOR → SÜRÜYOR dönüşümü — canlı veriye bağlı: biri dakikanın akmasını,
// öteki personelin işlemi başlatmasını bekliyor. `visit.arrive` ucu ve gündem
// yoklaması yazılana kadar ikisi de cihazda hiç görülemezdi.
//
// Bu yüzden burada bir SAAT TAKLİDİ var. Sunucu bağlandığında:
//   1) `DEMO_FLOW` false olur,
//   2) `waitMinutes` sunucudan gelmeye başlar,
//   3) bu blok tamamen silinir.
// Animasyonların kendisi bileşende; onlara dokunulmayacak.

/** Sunucu bağlanınca false yapılacak, sonra bu blokla birlikte silinecek. */
export const DEMO_FLOW = true;

/** Bir "dakika" bu kadar sürer. Gerçek dakika değil — eşikleri görmek için. */
export const DEMO_TICK_MS = 2500;

/** Sayaç buraya kadar çıkar; demo sonsuza kadar tırmanmasın. */
const DEMO_CEILING = 14;

/** Devir satırı bu dakikada işleme dönüşür — iki tik, yaklaşık beş saniye. */
const DEMO_HANDOFF_AT = 6;

export function demoTick(event: FlowEvent): FlowEvent {
    if (!DEMO_FLOW || event.kind !== 'arrived') return event;
    const minutes = Math.max(0, Math.floor(event.waitMinutes ?? 0));

    // Devir anı işleme dönüşür: kart yerinde kalır, içerik dönüşür.
    if (event.handoff && minutes >= DEMO_HANDOFF_AT) {
        const { handoff: _h, waitMinutes: _w, walkin: _k, remindedAt: _r, parked: _p, ...rest } = event;
        return {
            ...rest,
            kind: 'started',
            elapsedSeconds: 4,
            startedAt: `${atClock(event.time)} başladı`,
        };
    }
    if (minutes >= DEMO_CEILING) return event;
    return { ...event, waitMinutes: minutes + 1 };
}

// ── Müdür 21 · tahsilat ─────────────────────────────────────────────────────
//
// Tasarım: docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi
// Kartlari.html. Kart Kasa ekranının yerini ALMAZ — ödeme yöntemi, indirim ve
// kalem listesi orada. Kart dört şey söyler: ne kadar, kimden, ne zamandır
// bekliyor, ne yapmalıyım.

/**
 * Adisyon bu kadar dakikadır kasadaysa kart uyarı hâline geçer.
 *
 * Beklemenin 5/10 eşiğinden bilerek YÜKSEK. Orada müşteri ayakta hizmet
 * bekliyor; burada hizmet bitmiş, müşteri montunu giyiyor ya da kartla
 * ödüyor. Yirmi dakika, bunun olağan olmaktan çıktığı yer.
 */
export const DUE_WARN_MINUTES = 20;

export type DueLevel = 'calm' | 'warn' | 'hot';

export interface DueCard {
    level: DueLevel;
    label: string;
    /** ₺ — AYRI düğüm: 24 pt, ama rakamla aynı mürekkep. */
    currency: string;
    value: string;
    sub: string;
    actions: WaitAction[];
}

export function dueLevel(event: Pick<FlowEvent, 'dueMinutes' | 'carriedOver'>): DueLevel {
    if (event.carriedOver) return 'hot';
    const minutes = Math.max(0, Math.floor(event.dueMinutes ?? 0));
    return minutes >= DUE_WARN_MINUTES ? 'warn' : 'calm';
}

/**
 * Tahsilat kartı.
 *
 * PARA HİÇBİR HÂLDE RENK DEĞİŞTİRMEZ. Müdür 20'de rakam kırmızıya dönüyordu
 * çünkü orada sorun ZAMANDI ve rakam zamanı gösteriyordu. Burada rakam parayı
 * gösteriyor; tutar geciktiği için değişmiyor. Yaşlanmayı üç şey taşır:
 * soldaki çizgi, etiketin kelimesi, alt satırın cümlesi.
 */
export function dueCard(event: FlowEvent): DueCard {
    const level = dueLevel(event);
    const minutes = Math.max(0, Math.floor(event.dueMinutes ?? 0));
    const wait = waitLabel(minutes);
    const served = event.servedBy?.trim();

    let label: string;
    if (level === 'hot') label = 'dünden kaldı';
    else if (level === 'warn') label = `kasada bekliyor · ${wait}`;
    else label = 'kasaya hazır';

    // "en eskisi" ve "dünden kaldı," Kasa ekranının kendi cümleleri
    // (`cash.pendingSubtitle`); tasarım onları bu karta da taşıdı.
    const head = level === 'hot' ? 'dünden kaldı, ' : level === 'warn' ? 'en eskisi ' : '';
    const aging = `${head}${wait} bekliyor`;
    // Dünden devredende "kim verdi" DÜŞER. Cümle tek satıra sığmıyor ve
    // tasarımın kendi kuralı bu: kim hizmet verdi bilgisi kebap menüsünde ve
    // Kasa ekranında duruyor, yaşlanmanın ikinci yeri yok.
    const withServed = served && level !== 'hot';

    return {
        level,
        label,
        currency: CURRENCY,
        value: formatAmount(event.amountValue ?? 0),
        sub: withServed ? `${served} verdi · ${aging}` : aging,
        // Tek eylem, o da dolu hap: ikinci bir KARAR yok. Kart bir kapı.
        actions: [{ label: 'Tahsil et', kind: 'fill' }],
    };
}

/**
 * D3 — tahsilat alındı. KART DEĞİL, 34 pt ince satır.
 *
 * Kart çerçevesi "burada bir şey oluyor, bak" demek için var. Alınmış tahsilat
 * olmuş bitmiş bir şey; krem yüzey ona ayrılırsa akış kalabalıklaşır ve
 * BEKLEYEN adisyonlar sıradanlaşır. Tutar kalır — müdürün gün sonunda gözle
 * toplayacağı tek şey o.
 */
export interface PaidCard {
    label: string;
    currency: string;
    value: string;
    sub: string;
    actions: WaitAction[];
}

/**
 * "Tahsil et"e basıldıktan HEMEN SONRAKİ kart — ödül anı, kutlama değil.
 *
 * Tasarımın ikinci beat'i: kart yüzeyi, yarıçapı ve TUTAR hiç kıpırdamaz;
 * para yerinde dururken etrafındaki her şey yerine oturur. Etiket yeşile,
 * alt satır alınma saatine, dolu hap damgaya döner. Kart bu hâlde 1,6 saniye
 * durur, sonra 34 pt satıra iner.
 *
 * İlk uygulamada bu adım ATLANMIŞTI: kart doğrudan ince satıra düşüyordu ve
 * müdür bastığı düğmenin sonucunu göremiyordu.
 */
export function paidCard(event: FlowEvent): PaidCard {
    const served = event.servedBy?.trim();
    const taken = event.paidAt ? `${atClock(event.paidAt)} alındı` : 'alındı';
    return {
        label: 'tahsil edildi',
        currency: CURRENCY,
        value: formatAmount(event.amountValue ?? 0),
        sub: served ? `${served} verdi · ${taken}` : taken,
        actions: [{ label: 'Tahsil edildi', kind: 'stamp', done: true }],
    };
}

export function paidLine(event: FlowEvent): { label: string; text: string } {
    const money = `${CURRENCY}${formatAmount(event.amountValue ?? 0)}`;
    return {
        label: 'tahsil edildi',
        text: event.paidAt ? `${money} · ${event.paidAt}` : money,
    };
}

// ── Müdür 21 · gelmedi ──────────────────────────────────────────────────────

export interface NoshowCard {
    label: string;
    value: string;
    unit: string;
    /** Süre tükendi (30 dk doldu): rakam ikincil mürekkepte, artık ölçüm değil kayıt. */
    spent: boolean;
    sub: string;
    actions: WaitAction[];
}

/**
 * Gelmedi kartı.
 *
 * Kahraman rakam PARA DEĞİL, tolerans sayacı: müdürün tek zamanlı kararı
 * 30 dakika içinde müşteri gelirse kaydın kurtulması. Rakam KIRMIZI DEĞİL —
 * kırmızı etikette ve noktada, yani "ne oldu"da; rakam yalnız ölçüm.
 */
export function noshowCard(event: FlowEvent, fresh = false): NoshowCard {
    const elapsed = Math.max(0, Math.floor(event.noshowMinutes ?? 0));
    const dropped = elapsed >= LATE_LIMIT_MINUTES;
    const left = Math.max(0, LATE_LIMIT_MINUTES - elapsed);

    const actions: WaitAction[] = [];
    if (dropped) {
        // Geri dönüş YOK: eylemin yerinde damga durur.
        actions.push({ label: 'otomatik düştü', kind: 'stamp' });
        actions.push({ label: 'Yeniden randevu', kind: 'ghost' });
    } else if (fresh) {
        actions.push({ label: 'Geri al', kind: 'ghost' });
    } else {
        // Kenarlıklı hap, dolu değil: "Geç geldi" zorunlu değil, müşteri
        // gelirse basılır. Dolu turuncu "bastırılması gereken" demek.
        actions.push({ label: 'Geç geldi', kind: 'hap' });
    }

    return {
        label: dropped ? 'otomatik düştü' : 'müşteri gelmedi',
        value: String(dropped ? LATE_LIMIT_MINUTES : elapsed),
        unit: 'dk',
        spent: dropped,
        sub: dropped
            ? `Müşteri kartına yazıldı${event.droppedAt ? ` · ${event.droppedAt}` : ''}`
            : `${event.time} randevusu · ${left} dk sonra otomatik düşer`,
        actions,
    };
}

/** Akış satırının etiketi — düşmüş randevu "gelmedi"den başka bir şeydir. */
export function noshowRowLabel(event: FlowEvent): string {
    return Math.max(0, Math.floor(event.noshowMinutes ?? 0)) >= LATE_LIMIT_MINUTES
        ? 'randevu düştü'
        : 'müşteri gelmedi';
}

/**
 * Gelmedi kartının eylemleri — saf.
 *
 * "Geç geldi" kaydı BEKLEMEYE döndürür, randevu düşmez. Masaüstünün cümlesi:
 * "Müşteri geç gelişi kaydedildi" (`KuaforReservationsPage`).
 */
export function applyNoshowAction(event: FlowEvent, label: string): FlowEvent | null {
    if (event.kind !== 'noshow') return null;
    if (label === 'Geri al') {
        const { noshowMinutes: _n, droppedAt: _d, ...rest } = event;
        return { ...rest, kind: 'next' };
    }
    if (label === 'Geç geldi') {
        const { noshowMinutes: _n, droppedAt: _d, ...rest } = event;
        return { ...rest, kind: 'arrived', waitMinutes: 0 };
    }
    // "Yeniden randevu" bir durum değişikliği değil, randevu oluşturma ekranına
    // geçiş. Ekran onu ayrı ele alır.
    return null;
}

export function initialsOf(event: Pick<FlowEvent, 'firstName' | 'lastName' | 'customerInitials'>): string {
    if (event.customerInitials?.trim()) return event.customerInitials.trim();
    const first = event.firstName.trim().charAt(0);
    const last = event.lastName.trim().charAt(0);
    return `${first}${last}`.toLocaleUpperCase('tr-TR');
}

// ── Geçici kaynak ───────────────────────────────────────────────────────────
// Sunucuda "günün olayları" diye bir uç YOK; yazılacak. Tasarımdaki senaryo.

export const mockDay: ManagerDay = {
    // BUGÜN. Sabit bir tarihti ve cihazın günüyle ayrışıyordu: takvimin
    // "şimdi" çizgisi, "gelmedi" türetmesi ve başlığın gün adı üç ayrı
    // gerçek söylüyordu. Sahte randevular da okunurken bugüne kaydırılıyor
    // (`calendarSource.MOCK_ANCHOR`).
    dateISO: todayISO(),
    appointmentCount: 14,
    presence: [
        { id: 'merve', initials: 'MK', name: 'Merve', state: 'busy', minutes: 24 },
        { id: 'selin', initials: 'SD', name: 'Selin', state: 'busy', minutes: 8 },
        { id: 'deniz', initials: 'DA', name: 'Deniz', state: 'busy', minutes: 41 },
        { id: 'ece', initials: 'EÇ', name: 'Ece', state: 'free' },
        { id: 'gul', initials: 'GT', name: 'Gül', state: 'leave' },
        { id: 'kaan', initials: 'KB', name: 'Kaan', state: 'off' },
    ],
    summary: { revenue: '₺8.450', occupancy: '%72' },
    events: [
        // Bağlamı yok → A1 çizilir. `etaMinutes` EKSİYE dönerse (örn. -8) aynı
        // olay hiçbir şey değiştirmeden A1 · gecikmiş hâline geçer.
        {
            id: 'e0', time: '12:15', kind: 'next',
            firstName: 'Gülşah', lastName: 'Karaosmanoğlu',
            detail: 'Keratin bakımı · 45 dk · Selin ile',
            etaMinutes: 51, durationMinutes: 45, staffId: 'selin',
            context: {
                note: 'Saç boyasına alerjisi var',
                package: '10 seanslık bakım · 4/10',
                balance: '₺450 borç var',
            },
        },
        {
            id: 'e1', appointmentId: 'mgr-1030-selin', time: '11:30', kind: 'next',
            firstName: 'Elif', lastName: 'Demir',
            detail: 'Keratin bakımı · 45 dk · Selin ile',
            etaMinutes: 6, durationMinutes: 45, staffId: 'selin',
        },
        // ── Bekleme hâlleri (Müdür 20) ───────────────────────────────────
        // Dördü de aynı kartın farklı seviyeleri; sunucu uçları yazılana kadar
        // her seviyeyi cihazda görebilmek için duruyorlar.
        {
            // C5 · randevusuz — geri sayım yok, ölçülecek tek şey bekleme.
            id: 'e6', time: '11:32', kind: 'arrived',
            firstName: 'Burak', lastName: 'Aslan',
            detail: 'Randevusuz · Saç kesimi',
            waitMinutes: 2, walkin: true, staffId: 'ece', staffName: 'Ece',
        },
        {
            // C3a · 5. dakika — kart uyarı hâline geçer, "Karşılamayı aç" çıkar.
            id: 'e7', time: '11:28', kind: 'arrived',
            firstName: 'Hatice', lastName: 'Yalçın',
            detail: 'Fön · 30 dk · Merve ile',
            waitMinutes: 5, staffId: 'merve', staffName: 'Merve',
        },
        {
            // C3b · 10. dakika — tek dolu hap: "Hatırlat".
            id: 'e8', time: '11:26', kind: 'arrived',
            firstName: 'Kadir', lastName: 'Öz',
            detail: 'Sakal · 20 dk · Deniz ile',
            waitMinutes: 11, staffId: 'deniz', staffName: 'Deniz',
        },
        {
            // C4 · devir — personel boşaldı, buna geçiyor. Kart değil, ince satır.
            id: 'e9', time: '11:25', kind: 'arrived',
            firstName: 'Sevgi', lastName: 'Toprak',
            detail: 'Kesim · 45 dk · Selin ile',
            waitMinutes: 4, handoff: true, staffId: 'selin',
            staffName: 'Selin', staffInitials: 'SL',
        },
        {
            id: 'e2', appointmentId: 'mgr-1100-merve', time: '11:24', kind: 'started',
            firstName: 'Zeynep', lastName: 'Kaya',
            detail: 'Saç boyama · 90 dk',
            elapsedSeconds: 24 * 60 + 18,
            startedAt: '11:00’de başladı',
            staffInitials: 'MK', staffName: 'Merve',
        },
        // ── Tahsilat ve gelmedi (Müdür 21) ───────────────────────────────
        {
            // D1 · kasaya hazır — sakin.
            id: 'e3', appointmentId: 'mgr-1200-deniz', time: '11:18', kind: 'due',
            firstName: 'Merve', lastName: 'Aydın',
            detail: 'Kesim + fön · Merve ile',
            amountValue: 1800, dueMinutes: 12, servedBy: 'Merve',
        },
        {
            // D2 · uyarı hâli — 20. dakikayı geçti.
            id: 'e10', time: '11:06', kind: 'due',
            firstName: 'Kerem', lastName: 'Yıldız',
            detail: 'Sakal + kesim · Selin ile',
            amountValue: 2650, dueMinutes: 24, servedBy: 'Selin',
        },
        {
            // D2b · dünden devreden. Kasa mock'uyla aynı sayılar
            // (`cash.mockEmptyPending`): ₺900, 1080 dk = 18 saat.
            id: 'e11', time: 'Dün 19:40', kind: 'due',
            firstName: 'Sibel', lastName: 'Acar',
            detail: 'Saç bakımı · Deniz ile',
            amountValue: 900, dueMinutes: 1080, carriedOver: true, servedBy: 'Deniz',
        },
        {
            // D3 · alındı — kart değil, ince satır.
            id: 'e4', appointmentId: 'mgr-0940-deniz', time: '10:52', kind: 'paid',
            firstName: 'Ayşe', lastName: 'Yılmaz',
            detail: 'Saç boyama · Deniz ile',
            amountValue: 2010, paidAt: '10:53',
        },
        {
            // E2 · gelmedi, tolerans sürüyor → "Geç geldi" çıkar.
            id: 'e5', appointmentId: 'mgr-1000-ece', time: '10:20', kind: 'noshow',
            firstName: 'Burak', lastName: 'Şen',
            detail: 'Kesim · 30 dk · Ece ile',
            noshowMinutes: 12,
        },
        {
            // E3 · otomatik düştü — geri dönüş yok, damga durur.
            id: 'e12', time: '09:45', kind: 'noshow',
            firstName: 'Tuğba', lastName: 'Ergin',
            detail: 'Fön · 30 dk · Merve ile',
            noshowMinutes: 30, droppedAt: '10:15',
        },
    ],
};
