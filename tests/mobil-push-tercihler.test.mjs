import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NOTIFICATIONS, notificationsSummary } from '../mobile/src/lib/managerProfile.ts';
import { PREF_DEFAULT, allOff, prefsOf, prefsPatchOf } from '../mobile/src/lib/notificationPrefs.ts';

/**
 * MÜDÜR BİLDİRİMLERİ VE TERCİHLER (105/106) — 2026-09-23.
 *
 * `046` "yöneticiye push GÖNDERİLMEZ" demişti ve o gün haklıydı: yönetici
 * demek masaüstü tarayıcı demekti ve orası zaten uygulama-içi realtime ile
 * haberdar oluyordu. Artık müdürün native uygulaması var ve kapalıyken
 * hiçbir şey duymuyor.
 *
 * Bu dosyanın koruduğu iki şey:
 *   • YOKLUK "KAPALI" DEMEK DEĞİL — tercih okunamazsa gönderilir.
 *   • KARŞILIĞI OLMAYAN ANAHTAR ÇİZİLMEZ.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sendPush = read('supabase/functions/send-push/index.ts');
const subscribe = read('supabase/functions/push-subscribe/index.ts');
const sql105 = read('supabase/105_bildirim_tercihleri.sql');
const sql106 = read('supabase/106_mudur_push_geri.sql');
const KEYS = NOTIFICATIONS.map((item) => item.key);

// ── Saf katman ──────────────────────────────────────────────────────────────

test('saf dosya gerçekten saf', () => {
    const pure = code(read('mobile/src/lib/notificationPrefs.ts'));
    assert.doesNotMatch(pure, /from 'react|react-native|expo-|supabase/);
});

test('EKSİK ANAHTAR AÇIK demek — yokluk "kapalı" değil', () => {
    /*
     * Sunucunun fail-open kuralıyla AYNI olmak zorunda. Ekran "kapalı" derken
     * sunucu gönderirse, ikisinden biri yalan söylüyor demektir ve kullanıcı
     * hangisine inanacağını bilemez.
     */
    assert.equal(PREF_DEFAULT, true);
    assert.deepEqual(prefsOf({}, KEYS), { booked: true, cancelled: true, cash: true });
    assert.deepEqual(prefsOf(null, KEYS), { booked: true, cancelled: true, cash: true });
    assert.deepEqual(prefsOf('bozuk', KEYS), { booked: true, cancelled: true, cash: true });
    // Boolean olmayan değer de "yazılmamış" sayılıyor.
    assert.deepEqual(prefsOf({ booked: 'evet' }, KEYS), { booked: true, cancelled: true, cash: true });
});

test('yalnız açıkça FALSE yazılmış anahtar kapalı', () => {
    assert.deepEqual(prefsOf({ cancelled: false }, KEYS), { booked: true, cancelled: false, cash: true });
});

test('yazarken BİLİNMEYEN anahtarlar korunuyor', () => {
    /*
     * Gövdeyi sıfırdan kurmak, ileride eklenen (ya da masaüstünün yazdığı) bir
     * anahtarı sessizce silmek olurdu — çalışma saatlerinde tam bunu yaşadık.
     */
    const patched = prefsPatchOf({ booked: false, gelecek: 'değer' }, 'cash', false);
    assert.equal(patched.gelecek, 'değer');
    assert.equal(patched.booked, false);
    assert.equal(patched.cash, false);
    // Ham değer bozuksa da yazma çalışıyor.
    assert.deepEqual(prefsPatchOf(null, 'booked', true), { booked: true });
});

test('üçü de kapalıysa ayrı bir ana anahtara gerek yok', () => {
    assert.equal(allOff({ booked: false, cancelled: false, cash: false }, KEYS), true);
    assert.equal(allOff({ booked: false, cancelled: true, cash: false }, KEYS), false);
    assert.equal(notificationsSummary({ booked: false, cancelled: false, cash: false }), 'Kapalı');
});

// ── Liste gerçeğe uyuyor ────────────────────────────────────────────────────

test('KARŞILIĞI OLMAYAN ANAHTAR YOK', () => {
    /*
     * `noshow` telefonda saatten hesaplanıyor — gönderilecek bir AN yok.
     * `daily` dış zamanlayıcı istiyor; projede `pg_cron` yok. İkisi de
     * listeden çıktı: açıldığında hiçbir şey olmayan bir anahtar, ekranın
     * söyleyebileceği en sessiz yalan.
     */
    assert.deepEqual(KEYS, ['booked', 'cancelled', 'cash']);
    const screen = code(read('mobile/app/(manager-flow)/profil/bildirimler.tsx'));
    assert.doesNotMatch(screen, /noshow|daily/);
});

test('ekrandaki her anahtarın sunucuda bir olayı var', () => {
    // Çapraz doğrulama: liste ile tetikleyici ayrışırsa anahtar ölü kalır.
    for (const key of KEYS) {
        assert.match(sql106, new RegExp(`'pref',\\s+'${key}'`), `${key} olayı yok`);
    }
    // Ve tersi: tetikleyicide listede olmayan bir anahtar yok.
    const used = [...sql106.matchAll(/'pref',\s+'(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(used)].sort(), [...KEYS].sort());
});

// ── Sunucudaki kapı ─────────────────────────────────────────────────────────

test('süzgeç SEND-PUSH içinde, tetikleyicide değil', () => {
    /*
     * Trigger'da olsaydı "org sahibinin ayar satırı hangisi" mantığını
     * PL/pgSQL'de ikinci kez yazmak gerekirdi ve her yeni olay onu tekrar
     * yazardı.
     */
    assert.match(sendPush, /if \(typeof pref === 'string' && pref\)/);
    assert.match(sendPush, /return json\(\{ sent: 0, note: 'pref_off' \}, 200\);/);
    assert.doesNotMatch(sql106, /notification_prefs/);
});

test('FAIL-OPEN — tercih okunamazsa GÖNDERİLİYOR', () => {
    /*
     * Bu dosyanın en önemli iddiası. Ters kurgu ("okunamadıysa gönderme")
     * daha tutumlu görünür ama bir ağ ya da şema boşluğu bütün salonu
     * sessize alırdı ve kimse fark etmezdi.
     */
    assert.match(sendPush, /if \(prefs && prefs\[pref\] === false\)/,
        'yalnız AÇIKÇA false olan anahtar susturuyor');
    const fn = sendPush.slice(sendPush.indexOf('async function readOrgPrefs'));
    assert.match(fn, /catch[\s\S]{0,200}return null;/, 'okunamadı → null → gönder');
});

test('tercih SAHİBİN satırından okunuyor — üç okuyucu aynı satır', () => {
    // Üç yerde üç farklı satır okunsaydı müdürün kapattığı bir anahtar
    // sunucuda açık kalırdı.
    const fn = sendPush.slice(sendPush.indexOf('async function readOrgPrefs'));
    assert.match(fn, /\.select\('owner_id'\)/);
    assert.match(fn, /\.eq\('user_id', ownerId\)/);
    assert.match(fn, /\.order\('created_at', \{ ascending: true \}\)/, 'sahipsizse en eskiye düşülüyor');
});

test('PERSONEL kanalı hiç etkilenmiyor', () => {
    /*
     * Personel olayları `pref` taşımıyor → kapı onlarda hiç çalışmıyor.
     * Personelin dört olayı kendi randevusuyla ilgili ve hepsi iş; seçmeli
     * kapatmak personeli kendi gününe karşı körleştirirdi.
     */
    const staffEvents = sql106.split('PERSONEL OLAYLARI')[1];
    assert.ok(staffEvents, 'personel bölümü bulunamadı');
    assert.doesNotMatch(staffEvents, /'pref'/);
    for (const tag of ['assign-', 'arrived-', 'cancel-', 'moved-']) {
        assert.match(staffEvents, new RegExp(`'${tag}'`), tag);
    }
});

test('müdür olayları da YALNIZ İLK ADI yazıyor', () => {
    // 104'ün gizlilik kuralı yeni olaylarda da geçerli.
    const fn = sql106.slice(sql106.indexOf('AS $$'));
    assert.match(fn, /split_part\(COALESCE\(NEW\.customer_name, ''\), ' ', 1\)/);
    assert.doesNotMatch(fn, /COALESCE\(NEW\.customer_name, 'Müşteri'\)/);
});

// ── Müdürün jetonu ──────────────────────────────────────────────────────────

test('müdür jetonu PUSH-SUBSCRIBE\'dan, personelinki STAFF-API\'den', () => {
    /*
     * İki kimlik sistemi iki uç dayatıyor: müdürün Supabase oturumu var ve bu
     * uç tam onu bekliyor; personelin yok.
     */
    assert.match(subscribe, /action === 'subscribe' && body\.kind === 'expo'/);
    assert.match(subscribe, /role: 'manager',\s*\n\s*kind: 'expo'/);
    // Abonelik kişiye değil ROLE bağlı.
    assert.match(subscribe, /staff_id: null,/);
    const push = code(read('mobile/src/lib/push.ts'));
    assert.match(push, /supabase\.functions\.invoke\('push-subscribe'/);
    assert.match(push, /api\.pushRegister\(/, 'personel yolu duruyor');
});

test('müdür de deviceId ile koparılabiliyor', () => {
    // İzin geri alınmışsa jeton üretilemiyor; cihaz kimliği ondan bağımsız.
    assert.match(subscribe, /if \(typeof body\.deviceId === 'string' && body\.deviceId\.trim\(\)\)/);
    assert.match(code(read('mobile/src/api/auth.ts')),
        /actor === 'manager'\) await unregisterManagerPush\(\)/);
});

test('MÜDÜR oturumunda personel kaydı YAZILMIYOR', () => {
    /*
     * `myStaffId()` müdürde `null` dönüyor ve arka plan turu rolü ayırıyor.
     * Müdürün `profile.id`si bir Supabase kullanıcı kimliği, `staff.id` değil.
     */
    const sync = code(read('mobile/src/lib/backgroundSync.ts'));
    assert.match(sync, /if \(actor === 'manager'\) await syncManagerPush\(\)/);
    assert.match(sync, /else await syncPush\(await myStaffId\(\)\)/);
});

// ── Şema ────────────────────────────────────────────────────────────────────

test('105 boş nesneyle başlıyor — hepsi açık', () => {
    assert.match(sql105, /notification_prefs jsonb not null default '\{\}'::jsonb/);
    assert.match(sql105, /Eksik anahtar AÇIK demek/);
});
