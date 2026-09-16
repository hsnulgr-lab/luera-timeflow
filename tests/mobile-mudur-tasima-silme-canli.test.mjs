import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * CANLI kipte müdüre OLMAMIŞ bir işi olmuş gibi gösteren üç kusur.
 *
 * Üçü de aynı aileden: ekran bir şey yaptığını söylüyordu, veritabanında
 * hiçbir şey olmuyordu.
 *
 *   1. Takvimde ve personel gününde taşıma yalnız EKRANDA oluyordu; sonuç
 *      sayfası "taşındı" diyordu ve yenileyince randevu eski yerine dönüyordu.
 *   2. Taşıma sayfasının boş/dolu saatleri SAHTE takvimden (`calendarSource`)
 *      okunuyordu — gerçekte dolu bir saat "müsait" görünebiliyordu.
 *   3. Randevu kartında "Sil" yalnız kartı KAPATIYORDU; randevu duruyordu.
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
/** Yorumlar çıkarılmış kaynak — iddia yorumdan değil, KODDAN kanıtlanmalı. */
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const calendar = code('app/mudur/calendar.tsx');
const staffDayScreen = code('app/(manager-flow)/personel/[id].tsx');
const staffDay = code('src/components/StaffDay.tsx');
const detail = code('app/(manager-flow)/randevu/[id].tsx');
const parts = code('src/components/MoveParts.tsx');
const writer = code('src/lib/managerMove.ts');
const write = code('src/lib/managerWrite.ts');
const source = code('src/lib/managerSource.ts');
const dayRead = code('src/lib/managerCalendarDay.ts');

// ── 1 · Taşıma gerçekten yazılıyor ──────────────────────────────────────────

test('taşımanın kilit damgası GÜNÜN okumasından geliyor', () => {
    // Damgasız yazmak `.eq('updated_at', …)` kilidini baştan kapatmak olurdu.
    assert.match(source, /export async function fetchDayWithStamps/);
    const fn = source.slice(source.indexOf('export async function fetchDayWithStamps'));
    assert.match(fn.slice(0, 900), /\.select\(`\$\{RES_COLS\}, updated_at`\)/);
    assert.match(fn.slice(0, 900), /\.eq\('organization_id', organizationId\)/);
    assert.match(fn.slice(0, 900), /stamps\.set\(String\(row\.id\), String\(row\.updated_at\)\)/);
    // Ve gün okuması onu ekrana taşıyor.
    assert.match(dayRead, /stamps: ReadonlyMap<string, string>/);
    assert.match(dayRead, /return \{ rows, stamps, columns/);
});

test('iki ekran da AYNI yazma yolundan geçiyor', () => {
    for (const screen of [calendar, staffDayScreen]) {
        assert.match(screen, /useMoveWriter\(data\.rows, data\.stamps, reload\)/);
    }
    // Personel günü sayfası yazmayı kendisi yapmıyor; ekran veriyor.
    assert.match(staffDayScreen, /onCommitMove=\{commit\}/);
    assert.match(staffDay, /await onCommitMove\(appointment, applyMove\(appointment, target\), target\.staffName\)/);
    // Sayfanın kendi yerel taşıma katmanı KALKTI — iki gerçek tutulmuyor.
    assert.doesNotMatch(staffDay, /setMoved/);
    assert.doesNotMatch(calendar, /setMoved/);
});

test('sunucu yazmadıysa sonuç sayfası AÇILMIYOR', () => {
    for (const screen of [calendar, staffDay]) {
        assert.match(screen, /if \(!ok\) return;\s*\n\s*setResult\(\{/);
    }
});

test('reddedilen taşıma yerel hâli GERİ ALIYOR', () => {
    const fn = writer.slice(writer.indexOf('const commit = useCallback'));
    // Kabul: yeni damga taşınıyor. Red: kayıt siliniyor ve ekrana söyleniyor.
    assert.match(fn, /to: outcome\.updatedAt/);
    assert.match(fn, /delete rest\[appointment\.id\];/);
    assert.match(fn, /setRefused\(outcome\);/);
    assert.match(fn, /if \(outcome\.kind === 'stale'\) void reload\(\);/);
    // Reddin sırası önemli: önce geri alma, sonra bildirim.
    assert.ok(fn.indexOf('delete rest[appointment.id]') < fn.indexOf('setRefused(outcome)'));
});

test('"geri al" da bir YAZMA', () => {
    // Yerel katmanı silmek randevuyu sunucuda eski saatine döndürmezdi.
    assert.match(calendar, /void commit\(done\.appointment, undoMove\(done\), done\.fromStaffName\)/);
    assert.match(staffDay, /void onCommitMove\(done\.appointment, undoMove\(done\), done\.fromStaffName\)/);
});

test('red SESSİZ geçmiyor — üç ekranda da durum bloğu var', () => {
    for (const screen of [calendar, staffDayScreen, detail]) {
        assert.match(screen, /refused\.kind === 'stale' \? STALE_TITLE/);
        assert.match(screen, /refused\.kind === 'conflict' \? refused\.message/);
    }
});

// ── 2 · Boş saatler gerçek günden ───────────────────────────────────────────

test('taşıma sayfası SAHTE takvimi okumuyor', () => {
    assert.doesNotMatch(parts, /calendarSource/);
    // Gün artık bir prop: sayfa kendi okumasını yapmıyor.
    assert.match(parts, /day: readonly Appt\[\];/);
    assert.match(parts, /slotRows\(\{\s*\n?\s*appointments: day,/);
});

test('üç çağıran da o günün GERÇEK listesini veriyor', () => {
    // Takvim ve personel günü `useMoveWriter`ın birleşmiş listesini, randevu
    // kartı kendi gün okumasını gönderiyor.
    assert.match(calendar, /<MoveSheet[\s\S]{0,200}day=\{appointments\}/);
    assert.match(staffDay, /<MoveSheet[\s\S]{0,200}day=\{appointments\}/);
    assert.match(detail, /<MoveSheet[\s\S]{0,200}day=\{data\.dayRows\}/);
});

// ── 3 · Silme gerçekten siliyor ─────────────────────────────────────────────

test('silme veritabanından SİLİYOR — kartı kapatmakla yetinmiyor', () => {
    assert.doesNotMatch(detail, /onDelete=\{close\}/);
    assert.match(detail, /onDelete=\{\(\) => \{ void remove\(\); \}\}/);
    const fn = detail.slice(detail.indexOf('const remove = useCallback'));
    assert.match(fn.slice(0, 600), /await deleteAppointment\(appointment\.id, updatedAt\)/);
    // Silindiyse kart kapanıyor; olmayan bir şeyin kartında durulmaz.
    assert.match(fn.slice(0, 600), /if \(outcome\.ok\) \{ close\(\); return; \}/);
    assert.match(fn.slice(0, 600), /setRefused\(outcome\)/);
});

test('silme üç korumayı da taşıyor', () => {
    const fn = write.slice(write.indexOf('export async function deleteAppointment'));
    const body = fn.slice(0, 1200);
    assert.match(body, /if \(await writesPaused\(\)\) return \{ ok: false, kind: 'paused' \};/);
    assert.match(body, /\.eq\('organization_id', organizationId\)/);
    assert.match(body, /\.eq\('updated_at', expectedUpdatedAt\)/);
    // Silinen satır geri isteniyor: 0 satır "silindi" sayılmamalı.
    assert.match(body, /\.select\('id'\)/);
    assert.match(body, /return outcomeOf\(error, null, data\?\.length \?\? 0\);/);
});

test('silme ile İPTAL ayrı iki iş', () => {
    // İptal edilen randevu kayıtta kalır, silinen kalmaz. Kart ikisini ayrı
    // satırda soruyor; birini ötekine çevirmek tasarımı da veriyi de bozardı.
    assert.match(detail, /onCancel=\{\(\) => \{ void commit\(\{ \.\.\.appointment, status: 'cancelled' \}\); \}\}/);
    assert.doesNotMatch(write.slice(write.indexOf('export async function deleteAppointment')), /status: 'cancelled'/);
});
