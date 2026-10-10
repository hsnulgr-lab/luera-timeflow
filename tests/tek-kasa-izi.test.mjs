import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * KASA'DA DÜZELTME ve GERİ ALMA İZİ (111 · v4 C2/C3).
 *
 * Para kaydı silinmiyor, damgalanıyor. Damgalı satır tabloda kaldığı için
 * buradaki testlerin çoğu tek bir soruyu soruyor: damgalı satırı okuyan HER
 * yer onun artık para olmadığını biliyor mu? Bilmeyen tek bir okuyucu,
 * düzeltilen tahsilatı iki kez saymak demek.
 *
 * Davranışın kendisi veritabanında sınanıyor:
 * `supabase/tests/kasa_duzeltme_regression.sql` (işlem içinde, geri sarılır).
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const migration = read('supabase/111_kasa_duzeltme_izi.sql');
const m061 = read('supabase/061_treatment_finance_integrity.sql');
const regression = read('supabase/tests/kasa_duzeltme_regression.sql');
const staffApi = read('supabase/functions/staff-api/index.ts');

/** Yorumlar atılmış gövde — yorumdaki örnek komutlar sayılmasın. */
const code = migration.replace(/--[^\n]*/g, '');

/** `CREATE OR REPLACE FUNCTION public.<ad>(` ile başlayıp `$function$;` ile biten blok. */
function functionBlock(source, name) {
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const end = source.indexOf('$function$;', start);
    assert.ok(end > start, `${name} kapanmıyor`);
    return source.slice(start, end + '$function$;'.length);
}

/**
 * 111'in eklediği satırları söküp 061'i geri kurar.
 *
 * Süzgeç satırı bir önceki satırın sonundaki `;`ı devralıyor; sökülünce `;`
 * yerine dönüyor. Geri kalan `-- 111` işaretli satırlar (erken dönüş ve
 * yorumu) tümden gidiyor.
 */
function unmark(text) {
    return text
        .replace(/\n[ \t]*AND payment\.voided_at IS NULL(;?)[ \t]*-- 111[^\n]*/g, '$1')
        .split('\n')
        .filter((line) => !line.includes('-- 111'))
        .join('\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n');
}
const tidy = (text) => text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');

const FINANCE_FUNCTIONS = [
    'enforce_treatment_plan_integrity',
    'enforce_treatment_installment_integrity',
    'enforce_treatment_payment_integrity',
];

// ── Satır silinmiyor ────────────────────────────────────────────────────────

test('para kaydı SİLİNMİYOR ve negatif tutar yazılmıyor', () => {
    // Silinen kaydın farkı bir daha açıklanamaz; negatif tutar ise
    // `amount >= 0` kısıtını ve onu varsayan masaüstü raporlarını bozardı.
    assert.doesNotMatch(code, /DELETE\s+FROM\s+(public\.)?payments/i);
    assert.doesNotMatch(code, /amount\s*>=\s*0[^)]*\)\s*NOT VALID|DROP CONSTRAINT[^;]*amount/i);
    assert.match(code, /ADD COLUMN IF NOT EXISTS voided_at\s+TIMESTAMPTZ/);
    assert.match(code, /ADD COLUMN IF NOT EXISTS corrected_from UUID REFERENCES public\.payments\(id\) ON DELETE SET NULL/);
    // Damga ve sebep birlikte var olur; sebepsiz iptal açıklanamaz bir eksik.
    assert.match(code, /CHECK \(\(voided_at IS NULL\) = \(void_reason IS NULL\)\)/);
    assert.match(code, /void_reason IN \('correction', 'revert'\)/);
});

// ── Damgalı satır uygulamaya görünmüyor ─────────────────────────────────────

test('dört KISITLAYICI politika damgalı satırı istemciden saklıyor', () => {
    // İzin veren politika (`payments_org_access`) olduğu gibi duruyor; bunlar
    // onunla VE'leniyor. Silinip yeniden yazılsaydı bir hata anında tablo bir
    // an politikasız kalabilirdi.
    assert.doesNotMatch(code, /(DROP|ALTER) POLICY[^;]*payments_org_access/i);
    for (const [name, command] of [
        ['payments_live_select', 'SELECT'],
        ['payments_live_insert', 'INSERT'],
        ['payments_live_update', 'UPDATE'],
        ['payments_live_delete', 'DELETE'],
    ]) {
        assert.match(
            code,
            new RegExp(`CREATE POLICY ${name} ON public\\.payments\\s+AS RESTRICTIVE FOR ${command} TO authenticated`),
            name,
        );
    }
    assert.match(code, /FOR SELECT TO authenticated\s+USING \(voided_at IS NULL\)/);
    assert.match(code, /FOR DELETE TO authenticated\s+USING \(voided_at IS NULL\)/);
    // İstemci damga basamaz ve sahte bir düzeltme satırı ekleyemez.
    assert.match(code, /FOR INSERT TO authenticated\s+WITH CHECK \([\s\S]*?corrected_from IS NULL\s*\)/);
    assert.match(code, /FOR UPDATE TO authenticated\s+USING \(voided_at IS NULL\)\s+WITH CHECK \(voided_at IS NULL/);
});

// ── 061'in tavanları ────────────────────────────────────────────────────────

test('061 kopyası BİREBİR — yalnız `-- 111` işaretli satırlar ekli', () => {
    // Gövdeler elle kopyalandı. Kopya 061'den sessizce ayrışırsa, tedavi
    // finansının bütün kuralları iki dosyada iki farklı şey söylerdi.
    for (const name of FINANCE_FUNCTIONS) {
        assert.equal(unmark(functionBlock(migration, name)), tidy(functionBlock(m061, name)), name);
    }
});

test('her para toplamı damgalı satırı dışarıda bırakıyor', () => {
    for (const name of FINANCE_FUNCTIONS) {
        const body = functionBlock(migration, name);
        for (const match of body.matchAll(/SUM\(payment\.amount\)/g)) {
            const statement = body.slice(match.index, body.indexOf(';', match.index));
            assert.match(statement, /AND payment\.voided_at IS NULL/, `${name}: ${statement.slice(0, 80)}`);
        }
    }
    // 7 süzgeç: plan ×2, vade ×3 (silme kilidi dahil), ödeme ×2. Kapsam
    // denetimleri (org / müşteri / plan bağı) BİLEREK süzülmüyor: damgalı
    // satır da o plana bağlı.
    assert.equal((migration.match(/AND payment\.voided_at IS NULL[ \t;]*-- 111/g) ?? []).length, 7);
});

test('damgalı satır plan ve vade tavanlarına HİÇ girmiyor', () => {
    // FK zinciri (silinen personel → SET NULL) damgalı satırı güncelleyince
    // tavana sokulsaydı o silme "plan bakiyesi aşıldı" diye düşerdi.
    const body = functionBlock(migration, 'enforce_treatment_payment_integrity');
    const early = body.indexOf('IF NEW.voided_at IS NOT NULL THEN');
    assert.ok(early > 0);
    assert.ok(early < body.indexOf("RAISE EXCEPTION 'installment_payment_scope_mismatch'"));
    assert.ok(early > body.indexOf("'relation', 'product'"), 'kapsam denetimleri erken dönüşten ÖNCE kalmalı');
});

// ── Düzelt ──────────────────────────────────────────────────────────────────

test('düzeltme: önce damga, sonra eskisinin TAM KOPYASI', () => {
    const body = functionBlock(migration, 'correct_payment');
    assert.match(body, /SECURITY DEFINER\s+SET search_path = pg_catalog, public, pg_temp/);
    // Başka org'un kaydı "bulunamadı": varlığı bile sızmıyor.
    assert.match(body, /WHERE payment\.id = p_payment\s+AND payment\.organization_id IN \(SELECT public\.auth_user_org_ids\(\)\)\s+FOR UPDATE/);
    // DEFINER, RLS'teki abonelik kapısını da atlıyor; elle soruluyor.
    assert.match(body, /public\.has_timeflow_access\(v_old\.organization_id\) IS NOT TRUE/);
    assert.ok(body.indexOf("void_reason = 'correction'") < body.indexOf('INSERT INTO public.payments'),
        'damga yeni satırdan ÖNCE: 061 tavanı eskisini saymamalı');

    // Elle yazılmış sütun listesi `installment_id`yi unutmuştu. Kopya
    // satırın kendisinden alınıyor; üzerine yazılan alanlar SABİT bir küme.
    assert.match(body, /jsonb_populate_record\(\s*NULL::public\.payments,\s*to_jsonb\(v_old\) \|\|/);
    const overrides = body.slice(body.indexOf('jsonb_build_object('), body.indexOf(') AS copy'));
    const keys = [...overrides.matchAll(/'([a-z_]+)',/g)].map((m) => m[1]).sort();
    assert.deepEqual(keys, [
        'amount', 'corrected_from', 'created_at', 'created_by', 'id', 'method',
        'void_reason', 'voided_at', 'voided_by',
    ]);
    // Saat yerinde kalır: düzeltme geçmiş günün parasını bugüne taşımaz.
    assert.doesNotMatch(overrides, /'paid_at'/);
});

test('düzeltme kendi reddini sebebiyle söylüyor', () => {
    const body = functionBlock(migration, 'correct_payment');
    for (const reason of ['payment_not_found', 'already_voided', 'zero_amount', 'bad_method', 'no_change']) {
        assert.match(body, new RegExp(`RAISE EXCEPTION '${reason}'`), reason);
    }
    // Kuruş sütunun ölçeğinde: 1200.004 "değişti" sayılıp 1200.00 yazılmasın.
    assert.match(body, /v_amount := round\(p_amount, 2\)/);
    // Masaüstünün `other`ı kalabilir ama ona geçilemez.
    assert.match(body, /p_method NOT IN \('cash', 'card', 'transfer'\) AND p_method IS DISTINCT FROM v_old\.method/);
});

// ── Geri al ─────────────────────────────────────────────────────────────────

test('geri alma adisyonu açıyor — bölünmüş adisyonda son parçaya kadar AÇMIYOR', () => {
    const body = functionBlock(migration, 'revert_payment');
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /AND payment\.organization_id IN \(SELECT public\.auth_user_org_ids\(\)\)\s+FOR UPDATE/);
    // Randevu kilidi: iki parça aynı anda geri alınırsa ikincisi birincinin
    // damgasını görerek karar versin.
    assert.match(body, /FROM public\.reservations AS reservation\s+WHERE reservation\.id = v_old\.reservation_id\s+FOR UPDATE/);
    assert.match(body, /NOT EXISTS \(\s*SELECT 1\s+FROM public\.payments AS payment\s+WHERE payment\.reservation_id = v_old\.reservation_id\s+AND payment\.voided_at IS NULL\s*\)/);
    assert.match(body, /SET is_paid = false/);
    assert.doesNotMatch(body, /SET is_paid = true/);
});

// ── İzi okumak ──────────────────────────────────────────────────────────────

test("iz yalnız kendi org'unda ve tahsilatın gününde okunuyor", () => {
    const body = functionBlock(migration, 'voided_payments');
    assert.match(body, /STABLE\s+SECURITY DEFINER/);
    assert.match(body, /p_org IN \(SELECT public\.auth_user_org_ids\(\)\)/);
    assert.match(body, /payment\.voided_at IS NOT NULL/);
    // Kasa'nın kendi penceresi: `paid_at`, iki uç dahil.
    assert.match(body, /payment\.paid_at >= p_from\s+AND payment\.paid_at <= p_to/);
});

// ── Yetki ───────────────────────────────────────────────────────────────────

test("yeni fonksiyonlar anon'a KAPALI (094'ün dersi)", () => {
    // `from public` tek başına yetmiyor: Supabase yeni fonksiyona anon için
    // AÇIK izin veriyor.
    for (const signature of [
        'correct_payment\\(UUID, NUMERIC, TEXT\\)',
        'revert_payment\\(UUID\\)',
        'voided_payments\\(UUID, TIMESTAMPTZ, TIMESTAMPTZ\\)',
    ]) {
        assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated, service_role;`), signature);
        assert.match(code, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature} TO authenticated;`), signature);
    }
    assert.doesNotMatch(code, /GRANT[^;]*TO[^;]*\banon\b/);
});

// ── RLS'i atlayan okuyucular ────────────────────────────────────────────────

test('service_role ile payments OKUYAN her edge function damgalı satırı süzüyor', () => {
    // service_role RLS'ten geçmiyor; kısıtlayıcı politika onu korumuyor.
    // Yeni bir okuma eklenip süzgeç unutulursa burada düşer.
    const dir = new URL('../supabase/functions/', import.meta.url);
    let reads = 0;
    for (const name of readdirSync(dir).filter((entry) => !entry.startsWith('_'))) {
        let source;
        try { source = readFileSync(new URL(`${name}/index.ts`, dir), 'utf8'); } catch { continue; }
        for (const match of source.matchAll(/\.from\('payments'\)/g)) {
            // Zincir: aynı satırın kalanı + `.` ya da `//` ile başlayan devam satırları.
            const rest = source.slice(match.index).split('\n');
            const chain = [rest[0]];
            for (const line of rest.slice(1)) {
                if (!/^\s*(\.|\/\/)/.test(line)) break;
                chain.push(line);
            }
            const text = chain.join('\n');
            if (/\.(insert|update|delete|upsert)\(/.test(text)) continue;
            reads += 1;
            assert.match(text, /\.is\('voided_at', null\)/, `${name}: ${chain[0].trim()}`);
        }
    }
    assert.ok(reads >= 2, 'staff-api ve whatsapp-booking okumaları bulunamadı');
});

test('visit.collect GERİ ALINMIŞ tahsilatı "zaten alındı" saymıyor', () => {
    // Süzgeçsiz: adisyon yeniden açılır, "Tahsil et"e basılır, sunucu damgalı
    // kaydı bulup `alreadyCollected` der ve kasaya hiçbir şey yazmaz.
    const start = staffApi.indexOf("if (action === 'visit.collect')");
    const lookup = staffApi.slice(start, staffApi.indexOf('if (existing)', start));
    assert.match(lookup, /\.eq\('reservation_id', res!\.id\)[\s\S]*?\.is\('voided_at', null\)[\s\S]*?\.maybeSingle\(\)/);
});

// ── Veritabanı testi ────────────────────────────────────────────────────────

test('veritabanı testi her sözü sınıyor ve her şeyi geri sarıyor', () => {
    assert.match(regression, /^BEGIN;$/m);
    assert.match(regression, /^ROLLBACK;\s*$/m);
    assert.doesNotMatch(regression, /^COMMIT;/m);
    for (const contract of [
        // taksit bağı + 061 tavanları
        "'11100000-0000-4000-8000-000000000501'",
        'installment_payment_exceeds_balance',
        'UPDATE public.treatment_plans',
        'DELETE FROM public.treatment_installments',
        // erken dönüş: damgalı satıra FK yolu
        "SET staff_id = '11100000-0000-4000-8000-000000000201'",
        // bölünmüş adisyon
        'bölünmüş adisyonun yarısı',
        // istemci sınırları
        'WHEN insufficient_privilege',
        'istemci sahte düzeltme satırı ekledi',
        'istemci damgalı satırı sildi',
        'canlı tahsilatın eklenip silinmesi bozuldu',
        // org ve anon
        'başka org',
        'SET LOCAL ROLE anon',
    ]) {
        assert.ok(regression.includes(contract), contract);
    }
    // Kuru koşu tarifi göçün BEGIN/COMMIT satırlarına dayanıyor.
    assert.match(migration, /^BEGIN;$/m);
    assert.match(migration, /^COMMIT;$/m);
    assert.equal((migration.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((migration.match(/^COMMIT;$/gm) ?? []).length, 1);
});
