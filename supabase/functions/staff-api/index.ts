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
    | 'device.pair' | 'device.code.create' | 'device.code.redeem'
    | 'roster' | 'session.start' | 'session.refresh' | 'me'
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

interface CatalogProductRow {
    id: string;
    name: string;
    price: number | string | null;
    kind: 'retail' | 'consumable' | string;
    tracks_stock: boolean | null;
}

interface CatalogServiceRow {
    id: string;
    name: string;
    price: number | string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function catalogPrice(value: unknown): number {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0;
}

/** Altı hane: telefonda okunup yazılabilecek en uzun makul dizi. */
const PAIR_CODE_LENGTH = 6;
/** On dakika: sahip kodu söyleyip personel yazana kadar yeter, fazlası pencere açar. */
const PAIR_CODE_TTL_MINUTES = 10;
/** Bir milyon kombinasyona karşı IP başına deneme sınırı. */
const PAIR_MAX_ATTEMPTS = 10;
const PAIR_LOCK_MINUTES = 15;

type Admin = ReturnType<typeof createClient>;

/**
 * Eşleştirme kodu üretir. Kod açık DÖNER ama açık SAKLANMAZ — veritabanında
 * yalnız SHA-256'sı var.
 *
 * `crypto.getRandomValues` ile üretiliyor: `Math.random` tahmin edilebilir ve
 * altı hanelik bir uzayda bu tek başına kırılma sebebidir. Modulo sapmasından
 * kaçınmak için 32 bit değer aralık dışına düşerse yeniden çekilir.
 */
async function issuePairCode(
    admin: Admin,
    orgId: string,
    staffId: string | null,
    createdBy: string,
): Promise<{ code: string; expiresAt: string } | null> {
    const span = 10 ** PAIR_CODE_LENGTH;
    const limit = Math.floor(0xffffffff / span) * span;

    // Aynı anda açık duran bir kodla çakışma olasılığı düşük ama sıfır değil;
    // benzersiz kısmi indeks çakışmayı yazmaya bırakmadan reddeder.
    for (let attempt = 0; attempt < 5; attempt++) {
        const buf = new Uint32Array(1);
        do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
        const code = String(buf[0] % span).padStart(PAIR_CODE_LENGTH, '0');
        const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MINUTES * 60_000).toISOString();

        const { error } = await admin.from('staff_device_codes').insert({
            organization_id: orgId,
            staff_id: staffId,
            code_hash: await hashPin(code),
            expires_at: expiresAt,
            created_by: createdBy,
        });
        if (!error) return { code, expiresAt };
    }
    return null;
}

/** Kilit açıksa kalan süreyi bildirir; kilit yoksa null. */
async function pairAttemptLock(admin: Admin, ip: string | null): Promise<boolean> {
    if (!ip) return false;
    const { data } = await admin
        .from('staff_pair_attempts')
        .select('locked_until')
        .eq('ip', ip)
        .maybeSingle();
    return Boolean(data?.locked_until && new Date(data.locked_until) > new Date());
}

async function failedPairAttempt(admin: Admin, ip: string | null): Promise<void> {
    if (!ip) return;
    const { data } = await admin
        .from('staff_pair_attempts')
        .select('failures')
        .eq('ip', ip)
        .maybeSingle();

    const failures = (Number(data?.failures) || 0) + 1;
    const locked = failures >= PAIR_MAX_ATTEMPTS;
    await admin.from('staff_pair_attempts').upsert({
        ip,
        failures: locked ? 0 : failures,
        locked_until: locked
            ? new Date(Date.now() + PAIR_LOCK_MINUTES * 60_000).toISOString()
            : null,
        updated_at: new Date().toISOString(),
    });
}

async function clearPairAttempts(admin: Admin, ip: string | null): Promise<void> {
    if (!ip) return;
    await admin.from('staff_pair_attempts').delete().eq('ip', ip);
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

        // ── device.code.create — sahip, personele özel eşleştirme kodu üretir ─
        // device.pair ortak tablet içindir: sahibi cihazın başına geçer. Kişisel
        // telefonda bu işlemez — sahibin beş personelin telefonunda tek tek
        // oturum açması, şifresini beş kişinin yanında girmesi demek. Kod bu
        // boşluğu kapatıyor: sahip kendi bilgisayarında üretir, personel yazar.
        if (action === 'device.code.create') {
            const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
            if (!jwt) return json({ error: 'unauthorized' }, 401);
            const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
            if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

            const resolved = await resolveOrg(admin, userData.user.id, body.orgId ?? null);
            if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
            // device.pair ile aynı kapı: kod üretmek, cihaz yetkilendirmenin
            // uzaktan hâlidir. Personel kendine kod üretemesin.
            if (resolved.role === 'member') return json({ error: 'owner_required' }, 403);

            // Kod bir personele bağlanabilir (kişisel telefon: "kendini seç"
            // adımı düşer, kadro listesi telefona hiç inmez) ya da yalnız
            // işletmeye (ortak tablet). İkincisinde staffId gelmez.
            const staffId = body.staffId ? String(body.staffId) : null;
            if (staffId && !UUID_RE.test(staffId)) return json({ error: 'invalid_staff' }, 400);
            if (staffId) {
                const { data: member } = await admin
                    .from('staff')
                    .select('id, is_active')
                    .eq('id', staffId)
                    .eq('organization_id', resolved.orgId)
                    .maybeSingle();
                if (!member || !member.is_active) return json({ error: 'invalid_staff' }, 400);
            }

            const code = await issuePairCode(admin, resolved.orgId, staffId, userData.user.id);
            if (!code) return json({ error: 'code_unavailable' }, 503);

            await audit(resolved.orgId, staffId, 'pair_code_created');
            // Kod TEK BU CEVAPTA açık geçer; veritabanında yalnız hash'i var.
            // Sahip okuyamazsa yeniden üretir — saklamaktan iyidir.
            return json({
                ok: true,
                code: code.code,
                expiresAt: code.expiresAt,
                expiresInMinutes: PAIR_CODE_TTL_MINUTES,
            });
        }

        // ── device.code.redeem — personel kodu cihaz token'ına çevirir ────────
        if (action === 'device.code.redeem') {
            const lock = await pairAttemptLock(admin, ip);
            if (lock) return json({ error: 'pair_locked', minutes: PAIR_LOCK_MINUTES }, 429);

            const digits = String(body.code ?? '').replace(/\D/g, '');
            if (digits.length !== PAIR_CODE_LENGTH) {
                await failedPairAttempt(admin, ip);
                return json({ error: 'invalid_pair_code' }, 401);
            }

            const { data: row } = await admin
                .from('staff_device_codes')
                .select('id, organization_id, staff_id, expires_at, used_at')
                .eq('code_hash', await hashPin(digits))
                .is('used_at', null)
                .maybeSingle();

            if (!row) {
                await failedPairAttempt(admin, ip);
                return json({ error: 'invalid_pair_code' }, 401);
            }

            // Süresi dolmuş kod YANLIŞ kod değildir: kullanıcı doğru yazdı, kod
            // eskidi. Çözümü de başka — yenisini işletme sahibi üretecek. Aynı
            // hatayı vermek onu aynı kodu tekrar yazmaya iterdi.
            if (new Date(row.expires_at) <= new Date()) {
                return json({ error: 'expired_pair_code' }, 401);
            }

            const access = await checkAccess(admin, row.organization_id);
            if (!access.ok) return json({ error: 'subscription_inactive' }, 403);

            // Tek kullanımlık: koşullu güncelleme yarışı da çözüyor. İki telefon
            // aynı kodu aynı anda yazarsa yalnız biri satırı işaretleyebilir.
            const { data: claimed } = await admin
                .from('staff_device_codes')
                .update({ used_at: new Date().toISOString(), used_ip: ip })
                .eq('id', row.id)
                .is('used_at', null)
                .select('id')
                .maybeSingle();
            if (!claimed) {
                await failedPairAttempt(admin, ip);
                return json({ error: 'invalid_pair_code' }, 401);
            }

            await clearPairAttempts(admin, ip);
            const token = await mintStaffToken(
                { sub: 'device', org: row.organization_id, role: 'device', epoch: 0 },
                secret,
                undefined,
                DEVICE_TOKEN_TTL_SEC,
            );
            await audit(row.organization_id, row.staff_id, 'paired');

            // staffId dönüyorsa arayüz "kendini seç" adımını atlar.
            return json({
                ok: true,
                deviceToken: token,
                orgId: row.organization_id,
                staffId: row.staff_id,
            });
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

        // `customer_arrived_at` (043) ile `arrived_at` AYNI ŞEY DEĞİL: ilki
        // müşterinin salona geldiği an (resepsiyon basar), ikincisi hizmetin
        // başladığı an (personel basar). İkisi ayrılmadan personel kartı
        // "kapıda bekliyor" ile "işlem sürüyor"u ayıramaz.
        const RES_COLS = 'id, customer_id, customer_name, customer_phone, date, start_time, end_time, '
            + 'service, service_color, status, staff_id, notes, customer_arrived_at, arrived_at, '
            + 'service_ended_at, adisyon_items, is_paid, formula';

        /** Randevuyu getirir ve bu personelin ona dokunabildiğini doğrular. */
        const loadOwnReservation = async (id: unknown) => {
            if (typeof id !== 'string' || !id) return { err: json({ error: 'reservation_required' }, 400) };
            const { data, error } = await admin.from('reservations').select(RES_COLS)
                .eq('id', id).eq('organization_id', me.organization_id).maybeSingle();
            if (error) {
                console.error('visit reservation lookup', error);
                return { err: json({ error: 'lookup_failed' }, 500) };
            }
            if (!data) return { err: json({ error: 'not_found' }, 404) };
            if (!canTouchReservation(me.role, me.id, data.staff_id)) {
                await audit(me.organization_id, me.id, 'visit.forbidden');
                return { err: json({ error: 'forbidden' }, 403) };
            }
            if (data.status === 'cancelled') {
                return { err: json({ error: 'reservation_cancelled' }, 409) };
            }
            return { res: data };
        };

        /**
         * İşlemde tüketilen malzemeleri stok defteriyle uzlaştırır.
         *
         * Adisyon bitmiş olsa bile bu yardımcı tekrar çalışır: durum update'i
         * başarılı olup stok yazımı kesildiyse, sonraki idempotent finish çağrısı
         * eksik hareketi tamamlar. `material` ile `product` bilinçli olarak ayrı:
         * material hizmette tüketilir (usage), product kasada satılır (sale).
         */
        const reconcileUsageStock = async (reservation: Record<string, unknown>) => {
            const stored = Array.isArray(reservation.adisyon_items) ? reservation.adisyon_items : [];
            const candidates = new Map<string, { qty: number; requestedKind: string }>();

            for (const line of stored as Record<string, unknown>[]) {
                // `product` burada yalnız geriye uyumluluk içindir. Katalog
                // consumable diyorsa material'a yükseltilir; retail ürünler
                // kasada sale olarak düşeceği için usage'a girmez.
                if (line?.kind !== 'material' && line?.kind !== 'product') continue;
                const productId = typeof line.productId === 'string' ? line.productId : '';
                const qty = Number(line.qty ?? 1);
                if (!UUID_RE.test(productId) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
                    // Eski masaüstü/mobil adisyonları satış ürününü productId
                    // olmadan saklayabiliyordu. Bunun sarf olduğunu güvenle
                    // söyleyemeyiz; usage üretmeden atlamak eski davranıştır.
                    // Canonical material ise kimliksiz bırakılamaz.
                    if (line.kind === 'product') continue;
                    console.error('visit.finish stok: geçersiz ürün/malzeme satırı', { reservationId: reservation.id });
                    return { ok: false as const, warning: 'stock_write_failed', appliedCount: 0 };
                }
                const current = candidates.get(productId);
                candidates.set(productId, {
                    qty: (current?.qty || 0) + qty,
                    requestedKind: line.kind === 'material' || current?.requestedKind === 'material'
                        ? 'material'
                        : 'product',
                });
            }

            const productIds = [...candidates.keys()];
            if (productIds.length === 0) return { ok: true as const, appliedCount: 0 };

            const { data: products, error: productErr } = await admin.from('products')
                .select('id, kind, tracks_stock')
                .eq('organization_id', me.organization_id)
                .in('id', productIds);
            if (productErr) {
                console.error('visit.finish stok katalog', productErr);
                return { ok: false as const, warning: 'stock_write_failed', appliedCount: 0 };
            }
            const productById = new Map((products || []).map((p: CatalogProductRow) => [p.id, p]));
            const usage = new Map<string, number>();
            for (const [productId, candidate] of candidates) {
                const product = productById.get(productId);
                if (!product) {
                    // Silinmiş/eski kimlikli bir legacy satış ürünü usage
                    // üretmez. Material kaybıysa stok uyarısı görünür olmalı.
                    if (candidate.requestedKind === 'product') continue;
                    console.error('visit.finish stok: organizasyon kataloğunda ürün yok', { reservationId: reservation.id });
                    return { ok: false as const, warning: 'stock_write_failed', appliedCount: 0 };
                }
                if (product.kind === 'consumable' && product.tracks_stock !== false) {
                    usage.set(productId, candidate.qty);
                    continue;
                }
                if (candidate.requestedKind === 'material') {
                    console.error('visit.finish stok: material satırı sarf kataloğuyla eşleşmiyor', {
                        reservationId: reservation.id, productId,
                    });
                    return { ok: false as const, warning: 'stock_write_failed', appliedCount: 0 };
                }
            }
            if (usage.size === 0) return { ok: true as const, appliedCount: 0 };

            const usageProductIds = [...usage.keys()];

            const reservationId = String(reservation.id || '');
            const { data: existing, error: existingErr } = await admin.from('stock_movements')
                .select('product_id, delta')
                .eq('organization_id', me.organization_id)
                .eq('reservation_id', reservationId)
                .eq('type', 'usage')
                .in('product_id', usageProductIds);
            if (existingErr) {
                console.error('visit.finish stok mevcut hareket', existingErr);
                return { ok: false as const, warning: 'stock_write_failed', appliedCount: 0 };
            }

            const existingByProduct = new Map<string, number>();
            for (const movement of existing || []) {
                if (existingByProduct.has(movement.product_id)) {
                    console.error('visit.finish stok: aynı rezervasyon/ürün için birden çok usage');
                    return { ok: false as const, warning: 'stock_write_failed', appliedCount: 0 };
                }
                existingByProduct.set(movement.product_id, Number(movement.delta));
            }

            let appliedCount = 0;
            for (const [productId, qty] of usage) {
                const expectedDelta = -qty;
                if (existingByProduct.has(productId)) {
                    if (existingByProduct.get(productId) !== expectedDelta) {
                        console.error('visit.finish stok: mevcut kullanım miktarı adisyonla uyuşmuyor', {
                            reservationId, productId,
                        });
                        return { ok: false as const, warning: 'stock_write_failed', appliedCount };
                    }
                    continue;
                }

                const { error: stockErr } = await admin.from('stock_movements').insert({
                    organization_id: me.organization_id,
                    product_id: productId,
                    type: 'usage',
                    delta: expectedDelta,
                    reservation_id: reservationId,
                    note: `${me.name} · ${String(reservation.service || 'Hizmet')}`,
                });
                if (!stockErr) {
                    appliedCount += 1;
                    continue;
                }

                // Eşzamanlı ikinci finish aynı kısmi tekil indekse çarpar. Bu
                // yalnız beklenen satır gerçekten yazıldıysa başarı sayılır.
                if (stockErr.code === '23505') {
                    const { data: raced, error: racedErr } = await admin.from('stock_movements')
                        .select('delta')
                        .eq('organization_id', me.organization_id)
                        .eq('reservation_id', reservationId)
                        .eq('product_id', productId)
                        .eq('type', 'usage')
                        .maybeSingle();
                    if (!racedErr && raced && Number(raced.delta) === expectedDelta) continue;
                }

                console.error('visit.finish stok', stockErr);
                return { ok: false as const, warning: 'stock_write_failed', appliedCount };
            }

            return { ok: true as const, appliedCount };
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

        if (action === 'calendar') {
            // Personel SALONUN TAMAMINI görür ama yalnız BAKAR.
            //
            // `agenda`dan ayrı bir uç olmasının sebebi bu: agenda personelin
            // kendi günü, üstünde işlem yapılan veri. Bu ise salonun günü —
            // okuma amaçlı, dar kolonlu, ve yazma uçlarına girdi olamaz.
            // Aynı ucu iki işe koşmak, "kendi randevusu" kuralının bir gün
            // yanlışlıkla gevşetilmesi demekti.
            //
            // KOLONLAR DAR. Ad ve hizmet dönüyor (işletmenin kararı: salon
            // şeffaf), ama TELEFON, NOT, ADİSYON ve TAHSİLAT DÖNMÜYOR. Bunlar
            // takvim verisi değil; telefon listesi ise ayrılan personelin
            // cebinde götürebileceği en değerli şey.
            const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
                ? body.date
                : new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

            const CAL_COLS = 'id, customer_name, date, start_time, end_time, '
                + 'service, service_color, status, staff_id, arrived_at, service_ended_at';

            const [{ data: rows, error }, { data: crew }] = await Promise.all([
                admin.from('reservations').select(CAL_COLS)
                    .eq('organization_id', me.organization_id)
                    .eq('date', date)
                    .neq('status', 'cancelled')
                    .order('start_time'),
                admin.from('staff').select('id, name, color')
                    .eq('organization_id', me.organization_id)
                    .eq('is_active', true)
                    .order('name'),
            ]);
            if (error) { console.error('calendar', error); return json({ error: 'lookup_failed' }, 500); }

            // `mine` istemcinin işini kolaylaştırmak için değil, İKİ DÜNYAYI
            // AYIRMAK için: kendi randevusuna dokunmak kumandayı açar,
            // meslektaşınınki yalnız görüntülenir.
            return json({
                ok: true,
                date,
                staff: crew ?? [],
                appointments: (rows ?? []).map((r: Record<string, unknown>) => ({
                    ...r, mine: r.staff_id === me.id,
                })),
                readOnly: true,
            });
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
                let update = admin.from('reservations').update(patch)
                    .eq('id', res!.id)
                    .eq('organization_id', me.organization_id)
                    .neq('status', 'cancelled')
                    .neq('status', 'completed');
                // İki telefon/çift dokunuş aynı anda başlatırsa yalnız ilk damga
                // yazılır; ikinci istek aşağıda güncel satırı yeniden okur.
                if (!res!.arrived_at) update = update.is('arrived_at', null);
                const { data: updated, error } = await update.select(RES_COLS).maybeSingle();
                if (error) { console.error('visit.start', error); return json({ error: 'write_failed' }, 500); }
                if (!updated) {
                    const latest = await loadOwnReservation(res!.id);
                    if (latest.err) return latest.err;
                    if (latest.res!.status === 'completed') return json({ error: 'already_finished' }, 409);
                    await audit(me.organization_id, me.id, 'visit.start');
                    return json({ ok: true, reservation: latest.res });
                }
                await audit(me.organization_id, me.id, 'visit.start');
                return json({ ok: true, reservation: updated });
            }
            await audit(me.organization_id, me.id, 'visit.start');
            return json({ ok: true, reservation: { ...res, ...patch } });
        }

        if (action === 'visit.items') {
            const { res, err } = await loadOwnReservation(body.reservationId);
            if (err) return err;
            if (res!.status === 'completed') return json({ error: 'already_finished' }, 409);
            // Telefon yalnız KATALOG KİMLİĞİ ve miktar söyler. Adı/fiyatı
            // sunucu organizasyon kataloğundan çözer; aksi hâlde elle atılan
            // bir istek kasadaki toplamı değiştirebilirdi.
            const raw = Array.isArray(body.items) ? body.items : null;
            if (!raw) return json({ error: 'items_required' }, 400);
            if (raw.length > 40) return json({ error: 'too_many_items' }, 400);

            const requested = raw as Record<string, unknown>[];
            const productIds: string[] = [];
            const serviceIds: string[] = [];
            const seen = new Set<string>();
            for (const line of requested) {
                const kind = line?.kind;
                const catalogId = kind === 'extra' ? line?.serviceId : line?.productId;
                if ((kind !== 'product' && kind !== 'material' && kind !== 'extra')
                    || typeof catalogId !== 'string' || !UUID_RE.test(catalogId)) {
                    return json({ error: 'invalid_catalog_item' }, 400);
                }
                const key = kind === 'extra' ? `service:${catalogId}` : `product:${catalogId}`;
                if (seen.has(key)) return json({ error: 'duplicate_catalog_item' }, 400);
                seen.add(key);
                if (kind === 'extra') serviceIds.push(catalogId);
                else productIds.push(catalogId);
            }

            let productRows: CatalogProductRow[] = [];
            if (productIds.length > 0) {
                const { data, error } = await admin.from('products')
                    .select('id, name, price, kind, tracks_stock')
                    .eq('organization_id', me.organization_id)
                    .eq('is_active', true)
                    .in('id', productIds);
                if (error) { console.error('visit.items products', error); return json({ error: 'lookup_failed' }, 500); }
                productRows = (data || []) as CatalogProductRow[];
            }

            let serviceRows: CatalogServiceRow[] = [];
            if (serviceIds.length > 0) {
                const { data, error } = await admin.from('services')
                    .select('id, name, price')
                    .eq('organization_id', me.organization_id)
                    .in('id', serviceIds);
                if (error) { console.error('visit.items services', error); return json({ error: 'lookup_failed' }, 500); }
                serviceRows = (data || []) as CatalogServiceRow[];
            }

            const productById = new Map(productRows.map((row) => [row.id, row]));
            const serviceById = new Map(serviceRows.map((row) => [row.id, row]));
            const items: Record<string, unknown>[] = [];
            for (const line of requested) {
                if (line.kind === 'extra') {
                    const serviceId = String(line.serviceId);
                    const service = serviceById.get(serviceId);
                    const qty = Number(line.qty ?? 1);
                    if (!service || qty !== 1) return json({ error: 'invalid_catalog_item' }, 400);
                    items.push({
                        id: `service:${service.id}`,
                        name: service.name,
                        price: catalogPrice(service.price),
                        kind: 'extra',
                        serviceId: service.id,
                    });
                    continue;
                }

                const productId = String(line.productId);
                const product = productById.get(productId);
                const qty = Number(line.qty ?? 1);
                if (!product || !Number.isInteger(qty) || qty < 1 || qty > 99) {
                    return json({ error: 'invalid_catalog_item' }, 400);
                }
                // Eski istemciler sarfı da `product` diye gönderiyordu. Türü
                // telefondan değil katalogdaki product.kind'dan türetmek hem
                // güvenli hem de dağıtım geçişinde geriye uyumludur.
                if (product.kind === 'consumable') {
                    if (product.tracks_stock === false) {
                        return json({ error: 'invalid_catalog_item' }, 400);
                    }
                    items.push({
                        id: `material:${product.id}`,
                        name: product.name,
                        price: 0,
                        kind: 'material',
                        productId: product.id,
                        ...(qty > 1 ? { qty } : {}),
                    });
                } else {
                    // Satılan ürün kasa aşamasında `sale` olarak stoktan düşer;
                    // visit.finish onu `usage` saymaz. Masaüstü adisyon modeli
                    // henüz qty-aware olmadığı için satış satırı tek adettir.
                    if (line.kind !== 'product' || product.kind !== 'retail' || qty !== 1) {
                        return json({ error: 'invalid_catalog_item' }, 400);
                    }
                    items.push({
                        id: `product:${product.id}`,
                        name: product.name,
                        price: catalogPrice(product.price),
                        kind: 'product',
                        productId: product.id,
                    });
                }
            }

            const { data: updated, error } = await admin.from('reservations')
                .update({ adisyon_items: items })
                .eq('id', res!.id)
                .eq('organization_id', me.organization_id)
                .neq('status', 'cancelled')
                .neq('status', 'completed')
                .select('id, status')
                .maybeSingle();
            if (error) { console.error('visit.items', error); return json({ error: 'write_failed' }, 500); }
            if (!updated) {
                const latest = await loadOwnReservation(res!.id);
                if (latest.err) return latest.err;
                if (latest.res!.status === 'completed') return json({ error: 'already_finished' }, 409);
                return json({ error: 'state_conflict' }, 409);
            }
            return json({ ok: true, items });
        }

        if (action === 'visit.formula') {
            // Ziyaretin renk formülü — Personel 08.
            //
            // KİLİT VERİDEN: adisyon kasaya gittiyse (is_paid ya da
            // completed) formül artık okunur. Ayrı bir "kilitli" bayrağı
            // saklamıyoruz; saklanan bayrak bir gün gerçekle ayrışır.
            //
            // ZORUNLU DEĞİL: boş alanlarla da kaydediliyor. Uydurulmuş
            // formül formülsüzlükten kötüdür; eksiklik kartta GÖRÜNEN bir
            // gap olarak duruyor, engelleyen bir uyarı olarak değil.
            const { res, err } = await loadOwnReservation(body.reservationId);
            if (err) return err;
            if (res!.is_paid === true || res!.status === 'completed') {
                return json({ error: 'formula_locked' }, 409);
            }

            const body_ = body as Record<string, unknown>;
            const RATIOS = ['1:1', '1:1,5', '1:2'];
            const RESULTS = ['tuttu', 'açık kaldı', 'koyu çıktı'];
            const str = (v: unknown, max: number) =>
                typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

            const ratio = str(body_.ratio, 12);
            const result = str(body_.result, 24);
            // Serbest oran ± adımından gelebilir; listedekiler dışındakiler de
            // meşru ama biçim doğrulanıyor — serbest metin kayda girmemeli.
            if (ratio && !RATIOS.includes(ratio) && !/^\d{1,2}:\d{1,2}([.,]\d)?$/.test(ratio)) {
                return json({ error: 'bad_ratio' }, 400);
            }
            if (result && !RESULTS.includes(result.toLocaleLowerCase('tr-TR'))) {
                return json({ error: 'bad_result' }, 400);
            }

            const waitRaw = body_.waitMinutes;
            const waitMinutes = typeof waitRaw === 'number' && Number.isFinite(waitRaw)
                ? Math.max(0, Math.min(600, Math.round(waitRaw)))
                : null;

            // Malzeme YARISI adisyondan türüyor, istemciden değil: istemcinin
            // gönderdiği listeye güvenmek, adisyonla formülün ayrışması demek.
            const items = Array.isArray(res!.adisyon_items) ? res!.adisyon_items : [];
            const materials = (items as Record<string, unknown>[])
                .filter((item) => item?.kind === 'material')
                .map((item) => ({
                    id: item.productId ?? item.id ?? null,
                    name: item.name ?? '',
                    qty: typeof item.qty === 'number' ? item.qty : 1,
                }));

            const formula = {
                materials,
                ratio,
                waitMinutes,
                waitSource: body_.waitSource === 'timer' ? 'timer' : 'manual',
                result: result ? result.toLocaleLowerCase('tr-TR') : null,
                note: str(body_.note, 600),
                staffId: me.id,
                writtenAt: new Date().toISOString(),
            };

            const { data: updated, error } = await admin.from('reservations')
                .update({ formula })
                .eq('id', res!.id)
                .select(RES_COLS)
                .maybeSingle();
            if (error) { console.error('visit.formula', error); return json({ error: 'write_failed' }, 500); }
            return json({ ok: true, reservation: updated });
        }

        if (action === 'visit.finish') {
            const { res, err } = await loadOwnReservation(body.reservationId);
            if (err) return err;
            // Aynı isteğin iki kez gelmesi (kötü sinyalde kuyruk tekrarı)
            // HATA DEĞİL. Ancak stok ilk denemede kesilmiş olabilir; bu yüzden
            // tamamlanmış satır da aşağıdaki stok uzlaştırmasına girer.
            let alreadyFinished = res!.status === 'completed';
            let finalized = res!;
            const now = new Date().toISOString();
            if (alreadyFinished && !res!.service_ended_at) {
                const { data: backfilled, error: backfillErr } = await admin.from('reservations')
                    .update({ service_ended_at: now, ...(res!.arrived_at ? {} : { arrived_at: now }) })
                    .eq('id', res!.id)
                    .eq('organization_id', me.organization_id)
                    .eq('status', 'completed')
                    .is('service_ended_at', null)
                    .select(RES_COLS)
                    .maybeSingle();
                if (backfillErr) {
                    console.error('visit.finish legacy timestamp', backfillErr);
                    return json({ error: 'write_failed' }, 500);
                }
                if (backfilled) {
                    finalized = backfilled;
                } else {
                    const latest = await loadOwnReservation(res!.id);
                    if (latest.err) return latest.err;
                    finalized = latest.res!;
                }
            }
            if (!alreadyFinished) {
                const { data: updated, error } = await admin.from('reservations')
                    .update({ status: 'completed', service_ended_at: now, ...(res!.arrived_at ? {} : { arrived_at: now }) })
                    .eq('id', res!.id)
                    .eq('organization_id', me.organization_id)
                    .neq('status', 'cancelled')
                    .neq('status', 'completed')
                    .select(RES_COLS)
                    .maybeSingle();
                if (error) { console.error('visit.finish', error); return json({ error: 'write_failed' }, 500); }
                if (updated) {
                    finalized = updated;
                } else {
                    const latest = await loadOwnReservation(res!.id);
                    if (latest.err) return latest.err;
                    if (latest.res!.status !== 'completed') return json({ error: 'state_conflict' }, 409);
                    finalized = latest.res!;
                    alreadyFinished = true;
                }
            }

            // Stok düşümü BURADA, kalem eklenirken değil. Hata hizmetin gerçek
            // tamamlanmasını geri almaz; fakat yanıt uyarıyı açıkça taşır.
            const stock = await reconcileUsageStock(finalized as Record<string, unknown>);
            const items = Array.isArray(finalized.adisyon_items) ? finalized.adisyon_items : [];
            const total = items.reduce((s: number, i: Record<string, unknown>) =>
                s + (Number(i?.price) || 0) * (Number(i?.qty) || 1), 0);
            if (!alreadyFinished) await audit(me.organization_id, me.id, 'visit.finish');
            const stockWarning = stock.ok ? undefined : stock.warning;
            return json({
                ok: true,
                ...(alreadyFinished ? { alreadyFinished: true } : {}),
                reservation: finalized,
                total,
                itemCount: items.length,
                endedAt: finalized.service_ended_at || now,
                stock: { ok: stock.ok, appliedCount: stock.appliedCount },
                ...(stockWarning ? { stockWarning, warnings: [stockWarning] } : {}),
            });
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

        if (action === 'customers') {
            // Personel 09 — müşteri defterinin listesi.
            //
            // Kapsam: SALONUN TAMAMI (işletme kararı, takvimle aynı).
            // Ama kolonlar dar ve TELEFON DÖNMÜYOR: ekran müşterinin gözü
            // önünde, ve numara listesi ayrılan personelin götürebileceği en
            // değerli şey. Arama telefonun son dört hanesiyle çalışsın diye
            // yalnız `phoneTail` dönüyor — numaranın kendisi kartta.
            if (!can(me.role, 'patients:view')) return json({ error: 'forbidden' }, 403);

            const [{ data: people, error }, { data: visits }, { data: crew }] = await Promise.all([
                admin.from('customers').select('id, name, phone')
                    .eq('organization_id', me.organization_id).order('name'),
                // Son gelişi ve son işi randevulardan türetiyoruz: müşteri
                // tablosunda böyle bir alan yok ve olmamalı — türetilmiş veri
                // saklanırsa bir gün gerçekle ayrışır.
                admin.from('reservations')
                    .select('customer_id, date, service, staff_id, formula, status')
                    .eq('organization_id', me.organization_id)
                    .neq('status', 'cancelled')
                    .order('date', { ascending: false }),
                admin.from('staff').select('id, name')
                    .eq('organization_id', me.organization_id),
            ]);
            if (error) { console.error('customers', error); return json({ error: 'lookup_failed' }, 500); }

            const initials = new Map<string, string>();
            for (const person of crew ?? []) {
                const parts = String(person.name ?? '').trim().split(/\s+/).filter(Boolean);
                const two = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
                initials.set(person.id as string, two.toLocaleUpperCase('tr-TR'));
            }

            const latest = new Map<string, Record<string, unknown>>();
            const hasFormula = new Set<string>();
            for (const row of visits ?? []) {
                const cid = row.customer_id as string | null;
                if (!cid) continue;
                if (!latest.has(cid)) latest.set(cid, row);
                if (row.formula) hasFormula.add(cid);
            }

            return json({
                ok: true,
                customers: (people ?? []).map((person: Record<string, unknown>) => {
                    const last = latest.get(person.id as string);
                    const staffId = last?.staff_id as string | null;
                    return {
                        id: person.id,
                        name: person.name,
                        lastVisitDate: last?.date ?? null,
                        lastService: last?.service ?? null,
                        hasFormula: hasFormula.has(person.id as string),
                        // Disk işareti: son işi BU personel mi yaptı?
                        mine: staffId === me.id,
                        lastStaffInitials: staffId ? (initials.get(staffId) ?? '?') : '',
                        phoneTail: String(person.phone ?? '').replace(/\D/g, '').slice(-4),
                    };
                }),
            });
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
                // Geçmiş satırı DOKUNULABİLİR (08 · 4b): formülü olan onu
                // açıyor, olmayan yazmayı başlatıyor. O yüzden satır formülü
                // ve kilit durumunu da taşıyor — ikinci bir istek atmamak için.
                admin.from('reservations')
                    .select('id, date, service, status, staff_id, formula, is_paid, adisyon_items')
                    .eq('organization_id', me.organization_id).eq('customer_id', cid)
                    .lte('date', today).order('date', { ascending: false }).limit(10),
                admin.from('customer_packages').select('id, name, total_sessions, used_sessions')
                    .eq('organization_id', me.organization_id).eq('customer_id', cid),
                admin.from('settings').select('risk_rules')
                    .eq('organization_id', me.organization_id).limit(1).maybeSingle(),
            ]);
            if (!c) return json({ error: 'not_found' }, 404);
            // Tahsilat ve borç BİLİNÇLİ olarak dönmüyor: kumandanın işi hizmet,
            // finans değil. Kasa yetkisi olan personel masaüstünü kullanır.
            const crewNames = new Map<string, string>();
            {
                const { data: crew } = await admin.from('staff').select('id, name')
                    .eq('organization_id', me.organization_id);
                for (const person of crew ?? []) crewNames.set(person.id as string, String(person.name ?? ''));
            }

            return json({
                ok: true,
                customer: c,
                history: (past ?? []).map((row: Record<string, unknown>) => ({
                    id: row.id,
                    date: row.date,
                    service: row.service,
                    status: row.status,
                    // Boya işi geçmemiş ziyarette formül BEKLENMİYOR: kesimde
                    // eksik olan bir şey yok, o satır "formül yok" demiyor.
                    hadMaterial: Array.isArray(row.adisyon_items)
                        && (row.adisyon_items as Record<string, unknown>[])
                            .some((item) => item?.kind === 'material'),
                    formula: row.formula ?? null,
                    // Kilit veriden geliyor: adisyon kasaya gittiyse formül
                    // artık okunur. Ayrı bir "kilitli" bayrağı saklamıyoruz.
                    locked: row.is_paid === true || row.status === 'completed',
                    staffName: row.staff_id ? (crewNames.get(row.staff_id as string) ?? null) : null,
                    mine: row.staff_id === me.id,
                })),
                packages: packs ?? [],
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
