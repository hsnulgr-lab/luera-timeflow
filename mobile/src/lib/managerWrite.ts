/**
 * Müdürün YAZMA yolu.
 *
 * Kurallar `managerWriteMap.ts`te; burada yalnız sorgu kuruluyor.
 *
 * ── Üç koruma, üçü de sunucuda ──────────────────────────────────────────────
 * 1) RLS — org süzgeci (`A1`); yanlış salonun satırına yazılamaz.
 * 2) İYİMSER KİLİT (092) — `.eq('updated_at', okunan)`. Kart açıldıktan sonra
 *    başka bir cihaz değiştirdiyse UPDATE sıfır satır günceller ve ekran ezmek
 *    yerine farkı gösterir.
 * 3) ÇAKIŞMA (060) — aynı personelin randevuları üst üste binemez. Ekrandaki
 *    uygunluk kontrolü hızlı geri bildirim; SON SÖZ tetikleyicinin.
 */

import { supabase } from './supabase';
import { waResultOf, type WaResult } from './actionPill.ts';
import { outcomeOf, type WriteOutcome } from './managerWriteMap.ts';
import { forgetOrg, OrgError } from './managerSource';
import { resolveOrg } from './managerSource';
import type { Appt } from './calendar.ts';
import {
    createOutcomeOf, insertRowOf, PAST_LINE, phoneVariants, storedPhone, tooEarly, webhookBody,
    type CreateOutcome, type NewAppointment, type WaFailReason,
} from './createLive.ts';
import { RES_COLS, toAppt } from './managerMap.ts';
import type { CatalogService } from './cashBuild.ts';
import type { DaySchedule, SalonService } from './managerProfile.ts';
import { fetchServices, type HoursRow } from './managerSource';
import {
    servicePatchOf, workingHoursOf, type SettingsOutcome,
} from './settingsMap.ts';

/** Vana kapalıysa hiç yazma denenmiyor. */
async function writesPaused(): Promise<boolean> {
    const { data, error } = await supabase
        .from('app_flags').select('value').eq('key', 'MANAGER_WRITES_ENABLED').maybeSingle()
        .returns<{ value?: string } | null>();
    /*
     * Bayrak OKUNAMAZSA yazma DURMUYOR.
     *
     * Ters kurgu ("okunamadıysa kapat") daha güvenli görünür ama bir ağ
     * boşluğu bütün salonu durdururdu. Vananın işi olağan durumu değiştirmek
     * değil, olağandışı durumda müdahale edebilmek — 093'teki gerekçenin
     * aynısı.
     */
    if (error) return false;
    return data?.value === 'off';
}

async function orgId(): Promise<string> {
    const choice = await resolveOrg();
    if (!choice.ok) throw new OrgError(choice.reason);
    return choice.id;
}

/**
 * Randevunun alanlarını günceller.
 *
 * `expectedUpdatedAt` ZORUNLU ve `null` kabul edilmiyor: damgası okunmamış bir
 * randevuya yazmak, kilidi baştan devre dışı bırakmak olurdu.
 */
export async function updateAppointment(
    id: string,
    expectedUpdatedAt: string,
    patch: Record<string, unknown>,
    staffName?: string | null,
): Promise<WriteOutcome> {
    if (await writesPaused()) return { ok: false, kind: 'paused' };
    try {
        const organizationId = await orgId();
        const { data, error } = await supabase
            .from('reservations')
            .update(patch)
            .eq('id', id)
            .eq('organization_id', organizationId)
            .eq('updated_at', expectedUpdatedAt)
            // Yeni damga GERİ İSTENİYOR: sonraki yazma onu kullanacak. Yoksa
            // ikinci değişiklik kendi ilk yazmasına takılırdı.
            .select('updated_at')
            .returns<{ updated_at?: string }[]>();
        const outcome = outcomeOf(error, staffName, data?.length ?? 0);
        if (outcome.ok) {
            return { ok: true, updatedAt: data?.[0]?.updated_at ?? null };
        }
        return outcome;
    } catch (cause) {
        // Org reddi yazma hatası DEĞİL: kimliği unut, çağıran ekran kendi
        // durum bloğunu çizsin.
        if (cause instanceof OrgError) { forgetOrg(); throw cause; }
        return { ok: false, kind: 'failed' };
    }
}

/**
 * Randevuyu SİLER — masaüstünün `deleteReservation`'ıyla aynı işlem.
 *
 * Kartın "Sil" satırı bugüne kadar yalnız kartı KAPATIYORDU: müdür sildiğini
 * sanıyor, randevu duruyordu. İptal (`status: 'cancelled'`) ile silme ayrı iki
 * şey ve kart ikisini ayrı satırda soruyor; birini ötekine çevirmek de doğru
 * olmazdı — iptal edilmiş randevu kayıtta kalır, silinen kalmaz.
 *
 * Masaüstünde olmayan iki koruma burada var: org süzgeci ve iyimser kilit.
 * Kilit, açık duran bir kartın arka planda değişmiş bir randevuyu silmesini
 * engelliyor — silme geri alınamaz olduğu için en çok burada gerekli.
 */
export async function deleteAppointment(
    id: string,
    expectedUpdatedAt: string,
): Promise<WriteOutcome> {
    if (await writesPaused()) return { ok: false, kind: 'paused' };
    try {
        const organizationId = await orgId();
        const { data, error } = await supabase
            .from('reservations')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId)
            .eq('updated_at', expectedUpdatedAt)
            // Silinen satır GERİ İSTENİYOR: "hata yok ama satır da yok" hâli
            // kilidin tutmadığı anlamına geliyor ve `outcomeOf` onu bayat
            // sayıyor. İstenmezse silinmemiş bir randevu silinmiş görünürdü.
            .select('id')
            .returns<{ id: string }[]>();
        return outcomeOf(error, null, data?.length ?? 0);
    } catch (cause) {
        if (cause instanceof OrgError) { forgetOrg(); throw cause; }
        return { ok: false, kind: 'failed' };
    }
}

// ── Randevu oluştur ─────────────────────────────────────────────────────────

/** Kurulan randevu — takvimin ve onay ekranının okuduğu şekil. */
export type CreatedAppointment = Appt & { updated_at: string | null };

/**
 * Numarası verilmiş müşterinin KİMLİĞİ — masaüstünün `resolveCustomerId`i.
 *
 *   1. Aynı numara (her yazımıyla) aranır; aktif kayıt önce, en eskisi.
 *   2. Arşivdeyse geri açılır — yoksa ekranda görünmeyen bir kişiye randevu
 *      bağlanırdı.
 *   3. Yoksa açılır. Aynı anda başka bir cihaz aynı numarayı açtıysa
 *      tekillik (072) reddeder; o zaman o kayıt yeniden aranıp kullanılır.
 */
async function resolveCustomer(
    organizationId: string,
    userId: string,
    name: string,
    phone: string,
): Promise<string> {
    const lookup = async () => {
        const { data, error } = await supabase.from('customers').select('id, is_active')
            .eq('organization_id', organizationId)
            .in('phone', phoneVariants(phone))
            .order('is_active', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .returns<{ id: string; is_active: boolean | null }[]>();
        if (error) throw error;
        return data?.[0] ?? null;
    };

    const existing = await lookup();
    if (existing) {
        if (existing.is_active === false) {
            const { error } = await supabase.from('customers')
                .update({ is_active: true, updated_at: new Date().toISOString() })
                .eq('id', existing.id).eq('organization_id', organizationId);
            if (error) throw error;
        }
        return existing.id;
    }

    const { data, error } = await supabase.from('customers')
        .insert({
            user_id: userId,
            organization_id: organizationId,
            name: name.trim(),
            phone: storedPhone(phone),
            email: null,
            notes: '',
        })
        .select('id')
        .single()
        .returns<{ id: string }>();
    if (!error && data) return data.id;
    if (error?.code === UNIQUE_VIOLATION) {
        const raced = await lookup();
        if (raced) return raced.id;
    }
    throw error ?? new Error('customer_insert_empty');
}

/** Postgres: tekillik ihlali. */
const UNIQUE_VIOLATION = '23505';

/**
 * Yeni randevu.
 *
 * Ekrandaki uygunluk rayı HIZLI geri bildirim; son söz sunucunun. 060 ya da
 * 076 reddederse kayıt oluşmaz ve sonuç müdüre NE YAPACAĞINI söyler.
 *
 * Müşteri kaydı randevudan ÖNCE açılıyor (masaüstü de öyle): randevu çakışmaya
 * takılırsa kayıt kalır — aynı kişi bir sonraki denemede yeniden kullanılır,
 * ikinci kayıt açılmaz.
 */
export async function createAppointment(
    input: NewAppointment,
    staffName: string | null,
    context: { nowMs: number; toleranceMin: number },
): Promise<{ outcome: CreateOutcome; row: CreatedAppointment | null }> {
    if (tooEarly(input.dateISO, input.startMinutes, context.nowMs, context.toleranceMin)) {
        return { outcome: { ok: false, kind: 'past', message: PAST_LINE }, row: null };
    }
    if (await writesPaused()) return { outcome: { ok: false, kind: 'paused' }, row: null };
    try {
        const organizationId = await orgId();
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new OrgError('no_session');

        const digits = storedPhone(input.customerPhone).replace(/\D/g, '');
        const customerId = input.customerId
            ?? (digits.length >= 10
                ? await resolveCustomer(organizationId, userId, input.customerName, input.customerPhone ?? '')
                : null);

        const { data, error } = await supabase.from('reservations')
            .insert(insertRowOf({ ...input, customerId }, { userId, organizationId }))
            .select(`${RES_COLS}, updated_at`)
            .single()
            .returns<Record<string, unknown>>();
        const outcome = createOutcomeOf(error, staffName);
        if (!outcome.ok || !data) return { outcome: outcome.ok ? { ok: false, kind: 'failed' } : outcome, row: null };
        return { outcome, row: { ...toAppt(data), updated_at: (data.updated_at as string | null) ?? null } };
    } catch (cause) {
        if (cause instanceof OrgError) { forgetOrg(); throw cause; }
        return { outcome: { ok: false, kind: 'failed' }, row: null };
    }
}

/**
 * Müşteriye randevu onayı — masaüstüyle AYNI yol ve aynı tür (`confirmation`).
 *
 * Proxy salonun "randevu onayı" anahtarına bakıyor; kapalıysa göndermiyor.
 * Gönderim otomatik DEĞİL (kullanıcı kararı): müdür onay ekranında metni görüp
 * düğmeye basıyor.
 */
export async function sendConfirmation(input: {
    phone: string; text: string; customerId: string | null;
}): Promise<{ ok: true } | { ok: false; reason: WaFailReason | null }> {
    try {
        const choice = await resolveOrg();
        const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
            body: {
                action: 'send',
                phone: input.phone,
                text: input.text,
                kind: 'confirmation',
                customerId: input.customerId,
                // Çok üyeli hesapta sunucu salonu tahmin etmesin.
                orgId: choice.ok ? choice.id : undefined,
            },
        });
        if (error) return { ok: false, reason: null };
        const body = (data ?? {}) as { ok?: boolean; reason?: WaFailReason; error?: string };
        if (body.ok === true) return { ok: true };
        return { ok: false, reason: body.reason ?? null };
    } catch {
        return { ok: false, reason: null };
    }
}

/**
 * Akıştaki "Yaz" — Müdür 34 · v2.
 *
 * Mesaj SALONUN numarasından, sunucunun tek gönderim kapısından gidiyor
 * (`whatsapp-proxy` → `sendWA`). Eskiden müdürün kendi WhatsApp'ı metinsiz
 * açılıyordu: müdür uygulamadan çıkıyor, mesajı elle yazıyor, kart sonucu
 * hiç bilmiyordu.
 *
 * `kind: 'manual'` — müdürün elle tetiklediği mesaj; kota dışı
 * (`_shared/wa.ts · UNMETERED`), onay anahtarına da bağlı değil.
 *
 * Sonuç HİÇBİR ZAMAN fırlatılmıyor: kart her hâlde bir satır yazabilmeli.
 */
export async function sendWaNudge(input: {
    phone: string; text: string; customerId: string | null;
}): Promise<WaResult> {
    try {
        const choice = await resolveOrg();
        const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
            body: {
                action: 'send',
                phone: input.phone,
                text: input.text,
                kind: 'manual',
                customerId: input.customerId,
                orgId: choice.ok ? choice.id : undefined,
            },
        });
        if (error) return 'failed';
        return waResultOf(data as { ok?: boolean; reason?: string; queued?: boolean } | null);
    } catch {
        return 'failed';
    }
}

/**
 * Salonun dış otomasyon adresine "randevu kuruldu" — masaüstünün
 * `fireWebhook`i: 8 saniyelik zaman aşımı, sonucu BEKLENMEZ, hatası randevuyu
 * bozmaz. Adres yoksa hiç çağrılmıyor.
 */
export function fireCreatedWebhook(url: string | null, row: CreatedAppointment, staffName: string | null): void {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: webhookBody({
            id: row.id,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone ?? '',
            date: row.date,
            start_time: row.start_time,
            end_time: row.end_time,
            service: row.service,
            status: row.status,
            notes: row.notes,
            staff_id: row.staff_id ?? null,
        }, staffName, new Date().toISOString()),
        signal: controller.signal,
    })
        .catch(() => undefined)
        .finally(() => clearTimeout(timer));
}

// ── Ayarlar ─────────────────────────────────────────────────────────────────

/**
 * Çalışma saatleri — okunan SATIRA, kilitli.
 *
 * `updated_at` eşleşmezse 0 satır güncellenir ve bu bir hata DEĞİLDİR;
 * `stale` dönüyor, ekran güncel saatleri okuyup gösteriyor. Masaüstünün
 * ayar sayfası satırı bütünüyle ezdiği için telefonun kilitsiz yazması,
 * masaüstünde az önce değiştirilmiş başka bir ayarı geri almaya açıktı —
 * `working_hours` dışında hiçbir kolona dokunulmuyor.
 */
export async function saveWorkingHours(
    schedules: readonly DaySchedule[],
    row: HoursRow,
): Promise<SettingsOutcome<HoursRow>> {
    if (await writesPaused()) return { ok: false, kind: 'paused' };
    try {
        const organizationId = await orgId();
        const next = workingHoursOf(schedules, row.raw);
        const stampedAt = new Date().toISOString();
        let query = supabase.from('settings')
            .update({ working_hours: next, updated_at: stampedAt })
            .eq('organization_id', organizationId)
            .eq('user_id', row.userId);
        query = row.stamp === null ? query.is('updated_at', null) : query.eq('updated_at', row.stamp);
        const { data, error } = await query
            .select('user_id, working_hours, updated_at')
            .returns<Record<string, unknown>[]>();
        if (error) return { ok: false, kind: 'failed' };
        const saved = data?.[0];
        if (!saved) return { ok: false, kind: 'stale' };
        return {
            ok: true,
            value: {
                raw: saved.working_hours ?? next,
                userId: String(saved.user_id ?? row.userId),
                stamp: (saved.updated_at as string | null) ?? stampedAt,
            },
        };
    } catch (cause) {
        if (cause instanceof OrgError) { forgetOrg(); throw cause; }
        return { ok: false, kind: 'failed' };
    }
}

/**
 * Hizmet ekle ya da güncelle — `services` tablosu.
 *
 * Yalnız müdürün değiştirdiği dört alan yazılıyor (`servicePatchOf`);
 * uygunluk etiketleri ve dönüş periyodu masaüstünde kaldığı gibi kalıyor.
 * Başarıda katalog yeniden okunuyor: ekran KENDİ tahminini değil, satırın
 * gerçek hâlini gösteriyor.
 */
export async function saveSalonService(
    service: SalonService,
    isNew: boolean,
): Promise<SettingsOutcome<CatalogService[]>> {
    if (await writesPaused()) return { ok: false, kind: 'paused' };
    try {
        const organizationId = await orgId();
        const patch = servicePatchOf(service);
        if (isNew) {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            if (!userId) throw new OrgError('no_session');
            const { error } = await supabase.from('services')
                .insert({ ...patch, user_id: userId, organization_id: organizationId });
            if (error) return { ok: false, kind: 'failed' };
        } else {
            const { data, error } = await supabase.from('services')
                .update(patch)
                .eq('id', service.id)
                .eq('organization_id', organizationId)
                .select('id')
                .returns<{ id: string }[]>();
            if (error) return { ok: false, kind: 'failed' };
            // Satır yok: başka bir cihaz az önce sildi.
            if (!data || data.length === 0) return { ok: false, kind: 'stale' };
        }
        return { ok: true, value: await fetchServices() };
    } catch (cause) {
        if (cause instanceof OrgError) { forgetOrg(); throw cause; }
        return { ok: false, kind: 'failed' };
    }
}

/**
 * Hizmeti sil. Randevular hizmeti ADIYLA taşıyor; geçmiş randevular etkilenmez
 * (masaüstü de satırı silerek kaldırıyor). Bekleme listesindeki bağ 020'nin
 * `on delete set null`u ile düşer.
 */
export async function deleteSalonService(id: string): Promise<SettingsOutcome<CatalogService[]>> {
    if (await writesPaused()) return { ok: false, kind: 'paused' };
    try {
        const organizationId = await orgId();
        const { error } = await supabase.from('services')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) return { ok: false, kind: 'failed' };
        return { ok: true, value: await fetchServices() };
    } catch (cause) {
        if (cause instanceof OrgError) { forgetOrg(); throw cause; }
        return { ok: false, kind: 'failed' };
    }
}
