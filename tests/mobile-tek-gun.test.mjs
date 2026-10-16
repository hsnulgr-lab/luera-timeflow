/**
 * Tek kişilik · Gün ekranının metin ve kapsam kuralları (108).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    SOLO_UNREAD_COPY,
    soloApptDuration,
    soloDayCounts,
    soloDayList,
    soloDayTotal,
    soloApptStamp,
    soloDaySubtitle,
    soloEmptyCopy,
    soloIdlePanel,
    soloNextPanel,
    soloPickItems,
    soloStartable,
    soloOpenTicket,
    soloTicketPanel,
} from '../mobile/src/lib/soloDay.ts';
import { buildStaffDayState } from '../mobile/src/lib/staffDay.ts';

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const gun = read('app/tek/index.tsx');

/** En az alan: damga ve süre yalnız bunlara bakıyor. */
const appt = (over = {}) => ({
    id: 'a1',
    customer_id: null,
    customer_name: 'Sibel Karaca',
    customer_phone: null,
    date: '2026-10-09',
    start_time: '10:30',
    end_time: '11:00',
    service: 'Lazer Epilasyon',
    service_color: null,
    status: 'confirmed',
    notes: null,
    arrived_at: null,
    service_ended_at: null,
    ...over,
});

const at = (id, time, over = {}) => appt({ id, start_time: time, end_time: time, ...over });

const state = (over = {}) => ({
    kind: 'free',
    listTitle: 'Bugün · 4 randevu',
    showNowLine: true,
    runningAppointment: null,
    pastAppointments: [],
    upcomingAppointments: [],
    ...over,
});

test('alt başlık personel dilinde sayıyor, müdür dilinde değil', () => {
    // "6 randevu · 3 personel" müdürün sorusu. Bu modda ekrana bakan kişi
    // işi YAPAN kişi: kaçının bittiği onun sorusu.
    assert.equal(soloDaySubtitle('2026-10-09', { done: 2, left: 3 }), '9 Ekim · 2 iş bitti, 3 kaldı');
});

test('BUGÜN OLMAYAN gün yalnız SAYIYOR, "kaldı" demiyor', () => {
    /*
     * "2 iş bitti, 3 kaldı" şu anın cümlesi. Telefonda dün seçiliyken
     * "1 iş bitti, 7 kaldı" yazıyordu: o gün çoktan bitti ve "kaldı" diye
     * bir şeyi yok. İleriki günde de yanlış — hiçbiri daha olmadı.
     */
    assert.equal(soloDaySubtitle('2026-10-09', { total: 8 }), '9 Ekim · 8 randevu');
    assert.equal(soloDaySubtitle('2026-10-09', { total: 0 }), '9 Ekim · randevu yok');
    // Ekran "bitti/kaldı" biçimini YALNIZ bugün gönderiyor.
    assert.match(gun, /:\s*isToday\s*\?\s*todayCounts\s*:\s*soloDayTotal\(mine\)/);
    // Başlığın sayıları ile günün özet kartı aynı hesaptan.
    assert.match(gun, /const todayCounts = useMemo\(\(\) => soloDayCounts\(mine, nowMinutes\), \[mine, nowMinutes\]\);/);
});

test('bugün olmayan gün İPTALİ SAYMIYOR — şeridin noktasıyla aynı sayı', () => {
    const day = [at('a', '09:30'), at('b', '11:00', { status: 'cancelled' }), at('c', '14:00')];
    assert.deepEqual(soloDayTotal(day), { total: 2, cancelled: 1 });
    assert.equal(soloDaySubtitle('2026-10-09', soloDayTotal(day)), '9 Ekim · 2 randevu');
    // Liste başlığı da aynı sayı; iptal kartı listede duruyor.
    const list = soloDayList(null, day, false, 600);
    assert.equal(list.rows.length, 3);
    assert.equal(list.title, '2 randevu');
    // Yalnız iptal kalan gün "randevu yok" demiyor; liste başlıksız.
    const gone = [at('b', '11:00', { status: 'cancelled' })];
    assert.equal(soloDaySubtitle('2026-10-09', soloDayTotal(gone)), '9 Ekim · 1 iptal');
    assert.equal(soloDayList(null, gone, false, 600).title, null);
});

test('gelmeyen randevu "bitti" SAYILMIYOR — başlık kartın damgasıyla aynı kuralla sayıyor', () => {
    /*
     * Telefonda üç gelmeyen randevulu gün "3 iş bitti, 0 kaldı" yazdı;
     * altındaki kart "0 tamamlandı · 3 gelmedi" diyordu. Sayılar personel
     * durumunun "geçmiş" kovasından geliyordu ve saati geçen her şey o
     * kovadaydı.
     */
    const now = 15 * 60;
    const noShows = [at('n1', '09:00'), at('n2', '11:00'), at('n3', '13:00')];
    const counts = soloDayCounts(noShows, now);
    assert.deepEqual(counts, { done: 0, left: 0, noshow: 3, cancelled: 0 });
    assert.equal(soloDaySubtitle('2026-10-09', counts), '9 Ekim · 0 iş bitti, 3 gelmedi, 0 kaldı');

    // Tohumun günü: iki tahsil, bir açık adisyon, bir gelmedi, bir süren iş,
    // iki sıradaki, bir iptal. Her kart kendi damgasının kovasına düşüyor.
    const day = [
        at('p1', '09:00', { status: 'completed', is_paid: true }),
        at('p2', '10:00', { status: 'completed', is_paid: true }),
        at('o1', '11:00', { status: 'completed', is_paid: false }),
        at('e1', '12:00', { arrived_at: '2026-10-09T09:00:00Z', service_ended_at: '2026-10-09T09:40:00Z' }),
        at('n1', '13:00'),
        at('r1', '14:30', { arrived_at: '2026-10-09T11:30:00Z' }),
        at('u1', '16:00'),
        at('u2', '17:00'),
        at('c1', '18:00', { status: 'cancelled' }),
    ];
    for (const row of day) {
        const stamp = soloApptStamp(row, now);
        const bucket = soloDayCounts([row], now);
        if (stamp?.done) assert.equal(bucket.done, 1, row.id);
        if (stamp?.label === 'gelmedi') assert.equal(bucket.noshow, 1, row.id);
        if (stamp?.label === 'iptal') assert.equal(bucket.cancelled, 1, row.id);
    }
    assert.equal(soloDaySubtitle('2026-10-09', soloDayCounts(day, now)), '9 Ekim · 4 iş bitti, 1 gelmedi, 3 kaldı');
});

test('saati geçen ama geç kalma payı dolmayan randevu hâlâ "kaldı"', () => {
    // Müşteri 10 dakika gecikti: ne bitti ne gelmedi — gelebilir.
    const late = at('l1', '14:50');
    assert.equal(soloApptStamp(late, 15 * 60), null);
    assert.deepEqual(soloDayCounts([late], 15 * 60), { done: 0, left: 1, noshow: 0, cancelled: 0 });
});

test('iptal iş değil: hiçbir sayıya girmiyor, ama yalnız iptal kalan gün "randevu yok" demiyor', () => {
    const now = 12 * 60;
    const counts = soloDayCounts([at('c1', '09:00', { status: 'cancelled' }), at('u1', '16:00')], now);
    assert.equal(soloDaySubtitle('2026-10-09', counts), '9 Ekim · 0 iş bitti, 1 kaldı');
    const onlyCancelled = soloDayCounts([at('c1', '09:00', { status: 'cancelled' }), at('c2', '16:00', { status: 'cancelled' })], now);
    assert.equal(soloDaySubtitle('2026-10-09', onlyCancelled), '9 Ekim · 2 iptal');
});

test('okunmamış gün sayı UYDURMUYOR', () => {
    // `null` = henüz okunmadı. "0 iş bitti" yazmak günü boş göstermek olurdu
    // ve saniyeler sonra kendini yalanlardı.
    assert.equal(soloDaySubtitle('2026-10-09', null), '9 Ekim');
});

test('gerçekten boş gün sayı saymıyor, durumu söylüyor', () => {
    // "0 iş bitti, 0 kaldı" teknik olarak doğru ama kimsenin kurmayacağı
    // bir cümle.
    assert.equal(soloDaySubtitle('2026-10-09', { done: 0, left: 0 }), '9 Ekim · randevu yok');
});

test('sahipsiz randevu da bu kişinin gününde', () => {
    /*
     * Müdür 24 yalnız `staff_id` eşleşenleri alıyor çünkü orada kimin işi
     * olduğu bir ayrım. Tek kişilik salonda öyle bir ayrım yok: `staff_id`
     * boş bir randevu — masaüstünden ya da mod açılmadan önce kurulmuş
     * olabilir — yine de bu kişinin günündedir. Süzüp atmak günü olduğundan
     * boş göstermek olurdu.
     */
    assert.match(gun, /!row\.staff_id \|\| row\.staff_id === me\?\.id/);
});

test('şimdi hapı YALNIZ bugün çiziliyor', () => {
    /*
     * Başka günün altında "şimdi" diye bir çizgi yalan söyler. Kural artık
     * ekrana gömülü değil `soloDayList`te — orada test edilebiliyor ve
     * sıralamayla birlikte tek yerde duruyor.
     */
    assert.equal(
        soloDayList(state({ pastAppointments: [at('a', '09:30')] }), [at('a', '09:30')], false, 600).nowIndex,
        null,
    );
    // Ekran hapı yalnız bu karardan çiziyor; kendi koşulu yok.
    assert.match(gun, /index === list\.nowIndex \? \(/);
});

test('okunamadı, boş günden AYRI CÜMLE — ama aynı çerçevede', () => {
    /*
     * Hiç veri yokken "randevunuz yok" demek yanlış cümle: gün dolu olabilir.
     * Cümle ayrı (`SOLO_UNREAD_COPY`), çerçeve ortak (`VoidBlock`): dört boş
     * hâl yan yana görülüyor ve biri ötekilere benzemezse ekran hata ânında
     * başka bir uygulamaya dönüşüyor (v4 · B4).
     */
    assert.match(gun, /state === 'error' && !dayKnown[\s\S]{0,400}SOLO_UNREAD_COPY/);
    assert.match(gun, /action=\{\{ label: 'Tekrar dene'/);
    // Müdürün sola yaslı kalıbı bu ekranda artık KULLANILMIYOR. Yorumlar
    // ayıklanıyor: gerekçe metninde adı geçiyor ve metinde arayan bir iddia
    // onu kodun parçası sanardı.
    const code = gun.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /DurumUnread/);
});

test('okunamayan gün için SAAT RAYI çizilmiyor', () => {
    // Ray çalışma saatlerinin cetveli; günü okuyamadıysak onu da bilmiyoruz.
    assert.equal(SOLO_UNREAD_COPY.rail, false);
    assert.equal(SOLO_UNREAD_COPY.dot, false);
});

test('"kendiliğinden yenilenir" bir SÖZ ve tutuluyor', () => {
    /*
     * `useManagerCalendarDay` yoklamayı açık bırakıyor (`poll` varsayılan),
     * bağlantı gelince okuma kendisi başarıya dönüyor. Kapatılırsa bu cümle
     * yalana döner — test o yüzden ikisini birbirine bağlıyor.
     */
    assert.match(SOLO_UNREAD_COPY.hint, /kendiliğinden yenilenir/);
    const day = read('src/lib/managerCalendarDay.ts');
    assert.match(day, /useManagerRead\(read, EMPTY, \{ tables: BOOKING_TABLES \}\)/);
    assert.doesNotMatch(day, /poll: false/);
});

// ── Hâl kartının eylem hapı (Faz 2b) ────────────────────────────────────────

/** Yığının kartları — G5'in kuralı (`soloPickItems`), 15:00'te. */
const pick = (over = {}) => soloPickItems({
    running: [], waitOf: () => null, ticket: null, startable: [], nowMinutes: 15 * 60, nowMs: 0, ...over,
});

test('hap SÜREN işi, yoksa SIRADAKİNİ hedefliyor', () => {
    // Süren iş önce: o anda yapılacak tek şey o. Sıradaki yığında, ama
    // süren iş BEKLEMEDE değilken hapsız (G5 · Karar 3).
    const live = appt({ id: 'r1', start_time: '14:00', arrived_at: '2026-10-09T11:00:00Z' });
    const busy = pick({ running: [live], startable: [appt({ id: 'r2', start_time: '16:00' })] });
    assert.deepEqual(busy.map((item) => item.action), [
        { label: 'İşlemi aç', tone: 'calm', appointmentId: 'r1' },
        null,
    ]);
    assert.deepEqual(
        pick({ startable: [appt({ id: 'r2', start_time: '16:00' })] })[0].action,
        { label: 'Başlat', tone: 'go', appointmentId: 'r2' },
    );
});

test('üzerinde iş yapılacak satır yoksa hap ÇİZİLMİYOR', () => {
    // Boş gün ya da günün sonu: yığın yok, tek kart bilgi olarak kalıyor, hapsız.
    assert.deepEqual(pick(), []);
    assert.match(gun, /<StaffHeroPanelCard panel=\{idlePanel\} \/>/);
});

test('hap KUMANDAYI AÇIYOR, işi kendisi BAŞLATMIYOR', () => {
    /*
     * Başlatmak `started_at` yazıyor ve geri alınamaz; listede yanlışlıkla
     * dokunulan bir hapın günün sayacını yanlış dakikadan başlatması kabul
     * edilemezdi. Hap bir kapı, iş kumandada yapılıyor (v4 · G1 notu).
     */
    assert.match(gun, /pathname: '\/\(staff-flow\)\/kumanda'/);
    assert.doesNotMatch(gun, /startVisit|visit\.start/);
});

test('hap YALNIZ bugün ve gün OKUNDUYSA', () => {
    // Başka günün kartında "Başlat" yalan söylerdi; okunmamış günde ise
    // hangi randevuyu açacağını bilmiyoruz.
    assert.match(gun, /dayKnown && isToday\s*\?\s*soloPickItems\(\{/);
});


// ── Kartın durumu ───────────────────────────────────────────────────────────

test('biten iş: "tahsil edildi" ya da kehribar "adisyon açık" (v4 · G1, G4)', () => {
    const done = { status: 'completed', service_ended_at: '2026-10-09T11:02:00Z' };
    assert.deepEqual(
        soloApptStamp(appt({ ...done, is_paid: true }), 700),
        { label: 'tahsil edildi', tone: 'gr', done: true },
    );
    assert.deepEqual(
        soloApptStamp(appt({ ...done, is_paid: false }), 700),
        { label: 'adisyon açık', tone: 'am', done: true },
    );
    /*
     * ÖDEME HÂLİ SORULMADIYSA "tamamlandı" — "adisyon açık" DEĞİL.
     *
     * "İş bitti"yi "para alındı" diye yazmak en pahalı yalandı; tersi de
     * öyle: alanı okumayan bir ekran ödenmiş işi borç gibi gösterirdi.
     */
    assert.deepEqual(soloApptStamp(appt({ status: 'completed' }), 700), { label: 'tamamlandı', tone: 'gr', done: true });
    // İş bitti ama kayıt henüz tamamlanmadı: para sorusu sorulmuyor.
    assert.deepEqual(
        soloApptStamp(appt({ service_ended_at: '2026-10-09T11:02:00Z', is_paid: false }), 700),
        { label: 'tamamlandı', tone: 'gr', done: true },
    );
});

test('açık adisyonun da adı SOLUYOR — soluklaşma tonla değil bayrakla', () => {
    // Kehribar "adisyon açık" biten iş (v4: `done bar am`); iptal ve gelmedi
    // bitmiş iş değil — adları solmuyor.
    const card = read('src/components/SoloDayParts.tsx');
    assert.match(card, /const done = stamp\?\.done === true;/);
    assert.equal(soloApptStamp(appt({ status: 'completed', is_paid: false }), 700)?.done, true);
    assert.equal(soloApptStamp(appt({ status: 'cancelled' }), 700)?.done, undefined);
    assert.equal(soloApptStamp(appt(), 720)?.done, undefined);
});

test('iptal ile gelmedi AYRI kalıyor', () => {
    // İptali kullanıcı yazar, gelmemeyi müşteri yapar. Tek rozete toplamak
    // yarına taşınacak satırı gizlerdi.
    assert.deepEqual(soloApptStamp(appt({ status: 'cancelled' }), 700), { label: 'iptal', tone: 'rd' });
    // 10:30 randevu, saat 12:00 ve kimse gelmemiş.
    assert.deepEqual(soloApptStamp(appt(), 720), { label: 'gelmedi', tone: 'rd' });
});

test('sıradaki randevuda damga YOK', () => {
    // Henüz olmamış bir şeyin durumu yazılmaz; kartın kenar şeridi de çıkmaz.
    assert.equal(soloApptStamp(appt(), 600), null);
});

test('süre hesaplanamıyorsa yazılmıyor', () => {
    assert.equal(soloApptDuration(appt()), '30 dk');
    // Bozuk aralık "0 dk" diye bir iş üretmiyor.
    assert.equal(soloApptDuration(appt({ end_time: '10:30' })), null);
});

// ── Boş günün cümlesi ───────────────────────────────────────────────────────

test('boş gün İKİNCİ ŞAHISTAN konuşuyor', () => {
    // `emptyDayCopy` salonu dışarıdan anlatıyor ("Salon 09:00'da açıldı");
    // bu modda muhatap salonun kendisi.
    const copy = soloEmptyCopy('2026-10-09', '2026-10-09', { from: 540, to: 1140 });
    assert.equal(copy.title, 'Bugün randevunuz yok.');
    assert.equal(copy.hint, 'Çalışma saatiniz 09:00 – 19:00.');
    assert.equal(copy.label, 'BUGÜN · CUMA');
});

test('kapalı gün boş gün DEĞİL, ayrı cümle ve ray yok', () => {
    const copy = soloEmptyCopy('2026-10-11', '2026-10-11', null);
    assert.equal(copy.title, 'Bugün kapalısınız.');
    assert.match(copy.hint, /Pazar, çalışma saatlerinizde kapalı gün/);
    // Ray çalışma saatlerinin cetveli; o gün çalışma saati yok.
    assert.equal(copy.rail, false);
    // Nokta sakin: turuncu "şu an burada bir şey oluyor" derdi.
    assert.equal(copy.dotTone, 'calm');
});

test('çalışma saati BİLİNMİYORSA uydurulmuyor', () => {
    // `undefined` = okunamadı. "09:00 – 19:00" yazmak varsayılanı gerçek gibi
    // göstermek olurdu.
    const copy = soloEmptyCopy('2026-10-09', '2026-10-09', undefined);
    assert.doesNotMatch(copy.hint, /\d{2}:\d{2}/);
    assert.match(copy.hint, /Randevu/);
});

test('hizmeti olmayan yeni hesaba İLK ADIM söyleniyor', () => {
    /*
     * v4 · S2. "Çalışma saatiniz 09:00 – 19:00" doğru ama işe yaramaz: o
     * kişinin önündeki ilk adım hizmetini tanımlamak. Cümle ancak R1'den
     * sonra DOĞRU oldu — randevu kurma ekranındaki "Yeni hizmet ekle"
     * satırı o yolu açtı.
     */
    const copy = soloEmptyCopy('2026-10-09', '2026-10-09', { from: 540, to: 1140 }, 0);
    assert.match(copy.hint, /Hizmetlerinizi orada da ekleyebilirsiniz/);
});

test('hizmet sayısı BİLİNMİYORSA normal cümle yazılıyor', () => {
    // Okunamayan bir sayıya dayanıp "hizmetiniz yok" demek, hizmetleri olan
    // birine onları yokmuş gibi göstermekti.
    const bilinmiyor = soloEmptyCopy('2026-10-09', '2026-10-09', { from: 540, to: 1140 }, null);
    assert.equal(bilinmiyor.hint, 'Çalışma saatiniz 09:00 – 19:00.');
    const varsa = soloEmptyCopy('2026-10-09', '2026-10-09', { from: 540, to: 1140 }, 7);
    assert.equal(varsa.hint, 'Çalışma saatiniz 09:00 – 19:00.');
});

test('hizmet sayısı TEMBEL okunuyor — dolu günde hiç sorulmuyor', () => {
    // En çok bakılan ekrana her odakta dördüncü bir sorgu eklemek, bir
    // cümle için ağır bir bedel olurdu.
    assert.match(gun, /if \(!dayEmpty \|\| serviceCount !== null\) return undefined;/);
});

test('boş günde ekranın ortasına düğme çizilmiyor', () => {
    // Boş günün eylemi sekme çubuğundaki Randevu (v4 · B1).
    for (const iso of ['2026-10-09', '2026-10-15', '2026-10-01']) {
        assert.equal(soloEmptyCopy(iso, '2026-10-09', { from: 540, to: 1140 }).action, null);
    }
});

test('okunmamış gün BOŞ gösterilmiyor', () => {
    // `dayKnown` olmadan "randevunuz yok" denmiyor: gün dolu olabilir.
    assert.match(gun, /const dayEmpty = dayKnown/);
});

// ── Takvim · tek sütun ──────────────────────────────────────────────────────

test('tek kişilikte sütun başlığı çizilmiyor ve sütun genişliyor', () => {
    /*
     * Telefonda görünen buydu: tek sütunun üstünde kullanıcının kendi adı
     * yazıyor ve ızgaradan 44 pt alıyordu. 95 pt genişlik beş kişiyi yan yana
     * sığdırmak için seçilmişti; tek sütunda o kısıt yok.
     */
    const grid = read('src/components/ColumnCalendar.tsx');
    assert.match(grid, /soloColumn \? null : \(/);
    // Başlığın yerinde T1'in 22 pt'lik payı (bkz. tek-takvim-t1).
    assert.match(grid, /const headerHeight = soloColumn \? soloColumnMetrics\.gridTop : columnMetrics\.headerHeight/);
    assert.match(grid, /width: columnWidth/);
    // Sürükleme hedefi de aynı genişlikte — yoksa vurgu bloğun yarısını gösterirdi.
    assert.match(grid, /columnWidth=\{columnWidth\}/);
    assert.match(read('app/mudur/calendar.tsx'), /soloColumn=\{solo\}/);
});


// ── Listenin kuruluşu (telefonda görülen iki kusur, 2026-10-11) ─────────────


test('İPTAL EDİLEN randevu listenin başına çıkmıyor', () => {
    /*
     * `buildStaffDayState` iptali saatine bakmadan "geçmiş" kovasına atıyor
     * (Müdür 24'te doğru: o ekran olmuş/olacak diye ayırıyor) ve ekran
     * geçmiş kovasını önce çiziyordu. Telefonda 11:15 iptal, 09:30'un
     * üstünde duruyordu.
     */
    const iptal = at('x', '11:15', { status: 'cancelled' });
    const list = soloDayList(
        state({ pastAppointments: [iptal], upcomingAppointments: [at('a', '09:30'), at('b', '12:30')] }),
        [], true, 600,
    );
    assert.deepEqual(list.rows.map((r) => r.id), ['a', 'x', 'b']);
});

test('şimdi hapı SAATE göre araya giriyor, kovaya göre değil', () => {
    // 10:00 (600 dk): 09:30 geride, 11:15 ve 12:30 ileride.
    const list = soloDayList(
        state({
            pastAppointments: [at('x', '11:15', { status: 'cancelled' })],
            upcomingAppointments: [at('a', '09:30'), at('b', '12:30')],
        }),
        [], true, 600,
    );
    assert.equal(list.nowIndex, 1, 'hap 09:30 ile 11:15 arasında olmalı');
});

test('süren iş varken liste YALNIZ sıradakiler', () => {
    // v4 · G2/G3: biten işler listede yok, süren iş kartta duruyor ve
    // ekranın cevapladığı soru "sırada ne var".
    const live = at('live', '14:00', { arrived_at: '2026-10-09T11:00:00Z' });
    const day = [
        live,
        at('p', '10:30', { status: 'completed' }),
        at('n', '12:00'),                                              // gelmedi sayıldı
        at('k', '13:00', { customer_arrived_at: '2026-10-09T10:05:00Z' }), // geldi, bekliyor
        at('b', '17:30'),
        at('a', '16:30'),
    ];
    const list = soloDayList(
        state({
            kind: 'running',
            listTitle: 'Sıradaki · 2 randevu',
            runningAppointment: live,
            pastAppointments: [day[1], day[2], day[3]],
            upcomingAppointments: [day[4], day[5]],
        }),
        day, true, 900,
    );
    // Bekleyen müşteri iş sürerken listeden KAYBOLMUYOR (eskiden yalnız
    // saati gelmemişler vardı); biten ve gelmedi sayılan yok.
    assert.deepEqual(list.rows.map((r) => r.id), ['k', 'a', 'b']);
    assert.equal(list.nowIndex, null, 'süren işte hap çizilmiyor');
    assert.equal(list.title, 'Sıradaki · 3 randevu');
});

test('"Bugün · kapandı" yalnız gerçekten iş kalmadıysa', () => {
    // Telefonda 23:00: son randevunun bitişi geçmişti, personel durumu günü
    // kapattı; oysa iki müşteri bekliyordu.
    const day = [
        at('p', '17:20', { status: 'completed', is_paid: true }),
        at('k', '22:30', { end_time: '22:50', customer_arrived_at: '2026-10-09T19:31:00Z' }),
    ];
    const ended = state({ kind: 'ended', listTitle: 'Bugün · kapandı', showNowLine: false, pastAppointments: day });
    assert.equal(soloDayList(ended, day, true, 23 * 60).title, 'Bugün · 2 randevu');
    // Bekleyen kalmayınca gerçekten kapandı.
    const done = [day[0]];
    assert.equal(soloDayList({ ...ended, pastAppointments: done }, done, true, 23 * 60).title, 'Bugün · kapandı');
});

test('BUGÜN OLMAYAN günde "şu an" hesabı YOK', () => {
    /*
     * Dün seçiliyken kart "ŞU AN BOŞ · 9 sa 16 dk · 09:30'a kadar" diyordu —
     * o gün çoktan yaşandı ve ekranın anlattığı an hiç var olmadı. Liste tek
     * parça, saat sırasında, hapsız.
     */
    const list = soloDayList(
        state({ pastAppointments: [at('x', '11:15')], upcomingAppointments: [at('a', '09:30')] }),
        [at('b', '12:30'), at('a', '09:30'), at('x', '11:15')],
        false, 600,
    );
    assert.deepEqual(list.rows.map((r) => r.id), ['a', 'x', 'b']);
    assert.equal(list.nowIndex, null);
    assert.equal(list.title, '3 randevu');
});

test('hâl kartı EKRANDA da yalnız bugün çiziliyor', () => {
    // Yuva TEK: ya seçici (yığın, G5) ya tek bilgi kartı — ikisi birden değil.
    assert.match(gun, /\{!dayEmpty && isToday && pickItems\.length > 0 \? \(\s*<View[^>]*>\s*<SoloPicker/);
    assert.match(gun, /\{!dayEmpty && isToday && idlePanel \?/);
    assert.match(gun, /const idlePanel = dayState && pickItems\.length === 0\s*\? soloIdlePanel\(dayState\.kind, todayCounts, data\.open, nowMinutes\) \?\? dayState\.panel\s*: null;/);
});


test('EKRANIN SICAKLIĞI — uygulamanın tek gradyanı Gün\'de de var', () => {
    /*
     * Telefonda görülen (2026-10-11): Gün'ün üstü düz siyahtı, yanındaki
     * Takvim ise sıcak. İki ekran aynı üründen değilmiş gibi duruyordu.
     * v4'te Gün `{glow:1}` ile çiziliyor.
     *
     * Jeton PAYLAŞILIYOR: müdür Takvim'i ve personel Bugün'ü de aynı
     * `glow`u kullanıyor — üç ekranın sıcaklığı tanım gereği ayrışamıyor.
     */
    assert.match(gun, /colors=\{dark \? glow\.dark : glow\.light\}/);
    assert.match(gun, /locations=\{glow\.locations\}/);
    // Güvenli alanın ÜSTÜNDEN başlıyor; yoksa başlığın altında şerit gibi durur.
    assert.match(gun, /height: glow\.height \+ insets\.top/);

    const takvim = read('app/mudur/calendar.tsx');
    assert.match(takvim, /height: glow\.height \+ insets\.top/);
});


// ── G4 · ADİSYON AÇIK ───────────────────────────────────────────────────────

/** Kasa'nın kaynağındaki bekleyen adisyon (`flowBuild` · `kind: 'due'`). */
const due = (id, over = {}) => ({
    id, kind: 'due', time: '16:02', firstName: 'Tuğçe', lastName: 'Erden',
    detail: 'Kalıcı Makyaj · 120 dk', appointmentId: id, amountValue: 4500, ticketKey: id,
    service: 'Kalıcı Makyaj', dateISO: '2026-10-09', dueMinutes: 2, ...over,
});
/** Gün okumasındaki satırı: tamamlanmış, tahsil edilmemiş. */
const closed = (id, over = {}) => appt({
    id, status: 'completed', service_ended_at: '2026-10-09T13:02:00Z', is_paid: false, ...over,
});

test('G4 · kartın adisyonu bugünün EN SON biteni; dünden kalan kartın konusu değil', () => {
    const rows = [closed('t1'), closed('t2'), closed('old')];
    const events = [
        due('t1', { dueMinutes: 50, time: '15:14' }),
        due('t2', { dueMinutes: 2 }),
        // Dünden kalan: listede amber satır ve Kasa'nın şeridi, kart değil.
        due('old', { carriedOver: true, dueMinutes: 1, dateISO: '2026-10-08', time: 'Dün 19:40' }),
    ];
    assert.equal(soloOpenTicket(events, rows, '2026-10-09')?.appointmentId, 't2');
    assert.equal(soloOpenTicket([], rows, '2026-10-09'), null);
    // Kural tarih süzgecinden BAĞIMSIZ: günü yazılmamış devreden olay da kart olmuyor.
    assert.equal(
        soloOpenTicket([due('t1', { carriedOver: true, dateISO: undefined })], [closed('t1')], '2026-10-09'),
        null,
    );
});

test('G4 · tutarı olmayan ya da sıfır adisyon kart OLMUYOR', () => {
    // "Tahsil et" sunucuda `zero_amount` alırdı: dokunulan kontrol iş yapmazdı.
    const rows = [closed('t1')];
    assert.equal(soloOpenTicket([due('t1', { amountValue: undefined })], rows, '2026-10-09'), null);
    assert.equal(soloOpenTicket([due('t1', { amountValue: 0 })], rows, '2026-10-09'), null);
});

test('G4 · iki okumadan hangisi tahsilatı ÖNCE öğrenirse kart o an iniyor', () => {
    // Gün okuması ödendi diyor, Kasa'nınki henüz demiyor: "Tahsil et" denmez.
    assert.equal(soloOpenTicket([due('t1')], [closed('t1', { is_paid: true })], '2026-10-09'), null);
    // Gün okumasında satır yok ya da iş hâlâ sürüyor (bayat okuma): kart yok.
    assert.equal(soloOpenTicket([due('t1')], [], '2026-10-09'), null);
    assert.equal(
        soloOpenTicket([due('t1')], [appt({ id: 't1', arrived_at: '2026-10-09T11:00:00Z' })], '2026-10-09'),
        null,
    );
    // Ödeme hâli SORULMAMIŞSA Kasa'nın sözü geçiyor.
    assert.equal(soloOpenTicket([due('t1')], [closed('t1', { is_paid: undefined })], '2026-10-09')?.appointmentId, 't1');
    // İptal edilmiş satırın adisyonu kart olmuyor.
    assert.equal(soloOpenTicket([due('t1')], [closed('t1', { status: 'cancelled' })], '2026-10-09'), null);
});

test('G4 · kart: kehribar, nabızsız, sol şeritli; büyük sayı TUTAR', () => {
    assert.deepEqual(soloTicketPanel(due('t1')), {
        label: 'Adisyon açık',
        tone: 'am',
        bar: true,
        hasPulse: false,
        heroValue: '₺4.500',
        subText: 'Tuğçe Erden · Kalıcı Makyaj · 16:02’de bitti',
        subName: 'Tuğçe Erden',
    });
});

test('G4 · yığının sırası: süren iş > açık adisyon > sıradaki', () => {
    const ticket = due('t1');
    const next = appt({ id: 'n1', start_time: '16:00' });
    const live = appt({ id: 'r1', start_time: '14:00', arrived_at: '2026-10-09T11:00:00Z' });
    // Süren iş varken adisyon kartı yok (v4: o sırada sorulmuyor).
    assert.deepEqual(pick({ running: [live], ticket, startable: [next] }).map((item) => item.id), ['r1', 'n1']);
    assert.deepEqual(pick({ ticket, startable: [next] }).map((item) => item.action), [
        { label: 'Tahsil et', tone: 'go', appointmentId: 't1' },
        { label: 'Başlat', tone: 'go', appointmentId: 'n1' },
    ]);
    // Randevusu bilinmeyen adisyon kart olmuyor — hap neyi açacağını bilmeli.
    assert.deepEqual(pick({ ticket: due('t1', { appointmentId: undefined }), startable: [next] }).map((item) => item.id), ['n1']);
});

test('G4 · açık adisyon "bitti" sayısına giriyor — para alınmasa da iş bitti', () => {
    const me = { id: 'p1', initials: 'DT', name: 'Derya Toprak', state: 'free' };
    const rows = [
        closed('t1', { staff_id: 'p1', start_time: '14:00', end_time: '16:00' }),
        appt({ id: 'y1', staff_id: 'p1', start_time: '16:30', end_time: '17:15' }),
    ];
    const day = buildStaffDayState(me, rows, [me], 16 * 60 + 4, 0, '', '2026-10-09');
    assert.equal(day.pastAppointments.length, 1);
    assert.equal(day.upcomingAppointments.length, 1);
    // Başlığın sayısı artık kovalardan değil, kartın damgasından.
    assert.deepEqual(soloDayCounts(rows, 16 * 60 + 4), { done: 1, left: 1, noshow: 0, cancelled: 0 });
});

test('G4 · Gün: Kasa\'nın kaynağından, yalnız süren iş YOKKEN', () => {
    assert.match(gun, /const \{ events: flowEvents, businessName \} = useManagerDay\(\);/);
    assert.match(gun, /dayKnown && isToday && !runningRow \? soloOpenTicket\(flowEvents, mine, selectedISO\) : null/);
    // Yığın: adisyon, sonra saati geçmiş olsa da başlatılabilirler.
    assert.match(gun, /ticket,\s*startable: soloStartable\(mine, nowMinutes\),/);
});

test('G4 · tahsil hâli Gün okumasına giriyor, sormayan okumaya değil', () => {
    const source = read('src/lib/managerSource.ts');
    assert.match(source, /\.select\(`\$\{RES_COLS\}, updated_at, wait_ends_at, wait_minutes, is_paid, no_show_at`\)/);
    const map = read('src/lib/managerMap.ts');
    assert.match(map, /\.\.\.\('is_paid' in row \? \{ is_paid: row\.is_paid == null \? null : row\.is_paid === true \} : \{\}\),/);
    // Paylaşılan sabit DEĞİŞMEDİ: bütün okumaları besliyor.
    assert.doesNotMatch(map.slice(map.indexOf('export const RES_COLS'), map.indexOf(';', map.indexOf('export const RES_COLS'))), /is_paid/);
});

test('G4 · kartın kehribar sol şeridi (`.pnl.bar`)', () => {
    const parts = read('src/components/StaffDayParts.tsx');
    assert.match(parts, /\{panel\.bar \? \(\s*<View\s*pointerEvents="none"\s*style=\{\{\s*position: 'absolute',\s*left: 0,/);
    assert.match(parts, /width: staffDayMetrics\.panelBarWidth,\s*backgroundColor: ink\.amDot,/);
    assert.match(parts, /paddingLeft: panel\.bar \? staffDayMetrics\.panelBarPadLeft : staffDayMetrics\.panelPad,/);
    const tokens = read('src/theme/tokens.ts');
    assert.match(tokens, /panelBarWidth: 4,/);
    assert.match(tokens, /panelBarPadLeft: 17,/);
});

// ── Saati geçen randevu başlatılabiliyor (telefonda görüldü, 2026-10-12) ────

test('saati BİR DAKİKA geçen randevu hâlâ sıradaki: Başlat kaybolmuyor', () => {
    /*
     * 22:30'da kart "ŞU AN BOŞ · 0 dk · sıradaki Gizem Ünal · Başlat"
     * diyordu; 22:31'de randevu "geçmiş" kovasına düştü, hap kayboldu ve kart
     * "0 dk · Gün sonuna kadar" dedi. Geciken müşteriyi başlatmanın yolu
     * kalmamıştı.
     */
    const day = [
        at('p1', '17:20', { status: 'completed', is_paid: true }),
        at('n1', '21:00'),
        at('g1', '22:30', { end_time: '22:50', customer_name: 'Gizem Ünal', service: 'Kaş Tasarımı' }),
    ];
    for (const now of [22 * 60 + 30, 22 * 60 + 31, 23 * 60]) {
        assert.equal(soloStartable(day, now)[0]?.id, 'g1', `saat ${now}`);
        assert.deepEqual(
            pick({ startable: soloStartable(day, now), nowMinutes: now })[0].action,
            { label: 'Başlat', tone: 'go', appointmentId: 'g1' },
        );
    }
    // Saatinde henüz G1'in kartı (personel durumunun "ŞU AN BOŞ"u).
    assert.equal(soloNextPanel(day[2], 22 * 60 + 30, 0), null);
    assert.deepEqual(soloNextPanel(day[2], 22 * 60 + 31, 0), {
        label: 'Gecikti',
        tone: 'rd',
        hasPulse: false,
        heroValue: '1',
        heroUnit: 'dk',
        subText: 'Gizem Ünal · Kaş Tasarımı · 29 dk sonra gelmedi sayılır',
        subName: 'Gizem Ünal',
    });
    // Pay dolunca gelmedi sayılıyor ve kartın konusu değil.
    assert.deepEqual(soloStartable(day, 23 * 60 + 1), []);
});

test('bekleyen müşteri önce; gelmedi sayılan da "Geldi" ile geri dönüyor', () => {
    const now = 22 * 60 + 31;
    const arrived = Date.parse('2026-10-09T19:05:00Z');
    const day = [
        at('k1', '21:00', { customer_name: 'Tuğçe Erden', service: 'Kaş Tasarımı', customer_arrived_at: '2026-10-09T19:05:00Z' }),
        at('g1', '22:30'),
        at('u1', '23:00'),
    ];
    assert.equal(soloStartable(day, now)[0]?.id, 'k1');
    // Geliş saati telefonun saatiyle — test makinesinin saat diliminden bağımsız.
    const came = new Date(arrived);
    const clock = `${String(came.getHours()).padStart(2, '0')}:${String(came.getMinutes()).padStart(2, '0')}`;
    const panel = soloNextPanel(day[0], now, arrived + 86 * 60_000);
    // "KAPIDA" değil, "BEKLEMEDE" de değil: o kelime aynı yuvada süren işin
    // beklemesi (G3). Kumandanın kadranı bu hâlde "BEKLİYOR" diyor.
    assert.equal(panel.label, 'Bekliyor');
    assert.equal(panel.tone, 'am');
    assert.equal(panel.heroValue, '86');
    assert.equal(panel.heroUnit, 'dk');
    assert.match(panel.subText, new RegExp(`^Tuğçe Erden · Kaş Tasarımı · ${clock}’(d|t)(a|e) geldi$`));
    // Erken gelen müşteri de bekliyor: "şu an boş" demek onu yok saymak olurdu.
    assert.equal(soloNextPanel(at('e1', '23:00', { customer_arrived_at: '2026-10-09T19:20:00Z' }), now, arrived)?.label, 'Bekliyor');
    // Listede de damgası var — eskiden damgasızdı, ne bitmiş ne gelmemiş görünüyordu.
    assert.deepEqual(soloApptStamp(day[0], now), { label: 'bekliyor', tone: 'am' });
    assert.equal(soloDayCounts(day, now).noshow, 0);
});

test('başlamış, biten, iptal ve tamamlanan sıradaki OLMUYOR', () => {
    const now = 15 * 60;
    for (const over of [
        { arrived_at: '2026-10-09T11:50:00Z' },
        { service_ended_at: '2026-10-09T12:20:00Z' },
        { status: 'cancelled' },
        { status: 'completed' },
    ]) {
        assert.deepEqual(soloStartable([at('x', '14:50', over)], now), [], JSON.stringify(over));
    }
    assert.deepEqual(soloStartable([], now), []);
});

test('sıradaki yokken gün sonu 19:00 DEĞİL, çalışma saatinin kapanışı', () => {
    // 22:31'de 23:55'e kadar açık salonda kart "0 dk · Gün sonuna kadar" diyordu.
    const counts = { done: 3, left: 0, noshow: 1, cancelled: 0 };
    assert.deepEqual(soloIdlePanel('free', counts, { from: 480, to: 1435 }, 22 * 60 + 31), {
        label: 'Şu an boş',
        hasPulse: false,
        // "1 sa 24 dk": dakika da büyük sayı (G5'in süre dili).
        heroValue: '1',
        heroUnit: 'sa',
        heroValue2: '24',
        heroUnit2: 'dk',
        subText: '23:55’e kadar · sıradaki randevu yok',
    });
    // Kapanış geçti ya da saat bilinmiyor → günün özeti, başlığın sayılarıyla.
    for (const open of [{ from: 480, to: 1140 }, null, undefined]) {
        assert.deepEqual(soloIdlePanel('ended', counts, open, 22 * 60 + 31), {
            label: 'Bugün',
            hasPulse: false,
            heroValue: '4',
            heroUnit: 'randevu',
            subText: '3 tamamlandı · 1 gelmedi',
        });
    }
    // İzin ve kapalı gün kendi kartını söylüyor.
    assert.equal(soloIdlePanel('off', counts, { from: 480, to: 1435 }, 600), null);
    assert.equal(soloIdlePanel('leave', counts, { from: 480, to: 1435 }, 600), null);
});

test('kart kırmızıyı biliyor: GECİKTİ etiketi ve noktası panelin kırmızısı', () => {
    const parts = read('src/components/StaffDayParts.tsx');
    assert.match(parts, /backgroundColor: panel\.tone === 'rd' \? ink\.red : ink\.amDot,/);
    assert.match(parts, /color: panel\.tone === 'rd' \? ink\.red : panel\.tone === 'am' \? ink\.am : ink\.ink2,/);
});


// ── İş sürerken BİTENLER katlı (2026-10-15, kullanıcı kararı) ───────────────

test('iş sürerken bitenler KAYBOLMUYOR: "Bitenler · 3" satırına katlanıyor', () => {
    // Telefonda: başlık "3 iş bitti, 1 kaldı", liste "SIRADAKİ · 0 RANDEVU" ve
    // o üç iş hiçbir yerde yoktu. Odak yine sıradakiler; geçmiş katlı.
    const done = (id, time) => at(id, time, {
        status: 'completed', arrived_at: '2026-10-09T07:00:00Z', service_ended_at: '2026-10-09T07:30:00Z', is_paid: true,
    });
    const running = at('r', '12:00', { arrived_at: '2026-10-09T09:00:00Z' });
    const day = [done('c', '11:00'), done('a', '09:00'), done('b', '10:00'), running];
    const list = soloDayList(state({ kind: 'running', runningAppointment: running }), day, true, 12 * 60 + 5);
    assert.equal(list.title, 'Sıradaki · 0 randevu');
    assert.deepEqual(list.rows, []);
    assert.deepEqual(list.folded.map((row) => row.id), ['a', 'b', 'c'], 'saat sırasında, süren iş yok');
    assert.equal(list.foldLabel, 'Bitenler · 3');
});

test('katlı satırın sayısı başlıkla AYNI kural: gelmedi ve iptal ayrı', () => {
    const done = at('d', '09:00', { status: 'completed', service_ended_at: '2026-10-09T07:30:00Z', is_paid: true });
    const gone = at('x', '10:00', { status: 'cancelled' });
    const noshow = at('n', '08:00');
    const running = at('r', '12:00', { arrived_at: '2026-10-09T09:00:00Z' });
    const list = soloDayList(state({ kind: 'running', runningAppointment: running }), [done, gone, noshow, running], true, 12 * 60);
    assert.equal(list.foldLabel, 'Bitenler · 1 · 1 gelmedi · 1 iptal');
    // Müsait günde geçmiş zaten listede: katlanacak bir şey yok.
    assert.deepEqual(soloDayList(state(), [done], true, 600).folded, []);
    assert.equal(soloDayList(state(), [done], true, 600).foldLabel, null);
});

test('katlı satır kapalı başlıyor ve kartlar aynı bileşen', () => {
    assert.match(gun, /const \[foldOpen, setFoldOpen\] = useState\(false\);/);
    assert.match(gun, /list\.foldLabel && foldOpen \? list\.folded\.map\(\(appointment\) => \(\s*<SoloAppointmentCard/);
});
