import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { noteMask, riskMask, toCustomerFile } from '../mobile/src/lib/customerFileMap.ts';

/**
 * Personel 09b — müşteri DOSYASININ canlıya bağlanması.
 *
 * Ekran `customerId`'yi zaten kullanıyordu (Faz 3'te düzeltildi); eksik olan
 * kaynaktı. Bu dosya iki şeyi koruyor: eşlemenin sunucu cevabına sadık
 * kalması, ve "okunamadı" ile "kayıt yok"un birbirine karışmaması.
 */

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = code(read('../mobile/app/(staff-flow)/musteri.tsx'));
const source = code(read('../mobile/src/lib/fileSource.ts'));
const map = code(read('../mobile/src/lib/customerFileMap.ts'));
const api = code(read('../supabase/functions/staff-api/index.ts'));

// ── Risk kuralları ──────────────────────────────────────────────────────────

test('risk kuralı müşterinin işareti DOLUYSA işliyor', () => {
    // Motor masaüstündekiyle aynı (`BeautyCustomersPage` · riskOf): kuralın
    // anahtarı müşteride doluysa kural işler.
    const rules = [
        { key: 'alerji', label: 'Alerji', note: 'Boya alerjisi bildirildi.' },
        { key: 'hamile', label: 'Hamilelik', note: 'Amonyaklı boya uygulanmıyor.' },
    ];
    assert.equal(riskMask(rules, { alerji: false, hamile: false }), null);
    assert.equal(riskMask(rules, null), null);

    const one = riskMask(rules, { alerji: true });
    assert.equal(one.label, 'Risk · Alerji');
    assert.equal(one.sub, '1 kural');
    assert.equal(one.text, 'Boya alerjisi bildirildi.');

    const two = riskMask(rules, { alerji: true, hamile: 1 });
    assert.equal(two.label, 'Risk · Alerji · Hamilelik');
    assert.equal(two.sub, '2 kural');
    assert.match(two.text, /Boya alerjisi bildirildi\. Amonyaklı boya uygulanmıyor\./);
});

test('notu olmayan kural maskeyi BOŞ bırakmıyor', () => {
    // Maskenin ardında boş bir kutu açmak, dokunan kişiye hiçbir şey
    // söylememek olurdu.
    const mask = riskMask([{ key: 'k', label: 'Hassasiyet', note: null }], { k: true });
    assert.equal(mask.text, 'Hassasiyet');
});

test('serbest not satır sayısını METİNDEN sayıyor', () => {
    assert.equal(noteMask(null), null);
    assert.equal(noteMask('   '), null);
    assert.equal(noteMask('tek satır').sub, '1 satır');
    assert.equal(noteMask('bir\n\niki\nüç').sub, '3 satır');
    assert.equal(noteMask('bir\niki').label, 'Not');
});

// ── Eşleme ──────────────────────────────────────────────────────────────────

const SERVER = {
    customer: {
        id: 'cx', name: 'Elif Demir', phone: '+905321110403',
        notes: 'Ense kısa kalmasın.', custom_fields: { alerji: true },
    },
    riskRules: [{ key: 'alerji', label: 'Alerji', note: 'Kulak arkası testi şart.' }],
    packages: [{ id: 'p1', name: 'Keratin bakım', total_sessions: 8, used_sessions: 5 }],
    history: [
        {
            id: 'r1', date: '2026-09-11', service: 'Saç boyama', status: 'completed',
            hadMaterial: true, locked: true, staffName: 'Merve Kaya', mine: true,
            formula: {
                materials: [{ id: 'm1', name: '7.3 kumral', qty: 1 }],
                ratio: '1:1', waitMinutes: 30, waitSource: 'timer',
                result: 'tuttu', tags: [], note: null,
            },
        },
        {
            id: 'r2', date: '2026-08-28', service: 'Kesim', status: 'completed',
            hadMaterial: false, locked: true, staffName: null, mine: false, formula: null,
        },
    ],
};

test('sunucu cevabı ekranın dosyasına eksiksiz iniyor', () => {
    const file = toCustomerFile(SERVER, '2026-09-13');
    assert.equal(file.id, 'cx');
    assert.equal(file.phone, '+905321110403');
    assert.equal(file.visits, 2);
    assert.equal(file.formulas, 1);
    assert.equal(file.lastService, 'Saç boyama');
    assert.equal(file.lastStaff, 'Merve Kaya');
    assert.equal(file.lastStaffInitials, 'MK');
    assert.equal(file.ago, '2 GÜN');
    assert.equal(file.risk.label, 'Risk · Alerji');
    assert.equal(file.note.label, 'Not');
    assert.equal(file.packages[0].used, 5);
    assert.equal(file.packages[0].total, 8);
    // Demo "son kullanım 12 Mart" diyordu; sunucu o tarihi GÖNDERMİYOR, o
    // yüzden gerçekten bilinen şey yazılıyor.
    assert.equal(file.packages[0].sub, '3 seans kaldı');
});

test('"son formül" kartı en yeni FORMÜLLÜ ziyaretten türüyor', () => {
    // Aradaki kesimlerde formül olmaması bir eksik değil; kart en yeni
    // ziyaretten değil, en yeni FORMÜLDEN doğar.
    const file = toCustomerFile({
        ...SERVER,
        history: [SERVER.history[1], SERVER.history[0]],
    }, '2026-09-13');
    assert.equal(file.formula.who, 'Merve Kaya');
    assert.equal(file.formula.result, 'tuttu');
    assert.equal(file.formula.tone, 'gr');
    assert.equal(file.formula.ratio, '1:1');
});

test('formülsüz müşteride kart HİÇ çizilmiyor', () => {
    const file = toCustomerFile({ ...SERVER, history: [SERVER.history[1]] }, '2026-09-13');
    assert.equal(file.formula, null);
    assert.equal(file.formulas, 0);
    // Adı bilinmeyen personel baş harf UYDURMUYOR.
    assert.equal(file.history[0].who, '');
    assert.equal(file.history[0].initials, '');
    assert.equal(file.lastStaff, null);
});

test('müşteri yoksa dosya da yok', () => {
    assert.equal(toCustomerFile({}, '2026-09-13'), null);
    assert.equal(toCustomerFile({ customer: {} }, '2026-09-13'), null);
});

test('ziyaretin SÜRESİ uydurulmuyor', () => {
    // `customer` ucu damgaları seçmiyor; süre bilinmiyor. Sıfır "bilinmiyor"
    // demek ve ekran onu hiç geçmiyor — "· 0 dk" uydurma bir ölçüm olurdu.
    const file = toCustomerFile(SERVER, '2026-09-13');
    assert.equal(file.history[0].minutes, 0);
    assert.match(screen, /row\.minutes > 0 \? \{ minutes: String\(row\.minutes\) \} : \{\}/);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('OKUNAMADI ile BULUNAMADI ayrı cümleler', () => {
    // "Kayıt silinmiş olabilir" cümlesini bir ağ hatasında söylemek, duran bir
    // kaydı silinmiş gibi göstermek olurdu — personel müşteriyi yeniden
    // kaydetmeye kalkardı.
    assert.match(screen, /fileState === 'error'/);
    assert.match(screen, /Dosyayı <Text[^>]*>okuyamadık<\/Text>/);
    assert.match(screen, /Kayıt silinmiş anlamına gelmez/);
    assert.match(screen, /title="Müşteri bulunamadı"/);
    // 404 KAYIT YOK demek; ötekiler OKUYAMADIK.
    assert.match(source, /if \(status === 404\) \{ setFile\(null\); setRisks\(\[\]\); setState\('missing'\); return; \}/);
});

test('geçmiş TAVANA dayandıysa sayı "+" ile yazılıyor', () => {
    // Sunucu son 10 ziyareti dönüyor. Tam onsa daha fazlası olabilir ve
    // "10 randevu" yazmak makul bir yalan olurdu.
    assert.match(api, /\.lte\('date', today\)\.order\('date', \{ ascending: false \}\)\.limit\(10\)/);
    assert.match(map, /export const HISTORY_LIMIT = 10;/);
    assert.match(source, /capped: \(file\?\.history\.length \?\? 0\) >= HISTORY_LIMIT/);
    assert.match(screen, /\{file\.visits\}\{capped \? '\+' : ''\}/);
    assert.match(screen, /\{file\.formulas\}\{capped \? '\+' : ''\}/);
});

test('odağa dönüşte YENİDEN okunuyor', () => {
    // Formül sayfasından dönen personel, az önce kaydettiğini geçmiş
    // satırında görmeli; yoksa "Kaydet" yine hiçbir şey yapmamış gibi olur.
    assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{ void read\(false\); \}, \[read\]\)\)/);
    assert.ok(!screen.includes('demoCustomerFile'), 'ekran sahte dosyayı çağırmamalı');
    assert.match(screen, /useCustomerFile\(/);
    // Sahte kaynak SİLİNMEDİ: canlıya geçiş tek değişkenle geri alınabiliyor.
    assert.match(source, /!LIVE_AUTH\s*\n?\s*\? Promise\.resolve\(\(\(\) => \{/);
    assert.match(source, /demoCustomerFile\(\{ id: customerId, name \}, today\)/);
});
