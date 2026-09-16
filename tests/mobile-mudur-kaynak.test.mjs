import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    chooseOrg, columnsFor, countsOf, fillRange, RES_COLS, toAppt, toCrew,
} from '../mobile/src/lib/managerMap.ts';

/**
 * MÜDÜRÜN CANLI OKUMA KATMANI.
 *
 * Müdür ekranlarının tamamı `calendarSource.mockSource`tan besleniyordu. Bu
 * dosya, onun yerine geçecek Supabase katmanının kurallarını kilitliyor.
 *
 * En ağır kural org süzgeci: RLS satırı "üye olduğun org'lar" diye açıyor,
 * TEK org diye değil. Süzgeç konmazsa iki salonu olan müdürde iki salonun
 * randevuları aynı takvimde üst üste çizilir — ve bu sessizce olur.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const map = read('src/lib/managerMap.ts');
const source = strip(read('src/lib/managerSource.ts'));

// ── Karar katmanı SAF ───────────────────────────────────────────────────────

test('managerMap hiçbir çalışma zamanı bağımlılığı taşımıyor', () => {
    // Node testleri bu dosyayı DOĞRUDAN içe aktarıyor. React, react-native ya
    // da supabase girdiği an testler hiç çalışmaz hâle gelir.
    const imports = [...map.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(imports, ['./calendar.ts']);
});

// ── Hangi org ───────────────────────────────────────────────────────────────

test('seçilen salon okunabiliyorsa O seçiliyor', () => {
    assert.deepEqual(chooseOrg('a', ['a', 'b']), { ok: true, id: 'a' });
});

test('tek salonlu müdüre seçim SORULMUYOR', () => {
    // Saklı kimlik yoksa ve okunabilen tek bir salon varsa, sorulacak bir şey
    // yok demektir.
    assert.deepEqual(chooseOrg(null, ['tek']), { ok: true, id: 'tek' });
});

test('çok salonda rastgele SEÇİLMİYOR', () => {
    // Rastgele seçim, YANLIŞ salonu doğru gibi göstermek olurdu.
    assert.deepEqual(chooseOrg(null, ['a', 'b']), { ok: false, reason: 'ambiguous' });
});

test('salondan ÇIKARILMIŞ müdür boş gün görmüyor', () => {
    // Saklı kimlik artık okunamıyorsa bu bir hata değil, bir gerçek. "Boş
    // gün" diye çizmek dolu bir salonu boş göstermek olurdu.
    assert.deepEqual(chooseOrg('eski', ['yeni']), { ok: false, reason: 'no_access' });
});

test('hiç okunabilir salon yoksa erişim YOK deniyor', () => {
    assert.deepEqual(chooseOrg('a', []), { ok: false, reason: 'no_access' });
    assert.deepEqual(chooseOrg(null, []), { ok: false, reason: 'no_access' });
});

test('üç ret sebebi BİRBİRİNDEN ayrı', () => {
    // İkisi aynı olsaydı ekran "çıkarıldınız" ile "salon seçin"i aynı yazıyla
    // geçiştirirdi.
    const reasons = new Set([
        chooseOrg(null, ['a', 'b']).reason,
        chooseOrg('eski', ['yeni']).reason,
    ]);
    assert.equal(reasons.size, 2);
});

// ── Satır → randevu ─────────────────────────────────────────────────────────

const row = {
    id: 'r1', customer_id: 'c1', customer_name: 'Zeynep Kaya',
    customer_phone: '+905321110302', date: '2026-09-14',
    start_time: '11:00:00', end_time: '12:30:00', service: 'Saç boyama',
    service_color: '#FF5A1F', status: 'confirmed', staff_id: 's1',
    notes: 'Kök boyası', customer_arrived_at: null,
    arrived_at: '2026-09-14T11:00:00+03:00', service_ended_at: null,
};

test('saat SANİYESİZ geliyor', () => {
    // Veritabanı `time` alanını "11:00:00" diye veriyor; ekran hiçbir yerde
    // saniye göstermiyor.
    const appt = toAppt(row);
    assert.equal(appt.start_time, '11:00');
    assert.equal(appt.end_time, '12:30');
});

test('müdür TELEFONU ve NOTU görüyor', () => {
    // `staff-api` ikisini de personele bilerek göndermiyor: telefon, ayrılan
    // personelin cebinde götürebileceği en değerli şey. Müdür için o gerekçe
    // yok — masaüstünde ikisi de zaten açık.
    const appt = toAppt(row);
    assert.equal(appt.customer_phone, '+905321110302');
    assert.equal(appt.notes, 'Kök boyası');
    assert.match(RES_COLS, /customer_phone/);
    assert.match(RES_COLS, /\bnotes\b/);
});

test('müşteri künyesi UYDURULMUYOR', () => {
    // Risk · paket · kaçıncı geliş · bakiye ayrı tablolarda ve bu sorguda yok.
    // Boş bir künye nesnesi dönmek, "riski yok" demek olurdu.
    assert.equal(toAppt(row).info, null);
});

test('eksik alanlar null — boş metin DEĞİL', () => {
    const bare = toAppt({ id: 'r2', date: '2026-09-14', start_time: '09:00', end_time: '09:30', status: 'pending' });
    assert.equal(bare.customer_phone, null);
    assert.equal(bare.notes, null);
    assert.equal(bare.staff_id, null);
    assert.equal(bare.customer_id, null);
    // Ad ise METİN kalıyor: ekran onu doğrudan yazıyor ve `null` "null" diye
    // basılırdı.
    assert.equal(bare.customer_name, '');
});

test('okunan her alan RES_COLS içinde', () => {
    // Sorguya konmayan bir alanı çevirmek, sessizce `null` üretir: ekran
    // "telefon yok" der ve kimse sorgunun eksik olduğunu anlamaz.
    const wanted = Object.keys(row);
    const asked = RES_COLS.split(',').map((part) => part.trim());
    for (const field of wanted) assert.ok(asked.includes(field), `${field} sorguda yok`);
});

// ── Gün sayıları ────────────────────────────────────────────────────────────

test('İPTAL yoğunluk saymıyor', () => {
    // Şeritteki nokta "o gün ne kadar yoğun" diyor; iptal kimsenin vaktini
    // almıyor. Sahte kaynak hepsini sayıyor ve tamamı iptal olmuş bir günü
    // dolu gösteriyordu.
    const counts = countsOf([
        { date: '2026-09-14', status: 'confirmed' },
        { date: '2026-09-14', status: 'cancelled' },
        { date: '2026-09-15', status: 'cancelled' },
    ]);
    assert.equal(counts['2026-09-14'], 1);
    assert.equal(counts['2026-09-15'], undefined, 'tamamı iptal gün SAYI taşımamalı');
});

test('okunan boş gün SIFIR, okunmayan gün YOK', () => {
    // Şerit eksik günü "bilinmiyor", sıfırı "boş" diye çiziyor ve ikisi ayrı
    // şeyler. Okunmuş bir boş günü yazmamak, onu okunmamış gibi gösterirdi.
    const filled = fillRange({ '2026-09-14': 2 }, ['2026-09-13', '2026-09-14']);
    assert.deepEqual(filled, { '2026-09-13': 0, '2026-09-14': 2 });
    assert.equal('2026-09-15' in filled, false);
});

// ── Sorgu ───────────────────────────────────────────────────────────────────

test('HER sorgu org süzgeci taşıyor', () => {
    // RLS satırı "üye olduğun org'lar" diye açıyor, TEK org diye değil. İki
    // salonu olan müdürde süzgeçsiz sorgu iki salonu üst üste çizer.
    //
    // Kural TABLO BAŞINA denetleniyor, sayıyla değil: yeni bir okuma
    // eklendiğinde kırılması gereken şey sayı değil, süzgecin kendisi.
    const blocks = source.split('async ').slice(1).filter((b) => b.includes(".from('"));
    assert.ok(blocks.length >= 4, 'dört tablo okuması bekleniyor');
    for (const block of blocks) {
        const table = /\.from\('([^']+)'\)/.exec(block)?.[1];
        // TEK istisna: okunabilir org'ları BULAN sorgu. Süzgeci o kuruyor.
        if (table === 'organizations') continue;
        assert.match(block, /\.eq\('organization_id', organizationId\)/, `${table} süzgeçsiz`);
    }
});

test('org çözülmeden HİÇBİR sorgu kurulmuyor', () => {
    // `orgIdOrThrow` erişim yoksa atıyor; sorgu o satırdan sonra geliyor.
    for (const block of source.split('async ').slice(1)) {
        if (!block.includes(".from('reservations')")) continue;
        assert.ok(
            block.indexOf('orgIdOrThrow()') < block.indexOf(".from('reservations')"),
            'sorgu org kararından ÖNCE kurulmuş',
        );
    }
});

test('okuma hatası boş listeye ÇEVRİLMİYOR', () => {
    // Sessizce boş dizi dönmek, dolu bir günü boş gün diye çizdirirdi.
    //
    // Sayı PİNLENMİYOR: okuma eklendiğinde kuralın kendisi değil sayısı
    // kırılırdı ve doğru refleks sayıyı büyütmek olurdu. Kural şu — Supabase
    // okuması yapan HER blok hatayı atıyor.
    const blocks = source.split('async ').slice(1).filter((b) => b.includes(".from('"));
    assert.ok(blocks.length >= 4, 'dört tablo okuması bekleniyor');
    // Sayfalı okuma (`readAll`) hatayı KENDİ İÇİNDE atıyor; onu çağıran blok
    // ayrıca atmak zorunda değil. Ama o zaman `readAll`in kendisi atmalı.
    const pager = source.slice(source.indexOf('async function readAll('));
    assert.match(pager.slice(0, pager.indexOf('\n}\n')), /if \(error\) throw error;/);
    for (const block of blocks) {
        // Hatanın adı değişebilir (`error`, `customer.error`, `orgError`);
        // ATILDIĞI değişemez.
        if (/throw (\w+\.)?[Ee]rror;/.test(block)) continue;
        assert.match(block, /readAll\(\(from, to\) => supabase\.from\('/, block.slice(0, 80));
    }
    assert.doesNotMatch(source, /catch\s*\{\s*return \[\]/);
});

test('erişim reddi ağ hatasından AYRI tip', () => {
    // "Bu salondan çıkarılmışsınız" ile "okuyamadık" aynı ekranı açamaz.
    assert.match(source, /export class OrgError extends Error/);
    assert.match(source, /readonly reason: OrgRefusal;/);
    assert.match(source, /throw new OrgError\(choice\.reason\)/);
});

test('oturum kimliği CİHAZDAN okunuyor', () => {
    // `getUser()` her çağrıda sunucuya gidiyor: bir sinyal boşluğu "oturum
    // yok" diye okunur ve müdür durduk yere çıkış ekranına düşerdi.
    assert.match(source, /supabase\.auth\.getSession\(\)/);
    assert.doesNotMatch(source, /supabase\.auth\.getUser\(\)/);
});

test('org önbelleği KULLANICIYA bağlı', () => {
    // Süresiz önbellek, ortak cihazda müdür çıkıp başka müdür girdiğinde
    // öncekinin org'unu ikinciye taşırdı: RLS boş döner, ekran sebepsiz
    // boşalır ve kimse nedenini anlamaz.
    assert.match(source, /cached\?\.userId === userId/);
    assert.match(source, /cached = \{ userId, choice \};/);
    // Oturum düşerse önbellek de düşüyor.
    assert.match(source, /if \(!userId\) \{\s*\n\s*cached = null;/);
});

test('sıradaki randevu İPTALİ atlıyor', () => {
    assert.match(source, /\.neq\('status', 'cancelled'\)/);
});

// ── Sütunlar ────────────────────────────────────────────────────────────────

const person = (id, over = {}) => ({ id, name: id, color: null, active: true, ...over });

test('AYRILMIŞ personelin o günkü randevusu kaybolmuyor', () => {
    // `columnize` sütunu olmayan randevuyu SESSİZCE düşürüyor. Sütunları
    // yalnız aktif kadroyla kurmak, pasif bir satırın üstünde duran
    // randevuları takvimden tamamen silerdi — geçen hafta yaşanan şeyin tam
    // şekli buydu.
    const { columns, unassigned } = columnsFor(
        [person('a'), person('eski', { active: false })],
        [{ staff_id: 'eski' }],
    );
    assert.deepEqual(columns.map((c) => c.id), ['a', 'eski']);
    assert.equal(unassigned, 0);
});

test('AYRILMIŞ personel randevusuz gün takvimi ŞİŞİRMİYOR', () => {
    const { columns } = columnsFor([person('a'), person('eski', { active: false })], []);
    assert.deepEqual(columns.map((c) => c.id), ['a']);
});

test('aktif personel randevusuz da sütun alıyor', () => {
    // Boş sütun "bugün işi yok" demek; sütunu hiç çizmemek "böyle biri yok"
    // demek olurdu.
    const { columns } = columnsFor([person('a'), person('b')], [{ staff_id: 'a' }]);
    assert.deepEqual(columns.map((c) => c.id), ['a', 'b']);
});

test('ATANMAMIŞ randevu sayılıyor — sessizce yutulmuyor', () => {
    // `staff_id` null olabiliyor (personel silinince `ON DELETE SET NULL`).
    // Sütunu olmayan randevu ekranda görünmüyor; en azından KAÇ tane olduğu
    // biliniyor.
    const { unassigned } = columnsFor([person('a')], [
        { staff_id: null }, { staff_id: undefined }, { staff_id: 'a' }, { staff_id: 'yok' },
    ]);
    assert.equal(unassigned, 3, 'kadroda olmayan kimlik de atanmamış sayılır');
});

test('kadro satırı aktifliği KORUYOR', () => {
    assert.equal(toCrew({ id: 's1', name: 'Merve', is_active: false }).active, false);
    // Alan hiç gelmezse aktif sayılıyor: pasif saymak, dolu bir kadroyu boş
    // gösterirdi.
    assert.equal(toCrew({ id: 's1', name: 'Merve' }).active, true);
    assert.equal(toCrew({ id: 's1', name: 'Merve', color: '#fff' }).color, '#fff');
});

test('kadro sorgusu org süzgeçli ve ADA göre sıralı', () => {
    assert.match(source, /\.from\('staff'\)/);
    assert.match(source, /\.eq\('organization_id', organizationId\)[\s\S]{0,200}\.order\('name'\)/);
});
