/**
 * Salon ayarlarının kaynağı — çalışma saatleri, hizmetler, bildirimler.
 *
 * Sunucuda bu uçlar YOK. `calendarSource` ile aynı geçici katman: yüzey
 * async, gecikmeli ve yazma işlemi bir sonuç döndürüyor — böylece ekranlar
 * "sunucu onayı gelmeden kapanma" sözleşmesini bugünden yaşıyor ve uç
 * yazıldığında yalnız bu dosyanın gövdesi değişecek.
 *
 * Kalıcı DEĞİL: uygulama kapanınca kaybolur, çünkü bellekte duruyor.
 *
 * Saf DEĞİL (gecikme kullanıyor) ama React'siz — ekranlar bunu doğrudan
 * çağırır.
 */

import type { DaySchedule, NotificationKey, SalonService } from './managerProfile.ts';
import { mockServices } from './createFlow.ts';

const LATENCY_MS = 220;

const wait = () => new Promise<void>((resolve) => { setTimeout(resolve, LATENCY_MS); });

// ── Bellekteki durum ────────────────────────────────────────────────────────

/** Tasarımdaki salon: hafta içi 09–20, cuma 09–21, cumartesi 10–21, pazar kapalı. */
let HOURS: DaySchedule[] = [
    { day: 0, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 1, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 2, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 3, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 4, open: 9 * 60, close: 21 * 60, closed: false },
    { day: 5, open: 10 * 60, close: 21 * 60, closed: false },
    { day: 6, open: 10 * 60, close: 18 * 60, closed: true },
];

/**
 * Hizmetler randevu akışının listesinden tohumlanır — iki ekranın aynı
 * hizmetleri göstermesi için. İkisi ayrışırsa müdür fiyatı burada değiştirir,
 * randevuda eskisi görünür.
 */
let SERVICES: SalonService[] = mockServices.map((service) => ({
    id: service.id,
    name: service.name,
    minutes: service.minutes,
    price: service.price ?? null,
    color: service.color,
}));

let NOTIFY: Record<NotificationKey, boolean> = {
    booked: true,
    cancelled: true,
    noshow: true,
    daily: false,
};

/** Org başına KVKK aydınlatma metni adresi. Boşsa o satır HİÇ çizilmez. */
let KVKK_URL: string | null = null;

// ── Okuma ───────────────────────────────────────────────────────────────────

export async function readHours(): Promise<DaySchedule[]> {
    await wait();
    return HOURS.map((day) => ({ ...day }));
}

export async function readServices(): Promise<SalonService[]> {
    await wait();
    return SERVICES.map((service) => ({ ...service }));
}

export async function readNotifications(): Promise<Record<NotificationKey, boolean>> {
    await wait();
    return { ...NOTIFY };
}

export async function readKvkkUrl(): Promise<string | null> {
    await wait();
    return KVKK_URL;
}

// ── Yazma ───────────────────────────────────────────────────────────────────

export interface SaveResult<T> {
    ok: boolean;
    value?: T;
}

/**
 * Bir günü kaydeder. `spread` verilirse aynı saatler açık günlere kopyalanır
 * — kapalı günler AÇILMAZ (bkz. `applyToAllDays`).
 */
export async function saveDay(
    day: DaySchedule,
    spread = false,
): Promise<SaveResult<DaySchedule[]>> {
    await wait();
    HOURS = HOURS.map((candidate) => {
        if (candidate.day === day.day) return { ...day };
        if (!spread || candidate.closed) return candidate;
        return { ...candidate, open: day.open, close: day.close };
    });
    return { ok: true, value: HOURS.map((item) => ({ ...item })) };
}

export async function saveService(service: SalonService): Promise<SaveResult<SalonService[]>> {
    await wait();
    const at = SERVICES.findIndex((candidate) => candidate.id === service.id);
    if (at >= 0) SERVICES[at] = { ...service };
    else SERVICES = [...SERVICES, { ...service }];
    return { ok: true, value: SERVICES.map((item) => ({ ...item })) };
}

export async function deleteService(id: string): Promise<SaveResult<SalonService[]>> {
    await wait();
    SERVICES = SERVICES.filter((service) => service.id !== id);
    return { ok: true, value: SERVICES.map((item) => ({ ...item })) };
}

export async function setNotification(
    key: NotificationKey,
    value: boolean,
): Promise<SaveResult<Record<NotificationKey, boolean>>> {
    await wait();
    NOTIFY = { ...NOTIFY, [key]: value };
    return { ok: true, value: { ...NOTIFY } };
}

// ── Hesap silme ─────────────────────────────────────────────────────────────

export interface DeletionFacts {
    soleManager: boolean;
    appointments: number;
    customers: number;
    services: number;
    staff: string[];
}

/**
 * Silme ekranı bu sayılar gelmeden AÇILMAZ: "312 randevu silinecek" cümlesi
 * uydurulamaz, bilinmeden liste çizilmez.
 */
export async function readDeletionFacts(): Promise<DeletionFacts> {
    await wait();
    return {
        soleManager: true,
        appointments: 312,
        customers: 148,
        services: SERVICES.length,
        staff: ['Ece Yılmaz', 'Merve Ak'],
    };
}

/*
 * Hesap silme BURADA DEĞİL: `src/api/accountDeletion.ts`.
 *
 * Bu dosya saf karar/veri katmanı — Supabase istemcisi AsyncStorage üzerinden
 * react-native'e bağlı ve buraya giremez. Silme bir ayar değil, bir kimlik
 * işlemi; api katmanına ait.
 */
