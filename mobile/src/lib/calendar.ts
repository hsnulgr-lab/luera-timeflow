/**
 * Takvim ekranının React'ten bağımsız karar katmanı.
 *
 * Bu dosya Node testleri tarafından doğrudan içe aktarılır; bu nedenle Expo veya
 * react-native bağımlılığı taşımamalıdır. Tarih aritmetiği de yalnız YYYY-MM-DD
 * değerleri üzerinde UTC ile yapılır. Böylece yaz/kış saati değişimleri haftayı
 * ya da ay ızgarasını bir gün kaydırmaz.
 */

export interface ApptInfo {
    risk: string | null;
    pkg: { name: string; used: number; total: number } | null;
    visitNo: number | null;
    lastVisit: string | null;
    /**
     * Müşterinin açık bakiyesi. İsteğe bağlı: personel modunda hiç
     * sorulmuyordu, müdürün randevu detayında (Müdür 08) gösteriliyor.
     * `undefined` "bilinmiyor" demek ve o rozet HİÇ çizilmez — bilinmeyen
     * bakiye "₺0" diye yazılamaz.
     */
    balance?: number | null;
}

export interface Appt {
    id: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    date: string;
    start_time: string;
    end_time: string;
    service: string;
    service_color: string | null;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    /**
     * Personel modunda GEREKSİZ: sunucu zaten yalnız kendi randevularını
     * döndürüyor, kural sorgunun içinde. Müdür modunda ise randevuyu sütuna
     * yerleştiren tek alan bu. Sunucu (`agenda` → RES_COLS) zaten gönderiyor;
     * isteğe bağlı olması, personel tarafındaki mevcut çağrıları bozmamak için.
     */
    staff_id?: string | null;
    notes: string | null;
    /**
     * Müşteri SALONA GELDİ (müdür/resepsiyon basar). `arrived_at` ile
     * karıştırılmamalı: o, hizmetin başladığı an ve personel basar.
     * Ayrım veritabanında da böyle (`043_customer_arrived.sql`).
     */
    customer_arrived_at?: string | null;
    arrived_at: string | null;
    service_ended_at: string | null;
    info?: ApptInfo | null;
}

export type CardState = 'live' | 'due' | 'plain';

export interface WeekDay {
    date: string;
    num: number;
    label: string;
}

const DAY_MS = 86_400_000;
const WEEK_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
const MONTHS_TR = [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
] as const;

// Uzun gün adları. `WEEK_LABELS` şerit için kısaltılmıştı; özet ekranı ve
// gün seçimi tam adı yazıyor ("Cuma, 14 Ağustos"). Dizi PAZAR'dan başlar
// çünkü `getUTCDay()` öyle sayar — WEEK_LABELS'ın pazartesi başlangıcıyla
// karıştırılmamalı.
const DAYS_LONG_TR = [
    'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi',
] as const;

function parseISODate(iso: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) throw new RangeError(`Geçersiz tarih: ${iso}`);

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        throw new RangeError(`Geçersiz tarih: ${iso}`);
    }
    return date;
}

function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
    return new Date(date.getTime() + amount * DAY_MS);
}

/** Gün ekler/çıkarır. Randevu oluşturmada "önümüzdeki 14 gün" bundan türer. */
export function addDaysISO(iso: string, amount: number): string {
    return isoDate(addDays(parseISODate(iso), amount));
}

/** "Cuma" */
export function dayNameLong(iso: string): string {
    return DAYS_LONG_TR[parseISODate(iso).getUTCDay()];
}

// Kısa gün adları, PAZAR'dan başlar (`getUTCDay()` böyle sayar). `WEEK_LABELS`
// pazartesi başlangıçlı olduğu için onunla karıştırılmamalı.
const DAYS_SHORT_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

/** "Çar" — gün şeridindeki kısaltma. */
export function dayNameShort(iso: string): string {
    return DAYS_SHORT_TR[parseISODate(iso).getUTCDay()];
}

/** Ayın kaçı — gün şeridindeki rakam. */
export function dayNumber(iso: string): number {
    return parseISODate(iso).getUTCDate();
}

/** "Per. 13" — toplanmış çubuğun tek metni. */
export function formatDayShort(iso: string): string {
    const date = parseISODate(iso);
    return `${DAYS_SHORT_TR[date.getUTCDay()]}. ${date.getUTCDate()}`;
}

/** Ayın ilk günü mü? Cetvelde ay sınırı çentiği buradan çıkar. */
export function isMonthStart(iso: string): boolean {
    return parseISODate(iso).getUTCDate() === 1;
}

/** "Cuma, 14 Ağustos" — özet ve gün seçiminin tek biçimi. */
export function formatDayLong(iso: string): string {
    const date = parseISODate(iso);
    return `${dayNameLong(iso)}, ${date.getUTCDate()} ${MONTHS_TR[date.getUTCMonth()]}`;
}

/**
 * "Cumartesi 22 Ağustos" — Müdür 25'in kimlik bloğu.
 *
 * `formatDayLong` virgüllü ("Cuma, 14 Ağustos") ve o biçim gün seçiminde
 * kullanılıyor. Randevu kartındaki gün satırı büyük harfe çevrilip harf
 * aralığı açılarak yazılıyor; virgül o dizilişte gereksiz bir duraklama.
 */
export function formatDayFull(iso: string): string {
    const date = parseISODate(iso);
    return `${dayNameLong(iso)} ${date.getUTCDate()} ${MONTHS_TR[date.getUTCMonth()]}`;
}

/** "30 Ağustos" — gün adı YOK; başlık zaten gün adını dev punto söylüyor. */
export function formatDayMonth(iso: string): string {
    const date = parseISODate(iso);
    return `${date.getUTCDate()} ${MONTHS_TR[date.getUTCMonth()]}`;
}

/** "EYL" — gün şeridinde yalnız ay sınırında çizilen kısaltma. */
export function monthShort(iso: string): string {
    return MONTHS_TR[parseISODate(iso).getUTCMonth()].slice(0, 3).toLocaleUpperCase('tr-TR');
}

/** İki ISO gün arasındaki tam gün farkı. Negatif = geçmiş. */
export function daysBetween(fromISO: string, toISO: string): number {
    return Math.round((parseISODate(toISO).getTime() - parseISODate(fromISO).getTime()) / DAY_MS);
}

/** "HH:MM" ve "HH:MM:SS" değerlerini gün içi tam dakikaya çevirir. */
export function toMinutes(t: string): number {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
    if (!match) throw new RangeError(`Geçersiz saat: ${t}`);

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = match[3] === undefined ? 0 : Number(match[3]);
    if (hour > 23 || minute > 59 || second > 59) {
        throw new RangeError(`Geçersiz saat: ${t}`);
    }
    // Takvim kararları dakika hassasiyetindedir; sunucudan gelen saniye alanı
    // biçimi bozmaz ama yeni bir kısmi dakika da üretmez.
    return hour * 60 + minute;
}

/** Gün içi dakikayı sıfır dolgulu 24 saatlik saate çevirir. */
/**
 * Sunucudan gelen saati EKRANIN biçimine indirger: "13:00:00" → "13:00".
 *
 * Postgres `time` kolonu saniyeyi de gönderiyor; sahte veri `HH:MM` üretiyordu
 * ve sözleşmede hangisinin geçerli olduğu hiç yazmamıştı. Kart saati ham
 * bastığı için ekranda "13:00:" / "00" diye ikiye kırılıyordu.
 *
 * Çözülemeyen değer OLDUĞU GİBİ dönüyor: tanımadığımız bir biçimi kırpmak,
 * yanlış bir saati doğru gibi göstermek olurdu.
 */
export function clockText(value: string): string {
    try {
        return hhmm(toMinutes(value));
    } catch {
        return value;
    }
}

export function hhmm(min: number): string {
    const whole = Math.floor(min);
    const inDay = ((whole % 1440) + 1440) % 1440;
    const hour = Math.floor(inDay / 60);
    const minute = inDay % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Canlılık kuralı: gelmiş, bitmemiş, iptal değil. Tek kaynak. */
export function isLive(a: Appt): boolean {
    return Boolean(a.arrived_at) && !a.service_ended_at && a.status !== 'cancelled';
}

function hasAppointmentEnded(a: Appt, nowMin: number): boolean {
    return toMinutes(a.end_time) < nowMin;
}

/**
 * Her kartın görünüm durumunu tek geçişte belirler.
 * Aynı anda en fazla bir canlı kart ya da (canlı yoksa) bir eylem kartı vardır.
 */
export function cardStates(appts: Appt[], nowMin: number): Map<string, CardState> {
    const states = new Map<string, CardState>(appts.map((a) => [a.id, 'plain']));

    let liveIndex = -1;
    let liveStart = Number.POSITIVE_INFINITY;
    for (let index = 0; index < appts.length; index += 1) {
        const a = appts[index];
        if (!isLive(a)) continue;
        const start = toMinutes(a.start_time);
        if (start < liveStart) {
            liveStart = start;
            liveIndex = index;
        }
    }

    if (liveIndex >= 0) {
        states.set(appts[liveIndex].id, 'live');
        return states;
    }

    let dueIndex = -1;
    let dueStart = Number.POSITIVE_INFINITY;
    for (let index = 0; index < appts.length; index += 1) {
        const a = appts[index];
        const canStart = a.status === 'pending' || a.status === 'confirmed';
        if (!canStart || a.arrived_at || hasAppointmentEnded(a, nowMin)) continue;

        const start = toMinutes(a.start_time);
        if (start <= nowMin + 10 && start < dueStart) {
            dueStart = start;
            dueIndex = index;
        }
    }

    if (dueIndex >= 0) states.set(appts[dueIndex].id, 'due');
    return states;
}

/**
 * Seçili günün kart durumları. Canlı işlem kendi zaman damgasından okunur;
 * “sırası geldi” ise yalnız bugün anlamlıdır ve başka günlere taşınmaz.
 */
export function calendarCardStates(appts: Appt[], nowMin: number, isToday: boolean): Map<string, CardState> {
    if (isToday) return cardStates(appts, nowMin);
    return new Map(appts.map((appointment) => [appointment.id, 'plain'] as const));
}

/** Pozitif değer gecikmeyi, sıfır/negatif değer sıranın geldiğini anlatır. */
export function lateMinutes(a: Appt, nowMin: number): number {
    return nowMin - toMinutes(a.start_time);
}

/** Bugünün şimdi çizgisinin hangi karttan sonra geleceğini döndürür. */
export function nowLineAfter(appts: Appt[], nowMin: number, isToday: boolean): number | null {
    if (!isToday) return null;

    let after = -1;
    for (let index = 0; index < appts.length; index += 1) {
        if (toMinutes(appts[index].start_time) <= nowMin) after = index;
    }
    return after;
}

function localEndTime(a: Appt): number {
    const [year, month, day] = a.date.split('-').map(Number);
    const [hour, minute, second = 0] = a.end_time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, second).getTime();
}

/** Kart açıklamasında yalnız sapan durumları kelimeyle belirtir. */
export function statusWord(a: Appt): 'gelmedi' | 'iptal' | 'onay bekliyor' | null {
    if (a.status === 'cancelled') return 'iptal';
    if (a.status === 'pending') return 'onay bekliyor';
    if (
        a.status === 'confirmed'
        && !a.arrived_at
        && !a.service_ended_at
        && localEndTime(a) < Date.now()
    ) {
        return 'gelmedi';
    }
    // Tamamlandı, normal kartın solmasıyla zaten görünür; ayrıca etiketlenmez.
    return null;
}

/** Verilen tarihi içeren Pazartesi–Pazar haftasını döndürür. */
export function weekDays(anchorISO: string): WeekDay[] {
    const anchor = parseISODate(anchorISO);
    const mondayOffset = (anchor.getUTCDay() + 6) % 7;
    const monday = addDays(anchor, -mondayOffset);

    return WEEK_LABELS.map((label, index) => {
        const date = addDays(monday, index);
        return { date: isoDate(date), num: date.getUTCDate(), label };
    });
}

/** Verilen ayı, Pazartesi başlangıçlı sabit 6×7 ızgaraya yerleştirir. */
/**
 * Ay ızgarasının tek hücresi. Komşu ayların günleri de üretilir (`inMonth:false`):
 * tasarım onları soluk gösteriyor ve boş bırakılan hücre ızgarayı deliyor.
 */
export interface MonthCell {
    date: string;
    day: number;
    inMonth: boolean;
}

/** 6 × 7 ay ızgarası, pazartesi başlangıçlı, kesintisiz 42 gün. */
export function monthGrid(anchorISO: string): MonthCell[][] {
    const anchor = parseISODate(anchorISO);
    const year = anchor.getUTCFullYear();
    const month = anchor.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    // Pazartesi 0 olacak biçimde kaydır; ayın 1'i pazarsa altı hücre önde kalır.
    const leading = (first.getUTCDay() + 6) % 7;

    return Array.from({ length: 6 }, (_, row) => (
        Array.from({ length: 7 }, (_, column) => {
            const offset = row * 7 + column - leading;
            const date = new Date(Date.UTC(year, month, 1 + offset));
            return {
                date: isoDate(date),
                day: date.getUTCDate(),
                inMonth: date.getUTCMonth() === month,
            };
        })
    ));
}

/** Takvim başlığının ikinci satırını, ekrandaki gerçek listeden üretir. */
export function headline(dateISO: string, todayISO: string, appts: Appt[]): string {
    const date = parseISODate(dateISO);
    const today = parseISODate(todayISO);
    const dayDelta = Math.round((date.getTime() - today.getTime()) / DAY_MS);
    const relation = dayDelta === 0
        ? 'bugün'
        : dayDelta === 1
            ? 'yarın'
            : dayDelta < 0
                ? 'geçmiş gün'
                : 'gelecek gün';
    const count = appts.length === 0 ? 'randevu yok' : `${appts.length} randevu`;
    const liveCount = appts.filter(isLive).length;
    const live = liveCount > 0 ? ` · ${liveCount} işlem sürüyor` : '';

    return `${MONTHS_TR[date.getUTCMonth()]} ${date.getUTCFullYear()} · ${relation} · ${count}${live}`;
}

/** Geçen saniyeyi sayaç metnine çevirir. */
export function elapsed(sec: number): string {
    const total = Math.max(0, Math.floor(sec));
    const seconds = total % 60;
    const totalMinutes = Math.floor(total / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}


/**
 * Cihazın YEREL gününü ISO olarak verir.
 *
 * `new Date().toISOString().slice(0,10)` KULLANILMAZ: o UTC'ye çevirir ve
 * Türkiye'de gece yarısından sonraki üç saatte bir önceki günü döndürür.
 * Salon 00:30'da kapanıyorsa müdür "dün"ü görürdü.
 */
/**
 * Cihazın saatine göre günün kaçıncı dakikası.
 *
 * "Şimdi" çizgisi ekranı OKUYANIN saatidir, sunucunun değil — bu yüzden
 * `etaMinutes`/`waitMinutes` kuralının istisnası. Takvimde sabit bir sayı
 * duruyordu (11:24) ve çizgi hiç kıpırdamıyordu; ekran canlı görünmüyordu.
 */
export function todayISO(at: Date = new Date()): string {
    const year = at.getFullYear();
    const month = String(at.getMonth() + 1).padStart(2, '0');
    const day = String(at.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function nowInMinutes(at: Date = new Date()): number {
    return at.getHours() * 60 + at.getMinutes();
}
