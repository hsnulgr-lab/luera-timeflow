/**
 * Personel 09 — müşteri SAYFASININ karar katmanı.
 *
 * Saf: RN ve Expo yok. `customerBook` defterin LİSTESİ, bu dosya bir kişinin
 * SAYFASI. İkisi aynı kimlik uzayını paylaşıyor (`demoBook` → `c1..c10`),
 * çünkü listeden sayfaya geçiş o kimlikle oluyor.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Sayfa bugüne kadar `customerId`'yi HİÇ kullanmıyordu: gövdesinin tamamı tek
 * bir sabitten geliyordu ve hangi müşteriye basılırsa basılsın aynı kişinin
 * alerjisini, aynı telefonunu, aynı formülünü gösteriyordu. Yanlış kişinin
 * alerjisini göstermek, hiç göstermemekten kötüdür: personel ona güvenip
 * işlem yapar.
 *
 * ── Bulunamayan müşteri ──────────────────────────────────────────────────────
 * `null` dönüyor ve ekran "Müşteri bulunamadı" çiziyor. Uydurulmuş bir gövde
 * çizmiyor. Aynı kural Müdür 23'te de geçerli (`customerCard.findCustomer`).
 *
 * Sunucunun `customer` ucu bağlandığında bu dosyanın DEMO bloğu silinecek;
 * `CustomerFile` sözleşmesi ve türetmeler kalacak.
 */

import { agoLabel, demoBook, type BookCustomer } from './customerBook.ts';
import { addDaysISO, formatDayMonth } from './calendar.ts';
import type { VisitFormula } from './formula.ts';

/** Maskeli satır: risk ya da not. Etiket ve sayı okunur, metin gizli. */
export interface FileMask {
    label: string;
    sub: string;
    text: string;
}

/** Geçmiş satırının formül ayrıntısı — o satır açıldığında gösterilecek. */
export interface FileFormulaDetail {
    materials: string;
    ratio: string;
    wait: string;
    /** "ölçüldü · 11:17 – 11:52" — ölçülmediyse null. */
    waitSpan: string | null;
    result: string;
    tone: 'gr' | 'am';
    note: string | null;
}

export interface FileHistoryRow {
    /**
     * Ziyaretin (rezervasyonun) kimliği. Formül sayfası bunsuz KAYDEDEMEZ:
     * neye yazacağını bilmiyor. Sunucunun `customer` ucu bunu zaten dönüyor
     * (`history[].id`); demo katmanı onu birebir taklit ediyor.
     */
    id: string;
    /** "12 Mart" */
    date: string;
    service: string;
    formula: boolean;
    hadMaterial: boolean;
    status?: 'no_show';
    locked: boolean;
    who: string;
    initials: string;
    mine: boolean;
    minutes: number;
    detail: FileFormulaDetail | null;
    /**
     * Ziyaretin KAYITLI formülü, ham hâliyle.
     *
     * `detail` ekranın okuduğu METİN ('35 dk', bilinmiyorsa '—'); karşılaştırma
     * ise SAYI istiyor. İkisini tek alandan türetmek '—' → null çevirmesi
     * demekti ve o çeviri bir gün "bekleme yazılmadı" ile "bekleme sıfır
     * dakika"yı karıştırırdı.
     *
     * `formula` bayrağı duruyor çünkü liste onu ÜÇ yerde okuyor ve boolean
     * olarak okuyor; ikisi `toHistoryRow`ta tek kaynaktan doğuyor.
     */
    saved: VisitFormula | null;
    /**
     * Bu ziyarette geçen MALZEME — adı ve miktarıyla, adisyondan.
     *
     * `hadMaterial` ile birlikte okunuyor ve üçüncü bir hâl taşıyorlar:
     * malzeme geçmiş ama liste boşsa BİLİNMİYOR demek (sunucu o alanı
     * göndermiyor — eski dağıtım). "Malzeme geçmedi" ile "okunamadı" ayrı
     * şeyler ve ikincisini birincisi gibi çizmek, personele adisyonunda
     * olmayan bir boşluk gösterirdi.
     */
    materials: { name: string; qty: number }[];
}

/** "Son formül" kartı — geçmişteki EN YENİ formüllü ziyaretten türer. */
export interface FileFormula extends FileFormulaDetail {
    date: string;
    who: string;
    initials: string;
    mine: boolean;
}

export interface FilePackage {
    name: string;
    used: number;
    total: number;
    sub: string;
}

export interface CustomerFile {
    id: string;
    name: string;
    /** Tam numara. `null` = BİLİNMİYOR → arama ve mesaj devre dışı. */
    phone: string | null;
    /** "12 Mart" — hiç gelmediyse null. */
    lastVisit: string | null;
    /** "2 GÜN" — hiç gelmediyse null. */
    ago: string | null;
    lastService: string | null;
    lastStaff: string | null;
    lastStaffInitials: string;
    /** Geçmişten SAYILIR, ayrıca tutulmaz: iki sayı bir gün ayrışırdı. */
    visits: number;
    formulas: number;
    risk: FileMask | null;
    note: FileMask | null;
    formula: FileFormula | null;
    packages: FilePackage[];
    history: FileHistoryRow[];
}

// ── Demo defteri ────────────────────────────────────────────────────────────
//
// `customer` ucu bağlanana kadar. Kimlikler `demoBook` ile AYNI.
//
// Buradaki kişilerin çoğunun risk kaydı, formülü ve paketi YOK — ve bu
// bilinçli. Her müşteride alerji uyarısı çıkan bir demo, ekranın boş
// hâllerini hiç göstermez ve o hâller yazılmamış kalır.

interface DemoVisit {
    /** Bugünden geriye gün. */
    daysAgo: number;
    service: string;
    minutes: number;
    who: string;
    initials: string;
    mine: boolean;
    hadMaterial: boolean;
    status?: 'no_show';
    /**
     * Formül KAYDI var mı. `formula` (ayrıntı) verildiğinde zaten doğru;
     * ayrı durmasının sebebi defterden türeyen satır: defter "formülü var"
     * diyor ama ayrıntıyı taşımıyor. O satır formüllü görünüp ayrıntısız
     * açılıyor — ayrıntıyı uydurmak, olmayan bir reçeteyi varmış gibi
     * göstermek olurdu.
     */
    hasFormula?: boolean;
    formula?: FileFormulaDetail;
}

interface DemoExtra {
    /** Son dört hane `demoBook.phoneTail` ile UYUŞMALI. */
    phone?: string;
    risk?: FileMask;
    note?: FileMask;
    packages?: FilePackage[];
    visits?: DemoVisit[];
}

const ELIF_FORMULA: FileFormulaDetail = {
    materials: '7.3 kumral + %6',
    ratio: '1:1,5',
    wait: '35 dk',
    waitSpan: 'ölçüldü · 11:17 – 11:52',
    result: 'tuttu',
    tone: 'gr',
    note: 'Uçlar gözenekli, son 10 dk’da erken yıkadım.',
};

const DEMO_EXTRAS: Record<string, DemoExtra> = {
    // Tasarımın karşılaştırma kişisi — 09'un ölçüleri bu sayfayla alındı.
    c4: {
        phone: '05324619033',
        risk: {
            label: 'Risk · Alerji',
            sub: '1 kural',
            text: 'Boya alerjisi bildirildi. Kulak arkası testi şart.',
        },
        note: {
            label: 'Not',
            sub: '2 satır',
            text: 'Kökte 7.3, uçlarda 8.1. Geçen sefer kaşınma oldu; bekleme 30 dk’yı geçmesin.',
        },
        packages: [{ name: 'Keratin bakım', used: 4, total: 8, sub: 'son kullanım 12 Mart' }],
        visits: [
            { daysAgo: 2, service: 'Saç boyama + fön', minutes: 112, who: 'Selin Demir', initials: 'SD', mine: true, hadMaterial: true, formula: ELIF_FORMULA },
            { daysAgo: 14, service: 'Kesim', minutes: 40, who: 'Merve Kaya', initials: 'MK', mine: false, hadMaterial: false },
            { daysAgo: 28, service: 'Fön', minutes: 30, who: 'Merve Kaya', initials: 'MK', mine: false, hadMaterial: false },
            {
                daysAgo: 69, service: 'Dip boya', minutes: 95, who: 'Merve Kaya', initials: 'MK', mine: false, hadMaterial: true,
                formula: { materials: '6.0 koyu kumral + %3', ratio: '1:1', wait: '30 dk', waitSpan: null, result: 'koyu çıktı', tone: 'am', note: null },
            },
            { daysAgo: 84, service: 'Fön', minutes: 30, who: 'Merve Kaya', initials: 'MK', mine: false, hadMaterial: false },
            {
                daysAgo: 118, service: 'Röfle', minutes: 130, who: 'Selin Demir', initials: 'SD', mine: true, hadMaterial: true,
                formula: { materials: '9.1 açıcı + %9', ratio: '1:2', wait: '45 dk', waitSpan: 'ölçüldü · 14:05 – 14:50', result: 'tuttu', tone: 'gr', note: null },
            },
            { daysAgo: 163, service: 'Röfle', minutes: 0, who: 'Selin Demir', initials: 'SD', mine: true, hadMaterial: true, status: 'no_show' },
            { daysAgo: 195, service: 'Keratin bakımı', minutes: 95, who: 'Merve Kaya', initials: 'MK', mine: false, hadMaterial: true },
        ],
    },
    // Riski YOK, formülü VAR — maskeli satırın hiç çizilmediği hâl.
    c2: {
        phone: '05324612018',
        note: { label: 'Not', sub: '1 satır', text: 'Ense kısa kalmasın, fön hep dışa dönük.' },
        visits: [
            {
                daysAgo: 0, service: 'Saç boyama + fön', minutes: 105, who: 'Merve Kaya', initials: 'MK', mine: true, hadMaterial: true,
                formula: { materials: '8.1 açık kumral + %6', ratio: '1:1,5', wait: '30 dk', waitSpan: 'ölçüldü · 10:20 – 10:50', result: 'tuttu', tone: 'gr', note: null },
            },
            { daysAgo: 41, service: 'Fön', minutes: 30, who: 'Merve Kaya', initials: 'MK', mine: true, hadMaterial: false },
        ],
    },
    // Ne riski ne formülü var; yalnız geçmişi. Kartsız sayfanın hâli.
    //
    // Ve tek AÇIK ziyaret burada: bugün, malzeme geçmiş, formül HENÜZ
    // yazılmamış. Bu birleşim olmadan formül sayfasının `new` modu hiçbir
    // yerden açılamıyordu — "olmayan formülü yaz" yolu demo içinde
    // ulaşılamaz kalıyordu ve tam da kaydetmenin sınandığı yol o.
    c3: {
        phone: '05331667741',
        visits: [
            { daysAgo: 0, service: 'Dip boya', minutes: 88, who: 'Selin Demir', initials: 'SD', mine: false, hadMaterial: true },
            { daysAgo: 33, service: 'Kesim + fön', minutes: 55, who: 'Selin Demir', initials: 'SD', mine: false, hadMaterial: false },
        ],
    },
    // Hamilelik — alerji dışında bir risk türü. Etiket rengi değil METİN anlatır.
    c5: {
        phone: '05429075514',
        risk: { label: 'Risk · Hamilelik', sub: '1 kural', text: 'Hamile. Amonyaklı boya ve kalıcı düzleştirme uygulanmıyor.' },
        visits: [
            { daysAgo: 3, service: 'Ombre', minutes: 140, who: 'Selin Demir', initials: 'SD', mine: false, hadMaterial: true },
        ],
    },
};

/**
 * Ekstrası olmayan müşterinin geçmişi DEFTERDEN türer.
 *
 * Uydurma değil: defter zaten "son geliş", "son iş", "formülü var mı" ve
 * "kim yaptı" diyor. Sayfa bunları ikinci kez uydurmak yerine aynı kaynaktan
 * okuyor — iki yerde tutulan aynı olgu bir gün ayrışırdı.
 */
function visitsFromBook(row: BookCustomer, todayISO: string): DemoVisit[] {
    if (!row.lastVisitDate) return [];
    const days = Math.max(0, Math.round(
        (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${row.lastVisitDate}T00:00:00Z`)) / 86_400_000,
    ));
    return [{
        daysAgo: days,
        service: row.lastService ?? 'Randevu',
        // Süre defterde YOK. 0 "ölçülmedi" demek, "sıfır dakika sürdü" değil.
        minutes: 0,
        // Defter yalnız BAŞ HARFİ taşıyor, adı değil. Baş harften bir ad
        // uydurmak yerine boş bırakılıyor; ekran o pili hiç çizmiyor.
        who: '',
        initials: row.lastStaffInitials,
        mine: row.mine,
        hasFormula: row.hasFormula,
        hadMaterial: row.hasFormula,
    }];
}

function toRow(customerId: string, visit: DemoVisit, todayISO: string): FileHistoryRow {
    // Burada bir YEREL DEPO katmanı vardı: "Kaydet" hiçbir yere yazmadığı
    // için, az önce yazılan formülü satırda göstermek üzere. Kayıt artık
    // sunucuya gidiyor ve dosya onu sunucudan okuyor; ikinci bir kaynak
    // tutmak, ikisinin bir gün ayrışması demekti.
    const id = `${customerId}-v${visit.daysAgo}`;
    return {
        id,
        date: formatDayMonth(addDaysISO(todayISO, -visit.daysAgo)),
        service: visit.service,
        formula: Boolean(visit.formula) || visit.hasFormula === true,
        hadMaterial: visit.hadMaterial,
        ...(visit.status ? { status: visit.status } : {}),
        // Geçmişteki her ziyaret kasaya gitmiş sayılır; bugünkü henüz değil.
        locked: visit.daysAgo > 0,
        who: visit.who,
        initials: visit.initials,
        mine: visit.mine,
        minutes: visit.minutes,
        detail: visit.formula ?? null,
        // Sahte defter ham formül TUTMUYOR (yalnız ekranın okuduğu metni), o
        // yüzden karşılaştırma sahte kipte çalışmıyor ve bunu SÖYLÜYOR.
        saved: null,
        materials: [],
    };
}

/** Kaydedilmiş formülü satırın taşıdığı ayrıntıya çevirir. */
export function detailOf(formula: VisitFormula): FileFormulaDetail {
    return {
        materials: formula.materials.map((item) => item.name).filter(Boolean).join(' + ') || '—',
        ratio: formula.ratio ?? '—',
        wait: formula.waitMinutes === null ? '—' : `${formula.waitMinutes} dk`,
        waitSpan: formula.waitSource === 'timer' ? 'ölçüldü' : null,
        result: formula.result ?? '—',
        // Renk KARARDAN çıkıyor, kaydın kendisinden değil: "tuttu" yeşil,
        // ötekiler amber. Saklanan bir renk bir gün metinle ayrışırdı.
        tone: formula.result === 'tuttu' ? 'gr' : 'am',
        note: formula.note,
    };
}

/**
 * Bir müşterinin sayfası. Bulunamazsa `null` — ekran "bulunamadı" çizer.
 *
 * Kimlik ÖNCE denenir. Ad yalnız KÖPRÜ: kumanda randevudan geliyor ve o
 * randevunun müşteri kimliği takvim kaynağının uzayında (`c-buket`), defterin
 * uzayında değil. Ad EŞSİZ değilse `null` dönüyor — iki "Elif Demir"den
 * birini seçmek, düzeltmeye çalıştığımız hatanın ta kendisi olurdu. Sunucu
 * bağlandığında bu köprü kalkacak; kimlik tek uzayda olacak.
 */
export function demoCustomerFile(
    query: { id?: string | null; name?: string | null },
    todayISO: string,
): CustomerFile | null {
    const book = demoBook(todayISO);

    let row: BookCustomer | null = null;
    if (query.id) row = book.find((person) => person.id === query.id) ?? null;
    if (!row && query.name) {
        const wanted = query.name.trim().toLocaleLowerCase('tr-TR');
        const hits = book.filter((person) => person.name.toLocaleLowerCase('tr-TR') === wanted);
        row = hits.length === 1 ? hits[0] : null;
    }
    if (!row) return null;

    const extra = DEMO_EXTRAS[row.id] ?? {};
    const visits = extra.visits ?? visitsFromBook(row, todayISO);
    const history = visits.map((visit) => toRow(row.id, visit, todayISO));

    // Kart AYRINTI ister; yalnız "formülü var" diyen bir satırdan kart
    // çizilemez. O satır geçmişte formüllü görünmeye devam ediyor. Depoya az
    // önce yazılan formül de buraya giriyor — `toRow` onu satıra koyuyor.
    const at = history.findIndex((line) => line.detail !== null);
    const newest = at >= 0 ? visits[at] : null;
    const detail = at >= 0 ? history[at].detail : null;
    const formula: FileFormula | null = newest && detail
        ? {
            ...detail,
            date: formatDayMonth(addDaysISO(todayISO, -newest.daysAgo)),
            who: newest.who,
            initials: newest.initials,
            mine: newest.mine,
        }
        : null;

    return {
        id: row.id,
        name: row.name,
        phone: extra.phone ?? null,
        lastVisit: row.lastVisitDate ? formatDayMonth(row.lastVisitDate) : null,
        ago: row.lastVisitDate ? agoLabel(row.lastVisitDate, todayISO).text : null,
        lastService: row.lastService,
        // Adı yalnız ekstrası olan müşteride biliyoruz. Yoksa null → ekran
        // "kim yaptı" pilini hiç çizmiyor; baş harfi ad yerine koymuyor.
        lastStaff: visits[0]?.who || null,
        lastStaffInitials: row.lastStaffInitials,
        visits: history.length,
        formulas: history.filter((line) => line.formula).length,
        risk: extra.risk ?? null,
        note: extra.note ?? null,
        formula,
        packages: extra.packages ?? [],
        history,
    };
}
