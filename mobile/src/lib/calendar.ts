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
    notes: string | null;
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
export function hhmm(min: number): string {
    const whole = Math.floor(min);
    const inDay = ((whole % 1440) + 1440) % 1440;
    const hour = Math.floor(inDay / 60);
    const minute = inDay % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isLive(a: Appt): boolean {
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
export function monthGrid(anchorISO: string): (string | null)[][] {
    const anchor = parseISODate(anchorISO);
    const year = anchor.getUTCFullYear();
    const month = anchor.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const leading = (first.getUTCDay() + 6) % 7;
    const cells: (string | null)[] = Array.from({ length: 42 }, () => null);

    for (let day = 1; day <= daysInMonth; day += 1) {
        cells[leading + day - 1] = isoDate(new Date(Date.UTC(year, month, day)));
    }

    return Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
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
