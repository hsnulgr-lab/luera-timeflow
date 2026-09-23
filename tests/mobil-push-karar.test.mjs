import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { pushHrefOf, reservationIdOf } from '../mobile/src/lib/pushRoute.ts';
import { INTENT_TTL_MS, forgetIntent, peekIntent, rememberIntent, takeIntent } from '../mobile/src/lib/pushIntent.ts';
import { isLive, opensSettings, permissionText, shouldAsk, stateOf } from '../mobile/src/lib/pushPermission.ts';
import { REGISTER_REFRESH_MS, shouldRegister, shouldUnregister } from '../mobile/src/lib/pushRegistration.ts';

/**
 * BİLDİRİMİN KARARLARI (103) — 2026-09-23.
 *
 * Dört saf dosya: hedef eşlemesi, niyet, izin hâli, kayıt kararı. Hepsi
 * React'siz ve Expo'suz, çünkü bu kararlar GERÇEKTEN ÇAĞRILARAK sınanmalı —
 * kaynak metnine bakan bir test, yanlış bir eşlemeyi yakalayamaz.
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
/** Yorumlar sıyrılıyor: bir yorumda geçen paket adı testi kırmasın. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('saf dosyalar gerçekten saf', () => {
    // React ya da Expo içe aktarılsaydı bu dosyanın tamamı çalıştırılamazdı.
    for (const path of ['pushRoute.ts', 'pushIntent.ts', 'pushPermission.ts', 'pushRegistration.ts']) {
        const src = code(read(`src/lib/${path}`));
        assert.doesNotMatch(src, /from 'react|from "react|react-native|expo-/, path);
    }
});

// ── Hedef eşlemesi ──────────────────────────────────────────────────────────

test('aynı adres iki rolde İKİ AYRI ekran', () => {
    assert.equal(pushHrefOf('/calendar', 'staff'), '/personel/calendar');
    assert.equal(pushHrefOf('/calendar', 'manager'), '/mudur/calendar');
});

test('/personel HİÇBİR koşulda /personel/[id]\'ye düşmüyor', () => {
    /*
     * `/personel` personelin sekmesi, `/personel/<uuid>` MÜDÜRÜN personel-günü
     * ekranı. Sunucudan gelen dizge bir rotayla birleştirilseydi, personele
     * giden bir bildirim müdüre ait bir ekranı açabilirdi.
     */
    assert.equal(pushHrefOf('/personel', 'staff'), '/personel');
    assert.equal(pushHrefOf('/personel/abc', 'staff'), null);
    assert.equal(pushHrefOf('/personel', 'manager'), null);
});

test('mobil karşılığı olmayan masaüstü rotaları null', () => {
    // `notifyOwner` bunları yazıyor; mobilde mesajlar ve faturalama ekranı YOK.
    for (const url of ['/mesajlar', '/settings?tab=billing', '/masa', '/musteriler']) {
        assert.equal(pushHrefOf(url, 'manager'), null, url);
    }
});

test('tanınmayan hedef null — tahmin edilmiş adrese gidilmiyor', () => {
    for (const url of ['', '/', 'calendar', null, undefined, '../etc', '//evil.example']) {
        assert.equal(pushHrefOf(url, 'staff'), null, String(url));
    }
});

test('tarih TAŞINMIYOR, doğrulanıp yeniden kuruluyor', () => {
    assert.equal(pushHrefOf('/takvim?date=2026-09-23', 'manager'), '/mudur/calendar?date=2026-09-23');
    // Biçimi tutmayan tarih düşer; hedef yine açılır.
    assert.equal(pushHrefOf('/takvim?date=dün', 'manager'), '/mudur/calendar');
    assert.equal(pushHrefOf('/takvim?date=2026-09-23&x=<script>', 'manager'), '/mudur/calendar?date=2026-09-23');
});

test('randevu kimliği etiketten çıkıyor — sunucu değişmeden', () => {
    const id = '0f9b7c52-1a2b-4c3d-9e8f-112233445566';
    assert.equal(reservationIdOf(`assign-${id}`), id);
    assert.equal(reservationIdOf(`moved-${id}`), id);
    assert.equal(reservationIdOf('soon-42'), null);
    assert.equal(reservationIdOf(null), null);
});

// ── Niyet ───────────────────────────────────────────────────────────────────

test('niyet oturum hazır olana kadar bekliyor ve BİR KEZ tüketiliyor', () => {
    forgetIntent();
    rememberIntent({ href: '/personel', actor: 'staff', at: 1000 });
    assert.equal(peekIntent()?.href, '/personel', 'dokunma anında gidilmiyor, saklanıyor');
    assert.equal(takeIntent('staff', 1500), '/personel');
    // Yeniden çizim ikinci kez gezinmemeli.
    assert.equal(takeIntent('staff', 1500), null);
});

test('rol uyuşmazlığı niyeti DÜŞÜRÜYOR', () => {
    forgetIntent();
    rememberIntent({ href: '/personel', actor: 'staff', at: 1000 });
    assert.equal(takeIntent('manager', 1100), null);
    assert.equal(peekIntent(), null, 'düşen niyet müdür kabuğunda bekleyip durmaz');
});

test('bayat niyet düşüyor — on dakika sonra ışınlanmak istemiyoruz', () => {
    forgetIntent();
    rememberIntent({ href: '/personel', actor: 'staff', at: 0 });
    assert.equal(takeIntent('staff', INTENT_TTL_MS + 1), null);
    forgetIntent();
    rememberIntent({ href: '/personel', actor: 'staff', at: 0 });
    assert.equal(takeIntent('staff', INTENT_TTL_MS - 1), '/personel');
});

test('çıkış bekleyen hedefi siliyor', () => {
    rememberIntent({ href: '/personel', actor: 'staff', at: 0 });
    forgetIntent();
    assert.equal(peekIntent(), null);
});

// ── İzin hâli ───────────────────────────────────────────────────────────────

test('altı hâl ayrı; OKUNAMADI hiçbir yolda KAPALI\'ya inmiyor', () => {
    const base = { isDevice: true, hasProjectId: true };
    assert.equal(stateOf({ ...base, status: 'granted' }), 'granted');
    assert.equal(stateOf({ ...base, status: 'denied' }), 'denied');
    assert.equal(stateOf({ ...base, status: 'undetermined' }), 'undetermined');
    // Bir daha sorulamıyorsa "henüz sorulmadı" demek yanlış olurdu.
    assert.equal(stateOf({ ...base, status: 'undetermined', canAskAgain: false }), 'denied');
    assert.equal(stateOf({ ...base, isDevice: false, status: 'granted' }), 'unsupported');
    // İzin var ama projectId yok: jeton üretilemiyor — bizim kurulum hatamız.
    assert.equal(stateOf({ ...base, status: 'granted', hasProjectId: false }), 'missing');
    // Beklenmeyen bir cevap 'denied' değil, 'error'.
    assert.equal(stateOf({ ...base, status: 'bilinmeyen' }), 'error');
});

test('yalnız gerçekten çalışan hâl "açık" diyebiliyor', () => {
    assert.equal(isLive('granted'), true);
    for (const state of ['undetermined', 'denied', 'missing', 'error', 'unsupported']) {
        assert.equal(isLive(state), false, state);
    }
    // Tek OS diyaloğu yalnız sorulmamışken harcanıyor.
    assert.equal(shouldAsk('undetermined'), true);
    assert.equal(shouldAsk('denied'), false);
    // Ayarlara göndermenin işe yaradığı tek hâl.
    assert.equal(opensSettings('denied'), true);
    assert.equal(opensSettings('error'), false);
});

test('metinler bizim durumumuz hakkında İDDİA içermiyor', () => {
    // "Kapalı" yalnız gerçekten kapalıyken yazılıyor.
    assert.doesNotMatch(permissionText('error'), /kapalı|açık/i);
    assert.match(permissionText('error'), /okunamadı/i);
    assert.match(permissionText('denied'), /ayarlar/i);
    assert.match(permissionText('granted'), /açık/i);
    assert.doesNotMatch(permissionText('missing'), /açık/i);
});

// ── Kayıt kararı ────────────────────────────────────────────────────────────

const REG = {
    granted: true, token: 'ExponentPushToken[a]', staffId: 's1',
    lastToken: 'ExponentPushToken[a]', lastStaffId: 's1', lastAt: 0, now: 1000,
};

test('değişmediyse yeniden yazılmıyor', () => {
    assert.equal(shouldRegister(REG), false);
});

test('PERSONEL değişince yeniden yazılıyor — ortak telefonun kuralı', () => {
    /*
     * A çıkıp B girdiğinde satır B'ye dönmezse, A'nın bildirimleri B'nin
     * elinde çalar. Ortak tablet salonlarda olağan.
     */
    assert.equal(shouldRegister({ ...REG, staffId: 's2' }), true);
});

test('jeton dönünce yeniden yazılıyor', () => {
    assert.equal(shouldRegister({ ...REG, token: 'ExponentPushToken[b]' }), true);
});

test('bayat kayıt tazeleniyor', () => {
    assert.equal(shouldRegister({ ...REG, now: REGISTER_REFRESH_MS }), true);
    assert.equal(shouldRegister({ ...REG, now: REGISTER_REFRESH_MS - 1 }), false);
});

test('izin yokken jeton İSTENMİYOR', () => {
    assert.equal(shouldRegister({ ...REG, granted: false, staffId: 's2' }), false);
    assert.equal(shouldRegister({ ...REG, token: null, staffId: 's2' }), false);
    // Personel bilinmiyorsa kimin adına yazılacağı da bilinmiyor.
    assert.equal(shouldRegister({ ...REG, staffId: null }), false);
});

test('izin geri alınınca satır koparılıyor', () => {
    // FCM her zaman DeviceNotRegistered döndürmüyor; beklemek yerine biz bakıyoruz.
    assert.equal(shouldUnregister({ granted: false, lastToken: 'ExponentPushToken[a]' }), true);
    assert.equal(shouldUnregister({ granted: true, lastToken: 'ExponentPushToken[a]' }), false);
    assert.equal(shouldUnregister({ granted: false, lastToken: null }), false);
});
