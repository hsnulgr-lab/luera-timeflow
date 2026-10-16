/**
 * Paketler (1.0.1) — müdürün paket defteri ve paket türleri. Saf, React'siz.
 *
 * Profil'de Müşteriler'in üstünde bir satır; yalnız paket satan sektörlerde
 * (`sellsPackages`: güzellik, kuaför). Üstte SATILMIŞ paketler (kim, hangi
 * paket, kaç seans kaldı, ne kadar ödenmedi), altta "Paket türleri" — satışta
 * seçilen şablonlar (`package_templates`, 069).
 *
 * ── Para yolu YOK ───────────────────────────────────────────────────────────
 * Defter yalnız okur. Satıra dokununca müşteri kartı açılır; "Ödeme al" zaten
 * orada ve kendi kuralıyla (`planPayment`). İkinci bir tahsilat kapısı açmak,
 * aynı borcu iki yerden almanın en kısa yolu olurdu.
 *
 * ── Sayılar kartla AYNI ─────────────────────────────────────────────────────
 * Kalan seans = toplam − kullanılan (kartın "Kalan seans" levhası). Ödenmedi
 * = bedel − O PAKETE bağlı tahsilatlar (`fetchPackageRows`un `owed`u,
 * masaüstünün `balance`ı). Masaüstü ayrıca ileri randevuya bağlı seansları
 * "rezerve" diye ayırıyor; telefonun kartı ayırmıyor ve defter kartla aynı
 * sayıyı söylüyor — dokununca açılan ekran başka bir sayı demesin.
 */

/** Defterin bir satırı — bir müşterinin bir paketi. */
export interface PackageBookRow {
    planId: string;
    customerId: string;
    /** Okunamadıysa boş — satır "Adı okunamadı" der, uydurmaz. */
    customerName: string;
    title: string;
    total: number;
    used: number;
    left: number;
    /** Bu pakete kalan ödeme; ödenmişse 0. */
    owed: number;
    createdAt: string;
}

/** Ham `treatment_plans` satırı + bağlı müşterinin adı. */
export interface PlanInput {
    id: string;
    customer_id: string;
    customer_name: string | null;
    title: string | null;
    total_amount: number | null;
    session_count: number | null;
    sessions_done: number | null;
    created_at: string | null;
}

export function packageBookRows(
    plans: readonly PlanInput[],
    paidByPlan: ReadonlyMap<string, number>,
): PackageBookRow[] {
    return plans.map((plan) => {
        const total = Math.max(1, Number(plan.session_count ?? 1) || 1);
        const used = Math.min(total, Math.max(0, Number(plan.sessions_done ?? 0) || 0));
        const amount = Math.max(0, Number(plan.total_amount ?? 0) || 0);
        return {
            planId: plan.id,
            customerId: plan.customer_id,
            customerName: (plan.customer_name ?? '').trim(),
            title: (plan.title ?? '').trim() || 'Paket',
            total,
            used,
            left: total - used,
            owed: Math.max(0, amount - (paidByPlan.get(plan.id) ?? 0)),
            createdAt: plan.created_at ?? '',
        };
    });
}

/** Seansı bitti mi. */
export const finished = (row: Pick<PackageBookRow, 'left'>): boolean => row.left <= 0;

/**
 * "Son seans" — yalnız ÇOK seanslı pakette anlamlı. Tek seanslık paket
 * satıldığı an 0/1'dir; orada işaret hep yanar ve hiçbir şey söylemezdi
 * (masaüstünün `total > 1` dersi).
 */
export const lastSession = (row: Pick<PackageBookRow, 'left' | 'total'>): boolean =>
    row.total > 1 && row.left === 1;

/**
 * İki bölüm: AÇIK ve BİTENLER.
 *
 * Seansı bitmiş ama borcu duran paket AÇIK'ta kalır: müdürün yapacak bir işi
 * var (parayı almak). Bitenler'e yalnız işi kalmamış olan iner.
 *
 * Açık'ın sırası iş sırası: önce ödenmeyen (para), sonra son seansı kalan
 * (yenileme konuşması), sonra öteki; her birinde en yeni satış üstte.
 * Bitenler en yeni üstte.
 */
export function packageSections(rows: readonly PackageBookRow[]): {
    open: PackageBookRow[];
    done: PackageBookRow[];
} {
    const newest = (a: PackageBookRow, b: PackageBookRow) => b.createdAt.localeCompare(a.createdAt);
    const rank = (row: PackageBookRow) => (row.owed > 0 ? 0 : lastSession(row) ? 1 : 2);
    const open = rows.filter((row) => !finished(row) || row.owed > 0)
        .sort((a, b) => rank(a) - rank(b) || newest(a, b));
    const done = rows.filter((row) => finished(row) && row.owed <= 0).sort(newest);
    return { open, done };
}

/** Kaç paket sürüyor, kaçında para bekleniyor. */
export function packageCounts(rows: readonly Pick<PackageBookRow, 'left' | 'owed'>[]): {
    open: number;
    owed: number;
} {
    return {
        open: rows.filter((row) => !finished(row)).length,
        owed: rows.filter((row) => row.owed > 0).length,
    };
}

/**
 * "6 açık · 2 ödenmedi" — Profil satırının ve defter başlığının cümlesi.
 * Hiç paket yoksa bunu söyler; "0 açık" bir sayı gibi okunur, bilgi değil.
 */
export function packageSummary(counts: { open: number; owed: number }): string {
    if (counts.open === 0 && counts.owed === 0) return 'Henüz açık paket yok';
    const parts = [`${counts.open} açık`];
    if (counts.owed > 0) parts.push(`${counts.owed} ödenmedi`);
    return parts.join(' · ');
}

/** Bölünmez boşluk: "6 seans kaldı" satır sonunda ortadan kırılmasın. */
const NBSP = '\u00A0';

/**
 * Başlığın "· N seans" parçası atılır — kalan cümlesi sayıyı zaten söylüyor.
 * "Lazer Epilasyon · 6 Seans · 6 seans kaldı" aynı sayıyı iki kez okutuyordu
 * ve "6 / seans kaldı" diye bölünüyordu (2026-10-16, telefonda).
 */
export function packageName(title: string, total: number): string {
    const count = new RegExp(`^${total}\\s*seans$`);
    const parts = title.split(' · ');
    const kept = parts.filter((part, index) => index === 0 || !count.test(part.trim().toLocaleLowerCase('tr-TR')));
    return kept.join(' · ');
}

/**
 * Paketin cümlesi: "Ağda · 2 seans kaldı" · "Ağda · son seans" · "Ağda · bitti".
 * Paketler ekranı VE Akış'ın paket satırı bunu yazar — iki yerde iki dil olmasın.
 * Müdür KALANI sorar (müşteri kartının "Kalan seans" levhası); toplam kartta.
 */
export function packageLine(row: Pick<PackageBookRow, 'title' | 'left' | 'total'>): string {
    const state = row.left <= 0 ? 'bitti'
        : lastSession(row) ? `son${NBSP}seans`
            : `${row.left}${NBSP}seans${NBSP}kaldı`;
    return `${packageName(row.title, row.total)} · ${state}`;
}

/** Bitenler katlanır: "Bitenler · 4". */
export const doneFoldLabel = (count: number): string => `Bitenler · ${count}`;

// ── Paket türleri (şablonlar) ───────────────────────────────────────────────

/** Masaüstünün DB kısıtı: 1–50 seans (069). */
export const TYPE_MIN_SESSIONS = 1;
export const TYPE_MAX_SESSIONS = 50;
/** Sayfanın hızlı seçimleri — salonların en çok sattığı boylar. */
export const TYPE_SESSION_CHIPS: readonly number[] = [4, 6, 8, 10];

export interface PackageType {
    id: string;
    name: string;
    sessions: number;
    price: number;
}

export const clampTypeSessions = (value: number): number =>
    Math.min(TYPE_MAX_SESSIONS, Math.max(TYPE_MIN_SESSIONS, Math.round(Number(value) || TYPE_MIN_SESSIONS)));

export function stepTypeSessions(value: number, direction: -1 | 1): number {
    return clampTypeSessions(value + direction);
}

/**
 * Kaydedilebilir mi: ad dolu ve bedel girilmiş, sıfırdan büyük.
 *
 * ₺0'lık paket türü bir hatadır: satış ekranı önerilen bedeli şablondan
 * dolduruyor ve sıfır, müdürün fark etmeden bedava paket satması demek.
 */
export function typeValid(input: { name: string; price: number | null }): boolean {
    return input.name.trim().length > 0 && input.price !== null && input.price > 0;
}

/**
 * Yazılan alanlar — YALNIZ telefonun değiştirdikleri. Renk ve geçerlilik
 * süresi masaüstünde kaldığı gibi kalır (güncellemede hiç gönderilmez).
 */
export function typePatchOf(input: { name: string; sessions: number; price: number }): {
    name: string;
    session_count: number;
    price: number;
} {
    return {
        name: input.name.trim(),
        session_count: clampTypeSessions(input.sessions),
        price: Math.max(0, Math.round(input.price)),
    };
}

export function packageTypesOf(rows: readonly Record<string, unknown>[]): PackageType[] {
    return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        sessions: clampTypeSessions(Number(row.session_count ?? 1)),
        price: Math.max(0, Number(row.price ?? 0) || 0),
    }));
}

/** "3 tür" · tür yoksa satışın nereden çalıştığını söyler. */
export function typesSummary(count: number): string {
    return count > 0 ? `${count} tür · satışta seçilir` : 'Tür yok · satış hizmetlerden';
}

/** Satırın alt cümlesi: "6 seans · seans başı ₺600". */
export function typeLine(type: Pick<PackageType, 'sessions' | 'price'>, money: (value: number) => string): string {
    if (type.sessions <= 1) return 'Tek seans';
    return `${type.sessions} seans · seans başı ₺${money(Math.round(type.price / type.sessions))}`;
}
