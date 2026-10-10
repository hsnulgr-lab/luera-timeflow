import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/**
 * `transform` STİL ANAHTARI KALDIRILMAZ.
 *
 * Telefonda görülen çökme: kayıt ekranında şifre kuralı sağlanıp sonra
 * bozulunca (kullanıcı doğru şifreden bir harf silince) kök hata sınırı
 * açılıyordu — `[TypeError: Cannot read property 'forEach' of null]`.
 *
 * Sebep: `transform: valid ? [{...}] : undefined`. Anahtar bir karede dizi,
 * sonraki karede yok. RN Fabric kalkan stil anahtarını `null`'a çevirip
 * `processTransform`'a veriyor (`ReactNativeAttributePayload.diffProperties`
 * → `attributeConfig.process(nextProp)`), `_validateTransforms` de null'u
 * karşılamıyor.
 *
 * Doğrulama __DEV__'e özel: mağaza derlemesinde çökmüyor. Yani bu, Expo
 * Go'da her gün görülen ama yayında görünmeyen bir hata sınıfı — kendi
 * başına fark edilmesi en zor olanı. Kural tek cümle: hareket yokken birim
 * dönüşüm yaz (`[{ translateY: 0 }]`), anahtarı hiç kaldırma.
 */

const MOBILE = fileURLToPath(new URL('../mobile', import.meta.url));
const ROOTS = ['src', 'app'].map((d) => join(MOBILE, d));

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

test('koşullu transform `undefined`a düşmüyor', () => {
    const offenders = [];
    for (const root of ROOTS) {
        for (const full of walk(root)) {
            const src = readFileSync(full, 'utf8');
            src.split('\n').forEach((line, index) => {
                // `transform: <koşul> ? [...] : undefined` ve ters sırası.
                if (/\btransform:\s*[^,;]*\?[^;]*\bundefined\b/.test(line)) {
                    offenders.push(`${relative(MOBILE, full)}:${index + 1}`);
                }
            });
        }
    }
    assert.deepEqual(offenders, [], `transform anahtarı kaldırılıyor: ${offenders.join(', ')}`);
});

test('düzeltmenin kendisi yerinde', () => {
    // Çökmeyi yaşayan iki yer; birim dönüşümle duruyorlar.
    const ui = readFileSync(join(MOBILE, 'src/components/ui.tsx'), 'utf8');
    assert.match(ui, /: \[\{ translateY: 0 \}\];/);
    const empty = readFileSync(join(MOBILE, 'src/components/EmptyDayParts.tsx'), 'utf8');
    assert.match(empty, /transform: \[\{ translateX: entering\?\.translateX \?\? 0 \}\]/);
});
