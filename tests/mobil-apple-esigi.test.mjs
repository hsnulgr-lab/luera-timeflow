import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { deletionCopy, tallyNumber } from '../mobile/src/lib/managerProfile.ts';
import { deletedNotice, goneParam } from '../mobile/src/lib/deletedNotice.ts';
import { lockedLead } from '../mobile/src/lib/authCopy.ts';
import { notFoundCopy } from '../mobile/src/lib/notFound.ts';

/**
 * APPLE EŞİĞİ · B, C, D (2026-09-18).
 *
 * Claude Design çıktısından alınanlar ve BİLEREK alınmayanlar. Alınmayanlar
 * uydurulmuş veri ya da bizde olmayan davranıştı: "30 gün içinde tamamlanır",
 * "kopyası bizde kalmıyor", "3 denemede 15 dk kilit", "Kasa geçmişi 18 ay",
 * personelde sahibin telefonu, "luera.ai".
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const del = strip(read('app/(manager-flow)/profil/hesap-sil.tsx'));
const welcome = read('app/(auth)/welcome.tsx');
const liveAuth = read('src/api/auth.ts');
const server = readFileSync(new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');
const notFound = read('app/+not-found.tsx');

const BASE = {
    businessName: 'Studio Ayla', businessLocation: '', managerName: 'Ayla', managerEmail: null,
    appointments: 1248, customers: 612, services: 24, staff: [],
};

// ── B · Hesap silme ─────────────────────────────────────────────────────────

test('B · silinecekler SAYIYLA — ciddiyet renkten değil sayıdan', () => {
    const copy = deletionCopy({ ...BASE, soleManager: true });
    assert.deepEqual(copy.tally.map((row) => [row.label, row.count]), [
        ['Randevu', '1.248'], ['Müşteri', '612'], ['Hizmet', '24'],
    ]);
    // Ortak ayrılınca kayıtlar yerinde: sayılacak bir şey yok.
    assert.deepEqual(deletionCopy({ ...BASE, soleManager: false }).tally, []);
    assert.equal(tallyNumber(1000000), '1.000.000');
    assert.equal(tallyNumber(0), '0');
});

test('B · listede kırmızı yok; kırmızı yalnız son dokunuşta', () => {
    const warn = del.slice(del.indexOf('{DELETE_WARN}') - 300, del.indexOf('{DELETE_WARN}'));
    assert.doesNotMatch(warn, /c\.rd/);
    assert.match(del, /<TallyRow key=\{row\.label\}/);
    assert.match(del, /fontVariant: \['tabular-nums'\]/);
});

test('B · onay kutusu ve düğme ALTA SABİT — listenin dışında', () => {
    const scrollEnd = del.indexOf('</ScrollView>');
    assert.ok(del.indexOf('<Checkbox') > scrollEnd, 'onay kutusu kaydırmanın dışında');
    assert.ok(del.indexOf('<HoldToDelete') > scrollEnd, 'düğme kaydırmanın dışında');
    // Basılı tutma KALDI (kullanıcı kararı); şifre adımı eklenmedi.
    assert.doesNotMatch(del, /signInWithPassword/);
});

test('B · tasarımın uydurduğu cümleler YOK', () => {
    const copy = JSON.stringify(deletionCopy({ ...BASE, soleManager: true }));
    assert.doesNotMatch(copy, /30 gün içinde tamamlanır|kopyası bizde kalmıyor|18 ay|Kasa geçmişi/);
    // Dışa aktarma masaüstünde VAR (DataTab) — satır kalıyor.
    assert.match(del, /DELETE_EXPORT_LABEL/);
});

test('B · "silindi" plakası YALNIZ sunucu onayından sonra, karşılamada', () => {
    const okBranch = del.slice(del.indexOf('if (!result.ok) {'));
    assert.ok(okBranch.indexOf('return;') < okBranch.indexOf("pathname: '/(auth)/welcome'"));
    assert.match(del, /params: \{ gone: goneParam\(copy\.soleManager, businessName\) \}/);
    assert.match(welcome, /const notice = deletedNotice\(gone\);/);
    assert.equal(deletedNotice(goneParam(true, 'Studio Ayla')).body,
        'Studio Ayla ve kayıtları kaldırıldı. Aynı e-posta ile yeni bir işletme oluşturabilirsiniz.');
    assert.match(deletedNotice(goneParam(false, 'Studio Ayla')).body, /yerinde duruyor/);
    // Rastgele bir parametre plaka çizdirmez.
    assert.equal(deletedNotice(undefined), null);
    assert.equal(deletedNotice('x'), null);
});

// ── C · Erişim kapalı ───────────────────────────────────────────────────────

test('C · kapı bilgisi CANLI; stub oturumu aranmıyor', () => {
    assert.match(liveAuth, /async function lockedDoor\(\): Promise<AuthResult<LockedDoor>>/);
    assert.match(liveAuth, /subscription: \{ locked: lockedDoor \}/);
    assert.match(liveAuth, /supabase\.rpc\('has_timeflow_access', \{ p_org: orgId \}\)/);
});

test('C · sunucu ucu KAPIDAN ÖNCE ve para bilgisi taşımıyor', () => {
    const at = server.indexOf("if (action === 'access') {");
    assert.ok(at > 0);
    assert.ok(at < server.indexOf("if (!staffAccess.ok) return json({ error: 'subscription_inactive' }, 403);"));
    const block = server.slice(at, server.indexOf("if (!staffAccess.ok) return json"));
    assert.doesNotMatch(block, /plan|cycle|price|amount/);
});

test('C · tarih yalnız biliniyorsa, doğru ekle', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    assert.equal(lockedLead('Studio Ayla', '2026-09-12T10:00:00Z', now),
        'Studio Ayla için Luera erişimi 12 Eylül’de sona erdi.');
    assert.equal(lockedLead('Studio Ayla', '2026-01-03T10:00:00Z', now),
        'Studio Ayla için Luera erişimi 3 Ocak’ta sona erdi.');
    assert.equal(lockedLead('Studio Ayla', '2025-12-30T10:00:00Z', now),
        'Studio Ayla için Luera erişimi 30 Aralık 2025’te sona erdi.');
    assert.equal(lockedLead('Studio Ayla', null, now), 'Studio Ayla için Luera erişimi sona erdi.');
    assert.equal(lockedLead('', 'bozuk', now), 'Bu işletme için Luera erişimi sona erdi.');
});

// ── D · Bulunamadı ──────────────────────────────────────────────────────────

test('D · tek çıkış, role göre; teknik terim yok', () => {
    assert.deepEqual(
        ['manager', 'staff', 'outside'].map((role) => [notFoundCopy(role).action, notFoundCopy(role).href]),
        [['Akışa dön', '/mudur'], ['Bugün’e dön', '/personel'], ['Girişe dön', '/']],
    );
    for (const role of ['manager', 'staff', 'outside']) {
        assert.doesNotMatch(JSON.stringify(notFoundCopy(role)), /404|route|hata kodu|geçersiz/i);
    }
    assert.equal((notFoundCopy('outside').body.match(/\./g) ?? []).length, 2);
    assert.equal((strip(notFound).match(/<AuthActionButton/g) ?? []).length, 1);
});

test('D · soğuk açılan bağlantı oturum kapısını ATLAMIYOR', () => {
    // Geri yığını yoksa (bağlantı uygulamayı açtı) rol bilinse bile ilk ekrana.
    assert.match(notFound, /const inside = router\.canGoBack\(\);/);
    assert.match(notFound, /setRole\(inside && actor \? actor : 'outside'\);/);
});
