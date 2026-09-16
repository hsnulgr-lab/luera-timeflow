import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sendOutcome, queuedBandLabel, errorLine } from '../mobile/src/lib/sendToCash.ts';

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

test('sunucunun hayırı personelin diline çevriliyor', () => {
    // Sahte cevap üreteci (`mockCash`) KALKTI: sonuç artık gerçek yazmadan
    // geliyor. Çeviri tablosu kaldı ve genişledi.
    assert.equal(errorLine('already_open'), 'Kasadaki adisyon açıldı');
    assert.equal(errorLine('already_finished'), 'Bu ziyaret kasada zaten kapandı');
    assert.equal(errorLine('forbidden'), 'Bu adisyonu gönderme yetkiniz yok');
    // İyimser kilit: kullanıcı SUÇLANMIYOR, ne yapacağı söyleniyor.
    assert.equal(errorLine('items_stale'), 'Adisyon başka bir cihazda değişti');
    assert.equal(errorLine('items_unsendable'), 'Bir kalem gönderilemiyor · listeyi tazeleyin');
    // Vana kapalıyken gelen cevap da kendi cümlesini alıyor.
    assert.equal(errorLine('writes_disabled'), 'Telefondan gönderim şu an kapalı');
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('ekran ARTIK koşulsuz gönderildi yazmıyor', () => {
    assert.doesNotMatch(kumanda, /setSentAt\(clockOf\(Date\.now\(\)\)\);\s*setSend\('sent'\);/,
        'koşulsuz sent — düzeltilen davranış');
    // Kilit damgası TÜRETİLMİŞ olan: kendi başlatmamızın damgasına takılmıyor.
    assert.match(kumanda, /sendVisitToCash\(base\.id, lines, lockStamp\)/);
    // Kuyruk KARARI yazma katmanından geliyor, bağlantı bayrağından değil:
    // sinyal "var" görünürken de istek düşebiliyor.
    assert.match(kumanda, /offline: offlineRef\.current \|\| out\.queued,/);
    assert.match(kumanda, /serverCode: out\.code,/);
    assert.match(kumanda, /setSend\(result\.state\)/);
});

test('damga YALNIZ gerçekten gidince atılıyor', () => {
    // `sealed` başlığı "HH:MM’te kasaya gönderildi" diyor; kuyruğa düşen bir
    // adisyona saat damgası basmak, gitmiş gibi göstermek olurdu.
    assert.match(kumanda, /if \(result\.state === 'sent'\) setSentAt\(clockOf\(Date\.now\(\)\)\);/);
});

test('bağlantı GERÇEK kaynaktan okunuyor', () => {
    assert.match(kumanda, /const \{ offline, queued: queueLength \} = useConnectivity\(\);/);
    /*
     * Bağlantı karara GİRİYOR ama etkinin BAĞIMLILIĞI OLARAK DEĞİL.
     *
     * Bu test eskiden `[send, offline, base?.id]` bağımlılığını ZORUNLU
     * kılıyordu ("bağlantı değişimi karara girmeli"). Zayıf sinyalde iOS ağ
     * durumunu istek sürerken değiştiriyor; etki yeniden çalışıp adisyonu
     * İKİNCİ KEZ gönderiyordu (telefonda bulundu, 2026-09-15). Test hatanın
     * sebebini koruyordu. Bağlantı artık referanstan okunuyor.
     */
    assert.match(kumanda, /\}, \[send, base\?\.id\]\)/);
    assert.match(kumanda, /useEffect\(\(\) => \{ offlineRef\.current = offline; \}, \[offline\]\);/);
});

test('ekran hata KODUNU gösteriyor, sabit cümleyi değil', () => {
    assert.doesNotMatch(kumanda, /errorWord=\{errorLine\(null\)\}/);
    assert.match(kumanda, /errorWord=\{errorLine\(sendCode\)\}/);
});

test('randevu değişince hata kodu da SIFIRLANIYOR', () => {
    // Kalırsa bir sonraki randevu önceki randevunun hatasını gösterirdi.
    assert.match(kumanda, /setSend\('idle'\);\s*setSendCode\(null\);/);
});
