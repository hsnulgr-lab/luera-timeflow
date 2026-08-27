import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveOrg } from '../_shared/org.ts';

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
 * Abonelik verisi TimeFlow'da değil LUERA Core'da yaşıyor; oraya HTTPS ile
 * gidiliyor (`CORE_SUPABASE_URL` / `CORE_SERVICE_KEY`, app_secrets'ten).
 *
 * `billing_events` bilerek FK'sız: org silinse de LUERA'nın kendi ödeme
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
 */

const MODULE = 'timeflow';

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

        const resolved = await resolveOrg(admin, userId, body.orgId ?? null);
        if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
        const { orgId, role } = resolved;

        if (role !== 'owner') return json({ error: 'forbidden_role' }, 403);

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
 * Core'daki aboneliği bulur ve Dodo'da ANINDA iptal eder.
 *
 * Abonelik hiç yoksa başarı sayılır: ödemeyen bir salonun hesabını silememesi
 * için bir sebep yok. Core yapılandırılmamışsa da başarı — abonelik kapısı
 * henüz açılmadığı kurulumlarda silme bloke edilmemeli.
 */
async function cancelSubscription(
    admin: ReturnType<typeof createClient>,
    orgId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const coreUrl = await getSecret(admin, 'CORE_SUPABASE_URL');
    const coreKey = await getSecret(admin, 'CORE_SERVICE_KEY');
    if (!coreUrl || !coreKey) return { ok: true };

    const core = createClient(coreUrl, coreKey);
    const { data: subs, error } = await core
        .from('subscriptions')
        .select('provider_ref')
        .eq('organization_id', orgId)
        .eq('module_name', MODULE)
        .eq('provider', 'dodo')
        .in('status', ['trial', 'active', 'past_due'])
        .limit(1);
    if (error) {
        console.error('core subscription lookup failed', error);
        return { ok: false, reason: 'core_lookup_failed' };
    }

    const providerRef = subs?.[0]?.provider_ref;
    if (!providerRef) return { ok: true }; // Aboneliği yok — iptal edilecek şey yok.

    const apiKey = await getSecret(admin, 'DODO_API_KEY');
    const apiBase = (await getSecret(admin, 'DODO_API_BASE')) || 'https://test.dodopayments.com';
    if (!apiKey) return { ok: false, reason: 'dodo_not_configured' };

    // Dönem sonunda değil, ŞİMDİ: işletme siliniyor.
    const res = await fetch(`${apiBase}/subscriptions/${providerRef}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('Dodo immediate cancel failed', res.status, detail);
        return { ok: false, reason: 'dodo_cancel_failed' };
    }

    // Core'daki kaydı da kapat: org silinince satır cascade ile gidecek ama
    // Core AYRI bir veritabanı, oradaki cascade TimeFlow'un silmesini görmez.
    await core
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('module_name', MODULE);

    return { ok: true };
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
