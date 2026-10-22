import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { anahtarGecerli, anahtarOku, gecSql, geriSql, sirGecerli, UC, CANLI_TABAN } from '../ops/abonelik/dodo-canli.mjs';

// Dodo canlı kipe geçiş (devir 16). Betik ÜRETİMDEKİ ödeme sırlarını yazar:
// yanlış adres ödeme sayfasını, yanlış sır her webhook'u kırar, ezilen yedek
// geri dönüşü imkânsız kılar. Burada üçü de kilitli; SQL gerçek Postgres'te
// (PGlite) koşar.

const CANLI_ANAHTAR = 'sk_live_GIZLI_canli_0123456789abcdef';
const TEST_ANAHTAR = 'sk_test_GIZLI_test_0123456789abcdef';
const CANLI_SIR = 'whsec_CANLIsirCANLIsir0123456789abc=';
const TEST_SIR = 'whsec_TESTsirTESTsir0123456789abcd=';
const BETIK = (ad) => new URL(`../ops/abonelik/${ad}`, import.meta.url).pathname;

test('biçim kapıları: SQL\'e yalnız güvenli karakterler girer', () => {
    assert.equal(anahtarGecerli(CANLI_ANAHTAR), true);
    for (const kotu of ["sk_live_x'; drop table app_secrets; --", 'kisa', 'sk live boşluklu 0123456789', '', null]) {
        assert.equal(anahtarGecerli(kotu), false, String(kotu));
    }
    assert.equal(sirGecerli(CANLI_SIR), true);
    assert.equal(sirGecerli("whsec_abc'def0123456789abcdef"), false);
    assert.equal(sirGecerli('sk_live_0123456789abcdef0123'), false, 'whsec_ ile başlamalı');
    assert.throws(() => gecSql("x'y", CANLI_SIR), /biçimi geçersiz/);
    assert.throws(() => gecSql(CANLI_ANAHTAR, 'whsec_kısa'), /biçimi geçersiz/);
});

test('anahtar dosyası: değer hiçbir hata metnine girmez', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dodo-canli-dosya-'));
    const dosya = join(dir, 'env');
    writeFileSync(dosya, `# yorum\nDODO_API_KEY="${CANLI_ANAHTAR}"\n`);
    assert.equal(anahtarOku(dosya), CANLI_ANAHTAR);
    writeFileSync(dosya, "DODO_API_KEY=sk_live_tırnak'lı_0123456789\n");
    assert.throws(() => anahtarOku(dosya), (e) => /geçerli bir DODO_API_KEY/.test(e.message) && !e.message.includes('tırnak'));
    assert.throws(() => anahtarOku(join(dir, 'yok')), /read -rs/);
});

const PGLITE_DIR = process.env.PGLITE_DIR;
const pglite = async (dataDir) => {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    return new PGlite(dataDir);
};
const BASLANGIC = {
    DODO_API_BASE: 'https://test.dodopayments.com', DODO_API_KEY: TEST_ANAHTAR, DODO_WEBHOOK_SECRET: TEST_SIR,
    DODO_PRODUCT_MAP: JSON.stringify({ baslangic_monthly: 'pdt_t1', pro_monthly: 'pdt_t2' }),
    ENTITLEMENT_ENFORCE: 'false', ABONELIK_EPOSTA: 'false',
};
async function tablo(db, degerler = BASLANGIC) {
    await db.exec(`create table if not exists app_secrets (key text primary key, value text not null, updated_at timestamptz not null default now());`);
    for (const [k, v] of Object.entries(degerler)) await db.query('insert into app_secrets (key, value) values ($1, $2)', [k, v]);
}
const sirlar = async (db) => Object.fromEntries((await db.query('select key, value from app_secrets')).rows.map((r) => [r.key, r.value]));

test('gec / geri SQL: yedek, tek işlem, ikinci geçiş yedeği EZMEZ (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await pglite();
    await tablo(db);
    await db.exec(gecSql(CANLI_ANAHTAR, CANLI_SIR));
    let s = await sirlar(db);
    assert.equal(s.DODO_API_BASE, CANLI_TABAN);
    assert.equal(s.DODO_API_KEY, CANLI_ANAHTAR);
    assert.equal(s.DODO_WEBHOOK_SECRET, CANLI_SIR);
    assert.equal(s.DODO_PRODUCT_MAP, BASLANGIC.DODO_PRODUCT_MAP, 'harita gec\'te değişmez (dodo-urun işi)');
    assert.equal(s.DODO_TEST_API_BASE, BASLANGIC.DODO_API_BASE);
    assert.equal(s.DODO_TEST_API_KEY, TEST_ANAHTAR);
    assert.equal(s.DODO_TEST_WEBHOOK_SECRET, TEST_SIR);
    assert.equal(s.DODO_TEST_PRODUCT_MAP, BASLANGIC.DODO_PRODUCT_MAP);

    // Zaten canlıyken ikinci geçiş: hata, HİÇBİR şey değişmez (yedek canlıyla ezilseydi geri dönüş biterdi).
    await assert.rejects(db.exec(gecSql(`${CANLI_ANAHTAR}2`, CANLI_SIR)), /zaten canlı/);
    await db.exec('rollback');
    s = await sirlar(db);
    assert.equal(s.DODO_API_KEY, CANLI_ANAHTAR);
    assert.equal(s.DODO_TEST_API_KEY, TEST_ANAHTAR);

    await db.query("update app_secrets set value = '{\"pro_monthly\":\"pdt_canli\"}' where key = 'DODO_PRODUCT_MAP'");
    await db.exec(geriSql());
    s = await sirlar(db);
    assert.equal(s.DODO_API_BASE, BASLANGIC.DODO_API_BASE);
    assert.equal(s.DODO_API_KEY, TEST_ANAHTAR);
    assert.equal(s.DODO_WEBHOOK_SECRET, TEST_SIR);
    assert.equal(s.DODO_PRODUCT_MAP, BASLANGIC.DODO_PRODUCT_MAP, 'canlı harita da geri döner');

    const bos = await pglite();
    await tablo(bos);
    await assert.rejects(bos.exec(geriSql()), /yedeği yok/);
    await bos.exec('rollback');
    assert.equal((await sirlar(bos)).DODO_API_KEY, TEST_ANAHTAR);
});

test('gec SQL: DODO_API_BASE satırı hiç yoksa test sayılır ve yedeğe test adresi yazılır (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await pglite();
    const { DODO_API_BASE: _b, ...adressiz } = BASLANGIC;
    await tablo(db, adressiz);
    await db.exec(gecSql(CANLI_ANAHTAR, CANLI_SIR));
    const s = await sirlar(db);
    assert.equal(s.DODO_TEST_API_BASE, 'https://test.dodopayments.com');
    await db.exec(geriSql());
    assert.equal((await sirlar(db)).DODO_API_BASE, 'https://test.dodopayments.com');
});

// ── Uçtan uca: sahte Dodo (test + canlı) · sahte ssh/curl · docker → PGlite ──

function sahteDodo() {
    const mod = {
        test: {
            key: TEST_ANAHTAR, sayac: 0, secret: TEST_SIR,
            webhooks: [{ id: 'whk_test1', url: UC, disabled: false, filter_types: ['subscription.active', 'subscription.renewed', 'subscription.on_hold', 'payment.succeeded'] }],
            products: [],
        },
        live: { key: CANLI_ANAHTAR, sayac: 0, secret: CANLI_SIR, webhooks: [], products: [] },
    };
    const istekler = [];
    const liste = (u) => ({ ...u, price: u.price.price, currency: u.price.currency, price_detail: u.price });
    const sunucu = createServer((req, res) => {
        let govde = '';
        req.on('data', (c) => { govde += c; });
        req.on('end', () => {
            const [, kip, ...parca] = req.url.split('?')[0].split('/');
            const m = mod[kip];
            const yol = `/${parca.join('/')}`;
            istekler.push({ kip, yontem: req.method, yol, auth: req.headers.authorization });
            const cevap = (kod, o) => { res.writeHead(kod, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
            if (!m || req.headers.authorization !== `Bearer ${m.key}`) return cevap(401, { code: 'UNAUTHORIZED' });
            const b = govde ? JSON.parse(govde) : null;
            if (req.method === 'GET' && yol === '/webhooks') return cevap(200, { data: m.webhooks, done: true });
            if (req.method === 'POST' && yol === '/webhooks') {
                const w = { id: `whk_${kip}${++m.sayac}`, disabled: false, ...b };
                m.webhooks.push(w);
                return cevap(200, w);
            }
            if (req.method === 'GET' && /^\/webhooks\/[^/]+\/secret$/.test(yol)) {
                return m.webhooks.some((w) => w.id === parca[1]) ? cevap(200, { secret: m.secret }) : cevap(404, {});
            }
            if (req.method === 'GET' && yol === '/products') return cevap(200, { items: m.products.map(liste) });
            if (req.method === 'GET' && yol.startsWith('/products/')) {
                const u = m.products.find((x) => x.product_id === parca[1]);
                return u ? cevap(200, u) : cevap(404, { code: 'NOT_FOUND' });
            }
            if (req.method === 'POST' && yol === '/products') {
                const u = { ...b, product_id: `pdt_${kip}_${++m.sayac}` };
                m.products.push(u);
                return cevap(200, u);
            }
            return cevap(400, { hata: 'bilinmeyen' });
        });
    });
    return new Promise((ok) => sunucu.listen(0, '127.0.0.1', () => ok({ mod, istekler, port: sunucu.address().port, kapat: () => sunucu.close() })));
}

async function kurulum() {
    const dodo = await sahteDodo();
    const dir = mkdtempSync(join(tmpdir(), 'dodo-canli-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const veri = join(dir, 'pg');
    const db = await pglite(veri);
    await tablo(db);
    await db.close();
    const log = join(dir, 'argv.log');
    const yaz = (ad, govde) => { writeFileSync(join(bin, ad), govde); chmodSync(join(bin, ad), 0o755); };
    // Gerçek ssh gibi: seçenekler + makine atlanır, kalan uzak komut kabukta koşar.
    yaz('ssh', `#!/bin/bash
printf '%s\\0' ssh "$@" >> ${JSON.stringify(log)}; printf '\\n' >> ${JSON.stringify(log)}
while [ $# -gt 0 ]; do case "$1" in -i|-o) shift 2 ;; *@*) shift; break ;; *) shift ;; esac; done
exec bash -c "$*"
`);
    // docker exec … psql: -c sorgusu ya da -f - (stdin) → PGlite; -v yeni=… psql değişkeni elle açılır.
    yaz('docker', `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, ['docker', ...a].join('\\0') + '\\n');
(async () => {
  const { PGlite } = await import(${JSON.stringify(pathToFileURL(join(PGLITE_DIR ?? '', 'node_modules/@electric-sql/pglite/dist/index.js')).href)});
  const db = new PGlite(${JSON.stringify(veri)});
  let sql = a.includes('-c') ? a[a.indexOf('-c') + 1] : fs.readFileSync(0, 'utf8');
  const v = a.find((x) => x.startsWith('yeni='));
  if (v) sql = sql.split(":'yeni'").join("'" + v.slice(5).replace(/'/g, "''") + "'");
  try {
    const sonuc = await db.exec(sql);
    for (const r of sonuc) for (const row of r.rows) console.log(Object.values(row).map((x) => x ?? '').join('|'));
  } catch (e) {
    try { await db.exec('rollback'); } catch {}
    console.error('psql:<stdin>: ERROR:  ' + e.message);
    await db.close();
    process.exit(3);
  }
  await db.close();
})();
`);
    // curl → sahte Dodo (test. ve live. adresleri yerel sunucuya).
    yaz('curl', `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, ['curl', ...a].join('\\0') + '\\n');
let cikis, yontem = 'GET', basliklar = {}, govde;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '-o') cikis = a[++i];
  else if (a[i] === '-X') yontem = a[++i];
  else if (a[i] === '-H') { const h = a[++i]; const t = h.startsWith('@') ? fs.readFileSync(h.slice(1), 'utf8').trim() : h; const j = t.indexOf(':'); basliklar[t.slice(0, j)] = t.slice(j + 1).trim(); }
  else if (a[i] === '--data-binary') govde = fs.readFileSync(a[++i].slice(1), 'utf8');
  else if (a[i] === '-m' || a[i] === '-w') i++;
}
const url = a[a.length - 1].replace('https://test.dodopayments.com', 'http://127.0.0.1:${dodo.port}/test').replace('https://live.dodopayments.com', 'http://127.0.0.1:${dodo.port}/live');
fetch(url, { method: yontem, headers: basliklar, body: govde }).then(async (r) => {
  fs.writeFileSync(cikis, await r.text());
  process.stdout.write(String(r.status));
});
`);
    const anahtarDosyasi = join(dir, 'canli.env');
    writeFileSync(anahtarDosyasi, `DODO_API_KEY=${CANLI_ANAHTAR}\n`);
    const calistir = (betik, ...args) => new Promise((ok) => {
        const c = spawn(process.execPath, [BETIK(betik), ...args], {
            env: {
                ...process.env, PATH: `${bin}:${process.env.PATH}`,
                DODO_CANLI_TABAN: `http://127.0.0.1:${dodo.port}/live`, DODO_CANLI_DOSYA: anahtarDosyasi,
            },
        });
        let cikti = '';
        c.stdout.on('data', (d) => { cikti += d; });
        c.stderr.on('data', (d) => { cikti += d; });
        c.on('close', (kod) => ok({ kod, cikti }));
    });
    const db2 = async () => { const d = await pglite(veri); const s = await sirlar(d); await d.close(); return s; };
    const argv = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
    return { dodo, calistir, sirlar: db2, argv };
}

test('açılış provası: hazirla → gec → canlı ürünler → harita → geri; anahtar hiçbir yere sızmaz (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok', timeout: 240_000 }, async () => {
    const k = await kurulum();
    try {
        const kuru = await k.calistir('dodo-canli.mjs', 'hazirla');
        assert.equal(kuru.kod, 0, kuru.cikti);
        assert.match(kuru.cikti, /Sunucu: TEST/);
        assert.match(kuru.cikti, /Canlı uç: AÇILACAK/);
        assert.match(kuru.cikti, /KURU: hiçbir şey yazılmadı/);
        assert.equal(k.dodo.mod.live.webhooks.length, 0);
        assert.equal((await k.sirlar()).DODO_API_KEY, TEST_ANAHTAR);

        const gec = await k.calistir('dodo-canli.mjs', 'gec');
        assert.equal(gec.kod, 0, gec.cikti);
        assert.match(gec.cikti, /✓ Sunucu CANLI Dodo'ya bağlı/);
        // Canlı uç test ucunun olaylarıyla açıldı.
        assert.equal(k.dodo.mod.live.webhooks.length, 1);
        assert.deepEqual(k.dodo.mod.live.webhooks[0].filter_types, k.dodo.mod.test.webhooks[0].filter_types);
        assert.equal(k.dodo.mod.live.webhooks[0].url, UC);
        let s = await k.sirlar();
        assert.equal(s.DODO_API_BASE, CANLI_TABAN);
        assert.equal(s.DODO_API_KEY, CANLI_ANAHTAR);
        assert.equal(s.DODO_WEBHOOK_SECRET, CANLI_SIR, 'sır Dodo\'dan okundu, elle girilmedi');
        assert.equal(s.DODO_TEST_API_KEY, TEST_ANAHTAR);

        // İkinci gec: sunucu canlı → durur, yedek ezilmez, ikinci uç açılmaz.
        const tekrar = await k.calistir('dodo-canli.mjs', 'gec');
        assert.equal(tekrar.kod, 1);
        assert.match(tekrar.cikti, /zaten CANLI/);
        assert.equal(k.dodo.mod.live.webhooks.length, 1);
        assert.equal((await k.sirlar()).DODO_TEST_API_KEY, TEST_ANAHTAR);

        const urun = await k.calistir('dodo-urun.mjs', 'olustur', 'uygula', 'canli');
        assert.equal(urun.kod, 0, urun.cikti);
        assert.equal(k.dodo.mod.live.products.length, 6);
        assert.equal(k.dodo.mod.test.products.length, 0, 'ürünler canlıda açıldı');
        const harita = await k.calistir('dodo-urun.mjs', 'harita', 'uygula', 'canli');
        assert.equal(harita.kod, 0, harita.cikti);
        s = await k.sirlar();
        const yeni = JSON.parse(s.DODO_PRODUCT_MAP);
        assert.equal(Object.keys(yeni).length, 6);
        assert.ok(Object.values(yeni).every((id) => id.startsWith('pdt_live_')));

        const geri = await k.calistir('dodo-canli.mjs', 'geri');
        assert.equal(geri.kod, 0, geri.cikti);
        s = await k.sirlar();
        assert.equal(s.DODO_API_BASE, 'https://test.dodopayments.com');
        assert.equal(s.DODO_API_KEY, TEST_ANAHTAR);
        assert.equal(s.DODO_WEBHOOK_SECRET, TEST_SIR);
        assert.equal(s.DODO_PRODUCT_MAP, BASLANGIC.DODO_PRODUCT_MAP);

        // Canlı anahtar ve sır: ekrana ve hiçbir sürecin komut satırına çıkmadı;
        // canlı Dodo'ya yalnız başlıkla gitti.
        for (const gizli of [CANLI_ANAHTAR, CANLI_SIR]) {
            for (const c of [kuru, gec, tekrar, urun, harita, geri]) assert.equal(c.cikti.includes(gizli), false);
            assert.equal(k.argv().includes(gizli), false, 'argv\'de sır');
        }
        assert.ok(k.dodo.istekler.filter((i) => i.kip === 'live').every((i) => i.auth === `Bearer ${CANLI_ANAHTAR}`));
    } finally {
        k.dodo.kapat();
    }
});

test('canlı anahtar reddedilirse hiçbir şey yazılmaz, uç açılmaz (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok', timeout: 120_000 }, async () => {
    const k = await kurulum();
    try {
        k.dodo.mod.live.key = 'sk_live_BASKA_anahtar_0123456789';
        const r = await k.calistir('dodo-canli.mjs', 'gec');
        assert.equal(r.kod, 1);
        assert.match(r.cikti, /canlı Dodo anahtarı reddetti \(HTTP 401\)/);
        assert.equal(k.dodo.mod.live.webhooks.length, 0);
        const s = await k.sirlar();
        assert.equal(s.DODO_API_BASE, 'https://test.dodopayments.com');
        assert.equal(s.DODO_TEST_API_KEY, undefined);
    } finally {
        k.dodo.kapat();
    }
});
