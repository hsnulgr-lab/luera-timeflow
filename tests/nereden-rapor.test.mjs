// Analiz › "Müşteriler nereden geliyor?" toplayıcısı (src/lib/neredenRapor.ts).
// Sayılan: dönemde açılan YENİ müşteri; eski müşteriler tek satır.
import assert from 'node:assert/strict';
import test from 'node:test';
import { neredenRaporu } from '../src/lib/neredenRapor.ts';

const NOW = new Date('2026-11-01T15:00:00');
let n = 0;
const res = (over) => ({
    id: `r${++n}`, customerId: null, groupId: null, date: '2026-10-20', startTime: '10:00', status: 'confirmed',
    arrivedAt: null, customerArrivedAt: null, noShowAt: null, ...over,
});
const satir = (rapor, key) => rapor.satirlar.find((s) => s.key === key);

test('yeni müşteriler nereden geldiklerine göre; gelen / gelmeyen apptPhase ile', () => {
    const musteriler = [
        { id: 'a', origin: 'instagram' },
        { id: 'b', origin: 'instagram' },
        { id: 'c', origin: 'google_maps' },
        { id: 'd', origin: null },
    ];
    const randevular = [
        res({ customerId: 'a', status: 'completed' }),                                   // geldi
        res({ customerId: 'a', date: '2026-11-05' }),                                     // ileri tarih: bekliyor
        res({ customerId: 'b', date: '2026-10-25', startTime: '09:00' }),                 // +30 dk geçti, gelmedi
        res({ customerId: 'c', noShowAt: '2026-10-21T10:40:00Z' }),                       // müdür "Gelmedi" dedi
        res({ customerId: 'c', date: '2026-10-28', noShowAt: '2026-10-28T10:40:00Z', customerArrivedAt: '2026-10-28T10:50:00Z' }), // geç geldi: geldi
        res({ customerId: 'd', status: 'cancelled' }),                                    // iptal: sayılmaz
    ];
    const r = neredenRaporu(musteriler, randevular, { now: NOW });

    assert.deepEqual(satir(r, 'instagram'), { key: 'instagram', musteri: 2, randevu: 3, geldi: 1, gelmedi: 1 });
    assert.deepEqual(satir(r, 'google_maps'), { key: 'google_maps', musteri: 1, randevu: 2, geldi: 1, gelmedi: 1 });
    assert.deepEqual(satir(r, 'belirtilmemis'), { key: 'belirtilmemis', musteri: 1, randevu: 0, geldi: 0, gelmedi: 0 });
    assert.equal(r.yeniToplam, 4);
    assert.equal(r.bilinenOran, 0.75);
    assert.equal(r.kayitsiz, 0);
});

test('çok hizmetli ziyaret tek randevu; iptal edilmiş grup sayılmaz', () => {
    const r = neredenRaporu([{ id: 'a', origin: 'tiktok' }], [
        res({ customerId: 'a', groupId: 'g1', status: 'completed' }),
        res({ customerId: 'a', groupId: 'g1', startTime: '11:00', status: 'completed' }),
        res({ customerId: 'a', groupId: 'g1', startTime: '12:00', status: 'completed' }),
        res({ customerId: 'a', groupId: 'g2', status: 'cancelled' }),
        res({ customerId: 'a', groupId: 'g2', status: 'cancelled' }),
    ], { now: NOW });
    assert.deepEqual(satir(r, 'tiktok'), { key: 'tiktok', musteri: 1, randevu: 1, geldi: 1, gelmedi: 0 });
});

test('eski müşteriler "Geri gelenler"; müşterisiz randevu dipnotta', () => {
    const r = neredenRaporu([{ id: 'yeni', origin: 'tavsiye' }], [
        res({ customerId: 'eski1', status: 'completed' }),
        res({ customerId: 'eski1', date: '2026-10-27', status: 'completed' }),
        res({ customerId: 'eski2', date: '2026-10-29', startTime: '09:00' }),   // gelmedi
        res({ customerId: null, status: 'completed' }),                       // kayıtsız walk-in
    ], { now: NOW });
    assert.deepEqual(satir(r, 'geri_gelen'), { key: 'geri_gelen', musteri: 2, randevu: 3, geldi: 2, gelmedi: 1 });
    assert.equal(r.kayitsiz, 1);
    assert.equal(r.yeniToplam, 1);
});

test('sıralama: çok müşteri getiren üstte; Belirtilmemiş ve Geri gelenler altta; boş satır yok', () => {
    const r = neredenRaporu([
        { id: '1', origin: 'google' },
        { id: '2', origin: 'instagram' }, { id: '3', origin: 'instagram' },
        { id: '4', origin: null }, { id: '5', origin: null }, { id: '6', origin: null },
        { id: '7', origin: 'bozuk-deger' },
    ], [res({ customerId: 'eski', status: 'completed' })], { now: NOW });
    assert.deepEqual(r.satirlar.map((s) => s.key), ['instagram', 'google', 'belirtilmemis', 'geri_gelen']);
    assert.equal(satir(r, 'belirtilmemis').musteri, 4); // tanınmayan değer belirtilmemiş sayılır
    assert.ok(!r.satirlar.some((s) => s.musteri === 0 && s.randevu === 0));
});

test('hiç yeni müşteri yoksa oran null', () => {
    const r = neredenRaporu([], [], { now: NOW });
    assert.deepEqual(r, { satirlar: [], yeniToplam: 0, bilinenOran: null, kayitsiz: 0 });
});
