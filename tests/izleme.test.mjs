import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    kontroller, kontrolEt, denetle, karar, ozet, sure, sabahMi, calistir, HATIRLAT_MS,
    pushoverOnceligi, kanallar, saat,
} from '../ops/izleme/src/kontroller.js';

// Dış izleme (2026-10-17). 16 Ekim'de giriş servisi ~45 dk ölü kaldı ve hiçbir
// şey alarm vermedi. Bu testler alarmın ne zaman çalıp ne zaman SUSTUĞUNU
// kilitler: gereksiz çalan alarm kapatılır, kapatılan alarm işe yaramaz.

const ENV = {
    SUPABASE_URL: 'https://sb.example', DESKTOP_URL: 'https://app.example', SITE_URL: 'https://site.example',
    DEMO_SLUG: 'demo-luera', SUPABASE_ANON_KEY: 'anon-test', NTFY_TOPIC: 'konu-test',
};
const LISTE = kontroller(ENV);
const ok = (id) => ({ id, ok: true, ayrinti: '', ms: 1 });
const kapali = (id, ayrinti = 'HTTP 503') => ({ id, ok: false, ayrinti, ms: 1 });
const hepsiOk = () => LISTE.map((k) => ok(k.id));
const T0 = Date.UTC(2026, 9, 17, 12, 0);

function sahteAg(cevaplar) {
    const istekler = [];
    const fetchImpl = async (url, init = {}) => {
        istekler.push({ url, init });
        const c = cevaplar(url, init);
        if (c instanceof Error) throw c;
        return { status: c.status, ok: c.status >= 200 && c.status < 300, text: async () => c.body ?? '' };
    };
    return { fetchImpl, istekler };
}
const saglikli = (url) => {
    if (url.endsWith('/auth/v1/health')) return { status: 200, body: '{"name":"GoTrue"}' };
    if (url.endsWith('/public-booking')) return { status: 200, body: '{"business":{}}' };
    if (url.endsWith('/staff-api')) return { status: 401, body: '{"error":"invalid_token"}' };
    if (url.includes('app.example')) return { status: 200, body: '<div id="root"></div>' };
    return { status: 200, body: '' };
};

test('anahtar adreste değil başlıkta gider; veri kontrolü yalnız okur', () => {
    const giris = LISTE.find((k) => k.id === 'giris');
    assert.equal(giris.headers.apikey, 'anon-test');
    assert.doesNotMatch(giris.url, /apikey|anon-test/);
    const veri = LISTE.find((k) => k.id === 'veri');
    assert.deepEqual(JSON.parse(veri.body), { action: 'profile', slug: 'demo-luera' });
    assert.deepEqual(LISTE.map((k) => k.id), ['giris', 'veri', 'personel', 'masaustu', 'site']);
});

test('kontrol: durum kodu, içerik ve zaman aşımı', async () => {
    const giris = LISTE.find((k) => k.id === 'giris');
    const personel = LISTE.find((k) => k.id === 'personel');
    assert.equal((await kontrolEt(giris, sahteAg(saglikli).fetchImpl)).ok, true);
    // 16 Ekim'in belirtisi: Kong auth kabını bulamıyor.
    const r503 = await kontrolEt(giris, sahteAg(() => ({ status: 503, body: 'name resolution failed' })).fetchImpl);
    assert.deepEqual([r503.ok, r503.ayrinti], [false, 'sunucu cevap verdi ama servis kapalı (HTTP 503)']);
    const yanlis = await kontrolEt(giris, sahteAg(() => ({ status: 200, body: 'bambaşka' })).fetchImpl);
    assert.deepEqual([yanlis.ok, yanlis.ayrinti], [false, 'sayfa açıldı ama içerik beklenen gibi değil']);
    // staff-api için 401 SAĞLIK işaretidir; 200 ya da 5xx değil.
    assert.equal((await kontrolEt(personel, sahteAg(saglikli).fetchImpl)).ok, true);
    assert.equal((await kontrolEt(personel, sahteAg(() => ({ status: 500, body: 'worker boot error' })).fetchImpl)).ok, false);
    const zamanAsimi = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const r = await kontrolEt(giris, sahteAg(() => zamanAsimi).fetchImpl);
    assert.deepEqual([r.ok, r.ayrinti], [false, 'sunucu 10 sn içinde cevap vermedi']);
    const kopuk = await kontrolEt(giris, sahteAg(() => new TypeError('fetch failed')).fetchImpl);
    assert.equal(kopuk.ayrinti, 'sunucuya hiç ulaşılamıyor');
});

test('tek hata alarm değil: ikinci deneme geçerse açık sayılır', async () => {
    const giris = LISTE.find((k) => k.id === 'giris');
    let n = 0;
    const { fetchImpl } = sahteAg(() => (++n === 1 ? { status: 502 } : { status: 200, body: 'GoTrue' }));
    const bekledi = [];
    const r = await denetle(giris, fetchImpl, async (ms) => { bekledi.push(ms); });
    assert.equal(r.ok, true);
    assert.deepEqual(bekledi, [20_000]);
});

test('düşen tek servis → tek, acil bildirim; sonra susar', () => {
    const sonuc = [kapali('giris'), ...hepsiOk().slice(1)];
    const a = karar({ basladi: 'x', kapali: {} }, sonuc, T0, LISTE);
    assert.equal(a.degisti, true);
    assert.equal(a.bildirimler.length, 1);
    assert.equal(a.bildirimler[0].title, 'Giriş çalışmıyor — kimse giriş yapamıyor');
    assert.equal(a.bildirimler[0].priority, 5);
    // Gece 3'te okunacak sıra: etkisi, ne yapılır, teknik en sonda.
    assert.equal(a.bildirimler[0].message, [
        'Etkisi: Salonlar ve personel uygulamaya da masaüstüne de giremiyor, yeni kayıt açılamıyor. Açık oturumlar çalışmaya devam ediyor.',
        'Ne yap: Claude\'a "giriş alarmı" yaz. 16 Ekim\'deki gibi giriş servisi yeniden başlarken takılmış olabilir.',
        'Başladı 15:00 · HTTP 503',
    ].join('\n'));
    // 2 dk sonra hâlâ kapalı: yeni bildirim YOK, depoya yazma YOK.
    const b = karar(a.sonraki, sonuc, T0 + 2 * 60_000, LISTE);
    assert.deepEqual([b.bildirimler.length, b.degisti], [0, false]);
});

test('saatte bir hatırlatır, düzelince süresini söyler', () => {
    const sonuc = [kapali('giris'), ...hepsiOk().slice(1)];
    const a = karar({ basladi: 'x', kapali: {} }, sonuc, T0, LISTE);
    assert.equal(karar(a.sonraki, sonuc, T0 + HATIRLAT_MS - 60_000, LISTE).bildirimler.length, 0);
    const h = karar(a.sonraki, sonuc, T0 + HATIRLAT_MS, LISTE);
    assert.equal(h.bildirimler[0].title, 'Giriş hâlâ çalışmıyor · 1 sa');
    assert.equal(h.bildirimler[0].priority, 4);
    assert.match(h.bildirimler[0].message, /^Etkisi: /);
    const d = karar(h.sonraki, hepsiOk(), T0 + 83 * 60_000, LISTE);
    assert.equal(d.bildirimler[0].title, 'Giriş yeniden çalışıyor');
    assert.equal(d.bildirimler[0].message, '1 sa 23 dk kapalı kaldı (15:00 – 16:23).');
    assert.deepEqual(d.sonraki.kapali, {});
});

test('VPS 1 komple düşerse dört ayrı alarm değil, tek "sunucu" alarmı', () => {
    const sonuc = [kapali('giris'), kapali('veri'), kapali('personel'), kapali('masaustu'), ok('site')];
    const a = karar({ basladi: 'x', kapali: {} }, sonuc, T0, LISTE);
    assert.equal(a.bildirimler.length, 1);
    assert.equal(a.bildirimler[0].title, "Sunucu kapalı — TimeFlow'un hiçbir parçası çalışmıyor");
    assert.equal(a.bildirimler[0].priority, 5);
    assert.match(a.bildirimler[0].message, /Hostinger/);
});

test('süre yazımı', () => {
    assert.equal(sure(30_000), '1 dk');
    assert.equal(sure(4 * 60_000), '4 dk');
    assert.equal(sure(60 * 60_000), '1 sa');
    assert.equal(sure(65 * 60_000), '1 sa 5 dk');
    assert.equal(sure((51 * 60) * 60_000), '2 gün 3 sa');
});

test('sabah özeti 09:00 İstanbul = 06:00 UTC turunda', () => {
    assert.equal(sabahMi(Date.UTC(2026, 9, 17, 6, 0)), true);
    assert.equal(sabahMi(Date.UTC(2026, 9, 17, 6, 2)), false);
    assert.equal(sabahMi(Date.UTC(2026, 9, 17, 9, 0)), false);
    const o = ozet('sabah', hepsiOk(), {}, T0, LISTE);
    assert.equal(o.title, 'Her şey çalışıyor · 5/5');
    assert.equal(o.priority, 2);
    assert.match(o.message, /gelmediği gün izlemenin kendisi durmuştur/);
});

function sahteKV(ilk) {
    const depo = new Map(ilk ? [['durum', JSON.stringify(ilk)]] : []);
    let yazma = 0;
    return {
        depo, yazmalar: () => yazma,
        get: async (k, tur) => (depo.has(k) ? (tur === 'json' ? JSON.parse(depo.get(k)) : depo.get(k)) : null),
        put: async (k, v) => { yazma += 1; depo.set(k, v); },
    };
}
const ntfyler = (istekler) => istekler.filter((i) => i.url === 'https://ntfy.sh').map((i) => JSON.parse(i.init.body));

test('ilk tur "izleme başladı" der; sonraki sağlıklı turlar sessiz ve yazmasız', async () => {
    const DURUM = sahteKV(null);
    const ag = sahteAg((url) => (url === 'https://ntfy.sh' ? { status: 200 } : saglikli(url)));
    await calistir({ zaman: T0, env: { ...ENV, DURUM }, fetchImpl: ag.fetchImpl, uyu: async () => {} });
    const ilk = ntfyler(ag.istekler);
    assert.equal(ilk.length, 1);
    assert.equal(ilk[0].title, 'İzleme başladı · 5/5 ayakta');
    assert.equal(ilk[0].topic, 'konu-test');
    assert.equal(DURUM.yazmalar(), 1);

    ag.istekler.length = 0;
    await calistir({ zaman: T0 + 2 * 60_000, env: { ...ENV, DURUM }, fetchImpl: ag.fetchImpl, uyu: async () => {} });
    assert.equal(ntfyler(ag.istekler).length, 0);
    assert.equal(DURUM.yazmalar(), 1);
});

test('bildirim gidemezse durum yazılmaz — sonraki tur yeniden dener', async () => {
    const DURUM = sahteKV({ basladi: 'x', kapali: {} });
    const ag = sahteAg((url) => (url === 'https://ntfy.sh' ? { status: 500 }
        : url.endsWith('/auth/v1/health') ? { status: 503 } : saglikli(url)));
    const r = await calistir({ zaman: T0, env: { ...ENV, DURUM }, fetchImpl: ag.fetchImpl, uyu: async () => {} });
    assert.equal(r.yazildi, false);
    assert.equal(DURUM.yazmalar(), 0);
    assert.equal(ntfyler(ag.istekler)[0].title, 'Giriş çalışmıyor — kimse giriş yapamıyor');
});

test('sır eksikse tur atlanır, hiçbir yere istek gitmez', async () => {
    const ag = sahteAg(saglikli);
    const r = await calistir({ zaman: T0, env: { ...ENV, NTFY_TOPIC: '', DURUM: sahteKV(null) }, fetchImpl: ag.fetchImpl });
    assert.equal(r.atlandi, true);
    assert.equal(ag.istekler.length, 0);
});

test('konu yerine komut metni gelirse tur atlanır (2026-10-17 kurulum hatası)', async () => {
    const ag = sahteAg(saglikli);
    const r = await calistir({
        zaman: T0, fetchImpl: ag.fetchImpl,
        env: { ...ENV, NTFY_TOPIC: 'pbpaste | npx wrangler@4.147.0 secret put NTFY_TOPIC', DURUM: sahteKV(null) },
    });
    assert.equal(r.atlandi, true);
    assert.equal(ag.istekler.length, 0);
});

test('ntfy jetonu varsa hesapla gönderilir (paylaşılan adres 429 verir)', async () => {
    const DURUM = sahteKV({ basladi: 'x', kapali: {} });
    const ag = sahteAg((url) => (url === 'https://ntfy.sh' ? { status: 200 }
        : url.endsWith('/auth/v1/health') ? { status: 503 } : saglikli(url)));
    await calistir({ zaman: T0, env: { ...ENV, NTFY_TOKEN: 'tk_test', DURUM }, fetchImpl: ag.fetchImpl, uyu: async () => {} });
    const ntfy = ag.istekler.find((i) => i.url === 'https://ntfy.sh');
    assert.equal(ntfy.init.headers.authorization, 'Bearer tk_test');
    // Jeton yoksa başlık hiç gitmez (hesapsız kullanım bozulmasın).
    const ag2 = sahteAg((url) => (url === 'https://ntfy.sh' ? { status: 200 }
        : url.endsWith('/auth/v1/health') ? { status: 503 } : saglikli(url)));
    await calistir({ zaman: T0, env: { ...ENV, DURUM: sahteKV({ basladi: 'x', kapali: {} }) }, fetchImpl: ag2.fetchImpl, uyu: async () => {} });
    assert.equal('authorization' in ag2.istekler.find((i) => i.url === 'https://ntfy.sh').init.headers, false);
});

const PUSHOVER = 'https://api.pushover.net/1/messages.json';
const PO_ENV = { ...ENV, PUSHOVER_TOKEN: 'po-uygulama', PUSHOVER_USER: 'po-kisi' };

test('Pushover önceliği: düşüş acil, hatırlatma yüksek, düzelme normal, sabah sessiz', () => {
    assert.deepEqual([5, 4, 3, 2].map(pushoverOnceligi), [2, 1, 0, -1]);
    assert.deepEqual(kanallar(PO_ENV).map((k) => k.ad), ['pushover', 'ntfy']);
    assert.deepEqual(kanallar({ ...PO_ENV, NTFY_TOPIC: '' }).map((k) => k.ad), ['pushover']);
    // Bozuk ntfy konusu Pushover'ı durdurmaz; yalnız ntfy kanalı kapanır.
    assert.deepEqual(kanallar({ ...PO_ENV, NTFY_TOPIC: 'pbpaste | npx' }).map((k) => k.ad), ['pushover']);
});

test('düşüş Pushover\'a acil gider (5 dk\'da bir, en çok 1 sa); ntfy 429 verse de iletilmiş sayılır', async () => {
    const DURUM = sahteKV({ basladi: 'x', kapali: {} });
    const ag = sahteAg((url) => (url === PUSHOVER ? { status: 200, body: '{"status":1}' }
        : url === 'https://ntfy.sh' ? { status: 429 }
            : url.endsWith('/auth/v1/health') ? { status: 503 } : saglikli(url)));
    const r = await calistir({ zaman: T0, env: { ...PO_ENV, DURUM }, fetchImpl: ag.fetchImpl, uyu: async () => {} });
    const po = ag.istekler.filter((i) => i.url === PUSHOVER);
    assert.equal(po.length, 1);
    const form = new URLSearchParams(po[0].init.body);
    assert.equal(form.get('token'), 'po-uygulama');
    assert.equal(form.get('user'), 'po-kisi');
    assert.equal(form.get('title'), '🔴 Giriş çalışmıyor — kimse giriş yapamıyor');
    assert.equal(form.get('html'), '1');
    assert.match(form.get('message'), /^<b>Etkisi:<\/b> /);
    assert.match(form.get('message'), /<font color="#8e8e93">Başladı 15:00 · /);
    assert.deepEqual([form.get('priority'), form.get('retry'), form.get('expire')], ['2', '300', '3600']);
    assert.equal(r.yazildi, true);
    assert.equal(DURUM.yazmalar(), 1);
});

test('sabah mesajı Pushover\'da sessiz (-1), yeniden çalma yok', async () => {
    const ag = sahteAg((url) => (url === PUSHOVER ? { status: 200 } : saglikli(url)));
    await calistir({
        zaman: Date.UTC(2026, 9, 18, 6, 0), env: { ...PO_ENV, NTFY_TOPIC: '', DURUM: sahteKV({ basladi: 'x', kapali: {} }) },
        fetchImpl: ag.fetchImpl, uyu: async () => {},
    });
    const form = new URLSearchParams(ag.istekler.find((i) => i.url === PUSHOVER).init.body);
    assert.equal(form.get('title'), '✅ Her şey çalışıyor · 5/5');
    assert.equal(form.get('priority'), '-1');
    assert.equal(form.get('retry'), null);
});

test('bütün kanallar düşerse durum yazılmaz', async () => {
    const DURUM = sahteKV({ basladi: 'x', kapali: {} });
    const ag = sahteAg((url) => (url === PUSHOVER ? { status: 500 } : url === 'https://ntfy.sh' ? { status: 429 }
        : url.endsWith('/auth/v1/health') ? { status: 503 } : saglikli(url)));
    const r = await calistir({ zaman: T0, env: { ...PO_ENV, DURUM }, fetchImpl: ag.fetchImpl, uyu: async () => {} });
    assert.equal(r.yazildi, false);
    assert.equal(DURUM.yazmalar(), 0);
});

test('önem: sunucu/giriş acil, masaüstü bir kez sesli, lueratech.com uyandırmaz', () => {
    const tek = (id) => karar({ basladi: 'x', kapali: {} }, LISTE.map((k) => (k.id === id ? kapali(id) : ok(k.id))), T0, LISTE).bildirimler[0];
    assert.deepEqual(['giris', 'veri', 'personel', 'masaustu', 'site'].map((id) => pushoverOnceligi(tek(id).priority)), [2, 2, 2, 1, -1]);
    // Sessiz servisin saatlik hatırlatması da sessiz; acilinki sesli.
    const site = karar({ basladi: 'x', kapali: { site: { since: T0, sonUyari: T0 } } }, [...hepsiOk().slice(0, 4), kapali('site')], T0 + HATIRLAT_MS, LISTE);
    assert.equal(pushoverOnceligi(site.bildirimler[0].priority), -1);
    // Düzelme: acil servisinki bir kez sesli (normal), sessizinki sessiz.
    const d = karar({ basladi: 'x', kapali: { giris: { since: T0, sonUyari: T0 } } }, hepsiOk(), T0 + 600_000, LISTE);
    assert.equal(pushoverOnceligi(d.bildirimler[0].priority), 0);
});

test('saat İstanbul\'a göre ve eksiz', () => {
    assert.equal(saat(Date.UTC(2026, 9, 16, 23, 10)), '02:10');
    assert.equal(saat(T0), '15:00');
});

test('ntfy\'ye HTML gitmez, düz metin gider', async () => {
    const ag = sahteAg((url) => (url === 'https://ntfy.sh' ? { status: 200 }
        : url.endsWith('/auth/v1/health') ? { status: 503 } : saglikli(url)));
    await calistir({ zaman: T0, env: { ...ENV, DURUM: sahteKV({ basladi: 'x', kapali: {} }) }, fetchImpl: ag.fetchImpl, uyu: async () => {} });
    const n = ntfyler(ag.istekler)[0];
    assert.equal('html' in n, false);
    assert.doesNotMatch(n.message, /<b>|<font/);
});

test('wrangler.toml: 2 dk, dışarıya kapalı, sır içermiyor', () => {
    const toml = readFileSync(new URL('../ops/izleme/wrangler.toml', import.meta.url), 'utf8');
    assert.match(toml, /crons = \["\*\/2 \* \* \* \*"\]/);
    assert.match(toml, /workers_dev = false/);
    assert.match(toml, /binding = "DURUM"/);
    assert.doesNotMatch(toml, /eyJ|NTFY_TOPIC\s*=|SUPABASE_ANON_KEY\s*=|PUSHOVER_(TOKEN|USER)\s*=/);
});
