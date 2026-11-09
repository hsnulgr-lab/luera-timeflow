/**
 * WhatsApp çoklu işletme hazırlığı · Faz 1 (göç 139, 2026-11-08).
 *
 * K1 kimlere cevap versin · K2 yeni işletmenin varsayılanı · K3 asistan
 * ayarları arayüzü · K4 panelden gönderim sınırları · O6 numaraya bağlı DUR ·
 * O7 webhook_secret üyelere kapalı.
 *
 * Asistanın KONUŞMASI bu işte değişmez: tests/wa-asistan-kilidi ayrıca bekler.
 * Göç testi PGlite ister: PGLITE_DIR=<pglite kurulu dizin> npm test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    answerDecision, answerMode, ANSWER_MODES, DEFAULT_ANSWER_MODE, hadPriorChat, isTestNumber, messageRecords, PRIOR_MARGIN_MS,
} from '../supabase/functions/_shared/agent/audience.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PGLITE_DIR = process.env.PGLITE_DIR;

// ── K1 · Kimlere cevap versin (saf karar) ───────────────────────────────────

test('cevap modu: bilinmeyen değer varsayılana düşer (müşteri + yeni numara)', () => {
    assert.equal(DEFAULT_ANSWER_MODE, 'customers_and_new');
    assert.deepEqual([...ANSWER_MODES], ['customers_and_new', 'customers_only', 'everyone']);
    assert.equal(answerMode(undefined), 'customers_and_new');
    assert.equal(answerMode('herkes'), 'customers_and_new');
    assert.equal(answerMode('customers_only'), 'customers_only');
    assert.equal(answerMode('everyone'), 'everyone');
});

test('test numarası: yazım biçimi fark etmez', () => {
    assert.equal(isTestNumber(['05524740440'], '905524740440'), true);
    assert.equal(isTestNumber(['+90 552 474 04 40'], '905524740440'), true);
    assert.equal(isTestNumber(['905426026048'], '905524740440'), false);
    assert.equal(isTestNumber([], '905524740440'), false);
    assert.equal(isTestNumber(undefined, '905524740440'), false);
});

test('karar tablosu: 3 mod × müşteri / tanıdık / yeni / bakılmamış / test numarası', () => {
    const d = (mode, o) => answerDecision({ mode, isCustomer: false, isTestNumber: false, known: null, ...o });
    // Müşteri her modda cevap alır.
    for (const mode of ANSWER_MODES) assert.equal(d(mode, { isCustomer: true, known: true }), 'answer', mode);
    // Test numarası her modda cevap alır (sahibin öteki telefonu çoğu zaman tanıdıktır).
    for (const mode of ANSWER_MODES) assert.equal(d(mode, { isTestNumber: true, known: true }), 'answer', mode);
    // Herkes: tanıdık da cevap alır.
    assert.equal(d('everyone', { known: true }), 'answer');
    // Yalnız müşteriler: müşteri olmayan hiç kimse.
    assert.equal(d('customers_only', { known: false }), 'silent');
    assert.equal(d('customers_only', { known: null }), 'silent');
    // Müşteri + yeni numara: tanıdığa susar, yeniye cevap verir, bakılmamışsa geçmişe bakılır.
    assert.equal(d('customers_and_new', { known: true }), 'silent');
    assert.equal(d('customers_and_new', { known: false }), 'answer');
    assert.equal(d('customers_and_new', { known: null }), 'check');
});

test('Evolution geçmişi: v2, v1, Long ve metin zaman damgası okunur; bozuk biçim boş döner', () => {
    const v2 = { messages: { total: 2, records: [
        { key: { fromMe: true }, messageTimestamp: 1730000000 },
        { key: { fromMe: false }, messageTimestamp: '1731000000' },
    ] } };
    assert.deepEqual(messageRecords(v2), [{ ts: 1730000000, fromMe: true }, { ts: 1731000000, fromMe: false }]);
    assert.deepEqual(messageRecords([{ key: {}, messageTimestamp: { low: 1730000000, high: 0 } }]), [{ ts: 1730000000, fromMe: false }]);
    assert.deepEqual(messageRecords({ messages: [{ messageTimestamp: 5 }] }), [{ ts: 5, fromMe: false }]);
    for (const bad of [null, 'x', {}, { messages: 'x' }, [{ messageTimestamp: 'dün' }], [{ messageTimestamp: 0 }]]) {
        assert.deepEqual(messageRecords(bad), [], JSON.stringify(bad));
    }
});

test('önceki yazışma: ilk görülmeden 10 dk öncesi sayılır; şimdiki mesaj sayılmaz', () => {
    const firstSeen = Date.UTC(2026, 10, 8, 9, 0);
    const at = (ms) => ({ ts: Math.floor(ms / 1000), fromMe: false });
    assert.equal(PRIOR_MARGIN_MS, 10 * 60_000);
    // Yeni numara: yalnız şimdiki mesajlar.
    assert.equal(hadPriorChat([at(firstSeen - 5_000), at(firstSeen + 30_000)], firstSeen), false);
    // Arkadaş: üç gün önce yazışılmış.
    assert.equal(hadPriorChat([at(firstSeen - 3 * 86_400_000), at(firstSeen)], firstSeen), true);
    // Sınırın hemen içi/dışı.
    assert.equal(hadPriorChat([at(firstSeen - PRIOR_MARGIN_MS + 1000)], firstSeen), false);
    assert.equal(hadPriorChat([at(firstSeen - PRIOR_MARGIN_MS - 1000)], firstSeen), true);
    assert.equal(hadPriorChat([], firstSeen), false);
});

// ── K1 · Bağlantılar (kaynak denetimi) ──────────────────────────────────────

test('whatsapp-booking: kapı asistan anahtarından sonra, ajandan önce; eski bot da kapıdan geçer', () => {
    const src = read('supabase/functions/whatsapp-booking/index.ts');
    const assistantOff = src.indexOf("return ok({ skipped: 'assistant_off' })");
    const gate = src.indexOf('await audienceGate(admin, orgWa, { phone, remoteJid, isCustomer: Boolean(known?.id) })');
    const agentBlock = src.indexOf("if (featureOn(orgWa, 'agent_v2', false)) {");
    const inboundLog = src.indexOf("direction: 'in', phone, kind: 'inbound'");
    assert.ok(inboundLog > 0 && assistantOff > inboundLog, 'mesaj kapıdan önce kaydedilir');
    assert.ok(gate > assistantOff && gate < agentBlock, 'kapı: asistan anahtarı → kapı → ajan / eski bot');
    assert.match(src, /=== 'silent'\) \{\s*return ok\(\{ skipped: 'audience' \}\);/);
    // Ayar tek okumada gelir; ajan bloğu ayrıca okumaz.
    assert.match(src, /select\('organization_id, instance, status, webhook_secret, features, agent_config'\)/);
    assert.match(src, /config: \(orgWa\.agent_config \?\? null\) as AgentConfig \| null/);
});

test('sahip elle yazınca numara tanıdık olur — bizim mesajımızın yankısı sayılmaz', () => {
    const src = read('supabase/functions/whatsapp-booking/index.ts');
    const fn = src.slice(src.indexOf('async function ownerTookOver'), src.indexOf('async function resolveLid'));
    const lastSentCheck = fn.lastIndexOf('if (await sentByUs()) return;');
    const remember = fn.indexOf("await rememberContact(admin, orgId, phone, true, 'owner_typed');");
    const agentOff = fn.indexOf('if (!agentOn) return;');
    assert.ok(lastSentCheck > 0 && remember > lastSentCheck, 'önce yankı kontrolü');
    assert.ok(agentOff > remember, 'tanıdık kaydı ajan kapalıyken de');
    assert.match(fn, /paused_until/);
});

test('audienceGate: tablo ya da Evolution hatasında cevap verir (bugünkü davranış), kararı bir kez yazar', () => {
    const wa = read('supabase/functions/_shared/wa.ts');
    const fn = wa.slice(wa.indexOf('export async function audienceGate'));
    assert.match(fn, /if \(error\) return 'answer';/);
    assert.match(fn, /if \(prior === null\) return 'answer';/);
    assert.match(fn, /rememberContact\(admin, org\.organization_id, o\.phone, prior, prior \? 'prior_chat' : 'first_contact'\)/);
    // Geçmiş sorgusu zaman aşımlı ve grup sohbetine bakmaz.
    const prior = wa.slice(wa.indexOf('async function priorChat'), wa.indexOf('export async function audienceGate'));
    assert.match(prior, /chat\/findMessages\//);
    assert.match(prior, /AbortSignal\.timeout\(8000\)/);
    assert.match(prior, /!j\.includes\('@g\.us'\)/);
});

// ── O6 · DUR numaraya bağlı ─────────────────────────────────────────────────

test('DUR numaraya yazılır, BAŞLAT siler; gönderim önce numaraya bakar', () => {
    const src = read('supabase/functions/whatsapp-booking/index.ts');
    assert.match(src, /await setPhoneOptOut\(admin, orgId, phone, true\);\s*return reply\(M\.optedOut/);
    assert.match(src, /topIntent === 'optin' && \(known\?\.wa_opt_out \|\| await phoneOptedOut\(admin, orgId, phone\)\)/);
    assert.match(src, /await setPhoneOptOut\(admin, orgId, phone, false\);\s*return reply\(M\.optedIn/);
    const wa = read('supabase/functions/_shared/wa.ts');
    const fn = wa.slice(wa.indexOf('export async function isOptedOut'), wa.indexOf('export async function setPhoneOptOut'));
    assert.ok(fn.indexOf("from('wa_opt_out_phones')") < fn.indexOf("from('customers')"), 'önce numara');
    // Başka işletmenin müşteri kimliği verilirse numaradan bakılır (eskiden false dönüyordu).
    assert.match(fn, /if \(data\) return Boolean\(data\.wa_opt_out\);/);
    assert.match(fn, /findCustomerByPhone\(admin, orgId, normalizedPhone\)/);
});

// ── K4 · Panelden gönderim ──────────────────────────────────────────────────

test('proxy send: tür izin listesi panelin ve telefonun türleriyle aynı; uzunluk, kimlik, saatlik tavan', () => {
    const src = read('supabase/functions/whatsapp-proxy/index.ts');
    const allowed = [...src.match(/PANEL_KINDS[^=]*= new Set\(\[([^\]]+)\]\)/)[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort();
    const client = read('src/services/whatsapp.ts');
    const clientKinds = [...client.match(/export type WaKind =([^;]+);/)[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(allowed, clientKinds, 'panelin gönderdiği her tür izinli, fazlası yok');
    const mobile = read('mobile/src/lib/managerWrite.ts');
    for (const k of [...mobile.matchAll(/kind: '([a-z_]+)',\s*\n\s*customerId/g)].map((m) => m[1])) {
        assert.ok(allowed.includes(k), `telefon türü izinli: ${k}`);
    }
    for (const k of ['reminder_24h', 'reminder_2h', 'winback', 'booking', 'inbound', 'optout']) assert.ok(!allowed.includes(k), k);
    assert.match(src, /if \(!PANEL_KINDS\.has\(kind\)\) return json\(\{ error: 'invalid_kind' \}, 400\);/);
    assert.match(src, /if \(text\.length > MAX_TEXT\) return json\(\{ error: 'text_too_long' \}, 400\);/);
    assert.match(src, /\.eq\('id', String\(body\.customerId\)\)\.eq\('organization_id', orgId\)/);
    assert.match(src, /if \(\(count \?\? 0\) >= MANUAL_PER_HOUR\) return json\(\{ ok: false, reason: 'quota' \}, 200\);/);
    assert.doesNotMatch(src, /customerId: body\.customerId/);
});

// ── K3 · Asistan ayarları (proxy `agent`) ───────────────────────────────────

test('proxy agent: yalnız sahip; bütçe, model ve efor istemciden yazılamaz; zamanlayıcı açılınca planlanır', () => {
    const src = read('supabase/functions/whatsapp-proxy/index.ts');
    assert.match(src, /action === 'knowledge' \|\| action === 'agent'\) && role === 'member'\)/);
    const fn = src.slice(src.indexOf("if (action === 'agent') {"), src.indexOf("if (action === 'send') {"));
    for (const k of ['monthly_budget_usd', 'model', 'effort', 'consent']) {
        assert.doesNotMatch(fn, new RegExp(`cfg\\.${k}\\s*=`), `${k} yazılamaz`);
    }
    assert.match(fn, /if \(list\.length > MAX_TEST_NUMBERS\)/);
    assert.match(src, /const MAX_TEST_NUMBERS = 10;/);
    assert.match(fn, /normalizePhone\(String\(raw \?\? ''\)\)/);
    assert.match(fn, /if \(!schedulerWasOn && features\.scheduler_v2 === true\) \{\s*const \{ data: n, error: bfErr \} = await admin\.rpc\('wa_backfill_jobs', \{ p_org: orgId \}\);/);
    // Ayar Evolution gerektirmez: Evolution kontrolünden önce.
    assert.ok(src.indexOf("if (action === 'agent') {") < src.indexOf("getSecret(admin, 'EVOLUTION_API_URL')"));
});

test('Ayarlar: asistan bölümü proxy üzerinden; test mesajı elle mesaj türüyle', () => {
    const ui = read('src/pages/settings/bolumler/WhatsApp.tsx');
    // WhatsApp v2 (2026-11-10): "Gelen mesajlara kim cevap versin" tek soru;
    // akıllı asistan bayrağı proxy'nin agent eyleminden yazılır.
    assert.match(ui, /function Kimlere\(/);
    assert.match(ui, /role="radiogroup" aria-label="Kimlere cevap versin"/);
    assert.match(ui, /saveAgent\(\{ enabled: wantAi \}\)/);
    assert.match(ui, /saveAgent\(\{ scheduler: next \}\)/);
    assert.match(ui, /hatırlatma ve onaylar da bu hattan gider\.`, 'manual'\);/);
    // Ekip üyesinde proxy 403 → agent null, asistana özgü bölümler hiç çıkmaz.
    assert.match(ui, /\{resp !== 'me' && agent && \(\s*<Kimlere /);
});

// ── Göç 139 (PGlite) ────────────────────────────────────────────────────────

test('göç 139: iki kez uygulanır; yeni işletmede kampanyalar kapalı; webhook_secret üyelere kapalı (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create table organizations (id uuid primary key);
        create table org_whatsapp (
            organization_id uuid primary key references organizations(id) on delete cascade,
            instance text, status text not null default 'disconnected',
            webhook_secret uuid not null default gen_random_uuid(),
            connected_at timestamptz, last_seen_at timestamptz, last_error text,
            features jsonb not null default '{"recall":true,"review":true,"renewal":true,"winback":true,"assistant":false,"confirmation":true}'::jsonb,
            created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
            agent_config jsonb not null default '{}'::jsonb, schedule_config jsonb not null default '{}'::jsonb,
            knowledge jsonb not null default '{}'::jsonb
        );
        grant select on org_whatsapp to anon, authenticated;
        insert into organizations values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
        insert into org_whatsapp (organization_id) values ('11111111-1111-4111-8111-111111111111');
    `);
    const goc = read('supabase/139_wa_coklu_isletme.sql');
    await db.exec(goc);
    await db.exec(goc);

    // Mevcut satır olduğu gibi; yeni satır yeni varsayılanla.
    await db.exec("insert into org_whatsapp (organization_id) values ('22222222-2222-4222-8222-222222222222')");
    const rows = (await db.query('select organization_id, features from org_whatsapp order by organization_id')).rows;
    assert.equal(rows[0].features.winback, true, 'mevcut işletmeye dokunulmaz');
    assert.deepEqual(rows[1].features, {
        confirmation: true, review: false, winback: false, recall: false, renewal: false, assistant: false, scheduler_v2: true,
    });

    // Kaynak kısıtı ve birincil anahtar.
    await db.exec("insert into wa_contacts (organization_id, phone, known, source) values ('11111111-1111-4111-8111-111111111111', '905000000000', true, 'owner_typed')");
    await assert.rejects(db.exec("insert into wa_contacts (organization_id, phone, known, source) values ('11111111-1111-4111-8111-111111111111', '905000000001', true, 'tahmin')"), /check/i);
    await assert.rejects(db.exec("insert into wa_contacts (organization_id, phone, known, source) values ('11111111-1111-4111-8111-111111111111', '905000000000', false, 'first_contact')"), /duplicate|unique/i);
    await db.exec("insert into wa_opt_out_phones (organization_id, phone) values ('11111111-1111-4111-8111-111111111111', '905000000000')");

    for (const rol of ['anon', 'authenticated']) {
        await db.exec(`set role ${rol}`);
        await assert.rejects(db.query('select webhook_secret from org_whatsapp'), /permission denied/i, `${rol}: sır okunamaz`);
        await assert.rejects(db.query('select * from org_whatsapp'), /permission denied/i, `${rol}: yıldız da okunamaz`);
        await assert.rejects(db.query('select * from wa_contacts'), /permission denied/i, `${rol}: kişi kararları`);
        await assert.rejects(db.query('select * from wa_opt_out_phones'), /permission denied/i, `${rol}: DUR listesi`);
        await db.exec('reset role');
    }
    // Panelin ve telefonun okuduğu kolonlar açık (useWhatsApp, useReservations, mobil managerSource).
    await db.exec('set role authenticated');
    const ok = (await db.query('select instance, status, connected_at, last_error, features, knowledge, agent_config from org_whatsapp')).rows;
    assert.equal(ok.length, 2);
    await assert.rejects(db.query('select status from org_whatsapp').then(() => db.query('select webhook_secret, status from org_whatsapp')), /permission denied/i);
    await db.exec('reset role');
    await db.close();
});

test('göç 139: istemcilerin okuduğu her org_whatsapp kolonu izinli listede', () => {
    const goc = read('supabase/139_wa_coklu_isletme.sql');
    const granted = goc.match(/GRANT SELECT \(([^)]+)\) ON public\.org_whatsapp TO authenticated;/)[1]
        .split(',').map((s) => s.trim());
    assert.ok(!granted.includes('webhook_secret'));
    const sources = [
        read('src/hooks/useWhatsApp.ts'), read('src/hooks/useReservations.ts'), read('mobile/src/lib/managerSource.ts'),
    ].join('\n');
    // from('org_whatsapp')…select('a, b') ve useWhatsApp'taki read('a, b') kalıbı.
    const selects = [
        ...sources.matchAll(/from\('org_whatsapp'\)\s*\.select\('([^']+)'\)/g),
        ...read('src/hooks/useWhatsApp.ts').matchAll(/await read\('([^']+)'\)/g),
    ].map((m) => m[1]);
    assert.ok(selects.length >= 3, 'okuma yerleri bulundu');
    for (const s of selects) for (const col of s.split(',').map((c) => c.trim())) {
        assert.ok(granted.includes(col), `istemci kolonu izinli: ${col}`);
    }
});
