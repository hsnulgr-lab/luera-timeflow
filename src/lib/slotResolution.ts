import type { Reservation, Resource, Staff, StaffTimeOff, WorkingHours } from '@/types';

// ── Slot çözümleme — TEK KAYNAK ──────────────────────────────────────────────
// Bir saat aralığının gerçekten uygun olup olmadığına karar veren kurallar
// burada durur. Daha önce yalnız CalendarPage içinde yaşıyordu; Sağlık/Klinik
// dashboard'undaki Randevu Kompozitörü de aynı cevabı vermek zorunda olduğu
// için (iki yüzey aynı taslak için farklı "uygun" sonucu veremez) ortak
// katmana çıkarıldı. Davranış Takvim'deki haliyle birebir aynıdır.
//
// Kurallar saf fonksiyondur; veri bağlama işi useSlotResolver hook'unda.
// Bu dosya HİÇBİR klinik yargı üretmez: yalnız operasyonel müsaitlik hesaplar.
// "Uygun" = personel çalışıyor + izinli değil + randevu çakışması yok +
// kaynak kapasitesi dolu değil. Tıbbi uygunluk anlamına GELMEZ.

export function clockMin(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function addMinutesToTime(time: string, minutes: number): string {
    const total = (clockMin(time) + Math.max(0, minutes)) % (24 * 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export interface SlotResolution {
    staffMember?: Staff;
    issue?: string;
    conflict?: Reservation;
}

/** Aynı taslakta bekleyen (henüz kaydedilmemiş) satırlar — sepet çakışması. */
export interface CartLine {
    staffId: string;
    startTime: string;
    endTime: string;
}

export type CheckConflictFn = (
    date: string, startTime: string, endTime: string,
    excludeId?: string, staffId?: string, resourceId?: string, resourceCapacity?: number,
) => Reservation | null;

/** Kuralların ihtiyaç duyduğu canlı veri. */
export interface SlotRules {
    staff: Staff[];
    staffLoading: boolean;
    timeOff: StaffTimeOff[];
    timeOffLoading: boolean;
    workingHours: WorkingHours[];
    reservations: Reservation[];
    resources: Resource[];
    checkConflict: CheckConflictFn;
    /** Sektör terminolojisinde personelin adı (küçük harf): "hekim", "kuaför"… */
    staffWord: string;
    /** Sektörün ilk kaynak tipi: "Oda", "Koltuk", "Ünite"… */
    resourceTypeLabel: string;
}

export interface SlotQuery {
    date: string;
    startTime: string;
    endTime: string;
    /** Belirli bir personel isteniyorsa; boşsa "fark etmez" (uygun olan çözülür). */
    staffId?: string;
    resourceId?: string | null;
    cart?: CartLine[];
}

/** Personel o gün/saatte çalışıyor ve izinli değil mi? */
export function staffWorksAt(
    rules: Pick<SlotRules, 'timeOff' | 'workingHours'>,
    member: Staff, date: string, startTime: string, endTime: string,
): boolean {
    if (rules.timeOff.some((x) => x.staffId === member.id && x.date === date)) return false;
    const schedule = member.workingHours?.length ? member.workingHours : rules.workingHours;
    const jsDay = new Date(`${date}T12:00:00`).getDay();
    const hours = schedule.find((x) => x.day === jsDay);
    if (!hours || hours.isOff) return false;
    return clockMin(startTime) >= clockMin(hours.start) && clockMin(endTime) <= clockMin(hours.end);
}

function cartOverlaps(cart: CartLine[], staffId: string, startTime: string, endTime: string): boolean {
    const start = clockMin(startTime), end = clockMin(endTime);
    return cart.some((line) => line.staffId === staffId
        && clockMin(line.startTime) < end && start < clockMin(line.endTime));
}

/**
 * Personel tarafı. "Fark etmez" boş staff_id demek değildir: o anda çalışan ve
 * müsait gerçek bir personeli çözüp döner. Legacy NULL randevu böylece
 * işletmenin tüm personelini yanlışlıkla bloke etmez.
 */
export function resolveSlotStaff(rules: SlotRules, q: SlotQuery): SlotResolution {
    const { staff, staffLoading, timeOffLoading, reservations, checkConflict, staffWord } = rules;
    const cart = q.cart || [];
    const requestedId = q.staffId || undefined;

    if (staffLoading || timeOffLoading) return { issue: 'Personel uygunluğu kontrol ediliyor…' };
    if (staff.length === 0) {
        const conflict = checkConflict(q.date, q.startTime, q.endTime);
        return conflict
            ? { issue: `${conflict.customerName} · ${conflict.startTime}–${conflict.endTime} ile çakışıyor`, conflict }
            : {};
    }

    const candidates = requestedId ? staff.filter((x) => x.id === requestedId) : staff;
    if (requestedId && candidates.length === 0) return { issue: `Seçilen ${staffWord} bulunamadı` };

    const start = clockMin(q.startTime), end = clockMin(q.endTime);
    const unassignedCount = reservations.filter((r) => !r.staffId
        && r.date === q.date && r.status !== 'cancelled'
        && clockMin(r.startTime) < end && start < clockMin(r.endTime)).length;
    let unassignedCapacity = requestedId ? 0 : unassignedCount;
    const unassignedUsesRequested = !!requestedId && unassignedCount > staff.filter((member) => member.id !== requestedId
        && staffWorksAt(rules, member, q.date, q.startTime, q.endTime)
        && !checkConflict(q.date, q.startTime, q.endTime, undefined, member.id)
        && !cartOverlaps(cart, member.id, q.startTime, q.endTime)).length;

    for (const member of candidates) {
        if (!staffWorksAt(rules, member, q.date, q.startTime, q.endTime)) {
            if (requestedId) return { issue: `${member.name} bu saatte çalışmıyor veya izinli` };
            continue;
        }
        const conflict = checkConflict(q.date, q.startTime, q.endTime, undefined, member.id);
        if (!conflict && !cartOverlaps(cart, member.id, q.startTime, q.endTime)) {
            if (unassignedUsesRequested) {
                return { issue: 'Bu saatteki atanmamış randevu personel kapasitesini dolduruyor' };
            }
            // Eski staff_id=NULL kayıt işletmenin tamamını değil yalnızca bir
            // personellik kapasiteyi kullanır.
            if (unassignedCapacity > 0) { unassignedCapacity--; continue; }
            return { staffMember: member };
        }
        if (requestedId) {
            return {
                issue: conflict
                    ? `${member.name}, ${conflict.startTime}–${conflict.endTime} saatinde dolu`
                    : `${member.name} bu saatte sepetteki başka bir işlemde`,
                conflict: conflict || undefined,
            };
        }
    }
    return { issue: `Bu saatte uygun ${staffWord} yok` };
}

/** Personel + fiziksel kaynak (oda/koltuk/ünite) birlikte. */
export function resolveSlot(rules: SlotRules, q: SlotQuery): SlotResolution {
    const staffResult = resolveSlotStaff(rules, q);
    if (staffResult.issue) return staffResult;

    if (q.resourceId) {
        const selectedResource = rules.resources.find((x) => x.id === q.resourceId);
        const capacity = Math.max(1, selectedResource?.capacity || 1);
        const start = clockMin(q.startTime), end = clockMin(q.endTime);
        const dbOverlaps = rules.reservations.filter((r) => r.resourceId === q.resourceId
            && r.date === q.date && r.status !== 'cancelled'
            && clockMin(r.startTime) < end && start < clockMin(r.endTime));
        const cartCount = (q.cart || []).filter((line) => clockMin(line.startTime) < end && start < clockMin(line.endTime)).length;
        if (dbOverlaps.length + cartCount >= capacity) {
            return {
                ...staffResult,
                issue: `${selectedResource?.name || rules.resourceTypeLabel} bu saatte dolu`,
                conflict: dbOverlaps[0],
            };
        }
    }
    return staffResult;
}

export interface AvailableSlot {
    startTime: string;
    endTime: string;
    staffId?: string;
    staffName?: string;
    resourceId?: string;
    resourceName?: string;
}

export interface SlotSearch {
    date: string;
    /** Hizmetin GERÇEK süresi (settings.services[].duration). Sabit yazılmaz. */
    durationMin: number;
    staffId?: string;
    resourceId?: string | null;
    cart?: CartLine[];
    /** Bu saatten önceki slotlar atlanır (bugün için "şimdi"). */
    notBefore?: string;
    /** Tarama adımı (dk) — genelde settings.slotDuration. */
    stepMin?: number;
    limit?: number;
}

/**
 * Gerçekten uygun saatleri tarar. Dönen her slot resolveSlot'tan geçmiştir:
 * çalışma saati, izin, mevcut randevu, sepet ve kaynak kapasitesi doğrulanmıştır.
 * Yine de kayıt anında YENİDEN doğrulanmalıdır (yarış durumu).
 */
export function findAvailableSlots(rules: SlotRules, search: SlotSearch): AvailableSlot[] {
    const { date, durationMin, staffId, resourceId, cart } = search;
    const step = Math.max(5, search.stepMin || 15);
    const limit = search.limit ?? 3;
    if (durationMin <= 0) return [];

    const jsDay = new Date(`${date}T12:00:00`).getDay();
    // Gün penceresi: organizasyonun çalışma saatleri; personel kendi saatlerini
    // taşıyorsa resolveSlot zaten eleyecektir.
    const orgHours = rules.workingHours.find((x) => x.day === jsDay);
    if (!orgHours || orgHours.isOff) return [];

    // Personel kendi takvimini taşıyorsa pencereyi ona göre genişlet — yoksa
    // sabah 08:00 çalışan bir hekimin erken slotu hiç taranmaz.
    let windowStart = clockMin(orgHours.start);
    let windowEnd = clockMin(orgHours.end);
    for (const member of rules.staff) {
        if (staffId && member.id !== staffId) continue;
        const own = member.workingHours?.find((x) => x.day === jsDay);
        if (own && !own.isOff) {
            windowStart = Math.min(windowStart, clockMin(own.start));
            windowEnd = Math.max(windowEnd, clockMin(own.end));
        }
    }

    const floor = search.notBefore ? clockMin(search.notBefore) : windowStart;
    let cursor = Math.max(windowStart, Math.ceil(floor / step) * step);

    const out: AvailableSlot[] = [];
    while (cursor + durationMin <= windowEnd && out.length < limit) {
        const startTime = addMinutesToTime('00:00', cursor);
        const endTime = addMinutesToTime('00:00', cursor + durationMin);
        const result = resolveSlot(rules, { date, startTime, endTime, staffId, resourceId, cart });
        if (!result.issue) {
            const resource = resourceId ? rules.resources.find((x) => x.id === resourceId) : undefined;
            out.push({
                startTime, endTime,
                staffId: result.staffMember?.id,
                staffName: result.staffMember?.name,
                resourceId: resource?.id,
                resourceName: resource?.name,
            });
        }
        cursor += step;
    }
    return out;
}
