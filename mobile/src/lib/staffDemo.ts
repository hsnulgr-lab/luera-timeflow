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
import type { VisitFormula } from './formula.ts';
import type { StaffCardSource } from './staffCard.ts';

export interface DemoAppointment extends StaffCardSource {
    id: string;
    /**
     * Müşteri defterindeki kimlik (`customerBook.demoBook`). Kart sayfası
     * bunu istiyor: yalnız adla açılan bir kart, aynı adlı iki müşteride
     * yanlış defteri açardı.
     */
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    service: string;
    notes: string | null;
    /**
     * Ziyaretin renk formülü — SUNUCUDAN.
     *
     * Kumanda bunu yerel bir depodan okuyordu ve depo uygulama kapanınca
     * boşalıyordu: kaydedilen formül ikinci açılışta yoktu. Sunucu onu her
     * okumada zaten gönderiyor (`RES_COLS`), yalnız buraya taşınmıyordu.
     * Sahte ajandada yok — orada formül yazılmaz.
     */
    formula?: VisitFormula | null;
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
            customer_id: 'c11',
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
            customer_id: 'c2',
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
            customer_id: 'c4',
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
            customer_id: 'c12',
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
            customer_id: 'c13',
            customer_name: 'Hakan Toprak',
            service: 'Saç bakım maskesi',
            arrived_at: null,
            service_ended_at: null,
            adisyon_items: null,
        },
    ];
}

/**
 * BAŞKA BİR GÜNÜN sahte listesi.
 *
 * "Bugün" ekranı artık şeritteki her güne bakabiliyor; bugün dışındaki
 * günlerde saatler `now`a göre değil SABİT üretiliyor, çünkü orada bir "şimdi"
 * yok — şimdi çizgisi de çizilmiyor.
 *
 * Geçmiş gün bitmiş, gelecek gün henüz başlamamış gösteriliyor: kartın evresi
 * damgalardan okunduğu için başka türlü "geçen salı hâlâ sürüyor" gibi
 * imkânsız bir hâl çıkardı.
 *
 * Sunucuya bağlanınca `agenda` ucu tarihi parametre alacak ve bu fonksiyon
 * tamamen gidecek.
 */
export function demoAgendaFor(dateISO: string, currentISO: string): DemoAppointment[] {
    const past = dateISO < currentISO;
    const base = {
        date: dateISO,
        status: 'confirmed' as const,
        customer_phone: '+90...',
        notes: null as string | null,
    };
    // Gün başına değişen ama SABİT bir kesit: aynı güne iki kez bakınca aynı
    // liste geliyor. Rastgele üretim, ekranı her açılışta başka gösterirdi.
    const seed = Number(dateISO.slice(-2)) % 4;
    // Adlar DEFTERDEN (`customerBook.demoBook`) ve kimlikleri taşıyorlar:
    // randevusu olan müşteri defterde bulunabilmeli. Buradaki iki ad
    // ("Selin Boz", "Deniz Aksoy") aslında PERSONEL listesinde de geçiyordu
    // (authStub, managerFlow) — aynı kişi hem çalışan hem müşteri görünüyordu.
    const plan = [
        { id: 'w1', at: '10:00', until: '10:45', cid: 'c1', name: 'Sibel Arda', service: 'Kesim + fön' },
        { id: 'w2', at: '11:30', until: '13:30', cid: 'c7', name: 'Meryem Aksoy', service: 'Saç boyama + fön' },
        { id: 'w3', at: '14:00', until: '14:30', cid: 'c5', name: 'Buse Yıldırım', service: 'Fön' },
        { id: 'w4', at: '16:00', until: '17:00', cid: 'c3', name: 'Zeynep Kaya', service: 'Röfle' },
    ].slice(0, [0, 2, 3, 4][seed]);

    return plan.map((item) => ({
        ...base,
        id: `${dateISO}-${item.id}`,
        start_time: item.at,
        end_time: item.until,
        customer_id: item.cid,
        customer_name: item.name,
        service: item.service,
        // Geçmiş gün: geldi, yapıldı, kasaya gitti. Gelecek gün: hiçbir damga
        // yok — olmayan bir şeyin damgası uydurulmuyor.
        customer_arrived_at: past ? `${dateISO}T${item.at}:00.000Z` : null,
        arrived_at: past ? `${dateISO}T${item.at}:00.000Z` : null,
        service_ended_at: past ? `${dateISO}T${item.until}:00.000Z` : null,
        adisyon_items: past ? [{ id: 'a1' }] : null,
        is_paid: past,
    }));
}
