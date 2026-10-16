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
import { packageLine } from './packageBook.ts';
import { waNudgeText } from './actionPill.ts';
import { dialable, normalizePhone, waLink } from './phone.ts';
import {
    addDaysISO, dayNameShort, formatDayFull, hhmm, toMinutes, todayISO, type Appt,
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
    /**
     * Personel pili çizilir mi. Tek kişilikte HAYIR (v4 · karar 3): pil
     * sahibin personel satırını, yani işletmenin adını gösterirdi; boş
     * bırakılsa "Atanmamış" derdi — ikisi de yanlış.
     */
    crew: boolean;
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
    solo = false,
): ApptIdentity {
    const shown = solo ? null : staffName ?? null;
    return {
        day: formatDayFull(appointment.date),
        isToday: appointment.date === today,
        from: appointment.start_time.slice(0, 5),
        to: appointment.end_time.slice(0, 5),
        duration: durationMinutes(appointment),
        service: appointment.service,
        staff: shown,
        initials: shown ? initialsOf(shown) : '',
        crew: !solo,
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
    /*
     * Zaman damgası YEREL SAATE çevriliyor (2026-10-16, telefonda bulundu).
     * Sunucu damgayı UTC dönüyor ("…T21:19:00+00:00"); dizgeden kesmek 00:19'da
     * biten işi "21:19'de bitti" yazdırıyordu — üç saat geri. Kumanda aynı
     * damgayı tarih nesnesinden okuyup doğru gösteriyordu. Saat sütunu
     * ("10:32:00") dilimsiz, olduğu gibi yazılıyor.
     */
    const at = (stamp: string | null | undefined) => {
        if (!stamp) return null;
        if (!stamp.includes('T')) {
            const time = stamp.slice(0, 5);
            return /^\d{2}:\d{2}$/.test(time) ? `${time}’de` : null;
        }
        const ms = Date.parse(stamp);
        if (!Number.isFinite(ms)) return null;
        const local = new Date(ms);
        const two = (n: number) => String(n).padStart(2, '0');
        return `${two(local.getHours())}:${two(local.getMinutes())}’de`;
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
 * Geldi / Gelmedi YALNIZ `waiting` hâlinde ve YALNIZ RANDEVUNUN GÜNÜNDE
 * çizilir.
 *
 * Öteki dört hâlde hiç render edilmez — devre dışı gri buton değil, yokluk.
 * Gelmiş bir müşteriye "geldi mi?" diye sormak anlamsız.
 *
 * Başka günün randevusuna da sorulmuyor (2026-10-13, telefonda görüldü):
 * yarının randevusuna bu akşam "Geldi" basılabiliyordu; ertesi sabah Gün
 * kartı "BEKLİYOR · 177 dk · 21:29’da geldi" dedi. Damganın günü 12 saatlik
 * payla süzülüyor (`dayStamp`) ve akşamki damga o payın İÇİNDE kalıyordu —
 * kök burası: yanlış günün sorusu hiç sorulmamalı.
 */
export function showsAttendance(appointment: Appt, today: string): boolean {
    return stateOf(appointment) === 'waiting' && appointment.date === today;
}

/** İptal edilmiş randevuda düzenlenecek bir şey yoktur. */
export function isEditable(appointment: Appt): boolean {
    return stateOf(appointment) !== 'cancelled';
}

export const CANCELLED_INFO = 'İptal edilmiş randevu düzenlenmez. Yeni randevu verin.';

/**
 * Saati, personeli ve hizmeti değişebilir mi — yalnız henüz YAPILMAMIŞ ya
 * da sürmekte olan randevuda.
 *
 * Tamamlanan randevu bir KAYIT (2026-10-13, telefon: "tamamlanan
 * randevularda saati değiştir, hizmeti değiştir olması mantıksız"):
 *   • saat — iş o saatte yapıldı; taşımak geçmişi yeniden yazmak
 *   • hizmet — adisyon mühürlü ve tutar tahsilata girdi; hizmeti burada
 *     değiştirmek Kasa'yla ayrışan bir randevu demek. Ücret yanlışsa
 *     düzeltme yeri Kasa.
 * Müdür 25'in A3 karesi tamamlanan randevuda da bu düğmeleri çiziyordu;
 * ürün sahibi değiştirdi. Not açık kalıyor: işten sonra yazılacak şey olur.
 */
export function isReschedulable(appointment: Appt): boolean {
    const state = stateOf(appointment);
    return state !== 'cancelled' && state !== 'done';
}

/**
 * Silinebilir mi — TAHSİL EDİLMİŞ randevu silinmez (2026-10-13, kullanıcı
 * kararı).
 *
 * Silme tahsilatı silmiyor ama bağını koparıyor (`payments.reservation_id`
 * · ON DELETE SET NULL): Kasa'daki hareket randevusunu ve hizmet
 * kalemlerini kaybediyor, geriye kimin hangi iş için ödediği belli olmayan
 * bir tutar kalıyor. Yanlış kaydın yolu iki adım, ikisinin de izi kalıyor:
 * Kasa'da tahsilatı geri al (adisyon açılır), sonra sil.
 *
 * Tahsil edilmemiş tamamlanan randevu (adisyon açık) silinebilir: para
 * kaydı yok, yanlışlıkla bitirilmiş ya da deneme kaydını temizlemenin tek
 * yolu bu. Tahsil durumu BİLİNMİYORSA silinmez — para önce.
 */
export function isDeletable(appointment: Appt): boolean {
    return stateOf(appointment) !== 'done' || appointment.is_paid === false;
}

/** Silmenin yerinde duran cümle — tahsil edilmiş randevuda. */
export function paidDeleteInfo(solo: boolean): string {
    return solo
        ? 'Tahsil edilmiş randevu silinmez. Yanlışsa önce Kasa’dan tahsilatı geri alın.'
        : 'Tahsil edilmiş randevu silinmez. Yanlışsa tahsilat önce masaüstündeki Kasa’dan geri alınır.';
}

/** Tamamlanan randevunun kartında değişmeyenlerin yerinde duran cümle. */
export function doneInfo(solo: boolean): string {
    return solo
        ? 'Tamamlanan randevunun saati ve hizmeti değişmez. Ücret yanlışsa Kasa’dan düzeltin.'
        : 'Tamamlanan randevunun saati, personeli ve hizmeti değişmez. Ücret yanlışsa masaüstündeki Kasa’dan düzeltilir.';
}

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
    /**
     * Müdür 36 · Yol 1 — başlığın önündeki küçük halka (Ø18, rakamsız).
     * Paket yoksa `null`. Akış'ın ve müşteri kartının halkasıyla AYNI şekil.
     */
    ring: { total: number; left: number } | null;
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
            ring: null,
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
        // KALAN, "0/6" değil (Müdür 36): Akış "6 seans kaldı" derken kart
        // "0/6" diyordu — göz bir ekranda kalanı, ötekinde kullanılanı okuyordu.
        headline: info.pkg
            ? packageLine({ title: info.pkg.name, total: info.pkg.total, left: info.pkg.total - info.pkg.used })
            : `${info.visitNo}. ziyaret`,
        ring: info.pkg ? { total: info.pkg.total, left: Math.max(0, info.pkg.total - info.pkg.used) } : null,
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

/**
 * Saat ve personel günde onlarca kez değişir: jeton, h84, değeri büyük.
 *
 * Tek kişilikte YALNIZ SAAT (v4 · karar 3): "Personeli değiştir"in
 * seçeneği yok, jeton bir işe yaramazdı. Tek jeton satırın tamamını alır.
 */
export function changeTiles(appointment: Appt, staffName?: string | null, solo = false): ChangeTile[] {
    // Tamamlanan randevunun saati ve personeli kayıttır (bkz. `isReschedulable`).
    if (!isReschedulable(appointment)) return [];
    const time: ChangeTile = {
        action: 'time',
        icon: 'clock',
        kicker: 'Saati değiştir',
        value: `${dayNameShort(appointment.date)} ${appointment.start_time.slice(0, 5)}`,
    };
    if (solo) return [time];
    return [
        time,
        {
            action: 'staff',
            icon: 'swap',
            kicker: 'Personeli değiştir',
            value: staffName ?? 'Atanmamış',
            initials: staffName ? initialsOf(staffName) : undefined,
        },
    ];
}

// ── Mesajla hatırlat (v4 · tek kişilik) ─────────────────────────────────────

export interface ReminderAction {
    title: string;
    /** Satırın sağı: ne olacağını söylüyor — uygulamadan çıkılıyor. */
    value: string;
    /** Müşteriye gidecek metnin KENDİSİ. */
    text: string;
    /** `https://wa.me/90…?text=…` */
    url: string;
}

export const REMINDER_TITLE = 'Mesajla hatırlat';
export const REMINDER_VALUE = 'WhatsApp’ta hazır metin';
export const REMINDER_FAILED = 'WhatsApp açılamadı';

/**
 * "Mesajla hatırlat" — salonun WhatsApp hattı BAĞLANMADAN (v4 s-duvar ·
 * `actionPill.ts:39`): Akış'taki göz "WhatsApp bağlı değil · masaüstünden
 * bağlanır" diyordu ve tek kişinin masaüstü yok. Burada kişinin kendi
 * WhatsApp'ı hazır metinle açılıyor; gönderen o, uygulama değil.
 *
 * Yalnız gerçekten hatırlatılacak bir randevuda: müşteri henüz gelmemiş,
 * randevu geçmemiş ve numara yazılabilir. Başlamış ama müşterisi gelmemiş
 * randevuda cümle Akış'ın "yolda mısınız?"ı. Otomatik hatırlatma kapsam dışı.
 */
export function reminderAction(input: {
    appointment: Appt;
    /** İşletmenin adı — "Derya Güzellik’ten merhaba". Boşsa "Merhaba". */
    salon: string;
    today: string;
    nowMinutes: number;
}): ReminderAction | null {
    const { appointment, today, nowMinutes } = input;
    if (stateOf(appointment) !== 'waiting') return null;
    if (appointment.date < today) return null;
    const start = toMinutes(appointment.start_time);
    const isToday = appointment.date === today;
    if (isToday && nowMinutes >= toMinutes(appointment.end_time)) return null;

    const day = isToday
        ? 'bugün'
        : appointment.date === addDaysISO(today, 1) ? 'yarın' : formatDayFull(appointment.date);
    const text = waNudgeText({
        salon: input.salon,
        time: hhmm(start),
        late: isToday && nowMinutes >= start,
        day,
    });
    const url = waLink(appointment.customer_phone, text);
    if (!url) return null;
    return { title: REMINDER_TITLE, value: REMINDER_VALUE, text, url };
}

// ── Müşteriyi ara (tek kişilik) ─────────────────────────────────────────────

export interface CallAction {
    title: string;
    /** Numaranın TAMAMI — "0532 118 24 06". Maskeli numara okunamaz. */
    value: string;
    /** `tel:+90…` */
    url: string;
}

export const CALL_TITLE = 'Müşteriyi ara';
export const CALL_FAILED = 'Arama açılamadı';

/**
 * Randevu kartının "Müşteriyi ara" satırı (kullanıcı kararı, 2026-10-12).
 *
 * Tek kişilikte Akış'ın "Ara" gözü yok; arama kumandada ve müşteri kartında
 * duruyordu — ikisi de randevu kartından bir adım ötede. Hatırlatmadan farklı
 * olarak HER hâlde: gelmeyen müşteriyi aramak da, iptal edileni yeniden
 * kurmak için aramak da bir iş. Yalnız numara aranabilirse; yoksa satır
 * çizilmez (sönük bir satır ölü bir kontrol olurdu — kimlik zaten "numara
 * yok" diyor).
 */
export function callAction(appointment: Pick<Appt, 'customer_phone'>): CallAction | null {
    const number = normalizePhone(appointment.customer_phone);
    const url = dialable(appointment.customer_phone);
    if (!number || !url) return null;
    const value = number.length === 12 && number.startsWith('90')
        ? `0${number.slice(2, 5)} ${number.slice(5, 8)} ${number.slice(8, 10)} ${number.slice(10)}`
        : `+${number}`;
    return { title: CALL_TITLE, value, url: `tel:${url}` };
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
    const note: ChangeRow = {
        action: 'note',
        title: 'Notu düzenle',
        value: appointment.notes?.trim() ? appointment.notes.trim() : 'Not yok',
    };
    // Tamamlanan randevuda hizmet kayıttır; not açık kalıyor.
    if (!isReschedulable(appointment)) return [note];
    return [
        {
            action: 'service',
            title: 'Hizmeti değiştir',
            // Para bilgisi ASLA kırpılmaz; kırpma hizmet adının kuyruğundan.
            value: price === null
                ? appointment.service
                : `${appointment.service} · ₺${price.toLocaleString('tr-TR')}`,
        },
        note,
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
 *
 * Tek kişilikte çakışma ADSIZ: "11:00–12:30 ile çakışır". Ad, sahibin
 * personel satırının adıydı — yani işletmenin adı.
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
    solo = false,
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
                ? `${solo ? '' : `${staffName ?? 'Personel'} · `}${blocking.start_time.slice(0, 5)}–${blocking.end_time.slice(0, 5)} ile çakışır`
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
