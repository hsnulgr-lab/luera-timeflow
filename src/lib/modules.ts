import type { ModuleKey, Modules } from '@/types';

// Modül meta verisi — Ayarlar'daki toggle listesi ve etiketler tek kaynaktan.
export const MODULE_META: { key: ModuleKey; label: string; desc: string }[] = [
    { key: 'randevu', label: 'Randevu', desc: 'Takvim, rezervasyonlar ve online booking' },
    { key: 'personel', label: 'Personel', desc: 'Personel yönetimi ve performans' },
    { key: 'hizmet', label: 'Hizmet', desc: 'Hizmet kataloğu ve fiyatlandırma' },
    { key: 'kasa', label: 'Kasa', desc: 'Tahsilat, gelir ve ürün satışı' },
    { key: 'masa', label: 'Masa', desc: 'Restoran masa yönetimi ve oturma planı' },
    { key: 'analiz', label: 'Analiz', desc: 'İstatistik ve performans raporları' },
    { key: 'sira', label: 'Sıra', desc: 'Sırasız bekleme — kuaför/berber walk-in kuyruğu' },
];

export const ALL_MODULE_KEYS = MODULE_META.map((m) => m.key);

// Hiçbir veri yokken güvenli varsayılan: hepsi açık (genel işletme)
export const DEFAULT_MODULES: Modules = {
    randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: false,
};

// Sektör → varsayılan modül seti (migration 023 ile birebir)
export const SECTOR_MODULES: Record<string, Modules> = {
    // restoran: personel açık — garson ataması ve garsona push personel listesinden beslenir
    restoran: { randevu: false, personel: true, hizmet: false, kasa: true, masa: true, analiz: true, sira: false },
    guzellik: { randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: false },
    kuafor: { randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: true },
    fizyoterapi: { randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: false },
    saglik: { randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: false },
    danismanlik: { randevu: true, personel: true, hizmet: true, kasa: true, masa: false, analiz: true, sira: false },
    genel: { randevu: true, personel: true, hizmet: true, kasa: true, masa: true, analiz: true, sira: false },
};

export function modulesForSector(sector: string): Modules {
    return SECTOR_MODULES[sector] ?? DEFAULT_MODULES;
}

// DB'den gelen (kısmi olabilir) modules nesnesini tam ve güvenli hale getir.
export function normalizeModules(raw: unknown): Modules {
    const base = { ...DEFAULT_MODULES };
    if (raw && typeof raw === 'object') {
        for (const k of ALL_MODULE_KEYS) {
            const v = (raw as Record<string, unknown>)[k];
            if (typeof v === 'boolean') base[k] = v;
        }
    }
    return base;
}
