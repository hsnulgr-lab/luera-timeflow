/**
 * `visit.items`in SAF kuralı — kalem listesinin doğrulanması ve katalogdan
 * çözülmesi; `visit.collect` / `visit.charge`ın "Kasa'ya ait" kuralı.
 *
 * Ayrı dosyada, çünkü Node testleri onu ÇALIŞTIRABİLİYOR (D2, 2026-10-16).
 * Denetimin dersi: "kaynak metnine bakan test ölü dalı yakalamaz." İstemci
 * testi ×2'yi, sunucu testi `qty !== 1`'i ayrı ayrı doğru buluyordu; ikisini
 * birlikte koşturan yoktu ve kumandanın gönderdiği liste canlıda bütünüyle
 * reddediliyordu. Testler artık kumandanın gönderdiğini (`sendableOf`)
 * buradan geçiriyor.
 *
 * Deno'ya da Node'a da bağlı değil: ağ yok, veritabanı yok. Katalog satırları
 * çağırandan geliyor (`index.ts` organizasyon kataloğunu okuyor).
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CatalogProductRow {
    id: string;
    name: string;
    price: number | string | null;
    kind: 'retail' | 'consumable' | string;
    tracks_stock: boolean | null;
}

export interface CatalogServiceRow {
    id: string;
    name: string;
    price: number | string | null;
}

export function catalogPrice(value: unknown): number {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0;
}

/**
 * Ücretli kalemde (ek hizmet, satılan ürün) adet sınırı — kumandanın kendi
 * sınırı (`adisyon.ts` · QTY_MAX) (D2, 2026-10-16).
 *
 * Eskiden ücretli kalemde `qty !== 1` tek satır yüzünden BÜTÜN listeyi
 * reddediyordu; telefon ikinci dokunuşta ×2 yapıyordu. Otomatik kayıt
 * sessizce düşüyor, tek kişilik tahsilat kilitleniyor, ekip personeli yanlış
 * bir cümle görüyordu. Malzemenin sınırı (99) eski istemciler için aynen.
 */
export const PAID_QTY_MAX = 20;

/** Malzemenin adet sınırı — eski istemcilerle aynı. */
const MATERIAL_QTY_MAX = 99;

/** Katalog dışı malzemenin adı — boşluklar toplanır, sınırı aşan reddedilir. */
export const FREE_NAME_MAX = 60;

/**
 * KATALOG DIŞI MALZEME (D2, 2026-10-16) — kimliği `free:<ad>`.
 *
 * Kumanda katalogda olmayan bir kalemi ADIYLA ekleyebiliyor ve mağazadaki
 * 1.0 da onu `productId: 'free:<ad>'` diye gönderiyordu; UUID kapısı bütün
 * listeyi reddediyordu. Yalnız MALZEME kabul ediliyor: fiyatı yok
 * (`price: 0`), müşteriye yazılmıyor, katalogda olmadığı için stoktan da
 * düşmüyor.
 *
 * Ücretli türde (ek hizmet, ürün) katalog dışı kalem KABUL EDİLMİYOR
 * (kullanıcı kararı): fiyatı telefondan gelirse tutarı istemci belirlemiş
 * olurdu ve masaüstünde ₺0'lık satırın fiyatını yazacak bir alan yok.
 *
 * Ad bulunamazsa `null`; uzunsa da `null` — sessizce kesmek kişinin yazdığı
 * adı değiştirmek olurdu (kumandanın arama kutusu aynı sınırda duruyor).
 */
export function freeMaterialName(line: Record<string, unknown>): string | null {
    if (line.kind !== 'material') return null;
    const id = line.productId;
    if (typeof id !== 'string' || !id.startsWith('free:')) return null;
    const name = id.slice(5).replace(/\s+/g, ' ').trim();
    if (!name || name.length > FREE_NAME_MAX) return null;
    return name;
}

const qtyOf = (line: Record<string, unknown>) => Number(line.qty ?? 1);
const inRange = (qty: number, max: number) => Number.isInteger(qty) && qty >= 1 && qty <= max;

/**
 * Listenin biçimi, türü, kimliği ve tekrarı — katalog OKUNMADAN.
 *
 * Döndürdüğü kimlikler okunacak katalog kayıtları. Katalog dışı malzeme
 * okunmuyor (katalogda yok); tekrarı adıyla, büyük-küçük harf gözetmeden.
 */
export function planVisitItems(
    requested: readonly Record<string, unknown>[],
): { productIds: string[]; serviceIds: string[] } | { error: 'invalid_catalog_item' | 'duplicate_catalog_item' } {
    const productIds: string[] = [];
    const serviceIds: string[] = [];
    const seen = new Set<string>();
    for (const line of requested) {
        const kind = line?.kind;
        // Katalog dışı malzeme: kimliği yok, adıyla geliyor (D2).
        const free = line ? freeMaterialName(line) : null;
        if (free) {
            const key = `free:${free.toLocaleLowerCase('tr-TR')}`;
            if (seen.has(key)) return { error: 'duplicate_catalog_item' };
            seen.add(key);
            continue;
        }
        const catalogId = kind === 'extra' ? line?.serviceId : line?.productId;
        if ((kind !== 'product' && kind !== 'material' && kind !== 'extra')
            || typeof catalogId !== 'string' || !UUID_RE.test(catalogId)) {
            return { error: 'invalid_catalog_item' };
        }
        const key = kind === 'extra' ? `service:${catalogId}` : `product:${catalogId}`;
        if (seen.has(key)) return { error: 'duplicate_catalog_item' };
        seen.add(key);
        if (kind === 'extra') serviceIds.push(catalogId);
        else productIds.push(catalogId);
    }
    return { productIds, serviceIds };
}

/**
 * Kalemleri KATALOGDAN çözer — ad ve fiyat sunucunun, telefonun değil.
 *
 * `null` → liste geçersiz (`invalid_catalog_item`): tek bir satır bile
 * çözülemezse hiçbiri yazılmıyor. Yarım adisyon yazmak, kasaya eksik bir
 * hesap düşürmek olurdu.
 *
 * Adet `qty > 1` ise satırda kalıyor; tahsilat ve Kasa fiyat × adet sayıyor.
 */
export function resolveVisitItems(
    requested: readonly Record<string, unknown>[],
    productById: ReadonlyMap<string, CatalogProductRow>,
    serviceById: ReadonlyMap<string, CatalogServiceRow>,
): Record<string, unknown>[] | null {
    const items: Record<string, unknown>[] = [];
    for (const line of requested) {
        const qty = qtyOf(line);
        const free = freeMaterialName(line);
        if (free) {
            if (!inRange(qty, MATERIAL_QTY_MAX)) return null;
            items.push({
                id: `free:${free}`,
                name: free,
                price: 0,
                kind: 'material',
                // Kimlik geri dönüyor ki kumanda aynı kalemi yeniden
                // gönderebilsin (`linesFromItems` → `sendableOf`).
                productId: `free:${free}`,
                ...(qty > 1 ? { qty } : {}),
            });
            continue;
        }

        if (line.kind === 'extra') {
            const service = serviceById.get(String(line.serviceId));
            // Adet 1–20 (D2): ekrandaki "×2" ile kasaya giden aynı.
            if (!service || !inRange(qty, PAID_QTY_MAX)) return null;
            items.push({
                id: `service:${service.id}`,
                name: service.name,
                price: catalogPrice(service.price),
                kind: 'extra',
                serviceId: service.id,
                ...(qty > 1 ? { qty } : {}),
            });
            continue;
        }

        const product = productById.get(String(line.productId));
        if (!product || !inRange(qty, MATERIAL_QTY_MAX)) return null;
        // Eski istemciler sarfı da `product` diye gönderiyordu. Türü
        // telefondan değil katalogdaki product.kind'dan türetmek hem
        // güvenli hem de dağıtım geçişinde geriye uyumludur.
        //
        // Stok İZLEMEYEN sarf da malzeme (D2): eskiden bütün listeyi
        // reddediyordu, oysa kumanda onu katalogda gösteriyordu. Fiyatı
        // yok; stok düşümü onu atlıyor (`reconcileUsageStock`).
        if (product.kind === 'consumable') {
            items.push({
                id: `material:${product.id}`,
                name: product.name,
                price: 0,
                kind: 'material',
                productId: product.id,
                ...(qty > 1 ? { qty } : {}),
            });
            continue;
        }
        // Satılan ürün kasa aşamasında `sale` olarak stoktan düşer;
        // visit.finish onu `usage` saymaz. Adet 1–20 (D2): masaüstü Kasa
        // satırı artık adedi taşıyor, satış adet kadar düşer.
        if (line.kind !== 'product' || product.kind !== 'retail' || qty > PAID_QTY_MAX) return null;
        items.push({
            id: `product:${product.id}`,
            name: product.name,
            price: catalogPrice(product.price),
            kind: 'product',
            productId: product.id,
            ...(qty > 1 ? { qty } : {}),
        });
    }
    return items;
}

/**
 * KASA'YA AİT ADİSYON (D6, 2026-10-16) — telefon tahsil ETMİYOR.
 *
 * Masaüstü Kasa dört durumu kendi kuralıyla hesaplıyor (`cashBuild.ticketsOf`):
 * paketli seansta hizmet 0, kayıtlı indirim düşülüyor, randevuya bağlı önceki
 * tahsilat (kapora, kısmi) düşülüyor, grup TEK adisyon. `visit.collect` ve
 * `visit.charge` bunların hiçbirini yapmıyordu: Gün "₺300" derken kumanda ve
 * kasa paket hizmetini YENİDEN tahsil ediyordu (çift tahsilat).
 *
 * Kullanıcı kararı: bu durumlarda telefon "Kasa'dan tahsil edin" diyor. Kural
 * istemcide aynı (`cashBuild.kasaOnlyReason`); testler ikisini aynı girdilerle
 * koşturuyor.
 *
 * ── PAKETLİ SEANS ARTIK TELEFONDA (1.0.1, kullanıcı kararı 2026-10-16) ──────
 * "Tek kişilik işletmenin bilgisayarı yok; paket tahsilatı telefondan
 * tamamlanmalı." Paket motoru olan sektörde (güzellik/kuaför) paketli seans
 * Kasa'ya AİT DEĞİL: hizmet ₺0 (`packageCovered`, Kasa'nın `ticketsOf`
 * kuralıyla aynı), yalnız ürün/ekstra tahsil ediliyor; o da yoksa adisyon
 * ödeme kaydı yazılmadan kapanıyor. Paket motoru OLMAYAN sektörde bağın
 * parasal anlamı yok (Kasa da ₺0 saymıyor) — orada eskisi gibi Kasa'nın.
 */
export type KasaReason = 'group' | 'package' | 'discount' | 'partial';

/** Paket motoru yalnız güzellik ve kuaförde gerçek (`cashBuild.packagesEnabledFor`). */
const PACKAGE_SECTORS: readonly string[] = ['guzellik', 'kuafor'];

export function packagesEnabledFor(sector: unknown): boolean {
    return typeof sector === 'string' && PACKAGE_SECTORS.includes(sector);
}

/** Randevu bir pakete bağlı mı (`custom_fields.paket_plan_id`)? */
export function hasPackageLink(row: { custom_fields?: unknown }): boolean {
    const fields = (row.custom_fields ?? {}) as Record<string, unknown>;
    return typeof fields.paket_plan_id === 'string' && Boolean(fields.paket_plan_id);
}

/** Hizmeti paketten mi — ₺0 (Kasa'nın `ticketsOf` · `covered`). */
export function packageCovered(row: { custom_fields?: unknown }, packagesEnabled: boolean): boolean {
    return packagesEnabled && hasPackageLink(row);
}

export function kasaOnlyReason(
    row: { group_id?: unknown; custom_fields?: unknown },
    paid: number,
    packagesEnabled: boolean,
): KasaReason | null {
    if (typeof row.group_id === 'string' && row.group_id) return 'group';
    const fields = (row.custom_fields ?? {}) as Record<string, unknown>;
    if (hasPackageLink(row) && !packagesEnabled) return 'package';
    if ((Number(fields.cash_discount_amount) || 0) > 0) return 'discount';
    if (paid > 0) return 'partial';
    return null;
}
