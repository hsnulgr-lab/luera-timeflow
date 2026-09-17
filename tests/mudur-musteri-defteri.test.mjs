import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    bookLine, bookMatches, bookSummary, managerBookRows, sortManagerBook,
} from '../mobile/src/lib/managerBook.ts';

/**
 * MÜDÜRÜN MÜŞTERİ DEFTERİ — 2026-09-18.
 *
 * Müdürün müşteriye giden iki yolu vardı ve ikisi de dardı: akıştaki balon
 * (yalnız bugün görünenler) ve randevu kurarken arama (yalnız adını bildiğin
 * kişi). Salonun defterini bütün olarak görecek bir yer yoktu.
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const TODAY = '2026-09-18';
const people = [
    { id: 'c1', name: 'Elif Demir', phone: '0532 111 0402' },
    { id: 'c2', name: 'Ayşe Yıldız', phone: '0533 222 8891' },
    { id: 'c3', name: 'İnci Kaya', phone: '' },
];
const staff = new Map([['s1', 'Elif'], ['s2', 'Murat Can']]);
const visit = (over) => ({
    customer_id: 'c1', date: '2026-09-10', start_time: '14:30:00',
    service: 'Saç kesimi', status: 'completed', staff_id: 's1', no_show_at: null, ...over,
});

test('satır son ziyareti, hizmeti ve KİMDE olduğunu taşıyor', () => {
    const [elif] = managerBookRows([people[0]], [
        visit({ date: '2026-08-01', service: 'Boya', staff_id: 's2' }),
        visit({ date: '2026-09-10', service: 'Saç kesimi', staff_id: 's1' }),
    ], staff, TODAY);
    assert.equal(elif.lastVisitDate, '2026-09-10');
    assert.equal(elif.lastService, 'Saç kesimi');
    // Müdür ekibini ADIYLA tanıyor: satırda "E" değil "Elif".
    assert.equal(elif.lastStaffName, 'Elif');
    assert.equal(elif.phoneTail, '0402');
});

test('BUGÜNKÜ randevu ziyaret sayılmıyor', () => {
    /*
     * Bugünkü randevu bir ziyaret DEĞİL: kişi henüz gelmemiş olabilir.
     * İkisini karıştırmak, gelmemiş birini "bugün geldi" diye göstermekti.
     */
    const [row] = managerBookRows([people[0]], [
        visit({ date: TODAY, start_time: '16:00:00' }),
        visit({ date: '2026-09-10' }),
    ], staff, TODAY);
    assert.equal(row.upcomingTime, '16:00');
    assert.equal(row.lastVisitDate, '2026-09-10');
    assert.equal(bookLine(row), 'Bugün 16:00');
});

test('gelmedi damgası sayılıyor ve son ziyaret yerine geçmiyor', () => {
    const [row] = managerBookRows([people[0]], [
        visit({ date: '2026-09-15', no_show_at: '2026-09-15T12:00:00Z' }),
        visit({ date: '2026-09-12', no_show_at: '2026-09-12T12:00:00Z' }),
        visit({ date: '2026-09-10' }),
    ], staff, TODAY);
    assert.equal(row.noShows, 2);
    // Gelmediği gün "son geliş" olamaz.
    assert.equal(row.lastVisitDate, '2026-09-10');
});

test('hiç gelmemiş müşteri kaybolmuyor', () => {
    const [row] = managerBookRows([people[2]], [], staff, TODAY);
    assert.equal(row.lastVisitDate, null);
    assert.equal(row.noShows, 0);
    assert.equal(bookLine(row), 'Hiç gelmedi');
});

test('personel kaydı silinmişse uydurma harf yazılmıyor', () => {
    const [row] = managerBookRows([people[0]], [visit({ staff_id: 'silinmis' })], staff, TODAY);
    assert.equal(row.lastStaffName, '');
    // Ayraç tek başına kalmıyor: "· " diye başlayan satır neyi ayırdığını söylemez.
    assert.equal(bookLine(row), 'Saç kesimi');
});

test('arama: ad ya da telefonun son dört hanesi, Türkçe kıvrımıyla', () => {
    const rows = managerBookRows(people, [], staff, TODAY);
    const byName = rows.filter((row) => bookMatches(row, 'inci'));
    // "İnci" küçüldüğünde "inci" olmalı — varsayılan toLowerCase bunu bozuyordu.
    assert.deepEqual(byName.map((row) => row.name), ['İnci Kaya']);
    const byPhone = rows.filter((row) => bookMatches(row, '8891'));
    assert.deepEqual(byPhone.map((row) => row.name), ['Ayşe Yıldız']);
    // Boş sorgu herkesi getiriyor; iki hane telefon sayılmıyor.
    assert.equal(rows.filter((row) => bookMatches(row, '')).length, 3);
    assert.equal(rows.filter((row) => bookMatches(row, '04')).length, 0);
});

test('sıra son gelişe göre; bugün randevusu olan en üstte', () => {
    const rows = managerBookRows(people, [
        visit({ customer_id: 'c1', date: '2026-09-10' }),
        visit({ customer_id: 'c2', date: TODAY, start_time: '09:00:00' }),
    ], staff, TODAY);
    const sorted = sortManagerBook(rows, TODAY);
    assert.deepEqual(sorted.map((row) => row.id), ['c2', 'c1', 'c3']);
});

test('Profil satırının özeti: sayı ve bu haftanın hareketi', () => {
    const rows = managerBookRows(people, [
        visit({ customer_id: 'c1', date: '2026-09-16' }),
        visit({ customer_id: 'c2', date: '2026-05-02' }),
    ], staff, TODAY);
    assert.equal(bookSummary(rows, TODAY), '3 kişi · 1’i bu hafta');
    // Hareket yoksa yalnız sayı: "0'ı bu hafta" bir bilgi değil, bir sitem.
    assert.equal(bookSummary(managerBookRows(people, [], staff, TODAY), TODAY), '3 kişi');
    assert.equal(bookSummary([], TODAY), 'Henüz müşteri yok');
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('kapı Profil’de, altıncı sekme açılmadı', () => {
    const profile = read('app/mudur/profile.tsx');
    assert.match(profile, /title="Müşteriler"[\s\S]{0,400}router\.push\('\/\(manager-flow\)\/musteriler'\)/);
    // Personel’in hemen altında: ikisi de İŞLETMENİN KAYITLARI.
    assert.ok(profile.indexOf('title="Personel"') < profile.indexOf('title="Müşteriler"'));
    const tabs = read('app/mudur/_layout.tsx');
    assert.doesNotMatch(tabs, /musteri|customers/i);
});

test('defter okunamazsa boş defter gibi görünmüyor', () => {
    const screen = read('app/(manager-flow)/musteriler.tsx');
    assert.match(screen, /snap\.state === 'error' \? \(\s*<DurumUnread/);
    assert.match(screen, /notMeaning="Müşteri olmadığı"/);
    // Profil satırı da okunamazsa özetsiz kalıyor, sıfır yazmıyor.
    const profile = read('app/mudur/profile.tsx');
    assert.match(profile, /sub=\{customers === null \? undefined : `\$\{customers\} kişi`\}/);
    // Kaynak hatayı YUTMUYOR (müdür kaynağının kuralı): sıfıra çevirmek,
    // okunamayan defteri boş defter gibi göstermekti. Satırı özetsiz bırakma
    // kararı çağıranın.
    const source = read('src/lib/managerSource.ts');
    assert.match(source, /if \(error\) throw error;\s*return count \?\? 0;/);
    assert.match(profile, /fetchCustomerCount\(\)\.catch\(\(\) => null\)/);
});

test('satıra dokununca VAR OLAN müşteri kartı açılıyor', () => {
    // Yeni bir kart ekranı yazılmadı: Müdür 23 zaten canlı.
    const screen = read('app/(manager-flow)/musteriler.tsx');
    assert.match(screen, /pathname: '\/\(staff-flow\)\/customer'/);
    assert.match(screen, /params: \{ customerId: row\.id, customerName: row\.name \}/);
});

test('bakiye satırda YOK — tek kaynak masaüstünde', () => {
    /*
     * Bakiyenin tek kaynağı `patientBalance` (paket dağıtımı FIFO, kısmi
     * ödeme, tedavi planı). Aynı hesabı telefonda ikinci kez yazmak, aynı
     * müşteri için iki farklı borç göstermenin en kısa yoluydu.
     */
    const book = read('src/lib/managerBook.ts');
    const screen = read('app/(manager-flow)/musteriler.tsx');
    // Satırda borç ALANI yok (gerekçe yorumda `patientBalance`'tan söz ediyor,
    // o yüzden dosyanın tamamı değil TİPİN gövdesi taranıyor).
    const shape = book.slice(book.indexOf('export interface ManagerBookRow'), book.indexOf('export interface BookPerson'));
    assert.doesNotMatch(shape, /balance|borç|debt/i);
    assert.doesNotMatch(screen, /\bbalance\b/i);
    assert.match(book, /Bakiye NEDEN yok/);
});

test('iki defter TEK arama alanı kullanıyor', () => {
    // İkinci bir kopya, aynı arama kuralının iki yerde ayrışması demekti.
    const shared = read('src/components/SearchField.tsx');
    assert.match(shared, /export function SearchField/);
    for (const path of ['app/personel/customers.tsx', 'app/(manager-flow)/musteriler.tsx']) {
        const screen = read(path);
        assert.match(screen, /import \{ SearchField \}/, path);
        assert.doesNotMatch(screen, /function SearchField/, path);
    }
});

test('ziyaret sorgusu KİMDE ve GELMEDİ alanlarını da okuyor', () => {
    const source = read('src/lib/managerSource.ts');
    assert.match(source, /const BOOK_COLS = 'customer_id, date, start_time, service, status, staff_id';/);
    // 098 çalışmamış bir sunucuda sütun YOK: defter kapanmıyor, sayı sıfırlanıyor.
    assert.match(source, /visitQuery\(`\$\{BOOK_COLS\}, no_show_at`\)/);
    assert.match(source, /code === UNDEFINED_COLUMN[\s\S]{0,120}visitQuery\(BOOK_COLS\)/);
});
