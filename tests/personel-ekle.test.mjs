/**
 * PERSONEL EKLE — telefondan (2026-10-13).
 *
 * Personel sayfası "Personel eklemek bilgisayardan: Luera → Personel"
 * diyordu; tek kişilikten ekibe geçen sahibin bilgisayarı yok. Telefon
 * masaüstünün yazdığı satırı yazıyor; rol ve renk `start_team`in kuralıyla.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    STAFF_PALETTE, addProblem, staffAdd, staffColorOf, staffRoleOf,
} from '../mobile/src/lib/teamAdd.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
const m115 = read('supabase/115_tek_sahip_adi_ve_donus.sql');

test('rol MESLEKTEN — start_team ile aynı kural', () => {
    assert.equal(staffRoleOf('Diş hekimi'), 'doctor');
    assert.equal(staffRoleOf('DİŞ HEKİMİ'), 'doctor');
    assert.equal(staffRoleOf('Doktor'), 'doctor');
    assert.equal(staffRoleOf('Hekim asistanı'), 'assistant'); // asistan önce bakılıyor (SQL'deki sıra)
    assert.equal(staffRoleOf('Kasiyer'), 'cashier');
    assert.equal(staffRoleOf('Kuaför'), 'staff');
    assert.equal(staffRoleOf(''), 'staff');
    assert.equal(staffRoleOf(null), 'staff');

    // Desenler sunucudakilerle AYNI — biri değişirse öteki de.
    const rule = m115.slice(m115.indexOf('v_role := CASE'), m115.indexOf('END;', m115.indexOf('v_role := CASE')));
    for (const part of ['asistan', 'assistant', 'yardımcı', 'yardimci', 'hekim', 'doktor', 'doctor', 'dentist',
        'diş', 'dis', 'kasa', 'kasiyer', 'cashier', 'vezne', 'tahsilat']) {
        assert.ok(rule.includes(`'%${part}%'`), `sunucuda yok: ${part}`);
    }
    assert.ok(rule.indexOf('assistant') < rule.indexOf('doctor') && rule.indexOf('doctor') < rule.indexOf('cashier'));
});

test('renk: salonda kullanılmayan ilk palet rengi — palet sunucununkiyle aynı', () => {
    assert.equal(staffColorOf([]), '#FF5A1F');
    assert.equal(staffColorOf(['#FF5A1F', null, undefined]), '#E8973C');
    assert.equal(staffColorOf(['#E8973C']), '#FF5A1F');
    assert.equal(staffColorOf([...STAFF_PALETTE]), '#5B7CC2');

    const sql = m115.slice(m115.indexOf("unnest(ARRAY["), m115.indexOf(']', m115.indexOf("unnest(ARRAY[")));
    assert.deepEqual([...sql.matchAll(/'(#[0-9A-F]{6})'/g)].map((m) => m[1]), [...STAFF_PALETTE]);
});

test('yazma: masaüstünün satırı — ad, meslek, rol, renk, aktif; satır GERİ isteniyor', () => {
    const write = code('mobile/src/lib/managerWrite.ts');
    const fn = write.slice(write.indexOf('export async function addStaffMember'), write.indexOf('export type CreatedAppointment'));
    assert.match(fn, /\.from\('staff'\)\s*\.select\('color'\)\s*\.eq\('organization_id', organizationId\)/);
    assert.match(fn, /\.insert\(\{\s*organization_id: organizationId,\s*name: input\.name\.trim\(\),\s*specialty,\s*role: staffRoleOf\(specialty\),\s*color: staffColorOf\(/);
    assert.match(fn, /is_active: true,/);
    // Şifre ve çalışma saati YAZILMIYOR: kişi kendisi belirliyor, saat işletmenin.
    assert.doesNotMatch(fn, /\bpin\b|working_hours/);
    assert.match(fn, /\.select\('id'\)/);
    assert.match(fn, /if \(error\.code === '42501'\) return \{ ok: false, reason: 'not_allowed' \};/);
    assert.match(fn, /return id \? \{ ok: true, id \} : \{ ok: false, reason: 'not_allowed' \};/);
});

test('hata cümleleri kimsenin eklenmediğini söylüyor', () => {
    for (const reason of ['offline', 'not_allowed', 'failed']) {
        assert.match(addProblem(reason), /Kimse eklenmedi/);
    }
    assert.match(staffAdd.foot, /Telefon bağla/);
});

test('Personel sayfası: + düğmesi ekleme sayfasını açıyor, "bilgisayardan" cümlesi gitti', () => {
    const screen = read('mobile/app/(manager-flow)/profil/personel.tsx');
    assert.match(screen, /accessibilityLabel="Personel ekle"/);
    assert.match(screen, /router\.push\('\/\(manager-flow\)\/profil\/personel-ekle'\)/);
    assert.doesNotMatch(code('mobile/app/(manager-flow)/profil/personel.tsx'), /bilgisayardan/i);
    assert.match(screen, /Personel eklemek için sağ üstteki \+ düğmesine dokunun\./);
    assert.match(read('mobile/app/_layout.tsx'), /<Stack\.Screen name="\(manager-flow\)\/profil\/personel-ekle" \/>/);
});

test('ekleme sayfası: Ekip ekle ile AYNI alanlar; eklenince kapanıyor', () => {
    const add = code('mobile/app/(manager-flow)/profil/personel-ekle.tsx');
    const start = code('mobile/app/(manager-flow)/profil/ekip-ekle.tsx');
    for (const page of [add, start]) {
        assert.match(page, /import \{ TeamField \} from '..\/..\/..\/src\/components\/TeamField';/);
        assert.match(page, /label=\{teamStart\.name\}/);
        assert.match(page, /label=\{teamStart\.specialty\}/);
        assert.match(page, /maxLength=\{TEAM_NAME_MAX\}/);
    }
    assert.match(add, /const result = await addStaffMember\(\{ name, specialty \}\)/);
    assert.match(add, /if \(result\.ok\) \{\s*feedback\.success\(\);\s*router\.back\(\);/);
    assert.match(add, /setProblem\(addProblem\(result\.reason\)\);/);
    // Ad boşken düğme kapalı.
    assert.match(add, /disabled=\{busy \|\| !ready\}/);
});

test('dönüşün hata cümlesi telefondaki yolu gösteriyor', async () => {
    const { teamEndProblem } = await import('../mobile/src/lib/authCopy.ts');
    assert.match(teamEndProblem('team_not_empty'), /İşletme › Personel’den ekipten çıkarın/);
    assert.doesNotMatch(teamEndProblem('team_not_empty'), /bilgisayar/);
});
