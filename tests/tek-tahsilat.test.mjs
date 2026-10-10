import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
    COLLECT_METHODS,
    collectErrorLine,
    collectLabel,
    collectRetryLabel,
} from '../mobile/src/lib/collect.ts';

/**
 * TAHSİLAT (108 · v4 K3/K4) — kumandanın son adımı tek kişilik modda.
 *
 * Para yazan bir akış. Buradaki testler iki şeyi kolluyor: ekranın söylediği
 * ile sunucunun yazdığının aynı olması, ve iki farklı başarısızlığın aynı
 * cümleyle anlatılmaması.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fn = read('supabase/functions/staff-api/index.ts');
const client = read('mobile/src/api/staff.ts');

const endpoint = (() => {
    const start = fn.indexOf("if (action === 'visit.collect')");
    assert.ok(start > 0, 'visit.collect ucu yok');
    const end = fn.indexOf("if (action === 'catalog')", start);
    assert.ok(end > start);
    return fn.slice(start, end);
})();

// ── Düğmenin yazısı ─────────────────────────────────────────────────────────

test('düğme YÖNTEMLE BİRLİKTE adlanıyor', () => {
    // "Tahsil et" tek başına ne yapacağını söylemiyor; hangi yoldan para
    // alındığı kaydın kendisi kadar önemli ve dokunmadan ÖNCE görünmeli.
    assert.deepEqual(collectLabel('cash'), { label: 'Nakit tahsil et', enabled: true });
    assert.deepEqual(collectLabel('card'), { label: 'Kartla tahsil et', enabled: true });
    assert.deepEqual(collectLabel('transfer'), { label: 'Havaleyle tahsil et', enabled: true });
});

test('yöntem seçilmeden düğme KAPALI', () => {
    // Varsayılan bir yöntem koymak, nakit alınan işi karta yazmanın en kolay
    // yolu olurdu.
    assert.deepEqual(collectLabel(null), { label: 'Ödeme yöntemini seçin', enabled: false });
});

test('yöntemler Kasa ile aynı üçlü', () => {
    assert.deepEqual(COLLECT_METHODS.map((m) => m.key), ['cash', 'card', 'transfer']);
    assert.deepEqual(COLLECT_METHODS.map((m) => m.label), ['Nakit', 'Kart', 'Havale']);
});

// ── İki farklı başarısızlık ─────────────────────────────────────────────────

test('gönderim düştüyse "kasaya bir şey yazılmadı" — ve bu DOĞRU', () => {
    assert.equal(
        collectErrorLine('send_failed', 'offline'),
        'Tahsilat kaydedilmedi: bağlantı yok. Kasaya bir şey yazılmadı.',
    );
});

test('tahsilat düştüyse AYNI cümle yazılmıyor — adisyon kasada AÇIK', () => {
    /*
     * Gönderim geçip tahsilat düştüyse Kasa'da bir şey VAR: kapanmış ama
     * ödenmemiş bir adisyon. "Kasaya bir şey yazılmadı" demek orada yalan
     * olurdu ve kullanıcı parayı ikinci kez almaya kalkardı.
     */
    const line = collectErrorLine('collect_failed', 'offline');
    assert.match(line, /bağlantı yok/);
    assert.match(line, /Adisyon kasada açık kaldı/);
    assert.doesNotMatch(line, /bir şey yazılmadı/);
});

test('sıfır tutarda "tekrar dene" DENMİYOR', () => {
    // Aynı sonuç çıkar; söylenmesi gereken şey eksiğin ne olduğu.
    const line = collectErrorLine('send_failed', 'zero_amount');
    assert.match(line, /Hizmetin fiyatı yazılmamış ya da adisyon boş/);
    assert.doesNotMatch(line, /Kasaya bir şey yazılmadı/);
});

test('hata yokken satır HİÇ çizilmiyor', () => {
    for (const stage of ['idle', 'sending', 'done', 'pending']) {
        assert.equal(collectErrorLine(stage, 'offline'), null, stage);
    }
});

test('yeniden denemede düğme ne yapacağını söylemeye DEVAM ediyor', () => {
    assert.equal(collectRetryLabel('collect_failed', 'card'), 'Tekrar dene · kartla tahsil et');
    // Yöntem seçilmemişse "tekrar dene" yazmıyor: denenecek bir şey yok.
    assert.equal(collectRetryLabel('send_failed', null), 'Ödeme yöntemini seçin');
    assert.equal(collectRetryLabel('idle', 'card'), 'Kartla tahsil et');
});

// ── Sunucu ──────────────────────────────────────────────────────────────────

test('TUTARI SUNUCU hesaplıyor — istemci rakam göndermiyor', () => {
    /*
     * Tutarı gövdeden almak, telefona "bu işin kaç lira olduğuna sen karar
     * ver" demekti; ele geçmiş bir jetonla kasaya istenen rakam yazılabilirdi.
     */
    assert.doesNotMatch(endpoint, /body\.amount/);
    assert.match(endpoint, /const amount = Math\.round\(\(serviceAmount \+ itemsAmount\) \* 100\) \/ 100;/);
    assert.doesNotMatch(client, /visitCollect:[\s\S]{0,400}amount/);
});

test('adisyon FİYAT × ADET toplanıyor — ekranda görünen (kullanıcı kararı)', () => {
    // `AdisyonRow` satırı `price * qty` çiziyor; gösterilen neyse o tahsil
    // edilmeli. Masaüstünün Kasa hareket satırı bugün çarpmıyor ve o ayrışma
    // onun kendi borcu.
    assert.match(endpoint, /\(Number\(item\?\.price\) \|\| 0\) \* \(Number\(item\?\.qty\) \|\| 1\)/);
});

test('İŞ BİTMEDEN para alınmıyor', () => {
    // Süren bir işin tutarı henüz belli değil: kalem eklenebilir.
    assert.match(endpoint, /if \(res!\.status !== 'completed'\) return json\(\{ error: 'not_finished' \}, 409\);/);
});

test('İKİ KEZ tahsil edilmiyor — iki ayrı kapı', () => {
    /*
     * İdempotens kütüğü aynı ANAHTARIN tekrarını yakalıyor. Ama kullanıcı
     * ekranı kapatıp yeniden açar ve bir daha dokunursa anahtar yeni olur —
     * o yüzden randevunun var olan tahsilatı ayrıca sorgulanıyor.
     */
    assert.match(endpoint, /\.eq\('reservation_id', res!\.id\)/);
    assert.match(endpoint, /if \(existing\) \{\s*return await done\(\{ ok: true, alreadyCollected: true/);
    assert.match(fn, /'visit\.collect',\n\s*\]\);/, 'idempotens listesine girmemiş');
});

test('SIFIR tutar kaydı AÇILMIYOR', () => {
    // Bir tahsilat sıfır lira olamaz (`cash.ts` · `parseAmount` aynı kural).
    assert.match(endpoint, /if \(!\(amount > 0\)\) return json\(\{ error: 'zero_amount' \}, 409\);/);
});

test('para kaydı ÖNCE, bayrak sonra', () => {
    /*
     * `is_paid` para kaydının türevi. Tersi sırada bayrak basılıp kayıt
     * düşebilir ve Kasa, tahsil edilmiş görünen ama parası olmayan bir
     * randevu gösterirdi. Bayrak hatası isteği düşürmüyor.
     */
    assert.ok(
        endpoint.indexOf("from('payments').insert") < endpoint.indexOf('is_paid: true'),
        'bayrak para kaydından önce basılıyor',
    );
    assert.match(endpoint, /if \(flagErr\) console\.error\('visit\.collect is_paid', flagErr\);/);
});

test('tahsilat çevrimdışı KUYRUĞA GİRMİYOR', () => {
    /*
     * `write` başarısız yazmayı kuyruğa alıp saatler sonra boşaltıyor. Para
     * için yanlış: kullanıcı "olmadı" görüp nakit alır, akşam kuyruk boşalır
     * ve kasada ikinci bir kart tahsilatı belirir.
     */
    const block = client.slice(client.indexOf('visitCollect:'), client.indexOf('visitNote:'));
    assert.match(block, /call\('visit\.collect'/);
    assert.doesNotMatch(block, /write\('visit\.collect'/);
    // Kuyruk yok ama iki kez dokunma var.
    assert.match(block, /idempotencyKey/);
});

test('denetim olayı kısıta UYGUN', () => {
    // 110 kısıtı genişletti; supabase-js `insert()` fırlatmadığı için listede
    // olmayan bir ad sessizce düşerdi — ve düşen şey bir para kaydının izi.
    assert.match(endpoint, /audit\(me\.organization_id, me\.id, 'visit\.collect', method\)/);
    assert.match(read('supabase/110_staff_auth_log_tahsilat.sql'), /'visit\.collect'/);
});
