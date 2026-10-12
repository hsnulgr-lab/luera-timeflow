/**
 * Tek Kişilik · G5 · GÜN KARTININ SEÇİCİSİ (2026-10-13).
 *
 * Tasarım: `docs/design-reference/Luera Mobil - Tek Kisilik G5 Secici.html`
 * (Claude Design; kullanıcı "tam istediğim gibi" dedi, "birebir uygula").
 * Kart v4'teki gibi; yeni olan yığın ve hareket. Bu dosya:
 *   1. hareketin geometrisini tasarımın değerlerine,
 *   2. yığının kartlarını tasarımın sahnelerine (15:46, 15:16, 14:20),
 *   3. bileşenin ve ekranın sözlerini (jest, erişilebilirlik, seçim) kilitliyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    PICK_BUMP, PICK_HINT, PICK_PROJECTION, PICK_SPRING, PICK_STEP, overshootTable, rubberBand,
    settleTarget, stackPad, stackPose, stackTables, stepTarget, tapTarget,
} from '../mobile/src/lib/soloPicker.ts';
import {
    durationHero, soloPickCells, soloPickIndex, soloPickItems, soloPickSpoken, soloStartable,
} from '../mobile/src/lib/soloDay.ts';
import { cellSpec, cellTaps } from '../mobile/src/lib/actionPill.ts';
import { isNoShow } from '../mobile/src/lib/staffDay.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const design = read('docs/design-reference/Luera Mobil - Tek Kisilik G5 Secici.html');
const picker = code('mobile/src/components/SoloPicker.tsx');
const gun = code('mobile/app/tek/index.tsx');

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≠ ${expected}`);

// ── 1 · Geometri — tasarımın değerleri ──────────────────────────────────────

test('sabitler tasarım dosyasınınkiyle AYNI', () => {
    // Tasarım: `const S=72,SPR={k:330,c:20,m:.5},A_BUMP=28;`
    assert.match(design, /const S=72,SPR=\{k:330,c:20,m:\.5\},A_BUMP=28;/);
    assert.equal(PICK_STEP, 72);
    assert.equal(PICK_BUMP, 28);
    assert.deepEqual(PICK_SPRING, { stiffness: 330, damping: 20, mass: 0.5 });
    // Tasarım: settle(Math.round(clamp(pos+vi*.12)),vi) ve hint: settle(.25) → 260 ms → settle(0)
    assert.match(design, /settle\(Math\.round\(clamp\(pos\+vi\*\.12\)\),vi\)/);
    assert.equal(PICK_PROJECTION, 0.12);
    assert.match(design, /hint\(\)\{if\(rm\|\|n<2\)return;settle\(\.25\);setTimeout\(\(\)=>settle\(0\),260\)\}/);
    assert.deepEqual(PICK_HINT, { to: 0.25, backAfterMs: 260 });
});

test('duruşlar tasarımın hareket tablosu (H = 100 pt)', () => {
    const at = (d) => stackPose(d, 100);
    assert.deepEqual(at(0), { shift: 0, scale: 1, opacity: 1, content: 1 });
    // Ara nokta: ±34 (doğrusal 5,5 + çıkıntı 28) · ,97 · ,75 · metin ,30
    near(at(0.5).shift, 5.5 + 28, 'd=.5 kayma');
    near(at(0.5).scale, 0.97, 'd=.5 ölçek');
    near(at(0.5).opacity, 0.75, 'd=.5 opaklık');
    near(at(0.5).content, 0.3, 'd=.5 metin');
    // Komşu: ±11 · ,94 · ,50 · metin 0
    near(at(1).shift, 11, 'd=1 kayma');
    near(at(1).scale, 0.94, 'd=1 ölçek');
    near(at(1).opacity, 0.5, 'd=1 opaklık');
    assert.equal(at(1).content, 0);
    // İkinci komşu: ±20 · ,88 · ,25; d ≥ 3 görünmez.
    near(at(2).shift, 20, 'd=2 kayma');
    near(at(2).scale, 0.88, 'd=2 ölçek');
    near(at(2).opacity, 0.25, 'd=2 opaklık');
    assert.equal(at(3).opacity, 0);
    // Simetrik: yön işaretten.
    assert.deepEqual(at(-1), at(1));
});

test('interpolate tabloları: artan giriş, seçilide sıfır, sonraki AŞAĞIDA', () => {
    const t = stackTables(1, 100);
    for (let k = 1; k < t.inputRange.length; k += 1) {
        assert.ok(t.inputRange[k] > t.inputRange[k - 1], 'giriş artan olmalı (native interpolate şartı)');
    }
    const atPos = (p) => t.inputRange.indexOf(p);
    assert.equal(t.translateY[atPos(1)], 0);
    assert.equal(t.scale[atPos(1)], 1);
    // pos = 0 → kart 1 seçiliden SONRA (d = +1) → aşağıda; pos = 2 → yukarıda.
    assert.ok(t.translateY[atPos(0)] > 0);
    assert.ok(t.translateY[atPos(2)] < 0);
    assert.equal(stackTables(0, 100).inputRange.length, 25, 'çıkıntı ±1 arası sekizde bir örneklenir');
});

test('lastik bant, oturma, dokunma ve reduceMotion adımı', () => {
    // Uçtan öte en çok yarım randevu; içeride dokunulmaz.
    assert.equal(rubberBand(1.2, 3), 1.2);
    assert.ok(rubberBand(-10, 3) < 0 && rubberBand(-10, 3) > -0.5);
    assert.ok(rubberBand(12, 3) > 2 && rubberBand(12, 3) < 2.5);
    // Uçta yığının tamamı kayar: aşma × 72 × ,6 pt.
    const over = overshootTable(3);
    assert.deepEqual(over.inputRange, [-1, 0, 2, 3]);
    over.outputRange.forEach((value, k) => near(value, [43.2, 0, 0, -43.2][k], `aşma ${k}`));
    // Oturma: konum + hız × ,12, uçlarda kırpılır; hız ±25 ile sınırlı.
    assert.equal(settleTarget(0.3, 0, 3), 0);
    assert.equal(settleTarget(0.3, 5, 3), 1);
    assert.equal(settleTarget(0.3, 1000, 3), 2);
    assert.equal(settleTarget(-0.4, 0, 3), 0);
    // Dokunma: seçili kart 0…H; alt kenarlar H…H+8 ve H+8…H+14; üsttekiler eksi.
    assert.equal(tapTarget(50, 100, 1, 3), 1);
    assert.equal(tapTarget(104, 100, 1, 3), 2);
    assert.equal(tapTarget(111, 100, 0, 3), 2);
    assert.equal(tapTarget(-4, 100, 1, 3), 0);
    assert.equal(tapTarget(-4, 100, 0, 3), null, 'üstte kart yoksa boş paya dokunmak hiçbir şey açmaz');
    assert.equal(tapTarget(104, 100, 2, 3), null);
    // reduceMotion: kart parmağı izlemez; her 72 pt bir randevu, anlık.
    assert.equal(stepTarget(1, -71, 3), 1);
    assert.equal(stepTarget(1, -150, 3), 2);
    assert.equal(stepTarget(1, 80, 3), 0);
    // Yığın sayfaya iki kenar için 14, biri için 8 pt ekliyor; tek kartta 0.
    assert.deepEqual([stackPad(1), stackPad(2), stackPad(3)], [0, 8, 14]);
});

// ── 2 · Yığının kartları — tasarımın sahneleri ──────────────────────────────

const appt = (id, start, end, over = {}) => ({
    id, customer_id: null, customer_name: id, customer_phone: null, date: '2026-10-12',
    start_time: start, end_time: end, service: 'Kaş Tasarımı', service_color: null,
    status: 'confirmed', notes: null, arrived_at: null, service_ended_at: null, ...over,
});
const clock = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

test('G5·1 · 15:46 — BEKLİYOR · GECİKTİ · BAŞLAMAYA, üçü de Başlat', () => {
    const came = '2026-10-12T12:38:00Z';
    const nowMs = Date.parse(came) + 8 * 60_000;
    const day = [
        appt('Tuğçe Erden', '15:00', '15:20', { customer_arrived_at: came }),
        appt('Gizem Ünal', '15:30', '15:50'),
        appt('Yasemin Kurt', '16:30', '17:15', { service: 'Ağda' }),
    ];
    const now = 15 * 60 + 46;
    const items = soloPickItems({ running: [], waitOf: () => null, ticket: null, startable: soloStartable(day, now), nowMinutes: now, nowMs });
    assert.deepEqual(items.map((i) => [i.panel.label, i.panel.tone ?? null, i.panel.heroValue, i.panel.heroUnit]), [
        ['Bekliyor', 'am', '8', 'dk'],
        ['Gecikti', 'rd', '16', 'dk'],
        ['Başlamaya', null, '44', 'dk'],
    ]);
    // Geliş saati telefonun saatiyle — test makinesinin saat diliminden bağımsız.
    assert.match(items[0].panel.subText, new RegExp(`^Tuğçe Erden · Kaş Tasarımı · ${clock(came)}’(d|t)(a|e) geldi$`));
    assert.equal(items[1].panel.subText, 'Gizem Ünal · Kaş Tasarımı · 14 dk sonra gelmedi sayılır');
    assert.equal(items[2].panel.subText, 'Yasemin Kurt · Ağda · 16:30’da');
    // BAŞLAMAYA noktasız, nötr: ŞU AN BOŞ'un rengi.
    assert.equal(items[2].panel.hasPulse, false);
    assert.ok(items.every((i) => i.action?.label === 'Başlat' && i.action.tone === 'go'));
    // Ekran okuyucu (Karar 6).
    assert.equal(soloPickSpoken(items, 1), 'Gizem Ünal, Kaş Tasarımı, gecikti, 16 dakika, 3 randevudan 2');
    assert.equal(items[0].spoken, 'Tuğçe Erden, Kaş Tasarımı, bekliyor, 8 dakikadır');
    assert.equal(items[2].spoken, 'Yasemin Kurt, Ağda, başlamaya 44 dakika');
});

test('"ŞU AN BOŞ … sıradaki" YALNIZ yığının ilk kartı saati gelmemişken', () => {
    const day = [appt('Tuğçe Erden', '14:00', '14:20'), appt('Gizem Ünal', '15:00', '15:20')];
    const items = soloPickItems({ running: [], waitOf: () => null, ticket: null, startable: day, nowMinutes: 13 * 60 + 41, nowMs: 0 });
    assert.equal(items[0].panel.label, 'ŞU AN BOŞ');
    assert.equal(items[0].panel.heroValue, '19');
    assert.equal(items[0].panel.subText, '14:00’e kadar · sıradaki Tuğçe Erden');
    assert.equal(items[0].spoken, 'Tuğçe Erden, Kaş Tasarımı, sıradaki, 19 dakika sonra');
    // İkinci kart artık boşluk değil, kumandanın kelimesi.
    assert.equal(items[1].panel.label, 'Başlamaya');
    assert.deepEqual(durationHero(79), { heroValue: '1', heroUnit: 'sa', heroValue2: '19', heroUnit2: 'dk' });
});

test('G5·6 · SÜRÜYOR — sıradakilere yalnız BAKILIR: hap yok, kart dokunuşa kapalı', () => {
    const live = appt('Tuğçe Erden', '14:02', '16:02', { service: 'Kalıcı Makyaj', arrived_at: '2026-10-09T11:02:00Z' });
    const nowMs = Date.parse(live.arrived_at) + (74 * 60 + 12) * 1000;
    const later = [appt('Yasemin Kurt', '16:30', '17:15', { service: 'Ağda' }), appt('Vildan Ay', '17:30', '17:50')];
    const items = soloPickItems({ running: [live], waitOf: () => null, ticket: null, startable: later, nowMinutes: 15 * 60 + 16, nowMs });
    assert.deepEqual(items[0].panel, {
        label: 'SÜRÜYOR', hasPulse: true, heroValue: '74:12', subText: 'Tuğçe Erden · Kalıcı Makyaj · 16:02’de biter',
    });
    assert.deepEqual(items[0].action, { label: 'Kumandayı aç', tone: 'calm', appointmentId: 'Tuğçe Erden' });
    // "1 sa 14 dk" — süren iş yığının başında, sıradaki ŞU AN BOŞ değil BAŞLAMAYA.
    assert.deepEqual(
        [items[1].panel.label, items[1].panel.heroValue, items[1].panel.heroUnit, items[1].panel.heroValue2, items[1].panel.heroUnit2],
        ['Başlamaya', '1', 'sa', '14', 'dk'],
    );
    assert.equal(items[1].action, null);
    assert.equal(items[2].action, null);
});

test('G5·6 · BEKLEMEDE — Başlat AÇIK (paralel iş); iki süren iş de yığında', () => {
    const live = appt('Tuğçe Erden', '14:02', '16:02', { service: 'Kalıcı Makyaj', arrived_at: '2026-10-09T11:02:00Z' });
    const nowMs = Date.parse(live.arrived_at) + 18 * 60_000;
    const waiting = () => ({ endsAt: nowMs + 13 * 60_000 });
    const later = [appt('Yasemin Kurt', '16:30', '17:15', { service: 'Ağda' })];
    const items = soloPickItems({ running: [live], waitOf: waiting, ticket: null, startable: later, nowMinutes: 14 * 60 + 20, nowMs });
    // Etiket yalnız BEKLEMEDE — "· KREM" uydurulmuyor (kullanıcı kararı, devir §16).
    assert.equal(items[0].panel.label, 'Beklemede');
    assert.deepEqual(items[1].action, { label: 'Başlat', tone: 'go', appointmentId: 'Yasemin Kurt' });

    // Paralel iş başladı: iki süren iş — biri beklemede, öteki sürüyor →
    // sıradakine artık başlanmaz, ama iki iş de yığında (birine dönülebilsin).
    const second = appt('Gizem Ünal', '16:00', '16:20', { arrived_at: '2026-10-09T11:21:00Z' });
    const both = soloPickItems({
        running: [live, second],
        waitOf: (job) => (job.id === live.id ? waiting() : null),
        ticket: null, startable: later, nowMinutes: 14 * 60 + 22, nowMs,
    });
    assert.deepEqual(both.map((i) => [i.id, i.action?.label ?? null]), [
        ['Tuğçe Erden', 'Kumandayı aç'], ['Gizem Ünal', 'Kumandayı aç'], ['Yasemin Kurt', null],
    ]);
});

test('Karar 2 · seçim RANDEVUYA bağlı; düşünce ilk karta', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.equal(soloPickIndex(items, null), 0);
    assert.equal(soloPickIndex(items, 'c'), 2);
    // Önüne yeni randevu girdi: aynı randevu seçili kalır, yeri değişir.
    assert.equal(soloPickIndex([{ id: 'n' }, ...items], 'c'), 3);
    // Seçili yığından düştü (başladı, gelmedi, iptal) → ilk kart.
    assert.equal(soloPickIndex(items, 'gone'), 0);
});

// ── 3 · Bileşen ve ekran ────────────────────────────────────────────────────

test('jest: PanResponder (gesture-handler YOK), sayfayla paylaşım, native sürücü', () => {
    assert.doesNotMatch(read('mobile/src/components/SoloPicker.tsx'), /react-native-gesture-handler/);
    assert.match(picker, /PanResponder\.create\(\{/);
    // Karar 1: karttan başlayan dikey jest seçicinin, bırakılmaz.
    assert.match(picker, /onMoveShouldSetPanResponderCapture: \(_, g\) => Math\.abs\(g\.dy\) > Math\.abs\(g\.dx\) && Math\.abs\(g\.dy\) > PICK_CAPTURE_SLOP,/);
    assert.match(picker, /onPanResponderTerminationRequest: \(\) => false,/);
    assert.match(gun, /scrollEnabled=\{!picking\}/);
    assert.match(gun, /onDrag=\{setPicking\}/);
    // Yalnız translateY · scale · opacity, hepsi native sürücüde.
    assert.match(picker, /transform: \[\{ translateY: poses\[i\]\.translateY \}, \{ scale: poses\[i\]\.scale \}\]/);
    assert.doesNotMatch(picker, /useNativeDriver: false/);
    assert.equal((picker.match(/useNativeDriver: true/g) ?? []).length, 3, 'oturma + ipucunun iki yayı');
    assert.match(picker, /\.\.\.PICK_SPRING,/);
    // Bulanıklık önerilmedi (tasarım: düşük cihazda kare düşürür).
    assert.doesNotMatch(picker, /expo-blur|BlurView/);
});

test('tık her oturuşta, ekranın kendi değişikliğinde değil; ipucu bir kez', () => {
    assert.match(picker, /if \(!live\.current\.silent\) feedback\.selection\(\);/);
    assert.match(picker, /const HINT_KEY = 'tek\.g5\.ipucu';/);
    assert.match(picker, /if \(!stacked \|\| reduceMotion\) return undefined;/);
});

test('tek başlatılabilir: bugünkü kartın birebiri (G5·5)', () => {
    assert.match(picker, /if \(count === 1\) \{[\s\S]*?<StaffHeroPanelCard\s+panel=\{only\.panel\}/);
});

test('ekran okuyucu: ayarlanabilir öğe, yukarı/aşağı ve çift dokunuş (Karar 6)', () => {
    assert.match(picker, /accessibilityRole="adjustable"/);
    assert.match(picker, /accessibilityValue=\{\{ text: soloPickSpoken\(items, front\) \}\}/);
    assert.match(picker, /accessibilityActions=\{\[\s*\{ name: 'increment' \}, \{ name: 'decrement' \}, \{ name: 'activate' \},\s*\.\.\.\(selected\?\.menu \? \[\{ name: 'menu', label: 'Yönet' \}\] : \[\]\),\s*\]\}/);
});

test('seçim randevuya bağlı; Gün\'den çıkınca ve arka plandan dönünce ilk kart', () => {
    assert.match(gun, /const pickIndex = soloPickIndex\(pickItems, pickedId\);/);
    assert.match(gun, /useFocusEffect\(useCallback\(\(\) => \(\) => setPickedId\(null\), \[\]\)\);/);
    assert.match(gun, /previous\.match\(\/inactive\|background\/\) && next === 'active'\) setPickedId\(null\);/);
});

test('Karar 4 · liste kartı randevu kartını açar; seçilinin saati turuncu', () => {
    assert.match(gun, /selected=\{pickItems\.length > 1 && pickItems\[pickIndex\]\?\.id === appointment\.id\}/);
    const card = code('mobile/src/components/SoloDayParts.tsx');
    assert.match(card, /color: selected \? c\.or2 : c\.tx2,/);
    assert.match(card, /fontWeight: selected \? '800' : '600',/);
    // Liste kartı eskisi gibi randevu kartını açıyor ("Geldi" orada).
    assert.match(gun, /pathname: '\/\(manager-flow\)\/randevu\/\[id\]'/);
});

test('kart: yazı komşuda solar, "1 sa 14 dk"te dakika da büyük sayı', () => {
    const parts = code('mobile/src/components/StaffDayParts.tsx');
    assert.match(parts, /opacity: contentOpacity \?\? 1,/);
    assert.match(parts, /\{panel\.heroValue2 \? \(/);
});

// ── 4 · Eylem hapı (G5 · A — kullanıcı kararı 2026-10-13) ───────────────────

test('A · gözler kartın hâline göre: Gelmedi YALNIZ gecikince, iptal hapta YOK', () => {
    const phone = '0532 111 22 33';
    // Saati gelmemiş (ŞU AN BOŞ / BAŞLAMAYA): Ara · Yaz · Randevu kartı.
    assert.deepEqual(soloPickCells(appt('a', '16:00', '16:20', { customer_phone: phone }), 15 * 60), {
        cells: ['ara', 'wa', 'kart'], off: [],
    });
    // GECİKTİ: Gelmedi eklenir.
    assert.deepEqual(soloPickCells(appt('a', '14:50', '15:10', { customer_phone: phone }), 15 * 60).cells, ['ara', 'wa', 'nox', 'kart']);
    // Tam saatinde henüz gecikmedi.
    assert.deepEqual(soloPickCells(appt('a', '15:00', '15:20', { customer_phone: phone }), 15 * 60).cells, ['ara', 'wa', 'kart']);
    // BEKLİYOR: müşteri salonda — Ara/Yaz yok, ama yanlış "Geldi" geri alınabilir
    // (telefonda görüldü: tek kişilikte geri almanın yolu yoktu).
    assert.deepEqual(soloPickCells(appt('a', '14:00', '14:20', { customer_arrived_at: '2026-10-12T10:58:00Z' }), 15 * 60), {
        cells: ['geri', 'kart'], off: [],
    });
    // Numara yoksa Ara ve Yaz SÖNÜK (Akış · Müdür 34 v2): dokununca randevu kartı.
    assert.deepEqual(soloPickCells(appt('a', '16:00', '16:20'), 15 * 60).off, ['ara', 'wa']);
    assert.ok(!soloPickCells(appt('a', '14:00', '14:20'), 15 * 60).cells.includes('iptal'));
});

test('A · düğme yalnız başlatılabilir kartlarda; süren işte sıradakinde de yok', () => {
    const phone = '0532 111 22 33';
    const next = appt('Yasemin Kurt', '16:30', '17:15', { customer_phone: phone });
    const free = soloPickItems({ running: [], waitOf: () => null, ticket: null, startable: [next], nowMinutes: 15 * 60, nowMs: 0 });
    assert.deepEqual(free[0].menu, { cells: ['ara', 'wa', 'kart'], off: [] });
    const live = appt('Tuğçe Erden', '14:02', '16:02', { arrived_at: '2026-10-09T11:02:00Z' });
    const busy = soloPickItems({ running: [live], waitOf: () => null, ticket: null, startable: [next], nowMinutes: 15 * 60, nowMs: 0 });
    assert.deepEqual(busy.map((i) => i.menu), [null, null]);
});

test('A · Randevu kartı gözü DOKUNUNCA çalışır (ekran açar); öteki gözler basılı tutulur', () => {
    assert.equal(cellTaps('kart'), true);
    assert.equal(cellTaps('waoff'), true);
    for (const key of ['ara', 'wa', 'nox', 'inf', 'geri']) assert.equal(cellTaps(key), false, key);
    assert.deepEqual(cellSpec('geri'), { key: 'geri', label: 'Geldi’yi geri al', hint: 'müşteri gelmemiş sayılır' });
    assert.deepEqual(cellSpec('kart'), { key: 'kart', label: 'Randevu kartı', hint: 'iptal ve değişiklikler' });
});

test('A · "Gelmedi" kararı (098) payı beklemiyor; "Geldi" onu yener', () => {
    const base = appt('a', '15:00', '15:20');
    assert.equal(isNoShow(base, 15 * 60 + 5), false, 'pay dolmadı');
    assert.equal(isNoShow({ ...base, no_show_at: '2026-10-12T12:05:00Z' }, 15 * 60 + 5), true);
    assert.equal(isNoShow({ ...base, no_show_at: '2026-10-12T12:05:00Z', customer_arrived_at: '2026-10-12T12:20:00Z' }, 15 * 60 + 25), false);
    // Gün okuması kararı soruyor ve satıra taşıyor; sormayan okumada alan yok.
    assert.match(read('mobile/src/lib/managerMap.ts'), /\.\.\.\('no_show_at' in row \? \{ no_show_at: \(row\.no_show_at as string \| null\) \?\? null \} : \{\}\),/);
});

test('A · düğme Başlat\'ın SOLUNDA, kartta gerçek düğme; hap altında, düğmenin hizasında', () => {
    const parts = code('mobile/src/components/StaffDayParts.tsx');
    // Sırada önce Yönet, sonra hap (Başlat).
    assert.ok(parts.indexOf('accessibilityLabel="Yönet"') < parts.indexOf('{action ? ('), 'Yönet Başlat\'tan önce');
    assert.match(parts, /hitSlop=\{\(44 - staffDayMetrics\.menuSize\) \/ 2\}/);
    assert.match(parts, /accessibilityState=\{\{ expanded: menu\.open \}\}/);
    // Seçicinin içindeki kart bir görüntü; yalnız Yönet dokunuş alıyor.
    assert.match(picker, /interactive=\{false\}/);
    assert.match(picker, /pointerEvents=\{i === front \? 'box-none' : 'none'\}/);
    // Akış'ın hapı, altında, düğmenin hizasında.
    assert.match(picker, /<ActionPill[\s\S]*?below[\s\S]*?triggerRight=\{Math\.max\(0, width - menuFrame\.x - menuFrame\.width\)\}/);
    assert.match(code('mobile/src/components/ActionPill.tsx'), /position: 'absolute', right: triggerRight, \.\.\.seat,/);
    // Hap kimliğe bağlı: seçili kart değişince kendiliğinden kapanır.
    assert.match(picker, /const menuOpen = Boolean\(selected\?\.menu\) && menuFor === selected\?\.id;/);
});

test('A · Gün: Ara telefon, Yaz kendi WhatsApp\'ı, Gelmedi 098 damgası Gün\'ün kilidiyle', () => {
    assert.match(gun, /if \(cell === 'kart' \|\| item\.menu\?\.off\.includes\(cell\)\) \{\s*openAppointment\(appointment\);/);
    assert.match(gun, /Linking\.openURL\(`tel:\$\{tel\}`\)/);
    assert.match(gun, /waNudgeText\(\{ salon: businessName, time: appointment\.start_time\.slice\(0, 5\), late, day: 'bugün' \}\)/);
    assert.match(gun, /\? \{ no_show_at: new Date\(Date\.now\(\) \+ data\.clockOffset\)\.toISOString\(\) \}\s*: \{ customer_arrived_at: null \};/);
    assert.match(gun, /updateAppointment\(appointment\.id, lock, patch\)/);
    assert.match(gun, /const lock = data\.stamps\.get\(appointment\.id\);/);
    assert.match(gun, /onCell=\{onPickCell\}/);
});

