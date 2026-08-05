import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Paket hakkının düşümü (078). Bu dosya çalışan bir Postgres istemez; fonksiyonun
// atomikliği kod düzeyinde ihlal edilemesin diye şeklini bekçilik eder:
// kilit alınmadan, tek transaction dışında ya da bayrak yazılmadan bir sürüm
// sessizce geri sızarsa test kırılır.

const migration = readFileSync(new URL('../supabase/078_consume_plan_session.sql', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/hooks/useReservations.ts', import.meta.url), 'utf8');

test('fonksiyon hem randevuyu hem planı kilitler', () => {
    // İki `for update` şart: randevu kilidi aynı randevunun eşzamanlı iki
    // tamamlamasını sıraya sokar, plan kilidi farklı randevuların aynı plandan
    // aynı anda hak düşürmesini engeller.
    const locks = migration.match(/for update/gi) || [];
    assert.equal(locks.length, 2, 'randevu ve plan ayrı ayrı kilitlenmeli');
    assert.match(migration, /from public\.reservations[\s\S]{0,120}for update/i);
    assert.match(migration, /from public\.treatment_plans[\s\S]{0,220}for update/i);
});

test('org kontrolü var — başka tenantın planı düşürülemez', () => {
    assert.match(migration, /auth_user_org_ids\(\)/);
    assert.match(migration, /organization_id = v_res\.organization_id/);
});

test('sayaç sınırları korunur ve dolan plan kapanır', () => {
    assert.match(migration, /least\(v_total, v_prev \+ 1\)/);
    assert.match(migration, /when v_done >= v_total then 'completed'/);
});

test('idempotent: sayılmış randevu ikinci kez hak düşürmez', () => {
    assert.match(migration, /paket_sayildi', 'false'\) = 'true'/);
    assert.match(migration, /'already_counted'/);
});

test('hakkı bitmiş planda bayrak yine basılır (sonsuz yeniden deneme olmasın)', () => {
    const exhausted = migration.slice(migration.indexOf('plan_exhausted') - 400, migration.indexOf('plan_exhausted'));
    assert.match(exhausted, /update public\.reservations/);
});

test('tüketim hak defterine yazılır', () => {
    assert.match(migration, /insert into public\.package_rights_ledger/);
    assert.match(migration, /'used', 'use'/);
});

test('fonksiyon yalnız authenticated role için açık', () => {
    assert.match(migration, /revoke all on function public\.consume_plan_session/);
    assert.match(migration, /grant execute on function public\.consume_plan_session\(uuid, uuid\) to authenticated/);
});

test('hook RPC çağırır ve migration yokken eski yola düşer', () => {
    assert.match(hook, /supabase\.rpc\('consume_plan_session'/);
    assert.match(hook, /PGRST202/);
});
