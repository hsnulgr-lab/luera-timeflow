import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    kasaOnlyReason as serverKasa, packageCovered as serverCovered, packagesEnabledFor as serverEnabled,
} from '../supabase/functions/staff-api/visitItems.ts';
import {
    kasaOnlyReason as clientKasa, packageCovered as clientCovered, packagesEnabledFor as clientEnabled, ticketsOf,
} from '../mobile/src/lib/cashBuild.ts';
import {
    collectErrorLine, collectLabel, collectMethodFor, collectRetryLabel, collectedLabel, COLLECT_METHODS,
} from '../mobile/src/lib/collect.ts';
import { serviceBillOf } from '../mobile/src/lib/adisyonSade.ts';
import {
    amountProblem, defaultAmountText, parsePlanAmount, payLabel, planPaymentFailureLine, planPaymentFailureOf,
    planPaymentRow, remainingAfter, remainingLine,
} from '../mobile/src/lib/planPayment.ts';

/**
 * 1.0.1 · TEK KİŞİLİKTE PAKET TAHSİLATI TELEFONDAN (2026-10-16, telefon turu).
 *
 * Kullanıcı: "Tek kişilik işletmede bilgisayar olmayacağı için tahsilat ve
 * paket tahsilatı telefondan komple tamamlanmalı."
 *
 * Eskiden: paketli seansta kumanda "tahsilatı masaüstündeki Kasa'dan yapın"
 * diyordu ve paket satışı "Peşinat ve taksit masaüstünden alınır" diyordu —
 * tek kişilik salonda o masaüstü yok, adisyon ve borç hiç kapanmıyordu.
 *
 * Şimdi:
 *   • paketli seans (paket motoru olan sektörde): hizmet ₺0, yalnız ürün
 *     tahsil ediliyor; toplam ₺0 ise "Hesabı kapat · pakete dahil" — para
 *     kaydı YAZMADAN adisyon kapanıyor.
 *   • paket bedeli: müşteri kartındaki paket satırından ve satış sonunda
 *     "Ödeme al" / "Peşinat al" — masaüstü Kasa'nın paket biletiyle aynı satır.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const api = read('supabase/functions/staff-api/index.ts');
const collect = api.slice(api.indexOf("if (action === 'visit.collect')"), api.indexOf("if (action === 'catalog')"));
const charge = api.slice(api.indexOf("if (action === 'visit.charge')"), api.indexOf("if (action === 'visit.collect')"));

const PKG = { group_id: null, custom_fields: { paket_plan_id: 'plan-1', paket_seans: '2/4' } };

// ── Kural: telefon ve sunucu aynı ───────────────────────────────────────────

test('paket motoru yalnız güzellik ve kuaförde — iki tarafta aynı', () => {
    for (const sector of ['guzellik', 'kuafor']) {
        assert.equal(serverEnabled(sector), true);
        assert.equal(clientEnabled(sector), true);
    }
    for (const sector of ['dis', 'berber', 'estetik', null, undefined, '']) {
        assert.equal(serverEnabled(sector), false, String(sector));
        assert.equal(clientEnabled(sector), false, String(sector));
    }
});

test('paketli seansın hizmeti ₺0 — yalnız paket motoru olan sektörde', () => {
    for (const covered of [serverCovered, clientCovered]) {
        assert.equal(covered(PKG, true), true);
        assert.equal(covered(PKG, false), false);
        assert.equal(covered({ custom_fields: {} }, true), false);
        assert.equal(covered({ custom_fields: { paket_plan_id: '' } }, true), false);
    }
    // Paketli sektörde Kasa'ya ait DEĞİL; paketsiz sektörde eskisi gibi Kasa'nın.
    assert.equal(serverKasa(PKG, 0, true), null);
    assert.equal(clientKasa(PKG, 0, true), null);
    assert.equal(serverKasa(PKG, 0, false), 'package');
    assert.equal(clientKasa(PKG, 0, false), 'package');
});

test('Kasa\'nın kuyruğu aynı kuraldan: paketli seans + ürün = yalnız ürün', () => {
    const row = {
        id: 'r1', customer_id: 'c1', customer_name: 'Vildan Ay', service: 'Cilt Bakımı',
        status: 'completed', date: '2026-10-16', start_time: '07:00:00', staff_id: 'st1',
        adisyon_items: [{ name: 'Serum', price: 250, qty: 2 }], is_paid: false, group_id: null,
        custom_fields: PKG.custom_fields,
    };
    const catalog = [{ name: 'Cilt Bakımı', price: 1800 }];
    assert.equal(ticketsOf([row], [], catalog, true)[0].balance, 500);
    assert.equal(ticketsOf([{ ...row, adisyon_items: [] }], [], catalog, true)[0].balance, 0);
    // Paketsiz sektörde bağın parasal anlamı yok.
    assert.equal(ticketsOf([row], [], catalog, false)[0].balance, 2300);
});

// ── Sunucu: visit.collect ───────────────────────────────────────────────────

test('sektör sahibin ayar satırından, yalnız pakete bağlı randevuda soruluyor', () => {
    const fn = api.slice(api.indexOf('const orgPackagesEnabled = async'), api.indexOf('const reconcileUsageStock'));
    assert.match(fn, /from\('organizations'\)\s*\.select\('owner_id'\)/);
    assert.match(fn, /from\('settings'\)\s*\.select\('sector'\)\.eq\('organization_id', me\.organization_id\)\.eq\('user_id', org\.owner_id\)/);
    assert.match(fn, /return packagesEnabledFor\(settings\?\.sector\);/);
    // Okunamazsa ₺0 SAYILMIYOR — güvenli taraf Kasa.
    assert.equal((fn.match(/return false;/g) ?? []).length, 2);
    for (const block of [collect, charge]) {
        assert.match(block, /const packagesEnabled = hasPackageLink\(cfRow \?\? \{\}\) \? await orgPackagesEnabled\(\) : false;/);
        assert.match(block, /const covered = packageCovered\(cfRow \?\? \{\}, packagesEnabled\);/);
    }
});

test('visit.collect: paketli seansta hizmet ₺0, yalnız kalemler tahsil ediliyor', () => {
    const code = strip(collect);
    assert.match(code, /method !== 'cash' && method !== 'card' && method !== 'transfer' && method !== 'package'/);
    assert.match(code, /const kasaReason = kasaOnlyReason\(cfRow \?\? \{\}, 0, packagesEnabled\);/);
    // Hizmet ücreti zinciri paketli seansta HİÇ çalışmıyor.
    const serviceChain = code.indexOf('if (covered) {');
    assert.ok(serviceChain > 0 && serviceChain < code.indexOf('} else if (Array.isArray(parsedLines)'));
    assert.match(code, /const amount = Math\.round\(\(serviceAmount \+ itemsAmount\) \* 100\) \/ 100;/);
});

test('"Pakete dahil" kapanış: para kaydı YOK, yalnız ₺0 adisyonda, sırası doğru', () => {
    const code = strip(collect);
    const guard = code.indexOf("if (method === 'package' && !(covered && amount <= 0))");
    const close = code.indexOf('if (covered && !(amount > 0)) {');
    const zero = code.indexOf("if (!(amount > 0)) return json({ error: 'zero_amount' }, 409);");
    const insert = code.indexOf("from('payments').insert");
    assert.ok(guard > 0, 'tutarı olan adisyon "pakete dahil" kapatılabiliyor');
    assert.ok(guard < code.indexOf('if (existing) {'), 'kapanış koruması var olan tahsilattan önce');
    assert.ok(close > 0 && close < zero && zero < insert, 'kapanış sıfır reddinden ve para kaydından ÖNCE');
    const block = code.slice(close, zero);
    assert.match(block, /\.update\(\{ is_paid: true \}\)/);
    assert.doesNotMatch(block, /from\('payments'\)/, 'pakete dahil kapanış para kaydı yazmıyor');
    assert.match(block, /audit\(me\.organization_id, me\.id, 'visit\.collect', 'paket'\)/);
    assert.match(block, /return await done\(\{ ok: true, payment: null, amount: 0, covered: true \}\);/);
    // Bayrak yazılamazsa başarı DENMİYOR (para yok, tek gerçek bayrak).
    assert.match(block, /return json\(\{ error: 'write_failed' \}, 500\);/);
    assert.match(code, /return json\(\{ error: 'collect_amount_changed', amount \}, 409\);/);
});

test('visit.charge: paketli seansın satırları ₺0 ve `covered` söyleniyor', () => {
    const code = strip(charge);
    assert.match(code, /if \(covered\) for \(const line of lines\) line\.amount = 0;/);
    assert.ok(code.indexOf('if (covered) for') < code.indexOf('const amount = Math.round(lines.reduce'));
});

// ── Kumanda ─────────────────────────────────────────────────────────────────

test('yöntem: ₺0 paketli adisyonda sorulmuyor, ürün varsa seçilen', () => {
    assert.equal(collectMethodFor(true, 0, null), 'package');
    assert.equal(collectMethodFor(true, 0, 'card'), 'package');
    assert.equal(collectMethodFor(true, 500, 'card'), 'card');
    assert.equal(collectMethodFor(true, 500, null), null);
    // Kalem silinip toplam yeniden ₺0 → kapatma; eklenince eski kapatma düşer.
    assert.equal(collectMethodFor(true, 500, 'package'), null);
    assert.equal(collectMethodFor(false, 0, 'cash'), 'cash');
    assert.equal(collectMethodFor(false, 0, null), null);
    // Toplam bilinmiyorsa kapatma teklif edilmez.
    assert.equal(collectMethodFor(true, null, null), null);
    // Seçicide "paket" diye bir yöntem YOK.
    assert.deepEqual(COLLECT_METHODS.map((item) => item.key), ['cash', 'card', 'transfer']);
});

test('düğmenin sözü: "Hesabı kapat · pakete dahil"', () => {
    assert.deepEqual(collectLabel('package'), { label: 'Hesabı kapat · pakete dahil', enabled: true });
    assert.equal(collectedLabel('package'), 'Hesap kapandı · pakete dahil');
    assert.equal(collectRetryLabel('collect_failed', 'package'), 'Tekrar dene · hesabı kapat · pakete dahil');
    assert.match(collectErrorLine('collect_failed', 'collect_amount_changed'), /ücretli kalem eklenmiş; hesap kapatılmadı/);
});

test('ekip ücret okuması `covered`ı yalnız açık `true`da alıyor', () => {
    const base = { lines: [{ name: 'Cilt Bakımı', amount: 0 }], amount: 0, count: 1, kasaOnly: null };
    assert.equal(serviceBillOf({ ...base, covered: true }).covered, true);
    assert.equal(serviceBillOf({ ...base, covered: 'true' }).covered, undefined);
    assert.equal(serviceBillOf(base).covered, undefined);
});

test('kumanda ve güverte: yöntem dokunuşta sabit, kapanışta seçici ve "Sonra" yok', () => {
    const kumanda = strip(read('mobile/app/(staff-flow)/kumanda.tsx'));
    assert.match(kumanda, /const payMethod = collectMethodFor\(Boolean\(serviceCharge\?\.covered\), grand, collectMethod\);/);
    assert.match(kumanda, /method=\{payMethod\}/);
    assert.match(kumanda, /cause\.code === 'collect_amount_changed'\) \{\s*void reloadVisit\(\);/);
    const bar = strip(read('mobile/src/components/CollectBar.tsx'));
    assert.match(bar, /const closing = method === 'package';/);
    assert.match(bar, /\{closing \? null : \(\s*<Animated\.View/);
    assert.match(bar, /const laterUseful = !closing &&/);
    const sade = strip(read('mobile/src/components/AdisyonSade.tsx'));
    assert.match(sade, /row\.covered \? 'Paketten · ücret alınmaz' : 'Randevu hizmeti'/);
    const source = strip(read('mobile/src/lib/managerSource.ts'));
    const fn = source.slice(source.indexOf('export async function fetchServiceCharge'));
    assert.match(fn.slice(0, 2500), /fetchOrgSettings\('sector'\)/);
});

// ── Paket bedeli ────────────────────────────────────────────────────────────

test('tutar: kalan borçla dolu gelir, peşinat için düzenlenir, borcu aşamaz', () => {
    assert.equal(defaultAmountText(3600), '3600');
    assert.equal(defaultAmountText(1234.5), '1234', 'kuruşlu borç aşağı — yukarısı borcu aşar');
    assert.equal(defaultAmountText(0), '');
    assert.equal(parsePlanAmount('1.000'), 1000);
    assert.equal(parsePlanAmount(''), null);
    assert.equal(parsePlanAmount('0'), null);
    assert.equal(amountProblem(null, 3600), 'empty');
    assert.equal(amountProblem(3601, 3600), 'over');
    assert.equal(amountProblem(3600, 3600), null);
    assert.equal(remainingAfter(3600, 1000), 2600);
    assert.equal(remainingLine(3600, 1000), 'Tahsilattan sonra kalan: ₺2.600.');
    assert.equal(remainingLine(3600, 3600), 'Tahsilatla paket ödenmiş olur.');
    assert.equal(remainingLine(3600, 5000), 'Paketin kalan borcu ₺3.600.');
});

test('düğme tutarı ve yöntemi birlikte söylüyor; eksikte kapalı', () => {
    assert.deepEqual(payLabel(1000, 3600, 'cash'), { label: '₺1.000 nakit tahsil et', enabled: true });
    assert.deepEqual(payLabel(1000, 3600, 'card'), { label: '₺1.000 kartla tahsil et', enabled: true });
    assert.deepEqual(payLabel(1000, 3600, 'transfer'), { label: '₺1.000 havaleyle tahsil et', enabled: true });
    assert.deepEqual(payLabel(1000, 3600, null), { label: 'Ödeme yöntemini seçin', enabled: false });
    assert.deepEqual(payLabel(null, 3600, 'cash'), { label: 'Tutarı yazın', enabled: false });
    assert.deepEqual(payLabel(4000, 3600, 'cash'), { label: 'En çok ₺3.600 alınabilir', enabled: false });
});

test('ödeme satırı masaüstü Kasa\'nın paket biletiyle aynı', () => {
    const row = planPaymentRow(
        { id: 'p-1', planId: 'plan-1', customerId: 'c1', title: ' Ağda ', amount: 1000, method: 'card' },
        { organizationId: 'o1', userId: 'u1' },
    );
    assert.deepEqual(row, {
        id: 'p-1', organization_id: 'o1', customer_id: 'c1', reservation_id: null,
        treatment_plan_id: 'plan-1', type: 'service', description: 'Paket tahsilatı · Ağda',
        amount: 1000, method: 'card', created_by: 'u1',
    });
    const desk = read('src/pages/BeautyCashRegister.tsx');
    const pkg = desk.slice(desk.indexOf('if (isPkgTicket(record.id)) {\n            const planId'));
    assert.match(pkg.slice(0, 900), /type: 'service'/);
    assert.match(pkg.slice(0, 900), /description: `Paket tahsilatı · \$\{record\.service\}/);
    assert.match(pkg.slice(0, 900), /treatmentPlanId: planId/);
});

test('sunucunun hayırları kendi cümlesiyle', () => {
    assert.equal(planPaymentFailureOf({ message: 'plan_payment_exceeds_balance' }), 'over');
    assert.equal(planPaymentFailureOf({ message: 'plan_payment_requires_installment' }), 'installments');
    assert.equal(planPaymentFailureOf({ message: 'payment_scope_mismatch' }), 'stale');
    assert.equal(planPaymentFailureOf({ code: '23503', message: 'fk' }), 'stale');
    assert.equal(planPaymentFailureOf({ code: '42501', message: 'rls' }), 'subscription_inactive');
    assert.equal(planPaymentFailureOf({ message: 'Network request failed' }), 'offline');
    assert.equal(planPaymentFailureOf({ message: 'boom' }), 'failed');
    for (const failure of ['over', 'installments', 'stale', 'paused', 'subscription_inactive', 'offline', 'failed']) {
        assert.ok(planPaymentFailureLine(failure).length > 10, failure);
    }
    // 061'in tetikleyicisi bu adları gerçekten atıyor.
    const guard = read('supabase/061_treatment_finance_integrity.sql');
    for (const name of ['plan_payment_exceeds_balance', 'plan_payment_requires_installment', 'payment_scope_mismatch']) {
        assert.match(guard, new RegExp(name));
    }
});

test('yazma: vana, istemci kimliği, 23505 = zaten yazıldı', () => {
    const src = strip(read('mobile/src/lib/managerWrite.ts'));
    const start = src.indexOf('export async function collectPlanPayment');
    const fn = src.slice(start, src.indexOf('\n}\n', start));
    assert.match(fn, /if \(await writesPaused\(\)\) return \{ ok: false, failure: 'paused' \};/);
    assert.match(fn, /\.insert\(planPaymentRow\(input, \{ organizationId, userId \}\)\)/);
    assert.match(fn, /error\.code === '23505'/);
    assert.match(fn, /\.eq\('id', input\.id\)\.eq\('organization_id', organizationId\)/);
    // Sayfa kimliği açılışta üretiyor ve açıkken değiştirmiyor.
    const sheet = strip(read('mobile/src/components/PackagePaymentSheet.tsx'));
    assert.match(sheet, /const \[paymentId, setPaymentId\] = useState\(\(\) => newPlanId\(\)\);/);
    assert.match(sheet, /id: paymentId, planId: pack\.planId/);
    assert.equal((sheet.match(/setPaymentId\(/g) ?? []).length, 1, 'kimlik yalnız yeni açılışta yenileniyor');
});

test('kart: "Ödeme al" yalnız tek kişilikte; satış sonu bir kez kendiliğinden', () => {
    const route = strip(read('mobile/app/(staff-flow)/customer.tsx'));
    assert.match(route, /onCollectPackage=\{solo \? \(pack\) => setPaying\(\{ \.\.\.pack, fresh: false \}\) : undefined\}/);
    assert.match(route, /if \(solo && card && freshPlanId && offered !== freshPlanId\)/);
    assert.match(route, /setPaying\(\{ planId: freshPlanId, title: fresh\.name, owed: fresh\.owed, fresh: true \}\)/);
    assert.match(route, /onPaid=\{\(\) => \{ setPaying\(null\); void snap\.reload\(\); \}\}/);

    const card = strip(read('mobile/src/components/CustomerCard.tsx'));
    assert.match(card, /owed != null && planId && onCollectPackage \?/);
    assert.match(card, /\{!onCollectPackage && packages\.some\(/, 'tek kişilikte "Kasa’dan yapılır" denmiyor');

    const sale = strip(read('mobile/app/(manager-flow)/paket-sat.tsx'));
    assert.match(sale, /const solo = useInSoloShell\(\);/);
    assert.match(sale, /Peşinatı paket oluşunca/);
    assert.match(sale, /Peşinat ve taksit masaüstünden/, 'ekipte cümle aynı');
});
