/**
 * Müdür 21 — tahsilat ve gelmedi kartları.
 *
 * Tasarım: docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi
 * Kartlari.html
 *
 * Kart Kasa ekranının yerini ALMAZ: ödeme yöntemi, indirim ve kalem listesi
 * orada. Kart dört şey söyler — ne kadar, kimden, ne zamandır bekliyor,
 * ne yapmalıyım.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    applyFlowAction, applyNoshowAction, dueCard, dueLevel, DUE_WARN_MINUTES,
    LATE_LIMIT_MINUTES, mockDay, noshowCard, noshowRowLabel, paidCard, paidLine, toneOf,
} from '../mobile/src/lib/managerFlow.ts';
import { formatAmount, waitLabel } from '../mobile/src/lib/cash.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tokens = read('../mobile/src/theme/tokens.ts');
const dueTokens = tokens.slice(tokens.indexOf('export const dueCardMetrics'));
const px = (key) => Number(new RegExp(`\\b${key}: ([\\d.]+)`).exec(dueTokens)[1]);
const parts = read('../mobile/src/components/FlowParts.tsx');
const screen = read('../mobile/app/mudur/index.tsx');

const due = {
    id: 'd', time: '11:18', kind: 'due',
    firstName: 'Merve', lastName: 'Aydın',
    detail: 'Kesim + fön · Merve ile',
    amountValue: 1800, dueMinutes: 12, servedBy: 'Merve',
};

const gone = {
    id: 'g', time: '11:30', kind: 'noshow',
    firstName: 'Elif', lastName: 'Demir',
    detail: 'Keratin bakımı · 45 dk · Selin ile',
    noshowMinutes: 12,
};

// ── Tahsilat · seviyeler ────────────────────────────────────────────────────

test('kasa eşiği beklemenin eşiğinden yüksek', () => {
    // Beklemede müşteri ayakta hizmet bekliyor; burada hizmet bitmiş, müşteri
    // montunu giyiyor ya da kartla ödüyor.
    assert.equal(DUE_WARN_MINUTES, 20);
    assert.ok(DUE_WARN_MINUTES > 10);
});

test('seviye eşikleri kapsayıcı', () => {
    assert.equal(dueLevel({ dueMinutes: 0 }), 'calm');
    assert.equal(dueLevel({ dueMinutes: 19 }), 'calm');
    assert.equal(dueLevel({ dueMinutes: 20 }), 'warn');
    assert.equal(dueLevel({ dueMinutes: 1080 }), 'warn');
});

test('dünden devreden her hâlde en yüksek seviye', () => {
    // Gün sınırı dakikadan güçlü bir sinyal: 5 dakikalık bile olsa dünden
    // kalmış bir adisyon kapanmamış bir gün demektir.
    assert.equal(dueLevel({ dueMinutes: 5, carriedOver: true }), 'hot');
    assert.equal(dueLevel({ dueMinutes: 1080, carriedOver: true }), 'hot');
});

// ── Tahsilat · kart ─────────────────────────────────────────────────────────

test('D1 · sakin hâl Kasa ekranının kelimesini kullanır', () => {
    const card = dueCard(due);
    assert.equal(card.level, 'calm');
    assert.equal(card.label, 'kasaya hazır');
    assert.equal(card.value, '1.800');
    assert.equal(card.currency, '₺');
    assert.equal(card.sub, 'Merve verdi · 12 dk bekliyor');
});

test('D1 · tek eylem, o da dolu hap — ikinci bir KARAR yok', () => {
    // Ödeme yöntemi, indirim ve kalem listesi Kasa ekranının işi; kart bir kapı.
    assert.deepEqual(dueCard(due).actions, [{ label: 'Tahsil et', kind: 'fill' }]);
});

test('D2 · yaşlanma etikette ve cümlede', () => {
    const card = dueCard({ ...due, amountValue: 2650, dueMinutes: 24, servedBy: 'Selin' });
    assert.equal(card.level, 'warn');
    assert.equal(card.label, 'kasada bekliyor · 24 dk');
    assert.equal(card.sub, 'Selin verdi · en eskisi 24 dk bekliyor');
});

test('D2b · dünden kaldı, bekleme saate döner', () => {
    const card = dueCard({
        ...due, amountValue: 900, dueMinutes: 1080, carriedOver: true, servedBy: 'Deniz',
    });
    assert.equal(card.label, 'dünden kaldı');
    // "Kim verdi" dünden devredende düşer — ayrı testte gerekçesiyle.
    assert.equal(card.sub, 'dünden kaldı, 18 saat bekliyor');
    // "1080 dk" hiçbir yerde yazmaz.
    assert.ok(!card.sub.includes('1080'));
});

test('bekleme metni Kasa ekranıyla aynı işlevden gelir', () => {
    // İki ekran aynı adisyon için farklı süre yazmasın.
    assert.equal(waitLabel(24), '24 dk');
    assert.equal(waitLabel(1080), '18 saat');
});

test('para biçimi Türkçe — binlik nokta, kuruş yok', () => {
    assert.equal(formatAmount(1800), '1.800');
    assert.equal(dueCard({ ...due, amountValue: 2650.4 }).value, '2.650');
});

test('personel adı yoksa cümle uydurulmaz', () => {
    const { servedBy: _s, ...anon } = due;
    assert.equal(dueCard(anon).sub, '12 dk bekliyor');
});

test('kim verdi CÜMLE, personel hapı değil', () => {
    // Hap "kim ŞU AN çalışıyor" demek için var; burada kimse çalışmıyor,
    // hizmet bitti. Geçmiş zaman kipi bunu tek kelimeyle söylüyor.
    assert.ok(dueCard(due).sub.startsWith('Merve verdi'));
    const cardBlock = parts.slice(parts.indexOf('function DueCardView'));
    assert.ok(!cardBlock.slice(0, cardBlock.indexOf('\nfunction ')).includes('staffpill'));
});

// ── Para rengi ──────────────────────────────────────────────────────────────

test('tutar HİÇBİR hâlde renk değiştirmez', () => {
    // Müdür 20'de rakam kırmızıya dönüyordu çünkü orada sorun ZAMANDI ve rakam
    // zamanı gösteriyordu. Burada rakam parayı gösteriyor; tutar geciktiği
    // için kötüleşmiyor. Renk değişse müdür "tutar mı arttı?" diye bakar.
    const block = parts.slice(parts.indexOf('function DueCardView'));
    const body = block.slice(0, block.indexOf('\n/**'));
    assert.ok(body.includes('<MoneyHero currency={card.currency} value={card.value} color={ink.ink} />'));
    assert.ok(!/MoneyHero[^>]*hot \?/.test(body));
});

test('₺ ayrı düğüm ve rakamdan küçük — ama aynı mürekkep', () => {
    // Bekleme kartında birim ikincildir çünkü bilgi rakamdadır; parada ₺
    // rakamın kimliğinin parçası, soldurulursa tutar bir süreye benzer.
    assert.equal(px('currency'), 24);
    const hero = parts.slice(parts.indexOf('function MoneyHero'));
    const body = hero.slice(0, hero.indexOf('\n/**'));
    assert.ok(body.includes('color,'));
    assert.ok(!body.includes('ink2'));
});

// ── D3 · tahsilat alındı ────────────────────────────────────────────────────

test('D3 kart değil, ince satır', () => {
    assert.equal(px('paidHeight'), 34);
    assert.ok(px('paidHeight') < 92 / 2);
});

test('D3 tutarı ve saati taşır, gerisini bırakır', () => {
    const line = paidLine({ ...due, kind: 'paid', amountValue: 1800, paidAt: '11:31' });
    assert.equal(line.label, 'tahsil edildi');
    assert.equal(line.text, '₺1.800 · 11:31');
});

test('D3 saat yoksa ayırıcı bırakmaz', () => {
    assert.equal(paidLine({ ...due, kind: 'paid', amountValue: 1800 }).text, '₺1.800');
});

test('yeşil yalnız bitmiş işte', () => {
    assert.equal(toneOf('paid'), 'green');
    // Bekleyen tahsilat amber: hiçbir şey bitmedi.
    assert.equal(toneOf('due'), 'amber');
});

test('bitmiş tahsilat soluklaşır, gelmedi ASLA', () => {
    assert.equal(px('paidOpacity'), 0.5);
    assert.ok(parts.includes("event.kind === 'paid' ? dueCardMetrics.paidOpacity"));
    const block = parts.slice(parts.indexOf('function NoshowCardView'));
    const body = block.slice(0, block.indexOf('\n/**') === -1 ? undefined : block.indexOf('\n/**'));
    assert.ok(!body.includes('paidOpacity'));
});

// ── Gelmedi ─────────────────────────────────────────────────────────────────

// ── "OTOMATİK DÜŞER" KALKTI (2026-09-15, kullanıcı onayıyla) ─────────────────
// Kartlar "22 dk sonra düşer", "randevu düştü · kayıt müşteri dosyasına
// yazıldı" diyordu; randevuyu düşüren bir iş ne sunucuda ne masaüstünde var.
// Masaüstünün mantığı: randevu saati + salonun toleransı (vars. 120) geçti ve
// müşteri gelmediyse "Gelmedi"; randevu açık kalır. Eşik de masaüstüyle aynı.
test('E1/E2 · kahraman rakam geçen süre, alt satır randevunun GERÇEK hâli', () => {
    const card = noshowCard(gone);
    assert.equal(card.label, 'müşteri gelmedi');
    assert.equal(card.value, '12');
    assert.equal(card.unit, 'dk');
    assert.equal(card.spent, false);
    // Müdür 33: saat baştan atıldı — satırın sol sütununda zaten yazılı.
    assert.equal(card.sub, 'Randevu açık · gelirse "Geç geldi"');
    assert.doesNotMatch(card.sub, /düş/);
    // Canlıda kart ancak tolerans (vars. 120) dolunca çıkıyor: rakam saatle.
    assert.deepEqual([noshowCard({ ...gone, noshowMinutes: 124 }).value, noshowCard({ ...gone, noshowMinutes: 124 }).unit], ['2 sa 4', 'dk']);
});

test('E1 · taze basışta yalnız geri alma', () => {
    assert.deepEqual(noshowCard({ ...gone, noshowMinutes: 2 }, true).actions, [
        { label: 'Geri al', kind: 'ghost' },
    ]);
});

test('E2 · kurtarma hapı KENARLIKLI, dolu değil', () => {
    // Dolu turuncu "bastırılması gereken" demek; "Geç geldi" zorunlu değil,
    // müşteri gelirse basılır. Müdür 33: yanına hayalet `Yönet` geldi —
    // müşteriye ulaşma yolu 30 dakika boyunca da açık.
    assert.deepEqual(noshowCard(gone).actions, [
        { label: 'Geç geldi', kind: 'hap' },
        { label: 'Yönet', kind: 'ghost' },
    ]);
});

// Müdür 33 · 30. dakikadaki "randevu düştü" evresi KALDIRILDI (bkz. yukarı):
// randevu hiçbir dakikada ölmüyor, o yüzden "Geç geldi" hiçbir dakikada
// kaybolmuyor.
test('E3 · hiçbir dakikada "randevu düştü" YOK', () => {
    for (const minutes of [30, 45, 120, 300]) {
        const card = noshowCard({ ...gone, noshowMinutes: minutes, droppedAt: '12:00' });
        assert.equal(card.label, 'müşteri gelmedi');
        assert.equal(card.spent, false);
        assert.doesNotMatch(card.sub, /dosyasına yazıldı|düş/);
        assert.deepEqual(card.actions, [
            { label: 'Geç geldi', kind: 'hap' },
            { label: 'Yönet', kind: 'ghost' },
        ]);
    }
});

test('taze basışta ne kadar geçmiş olursa olsun GERİ AL sunuluyor', () => {
    // Eskiden 30. dakikadan sonra "geri dönüşsüz" sayılıyordu. Randevu hiç
    // kapanmadığı için müdürün kendi "Gelmedi" işaretini geri alması her
    // zaman mümkün.
    const card = noshowCard({ ...gone, noshowMinutes: 41 }, true);
    assert.deepEqual(card.actions, [{ label: 'Geri al', kind: 'ghost' }]);
});

test('gelmedi kartı hiçbir zaman "tükenmiş" değil', () => {
    assert.equal(noshowCard({ ...gone, noshowMinutes: 29 }).spent, false);
    assert.equal(noshowCard({ ...gone, noshowMinutes: LATE_LIMIT_MINUTES }).spent, false);
});

test('düşmüş randevu satırda da başka bir şeydir', () => {
    assert.equal(noshowRowLabel(gone), 'müşteri gelmedi');
    // Kart ve satır AYNI kelimeyi söyler — iki ayrı sözlük olmaz.
    assert.equal(noshowCard(gone).label, noshowRowLabel(gone));
    assert.equal(noshowRowLabel({ ...gone, noshowMinutes: 300 }), 'müşteri gelmedi');
});

test('gelmedi rakamı KIRMIZI DEĞİL — kırmızı "ne oldu"da', () => {
    const block = parts.slice(parts.indexOf('function NoshowCardView'));
    const body = block.slice(0, block.length);
    // Etiket ve nokta kırmızı…
    assert.ok(body.includes('labelColor={ink.red}'));
    assert.ok(body.includes('<PanelDot color={ink.red} />'));
    // …rakam nötr; tükenince yalnız SOLAR, kırmızıya dönmez.
    assert.ok(body.includes('color={card.spent ? ink.ink2 : ink.ink}'));
});

test('gelmedi kartında NABIZ YOK — bekleyen bir şey yok, geçen bir şey var', () => {
    const block = parts.slice(parts.indexOf('function NoshowCardView'));
    const body = block.slice(0, block.indexOf('\n// ') === -1 ? 3000 : block.indexOf('\n// '));
    assert.ok(!body.includes('useWaitPulse'));
});

// ── Eylemler ────────────────────────────────────────────────────────────────

test('"Geç geldi" kaydı BEKLEMEYE döndürür, randevu düşmez', () => {
    const back = applyNoshowAction(gone, 'Geç geldi');
    assert.equal(back.kind, 'arrived');
    assert.equal(back.waitMinutes, 0);
    assert.equal(back.noshowMinutes, undefined);
});

test('"Geri al" gelmediyi sıradaki randevuya döndürür', () => {
    const back = applyNoshowAction({ ...gone, noshowMinutes: 2 }, 'Geri al');
    assert.equal(back.kind, 'next');
    assert.equal(back.noshowMinutes, undefined);
});

test('"Yeniden randevu" durum değiştirmez — ekranda geçiş yapar', () => {
    assert.equal(applyNoshowAction({ ...gone, noshowMinutes: 30 }, 'Yeniden randevu'), null);
    assert.ok(screen.includes("label === 'Yeniden randevu'"));
    assert.ok(screen.includes('/mudur/create'));
});

test('gelmedi eylemleri yalnız gelmedi satırında çalışır', () => {
    assert.equal(applyNoshowAction({ ...gone, kind: 'next' }, 'Geç geldi'), null);
    assert.equal(applyNoshowAction(due, 'Geri al'), null);
});

test('"Tahsil et" adisyonu tahsilata çevirir', () => {
    assert.equal(applyFlowAction(due, 'Tahsil et').kind, 'paid');
});

// ── Damga ───────────────────────────────────────────────────────────────────

test('damga DOLU DEĞİL — saydam zemin, ince kenarlık', () => {
    // Dolu zemin damgayı düğmeye benzetirdi; damga bir eylem değil bir kayıt.
    const idx = parts.indexOf("if (action.kind === 'stamp')");
    const block = parts.slice(idx, idx + 1400);
    assert.ok(block.includes('borderColor: ink.line'));
    assert.ok(!block.includes('backgroundColor: ink.am'));
    assert.ok(!block.includes('<Pressable'));
});

// ── Satırdaki yeri ──────────────────────────────────────────────────────────

test('kendi kartını taşıyan satır genel eylem satırını çizmez', () => {
    // İkisi birden dursaydı "Tahsil et" ekranda iki kez görünürdü.
    assert.ok(parts.includes("slot !== 'due' && slot !== 'paid' && slot !== 'settled' && slot !== 'gone'"));
});

test('üç kart da TEK YUVADA — geçişleri çapraz soldurma yapıyor', () => {
    assert.ok(parts.includes("{slot === 'due' ? <DueCardView"));
    assert.ok(parts.includes("{slot === 'paid' ? <PaidLine"));
    assert.ok(parts.includes("{slot === 'gone' ? ("));
});

test('tahsilat → ince satır geçişi kendi ölçüsünde', () => {
    // Kart önce tamamen kaybolur, yükseklik GÖRÜNMEZKEN 92'den 34'e düşer.
    assert.ok(tokens.includes('settle: { out: 300, in: 240, delay: 60, lift: 0, rise: 4 }'));
    assert.ok(parts.includes("slot === 'paid' ? cardSwap.settle"));
});

test('mock gün yedi hâlin hepsini taşır', () => {
    const dues = mockDay.events.filter((e) => e.kind === 'due');
    const levels = dues.map(dueLevel);
    assert.ok(levels.includes('calm'));
    assert.ok(levels.includes('warn'));
    assert.ok(levels.includes('hot'));
    assert.ok(mockDay.events.some((e) => e.kind === 'paid' && e.amountValue));
    const noshows = mockDay.events.filter((e) => e.kind === 'noshow');
    // "Tükenmiş" gelmedi kartı artık yok (bkz. düşürme kararı).
    assert.ok(noshows.length > 0);
    assert.ok(noshows.every((e) => !noshowCard(e).spent));
});

test('dünden devreden adisyonun SATIRI da kırmızıya döner', () => {
    // Kapanmamış bir gün bugünün akışında amber kalamaz.
    assert.ok(parts.includes("const carried = event.kind === 'due' && dueLevel(event) === 'hot'"));
    // 2026-08-30: aynı koşula geciken randevu da katıldı (`overdue`) — testin
    // koruduğu şey DEVREDEN adisyonun kırmızısı, o yerinde.
    assert.ok(parts.includes('gone || carried || overdue ? c.rd'));
    assert.ok(parts.includes("|| carried || overdue"));
});

// ── Onay kartı (tasarımın ikinci beat'i) ────────────────────────────────────

test('"Tahsil et" önce ONAY KARTI gösterir, doğrudan ince satıra düşmez', () => {
    // İlk uygulamada bu adım atlanmıştı: müdür bastığı düğmenin sonucunu
    // göremeden satır ince hâline iniyordu.
    const card = paidCard({ ...due, kind: 'paid', paidAt: '11:31' });
    assert.equal(card.label, 'tahsil edildi');
    assert.equal(card.value, '1.800');
    assert.equal(card.sub, 'Merve verdi · 11:31’de alındı');
    assert.deepEqual(card.actions, [{ label: 'Tahsil edildi', kind: 'stamp', done: true }]);
});

test('onay kartı saat yoksa saat UYDURMAZ', () => {
    // "Saat değişmiyor" kuralı: olayın anı sunucudan gelir.
    assert.equal(paidCard({ ...due, kind: 'paid' }).sub, 'Merve verdi · alındı');
});

test('onay kartı 1,6 saniye durur, sonra satıra iner', () => {
    assert.equal(px('settleHold'), 1600);
    assert.ok(parts.includes("useHold(event.kind === 'paid' && fresh, dueCardMetrics.settleHold)"));
    assert.ok(parts.includes("event.kind === 'paid' ? (holding ? 'settled' : 'paid')"));
});

test('onay kartında tutar YERİNDE kalır — yalnız etrafı değişir', () => {
    const block = parts.slice(parts.indexOf('function PaidCardView'));
    const body = block.slice(0, block.indexOf('\n/**'));
    assert.ok(body.includes('<MoneyHero currency={card.currency} value={card.value} color={ink.ink} />'));
    // Nabız yok: bekleyen bir şey kalmadı.
    assert.ok(!body.includes('useWaitPulse'));
    assert.ok(body.includes('<PanelDot color={ink.green} />'));
});

test('"Tahsil et" SAHTE ödeme üretmiyor — Kasa’yı açıyor', () => {
    /*
     * Akış canlı veriye bağlandı. Yerel olarak "tahsil edildi"ye çevirmek,
     * veritabanında hiçbir ödeme yokken müdüre parayı almış gibi göstermekti
     * — ve Kasa aynı adisyonu bekleyen olarak göstermeye devam ederdi. Çift
     * tahsilata davetiye.
     */
    assert.match(screen, /if \(event\.kind === 'due' && label === 'Tahsil et'\) \{\s*\n\s*router\.navigate\(\{ pathname: '\/mudur\/cash' \}\);\s*\n\s*return;/);
    // Onay penceresi listesinde artık yok — bir ödeme olmadan "onaylandı"
    // damgası da yok.
    assert.ok(screen.includes("['Geldi', 'Gelmedi', 'Geç geldi', 'Onayla'].includes(label)"));
});

test('dünden devredende "kim verdi" düşer — cümle sığsın', () => {
    // Yaşlanmanın ikinci yeri yok; kim verdi bilgisi Kasa ekranında duruyor.
    const card = dueCard({ ...due, dueMinutes: 1080, carriedOver: true, servedBy: 'Deniz' });
    assert.equal(card.sub, 'dünden kaldı, 18 saat bekliyor');
    assert.ok(!card.sub.includes('Deniz'));
    // Uyarı hâlinde ise kalır.
    assert.ok(dueCard({ ...due, dueMinutes: 24 }).sub.startsWith('Merve verdi'));
});
