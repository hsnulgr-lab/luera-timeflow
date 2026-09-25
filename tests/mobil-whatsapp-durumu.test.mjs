import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    cellSpec, pillCells, WA_OFF_BODY, WA_OFF_TITLE, waLineReady,
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
    assert.equal(cellSpec('waoff').hint, 'masaüstünden bağlanır');
});

test('ekran durumu SUNUCUDAN okuyor — sabit geri gelmedi', () => {
    assert.doesNotMatch(ekran, /WA_CONNECTED/,
        'Sabit geri geldi: hattı olmayan salonda "Yaz" yine çizilir ve hata verir.');
    assert.match(ekran, /const \[waLine, setWaLine\] = useState<boolean \| null>\(null\);/);
    assert.match(ekran, /useFocusEffect\(useCallback\(\(\) => \{\s*let alive = true;\s*fetchWaConnected\(\)\.then\(/,
        'Durum odakta okunmuyor — masaüstünde bağlanınca göz yanmaz.');
    // Okunamamak ÇALIŞAN hattı söndürmemeli: bilinmeyen = eski davranış.
    assert.match(ekran, /waConnected=\{waLine \?\? true\}/);
});

test('okuma masaüstüyle aynı satırdan ve hata yutulmadan', () => {
    const fn = kaynak.slice(kaynak.indexOf('export async function fetchWaConnected'));
    assert.match(fn, /supabase\.from\('org_whatsapp'\)\.select\('status'\)/);
    assert.match(fn, /\.eq\('organization_id', organizationId\)\.maybeSingle\(\)/);
    // Hata ATILIYOR, "bağlı değil"e çevrilmiyor.
    assert.match(fn, /if \(error\) throw error;\s*return waLineReady\(data\?\.status\);/);
});

test('sönük göz ölü değil — sebebi ve yeri söylüyor', () => {
    assert.match(ekran, /if \(cell === 'waoff'\) \{\s*Alert\.alert\(WA_OFF_TITLE, WA_OFF_BODY\);\s*return;\s*\}/,
        'Sönük göze dokununca yine hiçbir şey olmuyor — ölü düğme.');
    assert.equal(WA_OFF_TITLE, 'WhatsApp bağlı değil');
    assert.match(WA_OFF_BODY, /masaüstünde Ayarlar → WhatsApp’tan bağlanır/);
    // 3.1.3(f): açıklama bir satın almaya ya da aboneliğe çağırmamalı.
    assert.doesNotMatch(WA_OFF_BODY, /satın|abonelik|ücret|fiyat|paket|öde/i);
});
