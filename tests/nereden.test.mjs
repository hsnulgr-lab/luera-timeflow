// Müşteri nereden geldi? (Kaynak Defteri, Aşama 1 — göç 135).
//
// 1) Sunucu: ham izden kanal çıkarma + temizleme (anonim uç, uydurulabilir).
// 2) Sayfa: iz toplama + 30 gün hatırlama.
// 3) Üç anahtar listesi (src · edge · göç CHECK) aynı.
// 4) Bağlantı: public-booking, randevu sayfası, kancalar izi gerçekten taşıyor.
// 5) Göç 135 gerçek Postgres'te (PGlite, PGLITE_DIR varsa).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
    NEREDEN_KEYS as EDGE_KEYS, attributionMeta, deriveOrigin, isPaid, sanitizeAttribution,
} from '../supabase/functions/_shared/booking/nereden.ts';
import { NEREDEN_KEYS, NEREDEN_LABEL, neredenLabel } from '../src/lib/nereden.ts';
import { readSignals, rememberAttribution } from '../src/pages/public/neredenIzi.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = new Date('2026-11-01T12:00:00Z');
const kanal = (raw) => { const a = sanitizeAttribution(raw, NOW); return a ? deriveOrigin(a) : null; };

// ── 1 · Kanal çıkarma ────────────────────────────────────────────────────────

test('deriveOrigin: salonun kendi etiketi (?n=) her şeyi yener', () => {
    assert.equal(kanal({ n: 'google_maps' }), 'google_maps');
    assert.equal(kanal({ n: 'tavsiye', utm_source: 'ig', gclid: 'x' }), 'tavsiye');
    // Geçersiz n düşer, sıradaki ipucu kullanılır.
    assert.equal(kanal({ n: 'instagramm', utm_source: 'ig' }), 'instagram');
});

test('deriveOrigin: utm_source eş adları', () => {
    assert.equal(kanal({ utm_source: 'IG' }), 'instagram');
    assert.equal(kanal({ utm_source: 'facebook' }), 'facebook');
    assert.equal(kanal({ utm_source: 'fb', ua_app: 'instagram' }), 'instagram'); // Meta reklamı Instagram'da görülmüş
    assert.equal(kanal({ utm_source: 'tiktok' }), 'tiktok');
    assert.equal(kanal({ utm_source: 'google', utm_medium: 'gbp' }), 'google_maps');
    assert.equal(kanal({ utm_source: 'google', utm_medium: 'cpc' }), 'google');
    assert.equal(kanal({ utm_source: 'newsletter' }), 'diger');
});

test('deriveOrigin: tıklama kimlikleri ve yönlendiren', () => {
    assert.equal(kanal({ gclid: 'Cj0KCQ' }), 'google');
    assert.equal(kanal({ ttclid: 'abc' }), 'tiktok');
    assert.equal(kanal({ fbclid: 'IwAR1', ua_app: 'instagram' }), 'instagram');
    assert.equal(kanal({ fbclid: 'IwAR1' }), 'facebook');
    assert.equal(kanal({ ref_host: 'l.instagram.com' }), 'instagram');
    assert.equal(kanal({ ref_host: 'com.google.android.apps.maps' }), 'google_maps');
    assert.equal(kanal({ ref_host: 'www.google.com.tr' }), 'google');
    assert.equal(kanal({ ref_host: 'm.facebook.com' }), 'facebook');
    assert.equal(kanal({ ref_host: 'guzelliksalonum.com' }), 'web_sitesi');
    assert.equal(kanal({ ua_app: 'tiktok' }), 'tiktok');
    assert.equal(kanal({ embed: true }), 'web_sitesi');
    assert.equal(kanal({}), null);
    assert.equal(kanal(null), null);
});

test('isPaid: fbclid tek başına reklam DEĞİL; gclid ve ücretli utm_medium reklam', () => {
    assert.equal(isPaid({ fbclid: 'x' }), false);
    assert.equal(isPaid({ gclid: 'x' }), true);
    assert.equal(isPaid({ utm_source: 'ig', utm_medium: 'paid_social' }), true);
    assert.equal(isPaid({ utm_source: 'ig', utm_medium: 'bio' }), false);
    assert.deepEqual(attributionMeta({ fbclid: 'x' }), { fbclid: 'x', paid: false, v: 1 });
});

test('sanitizeAttribution: beyaz liste, kırpma, biçim, tarih', () => {
    assert.equal(sanitizeAttribution('ig', NOW), null);
    assert.equal(sanitizeAttribution(['ig'], NOW), null);
    assert.equal(sanitizeAttribution({ evil: '<script>' }, NOW), null);
    const a = sanitizeAttribution({
        utm_campaign: 'x'.repeat(500), fbclid: 'bad id with spaces', gclid: 'ok_1-2.3',
        ref_host: 'Evil.COM/path', ua_app: 'snapchat', embed: 'yes', password: 'p',
        landed_at: '2026-10-20T10:00:00Z',
    }, NOW);
    assert.equal(a.utm_campaign.length, 100);
    assert.equal(a.fbclid, undefined);
    assert.equal(a.gclid, 'ok_1-2.3');
    assert.equal(a.ref_host, undefined);
    assert.equal(a.ua_app, undefined);
    assert.equal(a.embed, undefined);
    assert.equal(a.password, undefined);
    assert.equal(a.landed_at, '2026-10-20T10:00:00.000Z');
    assert.equal(sanitizeAttribution({ gclid: 'x', landed_at: '2027-01-01T00:00:00Z' }, NOW).landed_at, undefined);
    assert.equal(sanitizeAttribution({ gclid: 'x', landed_at: '2026-01-01T00:00:00Z' }, NOW).landed_at, undefined);
});

// ── 2 · Sayfa: iz toplama ────────────────────────────────────────────────────

const memStore = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
};
const sig = (over = {}) => readSignals({
    search: '', referrer: '', userAgent: 'Mozilla/5.0', selfHost: 'timeflow.lueratech.com', embed: false, ...over,
});

test('readSignals: parametre + yönlendiren alan adı + uygulama içi tarayıcı; kendi alan adı atılır', () => {
    assert.deepEqual(sig({ search: '?utm_source=ig&fbclid=IwAR&x=1' }), { utm_source: 'ig', fbclid: 'IwAR' });
    assert.deepEqual(sig({ referrer: 'https://l.instagram.com/?u=abc' }), { ref_host: 'l.instagram.com' });
    assert.deepEqual(sig({ referrer: 'android-app://com.google.android.apps.maps/' }), { ref_host: 'com.google.android.apps.maps' });
    assert.deepEqual(sig({ referrer: 'https://timeflow.lueratech.com/book/x' }), {});
    assert.deepEqual(sig({ userAgent: 'Mozilla/5.0 Instagram 300.0' }), { ua_app: 'instagram' });
    assert.deepEqual(sig({ embed: true }), { embed: true });
});

test('rememberAttribution: 30 gün hatırlar, son izli ziyaret kazanır, gömülü tek başına ezmez', () => {
    const s = memStore();
    const d0 = new Date('2026-10-01T10:00:00Z');
    const first = rememberAttribution('salon', sig({ search: '?n=instagram' }), s, d0);
    assert.equal(first.n, 'instagram');

    // İzsiz dönüş (perşembe): kayıt döner.
    assert.equal(rememberAttribution('salon', sig(), s, new Date('2026-10-04T10:00:00Z')).n, 'instagram');
    // Gömülü dönüş de kaydı ezmez, yalnız embed eklenir.
    const emb = rememberAttribution('salon', sig({ embed: true }), s, new Date('2026-10-05T10:00:00Z'));
    assert.equal(emb.n, 'instagram');
    assert.equal(emb.embed, true);
    // Başka slug karışmaz.
    assert.equal(rememberAttribution('baska', sig(), s, d0), null);
    // Yeni izli ziyaret eskisini ezer.
    assert.equal(rememberAttribution('salon', sig({ search: '?gclid=x' }), s, new Date('2026-10-06T10:00:00Z')).gclid, 'x');
    // 30 günden eski kayıt silinir.
    assert.equal(rememberAttribution('salon', sig(), s, new Date('2026-11-06T10:00:01Z')), null);
    assert.equal(s.m.size, 0);
    // Depolama yok/bozuk: sessizce geçer.
    assert.equal(rememberAttribution('salon', sig(), null, d0), null);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    assert.equal(rememberAttribution('salon', sig({ search: '?n=tiktok' }), broken, d0).n, 'tiktok');
});

// ── 3 · Anahtar listeleri eş ─────────────────────────────────────────────────

test('anahtar listesi: src = edge = göç 135 CHECK (iki tabloda da)', () => {
    assert.deepEqual([...EDGE_KEYS], [...NEREDEN_KEYS]);
    const sql = read('supabase/135_nereden.sql');
    const checks = [...sql.matchAll(/origin IN \(([^)]+)\)/g)].map((m) => m[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1)));
    assert.equal(checks.length, 2);
    for (const c of checks) assert.deepEqual(c, [...NEREDEN_KEYS]);
    for (const k of NEREDEN_KEYS) assert.ok(NEREDEN_LABEL[k]);
    assert.equal(neredenLabel(null), 'Belirtilmemiş');
    assert.equal(neredenLabel('google_maps'), 'Google Haritalar');
});

// ── 4 · Bağlantı ─────────────────────────────────────────────────────────────

test('public-booking: iz temizlenir, yalnız YENİ müşteriye ve iki book yolunun randevusuna yazılır', () => {
    const src = read('supabase/functions/public-booking/index.ts');
    assert.match(src, /sanitizeAttribution\(body\.attribution\)/);
    // Müşteri: yalnız insert dalında (arama ve 23505 dalı dokunulmaz).
    assert.match(src, /\.insert\(\{[^}]*?\n\s*\.\.\.\(p\.origin \? \{ origin: p\.origin, origin_meta: p\.originMeta \?\? null \} : \{\}\),/);
    assert.equal((src.match(/origin: nereden, originMeta: neredenMeta,/g) || []).length, 2);
    assert.equal((src.match(/\.\.\.neredenCols,/g) || []).length, 2);
    // Kanal (source) ve abuse sayacı aynen: 'booking'.
    assert.equal((src.match(/source: 'booking',\n\s*\.\.\.neredenCols,/g) || []).length, 2);
});

test('randevu sayfası izi gönderir; masaüstü yalnız değer varsa yazar', () => {
    const page = read('src/pages/public/BookingPage.tsx');
    assert.match(page, /rememberAttribution\(slug, readSignals\(/);
    assert.match(page, /\.\.\.\(attribution \? \{ attribution \} : \{\}\),/);

    const res = read('src/hooks/useReservations.ts');
    assert.match(res, /\.\.\.\(input\.origin \? \{ origin: input\.origin \} : \{\}\),/);
    assert.match(res, /\.\.\.\(reservation\.origin \? \{ origin: reservation\.origin \} : \{\}\),/);

    const cust = read('src/hooks/useCustomers.ts');
    assert.match(cust, /\.\.\.\(customer\.origin \? \{ origin: customer\.origin \} : \{\}\),/);
    assert.match(cust, /if \(updates\.origin !== undefined\) dbUpdates\.origin = updates\.origin \?\? null;/);
    // Arşivden geri getirme yeni müşteri sayılmaz.
    const restore = cust.slice(cust.indexOf('.update({\n                        is_active: true,'), cust.indexOf('const restoredBase'));
    assert.doesNotMatch(restore, /origin/);
});

test('dört randevu penceresi: "Nereden geldi?" yalnız yeni müşteride', () => {
    for (const [file, guard] of [
        ['src/pages/CalendarPage.tsx', /\{isNewCustomer && \(\s*<NeredenSecici/],
        ['src/components/kuafor/KuaforCalendarPage.tsx', /\{isNewCustomer && \(\s*<NeredenSecici/],
        ['src/components/beauty/BeautySessionModal.tsx', /\{noResults && \([\s\S]*?<NeredenSecici/],
        ['src/components/dashboard/AppointmentComposer.tsx', /\{newPatient && !patient && \([\s\S]*?<NeredenSecici/],
    ]) {
        assert.match(read(file), guard, file);
    }
});

test('arayüzde "Kaynak" değil "Nereden" (kaynak = kabin/oda)', () => {
    const panel = read('src/components/analytics/NeredenPanel.tsx');
    assert.doesNotMatch(panel, />[^<]*Kaynak[^<]*</);
    assert.match(read('src/components/nereden/NeredenSecici.tsx'), /Nereden: /);
});

// ── 5 · Göç 135 (PGlite) ─────────────────────────────────────────────────────

const PGLITE_DIR = process.env.PGLITE_DIR;

test('135: iki kez uygulanır; geçerli anahtar girer, yanlışı ve bozuk meta reddedilir (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(`
        CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, created_at timestamptz DEFAULT now());
        CREATE TABLE reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,
            source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','booking','leadflow','whatsapp')));
    `);
    const sql = read('supabase/135_nereden.sql');
    await db.exec(sql);
    await db.exec(sql); // idempotent

    await db.query(`INSERT INTO customers (origin, origin_meta) VALUES ('instagram', '{"fbclid":"x","paid":false,"v":1}')`);
    await db.query(`INSERT INTO customers (origin) VALUES (NULL)`);
    await db.query(`INSERT INTO reservations (source, origin) VALUES ('booking', 'google_maps')`);

    const reddet = async (q) => {
        await assert.rejects(db.query(q), (e) => e.code === '23514');
    };
    await reddet(`INSERT INTO customers (origin) VALUES ('instagramm')`);
    await reddet(`INSERT INTO reservations (origin) VALUES ('whatsapp')`);
    await reddet(`INSERT INTO customers (origin_meta) VALUES ('["x"]')`);
    await reddet(`INSERT INTO reservations (origin_meta) VALUES (jsonb_build_object('pad', repeat('x', 4000)))`);

    const idx = await db.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customers_org_created'`);
    assert.equal(idx.rows.length, 1);
    // Kanal sütunu etkilenmedi.
    await reddet(`INSERT INTO reservations (source) VALUES ('instagram')`);
});
