/**
 * 119 · Tahsilatı olan işletme SİLİNEBİLİYOR (2026-10-16, telefonda bulundu).
 *
 * 102'nin tetikleyicisi zincirleme silinen her tahsilat için, o anda artık
 * var olmayan işletmeye iz yazmaya çalışıyordu: "Hesabımı sil" →
 * 23503 payment_void_log_organization_id_fkey → bütün silme geri sarılıyordu.
 * Apple 5.1.1(v); 1.0.1'de tek kişilik tahsilat hakem yolunun ortasında.
 *
 * Davranış kanıtı: PGlite'ta 102 hatayı birebir üretiyor, 119 ile işletme
 * siliniyor ve tek silmede iz hâlâ yazılıyor; üretimde
 * `supabase/tests/hesap_silme_odeme_regression.sql` (kuru koşu, ROLLBACK).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../supabase/${p}`, import.meta.url), 'utf8');

test('iz tetikleyicisi işletmesi silinmiş tahsilatta yazmıyor, ötekinde yazıyor', () => {
    const sql = read('119_hesap_silme_odeme_izi.sql');
    const fn = sql.slice(sql.indexOf('create or replace function public.log_payment_void()'), sql.indexOf('revoke all'));
    const guard = fn.indexOf('if not exists (select 1 from public.organizations where id = old.organization_id) then');
    assert.ok(guard > 0, 'işletme yoksa yazmama kapısı yok');
    assert.ok(guard < fn.indexOf('insert into public.payment_void_log'), 'kapı yazmadan ÖNCE olmalı');
    assert.match(fn, /return old;\s*end if;/);
    // Yetki kapısı yeniden kapatılıyor (097'nin dersi).
    assert.match(sql, /revoke all on function public\.log_payment_void\(\) from public, anon, authenticated;/);
});

test('kuru koşu iki yönü de soruyor', () => {
    const check = read('tests/hesap_silme_odeme_regression.sql');
    assert.match(check, /tek tahsilat silindi ama iz yazılmadı/);
    assert.match(check, /DELETE FROM public\.organizations WHERE id = v_org;/);
    assert.match(check, /IF v_paid < 2 THEN/);
});
