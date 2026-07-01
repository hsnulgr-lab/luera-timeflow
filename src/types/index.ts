export interface Reservation {
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    date: string;
    startTime: string;
    endTime: string;
    service: string;
    serviceColor?: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    notes?: string;
    createdAt: string;
    updatedAt?: string;
    reminder24hSent?: boolean;
    reminder2hSent?: boolean;
    staffId?: string;
    staffName?: string;
    staffColor?: string;
    recurrenceRule?: 'weekly' | 'monthly';
    recurrenceUntil?: string;   // YYYY-MM-DD
    source?: 'manual' | 'booking' | 'leadflow';
    isPaid?: boolean;
    arrivedAt?: string;   // "Başladı" zaman damgası (confirmed → hizmette); süre başlangıcı
    serviceEndedAt?: string;   // "Bitti" zaman damgası — süre durdu, adisyon kontrol/kasa aşaması
    adisyonItems?: AdisyonItem[];   // Hizmet sırasında canlı eklenen kalemler (boya/ürün/ekstra)
    groupId?: string;   // Çoklu hizmet booking'i — aynı ziyaretin satırları bu id'yi paylaşır
}

// Adisyon satır kalemi — hizmet sırasında canlı eklenir, randevuya kalıcı yazılır.
// Temel hizmet ücreti ayrı (settings.services'ten); burada yalnızca ekstralar tutulur.
export interface AdisyonItem {
    id: string;
    name: string;
    price: number;
    kind: 'product' | 'extra';   // katalog ürünü mü, serbest ekstra mı
}

export interface Customer {
    id: string;
    name: string;
    phone: string;
    email?: string;
    totalReservations: number;
    lastVisit?: string;
    notes?: string;
    loyaltyStamps?: number;   // Dijital müşteri kartı — biriken damga
    createdAt: string;
}

export interface WorkingHours {
    day: number;
    dayName: string;
    start: string;
    end: string;
    isOff: boolean;
}

export interface Service {
    id: string;
    name: string;
    duration: number;
    color: string;
    price?: number;
}

export interface Settings {
    businessName: string;
    workingHours: WorkingHours[];
    services: Service[];
    webhookUrl?: string;
    slotDuration: number;
    whatsappInstance?: string;
    sector?: string;
    managerPin?: string;   // Mobil Yönetici Modu girişi (SHA-256 hash; opsiyonel)
    loyaltyEnabled?: boolean;    // Dijital müşteri kartı açık mı
    loyaltyThreshold?: number;   // Kaç ziyarette 1 ödül (vars. 10)
    loyaltyReward?: string;      // Ödül metni (vars. "Ücretsiz hizmet")
    rebookEnabled?: boolean;     // Sıradaki randevu otomasyonu açık mı
    rebookNote?: string;         // Teşvik satırı (ör. "%10 erken rezervasyon indirimi")
}

export interface Staff {
    id: string;
    organizationId: string;
    name: string;
    specialty?: string;
    phone?: string;
    email?: string;
    color: string;
    workingHours?: WorkingHours[];
    isActive: boolean;
    pin?: string;        // Personel Modu girişi için (SHA-256 hash; opsiyonel)
    createdAt: string;
}

export interface StaffTimeOff {
    id: string;
    staffId: string;
    organizationId: string;
    date: string;        // YYYY-MM-DD
    reason?: string;
    createdAt: string;
}

export interface CustomerPackage {
    id: string;
    organizationId: string;
    customerId: string;
    name: string;
    totalSessions: number;
    usedSessions: number;
    createdAt: string;
}

export interface WaitlistEntry {
    id: string;
    organizationId: string;
    customerName: string;
    customerPhone: string;
    serviceId?: string;
    preferredDate?: string;   // YYYY-MM-DD
    notes?: string;
    status: 'waiting' | 'notified' | 'fulfilled' | 'cancelled';
    notifiedAt?: string;
    createdAt: string;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
export type PaymentType = 'service' | 'product' | 'other';

export interface Payment {
    id: string;
    organizationId: string;
    customerId?: string;
    reservationId?: string;
    productId?: string;
    staffId?: string;
    type: PaymentType;
    description?: string;
    amount: number;
    method: PaymentMethod;
    paidAt: string;
    createdAt: string;
}

export interface Product {
    id: string;
    organizationId: string;
    name: string;
    price: number;
    isActive: boolean;
    createdAt: string;
}

// ── Modül Switch Sistemi (organizations.modules) ──────────────────────────────
export type ModuleKey = 'randevu' | 'personel' | 'hizmet' | 'kasa' | 'masa' | 'analiz' | 'sira';

export type QueueStatus = 'waiting' | 'called' | 'served' | 'left';
export interface QueueEntry {
    id: string;
    organizationId: string;
    customerName: string;
    customerPhone?: string;
    service?: string;
    staffId?: string;
    status: QueueStatus;
    joinedAt: string;
    calledAt?: string;
    notes?: string;
}
export type Modules = Record<ModuleKey, boolean>;

// ── Restoran Masa Modülü (randevu sisteminden ayrı) ───────────────────────────
export interface Table {
    id: string;
    organizationId: string;
    name: string;
    capacity: number;
    isActive: boolean;
    createdAt: string;
}

export type TableReservationStatus = 'reserved' | 'seated' | 'completed' | 'cancelled';

export interface TableReservation {
    id: string;
    organizationId: string;
    tableId: string;
    customerName: string;
    customerPhone?: string;
    partySize: number;
    date: string;        // YYYY-MM-DD
    startTime: string;   // HH:MM
    endTime?: string;    // HH:MM (tahmini, opsiyonel)
    status: TableReservationStatus;
    notes?: string;
    createdAt: string;
}

export type CalendarView = 'month' | 'week' | 'day';

export interface TimeSlot {
    time: string;
    available: boolean;
    reservation?: Reservation;
}
