import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Demo tohumu · satılmış paketler (2026-10-16, 1.0.1 hakem turu). Hakem
// Profil › Paketler'i, Akış'ın halkasını ve müşteri kartının halkasını boş
// görmesin. Tohum üretimde çalışıyor: 061'in ödeme kurallarına uymazsa BÜTÜN
// tohum geri alınır ve demo o gün hiç yenilenmez.

const seed = readFileSync(new URL('../supabase/DEMO_salon.sql', import.meta.url), 'utf8');
const block = seed.slice(seed.indexOf('-- ── SATILMIŞ PAKETLER'), seed.indexOf('-- ── Tahsilat'));
const arr = (name) => {
    const m = block.match(new RegExp(`\\(ARRAY\\[([^\\]]+)\\]\\)\\[v_i \\+ 1\\],\\s*--?\\s*${name}`));
    return m;
};
const nums = (re) => {
    const m = block.match(re);
    assert.ok(m, `bulunamadı: ${re}`);
    return m[1].split(',').map((x) => Number(x.trim()));
};

test('blok tahsilattan ÖNCE ve döngü değişkeni tanımlı', () => {
    assert.ok(block.length > 200, 'SATILMIŞ PAKETLER bloğu yok');
    assert.match(seed, /v_plan UUID;/);
    assert.ok(seed.indexOf('-- ── SATILMIŞ PAKETLER') > seed.indexOf('-- ── YARIN VE ÖBÜR GÜN'));
});

test('061: ödeme ≤ bedel, > 0; seans 1–50 ve kullanılan ≤ toplam (064)', () => {
    const totals = nums(/\(ARRAY\[(7500[^\]]*)\]\)\[v_i \+ 1\]/);
    const paid = nums(/\(ARRAY\[(4900[^\]]*)\]\)\[v_i \+ 1\]/);
    const count = nums(/\(ARRAY\[(6, 4, 10)\]\)\[v_i \+ 1\]/);
    const done = nums(/\(ARRAY\[(2, 3, 10)\]\)\[v_i \+ 1\]/);
    totals.forEach((t, i) => {
        assert.ok(paid[i] > 0 && paid[i] <= t, `ödeme ${paid[i]} / bedel ${t}`);
        assert.ok(count[i] >= 1 && count[i] <= 50 && done[i] >= 0 && done[i] <= count[i]);
    });
    // Üç hâl: borçlu, son seans, biten.
    assert.equal(totals[0] - paid[0], 2600);
    assert.equal(count[1] - done[1], 1);
    assert.equal(count[2] - done[2], 0);
    assert.match(block, /CASE WHEN v_i = 2 THEN 'completed' ELSE 'active' END/);
});

test('ödeme planın müşterisine, taksitsiz, paket türü "paket"', () => {
    assert.match(block, /INSERT INTO payments \(organization_id, customer_id, reservation_id, treatment_plan_id,/);
    assert.match(block, /v_org, v_c, NULL, v_plan, 'service',/);
    assert.match(block, /RETURNING id INTO v_plan;/);
    assert.match(block, /'paket',/);
    assert.doesNotMatch(block, /installment/);
});

test('satış ve ödeme 45 gün önce — bugünün, haftanın, ayın Kasa toplamı değişmez', () => {
    assert.equal((block.match(/\(v_today - 45\)/g) || []).length, 2);
});

test('müşteriler tohumun kendi müşterileri; ikisi BUGÜN Akış\'ta', () => {
    for (const name of ['Vildan Ay', 'Yasemin Kurt', 'Ayşe Yıldız']) {
        assert.ok(seed.split(name).length >= 3, `${name} tohumda tanımlı değil`);
    }
    const today = seed.slice(seed.indexOf('-- ── BUGÜN'), seed.indexOf('-- ── YARIN VE ÖBÜR GÜN'));
    assert.match(today, /'Vildan Ay','Yasemin Kurt'/);
    void arr;
});
