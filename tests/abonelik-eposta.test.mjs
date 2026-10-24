import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
    CHECKOUT_EVENT, claimWelcomeDue, displayName, dueMail, escapeHtml, isMagic, MAIL_FROM, MAIL_KINDS,
    MAIL_REPLY_TO, magicUrl, mailContent, maskEmail, paywallLoginUrl, sendableAt, trDaysLeft,
} from '../supabase/functions/abonelik-eposta/eposta.ts';

/*
 * Abonelik e-postaları + sihirli bağlantı — Faz 2.5 / 2.6 (devir 13).
 *
 * Telefon uygulaması ödemeden söz edemez (App Store 3.1.1 / 3.1.3): deneme
 * ve ödeme iletişimi YALNIZ e-postayla. Bu dosya dört şeyi kilitler:
 *   1. Hangi satıra hangi gün hangi e-posta düşer (saf `dueMail`) — TR
 *      takvim günüyle, sessiz saatle.
 *   2. Metinler: ENFORCE'a göre "salt okunur" cümlesi, işletme adı kaçırılır,
 *      sihirli bağlantı notu yalnız sihirli düğmede.
 *   3. Defter (göç 125) gerçek Postgres'te (PGlite): aynı e-posta iki kez
 *      ayrılmaz, hata 3 kez denenir, istemci rolleri dokunamaz. PGLITE_DIR
 *      verilmezse o testler atlanır:
 *        PGLITE_DIR=<pglite kurulu dizin> node --test tests/abonelik-eposta.test.mjs
 *   4. Uçlar: telefona giden bildirim yalnız durum söyler; paket ekranı ek
 *      süredeki salonu geri atmaz; girişten sonra paket ekranı; /baglanti
 *      kapının dışında.
 */

const H = 3_600_000;
const DAY = 24 * H;
const iso = (t) => new Date(t).toISOString();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumlar sıyrılır: açıklamada geçen bir kelime kodu "doğru" göstermesin. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// 24 Ekim 2026 Cumartesi, TR 12:30.
const NOW = Date.parse('2026-10-24T09:30:00Z');

function row(over = {}) {
    return {
        organization_id: 'org-1',
        state: 'trial',
        dodo_subscription_id: null,
        last_event: 'trial_phone',
        trial_ends_at: null,
        expires_at: iso(NOW + 5 * DAY),
        grace_until: null,
        ...over,
    };
}

// ── 1 · Kime, ne zaman ──────────────────────────────────────────────────────

test('kartsız deneme başında hoş geldiniz; dönem deneme TÜRÜ (bir kez)', () => {
    assert.deepEqual(dueMail(row(), NOW), { tur: 'hosgeldin', donem: 'trial_phone' });
    assert.deepEqual(dueMail(row({ last_event: 'trial_opening' }), NOW), { tur: 'hosgeldin', donem: 'trial_opening' });
});

test('bitişe 4 gün → hoş geldiniz, 3 gün ve altı → "3 gün kaldı" (dönem = bitiş)', () => {
    const at = (days) => row({ expires_at: iso(NOW + days * DAY) });
    assert.equal(dueMail(at(4), NOW).tur, 'hosgeldin');
    const d3 = dueMail(at(3), NOW);
    assert.deepEqual(d3, { tur: 'uc_gun', donem: iso(NOW + 3 * DAY) });
    assert.equal(dueMail(at(0.2), NOW).tur, 'uc_gun', 'bugün bitiyor');
});

test('gün TÜRKİYE takvimiyle sayılır: UTC 21:30 = TR ertesi gün', () => {
    // TR 24 Ekim 00:30; bitiş TR 27 Ekim 23:00 → 3 takvim günü. UTC tarihiyle
    // sayılsaydı 23 → 27 = 4 gün ("hoş geldiniz") çıkardı.
    const now = Date.parse('2026-10-23T21:30:00Z');
    const r = row({ expires_at: '2026-10-27T20:00:00Z' });
    assert.equal(trDaysLeft(Date.parse(r.expires_at), now), 3);
    assert.equal(dueMail(r, now).tur, 'uc_gun');
});

test('deneme bitti: 0–2. gün "bitti", 3–6. gün "son", 7. günden sonra HİÇBİR ŞEY', () => {
    const ended = (daysAgo) => row({ expires_at: iso(NOW - daysAgo * DAY) });
    assert.equal(dueMail(ended(0.05), NOW).tur, 'bitti');
    assert.equal(dueMail(ended(2), NOW).tur, 'bitti');
    assert.equal(dueMail(ended(3), NOW).tur, 'son');
    assert.equal(dueMail(ended(6), NOW).tur, 'son');
    assert.equal(dueMail(ended(7), NOW), null, 'anahtar geç açılırsa aylar önce bitene e-posta gitmez');
    assert.equal(dueMail(ended(2), NOW).donem, iso(NOW - 2 * DAY), 'dönem = bitiş anı');
});

test('kartsız denemede expires_at yoksa trial_ends_at okunur', () => {
    assert.equal(dueMail(row({ expires_at: null, trial_ends_at: iso(NOW + 2 * DAY) }), NOW).tur, 'uc_gun');
    assert.equal(dueMail(row({ expires_at: null, trial_ends_at: null }), NOW), null);
});

test('kartlı deneme, ödeyen, kilitli, demo, hediye ve elle yazılmış deneme e-posta ALMAZ', () => {
    assert.equal(dueMail(row({ dodo_subscription_id: 'sub_1', last_event: 'subscription.active' }), NOW), null, 'kartlı (Dodo) deneme');
    assert.equal(dueMail(row({ state: 'active', last_event: 'subscription.renewed', dodo_subscription_id: 'sub_1' }), NOW), null);
    assert.equal(dueMail(row({ state: 'locked' }), NOW), null);
    assert.equal(dueMail(row({ state: 'active', last_event: 'demo_manual', expires_at: null }), NOW), null);
    assert.equal(dueMail(row({ state: 'active', last_event: 'comp_manual' }), NOW), null);
    // Olay adı şart: iç hesaba elle yazılmış eski 'trial' satırına satış e-postası gitmez.
    assert.equal(dueMail(row({ last_event: 'manual_repair' }), NOW), null);
    assert.equal(dueMail(row({ last_event: null }), NOW), null);
});

test('siteden açılan hesap: hoş geldiniz yalnız hesabı talep AÇTIYSA, 2 gün içinde, talep başına bir kez (göç 127)', () => {
    const claim = (over = {}) => ({ id: 'c-1', organization_id: 'org-1', user_created: true, attached_at: iso(NOW - H), ...over });
    assert.deepEqual(claimWelcomeDue(claim(), NOW), { tur: 'hosgeldin', donem: 'site-c-1' });
    assert.equal(claimWelcomeDue(claim({ user_created: false }), NOW), null, 'var olan hesabın şifresi var');
    assert.equal(claimWelcomeDue(claim({ attached_at: null }), NOW), null, 'işletmeye bağlanmamış');
    assert.equal(claimWelcomeDue(claim({ organization_id: null }), NOW), null);
    assert.equal(claimWelcomeDue(claim({ attached_at: iso(NOW - 3 * DAY) }), NOW), null, 'tarama durmuşsa geç e-posta yok');
    // Kartsız denemenin hoş geldinizinden ayrı dönem: biri ötekini bloke etmez.
    assert.notEqual(claimWelcomeDue(claim(), NOW).donem, dueMail(row(), NOW).donem);
    // Düğme: site hoş geldinizi SİHİRLİ, kartsız denemeninki düz.
    assert.equal(isMagic('hosgeldin', CHECKOUT_EVENT), true);
    assert.equal(isMagic('hosgeldin', 'trial_phone'), false);
    for (const tur of ['uc_gun', 'bitti', 'son', 'odeme']) assert.equal(isMagic(tur, null), true, tur);
});

test('ödeme alınamadı: yalnız ek süre SÜRERKEN; dönem = ek sürenin sonu', () => {
    const g = iso(NOW + 30 * H);
    assert.deepEqual(dueMail(row({ state: 'grace', dodo_subscription_id: 'sub_1', last_event: 'subscription.on_hold', grace_until: g }), NOW), { tur: 'odeme', donem: g });
    assert.equal(dueMail(row({ state: 'grace', grace_until: iso(NOW - H) }), NOW), null, 'süresi geçmiş ek süre');
    assert.equal(dueMail(row({ state: 'grace', grace_until: null }), NOW), null);
});

test('sessiz saat: hatırlatmalar TR 09:00–21:00, hoş geldiniz ve ödeme her saat', () => {
    const tr = (hh, mm = 0) => Date.parse(`2026-10-24T${String(hh - 3).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
    for (const tur of ['uc_gun', 'bitti', 'son']) {
        assert.equal(sendableAt(tur, tr(8, 59)), false, `${tur} 08:59`);
        assert.equal(sendableAt(tur, tr(9)), true, `${tur} 09:00`);
        assert.equal(sendableAt(tur, tr(20, 59)), true, `${tur} 20:59`);
        assert.equal(sendableAt(tur, tr(21)), false, `${tur} 21:00`);
    }
    assert.equal(sendableAt('hosgeldin', tr(3)), true);
    assert.equal(sendableAt('odeme', tr(3)), true);
});

// ── 2 · Metinler ────────────────────────────────────────────────────────────

const ctx = (over = {}) => ({
    business: 'Lou Güzellik', to: 'kemal@gmail.com', link: 'https://timeflow.lueratech.com/baglanti#t=abc',
    magic: true, enforce: false, endsAt: iso(NOW + 3 * DAY), event: 'trial_phone', now: NOW, ...over,
});

test('her türün konusu, düğmesi ve düz metni var; düz metin bağlantıyı taşır', () => {
    const buttons = { hosgeldin: 'Paketleri gör', uc_gun: 'Paketimi seç', bitti: 'Paketimi seç', son: 'Paketimi seç', odeme: 'Kartımı güncelle' };
    for (const tur of MAIL_KINDS) {
        const c = mailContent(tur, ctx());
        assert.ok(c.subject.length > 5, tur);
        assert.ok(c.html.includes(buttons[tur]), `${tur} düğmesi`);
        assert.ok(c.text.includes(`${buttons[tur]}: https://timeflow.lueratech.com/baglanti#t=abc`), `${tur} düz metin bağlantı`);
        assert.ok(c.html.includes('href="https://timeflow.lueratech.com/baglanti#t=abc"'), `${tur} html bağlantı`);
        assert.ok(c.text.includes('kemal@gmail.com adresli'), 'altbilgi alıcıyı söyler');
    }
});

test('"3 gün kaldı" konusu güne göre: 3 / 2 gün, yarın, bugün', () => {
    const subj = (days) => mailContent('uc_gun', ctx({ endsAt: iso(NOW + days * DAY) })).subject;
    assert.equal(subj(3), 'Denemenizin bitmesine 3 gün kaldı');
    assert.equal(subj(2), 'Denemenizin bitmesine 2 gün kaldı');
    assert.equal(subj(1), 'Denemeniz yarın bitiyor');
    assert.equal(subj(0.1), 'Denemeniz bugün bitiyor');
});

test('hoş geldiniz: açılış denemesinin konusu ve başlığı ayrı', () => {
    assert.equal(mailContent('hosgeldin', ctx()).subject, "Luera TimeFlow'a hoş geldiniz");
    const opening = mailContent('hosgeldin', ctx({ event: 'trial_opening' }));
    assert.equal(opening.subject, 'TimeFlow ücretsiz denemeniz başladı');
    assert.ok(opening.text.startsWith('Ücretsiz denemeniz başladı.'));
});

test('siteden açılan hesabın hoş geldinizi: panele tek tık, şifre yolu, iptal; kartsız metni YOK', () => {
    const c = mailContent('hosgeldin', ctx({ event: CHECKOUT_EVENT, business: null }));
    assert.equal(c.subject, 'Luera TimeFlow hesabınız hazır');
    assert.ok(c.text.startsWith('Hesabınız hazır.'));
    assert.match(c.text, /^İşletmeniz için TimeFlow hesabınız açıldı ve ücretsiz denemeniz başladı\./m);
    assert.match(c.text, /Ayarlar › Abonelik'ten iptal ederseniz ücret alınmaz/);
    assert.match(c.text, /Hesabınızın e-postası: kemal@gmail\.com/);
    assert.match(c.text, /Ayarlar › Hesabım'dan belirleyebilirsiniz/);
    assert.match(c.text, /"Şifremi unuttum"/);
    assert.match(c.text, /Panele gir: https:\/\/timeflow\.lueratech\.com\/baglanti#t=abc/);
    assert.match(c.text, /24 saat geçerli ve tek kullanımlıktır/, 'sihirli bağlantı notu');
    assert.doesNotMatch(c.text, /kart bilgisi istemiyoruz|Paketleri gör/, 'kartsız denemenin metni değil');
});

test('ENFORCE kapalıyken "salt okunur" YAZMAZ, açıkken yazar', () => {
    for (const tur of ['uc_gun', 'bitti', 'son', 'odeme']) {
        assert.doesNotMatch(mailContent(tur, ctx({ enforce: false })).text, /salt okunur/, `${tur} kapalı`);
        assert.match(mailContent(tur, ctx({ enforce: true })).text, /salt okunur/, `${tur} açık`);
    }
    assert.match(mailContent('bitti', ctx({ enforce: false })).text, /Bir paket seçip kesintisiz devam edin\./);
});

test('işletme adı kullanıcı verisidir: HTML\'de kaçırılır', () => {
    const c = mailContent('uc_gun', ctx({ business: '<script>alert(1)</script>' }));
    assert.doesNotMatch(c.html, /<script>/);
    assert.match(c.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(c.text, /<script>alert\(1\)<\/script> için denemeniz/, 'düz metin olduğu gibi');
    assert.equal(escapeHtml(`a&"'`), 'a&amp;&quot;&#39;');
});

test('e-posta adresi işletme adı sayılmaz → "İşletmeniz için"', () => {
    assert.equal(displayName('kemal@gmail.com'), null);
    assert.equal(displayName('   '), null);
    assert.equal(displayName('  Lou   Güzellik '), 'Lou Güzellik');
    assert.match(mailContent('odeme', ctx({ business: null })).text, /^İşletmeniz için son abonelik ödemenizi/m);
});

test('sihirli bağlantı notu yalnız sihirli düğmede; süre giriş servisinin ömrüyle aynı', () => {
    assert.match(mailContent('uc_gun', ctx({ magic: true })).text, /24 saat geçerli ve tek kullanımlıktır/);
    assert.doesNotMatch(mailContent('uc_gun', ctx({ magic: false })).text, /tek kullanımlık/);
    assert.match(read('supabase/functions/abonelik-eposta/eposta.ts'), /MAGIC_LINK_HOURS = 24;/);
});

test('ödeme e-postası sebep tahmin etmez, son günü saatiyle verir', () => {
    const c = mailContent('odeme', ctx({ endsAt: '2026-10-26T11:30:00Z' }));
    assert.match(c.text, /Kartınızı güncellemek için son gün: 26 Ekim Pazartesi 14:30/);
    assert.match(c.text, /genelde kart limiti ya da bankanın doğrulamasıyla ilgilidir/);
    assert.doesNotMatch(c.text, /limitiniz yetmedi|kartınız reddedildi/i);
});

test('üstte tam marka (luera + "timeflow" hapı); resim engellenirse biçimli ad (2026-10-21)', () => {
    const html = mailContent('odeme', ctx()).html;
    const img = [...html.matchAll(/<img\b[^>]*>/g)];
    assert.equal(img.length, 1, 'tek görsel: logo');
    assert.match(img[0][0], /src="https:\/\/timeflow\.lueratech\.com\/eposta\/logo-timeflow\.png"/);
    // 437×89 PNG'nin 3'te biri; alt metin 146 px'e sığar (eski 44 px ikonda taşıyordu).
    assert.match(img[0][0], /width="146" height="30" alt="Luera TimeFlow"/);
    assert.match(img[0][0], /font-size:16px;line-height:30px;font-weight:700;color:#0E0E0E;/);
    const png = readFileSync(new URL('../public/eposta/logo-timeflow.png', import.meta.url));
    assert.equal(png.readUInt32BE(16), 437, 'PNG genişliği');
    assert.equal(png.readUInt32BE(20), 89, 'PNG yüksekliği');
});

test('gönderen Apple\'a kayıtlı adres; yanıt gerçek posta kutusuna', () => {
    assert.equal(MAIL_FROM, 'Luera TimeFlow <no-reply@lueratech.com>');
    assert.equal(MAIL_REPLY_TO, 'info@lueratech.com');
});

test('jeton PARÇADA (#), adreste değil; düz bağlantı paket ekranına girişle', () => {
    assert.equal(magicUrl('https://timeflow.lueratech.com/', 'ab/c'), 'https://timeflow.lueratech.com/baglanti#t=ab%2Fc');
    assert.equal(magicUrl('https://timeflow.lueratech.com', 'x', 'panel'), 'https://timeflow.lueratech.com/baglanti#t=x&git=panel');
    assert.equal(paywallLoginUrl('https://timeflow.lueratech.com'), 'https://timeflow.lueratech.com/login?sonra=abonelik');
    assert.equal(maskEmail('kemal@gmail.com'), 'k***@gmail.com');
    assert.equal(maskEmail(null), '(adres yok)');
});

// ── 3 · Defter (göç 125, PGlite) ────────────────────────────────────────────

const PGLITE_DIR = process.env.PGLITE_DIR;
const G125 = read('supabase/125_abonelik_eposta.sql');

async function ledger(sql = G125) {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        -- Supabase'in varsayılanı: yeni tablo ve fonksiyonlar istemci rollerine
        -- AÇIK doğar (096'nın sebebi). Bu olmadan kapalılık boşa ölçülürdü.
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, owner_id uuid);
    `);
    await db.exec(sql);
    return db;
}

const ORG = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97';
const ayir = async (db, tur = 'son', donem = '2026-10-27T09:00:00.000Z') =>
    (await db.query(`SELECT * FROM abonelik_eposta_ayir($1, $2, $3, NULL)`, [ORG, tur, donem])).rows;
const durum = (db, d) => db.query(`UPDATE abonelik_eposta SET durum = $1 WHERE organization_id = $2`, [d, ORG]);

test('125: aynı e-posta iki kez ayrılmaz; hata 3 kez denenir; giden asla (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await ledger();
    await db.exec(G125); // iki kez uygulanabilir
    await db.query(`INSERT INTO organizations (id) VALUES ($1)`, [ORG]);

    let r = await ayir(db);
    assert.equal(r.length, 1);
    assert.equal(r[0].deneme, 1);
    assert.equal(r[0].durum, 'gonderiliyor');
    assert.equal((await ayir(db)).length, 0, 'gönderilirken ikinci tarama alamaz');

    await durum(db, 'hata');
    assert.equal((await ayir(db))[0].deneme, 2, 'hata yeniden denenir');
    await durum(db, 'hata');
    assert.equal((await ayir(db))[0].deneme, 3);
    await durum(db, 'hata');
    assert.equal((await ayir(db)).length, 0, '3 denemeden sonra durur');

    // Başka dönem ayrı e-postadır (deneme uzadı / yeni ek süre).
    r = await ayir(db, 'son', '2026-11-10T09:00:00.000Z');
    assert.equal(r.length, 1);
    await db.query(`UPDATE abonelik_eposta SET durum = 'gonderildi' WHERE donem = '2026-11-10T09:00:00.000Z'`);
    assert.equal((await ayir(db, 'son', '2026-11-10T09:00:00.000Z')).length, 0, 'giden asla yeniden gitmez');
    await db.close();
});

test('125: yarıda kalan gönderim 30 dk sonra yeniden alınır, önce değil (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await ledger();
    await db.query(`INSERT INTO organizations (id) VALUES ($1)`, [ORG]);
    await ayir(db);
    await db.query(`UPDATE abonelik_eposta SET updated_at = now() - interval '5 minutes'`);
    assert.equal((await ayir(db)).length, 0, '5 dk: hâlâ gönderiliyor olabilir');
    await db.query(`UPDATE abonelik_eposta SET updated_at = now() - interval '31 minutes'`);
    assert.equal((await ayir(db))[0]?.deneme, 2, '31 dk: yarıda kalmış sayılır');
    // İşletme silinince defteri de gider.
    await db.query(`DELETE FROM organizations WHERE id = $1`, [ORG]);
    assert.equal(Number((await db.query(`SELECT count(*) AS n FROM abonelik_eposta`)).rows[0].n), 0);
    await db.close();
});

test('125: istemci rolleri defteri okuyamaz, ayıramaz; service_role ayırır (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await ledger();
    await db.query(`INSERT INTO organizations (id) VALUES ($1)`, [ORG]);
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(db.query(`SELECT * FROM abonelik_eposta`), /permission denied/, `${role} okuyamaz`);
        await assert.rejects(ayir(db), /permission denied/, `${role} ayıramaz`);
        await db.exec(`RESET ROLE`);
    }
    await db.exec(`SET ROLE service_role`);
    assert.equal((await ayir(db)).length, 1, 'fonksiyonun tek kullanıcısı');
    await db.query(`UPDATE abonelik_eposta SET durum = 'gonderildi'`);
    await db.exec(`RESET ROLE`);
    await db.close();
});

test('125: korumalar tek tek sökülünce testler düşer (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    // Kontrol koşusu: testler gerçekten ölçüyor mu?
    const without = (needle, by = '') => {
        assert.ok(G125.includes(needle), `sökülecek parça göçte yok: ${needle}`);
        return G125.split(needle).join(by);
    };

    let db = await ledger(without('REVOKE ALL ON public.abonelik_eposta FROM authenticated;'));
    await db.exec(`SET ROLE authenticated`);
    const rows = await db.query(`SELECT * FROM abonelik_eposta`);
    assert.equal(rows.rows.length, 0, 'REVOKE yokken istemci okuyabiliyor — test bunu yakalıyor');
    await db.close();

    db = await ledger(without('WHERE e.deneme < 3', 'WHERE true'));
    await db.query(`INSERT INTO organizations (id) VALUES ($1)`, [ORG]);
    await ayir(db);
    for (let i = 0; i < 3; i++) { await durum(db, 'hata'); await ayir(db); }
    await durum(db, 'hata');
    assert.equal((await ayir(db)).length, 1, 'sınırsız deneme — "3\'te durur" testi bunu yakalıyor');
    await db.close();

    db = await ledger(without(`e.updated_at < now() - interval '30 minutes'`, 'true'));
    await db.query(`INSERT INTO organizations (id) VALUES ($1)`, [ORG]);
    await ayir(db);
    assert.equal((await ayir(db)).length, 1, 'zaman koşulu yokken çift ayırma — test bunu yakalıyor');
    await db.close();
});

// ── 4 · Uçlar ───────────────────────────────────────────────────────────────

test('telefona giden "ödeme alınamadı" bildirimi yalnız durum söyler (Faz 2.6)', () => {
    const wh = code('supabase/functions/dodo-webhook/index.ts');
    const block = wh.slice(wh.indexOf('notifyOwner(admin, orgId, {'), wh.indexOf("tag: 'billing-hold'"));
    assert.match(block, /body: 'Son ödeme alınamadı\. Ayrıntılar e-postanızda\.'/);
    assert.match(block, /title: 'Ödeme alınamadı'/);
    assert.doesNotMatch(block, /kart/i, 'telefonda kart güncellemeye yönlendirme yok (3.1.1)');
    assert.match(block, /url: '\/settings\?tab=billing'/, 'url ve etiket değişmedi');
});

test('paket ekranı ek süredeki salonu ana sayfaya ATMAZ (Durum 3 görünür)', () => {
    const pw = code('src/pages/PaywallPage.tsx');
    assert.match(pw, /if \(!ent\.loading && ent\.ok && !ent\.cardlessTrial && ent\.effective !== 'grace' && !returning && !fromEmail\) navigate\('\/', \{ replace: true \}\);/);
    assert.match(pw, /if \(ent\.effective === 'grace'\) \{/, 'Durum 3 dalı yerinde');
});

test('girişten sonra paket ekranı: yalnız beyaz listedeki "sonra=abonelik", kayıtta değil', () => {
    const lp = code('src/pages/LoginPage.tsx');
    assert.match(lp, /const afterDest = planDest \?\? \(params\.get\('sonra'\) === 'abonelik' \? '\/abonelik\?kaynak=eposta' : null\);/);
    assert.match(lp, /const dest = planDest \?\? \(kind === 'signup' \? '\/kurulum' : afterDest \?\? '\/'\);/);
    assert.match(lp, /navigate\(afterDest \?\? '\/', \{ replace: true \}\);/, 'açık oturumla gelen de paket ekranına');
    assert.doesNotMatch(lp, /navigate\(params\.get\('sonra'\)/, 'parametre adres olarak kullanılmaz (açık yönlendirme)');
});

test('/baglanti kapının DIŞINDA; jeton parçadan okunur, hemen silinir, bir kez doğrulanır', () => {
    const app = code('src/App.tsx');
    assert.match(app, /<Route path="\/baglanti" element=\{<EpostaBaglantiPage \/>\} \/>/);
    const page = code('src/pages/EpostaBaglantiPage.tsx');
    assert.match(page, /verifyOtp\(\{ token_hash: t, type: 'email' \}\)/);
    assert.match(page, /window\.history\.replaceState\(null, '', window\.location\.pathname\)/);
    assert.match(page, /if \(started\.current\) return;/, 'StrictMode ikinci doğrulamada jetonu yakmasın');
    assert.match(page, /isAuthRetryableFetchError\(error\)\) \{ setPhase\('offline'\)/, 'ağ hatası "süresi dolmuş" değildir');
    assert.match(page, /navigate\(panel \? '\/login' : '\/login\?sonra=abonelik'\)/);
    assert.match(page, /if \(!target \|\| user\?\.id !== target \|\| routed\.current\) return;/, 'yönlendirme oturum yeni kişiye geçince, bir kez');
    assert.doesNotMatch(page, /action_link/);
    // Tam marka (kullanıcı, 2026-10-21): giriş sayfasındaki gibi luera + "timeflow" hapı.
    assert.match(page, /<LueraTimeflowMark size=\{28\} animate=\{false\} pillHeightRatio=\{0\.5556\} textRatio=\{0\.62\} dark=\{dark\} \/>/);
    assert.doesNotMatch(page, /className="brand"/, 'eski "luera." yarım marka kalmadı');
});

test('e-postadan gelen web uygulamasına HİÇ düşmez: paket ekranında kalır, Dodo da oraya döndürür (2026-10-21)', () => {
    // Kullanıcı kararı: "Kartımı güncelle" telefonda uygulamanın ana sayfasını
    // açtı → istenmedi. /baglanti ve girişin `sonra=abonelik`i e-posta kipine gider.
    const page = code('src/pages/EpostaBaglantiPage.tsx');
    assert.match(page, /const PAKET = '\/abonelik\?kaynak=eposta';/);
    assert.doesNotMatch(page, /navigate\('\/abonelik'/, 'kipsiz paket ekranı kalmadı');
    // Tek çıkış: doğrulanan kullanıcıya geçilince — jetonsuz ve ikinci tıklama da oradan.
    assert.equal((page.match(/navigate\(PAKET, \{ replace: true \}\)/g) || []).length, 1);
    assert.match(page, /if \(!panel\) \{ routed\.current = true; navigate\(PAKET, \{ replace: true \}\); return; \}/);
    // İstisna YALNIZ hoş geldiniz (göç 127): parçada git=panel → kurulum ya da ana sayfa.
    assert.match(page, /\.get\('git'\) === 'panel'/);
    assert.match(page, /void afterPaymentPath\(orgId\)\.then\(\(to\) => navigate\(to, \{ replace: true \}\)\);/);
    assert.match(code('supabase/functions/abonelik-eposta/index.ts'), /magicUrl\(cfg\.appUrl, hash, due\.tur === 'hosgeldin' \? 'panel' : undefined\)/);

    const pw = code('src/pages/PaywallPage.tsx');
    assert.match(pw, /const fromEmail = params\.get\('kaynak'\) === 'eposta';/);
    // Aboneliği sürene ayrı ekran; uygulamaya düğme yok, kapatma notu var.
    const aktif = pw.slice(pw.indexOf("if (fromEmail && ent.ok && !ent.cardlessTrial && ent.effective !== 'grace')"), pw.indexOf("if (ent.effective === 'grace')"));
    assert.ok(aktif.length > 100, 'e-posta kipinde "aboneliğiniz sürüyor" dalı yok');
    assert.match(aktif, /Aboneliğiniz sürüyor\./);
    assert.match(aktif, /\{ent\.dodoManaged && \(/, 'Kartı güncelle yalnız Dodo aboneliğinde');
    assert.match(aktif, /updateCard\(donus\)/);
    assert.doesNotMatch(aktif, /navigate\(/, 'uygulamaya gönderen bir şey yok');
    assert.doesNotMatch(aktif, /Sonraki tahsilat/, 'iptal bekleyende yalan olurdu');
    // Ödeme dönüşü: fiş YALNIZ e-posta kipinde (kapatma notuyla); öteki dönüş
    // ana sayfaya ya da kuruluma yönlenir (tests/odeme-donusu). Kartsız
    // deneme: uygulama düğmesi e-posta kipinde yok.
    assert.match(pw, /if \(!ent\.ok \|\| !fromEmail\) \{/);
    assert.match(pw, /Aynı karttan[\s\S]{0,600}<span style=\{\{ fontSize: 13\.5, color: 'var\(--dc-muted\)' \}\}>\{CLOSE_NOTE\}<\/span>\s*<\/div>,/);
    assert.match(pw, /\{fromEmail \? \(\s*<span[^>]*>\{CLOSE_NOTE\}<\/span>\s*\) : \(\s*<button className="btn bare" onClick=\{\(\) => navigate\('\/'\)\}>\s*Şimdilik uygulamaya dön/);
    assert.match(pw, /const onSelect = \(plan: PlanId, cycle: Cycle\) => \{ void startCheckout\(plan, cycle, donus\); \};/);
    // Erken alan kartsız denemecinin denemesi 7 gün değil, kalan gündür.
    assert.match(pw, /const trialDaysShown = ent\.shownDaysLeft && ent\.shownDaysLeft > 0 \? ent\.shownDaysLeft : TRIAL_DAYS;/);
    assert.doesNotMatch(pw, /\$\{TRIAL_DAYS\} gün boyunca ücretsiz kullanacaksınız/);

    const co = code('supabase/functions/dodo-checkout/index.ts');
    assert.match(co, /const toPaywall = body\.donus === 'abonelik';/, 'beyaz liste: adres istemciden gelmez');
    assert.match(co, /return_url: toPaywall \? `\$\{appUrl\}\/abonelik\?kaynak=eposta&kart=1` : `\$\{appUrl\}\/settings\?tab=billing`/);
    assert.match(co, /const returnUrl = toPaywall\s*\? `\$\{appUrl\}\/abonelik\?checkout=success&kaynak=eposta`/);
    assert.match(code('src/hooks/useBilling.ts'), /\.\.\.\(donus \? \{ donus \} : \{\}\)/);
});

test('fonksiyon: yalnız zamanlayıcı; anahtar kapalıyken defter YAZILMAZ', () => {
    const fn = code('supabase/functions/abonelik-eposta/index.ts');
    assert.match(fn, /if \(caller\.kind !== 'cron' && caller\.kind !== 'service'\) \{\s*return deny\(401/);
    assert.match(fn, /live: flag === 'true'/, 'yalnız tam "true" açar');
    assert.match(fn, /if \(!cfg\.live\) return await dryRun\(/);
    const dry = fn.slice(fn.indexOf('async function dryRun'), fn.indexOf('async function ownerEmails'));
    assert.doesNotMatch(dry, /abonelik_eposta_ayir|\.insert\(|\.update\(|\.upsert\(|fetch\(/, 'kuru tarama yazmaz, göndermez');
    // Önce ayır, sonra gönder.
    const send = fn.slice(fn.indexOf('async function sendOne'), fn.indexOf('async function trialSend'));
    assert.ok(send.indexOf("rpc('abonelik_eposta_ayir'") < send.indexOf('fetch(RESEND_URL'));
    assert.match(send, /'Idempotency-Key': `abonelik-\$\{slot\.id\}-\$\{slot\.deneme\}`/);
    assert.match(send, /generateLink\(\{ type: 'magiclink', email \}\)/);
    assert.match(send, /if \(isMagic\(due\.tur, copy\.event\)\) \{/, 'sihirli düğme türe VE olaya göre');
    // Siteden açılan hesaplar talep tablosundan, yalnız hesabı talep açtıysa.
    const scan = fn.slice(fn.indexOf('async function scan'), fn.indexOf('async function dryRun'));
    assert.match(scan, /from\('checkout_claims'\)[\s\S]*?\.eq\('user_created', true\)/);
    assert.match(scan, /last_event: CHECKOUT_EVENT/);

    assert.match(send, /hashed_token/);
});

test('cron satırı: remind ile aynı başlık (döndürme betiği yakalar), yüzde yok, crontab maskeli', () => {
    const sh = read('ops/abonelik/eposta.sh');
    const komut = sh.split('\n').find((l) => l.startsWith('KOMUT='));
    assert.ok(komut, 'KOMUT satırı');
    assert.match(komut, /-H 'x-cron-secret: \$\{s\}'/);
    assert.doesNotMatch(komut, /%/, 'crontab\'da % yeni satır demek');
    assert.match(komut, /functions\/v1\/abonelik-eposta|\$\{URL\}/);
    assert.match(read('scripts/rotate-cron-secret.sh'), /x-cron-secret: \[A-Za-z0-9\]\\\{16,\\\}/);
    // `crontab -l` ya bir değişkene, ya dosyaya ya da maskeden geçerek ekrana.
    for (const line of sh.split('\n').filter((l) => l.includes('crontab -l') && !/^\s*#/.test(l))) {
        assert.ok(/\$\(crontab -l/.test(line) || /\| maske/.test(line), `maskesiz crontab çıktısı: ${line.trim()}`);
    }
    assert.match(sh, /env -i PATH=\/usr\/bin:\/bin SHELL=\/bin\/sh \/bin\/sh -c "\$KOMUT"/, 'önce cron ortamında denenir');
    assert.match(sh, /-H @<\(printf 'x-cron-secret: %s\\n' "\$s"\)/, 'elle çağrıda sır argv\'ye düşmez');
});

test('anahtar açma Dodo TEST kipindeyken durur', () => {
    const sh = read('ops/abonelik/eposta.sh');
    const ac = sh.slice(sh.indexOf('\nac)'), sh.indexOf('\nkapa)'));
    assert.match(ac, /\*test\*\)/);
    assert.match(ac, /"\$\{1:-\}" != "zorla"/);
});
