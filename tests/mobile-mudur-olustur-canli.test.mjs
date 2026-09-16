import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    clockMinutes, confirmationText, createOutcomeOf, customerOptionsOf, insertRowOf, openWindowOf,
    phoneVariants, recentOf, refusalCopy, SECTOR_COMMS, serviceOptionsOf, staffOptionsOf,
    storedPhone, tooEarly, trDate, waFailLine, waRetryable, webhookBody,
} from '../mobile/src/lib/createLive.ts';
import { slotRows } from '../mobile/src/lib/createFlow.ts';
import { confirmCopy, previewText } from '../mobile/src/lib/apptConfirm.ts';

/**
 * MÜDÜR · RANDEVU OLUŞTURMA CANLIYA BAĞLANDI (plan 7. adım).
 *
 * Ölçü masaüstü: telefondan kurulan randevu, masaüstünden kurulanla AYNI satır
 * ve AYNI yan etkiler (onay mesajı metni, webhook gövdesi). Son söz sunucunun
 * (060 çakışma, 076 uygunluk); ekran reddi dürüstçe söylüyor.
 *
 * Kullanıcı kararları (2026-09-16): onay mesajı OTOMATİK DEĞİL, düğmeyle;
 * webhook masaüstüyle aynı.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flow = strip(read('mobile/src/components/CreateFlow.tsx'));
const route = strip(read('mobile/app/mudur/create.tsx'));
const write = strip(read('mobile/src/lib/managerWrite.ts'));
const source = strip(read('mobile/src/lib/managerSource.ts'));
const hooks = strip(read('mobile/src/lib/managerCreate.ts'));
const confirm = strip(read('mobile/src/components/ConfirmScreen.tsx'));
const pure = read('mobile/src/lib/createLive.ts');
const desktopRes = read('src/hooks/useReservations.ts');
const desktopTpl = read('src/services/waTemplates.ts');
const desktopSectors = read('src/lib/sectorProfiles.ts');

const SERVICE = { id: 's1', name: 'Saç boyama', minutes: 90, price: 1900, color: '#7E93A8' };

// ── Satır masaüstüyle aynı ──────────────────────────────────────────────────

test('eklenen satır masaüstünün alanlarını taşıyor', () => {
    const row = insertRowOf({
        customerId: 'c1', customerName: '  Zeynep Kaya ', customerPhone: '0532 111 22 33',
        dateISO: '2026-09-17', startMinutes: 10 * 60 + 30, service: SERVICE, staffId: 'st1', note: null,
    }, { userId: 'u1', organizationId: 'o1' });
    assert.deepEqual(row, {
        user_id: 'u1', organization_id: 'o1', customer_id: 'c1', customer_name: 'Zeynep Kaya',
        customer_phone: '05321112233', customer_email: null, date: '2026-09-17',
        start_time: '10:30:00', end_time: '12:00:00', service: 'Saç boyama',
        service_color: '#7E93A8', status: 'confirmed', notes: '', staff_id: 'st1', group_id: null,
    });
    // Masaüstünün gönderdiği her alan burada da var.
    const insert = desktopRes.slice(desktopRes.indexOf(".from('reservations')\n            .insert({"));
    for (const col of ['user_id', 'organization_id', 'customer_id', 'customer_name', 'customer_phone',
        'customer_email', 'date', 'start_time', 'end_time', 'service', 'service_color', 'status',
        'notes', 'staff_id', 'group_id']) {
        assert.match(insert.slice(0, 1400), new RegExp(`\\b${col}:`), col);
    }
    assert.match(insert, /status: reservation\.status \|\| 'confirmed'/);
});

test('numarasız randevuda telefon BOŞ METİN — kolon NOT NULL', () => {
    const row = insertRowOf({
        customerId: null, customerName: 'Ayşe', customerPhone: null,
        dateISO: '2026-09-17', startMinutes: 600, service: { ...SERVICE, color: '' }, staffId: 'st1', note: ' Kapıda ',
    }, { userId: 'u1', organizationId: 'o1' });
    assert.equal(row.customer_phone, '');
    assert.equal(row.customer_id, null);
    assert.equal(row.notes, 'Kapıda');
    assert.equal(row.service_color, '#CCFF00');
});

test('telefon masaüstü gibi yalnız boşluksuz yazılıyor; arama her yazımına bakıyor', () => {
    assert.equal(storedPhone(' 0532 111 22 33 '), '05321112233');
    assert.match(desktopRes, /function normalizeCustomerPhone\(phone\?: string\): string \{\s*return \(phone \|\| ''\)\.replace\(\/\\s\+\/g, ''\)\.trim\(\);/);
    const variants = phoneVariants('0532 111 22 33');
    for (const v of ['05321112233', '5321112233', '905321112233', '+905321112233']) {
        assert.ok(variants.includes(v), v);
    }
    assert.ok(phoneVariants('+90 532 111 22 33').includes('05321112233'));
});

test('müşteri: numara eşleşirse yeniden kullanılır, arşivdeyse geri açılır, yarışta yeniden aranır', () => {
    const fn = write.slice(write.indexOf('async function resolveCustomer'), write.indexOf('const UNIQUE_VIOLATION'));
    assert.match(fn, /\.in\('phone', phoneVariants\(phone\)\)/);
    assert.match(fn, /\.order\('is_active', \{ ascending: false \}\)\s*\.order\('created_at', \{ ascending: true \}\)/);
    assert.match(fn, /if \(existing\.is_active === false\) \{[\s\S]*?update\(\{ is_active: true/);
    assert.match(fn, /if \(error\?\.code === UNIQUE_VIOLATION\) \{\s*const raced = await lookup\(\);/);
    assert.match(write, /const UNIQUE_VIOLATION = '23505';/);
    // Numarasız randevu müşteri AÇMIYOR (masaüstü de açmıyor).
    assert.match(write, /digits\.length >= 10\s*\? await resolveCustomer/);
});

test('yazma: vana, org süzgeci, oturum kullanıcısı, geçmiş sınırı', () => {
    const fn = write.slice(write.indexOf('export async function createAppointment'), write.indexOf('export async function sendConfirmation'));
    assert.ok(fn.indexOf('tooEarly(') < fn.indexOf('writesPaused()'));
    assert.match(fn, /if \(await writesPaused\(\)\) return \{ outcome: \{ ok: false, kind: 'paused' \}/);
    assert.match(fn, /insertRowOf\(\{ \.\.\.input, customerId \}, \{ userId, organizationId \}\)/);
    assert.match(fn, /getSession\(\)/);
    assert.match(fn, /\.select\(`\$\{RES_COLS\}, updated_at`\)/);
    assert.match(fn, /if \(cause instanceof OrgError\) \{ forgetOrg\(\); throw cause; \}/);
});

test('geçmişe randevu tolerans kadar geriye izinli — masaüstünün kuralı', () => {
    const now = Date.parse('2026-09-16T11:00:00');
    assert.equal(tooEarly('2026-09-16', 9 * 60 + 30, now, 120), false);
    assert.equal(tooEarly('2026-09-16', 8 * 60 + 59, now, 120), true);
    assert.equal(tooEarly('2026-09-16', 10 * 60 + 30, now, 15), true);
    assert.match(desktopRes, /startAt\.getTime\(\) < Date\.now\(\) - tolMs/);
});

// ── Sunucunun reddi ─────────────────────────────────────────────────────────

test('060 çakışması müdüre personeliyle söyleniyor', () => {
    const out = createOutcomeOf({ code: 'P0001', message: 'reservation_staff_conflict' }, 'Merve');
    assert.equal(out.kind, 'conflict');
    assert.match(out.message, /Merve zaten başka bir randevuda/);
    assert.equal(createOutcomeOf({ code: '23P01', message: 'x' }, null).kind, 'conflict');
    assert.match(read('supabase/060_reservation_conflict_guard.sql'), /MESSAGE = 'reservation_staff_conflict'/);
});

test('076 uygunluk reddi sebebini ve notunu taşıyor', () => {
    const out = createOutcomeOf({
        code: '23514', message: 'reservation_eligibility_blocked',
        details: '{"note": "Doktor onayı gerekir", "reason": "Hamilelik", "service": "Lazer"}',
    }, 'Selin');
    assert.equal(out.kind, 'eligibility');
    assert.equal(out.message, 'Bu işlem uygulanamaz — Hamilelik (Doktor onayı gerekir).');
    assert.equal(createOutcomeOf({ message: 'boom' }, null).kind, 'failed');
    assert.deepEqual(createOutcomeOf(null, null), { ok: true });
});

test('ret blokları randevunun OLUŞMADIĞINI söylüyor ve durum dilinin kelimelerini kullanmıyor', () => {
    const outcomes = [
        { ok: false, kind: 'conflict', message: 'O saatte Merve zaten başka bir randevuda.' },
        { ok: false, kind: 'past', message: 'Bu saat geçti.' },
        { ok: false, kind: 'eligibility', message: 'Bu işlem uygulanamaz.' },
        { ok: false, kind: 'paused' },
        { ok: false, kind: 'failed' },
    ];
    for (const outcome of outcomes) {
        const copy = refusalCopy(outcome);
        const text = [copy.title, ...copy.lines, copy.action.label].join(' ');
        assert.doesNotMatch(text, /kayıt|sunucu|senkron|hata kodu|error/i, outcome.kind);
        assert.ok(copy.action.label.length > 0);
    }
    assert.equal(refusalCopy(outcomes[0]).action.move, 'reslot');
    assert.equal(refusalCopy(outcomes[2]).action.move, 'service');
    assert.equal(refusalCopy(outcomes[4]).action.move, 'retry');
    assert.match(refusalCopy(outcomes[4]).lines[0], /Seçimleriniz duruyor/);
});

test('ekran: tek uçuş, ret bloğu, çakışmada gün yeniden okunuyor', () => {
    assert.match(flow, /if \(savingRef\.current\) return;/);
    assert.match(flow, /savingRef\.current = true;\s*setSaving\(true\);/);
    assert.match(flow, /label=\{saving \? 'Oluşturuluyor' : action\.label\}/);
    assert.match(flow, /enabled=\{action\.enabled && !saving\}/);
    assert.match(flow, /outcome\.kind === 'conflict' \|\| outcome\.kind === 'past'\)\) \{\s*void day\.reload\(\);/);
    assert.match(flow, /<DurumBlock\s*tone=\{refusal\.tone\}/);
    // "Tekrar dene" kendiliğinden YAZMIYOR.
    const retry = flow.slice(flow.indexOf("move === 'retry'"), flow.indexOf('}, []);', flow.indexOf("move === 'retry'")));
    assert.doesNotMatch(retry, /onCreate|advance\(/);
});

// ── Ray gerçek güne bakıyor ─────────────────────────────────────────────────

test('salonun saatleri: gün numarası 0 = PAZAR, kapalı gün, bilinmeyen saat', () => {
    const hours = [
        { day: 0, isOff: true },
        { day: 3, start: '10:00', end: '19:00', isOff: false },
        { day: 4, start: 'bozuk', end: '19:00' },
    ];
    // 2026-09-16 Çarşamba (getUTCDay 3).
    assert.deepEqual(openWindowOf(hours, '2026-09-16'), { from: 600, to: 1140 });
    // 2026-09-20 Pazar — kapalı.
    assert.equal(openWindowOf(hours, '2026-09-20'), null);
    // Bozuk ya da tanımsız gün KAPALI SAYILMIYOR.
    assert.equal(openWindowOf(hours, '2026-09-17'), undefined);
    assert.equal(openWindowOf(hours, '2026-09-18'), undefined);
    assert.equal(openWindowOf(null, '2026-09-16'), undefined);
    assert.equal(clockMinutes('9:05'), 545);
});

const person = (id, available = true) => ({ id, initials: id.slice(0, 2).toUpperCase(), name: id, available });

test('ray: kapalı gün bütün kutuları kapatır, saatler salonun saatleri', () => {
    const closed = slotRows({ appointments: [], staff: [person('merve')], durationMinutes: 30, hours: null });
    assert.ok(closed.length > 0);
    assert.ok(closed.every((row) => row.kind === 'closed' && row.reason === 'Salon bu gün kapalı'));
    const open = slotRows({ appointments: [], staff: [person('merve')], durationMinutes: 30, hours: { from: 600, to: 720 } });
    assert.deepEqual(open.map((row) => row.time), ['10:00', '10:30', '11:00', '11:30']);
});

test('ray: bugünün TAMAMEN geçmiş kutusu seçilemez, başlamış olan seçilebilir', () => {
    const rows = slotRows({
        appointments: [], staff: [person('merve')], durationMinutes: 30,
        hours: { from: 540, to: 660 }, nowMinutes: 9 * 60 + 40,
    });
    assert.equal(rows.find((row) => row.time === '09:00').kind, 'closed');
    assert.equal(rows.find((row) => row.time === '09:00').reason, 'Geçti');
    assert.equal(rows.find((row) => row.time === '09:30').kind, 'free');
});

test('kadro: pasif personel yok, izinli olan listede ama seçilemez', () => {
    const crew = [
        { id: 'a', name: 'Merve Aydın', color: '#fff', active: true },
        { id: 'b', name: 'Selin', color: null, active: true },
        { id: 'c', name: 'Eski', color: null, active: false },
    ];
    const staff = staffOptionsOf(crew, new Map([['b', ['2026-09-16']]]), '2026-09-16');
    assert.deepEqual(staff.map((s) => s.id), ['a', 'b']);
    assert.equal(staff[0].available, true);
    assert.equal(staff[0].initials, 'MA');
    assert.deepEqual([staff[1].available, staff[1].reason], [false, 'izinli']);
    assert.equal(staffOptionsOf(crew, new Map([['b', ['2026-09-16']]]), '2026-09-17')[1].available, true);
});

test('ekran gün okunmadan ray çizmiyor; başka günün saatleri bu güne yazılmıyor', () => {
    assert.match(flow, /const dayKnown = draft\.dateISO !== null && day\.data\.dateISO === draft\.dateISO;/);
    assert.match(flow, /draft\.dateISO && dayKnown \? slotRows\(\{/);
    assert.match(flow, /hours: dayWindowOf\(/);
    assert.match(flow, /nowMinutes: draft\.dateISO === nowClock\.dateISO \? nowClock\.minutes : null/);
    assert.match(flow, /<DurumUnread\s*what="Bu günün saatlerini"/);
    assert.doesNotMatch(flow, /mockDay|mockServices|mockCustomers|calendarSource|SALON_NAME/);
});

// ── Hizmet ve müşteri ───────────────────────────────────────────────────────

test('hizmet: fiyatsız hizmet ₺0 değil, süresiz hizmet 30 dk', () => {
    const [a, b] = serviceOptionsOf([
        { id: 'x', name: 'Fön', price: 350, duration: 30, color: '#abc' },
        { id: 'y', name: 'Danışma' },
        { name: 'Kimliksiz' },
    ]);
    assert.equal(a.price, 350);
    assert.equal(b.price, null);
    assert.equal(b.minutes, 30);
    assert.equal(b.color, '#CCFF00');
    assert.equal(serviceOptionsOf([{ name: 'Kimliksiz' }]).length, 0);
    assert.match(strip(read('mobile/src/components/ApptParts.tsx')), /service\.price === null\s*\? `\$\{service\.minutes\} dk`/);
});

test('müşteri ipucu randevulardan: bugün, son geliş, iptal ve gelecek sayılmıyor', () => {
    const people = [
        { id: 'a', name: 'Zeynep', phone: '1' },
        { id: 'b', name: 'Elif', phone: '2' },
        { id: 'c', name: 'Hiç', phone: '3' },
        { id: 'd', name: 'İptal', phone: '4' },
    ];
    const visits = [
        { customer_id: 'a', date: '2026-09-16', start_time: '11:00:00', service: 'Boya', status: 'confirmed' },
        { customer_id: 'b', date: '2026-08-02', start_time: '10:00:00', service: 'Kesim', status: 'completed' },
        { customer_id: 'b', date: '2026-07-01', start_time: '10:00:00', service: 'Kesim', status: 'completed' },
        { customer_id: 'b', date: '2026-10-01', start_time: '10:00:00', service: 'Kesim', status: 'confirmed' },
        { customer_id: 'd', date: '2026-09-10', start_time: '10:00:00', service: 'Kesim', status: 'cancelled' },
    ];
    const options = customerOptionsOf(people, visits, '2026-09-16');
    assert.equal(options[0].hint, 'Bugün 11:00 · Boya');
    assert.equal(options[1].hint, 'son 2 Ağu');
    assert.equal(options[2].hint, '');
    assert.equal(options[3].hint, '');
    assert.deepEqual(recentOf(options).map((o) => o.id), ['a', 'b']);
});

test('defter: aktif müşteriler, 24 aylık geliş penceresi, sayfalı okuma', () => {
    const fn = source.slice(source.indexOf('export async function fetchCustomerBook'), source.indexOf('export interface CreateSettings'));
    assert.match(fn, /from\('customers'\)\.select\('id, name, phone'\)[\s\S]*?\.eq\('is_active', true\)/);
    assert.match(fn, /\.neq\('status', 'cancelled'\)[\s\S]*?\.gte\('date', since\)[\s\S]*?\.lte\('date', todayISO\)/);
    assert.equal((fn.match(/readAll\(/g) ?? []).length, 2);
    assert.match(source, /export const VISIT_WINDOW_DAYS = 730;/);
    // Defter yarım dakikada bir çekilmiyor.
    assert.match(hooks, /useManagerRead<CreateContext \| null>\(read, null, \{ poll: false \}\)/);
});

test('ayarlar ada göre isteniyor — PIN taşıyan satırın tamamı değil', () => {
    const fn = source.slice(source.indexOf('export async function fetchCreateSettings'), source.indexOf('export async function fetchCustomerById'));
    assert.match(fn, /fetchOrgSettings\('business_name, sector, working_hours, webhook_url'\)/);
    assert.doesNotMatch(source, /fetchOrgSettings\('\*'\)/);
    assert.match(fn, /\/\^https\?:\\\/\\\/\/i\.test\(hook\)/);
});

test('ön dolgu kaybolmasın: akış bağlam okunmadan kurulmuyor', () => {
    assert.match(route, /\) : ctx\.data === null \? \(/);
    assert.match(route, /context=\{ctx\.data\}/);
    assert.match(flow, /context\.customers\.find\(\(item\) => item\.id === prefill\.customerId\)/);
    assert.match(route, /<DurumUnread\s*what="Randevu bilgilerini"/);
});

// ── Onay mesajı ─────────────────────────────────────────────────────────────

test('onay metni masaüstünün şablonuyla BİREBİR', () => {
    const text = confirmationText({
        customerName: 'Zeynep Kaya', dateISO: '2026-09-16', startTime: '10:30:00', service: 'Saç boyama',
        businessName: 'Luera Kuaför', staffName: 'Merve', mapsUrl: 'https://maps.example/x', sector: 'kuafor',
    });
    assert.equal(text,
        'Merhaba Zeynep 👋\n\n'
        + '*Luera Kuaför* — işlem kaydınız oluşturuldu ✅\n\n'
        + '📅 16 Eylül Çarşamba\n'
        + '🕐 Saat *10:30*\n'
        + '💠 Saç boyama\n👤 Merve'
        + '\n\nDeğişiklik gerekirse bu mesaja yanıt vermeniz yeterli. Görüşmek üzere! 💇'
        + '\n\n📍 Konum: https://maps.example/x');
    // Masaüstünün şablonundaki parçalar hâlâ aynı.
    for (const piece of ['Merhaba ${firstName} 👋', 'kaydınız oluşturuldu ✅', '🕐 Saat *${params.startTime}*',
        'Değişiklik gerekirse bu mesaja yanıt vermeniz yeterli. Görüşmek üzere!', '📍 Konum: ']) {
        assert.ok(desktopTpl.includes(piece), piece);
    }
    assert.equal(trDate('2026-07-27'), '27 Temmuz Pazartesi');
});

test('sektör sözcüğü ve emojisi masaüstünün profiliyle aynı', () => {
    for (const [sector, comms] of Object.entries(SECTOR_COMMS)) {
        const block = desktopSectors.slice(desktopSectors.indexOf(`    ${sector}: {`));
        const line = block.slice(0, block.indexOf('comms:') + 400);
        assert.match(line, new RegExp(`serviceWord: '${comms.serviceWord}'`), sector);
        assert.ok(line.includes(`emoji: '${comms.emoji}'`), `${sector} emoji`);
    }
});

test('gönderim masaüstüyle aynı yol ve tür; otomatik DEĞİL', () => {
    const fn = write.slice(write.indexOf('export async function sendConfirmation'), write.indexOf('export function fireCreatedWebhook'));
    assert.match(fn, /functions\.invoke\('whatsapp-proxy'/);
    assert.match(fn, /action: 'send'/);
    assert.match(fn, /kind: 'confirmation'/);
    assert.match(fn, /orgId: choice\.ok \? choice\.id : undefined/);
    // Kurulum anında gönderim YOK; yalnız onay ekranının düğmesi.
    assert.doesNotMatch(route.slice(route.indexOf('onCreate='), route.indexOf('onSend=')), /sendConfirmation/);
    assert.match(route, /onSend=\{sendConfirmation\}/);
    assert.match(flow, /onSend=\{\(\) => onSend\(\{/);
});

test('başarısız gönderimin sebebi söyleniyor; kalıcı sebepte "Tekrar dene" yok', () => {
    assert.equal(waRetryable(null), true);
    assert.equal(waRetryable('failed'), true);
    for (const reason of ['not_connected', 'opt_out', 'quota', 'invalid_phone']) {
        assert.equal(waRetryable(reason), false, reason);
        assert.equal(confirmCopy('failed', true, reason).primary, 'Tamam');
        assert.match(confirmCopy('failed', true, reason).subtitle, /Mesaj gitmedi/);
    }
    assert.equal(confirmCopy('failed', true, null).primary, 'Tekrar dene');
    assert.match(waFailLine('not_connected'), /WhatsApp’ı bağlı değil/);
    assert.match(confirm, /state === 'sent' \|\| \(state === 'failed' && !waRetryable\(failReason\)\)\s*\? onDone/);
});

test('önizleme GİDEN metni gösteriyor', () => {
    assert.equal(previewText('Merhaba 👋\n\n*Salon* — kayıt\n\n📅 Gün'), 'Merhaba 👋\nSalon — kayıt\n📅 Gün');
    assert.match(confirm, /text=\{previewText\(message\)\}/);
    assert.doesNotMatch(confirm, /messageText\(/);
});

// ── Webhook ─────────────────────────────────────────────────────────────────

test('webhook gövdesi masaüstünün alanlarıyla aynı; adres yoksa gitmiyor', () => {
    const body = JSON.parse(webhookBody({
        id: 'r1', customer_name: 'Zeynep', customer_phone: '0532', date: '2026-09-16',
        start_time: '10:30:00', end_time: '12:00:00', service: 'Boya', status: 'confirmed', notes: null, staff_id: 's1',
    }, 'Merve', '2026-09-16T08:00:00.000Z'));
    assert.deepEqual(Object.keys(body), ['event', 'source', 'timestamp', 'data']);
    assert.equal(body.event, 'reservation.created');
    assert.equal(body.source, 'timeflow');
    assert.deepEqual(Object.keys(body.data), ['id', 'customer_name', 'customer_phone', 'customer_email',
        'date', 'start_time', 'end_time', 'service', 'status', 'notes', 'staff_id', 'staff_name']);
    assert.equal(body.data.start_time, '10:30');
    const desktop = desktopRes.slice(desktopRes.indexOf("fireWebhook('reservation.created'"));
    for (const key of Object.keys(body.data)) assert.match(desktop.slice(0, 700), new RegExp(`${key}:`), key);
    const fire = write.slice(write.indexOf('export function fireCreatedWebhook'));
    assert.match(fire, /if \(!url\) return;/);
    assert.match(fire, /setTimeout\(\(\) => controller\.abort\(\), 8000\)/);
    assert.match(route, /if \(result\.outcome\.ok && result\.row\) \{\s*fireCreatedWebhook\(/);
});

test('saf katman React, Expo ve Supabase taşımıyor', () => {
    assert.doesNotMatch(pure, /from 'react|from 'expo|supabase\./);
});

// ── Personelin kendi saatleri (008) ─────────────────────────────────────────

import { dayWindowOf, staffWorksAt } from '../mobile/src/lib/createLive.ts';

const ORG = [
    { day: 3, start: '10:00', end: '19:00', isOff: false },
    { day: 4, start: '10:00', end: '19:00', isOff: false },
];

test('personelin kendi saati salonunkinin önünde — masaüstünün staffWorksAt kuralı', () => {
    const merve = { workingHours: [{ day: 3, start: '08:00', end: '14:00', isOff: false }, { day: 4, isOff: true }] };
    // 2026-09-16 Çarşamba.
    assert.equal(staffWorksAt(merve, ORG, '2026-09-16', 8 * 60, 9 * 60), true);
    assert.equal(staffWorksAt(merve, ORG, '2026-09-16', 13 * 60 + 30, 14 * 60 + 30), false);
    // Perşembe kendi takviminde kapalı; salon açık olsa da çalışmıyor.
    assert.equal(staffWorksAt(merve, ORG, '2026-09-17', 11 * 60, 12 * 60), false);
    // Kendi saati yoksa salonun saatleri.
    assert.equal(staffWorksAt({ workingHours: null }, ORG, '2026-09-17', 11 * 60, 12 * 60), true);
    assert.equal(staffWorksAt({ workingHours: [] }, ORG, '2026-09-16', 9 * 60, 10 * 60), false);
    // Kendi takvimi VAR ama o gün tanımsız ya da bozuksa çalışmıyor (masaüstü).
    assert.equal(staffWorksAt({ workingHours: [{ day: 1, start: '09:00', end: '18:00' }] }, ORG, '2026-09-16', 11 * 60, 12 * 60), false);
    assert.equal(staffWorksAt({ workingHours: [{ day: 3, start: 'bozuk', end: '18:00' }] }, ORG, '2026-09-16', 11 * 60, 12 * 60), false);
    // Saat hiç BİLİNMİYORSA telefon kimseyi kapatmıyor.
    assert.equal(staffWorksAt({ workingHours: null }, null, '2026-09-16', 9 * 60, 10 * 60), true);
    const desktop = read('src/lib/slotResolution.ts');
    assert.match(desktop, /const schedule = member\.workingHours\?\.length \? member\.workingHours : rules\.workingHours;/);
    assert.match(desktop, /if \(!hours \|\| hours\.isOff\) return false;/);
});

test('günün penceresi erken başlayan personelle genişliyor; kapalı salon kapalı kalıyor', () => {
    const crew = [
        { active: true, workingHours: [{ day: 3, start: '08:00', end: '14:00', isOff: false }] },
        { active: false, workingHours: [{ day: 3, start: '06:00', end: '23:00', isOff: false }] },
    ];
    assert.deepEqual(dayWindowOf(crew, ORG, '2026-09-16'), { from: 480, to: 1140 });
    const late = [{ active: true, workingHours: [{ day: 3, start: '12:00', end: '21:00', isOff: false }] }];
    assert.deepEqual(dayWindowOf(late, ORG, '2026-09-16'), { from: 600, to: 1260 });
    assert.equal(dayWindowOf(crew, [{ day: 3, isOff: true }], '2026-09-16'), null);
});

test('ray çalışmayan personele kutu vermiyor; ekran kuralı gerçekten bağlıyor', () => {
    const staff = [
        { id: 'a', initials: 'A', name: 'Merve', available: true },
        { id: 'b', initials: 'B', name: 'Selin', available: true },
    ];
    const rows = slotRows({
        appointments: [], staff, durationMinutes: 30, hours: { from: 600, to: 660 },
        worksAt: (id, from) => id === 'b' || from < 630,
    });
    assert.equal(rows.find((r) => r.time === '10:00').staff.id, 'a');
    assert.equal(rows.find((r) => r.time === '10:30').staff.id, 'b');
    const none = slotRows({ appointments: [], staff, durationMinutes: 30, hours: { from: 600, to: 630 }, worksAt: () => false });
    assert.deepEqual([none[0].kind, none[0].reason], ['closed', 'Bu saatte çalışan yok']);
    assert.match(flow, /hours: dayWindowOf\(context\.crew, context\.settings\.workingHours, draft\.dateISO\)/);
    assert.match(flow, /staffWorksAt\(member, context\.settings\.workingHours, draft\.dateISO \?\? today, from, to\)/);
    assert.match(flow, /return member \? staffWorksAt\(member, context\.settings\.workingHours, date, from, to\) : false;/);
    assert.match(hooks, /workingHours: schedules\.get\(person\.id\) \?\? null,/);
    assert.match(source, /from\('staff'\)\.select\('id, working_hours'\)/);
});
