/**
 * Müdür 15 · randevu oluşturmanın CANLI kuralları. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo, react-native ya da
 * Supabase bağımlılığı TAŞIMAZ.
 *
 * ── Ölçü masaüstü ───────────────────────────────────────────────────────────
 * Telefondan kurulan randevu, masaüstünden kurulanla AYNI satır olmalı —
 * yoksa hatırlatma cron'u, Kasa ve takvim ikisini farklı okur. Kurallar
 * `useReservations.addReservation` ve `resolveCustomerId`ten okundu:
 *   • durum `confirmed`, not boş metin, renk hizmetin rengi (yoksa `#CCFF00`)
 *   • telefon boşlukları silinmiş hâliyle; numarasız randevu müşteri AÇMAZ
 *   • numara eşleşen müşteri yeniden kullanılır, arşivdeyse geri açılır
 *   • geçmişe randevu salonun toleransı kadar geriye izinli
 *   • SON SÖZ sunucunun: 060 çakışma, 076 uygunluk tetikleyicisi
 */

import { addDaysISO, dayNameLong, formatDayMonth, hhmm } from './calendar.ts';
import type { CatalogService } from './cashBuild.ts';
import type { CustomerOption, ServiceOption, StaffOption } from './createFlow.ts';
import { initialsOf } from './text.ts';

// ── Hizmet ──────────────────────────────────────────────────────────────────

/** Masaüstünün `service_color` varsayılanı (`useReservations` · insert). */
export const DEFAULT_SERVICE_COLOR = '#CCFF00';

/** Süresi yazılmamış hizmet — masaüstünün `services.duration` varsayılanı. */
export const DEFAULT_SERVICE_MINUTES = 30;

/**
 * Katalog → ekranın hizmet seçenekleri.
 *
 * Fiyatı yazılmamış hizmetin fiyatı `null` — SIFIR değil. "₺0" yazmak, müdüre
 * bedava bir hizmet göstermek olurdu.
 */
export function serviceOptionsOf(catalog: readonly CatalogService[]): ServiceOption[] {
    return catalog
        .filter((service): service is CatalogService & { id: string } => Boolean(service.id))
        .map((service) => ({
            id: service.id,
            name: service.name,
            minutes: service.duration ?? DEFAULT_SERVICE_MINUTES,
            price: service.price ?? null,
            color: service.color ?? DEFAULT_SERVICE_COLOR,
        }));
}

// ── Müşteri ─────────────────────────────────────────────────────────────────

export interface CustomerRecord {
    id: string;
    name: string;
    phone: string;
}

export interface VisitRecord {
    customer_id: string | null;
    date: string;
    start_time: string;
    service: string;
    status: string;
}

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/**
 * Kayıtlar + randevular → seçenekler.
 *
 * İpucu satırı randevulardan TÜRETİLİYOR (müşteri tablosunda "son geliş"
 * yok ve olmamalı — `staff-api` ile aynı gerekçe):
 *   • bugün randevusu varsa  "Bugün 11:00 · Saç boyama"
 *   • yoksa son gelişi       "son 2 Ağu"
 *   • hiç yoksa              boş
 * Gelecekteki randevu "son geliş" sayılmıyor; iptal hiç sayılmıyor.
 */
export function customerOptionsOf(
    people: readonly CustomerRecord[],
    visits: readonly VisitRecord[],
    todayISO: string,
): CustomerOption[] {
    const today = new Map<string, VisitRecord>();
    const last = new Map<string, VisitRecord>();
    for (const visit of visits) {
        if (!visit.customer_id || visit.status === 'cancelled') continue;
        const id = visit.customer_id;
        if (visit.date === todayISO) {
            const current = today.get(id);
            if (!current || visit.start_time < current.start_time) today.set(id, visit);
        } else if (visit.date < todayISO) {
            const current = last.get(id);
            if (!current || visit.date > current.date) last.set(id, visit);
        }
    }
    return people.map((person) => {
        const now = today.get(person.id);
        const before = last.get(person.id);
        let hint = '';
        let seen: string | undefined;
        if (now) {
            hint = `Bugün ${now.start_time.slice(0, 5)} · ${now.service}`;
            seen = `${now.date} ${now.start_time}`;
        } else if (before) {
            const [, month, day] = before.date.split('-').map(Number);
            hint = `son ${day} ${MONTH_SHORT[month - 1] ?? ''}`.trim();
            seen = `${before.date} ${before.start_time}`;
        }
        const option: CustomerOption = { id: person.id, name: person.name, phone: person.phone, hint };
        if (seen) option.seen = seen;
        return option;
    });
}

/**
 * "Son gelenler" — en son görülen önce.
 *
 * Tasarımın örneği bugünkü müşterilerdi; sabah sekizde bugün henüz kimse
 * gelmemişken liste boş kalıyordu. Bugün gelenler yine ÖNDE (en yeni onlar),
 * arkasından son gelişi en yakın olanlar.
 */
export function recentOf(options: readonly CustomerOption[], count = 6): CustomerOption[] {
    return options
        .filter((option) => option.seen)
        .sort((a, b) => (b.seen ?? '').localeCompare(a.seen ?? ''))
        .slice(0, count);
}

/**
 * Masaüstünün `normalizeCustomerPhone`u: yalnız BOŞLUKLAR siliniyor.
 *
 * Numara `+90…`ya çevrilmiyor, çünkü müşteri tablosundaki tekillik
 * (`uq_customers_org_phone_active`) HAM metne bakıyor ve masaüstünden girilen
 * kayıtlar "0532…" biçiminde. Biçimi değiştirmek aynı kişiye ikinci kayıt
 * açardı.
 */
export function storedPhone(value: string | null | undefined): string {
    return String(value ?? '').replace(/\s+/g, '').trim();
}

/**
 * Aynı numaranın veritabanında görülebilecek yazımları.
 *
 * Biçim tek değil: masaüstü "0532…", çevrim içi randevu olduğu gibi, eski
 * kayıtlar "+90…" ya da "90…". Arama hepsine bakıyor; bulunamazsa yeni kayıt
 * `storedPhone` biçiminde açılıyor.
 */
export function phoneVariants(value: string): string[] {
    const raw = storedPhone(value);
    const digits = raw.replace(/\D/g, '').replace(/^00/, '');
    const national = digits.startsWith('90') && digits.length === 12
        ? digits.slice(2)
        : digits.startsWith('0') && digits.length === 11
            ? digits.slice(1)
            : digits;
    const out = new Set<string>();
    if (raw) out.add(raw);
    if (national.length === 10) {
        out.add(`0${national}`);
        out.add(national);
        out.add(`90${national}`);
        out.add(`+90${national}`);
    }
    return [...out];
}

// ── Personel ve saat ────────────────────────────────────────────────────────

export interface CrewRecord {
    id: string;
    name: string;
    color: string | null;
    active: boolean;
    /**
     * Personelin KENDİ haftalık saatleri (`staff.working_hours`, 008). `null`
     * ya da boşsa salonun saatlerini kullanır — masaüstünün `staffWorksAt`
     * kuralı.
     */
    workingHours?: unknown;
}

/**
 * Kadro → seçenekler. Pasif personel LİSTEDE YOK (masaüstünün personel seçimi
 * de göstermiyor); izinli olan listede ama seçilemez — "neden Merve yok"
 * sorusu doğmasın.
 */
export function staffOptionsOf(
    crew: readonly CrewRecord[],
    leave: ReadonlyMap<string, readonly string[]>,
    dateISO: string,
): StaffOption[] {
    return crew
        .filter((person) => person.active)
        .map((person) => {
            const onLeave = (leave.get(person.id) ?? []).includes(dateISO);
            const option: StaffOption = {
                id: person.id,
                initials: initialsOf(person.name),
                name: person.name,
                available: !onLeave,
            };
            if (person.color) option.color = person.color;
            if (onLeave) option.reason = 'izinli';
            return option;
        });
}

export interface OpenWindow {
    from: number;
    to: number;
}

/** "09:00" → 540. Çözülemeyen değer sıfır ÜRETMİYOR. */
export function clockMinutes(value: unknown): number | null {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Salonun o GÜN açık olduğu aralık — `settings.working_hours`.
 *
 * GÜN NUMARASI: veritabanı 0 = PAZAR (JS `getDay()`). `getUTCDay()` tam bu
 * düzeni veriyor; okumada dönüşüm YOK (bkz. `managerSource.fetchOpenMinutes`).
 *
 * Dönüş:
 *   • `{from, to}` — açık
 *   • `null`       — o gün KAPALI (`isOff`)
 *   • `undefined`  — saat BİLİNMİYOR (ayar yok ya da bozuk). Kapalı sayılmıyor:
 *     bilinmeyen bir saati "salon kapalı" diye göstermek randevuyu engellerdi.
 */
export function openWindowOf(hours: unknown, dateISO: string): OpenWindow | null | undefined {
    if (!Array.isArray(hours)) return undefined;
    const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
    const entry = (hours as Record<string, unknown>[]).find((row) => Number(row?.day) === weekday);
    if (!entry) return undefined;
    if (entry.isOff === true) return null;
    const from = clockMinutes(entry.start);
    const to = clockMinutes(entry.end);
    if (from === null || to === null || to <= from) return undefined;
    return { from, to };
}

/**
 * Personel bu aralıkta çalışıyor mu — masaüstünün `staffWorksAt`i.
 *
 *   • kendi saatleri doluysa ONLAR, değilse salonun saatleri
 *   • o gün tanımsız ya da `isOff` → çalışmıyor
 *   • aralık o günün açılış–kapanışının İÇİNDE olmalı
 *
 * Tek fark bilinçli: salonun saati de personelinki de BİLİNMİYORSA (ayar
 * okunamadı, bozuk) telefon "çalışmıyor" DEMİYOR. Masaüstünde bu hâl
 * oluşmuyor (kolon NOT NULL, yedi gün varsayılanlı); telefonda bir okuma
 * bozukluğu bütün personeli kapatmasın.
 */
export function staffWorksAt(
    member: Pick<CrewRecord, 'workingHours'>,
    orgHours: unknown,
    dateISO: string,
    from: number,
    to: number,
): boolean {
    const own = Array.isArray(member.workingHours) && member.workingHours.length > 0
        ? member.workingHours
        : null;
    const window = openWindowOf(own ?? orgHours, dateISO);
    if (window === undefined) return own === null;
    if (window === null) return false;
    return from >= window.from && to <= window.to;
}

/**
 * Günün TARANACAK aralığı — salonun saati, personelin kendi saati salonunkini
 * aşıyorsa o kadar genişletilmiş (masaüstünün `findAvailableSlots`i: sabah
 * 08:00'de başlayan bir personelin erken saati hiç taranmıyordu).
 *
 * Salon o gün KAPALIYSA `null` — masaüstü de kapalı günde saat aramıyor.
 */
export function dayWindowOf(
    crew: readonly Pick<CrewRecord, 'workingHours' | 'active'>[],
    orgHours: unknown,
    dateISO: string,
): OpenWindow | null | undefined {
    const org = openWindowOf(orgHours, dateISO);
    if (org === null || org === undefined) return org;
    let from = org.from;
    let to = org.to;
    for (const member of crew) {
        if (!member.active || !Array.isArray(member.workingHours) || member.workingHours.length === 0) continue;
        const own = openWindowOf(member.workingHours, dateISO);
        if (!own) continue;
        from = Math.min(from, own.from);
        to = Math.max(to, own.to);
    }
    return { from, to };
}

/**
 * Geçmişe randevu sınırı — masaüstünün kuralı.
 *
 * Başlangıç, şimdiden tolerans kadar ÖNCEYE kadar kabul: randevusuz gelip
 * geç kaydedilen müşteri için. Daha öncesi reddediliyor.
 */
export function tooEarly(
    dateISO: string,
    startMinutes: number,
    nowMs: number,
    toleranceMin: number,
): boolean {
    const start = Date.parse(`${dateISO}T${hhmm(startMinutes)}:00`);
    if (!Number.isFinite(start)) return false;
    return start < nowMs - toleranceMin * 60_000;
}

/** Cihaz saatinin gün içi dakikası ve günü — slot rayının "şimdi"si. */
export function localClock(nowMs: number): { dateISO: string; minutes: number } {
    const at = new Date(nowMs);
    const two = (n: number) => String(n).padStart(2, '0');
    return {
        dateISO: `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`,
        minutes: at.getHours() * 60 + at.getMinutes(),
    };
}

// ── Yazma ───────────────────────────────────────────────────────────────────

export interface NewAppointment {
    customerId: string | null;
    customerName: string;
    /** Ham numara; yazılırken `storedPhone`dan geçer. */
    customerPhone: string | null;
    dateISO: string;
    startMinutes: number;
    service: ServiceOption;
    staffId: string;
    note: string | null;
}

/**
 * `reservations` INSERT gövdesi — masaüstünün gönderdiği alanların aynısı.
 *
 * `customer_phone` NOT NULL: numarasız randevuda boş metin (masaüstü de öyle).
 * `user_id` NOT NULL: oturumdaki müdür — satırı kimin açtığı.
 */
export function insertRowOf(
    input: NewAppointment,
    ids: { userId: string; organizationId: string },
): Record<string, unknown> {
    return {
        user_id: ids.userId,
        organization_id: ids.organizationId,
        customer_id: input.customerId,
        customer_name: input.customerName.trim(),
        customer_phone: storedPhone(input.customerPhone),
        customer_email: null,
        date: input.dateISO,
        start_time: `${hhmm(input.startMinutes)}:00`,
        end_time: `${hhmm(input.startMinutes + input.service.minutes)}:00`,
        service: input.service.name,
        service_color: input.service.color || DEFAULT_SERVICE_COLOR,
        status: 'confirmed',
        notes: input.note?.trim() ?? '',
        staff_id: input.staffId,
        group_id: null,
    };
}

export type CreateOutcome =
    | { ok: true }
    /** 060 — personelin o saatte başka randevusu var. */
    | { ok: false; kind: 'conflict'; message: string }
    /** 076 — müşterinin bir özelliği bu hizmete kapalı. */
    | { ok: false; kind: 'eligibility'; message: string }
    /** Geçmiş saat (masaüstünün istemci kuralı). */
    | { ok: false; kind: 'past'; message: string }
    /** Yazma vanası kapalı (095). */
    | { ok: false; kind: 'paused' }
    | { ok: false; kind: 'failed' };

export const PAST_LINE = 'Bu saat geçti. Geçmişe randevu kurulamaz — başka bir saat seçin.';

/**
 * Sunucu hatası → sonuç.
 *
 * 060 ve 076 hatalarını METİNDEN tanıyoruz: PostgREST ikisini de genel bir
 * koda indiriyor. 076'nın `detail`i JSON; sebep ve not oradan okunuyor —
 * masaüstündeki `getReservationConflictError` ile aynı cümle.
 */
export function createOutcomeOf(
    error: { code?: string | null; message?: string | null; details?: string | null } | null,
    staffName: string | null,
): CreateOutcome {
    if (!error) return { ok: true };
    const text = `${error.message ?? ''} ${error.details ?? ''}`;
    if (/eligibility_blocked/.test(text)) {
        const reason = /"reason"\s*:\s*"([^"]+)"/.exec(text)?.[1];
        const note = /"note"\s*:\s*"([^"]+)"/.exec(text)?.[1];
        return {
            ok: false,
            kind: 'eligibility',
            message: reason
                ? `Bu işlem uygulanamaz — ${reason}${note ? ` (${note})` : ''}.`
                : 'Bu müşteriye bu işlem uygulanamaz.',
        };
    }
    if (/reservation_(staff|resource)_conflict|23P01/.test(text) || error.code === '23P01') {
        const who = staffName?.trim();
        return {
            ok: false,
            kind: 'conflict',
            message: who
                ? `O saatte ${who} zaten başka bir randevuda. Başka bir saat seçin.`
                : 'O saat dolu — başka bir saat seçin.',
        };
    }
    return { ok: false, kind: 'failed' };
}

// ── Onay mesajı ─────────────────────────────────────────────────────────────

/**
 * Sektörün hizmet sözcüğü ve emojisi — masaüstünün `sectorProfiles.comms`
 * kopyası (yalnız şablonun kullandığı iki alan). Testi iki tabloyu satır
 * satır karşılaştırıyor; biri değişirse öteki kırılır.
 */
export const SECTOR_COMMS: Readonly<Record<string, { serviceWord: string; emoji: string }>> = {
    genel: { serviceWord: 'randevu', emoji: '🗓️' },
    guzellik: { serviceWord: 'bakım', emoji: '✨' },
    kuafor: { serviceWord: 'işlem', emoji: '💇' },
    berber: { serviceWord: 'kesim', emoji: '💈' },
    estetik: { serviceWord: 'seans', emoji: '✨' },
    dis: { serviceWord: 'tedavi', emoji: '🦷' },
    saglik: { serviceWord: 'muayene', emoji: '🩺' },
    fizyoterapi: { serviceWord: 'seans', emoji: '🤸' },
    tattoo: { serviceWord: 'seans', emoji: '🖤' },
    avukat: { serviceWord: 'görüşme', emoji: '⚖️' },
    danismanlik: { serviceWord: 'görüşme', emoji: '📌' },
    gym: { serviceWord: 'antrenman', emoji: '💪' },
    gelinlikci: { serviceWord: 'prova', emoji: '👰' },
    restoran: { serviceWord: 'rezervasyon', emoji: '🍽️' },
};

/** "27 Temmuz Pazartesi" — masaüstünün `formatTrDate`i. */
export function trDate(dateISO: string): string {
    return `${formatDayMonth(dateISO)} ${dayNameLong(dateISO)}`;
}

/**
 * Müşteriye giden onay — masaüstünün `buildConfirmationMessage`inin AYNISI.
 *
 * Aynı müşteri bir randevuyu masaüstünden, bir sonrakini telefondan alırsa
 * iki farklı metin görmemeli. Ekrandaki önizleme de bu metni gösteriyor:
 * müdür gidecek olanı görür.
 */
export function confirmationText(params: {
    customerName: string;
    dateISO: string;
    startTime: string;
    service: string;
    businessName: string;
    staffName?: string | null;
    mapsUrl?: string | null;
    sector?: string | null;
}): string {
    const firstName = (params.customerName || '').split(' ')[0];
    const comms = SECTOR_COMMS[params.sector || 'genel'] ?? SECTOR_COMMS.genel;
    return (
        `Merhaba ${firstName} 👋\n\n`
        + `*${params.businessName}* — ${comms.serviceWord} kaydınız oluşturuldu ✅\n\n`
        + `📅 ${trDate(params.dateISO)}\n`
        + `🕐 Saat *${params.startTime.slice(0, 5)}*\n`
        + `💠 ${params.service}`
        + (params.staffName ? `\n👤 ${params.staffName}` : '')
        + `\n\nDeğişiklik gerekirse bu mesaja yanıt vermeniz yeterli. Görüşmek üzere! ${comms.emoji}`
        + (params.mapsUrl ? `\n\n📍 Konum: ${params.mapsUrl}` : '')
    );
}

/** Proxy'nin gönderim cevabı — masaüstünün `WaSendResult`u. */
export type WaFailReason = 'not_connected' | 'opt_out' | 'quota' | 'invalid_phone' | 'failed';

/**
 * Gönderilemeyen mesajın sebebi — müdüre, KENDİ diliyle.
 *
 * `failed` iki şeyi kapsıyor: bağlantı hatası ve salonun "randevu onayı"
 * anahtarının kapalı olması (proxy ikisine aynı cevabı veriyor). Cümle ikisini
 * de yalanlamıyor.
 */
export function waFailLine(reason: WaFailReason | null): string {
    switch (reason) {
        case 'not_connected': return 'Salonun WhatsApp’ı bağlı değil. Mesaj gitmedi.';
        case 'opt_out': return 'Müşteri mesaj almak istemediğini bildirmiş. Mesaj gitmedi.';
        case 'quota': return 'Bu müşteriye bugün yeterince mesaj gitti. Mesaj gitmedi.';
        case 'invalid_phone': return 'Numara WhatsApp için geçerli değil. Mesaj gitmedi.';
        case 'failed': return 'Mesaj gitmedi. Randevu onayı kapalı olabilir ya da bağlantı kurulamadı.';
        default: return 'Bağlantı kurulamadı. Mesaj gitmedi.';
    }
}

/** Tekrar denemenin anlamı var mı? Kalıcı sebeplerde "Tekrar dene" yalan olur. */
export function waRetryable(reason: WaFailReason | null): boolean {
    return reason === null || reason === 'failed';
}

// ── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Salonun dış otomasyon adresine giden gövde — masaüstünün `fireWebhook
 * ('reservation.created', …)` alanlarıyla aynı. Adres yoksa hiç gitmiyor.
 */
export function webhookBody(row: {
    id: string; customer_name: string; customer_phone: string; date: string;
    start_time: string; end_time: string; service: string; status: string;
    notes: string | null; staff_id: string | null;
}, staffName: string | null, nowIso: string): string {
    return JSON.stringify({
        event: 'reservation.created',
        source: 'timeflow',
        timestamp: nowIso,
        data: {
            id: row.id,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            customer_email: null,
            date: row.date,
            start_time: row.start_time.slice(0, 5),
            end_time: row.end_time.slice(0, 5),
            service: row.service,
            status: row.status,
            notes: row.notes ?? '',
            staff_id: row.staff_id ?? null,
            staff_name: staffName ?? null,
        },
    });
}

/** Bugünden itibaren 14 gün — gün şeridinin aralığı, izin okumasının da. */
export function stripRange(todayISO: string, count = 14): { from: string; to: string } {
    return { from: todayISO, to: addDaysISO(todayISO, count - 1) };
}

// ── Kurulamayan randevu ─────────────────────────────────────────────────────

export type RefusalMove = 'reslot' | 'service' | 'retry' | 'dismiss';

export interface RefusalCopy {
    tone: 'amber' | 'red';
    title: string;
    lines: string[];
    action: { label: string; move: RefusalMove };
}

/**
 * Randevu KURULMADI — müdüre ne olduğunu ve ne yapacağını söyleyen blok.
 *
 * Durum dilinin kuralları: düzeltilebilir olan amber, düzeltilemeyen kırmızı;
 * tek eylem; "kayıt", "sunucu", hata kodu yok. Her cümle randevunun
 * OLUŞMADIĞINI açıkça söylüyor — müdür "kuruldu mu?" diye takvime bakmasın.
 */
export function refusalCopy(outcome: Exclude<CreateOutcome, { ok: true }>): RefusalCopy {
    switch (outcome.kind) {
        case 'conflict':
            return {
                tone: 'amber',
                title: 'Bu saat az önce doldu',
                lines: [outcome.message, 'Randevu oluşmadı; güncel saatleri getirdik.'],
                action: { label: 'Başka saat seç', move: 'reslot' },
            };
        case 'past':
            return {
                tone: 'amber',
                title: 'Bu saat geçti',
                lines: [outcome.message],
                action: { label: 'Başka saat seç', move: 'reslot' },
            };
        case 'eligibility':
            return {
                tone: 'red',
                title: 'Bu müşteriye bu hizmet verilemiyor',
                lines: [outcome.message, 'Randevu oluşmadı.'],
                action: { label: 'Hizmeti değiştir', move: 'service' },
            };
        case 'paused':
            return {
                tone: 'amber',
                title: 'Randevu şimdilik kurulamıyor',
                lines: ['Randevu oluşmadı. Kısa bir süre sonra tekrar deneyin.'],
                action: { label: 'Anladım', move: 'dismiss' },
            };
        default:
            return {
                tone: 'red',
                title: 'Randevu oluşmadı',
                lines: ['Bağlantı kesilmiş olabilir. Seçimleriniz duruyor — tekrar deneyin.'],
                action: { label: 'Tekrar dene', move: 'retry' },
            };
    }
}
