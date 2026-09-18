import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    activePackage, apptInfoOf, lastVisitLine, pastVisits,
} from '../mobile/src/lib/apptInfo.ts';
import {
    conflictLine, outcomeOf, writablePatch,
} from '../mobile/src/lib/managerWriteMap.ts';

/**
 * MÜDÜR · RANDEVU KARTI CANLI — ve MÜDÜRÜN İLK YAZMASI.
 *
 * İki ayrı iş bir ekranda buluşuyor:
 *   • kart artık randevuyu KİMLİĞİYLE okuyor (eskiden günün tamamını okuyup
 *     içinden arıyordu — yol parametresindeki gün yanlışsa var olan randevu
 *     "bulunamadı" diye görünüyordu)
 *   • taşıma, hizmet, not, "geldi" damgası ve iptal GERÇEKTEN yazılıyor
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = strip(read('app/(manager-flow)/randevu/[id].tsx'));
const write = strip(read('src/lib/managerWrite.ts'));
const hook = strip(read('src/lib/managerAppointment.ts'));
const source = strip(read('src/lib/managerSource.ts'));

const h = (date, over = {}) => ({ date, service: 'Kesim', status: 'completed', ...over });

// ── Künye ───────────────────────────────────────────────────────────────────

test('geçmişi olan müşteri "yeni müşteri" GÖRÜNMÜYOR', () => {
    const info = apptInfoOf({
        riskRules: [], customFields: null, packages: [],
        history: [h('2026-07-12'), h('2026-06-01')], dateISO: '2026-09-14',
    });
    assert.equal(info.visitNo, 3, 'bu ziyaret geçmişin bir fazlası');
    assert.equal(info.lastVisit, '12 Temmuz · Kesim');
});

test('gerçekten yeni müşteride künye NULL', () => {
    // Boş bir künye nesnesi, kartın "Yeni müşteri" hâlini öldürür ve on
    // yıllık müşteriyle yeni müşteriyi aynı şekle sokardı.
    assert.equal(apptInfoOf({
        riskRules: [], customFields: null, packages: [], history: [], dateISO: '2026-09-14',
    }), null);
});

test('İPTAL edilmiş randevu ziyaret SAYILMIYOR', () => {
    const info = apptInfoOf({
        riskRules: [], customFields: null, packages: [],
        history: [h('2026-07-12'), h('2026-06-01', { status: 'cancelled' })],
        dateISO: '2026-09-14',
    });
    assert.equal(info.visitNo, 2);
});

test('BUGÜNÜN kendisi geçmişe sayılmıyor', () => {
    // Yoksa müşteri her zaman bir fazla görünürdü.
    const visits = pastVisits([h('2026-09-14'), h('2026-07-12')], '2026-09-14');
    assert.equal(visits.length, 1);
});

test('GELECEK randevu geçmişe sayılmıyor', () => {
    const visits = pastVisits([h('2026-10-01'), h('2026-07-12')], '2026-09-14');
    assert.deepEqual(visits.map((v) => v.date), ['2026-07-12']);
});

test('son ziyaret EN YENİSİ — sıra veriden bağımsız', () => {
    const info = apptInfoOf({
        riskRules: [], customFields: null, packages: [],
        history: [h('2026-06-01'), h('2026-08-20', { service: 'Röfle' })],
        dateISO: '2026-09-14',
    });
    assert.equal(info.lastVisit, '20 Ağustos · Röfle');
});

test('hizmeti bilinmeyen ziyaret yalnız TARİHİNİ söylüyor', () => {
    assert.equal(lastVisitLine(h('2026-07-12', { service: null })), '12 Temmuz');
    assert.equal(lastVisitLine(h('2026-07-12', { service: '  ' })), '12 Temmuz');
    assert.equal(lastVisitLine(undefined), null);
});

test('TÜKENMİŞ paket kartın kahraman rakamı olmuyor', () => {
    const tukenmis = { name: 'Boya', total_sessions: 8, used_sessions: 8 };
    const acik = { name: 'Bakım', total_sessions: 4, used_sessions: 1 };
    assert.equal(activePackage([tukenmis]), null);
    assert.equal(activePackage([tukenmis, acik]), acik);
});

test('paketi olan müşteri geçmişi olmasa da künye taşıyor', () => {
    // Paket satın almış ama henüz gelmemiş müşteri "yeni" değil.
    const info = apptInfoOf({
        riskRules: [], customFields: null,
        packages: [{ name: 'Boya', total_sessions: 8, used_sessions: 0 }],
        history: [], dateISO: '2026-09-14',
    });
    assert.deepEqual(info.pkg, { name: 'Boya', used: 0, total: 8 });
    assert.equal(info.visitNo, 1);
});

test('risk kuralları MÜŞTERİNİN işaretiyle eşleşiyor', () => {
    const rules = [
        { key: 'alerji', label: 'Alerji', note: 'Boya alerjisi bildirildi.' },
        { key: 'hamile', label: 'Hamile', note: 'Amonyaklı ürün kullanılmaz.' },
    ];
    const info = apptInfoOf({
        riskRules: rules, customFields: { alerji: true },
        packages: [], history: [h('2026-07-12')], dateISO: '2026-09-14',
    });
    assert.equal(info.risk, 'Boya alerjisi bildirildi.');
    // İşareti olmayan kural cümleye GİRMİYOR.
    assert.doesNotMatch(info.risk, /Amonyak/);
});

test('hiç risk yoksa alan NULL — boş cümle yok', () => {
    const info = apptInfoOf({
        riskRules: [{ key: 'alerji', label: 'Alerji' }], customFields: {},
        packages: [], history: [h('2026-07-12')], dateISO: '2026-09-14',
    });
    assert.equal(info.risk, null);
});

test('BAKİYE bilerek konmuyor', () => {
    /*
     * Bakiyenin tek doğruluk kaynağı masaüstündeki `patientBalance.ts` ve
     * kuralı dört maddelik. Burada ikinci kez yazmak, aynı müşteri için iki
     * farklı rakam demekti — o dosyanın var olma sebebi tam olarak bu.
     *
     * Alan `undefined` kalınca `visitSummary` rozeti HİÇ çizmiyor; "₺0" diye
     * bir varsayım üretmiyor.
     */
    const info = apptInfoOf({
        riskRules: [], customFields: null, packages: [],
        history: [h('2026-07-12')], dateISO: '2026-09-14',
    });
    assert.equal(info.balance, undefined);
    assert.doesNotMatch(strip(read('src/lib/apptInfo.ts')), /balance:/);
});

// ── Yazmanın sonucu ─────────────────────────────────────────────────────────

test('SIFIR satır güncellendiyse bu bir BAŞARI değil', () => {
    // İyimser kilit tam olarak böyle konuşuyor: `.eq('updated_at', beklenen)`
    // eşleşmezse UPDATE sıfır satır günceller ve HATA ATMAZ. Kontrol
    // edilmezse yazma "başarılı" görünür — kilidin hiç olmamasından kötü.
    assert.deepEqual(outcomeOf(null, null, 0), { ok: false, kind: 'stale' });
    assert.equal(outcomeOf(null, null, 1).ok, true);
});

test('çakışma hatası MÜDÜRÜN yapabileceği bir şeyle anlatılıyor', () => {
    const out = outcomeOf({ code: 'P0001', message: 'randevu çakışması' }, 'Merve', 0);
    assert.equal(out.kind, 'conflict');
    assert.match(out.message, /Merve/);
    // "kaydedilemedi" müdüre ne yapacağını söylemiyor.
    assert.doesNotMatch(out.message, /kaydedilemedi|hata/i);
});

test('personel adı bilinmiyorsa cümle UYDURULMUYOR', () => {
    assert.equal(conflictLine(null), 'O saat dolu — aynı anda iki randevu olamaz.');
    assert.equal(conflictLine('   '), 'O saat dolu — aynı anda iki randevu olamaz.');
});

test('tanınmayan hata çakışma SAYILMIYOR', () => {
    // Her hatayı "o saat dolu" diye göstermek, müdürü olmayan bir çakışmayı
    // çözmeye uğraştırırdı.
    assert.deepEqual(outcomeOf({ code: '23505', message: 'duplicate key' }, 'Merve', 0), { ok: false, kind: 'failed' });
});

test('yasaklı sözlük yazma metinlerine de uygulanıyor', async () => {
    const { bannedIn } = await import('../mobile/src/lib/durum.ts');
    const map = read('src/lib/managerWriteMap.ts');
    for (const text of map.match(/'[^'\n]{8,}'/g) ?? []) {
        // Yorumlar elendikten sonra kalan dizeler ekrana çıkıyor.
        if (text.includes('updated_at') || text.includes('/')) continue;
        assert.deepEqual(bannedIn(text), [], text);
    }
});

// ── Yazılamayan alanlar ─────────────────────────────────────────────────────

test('PERSONELİN damgaları müdür kartından yazılmıyor', () => {
    // `arrived_at` hizmetin başladığı an ve personel basar. Müdürün kartından
    // yazılsaydı, müdür hizmeti başlatmış gibi görünürdü.
    const patch = writablePatch({
        date: '2026-09-14', start_time: '11:00', end_time: '12:00',
        service: 'Kesim', service_color: null, status: 'confirmed',
        staff_id: 's1', notes: null, customer_arrived_at: null,
    });
    for (const forbidden of ['arrived_at', 'service_ended_at', 'customer_name', 'customer_phone', 'customer_id', 'is_paid', 'adisyon_items', 'formula']) {
        assert.equal(forbidden in patch, false, `${forbidden} yazılabilir olmamalı`);
    }
    // `customer_arrived_at` AYRI: o müdürün damgası.
    assert.equal('customer_arrived_at' in patch, true);
});

// ── Sorgu ───────────────────────────────────────────────────────────────────

test('randevu KİMLİĞİYLE okunuyor, gün taranmıyor', () => {
    assert.match(source, /export async function fetchAppointment/);
    assert.match(source, /\.eq\('id', id\)[\s\S]{0,60}\.maybeSingle\(\)/);
    // Kilidin dayanağı bu okumada geliyor.
    assert.match(source, /select\(`\$\{RES_COLS\}, updated_at`\)/);
    assert.doesNotMatch(screen, /list\.find\(/);
});

test('arşivlenmiş müşterinin açık randevusu künyesiz kalmıyor', () => {
    // 009 arşivi `is_active = false` ile yapıyor; `deleted_at` kolonu YOK.
    // Bir süre burada o isteniyordu — okuma 42703 ile düşerdi.
    assert.doesNotMatch(source, /deleted_at/);
    const context = source.slice(source.indexOf('export async function fetchCustomerContext'));
    assert.doesNotMatch(context.slice(0, context.indexOf('fetchPackageRows(organizationId, [customerId])')), /is_active/);
});

test('risk kuralları SAHİBİN ayar satırından — staff-api ile aynı', () => {
    // `settings.user_id` TEKİL. Başka bir satıra bakmak, müdürün telefonuyla
    // personelin telefonunun FARKLI risk kuralları göstermesi demekti.
    assert.match(source, /export async function fetchOrgSettings/);
    assert.match(source, /\.eq\('user_id', ownerId\)/);
    assert.match(source, /\.order\('created_at', \{ ascending: true \}\)/);
});

test('müşteri kimliği yoksa künye ADLA aranmıyor', () => {
    // Aynı adlı iki müşteride yanlış kişinin geçmişi gösterilirdi.
    assert.match(hook, /row\.customer_id \? fetchCustomerContext\(row\.customer_id\) : Promise\.resolve\(null\)/);
});

// ── Yazma yolu ──────────────────────────────────────────────────────────────

test('kilit ZORUNLU — damgasız yazma yok', () => {
    assert.match(write, /expectedUpdatedAt: string,/);
    assert.match(write, /\.eq\('updated_at', expectedUpdatedAt\)/);
    assert.match(write, /\.eq\('organization_id', organizationId\)/);
});

test('yeni damga GERİ isteniyor', () => {
    // Yoksa ikinci değişiklik kendi ilk yazmasına takılırdı.
    assert.match(write, /\.select\('updated_at'\)/);
    assert.match(write, /updatedAt: data\?\.\[0\]\?\.updated_at \?\? null/);
});

test('vana okunamazsa yazma DURMUYOR', () => {
    // Ters kurgu daha güvenli görünür ama bir ağ boşluğu bütün salonu
    // durdururdu. 093'teki gerekçenin aynısı.
    assert.match(write, /if \(error\) return false;/);
    assert.match(write, /data\?\.value === 'off'/);
});

test('beş eylem de TEK yazma yolundan geçiyor', () => {
    // Bir tanesini atlamak, o eylemin sessizce ezmesi demek olurdu.
    for (const action of ['onUpdate', 'onAttendance', 'onCancel']) {
        assert.match(screen, new RegExp(`${action}=\\{`));
    }
    const commits = (screen.match(/void commit\(|commit\(moved/g) ?? []).length;
    assert.ok(commits >= 5, `beş eylem bekleniyor, ${commits} bulundu`);
    assert.equal((screen.match(/updateAppointment\(/g) ?? []).length, 1, 'tek yazma çağrısı');
});

test('REDDEDİLEN yazma ekranda geri alınıyor', () => {
    // Bırakmak, yapılmamış bir değişikliği yapılmış gibi göstermek olurdu.
    const fn = screen.slice(screen.indexOf('const commit = useCallback'));
    const body = fn.slice(0, fn.indexOf('const commitMove'));
    assert.match(body, /setLocal\(null\);\s*\n\s*setRefused\(outcome\);/);
    assert.match(body, /if \(outcome\.kind === 'stale'\) void reload\(\);/);
});

test('reddedilmiş taşımada "geri al" SUNULMUYOR', () => {
    assert.match(screen, /if \(!ok \|\| !appointment\) return;/);
});

test('yerel hâl efektle DEĞİL türetmeyle bırakılıyor', () => {
    // Efekt içinde `setState` basamaklı çizim üretiyor ve bu projede sert
    // hata. Sunucunun bizi yakalayıp yakalamadığı damga karşılaştırmasıyla
    // cevaplanıyor.
    assert.match(screen, /const usesLocal = local !== null && data\.updatedAt === local\.from;/);
    // Kural EFEKTİN VARLIĞI değil, efektin yerel hâle DOKUNMASI: ekranda
    // meşru bir efekt var (dakika sayacı) ve onu yasaklamak yanlış olurdu.
    for (const block of screen.split('useEffect(').slice(1)) {
        const body = block.slice(0, block.indexOf('}, ['));
        assert.doesNotMatch(body, /setLocal/, 'yerel hâl bir efektten sıfırlanıyor');
    }
});

test('"geldi" damgası TAM ZAMAN ve SUNUCU saatiyle yazıyor', () => {
    // "HH:MM:00" saat dilimsiz bir metindi. Cihaz saati de yetmezdi: telefon
    // kırk dakika ileriyse bekleme kırk dakika şişerdi. Akışla AYNI kaynak.
    assert.match(screen, /new Date\(data\.serverNow \+ \(Date\.now\(\) - data\.deviceAt\)\)\.toISOString\(\)/);
    assert.match(screen, /customer_arrived_at: stamp \}/);
});

test('okunamayan randevu SİLİNMİŞ gibi görünmüyor', () => {
    assert.match(screen, /what="Randevuyu"/);
    assert.match(screen, /notMeaning="Silinmiş olduğu"/);
    // "Bulunamadı" YALNIZ okuma başarılıyken.
    assert.match(screen, /\) : state === 'ok' \? \(\s*\n\s*<Empty title="Randevu bulunamadı"/);
});
