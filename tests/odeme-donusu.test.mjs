import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { legacyRedirect, legacyTabTarget } from '../src/pages/settings/ayarlarModel.ts';
import { CORE_STEPS, coreSetupDone, nextCoreStep, setupProgress } from '../src/lib/setupProgress.ts';

// Dodo'dan dönüş (Test 1, 2026-10-22): Ayarlar'dan Tek kişilik alan yeni
// salon onaysız biçimde Kurulum'un 1. adımına düştü. Kullanıcı kararı:
// kurulum yapıldıysa ANA SAYFA, yapılmadıysa KURULUM — ne olduğu kısa bir
// bildirimle. Dönüş ödeme duvarına gelir: abonelik webhook'la gelene kadar
// "Ödemeniz işleniyor", gelince yönlenir. E-posta kipi kendi fişinde kalır.
// Ayrıca: /settings?tab=billing&checkout=success yönlenirken checkout=success
// düşüyordu (Ayarlar'a dönen salon ne bildirim görüyor ne yoklanıyordu).

const oku = (yol) => readFileSync(new URL(`../${yol}`, import.meta.url), 'utf8');

const BITMIS = {
    sector: 'kuafor', businessName: 'Salon Ayşe', address: 'Kadıköy', phone: '',
    openDays: 6, serviceCount: 4,
    resourceCount: 0, resourcesApply: true, staffCount: 0, soloDeclared: false, whatsappConnected: false,
};

test('kurulum "yapıldı": zorunlu adımlar; atlanabilirler (kaynak, ekip, WhatsApp) sayılmaz', () => {
    assert.deepEqual([...CORE_STEPS], ['welcome', 'sector', 'identity', 'hours', 'services']);
    assert.equal(coreSetupDone(BITMIS), true, 'kaynak/ekip/WhatsApp atlanmış ama kurulum yapılmış');
    assert.equal(setupProgress(BITMIS).complete, false, 'şerit atlananları yine hatırlatır');
    assert.equal(coreSetupDone({ ...BITMIS, sector: 'genel' }), false);
    // Test B (2026-10-22): sihirbaz Kimlik'te yalnız adı ister; adressiz,
    // telefonsuz kurulumu bitiren salon ödemeden sonra Kimlik'e düşüyordu.
    assert.equal(coreSetupDone({ ...BITMIS, address: '', phone: '' }), true, 'adres/telefon sihirbazda isteğe bağlı');
    assert.equal(setupProgress({ ...BITMIS, address: '', phone: '' }).done.includes('identity'), false, 'şerit eksik iletişimi yine hatırlatır');
    assert.equal(coreSetupDone({ ...BITMIS, businessName: ' ' }), false);
    assert.equal(nextCoreStep({ ...BITMIS, businessName: '' }), 'identity');
    assert.equal(nextCoreStep({ ...BITMIS, address: '', phone: '', serviceCount: 0 }), 'services', 'adres eksikliği kaldığı adımı öne çekmez');
    assert.equal(nextCoreStep(BITMIS), null);
    assert.equal(coreSetupDone({ ...BITMIS, openDays: 0 }), false);
    assert.equal(coreSetupDone({ ...BITMIS, serviceCount: 0 }), false);
    assert.equal(setupProgress({ ...BITMIS, openDays: 0 }).next, 'hours', 'kaldığı adım');
});

test('dodo-checkout: dönüş hep ödeme duvarına; e-posta kipi kendi ekranına', () => {
    const fn = oku('supabase/functions/dodo-checkout/index.ts');
    const i = fn.indexOf('const returnUrl = toPaywall');
    const blok = fn.slice(i, fn.indexOf(';', i));
    const yollar = [...blok.matchAll(/`\$\{appUrl\}([^`]*)`/g)].map((m) => m[1]);
    assert.deepEqual(yollar, ['/abonelik?checkout=success&kaynak=eposta', '/abonelik?checkout=success']);
    assert.doesNotMatch(fn, /kurulum\?checkout=success/, 'kurulum checkout okumuyor — oraya dönülmez');
    // İstemci yalnız e-posta kipini söyler.
    assert.match(oku('src/hooks/useBilling.ts'), /donus\?: 'abonelik'\) => \{/);
    assert.match(oku('src/pages/settings/bolumler/Abonelik.tsx'), /const onSelect = \(planId: PlanId, c: Cycle\) => \{ void startCheckout\(planId, c\); \};/);
});

test('ödeme duvarı: abonelik gelince kurulum yapıldıysa ana sayfa, yoksa kurulum; fiş yalnız e-postada', () => {
    const pw = oku('src/pages/PaywallPage.tsx');
    const yol = pw.slice(pw.indexOf('async function afterPaymentPath'), pw.indexOf('interface Kept'));
    assert.match(yol, /from\('settings'\)\.select\('sector, business_name, working_hours'\)/);
    assert.match(yol, /from\('services'\)\.select\('id', \{ count: 'exact', head: true \}\)/);
    assert.doesNotMatch(yol, /from\('organizations'\)/, 'adres/telefon karara girmez (Test B)');
    assert.match(yol, /if \(st\.error \|\| sv\.error\) return '\/';/, 'okunamazsa ana sayfa (şerit hatırlatır)');
    assert.match(yol, /const next = nextCoreStep\(\{/);
    assert.match(yol, /if \(!next\) return '\/';/);
    assert.match(yol, /return next !== 'sector' \? `\/kurulum\?adim=\$\{next\}` : '\/kurulum';/);

    // Yönlenme: e-posta kipi hariç, abonelik OKUNDUKTAN ve erişim açıldıktan sonra, bir kez.
    assert.match(pw, /if \(!returning \|\| fromEmail \|\| ent\.loading \|\| !ent\.ok \|\| !orgId \|\| routed\.current\) return;/);
    assert.match(pw, /void afterPaymentPath\(orgId\)\.then\(\(to\) => \{[\s\S]{0,400}navigate\(to, \{ replace: true \}\);/);
    assert.match(pw, /toast\.success\(trial \? 'Denemeniz başladı' : 'Ödemeniz alındı'/);
    // E-posta kipi dışında fiş yok; beklerken ya da yönlenirken bekleme ekranı.
    assert.match(pw, /if \(!ent\.ok \|\| !fromEmail\) \{/);
    assert.doesNotMatch(pw, /Kuruluma başla/, 'fişteki eski kurulum düğmesi');
});

test('eski ?tab= yönlendirmesi öteki parametreleri korur', () => {
    assert.equal(legacyRedirect('?tab=billing&checkout=success'), '/settings/abonelik?checkout=success');
    assert.equal(legacyRedirect('?checkout=success&tab=billing'), '/settings/abonelik?checkout=success');
    assert.equal(legacyRedirect('?tab=billing'), '/settings/abonelik');
    assert.equal(legacyRedirect('?tab=yok-boyle&checkout=success'), null);
    assert.equal(legacyRedirect(''), null);
    assert.equal(legacyTabTarget('billing'), '/settings/abonelik', 'eski davranış aynı');
    const kabuk = oku('src/pages/settings/AyarlarKabuk.tsx');
    assert.match(kabuk, /const legacy = legacyRedirect\(location\.search\);/);
    assert.match(oku('src/pages/settings/bolumler/Abonelik.tsx'), /params\.get\('checkout'\) === 'success'[\s\S]{0,200}pollAfterCheckout\(\)/);
});
