import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ownDayStamp, withOwnStamps, STAMP_DAY_MARGIN_HOURS } from '../mobile/src/lib/dayStamp.ts';
import { buildFlow, kindOf } from '../mobile/src/lib/flowBuild.ts';
import { presenceOf } from '../mobile/src/lib/presence.ts';
import { toAppt } from '../mobile/src/lib/managerMap.ts';

/**
 * BAŞKA GÜNE AİT DAMGA — 2026-09-16, müdürün telefonundaki akış.
 *
 * Bugünün iki randevusu şöyle çiziliyordu:
 *   • "SÜRÜYOR 1143:40:31 · 45 dk işlem · 68575 dk aştı"
 *   • "UZUN BEKLİYOR 1481 sa 58 dk · irem 88918 dakikadır bekliyor"
 * ve büyüyen sayı iki satıra kırılıp alttaki metnin üstüne biniyordu.
 *
 * Sebep: randevu başka güne TAŞININCA damgalar temizlenmiyordu. 30 Temmuz'da
 * başlamış bir randevu bugüne alınınca "başladı" damgası yanında geliyordu.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const GUN = '2026-09-16';
const SIMDI = Date.parse(`${GUN}T17:40:00`);
// Ekrandaki sayılardan geriye hesaplanan damgalar.
const TEMMUZ_30 = new Date(SIMDI - (1143 * 60 + 40) * 60_000).toISOString();
const TEMMUZ_16 = new Date(SIMDI - 88918 * 60_000).toISOString();

const row = (over = {}) => ({
    id: 'r1', customer_id: 'c1', customer_name: 'hasan ulger', customer_phone: null,
    start_time: '16:00:00', end_time: '16:45:00', service: 'İmplant', status: 'confirmed',
    staff_id: 's1', customer_arrived_at: null, arrived_at: null, service_ended_at: null,
    is_paid: false, ...over,
});

const build = (rows) => buildFlow({
    rows, payments: [], crew: new Map([['s1', 'Furkan Ülger']]), context: new Map(),
    dateISO: GUN, nowMs: SIMDI,
});

// ── Kural ───────────────────────────────────────────────────────────────────

test('haftalar önceki damga bu günün OLAYI değil', () => {
    assert.equal(ownDayStamp(TEMMUZ_30, GUN), null);
    assert.equal(ownDayStamp(TEMMUZ_16, GUN), null);
});

test('aynı günün damgası AYNEN kalıyor', () => {
    const sabah = `${GUN}T09:12:00`;
    assert.equal(ownDayStamp(sabah, GUN), sabah);
});

test('gece yarısını aşan gerçek işlem kaybolmuyor', () => {
    // 23:30'da başlayan, ertesi gün 00:10'da süren işlem.
    assert.equal(STAMP_DAY_MARGIN_HOURS, 12);
    const onceki = '2026-09-15T23:30:00';
    assert.equal(ownDayStamp(onceki, GUN), onceki, 'önceki gecenin son saatleri bu güne ait');
    const sonraki = '2026-09-17T08:00:00';
    assert.equal(ownDayStamp(sonraki, GUN), sonraki, 'ertesi sabah da payın içinde');
    // Payın hemen dışı.
    assert.equal(ownDayStamp('2026-09-15T11:59:00', GUN), null);
    assert.equal(ownDayStamp('2026-09-17T12:01:00', GUN), null);
});

test('yargılanamayan veri SİLİNMİYOR', () => {
    assert.equal(ownDayStamp('çözülemez', GUN), 'çözülemez');
    assert.equal(ownDayStamp(TEMMUZ_30, 'bozuk-gün'), TEMMUZ_30);
    assert.equal(ownDayStamp(null, GUN), null);
});

test('tamamlanmış randevunun damgası kaydın kendisi — dokunulmuyor', () => {
    const done = row({ status: 'completed', arrived_at: TEMMUZ_30 });
    assert.equal(withOwnStamps(done, GUN), done);
});

test('temiz satır AYNI nesne dönüyor — gereksiz kopya yok', () => {
    const clean = row({ arrived_at: `${GUN}T16:02:00` });
    assert.equal(withOwnStamps(clean, GUN), clean);
});

// ── Akış ────────────────────────────────────────────────────────────────────

test('ekrandaki "1143 saattir sürüyor" kartı artık çıkmıyor', () => {
    const r = row({ arrived_at: TEMMUZ_30 });
    assert.notEqual(kindOf(r, GUN, SIMDI), 'started');
    const [event] = build([r]);
    assert.notEqual(event.kind, 'started');
    assert.equal(event.elapsedSeconds, undefined, 'sayaç hiç kurulmuyor');
    // Satırın saati damgadan değil randevudan: "01:59" değil.
    assert.equal(event.time, '16:00');
});

test('ekrandaki "1481 saattir bekliyor" kartı artık çıkmıyor', () => {
    const r = row({ customer_name: 'irem', customer_arrived_at: TEMMUZ_16 });
    const [event] = build([r]);
    assert.notEqual(event.kind, 'arrived');
    assert.equal(event.waitMinutes, undefined);
});

test('bugünün gerçek damgası AYNEN çalışıyor', () => {
    const [started] = build([row({ arrived_at: `${GUN}T16:02:00` })]);
    assert.equal(started.kind, 'started');
    assert.equal(started.elapsedSeconds, (98 * 60));
    const [waiting] = build([row({ customer_arrived_at: `${GUN}T17:28:00` })]);
    assert.equal(waiting.kind, 'arrived');
    assert.equal(waiting.waitMinutes, 12);
});

// ── Kadro şeridi ve okuma katmanı ───────────────────────────────────────────

test('şerit personeli eski damgayla MEŞGUL göstermiyor', () => {
    const crew = [{ id: 's1', name: 'Furkan Ülger', active: true, color: null, phone: null }];
    const [stale] = presenceOf(crew, [row({ arrived_at: TEMMUZ_30 })], new Map(), GUN, SIMDI);
    assert.equal(stale.state, 'free');
    assert.equal(stale.minutes, undefined);
    const [live] = presenceOf(crew, [row({ arrived_at: `${GUN}T17:10:00` })], new Map(), GUN, SIMDI);
    assert.equal(live.state, 'busy');
    assert.equal(live.minutes, 30);
});

test('takvim, personel günü ve kart AYNI temiz satırı okuyor', () => {
    // Tek okuma noktası `toAppt`: taşınmış randevunun eski damgası orada düşüyor.
    const appt = toAppt({ ...row({ arrived_at: TEMMUZ_30, customer_arrived_at: TEMMUZ_16 }), date: GUN });
    assert.equal(appt.arrived_at, null);
    assert.equal(appt.customer_arrived_at, null);
});

// ── Düzen ───────────────────────────────────────────────────────────────────

test('kahraman rakam ASLA iki satıra kırılmıyor', () => {
    const ui = read('mobile/src/components/ui.tsx');
    const num = ui.slice(ui.indexOf('export function Num'), ui.indexOf('export function Card'));
    assert.match(num, /numberOfLines=\{fit \? 1 : undefined\}/);
    assert.match(num, /adjustsFontSizeToFit=\{fit\}/);

    const parts = read('mobile/src/components/FlowParts.tsx');
    // Canlı sayaç.
    assert.match(parts, /<Num\s*\n\s*fit\s*\n\s*size=\{flowMetrics\.liveCounter\}/);
    // Bekleme rakamının üç katmanı da (yer tutucu + iki kayan katman).
    const hero = parts.slice(parts.indexOf('function RollingHero'), parts.indexOf('function WaitAct'));
    assert.equal((hero.match(/<Num fit size=\{waitCardMetrics\.hero\}/g) ?? []).length, 3);
    // Birim sıkışmıyor; küçülen rakam.
    assert.match(hero, /flexShrink: 0,/);
});

// ── Kök neden: veritabanı ───────────────────────────────────────────────────

test('097: tarih değişince damgalar temizleniyor', () => {
    const sql = read('supabase/097_clear_stamps_on_reschedule.sql');
    const body = sql.replace(/^\s*--.*$/gm, '');
    assert.match(body, /before update of date on public\.reservations/);
    assert.match(body, /if new\.date is distinct from old\.date\s+and new\.status in \('pending', 'confirmed'\)/);
    for (const col of ['customer_arrived_at', 'arrived_at', 'service_ended_at']) {
        assert.match(body, new RegExp(`new\\.${col} := null;`));
    }
    // Aynı gün içinde saat değişince DOKUNMUYOR: süren işlem durmamalı.
    assert.doesNotMatch(body, /start_time is distinct from/);
    // 094'ün dersi: istemci rolleri adıyla.
    assert.match(body, /revoke all on function public\.clear_stamps_on_reschedule\(\) from public, anon, authenticated;/);
});

test('097 temizliği telefonla AYNI payı kullanıyor', () => {
    const body = read('supabase/097_clear_stamps_on_reschedule.sql').replace(/^\s*--.*$/gm, '');
    // [gün başı − 12 sa, gün başı + 24 + 12 sa]
    assert.ok(body.includes("- interval '12 hours'"));
    assert.ok(body.includes("+ interval '36 hours'"));
    assert.equal(24 + STAMP_DAY_MARGIN_HOURS, 36);
    assert.match(body, /at time zone 'Europe\/Istanbul'/);
});
