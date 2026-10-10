/**
 * Tek kişilik · Gün ekranının metin ve kapsam kuralları (108).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    SOLO_UNREAD_COPY,
    soloApptDuration,
    soloDayList,
    soloApptStamp,
    soloDaySubtitle,
    soloEmptyCopy,
    soloPanelAction,
} from '../mobile/src/lib/soloDay.ts';

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
    assert.match(gun, /isToday && dayState\s*\?\s*\{\s*done:/);
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

test('hap SÜREN işi, yoksa SIRADAKİNİ hedefliyor', () => {
    // Süren iş önce: o anda yapılacak tek şey o.
    assert.deepEqual(
        soloPanelAction(appt({ id: 'r1' }), appt({ id: 'r2' })),
        { label: 'Kumandayı aç', tone: 'calm', appointmentId: 'r1' },
    );
    assert.deepEqual(
        soloPanelAction(null, appt({ id: 'r2' })),
        { label: 'Başlat', tone: 'go', appointmentId: 'r2' },
    );
});

test('üzerinde iş yapılacak satır yoksa hap ÇİZİLMİYOR', () => {
    // Boş gün ya da günün sonu: kart bilgi olarak kalıyor, hapsız.
    assert.equal(soloPanelAction(null, null), null);
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
    assert.match(gun, /dayKnown && isToday && dayState/);
});


// ── Kartın durumu ───────────────────────────────────────────────────────────

test('biten iş "tahsil edildi" DEĞİL "tamamlandı" diyor', () => {
    /*
     * Tasarım (v4 · G1) bu yuvada "tahsil edildi" yazıyor. Yazılmıyor, çünkü
     * randevu satırında ödeme diye bir alan yok — para kaydı `cash.ts`'te ve
     * bu ekran onu okumuyor. "İş bitti"yi "para alındı" diye yazmak en pahalı
     * yalan olurdu: kullanıcı tahsil ettiğini sanıp günü kapatır.
     */
    assert.deepEqual(
        soloApptStamp(appt({ service_ended_at: '2026-10-09T11:02:00Z' }), 700),
        { label: 'tamamlandı', tone: 'gr' },
    );
    assert.deepEqual(soloApptStamp(appt({ status: 'completed' }), 700), { label: 'tamamlandı', tone: 'gr' });
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
    assert.match(grid, /const headerHeight = soloColumn \? 0 : columnMetrics\.headerHeight/);
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
    const list = soloDayList(
        state({
            kind: 'running',
            listTitle: 'Sıradaki · 2 randevu',
            runningAppointment: at('live', '14:00'),
            pastAppointments: [at('p', '10:30', { status: 'completed' })],
            upcomingAppointments: [at('b', '17:30'), at('a', '16:30')],
        }),
        [], true, 900,
    );
    assert.deepEqual(list.rows.map((r) => r.id), ['a', 'b']);
    assert.equal(list.nowIndex, null, 'süren işte hap çizilmiyor');
    assert.equal(list.title, 'Sıradaki · 2 randevu');
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
    assert.match(gun, /!dayEmpty && isToday && dayState\?\.panel/);
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
