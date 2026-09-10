import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sendOutcome, queuedBandLabel, errorLine } from '../mobile/src/lib/sendToCash.ts';
import { mockCashResult } from '../mobile/src/lib/mockCash.ts';

/**
 * Gönderim makinesi HER ZAMAN başarılı değil.
 *
 * Ekran 900 ms sonra koşulsuz `sent` yazıyordu: uçak modunda bile "Kasaya
 * gönderildi" diyordu. Adisyonun gitmediğini söylemek kötü haberdir;
 * gitmediği hâlde gitti demek yalandır.
 */

const kumanda = readFileSync(
    new URL('../mobile/app/(staff-flow)/kumanda.tsx', import.meta.url), 'utf8');

// ── Saf karar ───────────────────────────────────────────────────────────────

test('çevrimdışıyken KUYRUĞA düşüyor, gönderildi demiyor', () => {
    assert.deepEqual(sendOutcome({ offline: true }), { state: 'queued', code: null });
});

test('çevrimiçi ve sunucu susuyorsa gönderildi', () => {
    assert.deepEqual(sendOutcome({ offline: false }), { state: 'sent', code: null });
});

test('sunucu konuştuysa KUYRUK devreye girmiyor', () => {
    // 403 ve 409 tekrar denemekle düzelmez; kuyrukta sonsuza kadar dönerdi.
    // Aynı kural `api/staff.ts` · write() içinde de yazılı.
    assert.deepEqual(
        sendOutcome({ offline: true, serverCode: 'forbidden' }),
        { state: 'error', code: 'forbidden' },
    );
});

test('hata kodu ekrana KADAR taşınıyor', () => {
    // Kod atılsaydı her hata aynı cümleyi verirdi.
    assert.equal(errorLine(sendOutcome({ offline: false, serverCode: 'forbidden' }).code),
        'Bu adisyonu gönderme yetkiniz yok');
    assert.equal(errorLine(sendOutcome({ offline: false, serverCode: 'formula_locked' }).code),
        'Bu ziyaret kasada kilitli');
});

test('kuyruk şeridi SAYI UYDURMUYOR', () => {
    // Ekranda sabit "Sırada 3 yazma" yazıyordu; kuyruk boşken bile.
    assert.equal(queuedBandLabel(0), 'Bu adisyon sırada');
    assert.equal(queuedBandLabel(3), 'Sırada 3 yazma');
});

test('sahte sunucu cevabı KARARLI ve tek randevuya bağlı', () => {
    // Rastgele dağıtılsaydı normal akışta hata gibi okunurdu.
    assert.equal(mockCashResult('d5'), 'already_open');
    assert.equal(mockCashResult('d5'), 'already_open');
    for (const id of ['d1', 'd2', 'd3', 'd4', null, undefined]) {
        assert.equal(mockCashResult(id), null, `${id} reddedilmemeli`);
    }
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('ekran ARTIK koşulsuz gönderildi yazmıyor', () => {
    assert.doesNotMatch(kumanda, /setSentAt\(clockOf\(Date\.now\(\)\)\);\s*setSend\('sent'\);/,
        'koşulsuz sent — düzeltilen davranış');
    assert.match(kumanda, /const result = sendOutcome\(\{\s*offline,\s*serverCode: mockCashResult\(base\?\.id\),\s*\}\);/);
    assert.match(kumanda, /setSend\(result\.state\)/);
});

test('damga YALNIZ gerçekten gidince atılıyor', () => {
    // `sealed` başlığı "HH:MM’te kasaya gönderildi" diyor; kuyruğa düşen bir
    // adisyona saat damgası basmak, gitmiş gibi göstermek olurdu.
    assert.match(kumanda, /if \(result\.state === 'sent'\) setSentAt\(clockOf\(Date\.now\(\)\)\);/);
});

test('bağlantı GERÇEK kaynaktan okunuyor', () => {
    assert.match(kumanda, /const \{ offline, queued: queueLength \} = useConnectivity\(\);/);
    assert.match(kumanda, /\}, \[send, offline, base\?\.id\]\)/,
        'bağlantı değişimi karara girmeli');
});

test('ekran hata KODUNU gösteriyor, sabit cümleyi değil', () => {
    assert.doesNotMatch(kumanda, /errorWord=\{errorLine\(null\)\}/);
    assert.match(kumanda, /errorWord=\{errorLine\(sendCode\)\}/);
});

test('randevu değişince hata kodu da SIFIRLANIYOR', () => {
    // Kalırsa bir sonraki randevu önceki randevunun hatasını gösterirdi.
    assert.match(kumanda, /setSend\('idle'\);\s*setSendCode\(null\);/);
});
