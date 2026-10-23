// Uzman ekle / düzenle çekmecesi — 2026-10-24.
// İlk sürümdeki "kutulara yazılan cümle" beğenilmedi; kullanıcı üç taslak
// arasından F'yi seçti: üç adım (Kim? → Ne yapacak? → Ne zaman?). Ad yazılmadan
// ilerlenmez; düzenlerken adımlar sekmedir ve her sekmeden kaydedilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const drawer = read('../src/components/staff/StaffDrawer.tsx');
const page = read('../src/pages/StaffPage.tsx');

test('cümle kalktı — kutulara yazılan cümle yok', () => {
    assert.doesNotMatch(drawer, /sdr-sentence|sdr-tok/);
});

test('üç adım: Kim? → Ne yapacak? → Ne zaman?', () => {
    assert.match(drawer, /\['Kim\?', 'Ne yapacak\?', 'Ne zaman\?'\]/);
    assert.match(drawer, /\['Ekibe kim katılıyor\?', 'Ekipte ne yapacak\?', 'Ne zaman çalışacak\?'\]/);
    // Son adımda birincil düğme kaydeder
    assert.match(drawer, /if \(editing \|\| step === 2\) onSave\(\);/);
});

test('ad yazılmadan sonraki adıma geçilmez', () => {
    assert.match(drawer, /const go = \(to: Step\) => \{\s*if \(to > 0 && !requireName\(\)\) return;/);
    assert.match(drawer, /Devam etmek için adını yaz/);
});

test('düzenlerken adımlar sekme, her sekmeden kaydedilir', () => {
    assert.match(drawer, /editing \? \['Kişi', 'Rol', 'Saatler'\]/);
    assert.match(drawer, /editing \? 'Kaydet'/);
});

test('uzmanlık önerileri işletmenin hizmetlerinden gelir', () => {
    assert.match(page, /suggestions=\{\(settings\.services \|\| \[\]\)\.map\(\(s\) => s\.name\)\}/);
    assert.match(drawer, /const setSpecialty = \(list: string\[\]\) => set\('specialty', list\.join\(', '\)\);/);
});
