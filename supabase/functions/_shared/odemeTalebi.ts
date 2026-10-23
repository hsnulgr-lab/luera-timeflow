// Ödeme önce, hesap sonra (göç 127) — hesapsız Dodo aboneliğini bir
// işletmeye bağlar. İki yerden çağrılır, hangisi önce gelirse:
//   - dodo-webhook: `claim_id`li ama işletmesiz abonelik olayı
//   - dodo-satin-al `claim`: kişi Dodo'dan dönüş sayfasına geldi
// İkinci çağrı ilkinin sonucunu okur (talep satırı tek doğruluk kaynağı).
//
// Güvenlik:
//   - Şifresiz giriş YALNIZ hesabı bu talep açtıysa ve yalnız jeton sahibine
//     (dodo-satin-al · issueLogin). Var olan bir hesaba asla giriş verilmez.
//   - Var olan hesabın işletmesine ekleme yalnız kişinin TEK işletmesi varsa;
//     başkasının parasıyla açılan abonelik o işletmeye yalnız erişim kazandırır,
//     kimseye o hesabın oturumunu vermez.

import { dodoFetch, type DodoApi } from './dodo.ts';
import type { Admin } from './wa.ts';
import { subBelongsToClaim, subEmail, subIsLive, UUID } from '../dodo-satin-al/talep.ts';

export type AttachResult =
    | { kind: 'attached'; orgId: string; userId: string; created: boolean }
    // Kişi giriş yapmalı (e-postanın hesabı var ama işletmesi yok ya da birden çok).
    | { kind: 'needs_login'; reason: string }
    // Abonelik henüz canlı değil (ödeme sürüyor) ya da bu talebe ait değil.
    | { kind: 'not_live' | 'not_ours' | 'not_found' }
    // Geçici hata: webhook 500 döner, Dodo yeniden dener.
    | { kind: 'retry'; what: string };

export interface ClaimRow {
    id: string;
    created_at: string;
    expires_at: string;
    organization_id: string | null;
    user_id: string | null;
    user_created: boolean;
    attached_at: string | null;
    login_issued_at: string | null;
    email: string | null;
    dodo_subscription_id: string | null;
    outcome: string | null;
}

const COLS = 'id, created_at, expires_at, organization_id, user_id, user_created, attached_at, login_issued_at, email, dodo_subscription_id, outcome';

export async function readClaim(admin: Admin, by: { id?: string; tokenHash?: string }): Promise<ClaimRow | null | 'error'> {
    let q = admin.from('checkout_claims').select(COLS);
    q = by.id ? q.eq('id', by.id) : q.eq('token_hash', by.tokenHash);
    const { data, error } = await q.maybeSingle();
    if (error) { console.error('odemeTalebi: talep okunamadı', error); return 'error'; }
    return data ?? null;
}

/**
 * Aboneliği talebe bağlar; idempotent. `sub` Dodo'nun abonelik nesnesi
 * (webhook verisi ya da GET /subscriptions/{id}).
 */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function attachClaim(admin: Admin, api: DodoApi | null, claimId: string, sub: any): Promise<AttachResult> {
    if (!UUID.test(claimId)) return { kind: 'not_found' };
    const row = await readClaim(admin, { id: claimId });
    if (row === 'error') return { kind: 'retry', what: 'talep okunamadı' };
    if (!row) return { kind: 'not_found' };
    if (row.attached_at && row.organization_id && row.user_id) {
        return { kind: 'attached', orgId: row.organization_id, userId: row.user_id, created: row.user_created };
    }
    if (!subBelongsToClaim(sub, row.id)) return { kind: 'not_ours' };
    if (!subIsLive(sub)) return { kind: 'not_live' };
    const subId = String(sub.subscription_id ?? '');
    const email = subEmail(sub);
    if (!email) return mark(admin, row.id, { outcome: 'needs_login', dodo_subscription_id: subId || null }, { kind: 'needs_login', reason: 'no_email' });

    // ── Kişi: e-posta yeniyse hesap açılır (handle_new_user işletmeyi kurar) ──
    let userId = await userByEmail(admin, email);
    if (userId === 'error') return { kind: 'retry', what: 'kullanıcı aranamadı' };
    if (!userId) {
        // Ad verilmez: tetikleyici işletme adını e-postadan koyar (normal
        // kayıttaki gibi); asıl ad Kurulum'da yazılır. Dodo'daki "Tam ad"
        // kişinin adı, işletmenin değil. `checkout_claim` damgası "bu hesabı
        // bu talep açtı"nın TEK kanıtı (zaman karşılaştırması değil: arada
        // kendisi kaydolan birinin hesabına jeton sahibi giriş alırdı).
        const { data, error } = await admin.auth.admin.createUser({
            email, email_confirm: true, app_metadata: { checkout_claim: row.id },
        });
        if (error || !data?.user) {
            // Eşzamanlı ikinci çağrı aynı e-postayı az önce açtıysa: onu kullan.
            const again = await userByEmail(admin, email);
            if (again === 'error' || !again) return { kind: 'retry', what: `hesap açılamadı: ${error?.message ?? 'bilinmiyor'}` };
            userId = again;
        } else {
            userId = data.user.id;
        }
    }
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId);
    if (uErr || !u?.user) return { kind: 'retry', what: 'kullanıcı okunamadı' };
    const created = u.user.app_metadata?.checkout_claim === row.id;

    // ── İşletme: kişinin TEK sahibi olduğu işletme ──────────────────────────
    const { data: owned, error: ownErr } = await admin.from('organizations').select('id').eq('owner_id', userId);
    if (ownErr) return { kind: 'retry', what: 'işletme okunamadı' };
    if (!owned || owned.length !== 1) {
        return mark(admin, row.id, {
            outcome: 'needs_login', email, user_id: userId, user_created: created, dodo_subscription_id: subId || null,
        }, { kind: 'needs_login', reason: owned?.length ? 'many_orgs' : 'no_org' });
    }
    const orgId: string = owned[0].id;

    // ── Talep: yalnız ilk bağlayan yazar ───────────────────────────────────
    const { data: won, error: upErr } = await admin.from('checkout_claims')
        .update({
            organization_id: orgId, user_id: userId, user_created: created, email,
            dodo_subscription_id: subId || null, attached_at: new Date().toISOString(), outcome: 'attached',
        })
        .eq('id', row.id)
        .is('attached_at', null)
        .select('id');
    if (upErr) return { kind: 'retry', what: 'talep yazılamadı' };
    if (!won?.length) {
        // Öteki çağrı bir an önce bağladı: onun sonucu geçerli.
        const now = await readClaim(admin, { id: row.id });
        if (now === 'error' || !now?.organization_id || !now.user_id) return { kind: 'retry', what: 'talep yeniden okunamadı' };
        return { kind: 'attached', orgId: now.organization_id, userId: now.user_id, created: now.user_created };
    }

    // Dodo aboneliğine işletme yazılır: sonraki olaylar doğrudan eşleşir.
    // Başarısızsa sorun değil — talep ve aynadaki abonelik kimliği de eşler.
    if (api && subId) {
        try {
            const res = await dodoFetch(api, `/subscriptions/${encodeURIComponent(subId)}`, {
                method: 'PATCH',
                body: JSON.stringify({ metadata: { ...(sub.metadata ?? {}), organization_id: orgId } }),
            });
            if (!res.ok) console.warn('odemeTalebi: Dodo metadata yazılamadı', subId, res.status);
        } catch (e) {
            console.warn('odemeTalebi: Dodo metadata yazılamadı', subId, e);
        }
    }
    return { kind: 'attached', orgId, userId, created };
}

/**
 * Hesabı bu talep açtıysa TEK KULLANIMLIK giriş jetonu (sihirli bağlantıyla
 * aynı: /baglanti · verifyOtp). İkinci çağrı null döner.
 */
export async function issueLogin(admin: Admin, row: ClaimRow): Promise<string | null> {
    if (!row.user_created || !row.email || row.login_issued_at) return null;
    const { data: won, error } = await admin.from('checkout_claims')
        .update({ login_issued_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('login_issued_at', null)
        .select('id');
    if (error || !won?.length) return null;
    const { data, error: glErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: row.email });
    const hash: string | undefined = data?.properties?.hashed_token;
    if (glErr || !hash) {
        console.error('odemeTalebi: giriş jetonu üretilemedi', row.id, glErr?.message);
        // Jeton verilemediyse hak yanmasın: kişi yeniden denesin.
        await admin.from('checkout_claims').update({ login_issued_at: null }).eq('id', row.id);
        return null;
    }
    return hash;
}

async function userByEmail(admin: Admin, email: string): Promise<string | null | 'error'> {
    const { data, error } = await admin.rpc('checkout_claim_user', { p_email: email });
    if (error) { console.error('odemeTalebi: kullanıcı aranamadı', error); return 'error'; }
    return typeof data === 'string' && UUID.test(data) ? data : null;
}

async function mark(admin: Admin, id: string, patch: Record<string, unknown>, result: AttachResult): Promise<AttachResult> {
    const { error } = await admin.from('checkout_claims').update(patch).eq('id', id).is('attached_at', null);
    if (error) console.error('odemeTalebi: talep işaretlenemedi', id, error);
    return result;
}
