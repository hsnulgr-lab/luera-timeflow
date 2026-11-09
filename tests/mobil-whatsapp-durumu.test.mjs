import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    cellSpec, pillCells, waLineDropped, waLineReady,
} from '../mobile/src/lib/actionPill.ts';

/**
 * WHATSAPP DURUMU SUNUCUDAN · 2026-09-25 · App Store 2.1
 *
 * Müdür akışındaki "Yaz" gözü `mockSend.WA_CONNECTED = true` SABİTİNE
 * bakıyordu. Hattı hiç bağlanmamış salonda da çiziliyor, 5 saniyelik
 * pencereden sonra "Salonun WhatsApp'ı bağlı değil" hatası dönüyordu. Demo
 * salonda hat yok: App Store hakemi tam bunu görürdü — "çalışmayan özellik".
 *
 * Sönük onarım gözü (`waoff`) tasarımda vardı ama hiç çizilmiyordu, çünkü
 * gideceği ekran yazılmamıştı ve ölü düğme olurdu. Telefonda o ekran
 * YAZILMAYACAK: hat masaüstünde QR ile bağlanıyor. Göz artık sebebi ve yeri
 * söylüyor.
 *
 * Kilitlenenler:
 *   1. Yalnız `connected` hazır sayılır.
 *   2. Ekran durumu sunucudan okur; sabit geri gelmez.
 *   3. Okunamayan durum gözü SÖNDÜRMEZ.
 *   4. Sönük göz ölü değil — açıklama gösterir.
 *
 * MÜDÜR 37 (2026-11-10): hat artık TELEFONDAN bağlanıyor. Sönük göz açıklama
 * değil bağlama penceresini açar; kelimesi "buradan bağlanır", hat düştüyse
 * "bağlantısı düştü · buradan yeniden bağlanır".
 */

const oku = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ekran = kod(oku('mobile/app/mudur/index.tsx'));
const kaynak = kod(oku('mobile/src/lib/managerSource.ts'));

test('yalnız "connected" gönderime hazır', () => {
    assert.equal(waLineReady('connected'), true);
    // QR yarıda kalmış hat — sunucu oradan göndermiyor.
    assert.equal(waLineReady('connecting'), false);
    assert.equal(waLineReady('disconnected'), false);
    // Satır yok = hat hiç bağlanmamış.
    assert.equal(waLineReady(null), false);
    assert.equal(waLineReady(undefined), false);
});

test('bağlı değilse göz onarım hâline döner, bağlıysa yazar', () => {
    const girdi = { customerPhone: '0532 118 24 06', canDrop: false, canTellStaff: false };
    assert.deepEqual(pillCells({ ...girdi, waConnected: false }), ['ara', 'waoff']);
    assert.deepEqual(pillCells({ ...girdi, waConnected: true }), ['ara', 'wa']);
    assert.equal(cellSpec('waoff').hint, 'buradan bağlanır');
    assert.equal(cellSpec('waoff', undefined, true).label, 'WhatsApp bağlantısı düştü');
});

test('düştü: yalnız sebep yazılıyken (sahip bilerek kesince sebep silinir)', () => {
    assert.equal(waLineDropped('disconnected', 'state:close'), true);
    assert.equal(waLineDropped('disconnected', null), false);
    assert.equal(waLineDropped('disconnected', ''), false);
    assert.equal(waLineDropped('connecting', 'x'), false);
    assert.equal(waLineDropped('connected', null), false);
});

test('ekran durumu SUNUCUDAN okuyor — sabit geri gelmedi', () => {
    assert.doesNotMatch(ekran, /WA_CONNECTED/,
        'Sabit geri geldi: hattı olmayan salonda "Yaz" yine çizilir ve hata verir.');
    assert.match(ekran, /const \[waLine, setWaLine\] = useState<boolean \| null>\(null\);/);
    assert.match(ekran, /useFocusEffect\(useCallback\(\(\) => \{\s*let alive = true;\s*fetchWaLine\(\)\.then\(/,
        'Durum odakta okunmuyor — masaüstünde bağlanınca göz yanmaz.');
    // Okunamamak ÇALIŞAN hattı söndürmemeli: bilinmeyen = eski davranış.
    assert.match(ekran, /waConnected=\{waLine \?\? true\}/);
});

test('okuma masaüstüyle aynı satırdan ve hata yutulmadan', () => {
    const fn = kaynak.slice(kaynak.indexOf('export async function fetchWaLine'));
    assert.match(fn, /supabase\.from\('org_whatsapp'\)\.select\('status, last_error'\)/);
    assert.match(fn, /\.eq\('organization_id', organizationId\)\.maybeSingle\(\)/);
    // Hata ATILIYOR, "bağlı değil"e çevrilmiyor.
    assert.match(fn, /if \(error\) throw error;\s*return \{ ready: waLineReady\(data\?\.status\), dropped: waLineDropped\(data\?\.status, data\?\.last_error\) \};/);
});

test('sönük göz ölü değil — bağlama penceresini açıyor (Müdür 37 · A2)', () => {
    assert.match(ekran, /if \(cell === 'waoff'\) \{\s*setTimeout\(\(\) => router\.push\('\/\(manager-flow\)\/whatsapp-bagla\?from=pill'\), 110\);\s*return;\s*\}/,
        'Sönük göze dokununca bağlama penceresi açılmıyor — ölü düğme.');
    assert.match(ekran, /setLineDropped\(line\.dropped\)/);
    // 3.1.3(f): kelime bir satın almaya ya da aboneliğe çağırmamalı.
    for (const d of [false, true]) {
        const spec = cellSpec('waoff', undefined, d);
        assert.doesNotMatch(`${spec.label} ${spec.hint}`, /satın|abonelik|ücret|fiyat|paket|öde/i);
    }
});
