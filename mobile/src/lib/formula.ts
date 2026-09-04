/**
 * Personel 08 — ziyaretin formülü. Saf karar katmanı.
 *
 * Formül dört alan taşıyor ve SIRASI HER YERDE AYNI:
 *
 *     malzeme · oran · bekleme · sonuç
 *
 * Sabit sıra bir süs değil, karşılaştırmayı mümkün kılan şey: iki formül
 * üst üste okunduğunda değişen değer dikey olarak göze çarpıyor.
 *
 * İki alan KENDİLİĞİNDEN dolu geliyor — malzeme adisyondan, bekleme
 * sayaçtan. Personel yalnız orana ve sonuca dokunuyor. Toplam dört dokunuş;
 * ölçü buydu, çünkü on saniyeden uzun süren bir kayıt yazılmıyor.
 */

export interface FormulaMaterial {
    id: string | null;
    name: string;
    qty: number;
}

export interface VisitFormula {
    materials: FormulaMaterial[];
    ratio: string | null;
    waitMinutes: number | null;
    /** Sayaçtan mı geldi elle mi girildi — kayıt bunu söylüyor. */
    waitSource: 'timer' | 'manual';
    result: string | null;
    note: string | null;
    staffId: string | null;
    writtenAt: string | null;
}

/** Adisyon kalemi — formülün malzeme yarısı buradan türüyor. */
export interface FormulaSourceItem {
    id: string;
    name: string;
    kind: 'product' | 'material' | 'extra';
    qty?: number;
    productId?: string;
}

/** Oran salonda pratikte kapalı bir küme; dördüncüsü ± adımı. */
export const RATIOS = ['1:1', '1:1,5', '1:2'] as const;

/** Bekleme sayaç kurulmadığında elle giriliyor — oran ızgarasının kardeşi. */
export const WAITS = [25, 30, 35] as const;

/**
 * Sonuç bir ÖLÇEK değil, üç kelime. Kaydırmalı ölçek sahte hassasiyet
 * üretirdi: "%62 tuttu" diye bir ölçüm yok. Üç kelime bir sonraki formülün
 * ne yönde değişeceğini doğrudan söylüyor.
 */
export const RESULTS = [
    { label: 'Tuttu', tone: 'gr' as const },
    { label: 'Açık kaldı', tone: 'am' as const },
    { label: 'Koyu çıktı', tone: 'am' as const },
];

export function materialsOf(items: readonly FormulaSourceItem[] | null | undefined): FormulaMaterial[] {
    return (items ?? [])
        .filter((item) => item.kind === 'material')
        .map((item) => ({ id: item.productId ?? item.id, name: item.name, qty: item.qty ?? 1 }));
}

export function hasMaterial(items: readonly FormulaSourceItem[] | null | undefined): boolean {
    return (items ?? []).some((item) => item.kind === 'material');
}

/**
 * Malzeme grubunun başlığı üç hâlden birini söylüyor.
 *
 * `none` — adisyonda malzeme kalemi yok. Başlık ÇİZİLMİYOR: kesimde formül
 * alanı görmek personele "bir şey eksik bıraktım" dedirtir. Kısık da
 * durmuyor, boş da durmuyor — yok.
 */
export type GroupState = 'none' | 'pending' | 'done';

export function groupState(
    items: readonly FormulaSourceItem[] | null | undefined,
    formula: VisitFormula | null | undefined,
): GroupState {
    if (!hasMaterial(items)) return 'none';
    return isComplete(formula) ? 'done' : 'pending';
}

/** Dört alanın ikisi personelin: oran ve sonuç. İkisi de varsa formül tam. */
export function isComplete(formula: VisitFormula | null | undefined): boolean {
    return Boolean(formula?.ratio && formula?.result);
}

/**
 * Başlığın içerik satırı: yazıldıysa SONUCUN KENDİSİ.
 *
 * "Formül yazıldı" demek bir onay; `1:1,5 · 35 dk · tuttu` demek bilgi.
 * Adisyon şeridinin "son eklenen kalem" kararının aynısı — sayfa açmadan
 * cevap veriyor.
 */
export function summaryOf(formula: VisitFormula | null | undefined): string {
    if (!formula) return 'formül bekliyor';
    const parts = [
        formula.ratio,
        formula.waitMinutes != null ? `${formula.waitMinutes} dk` : null,
        formula.result,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'formül bekliyor';
}

/**
 * Kilit VERİDEN geliyor: adisyon kasaya gittiyse formül okunur.
 * Saklanan bir "kilitli" bayrağı bir gün gerçekle ayrışırdı.
 */
export function isLocked(visit: { is_paid?: boolean | null; status?: string | null }): boolean {
    return visit.is_paid === true || visit.status === 'completed';
}

/** Formül sayfasının hangi yüzü açılacak. */
export type FormulaMode = 'edit' | 'new' | 'locked' | 'lockedEmpty';

export function modeOf(visit: {
    is_paid?: boolean | null;
    status?: string | null;
    formula?: VisitFormula | null;
}): FormulaMode {
    const locked = isLocked(visit);
    if (locked) return visit.formula ? 'locked' : 'lockedEmpty';
    return visit.formula ? 'edit' : 'new';
}

/**
 * Geçmiş satırının işareti. Üç hâl:
 *
 *   'formül'      — kaydı var, dokunmak açar
 *   'formül yok'  — malzeme geçmiş ama yazılmamış; dokunmak yazmayı başlatır
 *   null          — boya işi geçmemiş; satır düz, chevron yok
 *
 * Yokluğun işareti varlığınkinden SESSİZ olduğu için liste kirlenmiyor.
 */
export function historyMark(row: {
    hasFormula: boolean;
    hadMaterial?: boolean;
    status?: string | null;
}): 'formül' | 'formül yok' | null {
    if (row.hasFormula) return 'formül';
    // Gelmemiş randevuda formül YOK — ortada işlem yok, yazılacak bir şey de.
    if (row.status === 'no_show' || row.status === 'cancelled') return null;
    return row.hadMaterial ? 'formül yok' : null;
}

/** Bekleme metni: ölçüldüyse kaynağını da söylüyor. */
export function waitLabel(formula: VisitFormula | null | undefined): string | null {
    if (!formula || formula.waitMinutes == null) return null;
    return `${formula.waitMinutes} dk`;
}
