import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

/**
 * APP STORE 3.1.3(f) — YÖNLENDİRME YASAĞI · 2026-09-24
 *
 * Luera TimeFlow, ücretli bir web hizmetinin ÜCRETSİZ yardımcı uygulaması.
 * 3.1.3(f) bu tür uygulamaları IAP zorunluluğundan muaf tutuyor — ama
 * koşullu: "uygulama içinde satın alma YA DA uygulama dışında satın almaya
 * ÇAĞRI olmaması" gerekiyor.
 *
 * Muafiyet kodda doğru anlaşılmıştı ama koşulu atlanmıştı. İki ekran
 * dışarıda satın almaya çağırıyordu:
 *
 *   • Kapalı kapı — "Bilgisayardan <adres>, erişimi oradan açabilirsiniz"
 *   • Kayıt ekranı — "Abonelik daha sonra BİLGİSAYARDAN seçilir"
 *
 * İkisi de kaldırıldı. Bu dosya geri gelmelerini engelliyor: risk tek bir
 * cümlede değil, o cümlenin başka bir ekranda yeniden belirmesinde.
 *
 * NOT: Bu bir hukuki görüş değil, bir KORUMA. Apple'ın kuralları değişiyor;
 * burada kilitlenen şey "uygulama bir satın alma yeri söylemez" ilkesi.
 */

const KOK = new URL('../mobile/', import.meta.url);
const oku = (p) => readFileSync(new URL(p, KOK), 'utf8');
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Kullanıcıya GÖRÜNEN metinlerin yaşadığı yerler. */
function dosyalar(dizin, bulunan = []) {
    for (const ad of readdirSync(new URL(dizin, KOK))) {
        if (ad === 'node_modules' || ad.startsWith('.')) continue;
        const yol = `${dizin}${ad}`;
        if (statSync(new URL(yol, KOK)).isDirectory()) dosyalar(`${yol}/`, bulunan);
        else if (/\.(ts|tsx)$/.test(ad)) bulunan.push(yol);
    }
    return bulunan;
}

const HEPSI = [...dosyalar('app/'), ...dosyalar('src/lib/')];

test('hiçbir ekran SATIN ALMA YERİ söylemiyor', () => {
    /*
     * Aranan şey "abonelik" kelimesi değil — o bir durumu anlatmak için
     * meşru biçimde geçebilir. Aranan şey YÖNLENDİRME: bir yer + oradan
     * bir şey yapma çağrısı.
     */
    const kalip = /(bilgisayardan|web ?siten?den|siteden|tarayıcıdan)[^.\n]{0,60}(abonel|satın|öde|plan|seç|aç)/i;
    const suclu = [];
    for (const dosya of HEPSI) {
        const metin = kod(oku(dosya));
        const m = kalip.exec(metin);
        if (m) suclu.push(`${dosya}: "${m[0].slice(0, 70)}"`);
    }
    assert.deepEqual(suclu, [], `dışarıda satın almaya çağrı:\n  ${suclu.join('\n  ')}`);
});

test('kapalı kapı bir DURUM söylüyor, bir YER değil', () => {
    const copy = kod(oku('src/lib/authCopy.ts'));
    const blok = copy.slice(copy.indexOf('export const subscriptionLocked'));
    const govde = blok.slice(0, blok.indexOf('} as const;'));
    assert.doesNotMatch(govde, /http|\.com\/|Bilgisayardan/);
    // Destek adresi bir satın alma yolu DEĞİL; kalması gerekiyor.
    assert.match(govde, /info@lueratech\.com/);
});

test('uygulama içinde ödeme akışı YOK', () => {
    // IAP kütüphanesi kurulu olsaydı, "satın alma yok" beyanı yalan olurdu.
    const paketler = JSON.parse(oku('package.json')).dependencies ?? {};
    for (const ad of Object.keys(paketler)) {
        assert.ok(!/iap|in-app-purchase|purchases|stripe|revenuecat|adapty/i.test(ad),
            `ödeme kütüphanesi: ${ad}`);
    }
});

test('kayıt ekranı IAP olmadığını AÇIKÇA söylüyor', () => {
    // Hakemin göreceği ilk ekranlardan biri; belirsizlik bırakmıyor.
    assert.match(kod(oku('app/(auth)/signup/account.tsx')),
        /Uygulama içinden satın alma yoktur/);
});

test('dışarı açılan tek adresler GİZLİLİK, DESTEK ve VERİ DIŞA AKTARMA', () => {
    /*
     * Üçü de Apple'ın istediği ya da teşvik ettiği yollar. Buraya bir
     * abonelik ya da ödeme adresi eklenirse muafiyet riske girer.
     */
    const profil = kod(oku('src/lib/managerProfile.ts'));
    const adresler = [...profil.matchAll(/https:\/\/[^\s'"`]+/g)].map((m) => m[0]);
    for (const adres of adresler) {
        assert.match(adres, /gizlilik\.html|destek\.html/, `beklenmeyen adres: ${adres}`);
    }
    assert.match(profil, /DELETE_EXPORT_PATH = '\/settings\?tab=data'/);
});
