/**
 * Masaüstü · Ayarlar → WhatsApp v2 (2026-11-10).
 *
 * Tasarım: docs/design-reference/Luera Masaustu - WhatsApp v2.html.
 * Kilitlenenler:
 *   1. Durum cümleleri telefonla AYNI (src/lib/waLinkText ↔ mobile/src/lib/waLink).
 *   2. Üç soru şeridi, üç bölüm, sıra.
 *   3. "Kim cevap versin" iki bayrağın tek sorusu: Ben / Randevu botu / Akıllı asistan.
 *   4. Ham hata kodu ve hat numarası ekrana çıkmaz.
 *   5. Deneme modunda ilk numarada listede olmayanlara varsayılan "Kimse".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as desk from '../src/lib/waLinkText.ts';
import * as mob from '../mobile/src/lib/waLink.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ui = read('src/pages/settings/bolumler/WhatsApp.tsx');
const css = read('src/pages/settings/bolumler/whatsappV2.css');

const NOW = new Date(2026, 10, 10, 11, 0);

test('telefonla tek ses: bağlantı tarihi ve son hata cümleleri birebir aynı', () => {
    for (const iso of ['2026-10-29T10:00:00', '2026-11-10T08:00:00', '2025-12-20T08:00:00', '2026-03-03T10:00:00', 'bozuk']) {
        assert.equal(desk.sinceLabel(iso, NOW), mob.sinceLabel(iso, NOW), iso);
    }
    const at = new Date(2026, 10, 10, 10, 12).toISOString();
    for (const kind of ['invalid_phone', 'not_connected', 'session', 'busy', 'network', 'other']) {
        for (const message of ['reminder_24h', 'confirmation', 'cancellation', 'agent', null]) {
            const f = { kind, at, message };
            assert.deepEqual(desk.failureLine(f, NOW), mob.failureLine(f, NOW), `${kind}/${message}`);
        }
    }
});

test('sayfa üç soruyla açılır ve aynı sırayla ilerler', () => {
    const a = ui.indexOf('HAT ÇALIŞIYOR MU?'), b = ui.indexOf('SİZE YAZANA KİM CEVAP VERİYOR?'), c = ui.indexOf('MÜŞTERİNİZE NE GİDİYOR?');
    assert.ok(a > 0 && b > a && c > b);
    const s1 = ui.indexOf('id="w2-hat"'), s2 = ui.indexOf('id="w2-gelen"'), s3 = ui.indexOf('id="w2-giden"');
    assert.ok(s1 > 0 && s2 > s1 && s3 > s2, 'Hat → Gelen mesajlar → Müşterinize giden mesajlar');
});

test('kim cevap versin: iki bayrağın tek sorusu, veri değişmez', () => {
    assert.match(ui, /const respNow: Resp = !f\.assistant \? 'me' : agentOn \? 'ai' : 'bot';/);
    assert.match(ui, /if \(v === 'me'\) ok = await setFeature\('assistant'\)\(false\);/);
    assert.match(ui, /if \(agentOn !== wantAi\) ok = Boolean\(await saveAgent\(\{ enabled: wantAi \}\)\);/);
    for (const t of ['Ben cevaplarım', 'Randevu botu', 'Akıllı asistan']) assert.ok(ui.includes(`t: '${t}'`), t);
    // Akıllı asistana özgü ayarlar yalnız o seçiliyken.
    assert.match(ui, /\{resp === 'ai' && agent && \(/);
});

test('ham hata kodu ve hat numarası ekrana çıkmaz', () => {
    assert.doesNotMatch(ui, /health\.lastError|connection\.lastError/, 'ham hata metni gösterilmemeli');
    assert.match(ui, /failureLine\(health\.lastFailure\)/);
    assert.doesNotMatch(ui, /\+90 ?5\d\d/);
    for (const w of ['Anahtarı yok', 'Akıllı zamanlama', 'Deneme numaraları', 'AI ASİSTAN', 'dijital çalışan']) {
        assert.ok(!ui.includes(w), `eski/teknik kelime kaldı: ${w}`);
    }
    assert.match(ui, /Her randevuyu ayrı zamanla/);
    assert.match(ui, /Deneme modu/);
});

test('deneme modu: ilk numarada listede olmayanlara varsayılan "Kimse"', () => {
    assert.match(ui, /test_numbers: \[\.\.\.nums, n\], others: on \? a\.others : 'silent'/);
});

test('kaydetme: seçim/anahtar anında, yazılan alan kayıt çubuğuyla', () => {
    assert.match(ui, /<SaveBar state=\{t\.state\}/);
    // Yazılan alanlar yalnız "Düzenle" ile açılır.
    assert.match(ui, /editor=\{open\[m\.id\] \? <Duzenle /);
});

test('sağlık bilgisi canlı sorulur; dar ekranda örnek satırın altına iner', () => {
    assert.match(ui, /waHealth\(true\)/);
    assert.match(css, /@container w2 \(max-width: 760px\)[\s\S]*\.w2-pv\.side \{ display: none; \}[\s\S]*\.w2-pv\.inl \{ display: flex; \}/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});
