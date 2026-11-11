import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    identityOf, jobBelongs, ownerKey, sessionStopOf,
} from '../mobile/src/lib/staffIdentity.ts';
import { cachePayload, parseCache } from '../mobile/src/lib/agendaCache.ts';

/**
 * KİRACI SINIRI (Paket A · 2026-11-12).
 *
 * Çıkış, salon değişimi ve önbelleklerde önceki salonun / kişinin izi
 * kalıyordu: tek kişilik personel jetonu müdür çıkışından sağ çıkıyordu,
 * "İşletme değiştir" eski salona okuyup yazıyordu, günün kopyası ve
 * bekleyen iş kuyruğu kişiye bağlı değildi, personelin hesap ekranından
 * çıkışı bildirimi koparmıyordu, Face ID'siz açılış karşılamaya düşüyordu,
 * koparılmış oturum sahte "Çevrimdışı liste" gösteriyordu ve müdür bildirimi
 * rastgele salona bağlanıyordu.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fn = (src, start, end) => {
    const from = src.indexOf(start);
    assert.ok(from >= 0, `${start} bulunamadı`);
    const to = end ? src.indexOf(end, from + start.length) : -1;
    return src.slice(from, to > from ? to : undefined);
};

const auth = code(read('mobile/src/api/auth.ts'));
const staff = code(read('mobile/src/api/staff.ts'));
const reset = code(read('mobile/src/lib/tenantReset.ts'));
const managerSource = code(read('mobile/src/lib/managerSource.ts'));
const liveSignal = code(read('mobile/src/lib/liveSignal.ts'));
const sync = code(read('mobile/src/lib/backgroundSync.ts'));
const solo = code(read('mobile/src/lib/soloSession.ts'));
const agendaSource = code(read('mobile/src/lib/agendaSource.ts'));
const push = code(read('mobile/src/lib/push.ts'));
const deletion = code(read('mobile/src/api/accountDeletion.ts'));
const resume = code(read('mobile/app/(auth)/resume.tsx'));
const session = code(read('mobile/src/api/session.ts'));
const stub = code(read('mobile/src/api/authStub.ts'));
const subscribe = code(read('supabase/functions/push-subscribe/index.ts'));

/** Sunucunun bastığı biçimde (imzasız) bir jeton: başlık.gövde.imza */
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenOf = (claims) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.imza`;

// ── Kimlik: jetonun kendi iddiası ──────────────────────────────────────────

test('jetonun sahibi `org` + `sub` iddiasından okunuyor', () => {
    const id = identityOf(tokenOf({ sub: 'staff-1', org: 'org-1', role: 'x', epoch: 1 }));
    assert.deepEqual(id, { orgId: 'org-1', staffId: 'staff-1' });
    assert.equal(ownerKey(id), 'org-1:staff-1');
    // Kapı DAR: okunamayan jeton "kimse".
    for (const bad of [null, '', 'tek-parca', 'a.b', 'a.!!!.c', tokenOf({ sub: 'x' }), tokenOf({ org: 'y' }), tokenOf({ sub: '', org: 'y' })]) {
        assert.equal(identityOf(bad), null, String(bad));
    }
    assert.equal(ownerKey(null), null);
});

// ── 1 · P0 · çıkışta / salon değişiminde personel jetonu ─────────────────────

test('1 · kiracı sınırı jetonu, günün kopyasını ve bellek kancalarını siliyor', () => {
    const wipe = fn(reset, 'export async function resetTenant');
    assert.match(wipe, /tokens\.clearStaff\(\)/);
    assert.match(wipe, /AsyncStorage\.removeItem\(AGENDA_CACHE_KEY\)/);
    assert.match(wipe, /announceTenantReset\(\)/);
    // Tek kişilik kimlik jetonla BİRLİKTE düşüyor.
    assert.match(fn(staff, 'clearStaff: async', 'clearDevice'), /deleteItemAsync\(K_SOLO_STAFF/);
    // Tazeleme saati sıfırlanıyor; org önbelleği + canlı kanal unutuluyor.
    assert.match(sync, /onTenantReset\(resetSyncClock\);/);
    assert.match(managerSource, /onTenantReset\(forgetOrg\);/);
    assert.match(liveSignal, /onForgetOrg\(forgetLive\);/);
    // Kuyruk SİLİNMİYOR: işler sahibine bağlı bekliyor.
    assert.doesNotMatch(reset, /K_QUEUE|tf\.queue/);
});

test('1 · müdür çıkışı da jetonu siliyor (her rolde resetTenant)', () => {
    const out = fn(auth, 'async function signOut', 'async function biometricAvailable');
    assert.match(out, /await resetTenant\(\);\s*await clearProfile\(\);/);
    // Eski hâl: yalnız personel dalında `else await tokens.clearStaff()`.
    assert.doesNotMatch(out, /else await tokens\.clearStaff\(\)/);
});

test('1 · hesap silme yolları kiracı izini siliyor', () => {
    // `hesap-sil.tsx` `deleteAccount`u doğrudan çağırıyor: temizlik onun içinde.
    const del = fn(deletion, 'export async function deleteAccount');
    assert.ok(del.indexOf('supabase.auth.signOut()') < del.indexOf('await resetTenant();'));
    assert.match(fn(auth, 'async function accountConfirmDeletion', '// ──'), /deleteAccount\(stored\.profile\.business\.id\)[\s\S]*clearProfile\(\)/);
});

test('1 · salon değişince iz siliniyor, aynı salon yeniden seçilince DEĞİL', () => {
    const select = fn(auth, 'async function selectManagerBusiness', 'let typedEmail');
    assert.match(select, /const changed = !previous\s*\|\| previous\.profile\.actor !== 'manager'\s*\|\| previous\.profile\.id !== profile\.id\s*\|\| previous\.profile\.business\.id !== business\.id;/);
    assert.match(select, /if \(changed\) \{[\s\S]*?await resetTenant\(\);/);
    // Profil yazıldıktan SONRA kancalar: org önbelleği + kanal yeni salonu okusun.
    assert.ok(select.indexOf('await saveProfile(') < select.indexOf('announceTenantReset()'));
    assert.ok(select.indexOf('await resetTenant()') < select.indexOf('await saveProfile('));
});

test('1 · tek kişilik jeton seçili salonun değilse KULLANILMIYOR', () => {
    const usable = fn(staff, 'async function usableToken', '/**');
    assert.match(usable, /if \(!t \|\| !expectedStaffOrg\) return t;/);
    assert.match(usable, /identityOf\(t\)\?\.orgId === expectedStaffOrg/);
    assert.match(usable, /await tokens\.clearStaff\(\);\s*return null;/);
    // `callOnce` ham jeton yerine bunu okuyor; tazeleyiciden sonra da.
    const once = fn(staff, 'async function callOnce', 'export const api');
    assert.doesNotMatch(once, /await tokens\.staff\(\)/);
    assert.equal((once.match(/await usableToken\(\)/g) ?? []).length, 3);
    // Kabuk seçili salonu söylüyor; sökülünce beklenti de düşüyor.
    const attach = fn(solo, 'export function attachSoloTokenRefresher');
    assert.match(attach, /expectStaffOrg\(stored\.ok && stored\.data\.actor === 'manager' \? stored\.data\.profile\.business\.id : null\)/);
    assert.match(attach, /expectStaffOrg\(null\);/);
    // Sunucu başka salonun jetonunu verirse saklanmıyor.
    const open = fn(solo, 'export async function openSoloSession', 'async function refresh');
    assert.ok(open.indexOf('minted.orgId !== wanted') < open.indexOf('await tokens.setStaff(token)'));
});

// ── 2 · P0 · İşletme değiştir ───────────────────────────────────────────────

test('2 · org önbelleği seçili salona da anahtarlı', () => {
    const resolve = fn(managerSource, 'export async function resolveOrg', 'async function orgIdOrThrow');
    assert.match(resolve, /cached\?\.userId === userId && cached\.stored === stored/);
    assert.ok(resolve.indexOf('await storedOrgId()') < resolve.indexOf('cached?.userId === userId'));
});

test('2 · canlı kanal sınırda kapanıp doğru salona yeniden kuruluyor', () => {
    const forget = fn(liveSignal, 'export function forgetLive');
    assert.match(forget, /closeChannel\(\);\s*void ensure\(\);/);
    // Jeton silindikten SONRA kanal kuruluyor: `ensure` personel jetonu varsa
    // personel ziline bağlanır — önceki salonun ziline.
    const wipe = fn(reset, 'export async function resetTenant');
    assert.ok(wipe.indexOf('tokens.clearStaff()') < wipe.indexOf('announceTenantReset()'));
});

// ── 3 · P1 · hesap ekranından personel çıkışı ───────────────────────────────

test('3 · hesap ekranından çıkış bildirimi koparıyor — jeton silinmeden ÖNCE', () => {
    const out = fn(auth, 'async function accountSignOut', 'async function changeManagerPassword');
    const staffBranch = out.slice(out.indexOf("actor === 'staff'"), out.indexOf('return signOut();'));
    assert.match(staffBranch, /await unregisterPush\(\)/);
    assert.match(staffBranch, /forgetIntent\(\);/);
    assert.ok(staffBranch.indexOf('unregisterPush()') < staffBranch.indexOf('resetTenant()'));
    // 099: çıkış eşleşmeyi silmez.
    assert.doesNotMatch(staffBranch, /clearDevice|forgetDeviceId/);
});

// ── 4 · P1 · günün kopyası ve kuyruk kişiye bağlı ───────────────────────────

test('4 · günün kopyası sahibiyle yazılıyor, başkasına gösterilmiyor', () => {
    const today = '2026-11-12';
    const body = cachePayload(today, today, 1000, [{ id: 'a' }], 'org-1:ayse');
    assert.ok(body);
    assert.equal(parseCache(body, today, 'org-1:ayse').rows.length, 1);
    assert.equal(parseCache(body, today, 'org-1:mehmet'), null, 'başka personel');
    assert.equal(parseCache(body, today, 'org-2:ayse'), null, 'başka salon');
    assert.equal(parseCache(body, today, null), null, 'jeton yok');
    // Sahibi bilinmiyorsa yazılmıyor; eski sürümün sahipsiz kopyası okunmuyor.
    assert.equal(cachePayload(today, today, 1000, [], null), null);
    assert.equal(parseCache(JSON.stringify({ date: today, at: 1, rows: [] }), today, 'org-1:ayse'), null);
    // Ekran sahibi jetondan okuyor.
    assert.match(agendaSource, /cachePayload\(dateISO, todayISO, at, rows, ownerKey\(await tokens\.identity\(\)\)\)/);
    assert.match(agendaSource, /parseCache<AgendaRow>\(raw, target, ownerKey\(identity\)\)/);
});

test('4 · çıkış yolları günün kopyasını siliyor', () => {
    assert.match(fn(auth, 'async function signOut', 'async function biometricAvailable'), /resetTenant\(\)/);
    assert.match(fn(auth, 'async function accountSignOut', 'async function changeManagerPassword'), /resetTenant\(\)/);
    const unlink = fn(auth, 'unlinkDevice: async', 'biometric: {');
    assert.match(unlink, /await tokens\.clearDevice\(\);\s*await resetTenant\(\);/);
});

test('4 · kuyruk işi sahibiyle yazılıyor, yalnız sahibinin jetonuyla gidiyor', () => {
    assert.equal(jobBelongs('org-1:ayse', 'org-1:ayse'), true);
    assert.equal(jobBelongs('org-1:ayse', 'org-1:mehmet'), false);
    assert.equal(jobBelongs('org-1:ayse', null), false);
    // 1.0.1'den kalan sahipsiz iş eskisi gibi gidiyor.
    assert.equal(jobBelongs(undefined, 'org-1:mehmet'), true);

    const write = fn(staff, 'async function write(', 'async function dropSuperseded');
    assert.ok(write.indexOf('const owner = ownerKey(await tokens.identity());') < write.indexOf('await call('),
        'sahip çağrıdan ÖNCE okunmalı — 401 jetonu siliyor');
    assert.match(write, /nextAt: 0,\s*owner,/);

    const flush = fn(staff, 'export async function flushQueue', 'export async function queueLength');
    assert.match(flush, /const current = ownerKey\(await tokens\.identity\(\)\);/);
    assert.match(flush, /!jobBelongs\(job\.owner, current\)\) \{ kept\.push\(job\); continue; \}/);
    assert.match(flush, /await writeQueue\(kept\);/);
});

test('4 · 401 ve 403 subscription_inactive kuyruğu DURDURUP saklıyor', () => {
    assert.equal(sessionStopOf({ status: 401, code: 'revoked' }), 'revoked');
    assert.equal(sessionStopOf({ status: 401, code: 'invalid_token' }), 'revoked');
    assert.equal(sessionStopOf({ status: 403, code: 'subscription_inactive' }), 'locked');
    assert.equal(sessionStopOf({ status: 403, code: 'forbidden' }), null);
    assert.equal(sessionStopOf({ status: 401, code: 'invalid_credentials' }), null);
    assert.equal(sessionStopOf({ status: 500, code: 'revoked' }), null);

    const flush = fn(staff, 'export async function flushQueue', 'export async function queueLength');
    const stop = flush.indexOf('if (sessionStopOf({ status, code })) {');
    assert.ok(stop > 0 && stop < flush.indexOf("fateOf({ status }) === 'permanent'"),
        'durdurma kalıcı-düşürme kararından ÖNCE');
    assert.match(flush.slice(stop, stop + 200), /job\.lastError = code;\s*halted = true;\s*kept\.push\(job\);\s*continue;/);
    // Yazma anında da: oturum durduysa iş atılmıyor, kuyruğa giriyor.
    const write = fn(staff, 'async function write(', 'async function dropSuperseded');
    assert.match(write, /if \(!stopped && fateOf\(\{ status \}\) === 'permanent'\) throw e;/);
});

// ── 5 · P1 · Face ID'siz açılış ─────────────────────────────────────────────

test('5 · canlıda prepareFallback var; stub\'a düşmüyor', () => {
    assert.match(auth, /resume: \{ get: resumeSession, prepareFallback: prepareResumeFallback, signOut \}/);
    assert.match(session, /resume: \{ \.\.\.authStub\.resume, \.\.\.live\.resume \}/);
    const fb = fn(auth, 'async function prepareResumeFallback', 'async function signOut');
    // Müdür: oturum duruyorsa kabuğa gidecek oturum dönüyor.
    assert.match(fb, /supabase\.auth\.getSession\(\)/);
    assert.match(fb, /session: sessionOf\(stored\.profile, stored\.biometricEnabled\)/);
    // Personel: bağlı değilse eşleştirme, bağlıysa PIN (bekleyen kişi yazılıyor).
    assert.match(fb, /if \(!\(await tokens\.device\(\)\)\) return fail\('not_paired'\);/);
    assert.match(fb, /writePending\(\{/);
    // Ekran: oturum geldiyse doğrudan kabuk.
    const open = fn(resume, 'const openFallback', 'useEffect(');
    assert.match(open, /if \(ready\) \{\s*enterApp\(ready\);\s*return;\s*\}/);
});

test('5 · canlıda stub\'a düşen başka uç kalmadı (staff.owner kapıyla korunuyor)', () => {
    // Stub yüzeyindeki her grup anahtarı canlıda da olmalı — `staff.owner`
    // hariç: `pair.tsx` onu yalnız `!LIVE_AUTH`ta çağırıyor.
    const groups = ['manager', 'staff', 'biometric', 'account', 'signup', 'social', 'team'];
    assert.match(auth, /subscription: \{ locked: lockedDoor \}/);
    const keysOf = (src, start, group) => {
        const body = fn(src, start);
        const at = body.search(new RegExp(`\\n\\s{4}${group}: \\{`));
        assert.ok(at >= 0, `${group} grubu yok`);
        const block = body.slice(at, body.indexOf('\n    },', at));
        return [...block.matchAll(/^\s{8}([a-zA-Z]+)[:,]/gm)].map((m) => m[1]);
    };
    for (const group of groups) {
        const live = new Set(keysOf(auth, 'export const auth = {', group));
        // Tek satırlık gruplar (`resume`, `subscription`) aşağıda ayrı.
        if (group === 'resume' || group === 'subscription') continue;
        for (const key of keysOf(stub, 'export const authStub', group)) {
            if (group === 'staff' && key === 'owner') continue;
            assert.ok(live.has(key), `${group}.${key} canlıda yok — stub'a düşer`);
        }
    }
    assert.match(code(read('mobile/app/(auth)/staff/pair.tsx')), /if \(LIVE_AUTH\) return null;\s*return authApi\.staff\.owner\(\);/);
});

// ── 6 · P1 · koparılmış oturum / biten abonelik ─────────────────────────────

test('6 · call() tek yerde karar veriyor: revoked → jeton silinir + PIN, abonelik → kapalı kapı', () => {
    const note = fn(staff, 'async function noteStop', '/** Kimlikli çağrı');
    assert.match(note, /sessionStopOf\(\{ status: cause\.status, code: cause\.code \}\)/);
    assert.match(note, /if \(stop === 'revoked'\) \{\s*if \(refreshStaffToken\) return;\s*await tokens\.clearStaff\(\)/);
    assert.match(note, /stopListener\?\.\(stop\);/);
    const call = fn(staff, 'async function call(', 'async function usableToken');
    assert.match(call, /catch \(cause\) \{\s*await noteStop\(cause\);\s*throw cause;/);
    // Yönlendirme kabuğun üstünde, tek dinleyicide.
    assert.match(sync, /onStaffSessionStop\(\(stop\) => \{/);
    assert.match(sync, /stop === 'locked' \? '\/\(auth\)\/locked' : '\/\(auth\)\/staff\/pin'/);
    assert.match(sync, /router\.replace\(routeForStop\(stop\)\);/);
    // PIN ekranı yalnız personelin: tek kişilik sahip oraya atılmıyor.
    assert.match(sync, /if \(stop === 'revoked' && actor !== 'staff'\) return;/);
});

test('6 · günün ekranı oturum durunca önbelleğe DÜŞMÜYOR', () => {
    const fail = fn(agendaSource, '.catch((cause: unknown) => {', '}, [dateISO, todayISO]);');
    const stop = fail.indexOf('sessionStopOf({ status: cause.status, code: cause.code })');
    assert.ok(stop > 0 && stop < fail.indexOf('AsyncStorage.getItem(AGENDA_CACHE_KEY)'),
        'durdurma kontrolü kopyaya düşmeden ÖNCE');
    assert.match(fail.slice(stop, stop + 160), /\)\) \{\s*setState\('error'\);\s*return;\s*\}/);
});

// ── 7 · P1 · müdür bildirimi seçili salona ──────────────────────────────────

test('7 · push-subscribe orgId gelirse üyeliği resolveOrg ile doğruluyor, gelmezse eski yol', () => {
    assert.match(subscribe, /import \{ resolveOrg \} from '\.\.\/_shared\/org\.ts';/);
    assert.match(subscribe, /if \(requestedOrgId\) \{\s*const resolved = await resolveOrg\(admin, userData\.user\.id, requestedOrgId\);/);
    assert.match(subscribe, /if \('error' in resolved\) return json\(\{ error: resolved\.error \}, resolved\.status\);/);
    // 1.0.1 `orgId` göndermiyor: eski davranış korunuyor.
    assert.match(subscribe, /\} else \{[\s\S]*?\.limit\(1\)[\s\S]*?orgId = member\?\.org_id \?\? null;/);
});

test('7 · telefon seçili salonu gönderiyor; işaret salonla değişiyor', () => {
    assert.match(fn(push, 'export async function syncManagerPush', 'export async function unregisterManagerPush'),
        /\.\.\.\(org \? \{ orgId: org \} : \{\}\)/);
    assert.match(fn(push, 'export async function unregisterManagerPush', 'export async function unregisterPush'),
        /action: 'unsubscribe', deviceId, \.\.\.\(org \? \{ orgId: org \} : \{\}\)/);
    assert.match(push, /staffId: managerMark\(org\)/);
    // Salon değişiminde eski salonun aboneliği o salonun kimliğiyle koparılıyor.
    const select = fn(auth, 'async function selectManagerBusiness', 'let typedEmail');
    assert.match(select, /await unregisterManagerPush\(previous\.profile\.business\.id\)/);
    assert.match(select, /void syncManagerPush\(business\.id\)/);
});

test('7 · müdür çıkışında abonelik Supabase oturumu kapanmadan ÖNCE koparılıyor', () => {
    const out = fn(auth, 'async function signOut', 'async function biometricAvailable');
    const unsub = out.indexOf('await unregisterManagerPush(stored.profile.business.id || null)');
    assert.ok(unsub > 0 && unsub < out.indexOf('supabase.auth.signOut()'));
});

// ── 8 · müdür girişinde ağ hatası ───────────────────────────────────────────

test('8 · müdür girişinde ağ hatası "şifre hatalı" DEĞİL, offline', () => {
    const start = fn(auth, 'async function managerStart', 'async function selectManagerBusiness');
    const offline = start.indexOf("if (error && isAuthRetryableFetchError(error)) return fail('offline');");
    assert.ok(offline > 0 && offline < start.indexOf("fail(locked ? 'locked' : 'invalid_credentials')"));
});
