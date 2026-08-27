/**
 * Müdür 15 — randevu oluşturmanın karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Akış İKİ TAM SAYFA:
 *   1 · KİM ve NE   — müşteri ve hizmet, tek sayfada.
 *   2 · NE ZAMAN    — gün, saat, kim yapacak; altta yüzen özet ve tek eylem.
 *
 * Önceki hâli dört adımdı, her ekranda tek soru. O bir KUMANDA dili —
 * personelin ayaktayken tek eliyle kullandığı mod için doğruydu. Müdür cep
 * masaüstü kullanıcısı; ona daha yoğun bir sayfa hem daha hızlı hem daha
 * okunur. Beşinci bir özet adımı YOK: özet sayfa 2'nin altında yaşayan
 * yüzen çubuk.
 */

// Uzantı AÇIK: kök testleri bu dosyayı Node ile doğrudan içe aktarıyor.
import {
    addDaysISO, dayNameShort, dayNumber, daysBetween, formatDayLong, hhmm, toMinutes,
    type Appt,
} from './calendar.ts';

export const PAGE_COUNT = 2;

export type Page = 1 | 2;
/** Ekranın bulunduğu yer. Beşinci bir özet sayfası YOK. */
export type Phase = Page;

/** Ön doldurulabilen alanlar. Takvimdeki boş slottan girilince üçü de dolu gelir. */
/**
 * Ön dolu ve DEĞİŞTİRİLEMEZ alanlar.
 *
 * `slot` — saat ve personel birlikte geldi (takvimde boş kareye dokunuldu).
 * `staff` — YALNIZ personel geldi (o personelin gününden "Randevu ver"e
 *   basıldı). Saat açık kalır ama seçenekler o kişiyle sınırlıdır: müdür
 *   oraya "kim yapacak" diye değil, "Merve'ye iş vereyim" diye geliyor.
 */
export type LockedField = 'date' | 'slot' | 'staff';

export interface CustomerOption {
    id: string;
    name: string;
    /** E.164. Ekranda asla ham gösterilmez. */
    phone: string;
    /** "son 2 Ağu" ya da "Bugün 11:00 · Saç boyama" */
    hint: string;
    /** Hizmet türü rengi — avatar kenarlığı. */
    color?: string;
}

export interface ServiceOption {
    id: string;
    name: string;
    minutes: number;
    /** Kuruş değil, tam TL. */
    price: number;
    color: string;
}

export interface StaffOption {
    id: string;
    initials: string;
    name: string;
    color?: string;
    /** İzinli ya da çalışmıyorsa false — hiçbir saate atanamaz. */
    available: boolean;
    /** Yalnız `available === false` için: "izinli", "çalışmıyor". */
    reason?: string;
}

export interface Draft {
    customer: CustomerOption | null;
    /** Listede bulunamayıp aynı ekrandan eklenen müşteri. */
    newCustomerName: string | null;
    /**
     * Yeni müşterinin telefonu. İSTEĞE BAĞLI ama sorulur: hatırlatmalar
     * WhatsApp'tan gidiyor, numarasız kayıt hatırlatma alamıyor. Boş
     * bırakılabilir; bedeli ekranda yazılı.
     */
    newCustomerPhone: string | null;
    service: ServiceOption | null;
    dateISO: string | null;
    /** Gün içi dakika. */
    startMinutes: number | null;
    staffId: string | null;
    note: string | null;
    /** Dışarıdan ön doldurulmuş alanlar: adım olarak sorulmaz, geri gidilmez. */
    locked: readonly LockedField[];
}

export function emptyDraft(prefill?: {
    dateISO?: string;
    startMinutes?: number;
    staffId?: string;
    /**
     * Müşteri kartından gelindiğinde kim olduğu BELLİ. Kilitlenmez: müdür
     * yanlış karttan gelmiş olabilir, arama alanı açık kalır.
     */
    customer?: CustomerOption | null;
}): Draft {
    const locked: LockedField[] = [];
    if (prefill?.dateISO) locked.push('date');
    // Saat ve personel BİRLİKTE geldiyse adım tamamen kapanır.
    if (prefill?.startMinutes !== undefined && prefill.staffId) locked.push('slot');
    // Yalnız personel geldiyse kişi sabitlenir, saat sorulmaya devam eder.
    else if (prefill?.staffId) locked.push('staff');

    const staffLocked = locked.includes('slot') || locked.includes('staff');

    return {
        customer: prefill?.customer ?? null,
        newCustomerName: null,
        newCustomerPhone: null,
        service: null,
        dateISO: prefill?.dateISO ?? null,
        startMinutes: locked.includes('slot') ? prefill?.startMinutes ?? null : null,
        staffId: staffLocked ? prefill?.staffId ?? null : null,
        note: null,
        locked,
    };
}

/** Sayfa 1 cevaplandı mı? İki soru: kim ve ne. */
export function page1Answered(draft: Draft): boolean {
    return Boolean((draft.customer || draft.newCustomerName) && draft.service);
}

/** Açılışta hangi sayfa. Sayfa 1 doluysa (takvimden gelinmiş olabilir) 2. */
export function nextPhase(draft: Draft): Phase {
    return page1Answered(draft) ? 2 : 1;
}

/** Geri gidilecek yer. `null` dönerse geri yok, akış kapanır. */
export function backPhase(phase: Phase): Phase | null {
    return phase === 2 ? 1 : null;
}

/** Üst çubuğun sağındaki konum: "1 / 2". Başlık sabit, sayfa burada sayılır. */
export function stepLabel(phase: Phase): string {
    return `${phase} / ${PAGE_COUNT}`;
}

/** Ekranın başlığı iki sayfada da aynı — konumu sağdaki sayaç söyler. */
export const FLOW_TITLE = 'Yeni randevu';

/** Sesli okuma için sayfanın adı; ekranda yazmaz. */
export function pageName(phase: Phase): string {
    return phase === 1 ? 'Kim ve ne' : 'Ne zaman';
}

/**
 * Alt çubuğun butonu ne diyor. Eksik seçim varsa buton PASİF ve neyin eksik
 * olduğunu söyler — "Devam" deyip hiçbir şey yapmaz gibi durmaz.
 */
export function actionLabel(phase: Phase, draft: Draft): { label: string; enabled: boolean } {
    if (phase === 1) {
        // Yarım girilmiş numarayla devam edilmez: ya boş ya tam.
        if (draft.newCustomerPhone && !isValidPhone(draft.newCustomerPhone)) {
            return { label: 'Numarayı tamamlayın', enabled: false };
        }
        if (page1Answered(draft)) return { label: 'Devam', enabled: true };
        const missing: string[] = [];
        if (!draft.customer && !draft.newCustomerName) missing.push('Müşteri');
        if (!draft.service) missing.push('hizmet');
        return { label: `${missing.join(' ve ')} seçin`, enabled: false };
    }
    if (!draft.dateISO) return { label: 'Gün seçin', enabled: false };
    if (draft.startMinutes === null || !draft.staffId) return { label: 'Saat seçin', enabled: false };
    return { label: 'Randevuyu oluştur', enabled: true };
}

// ── Müşteri arama ───────────────────────────────────────────────────────────

/**
 * Türkçe küçültme. `toLowerCase()` "I" harfini "i" yapar; Türkçede "ı"dır.
 * "İlknur" araması "ilknur" yazınca bulunmalı, "Isıl" ise "ısıl" ile.
 */
export function trLower(value: string): string {
    return value.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

/** Telefonu ekranda maskeler: "+905321110301" → "0532 ••• 11 03". */
export function maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '').replace(/^90/, '');
    if (digits.length < 10) return phone;
    return `0${digits.slice(0, 3)} ••• ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
}

/**
 * Yazdıkça süzer. Ada VE telefona bakar; adın başından tutan eşleşme öne
 * geçer — "Nih" yazan kişi "Nihan"ı arıyordur, "Canihan"ı değil.
 */
export function filterCustomers(
    list: readonly CustomerOption[],
    query: string,
): CustomerOption[] {
    const needle = trLower(query.trim());
    if (!needle) return [];

    const digits = needle.replace(/\D/g, '');
    const scored: Array<{ customer: CustomerOption; rank: number }> = [];

    for (const customer of list) {
        const name = trLower(customer.name);
        const phone = customer.phone.replace(/\D/g, '');

        if (name.startsWith(needle)) scored.push({ customer, rank: 0 });
        else if (name.split(' ').some((part) => part.startsWith(needle))) scored.push({ customer, rank: 1 });
        else if (name.includes(needle)) scored.push({ customer, rank: 2 });
        else if (digits.length >= 3 && phone.includes(digits)) scored.push({ customer, rank: 3 });
    }

    return scored
        .sort((a, b) => a.rank - b.rank || a.customer.name.localeCompare(b.customer.name, 'tr-TR'))
        .map((entry) => entry.customer);
}

/** Yalnız rakamlar; ülke kodu ve baştaki sıfır atılır. "0532 111 22 33" → "5321112233" */
export function phoneDigits(value: string): string {
    return value.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
}

/** Yazarken okunur hâl: "0532 111 22 33". Maskeleme DEĞİL — bu girdi alanı. */
export function formatPhoneInput(value: string): string {
    const d = phoneDigits(value).slice(0, 10);
    if (!d) return '';
    const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
    return `0${parts.join(' ')}`;
}

/** Türkiye cep telefonu: 5 ile başlayan 10 hane. Boş da geçerli — isteğe bağlı. */
export function isValidPhone(value: string): boolean {
    const d = phoneDigits(value);
    return d.length === 0 || (d.length === 10 && d.startsWith('5'));
}

/** Kaydedilecek biçim: E.164. Boşsa null. */
export function toE164(value: string): string | null {
    const d = phoneDigits(value);
    return d.length === 10 ? `+90${d}` : null;
}

/**
 * Telefonsuz kaydın bedeli ekranda yazılı olsun: hatırlatmalar WhatsApp'tan
 * gidiyor, numarasız müşteri hatırlatma almıyor.
 */
export function phoneNote(value: string | null): string {
    if (!value || !phoneDigits(value)) return 'Telefonsuz kaydedilir — hatırlatma gönderilemez.';
    if (!isValidPhone(value)) return 'Numara eksik görünüyor: 5 ile başlayan 10 hane.';
    return 'Hatırlatmalar bu numaraya gider.';
}

/** Bulunamayan müşteri aynı ekrandan eklenir; buton yazdığı adı gösterir. */
export function newCustomerLabel(query: string): string {
    return `Yeni müşteri: “${query.trim()}”`;
}

// ── Gün seçimi ──────────────────────────────────────────────────────────────

export interface DayOption {
    iso: string;
    /** "Cuma, 14 Ağustos" */
    label: string;
    /** "Bugün" · "Yarın" — yoksa null. */
    relative: string | null;
    /** "Çar" — şeritteki kısaltma; ilk iki günde yerini `relative` alır. */
    short: string;
    /** Ayın kaçı — şeritteki rakam. */
    num: number;
}

/** Bugünden başlayarak `count` gün. Geçmişe randevu yazılmaz. */
export function dayOptions(todayISO: string, count = 14): DayOption[] {
    return Array.from({ length: Math.max(0, count) }, (_, index) => {
        const iso = addDaysISO(todayISO, index);
        return {
            iso,
            label: formatDayLong(iso),
            relative: index === 0 ? 'Bugün' : index === 1 ? 'Yarın' : null,
            short: dayNameShort(iso),
            num: dayNumber(iso),
        };
    });
}

// ── Saat ve kişi ────────────────────────────────────────────────────────────

/** Salonun açık olduğu aralık ve ızgara adımı. */
export const OPEN_FROM = 9 * 60;
export const OPEN_TO = 20 * 60;
export const SLOT_STEP = 30;

export type SlotRow =
    | { kind: 'free'; minutes: number; time: string; staff: StaffOption }
    /**
     * Seçilemez. "Dolu" tek başına cevap değil — kim, hangi saat aralığı.
     * `reason` tek satırlık özet; ray kartı alanları ayrı ayrı diziyor.
     */
    | {
        kind: 'busy'; minutes: number; time: string; reason: string;
        /** Aynı randevunun ardışık kutuları tek karta toplanır. */
        blockingId?: string;
        /** "Merve · Saç boyama" */
        title?: string;
        /** Randevunun müşterisi. */
        customer?: string;
        /** "14:30'a" */
        until?: string;
        /** Hizmet rengi — kartın sol işareti. */
        color?: string;
    }
    /** Seçilemez. Kapalı saatler de sebebini yazar. */
    | { kind: 'closed'; minutes: number; time: string; reason: string };

function overlaps(appointment: Appt, from: number, to: number, excludeId?: string): boolean {
    // Taşınan randevu kendine engel değildir: "12:00 dolu" derken sebebi
    // taşımaya çalıştığın randevunun kendisi olamaz.
    if (excludeId && appointment.id === excludeId) return false;
    // İptal edilmiş randevu yeri tutmaz; silinmemiş olması takvimi kilitlemez.
    if (appointment.status === 'cancelled') return false;
    return toMinutes(appointment.start_time) < to && toMinutes(appointment.end_time) > from;
}

/**
 * O günün boş saatleri. Dolu ve kapalı satırlar da LİSTEDE KALIR: müdür
 * "neden burası yok" sorusunu ekranı terk etmeden cevaplayabilmeli.
 *
 * `onlyStaffId` verilirse yalnız o kişinin günü taranır — takvimde bir
 * personelin sütunundaki boş saate dokununca böyle olur.
 */
export function slotRows(input: {
    appointments: readonly Appt[];
    staff: readonly StaffOption[];
    durationMinutes: number;
    onlyStaffId?: string | null;
    /** Taşınan randevu: kendi yerini dolu saymaz. */
    excludeId?: string;
}): SlotRow[] {
    const { appointments, durationMinutes, onlyStaffId, excludeId } = input;
    const pool = onlyStaffId
        ? input.staff.filter((person) => person.id === onlyStaffId)
        : input.staff;
    const workable = pool.filter((person) => person.available);

    // İzinli/çalışmayan herkesin sebebi tek satırda toplanır; "Kapalı" da
    // gerekçesini yazar.
    const closedReason = pool
        .map((person) => `${person.name} ${person.reason ?? 'çalışmıyor'}`)
        .join(' · ');

    const rows: SlotRow[] = [];
    const duration = Math.max(SLOT_STEP, durationMinutes);

    for (let minutes = OPEN_FROM; minutes + duration <= OPEN_TO; minutes += SLOT_STEP) {
        const time = hhmm(minutes);
        const end = minutes + duration;

        if (workable.length === 0) {
            rows.push({ kind: 'closed', minutes, time, reason: closedReason || 'Salon kapalı' });
            continue;
        }

        const free = workable.find((person) => !appointments.some((appointment) => (
            appointment.staff_id === person.id && overlaps(appointment, minutes, end, excludeId)
        )));

        if (free) {
            rows.push({ kind: 'free', minutes, time, staff: free });
            continue;
        }

        // Herkes dolu: ilk kişinin çakışan randevusunu gerekçe olarak yaz.
        const first = workable[0];
        const blocking = appointments.find((appointment) => (
            appointment.staff_id === first.id && overlaps(appointment, minutes, end, excludeId)
        ));
        rows.push({
            kind: 'busy',
            minutes,
            time,
            reason: blocking
                ? `${first.name} · ${blocking.start_time.slice(0, 5)}–${blocking.end_time.slice(0, 5)}`
                : first.name,
            blockingId: blocking?.id,
            title: blocking ? `${first.name} · ${blocking.service}` : first.name,
            customer: blocking?.customer_name ?? undefined,
            until: blocking ? `${blocking.end_time.slice(0, 5)}'a` : undefined,
            color: blocking?.service_color ?? undefined,
        });
    }

    return rows;
}

/** "15:30 – 16:45" — özetteki tek saat biçimi. */
export function formatRange(startMinutes: number, durationMinutes: number): string {
    return `${hhmm(startMinutes)} – ${hhmm(startMinutes + durationMinutes)}`;
}

/** "₺1.000" — binlik ayracı nokta, kuruş yazılmaz. */
export function formatPrice(amount: number): string {
    return `₺${Math.round(amount).toLocaleString('tr-TR')}`;
}

/** "Kesim + fön · 75 dk · Cuma" — dördüncü adımın tepesindeki krem şerit. */
export function slotHeadline(draft: Draft): string {
    const parts: string[] = [];
    if (draft.service) parts.push(draft.service.name, `${draft.service.minutes} dk`);
    if (draft.dateISO) parts.push(formatDayLong(draft.dateISO).split(',')[0]);
    return parts.join(' · ');
}

// ── Özet ────────────────────────────────────────────────────────────────────

export interface SummaryRow {
    label: string;
    value: string;
    /** Yalnız "Kişi" satırında: baş harfler avatar olarak çizilir. */
    initials?: string;
    color?: string;
    /** Tutar satırı büyük yazılır. */
    emphasis?: boolean;
}

export function customerName(draft: Draft): string {
    return draft.customer?.name ?? draft.newCustomerName ?? '';
}

/** Özet YENİ SORU SORMAZ, yalnız gösterir. Eksik alan varsa satır atlanır. */
export function summaryRows(draft: Draft, staff: readonly StaffOption[]): SummaryRow[] {
    const rows: SummaryRow[] = [];
    if (draft.dateISO) rows.push({ label: 'Gün', value: formatDayLong(draft.dateISO) });
    if (draft.startMinutes !== null && draft.service) {
        rows.push({ label: 'Saat', value: formatRange(draft.startMinutes, draft.service.minutes) });
    }
    if (draft.service) rows.push({ label: 'Hizmet', value: draft.service.name });

    const person = staff.find((candidate) => candidate.id === draft.staffId);
    if (person) {
        rows.push({ label: 'Kişi', value: person.name, initials: person.initials, color: person.color });
    }
    if (draft.service) {
        rows.push({ label: 'Tutar', value: formatPrice(draft.service.price), emphasis: true });
    }
    return rows;
}

/** Oluşturulabilir mi? Dört alanın dördü de dolu olmalı. */
export function canCreate(draft: Draft): boolean {
    return page1Answered(draft)
        && Boolean(draft.dateISO)
        && draft.startMinutes !== null
        && Boolean(draft.staffId);
}

/**
 * Taslaktan randevu kaydı. Saf: `id` dışarıdan gelir ki test edilebilsin.
 *
 * Sunucuda oluşturma ucu yok; bu kayıt sahte takvim kaynağına yazılıyor ve
 * müdür onu takvimde görüyor. Onay, bir mesaj değil, randevunun KENDİSİ.
 */
export function draftToAppointment(
    draft: Draft,
    staff: readonly StaffOption[],
    id: string,
): Appt | null {
    if (!canCreate(draft) || !draft.service || !draft.dateISO || draft.startMinutes === null) {
        return null;
    }
    const person = staff.find((candidate) => candidate.id === draft.staffId);
    return {
        id,
        customer_id: draft.customer?.id ?? null,
        customer_name: customerName(draft),
        customer_phone: draft.customer?.phone ?? toE164(draft.newCustomerPhone ?? ''),
        date: draft.dateISO,
        start_time: `${hhmm(draft.startMinutes)}:00`,
        end_time: `${hhmm(draft.startMinutes + draft.service.minutes)}:00`,
        service: draft.service.name,
        service_color: draft.service.color,
        status: 'confirmed',
        staff_id: person?.id ?? draft.staffId,
        notes: draft.note,
        arrived_at: null,
        service_ended_at: null,
    };
}

/** Ad ve telefon yeter demiştik; ad boşsa müşteri eklenmez. */
export function isValidNewCustomer(name: string): boolean {
    return name.trim().length >= 2;
}

// ── Geçici kaynak ───────────────────────────────────────────────────────────
// Sunucuda müşteri arama ve hizmet listesi uçları YOK; yazılacak. Tasarımdaki
// senaryonun verisi.

/**
 * Hizmet renkleri tasarımın kil ailesinden geliyor. Eskiden "Saç boyama"
 * `#FF5A1F` idi — turuncu envanteri ZAMAN ve EYLEM için ayrılmış, bir hizmet
 * türünü boyayamaz. Renkler kartı boyamıyor, 3 noktalık bir işaret olarak
 * duruyor.
 */
export const mockServices: ServiceOption[] = [
    { id: 'kesim-fon', name: 'Kesim + fön', minutes: 75, price: 1000, color: '#C08457' },
    { id: 'kesim', name: 'Kesim', minutes: 30, price: 450, color: '#EBCFB6' },
    { id: 'boya', name: 'Saç boyama', minutes: 90, price: 2400, color: '#7E93A8' },
    { id: 'keratin', name: 'Keratin bakımı', minutes: 45, price: 1800, color: '#8FA98C' },
    { id: 'kas', name: 'Kaş alma', minutes: 20, price: 300, color: '#B99BC0' },
    { id: 'maske', name: 'Saç bakım maskesi', minutes: 60, price: 900, color: '#8FA98C' },
    { id: 'fon', name: 'Fön', minutes: 30, price: 400, color: '#C08457' },
];

export const mockCustomers: CustomerOption[] = [
    { id: 'c-nihan', name: 'Nihan Arı', phone: '+905321111290', hint: 'son 2 Ağu', color: '#2D8F32' },
    { id: 'c-nihal', name: 'Nihal Kurt', phone: '+905551110833', hint: 'son 14 Haz' },
    { id: 'c-zeynep', name: 'Zeynep Kaya', phone: '+905321110302', hint: 'Bugün 11:00 · Saç boyama', color: '#FF5A1F' },
    { id: 'c-elif', name: 'Elif Demir', phone: '+905321110303', hint: 'Bugün 12:00 · Keratin bakımı', color: '#B87A00' },
    { id: 'c-buket', name: 'Buket Şahin', phone: '+905321110301', hint: 'Bugün 09:00 · Kesim', color: '#2D8F32' },
    { id: 'c-nur', name: 'Nur Aksoy', phone: '+905321110304', hint: 'Bugün 13:00 · Kaş alma', color: '#B87A00' },
    { id: 'c-ayse', name: 'Ayşe Yılmaz', phone: '+905321110305', hint: 'son 30 Tem' },
    { id: 'c-hakan', name: 'Hakan Toprak', phone: '+905321110308', hint: 'son 9 Tem' },
];

/** Arama boşken altta duran liste: en son gelenler. */
export function recentCustomers(list: readonly CustomerOption[], count = 4): CustomerOption[] {
    return list.filter((customer) => customer.hint.startsWith('Bugün')).slice(0, count);
}

/** Bugüne ne kadar uzak — geçmiş güne randevu yazılmasın diye. */
export function isPastDay(todayISO: string, dayISO: string): boolean {
    return daysBetween(todayISO, dayISO) < 0;
}

// ── Sayfa 2 · gün bölümleri ────────────────────────────────────────────────
//
// Tasarımın v1'inde koyu tema sabahı 10:00'da başlatıyor, açık tema 09:00'da
// başlatıyordu; 12:30 bir karede "Sabah"a, diğerinde "Öğleden sonra"ya
// giriyordu. Sınır artık bir SABİT ve tek kaynağı burası.

export interface DaySection {
    key: 'morning' | 'afternoon' | 'evening';
    title: string;
    from: number;
    to: number;
}

export const DAY_SECTIONS: readonly DaySection[] = [
    { key: 'morning', title: 'Sabah', from: 9 * 60, to: 12 * 60 },
    { key: 'afternoon', title: 'Öğleden sonra', from: 12 * 60, to: 17 * 60 },
    { key: 'evening', title: 'Akşam', from: 17 * 60, to: 20 * 60 },
];

export function sectionOf(minutes: number): DaySection {
    return DAY_SECTIONS.find((s) => minutes >= s.from && minutes < s.to) ?? DAY_SECTIONS.at(-1)!;
}

// ── Blok ölçüsünün türetilmesi ─────────────────────────────────────────────
//
// Bir 30 dakika, rayda 44 nokta. Seçili aralık da dolu randevu da AYNI
// formülden çıkar — tasarım belgesi dolu bloğa 96 sabit yükseklik vermişti ve
// o yükseklik sürenin karşılığı değildi: kart "10:30'a" derken sütundaki son
// etiket 10:00'da kalıyordu. Blok alt kenarı yalan söylememeli.

/** Rayda bir 30 dakikanın yüksekliği. */
export const SLOT_ROW = 44;
/** Blok ile satır çizgisi arasındaki nefes. */
export const BLOCK_GAP = 8;
/** Sol sütundaki ilk saat etiketinin üstten payı. */
export const LABEL_TOP = 14;

/**
 * Sürenin blok yüksekliği: 75 dk → 110, 90 dk → 132.
 *
 * Bir hücrenin altına İNMEZ. Izgara adımı 30 dakika; 20 dakikalık bir hizmet
 * de o hücreyi tamamen işgal ediyor, yani 29 pt'lik bir blok çizmek süreyi
 * değil hücreyi yanlış anlatırdı.
 */
export function blockHeight(durationMinutes: number): number {
    return Math.max(SLOT_ROW, (durationMinutes / SLOT_STEP) * SLOT_ROW);
}

/** Bloğun rayda kapladığı toplam yer — blok + nefes. */
export function blockRowHeight(durationMinutes: number): number {
    return blockHeight(durationMinutes) + BLOCK_GAP;
}

/** Blok içindeki 30 dakikalık tiklerin üstten konumu: 75 dk → [36, 80]. */
export function blockTicks(durationMinutes: number): number[] {
    const ticks: number[] = [];
    for (let n = 1; n * SLOT_STEP < durationMinutes; n += 1) ticks.push(n * SLOT_ROW - BLOCK_GAP);
    return ticks;
}

/** Bloğun solundaki saat etiketleri: 11:00 (vurgulu) · 11:30 · 12:00. */
export function blockLabels(startMinutes: number, durationMinutes: number): Array<{
    time: string; top: number; lead: boolean;
}> {
    const labels: Array<{ time: string; top: number; lead: boolean }> = [];
    for (let n = 0; n * SLOT_STEP < durationMinutes; n += 1) {
        labels.push({
            time: hhmm(startMinutes + n * SLOT_STEP),
            top: LABEL_TOP + n * SLOT_ROW,
            lead: n === 0,
        });
    }
    return labels;
}

// ── "14:30'a" — saatin yönelme hâli ────────────────────────────────────────
//
// Dolu kartın sağındaki bitiş saati Türkçe okunuşa göre ek alıyor: 10:30'A
// ama 09:50'YE. Ek, saatin okunuşunun son ünlüsünden çıkar; sabit "'a"
// yazmak "elliya" gibi bir şey üretirdi.

const MINUTE_SUFFIX: Record<number, string> = {
    5: 'e', 10: 'a', 15: 'e', 20: 'ye', 25: 'e', 30: 'a',
    35: 'e', 40: 'a', 45: 'e', 50: 'ye', 55: 'e',
};
/** Saat başları: "on altıya" → a, "on ikiye" → ye. */
const HOUR_SUFFIX: Record<number, string> = {
    0: 'a', 1: 'e', 2: 'ye', 3: 'e', 4: 'e', 5: 'e', 6: 'ya', 7: 'ye',
    8: 'e', 9: 'a', 10: 'a', 11: 'e', 12: 'ye', 13: 'e', 14: 'e', 15: 'e',
    16: 'ya', 17: 'ye', 18: 'e', 19: 'a', 20: 'ye', 21: 'e', 22: 'ye', 23: 'e',
};

/** "14:30" → "14:30'a" · "09:50" → "09:50'ye" */
export function untilLabel(time: string): string {
    const [hour, minute] = time.split(':').map(Number);
    const suffix = minute === 0 ? HOUR_SUFFIX[hour] ?? 'a' : MINUTE_SUFFIX[minute] ?? 'e';
    return `${time}'${suffix}`;
}

// ── Ray ────────────────────────────────────────────────────────────────────

export type RailItem =
    | { kind: 'free'; minutes: number; time: string; staff: StaffOption }
    | { kind: 'closed'; minutes: number; time: string; reason: string }
    /** Ardışık kutulara yayılan tek randevu; `span` kaç 30 dakika olduğu. */
    | {
        kind: 'busy'; minutes: number; time: string; span: number; reason: string;
        title: string; customer?: string; until?: string; color?: string;
    }
    /** Müdürün seçtiği aralık — süresi kadar sürekli bir blok. */
    | {
        kind: 'pick'; minutes: number; time: string; range: string;
        durationMinutes: number; staff: StaffOption | null;
    };

export interface RailSection {
    section: DaySection;
    items: RailItem[];
    /** Bölümdeki seçilebilir kutu sayısı — "2 boş". */
    freeCount: number;
}

/**
 * Satırları rayın diline çevirir: boş zaman ÇÖKER (ince satır), dolu zaman
 * KART OLUR ve sebebini kendi içinde taşır. Ardışık dolu kutular tek karta
 * toplanır — üç ayrı "Merve · Saç boyama" satırı aynı randevuyu üç kez
 * anlatırdı.
 */
export function railSections(input: {
    rows: readonly SlotRow[];
    /** Seçili başlangıç; o kutunun yerine süre bloğu geçer. */
    selectedMinutes?: number | null;
    durationMinutes?: number;
    selectedStaff?: StaffOption | null;
}): RailSection[] {
    const { rows, selectedMinutes = null, durationMinutes = SLOT_STEP, selectedStaff = null } = input;
    const sections: RailSection[] = DAY_SECTIONS.map((section) => ({ section, items: [], freeCount: 0 }));
    const bucket = (minutes: number) => sections.find((s) => s.section === sectionOf(minutes))!;

    /** Seçili bloğun kapsadığı kutular listeden düşer; blok onları temsil eder. */
    const pickEnd = selectedMinutes === null ? null : selectedMinutes + durationMinutes;

    for (const row of rows) {
        if (selectedMinutes !== null && row.minutes === selectedMinutes) {
            bucket(row.minutes).items.push({
                kind: 'pick',
                minutes: row.minutes,
                time: row.time,
                range: formatRange(row.minutes, durationMinutes),
                durationMinutes,
                staff: selectedStaff ?? (row.kind === 'free' ? row.staff : null),
            });
            continue;
        }
        if (pickEnd !== null && selectedMinutes !== null
            && row.minutes > selectedMinutes && row.minutes < pickEnd) continue;

        const target = bucket(row.minutes);

        if (row.kind === 'free') {
            target.items.push({ kind: 'free', minutes: row.minutes, time: row.time, staff: row.staff });
            target.freeCount += 1;
            continue;
        }
        if (row.kind === 'closed') {
            target.items.push({ kind: 'closed', minutes: row.minutes, time: row.time, reason: row.reason });
            continue;
        }

        const last = target.items.at(-1);
        if (last && last.kind === 'busy' && row.blockingId && last.reason === row.reason) {
            last.span += 1;
            continue;
        }
        target.items.push({
            kind: 'busy',
            minutes: row.minutes,
            time: row.time,
            span: 1,
            reason: row.reason,
            title: row.title ?? row.reason,
            customer: row.customer,
            until: row.until,
            color: row.color,
        });
    }

    // Seçim bir bölümün TEK boş kutusuysa sayaç sıfırlanmasın: seçilen kutu da
    // boştu, müdür onu seçtiği için bölüm "0 boş" görünmemeli.
    if (selectedMinutes !== null) bucket(selectedMinutes).freeCount += 1;

    return sections.filter((s) => s.items.length > 0);
}

/** "2 boş" · hiç yoksa "dolu". Sayaç veriden çıkar, elle yazılmaz. */
export function freeLabel(count: number): string {
    return count === 0 ? 'dolu' : `${count} boş`;
}

// ── Sesli okuma ────────────────────────────────────────────────────────────
//
// Dolu ve kapalı kutular RENKLE ayrışmıyor, kelimeyle de ayrışıyor: sebep
// cümlenin içinde geçmeli.

export function slotSpeech(item: RailItem): string {
    switch (item.kind) {
        case 'free': return `${item.time} boş, ${item.staff.name}`;
        case 'closed': return `${item.time} kapalı, ${item.reason}`;
        case 'busy': return `${item.time} dolu, ${item.title}${item.until ? `, ${item.until}` : ''}`;
        default: return `${item.range} seçili${item.staff ? `, ${item.staff.name} yapacak` : ''}`;
    }
}

export function daySpeech(day: DayOption, selected: boolean): string {
    return `${day.relative ?? day.label}${selected ? ', seçili' : ''}`;
}
