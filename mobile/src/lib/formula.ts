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
    /** Sonucun ikinci ekseni — isteğe bağlı, çoklu. Bkz. `TONES`. */
    tags?: string[];
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

/**
 * Izgaradaki ÜÇ kutu — salonda pratikte kullanılan oranlar.
 *
 * Dördüncü kutu yok ve olmayacak: seyrek bir değer, sık kararın 68 puntosunu
 * alamaz. Liste dışı oran ızgarayı büyütmeden giriliyor — bir kutu seçilince
 * altında beliren `± 0,5` satırıyla (bkz. `stepRatio`). Varsayılan yerleşim
 * bu yüzden tek punto büyümüyor.
 */
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
 *
 * `missed` — adisyon kasaya gitti ve formül hiç yazılmadı. `pending`den
 * AYRI olmak zorunda: "bekliyor" hâlâ yazılabileceğini söylüyor ve amber bir
 * çağrı kuruyor, oysa kilit düştüğü an o kapı kapandı. Kayıtta bir boşluk
 * var ve başlık bunu bir davet değil, bir OLGU olarak söylüyor.
 */
export type GroupState = 'none' | 'pending' | 'done' | 'missed';

export function groupState(
    items: readonly FormulaSourceItem[] | null | undefined,
    formula: VisitFormula | null | undefined,
    locked = false,
): GroupState {
    if (!hasMaterial(items)) return 'none';
    if (isComplete(formula)) return 'done';
    return locked ? 'missed' : 'pending';
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
export function summaryOf(formula: VisitFormula | null | undefined, locked = false): string {
    // Kilitliyken "bekliyor" YALAN: bekleyen bir şey yok, kapı kapandı.
    if (!formula) return locked ? 'formül yazılmadı' : 'formül bekliyor';
    const parts = [
        formula.ratio,
        formula.waitMinutes != null ? `${formula.waitMinutes} dk` : null,
        formula.result,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : (locked ? 'formül yazılmadı' : 'formül bekliyor');
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

// ── Personel 12 · adım, karşılaştırma ve borç ───────────────────────────────
//
// Bu bölümün tamamı SAF: React yok, react-native yok. Ekranlar yalnız
// çiziyor, karar burada veriliyor ve Node testleri buraya doğrudan bakıyor.

/**
 * Oranın ikinci terimi SÜREKLİ bir eksen — kolorist "biraz daha oksidan"
 * diye düşünüyor. Birinci terim hep 1.
 *
 * Liste dışı oran artık serbest nota DEĞİL `formula.ratio`'ya yazılıyor.
 * Eskiden nota gidiyordu ve sonuç şuydu: `1:2,5` kullanılan ziyarette bir
 * sonraki sefer "geçen sefer 1:2" yazıyordu — üstelik tam da hatırlanmaya
 * en değer ziyarette, olağandışı olanda.
 */
export const RATIO_STEP = 0.5;
export const RATIO_MIN = 1;
export const RATIO_MAX = 3;

/** `'1:1,5'` → `1.5`. Türkçe ondalık ayracı virgül. */
export function ratioValue(ratio: string | null | undefined): number | null {
    const match = /^1:(\d+(?:,\d+)?)$/.exec((ratio ?? '').trim());
    if (!match) return null;
    const n = Number(match[1].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

/** `1.5` → `'1:1,5'`. Tam sayı virgülsüz yazılıyor: `1:2`, `1:2,5` değil. */
export function ratioLabel(value: number): string {
    const rounded = Math.round(value * 2) / 2;
    return `1:${Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')}`;
}

/** Sınırda `null` döner — çağıran düğmeyi söndürür, gizlemez. */
export function stepRatio(ratio: string | null | undefined, dir: 1 | -1): string | null {
    const value = ratioValue(ratio);
    if (value == null) return null;
    const next = Math.round((value + dir * RATIO_STEP) * 2) / 2;
    if (next < RATIO_MIN || next > RATIO_MAX) return null;
    return ratioLabel(next);
}

/** 5 dakika = sayacın gerçek çözünürlüğü; ara değer uydurulmuyor. */
export const WAIT_STEP = 5;
export const WAIT_MIN = 5;
export const WAIT_MAX = 90;

export function stepWait(minutes: number | null | undefined, dir: 1 | -1): number | null {
    if (minutes == null) return null;
    const next = minutes + dir * WAIT_STEP;
    if (next < WAIT_MIN || next > WAIT_MAX) return null;
    return next;
}

/** Liste dışı değer hangi kutudan çıkıldığını gösteriyor. */
export const offList = {
    ratio: (ratio: string | null | undefined) => Boolean(ratio) && !RATIOS.includes(ratio as never),
    wait: (minutes: number | null | undefined) =>
        minutes != null && !WAITS.includes(minutes as never),
};

/**
 * Sonucun İKİNCİ ekseni. Üç kelime tek eksende doğru: DERİNLİK.
 * "Turuncumsu" ve "eşit çıkmadı" o eksende değil — üçe eklemek listeyi
 * altıya çıkarıp ilk kararı bulanıklaştırırdı. Ayrı bir alan, ayrı bir
 * satır, ve yalnız sonuç seçildikten SONRA çiziliyor.
 */
export const TONES = ['turuncu', 'eşitsiz'] as const;

/** Geçmiş formülün üç hâli — üçü ayrı cümle, hiçbiri boş alan değil. */
export type HistoryState = 'var' | 'ilk' | 'yok';

export function historyState(previous: VisitFormula | null | undefined, everVisited: boolean): HistoryState {
    if (previous) return 'var';
    // "Geçmiş yok" ile "geçmişte formül yazılmamış" AYNI ŞEY DEĞİL.
    return everVisited ? 'yok' : 'ilk';
}

/**
 * Alanın etiket satırı — karşılaştırma bu turda burada yaşıyor.
 *
 * Kaydırılabilir bir geçmiş şeridi reddedildi: dört alanın üstüne beşinci
 * bir bölge kurar ve karşılaştırmayı hafızaya bırakırdı. Değer alanın KENDİ
 * etiketinde durursa göz hiç yer değiştirmiyor.
 *
 * Fark MUTLAK yazılıyor, delta değil — ta ki seçim yapılana kadar: `+5 dk`
 * demek için ikinci bir değer gerekiyor.
 */
export function fieldCompare(
    state: HistoryState,
    previous: string | null,
    current: string | null,
): { text: string; strong: boolean } {
    if (state === 'ilk') return { text: 'ilk ziyaret', strong: false };
    if (state === 'yok') return { text: 'karşılaştırma yok', strong: false };
    if (!previous) return { text: '', strong: false };
    if (!current) return { text: `geçen sefer ${previous}`, strong: false };
    // Tekrar da bir karardır: "aynı" bir bilgi, boşluk değil.
    if (current === previous) return { text: 'geçen seferle aynı', strong: true };
    return { text: `${previous} → ${current}`, strong: true };
}

/**
 * Sayaç satırı personelin BORCUNU sayıyor.
 *
 * Eskiden `2 alan dolu geldi` yazıyordu ve sabitti — sayaç kurulmadığında
 * bile "2" diyordu. Malzemeyi saymıyor (personelin girdisi değil), notu
 * saymıyor (isteğe bağlı), sayaç kurulduysa beklemeyi saymıyor.
 */
export function debtLine(
    sel: { ratio?: string | null; result?: string | null; wait?: number | null },
    timerRan: boolean,
): string {
    const left = (sel.ratio ? 0 : 1) + (sel.result ? 0 : 1) + (timerRan ? 0 : (sel.wait != null ? 0 : 1));
    if (left === 0) return 'dört alan hazır';
    return `${['', 'bir', 'iki', 'üç'][left]} alan kaldı`;
}

/**
 * Kaydet düğmesinin TEK kural tablosu — iki yüzeyde de aynı.
 *
 * "Şimdilik böyle kaydet" kaldırıldı: tutulamayan sözü etiketin kendisi
 * veriyordu. Adisyon kasaya gidince boşluk KALICI oluyor ve "şimdilik" bir
 * gelecek vaat ediyordu. Yerine olgu, altında imkânın kendisi.
 */
export function saveLabel(
    written: boolean,
    sel: { ratio?: string | null; result?: string | null; wait?: number | null },
    timerRan: boolean,
): { label: string; note: string | null } {
    if (written) return { label: 'Düzeltmeyi kaydet', note: null };
    const full = Boolean(sel.ratio && sel.result && (timerRan || sel.wait != null));
    if (full) return { label: 'Formülü kaydet', note: null };
    return {
        label: 'Eksik hâliyle kaydet',
        note: 'Kasaya gitmeden düzeltilebilir; sonrası okunur.',
    };
}

/**
 * Gönderme güvertesindeki uyarı — kapı orada kapanıyor, cümle de orada.
 *
 * `window` boyunca duruyor: o altı saniyede HİÇBİR ŞEY gönderilmedi ve
 * "Geri al" ekranda, yani cümle hâlâ doğru ve hâlâ eyleme çevrilebilir.
 * `going`de düşüyor — karar verildi. Metin `idle` ve `window`da aynı:
 * fitil koşarken kelimeleri değiştirmek okumayı bozar.
 */
export function sendWarning(
    sendState: string,
    formula: VisitFormula | null | undefined,
    items: readonly FormulaSourceItem[] | null | undefined,
): string | null {
    if (sendState !== 'idle' && sendState !== 'window') return null;
    if (!hasMaterial(items)) return null;
    if (isComplete(formula)) return null;
    return 'Formül eksik. Oran ve sonuç yazılmadı; kasaya gidince bu boşluk kalıcı olur.';
}
