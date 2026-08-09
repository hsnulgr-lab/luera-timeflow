import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSecret } from '../_shared/wa.ts';
import { resolveOrg } from '../_shared/org.ts';
import { checkAccess } from '../_shared/entitlement.ts';
import { can, canTouchReservation } from '../_shared/staffPerms.ts';
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

type Action =
    | 'device.pair' | 'roster' | 'session.start' | 'session.refresh' | 'me'
    // ── Kumanda (mobil personel modu) ────────────────────────────────────────
    | 'agenda'         // bugünün kendi randevuları
    | 'visit.start'    // işleme başla
    | 'visit.items'    // adisyon kalemleri (hizmet / malzeme / ekstra)
    | 'visit.finish'   // işlemi bitir → adisyon kasaya düşer
    | 'catalog'        // hizmet + ürün listesi (tek turda)
    | 'customer'       // müşteri kartı
    | 'performance';   // kendi cirosu

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

        // Abonelik kapısı. Personel kumandası ürünün bir parçası; işletmenin
        // aboneliği bittiyse personel tableti de çalışmamalı — aksi hâlde
        // salon panelsiz ama tabletli çalışmaya devam ederdi.
        const staffAccess = await checkAccess(admin, claims.org);
        if (!staffAccess.ok) return json({ error: 'subscription_inactive' }, 403);

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

        // ════════════════════════════════════════════════════════════════════
        // KUMANDA UÇLARI
        // ────────────────────────────────────────────────────────────────────
        // Tasarım: "Luera Mobil - Kumanda.html". Hepsi token'daki staff_id ve
        // org ile sınırlıdır; gövdeden gelen kimliğe ASLA güvenilmez.
        //
        // Yeni tablo AÇILMADI. Ziyaret zaten reservations'ta modellenmiş:
        //   arrived_at        → işleme başlama anı (sayaç bunu okur)
        //   adisyon_items     → sırasında eklenen kalemler (jsonb)
        //   service_ended_at  → personelin bitirdiği an
        //   status=completed & is_paid=false → kasada bekleyen adisyon
        // Masaüstü aynı alanları kullanıyor; ayrı bir "visit" tablosu açmak
        // aynı gerçeğin iki kaydı olurdu ve ikisi bir gün ayrışırdı.
        // ════════════════════════════════════════════════════════════════════

        const RES_COLS = 'id, customer_id, customer_name, customer_phone, date, start_time, end_time, '
            + 'service, service_color, status, staff_id, notes, arrived_at, service_ended_at, '
            + 'adisyon_items, is_paid';

        /** Randevuyu getirir ve bu personelin ona dokunabildiğini doğrular. */
        const loadOwnReservation = async (id: unknown) => {
            if (typeof id !== 'string' || !id) return { err: json({ error: 'reservation_required' }, 400) };
            const { data } = await admin.from('reservations').select(RES_COLS)
                .eq('id', id).eq('organization_id', me.organization_id).maybeSingle();
            if (!data) return { err: json({ error: 'not_found' }, 404) };
            if (!canTouchReservation(me.role, me.id, data.staff_id)) {
                await audit(me.organization_id, me.id, 'visit.forbidden');
                return { err: json({ error: 'forbidden' }, 403) };
            }
            return { res: data };
        };

        if (action === 'agenda') {
            // Gün, istemciden gelir ama biçimi doğrulanır: serbest metin
            // sorguya girmemeli.
            const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
                ? body.date
                : new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

            let q = admin.from('reservations').select(RES_COLS)
                .eq('organization_id', me.organization_id)
                .eq('date', date)
                .neq('status', 'cancelled')
                .order('start_time');
            // Kendi randevusu kuralı SORGUDA uygulanır; filtreyi arayüze
            // bırakmak, isteği elle atan birine tüm salonu açardı.
            if (!can(me.role, 'appointments:view-all')) q = q.eq('staff_id', me.id);

            const { data, error } = await q;
            if (error) { console.error('agenda', error); return json({ error: 'lookup_failed' }, 500); }
            return json({ ok: true, date, appointments: data ?? [] });
        }

        if (action === 'visit.start') {
            const { res, err } = await loadOwnReservation(body.reservationId);
            if (err) return err;
            if (res!.status === 'completed') return json({ error: 'already_finished' }, 409);
            // İkinci kez başlatmak sayacı sıfırlar — bu bir hata değil, veri
            // kaybı. Zaten başlamışsa mevcut damgayı KORU.
            const patch: Record<string, unknown> = {};
            if (!res!.arrived_at) patch.arrived_at = new Date().toISOString();
            if (res!.status === 'pending') patch.status = 'confirmed';
            if (Object.keys(patch).length > 0) {
                const { error } = await admin.from('reservations').update(patch).eq('id', res!.id);
                if (error) { console.error('visit.start', error); return json({ error: 'write_failed' }, 500); }
            }
            await audit(me.organization_id, me.id, 'visit.start');
            return json({ ok: true, reservation: { ...res, ...patch } });
        }

        if (action === 'visit.items') {
            const { res, err } = await loadOwnReservation(body.reservationId);
            if (err) return err;
            if (res!.status === 'completed') return json({ error: 'already_finished' }, 409);
            // Kalemler sunucuda TEMİZLENİR: fiyat sayı mı, ad var mı, tür
            // geçerli mi. İstemciden gelen jsonb'yi olduğu gibi yazmak,
            // adisyona keyfi alan sokabilmek demekti.
            const raw = Array.isArray(body.items) ? body.items : null;
            if (!raw) return json({ error: 'items_required' }, 400);
            if (raw.length > 40) return json({ error: 'too_many_items' }, 400);
            const items = raw.map((it: Record<string, unknown>) => ({
                id: String(it?.id ?? crypto.randomUUID()).slice(0, 64),
                name: String(it?.name ?? '').trim().slice(0, 120) || 'Kalem',
                price: Math.max(0, Math.round(Number(it?.price) || 0)),
                kind: it?.kind === 'product' ? 'product' : 'extra',
                ...(typeof it?.productId === 'string' ? { productId: it.productId } : {}),
                ...(Number(it?.qty) > 1 ? { qty: Math.min(99, Math.round(Number(it.qty))) } : {}),
            }));
            const { error } = await admin.from('reservations')
                .update({ adisyon_items: items }).eq('id', res!.id);
            if (error) { console.error('visit.items', error); return json({ error: 'write_failed' }, 500); }
            return json({ ok: true, items });
        }

        if (action === 'visit.finish') {
            const { res, err } = await loadOwnReservation(body.reservationId);
            if (err) return err;
            // Aynı isteğin iki kez gelmesi (kötü sinyalde kuyruk tekrarı)
            // HATA DEĞİL: zaten bitmişse aynı cevabı dön. Idempotency.
            if (res!.status === 'completed') {
                return json({ ok: true, alreadyFinished: true, reservation: res });
            }
            const now = new Date().toISOString();
            const { error } = await admin.from('reservations')
                .update({ status: 'completed', service_ended_at: now, ...(res!.arrived_at ? {} : { arrived_at: now }) })
                .eq('id', res!.id).neq('status', 'completed');
            if (error) { console.error('visit.finish', error); return json({ error: 'write_failed' }, 500); }

            // Stok düşümü BURADA, kalem eklenirken değil: kalemler işlem
            // sırasında ekleniyor ve çıkarılıyor; her dokunuşta stok oynatmak
            // ambarı personelin fikir değişikliğine bağlardı.
            const items = Array.isArray(res!.adisyon_items) ? res!.adisyon_items : [];
            const used = items.filter((i: Record<string, unknown>) => i?.kind === 'product' && i?.productId);
            if (used.length > 0) {
                const rows = used.map((i: Record<string, unknown>) => ({
                    organization_id: me.organization_id,
                    product_id: i.productId,
                    delta: -(Number(i.qty) || 1),
                    reason: 'hizmet',
                    reservation_id: res!.id,
                    note: `${me.name} · ${res!.service}`,
                }));
                // Stok yazımı başarısız olursa işlem GERİ ALINMAZ: hizmet
                // gerçekten yapıldı, adisyon kasaya gitmeli. Sayım hatası
                // düzeltilebilir, kaybolan adisyon düzeltilemez.
                const { error: stockErr } = await admin.from('stock_movements').insert(rows);
                if (stockErr) console.error('visit.finish stok', stockErr);
            }

            const total = items.reduce((s: number, i: Record<string, unknown>) =>
                s + (Number(i?.price) || 0) * (Number(i?.qty) || 1), 0);
            await audit(me.organization_id, me.id, 'visit.finish');
            return json({ ok: true, total, itemCount: items.length, endedAt: now });
        }

        if (action === 'catalog') {
            // Hizmet ve ürün TEK turda: kötü sinyalde iki ayrı istek, ikisinden
            // birinin düşmesi demek. Kumanda sık sık bodrum katında açılıyor.
            const [{ data: services }, { data: products }] = await Promise.all([
                admin.from('services').select('id, name, duration, price, color')
                    .eq('organization_id', me.organization_id).order('name'),
                admin.from('products').select('id, name, price, unit, kind, tracks_stock')
                    .eq('organization_id', me.organization_id).eq('is_active', true).order('name'),
            ]);
            return json({ ok: true, services: services ?? [], products: products ?? [] });
        }

        if (action === 'customer') {
            if (!can(me.role, 'patients:view')) return json({ error: 'forbidden' }, 403);
            const cid = typeof body.customerId === 'string' ? body.customerId : '';
            if (!cid) return json({ error: 'customer_required' }, 400);
            const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
            const [{ data: c }, { data: past }, { data: packs }, { data: rules }] = await Promise.all([
                // Risk bayrakları AYRI bir kolonda değil, custom_fields
                // içinde yaşıyor (076); kuralların kendisi settings.risk_rules'ta.
                // İkisini de dönüyoruz, eşlemeyi istemci yapıyor — kural
                // motorunu iki yerde çalıştırmak ikisinin ayrışması demekti.
                admin.from('customers').select('id, name, phone, notes, custom_fields')
                    .eq('organization_id', me.organization_id).eq('id', cid).maybeSingle(),
                admin.from('reservations').select('id, date, service, status')
                    .eq('organization_id', me.organization_id).eq('customer_id', cid)
                    .lt('date', today).order('date', { ascending: false }).limit(10),
                admin.from('customer_packages').select('id, name, total_sessions, used_sessions')
                    .eq('organization_id', me.organization_id).eq('customer_id', cid),
                admin.from('settings').select('risk_rules')
                    .eq('organization_id', me.organization_id).limit(1).maybeSingle(),
            ]);
            if (!c) return json({ error: 'not_found' }, 404);
            // Tahsilat ve borç BİLİNÇLİ olarak dönmüyor: kumandanın işi hizmet,
            // finans değil. Kasa yetkisi olan personel masaüstünü kullanır.
            return json({
                ok: true, customer: c, history: past ?? [], packages: packs ?? [],
                riskRules: rules?.risk_rules ?? [],
            });
        }

        if (action === 'performance') {
            // Personelin kendi cirosunu görmesi AYARLANABİLİR: bazı işletme
            // sahipleri personeller arası kıyas istemiyor. Kapalıysa uç 403
            // döner ve arayüz sekmeyi hiç göstermez.
            const { data: st } = await admin.from('settings')
                .select('staff_can_see_revenue')
                .eq('organization_id', me.organization_id).limit(1).maybeSingle();
            if (st?.staff_can_see_revenue !== true) return json({ error: 'disabled' }, 403);

            const now = new Date(Date.now() + 3 * 3600_000);
            const today = now.toISOString().slice(0, 10);
            const weekAgo = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
            const { data: done } = await admin.from('reservations')
                .select('date, service, adisyon_items')
                .eq('organization_id', me.organization_id).eq('staff_id', me.id)
                .eq('status', 'completed').gte('date', weekAgo).lte('date', today);

            const rows = done ?? [];
            const sumOf = (r: Record<string, unknown>) => {
                const items = Array.isArray(r.adisyon_items) ? r.adisyon_items : [];
                return items.reduce((s: number, i: Record<string, unknown>) =>
                    s + (Number(i?.price) || 0) * (Number(i?.qty) || 1), 0);
            };
            const todayRows = rows.filter((r) => r.date === today);
            return json({
                ok: true,
                today: { count: todayRows.length, total: todayRows.reduce((s, r) => s + sumOf(r), 0) },
                week: { count: rows.length, total: rows.reduce((s, r) => s + sumOf(r), 0) },
            });
        }

        return json({ error: 'unknown_action' }, 400);
    } catch (err) {
        console.error('staff-api error:', err);
        return json({ error: 'server_error' }, 500);
    }
});
