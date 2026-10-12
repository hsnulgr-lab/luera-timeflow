/**
 * Tek Kişilik · SAHİBİN ADI + EKİPTEN DÖNÜŞ (115 · kullanıcı kararları, 2026-10-12).
 *
 *   1. Ekibe geçerken sahibin adı sorulur — ekip takviminde sahibin sütunu
 *      salonun adıyla görünüyordu.
 *   2. Ekipten tek kişiliğe dönüş kapısı — kayıttaki "Sonradan İşletme’den
 *      değiştirebilirsiniz" cümlesi yalnız bir yönde doğruydu.
 *
 * Göçün davranışı gerçek Postgres'te sınandı (PGlite: 3 senaryo + 11 söküm —
 * devir §24) ve üretimde kuru koşuyla sınanacak
 * (`supabase/tests/tek_donus_regression.sql`). Bu dosya KRİTİK satırları ve
 * istemcinin sözlerini kilitliyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    teamEnd, teamEndNotice, teamEndProblem, teamEndRowSub, teamStart, teamStartProblem,
} from '../mobile/src/lib/authCopy.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const sql = (p) => read(p).replace(/--[^\n]*/g, '');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const m115 = sql('supabase/115_tek_sahip_adi_ve_donus.sql');
const regression = read('supabase/tests/tek_donus_regression.sql');
const authLive = code('mobile/src/api/auth.ts');
const authStub = code('mobile/src/api/authStub.ts');
const teamScreen = code('mobile/app/(manager-flow)/profil/ekip-ekle.tsx');
const endScreen = code('mobile/app/(manager-flow)/profil/tek-kisilige-don.tsx');
const profile = code('mobile/app/mudur/profile.tsx');
const layout = code('mobile/app/_layout.tsx');

// ── 1 · Sahibin adı ─────────────────────────────────────────────────────────

test('115 · eski imza düşüyor, yeni imza eski çağrıyla da çalışıyor', () => {
    // İki sürüm birlikte kalırsa PostgREST adayları ayırt edemez.
    assert.match(m115, /DROP FUNCTION IF EXISTS public\.start_team\(TEXT, TEXT\);/);
    assert.match(m115, /CREATE OR REPLACE FUNCTION public\.start_team\(\s*p_name\s+TEXT,\s*p_specialty\s+TEXT DEFAULT NULL,\s*p_owner_name TEXT DEFAULT NULL\s*\)/);
    assert.match(m115, /REVOKE ALL ON FUNCTION public\.start_team\(TEXT, TEXT, TEXT\)\s+FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(m115, /GRANT EXECUTE ON FUNCTION public\.start_team\(TEXT, TEXT, TEXT\) TO authenticated;/);
    // Eski regresyon iki imzada da koşuyor.
    assert.match(read('supabase/tests/tek_v4_regression.sql'), /to_regprocedure\('public\.start_team\(text,text,text\)'\),\s*to_regprocedure\('public\.start_team\(text,text\)'\)/);
});

test('115 · sahibin adı yeni çalışan eklenmeden ÖNCE ve yalnız tek aktif satıra', () => {
    const rename = m115.indexOf('UPDATE staff SET name = v_owner, updated_at = now() WHERE id = v_crew[1];');
    const insert = m115.indexOf('INSERT INTO staff (organization_id, name, specialty, role, color)');
    assert.ok(rename > 0 && rename < insert, 'ad, çalışan eklenmeden önce yazılmalı');
    assert.match(m115, /IF cardinality\(v_crew\) = 1 THEN\s*UPDATE staff SET name = v_owner/);
    assert.match(m115, /IF v_owner IS NOT NULL AND length\(v_owner\) > 80 THEN\s*RAISE EXCEPTION 'owner_name_too_long';/);
});

test('istemci: sahibin adı boş geçilemiyor ve sunucuya gidiyor', () => {
    const fn = authLive.slice(authLive.indexOf('async function startTeam'), authLive.indexOf('async function endTeam'));
    assert.match(fn, /const cleanOwner = ownerName\.trim\(\);\s*if \(!cleanOwner\) return fail\('owner_name_required'\);/);
    assert.match(fn, /p_owner_name: cleanOwner,/);
    assert.match(authLive, /const TEAM_REFUSALS = \['owner_name_too_long', 'name_required', 'name_too_long', 'already_team'\] as const;/);
    // `name_too_long` `owner_name_too_long`un içinde geçiyor: önce uzun olan aranmalı.
    assert.ok(authLive.indexOf("'owner_name_too_long'") < authLive.indexOf("'name_too_long', 'already_team'"));
    assert.match(authStub, /if \(!ownerName\.trim\(\)\) return failure\('owner_name_required'\);/);
});

test('Ekip ekle: önce "Siz", sonra çalışan; iki ad da dolmadan düğme kapalı', () => {
    assert.ok(teamScreen.indexOf('teamStart.ownerHead') < teamScreen.indexOf('teamStart.formHead'));
    assert.match(teamScreen, /const ready = ownerName\.trim\(\)\.length > 0 && name\.trim\(\)\.length > 0;/);
    assert.match(teamScreen, /onSubmitEditing=\{\(\) => nameRef\.current\?\.focus\(\)\}/);
    assert.equal(teamStart.ownerName, 'Adınız');
    assert.equal(teamStart.ownerHint, 'Ekip takviminde sütununuz bu adla görünür.');
    assert.equal(teamStartProblem('owner_name_required'), 'Kendi adınızı yazın.');
    assert.equal(teamStartProblem('owner_name_too_long'), 'Adınız en fazla 80 harf olabilir.');
});

// ── 2 · Dönüş ───────────────────────────────────────────────────────────────

test('115 · dönüş yalnız sahibin, ekip boşken; kimin çıkacağını sunucu seçmiyor', () => {
    assert.doesNotMatch(m115, /SECURITY DEFINER/);
    assert.match(m115, /CREATE OR REPLACE FUNCTION public\.end_team\(\s*p_name TEXT DEFAULT NULL\s*\)\s*RETURNS JSONB/);
    assert.match(m115, /IF v_solo IS TRUE THEN\s*RAISE EXCEPTION 'already_solo';/);
    assert.match(m115, /IF cardinality\(v_crew\) > 1 THEN\s*RAISE EXCEPTION 'team_not_empty';/);
    // Hiç aktif yoksa 108'in kuralıyla satır açılıyor.
    assert.match(m115, /VALUES \(v_org_id, COALESCE\(NULLIF\(btrim\(p_name\), ''\), 'Ben'\)\)/);
    assert.match(m115, /REVOKE ALL ON FUNCTION public\.end_team\(TEXT\)\s+FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(m115, /GRANT EXECUTE ON FUNCTION public\.end_team\(TEXT\) TO authenticated;/);
});

test('115 · yalnız İLERİ ve AÇIK randevular kalan kişiye; çakışan personelsiz, kilitli olduğu gibi', () => {
    assert.match(m115, /v_today\s+DATE := \(now\(\) AT TIME ZONE 'Europe\/Istanbul'\)::DATE;/);
    assert.match(m115, /AND r\.date >= v_today\s+AND r\.status NOT IN \('cancelled', 'completed'\)\s+AND r\.service_ended_at IS NULL\s+AND r\.staff_id IS NOT NULL\s+AND r\.staff_id <> v_me/);
    assert.match(m115, /WHEN exclusion_violation THEN\s*BEGIN\s*UPDATE reservations SET staff_id = NULL WHERE id = v_row\.id;/);
    assert.match(m115, /WHEN check_violation THEN\s*v_kept := v_kept \+ 1;/);
    assert.doesNotMatch(m115, /WHEN OTHERS/);
    // Bayrak döngüden SONRA: dönüş ya tamamen olur ya hiç.
    assert.ok(m115.indexOf('END LOOP;') < m115.indexOf('UPDATE organizations SET solo = true WHERE id = v_org_id;'));
});

test('regresyon altı sözü sınıyor ve her şeyi geri sarıyor', () => {
    for (const promise of ['── 1)', '── 2)', '── 3)', '── 4)', '── 5)', '── 6)']) {
        assert.ok(regression.includes(promise), `${promise} bölümü yok`);
    }
    assert.match(regression, /'tek dönüş \(115\) regression: ok'/);
    assert.match(regression.trimEnd(), /ROLLBACK;$/);
    assert.match(regression, /sed -e '\/\^BEGIN;\$\/d' -e '\/\^COMMIT;\$\/d' supabase\/115_tek_sahip_adi_ve_donus\.sql;/);
    // Kullanıcı adına retler DO bloğunda (pg_temp, SET ROLE altında çağrılamıyor).
    assert.doesNotMatch(regression.replace(/--[^\n]*/g, ''), /pg_temp\./);
});

test('istemci: "zaten tek kişilik" başarı sayılıyor; sayılar ekrana gidiyor', () => {
    const fn = authLive.slice(authLive.indexOf('async function endTeam'), authLive.indexOf('async function teamMemberExists'));
    assert.match(fn, /supabase\.rpc\('end_team', \{ p_name: name \}\)/);
    assert.match(fn, /if \(!message\.includes\('already_solo'\)\) \{/);
    assert.match(fn, /if \(error\.code === '42501'\) return fail\('subscription_inactive'\);/);
    assert.match(fn, /const session = await selectManagerBusiness\(org\.id\);/);
    assert.match(authStub, /if \(business\.staffCount > 1\) return failure\('team_not_empty'\);/);
});

test('İşletme satırı YALNIZ ekipte, sahipten başka aktif kimse yokken', () => {
    assert.match(profile, /\{!solo && team !== null && team\.length <= 1 \? \(\s*<ProfileRow\s*big\s*title=\{teamEnd\.title\}\s*sub=\{teamEndRowSub\(team\)\}\s*onPress=\{\(\) => router\.push\('\/\(manager-flow\)\/profil\/tek-kisilige-don'\)\}/);
    assert.match(layout, /<Stack\.Screen name="\(manager-flow\)\/profil\/tek-kisilige-don" \/>/);
    assert.equal(teamEndRowSub([{ name: 'Derya Toprak' }]), 'Ekipte yalnız Derya Toprak var');
    assert.equal(teamEndRowSub([]), 'Ekipte kimse yok');
    // Personel sayfası kapının yerini söylüyor.
    assert.match(read('mobile/app/(manager-flow)/profil/personel.tsx'), /Ekipte yalnız\s+siz kalınca İşletme’de Tek kişiliğe dön görünür\./);
});

test('ekran: hepsi geçtiyse doğrudan Gün; söylenecek bir şey varsa önce o', () => {
    assert.match(endScreen, /const result = await authApi\.team\.end\(\);/);
    assert.match(endScreen, /const next = teamEndNotice\(result\.data\.counts\);\s*if \(!next\) \{\s*enterShell\('manager', true\);/);
    assert.match(endScreen, /if \(notice\) \{\s*enterShell\('manager', true\);\s*return;\s*\}/);
    assert.match(endScreen, /label=\{notice \? teamEnd\.enterSolo : busy \? teamEnd\.busy : teamEnd\.action\}/);

    assert.equal(teamEndNotice(null), null);
    assert.equal(teamEndNotice({ moved: 4, unassigned: 0, kept: 0 }), null);
    assert.equal(
        teamEndNotice({ moved: 3, unassigned: 1, kept: 0 }),
        'İşletmeniz tek kişiliğe döndü. 3 randevu size geçti. 1 randevu sizinkiyle çakıştığı için kimseye atanmadı; Gün’de görünüyor.',
    );
    assert.equal(
        teamEndNotice({ moved: 0, unassigned: 0, kept: 2 }),
        'İşletmeniz tek kişiliğe döndü. 2 randevu başlamış bir işleme bağlı olduğu için ayrılan çalışanda kaldı.',
    );
    assert.match(teamEndProblem('team_not_empty'), /işletmeniz ekip düzeninde kaldı\.$/);
    assert.match(teamEndProblem('offline'), /işletmeniz ekip düzeninde kaldı\./);
});
