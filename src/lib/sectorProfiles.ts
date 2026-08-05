import type { Modules } from '@/types';
// Yalnızca tip — çalışma zamanında silinir, staffPermissions ↔ sectorProfiles
// arasında döngüsel import oluşmaz (staffPermissions bu dosyadan fonksiyon alır).
import type { StaffRole } from '@/lib/staffPermissions';

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
    | 'staff'                           // Personel / Antrenör / Avukat (tekil)
    | 'staffPlural'                     // Sidebar/liste başlıkları için çoğul (Hekimler)
    | 'calendar';                       // Takvim

export const DEFAULT_LABELS: Record<LabelKey, string> = {
    customer: 'Müşteri', customers: 'Müşteriler',
    reservation: 'Randevu', reservations: 'Rezervasyonlar',
    newReservation: 'Yeni randevu',
    service: 'Hizmet', services: 'Hizmetler',
    staff: 'Personel',
    staffPlural: 'Personel',
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

// ── Sektörel iletişim profili (WhatsApp) ─────────────────────────────────────
// "Sektöre bürünme"nin mesaj tarafı. AI (Gemini) bu bloktan karakter alır;
// AI kapalıysa/başarısızsa aynı bloktaki şablonlar gönderilir. Org bazında
// override edilebilir: settings.comms JSONB'ye yazılır, edge function oradan
// okur (bkz. supabase/066_sector_comms.sql).
export interface SectorRecall {
    /** Kavramın adı — mesajda ve panelde geçer: "kontrol", "dip boyası"… */
    concept: string;
    /** Son ziyaretten kaç gün sonra hatırlatılır (varsayılan). */
    afterDays: number;
}

export interface SectorComms {
    /** AI'ya verilen karakter — sektörün tonu ve rolü. */
    persona: string;
    /** Muhatabın nasıl anıldığı: "hastamız", "müşterimiz", "danışanımız". */
    audience: string;
    /** Mesajlarda hizmetin nasıl anıldığı: "tedavi", "işlem", "seans". */
    serviceWord: string;
    /** Aynı sözcüğün iyelik hâli: "tedavinizi", "işleminizi", "seansınızı".
     *  Elle yazılır — Türkçe ek uyumu kural uydurmaya gelmez ("işlemnizi"). */
    servicePhrase: string;
    /** Sektöre uygun 1 emoji — şablonlarda kullanılır, AI'ya örnek verilir. */
    emoji: string;
    /** Periyodik dönüş hatırlatması; yoksa o sektörde recall gönderilmez. */
    recall?: SectorRecall;
    /** AI'ya ek kısıt — tıbbi/hukuki tavsiye yasağı gibi. */
    guardrail?: string;
}

// ── Uygunluk (kontrendikasyon) ───────────────────────────────────────────────
// Bir müşteri özelliği ile hizmet etiketinin çakışması. Kural sektörün kendi
// bilgisidir: güzellikte hamilelik lazeri kapatır, kuaförde böyle bir kural yok.
//
// Kural METİN EŞLEŞMESİYLE değil, etiketle çalışır. Daha önce iki ayrı dosyada
// iki ayrı Türkçe regex vardı ("lazer|incelme|zayıflama|g5" ve "lazer|incelme");
// aynı paket bir ekranda kapanıp diğerinde açık kalıyordu. Etiketler hizmet
// tanımında (Service.tags) yaşar, tek yerden okunur.
export interface RiskFlag {
    /** Müşteri özel alanının anahtarı — customFields[key] doluysa bayrak aktif. */
    key: string;
    /** Kullanıcıya gösterilen sebep: "Hamilelik". */
    label: string;
    /** Bu bayrak aktifken kapatılan hizmet etiketleri. */
    blocks: string[];
    /** Uyarı metninin devamı — neden kapandığını tek cümlede söyler. */
    note?: string;
    /**
     * Etiketi olmayan (eski) hizmetler için ad eşleşmesi. Yalnız geriye dönük
     * uyum içindir; yeni hizmetler etiketle çalışır. Tek kaynak burasıdır.
     *
     * DESEN ASCII YAZILIR ("zayiflama", "incelme"): eşleşmeden önce ad Türkçe
     * duyarlı biçimde katlanır (bkz. serviceEligibility.foldTr). JS'te /i
     * bayrağı "İ" harfini ASCII "i"ye çevirmez — "Bölgesel İncelme" gibi
     * tamamen olağan bir hizmet adı aksi hâlde korumadan kaçar.
     */
    legacyNamePattern?: RegExp;
}

// ── Personel rolleri ─────────────────────────────────────────────────────────
// Rolün DEĞERİ (doctor/assistant/cashier/staff) sektörden bağımsızdır: yetki
// setini o belirler ve DB'de saklanan da odur. Sektöre göre değişen yalnızca
// nasıl anıldığı — diş kliniğinde "Hekim", berberde "Berber", restoranda
// "Şef garson". Boş bırakılan alanlar sektörün terminolojisinden türetilir
// (bkz. staffPermissions.staffRoleOptionsForSector).
export type SectorStaffRoles = Partial<Record<StaffRole, { label?: string; description?: string }>>;

export interface SectorProfile {
    label: string;                              // Ayarlar dropdown etiketi
    modules: Modules;                           // varsayılan modül seti
    labels: Partial<Record<LabelKey, string>>;  // terminoloji farkları
    staffRoles?: SectorStaffRoles;              // rol adlandırması (yetki değil)
    dashboardKpis: WidgetKey[];                 // sektör dashboard dizilimi (Faz 2)
    customFieldTemplates: FieldDef[];           // varsayılan özel alanlar (Faz 3)
    resourceTypes: string[];                    // koltuk/oda/kabin… (Faz 4; boş = kaynak UI gizli)
    comms: SectorComms;                         // WhatsApp dili (bkz. SectorComms)
    riskFlags?: RiskFlag[];                     // kontrendikasyon kuralları (bkz. RiskFlag)
}

// Randevu-yüzü ortak modül seti
const RANDEVU: Modules = { randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: false };

// Tezgâh üstü tahsilat yapmayan sektörler için: ücret dosya/fatura üzerinden
// yürür, gün sonu kasası tutulmaz. Kasa yüzeyleri (sidebar, adisyon rozeti,
// "Kasaya gönder" aksiyonları) modül kapalıyken kendiliğinden gizlenir.
// NOT: 'cashier' personel rolü (staffPermissions) kapsam dışı — hukuk bürosunda
// "Muhasebe" rolü tahsilat dışı yetkiler (payments:view) için hâlâ anlamlı.
const RANDEVU_KASASIZ: Modules = { ...RANDEVU, kasa: false };

// Randevu-yüzü ortak dashboard dizilimi (Faz 2'de RandevuDashboard'un ayrıştırılmış hali)
const RANDEVU_KPIS: WidgetKey[] = ['randevuFace'];
const MASA_KPIS: WidgetKey[] = ['masaFace'];

export const SECTOR_PROFILES: Record<string, SectorProfile> = {
    genel: {
        label: 'Genel',
        modules: RANDEVU,
        labels: {},
        staffRoles: { doctor: { label: 'Uzman' } },
        dashboardKpis: RANDEVU_KPIS, customFieldTemplates: [], resourceTypes: [],
        comms: { persona: 'Randevulu hizmet veren bir işletmesin; samimi, nazik ve net ol.', audience: 'müşterimiz', serviceWord: 'randevu', servicePhrase: 'randevunuzu', emoji: '🗓️' },
    },
    guzellik: {
        label: 'Güzellik / Salon',
        modules: RANDEVU,
        // Çoğul de yazılır: yalnız tekil override edilince sidebar "Rezervasyonlar"
        // derken dashboard "seans" diyordu. `calendar` bilerek varsayılan ("Takvim")
        // bırakıldı — yan yana "Seans Takvimi" + "Seanslar" gereksiz tekrar olurdu.
        labels: {
            reservation: 'Seans', reservations: 'Seanslar', newReservation: 'Yeni seans',
            staff: 'Uzman', staffPlural: 'Uzmanlar',
        },
        staffRoles: { doctor: { label: 'Uzman', description: 'Bakım uygular, müşteri kaydını ve tahsilatı yönetir' } },
        dashboardKpis: ['guzellikFace'],
        customFieldTemplates: [
            { entity: 'customer', key: 'cilt_tipi', label: 'Cilt tipi', type: 'select', options: ['Kuru', 'Yağlı', 'Karma', 'Hassas'] },
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
            // Kontrendikasyon: lazer/bölgesel incelme gibi hizmetler kapatılır (UI uyarır)
            { entity: 'customer', key: 'hamilelik', label: 'Hamilelik', type: 'checkbox' },
        ],
        resourceTypes: ['Kabin'],
        comms: { persona: 'Bir güzellik salonu / bakım merkezisin; sıcak, samimi ve şımartan bir ton kullan.', audience: 'müşterimiz', serviceWord: 'bakım', servicePhrase: 'bakımınızı', emoji: '✨', recall: { concept: 'bakım yenileme', afterDays: 30 } },
        riskFlags: [{
            key: 'hamilelik',
            label: 'Hamilelik',
            blocks: ['lazer', 'medikal'],
            note: 'gebelikte uygulanmaz',
            // Etiketsiz eski hizmetler için — yeni kayıtlar Service.tags kullanır.
            // ASCII yazılır; ad katlanarak karşılaştırılır (bkz. RiskFlag).
            legacyNamePattern: /lazer|incelme|zayiflama|g5|radyofrekans/,
        }],
    },
    kuafor: {
        label: 'Kuaför',
        modules: { ...RANDEVU, sira: true },
        labels: {},
        staffRoles: {
            doctor: { label: 'Kuaför', description: 'Hizmet, renk formülü ve müşteri ilişkisini yönetir' },
            assistant: { label: 'Çırak', description: 'Hazırlık, yıkama ve salon akışını destekler' },
        },
        dashboardKpis: ['kuaforFace'],
        customFieldTemplates: [
            { entity: 'customer', key: 'sac_tipi', label: 'Saç tipi', type: 'select', options: ['İnce telli', 'Normal', 'Kalın telli', 'Karma'] },
            { entity: 'customer', key: 'sac_dokusu', label: 'Saç dokusu', type: 'select', options: ['Düz', 'Dalgalı', 'Kıvırcık', 'Çok kıvırcık'] },
            { entity: 'customer', key: 'alerji', label: 'Kimyasal / ürün hassasiyeti', type: 'text' },
            { entity: 'customer', key: 'tercih_notu', label: 'Saç ve stil tercihi', type: 'text' },
            { entity: 'customer', key: 'kf_formula', label: 'Son renk formülü', type: 'text' },
            { entity: 'reservation', key: 'kf_formula', label: 'Renk formülü', type: 'text' },
        ],
        resourceTypes: ['Koltuk', 'Yıkama'],
        comms: { persona: 'Bir kuaförsün; samimi, enerjik ve sohbet eder gibi bir ton kullan.', audience: 'müşterimiz', serviceWord: 'işlem', servicePhrase: 'işleminizi', emoji: '💇', recall: { concept: 'saç bakımı / dip boyası zamanı', afterDays: 28 } },
    },
    berber: {
        label: 'Berber',
        modules: { ...RANDEVU, sira: true },
        labels: {},
        staffRoles: { doctor: { label: 'Berber' }, assistant: { label: 'Çırak' } },
        dashboardKpis: ['berberFace'], customFieldTemplates: [], resourceTypes: ['Koltuk'],
        comms: { persona: 'Bir berbersin; sıcak, kısa ve delikanlı ağzı sayılabilecek rahat bir ton kullan (abartma).', audience: 'müşterimiz', serviceWord: 'kesim', servicePhrase: 'kesiminizi', emoji: '💈', recall: { concept: 'saç kesimi zamanı', afterDays: 21 } },
    },
    estetik: {
        label: 'Estetik Kliniği',
        modules: RANDEVU,
        labels: { customer: 'Danışan', customers: 'Danışanlar', reservation: 'Seans', newReservation: 'Yeni seans' },
        staffRoles: { doctor: { label: 'Uzman', description: 'Seans uygular, danışan dosyasını ve tahsilatı yönetir' } },
        dashboardKpis: ['estetikFace'],
        customFieldTemplates: [
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
            { entity: 'customer', key: 'kronik', label: 'Kronik rahatsızlık', type: 'text' },
        ],
        resourceTypes: ['Oda'],
        comms: { persona: 'Bir estetik kliniğisin; güven veren, zarif ve profesyonel bir ton kullan.', audience: 'danışanımız', serviceWord: 'seans', servicePhrase: 'seansınızı', emoji: '✨', recall: { concept: 'kontrol seansı', afterDays: 90 }, guardrail: 'Tıbbi tavsiye verme, sonuç vaat etme.' },
    },
    dis: {
        label: 'Diş Hekimi',
        modules: RANDEVU,
        labels: { customer: 'Hasta', customers: 'Hastalar', reservations: 'Randevular', service: 'Tedavi', services: 'Tedaviler', staff: 'Hekim', staffPlural: 'Hekimler' },
        staffRoles: {
            doctor: { label: 'Hekim', description: 'Muayene, diş şeması ve tedavi planı' },
            assistant: { label: 'Asistan', description: 'Randevu ve hasta akışı desteği' },
        },
        dashboardKpis: ['disFace'],
        customFieldTemplates: [
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
            { entity: 'customer', key: 'ilaclar', label: 'Kullandığı ilaçlar', type: 'text' },
            { entity: 'customer', key: 'kronik', label: 'Kronik rahatsızlık', type: 'text' },
            { entity: 'reservation', key: 'tedavi_notu', label: 'Tedavi notu', type: 'text' },
        ],
        resourceTypes: ['Ünite'],
        comms: { persona: 'Bir diş kliniği / ağız ve diş sağlığı merkezisin; güven veren, sıcak ve profesyonel bir ton kullan.', audience: 'hastamız', serviceWord: 'tedavi', servicePhrase: 'tedavinizi', emoji: '🦷', recall: { concept: 'diş kontrolü', afterDays: 180 }, guardrail: 'TIBBİ TAVSİYE VERME, teşhis koyma.' },
    },
    saglik: {
        label: 'Sağlık / Klinik',
        modules: RANDEVU,
        // Genel klinikte her randevu "muayene" değildir: takvim kabuğu kapsayıcı
        // kalır (Randevu), ziyaret türü randevunun İÇİNDE ayrı alanda tutulur.
        labels: {
            customer: 'Hasta', customers: 'Hastalar',
            reservation: 'Randevu', reservations: 'Randevular', newReservation: 'Yeni randevu',
            staff: 'Hekim', staffPlural: 'Hekimler',
        },
        staffRoles: {
            doctor: { label: 'Hekim', description: 'Muayene, hasta dosyası ve tedavi' },
            assistant: { label: 'Yardımcı personel' },
        },
        dashboardKpis: ['saglikFace'],
        customFieldTemplates: [
            { entity: 'customer', key: 'alerji', label: 'Alerji bilgisi', type: 'text' },
            // Ziyaret türü İDARİ bir sınıflandırmadır — ayrı bir rezervasyon
            // status'ü değildir, klinik uygunluk anlamına gelmez.
            { entity: 'reservation', key: 'ziyaret_turu', label: 'Ziyaret türü', type: 'select', options: ['İlk muayene', 'Kontrol', 'Sonuç görüşmesi', 'İşlem'] },
        ],
        resourceTypes: ['Oda'],
        comms: { persona: 'Bir sağlık kuruluşu / kliniksin; güven veren, ölçülü ve profesyonel bir ton kullan.', audience: 'hastamız', serviceWord: 'muayene', servicePhrase: 'muayenenizi', emoji: '🩺', recall: { concept: 'kontrol muayenesi', afterDays: 180 }, guardrail: 'TIBBİ TAVSİYE VERME, teşhis koyma.' },
    },
    fizyoterapi: {
        label: 'Fizyoterapi',
        modules: RANDEVU,
        labels: { customer: 'Hasta', customers: 'Hastalar', reservation: 'Seans', newReservation: 'Yeni seans' },
        staffRoles: { doctor: { label: 'Fizyoterapist', description: 'Seans uygular, hasta dosyasını ve tahsilatı yönetir' } },
        dashboardKpis: ['fizyoterapiFace'],
        // Fizyoterapi yüzünün okuduğu alanlar. Klinik plan (treatment_plans) ve
        // ticari paket hakkı (customer_packages) ayrı kaynaklardır; buraya
        // "kalan seans" gibi birleşik bir sayaç EKLENMEZ.
        customFieldTemplates: [
            { entity: 'customer', key: 'islevsel_hedef', label: 'İşlevsel hedef', type: 'text' },
            { entity: 'customer', key: 'klinik_uyari', label: 'Klinik uyarı (düşme riski vb.)', type: 'text' },
            { entity: 'customer', key: 'ev_programi', label: 'Ev programı', type: 'text' },
            { entity: 'customer', key: 'ev_programi_gun', label: 'Haftalık uygulanan gün (0-7)', type: 'number' },
            { entity: 'reservation', key: 'agri', label: 'Ağrı bildirimi (0-10)', type: 'number' },
            { entity: 'reservation', key: 'rom', label: 'Hareket açıklığı (°)', type: 'number' },
        ],
        resourceTypes: ['Terapi alanı', 'Cihaz'],
        comms: { persona: 'Bir fizyoterapi merkezisin; motive edici ama profesyonel bir ton kullan.', audience: 'danışanımız', serviceWord: 'seans', servicePhrase: 'seansınızı', emoji: '🤸', recall: { concept: 'kontrol seansı', afterDays: 60 }, guardrail: 'Tıbbi tavsiye verme, egzersiz reçetesi yazma.' },
    },
    tattoo: {
        label: 'Tattoo / Piercing Stüdyosu',
        modules: RANDEVU,
        labels: { reservation: 'Seans', newReservation: 'Yeni seans', staff: 'Artist' },
        staffRoles: { doctor: { label: 'Artist', description: 'Tasarım, seans uygulama ve kapora' } },
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
        comms: { persona: 'Bir dövme / piercing stüdyosusun; havalı, rahat ve sanatçı bir ton kullan.', audience: 'müşterimiz', serviceWord: 'seans', servicePhrase: 'seansınızı', emoji: '🖤', recall: { concept: 'dokunuş (touch-up) zamanı', afterDays: 45 } },
    },
    avukat: {
        label: 'Avukatlık Bürosu',
        modules: RANDEVU_KASASIZ,
        labels: { customer: 'Müvekkil', customers: 'Müvekkiller', reservation: 'Görüşme', newReservation: 'Yeni görüşme', service: 'Danışmanlık', services: 'Danışmanlıklar', staff: 'Avukat' },
        staffRoles: {
            doctor: { label: 'Avukat', description: 'Görüşme, müvekkil dosyası ve ücretlendirme' },
            assistant: { label: 'Katip', description: 'Görüşme ve müvekkil akışı desteği' },
            cashier: { label: 'Muhasebe' },
        },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'dosya_no', label: 'Dosya numarası', type: 'text' },
            { entity: 'customer', key: 'mahkeme', label: 'Mahkeme', type: 'text' },
            { entity: 'customer', key: 'dava_turu', label: 'Dava türü', type: 'text' },
        ],
        resourceTypes: ['Toplantı odası'],
        comms: { persona: 'Bir hukuk bürososun; resmi, saygılı ve net bir ton kullan. Asla senli benli konuşma.', audience: 'müvekkilimiz', serviceWord: 'görüşme', servicePhrase: 'görüşmenizi', emoji: '⚖️', guardrail: 'HUKUKİ TAVSİYE VERME, dava sonucu hakkında yorum yapma. Dosya içeriğine değinme.' },
    },
    danismanlik: {
        label: 'Danışmanlık / Koçluk',
        modules: RANDEVU,
        labels: { customer: 'Danışan', customers: 'Danışanlar', reservation: 'Görüşme', newReservation: 'Yeni görüşme' },
        staffRoles: { doctor: { label: 'Danışman', description: 'Görüşme yürütür, danışan dosyasını ve tahsilatı yönetir' } },
        dashboardKpis: RANDEVU_KPIS, customFieldTemplates: [], resourceTypes: [],
        comms: { persona: 'Bir danışmanlık / koçluk ofisisin; saygılı, net ve profesyonel ol.', audience: 'danışanımız', serviceWord: 'görüşme', servicePhrase: 'görüşmenizi', emoji: '📌' },
    },
    gym: {
        label: 'Gym / PT',
        modules: RANDEVU,
        labels: { customer: 'Üye', customers: 'Üyeler', reservation: 'Ders', reservations: 'Dersler', newReservation: 'Yeni ders', service: 'Ders', services: 'Dersler', staff: 'Antrenör' },
        staffRoles: { doctor: { label: 'Antrenör', description: 'Ders verir, üye dosyasını ve tahsilatı yönetir' } },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'hedef', label: 'Hedef', type: 'text' },
            { entity: 'customer', key: 'saglik_notu', label: 'Sağlık notu', type: 'text' },
        ],
        resourceTypes: ['Salon alanı'],
        comms: { persona: 'Bir spor salonusun; enerjik, motive edici ve teşvik eden bir ton kullan.', audience: 'üyemiz', serviceWord: 'antrenman', servicePhrase: 'antrenmanınızı', emoji: '💪', recall: { concept: 'üyelik yenileme', afterDays: 30 } },
    },
    gelinlikci: {
        label: 'Gelinlikçi',
        modules: RANDEVU,
        labels: { reservation: 'Prova', reservations: 'Provalar', newReservation: 'Yeni prova', service: 'Model', services: 'Modeller' },
        staffRoles: {
            doctor: { label: 'Satış danışmanı', description: 'Prova yürütür, müşteri dosyasını ve tahsilatı yönetir' },
            assistant: { label: 'Terzi', description: 'Prova ve ölçü akışı desteği' },
        },
        dashboardKpis: RANDEVU_KPIS,
        customFieldTemplates: [
            { entity: 'customer', key: 'beden', label: 'Beden', type: 'text' },
            { entity: 'customer', key: 'olculer', label: 'Ölçüler', type: 'text' },
            { entity: 'customer', key: 'dugun_tarihi', label: 'Düğün tarihi', type: 'date' },
            { entity: 'reservation', key: 'model_kodu', label: 'Model kodu', type: 'text' },
        ],
        resourceTypes: ['Prova odası'],
        comms: { persona: 'Bir gelinlik evisin; zarif, heyecanlı ve özel hissettiren bir ton kullan.', audience: 'müşterimiz', serviceWord: 'prova', servicePhrase: 'provanızı', emoji: '👰' },
    },
    restoran: {
        label: 'Restoran / Kafe',
        // personel açık — garson ataması ve garsona push personel listesinden beslenir
        modules: { randevu: false, personel: true, hizmet: false, kasa: true, masa: true, analiz: true, sira: false },
        labels: {},
        staffRoles: {
            doctor: { label: 'Şef garson', description: 'Masa açar, adisyonu ve tahsilatı yönetir' },
            assistant: { label: 'Garson', description: 'Masa ve sipariş akışı desteği' },
            staff: { label: 'Personel', description: 'Kendi masaları ve temel misafir bilgileri' },
        },
        dashboardKpis: MASA_KPIS, customFieldTemplates: [], resourceTypes: [],
        comms: { persona: 'Bir restoransın; sıcak, davetkâr ve iştah açan bir ton kullan.', audience: 'misafirimiz', serviceWord: 'rezervasyon', servicePhrase: 'rezervasyonunuzu', emoji: '🍽️' },
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

// Sektörün WhatsApp iletişim profili — edge function'a bu blok gönderilir.
export function commsForSector(sector?: string | null): SectorComms {
    return profileForSector(sector).comms;
}

/**
 * `treatment_plans` satırının türü. Tablo iki işi taşıyor: klinik tedavi planı
 * (diş/sağlık/fizyoterapi) ve ticari seans paketi (güzellik/kuaför/estetik…).
 * Ayrım sektörün kendi bilgisi olduğu için burada yaşar; DB tarafında aynı eşleme
 * trigger'da tekrarlanır (supabase/077_plan_kind.sql).
 *
 * `session_count > 1` ayraç DEĞİLDİR: 4 seanslık kanal tedavisi de çok seanslıdır.
 */
export type PlanKind = 'tedavi' | 'paket';

const CLINICAL_SECTORS = new Set(['dis', 'saglik', 'fizyoterapi']);

export function planKindForSector(sector?: string | null): PlanKind {
    return CLINICAL_SECTORS.has(sector || '') ? 'tedavi' : 'paket';
}
