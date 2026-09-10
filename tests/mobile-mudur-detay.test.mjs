/**
 * Müdür 25 — randevu kartı, düzenleme ve taşıma sonucu.
 *
 * Bu dosyanın koruduğu şey ÖLÜ KONTROL YOKLUĞU: chevron gösteren her satır
 * bir şey açar, her düğme bir şey yapar, hiçbir metin yapılmayan bir şeyi
 * yapıldı diye yazmaz.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 25 Randevu Karti.html`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CANCELLED_INFO, CANCEL_HINT, DELETE_HINT, DELETE_HINT_LONG, NOTE_HINT,
    applyNote, applyService, changeRows, changeTiles, confirmCopy,
    destructiveOptions, destructiveTitle, durationMinutes, identityOf,
    isEditable, priceOfService, serviceChoices, serviceSheetSubtitle,
    showsAttendance, splitName, stateLine, stateOf, visitSummary,
} from '../mobile/src/lib/appointmentDetail.ts';
// Baş harf üç ayrı yerden tek yere taşındı — bkz. `text.initialsOf`.
import { initialsOf } from '../mobile/src/lib/text.ts';
import { NOTE_MAX, NOTE_WARN } from '../mobile/src/theme/tokens.ts';

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const page = code('src/components/AppointmentDetail.tsx');
const parts = code('src/components/ApptParts25.tsx');
const sheets = code('src/components/ApptSheets.tsx');
const shell = code('src/components/Sheet.tsx');
const route = code('app/(manager-flow)/randevu/[id].tsx');
const tokens = read('src/theme/tokens.ts');

const base = {
    id: 'a1',
    customer_id: 'c1',
    customer_name: 'Elif Demir',
    customer_phone: '+905321230303',
    date: '2026-08-22',
    start_time: '10:30:00',
    end_time: '11:15:00',
    service: 'Keratin bakımı',
    service_color: '#8FA98C',
    status: 'confirmed',
    staff_id: 'selin',
    notes: null,
    customer_arrived_at: null,
    arrived_at: null,
    service_ended_at: null,
    info: { risk: null, pkg: null, visitNo: 3, lastVisit: '12 Tem', balance: 0 },
};

// ── Kimlik: GÜN BAŞLIKTA ────────────────────────────────────────────────────

test('gün artık başlıkta, satırın içinde saklı değil', () => {
    // Tarih yalnız "Saati değiştir" satırının içinde küçük gri metindeydi;
    // müdür başka güne bakarken bunu kaçırıyordu.
    const identity = identityOf(base, 'Selin', '2026-08-22');
    assert.equal(identity.day, 'Cumartesi 22 Ağustos');
    assert.equal(identity.isToday, true);
    assert.equal(identity.from, '10:30');
    assert.equal(identity.to, '11:15');
    assert.equal(identity.duration, 45);
    // Tek kelimelik adda İKİ harf: baş harf tek yere taşındı ve kural
    // sunucununkiyle eşitlendi (bkz. `text.initialsOf`). Tek bir "S" bir
    // kişiyi ayırt etmiyor ve aynı liste sunucudan gelen baş harflerle
    // yan yana duruyor.
    assert.equal(identity.initials, 'SE');
});

test('başka gün "Bugün" rozeti almaz', () => {
    assert.equal(identityOf(base, 'Selin', '2026-08-23').isToday, false);
});

test('atanmamış personel turuncu halka ALMAZ', () => {
    // Turuncu bu üründe zaman ve eylem taşır; atanmamışlık ikisi de değil.
    assert.equal(identityOf(base, null).staff, null);
    assert.match(parts, /assigned \? c\.or : c\.tx3/);
});

test('saat kırpılmaz, dar ekranda puntosu iner', () => {
    assert.match(parts, /small \? apptCardMetrics\.spanTextSmall : apptCardMetrics\.spanText/);
    assert.match(parts, /flexShrink: 0/);
    assert.match(tokens, /spanText: 26,/);
    assert.match(tokens, /spanTextSmall: 24,/);
});

test('ad ikiye ayrılır: ilk ad ince, soyadı kalın', () => {
    assert.deepEqual(splitName('Elif Demir'), { given: 'Elif', family: 'Demir' });
    assert.deepEqual(splitName('Ayşe'), { given: '', family: 'Ayşe' });
    assert.equal(initialsOf('elif demir'), 'ED');
    assert.equal(durationMinutes(base), 45);
});

// ── Durum: beş hâl, tek alan ────────────────────────────────────────────────

test('beş hâl tek alandan türer', () => {
    assert.equal(stateOf(base), 'waiting');
    assert.equal(stateOf({ ...base, customer_arrived_at: '09:38:00' }), 'arrived');
    assert.equal(stateOf({ ...base, arrived_at: '10:31:00' }), 'running');
    assert.equal(stateOf({ ...base, service_ended_at: '11:20:00' }), 'done');
    assert.equal(stateOf({ ...base, status: 'cancelled' }), 'cancelled');
});

test('iki geliş damgası KARIŞMAZ', () => {
    // `customer_arrived_at` müşterinin salona gelişi (müdür basar),
    // `arrived_at` hizmetin başlangıcı (personel basar).
    const arrived = { ...base, customer_arrived_at: '09:38:00' };
    assert.equal(stateOf(arrived), 'arrived');
    assert.equal(stateOf({ ...arrived, arrived_at: '10:31:00' }), 'running');
});

test('durum kelimesi HER HÂLDE yazılı', () => {
    const words = ['waiting', 'arrived', 'running', 'done', 'cancelled'].map((kind) => {
        const patch = kind === 'arrived' ? { customer_arrived_at: '09:38:00' }
            : kind === 'running' ? { arrived_at: '10:31:00' }
                : kind === 'done' ? { service_ended_at: '11:20:00' }
                    : kind === 'cancelled' ? { status: 'cancelled' } : {};
        return stateLine({ ...base, ...patch }, 10 * 60 + 20).word;
    });
    assert.deepEqual(words, [
        'Bekliyor', 'Geldi · bekliyor', 'İşlem sürüyor', 'Tamamlandı', 'İptal edildi',
    ]);
});

test('bağlam UYDURULMAZ: damga yoksa saat yazılmaz', () => {
    assert.equal(stateLine({ ...base, arrived_at: null, status: 'completed' }, 600).context, null);
    assert.equal(
        stateLine({ ...base, customer_arrived_at: '09:38:00' }, 600).context,
        '09:38’de geldi',
    );
});

test('bekleyen randevu saatine olan uzaklığı söyler', () => {
    assert.equal(stateLine(base, 10 * 60 + 20).context, '10 dk sonra');
    assert.equal(stateLine(base, 10 * 60 + 50).context, '20 dk önce');
    assert.equal(stateLine(base, 10 * 60 + 30).context, 'Şimdi');
});

test('nabız YALNIZ işlem sürerken atar', () => {
    assert.equal(stateLine({ ...base, arrived_at: '10:31:00' }, 640).pulse, true);
    assert.equal(stateLine({ ...base, customer_arrived_at: '09:38:00' }, 640).pulse, false);
});

// ── Geldi / Gelmedi ─────────────────────────────────────────────────────────

test('Geldi/Gelmedi yalnız bekleyende ÇİZİLİR, ötekilerde YOK', () => {
    assert.ok(showsAttendance(base));
    for (const patch of [
        { customer_arrived_at: '09:38:00' },
        { arrived_at: '10:31:00' },
        { service_ended_at: '11:20:00' },
        { status: 'cancelled' },
        { status: 'completed' },
    ]) {
        assert.equal(showsAttendance({ ...base, ...patch }), false, JSON.stringify(patch));
    }
    // Devre dışı gri buton değil, YOKLUK.
    assert.match(page, /\{renderAttendance \? \(/);
    assert.ok(!/disabled=\{!showsAttendance/.test(page));
});

test('"Geldi" müşterinin GELİŞİNİ damgalar, hizmeti başlatmaz', () => {
    // Hizmeti personel başlatır; `arrived_at` müdürün basacağı damga değil.
    assert.match(route, /customer_arrived_at: `\$\{hhmm\(now\)\}:00`/);
    assert.ok(!/arrived_at: `\$\{hhmm/.test(route.replace(/customer_arrived_at/g, '')));
});

// ── Müşteri özeti: iki anatomi ──────────────────────────────────────────────

test('geçmişi bilinen müşteri krem kart ve OK taşır', () => {
    const summary = visitSummary(base);
    assert.equal(summary.kind, 'known');
    assert.equal(summary.opens, true);
    assert.equal(summary.headline, '3. ziyaret');
    assert.equal(summary.sub, 'Son: 12 Tem');
    assert.deepEqual(summary.chips, ['Bakiye ₺0', '0532 ••• 03 03']);
});

test('geçmişi bilinmeyen müşteride BOŞLUK değil "yeni müşteri" var', () => {
    const summary = visitSummary({
        ...base,
        info: { risk: null, pkg: null, visitNo: null, lastVisit: null },
    });
    assert.equal(summary.kind, 'new');
    assert.equal(summary.headline, 'Yeni müşteri');
    // Sıfır bir ÖLÇÜM, "İlk" bir HÂL.
    assert.equal(summary.lead, 'İlk');
    // Bakiyesi olmayan müşteri için "Bakiye ₺0" bilgi değil gürültü.
    assert.ok(!summary.chips.some((chip) => chip.startsWith('Bakiye')));
    // Açacak kart yok → OK DA YOK.
    assert.equal(summary.opens, false);
});

test('ok yalnız açacak bir şey varsa çizilir', () => {
    assert.match(parts, /summary\.opens && onOpen \? \(/);
});

test('bilinmeyen bakiye rozet üretmez', () => {
    const summary = visitSummary({ ...base, info: { ...base.info, balance: undefined } });
    assert.deepEqual(summary.chips, ['0532 ••• 03 03']);
});

test('paket varsa ilerleme gösterilir', () => {
    const summary = visitSummary({
        ...base,
        info: { risk: null, pkg: { name: 'Lazer', used: 3, total: 8 }, visitNo: null, lastVisit: '2 Ağu' },
    });
    assert.equal(summary.lead, '3');
    assert.equal(summary.trailing, '/8');
    assert.equal(summary.headline, 'Lazer · 3/8');
});

// ── Değiştir: iki jeton + iki satır ─────────────────────────────────────────

test('dört eşit satır İKİYE ayrıldı', () => {
    const tiles = changeTiles(base, 'Selin');
    const rows = changeRows(base);
    assert.deepEqual(tiles.map((tile) => tile.action), ['time', 'staff']);
    assert.deepEqual(rows.map((row) => row.action), ['service', 'note']);
    // Jeton h84, satır h62 — hiyerarşi tek bakışta okunur.
    assert.match(tokens, /tileHeight: 84,/);
    assert.match(tokens, /rowHeight: 62,/);
});

test('jeton NE OLDUĞUNU söyler, vaat etmez', () => {
    const [time, staff] = changeTiles(base, 'Selin');
    assert.equal(time.kicker, 'Saati değiştir');
    assert.equal(time.value, 'Cmt 10:30');
    assert.equal(staff.value, 'Selin');
    assert.equal(staff.initials, 'SE');
    assert.equal(changeTiles(base, null)[1].value, 'Atanmamış');
    assert.equal(changeTiles(base, null)[1].initials, undefined);
});

test('satır değeri ücreti taşır, ücret kırpılmaz', () => {
    const [service, note] = changeRows(base);
    assert.equal(service.value, 'Keratin bakımı · ₺1.800');
    assert.equal(note.value, 'Not yok');
    assert.equal(priceOfService('Keratin bakımı'), 1800);
    assert.equal(priceOfService('Olmayan hizmet'), null);
    assert.equal(changeRows({ ...base, service: 'Olmayan hizmet' })[0].value, 'Olmayan hizmet');
    assert.match(parts, /ellipsizeMode="tail"/);
});

test('dolu not önizleme olarak görünür', () => {
    assert.equal(changeRows({ ...base, notes: 'Saç boyası alerjisi var' })[1].value, 'Saç boyası alerjisi var');
});

test('her chevron gerçekten bir şey açıyor', () => {
    // Bu sayfanın en büyük şikâyeti buydu: chevron gösterip hiçbir şey
    // açmayan satırlar.
    assert.match(page, /setSheet\(action === 'service' \? 'service' : 'note'\)/);
    assert.match(page, /<ServiceSheet/);
    assert.match(page, /<NoteSheet/);
});

// ── B · Hizmeti değiştir ────────────────────────────────────────────────────

test('çakışma SEÇMEDEN ÖNCE yazılı ve engellemiyor', () => {
    const blocking = {
        ...base, id: 'a2', start_time: '11:00:00', end_time: '12:30:00', service: 'Saç boyama',
    };
    const choices = serviceChoices(base, [base, blocking], 'Selin');
    const boya = choices.find((choice) => choice.name === 'Saç boyama');
    assert.equal(boya.clash, 'Selin · 11:00–12:30 ile çakışır');
    // Engellenmiyor: müdür bilerek çakıştırabilir.
    assert.ok(!('disabled' in boya));
    const kas = choices.find((choice) => choice.name === 'Kaş alma');
    assert.equal(kas.clash, null);
});

test('uzayan süre işaretli, seçili hizmet işaretli', () => {
    const choices = serviceChoices(base, [base], 'Selin');
    assert.equal(choices.find((choice) => choice.name === 'Keratin bakımı').selected, true);
    assert.equal(choices.find((choice) => choice.name === 'Saç boyama').longer, true);
    assert.equal(choices.find((choice) => choice.name === 'Kaş alma').longer, false);
});

test('hizmet değişince BLOK UZAR', () => {
    const boya = serviceChoices(base, [base], 'Selin').find((choice) => choice.name === 'Saç boyama');
    const next = applyService(base, boya);
    assert.equal(next.service, 'Saç boyama');
    assert.equal(next.end_time, '12:00:00');
    assert.equal(next.start_time, '10:30:00');
});

test('sheet hangi randevuyu değiştirdiğini KENDİ söyler', () => {
    const subtitle = serviceSheetSubtitle(base, 'Selin');
    assert.match(subtitle, /Elif Demir/);
    assert.match(subtitle, /Cumartesi 10:30/);
    assert.match(subtitle, /Selin ile/);
    assert.match(subtitle, /Süre değişirse randevu bloğu uzar/);
});

test('Kaydet seçim yapılana kadar SÖNÜK', () => {
    assert.match(sheets, /actionOn=\{chosen !== null\}/);
    assert.match(sheets, /actionOn \? c\.or : c\.tx3/);
});

// ── C · Notu düzenle ────────────────────────────────────────────────────────

test('not SALONUN, müşteriye gitmez', () => {
    assert.match(NOTE_HINT, /Müşteri görmez/);
    // Uygulamanın bir şey gönderdiği izlenimi vermiyor.
    assert.ok(!/gönder|ilet|bildir/i.test(NOTE_HINT));
});

test('boş not SİLME demek ve onay sormaz', () => {
    assert.equal(applyNote(base, '   ').notes, null);
    assert.equal(applyNote(base, ' Alerjisi var ').notes, 'Alerjisi var');
    assert.ok(!/silinsin mi\?/i.test(sheets.split('ConfirmDialog')[0]));
});

test('280 karakter sert sınır, 240 amber', () => {
    assert.equal(NOTE_MAX, 280);
    assert.equal(NOTE_WARN, 240);
    assert.match(sheets, /maxLength=\{NOTE_MAX\}/);
    assert.match(sheets, /warn \? c\.am : c\.tx3/);
});

test('Kaydet klavyenin üstünde DEĞİL, başlığın sağında', () => {
    // Alan büyüdükçe düğme kaymaz ve yanlışlıkla basılması zorlaşır.
    assert.match(sheets, /<SheetHeading\s+title=\{NOTE_TITLE\}/);
});

// ── D · İki onay, aynı iskelet, farklı ağırlık ──────────────────────────────

test('iptalin de kendi onayı var — eskiden sessizce kapanıyordu', () => {
    const copy = confirmCopy('cancel', base, 'Selin');
    assert.equal(copy.title, 'Randevu iptal edilsin mi?');
    assert.equal(copy.line, 'Cumartesi 22 Ağustos · 10:30 – 11:15 · Selin');
    assert.equal(copy.name, 'Elif Demir');
    assert.equal(copy.hold, false);
    assert.equal(copy.cancel, 'Vazgeç');
});

test('silme BASILI TUTMA ister; iptal tek dokunuş', () => {
    // Fark bir kelimede değil bir jestte — okumadan geçen müdür bile durur.
    assert.equal(confirmCopy('delete', base).hold, true);
    assert.match(sheets, /delayLongPress=\{apptMotion\.hold\}/);
    assert.match(tokens, /hold: 600,/);
    // Basılı tut çubuğu uygulamanın BAŞKA hiçbir yerinde yok.
    assert.equal((sheets.match(/holdBorder/g) ?? []).length, 1);
});

test('iptal cümlesi müşteriye haber gittiğini İDDİA ETMEZ', () => {
    const cancel = destructiveOptions.find((option) => option.action === 'cancel');
    assert.match(cancel.body, /Müşteriye otomatik haber gitmez, siz arayın/);
    assert.ok(!/haber gider/.test(cancel.body));
});

test('silme cümlesi "Gelmedi"yi işaret eder', () => {
    const remove = destructiveOptions.find((option) => option.action === 'delete');
    assert.match(remove.body, /geri gelmez/);
    assert.match(remove.body, /Gelmedi/);
    assert.equal(remove.danger, true);
});

test('uzun uyarı SAYFADAN kalktı, karar anına taşındı', () => {
    assert.equal(DELETE_HINT, 'Geri alınamaz');
    assert.equal(CANCEL_HINT, 'Takvimde kalır, iptal işaretlenir');
    assert.equal(DELETE_HINT_LONG, 'Geri alınamaz · takvimden tamamen kalkar');
    assert.ok(!/Silinen randevu geri gelmez/.test(page));
});

test('DOLU buton güvenli olanı taşır, kırmızı dolu buton YOK', () => {
    assert.match(sheets, /backgroundColor: c\.tx,[\s\S]{0,600}\{copy\.cancel\}/);
    // Yıkıcı düğmeler KENARLIKLI: dolu kırmızı buton yanlışlıkla basılacak
    // kadar davetkâr. Kırmızı dolgu yalnız basılı tut ÇUBUĞUNDA var, ve o
    // bir düğme değil bir göstergedir.
    for (const block of sheets.split('<Pressable').slice(1)) {
        assert.ok(!/backgroundColor: c\.rd/.test(block.split('</Pressable>')[0]));
    }
    assert.ok(!/backgroundColor: c\.rd/.test(parts));
});

test('diyalog sheet değil, ORTADA', () => {
    // Sheet "devam eden bir iş", diyalog "duran bir karar".
    assert.match(sheets, /justifyContent: 'center',[\s\S]{0,120}paddingHorizontal: apptCardMetrics\.dlgInset/);
    assert.match(sheets, /outputRange: \[apptMotion\.dialog\.from, 1\]/);
});

// ── İptal edilmiş randevu ───────────────────────────────────────────────────

test('iptal edilmişte jeton ve satır HİÇ ÇİZİLMEZ', () => {
    assert.equal(isEditable({ ...base, status: 'cancelled' }), false);
    assert.equal(isEditable(base), true);
    assert.match(page, /\{editable \? \(/);
    assert.match(page, /<InfoLine text=\{CANCELLED_INFO\}/);
    assert.match(CANCELLED_INFO, /Yeni randevu verin/);
});

test('iptal edilmişte "iptal et" satırı yok', () => {
    assert.match(page, /editable && stateOf\(appointment\) !== 'done' \?/);
});

test('menü başlığı tek biçim', () => {
    assert.equal(destructiveTitle(base), 'Elif Demir · 10:30');
});

// ── Hareket ─────────────────────────────────────────────────────────────────

test('kademeli giriş: üç kademe, 60 ms arayla', () => {
    assert.match(tokens, /stage: \{ duration: 240, steps: \[40, 100, 160\] as const, rise: 10 \}/);
    assert.match(page, /<Stage at=\{0\}/);
    assert.match(page, /<Stage at=\{1\}/);
    assert.match(page, /<Stage at=\{2\}/);
});

test('"Geldi"ye basış TAKAS: şeridin yüzeyi kıpırdamaz', () => {
    assert.match(tokens, /arrive: \{ out: 160, in: 220, delay: 60, lift: 6, rise: 8, press: 110, pressScale: 0\.97 \}/);
    // Çıkan butonlar, giren şerit içeriği — yüzey ikisinin de dışında.
    assert.match(page, /Animated\.timing\(leaving, \{\s*toValue: 0,\s*duration: apptMotion\.arrive\.out/);
    assert.match(page, /delay: apptMotion\.arrive\.delay/);
    assert.match(parts, /entering: Animated\.Value/);
});

test('yükseklik animasyonu YOK — takas opaklıkla', () => {
    for (const file of [page, parts, sheets, shell]) {
        assert.ok(!/LayoutAnimation/.test(file));
        assert.ok(!/Animated\.timing\([^)]*height/.test(file));
    }
});

test('hareket yalnız native sürücüde', () => {
    for (const file of [page, parts, sheets, shell]) {
        assert.ok(!/useNativeDriver: false/.test(file));
    }
});

test('"Hareketi azalt" her yerde karşılanıyor', () => {
    assert.match(parts, /if \(reduceMotion\)/);
    assert.match(sheets, /if \(reduceMotion\)/);
    assert.match(shell, /if \(reduceMotion\)/);
    // Bilgi harekete emanet edilmiyor: kelime her hâlde yazılı.
    assert.match(page, /reduceMotion/);
});

test('sheet 300 açılır, 240 kapanır', () => {
    assert.match(tokens, /sheet: \{ in: 300, out: 240 \}/);
    assert.match(shell, /visible \? apptMotion\.sheet\.in : apptMotion\.sheet\.out/);
    // Modal'ın kendi eğrisi dayatılmıyor.
    assert.match(shell, /animationType="none"/);
});

// ── Ölçüler: CSS ile birebir ────────────────────────────────────────────────

test('ölçüler tasarımın CSS’iyle birebir', () => {
    const slice = tokens.slice(tokens.indexOf('export const apptCardMetrics'));
    const px = (key, value) => assert.match(slice, new RegExp(`${key}: ${value},`));

    px('stateHeight', 52);
    px('stateRadius', 14);
    px('stateWord', '15\\.5');
    px('stateDot', 9);
    px('actHeight', 66);
    px('actRadius', 18);
    px('tileRadius', 18);
    px('tileValue', 17);
    px('rowValueMax', 190);
    px('dlgBtnHeight', 52);
    px('moveBtnHeight', 60);
    px('moveTime', 22);
    px('sheetRadius', 22);
});

// ── Ziyaret kartı ve katılım ────────────────────────────────────────────────

test('yuvarlak KİMLİĞİ taşır — başlıktaki rakamı ikinci kez yazmaz', () => {
    const known = visitSummary({
        ...base,
        customer_name: 'Elif Demir',
        info: { risk: null, pkg: null, visitNo: 3, lastVisit: '12 Tem' },
    });
    assert.equal(known.initials, 'ED');
    const parts = code('src/components/ApptParts25.tsx');
    assert.match(parts, /\{summary\.initials\}/);
});

test('"Gelmedi" kaldırıldı — hiçbir yere yazmıyordu', () => {
    const parts = code('src/components/ApptParts25.tsx');
    assert.doesNotMatch(parts, /label="Gelmedi"/);
    // Gelmemek beyan edilmez, türetilir; önceden biliniyorsa doğru eylem iptal.
    assert.match(parts, /label="Geldi"/);
});

test('zaman damgası ISO da olsa saat yazılır — "2026-’de" çıkmaz', () => {
    const running = stateLine({
        ...base,
        arrived_at: '2026-08-13T10:32:00+03:00',
        service_ended_at: null,
    }, 11 * 60);
    assert.equal(running.context, '10:32’de başladı');
    // Saat sütunu biçimi de çalışır.
    const plain = stateLine({
        ...base, arrived_at: '10:32:00', service_ended_at: null,
    }, 11 * 60);
    assert.equal(plain.context, '10:32’de başladı');
});

test('uzak randevu dakika yığını olarak yazılmaz', () => {
    const far = stateLine({
        ...base,
        start_time: '12:00', arrived_at: null, customer_arrived_at: null,
        service_ended_at: null, status: 'confirmed',
    }, 2 * 60 + 15);
    assert.equal(far.context, '9 sa 45 dk sonra');
});

// ── Notlardan gelen dört hata ───────────────────────────────────────────────

test('not sayfası klavyenin altında kalmaz', () => {
    const sheet = code('src/components/Sheet.tsx');
    assert.match(sheet, /KeyboardAvoidingView/);
    // Android klavyeyi kendi yönetir; iOS'ta sayfa yukarı itilir.
    assert.match(sheet, /Platform\.OS === 'ios' \? 'padding' : undefined/);
});

test('taşıma KAYNAĞA yazılır — kartı kapatınca eski saate dönmez', () => {
    const detail = code('app/(manager-flow)/randevu/[id].tsx');
    assert.match(detail, /updateLocalAppointment\(moved\)/);
    const calendar = code('app/mudur/calendar.tsx');
    assert.match(calendar, /updateLocalAppointment\(moved\)/);
});

test('taşınan randevu eski gününde KALMAZ', () => {
    const src = code('src/lib/calendarSource.ts');
    const fn = src.slice(src.indexOf('export function updateLocalAppointment'));
    // Gün değiştiyse eski günden çıkarılmalı, yoksa randevu iki yerde durur.
    assert.match(fn.slice(0, 700), /findIndex\(\(candidate\) => candidate\.id === appointment\.id\)/);
    assert.match(fn.slice(0, 700), /splice\(at, 1\)/);
});

test('aynı gün aynı anda iki kez istenmez', () => {
    const src = code('src/lib/calendarSource.ts');
    assert.match(src, /dayInFlight/);
    // Önbellek DEĞİL: cevap dönünce kayıt silinir, yoksa yeni randevu görünmezdi.
    assert.match(src, /finally\(\(\) => \{ dayInFlight\.delete\(date\); \}\)/);
});

test('klavye kapsayıcısı sayfanın esneme zincirini bozmaz', () => {
    // `flex:1` verilmezse kapsayıcı içeriği kadar büzülüyor ve içerideki
    // maxHeight:'88%' sıfır yükseklikli kaba göre çözülüyor: sayfa altta
    // ince bir şeride iniyor, gövdesi hiç görünmüyor.
    const sheet = code('src/components/Sheet.tsx');
    assert.match(sheet, /KeyboardAvoidingView[\s\S]{0,220}style=\{\{ flex: 1, justifyContent: 'flex-end' \}\}/);
});

test('aydınlık temada yüzeyler kenarlıkla ayrışır', () => {
    // #FAF7F3 üstünde #F0E9DF dolgu tek başına şekli göstermiyor.
    const parts = code('src/components/ApptParts25.tsx');
    const strip = parts.slice(parts.indexOf('export function StateStrip'));
    assert.match(strip.slice(0, 900), /backgroundColor: c\.surf2,[\s\S]{0,120}borderColor: c\.bd/);
    const tiles = parts.slice(parts.indexOf('export function ChangeTiles'));
    assert.match(tiles.slice(0, 2000), /backgroundColor: c\.surf2,[\s\S]{0,120}borderColor: c\.bd/);
});

// ── Hata ≠ boş ──────────────────────────────────────────────────────────────

test('okunamayan gün "randevu silinmiş" DEMİYOR', () => {
    // `.catch(() => setLoaded(true))` ile hata, "bulunamadı" ekranına
    // dönüşüyordu: ağ kesintisi müdüre randevunun SİLİNDİĞİNİ söylüyordu.
    // İkisi ayrı hâl ve ayrı cümle; aynı bileşen, değişen tek şey söz.
    const screen = code('app/(manager-flow)/randevu/[id].tsx');
    assert.doesNotMatch(screen, /\.catch\(\(\) => \{ if \(alive\) setLoaded\(true\); \}\)/);
    assert.match(screen, /setFailed\(true\);\s*setLoaded\(true\);/);
    assert.match(screen, /\) : failed \? \(/);
    assert.match(screen, /title="Randevu okunamadı"/);
    // "Bulunamadı" hâli KALIYOR — gerçekten silinmiş randevu için doğru cevap.
    assert.match(screen, /title="Randevu bulunamadı"/);
});

test('başarılı okuma önceki hatayı TEMİZLİYOR', () => {
    // Kalsaydı, hata sonrası bulunamayan bir randevu "okunamadı" derdi.
    const screen = code('app/(manager-flow)/randevu/[id].tsx');
    assert.match(screen, /setFailed\(false\);\s*setLoaded\(true\);/);
});
