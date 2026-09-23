import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { pinProblem as serverRule, PIN_LENGTH } from '../supabase/functions/_shared/pinRules.ts';
import { pinProblem as phoneRule } from '../mobile/src/lib/pinRules.ts';
import {
    countdown, isFreshPin, memberLine, sortTeam, spacedCode, teamHeadline, when,
} from '../mobile/src/lib/teamAccessView.ts';

/**
 * PERSONEL GİRİŞİ · 099 — 2026-09-17.
 *
 * Personel telefondan GİREMİYORDU. Canlı kayıtlar eşleştirmenin çalıştığını
 * gösterdi; asıl sebepler akıştaydı:
 *   • "Burada çalışıyorum" bağlı telefonu tanımıyor, her seferinde kod istiyordu.
 *   • Çıkış yapmak telefonu işletmeden çıkarıyordu.
 *   • Kod kişi başına ve tek kullanımlıktı; kullanılmış kod "eşleşmedi" diyordu.
 *   • Şifresi olmayan personel listede hiç görünmüyordu.
 *
 * Müdür kararları: tek ekip kodu (masaüstü + müdür telefonu, Profil → Personel,
 * büyük rakam + geri sayım), listeden seçim, şifreyi personel kendisi belirler
 * ve ayarlardan değiştirir, çıkışta sonraki giriş yalnız şifre.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const api = read('supabase/functions/staff-api/index.ts');
const migration = read('supabase/099_staff_team_code_pin_setup.sql');
const live = read('mobile/src/api/auth.ts');

const block = (name) => {
    const start = api.indexOf(`if (action === '${name}')`);
    assert.ok(start > 0, `${name} bloğu yok`);
    const rest = api.slice(start + 1);
    const next = rest.indexOf('if (action === ');
    return next > 0 ? rest.slice(0, next) : rest;
};

// ── Şifre kuralı: iki kopya, tek davranış ───────────────────────────────────

test('şifre kuralı telefonda ve sunucuda AYNI', () => {
    const inputs = ['', '12', '12345', 'abcd', '12a4', '0000', '7777', '1234', '4321', '6789', '9876',
        '0123', '1357', '2580', '1122', '1990', '0912'];
    for (const pin of inputs) assert.equal(phoneRule(pin), serverRule(pin), pin);
    // Yalnız yorum satırı farklı olabilir; kural gövdesi birebir.
    const body = (src) => src.slice(src.indexOf('export const PIN_LENGTH'));
    assert.equal(body(read('mobile/src/lib/pinRules.ts')), body(read('supabase/functions/_shared/pinRules.ts')));
});

test('dört hane; herkesin ilk denediği şifreler reddediliyor, gerisi serbest', () => {
    assert.equal(PIN_LENGTH, 4);
    assert.equal(serverRule('123'), 'format');
    assert.equal(serverRule('12a4'), 'format');
    for (const weak of ['0000', '5555', '1234', '4321', '3456', '8765']) assert.equal(serverRule(weak), 'weak', weak);
    for (const ok of ['1357', '2580', '1122', '1990', '0912']) assert.equal(serverRule(ok), null, ok);
});

// ── Veritabanı ──────────────────────────────────────────────────────────────

test('099: ekip kodu kolonları ve sebep kaydı', () => {
    const body = migration.replace(/^\s*--.*$/gm, '');
    assert.match(body, /add column if not exists multi_use boolean not null default false/);
    assert.match(body, /add column if not exists use_count integer not null default 0/);
    assert.match(body, /add column if not exists detail text/);
    // Süresi dolmuş açık kodlar tekil indeksi tıkamasın.
    assert.match(body, /set used_at = expires_at\s+where used_at is null\s+and expires_at <= now\(\)/);
});

test('099 olay listesi öncekileri DÜŞÜRMÜYOR, yenilerini ekliyor', () => {
    const events = (sql) => {
        const start = sql.lastIndexOf('add constraint staff_auth_log_event_check');
        const check = sql.slice(start, sql.indexOf('));', start));
        return new Set([...check.replace(/--.*$/gm, '').matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]));
    };
    const before = events(read('supabase/091_staff_device_codes.sql'));
    const after = events(migration);
    for (const event of before) assert.ok(after.has(event), `099, ${event} olayını düşürüyor`);
    for (const event of ['pin_set', 'pin_changed', 'pin_reset']) assert.ok(after.has(event), event);
    // Sunucunun yazdığı her olay listede.
    for (const [, event] of api.matchAll(/audit\([^)]*?'([a-z_.]+)'/g)) {
        assert.ok(after.has(event), `staff-api '${event}' yazıyor ama 099 kabul etmiyor`);
    }
});

// ── Ekip kodu ───────────────────────────────────────────────────────────────

test('staffId yoksa EKİP kodu: 15 dakika, eskisini kapatır', () => {
    assert.match(api, /const TEAM_CODE_TTL_MINUTES = 15;/);
    const create = block('device.code.create');
    assert.match(create, /const team = !staffId;/);
    assert.match(create, /issuePairCode\(admin, owner\.orgId, staffId, owner\.userId, team\)/);
    assert.match(create, /expiresInMinutes: team \? TEAM_CODE_TTL_MINUTES : PAIR_CODE_TTL_MINUTES/);
    const issue = api.slice(api.indexOf('async function issuePairCode'), api.indexOf('async function pairAttemptLock'));
    assert.match(issue, /if \(team\) \{\s*await admin\.from\('staff_device_codes'\)\s*\.update\(\{ used_at: now \}\)\s*\.eq\('organization_id', orgId\)\s*\.eq\('multi_use', true\)/);
    assert.match(issue, /multi_use: team,/);
    // Süresi dolmuş açık kodlar üretimden ÖNCE kapanıyor.
    assert.ok(issue.indexOf(".lte('expires_at', now)") < issue.indexOf('.insert('));
});

test('ekip kodu kullanılınca KAPANMIYOR; tek kişilik kod kapanıyor', () => {
    const redeem = block('device.code.redeem');
    const multi = redeem.slice(redeem.indexOf('if (row.multi_use) {'), redeem.indexOf('} else {'));
    assert.doesNotMatch(multi, /\bused_at\b/);
    assert.match(multi, /use_count: \(Number\(row\.use_count\) \|\| 0\) \+ 1/);
    const single = redeem.slice(redeem.indexOf('} else {'), redeem.indexOf('await clearPairAttempts'));
    assert.match(single, /\.update\(\{ used_at: new Date\(\)\.toISOString\(\), used_ip: ip \}\)[\s\S]*\.is\('used_at', null\)/);
});

test('KULLANILMIŞ kod "eşleşmedi" demiyor ve kilidi beslemiyor', () => {
    const redeem = block('device.code.redeem');
    const missing = redeem.slice(redeem.indexOf('if (!row) {'), redeem.indexOf('// Süresi dolmuş kod YANLIŞ'));
    assert.match(missing, /\.not\('used_at', 'is', null\)/);
    assert.match(missing, /return json\(\{ error: expired \? 'expired_pair_code' : 'used_pair_code' \}, 401\);/);
    // Kapanmış kod bulunduysa sayaç artmıyor; yalnız hiç olmayan kod sayılıyor.
    const closedBranch = missing.slice(missing.indexOf('if (closed) {'), missing.indexOf('await failedPairAttempt'));
    assert.doesNotMatch(closedBranch, /failedPairAttempt/);
});

test('başarısızlığın SEBEBİ kayda geçiyor — kod ya da şifre asla', () => {
    const redeem = block('device.code.redeem');
    for (const reason of ['expired', 'used', 'subscription']) {
        assert.match(redeem, new RegExp(`'failed_pair', [^)]*'${reason}'`), reason);
    }
    assert.match(api, /organization_id: organizationId, staff_id: staffId, event, ip, user_agent: userAgent, detail,/);
    assert.doesNotMatch(api, /audit\([^)]*(digits|pin)\)/);
});

// ── İlk şifre ───────────────────────────────────────────────────────────────

test('şifresi olmayan personel "yanlış şifre" değil, şifre belirleme alıyor', () => {
    assert.match(block('session.start'), /if \(!member\.pin\) return json\(\{ error: 'pin_not_set' \}, 409\);/);
});

test('pin.setup: yalnız cihaz, yalnız şifresi BOŞ personel, kural sunucuda', () => {
    const setup = block('pin.setup');
    assert.match(setup, /if \(!isDevice\) return json\(\{ error: 'device_token_required' \}, 403\);/);
    assert.match(setup, /const problem = pinProblem\(pin\);/);
    // İki telefon aynı kişiyi aynı anda sahiplenemez: koşullu güncelleme.
    assert.match(setup, /\.eq\('organization_id', claims\.org\)\s*\.eq\('is_active', true\)\s*\.is\('pin', null\)/);
    assert.match(setup, /return json\(\{ error: 'pin_already_set' \}, 409\);/);
    assert.match(setup, /audit\(claims\.org, staffId, 'pin_set'\)/);
    // Token YENİ kuşakla: 082 tetikleyicisi pin değişince epoch'u artırıyor ve
    // güncellenen satır dönüyor.
    assert.match(setup, /\.select\('id, organization_id, name, color, role, is_active, pin, session_epoch/);
    assert.match(setup, /return loginResponse\(claimed as StaffRow\);/);
});

test('pin.change: personel token\'ı, eski şifre sayaçlı, yeni token', () => {
    const change = block('pin.change');
    // Cihaz token'ı buraya ulaşamaz: blok personel kapısının ARDINDA.
    assert.ok(api.indexOf("if (action === 'pin.change')") > api.indexOf("if (isDevice) return json({ error: 'staff_token_required' }, 403)"));
    assert.match(change, /if \(currentPin === nextPin\) return json\(\{ error: 'same_pin' \}, 400\);/);
    assert.match(change, /const lock = attempts >= PIN_MAX_ATTEMPTS;/);
    assert.match(change, /\.eq\('pin', member\.pin\)/);
    assert.match(change, /audit\(me\.organization_id, member\.id, 'pin_changed'\)/);
    assert.match(change, /return loginResponse\(changed as StaffRow\);/);
});

// ── Müdür uçları ────────────────────────────────────────────────────────────

test('team.status şifre HASH\'ini telefona indirmiyor', () => {
    const status = block('team.status');
    const response = status.slice(status.indexOf('return json({'));
    assert.match(response, /hasPin: Boolean\(m\.pin\)/);
    assert.doesNotMatch(response, /\bpin: /);
});

test('staff.pin.reset: müdür şifre YAZMIYOR, siliyor — org sınırlı', () => {
    const reset = block('staff.pin.reset');
    assert.match(reset, /\.update\(\{ pin: null \}\)\s*\.eq\('id', staffId\)\s*\.eq\('organization_id', owner\.orgId\)/);
    assert.match(reset, /audit\(owner\.orgId, staffId, 'pin_reset'\)/);
});

// ── Telefon: bağlı telefon tanınıyor ────────────────────────────────────────

test('açılış: bağlı ve kim olduğu bilinen telefon doğrudan ŞİFREYE', () => {
    assert.match(live, /return \(await readPending\(\)\) \? \{ target: 'staffPin' \} : \{ target: 'staffRoster' \};/);
    assert.match(read('mobile/app/index.tsx'), /launch\.target === 'staffPin'\) return <Redirect href="\/\(auth\)\/staff\/pin" \/>/);
});

test('"Burada çalışıyorum" bağlı telefonda kod İSTEMİYOR', () => {
    const welcome = read('mobile/app/(auth)/welcome.tsx');
    assert.match(welcome, /authApi\.staff\.entry\(\)/);
    assert.doesNotMatch(welcome, /onPress=\{\(\) => router\.push\('\/\(auth\)\/staff\/pair'\)\}/);
    assert.match(live, /async function staffEntry\(\): Promise<StaffEntry> \{\s*if \(!\(await tokens\.device\(\)\)\) return 'pair';/);
});

test('çıkış eşleşmeyi silmiyor; YALNIZ "telefonu çıkar" siliyor', () => {
    const clears = [...live.matchAll(/tokens\.clearDevice\(\)/g)].length;
    assert.equal(clears, 1, 'clearDevice tek yerde: unlinkDevice');
    // 103: arada bildirim aboneliğinin koparılması var; korunan şey
    // `clearDevice`in YALNIZ bu akışta olması.
    assert.match(live, /unlinkDevice: async \(\) => \{[\s\S]{0,400}await tokens\.clearDevice\(\);/);
    assert.match(live, /unlinkDevice: async \(\) => \{[\s\S]{0,200}await unregisterPush\(\)/,
        'cihaz koparılınca bildirim aboneliği de gider');
    assert.match(read('mobile/app/personel/profile.tsx'), /router\.replace\('\/\(auth\)\/staff\/pin'\);/);
    assert.match(read('mobile/app/(staff-flow)/account.tsx'), /router\.replace\(isManager \? '\/\(auth\)\/welcome' : '\/\(auth\)\/staff\/pin'\);/);
    assert.doesNotMatch(read('mobile/src/components/ProfileSheets.tsx'), /yeni bir bağlantı kodu/);
});

test('yeni eşleşme önceki kişinin kaydını temizliyor', () => {
    const pair = live.slice(live.indexOf('async function pairStaffDevice'), live.indexOf('async function staffRoster'));
    assert.ok(pair.indexOf('tokens.setDevice') < pair.indexOf('await clearPending();'));
});

test('liste ŞİFRESİ OLMAYANI da gösteriyor', () => {
    const roster = live.slice(live.indexOf('async function staffRoster'), live.indexOf('async function finishStaffLogin'));
    assert.doesNotMatch(roster, /\.filter\(/);
    assert.match(roster, /hasPin: row\.hasPin !== false,/);
    // "İlk giriş" artık satırın KENDİSİNDE (tasarım §P2): who.tsx üyeyi
    // olduğu gibi veriyor, ayrımı AuthStaffRow çiziyor.
    assert.match(read('mobile/app/(auth)/staff/who.tsx'), /<AuthStaffRow\s*key=\{member\.id\}/);
    assert.match(read('mobile/src/components/ui.tsx'), /İlk giriş · şifrenizi siz belirleyeceksiniz/);
});

test('şifre ekranı: belirle → tekrar → sunucu; sıfırlanmışsa belirlemeye geçiyor', () => {
    const pin = read('mobile/app/(auth)/staff/pin.tsx');
    assert.match(pin, /type PinMode = 'enter' \| 'create' \| 'confirm';/);
    assert.match(pin, /if \(result\.data\.member\.hasPin === false\) setMode\('create'\);/);
    assert.match(pin, /if \(next !== firstPin\.current\) \{[\s\S]{0,160}startOver\(\{ text: 'İki şifre aynı olmadı/);
    assert.match(pin, /void createPin\(next\);/);
    assert.match(pin, /if \(result\.error === 'pin_not_set'\) \{\s*setResetBand\(true\);\s*startOver\(null\);/);
    // Yarışı kaybeden ekran "şifreniz" DEMİYOR — belirleyen başkası olabilir.
    assert.match(pin, /if \(result\.error === 'pin_already_set'\) \{[\s\S]{0,160}setPlate\('taken'\);/);
    assert.match(pin, /siz değilseniz müdürünüze söyleyin/);
    assert.match(pin, /label="Ben değilim" onPress=\{notMe\}/);
});

test('personel şifresini ayarlardan değiştiriyor', () => {
    const screen = read('mobile/app/(staff-flow)/sifre.tsx');
    assert.match(screen, /type Step = 'current' \| 'next' \| 'confirm';/);
    assert.match(screen, /authApi\.staff\.changePin\(current\.current, next\.current\)/);
    assert.match(read('mobile/app/personel/profile.tsx'), /title="Şifreyi değiştir"\s*onPress=\{\(\) => router\.push\('\/\(staff-flow\)\/sifre'\)\}/);
    assert.match(live, /const data = await staffCalls\.pinChange\(currentPin, nextPin\);\s*return done\(await finishStaffLogin\(data\)\);/);
});

// ── Müdür: Profil → Personel ────────────────────────────────────────────────

test('müdür telefonunda Profil → Personel → Telefon bağla', () => {
    assert.match(read('mobile/app/mudur/profile.tsx'), /title="Personel"[\s\S]{0,600}router\.push\('\/\(manager-flow\)\/profil\/personel'\)/);
    const screen = read('mobile/app/(manager-flow)/profil/personel.tsx');
    // Kod kapalıyken tek düğme "Telefon bağla"; kod açıkken kartın içinde
    // "Yeni kod üret" — ikisi de aynı kapıyı açar, ikisi de üretirken söyler.
    assert.match(screen, /label=\{codeBusy \? 'Üretiliyor…' : 'Telefon bağla'\}/);
    assert.match(screen, /label=\{codeBusy \? 'Üretiliyor…' : 'Yeni kod üret'\}/);
    assert.match(screen, /\{spacedCode\(code\.code\)\}/);
    assert.match(screen, /\$\{countdown\(secondsLeft\)\} geçerli/);
    // Sıfırlama onay sayfasından geçiyor: seçilen kişi `resetting`.
    assert.match(screen, /await resetStaffPin\(resetting\.id\)/);
    const access = read('mobile/src/lib/teamAccess.ts');
    assert.match(access, /call\('device\.code\.create'\)/);
    // Müdür telefonu da KİŞİYE değil EKİBE kod üretiyor.
    assert.doesNotMatch(access, /device\.code\.create', \{ staffId/);
});

test('görünüm yardımcıları', () => {
    assert.equal(spacedCode('482913'), '482 913');
    assert.equal(countdown(872), '14:32');
    assert.equal(countdown(-3), '0:00');
    const now = new Date(2026, 8, 17, 12, 0).getTime();
    assert.equal(when(new Date(2026, 8, 17, 9, 5).toISOString(), now), 'bugün 09:05');
    assert.equal(when(new Date(2026, 8, 16, 23, 31).toISOString(), now), 'dün 23:31');
    assert.equal(when(new Date(2026, 8, 12, 18, 40).toISOString(), now), '12 Eyl 18:40');

    const base = { id: 'a', name: 'Fatma', role: null, hasPin: true, lastLoginAt: null, pinSetAt: null, lockedUntil: null };
    assert.match(memberLine({ ...base, hasPin: false }, now).text, /^Henüz girmedi/);
    assert.equal(memberLine({ ...base, pinSetAt: new Date(2026, 8, 17, 9, 5).toISOString(), lastLoginAt: new Date(2026, 8, 17, 9, 5).toISOString() }, now).text, 'Şifresini belirledi · bugün 09:05');
    assert.equal(memberLine({ ...base, pinSetAt: new Date(2026, 8, 10, 9, 0).toISOString(), lastLoginAt: new Date(2026, 8, 17, 11, 0).toISOString() }, now).text, 'Son giriş · bugün 11:00');
    assert.equal(memberLine({ ...base, lockedUntil: new Date(now + 60_000).toISOString() }, now).tone, 'error');
    // Başlık ÖZETİ: kilitli > henüz girmedi > hepsi girdi (tek bilgi taşır).
    assert.equal(teamHeadline([base, { ...base, id: 'b', hasPin: false }], now), '1 kişi henüz girmedi');
    assert.equal(teamHeadline([base], now), 'hepsi girdi');
    assert.equal(
        teamHeadline([{ ...base, lockedUntil: new Date(now + 60_000).toISOString() }], now),
        '1 kişi kilitli',
    );
    // Şifresini YENİ belirleyen 12 saat boyunca taze sayılır ve listenin başına geçer.
    assert.equal(isFreshPin({ ...base, pinSetAt: new Date(now - 60_000).toISOString() }, now), true);
    assert.equal(isFreshPin({ ...base, pinSetAt: new Date(now - 13 * 3_600_000).toISOString() }, now), false);
    const fresh = { ...base, id: 'c', name: 'Zeynep', pinSetAt: new Date(now - 60_000).toISOString() };
    const sorted = sortTeam([{ ...base, name: 'Ahmet' }, fresh], now);
    assert.deepEqual(sorted.map((m) => m.name), ['Zeynep', 'Ahmet']);
});

// ── Masaüstü ────────────────────────────────────────────────────────────────

test('masaüstü: tek ekip kodu başlıkta, kişi panelinde şifre sıfırlama', () => {
    const hook = read('src/hooks/useDevicePairing.ts');
    assert.match(hook, /export function useDevicePairing\(\) \{/);
    assert.match(hook, /body: \{ action: 'device\.code\.create' \},/);
    assert.match(hook, /body: \{ action: 'staff\.pin\.reset', staffId \},/);
    const page = read('src/pages/StaffPage.tsx');
    assert.match(page, /const pairing\s+= useDevicePairing\(\);/);
    assert.match(page, /handlePinReset\(selMember\)/);
    // Telefon tuş takımı dört hane: masaüstü 5-6 haneli PIN yazdırmıyor.
    assert.match(page, /inputMode="numeric" maxLength=\{4\}/);
    assert.match(page, /form\.pin\.trim\(\)\.length !== 4/);
});
