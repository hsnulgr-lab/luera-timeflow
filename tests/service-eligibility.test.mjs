import assert from 'node:assert/strict';
import test from 'node:test';
import {
    activeRiskFlags, eligibilityTagsFor, evaluateEligibility, firstBlocked, isBlockedFor,
} from '../src/lib/serviceEligibility.ts';

// Kontrendikasyon tek kaynağı. Regresyon: kural eskiden yalnız seans modalında
// bir regex'ti; takvim, mobil oluşturucu, düzenleme ve paket satışı aynı
// müşteriye aynı işlemi serbestçe seçtiriyordu. Üstelik ikinci bir kopya
// (BeautyCustomerPage) farklı bir regex kullandığı için aynı paket bir ekranda
// kapalı, diğerinde açıktı.

const pregnant = { customFields: { hamilelik: true } };
const notPregnant = { customFields: { hamilelik: false } };
const noFields = {};

const lazer = { name: 'Lazer Epilasyon', tags: ['lazer'] };
const bakim = { name: 'Cilt Bakımı', tags: ['bakim'] };

test('hamile müşteride lazer kapanır, bakım açık kalır', () => {
    assert.equal(isBlockedFor(pregnant, lazer, 'guzellik'), true);
    assert.equal(isBlockedFor(pregnant, bakim, 'guzellik'), false);
});

test('bayrak yoksa hiçbir hizmet kapanmaz', () => {
    assert.equal(isBlockedFor(notPregnant, lazer, 'guzellik'), false);
    assert.equal(isBlockedFor(noFields, lazer, 'guzellik'), false);
    assert.equal(isBlockedFor(null, lazer, 'guzellik'), false);
});

test('sebep ve mesaj kullanıcıya gösterilebilir biçimde döner', () => {
    const v = evaluateEligibility(pregnant, lazer, 'guzellik');
    assert.equal(v.reason, 'Hamilelik');
    assert.equal(v.message, 'Hamilelik — gebelikte uygulanmaz');
});

test('kuralı olmayan sektörde her şey serbest', () => {
    assert.equal(isBlockedFor(pregnant, lazer, 'kuafor'), false);
    assert.equal(isBlockedFor(pregnant, lazer, 'berber'), false);
    assert.equal(isBlockedFor(pregnant, lazer, undefined), false);
});

test('etiketsiz eski hizmet ada göre yakalanır (geriye dönük uyum)', () => {
    assert.equal(isBlockedFor(pregnant, { name: 'Bölgesel İncelme' }, 'guzellik'), true);
    assert.equal(isBlockedFor(pregnant, { name: 'G5 Masaj' }, 'guzellik'), true);
    assert.equal(isBlockedFor(pregnant, { name: 'Manikür' }, 'guzellik'), false);
});

test('Türkçe büyük/küçük harf ad eşleşmeyi bozmaz', () => {
    // JS'te /lazer|incelme/i deseni "İ" ve "I" harflerini ASCII karşılıklarıyla
    // eşleştirmez; bu satırlar o sessiz kaçışı kilitler.
    for (const name of ['İNCELME PAKETİ', 'Bölgesel incelme', 'ZAYIFLAMA', 'Zayıflama', 'LAZER', 'Lazer']) {
        assert.equal(isBlockedFor(pregnant, { name }, 'guzellik'), true, `bloklanmalıydı: ${name}`);
    }
    for (const name of ['Manikür', 'Kaş Alımı', 'Cilt Bakımı']) {
        assert.equal(isBlockedFor(pregnant, { name }, 'guzellik'), false, `bloklanmamalıydı: ${name}`);
    }
});

test('etiket varsa ad eşleşmesine düşülmez — etiket kazanır', () => {
    // Adında "lazer" geçse de etiketi güvenli olan bir hizmet kapatılmaz;
    // etiket, işletmenin bilinçli sınıflandırmasıdır.
    assert.equal(isBlockedFor(pregnant, { name: 'Lazer sonrası bakım', tags: ['bakim'] }, 'guzellik'), false);
});

test('metin alanı dolu olduğunda da bayrak aktiftir', () => {
    // Hamilelik checkbox; ama aynı mekanizma alerji gibi metin alanları için de
    // çalışmalı — boş metin bayrak saymaz.
    const flag = { customFields: { hamilelik: 'evet, 5. ay' } };
    assert.equal(isBlockedFor(flag, lazer, 'guzellik'), true);
    assert.equal(isBlockedFor({ customFields: { hamilelik: '   ' } }, lazer, 'guzellik'), false);
});

test('çok hizmetli seansta ilk engel bulunur', () => {
    const hit = firstBlocked(pregnant, [bakim, lazer], 'guzellik');
    assert.equal(hit?.target.name, 'Lazer Epilasyon');
    assert.equal(hit?.verdict.reason, 'Hamilelik');
    assert.equal(firstBlocked(pregnant, [bakim], 'guzellik'), null);
});

test('aktif bayraklar uyarı şeridi için listelenir', () => {
    assert.deepEqual(activeRiskFlags(pregnant, 'guzellik').map((f) => f.label), ['Hamilelik']);
    assert.deepEqual(activeRiskFlags(notPregnant, 'guzellik'), []);
    assert.deepEqual(activeRiskFlags(pregnant, 'kuafor'), []);
});

test('hedef yoksa sorgu güvenli biçimde geçer', () => {
    assert.equal(isBlockedFor(pregnant, null, 'guzellik'), false);
    assert.equal(isBlockedFor(pregnant, undefined, 'guzellik'), false);
});

// ── DB guard hatasının kullanıcıya çevrilmesi ────────────────────────────────
// 073 trigger'ı UI atlanırsa devreye girer; mesajı "saat doldu" diye
// yorumlamak kullanıcıyı tamamen yanlış yere bakmaya iter.
const { getReservationConflictError } = await import('../src/lib/reservationErrors.ts');

test('uygunluk guard hatası çakışma değil, uygunluk olarak okunur', () => {
    const err = {
        code: '23514',
        message: 'reservation_eligibility_blocked',
        details: '{"reason": "Hamilelik", "note": "gebelikte uygulanmaz", "service": "Lazer Epilasyon"}',
    };
    const parsed = getReservationConflictError(err);
    assert.equal(parsed?.kind, 'eligibility');
    assert.match(parsed.message, /Hamilelik/);
    assert.match(parsed.message, /gebelikte uygulanmaz/);
});

test('gerçek çakışma hatası uygunluk sanılmaz', () => {
    assert.equal(getReservationConflictError({ code: '23P01', message: 'reservation_staff_conflict' })?.kind, 'staff');
});

test('Ayarlar etiket seçenekleri sektör kurallarından türer', () => {
    // Etiket listesi elle tutulmaz; riskFlags.blocks birleşimidir.
    assert.deepEqual(eligibilityTagsFor('guzellik').sort(), ['lazer', 'medikal']);
    // Kuralı olmayan sektörde etiket UI'ı hiç çıkmamalı.
    assert.deepEqual(eligibilityTagsFor('kuafor'), []);
    assert.deepEqual(eligibilityTagsFor(undefined), []);
});
