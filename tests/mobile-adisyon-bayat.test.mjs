import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { linesDiffer, linesFromItems } from '../mobile/src/lib/adisyon.ts';

/**
 * ADİSYON BAŞKA BİR CİHAZDA DEĞİŞTİ.
 *
 * İki kusur, tek kök. Kumanda ziyareti odağa her dönüşte YENİDEN OKUYOR ve
 * `updatedAt`i ilerletiyordu — ama ekrandaki kalemler yerelde, ESKİ hâlinden
 * türemiş hâlde duruyordu (sıfırlama `base?.id`ye bağlı, bilerek).
 *
 *   1. personel kalem ekler
 *   2. kasiyer masaüstünden adisyona dokunur → sunucunun damgası ilerler
 *   3. personel Müşteriler'e geçip geri döner → damga YENİLENİR
 *   4. personel gönderir → kilit uyar ve KASİYERİN EKLEDİĞİ SİLİNİR
 *
 * Yani iyimser kilit sessizce çözülüyordu — engellemek için var olduğu şeyin
 * ta kendisi oluyordu. İkinci kusur daha görünür: 40 dakikalık boya
 * beklemesinde ekran değişiklikten hiç haberdar olmuyordu.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const source = code(read('src/lib/visitSource.ts'));
const screen = code(read('app/(staff-flow)/kumanda.tsx'));

const item = (over = {}) => ({
    id: 's1', kind: 'product', name: 'Saç bakım yağı', productId: 'p1', qty: 1, price: 100, ...over,
});

// ── Gözlem BENİMSEME değil ──────────────────────────────────────────────────

test('arka plan okuması damgayı İLERLETMİYOR', () => {
    // Damga, ekrandaki kalemlerin TÜRETİLDİĞİ okumaya ait olmak zorunda.
    // İlerlerse kilit, personelin görmediği bir hâli onaylamış olur.
    assert.match(source, /const read = useCallback\(\(visible: boolean, adopt: boolean\) => \{/);
    assert.match(source, /if \(!adopt\) \{/);
    // Gözlemde YALNIZ sunucunun damgası not ediliyor.
    assert.match(source, /setServerAt\(next\.stamp\);\s*\n\s*if \(!adopt\)/);
});

test('yoklama ve odak BENİMSEMİYOR, açılış ve tazeleme benimsiyor', () => {
    assert.match(source, /useEffect\(\(\) => \{ void read\(true, true\); \}, \[read\]\);/);
    assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{ void read\(false, false\); \}, \[read\]\)\)/);
    assert.match(source, /if \(next === 'active'\) void read\(false, false\);/);
    assert.match(source, /return read\(true, true\);/);
    // Yoklama uygulama ÖNDEYKEN: cepteki telefon adisyonu çekmemeli.
    assert.match(source, /if \(AppState\.currentState !== 'active'\) return;\s*\n\s*void read\(false, false\);/);
});

test('değişiklik iki damga da BİLİNİYORKEN söyleniyor', () => {
    // Damga henüz okunmamışken "değişti" demek, bilinmezliği değişiklik gibi
    // göstermek olurdu.
    assert.match(source, /changed: updatedAt !== null && serverAt !== null && serverAt !== updatedAt/);
});

test('gözlem randevu KAYBOLDUYSA susmuyor', () => {
    // Silinmiş ya da başka personele geçmiş bir ziyareti elde tutmak, olmayan
    // bir şeye yazdırmak olurdu.
    assert.match(source, /if \(!next\.row\) setState\('missing'\);/);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('kumanda değişikliği GÖSTERİYOR ve kararı personele bırakıyor', () => {
    assert.match(screen, /<ChangedBand/);
    assert.match(screen, /Adisyon başka bir cihazda değişti/);
    assert.match(screen, /Listeyi tazele/);
    // Kendiliğinden tazelemek, personelin yazdığı kalemleri altından çekmek
    // olurdu: şerit bir DÜĞME taşıyor.
    assert.match(screen, /onRefresh=\{\(\) => \{ feedback\.selection\(\); void reloadVisit\(\); \}\}/);
});

test('kasadaki adisyonda şerit ÇIKMIYOR', () => {
    // Orada yazılacak bir şey kalmadı; şerit yalnız gürültü olurdu.
    assert.match(screen, /\{changed && !delivered \? \(/);
});

test('tazeleme YALNIZ kalemleri yeniliyor, sayacı değil', () => {
    // Büyük sıfırlama burada çalışsaydı bekleme halkasını ve gönderme
    // penceresini de silerdi: personel listeyi tazeleyince işlem durmuyor.
    assert.match(screen, /if \(version === adopted\.current\) return;/);
    assert.match(screen, /adopted\.current = version;\s*\n\s*setLines\(linesFromItems\(base\?\.adisyon_items\)\);/);
});

// ── Tazelemenin bedeli ──────────────────────────────────────────────────────

test('yerel düzenleme YOKSA kayıp cümlesi kurulmuyor', () => {
    const server = linesFromItems([item()]);
    assert.equal(linesDiffer(server, server), false);
    assert.match(screen, /Listeniz sunucudaki hâline dönecek\./);
});

test('eklenen kalem düzenleme SAYILIYOR', () => {
    const server = linesFromItems([item()]);
    const local = [...server, { id: 'n1', catalogId: 'p2', name: 'Boya', kind: 'material', qty: 1 }];
    assert.equal(linesDiffer(local, server), true);
});

test('miktar değişikliği düzenleme SAYILIYOR', () => {
    const server = linesFromItems([item({ qty: 1 })]);
    const local = linesFromItems([item({ qty: 3 })]);
    assert.equal(linesDiffer(local, server), true);
});

test('silinmeyi BEKLEYEN satır düzenleme sayılıyor', () => {
    // Satır ekranda duruyor ama personel onu kaldırmaya karar vermiş;
    // tazeleme o kararı da geri alır.
    const server = linesFromItems([item()]);
    const local = server.map((line) => ({ ...line, pendingDelete: true }));
    assert.equal(linesDiffer(local, server), true);
});

test('SIRA değişikliği yanlış alarm vermiyor', () => {
    // Sunucu kalemleri kendi sırasıyla dönebiliyor; sırf sıra değişti diye
    // "yerel düzenlemen var" demek personeli boş yere kayıpla korkuturdu.
    const a = linesFromItems([item({ id: 's1', productId: 'p1' }), item({ id: 's2', productId: 'p2', name: 'Boya' })]);
    const b = linesFromItems([item({ id: 's2', productId: 'p2', name: 'Boya' }), item({ id: 's1', productId: 'p1' })]);
    assert.equal(linesDiffer(a, b), false);
});

test('satır KİMLİĞİ değişikliği yanlış alarm vermiyor', () => {
    // Sunucu yazdıktan sonra satıra kendi id'sini veriyor; yerelde `n<zaman>`
    // olan aynı kalem, kimliği farklı diye "düzenleme" sayılmamalı.
    const server = linesFromItems([item({ id: 'product:p1' })]);
    const local = linesFromItems([item({ id: 'n1757800000000' })]);
    assert.equal(linesDiffer(local, server), false);
});
