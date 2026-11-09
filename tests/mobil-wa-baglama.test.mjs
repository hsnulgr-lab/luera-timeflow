/**
 * Telefon uygulaması · Müdür 37 · WhatsApp bağlama — saf katman (2026-11-10).
 *
 * mobile/src/lib/waLink.ts: sayfanın hâli, İşletme satırı, tarih, son hata
 * cümlesi, test sonucu, numara alanı, kod biçimi, sayaç, eylem hapı kelimesi.
 * Sunucunun health cevabıyla uyum: _shared/waLink.ts'in ürettiği alanlar.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clock, codeChanged, codeHalves, failureLine, formatNumberInput, healthOf, isQuietDay, pageOf,
    pairNumberOf, prefillNumber, profileRow, sinceLabel, statValues, testResultText, waOffSpec,
} from '../mobile/src/lib/waLink.ts';

const NOW = new Date(2026, 10, 10, 11, 0); // 10 Kasım 2026, 11:00 (yerel)
const l24 = { sent: 14, failed: 0, skipped: 2, inbound: 9 };

test('health cevabı: sunucunun alanları okunur; bozuk cevap null (okunamadı)', () => {
    const h = healthOf({
        status: 'connected', link: 'connected', inboundBroken: false, connectedAt: '2026-10-29T10:00:00Z',
        last24h: l24, lastFailure: { kind: 'invalid_phone', at: '2026-11-10T07:12:00Z', message: 'reminder_24h' },
        lastError: 'http_400', canManage: true,
    });
    assert.equal(h.link, 'connected');
    assert.deepEqual(h.last24h, l24);
    assert.equal(h.lastFailure.kind, 'invalid_phone');
    assert.equal(h.canManage, true);
    assert.equal(healthOf(null), null);
    assert.equal(healthOf({ error: 'server_error' }), null);
    assert.equal(healthOf({ foo: 1 }), null);
    // Eski sunucu (link yok): status'tan türetilir; canManage yoksa yönetebilir sayılır.
    assert.equal(healthOf({ status: 'connected', last24h: {} }).link, 'connected');
    assert.equal(healthOf({ status: 'disconnected' }).link, 'off');
    assert.equal(healthOf({ status: 'disconnected' }).canManage, true);
    assert.equal(healthOf({ status: 'connected', canManage: false }).canManage, false);
    assert.equal(healthOf({ link: 'off', lastFailure: { kind: 'uydurma', at: 'x' } }).lastFailure.kind, 'other');
});

test('sayfa hâli: yükleniyor / okunamadı / B / G / F2 / F3', () => {
    const base = healthOf({ link: 'connected', last24h: l24 });
    assert.equal(pageOf(undefined, false), 'loading');
    assert.equal(pageOf(null, false), 'unreadable');
    assert.equal(pageOf(base, true), 'unreadable');
    assert.equal(pageOf(base, false), 'connected');
    assert.equal(pageOf({ ...base, inboundBroken: true }, false), 'inbound');
    assert.equal(pageOf({ ...base, link: 'dropped' }, false), 'dropped');
    assert.equal(pageOf({ ...base, link: 'off' }, false), 'off');
});

test('İşletme satırı: beş hâl, beş kelime; yalnız düşünce zemin ısınır; okunamadı "bağlı değil" demez', () => {
    assert.deepEqual(profileRow('connected', '2026-10-29T10:00:00', NOW), { tone: 'ok', word: 'Bağlı', sub: "29 Ekim'den beri", warm: false });
    assert.deepEqual(profileRow('off', null, NOW), { tone: 'no', word: 'Bağlı değil', sub: 'Hatırlatmalar gitmiyor', warm: false });
    assert.deepEqual(profileRow('dropped', null, NOW), { tone: 'rd', word: 'Bağlantı düştü', sub: 'Mesajlar gitmiyor', warm: true });
    assert.deepEqual(profileRow('loading', null, NOW), { tone: 'ld', word: 'Kontrol ediliyor', sub: 'Durum soruluyor', warm: false });
    assert.deepEqual(profileRow('unreadable', null, NOW), { tone: 'un', word: 'Okunamadı', sub: 'Açınca yeniden sorulur', warm: false });
    assert.equal(profileRow('inbound', '2026-10-29T10:00:00', NOW).word, 'Bağlı');
});

test('bağlantı tarihi: ay adına göre ek, bugün, başka yıl', () => {
    assert.equal(sinceLabel('2026-10-29T10:00:00', NOW), "29 Ekim'den beri");
    assert.equal(sinceLabel('2026-03-03T10:00:00', NOW), "3 Mart'tan beri");
    assert.equal(sinceLabel('2026-04-03T10:00:00', NOW), "3 Nisan'dan beri");
    assert.equal(sinceLabel('2026-09-01T10:00:00', NOW), "1 Eylül'den beri");
    assert.equal(sinceLabel('2026-08-01T10:00:00', NOW), "1 Ağustos'tan beri");
    assert.equal(sinceLabel('2026-11-10T08:00:00', NOW), 'Bugünden beri');
    assert.equal(sinceLabel('2025-12-20T08:00:00', NOW), "20 Aralık 2025'ten beri");
    assert.equal(sinceLabel('2020-12-20T08:00:00', NOW), "20 Aralık 2020'den beri");
    assert.equal(sinceLabel('bozuk', NOW), 'Hat çalışıyor');
});

test('son 24 saat: dört sıfır → tek cümle; sıra Gönderildi, Başarısız, Atlandı, Gelen', () => {
    assert.equal(isQuietDay({ sent: 0, failed: 0, skipped: 0, inbound: 0 }), true);
    assert.equal(isQuietDay({ sent: 0, failed: 0, skipped: 0, inbound: 1 }), false);
    assert.deepEqual(statValues(l24), [14, 0, 2, 9]);
});

test('son hata: insan dili, saat, mesajın adı; ham kod yok', () => {
    const at = new Date(2026, 10, 10, 10, 12).toISOString();
    assert.deepEqual(failureLine({ kind: 'invalid_phone', at, message: 'reminder_24h' }, NOW), {
        title: 'Son hata · bugün 10:12.',
        body: 'Numarası geçersiz olduğu için bir hatırlatma gitmedi.',
    });
    const dun = new Date(2026, 10, 9, 18, 5).toISOString();
    assert.equal(failureLine({ kind: 'session', at: dun, message: 'confirmation' }, NOW).title, 'Son hata · dün 18:05.');
    assert.equal(failureLine({ kind: 'session', at: dun, message: 'confirmation' }, NOW).body, 'Bağlantı olmadığı için bir randevu onayı gitmedi.');
    assert.equal(failureLine({ kind: 'other', at, message: null }, NOW).body, 'Bir mesaj gönderilemedi.');
    for (const k of ['invalid_phone', 'not_connected', 'session', 'busy', 'network', 'other']) {
        const { body } = failureLine({ kind: k, at, message: 'cancellation' }, NOW);
        assert.doesNotMatch(body, /http|evolution|instance|webhook|_/i, k);
    }
});

test('test mesajı sonucu: kelimeler eylem hapıyla aynı', () => {
    assert.deepEqual(testResultText('ok'), { ok: true, title: 'Gönderildi.', sub: 'Telefonu kontrol edin.' });
    assert.deepEqual(testResultText('invalid_phone'), { ok: false, title: 'Gönderilemedi.', sub: 'Numara geçersiz.' });
    assert.equal(testResultText('not_connected').sub, 'Bağlantı yok.');
});

test('numara alanı: yazarken boşluk, yapıştırılan +90 sıfıra iner, profilden dolu gelir', () => {
    assert.equal(formatNumberInput('05324182790'), '0532 418 27 90');
    assert.equal(formatNumberInput('0532'), '0532');
    assert.equal(formatNumberInput('05324'), '0532 4');
    assert.equal(formatNumberInput('+90 532 418 27 90'), '0532 418 27 90');
    assert.equal(formatNumberInput('5324182790'), '532 418 27 90');
    assert.equal(formatNumberInput('0532418279099'), '0532 418 27 90', 'fazlası kesilir');
    assert.equal(prefillNumber('+90 532 418 27 90'), '0532 418 27 90');
    assert.equal(prefillNumber('0212 555 44 33'), '', 'sabit hat WhatsApp olmaz');
    assert.equal(prefillNumber(null), '');
    assert.equal(pairNumberOf('0532 418 27 90'), '905324182790');
    assert.equal(pairNumberOf('0532 418'), null);
});

test('kod: iki dörtlük blok; yarım kod çizilmez; sayaç; yeni kod fark edilir', () => {
    assert.deepEqual(codeHalves('K7RM2P4X'), ['K7RM', '2P4X']);
    assert.deepEqual(codeHalves('k7rm-2p4x'), ['K7RM', '2P4X']);
    assert.equal(codeHalves('K7RM2P'), null);
    assert.equal(codeHalves(null), null);
    assert.equal(clock(161), '2:41');
    assert.equal(clock(59.2), '1:00');
    assert.equal(clock(0), '0:00');
    assert.equal(clock(-5), '0:00');
    assert.equal(codeChanged('K7RM2P4X', 'K7RM2P4X'), false);
    assert.equal(codeChanged('K7RM2P4X', 'ABCD1234'), true);
    assert.equal(codeChanged('K7RM2P4X', null), false);
    assert.equal(codeChanged(null, 'ABCD1234'), true);
});

test('eylem hapı: artık "masaüstünden" değil, buradan bağlanır', () => {
    assert.deepEqual(waOffSpec(false), { label: 'WhatsApp bağlı değil', hint: 'buradan bağlanır' });
    assert.deepEqual(waOffSpec(true), { label: 'WhatsApp bağlantısı düştü', hint: 'buradan yeniden bağlanır' });
});

// ── Ekranlar (kaynak kilidi) ────────────────────────────────────────────────

import { readFileSync as readSrc } from 'node:fs';
const src = (p) => readSrc(new URL(`../${p}`, import.meta.url), 'utf8');
const layout = src('mobile/app/_layout.tsx');
const page = src('mobile/app/(manager-flow)/profil/whatsapp.tsx');
const modal = src('mobile/app/(manager-flow)/whatsapp-bagla.tsx');
const cut = src('mobile/app/(manager-flow)/profil/whatsapp-kes.tsx');
const profile = src('mobile/app/mudur/profile.tsx');

test('rotalar: sayfa itilir, bağlama tam ekran pencere, kesme iOS sayfası', () => {
    assert.match(layout, /<Stack\.Screen name="\(manager-flow\)\/profil\/whatsapp" \/>/);
    assert.match(layout, /<Stack\.Screen name="\(manager-flow\)\/profil\/whatsapp-kes" options=\{APPT_SHEET\} \/>/);
    assert.match(layout, /<Stack\.Screen name="\(manager-flow\)\/whatsapp-bagla" options=\{\{ presentation: 'fullScreenModal', gestureEnabled: false \}\} \/>/);
});

test('A1: WhatsApp satırı Hizmetler\'in hemen altında, ilk grubun sonu; düşünce zemin ısınır', () => {
    const hizmet = profile.indexOf('title="Hizmetler ve fiyatlar"');
    const wa = profile.indexOf('title="WhatsApp"');
    const grupSonu = profile.indexOf('</Group>', hizmet);
    assert.ok(hizmet > 0 && wa > hizmet && wa < grupSonu, 'satır yerinde değil');
    assert.match(profile, /warm=\{waRow\.warm\}/);
    assert.match(profile, /right=\{<StatusWord tone=\{waRow\.tone\} word=\{waRow\.word\} \/>\}/);
    assert.match(profile, /fetchWaHealth\(true\)/);
});

test('sayfa: odakta canlı durum; okunamayan "bağlı değil" değil; personel salt okur', () => {
    assert.match(page, /useFocusEffect\(load\)/);
    assert.match(page, /fetchWaHealth\(true\)/);
    assert.match(page, /page === 'unreadable' \? <Unreadable/);
    assert.match(page, /Bağlantıyı işletme sahibi kurar\./);
    assert.match(page, /canManage \? <Foot bottom=\{bottom\}><WaButton label="WhatsApp'ı bağla"/);
    // Numara hiçbir yerde yok: bağlı sayfası tarih yazar.
    assert.match(page, /sinceLabel\(health\.connectedAt, now\)/);
});

test('pencere: durum 3 sn\'de bir; kod/QR yoklamayla tazelenir; WhatsApp\'tan dönünce D3', () => {
    assert.match(modal, /setInterval\(\(\) => \{ void tick\(\); \}, POLL_MS\)/);
    assert.match(modal, /codeChanged\(code, p\.code\)/);
    assert.match(modal, /AppState\.addEventListener\('change', \(s\) => \{ if \(s === 'active'\) setWaiting\(true\); \}\)/);
    assert.match(modal, /Clipboard\.setStringAsync\(code\)/);
    assert.match(modal, /Linking\.openURL\('whatsapp:\/\/'\)/);
    // QR okutulurken ekran kararmaz; "Ekranı aydınlat" ilk turda YOK (parlaklık modülü yok).
    assert.match(modal, /useKeepAwake\(\)/);
    assert.doesNotMatch(modal, /Ekranı aydınlat|expo-brightness/);
});

test('hareket: adım 300 ms (.2,.8,.25,1); hareketi azalt açıkken süreler 0', () => {
    assert.match(modal, /duration: 300, easing: Easing\.bezier\(0\.2, 0\.8, 0\.25, 1\)/);
    assert.match(modal, /if \(reduceMotion\) \{ enter\.setValue\(1\); return; \}/);
    const parts = src('mobile/src/components/WaLinkParts.tsx');
    assert.match(parts, /Animated\.stagger\(24, cells\.map/);
    assert.match(parts, /duration: 180/);
    assert.match(parts, /duration: 240, easing: Easing\.out\(Easing\.quad\)/);
    // Yalnız opaklık, kaydırma, ölçek — native sürücü.
    for (const f of [modal, parts, page]) assert.doesNotMatch(f, /useNativeDriver: false/);
});

test('kesme: Vazgeç dolu ve üstte, Bağlantıyı kes kırmızı çerçeveli ve altta', () => {
    assert.ok(cut.indexOf('label="Vazgeç" variant="nt"') < cut.indexOf('label="Bağlantıyı kes" variant="rd"'));
    assert.match(cut, /Bağlantı kesilince hatırlatmalar ve mesajlar gitmez\./);
});

test('onay ekranı: içerik düğme kutusuna değecekse küçük ölçülere geçer (kart örtülmez)', () => {
    const confirm = src('mobile/src/components/ConfirmScreen.tsx');
    assert.match(confirm, /const short = small \|\| height < M\.shortHeight \|\| crowded;/);
    assert.match(confirm, /const dockTop = f\.root - bottomInset - M\.dockLift - f\.dock;/);
    assert.match(confirm, /if \(topInset \+ f\.cardBottom > dockTop - M\.dockGap\) setCrowdedIn\(state\);/);
    // Hâle bağlı: sonraki hâl (Mesaj gönderildi) yeniden ölçülür, önizleme kesilmez.
    assert.match(confirm, /const crowded = crowdedIn === state;/);
    // Üç ölçüm de gerçek yerleşimden: kök, kart, kutu.
    assert.equal((confirm.match(/checkFit\(\); \}/g) ?? []).length + (confirm.match(/checkFit\(\);\n/g) ?? []).length >= 3, true);
});
