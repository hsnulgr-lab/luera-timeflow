import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Rol kapısının VARSAYILANI.
 *
 * Kapı eskiden "oturum yok" ile "oturum okunamadı"yı aynı sayıyordu ve
 * ikisinde de `allowed` dönüyordu. Bir yetki kapısının varsayılanı
 * "izin ver" olamaz.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const gate = read('src/lib/roleGate.ts');
const manager = read('app/mudur/_layout.tsx');
const staff = read('app/personel/_layout.tsx');
const index = read('app/index.tsx');

test('okunamayan oturum ALLOWED değil', () => {
    assert.doesNotMatch(gate, /\.catch\(\(\) => \{ if \(alive\) setState\('allowed'\); \}\)/,
        'hata dalı kapıyı açmamalı');
    assert.match(gate, /\.catch\(\(\) => \{ if \(alive\) setState\('unreadable'\); \}\)/);
});

test('yalnız GERÇEKTEN okunmuş iki sonuç geçiyor', () => {
    // `no_session`: oturum yok — stub kimlikle gezilen ekranlar için bilinçli.
    // `subscription_inactive`: oturum okundu, kapı başka yerde (paywall).
    assert.match(
        gate,
        /const readable = result\.error === 'no_session' \|\| result\.error === 'subscription_inactive';/,
    );
    assert.match(gate, /setState\(readable \? 'allowed' : 'unreadable'\)/);
});

test('okunamayan oturum ÖTEKİ KABUĞA yönlendirilmiyor', () => {
    // `/mudur` wrong → `/personel`, `/personel` wrong → `/mudur`. Okunamayan
    // oturumu `wrong` saymak iki kabuk arasında sonsuz döngü üretirdi.
    for (const [name, shell] of [['müdür', manager], ['personel', staff]]) {
        assert.match(shell, /gate\.state === 'unreadable'\) return <AuthSessionErrorScreen/,
            `${name} kabuğu okunamayan oturumu görünür kılmalı`);
        assert.doesNotMatch(shell, /'unreadable'\) return <Redirect/,
            `${name} kabuğu okunamayan oturumu yönlendirmemeli`);
    }
});

test('her iki kabuk da AYNI kararı veriyor', () => {
    // Biri yönlendirip öteki dururken döngü yine oluşurdu.
    const shape = (src) => (src.match(/gate\.state === '(\w+)'/g) ?? []).join('|');
    assert.equal(shape(manager), shape(staff));
});

test('tekrar dene GERÇEKTEN yeniden okuyor', () => {
    // Düğme yalnız ekranı kapatsaydı, kapı eski kararıyla kalırdı.
    assert.match(gate, /const \[attempt, setAttempt\] = useState\(0\)/);
    assert.match(gate, /\}, \[expected, attempt\]\)/);
    assert.match(gate, /const retry = \(\) => \{\s*setState\('checking'\);\s*setAttempt\(\(n\) => n \+ 1\);\s*\}/,
        'yeniden denerken hata ekranı beklemeye dönmeli');
    // Sıfırlama EFEKTİN içinde olmamalı: orada senkron setState zincirleme
    // render tetikliyor (react-hooks/set-state-in-effect).
    assert.doesNotMatch(gate, /let alive = true;\s*setState\('checking'\)/);
    assert.doesNotMatch(index, /let alive = true;\s*setFailed\(false\)/);
});

test('ilk ekran okuma hatasında SONSUZA KADAR boş kalmıyor', () => {
    // `.catch` yoktu: `launch` hep null kalıyor ve uygulamanın ilk ekranı
    // kalıcı boş zemin oluyordu — kullanıcı için "açılmıyor".
    assert.match(index, /\.catch\(\(\) => \{\s*clearTimeout\(timer\);\s*if \(alive\) setFailed\(true\);\s*\}\)/);
    assert.match(index, /if \(failed\) \{/);
    assert.match(index, /<AuthSessionErrorScreen\s+onRetry=\{\(\) => \{ setFailed\(false\); setAttempt/);
});

test('ilk ekran okuma hatasında SESSİZCE çıkış yaptırmıyor', () => {
    // Geçici bir okuma hatası yüzünden geçerli oturumu olan kişiyi yeniden
    // giriş yapmaya zorlamak, veri kaybı olmasa da güven kaybıdır.
    assert.doesNotMatch(index, /\.catch\([^)]*welcome/);
});
