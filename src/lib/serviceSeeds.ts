// ── Sektör hizmet tohumları ──────────────────────────────────────────────────
// Bir işletme hizmet listesini hâlâ genel varsayılanlarla kullanıyorsa, kendi
// sektörünün hazır setini tek tıkla yükleyebilir. Mevcut hizmetler SİLİNMEZ;
// yalnız eksik olanlar eklenir.
//
// Bu tablo daha önce CalendarPage'in içinde sabit bir diş listesiydi: genel
// takvim yüzü tek bir sektörün içeriğini taşıyordu ve ikinci bir sektöre set
// eklemek sayfayı düzenlemeyi gerektiriyordu. Artık yeni sektör eklemek buraya
// bir kayıt yazmak.

export interface ServiceSeed {
    name: string;
    duration: number;
    color: string;
    /** Dönüş periyodu (gün) — işlem kapandığında müşterinin recall_date'i bu kadar ileri atılır. */
    recallDays?: number;
    /**
     * Uygunluk etiketleri (bkz. Service.tags / lib/serviceEligibility). Seed'in
     * en önemli katkısı bu: etiketsiz hizmetlerde kontrendikasyon yalnız ad
     * eşleşmesine düşer, etiketle kesinleşir.
     */
    tags?: string[];
}

export interface SectorServiceSeed {
    /** Setin zaten yüklü olup olmadığını anlamak için aranan hizmet adı. */
    probeName: string;
    /** Öneri kartının başlığı — sektörün kendi diliyle. */
    label: string;
    services: ServiceSeed[];
}

export const SERVICE_SEEDS: Record<string, SectorServiceSeed> = {
    guzellik: {
        probeName: 'Cilt Bakımı',
        label: 'Güzellik salonu seti',
        services: [
            { name: 'Cilt Bakımı', duration: 60, color: '#FF5A1F', recallDays: 30, tags: ['bakim'] },
            { name: 'Lazer Epilasyon', duration: 45, color: '#8E70B2', recallDays: 30, tags: ['lazer'] },
            { name: 'İğneli Epilasyon', duration: 30, color: '#B2708E', recallDays: 30, tags: ['lazer'] },
            { name: 'Bölgesel İncelme', duration: 50, color: '#3F9D9A', recallDays: 21, tags: ['medikal'] },
            { name: 'Kaş Tasarımı', duration: 20, color: '#E8973C', recallDays: 21, tags: ['bakim'] },
            { name: 'Kirpik Lifting', duration: 60, color: '#C95A8E', recallDays: 45, tags: ['bakim'] },
            { name: 'Manikür', duration: 40, color: '#5B7CC2', recallDays: 21, tags: ['bakim'] },
            { name: 'Pedikür', duration: 50, color: '#5E9C6C', recallDays: 30, tags: ['bakim'] },
            { name: 'Ağda', duration: 30, color: '#CB5E84', recallDays: 28, tags: ['bakim'] },
            { name: 'Masaj', duration: 60, color: '#7C9C5E', recallDays: 30, tags: ['bakim'] },
        ],
    },
    dis: {
        probeName: 'Dolgu',
        label: 'Diş tedavi seti',
        services: [
            { name: 'Muayene', duration: 20, color: '#FF5A1F', recallDays: 180 },
            { name: 'Kontrol', duration: 15, color: '#E8973C', recallDays: 180 },
            { name: 'Dolgu', duration: 45, color: '#3F9D9A', recallDays: 180 },
            { name: 'Kanal Tedavisi', duration: 60, color: '#8E70B2', recallDays: 180 },
            { name: 'Diş Taşı Temizliği', duration: 30, color: '#5B7CC2', recallDays: 180 },
            { name: 'Diş Çekimi', duration: 30, color: '#C95A3C' },
            { name: 'İmplant', duration: 90, color: '#5E9C6C', recallDays: 180 },
            { name: 'Beyazlatma', duration: 60, color: '#CB5E84', recallDays: 365 },
        ],
    },
};

export const serviceSeedFor = (sector?: string | null): SectorServiceSeed | null =>
    SERVICE_SEEDS[sector || ''] ?? null;

/** Sette olup listede olmayan hizmetler — ad karşılaştırması büyük/küçük harf duyarsız. */
export function missingSeedServices(
    seed: SectorServiceSeed,
    existing: { name: string }[],
): ServiceSeed[] {
    const have = new Set(existing.map((s) => s.name.toLocaleLowerCase('tr')));
    return seed.services.filter((s) => !have.has(s.name.toLocaleLowerCase('tr')));
}
