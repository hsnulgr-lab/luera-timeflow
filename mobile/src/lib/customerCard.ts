/**
 * Müdür 23 — müşteri kartının karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Ekran tek bir soruya cevap veriyor: "bu müşteri kim ve ona nasıl
 * davranmalıyım?" Kimlik BAŞ HARFLERDEN gelir — fotoğraf yok, olmayacak.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 23 Musteri Karti.html`.
 */


export interface CustomerRisk {
    /** "ALERJİ" · "HAMİLE" · "SAĞLIK NOTU" — renk tek başına anlam taşımaz. */
    label: string;
    /** Tam cümle. KIRPILMAZ, sarar. */
    text: string;
}

export interface CustomerPackage {
    name: string;
    total: number;
    used: number;
}

export interface CustomerVisit {
    /** "18 Haz" */
    date: string;
    visitNo: number;
    staff: string | null;
}

export interface CustomerUpcoming {
    /** "24 Haz" */
    date: string;
    time: string;
    service: string;
    staff: string | null;
}

export interface CustomerHistoryRow {
    id: string;
    service: string;
    date: string;
    staff: string | null;
    amount: number;
}

export interface CustomerCard {
    id: string;
    name: string;
    phone: string | null;
    risk: CustomerRisk | null;
    /**
     * Açık bakiye. `null` BİLİNMİYOR demek ve o hâlde uyarı satırı HİÇ
     * render edilmez — "₺0" asla yazılmaz.
     */
    balance: number | null;
    /** Borcun kaynağı: "12 Haz işleminden". Bilinmiyorsa `null`. */
    balanceSince: string | null;
    pkg: CustomerPackage | null;
    lastVisit: CustomerVisit | null;
    /** Bugün ilk randevusuysa: geçmiş yok ama bir randevu var. */
    firstVisitToday: CustomerUpcoming | null;
    upcoming: CustomerUpcoming | null;
    history: CustomerHistoryRow[];
    notes: string[];
}

/** Baş harfler — en fazla iki, Türkçe büyütmeyle ("i" → "İ"). */
export function monogramOf(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const letters = words.length === 1
        ? [...words[0]].slice(0, 1)
        : [words[0][0], words.at(-1)?.[0] ?? ''];
    return letters.join('').toLocaleUpperCase('tr-TR');
}

/** "Zeynep" + "Kaya" — ad ince, soyad kalın. İki satır, üçüncü satır yok. */
export function nameLines(name: string): { given: string; family: string } {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return { given: '', family: words[0] ?? '' };
    return { given: words.slice(0, -1).join(' '), family: words.at(-1) ?? '' };
}

/** Kuruşsuz, binlik noktalı. ₺ ayrı bir düğüm olarak yazılır. */
export function formatTRY(amount: number): string {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(amount));
}

// ── Kahraman uyarı satırı ───────────────────────────────────────────────────

export interface HeroWarn {
    kind: 'risk' | 'debt';
    label: string;
    text: string;
}

/**
 * Risk ve borç TEK BİR ŞEKLE indirildi: ikisi de "karar vermeden önce bunu
 * bil" diyor. İki farklı şekil icat etmek müdüre iki kalıp öğretirdi; bir
 * şekil öğrenilir, ikincisi kaçırılır.
 *
 * İkisi birlikte varsa üst üste binerler ve RİSK ÜSTTE olur.
 */
export function heroWarns(card: CustomerCard): HeroWarn[] {
    const warns: HeroWarn[] = [];
    if (card.risk) {
        warns.push({ kind: 'risk', label: card.risk.label, text: card.risk.text });
    }
    // Bakiye BİLİNMİYORSA satır hiç çizilmez; boş bir rozet bırakılmaz.
    if (card.balance !== null && card.balance > 0) {
        warns.push({
            kind: 'debt',
            label: 'Bakiye',
            text: card.balanceSince
                ? `₺${formatTRY(card.balance)} borç var · ${card.balanceSince}`
                : `₺${formatTRY(card.balance)} borç var`,
        });
    }
    return warns;
}

/** Uyarı varsa kahraman alan uzar. Animasyon değil, mount'ta yerleşim. */
export function heroGrows(card: CustomerCard): boolean {
    return heroWarns(card).length > 0;
}

// ── İki levha ───────────────────────────────────────────────────────────────

export interface CustomerPlate {
    key: 'sessions' | 'lastVisit';
    label: string;
    value: string;
    /** "14:30" gibi ikincil ek. Yoksa boş. */
    unit: string;
    /** Sayısal olmayan değer bir kademe küçük ve ikincil yazılır. */
    soft: boolean;
    sub: string;
    /** Gidilecek bir yer yoksa ok ÇİZİLMEZ — boş bir ekrana söz verilmez. */
    opens: boolean;
}

/**
 * Levhalar "kalan seans" ve "son geliş" taşır; BAKİYE TAŞIMAZ.
 *
 * Bakiye levhaya konamaz çünkü `bilinmiyor` olabilir ve bilinmeyen veri
 * yazılmaz — o hâlde levha çizilmezdi, çizilmeyen levha ise sınırın üstünde
 * duran çiftin yarısını boşaltır ve yapı çöker. Levha her zaman çizilebilen
 * veriyi taşır: paket ya yoktur ya vardır, ikisi de bilinen bir cevaptır.
 */
export function customerPlates(card: CustomerCard, short = false): [CustomerPlate, CustomerPlate] {
    const left: CustomerPlate = card.pkg
        ? {
            key: 'sessions',
            label: 'Kalan seans',
            // Müdür randevu verirken KALANI sorar, kullanılanı değil.
            value: String(Math.max(0, card.pkg.total - card.pkg.used)),
            unit: '',
            soft: false,
            sub: short
                ? `${card.pkg.total} seans · ${card.pkg.used} kullanıldı`
                : `${card.pkg.total} seanslık ${card.pkg.name} · ${card.pkg.used} kullanıldı`,
            opens: false,
        }
        : {
            key: 'sessions',
            label: 'Paket',
            // "Yok" bir yalan değil, bilinen bir cevap. "₺0" ise bir yalandır.
            value: 'Yok',
            unit: '',
            soft: true,
            sub: 'Randevuda tanımlanabilir',
            opens: false,
        };

    const right: CustomerPlate = card.lastVisit
        ? {
            key: 'lastVisit',
            label: 'Son geliş',
            value: card.lastVisit.date,
            unit: '',
            soft: false,
            sub: [
                `${card.lastVisit.visitNo}. ziyaret`,
                card.lastVisit.staff ? `${card.lastVisit.staff} ile` : null,
            ].filter(Boolean).join(' · '),
            /*
             * OK ÇİZİLMEZ.
             *
             * Bir süre `true` idi ve levhanın köşesinde bir ok duruyordu ama
             * dokunulunca hiçbir şey olmuyordu — ölü kontrol. Sebebi veri:
             * `CustomerVisit` bir randevu kimliği taşımıyor, dolayısıyla
             * açılacak bir randevu kartı yok.
             *
             * Ok eklemek için veri modeline kimlik koymak da gereksiz: son
             * gelişin kendisi hemen aşağıdaki "Son işlemler" listesinin İLK
             * SATIRI. Ok, zaten ekranda duran bir şeye götürürdü.
             */
            opens: false,
        }
        : {
            key: 'lastVisit',
            label: 'İlk ziyaret',
            value: card.firstVisitToday ? 'Bugün' : 'Yok',
            unit: '',
            soft: !card.firstVisitToday,
            sub: card.firstVisitToday
                ? [
                    `${card.firstVisitToday.time} randevusu`,
                    card.firstVisitToday.staff ? `${card.firstVisitToday.staff} ile` : null,
                ].filter(Boolean).join(' · ')
                : 'Henüz gelmedi',
            // Gidilecek bir geçmiş yok.
            opens: false,
        };

    return [left, right];
}

// ── İçerik ──────────────────────────────────────────────────────────────────

export interface HistoryEmpty {
    title: string;
    hint: string;
}

/** Boş hâl bir HATA gibi görünmez: ikon yok, uyarı rengi yok, cümle olumlu. */
export function historyEmpty(): HistoryEmpty {
    return {
        title: 'Bugün ilk işlem.',
        hint: 'Geçmiş, ilk tahsilattan sonra burada birikir.',
    };
}

export const NOTES_EMPTY = 'Not eklenmedi.';

/** "18 Haz · Merve" — personel bilinmiyorsa "ile" cümlesi kurulmaz. */
export function historyMeta(row: CustomerHistoryRow): string {
    return [row.date, row.staff].filter(Boolean).join(' · ');
}

/** "Kesim + fön · Merve ile" — gömülü kartın alt satırı. */
export function upcomingSub(upcoming: CustomerUpcoming): string {
    return [upcoming.service, upcoming.staff ? `${upcoming.staff} ile` : null]
        .filter(Boolean).join(' · ');
}

// ── Alt çubuk ───────────────────────────────────────────────────────────────

export const TRAY_MAIN = 'Randevu ver';
export const TRAY_GHOST = 'Not ekle';

/**
 * Borç iki yerde durur, iki ayrı iş görür: kahraman alandaki satır "bu
 * müşteri kim" sorusunun parçası, çubuktaki satır "şimdi ne yapıyorum"
 * anının parçası. Tekrar değil — aynı olgunun iki farklı karara girmesi.
 */
export function trayReminder(card: CustomerCard): string | null {
    if (card.balance === null || card.balance <= 0) return null;
    return `₺${formatTRY(card.balance)} borç var — randevu vermeden önce hatırlat`;
}

// ── Toplanmış asılı levha ───────────────────────────────────────────────────

/**
 * Toplanmış levhada RİSK kalır, BORÇ kalmaz.
 *
 * Alerji, kaydırma konumundan bağımsız olarak doğru olmaya devam eden bir
 * güvenlik olgusudur — müdür notları okurken personeline bir şey söyleyebilir.
 * Borç ise bir işlem olgusudur ve yalnız tek bir anda iş görür: randevu
 * verilirken. O an alt çubukta hatırlatılıyor.
 */
export function hangRisk(card: CustomerCard): string | null {
    return card.risk?.text ?? null;
}

/**
 * Erişilebilirlik cümlesi — risk HER ZAMAN ikinci sırada okunur.
 * Renk ve nokta tek başına anlam taşımaz.
 */
export function cardLabel(card: CustomerCard): string {
    const [left, right] = customerPlates(card);
    return [
        card.name,
        card.risk?.text ?? null,
        card.balance !== null && card.balance > 0 ? `₺${formatTRY(card.balance)} borç var` : null,
        `${left.label.toLocaleLowerCase('tr-TR')} ${left.value}`,
        `${right.label.toLocaleLowerCase('tr-TR')} ${right.value}`,
    ].filter(Boolean).join(', ');
}

// ── Demo verisi ─────────────────────────────────────────────────────────────
//
// Sunucuda müşteri kartı ucu YOK. Bu blok o uç yazıldığında silinecek;
// ekranların hepsi `CustomerCard` üzerinden okuyor, kaynağın değişmesi
// görünümü değiştirmeyecek.

export const mockCustomers: CustomerCard[] = [
    {
        id: 'c-zeynep',
        name: 'Zeynep Kaya',
        phone: '+905321182406',
        risk: null,
        balance: 0,
        balanceSince: null,
        pkg: { name: 'bakım', total: 10, used: 4 },
        lastVisit: { date: '18 Haz', visitNo: 7, staff: 'Merve' },
        firstVisitToday: null,
        upcoming: { date: '24 Haz', time: '14:30', service: 'Kesim + fön', staff: 'Merve' },
        history: [
            { id: 'h1', service: 'Kesim + fön', date: '18 Haz', staff: 'Merve', amount: 450 },
            { id: 'h2', service: 'Saç boyama', date: '2 Haz', staff: 'Selin', amount: 1200 },
        ],
        notes: ['Kısa katları sevmiyor, uzunluğu koruyor. Fön sıcaklığını düşük istiyor.'],
    },
    {
        id: 'c-elif',
        name: 'Elif Demir',
        phone: '+905554027119',
        risk: { label: 'Alerji', text: 'Saç boyasına alerjisi var' },
        balance: 0,
        balanceSince: null,
        pkg: { name: 'bakım', total: 6, used: 4 },
        lastVisit: { date: '3 Haz', visitNo: 4, staff: 'Selin' },
        firstVisitToday: null,
        upcoming: null,
        history: [
            { id: 'h1', service: 'Keratin bakımı', date: '3 Haz', staff: 'Selin', amount: 900 },
            { id: 'h2', service: 'Fön', date: '21 May', staff: 'Merve', amount: 180 },
            { id: 'h3', service: 'Kesim', date: '2 May', staff: 'Selin', amount: 380 },
        ],
        notes: [
            'Boya yerine bitkisel bakım uygulanıyor. Yama testi 2023’te yapıldı.',
            'Cumartesi sabahlarını tercih ediyor.',
        ],
    },
    {
        id: 'c-kerem',
        name: 'Kerem Yıldız',
        phone: '+905339075542',
        risk: null,
        balance: 450,
        balanceSince: '12 Haz işleminden',
        pkg: { name: 'bakım', total: 10, used: 9 },
        lastVisit: { date: '12 Haz', visitNo: 11, staff: 'Selin' },
        firstVisitToday: null,
        upcoming: null,
        history: [
            { id: 'h1', service: 'Sakal + kesim', date: '12 Haz', staff: 'Selin', amount: 450 },
        ],
        notes: ['Nakit ödemeyi tercih ediyor.'],
    },
    {
        id: 'c-gulsah',
        name: 'Gülşah Karaosmanoğlu',
        phone: '+905426630871',
        risk: null,
        // BİLİNMİYOR — uyarı satırı hiç render edilmez.
        balance: null,
        balanceSince: null,
        pkg: null,
        lastVisit: null,
        firstVisitToday: { date: 'Bugün', time: '14:30', service: 'Kesim', staff: 'Merve' },
        upcoming: null,
        history: [],
        notes: [],
    },
];

/** Ada göre eşleştirir — kaynakta müşteri kimliği her zaman taşınmıyor. */
export function findCustomer(query: { id?: string | null; name?: string | null }): CustomerCard | null {
    if (query.id) {
        const byId = mockCustomers.find((customer) => customer.id === query.id);
        if (byId) return byId;
    }
    if (query.name) {
        const wanted = query.name.trim().toLocaleLowerCase('tr-TR');
        const byName = mockCustomers.find(
            (customer) => customer.name.toLocaleLowerCase('tr-TR') === wanted,
        );
        if (byName) return byName;
    }
    return null;
}

/**
 * "0532 118 24 06" — kahraman alandaki telefon TAM yazılır.
 *
 * Randevu kartındaki rozet maskeliydi çünkü orada telefon bir yan bilgiydi.
 * Burada müdürün ekranı açma sebeplerinden biri doğrudan bu numara; maskeli
 * bir numara okunamaz ve okunamayan bilgi yazılmaz.
 */
export function displayPhone(card: CustomerCard): string | null {
    if (!card.phone) return null;
    const digits = card.phone.replace(/\D/g, '').replace(/^90/, '');
    if (digits.length !== 10) return card.phone;
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
}

/** Aramak ve WhatsApp için ham numara — biçimlendirilmiş hâli değil. */
export function dialPhone(card: CustomerCard): string | null {
    return card.phone ? card.phone.replace(/[^\d+]/g, '') : null;
}
