import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COUNTDOWN_MS, HALF_MS, MESSAGING_PENDING_REASON, MESSAGING_READY,
    NO_PHONE_REASON, SALON_NAME, SENT_COUNTDOWN_MS, confirmCopy, confirmSpeech,
    countdownFor, countdownRuns, coverAngles, durationText, messageText,
    phoneText, priceText, rangeText, secondsLeft, sendGate, stillBookedLine,
} from '../mobile/src/lib/apptConfirm.ts';

// Müdür 16 — randevu oluşturuldu onayı.
//
// Bu dosyanın koruduğu şey: halkanın DÖNÜŞÜMLE tüketilmesi (dashoffset yok),
// sayacın yalnız doğru hâllerde işlemesi, ve hiçbir yerde gönderilmemiş bir
// mesajın "gönderildi" diye gösterilmemesi.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const screen = code('src/components/ConfirmScreen.tsx');
const flow = code('src/components/CreateFlow.tsx');
const tokens = code('src/theme/tokens.ts');
const route = code('app/(manager-flow)/randevu-olustur.tsx');
const design = readFileSync(
    new URL('../docs/design-reference/Luera Mobil - Mudur 16 Randevu Onayi.html', import.meta.url),
    'utf8',
);

const appt = (over = {}) => ({
    id: 'local-1', customer_id: null, customer_name: 'Zeynep Kaya',
    customer_phone: '+905321110302', date: '2026-08-14',
    start_time: '11:00:00', end_time: '12:15:00', service: 'Kesim + fön',
    service_color: '#C08457', status: 'confirmed', staff_id: 'merve',
    notes: null, arrived_at: null, service_ended_at: null, ...over,
});

// ── Geri sayım ──────────────────────────────────────────────────────────────

test('sayım 7 saniye, iki kapak 3,5 saniye', () => {
    assert.equal(COUNTDOWN_MS, 7000);
    assert.equal(HALF_MS, 3500);
    assert.equal(SENT_COUNTDOWN_MS, 3500);
    assert.equal(countdownFor('idle'), 7000);
    assert.equal(countdownFor('sent'), 3500);
});

test('halka DÖNÜŞÜMLE tüketilir: iki kapak, sırayla', () => {
    // Başta sağ kapak dışarıda (-180), sol kapak yerinde (0).
    assert.deepEqual(coverAngles(0), { right: -180, left: 0 });
    // Yarıda sağ kapak sağ yarıyı tamamen örtmüş, sol henüz başlamamış.
    assert.deepEqual(coverAngles(3500), { right: 0, left: 0 });
    // Sonda ikisi de tam.
    assert.deepEqual(coverAngles(7000), { right: 0, left: 180 });
    // Ara değerler doğrusal.
    assert.deepEqual(coverAngles(1750), { right: -90, left: 0 });
    assert.deepEqual(coverAngles(5250), { right: 0, left: 90 });
    // Sınırların dışına taşmaz.
    assert.deepEqual(coverAngles(99999), { right: 0, left: 180 });
});

test('kalan saniye yalnız yukarı yuvarlanır', () => {
    assert.equal(secondsLeft(0), 7);
    assert.equal(secondsLeft(1), 7);
    assert.equal(secondsLeft(6100), 1);
    assert.equal(secondsLeft(7000), 0);
});

test('sayaç yalnız doğru hâllerde işler', () => {
    const base = { screenReader: false, foreground: true };
    assert.ok(countdownRuns({ ...base, state: 'idle' }));
    assert.ok(countdownRuns({ ...base, state: 'sent' }));
    // Müdür bir şey yaptı: ekran onu aceleye getirmez.
    assert.ok(!countdownRuns({ ...base, state: 'sending' }));
    // Hata kendi kendine kaybolmaz.
    assert.ok(!countdownRuns({ ...base, state: 'failed' }));
    // Ekran okuyucu açıkken TAMAMEN durur: 7 sn de 15 sn de bir tahmindi.
    assert.ok(!countdownRuns({ ...base, state: 'idle', screenReader: true }));
    // Arka planda sayaç yürümez.
    assert.ok(!countdownRuns({ ...base, state: 'idle', foreground: false }));
});

// ── Dürüstlük ───────────────────────────────────────────────────────────────

test('gönderilmemiş mesaj "gönderildi" diye gösterilmiyor', () => {
    // Mobilde müdür API'si yok: buton pasif ve SEBEBİNİ söylüyor.
    assert.equal(MESSAGING_READY, false);
    assert.deepEqual(sendGate('idle', true), {
        enabled: false, reason: MESSAGING_PENDING_REASON,
    });
    // Numara yoksa sebep numaradır — uç sebebi onun yerine geçmez.
    assert.deepEqual(sendGate('idle', false), { enabled: false, reason: NO_PHONE_REASON });
    // Hata hâlinde "tekrar dene" her zaman basılabilir.
    assert.deepEqual(sendGate('failed', true), { enabled: true, reason: null });
    // Gönderilirken buton kilitli ama sebep satırı yok.
    assert.deepEqual(sendGate('sending', true), { enabled: false, reason: null });
});

test('ekran uydurma bir başarı mesajı üretmiyor', () => {
    assert.ok(!/başarıyla/i.test(screen));
    // "Mesaj gönderildi" yalnız 'sent' hâlinin metni; kütüphaneden geliyor.
    assert.ok(!screen.includes("'Mesaj gönderildi'"));
});

// ── Metinler ────────────────────────────────────────────────────────────────

test('her hâlin kendi cümlesi var', () => {
    assert.equal(confirmCopy('idle', true).title, 'Randevu oluşturuldu');
    assert.equal(confirmCopy('idle', true).primary, 'Randevu mesajı gönder');
    assert.match(confirmCopy('idle', true).note, /Beklemezseniz de olur/);
    // Numarasızda "beklemezseniz de olur" demenin anlamı yok: gönderilecek
    // bir şey yok, not kısalıyor.
    assert.match(confirmCopy('idle', false).note, /Sayım bitince/);

    assert.equal(confirmCopy('sending', true).subtitle, 'Sayım durdu — mesaj gönderiliyor.');
    assert.equal(confirmCopy('sent', true).title, 'Mesaj gönderildi');
    assert.equal(confirmCopy('sent', true).primary, 'Bitti');
    // D hâlinde turuncu buton kalkar: yapılacak eylem kalmadı.
    assert.equal(confirmCopy('sent', true).secondary, '');

    assert.equal(confirmCopy('failed', true).title, 'Mesaj gönderilemedi');
    assert.match(confirmCopy('failed', true).note, /kendi kapanmaz/);
});

test('hatada ilk söylenen şey randevunun DURDUĞU', () => {
    const line = stillBookedLine(appt(), 'Merve');
    assert.match(line, /14 Ağustos/);
    assert.match(line, /11:00 – 12:15/);
    assert.match(line, /Merve/);
    // Müdürün ilk korkusu randevunun da gitmesi; cümle onu keser.
    assert.match(confirmSpeech({ state: 'failed', appointment: appt(), staffName: 'Merve', hasPhone: true }), /Randevu duruyor/);
});

test('kartın bantları randevunun kendisinden çıkar', () => {
    assert.equal(rangeText(appt()), '11:00 – 12:15');
    assert.equal(durationText(appt()), '75 dk');
    assert.equal(priceText(1000), '₺1.000');
    assert.equal(priceText(null), null);
});

test('telefon maskeli; yoksa boşluk değil, kelime', () => {
    assert.deepEqual(phoneText(appt()), { text: '0532 ••• 03 02', missing: false });
    // Boşluk "yüklenmedi mi?" sorusu doğurur.
    assert.deepEqual(phoneText(appt({ customer_phone: null })), { text: 'numara yok', missing: true });
});

test('müşteriye gidecek metin ekranda görünür ve doğrudur', () => {
    const text = messageText(appt(), 'Merve', SALON_NAME);
    assert.match(text, /14 Ağustos/);
    assert.match(text, /11:00/);
    assert.match(text, /Kesim \+ fön/);
    assert.match(text, /Merve/);
    assert.match(text, /Luera Kuaför/);
});

test('sesli okuma her hâli BİR KEZ duyurur, sayımı hiç okumaz', () => {
    const speech = confirmSpeech({ state: 'idle', appointment: appt(), staffName: 'Merve', hasPhone: true });
    assert.match(speech, /Randevu oluşturuldu/);
    assert.match(speech, /11:00'dan 12:15'e/);
    assert.match(speech, /Merve yapacak/);
    assert.ok(!/saniye/.test(speech), 'geri sayım okunmamalı');

    // Numara yoksa sebep cümlede geçer — renkle değil kelimeyle.
    assert.match(
        confirmSpeech({ state: 'idle', appointment: appt({ customer_phone: null }), staffName: 'Merve', hasPhone: false }),
        /numarası kayıtlı değil/,
    );
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('halka stroke-dashoffset ile DEĞİL, rotate ile tüketiliyor', () => {
    // react-native-svg'de dashoffset native sürücüde animasyonlanmıyor.
    assert.ok(!/strokeDashoffset|strokeDasharray/.test(screen));
    assert.ok(screen.includes("transformOrigin: 'left center'"));
    assert.ok(screen.includes("outputRange: ['-180deg', '180deg']"));
});

test('yalnız opaklık ve dönüşüm animasyonlanıyor', () => {
    // Yükseklik, renk, yarıçap ve gölge animasyonlanmaz.
    for (const banned of ['height:', 'backgroundColor:', 'borderRadius:']) {
        const pattern = new RegExp(`Animated\\.timing\\([^)]*${banned}`);
        assert.ok(!pattern.test(screen), `animasyonlanmamalı: ${banned}`);
    }
    // Her Animated.timing native sürücüde.
    const timings = screen.match(/Animated\.timing\(/g) ?? [];
    const native = screen.match(/useNativeDriver: true/g) ?? [];
    assert.ok(native.length >= timings.length, 'her animasyon native sürücüde olmalı');
});

test('hareketi azalt: hiçbir şey ölçeklenmez, kaymaz, dönmez', () => {
    assert.ok(screen.includes('reduceMotion ? [] :'), 'dönüşümler kurulmamalı');
    assert.ok(screen.includes('enterReduced'));
    // Halka dönmediği için kalan süre YAZIYLA gösterilir.
    assert.ok(screen.includes('secondsLeft('));
    assert.match(tokens, /enterReduced:\s*160/);
});

test('ekranın TEK cam yüzeyi kontrol bloğu', () => {
    // Kart, tik ve şeritler asla cam değil: tek bir <Glass> var.
    assert.equal((screen.match(/<Glass\b/g) ?? []).length, 1);
    assert.equal((screen.match(/<\/Glass>/g) ?? []).length, 1);
    // Blur taklidi de yok.
    assert.ok(!/BlurView|blurRadius/.test(screen));
});

test('turuncu envanteri: yalnız halka (zaman) ve birincil buton (eylem)', () => {
    const oranges = screen.match(/c\.or\b/g) ?? [];
    assert.equal(oranges.length, 2, 'turuncu iki yerde olmalı');
    // Tik yeşil: sonuç turuncuyla anlatılmaz.
    assert.ok(screen.includes('color={c.gr}'));
});

test('ölçüler tasarımın CSS dosyasından', () => {
    assert.match(tokens, /ring:\s*116/);
    assert.match(tokens, /tickInset:\s*19/);
    assert.match(tokens, /whenRange:\s*32/);
    assert.match(tokens, /primaryHeight:\s*66/);
    assert.match(tokens, /secondaryHeight:\s*52/);
    assert.match(tokens, /dockLift:\s*12/);
    // Belgeyle karşılaştır.
    assert.match(design, /\.cf-ring\{--w:116px/);
    assert.match(design, /\.cf-tick\{position:absolute;inset:19px/);
    assert.match(design, /\.cf-primary\{[^}]*height:66px/);
});

test('onay akışın son karesi; sonra Akış', () => {
    assert.ok(flow.includes('ConfirmScreen'));
    // Randevu kurulunca ekran kapanmıyor, onay devralıyor.
    assert.ok(flow.includes('setCreated(appointment)'));
    assert.ok(!flow.includes("onClose({ dateISO"));
    // Kapanışta Akış'a.
    assert.ok(route.includes("'/(manager)'"));
});

test('sayaç arka planda durur, ekran kendi kapanmaz', () => {
    assert.ok(screen.includes('AppState.addEventListener'));
    assert.ok(screen.includes('foreground'));
});

test('tasarım belgesi projede duruyor', () => {
    assert.ok(design.includes('Randevu oluşturuldu'));
    assert.ok(design.includes('Hareket şartnamesi'));
});
