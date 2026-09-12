import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { riskList, riskMask } from '../mobile/src/lib/customerFileMap.ts';

/**
 * Personel 05 — kumandanın OKUMASI canlıya bağlandı.
 *
 * İki kusur vardı ve ikisi de canlıda tehlikeliydi: randevu bulunamazsa
 * BAŞKA bir randevu açılıyordu, ve alerji uyarısı müşterinin ADINA göre
 * uyduruluyordu.
 */

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
const visit = code(read('../mobile/src/lib/visitSource.ts'));
const file = code(read('../mobile/src/lib/fileSource.ts'));

test('bulunamayan randevu BAŞKA randevu açmıyor', () => {
    // `?? list[1]` canlıda yanlış müşterinin kartını açmak demekti: adisyon o
    // kişiye yazılır, formül o kişinin dosyasına düşerdi.
    assert.ok(!screen.includes('?? list[1]'), 'yedek randevu kalmamalı');
    assert.ok(!screen.includes('demoAgenda('), 'ekran sahte ajandayı çağırmamalı');
    assert.match(screen, /useVisit\(params\.id\)/);
    assert.match(visit, /const row = list\.find\(\(item\) => item\.id === id\);/);
    assert.match(visit, /return row \? toVisit\(row\) : null;/);
});

test('randevu yoksa BOŞ EKRAN değil, cümle çiziliyor', () => {
    // Eskiden `return null` vardı: kullanıcı uygulamanın donduğunu sanıyordu.
    assert.ok(!screen.includes('if (!appointment) return null;'));
    assert.match(screen, /Bu <Text[^>]*>randevu bulunamadı<\/Text>/);
    // Üç hâl AYRI: okunuyor · okunamadı · gerçekten yok.
    assert.match(screen, /visitState === 'error'/);
    assert.match(screen, /Randevuyu <Text[^>]*>okuyamadık<\/Text>/);
    assert.match(screen, /Randevu silinmiş anlamına gelmez/);
    assert.match(screen, /visitState === 'loading' \? null/);
});

test('alerji uyarısı ADA göre UYDURULMUYOR', () => {
    // Gerçek bir salonda adaşı olan birine olmayan bir alerji yazardı — ve
    // tersi daha kötü: alerjisi OLAN ama adı tutmayan müşteri hiç uyarı almaz.
    assert.ok(!screen.includes("who === 'Ayşe Yılmaz'"), 'ada göre risk kalmamalı');
    assert.ok(!screen.includes("who === 'Elif Demir'"));
    assert.match(screen, /const \{ risks \} = useCustomerFile\(appointment\?\.customer_id \?\? undefined, undefined\)/);
});

test('risk kuralı İKİ ekranda da TEK kaynaktan', () => {
    // Müşteri sayfası tek maskede topluyor, kumanda satır satır gösteriyor —
    // ama ikisi de `riskList`ten okuyor.
    assert.match(file, /riskList\(data\.riskRules \?\? \[\], data\.customer\?\.custom_fields\)/);
    const map = code(read('../mobile/src/lib/customerFileMap.ts'));
    assert.match(map, /const active = riskList\(rules, fields\);/);
});

test('riskList kural motorunu masaüstüyle aynı uyguluyor', () => {
    const rules = [
        { key: 'alerji', label: 'Alerji', note: 'Kulak arkası testi şart.' },
        { key: 'hassas', label: 'Hassasiyet', note: null },
        { key: 'hamile', label: 'Hamilelik', note: 'Amonyak yok.' },
    ];
    assert.deepEqual(riskList(rules, null), []);
    assert.deepEqual(riskList(rules, { baska: true }), []);

    const lines = riskList(rules, { alerji: true, hassas: 1 });
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], { kind: 'Alerji', text: 'Kulak arkası testi şart.' });
    // Notu olmayan kural etiketini tekrar ediyor: boş bir uyarı satırı,
    // uyarının kendisinden kötü.
    assert.deepEqual(lines[1], { kind: 'Hassasiyet', text: 'Hassasiyet' });

    // Maske aynı listeden doğuyor — ikisi ayrışamaz.
    const mask = riskMask(rules, { alerji: true, hamile: true });
    assert.equal(mask.sub, '2 kural');
    assert.equal(mask.label, 'Risk · Alerji · Hamilelik');
});

test('sahte kipte saat DONUYOR', () => {
    // `demoAgenda` saatleri "şimdi"ye göre üretiyor; her okumada yeniden
    // üretilirse randevu saatleri kayar ve sayaç yerinde saymaya başlar.
    assert.match(visit, /const \[anchor\] = useState\(\(\) => Date\.now\(\)\);/);
    assert.match(visit, /demoAgenda\(anchor, today\)/);
    // Canlıda böyle bir sorun yok: saatler sunucudan geliyor.
    assert.match(visit, /LIVE_AUTH\s*\n?\s*\? api\.agenda\(today\)/);
});

test('saat biçimi SINIRDA indirgeniyor', () => {
    // Postgres "13:00:00" gönderiyor, ekran "13:00" bekliyor —
    // `agendaSource.toRow` ile aynı indirgeme.
    assert.match(visit, /start_time: clockText\(row\.start_time\)/);
    assert.match(visit, /end_time: clockText\(row\.end_time\)/);
});
