import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deny, identify } from '../_shared/auth.ts';
import { getSecret } from '../_shared/wa.ts';
import {
    displayName, dueMail, MAGIC_KINDS, magicUrl, MAIL_FROM, MAIL_KINDS, MAIL_REPLY_TO, mailContent,
    maskEmail, paywallLoginUrl, sendableAt, type Due, type MailKind, type MailRow,
} from './eposta.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Abonelik e-postaları — Faz 2.5 (docs/abonelik-kurallari.md §2).
 *
 * VPS crontab'ı 15 dakikada bir çağırır (`x-cron-secret`, remind ile aynı
 * sır — scripts/rotate-cron-secret.sh bu satırı da döndürür). Kurulum:
 * ops/abonelik/eposta.sh cron.
 *
 * ── Neden 15 dakika, günde bir değil ────────────────────────────────────────
 * Ödeme alınamayınca telefona ANINDA "Ayrıntılar e-postanızda" bildirimi
 * gidiyor (dodo-webhook) ve ek süre yalnız 2 gün; e-posta saatlerce
 * gecikmemeli. Sıklık e-posta sayısını artırmaz: her e-posta (işletme, tür,
 * dönem) başına BİR kez gider (defter, göç 125). Webhook'a e-posta EKLENMEDİ
 * — para yolu yavaşlamasın.
 *
 * ── Anahtar ─────────────────────────────────────────────────────────────────
 * `app_secrets.ABONELIK_EPOSTA = 'true'` → gerçek gönderim. Başka her değer
 * ya da yokluk → KURU: hesaplar, sayı döner, deftere YAZMAZ (yazsaydı anahtar
 * açılınca o e-postalar "gitti" sayılırdı). Dodo Live ile birlikte açılır:
 * test kipinde e-postadaki ödeme sayfası gerçek kartı almaz.
 *
 * ── Gövde ───────────────────────────────────────────────────────────────────
 *   (yok)                               tarama; yanıt YALNIZ sayılar — cron
 *                                       günlüğüne kişisel veri düşmesin
 *   { "ayrinti": true }                 tarama + liste, alıcı maskeli
 *   { "dene": { "org", "tur" } }        deneme gönderimi: anahtardan ve sessiz
 *                                       saatten bağımsız; dönem `deneme-<an>`,
 *                                       gerçek defter satırını bloke etmez
 *
 * Kimlik: yalnız zamanlayıcı (`x-cron-secret`) ya da service_role.
 */

/** Bir turda en çok bu kadar gönderim; kalanı 15 dk sonraki tura. */
const MAX_PER_RUN = 40;
/** Resend saniyede birkaç istek kabul ediyor; ardışık gönderimler arası pay. */
const SEND_GAP_MS = 600;
const RESEND_URL = 'https://api.resend.com/emails';
const DAY = 86_400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any; // service_role SupabaseClient (bkz. _shared/entitlement.ts — aynı desen)

interface Config {
    live: boolean;
    enforce: boolean;
    appUrl: string;
    resendKey: string | null;
}

type Outcome =
    | { kind: 'sent'; to: string; resendId: string | null }
    | { kind: 'skip'; why: string }
    | { kind: 'error'; why: string; to?: string };

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

const iso = (t: number) => new Date(t).toISOString();

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const caller = await identify(admin, req);
        if (caller.kind !== 'cron' && caller.kind !== 'service') {
            return deny(401, 'Bu uç yalnız zamanlayıcı tarafından çağrılabilir', corsHeaders);
        }

        const body = await req.json().catch(() => ({}));
        const [flag, enforce, appUrl, resendKey] = await Promise.all([
            getSecret(admin, 'ABONELIK_EPOSTA'),
            getSecret(admin, 'ENTITLEMENT_ENFORCE'),
            getSecret(admin, 'APP_URL'),
            getSecret(admin, 'RESEND_API_KEY'),
        ]);
        const cfg: Config = {
            live: flag === 'true',
            enforce: enforce === 'true',
            appUrl: appUrl || 'https://timeflow.lueratech.com',
            resendKey: resendKey || null,
        };
        const now = Date.now();

        if (body && typeof body === 'object' && body.dene) return await trialSend(admin, cfg, body.dene, now);
        return await scan(admin, cfg, now, body?.ayrinti === true);
    } catch (e) {
        console.error('abonelik-eposta: beklenmeyen hata', e);
        return json({ error: 'internal' }, 500);
    }
});

// ── Tarama ──────────────────────────────────────────────────────────────────

async function scan(admin: Admin, cfg: Config, now: number, detail: boolean): Promise<Response> {
    // Aday satırlar az (yalnız deneme ve ek süre); hangisine e-posta düştüğü
    // saf `dueMail`de karar verilir — süzgeç SQL'de iki kez yazılmasın.
    const { data: rows, error } = await admin.from('org_entitlement')
        .select('organization_id, state, dodo_subscription_id, last_event, trial_ends_at, expires_at, grace_until')
        .in('state', ['trial', 'grace']);
    if (error) {
        console.error('abonelik-eposta: ayna okunamadı', error);
        return json({ error: 'entitlement_lookup_failed' }, 500);
    }

    const due: { row: MailRow; due: Due }[] = [];
    let quiet = 0;
    for (const row of (rows ?? []) as MailRow[]) {
        const d = dueMail(row, now);
        if (!d) continue;
        if (!sendableAt(d.tur, now)) { quiet++; continue; }
        due.push({ row, due: d });
    }

    if (!cfg.live) return await dryRun(admin, due, quiet, detail);

    if (!cfg.resendKey) {
        // Anahtar açık ama gönderecek araç yok: defter yazılmasın, alarm verilsin.
        console.error('abonelik-eposta: RESEND_API_KEY yok, gönderim yapılmadı');
        return json({ error: 'resend_key_missing', vade: due.length }, 500);
    }

    const counts = { gonderildi: 0, atlandi: 0, hata: 0 };
    const list: Record<string, unknown>[] = [];
    let sends = 0;
    for (const item of due.slice(0, MAX_PER_RUN)) {
        if (sends > 0) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
        const res = await sendOne(admin, cfg, item.row.organization_id, item.due, {
            endsAt: endOf(item.due.tur, item.row),
            event: item.row.last_event ?? null,
        }, now);
        if (res.kind === 'sent') { counts.gonderildi++; sends++; }
        else if (res.kind === 'skip') counts.atlandi++;
        else counts.hata++;
        if (detail) {
            list.push({
                org: item.row.organization_id, tur: item.due.tur, donem: item.due.donem,
                sonuc: res.kind, ...(res.kind === 'sent' ? { alici: maskEmail(res.to) } : {}),
                ...(res.kind !== 'sent' ? { neden: res.why } : {}),
            });
        }
    }
    const later = Math.max(0, due.length - MAX_PER_RUN);
    console.log(`abonelik-eposta mod=gercek vade=${due.length} gonderildi=${counts.gonderildi} atlandi=${counts.atlandi} hata=${counts.hata} sessiz=${quiet} sonraki_tur=${later}`);
    return json({ mod: 'gercek', vade: due.length, ...counts, sessiz_saat: quiet, sonraki_tur: later, ...(detail ? { liste: list } : {}) });
}

/**
 * Kuru tarama: kime ne giderdi. Deftere YAZMAZ; yalnız okur — zaten giden
 * (ya da deneme sayısı dolan) e-posta "gidecek" sayılmasın.
 */
async function dryRun(admin: Admin, due: { row: MailRow; due: Due }[], quiet: number, detail: boolean): Promise<Response> {
    const orgIds = [...new Set(due.map((d) => d.row.organization_id))];
    let ledgerOk = true;
    const seen = new Map<string, { durum: string; deneme: number }>();
    if (orgIds.length) {
        const { data, error } = await admin.from('abonelik_eposta')
            .select('organization_id, tur, donem, durum, deneme')
            .in('organization_id', orgIds);
        if (error) {
            // Göç 125 henüz yoksa da kuru tarama çalışsın — sayı yine anlamlı.
            ledgerOk = false;
            console.warn('abonelik-eposta: defter okunamadı (kuru)', error.message);
        }
        for (const r of data ?? []) seen.set(`${r.organization_id}|${r.tur}|${r.donem}`, r);
    }

    const verdict = (d: { row: MailRow; due: Due }) => {
        const r = seen.get(`${d.row.organization_id}|${d.due.tur}|${d.due.donem}`);
        if (!r) return 'gidecek';
        if (r.durum === 'gonderildi') return 'zaten_gitti';
        if (r.durum === 'hata' && r.deneme >= 3) return 'vazgecildi';
        return 'gidecek';
    };
    const verdicts = due.map(verdict);
    const count = (v: string) => verdicts.filter((x) => x === v).length;
    const summary = {
        mod: 'kuru', vade: due.length, gidecek: count('gidecek'), zaten_gitti: count('zaten_gitti'),
        vazgecildi: count('vazgecildi'), sessiz_saat: quiet, defter: ledgerOk ? 'okundu' : 'okunamadi',
    };
    console.log(`abonelik-eposta mod=kuru vade=${summary.vade} gidecek=${summary.gidecek} zaten=${summary.zaten_gitti} sessiz=${quiet}`);
    if (!detail) return json(summary);

    const owners = await ownerEmails(admin, orgIds);
    const liste = due.map((d, i) => ({
        org: d.row.organization_id, tur: d.due.tur, donem: d.due.donem,
        alici: maskEmail(owners.get(d.row.organization_id) ?? null), durum: verdicts[i],
    }));
    return json({ ...summary, liste });
}

/** İşletme → sahibinin adresi (yalnız ayrıntılı kuru liste için, maskelenir). */
async function ownerEmails(admin: Admin, orgIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!orgIds.length) return out;
    const { data } = await admin.from('organizations').select('id, owner_id').in('id', orgIds);
    for (const o of data ?? []) {
        if (!o.owner_id) continue;
        const { data: u } = await admin.auth.admin.getUserById(o.owner_id);
        if (u?.user?.email) out.set(o.id, u.user.email);
    }
    return out;
}

/** E-postada yazan bitiş: ödeme alınamadıysa ek sürenin sonu, değilse deneme. */
function endOf(tur: MailKind, row: MailRow): string {
    return (tur === 'odeme' ? row.grace_until : (row.expires_at ?? row.trial_ends_at)) ?? iso(Date.now());
}

// ── Tek gönderim ────────────────────────────────────────────────────────────

/**
 * Önce AYIR (defter satırı), SONRA gönder: iki tarama aynı anda koşsa da
 * yalnız biri satırı alır. Ayrılan satır her durumda kapanır — gönderildi
 * ya da hata (hata en çok 3 kez yeniden denenir, göç 125).
 */
async function sendOne(
    admin: Admin, cfg: Config, orgId: string, due: Due,
    copy: { endsAt: string; event: string | null }, now: number,
): Promise<Outcome> {
    const { data: org, error: orgErr } = await admin.from('organizations')
        .select('id, name, owner_id').eq('id', orgId).maybeSingle();
    if (orgErr) {
        console.error('abonelik-eposta: işletme okunamadı', orgId, orgErr.message);
        return { kind: 'error', why: 'org_lookup' };
    }
    if (!org) return { kind: 'skip', why: 'org_gone' };

    const { data: claimed, error: claimErr } = await admin.rpc('abonelik_eposta_ayir', {
        p_org: orgId, p_tur: due.tur, p_donem: due.donem, p_user: org.owner_id ?? null,
    });
    if (claimErr) {
        console.error('abonelik-eposta: defter ayrılamadı', orgId, due.tur, claimErr.message);
        return { kind: 'error', why: 'claim' };
    }
    const slot = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!slot?.id) return { kind: 'skip', why: 'zaten' };

    const close = async (patch: Record<string, unknown>) => {
        const { error } = await admin.from('abonelik_eposta')
            .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', slot.id);
        // Gönderildi yazılamazsa satır 30 dk sonra yeniden alınır → aynı
        // e-posta ikinci kez gidebilir. Kayıptan iyidir ama görünür olmalı.
        if (error) console.error('abonelik-eposta: defter kapatılamadı', slot.id, error.message);
    };
    const fail = async (why: string, to?: string): Promise<Outcome> => {
        await close({ durum: 'hata', hata: why.slice(0, 300) });
        return { kind: 'error', why: why.split(' ')[0], to };
    };

    // Alıcı YALNIZ işletme sahibi; adres her gönderimde okunur, deftere yazılmaz.
    if (!org.owner_id) return await fail('no_owner');
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(org.owner_id);
    const email: string | undefined = u?.user?.email;
    if (uErr || !email) return await fail(uErr ? `owner_lookup ${uErr.message}` : 'no_email');

    const { data: st } = await admin.from('settings').select('business_name')
        .eq('organization_id', orgId).eq('user_id', org.owner_id).maybeSingle();
    const business = displayName(st?.business_name) ?? displayName(org.name);

    // Sihirli bağlantı: giriş servisinin `hashed_token`ı, bizim sayfamıza.
    // Üretilemezse e-posta yine gider — düğme giriş sayfasına açılır.
    let link = paywallLoginUrl(cfg.appUrl);
    let magic = false;
    if (MAGIC_KINDS.includes(due.tur)) {
        const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
        const hash: string | undefined = gl?.properties?.hashed_token;
        if (!glErr && hash) {
            link = magicUrl(cfg.appUrl, hash);
            magic = true;
        } else {
            console.warn('abonelik-eposta: sihirli bağlantı üretilemedi, düz bağlantı', orgId, glErr?.message ?? 'hashed_token yok');
        }
    }

    const content = mailContent(due.tur, {
        business, to: email, link, magic, enforce: cfg.enforce,
        endsAt: copy.endsAt, event: copy.event, now,
    });

    let res: Response;
    try {
        res = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${cfg.resendKey}`,
                'Content-Type': 'application/json',
                // Deneme başına ayrı anahtar: başarısız denemenin önbelleğe
                // alınmış cevabı yeniden denemeyi boşa çıkarmasın.
                'Idempotency-Key': `abonelik-${slot.id}-${slot.deneme}`,
            },
            body: JSON.stringify({
                from: MAIL_FROM,
                to: [email],
                reply_to: MAIL_REPLY_TO,
                subject: content.subject,
                html: content.html,
                text: content.text,
                tags: [{ name: 'tur', value: due.tur }],
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (e) {
        // Zaman aşımında e-posta gitmiş olabilir; yeniden deneme nadiren çift
        // e-posta üretir — kayıp e-postaya tercih edildi (devir 13 §5).
        return await fail(`resend_network ${e instanceof Error ? e.message : String(e)}`, email);
    }

    const raw = await res.text();
    if (!res.ok) return await fail(`resend_${res.status} ${raw.slice(0, 280)}`, email);

    let resendId: string | null = null;
    try { resendId = JSON.parse(raw)?.id ?? null; } catch { /* gövde JSON değil; gönderim yine başarılı */ }
    await close({ durum: 'gonderildi', resend_id: resendId, hata: null });
    return { kind: 'sent', to: email, resendId };
}

// ── Deneme gönderimi ────────────────────────────────────────────────────────

/**
 * ops/abonelik/eposta.sh dene: bir türün e-postasını işletmenin sahibine
 * gönderir — görünüm, gelen kutusu ve sihirli bağlantı denensin diye. Tarih
 * işletmenin gerçek satırından alınır; o tür için anlamsızsa (bitmemiş
 * denemeye "bitti") makul bir örnek tarih kullanılır.
 */
async function trialSend(admin: Admin, cfg: Config, raw: unknown, now: number): Promise<Response> {
    const req = (raw ?? {}) as { org?: unknown; tur?: unknown };
    const orgId = typeof req.org === 'string' && UUID_RE.test(req.org) ? req.org : null;
    const tur = MAIL_KINDS.find((k) => k === req.tur) ?? null;
    if (!orgId || !tur) return json({ error: 'bad_request', turler: MAIL_KINDS }, 400);
    if (!cfg.resendKey) return json({ error: 'resend_key_missing' }, 500);

    const { data: row } = await admin.from('org_entitlement')
        .select('organization_id, state, dodo_subscription_id, last_event, trial_ends_at, expires_at, grace_until')
        .eq('organization_id', orgId).maybeSingle();

    const res = await sendOne(admin, cfg, orgId, { tur, donem: `deneme-${iso(now)}` }, {
        endsAt: sampleEnd(tur, row as MailRow | null, now),
        event: row?.last_event === 'trial_opening' ? 'trial_opening' : 'trial_phone',
    }, now);
    console.log(`abonelik-eposta dene tur=${tur} sonuc=${res.kind}`);
    if (res.kind === 'sent') return json({ gonderildi: true, tur, alici: maskEmail(res.to), resend_id: res.resendId });
    return json({ gonderildi: false, tur, neden: res.why, ...(res.kind === 'error' && res.to ? { alici: maskEmail(res.to) } : {}) }, res.kind === 'skip' ? 409 : 502);
}

function sampleEnd(tur: MailKind, row: MailRow | null, now: number): string {
    const realIso = tur === 'odeme' ? row?.grace_until : (row?.expires_at ?? row?.trial_ends_at);
    const real = realIso ? Date.parse(realIso) : NaN;
    const past = tur === 'bitti' || tur === 'son';
    if (Number.isFinite(real) && (past ? real <= now : real > now)) return iso(real);
    const days: Record<MailKind, number> = { hosgeldin: 7, uc_gun: 3, bitti: 0, son: -3, odeme: 2 };
    return iso(now + days[tur] * DAY);
}
