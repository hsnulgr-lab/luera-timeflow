// Bir gün için alınabilir saatler: personel + kabin, tek hesap.
//
// whatsapp-booking bu hesabı kendi içinde satır satır yapıyor (eski bot,
// emekliye ayrılınca silinecek). Claude ajanı aynı kuralı buradan alır:
// personel saati ∩ işletme saati, izin, dolu aralıklar ve kabin kapasitesi.
// Saat listesi ile atanan personel/kabin aynı eşlemeden gelir; müşteriye
// sunulan saat ile yazılan kayıt birbirinden kayamaz.
//
// daySlots saf ve testli (tests/wa-agent.test.mjs); loadWindow yalnız okur.

import { assignResources } from './resources.ts';
import { availabilityFor, minToTime, timeToMin, weekdayOf, type WorkingHour } from './slots.ts';
import type { Admin } from '../wa.ts';

export interface WindowReservation {
    id: string;
    date: string;
    staff_id: string | null;
    resource_id: string | null;
    start_time: string;
    end_time: string;
}

export interface WindowData {
    reservations: WindowReservation[];
    timeOff: { date: string; staff_id: string }[];
    resources: { id: string; capacity: number }[];
}

export interface StaffHours {
    id: string;
    workingHours: WorkingHour[] | null;
}

export interface DaySlots {
    times: string[];
    /** Başlangıç dakikası → o saati verebilecek personel. */
    staffAt: Map<number, string>;
    /** Başlangıç dakikası → atanacak kabin (kabin kavramı yoksa null). */
    resourceAt: Map<number, string | null>;
}

export function addDays(iso: string, n: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daySlots(w: WindowData, o: {
    date: string;
    orgHours: WorkingHour[];
    staff: StaffHours[];
    serviceDuration: number;
    slotDuration: number;
    /** Bugün için "şu andan önce" saat açılmasın diye (dk). */
    minStart: number;
    /** Taşınan randevu kendi yerini dolu göstermesin. */
    excludeReservationId?: string | null;
    /** Müşteri belirli bir uzman istediyse. */
    onlyStaffId?: string | null;
}): DaySlots {
    const dayRes = w.reservations.filter((r) => r.date === o.date && r.id !== o.excludeReservationId);
    const off = new Set(w.timeOff.filter((t) => t.date === o.date).map((t) => t.staff_id));
    const staff = o.onlyStaffId ? o.staff.filter((s) => s.id === o.onlyStaffId) : o.staff;

    const avail = availabilityFor({
        staff: staff.map((st) => ({
            id: st.id,
            workingHours: st.workingHours,
            isTimeOff: off.has(st.id),
            dayReservations: dayRes.filter((r) => r.staff_id === st.id),
        })),
        orgHours: o.orgHours,
        weekday: weekdayOf(o.date),
        serviceDuration: o.serviceDuration,
        slotDuration: o.slotDuration,
        minStart: o.minStart,
    });

    const busy = dayRes
        .filter((r) => r.resource_id)
        .map((r) => ({
            resourceId: r.resource_id as string,
            start: timeToMin(r.start_time),
            end: timeToMin(r.end_time),
        }));
    const resourceAt = assignResources({
        minutes: [...avail.staffByMinute.keys()],
        duration: o.serviceDuration,
        resources: w.resources,
        busy,
    });

    const times = [...resourceAt.keys()].sort((a, b) => a - b).map(minToTime);
    return { times, staffAt: avail.staffByMinute, resourceAt };
}

/** [from, to] aralığının dolu kayıtlarını, izinleri ve kabinleri tek seferde okur. */
export async function loadWindow(admin: Admin, orgId: string, from: string, to: string): Promise<WindowData> {
    const [{ data: reservations }, { data: timeOff }, { data: resources }] = await Promise.all([
        admin.from('reservations')
            .select('id, date, staff_id, resource_id, start_time, end_time')
            .eq('organization_id', orgId).gte('date', from).lte('date', to)
            .neq('status', 'cancelled'),
        admin.from('staff_time_off')
            .select('date, staff_id')
            .eq('organization_id', orgId).gte('date', from).lte('date', to),
        admin.from('resources')
            .select('id, capacity, sort')
            .eq('organization_id', orgId).eq('is_active', true)
            .order('sort'),
    ]);
    return {
        reservations: reservations ?? [],
        timeOff: timeOff ?? [],
        resources: (resources ?? []).map((r: { id: string; capacity: number }) => ({ id: r.id, capacity: r.capacity })),
    };
}
