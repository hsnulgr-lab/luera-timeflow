// Basit stale-while-revalidate önbelleği (localStorage).
// Sorun: her sayfa kendi hook state'ini boş başlatıp Supabase'den sıfırdan
// çekiyordu — route değişiminde ve hard refresh'te 1-2 sn "veri yok" flaşı.
// Çözüm: fetch başlamadan önce son bilinen veri anında gösterilir, ağdan
// gelen taze veri üzerine yazar (realtime abonelikleri zaten canlı tutuyor).
// Anahtarlar orgId içerir — başka org'un verisi asla okunmaz; çıkışta
// clearAllCache ile temizlenir.
const PREFIX = 'tfc:';

export function readCache<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

export function writeCache(key: string, data: unknown): void {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(data));
    } catch {
        // kota dolu / private mode — önbelleksiz devam, akış bozulmaz
    }
}

export function clearAllCache(): void {
    try {
        for (const k of Object.keys(localStorage)) {
            if (k.startsWith(PREFIX)) localStorage.removeItem(k);
        }
    } catch { /* no-op */ }
}
