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
    assert.match(blok, /proration_billing_mode: up && access\.effective === 'active' \? 'prorated_immediately' : 'do_not_bill',/);
    assert.match(blok, /effective_at: up \? 'immediately' : 'next_billing_date',/);
    assert.match(blok, /on_payment_failure: 'prevent_change',/);
    assert.match(blok, /metadata: \{ organization_id: orgId, plan, cycle, module: MODULE,/, 'webhook işletmeyi metadata\'dan bulur');
    assert.match(blok, /error: res\.status === 409 \? 'change_pending' : 'change_failed'/);
    // Ayna yalnız yükseltmede hemen yazılır; düşürmede ödenen paket görünmeye devam eder.
    assert.match(blok, /if \(up\) \{[\s\S]{0,400}\.update\(\{ plan, cycle, updated_at:/);
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

test('Tek kişilik\'te ikinci personel: üç ekleme yolu da önce yükseltme sorar', () => {
    const hook = oku('src/hooks/useStaffLimit.ts');
    assert.match(hook, /if \(!plan \|\| plan\.maxStaff == null \|\| !ent\.ok \|\| active \+ adding <= plan\.maxStaff\) return true;/,
        'paketi olmayan (kartsız deneme) ve sınırı olmayan serbest');
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
