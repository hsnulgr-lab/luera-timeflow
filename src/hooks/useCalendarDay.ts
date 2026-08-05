import { useCallback, useMemo } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { clockMin } from '@/lib/slotResolution';
import { roundToStep } from '@/lib/calendarGrid';

// ── Takvim gününün gerçeği — ORTAK KATMAN ────────────────────────────────────
// "Bu gün açık mı, saat ekseni nereden nereye, doluluk ne, tıklanan piksel hangi
// saate denk geliyor?" — kuaför takviminde birinci sınıf olan bu sorular genel
// takvimde ya hiç sorulmuyor ya sabit varsayımla cevaplanıyordu:
//   • saat ekseni 08–19 SABİTTİ → 07:00 açan klinik ilk randevusunu göremiyordu
//   • org kapalı günü ay/hafta/liste görünümünde HİÇ işlenmiyordu
//   • boş alana tık saat başına yuvarlıyordu (20 dk slotlu işletmede yanlış)
//
// Kurallar saf katmanlarda (lib/calendarGrid, lib/slotResolution); bu hook
// yalnız canlı ayarlara bağlar.

export interface DayHours {
    /** İşletme o gün kapalı (workingHours.isOff) ya da tanımsız. */
    closed: boolean;
    /** Açılış/kapanış — gün başından itibaren dakika. */
    open: number;
    close: number;
}

/** Tanımsız çalışma saati için güvenli pencere; kapalı sayılmaz, sadece bilinmez. */
const FALLBACK: DayHours = { closed: false, open: 9 * 60, close: 18 * 60 };

export interface TimeAxis {
    startHour: number;
    endHour: number;
    hours: number[];
}

export function useCalendarDay() {
    const { reservations, settings } = useReservations();
    const stepMin = settings.slotDuration || 15;

    /** Bir günün çalışma penceresi. */
    const hoursForDate = useCallback((iso: string): DayHours => {
        const date = new Date(`${iso}T12:00:00`);
        if (Number.isNaN(date.getTime())) return FALLBACK;
        const row = settings.workingHours?.find((hours) => hours.day === date.getDay());
        if (!row) return FALLBACK;
        if (row.isOff) return { closed: true, open: clockMin(row.start || '09:00'), close: clockMin(row.end || '18:00') };
        return { closed: false, open: clockMin(row.start), close: clockMin(row.end) };
    }, [settings.workingHours]);

    const isClosed = useCallback((iso: string) => hoursForDate(iso).closed, [hoursForDate]);

    /**
     * Zaman ekseni. Birden çok gün verilirse (hafta görünümü) pencerelerin
     * BİRLEŞİMİ alınır: tek günün penceresi kullanılınca farklı saatli günlerin
     * randevuları eksenin dışında kalıp en üste yığılıyordu.
     * Kapalı günler eksene katılmaz; hepsi kapalıysa varsayılan pencere döner.
     */
    const axisFor = useCallback((isoDates: string[]): TimeAxis => {
        const windows = isoDates.map(hoursForDate).filter((w) => !w.closed);
        const open = windows.length ? Math.min(...windows.map((w) => w.open)) : FALLBACK.open;
        const close = windows.length ? Math.max(...windows.map((w) => w.close)) : FALLBACK.close;
        const startHour = Math.floor(open / 60);
        const endHour = Math.max(startHour + 1, Math.ceil(close / 60));
        return {
            startHour,
            endHour,
            hours: Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
        };
    }, [hoursForDate]);

    /**
     * Günün doluluğu (%): planlanan dakika / (açık dakika × kaynak sayısı).
     * Kapalı günde 0. İptaller sayılmaz — talep değil, boşluk üretirler.
     */
    const occupancyOf = useCallback((iso: string, resourceCount = 1): number => {
        const { closed, open, close } = hoursForDate(iso);
        if (closed) return 0;
        const capacity = Math.max(1, close - open) * Math.max(1, resourceCount);
        const booked = reservations
            .filter((r) => r.date === iso && r.status !== 'cancelled')
            .reduce((sum, r) => sum + Math.max(0, clockMin(r.endTime) - clockMin(r.startTime)), 0);
        return Math.min(100, Math.round((booked / capacity) * 100));
    }, [hoursForDate, reservations]);

    /**
     * Izgarada tıklanan noktanın saati. `minutesFromAxisStart` piksel değil
     * dakika bekler — piksel→dakika çevirimi çağıranın ölçeğine (pxPerHour) ait.
     * Sonuç işletmenin slot adımına yuvarlanır ve çalışma penceresine kırpılır.
     */
    const timeAtOffset = useCallback((iso: string, axis: TimeAxis, minutesFromAxisStart: number): string => {
        const { open, close } = hoursForDate(iso);
        const raw = axis.startHour * 60 + Math.max(0, minutesFromAxisStart);
        const snapped = roundToStep(raw, stepMin);
        const clamped = Math.min(Math.max(snapped, open), Math.max(open, close - stepMin));
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
    }, [hoursForDate, stepMin]);

    return useMemo(() => ({
        hoursForDate,
        isClosed,
        axisFor,
        occupancyOf,
        timeAtOffset,
        stepMin,
    }), [hoursForDate, isClosed, axisFor, occupancyOf, timeAtOffset, stepMin]);
}
