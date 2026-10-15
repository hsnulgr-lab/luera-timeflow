/**
 * Demo tohumu personeli KORUYOR (2026-10-15, telefonda bulundu).
 *
 * `supabase/DEMO_salon.sql` VPS'te cron'la günde dört kez koşuyor (11:00,
 * 13:00, 15:00, 00:10 İstanbul). Eskiden her koşu `DELETE FROM staff` ile üç
 * personeli YENİ kimlikle kuruyordu; 13:00 koşusu telefonda açık Derya Toprak
 * oturumunu düşürdü ve bütün personel ekranları "okuyamadık" dedi. 00:10
 * koşusu ABD'li hakemin öğleden sonrasına denk geliyor.
 *
 * Üretim kanıtı: `supabase/tests/demo_personel_sabit_regression.sql` (kuru
 * koşu, iki ardışık koşu, ROLLBACK). Bu dosya yalnız kaynağın geri
 * kaymadığını tutuyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const seed = readFileSync(new URL('../supabase/DEMO_salon.sql', import.meta.url), 'utf8')
    .replace(/--.*$/gm, '');

test('tohum demo personelin TAMAMINI silmiyor', () => {
    assert.doesNotMatch(seed, /DELETE FROM staff\s+WHERE organization_id = v_org;/);
    assert.match(seed, /DELETE FROM staff WHERE organization_id = v_org\s+AND name NOT IN \('Elif Demir', 'Selin Kaya', 'Derya Toprak'\);/);
});

test('üç personel varsa GÜNCELLENİYOR, yoksa kuruluyor — kimlik sabit', () => {
    for (const [name, slot] of [['Elif Demir', 'v_s1'], ['Selin Kaya', 'v_s2'], ['Derya Toprak', 'v_s3']]) {
        const update = new RegExp(`UPDATE staff SET [^;]*WHERE organization_id = v_org AND name = '${name}' RETURNING id INTO ${slot};`);
        assert.match(seed, update, `${name} güncellenmiyor`);
        assert.match(seed, new RegExp(`IF ${slot} IS NULL THEN\\s+INSERT INTO staff`), `${name} yoksa kurulmuyor`);
    }
    // UPDATE … RETURNING INTO tek satır ister: aynı adın fazlası önce siliniyor.
    assert.match(seed, /AND t\.name = s\.name AND t\.id < s\.id\);/);
    assert.ok(seed.indexOf('t.id < s.id') < seed.indexOf("name = 'Elif Demir' RETURNING id INTO v_s1"));
});

test('kuru koşu kontrolü kimliklerin AYNI kaldığını soruyor', () => {
    const check = readFileSync(new URL('../supabase/tests/demo_personel_sabit_regression.sql', import.meta.url), 'utf8');
    assert.match(check, /FROM _once b JOIN staff s ON s\.id = b\.id/);
    assert.match(check, /r\.staff_id NOT IN \(SELECT id FROM _once\)/);
});

test('tohum SESSİZ: işaret ilk randevu yazımından önce, tetikleyici işaretle susuyor (120)', () => {
    /*
     * 2026-10-16 00:10: demo personele bağlı telefona aynı anda yedi "Yeni
     * randevun var" düştü. Personel korunduğu için abonelik de korunuyor;
     * tohumun yazdığı her randevu bildirim tetikliyordu.
     */
    const raw = readFileSync(new URL('../supabase/DEMO_salon.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
    const mark = raw.indexOf("PERFORM set_config('luera.tohum', 'sessiz', true);");
    assert.ok(mark > 0, 'tohum sessiz işaretini koymuyor');
    assert.ok(mark < raw.indexOf('INSERT INTO reservations'), 'işaret ilk randevu yazımından SONRA');
    const mig = readFileSync(new URL('../supabase/120_tohum_sessiz.sql', import.meta.url), 'utf8');
    assert.match(mig, /when \(coalesce\(current_setting\('luera\.tohum', true\), ''\) <> 'sessiz'\)\s*execute function public\.notify_push_on_reservation\(\);/);
    assert.match(mig, /after insert or update on public\.reservations/);
});
