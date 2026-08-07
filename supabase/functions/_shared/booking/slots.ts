// Müsait saat hesabı — whatsapp-booking'in içinden çıkarıldı.
//
// Bu kod bir randevunun gerçekten alınabilir olup olmadığına karar veriyor;
// yanlış hesaplarsa ya müşteriye dolu saat sunulur (DB guard'ı reddeder, müşteri
// "hata" görür) ya da boş saat gizlenir (salon iş kaybeder). Kod tabanının
// kuralı bu tür mantığı saf modülde tutmak — bkz. serviceEligibility, sessionPhase.
//
// Saf modül: veritabanı yok, Deno yok. tests/wa-booking.test.mjs doğrudan import eder.

export interface WorkingHour {
    day: number;        // 0 = Pazar
    start: string;      // "09:00"
    end: string;        // "19:00"
    isOff: boolean;
}

export interface BusyRange {
    start_time: string;
    end_time: string;
}

export function timeToMin(t: string): number {
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function minToTime(m: number): string {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function weekdayOf(dateISO: string): number {
    return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart < bEnd && bStart < aEnd;
}

export function formatDateTr(dateISO: string): string {
    return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('tr-TR', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    });
}

export interface SlotInput {
    /** İşletmenin çalışma saatleri. */
    orgHours: WorkingHour[];
    /** Personelin kendi saatleri; yoksa işletmeninki geçerli. */
    staffHours: WorkingHour[] | null;
    weekday: number;
    /** Hizmetin süresi (dk) — slot bu süre sığdığı sürece açılır. */
    serviceDuration: number;
    /** Slot ızgarası (dk), settings.slot_duration. */
    slotDuration: number;
    /** O personelin o günkü dolu aralıkları. */
    dayReservations: BusyRange[];
    /** Personel o gün izinli mi. */
    isTimeOff: boolean;
    /** Bugün için "şu andan önce" slot açılmasın diye alt sınır (dk). */
    minStart: number;
}

/**
 * Bir personelin bir gündeki müsait başlangıç dakikalarını döner.
 *
 * Pencere işletme VE personel saatlerinin KESİŞİMİdir: personel 10'da başlıyorsa
 * salon 09'da açık olsa bile 09:00 verilmez.
 */
export function staffSlots(input: SlotInput): number[] {
    if (input.isTimeOff) return [];
    if (!(input.serviceDuration > 0) || !(input.slotDuration > 0)) return [];

    const org = input.orgHours?.find((h) => h.day === input.weekday);
    if (!org || org.isOff) return [];

    const staff = (input.staffHours ?? input.orgHours)?.find((h) => h.day === input.weekday);
    if (!staff || staff.isOff) return [];

    const start = Math.max(timeToMin(org.start), timeToMin(staff.start));
    const end = Math.min(timeToMin(org.end), timeToMin(staff.end));

    const busy = input.dayReservations.map(
        (r) => [timeToMin(r.start_time), timeToMin(r.end_time)] as [number, number],
    );

    const out: number[] = [];
    for (let s = start; s + input.serviceDuration <= end; s += input.slotDuration) {
        if (s < input.minStart) continue;
        if (busy.some(([bS, bE]) => overlaps(s, s + input.serviceDuration, bS, bE))) continue;
        out.push(s);
    }
    return out;
}

export interface StaffDay {
    id: string;
    workingHours: WorkingHour[] | null;
    isTimeOff: boolean;
    dayReservations: BusyRange[];
}

/**
 * Tüm personel üzerinden birleşik müsaitlik: her saat için o saati verebilecek
 * BİR personel. Müşteriye saat listesi bundan sunulur, randevu da bu eşlemedeki
 * personele yazılır — liste ile atama tek kaynaktan geldiği için birbirinden
 * kayamaz.
 */
export function availabilityFor(opts: {
    staff: StaffDay[];
    orgHours: WorkingHour[];
    weekday: number;
    serviceDuration: number;
    slotDuration: number;
    minStart: number;
}): { times: string[]; staffByMinute: Map<number, string> } {
    const staffByMinute = new Map<number, string>();
    for (const st of opts.staff) {
        const mins = staffSlots({
            orgHours: opts.orgHours,
            staffHours: st.workingHours,
            weekday: opts.weekday,
            serviceDuration: opts.serviceDuration,
            slotDuration: opts.slotDuration,
            dayReservations: st.dayReservations,
            isTimeOff: st.isTimeOff,
            minStart: opts.minStart,
        });
        for (const m of mins) if (!staffByMinute.has(m)) staffByMinute.set(m, st.id);
    }
    const times = [...staffByMinute.keys()].sort((a, b) => a - b).map(minToTime);
    return { times, staffByMinute };
}
