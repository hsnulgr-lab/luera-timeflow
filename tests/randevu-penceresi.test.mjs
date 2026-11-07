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
    // Yeni çekmece (2026-11-08): durum bloğu tonu 'late' = kırmızı metin + kırmızı zemin
    assert.match(modal, /case 'missed':[\s\S]{0,120}tone: 'late'/);
    assert.match(modal, /late: \{ c: 'var\(--rd\)', b: 'var\(--rdT\)' \}/);
});

test('gelmeyen randevuda üç sonuç sorulur', () => {
    // "Ne oldu?" başlığı kalktı: üç seçenek durum bloğunun içinde (birincil + iki ikincil)
    assert.match(modal, /Gelmedi olarak kapat/);
    assert.match(modal, /Geldi, geç kaldı/);
    assert.match(modal, /Başka güne al/);
});

test('iptal tek tıkla olmaz — pencerede onay ister', () => {
    // Alt şeritteki bağlantı yalnız onayı açar
    assert.match(modal, /onClick=\{\(\) => setConfirmCancel\(true\)\}[^>]*>[\s\S]{0,80}Randevuyu iptal et/);
    // Asıl iptal onay kutusundaki düğmede
    assert.match(modal, /Bu randevu iptal edilsin mi\?[\s\S]{0,1800}onClick=\{cancelRes\}/);
});

test('takvim detay paneli takvimin sol kenarını aşmaz', () => {
    assert.match(agenda, /const minX = Math\.max\(pad, \(scrollRef\.current\?\.getBoundingClientRect\(\)\.left \?\? 0\) \+ 8\);/);
    assert.match(agenda, /else if \(hover\.rect\.left - pad - W >= minX\)/);
});

test('randevu penceresi: sağdan çekmece, sekmesiz, perde takvim çubuğunun altından (2026-11-08)', () => {
    assert.doesNotMatch(modal, /setTab\(|'adisyon' \| 'musteri'/);
    assert.match(modal, /className=\{`rcw-dw\$\{confirmCancel \? ' cfo' : ''\}`\} role="dialog" aria-modal="true"/);
    assert.match(modal, /document\.querySelector\('\[data-cal-topbar\]'\)/);
    assert.match(modal, /\[data-res-id="\$\{CSS\.escape\(r\.id\)\}"\]/);
    const cal = read('../src/pages/CalendarPage.tsx');
    assert.match(cal, /data-cal-topbar=""/);
    // Esc önce açık olanı kapatır; Enter birincili tetiklemez
    assert.match(modal, /if \(picking\) setPicking\(false\);\s*else if \(confirmCancel\) setConfirmCancel\(false\);\s*else onClose\(\);/);
    assert.match(modal, /if \(e\.key === 'Enter'\) e\.preventDefault\(\)/);
    // Hatırlatma cevabı ("Gelirim dedi") ve tercih asistanla aynı kaynaktan
    assert.match(modal, /r\.customerConfirm === 'yes'/);
    assert.match(modal, /buildCustomerCard\(visits/);
    const css = read('../src/components/reservations/randevuCekmecesi.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.rcw-hole \{[^}]*box-shadow: 0 0 0 200vmax var\(--scr\)/);
});
