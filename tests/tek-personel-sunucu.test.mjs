/**
 * Tek Kişilik v4 · karar 3 — RANDEVUNUN PERSONELİNİ SUNUCU YAZAR (114).
 *
 * "Sahip için bir personel satırı var; sunucu her randevuya o staff_id'yi
 * kendisi yazar, istemci göndermez." Davranış gerçek Postgres'te sınandı
 * (PGlite: 7 senaryo, 13 sökme kontrolü — devir §21) ve üretimde kuru
 * koşuyla sınanacak (`supabase/tests/tek_personel_regression.sql`). Bu dosya
 * göçün KRİTİK satırlarını kilitliyor: biri "sadeleştirirken" sırayı, kuralı
 * ya da doldurmanın sessizliğini bozmasın.
 *
 * Aynı turun ikinci işi de burada: kayda bağlı olmayan randevunun müşteri
 * dosyası "silinmiş olabilir" demiyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { UNLINKED_TITLE, unlinkedHint } from '../mobile/src/lib/customerCard.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const sql = (p) => read(p).replace(/--[^\n]*/g, '');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const migration = sql('supabase/114_tek_personel_sunucu.sql');
const regression = read('supabase/tests/tek_personel_regression.sql');
const conflictGuard = read('supabase/060_reservation_conflict_guard.sql');

// ── 1 · Tetikleyici ─────────────────────────────────────────────────────────

test('yalnız YENİ randevuda ve yalnız personel boşken', () => {
    assert.match(migration, /CREATE TRIGGER trg_reservations_assign_solo_staff\s+BEFORE INSERT ON public\.reservations\s+FOR EACH ROW\s+WHEN \(NEW\.staff_id IS NULL\)\s+EXECUTE FUNCTION public\.assign_solo_staff\(\);/);
    // UPDATE'te çalışsaydı eski personelsiz randevuyu "tamamlandı" yapmak,
    // doldurulan personel yüzünden 060'ın çakışma hatasına düşerdi.
    assert.doesNotMatch(migration, /BEFORE INSERT OR UPDATE ON public\.reservations/);
});

test('çakışma kontrolünden ÖNCE çalışıyor — Postgres BEFORE tetikleyicilerini ada göre sıralar', () => {
    const ours = 'trg_reservations_assign_solo_staff';
    assert.match(conflictGuard, /CREATE TRIGGER trg_reservations_conflict_guard\s+BEFORE INSERT/);
    assert.ok(ours < 'trg_reservations_conflict_guard', 'ad çakışma kontrolünden sonra sıralanıyor');
    // Sıranın DAVRANIŞI regresyonda: sahibin üstüne binen personelsiz randevu reddediliyor.
    assert.match(regression, /'reservation_staff_conflict',[\s\S]*?'23P01'/);
});

test('kural staff-api solo.session ile aynı: tek kişilik + TEK aktif personel, yoksa tahmin yok', () => {
    assert.match(migration, /WHERE id = NEW\.organization_id\s+AND solo/);
    assert.match(migration, /WHERE organization_id = NEW\.organization_id\s+AND is_active\s+ORDER BY created_at, id\s+LIMIT 2/);
    assert.match(migration, /IF cardinality\(v_crew\) = 1 THEN\s+NEW\.staff_id := v_crew\[1\];/);
    const api = read('supabase/functions/staff-api/index.ts');
    assert.match(api, /if \(crew\.length > 1\) return json\(\{ error: 'not_solo' \}, 409\);/);
});

test('yetki: kimin yazdığından bağımsız çalışıyor, kimse doğrudan çağıramıyor', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.assign_solo_staff\(\)\s+RETURNS TRIGGER\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.assign_solo_staff\(\) FROM PUBLIC, anon, authenticated, service_role;/);
});

// ── 2 · Tek seferlik doldurma ───────────────────────────────────────────────

test('doldurma aynı kuralla ve çakışanı ya da kilitliyi ATLAYARAK', () => {
    assert.match(migration, /JOIN public\.organizations AS o\s+ON o\.id = s\.organization_id\s+AND o\.solo\s+WHERE s\.is_active\s+GROUP BY s\.organization_id\s+HAVING count\(\*\) = 1/);
    assert.match(migration, /WHERE r\.staff_id IS NULL/);
    // 060 (23P01) ve 062 (23514) satırı olduğu gibi bırakıyor; başka hata göçü düşürür.
    assert.match(migration, /WHEN exclusion_violation OR check_violation THEN\s+v_skipped := v_skipped \+ 1;/);
    assert.doesNotMatch(migration, /WHEN OTHERS/);
});

test('doldurma bildirim yağdırmıyor — tetikleyici kapatılıp BULUNDUĞU hâle geri açılıyor', () => {
    // Personel boştan doluya geçince "Yeni randevun var" gidiyor (107).
    const push = read('supabase/107_mudur_yeni_randevu.sql');
    assert.match(push, /IF NEW\.staff_id IS NOT NULL\s+AND \(TG_OP = 'INSERT' OR OLD\.staff_id IS DISTINCT FROM NEW\.staff_id\) THEN/);
    const off = migration.indexOf("EXECUTE 'ALTER TABLE public.reservations DISABLE TRIGGER trg_push_on_reservation'");
    const loop = migration.indexOf('FOR v_row IN');
    const on = migration.indexOf("EXECUTE 'ALTER TABLE public.reservations ENABLE TRIGGER trg_push_on_reservation'");
    assert.ok(off > 0 && off < loop && loop < on, 'kapat → doldur → aç sırası bozuk');
    assert.match(migration, /IF v_push_state IN \('O', 'A'\) THEN/);
    assert.match(migration, /ELSIF v_push_state = 'A' THEN\s+EXECUTE 'ALTER TABLE public\.reservations ENABLE ALWAYS TRIGGER trg_push_on_reservation';/);
});

test('regresyon altı sözü sınıyor ve her şeyi geri sarıyor', () => {
    for (const promise of ['── 2)', '── 3)', '── 4)', '── 5)', '── 6)']) {
        assert.ok(regression.includes(promise), `${promise} bölümü yok`);
    }
    assert.match(regression, /SET LOCAL ROLE authenticated;/);
    assert.match(regression, /'tek personel \(114\) regression: ok'/);
    assert.match(regression.trimEnd(), /ROLLBACK;$/);
    // Kuru koşunun tarifi dosyanın başında.
    assert.match(regression, /sed -e '\/\^BEGIN;\$\/d' -e '\/\^COMMIT;\$\/d' supabase\/114_tek_personel_sunucu\.sql;/);
});

// ── 3 · Kayda bağlı olmayan randevunun müşteri dosyası ──────────────────────

test('kayıt hiç olmadıysa "silinmiş olabilir" denmiyor', () => {
    const file = code('mobile/app/(staff-flow)/musteri.tsx');
    // Kumandanın "Müşteri kartı" düğmesi her randevuda duruyor.
    assert.match(code('mobile/app/(staff-flow)/kumanda.tsx'), /<Tool label="Müşteri kartı" glyph="user" onPress=\{onCard\} \/>/);
    assert.match(file, /\{params\.customerId \? \(\s*<Empty\s+title="Müşteri bulunamadı"\s+hint="Kayıt silinmiş ya da başka bir deftere taşınmış olabilir\."\s*\/>\s*\) : \(\s*<Empty title=\{params\.name\?\.trim\(\) \|\| UNLINKED_TITLE\} hint=\{unlinkedHint\(solo\)\} \/>/);
});

test('tek kişilikte masaüstüne yollamıyor; ekipte cümle aynı', () => {
    assert.equal(UNLINKED_TITLE, 'Müşteri kaydı yok');
    assert.doesNotMatch(unlinkedHint(true), /masaüst|bilgisayar/);
    assert.match(unlinkedHint(true), /numarasıyla kurduğunuzda açılır\.$/);
    assert.equal(
        unlinkedHint(false),
        'Bu randevu bir müşteri kaydına bağlı değil. Kart, müşteri masaüstünde kayda bağlanınca açılır.',
    );
    // Müdür kartı da aynı kaynaktan.
    assert.match(code('mobile/app/(staff-flow)/customer.tsx'), /title=\{customerName \?\? UNLINKED_TITLE\}\s+hint=\{unlinkedHint\(solo\)\}/);
});

test('telefonda kayıt numarayla açılıyor — cümlenin dayanağı', () => {
    const write = code('mobile/src/lib/managerWrite.ts');
    assert.match(write, /const customerId = input\.customerId\s+\?\? \(digits\.length >= 10\s+\? await resolveCustomer\(/);
});
