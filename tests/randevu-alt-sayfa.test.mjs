/**
 * RANDEVU KARTININ ALT SAYFALARI = iOS'UN SAYFASI (2026-10-13).
 *
 * Kullanıcı: "Hizmeti değiştir, Notu düzenle — Kasa'daki gibi aşağı çekince
 * kapanan sayfaya taşı, bozmadan". Eskiden `BottomSheet`: tutamak çizili,
 * sürüklenmiyordu. Artık Kasa'nın yapısı: kök yığında içerik boyunda
 * `formSheet` rotası + köprü (`state/apptSheet.ts`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const sheets = code('src/components/ApptSheets.tsx');
const service = sheets.slice(sheets.indexOf('export function ServiceSheet('), sheets.indexOf('export function NoteSheet('));
const note = sheets.slice(sheets.indexOf('export function NoteSheet('), sheets.indexOf('export function ConfirmDialog('));

test('iki sayfa kök yığında, Kasa\'nınkiyle aynı seçeneklerle', () => {
    const layout = code('app/_layout.tsx');
    assert.match(layout, /const APPT_SHEET = \{\s*presentation: 'formSheet',\s*sheetAllowedDetents: 'fitToContents',\s*sheetGrabberVisible: false,\s*\} as const;/);
    assert.match(layout, /<Stack\.Screen name="\(manager-flow\)\/randevu\/hizmet" options=\{APPT_SHEET\} \/>/);
    assert.match(layout, /<Stack\.Screen name="\(manager-flow\)\/randevu\/not" options=\{APPT_SHEET\} \/>/);
    // Elle sürülen eski kabuk gitti.
    assert.doesNotMatch(sheets, /BottomSheet/);
    assert.doesNotMatch(service + note, /visible/);
});

test('"Hizmeti değiştir": başlık + kaydırıcı, BAŞKA KARDEŞ YOK', () => {
    /*
     * react-native-screens içerik boyundaki sayfada kaydırıcıyı yalnız iki
     * düzende doğru çiziyor: tek başına ya da `collapsable={false}` başlık +
     * kaydırıcı. Üçüncü sıradaki kaydırıcı sayfanın tepesine ve tam boyuna
     * yayılıyor (Kasa fişinde görüldü).
     */
    const body = service.slice(service.indexOf('return ('));
    assert.match(body, /return \(\s*<>\s*<View collapsable=\{false\}/);
    assert.equal((body.match(/<ScrollView/g) || []).length, 1);
    // Fragment'in iki çocuğu: başlık View'u ve kaydırıcı; kaydırıcıdan sonra kapanış.
    assert.match(body, /<\/ScrollView>\s*<\/>\s*\);/);
    const top = body.slice(0, body.indexOf('<ScrollView'));
    assert.equal((top.match(/^ {12}<View/gm) || []).length, 1, 'başlıktan başka bir kardeş var');
});

test('"Notu düzenle": kaydırıcı yok, kökte flex yok', () => {
    assert.doesNotMatch(note, /ScrollView/);
    assert.match(note, /<View style=\{\{ backgroundColor: c\.bg \}\}>\s*<SheetGrab \/>/);
    assert.match(note, /multiline\s*autoFocus/);
});

test('kart sayfayı yayınlayıp itiyor; kayıt kartın kendi yolundan', () => {
    const card = code('src/components/AppointmentDetail.tsx');
    // Hızlı çift dokunuş iki sayfa itmesin.
    assert.match(card, /if \(apptSheetOpen\(\)\) return;/);
    assert.match(card, /onPick: \(choice\) => onUpdate\?\.\(applyService\(appointment, choice\)\),/);
    assert.match(card, /onSave: \(text\) => onUpdate\?\.\(applyNote\(appointment, text\)\),/);
    assert.doesNotMatch(card, /<ServiceSheet|<NoteSheet|setSheet/);
    // Rotalar önce kapanıyor, sonra kart yazıyor.
    assert.match(code('app/(manager-flow)/randevu/hizmet.tsx'), /onPick=\{\(choice\) => \{ close\(\); sheet\.onPick\(choice\); \}\}/);
    assert.match(code('app/(manager-flow)/randevu/not.tsx'), /onSave=\{\(text\) => \{ close\(\); sheet\.onSave\(text\); \}\}/);
});

test('köprü Kasa\'nınkiyle aynı sözleri tutuyor', () => {
    const bridge = code('src/state/apptSheet.ts');
    assert.match(bridge, /if \(closed\.current\) return;\s*closed\.current = true;\s*if \(router\.canGoBack\(\)\) router\.back\(\);/);
    assert.match(bridge, /if \(!sheet\) close\(\);/);
    assert.match(bridge, /useEffect\(\(\) => \(\) => \{\s*if \(current === latest\.current\) showApptSheet\(null\);\s*\}, \[\]\);/);
});
