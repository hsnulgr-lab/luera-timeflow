/**
 * Tek Kişilik v4 · karar 3 — PERSONEL İZLERİ (2026-10-12).
 *
 * "Arayüzde kavram görünmez: 'ile', 'verdi', 'kim yapacak', sütun başlıkları
 * render edilmez." Sahibin personel satırı işletmenin adını taşıyor; iz
 * kaldığı her yerde ekrana bakan kişi kendi işini "Derya Güzellik ile" diye
 * okuyordu.
 *
 * Bu dosya üç şeyi kilitliyor:
 *   1. Kabuk YERDEN okunuyor, adresten değil — üstüne sayfa itilince alttaki
 *      sekme kendini ekip ekranı sanmıyor, itilen sayfa da kabuğunu biliyor.
 *   2. Tek kişilikte müdür kabuğuna giden sabit yol yok (Takvim'in boş saati,
 *      kartın "Randevu ver"i, Randevu'nun kapanışı).
 *   3. İzler: müşteri kartı ve geçmişi, müşteriler listesi, randevu detayı,
 *      takvimde taşıma, randevu kurmanın saat adımı ve onayı, hesap silme.
 *
 * Saf kararlar DAVRANIŞLA sınanıyor; ekranların bağlantısı kaynak metniyle.
 * Ekip davranışı her testte yanında: tek kişilik dalı ekibi bozmamalı.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { shellBeneath } from '../mobile/src/lib/shellBeneath.ts';
import { mockCustomers, withoutStaff } from '../mobile/src/lib/customerCard.ts';
import { fullHistoryOf, historyWithoutStaff } from '../mobile/src/lib/customerCardLive.ts';
import { bookLine, bookWithoutStaff } from '../mobile/src/lib/managerBook.ts';
import {
    changeTiles, identityOf, serviceChoices, serviceSheetSubtitle,
} from '../mobile/src/lib/appointmentDetail.ts';
import {
    MOVE_HINT, MOVE_HINT_SOLO, conflictReason, menuRows, menuSubtitle, moveBanner,
    moveResultCopy, resolveTarget, targetLabel,
} from '../mobile/src/lib/moveAppointment.ts';
import { mockServices as CATALOG, slotRows, slotSpeech, railSections } from '../mobile/src/lib/createFlow.ts';
import { confirmSpeech, stillBookedLine } from '../mobile/src/lib/apptConfirm.ts';
import { accountDeletionItems } from '../mobile/src/lib/authCopy.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const shellRoot = code('mobile/src/lib/shellRoot.ts');
const tekLayout = code('mobile/app/tek/_layout.tsx');
const calendar = code('mobile/app/mudur/calendar.tsx');
const create = code('mobile/app/mudur/create.tsx');
const customer = code('mobile/app/(staff-flow)/customer.tsx');
const history = code('mobile/app/(manager-flow)/musteri-gecmis.tsx');
const book = code('mobile/app/(manager-flow)/musteriler.tsx');
const file = code('mobile/app/(staff-flow)/musteri.tsx');
const detailRoute = code('mobile/app/(manager-flow)/randevu/[id].tsx');
const detail = code('mobile/src/components/AppointmentDetail.tsx');
const detailParts = code('mobile/src/components/ApptParts25.tsx');
const detailSheets = code('mobile/src/components/ApptSheets.tsx');
const moveParts = code('mobile/src/components/MoveParts.tsx');
const grid = code('mobile/src/components/ColumnCalendar.tsx');
const createFlow = code('mobile/src/components/CreateFlow.tsx');
const rail = code('mobile/src/components/ApptParts.tsx');
const confirm = code('mobile/src/components/ConfirmScreen.tsx');
const account = code('mobile/app/(staff-flow)/account.tsx');
const deletion = code('mobile/app/(manager-flow)/profil/hesap-sil.tsx');

// ── 1 · Kabuk YERDEN okunuyor ───────────────────────────────────────────────

test('itilen sayfa altındaki EN YAKIN kabuğu bulur', () => {
    const routes = [
        { key: 'i', name: 'index' },
        { key: 'a', name: '(auth)' },
        { key: 't', name: 'tek' },
        { key: 'k', name: '(staff-flow)/kumanda' },
        { key: 'm', name: '(staff-flow)/musteri' },
    ];
    // Kumandanın üstündeki müşteri dosyası da tek kişilik kabuğun üstünde.
    assert.equal(shellBeneath(routes, 'm'), 'tek');
    assert.equal(shellBeneath(routes, 'k'), 'tek');
    // Ekip kabuğu da aynı yoldan: cevap "tek değil", uydurma değil.
    assert.equal(shellBeneath([{ key: 'x', name: 'mudur' }, { key: 'r', name: '(manager-flow)/randevu/[id]' }], 'r'), 'mudur');
    // Kabuğun kendisi ya da altında kabuk olmayan rota: bilinmiyor.
    assert.equal(shellBeneath(routes, 't'), null);
    assert.equal(shellBeneath(routes, 'i'), null);
});

test('sekmenin rotası kök yığında yoksa cevap bağlamdan gelir', () => {
    // Sekmeler `NativeTabs`ın kendi yığınında; kök yığında aranmaz.
    const tabs = [{ key: 'cal', name: 'calendar' }, { key: 'cash', name: 'cash' }];
    assert.equal(shellBeneath(tabs, 'cal'), null);
    assert.equal(shellBeneath(tabs, 'yok'), null);
});

test('kanca ADRESİ okumuyor — üstüne itilen sayfa sekmeyi ekip ekranına çevirmiyor', () => {
    // `useSegments` genel adresti: kumanda açılınca alttaki Takvim personel
    // başlığını, İşletme "Personel" satırını, Kasa "X verdi"yi çiziyordu.
    assert.doesNotMatch(shellRoot, /useSegments/);
    assert.match(shellRoot, /const inside = useContext\(ShellContext\);/);
    assert.match(shellRoot, /useNavigationState\(\(state\) => shellBeneath\(state\.routes, key\)\)/);
    assert.match(shellRoot, /return \(inside \?\? beneath\) === 'tek';/);
    // Bağlamı kabuğun kendisi takıyor, sekmelerin hepsini sararak.
    assert.match(tekLayout, /<ShellScope value="tek">\s*<ManagerDayProvider>\s*<NativeTabs/);
});

// ── 2 · Müdür kabuğuna sabit yol yok ────────────────────────────────────────

test('tek kişilikte Takvim, kart ve Randevu kendi kabuğunda kalıyor', () => {
    // `/mudur/...` müdür kabuğunu kuruyordu; kapısı `/tek`e geri atıyordu ve
    // kullanıcı ön dolu randevu yerine Gün'e düşüyordu.
    assert.match(calendar, /pathname: solo \? '\/tek\/create' : '\/mudur\/create'/);
    assert.match(customer, /pathname: solo \? '\/tek\/create' : '\/mudur\/create'/);
    assert.match(customer, /router\.replace\(solo \? '\/tek\/calendar' : '\/mudur\/calendar'\)/);
    assert.match(detailRoute, /router\.replace\(solo \? '\/tek\/calendar' : '\/mudur\/calendar'\)/);
    assert.match(create, /router\.navigate\(solo \? '\/tek' : '\/mudur'\)/);
    // Bu dosyalarda koşulsuz bir `/mudur` yolu kalmadı.
    for (const [name, source] of [['calendar', calendar], ['customer', customer], ['randevu', detailRoute], ['create', create]]) {
        const bare = source.match(/(?<!: )'\/mudur(\/[a-z]+)?'/g) ?? [];
        assert.deepEqual(bare, [], `${name}: koşulsuz müdür yolu`);
    }
});

// ── 3a · Müşteri kartı, geçmiş, defter ──────────────────────────────────────

test('kartta "X ile" yok — ad veride düşüyor', () => {
    const card = mockCustomers.find((one) => one.upcoming && one.lastVisit && one.history.length > 1);
    assert.ok(card, 'fikstür: yaklaşanı ve geçmişi olan kart');
    const solo = withoutStaff(card);
    assert.equal(solo.upcoming.staff, null);
    assert.equal(solo.lastVisit.staff, null);
    assert.ok(solo.history.every((row) => row.staff === null));
    // Başka hiçbir şey değişmiyor ve kaynak bozulmuyor.
    assert.equal(solo.history.length, card.history.length);
    assert.equal(solo.upcoming.service, card.upcoming.service);
    assert.ok(card.history.some((row) => row.staff));
    const today = mockCustomers.find((one) => one.firstVisitToday);
    assert.equal(withoutStaff(today).firstVisitToday.staff, null);
    // Ekran: yalnız tek kişilikte.
    assert.match(customer, /snap\.data && solo \? withoutStaff\(snap\.data\) : snap\.data/);
});

test('tüm geçmiş de personelsiz', () => {
    const groups = fullHistoryOf({
        visits: [
            { id: 'v1', date: '2026-10-02', service: 'Kesim', staff_id: 's1' },
            { id: 'v2', date: '2026-09-12', service: 'Fön', staff_id: 's1' },
        ],
        payments: [],
        staff: new Map([['s1', 'Derya Güzellik']]),
        todayISO: '2026-10-12',
    });
    assert.ok(groups.flatMap((group) => group.rows).every((row) => row.staff === 'Derya Güzellik'));
    const solo = historyWithoutStaff(groups);
    assert.deepEqual(solo.map((group) => group.month), groups.map((group) => group.month));
    assert.ok(solo.flatMap((group) => group.rows).every((row) => row.staff === null));
    assert.match(history, /solo && snap\.data \? historyWithoutStaff\(snap\.data\) : snap\.data/);
});

test('müşteriler listesinde son işi yapan ve baş harf diski yok', () => {
    const row = {
        id: 'c1', name: 'Sibel Arda', lastVisitDate: '2026-10-10', upcomingTime: null,
        lastService: 'Kesim', lastStaffName: 'Derya Güzellik', noShows: 0, phoneTail: '4120', phone: '',
    };
    assert.equal(bookLine(row), 'Kesim · Derya Güzellik');
    const [solo] = bookWithoutStaff([row]);
    assert.equal(bookLine(solo), 'Kesim');
    assert.match(book, /return solo \? bookWithoutStaff\(sorted\) : sorted;/);
    assert.match(book, /\{solo \? null : \(\s*<View style=\{\{\s*width: disc,/);
});

test('kumandanın açtığı müşteri dosyasında "son bakan" pili yok', () => {
    assert.match(file, /\{file\.lastStaff && !solo \? \(/);
});

// ── 3b · Randevu detayı ─────────────────────────────────────────────────────

const appt = {
    id: 'a1', customer_id: 'c1', customer_name: 'Elif Demir', customer_phone: null,
    date: '2026-08-22', start_time: '10:30:00', end_time: '11:15:00', service: 'Keratin bakımı',
    service_color: null, status: 'confirmed', staff_id: 'owner', notes: null,
    customer_arrived_at: null, arrived_at: null, service_ended_at: null,
};

test('detayın kimliğinde personel pili yok, "Atanmamış" da değil', () => {
    const team = identityOf(appt, 'Derya Güzellik', '2026-08-22');
    assert.equal(team.crew, true);
    assert.equal(team.staff, 'Derya Güzellik');
    const solo = identityOf(appt, 'Derya Güzellik', '2026-08-22', true);
    assert.equal(solo.crew, false);
    assert.equal(solo.staff, null);
    assert.equal(solo.initials, '');
    // Pil yalnız ekipte çiziliyor — boş adla "Atanmamış" demiyor.
    assert.match(detailParts, /\{identity\.crew \? \(\s*<IdentPill\s+text=\{identity\.staff \?\? 'Atanmamış'\}/);
    assert.match(detail, /identityOf\(appointment, staffName, undefined, solo\)/);
});

test('"Personeli değiştir" jetonu tek kişilikte yok', () => {
    assert.deepEqual(changeTiles(appt, 'Derya Güzellik').map((tile) => tile.action), ['time', 'staff']);
    assert.deepEqual(changeTiles(appt, 'Derya Güzellik', true).map((tile) => tile.action), ['time']);
    assert.match(detail, /changeTiles\(appointment, staffName, solo\)/);
});

test('hizmet sayfasının çakışması ve alt başlığı adsız', () => {
    const blocking = { ...appt, id: 'a2', start_time: '11:00:00', end_time: '12:30:00', service: 'Saç boyama' };
    const team = serviceChoices(appt, [appt, blocking], 'Derya Güzellik', CATALOG);
    const solo = serviceChoices(appt, [appt, blocking], 'Derya Güzellik', CATALOG, true);
    const clash = (choices) => choices.find((choice) => choice.name === 'Saç boyama').clash;
    assert.equal(clash(team), 'Derya Güzellik · 11:00–12:30 ile çakışır');
    assert.equal(clash(solo), '11:00–12:30 ile çakışır');
    assert.doesNotMatch(serviceSheetSubtitle(appt, null), / ile\b/);
    assert.match(detailSheets, /serviceChoices\(appointment, dayAppointments, staffName, services, solo\)/);
    assert.match(detailSheets, /serviceSheetSubtitle\(appointment, solo \? null : staffName\)/);
    // İptal ve silme onayı da adsız.
    assert.match(detail, /staffName=\{solo \? null : staffName\}/);
});

test('detay ekranı kabuğunu biliyor ve reddin cümlesi adsız', () => {
    assert.match(detailRoute, /const solo = useInSoloShell\(\);/);
    assert.match(detailRoute, /<AppointmentDetail[^>]*solo=\{solo\}/);
    assert.match(detailRoute, /<MoveSheet[^>]*solo=\{solo\}/);
    assert.match(detailRoute, /<MoveResultSheet[^>]*solo=\{solo\}/);
    // "O saatte Derya Güzellik zaten başka bir randevuda." yok.
    assert.match(detailRoute, /solo \? null : targetStaffName \?\? staffName/);
});

// ── 3c · Takvimde taşıma ────────────────────────────────────────────────────

const crew = [{ id: 'owner', initials: 'DG', name: 'Derya Güzellik' }];

test('sürükleme: "veya kişiye" ve "· Derya" yok', () => {
    const moving = { ...appt, start_time: '10:00:00', end_time: '11:00:00' };
    const other = { ...appt, id: 'a3', start_time: '13:00:00', end_time: '14:30:00' };
    const at = (solo) => resolveTarget({
        appointment: moving, appointments: [moving, other], staff: crew, fromIndex: 0,
        dx: 0, dy: 3 * 80, dayStartMinutes: 9 * 60, dayEndMinutes: 20 * 60, hourHeight: 80, solo,
    });
    // Dolu hedef: sebep adsız.
    assert.equal(at(false).reason, 'Derya Güzellik · 13:00–14:30');
    assert.equal(at(true).reason, '13:00–14:30');
    assert.equal(conflictReason(other, null), '13:00–14:30');
    // Boş hedef: etiket yalnız saat.
    const free = { ...at(true), valid: true, unchanged: false, startMinutes: 15 * 60 };
    assert.equal(targetLabel(free), '15:00 · Derya Güzellik');
    assert.equal(targetLabel(free, true), '15:00');
    assert.match(moveBanner(moving, free, true).text, /→ 15:00\. Bırakın/);
    assert.equal(moveBanner(moving, null, true).text, MOVE_HINT_SOLO);
    assert.equal(moveBanner(moving, null).text, MOVE_HINT);
    assert.doesNotMatch(MOVE_HINT_SOLO, /kişi/);
    // Izgara bayrağı üç yere de geçiriyor.
    assert.match(grid, /moveBanner\(lifted\.appointment, target, soloColumn\)/);
    assert.match(grid, /targetLabel\(target, solo\)/);
    assert.match(grid, /solo: input\.soloColumn,/);
});

test('menü: "Personeli değiştir" satırı ve "X ile" yok', () => {
    assert.ok(menuRows(appt, 'Derya Güzellik').some((row) => row.action === 'staff'));
    assert.ok(!menuRows(appt, 'Derya Güzellik', true).some((row) => row.action === 'staff'));
    assert.doesNotMatch(menuSubtitle(appt, null), / ile$/);
    assert.match(moveParts, /menuRows\(appointment, staffName, solo\)/);
    assert.match(moveParts, /menuSubtitle\(appointment, solo \? null : staffName\)/);
});

test('saat seçici: boş satırda ad ve baş harf yok', () => {
    assert.match(moveParts, /title=\{solo \? 'Müsait' : row\.staff\.name\}/);
    assert.match(moveParts, /right=\{solo \? undefined : <Avatar/);
    assert.match(moveParts, /hours,\s*solo,\s*\}\), \[day, staff, duration, appointment, hours, solo\]\)/);
});

test('"taşındı" sayfası: saatlerin altında ad yok', () => {
    const result = {
        appointment: appt, fromStartMinutes: 600, fromStaffName: 'Derya Güzellik',
        toStartMinutes: 690, toStaffName: 'Derya Güzellik',
    };
    const team = moveResultCopy(result);
    const solo = moveResultCopy(result, undefined, undefined, true);
    assert.equal(team.fromLabel, 'Derya Güzellik');
    assert.equal(solo.fromLabel, '');
    assert.equal(solo.toLabel, '');
    assert.equal(solo.fromTime, '10:00');
    assert.equal(solo.toTime, '11:30');
    // Boş etiket boş bir satır olarak çizilmiyor.
    assert.match(moveParts, /\{copy\.fromLabel \? \(/);
    assert.match(moveParts, /\{copy\.toLabel \? \(/);
    assert.match(moveParts, /moveResultCopy\(result, nowMinutes, today, solo\)/);
});

test('takvim ekranı bayrağı menüye, sayfalara ve yazmaya geçiriyor', () => {
    assert.match(calendar, /<AppointmentMenu[^>]*solo=\{solo\}/);
    assert.match(calendar, /<MoveSheet[^>]*solo=\{solo\}/);
    assert.match(calendar, /<MoveResultSheet[^>]*solo=\{solo\}/);
    assert.match(calendar, /applyMove\(appointment, target\), solo \? null : target\.staffName\)/);
    assert.match(calendar, /undoMove\(done\), solo \? null : done\.fromStaffName\)/);
});

// ── 3d · Randevu kurma: saat rayı ve onay ───────────────────────────────────

test('rayda dolu kutu "Dolu" der ve kimin için dolu olduğunu söyler (v4 · R2)', () => {
    const busy = {
        ...appt, id: 'b1', customer_name: 'Deniz Şahin', service: 'Manikür & Pedikür',
        start_time: '10:00:00', end_time: '11:00:00',
    };
    const input = {
        appointments: [busy], staff: [{ id: 'owner', initials: 'DG', name: 'Derya Güzellik', available: true }],
        durationMinutes: 60, hours: { from: 9 * 60, to: 13 * 60 },
    };
    const team = slotRows(input).find((row) => row.kind === 'busy');
    const solo = slotRows({ ...input, solo: true }).find((row) => row.kind === 'busy');
    assert.equal(team.title, 'Derya Güzellik · Manikür & Pedikür');
    assert.equal(solo.title, 'Dolu');
    assert.equal(solo.customer, 'Deniz Şahin · Manikür & Pedikür');
    assert.equal(solo.reason, '10:00–11:00');
    // Sesli okuma "dolu, Dolu" demiyor.
    const [item] = railSections({ rows: slotRows({ ...input, solo: true }) })
        .flatMap((section) => section.items).filter((one) => one.kind === 'busy');
    assert.equal(slotSpeech(item, false), "09:30 dolu, Deniz Şahin · Manikür & Pedikür, 11:00'a");
    assert.match(rail, /if \(item\.kind === 'busy'\) return <BusySlot key=\{item\.minutes\} item=\{item\} ax=\{ax\} solo=\{solo\} \/>;/);
    assert.match(rail, /accessibilityLabel=\{slotSpeech\(item, !solo\)\}\s*style=\{\{\s*flexDirection: ax \? 'column' : 'row',\s*alignItems: 'flex-start',\s*borderTopWidth: 1/);
    assert.match(createFlow, /solo,\s*\}\) : \[\]\), \[/);
});

test('kapalı kutu siz diliyle — ad yok', () => {
    const owner = { id: 'owner', initials: 'DG', name: 'Derya Güzellik', available: true };
    const base = { appointments: [], durationMinutes: 30, hours: { from: 9 * 60, to: 10 * 60 } };
    const offShift = slotRows({ ...base, staff: [owner], onlyStaffId: 'owner', worksAt: () => false, solo: true });
    assert.ok(offShift.every((row) => row.kind === 'closed' && row.reason === 'Bu saatte çalışmıyorsunuz'));
    const onLeave = slotRows({ ...base, staff: [{ ...owner, available: false, reason: 'izinli' }], solo: true });
    assert.ok(onLeave.every((row) => row.reason === 'Bu gün izinlisiniz'));
    const off = slotRows({ ...base, staff: [{ ...owner, available: false }], solo: true });
    assert.ok(off.every((row) => row.reason === 'Bu gün çalışmıyorsunuz'));
    // Ekip aynen.
    const teamOff = slotRows({ ...base, staff: [owner], onlyStaffId: 'owner', worksAt: () => false });
    assert.equal(teamOff[0].reason, 'Derya Güzellik bu saatte çalışmıyor');
});

test('onay ekranında personel sütunu ve "X yapacak" yok', () => {
    const when = { ...appt, date: '2026-10-12', start_time: '14:00', end_time: '15:00' };
    assert.match(confirmSpeech({ state: 'idle', appointment: when, staffName: 'Derya Güzellik', hasPhone: true }), /Derya Güzellik yapacak/);
    assert.doesNotMatch(confirmSpeech({ state: 'idle', appointment: when, staffName: null, hasPhone: true }), /yapacak/);
    assert.doesNotMatch(confirmSpeech({ state: 'failed', appointment: when, staffName: null, hasPhone: true }), /, null/);
    assert.match(stillBookedLine(when, 'Derya Güzellik'), / · Derya Güzellik$/);
    assert.doesNotMatch(stillBookedLine(when, null), / · /);
    assert.match(confirm, /const spokenStaff = solo \? null : staffName;/);
    assert.match(confirm, /\{solo \? null : \(\s*<View style=\{\{\s*flexDirection: ax \? 'row' : 'column',/);
    assert.match(createFlow, /<ConfirmScreen[^>]*solo=\{solo\}/);
    // Reddin cümlesi adsız; masaüstünün haberi (webhook) adı yine taşıyor.
    assert.match(create, /createAppointment\(input, solo \? null : staffName, \{/);
    assert.match(create, /fireCreatedWebhook\(ctx\.data\?\.settings\.webhookUrl \?\? null, result\.row, staffName\)/);
});

// ── 3e · Hesap silme ────────────────────────────────────────────────────────

test('hesap silmede "personeliniz" maddesi ve "1 personelin erişimi" yok', () => {
    const team = accountDeletionItems(['Derya Güzellik']);
    const solo = accountDeletionItems(['Derya Güzellik'], true);
    assert.ok(team.some((item) => /Personelinizin/.test(item)));
    assert.ok(!solo.some((item) => /[Pp]ersonel/.test(item)));
    assert.equal(solo.length, team.length - 1);
    // Bayrak işletmenin verisinden: bir işletme bile ekipse madde kalıyor.
    assert.match(account, /\.every\(\(business\) => business\.solo === true\)/);
    assert.match(deletion, /staff: profile\.business\.solo \? \[\] : facts\.staff,/);
});
