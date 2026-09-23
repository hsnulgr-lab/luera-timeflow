import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    LOCAL_CARD_FIELDS, NUDGE_LABEL, STAFF_NUDGE_READY, applyNudgeResult,
    applyWaitAction, isNudgeLabel, mergeLocal, nudgeLabel, pillRecordOf, waitCard,
} from '../mobile/src/lib/managerFlow.ts';
import { cellSpec, pillCells, staffRecord } from '../mobile/src/lib/actionPill.ts';

/**
 * "PERSONELE SÖYLE" — müdürden personele kasıtlı bildirim (2026-09-24).
 *
 * Bu düğme iki yerde duruyordu ve ikisi de BOŞTU: basınca yalnız telefonda
 * bir damga kalıyor, personele hiçbir şey gitmiyordu. Biri (`inf` gözü)
 * görünürdü ve teslimat SÖZÜ VERMEMEK için açıklaması özenle "kartta kayıt
 * kalır" diyordu; öteki (bekleme kartı) `STAFF_NUDGE_READY` ile gizlenmişti.
 *
 * Bayrağın kabul ölçütü dosyada yazılıydı: "bildirimin personelin telefonuna
 * GERÇEKTEN ulaştığı kanıtlanmalı". Bu dosya, kanal kurulduktan sonra o sözün
 * tutulduğunu kilitler.
 *
 * Korunan iki şey:
 *   • METNİ SUNUCU KURAR — telefon yalnız hangi randevu olduğunu söyler.
 *   • DAMGA GÖNDERİM TUTARSA BASILIR — tersi, düğmenin gizlendiği günkü
 *     hatanın aynısı olurdu.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const fn = read('supabase/functions/staff-nudge/index.ts');
const write = code(read('mobile/src/lib/managerWrite.ts'));
const screen = code(read('mobile/app/mudur/index.tsx'));

const base = {
    id: 'w', time: '11:30', kind: 'arrived',
    firstName: 'Elif', lastName: 'Demir',
    detail: 'Keratin bakımı · 45 dk · Selin ile',
    staffId: 'selin', staffName: 'Selin',
};

// ── Kanal gerçekten var ─────────────────────────────────────────────────────

test('bayrak AÇIK ve düğme uzun beklemede çiziliyor', () => {
    assert.equal(STAFF_NUDGE_READY, true);
    assert.deepEqual(waitCard({ ...base, waitMinutes: 12 }, []).actions,
        [{ label: 'Personele söyle', kind: 'fill' }]);
});

test('hap gözü artık TESLİMAT SÖYLÜYOR — çünkü teslimat var', () => {
    /*
     * Eski açıklama "kartta kayıt kalır" idi ve o gün DOĞRUYDU: kanal yoktu.
     * Kanal olmadan "bildirim gider" yazmak, ekranın söyleyebileceği en
     * sessiz yalan olurdu. Şimdi tersi geçerli.
     */
    assert.match(cellSpec('inf').hint, /bildirim gider/);
    assert.match(cellSpec('inf', 'Selin').hint, /Selin’e bildirim gider/);
});

test('göz yeri değişmedi — hapın sırası sabit', () => {
    // Kas hafızası: kanal eklenmesi düğmenin yerini oynatmamalı.
    const cells = pillCells({ customerPhone: '0532 118 24 06', canDrop: true, canTellStaff: true });
    assert.deepEqual(cells, ['ara', 'wa', 'nox', 'inf']);
});

// ── Sunucu: kimlik ve sahiplik ──────────────────────────────────────────────

test('kimlik JETONDAN çözülüyor, gövdeden DEĞİL', () => {
    /*
     * `organization_id`yi gövdeden alsaydık, org kimliğini bilen biri başka
     * bir salonun personeline bildirim gönderebilirdi. `identify` orgu
     * `organization_members`tan okuyor.
     */
    assert.match(fn, /import \{ deny, identify \} from '\.\.\/_shared\/auth\.ts'/);
    assert.match(fn, /const caller = await identify\(admin, req\)/);
    assert.match(fn, /if \(caller\.kind !== 'user'\) return deny\(401/);
    // Gövdeden YALNIZ bu ikisi okunuyor.
    assert.match(fn, /const \{ reservationId, kind \} = await req\.json\(\)/);
    assert.doesNotMatch(code(fn), /body\.organization_id|body\.staffId|body\.title/);
});

test('BAŞKA SALONUN randevusu 404 — 403 değil', () => {
    /*
     * 403 "böyle bir randevu VAR ama senin değil" demektir ve bir salonun
     * randevu kimliklerini yoklamaya izin verirdi. Yokluk ile yetkisizlik
     * dışarıdan ayırt edilememeli.
     */
    assert.match(fn, /res\.organization_id !== caller\.orgId\) return json\(\{ error: 'not_found' \}, 404\)/);
});

test('hedef personel VERİTABANINDAN, gövdeden gelen bir kimlik değil', () => {
    assert.match(fn, /target: \{ staffId: res\.staff_id \}/);
    // Personeli olmayan randevu başarı sayılmıyor.
    assert.match(fn, /if \(!res\.staff_id\) return json\(\{ sent: 0, note: 'no_staff' \}, 200\)/);
});

// ── Metin ───────────────────────────────────────────────────────────────────

test('her başlık MÜDÜR: ile başlıyor', () => {
    /*
     * Önek olmasa personel aynı haberi ikinci kez görüp "niye tekrar geldi"
     * derdi. Bu uç yeni bir olay duyurmuyor; müdürün KAÇIRILDIĞINI düşündüğü
     * bir kartı kasten yeniden gönderiyor ve personel bunu anlamalı.
     */
    const titles = [...fn.matchAll(/^\s{4}\w+: '([^']+)',$/gm)].map((m) => m[1]);
    assert.ok(titles.length >= 9, `başlık sayısı: ${titles.length}`);
    for (const title of titles) assert.match(title, /^Müdür: /, title);
});

test('durumu olan kart DURUMU, olmayan kart ÇAĞRIYI söylüyor', () => {
    // Beşinde personel telefona bakınca ne olduğunu anlıyor — düğmenin bütün
    // amacı uygulamayı açtırmamak.
    assert.match(fn, /next: 'Müdür: Müşterin geliyor'/);
    assert.match(fn, /arrived: 'Müdür: Müşterin bekliyor'/);
    assert.match(fn, /cancelled: 'Müdür: Randevun iptal oldu'/);
    assert.match(fn, /noshow: 'Müdür: Müşteri gelmedi'/);
    assert.match(fn, /booked: 'Müdür: Yeni randevun var'/);
    // Dördünde söylenecek yeni bir şey yok: personel ya müşterinin yanında ya
    // da işi bitmiş. Kartın durumunu tekrar etmek, bildiği şeyi haber gibi
    // sunmak olurdu.
    for (const kind of ['started', 'finished', 'due', 'paid']) {
        assert.match(fn, new RegExp(`${kind}: 'Müdür: Seni çağırıyor'`), kind);
    }
});

test('tanınmayan kart türü GÖNDERMİYOR', () => {
    // Uydurma bir başlık üretmektense hiç göndermemek.
    assert.match(fn, /if \(!title\) return json\(\{ error: 'unknown_kind' \}, 400\)/);
});

test('gövde YALNIZ İLK ADI yazıyor (104)', () => {
    /*
     * Salonda telefon tezgâhta duruyor ve kilit ekranı herkese açık. Kural
     * tetikleyicilerde vardı; yeni bir gönderim yolu açarken orada da
     * olmalı, yoksa kural bir delikten sızar.
     */
    assert.match(fn, /\(res\.customer_name \|\| ''\)\.trim\(\)\.split\(' '\)\[0\]/);
    assert.doesNotMatch(code(fn), /res\.customer_name \|\| 'Müşteri'/);
});

test('bekleyen müşteride DAKİKA yazıyor, hizmet adı değil', () => {
    // Personelin karar vermesi gereken şey "ne kadar gecikti".
    assert.match(fn, /dakikadır bekliyor/);
    assert.match(fn, /res\.customer_arrived_at/);
});

test('PERSONEL hedefi pref TAŞIMIYOR', () => {
    /*
     * Tercih kapısı (105/106) yalnız müdür olaylarında çalışıyor. Buraya bir
     * `pref` koymak, müdürün kendi anahtarıyla PERSONELİN bildirimini
     * susturması demekti.
     */
    // Yorumlar ayıklanıyor: `pref` KELİMESİ burada bilerek açıklanıyor,
    // yasak olan şey gövdeye bir ALAN olarak girmesi.
    const bare = code(fn);
    const body = bare.slice(bare.indexOf('body: JSON.stringify'));
    assert.doesNotMatch(body, /pref/);
});

// ── Dürüstlük: damga gönderim tuttuysa ──────────────────────────────────────

test('DAMGA YALNIZ GÖNDERİM TUTARSA BASILIYOR', () => {
    /*
     * Bu dosyanın en önemli iddiası ve artık saf fonksiyon çalıştırılarak
     * kanıtlanıyor. Damgayı basan tek yer `applyNudgeResult` ve o da yalnız
     * `ok` hâlinde basıyor — gitmemiş bir bildirimi "söylendi" diye göstermek,
     * düğmenin gizlendiği günkü hatanın aynısı olurdu.
     */
    const waiting = { ...base, waitMinutes: 12 };
    assert.equal(applyNudgeResult(waiting, 'ok').remindedAt, 12);
    for (const bad of ['failed', 'no_staff']) {
        const after = applyNudgeResult(waiting, bad);
        assert.equal(after.remindedAt, undefined, bad);
        assert.equal(after.nudgeResult, bad, bad);
    }
    // Hap yüzeyinde damga `actedCell`; orada da aynı kural.
    const card = { ...base, kind: 'next', etaMinutes: -4 };
    assert.equal(applyNudgeResult(card, 'ok').actedCell, 'inf');
    assert.equal(applyNudgeResult(card, 'failed').actedCell, undefined);
    assert.match(screen, /replace\(event\.id, applyNudgeResult\(next, result\)\)/);
});

test('tutmayan gönderim KARTIN ÜSTÜNDE — ekranın tepesinde değil', () => {
    /*
     * İlk kurgu uyarıyı listenin başına koymuştu ve telefonda görünmüyordu:
     * müdür aşağıdaki bir karta basıyor, uyarı yukarıda çiziliyordu. Basılan
     * kartın kendi satırı, geri bildirimin tek doğru yeri.
     */
    const failed = applyNudgeResult({ ...base, waitMinutes: 12 }, 'failed');
    assert.deepEqual(waitCard(failed, []).actions,
        [{ label: 'Gönderilemedi · tekrar dene', kind: 'fill' }]);
    const noStaff = applyNudgeResult({ ...base, waitMinutes: 12 }, 'no_staff');
    assert.deepEqual(waitCard(noStaff, []).actions,
        [{ label: 'Personel atanmamış', kind: 'fill' }]);
    // Başarıda damga; düğme yerini ona bırakıyor.
    assert.equal(waitCard(applyNudgeResult({ ...base, waitMinutes: 12 }, 'ok'), []).actions[0].kind, 'stamp');
});

test('tutmayan gönderim TEKRAR DENENEBİLİR kalıyor', () => {
    /*
     * Hata bir damga olsaydı müdürün tek çaresi ekranı yenilemek olurdu.
     * Düğme basılabilir kalıyor ve basınca eski hata siliniyor.
     */
    assert.equal(isNudgeLabel('Gönderilemedi · tekrar dene'), true);
    assert.equal(isNudgeLabel('Personel atanmamış'), true);
    assert.equal(isNudgeLabel('Karşılamayı aç'), false);
    const failed = applyNudgeResult({ ...base, waitMinutes: 12 }, 'failed');
    assert.equal(applyWaitAction(failed, nudgeLabel('failed')).nudgeResult, undefined);
});

test('kartın kayıt satırı sonucu söylüyor', () => {
    // Hap yüzeyinde geri bildirim kayıt satırında; `waRecord` ile aynı kural:
    // bitmemiş iş BAYATLAMIYOR, göz yerinde kalıyor.
    assert.equal(staffRecord('ok', 2).text, 'Personele söylendi · 2 dk');
    assert.equal(staffRecord('failed', 2).stales, false);
    assert.equal(staffRecord('no_staff', 40).text, 'Personel atanmamış · gönderilmedi');
    const sent = applyNudgeResult({ ...base, kind: 'next', etaMinutes: -4 }, 'failed');
    assert.equal(pillRecordOf({ ...sent, actedCell: 'inf', actedAt: 0 })?.tone, 'warn');
});

test('sent: 0 BAŞARI DEĞİL', () => {
    // Abonelik yoksa `send-push` 200 + `sent: 0` döner. Bunu başarı saymak,
    // bildirimleri kapalı bir personele "söylendi" demek olurdu.
    assert.match(write, /body\.sent === 'number' && body\.sent > 0 \? 'ok' : 'failed'/);
    assert.match(write, /body\.note === 'no_staff'\) return 'no_staff'/);
});

test('randevu kimliği yoksa HİÇ ÇAĞRILMIYOR', () => {
    // Kimliksiz bir istek sunucuda 400 olurdu; ekran onu hata gibi gösterirdi
    // oysa yapılacak bir şey yok.
    assert.match(screen, /if \(!event\.appointmentId\) return;/);
});

// ── Sunucu hatayı YUTMUYOR ──────────────────────────────────────────────────

test('gönderim düşerse 502 dönüyor — sessiz 200 değil', () => {
    /*
     * `_shared/notify.ts` bildirimi fire-and-forget gönderir ve haklıdır:
     * orada bildirim, olmuş bir randevunun yan ürünü. Burada bildirim İŞİN
     * KENDİSİ; müdür düğmeye bastı ve ekranda bir damga belirecek.
     */
    assert.match(fn, /if \(!sent\.ok\) \{/);
    assert.match(fn, /return json\(\{ error: 'send_failed' \}, 502\)/);
    assert.match(fn, /console\.log\(`nudge org=\$\{res\.organization_id\}/);
});

test('sır yoksa 500 — gönderilmemiş bildirimi başarı saymıyor', () => {
    assert.match(fn, /if \(!secret \|\| !baseUrl\)/);
    assert.match(fn, /return json\(\{ error: 'push_not_configured' \}, 500\)/);
});

// ── Yerel alan sunucu yenilemesinde YAŞAMALI ────────────────────────────────

test('sonuç ve damga SUNUCU SATIRIYLA BİRLEŞİNCE korunuyor', () => {
    /*
     * Telefonda bulunan hata (2026-09-24): düğmeye basınca hiçbir şey
     * olmuyordu, yalnız titreşim. Sebep `replace` değildi — ekran her çizimde
     * sunucu satırını `mergeLocal` ile birleştiriyor ve `LOCAL_CARD_FIELDS`te
     * OLMAYAN her alan orada siliniyor. Yani durum yazılıyor, aynı karede
     * çöpe gidiyordu.
     *
     * `remindedAt` bu listede HİÇ yoktu; düğme bayrak arkasında gizli olduğu
     * için yıllarca görünmedi.
     */
    assert.ok(LOCAL_CARD_FIELDS.includes('nudgeResult'), 'nudgeResult');
    assert.ok(LOCAL_CARD_FIELDS.includes('remindedAt'), 'remindedAt');

    const server = { ...base, waitMinutes: 28 };
    const failed = applyNudgeResult(server, 'failed');
    assert.equal(mergeLocal(server, failed).nudgeResult, 'failed', 'hata hayatta kalmalı');

    const ok = applyNudgeResult(server, 'ok');
    assert.equal(mergeLocal(server, ok).remindedAt, 28, 'damga hayatta kalmalı');

    // Ve kart birleşmeden SONRA da doğru şeyi çiziyor.
    assert.deepEqual(waitCard(mergeLocal(server, failed), []).actions,
        [{ label: 'Gönderilemedi · tekrar dene', kind: 'fill' }]);
});

test('yerel alan TEMİZLENEBİLİYOR da — yeniden denemede hata siliniyor', () => {
    // `mergeLocal` `undefined` gelen alanı siliyor; tersi olsaydı bir kez
    // görülen hata kartta sonsuza kadar kalırdı.
    const server = { ...base, waitMinutes: 28 };
    const cleared = applyWaitAction(applyNudgeResult(server, 'failed'), NUDGE_LABEL);
    assert.equal(mergeLocal(server, cleared).nudgeResult, undefined);
});
