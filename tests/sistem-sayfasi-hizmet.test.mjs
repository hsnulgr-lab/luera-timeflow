/**
 * "Yeni hizmet" sayfasının tutamağı ÇALIŞIYOR — iOS'un sayfası (2026-10-15).
 *
 * Telefonda bulundu: `BottomSheet`in tutamağı çizili ama sürüklenmiyordu.
 * Elle yazılmış jest transparent `Modal` içinde iki kez tutmamıştı; kullanıcı
 * kararı: uzun sayfalar sistemin sayfası. Taşıma listesi BİLEREK dışarıda:
 * seçimin ardından sonuç sayfası (başka bir modal) açılıyor ve iOS kapanmakta
 * olan sayfanın üstüne modal açmıyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

test('kabuğun sistem yolu: pageSheet, kaydırarak kapatma AÇIK, klavye payı', () => {
    const sheet = code('src/components/Sheet.tsx');
    const sys = sheet.slice(sheet.indexOf('if (system) {'), sheet.indexOf('<Modal visible={visible} transparent'));
    assert.match(sys, /presentationStyle="pageSheet"/);
    // Verilmezse iOS jesti kapatıyor (`modalInPresentation = !allowSwipeDismissal`).
    assert.match(sys, /allowSwipeDismissal/);
    assert.match(sys, /onRequestClose=\{onDismiss\}/);
    assert.match(sys, /paddingBottom: kb/);
});

test('hizmet sayfası sistemin sayfası; taşıma listesi DEĞİL', () => {
    const profile = code('src/components/ProfileSheets.tsx');
    const service = profile.slice(profile.indexOf('export function ServiceSheet('), profile.indexOf('export function ServiceRow('));
    assert.match(service, /<BottomSheet visible=\{visible\} onDismiss=\{onDismiss\} fill system>/);
    const move = code('src/components/MoveParts.tsx');
    assert.doesNotMatch(move, /<BottomSheet[^>]*\bsystem\b/, 'taşıma listesi sonuç sayfasını açamaz olurdu');
});
