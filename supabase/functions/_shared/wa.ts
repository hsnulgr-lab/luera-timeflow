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

// deno-lint-ignore no-explicit-any
export type Admin = any; // service_role SupabaseClient

export type WaKind =
    | 'confirmation' | 'reminder_24h' | 'reminder_2h' | 'recall' | 'winback' | 'renewal'
    | 'queue_join' | 'queue_ready' | 'rebook' | 'waitlist'
    | 'ai_draft' | 'manual' | 'booking' | 'inbound' | 'optout';

export type SendReason =
    | 'not_connected' | 'opt_out' | 'quota' | 'invalid_phone' | 'failed';

export interface OrgWa {
    organization_id: string;
    instance: string | null;
    status: 'disconnected' | 'connecting' | 'connected';
    webhook_secret: string;
    features: Record<string, boolean>;
}

// Promosyon niteliğindeki mesajlar — kişi başına günde 1 taneden fazlası gitmez.
const PROMO: ReadonlySet<string> = new Set(['winback', 'renewal', 'recall']);
// Kota dışı tutulanlar: kullanıcının elle tetiklediği, konuşmanın parçası olan
// ya da işlemin karşılığı olanlar. Randevu onayı da buradadır — müşteri az önce
// randevu aldı, kota yüzünden "kaydınız oluşturuldu" mesajı yutulmamalı.
const UNMETERED: ReadonlySet<string> = new Set(['booking', 'inbound', 'optout', 'manual', 'confirmation']);

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
export async function connectedOrgs(admin: Admin): Promise<OrgWa[]> {
    const { data } = await admin
        .from('org_whatsapp')
        .select('organization_id, instance, status, webhook_secret, features')
        .not('instance', 'is', null)
        .eq('status', 'connected');
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
    status: 'sent' | 'failed' | 'skipped';
    body?: string;
    customerId?: string | null;
    error?: string | null;
    providerMsgId?: string | null;
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
    }).then(() => {}, () => {}); // log yazamamak gönderimi engellememeli
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
export interface SendResult { ok: boolean; reason?: SendReason; phone?: string }

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

    let providerMsgId: string | null = null;
    let errText: string | null = null;
    let ok = false;
    try {
        const res = await fetch(`${url}/message/sendText/${org.instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': key },
            body: JSON.stringify({ number: phone, text }),
        });
        ok = res.ok;
        if (res.ok) {
            const j = await res.json().catch(() => null);
            providerMsgId = j?.key?.id ?? null;
        } else {
            errText = `http_${res.status}`;
            // 404 = instance yok, 401/403 = oturum düştü → bağlantıyı düşmüş işaretle
            if (res.status === 404 || res.status === 401 || res.status === 403) {
                await markDisconnected(admin, orgId, errText);
            }
        }
    } catch (e) {
        errText = String(e).slice(0, 300);
    }

    await logMessage(admin, {
        orgId, direction: 'out', phone, kind, body: text,
        status: ok ? 'sent' : 'failed', error: errText,
        customerId: opts.customerId, providerMsgId,
    });

    return ok ? { ok: true, phone } : { ok: false, reason: 'failed', phone };
}

/** Müşteri "DUR" demiş mi? Numara ham kayıtlı olduğu için varyantlarla eşleşir. */
export async function isOptedOut(
    admin: Admin, orgId: string, normalizedPhone: string, customerId?: string | null,
): Promise<boolean> {
    if (customerId) {
        const { data } = await admin
            .from('customers').select('wa_opt_out')
            .eq('id', customerId).eq('organization_id', orgId).maybeSingle();
        return Boolean(data?.wa_opt_out);
    }
    const c = await findCustomerByPhone(admin, orgId, normalizedPhone);
    return Boolean(c?.wa_opt_out);
}

/**
 * Normalize edilmiş numaradan müşteriyi bulur. customers.phone ham biçimde
 * tutulduğu için olası yazımları tek sorguda dener (90…, 0…, 5…).
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
        .select('id, name, phone, wa_opt_out')
        .eq('organization_id', orgId)
        .in('phone', variants)
        .limit(1);
    if (data?.length) return data[0];

    // Yazımı boşluklu/tireli kayıtlar için son çare: son 10 haneye göre tara.
    const { data: all } = await admin
        .from('customers')
        .select('id, name, phone, wa_opt_out')
        .eq('organization_id', orgId)
        .not('phone', 'is', null)
        .limit(2000);
    const tail = local.slice(-10);
    return (all ?? []).find((c: { phone?: string }) =>
        (c.phone || '').replace(/\D/g, '').slice(-10) === tail) ?? null;
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
