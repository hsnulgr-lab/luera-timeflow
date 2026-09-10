import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { initialsOf } from '../mobile/src/lib/text.ts';

/**
 * Baş harf TEK YERDE.
 *
 * Üç ayrı uygulama vardı ve üçü ayrı davranıyordu; aynı kişi ekrandan ekrana
 * farklı iki harfle görünüyordu.
 */

const SRC = fileURLToPath(new URL('../mobile/src', import.meta.url));
const APP = fileURLToPath(new URL('../mobile/app', import.meta.url));

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

test('adın baş harfi TEK yerde tanımlı', () => {
    const owners = [];
    for (const full of [...walk(SRC), ...walk(APP)]) {
        const src = readFileSync(full, 'utf8');
        // `managerFlow.initialsOf` bir OLAY alıyor (sunucunun gönderdiği
        // `customerInitials` varsa onu tercih ediyor) ve `FlowParts`
        // `initialsOfName` iki harf çıkmazsa `undefined` dönüyor — ikisi de
        // ayrı sözleşme, kopya değil. Aranan yalnız `string → string` olan.
        if (/export function initialsOf\(name: string\)/.test(src)) {
            owners.push(relative(fileURLToPath(new URL('../mobile', import.meta.url)), full));
        }
    }
    assert.deepEqual(owners, ['src/lib/text.ts'],
        `baş harf birden çok yerde tanımlı:\n  ${owners.join('\n  ')}`);
});

test('kural SUNUCUYLA aynı', () => {
    // `staff-api` müşteri defterini dönerken baş harfi kendisi üretiyor ve o
    // değer ekranda yerelde türetilenlerle YAN YANA duruyor. İki kural
    // ayrışırsa aynı listede iki farklı biçim görünür.
    const api = readFileSync(
        new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');
    assert.match(
        api,
        /parts\.length > 1 \? parts\[0\]\[0\] \+ parts\[parts\.length - 1\]\[0\] : \(parts\[0\] \?\? '\?'\)\.slice\(0, 2\)/,
        'sunucunun kuralı değişmiş — istemci de değişmeli',
    );
    // Aynı girdiler, aynı çıktılar.
    assert.equal(initialsOf('Merve Kaya'), 'MK');
    assert.equal(initialsOf('Deniz'), 'DE');
    assert.equal(initialsOf(''), '?');
});

test('üç kelimelik adda ORTA ad atlanıyor', () => {
    // Eskiden `ApptParts` ilk İKİ kelimeyi alıyordu: "Ayşe Nur Demir" orada
    // "AN", ötekilerde "AD" görünüyordu. Soyadı taşıyan doğru.
    assert.equal(initialsOf('Ayşe Nur Demir'), 'AD');
});

test('Türkçe büyütme: i → İ, ı → I', () => {
    // Varsayılan `toUpperCase` "i"yi "I" yapıyor ve "İnci" ekranda "Inci"
    // görünüyordu.
    assert.equal(initialsOf('İnci Işık'), 'İI');
    assert.equal(initialsOf('irem şen'), 'İŞ');
    assert.equal(initialsOf('ışıl yıldız'), 'IY');
});

test('boşluk ve fazla aralık gövdeyi bozmuyor', () => {
    assert.equal(initialsOf('   '), '?');
    assert.equal(initialsOf('  Elif   Demir  '), 'ED');
});
