/**
 * Müdür okumasının saf karar katmanı — React'siz, Supabase'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo, react-native ya da
 * `@supabase/supabase-js` bağımlılığı TAŞIMAZ. Sorguyu kuran ve atan taraf
 * `managerSource.ts`; burada yalnız "hangi org", "satır neye dönüşür" ve
 * "gün kaç sayılır" kuralları var.
 *
 * ── Müdür neden personelden başka yoldan okuyor ──────────────────────────────
 * Personelin Supabase kimliği YOK; veriye `staff-api` üzerinden, daraltılmış
 * hâlde erişiyor. Müdürün ise masaüstündekiyle aynı Supabase oturumu var ve
 * RLS onu org seviyesinde zaten tanıyor. Müdürü `staff-api`'ye sokmak, ona
 * olmayan bir personel token'ı aratmak olurdu (o uç 401 döner). Masaüstü de
 * tam olarak bu yoldan okuyor; müdür cebindeki masaüstüdür.
 */

import { clockText, type Appt } from './calendar.ts';
import { withOwnStamps } from './dayStamp.ts';

/**
 * Randevu satırının okunan alanları.
 *
 * `staff-api`'nin `RES_COLS`'undan iki alan FAZLA: `customer_phone` ve
 * `notes`. Sunucu onları personele bilerek göndermiyor (telefon, ayrılan
 * personelin cebinde götürebileceği en değerli şey). Müdür için aynı gerekçe
 * yok: masaüstünde ikisi de zaten açık ve müşteriyi arayan kişi müdür.
 */
export const RES_COLS = 'id, customer_id, customer_name, customer_phone, date, '
    + 'start_time, end_time, service, service_color, status, staff_id, notes, '
    + 'customer_arrived_at, arrived_at, service_ended_at';

// ── Hangi org ───────────────────────────────────────────────────────────────

export type OrgRefusal = 'no_session' | 'no_access' | 'ambiguous';
export type OrgChoice =
    | { ok: true; id: string }
    | { ok: false; reason: OrgRefusal };

/**
 * Okunacak org'u seçer.
 *
 * ── Neden RLS tek başına YETMİYOR ────────────────────────────────────────────
 * `reservations_org_access` kuralı satırı "kullanıcının ÜYE OLDUĞU org'lar"
 * diye açıyor — tekil bir org'a değil. İki salonu olan bir müdürde
 * `organization_id` süzgeci konmazsa iki salonun randevuları aynı takvimde
 * ÜST ÜSTE çizilir ve bu sessizce olur. Süzgeç isteğe bağlı bir iyileştirme
 * değil, doğruluğun kendisi.
 *
 * `stored` girişte SEÇİLEN salon (`profile.business.id`, cihazda duruyor).
 * `readable` ise şu an gerçekten okunabilen org'lar — RLS süzmüş hâliyle.
 *
 * Saklanan kimlik okunabilirler arasında DEĞİLSE bu bir hata değil, bir
 * gerçek: müdür o salondan çıkarılmış ya da salon silinmiş olabilir. O durumu
 * "boş gün" diye çizmek, dolu bir salonu boş göstermek olurdu.
 */
export function chooseOrg(stored: string | null, readable: readonly string[]): OrgChoice {
    if (readable.length === 0) return { ok: false, reason: 'no_access' };
    if (stored) {
        return readable.includes(stored)
            ? { ok: true, id: stored }
            : { ok: false, reason: 'no_access' };
    }
    // Tek salonu olan müdüre seçim sorulmaz: sorulacak bir şey yok.
    if (readable.length === 1) return { ok: true, id: readable[0] };
    // Çok salonlu müdürde rastgele birini seçmek, YANLIŞ salonu doğru gibi
    // göstermek demek. Karar ekrana geri veriliyor.
    return { ok: false, reason: 'ambiguous' };
}

// ── Satır → randevu ─────────────────────────────────────────────────────────

/** Veritabanı satırını takvimin beklediği şekle çevirir. */
export function toAppt(row: Record<string, unknown>): Appt {
    /*
     * Randevunun KENDİ gününe ait olmayan "geldi / başladı" damgası burada
     * düşüyor (`withOwnStamps`). Taşınmış bir randevu eski günün damgasını
     * taşıyabiliyordu; takvim, personel günü ve kart onu "1143 saattir
     * işlemde" diye okurdu. Tek okuma noktası, tek kural.
     */
    return withOwnStamps(toApptRaw(row), String(row.date));
}

function toApptRaw(row: Record<string, unknown>): Appt {
    return {
        id: String(row.id),
        customer_id: (row.customer_id as string | null) ?? null,
        customer_name: String(row.customer_name ?? ''),
        customer_phone: (row.customer_phone as string | null) ?? null,
        date: String(row.date),
        // Veritabanı `time` alanını "09:00:00" diye veriyor; ekran "09:00"
        // bekliyor ve saniyeyi hiçbir yerde göstermiyor.
        start_time: clockText(String(row.start_time)),
        end_time: clockText(String(row.end_time)),
        service: String(row.service ?? ''),
        service_color: (row.service_color as string | null) ?? null,
        status: row.status as Appt['status'],
        staff_id: (row.staff_id as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        customer_arrived_at: (row.customer_arrived_at as string | null) ?? null,
        arrived_at: (row.arrived_at as string | null) ?? null,
        service_ended_at: (row.service_ended_at as string | null) ?? null,
        /**
         * Müşteri künyesi (risk · paket · kaçıncı geliş · bakiye) BU sorguda
         * yok: her biri ayrı tablodan geliyor ve gün ızgarası hiçbirini
         * çizmiyor. `null` "bilinmiyor" demek — künyeyi randevu kartı kendi
         * turunda dolduracak.
         */
        info: null,
    };
}

// ── Gün sayıları ────────────────────────────────────────────────────────────

/**
 * Hafta şeridinin gün sayıları.
 *
 * İPTAL SAYILMIYOR. Şeritteki nokta "o gün ne kadar yoğun" diyor; iptal
 * edilmiş randevu kimsenin vaktini almıyor. Sahte kaynak hepsini sayıyordu ve
 * tamamı iptal olmuş bir günü dolu gösteriyordu.
 */
export function countsOf(rows: readonly { date: string; status: string }[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows) {
        if (row.status === 'cancelled') continue;
        counts[row.date] = (counts[row.date] ?? 0) + 1;
    }
    return counts;
}

/**
 * Okunan aralıktaki HER gün haritada yer alır — sayısı sıfır olsa bile.
 *
 * Şerit eksik günü "bilinmiyor", sıfırı "boş" diye çiziyor ve ikisi ayrı
 * şeyler. Aralık gerçekten okunduysa o günler artık biliniyor: sıfırı
 * yazmamak, okunmuş bir boş günü okunmamış gibi göstermek olurdu.
 */
export function fillRange(
    counts: Record<string, number>,
    days: readonly string[],
): Record<string, number> {
    const filled: Record<string, number> = {};
    for (const day of days) filled[day] = counts[day] ?? 0;
    return filled;
}

// ── Sütunlar ────────────────────────────────────────────────────────────────

export interface CrewMember {
    id: string;
    name: string;
    color: string | null;
    active: boolean;
    /**
     * Personelin telefonu. `null` ise "Ara" düğmesi HİÇ çizilmez — uydurma
     * numara çevrilmez.
     */
    phone: string | null;
}

/** Veritabanı satırını kadro üyesine çevirir. */
export function toCrew(row: Record<string, unknown>): CrewMember {
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        color: (row.color as string | null) ?? null,
        active: row.is_active !== false,
        phone: (row.phone as string | null) ?? null,
    };
}

/**
 * Takvimin personel sütunları.
 *
 * ── Neden "aktif olanlar" YETMİYOR ───────────────────────────────────────────
 * `columnize` sütunu olmayan randevuyu sessizce DÜŞÜRÜYOR. Sütunları yalnız
 * aktif kadroyla kurmak, işten ayrılmış birinin üstündeki randevuları
 * takvimden tamamen silerdi — ve bu tam olarak geçen hafta yaşanan şeyin
 * şekli: bir personelin randevuları pasif bir satırın üstünde duruyordu.
 *
 * Bu yüzden kural şu: aktif kadro HER ZAMAN sütun alır (randevusu olmasa da,
 * boş sütun "bugün işi yok" demektir); pasif kadro YALNIZ o gün randevusu
 * varsa sütun alır ve sona eklenir. Böylece hiçbir randevu kaybolmuyor,
 * ayrılmış personel de takvimi kalıcı olarak şişirmiyor.
 */
export function columnsFor(
    crew: readonly CrewMember[],
    appointments: readonly { staff_id?: string | null }[],
): { columns: CrewMember[]; unassigned: number } {
    const booked = new Set<string>();
    let unassigned = 0;
    const known = new Set(crew.map((person) => person.id));
    for (const appointment of appointments) {
        const id = appointment.staff_id;
        // Kadroda HİÇ bulunmayan bir kimlik de atanmamış sayılıyor: sütunu
        // olmayacağı için ekranda yine kaybolurdu.
        if (id && known.has(id)) booked.add(id);
        else unassigned += 1;
    }
    const active = crew.filter((person) => person.active);
    const leftBehind = crew.filter((person) => !person.active && booked.has(person.id));
    return { columns: [...active, ...leftBehind], unassigned };
}
