import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DURATION_CHIPS,
    HOLD_MS,
    SERVICE_COLORS,
    applyToAllDays,
    canDelete,
    dayName,
    dayValueLabel,
    deletionCopy,
    formatPrice,
    hhmm,
    hoursSummary,
    legalLinks,
    legalSummary,
    notificationsSummary,
    parsePrice,
    priceWarning,
    servicesSummary,
    stepHour,
    themeLabel,
    todayCard,
} from '../mobile/src/lib/managerProfile.ts';
import { profileMetrics, profileMotion } from '../mobile/src/theme/tokens.ts';

// Müdür 27 — Müdür profili.
//
// Bu dosyanın koruduğu üç şey:
//   1. Abonelik, plan, fiyat ve fatura bu ekranlara ASLA girmez —
//      App Store 3.1.1 uygulama içinden satın almaya yönlendirmeyi yasaklıyor.
//   2. "Hesabınız silindi" cümlesi sunucu onaylamadan ekrana girmez.
//   3. Hedefi olmayan satır çizilmez; olmayan veri gösterilmez.
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 27 Profil.html`.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const home = code('app/mudur/profile.tsx');
const hoursScreen = code('app/(manager-flow)/profil/saatler.tsx');
const servicesScreen = code('app/(manager-flow)/profil/hizmetler.tsx');
const deleteScreen = code('app/(manager-flow)/profil/hesap-sil.tsx');
const parts = code('src/components/ProfileParts.tsx');
const sheets = code('src/components/ProfileSheets.tsx');
const settings = code('src/lib/salonSettings.ts');
const lib = code('src/lib/managerProfile.ts');
const api = code('src/api/accountDeletion.ts');
const fn = code('../supabase/functions/account-delete/index.ts');

const WEEK = [
    { day: 0, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 1, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 2, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 3, open: 9 * 60, close: 20 * 60, closed: false },
    { day: 4, open: 9 * 60, close: 21 * 60, closed: false },
    { day: 5, open: 10 * 60, close: 21 * 60, closed: false },
    { day: 6, open: 10 * 60, close: 18 * 60, closed: true },
];

// ── Kapsam dışı bırakılanlar ────────────────────────────────────────────────

test('abonelik, plan, fiyat ve fatura profil ekranlarına GİRMEZ', () => {
    // App Store 3.1.1: uygulama içinden satın almaya yönlendirilemez.
    // Ayrıca bu veriler elimizde yok — "planınız 12 gün sonra bitiyor"
    // yazmak uydurmak olurdu.
    const screens = [home, hoursScreen, servicesScreen, deleteScreen];
    for (const screen of screens) {
        assert.doesNotMatch(screen, /abonelik|Abonelik|subscription/i);
        assert.doesNotMatch(screen, /fatura|Fatura|billing/i);
        assert.doesNotMatch(screen, /\bplan(ınız|ı|lar)\b/i);
    }
});

test('personel vardiya satırı yok — kişi bazlı vardiya veri modelinde yok', () => {
    assert.doesNotMatch(home, /[Vv]ardiya/);
    assert.doesNotMatch(hoursScreen, /[Vv]ardiya/);
});

test('"Bugünü kapat" düğmesi yok — model haftanın gününü tutuyor, tarihi değil', () => {
    // O düğme bugünü değil HER PERŞEMBEYİ kapatırdı.
    assert.doesNotMatch(hoursScreen, /Bugünü kapat/);
    assert.doesNotMatch(sheets, /Bugünü kapat/);
});

// ── Bugün kartı ─────────────────────────────────────────────────────────────

test('kapalı günde geri sayım satırı HİÇ çizilmez', () => {
    const sunday = todayCard(WEEK, 6, 12 * 60);
    assert.equal(sunday.countdown, null);
    assert.equal(sunday.range, null);
    assert.equal(sunday.open, false);
    // Durum KELİMEYLE yazılır, renge emanet değil.
    assert.equal(sunday.statusWord, 'Şu anda kapalı');
});

test('açıkken geri sayım saat ve dakikayı birlikte söyler', () => {
    const card = todayCard(WEEK, 3, 9 * 60 + 41);
    assert.equal(card.open, true);
    assert.equal(card.statusWord, 'Şu anda açık');
    assert.equal(card.countdown, 'kapanışa 10 sa 19 dk');
    assert.equal(card.range, '09:00 – 20:00');
});

test('kapanıştan sonra geri sayım YAZILMAZ — "0 dk" bir yalan olurdu', () => {
    const card = todayCard(WEEK, 3, 21 * 60);
    assert.equal(card.open, false);
    assert.equal(card.countdown, null);
    // Saatler yine yazılır: gün kapalı değil, saat geçmiş.
    assert.equal(card.range, '09:00 – 20:00');
});

test('kicker Türkçe büyütmeyle — noktalı İ', () => {
    assert.equal(todayCard(WEEK, 3, 10 * 60).kicker, 'BUGÜN · PERŞEMBE');
});

// ── Çalışma saatleri ────────────────────────────────────────────────────────

test('"tüm günlere uygula" KAPALI GÜNÜ AÇMAZ', () => {
    const source = { day: 0, open: 8 * 60, close: 22 * 60, closed: false };
    const next = applyToAllDays(WEEK, source);
    const sunday = next.find((day) => day.day === 6);
    assert.equal(sunday.closed, true);
    // Kapalı günün saatleri de değişmez.
    assert.equal(sunday.open, 10 * 60);
    // Açık günler kopyalanır.
    assert.equal(next.find((day) => day.day === 4).close, 22 * 60);
});

test('basamak sınırı: açılış kapanışı geçemez', () => {
    let day = { day: 0, open: 9 * 60, close: 9 * 60 + 30, closed: false };
    day = stepHour(day, 'open', 1);
    assert.equal(day.open, 9 * 60 + 15);
    // Bir adım daha: kapanışa dayanır, geçmez.
    day = stepHour(day, 'open', 1);
    assert.equal(day.open, 9 * 60 + 15);
    // Kapanış açılışın altına inemez.
    day = stepHour(day, 'close', -1);
    assert.equal(day.close, 9 * 60 + 30);
});

test('kapalı gün saat yerine KELİME gösterir', () => {
    assert.equal(dayValueLabel({ day: 6, open: 600, close: 1080, closed: true }), 'Kapalı');
    assert.equal(dayValueLabel({ day: 0, open: 540, close: 1200, closed: false }), '09:00 – 20:00');
});

test('gün adları Pazartesi’den başlar', () => {
    assert.equal(dayName(0), 'Pazartesi');
    assert.equal(dayName(6), 'Pazar');
});

test('özet kapalı günü adıyla söyler', () => {
    assert.equal(hoursSummary(WEEK), '7 gün · Pazar kapalı');
    const allOpen = WEEK.map((day) => ({ ...day, closed: false }));
    assert.equal(hoursSummary(allOpen), '7 gün · her gün açık');
});

test('yedi gün tek ekrana sığar — kaydırma bu ekranın şartı değil', () => {
    // 52 (nav) + 7 × 60 = 472 pt; 375 pt’lik telefonun gövdesi 647 pt.
    assert.ok(profileMetrics.navHeight + 7 * profileMetrics.dayHeight < 647);
});

// ── Hizmetler ───────────────────────────────────────────────────────────────

test('fiyatsız hizmet "fiyat yok" der — ₺0 ASLA yazılmaz', () => {
    assert.equal(formatPrice(null), 'fiyat yok');
    // Sıfır bir FİYATTIR (ücretsiz hizmet), boşlukla aynı şey değil.
    assert.equal(formatPrice(0), '₺0');
    assert.equal(formatPrice(1800), '₺1.800');
});

test('boş fiyat alanı null verir — "0" ile boş AYNI ŞEY DEĞİL', () => {
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('   '), null);
    assert.equal(parsePrice('0'), 0);
    assert.equal(parsePrice('1.800'), 1800);
});

test('özet ve uyarı eksik fiyatı sayar; eksik yoksa satır çizilmez', () => {
    const list = [
        { id: 'a', name: 'Kesim', minutes: 30, price: 500, color: '#4FA3A0' },
        { id: 'b', name: 'Yıkama', minutes: 15, price: null, color: '#5B8FD9' },
    ];
    assert.equal(servicesSummary(list), '2 hizmet · 1 fiyatsız');
    assert.match(priceWarning(list), /1 hizmetin fiyatı girilmemiş/);

    const priced = [list[0]];
    assert.equal(servicesSummary(priced), '1 hizmet');
    assert.equal(priceWarning(priced), null);
});

test('hizmet renkleri durum paletinin DIŞINDA', () => {
    // Turuncu, kırmızı, amber ve yeşil durum taşıyor; hizmet rengi taşımaz.
    const forbidden = ['#FF5A1F', '#E07272', '#D9A43B', '#5FBF64'];
    for (const color of SERVICE_COLORS) {
        assert.ok(!forbidden.includes(color.hex));
        // Renk tek başına anlam taşımaz: her rengin bir ADI var.
        assert.ok(color.name.length > 0);
    }
    assert.equal(SERVICE_COLORS.length, 6);
});

test('süre hapları tasarımdaki beş değer', () => {
    assert.deepEqual([...DURATION_CHIPS], [30, 45, 60, 90, 120]);
});

test('hizmeti olmayan salon boş hâl görür, boş liste değil', () => {
    assert.match(servicesScreen, /<EmptyBlock/);
    assert.match(servicesScreen, /İlk hizmeti ekle/);
});

// ── Bildirimler ve görünüm ──────────────────────────────────────────────────

test('hiçbiri açık değilse KELİME yazılır, "0 açık" değil', () => {
    assert.equal(notificationsSummary({ booked: false, cancelled: false, noshow: false, daily: false }), 'Kapalı');
    assert.equal(notificationsSummary({ booked: true, cancelled: true, noshow: true, daily: false }), '3 açık');
});

test('tema tercihi GERÇEKTEN uygulanır — ölü kontrol değil', () => {
    const theme = code('src/theme/index.tsx');
    assert.match(theme, /themeMode === 'system' \? scheme === 'dark' : themeMode === 'dark'/);
    assert.match(theme, /setThemeMode/);
    assert.match(code('app/(ortak)/profil/gorunum.tsx'), /setThemeMode\(option\.key\)/);
    assert.equal(themeLabel('system'), 'Sistem');
});

// ── Yasal ───────────────────────────────────────────────────────────────────

test('KVKK bağlantısı yoksa satır PASİF DEĞİL, HİÇ ÇİZİLMEZ', () => {
    const none = legalLinks(null);
    assert.equal(none.length, 1);
    assert.equal(none[0].key, 'privacy');

    const both = legalLinks('https://guzelsaclar.com/kvkk');
    assert.equal(both.length, 2);
    assert.equal(both[0].host, 'guzelsaclar.com');

    assert.equal(legalSummary(null), 'Gizlilik');
    assert.equal(legalSummary('https://x.com/kvkk'), 'KVKK · Gizlilik');
});

test('sürüm bandı Yasal ekranının dibinde, ana ekranda DEĞİL', () => {
    assert.doesNotMatch(home, /expoConfig|version/);
    assert.match(code('app/(ortak)/profil/yasal.tsx'), /expoConfig/);
});

// ── Hesap silme ─────────────────────────────────────────────────────────────

test('tek müdürde onay kutusu var; ikinci müdür varsa YOK', () => {
    const base = {
        businessName: 'Güzel Saçlar', businessLocation: 'Kadıköy',
        managerName: 'Meltem Arda', managerEmail: 'm@x.com',
        appointments: 312, customers: 148, services: 9, staff: ['Ece', 'Merve'],
    };
    const sole = deletionCopy({ ...base, soleManager: true });
    assert.ok(sole.consent);
    // Kutu "hesabımı siliyorum" demiyor — işletmenin yıkımını beyan ediyor.
    assert.match(sole.consent, /İşletmenin ve içindeki tüm randevuların/);
    assert.equal(sole.lines.length, 3);

    const shared = deletionCopy({ ...base, soleManager: false });
    assert.equal(shared.consent, null);
    assert.equal(shared.lines.length, 2);
    assert.match(shared.lead, /işletme, randevular ve müşteriler yerinde kalır/);
});

test('onay kutusu işaretlenmeden silinemez', () => {
    const copy = deletionCopy({
        businessName: 'X', businessLocation: 'Y', managerName: 'Z',
        managerEmail: null, soleManager: true,
        appointments: 1, customers: 1, services: 1, staff: [],
    });
    assert.equal(canDelete(copy, false), false);
    assert.equal(canDelete(copy, true), true);
    // Onay kutusu olmayan hâlde koşul yok.
    const shared = deletionCopy({
        businessName: 'X', businessLocation: 'Y', managerName: 'Z',
        managerEmail: null, soleManager: false,
        appointments: 1, customers: 1, services: 1, staff: [],
    });
    assert.equal(canDelete(shared, false), true);
});

test('30 gün bir SAKLAMA süresi — vazgeçme penceresi olarak sunulmaz', () => {
    const copy = deletionCopy({
        businessName: 'X', businessLocation: 'Y', managerName: 'Z',
        managerEmail: null, soleManager: true,
        appointments: 1, customers: 1, services: 1, staff: [],
    });
    assert.match(copy.timing, /bu bir vazgeçme süresi değildir/);
    assert.match(copy.timing, /Silme hemen başlar/);
});

test('"SİL" yazdırma yok — Türkçede büyük harf tuzağı var', () => {
    assert.doesNotMatch(deleteScreen, /SİL yaz|"SİL"/);
    assert.match(deleteScreen, /<HoldToDelete/);
    assert.equal(HOLD_MS, 2000);
    assert.equal(profileMotion.holdMs, 2000);
});

test('"Hesabınız silindi" SUNUCU ONAYLAMADAN ekrana girmez', () => {
    // Uç artık var (`account-delete`) ama söz aynı: başarısız her yolda ekran
    // yerinde kalır ve hesabın DURDUĞU söylenir.
    assert.doesNotMatch(deleteScreen, /silindi/);
    assert.match(deleteScreen, /if \(!result\.ok\) \{/);
    assert.match(deleteScreen, /setFailed\(result\.reason \?\? 'server'\)/);
    // Başarı YALNIZ sunucunun `deleted` bayrağına bağlı.
    assert.match(api, /if \(!result\?\.deleted\)/);
    assert.match(api, /return \{ ok: true, reason: null \}/);
});

test('silme sebebi kullanıcıya söylenir — tek bir "hata oldu" yetmez', () => {
    // Sebepler atılacak adımı değiştiriyor: yetkisi yoksa tekrar denemenin
    // anlamı yok, oturumu düşmüşse girmesi gerekiyor.
    for (const reason of ['forbidden', 'no-session', 'subscription']) {
        assert.match(lib, new RegExp(`reason === '${reason}'`));
    }
    // Hepsinde aynı güvence: hesap duruyor.
    for (const line of [
        'Bu işletmeyi yalnız sahibi silebilir. Hesabınız olduğu gibi duruyor.',
        'Aboneliğiniz iptal edilemediği için silme yapılmadı.',
    ]) {
        assert.ok(lib.includes(line), `eksik cümle: ${line}`);
    }
});

test('silmeden önce dışa aktarma yolu gösterilir', () => {
    // Salon kendi finansal kayıtlarını saklamak zorunda; uyarmadan silmek
    // "bütün ciro geçmişim gitti" sorumluluğunu bize bırakır.
    assert.match(deleteScreen, /DELETE_EXPORT_LABEL/);
    assert.match(lib, /Ayarlar → Veri/);
    // Adres bilinmiyorsa DÜĞME ÇİZİLMEZ.
    assert.match(deleteScreen, /action=\{appUrl \? \{/);
    assert.match(deleteScreen, /\} : null\}/);
});

test('yerel "bekleyen silme" kaydı YAZILMAZ — Apple 5.1.1(v) gerçek silme ister', () => {
    assert.doesNotMatch(settings, /pendingAccountDeletion|bekleyen silme kaydı yaz/);
    assert.doesNotMatch(deleteScreen, /pendingAccountDeletion/);
});

test('sayılar bilinmeden liste çizilmez', () => {
    // "312 randevu silinecek" cümlesi uydurulamaz.
    assert.match(deleteScreen, /if \(!copy\) return/);
    assert.match(settings, /readDeletionFacts/);
});

// ── Hareket sözleşmesi ──────────────────────────────────────────────────────

test('yalnız opacity, translate ve scale — renk ve yükseklik animasyonu yok', () => {
    for (const source of [parts, sheets]) {
        assert.doesNotMatch(source, /useNativeDriver: false/);
        assert.doesNotMatch(source, /LayoutAnimation|interpolateColor/);
    }
    // Anahtar iki ray üst üste: açık olan opacity ile çapraz solar.
    const sw = parts.slice(parts.indexOf('export function ProfileSwitch'));
    const body = sw.slice(0, sw.indexOf('const ABS ='));
    assert.match(body, /opacity: on/);
    assert.match(body, /translateX/);
});

test('anahtarın rengi bilgi taşımaz — kelime her hâlde ekranda', () => {
    const row = parts.slice(parts.indexOf('export function SwitchRow'));
    assert.match(row.slice(0, 1200), /value \? 'Açık' : 'Kapalı'/);
    assert.match(row.slice(0, 1200), /accessibilityRole="switch"/);
});

test('dolum rayı SOLDAN dolar', () => {
    // scaleX varsayılan olarak merkezden büyür; ortadan iki yana açılırdı.
    assert.match(parts, /transformOrigin: 'left'/);
});

test('basamak düğmelerinde hitSlop YOK — yanlışlıkla 15 dk kaymasın', () => {
    const stepper = parts.slice(parts.indexOf('export function Stepper'));
    assert.doesNotMatch(stepper.slice(0, 2600), /hitSlop/);
});

test('textTransform hiçbir yerde yok — i harfi I’ya döner', () => {
    for (const source of [parts, sheets, home, hoursScreen, servicesScreen, deleteScreen]) {
        assert.doesNotMatch(source, /textTransform/);
    }
});

// ── Ölçüler ─────────────────────────────────────────────────────────────────

test('ölçü jetonları tasarımın CSS’iyle birebir', () => {
    assert.equal(profileMetrics.rowHeight, 56);
    assert.equal(profileMetrics.rowBigHeight, 68);
    assert.equal(profileMetrics.dayHeight, 60);
    assert.equal(profileMetrics.stepperHeight, 60);
    assert.equal(profileMetrics.stepperButton, 60);
    assert.equal(profileMetrics.stepperNumber, 30);
    assert.equal(profileMetrics.serviceHeight, 62);
    assert.equal(profileMetrics.fieldHeight, 54);
    assert.equal(profileMetrics.switchWidth, 47);
    assert.equal(profileMetrics.switchKnob, 23);
    assert.equal(profileMetrics.checkbox, 26);
    assert.equal(profileMetrics.dangerHeight, 56);
    assert.equal(profileMetrics.holdBarHeight, 4);
    assert.equal(profileMetrics.cardRadius, 22);
    // 112 = yüzen tab bar (66) + alt boşluk (46).
    assert.equal(profileMetrics.bottomInset, 112);
});

test('hiçbir dokunma hedefi 44’ün altına inmez', () => {
    const targets = [
        profileMetrics.rowHeight,
        profileMetrics.dayHeight,
        profileMetrics.stepperButton,
        profileMetrics.chipHeight,
        profileMetrics.swatch,
        profileMetrics.dangerHeight,
        profileMetrics.checkRowHeight,
        profileMetrics.buttonHeight,
    ];
    for (const target of targets) assert.ok(target >= 44, `hedef ${target} < 44`);
});

// ── Rotalar ─────────────────────────────────────────────────────────────────

test('müdürün hesabına ARTIK bir yol var', () => {
    // Ekran yazılmıştı ve müdür rolünü tanıyordu; eksik olan yoldu.
    assert.match(home, /router\.push\('\/\(staff-flow\)\/account'\)/);
});

test('silme kendi ekranında — hesap ekranındaki satır oraya gider', () => {
    const account = code('app/(staff-flow)/account.tsx');
    assert.match(account, /router\.push\('\/\(manager-flow\)\/profil\/hesap-sil'\)/);
});

test('tek işletmeli müdürde "İşletme değiştir" ÇİZİLMEZ', () => {
    const account = code('app/(staff-flow)/account.tsx');
    assert.match(account, /isManager && businesses\.length > 1 \?/);
});

test('profil alt ekranları yığına kayıtlı', () => {
    const layout = code('app/_layout.tsx');
    for (const name of ['saatler', 'hizmetler', 'gorunum', 'bildirimler', 'yasal', 'hesap-sil']) {
        assert.match(layout, new RegExp(`profil/${name}`));
    }
});

// ── Saf kütüphane ───────────────────────────────────────────────────────────

test('karar katmanı saf — React, react-native, Expo yok', () => {
    const lib = code('src/lib/managerProfile.ts');
    assert.doesNotMatch(lib, /from 'react|from "react|from 'expo|react-native/);
});

test('saat biçimi iki basamaklı', () => {
    assert.equal(hhmm(9 * 60), '09:00');
    assert.equal(hhmm(20 * 60 + 30), '20:30');
    assert.equal(hhmm(0), '00:00');
});

// ── Hesap silme ucu (sunucu) ────────────────────────────────────────────────

test('silme hakkı yalnız owner\'da — admin işletmeyi yok edemez', () => {
    assert.match(fn, /if \(role !== 'owner'\) return json\(\{ error: 'forbidden_role' \}, 403\)/);
});

test('tek sahip değilse işletme DEĞİL, yalnız üyelik silinir', () => {
    // Bir ortağın ayrılması salonu kapatmaz: müşterileri, randevuları durur.
    assert.match(fn, /const soleOwner = \(owners\?\.length \?\? 0\) <= 1;/);
    assert.match(fn, /from\('organization_members'\)\s*\n\s*\.delete\(\)/);
});

test('tek sahipse organizations silinir — cascade gerisini alır', () => {
    // Şemadaki 33 FK ON DELETE CASCADE. Elle "temizlik" sorgusu YAZILMAZ:
    // cascade unutulan tabloyu da alır, elle yazılan liste almaz.
    assert.match(fn, /from\('organizations'\)\.delete\(\)\.eq\('id', orgId\)/);
});

test('abonelik ÖNCE iptal edilir; iptal edilemezse silme YAPILMAZ', () => {
    /*
     * Sıra tersine dönerse org silinmiş ama abonelik açık kalmış bir durum
     * doğar ve kimse fark etmez — org'u artık kimse açamayacağı için fatura
     * sessizce kesilmeye devam eder.
     */
    const cancelAt = fn.indexOf('const cancelled = await cancelSubscription');
    const deleteAt = fn.indexOf("from('organizations').delete()");
    assert.ok(cancelAt > 0 && deleteAt > cancelAt, 'iptal silmeden önce olmalı');
    assert.match(fn, /subscription_cancel_failed/);
});

test('iptal ANINDA — dönem sonu değil', () => {
    // İşletme siliniyorsa hizmet de o an bitmeli; yoksa karşılığında hiçbir
    // hizmet olmayan bir tahsilat daha döner.
    assert.match(fn, /JSON\.stringify\(\{ status: 'cancelled' \}\)/);
    assert.doesNotMatch(fn, /cancel_at_next_billing_date/);
});

test('auth kaydı EN SON silinir', () => {
    // Silindiği anda JWT geçersizleşir; sonraki adımlar yetkisiz kalırdı.
    const authAt = fn.indexOf('auth.admin.deleteUser');
    assert.ok(authAt > fn.indexOf("from('organizations').delete()"));
    // Auth silinemezse "silindi" DENMEZ: giriş yapabildiği sürece silinmemiştir.
    assert.match(fn, /auth_delete_failed/);
});

test('aboneliği olmayan salon da hesabını silebilir', () => {
    // Ödemeyen bir salonun hesabını silememesi için sebep yok.
    assert.match(fn, /if \(!providerRef\) return \{ ok: true \}/);
    assert.match(fn, /if \(!coreUrl \|\| !coreKey\) return \{ ok: true \}/);
});

// ── Tema seçimi sisteme de işlenir · 2026-08-30 ─────────────────────────────
//
// Tema bu uygulamanın kendi ayarıydı ve `Appearance` hiç dokunulmuyordu: JS
// koyu çiziyor, SİSTEM açık kalıyordu. Fark yerli bileşenlerde görünüyordu —
// en çok alt barda, çünkü iOS 26'da o bar gerçek Liquid Glass, yani saydam ve
// arkasındakini örnekliyor. Sekme değişiminde yeni ekran boyanana kadar arkada
// sistemin açık zemini duruyor, bar bir kare beyaza düşüyordu.

test('tema seçimi sistemin görünümüne de yazılır', () => {
    const src = readFileSync(new URL('../mobile/src/theme/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /Appearance\.setColorScheme/);
    // `system` seçiliyken sistem ZORLANMAZ: "cihazı takip et" demek, zorlamak
    // cihazın ayarını uygulamanın içinden kilitlerdi. RN 0.86'ya kadar bunun
    // adı `null`'dı; artık `'unspecified'`.
    assert.match(src, /themeMode === 'system' \? 'unspecified' : themeMode/);
    // Tercih değişince yeniden uygulanmalı; bir kez kurulup unutulamaz.
    assert.match(src, /\}, \[themeMode\]\);/);
});
