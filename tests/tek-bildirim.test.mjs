/**
 * Tek kişilik · KENDİNE BİLDİRİM YOK (göç 116 · 2026-10-13).
 *
 * Telefonda: tahsilattan hemen sonra kilit ekranına "Adisyon kasada 💰 ·
 * Tuğçe · Kalıcı Makyaj · tahsil bekliyor" düştü. Tek kişilikte müdür,
 * gönderen ve parayı alan aynı kişi; para da çoktan alınmıştı.
 *
 * Davranış PGlite'ta ve canlıda `supabase/tests/tek_bildirim_regression.sql`
 * ile sınanıyor (işlem içi, geri sarılır). Bu dosya göçün METNİNİ kilitliyor:
 * yalnız iki koşul değişti, 107'nin geri kalanı birebir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fnOf = (sql) => sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.notify_push_on_reservation()'),
    sql.indexOf('$$;', sql.indexOf('CREATE OR REPLACE FUNCTION public.notify_push_on_reservation()')) + 3,
);
const m107 = fnOf(read('supabase/107_mudur_yeni_randevu.sql'));
const m116src = read('supabase/116_tek_kendine_bildirim_yok.sql');
const m116 = fnOf(m116src);
const code = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

test('116 tek işlemde, şemayı tazeliyor', () => {
    assert.match(m116src, /^BEGIN;$/m);
    assert.match(m116src, /^COMMIT;$/m);
    assert.match(m116src, /NOTIFY pgrst, 'reload schema';/);
});

test('adisyon olayı tek kişilikte yok; iptal yalnız sahibin kendi iptalinde susuyor', () => {
    assert.match(code(m116), /IF TG_OP = 'UPDATE' AND NOT v_solo AND OLD\.service_ended_at IS NULL AND NEW\.service_ended_at IS NOT NULL/);
    assert.match(code(m116), /IF TG_OP = 'UPDATE' AND NOT v_self AND OLD\.status IS DISTINCT FROM 'cancelled' AND NEW\.status = 'cancelled' THEN PERFORM net\.http_post\( url := v_url \|\| '\/send-push', headers := v_hdrs, body := jsonb_build_object\( 'organization_id', NEW\.organization_id, 'target', jsonb_build_object\('role', 'manager'\)/);
    // Oturumsuz (staff-api, asistan, halka açık sayfa) = sahip DEĞİL.
    assert.match(code(m116), /v_self := v_solo AND COALESCE\(auth\.uid\(\) = v_owner, false\);/);
    // Personelin iptal olayı (5) koşulsuz kaldı.
    assert.match(code(m116), /IF TG_OP = 'UPDATE' AND NEW\.staff_id IS NOT NULL AND OLD\.status IS DISTINCT FROM 'cancelled' AND NEW\.status = 'cancelled' THEN/);
});

test('107\'nin geri kalanı birebir — yalnız iki koşul ve okuma eklendi', () => {
    const back = code(m116)
        .replace(' v_solo BOOLEAN; v_owner UUID; v_self BOOLEAN;', '')
        .replace(/ SELECT COALESCE\(o\.solo, false\), o\.owner_id INTO v_solo, v_owner FROM organizations o WHERE o\.id = NEW\.organization_id; v_solo := COALESCE\(v_solo, false\); v_self := v_solo AND COALESCE\(auth\.uid\(\) = v_owner, false\);/, '')
        .replace("IF TG_OP = 'UPDATE' AND NOT v_solo AND", "IF TG_OP = 'UPDATE' AND")
        .replace("IF TG_OP = 'UPDATE' AND NOT v_self AND", "IF TG_OP = 'UPDATE' AND");
    assert.equal(back, code(m107));
});

test('canlı test göçü tanıyor ve kuyruğa bakıyor', () => {
    const t = read('supabase/tests/tek_bildirim_regression.sql');
    assert.match(t, /position\('NOT v_solo' IN pg_get_functiondef/);
    assert.match(t, /FROM net\.http_request_queue q/);
    assert.match(t, /SELECT 'tek bildirim \(116\) regression: ok' AS result;\s*ROLLBACK;/);
});
