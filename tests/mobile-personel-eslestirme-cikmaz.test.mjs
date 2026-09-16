import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * PERSONEL EŞLEŞTİRMEDE TAKILMA — 2026-09-16, kullanıcının telefonunda.
 *
 * Üç çıkmaz: abonelik hatası "kod eşleşmedi" diye okunuyordu; personele bağlı
 * kodda istemci yine de "Siz kimsiniz?" listesine gidiyordu; PIN'i olan kimse
 * yoksa liste boş bir başlık olarak kalıyordu.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pair = read('mobile/app/(auth)/staff/pair.tsx');
const who = read('mobile/app/(auth)/staff/who.tsx');

test('abonelik hatası kodu SUÇLAMIYOR — kilit ekranına gidiyor', () => {
    assert.match(pair, /if \(result\.error === 'subscription_inactive'\) \{\s*router\.replace\('\/\(auth\)\/locked'\);/);
    assert.ok(pair.indexOf("'subscription_inactive'") < pair.indexOf('setInvalid(true);'));
    assert.match(who, /if \(result\.error === 'subscription_inactive'\) \{\s*router\.replace\('\/\(auth\)\/locked'\);/);
});

test('personele bağlı kod listeyi ATLIYOR — doğrudan PIN', () => {
    assert.match(pair, /if \(result\.data\.staffId\) \{\s*const chosen = await authApi\.staff\.select\(result\.data\.staffId\);\s*if \(chosen\.ok\) \{ router\.push\('\/\(auth\)\/staff\/pin'\); return; \}/);
    assert.match(read('mobile/src/api/auth.ts'), /staffId: pendingStaffId,/);
});

test('boş kadro çıkmaz sokak değil — sebebi ve yolu söylüyor', () => {
    assert.match(who, /roster && roster\.staff\.length === 0 \?/);
    // 099: liste bütün aktif personeli gösteriyor; boşsa kimse eklenmemiş.
    assert.match(who, /Müdür önce Personel sayfasından sizi eklemeli/);
    assert.match(who, /label="Tekrar dene"\s*onPress=\{\(\) => \{ setRoster\(null\); load\(\); \}\}/);
});
