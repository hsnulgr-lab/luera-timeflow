import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    adisyonExtras, adisyonNames, reservationPrice, reservationTotal,
} from '../src/utils/reservationServices.ts';

/**
 * KASA ADİSYONU OKUYOR MU.
 *
 * `KasaPage` tahsil ederken `reservationPrice` kullanıyordu ve o yalnız
 * katalog hizmet ücretini okuyor — `adisyonItems`a HİÇ dokunmuyordu.
 *
 * Telefon hiçbir şey yazmadığı sürece bu uykudaydı. Mobil kumanda üretime
 * yazmaya başlayınca uyandı: personel boya + ürün + ek hizmet ekliyor,
 * kasiyer "tahsil et" diyor ve yalnız hizmet ücreti tahsil ediliyordu.
 * Eklenen her kalem ÜCRETSİZ gidiyordu ve kimse fark etmiyordu.
 *
 * İlginç olan, masa akışının bunu doğru yapmasıydı (`adisyonTotal`) — desen
 * vardı, salon akışına uygulanmamıştı.
 */

const kasa = readFileSync(new URL('../src/pages/KasaPage.tsx', import.meta.url), 'utf8');

const SERVICES = [
    { id: 's1', name: 'Saç boyama', price: 800, duration: 90 },
    { id: 's2', name: 'Fön', price: 200, duration: 30 },
];
const res = (over = {}) => ({ id: 'r1', service: 'Saç boyama', ...over });

/** Sunucunun (`staff-api` · visit.items) yazdığı şekil birebir. */
const extra = (id, name, price) => ({ id: `service:${id}`, name, price, kind: 'extra', serviceId: id });
const product = (id, name, price) => ({ id: `product:${id}`, name, price, kind: 'product', productId: id });
const material = (id, name, qty) => ({ id: `material:${id}`, name, price: 0, kind: 'material', productId: id, ...(qty > 1 ? { qty } : {}) });

// ── Toplam ──────────────────────────────────────────────────────────────────

test('adisyon kalemleri tahsilata GİRİYOR', () => {
    const r = res({ adisyonItems: [product('p1', 'Saç bakım yağı', 450)] });
    assert.equal(reservationPrice(r, SERVICES), 800, 'hizmet ücreti değişmedi');
    assert.equal(reservationTotal(r, SERVICES), 1250, 'ürün de tahsil edilmeli');
});

test('ek hizmet de giriyor', () => {
    const r = res({ adisyonItems: [extra('s2', 'Fön', 200), product('p1', 'Yağ', 450)] });
    assert.equal(reservationTotal(r, SERVICES), 1450);
});

test('MALZEME tahsil edilmiyor', () => {
    // Sarf depodan düşer, müşteriye yazılmaz — sunucu onu `price: 0` yazıyor.
    const r = res({ adisyonItems: [material('p9', 'Oksidan %6', 2), product('p1', 'Yağ', 450)] });
    assert.equal(reservationTotal(r, SERVICES), 1250);
});

test('MİKTAR çarpan olarak giriyor', () => {
    // Bugün sunucu ürünü tek adet yazıyor, ama varsayılanı atlamak ileride
    // adetli bir satır geldiğinde tutarı SESSİZCE eksiltirdi.
    assert.equal(adisyonExtras([{ ...product('p1', 'Yağ', 450), qty: 3 }]), 1350);
    assert.equal(adisyonExtras([product('p1', 'Yağ', 450)]), 450, 'qty yoksa 1 sayılıyor');
});

test('adisyon YOKSA tutar değişmiyor', () => {
    // Telefonu olmayan salonda hiçbir şey değişmemeli.
    assert.equal(reservationTotal(res(), SERVICES), 800);
    assert.equal(reservationTotal(res({ adisyonItems: [] }), SERVICES), 800);
});

test('fiyatı tanımsız hizmette adisyon TEK BAŞINA tahsil ediliyor', () => {
    // Eskiden tutar 0 görünüp "Fiyat yok" diyordu ve satılan ürün kasaya hiç
    // düşmüyordu.
    const r = res({ service: 'Tanımsız işlem', adisyonItems: [product('p1', 'Yağ', 450)] });
    assert.equal(reservationPrice(r, SERVICES), 0);
    assert.equal(reservationTotal(r, SERVICES), 450);
});

test('çoklu hizmet ücreti korunuyor', () => {
    // `customFields.hizmetler` yolu bozulmamalı: adisyon onun ÜSTÜNE biniyor.
    const r = res({
        service: 'Saç boyama + Fön',
        customFields: { hizmetler: JSON.stringify([{ id: 's1', name: 'Saç boyama', price: 800 }, { id: 's2', name: 'Fön', price: 200 }]) },
        adisyonItems: [product('p1', 'Yağ', 450)],
    });
    assert.equal(reservationTotal(r, SERVICES), 1450);
});

// ── Belgenin açıklaması ─────────────────────────────────────────────────────

test('açıklama ÜCRETLİ kalemleri yazıyor', () => {
    // Belgede yalnız "Saç boyama" yazarken tutarın hizmet ücretinden yüksek
    // olması, kasayı okuyan kişiye açıklanamayan bir fark bırakırdı.
    assert.equal(adisyonNames([extra('s2', 'Fön', 200), product('p1', 'Yağ', 450)]), 'Fön, Yağ');
});

test('açıklama SARFI yazmıyor', () => {
    // Ücreti olmayan bir kalem belgede ödenmiş gibi görünür.
    assert.equal(adisyonNames([material('p9', 'Oksidan', 2), product('p1', 'Yağ', 450)]), 'Yağ');
    assert.equal(adisyonNames([material('p9', 'Oksidan', 2)]), '');
    assert.equal(adisyonNames(undefined), '');
});

test('adet açıklamada görünüyor', () => {
    assert.equal(adisyonNames([{ ...product('p1', 'Yağ', 450), qty: 2 }]), '2× Yağ');
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('Kasa TOPLAMI kullanıyor, hizmet ücretini değil', () => {
    assert.match(kasa, /const priceOf = \(r: Reservation\) => reservationTotal\(r, settings\.services\);/);
    // Eski çağrı geri gelmemeli.
    assert.doesNotMatch(kasa, /reservationPrice\(r, settings\.services\)/);
});

test('tahsilat açıklaması kalemleri taşıyor', () => {
    assert.match(kasa, /const extras = adisyonNames\(r\.adisyonItems\);/);
    assert.match(kasa, /description: extras \? `\$\{r\.service\} · \$\{extras\}` : r\.service/);
});

test('liste tutarı da TOPLAM — tahsil edilenle aynı', () => {
    // Listede bir tutar gösterip başka bir tutar tahsil etmek, kasiyerin
    // fark etmeyeceği bir sapma olurdu: ikisi de `priceOf`tan geliyor.
    assert.match(kasa, /\{priceOf\(r\) > 0 \? `\$\{fmt\(priceOf\(r\)\)\} ₺` : 'Fiyat yok'\}/);
    assert.match(kasa, /const amt = priceOf\(r\);/);
});
