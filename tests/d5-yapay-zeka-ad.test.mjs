/**
 * D5 — yapay zekâya müşteri ADI gitmiyor (2026-10-16).
 *
 * 2026-10-15 denetimi: `remind` Gemini'ye ön ad + hizmet + saat + salon adı,
 * `draft-messages` Groq'a ön ad + son hizmet + gün gönderiyordu; hakem notu
 * ise "no AI service" diyordu. Apple 5.1.2(i) kişisel verinin üçüncü taraf
 * yapay zekâyla paylaşılmasını açık bildirim ve izne bağlıyor. Karar (kullanıcı
 * Claude'a bıraktı): ad HİÇ gitmesin — yer tutucu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NAME_RULE, NAME_TOKEN, fillName, firstNameOf } from '../supabase/functions/remind/aiName.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('dönen metne gerçek ön ad SUNUCUDA konuyor', () => {
    assert.equal(fillName('Merhaba {AD} 👋 Yarın 14:00 randevunuz var.', 'Ayşe Yılmaz'),
        'Merhaba Ayşe 👋 Yarın 14:00 randevunuz var.');
    assert.equal(firstNameOf('  Elif   Demir '), 'Elif');
});

test('yer tutucu YOKSA ya da birden FAZLAYSA metin kullanılmıyor — şablona düşülüyor', () => {
    // Model adı uydurmuş olabilir: "Merhaba Zeynep" — kullanılmaz.
    assert.equal(fillName('Merhaba Zeynep, yarın görüşürüz.', 'Ayşe'), null);
    assert.equal(fillName('{AD}, merhaba {AD}!', 'Ayşe'), null);
    assert.equal(fillName(null, 'Ayşe'), null);
    // Ad bilinmiyorsa şablon kendi biçiminde yazıyor.
    assert.equal(fillName('Merhaba {AD}', ''), null);
    assert.equal(fillName('Merhaba {AD}', null), null);
    assert.match(NAME_RULE, /\{AD\}/);
    assert.equal(NAME_TOKEN, '{AD}');
});

test('iki fonksiyonun yardımcısı BİREBİR aynı', () => {
    // `_shared`e konsaydı her deploy bütün fonksiyonları kapsamak zorundaydı.
    assert.equal(read('supabase/functions/draft-messages/aiName.ts'), read('supabase/functions/remind/aiName.ts'));
});

test('remind: dört istemin hiçbiri müşteri adını almıyor; dördü de dönüşte yer tutucuyu dolduruyor', () => {
    const remind = read('supabase/functions/remind/index.ts');
    for (const builder of ['buildAiPrompt', 'buildRecallAiPrompt', 'buildWinbackAiPrompt', 'buildRenewalAiPrompt']) {
        const start = remind.indexOf(`function ${builder}(`);
        assert.ok(start > 0, `${builder} yok`);
        const signature = remind.slice(start, remind.indexOf('{', start));
        assert.doesNotMatch(signature, /customerName/, `${builder} hâlâ adı alıyor`);
        const body = remind.slice(start, remind.indexOf('\n}\n', start));
        assert.doesNotMatch(body, /firstName|customerName/, `${builder} adı isteme koyuyor`);
        assert.match(body, /\$\{NAME_TOKEN\}/);
        assert.match(body, /\$\{NAME_RULE\}/);
    }
    // Model çağrısının TEK yolu ve dördü de doldurma kapısından geçiyor.
    assert.equal((remind.match(/await geminiMessage\(/g) ?? []).length, 4);
    assert.equal((remind.match(/fillName\(await geminiMessage\(/g) ?? []).length, 4);
});

test('draft-messages: Groq\'a giden listede ad yok; taslak tutmazsa şablon', () => {
    const draft = read('supabase/functions/draft-messages/index.ts');
    assert.match(draft, /ad: NAME_TOKEN,/);
    assert.doesNotMatch(draft, /ad: \(c\.name/);
    assert.match(draft, /message: fillName\(byRef\.get\(ref\), original\.name\)\s*\?\? fallbackDraft\(/);
    // Groq'a giden gövde yalnız istem ve güvenli liste.
    const call = draft.slice(draft.indexOf("fetch('https://api.groq.com"), draft.indexOf('if (!groqRes.ok)'));
    assert.match(call, /JSON\.stringify\(safeList, null, 2\)/);
    assert.doesNotMatch(call, /customers\b/);
});
