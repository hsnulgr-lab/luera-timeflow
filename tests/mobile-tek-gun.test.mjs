/**
 * Tek kişilik · Gün ekranının metin ve kapsam kuralları (108).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { soloDaySubtitle } from '../mobile/src/lib/soloDay.ts';

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const gun = read('app/tek/index.tsx');

test('alt başlık personel dilinde sayıyor, müdür dilinde değil', () => {
    // "6 randevu · 3 personel" müdürün sorusu. Bu modda ekrana bakan kişi
    // işi YAPAN kişi: kaçının bittiği onun sorusu.
    assert.equal(soloDaySubtitle('2026-10-09', { done: 2, left: 3 }), '9 Ekim · 2 iş bitti, 3 kaldı');
});

test('okunmamış gün sayı UYDURMUYOR', () => {
    // `null` = henüz okunmadı. "0 iş bitti" yazmak günü boş göstermek olurdu
    // ve saniyeler sonra kendini yalanlardı.
    assert.equal(soloDaySubtitle('2026-10-09', null), '9 Ekim');
});

test('gerçekten boş gün sayı saymıyor, durumu söylüyor', () => {
    // "0 iş bitti, 0 kaldı" teknik olarak doğru ama kimsenin kurmayacağı
    // bir cümle.
    assert.equal(soloDaySubtitle('2026-10-09', { done: 0, left: 0 }), '9 Ekim · randevu yok');
});

test('sahipsiz randevu da bu kişinin gününde', () => {
    /*
     * Müdür 24 yalnız `staff_id` eşleşenleri alıyor çünkü orada kimin işi
     * olduğu bir ayrım. Tek kişilik salonda öyle bir ayrım yok: `staff_id`
     * boş bir randevu — masaüstünden ya da mod açılmadan önce kurulmuş
     * olabilir — yine de bu kişinin günündedir. Süzüp atmak günü olduğundan
     * boş göstermek olurdu.
     */
    assert.match(gun, /!row\.staff_id \|\| row\.staff_id === me\?\.id/);
});

test('şimdi çizgisi YALNIZ bugün çiziliyor', () => {
    // Başka günün altında "şimdi" diye bir çizgi yalan söyler.
    assert.match(gun, /showNowLine && isToday/);
});

test('okunamadı, boş günden AYRI çiziliyor', () => {
    // Hiç veri yokken "randevunuz yok" demek yanlış cümle: gün dolu olabilir.
    assert.match(gun, /state === 'error' && !dayKnown[\s\S]{0,200}DurumUnread/);
});

test('dokunulduğunda hiçbir şey yapmayan hap ÇİZİLMİYOR', () => {
    // Kart `action`a hazır ama kumanda yolu bağlanmadan hap konmuyor.
    assert.doesNotMatch(gun, /action=\{/);
});
