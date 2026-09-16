import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildFlow, kindOf } from '../mobile/src/lib/flowBuild.ts';
import { withOwnStamps } from '../mobile/src/lib/dayStamp.ts';
import { apptPhase } from '../src/lib/appointmentFlow.ts';

/**
 * "GELMEDİ" BİR DAMGA — 098 (müdür kararı, 2026-09-17).
 *
 * Telefondaki "Gelmedi" yalnız ekranda bir işaretti: yenileyince randevu
 * yeniden "sıradaki" oluyor, masaüstü "Onaylandı" demeye devam ediyordu.
 * Şimdi `no_show_at` yazılıyor ve İKİ UYGULAMA aynı kuralla okuyor.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const GUN = '2026-09-17';
const at = (clock) => Date.parse(`${GUN}T${clock}:00`);
const row = (over = {}) => ({
    id: 'r1', customer_id: 'c1', customer_name: 'hasan ulger', customer_phone: null,
    start_time: '14:00:00', end_time: '14:45:00', service: 'İmplant', status: 'confirmed',
    staff_id: 's1', customer_arrived_at: null, arrived_at: null, service_ended_at: null,
    no_show_at: null, is_paid: false, ...over,
});

// ── Okuma kuralı ────────────────────────────────────────────────────────────

test('müdürün "Gelmedi"si toleransı BEKLEMİYOR', () => {
    // 14:00 randevusu, saat 14:10 — tolerans (120 dk) çok uzakta.
    assert.equal(kindOf(row(), GUN, at('14:10')), 'next');
    assert.equal(kindOf(row({ no_show_at: `${GUN}T14:10:00` }), GUN, at('14:10')), 'noshow');
});

test('yenilemeden SONRA da gelmedi — karar sunucuda', () => {
    const [event] = buildFlow({
        rows: [row({ no_show_at: `${GUN}T14:10:00` })],
        payments: [], crew: new Map(), context: new Map(), dateISO: GUN, nowMs: at('14:30'),
    });
    assert.equal(event.kind, 'noshow');
});

test('geç gelen müşteri "gelmedi" SAYILMAZ — geldi damgası yener', () => {
    const late = row({ no_show_at: `${GUN}T14:10:00`, customer_arrived_at: `${GUN}T14:40:00` });
    assert.equal(kindOf(late, GUN, at('14:45')), 'arrived');
    assert.equal(kindOf({ ...late, arrived_at: `${GUN}T14:50:00` }, GUN, at('14:55')), 'started');
});

test('sütun hiç yoksa (098 öncesi) eski davranış', () => {
    const { no_show_at: _n, ...old } = row();
    assert.equal(kindOf(old, GUN, at('14:10')), 'next');
});

test('başka günün "gelmedi" kararı bu güne taşınmıyor', () => {
    const moved = row({ no_show_at: '2026-08-02T10:00:00' });
    assert.equal(withOwnStamps(moved, GUN).no_show_at, null);
    assert.equal(kindOf(moved, GUN, at('14:10')), 'next');
});

// ── Masaüstü AYNI kuralla ───────────────────────────────────────────────────

test('masaüstü de "Gelmedi" gösteriyor — iki uygulama aynı şeyi söylüyor', () => {
    const now = new Date(at('14:10'));
    const base = { status: 'confirmed', date: GUN, startTime: '14:00' };
    assert.equal(apptPhase(base, { now }), 'upcoming');
    assert.equal(apptPhase({ ...base, noShowAt: `${GUN}T14:10:00` }, { now }), 'missed');
    // Geldi damgası masaüstünde de yener.
    assert.equal(apptPhase({ ...base, noShowAt: `${GUN}T14:10:00`, customerArrivedAt: `${GUN}T14:40:00` }, { now }), 'upcoming');
    // Masaüstü sütunu okuyor.
    assert.match(read('src/hooks/useReservations.ts'), /noShowAt: row\.no_show_at \|\| undefined,/);
});

// ── Yazmalar ────────────────────────────────────────────────────────────────

const screen = code('mobile/app/mudur/index.tsx');

test('kartın "Gelmedi"si ve hapın "Gelmedi"si AYNI damgayı yazıyor', () => {
    assert.match(screen, /if \(event\.kind === 'next' && label === 'Gelmedi'\) \{\s*\n\s*void commit\(event, next, \{ no_show_at: stampNow\(\) \}\)/);
    assert.match(screen, /if \(cell === 'nox'\) \{\s*\n\s*void commit\(event, next, \{ no_show_at: stampNow\(\) \}\)/);
});

test('"Geri al" ve "Geç geldi" kararı TEMİZLİYOR', () => {
    assert.match(screen, /if \(event\.kind === 'noshow' && label === 'Geri al'\) \{\s*\n\s*void commit\(event, next, \{ no_show_at: null \}\)/);
    assert.match(screen, /void commit\(event, next, \{ customer_arrived_at: stampNow\(\), no_show_at: null \}\)/);
});

test('reddedilen yazma ekranda "gelmedi" BIRAKMIYOR', () => {
    // `commit` yalnız sunucu kabul edince yerel hâli değiştiriyor.
    const fn = screen.slice(screen.indexOf('const commit = useCallback'), screen.indexOf('const [freshId'));
    assert.ok(fn.indexOf('if (!outcome.ok)') < fn.indexOf('replace(event.id, next)'));
});

// ── Okuma katmanı: olmayan kolon dersi ──────────────────────────────────────

test('098 çalışmadan açılan telefon akışı KAYBETMİYOR', () => {
    const source = code('mobile/src/lib/managerSource.ts');
    const fn = source.slice(source.indexOf('export async function fetchFlowRows'), source.indexOf('export async function fetchPayments'));
    assert.match(fn, /await query\(`\$\{FLOW_COLS\}, \$\{FLOW_NO_SHOW_COL\}`\)/);
    // YALNIZ "kolon yok" hatasında sütunsuz yeniden okunuyor.
    assert.match(fn, /if \(error\?\.code === UNDEFINED_COLUMN\) \(\{ data, error \} = await query\(FLOW_COLS\)\);\s*\n\s*if \(error\) throw error;/);
    assert.match(fn, /no_show_at: \(row\.no_show_at as string \| null\) \?\? null,/);
});

// ── Migration ───────────────────────────────────────────────────────────────

test('098 sütunu açıyor ve 097 kuralı onu da temizliyor', () => {
    const sql = read('supabase/098_no_show_at.sql').replace(/^\s*--.*$/gm, '');
    assert.match(sql, /add column if not exists no_show_at timestamptz;/);
    assert.match(sql, /new\.no_show_at := null;/);
    // 097'nin öteki üç damgası da yerinde — fonksiyon bütünüyle yeniden yazılıyor.
    for (const col of ['customer_arrived_at', 'arrived_at', 'service_ended_at']) {
        assert.match(sql, new RegExp(`new\\.${col} := null;`));
    }
    assert.match(sql, /revoke all on function public\.clear_stamps_on_reschedule\(\) from public, anon, authenticated;/);
    // Randevu iptal EDİLMİYOR: "gelmedi" bir iptal değil.
    assert.doesNotMatch(sql, /status\s*=\s*'cancelled'/);
});

// ── Eylem hapı · "Yaz" gözü ne yaptığını DOĞRU söylüyor ─────────────────────

test('"Yaz" gözü söylediğini yapıyor — hazır metin, salonun numarası (v2)', () => {
    const pill = read('mobile/src/lib/actionPill.ts');
    assert.match(pill, /wa: \{ label: 'WhatsApp’tan yaz', hint: 'hazır metin, salonun numarası' \}/);
    // Söz tutuluyor: metin hazırlanıyor ve salonun hattından gidiyor.
    const screen = read('mobile/app/mudur/index.tsx');
    assert.match(screen, /waNudgeText\(\{/);
    assert.match(screen, /sendWaNudge\(\{/);
    assert.doesNotMatch(screen, /wa\.me/);
});
