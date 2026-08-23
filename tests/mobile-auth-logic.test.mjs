import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatPairingCode,
    isValidEmail,
    normalizeEmail,
    passwordRuleState,
} from '../mobile/src/lib/authValidation.ts';
import {
    accountDeletionItems,
    lockCountdownText,
    remainingAttemptText,
} from '../mobile/src/lib/authCopy.ts';

test('e-posta karşılaştırmadan önce kırpılır ve küçük harfe çevrilir', () => {
    assert.equal(normalizeEmail('  Ayla@StudioAyla.COM  '), 'ayla@studioayla.com');
});

test('e-posta kontrolü geçerli sade adresleri kabul eder', () => {
    assert.equal(isValidEmail('ayla@studioayla.com'), true);
    assert.equal(isValidEmail(' A@B.CO '), true);
});

test('e-posta kontrolü açık yazım hatalarını reddeder', () => {
    for (const value of ['', 'ayla', '@studio.com', 'ayla@studio', 'ayla@@studio.com', 'ayla @studio.com']) {
        assert.equal(isValidEmail(value), false, `reddedilmeliydi: ${value}`);
    }
});

test('şifre kuralında uzunluk ve rakam ayrı ayrı izlenir', () => {
    assert.deepEqual(passwordRuleState('abc1234'), {
        length: 7,
        hasMinLength: false,
        hasDigit: true,
        valid: false,
        message: 'En az 8 karakter olsun, içinde bir rakam bulunsun.',
    });
    assert.deepEqual(passwordRuleState('abcdefgh'), {
        length: 8,
        hasMinLength: true,
        hasDigit: false,
        valid: false,
        message: 'En az 8 karakter olsun, içinde bir rakam bulunsun.',
    });
});

test('uygun şifre aynı yerde başarı durumuna ve açıklamasına döner', () => {
    assert.deepEqual(passwordRuleState('abcdefg1'), {
        length: 8,
        hasMinLength: true,
        hasDigit: true,
        valid: true,
        message: 'Şifreniz uygun: 8 karakter, içinde rakam var.',
    });
});

test('eşleştirme kodu yalnız ilk altı rakamı tutar', () => {
    assert.equal(formatPairingCode('48 21-75'), '482175');
    assert.equal(formatPairingCode('48x21y7599'), '482175');
    assert.equal(formatPairingCode(''), '');
});

test('müdür hatası hesap varlığını sızdırmadan kalan denemeyi söyler', () => {
    assert.equal(
        remainingAttemptText('manager', 3),
        'E-posta ve şifre eşleşmedi. 3 denemeniz kaldı; sonra hesap 15 dakika kapanır.',
    );
});

test('personel hatası kalan denemeyi ve telefon kilidini birlikte söyler', () => {
    assert.equal(
        remainingAttemptText('staff', 2),
        'Şifre yanlış. 2 denemeniz kaldı. Üç kere yanlış girilirse bu telefon 15 dakika kilitlenir ve işletme sahibine haber gider.',
    );
});

test('kilit sayacı düğmenin içinde dakika ve saniyeyi sıfır dolgulu gösterir', () => {
    assert.equal(lockCountdownText(900), 'Yeniden dene · 15:00');
    assert.equal(lockCountdownText(61), 'Yeniden dene · 01:01');
    assert.equal(lockCountdownText(1), 'Yeniden dene · 00:01');
    assert.equal(lockCountdownText(0.2), 'Yeniden dene · 00:01');
    assert.equal(lockCountdownText(0), 'Yeniden dene');
    assert.equal(lockCountdownText(-4), 'Yeniden dene');
});

test('silme diyaloğu üç işletmeyi Türkçe listeler ve dört sonucu açıklar', () => {
    assert.deepEqual(accountDeletionItems(['Studio Ayla', 'Ayla Beauty Bebek', 'Ayla Klinik']), [
        'Studio Ayla, Ayla Beauty Bebek ve Ayla Klinik’in tüm randevuları ve müşteri bilgileri silinir.',
        'Personelinizin telefon bağlantıları kesilir; uygulamaya giremezler.',
        'Yasal olarak tutmamız gereken satış kayıtları 10 yıl saklanır, adınıza bağlı kalmaz.',
        'Silme 30 gün içinde tamamlanır. Bu süre içinde girerseniz işlem durur.',
    ]);
});

test('silme listesi tek işletme ve isimsiz durumlarda da kimlik uydurmaz', () => {
    const names = ['  Saç ve Bakım  '];
    assert.equal(
        accountDeletionItems(names)[0],
        'Saç ve Bakım’ın tüm randevuları ve müşteri bilgileri silinir.',
    );
    assert.equal(
        accountDeletionItems([])[0],
        'İşletmelerinizin tüm randevuları ve müşteri bilgileri silinir.',
    );
    assert.deepEqual(names, ['  Saç ve Bakım  ']);
});
