/**
 * Personel 10 — vardiya ve izin. Saf karar katmanı.
 *
 * İki ayrı kavram, iki ayrı tablo, ve BİRBİRİNE KARIŞTIRILMAZ:
 *
 *   staff.working_hours  (008)  haftanın günü · şablon · her hafta tekrar eder
 *   staff_time_off       (012)  TARİH · o güne özel · gün gün tutulur
 *
 * Bir gün aynı anda ikisine birden girebiliyor: "normalde perşembeleri
 * çalışırım ama bu perşembe izinliyim". Bu yüzden izin ayrı bir satır değil,
 * şablonun ÜSTÜNE binen ikinci katman — şablon saati yerinde durur, söner;
 * yanına "İzinli" yazılır. İzin kalkınca satır kendi eski hâline döner.
 *
 * `working_hours` NULL'ın ayrı bir anlamı var ve en kolay yanlış okunan yer
 * burası: personelin ayrı saati YOK, salonunkini KULLANIYOR. "Salonla aynı
 * saatler" değil — salon saatini değiştirince personelinki de değişir.
 * Ekran bunu gelecek zamanlı bir cümleyle söylemek zorunda.
 *
 * Saf: React yok, react-native yok, Expo yok.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Personel 10 Profil.html`.
 */

import { addDaysISO, formatDayMonth, todayISO } from './calendar.ts';
import { dayName, rangeLabel, type DaySchedule } from './managerProfile.ts';
import { returnDateISO } from './staffDay.ts';
import { upperTR } from './text.ts';

/** Ekrana giren her şeyin kaynağı. Sunucu ucu yazılınca birebir bu şekil. */
export interface ShiftSource {
    /** `staff.working_hours` — NULL ise salonunki kullanılıyor. */
    staffHours: readonly DaySchedule[] | null;
    /** `settings.working_hours` — her hâlde gerekli: NULL'ın karşılığı bu. */
    salonHours: readonly DaySchedule[];
    /** `staff_time_off.date` listesi. Gün gün; aralık YOK. */
    timeOff: readonly string[];
}

/** Salonun saatleri mi kullanılıyor? Tek yerde sorulur, üç yerde okunur. */
export function usesSalonHours(source: ShiftSource): boolean {
    return source.staffHours === null;
}

/** O gün fiilen geçerli olan şablon. Personelinki yoksa salonunki. */
export function scheduleFor(source: ShiftSource, weekday: number): DaySchedule {
    const index = ((weekday % 7) + 7) % 7;
    const list = source.staffHours ?? source.salonHours;
    return list.find((candidate) => candidate.day === index)
        ?? { day: index, open: 9 * 60, close: 19 * 60, closed: true };
}

// ── Vardiya kartı ───────────────────────────────────────────────────────────

/**
 * `TodayCard`'ın beklediği şekil. Müdürünkiyle AYNI bileşen; değişen yalnız
 * hangi saatlerin ve hangi kelimelerin girdiği.
 */
export interface ShiftCard {
    kicker: string;
    range: string | null;
    open: boolean;
    statusWord: string;
    countdown: string | null;
    /** İzinli gün: saat yerine kelime var, mürekkebi sönük. */
    dim?: boolean;
}

/** "3 sa 12 dk" · "40 dk" — saat sıfırsa hiç yazılmaz. */
export function spanLabel(minutes: number): string {
    const total = Math.max(0, Math.round(minutes));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m} dk`;
    if (m === 0) return `${h} sa`;
    return `${h} sa ${m} dk`;
}

/**
 * Kartın dört hâli. Geri sayım YALNIZ işleyen bir zaman için çiziliyor:
 * bitmiş ve izinli günde satır hiç kurulmuyor. Turuncu zaman demek, süs değil.
 */
export function shiftCard(
    source: ShiftSource,
    dateISO: string,
    weekday: number,
    nowMinutes: number,
): ShiftCard {
    const kicker = upperTR(`Bugün · ${dayName(weekday)}`);

    // İzin şablonu EZER: o gün normalde çalışılıyor olsa bile.
    if (source.timeOff.includes(dateISO)) {
        return { kicker, range: 'İzinli', open: false, statusWord: 'Bugün izinli', countdown: null, dim: true };
    }

    const day = scheduleFor(source, weekday);
    if (day.closed) {
        return {
            kicker,
            range: 'Çalışmıyor',
            open: false,
            statusWord: 'Bugün izinli',
            countdown: null,
            dim: true,
        };
    }

    const range = rangeLabel(day);
    if (nowMinutes < day.open) {
        return {
            kicker, range, open: false,
            statusWord: 'Başlamadı',
            countdown: `başlangıca ${spanLabel(day.open - nowMinutes)}`,
        };
    }
    if (nowMinutes >= day.close) {
        return { kicker, range, open: false, statusWord: 'Bugün bitti', countdown: null };
    }
    return {
        kicker, range, open: true,
        statusWord: 'Şu anda vardiyada',
        countdown: `bitişe ${spanLabel(day.close - nowMinutes)}`,
    };
}

// ── Yedi günlük ızgara ──────────────────────────────────────────────────────

export interface WeekRow {
    dateISO: string;
    /** 0 = Pazartesi. */
    day: number;
    name: string;
    /** "7 Eyl" — personelin ızgarası BU HAFTAYI gösteriyor, şablonu değil. */
    dateLabel: string;
    today: boolean;
    /** Saat salonun şablonundan geliyor: satırda `SALON` etiketi çizilir. */
    salon: boolean;
    /** Çalışılan gün ise saat aralığı; düzenli izin gününde null. */
    hours: string | null;
    /** Saat yerine geçen kelime. `hours` null olduğunda dolu. */
    closedWord: string | null;
    /** Tarihe bağlı izin — şablonun ÜSTÜNE biniyor. */
    leave: boolean;
}

/** Ayı üç harfe indirir: "7 Eylül" → "7 Eyl". Büyük harfe çevrilmiyor. */
function shortDate(iso: string): string {
    const [day, month] = formatDayMonth(iso).split(' ');
    return `${day} ${month.slice(0, 3)}`;
}

/**
 * Pazartesiden başlayan yedi gün. Ekranın gösterdiği şey bir şablon değil,
 * BU HAFTA — çünkü izinler tarihe bağlı ve şablona sığmıyor.
 */
export function weekRows(
    source: ShiftSource,
    mondayISO: string,
    currentISO: string = todayISO(),
): WeekRow[] {
    const salon = usesSalonHours(source);
    return Array.from({ length: 7 }, (_, index) => {
        const dateISO = addDaysISO(mondayISO, index);
        const day = scheduleFor(source, index);
        const leave = source.timeOff.includes(dateISO);
        return {
            dateISO,
            day: index,
            name: dayName(index),
            dateLabel: shortDate(dateISO),
            today: dateISO === currentISO,
            salon: salon && !day.closed,
            hours: day.closed ? null : rangeLabel(day),
            // Kapalı günün kelimesi kaynağını söylüyor: salonun kapalı olması
            // ile personelin o gün çalışmaması aynı şey değil.
            closedWord: day.closed ? (salon ? 'Salon kapalı' : 'Çalışmıyor') : null,
            leave,
        };
    });
}

/** Haftanın pazartesisi. `getUTCDay` pazarı 0 verdiği için kaydırılıyor. */
export function mondayOf(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const weekday = (new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7;
    return addDaysISO(iso, -weekday);
}

/** "7 gün · Pazar izinli" — ana ekrandaki büyük satırın alt cümlesi. */
export function weekSummary(rows: readonly WeekRow[]): string {
    const off = rows.filter((row) => row.hours === null);
    const working = rows.length - off.length;
    if (off.length === 0) return `${rows.length} gün · izin günü yok`;
    if (off.length === rows.length) return 'Bu hafta çalışma günü yok';
    const names = off.map((row) => row.name).join(', ');
    return `${working} gün · ${names} izinli`;
}

// ── Foot cümleleri ──────────────────────────────────────────────────────────

/**
 * Foot metni parçalı dönüyor: kalın kısımlar ayrı. Tek bir dize döndürüp
 * ekranda kesmek, cümle değişince sessizce yanlış yeri kalınlaştırırdı.
 */
export interface FootSpan {
    text: string;
    strong?: boolean;
}

const AUTHORITY = 'Vardiyanızı ve izinlerinizi işletme belirler.';

/**
 * Izgaranın altındaki cümle. Üç bilgi taşıyor ve üçü de bu ekranın en zor
 * bilgileri: izin aralığı · NULL'ın anlamı · yetkinin kimde olduğu.
 *
 * "Değiştiremezsiniz" TAM OLARAK BİR KEZ söyleniyor — burada. Ana ekranda
 * yok, satırlarda tekrar yok, kilit ikonu yok: satırlar zaten dokunulamaz,
 * sebebi bir cümlede duruyor.
 */
export function weekFoot(
    source: ShiftSource,
    rows: readonly WeekRow[],
    currentISO: string = todayISO(),
): FootSpan[] {
    if (rows.every((row) => row.hours === null || row.leave)) {
        return [
            { text: 'Bu hafta çalışma gününüz yok.', strong: true },
            { text: ` ${AUTHORITY}` },
        ];
    }

    if (usesSalonHours(source)) {
        return [
            { text: 'Ayrı bir vardiyanız tanımlı değil: ' },
            { text: 'salonun saatlerinde çalışıyorsunuz', strong: true },
            // Gelecek zaman ŞART: "aynı saatler" cümlesi dondurulmuş bir kopya
            // sanılmasına yol açıyor. Farkı taşıyan şey bu yan cümle.
            { text: `. Salonun saatleri değişirse sizinki de değişir. ${AUTHORITY}` },
        ];
    }

    const leave = rows.filter((row) => row.leave).map((row) => row.dateISO);
    if (leave.length === 0) return [{ text: AUTHORITY }];

    // Dönüş tarihi ekranın BİLDİĞİ pencerenin içindeyse söylenebilir.
    // `returnDateISO` izin dizisinin bittiği günü veriyor ama listenin nereye
    // kadar okunduğunu bilmiyor: bu ekran yalnız bu haftayı çekiyor. İzin
    // haftanın sonuna kadar sürüyorsa dönüş günü pencerenin DIŞINDA kalıyor
    // ve bilinmiyor — uydurulmuş bir "14 Eylülde dönüyorsunuz" cümlesi
    // müşterinin gözü önünde yanlış olabilir.
    const horizon = rows[rows.length - 1].dateISO;
    const derived = returnDateISO(source.timeOff, currentISO);
    const back = derived && derived <= horizon ? derived : null;
    const first = leave[0];
    const last = leave[leave.length - 1];
    const span = first === last ? formatDayMonth(first) : `${dayOnly(first)} – ${formatDayMonth(last)}`;

    // Bugün izinli değilsek cümle "izinlisiniz" diyemez: hafta içinde bir
    // yerde izin var, o kadar.
    const onLeaveToday = source.timeOff.includes(currentISO);
    if (!onLeaveToday) {
        return [
            { text: span, strong: true },
            { text: ` izinlisiniz. ${AUTHORITY}` },
        ];
    }

    if (!back) {
        // Dönüş tarihi TÜRETİLEMİYOR: izin bilinen günlerin sonuna kadar
        // sürüyor. Uydurulmuş bir dönüş günü müşterinin gözü önünde yanlış
        // olabilir — cümle kurulmuyor, eksiklik söyleniyor.
        return [
            { text: `${formatDayMonth(first)}'den beri izinlisiniz.`, strong: true },
            { text: ` Bilinen günlerin sonuna kadar izin sürüyor; dönüş tarihi girilmemiş. ${AUTHORITY}` },
        ];
    }

    return [
        { text: `${span} izinlisiniz`, strong: true },
        { text: `, ${formatDayMonth(back)} ${dayName(weekdayOf(back)).toLocaleLowerCase('tr-TR')} dönüyorsunuz. ${AUTHORITY}` },
    ];
}

/** "10" — aralığın ilk ucunda ay tekrar edilmiyor: "10 – 11 Eylül". */
function dayOnly(iso: string): string {
    return formatDayMonth(iso).split(' ')[0];
}

function weekdayOf(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    return (new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7;
}

/** Bildirim satırlarının yerine geçen cümle. Nereye bakılacağını söylüyor. */
export const NOTIFICATION_FOOT =
    'Bildirimler henüz gelmiyor. Yeni randevularınızı Bugün sekmesinde görürsünüz.';

// ── Demo kaynağı ────────────────────────────────────────────────────────────
//
// `staff-api` henüz `working_hours` da `staff_time_off` da döndürmüyor.
// Tablolar canlı; eksik olan yalnız uç.

const H = (day: number, open: number, close: number): DaySchedule =>
    ({ day, open, close, closed: false });

export function demoSource(currentISO: string = todayISO()): ShiftSource {
    const monday = mondayOf(currentISO);
    return {
        staffHours: [
            H(0, 600, 1140), H(1, 600, 1140), H(2, 600, 1140), H(3, 600, 1140),
            H(4, 600, 1140), H(5, 600, 1260),
            { day: 6, open: 600, close: 1140, closed: true },
        ],
        salonHours: [
            H(0, 540, 1260), H(1, 540, 1260), H(2, 540, 1260), H(3, 540, 1260),
            H(4, 540, 1260), H(5, 600, 1260),
            { day: 6, open: 540, close: 1260, closed: true },
        ],
        // Perşembe–Cuma izinli: şablonda çalışılan iki gün, bu hafta izinli.
        timeOff: [addDaysISO(monday, 3), addDaysISO(monday, 4)],
    };
}
