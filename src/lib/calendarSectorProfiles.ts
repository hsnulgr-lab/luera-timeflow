// ── Sektörün masaüstü yüzleri — TEK KAYNAK ───────────────────────────────────
// Takvim, Rezervasyonlar ve Müşteriler sayfalarının hangi tasarımla açılacağı.
// Önceden App.tsx'te üç ayrı `if (sector === 'kuafor')` vardı; ikinci bir sektör
// yüzü eklemek üç dosyada üç `if` daha demekti.
//
// Tabloda YALNIZ farklı olan sektör yazılır; kalan sektörler DEFAULT'a düşer.
// "14 sektör = 14 satır" tuzağı burada kapanıyor: bir sektörün kuaför yüzünü
// kullanması `berber: SALON` kadar kısa, gerçekten farklı bir iş akışı gerekince
// yeni bir yüz anahtarı açılır.
//
// Yüzlerin KENDİSİ (React bileşenleri) pages/sectorFaces.tsx'te; bu dosya saf
// kalır ki testler node ile doğrudan import edebilsin (bkz. cashSectorProfiles).

/** Bir sayfanın hangi tasarımla çizileceği. */
export type FaceKey = 'genel' | 'salon' | 'guzellik';

export interface CalendarProfile {
    calendar: FaceKey;
    reservations: FaceKey;
    customers: FaceKey;
    /**
     * Mobil takvim yüzü. Bugün tek yüz var; alan şimdiden burada dursun ki
     * sektöre özel bir mobil takvim geldiğinde App.tsx'e dokunulmasın.
     */
    mobileCalendar: FaceKey;
    /**
     * Randevu kartından açılan "ziyaret" ekranının yolu. Diş kliniğinde randevu
     * bir muayene kaydına bağlanır; MobileCalendar bunu `sector === 'dis'`
     * karşılaştırmasıyla yapıyordu — son sektör if'i de profile taşındı.
     * Tanımsızsa ziyaret ekranı yoktur.
     */
    visitRoute?: (reservationId: string) => string;
}

const DEFAULT_PROFILE: CalendarProfile = {
    calendar: 'genel',
    reservations: 'genel',
    customers: 'genel',
    mobileCalendar: 'genel',
};

const SALON: CalendarProfile = {
    ...DEFAULT_PROFILE,
    calendar: 'salon',
    reservations: 'salon',
    customers: 'salon',
};

export const CALENDAR_PROFILES: Record<string, CalendarProfile> = {
    kuafor: SALON,
    // Güzellikte müşteri ve rezervasyon yüzleri kendine özel; TAKVİM jenerik
    // kalıyor — kabin şeridi ve paket rozetiyle zaten sektöre bürünüyor
    // (bkz. 2.5 kararı).
    guzellik: { ...DEFAULT_PROFILE, customers: 'guzellik', reservations: 'guzellik' },
    dis: {
        ...DEFAULT_PROFILE,
        visitRoute: (reservationId) => `/dental-visit/${encodeURIComponent(reservationId)}`,
    },
};

export function calendarProfileFor(sector?: string | null): CalendarProfile {
    return CALENDAR_PROFILES[sector || ''] ?? DEFAULT_PROFILE;
}
