import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    ALLOWED_TRIAL_DAYS, computeAccess, DEFAULT_TRIAL_DAYS, GRACE_DAYS,
    graceUntil, safeTrialDays,
} from '../supabase/functions/_shared/entitlement.ts';
import {
    firstChargeDate, formatTRY, PLANS, planById, priceOf, TRIAL_DAYS, yearlyDiscountPercent,
} from '../src/lib/plans.ts';

// Abonelik kapısı. Bu dosyanın koruduğu şey ürünün geliri: TimeFlow bugüne
// kadar kayıt olan herkese sınırsız ve ücretsiz açıktı, süresi dolmuş bir org
// WhatsApp mesajı göndermeye devam ediyordu.

const NOW = Date.parse('2026-08-09T12:00:00Z');
const DAY = 86_400_000;
const iso = (deltaDays) => new Date(NOW + deltaDays * DAY).toISOString();

test('abonelik satırı hiç yoksa kapı kapalı', () => {
    // Yeni kayıt olmuş, henüz ödeme adımına gelmemiş kullanıcı.
    const a = computeAccess(null, NOW);
    assert.equal(a.ok, false);
    assert.equal(a.state, 'none');
    assert.equal(a.daysLeft, null);
});

test('deneme sürüyor — kalan gün sayılır', () => {
    const a = computeAccess({ state: 'trial', expires_at: iso(3), trial_ends_at: iso(3) }, NOW);
    assert.equal(a.ok, true);
    assert.equal(a.effective, 'trial');
    assert.equal(a.daysLeft, 3);
});

test('denemesi dolmuş satır "deneme" demeye devam ETMEZ', () => {
    // Arayüz ham duruma bakıp "denemeniz sürüyor" yazsaydı, süresi dolmuş
    // kullanıcı neden kilitlendiğini anlamazdı.
    const a = computeAccess({ state: 'trial', expires_at: iso(-1) }, NOW);
    assert.equal(a.ok, false);
    assert.equal(a.state, 'trial');
    assert.equal(a.effective, 'locked');
    assert.equal(a.daysLeft, 0);
});

test('aktif abonelik dönem sonuna kadar geçerli', () => {
    assert.equal(computeAccess({ state: 'active', expires_at: iso(20) }, NOW).ok, true);
    assert.equal(computeAccess({ state: 'active', expires_at: iso(-0.001) }, NOW).ok, false);
});

test('iptal edilmiş ama dönemi süren abonelik ÇALIŞMAYA DEVAM EDER', () => {
    // Dodo'da iptal "dönem sonunda" anlamına geliyor; parasını ödediği günü
    // müşteriden geri almak dolandırıcılıktır.
    const a = computeAccess({ state: 'active', expires_at: iso(11) }, NOW);
    assert.equal(a.ok, true);
    assert.equal(a.daysLeft, 11);
});

test('ödeme alınamadı — ek süre grace_until ile ölçülür, expires_at ile DEĞİL', () => {
    // Ödeme alınamadığında dönem zaten bitmiştir; ek süreyi expires_at'e
    // bağlamak onu hep geçmişte bırakır ve ek süre hiç işlemezdi.
    const live = computeAccess(
        { state: 'grace', expires_at: iso(-1), grace_until: iso(1) }, NOW);
    assert.equal(live.ok, true);
    assert.equal(live.effective, 'grace');
    assert.equal(live.daysLeft, 1);

    const over = computeAccess(
        { state: 'grace', expires_at: iso(-3), grace_until: iso(-1) }, NOW);
    assert.equal(over.ok, false);
    assert.equal(over.effective, 'locked');
});

test('grace_until\'siz "grace" satırı sonsuz ek süre VERMEZ', () => {
    // Tutarsız veri; sonsuz bedava kullanım ile kapatmak arasında kapatmak
    // doğru taraf — kullanıcı ödeme sayfasına düşer, veri durur.
    const a = computeAccess({ state: 'grace', grace_until: null }, NOW);
    assert.equal(a.ok, false);
    assert.equal(a.effective, 'locked');
});

test('locked her koşulda kapalı, tarih ileride olsa bile', () => {
    assert.equal(computeAccess({ state: 'locked', expires_at: iso(99) }, NOW).ok, false);
});

test('süresiz abonelik (elle açılmış Core kaydı) çalışır', () => {
    const a = computeAccess({ state: 'active', expires_at: null }, NOW);
    assert.equal(a.ok, true);
    assert.equal(a.until, null);
    assert.equal(a.daysLeft, null);
});

test('bozuk tarih metni erişim vermez', () => {
    // Date.parse('yarın') → NaN. Sayı olmayan tarih "süresiz" sayılsaydı
    // bozuk bir satır bedava sınırsız kullanım demek olurdu... ama süresiz
    // abonelik de meşru. Ayrım: state. 'grace' bozuk tarihle kapanır.
    assert.equal(computeAccess({ state: 'grace', grace_until: 'yarın' }, NOW).ok, false);
});

test('ek süre iki gün', () => {
    assert.equal(GRACE_DAYS, 2);
    const until = Date.parse(graceUntil(NOW));
    assert.equal(until - NOW, 2 * DAY);
});

test('deneme uzunluğu beyaz listeyle sınırlı', () => {
    // Bu değer istemciden gelebiliyor (pilot linki). Serbest bırakılsaydı
    // herhangi biri kendine 10000 günlük deneme açardı.
    assert.equal(DEFAULT_TRIAL_DAYS, 7);
    assert.equal(safeTrialDays(90), 90);
    assert.equal(safeTrialDays(9999), 7, 'liste dışı değer varsayılana düşmeli');
    assert.equal(safeTrialDays('90'), 90, 'metin sayıya çevrilmeli');
    assert.equal(safeTrialDays(undefined), 7);
    assert.equal(safeTrialDays(null), 7);
    assert.ok(ALLOWED_TRIAL_DAYS.every((d) => d > 0 && d <= 10000), 'Dodo sınırı 0–10000');
});

// ── Planlar: fiyat tek kaynakta ─────────────────────────────────────────────
// Aynı liste ÜÇ yerde gösteriliyor (Ayarlar→Faturalandırma, /fiyatlar,
// /abonelik). Üç kopya fiyat, er ya da geç üç FARKLI fiyat demek.

test('planlar tek dosyadan okunuyor', () => {
    assert.equal(PLANS.length, 3);
    assert.deepEqual(PLANS.map((p) => p.id), ['baslangic', 'pro', 'isletme']);
    assert.equal(PLANS.filter((p) => p.popular).length, 1, 'tek bir "en çok seçilen" olmalı');
    for (const p of PLANS) {
        assert.ok(p.monthly > 0 && p.yearly > 0, `${p.id}: fiyat yok`);
        assert.ok(p.yearly < p.monthly, `${p.id}: yıllık ödeme aylıktan pahalı olamaz`);
        assert.ok(p.features.length >= 5, `${p.id}: özellik listesi kısa`);
    }
});

test('yıllık indirim hesaplanır, sabit yazılmaz', () => {
    // "%20 indirim" sabit yazılsaydı fiyat değiştiğinde yazı sessizce yalan
    // olurdu.
    const pro = planById('pro');
    assert.equal(yearlyDiscountPercent(pro), 20);
    assert.equal(priceOf(pro, 'monthly'), 599);
    assert.equal(priceOf(pro, 'yearly'), 479);
    assert.equal(formatTRY(1199), '1.199');
});

test('ilk tahsilat tarihi deneme süresiyle tutarlı', () => {
    // Sayfa bu tarihi AÇIKÇA yazıyor: kart isteyen bir denemede "ne zaman
    // para çekilecek" sorusunu cevapsız bırakmak güveni bitirir.
    assert.equal(TRIAL_DAYS, 7);
    const from = new Date('2026-08-09T10:00:00Z');
    assert.equal(firstChargeDate(from).toISOString().slice(0, 10), '2026-08-16');
});

test('istemci ve sunucu aynı deneme süresini söylüyor', () => {
    // plans.ts vitrine, entitlement.ts Dodo'ya konuşuyor. Ayrışırlarsa sayfa
    // "7 gün" der, Dodo 14 gün verir.
    assert.equal(TRIAL_DAYS, DEFAULT_TRIAL_DAYS);
});

// ── Kapı gerçekten takılmış mı? ─────────────────────────────────────────────
// Mantığın doğru olması yetmez; PARA HARCATAN uçlara bağlanmış olması gerekir.
// Bu testler olmasaydı "kapı yazdık" deyip bot çalışmaya devam edebilirdi.

const fn = (name) => readFileSync(
    new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');

test('para harcatan her uç abonelik kapısından geçiyor', () => {
    for (const name of [
        'whatsapp-booking',   // her mesaj = model + WhatsApp gönderimi
        'remind',             // cron = toplu WhatsApp
        'public-booking',     // ürünün kendisi
        'staff-api',
        'insight',            // model faturası
        'draft-messages',     // model faturası
        'notify-waitlist',    // toplu WhatsApp
        'generate-recurring', // service_role ile yazıyor, RLS'i atlıyor
        'gateway',
        'booking-manage',
    ]) {
        assert.match(fn(name), /checkAccess/, `${name}: abonelik kapısı yok`);
    }
});

test('ödeme yolu ASLA kapanmaz', () => {
    // Parası biten müşterinin ödeme de yapamaması, kilitlenmenin en aptalca
    // hâli olurdu.
    for (const name of ['dodo-checkout', 'billing-status', 'push-subscribe', 'send-push']) {
        assert.ok(!/checkAccess\(/.test(fn(name)), `${name}: ödeme/bildirim yoluna kapı konmamalı`);
    }
});

test('müşteri kendi randevusunu iptal edebilir', () => {
    // booking-manage bağlantısı işletmenin değil MÜŞTERİNİN elinde. Aboneliği
    // bitti diye iptali engellemek masum tarafı cezalandırıp salona no-show
    // yazdırırdı; yalnız yeni slot tutan 'reschedule' kapanır.
    assert.match(fn('booking-manage'), /!access\.ok && action === 'reschedule'/);
});

test('deneme yalnız İLK kez verilir', () => {
    // İptal edip yeniden satın alan biri her seferinde 7 gün bedava
    // kullanamamalı.
    const checkout = fn('dodo-checkout');
    assert.match(checkout, /org_entitlement/);
    assert.match(checkout, /firstTime\s*\n?\s*\?\s*safeTrialDays/);
    assert.match(checkout, /trial_period_days: trialDays/);
});

test('webhook aynayı yazıyor', () => {
    // Core'a yazmak yetmez: Core ayrı bir Supabase projesi, RLS oraya bakamaz.
    // Ayna yazılmazsa müşteri ödeme yapar ama içeri giremez.
    const hook = fn('dodo-webhook');
    assert.match(hook, /mirrorEntitlement/);
    for (const ev of ['subscription.active', 'subscription.renewed', 'subscription.on_hold',
        'subscription.expired', 'payment.succeeded']) {
        assert.ok(hook.includes(ev), `${ev} işlenmiyor`);
    }
    // Deneme 'trial' yazılmalı, 'active' değil — yoksa "denemeniz bitiyor"
    // hatırlatması hiç gönderilemez.
    assert.match(hook, /onTrial \? 'trial' : 'active'/);
    // Ödeme alınamayınca ek süre + bildirim.
    assert.match(hook, /graceUntil\(\)/);
    assert.match(hook, /Ödeme alınamadı/);
});

test('iptal edilen abonelik dönem bitmeden kapatılmıyor', () => {
    // Parasını ödediği günü müşteriden geri almak dolandırıcılıktır.
    assert.match(fn('dodo-webhook'), /await mirror\(admin, orgId, type, \{\}\);/);
});

// ── Tasarım bağlantıları ────────────────────────────────────────────────────
// Tasarım: Claude Design "Luera Fiyatlandırma.html" (yedi durum).

test('yedi durumun hepsinin bir karşılığı var', () => {
    const pricing = readFileSync(new URL('../src/pages/public/PricingPage.tsx', import.meta.url), 'utf8');
    const wall = readFileSync(new URL('../src/pages/PaywallPage.tsx', import.meta.url), 'utf8');
    const strip = readFileSync(new URL('../src/components/layout/SubscriptionBanner.tsx', import.meta.url), 'utf8');
    const tab = readFileSync(new URL('../src/components/settings/BillingTab.tsx', import.meta.url), 'utf8');

    assert.match(pricing, /className="hero"/);          // 1 — fiyat sayfası
    assert.match(pricing, /className="explain"/);       //     deneme açıklaması
    assert.match(pricing, /className="trust"/);
    assert.match(pricing, /className="faq"/);
    assert.match(wall, /badge n pausing/);              // 2 — deneme bitti
    assert.match(wall, /className="keep"/);
    assert.match(wall, /countdown live/);               // 3 — ödeme alınamadı
    assert.match(strip, /className="strip"/);           // 4 — şerit
    assert.match(wall, /className="receipt"/);          // 5 — ödeme sonrası
    assert.match(wall, /badge n"><Ico n="loading"/);    //     işleniyor
    assert.match(tab, /box hero-box/);                  // 6 — faturalandırma
    assert.match(tab, /Fatura geçmişi/);
});

test('duvar, veri sağlayıcılarının dışında da açılır', () => {
    // CANLIDA PATLADI: /abonelik rotası RootLayout'un (ve dolayısıyla
    // ReservationsProvider'ın) DIŞINDA. useReservations oradan çağrılınca
    // "ReservationsProvider içinde kullanılmalı" hatası fırlıyor ve kullanıcı
    // ödeme yapmak isterken hata ekranına düşüyordu — kilitlenmenin en kötü
    // hâli: parası biten müşteri ödeme de yapamıyor.
    const wall = readFileSync(new URL('../src/pages/PaywallPage.tsx', import.meta.url), 'utf8');
    const pricing = readFileSync(new URL('../src/pages/public/PricingPage.tsx', import.meta.url), 'utf8');
    for (const [name, src] of [['PaywallPage', wall], ['PricingPage', pricing]]) {
        for (const hook of ['useReservations', 'useModules', 'useLabels']) {
            assert.ok(!src.includes(hook), `${name}: ${hook} sağlayıcı gerektiriyor, bu rotada yok`);
        }
    }
});

test('tasarımın CSS\'i kapsayıcı sınıfla korunuyor', () => {
    // Tasarım `.plan`, `.wall`, `.btn`, `.price` gibi GENEL adlar kullanıyor;
    // kapsayıcı olmadan uygulamanın başka ekranlarına sızarlardı.
    const css = readFileSync(new URL('../src/pages/billing.css', import.meta.url), 'utf8');
    const bare = css.split('\n').filter((l) => /^\.(?!bl\b)[a-z]/.test(l));
    assert.deepEqual(bare, [], `kapsayıcısız seçici: ${bare.join(', ')}`);
    // Renk jetonları kopyalanmadı — uygulamanın kendi seti kullanılıyor.
    assert.ok(!/--dc-page:\s*#/.test(css), 'jeton değeri kopyalanmamalı');
    assert.match(css, /dash-theme/, 'jeton kapsamı uyarısı dosyada kalmalı');
});

test('mobilde en popüler plan başa alınır', () => {
    // Telefonda üç kartı alt alta kaydırmak zorunda kalan kullanıcı çoğu zaman
    // ilkini seçiyor; tasarım Pro'yu CSS sırasıyla öne alıyor.
    const css = readFileSync(new URL('../src/pages/billing.css', import.meta.url), 'utf8');
    assert.match(css, /\.plan\.pop\{order:-1\}/);
});

// ── SQL ile TS aynı şeyi söylemeli ──────────────────────────────────────────
// İkisi ayrışırsa RLS bir şey, arayüz başka bir şey söyler: kullanıcı ekranı
// görür ama kaydedemez.

const sql = readFileSync(new URL('../supabase/086_entitlement.sql', import.meta.url), 'utf8');

test('SQL kapısı aynı üç durumu geçirir', () => {
    assert.match(sql, /state IN \('trial', 'active', 'grace'\)/);
    assert.match(sql, /expires_at\s+IS NULL OR e\.expires_at\s+> now\(\)/);
    assert.match(sql, /state <> 'grace' OR \(e\.grace_until IS NOT NULL AND e\.grace_until > now\(\)\)/);
});

test('ENFORCE kapalıyken SQL herkese açık', () => {
    // Migration uygulanır uygulanmaz kimse kilitlenmemeli; kapıyı kurmak ile
    // kapatmak ayrı günlerin işi.
    assert.match(sql, /ENTITLEMENT_ENFORCE/);
    assert.match(sql, /<> 'true'\s*\n\s*THEN true/);
});

test('RLS kilidi OKUMAYI kapatmıyor', () => {
    // Kilit ürünü kullanmayı durdurur, veriyi değil. Müşterinin verisini
    // rehin almak marka zararıdır ve KVKK açısından da savunulamaz.
    const rls = readFileSync(new URL('../supabase/087_entitlement_rls.sql', import.meta.url), 'utf8');
    assert.match(rls, /WITH CHECK[\s\S]{0,160}has_timeflow_access\(organization_id\)/);
    assert.ok(!/FOR SELECT/.test(rls), 'SELECT politikalarına dokunulmamalı');
    // settings kilitlenmez: ödeme sonrası dönen kullanıcı yarım kurulumla
    // baş başa kalmasın.
    assert.ok(!/'settings'/.test(rls), 'settings yazma kilidine girmemeli');
    // Geri dönüş yolu belgelenmiş olmalı — canlıda panik anında aranacak şey.
    assert.match(rls, /ENTITLEMENT_ENFORCE.{0,40}false/s);
});

test('sektör modülleri de kapıdan geçiyor', () => {
    // Canlı denetimde çıktı: 087 yalnız çekirdeği kapatmış, kilitli bir org
    // hâlâ diş kaydı girip paket satabiliyordu. "Sistem durur" vaadinin
    // yarısının tutmaması, hiç tutmamasından daha kötü.
    const mods = readFileSync(new URL('../supabase/088_entitlement_rls_modules.sql', import.meta.url), 'utf8');
    for (const t of ['customer_packages', 'dental_records', 'queue_entries',
        'table_reservations', 'stock_movements', 'waitlist']) {
        assert.ok(mods.includes(`'${t}'`), `${t} kapsam dışı kalmış`);
    }
    // Bildirim yolu kapanırsa "ödeme alınamadı" uyarısı da gitmez.
    assert.ok(!/'push_subscriptions'/.test(mods), 'bildirim yolu kilitlenmemeli');
    assert.ok(!/'settings'/.test(mods), 'settings kilitlenmemeli');
});

test('aboneliği kullanıcı kendi yazamaz', () => {
    // org_entitlement'ta SELECT politikası var, INSERT/UPDATE YOK: service-role
    // dışında kimse kendini "active" yapamaz.
    assert.match(sql, /FOR SELECT TO authenticated/);
    assert.ok(!/FOR (INSERT|UPDATE|ALL) TO authenticated/.test(sql),
        'org_entitlement kullanıcıya yazdırılmamalı');
});
