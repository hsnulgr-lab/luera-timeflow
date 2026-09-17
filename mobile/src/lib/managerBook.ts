/**
 * Müdürün müşteri defteri — karar katmanı.
 *
 * Saf: RN ve Expo yok, testler doğrudan içeri alabilsin diye.
 *
 * ── Personelin defterinden farkı ────────────────────────────────────────────
 * Personelinki "benim müşterilerim" diliyle yazılmış: satırda bir disk var ve
 * o disk "bunu ben yaptım" diyor (`customerBook.mine`). Müdürde böyle bir
 * ayrım yok — salonun tamamı onun. Onun sorduğu soru başka:
 *
 *   • bu kişi en son ne zaman geldi          → zaman etiketi
 *   • ne yaptırdı                            → son hizmet
 *   • KİMDE                                  → personelin adı, baş harfi değil;
 *                                              müdür "Elif'in müşterisi" diye
 *                                              düşünüyor, "E" diye değil
 *   • güvenilir mi                           → gelmedi sayısı
 *
 * ── Bakiye NEDEN yok ────────────────────────────────────────────────────────
 * Müdürün isteyeceği beşinci olgu borç. Bilerek koymuyoruz: bakiyenin TEK
 * kaynağı masaüstündeki `patientBalance.ts` (paket dağıtımı FIFO, kısmi
 * ödemeler, tedavi planları). Aynı hesabı telefonda ikinci kez yazmak, aynı
 * müşteri için iki farklı borç göstermenin en kısa yolu. Bakiye ancak ortak
 * bir uç üzerinden gelirse bu satıra girer.
 */

import { normalize } from './customerBook.ts';

export interface ManagerBookRow {
    id: string;
    name: string;
    /** Son gelişin günü (YYYY-MM-DD). Hiç gelmediyse null. */
    lastVisitDate: string | null;
    /** Bugün randevusu varsa saati — henüz gelmemiş müşteri için. */
    upcomingTime: string | null;
    lastService: string | null;
    /** Son işi yapan personelin adı. Kayıt silinmişse boş. */
    lastStaffName: string;
    /** Pencere içinde kaç kez gelmedi damgası yedi. */
    noShows: number;
    /** Aramada telefonun son dört hanesi eşleşiyor; ekranda GÖRÜNMÜYOR. */
    phoneTail: string;
    /** Aramak ve yazmak için — satırda yazılmıyor. */
    phone: string;
}

export interface BookPerson {
    id: string;
    name: string;
    phone: string;
}

export interface BookVisit {
    customer_id: string | null;
    date: string;
    start_time: string;
    service: string;
    status: string;
    staff_id: string | null;
    no_show_at: string | null;
}

const DAY = 86_400_000;

function toUTC(dateISO: string): number {
    const [y, m, d] = dateISO.split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Ziyaretler + kişiler → defter satırları.
 *
 * Ziyaretler tarihe göre AZALAN geliyor (sorgunun sırası), ama buna
 * güvenilmiyor: sıra sunucudan gelen bir ayrıntı, defterin doğruluğu ona
 * bağlı olmamalı. Her müşteri için en yeni GEÇMİŞ ziyaret ve varsa BUGÜNKÜ
 * randevu ayrı ayrı seçiliyor.
 */
export function managerBookRows(
    people: readonly BookPerson[],
    visits: readonly BookVisit[],
    staffNames: ReadonlyMap<string, string>,
    todayISO: string,
): ManagerBookRow[] {
    const latest = new Map<string, BookVisit>();
    const upcoming = new Map<string, BookVisit>();
    const noShows = new Map<string, number>();

    for (const visit of visits) {
        const id = visit.customer_id;
        if (!id) continue;
        if (visit.no_show_at) noShows.set(id, (noShows.get(id) ?? 0) + 1);
        /*
         * BUGÜN ile GEÇMİŞ ayrı tutuluyor. Bugünkü randevu bir ziyaret
         * DEĞİL — kişi henüz gelmemiş olabilir. İkisini karıştırmak,
         * gelmemiş birini "bugün geldi" diye göstermek olurdu.
         */
        if (visit.date === todayISO && !visit.no_show_at) {
            const current = upcoming.get(id);
            if (!current || visit.start_time < current.start_time) upcoming.set(id, visit);
            continue;
        }
        if (visit.date > todayISO || visit.no_show_at) continue;
        const current = latest.get(id);
        if (!current || visit.date > current.date
            || (visit.date === current.date && visit.start_time > current.start_time)) {
            latest.set(id, visit);
        }
    }

    return people.map((person) => {
        const last = latest.get(person.id) ?? null;
        const next = upcoming.get(person.id) ?? null;
        const digits = person.phone.replace(/\D/g, '');
        return {
            id: person.id,
            name: person.name,
            lastVisitDate: last?.date ?? null,
            upcomingTime: next ? next.start_time.slice(0, 5) : null,
            lastService: last?.service?.trim() || null,
            lastStaffName: (last?.staff_id && staffNames.get(last.staff_id)) || '',
            noShows: noShows.get(person.id) ?? 0,
            phoneTail: digits.slice(-4),
            phone: person.phone,
        };
    });
}

/** Arama: ad ya da telefonun son dört hanesi — personelinkiyle aynı kural. */
export function bookMatches(row: Pick<ManagerBookRow, 'name' | 'phoneTail'>, query: string): boolean {
    const q = normalize(query);
    if (!q) return true;
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3 && row.phoneTail.includes(digits)) return true;
    return normalize(row.name).includes(q);
}

/**
 * Satırın ikinci satırı: "Saç kesimi · Elif" · "Bugün 14:30" · "Hiç gelmedi".
 *
 * Hizmet bilinmiyorsa personelin adı tek başına yazılmıyor: "· Elif" diye
 * başlayan bir satır, ayracın neyi ayırdığını söylemiyor.
 */
export function bookLine(row: ManagerBookRow): string {
    if (row.upcomingTime) return `Bugün ${row.upcomingTime}`;
    if (!row.lastVisitDate) return 'Hiç gelmedi';
    // "kayıt" DURUM DİLİNDE yasaklı; hizmet yazılmamış bir geliş de gerçek
    // bir geliştir ve öyle söylenir.
    return [row.lastService, row.lastStaffName].filter(Boolean).join(' · ') || 'Geldi';
}

/**
 * Profil'deki "Müşteriler" satırının alt yazısı — TEK bilgi.
 *
 * "312 kişi · 18’i bu hafta": ilki defterin büyüklüğü, ikincisi hareketi.
 * Hareket yoksa yalnız sayı yazılıyor; "0'ı bu hafta" bir bilgi değil, bir
 * sitem.
 */
export function bookSummary(rows: readonly ManagerBookRow[], todayISO: string): string {
    if (rows.length === 0) return 'Henüz müşteri yok';
    const since = toUTC(todayISO) - 7 * DAY;
    const week = rows.filter((row) => {
        if (row.upcomingTime) return true;
        return row.lastVisitDate !== null && toUTC(row.lastVisitDate) >= since;
    }).length;
    const people = `${rows.length} kişi`;
    // Kesme işareti TİPOGRAFİK (’): uygulamanın her yerinde bu kullanılıyor.
    return week > 0 ? `${people} · ${week}’i bu hafta` : people;
}

/**
 * Sıralama: son gelişe göre azalan; bugün randevusu olan en üstte.
 *
 * Alfabetik DEĞİL. Müdürün aradığı kişi neredeyse her zaman yakın zamanda
 * gelen kişi; adını tam bilmediği birini bulmanın yolu da sıralama değil,
 * arama alanı. `customerBook.sortBook` ile aynı kural — iki defter iki
 * farklı sırada olmasın.
 */
export function sortManagerBook(rows: readonly ManagerBookRow[], todayISO: string): ManagerBookRow[] {
    return [...rows].sort((a, b) => rank(b, todayISO) - rank(a, todayISO));
}

function rank(row: Pick<ManagerBookRow, 'upcomingTime' | 'lastVisitDate'>, todayISO: string): number {
    if (row.upcomingTime) return toUTC(todayISO) + DAY;
    if (!row.lastVisitDate) return -1;
    return toUTC(row.lastVisitDate);
}
