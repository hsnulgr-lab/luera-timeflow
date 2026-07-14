import type { Modules } from '@/types';

// ── Sektör Profili — tek kaynak ───────────────────────────────────────────────
// "Sektöre bürünme"nin omurgası: modül seti, terminoloji, dashboard dizilimi,
// özel alan şablonları ve kaynak tipleri buradan okunur. Yeni sektör eklemek =
// buraya bir kayıt eklemek; kod değişikliği gerektirmez.

// Terminoloji anahtarları — UI'daki sektöre göre değişen sözcükler.
// Tam i18n değil: Türkçe eşanlam haritası. Eksik anahtar DEFAULT_LABELS'a düşer.
export type LabelKey =
    | 'customer' | 'customers'          // Müşteri / Hasta / Müvekkil / Üye
    | 'reservation' | 'reservations'    // Randevu / Seans / Görüşme / Prova
    | 'newReservation'                  // FAB & buton etiketi
    | 'service' | 'services'            // Hizmet / Tedavi / Ders
    | 'staff'                           // Personel / Antrenör / Avukat
    | 'calendar';                       // Takvim

export const DEFAULT_LABELS: Record<LabelKey, string> = {
    customer: 'Müşteri', customers: 'Müşteriler',
    reservation: 'Randevu', reservations: 'Rezervasyonlar',
    newReservation: 'Yeni randevu',
    service: 'Hizmet', services: 'Hizmetler',
    staff: 'Personel',
    calendar: 'Takvim',
};

// Özel alan tanımı (Faz 3'te customers/reservations.custom_fields'a yazılır)
export interface FieldDef {
    entity: 'customer' | 'reservation';
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
    options?: string[];
    required?: boolean;
}

// Dashboard widget anahtarları (Faz 2'de registry ile eşleşir)
export type WidgetKey = string;

export interface SectorProfile {
    label: string;                              // Ayarlar dropdown etiketi
    modules: Modules;                           // varsayılan modül seti
    labels: Partial<Record<LabelKey, string>>;  // terminoloji farkları
    dashboardKpis: WidgetKey[];                 // sektör dashboard dizilimi (Faz 2)
    customFieldTemplates: FieldDef[];           // varsayılan özel alanlar (Faz 3)
    resourceTypes: string[];                    // koltuk/oda/kabin… (Faz 4; boş = kaynak UI gizli)
}

// Randevu-yüzü ortak modül seti
const RANDEVU: Modules = { randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: false };

// Randevu-yüzü ortak dashboard dizilimi (Faz 2'de RandevuDashboard'un ayrıştırılmış hali)
const RANDEVU_KPIS: WidgetKey[] = ['randevuFace'];
const MASA_KPIS: WidgetKey[] = ['masaFace'];

export const SECTOR_PROFILES: Record<string, SectorProfile> = {
    genel: {
        label: 'Genel',
        modules: RANDEVU,
        labels: {}, dashboardKpis: RANDEVU_KPIS, customFieldTemplates: [], resourceTypes: [],
    },
    guzellik: {
        label: 'Güzellik / Salon',
        modules: RANDEVU,
        labels: { reservation: 'Seans', newReservation: 'Yeni seans' },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'cilt_tipi', label: 'Cilt tipi', type: 'select', options: ['Kuru', 'Yağlı', 'Karma', 'Hassas'] },
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
        ],
        resourceTypes: [],
    },
    kuafor: {
        label: 'Kuaför',
        modules: { ...RANDEVU, sira: true },
        labels: {}, dashboardKpis: RANDEVU_KPIS, customFieldTemplates: [], resourceTypes: ['Koltuk'],
    },
    berber: {
        label: 'Berber',
        modules: { ...RANDEVU, sira: true },
        labels: {}, dashboardKpis: RANDEVU_KPIS, customFieldTemplates: [], resourceTypes: ['Koltuk'],
    },
    estetik: {
        label: 'Estetik Kliniği',
        modules: RANDEVU,
        labels: { customer: 'Danışan', customers: 'Danışanlar', reservation: 'Seans', newReservation: 'Yeni seans' },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
            { entity: 'customer', key: 'kronik', label: 'Kronik rahatsızlık', type: 'text' },
        ],
        resourceTypes: ['Oda'],
    },
    dis: {
        label: 'Diş Hekimi',
        modules: RANDEVU,
        labels: { customer: 'Hasta', customers: 'Hastalar', service: 'Tedavi', services: 'Tedaviler', staff: 'Hekim' },
        dashboardKpis: ['disFace'],
        customFieldTemplates: [
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
            { entity: 'customer', key: 'ilaclar', label: 'Kullandığı ilaçlar', type: 'text' },
            { entity: 'reservation', key: 'tedavi_notu', label: 'Tedavi notu', type: 'text' },
        ],
        resourceTypes: ['Ünite'],
    },
    saglik: {
        label: 'Sağlık / Klinik',
        modules: RANDEVU,
        labels: { customer: 'Hasta', customers: 'Hastalar', reservation: 'Muayene', newReservation: 'Yeni muayene' },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
        ],
        resourceTypes: ['Oda'],
    },
    fizyoterapi: {
        label: 'Fizyoterapi',
        modules: RANDEVU,
        labels: { customer: 'Hasta', customers: 'Hastalar', reservation: 'Seans', newReservation: 'Yeni seans' },
        dashboardKpis: RANDEVU_KPIS, customFieldTemplates: [], resourceTypes: ['Oda'],
    },
    tattoo: {
        label: 'Tattoo / Piercing Stüdyosu',
        modules: RANDEVU,
        labels: { reservation: 'Seans', newReservation: 'Yeni seans', staff: 'Artist' },
        dashboardKpis: ['dovmeFace'],
        customFieldTemplates: [
            { entity: 'reservation', key: 'bolge', label: 'Vücut bölgesi', type: 'text' },
            { entity: 'reservation', key: 'tarz', label: 'Tasarım tarzı', type: 'text' },
            // Onay öncesi talep akışı (talep_alindi/tasarim_bekliyor/onay_bekliyor) —
            // reservation.status'a paralel, dashboard'daki durum rozetini besler.
            { entity: 'reservation', key: 'asama', label: 'Talep aşaması', type: 'select', options: ['Talep Alındı', 'Tasarım Bekliyor', 'Onay Bekliyor', 'Onaylandı'] },
            { entity: 'reservation', key: 'kapora_durumu', label: 'Kapora durumu', type: 'select', options: ['Alınmadı', 'Kısmi Alındı', 'Tam Alındı'] },
            { entity: 'reservation', key: 'kapora_tutari', label: 'Kapora tutarı (₺)', type: 'number' },
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
        ],
        resourceTypes: ['Kabin'],
    },
    avukat: {
        label: 'Avukatlık Bürosu',
        modules: RANDEVU,
        labels: { customer: 'Müvekkil', customers: 'Müvekkiller', reservation: 'Görüşme', newReservation: 'Yeni görüşme', service: 'Danışmanlık', services: 'Danışmanlıklar', staff: 'Avukat' },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'dosya_no', label: 'Dosya numarası', type: 'text' },
            { entity: 'customer', key: 'mahkeme', label: 'Mahkeme', type: 'text' },
            { entity: 'customer', key: 'dava_turu', label: 'Dava türü', type: 'text' },
        ],
        resourceTypes: ['Toplantı odası'],
    },
    danismanlik: {
        label: 'Danışmanlık / Koçluk',
        modules: RANDEVU,
        labels: { customer: 'Danışan', customers: 'Danışanlar', reservation: 'Görüşme', newReservation: 'Yeni görüşme' },
        dashboardKpis: RANDEVU_KPIS, customFieldTemplates: [], resourceTypes: [],
    },
    gym: {
        label: 'Gym / PT',
        modules: RANDEVU,
        labels: { customer: 'Üye', customers: 'Üyeler', reservation: 'Ders', reservations: 'Dersler', newReservation: 'Yeni ders', service: 'Ders', services: 'Dersler', staff: 'Antrenör' },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'hedef', label: 'Hedef', type: 'text' },
            { entity: 'customer', key: 'saglik_notu', label: 'Sağlık notu', type: 'text' },
        ],
        resourceTypes: ['Salon alanı'],
    },
    gelinlikci: {
        label: 'Gelinlikçi',
        modules: RANDEVU,
        labels: { reservation: 'Prova', reservations: 'Provalar', newReservation: 'Yeni prova', service: 'Model', services: 'Modeller' },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'beden', label: 'Beden', type: 'text' },
            { entity: 'customer', key: 'olculer', label: 'Ölçüler', type: 'text' },
            { entity: 'customer', key: 'dugun_tarihi', label: 'Düğün tarihi', type: 'date' },
            { entity: 'reservation', key: 'model_kodu', label: 'Model kodu', type: 'text' },
        ],
        resourceTypes: ['Prova odası'],
    },
    restoran: {
        label: 'Restoran / Kafe',
        // personel açık — garson ataması ve garsona push personel listesinden beslenir
        modules: { randevu: false, personel: true, hizmet: false, kasa: true, masa: true, analiz: true, sira: false },
        labels: {}, dashboardKpis: MASA_KPIS, customFieldTemplates: [], resourceTypes: [],
    },
};

export function profileForSector(sector?: string | null): SectorProfile {
    return SECTOR_PROFILES[sector || 'genel'] ?? SECTOR_PROFILES.genel;
}

export function labelsForSector(sector?: string | null): Record<LabelKey, string> {
    return { ...DEFAULT_LABELS, ...profileForSector(sector).labels };
}

// Sektörün ilgili entity için özel alan tanımları (org override'ı Faz 3+ Ayarlar'da)
export function fieldDefsForSector(sector: string | null | undefined, entity: FieldDef['entity']): FieldDef[] {
    return profileForSector(sector).customFieldTemplates.filter((f) => f.entity === entity);
}
