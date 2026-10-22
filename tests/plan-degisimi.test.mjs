import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PLANS, isUpgrade, planChangeCopy } from '../src/lib/plans.ts';
import { isUpgrade as sunucuIsUpgrade } from '../supabase/functions/dodo-checkout/paket.ts';
import { decide, productPlans } from '../supabase/functions/dodo-webhook/durum.ts';
import { APP_STORE_URL } from '../src/lib/uygulamaBaglantisi.ts';

// Plan değiştirme ve paket sınırı (kullanıcı kararı 2026-10-22):
//   - Tek kişilik'te ikinci personel → ekleme yerine Ekip'e YÜKSELTME sorusu
//     (masaüstü + telefon tarayıcısı; telefon uygulamasında Apple'a uygun yol
//     ayrı iş). Onaylanırsa paket hemen değişir, ekleme sürer.
//   - Yükseltme hemen; düşürme bir sonraki fatura gününde, sahibine "bundan
//     sonraki aylarda … ücreti çekilir" denir.
//   - Personel eklenince telefon uygulamasının yolu ve bağlantısı verilir.

const oku = (yol) => readFileSync(new URL(`../${yol}`, import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 9, 22, 12);
const iso = (t) => new Date(t).toISOString();
const DAY = 86_400_000;

test('yükseltme kuralı ekranda ve sunucuda AYNI (36 kombinasyon)', () => {
    const ids = PLANS.map((p) => p.id);
    let n = 0;
    for (const a of ids) for (const ac of ['monthly', 'yearly']) for (const b of ids) for (const bc of ['monthly', 'yearly']) {
        assert.equal(isUpgrade(a, ac, b, bc), sunucuIsUpgrade(a, ac, b, bc), `${a}/${ac} → ${b}/${bc}`);
        n++;
    }
    assert.equal(n, 36);
    assert.equal(isUpgrade('baslangic', 'monthly', 'pro', 'monthly'), true);
    assert.equal(isUpgrade('pro', 'yearly', 'baslangic', 'yearly'), false);
    assert.equal(isUpgrade('pro', 'monthly', 'pro', 'yearly'), true, 'aylıktan yıllığa yükseltme');
    assert.equal(isUpgrade('pro', 'yearly', 'pro', 'monthly'), false, 'yıllıktan aylığa düşürme');
    assert.equal(isUpgrade('baslangic', 'yearly', 'pro', 'monthly'), true, 'büyük paket döneme baskın');
});

test('onay metni: ne zaman, ne kadar; düşürmede "bundan sonraki aylarda"', () => {
    const until = '2026-10-29T18:19:31Z';
    const denemede = planChangeCopy({ plan: 'baslangic', cycle: 'monthly' }, { plan: 'pro', cycle: 'monthly' }, until, true);
    assert.equal(denemede.title, 'Ekip paketine geçilsin mi?');
    assert.equal(denemede.confirmLabel, 'Ekip paketine geç');
    assert.match(denemede.description, /^Geçiş hemen olur\. Deneme sürüyor; bugün ücret alınmaz\. Deneme bittiğinde \(29 Ekim\) ₺1\.299\u00a0\/\u00a0ay çekilir\.$/);

    const odeyen = planChangeCopy({ plan: 'baslangic', cycle: 'monthly' }, { plan: 'pro', cycle: 'monthly' }, until, false);
    assert.match(odeyen.description, /kalan günlerinin farkı bugün kartınızdan çekilir; 29 Ekim tarihinden itibaren ₺1\.299\u00a0\/\u00a0ay çekilir\./);

    const dusur = planChangeCopy({ plan: 'pro', cycle: 'monthly' }, { plan: 'baslangic', cycle: 'monthly' }, until, false);
    assert.equal(dusur.description,
        'Geçiş 29 Ekim tarihinde başlar. O güne kadar Ekip paketiniz açık kalır; bundan sonraki aylarda aboneliğinizden Tek kişilik ücreti (₺799\u00a0/\u00a0ay) çekilir.');
    const yilliktan = planChangeCopy({ plan: 'pro', cycle: 'yearly' }, { plan: 'pro', cycle: 'monthly' }, null, false);
    assert.match(yilliktan.description, /^Geçiş bir sonraki fatura gününde başlar\./);
});

test('dodo-checkout · change: yükseltme hemen (denemede ücretsiz), düşürme dönem sonunda', () => {
    const fn = oku('supabase/functions/dodo-checkout/index.ts');
    const blok = fn.slice(fn.indexOf("if (body.action === 'change') {"), fn.indexOf('// ── Checkout ──'));
    assert.ok(blok.length > 500, 'change dalı yok');
    // Yalnız süren (deneme/aktif) Dodo aboneliği; aynı paket reddedilir.
    assert.match(blok, /access\.effective !== 'trial' && access\.effective !== 'active'\)\) \{\s*return json\(\{ error: 'no_subscription' \}, 404\);/);
    assert.match(blok, /return json\(\{ error: 'same_plan' \}, 400\)/);
    // Hedef paketin sınırı (Ekip → Tek kişilik, kalabalık ekip) da bakılır.
    assert.match(blok, /const limit = await staffOverLimit\(admin, orgId, plan\);/);
    assert.match(blok, /\/change-plan`/);
    // Dodo: dönem sonuna (next_billing_date) yalnız full_immediately (422, Test A).
    assert.match(blok, /proration_billing_mode: !up \? 'full_immediately'\s*: access\.effective === 'active' \? 'prorated_immediately' : 'do_not_bill',/);
    assert.match(blok, /effective_at: up \? 'immediately' : 'next_billing_date',/);
    assert.match(blok, /on_payment_failure: 'prevent_change',/);
    assert.match(blok, /metadata: \{ organization_id: orgId, plan, cycle, module: MODULE,/, 'webhook işletmeyi metadata\'dan bulur');
    assert.match(blok, /error: res\.status === 409 \? 'change_pending' : 'change_failed'/);
    // Ayna hemen: yükseltmede yeni paket (planlanan temizlenir); düşürmede
    // ödenen paket kalır, planlanan paket + gün yazılır (göç 126).
    assert.match(blok, /\? \{ plan, cycle, scheduled_plan: null, scheduled_cycle: null, scheduled_at: null \}\s*: \{ scheduled_plan: plan, scheduled_cycle: cycle, scheduled_at: shownEnd\(entRow as EntitlementRow \| null\) \}/);
    // Planlı düşürme varken başka paket: önce o iptal (Dodo yoksa 409 verir).
    assert.match(blok, /if \(entRow\?\.scheduled_plan\) \{[\s\S]{0,200}\/change-plan\/scheduled`, \{ method: 'DELETE' \}\)/);
    assert.match(blok, /return json\(\{ changed: true, when: up \? 'now' : 'next_billing' \}, 200\);/);
});

test('webhook: paket ürün kimliğinden, metadata\'dan önce (zamanlanmış düşürme erken görünmez)', () => {
    const plans = productPlans(
        JSON.stringify({ baslangic_monthly: 'pdt_tek', pro_monthly: 'pdt_ekip' }),
        JSON.stringify({ pro_monthly: 'pdt_eski_ekip' }),
        'bozuk json',
        null,
    );
    assert.deepEqual(plans.pdt_tek, { plan: 'baslangic', cycle: 'monthly' });
    assert.deepEqual(plans.pdt_eski_ekip, { plan: 'pro', cycle: 'monthly' }, 'eski haritadaki ürün de tanınır');
    const sub = {
        subscription_id: 'sub_A', status: 'active', created_at: iso(NOW - 3 * DAY), next_billing_date: iso(NOW + 27 * DAY),
        trial_period_days: 0, cancel_at_next_billing_date: false, customer: { customer_id: 'cus_1' },
        product_id: 'pdt_ekip',
        // Düşürme zamanlandı: metadata yeni paketi ERKEN söylüyor.
        metadata: { organization_id: 'org', plan: 'baslangic', cycle: 'monthly' },
    };
    const d = decide('subscription.updated', sub, iso(NOW), null, NOW, undefined, plans);
    assert.equal(d.kind, 'apply');
    assert.equal(d.patch.plan, 'pro', 'ödenen paket (ürün) görünür');
    // Harita tanımıyorsa eski davranış: metadata.
    const tanimsiz = decide('subscription.updated', { ...sub, product_id: 'pdt_yok' }, iso(NOW), null, NOW, undefined, plans);
    assert.equal(tanimsiz.patch.plan, 'baslangic');
    const index = oku('supabase/functions/dodo-webhook/index.ts');
    assert.match(index, /productPlans\(\s*await getSecret\(admin, 'DODO_PRODUCT_MAP'\),\s*await getSecret\(admin, 'DODO_PRODUCT_MAP_ONCEKI'\),\s*await getSecret\(admin, 'DODO_TEST_PRODUCT_MAP'\),\s*\)/);
});

test('Tek kişilik\'te personel: üç ekleme yolu da önce yükseltme sorar', () => {
    const hook = oku('src/hooks/useStaffLimit.ts');
    assert.match(hook, /if \(!plan \|\| plan\.maxStaff == null \|\| !ent\.ok\) return true;/,
        'paketi olmayan (kartsız deneme) ve sınırı olmayan serbest');
    // Sahip dahil sayılır (Test B, 2026-10-22); kip okunamazsa sahip ayrı.
    assert.match(hook, /const solo = orgId \? await readOrgSolo\(orgId\) : null;\s*if \(teamSize\(active, solo === true\) \+ adding <= plan\.maxStaff\) return true;/);
    assert.match(hook, /if \(!ent\.dodoManaged \|\| \(ent\.effective !== 'trial' && ent\.effective !== 'active'\)\) \{[\s\S]{0,400}return false;/,
        'hediye / askıdaki abonelik: kendi kendine değişmez, destek');
    assert.match(hook, /const when = await requestPlanChange\(orgId, 'pro', cycle\);\s*if \(when !== 'now'\) return false;/);
    assert.match(hook, /await ent\.refresh\(\);/);
    // Telefon uygulamasına girmez (Apple 3.1.1): bu kanca yalnız web'de.
    assert.doesNotMatch(oku('mobile/src/lib/managerWrite.ts'), /useStaffLimit|planChangeCopy/);

    const sayfa = oku('src/pages/StaffPage.tsx');
    assert.match(sayfa, /const openAdd  = async \(\) => \{\s*if \(!\(await ensureRoom\(\)\)\) return;/);
    const tel = oku('src/mobile/pages/MobileStaff.tsx');
    assert.match(tel, /const openAdd = async \(\) => \{\s*if \(!\(await ensureRoom\(\)\)\) return;/);
    const sihirbaz = oku('src/pages/SetupWizardPage.tsx');
    assert.match(sihirbaz, /const yeni = named\.filter\(\(t\) => !staff\.some\(\(s\) => s\.name\.trim\(\) === t\.name\.trim\(\)\)\)\.length;\s*if \(yeni > 0 && !\(await ensureRoom\(yeni\)\)\) return false;/);
    for (const s of [sayfa, tel, sihirbaz]) assert.match(s, /useStaffLimit\(staff\.filter\(\(?s\)? => s\.isActive\)\.length\)/);
});

test('Ayarlar: süren abonelikte paket ve dönem değişikliği onaylı plan değiştirme (409 değil)', () => {
    const ayar = oku('src/pages/settings/bolumler/Abonelik.tsx');
    assert.match(ayar, /const canChange = hasSub && subscription\?\.status === 'active';/);
    assert.match(ayar, /if \(!\(await confirmDialog\(planChangeCopy\(/);
    assert.match(ayar, /const pickPlan = \(planId: PlanId, c: Cycle\) => \{ if \(canChange\) void onChange\(planId, c\); else onSelect\(planId, c\); \};/);
    assert.match(ayar, /onClick=\{\(\) => pickPlan\(plan\.id, 'yearly'\)\}>Yıllığa geç/);
    assert.match(ayar, /onSelect=\{pickPlan\} cta=\{\(\) => 'Bu plana geç'\}/);
    assert.match(ayar, /\{canChange && <button[^>]*onClick=\{\(\) => void onChange\('pro', cycle\)\}>/, 'büyüyen Tek kişilik: tek düğmeyle Ekip');
    assert.match(oku('src/hooks/useBilling.ts'), /invoke\('dodo-checkout', \{ body: \{ action: 'change', plan, cycle, orgId \} \}\)/);
});

test('personel eklenince telefon uygulamasının yolu ve bağlantısı', () => {
    assert.equal(APP_STORE_URL, 'https://apps.apple.com/tr/app/luera-timeflow/id6816258771');
    const b = oku('src/lib/uygulamaBaglantisi.ts');
    assert.match(b, /\\?"Telefon bağla\\?" koduyla girer/);
    assert.match(b, /action: \{ label: 'Bağlantıyı kopyala'/);
    assert.match(oku('src/pages/StaffPage.tsx'), /else\s+\{ await addStaff\(payload\);\s+personelEklendiBildirimi\(staffWord\); \}/);
    assert.match(oku('src/pages/StaffPage.tsx'), /App Store'da <a href=\{APP_STORE_URL\}/, 'ekip kodu kartında');
    assert.match(oku('src/mobile/pages/MobileStaff.tsx'), /personelEklendiBildirimi\(\);/);
    assert.match(oku('src/pages/SetupWizardPage.tsx'), /if \(yeni > 0\) personelEklendiBildirimi\(/);
});

test('planlanan düşürme: aynada tutulur, ekranda yeni tutar ve gün, vazgeçilebilir (göç 126)', async () => {
    const plans = productPlans(JSON.stringify({ baslangic_monthly: 'pdt_tek', pro_monthly: 'pdt_ekip' }));
    const sub = {
        subscription_id: 'sub_A', status: 'active', created_at: iso(NOW - 3 * DAY), next_billing_date: iso(NOW + 7 * DAY),
        trial_period_days: 7, cancel_at_next_billing_date: false, customer: { customer_id: 'cus_1' },
        product_id: 'pdt_ekip', metadata: { organization_id: 'org', plan: 'pro', cycle: 'monthly' },
        scheduled_change: { product_id: 'pdt_tek', effective_at: iso(NOW + 7 * DAY) },
    };
    const d = decide('subscription.updated', sub, iso(NOW), null, NOW, undefined, plans);
    assert.equal(d.patch.plan, 'pro', 'yürürlüğe kadar ödenen paket');
    assert.equal(d.patch.scheduled_plan, 'baslangic');
    assert.equal(d.patch.scheduled_cycle, 'monthly');
    assert.equal(d.patch.scheduled_at, iso(NOW + 7 * DAY));
    const bitti = decide('subscription.renewed', { ...sub, product_id: 'pdt_tek', scheduled_change: null }, iso(NOW + 8 * DAY), null, NOW + 8 * DAY, undefined, plans);
    assert.equal(bitti.patch.plan, 'baslangic', 'yürürlüğe girince yeni paket');
    assert.equal(bitti.patch.scheduled_plan, null, 'planlanan temizlenir');
    const { scheduled_change: _sc, ...eski } = sub;
    assert.equal('scheduled_plan' in decide('subscription.updated', eski, iso(NOW), null, NOW, undefined, plans).patch, false,
        'alan yoksa (eski olay biçimi) dokunulmaz');

    const goc = oku('supabase/126_planlanan_paket.sql');
    for (const c of ['scheduled_plan  TEXT', 'scheduled_cycle TEXT', 'scheduled_at    TIMESTAMPTZ']) assert.ok(goc.includes(`ADD COLUMN IF NOT EXISTS ${c}`), c);

    const fn = oku('supabase/functions/dodo-checkout/index.ts');
    const vazgec = fn.slice(fn.indexOf("if (body.action === 'cancel_change') {"), fn.indexOf('// ── Checkout ──'));
    assert.match(vazgec, /\/change-plan\/scheduled`, \{ method: 'DELETE' \}\)/);
    assert.match(vazgec, /if \(!res\.ok && res\.status !== 404\)/, 'Dodo\'da zaten yoksa ayna yine temizlenir');
    assert.match(vazgec, /\.update\(\{ scheduled_plan: null, scheduled_cycle: null, scheduled_at: null,/);
    assert.match(fn, /dodo_customer_id, cancel_at_period_end, scheduled_plan'\)/);

    const bs = oku('supabase/functions/billing-status/index.ts');
    assert.match(bs, /dodo_subscription_id, scheduled_plan, scheduled_cycle, scheduled_at'\)/);
    assert.match(bs, /scheduled: row\.scheduled_plan\s*\? \{ plan: row\.scheduled_plan, cycle: row\.scheduled_cycle \|\| 'monthly', at: row\.scheduled_at \?\? null \}\s*: null,/);

    const ayar = oku('src/pages/settings/bolumler/Abonelik.tsx');
    assert.match(ayar, /const nextCharge = nextPlan \? priceOf\(nextPlan, nextCycle\) : charge;/);
    assert.match(ayar, /!periodPast && ` · ₺\$\{formatTRY\(nextCharge\)\}`/, 'tahsilat satırı o günün tutarını söyler');
    assert.match(ayar, /Planlanan değişiklik<\/span>[\s\S]{0,700}cancelChange\(\)[\s\S]{0,80}>Vazgeç<\/button>/);
    assert.match(oku('src/hooks/useBilling.ts'), /body: \{ action: 'cancel_change', orgId \}/);
});

const PGLITE_DIR = process.env.PGLITE_DIR;
test('göç 126 iki kez uygulanır, sütunlar boş başlar (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec("create table org_entitlement (organization_id uuid primary key, state text not null default 'none', plan text); insert into org_entitlement (organization_id, plan) values ('6e206ea8-2fa8-4c9e-a2d2-aba3317a3c7e', 'pro');");
    const goc = oku('supabase/126_planlanan_paket.sql');
    await db.exec(goc);
    await db.exec(goc);
    const r = (await db.query('select plan, scheduled_plan, scheduled_cycle, scheduled_at from org_entitlement')).rows[0];
    assert.deepEqual(r, { plan: 'pro', scheduled_plan: null, scheduled_cycle: null, scheduled_at: null });
    await db.close();
});
