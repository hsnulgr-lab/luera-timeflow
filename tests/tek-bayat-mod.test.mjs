import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { businessesOf, soloInPractice } from '../mobile/src/lib/accountMap.ts';

/**
 * TEK KİŞİLİK KABUK, EKİBİ OLAN SALONDA AÇILMASIN (2026-11-10).
 *
 * Test Salon 2'nin bayrağı açıktı (`organizations.solo = true`) ama 4 aktif
 * personeli vardı: `set_business_mode(true)` personeli olan org'da da bayrağı
 * açıyor (108). Telefon tek kişilik kabuğu açtı, `solo.session` `not_solo`
 * dedi ve Gün'den açılan randevu kartı "Randevuyu okuyamadık" gösterdi.
 *
 * İki kilit: (1) kabuğu seçen mod sunucunun kuralıyla aynı — bayrak + en çok
 * bir aktif personel; (2) tek kişilik kabuk açılınca ve `not_solo` gelince
 * mod sunucudan yeniden okunuyor, saklı profile güvenilmiyor.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('mod = bayrak VE en çok bir aktif personel — sunucunun kuralı', () => {
    assert.equal(soloInPractice(true, 0), true, 'sıfır personel: kumanda no_staff der, ekip kabuğu çözmez');
    assert.equal(soloInPractice(true, 1), true);
    assert.equal(soloInPractice(true, 2), false, 'Test Salon 2: bayrak açık, ekip var');
    assert.equal(soloInPractice(true, 4), false);
    assert.equal(soloInPractice(false, 1), false);
    assert.equal(soloInPractice(null, 1), false);
    assert.equal(soloInPractice(undefined, 0), false);

    // Sunucudaki kapı aynı kuralı soruyor; biri değişirse öteki de gözden geçirilmeli.
    const fn = read('supabase/functions/staff-api/index.ts');
    assert.match(fn, /if \(!org\?\.solo\) return json\(\{ error: 'not_solo' \}, 403\);/);
    assert.match(fn, /if \(crew\.length > 1\) return json\(\{ error: 'not_solo' \}, 409\);/);
});

test('işletme kartı modu kadroyla birlikte hesaplıyor', () => {
    const [team, solo] = businessesOf(
        [
            { id: 'ts2', name: 'Test Salon 2', address: null, owner_id: 'u1', solo: true },
            { id: 'yalniz', name: 'Yalnız', address: null, owner_id: 'u2', solo: true },
        ],
        [
            { organization_id: 'ts2' }, { organization_id: 'ts2' },
            { organization_id: 'ts2' }, { organization_id: 'ts2' },
            { organization_id: 'yalniz' },
        ],
        [],
    );
    assert.equal(team.solo, false);
    assert.equal(team.staffCount, 4);
    assert.equal(solo.solo, true);
});

test('not_solo arıza değil: kabuğa haber veriyor, mod yeniden okunuyor', () => {
    const session = read('mobile/src/lib/soloSession.ts');
    const refresh = session.slice(session.indexOf('async function refresh'), session.indexOf('let notSoloListener'));
    assert.match(refresh, /if \(reason === 'not_solo'\) \{[\s\S]*notSoloListener\?\.\(\);/);

    const confirm = session.slice(session.indexOf('export async function confirmSoloMode'));
    // İşletme YENİDEN seçiliyor: profil de yazılıyor, sonraki açılış doğru kabuğa gider.
    assert.match(confirm, /authApi\.manager\.selectBusiness\(stored\.data\.profile\.business\.id\)/);
    // Okunamadıysa "bilmiyoruz" — kabuk yerinde kalır.
    assert.match(confirm, /if \(!fresh\.ok\) return undefined;/);
    // Ekibe geçerken tek kişilik jeton düşüyor (`startTeam` gibi).
    assert.match(confirm, /if \(!solo\) await tokens\.clearStaff\(\);/);
});

test('tek kişilik kabuk açılınca ve not_solo gelince modu doğruluyor', () => {
    const shell = read('mobile/app/tek/_layout.tsx');
    assert.match(shell, /const confirmed = gate\.state === 'allowed' && gate\.solo === true;/);
    assert.match(shell, /if \(alive && solo === false\) enterShell\('manager', false\);/);
    assert.match(shell, /const off = onNotSolo\(recheck\);/);
    // Kanca ERKEN dönüşlerden önce — yoksa hook sırası bozulur.
    assert.ok(
        shell.indexOf('onNotSolo(recheck)') < shell.indexOf("if (gate.state === 'checking')"),
        'yeniden okuma kancası kapı dönüşlerinden önce olmalı',
    );
});

test('141: masaüstünden ikinci aktif kişi salonu ekibe çeviriyor', () => {
    const sql = read('supabase/141_tek_kisilik_ekip_tutarliligi.sql');
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.solo_to_team_on_staff'), sql.indexOf('DROP TRIGGER'));
    // Yönetici üye de personel ekleyebiliyor; bayrağı yalnız sahip yazabiliyor.
    assert.match(fn, /SECURITY DEFINER/);
    assert.match(fn, /FOR UPDATE;/, 'eş zamanlı iki ekleme ikisi de "tek" görmesin');
    assert.match(fn, /IF v_active > 1 THEN\s+UPDATE organizations SET solo = false WHERE id = NEW\.organization_id;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.solo_to_team_on_staff\(\) FROM PUBLIC, anon, authenticated, service_role;/);
    // Pasiften geri alma da sayılıyor; pasife alma ve ad değişikliği tetiklemiyor.
    assert.match(sql, /AFTER INSERT OR UPDATE OF is_active, organization_id ON public\.staff\s+FOR EACH ROW\s+WHEN \(NEW\.is_active\)/);
});

test('141: ekibi olan salon "Yalnız ben"e geçemiyor', () => {
    const sql = read('supabase/141_tek_kisilik_ekip_tutarliligi.sql');
    const mode = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.set_business_mode'), sql.indexOf('-- 3) Tek seferlik'));
    // Kapı bayrak yazılmadan ÖNCE.
    assert.ok(mode.indexOf("RAISE EXCEPTION 'team_not_empty'") < mode.indexOf('UPDATE organizations SET solo = p_solo'));
    // 108'in imzası ve yetkisi değişmiyor.
    assert.match(mode, /p_solo BOOLEAN,\s+p_name TEXT DEFAULT NULL\s*\)\s*RETURNS UUID/);
    assert.doesNotMatch(mode, /SECURITY DEFINER/);

    const wizard = read('src/pages/SetupWizardPage.tsx');
    assert.match(wizard, /team === 'solo' && activeStaff\.length > 1 \? `Uzmanlar'da \$\{activeStaff\.length\} aktif kişi var/);
});
