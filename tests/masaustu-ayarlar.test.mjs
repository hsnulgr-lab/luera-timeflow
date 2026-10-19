// Masaüstü Ayarlar v1.1 (2026-10-19) — model, Apple belge iptali ve sözleşmeler.
//
// Tasarım: "Luera Masaustu - Ayarlar v1.1". Brief: docs/ayarlar-claude-design-prompt.md.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import {
    legacyTabTarget, sectionFromPath, sectionHref, searchSettings, resourcesLabel, visibleSections,
    dativeTr, genitiveTr, withCase, genitiveOf, ablativeSuffix, sinceText, dayLocative,
    holdCaption, roleLabel, instagramHandle, instagramUrl, hoursValid, slugLive, draftSummary, recipeChangeSummary,
    nameGenitive, nameLocative,
    SERVICE_SWATCHES,
} from '../src/pages/settings/ayarlarModel.ts';
import { clientSecret, revokeApple } from '../supabase/functions/account-delete/apple.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── Adresler ────────────────────────────────────────────────────────────────

test('eski ?tab= adresleri yeni bölümlere gider — hiçbiri kırılmaz', () => {
    assert.equal(legacyTabTarget('booking'), '/settings/online-randevu');
    assert.equal(legacyTabTarget('hours'), '/settings/calisma-saatleri');
    assert.equal(legacyTabTarget('services'), '/settings/hizmetler');
    assert.equal(legacyTabTarget('whatsapp'), '/settings/whatsapp');
    assert.equal(legacyTabTarget('billing'), '/settings/abonelik');
    assert.equal(legacyTabTarget('data'), '/settings/verileriniz');
    assert.equal(legacyTabTarget(null), null);
    assert.equal(legacyTabTarget('yok-boyle-sekme'), null);
});

test('Kurulum\'un yazdığı ve bugüne kadar KIRIK olan ?tab=veri de Verileriniz\'e gider', () => {
    assert.equal(legacyTabTarget('veri'), '/settings/verileriniz');
    assert.doesNotMatch(read('src/pages/SetupWizardPage.tsx'), /settings\?tab=veri/);
});

test('yol → bölüm; tanınmayan yol Özet', () => {
    assert.equal(sectionFromPath('/settings'), 'ozet');
    assert.equal(sectionFromPath('/settings/'), 'ozet');
    assert.equal(sectionFromPath('/settings/hizmetler'), 'hizmetler');
    assert.equal(sectionFromPath('/settings/kaynaklar'), 'kaynaklar');
    assert.equal(sectionFromPath('/settings/olmayan'), 'ozet');
    assert.equal(sectionHref('ozet'), '/settings');
    assert.equal(sectionHref('hesabim'), '/settings/hesabim');
});

test('kaynak türü olmayan sektörde Kaynaklar menüden düşer', () => {
    assert.ok(visibleSections(true).some((s) => s.id === 'kaynaklar'));
    assert.ok(!visibleSections(false).some((s) => s.id === 'kaynaklar'));
    assert.equal(resourcesLabel([]), null);
});

// ── Arama ───────────────────────────────────────────────────────────────────

test('arama: tasarımdaki örnekler doğru ayarı bulur', () => {
    assert.equal(searchSettings('fiyat')?.[0]?.name, 'Ücret');
    assert.equal(searchSettings('fiyat')?.[0]?.section, 'hizmetler');
    assert.ok(searchSettings('şifre')?.some((e) => e.section === 'hesabim'));
    assert.ok(searchSettings('sil')?.some((e) => e.name === 'Hesabı sil'));
    assert.ok(searchSettings('csv')?.some((e) => e.section === 'verileriniz'));
    assert.ok(searchSettings('kvkk')?.some((e) => e.anchor === 'ay-kvkk'));
    assert.ok(searchSettings('koltuk')?.some((e) => e.section === 'kaynaklar'));
});

test('arama: 2 harften kısası "yazın" hâli, bulunamayan boş — öneri uydurulmaz', () => {
    assert.equal(searchSettings('f'), null);
    assert.deepEqual(searchSettings('vergi'), []);
});

// ── Türkçe ekler ────────────────────────────────────────────────────────────

test('kaynak adları sektörün kelimesiyle çoğul (tamlamada iyelik arkaya geçer)', () => {
    assert.equal(resourcesLabel(['Kabin']), 'Kabinler');
    assert.equal(resourcesLabel(['Koltuk', 'Yıkama']), 'Koltuklar');
    assert.equal(resourcesLabel(['Ünite']), 'Üniteler');
    assert.equal(resourcesLabel(['Oda']), 'Odalar');
    assert.equal(resourcesLabel(['Terapi alanı']), 'Terapi alanları');
    assert.equal(resourcesLabel(['Toplantı odası']), 'Toplantı odaları');
});

test('yönelme ve tamlayan ekleri — "bir kabine de", "koltuğun kapasitesi"', () => {
    assert.equal(dativeTr('Kabin'), 'kabine');
    assert.equal(dativeTr('Koltuk'), 'koltuğa');
    assert.equal(dativeTr('Oda'), 'odaya');
    assert.equal(dativeTr('Terapi alanı'), 'terapi alanına');
    assert.equal(genitiveTr('Kabin'), 'kabinin');
    assert.equal(genitiveTr('Koltuk'), 'koltuğun');
    assert.equal(genitiveTr('Ünite'), 'ünitenin');
    assert.equal(genitiveTr('Prova odası'), 'prova odasının');
});

test('S2 penceresinin cümlesi: "İşletme profili\'nde … Hizmetler\'e geçmeden"', () => {
    assert.equal(withCase('İşletme profili', 'loc'), "İşletme profili'nde");
    assert.equal(withCase('Hizmetler', 'dat'), "Hizmetler'e");
    assert.equal(withCase('Online randevu', 'dat'), "Online randevu'ya");
    assert.equal(withCase('Kabinler', 'loc'), "Kabinler'de");
    assert.equal(withCase('Koltuklar', 'dat'), "Koltuklar'a");
    assert.equal(withCase('Terapi alanları', 'loc'), "Terapi alanları'nda");
});

test('Özet: "3 hizmet · 1\'inin ücreti yok"', () => {
    assert.equal(genitiveOf(1), "1'inin");
    assert.equal(genitiveOf(2), "2'sinin");
    assert.equal(genitiveOf(3), "3'ünün");
    assert.equal(genitiveOf(6), "6'sının");
    assert.equal(genitiveOf(9), "9'unun");
    assert.equal(genitiveOf(10), "10'unun");
});

test('WhatsApp: "Bağlı · 9 Eylül 2026\'dan beri" — numara yok, tarih var', () => {
    assert.equal(ablativeSuffix(2026), 'dan');
    assert.equal(ablativeSuffix(2023), 'ten');
    assert.equal(ablativeSuffix(2020), 'den');
    assert.equal(ablativeSuffix(2030), 'dan');
    assert.equal(sinceText('2026-09-09T10:00:00Z'), "9 Eylül 2026'dan beri");
    assert.equal(sinceText(null), null);
});

test('Abonelik: "her ayın 9\'unda"', () => {
    assert.equal(dayLocative(9), "9'unda");
    assert.equal(dayLocative(1), "1'inde");
    assert.equal(dayLocative(6), "6'sında");
    assert.equal(dayLocative(20), "20'sinde");
});

// ── Küçük kurallar ──────────────────────────────────────────────────────────

test('basılı tutma yazısı tasarım H4 ile aynı', () => {
    assert.equal(holdCaption(0, false), 'Silmek için 2 saniye basılı tutun');
    assert.equal(holdCaption(0.6, false), 'Bırakmayın · 0,8 sn');
    assert.equal(holdCaption(1, true), 'Siliniyor…');
});

test('rol etiketi: owner → "İşletme sahibi"; bilinmeyen rol uydurulmaz', () => {
    assert.equal(roleLabel('owner'), 'İşletme sahibi');
    assert.equal(roleLabel('admin'), 'Yönetici');
    assert.equal(roleLabel(null), null);
    assert.equal(roleLabel('Admin'), null);
});

test('Instagram: kayıt tam adres, ekran kullanıcı adı; tanınmayan değer yutulmaz', () => {
    assert.equal(instagramHandle('https://instagram.com/funi.guzellik'), 'funi.guzellik');
    assert.equal(instagramHandle('https://www.instagram.com/funi.guzellik/?hl=tr'), 'funi.guzellik');
    assert.equal(instagramHandle('@funi'), 'funi');
    assert.equal(instagramUrl('funi.guzellik'), 'https://instagram.com/funi.guzellik');
    assert.equal(instagramUrl('@funi'), 'https://instagram.com/funi');
    assert.equal(instagramUrl('https://linktr.ee/funi'), 'https://linktr.ee/funi');
    assert.equal(instagramUrl(''), '');
});

test('çalışma saati: bitiş başlangıçtan sonra olmalı', () => {
    assert.ok(hoursValid('09:00', '20:00'));
    assert.ok(!hoursValid('19:00', '10:00'));
    assert.ok(!hoursValid('09:00', '09:00'));
});

test('randevu adresi yazarken çevrilir, sondaki tire yutulmaz', () => {
    assert.equal(slugLive('Güzel Salon'), 'guzel-salon');
    assert.equal(slugLive('Fuki Salon '), 'fuki-salon-');
    assert.equal(slugLive('-Çiçek!!'), 'cicek');
});

test('kaydet çubuğunun alt satırı: "1 alan · İşletme adı"', () => {
    assert.equal(draftSummary(['İşletme adı']), '1 alan · İşletme adı');
    assert.equal(draftSummary(['Adres', 'Telefon', 'Hakkında']), '3 alan · Adres, Telefon, …');
    assert.equal(draftSummary([]), '');
});

test('hizmet renkleri tasarımın sekiz hazır rengi', () => {
    assert.equal(SERVICE_SWATCHES.length, 8);
    assert.ok(SERVICE_SWATCHES.includes('#8C7BC4'));
});

// ── Apple belge iptali (TN3194 · B yolu) ────────────────────────────────────

async function testKey() {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
    const b64 = Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n');
    return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`, publicKey: kp.publicKey };
}
const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const idToken = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`;

test('istemci sırrı ES256 imzalı, Apple\'ın istediği alanlarla ve doğrulanabilir', async () => {
    const { pem, publicKey } = await testKey();
    const jwt = await clientSecret(pem, 'ai.luera.timeflow.web', 1_800_000_000);
    const [h, b, sig] = jwt.split('.');
    const head = JSON.parse(b64urlDecode(h));
    const body = JSON.parse(b64urlDecode(b));
    assert.deepEqual(head, { alg: 'ES256', kid: 'NSKX9A75PZ', typ: 'JWT' });
    assert.equal(body.iss, '5MYM3Z5C9R');
    assert.equal(body.sub, 'ai.luera.timeflow.web');
    assert.equal(body.aud, 'https://appleid.apple.com');
    assert.equal(body.exp - body.iat, 300);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, b64urlDecode(sig), new TextEncoder().encode(`${h}.${b}`));
    assert.ok(ok, 'imza doğrulanmadı');
});

function mockFetch(handler) {
    const calls = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: String(init?.body ?? '') }); return handler(String(url), init); };
    return { calls, restore: () => { globalThis.fetch = orig; } };
}
const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('Apple: kod belgeye çevrilip iptal edilir (web istemcisi, kayıtlı dönüş adresiyle)', async () => {
    const { pem } = await testKey();
    const m = mockFetch((url) => url.endsWith('/auth/token')
        ? jsonRes(200, { refresh_token: 'rt-1', access_token: 'at-1', id_token: idToken('apple-sub-1') })
        : new Response('', { status: 200 }));
    try {
        const out = await revokeApple({ code: 'c1', client: 'web', redirectUri: 'https://timeflow.lueratech.com/login', expectedSub: 'apple-sub-1', pem });
        assert.deepEqual(out, { kind: 'revoked' });
        assert.equal(m.calls.length, 2);
        assert.match(m.calls[0].body, /grant_type=authorization_code/);
        assert.match(m.calls[0].body, /client_id=ai\.luera\.timeflow\.web/);
        assert.match(m.calls[0].body, /redirect_uri=https%3A%2F%2Ftimeflow\.lueratech\.com%2Flogin/);
        assert.match(m.calls[1].url, /\/auth\/revoke$/);
        assert.match(m.calls[1].body, /token=rt-1/);
        assert.match(m.calls[1].body, /token_type_hint=refresh_token/);
    } finally { m.restore(); }
});

test('Apple: süresi dolmuş/geçersiz kod silmeyi DURDURUR (yeniden doğrulat)', async () => {
    const { pem } = await testKey();
    const m = mockFetch(() => jsonRes(400, { error: 'invalid_grant' }));
    try {
        assert.deepEqual(await revokeApple({ code: 'eski', client: 'ios', expectedSub: 's', pem }), { kind: 'code_invalid' });
    } finally { m.restore(); }
});

test('Apple: başka bir Apple Kimliğinin kodu silmeyi DURDURUR, iptal çağrılmaz', async () => {
    const { pem } = await testKey();
    const m = mockFetch(() => jsonRes(200, { refresh_token: 'rt', id_token: idToken('baskasi') }));
    try {
        assert.deepEqual(await revokeApple({ code: 'c', client: 'ios', expectedSub: 'benim', pem }), { kind: 'mismatch' });
        assert.equal(m.calls.length, 1, 'iptal isteği gitmemeliydi');
    } finally { m.restore(); }
});

test('Apple\'a ulaşılamıyor ya da anahtar yok → silme SÜRER (skipped)', async () => {
    const { pem } = await testKey();
    const m = mockFetch(() => { throw new TypeError('fetch failed'); });
    try {
        assert.deepEqual(await revokeApple({ code: 'c', client: 'ios', expectedSub: 's', pem }), { kind: 'skipped', reason: 'unreachable' });
    } finally { m.restore(); }
    assert.deepEqual(await revokeApple({ code: 'c', client: 'ios', expectedSub: 's', pem: null }), { kind: 'skipped', reason: 'not_configured' });
});

test('Apple: tanınmayan istemci ya da kayıtsız dönüş adresi reddedilir', async () => {
    assert.equal((await revokeApple({ code: 'c', client: 'android', expectedSub: null, pem: 'x' })).kind, 'bad_request');
    assert.equal((await revokeApple({ code: 'c', client: 'web', redirectUri: 'https://kotu.example/login', expectedSub: null, pem: 'x' })).kind, 'bad_request');
});

// ── Sözleşmeler (kaynak metni) ──────────────────────────────────────────────

const fn = strip(read('supabase/functions/account-delete/index.ts'));

test('account-delete: Apple adımı yetki kontrolünden SONRA, ilk silmeden ÖNCE', () => {
    const forbidden = fn.indexOf("if (role !== 'owner') return json({ error: 'forbidden_role' }, 403);");
    const apple = fn.indexOf('const appleStop = await appleStep();');
    const firstDelete = fn.indexOf("from('organizations').delete()");
    const cancel = fn.indexOf('const cancelled = await cancelSubscription');
    assert.ok(forbidden > 0 && apple > forbidden, 'Apple, sahip olmayana iptal yaptırmamalı');
    assert.ok(apple < cancel && apple < firstDelete, 'Apple kodu geçersizse hiçbir şey silinmemiş olmalı');
    assert.match(fn, /apple_code_invalid/);
    assert.match(fn, /apple_mismatch/);
});

test('account-delete: işletmesiz hesap kendini silebilir ama sahipsiz işletmeyi cascade ile götürmez', () => {
    assert.match(fn, /resolved\.error === 'no_org'/);
    assert.match(fn, /eq\('owner_id', userId\)/);
    assert.match(fn, /org_without_membership/);
});

test('account-delete: Apple modülü _shared\'a ve Core\'a bağlı değil', () => {
    const apple = read('supabase/functions/account-delete/apple.ts');
    assert.doesNotMatch(apple, /from '\.\.\/_shared/);
    assert.doesNotMatch(apple, /CORE_/);
    assert.doesNotMatch(apple, /insert|upsert/i, 'belge saklanmaz (B yolu)');
});

const shell = strip(read('src/pages/settings/AyarlarKabuk.tsx'));
const app = read('src/App.tsx');

test('rota: /settings/* yeni kabuğa; eski SettingsPage ve sekmeler kalktı', () => {
    assert.match(app, /path="settings\/\*" element=\{<Adaptive mobile=\{<MobileSettings \/>\} desktop=\{<AyarlarKabuk \/>\} \/>\}/);
    assert.ok(!existsSync(new URL('../src/pages/SettingsPage.tsx', import.meta.url)));
    assert.ok(!existsSync(new URL('../src/components/settings/WhatsAppTab.tsx', import.meta.url)));
    assert.match(shell, /legacyTabTarget\(params\.get\('tab'\)\)/);
});

const all = ['AyarlarKabuk.tsx', ...['Ozet', 'Isletme', 'Saatler', 'Hizmetler', 'Kaynaklar', 'Moduller', 'OnlineRandevu', 'WhatsApp', 'Sadakat', 'Hesabim', 'HesapSil', 'Bildirimler', 'Abonelik', 'Verileriniz', 'Webhook'].map((n) => `bolumler/${n}.tsx`)]
    .map((f) => strip(read(`src/pages/settings/${f}`))).join('\n');

test('tasarımdan çıkanlar yok: Yönetici PIN, LeadFlow/CallFlow entegrasyonları', () => {
    assert.doesNotMatch(all, /managerPin|manager_pin|Yönetici PIN/);
    assert.doesNotMatch(all, /LeadFlow|CallFlow|IntegrationCard/);
});

test('webhook metni gerçeği söyler; eski yanlış cümle ve örnek biçim yok', () => {
    const w = strip(read('src/pages/settings/bolumler/Webhook.tsx'));
    assert.match(w, /online randevu sayfasından/);
    assert.match(w, /Panelden girilen randevular, değişiklikler ve iptaller gönderilmez/);
    assert.match(w, /"customer_name"/);
    assert.doesNotMatch(w, /güncellendiğinde/);
    assert.doesNotMatch(w, /customerName/);
});

test('Abonelik: karşılığı olmayanlar çizilmez (v1.1)', () => {
    const a = strip(read('src/pages/settings/bolumler/Abonelik.tsx'));
    for (const word of ['VKN', 'e-arşiv', 'mahsup', 'iade edilir', '4417', 'Fatura bilgilerini düzenle']) {
        assert.ok(!a.includes(word), `"${word}" çizilmemeli`);
    }
    assert.match(a, /Fatura geçmişi/);
    assert.match(a, /istediğiniz an iptal edebilirsiniz/);
});

test('WhatsApp: hattın numarası uydurulmaz; 24/2 saat hatırlatmanın anahtarı yok', () => {
    const w = strip(read('src/pages/settings/bolumler/WhatsApp.tsx'));
    assert.doesNotMatch(w, /\+90 ?5\d\d/);
    assert.match(w, /sinceText\(connection\.connectedAt\)/);
    assert.match(w, /always: true/);
    assert.match(w, /Her zaman gider/);
    assert.match(w, /maxLength=\{4\}/, 'emoji tek alan, en çok 4 karakter');
});

test('Hesabı sil: "SİL" yazdırmak yok, 2 sn basılı tutma, kutu sabit altta, 30 gün yedek cümlesi', () => {
    const h = strip(read('src/pages/settings/bolumler/HesapSil.tsx'));
    assert.doesNotMatch(h, /SİL['"]/);
    assert.match(h, /const HOLD_MS = 2000/);
    assert.match(h, /İşletmenin tüm verilerinin silineceğini anlıyorum\./);
    assert.match(h, /Önce kutuyu işaretleyin\./);
    assert.match(h, /<b>30 gün içinde<\/b>/);
    // Kutu kaydırma alanında (ay-modal-b) DEĞİL, alt sabit kısımda.
    const body = h.indexOf('className="ay-modal-b"');
    const foot = h.indexOf("borderTop: '1px solid var(--bd)' }}>", body);
    assert.ok(h.indexOf('role="checkbox"') > foot, 'onay kutusu sabit alt kısımda olmalı');
    assert.match(h, /appleReauth\(\)/);
});

test('Hesabı sil: cevap gelmezse sonuç uydurulmaz; sunucu hatasında "hiçbir şey silinmedi" denmez', () => {
    const api = strip(read('src/pages/settings/hesapSilApi.ts'));
    assert.match(api, /reason: 'unknown'/);
    const h = read('src/pages/settings/bolumler/HesapSil.tsx');
    assert.match(h, /Sonucu doğrulayamadık\. Giriş yapmayı deneyin/);
    const server = h.match(/server: '([^']+)'/)?.[1] ?? '';
    assert.ok(server && !/silinmedi|duruyor/.test(server));
});

test('Hesabım: silme düğmesi yalnız işletme sahibinde; giriş yöntemleri salt okunur', () => {
    const h = strip(read('src/pages/settings/bolumler/Hesabim.tsx'));
    assert.match(h, /const owner = orgRole === 'owner'/);
    assert.match(h, /Hesap silme yalnız işletme sahibine açık\./);
    assert.doesNotMatch(h, /linkIdentity|unlinkIdentity/);
});

test('sol menü: gerçek rol, Profil → Hesabım, Booking Sayfam → Online randevu', () => {
    const s = read('src/components/layout/Sidebar.tsx');
    assert.match(s, /roleLabel\(orgRole\)/);
    assert.doesNotMatch(s, /\{user\?\.role \|\| 'User'\}/);
    assert.match(s, /handleNavClick\('\/settings\/hesabim'\)/);
    assert.match(read('src/lib/nav.ts'), /id: '\/settings\/online-randevu', label: 'Booking Sayfam'/);
    // Tasarım A6: Online randevu'dayken sol menüde yalnız "Ayarlar" yanar.
    assert.match(strip(s), /if \(path\.startsWith\('\/settings\/'\)\) return false;/);
});

test('reçete özeti satır sayar — tasarım A3 "Reçete · 1 satır eklendi"', () => {
    const a = { productId: 'a', quantity: 20 };
    const b = { productId: 'b', quantity: 1 };
    assert.equal(recipeChangeSummary([a], [a, b]), '1 satır eklendi');
    assert.equal(recipeChangeSummary([a, b], [a]), '1 satır silindi');
    assert.equal(recipeChangeSummary([a], [{ productId: 'a', quantity: 25 }]), '1 satır değişti');
    assert.equal(recipeChangeSummary([a], [b]), '1 satır eklendi, 1 satır silindi');
    assert.equal(recipeChangeSummary([a], [a]), '');
});

test('reçete satırı ürün adını düz yazar; ekleme stoktan seçtirir, miktarı boş satır kaydedilmez', () => {
    const h = strip(read('src/pages/settings/bolumler/Hizmetler.tsx'));
    assert.doesNotMatch(h, /aria-label="Ürün"/); // satır başına açılır liste yok
    assert.match(h, /function UrunSecici\(/);
    assert.match(h, /'Reçetede miktarı boş satır var\.'/);
    assert.match(h, /Reçete · \$\{recipeChangeSummary\(/);
});

test('reçete artık kaydediliyor (göç 122) ve kolon yoksa hizmet kaydı durmaz', () => {
    const r = read('src/hooks/useReservations.ts');
    assert.match(r, /recipe: recipeOf\(s\.recipe\)/);
    assert.match(r, /recipe: s\.recipe \?\? \[\]/);
    assert.match(r, /isMissingRecipeColumn\(error\)/);
    assert.match(read('supabase/122_hizmet_recetesi.sql'), /ADD COLUMN IF NOT EXISTS recipe jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
});

test('kaydet modeli: sağ üstte genel "Kaydet" yok; taslak sunucu onaylamadan "Kaydedildi" demez', () => {
    assert.doesNotMatch(shell, /Kaydet<\/button>/);
    const t = strip(read('src/pages/settings/useTaslak.ts'));
    assert.match(t, /if \(isTimeout\(out\)\) \{ setPhase\('unknown'\); return false; \}/);
    assert.match(t, /if \(out === true\) \{\s*setPhase\('saved'\)/);
});

test('bildirim tercihleri telefondakiyle aynı satırı okur; okunamayan "kapalı" çizilmez', () => {
    const b = strip(read('src/pages/settings/bolumler/Bildirimler.tsx'));
    assert.match(b, /select\('owner_id'\)/);
    assert.match(b, /notification_prefs/);
    assert.match(b, /const PREF_DEFAULT = true/);
    assert.match(b, /Tercihler okunamadı — yenileyin\./);
    assert.match(b, /eq\('updated_at', row\.stamp\)/);
});

test('işletme adına ek ünlü uyumuyla gelir — "TimeFlow\'deki" yazılmaz', () => {
    assert.equal(nameGenitive('Fu Ni'), "Fu Ni'nin");
    assert.equal(nameGenitive('Luera TimeFlow'), "Luera TimeFlow'un");
    assert.equal(nameGenitive('Kuaför Ahmet'), "Kuaför Ahmet'in");
    assert.equal(nameLocative('Fu Ni'), "Fu Ni'de");
    assert.equal(nameLocative('Luera TimeFlow'), "Luera TimeFlow'da");
    assert.equal(nameLocative('Studio Park'), "Studio Park'ta");
    const h = strip(read('src/pages/settings/bolumler/HesapSil.tsx'));
    assert.doesNotMatch(h, /\{biz\}'(nin|deki)/);
});

test('kabuk: bölüm değişince içerik başa döner; arama kutusu kayan listenin dışında', () => {
    const k = strip(read('src/pages/settings/AyarlarKabuk.tsx'));
    assert.match(k, /useLayoutEffect\(\(\) => \{ if \(scrollRef\.current\) scrollRef\.current\.scrollTop = 0; \}, \[current\]\)/);
    assert.match(k, /className="ay-scroll" ref=\{scrollRef\}/);
    const css = read('src/pages/settings/ayarlar.css');
    assert.match(css, /\.ay-nav > \.ay-groups \{[^}]*overflow-y: auto/);
    // Tailwind temel katmanı eşit özgüllükte sonra gelir: metin içi bağlantı (0,1,x) ile yazılır.
    assert.match(css, /\.ay a:not\(\[class\]\) \{[^}]*text-decoration: underline/);
});
