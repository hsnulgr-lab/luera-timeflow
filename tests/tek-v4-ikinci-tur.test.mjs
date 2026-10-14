/**
 * Tek Kişilik v4 · ikinci tur (2026-10-11).
 *
 * G2 sayaç ve saat ekleri · G3 bekleme (112) · hafta şeridi · Gün'ün ikonu ·
 * B2 kapalı günün açılış cümlesi · K3/C1 Kasa'nın bekleyen adisyonları ·
 * R2 "kim" adımı olmadan saat · S3 ilk hizmet · P1/P2 ekibe geçiş (113).
 * S1 (mod sorusu) `mobile-auth-signup-ui.test.mjs` içinde.
 *
 * Saf kararlar DAVRANIŞLA sınanıyor; ekranların bağlantısı kaynak metniyle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { clockDative, clockLocative } from '../mobile/src/lib/text.ts';
import { buildStaffDayState } from '../mobile/src/lib/staffDay.ts';
import { nextOpenAfter } from '../mobile/src/lib/createLive.ts';
import { openingSentence, soloEmptyCopy, soloWaitPanel } from '../mobile/src/lib/soloDay.ts';
import { activeWait, clearWaitIntents, rememberWait, waitIntentOf } from '../mobile/src/lib/waitIntent.ts';
import { pendingOf, pendingTicketLine, pendingTickets } from '../mobile/src/lib/managerFlow.ts';
import { actionLabel, slotSpeech } from '../mobile/src/lib/createFlow.ts';
import { TEAM_NAME_MAX, teamStart, teamStartProblem } from '../mobile/src/lib/authCopy.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const gun = code('mobile/app/tek/index.tsx');
const kumanda = code('mobile/app/(staff-flow)/kumanda.tsx');
const api = read('supabase/functions/staff-api/index.ts');
const staffClient = code('mobile/src/api/staff.ts');
const visitWrite = code('mobile/src/lib/visitWrite.ts');
const cash = code('mobile/app/mudur/cash.tsx');
const ticketsSheet = code('mobile/src/components/PendingTicketsSheet.tsx');
const createFlowUi = code('mobile/src/components/CreateFlow.tsx');
const apptParts = code('mobile/src/components/ApptParts.tsx');
const profile = code('mobile/app/mudur/profile.tsx');
const teamScreen = code('mobile/app/(manager-flow)/profil/ekip-ekle.tsx');
const authLive = code('mobile/src/api/auth.ts');
const authStub = code('mobile/src/api/authStub.ts');
const session = code('mobile/src/api/session.ts');
const rootLayout = code('mobile/app/_layout.tsx');
const m112 = read('supabase/112_bekleme_damgasi.sql');
const m113 = read('supabase/113_ekibe_gecis.sql');

// ── G2 · saat ekleri ve sayaç ───────────────────────────────────────────────

test('G2 · saatin yönelme hâli söylenen SON sayıya uyuyor', () => {
    for (const [time, want] of [
        ['14:00', '14:00’e'],   // on dört
        ['09:00', '09:00’a'],   // dokuz
        ['12:00', '12:00’ye'],  // on iki — kaynaştırma y'si
        ['16:00', '16:00’ya'],  // on altı
        ['17:00', '17:00’ye'],  // on yedi
        ['10:00', '10:00’a'],   // on
        ['20:00', '20:00’ye'],  // yirmi
        ['09:30', '09:30’a'],   // otuz
        ['13:40', '13:40’a'],   // kırk
        ['13:50', '13:50’ye'],  // elli
        ['11:15', '11:15’e'],   // on beş
        ['00:00', '00:00’a'],   // sıfır
    ]) {
        assert.equal(clockDative(time), want, time);
    }
    // Biçim dışı metin EKSİZ döner — uydurulmuş bir ek yanlış Türkçe yazardı.
    assert.equal(clockDative('—'), '—');
    assert.equal(clockDative('9:00'), '9:00');
});

test('G2 · SÜRÜYOR kartı "16:00’da biter" — sabit "’te" yarı yarıya yanlıştı', () => {
    const me = { id: 'derya', initials: 'DG', name: 'Derya Güzel', state: 'busy', minutes: 30 };
    const running = {
        id: 'r1', customer_id: null, customer_name: 'Gizem Ünal', customer_phone: null,
        date: '2026-10-11', start_time: '15:00', end_time: '16:00', service: 'Cilt Bakımı',
        service_color: null, status: 'confirmed', staff_id: 'derya', notes: null,
        arrived_at: '2026-10-11T15:00:00+03:00', service_ended_at: null,
    };
    const state = buildStaffDayState(me, [running], [me], 15 * 60 + 30, 30 * 60);
    assert.equal(state.panel.subText, 'Gizem Ünal · Cilt Bakımı · 16:00’da biter');
});

test('G2 · ŞU AN BOŞ kartı "14:00’e kadar" — sabit "’a" bunu yanlış yazıyordu', () => {
    const me = { id: 'derya', initials: 'DG', name: 'Derya Güzel', state: 'free' };
    const next = {
        id: 'n1', customer_id: null, customer_name: 'Sibel Karaca', customer_phone: null,
        date: '2026-10-11', start_time: '14:00', end_time: '14:30', service: 'Kaş',
        service_color: null, status: 'confirmed', staff_id: 'derya', notes: null,
        arrived_at: null, service_ended_at: null,
    };
    const state = buildStaffDayState(me, [next], [me], 11 * 60);
    assert.equal(state.panel.subText, '14:00’e kadar · sıradaki Sibel Karaca');
});

test('G2 · Gün süren iş varken SANİYEDE BİR, sunucu saatiyle ilerliyor', () => {
    assert.match(gun, /\}, runningRow \? 1_000 : 30_000\);/);
    assert.match(gun, /const serverNow = deviceNow \+ data\.clockOffset;/);
    // Geçen süre damgadan — okuma anındaki dakikadan değil (saniye ":00"da donuyordu).
    assert.match(gun, /\(serverNow - Date\.parse\(runningRow\.arrived_at\)\) \/ 1000/);
    assert.match(gun, /buildStaffDayState\(me, mine, data\.presence, nowMinutes, elapsedSeconds, '', selectedISO\)/);
    // Fark okuma ANINDA ölçülüyor.
    assert.match(code('mobile/src/lib/managerCalendarDay.ts'), /const clockOffset = nowMs - Date\.now\(\);/);
});

// ── G3 · bekleme (112) ──────────────────────────────────────────────────────

test('G3 · bu telefonun niyeti sunucudan ÖNCE geliyor; kaldırma da bir niyet', () => {
    clearWaitIntents();
    const now = Date.parse('2026-10-11T12:00:00Z');
    const server = { wait_ends_at: '2026-10-11T12:20:00Z', wait_minutes: 20 };

    // Niyet yok: söz sunucunun.
    assert.equal(waitIntentOf('r1'), undefined);
    assert.deepEqual(activeWait(server, waitIntentOf('r1'), now), { endsAt: Date.parse(server.wait_ends_at), minutes: 20 });

    // Sinyalsiz kurulan bekleme: sunucuda yok ama bu telefonda var.
    rememberWait('r1', { endsAt: now + 35 * 60_000, minutes: 35 });
    assert.deepEqual(activeWait({ wait_ends_at: null, wait_minutes: null }, waitIntentOf('r1'), now), {
        endsAt: now + 35 * 60_000, minutes: 35,
    });

    // Bu telefon kaldırdı: sunucuda hâlâ dursa bile bekleme yok.
    rememberWait('r1', null);
    assert.equal(waitIntentOf('r1'), null);
    assert.equal(activeWait(server, waitIntentOf('r1'), now), null);

    // Bitmiş bekleme bekleme değil.
    clearWaitIntents();
    assert.equal(activeWait(server, undefined, Date.parse('2026-10-11T12:20:00Z')), null);
    assert.equal(activeWait({ wait_ends_at: 'bozuk', wait_minutes: 20 }, undefined, now), null);
    // Yarım damga (süresiz) bekleme sayılmıyor.
    assert.equal(activeWait({ wait_ends_at: server.wait_ends_at, wait_minutes: null }, undefined, now), null);
});

test('G3 · BEKLEMEDE kartı: kalan dakika, kehribar, nabızsız; "KREM" uydurulmuyor', () => {
    const running = {
        id: 'r1', customer_name: 'Gizem Ünal', service: 'Boya', arrived_at: '2026-10-11T11:00:00Z',
        service_ended_at: null, status: 'confirmed',
    };
    const ends = new Date(2026, 9, 11, 14, 33).getTime();
    const panel = soloWaitPanel(running, { endsAt: ends }, ends - 12.2 * 60_000);
    assert.equal(panel.label, 'Beklemede');
    assert.equal(panel.tone, 'am');
    assert.equal(panel.hasPulse, false);
    assert.equal(panel.heroValue, '13');
    assert.equal(panel.heroUnit, 'dk');
    assert.equal(panel.subText, `Gizem Ünal · Boya · bekleme ${clockLocative('14:33')} biter`);
    assert.doesNotMatch(JSON.stringify(panel), /krem/i);

    // Son saniyeler "0 dk" değil "1 dk": bekleme henüz bitmedi.
    assert.equal(soloWaitPanel(running, { endsAt: ends }, ends - 5_000).heroValue, '1');
    // Bitince kart SÜRÜYOR'a döner (`null` → günün kartı).
    assert.equal(soloWaitPanel(running, { endsAt: ends }, ends), null);
    assert.equal(soloWaitPanel(null, { endsAt: ends }, ends - 60_000), null);
    assert.equal(soloWaitPanel(running, null, ends - 60_000), null);
});

test('G3 · kart kehribarı statik noktayla çiziyor', () => {
    const parts = code('mobile/src/components/StaffDayParts.tsx');
    // Tonlu kart (kehribar ya da tek kişiliğin GECİKTİ kırmızısı) STATİK
    // noktayla çiziliyor; nabız yalnız tonsuz süren işte.
    assert.match(parts, /\{panel\.tone \? \(\s*<View style=\{\{/);
    assert.match(parts, /backgroundColor: panel\.tone === 'rd' \? ink\.red : ink\.amDot,/);
    assert.match(parts, /color: panel\.tone === 'rd' \? ink\.red : panel\.tone === 'am' \? ink\.am : ink\.ink2,/);
});

test('G3 · Gün beklemeyi önce bu telefonun niyetinden okuyor', () => {
    // Her süren iş için (G5: beklemedeyken sıradakine başlanabiliyor).
    assert.match(gun, /waitOf: \(job\) => activeWait\(job, waitIntentOf\(job\.id\), serverNow\),/);
});

test('G3 · kumanda: halka HEMEN döner, yazma arkadan; sunucunun bitişi benimseniyor', () => {
    const pick = kumanda.slice(kumanda.indexOf('const endsAt = Date.now() + m * 60_000;'));
    assert.match(pick, /^const endsAt = Date\.now\(\) \+ m \* 60_000;\s*setWait\(\{ endsAt, total: m \* 60, source: waitSource\(m\) \}\);\s*rememberWait\(appointment\.id, \{ endsAt, minutes: m \}\);/);
    assert.match(pick, /void writeVisitWait\(appointment\.id, m\)\.then\(\(out\) => \{\s*observe\(out\.observation\);/);
    // Bu arada kaldırıldıysa sunucunun cevabı beklemeyi DİRİLTMİYOR.
    assert.match(pick, /if \(waitIntentOf\(appointment\.id\) === null\) return;\s*rememberWait\(appointment\.id, \{ endsAt: serverEnds, minutes: m \}\);/);
    // Halkaya dokunmak kaldırır — yerelde ve sunucuda.
    // (Arada "bekleme bitti" bildirimi de siliniyor — bekleme-bildirimi.test.)
    assert.match(kumanda, /setWait\(null\);\s*rememberWait\(appointment\.id, null\);\s*void disarmWaitAlarm\(appointment\.id\);\s*void writeVisitWait\(appointment\.id, null\)\.then\(\(out\) => observe\(out\.observation\)\);/);
    // Bitiş beklemeyi düşürüyor (sunucu da `visit.finish`te düşürüyor).
    assert.match(kumanda, /<HoldToFinish onFinish=\{\(\) => \{[\s\S]{0,200}setWait\(null\);\s*rememberWait\(appointment\.id, null\);/);
    // Kumanda yeniden açılınca halka GERİ KURULUYOR — eskiden sıfırlanıyordu.
    assert.match(kumanda, /setWait\(base \? restoredWait\(base, Date\.now\(\)\) : null\);/);
    assert.match(kumanda, /if \(!visit\.arrived_at \|\| visit\.service_ended_at \|\| visit\.status === 'completed'\) return null;/);
});

test('G3 · bekleme KUYRUĞA girmiyor; yazma sonucu sunucunun bitişini taşıyor', () => {
    // Saatler sonra boşalan bir kuyruk çoktan bitmiş beklemeyi yeniden kurardı.
    assert.match(staffClient, /visitWait: \(reservationId: string, minutes: number \| null\) =>\s*call\('visit\.wait', \{/);
    assert.match(staffClient, /idempotencyKey: `visit\.wait:\$\{reservationId\}:\$\{minutes \?\? 'off'\}:\$\{Date\.now\(\)\}`/);
    assert.match(visitWrite, /const out = await api\.visitWait\(reservationId, minutes\)/);
    assert.match(visitWrite, /endsAt: out\?\.reservation\?\.wait_ends_at \?\? null,/);
});

test('G3 · staff-api: süre 1–240 tam sayı, yalnız SÜREN işe, bitişi sunucu yazıyor', () => {
    const wait = api.slice(api.indexOf("if (action === 'visit.wait')"), api.indexOf("if (action === 'visit.note')"));
    assert.match(wait, /Number\.isInteger\(minutes\) && minutes >= 1 && minutes <= 240/);
    assert.match(wait, /return json\(\{ error: 'invalid_minutes' \}, 400\);/);
    assert.match(wait, /await loadOwnReservation\(body\.reservationId\)/);
    assert.match(wait, /!res!\.arrived_at \|\| res!\.service_ended_at\s*\|\| res!\.status === 'completed' \|\| res!\.status === 'cancelled'/);
    assert.match(wait, /return json\(\{ error: 'not_running' \}, 409\);/);
    // Damga telefonun saati değil — sunucunun.
    assert.match(wait, /wait_ends_at: new Date\(Date\.now\(\) \+ minutes \* 60_000\)\.toISOString\(\), wait_minutes: minutes/);
    assert.match(wait, /\.eq\('organization_id', me\.organization_id\)/);
    assert.match(wait, /return await done\(\{ ok: true, reservation: updated \}\);/);
    // Bitmiş iş beklemede olamaz.
    assert.match(api, /status: 'completed', service_ended_at: now, wait_ends_at: null, wait_minutes: null,/);
});

test('G3 · 112 · beklemenin şekli veritabanında; sıra önce göç sonra staff-api', () => {
    assert.match(m112, /ADD COLUMN IF NOT EXISTS wait_ends_at TIMESTAMPTZ,/);
    assert.match(m112, /ADD COLUMN IF NOT EXISTS wait_minutes SMALLINT;/);
    assert.match(m112, /\(wait_ends_at IS NULL\) = \(wait_minutes IS NULL\)/);
    assert.match(m112, /wait_minutes IS NULL OR wait_minutes BETWEEN 1 AND 240/);
    assert.match(m112, /DROP CONSTRAINT IF EXISTS reservations_wait_shape;/, 'idempotent');
    assert.match(m112, /SIRA: önce bu göç, sonra `staff-api`/);
    // Gün'ün okuması bekleme sütunlarını soruyor ve satıra taşıyor.
    assert.match(code('mobile/src/lib/managerMap.ts'), /'wait_ends_at' in row/);
});

test('G3 · işlem içi regresyon testi var ve kuru koşu tarifini taşıyor', () => {
    const regression = read('supabase/tests/tek_v4_regression.sql');
    assert.match(regression, /sed -e '\/\^BEGIN;\$\/d' -e '\/\^COMMIT;\$\/d' supabase\/112_bekleme_damgasi\.sql;/);
    assert.match(regression, /sed -e '\/\^BEGIN;\$\/d' -e '\/\^COMMIT;\$\/d' supabase\/113_ekibe_gecis\.sql;/);
    assert.match(regression, /violates check constraint "reservations_wait_shape"/);
    assert.match(regression, /\nROLLBACK;\n$/);
});

// ── Hafta şeridi · Gün'ün ikonu ─────────────────────────────────────────────

test('şerit: Gün personelin şeridini kullanıyor, kapalı günler yalnız gün OKUNDUYSA', () => {
    assert.match(gun, /<StaffWeekStrip[\s\S]{0,300}offDays=\{dayKnown \? data\.offDays : undefined\}/);
    assert.match(code('mobile/app/mudur/calendar.tsx'), /offDays=\{solo \? data\.offDays : undefined\}/);
    const parts = code('mobile/src/components/CalendarParts.tsx');
    assert.match(parts, /const off = offDays\?\.includes\(day\.date\) \?\? false;/);
    assert.match(parts, /off \? 'kapalı gün'/);
    // Kapalı günler `open` ile AYNI kuraldan.
    assert.match(code('mobile/src/lib/managerCalendarDay.ts'), /const offDays = week\.map\(\(day\) => day\.date\)\.filter\(\(iso\) => windowOn\(iso\) === null\);/);
});

test('Gün sekmesi GÜNEŞ — personel Bugün\'ün sembolü, ikinci bir takvim değil', () => {
    const tek = code('mobile/app/tek/_layout.tsx');
    const icon = "sf={{ default: 'sun.max', selected: 'sun.max.fill' }}";
    assert.ok(tek.includes(icon));
    assert.ok(code('mobile/app/personel/_layout.tsx').includes(icon));
});

// ── B2 · kapalı günün açılış cümlesi ────────────────────────────────────────

test('B2 · bir sonraki açılış: bilinmeyen gün yolda varsa cevap da bilinmiyor', () => {
    const open = { from: 9 * 60, to: 19 * 60 };
    const week = {
        '2026-10-12': null, '2026-10-13': open,
    };
    assert.deepEqual(nextOpenAfter('2026-10-11', (iso) => week[iso] ?? null), { dateISO: '2026-10-13', from: 540 });
    // Arada okunamayan bir gün: "Salı açıksınız" denemez.
    assert.equal(nextOpenAfter('2026-10-11', (iso) => (iso === '2026-10-12' ? undefined : open)), undefined);
    // İki hafta içinde açık gün yok.
    assert.equal(nextOpenAfter('2026-10-11', () => null), null);
});

test('B2 · "Yarın" yalnız BUGÜN seçiliyken; öteki günlerde gün adı, uzaksa tarih', () => {
    const at9 = (dateISO) => ({ dateISO, from: 9 * 60 });
    // 2026-10-11 pazar.
    assert.equal(openingSentence('2026-10-11', '2026-10-11', at9('2026-10-12')), `Yarın ${clockLocative('09:00')} açıksınız.`);
    // Başka bir güne bakarken "yarın" bakılan günün değil bugünün yarını olurdu.
    assert.equal(openingSentence('2026-10-18', '2026-10-11', at9('2026-10-19')), 'Pazartesi 09:00’da açıksınız.');
    assert.equal(openingSentence('2026-10-11', '2026-10-11', at9('2026-10-14')), 'Çarşamba 09:00’da açıksınız.');
    assert.match(openingSentence('2026-10-11', '2026-10-11', at9('2026-10-20')), /^20 Ekim Salı 09:00’da açıksınız\.$/);
    // Bilinmiyorsa ya da yoksa cümle YAZILMIYOR.
    assert.equal(openingSentence('2026-10-11', '2026-10-11', undefined), null);
    assert.equal(openingSentence('2026-10-11', '2026-10-11', null), null);
});

test('B2 · kapalı gün ipucu açılışı söylüyor; geçmiş kapalı gün söylemiyor', () => {
    const next = { dateISO: '2026-10-12', from: 9 * 60 };
    const today = soloEmptyCopy('2026-10-11', '2026-10-11', null, 3, next);
    assert.equal(today.title, 'Bugün kapalısınız.');
    assert.equal(today.hint, 'Pazar, çalışma saatlerinizde kapalı gün. Yarın 09:00’da açıksınız.');
    assert.equal(today.spoken, `${today.title} ${today.hint}`);

    const past = soloEmptyCopy('2026-10-04', '2026-10-11', null, 3, next);
    assert.equal(past.hint, 'Pazar, çalışma saatlerinizde kapalı gün.');

    // Açılış bilinmiyorsa eski cümle olduğu gibi.
    const unknown = soloEmptyCopy('2026-10-11', '2026-10-11', null, 3, undefined);
    assert.equal(unknown.hint, 'Pazar, çalışma saatlerinizde kapalı gün.');
    assert.match(gun, /soloEmptyCopy\([\s\S]{0,200}data\.nextOpen\)/);
});

// ── K3 · C1 · Kasa'nın bekleyen adisyonları ─────────────────────────────────

const due = (id, over = {}) => ({
    id, kind: 'due', time: '16:02', firstName: 'Gizem', lastName: 'Ünal', detail: 'Kalıcı Makyaj · 60 dk · Derya ile',
    appointmentId: id, amountValue: 1500, ticketKey: id, service: 'Kalıcı Makyaj', dateISO: '2026-10-11', ...over,
});

test('C1 · aynı adisyon tek sayılıyor — sayı ile liste aynı süzgeçten', () => {
    const events = [
        due('a1'),
        due('a1-split', { ticketKey: 'a1' }),
        due('a2', { amountValue: 900, dueMinutes: 40 }),
        { id: 'x', kind: 'started', time: '15:00', firstName: 'A', lastName: 'B', detail: '' },
    ];
    const tickets = pendingTickets(events);
    assert.deepEqual(tickets.map((ticket) => ticket.id), ['a1', 'a2']);
    const pending = pendingOf(events);
    assert.equal(pending.count, tickets.length);
    assert.equal(pending.amount, 2400);
});

test('C1 · satırın ikinci satırı kişi adı TAŞIMIYOR (karar 3), dünden kalanı söylüyor', () => {
    assert.equal(pendingTicketLine(due('a1')), 'Kalıcı Makyaj · 16:02’de bitti');
    assert.equal(pendingTicketLine(due('a1', { time: 'Dün 19:40', carriedOver: true })), 'Kalıcı Makyaj · Dün 19:40’ta bitti');
    assert.equal(pendingTicketLine(due('a1', { time: '12 Eylül 19:40', service: undefined })), '12 Eylül 19:40’ta bitti');
    assert.doesNotMatch(pendingTicketLine(due('a1')), /Derya/);
});

test('C1 · Kasa tek kişilikte kişi adını ekrandan kaldırıyor, veriyi değiştirmiyor', () => {
    assert.match(cash, /const solo = useInSoloShell\(\);/);
    assert.match(cash, /return solo \? read\.map\(\(movement\) => \(\{ \.\.\.movement, staff: '' \}\)\) : read;/);
});

test('K3 · şerit tahsilatı açıyor: tek adisyon doğrudan, birden çoksa liste', () => {
    assert.match(cash, /const tickets = useMemo\(\(\) => pendingTickets\(events\), \[events\]\);/);
    // Tek kişilikte tek adisyon doğrudan; ekipte her zaman önce liste (2026-10-15).
    assert.match(cash, /if \(solo && tickets\.length === 1\) \{\s*openTicket\(tickets\[0\]\);\s*return;\s*\}/);
    // Birden çoksa liste: içerik boyundaki sayfa (`kasa/bekleyen`).
    assert.match(cash, /onPick: solo \? openTicket : focusInFlow,/);
    assert.match(cash, /params: \{\s*id: ticket\.appointmentId,\s*from: 'tek',\s*back: 'kasa',\s*\.\.\.\(ticket\.dateISO \? \{ date: ticket\.dateISO \} : \{\}\),\s*\},/);
    // Geri oku dönülen yeri söylüyor: Kasa'dan açılınca "Kasa", "Gün" değil.
    assert.match(kumanda, /const backLabel = params\.back === 'kasa' \? 'Kasa' : params\.from === 'tek' \? 'Gün' : 'Bugün';/);
    // Liste: başlık şeridin kendi cümlesi; tutar bilinmiyorsa "₺0" uydurulmuyor.
    assert.match(ticketsSheet, /\{pendingTitle\(pending\)\}/);
    assert.match(ticketsSheet, /const line = pendingTicketLine\(ticket\);/);
    assert.match(ticketsSheet, /\{typeof amount === 'number' \? \(/);
    assert.match(ticketsSheet, /onPress=\{\(\) => onPick\(ticket\)\}/);
    // Dünden kalan adisyonu kumanda KENDİ gününde açıyor.
    assert.match(code('mobile/src/lib/flowBuild.ts'), /event\.dateISO = input\.dateISO;/);
    assert.match(code('mobile/src/lib/flowBuild.ts'), /dateISO: row\.date,/);
});

// ── R2 · "kim" adımı olmadan saat ───────────────────────────────────────────

test('R2 · gün sığmıyorsa düğme SEBEBİNİ söylüyor — "Saat seçin" değil', () => {
    const draft = { dateISO: '2026-10-12', startMinutes: null, staffId: null, customer: { id: 'c1', name: 'Gizem' }, service: { id: 's1', name: 'Boya', minutes: 60 } };
    assert.deepEqual(
        actionLabel(2, draft, false, { durationMinutes: 60, anyFree: false }),
        { label: 'Bu gün 60 dk’lık boş yer yok', enabled: false },
    );
    // Ray okunmadıysa (`null`) "boş yer yok" denmez.
    assert.equal(actionLabel(2, draft, false, null).label, 'Saat seçin');
    // Boş kutu varsa olağan cümle.
    assert.equal(actionLabel(2, draft, false, { durationMinutes: 60, anyFree: true }).label, 'Saat seçin');
    // Kutu SEÇİLMİŞSE bu soru sorulmuyor.
    assert.notEqual(
        actionLabel(2, { ...draft, startMinutes: 600, staffId: 'p1' }, false, { durationMinutes: 60, anyFree: false }).label,
        'Bu gün 60 dk’lık boş yer yok',
    );
    assert.match(createFlowUi, /\? \{ durationMinutes: duration, anyFree: rows\.some\(\(row\) => row\.kind === 'free'\) \}\s*: null,/);
});

test('R2 · tek kişilikte ray kişiyi okumuyor ve "… yapacak · Değiştir" çizilmiyor', () => {
    const free = { kind: 'free', minutes: 600, time: '10:00', staff: { id: 'p1', name: 'Derya', initials: 'D' } };
    assert.equal(slotSpeech(free), '10:00 boş, Derya');
    assert.equal(slotSpeech(free, false), '10:00 boş');
    const picked = { kind: 'pick', range: '10:00 – 11:00', staff: free.staff };
    assert.equal(slotSpeech(picked), '10:00 – 11:00 seçili, Derya yapacak');
    assert.equal(slotSpeech(picked, false), '10:00 – 11:00 seçili');

    assert.match(apptParts, /\{solo \? null : \(/);
    assert.match(apptParts, /accessibilityLabel=\{slotSpeech\(item, !solo\)\}/);
    assert.match(apptParts, /<FreeSlot key=\{item\.minutes\} item=\{item\} ax=\{ax\} solo=\{solo\}/);
    // Seçili blok "kim" yerine KİMİN İÇİN olduğunu söylüyor.
    assert.match(createFlowUi, /serviceName=\{solo && customerName\(draft\)\s*\? `\$\{customerName\(draft\)\} · \$\{draft\.service\?\.name \?\? ''\}`/);
    assert.match(code('mobile/app/mudur/create.tsx'), /const solo = useInSoloShell\(\);/);
});

// ── S3 · ilk hizmet ─────────────────────────────────────────────────────────

test('S3 · ilk hizmet: satırın ALTINDA ne isteneceği, dönüşte SEÇİLİ gelmesi', () => {
    assert.match(createFlowUi, /\{addService && context\.services\.length === 0 \? \(\s*<Hint>Ad, süre ve fiyat\. Eklenince burada seçili gelir\.<\/Hint>/);
    // Yol yoksa yalnız gerçek.
    assert.match(createFlowUi, /\{context\.services\.length === 0 && !addService \? \(\s*<Hint>Salonda tanımlı hizmet yok\.<\/Hint>/);
    // Tek bir yeni hizmet seçiliyor; birden çoksa hangisi istendi bilinmiyor.
    assert.match(createFlowUi, /const fresh = context\.services\.filter\(\(service\) => !mark\.ids\.has\(service\.id\)\);/);
    assert.match(createFlowUi, /if \(fresh\.length > 1\) return;/);
    // Not on dakikada bayatlıyor.
    assert.match(createFlowUi, /const ADD_SERVICE_WINDOW_MS = 10 \* 60_000;/);
    assert.match(createFlowUi, /if \(Date\.now\(\) - mark\.at > ADD_SERVICE_WINDOW_MS\) \{/);
    // Müşterinin risk kuralı kapatıyorsa seçilmiyor.
    assert.match(createFlowUi, /closedBy\(context\.settings\.riskRules, current\.customer\.fields, added\)\s*\? current/);
});

// ── P1 · P2 · ekibe geçiş (113) ─────────────────────────────────────────────

test('P1 · İşletme\'de Personel\'in yerinde "Ekip ekle", aynı satır biçiminde', () => {
    assert.match(profile, /\{solo \? \(\s*<ProfileRow\s*big\s*title="Ekip ekle"\s*sub="Tek kişilik çalışıyorsunuz"\s*onPress=\{\(\) => router\.push\('\/\(manager-flow\)\/profil\/ekip-ekle'\)\}/);
    // Ekipte Personel satırı yerinde.
    assert.match(profile, /\) : \(\s*<ProfileRow\s*big\s*title="Personel"/);
    assert.match(rootLayout, /<Stack\.Screen name="\(manager-flow\)\/profil\/ekip-ekle" \/>/);
});

test('P2 · v4 metinleri: önce neyin değişeceği, sonra tek form', () => {
    assert.equal(teamStart.title, 'Ekip ekle');
    assert.equal(teamStart.changeHead, 'Ekibe geçince');
    assert.equal(teamStart.change, 'İlk çalışanınızı eklediğinizde uygulama ekip düzenine geçer. Randevu kurarken kimin yapacağı sorulur, takvimde her kişiye bir sütun açılır, ana ekran Akış olur. Geçmiş randevularınız ve kasanız olduğu gibi kalır.');
    assert.equal(teamStart.formHead, 'Yeni çalışan');
    assert.equal(teamStart.name, 'Ad soyad');
    assert.equal(teamStart.namePlaceholder, 'Örn. Elif Demir');
    assert.equal(teamStart.specialty, 'Mesleği');
    assert.equal(teamStart.specialtyPlaceholder, 'Örn. Kuaför');
    assert.equal(teamStart.action, 'Ekle ve ekip düzenine geç');
    assert.equal(teamStart.foot, 'Çalışan kendi telefonundan girecekse, eklendikten sonra Personel sayfasındaki Telefon bağla ile tek seferlik kod üretirsiniz.');
    assert.equal(TEAM_NAME_MAX, 80, 'sunucunun sınırıyla aynı');
    assert.match(m113, /IF length\(v_name\) > 80 THEN/);
});

test('P2 · her hata işletmenin hangi düzende KALDIĞINI söylüyor', () => {
    for (const code of ['subscription_inactive', 'no_session', 'offline', 'beklenmedik']) {
        assert.match(teamStartProblem(code), /tek kişilik kaldı/, code);
    }
    assert.match(teamStartProblem('already_team'), /eklenmedi/);
    assert.equal(teamStartProblem('name_required'), 'Çalışanın adını yazın.');
    assert.equal(teamStartProblem('name_too_long'), 'Ad en fazla 80 harf olabilir.');
});

test('P2 · ekran: yazma önce sunucuya, kabuk ancak sonra değişiyor; hata düğmenin üstünde', () => {
    assert.match(teamScreen, /const result = await authApi\.team\.start\(name, specialty, ownerName\);\s*if \(result\.ok\) \{\s*feedback\.success\(\);\s*enterShell\('manager', false\);/);
    assert.ok(teamScreen.indexOf('{teamStartProblem(problem)}') < teamScreen.indexOf('<PrimaryButton'), 'hata düğmenin üstünde');
    // Ad boşken düğme kapalı; çalışırken kapalı.
    assert.match(teamScreen, /disabled=\{busy \|\| \(!alreadyTeam && !ready\)\}/);
    // "Zaten ekip": aynı formu yeniden göndermek aynı hayırı alırdı — düğme ekip düzenine geçiriyor.
    assert.match(teamScreen, /if \(alreadyTeam\) \{\s*enterShell\('manager', false\);\s*return;\s*\}/);
    assert.match(teamScreen, /maxLength=\{TEAM_NAME_MAX\}/);
    // Yeni bileşen yok: Personel'in kart dili ve Profil'in parçaları.
    assert.match(teamScreen, /<Group head=\{upperTR\(teamStart\.changeHead\)\}>/);
    assert.match(teamScreen, /<Group head=\{upperTR\(teamStart\.formHead\)\}>/);
    assert.match(teamScreen, /<Foot>\{teamStart\.foot\}<\/Foot>/);
});

test('P2 · canlı: tek çağrı, "zaten ekip" bazen başarı, profil yenileniyor, jeton düşüyor', () => {
    const fn = authLive.slice(authLive.indexOf('async function startTeam'), authLive.indexOf('async function teamMemberExists'));
    assert.match(fn, /supabase\.rpc\('start_team', \{\s*p_name: cleanName,\s*p_specialty: specialty\.trim\(\) \|\| null,\s*p_owner_name: cleanOwner,\s*\}\)/);
    // Cevabı kaybolan ilk istek: aynı adla çalışan varsa iş gitmiş.
    assert.match(fn, /const landed = refusal === 'already_team' && \(await teamMemberExists\(org\.id, cleanName\)\);/);
    // Gerçek "zaten ekip"te de saklı profil yenileniyor — bir sonraki açılış doğru kabuğa.
    assert.match(fn, /if \(refusal === 'already_team'\) await selectManagerBusiness\(org\.id\);/);
    // Personel tablosunun yazma kapısı aboneliğe bağlı (087).
    assert.match(fn, /if \(error\.code === '42501'\) return fail\('subscription_inactive'\);/);
    assert.match(fn, /await tokens\.clearStaff\(\);\s*return selectManagerBusiness\(org\.id\);/);
    // 115: kapının öbür yönü de aynı yerde.
    assert.match(authLive, /team: \{\s*start: startTeam,\s*end: endTeam,\s*\}/);
    assert.match(authStub, /team: \{\s*start: startTeam,\s*end: endTeam,\s*\}/);
    assert.match(session, /team: \{ \.\.\.authStub\.team, \.\.\.live\.team \},/);
    assert.match(session, /LIVE_PARTS = \[[^\]]*'team'/);
});

test('P2 · stub: bayrak çevriliyor, ikinci geçiş reddediliyor', () => {
    const fn = authStub.slice(authStub.indexOf('async function startTeam'), authStub.indexOf('async function completeSignup'));
    assert.match(fn, /if \(!session\.profile\.business\.solo\) return failure\('already_team'\);/);
    assert.match(fn, /business: \{ \.\.\.business, solo: false, staffCount: business\.staffCount \+ 1 \}/);
});

test('P2 · 113 · iki yazma TEK işlemde, yetki açmadan, yalnız tek kişilik işletmeye', () => {
    assert.doesNotMatch(m113, /SECURITY DEFINER/);
    assert.match(m113, /WHERE owner_id = auth\.uid\(\)\s*ORDER BY created_at\s*LIMIT 1\s*FOR UPDATE;/);
    assert.match(m113, /IF v_solo IS NOT TRUE THEN\s*RAISE EXCEPTION 'already_team';/);
    assert.match(m113, /UPDATE organizations SET solo = false WHERE id = v_org_id;/);
    // 094'ün dersi: PUBLIC'ten almak yetmiyor.
    assert.match(m113, /REVOKE ALL ON FUNCTION public\.start_team\(TEXT, TEXT\)\s*FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(m113, /GRANT EXECUTE ON FUNCTION public\.start_team\(TEXT, TEXT\) TO authenticated;/);
    // Rol 058'in kuralıyla; asistan hekimden önce.
    assert.ok(m113.indexOf("'%asistan%'") < m113.indexOf("'%hekim%'"));
});

test('kabuk değişimi: tek kişilik kabuk da geri kaydırmıyor', () => {
    assert.match(rootLayout, /<Stack\.Screen name="tek" options=\{\{ gestureEnabled: false \}\} \/>/);
});
