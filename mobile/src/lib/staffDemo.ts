/**
 * SAHTE GÜN — sunucuya bağlanana kadar.
 *
 * "Bugün" listesi ve işlem kumandası AYNI randevuları görmek zorunda: kart
 * kumandayı açıyor, kumanda o randevunun evresini kendi verisinden okuyor.
 * İki ekran ayrı sahte veri üretirse kart bir şey, açılan sayfa başka bir şey
 * söyler.
 *
 * Saatler `now`a göre üretiliyor, sabit değil: sabit saatlerle şimdi çizgisi
 * günün rastgele bir yerinde durur ve ekran ölü görünürdü.
 */

import { hhmm } from './calendar.ts';
import type { StaffCardSource } from './staffCard.ts';

export interface DemoAppointment extends StaffCardSource {
    id: string;
    customer_name: string;
    customer_phone: string | null;
    service: string;
    notes: string | null;
}

const MIN = 60_000;

export const clockOf = (ms: number) => {
    const date = new Date(ms);
    return hhmm(date.getHours() * 60 + date.getMinutes());
};

export function demoAgenda(nowMs: number, dateISO: string): DemoAppointment[] {
    const at = (offsetMin: number) => clockOf(nowMs + offsetMin * MIN);
    const stamp = (offsetMin: number) => new Date(nowMs + offsetMin * MIN).toISOString();
    const base = {
        date: dateISO,
        status: 'confirmed' as const,
        is_paid: false,
        customer_phone: '+90...',
        notes: null as string | null,
    };

    return [
        {
            ...base,
            id: 'd1',
            start_time: at(-156),
            end_time: at(-111),
            customer_name: 'Merve Aydın',
            service: 'Kesim + fön',
            customer_arrived_at: stamp(-160),
            arrived_at: stamp(-156),
            service_ended_at: stamp(-111),
            adisyon_items: [{ id: 'a1' }],
            is_paid: true,
        },
        {
            ...base,
            id: 'd2',
            start_time: at(-66),
            end_time: at(54),
            customer_name: 'Ayşe Yılmaz',
            service: 'Saç boyama + fön',
            notes: 'Kökte 7.3, uçlarda 8.1. Geçen sefer kaşınma oldu — bekleme 30 dk\'yı geçmesin.',
            customer_arrived_at: stamp(-70),
            arrived_at: stamp(-66),
            service_ended_at: null,
            adisyon_items: null,
        },
        {
            ...base,
            id: 'd3',
            start_time: at(-6),
            end_time: at(24),
            customer_name: 'Elif Demir',
            service: 'Kesim',
            customer_arrived_at: stamp(-6),
            arrived_at: null,
            service_ended_at: null,
            adisyon_items: null,
        },
        {
            ...base,
            id: 'd4',
            start_time: at(144),
            end_time: at(164),
            customer_name: 'Nur Aksoy',
            service: 'Kaş alma',
            arrived_at: null,
            service_ended_at: null,
            adisyon_items: null,
        },
        {
            ...base,
            id: 'd5',
            start_time: at(264),
            end_time: at(324),
            customer_name: 'Hakan Toprak',
            service: 'Saç bakım maskesi',
            arrived_at: null,
            service_ended_at: null,
            adisyon_items: null,
        },
    ];
}
