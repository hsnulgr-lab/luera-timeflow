/**
 * Personel 13 — sunucunun `catalog` cevabını ekranın kalem listesine
 * indirgeyen SAF katman.
 *
 * `customerFileMap.ts` ile aynı gerekçeyle ayrı dosya: `catalogSource.ts`
 * React ve api katmanına bağlı, yani testten çağrılamıyor. Eşleme burada
 * durunca gerçekten ÇALIŞTIRARAK sınanabiliyor.
 */

import type { CatalogItem, UsageRow } from './adisyon.ts';

export interface ServerCatalog {
    services?: Record<string, unknown>[];
    products?: Record<string, unknown>[];
    usage?: Record<string, unknown>[];
}

/** Ürünün veritabanındaki türünü ekranın diline çevirir. */
export function lineKindOf(kind: unknown): CatalogItem['kind'] {
    // Varsayılan `retail` (075): türü okunamayan bir ürünü SARF saymak, onu
    // sessizce depodan düşürüp müşteriye hiç yazmamak olurdu.
    return String(kind ?? 'retail') === 'consumable' ? 'material' : 'product';
}

export function toCatalog(data: ServerCatalog): CatalogItem[] {
    const services = (data.services ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        kind: 'extra' as const,
        ...(typeof row.price === 'number' ? { price: row.price } : {}),
    }));
    const products = (data.products ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        kind: lineKindOf(row.kind),
        // Malzemenin fiyatı YOK: depodan düşüyor, müşteriye yazılmıyor.
        ...(lineKindOf(row.kind) !== 'material' && typeof row.price === 'number'
            ? { price: row.price }
            : {}),
    }));
    return [...services, ...products].filter((item) => item.name);
}

export function toUsage(data: ServerCatalog): UsageRow[] {
    return (data.usage ?? []).map((row) => ({
        name: String(row.name ?? ''),
        service: String(row.service ?? ''),
        staffId: (row.staffId as string | null) ?? null,
        dateISO: String(row.dateISO ?? ''),
        count: Number(row.count ?? 0),
    })).filter((row) => row.name && row.count > 0);
}

