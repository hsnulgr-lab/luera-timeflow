/**
 * Kasa'nın CANLI türetilmesi — tahsilat satırlarından hareketler, randevu
 * satırlarından bekleyen adisyonlar. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo, react-native ya da
 * Supabase bağımlılığı TAŞIMAZ.
 *
 * ── Ölçü masaüstü ───────────────────────────────────────────────────────────
 * Telefondaki gün toplamı masaüstü Kasa'daki gün toplamıyla kuruşu kuruşuna
 * aynı olmalı. Kurallar bu yüzden uydurulmadı, masaüstünden okundu:
 *   • gün / ay toplamı  → `usePayments.stats` (paid_at yerel günde / ayda)
 *   • hafta             → Pazartesi başlangıç (`DashboardPage` "Bu hafta")
 *   • bekleyen adisyon  → `BeautyCashRegister.balanceOf` + `salonCashTickets`
 *
 * ── Kaldırılamayan iki fark ─────────────────────────────────────────────────
 * Masaüstünün "paket tahsilatı" biletleri tarayıcının yerel deposunda
 * (`readPkgQueue`) yaşıyor; sunucuda karşılığı yok, telefon göremez.
 * Masaüstünün "az önce tahsil ettim" işareti (`done`) de sekme içi durum.
 */

import type { CashMethod, CashPeriod, Movement, MovementLine } from './cash.ts';
import { clockText, formatDayMonth } from './calendar.ts';
// Baş harfin TEK kuralı: projede dokuz ayrı uygulaması vardı ve "Deniz" bir
// ekranda DE, ötekinde D çıkıyordu. Onuncusu yazılmadı.
import { initialsOf } from './text.ts';

// ── Satır şekilleri ─────────────────────────────────────────────────────────

export interface CashPaymentRow {
    id: string;
    reservation_id: string | null;
    customer_id: string | null;
    staff_id: string | null;
    type: string;
    description: string | null;
    amount: number;
    method: string;
    paid_at: string;
    /** Kaydın yazıldığı an — düzeltmede düzeltmenin KENDİ saati (111). */
    created_at?: string | null;
    /** Bu satır bir düzeltme ise damgalanan eski satırın kimliği (111). */
    corrected_from?: string | null;
    /** Damgalı satırda: ne zaman ve neden (`correction` | `revert`). Yalnız `voided_payments`tan gelir. */
    voided_at?: string | null;
    void_reason?: string | null;
}

/** Adisyon hesabının ihtiyacı olan randevu alanları. */
export interface CashReservationRow {
    id: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    date: string;
    start_time: string;
    end_time: string;
    service: string;
    status: string;
    staff_id: string | null;
    is_paid: boolean;
    group_id: string | null;
    custom_fields: Record<string, unknown> | null;
    adisyon_items: unknown;
    service_ended_at: string | null;
}

/**
 * Hizmet kataloğunun tek kaydı — `services` tablosu.
 *
 * `settings` satırında DEĞİL: masaüstünün `settings.services`i bellekte
 * kurulan bir alan, veritabanında karşılığı ayrı tablo (`useReservations`
 * → `from('services')`). Aynı adı taşıdığı için bir kez yanlış yere bakıldı
 * ve olmayan kolonu isteyen okuma bütün akışı "okunamadı"ya düşürürdü.
 */
export interface CatalogService {
    id?: string;
    name: string;
    price?: number;
    /** Dakika. */
    duration?: number;
    color?: string;
    /** Uygunluk etiketleri (076): `lazer`, `medikal`… Kapalı hizmet kararı bunlarla. */
    tags?: string[];
}

// ── Katalog ─────────────────────────────────────────────────────────────────

/**
 * Paket motoru yalnız güzellik ve kuaförde gerçek (`cashSectorProfiles`).
 * Başka sektörde `paket_plan_id` taşıyan bir randevu ücretsiz SAYILMAZ —
 * masaüstü de saymıyor.
 */
const PACKAGE_SECTORS: readonly string[] = ['guzellik', 'kuafor'];

export function packagesEnabledFor(sector: unknown): boolean {
    return typeof sector === 'string' && PACKAGE_SECTORS.includes(sector);
}

/**
 * `services` satırları → katalog. Bozuk kayıt fiyat ÜRETMİYOR.
 *
 * `price` NUMERIC ve PostgREST onu METİN olarak gönderebiliyor ("1900.00");
 * masaüstü de `Number(s.price)` ile çeviriyor. Sayıya dönmeyen değer fiyatsız
 * sayılıyor, sıfır sayılmıyor.
 */
export function catalogOf(raw: unknown): CatalogService[] {
    if (!Array.isArray(raw)) return [];
    const out: CatalogService[] = [];
    for (const item of raw) {
        const row = (item ?? {}) as Record<string, unknown>;
        if (typeof row.name !== 'string' || !row.name.trim()) continue;
        const price = row.price === null || row.price === undefined || row.price === ''
            ? NaN
            : Number(row.price);
        const duration = Number(row.duration);
        out.push({
            id: typeof row.id === 'string' ? row.id : undefined,
            name: row.name,
            price: Number.isFinite(price) ? price : undefined,
            duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
            color: typeof row.color === 'string' && row.color ? row.color : undefined,
            ...(Array.isArray(row.tags)
                ? { tags: row.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0) }
                : null),
        });
    }
    return out;
}

const SEPARATOR = ' + ';

/**
 * Randevunun hizmet kalemleri — masaüstündeki `reservationServiceLines`in
 * AYNISI.
 *
 * Çoklu hizmetli seansta `service` birleşik bir ad ("Kaş + Cilt bakımı") ve
 * katalogda öyle bir kayıt yok; ücret `custom_fields.hizmetler`den okunuyor.
 * Doğrudan adla aramak bu seansları ₺0 gösterirdi.
 */
export function serviceLines(
    row: Pick<CashReservationRow, 'service' | 'custom_fields'>,
    services: readonly CatalogService[],
): MovementLine[] {
    const raw = row.custom_fields?.hizmetler;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map((item, index) => {
                    const o = (item ?? {}) as Record<string, unknown>;
                    const name = typeof o.name === 'string' ? o.name : `Hizmet ${index + 1}`;
                    const known = services.find((s) => s.id !== undefined && s.id === o.id)
                        ?? services.find((s) => s.name === name);
                    return {
                        name,
                        amount: typeof o.price === 'number' ? o.price : known?.price ?? 0,
                    };
                });
            }
        } catch {
            // Bozuk kayıt — masaüstü gibi ad eşlemesine düşülüyor.
        }
    }
    const names = (row.service || '').split(SEPARATOR).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return [{ name: row.service || 'Hizmet', amount: 0 }];
    return names.map((name) => ({
        name,
        amount: services.find((s) => s.name === name)?.price ?? 0,
    }));
}

/** Randevunun hizmet ücreti ve kaç hizmet satırından geldiği. */
export interface ServiceCharge {
    amount: number;
    count: number;
}

/**
 * Ücret SATIR SATIR — tek kişilik kumandanın sade adisyonu (Personel 15)
 * randevu hizmetini kendi satırında, kendi tutarıyla gösteriyor. Satırlar
 * `serviceLines`in kendisi: toplamla satırlar ayrışamaz.
 */
export interface ServiceBill extends ServiceCharge {
    lines: MovementLine[];
    /**
     * Tutar Kasa'nın — telefon tahsil etmiyor (D6). Okunamadıysa ya da yoksa
     * `null`/alan yok; o durumda `visit.collect` yine kendisi reddediyor.
     */
    kasaOnly?: KasaReason | null;
}

/**
 * KASA'YA AİT ADİSYON (D6, 2026-10-16) — sunucunun kuralının aynısı
 * (`staff-api` · kasaOnlyReason).
 *
 * Kasa dört durumu kendi kuralıyla hesaplıyor (`ticketsOf`): paketli seansta
 * hizmet 0, kayıtlı indirim düşülüyor, önceki tahsilat (kapora, kısmi)
 * düşülüyor, grup TEK adisyon. Kumanda ve `visit.collect` bunları yapmıyordu:
 * Gün "₺300" derken kumanda paket hizmetini yeniden tahsil ediyordu.
 * Kullanıcı kararı: bu durumlarda telefon tutar yazmıyor ve "Kasa'dan tahsil
 * edin" diyor.
 */
export type KasaReason = 'group' | 'package' | 'discount' | 'partial';

export function kasaOnlyReason(
    row: { group_id?: unknown; custom_fields?: unknown },
    paid: number,
): KasaReason | null {
    if (typeof row.group_id === 'string' && row.group_id) return 'group';
    const fields = (row.custom_fields ?? {}) as Record<string, unknown>;
    if (typeof fields.paket_plan_id === 'string' && fields.paket_plan_id) return 'package';
    if ((Number(fields.cash_discount_amount) || 0) > 0) return 'discount';
    if (paid > 0) return 'partial';
    return null;
}

/** Sebebin ekrandaki adı — cümlenin başı ("Paketli seans."). */
export function kasaReasonLabel(reason: KasaReason): string {
    switch (reason) {
        case 'package': return 'Paketli seans';
        case 'discount': return 'İndirimli adisyon';
        case 'partial': return 'Önceden ödeme alınmış';
        case 'group': return 'Grup adisyonu';
    }
}

/** Sunucudan gelen sebep — bilinmeyen değer `null` (uydurulmuyor). */
export function kasaReasonOf(value: unknown): KasaReason | null {
    return value === 'group' || value === 'package' || value === 'discount' || value === 'partial'
        ? value
        : null;
}

/**
 * Randevunun HİZMET ücreti — `serviceLines`in toplamı.
 *
 * `visit.collect` tutarın ilk parçasını sunucuda AYNI kuralla hesaplıyor
 * (kaydın fiyatı → katalogda kimlik → katalogda ad). Kumandanın tahsilat
 * kadranı bunu adisyonun üstüne ekliyor: tek kişilikte gösterilen rakam
 * kasaya yazılacak rakam olsun.
 */
export function serviceCharge(
    row: Pick<CashReservationRow, 'service' | 'custom_fields'>,
    services: readonly CatalogService[],
): ServiceCharge {
    const lines = serviceLines(row, services);
    return {
        amount: lines.reduce((sum, line) => sum + line.amount, 0),
        count: lines.length,
    };
}

/**
 * Adisyonun ÜCRETLİ kalemleri — FİYAT × ADET (D2, 2026-10-16).
 *
 * Eskiden adet çarpılmıyordu, çünkü masaüstü Kasa çarpmıyordu ve sunucu
 * ücretli kalemde adedi zaten reddediyordu. Artık sunucu ×2'yi kabul ediyor
 * ve `visit.collect` fiyat × adet tahsil ediyor; G4 kartı, turuncu şerit ve
 * masaüstü Kasa (`adisyonExtras`) aynı rakamı söylüyor. Kuruş yuvarlaması
 * sunucununkiyle aynı.
 */
export function adisyonLines(items: unknown): MovementLine[] {
    if (!Array.isArray(items)) return [];
    const out: MovementLine[] = [];
    for (const item of items) {
        const row = (item ?? {}) as Record<string, unknown>;
        const price = Number(row.price);
        if (!Number.isFinite(price) || price <= 0) continue;
        const raw = Number(row.qty);
        const qty = Number.isFinite(raw) && raw > 1 ? raw : 1;
        const name = String(row.name ?? '').trim() || 'Kalem';
        out.push({
            name: qty > 1 ? `${qty}× ${name}` : name,
            amount: Math.round(price * qty * 100) / 100,
        });
    }
    return out;
}

// ── Bekleyen adisyon ────────────────────────────────────────────────────────

export interface CashTicket {
    /** `group:<id>` ya da `reservation:<id>` — masaüstüyle aynı anahtar. */
    key: string;
    /** Grubun en erken randevusu; kart ve satır onu gösterir. */
    representative: CashReservationRow;
    members: CashReservationRow[];
    ids: string[];
    /** Tahsil edilecek KALAN — brüt değil. */
    balance: number;
    /** Grubun en son biten işleminin damgası. */
    endedAt: string | null;
}

const byStart = (a: CashReservationRow, b: CashReservationRow) =>
    `${a.date} ${clockText(a.start_time)}`.localeCompare(`${b.date} ${clockText(b.start_time)}`);

const CASH_DISCOUNT_AMOUNT = 'cash_discount_amount';

/**
 * Açık adisyonlar — masaüstü Kasa'nın "ödeme bekleyen" kuyruğu.
 *
 *   • Grup (`group_id`) TEK adisyon. Üyelerinden biri bile bitmediyse adisyon
 *     kasaya düşmemiş sayılıyor.
 *   • İptal üye grubu bekletmiyor, hesaba da girmiyor.
 *   • Tüm üyeler ödendiyse adisyon kapalı.
 *   • Kalan = hizmet (pakete dahilse 0) + adisyon − kayıtlı indirim − alınan
 *     tahsilat (kapora, kısmi ödeme). Brütü göstermek "ne kadar bekliyoruz"
 *     sorusunu yanlış cevaplıyordu — masaüstünün kendi gerekçesi.
 *
 * `payments` bu adisyonların randevularına bağlı TÜM tahsilatlar olmalı,
 * yalnız bugünküler değil: dün alınan kapora bugünkü kalandan düşer.
 */
export function ticketsOf(
    rows: readonly CashReservationRow[],
    payments: readonly Pick<CashPaymentRow, 'reservation_id' | 'amount'>[],
    services: readonly CatalogService[],
    packagesEnabled: boolean,
): CashTicket[] {
    const groups = new Map<string, CashReservationRow[]>();
    for (const row of rows) {
        if (row.status === 'cancelled') continue;
        const key = row.group_id ? `group:${row.group_id}` : `reservation:${row.id}`;
        const members = groups.get(key) ?? [];
        // Aynı satır iki sorgudan gelebilir (açık liste + grup üyeleri).
        if (!members.some((member) => member.id === row.id)) members.push(row);
        groups.set(key, members);
    }

    const paidBy = new Map<string, number>();
    for (const payment of payments) {
        if (!payment.reservation_id) continue;
        const amount = Number.isFinite(payment.amount) ? payment.amount : 0;
        paidBy.set(payment.reservation_id, (paidBy.get(payment.reservation_id) ?? 0) + amount);
    }

    const tickets: CashTicket[] = [];
    for (const [key, raw] of groups) {
        const members = [...raw].sort(byStart);
        if (members.length === 0 || members.some((member) => member.status !== 'completed')) continue;
        if (members.every((member) => member.is_paid)) continue;

        const representative = members[0];
        const gross = members.reduce((sum, member) => {
            const covered = packagesEnabled && Boolean(member.custom_fields?.paket_plan_id);
            const service = covered
                ? 0
                : serviceLines(member, services).reduce((s, line) => s + line.amount, 0);
            const extras = adisyonLines(member.adisyon_items).reduce((s, line) => s + line.amount, 0);
            return sum + service + extras;
        }, 0);
        const discount = Math.min(
            Math.max(0, Number(representative.custom_fields?.[CASH_DISCOUNT_AMOUNT] ?? 0) || 0),
            gross,
        );
        const already = members.reduce((sum, member) => sum + (paidBy.get(member.id) ?? 0), 0);
        const endedAt = members.reduce<string | null>(
            (latest, member) => (member.service_ended_at && (!latest || member.service_ended_at > latest)
                ? member.service_ended_at
                : latest),
            null,
        );
        tickets.push({
            key,
            representative,
            members,
            ids: members.map((member) => member.id),
            balance: Math.max(0, gross - discount - already),
            endedAt,
        });
    }
    return tickets.sort((a, b) => byStart(a.representative, b.representative));
}

// ── Dönem ───────────────────────────────────────────────────────────────────

export interface PeriodRange {
    /** Dönemin başı — yerel gece yarısı. */
    from: number;
    /** Şimdi. */
    to: number;
    /** Önceki dönemin başı. */
    prevFrom: number;
    /** Önceki dönemin AYNI NOKTASI — tam sonu değil. */
    prevTo: number;
}

/**
 * Dönem sınırları, CİHAZIN diliminde.
 *
 * Karşılaştırma "dün bu saatte" (`emptyComparison`): bugünün sabah 11'i
 * dünün TAMAMIYLA kıyaslansaydı her sabah ekran düşüş gösterirdi. Önceki
 * dönem, bu dönemde geçen süre kadar okunuyor ve kendi sonunu aşmıyor
 * (31 günlük ayın 31'i, 30 günlük önceki ayın tamamıyla kıyaslanır).
 */
export function periodRange(period: CashPeriod, nowMs: number): PeriodRange {
    const now = new Date(nowMs);
    let start: Date;
    let prevStart: Date;
    if (period === 'week') {
        // Pazartesi başlangıç — `(getDay() + 6) % 7` Pazar'ı da doğru sayıyor.
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
        prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    } else if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    }
    const elapsed = Math.max(0, nowMs - start.getTime());
    return {
        from: start.getTime(),
        to: nowMs,
        prevFrom: prevStart.getTime(),
        prevTo: Math.min(prevStart.getTime() + elapsed, start.getTime()),
    };
}

/**
 * Aralıktaki tahsilatların toplamı — baş DAHİL, son HARİÇ.
 *
 * Son hariç, çünkü önceki dönemin sonu bu dönemin başı olabiliyor: tam gece
 * yarısındaki tahsilat iki döneme birden sayılmasın.
 */
export function sumBetween(
    payments: readonly Pick<CashPaymentRow, 'amount' | 'paid_at'>[],
    from: number,
    to: number,
): number {
    let sum = 0;
    for (const payment of payments) {
        const at = Date.parse(payment.paid_at);
        if (!Number.isFinite(at) || at < from || at >= to) continue;
        if (Number.isFinite(payment.amount)) sum += payment.amount;
    }
    return sum;
}

// ── Hareketler ──────────────────────────────────────────────────────────────

const METHODS: readonly CashMethod[] = ['cash', 'card', 'transfer', 'other'];

function methodOf(value: string): CashMethod {
    return (METHODS as readonly string[]).includes(value) ? value as CashMethod : 'other';
}

/** Masaüstünün `TYPE_TR`si — açıklamasız tahsilatın adı. */
function typeWord(type: string): string {
    if (type === 'product') return 'Ürün';
    if (type === 'service') return 'Hizmet';
    return 'Tahsilat';
}

/** Müşterisi olmayan tahsilat (serbest ürün satışı) — masaüstünün kelimesi. */
export const GENERAL_CUSTOMER = 'Genel müşteri';

const two = (n: number) => String(n).padStart(2, '0');

export interface MovementLookup {
    reservations: ReadonlyMap<string, CashReservationRow>;
    /** Müşteri kimliği → ad. */
    customers: ReadonlyMap<string, string>;
    /** Personel kimliği → ad. */
    staff: ReadonlyMap<string, string>;
    services: readonly CatalogService[];
}

/** "15:40" — bir damganın cihaz saatindeki karşılığı; okunamazsa boş. */
function clockAt(iso: string | null | undefined): string {
    const at = new Date(iso ?? '');
    return Number.isNaN(at.getTime()) ? '' : `${two(at.getHours())}:${two(at.getMinutes())}`;
}

/**
 * Tahsilat satırı → Kasa hareketi. En yeni üstte.
 *
 * ── İZ (111 · v4 C1/C2) ─────────────────────────────────────────────────────
 * Damgalı satırlar uygulamaya görünmüyor; iz `voided_payments`tan ayrıca
 * geliyor (`voided`). Üç durum:
 *   • DÜZELTİLMİŞ (canlı satır, `corrected_from` dolu): tek satır, yeni
 *     tutarla; altında "düzeltildi 15:40 · önce ₺1.200". Eski satır listede
 *     AYRICA çizilmiyor — kullanıcı tek eylem yaptı, Kasa tek satır gösteriyor.
 *   • GERİ ALINMIŞ (`void_reason = 'revert'`): satır yerinde kalıyor (paranın
 *     alındığı saatte), tutar toplama girmiyor, altında "geri alındı 15:40".
 *     Kaybolsaydı gün toplamının neden düştüğü açıklanamazdı.
 *   • Düzeltmeyle damgalanan eski satır (`void_reason = 'correction'`): yalnız
 *     "önce ₺…" tutarının kaynağı.
 *
 * `staff` hizmeti VEREN personel: masaüstü `payments.staff_id`e randevunun
 * personelini yazıyor, parayı kasada alan kişiyi değil. Kart bu yüzden
 * "aldı" değil "verdi" diyor (`cash.staffLine`).
 *
 * Kalem dökümü YALNIZ toplamı tahsilatı tutuyorsa veriliyor. İndirim,
 * kapora ya da elle girilmiş tutar dökümü bozar; toplamı tutmayan bir döküm,
 * dökümsüzlükten çok yanıltır — düzeltilmiş tutar da çoğu zaman tutmaz.
 */
export function toMovements(
    payments: readonly CashPaymentRow[],
    lookup: MovementLookup,
    voided: readonly CashPaymentRow[] = [],
): Movement[] {
    const stamped = new Map(voided.map((row) => [row.id, row]));
    const reverted = voided.filter((row) => row.void_reason === 'revert');
    return [...payments, ...reverted]
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
        .map((payment) => {
            const reservation = payment.reservation_id
                ? lookup.reservations.get(payment.reservation_id)
                : undefined;
            const customer = (payment.customer_id ? lookup.customers.get(payment.customer_id) : undefined)
                ?? (reservation?.customer_name?.trim() || undefined)
                ?? GENERAL_CUSTOMER;
            const staffId = payment.staff_id ?? reservation?.staff_id ?? null;
            const at = new Date(payment.paid_at);
            const valid = !Number.isNaN(at.getTime());
            const time = valid ? `${two(at.getHours())}:${two(at.getMinutes())}` : '';
            const iso = valid ? `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}` : '';

            const movement: Movement = {
                id: payment.id,
                time,
                customer,
                initials: initialsOf(customer),
                service: payment.description?.trim() || reservation?.service?.trim() || typeWord(payment.type),
                staff: (staffId ? lookup.staff.get(staffId) : undefined) ?? '',
                amount: Number.isFinite(payment.amount) ? payment.amount : 0,
                method: methodOf(payment.method),
                status: 'normal',
                reservationId: payment.reservation_id,
            };
            if (payment.voided_at) {
                movement.status = 'voided';
                movement.voidedAt = clockAt(payment.voided_at);
            } else if (payment.corrected_from) {
                movement.status = 'corrected';
                movement.correctedFrom = payment.corrected_from;
                movement.correctedAt = clockAt(payment.created_at);
                const before = stamped.get(payment.corrected_from);
                if (before && Number.isFinite(before.amount)) movement.correctedFromAmount = before.amount;
            }
            if (valid) movement.dateLabel = `${formatDayMonth(iso)} ${at.getFullYear()}, ${time}`;
            if (reservation) {
                movement.range = `${clockText(reservation.start_time)}–${clockText(reservation.end_time)}`;
                const lines = [
                    ...serviceLines(reservation, lookup.services),
                    ...adisyonLines(reservation.adisyon_items),
                ].filter((line) => line.amount > 0);
                const sum = lines.reduce((s, line) => s + line.amount, 0);
                if (lines.length > 0 && sum === movement.amount) movement.lines = lines;
            }
            return movement;
        });
}
