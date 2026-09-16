/**
 * Müdür 25 — randevu kartının karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Bu bir "ayrıntı sayfası" değil, bir KARAR sayfası. Müdür günde otuz kez
 * aynı soruyu soruyor ve cevabı dört şeyden biri: geldi mi işaretle, saatini
 * ya da personelini değiştir, iptal et, müşterinin kim olduğuna bak.
 *
 * Müdür 08'in dört eşit gri satırı ikiye ayrıldı: saat ve personel günde
 * onlarca kez değişir (jeton), hizmet ve not ayda birkaç kez (satır). Ve
 * artık ÖLÜ KONTROL YOK: chevron gösteren her satır gerçekten bir şey açıyor.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 25 Randevu Karti.html`.
 */

import { maskPhone, type ServiceOption } from './createFlow.ts';
import { initialsOf } from './text.ts';
import {
    dayNameShort, formatDayFull, hhmm, toMinutes, todayISO, type Appt,
} from './calendar.ts';

/** "Elif" + "Demir" — ilk ad ince, soyad kalın yazılır. */
export function splitName(name: string): { given: string; family: string } {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return { given: '', family: words[0] ?? '' };
    return { given: words.slice(0, -1).join(' '), family: words.at(-1) ?? '' };
}

export function durationMinutes(appointment: Appt): number {
    let duration = toMinutes(appointment.end_time) - toMinutes(appointment.start_time);
    if (duration < 0) duration += 24 * 60;
    return duration;
}

// ── Kimlik bloğu ────────────────────────────────────────────────────────────

export interface ApptIdentity {
    /** "Cumartesi 22 Ağustos" — GÜN BAŞLIKTA. Eskiden yalnız satır içindeydi. */
    day: string;
    /** Bugünse yanına turuncu "Bugün" yazılır; başka günde hiç çizilmez. */
    isToday: boolean;
    from: string;
    to: string;
    duration: number;
    service: string;
    /** Atanmamışsa `null` — boş avatar "atanmamış" demenin en kötü yolu. */
    staff: string | null;
    initials: string;
}

/**
 * Üç rozet yerine ZAMAN SATIRI + iki rozet.
 *
 * Saat en çok bakılan bilgi; rozet kutusunun içinde 13 puntoya sıkışmasının
 * bir sebebi yoktu.
 */
export function identityOf(
    appointment: Appt,
    staffName?: string | null,
    today: string = todayISO(),
): ApptIdentity {
    return {
        day: formatDayFull(appointment.date),
        isToday: appointment.date === today,
        from: appointment.start_time.slice(0, 5),
        to: appointment.end_time.slice(0, 5),
        duration: durationMinutes(appointment),
        service: appointment.service,
        staff: staffName ?? null,
        initials: staffName ? initialsOf(staffName) : '',
    };
}

// ── Durum ───────────────────────────────────────────────────────────────────

/**
 * Beş hâl, TEK alan.
 *
 * İki geliş damgası ayrı: `customer_arrived_at` müşterinin salona gelişi
 * (müdür basar), `arrived_at` hizmetin başlangıcı (personel basar). Sayaç
 * ikincisini okur.
 */
export type ApptState = 'waiting' | 'arrived' | 'running' | 'done' | 'cancelled';

export interface StateLine {
    kind: ApptState;
    /** Kelime HER HÂLDE yazılı — renk tek başına anlam taşımaz. */
    word: string;
    /** Sağdaki bağlam. Bilinmiyorsa `null` ve hiç çizilmez. */
    context: string | null;
    /** Yalnız `running` nabız atar. */
    pulse: boolean;
}

export function stateOf(appointment: Appt): ApptState {
    if (appointment.status === 'cancelled') return 'cancelled';
    if (appointment.service_ended_at || appointment.status === 'completed') return 'done';
    if (appointment.arrived_at) return 'running';
    if (appointment.customer_arrived_at) return 'arrived';
    return 'waiting';
}

const STATE_WORD: Record<ApptState, string> = {
    waiting: 'Bekliyor',
    arrived: 'Geldi · bekliyor',
    running: 'İşlem sürüyor',
    done: 'Tamamlandı',
    cancelled: 'İptal edildi',
};

/** "10 dk sonra" / "20 dk önce" — randevu saatine olan uzaklık. */
/**
 * "45 dk sonra" · "2 sa 15 dk sonra".
 *
 * Saatlerce uzaktaki bir randevu için "585 dk sonra" bir sayı yığınıdır;
 * müdür onu saate çevirmek zorunda kalır. Bir saati geçince saat yazılır.
 */
function untilLabel(appointment: Appt, nowMinutes: number): string {
    const delta = toMinutes(appointment.start_time) - nowMinutes;
    if (delta === 0) return 'Şimdi';
    const span = Math.abs(delta);
    const suffix = delta > 0 ? 'sonra' : 'önce';
    if (span < 60) return `${span} dk ${suffix}`;
    const hours = Math.floor(span / 60);
    const minutes = span % 60;
    return minutes === 0
        ? `${hours} sa ${suffix}`
        : `${hours} sa ${minutes} dk ${suffix}`;
}

/**
 * Durum şeridinin içeriği.
 *
 * Bağlam UYDURULMAZ: damga yoksa saat yazılmaz. "09:38'de geldi" ancak
 * gerçekten bir damga varsa çıkar.
 */
export function stateLine(appointment: Appt, nowMinutes: number): StateLine {
    const kind = stateOf(appointment);
    /*
     * Damga İKİ BİÇİMDE geliyor: "10:32:00" (saat sütunu) ve
     * "2026-08-13T10:32:00+03:00" (zaman damgası). Körü körüne ilk beş
     * karakteri almak ikincisinde "2026-" yazdırıyordu — ekranda
     * "2026-’de başladı" diye çıkıyordu.
     */
    const at = (stamp: string | null | undefined) => {
        if (!stamp) return null;
        const time = stamp.includes('T') ? stamp.slice(11, 16) : stamp.slice(0, 5);
        return /^\d{2}:\d{2}$/.test(time) ? `${time}’de` : null;
    };

    if (kind === 'cancelled') {
        return { kind, word: STATE_WORD[kind], context: null, pulse: false };
    }
    if (kind === 'done') {
        const stamp = at(appointment.service_ended_at);
        return { kind, word: STATE_WORD[kind], context: stamp ? `${stamp} bitti` : null, pulse: false };
    }
    if (kind === 'running') {
        const stamp = at(appointment.arrived_at);
        return { kind, word: STATE_WORD[kind], context: stamp ? `${stamp} başladı` : null, pulse: true };
    }
    if (kind === 'arrived') {
        const stamp = at(appointment.customer_arrived_at);
        return { kind, word: STATE_WORD[kind], context: stamp ? `${stamp} geldi` : null, pulse: false };
    }
    return { kind, word: STATE_WORD[kind], context: untilLabel(appointment, nowMinutes), pulse: false };
}

/**
 * Geldi / Gelmedi YALNIZ `waiting` hâlinde çizilir.
 *
 * Öteki dört hâlde hiç render edilmez — devre dışı gri buton değil, yokluk.
 * Gelmiş bir müşteriye "geldi mi?" diye sormak anlamsız.
 */
export function showsAttendance(appointment: Appt): boolean {
    return stateOf(appointment) === 'waiting';
}

/** İptal edilmiş randevuda düzenlenecek bir şey yoktur. */
export function isEditable(appointment: Appt): boolean {
    return stateOf(appointment) !== 'cancelled';
}

export const CANCELLED_INFO = 'İptal edilmiş randevu düzenlenmez. Yeni randevu verin.';

// ── Müşteri özeti ───────────────────────────────────────────────────────────

export interface VisitSummary {
    /** `known` krem kart (tersine dönen düzlem), `new` sayfanın düzlemi. */
    kind: 'known' | 'new';
    /**
     * Yuvarlaktaki baş harfler.
     *
     * Önce burada ziyaret numarası yazıyordu — ama yanındaki başlık zaten
     * "3. ziyaret" diyordu; yuvarlak aynı şeyi ikinci kez söylüyor, hiçbir
     * yeni bilgi taşımıyordu. Artık KİMLİĞİ taşıyor ve akıştaki müşteri
     * balonuyla aynı şekli konuşuyor: yuvarlak her yerde "bu müşteri, basınca
     * kartı açılır" demek.
     */
    initials: string;
    /** Büyük rakam. Paket varsa kullanılan seans, yoksa ziyaret numarası. */
    lead: string;
    /** Küçük ek: "/8" ya da ".". Paket ve ziyaret dışında boş. */
    trailing: string;
    headline: string;
    sub: string;
    /** Rozetler; bilinmeyen alan rozet ÜRETMEZ. */
    chips: string[];
    /** Sessiz (kenarlıklı) rozetler — yalnız `new` hâlinde. */
    quiet: string[];
    /**
     * Sağdaki ok. Açacak bir kart yoksa `false` ve ok HİÇ ÇİZİLMEZ —
     * bu sayfanın en büyük şikâyeti ölü kontroldü.
     */
    opens: boolean;
}

/**
 * Geçmişi bilinmeyen müşteride kartın yerini BOŞLUK ALMAZ: "yeni müşteri"
 * bir bilgidir. Aynı çerçeve, aynı 14 dolgu — ama dolgusuz, 1 px kenarlıkla.
 */
export function visitSummary(appointment: Appt): VisitSummary {
    const info = appointment.info;
    const phone = appointment.customer_phone ? maskPhone(appointment.customer_phone) : null;

    if (!info || (info.visitNo === null && !info.pkg && !info.lastVisit)) {
        return {
            kind: 'new',
            initials: initialsOf(appointment.customer_name),
            lead: 'İlk',
            trailing: '',
            headline: 'Yeni müşteri',
            sub: 'İlk ziyaret · geçmiş kayıt yok',
            // Bakiyesi olmayan müşteri için "Bakiye ₺0" yazmak bilgi değil gürültü.
            chips: phone ? [phone] : [],
            quiet: ['Telefonla verildi'],
            opens: false,
        };
    }

    const chips: string[] = [];
    // Bakiye BİLİNMİYORSA rozet çizilmez; "₺0" bir varsayım olurdu.
    if (info.balance !== undefined && info.balance !== null) {
        chips.push(`Bakiye ₺${Math.round(info.balance).toLocaleString('tr-TR')}`);
    }
    if (phone) chips.push(phone);

    return {
        kind: 'known',
        initials: initialsOf(appointment.customer_name),
        lead: info.pkg ? String(info.pkg.used) : String(info.visitNo ?? '—'),
        trailing: info.pkg ? `/${info.pkg.total}` : '.',
        headline: info.pkg
            ? `${info.pkg.name} · ${info.pkg.used}/${info.pkg.total}`
            : `${info.visitNo}. ziyaret`,
        sub: info.lastVisit ? `Son: ${info.lastVisit}` : 'İlk ziyaret',
        chips,
        quiet: [],
        opens: true,
    };
}

// ── Değiştir: iki jeton + iki satır ─────────────────────────────────────────

export type ChangeAction = 'time' | 'staff' | 'service' | 'note';

export interface ChangeTile {
    action: 'time' | 'staff';
    icon: 'clock' | 'swap';
    /** Küçük etiket — ne yapacağını söyler. */
    kicker: string;
    /** Büyük değer — NE OLDUĞUNU söyler. Vaat değil, olgu. */
    value: string;
    /** Yalnız personel jetonunda. */
    initials?: string;
}

/**
 * Hizmetin ücreti — salonun GERÇEK kataloğundan. Listede yoksa ya da fiyatı
 * yazılmamışsa `null`, ve o zaman satırda yazılmaz.
 *
 * Bir süre sahte katalogdan (`mockServices`) okunuyordu: kart, salonun
 * hiç koymadığı bir fiyatı gösteriyordu.
 */
export function priceOfService(name: string, services: readonly ServiceOption[]): number | null {
    return services.find((service) => service.name === name)?.price ?? null;
}

/** Saat ve personel günde onlarca kez değişir: jeton, h84, değeri büyük. */
export function changeTiles(appointment: Appt, staffName?: string | null): ChangeTile[] {
    return [
        {
            action: 'time',
            icon: 'clock',
            kicker: 'Saati değiştir',
            value: `${dayNameShort(appointment.date)} ${appointment.start_time.slice(0, 5)}`,
        },
        {
            action: 'staff',
            icon: 'swap',
            kicker: 'Personeli değiştir',
            value: staffName ?? 'Atanmamış',
            initials: staffName ? initialsOf(staffName) : undefined,
        },
    ];
}

export interface ChangeRow {
    action: 'service' | 'note';
    title: string;
    /** O anki değer. Satır ne yapacağını değil, NE OLDUĞUNU da söyler. */
    value: string;
}

/** Hizmet ve not ayda birkaç kez değişir: normal satır, h62. */
export function changeRows(appointment: Appt, services: readonly ServiceOption[]): ChangeRow[] {
    const price = priceOfService(appointment.service, services);
    return [
        {
            action: 'service',
            title: 'Hizmeti değiştir',
            // Para bilgisi ASLA kırpılmaz; kırpma hizmet adının kuyruğundan.
            value: price === null
                ? appointment.service
                : `${appointment.service} · ₺${price.toLocaleString('tr-TR')}`,
        },
        {
            action: 'note',
            title: 'Notu düzenle',
            value: appointment.notes?.trim() ? appointment.notes.trim() : 'Not yok',
        },
    ];
}

// ── B · Hizmeti değiştir ────────────────────────────────────────────────────

export interface ServiceChoice {
    id: string;
    name: string;
    minutes: number;
    /** `null` — katalogda fiyat yok; satırda yazılmaz. */
    price: number | null;
    /** Hizmetin rengi — randevu bloğu değişen hizmetin rengini alsın. */
    color: string;
    selected: boolean;
    /** Süre uzuyor mu — rakam kalınlaşır, değişimin yönü okunur. */
    longer: boolean;
    /**
     * Çakışma. Seçenek ENGELLENMEZ, uyarısı satırın içinde yazılır: müdür
     * bilerek çakıştırabilir, salonda iki işi paralel yürütmek olağan.
     * Engellemek müdürü uygulamanın dışına iter.
     */
    clash: string | null;
}

export const SERVICE_SHEET_TITLE = 'Hizmeti değiştir';
export const SERVICE_SHEET_HINT = 'Süre değişirse randevu bloğu uzar.';

/** "Elif Demir · Cumartesi 10:30 · Selin ile" — sheet kendi bağlamını söyler. */
export function serviceSheetSubtitle(appointment: Appt, staffName?: string | null): string {
    const parts = [
        appointment.customer_name,
        `${formatDayFull(appointment.date).split(' ')[0]} ${appointment.start_time.slice(0, 5)}`,
    ];
    if (staffName) parts.push(`${staffName} ile`);
    return `${parts.join(' · ')}. ${SERVICE_SHEET_HINT}`;
}

/**
 * Her seçeneğin YENİ bitiş saati hesaplanır ve o personelin o günkü
 * bloklarıyla kesişim aranır — seçmeden ÖNCE.
 */
export function serviceChoices(
    appointment: Appt,
    dayAppointments: readonly Appt[],
    staffName: string | null | undefined,
    /**
     * Salonun kataloğu. Sahte katalogdan seçilen bir hizmet GERÇEK randevuya
     * yazılıyordu — salonun hiç tanımlamadığı bir ad ve süreyle.
     */
    services: readonly ServiceOption[],
): ServiceChoice[] {
    const current = durationMinutes(appointment);
    const start = toMinutes(appointment.start_time);

    return services.map((service) => {
        const end = start + service.minutes;
        const blocking = dayAppointments.find((other) => (
            other.id !== appointment.id
            && other.staff_id === appointment.staff_id
            && other.status !== 'cancelled'
            && toMinutes(other.start_time) < end
            && toMinutes(other.end_time) > start
        ));
        return {
            id: service.id,
            name: service.name,
            minutes: service.minutes,
            price: service.price,
            color: service.color,
            selected: service.name === appointment.service,
            longer: service.minutes > current,
            clash: blocking
                ? `${staffName ?? 'Personel'} · ${blocking.start_time.slice(0, 5)}–${blocking.end_time.slice(0, 5)} ile çakışır`
                : null,
        };
    });
}

/** Seçilen hizmetin randevuya uygulanmış hâli — bitiş saati de kayar. */
export function applyService(appointment: Appt, choice: ServiceChoice): Appt {
    return {
        ...appointment,
        service: choice.name,
        // Renk de hizmetle birlikte değişiyor — masaüstünün düzenleme
        // penceresi gibi. Eski renkte kalan blok takvimde yanlış hizmeti
        // işaret ederdi.
        service_color: choice.color,
        end_time: `${hhmm(toMinutes(appointment.start_time) + choice.minutes)}:00`,
    };
}

// ── C · Notu düzenle ────────────────────────────────────────────────────────

export const NOTE_TITLE = 'Notu düzenle';
/** Müdürün "bunu müşteri okur mu" tereddüdünü kaldırır. */
export const NOTE_HINT = 'Salonun notu. Müşteri görmez, müşteri kartına yazılmaz.';
export const NOTE_SCOPE = 'Bu randevuya ait';

/** Boş not SİLME demek ve onay sorulmaz: geri alınabilir bir iş. */
export function applyNote(appointment: Appt, text: string): Appt {
    const clean = text.trim();
    return { ...appointment, notes: clean.length > 0 ? clean : null };
}

// ── D · İki onay, aynı iskelet, farklı ağırlık ──────────────────────────────

export type DestructiveAction = 'cancel' | 'delete';

export interface DestructiveOption {
    action: DestructiveAction;
    title: string;
    body: string;
    danger: boolean;
}

/**
 * İkisi FARKLI iş: iptal randevuyu takvimde bırakır ve işaretler, silme
 * kaydı yok eder.
 */
export const destructiveOptions: DestructiveOption[] = [
    {
        action: 'cancel',
        title: 'Randevuyu iptal et',
        // "Müşteriye haber gider" YAZIYORDU ve YANLIŞTI: masaüstünde iptalde
        // haber giden yer BEKLEME LİSTESİ, iptal edilen müşteriye hiçbir şey
        // gitmiyor. Müdür haber verildiğini sanıp aramazsa müşteri kapıya
        // gelir — bu cümle gerçek bir zarar üretirdi.
        body: 'Randevu takvimde kalır, “iptal edildi” diye işaretlenir. Müşteriye otomatik haber gitmez, siz arayın.',
        danger: false,
    },
    {
        action: 'delete',
        title: 'Randevuyu sil',
        body: 'Silinen randevu geri gelmez, takvimden tamamen kalkar. Gelmeyen müşteri için “Gelmedi”yi kullanın.',
        danger: true,
    },
];

/** Sayfada kalan tek ipucu — iki satırlık cümle KARAR ANINA taşındı. */
export const CANCEL_HINT = 'Takvimde kalır, iptal işaretlenir';
export const DELETE_HINT = 'Geri alınamaz';
export const DELETE_HINT_LONG = 'Geri alınamaz · takvimden tamamen kalkar';

export interface ConfirmCopy {
    action: DestructiveAction;
    title: string;
    body: string;
    name: string;
    /** "Cumartesi 22 Ağustos · 10:30 – 11:15 · Selin" */
    line: string;
    confirm: string;
    cancel: string;
    /**
     * Silme dokununca değil, BASILI TUTUNCA çalışır. Fark bir kelimede değil
     * bir jestte — okumadan geçen müdür bile duruyor.
     */
    hold: boolean;
}

export function confirmCopy(
    action: DestructiveAction,
    appointment: Appt,
    staffName?: string | null,
): ConfirmCopy {
    const option = destructiveOptions.find((item) => item.action === action);
    const parts = [
        formatDayFull(appointment.date),
        `${appointment.start_time.slice(0, 5)} – ${appointment.end_time.slice(0, 5)}`,
    ];
    if (staffName) parts.push(staffName);

    return {
        action,
        title: action === 'cancel' ? 'Randevu iptal edilsin mi?' : 'Randevu silinsin mi?',
        body: option?.body ?? '',
        name: appointment.customer_name,
        line: parts.join(' · '),
        confirm: option?.title ?? '',
        // Dolu buton KALICI olanı değil GÜVENLİ olanı taşır: parmak
        // yanlışlıkla dolu butona düşerse hiçbir şey olmuyor.
        cancel: 'Vazgeç',
        hold: action === 'delete',
    };
}

/** "Elif Demir · 12:00" — kart menüsünün başlığı (Müdür 07c). */
export function destructiveTitle(appointment: Appt): string {
    return `${appointment.customer_name} · ${appointment.start_time.slice(0, 5)}`;
}
