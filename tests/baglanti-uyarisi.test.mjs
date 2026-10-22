import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
    isNetworkError, createBekci, probeDelayMs, BAGLANTI_METNI, STABLE_MS,
} from '../src/lib/baglantiKurallari.ts';

/**
 * BAĞLANTI UYARISI — masaüstü · 2026-10-23
 *
 * İnternet koptuğunda her veri kancası kendi "… yüklenemedi" bildirimini
 * atıyordu (Ayarlar › Abonelik açıkken: Personel listesi ×2 + Rezervasyonlar).
 *
 * Kilitlenenler:
 *   1. Ağ hatası ile sunucu hatası ayrılıyor — örnekler supabase-js 2.96'nın
 *      GERÇEK döndürdüğü biçim (fetch fırlatınca `code: ''`).
 *   2. Kaç kanca düşerse düşsün tek uyarı; bağlantı dönünce kalkıyor ve sayfa
 *      verisi bir kez yeniden çekiliyor.
 *   3. Tarayıcı "çevrimiçiyim" derken sunucuya varılamıyorsa yoklama artan
 *      aralıklarla kendisi tekrar ediyor ("online" olayı hiç gelmez).
 *   4. Kancalar: sayfa-yükleme hataları loadFailed'dan geçiyor ve her biri
 *      bağlantı dönünce yeniden çekiyor.
 */

// ── 1 · Ağ mı, sunucu mu? ──────────────────────────────────────────────────

// supabase-js (postgrest-js 2.96) fetch fırlatınca döndürdüğü hata
const fetchDustu = (message) => ({ message, details: `${message}\n    at fetch`, hint: '', code: '' });

test('tarayıcıların ağ hatası metinleri ağ sayılıyor', () => {
    assert.equal(isNetworkError(fetchDustu('TypeError: Failed to fetch'), true), true);                 // Chrome
    assert.equal(isNetworkError(fetchDustu('TypeError: Load failed'), true), true);                     // Safari
    assert.equal(isNetworkError(fetchDustu('TypeError: NetworkError when attempting to fetch resource.'), true), true); // Firefox
    assert.equal(isNetworkError(new TypeError('Failed to fetch'), true), true);                          // çıplak fetch
    assert.equal(isNetworkError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, true), true);
    assert.equal(isNetworkError({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' }, true), true);
});

test('tarayıcı çevrimdışıyken her okuma hatası ağ sayılıyor', () => {
    assert.equal(isNetworkError({ message: 'herhangi bir şey', code: '' }, false), true);
});

test('sunucu konuştuysa (kod var) gerçek hata — kendi bildirimini verir', () => {
    assert.equal(isNetworkError({ message: 'permission denied for table staff', code: '42501' }, true), false);
    assert.equal(isNetworkError({ message: 'JWT expired', code: 'PGRST301' }, true), false);
    assert.equal(isNetworkError({ message: 'Failed to fetch something', code: 'PGRST116' }, true), false);
    // vekil sunucunun HTML 502'si: kod yok ama ağ metni de yok → sunucu hatası
    assert.equal(isNetworkError({ message: '<html>502 Bad Gateway</html>' }, true), false);
});

test('iptal edilen istek ve hatasız sonuç ağ hatası değil', () => {
    assert.equal(isNetworkError(fetchDustu('AbortError: signal is aborted without reason'), true), false);
    assert.equal(isNetworkError({ name: 'AbortError', message: 'Failed to fetch' }, true), false);
    assert.equal(isNetworkError(null, true), false);
    assert.equal(isNetworkError(null, false), false);
});

test('uyarı metni sakin ve kendiliğinden yenileneceğini söylüyor', () => {
    for (const metin of Object.values(BAGLANTI_METNI)) {
        assert.match(metin, /kendiliğinden yenilenir\.$/);
        assert.doesNotMatch(metin, /!|hata|yüklenemedi/i);
    }
    assert.match(BAGLANTI_METNI.offline, /^İnternet bağlantınız yok\./);
});

// ── 2 · Bekçi ──────────────────────────────────────────────────────────────

function sahneKur({ online = true } = {}) {
    const olay = { show: [], hide: 0, recovered: 0, delays: [] };
    const timers = new Map();
    const probes = [];
    let id = 0;
    let saat = 1_000_000;
    const env = {
        online,
        isOnline: () => env.online,
        probe: () => new Promise((resolve) => probes.push(resolve)),
        show: (d) => olay.show.push(d),
        hide: () => { olay.hide += 1; },
        schedule: (fn, ms) => { id += 1; timers.set(id, fn); olay.delays.push(ms); return id; },
        cancel: (h) => { timers.delete(h); },
        now: () => saat,
        recovered: () => { olay.recovered += 1; },
    };
    const bekci = createBekci(env);
    const flush = () => new Promise((r) => setImmediate(r));
    return {
        env, bekci, olay, timers,
        ilerle: (ms) => { saat += ms; },
        /** Bekleyen zamanlayıcıyı çalıştır (tek bir tane olmalı). */
        zamanla: () => {
            assert.equal(timers.size, 1, 'tam bir yoklama bekliyor olmalı');
            const [[h, fn]] = timers;
            timers.delete(h);
            fn();
        },
        /** Bekleyen yoklamayı cevapla. */
        yokla: async (ok) => {
            assert.equal(probes.length, 1, 'tam bir yoklama sürüyor olmalı');
            probes.shift()(ok);
            await flush();
        },
        probes,
    };
}

test('çevrimdışıyken üç kanca düşse de tek uyarı', () => {
    const s = sahneKur({ online: false });
    s.bekci.networkError();   // personel
    s.bekci.networkError();   // personel (ikinci bileşen)
    s.bekci.networkError();   // rezervasyonlar
    assert.deepEqual(s.olay.show, ['offline']);
    assert.equal(s.timers.size, 0, 'çevrimdışıyken yoklama yok — "online" olayı beklenir');
    assert.equal(s.bekci.durum, 'offline');
});

test('tarayıcı "offline" deyince istek düşmesini beklemeden söyler; sonraki hatalar tekrar etmez', () => {
    const s = sahneKur({ online: false });
    s.bekci.wentOffline();
    s.bekci.networkError();
    assert.deepEqual(s.olay.show, ['offline']);
});

test('bağlantı dönünce: sunucu yoklanır, uyarı kalkar, veri bir kez yeniden çekilir', async () => {
    const s = sahneKur({ online: false });
    s.bekci.networkError();
    s.env.online = true;
    s.bekci.cameOnline();
    assert.equal(s.olay.hide, 0, 'yoklama cevaplanmadan kaldırılmıyor');
    await s.yokla(true);
    assert.equal(s.olay.hide, 1);
    assert.equal(s.olay.recovered, 1);
    assert.equal(s.bekci.durum, null);
    // kopma yokken gelen "online" olayı hiçbir şey yapmaz
    s.bekci.cameOnline();
    assert.equal(s.probes.length, 0);
    assert.equal(s.olay.recovered, 1);
});

test('"online" geldi ama hat yok (modem açık): metin değişir, yoklama kendisi tekrar eder', async () => {
    const s = sahneKur({ online: false });
    s.bekci.networkError();
    s.env.online = true;
    s.bekci.cameOnline();
    await s.yokla(false);
    assert.deepEqual(s.olay.show, ['offline', 'unreachable'], 'aynı uyarının metni güncellenir');
    assert.equal(s.olay.recovered, 0);
    s.zamanla();
    await s.yokla(true);
    assert.equal(s.olay.hide, 1);
    assert.equal(s.olay.recovered, 1);
});

test('çevrimiçiyken istekler düşüyorsa: "sunucuya ulaşılamıyor" + artan aralıklı yoklama', async () => {
    const s = sahneKur({ online: true });
    s.bekci.networkError();
    s.bekci.networkError();
    assert.deepEqual(s.olay.show, ['unreachable']);
    assert.equal(s.timers.size, 1, 'tek yoklama kuruldu');
    for (let i = 0; i < 6; i++) { s.zamanla(); await s.yokla(false); }
    assert.deepEqual(s.olay.delays, [2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    assert.deepEqual(s.olay.show, ['unreachable'], 'yoklama düştükçe uyarı yeniden açılmıyor');
    s.zamanla();
    await s.yokla(true);
    assert.equal(s.olay.recovered, 1);
});

test('yoklama sürerken tarayıcı çevrimdışı olursa yoklama durur, "online" beklenir', async () => {
    const s = sahneKur({ online: true });
    s.bekci.networkError();
    s.env.online = false;
    s.bekci.wentOffline();
    assert.equal(s.timers.size, 0, 'bekleyen yoklama iptal');
    assert.deepEqual(s.olay.show, ['unreachable', 'offline']);
});

test('toparlandıktan hemen sonra yine düşerse yoklama hızlanmıyor (döngü freni); bir dakika sonra baştan', async () => {
    const s = sahneKur({ online: true });
    s.bekci.networkError();                 // 2 sn
    s.zamanla(); await s.yokla(true);       // toparlandı
    s.bekci.networkError();                 // 4 sn — hemen yine düştü
    s.zamanla(); await s.yokla(true);
    s.ilerle(STABLE_MS + 1);
    s.bekci.networkError();                 // uzun süre sonra: 2 sn
    assert.deepEqual(s.olay.delays, [2000, 4000, 2000]);
});

test('kullanıcı uyarıyı kapattıysa bu kopma boyunca bir daha açılmaz; sonraki kopmada açılır', async () => {
    const s = sahneKur({ online: false });
    s.bekci.networkError();
    s.bekci.userDismissed();
    s.bekci.networkError();
    s.env.online = true;
    s.bekci.cameOnline();
    await s.yokla(false);                   // offline → unreachable geçişi de sessiz
    assert.deepEqual(s.olay.show, ['offline']);
    s.zamanla(); await s.yokla(true);
    assert.equal(s.olay.recovered, 1, 'kapatılmış olsa da veri yenilenir');
    s.env.online = false;
    s.bekci.networkError();
    assert.deepEqual(s.olay.show, ['offline', 'offline']);
});

test('uyarı programla kaldırılırken gelen onDismiss susturmaz', async () => {
    const s = sahneKur({ online: false });
    s.bekci.networkError();
    s.env.online = true;
    s.bekci.cameOnline();
    await s.yokla(true);
    s.bekci.userDismissed();                // sonner, toast.dismiss sonrası da onDismiss çağırır
    s.env.online = false;
    s.bekci.networkError();
    assert.deepEqual(s.olay.show, ['offline', 'offline']);
});

test('çıkış (veri gösteren sayfa kalmadı): uyarı sessizce kalkar, veri çekilmez', async () => {
    const s = sahneKur({ online: true });
    s.bekci.reset();
    assert.equal(s.olay.hide, 0, 'kopma yokken dokunmaz');
    s.bekci.networkError();
    s.bekci.reset();
    assert.equal(s.olay.hide, 1);
    assert.equal(s.timers.size, 0);
    assert.equal(s.olay.recovered, 0);
    assert.equal(s.bekci.durum, null);
});

test('yoklama aralığı: 2 sn başlar, ikiye katlanır, 30 sn tavan', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 10].map(probeDelayMs), [2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    assert.equal(probeDelayMs(-1), 2000);
});

// ── 3 · Kancalar ───────────────────────────────────────────────────────────

const oku = (p) => readFileSync(new URL(p, new URL('../', import.meta.url)), 'utf8');
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const kancalar = Object.fromEntries(
    readdirSync(new URL('../src/hooks/', import.meta.url))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => [f, kod(oku(`src/hooks/${f}`))]),
);

test('sayfa-yükleme hataları doğrudan toast.error atmıyor, loadFailed\'dan geçiyor', () => {
    const kalan = [];
    for (const [f, src] of Object.entries(kancalar)) {
        for (const m of src.matchAll(/toast\.error\(\s*'([^']*yüklenemedi[^']*)'/g)) kalan.push(`${f}: ${m[1]}`);
    }
    // Görsel yüklenemedi = dosya YÜKLEME (yazma) hatası, sayfa okuması değil
    assert.deepEqual(kalan, ['useOrgProfile.ts: Görsel yüklenemedi']);
});

test('loadFailed kullanan her kanca bağlantı dönünce yeniden çekiyor', () => {
    const kullananlar = Object.entries(kancalar).filter(([, src]) => /\bloadFailed\(/.test(src));
    assert.ok(kullananlar.length >= 8, `en az 8 kanca bekleniyordu, ${kullananlar.length} bulundu`);
    for (const [f, src] of kullananlar) {
        assert.match(src, /\buseOnReconnect\(/, `${f} bağlantı dönünce veriyi yeniden çekmiyor`);
    }
});

test('iç hata göstergesi olan listeler de bağlantı dönünce yeniden çekiyor', () => {
    for (const f of ['useResources.ts', 'useStaffTimeOff.ts', 'useWaitlist.ts']) {
        assert.match(kancalar[f], /\buseOnReconnect\(/, `${f} yeniden çekmiyor`);
    }
});

test('uyarı kopma başına tek kimlikle ve süresiz; yalnız kullanıcının kapatması susturur', () => {
    const wiring = kod(oku('src/lib/baglantiUyarisi.ts'));
    assert.match(wiring, /if \(!currentToast\) currentToast = /, 'kopma içinde kimlik sabit');
    assert.match(wiring, /duration: Infinity/);
    assert.match(wiring, /onDismiss: \(\) => \{ if \(id === currentToast\) bekci\.userDismissed\(\); \}/);
    assert.match(wiring, /toast\.dismiss\(currentToast\);\s*currentToast = '';/, 'kaldırınca kimlik boşalır → onDismiss susturmaz');
    assert.match(wiring, /addEventListener\('online'/);
    assert.match(wiring, /addEventListener\('offline'/);
});
