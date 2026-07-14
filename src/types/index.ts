import type { StaffRole } from '@/lib/staffPermissions';

export type { StaffRole } from '@/lib/staffPermissions';

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
    customerArrivedAt?: string;   // Resepsiyon "Müşteri Geldi" dedi — personele push gider, hizmet başlamaz
    arrivedAt?: string;   // "Başladı" zaman damgası (confirmed → hizmette); süre başlangıcı
    serviceEndedAt?: string;   // "Bitti" zaman damgası — süre durdu, adisyon kontrol/kasa aşaması
    adisyonItems?: AdisyonItem[];   // Hizmet sırasında canlı eklenen kalemler (boya/ürün/ekstra)
    groupId?: string;   // Çoklu hizmet booking'i — aynı ziyaretin satırları bu id'yi paylaşır
    customFields?: Record<string, string | number | boolean>;   // sektöre özel alanlar — 050
    resourceId?: string;   // fiziksel kaynak bağı (oda/koltuk/ünite…) — 051
    resourceName?: string; // görüntüleme için (join'den)
    endDate?: string;      // çok günlük rezervasyon bitişi (YYYY-MM-DD; yoksa tek gün) — 052
}

// ── Genel Kaynak (051) — koltuk/oda/ünite/kabin; masalardan (tables) ayrı ────
export interface Resource {
    id: string;
    organizationId: string;
    type: string;        // sektör profili resourceTypes'tan (Oda/Koltuk/Ünite…)
    name: string;
    capacity: number;    // >1 = aynı slota çok randevu (grup dersi)
    isActive: boolean;
    sort: number;
    createdAt: string;
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
    nextAppointment?: string;
    nextAppointmentTime?: string;
    notes?: string;
    loyaltyStamps?: number;   // Dijital müşteri kartı — biriken damga
    customFields?: Record<string, string | number | boolean>;   // sektöre özel alanlar — 050
    recallDate?: string;      // bir sonraki kontrol çağrısı (diş sektörü) — 056
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
    role: StaffRole;
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
    treatmentPlanId?: string;
    installmentId?: string;
    createdBy?: string;
    type: PaymentType;
    description?: string;
    amount: number;
    method: PaymentMethod;
    paidAt: string;
    createdAt: string;
}

// Tedavi planı — çok seanslı tedavilerin (örn. kanal tedavisi) toplam ücreti
// tek planda tutulur; taksitler mevcut Payment kayıtlarına (treatmentPlanId ile)
// bağlanır, ayrı bir finansal defter açılmaz.
export type TreatmentPlanStatus = 'active' | 'completed' | 'cancelled';
export interface TreatmentPlan {
    id: string;
    customerId: string;
    title: string;
    totalAmount: number;
    status: TreatmentPlanStatus;
    staffId?: string;
    reservationId?: string;
    createdBy?: string;
    notes?: string;
    createdAt: string;
}

export type InstallmentCadence = 'weekly' | 'monthly';
export interface TreatmentInstallment {
    id: string;
    organizationId: string;
    customerId: string;
    treatmentPlanId: string;
    sequenceNo: number;
    dueDate: string;
    amount: number;
    createdAt: string;
}

export interface Product {
    id: string;
    organizationId: string;
    name: string;
    price: number;
    category?: string;   // menü gruplaması (Yemek/İçecek/Tatlı…) — 043
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
    partySize: number;
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
    zone: string;
    isActive: boolean;
    createdAt: string;
}

export type TableReservationStatus = 'reserved' | 'seated' | 'completed' | 'cancelled';

// Masa adisyon kalemi — randevu AdisyonItem'ından AYRI (adet dahil). 043
export interface MasaAdisyonItem {
    id: string;
    name: string;
    price: number;   // birim fiyat
    qty: number;
    kind: 'product' | 'extra';   // menü ürünü mü, serbest ekstra mı
}

export interface TableReservation {
    id: string;
    organizationId: string;
    tableId: string;
    customerName: string;
    customerPhone?: string;
    customerId?: string;  // müşteri kartı bağı (LTV/geçmiş) — 042
    staffId?: string;     // garson ataması (opsiyonel) — 042
    adisyonItems?: MasaAdisyonItem[];  // masa adisyonu (menü kalemleri) — 043
    seatedAt?: string;   // masaya oturuldu (status→seated) zaman damgası — 044
    partySize: number;
    date: string;        // YYYY-MM-DD
    startTime: string;   // HH:MM
    endTime?: string;    // HH:MM (tahmini, opsiyonel)
    status: TableReservationStatus;
    isPaid?: boolean;    // Tamamlandı ama ödeme henüz alınmadı mı (garson "Kasaya Gönder") — 049
    notes?: string;
    createdAt: string;
}

export type CalendarView = 'month' | 'week' | 'day';

export interface TimeSlot {
    time: string;
    available: boolean;
    reservation?: Reservation;
}

// Diş şeması — FDI numaralandırma (11-48). Append-only log: bir dişin güncel
// durumu, o diş için en son eklenen kayıttır (geçmiş korunur).
export type DentalStatus = 'saglam' | 'curuk' | 'dolgu' | 'kanal' | 'kron' | 'implant' | 'cekildi';
// Diş yüzeyleri (MODBL): Mesial, Oklüzal, Distal, Bukkal, Lingual — 056
export type ToothSurface = 'M' | 'O' | 'D' | 'B' | 'L';
export type DentalRecordType = 'existing' | 'planned';
export interface DentalRecord {
    id: string;
    customerId: string;
    toothNumber: number;
    status: DentalStatus;
    surfaces: ToothSurface[];        // boş = tüm diş (kron/implant/çekildi vb.)
    recordType: DentalRecordType;    // planned = tedavi planındaki işlem — 056
    treatmentPlanId?: string;
    note?: string;
    staffId?: string;
    createdAt: string;
}
