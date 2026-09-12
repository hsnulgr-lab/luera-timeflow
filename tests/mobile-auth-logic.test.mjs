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
    lockWaitText,
    pairLocked,
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
        'Şifre yanlış. 2 denemeniz kaldı; sonra bu telefon 15 dakika kilitlenir.',
    );
});

test('metin sunucuda karşılığı olmayan HİÇBİR sayı ya da söz vermez', () => {
    // "Üç kere yanlış girilirse" sahte katmanın sayısıydı; sunucudaki sınır
    // BEŞ (PIN_MAX_ATTEMPTS). Canlıya geçince cümle yanlış oldu.
    const staff = remainingAttemptText('staff', 2);
    assert.doesNotMatch(staff, /Üç kere|üç kere|\b3 kere\b/);
    // Kilitlenme yalnız bir denetim satırı yazıyor; kimseye haber GİTMİYOR.
    assert.doesNotMatch(staff, /haber gider|bildirilir/);
});

test('kalan deneme BİLİNMİYORSA sayı yazılmıyor — sıfır yazılmıyor', () => {
    // Müdür yolunda sunucu kalan deneme göndermiyor. Ekran `?? 0` yazdığı
    // için ilk yanlış şifrede "0 denemeniz kaldı" çıkıyordu: uydurma sayı,
    // uydurma tehdit.
    const manager = remainingAttemptText('manager', null);
    assert.doesNotMatch(manager, /\d+ denemeniz kaldı/);
    assert.match(manager, /E-posta ve şifre eşleşmedi\./);
    assert.match(manager, /15 dakika kapanır\./);

    const staff = remainingAttemptText('staff', null);
    assert.doesNotMatch(staff, /\d+ denemeniz kaldı/);
    assert.match(staff, /15 dakika kilitlenir\./);

    // SIFIR hâlâ geçerli bir sayı: "son hakkınızı da kullandınız" demek.
    assert.match(remainingAttemptText('manager', 0), /0 denemeniz kaldı/);
});

test('kilit bekleme metni dakikayı YUKARI yuvarlar, biteni saklamaz', () => {
    assert.equal(lockWaitText(900), '15 dakika sonra tekrar deneyebilirsiniz');
    // 14:01 → "15 dakika" değil ama "14 dakika" da değil: yukarı yuvarlanıyor
    // ki kişi erken deneyip kilidi beslemesin.
    assert.equal(lockWaitText(841), '15 dakika sonra tekrar deneyebilirsiniz');
    assert.equal(lockWaitText(60), '1 dakika sonra tekrar deneyebilirsiniz');
    assert.equal(lockWaitText(59), '59 saniye sonra tekrar deneyebilirsiniz');
    assert.equal(lockWaitText(0), 'Şimdi deneyebilirsiniz');
    assert.equal(lockWaitText(-5), 'Şimdi deneyebilirsiniz');
});

test('eşleştirme kilidi metni KODU suçlamıyor ve yeni kod istemeyi söylüyor', () => {
    // Kilit 15 dakika, kod 10 dakika geçerli: kilit açıldığında eldeki kodun
    // süresi KESİNLİKLE dolmuş oluyor. Beklemeyi söyleyip yeni kod istemeyi
    // söylememek, kişiyi ikinci kez duvara sürerdi.
    const all = `${pairLocked.title} ${pairLocked.body} ${pairLocked.hint}`;
    assert.doesNotMatch(all, /eşleşmedi|yanlış yazd|rakamları/i);
    assert.match(pairLocked.body, /15 dakika/);
    assert.match(pairLocked.body, /hiçbir kod kabul edilmiyor/);
    assert.match(pairLocked.hint, /yeni bir kod/);
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
