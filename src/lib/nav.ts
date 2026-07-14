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
    sectorOnly?: string;           // yalnız bu sektörde görünür (örn. 'dis' → Diş Şeması)
}

// Sıralama: Masalar/Menü Dashboard'dan hemen sonra (restoran modunda öne);
// masa kapalıyken filtrelenir → randevu işletmesinde sıra bugünküyle aynı.
export const NAV_ITEMS: NavItem[] = [
    { id: '/', label: 'Dashboard', barPrio: 0 },
    { id: '/masa', label: 'Masalar', module: 'masa', barPrio: 4 },
    { id: '/menu', label: 'Menü', module: 'masa' },
    { id: '/calendar', label: 'Takvim', labelKey: 'calendar', module: 'randevu', hideInRestaurant: true, barPrio: 3 },
    { id: '/reservations', label: 'Rezervasyonlar', labelKey: 'reservations', module: 'randevu', hideInRestaurant: true },
    { id: '/queue', label: 'Sıra', module: 'sira' },
    { id: '/customers', label: 'Müşteriler', labelKey: 'customers', shortLabelKey: 'customer', barPrio: 2 },
    { id: '/dental-chart', label: 'Diş Şeması', sectorOnly: 'dis' },
    { id: '/kasa', label: 'Kasa', module: 'kasa', barPrio: 1 },
    { id: '/staff', label: 'Personel', labelKey: 'staff', module: 'personel' },
    { id: '/analytics', label: 'Analiz', module: 'analiz', barPrio: 5, managerOnlyInBar: true },
    { id: '/settings?tab=booking', label: 'Booking Sayfam', module: 'randevu', hideInRestaurant: true },
];

// Alt bar doğal görsel sırası (öncelikten bağımsız)
export const BAR_ORDER = ['/', '/calendar', '/masa', '/customers', '/kasa', '/analytics'];
