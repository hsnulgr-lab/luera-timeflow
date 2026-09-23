/**
 * Müdür ekranlarının CANLI okuma katmanı.
 *
 * `calendarSource.CalendarSource` yüzeyini Supabase üzerinden karşılar. Sahte
 * kaynak (`mockSource`) yerine geçecek olan budur; anahtar tek satır
 * (`calendarSource.source`) ve o anahtar ekran ekran çevriliyor.
 *
 * Saf kurallar burada DEĞİL, `managerMap.ts`'te: hangi org, satır neye
 * dönüşür, gün kaç sayılır. Bu dosya yalnız sorguyu kurup atıyor ve org
 * kimliğini bir kez çözüp saklıyor.
 */

import { supabase, supabaseConfigured } from './supabase';
import { authApi } from '../api/session';
import { addDaysISO, daysBetween } from './calendar.ts';
import type { CalendarSource } from './calendarSource';
import {
    chooseOrg, countsOf, fillRange, RES_COLS, toAppt, toCrew,
    type CrewMember, type OrgChoice, type OrgRefusal,
} from './managerMap.ts';
import type { Appt } from './calendar.ts';
import type { FlowRow, PaymentRow } from './flowBuild.ts';
import type { ApptContext } from './managerFlow.ts';
import { riskList } from './customerFileMap.ts';
import type { EligibilityRule } from './eligibility.ts';
import type { PackageRow } from './apptInfo.ts';
import { catalogOf, type CashPaymentRow, type CashReservationRow, type CatalogService } from './cashBuild.ts';
import type { CustomerRecord, VisitRecord } from './createLive.ts';
import { deletionFactsOf } from './accountMap.ts';

/**
 * Org çözülemediğinde atılan hata.
 *
 * Ağ hatasından AYRI bir tip: "bu salondan çıkarılmışsınız" ile "okuyamadık"
 * aynı ekranı açamaz. Çağıran taraf `reason`a bakıp hangisini çizeceğine
 * karar veriyor.
 */
export class OrgError extends Error {
    readonly reason: OrgRefusal;

    constructor(reason: OrgRefusal) {
        super(`org_${reason}`);
        this.name = 'OrgError';
        this.reason = reason;
    }
}

// ── Org kimliği ─────────────────────────────────────────────────────────────

/**
 * Çözülmüş org, KULLANICI kimliğine bağlı olarak saklanıyor.
 *
 * Süresiz bir önbellek, ortak bir cihazda müdür çıkıp başka müdür girdiğinde
 * ÖNCEKİNİN org'unu ikinciye taşırdı. RLS o sorguyu boş döndürür — veri
 * sızmaz ama ekran sebepsiz boş kalır ve kimse nedenini anlamaz. Anahtar
 * kullanıcı kimliği olunca önbellek kendiliğinden ıskalıyor.
 */
let cached: { userId: string; choice: OrgChoice } | null = null;

/** Okunabilen org'lar — liste RLS'in süzdüğü hâliyle geliyor. */
async function readableOrgIds(): Promise<string[]> {
    const { data, error } = await supabase.from('organizations').select('id');
    if (error) throw error;
    return (data ?? []).map((row) => String(row.id));
}

/** Girişte SEÇİLEN salon; cihazda duruyor, sunucuya sorulmuyor. */
async function storedOrgId(): Promise<string | null> {
    const result = await authApi.resume.get();
    if (!result.ok || result.data.profile.actor !== 'manager') return null;
    return result.data.profile.business?.id ?? null;
}

/**
 * Okunacak org.
 *
 * `no_session` burada karara bağlanıyor: Supabase oturumu yoksa sorulacak bir
 * org da yok. Ağ hatası ise ÇÖZÜM DEĞİL — geriye `OrgChoice` dönmüyor,
 * hatanın kendisi atılıyor ki "okunamadı" ile "erişim yok" karışmasın.
 */
export async function resolveOrg(): Promise<OrgChoice> {
    if (!supabaseConfigured) return { ok: false, reason: 'no_session' };
    // `getUser()` DEĞİL: o her çağrıda sunucuya gidiyor ve ağ kesildiğinde
    // boş dönüyor — yani bir sinyal boşluğu "oturum yok" diye okunur, müdür
    // durduk yere çıkış ekranına düşerdi. `getSession()` cihazdaki oturumu
    // okuyor; RLS'in kullanacağı kimlik de zaten o.
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;
    if (!userId) {
        cached = null;
        return { ok: false, reason: 'no_session' };
    }
    if (cached?.userId === userId) return cached.choice;

    const [stored, readable] = await Promise.all([storedOrgId(), readableOrgIds()]);
    const choice = chooseOrg(stored, readable);
    cached = { userId, choice };
    return choice;
}

/** Org kimliği ya da uygun hata. Sorgu kuran her yer buradan geçiyor. */
async function orgIdOrThrow(): Promise<string> {
    const choice = await resolveOrg();
    if (!choice.ok) throw new OrgError(choice.reason);
    return choice.id;
}

/**
 * Saklanan org kararını unutur.
 *
 * Müdür salon değiştirdiğinde çağrılır: karar cihazdaki profilden geliyor ve
 * o profil değiştiyse önbellek eskimiş demektir.
 */
export function forgetOrg(): void {
    cached = null;
    for (const hook of forgetHooks) hook();
}

/*
 * Org kararı unutulunca haber verilecek yerler.
 *
 * Canlı sinyal kanalı org'a bağlı (`live:<org>`): salon değişince eski salonun
 * kanalı açık kalırsa telefon YANLIŞ salonun hareketiyle tazelenir. Kanal
 * katmanı buraya kaydoluyor; ters yönde bir içe aktarma (managerSource →
 * liveSignal) döngü yaratırdı.
 */
const forgetHooks = new Set<() => void>();

export function onForgetOrg(hook: () => void): void {
    forgetHooks.add(hook);
}

// ── Okuma ───────────────────────────────────────────────────────────────────

/**
 * Aralıktaki günlerin listesi. Şerit `fillRange` ile eksik günü sıfıra
 * çekiyor; hangi günlerin gerçekten okunduğunu bilen tek yer burası.
 */
function daysIn(from: string, to: string): string[] {
    const span = daysBetween(from, to);
    if (span < 0) return [];
    return Array.from({ length: span + 1 }, (_, index) => addDaysISO(from, index));
}

/**
 * Salonun kadrosu.
 *
 * `CalendarSource` yüzeyinde yok: o yüzey randevuları taşıyor, kadroyu değil.
 * Takvim ve akış ekranları bunu ayrıca çağırıyor — bugün ikisi de
 * `managerFlow.mockDay.presence`ten besleniyor ve orada altı sahte isim var.
 */
export async function fetchCrew(): Promise<CrewMember[]> {
    const organizationId = await orgIdOrThrow();
    const { data, error } = await supabase
        .from('staff')
        .select('id, name, color, is_active, phone')
        .eq('organization_id', organizationId)
        // Sıra ADA göre sabit: sunucunun döndürdüğü rastgele sıra, sütunların
        // her okumada yer değiştirmesi demekti.
        .order('name')
        .returns<Record<string, unknown>[]>();
    if (error) throw error;
    return (data ?? []).map(toCrew);
}

/**
 * Sunucunun saati (ms).
 *
 * "Ne kadardır işlemde" ve "ne kadardır bekliyor" TELEFONUN saatinden
 * türetilemez: yanlış ayarlı bir telefon müşteriyi kırk dakika bekletmiş gibi
 * gösterip müdürü boşuna personelin üstüne yollardı. Personel tarafında bunu
 * `staff-api` hesaplıyor; müdür doğrudan Postgres'e baktığı için araya giren
 * kimse yok — `095` bu yüzden var.
 *
 * Okuma BAŞINA bir kez çağrılıyor, randevu başına değil.
 */
export async function fetchServerNow(): Promise<number> {
    const { data, error } = await supabase.rpc('server_now');
    if (error) throw error;
    const at = Date.parse(String(data));
    // Çözülemeyen bir damga sessizce cihaz saatine düşmüyor — o, kuralın
    // kendisini delerdi. Hata atılıyor ve ekran "okunamadı" diyor.
    if (!Number.isFinite(at)) throw new Error('server_now_unreadable');
    return at;
}

/**
 * Aralıktaki izin günleri, personel başına.
 *
 * İzin tabloda gün gün duruyor (`staff_time_off`, `UNIQUE(staff_id, date)`) —
 * aralık olarak değil. "Dönüş tarihi" diye bir kolon YOK ve olmayacak;
 * ardışık günlerden türetiliyor (`staffDay.returnDateISO`). Bu yüzden tek gün
 * değil, ileriye doğru bir pencere okunuyor.
 */
export async function fetchLeave(from: string, to: string): Promise<Map<string, string[]>> {
    const organizationId = await orgIdOrThrow();
    const { data, error } = await supabase
        .from('staff_time_off')
        .select('staff_id, date')
        .eq('organization_id', organizationId)
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .returns<Record<string, unknown>[]>();
    if (error) throw error;
    const byStaff = new Map<string, string[]>();
    for (const row of data ?? []) {
        const id = String(row.staff_id);
        const list = byStaff.get(id) ?? [];
        list.push(String(row.date));
        byStaff.set(id, list);
    }
    return byStaff;
}

/**
 * Organizasyonun ayar satırı.
 *
 * `settings.user_id` TEKİL, `organization_id` değil: çok üyeli bir org'da
 * birden çok satır olur. Doğru satır org SAHİBİNİNKİ — `staff-api` de aynı
 * satırı okuyor. Başka bir satıra bakmak, müdürün telefonuyla personelin
 * telefonunun FARKLI risk kurallarını göstermesi demekti.
 *
 * Sahibin satırı yoksa (elle taşınmış veri) en eskiye düşülüyor: yanlış
 * olabilir ama en azından KARARLI — ve sunucudakiyle aynı kararlı.
 */
export async function fetchOrgSettings(cols: string): Promise<Record<string, unknown> | null> {
    const organizationId = await orgIdOrThrow();
    const { data: org, error: orgError } = await supabase
        .from('organizations').select('owner_id').eq('id', organizationId).maybeSingle();
    if (orgError) throw orgError;
    const ownerId = (org as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
        const { data, error } = await supabase.from('settings').select(cols)
            .eq('organization_id', organizationId)
            .eq('user_id', ownerId)
            .maybeSingle()
            .returns<Record<string, unknown> | null>();
        if (error) throw error;
        if (data) return data;
    }
    const { data, error } = await supabase.from('settings').select(cols)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(1).maybeSingle()
        .returns<Record<string, unknown> | null>();
    if (error) throw error;
    return data;
}

/**
 * Salonun gecikme toleransı (dk) — yoksa `null`, varsayılanı türetme katmanı
 * veriyor.
 *
 * ── KOLON GÜVENCESİ YOK ─────────────────────────────────────────────────────
 * `settings.arrival_tolerance_min` repodaki HİÇBİR migration'da yok.
 * Masaüstü onu `select('*')` içinden okuyor; kolon yoksa alan boş gelir ve
 * sessizce 120'ye düşer. Adıyla istemek ise kolon yoksa PostgREST'ten 42703
 * alır — ve bu okuma akışın okumasının parçası olduğu için BÜTÜN akış
 * "okunamadı"ya düşerdi. Yalnız bu hata yutuluyor; ağ hatası ve red atılıyor.
 */
export async function fetchArrivalTolerance(): Promise<number | null> {
    try {
        const row = await fetchOrgSettings('arrival_tolerance_min');
        const value = Number(row?.arrival_tolerance_min);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch (cause) {
        if ((cause as { code?: string } | null)?.code === UNDEFINED_COLUMN) return null;
        throw cause;
    }
}

/** Postgres: "column does not exist". */
const UNDEFINED_COLUMN = '42703';

/**
 * Tek randevu — kimliğiyle.
 *
 * `updated_at` de geliyor ve BİLEREK: müdürün yazması iyimser kilit
 * kullanacak (`.eq('updated_at', okunan)`) ve kilidin dayanağı bu okumada
 * görülen damga. Yazarken yeniden okumak, iki okuma arasındaki değişikliği
 * görmeden üstüne yazmak olurdu — kilidin tam olarak engellediği şey.
 */
export async function fetchAppointment(
    id: string,
): Promise<{ row: Appt | null; updatedAt: string | null }> {
    const organizationId = await orgIdOrThrow();
    const { data, error } = await supabase
        .from('reservations')
        .select(`${RES_COLS}, updated_at`)
        .eq('organization_id', organizationId)
        .eq('id', id)
        .maybeSingle()
        .returns<Record<string, unknown> | null>();
    if (error) throw error;
    if (!data) return { row: null, updatedAt: null };
    return {
        row: toAppt(data),
        updatedAt: data.updated_at ? String(data.updated_at) : null,
    };
}

/**
 * Günün randevuları + KİLİT DAMGALARI.
 *
 * `apiSource.day` damgayı getirmiyor ve getirmemeli: `CalendarSource` bir
 * görünüm sözleşmesi, `updated_at` onun alanı değil. Ama takvimden yapılan
 * taşıma da iyimser kilide muhtaç — damgasız yazmak, kartın sahip olduğu
 * korumayı takvimde kapatmak olurdu. Akışın `fetchFlowRows`'u tam olarak aynı
 * ayrımı yapıyor.
 */
export async function fetchDayWithStamps(
    dateISO: string,
): Promise<{ rows: Appt[]; stamps: Map<string, string> }> {
    const organizationId = await orgIdOrThrow();
    const { data, error } = await supabase
        .from('reservations')
        .select(`${RES_COLS}, updated_at`)
        .eq('organization_id', organizationId)
        .eq('date', dateISO)
        .order('start_time')
        .returns<Record<string, unknown>[]>();
    if (error) throw error;
    const stamps = new Map<string, string>();
    for (const row of data ?? []) {
        if (row.updated_at) stamps.set(String(row.id), String(row.updated_at));
    }
    return { rows: (data ?? []).map(toAppt), stamps };
}

export interface CustomerContext {
    customFields: Record<string, unknown> | null;
    packages: PackageRow[];
    history: { date: string; service: string | null; status: string }[];
    riskRules: { key?: string; label?: string; note?: string | null }[];
}

/**
 * Müşteri künyesinin ham parçaları.
 *
 * Risk bayrakları AYRI bir kolonda değil, `custom_fields` içinde yaşıyor
 * (076); kuralların kendisi `settings.risk_rules`ta. İkisi de ham dönüyor ve
 * eşlemeyi `apptInfo` yapıyor — kural motorunu iki yerde çalıştırmak, ikisinin
 * bir gün ayrışması demekti. `staff-api` de tam olarak böyle yapıyor.
 */
export async function fetchCustomerContext(customerId: string): Promise<CustomerContext> {
    const organizationId = await orgIdOrThrow();
    const [customer, packages, history, settings] = await Promise.all([
        supabase.from('customers').select('custom_fields')
            .eq('organization_id', organizationId).eq('id', customerId)
            /*
             * ARŞİV SÜZGECİ YOK. 009 müşteriyi `is_active = false` ile
             * arşivliyor (`deleted_at` diye bir kolon YOK — bir süre burada
             * o isteniyordu ve okumayı düşürürdü). Arşivlenmiş müşterinin
             * açık randevusu hâlâ gerçek; risk notu kartta görünmeli.
             */
            .maybeSingle().returns<Record<string, unknown> | null>(),
        fetchPackageRows(organizationId, [customerId]),
        supabase.from('reservations').select('date, service, status')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .order('date', { ascending: false }).limit(HISTORY_LIMIT)
            .returns<Record<string, unknown>[]>(),
        fetchOrgSettings('risk_rules'),
    ]);
    if (customer.error) throw customer.error;
    if (history.error) throw history.error;
    return {
        customFields: (customer.data?.custom_fields as Record<string, unknown> | null) ?? null,
        packages,
        history: (history.data ?? []).map((row) => ({
            date: String(row.date),
            service: (row.service as string | null) ?? null,
            status: String(row.status),
        })),
        riskRules: (settings?.risk_rules as CustomerContext['riskRules'] | null) ?? [],
    };
}

/**
 * Geçmiş kaç ziyaret okunuyor.
 *
 * Kartın ihtiyacı iki şey: kaçıncı ziyaret ve sonuncusu ne zamandı. Ama sayı
 * ham satırdan geliyor, o yüzden sınır SAYIYI da sınırlıyor: yüz ziyaretlik
 * bir müşteri "51. ziyaret" görünür. Elli, salon ölçeğinde bir müşterinin
 * yıllarca sürecek geçmişini kapsıyor; daha yükseği kartın taşımadığı bir
 * veriyi taşımak olurdu.
 */
const HISTORY_LIMIT = 50;

/** Akışın ihtiyacı olan ek sütunlar — `is_paid` randevunun tahsil hâli. */
const FLOW_COLS = `${RES_COLS}, is_paid, updated_at`;
/** Müdürün "Gelmedi" kararı (098). Ayrı, çünkü sütun 098 çalışana kadar YOK. */
const FLOW_NO_SHOW_COL = 'no_show_at';

/** Günün randevuları, akışın beklediği ham şekilde. */
export async function fetchFlowRows(
    dateISO: string,
): Promise<{ rows: FlowRow[]; stamps: Map<string, string> }> {
    const organizationId = await orgIdOrThrow();
    const query = (cols: string) => supabase
        .from('reservations')
        .select(cols)
        .eq('organization_id', organizationId)
        .eq('date', dateISO)
        .order('start_time')
        .returns<Record<string, unknown>[]>();
    /*
     * OLMAYAN KOLON DERSİ: `no_show_at` 098 çalıştırılana kadar yok ve
     * PostgREST bilinmeyen kolonda BÜTÜN sorguyu reddediyor — akış
     * "okunamadı"ya düşerdi. Yalnız o hata (42703) yakalanıp sütunsuz
     * okunuyor; öteki her hata aynen fırlatılıyor.
     */
    let { data, error } = await query(`${FLOW_COLS}, ${FLOW_NO_SHOW_COL}`);
    if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await query(FLOW_COLS));
    if (error) throw error;
    /*
     * Kilit damgaları AYRI bir haritada: akış satırı bir görünüm modeli ve
     * `updated_at` onun parçası değil. Ama akıştan yapılan her yazma
     * (Geldi, Onayla, Reddet) iyimser kilide muhtaç — damga olmadan yazmak
     * kilidi baştan devre dışı bırakmak olurdu.
     */
    const stamps = new Map<string, string>();
    for (const row of data ?? []) {
        if (row.updated_at) stamps.set(String(row.id), String(row.updated_at));
    }
    const rows = (data ?? []).map((row) => ({
        id: String(row.id),
        customer_id: (row.customer_id as string | null) ?? null,
        customer_name: String(row.customer_name ?? ''),
        customer_phone: (row.customer_phone as string | null) ?? null,
        start_time: String(row.start_time),
        end_time: String(row.end_time),
        service: String(row.service ?? ''),
        status: String(row.status),
        staff_id: (row.staff_id as string | null) ?? null,
        customer_arrived_at: (row.customer_arrived_at as string | null) ?? null,
        arrived_at: (row.arrived_at as string | null) ?? null,
        service_ended_at: (row.service_ended_at as string | null) ?? null,
        no_show_at: (row.no_show_at as string | null) ?? null,
        is_paid: row.is_paid === true,
    }));
    return { rows, stamps };
}

/** Günün tahsilatları — ciro ve "tahsil edildi" satırlarının kaynağı. */
export async function fetchPayments(dateISO: string): Promise<PaymentRow[]> {
    const organizationId = await orgIdOrThrow();
    /*
     * Gün sınırı CİHAZIN diliminde kuruluyor: `paid_at` bir `timestamptz` ve
     * salonun günü yerel gündür. UTC'ye göre kesmek, akşam 22:00'deki
     * tahsilatı ertesi güne atardı.
     */
    const from = new Date(`${dateISO}T00:00:00`).toISOString();
    const to = new Date(`${dateISO}T23:59:59.999`).toISOString();
    const { data, error } = await supabase
        .from('payments')
        .select('reservation_id, amount, paid_at')
        .eq('organization_id', organizationId)
        .gte('paid_at', from)
        .lte('paid_at', to)
        .order('paid_at')
        .returns<Record<string, unknown>[]>();
    if (error) throw error;
    return (data ?? []).map((row) => ({
        reservation_id: (row.reservation_id as string | null) ?? null,
        amount: Number(row.amount ?? 0),
        paid_at: String(row.paid_at),
    }));
}

// ── Hizmet kataloğu ─────────────────────────────────────────────────────────

/**
 * Salonun hizmetleri — `services` tablosu, org başına.
 *
 * `settings`te DEĞİL (bkz. `cashBuild.CatalogService`). Sıra masaüstündeki
 * gibi `created_at`: randevu ekranındaki hizmet listesi iki yerde aynı
 * sırada dursun.
 */
export async function fetchServices(): Promise<CatalogService[]> {
    const organizationId = await orgIdOrThrow();
    const read = (cols: string) => supabase.from('services')
        .select(cols)
        .eq('organization_id', organizationId)
        .order('created_at')
        .returns<Record<string, unknown>[]>();
    // `tags` 076'da geldi. Kolon yoksa katalog KAPANMIYOR — yalnız kapalı
    // hizmet kararı ad desenine düşüyor (masaüstünün etiketsiz yolu).
    let { data, error } = await read('id, name, duration, price, color, tags');
    if (error && (error as { code?: string }).code === UNDEFINED_COLUMN) {
        ({ data, error } = await read('id, name, duration, price, color'));
    }
    if (error) throw error;
    return catalogOf(data ?? []);
}

// ── Randevu oluştur ─────────────────────────────────────────────────────────

/**
 * Müşteri defteri: AKTİF kayıtlar + son 24 ayın gelişleri.
 *
 * Arşiv (`is_active = false`) listede yok — masaüstünün müşteri listesi de
 * göstermiyor. Arşivdeki biri aynı numarayla yeniden gelirse yazma yolu onu
 * bulup geri açıyor (`managerWrite.createAppointment`).
 *
 * "Son geliş" randevulardan türüyor ve 24 ayla sınırlı — `staff-api`nin
 * defteriyle aynı pencere ve aynı gerekçe: o kadar süredir gelmeyen müşteri
 * için "son geliş yok" doğru bilgi.
 */
export const VISIT_WINDOW_DAYS = 730;

/**
 * Defterin ziyaret satırı — `VisitRecord`'un müdüre bakan hâli.
 *
 * `staff_id` müşterinin KİMDE olduğunu, `no_show_at` kaç kez gelmediğini
 * söylüyor (098 damgası). Randevu kurma ekranı bu iki alanı okumuyor;
 * fazladan alan taşımak, ikinci bir sorgu açmaktan ucuz.
 */
export type BookVisitRow = VisitRecord & {
    staff_id: string | null;
    no_show_at: string | null;
};

export async function fetchCustomerBook(todayISO: string): Promise<{
    people: CustomerRecord[];
    visits: BookVisitRow[];
}> {
    const organizationId = await orgIdOrThrow();
    const since = addDaysISO(todayISO, -VISIT_WINDOW_DAYS);
    const visitQuery = (cols: string) => readAll((from, to) => supabase.from('reservations')
        .select(cols)
        .eq('organization_id', organizationId)
        .not('customer_id', 'is', null)
        .neq('status', 'cancelled')
        .gte('date', since)
        .lte('date', todayISO)
        .order('date', { ascending: false }).order('id')
        .range(from, to)
        .returns<Record<string, unknown>[]>());
    const BOOK_COLS = 'customer_id, date, start_time, service, status, staff_id';
    const [people, visits] = await Promise.all([
        readAll((from, to) => supabase.from('customers').select('id, name, phone, custom_fields')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('name').order('id')
            .range(from, to)
            .returns<Record<string, unknown>[]>()),
        /*
         * OLMAYAN KOLON: `no_show_at` 098 çalıştırılana kadar yok ve
         * PostgREST bilinmeyen kolonda BÜTÜN sorguyu reddediyor — defter
         * "okunamadı"ya düşerdi. Sütunsuz okuma gelmedi sayısını sıfırlar,
         * defteri kapatmaz (bkz. `fetchFlowRows` · aynı ders).
         */
        visitQuery(`${BOOK_COLS}, no_show_at`)
            .catch((cause: unknown) => {
                if ((cause as { code?: string } | null)?.code === UNDEFINED_COLUMN) {
                    return visitQuery(BOOK_COLS);
                }
                throw cause;
            }),
    ]);
    return {
        people: people.map((row) => ({
            id: String(row.id),
            name: String(row.name ?? ''),
            phone: String(row.phone ?? ''),
            // Randevuda kapalı hizmet kararı için (Müdür 23 v2).
            fields: row.custom_fields && typeof row.custom_fields === 'object' && !Array.isArray(row.custom_fields)
                ? row.custom_fields as Record<string, unknown>
                : null,
        })),
        visits: visits.map((row) => ({
            customer_id: (row.customer_id as string | null) ?? null,
            date: String(row.date ?? ''),
            start_time: String(row.start_time ?? ''),
            service: String(row.service ?? ''),
            status: String(row.status ?? ''),
            staff_id: (row.staff_id as string | null) ?? null,
            no_show_at: (row.no_show_at as string | null) ?? null,
        })),
    };
}

export interface CreateSettings {
    businessName: string;
    sector: string | null;
    workingHours: unknown;
    webhookUrl: string | null;
    mapsUrl: string | null;
    /** Sektörün kontrendikasyon kuralları (076) — kapalı hizmet kararı. */
    riskRules: EligibilityRule[];
}

/**
 * Randevu kurmanın ayarları: saatler (slot rayı), işletme adı ve sektör
 * (onay mesajı), webhook adresi, konum bağlantısı.
 *
 * Kolonların hepsi migration'larda VAR (`init_database` · `013`); ada göre
 * isteniyor, `*` DEĞİL — ayar satırında müdür PIN'i de duruyor ve telefona
 * gereksiz yere taşınmıyor.
 */
export async function fetchCreateSettings(): Promise<CreateSettings> {
    const organizationId = await orgIdOrThrow();
    const [settings, org] = await Promise.all([
        fetchOrgSettings('business_name, sector, working_hours, webhook_url, risk_rules'),
        supabase.from('organizations').select('maps_url').eq('id', organizationId).maybeSingle()
            .returns<{ maps_url?: string | null } | null>(),
    ]);
    if (org.error) throw org.error;
    const hook = String(settings?.webhook_url ?? '').trim();
    return {
        businessName: String(settings?.business_name ?? '').trim(),
        sector: typeof settings?.sector === 'string' ? settings.sector : null,
        workingHours: settings?.working_hours ?? null,
        webhookUrl: /^https?:\/\//i.test(hook) ? hook : null,
        mapsUrl: org.data?.maps_url?.trim() || null,
        riskRules: Array.isArray(settings?.risk_rules) ? settings.risk_rules as EligibilityRule[] : [],
    };
}

/**
 * Personelin kendi haftalık saatleri (`staff.working_hours`, 008) — kimlik →
 * saat dizisi. Boş olan salonun saatini kullanır.
 *
 * `fetchCrew`e eklenmedi: kadroyu okuyan yedi ekranın hiçbiri buna muhtaç
 * değil; yalnız randevu kurmanın uygunluk kuralı.
 */
export async function fetchStaffSchedules(): Promise<Map<string, unknown>> {
    const organizationId = await orgIdOrThrow();
    const { data, error } = await supabase.from('staff').select('id, working_hours')
        .eq('organization_id', organizationId)
        .returns<Record<string, unknown>[]>();
    if (error) throw error;
    return new Map((data ?? []).map((row) => [String(row.id), row.working_hours ?? null]));
}

/** Tek müşteri — müşteri kartından "Randevu ver" ile gelindiğinde. */
export async function fetchCustomerById(id: string): Promise<CustomerRecord | null> {
    const organizationId = await orgIdOrThrow();
    const { data, error } = await supabase.from('customers').select('id, name, phone')
        .eq('organization_id', organizationId).eq('id', id).maybeSingle()
        .returns<Record<string, unknown> | null>();
    if (error) throw error;
    if (!data) return null;
    return { id: String(data.id), name: String(data.name ?? ''), phone: String(data.phone ?? '') };
}

// ── Ayarlar ─────────────────────────────────────────────────────────────────

/**
 * Çalışma saatlerinin okunduğu SATIR — yazma aynı satıra gidecek.
 *
 * `userId` satırın sahibi (org sahibi; yoksa en eski satır). `stamp` iyimser
 * kilidin dayanağı: masaüstü ayarları TÜM satırı ezerek yazıyor, telefon
 * arada değişen bir satırın üstüne yazmasın.
 */
export interface HoursRow {
    raw: unknown;
    userId: string;
    stamp: string | null;
}

/** Bildirim tercihleri satırı — `HoursRow` ile aynı şekil (105). */
export interface PrefsRow {
    raw: unknown;
    userId: string;
    stamp: string | null;
}

/**
 * Müdürün bildirim tercihleri satırı (105).
 *
 * `HoursRow` ile aynı şekil: ham değer + sahibin kimliği + damga. Damga
 * iyimser kilit için — iki telefon aynı anda anahtar değiştirirse ikincisi
 * `stale` alır ve okuduğu hâli ezmez.
 *
 * Satır yoksa `null`: ekran bunu "hepsi kapalı" diye çizmiyor, okunamadı
 * diye çiziyor.
 */
export async function fetchNotificationPrefs(): Promise<PrefsRow | null> {
    const row = await fetchOrgSettings('user_id, notification_prefs, updated_at');
    if (!row?.user_id) return null;
    return {
        raw: row.notification_prefs ?? null,
        userId: String(row.user_id),
        stamp: (row.updated_at as string | null) ?? null,
    };
}

export async function fetchHoursRow(): Promise<HoursRow | null> {
    const row = await fetchOrgSettings('user_id, working_hours, updated_at');
    if (!row?.user_id) return null;
    return {
        raw: row.working_hours ?? null,
        userId: String(row.user_id),
        stamp: (row.updated_at as string | null) ?? null,
    };
}

// ── Paketler ───────────────────────────────────────────────────────────────

/**
 * Müşterilerin paketleri — İKİ kaynaktan.
 *
 * Güzellik/kuaför paketi `treatment_plans`ta (tür `paket`, 077): masaüstünün
 * satış çekmecesi oraya yazıyor, seans tükenince `sessions_done` artıyor.
 * Telefon bir süre yalnız eski `customer_packages`ı okudu ve masaüstünde
 * satılan paketi HİÇ göstermedi. Eski tablo gitmedi — fizyoterapinin ticari
 * hakkı orada — o yüzden ikisi birleşiyor.
 *
 * İptal edilen plan paket değil. Kalan ödeme yalnız O PAKETE bağlı
 * tahsilatlardan (`payments.treatment_plan_id`) hesaplanıyor.
 */
export async function fetchPackageRows(
    organizationId: string,
    customerIds: readonly string[],
): Promise<PackageRow[]> {
    const ids = [...new Set(customerIds)].filter(Boolean);
    if (ids.length === 0) return [];
    const plansOf = (onlyPackages: boolean) => {
        let query = supabase.from('treatment_plans')
            .select('id, customer_id, title, total_amount, status, session_count, sessions_done, created_at')
            .eq('organization_id', organizationId).in('customer_id', ids)
            .neq('status', 'cancelled');
        // 077 yoksa tür kolonu yok: süzgeçsiz okunuyor (masaüstünün düşüşü).
        if (onlyPackages) query = query.eq('plan_kind', 'paket');
        return query.order('created_at').returns<Record<string, unknown>[]>();
    };
    const [firstPlans, legacy] = await Promise.all([
        plansOf(true),
        supabase.from('customer_packages').select('customer_id, name, total_sessions, used_sessions, created_at')
            .eq('organization_id', organizationId).in('customer_id', ids)
            .order('created_at').returns<Record<string, unknown>[]>(),
    ]);
    let plans = firstPlans;
    if ((plans.error as { code?: string } | null)?.code === UNDEFINED_COLUMN) plans = await plansOf(false);
    if (plans.error) throw plans.error;
    if (legacy.error) throw legacy.error;

    const planIds = (plans.data ?? []).map((row) => String(row.id));
    const paidByPlan = new Map<string, number>();
    if (planIds.length > 0) {
        const paid = await supabase.from('payments').select('treatment_plan_id, amount')
            .eq('organization_id', organizationId).in('treatment_plan_id', planIds)
            .returns<{ treatment_plan_id: string | null; amount: number | null }[]>();
        if (paid.error) throw paid.error;
        for (const row of paid.data ?? []) {
            if (!row.treatment_plan_id) continue;
            paidByPlan.set(row.treatment_plan_id, (paidByPlan.get(row.treatment_plan_id) ?? 0) + (Number(row.amount) || 0));
        }
    }

    const rows: PackageRow[] = [
        ...(plans.data ?? []).map((row) => {
            const id = String(row.id);
            const amount = Number(row.total_amount ?? 0) || 0;
            return {
                name: String(row.title ?? ''),
                total_sessions: Math.max(1, Number(row.session_count ?? 1) || 1),
                used_sessions: Math.max(0, Number(row.sessions_done ?? 0) || 0),
                customer_id: String(row.customer_id),
                plan_id: id,
                owed: Math.max(0, amount - (paidByPlan.get(id) ?? 0)),
                created_at: String(row.created_at ?? ''),
            };
        }),
        ...(legacy.data ?? []).map((row) => ({
            name: String(row.name ?? ''),
            total_sessions: Number(row.total_sessions ?? 0),
            used_sessions: Number(row.used_sessions ?? 0),
            customer_id: String(row.customer_id),
            plan_id: null,
            owed: null,
            created_at: String(row.created_at ?? ''),
        })),
    ];
    return rows.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
}

/**
 * Müdür 35 · Paket sat ekranının ham parçaları.
 *
 * Şablonlar `package_templates`tan (069), yalnız aktif olanlar. Tablo yoksa
 * (42P01) liste boş — ekran hizmetlerden satışa düşer, kapanmaz.
 */
export async function fetchPackageSaleRows(customerId: string) {
    const organizationId = await orgIdOrThrow();
    const [customer, templates, services, settings, packages] = await Promise.all([
        supabase.from('customers').select('id, name, phone, custom_fields')
            .eq('organization_id', organizationId).eq('id', customerId).maybeSingle()
            .returns<Record<string, unknown> | null>(),
        supabase.from('package_templates').select('id, name, session_count, price, color')
            .eq('organization_id', organizationId).eq('is_active', true)
            .order('created_at').returns<Record<string, unknown>[]>(),
        fetchServices(),
        fetchOrgSettings('risk_rules, sector'),
        fetchPackageRows(organizationId, [customerId]),
    ]);
    if (customer.error) throw customer.error;
    if (templates.error && (templates.error as { code?: string }).code !== '42P01') throw templates.error;
    if (!customer.data) return null;
    const fields = customer.data.custom_fields;
    return {
        customer: {
            id: String(customer.data.id),
            name: String(customer.data.name ?? ''),
            phone: (customer.data.phone as string | null) ?? null,
            fields: fields && typeof fields === 'object' && !Array.isArray(fields)
                ? fields as Record<string, unknown>
                : null,
        },
        templates: (templates.error ? [] : templates.data ?? []).map((row) => ({
            id: String(row.id),
            name: String(row.name ?? ''),
            sessionCount: Number(row.session_count ?? 1) || 1,
            price: Number(row.price ?? 0) || 0,
            color: (row.color as string | null) ?? null,
        })),
        services: services.filter((svc) => svc.id && svc.name).map((svc) => ({
            id: String(svc.id),
            name: svc.name,
            duration: Number(svc.duration) || 0,
            price: Number(svc.price) || 0,
            color: svc.color ?? null,
            tags: svc.tags ?? null,
        })),
        riskRules: (settings?.risk_rules as EligibilityRule[] | null) ?? [],
        sector: (settings?.sector as string | null) ?? null,
        packages,
    };
}

// ── Müşteri kartı ───────────────────────────────────────────────────────────

/** Kartın randevu penceresi — son geliş, yaklaşan ve tahsilat satırlarının adı. */
const CARD_VISIT_LIMIT = 120;

/**
 * Müdür 23 müşteri kartının ham parçaları — KİMLİKLE.
 *
 * Adla arama YOK: aynı adlı iki müşteride yanlış kişinin alerjisini ve
 * telefonunu göstermek, hiç göstermemekten kötü (personel dosyasının
 * `musteri.tsx` dersi). Kayıt yoksa `null` — ekran "bulunamadı" der ve bu
 * sefer doğrudur.
 *
 * Ziyaret SAYISI ayrı sayılıyor (`head` sayımı): pencere 120 randevu ve
 * sadık bir müşteride "7. ziyaret" yazan kart yalan söylerdi.
 */
export async function fetchCustomerCardRows(customerId: string, todayISO: string) {
    const organizationId = await orgIdOrThrow();
    const [customer, packages, visits, pastCount, payments, settings, crew, paidRows, firstVisit] = await Promise.all([
        supabase.from('customers').select('id, name, phone, notes, custom_fields, created_at')
            .eq('organization_id', organizationId).eq('id', customerId).maybeSingle()
            .returns<Record<string, unknown> | null>(),
        fetchPackageRows(organizationId, [customerId]),
        supabase.from('reservations').select('id, date, start_time, service, status, staff_id')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .order('date', { ascending: false }).order('start_time', { ascending: false })
            .limit(CARD_VISIT_LIMIT).returns<Record<string, unknown>[]>(),
        supabase.from('reservations').select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .neq('status', 'cancelled').lt('date', todayISO),
        supabase.from('payments').select('id, reservation_id, amount, paid_at, description')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .order('paid_at', { ascending: false }).limit(20)
            .returns<Record<string, unknown>[]>(),
        fetchOrgSettings('risk_rules, sector'),
        fetchCrew(),
        /*
         * TOPLAM ÖDENEN (Müdür 23 v2): yalnız tutar sütunu, pencere yok. Kart
         * satırlarının 20'lik penceresinden toplamak sadık bir müşteride
         * yanlış bir rakam yazardı.
         */
        supabase.from('payments').select('amount')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .limit(5000).returns<{ amount: number | null }[]>(),
        // İlk ziyaret — sıklığın başlangıcı; 120'lik pencereden bağımsız.
        supabase.from('reservations').select('date')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .neq('status', 'cancelled').lt('date', todayISO)
            .order('date', { ascending: true }).limit(1)
            .returns<{ date: string }[]>(),
    ]);
    for (const result of [customer, visits, pastCount, payments]) {
        if (result.error) throw result.error;
    }
    if (!customer.data) return null;
    const row = customer.data;
    const fields = row.custom_fields;
    return {
        customer: {
            id: String(row.id),
            name: String(row.name ?? ''),
            phone: (row.phone as string | null) ?? null,
            notes: (row.notes as string | null) ?? null,
            custom_fields: fields && typeof fields === 'object' && !Array.isArray(fields)
                ? fields as Record<string, unknown>
                : null,
            created_at: (row.created_at as string | null) ?? null,
        },
        riskRules: (settings?.risk_rules as {
            key?: string; label?: string; note?: string | null;
            blocks?: string[] | null; legacyNamePattern?: string | null;
        }[] | null) ?? [],
        sector: (settings?.sector as string | null) ?? null,
        // Okunamadıysa `null`: kart "TOPLAM ÖDENEN" hücresini çizmez.
        totalPaid: paidRows.error
            ? null
            : (paidRows.data ?? []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
        firstVisitISO: firstVisit.error ? null : firstVisit.data?.[0]?.date ?? null,
        packages,
        visits: (visits.data ?? []).map((visit) => ({
            id: String(visit.id),
            date: String(visit.date ?? ''),
            start_time: String(visit.start_time ?? ''),
            service: String(visit.service ?? ''),
            status: String(visit.status ?? ''),
            staff_id: (visit.staff_id as string | null) ?? null,
        })),
        pastVisitCount: pastCount.count ?? 0,
        payments: (payments.data ?? []).map((payment) => ({
            id: String(payment.id),
            reservation_id: (payment.reservation_id as string | null) ?? null,
            amount: Number(payment.amount ?? 0),
            paid_at: String(payment.paid_at ?? ''),
            description: (payment.description as string | null) ?? null,
        })),
        staff: new Map(crew.map((person) => [person.id, person.name])),
    };
}

/**
 * Müdür 23 v2 · "Tüm geçmişi aç" — müşterinin BÜTÜN ziyaretleri.
 *
 * Kartın 120'lik penceresi burada yok: liste sayfa sayfa okunuyor. İptal
 * ziyaret sayılmıyor (kartın sayımıyla aynı kural). Tutar randevuya bağlı
 * tahsilatların toplamı; bağlı tahsilat yoksa `null` — "₺0" yazılmaz.
 */
export async function fetchCustomerHistory(customerId: string, todayISO: string) {
    const organizationId = await orgIdOrThrow();
    const [visits, payments, crew] = await Promise.all([
        readAll((from, to) => supabase.from('reservations')
            .select('id, date, start_time, service, staff_id')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .neq('status', 'cancelled').lte('date', todayISO)
            .order('date', { ascending: false }).order('start_time', { ascending: false }).order('id')
            .range(from, to)
            .returns<Record<string, unknown>[]>()),
        readAll((from, to) => supabase.from('payments')
            .select('reservation_id, amount')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .not('reservation_id', 'is', null)
            .order('id')
            .range(from, to)
            .returns<Record<string, unknown>[]>()),
        fetchCrew(),
    ]);
    return {
        visits: visits.map((row) => ({
            id: String(row.id),
            date: String(row.date ?? ''),
            start_time: String(row.start_time ?? ''),
            service: String(row.service ?? ''),
            staff_id: (row.staff_id as string | null) ?? null,
        })),
        payments: payments.map((row) => ({
            reservation_id: String(row.reservation_id),
            amount: Number(row.amount ?? 0),
        })),
        staff: new Map(crew.map((person) => [person.id, person.name])),
    };
}

// ── Hesap ───────────────────────────────────────────────────────────────────

/**
 * Hesap silme ekranının SAYILARI — uydurulmuyor, sayılıyor.
 *
 * Sayımlar `head: true, count: 'exact'`: satırlar telefona inmiyor, yalnız
 * sayı. Sahip sayısı ve rol `organization_members`ten — sunucunun silme
 * kararının dayandığı tablo (`account-delete`).
 */
export async function fetchDeletionFacts() {
    const organizationId = await orgIdOrThrow();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new OrgError('no_session');
    const count = (table: string) => supabase.from(table)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
    const [members, appointments, customers, services, staff] = await Promise.all([
        supabase.from('organization_members').select('user_id, role')
            .eq('org_id', organizationId)
            .returns<{ user_id: string; role: string | null }[]>(),
        count('reservations'),
        count('customers'),
        count('services'),
        supabase.from('staff').select('name')
            .eq('organization_id', organizationId).eq('is_active', true).order('name')
            .returns<{ name: string | null }[]>(),
    ]);
    for (const result of [members, appointments, customers, services, staff]) {
        if (result.error) throw result.error;
    }
    const rows = members.data ?? [];
    return deletionFactsOf({
        role: rows.find((row) => row.user_id === userId)?.role ?? null,
        owners: rows.filter((row) => row.role === 'owner').length,
        appointments: appointments.count ?? 0,
        customers: customers.count ?? 0,
        services: services.count ?? 0,
        staff: (staff.data ?? []).map((row) => String(row.name ?? '').trim()).filter(Boolean),
    });
}

/**
 * Defterin büyüklüğü — Profil'deki "Müşteriler" satırının alt yazısı.
 *
 * `head: true, count: 'exact'`: satırlar telefona İNMİYOR, yalnız sayı.
 * Profil her açılışta okunuyor; oraya bütün defteri çekmek, bir satırlık
 * özet için yüzlerce kaydı taşımak olurdu.
 *
 * Okunamazsa HATA atılır ve çağıran satırı özetsiz bırakır; sıfır YAZILMAZ.
 * "0 kişi" diyen bir satır, okunamayan bir defteri boş defter gibi gösterir.
 */
export async function fetchCustomerCount(): Promise<number> {
    const organizationId = await orgIdOrThrow();
    const { count, error } = await supabase.from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true);
    // Hata ATILIYOR, sıfıra çevrilmiyor: "0 kişi" diyen bir satır, okunamayan
    // defteri boş defter gibi gösterirdi. Satırı özetsiz bırakma kararı
    // çağıranın (bkz. `mudur/profile.tsx`).
    if (error) throw error;
    return count ?? 0;
}

/** Salonun KVKK aydınlatma metni adresi (081). Boşsa `null` — satır çizilmez. */
export async function fetchKvkkUrl(): Promise<string | null> {
    const organizationId = await orgIdOrThrow();
    const { data, error } = await supabase.from('organizations').select('kvkk_url')
        .eq('id', organizationId).maybeSingle()
        .returns<{ kvkk_url?: string | null } | null>();
    if (error) throw error;
    const url = data?.kvkk_url?.trim() ?? '';
    return /^https?:\/\//i.test(url) ? url : null;
}

// ── Kasa ────────────────────────────────────────────────────────────────────

/**
 * PostgREST tek cevapta en çok 1000 satır veriyor ve fazlasını SESSİZCE
 * kesiyor. Ayın tahsilatları yoğun bir salonda bunu aşar; kesik bir liste
 * eksik bir ay toplamı demek ve hiçbir hata vermez. Sayfa sayfa okunuyor,
 * sayfa dolu gelmeyene kadar.
 */
const PAGE = 1000;

async function readAll(
    page: (from: number, to: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await page(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < PAGE) return out;
    }
}

/**
 * `.in()` kimlikleri adrese yazıyor; yüzlerce uuid adresi sunucunun kabul
 * etmeyeceği uzunluğa taşır. Kimlikler parça parça soruluyor.
 */
const IN_CHUNK = 120;

function chunksOf(ids: readonly string[]): string[][] {
    const unique = [...new Set(ids)].filter(Boolean);
    const out: string[][] = [];
    for (let index = 0; index < unique.length; index += IN_CHUNK) {
        out.push(unique.slice(index, index + IN_CHUNK));
    }
    return out;
}

const CASH_RES_COLS = 'id, customer_id, customer_name, customer_phone, date, start_time, end_time, '
    + 'service, status, staff_id, is_paid, group_id, custom_fields, adisyon_items, service_ended_at';

const PAY_COLS = 'id, reservation_id, customer_id, staff_id, type, description, amount, method, paid_at';

function toCashReservation(row: Record<string, unknown>): CashReservationRow {
    const fields = row.custom_fields;
    return {
        id: String(row.id),
        customer_id: (row.customer_id as string | null) ?? null,
        customer_name: String(row.customer_name ?? ''),
        customer_phone: (row.customer_phone as string | null) ?? null,
        date: String(row.date ?? ''),
        start_time: String(row.start_time ?? ''),
        end_time: String(row.end_time ?? ''),
        service: String(row.service ?? ''),
        status: String(row.status ?? ''),
        staff_id: (row.staff_id as string | null) ?? null,
        is_paid: row.is_paid === true,
        group_id: (row.group_id as string | null) ?? null,
        custom_fields: fields && typeof fields === 'object' && !Array.isArray(fields)
            ? fields as Record<string, unknown>
            : null,
        adisyon_items: row.adisyon_items ?? [],
        service_ended_at: (row.service_ended_at as string | null) ?? null,
    };
}

function toCashPayment(row: Record<string, unknown>): CashPaymentRow {
    return {
        id: String(row.id),
        reservation_id: (row.reservation_id as string | null) ?? null,
        customer_id: (row.customer_id as string | null) ?? null,
        staff_id: (row.staff_id as string | null) ?? null,
        type: String(row.type ?? 'other'),
        description: (row.description as string | null) ?? null,
        amount: Number(row.amount ?? 0),
        method: String(row.method ?? 'other'),
        paid_at: String(row.paid_at ?? ''),
    };
}

/** Randevular — kimlikleriyle, parça parça. */
async function reservationsById(organizationId: string, ids: readonly string[]): Promise<CashReservationRow[]> {
    const parts = await Promise.all(chunksOf(ids).map(async (chunk) => {
        const { data, error } = await supabase.from('reservations').select(CASH_RES_COLS)
            .eq('organization_id', organizationId).in('id', chunk)
            .returns<Record<string, unknown>[]>();
        if (error) throw error;
        return data ?? [];
    }));
    return parts.flat().map(toCashReservation);
}

/**
 * Masaüstünün bekleyen kuyruğunun penceresi: son 90 gün.
 *
 * Masaüstü aynı pencereyi okuyor ama üstüne `limit(500)` koyuyor — yoğun bir
 * salonda 500 satır iki haftaya yetmez ve daha eski açık adisyonlar kasadan
 * sessizce düşer. Telefon o kesiği TAKLİT ETMİYOR; pencerenin tamamını
 * okuyor. İki ekranın ayrıştığı tek yer bu ve kusur masaüstünde.
 */
export const OPEN_TICKET_WINDOW_DAYS = 90;

/**
 * Açık adisyonların ham malzemesi: bitmiş-ödenmemiş randevular, grup
 * arkadaşları ve bu randevulara bağlı TÜM tahsilatlar (kapora dahil).
 * Hesap `cashBuild.ticketsOf`ta.
 */
export async function fetchOpenTicketRows(
    todayISO: string,
): Promise<{ rows: CashReservationRow[]; payments: CashPaymentRow[] }> {
    const organizationId = await orgIdOrThrow();
    const since = addDaysISO(todayISO, -OPEN_TICKET_WINDOW_DAYS);
    const open = await readAll((from, to) => supabase.from('reservations').select(CASH_RES_COLS)
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .eq('is_paid', false)
        .gte('date', since)
        .order('date').order('start_time').order('id')
        .range(from, to)
        .returns<Record<string, unknown>[]>());
    const rows = open.map(toCashReservation);

    /*
     * Grup TEK adisyon: ödenmemiş bir üye, bitmemiş bir arkadaşı yüzünden
     * kasaya düşmemiş olabilir. Arkadaşlar okunmadan bu bilinemez.
     */
    const groupIds = rows.map((row) => row.group_id).filter((id): id is string => Boolean(id));
    const mates = await Promise.all(chunksOf(groupIds).map(async (chunk) => {
        const { data, error } = await supabase.from('reservations').select(CASH_RES_COLS)
            .eq('organization_id', organizationId).in('group_id', chunk)
            .returns<Record<string, unknown>[]>();
        if (error) throw error;
        return (data ?? []).map(toCashReservation);
    }));
    const all = [...rows, ...mates.flat()];

    const payments = await Promise.all(chunksOf(all.map((row) => row.id)).map(async (chunk) => {
        const { data, error } = await supabase.from('payments').select(PAY_COLS)
            .eq('organization_id', organizationId).in('reservation_id', chunk)
            .returns<Record<string, unknown>[]>();
        if (error) throw error;
        return (data ?? []).map(toCashPayment);
    }));
    return { rows: all, payments: payments.flat() };
}

/**
 * Bir dönemin tahsilatları + önceki dönemin karşılaştırma dilimi, TEK
 * sorguda; ardından hareket kartının ihtiyacı olan randevular ve müşteri
 * adları.
 *
 * Arşivlenmiş müşterinin adı DA okunuyor: tahsilat geçmişi arşivle
 * değişmiyor. Kayıt hiç yoksa kart randevudaki adı yazıyor.
 */
export async function fetchCashPayments(
    fromMs: number,
    toMs: number,
    currentFromMs: number,
): Promise<{
    payments: CashPaymentRow[];
    reservations: CashReservationRow[];
    customers: Map<string, string>;
}> {
    const organizationId = await orgIdOrThrow();
    const raw = await readAll((from, to) => supabase.from('payments').select(PAY_COLS)
        .eq('organization_id', organizationId)
        .gte('paid_at', new Date(fromMs).toISOString())
        .lte('paid_at', new Date(toMs).toISOString())
        .order('paid_at').order('id')
        .range(from, to)
        .returns<Record<string, unknown>[]>());
    const payments = raw.map(toCashPayment);
    const current = payments.filter((payment) => Date.parse(payment.paid_at) >= currentFromMs);

    const [reservations, customerParts] = await Promise.all([
        reservationsById(
            organizationId,
            current.map((payment) => payment.reservation_id).filter((id): id is string => Boolean(id)),
        ),
        Promise.all(chunksOf(
            current.map((payment) => payment.customer_id).filter((id): id is string => Boolean(id)),
        ).map(async (chunk) => {
            const { data, error } = await supabase.from('customers').select('id, name')
                .eq('organization_id', organizationId).in('id', chunk)
                .returns<Record<string, unknown>[]>();
            if (error) throw error;
            return data ?? [];
        })),
    ]);
    const customers = new Map<string, string>();
    for (const row of customerParts.flat()) {
        const name = String(row.name ?? '').trim();
        if (name) customers.set(String(row.id), name);
    }
    return { payments, reservations, customers };
}

/**
 * Günün müşterilerinin bağlam kutuları — TEK turda.
 *
 * Müşteri başına sorgu atmak on beş randevuda otuz istek demekti. Kimlikler
 * toplanıp iki sorguya indiriliyor.
 *
 * `balance` BURADA DA yok: kuralı masaüstündeki `patientBalance.ts` taşıyor ve
 * ikinci kez yazmak aynı müşteri için iki farklı rakam üretirdi.
 */
export async function fetchDayContext(
    customerIds: readonly string[],
): Promise<Map<string, ApptContext>> {
    const ids = [...new Set(customerIds)].filter(Boolean);
    const out = new Map<string, ApptContext>();
    if (ids.length === 0) return out;
    const organizationId = await orgIdOrThrow();
    const [customers, packages, settings] = await Promise.all([
        supabase.from('customers').select('id, custom_fields')
            .eq('organization_id', organizationId).in('id', ids)
            .returns<Record<string, unknown>[]>(),
        fetchPackageRows(organizationId, ids),
        fetchOrgSettings('risk_rules'),
    ]);
    if (customers.error) throw customers.error;
    const rules = (settings?.risk_rules as Parameters<typeof riskList>[0] | null) ?? [];

    for (const row of customers.data ?? []) {
        const risks = riskList(rules, row.custom_fields as Record<string, unknown> | null);
        if (risks.length === 0) continue;
        out.set(String(row.id), { note: risks.map((line) => line.text).join(' · ') });
    }
    for (const row of packages) {
        const total = row.total_sessions;
        const used = row.used_sessions;
        // HAKKI KALAN paket gösteriliyor; tükenmiş olan bir bilgi taşımıyor.
        if (used >= total || !row.customer_id) continue;
        const id = row.customer_id;
        const current = out.get(id) ?? {};
        if (current.package) continue;
        out.set(id, { ...current, package: `${row.name} · ${used}/${total}` });
    }
    return out;
}

/**
 * Salonun O GÜN kaç dakika açık olduğu — doluluk oranının paydası.
 *
 * ── GÜN NUMARASI TUZAĞI ─────────────────────────────────────────────────────
 * Veritabanındaki `working_hours[].day` JS'in `getDay()` düzenini kullanıyor:
 * 0 = PAZAR. Mobildeki `DaySchedule` ise 0 = PAZARTESİ. Burada OKUMA yapıldığı
 * için dönüşüm gerekmiyor — `getUTCDay()` doğrudan veritabanının düzenini
 * veriyor. Dönüşüm YAZARKEN gerekecek ve orası bu planın en riskli adımı.
 *
 * Saat okunamazsa `null` dönüyor ve doluluk HİÇ hesaplanmıyor: uydurma bir
 * payda, uydurma bir yüzde demektir.
 */
export async function fetchOpenMinutes(dateISO: string): Promise<number | null> {
    const settings = await fetchOrgSettings('working_hours');
    const hours = settings?.working_hours;
    if (!Array.isArray(hours)) return null;
    const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
    const entry = (hours as Record<string, unknown>[])
        .find((row) => Number(row?.day) === weekday);
    if (!entry || entry.isOff === true) return null;
    const open = clockMinutes(String(entry.start ?? ''));
    const close = clockMinutes(String(entry.end ?? ''));
    if (open === null || close === null || close <= open) return null;
    return close - open;
}

/** "09:00" → 540. Çözülemeyen değer sıfır ÜRETMİYOR. */
function clockMinutes(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

export const apiSource: CalendarSource = {
    async day(date) {
        const organizationId = await orgIdOrThrow();
        const { data, error } = await supabase
            .from('reservations')
            .select(RES_COLS)
            .eq('organization_id', organizationId)
            .eq('date', date)
            .order('start_time')
            // Sütun listesi çalışma anında birleştiriliyor; Supabase'in tip
            // çözümleyicisi onu okuyamıyor ve satırı hata tipi sanıyor.
            // Şekil `RES_COLS` ile `toAppt` arasında sözleşmeli.
            .returns<Record<string, unknown>[]>();
        // Hata YUTULMUYOR: sessizce boş dizi dönmek, dolu bir günü boş gün
        // diye çizdirirdi. Çağıran ekran yakalayıp eldeki listeyi koruyor.
        if (error) throw error;
        return (data ?? []).map(toAppt);
    },

    async range(from, to) {
        const organizationId = await orgIdOrThrow();
        const { data, error } = await supabase
            .from('reservations')
            .select('date, status')
            .eq('organization_id', organizationId)
            .gte('date', from)
            .lte('date', to);
        if (error) throw error;
        const rows = (data ?? []).map((row) => ({
            date: String((row as { date: unknown }).date),
            status: String((row as { status: unknown }).status),
        }));
        return fillRange(countsOf(rows), daysIn(from, to));
    },

    async nextAfter(date) {
        const organizationId = await orgIdOrThrow();
        const { data, error } = await supabase
            .from('reservations')
            .select(RES_COLS)
            .eq('organization_id', organizationId)
            .gt('date', date)
            // İptal edilmiş randevu "sıradaki" olamaz: kimse gelmeyecek.
            .neq('status', 'cancelled')
            .order('date')
            .order('start_time')
            .limit(1)
            .returns<Record<string, unknown>[]>();
        if (error) throw error;
        const row = (data ?? [])[0];
        return row ? toAppt(row) : null;
    },
};
