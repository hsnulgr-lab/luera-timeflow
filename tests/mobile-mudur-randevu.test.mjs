import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BLOCK_GAP, DAY_SECTIONS, LABEL_TOP, OPEN_FROM, OPEN_TO, PAGE_COUNT, SLOT_ROW,
    SLOT_STEP, actionLabel, backPhase, blockHeight, blockLabels, blockRowHeight,
    blockTicks, canCreate, customerName, dayOptions, emptyDraft, filterCustomers,
    formatPhoneInput, formatPrice, formatRange, freeLabel, isValidNewCustomer,
    isValidPhone, maskPhone, mockCustomers, phoneDigits, phoneNote, toE164,
    draftToAppointment, mockServices, newCustomerLabel, nextPhase,
    page1Answered, pageName, railSections,
    recentCustomers, sectionOf, slotRows, slotSpeech, stepLabel, summaryRows, trLower,
    untilLabel,
} from '../mobile/src/lib/createFlow.ts';
import { addDaysISO, dayNameShort, dayNumber, daysBetween, formatDayLong } from '../mobile/src/lib/calendar.ts';
import { NO_PHONE_REASON, sendGate } from '../mobile/src/lib/apptConfirm.ts';

// Müdür 15 — randevu oluştur.
//
// Bu dosyanın koruduğu şey: İKİ SAYFA (beşinci bir özet adımı yok), "Dolu"nun
// hiçbir yerde tek başına cevap olmaması, blok yüksekliğinin SÜREDEN türemesi
// ve camın içerik katmanına inmemesi.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
/** Yorumlar eşleşmeye karışmasın: iddialar gerçek koda bakmalı. */
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const flow = code('src/components/CreateFlow.tsx');
const parts = code('src/components/ApptParts.tsx');
const lib = code('src/lib/createFlow.ts');
const tokens = code('src/theme/tokens.ts');
const screen = code('app/(manager)/create.tsx');
const calendar = code('app/(manager)/calendar.tsx');
const design = readFileSync(
    new URL('../docs/design-reference/Luera Mobil - Mudur 15 Randevu Olustur.html', import.meta.url),
    'utf8',
);

const staff = [
    { id: 'merve', initials: 'MK', name: 'Merve', available: true },
    { id: 'selin', initials: 'SD', name: 'Selin', available: true },
];
const closedStaff = [
    { id: 'gul', initials: 'GT', name: 'Gül', available: false, reason: 'izinli' },
    { id: 'kaan', initials: 'KB', name: 'Kaan', available: false, reason: 'çalışmıyor' },
];

const appt = (id, start, end, staffId, extra = {}) => ({
    id, customer_id: null, customer_name: 'Zeynep Kaya', customer_phone: null,
    date: '2026-08-13', start_time: start, end_time: end, service: 'Saç boyama',
    service_color: '#7E93A8', status: 'confirmed', staff_id: staffId, notes: null,
    arrived_at: null, service_ended_at: null, ...extra,
});

// ── İki sayfa ───────────────────────────────────────────────────────────────

test('akış iki sayfa; beşinci bir özet adımı yok', () => {
    assert.equal(PAGE_COUNT, 2);
    assert.equal(stepLabel(1), '1 / 2');
    assert.equal(stepLabel(2), '2 / 2');
    assert.equal(pageName(1), 'Kim ve ne');
    assert.equal(pageName(2), 'Ne zaman');
    // Özet bir SAYFA değil: alt çubuğun içinde yaşıyor.
    assert.ok(!/'summary'/.test(lib));
});

test('sayfa 1 iki soruyu birlikte cevaplıyor', () => {
    let draft = emptyDraft();
    assert.equal(nextPhase(draft), 1);
    assert.ok(!page1Answered(draft));

    draft = { ...draft, customer: mockCustomers[0] };
    // Müşteri yeter değil: hizmet de aynı sayfada.
    assert.ok(!page1Answered(draft));
    assert.equal(nextPhase(draft), 1);

    draft = { ...draft, service: mockServices[0] };
    assert.ok(page1Answered(draft));
    assert.equal(nextPhase(draft), 2);
});

test('geri sayfa 1e döner, sayfa 1de akış kapanır', () => {
    assert.equal(backPhase(2), 1);
    assert.equal(backPhase(1), null);
});

test('pasif buton neyin eksik olduğunu söyler', () => {
    const empty = emptyDraft();
    assert.deepEqual(actionLabel(1, empty), { label: 'Müşteri ve hizmet seçin', enabled: false });

    const withCustomer = { ...empty, customer: mockCustomers[0] };
    assert.deepEqual(actionLabel(1, withCustomer), { label: 'hizmet seçin', enabled: false });

    const ready1 = { ...withCustomer, service: mockServices[0] };
    assert.deepEqual(actionLabel(1, ready1), { label: 'Devam', enabled: true });

    const onDay = { ...ready1, dateISO: '2026-08-13' };
    assert.deepEqual(actionLabel(2, onDay), { label: 'Saat seçin', enabled: false });

    const done = { ...onDay, startMinutes: 11 * 60, staffId: 'merve' };
    assert.deepEqual(actionLabel(2, done), { label: 'Randevuyu oluştur', enabled: true });
    assert.ok(canCreate(done));
});

test('takvimden gelince gün ve saat ön dolu, kilitli', () => {
    const draft = emptyDraft({ dateISO: '2026-08-14', startMinutes: 600, staffId: 'merve' });
    assert.deepEqual(draft.locked, ['date', 'slot']);
    assert.equal(draft.startMinutes, 600);
    // Sayfa 1 hâlâ soruluyor: kim ve ne hiçbir zaman ön dolu gelmiyor.
    assert.equal(nextPhase(draft), 1);
});

test('yarım ön dolgu saati kilitlemez', () => {
    const draft = emptyDraft({ dateISO: '2026-08-14', startMinutes: 600 });
    assert.deepEqual(draft.locked, ['date']);
    assert.equal(draft.startMinutes, null);
});

// ── Gün bölümleri — v1'de iki tema iki farklı sınır anlatıyordu ─────────────

test('gün bölümlerinin sınırı SABİT ve tek kaynaktan', () => {
    assert.deepEqual(DAY_SECTIONS.map((s) => [s.title, s.from, s.to]), [
        ['Sabah', 9 * 60, 12 * 60],
        ['Öğleden sonra', 12 * 60, 17 * 60],
        ['Akşam', 17 * 60, 20 * 60],
    ]);
    // Sınırlar salonun açık olduğu aralığı kesintisiz kaplar.
    assert.equal(DAY_SECTIONS[0].from, OPEN_FROM);
    assert.equal(DAY_SECTIONS.at(-1).to, OPEN_TO);
    for (let i = 1; i < DAY_SECTIONS.length; i += 1) {
        assert.equal(DAY_SECTIONS[i].from, DAY_SECTIONS[i - 1].to);
    }
});

test('12:30 tek bir bölüme ait', () => {
    assert.equal(sectionOf(11 * 60 + 30).key, 'morning');
    assert.equal(sectionOf(12 * 60).key, 'afternoon');
    assert.equal(sectionOf(12 * 60 + 30).key, 'afternoon');
    assert.equal(sectionOf(17 * 60).key, 'evening');
});

test('bölüm sayacı veriden çıkar', () => {
    assert.equal(freeLabel(0), 'dolu');
    assert.equal(freeLabel(2), '2 boş');
});

// ── Blok ölçüsü SÜREDEN türer ──────────────────────────────────────────────
//
// Tasarım belgesi dolu bloğa 96 sabit yükseklik vermişti; o yükseklik sürenin
// karşılığı değildi ve kart "10:30'a" derken sütun 10:00'da bitiyordu. Blok
// alt kenarı yalan söylememeli.

test('kısa hizmette blok bir hücrenin altına inmez', () => {
    // Kaş alma 20 dk. Izgara adımı 30; o hücre tamamen işgal ediliyor.
    // 29 pt'lik bir blok süreyi değil hücreyi yanlış anlatırdı.
    assert.equal(blockHeight(20), SLOT_ROW);
    // Ve içerik bloğu büyütmüyor: kısa blokta İÇERİK küçülüyor.
    assert.match(tokens, /blockWideAt:\s*88/);
    assert.match(tokens, /blockTightAt:\s*66/);
    assert.ok(parts.includes('const tight ='));
    assert.ok(parts.includes('const single ='));
});

test('blok yüksekliği süreden türer, sabitlenmez', () => {
    assert.equal(SLOT_ROW, 44);
    assert.equal(BLOCK_GAP, 8);
    assert.equal(blockHeight(75), 110);
    assert.equal(blockHeight(90), 132);
    assert.equal(blockHeight(30), 44);
    // Rayda kapladığı yer blok + nefes.
    assert.equal(blockRowHeight(75), 118);
    // Seçili blok da dolu blok da AYNI formülden geçer.
    assert.equal(blockHeight(90), blockHeight(30) * 3);
});

test('blok içindeki tikler 30 dakikayı işaretler', () => {
    assert.deepEqual(blockTicks(75), [36, 80]);
    assert.deepEqual(blockTicks(90), [36, 80]);
    // Tek kutuluk hizmette bölecek bir şey yok.
    assert.deepEqual(blockTicks(30), []);
});

test('bloğun solundaki saatler bloğun içini anlatır', () => {
    assert.deepEqual(blockLabels(11 * 60, 75), [
        { time: '11:00', top: LABEL_TOP, lead: true },
        { time: '11:30', top: LABEL_TOP + SLOT_ROW, lead: false },
        { time: '12:00', top: LABEL_TOP + SLOT_ROW * 2, lead: false },
    ]);
});

// ── "14:30'a" ───────────────────────────────────────────────────────────────

test('bitiş saati Türkçe okunuşuna göre ek alır', () => {
    assert.equal(untilLabel('10:30'), "10:30'a");
    assert.equal(untilLabel('09:50'), "09:50'ye");
    assert.equal(untilLabel('13:20'), "13:20'ye");
    assert.equal(untilLabel('12:15'), "12:15'e");
    // Saat başları saatin okunuşundan: "on altıya" ama "on ikiye".
    assert.equal(untilLabel('16:00'), "16:00'ya");
    assert.equal(untilLabel('12:00'), "12:00'ye");
});

// ── Ray ─────────────────────────────────────────────────────────────────────

test('"Dolu" tek başına cevap değil: kim, hangi aralık', () => {
    const appointments = [
        appt('a', '11:00', '12:30', 'merve'),
        appt('b', '11:00', '12:30', 'selin'),
    ];
    const rows = slotRows({ appointments, staff, durationMinutes: 30 });
    const busy = rows.find((row) => row.minutes === 11 * 60);
    assert.equal(busy.kind, 'busy');
    assert.equal(busy.reason, 'Merve · 11:00–12:30');
    // Ray kartı sebebi parçalarına ayırıyor.
    assert.equal(busy.title, 'Merve · Saç boyama');
    assert.equal(busy.customer, 'Zeynep Kaya');
    assert.equal(busy.until, "12:30'a");
    assert.equal(busy.color, '#7E93A8');
});

test('ardışık dolu kutular tek karta toplanır', () => {
    const appointments = [
        appt('a', '09:00', '10:30', 'merve'),
        appt('b', '09:00', '10:30', 'selin'),
    ];
    const rows = slotRows({ appointments, staff, durationMinutes: 30 });
    const [morning] = railSections({ rows });
    const busy = morning.items.filter((item) => item.kind === 'busy');
    // Üç ayrı satır değil, üç kutuya yayılan TEK randevu.
    assert.equal(busy.length, 1);
    assert.equal(busy[0].span, 3);
    assert.equal(busy[0].time, '09:00');
    // Kart o kadar yer kaplıyor: yükseklik sürenin karşılığı.
    assert.equal(blockHeight(busy[0].span * 30), 132);
});

test('dolu ve kapalı satırlar RAYDAN KALKMAZ', () => {
    const appointments = [appt('a', '11:00', '12:30', 'merve'), appt('b', '11:00', '12:30', 'selin')];
    const rows = slotRows({ appointments, staff, durationMinutes: 30 });
    const sections = railSections({ rows });
    const kinds = sections.flatMap((s) => s.items.map((i) => i.kind));
    assert.ok(kinds.includes('busy'), 'dolu kutu listede kalmalı');

    const closed = railSections({ rows: slotRows({ appointments: [], staff: closedStaff, durationMinutes: 30 }) });
    const closedItems = closed.flatMap((s) => s.items);
    assert.ok(closedItems.length > 0);
    assert.ok(closedItems.every((item) => item.kind === 'closed'));
    assert.equal(closedItems[0].reason, 'Gül izinli · Kaan çalışmıyor');
});

test('seçili aralık, kapsadığı kutuların yerine geçer', () => {
    const rows = slotRows({ appointments: [], staff, durationMinutes: 75 });
    const sections = railSections({
        rows,
        selectedMinutes: 11 * 60,
        durationMinutes: 75,
        selectedStaff: staff[0],
    });
    const items = sections.flatMap((s) => s.items);
    const pick = items.find((item) => item.kind === 'pick');
    assert.ok(pick);
    assert.equal(pick.range, '11:00 – 12:15');
    assert.equal(pick.durationMinutes, 75);
    assert.equal(pick.staff.name, 'Merve');
    // 11:30 ve 12:00 ayrı satır olarak DURMAZ: blok onları temsil ediyor.
    assert.ok(!items.some((item) => item.kind === 'free' && (item.time === '11:30' || item.time === '12:00')));
    // 12:30 blokun dışında, yerinde.
    assert.ok(items.some((item) => item.kind === 'free' && item.time === '12:30'));
});

test('seçim bölümün sayacını düşürmez', () => {
    const rows = slotRows({ appointments: [], staff, durationMinutes: 30 });
    const before = railSections({ rows }).find((s) => s.section.key === 'morning').freeCount;
    const after = railSections({ rows, selectedMinutes: 11 * 60, durationMinutes: 30, selectedStaff: staff[0] })
        .find((s) => s.section.key === 'morning').freeCount;
    assert.equal(after, before);
});

test('sesli okumada sebep CÜMLENİN içinde geçer', () => {
    const appointments = [appt('a', '11:00', '12:30', 'merve'), appt('b', '11:00', '12:30', 'selin')];
    const rows = slotRows({ appointments, staff, durationMinutes: 30 });
    const items = railSections({ rows }).flatMap((s) => s.items);

    const busy = items.find((item) => item.kind === 'busy');
    const speech = slotSpeech(busy);
    assert.match(speech, /dolu/);
    assert.match(speech, /Merve/);
    assert.match(speech, /12:30/);

    const free = items.find((item) => item.kind === 'free');
    assert.match(slotSpeech(free), /boş/);
});

test('süre değişince ray değişir: 90 dakikalık hizmet daha az kutu bulur', () => {
    const short = slotRows({ appointments: [], staff, durationMinutes: 30 });
    const long = slotRows({ appointments: [], staff, durationMinutes: 90 });
    assert.ok(long.length < short.length);
    assert.equal(short.at(-1).minutes + 30, OPEN_TO);
    assert.equal(long.at(-1).minutes + 90, OPEN_TO);
});

test('salona sığmayan hizmet boş liste verir, uydurulmuş saat değil', () => {
    assert.deepEqual(slotRows({ appointments: [], staff, durationMinutes: 12 * 60 }), []);
});

test('iptal edilmiş randevu yer tutmaz', () => {
    const appointments = [
        appt('a', '11:00', '12:30', 'merve', { status: 'cancelled' }),
        appt('b', '11:00', '12:30', 'selin', { status: 'cancelled' }),
    ];
    const rows = slotRows({ appointments, staff, durationMinutes: 30 });
    assert.equal(rows.find((row) => row.minutes === 11 * 60).kind, 'free');
});

// ── Gün şeridi ──────────────────────────────────────────────────────────────

test('şerit 14 gün, geçmiş yok, ilk ikisi adıyla', () => {
    const options = dayOptions('2026-08-13', 14);
    assert.equal(options.length, 14);
    assert.equal(options[0].relative, 'Bugün');
    assert.equal(options[1].relative, 'Yarın');
    assert.equal(options[2].relative, null);
    for (const option of options) assert.ok(daysBetween('2026-08-13', option.iso) >= 0);
});

test('şeridin rakamı ve kısaltması hazır gelir', () => {
    const [today] = dayOptions('2026-08-26', 1);
    assert.equal(today.num, 26);
    assert.equal(today.short, 'Çar');
    assert.equal(dayNameShort('2026-08-26'), 'Çar');
    assert.equal(dayNumber('2026-08-26'), 26);
    assert.equal(formatDayLong('2026-08-14'), 'Cuma, 14 Ağustos');
    assert.equal(addDaysISO('2026-08-31', 1), '2026-09-01');
});

// ── Müşteri ─────────────────────────────────────────────────────────────────

test('Türkçe küçültme: I → ı, İ → i', () => {
    assert.equal(trLower('İLKNUR'), 'ilknur');
    assert.equal(trLower('ISIL'), 'ısıl');
});

test('adın başından tutan eşleşme öne geçer', () => {
    const list = [
        { id: 'a', name: 'Canihan Ak', phone: '+905000000001', hint: '' },
        { id: 'b', name: 'Nihan Arı', phone: '+905000000002', hint: '' },
    ];
    assert.deepEqual(filterCustomers(list, 'Nih').map((x) => x.id), ['b', 'a']);
    assert.deepEqual(filterCustomers(mockCustomers, '   '), []);
});

test('telefon ekranda ham gösterilmez', () => {
    assert.equal(maskPhone('+905321111290'), '0532 ••• 12 90');
    assert.ok(!maskPhone('+905321111290').includes('1111'));
});

test('bulunamayan müşteri aynı ekrandan eklenir', () => {
    assert.equal(newCustomerLabel(' Nih '), 'Yeni müşteri: “Nih”');
    assert.ok(!isValidNewCustomer(' a '));
    assert.ok(isValidNewCustomer('Nihan'));
    const draft = { ...emptyDraft(), newCustomerName: 'Ali Kaya' };
    assert.equal(customerName(draft), 'Ali Kaya');
});

test('yeni müşterinin telefonu sorulur ama zorunlu değil', () => {
    assert.equal(emptyDraft().newCustomerPhone, null);

    // Yazarken okunur, kaydederken E.164.
    assert.equal(formatPhoneInput('05321112233'), '0532 111 22 33');
    assert.equal(formatPhoneInput('+905321112233'), '0532 111 22 33');
    assert.equal(phoneDigits('+90 532 111 22 33'), '5321112233');
    assert.equal(toE164('0532 111 22 33'), '+905321112233');
    assert.equal(toE164('0532 111'), null);

    // Boş geçerli — isteğe bağlı. Yarım numara geçerli değil.
    assert.ok(isValidPhone(''));
    assert.ok(isValidPhone('0532 111 22 33'));
    assert.ok(!isValidPhone('0532 111'));
    assert.ok(!isValidPhone('0232 111 22 33'), 'cep değil');

    // Telefonsuz kaydın bedeli EKRANDA yazılı: hatırlatma WhatsApp'tan gidiyor.
    assert.match(phoneNote(null), /hat\u0131rlatma g\u00f6nderilemez/i);
    assert.match(phoneNote('0532 111 22 33'), /Hat\u0131rlatmalar/);
    assert.match(phoneNote('0532 111'), /eksik/i);
});

test('yarım numarayla devam edilmiyor', () => {
    const base = { ...emptyDraft(), newCustomerName: 'Hasan', service: mockServices[0] };
    assert.deepEqual(actionLabel(1, base), { label: 'Devam', enabled: true });
    assert.deepEqual(
        actionLabel(1, { ...base, newCustomerPhone: '0532 111' }),
        { label: 'Numarayı tamamlayın', enabled: false },
    );
    assert.deepEqual(
        actionLabel(1, { ...base, newCustomerPhone: '0532 111 22 33' }),
        { label: 'Devam', enabled: true },
    );
});

test('pasif buton cam çubuğun içinde ikinci bir levha değil', () => {
    assert.match(tokens, /barPadMini:\s*10/);
    assert.ok(parts.includes("enabled ? c.or : 'transparent'"));
});

test('son gelenler listesi bugünden', () => {
    const recents = recentCustomers(mockCustomers, 6);
    assert.ok(recents.length > 0);
    for (const customer of recents) assert.ok(customer.hint.startsWith('Bugün'));
});

// ── Hizmet ──────────────────────────────────────────────────────────────────

test('turuncu envanteri: hiçbir hizmet turuncuya boyanmaz', () => {
    // #FF5A1F yalnız ZAMAN ve EYLEM için: seçili gün, seçili saat, kritik buton.
    for (const service of mockServices) {
        assert.notEqual(service.color.toUpperCase(), '#FF5A1F');
    }
});

test('süre ve fiyat her hizmette var', () => {
    for (const service of mockServices) {
        assert.ok(service.minutes >= SLOT_STEP - 10, `${service.name} süresiz`);
        assert.ok(service.price > 0);
    }
    assert.equal(formatPrice(1000), '₺1.000');
    assert.equal(formatRange(9 * 60, 75), '09:00 – 10:15');
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('cam YALNIZ yüzen kontrol katmanında', () => {
    // Çubuk cam; içerik parçalarının hiçbiri değil.
    assert.equal((flow.match(/<Glass\b/g) ?? []).length, 1, 'yüzen çubuk dışında cam olmamalı');
    assert.ok(!/Glass/.test(parts), 'saat/müşteri/hizmet satırları opak kalmalı');
    assert.ok(!/BlurView|backdropFilter/.test(flow + parts));
});

test('yüzen çubuğun altında kalan içerik için pay ayrılıyor', () => {
    // Çubuğun kendi yüksekliği 15 + 92 + 13 + 66 + 16 = 202. Belgenin v1'i
    // toplamı 232 diyordu ve 13'lük gap'i atlamıştı; 20:00 satırı çubuğun
    // altında kalıyordu.
    assert.match(tokens, /barHeight:\s*202/);
    assert.match(tokens, /barHeightMini:\s*150/);
    // Pay SABİT DEĞİL: sekme çubuğunu da içeren alt güvenli alandan türüyor.
    assert.ok(flow.includes('+ barLift'));
    assert.ok(flow.includes('scrollIndicatorInsets'));
    assert.ok(flow.includes('keyboardUp ? M.barLift : inset'));
    assert.ok(!/contentInset:\s*\d/.test(tokens), 'sabit pay jetonu kalmamalı');
});

test('yüzen çubuk sekme çubuğunun arkasında kalmıyor', () => {
    // "+" bir SEKME; sistem sekme çubuğu bu ekranın üstünde duruyor ve UIKit
    // yüksekliğini safeAreaInsets.bottom'a ekliyor. Sabit 46 pt yazılamaz.
    assert.ok(flow.includes('bottomInset'));
    assert.ok(flow.includes('bottom: barLift'));
    assert.ok(!/barBottom\b/.test(flow), 'sabit alt boşluk kullanılmamalı');
    assert.ok(screen.includes('insets.bottom'));
});

test('seçili gün kısaltması turuncu üstünde okunur', () => {
    // .72 → 3.26:1 idi, 11 pt metin için eşik 4.5. .92 → 5.3:1.
    assert.match(tokens, /APPT_SELECTED_DAY_LABEL = 'rgba\(35,16,6,0\.92\)'/);
});

test('kahraman rakamı CSS\'in verdiği ölçüde', () => {
    // Belgenin şartname tablosu 58 diyordu, kendi CSS'i 54. CSS otorite.
    assert.match(tokens, /day:\s*54,/);
    assert.match(design, /\.hday b\{font-size:54px/);
});

test('akış SEKMENİN İÇİNDE: alt bar akış boyunca duruyor', () => {
    // Akış bir süre kök yığındaydı ve sekme çubuğu kayboluyordu; çıkışın tek
    // yolu X'ti, X de sekme seçimini "+"ta bıraktığı için ekran anında geri
    // açılıyordu. Müdür içeride kilitleniyordu. Artık akış sekmenin kendisi.
    assert.ok(screen.includes('CreateFlow'));
    assert.ok(screen.includes('topInset') && screen.includes('bottomInset'));
    assert.ok(!/Yer tutucu|placeholder/i.test(screen));
    // Odaklanınca başka ekrana ITEN bir yönlendirici DEĞİL.
    assert.ok(!screen.includes('useFocusEffect'), 'sekme kendini başka ekrana itmemeli');
    assert.ok(!/router\.push/.test(screen), 'akış sekmenin üstüne yığın açmamalı');
});

test('yüzen çubuk bar küçülünce zıplamıyor', () => {
    // iOS 26'da sekme çubuğu kaydırınca küçülüyor, güvenli alan onunla
    // değişiyor. Pay olduğu gibi kullanılsaydı çubuk her kaydırmada oynardı.
    assert.ok(flow.includes('insetFloor'));
    assert.match(flow, /if \(bottomInset > insetFloor\.current\)/);
    assert.match(flow, /const barLift = \(small \? M\.barLiftSmall : M\.barLift\) \+ inset0;/);
});

test('taslak sekme değiştirince silinmiyor, X\'te siliniyor', () => {
    // Barı geri getirmenin sebebi tam olarak bu: yarıda Takvim'e bakıp dönmek.
    assert.ok(screen.includes('runId'), 'akış bir key ile sıfırlanmalı');
    assert.match(screen, /const close = useCallback\(\(\) => \{\s*reset\(\);/);
    // Eski parametreler de temizlenir; yoksa "+" eski günü geri getirirdi.
    assert.ok(screen.includes('router.setParams'));
});

test('klavye açıkken yüzen çubuk gizleniyor', () => {
    // KeyboardAvoidingView levhayı kısaltıp çubuğu içeriğin üstüne çıkarıyordu.
    assert.ok(!/KeyboardAvoidingView/.test(flow));
    assert.ok(flow.includes('automaticallyAdjustKeyboardInsets'));
    assert.ok(flow.includes('keyboardUp ? null : ('));
});

test('sayfa 1in de bir kahramanı var', () => {
    // Belgenin v1'inde vardı, v2 sessizce düşürmüştü; .hq kuralı v2'de duruyor.
    assert.match(tokens, /title:\s*40,/);
    assert.match(design, /\.hq\{font-size:40px;font-weight:800/);
    assert.ok(flow.includes('ApptPageTitle'));
    // Telefonu olmayan yeni müşteride tek başına tire çizilmiyor.
    assert.ok(parts.includes('name && phone ?'));
});

test('takvimdeki boş saat gün, saat ve personeli taşır', () => {
    assert.ok(calendar.includes('/(manager)/create'));
    for (const key of ['date:', 'start:', 'staff:']) {
        assert.ok(calendar.includes(key), `parametre eksik: ${key}`);
    }
});

test('randevu gerçekten kaydediliyor, sonra onay ekranı devralıyor', () => {
    // Sunucuda oluşturma ucu YOK. Sahte bir "kaydedildi" mesajı da yok:
    // randevu yerel takvim kaynağına yazılıyor, sonra Müdür 16 onay ekranı
    // sonucu gösteriyor.
    assert.ok(!/başarıyla|Kaydedildi/i.test(flow));
    assert.ok(flow.includes('addLocalAppointment'));
    assert.ok(flow.includes('draftToAppointment'));
    assert.ok(flow.includes('feedback.success()'));
    assert.ok(flow.includes('ConfirmScreen'));
});

test('taslak gerçek bir randevu kaydına dönüşüyor', () => {
    const draft = {
        ...emptyDraft(),
        customer: mockCustomers[0],
        service: mockServices[0],
        dateISO: '2026-08-14',
        startMinutes: 11 * 60,
        staffId: 'merve',
        note: 'Kapıda karşıla',
    };
    const appointment = draftToAppointment(draft, staff, 'local-1');
    assert.equal(appointment.date, '2026-08-14');
    assert.equal(appointment.start_time, '11:00:00');
    assert.equal(appointment.end_time, '12:15:00');
    assert.equal(appointment.service, 'Kesim + fön');
    assert.equal(appointment.staff_id, 'merve');
    assert.equal(appointment.status, 'confirmed');
    assert.equal(appointment.notes, 'Kapıda karşıla');
    assert.equal(appointment.customer_phone, mockCustomers[0].phone);

    // Eksik taslaktan kayıt ÇIKMAZ.
    assert.equal(draftToAppointment(emptyDraft(), staff, 'x'), null);
});

test('yeni müşterinin numarası kayda E.164 olarak giriyor', () => {
    const draft = {
        ...emptyDraft(),
        newCustomerName: 'Hasan Ülger',
        newCustomerPhone: '0532 111 22 33',
        service: mockServices[1],
        dateISO: '2026-08-14',
        startMinutes: 10 * 60,
        staffId: 'merve',
    };
    const appointment = draftToAppointment(draft, staff, 'local-2');
    assert.equal(appointment.customer_name, 'Hasan Ülger');
    assert.equal(appointment.customer_phone, '+905321112233');
    assert.equal(appointment.customer_id, null);

    // Telefon boşsa null — uydurulmuş numara yok.
    const noPhone = draftToAppointment({ ...draft, newCustomerPhone: null }, staff, 'local-3');
    assert.equal(noPhone.customer_phone, null);
});

test('"+" sekmesi boş bir ekran olarak kalamaz', () => {
    // Sekmenin kendi içeriği var: akışın ta kendisi. Bir zamanlar burası
    // yalnız yönlendiriciydi ve akış kapanınca boş siyah ekran kalıyordu.
    assert.ok(screen.includes('<CreateFlow'));
    assert.ok(!/Yer tutucu|placeholder/i.test(screen));
});

test('saatler tek kaynaktan: ekran kendi ızgarasını kurmuyor', () => {
    assert.ok(flow.includes('slotRows'));
    assert.ok(flow.includes('railSections'));
    assert.ok(!/for \(let (m|minutes)/.test(flow));
});

test('özet ızgarası tasarımın 2 × 2 kalıbı', () => {
    const draft = {
        ...emptyDraft(),
        customer: mockCustomers[0],
        service: mockServices[0],
        dateISO: '2026-08-14',
        startMinutes: 11 * 60,
        staffId: 'merve',
    };
    // Kütüphane tarafı hâlâ etiket/değer üretiyor; ekran dördünü ikişer
    // kolona diziyor.
    const rows = summaryRows(draft, staff);
    assert.deepEqual(rows.map((row) => row.label), ['Gün', 'Saat', 'Hizmet', 'Kişi', 'Tutar']);
    assert.equal(rows[1].value, '11:00 – 12:15');
    assert.equal(rows[4].value, '₺1.000');
    assert.ok(flow.includes('KeyValueGrid'));
});

test('hiçbir şey yapmayan yüzey yok', () => {
    // Not satırı gerçekten yazıyor: `onPress={() => undefined}` gibi bir
    // yer tutucu bırakmıyoruz.
    assert.ok(!/onPress=\{\(\) => undefined\}/.test(flow));
    assert.ok(parts.includes('onSubmitEditing'), 'not alanı gerçek bir girdi olmalı');
});

test('sayfa 1de hiçbir seçim yokken çubuk mini', () => {
    // Dört kere "seçilmedi" yazmak yerine yalnız pasif buton durur.
    assert.ok(flow.includes('picked || draft.service ? ['));
    assert.ok(flow.includes('summary.length > 0'));
});

test('tasarım belgesi projede duruyor', () => {
    assert.ok(design.includes('Randevu oluştur'));
    assert.ok(design.includes('v2 değişiklik listesi'));
});

// ── "Numara ekle" kaldırıldı · 2026-08-30 ──────────────────────────────────
//
// Düğme `onDone` çağırıyordu — numara eklemiyor, ekranı kapatıyordu. Yerine
// gerçek bir alan denendi ama bu ekranda yeri yok: blok klavyeyle birlikte
// yükselince kartın üstüne biniyor. Numara müşteri kaydına ait; yeri müşteri
// kartı, randevu onayı değil.

test('onay ekranında ölü "Numara ekle" düğmesi yok', () => {
    const src = readFileSync(new URL('../mobile/src/components/ConfirmScreen.tsx', import.meta.url), 'utf8');
    // Aranan şey KODU: neden kaldırıldığını anlatan yorum da bu kelimeleri
    // taşıyor, o kalmalı.
    assert.equal(src.includes('label="Numara ekle"'), false, 'düğme geri gelmiş');
    assert.equal(src.includes('onAddPhone'), false, 'yarım kalmış akış duruyor');
});

test('numarasız randevuda sebep hâlâ KELİMEYLE yazılı', () => {
    // Düğme gitti ama bilgi gitmedi: müdür mesajın neden gidemediğini
    // görmeye devam ediyor.
    assert.equal(sendGate('idle', false).enabled, false);
    assert.equal(sendGate('idle', false).reason, NO_PHONE_REASON);
});
