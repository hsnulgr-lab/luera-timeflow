/**
 * Personel 09 — müşteri defterinin karar katmanı.
 *
 * Saf: RN ve Expo yok, testler doğrudan içeri alabilsin diye.
 *
 * Ekranın tek işi bir kişiyi bulmak ve bulunduğu anda "bu müşteride ne
 * yapmıştım" sorusunu cevaplamak. Bu yüzden satır beş olgu taşıyor —
 * ad, ne zaman, ne yapıldı, KİM YAPTI, formül kaydı var mı. "Kim yaptı"
 * olmadan meslektaşın müşterisi ayrışmıyor; "formül var mı" olmadan
 * sayfayı açmaya değer mi bilinmiyor.
 */

export interface BookCustomer {
    id: string;
    name: string;
    /** Son gelişin günü (YYYY-MM-DD). Hiç gelmediyse null. */
    lastVisitDate: string | null;
    /** Bugün randevusu varsa saati — henüz gelmemiş müşteri için. */
    upcomingTime?: string | null;
    lastService: string | null;
    hasFormula: boolean;
    /** Son işi BU personel mi yaptı? Disk işareti bundan doğuyor. */
    mine: boolean;
    /** Son işi yapan personelin baş harfleri. Kendiminkinde de dolu. */
    lastStaffInitials: string;
    /** Aramada telefonun son dört hanesi eşleşiyor; ekranda GÖRÜNMÜYOR. */
    phoneTail?: string;
}

/** Satırın sağındaki büyük harfli zaman etiketi ve turuncu olup olmadığı. */
export interface AgoLabel {
    text: string;
    /** Turuncu: bugün ya da dün. Turuncu ZAMAN demek, önem değil. */
    recent: boolean;
}

const DAY = 86_400_000;

function toUTC(dateISO: string): number {
    const [y, m, d] = dateISO.split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * "BUGÜN" · "DÜN" · "3 GÜN" · "2 HAFTA" · "5 AY".
 *
 * Gün sayısı 13'e kadar gün, sonrası hafta, 60 günden sonra ay. Kuaförün
 * kafasındaki ölçek bu: yakın geçmiş gün, orta mesafe hafta, uzak ay.
 */
export function agoLabel(lastVisitDate: string | null, todayISO: string): AgoLabel {
    if (!lastVisitDate) return { text: 'HİÇ', recent: false };
    const days = Math.round((toUTC(todayISO) - toUTC(lastVisitDate)) / DAY);
    if (days <= 0) return { text: 'BUGÜN', recent: true };
    if (days === 1) return { text: 'DÜN', recent: true };
    if (days < 14) return { text: `${days} GÜN`, recent: false };
    if (days < 60) return { text: `${Math.round(days / 7)} HAFTA`, recent: false };
    return { text: `${Math.round(days / 30)} AY`, recent: false };
}

/**
 * Adı ikiye böler: son kelime kalın, öncesi ince.
 *
 * "Elif Demir" → ["Elif ", "Demir"] · tek kelimelik ad tamamen kalın.
 * Referansın ad muamelesi bu; tasarımın imzası.
 */
export function splitName(name: string): { light: string; bold: string } {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return { light: '', bold: name.trim() };
    const bold = parts.pop() as string;
    return { light: `${parts.join(' ')} `, bold };
}

/**
 * Arama: ad ya da telefonun son dört hanesi.
 *
 * Türkçe kıvrımı var: "İ" küçüldüğünde "i" olmalı, "I" ise "ı". Varsayılan
 * `toLowerCase` bunu bozuyor ve "İnci" araması "inci"yi bulmuyordu.
 */
export function normalize(value: string): string {
    return value.trim().toLocaleLowerCase('tr-TR');
}

export function matches(customer: BookCustomer, query: string): boolean {
    const q = normalize(query);
    if (!q) return true;
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3 && customer.phoneTail?.includes(digits)) return true;
    return normalize(customer.name).includes(q);
}

/**
 * Sıralama: son gelişe göre azalan. Kontrolsüz, çünkü ikinci bir sıranın
 * gerektiği tek durum "eski bir müşteriyi bulmak" ve onun cevabı arama.
 * Sıralama menüsü aramanın yavaş taklidi olurdu.
 *
 * Hiç gelmemişler EN ALTTA değil: bugünkü randevusu olan biri "hiç
 * gelmemiş" olsa da bugün gelecek — o yüzden randevu saati sıraya giriyor.
 */
export function sortBook(list: readonly BookCustomer[], todayISO: string): BookCustomer[] {
    return [...list].sort((a, b) => rank(b, todayISO) - rank(a, todayISO));
}

function rank(customer: BookCustomer, todayISO: string): number {
    if (customer.upcomingTime) return toUTC(todayISO) + DAY;
    if (!customer.lastVisitDate) return -1;
    return toUTC(customer.lastVisitDate);
}

export function mineCount(list: readonly BookCustomer[]): number {
    return list.filter((customer) => customer.mine).length;
}

// ── Demo defteri ────────────────────────────────────────────────────────────
//
// Sunucudaki `customers` ucu bağlanana kadar. Tasarımın verisiyle aynı
// isimler, çünkü ekranı onun ölçüleriyle karşılaştırıyoruz.

function shift(todayISO: string, days: number): string {
    return new Date(toUTC(todayISO) - days * DAY).toISOString().slice(0, 10);
}

export function demoBook(todayISO: string): BookCustomer[] {
    const at = (days: number) => shift(todayISO, days);
    return [
        { id: 'c1', name: 'Sibel Arda', lastVisitDate: at(0), lastService: 'Keratin bakımı', hasFormula: true, mine: true, lastStaffInitials: 'MK', phoneTail: '4120' },
        { id: 'c2', name: 'Ayşe Yılmaz', lastVisitDate: at(0), lastService: 'Saç boyama + fön', hasFormula: true, mine: true, lastStaffInitials: 'MK', phoneTail: '2018' },
        { id: 'c3', name: 'Zeynep Kaya', lastVisitDate: at(0), lastService: 'Dip boya', hasFormula: true, mine: false, lastStaffInitials: 'SD', phoneTail: '7741' },
        { id: 'c4', name: 'Elif Demir', lastVisitDate: at(2), lastService: 'Saç boyama + fön', hasFormula: true, mine: true, lastStaffInitials: 'MK', phoneTail: '9033' },
        { id: 'c5', name: 'Buse Yıldırım', lastVisitDate: at(3), lastService: 'Ombre', hasFormula: true, mine: false, lastStaffInitials: 'SD', phoneTail: '5514' },
        { id: 'c6', name: 'Nazlı Koç', lastVisitDate: at(6), lastService: 'Manikür', hasFormula: false, mine: false, lastStaffInitials: 'AT', phoneTail: '4062' },
        { id: 'c7', name: 'Meryem Aksoy', lastVisitDate: at(11), lastService: 'Röfle + fön', hasFormula: true, mine: true, lastStaffInitials: 'MK', phoneTail: '3388' },
        { id: 'c8', name: 'Hatice Şen', lastVisitDate: at(31), lastService: 'Kesim + fön', hasFormula: false, mine: false, lastStaffInitials: 'AT', phoneTail: '1290' },
        { id: 'c9', name: 'Zeynep Arslan', lastVisitDate: at(124), lastService: 'Kesim', hasFormula: false, mine: true, lastStaffInitials: 'MK', phoneTail: '6741' },
        { id: 'c10', name: 'Zeyneb Öztürk', lastVisitDate: null, upcomingTime: '16:00', lastService: 'Kesim + fön', hasFormula: false, mine: true, lastStaffInitials: 'MK', phoneTail: '3315' },
        // Bugünün ajandasındaki kişiler (`staffDemo.demoAgenda`). Defterde
        // YOKLARDI: kumandadan kartlarına geçilince "müşteri bulunamadı"
        // çıkıyordu. Ajandada randevusu olan birinin defterde bulunmaması
        // gerçek veride olamaz — sahte veride de olmamalı.
        { id: 'c11', name: 'Merve Aydın', lastVisitDate: at(5), lastService: 'Fön', hasFormula: false, mine: true, lastStaffInitials: 'MK', phoneTail: '7208' },
        { id: 'c12', name: 'Nur Aksoy', lastVisitDate: at(9), lastService: 'Kesim + fön', hasFormula: false, mine: true, lastStaffInitials: 'MK', phoneTail: '5561' },
        { id: 'c13', name: 'Hakan Toprak', lastVisitDate: at(20), lastService: 'Sakal + kesim', hasFormula: false, mine: false, lastStaffInitials: 'AT', phoneTail: '8834' },
    ];
}
