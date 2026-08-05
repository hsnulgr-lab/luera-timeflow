// Not: runtime import'lar bilinçli olarak göreli — tests/*.test.mjs node'un tip
// sıyırma loader'ıyla çalışıyor ve '@/...' alias'ını çözemiyor.
import { clockMin, addMinutesToTime } from './slotResolution.ts';

// ── Takvim ızgara geometrisi — TEK KAYNAK ────────────────────────────────────
// Takvim yüzleri (genel / salon / mobil) farklı görünür ama ALTLARINDAKİ
// geometri aynıdır: çakışan randevuların şeritlere bölünmesi, haftanın günleri,
// ay ızgarası, tıklanan piksele karşılık gelen saatin yuvarlanması.
//
// Bu dosya açılmadan önce aynı algoritmanın üç ayrı yazımı vardı
// (KuaforCalendarPage.layoutLaneAppointments, DayAgendaGrid.packColumn,
// KuaforDashboard.placeLane) — biri dakika, biri ondalık saat tabanlıydı ve
// küme kırma koşulları farklı yazılmıştı. Yüz sayısı arttıkça bu kopyaların da
// artmaması için geometri buraya alındı.
//
// Saf: React yok, DOM yok, sektör bilgisi yok.

export { clockMin, addMinutesToTime };

/** Bir şeride yerleştirilmiş öğe: kaçıncı sütun, kaç sütun paylaşılıyor. */
export interface LanePlacement<T> {
    item: T;
    /** 0 tabanlı sütun sırası. */
    lane: number;
    /** Kümedeki toplam sütun sayısı — genişlik bundan hesaplanır. */
    lanes: number;
}

export interface LaneTimes {
    startTime: string;
    endTime: string;
}

/**
 * Çakışan öğeleri yan yana sütunlara paylaştırır.
 *
 * Küme mantığı: birbirine değen randevular tek küme sayılır ve kümedeki EN
 * YOĞUN nokta kaç sütun gerektiriyorsa hepsi o genişliği paylaşır — böylece
 * kartlar üst üste binip kırpılmaz. Ardışık (çakışmayan) randevular aynı
 * sütunu geri kullanır.
 *
 * Süresi sıfır veya negatif olan kayıt 1 dakikalık sayılır: aksi hâlde
 * kendisiyle çakışmayan sıfır genişlikli bir kart üretiliyordu.
 */
export function packLanes<T extends LaneTimes>(items: T[]): LanePlacement<T>[] {
    const sorted = [...items].sort((a, b) =>
        a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));

    const out: LanePlacement<T>[] = [];
    let cluster: T[] = [];
    let clusterEnd = -1;

    const flush = () => {
        if (cluster.length === 0) return;
        const laneEnds: number[] = [];
        const placed = cluster.map((item) => {
            const start = clockMin(item.startTime);
            const end = Math.max(start + 1, clockMin(item.endTime));
            let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
            if (lane === -1) lane = laneEnds.length;
            laneEnds[lane] = end;
            return { item, lane };
        });
        const lanes = Math.max(1, laneEnds.length);
        for (const p of placed) out.push({ ...p, lanes });
        cluster = [];
        clusterEnd = -1;
    };

    for (const item of sorted) {
        const start = clockMin(item.startTime);
        const end = Math.max(start + 1, clockMin(item.endTime));
        if (cluster.length > 0 && start >= clusterEnd) flush();
        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, end);
    }
    flush();
    return out;
}

/** ISO tarihi (YYYY-MM-DD) — yerel saat diliminde, UTC kaymasız. */
function toISO(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Verilen günü içeren haftanın 7 günü, PAZARTESİ başlangıçlı.
 *
 * Türkiye'de hafta pazartesi başlar; JS'in getDay() pazarı 0 saydığı için
 * `(day + 6) % 7` kaydırması her çağıranda tekrar yazılıyordu.
 */
export function weekDaysOf(anchorISO: string): string[] {
    const anchor = new Date(`${anchorISO}T12:00:00`);
    if (Number.isNaN(anchor.getTime())) return [];
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        return toISO(day);
    });
}

export interface MonthCell {
    iso: string;
    /** Gösterilen ayın kendi günü mü, komşu aydan taşan dolgu mu. */
    inMonth: boolean;
}

/**
 * Ay görünümünün 6×7 = 42 hücreli ızgarası, pazartesi başlangıçlı.
 * Sabit 42 hücre: ay değiştikçe ızgara yüksekliği zıplamaz.
 */
export function monthGridOf(year: number, month: number): MonthCell[] {
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        return { iso: toISO(day), inMonth: day.getMonth() === month };
    });
}

/**
 * Dakikayı slot adımına yuvarlar — boş alana tıklanınca randevunun başlangıcı.
 * 15 dakikalık salonda 14:07'ye tıklamak 14:00 verir, 14:08 → 14:15.
 * Adım geçersizse (0 veya negatif) 15 dakika varsayılır.
 */
export function roundToStep(minutes: number, stepMin: number): number {
    const step = Math.max(1, Math.round(stepMin) || 15);
    return Math.max(0, Math.round(minutes / step) * step);
}

/** Dakikayı "HH:MM" biçimine çevirir (24 saati aşmaz). */
export function timeOfMinutes(minutes: number): string {
    const total = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
