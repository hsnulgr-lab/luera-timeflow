// ── Hizmet reçetesi: işlemde tüketilen sarf malzemesi ────────────────────────
// "Dip boya = 60 ml boya 7.1 + 60 ml oksidan 20 vol". Reçete hizmetin kendi
// kaydında durur (Ayarlar → Hizmetler); işlem kapanırken stok defterine bir
// 'usage' hareketi yazılır. Miktar yine hiçbir yerde saklanmaz — düşülen şey
// hareketin kendisidir (bkz. src/lib/stock.ts).
//
// Personel renk sayacında miktarı değiştirebilir; düzeltme randevunun
// custom_fields'ına yazılır ve reçetenin varsayılanını EZER. Böylece uzun saç
// gerçekten fazla boya yazar, kısa saç az — reçete yalnız iyi bir başlangıçtır.
import type { Product, Reservation, Service } from '../types/index.ts';

/** Randevuya yazılan miktar düzeltmeleri: { productId: miktar } (JSON). */
export const KF_USAGE_KEY = 'kf_sarf';
/** Stok düşüldü işareti — aynı randevu iki kez kapanırsa çift düşmesin. */
export const KF_USAGE_DONE_KEY = 'kf_sarf_dusuldu';

export interface UsageLine {
    productId: string;
    name: string;
    unit: string;
    quantity: number;
}

/** Randevuya yazılmış düzeltmeleri oku; bozuk JSON sessizce yok sayılır. */
export function usageOverrides(reservation: Reservation): Record<string, number> {
    const raw = reservation.customFields?.[KF_USAGE_KEY];
    if (!raw) return {};
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return {};
        const out: Record<string, number> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            const n = Number(value);
            if (Number.isFinite(n) && n >= 0) out[key] = n;
        }
        return out;
    } catch {
        return {};
    }
}

export function encodeUsage(lines: UsageLine[]): string {
    const map: Record<string, number> = {};
    for (const line of lines) map[line.productId] = line.quantity;
    return JSON.stringify(map);
}

/** Hizmetin reçetesi — takibi kapalı ve silinmiş ürünler elenir. */
export function recipeFor(serviceName: string, services: Service[], products: Product[]): UsageLine[] {
    const service = services.find((s) => s.name === serviceName);
    if (!service?.recipe?.length) return [];
    const lines: UsageLine[] = [];
    for (const line of service.recipe) {
        const product = products.find((p) => p.id === line.productId);
        if (!product || product.tracksStock === false) continue;
        lines.push({
            productId: product.id,
            name: product.name,
            unit: product.unit || 'adet',
            quantity: Number(line.quantity) || 0,
        });
    }
    return lines;
}

/**
 * Bu randevuda gerçekten düşülecek satırlar: reçete + randevuya yazılmış
 * düzeltmeler. Düzeltmede 0 yazmak "bu üründen kullanılmadı" demektir ve satır
 * düşer. Reçetede olmayan bir ürün düzeltmeye eklenmişse o da sayılır.
 */
export function usageFor(
    reservation: Reservation,
    services: Service[],
    products: Product[],
): UsageLine[] {
    const overrides = usageOverrides(reservation);
    const base = recipeFor(reservation.service, services, products);
    const seen = new Set(base.map((line) => line.productId));
    const lines = base.map((line) => (
        line.productId in overrides ? { ...line, quantity: overrides[line.productId] } : line
    ));
    for (const [productId, quantity] of Object.entries(overrides)) {
        if (seen.has(productId)) continue;
        const product = products.find((p) => p.id === productId);
        if (!product || product.tracksStock === false) continue;
        lines.push({ productId, name: product.name, unit: product.unit || 'adet', quantity });
    }
    return lines.filter((line) => line.quantity > 0);
}

/** Randevunun sarfı daha önce düşüldü mü? */
export function usageAlreadyDeducted(reservation: Reservation): boolean {
    return reservation.customFields?.[KF_USAGE_DONE_KEY] === true
        || reservation.customFields?.[KF_USAGE_DONE_KEY] === 'true';
}
