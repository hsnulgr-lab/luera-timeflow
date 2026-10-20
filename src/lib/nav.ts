import type { ModuleKey } from '@/types';
import type { LabelKey } from '@/lib/sectorProfiles';

// ── Dinamik navigasyon — tek kaynak ──────────────────────────────────────────
// Sidebar (masaüstü) ve BottomTabBar (mobil) bu listeden üretilir. label sabit
// metin, labelKey ise sektör terminolojisinden (useLabels) çözülür; ikisi de
// varsa labelKey kazanır. İkonlar platforma özgü olduğundan burada tutulmaz —
// her yüzey kendi ikon haritasını id ile eşler.
export interface NavItem {
    id: string;                    // route path
    label: string;                 // varsayılan etiket
    labelKey?: LabelKey;           // sektör terminolojisi anahtarı (varsa kazanır)
    shortLabelKey?: LabelKey;      // alt bar için kısa/tekil form (örn. Müşteri)
    module?: ModuleKey;            // yoksa core — her zaman görünür
    hideInRestaurant?: boolean;    // restoran modunda gizlenen randevu-yüzü öğeleri
    barPrio?: number;              // alt barda eleme önceliği (küçük = önemli); yoksa alt barda yer almaz
    managerOnlyInBar?: boolean;    // alt barda yalnız Yönetici modunda
    sectorOnly?: string | string[];// yalnız bu sektör(ler)de görünür (örn. 'dis' → Diş Şeması)
    hideInSector?: string;         // bu sektörde gizlenir; öğeye Ayarlar'dan erişilir (örn. 'dis' → Online randevu)
    group: NavGroup;               // sol menüde hangi başlığın altında durur
}

// Sol menü grupları (Kenar çubuğu A · Gruplu, 2026-10-20). Başlık yalnız
// içinde görünen öğe varsa çizilir; "Müşteri" başlığı sektörün kelimesini
// alır (diş → Hasta). Ayarlar listede değildir, menünün dibinde sabit durur.
export type NavGroup = 'gunluk' | 'musteri' | 'isletme';
export const NAV_GROUPS: { key: NavGroup; label: string; labelKey?: LabelKey }[] = [
    { key: 'gunluk', label: 'Günlük' },
    { key: 'musteri', label: 'Müşteri', labelKey: 'customer' },
    { key: 'isletme', label: 'İşletme' },
];

// Sıralama: Masalar/Menü Panel'den hemen sonra (restoran modunda öne);
// masa kapalıyken filtrelenir → randevu işletmesinde sıra bugünküyle aynı.
// Adlar (2026-10-20, kullanıcı kararı): "Dashboard" → "Panel", "Booking Sayfam" →
// "Online randevu" — Ayarlar'daki bölümle aynı ad.
export const NAV_ITEMS: NavItem[] = [
    { id: '/', label: 'Panel', barPrio: 0, group: 'gunluk' },
    { id: '/masa', label: 'Masalar', module: 'masa', barPrio: 4, group: 'gunluk' },
    { id: '/menu', label: 'Menü', module: 'masa', group: 'gunluk' },
    { id: '/calendar', label: 'Takvim', labelKey: 'calendar', module: 'randevu', hideInRestaurant: true, barPrio: 3, group: 'gunluk' },
    { id: '/reservations', label: 'Rezervasyonlar', labelKey: 'reservations', module: 'randevu', hideInRestaurant: true, group: 'gunluk' },
    { id: '/queue', label: 'Sıra', module: 'sira', group: 'gunluk' },
    { id: '/customers', label: 'Müşteriler', labelKey: 'customers', shortLabelKey: 'customer', barPrio: 2, group: 'musteri' },
    { id: '/dental-chart', label: 'Diş Şeması', sectorOnly: 'dis', group: 'musteri' },
    { id: '/packages', label: 'Paketler', sectorOnly: ['guzellik', 'kuafor'], group: 'musteri' },
    { id: '/kasa', label: 'Kasa', module: 'kasa', barPrio: 1, group: 'isletme' },
    { id: '/stock', label: 'Stoklar', module: 'kasa', group: 'isletme' },
    { id: '/staff', label: 'Personel', labelKey: 'staffPlural', shortLabelKey: 'staff', module: 'personel', group: 'isletme' },
    { id: '/analytics', label: 'Analiz', module: 'analiz', barPrio: 5, managerOnlyInBar: true, group: 'isletme' },
    { id: '/settings/online-randevu', label: 'Online randevu', module: 'randevu', hideInRestaurant: true, hideInSector: 'dis', group: 'isletme' },
];

// Alt bar doğal görsel sırası (öncelikten bağımsız)
export const BAR_ORDER = ['/', '/calendar', '/masa', '/customers', '/kasa', '/analytics'];
