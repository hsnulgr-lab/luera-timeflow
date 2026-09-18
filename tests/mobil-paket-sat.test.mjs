/**
 * Müdür 35 · Paket sat + kartta "Randevu ver" + Gizlilik/Destek sayfaları.
 *
 * Tasarım: Downloads/finalssooo/A-paket-sat.html ve C-gizlilik-destek.html.
 * Masaüstü gerçeği: src/pages/BeautyPackages.tsx · SaleDrawer ve
 * src/hooks/useOrgPackages.ts · addPackage — telefon AYNI kaydı yazıyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
    PACKAGE_SALE_SECTORS, sellsPackages, saleOptions, suggestedPrice, perSession, planTitle,
    duplicateOf, duplicateLine, parsePrice, saleFailureText, newPlanId, clampSessions, saleMemo,
} from '../mobile/src/lib/packageSale.ts';
import { genitive } from '../mobile/src/lib/text.ts';
import { PRIVACY_URL, SUPPORT_URL, legalLinks } from '../mobile/src/lib/managerProfile.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const RULES = [{
    key: 'hamilelik', label: 'Hamilelik', note: 'gebelikte uygulanmaz',
    blocks: ['lazer'], legacyNamePattern: 'lazer|epilasyon',
}];
const PREGNANT = { hamilelik: true };

// ── Sektör kapısı ───────────────────────────────────────────────────────────

test('paket satışı yalnız masaüstünün satış çekmecesini açtığı sektörlerde', () => {
    const desk = read('../src/pages/PackagesPage.tsx');
    const line = /\[([^\]]+)\]\.includes\(known \|\| sector\)\) return <BeautyPackages/.exec(desk);
    assert.ok(line, 'masaüstünün sektör satırı bulunamadı');
    const deskSectors = line[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort();
    assert.deepEqual([...PACKAGE_SALE_SECTORS].sort(), deskSectors);
    assert.equal(sellsPackages('guzellik'), true);
    assert.equal(sellsPackages('dis'), false, 'klinikte paket tedavi planıdır');
    assert.equal(sellsPackages(null), false);
});

// ── Seçenekler ──────────────────────────────────────────────────────────────

test('şablon varsa liste şablonlardan; seans kilitli, kapalı olan sebebini söyler', () => {
    const { mode, options } = saleOptions({
        templates: [
            { id: 't1', name: 'Cilt bakımı', sessionCount: 10, price: 9000, color: '#5FBF64' },
            { id: 't2', name: 'Lazer epilasyon', sessionCount: 6, price: 7800, color: null },
        ],
        services: [{ id: 's1', name: 'Manikür', duration: 40, price: 300, color: null }],
        rules: RULES,
        fields: PREGNANT,
    });
    assert.equal(mode, 'template');
    assert.equal(options.length, 2, 'şablonlu salonda hizmetten paket satılmıyor');
    assert.equal(options[0].lockedSessions, 10);
    assert.equal(options[0].closed, null);
    assert.equal(options[1].closed, 'Hamilelik · gebelikte uygulanmaz', 'şablon etiketsiz → ada bakılır');
});

test('şablon yoksa hizmetler; etiketli hizmet etiketle kapanır', () => {
    const { mode, options } = saleOptions({
        templates: [],
        services: [
            { id: 's1', name: 'Diode', duration: 30, price: 1300, color: null, tags: ['lazer'] },
            { id: 's2', name: 'Manikür', duration: 40, price: 300, color: null, tags: ['el'] },
        ],
        rules: RULES,
        fields: PREGNANT,
    });
    assert.equal(mode, 'service');
    assert.equal(options[0].lockedSessions, null, 'hizmette seans elle girilir');
    assert.ok(options[0].closed, 'etiket "lazer" kapalı');
    assert.equal(options[1].closed, null);
});

test('bedel önerisi, seans başı, başlık — masaüstüyle aynı', () => {
    const tpl = { kind: 'template', id: 't', name: 'Cilt bakımı', color: null, lockedSessions: 10, price: 9000, duration: null, closed: null };
    const svc = { kind: 'service', id: 's', name: 'Cilt bakımı', color: null, lockedSessions: null, price: 900, duration: 45, closed: null };
    assert.equal(suggestedPrice(tpl, 3), 9000, 'şablon fiyatı seansla çarpılmaz');
    assert.equal(suggestedPrice(svc, 4), 3600, 'hizmet fiyatı × seans');
    assert.equal(perSession(9000, 10), 900);
    assert.equal(clampSessions(0), 1);
    assert.equal(clampSessions(99), 50, 'DB kısıtı 1–50');
    assert.equal(planTitle('Lazer', 10), 'Lazer · 10 seans');
    assert.equal(planTitle('Lazer', 1), 'Lazer');
    const desk = read('../src/pages/BeautyPackages.tsx');
    assert.match(desk, /title: count > 1 \? `\$\{service\.name\} · \$\{count\} seans` : service\.name/,
        'masaüstünün başlık kalıbı değiştiyse telefon da değişmeli');
});

test('çift paket: hakkı kalan aynı hizmet uyarır, biten uyarmaz', () => {
    const packs = [
        { name: 'Cilt bakımı · 10 seans', total_sessions: 10, used_sessions: 4 },
        { name: 'Lazer · 6 seans', total_sessions: 6, used_sessions: 6 },
    ];
    const dup = duplicateOf('Cilt bakımı', packs);
    assert.ok(dup);
    assert.equal(duplicateLine(dup), 'Cilt bakımı · 10 seans · 4/10 · 6 hak duruyor');
    assert.equal(duplicateOf('Lazer', packs), null, 'tükenmiş paket uyarmaz');
});

test('bedel alanı yalnız rakam; boş alan 0 değil', () => {
    assert.equal(parsePrice('₺9.000'), 9000);
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('abc'), null);
});

test('cevapsız yazma "yazılmadı" demez — yazılmış olabilir', () => {
    assert.doesNotMatch(saleFailureText('failed'), /yazılmadı/);
    assert.match(saleFailureText('failed'), /ikinci paket açmaz/);
    assert.match(saleFailureText('paused'), /yazılmadı/);
});

test('plan kimliği istemcide: UUID v4', () => {
    const id = newPlanId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(newPlanId(), id);
});

test('satış hafızası: başarı ve başarısızlık kart için bırakılır', () => {
    saleMemo.created('c1', 'p1');
    assert.deepEqual(saleMemo.peek('c1'), { kind: 'created', planId: 'p1' });
    saleMemo.clear('c1');
    assert.equal(saleMemo.peek('c1'), null);
});

test('ilgi hâli: onay cümlesindeki "…’nin hesabına"', () => {
    assert.equal(genitive('Ayşe'), 'Ayşe’nin');
    assert.equal(genitive('Murat'), 'Murat’ın');
    assert.equal(genitive('Nur'), 'Nur’un');
    assert.equal(genitive('Gül'), 'Gül’ün');
    assert.equal(genitive('Kaan'), 'Kaan’ın');
    assert.equal(genitive('Selin'), 'Selin’in');
});

// ── Veri: doğru tablo ───────────────────────────────────────────────────────

test('paketler treatment_plans (tür paket) + eski tablodan — kartın, randevunun, günün hepsi', () => {
    const src = code(read('../mobile/src/lib/managerSource.ts'));
    const helper = src.slice(src.indexOf('export async function fetchPackageRows'), src.indexOf('export async function fetchPackageSaleRows'));
    assert.match(helper, /from\('treatment_plans'\)/);
    assert.match(helper, /eq\('plan_kind', 'paket'\)/);
    assert.match(helper, /neq\('status', 'cancelled'\)/);
    assert.match(helper, /from\('customer_packages'\)/, 'fizyoterapinin ticari hakkı eski tabloda');
    assert.match(helper, /in\('treatment_plan_id', planIds\)/, 'kalan yalnız o pakete bağlı tahsilattan');
    const outside = src.replace(helper, '');
    assert.doesNotMatch(outside, /from\('customer_packages'\)/, 'eski tabloyu doğrudan okuyan yer kalmadı');
    assert.equal((src.match(/fetchPackageRows\(organizationId/g) || []).length, 4, 'bağlam · kart · satış · gün');
});

test('personel kartı da masaüstünde satılan paketi görür', () => {
    const api = read('../supabase/functions/staff-api/index.ts');
    assert.match(api, /from\('treatment_plans'\)\.select\('id, title, session_count, sessions_done'\)/);
    assert.match(api, /\.eq\('plan_kind', 'paket'\)/);
});

// ── Yazma ───────────────────────────────────────────────────────────────────

test('createPackage: masaüstünün satırı, istemci kimliği, 23505 başarı, para yok', () => {
    const src = code(read('../mobile/src/lib/managerWrite.ts'));
    const fn = src.slice(src.indexOf('export async function createPackage'));
    assert.match(fn, /id: input\.id/);
    assert.match(fn, /plan_kind: 'paket'/);
    assert.match(fn, /sessions_done: 0/);
    assert.match(fn, /status: 'active'/);
    assert.match(fn, /writesPaused\(\)/, 'vana kapalıysa yazılmıyor');
    assert.match(fn, /'23505'/, 'aynı kimlik ikinci kez → var olanı doğrula');
    assert.doesNotMatch(fn, /from\('payments'\)/, 'telefon para yazmıyor');
    const desk = read('../src/hooks/useOrgPackages.ts');
    for (const col of ['organization_id', 'customer_id', 'title', 'total_amount', 'session_count', 'sessions_done', 'status', 'plan_kind']) {
        assert.match(desk, new RegExp(`${col}:`), `masaüstü ${col} yazıyor`);
        assert.match(fn, new RegExp(`${col}:`), `telefon ${col} yazıyor`);
    }
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('paket sat ekranı: iki adım, "Paketi oluştur", ödeme alanı yok', () => {
    const screen = code(read('../mobile/app/(manager-flow)/paket-sat.tsx'));
    assert.match(screen, /\{step\} \/ 2/);
    assert.match(screen, /'Paketi oluştur'/);
    assert.doesNotMatch(screen, /'Sat'/, 'birincil fiil "Sat" değil — para alındığını düşündürür');
    assert.doesNotMatch(screen, /[Pp]eşinat alanı|taksit sayısı|Ödeme yöntemi|Satan personel/);
    assert.match(screen, /Peşinat ve taksit masaüstünden/);
    assert.match(screen, /Kayıt güvenli · çift oluşturma engelli/);
    assert.match(screen, /Yine de satılabilir/, 'çift paket uyarı, engel değil');
    assert.doesNotMatch(screen, /geçerli|bitiş tarihi|validity/i, 'geçerlilik kaydedilmiyor, gösterilmiyor');
    // Kapalı satır Pressable değil.
    const closed = screen.slice(screen.indexOf('if (option.closed) {'), screen.indexOf('return (\n        <Pressable'));
    assert.ok(closed.length > 0);
    assert.doesNotMatch(closed, /Pressable/);
    assert.match(closed, /KAPALI/);
    assert.match(screen, /saleMemo\.(created|failed)/, 'sonuç kartta söyleniyor, bu ekranda değil');
    assert.doesNotMatch(screen, /Paket oluşturuldu/, 'onay mesajı yok — satırın kendisi onay');
});

test('kart: "Randevu ver" kimlik ve riskin altında tek dolu turuncu; Hesap\'ta "Paket sat"', () => {
    const card = code(read('../mobile/src/components/CustomerCard.tsx'));
    const book = card.indexOf('<BookButton');
    const risk = card.indexOf('UYARI · HİZMET KAPALI');
    const upcoming = card.indexOf('Yaklaşan randevu,');
    assert.ok(risk < book && book < upcoming, 'sıra: risk → Randevu ver → yaklaşan');
    assert.match(card, /backgroundColor: c\.or,/);
    assert.match(card, /label="Paket sat"/);
    assert.match(card, /canSellPackage/);
    assert.match(card, /ödenmedi/, 'paket satırı kendi kalanını söyler');
    assert.doesNotMatch(card, /Borç yok/, 'toplam borç kartta hesaplanmıyor');
    assert.match(card, /Paket oluşturulamadı/);
    assert.match(card, /Yeniden dene/);
});

// ── Gizlilik / Destek ───────────────────────────────────────────────────────

test('gizlilik ve destek: iki adres, aynı içerik, yayın öncesi kutusu yok', () => {
    assert.ok(existsSync(new URL('../public/gizlilik.html', import.meta.url)));
    assert.ok(existsSync(new URL('../public/destek.html', import.meta.url)));
    const g = read('../public/gizlilik.html');
    const d = read('../public/destek.html');
    const norm = (s) => s.replace(/<title>[^<]*<\/title>/, '').replace('<body data-start="D">', '<body>');
    assert.equal(norm(g), norm(d), 'iki dosya aynı içerik');
    assert.doesNotMatch(g, /class="draft"/, 'yayın öncesi kutusu yayımlanan dosyada yok');
    assert.doesNotMatch(g, /\bPIN\b/, 'uygulama "şifre" diyor');
    assert.match(g, /Şifreyi sıfırla/);
    assert.match(g, /Profil → Hesap/);
    assert.match(g, /arşivleyebilir/, 'masaüstü müşteriyi silmiyor, arşivliyor');
    assert.doesNotMatch(g, /uygulama içinden bilgi verilir/, 'böyle bir özellik yok');
    assert.doesNotMatch(g, /luera\.app/);
});

test('uygulamadaki gizlilik satırı yayımlanan sayfaya açılıyor', () => {
    assert.equal(PRIVACY_URL, 'https://timeflow.lueratech.com/gizlilik.html');
    assert.equal(SUPPORT_URL, 'https://timeflow.lueratech.com/destek.html');
    const privacy = legalLinks(null).find((link) => link.key === 'privacy');
    assert.equal(privacy.url, PRIVACY_URL);
    assert.equal(privacy.host, 'timeflow.lueratech.com');
});

test('hesap silme cümlesi uygulamayla sayfada aynı', () => {
    const profile = read('../mobile/src/lib/managerProfile.ts');
    const g = read('../public/gizlilik.html');
    assert.match(profile, /Yedeklerdeki kopyalar 30 gün içinde döngüden çıkar/);
    assert.match(g, /30 gün içinde/);
    assert.match(g, /Silme hemen başlar/);
});
