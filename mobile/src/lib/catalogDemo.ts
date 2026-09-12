/**
 * Kumandanın SAHTE kataloğu ve kullanım geçmişi.
 *
 * `AUTH_MODE=live` verilmeden geliştirme akışı bunun üstünde sürüyor; canlıya
 * geçiş tek değişkenle geri alınabiliyor (`catalogSource.ts`).
 *
 * Kodlar birbirine YAKIN seçildi, çünkü bu ekranın asıl sınavı `7.3` ile
 * `7.31`i ayırt ettirmek. Altısı kutuda duruyor, kalanı aramada.
 */

import type { CatalogItem, UsageRow } from './adisyon.ts';

const CATALOG: CatalogItem[] = [
    { id: 'c1', name: 'Boya · 7.3 kumral', kind: 'material', usedHere: true },
    { id: 'c2', name: 'Boya · 7.31 küllü kumral', kind: 'material' },
    { id: 'c3', name: 'Boya · 7.34 bakır kumral', kind: 'material' },
    { id: 'c4', name: 'Boya · 8.3 açık kumral', kind: 'material' },
    { id: 'c5', name: 'Boya · 6.3 koyu kumral', kind: 'material' },
    { id: 'c6', name: 'Oksidan %6', kind: 'material', usedHere: true },
    { id: 'c7', name: 'Oksidan %9', kind: 'material' },
    { id: 'c8', name: 'Şampuan 300 ml', kind: 'product', price: 320 },
    { id: 'c9', name: 'Saç bakım yağı', kind: 'product', price: 640 },
    { id: 'c10', name: 'Keratin serum', kind: 'product', price: 880 },
    { id: 'c11', name: 'Kaş alma', kind: 'extra', price: 180 },
    { id: 'c12', name: 'Fön', kind: 'extra', price: 350 },
    { id: 'c13', name: 'Saç kesimi', kind: 'extra', price: 450 },
];

/** Geçmiş adisyonlar — sıklığın girdisi. Uydurulan bir eşik yok. */
const USAGE: UsageRow[] = [
    { name: 'Boya · 7.3 kumral', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-01', count: 14 },
    { name: 'Oksidan %6', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-01', count: 13 },
    { name: 'Fön', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-02', count: 9 },
    { name: 'Şampuan 300 ml', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-02', count: 6 },
    { name: 'Boya · 7.31 küllü kumral', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-03', count: 5 },
    { name: 'Saç bakım yağı', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-03', count: 3 },
    { name: 'Keratin serum', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-04', count: 2 },
    // Kesim de kendi kutularını taşıyor: hizmet başına ayrı sıralama demek,
    // her hizmette veri olması demek.
    { name: 'Fön', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-02', count: 11 },
    { name: 'Şampuan 300 ml', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-02', count: 7 },
    { name: 'Saç bakım yağı', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-03', count: 4 },
    { name: 'Kaş alma', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-03', count: 3 },
    { name: 'Keratin serum', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-04', count: 2 },
    { name: 'Saç kesimi', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-04', count: 2 },
    // Salonun kaydı: personelin kendi verisi yoksa buradan kuruluyor.
    { name: 'Oksidan %9', service: 'Röfle', staffId: null, dateISO: '2026-09-01', count: 7 },
    { name: 'Boya · 8.3 açık kumral', service: 'Röfle', staffId: null, dateISO: '2026-09-01', count: 5 },
];

export function demoCatalog(): CatalogItem[] { return CATALOG; }
export function demoUsage(): UsageRow[] { return USAGE; }
