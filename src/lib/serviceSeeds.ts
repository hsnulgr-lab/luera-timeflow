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
    // ── Aşağıdakiler kurulum sihirbazı için eklendi ─────────────────────────
    // Sihirbazın 5. adımı listeyi DOLU açar; kullanıcının işi eklemek değil
    // çıkarmak olur. Boş bir tabloya "hizmet ekle" demek kurulumun en büyük
    // terk noktası — o yüzden 13 sektörün hepsinde set olmak zorunda, aksi
    // halde seti olmayan sektör eski (kötü) davranışa düşer.
    kuafor: {
        probeName: 'Saç Kesimi',
        label: 'Kuaför seti',
        services: [
            { name: 'Saç Kesimi', duration: 40, color: '#FF5A1F', recallDays: 30 },
            { name: 'Fön', duration: 30, color: '#E8973C', recallDays: 14 },
            { name: 'Dip Boya', duration: 90, color: '#8E70B2', recallDays: 35 },
            { name: 'Röfle / Balyaj', duration: 150, color: '#C95A8E', recallDays: 90 },
            { name: 'Keratin Bakım', duration: 120, color: '#3F9D9A', recallDays: 120 },
            { name: 'Saç Bakımı', duration: 45, color: '#5E9C6C', recallDays: 30 },
            { name: 'Topuz / Gelin Saçı', duration: 90, color: '#5B7CC2' },
        ],
    },
    berber: {
        probeName: 'Saç Kesimi',
        label: 'Berber seti',
        services: [
            { name: 'Saç Kesimi', duration: 30, color: '#FF5A1F', recallDays: 21 },
            { name: 'Sakal Tıraşı', duration: 20, color: '#5B7CC2', recallDays: 14 },
            { name: 'Saç + Sakal', duration: 45, color: '#8E70B2', recallDays: 21 },
            { name: 'Çocuk Kesimi', duration: 25, color: '#E8973C', recallDays: 30 },
            { name: 'Yüz Bakımı', duration: 30, color: '#3F9D9A', recallDays: 30 },
            { name: 'Ağda', duration: 15, color: '#CB5E84', recallDays: 21 },
        ],
    },
    estetik: {
        probeName: 'Konsültasyon',
        label: 'Estetik kliniği seti',
        services: [
            { name: 'Konsültasyon', duration: 30, color: '#FF5A1F' },
            { name: 'Botoks', duration: 30, color: '#8E70B2', recallDays: 120, tags: ['medikal'] },
            { name: 'Dolgu', duration: 45, color: '#C95A8E', recallDays: 180, tags: ['medikal'] },
            { name: 'Mezoterapi', duration: 40, color: '#3F9D9A', recallDays: 30, tags: ['medikal'] },
            { name: 'Lazer Epilasyon', duration: 45, color: '#5B7CC2', recallDays: 30, tags: ['lazer'] },
            { name: 'Cilt Gençleştirme', duration: 60, color: '#5E9C6C', recallDays: 60, tags: ['medikal'] },
            { name: 'Kontrol', duration: 15, color: '#E8973C', recallDays: 30 },
        ],
    },
    saglik: {
        probeName: 'İlk Muayene',
        label: 'Klinik muayene seti',
        services: [
            { name: 'İlk Muayene', duration: 30, color: '#FF5A1F', recallDays: 180 },
            { name: 'Kontrol Muayenesi', duration: 20, color: '#E8973C', recallDays: 90 },
            { name: 'Tahlil / Sonuç Değerlendirme', duration: 20, color: '#3F9D9A' },
            { name: 'Online Görüşme', duration: 20, color: '#5B7CC2' },
            { name: 'Rapor / Belge', duration: 15, color: '#8E70B2' },
        ],
    },
    fizyoterapi: {
        probeName: 'Değerlendirme Seansı',
        label: 'Fizyoterapi seti',
        services: [
            { name: 'Değerlendirme Seansı', duration: 45, color: '#FF5A1F' },
            { name: 'Manuel Terapi', duration: 45, color: '#3F9D9A', recallDays: 7 },
            { name: 'Egzersiz Seansı', duration: 60, color: '#5E9C6C', recallDays: 7 },
            { name: 'Elektroterapi', duration: 30, color: '#5B7CC2', recallDays: 7 },
            { name: 'Kinesio Bantlama', duration: 20, color: '#E8973C' },
            { name: 'Kontrol', duration: 20, color: '#8E70B2', recallDays: 30 },
        ],
    },
    tattoo: {
        probeName: 'Tasarım Görüşmesi',
        label: 'Stüdyo seti',
        services: [
            { name: 'Tasarım Görüşmesi', duration: 30, color: '#FF5A1F' },
            { name: 'Küçük Dövme', duration: 60, color: '#8E70B2' },
            { name: 'Orta Boy Dövme', duration: 150, color: '#C95A8E' },
            { name: 'Tam Seans (Gün)', duration: 300, color: '#5B7CC2' },
            { name: 'Piercing', duration: 20, color: '#3F9D9A' },
            { name: 'Rötuş', duration: 45, color: '#E8973C', recallDays: 30 },
        ],
    },
    avukat: {
        probeName: 'İlk Görüşme',
        label: 'Hukuk bürosu seti',
        services: [
            { name: 'İlk Görüşme', duration: 45, color: '#FF5A1F' },
            { name: 'Danışmanlık Görüşmesi', duration: 60, color: '#5B7CC2' },
            { name: 'Dosya İnceleme', duration: 90, color: '#8E70B2' },
            { name: 'Sözleşme Hazırlığı', duration: 60, color: '#3F9D9A' },
            { name: 'Online Görüşme', duration: 30, color: '#5E9C6C' },
        ],
    },
    danismanlik: {
        probeName: 'Tanışma Görüşmesi',
        label: 'Danışmanlık seti',
        services: [
            { name: 'Tanışma Görüşmesi', duration: 30, color: '#FF5A1F' },
            { name: 'Birebir Seans', duration: 60, color: '#8E70B2', recallDays: 7 },
            { name: 'Uzun Seans', duration: 90, color: '#3F9D9A', recallDays: 14 },
            { name: 'Online Seans', duration: 50, color: '#5B7CC2', recallDays: 7 },
            { name: 'Değerlendirme Raporu', duration: 45, color: '#E8973C' },
        ],
    },
    gym: {
        probeName: 'Ölçüm ve Değerlendirme',
        label: 'Gym / PT seti',
        services: [
            { name: 'Ölçüm ve Değerlendirme', duration: 30, color: '#FF5A1F', recallDays: 30 },
            { name: 'Kişisel Antrenman', duration: 60, color: '#3F9D9A', recallDays: 3 },
            { name: 'Çiftli Antrenman', duration: 60, color: '#5B7CC2', recallDays: 3 },
            { name: 'Grup Dersi', duration: 45, color: '#5E9C6C', recallDays: 7 },
            { name: 'Beslenme Görüşmesi', duration: 30, color: '#E8973C', recallDays: 30 },
        ],
    },
    gelinlikci: {
        probeName: 'İlk Prova',
        label: 'Gelinlik seti',
        services: [
            { name: 'Model Seçimi', duration: 60, color: '#FF5A1F' },
            { name: 'İlk Prova', duration: 60, color: '#C95A8E' },
            { name: 'Ara Prova', duration: 45, color: '#8E70B2' },
            { name: 'Son Prova', duration: 45, color: '#5B7CC2' },
            { name: 'Teslim', duration: 30, color: '#5E9C6C' },
        ],
    },
    restoran: {
        probeName: 'Masa Rezervasyonu',
        label: 'Restoran seti',
        services: [
            { name: 'Masa Rezervasyonu', duration: 90, color: '#FF5A1F' },
            { name: 'Kahvaltı', duration: 90, color: '#E8973C' },
            { name: 'Akşam Yemeği', duration: 120, color: '#8E70B2' },
            { name: 'Özel Gün / Kutlama', duration: 150, color: '#C95A8E' },
            { name: 'Grup Rezervasyonu', duration: 180, color: '#3F9D9A' },
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
