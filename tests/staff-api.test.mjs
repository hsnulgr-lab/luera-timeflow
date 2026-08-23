import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    can, canTouchReservation, ROLE_PERMISSIONS, roleOf,
} from '../supabase/functions/_shared/staffPerms.ts';
import { STAFF_ROLE_PERMISSIONS } from '../src/lib/staffPermissions.ts';

// Personel kumandasının sunucu tarafı.
//
// Bu dosyanın koruduğu şey: personelin KENDİ randevusundan başkasına
// dokunamaması. Arayüz zaten yalnız kendi randevularını gösteriyor ama
// gösterim bir güvenlik önlemi değildir — istek elle de atılabilir.

test('rol bilinmeyen değerde en dar role düşer', () => {
    assert.equal(roleOf('doctor'), 'doctor');
    assert.equal(roleOf('patron'), 'staff');
    assert.equal(roleOf(null), 'staff');
    assert.equal(roleOf(undefined), 'staff');
});

test('personel yalnız KENDİ randevusuna dokunabilir', () => {
    const ben = 'staff-1';
    assert.equal(canTouchReservation('staff', ben, ben), true);
    assert.equal(canTouchReservation('staff', ben, 'staff-2'), false);
    // Personelsiz (staff_id null) randevu da başkasınındır: sahipsiz kaydı
    // herkesin açabilmesi, "kendi randevun" kuralını delen en kolay yol.
    assert.equal(canTouchReservation('staff', ben, null), false);
});

test('asistan tüm randevulara dokunabilir — rolü bu', () => {
    assert.equal(canTouchReservation('assistant', 'a', 'b'), true);
});

test('kasa rolü randevu DEĞİŞTİREMEZ', () => {
    // Kasanın işi tahsilat; hizmeti başlatıp bitirmek onun işi değil.
    assert.equal(can('cashier', 'payments:collect'), true);
    assert.equal(canTouchReservation('cashier', 'a', 'a'), false);
});

test('edge aynası ile uygulama izinleri ayrışmamış', () => {
    // staffPerms.ts bir KOPYA (edge yalnız supabase/functions altını görüyor).
    // Kopya sessiz kalmasın: burada tutulan her yetki, uygulama tarafındaki
    // haritada da aynı rolde bulunmalı.
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
        const app = STAFF_ROLE_PERMISSIONS[role];
        assert.ok(app, `${role}: uygulama tarafında yok`);
        for (const p of perms) {
            assert.ok(app.includes(p), `${role}: "${p}" edge'de var, uygulamada yok`);
        }
    }
});

// ── Uç sözleşmesi ───────────────────────────────────────────────────────────

const api = readFileSync(
    new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');

test('kumandanın yedi ucu da var', () => {
    for (const a of ['agenda', 'visit.start', 'visit.items', 'visit.finish',
        'catalog', 'customer', 'performance']) {
        assert.ok(api.includes(`action === '${a}'`), `${a} ucu yok`);
    }
});

test('kumanda uçlarında kimlik gövdeden OKUNMAZ', () => {
    // Org ve personel kimliği token'dan gelir. Gövdeden okumak, org id'yi
    // bilen herkese başka işletmenin verisini açardı.
    //
    // Kapsam yalnız kumanda bölümü: device.pair (org sahibinin oturumu,
    // çok org'lu sahibin seçimi) ve session.start (kim giriş yapıyor) gövdeden
    // kimlik alır ve bu meşrudur — ikisi de ayrıca doğrulanıyor.
    const kumanda = api.slice(api.indexOf('KUMANDA UÇLARI'));
    assert.ok(!/body\.organization_id|body\.orgId|body\.staffId/.test(kumanda),
        'kumanda ucu kimliği gövdeden okumamalı');
    assert.match(kumanda, /\.eq\('organization_id', me\.organization_id\)/);
    // Ziyaret uçlarının hepsi sahiplik kontrolünden geçer.
    for (const a of ['visit.start', 'visit.items', 'visit.finish']) {
        const blk = kumanda.slice(kumanda.indexOf(`action === '${a}'`), kumanda.indexOf(`action === '${a}'`) + 400);
        assert.match(blk, /loadOwnReservation/, `${a}: sahiplik kontrolü yok`);
    }
});

test('kendi randevusu filtresi SORGUDA', () => {
    // Arayüzde filtrelemek yetmez.
    assert.match(api, /if \(!can\(me\.role, 'appointments:view-all'\)\) q = q\.eq\('staff_id', me\.id\)/);
});

test('işlemi ikinci kez başlatmak sayacı SIFIRLAMAZ', () => {
    // Yanlışlıkla ikinci dokunuş, geçen 40 dakikayı silerdi.
    assert.match(api, /if \(!res!\.arrived_at\) patch\.arrived_at/);
});

test('iptal edilmiş randevu hiçbir ziyaret mutasyonuna giremez', () => {
    // UI eski bir ekranı açık tutabilir; güvenlik ve durum geçişi sunucudadır.
    const own = api.slice(api.indexOf('const loadOwnReservation'), api.indexOf("action === 'agenda'"));
    assert.match(own, /data\.status === 'cancelled'/);
    assert.match(own, /reservation_cancelled/);

    for (const action of ['visit.start', 'visit.items', 'visit.finish']) {
        const start = api.indexOf(`action === '${action}'`);
        const next = api.indexOf("action === '", start + 12);
        const block = api.slice(start, next === -1 ? undefined : next);
        assert.match(block, /\.neq\('status', 'cancelled'\)/,
            `${action}: load-update yarışında iptali yeniden yazabilir`);
    }
});

test('bitirme idempotent — kötü sinyalde kuyruk tekrarı hata vermez', () => {
    assert.match(api, /alreadyFinished: true/);
    assert.match(api, /\.neq\('status', 'completed'\)/);
    assert.match(api, /reconcileUsageStock/);
    assert.match(api, /stockErr\.code === '23505'/,
        'eşzamanlı ikinci stok yazımı beklenen idempotency sonucu olmalı');
    assert.match(api, /\.is\('service_ended_at', null\)/,
        'eski tamamlanmış kaydın bitiş saati bir kez yazılıp sabit kalmalı');
});

test('stok düşümü BİTİRİRKEN, kalem eklenirken değil', () => {
    // Kalemler işlem sırasında ekleniyor ve çıkarılıyor; her dokunuşta stok
    // oynatmak ambarı personelin fikir değişikliğine bağlardı.
    const finish = api.slice(api.indexOf("action === 'visit.finish'"));
    const stock = api.slice(api.indexOf('const reconcileUsageStock'), api.indexOf("action === 'agenda'"));
    assert.match(stock, /stock_movements/);
    const items = api.slice(api.indexOf("action === 'visit.items'"), api.indexOf("action === 'visit.finish'"));
    assert.ok(!/stock_movements/.test(items), 'kalem eklerken stok oynatılmamalı');
    assert.match(stock, /type: 'usage'/);
    assert.doesNotMatch(stock, /reason:\s*'hizmet'/);
    assert.match(stock, /product\.kind === 'consumable'/);
    assert.match(stock, /line\?\.kind !== 'material' && line\?\.kind !== 'product'/,
        'satış ürünü finish sırasında usage olarak ikinci kez düşülmemeli');
    assert.match(finish, /await reconcileUsageStock/);
});

test('stok hatası adisyonu geri almaz ama yanıtta görünür', () => {
    // Hizmet gerçekten yapıldı; sayım hatası düzeltilebilir, kaybolan adisyon
    // düzeltilemez.
    const finish = api.slice(api.indexOf("action === 'visit.finish'"));
    assert.ok(finish.indexOf("status: 'completed'") < finish.indexOf('await reconcileUsageStock'),
        'önce gerçek hizmet tamamlanmalı, sonra stok uzlaştırılmalı');
    assert.match(finish, /stockWarning/);
    assert.match(api, /stock_write_failed/);
});

test('adisyon kalemlerinin adı ve fiyatı organizasyon kataloğundan gelir', () => {
    const items = api.slice(api.indexOf("action === 'visit.items'"), api.indexOf("action === 'visit.finish'"));
    assert.match(items, /from\('products'\)/);
    assert.match(items, /from\('services'\)/);
    assert.match(items, /\.eq\('organization_id', me\.organization_id\)/);
    assert.match(items, /\.eq\('is_active', true\)/);
    assert.match(items, /serviceId/);
    assert.match(items, /invalid_catalog_item/);
    assert.doesNotMatch(items, /it\??\.name|it\??\.price/,
        'telefon adisyon adını veya fiyatını belirlememeli');
    assert.match(items, /too_many_items/);
});

test('ziyaret hardening migrationı stok ve audit sözleşmesini kilitler', () => {
    const migration = readFileSync(
        new URL('../supabase/090_staff_visit_hardening.sql', import.meta.url), 'utf8');
    assert.match(migration, /stock_usage_duplicate_needs_human_decision/);
    assert.match(migration,
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_usage_reservation_product[\s\S]*ON public\.stock_movements\s*\(reservation_id, product_id\)[\s\S]*WHERE type = 'usage'/i);
    for (const event of ['login', 'failed_pin', 'locked', 'revoked',
        'visit.forbidden', 'visit.start', 'visit.finish']) {
        assert.ok(migration.includes(`'${event}'`), `audit olayı migrationda yok: ${event}`);
    }
});

test('masaüstü stok yazarı tekil usage indeksini idempotent karşılar', () => {
    const stockHook = readFileSync(
        new URL('../src/hooks/useStock.ts', import.meta.url), 'utf8');
    const kuafor = readFileSync(
        new URL('../src/components/dashboard/KuaforDashboard.tsx', import.meta.url), 'utf8');
    assert.match(stockHook, /input\.type === 'usage'[\s\S]*error\.code === '23505'/);
    assert.match(stockHook, /Number\(existing\.delta\) === input\.delta/);
    assert.match(stockHook, /const idempotentUsage = usable\.filter/);
    assert.match(stockHook, /const atomic = usable\.filter/);
    assert.match(stockHook, /insert\(\s*atomic\.map/,
        'satış ve diğer stok hareketleri atomik toplu insert olarak kalmalı');
    assert.match(kuafor, /usage\.length > 0 && stockOk/,
        'başarısız stok yazımı düşüldü bayrağı koymamalı');
});

test('eski product kalemi kimliksizse finish kilitlenmez, canonical material kilitlenir', () => {
    const stock = api.slice(api.indexOf('const reconcileUsageStock'), api.indexOf("action === 'agenda'"));
    assert.match(stock, /if \(line\.kind === 'product'\) continue/);
    assert.match(stock, /if \(candidate\.requestedKind === 'product'\) continue/);
    assert.match(stock, /geçersiz ürün\/malzeme satırı/,
        'canonical material kimliği bozuksa stok uyarısı korunmalı');
});

test('ciro görünürlüğü ayara bağlı ve varsayılan KAPALI', () => {
    assert.match(api, /staff_can_see_revenue !== true\) return json\(\{ error: 'disabled' \}/);
    const mig = readFileSync(
        new URL('../supabase/089_staff_revenue_visibility.sql', import.meta.url), 'utf8');
    assert.match(mig, /staff_can_see_revenue BOOLEAN NOT NULL DEFAULT false/);
});

test('müşteri kartı finans DÖNDÜRMEZ', () => {
    // Kumandanın işi hizmet, finans değil.
    const cust = api.slice(api.indexOf("action === 'customer'"), api.indexOf("action === 'performance'"));
    assert.ok(!/payments|treatment_plans|balance/.test(cust),
        'müşteri kartı borç/tahsilat sızdırmamalı');
});
