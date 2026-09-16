import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    businessesOf, businessLine, businessMeta, deletionFactsOf, locationOf, SECTOR_LABELS, sectorLabel,
} from '../mobile/src/lib/accountMap.ts';
import { deletionCopy } from '../mobile/src/lib/managerProfile.ts';

/**
 * MÜDÜR · PROFİL VE HESAP CANLIYA BAĞLANDI (plan 9. adım).
 *
 * En ağır bulgu: `account` stub'da kaldığı için canlı kipte "Hesap" satırı
 * müdürü KARŞILAMA EKRANINA atıyordu ve hesap silme ekranına — App Store
 * 5.1.1(v)'nin zorunlu kıldığı ekrana — hiç ulaşılamıyordu.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const session = strip(read('mobile/src/api/session.ts'));
const live = strip(read('mobile/src/api/auth.ts'));
const deletion = strip(read('mobile/src/api/accountDeletion.ts'));
const deleteScreen = strip(read('mobile/app/(manager-flow)/profil/hesap-sil.tsx'));
const source = strip(read('mobile/src/lib/managerSource.ts'));
const legal = strip(read('mobile/src/lib/legalSource.ts'));
const ui = strip(read('mobile/src/components/ui.tsx'));
const desktopSectors = read('src/lib/sectorProfiles.ts');
const deleteFn = read('supabase/functions/account-delete/index.ts');

// ── Hesap canlı ─────────────────────────────────────────────────────────────

test('hesap CANLI: stub listesinde yok, canlı yüzeyde var', () => {
    assert.doesNotMatch(session, /STUB_PARTS = \[[^\]]*'account'/);
    assert.match(session, /LIVE_PARTS = \[[^\]]*'account'/);
    assert.match(session, /account: \{ \.\.\.authStub\.account, \.\.\.live\.account \}/);
    for (const key of ['get: accountOverview', 'prepareBusinessSwitch: accountBusinessSwitch', 'setBiometric',
        'signOut: accountSignOut', 'requestDeletion: accountRequestDeletion', 'confirmDeletion: accountConfirmDeletion']) {
        assert.ok(live.includes(key), key);
    }
});

test('hesap özeti işletmeyi sunucudan tazeliyor; okunamazsa müdürü dışarı atmıyor', () => {
    const fn = live.slice(live.indexOf('async function accountOverview'), live.indexOf('async function accountBusinessSwitch'));
    assert.match(fn, /const list = await managerBusinesses\(\);/);
    assert.match(fn, /if \(!list\.ok\) \{\s*return done\(/);
    assert.match(fn, /if \(fresh\) await saveProfile\(profile, stored\.biometricEnabled\);/);
});

test('personelde "oturumu kapat" telefonu işletmeden çıkarıyor — stub ile aynı', () => {
    const fn = live.slice(live.indexOf('async function accountSignOut'), live.indexOf('async function accountRequestDeletion'));
    assert.match(fn, /tokens\.clearDevice\(\);[\s\S]*tokens\.clearStaff\(\);[\s\S]*clearProfile\(\);/);
    assert.match(fn, /return signOut\(\);/);
});

test('şifreyle silme: şifre SUNUCUYA soruluyor, silme gerçek uca gidiyor', () => {
    const fn = live.slice(live.indexOf('async function accountConfirmDeletion'), live.indexOf('export const auth'));
    assert.match(fn, /signInWithPassword\(\{ email: stored\.profile\.email, password \}\)/);
    assert.match(fn, /if \(error\) return fail\('invalid_credentials'\);/);
    assert.match(fn, /deleteAccount\(stored\.profile\.business\.id\)/);
    assert.ok(fn.indexOf('signInWithPassword') < fn.indexOf('deleteAccount('));
});

// ── Silme ───────────────────────────────────────────────────────────────────

test('silme SEÇİLİ salonla gidiyor — çok üyeli müdürde sunucu salon tahmin etmiyor', () => {
    assert.match(deletion, /body: orgId \? \{ orgId \} : \{\}/);
    assert.match(deleteScreen, /deleteAccount\(orgId\)/);
    assert.match(deleteScreen, /setOrgId\(profile\.business\.id\);/);
    assert.match(deleteFn, /resolveOrg\(admin, userId, body\.orgId \?\? null\)/);
    assert.match(read('supabase/functions/_shared/org.ts'), /if \(memberships\.length > 1\) return \{ error: 'org_id_required'/);
});

test('sunucunun asıl sebebi okunuyor — 403/502 gövdesi "sunucu hatası"na düşmüyor', () => {
    assert.match(deletion, /const context = \(error as \{ context\?: Response \}\)\.context;/);
    assert.match(deletion, /body = \(await context\?\.clone\(\)\.json\(\)\) \?\? null;/);
    assert.match(deletion, /if \(result\?\.error === 'forbidden_role'\) return \{ ok: false, reason: 'forbidden' \};/);
    assert.match(deletion, /if \(result\?\.error === 'subscription_cancel_failed'\) return \{ ok: false, reason: 'subscription' \};/);
    assert.match(deleteFn, /json\(\{ error: 'forbidden_role' \}, 403\)/);
});

test('silme sayıları SAYILIYOR — satırlar telefona inmiyor', () => {
    const fn = source.slice(source.indexOf('export async function fetchDeletionFacts'), source.indexOf('export async function fetchKvkkUrl'));
    assert.match(fn, /select\('id', \{ count: 'exact', head: true \}\)/);
    for (const table of ['reservations', 'customers', 'services']) {
        assert.match(fn, new RegExp(`count\\('${table}'\\)`), table);
    }
    assert.match(fn, /from\('organization_members'\)\.select\('user_id, role'\)\s*\.eq\('org_id', organizationId\)/);
    assert.match(fn, /\.eq\('organization_id', organizationId\);/);
    assert.match(fn, /if \(result\.error\) throw result\.error;/);
    assert.doesNotMatch(deleteScreen, /readDeletionFacts/);
});

test('tek sahip = sunucunun kuralı; sahip olmayan silemez', () => {
    assert.deepEqual(
        deletionFactsOf({ role: 'owner', owners: 1, appointments: 3, customers: 2, services: 1, staff: ['Ece'] }),
        { soleManager: true, canDeleteRole: true, appointments: 3, customers: 2, services: 1, staff: ['Ece'] },
    );
    assert.equal(deletionFactsOf({ role: 'owner', owners: 2, appointments: 0, customers: 0, services: 0, staff: [] }).soleManager, false);
    const admin = deletionFactsOf({ role: 'admin', owners: 1, appointments: 0, customers: 0, services: 0, staff: [] });
    assert.deepEqual([admin.soleManager, admin.canDeleteRole], [false, false]);
    assert.match(deleteFn, /const soleOwner = \(owners\?\.length \?\? 0\) <= 1;/);
    assert.match(deleteFn, /if \(role !== 'owner'\) return json/);
});

test('sahip olmayana basılı tutturup sonra "yapamazsınız" denmiyor', () => {
    assert.match(deleteScreen, /const ready = !ownerOnly && canDelete\(copy, consented\);/);
    assert.match(deleteScreen, /setOwnerOnly\(!facts\.canDeleteRole\);/);
    assert.match(deleteScreen, /\{ownerOnly \? \([\s\S]*?deleteFailureText\('forbidden'\)/);
});

test('sayılar okunamazsa liste uydurulmuyor, "okuyamadık" çıkıyor', () => {
    assert.match(deleteScreen, /\.catch\(\(\) => \{ if \(alive\) setUnread\(true\); \}\);/);
    assert.match(deleteScreen, /<DurumUnread\s*what="Silinecekleri"/);
    assert.match(deleteScreen, /\}, \[router, attempt\]\);/);
});

// ── İşletme kartı ───────────────────────────────────────────────────────────

test('işletme kartı: konum ADRESTEN, personel sayısı gerçek, sektör sahibin satırından', () => {
    const [studio, bare] = businessesOf(
        [
            { id: 'o1', name: 'Studio Ayla', address: 'Caferağa Mah. Moda Cad. No:5, Kadıköy/İstanbul', owner_id: 'u1' },
            { id: 'o2', name: 'Boş Salon', address: null, owner_id: 'u9' },
        ],
        [{ organization_id: 'o1' }, { organization_id: 'o1' }, { organization_id: 'o2' }],
        [
            { organization_id: 'o1', user_id: 'u2', sector: 'berber', created_at: '2020-01-01' },
            { organization_id: 'o1', user_id: 'u1', sector: 'kuafor', created_at: '2024-01-01' },
            { organization_id: 'o2', user_id: 'u3', sector: 'bilinmeyen', created_at: '2021-01-01' },
        ],
    );
    assert.deepEqual(studio, {
        id: 'o1', name: 'Studio Ayla', location: 'Kadıköy', initials: 'SA', staffCount: 2,
        subscriptionStatus: 'active', sector: 'Kuaför',
    });
    assert.equal(bare.location, '');
    assert.equal(bare.staffCount, 1);
    assert.equal('sector' in bare, false, 'bilinmeyen sektör kodu ekrana çıkmamalı');
});

test('slug artık konum değil; kart sorguları sayfalı değil ama org süzgeçli', () => {
    const fn = live.slice(live.indexOf('async function managerBusinesses'), live.indexOf('async function managerStart'));
    assert.match(fn, /select\('id, name, address, owner_id'\)/);
    assert.doesNotMatch(fn, /slug/);
    assert.match(fn, /from\('staff'\)\.select\('organization_id'\)\s*\.in\('organization_id', ids\)\.eq\('is_active', true\)/);
    assert.match(fn, /from\('settings'\)\.select\('organization_id, user_id, sector, created_at'\)\s*\.in\('organization_id', ids\)/);
    assert.match(fn, /if \(staff\.error \|\| settings\.error\) return fail\('offline'\);/);
});

test('konum kısaltması: yalnız kalıba uyan adres kısalıyor, uzun metin konum diye yazılmıyor', () => {
    assert.equal(locationOf('Bağdat Cad. 12, Kadıköy/İstanbul'), 'Kadıköy');
    assert.equal(locationOf('Nişantaşı, İstanbul'), 'İstanbul');
    assert.equal(locationOf('Bebek'), 'Bebek');
    assert.equal(locationOf('Caferağa Mahallesi Moda Caddesi Numara Beş Kadıköy'), '');
    assert.equal(locationOf('  '), '');
    assert.equal(locationOf(null), '');
});

test('konum boşsa satırlarda sarkan ayraç yok', () => {
    assert.equal(businessLine({ name: 'Studio Ayla', location: '' }), 'Studio Ayla');
    assert.equal(businessLine({ name: 'Studio Ayla', location: 'Kadıköy' }, ' — '), 'Studio Ayla — Kadıköy');
    assert.equal(businessMeta({ location: '', staffCount: 4 }), '4 personel');
    assert.equal(businessMeta({ location: 'Bebek', staffCount: 3 }), 'Bebek · 3 personel');
    assert.match(ui, /\{businessMeta\(business\)\}/);
    assert.doesNotMatch(ui, /\{business\.location\} · \{business\.staffCount\} personel/);
    const copy = deletionCopy({
        businessName: 'Studio Ayla', businessLocation: '', managerName: 'Ayla', managerEmail: null,
        soleManager: true, appointments: 1, customers: 1, services: 1, staff: [],
    });
    assert.equal(copy.lines[1].title, 'Studio Ayla');
    for (const path of ['mobile/app/(auth)/locked.tsx', 'mobile/app/(staff-flow)/account.tsx', 'mobile/app/(auth)/resume.tsx']) {
        assert.doesNotMatch(read(path), /business\.name\} [·—] \$?\{?profile\.business\.location/, path);
    }
});

test('sektör adları masaüstünün profilleriyle aynı; kod ekrana çıkmıyor', () => {
    for (const [code, label] of Object.entries(SECTOR_LABELS)) {
        const block = desktopSectors.slice(desktopSectors.indexOf(`    ${code}: {`));
        assert.match(block.slice(0, 200), new RegExp(`label: '${label.replace(/[/]/g, '\\/')}'`), code);
    }
    assert.equal(sectorLabel('kuafor'), 'Kuaför');
    assert.equal(sectorLabel('xyz'), undefined);
    assert.equal(sectorLabel(null), undefined);
});

// ── KVKK ────────────────────────────────────────────────────────────────────

test('KVKK bağlantısı müdürde organizations.kvkk_url, personelde yok — tek yol', () => {
    assert.match(legal, /if \(!resumed\?\.ok \|\| resumed\.data\.profile\.actor !== 'manager'\) return null;/);
    assert.match(legal, /return fetchKvkkUrl\(\)\.catch\(\(\) => null\);/);
    const fn = source.slice(source.indexOf('export async function fetchKvkkUrl'));
    assert.match(fn.slice(0, 500), /from\('organizations'\)\.select\('kvkk_url'\)\s*\.eq\('id', organizationId\)/);
    assert.match(fn.slice(0, 700), /\/\^https\?:\\\/\\\/\/i\.test\(url\) \? url : null/);
    for (const path of ['mobile/app/(ortak)/profil/yasal.tsx', 'mobile/app/personel/profile.tsx', 'mobile/app/mudur/profile.tsx']) {
        assert.match(read(path), /readKvkkUrl \} from '[./]+src\/lib\/legalSource'/, path);
    }
});

test('saf katman React, Expo ve Supabase taşımıyor', () => {
    const pure = read('mobile/src/lib/accountMap.ts');
    assert.doesNotMatch(pure, /from 'react|from 'expo|supabase\./);
    assert.match(pure, /^import type \{ AuthBusiness \}/m);
});
