import assert from 'node:assert/strict';
import test from 'node:test';
import { didBecomeClosed, isClosed, recallDaysFor } from '../src/lib/appointmentFlow.ts';
import { commsForSector } from '../src/lib/sectorProfiles.ts';

// Kapanış geçişi — recall ve tekrar-seans otomasyonlarının tek tetikleyicisi.
// Regresyon: `wasClosed` bir zamanlar UPDATE ... RETURNING ile dönen
// GÜNCELLENMİŞ satırdan okunuyordu; kapanışı yapan güncellemede "zaten
// kapalıydı" sonucu çıkıyor ve geçiş hiçbir zaman yakalanmıyordu. Sonuç:
// customers.recall_date hiç yazılmadığı için recall tüm sektörlerde ölüydü.

const open = { status: 'confirmed', isPaid: false };
const servedNotPaid = { status: 'completed', isPaid: false };
const closed = { status: 'completed', isPaid: true };

test('hizmet tamamlanıp tahsil edilince kapanış YAKALANIR', () => {
    assert.equal(didBecomeClosed(servedNotPaid, closed, { isPaid: true }), true);
    assert.equal(didBecomeClosed(open, closed, { status: 'completed', isPaid: true }), true);
});

test('REGRESYON: güncellenmiş satır önceki durum sanılırsa geçiş kaybolur', () => {
    // Hatalı davranışın kendisi: prev olarak sonuç satırı verilirse false döner.
    assert.equal(didBecomeClosed(closed, closed, { isPaid: true }), false);
    // Doğru kullanım aynı güncellemede true vermeli — ikisi birlikte hatayı kilitler.
    assert.equal(didBecomeClosed(servedNotPaid, closed, { isPaid: true }), true);
});

test('yalnız hizmet biterse (tahsilat yok) kapanış sayılmaz', () => {
    assert.equal(didBecomeClosed(open, servedNotPaid, { status: 'completed' }), false);
    assert.equal(isClosed(servedNotPaid), false);
});

test('zaten kapalı kayıtta ikinci güncelleme otomasyonu tekrar tetiklemez', () => {
    assert.equal(didBecomeClosed(closed, closed, { staffId: 'x' }), false);
});

test('bayat prev + ilgisiz güncelleme recall\'ı yeniden tetiklemez', () => {
    // Başka sekme çoktan kapatmış; yerel liste eski. Not güncellemesi geçiş sayılmamalı.
    assert.equal(didBecomeClosed(open, closed, { notes: 'not' }), false);
});

test('listede olmayan randevu (prev undefined) kapanışı engellemez', () => {
    assert.equal(didBecomeClosed(undefined, closed, { isPaid: true }), true);
});

// ── Recall periyodu çözümü ───────────────────────────────────────────────────

const services = [
    { name: 'Lazer', recallDays: 45 },
    { name: 'Cilt Bakımı' },
];

test('hizmetin kendi recallDays değeri sektör varsayılanını ezer', () => {
    assert.equal(recallDaysFor('Lazer', services, 30), 45);
});

test('hizmette gün yoksa sektör varsayılanına düşer', () => {
    assert.equal(recallDaysFor('Cilt Bakımı', services, 30), 30);
});

test('kapsayan ad eşleşmesi çalışır', () => {
    assert.equal(recallDaysFor('Lazer - Bacak', services, 30), 45);
});

test('sektörün recall kavramı yoksa recall kurulmaz', () => {
    assert.equal(recallDaysFor('Cilt Bakımı', services, undefined), undefined);
    // Avukatlık profilinde recall yoktur — fallback zinciri undefined üretmeli.
    assert.equal(commsForSector('avukat').recall, undefined);
});

test('güzellik sektörü 30 günlük bakım yenileme varsayılanı taşır', () => {
    assert.equal(commsForSector('guzellik').recall?.afterDays, 30);
    assert.equal(recallDaysFor('Ağda', [], commsForSector('guzellik').recall?.afterDays), 30);
});
