import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    PAKETLER, YILLIK_AY, SURUM, urunAdi, urunGovdesi, eslestir, yeniHarita, cikti, testKipiMi,
} from '../ops/abonelik/dodo-urun.mjs';

// Fiyat turu 2026-10 (Tek kişilik 799 · Ekip 1.299 · İşletme 1.999, yıllıkta
// 2 ay bedava). Betik Dodo'da GERÇEK ürün açar ve ödeme sayfasının sattığı
// haritayı değiştirir: tutar, kopya ürün ve anahtarın sızması burada kilitli.

const BETIK = new URL('../ops/abonelik/dodo-urun.mjs', import.meta.url).pathname;
const ANAHTAR = 'sk_test_GIZLI_ANAHTAR_0123456789abcdef';

test('6 paket: kimlikler aynı, yıllık = 10 × aylık, tutarlar kuruşta tam', () => {
    assert.deepEqual(PAKETLER.map((p) => p.anahtar), [
        'baslangic_monthly', 'baslangic_yearly', 'pro_monthly', 'pro_yearly', 'isletme_monthly', 'isletme_yearly',
    ]);
    const tl = Object.fromEntries(PAKETLER.map((p) => [p.anahtar, p.tl]));
    assert.deepEqual(tl, {
        baslangic_monthly: 799, baslangic_yearly: 7990,
        pro_monthly: 1299, pro_yearly: 12990,
        isletme_monthly: 1999, isletme_yearly: 19990,
    });
    for (const p of PAKETLER.filter((x) => x.aralik === 'Year')) {
        const aylik = PAKETLER.find((x) => x.plan === p.plan && x.aralik === 'Month');
        assert.equal(p.tl, aylik.tl * YILLIK_AY);
    }
    assert.equal(urunAdi(PAKETLER[0]), 'TimeFlow - Tek kişilik · Aylık');
    assert.equal(urunAdi(PAKETLER[3]), 'TimeFlow - Ekip · Yıllık');
});

test('ürün gövdesi: TRY, vergi dahil, ürün denemesi 0, abonelik süresi eski üründen', () => {
    const sablon = {
        tax_category: 'saas', brand_id: 'bus_marka',
        price: { type: 'recurring_price', price: 59900, currency: 'USD', discount: 15, payment_frequency_count: 1,
            payment_frequency_interval: 'Month', subscription_period_count: 10, subscription_period_interval: 'Year',
            tax_inclusive: false, trial_period_days: 7, purchasing_power_parity: true },
    };
    const g = urunGovdesi(PAKETLER.find((p) => p.anahtar === 'pro_yearly'), sablon);
    assert.equal(g.name, 'TimeFlow - Ekip · Yıllık');
    assert.equal(g.tax_category, 'saas');
    assert.equal(g.brand_id, 'bus_marka');
    assert.deepEqual(g.metadata, { uygulama: 'timeflow', harita: 'pro_yearly', surum: SURUM });
    assert.deepEqual(g.price, {
        type: 'recurring_price', currency: 'TRY', price: 1299000, discount: 0,
        payment_frequency_count: 1, payment_frequency_interval: 'Year',
        subscription_period_count: 10, subscription_period_interval: 'Year',
        tax_inclusive: true, trial_period_days: 0, purchasing_power_parity: false,
    });
    assert.match(g.description, /12 ay 10 ay fiyatına/);
    // Şablon okunamazsa Dodo'nun önerdiği süre; discount alanı hiç gönderilmez.
    const v = urunGovdesi(PAKETLER[0], undefined);
    assert.equal(v.price.subscription_period_count, 20);
    assert.equal(v.price.subscription_period_interval, 'Year');
    assert.equal('discount' in v.price, false);
    assert.equal('brand_id' in v, false);
});

const urun = (anahtar, id, ust = {}) => {
    const p = PAKETLER.find((x) => x.anahtar === anahtar);
    return {
        product_id: id, name: urunAdi(p), metadata: { uygulama: 'timeflow', harita: anahtar, surum: SURUM },
        price: p.tl * 100, currency: 'TRY',
        price_detail: { type: 'recurring_price', price: p.tl * 100, currency: 'TRY', payment_frequency_interval: p.aralik },
        ...ust,
    };
};

test('harita yalnız altısı da doğruysa kurulur: eksik, kopya, yanlış tutar düşer', () => {
    const tam = PAKETLER.map((p, i) => urun(p.anahtar, `pdt_y${i}`));
    const eskiler = [{ product_id: 'pdt_eski', name: 'Pro aylık', metadata: {}, price: 59900, currency: 'TRY' }];
    const { harita, hatalar } = yeniHarita(eslestir([...eskiler, ...tam]));
    assert.deepEqual(hatalar, []);
    assert.equal(harita.pro_monthly, 'pdt_y2');
    assert.equal(Object.keys(harita).length, 6);

    const eksik = yeniHarita(eslestir(tam.slice(1)));
    assert.match(eksik.hatalar.join(), /baslangic_monthly: yeni ürün yok/);

    const kopya = yeniHarita(eslestir([...tam, urun('isletme_yearly', 'pdt_kopya')]));
    assert.match(kopya.hatalar.join(), /isletme_yearly: 2 ürün var/);

    const yanlis = tam.map((u) => (u.product_id === 'pdt_y1'
        ? { ...u, price: 799, price_detail: { ...u.price_detail, price: 79900 } } : u));
    assert.match(yeniHarita(eslestir(yanlis)).hatalar.join(), /baslangic_yearly: tutar 79900 kuruş, beklenen 799000/);

    const usd = tam.map((u) => (u.product_id === 'pdt_y4' ? { ...u, currency: 'USD', price_detail: { ...u.price_detail, currency: 'USD' } } : u));
    assert.match(yeniHarita(eslestir(usd)).hatalar.join(), /isletme_monthly: para birimi USD/);
});

test('liste metadata göndermezse ad + tutar eşler (ikinci çalıştırma kopya açmaz)', () => {
    const p = PAKETLER[0];
    const metasiz = { product_id: 'pdt_m', name: urunAdi(p), metadata: {}, price: p.tl * 100, currency: 'TRY' };
    assert.equal(eslestir([metasiz])[p.anahtar].urun?.product_id, 'pdt_m');
    const baskaTutar = { ...metasiz, price: 29900 };
    assert.equal(eslestir([baskaTutar])[p.anahtar].urun, null);
});

test('uzak çıktı ayrıştırılır; kip adresten', () => {
    const r = cikti('@@taban https://test.dodopayments.com\n@@harita {"pro_monthly":"pdt_1"}\n@@yanit 200 GET /products?recurring=true&page_size=100\n{"items":[]}\n@@yanit 422 POST /products\nhata metni\n');
    assert.equal(r.taban, 'https://test.dodopayments.com');
    assert.deepEqual(r.harita, { pro_monthly: 'pdt_1' });
    assert.deepEqual(r.yanitlar.map((y) => [y.kod, y.yontem, y.yol]), [[200, 'GET', '/products?recurring=true&page_size=100'], [422, 'POST', '/products']]);
    assert.deepEqual(r.yanitlar[0].govde, { items: [] });
    assert.equal(r.yanitlar[1].govde, 'hata metni');
    assert.equal(testKipiMi('https://test.dodopayments.com'), true);
    assert.equal(testKipiMi('https://live.dodopayments.com'), false);
});

// ── Uçtan uca: sahte ssh → yerel bash, sahte docker (app_secrets) + curl (Dodo) ──

function sahteSunucu({ taban = 'https://test.dodopayments.com' } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'dodo-urun-'));
    const bin = join(dir, 'bin');
    spawnSync('mkdir', [bin]);
    const durum = join(dir, 'durum.json');
    const eskiler = [
        ['baslangic_monthly', 'pdt_eski_bm', 'Başlangıç aylık', 29900, 'Month'],
        ['baslangic_yearly', 'pdt_eski_by', 'Başlangıç yıllık', 286800, 'Year'],
        ['pro_monthly', 'pdt_eski_pm', 'Pro aylık', 59900, 'Month'],
        ['pro_yearly', 'pdt_eski_py', 'Pro yıllık', 574800, 'Year'],
        ['isletme_monthly', 'pdt_eski_im', 'İşletme aylık', 119900, 'Month'],
        ['isletme_yearly', 'pdt_eski_iy', 'İşletme yıllık', 1150800, 'Year'],
    ];
    writeFileSync(durum, JSON.stringify({
        secrets: {
            DODO_API_KEY: ANAHTAR, DODO_API_BASE: taban,
            DODO_PRODUCT_MAP: JSON.stringify(Object.fromEntries(eskiler.map(([k, id]) => [k, id]))),
        },
        urunler: eskiler.map(([, id, name, price, ar]) => ({
            product_id: id, name, metadata: {}, tax_category: 'saas', brand_id: 'bus_marka',
            price: { type: 'recurring_price', price, currency: 'TRY', discount: 0, payment_frequency_count: 1,
                payment_frequency_interval: ar, subscription_period_count: 10, subscription_period_interval: 'Year',
                tax_inclusive: true, trial_period_days: 0, purchasing_power_parity: false },
        })),
        sayac: 0,
    }));
    const yaz = (ad, govde) => { writeFileSync(join(bin, ad), govde); chmodSync(join(bin, ad), 0o755); };
    // ssh: uzak komut "bash -s"; betik stdin'den gelir.
    yaz('ssh', '#!/bin/bash\nwhile [ $# -gt 0 ] && [ "$1" != bash ]; do shift; done\nexec "$@"\n');
    yaz('docker', `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, 'argv.log'))}, JSON.stringify(['docker', ...a]) + '\\n');
const d = JSON.parse(fs.readFileSync(${JSON.stringify(durum)}, 'utf8'));
const s = d.secrets;
const c = a[a.indexOf('-c') + 1];
if (a.includes('-c')) {
  if (c.includes("'DODO_API_KEY'")) console.log(s.DODO_API_KEY ?? '');
  else if (c.includes("'DODO_API_BASE'")) console.log((s.DODO_API_BASE ?? 'https://test.dodopayments.com').replace(/\\/+$/, ''));
  else if (c.includes("'DODO_PRODUCT_MAP'")) console.log(s.DODO_PRODUCT_MAP ?? '{}');
  else process.exit(3);
} else {
  const sql = fs.readFileSync(0, 'utf8');
  const v = a.find((x) => x.startsWith('yeni='));
  if (sql.includes(":'yeni'")) {
    // Yedek yalnız betik onu gerçekten yazıyorsa alınır.
    if (sql.includes("select 'DODO_PRODUCT_MAP_ONCEKI', value from app_secrets where key = 'DODO_PRODUCT_MAP'")) s.DODO_PRODUCT_MAP_ONCEKI = s.DODO_PRODUCT_MAP;
    s.DODO_PRODUCT_MAP = v.slice(5);
  }
  else if (sql.includes('DODO_PRODUCT_MAP_ONCEKI')) {
    if (!s.DODO_PRODUCT_MAP_ONCEKI) { console.error('ONCEKI yok'); process.exit(3); }
    s.DODO_PRODUCT_MAP = s.DODO_PRODUCT_MAP_ONCEKI;
  } else process.exit(3);
  fs.writeFileSync(${JSON.stringify(durum)}, JSON.stringify(d));
}
`);
    yaz('curl', `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, 'argv.log'))}, JSON.stringify(['curl', ...a]) + '\\n');
const d = JSON.parse(fs.readFileSync(${JSON.stringify(durum)}, 'utf8'));
let cikis, yontem = 'GET', basliklar = [], govde = null;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '-o') cikis = a[++i];
  else if (a[i] === '-X') yontem = a[++i];
  else if (a[i] === '-H') { const h = a[++i]; basliklar.push(h.startsWith('@') ? fs.readFileSync(h.slice(1), 'utf8').trim() : h); }
  else if (a[i] === '--data-binary') govde = JSON.parse(fs.readFileSync(a[++i].slice(1), 'utf8'));
  else if (a[i] === '-m' || a[i] === '-w') i++;
}
const url = new URL(a[a.length - 1]);
fs.appendFileSync(${JSON.stringify(join(dir, 'istek.log'))}, JSON.stringify({ yontem, yol: url.pathname + url.search, basliklar, govde }) + '\\n');
const liste = (u) => ({ ...u, price: u.price.price, currency: u.price.currency, price_detail: u.price, tax_inclusive: u.price.tax_inclusive });
let kod = 200, cevap;
if (!basliklar.includes('Authorization: Bearer ' + d.secrets.DODO_API_KEY)) { kod = 401; cevap = {}; }
else if (yontem === 'GET' && url.pathname === '/products') cevap = { items: d.urunler.map(liste) };
else if (yontem === 'GET' && url.pathname.startsWith('/products/')) {
  const u = d.urunler.find((x) => x.product_id === url.pathname.split('/')[2]);
  if (u) cevap = u; else { kod = 404; cevap = { code: 'NOT_FOUND' }; }
} else if (yontem === 'POST' && url.pathname === '/products') {
  const u = { ...govde, product_id: 'pdt_yeni_' + (++d.sayac) };
  d.urunler.push(u);
  fs.writeFileSync(${JSON.stringify(durum)}, JSON.stringify(d));
  cevap = u;
} else { kod = 400; cevap = { hata: 'bilinmeyen' }; }
fs.writeFileSync(cikis, JSON.stringify(cevap, null, 2));
process.stdout.write(String(kod));
`);
    const calistir = (...args) => {
        const r = spawnSync(process.execPath, [BETIK, ...args], {
            encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        });
        return { kod: r.status, cikti: r.stdout + r.stderr };
    };
    const oku = (ad) => (existsSync(join(dir, ad)) ? readFileSync(join(dir, ad), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
    return { calistir, istekler: () => oku('istek.log'), argv: () => oku('argv.log'), durum: () => JSON.parse(readFileSync(durum, 'utf8')) };
}

test('olustur: kuru hiçbir şey açmaz; uygula altısını açar; ikinci kez kopya açmaz', () => {
    const s = sahteSunucu();

    const kuru = s.calistir('olustur');
    assert.equal(kuru.kod, 0, kuru.cikti);
    assert.match(kuru.cikti, /Dodo kipi: TEST/);
    assert.equal((kuru.cikti.match(/AÇILACAK/g) ?? []).length, 6);
    assert.match(kuru.cikti, /KURU: hiçbir şey açılmadı/);
    assert.equal(s.istekler().filter((i) => i.yontem === 'POST').length, 0);

    const ac = s.calistir('olustur', 'uygula');
    assert.equal(ac.kod, 0, ac.cikti);
    const postlar = s.istekler().filter((i) => i.yontem === 'POST');
    assert.equal(postlar.length, 6);
    const tutar = Object.fromEntries(postlar.map((p) => [p.govde.metadata.harita, p.govde.price.price]));
    assert.deepEqual(tutar, {
        baslangic_monthly: 79900, baslangic_yearly: 799000, pro_monthly: 129900,
        pro_yearly: 1299000, isletme_monthly: 199900, isletme_yearly: 1999000,
    });
    for (const p of postlar) {
        assert.equal(p.govde.price.currency, 'TRY');
        assert.equal(p.govde.price.tax_inclusive, true);
        assert.equal(p.govde.price.trial_period_days, 0);
        assert.equal(p.govde.price.subscription_period_count, 10); // eski üründen
        assert.equal(p.govde.brand_id, 'bus_marka');
    }
    assert.match(ac.cikti, /Altısı Dodo'da, tutarlar doğru/);
    // Harita YAZILMADI: ödeme sayfası hâlâ eski ürünleri satar.
    assert.equal(JSON.parse(s.durum().secrets.DODO_PRODUCT_MAP).pro_monthly, 'pdt_eski_pm');

    const tekrar = s.calistir('olustur', 'uygula');
    assert.equal(tekrar.kod, 0, tekrar.cikti);
    assert.match(tekrar.cikti, /Açılacak ürün yok/);
    assert.equal(s.istekler().filter((i) => i.yontem === 'POST').length, 6);
});

test('anahtar hiçbir komut satırına ve ekrana çıkmaz; Dodo\'ya başlıkla gider', () => {
    const s = sahteSunucu();
    const r = s.calistir('olustur', 'uygula');
    assert.equal(r.kod, 0, r.cikti);
    assert.equal(r.cikti.includes(ANAHTAR), false);
    for (const a of s.argv()) assert.equal(JSON.stringify(a).includes(ANAHTAR), false, `argv'de anahtar: ${a[0]}`);
    assert.ok(s.istekler().length > 0);
    for (const i of s.istekler()) assert.ok(i.basliklar.includes(`Authorization: Bearer ${ANAHTAR}`));
});

test('canlı kipte yazan komutlar `canli` olmadan durur', () => {
    const s = sahteSunucu({ taban: 'https://live.dodopayments.com' });
    const r = s.calistir('olustur', 'uygula');
    assert.equal(r.kod, 1);
    assert.match(r.cikti, /DURDU: Dodo CANLI kipte/);
    assert.equal(s.istekler().filter((i) => i.yontem === 'POST').length, 0);

    const izinli = s.calistir('olustur', 'uygula', 'canli');
    assert.equal(izinli.kod, 0, izinli.cikti);
    assert.equal(s.istekler().filter((i) => i.yontem === 'POST').length, 6);

    const h = s.calistir('harita', 'uygula');
    assert.equal(h.kod, 1);
    assert.match(h.cikti, /DURDU/);
    assert.equal(JSON.parse(s.durum().secrets.DODO_PRODUCT_MAP).pro_monthly, 'pdt_eski_pm');
});

test('harita: ürünler yokken kurulmaz; uygula yazar ve eskisini saklar; geri döner', () => {
    const s = sahteSunucu();
    const erken = s.calistir('harita', 'uygula');
    assert.equal(erken.kod, 1);
    assert.match(erken.cikti, /yeni ürün yok/);

    s.calistir('olustur', 'uygula');
    const kuru = s.calistir('harita');
    assert.equal(kuru.kod, 0, kuru.cikti);
    assert.match(kuru.cikti, /KURU: harita değişmedi/);
    assert.equal(JSON.parse(s.durum().secrets.DODO_PRODUCT_MAP).pro_monthly, 'pdt_eski_pm');

    const yaz = s.calistir('harita', 'uygula');
    assert.equal(yaz.kod, 0, yaz.cikti);
    assert.match(yaz.cikti, /DODO_PRODUCT_MAP yazıldı/);
    const sonra = JSON.parse(s.durum().secrets.DODO_PRODUCT_MAP);
    assert.equal(Object.keys(sonra).length, 6);
    assert.ok(Object.values(sonra).every((id) => id.startsWith('pdt_yeni_')));
    assert.equal(JSON.parse(s.durum().secrets.DODO_PRODUCT_MAP_ONCEKI).pro_monthly, 'pdt_eski_pm');

    const geri = s.calistir('harita', 'geri');
    assert.equal(geri.kod, 0, geri.cikti);
    assert.equal(JSON.parse(s.durum().secrets.DODO_PRODUCT_MAP).pro_monthly, 'pdt_eski_pm');
});
