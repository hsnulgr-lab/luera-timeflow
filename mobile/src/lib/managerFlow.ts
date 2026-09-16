/**
 * Müdür ana ekranının karar katmanı — saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Ekranın tamamı dört katman: dev başlık · personel şeridi · özet şeridi ·
 * olay akışı. Burada yalnız son üçünün verisi ve kuralları var.
 */

import { addDaysISO, todayISO } from './calendar.ts';
import {
    callRecord, recordVisible, SEND_WINDOW_SECONDS, sendingRecord, staffRecord, waRecord,
} from './actionPill.ts';
import type { CellKey, PillInput, PillRecord, WaResult } from './actionPill.ts';
import { CURRENCY, formatAmount, waitLabel, type Pending } from './cash.ts';
import { accusative, dative, splitStaffName } from './text.ts';

export type StaffState = 'busy' | 'free' | 'leave' | 'off';

export interface StaffPresence {
    id: string;
    initials: string;
    name: string;
    state: StaffState;
    /** Yalnız `busy` için: işlemin başlamasından bu yana geçen dakika. */
    minutes?: number;
    /**
     * Personelin telefonu. Bilinmiyorsa `null`/`undefined` — o zaman "Ara"
     * düğmesi HİÇ çizilmez, uydurma numara çevrilmez.
     */
    phone?: string | null;
    /**
     * İzinli günlerin ISO tarihleri (`staff_time_off` tablosunun karşılığı).
     *
     * Veritabanı izni bir ARALIK olarak değil, GÜN GÜN tutuyor:
     * `staff_time_off(staff_id, date)` ve `UNIQUE(staff_id, date)`. Yani
     * "dönüş tarihi" diye bir kolon yok ve olmayacak — ardışık günlerden
     * TÜRETİLİR (bkz. `returnDateISO`).
     *
     * Bilinmiyorsa `undefined`: o zaman dönüş tarihi yazılmaz, uydurulmaz.
     */
    leaveDates?: readonly string[];
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
    /**
     * Müşteri kaydının kimliği. Balona basınca müşteri kartı BUNUNLA açılır;
     * yalnız adla aramak aynı adlı iki müşteride yanlış kartı açardı.
     * Bilinmiyorsa balon çizilmez — ölü daire olmaz.
     */
    customerId?: string;
    /** Müşteri bağlamı. Hiçbiri yoksa A1, en az biri varsa A2 çizilir. */
    context?: ApptContext;
    /** Randevunun atandığı personel; şeritteki durumla eşleşmek için. */
    staffId?: string;
    /** Hizmet süresi — A1 panelinin alt satırı ("11:30 · 45 dk"). */
    durationMinutes?: number;
    /**
     * Salonun gecikme toleransı (dk) — `settings.arrival_tolerance_min`.
     * Yoksa masaüstünün varsayılanı. Geri sayım BUNA bakıyor; ayrı bir sayı
     * tutmak aynı müşteriyi iki ekranda iki farklı sürede "gelmedi" yapardı.
     */
    toleranceMinutes?: number;
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
    /**
     * Adisyonun kimliği (`group:<id>` · `reservation:<id>`).
     *
     * Grup randevusu (aynı müşteri, iki personel) akışta iki satır ama kasada
     * TEK adisyon. Bekleyen sayısı ve tutarı bu anahtarla bir kez sayılıyor;
     * yoksa Kasa'nın paneli masaüstünün kuyruğundan fazlasını söylerdi.
     */
    ticketKey?: string;
    /** Hizmeti kim verdi. Personel hapı değil CÜMLE: "Merve verdi". */
    servedBy?: string;
    /** Tahsilatın alındığı saat — D3 satırı. */
    paidAt?: string;
    /** Randevu saatinden bu yana geçen dakika. `noshow` için. */
    noshowMinutes?: number;
    /** Otomatik düşme anı — "Müşteri kartına yazıldı · 12:00". */
    droppedAt?: string;

    // ── Müdür 33 · eylem hapı ────────────────────────────────────────────
    /**
     * Müşterinin telefonu. YOKSA `Ara` ve `Yaz` gözleri HİÇ ÇİZİLMEZ —
     * sönük bırakılmaz. Numarası olmayan bir müşteriye ulaşma düğmesi
     * göstermek, dokunulup hiçbir şey olmayan bir nokta demektir.
     */
    customerPhone?: string | null;
    /**
     * Bu müşteriye yapılan son gönderimin sonucu. `undefined` = hiç
     * denenmedi. Sonuç gözü de değiştirir: `opt_out` ve `invalid_phone`
     * gözü kapatır, `not_connected` onu sönük onarım gözüne çevirir.
     */
    waResult?: WaResult;
    /** Hapla yapılan son hamlenin dakikası — kaydın yaşı bundan türer. */
    actedAt?: number;
    /** Son hamlenin hangi göz olduğu; kartın kayıt satırı bunu söyler. */
    actedCell?: CellKey;
    /** 5 saniyelik gönderim penceresi açık mı, kaç saniye kaldı. */
    sendingLeft?: number;
    /**
     * Akışın ilk satırı mı — hapın yönünü belirler.
     *
     * Varsayılan yukarı: aynı müşterinin kartını örtmek, ALTTAKİ başka
     * müşterinin satırını örtmekten iyi. Ama listenin ilk satırında yukarıda
     * yer yok; orada aşağı açılır. Ekran doldurur, kart bilmez.
     */
    firstInList?: boolean;

    /** İptalde bekleme listesinden kaç kişiye soruldu. Bilinmiyorsa undefined. */
    waitlistAsked?: number;
    /** Boşalan saati kim doldurdu — damga. */
    filledBy?: string;
    /** Online randevu müdürün onayını bekliyor mu (`status = 'pending'`). */
    pending?: boolean;
    /** Randevu kaç dakika önce alındı — kartın kahraman rakamı. */
    bookedAgoMinutes?: number;
    /** Reddetme penceresi: kaç saniye sonra mesaj gidecek. */
    rejectedLeft?: number;
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
}/**
 * Akışın sırası — KRONOLOJİK ARTAN: geçmiş yukarıda, gelecek aşağıda.
 *
 * Karşılaştırıcı zaten yazılmıştı ama listeye HİÇ UYGULANMIYORDU (yalnız yeni
 * olay eklenirken çalışıyordu), üstelik ters yöndeydi. İki kusur birlikte şunu
 * üretiyordu: solda saat yazılı bir ray, ve sıra
 * 12:15 → 11:30 → … → 09:45 → 13:00 → 11:33. Göz bir zaman çizgisi bekliyor,
 * bulamayınca listenin geri kalanına da güvenmiyor.
 *
 * YÖN NEDEN ARTAN: bu ekran bir haber akışı değil, GÜNÜN KENDİSİ. Müdür açınca
 * "şu an ne var" görmeli, en uzak geleceği değil — azalan sırada tepede
 * 13:00'teki bir iptal duruyordu. Artan sırada zaman aşağı akar (takvimin
 * yönü), ve ekran açılışta şimdi-çizgisine kaydırılır: yukarısı olan biten,
 * aşağısı gelecek olan.
 *
 * "Dün 19:40" gibi gün önekli satırlar EN BAŞA düşer — en eski olan onlar.
 * Ayrım biçimden geliyor (`HH:MM` mi değil mi), ayrı bir bayraktan değil:
 * veri zaten söylüyor.
 */
export function sortFlow(events: readonly FlowEvent[]): FlowEvent[] {
    const clock = (value: string) => (/^\d{2}:\d{2}$/.test(value) ? 1 : 0);
    return [...events].sort((a, b) => {
        if (clock(a.time) !== clock(b.time)) return clock(a.time) - clock(b.time);
        return a.time.localeCompare(b.time, 'tr-TR');
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
    const seen = new Set<string>();
    const dues = events.filter((event) => {
        if (event.kind !== 'due') return false;
        const key = event.ticketKey ?? event.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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
 * Gecikme toleransının VARSAYILANI — masaüstüyle aynı sayı
 * (`src/lib/appointmentFlow.ts · DEFAULT_ARRIVAL_TOLERANCE_MIN`).
 *
 * ── "Otomatik düşer" KALKTI (2026-09-15) ────────────────────────────────────
 * Eskiden burada 30 yazıyordu ve kartlar "22 dk sonra düşer", "randevu
 * düştü · kayıt müşteri dosyasına yazıldı" diyordu. Hiçbiri olmuyordu:
 * randevuyu düşüren bir iş ne sunucuda ne masaüstünde var. Masaüstünün
 * mantığı tek: randevu saati + salonun toleransı geçti ve müşteri gelmediyse
 * "Gelmedi". Randevu AÇIK kalıyor; müşteri gelirse "Geç geldi" basılıyor.
 * Kartlar artık yalnız bunu söylüyor.
 */
export const DEFAULT_ARRIVAL_TOLERANCE_MIN = 120;

/** Eski ad — yeni kod `DEFAULT_ARRIVAL_TOLERANCE_MIN` kullanıyor. */
export const LATE_LIMIT_MINUTES = DEFAULT_ARRIVAL_TOLERANCE_MIN;

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

/** "Gelmedi" sayılmaya kalan dakika. Gecikme yoksa tolerans da tükenmiyor. */
export function graceLeft(etaMinutes?: number, tolerance: number = DEFAULT_ARRIVAL_TOLERANCE_MIN): number {
    const late = lateMinutes(etaMinutes);
    if (late === 0) return tolerance;
    return Math.max(0, tolerance - late);
}

/**
 * Tolerans doldu mu? Doluysa akış o randevuyu zaten "gelmedi" diye çiziyor
 * (`flowBuild.kindOf`). Adı eski — randevu İPTAL EDİLMİYOR.
 */
export function autoCancelled(etaMinutes?: number, tolerance: number = DEFAULT_ARRIVAL_TOLERANCE_MIN): boolean {
    return lateMinutes(etaMinutes) >= tolerance;
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

export function etaPanel(
    event: Pick<FlowEvent, 'time' | 'etaMinutes' | 'durationMinutes' | 'toleranceMinutes'>,
): EtaPanel {
    const late = isLate(event.etaMinutes);
    if (late) {
        return {
            label: 'gecikti',
            value: minuteLabel(lateMinutes(event.etaMinutes)),
            // "11:30’da bekleniyordu" DEĞİL: saat zaten satırın solundaki
            // sütunda yazıyor, cümle onu ikinci kez söylüyordu. O satır
            // toleransın geri sayımına açıldı — kartın ALTINDAKİ rozet de
            // böylece ortadan kalktı (Müdür 32 · §2.2).
            // "düşer" DEĞİL: hiçbir şey düşürülmüyor. Tolerans dolunca randevu
            // "gelmedi" sayılıyor — masaüstünün de söylediği tam olarak bu.
            sub: `${graceLeft(event.etaMinutes, event.toleranceMinutes)} dk sonra gelmedi sayılır`,
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
export function toleranceLabel(
    etaMinutes?: number,
    tolerance: number = DEFAULT_ARRIVAL_TOLERANCE_MIN,
): string | null {
    if (!isLate(etaMinutes)) return null;
    if (autoCancelled(etaMinutes, tolerance)) return 'gelmedi sayıldı';
    return `${graceLeft(etaMinutes, tolerance)} dk sonra gelmedi sayılır`;
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
    // Cümlenin içinde ilk ad yeter: "Selin şu an işlemde" — soyad şişirir.
    return { name: splitStaffName(person.name).given, badge: durationBadge(person.minutes) };
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
    // ── Müdür 33 · online randevu onayı ──────────────────────────────────
    if (event.kind === 'booked' && label === 'Onayla') {
        const { pending: _p, rejectedLeft: _r, ...rest } = event;
        return { ...rest, pending: false };
    }
    if (event.kind === 'booked' && label === 'Reddet') {
        // Reddetme MÜŞTERİYE MESAJ GÖNDERİR ve geri alınamaz. O yüzden hemen
        // gitmiyor: 5 saniyelik pencere açılıyor, `Yaz`la aynı kalıp.
        return { ...event, rejectedLeft: SEND_WINDOW_SECONDS };
    }
    if (event.kind === 'booked' && label === 'Geri al' && event.rejectedLeft != null) {
        const { rejectedLeft: _r, ...rest } = event;
        return rest;
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
    /**
     * Rakam artık bir ölçüm değil mi. Otomatik düşürme olmadığı için HİÇBİR
     * gelmedi kartı "tükenmiş" değil — alan tasarım bileşeni için duruyor ve
     * hep `false`.
     */
    spent: boolean;
    sub: string;
    actions: WaitAction[];
}

/**
 * Gelmedi kartı — MASAÜSTÜNÜN MANTIĞIYLA.
 *
 * Kart eskiden iki evreliydi: 30 dakikalık "kurtarma penceresi", sonra
 * "randevu düştü · kayıt müşteri dosyasına yazıldı". İkinci evrenin
 * arkasında hiçbir şey yoktu — randevu iptal edilmiyor, müşteri dosyasına
 * bir şey yazılmıyor. Canlı veride her kart ikinci evrede açılacaktı, çünkü
 * "gelmedi" artık salonun toleransı (vars. 120 dk) dolunca çıkıyor.
 *
 * Doğru olan: randevu AÇIK. Müşteri gelirse birincil eylem "Geç geldi".
 * Kahraman rakam kaç dakika geçtiği; kırmızı değil — kırmızı etikette.
 */
export function noshowCard(event: FlowEvent, fresh = false): NoshowCard {
    const elapsed = Math.max(0, Math.floor(event.noshowMinutes ?? 0));
    const hero = waitHero(elapsed);

    const actions: WaitAction[] = [];
    if (fresh) {
        actions.push({ label: 'Geri al', kind: 'ghost' });
    } else {
        // Kenarlıklı hap, dolu değil: "Geç geldi" zorunlu değil, müşteri
        // gelirse basılır. Dolu turuncu "bastırılması gereken" demek.
        actions.push({ label: 'Geç geldi', kind: 'hap' });
        actions.push({ label: 'Yönet', kind: 'ghost' });
    }

    return {
        label: 'müşteri gelmedi',
        value: hero.value,
        unit: hero.unit,
        spent: false,
        // Randevunun gerçek hâli: kimse onu kapatmadı.
        sub: 'Randevu açık · gelirse "Geç geldi"',
        actions,
    };
}

/**
 * ŞİMDİ-ÇİZGİSİ: akışta ilk GELECEK satırın sırası.
 *
 * Akış artan sıralı olduğu için bu index bir sınır: üstü olan biten, altı
 * gelecek olan. Ekran açılışta buraya kaydırılır — müdür günün en uzak
 * ucunu değil, ŞU ANI görmeli.
 *
 * Gün önekli satırlar ("Dün 19:40") her zaman geçmiştir; saatleri bugünün
 * saatiyle kıyaslanmaz, yoksa dün 19:40'ta kapanmamış bir adisyon bugün
 * 19:40'ta olacakmış gibi çizginin altına düşerdi.
 *
 * Hepsi geçmişteyse uzunluk döner: akşam, gelecek satır kalmamıştır ve
 * bu bir hata değil.
 */
export function nowLineIndex(events: readonly FlowEvent[], nowMinutes: number): number {
    const index = events.findIndex((event) => {
        if (!/^\d{2}:\d{2}$/.test(event.time)) return false;
        const [hours, minutes] = event.time.split(':').map(Number);
        return hours * 60 + minutes >= nowMinutes;
    });
    return index === -1 ? events.length : index;
}

/**
 * Satırın üstündeki kelime — `next` için.
 *
 * SORUN KELİMENİN KENDİSİNDEYDİ. Dokuz etiketten sekizi bir DURUM anlatıyor
 * ("işlem başladı", "adisyon bekliyor"); yalnız `next` bir SIRA İDDİASI
 * taşıyordu ve sıra iddiası tanım gereği tekil. İki randevu aynı anda
 * "sıradaki" olamaz, ama ekranda ikisi de öyle diyordu.
 *
 * Üç hâl:
 *   • gecikmiş  → `gecikti`. Kart zaten bunu diyor; kodun kuralı "satır ve
 *     kart AYNI kelimeyi söyler". Geciken randevu artık YAKLAŞAN bir randevu
 *     olarak sunulmuyor — çözülmesi gereken bir istisna.
 *   • zamanında ve en erken olan → `sıradaki randevu`. Liste azalan sıralı
 *     olduğu için bu etiket ŞİMDİ-ÇİZGİSİNİ işaretliyor: üstündeki her şey
 *     gelecek, o satır sıradaki iş.
 *   • öteki zamanındalar → `yaklaşan randevu`. Tek başına "randevu" hiçbir
 *     şey söylemiyor ve öteki etiketlerin iki kelimelik ritmini bozuyordu.
 */
export function nextRowLabel(event: Pick<FlowEvent, 'etaMinutes'>, inLine: boolean): string {
    if (isLate(event.etaMinutes)) return 'gecikti';
    return inLine ? 'sıradaki randevu' : 'yaklaşan randevu';
}

/**
 * Zamanında giden randevular arasında SIRADA olanın kimliği. Yoksa `null` —
 * o zaman hiçbir satır "sıradaki" demez ve bu doğrudur.
 *
 * Geciken randevular dışarıda: onların satırı zaten `gecikti` diyor.
 */
export function nextInLineId(events: readonly FlowEvent[]): string | null {
    const upcoming = events.filter((e) => e.kind === 'next' && !isLate(e.etaMinutes));
    if (upcoming.length === 0) return null;
    // En erken SAAT sırada olandır. Eşitlikte listedeki ilk — kararlı sonuç.
    return upcoming.reduce(
        (soonest, e) => (e.time.localeCompare(soonest.time, 'tr-TR') < 0 ? e : soonest),
    ).id;
}

/**
 * Akış satırının etiketi — kartın etiketiyle BİREBİR.
 *
 * "randevu düştü" hâli kalktı: randevuyu düşüren bir iş yok. Kart ve satır iki
 * ayrı sözlük konuşmuyor.
 */
export function noshowRowLabel(): string {
    return 'müşteri gelmedi';
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


// ── Müdür 33 · sıradaki randevunun eylemleri ────────────────────────────────

export interface NextSlots {
    /** Üst yuva — her zaman dolu turuncu, her zaman `Geldi`. */
    primary: string;
    /**
     * Alt yuva. Zamanında `Gelmedi`, gecikince hapın tetikleyicisi.
     *
     * TAKAS, EKLEME DEĞİL: sağ sütun hiçbir zaman ikiden fazla yuva taşımaz.
     * `Gelmedi` gecikme penceresinde kaybolmuyor, hapın içine giriyor.
     */
    secondary: 'gelmedi' | 'pill' | 'undo';
}

/**
 * Gecikince neden `Gelmedi` yerine hap.
 *
 * 8. dakikada `Gelmedi`ye basmak, henüz gelebilecek bir müşteriyi atmaktır; ve
 * 30. dakikada randevu zaten kendiliğinden düşüyor. Yani gecikme penceresinde
 * `Gelmedi`, otomatik olanın kısayolundan ibaret — hapın içinde durması
 * yeterli. Yerini müdürün gerçekten ihtiyacı olan şey alıyor: ulaşma yolu.
 */
export function nextSlots(event: Pick<FlowEvent, 'etaMinutes' | 'sendingLeft'>): NextSlots {
    if (event.sendingLeft != null && event.sendingLeft > 0) {
        return { primary: 'Geldi', secondary: 'undo' };
    }
    return { primary: 'Geldi', secondary: isLate(event.etaMinutes) ? 'pill' : 'gelmedi' };
}

/** Hapın girdisi olayın kendisinden türer — ekran seçmez, seçemez. */
export function pillInputOf(
    event: Pick<FlowEvent, 'customerPhone' | 'waResult' | 'kind'>,
    waConnected = true,
): PillInput {
    return {
        customerPhone: event.customerPhone,
        waConnected,
        waResult: event.waResult,
        // Düşmüş bir randevu bir daha düşürülemez.
        canDrop: event.kind === 'next',
        /*
         * "Personele bilgi ver" GİZLİ (2026-09-15).
         *
         * Gözün açıklaması "bildirim gider" diyor ama müdürden personele
         * bildirim gönderen bir yol YOK — basınca yalnız telefonda bir damga
         * kalıyordu. Müdür personelin haberdar olduğunu sanabilirdi. Kanal
         * yazıldığında bu satır `true`ya döner; göz, kaydı ve metni hazır.
         */
        canTellStaff: false,
    };
}

/**
 * Kartın kayıt satırı — son hamle, defter değil.
 *
 * Kart bir geçmiş listesi tutmuyor: yalnız SON hamle yazılı. Müdürün bilmesi
 * gereken şey "ne yaptım", "neler yaptım" değil; ve dördüncü satırın yeri tek.
 */
export function pillRecordOf(event: FlowEvent): PillRecord | null {
    if (event.sendingLeft != null && event.sendingLeft > 0) {
        return sendingRecord(event.sendingLeft);
    }
    if (!event.actedCell || event.actedAt == null) return null;

    const now = Math.max(0, Math.floor(event.waitMinutes ?? lateMinutes(event.etaMinutes)));
    const age = Math.max(0, now - event.actedAt);

    let record: PillRecord;
    if (event.actedCell === 'ara') record = callRecord(age);
    else if (event.actedCell === 'inf') record = staffRecord(age);
    else if (event.waResult) record = waRecord(event.waResult, age);
    else return null;

    return recordVisible(record, age) ? record : null;
}

/**
 * Hapın eylemleri — saf.
 *
 * `Yaz` doğrudan göndermiyor: 5 saniyelik pencereyi açıyor. Pencere dolunca
 * çağıran gerçekten gönderir ve sonucu `waResult`e yazar.
 */
export function applyPillAction(event: FlowEvent, cell: CellKey): FlowEvent | null {
    const now = Math.max(0, Math.floor(event.waitMinutes ?? lateMinutes(event.etaMinutes)));
    if (cell === 'nox') {
        const { etaMinutes: _eta, actedAt: _a, actedCell: _c, ...rest } = event;
        return { ...rest, kind: 'noshow', noshowMinutes: now };
    }
    if (cell === 'ara') return { ...event, actedCell: 'ara', actedAt: now };
    if (cell === 'inf') return { ...event, actedCell: 'inf', actedAt: now };
    if (cell === 'wa') {
        return { ...event, actedCell: 'wa', actedAt: now, sendingLeft: SEND_WINDOW_SECONDS };
    }
    // `waoff` bir gönderim değil, bir GEÇİŞ: Ayarlar → WhatsApp. Ekran onu
    // ayrı ele alır; burada değişecek bir şey yok.
    return null;
}

/** Gönderim penceresi doldu — sonuç yazılır, pencere kapanır. */
export function applySendResult(event: FlowEvent, result: WaResult): FlowEvent {
    const { sendingLeft: _s, ...rest } = event;
    return { ...rest, waResult: result };
}

/** Pencere içinde vazgeçildi — istek HİÇ gitmedi, kayıt da kalmaz. */
export function cancelSend(event: FlowEvent): FlowEvent {
    const { sendingLeft: _s, actedCell: _c, actedAt: _a, ...rest } = event;
    return rest;
}

// ── Müdür 33 · süre aşımı ───────────────────────────────────────────────────

/**
 * İşlem planlanandan ne kadar uzun sürdü.
 *
 * EYLEM YOK, bilinçli. Müdür süren bir işlemi kısaltamaz; aşımın tek gerçek
 * sonucu SIRADAKİ müşteride ve o müşterinin kendi kartı zaten "gecikti"
 * diyor — eylem de orada. Buraya düğme koymak tiyatro olurdu.
 */
export function overrunMinutes(
    event: Pick<FlowEvent, 'elapsedSeconds' | 'durationMinutes'>,
): number {
    const planned = event.durationMinutes;
    if (planned == null || event.elapsedSeconds == null) return 0;
    return Math.max(0, Math.floor(event.elapsedSeconds / 60) - planned);
}

export function overrunLine(
    event: Pick<FlowEvent, 'elapsedSeconds' | 'durationMinutes' | 'staffName'>,
): string | null {
    const over = overrunMinutes(event);
    if (over <= 0) return null;
    const who = event.staffName?.trim();
    const head = `${event.durationMinutes} dk işlem · ${over} dk aştı`;
    return who ? `${head} · ${splitStaffName(who).given} ile` : head;
}


// ── Müdür 33 · iptal, online randevu ────────────────────────────────────────

export interface SimpleCard {
    label: string;
    value: string;
    unit: string;
    /** Rakam tükendi mi — ikincil mürekkebe düşer. */
    spent: boolean;
    sub: string;
    actions: WaitAction[];
}

/**
 * İptal kartı — boşalan saat.
 *
 * BEKLEYENE OTOMATİK SORULUYOR. İptal, sunucuda `notify-waitlist`i kendisi
 * tetikliyor; buraya bir "Bekleyene sor" düğmesi koymak İKİNCİ KEZ mesaj
 * atardı. O yüzden bekleme listesi kartta bir RAPOR, eylem değil.
 *
 * Eylem tek: boşalan saati doldurmak. Randevu sekmesi o gün/saat/personelle
 * ön dolu açılıyor — sunucu işi sıfır.
 */
export function cancelledCard(event: FlowEvent): SimpleCard {
    const asked = event.waitlistAsked;
    // "Bekleyen yok" YAZILIR: sıfır bir ölçümdür, satır boş bırakılmaz.
    const head = asked == null ? 'Bekleme listesi bilinmiyor'
        : asked > 0 ? `${asked} bekleyene soruldu`
            : 'Bekleyen yok';
    const tail = [event.time, event.staffName?.trim() && splitStaffName(event.staffName).given]
        .filter(Boolean).join(', ');

    return {
        label: 'randevu iptal',
        value: String(Math.max(0, Math.floor(event.durationMinutes ?? 0))),
        unit: 'dk',
        spent: Boolean(event.filledBy),
        sub: tail ? `${head} · ${tail}` : head,
        actions: event.filledBy
            ? [{ label: `Dolduruldu · ${event.filledBy}`, kind: 'stamp', done: true }]
            : [{ label: 'Saati doldur', kind: 'hap' }],
    };
}

/**
 * Online randevu kartı.
 *
 * Otomatik onay KAPALIYSA randevu `pending` doğuyor ve müdürün onayını
 * bekliyor — mobilde bunu görecek yer yoktu. Açıksa karar zaten verilmiş:
 * düğme HİÇ ÇİZİLMEZ, kart yalnız haber verir.
 */
export function bookedCard(event: FlowEvent, fresh = false): SimpleCard {
    const pending = event.pending === true;
    const waited = Math.max(0, Math.floor(event.bookedAgoMinutes ?? 0));

    if (event.rejectedLeft != null && event.rejectedLeft > 0) {
        return {
            label: 'reddedildi', value: String(waited), unit: 'dk', spent: true,
            sub: `${event.detail} · mesaj ${event.rejectedLeft} sn sonra gidecek`,
            actions: [{ label: 'Geri al', kind: 'hap' }],
        };
    }

    return {
        label: pending ? 'onay bekliyor' : 'onaylandı',
        value: String(waited),
        unit: 'dk',
        spent: !pending,
        sub: event.detail,
        actions: pending
            ? [{ label: 'Onayla', kind: 'fill' }, { label: 'Reddet', kind: 'ghost' }]
            : fresh
                ? [{ label: 'Onaylandı · şimdi', kind: 'stamp', done: true }]
                : [],
    };
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
        { id: 'merve', initials: 'MK', name: 'Merve Kaya', state: 'busy', minutes: 24, phone: '0532 118 24 07' },
        { id: 'selin', initials: 'SD', name: 'Selin Demir', state: 'busy', minutes: 8, phone: '0532 118 24 08' },
        { id: 'deniz', initials: 'DA', name: 'Deniz Aksoy', state: 'busy', minutes: 41, phone: '0532 118 24 09' },
        { id: 'ece', initials: 'EÇ', name: 'Ece Çelik', state: 'free', phone: '0532 118 24 10' },
        {
            id: 'gul',
            initials: 'GT',
            name: 'Gülşah Tunç',
            state: 'leave',
            phone: '0532 118 24 11',
            /*
             * SAHTE VERİ, ama biçimi gerçeğin aynısı: `staff_time_off` izni
             * gün gün tutuyor. Bugüne göre üretiliyor — sabit tarih yazsaydık
             * demo her gün "geçmiş bir izin" gösterirdi.
             */
            leaveDates: [todayISO(), addDaysISO(todayISO(), 1)],
        },
        { id: 'kaan', initials: 'KB', name: 'Kaan Bulut', state: 'off', phone: '0532 118 24 12' },
    ],
    summary: { revenue: '₺8.450', occupancy: '%72' },
    events: [
        // Bağlamı yok → A1 çizilir. `etaMinutes` EKSİYE dönerse (örn. -8) aynı
        // olay hiçbir şey değiştirmeden A1 · gecikmiş hâline geçer.
        {
            id: 'e0', time: '12:15', kind: 'next',
            firstName: 'Gülşah', lastName: 'Karaosmanoğlu', customerId: 'c-gulsah',
            customerPhone: '+905321182406',
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
            firstName: 'Elif', lastName: 'Demir', customerId: 'c-elif',
            detail: 'Keratin bakımı · 45 dk · Selin ile',
            // EKSİ eta = gecikme. Müdür 33'ün asıl sahnesi: ikinci yuva
            // `Gelmedi`den `Yönet`e takas olur ve hap dört gözle açılır.
            etaMinutes: -8, durationMinutes: 45, staffId: 'selin',
            // Personel adı hapın baş harf gözünü besliyor: "SD" ve
            // "Selin'e bildirim gider". Yoksa göz çan simgesine düşer.
            staffName: 'Selin Demir', staffInitials: 'SD',
            customerPhone: '0532 118 24 06',
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
            firstName: 'Zeynep', lastName: 'Kaya', customerId: 'c-zeynep',
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
            firstName: 'Kerem', lastName: 'Yıldız', customerId: 'c-kerem',
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
            customerPhone: '+905554027119',
            firstName: 'Burak', lastName: 'Şen',
            detail: 'Kesim · 30 dk · Ece ile',
            staffId: 'ece', staffName: 'Ece Çelik', staffInitials: 'EÇ',
            noshowMinutes: 12,
        },
        {
            // E3 · otomatik düştü — geri dönüş yok, damga durur.
            id: 'e12', time: '09:45', kind: 'noshow',
            firstName: 'Tuğba', lastName: 'Ergin',
            detail: 'Fön · 30 dk · Merve ile',
            staffId: 'merve', staffName: 'Merve Kaya', staffInitials: 'MK',
            noshowMinutes: 30, droppedAt: '10:15',
            customerPhone: '+905339075542',
        },
        // ── Müdür 33 · iptal ve online randevu ───────────────────────────
        {
            // C · boşalan saat. Bekleyene ZATEN soruldu (sunucu iptalde
            // `notify-waitlist`i kendisi tetikliyor); kart onu rapor ediyor,
            // tekrar sormuyor. Tek eylem boşluğu doldurmak.
            id: 'e13', time: '13:00', kind: 'cancelled',
            firstName: 'Nazlı', lastName: 'Erdem',
            detail: 'Saç boyama · 45 dk · Selin ile',
            durationMinutes: 45, staffId: 'selin', staffName: 'Selin Demir',
            waitlistAsked: 3,
        },
        {
            // D · onay bekleyen online randevu. Otomatik onay KAPALI olan
            // salonlarda randevu `pending` doğuyor ve müdürü bekliyor —
            // mobilde bunu görecek yer yoktu.
            id: 'e14', time: '11:33', kind: 'booked',
            firstName: 'Zeynep', lastName: 'Kaya',
            detail: 'Yarın 14:00 · Keratin bakımı · Selin',
            pending: true, bookedAgoMinutes: 4, staffId: 'selin',
            customerPhone: '+905426630871',
        },
    ],
};
