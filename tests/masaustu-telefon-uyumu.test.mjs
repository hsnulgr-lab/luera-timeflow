// Mobil↔masaüstü uyum denetimi · Paket D (2026-11-12) — masaüstü tarafı.
//
// 1. Ayar kaydı bellekte olmayan hizmetleri silmesin.
// 2. Ayar kaydı yalnız değişen kolonları, updated_at kilidiyle yazsın.
// 3. Randevu listesi 500 satırda kesilmesin (sayfalı okuma).
// 4. Elle randevu her sektörde onaylı (calendar-faces / mobil-onay-rafta testlerinde).
// 5. "Gelmedi" evresi masaüstü rozetinde "Onaylı" görünmesin.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
    changedSettingsColumns, dedupeByName, mergeSettingsFields, pickColumnFields, planServiceWrites, servicesChanged, settingsColumnsOf,
} from '../src/lib/ayarYazimi.ts';
import { readAllPages } from '../src/lib/sayfaliOku.ts';
import { calendarProfileFor } from '../src/lib/calendarSectorProfiles.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const hours = [{ day: 1, dayName: 'Pazartesi', start: '09:00', end: '18:00', isOff: false }];
const base = {
    businessName: 'Salon', workingHours: hours, services: [], slotDuration: 30, sector: 'kuafor',
    loyaltyEnabled: false, loyaltyThreshold: 10, loyaltyReward: 'Ücretsiz hizmet', rebookEnabled: false, rebookNote: '',
};
const svc = (id, name, extra = {}) => ({ id, name, duration: 30, color: '#FF5A1F', ...extra });
const never = () => false;

// ── 1 · hizmet silme ────────────────────────────────────────────────────────

test('hizmet listesi aynı referans ya da aynı içerikse "değişmedi" sayılır', () => {
    const list = [svc('a', 'Kesim'), svc('b', 'Fön')];
    assert.equal(servicesChanged(list, list), false);
    assert.equal(servicesChanged(list, list.map((s) => ({ ...s }))), false);
    assert.equal(servicesChanged(list, [list[0]]), true);
    assert.equal(servicesChanged(list, [list[0], { ...list[1], duration: 45 }]), true);
});

test('telefondan sonradan eklenen hizmet (yüklemede yoktu) silinmez', () => {
    const shown = [svc('a', 'Kesim'), svc('b', 'Fön')];
    const loaded = new Set(['a', 'b']);
    const db = new Set(['a', 'b', 'telefon']);
    const next = [shown[0], { ...shown[1], duration: 45 }];
    const plan = planServiceWrites(shown, loaded, db, next, never);
    assert.deepEqual(plan.toDelete, []);
    assert.deepEqual(plan.toUpdate.map((s) => s.id), ['b'], 'yalnız değişen hizmet yazılır');
    assert.deepEqual(plan.toInsert, []);
});

test('yüklemede elenen aynı adlı ikiz silinmez; kullanıcının çıkardığı silinir', () => {
    const all = [svc('a', 'Kesim'), svc('a2', 'Kesim'), svc('b', 'Fön')];
    const shown = dedupeByName(all);
    assert.deepEqual(shown.map((s) => s.id), ['a', 'b']);
    const loaded = new Set(all.map((s) => s.id));
    const db = new Set(loaded);
    const plan = planServiceWrites(shown, loaded, db, [shown[0]], never);
    assert.deepEqual(plan.toDelete, ['b'], 'yalnız ekrandan çıkarılan');
});

test('başka cihazın sildiği hizmet yeni kimlikle diriltilmez; yeni hizmet eklenir', () => {
    const shown = [svc('a', 'Kesim'), svc('b', 'Fön')];
    const loaded = new Set(['a', 'b']);
    const db = new Set(['a']); // b telefonda silindi
    const next = [...shown, svc('svc-1', 'Boya')];
    const plan = planServiceWrites(shown, loaded, db, next, never);
    assert.deepEqual(plan.toDelete, []);
    assert.deepEqual(plan.toInsert.map((s) => s.id), ['svc-1']);
});

test('updateSettings: hizmetlere yalnız liste değiştiyse dokunur, toplu "bellekte yoksa sil" yok', () => {
    const src = strip(read('src/hooks/useReservations.ts'));
    const body = src.slice(src.indexOf('const updateSettings = useCallback'), src.indexOf('const checkConflict = useCallback'));
    assert.match(body, /!servicesChanged\(svcBase\.shown, newSettings\.services\)/);
    assert.match(body, /planServiceWrites\(/);
    assert.doesNotMatch(body, /filter\(id => !keepIds\.has\(id\)\)/, 'eski toplu silme geri gelmemeli');
    // Yükleme: ikizler elenir ama tüm kimlikler tabana girer
    assert.match(src, /loadedIds: new Set\(allServices\.map/);
});

// ── 2 · yalnız değişen kolon + kilit ────────────────────────────────────────

test('yalnız değişen kolonlar yazılır — bayat saatler sadakat kaydıyla geri dönmez', () => {
    const next = { ...base, loyaltyEnabled: true };
    assert.deepEqual(changedSettingsColumns(base, next), { loyalty_enabled: true });
    assert.deepEqual(changedSettingsColumns(base, { ...base }), {});
    const hoursChanged = { ...base, workingHours: [{ ...hours[0], end: '20:00' }] };
    assert.deepEqual(Object.keys(changedSettingsColumns(base, hoursChanged)), ['working_hours']);
});

test('normalleştirme eski upsert ile aynı (boş webhook → null, sektör yoksa genel)', () => {
    const cols = settingsColumnsOf({ ...base, webhookUrl: '', sector: undefined });
    assert.equal(cols.webhook_url, null);
    assert.equal(cols.sector, 'genel');
});

test('mergeSettingsFields yalnız değişen alanları tabana uygular', () => {
    const stale = { ...base, workingHours: [], loyaltyEnabled: true };
    const merged = mergeSettingsFields(base, stale);
    assert.equal(merged.loyaltyEnabled, true);
    // workingHours da farklı → o da uygulanır (çağıran gerçekten değiştirdi sayılır)
    assert.deepEqual(merged.workingHours, []);
    assert.deepEqual(mergeSettingsFields(base, { ...base }), base);
});

test('pickColumnFields yalnız settings kolonlarının alanlarını taşır', () => {
    const f = pickColumnFields({ ...base, services: [svc('a', 'Kesim')], arrivalToleranceMin: 5 });
    assert.equal('services' in f, false);
    assert.equal('arrivalToleranceMin' in f, false);
    assert.deepEqual(f.workingHours, hours);
});

test('updateSettings: satır güncellemesi updated_at kilitli, 0 satırda yeniden yükler', () => {
    const src = strip(read('src/hooks/useReservations.ts'));
    const body = src.slice(src.indexOf('const updateSettings = useCallback'), src.indexOf('const checkConflict = useCallback'));
    assert.match(body, /changedSettingsColumns\(current\.base, newSettings\)/);
    assert.match(body, /\.update\(\{ \.\.\.changed, updated_at: stampedAt \}\)/);
    assert.match(body, /query\.is\('updated_at', null\) : query\.eq\('updated_at', current\.stamp\)/);
    assert.match(body, /Ayarlar başka yerde değişti, yenilendi/);
    assert.match(body, /void fetchSettings\(orgId\)/);
    // Kilit yalnız bizim kolonu başkası değiştirdiyse çakışma; yoksa bir kez yeniden dener
    assert.match(body, /sameColumnChanged \|\| attempt >= 1/);
    // İlk oluşturma yolu korunur
    assert.match(body, /if \(!row\) \{[\s\S]*?\.upsert\(/);
    // Satır sahibe bağlı kalır (settingsUserRef — org başına değil user_id bazlı)
    assert.match(body, /const ownerId = settingsUserRef\.current \?\? user\.id;/);
    assert.match(body, /\.eq\('user_id', ownerId\)/);
    // Damga yüklemede saklanır
    assert.match(src, /settingsRowRef\.current = \{ base: fresh, stamp: \(settingsData\.updated_at/);
});

// ── 3 · sayfalı okuma ───────────────────────────────────────────────────────

test('readAllPages kısa sayfa gelene kadar okur', async () => {
    const all = Array.from({ length: 2350 }, (_, i) => i);
    const calls = [];
    const { rows, error } = await readAllPages(async (from, to) => {
        calls.push([from, to]);
        return { data: all.slice(from, to + 1), error: null };
    });
    assert.equal(error, null);
    assert.equal(rows.length, 2350);
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('readAllPages tam sayfa sınırında bir boş sayfa daha okuyup durur; hatayı döner', async () => {
    const { rows } = await readAllPages(async (from) => ({ data: from === 0 ? [1, 2] : [], error: null }), 2);
    assert.deepEqual(rows, [1, 2]);
    const boom = new Error('x');
    const r = await readAllPages(async () => ({ data: null, error: boom }));
    assert.equal(r.error, boom);
});

test('fetchReservations 500 satır sınırı yok; id ile kararlı sıralı sayfalı okur', () => {
    const src = strip(read('src/hooks/useReservations.ts'));
    const body = src.slice(src.indexOf('const fetchReservations = useCallback'), src.indexOf('const fetchReservationById'));
    assert.doesNotMatch(body, /\.limit\(500\)/);
    assert.match(body, /readAllPages/);
    assert.match(body, /\.order\('id', \{ ascending: true \}\)\s*\.range\(from, to\)/);
});

// ── 4 · elle randevu ────────────────────────────────────────────────────────

test('elle randevu varsayılanı confirmed (online/WhatsApp pending yolları ayrı)', () => {
    assert.equal(calendarProfileFor('genel').manualStatus, 'confirmed');
    assert.equal(calendarProfileFor('dis').manualStatus, 'confirmed');
});

// ── 5 · Gelmedi rozeti ──────────────────────────────────────────────────────

test('phaseBadge "missed" evresini "Gelmedi" gösterir, Onaylı’ya düşmez', () => {
    const src = strip(read('src/utils/statusColors.ts'));
    assert.match(src, /if \(ph === 'missed'\) \{\s*return \{ label: PHASE_LABEL\.missed/);
    assert.match(src, /'noShowAt'/, 'müdürün Gelmedi damgası da evreye girer');
    assert.match(read('src/lib/appointmentFlow.ts'), /missed: 'Gelmedi'/);
});
