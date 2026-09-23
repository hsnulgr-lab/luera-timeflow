import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * ZİL BÜTÜN SALONDA (101) — 2026-09-23.
 *
 * 100'de zil yalnız `reservations` ve `payments` üzerindeydi; geri kalan her
 * şeyi telefon 25 saniyelik yoklamayla öğreniyordu. Masaüstünde bir müşteriye
 * hamilelik bayrağı eklenince telefondaki AÇIK kart bunu hemen göstermiyordu.
 *
 * Zil on bir tabloya yayılınca yeni bir sorun doğdu: süzgeçsiz bir ekran,
 * ilgisiz bir değişiklikte de kendini yeniliyordu — bir paket satışı Akış'ı,
 * bir ürün fiyatı Kasa'yı tazeliyordu. Bu yüzden her ekran artık hangi
 * tablolarla ilgilendiğini söylüyor.
 *
 * Bu dosyanın asıl işi ÇAPRAZ DOĞRULAMA: bir ekranın süzgecinde yazan tablonun
 * gerçekten zili olmalı. Olmayan bir tablo adı yazmak, o ekranı sessizce
 * canlılıktan düşürür ve hiçbir şey şikâyet etmez.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mobile = (path) => read(`mobile/${path}`);
/** Yorumlar sıyrılıyor: bir yorumda geçen tablo adı testi yanlışlıkla geçirmesin. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sql100 = read('supabase/100_live_doorbell.sql');
const sql101 = read('supabase/101_live_doorbell_wide.sql');
const signal = mobile('src/lib/liveSignal.ts');

/** Zili olan tablolar: 100'ün ikisi + 101'in dizisi. */
const RUNG = new Set([
    ...[...sql100.matchAll(/create trigger ring_on_(\w+)/g)].map((m) => m[1]),
    ...[...sql101.matchAll(/^\s*'(\w+)',?\s*(?:--.*)?$/gm)].map((m) => m[1]),
]);

test('101 zili dokuz tabloya daha takıyor', () => {
    for (const table of [
        'customers', 'services', 'staff', 'staff_time_off', 'settings',
        'treatment_plans', 'package_templates', 'customer_packages', 'products',
    ]) {
        assert.ok(RUNG.has(table), `${table} zilsiz kaldı`);
    }
    assert.ok(RUNG.has('reservations') && RUNG.has('payments'), '100\'ün ikisi duruyor');
    assert.equal(RUNG.size, 11);
});

test('101 `ring_org`u YENİDEN TANIMLAMIYOR — yalnız tetikleyici ekliyor', () => {
    /*
     * Fonksiyonu burada da yazmak, 100 ile 101 arasında sessiz bir ayrışma
     * üretirdi: biri düzeltilir, öteki unutulurdu. Zil hatasının yutulması ve
     * gövdenin yalnız tablo adı taşıması 100'ün kararı ve orada kalıyor.
     */
    assert.doesNotMatch(sql101, /create or replace function/i);
    assert.match(sql101, /execute function public\.ring_org\(\)/);
    assert.match(sql100, /jsonb_build_object\('t', tg_table_name\)/, 'gövde: yalnız tablo adı');
});

test('org kolonu olmayan tablo ATLANIYOR — dosya iki kez çalıştırılabilir', () => {
    // Eksik modüllü bir kurulumda patlamamalı; ve `drop trigger if exists`
    // sayesinde ikinci çalıştırma zararsız.
    assert.match(sql101, /column_name = 'organization_id'/);
    assert.match(sql101, /raise notice 'atlandı/);
    assert.match(sql101, /drop trigger if exists ring_on_/);
});

test('SÜZGEÇTE YAZAN HER TABLONUN ZİLİ VAR', () => {
    /*
     * Bu testin sebebi: `useLiveSignal(fn, true, ['musteriler'])` gibi bir
     * yazım hatası derlenir, çalışır ve o ekranı sessizce canlılıktan düşürür.
     * Yoklama devrede olduğu için kimse fark etmez.
     */
    const sources = [
        'src/lib/liveSignal.ts', 'src/lib/agendaSource.ts', 'src/lib/visitSource.ts',
        'src/lib/salonDay.ts', 'src/lib/fileSource.ts', 'src/lib/catalogSource.ts',
        'app/mudur/profile.tsx', 'app/(manager-flow)/musteriler.tsx',
        'app/(manager-flow)/musteri-gecmis.tsx', 'app/(manager-flow)/paket-sat.tsx',
        'app/(manager-flow)/profil/hizmetler.tsx', 'app/(manager-flow)/profil/saatler.tsx',
        'app/(manager-flow)/profil/personel.tsx', 'app/(staff-flow)/customer.tsx',
    ];
    let seen = 0;
    for (const path of sources) {
        const src = code(mobile(path));
        const lists = [
            ...[...src.matchAll(/(?:LIVE_TABLES|BOOKING_TABLES) = \[([\s\S]*?)\]/g)].map((m) => m[1]),
            ...[...src.matchAll(/tables: \[([^\]]*)\]/g)].map((m) => m[1]),
        ];
        for (const list of lists) {
            for (const [, table] of list.matchAll(/'(\w+)'/g)) {
                assert.ok(RUNG.has(table), `${path}: '${table}' diye zili olan bir tablo yok`);
                seen += 1;
            }
        }
    }
    assert.ok(seen >= 30, `süzgeç bulunamadı (${seen}) — test yanlış yeri okuyor olabilir`);
});

test('süzgeçsiz dinleyici HER zilde uyanır — varsayılan fazla tazele', () => {
    /*
     * Ters kurgu ("süzgeç yoksa hiç uyanma") daha tutumlu görünür ama
     * kaçırılan bir değişiklik, gereksiz bir okumadan pahalı: ekran sessizce
     * bayatlar ve bunu kimse fark etmez.
     */
    assert.match(signal, /if \(!listener\.tables \|\| listener\.tables\.length === 0\) return true;/);
    // Eski sunucu tablo adı göndermiyorsa da herkes uyanır.
    assert.match(signal, /if \(rung\.size === 0\) return true;/);
    assert.match(signal, /return listener\.tables\.some\(\(table\) => rung\.has\(table\)\);/);
});

test('tablo adı 300 ms\'lik pencerede BİRİKİYOR', () => {
    // Bir taşıma iki tabloya birden dokunabiliyor; pencere kapanırken ikisi de
    // sayılmalı, yoksa ikinci tabloyu dinleyen ekran uyanmazdı.
    assert.match(signal, /if \(table\) rung\.add\(table\);/);
    assert.match(signal, /const turn = rung;\s*\n\s*rung = new Set<LiveTable>\(\);/);
});

test('üç yeni kaynak zile bağlandı — yoklama KALKMADI', () => {
    const salon = code(mobile('src/lib/salonDay.ts'));
    assert.match(salon, /useLiveSignal\([\s\S]{0,80}LIVE_TABLES\);/);
    assert.match(salon, /\}, POLL_MS\);/, 'salon takviminin yoklaması emniyet ağı olarak duruyor');

    // Bu ikisinde zaten yoklama yoktu (odağa dönüş taşıyordu); zil onun YANINA.
    for (const path of ['src/lib/fileSource.ts', 'src/lib/catalogSource.ts']) {
        const src = code(mobile(path));
        assert.match(src, /useLiveSignal\([\s\S]{0,120}LIVE_TABLES\);/, path);
        assert.match(src, /useFocusEffect\(useCallback\(\(\) => \{ void read\(false\); \}, \[read\]\)\);/, path);
    }
});

test('müşteri dosyası müşteri seçilmemişken zile abone OLMUYOR', () => {
    // Kumandadan müşterisiz açılan dosyada her zil boş bir okuma açardı.
    assert.match(code(mobile('src/lib/fileSource.ts')), /Boolean\(customerId\), LIVE_TABLES\)/);
});

test('katalog randevu zilini BİLEREK dinlemiyor', () => {
    /*
     * `catalog` ucu `reservations`'ı da okuyor ama yalnız "son günlerde ne
     * kullanıldı" sıralaması için. Her randevu hareketinde kataloğu yeniden
     * çekmek, yavaş değişen bir sıralama için gürültü olurdu.
     */
    const src = code(mobile('src/lib/catalogSource.ts'));
    const [, list] = src.match(/LIVE_TABLES = \[([\s\S]*?)\]/) ?? [];
    assert.ok(list, 'süzgeç bulunamadı');
    assert.doesNotMatch(list, /reservations/);
    assert.match(list, /'services'/);
    assert.match(list, /'products'/);
});

test('randevu sözlüğü paket ve ürün tablolarını DIŞARIDA bırakıyor', () => {
    // Müdürün beş ana ekranı bu dördünü hiç göstermiyor; bir paket satışının
    // Akış'ı tazelemesi boşuna istekti.
    const [, list] = signal.match(/BOOKING_TABLES = \[([\s\S]*?)\] as const;/) ?? [];
    assert.ok(list, 'BOOKING_TABLES bulunamadı');
    for (const table of ['treatment_plans', 'package_templates', 'customer_packages', 'products']) {
        assert.doesNotMatch(list, new RegExp(`'${table}'`), `${table} listede olmamalı`);
    }
    for (const table of ['reservations', 'payments', 'staff', 'customers']) {
        assert.match(list, new RegExp(`'${table}'`), `${table} listede olmalı`);
    }
});

test('ortak müdür kancası süzgeci ÇAĞIRANDAN alıyor', () => {
    /*
     * `useManagerRead` yedi ekranın ortak yolu ve neyin okunduğunu bilmiyor.
     * Süzgeci burada sabitlemek, bir ekranın ihtiyacını ötekine dayatırdı.
     */
    const hook = code(mobile('src/lib/managerRead.ts'));
    assert.match(hook, /tables\?: readonly LiveTable\[\];/);
    assert.match(hook, /useLiveSignal\([\s\S]{0,90}true, options\.tables\);/);
});
