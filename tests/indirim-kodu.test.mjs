import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { indirimKodu as sunucu, kodlaAc } from '../supabase/functions/_shared/indirimKodu.ts';
import { indirimKodu as tarayici } from '../src/lib/indirimKodu.ts';

// Reklam bağlantısı: /satin-al?plan=pro&cycle=monthly&kod=ANKARA50 →
// Dodo ödeme sayfası kuponla açılır (docs/buyume/2026-11-reklam/).

const oku = (yol) => readFileSync(new URL(`../${yol}`, import.meta.url), 'utf8');

test('kod biçimi: süzülür, büyük harfe çevrilir; tarayıcı ve sunucu aynı', () => {
    const durumlar = [
        ['ANKARA50', 'ANKARA50'], [' ankara50 ', 'ANKARA50'], ['ilk50', 'ILK50'], ['TF-2026_A', 'TF-2026_A'],
        ['', null], ['AB', null], ['-ANKARA', null], ['ANKARA 50', null], ['ŞUBAT50', null],
        ['A'.repeat(33), null], ['X";drop', null], [null, null], [undefined, null], [50, null], [['ANKARA50'], null],
    ];
    for (const [girdi, beklenen] of durumlar) {
        assert.equal(sunucu(girdi), beklenen, `sunucu ${JSON.stringify(girdi)}`);
        assert.equal(tarayici(girdi), beklenen, `tarayıcı ${JSON.stringify(girdi)}`);
    }
});

const cevap = (status) => new Response(JSON.stringify({ checkout_url: 'https://dodo/x' }), { status });

test('Dodo kodu reddederse bir kez kodsuz açılır; başka hata tekrar denenmez', async () => {
    const uyar = console.warn; console.warn = () => {};
    try {
        let gelen = [];
        let r = await kodlaAc(async (k) => { gelen.push(k); return cevap(k ? 422 : 200); }, 'ANKARA50', 't');
        assert.deepEqual(gelen, ['ANKARA50', null]); assert.equal(r.res.status, 200); assert.equal(r.kodDustu, true);

        gelen = [];
        r = await kodlaAc(async (k) => { gelen.push(k); return cevap(200); }, 'ANKARA50', 't');
        assert.deepEqual(gelen, ['ANKARA50']); assert.equal(r.kodDustu, false);

        gelen = [];
        r = await kodlaAc(async (k) => { gelen.push(k); return cevap(502); }, 'ANKARA50', 't');
        assert.deepEqual(gelen, ['ANKARA50'], 'Dodo çöktüyse kodsuz deneme yok: ödeme yine açılmaz');
        assert.equal(r.res.status, 502);

        gelen = [];
        r = await kodlaAc(async (k) => { gelen.push(k); return cevap(400); }, null, 't');
        assert.deepEqual(gelen, [null], 'kod yoksa tek istek');
    } finally { console.warn = uyar; }
});

test('iki ödeme ucu da kodu süzüp Dodo\'ya discount_codes ve metadata ile gönderir', () => {
    for (const yol of ['supabase/functions/dodo-satin-al/index.ts', 'supabase/functions/dodo-checkout/index.ts']) {
        const f = oku(yol);
        assert.match(f, /indirimKodu\(body\.discount_code\)/, `${yol}: biçim süzgeci`);
        assert.match(f, /\.\.\.\(k \? \{ discount_codes: \[k\] \} : \{\}\)/, `${yol}: Dodo alanı`);
        assert.match(f, /indirim_kodu: k/, `${yol}: ölçüm için metadata`);
        assert.match(f, /kodlaAc\(/, `${yol}: reddedilen kod ödemeyi kapatmaz`);
        assert.doesNotMatch(f, /discount_code\.trim\(\)\.slice/, `${yol}: eski süzgeçsiz okuma kalmadı`);
    }
});

test('tarayıcı: /satin-al kodu taşır, oturumlu kişi /abonelik?kod= üstünden aynı kodla gider', () => {
    const s = oku('src/pages/SatinAlPage.tsx');
    assert.match(s, /const kod = indirimKodu\(params\.get\('kod'\)\);/);
    assert.match(s, /\.\.\.\(kod \? \{ discount_code: kod \} : \{\}\)/);
    assert.match(s, /`\/abonelik\?plan=\$\{plan\.id\}&cycle=\$\{cycle\}\$\{kod \? `&kod=\$\{kod\}` : ''\}`/);
    const p = oku('src/pages/PaywallPage.tsx');
    assert.match(p, /const kod = indirimKodu\(params\.get\('kod'\)\);/);
    assert.match(p, /startCheckout\(plan, params\.get\('cycle'\) === 'yearly' \? 'yearly' : 'monthly', undefined, \{ kod \}\)/);
    assert.match(p, /startCheckout\(plan, c, donus, \{ inlineError: inline, kod \}\)/);
    assert.match(oku('src/hooks/useBilling.ts'), /opts\?\.kod \? \{ discount_code: opts\.kod \} : \{\}/);
});
