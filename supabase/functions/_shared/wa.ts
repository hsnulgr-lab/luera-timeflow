// Evolution API'ye giden TEK kapı.
//
// Kural: hiçbir yerde doğrudan `message/sendText` fetch'i olmaz — her gönderim
// buradan geçer. Böylece normalizasyon, opt-out, kota ve log tek yerde durur ve
// yeni bir gönderim noktası eklendiğinde bunları unutmak imkânsız olur.
//
// Bağlantı bilgisi org_whatsapp tablosunda (070), org başına tek satır.
// Eskiden settings.whatsapp_instance'taydı; settings kullanıcı başına tek satır
// olduğu için 3 üyeli org'da instance → org çözümü belirsizdi.

import { normalizePhone } from './phone.ts';
import { pickCustomer } from './booking/identity.ts';
import { answerDecision, answerMode, hadPriorChat, isTestNumber, messageRecords } from './agent/audience.ts';

// deno-lint-ignore no-explicit-any
export type Admin = any; // service_role SupabaseClient

export type WaKind =
    | 'confirmation' | 'review' | 'reminder_24h' | 'reminder_2h' | 'recall' | 'winback' | 'renewal'
    | 'queue_join' | 'queue_ready' | 'rebook' | 'waitlist'
    | 'ai_draft' | 'manual' | 'booking' | 'inbound' | 'optout' | 'cooldown'
    // Zamanlayıcı (131): dürtme ve memnuniyet sorusu işletmenin başlattığı
    // mesajdır (kotaya girer); memnuniyet cevabına teşekkür konuşmanın parçası.
    | 'nudge' | 'satisfaction' | 'feedback'
    // İşletmenin panelden iptali (2026-11-08): işlemin karşılığı, kota dışı.
    | 'cancellation';

export type SendReason =
    | 'not_connected' | 'opt_out' | 'quota' | 'invalid_phone' | 'failed';

export interface OrgWa {
    organization_id: string;
    instance: string | null;
    status: 'disconnected' | 'connecting' | 'connected';
    webhook_secret: string;
    features: Record<string, boolean>;
    /** Zamanlayıcı ayarları (131); yalnız gerektiğinde okunur. */
    schedule_config?: Record<string, unknown>;
    /** Asistan ayarları (130/139); yalnız gerektiğinde okunur. */
    agent_config?: Record<string, unknown> | null;
}

// Promosyon niteliğindeki mesajlar — kişi başına günde 1 taneden fazlası gitmez.
const PROMO: ReadonlySet<string> = new Set(['winback', 'renewal', 'recall']);
// Kota dışı tutulanlar: kullanıcının elle tetiklediği, konuşmanın parçası olan
// ya da işlemin karşılığı olanlar. Randevu onayı da buradadır — müşteri az önce
// randevu aldı, kota yüzünden "kaydınız oluşturuldu" mesajı yutulmamalı.
const UNMETERED: ReadonlySet<string> = new Set(['booking', 'inbound', 'optout', 'manual', 'confirmation', 'cooldown', 'feedback', 'cancellation']);

const PER_PHONE_DAILY = 4;   // kişi başına 24 saatte toplam giden mesaj
const PER_ORG_HOURLY  = 120; // org başına saatte giden mesaj

// ── Sırlar ──────────────────────────────────────────────────────────────────
// Önce env, yoksa app_secrets (011). Bu helper 10 dosyada kopyalanmıştı.
export async function getSecret(admin: Admin, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await admin.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}

// ── Instance ────────────────────────────────────────────────────────────────
/** Instance adı org id'den TÜRETİLİR — iki tenant aynı ada çakışamaz. */
export function instanceFor(orgId: string): string {
    return `tf_${String(orgId).replace(/-/g, '')}`;
}

export async function getOrgWa(admin: Admin, orgId: string): Promise<OrgWa | null> {
    const { data } = await admin
        .from('org_whatsapp')
        .select('organization_id, instance, status, webhook_secret, features')
        .eq('organization_id', orgId)
        .maybeSingle();
    return data ?? null;
}

/** Bağlı org'ları döner — remind gibi toplu işler bunun üzerinde döner. */
/**
 * Hattı OLAN org'lar — yalnız bağlı olanlar DEĞİL.
 *
 * Eskiden burada `.eq('status', 'connected')` vardı ve bu kendi kendini
 * sürdüren bir tuzak kuruyordu:
 *
 *   1. Eşleştirme başlatılınca `whatsapp-proxy` durumu 'connecting' yazıyor.
 *   2. QR okutulmazsa durum orada kalıyor.
 *   3. 'connecting' bu süzgece takılmadığı için `remind` o org'a HİÇ uğramıyor.
 *   4. Uğramadığı için `verifyConnection` çalışmıyor — oysa durumu düzeltecek
 *      olan tek şey o.
 *   5. Durum sonsuza kadar 'connecting' kalıyor.
 *
 * 2026-09-25'te canlıda yakalandı: bir salon 7 HAFTA boyunca "bağlanıyor"
 * gösterdi, Evolution ise aynı süre boyunca `state: close` diyordu. Ekran
 * olmayan bir durumu gösterdi ve kimse müdahale etmedi — "bağlanıyor" umut
 * veren bir kelime.
 *
 * Genişletmek GÖNDERİM AÇMAZ: `remind` her org için önce `verifyConnection`
 * çağırıyor; hat `open` değilse `markDisconnected` yazılıp org atlanıyor.
 * Yani buradan geçen ölü hat mesaj almaz, yalnız GERÇEĞİ kaydedilir.
 */
export async function linkedOrgs(admin: Admin): Promise<OrgWa[]> {
    const { data } = await admin
        .from('org_whatsapp')
        .select('organization_id, instance, status, webhook_secret, features')
        .not('instance', 'is', null)
        .in('status', ['connected', 'connecting']);
    return data ?? [];
}

export function featureOn(org: OrgWa | null, name: string, fallback = true): boolean {
    const v = org?.features?.[name];
    return typeof v === 'boolean' ? v : fallback;
}

// ── Log ─────────────────────────────────────────────────────────────────────
export async function logMessage(admin: Admin, row: {
    orgId: string;
    direction: 'out' | 'in';
    phone: string;
    kind: WaKind;
    status: 'sent' | 'failed' | 'skipped' | 'queued';
    body?: string;
    customerId?: string | null;
    error?: string | null;
    providerMsgId?: string | null;
    attempts?: number;
    nextAttemptAt?: string | null;
}): Promise<void> {
    await admin.from('wa_message_log').insert({
        organization_id: row.orgId,
        direction: row.direction,
        phone: row.phone,
        customer_id: row.customerId ?? null,
        kind: row.kind,
        body: row.body ?? null,
        status: row.status,
        error: row.error ?? null,
        provider_msg_id: row.providerMsgId ?? null,
        ...(row.attempts !== undefined ? { attempts: row.attempts } : {}),
        ...(row.nextAttemptAt !== undefined ? { next_attempt_at: row.nextAttemptAt } : {}),
        ...(row.attempts ? { last_attempt_at: new Date().toISOString() } : {}),
    }).then(() => {}, () => {}); // log yazamamak gönderimi engellememeli
}

// ── Kuyruk ──────────────────────────────────────────────────────────────────
// Geçici hatada mesaj kaybolmasın diye wa_message_log'un 'queued' satırları bir
// giden kuyruğu olarak kullanılır (bkz. supabase/079_wa_outbox.sql).
//
// Gecikmeler artan: 5 dk → 30 dk → 2 saat. remind cron'u 30 dakikada bir
// çalıştığı için pratikte ilk deneme bir sonraki turda olur; üç denemeden sonra
// pes edilir. Randevu hatırlatması saatler sonra gitmemeli — geç hatırlatma
// hatırlatma değildir, o yüzden tavan bilinçli olarak alçak.
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 120 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export function nextAttemptAt(attempts: number): string | null {
    const delay = RETRY_DELAYS_MS[attempts - 1];
    return delay === undefined ? null : new Date(Date.now() + delay).toISOString();
}

/** Hata geçici mi? Yalnız bunlar yeniden denenir. */
export function isTransient(error: string | null): boolean {
    if (!error) return false;
    if (/^http_(429|5\d\d)$/.test(error)) return true;
    // Ağ/DNS/timeout hataları http_ öneki almaz; fetch'in fırlattığı metindir.
    return !error.startsWith('http_')
        && error !== 'evolution_not_configured'
        && error !== 'invalid_phone'
        && error !== 'not_connected'
        && !error.startsWith('quota:')
        && error !== 'opt_out';
}

// ── Kota ────────────────────────────────────────────────────────────────────
/**
 * Müşteriyi mesaj yağmuruna tutmamak için. Bugün recall + winback + renewal aynı
 * güne denk gelebiliyor ve hiçbir tavan yok.
 */
export async function canSend(
    admin: Admin, orgId: string, phone: string, kind: WaKind,
): Promise<{ ok: true } | { ok: false; reason: 'quota'; detail: string }> {
    if (UNMETERED.has(kind)) return { ok: true };

    const dayAgo  = new Date(Date.now() - 24 * 3600_000).toISOString();
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();

    if (PROMO.has(kind)) {
        const { count } = await admin
            .from('wa_message_log')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId).eq('phone', phone)
            .eq('direction', 'out').eq('status', 'sent')
            .in('kind', [...PROMO])
            .gte('created_at', dayAgo);
        if ((count ?? 0) >= 1) return { ok: false, reason: 'quota', detail: 'promo_daily' };
    }

    // Kota yalnız İŞLETMENİN başlattığı mesajları sayar. Müşteri bota yazdığında
    // dönen cevaplar (kind:'booking') sayılırsa, sohbet eden bir müşteri kendi
    // randevu hatırlatmasını engelliyordu — canlıda tam olarak bu oldu.
    const { count: perPhone } = await admin
        .from('wa_message_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('phone', phone)
        .eq('direction', 'out').eq('status', 'sent')
        .not('kind', 'in', `(${[...UNMETERED].join(',')})`)
        .gte('created_at', dayAgo);
    if ((perPhone ?? 0) >= PER_PHONE_DAILY) return { ok: false, reason: 'quota', detail: 'phone_daily' };

    const { count: perOrg } = await admin
        .from('wa_message_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('direction', 'out').eq('status', 'sent')
        .not('kind', 'in', `(${[...UNMETERED].join(',')})`)
        .gte('created_at', hourAgo);
    if ((perOrg ?? 0) >= PER_ORG_HOURLY) return { ok: false, reason: 'quota', detail: 'org_hourly' };

    return { ok: true };
}

// ── Gönderim ────────────────────────────────────────────────────────────────
export interface SendResult {
    ok: boolean;
    reason?: SendReason;
    phone?: string;
    /**
     * Gönderilemedi ama kuyruğa alındı — teslimat sorumluluğu artık outbox'ta.
     * Çağıran "gönderildi" saymamalı ama "yeniden denenecek" olarak da
     * İŞARETLEMELİ: aksi halde bir sonraki cron turu aynı mesajı sıfırdan
     * kuyruğa ekler ve müşteri iki hatırlatma alır.
     */
    queued?: boolean;
}

/**
 * Tek gönderim yolu: normalize → opt-out → kota → Evolution → log.
 * Bağlantı düşmüşse org_whatsapp.status'u 'disconnected' yapar; uygulama bunu
 * okuyup kullanıcıyı uyarır (bugün sessiz bir arıza).
 */
export async function sendWA(admin: Admin, opts: {
    org: OrgWa;
    phone: string;
    text: string;
    kind: WaKind;
    customerId?: string | null;
    /** Opt-out kontrolünü atla — yalnız opt-out onay mesajı için. */
    ignoreOptOut?: boolean;
}): Promise<SendResult> {
    const { org, text, kind } = opts;
    const orgId = org.organization_id;

    const phone = normalizePhone(opts.phone);
    if (!phone) {
        await logMessage(admin, {
            orgId, direction: 'out', phone: String(opts.phone || '—'), kind,
            status: 'skipped', error: 'invalid_phone', customerId: opts.customerId, body: text,
        });
        return { ok: false, reason: 'invalid_phone' };
    }

    if (!org.instance || org.status !== 'connected') {
        await logMessage(admin, {
            orgId, direction: 'out', phone, kind,
            status: 'skipped', error: 'not_connected', customerId: opts.customerId, body: text,
        });
        return { ok: false, reason: 'not_connected', phone };
    }

    if (!opts.ignoreOptOut) {
        if (await isOptedOut(admin, orgId, phone, opts.customerId)) {
            await logMessage(admin, {
                orgId, direction: 'out', phone, kind,
                status: 'skipped', error: 'opt_out', customerId: opts.customerId, body: text,
            });
            return { ok: false, reason: 'opt_out', phone };
        }
    }

    const quota = await canSend(admin, orgId, phone, kind);
    if (!quota.ok) {
        await logMessage(admin, {
            orgId, direction: 'out', phone, kind,
            status: 'skipped', error: `quota:${quota.detail}`, customerId: opts.customerId, body: text,
        });
        return { ok: false, reason: 'quota', phone };
    }

    const url = await getSecret(admin, 'EVOLUTION_API_URL');
    const key = await getSecret(admin, 'EVOLUTION_API_KEY');
    if (!url || !key) {
        await logMessage(admin, {
            orgId, direction: 'out', phone, kind,
            status: 'failed', error: 'evolution_not_configured', customerId: opts.customerId, body: text,
        });
        return { ok: false, reason: 'failed', phone };
    }

    const { ok, providerMsgId, errText } = await deliver(admin, {
        url, key, instance: org.instance, orgId, phone, text,
    });

    // Geçici hata: mesajı kuyruğa al, remind cron'u tekrar denesin (079).
    // Kalıcı hata kuyruğa girmez — aynı sonucu verir, üstelik opt-out'a ya da
    // geçersiz numaraya ısrar etmek yanlış olur.
    const queue = !ok && isTransient(errText);
    await logMessage(admin, {
        orgId, direction: 'out', phone, kind, body: text,
        status: ok ? 'sent' : queue ? 'queued' : 'failed',
        error: errText,
        customerId: opts.customerId, providerMsgId,
        attempts: 1,
        nextAttemptAt: queue ? nextAttemptAt(1) : null,
    });

    if (ok) return { ok: true, phone };
    return { ok: false, reason: 'failed', phone, ...(queue ? { queued: true } : {}) };
}

/**
 * Gizli kimliğin (…@lid) numarası, Evolution'ın numara ön belleğinden. Evolution
 * numarasıyla yazıştığı kişinin gizli kimliğini de saklıyor; bilmiyorsa kimliği
 * aynen döndürür → null. Ağ ya da yetki hatasında da null: mesaj düşmez, yalnız
 * çözülemez.
 */
export async function lidToPhone(admin: Admin, org: OrgWa, lid: string): Promise<string | null> {
    if (!org.instance) return null;
    const url = await getSecret(admin, 'EVOLUTION_API_URL');
    const key = await getSecret(admin, 'EVOLUTION_API_KEY');
    if (!url || !key) return null;
    try {
        const res = await fetch(`${url}/chat/whatsappNumbers/${org.instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key },
            body: JSON.stringify({ numbers: [`${lid}@lid`] }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const rows = await res.json().catch(() => null);
        const jid = Array.isArray(rows) ? String(rows[0]?.jid ?? '') : '';
        return jid.endsWith('@s.whatsapp.net') ? normalizePhone(jid.split('@')[0].split(':')[0]) : null;
    } catch {
        return null;
    }
}

/**
 * Ham gönderim — log YAZMAZ. Hem ilk deneme hem kuyruk boşaltma buradan geçer;
 * tek fark, kuyruk yeni satır açmak yerine mevcut satırı güncellemesidir.
 * İstek içinde iki deneme yapılır (anlık bir sarsıntı bir sonraki cron turunu
 * beklemesin); ısrarlı hata kuyruğa devredilir.
 */
async function deliver(admin: Admin, o: {
    url: string; key: string; instance: string; orgId: string; phone: string; text: string;
}): Promise<{ ok: boolean; providerMsgId: string | null; errText: string | null }> {
    let providerMsgId: string | null = null;
    let errText: string | null = null;
    let ok = false;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(`${o.url}/message/sendText/${o.instance}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': o.key },
                body: JSON.stringify({ number: o.phone, text: o.text }),
                // Takılı bir çağrı bütün remind turunu bekletmesin (2026-11-08).
                // Uzun tutuldu: süre dolup yeniden denenirse mesaj iki kez gidebilir.
                signal: AbortSignal.timeout(15_000),
            });
            ok = res.ok;
            if (res.ok) {
                const j = await res.json().catch(() => null);
                providerMsgId = j?.key?.id ?? null;
                errText = null;
                break;
            }
            errText = `http_${res.status}`;
            // 404 = instance yok, 401/403 = oturum düştü → bağlantıyı düşmüş işaretle
            if (res.status === 404 || res.status === 401 || res.status === 403) {
                await markDisconnected(admin, o.orgId, errText);
                break;
            }
            if (res.status < 500 && res.status !== 429) break; // diğer kalıcı 4xx
        } catch (e) {
            errText = String(e).slice(0, 300);
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }

    return { ok, providerMsgId, errText };
}

/**
 * Kuyruğu boşaltır — remind cron'unun her turunda çağrılır.
 *
 * Zamanı gelen 'queued' satırlar tek tek yeniden gönderilir. Yeni log satırı
 * AÇILMAZ, mevcut satır güncellenir: yoksa tek hatırlatma kotada üç mesaj gibi
 * görünür ve geçmiş sekmesi aynı mesajı üst üste gösterirdi.
 *
 * Kuyruktaki satır, sıraya girdiğinden beri kalıcı olarak geçersizleşmiş
 * olabilir: müşteri "DUR" demiş ya da hat düşmüş olabilir. İkisi de burada
 * yeniden denetlenir; ısrar etmek opt-out'u çiğnemek olurdu.
 */
export async function drainOutbox(admin: Admin, limit = 50): Promise<{ sent: number; requeued: number; dropped: number }> {
    const now = new Date().toISOString();
    const { data: rows } = await admin
        .from('wa_message_log')
        .select('id, organization_id, phone, kind, body, customer_id, attempts')
        .eq('status', 'queued')
        .lte('next_attempt_at', now)
        .order('next_attempt_at', { ascending: true })
        .limit(limit);

    if (!rows?.length) return { sent: 0, requeued: 0, dropped: 0 };

    const url = await getSecret(admin, 'EVOLUTION_API_URL');
    const key = await getSecret(admin, 'EVOLUTION_API_KEY');
    const tally = { sent: 0, requeued: 0, dropped: 0 };
    const orgCache = new Map<string, OrgWa | null>();

    for (const row of rows) {
        const attempts = Number(row.attempts ?? 1) + 1;
        const finish = async (patch: Record<string, unknown>) => {
            await admin.from('wa_message_log')
                .update({ attempts, last_attempt_at: new Date().toISOString(), ...patch })
                .eq('id', row.id);
        };

        if (!url || !key) {
            await finish({ status: 'failed', error: 'evolution_not_configured', next_attempt_at: null });
            tally.dropped++;
            continue;
        }

        if (!orgCache.has(row.organization_id)) {
            orgCache.set(row.organization_id, await getOrgWa(admin, row.organization_id));
        }
        const org = orgCache.get(row.organization_id) ?? null;
        if (!org?.instance || org.status !== 'connected') {
            // Hat hâlâ düşük: pes etme, bir sonraki pencereye ertele.
            const next = nextAttemptAt(attempts);
            await finish(next
                ? { error: 'not_connected', next_attempt_at: next }
                : { status: 'failed', error: 'not_connected', next_attempt_at: null });
            next ? tally.requeued++ : tally.dropped++;
            continue;
        }

        if (await isOptedOut(admin, row.organization_id, row.phone, row.customer_id)) {
            await finish({ status: 'skipped', error: 'opt_out', next_attempt_at: null });
            tally.dropped++;
            continue;
        }

        const { ok, providerMsgId, errText } = await deliver(admin, {
            url, key, instance: org.instance, orgId: row.organization_id,
            phone: row.phone, text: String(row.body ?? ''),
        });

        if (ok) {
            await finish({ status: 'sent', error: null, provider_msg_id: providerMsgId, next_attempt_at: null });
            tally.sent++;
            continue;
        }

        const next = isTransient(errText) ? nextAttemptAt(attempts) : null;
        if (next) {
            await finish({ error: errText, next_attempt_at: next });
            tally.requeued++;
        } else {
            await finish({
                status: 'failed',
                error: errText ?? (attempts >= MAX_ATTEMPTS ? 'retry_exhausted' : 'failed'),
                next_attempt_at: null,
            });
            tally.dropped++;
        }
    }

    return tally;
}

/**
 * "DUR" denmiş mi? Önce numaranın kendisi (139: kayıtsız numaranın DUR'u da
 * burada; aynı numaranın ikinci müşteri kaydı da kapsanır), sonra müşteri
 * işareti. Verilen müşteri kimliği bu işletmenin değilse (panelden yanlış ya
 * da uydurma kimlik) numaradan bakılır — eskiden kontrol sessizce atlanıyordu.
 * 139 uygulanmadıysa tablo hatası yok sayılır, müşteri işareti geçerli.
 */
export async function isOptedOut(
    admin: Admin, orgId: string, normalizedPhone: string, customerId?: string | null,
): Promise<boolean> {
    const { data: byPhone, error: phoneErr } = await admin
        .from('wa_opt_out_phones').select('phone')
        .eq('organization_id', orgId).eq('phone', normalizedPhone).maybeSingle();
    if (!phoneErr && byPhone) return true;
    if (customerId) {
        const { data } = await admin
            .from('customers').select('wa_opt_out')
            .eq('id', customerId).eq('organization_id', orgId).maybeSingle();
        if (data) return Boolean(data.wa_opt_out);
    }
    const c = await findCustomerByPhone(admin, orgId, normalizedPhone);
    return Boolean(c?.wa_opt_out);
}

/** "DUR" (on=true) ya da "BAŞLAT" (on=false) numaraya yazılır (139). */
export async function setPhoneOptOut(admin: Admin, orgId: string, phone: string, on: boolean): Promise<void> {
    const q = on
        ? admin.from('wa_opt_out_phones').upsert({ organization_id: orgId, phone }, { onConflict: 'organization_id,phone' })
        : admin.from('wa_opt_out_phones').delete().eq('organization_id', orgId).eq('phone', phone);
    const { error } = await q;
    if (error) console.error('wa_opt_out_phones', error.code ?? error.message);
}

/** Numara bu işletmede "DUR" listesinde mi (yalnız numara tablosu)? */
export async function phoneOptedOut(admin: Admin, orgId: string, phone: string): Promise<boolean> {
    const { data, error } = await admin.from('wa_opt_out_phones').select('phone')
        .eq('organization_id', orgId).eq('phone', phone).maybeSingle();
    return !error && Boolean(data);
}

// ── Kimlere cevap verilir (139) ─────────────────────────────────────────────

/**
 * Numara için kararı yazar. owner_typed her zaman üstüne yazar: sahip
 * telefondan elle yazdıysa o kişiyle kendisi ilgileniyor demektir.
 */
export async function rememberContact(
    admin: Admin, orgId: string, phone: string, known: boolean,
    source: 'owner_typed' | 'prior_chat' | 'first_contact',
): Promise<void> {
    const { error } = await admin.from('wa_contacts').upsert({
        organization_id: orgId, phone, known, source, updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,phone' });
    if (error) console.error('wa_contacts', error.code ?? error.message);
}

/**
 * Numara bu hatta bottan önce yazışmış mı? Evolution'ın mesaj geçmişine bakar.
 * null = bakılamadı (ağ, yetki, tanınmayan biçim) — karar verilmez.
 */
async function priorChat(admin: Admin, org: OrgWa, phone: string, remoteJid: string): Promise<boolean | null> {
    if (!org.instance) return null;
    const url = await getSecret(admin, 'EVOLUTION_API_URL');
    const key = await getSecret(admin, 'EVOLUTION_API_KEY');
    if (!url || !key) return null;

    // Numaranın bizde ilk görüldüğü an: yeni numarada şu anki mesaj.
    const { data: first } = await admin.from('wa_message_log').select('created_at')
        .eq('organization_id', org.organization_id).eq('phone', phone)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
    const firstSeen = first?.created_at ? Date.parse(first.created_at) : Date.now();

    const jids = Array.from(new Set([remoteJid, `${phone}@s.whatsapp.net`].filter((j) => j && !j.includes('@g.us'))));
    let looked = false;
    for (const jid of jids) {
        try {
            const res = await fetch(`${url}/chat/findMessages/${org.instance}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: key },
                body: JSON.stringify({ where: { key: { remoteJid: jid } }, page: 1, offset: 50 }),
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) { console.log('findMessages', res.status); continue; }
            looked = true;
            const records = messageRecords(await res.json().catch(() => null));
            if (hadPriorChat(records, firstSeen)) return true;
        } catch (e) {
            console.log('findMessages hata', String(e).slice(0, 120));
        }
    }
    return looked ? false : null;
}

/**
 * Gelen mesaja cevap verilsin mi? Müşteri kaydı her zaman önce gelir; müşteri
 * olmayan numara için karar bir kez verilir ve saklanır. Karar verilemezse
 * (Evolution'a ulaşılamadı) cevap verilir — bugünkü davranış — ve bir sonraki
 * mesajda yeniden bakılır. 139 uygulanmadıysa tablo hatası yine "cevap ver"e
 * düşer: göç ile fonksiyon yüklemesinin sırası önemli değil.
 */
export async function audienceGate(admin: Admin, org: OrgWa, o: {
    phone: string; remoteJid: string; isCustomer: boolean;
}): Promise<'answer' | 'silent'> {
    const cfg = (org.agent_config ?? {}) as Record<string, unknown>;
    const mode = answerMode(cfg.answer_mode);
    const base = { mode, isCustomer: o.isCustomer, isTestNumber: isTestNumber(cfg.test_numbers, o.phone) };
    let decision = answerDecision({ ...base, known: null });
    if (decision !== 'check') return decision;

    const { data: row, error } = await admin.from('wa_contacts').select('known')
        .eq('organization_id', org.organization_id).eq('phone', o.phone).maybeSingle();
    if (error) return 'answer';
    if (row) {
        decision = answerDecision({ ...base, known: Boolean(row.known) });
        return decision === 'silent' ? 'silent' : 'answer';
    }

    const prior = await priorChat(admin, org, o.phone, o.remoteJid);
    if (prior === null) return 'answer';
    await rememberContact(admin, org.organization_id, o.phone, prior, prior ? 'prior_chat' : 'first_contact');
    return prior ? 'silent' : 'answer';
}

/**
 * Normalize edilmiş numaradan müşteriyi bulur. customers.phone ham biçimde
 * tutulduğu için olası yazımları tek sorguda dener (90…, 0…, 5…).
 *
 * AYNI NUMARADA BİRDEN ÇOK KAYIT olabiliyor: 072'nin tekillik indeksi ham
 * telefon metni üzerinde, yani "05468158380" ile "5468158380" iki ayrı
 * anahtar. Eskiden burada `.limit(1)` vardı ve SIRALAMA YOKTU — hangi satırın
 * döneceği belirsizdi. Canlıda tam olarak bu oldu: gerçek adı olan kayıt
 * dururken bot müşteriye "Merhaba Geçici!" yazdı.
 *
 * Seçim artık pickCustomer'da ve belirlenimci: aktif → gerçek adlı → en eski.
 */
export async function findCustomerByPhone(
    admin: Admin, orgId: string, normalizedPhone: string,
): Promise<{ id: string; name: string; wa_opt_out: boolean } | null> {
    const local = normalizedPhone.startsWith('90') ? normalizedPhone.slice(2) : normalizedPhone;
    const variants = Array.from(new Set([
        normalizedPhone, `+${normalizedPhone}`, `0${local}`, local,
    ]));
    const { data } = await admin
        .from('customers')
        .select('id, name, phone, wa_opt_out, is_active, created_at')
        .eq('organization_id', orgId)
        .in('phone', variants)
        .limit(20);
    if (data?.length) return pickCustomer(data);

    // Yazımı boşluklu/tireli kayıtlar için son çare: son 10 haneye göre tara.
    const { data: all } = await admin
        .from('customers')
        .select('id, name, phone, wa_opt_out, is_active, created_at')
        .eq('organization_id', orgId)
        .not('phone', 'is', null)
        .limit(2000);
    const tail = local.slice(-10);
    const matches = (all ?? []).filter((c: { phone?: string }) =>
        (c.phone || '').replace(/\D/g, '').slice(-10) === tail);
    return pickCustomer(matches);
}

/**
 * Hattın gerçekten ayakta olduğunu Evolution'a sorar ve org_whatsapp'ı günceller.
 *
 * Neden gerekli: bağlantı durumu yalnız kullanıcı Ayarlar'ı açınca ya da bir
 * gönderim başarısız olunca tazeleniyordu. Telefon kapanıp oturum düşünce
 * veritabanı saatlerce "connected" diyor, uygulamadaki "bağlantı düştü" uyarısı
 * hiç çıkmıyordu. remind zaten 30 dakikada bir çalıştığı için sağlık kontrolünü
 * oraya iliştiriyoruz — ayrı bir zamanlayıcı gerekmiyor.
 */
export async function verifyConnection(admin: Admin, org: OrgWa): Promise<boolean> {
    if (!org.instance) return false;
    const url = await getSecret(admin, 'EVOLUTION_API_URL');
    const key = await getSecret(admin, 'EVOLUTION_API_KEY');
    if (!url || !key) return false;

    let state = 'close';
    try {
        const res = await fetch(`${url}/instance/connectionState/${org.instance}`, {
            headers: { 'Content-Type': 'application/json', 'apikey': key },
            signal: AbortSignal.timeout(8000),
        });
        if (res.ok) state = (await res.json())?.instance?.state ?? 'close';
    } catch {
        // Evolution'a ulaşılamıyor: hattı düşmüş saymıyoruz, bu turu atlıyoruz.
        return false;
    }

    if (state === 'open') {
        if (org.status !== 'connected') {
            await admin.from('org_whatsapp').update({
                status: 'connected', last_error: null,
                last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq('organization_id', org.organization_id);
        } else {
            await admin.from('org_whatsapp')
                .update({ last_seen_at: new Date().toISOString() })
                .eq('organization_id', org.organization_id);
        }
        return true;
    }

    await markDisconnected(admin, org.organization_id, `state:${state}`);
    return false;
}

export async function markDisconnected(admin: Admin, orgId: string, error: string): Promise<void> {
    await admin.from('org_whatsapp')
        .update({ status: 'disconnected', last_error: error, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId);
}
