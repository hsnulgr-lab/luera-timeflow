/**
 * Hız 2 — personel kabuğunda (ve tek kişiliğin kumandasında) gereksiz çizim
 * ve ağ yükü (2026-11-12).
 *
 *   1. Kumanda kökü saniyede bir DEĞİL, bir sonraki değişim anında çiziliyor;
 *      saniyeyi sayaç ve halka kendi içinde sayıyor.
 *   2. Odakta olmayan ekran yoklamıyor ve zile okumayla cevap vermiyor;
 *      kirli kalıyor, odağa dönünce TEK okuma.
 *   3. Zil susana kadar bekleniyor (trailing debounce) ve süren okuma varken
 *      ikincisi açılmıyor (tek uçuş + bitince bir kez daha).
 *   4. Personel müşteri listesi FlatList; süzgeç ertelenmiş.
 *   5. Bugün listesinin satır işleyicileri kararlı, kart memo.
 *
 * Saf karar katmanları (`readGate.ts`, `kumandaClock.ts`) ÇALIŞTIRILARAK,
 * ekranlar kaynak sözleşmesi olarak sınanıyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    JUST_READ_MS, RING_MAX_WAIT_MS, RING_QUIET_MS, focusNeedsRead, readGate,
} from '../mobile/src/lib/readGate.ts';
import {
    MINUTE_MS, TICK_MARGIN_MS, WAIT_HOT_SEC, nextRootTick, nextSecondDelay, rootTickDelay,
} from '../mobile/src/lib/kumandaClock.ts';
import { waitLevel } from '../mobile/src/lib/visitControl.ts';

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const kumanda = code(read('app/(staff-flow)/kumanda.tsx'));
const agenda = code(read('src/lib/agendaSource.ts'));
const visit = code(read('src/lib/visitSource.ts'));
const file = code(read('src/lib/fileSource.ts'));
const quiet = code(read('src/lib/quietReads.ts'));

// ── Sahte saat ──────────────────────────────────────────────────────────────

function fakeClock() {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    return {
        timers: {
            now: () => now,
            set: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
            clear: (id) => { timers.delete(id); },
        },
        /** Saati ilerlet ve vakti gelen zamanlayıcıları sırayla çalıştır. */
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                timers.delete(due[0]);
                now = due[1].at;
                due[1].fn();
            }
            now = end;
        },
        pending: () => timers.size,
    };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function deferredRun() {
    const calls = [];
    const run = () => new Promise((resolve) => { calls.push(resolve); });
    return { calls, run };
}

// ── 3 · Zil kapısı ──────────────────────────────────────────────────────────

test('3 · pencere 400–800 ms arasında ve kalem otomatik kaydının (0,7 sn) üstünde', () => {
    assert.ok(RING_QUIET_MS >= 400 && RING_QUIET_MS <= 800, String(RING_QUIET_MS));
    assert.ok(RING_QUIET_MS > 700, 'meslektaşın 0,7 sn arayla gelen kayıtları tek okumaya inmeli');
    assert.ok(RING_MAX_WAIT_MS > RING_QUIET_MS);
});

test('3 · art arda zil TEK okumaya iniyor (trailing debounce)', async () => {
    const clock = fakeClock();
    let reads = 0;
    const gate = readGate(() => { reads += 1; }, clock.timers);
    // Başka personelin kalem kaydı: 0,7 sn arayla beş zil (2,8 sn).
    for (let i = 0; i < 5; i += 1) { gate.ring(); clock.advance(700); }
    // Pencere hiç kapanmadı ama azami bekleme doldu: bir okuma gitti.
    assert.equal(reads, 1, 'azami beklemede bir okuma');
    clock.advance(RING_QUIET_MS);
    await flush();
    assert.equal(reads, 2, 'zil susunca son bir okuma');
    // Önce: her zilde bir okuma = 5. Sonra: 2.
});

test('3 · tek zil, susma süresi sonunda okuyor — hemen değil', () => {
    const clock = fakeClock();
    let reads = 0;
    const gate = readGate(() => { reads += 1; }, clock.timers);
    gate.ring();
    clock.advance(RING_QUIET_MS - 1);
    assert.equal(reads, 0);
    clock.advance(1);
    assert.equal(reads, 1);
});

test('3 · hiç susmayan zil ekranı DONDURMUYOR — azami bekleme', async () => {
    const clock = fakeClock();
    let reads = 0;
    const gate = readGate(() => { reads += 1; }, clock.timers);
    for (let i = 0; i < 20; i += 1) { gate.ring(); clock.advance(300); await flush(); }
    // 6 saniyede en az iki okuma (2,5 sn'de bir).
    assert.ok(reads >= 2, `okuma: ${reads}`);
});

test('3 · süren okuma varken ikincisi AÇILMIYOR, bitince BİR KEZ daha', async () => {
    const clock = fakeClock();
    const { calls, run } = deferredRun();
    const gate = readGate(run, clock.timers);
    gate.fire();
    assert.equal(calls.length, 1);
    assert.equal(gate.busy(), true);
    gate.fire(); gate.fire(); gate.fire();
    assert.equal(calls.length, 1, 'uçuştayken yeni istek yok');
    calls[0]();
    await flush();
    assert.equal(calls.length, 2, 'arada istek geldiği için bir kez daha');
    calls[1]();
    await flush();
    assert.equal(calls.length, 2, 'ikinci turdan sonra durdu');
    assert.equal(gate.busy(), false);
});

test('3 · başarısız okuma kapıyı KİLİTLEMİYOR', async () => {
    const clock = fakeClock();
    let reads = 0;
    const gate = readGate(() => { reads += 1; return Promise.reject(new Error('ağ')); }, clock.timers);
    gate.fire();
    await flush();
    gate.fire();
    await flush();
    assert.equal(reads, 2);
    // Senkron fırlatan okuma da.
    const boom = readGate(() => { throw new Error('x'); }, clock.timers);
    boom.fire();
    await flush();
    assert.equal(boom.busy(), false);
});

test('3 · hemen okuma bekleyen zili karşılıyor; kapanış zili bırakıyor', () => {
    const clock = fakeClock();
    let reads = 0;
    const gate = readGate(() => { reads += 1; }, clock.timers);
    gate.ring();
    gate.fire();
    clock.advance(RING_QUIET_MS * 2);
    assert.equal(reads, 1, 'zil ayrıca okumadı');
    gate.ring();
    gate.cancel();
    clock.advance(RING_QUIET_MS * 2);
    assert.equal(reads, 1);
    assert.equal(clock.pending(), 0);
});

test('3 · retarget: gün değişince kapı yeni okumayı çağırıyor', () => {
    const clock = fakeClock();
    const seen = [];
    const gate = readGate(() => { seen.push('eski'); }, clock.timers);
    gate.retarget(() => { seen.push('yeni'); });
    gate.fire();
    assert.deepEqual(seen, ['yeni']);
});

// ── 2 · Odak kuralı ─────────────────────────────────────────────────────────

test('2 · odağa dönüş: kirliyse HER ZAMAN, değilse açılış okumasıyla çiftlenmiyor', () => {
    assert.equal(focusNeedsRead(null, 0, false), true, 'hiç okunmamış');
    assert.equal(focusNeedsRead(1000, 1000 + 50, false), false, 'açılış okuması az önce başladı');
    assert.equal(focusNeedsRead(1000, 1000 + JUST_READ_MS, false), true, 'sekmeye dönüş');
    assert.equal(focusNeedsRead(1000, 1000 + 50, true), true, 'odakta değilken bir şey kaçtı');
});

test('2 · odakta olmayan ekran okumuyor, kirli kalıyor, odağa dönünce okuyor', () => {
    // Yoklama ve öne dönüş: odakta değilse kirli, değilse kapıdan hemen.
    assert.match(quiet, /const poll = useCallback\(\(\) => \{\s*if \(!focused\.current\) \{ dirty\.current = true; return; \}\s*gate\.fire\(\);/);
    // Zil: odakta değilse kirli, değilse susmasını bekle.
    assert.match(quiet, /const ring = useCallback\(\(\) => \{\s*if \(!focused\.current\) \{ dirty\.current = true; return; \}\s*gate\.ring\(\);/);
    // Odak: tek okuma, kirlilik temizleniyor, bulanıklaşınca odak düşüyor.
    assert.match(quiet, /focused\.current = true;\s*if \(focusNeedsRead\(lastRead\.current, Date\.now\(\), dirty\.current\)\) gate\.fire\(\);\s*dirty\.current = false;\s*return \(\) => \{ focused\.current = false; \};/);
});

test('2 · üç kaynak da yoklama, öne dönüş, odak ve zili KAPIDAN geçiriyor', () => {
    for (const [name, src, silent] of [
        ['agenda', agenda, 'read(false)'],
        ['visit', visit, 'read(false, false)'],
        ['file', file, 'read(false)'],
    ]) {
        assert.ok(src.includes(`useQuietReads(useCallback(() => ${silent}, [read]), lastRead)`), name);
        assert.match(src, /useFocusEffect\(quiet\.onFocus\);/, name);
        assert.match(src, /if \(next === 'active'\) quiet\.poll\(\);/, name);
        assert.match(src, /useLiveSignal\(quiet\.ring, /, name);
        assert.match(src, /lastRead\.current = Date\.now\(\);/, name);
        // Kapının dışında sessiz okuma çağrısı kalmadı.
        assert.doesNotMatch(src, /void read\(false(, false)?\);/, name);
    }
    // Yoklama yalnız ODAKTAKİ ve ÖNDEKİ ekranda (aralık aynı: 25 sn).
    for (const src of [agenda, visit]) {
        assert.match(src, /if \(AppState\.currentState !== 'active'\) return;\s*quiet\.poll\(\);\s*\}, POLL_MS\);/);
    }
    // Kumandanın görünür ve benimseyen okumaları kapıdan GEÇMİYOR.
    assert.match(visit, /useEffect\(\(\) => \{ void read\(true, true\); \}, \[read\]\);/);
    assert.match(visit, /return read\(true, true\);/);
});

test('2 · liveSignal ve freshness DEĞİŞMEDİ (ortak dosyalar)', () => {
    // Bu iki dosya Hız 2'nin dışında; yalnız kullanılıyor.
    const signal = read('src/lib/liveSignal.ts');
    assert.match(signal, /const COALESCE_MS = 300;/);
    assert.match(read('src/lib/freshness.ts'), /export const POLL_MS = 25_000;/);
});

// ── 1 · Kumanda saati ───────────────────────────────────────────────────────

test('1 · kök artık saniyede bir çizilmiyor', () => {
    assert.doesNotMatch(kumanda, /setInterval\(\(\) => setNow\(Date\.now\(\)\)/);
    assert.match(kumanda, /rootTickDelay\(now, Date\.now\(\), \{ runningSince, customerSince, waitEndsAt \}\)/);
    assert.match(kumanda, /\}, \[now, runningSince, customerSince, waitEndsAt\]\);/);
});

test('1 · saniyeyi yalnız sayaç ve halka sayıyor', () => {
    assert.equal((kumanda.match(/<LiveCounter\b/g) ?? []).length, 2, 'iki sayaç yuvası');
    assert.match(kumanda, /<LiveWaitRing\s+endsAt=\{wait\.endsAt\}/);
    assert.doesNotMatch(kumanda, /\{formatCounter\(elapsedSec\)\}/);
    // Halkanın kademesi kendi kalan süresinden — sayıyla renk ayrışamaz.
    assert.match(kumanda, /level=\{waitLevel\(remaining\)\}/);
    assert.match(kumanda, /const LiveCounter = memo\(function LiveCounter/);
    assert.match(kumanda, /const Plate = memo\(function Plate/);
    assert.match(kumanda, /onNote=\{openNote\}/);
    assert.match(kumanda, /onCard=\{openCard\}/);
});

test('1 · kökün uyanma anları: duvar dakikası, geçen dakika, bekleme eşikleri', () => {
    const none = { runningSince: null, customerSince: null, waitEndsAt: null };
    // Duvar dakikası her zaman.
    assert.equal(nextRootTick(10_000, none), MINUTE_MS);
    // İş 12,5 sn'de başladı: geçen dakika 72,5 sn'de döner — duvardan önce değil.
    assert.equal(nextRootTick(30_000, { ...none, runningSince: 12_500 }), 60_000);
    assert.equal(nextRootTick(61_000, { ...none, runningSince: 12_500 }), 72_500);
    // Bekleme: son beş dakikaya giriş ve BİTİŞ anı.
    const endsAt = 1_000_000 + 7 * MINUTE_MS + 3_300;
    const t = endsAt - WAIT_HOT_SEC * 1000 - 100;
    assert.equal(nextRootTick(t, { ...none, waitEndsAt: endsAt }), endsAt - WAIT_HOT_SEC * 1000);
    assert.equal(nextRootTick(endsAt - 200, { ...none, waitEndsAt: endsAt }), endsAt, 'bitiş anı');
});

test('1 · bekleme biterken kök o anda uyanıyor ve ışık doğru kademede', () => {
    const endsAt = 5 * MINUTE_MS + 777;
    const inputs = { runningSince: null, customerSince: null, waitEndsAt: endsAt };
    // Kök birkaç saniye önce çizildi; arada duvar dakikası da var — o da
    // bir uyanma. Bitişe kadar uyanmaları izle.
    let at = endsAt - 4_000;
    let before = at;
    while (at < endsAt) { before = at; at += rootTickDelay(at, at, inputs); }
    assert.ok(at - endsAt <= TICK_MARGIN_MS, `uyanma ${at - endsAt} ms geç`);
    assert.equal(waitLevel(Math.ceil((endsAt - at) / 1000)), 'zero');
    assert.equal(waitLevel(Math.ceil((endsAt - before) / 1000)), 'hot');
});

test('1 · olay bayat çizimi HEMEN tazeliyor (iş başka cihazda başladı)', () => {
    // Kök 40 sn önce çizildi; arada iş başladı. Gecikme sıfır + pay.
    const rendered = 100_000;
    const wall = 140_000;
    const delay = rootTickDelay(rendered, wall, { runningSince: 130_000, customerSince: null, waitEndsAt: null });
    assert.equal(delay, TICK_MARGIN_MS);
});

test('1 · 40 dk beklemede kök çizimi ~2400 → ~45', () => {
    // Önce: 1000 ms aralık → 40 × 60 = 2400 kök çizimi.
    // Sonra: duvar dakikası + geçen dakika + iki eşik.
    let now = 1_000;
    const inputs = { runningSince: 500, customerSince: null, waitEndsAt: 1_000 + 40 * MINUTE_MS };
    let renders = 0;
    while (now < inputs.waitEndsAt) {
        now += rootTickDelay(now, now, inputs);
        renders += 1;
    }
    assert.ok(renders <= 2 * 40 + 3, `kök çizimi: ${renders}`);
});

test('1 · saniyelik tik başlangıca HİZALI', () => {
    assert.equal(nextSecondDelay(10_250, 10_000), 750 + TICK_MARGIN_MS);
    assert.equal(nextSecondDelay(10_000, 10_000), 1000 + TICK_MARGIN_MS);
    // Geri sayımda kökün ilerisinde bir köken (bitiş anı) — negatif kalan.
    assert.equal(nextSecondDelay(9_400, 10_000), 600 + TICK_MARGIN_MS);
});

test('1 · kayıt/kilit mantığına DOKUNULMADI', () => {
    for (const needle of ['savedKey', 'observe(', 'chainedStamp', 'shouldSaveItems', 'staleVerdict']) {
        assert.ok(kumanda.includes(needle), needle);
    }
});
