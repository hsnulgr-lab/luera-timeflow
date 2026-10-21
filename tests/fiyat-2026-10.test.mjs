import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    PLANS, planById, priceOf, fitsTeam, yearlyFreeMonths, yearlyPerMonth, yearlySaving,
} from '../src/lib/plans.ts';
import { PAKETLER, urunAdi } from '../ops/abonelik/dodo-urun.mjs';

// Fiyat turu 2026-10 (docs/devir/15): Tek kişilik 799 · Ekip 1.299 ·
// İşletme 1.999, yıllıkta 2 ay bedava. Vitrin (plans.ts), Dodo ürünleri
// (dodo-urun.mjs) ve ödeme fonksiyonu AYNI rakamı söylemek zorunda: sayfada
// bir fiyat gösterip başka tutar çekmek kaybedilecek en pahalı güven.

const oku = (yol) => readFileSync(new URL(`../${yol}`, import.meta.url), 'utf8');

test('vitrin: adlar, aylık, yıllık toplam; yıllık = 10 × aylık', () => {
    assert.deepEqual(PLANS.map((p) => [p.id, p.name, p.monthly, p.yearlyTotal]), [
        ['baslangic', 'Tek kişilik', 799, 7990],
        ['pro', 'Ekip', 1299, 12990],
        ['isletme', 'İşletme', 1999, 19990],
    ]);
    for (const p of PLANS) {
        assert.equal(p.yearlyTotal, p.monthly * 10, p.id);
        assert.equal(yearlyFreeMonths(p), 2, p.id);
        assert.equal(yearlySaving(p), p.monthly * 2, p.id);
        assert.equal(priceOf(p, 'yearly'), p.yearlyTotal, `${p.id}: yıllıkta çekilen tutar toplamdır`);
    }
    assert.deepEqual(PLANS.map(yearlyPerMonth), [666, 1083, 1666]);
    assert.equal(PLANS.filter((p) => p.popular).map((p) => p.id).join(), 'pro');
});

test('vitrin = Dodo ürünleri: her paket ve dönemde aynı tutar ve ad', () => {
    for (const k of PAKETLER) {
        const p = planById(k.plan);
        assert.ok(p, k.plan);
        assert.equal(k.tl, priceOf(p, k.aralik === 'Year' ? 'yearly' : 'monthly'), k.anahtar);
        assert.equal(k.ad, p.name, `${k.anahtar}: Dodo ürün adı vitrindeki adla aynı olmalı`);
        assert.ok(urunAdi(k).includes(p.name));
    }
    assert.equal(PAKETLER.length, PLANS.length * 2);
});

test('özellik listesi: yalnız bugün olanlar — "yakında" ve olmayan özellik satılmaz', () => {
    const hepsi = PLANS.flatMap((p) => p.features);
    for (const ft of hepsi) assert.equal('soon' in ft, false, ft.label);
    const metin = hepsi.map((ft) => ft.label).join(' | ');
    // Uygulamada karşılığı yok (2026-10-22): müşteriye açık API, çoklu şube,
    // rol & yetki, "özel rapor".
    for (const yok of [/API/i, /şube/i, /rol/i, /özel rapor/i]) assert.doesNotMatch(metin, yok);
    assert.equal(planById('baslangic').features[0].label, '1 çalışan');
});

test('Tek kişilik sınırı: bir aktif çalışan; sayı bilinmiyorsa engel yok', () => {
    const solo = planById('baslangic');
    assert.equal(solo.maxStaff, 1);
    assert.equal(fitsTeam(solo, 0), true);
    assert.equal(fitsTeam(solo, 1), true);
    assert.equal(fitsTeam(solo, 2), false);
    assert.equal(fitsTeam(solo, null), true, '/fiyatlar: işletme yok, sunucu bakar');
    for (const id of ['pro', 'isletme']) {
        assert.equal(planById(id).maxStaff, undefined);
        assert.equal(fitsTeam(planById(id), 40), true);
    }
});

test('ödeme fonksiyonu: sınır vitrinle aynı, yalnız YENİ alımda, aktif çalışanı sayar', () => {
    const fn = oku('supabase/functions/dodo-checkout/index.ts');
    const m = fn.match(/const MAX_STAFF: Record<string, number> = \{ ([^}]*) \};/);
    assert.ok(m, 'MAX_STAFF yok');
    const sunucu = Object.fromEntries(m[1].split(',').map((x) => x.trim()).filter(Boolean)
        .map((x) => { const [k, v] = x.split(':').map((y) => y.trim()); return [k, Number(v)]; }));
    const vitrin = Object.fromEntries(PLANS.filter((p) => p.maxStaff != null).map((p) => [p.id, p.maxStaff]));
    assert.deepEqual(sunucu, vitrin);

    // Sıra: süren abonelik (devam / already_subscribed) ÖNCE — Tek kişilik
    // abone sonradan büyürse iptalden vazgeçebilmeli; ürün haritası SONRA.
    const sure = fn.indexOf("return json({ error: 'already_subscribed' }, 409);");
    const sinir = fn.indexOf('const maxStaff = MAX_STAFF[plan];');
    const harita = fn.indexOf("getSecret(admin, 'DODO_PRODUCT_MAP')");
    assert.ok(sure > 0 && sinir > sure && harita > sinir, 'sınır kontrolünün yeri');
    const blok = fn.slice(sinir, harita);
    assert.match(blok, /from\('staff'\)/);
    assert.match(blok, /\.eq\('organization_id', orgId\)/);
    assert.match(blok, /\.not\('is_active', 'is', false\)/, 'is_active NULL aktif sayılır');
    assert.match(blok, /error: 'team_too_large'[^\n]*409/);
    assert.match(blok, /staff_lookup_failed/, 'sayılamazsa SATILMAZ');
});

test('ekranlar: yıllıkta çekilen tutar toplam; sığmayan kart pasif; yumuşak not', () => {
    // `.yearly` alanı kalktı: yerine yearlyTotal. Eski alanın tek bir okuyucusu
    // kalsa tsc yakalar; bu test eski çarpımın (aylığa düşen × 12) geri
    // gelmesine karşı.
    const dosyalar = [];
    const gez = (d) => {
        for (const ad of readdirSync(d)) {
            const yol = join(d, ad);
            if (statSync(yol).isDirectory()) gez(yol);
            else if (/\.(tsx?|mjs)$/.test(ad)) dosyalar.push(yol);
        }
    };
    gez(new URL('../src', import.meta.url).pathname);
    for (const yol of dosyalar) {
        const s = readFileSync(yol, 'utf8');
        assert.doesNotMatch(s, /\.yearly \* 12|\bp\.yearly\b|plan\.yearly\b/, yol);
    }

    const paywall = oku('src/pages/PaywallPage.tsx');
    assert.match(paywall, /const amount = priceOf\(plan, cycle\);/);
    assert.equal((paywall.match(/<PlanCards [^>]*activeStaff=\{activeStaff\}/g) ?? []).length, 3, 'üç kart listesi de ekibi bilmeli');
    assert.match(paywall, /\.from\('staff'\)\.select\('id', \{ count: 'exact', head: true \}\)\s*\.eq\('organization_id', id\)\.not\('is_active', 'is', false\)/);
    assert.doesNotMatch(paywall, /Pro'yu seç/);

    const kartlar = oku('src/components/billing/PlanCards.tsx');
    assert.match(kartlar, /const fits = fitsTeam\(p, activeStaff\);/);
    assert.match(kartlar, /Ekibinizde \{activeStaff\} kişi var/);
    assert.match(kartlar, /'\/ yıl'/);

    const ayar = oku('src/pages/settings/bolumler/Abonelik.tsx');
    assert.match(ayar, /const charge = plan \? priceOf\(plan, cycle\) : 0;/);
    assert.match(ayar, /Sonraki tahsilat[\s\S]*?formatTRY\(charge\)/);
    assert.match(ayar, /\{plan && !fitsTeam\(plan, activeStaff\) && \(/, 'büyüyen Tek kişilik aboneye not');
    assert.doesNotMatch(ayar, />2 ay bedava</, 'sabit yazılmaz');

    const fiyat = oku('src/pages/public/PricingPage.tsx');
    assert.doesNotMatch(fiyat, /kahve/i, '799 TL "bir kahve parası" değil');
    assert.doesNotMatch(fiyat, /3 kişi/);

    assert.match(oku('src/hooks/useBilling.ts'), /code === 'team_too_large'/);
});

test('telefon uygulaması fiyat ve paket adı taşımaz (Apple 3.1.1)', () => {
    const dosyalar = [];
    const gez = (d) => {
        for (const ad of readdirSync(d)) {
            if (ad === 'node_modules' || ad.startsWith('.')) continue;
            const yol = join(d, ad);
            if (statSync(yol).isDirectory()) gez(yol);
            else if (/\.tsx?$/.test(ad)) dosyalar.push(yol);
        }
    };
    gez(new URL('../mobile/src', import.meta.url).pathname);
    assert.ok(dosyalar.length > 20);
    for (const yol of dosyalar) {
        const s = readFileSync(yol, 'utf8');
        assert.doesNotMatch(s, /lib\/plans|Tek kişilik paket|Ekip paket|₺\s?(799|1\.299|1\.999)/, yol);
    }
});
