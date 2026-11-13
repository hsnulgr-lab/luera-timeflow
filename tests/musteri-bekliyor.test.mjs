/**
 * "Müşteri bekliyor" Live Activity · 1.0.3 (göç 144 · 2026-11-13).
 *
 * Plan: docs/dinamik-ada-musteri-bekliyor-plan.md. Göçün davranışı
 * `tests/musteri-bekliyor-144.test.mjs`te (PGlite). Bu dosya:
 *   1. telefonun saf kararları (`arrivalActivity.ts`) — gerçekten çağrılıyor
 *   2. APNs gövdesi ve imzası (`send-live-activity/apns.ts`) — çalıştırılıyor
 *   3. göndericinin akışı (`core.ts`): ANAHTAR YOKKEN / JETON YOKKEN / HATADA
 *      "Müşterin geldi" AYNEN gidiyor; etkinlik açılan cihaza gitmiyor
 *   4. staff-api uçları (`liveActivity.ts`) — kimlik gövdeden okunmuyor
 *   5. send-push'un yeni alanı geriye uyumlu
 *   6. sözleşmeler: statik / dinamik import yok, tek giriş korumalı require,
 *      Expo Go'da sessiz, tek kişilikte yok, çıkışta jeton siliniyor
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    ARRIVAL_ACTIVITY_NAME, ARRIVAL_MAX_MS, apnsEnvironmentOf, arrivalActivityTarget, arrivalActivityUrl,
    planArrivalActivities, shouldRegisterStart, waitingOf,
} from '../mobile/src/lib/arrivalActivity.ts';
import {
    ACTIVITY_NAME, APNS_TOPIC, ATTRIBUTES_TYPE, apnsHeaders, apnsHost, apnsOutcome, arrivalUrl, endPayload,
    forgetProviderToken, signProviderToken, startPayload,
} from '../supabase/functions/send-live-activity/apns.ts';
import { handleEnd, handleStart } from '../supabase/functions/send-live-activity/core.ts';
import { parseLaRegister, registerLiveActivity, unregisterLiveActivity } from '../supabase/functions/staff-api/liveActivity.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
const mobile = (p) => code(`mobile/${p}`);

const ME = '11111111-2222-4333-8444-555555555555';
const R1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const R2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const R3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const NOW = Date.parse('2026-11-20T10:00:00Z');
const ago = (min) => new Date(NOW - min * 60_000).toISOString();

const row = (id, over = {}) => ({
    id, staff_id: ME, customer_name: 'Ayşe Yılmaz', service: 'Kesim ', start_time: '09:30', date: '2026-11-20',
    status: 'confirmed', customer_arrived_at: ago(5), arrived_at: null, service_ended_at: null, ...over,
});

// ── 1 · Telefonun saf kararları ─────────────────────────────────────────────

test('bekleyenler: yalnız benim, gelmiş, işi başlamamış, iptal değil, iki saatten genç; yalnız ilk ad', () => {
    const rows = [
        row(R1),
        row(R2, { staff_id: 'baskasi' }),
        row(R3, { arrived_at: ago(1) }),
        row('r4', { customer_arrived_at: null }),
        row('r5', { status: 'cancelled' }),
        row('r6', { customer_arrived_at: ago(121) }),
        row('r7', { service_ended_at: ago(1) }),
    ];
    const out = waitingOf(rows, ME, NOW);
    assert.deepEqual(out, [{
        reservationId: R1, dateISO: '2026-11-20',
        props: { name: 'Ayşe', service: 'Kesim', time: '09:30', arrivedAt: NOW - 5 * 60_000 },
    }]);
    assert.equal(ARRIVAL_MAX_MS, 2 * 60 * 60 * 1000);
});

const waiting = (id, min) => ({ reservationId: id, dateISO: '2026-11-20', props: { name: 'A', service: '', time: '', arrivedAt: NOW - min * 60_000 } });
const rec = (activityId, reservationId, min = 5) => ({ activityId, reservationId, arrivedAt: NOW - min * 60_000 });

test('mutabakat: liste okunmadıysa yalnız iki saati geçmiş kayıt biter; uzaktan yeni açılana dokunulmaz', () => {
    const plan = planArrivalActivities(['a1', 'eski', 'yeni'], [rec('a1', R1), rec('eski', R2, 130)], null, NOW);
    assert.deepEqual(plan, { end: ['eski'], adopt: [], start: [] });
});

test('mutabakat: işi başlayan / kalkan müşterinin etkinliği biter; aynı randevuya ikinci kayıt biter', () => {
    const plan = planArrivalActivities(['a1', 'a2', 'a3'], [rec('a1', R1), rec('a2', R2), rec('a3', R1)], [waiting(R1, 5)], NOW);
    assert.deepEqual(plan, { end: ['a2', 'a3'], adopt: [], start: [] });
});

test('mutabakat: tek bilinmeyen + tek eşlenmemiş bekleyen → eşlenir (içerik yeniden yazılacak)', () => {
    const plan = planArrivalActivities(['a1', 'uzak'], [rec('a1', R1)], [waiting(R1, 9), waiting(R2, 2)], NOW);
    assert.deepEqual(plan.end, []);
    assert.deepEqual(plan.adopt, [{ activityId: 'uzak', waiting: waiting(R2, 2) }]);
    assert.deepEqual(plan.start, []);
});

test('mutabakat: belirsizse bilinmeyenler biter, yerine en son gelenler (en çok bilinmeyen kadar) yerel açılır', () => {
    const plan = planArrivalActivities(['u1', 'u2'], [], [waiting(R1, 9), waiting(R2, 2), waiting(R3, 30)], NOW);
    assert.deepEqual(plan.end, ['u1', 'u2']);
    assert.deepEqual(plan.start.map((w) => w.reservationId), [R2, R1]);
    // Kimse beklemiyorsa bilinmeyenler biter, hiçbir şey açılmaz.
    assert.deepEqual(planArrivalActivities(['u1'], [], [], NOW), { end: ['u1'], adopt: [], start: [] });
});

test('mutabakat: bilinmeyen yokken telefon kendiliğinden AÇMAZ (kullanıcının kapattığı geri gelmesin)', () => {
    assert.deepEqual(planArrivalActivities([], [], [waiting(R1, 1)], NOW), { end: [], adopt: [], start: [] });
});

test('bağlantı: telefon ve sunucu aynı adresi yazıyor; dokununca o işin kumandası (personel)', () => {
    assert.equal(arrivalActivityUrl(R1, '2026-11-20'), arrivalUrl(R1, '2026-11-20'));
    assert.equal(arrivalUrl(R1, 'bozuk'), `luera://bekliyor?id=${R1}`);
    assert.deepEqual(arrivalActivityTarget(arrivalUrl(R1, '2026-11-20')), {
        href: `/kumanda?id=${R1}&date=2026-11-20`, actor: 'staff', id: R1,
    });
    assert.equal(arrivalActivityTarget('luera://bekliyor?id=uydurma'), null);
    assert.equal(arrivalActivityTarget('luera://bekleme?id=' + R1), null);
    assert.equal(arrivalActivityTarget(null), null);
});

test('ad ve ortam: telefon, görünüm ve sunucu aynı etkinlik adını kullanıyor', () => {
    assert.equal(ARRIVAL_ACTIVITY_NAME, 'MusteriBekliyor');
    assert.equal(ACTIVITY_NAME, ARRIVAL_ACTIVITY_NAME);
    assert.match(read('mobile/src/lib/arrivalActivityView.tsx'), /createLiveActivity<ArrivalActivityProps>\('MusteriBekliyor', MusteriBekliyor\)/);
    assert.equal(apnsEnvironmentOf(true), 'sandbox');
    assert.equal(apnsEnvironmentOf(false), 'production');
});

test('başlatma jetonu: değişince, kişi değişince ya da haftada bir yeniden yazılır; yoksa hiç', () => {
    const last = { token: 'aa', staffId: ME, at: NOW };
    assert.equal(shouldRegisterStart({ token: null, staffId: ME, last, now: NOW }), false);
    assert.equal(shouldRegisterStart({ token: 'aa', staffId: null, last, now: NOW }), false);
    assert.equal(shouldRegisterStart({ token: 'aa', staffId: ME, last, now: NOW + 1000 }), false);
    assert.equal(shouldRegisterStart({ token: 'bb', staffId: ME, last, now: NOW }), true);
    assert.equal(shouldRegisterStart({ token: 'aa', staffId: 'baska', last, now: NOW }), true);
    assert.equal(shouldRegisterStart({ token: 'aa', staffId: ME, last, now: NOW + 8 * 86_400_000 }), true);
});

// ── 2 · APNs gövdesi ve imzası ──────────────────────────────────────────────

test('başlatma gövdesi: expo-widgets sarmalayıcısı, attributes-type, attributes, alert ZORUNLU', () => {
    const props = { name: 'Ayşe', service: 'Kesim', time: '14:30', arrivedAt: NOW - 60_000 };
    const body = startPayload({ props, reservationId: R1, dateISO: '2026-11-20', nowMs: NOW });
    const aps = body.aps;
    assert.equal(aps.event, 'start');
    assert.equal(aps.timestamp, Math.floor(NOW / 1000));
    assert.equal(aps['attributes-type'], 'LiveActivityAttributes');
    assert.equal(ATTRIBUTES_TYPE, 'LiveActivityAttributes');
    assert.deepEqual(aps.attributes, { url: `luera://bekliyor?id=${R1}&date=2026-11-20` });
    // content-state bizim alanlarımız DEĞİL: { name, props: '<JSON metni>' }.
    assert.deepEqual(Object.keys(aps['content-state']).sort(), ['name', 'props']);
    assert.equal(aps['content-state'].name, 'MusteriBekliyor');
    assert.equal(typeof aps['content-state'].props, 'string');
    assert.deepEqual(JSON.parse(aps['content-state'].props), props);
    assert.deepEqual(aps.alert, { title: 'Müşterin geldi', body: 'Ayşe · Kesim · 14:30' });
    assert.doesNotMatch(JSON.stringify(aps.alert), /\p{Extended_Pictographic}/u);
    assert.equal(aps['stale-date'], Math.floor((props.arrivedAt + 45 * 60_000) / 1000));
    assert.equal(aps['input-push-token'], 1);
});

test('expo-widgets\'in Swift tipi gerçekten bu biçimde (kurulu kaynak)', () => {
    const swift = read('mobile/node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift');
    assert.match(swift, /struct LiveActivityAttributes: ActivityAttributes \{\s*[\s\S]*?var url: String\?/);
    assert.match(swift, /public struct ContentState: Codable, Hashable \{\s*var name: String\s*var props: String\?/);
    const factory = read('mobile/node_modules/expo-widgets/ios/LiveActivityFactory.swift');
    // Fabrika etkinlikleri `content.state.name` ile süzüyor: ad tutmazsa telefon onu hiç görmez.
    assert.match(factory, /\.filter \{ \$0\.content\.state\.name == name \}/);
    const module = read('mobile/node_modules/expo-widgets/ios/WidgetsModule.swift');
    assert.match(module, /let pushNotificationsEnabledKey: String = "ExpoWidgets_EnablePushNotifications"/);
    assert.match(module, /#available\(iOS 17\.2, \*\)/);
});

test('bitirme gövdesi: hemen kalkıyor; başlıklar liveactivity + doğru konu', () => {
    const body = endPayload(NOW);
    assert.equal(body.aps.event, 'end');
    assert.equal(body.aps['dismissal-date'], Math.floor(NOW / 1000));
    assert.equal(body.aps['content-state'].name, 'MusteriBekliyor');
    const h = apnsHeaders('JWT', 'start');
    assert.equal(h.authorization, 'bearer JWT');
    assert.equal(h['apns-push-type'], 'liveactivity');
    assert.equal(h['apns-topic'], 'ai.luera.timeflow.push-type.liveactivity');
    assert.equal(APNS_TOPIC, `${JSON.parse(read('mobile/app.json')).expo.ios.bundleIdentifier}.push-type.liveactivity`);
    assert.equal(h['apns-priority'], '10');
    assert.equal(apnsHeaders('JWT', 'end')['apns-priority'], '5');
    assert.equal(apnsHost('production'), 'https://api.push.apple.com');
    assert.equal(apnsHost('sandbox'), 'https://api.sandbox.push.apple.com');
});

test('APNs cevabı: 410 ve BadDeviceToken satır sildirir; anahtar/sunucu hatası sildirmez', () => {
    assert.equal(apnsOutcome(200, ''), 'ok');
    assert.equal(apnsOutcome(410, 'Unregistered'), 'dead');
    assert.equal(apnsOutcome(400, 'BadDeviceToken'), 'dead');
    assert.equal(apnsOutcome(403, 'InvalidProviderToken'), 'error');
    assert.equal(apnsOutcome(429, 'TooManyRequests'), 'error');
    assert.equal(apnsOutcome(500, ''), 'error');
});

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });

test('sağlayıcı jetonu: ES256, kid + iss, imza açık anahtarla doğrulanıyor; kaçışlı PEM de okunuyor', async () => {
    const jwt = await signProviderToken({ keyPem: PEM.replace(/\n/g, '\\n'), keyId: 'ABC123DEFG', teamId: '5MYM3Z5C9R', nowMs: NOW });
    const [h, c, s] = jwt.split('.');
    const dec = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
    assert.deepEqual(dec(h), { alg: 'ES256', kid: 'ABC123DEFG' });
    assert.deepEqual(dec(c), { iss: '5MYM3Z5C9R', iat: Math.floor(NOW / 1000) });
    const sig = Buffer.from(s, 'base64url');
    assert.equal(sig.length, 64);
    const ok = createVerify('SHA256').update(`${h}.${c}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
    assert.ok(ok, 'imza doğrulanmadı');
});

// ── 3 · Göndericinin akışı ──────────────────────────────────────────────────

/** Bellekte tablo; supabase-js'in kullandığımız zinciri. */
function fakeAdmin(tables) {
    const from = (name) => {
        const rows = (tables[name] ??= []);
        const filters = [];
        let op = 'select';
        let patch = null;
        const match = (r) => filters.every((f) => f(r));
        const q = {
            select() { return q; },
            eq(k, v) { filters.push((r) => r[k] === v); return q; },
            in(k, vs) { filters.push((r) => vs.includes(r[k])); return q; },
            lt(k, v) { filters.push((r) => r[k] < v); return q; },
            delete() { op = 'delete'; return q; },
            update(p) { op = 'update'; patch = p; return q; },
            insert(r) { rows.push({ id: `id-${rows.length + 1}-${Math.random()}`, ...r }); return Promise.resolve({ error: null }); },
            maybeSingle() { return Promise.resolve({ data: rows.find(match) ?? null, error: null }); },
            then(res, rej) {
                let out;
                if (op === 'delete') {
                    const keep = rows.filter((r) => !match(r));
                    rows.length = 0; rows.push(...keep);
                    out = { error: null };
                } else if (op === 'update') {
                    rows.filter(match).forEach((r) => Object.assign(r, patch));
                    out = { error: null };
                } else out = { data: rows.filter(match), error: null };
                return Promise.resolve(out).then(res, rej);
            },
        };
        return q;
    };
    return { from };
}

const FALLBACK = {
    organization_id: 'org', target: { staffId: ME },
    payload: { title: 'Müşterin geldi 👋', body: 'Ayşe · Kesim · 14:30', url: '/personel?date=2026-11-20', tag: `arrived-${R1}` },
};
const START = {
    organization_id: 'org', staff_id: ME, reservation_id: R1, date: '2026-11-20',
    customer: 'Ayşe', service: 'Kesim', time: '14:30', arrived_at: ago(1), fallback: FALLBACK,
};
const token = (c) => c.repeat(64);

function deps({ tables = {}, key = true, apns = () => ({ status: 200 }), throws = false } = {}) {
    const forwarded = [];
    const calls = [];
    const secrets = key ? { APNS_KEY: PEM, APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: '5MYM3Z5C9R' } : {};
    const admin = fakeAdmin(tables);
    return {
        forwarded, calls, tables,
        d: {
            admin,
            secret: async (k) => secrets[k] ?? null,
            now: () => NOW,
            forwardPush: async (b) => { forwarded.push(b); },
            fetch: async (url, init) => {
                calls.push({ url, init });
                if (throws) throw new Error('ağ yok');
                const { status, reason } = apns(url);
                return { status, json: async () => (reason ? { reason } : {}) };
            },
        },
    };
}
const startRow = (id, device, env = 'sandbox', c = 'a') => ({
    id, organization_id: 'org', staff_id: ME, kind: 'start', device_id: device, token: token(c), environment: env,
});

test('ANAHTAR YOK: etkinlik denenmiyor, "Müşterin geldi" BİREBİR gidiyor', async () => {
    forgetProviderToken();
    const t = deps({ key: false, tables: { live_activity_tokens: [startRow('s1', 'cihaz-1')] } });
    const out = await handleStart(t.d, START);
    assert.equal(out.note, 'no_apns_key');
    assert.equal(t.calls.length, 0);
    assert.deepEqual(t.forwarded, [FALLBACK]);
});

test('JETON YOK: bildirim BİREBİR gidiyor', async () => {
    const t = deps({ tables: { live_activity_tokens: [] } });
    assert.equal((await handleStart(t.d, START)).note, 'no_tokens');
    assert.deepEqual(t.forwarded, [FALLBACK]);
});

test('etkinlik açılan cihaza bildirim GİTMEZ; açılamayana gider; ölü jeton silinir', async () => {
    forgetProviderToken();
    const t = deps({
        tables: { live_activity_tokens: [startRow('s1', 'cihaz-1', 'sandbox', 'a'), startRow('s2', 'cihaz-2', 'production', 'b'), startRow('s3', 'cihaz-3', 'production', 'c')] },
        apns: (url) => (url.includes(token('b')) ? { status: 410, reason: 'Unregistered' }
            : url.includes(token('c')) ? { status: 500 } : { status: 200 }),
    });
    const out = await handleStart(t.d, START);
    assert.equal(out.started, 1);
    assert.deepEqual(t.forwarded, [{ ...FALLBACK, excludeDeviceIds: ['cihaz-1'] }]);
    assert.deepEqual(t.tables.live_activity_tokens.map((r) => r.id), ['s1', 's3']);
    // İtmeler paralel: sıra sabit değil, cihaz-1'inki adresinden bulunuyor.
    const first = t.calls.find((c) => c.url.includes(token('a')));
    assert.equal(first.url, `https://api.sandbox.push.apple.com/3/device/${token('a')}`);
    assert.equal(first.init.method, 'POST');
    assert.equal(first.init.headers['apns-push-type'], 'liveactivity');
    assert.equal(JSON.parse(first.init.body).aps.event, 'start');
});

test('ortam tahmini tutmazsa (BadDeviceToken) öteki ortam denenir, tutarsa satır düzeltilir', async () => {
    forgetProviderToken();
    const t = deps({
        tables: { live_activity_tokens: [startRow('s1', 'cihaz-1', 'sandbox', 'a')] },
        apns: (url) => (url.startsWith('https://api.sandbox') ? { status: 400, reason: 'BadDeviceToken' } : { status: 200 }),
    });
    assert.equal((await handleStart(t.d, START)).started, 1);
    assert.equal(t.tables.live_activity_tokens[0].environment, 'production');
    assert.deepEqual(t.forwarded[0].excludeDeviceIds, ['cihaz-1']);
});

test('ağ hatası: kimse atlanmıyor, bildirim herkese', async () => {
    forgetProviderToken();
    const t = deps({ throws: true, tables: { live_activity_tokens: [startRow('s1', 'cihaz-1')] } });
    assert.equal((await handleStart(t.d, START)).started, 0);
    assert.deepEqual(t.forwarded, [FALLBACK]);
    assert.equal(t.tables.live_activity_tokens.length, 1);
});

test('bitir: randevunun etkinlik jetonlarına "end", gönderilen ve ölü satırlar silinir, geçici hatada kalır', async () => {
    forgetProviderToken();
    const upd = (id, c, res = R1) => ({ id, organization_id: 'org', kind: 'update', reservation_id: res, device_id: 'cihaz-1', token: token(c), environment: 'production' });
    const t = deps({
        tables: { live_activity_tokens: [upd('u1', 'a'), upd('u2', 'b'), upd('u3', 'c'), upd('u4', 'd', R2)] },
        apns: (url) => (url.includes(token('b')) ? { status: 410 } : url.includes(token('c')) ? { status: 503 } : { status: 200 }),
    });
    const out = await handleEnd(t.d, { organization_id: 'org', reservation_id: R1 });
    assert.equal(out.ended, 1);
    assert.equal(t.calls.length, 3);
    assert.equal(JSON.parse(t.calls[0].init.body).aps.event, 'end');
    assert.deepEqual(t.tables.live_activity_tokens.map((r) => r.id), ['u3', 'u4']);
});

// ── 4 · staff-api uçları ────────────────────────────────────────────────────

test('la.register gövdesi doğrulanıyor', () => {
    const base = { kind: 'start', token: 'AB'.repeat(40), deviceId: 'cihaz-123', environment: 'sandbox' };
    assert.deepEqual(parseLaRegister(base), { ...base, token: 'ab'.repeat(40), reservationId: null, activityId: null });
    assert.deepEqual(parseLaRegister({ ...base, kind: 'x' }), { error: 'invalid_kind' });
    assert.deepEqual(parseLaRegister({ ...base, token: 'ExponentPushToken[x]' }), { error: 'invalid_la_token' });
    assert.deepEqual(parseLaRegister({ ...base, deviceId: 'k' }), { error: 'invalid_device_id' });
    assert.deepEqual(parseLaRegister({ ...base, environment: 'canli' }), { error: 'invalid_environment' });
    assert.deepEqual(parseLaRegister({ ...base, kind: 'update' }), { error: 'invalid_reservation' });
    assert.deepEqual(parseLaRegister({ ...base, kind: 'update', reservationId: R1 }), { error: 'invalid_activity' });
    // Gövdedeki kimlik alanları hiç okunmuyor.
    const withIds = parseLaRegister({ ...base, staffId: 'baska', organizationId: 'baska' });
    assert.equal('staffId' in withIds || 'organizationId' in withIds, false);
});

test('la.register: kişi ve işletme `me`den; başkasının randevusuna etkinlik jetonu bağlanamaz', async () => {
    const tables = {
        reservations: [{ id: R1, organization_id: 'org', staff_id: ME }, { id: R2, organization_id: 'org', staff_id: 'baska' }],
        live_activity_tokens: [
            { id: 'eski', organization_id: 'org', device_id: 'cihaz-123', kind: 'start', token: 'ff'.repeat(40) },
            { id: 'baska-org', organization_id: 'org2', device_id: 'x', kind: 'start', token: 'ab'.repeat(40) },
        ],
    };
    const admin = fakeAdmin(tables);
    const me = { id: ME, organization_id: 'org' };
    const start = parseLaRegister({ kind: 'start', token: 'ab'.repeat(40), deviceId: 'cihaz-123', environment: 'sandbox' });
    assert.deepEqual(await registerLiveActivity(admin, me, start, NOW), { ok: true });
    // Aynı cihazın eskisi ve aynı jetonun başka işletmedeki kalıntısı gitti.
    assert.deepEqual(tables.live_activity_tokens.map((r) => [r.organization_id, r.staff_id, r.kind, r.token]),
        [['org', ME, 'start', 'ab'.repeat(40)]]);

    const foreign = parseLaRegister({ kind: 'update', token: 'cd'.repeat(40), deviceId: 'cihaz-123', environment: 'sandbox', reservationId: R2, activityId: 'e1' });
    assert.deepEqual(await registerLiveActivity(admin, me, foreign, NOW), { error: 'invalid_reservation', status: 400 });
    const mine = parseLaRegister({ kind: 'update', token: 'cd'.repeat(40), deviceId: 'cihaz-123', environment: 'sandbox', reservationId: R1, activityId: 'e1' });
    assert.deepEqual(await registerLiveActivity(admin, me, mine, NOW), { ok: true });
    assert.equal(tables.live_activity_tokens.filter((r) => r.kind === 'update').length, 1);

    assert.deepEqual(await unregisterLiveActivity(admin, 'org', { deviceId: 'cihaz-123' }), { ok: true });
    assert.equal(tables.live_activity_tokens.length, 0);
});

test('staff-api: la.unregister personel kapısının ÖNÜNDE (cihaz token\'ı geçer), la.register arkasında; telefon koparma jetonları siliyor', () => {
    const api = code('supabase/functions/staff-api/index.ts');
    const unreg = api.indexOf("if (action === 'la.unregister')");
    const gateLine = api.indexOf("if (isDevice) return json({ error: 'staff_token_required' }, 403);");
    const reg = api.indexOf("if (action === 'la.register')");
    assert.ok(unreg > 0 && unreg < gateLine && gateLine < reg);
    assert.match(api, /unregisterLiveActivity\(admin, claims\.org, body\)/);
    assert.match(api, /registerLiveActivity\(admin, me, input\)/);
    const cut = api.slice(api.indexOf("if (action === 'staff.devices.cut')"), api.indexOf("if (action === 'solo.session')"));
    assert.match(cut, /\.from\('live_activity_tokens'\)\s*\.delete\(\)\s*\.eq\('organization_id', owner\.orgId\)\s*\.eq\('staff_id', staffId\)/);
});

// ── 5 · send-push geriye uyumlu ─────────────────────────────────────────────

test('send-push: excludeDeviceIds yalnız verilince ve yalnız Expo satırlarında; eski çağıranlar aynen', () => {
    const push = code('supabase/functions/send-push/index.ts');
    assert.match(push, /const \{ organization_id, target, payload, pref, excludeDeviceIds \} = await req\.json\(\);/);
    assert.match(push, /\.select\('id, kind, endpoint, p256dh, auth, device_id'\)/);
    assert.match(push, /const skip = new Set\(Array\.isArray\(excludeDeviceIds\)/);
    assert.match(push, /filter\(\(s\) => !\(s\.kind === 'expo' && s\.device_id && skip\.has\(s\.device_id\)\)\)/);
    // Yanıtın eski alanları duruyor.
    assert.match(push, /sent, pruned: dead\.length, total: rows\.length,/);
    const lsa = code('supabase/functions/send-live-activity/index.ts');
    assert.match(lsa, /req\.headers\.get\('x-push-secret'\) !== pushSecret/);
    assert.match(lsa, /\/functions\/v1\/send-push/);
    assert.match(read('supabase/config.toml'), /\[functions\.send-live-activity\]\nverify_jwt = false/);
    // Anahtar app_secrets'ten; depoda anahtar YOK.
    assert.match(code('supabase/functions/send-live-activity/core.ts'), /deps\.secret\('APNS_KEY'\), deps\.secret\('APNS_KEY_ID'\), deps\.secret\('APNS_TEAM_ID'\)/);
});

// ── 6 · Sözleşmeler ─────────────────────────────────────────────────────────

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
}
const mobileRoot = new URL('../mobile/', import.meta.url).pathname;
const sources = [...walk(join(mobileRoot, 'app')), ...walk(join(mobileRoot, 'src'))]
    .map((file) => ({ file: file.slice(mobileRoot.length), text: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') }));
const VIEWS = new Set(['src/lib/waitActivityView.tsx', 'src/lib/arrivalActivityView.tsx']);

test('dinamik import YOK; expo-widgets / @expo/ui yalnız iki görünüm dosyasında değer olarak', () => {
    for (const { file, text } of sources) {
        assert.doesNotMatch(text, /\bimport\s*\(/, file);
        if (VIEWS.has(file)) continue;
        assert.doesNotMatch(text, /import\s+(?!type\b)[^;]*from\s+'(expo-widgets|@expo\/ui[^']*)'/, file);
        assert.doesNotMatch(text, /export\s+[^;]*from\s+'(expo-widgets|@expo\/ui[^']*)'/, file);
        assert.doesNotMatch(text, /from\s+'[^']*arrivalActivityView'/, file);
    }
});

test('cihaz dosyası: iOS + yerel modül kapısı, tek korumalı eşzamanlı require, hata kullanıcıya düşmüyor', () => {
    const device = mobile('src/lib/arrivalActivityDevice.ts');
    assert.match(device, /import type \{ LiveActivity, LiveActivityFactory, PushToStartTokenEvent, PushTokenEvent \} from 'expo-widgets';/);
    assert.match(device, /if \(Platform\.OS !== 'ios'\) return null;/);
    assert.match(device, /Number\.parseFloat\(String\(Platform\.Version\)\) < MIN_IOS/);
    assert.match(device, /try \{\s*if \(!requireOptionalNativeModule\('ExpoWidgets'\) \|\| !requireOptionalNativeModule\('ExpoUI'\)\) return null;[\s\S]{0,200}require\('\.\/arrivalActivityView'\)[\s\S]{0,120}\} catch/);
    assert.equal((device.match(/require\(/g) || []).length, 1);
    assert.match(device, /if \(!factory\) return Promise\.resolve\(\);/);
    assert.doesNotMatch(device, /Alert|throw /);
    // Başlatma jetonu dinleyicisi görünüm dosyasından geçiyor.
    assert.match(read('mobile/src/lib/arrivalActivityView.tsx'), /export \{ addPushToStartTokenListener \} from 'expo-widgets';/);
});

test('görünüm: widget yönergesi, yukarı sayan sistem sayacı, ilk ad, koyu kart, emoji yok', () => {
    const view = read('mobile/src/lib/arrivalActivityView.tsx');
    assert.match(view, /function MusteriBekliyor\(props: ArrivalActivityProps, environment: LiveActivityEnvironment\) \{\s*'widget';/);
    for (const region of ['banner', 'compactLeading', 'compactTrailing', 'minimal', 'expandedLeading', 'expandedTrailing', 'expandedBottom']) {
        assert.match(view, new RegExp(`\\b${region}:`), region);
    }
    assert.equal((view.match(/timerInterval=\{range\} countsDown=\{false\}/g) || []).length, 2);
    // Dar Dinamik Ada: 59:59'da duran dar sayaç (telefon bulgusu 2026-11-13).
    assert.equal((view.match(/timerInterval=\{compactRange\} countsDown=\{false\}/g) || []).length, 1);
    assert.match(view, /const compactWidest = '00:00';/);
    assert.match(view, /activityBackgroundTint\(ground\)/);
    assert.match(view, /const ground = '#120E08';/);
    assert.doesNotMatch(code('mobile/src/lib/arrivalActivityView.tsx'), /colorScheme/);
    assert.doesNotMatch(view, /customer_name|customerName/);
    assert.doesNotMatch(view, /\p{Extended_Pictographic}/u);
    assert.match(view.slice(view.indexOf("'widget';")), /const accent = /);
});

test('app.json: expo-widgets itmesi AÇIK (push-to-start), widgets[] yok, sık güncelleme kapalı', () => {
    const app = JSON.parse(read('mobile/app.json'));
    const entry = app.expo.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-widgets');
    assert.equal(entry[1].enablePushNotifications, true);
    assert.equal(entry[1].frequentUpdates, false);
    assert.equal(entry[1].widgets, undefined);
});

test('bağlantılar: açılışta kurulu; öne dönüşte başlatma jetonu yalnız personelde; Bugün mutabakatı; kumanda başlatınca bitiyor', () => {
    assert.match(mobile('app/_layout.tsx'), /import '\.\.\/src\/lib\/arrivalActivityDevice';/);
    const sync = mobile('src/lib/backgroundSync.ts');
    assert.match(sync, /else await syncPush\(await myStaffId\(\)\)\.catch\(\(\) => undefined\);\s*if \(actor !== 'manager'\) await syncArrivalStart\(await myStaffId\(\)\)\.catch\(\(\) => undefined\);/);
    const staff = mobile('app/personel/index.tsx');
    assert.match(staff, /const arrivalsKey = agendaState === 'ok' && isToday && myStaffId/);
    assert.match(staff, /void reconcileArrivalActivities\(JSON\.parse\(arrivalsKey\) as ArrivalRow\[\], myStaffId\)/);
    assert.match(mobile('src/lib/agendaSource.ts'), /staff_id: appointment\.staff_id \?\? null,/);
    assert.match(mobile('app/(staff-flow)/kumanda.tsx'), /void startVisit\(appointment\.id\)\.then[\s\S]{0,400}feedback\.warning\(\);\s*\}\);\s*void endArrivalActivity\(appointment\.id\);/);
});

test('tek kişilik kabukta yok: tek ekranı ve müdür yolu bu etkinliğe dokunmuyor', () => {
    for (const { file, text } of sources) {
        if (!/arrivalActivity(Device)?['.]/.test(text)) continue;
        assert.doesNotMatch(file, /^app\/(tek|mudur)\//, file);
    }
    // Jeton yalnız `myStaffId` (müdür / tek kişilik oturumda null) ile yazılıyor.
    assert.match(mobile('src/lib/arrivalActivityDevice.ts'), /if \(!factory \|\| !staffId\) return;/);
    // Sunucu da: tetikleyicide `NOT v_solo` (musteri-bekliyor-144.test.mjs).
});

test('kiracı sınırı: çıkışta / telefon çıkarılırken jetonlar personel token\'ı ve cihaz kimliği silinmeden siliniyor', () => {
    const device = mobile('src/lib/arrivalActivityDevice.ts');
    assert.match(device, /onTenantReset\(\(\) => \{ void endAllArrivalActivities\(\); \}\);/);
    assert.match(device, /\.end\('immediate'\)/);
    const auth = mobile('src/api/auth.ts');
    assert.equal((auth.match(/await unregisterArrivalTokens\(\);/g) || []).length, 3);
    assert.match(auth, /await unregisterArrivalTokens\(\);\s*forgetIntent\(\);\s*await forgetDeviceId\(\);/);
    assert.match(auth, /await unregisterPush\(\)\.catch\(\(\) => undefined\);\s*await unregisterArrivalTokens\(\);\s*forgetIntent\(\);\s*await resetTenant\(\);/);
});

test('+native-intent: bekleme ve müşteri bekliyor bağlantıları; ötekiler dokunulmadan geçiyor', () => {
    const intent = mobile('app/+native-intent.tsx');
    assert.match(intent, /const target = waitActivityTarget\(path\) \?\? arrivalActivityTarget\(path\);\s*if \(!target\) return path;/);
    assert.match(intent, /waitTapMove\(kumandaOnTopId\(\), target\.id\)/);
});
