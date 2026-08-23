import { addDaysISO, daysBetween, todayISO, type Appt } from './calendar.ts';

export interface CalendarSource {
    day(date: string): Promise<Appt[]>;
    range(from: string, to: string): Promise<Record<string, number>>;
    nextAfter(date: string): Promise<Appt | null>;
}

/**
 * Sahte kaynağın yapay gecikmesi.
 *
 * Anında dönen bir kaynak, yükleme iskeletini ve aşağı-çekip-yenilemeyi
 * GÖRÜNMEZ kılar — yazılmış ama hiç tetiklenmeyen kod olur. Gerçek sunucu
 * bağlandığında bu fonksiyon `apiSource` ile birlikte tamamen kalkacak.
 */
const MOCK_LATENCY_MS = 450;
const mockLatency = () => new Promise<void>((resolve) => {
    setTimeout(resolve, MOCK_LATENCY_MS);
});

/**
 * Sahte verinin sabitlendiği gün. GERÇEK gün değil, bir ÇAPA.
 *
 * Veri bu tarihe göre yazıldı; ama uygulama "bugün" derken cihazın gününü
 * kastediyor. İkisi ayrıldığında ekranda iki farklı "şimdi" oluşuyordu:
 *   • 12:00'deki bir randevu "gelmedi" damgası yiyordu (gün geçmişte kaldığı
 *     için bitiş saati `Date.now()`un gerisinde kalıyor),
 *   • takvimin "şimdi" çizgisi ile başlığın günü birbirini tutmuyordu.
 *
 * Çözüm: kaynak okunurken tüm gün ÇAPADAN BUGÜNE kaydırılıyor. Veri olduğu
 * gibi duruyor, sunulurken tarihleri kayıyor. Sunucu bağlandığında bu blok
 * `apiSource` ile birlikte tamamen kalkacak.
 */
export const MOCK_ANCHOR = '2026-08-13';

/** Çapa ile bugün arasındaki gün farkı — süreç boyunca sabit. */
const SHIFT = daysBetween(MOCK_ANCHOR, todayISO());

/** Bir ISO günü çapadan bugüne (ya da tersine) kaydırır. */
const shiftDay = (iso: string, by: number) => addDaysISO(iso, by);

/**
 * Çapa takvimindeki bir günün EKRANDA göründüğü karşılığı.
 *
 * Testler sahte veriyi çapa tarihleriyle tanıyor ama kaynak bugüne kaydırılmış
 * hâlini döndürüyor; ikisi arasındaki köprü burada, tek yerde.
 */
export function shownDate(anchoredISO: string): string {
    return shiftDay(anchoredISO, SHIFT);
}

/** ISO damgasının yalnız TARİH kısmını kaydırır; saat ve dilim korunur. */
const shiftStamp = (stamp: string | null, by: number) => (
    stamp && stamp.length > 10 ? `${shiftDay(stamp.slice(0, 10), by)}${stamp.slice(10)}` : stamp
);

/** Kaynaktan çıkan randevuyu bugüne taşır. */
function toToday(appointment: Appt): Appt {
    if (SHIFT === 0) return appointment;
    return {
        ...appointment,
        date: shiftDay(appointment.date, SHIFT),
        arrived_at: shiftStamp(appointment.arrived_at, SHIFT),
        service_ended_at: shiftStamp(appointment.service_ended_at, SHIFT),
    };
}

const MOCK_DAYS: Record<string, Appt[]> = {
    /**
     * Müdür günü — personel sütunlu takvimin ve akış ekranının kaynağı.
     *
     * Personel günlerinden tek farkı: her randevunun `staff_id`'si var.
     * Personel modunda o alan gereksizdi (sunucu zaten yalnız kendi
     * randevularını döndürüyor); müdür modunda randevuyu sütuna yerleştiren
     * tek şey o.
     */
    '2026-08-13': [
        {
            id: 'mgr-0900-merve', customer_id: 'c-buket', customer_name: 'Buket Şahin',
            customer_phone: '+905321110301', date: '2026-08-13',
            start_time: '09:00', end_time: '09:30', service: 'Kesim',
            service_color: '#2D8F32', status: 'completed', staff_id: 'merve', notes: null,
            arrived_at: '2026-08-13T08:58:00+03:00', service_ended_at: '2026-08-13T09:28:00+03:00',
            info: null,
        },
        {
            id: 'mgr-1100-merve', customer_id: 'c-zeynep', customer_name: 'Zeynep Kaya',
            customer_phone: '+905321110302', date: '2026-08-13',
            start_time: '11:00', end_time: '12:30', service: 'Saç boyama',
            service_color: '#FF5A1F', status: 'confirmed', staff_id: 'merve', notes: null,
            arrived_at: '2026-08-13T11:00:00+03:00', service_ended_at: null,
            info: {
                risk: null, pkg: { name: 'Boya paketi', used: 3, total: 8 },
                visitNo: 7, lastVisit: '2 Tem · Saç boyama', balance: 0,
            },
        },
        {
            id: 'mgr-1030-selin', customer_id: 'c-elif', customer_name: 'Elif Demir',
            customer_phone: '+905321110303', date: '2026-08-13',
            start_time: '10:30', end_time: '11:15', service: 'Keratin bakımı',
            service_color: '#B87A00', status: 'confirmed', staff_id: 'selin', notes: null,
            arrived_at: '2026-08-13T10:29:00+03:00', service_ended_at: null,
            info: { risk: null, pkg: null, visitNo: 3, lastVisit: '12 Tem · Keratin bakımı', balance: 0 },
        },
        {
            id: 'mgr-1300-selin', customer_id: 'c-nur', customer_name: 'Nur Aksoy',
            customer_phone: '+905321110304', date: '2026-08-13',
            start_time: '13:00', end_time: '13:20', service: 'Kaş alma',
            service_color: '#B87A00', status: 'pending', staff_id: 'selin', notes: null,
            arrived_at: null, service_ended_at: null, info: null,
        },
        {
            id: 'mgr-0940-deniz', customer_id: 'c-ayse', customer_name: 'Ayşe Yılmaz',
            customer_phone: '+905321110305', date: '2026-08-13',
            start_time: '09:40', end_time: '11:10', service: 'Saç boyama',
            service_color: '#FF5A1F', status: 'confirmed', staff_id: 'deniz', notes: null,
            arrived_at: '2026-08-13T09:38:00+03:00', service_ended_at: null,
            info: null,
        },
        {
            id: 'mgr-1200-deniz', customer_id: 'c-merve-a', customer_name: 'Merve Aydın',
            customer_phone: '+905321110306', date: '2026-08-13',
            start_time: '12:00', end_time: '13:00', service: 'Kesim + fön',
            service_color: '#2D8F32', status: 'confirmed', staff_id: 'deniz',
            notes: 'Uçları çok kısa istemiyor',
            arrived_at: null, service_ended_at: null,
            // Bakiyesi olan müşteri: rozet "₺0" değil gerçek borcu yazmalı.
            info: { risk: null, pkg: null, visitNo: 12, lastVisit: '28 Tem · Kesim + fön', balance: 450 },
        },
        {
            id: 'mgr-1000-ece', customer_id: 'c-burak', customer_name: 'Burak Şen',
            customer_phone: '+905321110307', date: '2026-08-13',
            start_time: '10:00', end_time: '10:30', service: 'Kesim',
            service_color: '#2D8F32', status: 'cancelled', staff_id: 'ece', notes: null,
            arrived_at: null, service_ended_at: null, info: null,
        },
        {
            id: 'mgr-1330-ece', customer_id: 'c-hakan', customer_name: 'Hakan Toprak',
            customer_phone: '+905321110308', date: '2026-08-13',
            start_time: '13:30', end_time: '14:30', service: 'Saç bakım maskesi',
            service_color: '#B87A00', status: 'confirmed', staff_id: 'ece', notes: null,
            arrived_at: null, service_ended_at: null, info: null,
        },
    ],
    // Geçmiş gün: tamamlanan işler, gelmeyen müşteri ve iptal durumu birlikte.
    '2026-09-16': [
        {
            id: 'mock-20260916-1000',
            customer_id: 'mock-customer-elif-aydin',
            customer_name: 'Elif Aydın',
            customer_phone: '+905321110101',
            date: '2026-09-16',
            start_time: '10:00',
            end_time: '10:45',
            service: 'Kesim + fön',
            service_color: '#2F6FED',
            status: 'completed',
            notes: null,
            arrived_at: '2026-09-16T09:57:00+03:00',
            service_ended_at: '2026-09-16T10:43:00+03:00',
            info: {
                risk: null,
                pkg: null,
                visitNo: 3,
                lastVisit: '18 Ağu · Kesim',
            },
        },
        {
            id: 'mock-20260916-1230',
            customer_id: 'mock-customer-selin-dogan',
            customer_name: 'Selin Doğan',
            customer_phone: '+905321110102',
            date: '2026-09-16',
            start_time: '12:30',
            end_time: '13:30',
            service: 'Keratin bakımı',
            service_color: '#0F9B8E',
            status: 'completed',
            notes: null,
            arrived_at: '2026-09-16T12:25:00+03:00',
            service_ended_at: '2026-09-16T13:28:00+03:00',
            info: null,
        },
        {
            id: 'mock-20260916-1400',
            customer_id: 'mock-customer-burak-sen',
            customer_name: 'Burak Şen',
            customer_phone: '+905321110103',
            date: '2026-09-16',
            start_time: '14:00',
            end_time: '14:30',
            service: 'Kesim',
            service_color: '#2F6FED',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
        {
            id: 'mock-20260916-1530',
            customer_id: 'mock-customer-ece-unal',
            customer_name: 'Ece Ünal',
            customer_phone: '+905321110104',
            date: '2026-09-16',
            start_time: '15:30',
            end_time: '16:00',
            service: 'Fön',
            service_color: '#2F6FED',
            status: 'cancelled',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
    ],

    // Hafta şeridinde farklı nokta yoğunluklarını görünür kılan komşu günler.
    '2026-09-22': [
        {
            id: 'mock-20260922-1430',
            customer_id: 'mock-customer-derya-koc',
            customer_name: 'Derya Koç',
            customer_phone: '+905321110201',
            date: '2026-09-22',
            start_time: '14:30',
            end_time: '15:15',
            service: 'Kesim + fön',
            service_color: '#2F6FED',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
    ],
    '2026-09-23': [
        {
            id: 'mock-20260923-0930',
            customer_id: 'mock-customer-gamze-arslan',
            customer_name: 'Gamze Arslan',
            customer_phone: '+905321110301',
            date: '2026-09-23',
            start_time: '09:30',
            end_time: '10:00',
            service: 'Fön',
            service_color: '#2F6FED',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
        {
            id: 'mock-20260923-1200',
            customer_id: 'mock-customer-nazli-ertem',
            customer_name: 'Nazlı Ertem',
            customer_phone: '+905321110302',
            date: '2026-09-23',
            start_time: '12:00',
            end_time: '13:30',
            service: 'Saç boyama',
            service_color: '#7A5AF0',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
        {
            id: 'mock-20260923-1600',
            customer_id: 'mock-customer-pelin-sari',
            customer_name: 'Pelin Sarı',
            customer_phone: '+905321110303',
            date: '2026-09-23',
            start_time: '16:00',
            end_time: '16:45',
            service: 'Saç bakımı',
            service_color: '#0F9B8E',
            status: 'pending',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
    ],

    // Ana tasarım senaryosu: tamamlanmış, sürmekte olan ve bekleyen üç kart.
    '2026-09-24': [
        {
            id: 'mock-20260924-1000',
            customer_id: 'mock-customer-merve-aydin',
            customer_name: 'Merve Aydın',
            customer_phone: '+905321110401',
            date: '2026-09-24',
            start_time: '10:00',
            end_time: '10:45',
            service: 'Kesim + fön',
            service_color: '#2F6FED',
            status: 'completed',
            notes: null,
            arrived_at: '2026-09-24T09:58:00+03:00',
            service_ended_at: '2026-09-24T10:44:00+03:00',
            info: null,
        },
        {
            id: 'mock-20260924-1100',
            customer_id: 'mock-customer-zeynep-kaya',
            customer_name: 'Zeynep Kaya',
            customer_phone: '+905321110402',
            date: '2026-09-24',
            start_time: '11:00',
            end_time: '12:30',
            service: 'Saç boyama',
            service_color: '#7A5AF0',
            status: 'confirmed',
            notes: 'Kök boyası istiyor.',
            arrived_at: '2026-09-24T11:00:00+03:00',
            service_ended_at: null,
            info: {
                risk: null,
                pkg: { name: 'Boya Paketi', used: 3, total: 8 },
                visitNo: 4,
                lastVisit: '12 Tem · Kesim',
            },
        },
        {
            id: 'mock-20260924-1300',
            customer_id: 'mock-customer-elif-demir',
            customer_name: 'Elif Demir',
            customer_phone: '+905321110403',
            date: '2026-09-24',
            start_time: '13:00',
            end_time: '13:45',
            service: 'Keratin bakımı',
            service_color: '#0F9B8E',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: {
                risk: 'Amonyaklı üründe cilt hassasiyeti oluşuyor.',
                pkg: { name: 'Bakım Paketi', used: 1, total: 4 },
                visitNo: 2,
                lastVisit: '3 Ağu · Bakım',
            },
        },
    ],

    '2026-09-25': [
        {
            id: 'mock-20260925-0900',
            customer_id: 'mock-customer-ayse-korkmaz',
            customer_name: 'Ayşe Korkmaz',
            customer_phone: '+905321110501',
            date: '2026-09-25',
            start_time: '09:00',
            end_time: '11:00',
            service: 'Röfle',
            service_color: '#7A5AF0',
            status: 'confirmed',
            notes: 'Alerji testi yapıldı.',
            arrived_at: null,
            service_ended_at: null,
            info: {
                risk: 'Alerji testi sonucu işlemden önce kontrol edilmeli.',
                pkg: null,
                visitNo: 6,
                lastVisit: '21 Ağu · Röfle',
            },
        },
        {
            id: 'mock-20260925-1200',
            customer_id: 'mock-customer-hakan-erdem',
            customer_name: 'Hakan Erdem',
            customer_phone: '+905321110502',
            date: '2026-09-25',
            start_time: '12:00',
            end_time: '12:40',
            service: 'Kesim + sakal',
            service_color: '#2F6FED',
            status: 'pending',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
        {
            id: 'mock-20260925-1630',
            customer_id: 'mock-customer-deniz-aslan',
            customer_name: 'Deniz Aslan',
            customer_phone: '+905321110503',
            date: '2026-09-25',
            start_time: '16:30',
            end_time: '17:15',
            service: 'Saç bakımı',
            service_color: '#0F9B8E',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
    ],

    // Bu gün 11:00 civarında açıldığında tek bir "sırası geldi" kartı üretir.
    '2026-09-26': [
        {
            id: 'mock-20260926-1100',
            customer_id: 'mock-customer-zeynep-kaya',
            customer_name: 'Zeynep Kaya',
            customer_phone: '+905321110402',
            date: '2026-09-26',
            start_time: '11:00',
            end_time: '12:30',
            service: 'Saç boyama',
            service_color: '#7A5AF0',
            status: 'confirmed',
            notes: 'Kök boyası istiyor.',
            arrived_at: null,
            service_ended_at: null,
            info: {
                risk: null,
                pkg: { name: 'Boya Paketi', used: 3, total: 8 },
                visitNo: 4,
                lastVisit: '12 Tem · Kesim',
            },
        },
        {
            id: 'mock-20260926-1300',
            customer_id: 'mock-customer-selin-dogan',
            customer_name: 'Selin Doğan',
            customer_phone: '+905321110102',
            date: '2026-09-26',
            start_time: '13:00',
            end_time: '14:00',
            service: 'Keratin bakımı',
            service_color: '#0F9B8E',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
        {
            id: 'mock-20260926-1530',
            customer_id: 'mock-customer-merve-yilmaz',
            customer_name: 'Merve Yılmaz',
            customer_phone: '+905321110601',
            date: '2026-09-26',
            start_time: '15:30',
            end_time: '16:00',
            service: 'Kesim',
            service_color: '#2F6FED',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
    ],

    // Bilerek boş: day() boş diziyi, range() sıfır randevuyu temsil eder.
    '2026-09-27': [],
    '2026-09-28': [
        {
            id: 'mock-20260928-0930',
            customer_id: 'mock-customer-elif-aydin',
            customer_name: 'Elif Aydın',
            customer_phone: '+905321110101',
            date: '2026-09-28',
            start_time: '09:30',
            end_time: '10:15',
            service: 'Kesim + fön',
            service_color: '#2F6FED',
            status: 'confirmed',
            notes: null,
            arrived_at: null,
            service_ended_at: null,
            info: null,
        },
    ],
};

function cloneAppt(appt: Appt): Appt {
    return {
        ...appt,
        info: appt.info
            ? {
                ...appt.info,
                pkg: appt.info.pkg ? { ...appt.info.pkg } : null,
            }
            : appt.info,
    };
}

export const mockSource: CalendarSource = {
    async day(date) {
        await mockLatency();
        // İstenen gün BUGÜN takviminde; kaynakta çapa takviminde duruyor.
        const stored = MOCK_DAYS[shiftDay(date, -SHIFT)] ?? [];
        return stored.map((appointment) => toToday(cloneAppt(appointment)));
    },

    async range(from, to) {
        const counts: Record<string, number> = {};
        for (const [date, appointments] of Object.entries(MOCK_DAYS)) {
            const shown = shiftDay(date, SHIFT);
            if (shown >= from && shown <= to && appointments.length > 0) {
                counts[shown] = appointments.length;
            }
        }
        return counts;
    },

    async nextAfter(date) {
        const anchored = shiftDay(date, -SHIFT);
        const next = Object.entries(MOCK_DAYS)
            .filter(([candidateDate]) => candidateDate > anchored)
            .flatMap(([, appointments]) => appointments)
            .filter((appointment) => appointment.status !== 'cancelled')
            .sort((a, b) => (
                a.date.localeCompare(b.date)
                || a.start_time.localeCompare(b.start_time)
            ))[0];

        return next ? toToday(cloneAppt(next)) : null;
    },
};

/**
 * Yeni randevuyu SAHTE kaynağa yazar.
 *
 * Sunucuda randevu oluşturma ucu YOK. Bu fonksiyon, oluşturulan randevunun
 * takvimde gerçekten görünmesini sağlıyor — müdüre sahte bir "kaydedildi"
 * mesajı göstermek yerine randevunun kendisini gösteriyoruz. Uç yazıldığında
 * bu fonksiyon tamamen kalkacak; kaydın nereye gittiği o zaman sunucu olacak.
 *
 * Kalıcı DEĞİL: uygulama kapanınca kaybolur, çünkü bellekte duruyor.
 */
export function addLocalAppointment(appointment: Appt): void {
    // Kaynak ÇAPA takviminde yaşıyor; gelen randevu bugün takviminde.
    const key = shiftDay(appointment.date, -SHIFT);
    const day = MOCK_DAYS[key] ?? (MOCK_DAYS[key] = []);
    day.push({ ...appointment, date: key });
    day.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

// Bağlama turunda yalnız bu atama apiSource'a çevrilecek.
export const source: CalendarSource = mockSource;
