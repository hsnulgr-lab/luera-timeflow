import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { normalizePhone, hasWa, dialable, waLink } from '../mobile/src/lib/phone.ts';
import {
    pillCells, pillOpens, cellSpec, crossFade, reducedFill,
    waRecord, callRecord, staffRecord, recordVisible, recordAge,
    RECORD_STALE_MINUTES, SEND_WINDOW_SECONDS, sendingRecord, pillMotion,
} from '../mobile/src/lib/actionPill.ts';
import {
    nextSlots, pillInputOf, pillRecordOf, applyPillAction, applySendResult, cancelSend,
    overrunMinutes, overrunLine, cancelledCard, bookedCard, etaPanel,
} from '../mobile/src/lib/managerFlow.ts';
import { mockSendResult } from '../mobile/src/lib/mockSend.ts';
import { mockDay } from '../mobile/src/lib/managerFlow.ts';

// ── Telefon normalizasyonu ──────────────────────────────────────────────────

test('mobil numarayı masaüstüyle aynı biçime çevirir', () => {
    assert.equal(normalizePhone('0532 118 24 06'), '905321182406');
    assert.equal(normalizePhone('+90 532 118 24 06'), '905321182406');
    assert.equal(normalizePhone('5321182406'), '905321182406');
    assert.equal(normalizePhone('00905321182406'), '905321182406');
});

test('yazılamayan numara null döner — göz çizilmesin diye', () => {
    assert.equal(normalizePhone('123'), null);
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone(null), null);
    // Sabit hat: 90'dan sonrası 5 ile başlamıyor.
    assert.equal(normalizePhone('02121234567'), null);
    assert.equal(hasWa('0212 123 45 67'), false);
});

test('arama ve wa.me aynı normalizasyondan geçer', () => {
    assert.equal(dialable('0532 118 24 06'), '+905321182406');
    assert.equal(waLink('0532 118 24 06'), 'https://wa.me/905321182406');
    assert.equal(dialable('yok'), null);
});

// ── Hapın gözleri ───────────────────────────────────────────────────────────

test('numara yoksa iki kanal da HİÇ çizilmez', () => {
    const cells = pillCells({ canDrop: true, canTellStaff: true });
    assert.deepEqual(cells, ['nox', 'inf']);
});

test('tam veri dört göz verir ve sıra sabittir', () => {
    const cells = pillCells({
        customerPhone: '0532 118 24 06', waConnected: true,
        canDrop: true, canTellStaff: true,
    });
    assert.deepEqual(cells, ['ara', 'wa', 'nox', 'inf']);
});

test('opt-out gözü BİR DAHA çizmez, ama arama kalır', () => {
    const cells = pillCells({
        customerPhone: '0532 118 24 06', waResult: 'opt_out',
        canDrop: true, canTellStaff: true,
    });
    assert.deepEqual(cells, ['ara', 'nox', 'inf']);
});

test('geçersiz numara İKİ kanalı birden düşürür — aynı numara', () => {
    const cells = pillCells({
        customerPhone: '0532 118 24 06', waResult: 'invalid_phone',
        canDrop: true, canTellStaff: true,
    });
    assert.deepEqual(cells, ['nox', 'inf']);
});

test('WhatsApp bağlı değilse göz SİLİNMEZ, onarıma döner', () => {
    const cells = pillCells({
        customerPhone: '0532 118 24 06', waConnected: false,
        canDrop: true, canTellStaff: true,
    });
    assert.deepEqual(cells, ['ara', 'waoff', 'nox', 'inf']);
    assert.equal(cellSpec('waoff').hint, 'Ayarlara git');
});

test('tek gözlü hap açılmaz — hap seçim sunmak için var', () => {
    assert.equal(pillOpens(['nox']), false);
    assert.equal(pillOpens(['ara', 'nox']), true);
});

test('düşmüş randevuda Gelmedi gözü çizilmez', () => {
    const cells = pillCells(pillInputOf({
        kind: 'noshow', customerPhone: '0532 118 24 06',
    }));
    assert.equal(cells.includes('nox'), false);
});

test('"Personele bilgi ver" gözü GİZLİ — bildirim kanalı yok', () => {
    // Açıklaması "bildirim gider" diyordu ama müdürden personele bildirim
    // gönderen bir yol yok; basınca yalnız telefonda bir damga kalıyordu.
    // Göz, kaydı ve metni hazır — kanal yazılınca `canTellStaff` true'ya döner.
    for (const kind of ['next', 'noshow']) {
        const input = pillInputOf({ kind, customerPhone: '0532 118 24 06' });
        assert.equal(input.canTellStaff, false);
        assert.equal(pillCells(input).includes('inf'), false);
    }
});

// ── İkinci yuvanın takası ───────────────────────────────────────────────────

test('zamanında Gelmedi, gecikince hap — TAKAS, ekleme değil', () => {
    assert.equal(nextSlots({ etaMinutes: 6 }).secondary, 'gelmedi');
    assert.equal(nextSlots({ etaMinutes: -8 }).secondary, 'pill');
    // Birincil hiç değişmez.
    assert.equal(nextSlots({ etaMinutes: -8 }).primary, 'Geldi');
});

test('gönderim penceresi açıkken ikinci yuva Geri al olur', () => {
    assert.equal(nextSlots({ etaMinutes: -8, sendingLeft: 3 }).secondary, 'undo');
});

// ── Kartın alt satırı ───────────────────────────────────────────────────────

test('gecikince alt satır geri sayıma döner — saat ikinci kez yazılmaz', () => {
    const panel = etaPanel({ time: '11:30', etaMinutes: -8, durationMinutes: 45, toleranceMinutes: 30 });
    assert.equal(panel.sub, '22 dk sonra gelmedi sayılır');
    assert.equal(panel.sub.includes('11:30'), false);
});

// ── Kayıt satırı ────────────────────────────────────────────────────────────

test('arama kaydı yalnız müdürün ne yaptığını söyler', () => {
    assert.equal(callRecord(2).text, 'Arandı · 2 dk');
    assert.equal(callRecord(0).text, 'Arandı · şimdi');
    assert.equal(recordAge(0), 'şimdi');
});

test('gönderim sonucu GERÇEK teslimatı söyleyebilir', () => {
    assert.equal(waRecord('ok', 2).text, 'Yazıldı · 2 dk');
    assert.equal(waRecord('ok', 2).stales, true);
});

test('bitmemiş iş BAYATLAMAZ ve süre yazmaz', () => {
    for (const result of ['not_connected', 'invalid_phone', 'failed']) {
        const record = waRecord(result, 40);
        assert.equal(record.stales, false, result);
        assert.equal(/\d+ dk/.test(record.text), false, `${result} süre yazmamalı`);
        assert.equal(recordVisible(record, 40), true, result);
    }
});

test('bayatlayan kayıt 10. dakikada düşer', () => {
    const record = callRecord(9);
    assert.equal(recordVisible(record, 9), true);
    assert.equal(recordVisible(record, RECORD_STALE_MINUTES), false);
});

test('personel kaydı TESLİMAT İDDİA ETMEZ', () => {
    const text = staffRecord(2).text;
    assert.equal(text, 'Personele söylendi · 2 dk');
    assert.equal(/iletildi|gönderildi/i.test(text), false);
});

// ── Eylemler ────────────────────────────────────────────────────────────────

test('Yaz doğrudan göndermez — 5 saniyelik pencereyi açar', () => {
    const event = { id: 'x', kind: 'next', time: '11:30', firstName: 'A', lastName: 'B', detail: '', etaMinutes: -8 };
    const next = applyPillAction(event, 'wa');
    assert.equal(next.sendingLeft, SEND_WINDOW_SECONDS);
    assert.equal(next.waResult, undefined, 'pencere içinde sonuç YOK');
    assert.equal(next.actedCell, 'wa');
});

test('pencere içinde vazgeçilince kayıt HİÇ kalmaz', () => {
    const event = { id: 'x', kind: 'next', time: '11:30', firstName: 'A', lastName: 'B', detail: '', etaMinutes: -8 };
    const sending = applyPillAction(event, 'wa');
    const cancelled = cancelSend(sending);
    assert.equal(cancelled.sendingLeft, undefined);
    assert.equal(cancelled.actedCell, undefined);
    assert.equal(pillRecordOf(cancelled), null);
});

test('pencere dolunca sonuç yazılır, pencere kapanır', () => {
    const event = { id: 'x', kind: 'next', time: '11:30', firstName: 'A', lastName: 'B', detail: '', etaMinutes: -8 };
    const done = applySendResult(applyPillAction(event, 'wa'), 'ok');
    assert.equal(done.sendingLeft, undefined);
    assert.equal(done.waResult, 'ok');
});

test('Gelmedi gözü kaydı noshow yapar', () => {
    const event = { id: 'x', kind: 'next', time: '11:30', firstName: 'A', lastName: 'B', detail: '', etaMinutes: -8 };
    const next = applyPillAction(event, 'nox');
    assert.equal(next.kind, 'noshow');
    assert.equal(next.noshowMinutes, 8);
    assert.equal(next.etaMinutes, undefined);
});

test('waoff bir gönderim değil, geçiştir — durum değişmez', () => {
    const event = { id: 'x', kind: 'next', time: '11:30', firstName: 'A', lastName: 'B', detail: '' };
    assert.equal(applyPillAction(event, 'waoff'), null);
});

test('pencere kartta canlı nokta gösterir', () => {
    const record = sendingRecord(5);
    assert.equal(record.text, 'Yazılıyor · 5');
    assert.equal(record.tone, 'live');
});

// ── Süre aşımı ──────────────────────────────────────────────────────────────

test('süre aşımı bilgidir — eylem üretmez', () => {
    assert.equal(overrunMinutes({ elapsedSeconds: 70 * 60, durationMinutes: 45 }), 25);
    assert.equal(overrunMinutes({ elapsedSeconds: 30 * 60, durationMinutes: 45 }), 0);
    assert.equal(overrunLine({ elapsedSeconds: 30 * 60, durationMinutes: 45 }), null);
    assert.equal(
        overrunLine({ elapsedSeconds: 70 * 60, durationMinutes: 45, staffName: 'Selin Demir' }),
        '45 dk işlem · 25 dk aştı · Selin ile',
    );
});

test('süre bilinmiyorsa aşım UYDURULMAZ', () => {
    assert.equal(overrunMinutes({ elapsedSeconds: 70 * 60 }), 0);
    assert.equal(overrunLine({ elapsedSeconds: 70 * 60 }), null);
});

// ── İptal ───────────────────────────────────────────────────────────────────

test('iptal kartı bekleyene SORMAZ — sunucu zaten sordu, rapor eder', () => {
    const card = cancelledCard({
        id: 'x', kind: 'cancelled', time: '11:30', firstName: 'A', lastName: 'B',
        detail: '', durationMinutes: 45, waitlistAsked: 3, staffName: 'Selin Demir',
    });
    assert.equal(card.sub, '3 bekleyene soruldu · 11:30, Selin');
    assert.deepEqual(card.actions.map((a) => a.label), ['Saati doldur']);
});

test('bekleyen yoksa SIFIR yazılır — ölçüm boş bırakılmaz', () => {
    const card = cancelledCard({
        id: 'x', kind: 'cancelled', time: '11:30', firstName: 'A', lastName: 'B',
        detail: '', durationMinutes: 45, waitlistAsked: 0,
    });
    assert.equal(card.sub.startsWith('Bekleyen yok'), true);
});

test('bekleme listesi bilinmiyorsa SIFIR denmez', () => {
    const card = cancelledCard({
        id: 'x', kind: 'cancelled', time: '11:30', firstName: 'A', lastName: 'B',
        detail: '', durationMinutes: 45,
    });
    assert.equal(card.sub.includes('Bekleyen yok'), false);
    assert.equal(card.sub.includes('bilinmiyor'), true);
});

// ── Online randevu ──────────────────────────────────────────────────────────

test('yalnız onay bekleyen randevuda düğme çizilir', () => {
    const base = {
        id: 'x', kind: 'booked', time: '11:30', firstName: 'A', lastName: 'B',
        detail: 'Yarın 14:00 · Keratin bakımı · Selin', bookedAgoMinutes: 4,
    };
    assert.deepEqual(
        bookedCard({ ...base, pending: true }).actions.map((a) => a.label),
        ['Onayla', 'Reddet'],
    );
    // Otomatik onay açıksa karar zaten verilmiş: ölü kontrol yok.
    assert.deepEqual(bookedCard({ ...base, pending: false }).actions, []);
});

test('reddetme 5 saniyelik pencere açar — mesaj hemen gitmez', () => {
    const card = bookedCard({
        id: 'x', kind: 'booked', time: '11:30', firstName: 'A', lastName: 'B',
        detail: 'Yarın 14:00', bookedAgoMinutes: 4, rejectedLeft: 5,
    });
    assert.equal(card.sub.includes('5 sn sonra gidecek'), true);
    assert.deepEqual(card.actions.map((a) => a.label), ['Geri al']);
});

// ── Hareket sözleşmesi ──────────────────────────────────────────────────────

test('basılı tutma 500 ms — iOS\'un kendi uzun basma eşiği', () => {
    // 3000 → 1200 → 1000 → 500, hepsi cihazda denenerek. Artık "koruma"
    // değil, standart bir uzun basış. Kabul edilebilir olmasının sebebi
    // dördünün de geri dönüşünün olması.
    assert.equal(pillMotion.hold, 500);
    // Geri dönüş dolgunun üçte birinden kısa: vazgeçmek cezalandırılmaz.
    assert.ok(pillMotion.release < pillMotion.hold / 3, 'geri alma cezalandırılmaz');
});

test('simge çapraz sönmesi dolgunun ortasında olur', () => {
    assert.equal(crossFade(0.2), 0);
    assert.equal(crossFade(1), 1);
    assert.ok(crossFade(0.55) > 0 && crossFade(0.55) < 1);
});

test('reduceMotion dolguyu DURDURMAZ — dolgu bir bilgidir', () => {
    assert.equal(reducedFill(0), 0);
    assert.equal(reducedFill(1), 1);
    assert.ok(reducedFill(0.5) > 0, 'kademeli ama ilerliyor');
    // Sözleşme: hareket durur, BİLGİ DURMAZ. Kelime bloğu kaldırıldıktan
    // sonra "daha ne kadar tutmalıyım"ı söyleyen tek şey bu dolgu — o yüzden
    // reduceMotion'da bile ilerlemek ZORUNDA.
});

// ── Sahte gönderim ──────────────────────────────────────────────────────────

test('sahte sonuç kimlikten türer — her yenilemede değişmez', () => {
    const event = { id: 'e1', customerPhone: '0532 118 24 06' };
    assert.equal(mockSendResult(event), mockSendResult(event));
});

test('sahte sonuç da numarasız kartta geçersiz döner', () => {
    assert.equal(mockSendResult({ id: 'e1', customerPhone: null }), 'invalid_phone');
});

// ── Ekranın sözleşmesi ──────────────────────────────────────────────────────

test('tolerans rozeti kaldırıldı — geri sayım kartın içinde', () => {
    const src = readFileSync(new URL('../mobile/src/components/FlowParts.tsx', import.meta.url), 'utf8');
    assert.equal(/<ToleranceChip/.test(src), false, 'kartın ALTINA rozet çizilmemeli');
});

test('A1 sol sütunu ÜSTE yaslı — rakam zıplamamalı', () => {
    const src = readFileSync(new URL('../mobile/src/components/FlowParts.tsx', import.meta.url), 'utf8');
    const panel = src.slice(src.indexOf('function EtaPanel('), src.indexOf('function CustomerCard('));
    assert.equal(panel.includes("alignItems: 'flex-start'"), true);
});

test('saf katman React ve react-native taşımaz', () => {
    for (const file of ['phone.ts', 'actionPill.ts', 'mockSend.ts']) {
        const src = readFileSync(new URL(`../mobile/src/lib/${file}`, import.meta.url), 'utf8');
        const imports = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        assert.equal(/from '(react|react-native|expo)/.test(imports), false, file);
    }
});

test('A1 sağ sütunu GERİLİR — iki hapın kenarları çakışsın', () => {
    const src = readFileSync(new URL('../mobile/src/components/FlowParts.tsx', import.meta.url), 'utf8');
    const panel = src.slice(src.indexOf('function EtaPanel('), src.indexOf('/** Tetikleyicinin yön oku'));
    assert.equal(/alignItems: 'stretch'/.test(panel), true);
});

test('hap tetikleyicinin sütununda — çapa sağ kenara oturur', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.equal(/right: 0,/.test(src), true);
    // Ok ucunun yeri SABİT DEĞİL: tetikleyicinin genişliğinden türer.
    const tokens = readFileSync(new URL('../mobile/src/theme/tokens.ts', import.meta.url), 'utf8');
    assert.equal(/arrowInset: \(triggerWidth: number\)/.test(tokens), true);
});

test('hapa overflow verilmez — ok ucu kırpılırdı', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    const pill = src.slice(src.indexOf('flexDirection: \'row\','), src.indexOf('{/* Ok ucu'));
    assert.equal(/overflow: 'hidden'/.test(pill), false);
});

// Müdür 34 · KÖŞE KIRPMA SORUNU ORTADAN KALKTI.
// v1'de dolgu dikdörtgendi ve gözün köşesine dayanıyordu; ilk ve son gözün
// yarıçapı elle verilmek zorundaydı ve `:last-child` sessizce eşleşmeyince
// köşeler taşıyordu. v2'de dolgu 39,5 pt'lik bir DAİRE ve 60 pt'lik gözün
// ortasında duruyor — hapın köşesine hiç yaklaşmıyor. Kırpmaya gerek yok.
test('gözün dolgusu daire — hapın köşesine değmiyor', () => {
    const tokens = readFileSync(new URL('../mobile/src/theme/tokens.ts', import.meta.url), 'utf8');
    const eye = Number(/eye: ([\d.]+)/.exec(tokens)[1]);
    const cell = Number(/cell: ([\d.]+)/.exec(tokens)[1]);
    const disc = Number(/disc: ([\d.]+)/.exec(tokens)[1]);
    const radius = Number(/radius: ([\d.]+)/.exec(tokens)[1]);
    assert.ok(eye < cell, 'halka gözden dar');
    assert.ok(disc < eye, 'disk halkanın içinde');
    // Gözün kenarı ile halkanın kenarı arasındaki pay, hapın köşe yarıçapını
    // aşıyorsa dolgu köşeye hiçbir hâlde yaklaşamaz.
    assert.ok((cell - eye) / 2 + (eye - disc) / 2 >= radius / 2, 'köşe payı yeterli');
});

test('ayraç çizgisi kalktı — halkalar zaten ayırıyor', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.equal(/M\.divider/.test(src), false);
});

// ── Online randevu: hiçbir düğme ölü kalmasın ───────────────────────────────

import { applyFlowAction } from '../mobile/src/lib/managerFlow.ts';

const online = {
    id: 'e14', kind: 'booked', time: '11:33', firstName: 'Zeynep', lastName: 'Kaya',
    detail: 'Yarın 14:00 · Keratin bakımı · Selin', pending: true, bookedAgoMinutes: 4,
};

test('Onayla randevuyu onaylar ve düğmeleri düşürür', () => {
    const next = applyFlowAction(online, 'Onayla');
    assert.equal(next.pending, false);
    assert.deepEqual(bookedCard(next).actions, []);
});

test('Reddet HEMEN göndermez — 5 saniyelik pencere açar', () => {
    const next = applyFlowAction(online, 'Reddet');
    assert.equal(next.rejectedLeft, SEND_WINDOW_SECONDS);
    assert.equal(next.kind, 'booked', 'pencere içinde randevu daha iptal olmadı');
    assert.deepEqual(bookedCard(next).actions.map((a) => a.label), ['Geri al']);
});

test('pencere içinde Geri al randevuyu kurtarır', () => {
    const rejected = applyFlowAction(online, 'Reddet');
    const undone = applyFlowAction(rejected, 'Geri al');
    assert.equal(undone.rejectedLeft, undefined);
    assert.equal(undone.pending, true);
});

test('kartın her düğmesinin bir karşılığı var — ölü kontrol yok', () => {
    for (const pending of [true, false]) {
        for (const action of bookedCard({ ...online, pending }).actions) {
            if (action.kind === 'stamp') continue;
            assert.notEqual(
                applyFlowAction({ ...online, pending }, action.label), null,
                `${action.label} hiçbir şey yapmıyor`,
            );
        }
    }
});

test('transformOrigin dizisi ÜÇ değer taşır — RN ikisinde patlıyor', () => {
    // "Transform origin must have exactly 3 values." — CSS'in iki değerli
    // kısayolu react-native'de yok; cihazda render hatası veriyordu.
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    for (const m of src.matchAll(/transformOrigin:\s*\[([^\]]*)\]/g)) {
        const values = m[1].split(',').map((v) => v.trim()).filter(Boolean);
        assert.equal(values.length, 3, `transformOrigin ${values.length} değerli: ${m[1]}`);
    }
});

test('sakin hapta turuncu YOK — dolgu yalnız basılıyken kurulur', () => {
    // Cihazda dinlenen hap turuncu görünüyordu: her göze `scaleY: 0` bir
    // katman konuyordu ve `transformOrigin` uygulanmadan bir kare geçince
    // sıfır ölçek tam boy boyanıyordu. Katmanı hiç kurmamak bu sınıfı kapatır.
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.equal(/\{active && !off \? \(/.test(src), true, 'dolgu active kapısından geçmeli');
    assert.equal(/\{!off \? \(\s*<Animated\.View/.test(src), false, 'koşulsuz dolgu kalmamalı');
});

test('"oldu" anı dolgunun yanında kısa kalır', () => {
    // Tasarımda 700'dü ama orada dolgu 3000'di — oran doğruydu. Dolgu 1000'e
    // inince 700'lük bekleme toplam süreyi neredeyse iki katına çıkarıyordu.
    assert.ok(pillMotion.doneHold < pillMotion.hold / 2, 'beat dolgunun yarısını geçmemeli');
    // Basıştan hapın kapanmasına kadar toplam süre.
    const total = pillMotion.hold + pillMotion.doneHold + pillMotion.close;
    assert.ok(total < 900, `toplam ${total} ms — uzun`);
});

// ── Müdür 34 · halka, baş harf, ödül ────────────────────────────────────────

import { cellGlyph } from '../mobile/src/lib/actionPill.ts';

test('halka ÇERÇEVE, dolgu EYLEM — dinlenirken tam turuncu değil', () => {
    const tokens = readFileSync(new URL('../mobile/src/theme/tokens.ts', import.meta.url), 'utf8');
    const rest = Number(/ringRest: ([\d.]+)/.exec(tokens)[1]);
    const press = Number(/ringPress: ([\d.]+)/.exec(tokens)[1]);
    const off = Number(/ringOff: ([\d.]+)/.exec(tokens)[1]);
    assert.ok(rest < press, 'dinlenen halka basılıdan sönük');
    assert.ok(rest < 1, 'dört göz birden dolu turuncu olamaz');
    assert.ok(off < rest, 'göndermeyen göz en sönük');
});

test('personel gözünde SİMGE değil, personelin baş harfleri var', () => {
    // Çan "bir bildirim" diyordu; müdürün kafasındaki şey "Selin'e haber ver".
    assert.equal(cellGlyph('inf', 'SD'), 'SD');
    assert.equal(cellGlyph('inf', 'sd'), 'SD');
    // Veri yoksa uydurulmuyor — göz kendi simgesine düşüyor.
    assert.equal(cellGlyph('inf', undefined), null);
    assert.equal(cellGlyph('inf', 'S'), null);
    // Öteki gözler her zaman simge.
    assert.equal(cellGlyph('ara', 'SD'), null);
});

test('personel gözünün cümlesi personelin adını söyler', () => {
    assert.equal(cellSpec('inf', 'Selin').hint, 'Selin’e bildirim gider');
    assert.equal(cellSpec('inf', 'Merve').hint, 'Merve’ye bildirim gider');
    assert.equal(cellSpec('inf', 'Kaan').hint, 'Kaan’a bildirim gider');
    assert.equal(cellSpec('inf', 'Gülşah').hint, 'Gülşah’a bildirim gider');
    // Ad yoksa cümle jenerik hâline düşer, uydurulmaz.
    assert.equal(cellSpec('inf').hint, 'bildirim gider');
});

test('açılış kademesi okun doğduğu noktadan uzağa akar', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    // Ok sağda; ilk giren göz en sağdaki, yani dizi TERSTEN akıyor.
    assert.equal(/\[\.\.\.eyes\]\.reverse\(\)/.test(src), true);
    assert.equal(/Animated\.stagger\(pillMotion\.stagger/.test(src), true);
});

test('açılış toplamı 250 ms — kademe hapı geçmiyor', () => {
    const { open, stagger, cellIn, cellSettle } = pillMotion;
    const last = 3 * stagger + cellIn + cellSettle; // dört gözlü hap
    assert.ok(last <= 260, `son göz ${last} ms'de oturuyor`);
    assert.ok(open < last, 'hap gözlerden önce oturur');
});

test('ödül dolgudan kısa, kapanış ödülden kısa', () => {
    assert.ok(pillMotion.halo <= pillMotion.doneHold, 'dalga duruşu aşmaz');
    assert.ok(pillMotion.close < pillMotion.doneHold);
    assert.equal(pillMotion.hold + pillMotion.doneHold + pillMotion.close, 830);
});

test('reduceMotion: kademe ve aşım düşer, dolgu düşmez', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    // Hareket kapalıyken gözler doğrudan 1'e kuruluyor.
    assert.equal(/enter=\{reduceMotion \? ONE : eyes\[index\]\}/.test(src), true);
    // Ama dolgu kademeli de olsa ilerlemeye devam ediyor.
    assert.ok(reducedFill(0.5) > 0 && reducedFill(1) === 1);
});

test('her göz BİR ŞEY çizer — boş daire olmaz', () => {
    // Personel gözünde normalde baş harfler durur; veri adı taşımıyorsa göz
    // boş kalamaz, çan yedeğe geçer. Cihazda dördüncü göz boş çizilmişti.
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    const glyph = src.slice(src.indexOf('function Glyph('), src.indexOf('// ── Tek göz'));
    for (const key of ['ara', 'wa', 'nox', 'inf', 'chk']) {
        assert.equal(
            new RegExp(`cell === '${key}'`).test(glyph), true,
            `${key} gözünün çizimi yok`,
        );
    }
});

test('hapı açan her olayın personeli belli', () => {
    // Baş harf gözü veriden besleniyor; personelsiz bir olay hapı açarsa
    // göz sessizce çana düşer — bu kabul edilebilir ama sahnede olmamalı.
    const withPill = mockDay.events.filter((e) => (
        (e.kind === 'next' && (e.etaMinutes ?? 0) < 0) || e.kind === 'noshow'
    ));
    assert.ok(withPill.length > 0, 'hap açan olay yok');
    for (const event of withPill) {
        assert.ok(event.staffName, `${event.id} personelsiz`);
    }
});

// ── Hapın kırpılmaması ──────────────────────────────────────────────────────
//
// Cihazda "randevu düştü" kartında hapın 48 pt'si kesiliyordu: balon kartın
// ÜSTÜNE açılıyor, kart da `overflow: 'hidden'` taşıyordu. Aynı mecrada ikinci
// bir hata daha vardı — hap kartın çocuğu olduğu için sağ kenarını KARTA
// yaslıyordu, oysa tetikleyici 14 pt içeride duruyor.

test('gelmedi kartı hapı kırpmaz', () => {
    const src = readFileSync(new URL('../mobile/src/components/FlowParts.tsx', import.meta.url), 'utf8');
    const card = src.slice(
        src.indexOf('function NoshowCardView('),
        src.indexOf('function PanelRecord('),
    );
    // Yorumlar sayılmaz: neden kaldırıldığını anlatan satır da bu kelimeyi
    // taşıyor. Aranan şey KODUN kendisi.
    const code = card.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.equal(
        code.includes("overflow: 'hidden'"), false,
        'kart yine kırpıyor — hapın üst kısmı kesilir',
    );
});

test('gelmedi kartında hap tetikleyicinin sütununda durur', () => {
    const src = readFileSync(new URL('../mobile/src/components/FlowParts.tsx', import.meta.url), 'utf8');
    const card = src.slice(
        src.indexOf('function NoshowCardView('),
        src.indexOf('function PanelRecord('),
    );
    const actions = card.indexOf('actions={(');
    const pill = card.indexOf('<ActionPill');
    const spoken = card.indexOf('spoken={spoken}');
    assert.ok(pill > actions && pill < spoken, 'hap eylem sütununun dışında');
});

test('gelmedi kartının çapası ÖLÇÜLÜR, varsayılmaz', () => {
    // `Yönet` düşmeden önce ikinci sırada ve hayalet, düştükten sonra birinci
    // sırada ve hap. Sabit bir üst kenar ikisinden birini ıskalar.
    const src = readFileSync(new URL('../mobile/src/components/FlowParts.tsx', import.meta.url), 'utf8');
    const card = src.slice(
        src.indexOf('function NoshowCardView('),
        src.indexOf('function PanelRecord('),
    );
    assert.match(card, /triggerTop=\{trigger\.y\}/);
    assert.match(card, /triggerHeight=\{trigger\.height\}/);
    assert.equal(
        card.includes('triggerTop={waitCardMetrics.pad}'), false,
        'çapa hâlâ sabit',
    );
});

// ── Perde bütün ekranı dinler ───────────────────────────────────────────────
//
// Perde `-1000` iç boşluklarla ekranı kaplıyor GİBİ duruyordu; iOS bir
// görünümün kendi sınırları dışındaki dokunuşu çocuklarına dağıtmadığı için
// yalnız kartın üstündeki dokunuşu yakalıyordu. Ekranın geri kalanına basınca
// hap açık kalıyor, müdür alete kilitleniyordu.

test('hap ekran katmanında açılır — perde dışarıyı da dinler', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.match(src, /<Modal/, 'hap hâlâ kartın içinde açılıyor');
    assert.match(src, /onRequestClose=\{onDismiss\}/, 'Android geri tuşu kapatmıyor');
    assert.equal(
        src.includes('left: -1000'), false,
        'perde hâlâ kartın içinden ekranı kaplamaya çalışıyor',
    );
});

test('balon ölçülen ekran koordinatına kurulur', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.match(src, /measureInWindow/, 'çapa ölçülmüyor');
    // Ölçüm gelmeden çizilmez: yoksa hap bir kare yanlış yerde belirir.
    assert.match(src, /visible=\{box != null\}/);
    assert.match(src, /if \(!box\) return;/, 'giriş animasyonu ölçümü beklemiyor');
});

// ── Komşunun çekilmesi ──────────────────────────────────────────────────────
//
// `neighbor: 100` sözlükte tanımlıydı ve HİÇ KULLANILMIYORDU: sönme ve
// küçülme anlık sıçrıyordu. Sıçramanın yan etkisi cihazda göründü — sönen
// gözün SVG simgesi tamamen kayboluyor, boş halka kalıyordu, çünkü `opacity`
// bir kare yerli sürücüdeki değer, ertesi kare düz sayı oluyordu.

test('komşu çekilmesi bir HAREKET — anlık sıçrama değil', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.match(src, /duration: pillMotion\.neighbor/, 'neighbor süresi hâlâ kullanılmıyor');
});

test('gözün sönmesi ve ölçeği hep yerli sürücüde kalır', () => {
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    const cell = src.slice(src.indexOf('function Cell('), src.indexOf('// ── Hap ─'));
    // Düz sayıya düşen bir opacity, yerli sürücüyle karışıp SVG'yi boş bırakır.
    assert.equal(
        /opacity: dimmed/.test(cell), false,
        'sönme yine düz sayıya düşüyor — simge kaybolur',
    );
    assert.match(cell, /opacity: eyeOpacity/);
});

// ── Kelime bloğu kaldırıldı · 2026-08-30 ────────────────────────────────────
//
// Basılı tutarken gözlerin üstünde beliren "Gelmedi / geri alınabilir" balonu
// kaldırıldı. Müdür bu aleti günde onlarca kez açıyor; dördüncü açılışta
// kelime bir şey öğretmiyor, yalnız gözlerin üstünü örtüyordu.

test('hapta kelime bloğu YOK', () => {
    // `spec.label`/`spec.hint` metni hâlâ var ama YALNIZ sesli etikette;
    // aranan şey ÇİZİLEN blok. Onun tek göstergesi kendi ölçüleriydi.
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.equal(/M\.label/.test(src), false, 'kelime bloğu yine çiziliyor');
    const tokens = readFileSync(new URL('../mobile/src/theme/tokens.ts', import.meta.url), 'utf8');
    const pill = tokens.slice(
        tokens.indexOf('actionPillMetrics'), tokens.indexOf('scrimDark'),
    );
    assert.equal(/labelHeight|labelPadX|labelText/.test(pill), false, 'ölü ölçüler duruyor');
});

test('kelime gitti ama SESLİ OKUMA kaldı', () => {
    // Görmeyen kullanıcı bu bilgiyi zaten ekrandan değil okuyucudan alıyordu;
    // balonun kalkması onu susturmamalı. Kişiselleştirme de korunuyor.
    const src = readFileSync(new URL('../mobile/src/components/ActionPill.tsx', import.meta.url), 'utf8');
    assert.match(src, /accessibilityLabel=\{`\$\{spec\.label\} — \$\{spec\.hint\}`\}/);
    assert.match(src, /accessibilityHint="Çalışması için basılı tutun"/);
    assert.match(src, /cellSpec\(cell, staffGiven\)/, 'sesli etiket kişiselleşmiyor');
});
