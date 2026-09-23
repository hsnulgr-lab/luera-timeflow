import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { pillCells, pillOff, numberUsable, pillOpens, waResultOf, waNudgeText, waRecord, cellSpec } from '../mobile/src/lib/actionPill.ts';
import {
    LOCAL_CARD_FIELDS, applyFlowAction, applyNudgeResult, applyPillAction, applySendResult,
    mergeLocal, nextSlots, pillInputOf,
} from '../mobile/src/lib/managerFlow.ts';
import { ablative } from '../mobile/src/lib/text.ts';

/**
 * MÜDÜR 34 · EYLEM HAPI v2 — 2026-09-16.
 *
 * "Takas öldü, sütun sabit": sıradaki kartın ikinci yuvası günün her anında
 * `Yönet`. Zamanında hap Ara · Yaz; gecikince + Gelmedi. "Yaz" salonun
 * hattından hazır metni GERÇEKTEN gönderir, kayıt satırı sunucunun cevabını
 * yazar.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PHONE = '05321234567';

// ── Hapın içeriği ───────────────────────────────────────────────────────────

test('zamanında hapta Gelmedi YOK — henüz gelebilecek müşteri atılmaz', () => {
    const input = pillInputOf({ kind: 'next', customerPhone: PHONE, etaMinutes: 6 });
    assert.equal(input.canDrop, false);
    assert.deepEqual(pillCells(input), ['ara', 'wa']);
});

test('gecikince hapa Gelmedi eklenir', () => {
    const input = pillInputOf({ kind: 'next', customerPhone: PHONE, etaMinutes: -8 });
    assert.equal(input.canDrop, true);
    assert.ok(pillCells(input).includes('nox'));
});

test('düşmüş randevu bir daha düşürülemez', () => {
    assert.equal(pillInputOf({ kind: 'noshow', customerPhone: PHONE, etaMinutes: -40 }).canDrop, false);
});

test('tasarımın iki hâli birebir: zamanında Ara·Yaz·SD, gecikince Ara·Yaz·Gelmedi·SD', () => {
    const base = { kind: 'next', customerPhone: PHONE, staffName: 'Selin Demir' };
    assert.deepEqual(pillCells(pillInputOf({ ...base, etaMinutes: 6 })), ['ara', 'wa', 'inf']);
    assert.deepEqual(pillCells(pillInputOf({ ...base, etaMinutes: -8 })), ['ara', 'wa', 'nox', 'inf']);
});

test('ikinci yuva her anda hap, yalnız gönderim penceresinde Geri al', () => {
    for (const eta of [30, 0, -5, -60]) assert.equal(nextSlots({ etaMinutes: eta }).secondary, 'pill');
    assert.equal(nextSlots({ etaMinutes: 10, sendingLeft: 4 }).secondary, 'undo');
});

// ── Gönderim sonucu ─────────────────────────────────────────────────────────

test('whatsapp-proxy cevabı olduğu gibi okunuyor', () => {
    assert.equal(waResultOf({ ok: true }), 'ok');
    assert.equal(waResultOf({ ok: false, reason: 'not_connected' }), 'not_connected');
    assert.equal(waResultOf({ ok: false, reason: 'opt_out' }), 'opt_out');
    assert.equal(waResultOf({ ok: false, reason: 'invalid_phone' }), 'invalid_phone');
});

test('sunucu kuyruğa aldıysa "gönderilemedi" DENMİYOR', () => {
    assert.equal(waResultOf({ ok: false, reason: 'failed', queued: true }), 'queued');
    assert.equal(waRecord('queued', 0).text, 'Kuyrukta · bağlantı gelince gider');
});

test('bilinmeyen/boş cevap başarı sayılmıyor', () => {
    assert.equal(waResultOf(null), 'failed');
    assert.equal(waResultOf({}), 'failed');
    assert.equal(waResultOf({ ok: false, reason: 'quota' }), 'failed');
    assert.equal(waResultOf({ ok: false, reason: 'failed' }), 'failed');
    assert.equal(waRecord('failed', 0).tone, 'warn');
});

test('telefondan gönderim ölçülmeyen "manual" tür ve salonun org’u ile', () => {
    const write = read('mobile/src/lib/managerWrite.ts');
    const fn = write.slice(write.indexOf('export async function sendWaNudge'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /invoke\('whatsapp-proxy'/);
    assert.match(body, /action: 'send'/);
    assert.match(body, /kind: 'manual'/);
    assert.match(body, /orgId: choice\.ok \? choice\.id : undefined/);
    // Asla fırlatmaz: kart her durumda bir sonuç yazar.
    assert.match(body, /catch \{\s*return 'failed';/);
});

test('aynı mesaj iki kez gitmiyor — pencere istekten ÖNCE kapanıyor', () => {
    const screen = read('mobile/app/mudur/index.tsx');
    const close = screen.indexOf('replace(event.id, inFlight);');
    const send = screen.indexOf('sendWaNudge({');
    assert.ok(close > 0 && send > close);
});

test('Yaz ipucu tasarımın cümlesi', () => {
    assert.equal(cellSpec('wa').hint, 'hazır metin, salonun numarası');
});

// ── Hazır metin ─────────────────────────────────────────────────────────────

test('gecikme metni tasarımın cümlesi', () => {
    assert.equal(
        waNudgeText({ salon: 'Luera Güzellik', time: '11:30', late: true }),
        'Luera Güzellik’ten merhaba — 11:30 randevunuz için sizi bekliyoruz, yolda mısınız?',
    );
});

test('zamanında metin hatırlatma, bekleme değil', () => {
    const text = waNudgeText({ salon: 'Studio Nur', time: '14:00', late: false });
    assert.equal(text, 'Studio Nur’dan merhaba — bugün 14:00 randevunuzu hatırlatmak istedik, görüşmek üzere.');
    assert.doesNotMatch(text, /bekliyoruz/);
});

test('salon adı yoksa yarım cümle yok', () => {
    assert.match(waNudgeText({ salon: '  ', time: '09:00', late: true }), /^Merhaba — 09:00/);
});

test('ayrılma eki ünlü uyumu ve sert ünsüzle', () => {
    assert.equal(ablative('Nur'), 'Nur’dan');
    assert.equal(ablative('Selin'), 'Selin’den');
    assert.equal(ablative('Luera Güzellik'), 'Luera Güzellik’ten');
    assert.equal(ablative('Kuaför Kat'), 'Kuaför Kat’tan');
    assert.equal(ablative('Studio Nail'), 'Studio Nail’den');
    assert.equal(ablative(''), '');
});

// ── Yerel dokunuş kartı dondurmuyor ─────────────────────────────────────────

test('yerel dokunuş sayaçları DONDURMUYOR — sunucu alanları güncel', () => {
    const local = { id: 'e1', kind: 'next', etaMinutes: 5, actedCell: 'ara', actedAt: 100 };
    const server = { id: 'e1', kind: 'next', etaMinutes: -3 };
    const merged = mergeLocal(server, local);
    assert.equal(merged.etaMinutes, -3, 'gecikme sunucudan');
    assert.equal(merged.actedCell, 'ara', 'dokunuş yerelden');
    assert.equal(merged.actedAt, 100);
});

test('yerelde silinmiş alan sunucudan geri SIZMIYOR', () => {
    const merged = mergeLocal(
        { id: 'e1', kind: 'next', waResult: 'failed', sendingLeft: 3 },
        { id: 'e1', kind: 'next' },
    );
    assert.equal('waResult' in merged, false);
    assert.equal('sendingLeft' in merged, false);
});

test('tür değiştiren dokunuş olduğu gibi kalıyor', () => {
    const local = { id: 'e1', kind: 'arrived', waitMinutes: 0 };
    assert.equal(mergeLocal({ id: 'e1', kind: 'next', etaMinutes: 2 }, local), local);
});

test('yerel alan listesi hapın bütün izlerini kapsıyor', () => {
    /*
     * Bu test bir zamanlar listenin FOTOĞRAFINI çekiyordu ve tam da bu
     * yüzden işe yaramadı: `remindedAt` ("Personele söyle" damgası) listeye
     * hiç girmemişti, fotoğraf da onu beklemediği için yeşil kaldı. Hata
     * 2026-09-24'te telefonda ortaya çıktı — düğmeye basılıyor, yalnız
     * titreşim oluyor, kart hiç değişmiyordu. `replace` durumu yazıyor,
     * sonraki çizimde `mergeLocal` listede olmayan alanı siliyordu.
     *
     * Artık KURAL denetleniyor: bir dokunuşun sunucu satırına EKLEDİĞİ her
     * alan listede olmalı, yoksa o dokunuş ekranda hiç görünmez.
     */
    const server = {
        id: 'e', appointmentId: 'r1', time: '11:30', kind: 'next',
        firstName: 'Elif', lastName: 'Demir', detail: 'x', staffName: 'Selin',
        etaMinutes: -12, waitMinutes: 12,
    };

    const touches = [
        ['Ara', applyPillAction(server, 'ara')],
        ['Yaz', applyPillAction(server, 'wa')],
        ['gönderim sonucu', applySendResult({ ...server, sendingLeft: 0 }, 'ok')],
        ['Personele söyle · gitti', applyNudgeResult(server, 'ok')],
        ['Personele söyle · gitmedi', applyNudgeResult(server, 'failed')],
        ['Personele söyle · bekleme kartı', applyNudgeResult({ ...server, kind: 'arrived' }, 'ok')],
        ['Reddet', applyFlowAction({ ...server, kind: 'booked' }, 'Reddet')],
    ];

    for (const [name, local] of touches) {
        assert.ok(local, `${name}: dokunuş null döndü`);
        const added = Object.keys(local).filter(
            (key) => local[key] !== undefined && server[key] === undefined,
        );
        for (const key of added) {
            assert.ok(LOCAL_CARD_FIELDS.includes(key),
                `${name}: "${key}" LOCAL_CARD_FIELDS'te yok — ekranda hiç görünmez`);
        }
        // Ve gerçekten hayatta kalıyor: kural soyut kalmasın.
        const merged = mergeLocal({ ...server, kind: local.kind }, local);
        for (const key of added) assert.equal(merged[key], local[key], `${name}: ${key} silindi`);
    }
});

// ── Yönet görünürlüğü ───────────────────────────────────────────────────────

test('işlem başlamadan önce Yönet HEP yerinde — butonlar hazırda, YAZI YOK', () => {
    // Kullanıcının salonunda "1234567": gözler duruyor, Ara ve Yaz sönük.
    const late = pillInputOf({ kind: 'next', customerPhone: '1234567', etaMinutes: -48, staffName: 'Kemal' });
    assert.deepEqual(pillCells(late), ['ara', 'wa', 'nox', 'inf']);
    assert.deepEqual(pillOff(late), ['ara', 'wa']);
    assert.equal(pillOpens(pillCells(late)), true);
    assert.equal(numberUsable('1234567'), false);
    assert.equal(numberUsable(PHONE), true);
    assert.equal(numberUsable(PHONE, 'invalid_phone'), false);

    const parts = read('mobile/src/components/FlowParts.tsx');
    assert.doesNotMatch(parts, /cells\.length === 1/);
    // Üç kartın hapı da sönük gözleri alıyor.
    assert.equal((parts.match(/offCells=\{offCells\}/g) ?? []).length, 3);
    const pill = read('mobile/src/components/ActionPill.tsx');
    assert.doesNotMatch(pill, /NoteCell|nonum/);
});

test('sönük göz ölü değil — basılı tutmadan randevu kartını açıyor', () => {
    const pill = read('mobile/src/components/ActionPill.tsx');
    assert.match(pill, /const off = cell === 'waoff' \|\| offCell;/);
    assert.match(pill, /if \(cell === 'waoff' \|\| offCells\.includes\(cell\)\) \{ feedback\.selection\(\); onPick\(cell\); return; \}/);
    const screen = read('mobile/app/mudur/index.tsx');
    assert.match(screen, /if \(\(cell === 'ara' \|\| cell === 'wa'\) && !numberUsable\(event\.customerPhone, event\.waResult\)\) \{[\s\S]{0,200}openAppointment\(event\);\s*return;/);
    // Sönük gözden gönderim penceresi AÇILMIYOR: kontrol eylemden önce.
    assert.ok(screen.indexOf('!numberUsable(event.customerPhone') < screen.indexOf('const next = applyPillAction(event, cell);'));
});

// ── Sürüyor kartının alt satırı ─────────────────────────────────────────────

test('sürüyor kartı ham damga BASMIYOR — "18:57’de başladı"', async () => {
    const { clockLocative } = await import('../mobile/src/lib/text.ts');
    const { buildFlow } = await import('../mobile/src/lib/flowBuild.ts');
    assert.deepEqual(
        ['11:00', '21:30', '18:57', '09:40', '10:00', '14:03'].map(clockLocative),
        ['11:00’de', '21:30’da', '18:57’de', '09:40’ta', '10:00’da', '14:03’te'],
    );
    assert.equal(clockLocative('bozuk'), 'bozuk');

    const stamp = new Date(2026, 8, 16, 21, 57, 7).toISOString();
    const [event] = buildFlow({
        rows: [{
            id: 'r1', customer_id: 'c1', customer_name: 'nunisa', customer_phone: null,
            start_time: '21:00:00', end_time: '22:30:00', service: 'ağda', status: 'confirmed',
            staff_id: 's1', customer_arrived_at: null, arrived_at: stamp, service_ended_at: null, is_paid: false,
        }],
        payments: [], crew: new Map([['s1', 'Kemal']]), context: new Map(),
        dateISO: '2026-09-16', nowMs: new Date(2026, 8, 16, 21, 58, 36).getTime(),
    });
    assert.equal(event.kind, 'started');
    assert.equal(event.startedAt, '21:57’de başladı');
    assert.doesNotMatch(event.startedAt, /T\d{2}:/);
});

// ── Sürüyor kartının personel hapı · Müdür 29 v2 ────────────────────────────

test('personel hapı DOLU: baş harfler krem diskte, yanında yalnız ad', () => {
    const parts = read('mobile/src/components/FlowParts.tsx');
    const strip = parts.slice(parts.indexOf('function LiveStrip'), parts.indexOf('function DotsButton'));
    // Canlı veri `staffInitials` taşımıyor — addan türetiliyor, halka boş kalmıyor.
    assert.match(strip, /\{event\.staffInitials \?\? initialsOfName\(event\.staffName\)\}/);
    assert.match(strip, /backgroundColor: ink\.pillInk,/);
    assert.match(strip, /color: ink\.pill,/);
    assert.match(strip, /\{splitStaffName\(event\.staffName\)\.given\}/);
    assert.match(strip, /paddingLeft: flowMetrics\.whoLeft,\s*paddingRight: flowMetrics\.whoX,/);

    const tokens = read('mobile/src/theme/tokens.ts');
    assert.match(tokens, /whoLeft: 5,\s*whoGap: 9,\s*whoText: 14\.5,\s*whoAvatar: 26,\s*whoAvatarText: 11,/);
});
