import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Paket hakkının düşümü. Bu dosya çalışan bir Postgres istemez; fonksiyonun
// atomikliği kod düzeyinde ihlal edilemesin diye şeklini bekçilik eder:
// kilit alınmadan, tek transaction dışında ya da bayrak yazılmadan bir sürüm
// sessizce geri sızarsa test kırılır.
//
// GÖVDE ARTIK 094'TE. 078 fonksiyonu yazdı, 094 onu `..._core` çekirdeğine
// indirip iki ince sarmalayıcı ekledi (masaüstü ve personel). Veritabanında
// geçerli olan SON tanım, yani 094 — bu dosya 078'i okumaya devam etseydi
// çekirdek bozulduğunda hiçbir şey söylemezdi.
const migration = readFileSync(new URL('../supabase/094_consume_plan_session_staff.sql', import.meta.url), 'utf8');
const old078 = readFileSync(new URL('../supabase/078_consume_plan_session.sql', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/hooks/useReservations.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');

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
    // Çekirdek: iddia randevunun KENDİSİNE karşı doğrulanıyor.
    assert.match(migration, /if v_res\.organization_id <> p_org_id then/);
    assert.match(migration, /and organization_id = p_org_id/, 'plan da org ile aranmalı');
    // Masaüstü yüzü: üyelik kontrolü sarmalayıcıda duruyor.
    assert.match(migration, /if v_org not in \(select public\.auth_user_org_ids\(\)\) then/);
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

test('her yüzün kendi rolü var, çekirdeğin hiç yok', () => {
    // Çekirdek yetki KONTROL ETMİYOR; o yüzden hiçbir role açılmamalı.
    assert.doesNotMatch(migration, /grant execute on function public\.consume_plan_session_core/);

    assert.match(migration, /grant execute on function public\.consume_plan_session\(uuid, uuid\) to authenticated/);

    // Personel yüzü YALNIZ service_role: org'u çağıran bildiriyor ve o anahtar
    // yalnız edge function'da.
    assert.match(migration, /grant execute on function public\.consume_plan_session_for_staff\(uuid, uuid, uuid\) to service_role/);
    assert.doesNotMatch(migration, /consume_plan_session_for_staff\(uuid, uuid, uuid\) to authenticated/);
});

test('iptal ADLI ROLLERİ de kapsıyor — `from public` yetmiyor', () => {
    /*
     * İlk sürüm yalnız `from public` yazıyordu ve delik buydu: Supabase'in
     * varsayılan ayrıcalıkları `public` şemasındaki YENİ fonksiyonlara
     * `anon, authenticated, service_role` için AÇIK grant veriyor ve o
     * grantlar PUBLIC iptalinden sağ çıkıyor.
     *
     * Sonuç: yetki kontrolü HİÇ YAPMAYAN çekirdek, tarayıcıda açıkta duran
     * anon anahtarıyla çağrılabiliyordu — ve `security definer` olduğu için
     * sahibin yetkisiyle.
     *
     * Bu test o sürümü geri sızarsa kırılır.
     */
    const revokes = migration.match(/revoke all on function[\s\S]*?;/g) ?? [];
    assert.equal(revokes.length, 3, 'üç fonksiyonun da iptali olmalı');
    for (const line of revokes) {
        for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
            assert.match(line, new RegExp(`\\b${role}\\b`),
                `iptal ${role} rolünü kapsamıyor:\n${line}`);
        }
    }
});

test('gövde KOPYALANMADI — tek çekirdek', () => {
    // İki ayrı gövde bir gün ayrışırdı ve ayrışan şey PARA olurdu.
    const bodies = (migration.match(/insert into public\.package_rights_ledger/g) ?? []).length;
    assert.equal(bodies, 1, 'hak defterine yazan tek bir yer olmalı');
    for (const face of ['consume_plan_session(', 'consume_plan_session_for_staff(']) {
        const at = migration.indexOf(`function public.${face}`);
        const body = migration.slice(at, migration.indexOf('$$;', at));
        assert.match(body, /consume_plan_session_core\(/, `${face} çekirdeğe devretmeli`);
    }
});

test('078 ARTIK GEÇERLİ DEĞİL ve bu yazılı', () => {
    // Dosya duruyor (geçmiş), ama veritabanındaki tanım 094'ünki. Biri 078'i
    // düzenleyip düzelttiğini sanmasın diye bu bağ testle kuruluyor.
    assert.match(old078, /create or replace function public\.consume_plan_session\(/);
    assert.match(migration, /create or replace function public\.consume_plan_session\(/,
        '094 aynı imzayı yeniden tanımlamalı, yoksa 078 yürürlükte kalır');
});

test('staff-api paket hakkını DÜŞÜRÜYOR', () => {
    // Faz 4'e kadar uykudaydı: telefon hiçbir şey yazmıyordu. `visit.finish`
    // üretime yazmaya başlayınca müşterinin paketi hiç azalmaz oldu.
    const cut = api.slice(api.indexOf("if (action === 'visit.finish')"), api.indexOf("if (action === 'catalog')"));
    assert.match(cut, /admin\.rpc\('consume_plan_session_for_staff'/);
    assert.match(cut, /p_org_id: me\.organization_id/, 'org TOKENDAN, istek gövdesinden değil');
    assert.doesNotMatch(cut, /p_org_id: body\./);
});

test('staff-api plan bağını randevudan okuyor ve bayraklıysa çağırmıyor', () => {
    const cut = api.slice(api.indexOf("if (action === 'visit.finish')"), api.indexOf("if (action === 'catalog')"));
    assert.match(cut, /fields\.paket_plan_id/);
    assert.match(cut, /String\(fields\.paket_sayildi \?\? ''\) === 'true'/);
    assert.match(cut, /if \(planId && !counted\)/);
});

test('paket hatası hizmetin tamamlanmasını GERİ ALMIYOR ama susmuyor', () => {
    // Stokla aynı kural. Sessizce yutmak, hakkı düşmemiş bir paketi düşmüş
    // sanmak demek.
    const cut = api.slice(api.indexOf("if (action === 'visit.finish')"), api.indexOf("if (action === 'catalog')"));
    assert.match(cut, /planWarning = 'Paket hakkı düşülemedi'/);
    assert.match(cut, /planWarning = 'Paket hakkı kontrol edilemedi'/);
    // Uyarılar tek listede; ikisi birden olabilir.
    assert.match(cut, /\[stockWarning, planWarning\]\.filter\(Boolean\)/);
    // Ve hiçbir hata dalı `return` ile bitirişi iptal etmiyor.
    assert.doesNotMatch(cut, /planWarning[\s\S]{0,80}return json\(/);
});

test('hook RPC çağırır ve migration yokken eski yola düşer', () => {
    assert.match(hook, /supabase\.rpc\('consume_plan_session'/);
    assert.match(hook, /PGRST202/);
});
