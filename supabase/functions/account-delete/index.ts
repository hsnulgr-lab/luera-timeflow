import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveOrg } from '../_shared/org.ts';
import { cancelNow, dodoApi } from '../_shared/dodo.ts';
import { revokeApple } from './apple.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Hesap silme — App Store 5.1.1(v).
 *
 * Apple, hesap açtıran her uygulamanın UYGULAMA İÇİNDEN gerçek silme sunmasını
 * şart koşuyor. "Bize e-posta atın" ya da yerel bir oturum temizliği silme
 * sayılmıyor. Bu fonksiyon o şartın sunucu tarafı.
 *
 * ── İki ayrı yıkım ──────────────────────────────────────────────────────────
 *
 * Hesabı silmek her zaman işletmeyi silmek değildir:
 *
 *   • İşletmenin BAŞKA sahibi varsa → yalnız bu kişinin üyeliği ve auth kaydı
 *     silinir. Salon çalışmaya devam eder; müşterileri, randevuları, kasası
 *     yerinde durur. Bir ortağın ayrılması işletmeyi kapatmaz.
 *
 *   • TEK sahipse → `organizations` satırı silinir. Şemadaki 33 yabancı
 *     anahtarın hepsi `ON DELETE CASCADE`, yani müşteriler, randevular,
 *     personel, ödemeler, izinler, WhatsApp ayarları tek DELETE ile gider.
 *     Yeni bir "temizlik" sorgusu yazmaya gerek yok ve yazılmamalı: cascade
 *     unutulan tabloyu da alır, elle yazılan liste almaz.
 *
 * ── Silme hakkı ─────────────────────────────────────────────────────────────
 *
 * Yalnız `role='owner'`. `admin` silemez: bir yöneticinin işletmenin tamamını
 * yok edebilmesi, sahibinin haberi olmadan olabilecek en pahalı kaza olurdu.
 *
 * ── Abonelik ────────────────────────────────────────────────────────────────
 *
 * İşletme siliniyorsa abonelik ANINDA iptal edilir. `dodo-checkout`'taki
 * "dönem sonunda iptal" burada yanlış olurdu: org yok ama abonelik bir dönem
 * daha açık kalır ve karşılığında hiçbir hizmet olmayan bir tahsilat daha
 * döner.
 *
 * Dodo abonelik kimliği yerel aynada (`org_entitlement.dodo_subscription_id`,
 * 123). LUERA Core'a GİDİLMEZ: eskiden gidiliyordu ve Core düşünce hesap
 * silinemiyordu (5.1.1(v)). Core'daki kopya, Dodo'nun iptal olayı webhook'a
 * gelince "işletme silinmiş" yoluyla kapanır.
 *
 * `dodo_events` bilerek FK'sız: org silinse de Luera'nın kendi ödeme
 * geçmişi durur. Bu Luera'nın muhasebe kaydı, salonun verisi değil.
 *
 * ── Sıralama ────────────────────────────────────────────────────────────────
 *
 * Abonelik ÖNCE iptal edilir. Sıra tersine dönerse org silinmiş ama abonelik
 * açık kalmış bir durum doğabilir ve o durumu kimse fark etmez — org'u artık
 * kimse açamayacağı için fatura sessizce kesilmeye devam eder.
 *
 * Auth kaydı EN SON silinir: silindiği anda JWT geçersizleşir ve sonraki
 * adımlar yetkisiz kalırdı.
 *
 * ── Apple belge iptali (TN3194 · 2026-10-19) ────────────────────────────────
 *
 * Gövdede `appleCode` varsa (Apple ile girmiş kişi, silmeden önce Apple'a bir
 * kez daha sordu) yetki kontrolünden SONRA, hiçbir şey silinmeden ÖNCE kod
 * belgeye çevrilip Apple'da iptal edilir (`apple.ts`). Kod geçersizse ya da
 * başka bir Apple Kimliğiyse silme durur; Apple'a ulaşılamazsa silme sürer.
 * Kod yoksa (1.0.1 telefonları, e-posta hesapları) bugünkü gibi silinir.
 *
 * ── İşletmesiz hesap ───────────────────────────────────────────────────────
 *
 * Apple/Google ile girip köprüde işletme açmadan bırakan kişi `no_org`
 * alıyor ve kendini SİLEMİYORDU. Üyeliği yoksa yalnız giriş kaydı silinir —
 * ama sahibi olduğu bir işletme satırı varsa (üyeliksiz, tutarsız durum)
 * DURULUR: `organizations.owner_id` cascade ile o işletmeyi de silerdi.
 */

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    try {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (!jwt) return json({ error: 'unauthorized' }, 401);

        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
        if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
        const userId = userData.user.id;

        const body = await req.json().catch(() => ({}));

        /** Apple adımı — çağıran yalnız yetki doğrulandıktan sonra çağırır. */
        const appleStep = async (): Promise<Response | null> => {
            if (typeof body.appleCode !== 'string' || !body.appleCode) return null;
            const identity = (userData.user.identities ?? []).find((i) => i.provider === 'apple');
            const expectedSub = identity ? String((identity.identity_data as { sub?: string } | undefined)?.sub ?? identity.id) : null;
            const out = await revokeApple({
                code: body.appleCode,
                client: String(body.appleClient ?? 'ios'),
                redirectUri: typeof body.appleRedirectUri === 'string' ? body.appleRedirectUri : null,
                expectedSub,
                pem: await getSecret(admin, 'APPLE_SIGNIN_KEY'),
            });
            console.log(`account-delete apple=${out.kind}${'reason' in out ? ` reason=${out.reason}` : ''}`);
            if (out.kind === 'code_invalid') return json({ error: 'apple_code_invalid' }, 400);
            if (out.kind === 'mismatch') return json({ error: 'apple_mismatch' }, 400);
            if (out.kind === 'bad_request') return json({ error: 'apple_bad_request', detail: out.reason }, 400);
            return null;
        };

        const resolved = await resolveOrg(admin, userId, body.orgId ?? null);

        // ── İşletmesiz hesap: yalnız giriş kaydı ────────────────────────────
        if ('error' in resolved && resolved.error === 'no_org') {
            const { data: owned, error: ownedErr } = await admin
                .from('organizations').select('id').eq('owner_id', userId).limit(1);
            if (ownedErr) {
                console.error('owned org lookup failed', ownedErr);
                return json({ error: 'owner_lookup_failed' }, 500);
            }
            if ((owned ?? []).length > 0) return json({ error: 'org_without_membership' }, 409);
            const stop = await appleStep();
            if (stop) return stop;
            const { error: authErr } = await admin.auth.admin.deleteUser(userId);
            if (authErr) {
                console.error('auth user delete failed (no org)', authErr);
                return json({ error: 'auth_delete_failed', orgDeleted: false }, 500);
            }
            return json({ deleted: true, orgDeleted: false }, 200);
        }

        if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
        const { orgId, role } = resolved;

        if (role !== 'owner') return json({ error: 'forbidden_role' }, 403);

        // Apple — yetki tamam, henüz hiçbir şey silinmedi.
        const appleStop = await appleStep();
        if (appleStop) return appleStop;

        // Bu org'un kaç sahibi var? Yıkımın kapsamını BU belirler.
        const { data: owners, error: ownerErr } = await admin
            .from('organization_members')
            .select('user_id')
            .eq('org_id', orgId)
            .eq('role', 'owner');
        if (ownerErr) {
            console.error('owner count failed', ownerErr);
            return json({ error: 'owner_lookup_failed' }, 500);
        }
        const soleOwner = (owners?.length ?? 0) <= 1;

        // ── Tek sahip: önce abonelik, sonra org ─────────────────────────────
        if (soleOwner) {
            const cancelled = await cancelSubscription(admin, orgId);
            if (!cancelled.ok) {
                /*
                 * Abonelik iptal edilemediyse SİLME YAPILMAZ. Silip devam
                 * etmek, kullanıcıdan hizmet vermediğimiz bir şey için para
                 * almaya devam etmek olurdu — ve org gittiği için bunu kimse
                 * fark edemezdi. Kullanıcı isteği tekrarlayabilir.
                 */
                return json({ error: 'subscription_cancel_failed', detail: cancelled.reason }, 502);
            }

            const { error: delErr } = await admin.from('organizations').delete().eq('id', orgId);
            if (delErr) {
                console.error('org delete failed', delErr);
                return json({ error: 'org_delete_failed' }, 500);
            }
        } else {
            // Ortak ayrılıyor: yalnız üyelik gider, işletme durur.
            const { error: memErr } = await admin
                .from('organization_members')
                .delete()
                .eq('org_id', orgId)
                .eq('user_id', userId);
            if (memErr) {
                console.error('membership delete failed', memErr);
                return json({ error: 'membership_delete_failed' }, 500);
            }
        }

        // ── Auth kaydı en son ───────────────────────────────────────────────
        const { error: authErr } = await admin.auth.admin.deleteUser(userId);
        if (authErr) {
            /*
             * Buraya düşülürse veri gitti ama giriş kaydı duruyor. Kullanıcıya
             * "silindi" DENMEZ: giriş yapabildiği sürece silinmiş sayılmaz ve
             * Apple'ın istediği şey tam olarak bu kaydın gitmesi.
             */
            console.error('auth user delete failed', authErr);
            return json({ error: 'auth_delete_failed', orgDeleted: soleOwner }, 500);
        }

        return json({ deleted: true, orgDeleted: soleOwner }, 200);
    } catch (e) {
        console.error('account-delete error', e);
        return json({ error: 'internal' }, 500);
    }
});

/**
 * İşletmenin Dodo aboneliğini ANINDA iptal eder (dönem sonu değil).
 *
 * Aynada abonelik kimliği yoksa başarı sayılır: ödemeyen bir salonun
 * hesabını silememesi için bir sebep yok. Dodo'ya ulaşılamazsa silme DURUR
 * (yukarıda) — kullanıcı yeniden dener; abonelik zaten kapanmışsa
 * (`cancelNow` durumu okur) silme sürer.
 */
async function cancelSubscription(
    admin: ReturnType<typeof createClient>,
    orgId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const { data: ent, error } = await admin
        .from('org_entitlement')
        .select('dodo_subscription_id')
        .eq('organization_id', orgId)
        .maybeSingle();
    if (error) {
        console.error('entitlement lookup failed', error);
        return { ok: false, reason: 'entitlement_lookup_failed' };
    }

    const providerRef = (ent as { dodo_subscription_id?: string | null } | null)?.dodo_subscription_id;
    if (!providerRef) return { ok: true }; // Aboneliği yok — iptal edilecek şey yok.

    const api = await dodoApi(admin);
    if (!api) return { ok: false, reason: 'dodo_not_configured' };
    return await cancelNow(api, providerRef);
}

async function getSecret(supabase: ReturnType<typeof createClient>, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return (data as { value?: string } | null)?.value ?? null;
}

function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
