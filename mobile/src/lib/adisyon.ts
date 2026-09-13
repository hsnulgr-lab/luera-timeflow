/**
 * Personel 13 — adisyonun kalemleri. Saf karar katmanı.
 *
 * Bu dosyada React yok, react-native yok: Node testleri doğrudan buraya
 * bakıyor. Ekranlar yalnız çiziyor.
 *
 * Turun sebebi şuydu: adisyon yalnız BÜYÜYEBİLİYORDU. Eklenen kalem
 * silinemiyor, miktarı değişmiyor, ikinci kez eklenince `×2` olmuyor —
 * ikinci bir satır açıyordu. Ve buradaki bir hata üç yere birden gidiyor:
 * müşterinin ödeyeceği tutar, depodan düşen malzeme ve FORMÜLÜN MALZEME
 * YARISI. İlk ikisi aynı gün fark ediliyor; üçüncüsü altı ay sonra, yanlış
 * formül olarak.
 */

export type LineKind = 'extra' | 'product' | 'material';

export interface AdisyonLine {
    id: string;
    /**
     * Kalemin KATALOGTAKİ kimliği — sunucuya gidecek olan tek şey.
     *
     * Sunucu adı ve fiyatı kendi kataloğundan çözüyor; istemcinin
     * gönderdiğine güvenmek, elle atılan bir isteğin kasadaki toplamı
     * değiştirebilmesi demek (`staff-api` · visit.items). O yüzden satır
     * ADI DEĞİL kimliği taşımak zorunda.
     *
     * İsteğe bağlı, çünkü sunucudan gelen eski adisyon satırlarında kimlik
     * olmayabiliyor. Kimliksiz satır gönderilemez ve çağıran taraf bunu
     * bilmek zorunda — sessizce atılmıyor.
     */
    catalogId?: string;
    name: string;
    kind: LineKind;
    /** Malzemenin fiyatı YOK: depodan düşüyor, müşteriye yazılmıyor. */
    price?: number;
    qty: number;
    /**
     * Silme penceresi açık. Satır listede DURUYOR — yeri korunuyor ki geri
     * alınca liste zıplamasın ve kalan satırlar hiç yer değiştirmesin.
     */
    pendingDelete?: boolean;
}

/**
 * Sunucudan gelen adisyonu ekranın satırlarına çevirir.
 *
 * Kumanda bugüne kadar SABİT dört kalemle açılıyordu (`DEFAULT_LINES`): hangi
 * randevu açılırsa açılsın aynı kaş alma, aynı saç bakım yağı. Canlıda o,
 * müşterinin adisyonuna girmediği kalemleri göstermek demek.
 *
 * Kimlik `productId`/`serviceId`ten alınıyor — sunucunun yazdığı şekil bu.
 * Kimliksiz eski satırlar da okunuyor ama GÖNDERİLEMİYOR; ayrımı `sendableOf`
 * yapıyor.
 */
export function linesFromItems(items: unknown): AdisyonLine[] {
    if (!Array.isArray(items)) return [];
    return items.flatMap((raw, index) => {
        const item = raw as Record<string, unknown>;
        const kind = item.kind;
        if (kind !== 'extra' && kind !== 'product' && kind !== 'material') return [];
        const name = String(item.name ?? '').trim();
        if (!name) return [];
        const catalogId = kind === 'extra' ? item.serviceId : item.productId;
        const qty = Number(item.qty);
        return [{
            id: String(item.id ?? `s${index}`),
            ...(typeof catalogId === 'string' && catalogId ? { catalogId } : {}),
            name,
            kind,
            // Malzemenin fiyatı taşınmıyor: depodan düşüyor, müşteriye yazılmıyor.
            ...(kind !== 'material' && typeof item.price === 'number' ? { price: item.price } : {}),
            qty: Number.isFinite(qty) && qty > 0 ? Math.min(QTY_MAX, Math.round(qty)) : 1,
        }];
    });
}

/**
 * Sunucuya gidecek kalemler — ve GİDEMEYENLER.
 *
 * Sunucu kalemi yalnız katalog kimliğinden çözüyor; kimliği olmayan bir satır
 * `invalid_catalog_item` ile TÜM isteği reddediyor. O yüzden ayrım burada
 * yapılıyor ve çağıran taraf kaç satırın gidemediğini ÖĞRENİYOR — sessizce
 * atmak, personelin yazdığı kalemin kaybolması demek.
 *
 * Silinmek üzere işaretli satır da gitmiyor: pencere kapanmadan gönderilen
 * bir silme, geri almayı anlamsız kılardı.
 */
export function sendableOf(lines: readonly AdisyonLine[]): {
    items: { kind: LineKind; productId?: string; serviceId?: string; qty: number }[];
    skipped: number;
} {
    const live = lines.filter((line) => !line.pendingDelete);
    const items = live.filter((line) => line.catalogId).map((line) => ({
        kind: line.kind,
        ...(line.kind === 'extra'
            ? { serviceId: line.catalogId as string }
            : { productId: line.catalogId as string }),
        qty: line.qty,
    }));
    return { items, skipped: live.length - items.length };
}

/** Sıra sabit ve her yerde aynı; tür bir kategori, bir hâl değil. */
export const KIND_ORDER: readonly LineKind[] = ['extra', 'product', 'material'];

/** Grup BAŞLIĞI — büyük harf, aralıklı. */
export const KIND_LABEL: Record<LineKind, string> = {
    extra: 'EK HİZMET',
    product: 'ÜRÜN',
    material: 'MALZEME',
};

/**
 * Satırın altındaki tür — cümle harfi.
 *
 * Başlıkla aynı register'da yazılınca ekranda aynı kelime iki kez ve aynı
 * sesle görünüyordu: "EK HİZMET" başlığının altında yine "EK HİZMET".
 * Tekrar kaldırılmıyor (satır grubundan koparıldığında da türünü söylemeli)
 * ama SESİ düşüyor: başlık bağırıyor, satır fısıldıyor.
 */
export const KIND_NAME: Record<LineKind, string> = {
    extra: 'Ek hizmet',
    product: 'Ürün',
    material: 'Malzeme',
};

/**
 * Silme penceresi — Personel 11'in dili birebir geçerli: altı saniye, fitil,
 * "Geri al". Tek fark, pencerenin ekranın altında değil SATIRIN KENDİ YERİNDE
 * durması.
 *
 * Pencere kapanana kadar `visit.items` çağrılmıyor: geri alma bir sunucu ucu
 * istemiyor, çünkü o altı saniyede istek hiç gönderilmedi.
 */
export const DELETE_MS = 6000;

/** Miktar tabanı 1: altındaki adım silme demek ve silmenin kendi kontrolü var. */
export const QTY_MIN = 1;
/** Üst sınır bir kural değil, kaza koruması — 20 tüp boya bir yazım hatasıdır. */
export const QTY_MAX = 20;

/** İki kalem AYNI mı? Ad ve tür eşleşiyorsa aynı satırdır. */
function same(line: AdisyonLine, item: { name: string; kind: LineKind; catalogId?: string }): boolean {
    if (line.kind !== item.kind) return false;
    // Kimlik VARSA o karar veriyor: aynı adı taşıyan iki ayrı katalog kalemi
    // (bir salonun iki tedarikçiden aynı boyası) tek satırda birleşmemeli.
    if (line.catalogId && item.catalogId) return line.catalogId === item.catalogId;
    return line.name === item.name;
}

/**
 * Kalem ekleme — ikinci dokunuş `×2` yapıyor, ikinci satır AÇMIYOR.
 *
 * Veri modeli miktarı zaten taşıyor ve boyada miktar ölçünün kendisi:
 * "iki tüp" ile "bir tüp" farklı formül. Aynı kalemin iki ayrı satırı ise
 * altı ay sonra okuyan kişiye hata gibi görünür.
 *
 * Silinmek üzere olan satır eşleşme sayılmıyor: personel bir kalemi
 * kaldırıp aynısını yeniden eklediyse, niyeti onu geri getirmek değil.
 */
export function addLine(
    lines: readonly AdisyonLine[],
    item: { name: string; kind: LineKind; price?: number; catalogId?: string },
    id: string,
): AdisyonLine[] {
    const at = lines.findIndex((line) => same(line, item) && !line.pendingDelete);
    if (at >= 0) {
        const next = [...lines];
        next[at] = { ...next[at], qty: Math.min(QTY_MAX, next[at].qty + 1) };
        return next;
    }
    return [...lines, {
        id,
        ...(item.catalogId ? { catalogId: item.catalogId } : {}),
        name: item.name,
        kind: item.kind,
        price: item.price,
        qty: 1,
    }];
}

/** Eklemenin sonucu: satır yeni mi açıldı, yoksa miktarı mı arttı? */
export function addResult(
    lines: readonly AdisyonLine[],
    item: { name: string; kind: LineKind; catalogId?: string },
): { merged: boolean; qty: number } {
    const found = lines.find((line) => same(line, item) && !line.pendingDelete);
    return found
        ? { merged: true, qty: Math.min(QTY_MAX, found.qty + 1) }
        : { merged: false, qty: 1 };
}

/** Miktar adımı. Sınırda `null` — çağıran düğmeyi söndürüyor, gizlemiyor. */
export function stepQty(qty: number, dir: 1 | -1): number | null {
    const next = qty + dir;
    if (next < QTY_MIN || next > QTY_MAX) return null;
    return next;
}

export function setQty(lines: readonly AdisyonLine[], id: string, qty: number): AdisyonLine[] {
    return lines.map((line) => (line.id === id
        ? { ...line, qty: Math.max(QTY_MIN, Math.min(QTY_MAX, qty)) }
        : line));
}

/** Silme penceresini açar — satır listede kalıyor, yeri korunuyor. */
export function markDelete(lines: readonly AdisyonLine[], id: string): AdisyonLine[] {
    return lines.map((line) => (line.id === id ? { ...line, pendingDelete: true } : line));
}

/**
 * Geri alma: satır aynı yere dönüyor — ve AYNI satır olarak.
 *
 * Bayrak `false` yapılmıyor, tamamen siliniyor: geri alınan kalem, hiç
 * silinmemiş bir kalemden ayırt edilemez olmalı. Yoksa satır kendi üstünde
 * görünmez bir iz taşır ve bir gün "bir kez silinmişti" diye davranan bir
 * kural yazılır.
 */
export function undoDelete(lines: readonly AdisyonLine[], id: string): AdisyonLine[] {
    return lines.map((line) => {
        if (line.id !== id) return line;
        const rest = { ...line };
        delete rest.pendingDelete;
        return rest;
    });
}

/** Pencere kapandı: kalem gerçekten gidiyor ve liste ancak ŞİMDİ gönderiliyor. */
export function commitDelete(lines: readonly AdisyonLine[], id: string): AdisyonLine[] {
    return lines.filter((line) => line.id !== id);
}

/** Sunucuya gidecek liste — silinmek üzere olanlar HENÜZ dahil. */
export function liveLines(lines: readonly AdisyonLine[]): AdisyonLine[] {
    return lines.filter((line) => !line.pendingDelete);
}

/** Türe göre gruplar, sıra sabit. Boş grup çizilmiyor. */
export function groupsOf(lines: readonly AdisyonLine[]): {
    kind: LineKind; label: string; items: AdisyonLine[]; count: number;
}[] {
    return KIND_ORDER
        .map((kind) => {
            const items = lines.filter((line) => line.kind === kind);
            return {
                kind,
                label: KIND_LABEL[kind],
                items,
                // Sayı silinecekleri saymıyor: pencere açıkken başlık zaten
                // yeni sayıyı söylüyor, geri alınca eskisine dönüyor.
                count: items.filter((line) => !line.pendingDelete).length,
            };
        })
        .filter((group) => group.items.length > 0);
}

/**
 * Adisyon şeridinin iki satırı.
 *
 * Sıfırın kendi cümlesi var: "son eklenen kalem" satırının söyleyeceği bir şey
 * olmadığı için satır cümleye dönüyor. Tutar maskesi de çizilmiyor — sıfır
 * lirayı üç noktayla saklamak sahte bir gizlilik.
 */
export function stripOf(lines: readonly AdisyonLine[], lastName: string | null): {
    count: number; head: string; tail: string; money: boolean;
} {
    const live = liveLines(lines);
    if (live.length === 0) {
        return { count: 0, head: 'Adisyon · boş', tail: 'ilk kalem eklenmedi', money: false };
    }
    return {
        count: live.length,
        head: `Adisyon · ${live.length} kalem`,
        tail: lastName ?? live[live.length - 1].name,
        money: true,
    };
}

/** Toplam — malzeme fiyatsız olduğu için toplama girmiyor. */
export function totalOf(lines: readonly AdisyonLine[]): number {
    return liveLines(lines).reduce((sum, line) => sum + (line.price ?? 0) * line.qty, 0);
}

/**
 * Silme penceresinin ikinci satırı.
 *
 * Malzeme silmek formülün malzeme yarısını değiştiriyor. Formül o yarıyı
 * adisyondan TÜRETİYOR, yani kayıt bozulmuyor — yeniden türüyor. Ama yazılmış
 * bir formül sessizce değişemez. Ek dokunuş yok, modal yok, engelleme yok.
 */
export function deleteNotice(
    line: Pick<AdisyonLine, 'kind'>,
    formulaWritten: boolean,
): { text: string; warn: boolean } {
    if (line.kind === 'material' && formulaWritten) {
        return { text: 'Formülün malzeme satırı da değişti.', warn: true };
    }
    return { text: 'Pencere kapanana kadar liste gönderilmiyor.', warn: false };
}

/** Geri al düğmesinin içindeki saniye — fitil dursa da bu sayıyor. */
export function secondsLeft(startedAt: number, now: number): number {
    return Math.max(0, Math.ceil((DELETE_MS - (now - startedAt)) / 1000));
}

/**
 * Tutar biçimi. `kumanda.tsx` içinde yerel bir sabit olarak duruyordu; satır
 * bileşeni ayrı dosyaya çıkınca ikinci bir kopya doğacaktı ve iki para
 * biçimi bir gün ayrışırdı.
 */
export const money = (value: number) => `₺${value.toLocaleString('tr-TR')}`;

// ── Katalog ve arama (Personel 13 · B) ──────────────────────────────────────
//
// Gerçek bir salonun kataloğu yüzlerce kalem; ekranda altı kutu var. Ölçek
// YERLEŞİME değil SIRALAMAYA biniyor: yüzey her salonda birebir aynı, değişen
// yalnız kutuların içi. Kalanı iki harfle aramada.
//
// Buradaki tehlike adların birbirine benzemesi: 7.3 · 7.31 · 7.34 · 8.3 · 6.3.
// Yanlışını seçmek para ve stokta aynı gün fark edilir; formülde ALTI AY SONRA,
// saçın yanlış çıkması olarak.

export interface CatalogItem {
    id: string;
    name: string;
    kind: LineKind;
    price?: number;
    /** Bu müşteride daha önce kullanıldı — kararı veren tek işaret. */
    usedHere?: boolean;
}

/**
 * Adın içindeki sayı belirteci ("7.31 kumral" → "7.31").
 *
 * Katalogdan gelen ad DEĞİŞTİRİLMİYOR; ekran yalnız kodu önce alıp tabular
 * rakamla diziyor, böylece yakın kodlar aynı x'te başlayıp sütun olarak
 * okunuyor ve farklı uzunluk farklı uzunluk olarak görünüyor.
 *
 * Sayı bulunamayan adlarda sütun yok — satır adla başlıyor. Yakın kodlar
 * zaten yalnız kodlu kalemlerde var.
 */
export function splitCode(name: string): { code: string | null; rest: string } {
    const match = /(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s|$)/.exec(name);
    if (!match) return { code: null, rest: name };
    const code = match[1];
    const rest = (name.slice(0, match.index) + name.slice(match.index + match[0].length))
        .replace(/^[\s·]+|[\s·]+$/g, '')
        .replace(/\s{2,}/g, ' ');
    return { code, rest };
}

const fold = (value: string) => value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

/**
 * Eşleşme BULANIK DEĞİL ve ORTADAN da tutmuyor.
 *
 * İki ayrı kural, çünkü iki ayrı şey aranıyor:
 *   kod → ÖNEK. `7.3` yazınca `7.31` geliyor, `8.3` gelmiyor.
 *   ad  → KELİME BAŞI. `kum` yazınca "kumral" geliyor, "açık kumral" da
 *         geliyor (ikinci kelimenin başı), ama "okumak" gelmiyor.
 *
 * Ortadan tutan bir eşleşme (`includes`) tam olarak yanlış şeyi yapardı:
 * yakın kodları bir araya getirip aralarından seçtirmek, korunmaya çalışılan
 * hatanın kendisi.
 */
export function catalogMatch(item: CatalogItem, query: string): boolean {
    const q = fold(query);
    if (!q) return true;
    const { code } = splitCode(item.name);
    // Sorgu sayıyla başlıyorsa aranan şey KOD.
    if (/^\d/.test(q)) return code != null && code.startsWith(q);
    return fold(item.name).split(/[\s·]+/).some((word) => word.startsWith(q));
}

export function searchCatalog(catalog: readonly CatalogItem[], query: string): CatalogItem[] {
    return catalog.filter((item) => catalogMatch(item, query));
}

/**
 * Vurgu TERS.
 *
 * Alışkanlık eşleşen kısmı koyu yazmaktır; burası tersini yapıyor. Eşleşen
 * kısım ORTAK olan, yani bilgi taşımayan kısım — `7.3` sönük, ayıran hane
 * koyu. Ekranda en parlak şey satırları birbirinden ayıran şey oluyor.
 */
export function emphasise(text: string, query: string): { dim: string; bold: string }[] {
    const q = fold(query);
    if (!q) return [{ dim: '', bold: text }];
    const at = fold(text).indexOf(q);
    if (at < 0) return [{ dim: '', bold: text }];
    return [
        { dim: text.slice(0, at + q.length), bold: text.slice(at + q.length) },
    ];
}

/** Aramanın boş sonucu bir hâl: katalogda olmayan kalem yazılabiliyor. */
export function searchState(results: readonly CatalogItem[], query: string):
    'idle' | 'results' | 'none' {
    if (!query.trim()) return 'idle';
    return results.length > 0 ? 'results' : 'none';
}

/**
 * Katalog dışı kalem — fiyatsız gidiyor, tutarını kasada müdür yazıyor.
 *
 * Fiyat bu ekranda değişmiyor (maske + klavye + yetki, üçü bir arada bu
 * yüzeye sığmıyor), ama iskonto da kaybolmuyor: karar veren yer değişiyor.
 */
export function freeItem(name: string, kind: LineKind = 'material'): CatalogItem {
    return { id: `free:${name}`, name: name.trim(), kind };
}

// ── Sıklık: ölçek SIRALAMAYA biniyor (Personel 13 · C) ──────────────────────

/** Geçmiş adisyonlardan türeyen kullanım kaydı. Uydurulan bir şey yok. */
export interface UsageRow {
    name: string;
    /** Hangi hizmette kullanıldı — sıralamanın girdisi bu. */
    service: string;
    /** Kim kullandı; boşsa salonun kaydı. */
    staffId: string | null;
    /** Hangi gün — "gün içinde donuk" kuralı buradan işliyor. */
    dateISO: string;
    count: number;
}

/** Kutu sayısı SABİT altı. Yedincisi yükselirse listeye giren biri çıkıyor. */
export const FREQUENT_COUNT = 6;

export type FreqSource = 'staff' | 'salon' | 'none';

/**
 * Sıralama GÜN İÇİNDE DONUK.
 *
 * Bugünün kayıtları hesaba katılmıyor: bir tuhaf ziyaret öğleden sonra
 * kutuları oynatmamalı. Konumun sabitliği hızın kendisi — personel aynı işi
 * haftada onlarca kez yapıyor ve altı kutu pratikte hep aynı altı kutu.
 */
export function usageAsOf(rows: readonly UsageRow[], todayISO: string): UsageRow[] {
    return rows.filter((row) => row.dateISO < todayISO);
}

/**
 * Kutudaki altı kalem.
 *
 * Sıralama randevunun HİZMETİNE bağlı — bu personelin geçmiş adisyonlarından.
 * Müşteriye göre sıralama reddedildi: müşteri her randevuda değişir, liste her
 * açılışta karışır, ezber ölür. Müşteri bilgisi sıralamaya değil İŞARETE
 * gidiyor (`usedHere`).
 *
 * Personelin verisi yoksa salonun aynı hizmetteki geçmişi kullanılıyor ve
 * etiket kaynağı söylüyor. Salonun da yoksa ızgara ÇİZİLMİYOR: altı boş kutu
 * ölü kontroldür.
 */
export function frequentFor(
    catalog: readonly CatalogItem[],
    usage: readonly UsageRow[],
    opts: { service: string; staffId: string; limit?: number },
): { items: CatalogItem[]; source: FreqSource; label: string } {
    const limit = opts.limit ?? FREQUENT_COUNT;
    const pick = (rows: readonly UsageRow[]) => {
        const score = new Map<string, number>();
        for (const row of rows) score.set(row.name, (score.get(row.name) ?? 0) + row.count);
        return catalog
            .filter((item) => score.has(item.name))
            .sort((a, b) => (score.get(b.name) ?? 0) - (score.get(a.name) ?? 0))
            .slice(0, limit);
    };

    const forService = usage.filter((row) => row.service === opts.service);
    const mine = pick(forService.filter((row) => row.staffId === opts.staffId));
    if (mine.length > 0) return { items: mine, source: 'staff', label: `${opts.service} işinde` };

    const salon = pick(forService);
    if (salon.length > 0) {
        return { items: salon, source: 'salon', label: `salonda · ${opts.service} işinde` };
    }
    return { items: [], source: 'none', label: '' };
}

/**
 * Ekrandaki liste, sunucudan gelenden FARKLI mı?
 *
 * Kumandanın "adisyon başka bir cihazda değişti" uyarısı, personele
 * tazelemenin NEYE mal olacağını söylemek zorunda: göndermediği kalemler
 * varsa onlar gidecek. "Bir şey kaybetmeyeceksin" ile "yazdıklarını yeniden
 * gir" aynı cümle olamaz.
 *
 * Karşılaştırma SİLİNMEYİ BEKLEYENİ de sayıyor: satır ekranda duruyor ama
 * personel onu kaldırmaya karar vermiş; tazeleme o kararı da geri alır.
 *
 * Sıra ÖNEMSİZ, kimlik önemli: sunucu kalemleri kendi sırasıyla dönebiliyor
 * ve sırf sıra değişti diye "yerel düzenlemen var" demek yanlış alarm olurdu.
 */
export function linesDiffer(
    local: readonly AdisyonLine[],
    server: readonly AdisyonLine[],
): boolean {
    const key = (line: AdisyonLine) => `${line.kind}:${line.catalogId ?? line.name}:${line.qty}`;
    // Silinmeyi bekleyen satır SAYILMIYOR — çünkü personel onu kaldırmaya
    // karar verdi ve tazeleme o kararı geri alacak. Ayrı bir kontrol gerekmez:
    // satır listeden düştüğü an uzunluklar ayrışıyor ve fark zaten görülüyor.
    // (Ayrı bir `pendingDelete` kapısı yazılmıştı; mutasyon onun hiçbir yeni
    // durum yakalamadığını gösterdi — sunucuda olmayan bir satırın silinmesi
    // zaten hiçbir şey kaybettirmiyor.)
    const mine = local.filter((line) => !line.pendingDelete).map(key).sort();
    const theirs = server.map(key).sort();
    if (mine.length !== theirs.length) return true;
    return mine.some((value, index) => value !== theirs[index]);
}
