import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSecret } from '../_shared/wa.ts';
import { resolveOrg } from '../_shared/org.ts';
import {
    hashPin, mintStaffToken, safeEqual, verifyStaffToken,
    DEVICE_TOKEN_TTL_SEC, PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS,
} from '../_shared/staffToken.ts';

/**
 * Dar personel API'si — personel cihazının veriye TEK yolu.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Bugün personel telefonu org SAHİBİNİN Supabase oturumuyla bağlanıyor. Arayüz
 * "kendi randevuların" gösteriyor ama sunucu hiçbir şey daraltmıyor: cihaz
 * teknik olarak tüm müşterileri, tüm tahsilatları ve aylık ciroyu okuyabilir.
 * Üstüne PIN hash'i cihaza iniyor ve karşılaştırma tarayıcıda yapılıyor
 * (StaffLogin: `h === selected.pin`) — 4 haneli PIN çevrimdışı anında kırılır.
 * İşten çıkan personelin erişimi de kesilemiyor.
 *
 * ── Çözüm: cihaz eşleme ──────────────────────────────────────────────────────
 * Kurulumda org sahibi bir kez "bu cihazı personel moduna al" der (device.pair,
 * org oturumu ister). Cihaz uzun ömürlü bir CİHAZ token'ı alır ve org oturumu
 * kapatılır. O andan sonra cihazda Supabase kimliği YOKTUR; elindeki tek şey
 * bu org'un personel listesini görmeye ve PIN denemeye yarayan bir belgedir.
 *
 * Personel PIN girer (session.start) → kısa ömürlü PERSONEL token'ı. Her istek
 * bu token'la gelir; kim olduğu sunucuda çözülür, yetki her seferinde DB'den
 * TAZELENİR (eski token yeni yetkiyi taşımasın).
 *
 * ── Neden gerçek Supabase Auth kullanıcısı değil ─────────────────────────────
 * Her personele Auth kullanıcısı + tüm tabloların RLS'inin yeniden yazımı
 * haftalar sürer ve yedi sektörün tamamını riske atar. Bu yol dar ve geri
 * dönülebilir: ileride gerçek kullanıcıya geçilirse uç sözleşmesi değişmez.
 *
 * Edge runtime'da VERIFY_JWT=false — kimlik kontrolü tamamen burada.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-staff-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'device.pair' | 'roster' | 'session.start' | 'session.refresh' | 'me';

interface StaffRow {
    id: string;
    organization_id: string;
    name: string;
    color: string | null;
    role: string | null;
    is_active: boolean;
    pin: string | null;
    session_epoch: number | null;
    pin_attempts: number | null;
    pin_locked_until: string | null;
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const secret = await getSecret(admin, 'STAFF_TOKEN_SECRET');
        // Sır yoksa zayıf bir varsayılana DÜŞMEYİZ: imzasız kimlik, kimliksizden
        // beterdir — güveniliyormuş gibi görünür.
        if (!secret) {
            console.error('staff-api: STAFF_TOKEN_SECRET tanımsız (082 uygulandı mı?)');
            return json({ error: 'not_configured' }, 503);
        }

        const body = await req.json().catch(() => ({}));
        const action = body.action as Action;
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
        const userAgent = req.headers.get('user-agent')?.slice(0, 200) || null;

        const audit = (organizationId: string, staffId: string | null, event: string) =>
            admin.from('staff_auth_log').insert({
                organization_id: organizationId, staff_id: staffId, event, ip, user_agent: userAgent,
            });

        // ── device.pair — kurulumda BİR kez, org sahibi ──────────────────────
        if (action === 'device.pair') {
            const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
            if (!jwt) return json({ error: 'unauthorized' }, 401);
            const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
            if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

            const resolved = await resolveOrg(admin, userData.user.id, body.orgId ?? null);
            if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
            // Cihaz eşleme yıkıcı bir yetkidir: o cihaz bundan sonra PIN
            // deneyebilir. Personel rolündeki bir üye kendi cihazını
            // yetkilendiremesin.
            if (resolved.role === 'member') return json({ error: 'owner_required' }, 403);

            const token = await mintStaffToken(
                { sub: 'device', org: resolved.orgId, role: 'device', epoch: 0 },
                secret,
                undefined,
                DEVICE_TOKEN_TTL_SEC,
            );
            return json({ ok: true, deviceToken: token, orgId: resolved.orgId });
        }

        // Bundan sonraki tüm uçlar token ister (cihaz ya da personel).
        const raw = req.headers.get('x-staff-token') || body.token || '';
        const verified = await verifyStaffToken(String(raw), secret);
        if (!verified.ok) return json({ error: 'invalid_token', reason: verified.reason }, 401);
        const claims = verified.claims;
        const isDevice = claims.sub === 'device';

        // ── roster — giriş ekranının listesi. PIN ASLA dönmez ────────────────
        if (action === 'roster') {
            if (!isDevice) return json({ error: 'device_token_required' }, 403);
            const { data, error } = await admin
                .from('staff')
                .select('id, name, color, role, pin')
                .eq('organization_id', claims.org)
                .eq('is_active', true)
                .order('name');
            if (error) {
                console.error('staff-api roster error', error);
                return json({ error: 'lookup_failed' }, 500);
            }
            // `hasPin` gönderiyoruz, hash'i DEĞİL. Giriş ekranının bilmesi
            // gereken tek şey o personelin giriş yapabilir olduğu.
            return json({
                ok: true,
                staff: (data || []).map((s: StaffRow) => ({
                    id: s.id, name: s.name, color: s.color, role: s.role, hasPin: Boolean(s.pin),
                })),
            });
        }

        // ── session.start — PIN doğrulama SUNUCUDA ───────────────────────────
        if (action === 'session.start') {
            if (!isDevice) return json({ error: 'device_token_required' }, 403);
            const staffId = String(body.staffId || '');
            const pin = String(body.pin || '');
            if (!staffId || !pin) return json({ error: 'missing_credentials' }, 400);

            const { data, error } = await admin
                .from('staff')
                .select('id, organization_id, name, color, role, is_active, pin, session_epoch, pin_attempts, pin_locked_until')
                .eq('id', staffId)
                .eq('organization_id', claims.org)
                .maybeSingle();
            if (error) {
                console.error('staff-api session.start lookup error', error);
                return json({ error: 'lookup_failed' }, 500);
            }
            const member = data as StaffRow | null;
            // Var olmayan personel ile yanlış PIN AYNI cevabı verir: aksi hâlde
            // uç, kimlerin çalıştığını sızdıran bir sorgu hâline gelir.
            if (!member || !member.is_active || !member.pin) {
                return json({ error: 'invalid_credentials' }, 401);
            }

            const lockedUntil = member.pin_locked_until ? new Date(member.pin_locked_until) : null;
            if (lockedUntil && lockedUntil > new Date()) {
                return json({ error: 'locked', until: member.pin_locked_until }, 429);
            }

            if (!safeEqual(await hashPin(pin), member.pin)) {
                const attempts = (member.pin_attempts || 0) + 1;
                const lock = attempts >= PIN_MAX_ATTEMPTS;
                await admin.from('staff').update({
                    pin_attempts: lock ? 0 : attempts,
                    pin_locked_until: lock
                        ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString()
                        : null,
                }).eq('id', member.id);
                await audit(claims.org, member.id, lock ? 'locked' : 'failed_pin');
                return lock
                    ? json({ error: 'locked', minutes: PIN_LOCK_MINUTES }, 429)
                    : json({ error: 'invalid_credentials', remaining: PIN_MAX_ATTEMPTS - attempts }, 401);
            }

            // Doğru PIN — sayacı sıfırla. `session_epoch` tetikleyicisi yalnız
            // is_active/pin/role değişiminde artar, bu update onu tetiklemez.
            await admin.from('staff').update({
                pin_attempts: 0, pin_locked_until: null, last_login_at: new Date().toISOString(),
            }).eq('id', member.id);
            await audit(claims.org, member.id, 'login');

            const token = await mintStaffToken({
                sub: member.id,
                org: member.organization_id,
                role: member.role || 'staff',
                epoch: member.session_epoch ?? 1,
            }, secret);

            return json({
                ok: true,
                token,
                staff: { id: member.id, name: member.name, color: member.color, role: member.role || 'staff' },
            });
        }

        // ── Buradan sonrası PERSONEL token'ı ister ───────────────────────────
        if (isDevice) return json({ error: 'staff_token_required' }, 403);

        const { data: current, error: currentErr } = await admin
            .from('staff')
            .select('id, organization_id, name, color, role, is_active, session_epoch')
            .eq('id', claims.sub)
            .eq('organization_id', claims.org)
            .maybeSingle();
        if (currentErr) {
            console.error('staff-api staff lookup error', currentErr);
            return json({ error: 'lookup_failed' }, 500);
        }
        const me = current as StaffRow | null;
        // Pasifleştirme ve rol değişimi epoch'u artırır (082 tetikleyicisi) →
        // dağıtılmış token anında ölür. Token listesi tutmaya gerek yok.
        if (!me || !me.is_active) return json({ error: 'revoked' }, 401);
        if ((me.session_epoch ?? 1) !== claims.epoch) return json({ error: 'revoked' }, 401);

        if (action === 'me' || action === 'session.refresh') {
            const fresh = action === 'session.refresh'
                ? await mintStaffToken({
                    sub: me.id, org: me.organization_id, role: me.role || 'staff',
                    epoch: me.session_epoch ?? 1,
                }, secret)
                : undefined;
            return json({
                ok: true,
                ...(fresh ? { token: fresh } : {}),
                // Yetki listesi DEĞİL rol dönüyor: izin haritası tek kaynakta
                // (lib/staffPermissions) yaşıyor ve token onu taşımıyor.
                staff: { id: me.id, name: me.name, color: me.color, role: me.role || 'staff' },
            });
        }

        return json({ error: 'unknown_action' }, 400);
    } catch (err) {
        console.error('staff-api error:', err);
        return json({ error: 'server_error' }, 500);
    }
});
