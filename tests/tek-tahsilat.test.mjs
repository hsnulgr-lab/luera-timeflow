import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
    COLLECT_METHODS,
    collectErrorLine,
    collectLabel,
    collectRetryLabel,
    collectDial,
    collectView,
    collectedLabel,
} from '../mobile/src/lib/collect.ts';
import { serviceCharge } from '../mobile/src/lib/cashBuild.ts';
import { SEAL_MS, barFoot, barTitle } from '../mobile/src/lib/sendToCash.ts';

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
    // Kümenin SON elemanı olması gerekmiyor (112 ardından `visit.wait`i ekledi);
    // gereken, kümenin içinde olması.
    const gate = fn.slice(fn.indexOf('const WRITE_ACTIONS'), fn.indexOf(']);', fn.indexOf('const WRITE_ACTIONS')));
    assert.match(gate, /'visit\.collect',/, 'idempotens listesine girmemiş');
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

// ── Kumandadaki yer ─────────────────────────────────────────────────────────

const kumanda = read('mobile/app/(staff-flow)/kumanda.tsx');

test('tahsilat güvertesi YALNIZ tek kişilik modda', () => {
    // Ekip modunda son adım "Adisyonu kasaya gönder" olarak kalıyor: orada
    // parayı başkası alıyor ve personelin kasaya erişimi yok.
    assert.match(kumanda, /params\.from === 'tek' \? \(\s*<CollectBar/);
    assert.match(kumanda, /\) : phase === 'closing' \|\| phase === 'closed' \? \(\s*<SendToCash/);
});

test('tahsilat GÖNDERİMDEN SONRA — sıra zorunlu', () => {
    /*
     * `visit.collect` sunucuda `status = 'completed'` istiyor ve randevuyu
     * kapatan şey gönderimin içindeki `visit.finish`. Tersi sırada sunucu
     * `not_finished` derdi.
     */
    const effect = kumanda.slice(
        kumanda.indexOf("if (collectStage !== 'sending'"),
        kumanda.indexOf('}, [collectStage, send, sendCode'),
    );
    assert.match(effect, /if \(send === 'going' \|\| send === 'window'\) return undefined;/);
    assert.match(effect, /if \(send !== 'sent' && send !== 'sealed'\) \{/);
});

test('KUYRUĞA GİREN gönderim "olmuş" sayılmıyor', () => {
    // İş telefonun kuyruğunda, sunucuda değil. Üstüne para kaydı atmak,
    // olmamış bir kapanışın parasını yazmaktı.
    assert.match(kumanda, /send === 'queued' \? 'offline' : null/);
});

test('tahsilat isteği TEK kez gidiyor', () => {
    // Etki `send` değiştikçe yeniden koşuyor; koruma olmadan ikinci bir para
    // kaydı yazılabilirdi.
    assert.match(kumanda, /if \(collectingRef\.current\) return undefined;\s*collectingRef\.current = true;/);
});

test('GERİ ALINAN tahsilattan sonra aynı yöntemle yeniden tahsil kasaya YAZIYOR', () => {
    /*
     * Telefonda bulundu (2026-10-13): Elif Demir kartla tahsil edildi, Kasa'da
     * geri alındı, kumandada yine KARTLA tahsil edildi → ekran "Kartla tahsil
     * edildi", Kasa ve Gün "adisyon açık". Anahtar randevu + yöntemdi; sunucu
     * idempotens kütüğünde ilk tahsilatın cevabını bulup hiçbir şey yazmadan
     * onu dönüyordu.
     *
     * Kural: anahtar DOKUNUŞA ait. Aynı dokunuşun tekrarı aynı anahtar, yeni
     * dokunuş yeni anahtar; ikinci para kaydını sunucunun canlı tahsilat
     * sorgusu engelliyor (geri alınmışı saymıyor).
     */
    const block = client.slice(client.indexOf('visitCollect:'), client.indexOf('visitNote:'));
    const key = block.match(/idempotencyKey: `([^`]*)`/);
    assert.ok(key, 'tahsilatın anahtarı yok');
    assert.match(key[1], /\$\{attempt\}/, 'anahtar dokunuşu taşımıyor — geri alınan tahsilatın cevabı geri gelir');
    assert.notEqual(key[1], 'visit.collect:${reservationId}:${method}');

    // Dokunuş kimliği DOKUNUŞTA basılıyor — etkide değil (etki yeniden koşar).
    assert.match(kumanda, /onCollect=\{\(\) => \{\s*collectAttemptRef\.current = String\(Date\.now\(\)\);/);
    assert.match(kumanda, /api\.visitCollect\(base\.id, collectMethod, collectAttemptRef\.current\)/);
    assert.doesNotMatch(kumanda, /collectAttemptRef\.current = [^;]*;[\s\S]{0,40}api\.visitCollect/);

    // Sunucunun ikinci kapısı geri alınmışı "zaten alındı" saymıyor.
    assert.match(endpoint, /\.is\('voided_at', null\)/);
});

test('İKİNCİ bir gönderim yolu YAZILMADI', () => {
    /*
     * Var olan yol iyimser kilidi, kuyruğu, "zaten kapandı" dalını ve
     * tek-uçuş korumasını yıllarca biriktirdi. İkisi de aynı makineyi
     * kullanıyor; "Sonra tahsil et" yalnız sonrasını atlıyor.
     */
    assert.equal((kumanda.match(/sendVisitToCash\(/g) ?? []).length, 1);
    assert.match(kumanda, /onLater=\{\(\) => \{[\s\S]{0,220}setCollectStage\('pending'\)/);
});

// ── Güverte tam genişlik + kayan seçim (2026-10-13, telefon) ────────────────
//
// Telefonda seçici ve "… tahsil et" yazısı kadar daralıyor, her seçimde boy
// değiştiriyordu; "Kartla tahsil et" kenara yapışıyor, koyu temada seçili
// yöntem görünmüyordu. Sebep: kumandanın eylem bölgesi ortalıyor ve güverte
// genişliğini istemiyordu.

test('tahsilat güvertesi tam genişlik — ortalayan eylem bölgesinde daralmıyor', () => {
    const bar = read('mobile/src/components/CollectBar.tsx').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    const kumanda = read('mobile/app/(staff-flow)/kumanda.tsx');
    // Eylem bölgesi ortalıyor…
    assert.match(kumanda, /alignItems: 'center',\s*gap: 11,\s*marginHorizontal: 12,/);
    // …güverte kendini yayıyor ve kendi kenar payını EKLEMİYOR (bölge zaten 12 pt içeride; tasarım 11).
    assert.match(bar, /<View style=\{\{\s*alignSelf: 'stretch',\s*marginTop: 'auto',/);
    assert.doesNotMatch(bar, /paddingHorizontal: M\.collectPadX/);
    // `.kbtn` width:100% — düğme güvertenin genişliğinde.
    const v4 = read('docs/design-reference/Luera Mobil - Tek Kisilik v4.html');
    assert.ok(v4.includes('.kbtn{height:59px;border-radius:26px;background:var(--or);color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;font-size:19px;font-weight:800;letter-spacing:-.02em;width:100%}'));
    assert.ok(v4.includes('.seg button{flex:1;height:38px;'));
});

test('seçili yöntemin zemini tek parça ve kayıyor; ilk seçimde yerinde beliriyor', () => {
    const bar = read('mobile/src/components/CollectBar.tsx').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    // Zemin yöntemlerin altında tek bir parça; düğmelerin kendi zemini yok.
    assert.match(bar, /<Animated\.View\s+pointerEvents="none"/);
    assert.doesNotMatch(bar, /backgroundColor: on \? c\.card : 'transparent'/);
    // Yalnız translateX, native sürücü, uygulamanın yayı.
    assert.match(bar, /Animated\.spring\(slide, \{ toValue: index, useNativeDriver: true, \.\.\.M\.segSpring \}\)/);
    // İlk seçim ve "hareketi azalt": kayış yok, anlık.
    assert.match(bar, /if \(reduceMotion \|\| !had\.current\) \{\s*had\.current = true;\s*slide\.setValue\(index\);\s*shown\.setValue\(1\);/);
    // Seçim yokken zemin yok — varsayılan vurgu da yok.
    assert.match(bar, /if \(index < 0\) \{\s*had\.current = false;\s*shown\.setValue\(0\);/);
    // Koyu temada seçim görünür: tasarımın kendi koyu seçicisi.
    assert.match(bar, /backgroundColor: dark \? M\.segOnDark : c\.card,/);
    const v4 = read('docs/design-reference/Luera Mobil - Tek Kisilik v4.html');
    assert.ok(v4.includes('.isl .seg button.on{background:rgba(243,237,227,.13)'));
});

// ── Tahsil edildi — personel kumandasındaki gibi (2026-10-13, telefon) ──────
//
// Tahsilat bitince düğme hâlâ "Kartla tahsil et" diyordu; tahsil edilmiş bir
// ziyarette kumanda yeniden açılınca da öyle: aynı parayı ikinci kez almaya
// davet eden etkin bir düğme.

test('güvertenin hâli: seç → yeşil dolgu → kalıcı kayıt; sunucu "ödendi" derse doğrudan kayıt', () => {
    // Bu oturumda tahsil edildi: önce dolgu, SEAL_MS sonra kayıt.
    assert.equal(collectView('done', false, false), 'collected');
    assert.equal(collectView('done', true, false), 'collected');
    assert.equal(collectView('done', true, true), 'paid');
    // Yeniden açılış: yerel hâl `idle`, sunucu "ödendi" → düğme YOK.
    assert.equal(collectView('idle', true, false), 'paid');
    assert.equal(collectView('pending', true, false), 'paid');
    // İstek yoldayken sunucunun eski kopyası denemeyi silmiyor.
    assert.equal(collectView('sending', true, false), 'pick');
    // Ödenmemiş: seçim. Kasada açık adisyon da (atcash) tahsil edilebilir.
    for (const stage of ['idle', 'pending', 'send_failed', 'collect_failed']) {
        assert.equal(collectView(stage, false, false), 'pick');
    }
    // Personel kumandasıyla aynı süre ve aynı kelimeler.
    assert.equal(SEAL_MS, 2600);
    assert.equal(barTitle('paid'), 'Tahsil edildi');
    assert.equal(barFoot('paid'), 'Tahsilat tamamlandı ve adisyon kapandı.');
});

test('yeşil dolgu yöntemi söylüyor — düğmenin kendi kelimesiyle', () => {
    assert.equal(collectedLabel('cash'), 'Nakit tahsil edildi');
    assert.equal(collectedLabel('card'), 'Kartla tahsil edildi');
    assert.equal(collectedLabel('transfer'), 'Havaleyle tahsil edildi');
    assert.equal(collectedLabel(null), 'Tahsil edildi');
});

test('çubuk sunucunun "ödendi"sini alıyor; dolgu bir opaklık, vurgu bir ölçek', () => {
    const kumanda = read('mobile/app/(staff-flow)/kumanda.tsx');
    assert.match(kumanda, /<CollectBar[\s\S]{0,260}paid=\{closedCard === 'paid'\}/);
    const bar = read('mobile/src/components/CollectBar.tsx').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    // Kalıcı kayıtta düğme yok.
    assert.match(bar, /if \(view === 'paid'\) return <PaidPlate appear=\{settled && !reduceMotion\} \/>;/);
    const plate = bar.slice(bar.indexOf('function PaidPlate'));
    assert.doesNotMatch(plate, /<Pressable/);
    assert.match(plate, /\{barTitle\('paid'\)\}/);
    // Dolguda düğme kapalı; yeşil turuncunun üstünde opaklıkla beliriyor.
    assert.match(bar, /disabled=\{!enabled \|\| busy \|\| collected\}/);
    assert.match(bar, /backgroundColor: c\.gr,\s*opacity: fill,/);
    assert.match(bar, /Animated\.spring\(pop, \{ toValue: 1\.03, useNativeDriver: true, \.\.\.M\.paidPop \}\)/);
    // Seçici solar ama yerinde durur; "Sonra tahsil et"in yeri boş kalır — düğme kaymaz.
    assert.match(bar, /opacity: fill\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[1, 0\] \}\)/);
    assert.match(bar, /\) : collected \? \(\s*<View style=\{\{ height: M\.ghostHeight \}\} \/>/);
    // Hareketi azalt: vurgu yok, dolgu anında.
    assert.match(bar, /if \(reduceMotion\) \{\s*fill\.setValue\(1\);\s*return;\s*\}/);
});

// ── Kapanış kadranı: tek kişilikte TAHSİL EDİLECEK toplam ──────────────────

test('kadran tek kişilikte hizmet ücreti + adisyonu gösteriyor — kasaya yazılanla aynı', () => {
    /*
     * Telefonda bulundu (2026-10-13): Elif Demir · Manikür & Pedikür + Ağda.
     * Kadran "₺900 · 1 kalem" diyordu (yalnız Ağda); sunucu hizmet ücretini
     * ekleyip ₺1.650 tahsil etti, Gün ve Kasa da ₺1.650 diyordu.
     */
    assert.deepEqual(
        collectDial({ itemsTotal: 900, itemCount: 1, service: { amount: 750, count: 1 } }),
        { total: 1650, count: 2 },
    );
    // Ekipte (ya da ücret okunamadıysa) kadran adisyonun kendisi.
    assert.deepEqual(collectDial({ itemsTotal: 900, itemCount: 1, service: null }), { total: 900, count: 1 });
    // Adisyon boşken hizmetin kendisi.
    assert.deepEqual(
        collectDial({ itemsTotal: 0, itemCount: 0, service: { amount: 1200, count: 2 } }),
        { total: 1200, count: 2 },
    );
    // Kuruş: sunucunun yuvarlamasıyla aynı.
    assert.equal(collectDial({ itemsTotal: 0.1, itemCount: 1, service: { amount: 0.2, count: 1 } }).total, 0.3);
});

test('hizmet ücreti SUNUCUNUN kuralıyla: kaydın fiyatı → kimlik → ad; birleşik ad bölünüyor', () => {
    const services = [
        { id: 's1', name: 'Manikür & Pedikür', price: 750 },
        { id: 's2', name: 'Kaş', price: 300 },
        { id: 's3', name: 'Cilt bakımı', price: 1200 },
    ];
    assert.deepEqual(serviceCharge({ service: 'Manikür & Pedikür', custom_fields: null }, services),
        { amount: 750, count: 1 });
    assert.deepEqual(serviceCharge({ service: 'Kaş + Cilt bakımı', custom_fields: null }, services),
        { amount: 1500, count: 2 });
    // Kaydın kendi fiyatı katalogdan önce gelir; fiyatsız satır kimlikten.
    const hizmetler = JSON.stringify([{ name: 'Kaş', price: 250 }, { id: 's3', name: 'Cilt' }]);
    assert.deepEqual(serviceCharge({ service: 'Kaş + Cilt', custom_fields: { hizmetler } }, services),
        { amount: 1450, count: 2 });

    // Sunucu aynı sırayı izliyor — kural iki yerde ayrışmasın.
    assert.match(endpoint, /if \(typeof line\.price === 'number'\)/);
    assert.match(endpoint, /services\.find\(\(row\) => row\.id === line\.id\)/);
    assert.match(endpoint, /String\(res!\.service \?\? ''\)\.split\(' \+ '\)/);
    // Adisyon fiyat × adet — kumandanın `totalOf`u da çarpıyor.
    assert.match(endpoint, /\(Number\(item\?\.price\) \|\| 0\) \* \(Number\(item\?\.qty\) \|\| 1\)/);
});

test('kumanda kadranı YALNIZ tek kişilikte hizmet ücretini okuyor', () => {
    assert.match(kumanda, /const solo = params\.from === 'tek';/);
    assert.match(kumanda, /if \(!solo \|\| !appointment\?\.id\) return undefined;/);
    assert.match(kumanda, /fetchServiceCharge\(appointment\.id\)/);
    assert.match(kumanda, /service: solo \? serviceCharge : null,/);
    assert.match(kumanda, /<ClosingDial\s+total=\{closing\.total\}\s+count=\{closing\.count\}/);
    // Kanca erken dönüşün ÜSTÜNDE.
    assert.ok(kumanda.indexOf('fetchServiceCharge(appointment.id)') < kumanda.indexOf('if (!appointment) {'));
});
