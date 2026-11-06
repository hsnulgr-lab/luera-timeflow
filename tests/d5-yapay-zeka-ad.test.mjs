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

import { NAME_RULE, NAME_TOKEN, fillName, firstNameOf } from '../supabase/functions/draft-messages/aiName.ts';

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

test('remind yapay zekâya hiç gitmiyor: metinler sabit şablondan (tek ses, 2026-11-07)', () => {
    const remind = read('supabase/functions/remind/index.ts');
    assert.doesNotMatch(remind, /generativelanguage|geminiMessage|GEMINI_API_KEY/);
    assert.doesNotMatch(remind, /aiName/);
    assert.match(remind, /from '\.\.\/_shared\/booking\/messages\.ts'/);
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
