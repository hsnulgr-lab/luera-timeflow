import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { orgDurum } from '../mobile/src/lib/managerDurum.ts';
import { bannedIn, MAX_ACTIONS } from '../mobile/src/lib/durum.ts';
import { POLL_MS, STALE_AFTER_MS } from '../mobile/src/lib/freshness.ts';

/**
 * MÜDÜRÜN ORTAK OKUMA DAVRANIŞI.
 *
 * Müdürün yedi ekranı var ve hiçbirinin durum hâli yok: bugün ağ hatası
 * `randevu/[id]`de "Randevu bulunamadı · Silinmiş olabilir" diye, takvimde
 * ise SIFIR RANDEVU diye okunuyor. Müdür 28 turu brief aşamasında raftaydı.
 *
 * Personel tarafında aynı davranış iki kez yazıldı ve farkları iki kez ayrı
 * öğrenildi. Bu dosya, üçüncü kez yazılmamasını kilitliyor.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const hook = strip(read('src/lib/managerRead.ts'));
const salon = strip(read('src/lib/salonDay.ts'));

// ── Reddin dili ─────────────────────────────────────────────────────────────

const REASONS = ['no_access', 'ambiguous', 'no_session'];

test('üç ret üç AYRI cümle', () => {
    // Üçünü "salon okunamadı" diye tek cümleye indirmek müdüre yanlış işi
    // yaptırırdı: erişimi kaldırılmış müdür bekler durur, oturumu bitmiş
    // müdür yeniden girmeyi akıl etmez, iki salonlu müdür seçmesi
    // gerektiğini hiç bilmez.
    const titles = REASONS.map((r) => orgDurum(r).title);
    assert.equal(new Set(titles).size, 3);
    const actions = REASONS.map((r) => orgDurum(r).action.kind);
    assert.deepEqual(actions, ['signout', 'pick', 'signin']);
});

test('erişim reddi KIRMIZI, ötekiler amber', () => {
    // Tur: "Kırmızı — yalnız gerçekten başarısız olan işlemde." Erişim
    // kaldırılmışsa beklemek bir seçenek DEĞİL; ötekilerde yapılacak bir
    // hamle var ve hamle yapılınca iş sürüyor.
    assert.equal(orgDurum('no_access').tone, 'red');
    assert.equal(orgDurum('ambiguous').tone, 'amber');
    assert.equal(orgDurum('no_session').tone, 'amber');
});

test('her ret TEK eylem taşıyor', () => {
    // Tur: "en fazla iki eylem". Üçü de tek hamlelik durumlar; ikinci bir
    // düğme kararı zorlaştırırdı.
    for (const reason of REASONS) {
        assert.ok(orgDurum(reason).action.label.length > 0);
    }
    assert.ok(1 <= MAX_ACTIONS);
});

test('ret metinleri yasaklı sözlüğe girmiyor', () => {
    for (const reason of REASONS) {
        const spec = orgDurum(reason);
        for (const text of [spec.title, ...spec.lines, spec.action.label]) {
            assert.deepEqual(bannedIn(text), [], `${reason}: ${text}`);
        }
    }
});

test('sebep UYDURULMUYOR', () => {
    // Erişimin neden kalktığını bilmiyoruz; ikisi de mümkün ve ikisinin de
    // sonucu aynı. Tek bir sebebi kesinmiş gibi yazmak yanlış bilgi olurdu.
    assert.match(orgDurum('no_access').lines[0], /ya da/);
});

// ── Kancanın davranışı ──────────────────────────────────────────────────────

test('üç hâl — ve "yok" diye dördüncüsü YOK', () => {
    // Okunamayan ile boş olan ayrı; "yok" hâli veriyi okuyan ekranın kendi
    // işi, kancanın değil.
    assert.match(hook, /export type ManagerReadState = 'loading' \| 'ok' \| 'error';/);
});

test('yoklama personelle AYNI aralıkta ve yalnız ekran açıkken', () => {
    // Müdürün ikinci bir davranış öğrenmemesi için `useSalonDay` ile birebir.
    assert.match(hook, /POLL_MS/);
    assert.match(hook, /if \(AppState\.currentState !== 'active'\) return;/);
    assert.match(salon, /if \(AppState\.currentState !== 'active'\) return;/);
    // Eşiğin ALTINDA: yoklama çalıştığı sürece liste hiç bayatlamıyor.
    assert.ok(POLL_MS < STALE_AFTER_MS);
});

test('öne dönüş ve sekmeye dönüş SESSİZ tazeliyor', () => {
    assert.match(hook, /if \(next === 'active'\) void run\(false\)/);
    assert.match(hook, /useFocusEffect\(useCallback\(\(\) => \{ void run\(false\); \}, \[run\]\)\)/);
});

test('sessiz okumanın hatası ELDEKİ veriyi bozmuyor', () => {
    // Çalışan bir ekranı bozmak, bayat göstermekten kötü.
    assert.match(hook, /if \(visible\) setState\('error'\);/);
    // Hata yolunda veri YAZILMIYOR — yalnız başarı yolunda.
    const fail = hook.slice(hook.indexOf('.catch('));
    assert.doesNotMatch(fail, /setData\(/);
});

test('ORG REDDİ sessiz turda da görünüyor — tek istisna', () => {
    // Red geçici DEĞİL: org listesi BAŞARIYLA okunduğu hâlde saklı salon
    // içinde yok demek. Yutmak, müdüre erişimi olmayan bir salonun bayat
    // verisini göstermeye devam etmek olurdu.
    const fail = hook.slice(hook.indexOf('.catch('));
    const org = fail.indexOf('cause instanceof OrgError');
    const quiet = fail.indexOf('if (visible)');
    assert.ok(org > -1 && quiet > -1, 'iki yol da var');
    assert.ok(org < quiet, 'red, sessizlik kuralından ÖNCE ele alınmalı');
    assert.match(fail, /setRefusal\(cause\.reason\);\s*\n\s*setState\('error'\);\s*\n\s*return;/);
});

test('başarılı okuma reddi TEMİZLİYOR', () => {
    // Erişim geri verilmişse ekran kırmızı blokta takılı kalmamalı.
    assert.match(hook, /setRefusal\(null\);/);
});

test('geç dönen cevap SONRAKİNİ ezmiyor', () => {
    // Okunan şeyin ne olduğu bilinmediği için gün karşılaştırması yapılamaz;
    // her okumaya sıra numarası veriliyor ve yalnız EN SON açılan yazıyor.
    assert.match(hook, /turn\.current \+= 1;\s*\n\s*const mine = turn\.current;/);
    const guards = (hook.match(/if \(turn\.current !== mine\) return;/g) ?? []).length;
    // İki yol da korunuyor: başarı ve hata.
    assert.equal(guards, 2);
});

test('görünür yenileme SÖZ döndürüyor', () => {
    // Aşağı-çekip-yenileme kaydırıcıyı okuma bitene kadar tutmak zorunda.
    assert.match(hook, /const reload = useCallback\(\(\) => \{\s*\n\s*setState\('loading'\);\s*\n\s*return run\(true\);/);
});

test('bayatlık saati okumaya BAĞLANMIYOR', () => {
    // `at`e bağlansaydı her okumada yeniden kurulurdu.
    assert.match(hook, /atRef\.current = now;/);
    assert.match(hook, /setStale\(isStale\(atRef\.current, Date\.now\(\)\)\);/);
});
