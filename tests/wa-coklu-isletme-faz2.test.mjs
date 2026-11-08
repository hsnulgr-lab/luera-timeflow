/**
 * WhatsApp çoklu işletme hazırlığı · Faz 2 (göç 140, 2026-11-08).
 *
 * O1 ayar her yerde sahibin satırından · O2 geri kazanma/çağırma süzmesi ·
 * O3 remind zaman bütçesi · O4 bildirim adresleri · O5 uyarılar.
 * Asistanın konuşması değişmez: tests/wa-asistan-kilidi ayrıca bekler.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pickOwnerRows } from '../supabase/functions/_shared/org.ts';
import { agentDownError, budgetCrossed } from '../supabase/functions/_shared/agent/guard.ts';
import { kontroller, waSaglikDurumu } from '../ops/izleme/src/kontroller.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── O1 · Ayar satırı ────────────────────────────────────────────────────────

test('pickOwnerRows: sahibin satırı, yoksa en eskisi; işletmeler karışmaz', () => {
    const rows = [
        { organization_id: 'A', user_id: 'uye', created_at: '2026-01-01T00:00:00Z', business_name: 'Üye' },
        { organization_id: 'A', user_id: 'sahip', created_at: '2026-05-01T00:00:00Z', business_name: 'Salon A' },
        { organization_id: 'B', user_id: 'x', created_at: '2026-03-01T00:00:00Z', business_name: 'Yeni' },
        { organization_id: 'B', user_id: 'y', created_at: '2026-02-01T00:00:00Z', business_name: 'Eski' },
    ];
    const m = pickOwnerRows(rows, new Map([['A', 'sahip'], ['B', 'yok']]));
    assert.equal(m.get('A').business_name, 'Salon A', 'sahip daha yeni olsa da önce');
    assert.equal(m.get('B').business_name, 'Eski', 'sahip satırı yoksa en eski');
    assert.equal(m.size, 2);
});

test('ownerSettings: işletme filtresiyle sahip, yoksa en eski', () => {
    const org = read('supabase/functions/_shared/org.ts');
    const fn = org.slice(org.indexOf('export async function ownerSettings'), org.indexOf('export function pickOwnerRows'));
    assert.match(fn, /\.eq\('organization_id', orgId\)\.eq\('user_id', owner\)\.maybeSingle\(\)/);
    assert.match(fn, /\.eq\('organization_id', orgId\)\.order\('created_at', \{ ascending: true \}\)\.limit\(1\)\.maybeSingle\(\)/);
});

test('WhatsApp ve randevu fonksiyonları ayarı yalnız ownerSettings ile okur', () => {
    for (const f of ['public-booking', 'booking-manage', 'wa-agent', 'whatsapp-booking', 'notify-waitlist', 'draft-messages', 'dodo-checkout', 'wa-scheduler']) {
        const src = read(`supabase/functions/${f}/index.ts`);
        assert.doesNotMatch(src, /from\('settings'\)/, `${f}: doğrudan settings okuması kalmadı`);
        assert.match(src, /ownerSettings\(/, `${f}: ortak okuyucu`);
    }
    const remind = read('supabase/functions/remind/index.ts');
    // Toplu okuma: sahibi bilinen satırlar pickOwnerRows ile seçilir.
    assert.match(remind, /select\('organization_id, user_id, created_at, business_name, comms, sector'\)/);
    assert.match(remind, /pickOwnerRows\(settingsRows \?\? \[\], ownerByOrg\)/);
    assert.equal((remind.match(/from\('settings'\)/g) ?? []).length, 1, 'remind: yalnız toplu okuma');
    // wa-scheduler'ın eski kopyası kalktı (işletme filtresi yoktu).
    assert.doesNotMatch(read('supabase/functions/wa-scheduler/index.ts'), /async function ownerSettings/);
});

test('panel: ekip üyesi sahibin satırını okur ve yazar; adına yeni satır açılmaz', () => {
    const src = read('src/hooks/useReservations.ts');
    assert.match(src, /const settingsUserId = \(await orgOwnerId\(resolvedOrgId\)\) \?\? user\.id;/);
    assert.match(src, /\.eq\('user_id', settingsUserId\)/);
    assert.match(src, /if \(resolvedOrgId && settingsUserId === user\.id\) \{/);
    assert.match(src, /user_id: settingsUserRef\.current \?\? user\.id,/);
    const comms = read('src/hooks/useSectorComms.ts');
    assert.match(comms, /readOwnerSettings<\{ comms: unknown \}>\(orgId, 'comms'\)/);
    assert.doesNotMatch(comms, /select\('comms'\)\.eq\('organization_id', orgId\)\.maybeSingle\(\)/);
});

test('göç 140: tetikleyici gövdeleri 076/077 ile aynı, yalnız satır seçimi değişti', () => {
    const goc = read('supabase/140_wa_ayar_sahibi.sql');
    const fn = (src, name) => {
        const i = src.indexOf(`create or replace function public.${name}()`);
        return src.slice(i, src.indexOf('\n$$;', i) + 4);
    };
    const yeniSecim = /    -- 140: sahibin satırı, yoksa en eskisi \(settings kullanıcı başına\)\.\n(    select s\.\w+ into v_\w+\n      from public\.settings s\n)      left join public\.organizations o on o\.id = s\.organization_id\n(     where s\.organization_id = new\.organization_id\n)     order by \(s\.user_id = o\.owner_id\) desc nulls last, s\.created_at asc\n(     limit 1;)/;
    for (const [dosya, ad] of [['supabase/076_service_tags_and_eligibility.sql', 'guard_reservation_eligibility'], ['supabase/077_plan_kind.sql', 'set_treatment_plan_kind']]) {
        const yeni = fn(goc, ad);
        assert.match(yeni, yeniSecim, ad);
        assert.equal(yeni.replace(yeniSecim, '$1$2$3'), fn(read(dosya), ad), `${ad}: geri kalan birebir`);
    }
    assert.match(goc, /ADD COLUMN IF NOT EXISTS campaign_run_at TIMESTAMPTZ;/);
    // 139'un kolon izni: yeni kolon istemciye açılmaz.
    assert.doesNotMatch(read('supabase/139_wa_coklu_isletme.sql'), /campaign_run_at/);
});

// ── O2 · O3 · remind ────────────────────────────────────────────────────────

test('geri kazanma: gönderilmiş ve DUR diyen sorguda elenir; geri çağırma tavanı geniş', () => {
    const src = read('supabase/functions/remind/index.ts');
    const wb = src.slice(src.indexOf('const { data: winbackList }'), src.indexOf('let budget = 15;'));
    assert.match(wb, /\.eq\('wa_opt_out', false\)/);
    assert.match(wb, /\.or\(`winback_sent_at\.is\.null,winback_sent_at\.lt\.\$\{resend90\}`\)/);
    assert.match(wb, /\.limit\(200\)/);
    const rc = src.slice(src.indexOf('const { data: recallList }'), src.indexOf('let recallBudget = 30;'));
    assert.match(rc, /\.eq\('wa_opt_out', false\)/);
    assert.match(rc, /\.limit\(1000\)/);
});

test('remind: işletmeler en uzun bekleyenden başlar, 40 sn bütçe, tur sonu işaretlenir', () => {
    const src = read('supabase/functions/remind/index.ts');
    assert.match(src, /const ORG_LOOP_BUDGET_MS = 40_000;/);
    assert.match(src, /orgList\.sort\(\(a, b\) => \(lastRun\.get\(a\.organization_id\) \?\? 0\) - \(lastRun\.get\(b\.organization_id\) \?\? 0\)\);/);
    assert.match(src, /if \(Date\.now\(\) - loopStarted > ORG_LOOP_BUDGET_MS\) \{ deferredOrgs\+\+; continue; \}/);
    assert.match(src, /update\(\{ campaign_run_at: new Date\(\)\.toISOString\(\) \}\)/);
    // 140 yoksa sıralama atlanır, çalışma durmaz.
    assert.match(src, /if \(!runErr\) \{/);
    const wa = read('supabase/functions/_shared/wa.ts');
    assert.match(wa, /message\/sendText[\s\S]{0,400}signal: AbortSignal\.timeout\(15_000\)/);
    assert.match(wa, /instance\/connectionState[\s\S]{0,200}signal: AbortSignal\.timeout\(8000\)/);
});

// ── O4 · Bildirim adresleri ─────────────────────────────────────────────────

test('devretme bildirimi numarayı taşır; masaüstünde /mesajlar ve /takvim var', () => {
    const notify = read('supabase/functions/_shared/notify.ts');
    assert.match(notify, /return `\/mesajlar\?phone=\$\{encodeURIComponent\(phone\)\}`;/);
    for (const f of ['wa-agent/index.ts', 'wa-agent/handlers.ts', 'whatsapp-booking/index.ts']) {
        const src = read(`supabase/functions/${f}`);
        assert.doesNotMatch(src, /url: '\/mesajlar'/, f);
        assert.match(src, /url: handoffUrl\(/, f);
        // Telefon uygulaması etiketten gider: etiket değişmedi.
        assert.match(src, /tag: `handoff-\$\{(ctx\.)?phone\}`/, f);
    }
    const app = read('src/App.tsx');
    assert.match(app, /<Route path="mesajlar" element=\{<MesajlarYonlendir \/>\} \/>/);
    assert.match(app, /<Route path="takvim" element=\{<TakvimYonlendir \/>\} \/>/);
    const y = read('src/pages/PushYonlendir.tsx');
    assert.match(y, /\.eq\('organization_id', orgId\)\.in\('phone', variants\)/);
    assert.match(y, /`\/customers\?open=\$\{encodeURIComponent\(hit\.id\)\}`/);
    assert.match(y, /<Navigate to=\{`\/calendar\$\{search\}`\} replace \/>/);
});

// ── O5 · Uyarılar ───────────────────────────────────────────────────────────

test('bütçe eşiği: %80 ve %100 birer kez; eşiği geçmeyen tur sessiz', () => {
    assert.equal(budgetCrossed(20.5, 1, 25), 80);
    assert.equal(budgetCrossed(25.2, 1, 25), 100);
    assert.equal(budgetCrossed(26, 4, 25), 100, 'tek turda ikisini birden geçerse 100');
    assert.equal(budgetCrossed(21, 0.5, 25), null, 'zaten %80 üstündeydi');
    assert.equal(budgetCrossed(10, 1, 25), null);
    assert.equal(budgetCrossed(30, 1, 25), null, 'zaten dolmuştu');
    assert.equal(budgetCrossed(20, 0, 25), null);
    assert.equal(budgetCrossed(20, 1, 0), null);
    const src = read('supabase/functions/wa-agent/index.ts');
    assert.match(src, /budgetCrossed\(Number\(spent\) \|\| 0, cost, Number\(cfg\.monthly_budget_usd \?\? DEFAULT_MONTHLY_BUDGET_USD\)\)/);
    assert.match(src, /tag: 'agent-budget-80'/);
    assert.match(src, /tag: 'agent-budget-100'/);
});

test('asistan çalışmıyor mu: Claude\'a ulaşamama evet, bozuk istek ve modelin kendi sonucu hayır', () => {
    for (const e of ['api_credit', 'api_401', 'api_529', 'exception']) assert.equal(agentDownError(e), e);
    for (const e of [null, '', 'api_400', 'refusal', 'max_turns']) assert.equal(agentDownError(e), null);
});

test('wa-saglik: yalnız toplam durum döner; izleme iki kontrolü on dakikada bir yapar', () => {
    const src = read('supabase/functions/wa-saglik/index.ts');
    assert.match(src, /JSON\.stringify\(\{ ok: true, evolution, agent_error: agentError \}\)/);
    assert.doesNotMatch(src, /organization_id|phone|customer/);
    assert.match(src, /req\.headers\.get\('apikey'\) !== anon/);

    const ENV = { SUPABASE_URL: 'https://sb.example', SUPABASE_ANON_KEY: 'anon', DESKTOP_URL: 'x', SITE_URL: 'y', DEMO_SLUG: 'd' };
    assert.equal(kontroller(ENV).filter((k) => k.id === 'wa-sunucu' || k.id === 'asistan').length, 0, 'WA_IZLE yoksa yok');
    const wa = kontroller({ ...ENV, WA_IZLE: '1' }).filter((k) => k.id === 'wa-sunucu' || k.id === 'asistan');
    assert.equal(wa.length, 2);
    for (const k of wa) {
        assert.equal(k.url, 'https://sb.example/functions/v1/wa-saglik');
        assert.equal(k.headers.apikey, 'anon');
        assert.equal(k.aralikDk, 10);
    }
    assert.match(read('ops/izleme/wrangler.toml'), /^WA_IZLE = "1"$/m);

    const J = (o) => JSON.stringify(o);
    assert.deepEqual(waSaglikDurumu(200, J({ evolution: true, agent_error: null }), 'evolution'), { ok: true, ayrinti: '' });
    assert.equal(waSaglikDurumu(200, J({ evolution: false }), 'evolution').ok, false);
    assert.equal(waSaglikDurumu(200, J({ evolution: null }), 'evolution').bilinmiyor, true, 'ayarlı değil');
    assert.deepEqual(waSaglikDurumu(200, J({ evolution: true, agent_error: 'api_credit' }), 'asistan'), { ok: false, ayrinti: 'Anthropic kredisi bitmiş' });
    assert.equal(waSaglikDurumu(200, J({ agent_error: null }), 'asistan').ok, true);
    assert.equal(waSaglikDurumu(404, '', 'asistan').bilinmiyor, true, 'uç yüklenmeden alarm yok');
    assert.equal(waSaglikDurumu(200, 'bozuk', 'evolution').bilinmiyor, true);
});
