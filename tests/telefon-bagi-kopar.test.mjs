/**
 * KAYIP TELEFON — "Telefonun bağlantısını kopar" (117 · 2026-10-13).
 *
 * Açık: şifre sıfırlamak oturumu düşürüyordu ama telefon işletmeye bağlı
 * kalıyordu; 099'da "şifresi yoksa kendisi belirler" — telefonu bulan kişi
 * sıfırlamadan sonra yeni şifre belirleyip girebiliyordu. Kullanıcı kararı:
 * koparma yetkisi işletme sahibinde.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    CUT_LINES, CUT_RESET_HINT, CUT_ROW_SUB, CUT_TITLE, cutProblem,
} from '../mobile/src/lib/deviceCut.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const sql = read('supabase/117_telefon_bagini_kopar.sql');
const api = read('supabase/functions/staff-api/index.ts');
const token = read('supabase/functions/_shared/staffToken.ts');

const block = (start, end) => {
    const from = api.indexOf(start);
    assert.ok(from > 0, `bulunamadı: ${start}`);
    const to = api.indexOf(end, from + start.length);
    assert.ok(to > from, `bitiş bulunamadı: ${end}`);
    return api.slice(from, to);
};

// ── Göç ─────────────────────────────────────────────────────────────────────

test('göç: telefon tablosu yalnız sunucunun — RLS açık, politika yok, istemci rolleri sökülü', () => {
    const body = strip(sql);
    assert.match(body, /CREATE TABLE IF NOT EXISTS public\.staff_devices \(/);
    assert.match(body, /id\s+UUID PRIMARY KEY,/);
    assert.match(body, /paired_via\s+TEXT NOT NULL CHECK \(paired_via IN \('team', 'single', 'owner'\)\)/);
    assert.match(body, /ALTER TABLE public\.staff_devices ENABLE ROW LEVEL SECURITY;/);
    assert.match(body, /REVOKE ALL ON public\.staff_devices FROM PUBLIC, anon, authenticated;/);
    assert.doesNotMatch(body, /CREATE POLICY/i);
    assert.match(body, /ALTER TABLE public\.staff\s+ADD COLUMN IF NOT EXISTS devices_cut_at TIMESTAMPTZ;/);
    assert.match(body, /^BEGIN;/m);
    assert.match(body, /^COMMIT;/m);
});

test('göç: olay listesi 110\'un TAMAMI + devices_cut — hiçbir değer düşmüyor', () => {
    const events = (src) => {
        const from = src.indexOf('ADD CONSTRAINT staff_auth_log_event_check');
        const list = src.slice(from, src.indexOf('));', from));
        return [...strip(list).matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]);
    };
    const before = events(read('supabase/110_staff_auth_log_tahsilat.sql'));
    const after = events(sql);
    assert.ok(before.length >= 15, `110 okunamadı (${before.length})`);
    assert.deepEqual(after.filter((e) => !before.includes(e)), ['devices_cut']);
    assert.deepEqual(before.filter((e) => !after.includes(e)), []);
});

// ── Belge ───────────────────────────────────────────────────────────────────

test('belge telefonun kimliğini taşıyor; tipi bozuk `did` reddediliyor', () => {
    assert.match(token, /did\?: string;/);
    assert.match(token, /\(claims\.did !== undefined && typeof claims\.did !== 'string'\)/);
});

// ── Eşleme ──────────────────────────────────────────────────────────────────

test('eşleme: telefonun satırı KODDAN ÖNCE yazılıyor; yazılamazsa belge yok', () => {
    const redeem = block("if (action === 'device.code.redeem')", "// Bundan sonraki tüm uçlar token ister");
    const register = redeem.indexOf("await registerDevice(row.organization_id, row.multi_use ? 'team' : 'single')");
    assert.ok(register > 0);
    assert.ok(register < redeem.indexOf('if (row.multi_use) {'), 'satır kod tüketildikten sonra açılıyor');
    assert.match(redeem, /if \(!did\) return json\(\{ error: 'device_unavailable' \}, 503\);/);
    assert.match(redeem, /\{ sub: 'device', org: row\.organization_id, role: 'device', epoch: 0, did \}/);

    const pair = block("if (action === 'device.pair')", "if (action === 'device.code.create')");
    assert.match(pair, /const did = await registerDevice\(resolved\.orgId, 'owner'\);/);
    assert.match(pair, /epoch: 0, did \}/);

    const helper = block('const registerDevice = async', '};');
    assert.match(helper, /const did = crypto\.randomUUID\(\);/);
    assert.match(helper, /\.from\('staff_devices'\)\.insert\(\{\s*id: did, organization_id: organizationId, paired_via: via,/);
    assert.match(helper, /if \(error\) \{[\s\S]*return null;/);
});

// ── Her isteğin kapısı ──────────────────────────────────────────────────────

test('kapı: iptal edilen telefonun iki belgesi de ölü — her uçtan ÖNCE', () => {
    const gate = block('const isDevice = claims.sub === \'device\';', "if (action === 'access')");
    assert.match(gate, /if \(claims\.did\) \{/);
    assert.match(gate, /\.from\('staff_devices'\)\s*\.select\('revoked_at'\)\s*\.eq\('id', claims\.did\)\s*\.eq\('organization_id', claims\.org\)/);
    // Satır yoksa da ölü.
    assert.match(gate, /if \(!device \|\| device\.revoked_at\) \{/);
    // Cihaz belgesi → eşleştirme ekranı; personel belgesi → önce şifre ekranı.
    assert.match(gate, /\? json\(\{ error: 'invalid_token', reason: 'device_revoked' \}, 401\)\s*: json\(\{ error: 'revoked' \}, 401\);/);
    // Okuma hatasında kapı AÇILMIYOR.
    assert.match(gate, /return json\(\{ error: 'lookup_failed' \}, 500\);/);
});

test('telefon istemcisi bu cevapları zaten tanıyor: invalid_token → eşleştirme, revoked → şifre', () => {
    const auth = read('mobile/src/api/auth.ts');
    assert.match(auth, /case 'revoked': return fail\('no_session'\);/);
    assert.match(auth, /case 'invalid_token': return fail\('not_paired'\);/);
    assert.match(read('mobile/app/(auth)/staff/pin.tsx'), /result\.error === 'not_paired'[\s\S]{0,80}'\/\(auth\)\/staff\/pair'/);
});

test('kural: koparılmadan ÖNCE basılmış belgeyle giriş ve şifre belirleme YOK', () => {
    const cut = block('function cutBefore(', '\n}\n');
    assert.match(cut, /if \(!member\.devices_cut_at\) return false;/);
    assert.match(cut, /return \(Number\(claims\.iat\) \|\| 0\) \* 1000 <= cutAt;/);

    const start = block("if (action === 'session.start')", "if (action === 'pin.setup')");
    assert.match(start, /devices_cut_at'\)/);
    const refusal = start.indexOf('if (cutBefore(member, claims))');
    assert.ok(refusal > 0);
    // Şifre denemesi SAYILMADAN önce.
    assert.ok(refusal < start.indexOf('safeEqual(await hashPin(pin), member.pin)'));
    assert.match(start, /return loginResponse\(member, claims\.did\);/);
    assert.match(start, /await noteDeviceLogin\(member\.id\);/);

    const setup = block("if (action === 'pin.setup')", "if (action === 'push.unregister')");
    const guard = setup.indexOf('if (target && cutBefore(target, claims))');
    assert.ok(guard > 0, 'şifre belirleme kapısı yok — açığın kendisi');
    assert.ok(guard < setup.indexOf('pin: await hashPin(pin),'));
    assert.match(setup, /return loginResponse\(claimed as StaffRow, claims\.did\);/);
});

test('telefonun kimliği yenilenen belgelerde KORUNUYOR', () => {
    assert.match(block("if (action === 'me' || action === 'session.refresh')", 'return json({'),
        /\.\.\.\(claims\.did \? \{ did: claims\.did \} : \{\}\)/);
    assert.match(block('const loginResponse = async', 'return json({'), /\.\.\.\(did \? \{ did \} : \{\}\)/);
    // Sahibin kendi kumandasında telefon yok.
    assert.match(api, /await audit\(owner\.orgId, crew\[0\]\.id, 'login', 'solo'\);\s*return loginResponse\(crew\[0\] as StaffRow\);/);
});

// ── Sahibin ucu ─────────────────────────────────────────────────────────────

test('sahip ucu: yalnız işletme sahibi; dört adım bu sırayla', () => {
    const cut = block("if (action === 'staff.devices.cut')", "if (action === 'solo.session')");
    assert.match(cut, /const owner = await ownerOf\(\);\s*if \(owner instanceof Response\) return owner;/);
    assert.match(cut, /if \(!UUID_RE\.test\(staffId\)\) return json\(\{ error: 'invalid_staff' \}, 400\);/);
    const order = [
        "update({ devices_cut_at: now, session_epoch: (member.session_epoch ?? 1) + 1 })",
        "update({ revoked_at: now, revoked_by: owner.userId })",
        ".from('push_subscriptions')",
        "await audit(owner.orgId, staffId, 'devices_cut', String(devices));",
    ].map((needle) => {
        const at = cut.indexOf(needle);
        assert.ok(at > 0, `yok: ${needle}`);
        return at;
    });
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    // Telefonlar KİŞİNİN, salonun hepsi değil.
    assert.match(cut, /\.eq\('organization_id', owner\.orgId\)\s*\.eq\('last_staff_id', staffId\)\s*\.is\('revoked_at', null\)/);
    // Şifre DEĞİŞMİYOR.
    assert.doesNotMatch(cut, /pin: null/);
    // Asıl kapı yazılamazsa "koparıldı" denmiyor.
    assert.match(cut, /if \(cutErr \|\| !cut\) \{/);
});

// ── Müdür ekranı ────────────────────────────────────────────────────────────

test('ekran: kişinin sayfasında her satırda; onay sayfası sonuçları söylüyor', () => {
    const screen = read('mobile/app/(manager-flow)/profil/personel.tsx');
    assert.match(screen, /<ProfileRow first=\{!member\.hasPin\} title=\{CUT_TITLE\} sub=\{CUT_ROW_SUB\} onPress=\{onCut\} \/>/);
    assert.match(screen, /await cutStaffDevices\(member\.id\)/);
    assert.match(screen, /setCutError\(cutProblem\(result\.reason\)\);/);
    assert.match(screen, /\{CUT_LINES\.map\(/);
    // Yanlış aracı seçen doğrusunu görüyor.
    assert.match(screen, /CUT_RESET_HINT,\s*\];/);
    assert.match(read('mobile/src/lib/teamAccess.ts'), /await call\('staff\.devices\.cut', \{ staffId \}\);/);
});

test('metinler: şifre değişmez, yeni telefon Telefon bağla ile; hata telefonun hâlâ bağlı olduğunu söylüyor', () => {
    assert.equal(CUT_TITLE, 'Telefonun bağlantısını kopar');
    assert.match(CUT_ROW_SUB, /şifresi değişmez/);
    assert.ok(CUT_LINES.some((line) => /Şifresi değişmez/.test(line) && /Telefon bağla/.test(line)));
    assert.ok(CUT_LINES.some((line) => /bildirim gitmez/.test(line)));
    assert.match(CUT_RESET_HINT, /sıfırlamak yetmez/);
    assert.match(cutProblem('owner_required'), /yalnız işletme sahibi/);
    for (const reason of ['offline', 'failed']) assert.match(cutProblem(reason), /hâlâ bağlı/);
});

test('belge: `did` imzayla birlikte taşınıyor; tipi bozuksa reddediliyor (çalıştırılarak)', async () => {
    const { mintStaffToken, signHs256, verifyStaffToken } = await import('../supabase/functions/_shared/staffToken.ts');
    const secret = 'test-secret-117';
    const now = 1_800_000_000;
    const withDid = await mintStaffToken({ sub: 'device', org: 'o1', role: 'device', epoch: 0, did: 'd-1' }, secret, now, 60);
    const ok = await verifyStaffToken(withDid, secret, now + 1);
    assert.equal(ok.ok, true);
    assert.equal(ok.claims.did, 'd-1');
    assert.equal(ok.claims.iat, now);

    // 117'den önceki belge: `did` yok, hâlâ geçerli (kural onları devices_cut_at ile kapsıyor).
    const legacy = await mintStaffToken({ sub: 'device', org: 'o1', role: 'device', epoch: 0 }, secret, now, 60);
    const old = await verifyStaffToken(legacy, secret, now + 1);
    assert.equal(old.ok, true);
    assert.equal(old.claims.did, undefined);

    const bad = await signHs256({ sub: 'device', org: 'o1', role: 'device', epoch: 0, did: 42, iat: now, exp: now + 60 }, secret);
    assert.deepEqual(await verifyStaffToken(bad, secret, now + 1), { ok: false, reason: 'malformed' });
});
