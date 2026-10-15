/**
 * "luera" markası KIRPILMIYOR (2026-10-16, telefonda bulundu).
 *
 * Sade markanın (devam ekranı, kayıttaki mod sorusu) satır yüksekliği yazı
 * boyunun 0.82'siydi; iOS satırın üstünü kırpıyor, "l"nin tepesi gidiyordu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../mobile/src/components/ui.tsx', import.meta.url), 'utf8');

test('LueraMark satır yüksekliği yazı boyundan küçük değil', () => {
    const mark = ui.slice(ui.indexOf('export function LueraMark('), ui.indexOf('function DeleteIcon('));
    assert.ok(mark.length > 0);
    assert.doesNotMatch(mark, /lineHeight: size \* \(plain \? 0\.\d+/, 'sade marka yeniden kırpılıyor');
    assert.match(mark, /fontSize: size,[\s\S]{0,120}lineHeight: size,/);
});
