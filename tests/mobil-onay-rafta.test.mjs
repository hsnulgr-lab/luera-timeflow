/**
 * Onay akışı RAFTA (2026-09-19, kullanıcı kararı) + sıradaki kartın geri
 * sayımı tek satır.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APPROVAL_FLOW_ENABLED, awaitsApproval } from '../mobile/src/lib/approval.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('onay akışı kapalı; kapalıyken hiçbir randevu "onay bekliyor" değil', () => {
    assert.equal(APPROVAL_FLOW_ENABLED, false);
    assert.equal(awaitsApproval('pending'), false);
    assert.equal(awaitsApproval('confirmed'), false);
});

test('kod SİLİNMEDİ: kart ve yazma yerinde, yalnız anahtarın arkasında', () => {
    const flow = read('../mobile/src/lib/managerFlow.ts');
    assert.match(flow, /\{ label: 'Onayla', kind: 'fill' \}, \{ label: 'Reddet', kind: 'ghost' \}/);
    assert.match(read('../mobile/app/mudur/index.tsx'), /label === 'Onayla'/);
});

test('beklemede durumunu okuyan her yer anahtardan geçiyor', () => {
    for (const path of [
        '../mobile/src/lib/flowBuild.ts',
        '../mobile/src/lib/calendar.ts',
        '../mobile/src/components/StaffDayParts.tsx',
        '../mobile/src/lib/staffDay.ts',
        '../mobile/src/lib/staffCard.ts',
    ]) {
        const src = code(read(path));
        assert.match(src, /awaitsApproval\(/, path);
        assert.doesNotMatch(src, /status === 'pending'\) return/, `${path} anahtarı atlıyor`);
    }
});

test('masaüstü elle açılan randevuyu pending yazıyor — rafın sebebi', () => {
    assert.match(read('../src/pages/CalendarPage.tsx'), /status: 'pending', notes: newRes\.notes/);
});

test('geri sayım tek satır: rakam büyük, birim küçük, sığmazsa küçülür', () => {
    const parts = code(read('../mobile/src/components/FlowParts.tsx'));
    const panel = parts.slice(parts.indexOf('function EtaPanel('), parts.indexOf('function EtaPanel(') + 4000);
    assert.match(panel, /<Num fit size=\{nextCardMetrics\.eta\}/);
    assert.match(panel, /etaParts\(panel\.value\)/);
    assert.match(panel, /fontSize: nextCardMetrics\.eta \* ETA_UNIT_SCALE/);
    assert.match(parts, /const ETA_UNIT_SCALE = 0\.45;/);
});
