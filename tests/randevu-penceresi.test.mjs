// Randevu penceresi (AdisyonModal · Özet) — 2026-10-24.
// Kullanıcı iptal etmek isterken pencereyi anlaşılmaz buldu: "Gelmedi" yeşil
// yazıyordu, gelmeyen randevuda tek büyük seçenek "Geç Geldi"ydi, iptal tek
// tıkla oluyordu. Yeni yapı: renkli durum satırı → "Ne oldu?" → üç sonuç;
// iptal en altta ve pencerede onaylı. Masaüstü "Gelmedi" damgasını da yazar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const modal = read('../src/components/reservations/AdisyonModal.tsx');
const hook = read('../src/hooks/useReservations.ts');
const agenda = read('../src/components/reservations/DayAgendaGrid.tsx');

test('masaüstü "Gelmedi" damgasını yazar ve temizler (098)', () => {
    assert.match(hook, /if \(updates\.noShowAt !== undefined\) dbUpdates\.no_show_at = updates\.noShowAt \?\? null;/);
    assert.match(modal, /const markNoShow = async \(\) => \{\s*const updated = await updateReservation\(r\.id, \{ noShowAt: new Date\(\)\.toISOString\(\) \}\);/);
    // Yanlış basılırsa geri alınır
    assert.match(modal, /updateReservation\(r\.id, \{ noShowAt: null \}\)/);
});

test('"Geç geldi" gelmedi damgasını da kaldırır', () => {
    assert.match(modal, /customerArrivedAt: new Date\(\)\.toISOString\(\), \.\.\.\(r\.noShowAt \? \{ noShowAt: null \} : \{\}\)/);
});

test('"Gelmedi" kırmızı yazılır — varsayılan yeşile düşmez', () => {
    assert.match(modal, /case 'missed':[\s\S]{0,260}color: 'var\(--dc-red\)'/);
});

test('gelmeyen randevuda üç sonuç sorulur', () => {
    assert.match(modal, /Ne oldu\?/);
    assert.match(modal, /Gelmedi olarak kapat/);
    assert.match(modal, /Geldi, geç kaldı/);
    assert.match(modal, /Başka güne al/);
});

test('iptal tek tıkla olmaz — pencerede onay ister', () => {
    // Alt şeritteki bağlantı yalnız onayı açar
    assert.match(modal, /onClick=\{\(\) => setConfirmCancel\(true\)\}[^>]*>[\s\S]{0,80}Randevuyu iptal et/);
    // Asıl iptal onay kutusundaki düğmede
    assert.match(modal, /Bu randevu iptal edilsin mi\?[\s\S]{0,1200}onClick=\{cancelRes\}/);
});

test('takvim detay paneli takvimin sol kenarını aşmaz', () => {
    assert.match(agenda, /const minX = Math\.max\(pad, \(scrollRef\.current\?\.getBoundingClientRect\(\)\.left \?\? 0\) \+ 8\);/);
    assert.match(agenda, /else if \(hover\.rect\.left - pad - W >= minX\)/);
});
