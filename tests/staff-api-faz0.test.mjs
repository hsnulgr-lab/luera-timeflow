import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Faz 0 · sunucuya EKLENEN güvenceler.
 *
 * Bu dosya davranışı değil SÖZLEŞMEYİ kilitliyor: mobil bağlanmadan önce
 * sunucuda bulunması gereken şeyler. Hepsi katkı niteliğinde — bugün sahada
 * olan istemci hiçbirini göndermiyor ve eskisi gibi çalışmaya devam ediyor.
 */

const api = readFileSync(
    new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');
const mig = readFileSync(
    new URL('../supabase/092_staff_write_log.sql', import.meta.url), 'utf8');
const client = readFileSync(
    new URL('../mobile/src/api/staff.ts', import.meta.url), 'utf8');

// ── Kütük ───────────────────────────────────────────────────────────────────

test('yazma kütüğünün anahtarı ORGANİZASYONLA birlikte birincil anahtar', () => {
    // Yalnız anahtar olsaydı, bir org'un anahtarını tahmin eden başka bir org
    // kayıtlı YANITI okurdu — o yanıt müşteri adı ve fiyat taşıyor.
    assert.match(mig, /PRIMARY KEY \(organization_id, idempotency_key\)/);
});

test('kütük anon ve authenticated için tamamen kapalı', () => {
    assert.match(mig, /ALTER TABLE public\.staff_write_log ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(mig, /CREATE POLICY[\s\S]*staff_write_log/,
        'kütüğe yalnız service_role erişmeli: politika tanımlanmamalı');
    assert.match(mig, /REVOKE ALL ON public\.staff_write_log FROM anon, authenticated/);
});

test('kütük sonsuza kadar büyümüyor', () => {
    assert.match(mig, /CREATE OR REPLACE FUNCTION public\.prune_staff_write_log/);
    assert.match(mig, /idx_staff_write_log_created/);
});

// ── İdempotens kapısı ───────────────────────────────────────────────────────

test('kapı YALNIZ yazma uçlarında', () => {
    assert.match(api, /const WRITE_ACTIONS = new Set\(\['visit\.start', 'visit\.items', 'visit\.formula', 'visit\.finish'\]\)/);
});

test('kapı, kimlik doğrulandıktan SONRA', () => {
    // Kimlikten önce olsaydı, kimliksiz bir istek kütüğü okuyabilirdi.
    const revoked = api.indexOf("!== claims.epoch) return json({ error: 'revoked' }");
    const gate = api.indexOf('const WRITE_ACTIONS');
    assert.ok(revoked > 0 && gate > revoked, 'kapı revoke denetiminden sonra gelmeli');
});

test('başka personelin ya da başka eylemin anahtarı REDDEDİLİYOR', () => {
    assert.match(api, /if \(prior\.staff_id !== me\.id \|\| prior\.action !== action\) \{\s*return json\(\{ error: 'idempotency_key_reused' \}, 409\)/);
});

test('kütüğe YALNIZ başarılı yazma giriyor', () => {
    // Kalıcı bir 500 kütüğe girseydi o iş sonsuza kadar başarısız donardı.
    const gate = api.slice(api.indexOf('const done = async'), api.indexOf("if (action === 'me'"));
    assert.match(gate, /status,\s*\n\s*response: payload,/);
    // done() çağrılarının tamamı ok:true taşımalı.
    for (const call of api.match(/return await done\(\{[^}]*/g) ?? []) {
        assert.match(call, /ok: true/, `done() yalnız başarıda: ${call.slice(0, 60)}`);
    }
});

test('dört yazma ucunun her BAŞARI dalı kütükten geçiyor', () => {
    const writes = api.slice(api.indexOf("action === 'visit.start'"), api.indexOf("action === 'catalog'"));
    assert.equal((writes.match(/return await done\(/g) ?? []).length, 6,
        'visit.start 3 + visit.items 1 + visit.formula 1 + visit.finish 1');
    assert.doesNotMatch(writes, /return json\(\{\s*ok: true/,
        'yazma ucunda kütükten geçmeyen bir başarı yanıtı kalmamalı');
});

test('kütük hatası isteği DÜŞÜRMÜYOR', () => {
    // Yazma zaten gerçekleşti; kütüğe geçmedi diye kullanıcıya hata dönmek,
    // olmuş bir işi olmamış göstermek olurdu.
    assert.match(api, /if \(error && error\.code !== '23505'\) console\.error\('staff-api write log', error\)/);
});

test('istemci aynı anahtarı tekrar gönderiyor — kapının varlık sebebi', () => {
    // Kuyruk `job.key`i saklayıp aynı anahtarla yeniden deniyor. Anahtar her
    // denemede yeniden üretilseydi kapı hiçbir işe yaramazdı.
    // Kuyruk Faz 2'de yeniden yazıldı (deneme sayacı, üssel bekleme, sıra
    // kilidi); değişmeyen şey ANAHTARIN saklanması ve aynısıyla gönderilmesi.
    assert.match(client, /enqueue\(\{\s*key,/);
    assert.match(client, /call\(job\.action, \{ \.\.\.job\.body, idempotencyKey: job\.key \}\)/);
});

// ── İyimser kilit ───────────────────────────────────────────────────────────

test('reservations.updated_at TETİKLEYİCİYLE sürülüyor', () => {
    // Kolon 2024'ten beri vardı ama yalnız masaüstü elle yazıyordu; staff-api
    // hiç yazmıyordu. O hâliyle sürüm belirteci olarak güvenilmezdi.
    assert.match(mig, /CREATE TRIGGER trg_reservations_touch_updated_at\s*\n\s*BEFORE UPDATE ON public\.reservations/);
    assert.match(mig, /NEW\.updated_at := clock_timestamp\(\)/,
        'now() işlem başlangıcını verir: aynı işlemdeki iki yazma aynı damgayı alırdı');
});

test('visit.items damga uymazsa yazmıyor', () => {
    const items = api.slice(api.indexOf("action === 'visit.items'"), api.indexOf("action === 'visit.formula'"));
    assert.match(items, /if \(expected\) write = write\.eq\('updated_at', expected\)/);
    assert.match(items, /error: 'items_stale'/);
});

test('items_stale GÜNCEL LİSTEYİ geri veriyor', () => {
    // Yalnız "çakışma" demek, kullanıcının yazdığı kalemi kaybettirirdi.
    const items = api.slice(api.indexOf("action === 'visit.items'"), api.indexOf("action === 'visit.formula'"));
    assert.match(items, /items: Array\.isArray\(latest\.res!\.adisyon_items\)/);
    assert.match(items, /updatedAt: latest\.res!\.updated_at/);
});

test('damga İSTEĞE BAĞLI — bugün sahadaki istemci kırılmıyor', () => {
    const items = api.slice(api.indexOf("action === 'visit.items'"), api.indexOf("action === 'visit.formula'"));
    assert.match(items, /typeof body\.expectedUpdatedAt === 'string' && body\.expectedUpdatedAt\s*\n\s*\? body\.expectedUpdatedAt\s*\n\s*: null/);
    assert.match(api, /'service_ended_at, adisyon_items, is_paid, formula, updated_at'/,
        'damga dönmezse istemci onu hiç öğrenemez');
});

// ── Sözleşme eklemeleri ─────────────────────────────────────────────────────

test('visit.formula tags KABUL EDİYOR', () => {
    // FormulaBody · ToneRow bunu gönderiyordu, sunucu okumuyordu.
    const f = api.slice(api.indexOf("action === 'visit.formula'"), api.indexOf("action === 'visit.finish'"));
    assert.match(f, /const TONES = \['turuncu', 'eşitsiz'\]/);
    assert.match(f, /tags,/, 'tags formül gövdesine girmeli');
});

test('bilinmeyen etiket formülü REDDETMİYOR, eleniyor', () => {
    // Katı doğrulama, listeye kelime ekleyen yeni bir sürümde formülün
    // TAMAMINI kaydedilemez yapardı. İkincil alan için bu orantısız.
    const f = api.slice(api.indexOf("action === 'visit.formula'"), api.indexOf("action === 'visit.finish'"));
    assert.doesNotMatch(f, /bad_tags/);
    assert.match(f, /\.filter\(\(t\): t is string => typeof t === 'string' && TONES\.includes\(t\)\)/);
});

test('catalog geçmiş kullanımı dönüyor — ızgaranın kaynağı', () => {
    const c = api.slice(api.indexOf("action === 'catalog'"), api.indexOf("action === 'customers'"));
    assert.match(c, /usage: \[\.\.\.tally\.values\(\)\]/);
    // adisyon.ts · UsageRow ile aynı beş alan.
    assert.match(c, /\{ name, service, staffId, dateISO, count: add \}/);
});

test('catalog geçmişi İKİNCİL — düşerse katalog yine dönüyor', () => {
    const c = api.slice(api.indexOf("action === 'catalog'"), api.indexOf("action === 'customers'"));
    assert.match(c, /if \(histErr\) console\.error\('catalog usage', histErr\)/);
    assert.match(c, /if \(svcErr \|\| prodErr\) \{[\s\S]*?return json\(\{ error: 'lookup_failed' \}, 500\)/,
        'katalogun kendisi düşerse BOŞ KATALOG değil hata dönmeli');
});

test('customer geçmişi hangi malzemenin kullanıldığını söylüyor', () => {
    const c = api.slice(api.indexOf("action === 'customer'"), api.indexOf("action === 'performance'"));
    assert.match(c, /itemsUsed: Array\.isArray\(row\.adisyon_items\)/);
});

test('performance haftanın YEDİ gününü dönüyor, boşlar dâhil', () => {
    // Yalnız iş görülen günler dönseydi, izinli salı ile ciro yapılmamış salı
    // aynı görünürdü.
    const p = api.slice(api.indexOf("action === 'performance'"));
    assert.match(p, /for \(let back = 6; back >= 0; back--\)/);
    assert.match(p, /days: \[\.\.\.byDay\.entries\(\)\]/);
});

test('ortalama süre YALNIZ iki damgası olan ziyaretlerden', () => {
    // Eksik damgayı sıfır saymak personelin işini olduğundan hızlı gösterirdi.
    const p = api.slice(api.indexOf("action === 'performance'"));
    assert.match(p, /if \(!r\.arrived_at \|\| !r\.service_ended_at\) continue/);
    assert.match(p, /avgSampleCount: spans\.length/,
        'ortalamanın kaç ziyaretten çıktığı söylenmeli');
});

// ── Yutulan hatalar ve rastgele ayar satırı ─────────────────────────────────

test('ayar satırı org SAHİBİNİNKİ — rastgele bir üyeninki değil', () => {
    // settings.user_id TEKİL, organization_id değil: çok üyeli org'da birden
    // çok satır olur ve eski .limit(1) hangisinin geleceğini söylemiyordu.
    assert.match(api, /const orgSettings = async \(cols: string\)/);
    assert.match(api, /\.eq\('user_id', org\.owner_id\)/);
    assert.match(api, /\.order\('created_at', \{ ascending: true \}\)/,
        'sahibin satırı yoksa en eskiye düşmeli — yanlış olabilir ama KARARLI');
    assert.doesNotMatch(api, /from\('settings'\)[\s\S]{0,120}?\.eq\('organization_id', me\.organization_id\)\.limit\(1\)/,
        'org ayarı artık doğrudan .limit(1) ile okunmamalı');
});

test('performance sorgu hatası SIFIR CİRO gibi görünmüyor', () => {
    const p = api.slice(api.indexOf("action === 'performance'"));
    assert.match(p, /if \(perfErr\) \{[\s\S]*?return json\(\{ error: 'lookup_failed' \}, 500\)/);
});

test('müşteri defteri org geçmişinin TAMAMINI taramıyor', () => {
    const c = api.slice(api.indexOf("action === 'customers'"), api.indexOf("action === 'customer'"));
    assert.match(c, /const bookFrom = new Date\(Date\.now\(\) \+ 3 \* 3600_000 - 730 \* 86_400_000\)/);
    assert.match(c, /\.gte\('date', bookFrom\)/);
});
