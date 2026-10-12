/**
 * Tek Kişilik · randevu kartında "Müşteriyi ara" (kullanıcı kararı, 2026-10-12).
 *
 * Tek kişilikte Akış'ın "Ara" gözü yok; arama kumandada ve müşteri kartında
 * duruyordu. Satır "Mesajla hatırlat"ın ÜSTÜNDE, aynı listede.
 *
 * Kural DAVRANIŞLA, bağlantı kaynak metniyle sınanıyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CALL_TITLE, callAction } from '../mobile/src/lib/appointmentDetail.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const route = code('mobile/app/(manager-flow)/randevu/[id].tsx');
const card = code('mobile/src/components/AppointmentDetail.tsx');
const parts = code('mobile/src/components/ApptParts25.tsx');

test('numara hangi biçimde yazılmış olursa olsun TAM ve aynı biçimde', () => {
    for (const raw of ['0532 111 22 33', '+90 532 111 22 33', '905321112233', '5321112233']) {
        assert.deepEqual(callAction({ customer_phone: raw }), {
            title: CALL_TITLE,
            value: '0532 111 22 33',
            url: 'tel:+905321112233',
        }, raw);
    }
    assert.equal(CALL_TITLE, 'Müşteriyi ara');
});

test('aranamayan numarada satır YOK — sönük satır ölü kontrol olurdu', () => {
    for (const raw of [null, undefined, '', '  ', '123']) {
        assert.equal(callAction({ customer_phone: raw }), null, String(raw));
    }
});

test('yurt dışı numara + ile', () => {
    assert.deepEqual(callAction({ customer_phone: '+49 151 2345 6789' }), {
        title: CALL_TITLE, value: '+4915123456789', url: 'tel:+4915123456789',
    });
});

test('YALNIZ tek kişilikte; açılamazsa sessiz kalmıyor', () => {
    assert.match(route, /const call = solo && appointment \? callAction\(appointment\) : null;/);
    assert.match(route, /call=\{call\}\s*onCall=\{dial\}\s*reminder=\{reminder\}\s*onRemind=\{remind\}/);
    assert.match(route, /Linking\.openURL\(action\.url\)\.catch\(\(\) => \{\s*Alert\.alert\(CALL_FAILED,/);
});

test('önce ARA, sonra hatırlat — tek liste, tek çizgi', () => {
    const call = card.indexOf("key: 'call' as const");
    const remind = card.indexOf("key: 'remind' as const");
    assert.ok(call > 0 && call < remind, 'sıra: ara, hatırlat');
    const rows = parts.slice(parts.indexOf('export function ContactRows('), parts.indexOf('// ── Yıkıcı bölge'));
    assert.match(rows, /if \(rows\.length === 0\) return null;/);
    // ChangeRows gibi: her satırın üst çizgisi, yalnız sonuncunun alt çizgisi.
    assert.match(rows, /borderTopWidth: 1,\s*borderBottomWidth: index === rows\.length - 1 \? 1 : 0,/);
    assert.match(rows, /accessibilityRole="link"/);
    assert.match(rows, /<Path d="M8 16L16 8M10 8h6v6" \/>/);
});
