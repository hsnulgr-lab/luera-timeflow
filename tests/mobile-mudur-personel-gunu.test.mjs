import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { presenceOf } from '../mobile/src/lib/presence.ts';

/**
 * MÜDÜR · PERSONEL GÜNÜ CANLIYA BAĞLANDI.
 *
 * Ekranın iki kusuru vardı ve ikisi de sessizdi:
 *   • kadro `mockDay.presence`ten geliyordu — altı uydurma isim
 *   • gün SABİTTİ (`mockDay.dateISO`), yani müdür şeritte yarını seçip bir
 *     avatara dokunduğunda BUGÜNÜN randevularını görüyordu
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = strip(read('app/(manager-flow)/personel/[id].tsx'));
const flow = strip(read('app/mudur/index.tsx'));
const day = strip(read('src/lib/managerCalendarDay.ts'));
const source = strip(read('src/lib/managerSource.ts'));

const crew = (id, over = {}) => ({
    id, name: `${id} Kaya`, color: null, active: true, phone: null, ...over,
});
const appt = (over = {}) => ({
    id: 'a1', staff_id: 's1', status: 'confirmed',
    arrived_at: null, service_ended_at: null, ...over,
});
const NOW = Date.parse('2026-09-14T12:00:00+03:00');
const GUN = '2026-09-14';

// ── Hâl türetmesi ───────────────────────────────────────────────────────────

test('işlemi süren personel MEŞGUL ve süresi doğru', () => {
    const list = presenceOf(
        [crew('s1')],
        [appt({ arrived_at: '2026-09-14T11:36:00+03:00' })],
        new Map(), GUN, NOW,
    );
    assert.equal(list[0].state, 'busy');
    assert.equal(list[0].minutes, 24);
});

test('BİTMİŞ işlem personeli meşgul saymıyor', () => {
    const list = presenceOf(
        [crew('s1')],
        [appt({ arrived_at: '2026-09-14T11:00:00+03:00', service_ended_at: '2026-09-14T11:40:00+03:00' })],
        new Map(), GUN, NOW,
    );
    assert.equal(list[0].state, 'free');
    assert.equal(list[0].minutes, undefined, 'boşta dakika ANLAMSIZ');
});

test('İPTAL edilmiş randevu personeli meşgul etmiyor', () => {
    const list = presenceOf(
        [crew('s1')],
        [appt({ status: 'cancelled', arrived_at: '2026-09-14T11:36:00+03:00' })],
        new Map(), GUN, NOW,
    );
    assert.equal(list[0].state, 'free');
});

test('İZİN her şeyin ÖNÜNDE', () => {
    // İzinli personelin üstünde açık kalmış bir damga olabilir (dün
    // kapatılmamış). O damgaya bakıp "işlemde" demek, izinli birini salonda
    // göstermek olurdu.
    const list = presenceOf(
        [crew('s1')],
        [appt({ arrived_at: '2026-09-14T11:36:00+03:00' })],
        new Map([['s1', [GUN]]]), GUN, NOW,
    );
    assert.equal(list[0].state, 'leave');
    assert.equal(list[0].minutes, undefined);
});

test('BAŞKA GÜNÜN izni bugünü etkilemiyor', () => {
    const list = presenceOf([crew('s1')], [], new Map([['s1', ['2026-09-20']]]), GUN, NOW);
    assert.equal(list[0].state, 'free');
    // Ama izin günleri TAŞINIYOR: dönüş tarihi onlardan türüyor.
    assert.deepEqual(list[0].leaveDates, ['2026-09-20']);
});

test('izni olmayanda leaveDates alanı HİÇ YOK', () => {
    // Boş dizi "izni yok" ile "bilmiyoruz"u aynı şeye indirirdi.
    const list = presenceOf([crew('s1')], [], new Map(), GUN, NOW);
    assert.equal('leaveDates' in list[0], false);
});

test('geçmişe kalmış damga NEGATİF dakika üretmiyor', () => {
    const list = presenceOf(
        [crew('s1')],
        [appt({ arrived_at: '2026-09-14T12:30:00+03:00' })],
        new Map(), GUN, NOW,
    );
    assert.equal(list[0].minutes, 0, '"-30 dakikadır işlemde" diye bir şey yok');
});

test('iki açık işlemde EN ESKİSİ sayılıyor', () => {
    // Personel gerçekten o kadardır ayakta.
    const list = presenceOf(
        [crew('s1')],
        [
            appt({ id: 'a1', arrived_at: '2026-09-14T11:00:00+03:00' }),
            appt({ id: 'a2', arrived_at: '2026-09-14T11:50:00+03:00' }),
        ],
        new Map(), GUN, NOW,
    );
    assert.equal(list[0].minutes, 60);
});

test('telefon YOKSA uydurulmuyor', () => {
    const list = presenceOf([crew('s1'), crew('s2', { phone: '0532 118 24 07' })], [], new Map(), GUN, NOW);
    assert.equal(list[0].phone, null);
    assert.equal(list[1].phone, '0532 118 24 07');
});

test('"çalışmıyor" hâli ÜRETİLMİYOR', () => {
    // O hâl `staff.working_hours`tan türüyor ve o okuma henüz açılmadı.
    // Bilinmeyeni "çalışmıyor" saymak, o gün çalışan birini kapalı
    // gösterirdi.
    const list = presenceOf([crew('s1'), crew('s2')], [], new Map([['s2', [GUN]]]), GUN, NOW);
    assert.deepEqual(list.map((p) => p.state), ['free', 'leave']);
});

// ── Saat SUNUCUDAN ──────────────────────────────────────────────────────────

test('presence CİHAZIN saatini hiç okumuyor', () => {
    // `Date.now()` burada çağrılsaydı yanlış ayarlı bir telefon işlemi kırk
    // dakika sürüyormuş gibi gösterirdi.
    const src = strip(read('src/lib/presence.ts'));
    assert.doesNotMatch(src, /Date\.now\(\)/);
    assert.match(src, /nowMs: number/);
});

test('saat 095’teki uçtan geliyor ve okuma BAŞINA bir kez', () => {
    assert.match(source, /supabase\.rpc\('server_now'\)/);
    // Çözülemeyen damga sessizce cihaz saatine DÜŞMÜYOR.
    assert.match(source, /if \(!Number\.isFinite\(at\)\) throw new Error\('server_now_unreadable'\)/);
    assert.equal((day.match(/fetchServerNow\(\)/g) ?? []).length, 1);
});

// ── İzin penceresi ──────────────────────────────────────────────────────────

test('izin TEK GÜN değil PENCERE olarak okunuyor', () => {
    // "Dönüş tarihi" diye bir kolon yok; ardışık günlerden türüyor
    // (`staffDay.returnDateISO`) ve tek gün ardışıklık göstermez.
    assert.match(day, /fetchLeave\(dateISO, addDaysISO\(dateISO, LEAVE_WINDOW_DAYS\)\)/);
    assert.match(source, /\.gte\('date', from\)[\s\S]{0,60}\.lte\('date', to\)/);
    assert.match(source, /\.order\('date'\)/);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('gün ÇAĞIRANDAN geliyor — sabit değil', () => {
    assert.match(screen, /const \{ id, date \} = useLocalSearchParams/);
    assert.match(screen, /const dateISO = date \?\? todayISO\(\);/);
    assert.doesNotMatch(screen, /mockDay/);
    // Ve akış ekranı o günü GERÇEKTEN gönderiyor.
    assert.match(flow, /pathname: '\/personel\/\[id\]',\s*\n\s*params: \{ id: staffId, date: selectedISO \}/);
});

test('takvimle AYNI okumadan besleniyor', () => {
    // İki ekranın aynı günü iki ayrı okumadan çizmesi, ikisinin farklı şey
    // söylediği bir anı mümkün kılardı.
    assert.match(screen, /useManagerCalendarDay\(dateISO\)/);
    assert.match(screen, /presence=\{data\.presence\}/);
    // Liste `useMoveWriter`dan geçiyor: sunucunun satırları + kabul edilmiş
    // taşımalar. Ham `data.rows` verilseydi taşınan randevu bir sonraki
    // okumaya kadar eski saatinde görünürdü.
    assert.match(screen, /useMoveWriter\(data\.rows, data\.stamps, reload\)/);
    assert.match(screen, /appointments=\{appointments\}/);
    assert.match(screen, /onCommitMove=\{commit\}/);
});

test('okunamayan gün BOŞ gün gibi görünmüyor', () => {
    assert.match(screen, /if \(state === 'error'\)/);
    assert.match(screen, /what="Personelin gününü"/);
    assert.match(screen, /notMeaning="Randevusu olmadığı"/);
    // Red, hatadan ÖNCE.
    assert.ok(screen.indexOf('if (refusal)') < screen.indexOf("if (state === 'error')"));
});
