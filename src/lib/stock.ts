// ── Stok türetimi — TEK KAYNAK ───────────────────────────────────────────────
// Bir ürünün miktarı hiçbir yerde saklanmaz: her zaman o ürüne ait
// hareketlerin (stock_movements) delta toplamıdır. Kasa satışı, elle giriş,
// fire ve sayım aynı defterden geçer; böylece "listede 4 yazıyor ama rafta 1
// var" durumu tek bir kaynağa bakarak çözülür.
//
// Bu dosya saf hesaptır — Supabase, React veya tarih "şu an" bilgisi içermez;
// testten doğrudan çağrılabilir.
import type { Product, StockMovement } from '../types/index.ts';

export type StockStatus = 'out' | 'neg' | 'low' | 'ok' | 'off';

/** Hareketsiz sayılma eşiği — 60 gün. */
export const IDLE_DAYS = 60;

/** Ürün bazında miktar tablosu: productId → toplam delta. */
export function quantityMap(movements: StockMovement[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const m of movements) {
        map[m.productId] = (map[m.productId] || 0) + Number(m.delta || 0);
    }
    return map;
}

/** Ürünün stoğu (hareket yoksa 0). */
export function quantityOf(productId: string, movements: StockMovement[]): number {
    return quantityMap(movements)[productId] || 0;
}

/**
 * Durum sırası: takip kapalıysa 'off'; eksi stok sayım ister ('neg');
 * 0 ve altı 'out'; eşik altındaki 'low'; kalanı 'ok'.
 * Eşik 0 ise uyarı üretilmez — kullanıcı bilerek "eşik yok" demiştir.
 */
export function statusOf(product: Product, qty: number): StockStatus {
    if (product.tracksStock === false) return 'off';
    if (qty < 0) return 'neg';
    if (qty <= 0) return 'out';
    const threshold = product.threshold || 0;
    if (threshold > 0 && qty <= threshold) return 'low';
    return 'ok';
}

/** Kritiklik sıralaması — sayım gerekenler en üstte, takip kapalılar en altta. */
export const STATUS_RANK: Record<StockStatus, number> = { neg: 0, out: 1, low: 2, ok: 3, off: 4 };

/** Dolu raf yüzdesi (par hedefine göre), 0–100 arası kırpılır. */
export function fillPercent(product: Product, qty: number): number {
    const par = product.parLevel || 0;
    if (par <= 0) return qty > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round((qty / par) * 100)));
}

/** Stok değeri — eksi stok değer üretmez. */
export function valueOf(product: Product, qty: number): number {
    return Math.max(0, qty) * (product.cost || 0);
}

/** Kâr marjı yüzdesi; satış fiyatı yoksa null. */
export function marginOf(product: Product): number | null {
    const price = product.price || 0;
    if (price <= 0) return null;
    return Math.round(((price - (product.cost || 0)) / price) * 100);
}

/** Ürünün son hareket tarihi (ISO) — hiç hareketi yoksa null. */
export function lastMovementAt(productId: string, movements: StockMovement[]): string | null {
    let latest: string | null = null;
    for (const m of movements) {
        if (m.productId !== productId) continue;
        if (!latest || m.createdAt > latest) latest = m.createdAt;
    }
    return latest;
}

/** IDLE_DAYS gündür hareket görmemiş mi? Hiç hareketi olmayan da hareketsizdir. */
export function isIdle(productId: string, movements: StockMovement[], now: Date): boolean {
    const last = lastMovementAt(productId, movements);
    if (!last) return true;
    const days = (now.getTime() - new Date(last).getTime()) / 86400000;
    return days >= IDLE_DAYS;
}

export interface StockTotals {
    orderNeeded: number;   // tükenen + kritik
    outCount: number;
    lowCount: number;
    totalValue: number;
    retailValue: number;
    idleCount: number;
}

export function stockTotals(products: Product[], movements: StockMovement[], now: Date): StockTotals {
    const qty = quantityMap(movements);
    let outCount = 0, lowCount = 0, totalValue = 0, retailValue = 0, idleCount = 0;
    for (const p of products) {
        const q = qty[p.id] || 0;
        const s = statusOf(p, q);
        if (s === 'out' || s === 'neg') outCount++;
        if (s === 'low') lowCount++;
        const v = valueOf(p, q);
        totalValue += v;
        if ((p.kind || 'retail') === 'retail') retailValue += v;
        if (isIdle(p.id, movements, now)) idleCount++;
    }
    return { orderNeeded: outCount + lowCount, outCount, lowCount, totalValue, retailValue, idleCount };
}

/**
 * Belirli bir aralıkta tüketilen malın maliyeti — çıkış hareketlerinin
 * (satış hariç: satış cirodur, tüketim giderdir) mutlak deltası × birim maliyet.
 */
export function consumptionCost(
    products: Product[],
    movements: StockMovement[],
    from: string,
    to: string,
): number {
    const costs: Record<string, number> = {};
    for (const p of products) costs[p.id] = p.cost || 0;
    let sum = 0;
    for (const m of movements) {
        if (m.type !== 'usage' && m.type !== 'waste') continue;
        if (m.createdAt < from || m.createdAt >= to) continue;
        sum += Math.abs(Number(m.delta || 0)) * (costs[m.productId] || 0);
    }
    return sum;
}

/** Bu ayın ve geçen ayın [from, to) sınırları — ISO. */
export function monthBounds(reference: Date) {
    const y = reference.getFullYear();
    const m = reference.getMonth();
    const iso = (d: Date) => d.toISOString();
    return {
        current: { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 1))) },
        previous: { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 1))) },
    };
}
