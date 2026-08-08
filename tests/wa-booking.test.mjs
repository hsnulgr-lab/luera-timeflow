import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    foldTr, isSaneDate, matchOfferedTime, parseTurkishDate, parseTurkishTime, parseWhen,
} from '../supabase/functions/_shared/booking/dates.ts';
import {
    greetingName, isPlaceholderName, pickCustomer,
} from '../supabase/functions/_shared/booking/identity.ts';
import * as MSG from '../supabase/functions/_shared/booking/messages.ts';
import { matchService } from '../supabase/functions/_shared/booking/services.ts';
import {
    availabilityFor, availableDays, minToTime, overlaps, staffSlots, timeToMin, weekdayOf,
} from '../supabase/functions/_shared/booking/slots.ts';
import {
    detectConfirm, detectIntent, detectListChoice, inboundKind,
} from '../supabase/functions/_shared/booking/intent.ts';
import {
    CLARIFY_OPTIONS, CLARIFY_QUESTION, clarifyQuestion, coerceTopic, detectClarify,
    detectTopic, PERSONAL, TOPICS,
} from '../supabase/functions/_shared/booking/inquiry.ts';
import {
    computeBalance, formatTL,
} from '../supabase/functions/_shared/booking/finance.ts';
import { computePatientFinance } from '../src/lib/patientBalance.ts';
import {
    parseReceiptEvent, parseReceiptStatus, receiptPatch,
} from '../supabase/functions/_shared/booking/receipts.ts';
import {
    allResourcesFull as edgeAllFull, assignResources,
    isResourceFull as edgeFull, pickFreeResource as edgePick,
} from '../supabase/functions/_shared/booking/resources.ts';
import {
    allResourcesFull as appAllFull, isResourceFull as appFull, pickFreeResource as appPick,
} from '../src/lib/resourceCapacity.ts';

// WhatsApp randevu beyni. Bu kod bugüne kadar 420 satırlık bir edge fonksiyonun
// içinde testsiz duruyordu; müşteriye hangi saatin sunulacağına ve hangi tarihe
// randevu yazılacağına karar verdiği için kod tabanının en riskli parçasıydı.

// 2026-08-07 bir CUMA. Tüm göreli tarih testleri buna göre.
const TODAY = '2026-08-07';

// ── Tarih ───────────────────────────────────────────────────────────────────

test('göreli günler', () => {
    assert.equal(parseTurkishDate('bugün gelebilir miyim', TODAY), '2026-08-07');
    assert.equal(parseTurkishDate('yarın olur mu', TODAY), '2026-08-08');
    assert.equal(parseTurkishDate('öbür gün müsait misiniz', TODAY), '2026-08-09');
});

test('gün adı bir sonraki o güne düşer', () => {
    // Cuma günü "pazartesi" → 10 Ağustos Pazartesi
    assert.equal(parseTurkishDate('pazartesi', TODAY), '2026-08-10');
    assert.equal(parseTurkishDate('cumartesi gelmek istiyorum', TODAY), '2026-08-08');
});

test('bugünün adı söylenirse haftaya kastedilir, "bu" derse bugün', () => {
    // Cuma günü "cuma" yazan biri çoğunlukla gelecek haftayı diyor.
    assert.equal(parseTurkishDate('cuma', TODAY), '2026-08-14');
    assert.equal(parseTurkishDate('bu cuma', TODAY), '2026-08-07');
});

test('"haftaya" bir hafta ileri atar', () => {
    assert.equal(parseTurkishDate('haftaya pazartesi', TODAY), '2026-08-17');
    assert.equal(parseTurkishDate('gelecek hafta salı', TODAY), '2026-08-18');
});

test('gün + ay adı', () => {
    assert.equal(parseTurkishDate('20 Ağustos', TODAY), '2026-08-20');
    assert.equal(parseTurkishDate('3 Eylül 2026 olur mu', TODAY), '2026-09-03');
});

test('yıl yazılmayan geçmiş ay gelecek yıla taşınır', () => {
    // Ağustos'ta "5 Ocak" denince 2027 kastediliyor — ama 90 gün sınırını aşıyor.
    assert.equal(parseTurkishDate('5 Ocak', TODAY), null);
    // 90 gün içinde kalan geçmiş-ay örneği yok; sınırın çalıştığını doğrular.
});

test('sayısal tarih biçimleri', () => {
    assert.equal(parseTurkishDate('20.08', TODAY), '2026-08-20');
    assert.equal(parseTurkishDate('20/08/2026', TODAY), '2026-08-20');
    assert.equal(parseTurkishDate('2026-08-20', TODAY), '2026-08-20');
});

test('geçmiş tarih ve 90 gün ötesi reddedilir', () => {
    assert.equal(parseTurkishDate('2026-08-01', TODAY), null, 'geçmiş');
    assert.equal(parseTurkishDate('2027-01-01', TODAY), null, '90 günden uzak');
});

test('tarih yoksa null döner — model o zaman devreye girer', () => {
    assert.equal(parseTurkishDate('fiyatlar ne kadar', TODAY), null);
    assert.equal(parseTurkishDate('teşekkürler', TODAY), null);
});

test('isSaneDate uydurma günü eler', () => {
    assert.equal(isSaneDate('2026-02-31', TODAY), false);
    assert.equal(isSaneDate('20-08-2026', TODAY), false);
    assert.equal(isSaneDate('2026-08-20', TODAY), true);
});

// ── Saat ────────────────────────────────────────────────────────────────────

test('ayraçlı saat olduğu gibi alınır', () => {
    assert.equal(parseTurkishTime('14:00 olur'), '14:00');
    assert.equal(parseTurkishTime('saat 09:30'), '09:30');
});

test('çıplak 1-7 öğleden sonra sayılır', () => {
    // "3\'te gelirim" diyen kimse sabahın 3\'ünü kastetmiyor.
    assert.equal(parseTurkishTime("3'te gelebilirim"), '15:00');
    assert.equal(parseTurkishTime('saat 5'), '17:00');
    assert.equal(parseTurkishTime('saat 10'), '10:00');
});

test('sabah/akşam ifadeleri saati kaydırır', () => {
    assert.equal(parseTurkishTime('sabah 10 olur mu'), '10:00');
    assert.equal(parseTurkishTime('akşam 6 gibi'), '18:00');
    assert.equal(parseTurkishTime('öğleden sonra 2'), '14:00');
});

test('buçuk', () => {
    assert.equal(parseTurkishTime('3 buçuk'), '15:30');
    assert.equal(parseTurkishTime('on buçuk'), '10:30');
    assert.equal(parseTurkishTime('sabah 9 buçuk'), '09:30');
});

test('yazıyla saat', () => {
    assert.equal(parseTurkishTime('üçte gelirim'), '15:00');
    assert.equal(parseTurkishTime('on birde uygun'), '11:00');
});

test('çıplak sayı saat sayılmaz', () => {
    // "2 kişiyiz" 14:00 randevusuna dönüşmemeli.
    assert.equal(parseTurkishTime('2 kişiyiz'), null);
    assert.equal(parseTurkishTime('merhaba'), null);
});

test('tarih biçimi saat sanılmaz', () => {
    assert.equal(parseTurkishTime('20.08 tarihinde'), null);
});

test('parseWhen ikisini birden çıkarır', () => {
    const w = parseWhen('yarın 14:30 olur mu', TODAY);
    assert.deepEqual(w, { date: '2026-08-08', time: '14:30' });
});

test('foldTr Türkçe İ/ı katlar', () => {
    assert.equal(foldTr('İPTAL'), 'iptal');
    assert.equal(foldTr('Iptal'), 'iptal');
    assert.equal(foldTr('ŞUBAT'), 'subat');
});

// ── Slotlar ─────────────────────────────────────────────────────────────────

const ORG_HOURS = [
    { day: 5, start: '09:00', end: '18:00', isOff: false },
    { day: 0, start: '09:00', end: '18:00', isOff: true },
];

test('slot ızgarası çalışma penceresine sığar', () => {
    const mins = staffSlots({
        orgHours: ORG_HOURS, staffHours: null, weekday: 5,
        serviceDuration: 60, slotDuration: 30, dayReservations: [], isTimeOff: false, minStart: 0,
    });
    assert.equal(minToTime(mins[0]), '09:00');
    // Son slot 17:00 — 60 dk hizmet 18:00'de biter, 17:30 sığmaz.
    assert.equal(minToTime(mins[mins.length - 1]), '17:00');
});

test('kapalı gün ve izin boş liste verir', () => {
    const base = {
        orgHours: ORG_HOURS, staffHours: null, serviceDuration: 60, slotDuration: 30,
        dayReservations: [], minStart: 0,
    };
    assert.deepEqual(staffSlots({ ...base, weekday: 0, isTimeOff: false }), [], 'pazar kapalı');
    assert.deepEqual(staffSlots({ ...base, weekday: 5, isTimeOff: true }), [], 'personel izinli');
    assert.deepEqual(staffSlots({ ...base, weekday: 3, isTimeOff: false }), [], 'tanımsız gün');
});

test('personel saati işletmeyle kesişir — geniş olan kazanmaz', () => {
    const mins = staffSlots({
        orgHours: ORG_HOURS,
        staffHours: [{ day: 5, start: '11:00', end: '15:00', isOff: false }],
        weekday: 5, serviceDuration: 60, slotDuration: 30,
        dayReservations: [], isTimeOff: false, minStart: 0,
    });
    assert.equal(minToTime(mins[0]), '11:00');
    assert.equal(minToTime(mins[mins.length - 1]), '14:00');
});

test('dolu aralık üstündeki slotlar düşer', () => {
    const mins = staffSlots({
        orgHours: ORG_HOURS, staffHours: null, weekday: 5,
        serviceDuration: 60, slotDuration: 30,
        dayReservations: [{ start_time: '10:00', end_time: '11:00' }],
        isTimeOff: false, minStart: 0,
    }).map(minToTime);
    assert.ok(!mins.includes('09:30'), '09:30 başlayan 60 dk 10:00 randevusuna girer');
    assert.ok(!mins.includes('10:00'));
    assert.ok(!mins.includes('10:30'));
    assert.ok(mins.includes('11:00'), 'bitişik slot serbest');
    assert.ok(mins.includes('09:00'), '09:00 başlayan 60 dk tam 10:00\'de biter');
});

test('minStart geçmiş saatleri eler', () => {
    const mins = staffSlots({
        orgHours: ORG_HOURS, staffHours: null, weekday: 5,
        serviceDuration: 60, slotDuration: 30, dayReservations: [], isTimeOff: false,
        minStart: 13 * 60 + 10,
    }).map(minToTime);
    assert.equal(mins[0], '13:30');
});

test('geçersiz süre boş liste verir — sıfıra bölünüp sonsuz döngüye girmesin', () => {
    const base = {
        orgHours: ORG_HOURS, staffHours: null, weekday: 5,
        dayReservations: [], isTimeOff: false, minStart: 0,
    };
    assert.deepEqual(staffSlots({ ...base, serviceDuration: 0, slotDuration: 30 }), []);
    assert.deepEqual(staffSlots({ ...base, serviceDuration: 60, slotDuration: 0 }), []);
});

test('birleşik müsaitlik saati veren personele bağlar', () => {
    const { times, staffByMinute } = availabilityFor({
        staff: [
            { id: 'a', workingHours: [{ day: 5, start: '09:00', end: '12:00', isOff: false }], isTimeOff: false, dayReservations: [] },
            { id: 'b', workingHours: [{ day: 5, start: '14:00', end: '18:00', isOff: false }], isTimeOff: false, dayReservations: [] },
        ],
        orgHours: ORG_HOURS, weekday: 5, serviceDuration: 60, slotDuration: 60, minStart: 0,
    });
    assert.deepEqual(times, ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']);
    // Liste ile atama tek kaynaktan gelmeli — sunulan saat o personele yazılır.
    assert.equal(staffByMinute.get(timeToMin('09:00')), 'a');
    assert.equal(staffByMinute.get(timeToMin('15:00')), 'b');
});

test('overlaps bitişik aralığı çakışma saymaz', () => {
    assert.equal(overlaps(600, 660, 660, 720), false);
    assert.equal(overlaps(600, 660, 630, 690), true);
});

test('weekdayOf UTC üzerinden sabit — sunucu saat dilimiyle kaymaz', () => {
    assert.equal(weekdayOf('2026-08-07'), 5);
    assert.equal(weekdayOf('2026-08-09'), 0);
});

// ── Niyet ───────────────────────────────────────────────────────────────────

test('onay ve ret', () => {
    for (const t of ['evet', 'Evet', 'olur', 'tamam', 'TAMAM', 'ok', 'tabii', 'peki']) {
        assert.equal(detectConfirm(t), 'yes', t);
    }
    for (const t of ['hayır', 'yok', 'olmaz', 'vazgeçtim', 'istemiyorum']) {
        assert.equal(detectConfirm(t), 'no', t);
    }
    assert.equal(detectConfirm('👍'), 'yes');
    assert.equal(detectConfirm('👎'), 'no');
});

test('belirsiz cevapta onay varsayılmaz', () => {
    // Geri alınamaz işlemde tereddüt tahminden iyidir.
    assert.equal(detectConfirm('evet ama hayır dur'), null);
    assert.equal(detectConfirm('bilmiyorum'), null);
    assert.equal(detectConfirm('cumartesi olur mu'), 'yes',
        '"olur" geçiyorsa onay sayılır — akış zaten özet gösterip soruyor');
});

test('opt-out yalnız tek kelimeyken yakalanır', () => {
    assert.equal(detectIntent('DUR'), 'optout');
    assert.equal(detectIntent('dur'), 'optout');
    assert.equal(detectIntent('BAŞLAT'), 'optin');
    // "randevumu iptal et" abonelikten çıkma değil.
    assert.notEqual(detectIntent('randevumu iptal et'), 'optout');
});

test('onay beklenirken "iptal" konuşmayı silmez', () => {
    assert.equal(detectIntent('iptal'), 'cancel');
    assert.equal(detectIntent('iptal', { awaitingConfirm: true }), 'other',
        'onay adımında iptal, öneriyi reddetmektir — oturum boşuna silinmemeli');
});

test('selamlama ayrı niyet', () => {
    assert.equal(detectIntent('merhaba'), 'greeting');
    assert.equal(detectIntent('Selam!'), 'greeting');
    assert.equal(detectIntent('merhaba yarın randevu almak istiyorum'), 'other',
        'içinde selam geçen dolu cümle selamlama değil');
});

test('inboundKind grup ve kendi mesajımızı eler', () => {
    assert.equal(inboundKind({ remoteJid: '905321112233@s.whatsapp.net', text: 'merhaba' }), 'text');
    assert.equal(inboundKind({ fromMe: true, remoteJid: '9053@s.whatsapp.net', text: 'x' }), 'skip');
    assert.equal(inboundKind({ remoteJid: '123@g.us', text: 'merhaba' }), 'skip');
    assert.equal(inboundKind({ remoteJid: '9053@s.whatsapp.net', hasMedia: true }), 'media');
    assert.equal(inboundKind({ remoteJid: '9053@s.whatsapp.net' }), 'skip');
});

// ── Sözleşme: edge fonksiyonu bu modülleri KULLANMALI ───────────────────────
// Kopya mantık geri sızarsa testler yeşil kalır ama canlı davranış değişir.

const booking = readFileSync(
    new URL('../supabase/functions/whatsapp-booking/index.ts', import.meta.url), 'utf8');

test('whatsapp-booking saf modülleri kullanır, kopyasını taşımaz', () => {
    assert.match(booking, /from '\.\.\/_shared\/booking\/dates\.ts'/);
    assert.match(booking, /from '\.\.\/_shared\/booking\/slots\.ts'/);
    assert.match(booking, /from '\.\.\/_shared\/booking\/intent\.ts'/);
    assert.doesNotMatch(booking, /function staffSlots/, 'slot hesabı modülde kalmalı');
    assert.doesNotMatch(booking, /function isSaneDate/, 'tarih doğrulaması modülde kalmalı');
});

test('deterministik çözücü modelden ÖNCE çalışır', () => {
    const det = booking.indexOf('parseWhen(');
    const ai = booking.indexOf('extractWithAi(');
    assert.ok(det > -1 && ai > -1, 'her ikisi de bulunmalı');
    assert.ok(det < ai, 'kural tabanlı çözüm önce denenmeli — model yedek');
});

test('kural modelin üstüne yazar — sağlayıcı ne derse desin', () => {
    // Model uydurma bir tarih döndürürse kural tabanlı sonuç kazanmalı.
    assert.match(booking, /if \(when\.date\) ex\.date = when\.date;/);
    assert.match(booking, /if \(ruleConfirm\) ex\.confirm = ruleConfirm;/);
});

test('model varsayılan olarak çağrılır, yalnız kural mesajı bitirdiyse atlanır', () => {
    // Ters kurgu ("sadece eksik alan varsa çağır") fikir değişikliğini
    // kaçırıyordu: bütün alanlar doluyken "aslında lazer olsun" diyen müşterinin
    // isteği modele hiç sorulmadan yutuluyordu.
    assert.match(booking, /const ruleSettled =/);
    assert.match(booking, /const needsAi = !ruleSettled && aiBudgetLeft;/);
    assert.match(booking, /needsAi\s*\n?\s*\?\s*\(await extractWithAi/);
});

test('modelden gelen saat biçim denetiminden geçer', () => {
    assert.match(booking, /\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$/,
        'model "akşam" gibi bir şey döndürürse kalıcı oturuma çöp yazılmamalı');
});

test('kabin ataması randevuya yazılır', () => {
    assert.match(booking, /resource_id: chosenResource/);
    assert.match(booking, /assignResources\(/);
});

test('uygunluk engeli tanınır ve gerekçe söylenir', () => {
    // 076 guard 23514 / reservation_eligibility_blocked fırlatıyor. Tanınmazsa
    // müşteri "biraz sonra tekrar deneyin" görüp sonsuza kadar deniyordu.
    assert.match(booking, /reservation_eligibility_blocked/);
    assert.match(booking, /eligibilityBlock\(reservationError\)/);
});

test('medya mesajı sessiz kalmaz', () => {
    assert.match(booking, /msgKind === 'media'/);
});

test('tanınan müşteri adıyla selamlanır', () => {
    assert.match(booking, /known\?\.name/);
});

// ── Kabin ataması ───────────────────────────────────────────────────────────

test('kabin dolu saatler sunulmaz', () => {
    const map = assignResources({
        minutes: [600, 660, 720],
        duration: 60,
        resources: [{ id: 'k1', capacity: 1 }],
        busy: [{ resourceId: 'k1', start: 660, end: 720 }],
    });
    assert.deepEqual([...map.keys()], [600, 720]);
    assert.equal(map.get(600), 'k1');
});

test('kapasite 1\'den büyük kabin aynı saatte birden çok alır', () => {
    const map = assignResources({
        minutes: [600],
        duration: 60,
        resources: [{ id: 'k1', capacity: 2 }],
        busy: [{ resourceId: 'k1', start: 600, end: 660 }],
    });
    assert.equal(map.get(600), 'k1', 'kapasite 2, tek randevu doldurmaz');
});

test('kabin tanımlı değilse kural işlemez', () => {
    const map = assignResources({ minutes: [600], duration: 60, resources: [], busy: [] });
    assert.equal(map.has(600), true);
    assert.equal(map.get(600), null);
});

test('edge kopyası src/lib/resourceCapacity ile aynı davranır', () => {
    // İki dosya ayrı yaşıyor (Deno paketi src/ taşımıyor). Biri değişip diğeri
    // unutulursa WhatsApp randevusu uygulamanın gösterdiğinden farklı kabin
    // seçer — bu test o kaymayı yakalar.
    const resources = [{ id: 'a', capacity: 1 }, { id: 'b', capacity: 2 }];
    const busy = [
        { resourceId: 'a', start: 600, end: 660 },
        { resourceId: 'b', start: 600, end: 660 },
    ];
    for (const [s, e] of [[600, 660], [630, 690], [660, 720], [540, 600]]) {
        assert.equal(edgeFull(resources[0], busy, s, e), appFull(resources[0], busy, s, e), `a ${s}-${e}`);
        assert.equal(edgeFull(resources[1], busy, s, e), appFull(resources[1], busy, s, e), `b ${s}-${e}`);
        assert.equal(
            edgePick(resources, busy, s, e)?.id ?? null,
            appPick(resources, busy, s, e)?.id ?? null,
            `pick ${s}-${e}`,
        );
        assert.equal(edgeAllFull(resources, busy, s, e), appAllFull(resources, busy, s, e), `allFull ${s}-${e}`);
    }
});

// ── Kimlik: hangi kayıt "o kişi" ────────────────────────────────────────────

test('yer tutucu adlar isim sayılmaz', () => {
    // Canlıda bot "Merhaba Geçici!" yazdı — kayıtta gerçekten öyle yazıyordu.
    for (const n of ['Geçici / Walk-in', 'geçici', 'Walk-in', 'WALK IN', 'Misafir',
        'WhatsApp 8380', 'İsimsiz', '', '   ', null, undefined]) {
        assert.equal(isPlaceholderName(n), true, String(n));
    }
    for (const n of ['hasan ülger', 'Nisa Nur Öz Er', 'Ali']) {
        assert.equal(isPlaceholderName(n), false, n);
    }
});

test('greetingName yer tutucuda null döner', () => {
    assert.equal(greetingName('Geçici / Walk-in'), null);
    assert.equal(greetingName('hasan ülger'), 'Hasan');
    assert.equal(greetingName('  nisa nur  '), 'Nisa');
});

test('aynı numarada birden çok kayıt varsa gerçek adlı olan seçilir', () => {
    // Canlı veri: 072'nin tekillik indeksi HAM telefon üzerinde, "05468158380"
    // ile "5468158380" iki ayrı anahtar. Eskiden .limit(1) sırasızdı.
    const rows = [
        { id: 'a', name: 'Geçici / Walk-in', is_active: true, created_at: '2026-07-15T17:17:02Z' },
        { id: 'b', name: 'Geçici / Walk-in', is_active: true, created_at: '2026-07-15T17:17:02Z' },
        { id: 'c', name: 'hasan ülger', is_active: true, created_at: '2026-06-16T16:24:54Z' },
    ];
    assert.equal(pickCustomer(rows)?.id, 'c');
    // Sıra değişse de sonuç aynı olmalı — belirlenimci seçim.
    assert.equal(pickCustomer([...rows].reverse())?.id, 'c');
});

test('pasif kayıt aktif olanın gerisinde kalır', () => {
    const rows = [
        { id: 'x', name: 'Hasan Ülger', is_active: false, created_at: '2026-01-01T00:00:00Z' },
        { id: 'y', name: 'Geçici', is_active: true, created_at: '2026-07-01T00:00:00Z' },
    ];
    assert.equal(pickCustomer(rows)?.id, 'y', 'pasif kayıt seçilmemeli');
});

test('eşitlikte en eski kayıt — alt kayıtlar onda', () => {
    const rows = [
        { id: 'yeni', name: 'Ali', is_active: true, created_at: '2026-07-01T00:00:00Z' },
        { id: 'eski', name: 'Ali', is_active: true, created_at: '2026-01-01T00:00:00Z' },
    ];
    assert.equal(pickCustomer(rows)?.id, 'eski');
});

test('boş liste null döner', () => {
    assert.equal(pickCustomer([]), null);
});

// ── Sunulan listeden saat seçimi ────────────────────────────────────────────

const OFFERED = ['09:00', '09:45', '10:30', '11:15', '12:00'];

test('liste sunulduktan sonra çıplak sayı seçimdir', () => {
    // Canlı hata: bot saatleri sıraladı, müşteri "9" yazdı, bot listeyi tekrarladı.
    assert.equal(matchOfferedTime('9', OFFERED), '09:00');
    assert.equal(matchOfferedTime('10', OFFERED), '10:30');
    assert.equal(matchOfferedTime('12', OFFERED), '12:00');
});

test('tam yazım da eşleşir, listede yoksa null', () => {
    assert.equal(matchOfferedTime('9:00', OFFERED), '09:00');
    assert.equal(matchOfferedTime('09:45 olsun', OFFERED), '09:45');
    assert.equal(matchOfferedTime('13:00', OFFERED), null, 'sunulmayan saat seçilemez');
    assert.equal(matchOfferedTime('20', OFFERED), null);
});

test('liste boşsa hiçbir şey eşleşmez', () => {
    assert.equal(matchOfferedTime('9', []), null);
});

test('sayı içermeyen mesaj saat seçimi değildir', () => {
    assert.equal(matchOfferedTime('bilmiyorum', OFFERED), null);
    assert.equal(matchOfferedTime('teşekkürler', OFFERED), null);
});

// ── Teslimat makbuzları (084) ───────────────────────────────────────────────

test('Baileys durum kodları teslim/okundu olarak okunur', () => {
    assert.equal(parseReceiptStatus(3), 'delivered');
    assert.equal(parseReceiptStatus(4), 'read');
    assert.equal(parseReceiptStatus(5), 'read', 'sesli mesaj dinlendi = okundu');
    // 1/2 yeni bilgi taşımıyor: 'sent' zaten yazılıydı.
    assert.equal(parseReceiptStatus(1), null);
    assert.equal(parseReceiptStatus(2), null);
});

test('durum metin olarak da gelebilir', () => {
    assert.equal(parseReceiptStatus('DELIVERY_ACK'), 'delivered');
    assert.equal(parseReceiptStatus('READ'), 'read');
    assert.equal(parseReceiptStatus('3'), 'delivered');
    assert.equal(parseReceiptStatus('PENDING'), null);
    assert.equal(parseReceiptStatus(null), null);
});

test('yalnız messages.update olayı makbuz üretir', () => {
    assert.deepEqual(parseReceiptEvent({ event: 'messages.upsert', data: { key: { id: 'x' }, status: 4 } }), []);
    assert.deepEqual(
        parseReceiptEvent({ event: 'MESSAGES_UPDATE', data: { key: { id: 'abc' }, status: 4 } }),
        [{ providerMsgId: 'abc', receipt: 'read' }],
        'olay adı MESSAGES_UPDATE ya da messages.update gelebiliyor',
    );
});

test('makbuz gövdesi dizi de olabilir, durum update altında da', () => {
    const out = parseReceiptEvent({
        event: 'messages.update',
        data: [
            { key: { id: 'a' }, update: { status: 3 } },
            { key: { id: 'b' }, status: 'READ' },
            { key: { id: 'c' }, status: 1 },   // yeni bilgi yok
            { status: 4 },                      // id yok
        ],
    });
    assert.deepEqual(out, [
        { providerMsgId: 'a', receipt: 'delivered' },
        { providerMsgId: 'b', receipt: 'read' },
    ]);
});

test('okundu, teslim edilmişliği de ima eder', () => {
    // WhatsApp bazen yalnız READ yolluyor; teslim damgası boş kalmamalı.
    const now = '2026-08-07T12:00:00.000Z';
    assert.deepEqual(receiptPatch('read', now), { delivered_at: now, read_at: now });
    assert.deepEqual(receiptPatch('delivered', now), { delivered_at: now });
});

// ── Migration ve kablolama sözleşmesi ───────────────────────────────────────
const mig085 = readFileSync(
    new URL('../supabase/085_wa_reminder_confirm.sql', import.meta.url), 'utf8');
const mig084 = readFileSync(
    new URL('../supabase/084_wa_receipts_and_retention.sql', import.meta.url), 'utf8');
const proxy = readFileSync(
    new URL('../supabase/functions/whatsapp-proxy/index.ts', import.meta.url), 'utf8');
const remind = readFileSync(
    new URL('../supabase/functions/remind/index.ts', import.meta.url), 'utf8');

test('webhook MESSAGES_UPDATE olayına da abone', () => {
    // Abone olmazsak teslimat bilgisi hiç gelmez ve alanlar sonsuza kadar boş kalır.
    assert.match(proxy, /events: \['MESSAGES_UPSERT', 'MESSAGES_UPDATE'\]/);
});

test('makbuz sır doğrulamasından SONRA işlenir', () => {
    const secretCheck = booking.indexOf('givenSecret !== orgWa.webhook_secret');
    const receiptWrite = booking.indexOf('receiptPatch(');
    assert.ok(secretCheck > -1 && receiptWrite > -1);
    assert.ok(secretCheck < receiptWrite,
        'doğrulanmamış istek başkasının teslimat kaydını değiştirememeli');
});

test('makbuz elemeye takılmaz — fromMe olduğu için düşerdi', () => {
    assert.match(booking, /receipts\.length === 0 && msgKind === 'skip'/);
});

test('saklama fonksiyonu satırı silmez, gövdeyi boşaltır', () => {
    assert.match(mig084, /set body = null/);
    assert.doesNotMatch(mig084, /delete from public\.wa_message_log/,
        'kota sayımı, teslimat kanıtı ve raporlar satıra dayanıyor');
    assert.match(mig084, /body_purged_at/);
});

test('saklama fonksiyonu yalnız service_role tarafından çağrılabilir', () => {
    assert.match(mig084, /revoke all on function public\.purge_wa_message_bodies\(integer\) from authenticated/);
    assert.match(mig084, /revoke all on function public\.purge_wa_message_bodies\(integer\) from anon/);
});

test('saklama süresi makul aralıkta kalır', () => {
    // p_months=0 verilip her şeyin anında silinmesi engellenmeli.
    assert.match(mig084, /p_months < 1 or p_months > 120/);
});

test('remind saklama temizliğini çağırır', () => {
    assert.match(remind, /purge_wa_message_bodies/);
});

// ── Bot soru soruyor mu? ────────────────────────────────────────────────────
// Bildirilen olay: "seanslar" yazan müşteri seans ÜCRETİNİ öğrenmek istiyordu;
// bot ne konuyu çözebildi ne de sordu — karşılamayı ve hizmet listesini
// gönderdi. Herkes derdini düzgün yazamaz; anlaşılmayan mesaj tahmin
// edilmemeli, SORULMALI.

test('"seanslar" tek başına belirsizdir — sorulur', () => {
    assert.equal(detectClarify('seanslar'), 'seans');
    assert.equal(detectClarify('Seans'), 'seans');
    assert.equal(detectClarify('paketler'), 'seans');
    // Nokta/ünlem cümleyi başka bir şey yapmaz.
    assert.equal(detectClarify('seanslar?'), 'seans');
});

test('konusu belli olan cümle soruya düşmez', () => {
    // Bunlar zaten detectTopic'te çözülüyor; soru sormak, cevabı bilinen bir
    // soruyu tekrar sormak olurdu.
    assert.equal(detectTopic('kaç seansım kaldı'), 'my_package');
    assert.equal(detectClarify('kaç seansım kaldı'), null);
    assert.equal(detectClarify('seans ücreti ne kadar'), null);
    assert.equal(detectClarify('yarın 15:00 uygun mu'), null);
    assert.equal(detectClarify(''), null);
});

test('soru müşterinin kendi sözcüğüyle sorulur', () => {
    // Canlıda ters tepti: "Paketler" yazan müşteriye bot «"Seans" derken
    // hangisini kastettiniz?» dedi — sormadığı bir kelime geri geldi.
    assert.equal(clarifyQuestion('seans', 'Paketler'), '"Paketler" derken hangisini kastettiniz?');
    assert.equal(clarifyQuestion('seans', 'Seanslar'), '"Seanslar" derken hangisini kastettiniz?');
    // Sözcük yoksa sabit başlık; hiçbir hâlde boş tırnak çıkmaz.
    assert.equal(clarifyQuestion('seans', '   '), CLARIFY_QUESTION.seans);
    assert.equal(clarifyQuestion('seans', null), CLARIFY_QUESTION.seans);
    assert.equal(clarifyQuestion('genel', 'saçmasapan'), CLARIFY_QUESTION.genel);
    // Uzun metin soruyu okunmaz yapmasın.
    assert.ok(clarifyQuestion('seans', 'x'.repeat(200)).length < 70);
});

test('her netleştirme seçeneğinin bir karşılığı var', () => {
    // Metin messages.ts'te, karşılık inquiry.ts'te olsaydı ikisi kayar ve "2"
    // yazan müşteri başka bir cevap alırdı. Seçenekler TEK yerde tanımlı.
    for (const [key, opts] of Object.entries(CLARIFY_OPTIONS)) {
        assert.ok(opts.length >= 2 && opts.length <= 4, `${key}: seçenek sayısı ${opts.length}`);
        assert.ok(CLARIFY_QUESTION[key], `${key}: soru metni yok`);
        for (const o of opts) {
            assert.ok(o.label.trim(), `${key}: etiketsiz seçenek`);
            assert.ok(o.topic || o.book, `${key}/${o.label}: karşılığı yok`);
            if (o.topic) assert.ok(TOPICS.includes(o.topic), `${key}: geçersiz konu ${o.topic}`);
        }
    }
});

test('seçim kural katmanında çözülür — modele gitmez', () => {
    const n = CLARIFY_OPTIONS.seans.length;
    assert.equal(detectListChoice('1', n), 1);
    assert.equal(detectListChoice('2.', n), 2);
    // Sınır dışı seçim rastgele bir seçeneğe düşmez.
    assert.equal(detectListChoice('9', n), null);
});

test('karşılama İKİ KEZ gönderilmez, ikinci turda soru sorulur', () => {
    // Aynı hizmet listesini tekrar yollamak "bir daha dene" demenin
    // kibarcasıydı; müşteri ikinci denemede de anlaşılmayınca vazgeçiyordu.
    assert.match(booking, /if \(state\.greeted\) \{/);
    assert.match(booking, /state\.clarify = 'genel'/);
    assert.match(booking, /state\.greeted = true/);
});

// ── Konuşma hafızası ────────────────────────────────────────────────────────

test('modele konuşma geçmişi gider', () => {
    // Botun "hafızası yok" görünmesinin sebebi buydu: whatsapp_sessions yalnız
    // TOPLANAN VERİYİ taşıyordu, konuşmanın kendisini değil. wa_message_log
    // yazılıyor ama hiç okunmuyordu.
    assert.match(booking, /wa_message_log[\s\S]{0,400}direction, body, created_at/);
    assert.match(booking, /history,/);
    assert.match(ai, /history\?: Turn\[\]/);
    // Geçmiş gerçek konuşma turu olarak gider, prompt'a metin diye gömülmez.
    assert.match(ai, /turns\(ctx\)\.map/);
});

test('geçmiş oturum ömrüyle sınırlı', () => {
    // Dünkü konuşmayı bugüne taşımak, kapanmış bir konuyu diriltmek olurdu.
    assert.match(booking, /SESSION_TTL_MIN \* 60_000\)\.toISOString\(\)/);
});

test('düşünme payı ayarla açılır ve çıktı tavanı onunla büyür', () => {
    // Düşünen jetonlar maxOutputTokens'tan düşülür: bütçeyi açıp tavanı
    // büyütmezsek model düşünürken kotayı bitirir ve gövde BOŞ döner.
    assert.match(ai, /WA_AI_THINKING/);
    assert.match(ai, /maxOutputTokens: 300 \+ think/);
    assert.match(ai, /thinkingBudget: think/);
});

// ── Sağlayıcı yedeklemesi ───────────────────────────────────────────────────
const ai = readFileSync(
    new URL('../supabase/functions/_shared/booking/ai.ts', import.meta.url), 'utf8');

test('iki sağlayıcı var ve sıra ayarlanabilir', () => {
    assert.match(ai, /askGroq/);
    assert.match(ai, /askGemini/);
    assert.match(ai, /WA_AI_PRIMARY/,
        'birincil sağlayıcı deploy değil ayar olmalı — ölçüm sonrası kod değişmesin');
});

test('sağlayıcı çökerse null döner, atmaz — bot susmamalı', () => {
    // askGroq/askGemini try/catch içinde; extractWithAi null dönerse çağıran
    // yalnız kural tabanlı çözümle devam eder.
    assert.match(ai, /} catch \{\s*return null;\s*\}/);
    assert.match(ai, /return null;\s*\}\s*$/m);
});

// ── Botun ağzı: üslup ve sektöre bürünme ────────────────────────────────────
// Canlıda tek konuşmada üslup dört kez değişti ("istersiniz" → "istersin" →
// "sana uygun" → "Onaylıyor musun" → "Seni bekliyoruz") ve diş kliniği "Dolgu"
// için 💆 ile 🌷 aldı. Bu testler ikisini de makineyle engelliyor.

const DENTAL = {
    persona: 'Bir diş kliniğisin.', audience: 'hastamız',
    serviceWord: 'tedavi', servicePhrase: 'tedavinizi', emoji: '🦷',
};
const CTX = { comms: DENTAL, businessName: 'LU Klinik', firstName: 'Hasan' };
const SERVICES = [{ name: 'Dolgu', duration: 15 }, { name: 'İmplant', duration: 45 }];
const TIMES = ['09:00', '09:45', '10:30', '11:15', '12:00'];

/** Bir konuşmada botun kurabileceği bütün cümleler. */
function allMessages(ctx = CTX) {
    const d = { service: 'Dolgu', dateLabel: '9 Ağustos Pazar', time: '09:00' };
    return {
        greeting: MSG.greeting(ctx, SERVICES),
        askDay: MSG.askDay(ctx, 'Dolgu'),
        offerTimes: MSG.offerTimes(ctx, { dateLabel: d.dateLabel, serviceName: 'Dolgu', times: TIMES }),
        timeTaken: MSG.timeTaken(ctx, { wanted: '14:00', dateLabel: d.dateLabel, times: TIMES }),
        timeTakenEmpty: MSG.timeTaken(ctx, { wanted: '14:00', dateLabel: d.dateLabel, times: [] }),
        dayFull: MSG.dayFull(ctx, d.dateLabel),
        slotJustTaken: MSG.slotJustTaken(ctx, TIMES),
        slotJustTakenEmpty: MSG.slotJustTaken(ctx, []),
        summary: MSG.summary(ctx, d),
        confirmNudge: MSG.confirmNudge(ctx, d),
        declined: MSG.declined(ctx, { dateLabel: d.dateLabel, times: TIMES }),
        created: MSG.created(ctx, { ...d, manageUrl: 'https://x/booking/abc' }),
        createdPending: MSG.created(ctx, { ...d, pending: true }),
        cancelled: MSG.conversationCancelled(ctx),
        blocked: MSG.eligibilityBlocked(ctx, 'hamilelik'),
        failed: MSG.createFailed(ctx),
        media: MSG.mediaUnsupported(ctx),
        optedOut: MSG.optedOut(ctx),
        optedIn: MSG.optedIn(ctx),
        askClarify: MSG.askClarify(ctx, {
            question: CLARIFY_QUESTION.genel, options: CLARIFY_OPTIONS.genel,
        }),
    };
}

test('hiçbir mesajda senli benli hitap yok', () => {
    // "siz" tanış olmayanda, yaşlıda ve klinik/avukat sektörlerinde tek doğru
    // seçim. Sıcaklık kelime seçiminden gelir, sen/siz'den değil.
    const SENLI = /\b(sana|senin|seni|senle|sende)\b|\b\w+(?:musun|mısın|misin|sun\?|sın\?)\b|\b\w+(?:ersin|arsın|irsin)\b/i;
    for (const [key, text] of Object.entries(allMessages())) {
        assert.ok(!SENLI.test(text), `${key} senli benli: ${text}`);
    }
});

test('mesaj başına en fazla bir emoji, o da sektörün emojisi', () => {
    const EMOJI = /\p{Extended_Pictographic}/gu;
    for (const [key, text] of Object.entries(allMessages())) {
        const found = text.match(EMOJI) ?? [];
        assert.ok(found.length <= 1, `${key} ${found.length} emoji taşıyor: ${found.join('')}`);
        for (const e of found) assert.equal(e, DENTAL.emoji, `${key} sektör dışı emoji: ${e}`);
    }
});

test('sektör sözcüğü profilden gelir — klinik "tedavi" der', () => {
    const m = allMessages();
    assert.match(m.greeting, /Hangi tedavi için/);
    assert.match(m.summary, /\*Tedavi:\* Dolgu/);
    assert.match(m.created, /\*Tedavi:\* Dolgu/);
    assert.match(m.blocked, /Bu tedavi için/);
});

test('aynı metinler kuaförde "işlem" olur — hiçbir şey sabit yazılmamış', () => {
    const kuafor = {
        comms: {
            persona: 'Bir kuaförsün.', audience: 'müşterimiz',
            serviceWord: 'işlem', servicePhrase: 'işleminizi', emoji: '💇',
        },
        businessName: 'LU Kuaför', firstName: 'Nisa',
    };
    const m = allMessages(kuafor);
    assert.match(m.greeting, /Hangi işlem için/);
    assert.match(m.summary, /\*İşlem:\* Dolgu/);
    assert.match(m.greeting, /LU Kuaför/);
    assert.ok(!m.greeting.includes('🦷'), 'diş emojisi kuaföre sızmamalı');
    assert.ok(m.greeting.includes('💇'));
});

test('tanınmayan müşteri işletme adıyla karşılanır', () => {
    const anon = MSG.greeting({ ...CTX, firstName: null }, SERVICES);
    assert.match(anon, /LU Klinik/);
    assert.ok(!/Merhaba \w+!/.test(anon.split('\n')[0]) || anon.startsWith('Merhaba!'));
});

test('onay bekleyen randevu "hazır" demez', () => {
    // booking_auto_confirm kapalıyken kayıt 'pending' düşüyor ama bot
    // "Randevun oluştu!" diyordu — müşteri onaylanmış sanıp geliyordu.
    const m = allMessages();
    assert.match(m.created, /Hazır/);
    assert.ok(!/[Hh]azır/.test(m.createdPending), 'pending randevu hazır sayılmamalı');
    assert.match(m.createdPending, /Talebinizi aldım/);
    assert.match(m.createdPending, /haber vereceğim/);
});

test('iptal linki yalnız varsa eklenir', () => {
    const m = allMessages();
    assert.match(m.created, /booking\/abc/);
    assert.ok(!m.createdPending.includes('http'), 'link yoksa boş satır kalmamalı');
});

test('saat listesi satır başına dörde bölünür', () => {
    // Tek uzun satır telefonda kayıyordu.
    const lines = MSG.offerTimes(CTX, { dateLabel: 'x', serviceName: 'y', times: TIMES })
        .split('\n').filter(l => /^\d{2}:\d{2}/.test(l));
    assert.equal(lines.length, 2, 'beş saat iki satıra bölünmeli');
    assert.equal(lines[0].split('·').length, 4);
    assert.equal(lines[1].trim(), '12:00', 'artan tek saat kendi satırında');
});

test('boş liste hâlleri anlamlı cümle kurar', () => {
    const m = allMessages();
    assert.match(m.timeTakenEmpty, /başka bir gün/i);
    assert.match(m.slotJustTakenEmpty, /başka bir gün/i);
    assert.ok(!m.timeTakenEmpty.includes('\n\n\n'), 'boş liste boş satır bırakmamalı');
});

test('gerekçesiz uygunluk engeli de düzgün cümle', () => {
    const noReason = MSG.eligibilityBlocked(CTX, null);
    assert.ok(!noReason.includes('()'), 'boş parantez kalmamalı');
    assert.match(noReason, /ekibimizin onayı/);
});

test('comms yazılmamış org nötr profile düşer — bot susmaz', () => {
    const neutral = MSG.resolveComms(null);
    assert.equal(neutral.serviceWord, 'randevu');
    assert.equal(neutral, MSG.NEUTRAL_COMMS);
    assert.equal(MSG.resolveComms({ persona: 'x' }).serviceWord, 'randevu', 'eksik alan doldurulur');
});

test('edge fonksiyonu mesajları modülden alır — kopya metin kalmadı', () => {
    assert.match(booking, /import \* as M from '\.\.\/_shared\/booking\/messages\.ts'/);
    // Eski elle yazılmış emoji dizilimleri geri sızmasın.
    for (const junk of ['💼', '🗓️ ${fmt', '⏰ ${available', 'Özetliyorum', 'Seni bekliyoruz']) {
        assert.ok(!booking.includes(junk), `kopya metin geri gelmiş: ${junk}`);
    }
});

test('bot sektör profilini okur', () => {
    assert.match(booking, /M\.resolveComms\(setting\?\.comms\)/);
    assert.match(booking, /business_name, working_hours, slot_duration, comms/);
});

// ── Canlı konuşmadan çıkan üç düzeltme ──────────────────────────────────────

test('mesajda tarih varsa çıplak sayı saat sanılmaz', () => {
    // GERÇEK HATA: "11 Ağustos istiyorum" yazan müşteriye bot 11:15'i seçip
    // özet gösterdi — gün numarasını saat sandı.
    const offered = ['09:00', '10:30', '11:15', '12:00'];
    assert.equal(matchOfferedTime('11 Ağustos istiyorum', offered), null);
    assert.equal(matchOfferedTime('9 Eylül olsun', offered), null);
    assert.equal(matchOfferedTime('yarın 12 olur mu', offered), null);
    assert.equal(matchOfferedTime('pazartesi 10', offered), null);
    assert.equal(matchOfferedTime('11.08 gelebilirim', offered), null);
    // Tarih varken bile AÇIK yazım kabul edilir — belirsizlik yok.
    assert.equal(matchOfferedTime('11 Ağustos 10:30', offered), '10:30');
    // Tarih yoksa eski davranış sürüyor.
    assert.equal(matchOfferedTime('11', offered), '11:15');
});

test('"hangi günler müsait" ayrı bir niyet', () => {
    for (const t of ['Hangi günler müsait', 'hangi gunler musaitsiniz',
        'müsait gün var mı', 'ne zaman müsaitsiniz', 'boş gün var mı']) {
        assert.equal(detectIntent(t), 'availability', t);
    }
    // Saat sorusu gün sorusu değil.
    assert.notEqual(detectIntent('hangi saatler var'), 'availability');
});

test('müsait günler listesi kapalı günleri atlar', () => {
    // Pazar kapalı; 2026-08-07 Cuma → Cuma, Cumartesi, (Pazar atlanır), Pazartesi
    const hours = [
        { day: 5, start: '09:00', end: '18:00', isOff: false },
        { day: 6, start: '10:00', end: '15:00', isOff: false },
        { day: 0, start: '09:00', end: '18:00', isOff: true },
        { day: 1, start: '09:00', end: '18:00', isOff: false },
    ];
    const days = availableDays({
        fromISO: TODAY, horizon: 5, limit: 5,
        orgHours: hours, serviceDuration: 60, slotDuration: 60, minStartToday: 0,
        staffByDay: () => [{ id: 's', workingHours: null, isTimeOff: false, dayReservations: [] }],
    });
    assert.deepEqual(days, ['2026-08-07', '2026-08-08', '2026-08-10']);
});

test('müsait gün listesi limitte durur ve dolu günü atlar', () => {
    const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '10:00', isOff: false }));
    const days = availableDays({
        fromISO: TODAY, horizon: 10, limit: 2,
        orgHours: hours, serviceDuration: 60, slotDuration: 60, minStartToday: 0,
        // İlk gün tamamen dolu.
        staffByDay: (iso) => [{
            id: 's', workingHours: null, isTimeOff: false,
            dayReservations: iso === TODAY ? [{ start_time: '09:00', end_time: '10:00' }] : [],
        }],
    });
    assert.deepEqual(days, ['2026-08-08', '2026-08-09'], 'dolu gün atlanır, limit uygulanır');
});

test('gün listesi mesajı boşken de anlamlı', () => {
    const empty = MSG.offerDays(CTX, { serviceName: 'Dolgu', days: [] });
    assert.match(empty, /dolu görünüyor/);
    assert.ok(!empty.includes('•'));
});

test('kuru selamlama oturumu sıfırlar', () => {
    // GERÇEK HATA: müşteri 20 dk sonra "merhaba" yazdı, bot baştan karşıladı
    // ama eski tarih state'te duruyordu — hizmet seçilir seçilmez gün
    // sormadan saatlere atladı.
    assert.match(booking, /detectIntent\(text\) === 'greeting' && Object\.keys\(state\)\.length > 0/);
    assert.match(booking, /state = \{\};/);
});

test('gün sorusu saat listesiyle karıştırılmaz', () => {
    assert.match(booking, /intent === 'availability'/);
    assert.match(booking, /M\.offerDays\(/);
});

// ── Akış koruması ───────────────────────────────────────────────────────────
// Eski hâli tek eşikti ve aşılınca bot SESSİZCE duruyordu; canlıda test
// ederken doldu ve "bot bozuldu" sanıldı. Ayrıca eşik gelen tüm mesajları
// sayıyordu, oysa koruduğu şey model çağrısıydı — kural tabanlı çözücü
// devredeyken model zaten çağrılmıyor.

test('iki ayrı eşik var: model bütçesi ve taşma', () => {
    assert.match(booking, /const AI_BUDGET_PER_HOUR = 20;/);
    assert.match(booking, /const FLOOD_PER_HOUR = 60;/);
    assert.ok(FLOOD_GT_AI(), 'taşma eşiği model bütçesinden yüksek olmalı');
    function FLOOD_GT_AI() {
        const ai = Number(booking.match(/AI_BUDGET_PER_HOUR = (\d+)/)[1]);
        const flood = Number(booking.match(/FLOOD_PER_HOUR = (\d+)/)[1]);
        return flood > ai;
    }
});

test('model bütçesi dolunca bot susmaz, yalnız modele sormaz', () => {
    assert.match(booking, /const needsAi = !ruleSettled && aiBudgetLeft;/);
    // Bütçe kontrolü erken return YAPMAMALI — akış devam etmeli.
    const budgetLine = booking.indexOf('const aiBudgetLeft');
    const seg = booking.slice(budgetLine, budgetLine + 200);
    assert.ok(!/return ok\(\{ skipped/.test(seg), 'bütçe dolunca konuşma kesilmemeli');
});

test('taşmada saatte bir kez açıklama gider, sonra sessizlik', () => {
    assert.match(booking, /\.eq\('kind', 'cooldown'\)/);
    assert.match(booking, /return reply\(M\.cooldown\(msgCtx\(\)\), 'cooldown'\)/);
    assert.match(booking, /if \(\(warned \?\? 0\) > 0\) return ok\(\{ skipped: 'rate_limited' \}\)/);
});

test('cooldown mesajı kotaya sayılmaz', () => {
    // Kota İŞLETMENİN başlattığı mesajları sayar; bu müşteriye verilen cevap.
    const wa = readFileSync(new URL('../supabase/functions/_shared/wa.ts', import.meta.url), 'utf8');
    assert.match(wa, /UNMETERED[\s\S]{0,200}'cooldown'/);
    assert.match(wa, /\| 'cooldown';/, 'WaKind cooldown türünü tanımalı');
});

test('cooldown metni ne olduğunu ve ne yapılacağını söyler', () => {
    const t = MSG.cooldown(CTX);
    assert.match(t, /çok fazla mesaj/);
    assert.match(t, /Birazdan/);
    assert.match(t, /arayabilirsiniz/, 'acil durum için çıkış yolu verilmeli');
    assert.equal((t.match(/\p{Extended_Pictographic}/gu) ?? []).length, 1);
});

// ── Yönetim linkinden giden mesajlar (booking-manage) ───────────────────────
// Bu iki mesaj bota değil web akışına aitti ve kendi ağzıyla konuşuyordu.
// Aynı müşteri aynı gün hem bottan hem linkten mesaj alabiliyor.

const manage = readFileSync(
    new URL('../supabase/functions/booking-manage/index.ts', import.meta.url), 'utf8');

test('iptal ve taşıma mesajları da aynı ağzı kullanır', () => {
    const d = { service: 'Dolgu', dateLabel: '9 Ağustos Pazar', time: '09:00' };
    const cancel = MSG.cancelledByCustomer(CTX, d);
    const move = MSG.rescheduledByCustomer(CTX, d);
    const SENLI = /\b(sana|senin|seni)\b|\b\w+(?:musun|mısın|misin)\b/i;
    for (const [k, t] of Object.entries({ cancel, move })) {
        assert.ok(!SENLI.test(t), `${k} senli benli`);
        const e = t.match(/\p{Extended_Pictographic}/gu) ?? [];
        assert.ok(e.length <= 1 && e.every((x) => x === DENTAL.emoji), `${k} emoji: ${e.join('')}`);
        assert.match(t, /\*Tedavi:\* Dolgu/, `${k} sektör etiketi taşımalı`);
    }
    assert.match(cancel, /Hasan, randevunuzu iptal ettim/);
    assert.match(move, /taşıdım/);
});

test('adı bilinmeyen müşteride iptal cümlesi bozulmaz', () => {
    const t = MSG.cancelledByCustomer({ ...CTX, firstName: null },
        { service: 'Dolgu', dateLabel: 'x', time: '09:00' });
    assert.match(t, /^Randevunuzu iptal ettim/);
    assert.ok(!t.includes(', randevunuzu'), 'ad yoksa baştaki virgül kalmamalı');
});

test('booking-manage elle yazılmış metin taşımıyor', () => {
    assert.match(manage, /import \* as M from '\.\.\/_shared\/booking\/messages\.ts'/);
    for (const junk of ['iptal edildi ❌', 'güncellendi ✅', '🗓️ ${d}', '💼 ${res.service}']) {
        assert.ok(!manage.includes(junk), `kopya metin: ${junk}`);
    }
    assert.match(manage, /M\.resolveComms\(settings\?\.comms\)/, 'sektör profilini okumalı');
});

// ── Hizmet eşleştirme (kural tabanlı) ───────────────────────────────────────
// GERÇEK HATA: eşleştirmenin tek yolu modeldi (model adı geri yazıyor, kod
// listeyle karşılaştırıyordu). Model bütçesi dolunca hizmet hiç eşleşmedi ve
// bot "Diş teli", "Lazer", "Plak tedavi" mesajlarının ÜÇÜNE DE karşılamayla
// cevap verip sonsuz döngüye girdi.

const SVCS = [
    { id: '1', name: 'Teddavi', duration: 30 },
    { id: '2', name: 'lazer', duration: 60 },
    { id: '3', name: 'Dolgu', duration: 15 },
    { id: '4', name: 'İmplant', duration: 45 },
    { id: '5', name: 'Diş temizliği', duration: 90 },
    { id: '6', name: 'Diş teli', duration: 45 },
    { id: '7', name: 'Plak tedavisi', duration: 45 },
];

test('canlıda döngüye sokan üç mesaj artık eşleşiyor', () => {
    assert.equal(matchService('Diş teli', SVCS).match?.id, '6');
    assert.equal(matchService('Lazer', SVCS).match?.id, '2');
    assert.equal(matchService('Plak tedavi', SVCS).match?.id, '7', 'ek düşmüş yazım');
});

test('cümle içinde geçen hizmet bulunur', () => {
    assert.equal(matchService('diş teli için randevu almak istiyorum', SVCS).match?.id, '6');
    assert.equal(matchService('implant olur mu', SVCS).match?.id, '4');
    assert.equal(matchService('İMPLANT', SVCS).match?.id, '4', 'Türkçe İ katlanmalı');
});

test('belirsizlikte TAHMİN ETMEZ, sorar', () => {
    // "diş" iki hizmete de uyuyor; yanlış hizmetle randevu randevusuzluktan kötü.
    const r = matchService('diş', SVCS);
    assert.equal(r.match, null);
    assert.deepEqual(r.candidates.map((s) => s.id).sort(), ['5', '6']);
});

test('daha belirgin istek kazanır', () => {
    // "diş temizliği" hem "Diş temizliği" (2 sözcük) hem "Diş teli" (1 sözcük)
    // ile kesişiyor; tam eşleşen ve daha çok sözcüklü olan seçilir.
    assert.equal(matchService('diş temizliği', SVCS).match?.id, '5');
});

test('alakasız mesaj hizmet üretmez', () => {
    for (const t of ['merhaba', 'yarın 3 buçuk', 'teşekkürler', '']) {
        assert.equal(matchService(t, SVCS).match, null, t);
    }
    assert.equal(matchService('lazer', []).match, null, 'hizmet listesi boş');
});

test('kısa sözcükler yanlış eşleşme yapmaz', () => {
    // sameStem en az 3 harf şart koşuyor: "el" ⊄ "eli" olmamalı.
    const svc = [{ id: 'a', name: 'El bakımı', duration: 30 }];
    assert.equal(matchService('e', svc).match, null);
});

test('hizmet eşleştirme kural katmanında, modelden önce', () => {
    assert.match(booking, /const svcHit = state\.serviceId \? .* : matchService\(text, svcArr\)/);
    // Kural eşleşmesi modelin üstüne yazmalı.
    const idx = booking.indexOf('if (svcHit.match) {');
    assert.ok(idx > -1);
    assert.ok(booking.slice(idx, idx + 260).includes('else if (ex.service)'),
        'model yalnız kural bulamayınca devreye girmeli');
});

test('kural hizmeti bulduysa modele sorulmaz', () => {
    assert.match(booking, /\|\| Boolean\(svcHit\.match\)/);
    assert.match(booking, /\|\| svcHit\.candidates\.length > 1/);
});

test('belirsizlik akışa bağlı — karşılama tekrarlanmıyor', () => {
    assert.match(booking, /if \(svcHit\.candidates\.length > 1\) \{[\s\S]{0,80}?return reply\(M\.askWhichService/);
});

// ── Dalga 2: bilgi soruları ─────────────────────────────────────────────────
// Bota gelen her mesaj randevu talebi değil. Canlıda müşteriler "randevum ne
// zamandı", "kaç para", "kaçta açıksınız" yazdı; bot üçünü de hizmet adı sandı
// ve karşılamaya döndü.

test('konu tespiti — kişisel sorular', () => {
    assert.equal(detectTopic('randevum ne zamandı acaba'), 'my_appointment');
    assert.equal(detectTopic('Randevum var mı?'), 'my_appointment');
    assert.equal(detectTopic('kaç seansım kaldı'), 'my_package');
    assert.equal(detectTopic('paketimde ne kadar var'), 'my_package');
    assert.equal(detectTopic('borcum var mı'), 'my_balance');
    assert.equal(detectTopic('bakiyem ne kadar'), 'my_balance');
});

test('konu tespiti — işletme bilgisi', () => {
    assert.equal(detectTopic('kaça kadar açıksınız'), 'hours');
    assert.equal(detectTopic('pazar açık mısınız'), 'hours');
    assert.equal(detectTopic('çalışma saatleriniz nedir'), 'hours');
    assert.equal(detectTopic('lazer ne kadar'), 'price');
    assert.equal(detectTopic('fiyat listeniz var mı'), 'price');
    assert.equal(detectTopic('adresiniz neresi'), 'location');
    assert.equal(detectTopic('neredesiniz'), 'location');
    assert.equal(detectTopic('yetkiliyle görüşebilir miyim'), 'human');
});

test('iyelik eki niyeti belirler — borç fiyat değildir', () => {
    // "borcum ne kadar" hem my_balance hem price kalıbına uyuyor; sıra kişisel
    // olanı kazandırmalı, yoksa müşteri borcunu sorunca fiyat listesi alır.
    assert.equal(detectTopic('borcum ne kadar'), 'my_balance');
    // Aynı tuzak saatlerde: "kaça kadar" ile "kaça" çakışıyor.
    assert.equal(detectTopic('kaça kadar açıksınız'), 'hours');
});

test('"mudur" soru eki insana devretmez', () => {
    // GERÇEK TUZAK: Türkçede "mudur" soru ekidir. Kalıba alınsaydı her nazik
    // soru bota "beni insana bağla" gibi görünürdü.
    assert.equal(detectTopic('yarın uygun mudur'), null);
    assert.equal(detectTopic('lazer için müsait midir'), null);
});

test('randevu akışına ait cümleler konu üretmez', () => {
    for (const t of ['merhaba', 'yarın 3 buçuk', 'lazer', 'evet', 'cumartesi olur mu']) {
        assert.equal(detectTopic(t), null, t);
    }
});

test('model konu için yalnız enum döndürebilir', () => {
    assert.equal(coerceTopic('price'), 'price');
    assert.equal(coerceTopic('my_balance'), 'my_balance');
    // Serbest metin, uydurma değer ve tip hataları null'a düşer.
    for (const bad of ['fiyat sorusu', 'MY_BALANCE', 42, null, undefined, {}, ['price']]) {
        assert.equal(coerceTopic(bad), null, String(bad));
    }
});

test('kişisel konular ayrı kümede', () => {
    for (const t of ['my_appointment', 'my_package', 'my_balance']) {
        assert.ok(PERSONAL.has(t), t);
    }
    for (const t of ['hours', 'price', 'location', 'human']) {
        assert.ok(!PERSONAL.has(t), t);
    }
});

test('kişisel veri eşleşmeyen numaraya verilmez', () => {
    // Kural 1: numarayı bilen herkes başkasının randevusunu okuyamamalı.
    assert.match(booking, /if \(PERSONAL\.has\(topic\) && !known\?\.id\)/);
    assert.match(booking, /return reply\(M\.notRecognized\(msgCtx\(\)\)\)/);
});

test('sayılar veritabanından gelir, modelden değil', () => {
    // Bakiye tek formülden geçer (finance.ts = patientBalance.ts aynası).
    assert.match(booking, /computeBalance\(/);
    assert.match(booking, /formatTL\(/);
    // Fiyat services.price'tan okunur.
    assert.match(booking, /select\('id, name, duration, color, price'\)/);
    // Modele "uydurma" talimatı verilmiş olmalı.
    assert.match(ai, /UYDURMA/);
});

test('kural konuyu bulduysa modele hiç gidilmez', () => {
    assert.match(booking, /\|\| Boolean\(ruleTopic\)/);
});

// ── Bakiye aynası: finance.ts ile patientBalance.ts aynı sonucu vermeli ─────
// resources.ts ile aynı düzen: biri değişip diğeri unutulursa test kırılsın.

test('bakiye formülü uygulama ile aynı', () => {
    const cases = [
        { plans: [], pays: [] },
        { plans: [{ id: 'p1', totalAmount: 1000, status: 'active' }], pays: [] },
        {
            plans: [{ id: 'p1', totalAmount: 1000, status: 'active' }],
            pays: [{ amount: 400, treatmentPlanId: 'p1' }],
        },
        {
            // İptal plana yapılmış ödeme bakiyeyi düşürmemeli.
            plans: [
                { id: 'p1', totalAmount: 1000, status: 'active' },
                { id: 'p2', totalAmount: 500, status: 'cancelled' },
            ],
            pays: [{ amount: 500, treatmentPlanId: 'p2' }],
        },
        {
            // Plana bağlanmamış 'service' tahsilatı borca sayılır, 'product' sayılmaz.
            plans: [{ id: 'p1', totalAmount: 1000, status: 'completed' }],
            pays: [{ amount: 300, type: 'service' }, { amount: 200, type: 'product' }],
        },
        {
            // Fazla tahsilat: bakiye negatife düşmez, overpaid ayrı raporlanır.
            plans: [{ id: 'p1', totalAmount: 100, status: 'active' }],
            pays: [{ amount: 250, treatmentPlanId: 'p1' }],
        },
        {
            // 'proposed' henüz teklif — borç değil.
            plans: [{ id: 'p1', totalAmount: 900, status: 'proposed' }],
            pays: [],
        },
    ];
    for (const { plans, pays } of cases) {
        const edge = computeBalance(plans, pays);
        const app = computePatientFinance(plans, pays);
        assert.deepEqual(
            { total: edge.total, paid: edge.paid, balance: edge.balance, overpaid: edge.overpaid },
            { total: app.total, paid: app.paid, balance: app.balance, overpaid: app.overpaid },
            JSON.stringify({ plans, pays }),
        );
    }
});

test('tutar biçimi', () => {
    assert.equal(formatTL(0), '0 ₺');
    assert.equal(formatTL(1250), '1.250 ₺');
    assert.equal(formatTL(1250.5), '1.250,50 ₺');
    assert.equal(formatTL(999999), '999.999 ₺');
});

// ── Dalga 3: iptal / erteleme ───────────────────────────────────────────────

test('"randevumu iptal et" konuşmayı değil RANDEVUYU iptal eder', () => {
    // GERÇEK RİSK: bu cümle 'cancel'a düşerse bot "tamam iptal ettim" der ama
    // randevu takvimde durur — müşteri gelmez, slot boşa gider.
    assert.equal(detectIntent('randevumu iptal etmek istiyorum'), 'cancel_appointment');
    assert.equal(detectIntent('yarınki seansımı iptal edelim'), 'cancel_appointment');
    assert.equal(detectIntent('gelemeyeceğim'), 'cancel_appointment');
});

test('randevudan söz etmeyen iptal konuşmayı bırakır', () => {
    assert.equal(detectIntent('iptal'), 'cancel');
    assert.equal(detectIntent('boş ver'), 'cancel');
    assert.equal(detectIntent('vazgeçtim'), 'cancel');
});

test('onay beklerken "iptal" randevuyu silmez', () => {
    // O an "iptal" önerilen saati reddetmektir; cancel_appointment'a düşerse
    // müşterinin BAŞKA bir randevusu iptal edilirdi.
    assert.equal(detectIntent('iptal', { awaitingConfirm: true }), 'other');
    assert.equal(detectIntent('randevuyu iptal et', { awaitingConfirm: true }), 'other');
});

test('erteleme niyeti', () => {
    assert.equal(detectIntent('randevumu erteleyebilir miyiz'), 'reschedule');
    assert.equal(detectIntent('seansımı başka güne alalım'), 'reschedule');
    assert.equal(detectIntent('randevumun saatini değiştirmek istiyorum'), 'reschedule');
});

test('akış ortasında "başka gün" erteleme değildir', () => {
    // Akış içindeyken bu cümle önerilen günü beğenmemektir; erteleme sayılsaydı
    // bot yarım kalan randevuyu bırakıp kayıtlı randevuyu taşımaya çalışırdı.
    assert.equal(detectIntent('randevu başka gün olsun', { inFlow: true }), 'other');
    assert.equal(detectIntent('randevu başka gün olsun', { inFlow: false }), 'reschedule');
});

test('numaralı listeden seçim', () => {
    assert.equal(detectListChoice('2', 3), 2);
    assert.equal(detectListChoice('1.', 3), 1);
    assert.equal(detectListChoice('ikinci', 3), 2);
    assert.equal(detectListChoice('sonuncu', 3), 3);
    // Sınır dışı ve belirsiz girdide tahmin YOK — yanlış randevu iptal edilmesin.
    assert.equal(detectListChoice('5', 3), null);
    assert.equal(detectListChoice('0', 3), null);
    assert.equal(detectListChoice('yarın 3', 3), null);
    assert.equal(detectListChoice('2', 0), null);
});

test('iptal modele sorulmaz, erteleme sorulabilir', () => {
    // Geri alınamaz işlem yalnız kural katmanından tetiklenir.
    assert.match(booking, /if \(intent === 'cancel_appointment'\) return startAppointmentChange\('iptal'\)/);
    assert.match(booking, /ex\.intent === 'reschedule'\) return startAppointmentChange\('ertele'\)/);
    assert.ok(!/ex\.intent === 'cancel_appointment'/.test(booking),
        'randevu iptali model çıktısından tetiklenmemeli');
});

test('iptal onay ister, tek adımda silmez', () => {
    assert.match(booking, /state\.cancelId = /);
    assert.match(booking, /M\.confirmCancel\(/);
    assert.match(booking, /if \(state\.cancelId && ruleConfirm\)/);
});

test('iptal edilen slot bekleme listesine ve işletmeciye duyurulur', () => {
    assert.match(booking, /announceFreedSlot\(admin, orgId/);
    assert.match(booking, /notifyOwner\(admin, orgId, \{\s*\n\s*title: 'Randevu iptal edildi'/);
});

test('erteleme yeni kayıt AÇMAZ, mevcut kaydı taşır', () => {
    // Yeni kayıt açılsaydı müşteri iki randevulu görünür, eskisi takvimde ölü
    // bir slot olarak kalırdı.
    assert.match(booking, /if \(state\.rescheduleId\) \{/);
    const idx = booking.indexOf('if (state.rescheduleId) {');
    const block = booking.slice(idx, idx + 900);
    assert.ok(block.includes(".update({"), 'erteleme UPDATE ile yapılmalı');
    assert.ok(!block.includes('.insert('), 'erteleme INSERT etmemeli');
});

test('taşınan randevu kendi slotunu dolu göstermez', () => {
    // Aynı güne çekme: randevu kendi saatini meşgul sayarsa müşteri "o saat
    // dolu" cevabını kendi randevusundan alır.
    assert.match(booking, /dayResRaw \|\| \[\]\)\.filter\(\(r: any\) => r\.id !== state\.rescheduleId\)/);
});

test('taşınan randevunun hatırlatmaları sıfırlanır', () => {
    for (const src of [booking, manage]) {
        assert.match(src, /reminder_24h_sent: false, reminder_2h_sent: false/);
        assert.match(src, /customer_confirm: null, customer_confirm_at: null/);
    }
});

// ── 24 saat onay döngüsü ────────────────────────────────────────────────────

test('hatırlatma yalnız asistan açıkken soru sorar', () => {
    // Kapalıyken gelen "hayır" cevaplanmaz ve müşteri cevapsız kalır —
    // soru sormanın en kötü hâli.
    assert.match(remind, /function withConfirmAsk\(msg: string, assistantOn: boolean\)/);
    assert.match(remind, /if \(!assistantOn\) return msg;/);
    assert.match(remind, /withConfirmAsk\(\s*\n?\s*await aiOrTemplate/);
});

test('hatırlatma yanıtı yalnız akış YOKKEN randevuya bağlanır', () => {
    // Konuşmanın ortasındaki "evet" her zaman o konuşmaya aittir.
    assert.match(booking, /if \(!inFlow && ruleConfirm && known\?\.id\)/);
    assert.match(booking, /\.eq\('reminder_24h_sent', true\)\.is\('customer_confirm', null\)/);
});

test('"hayır" randevuyu iptal eder ve yeri serbest bırakır', () => {
    const idx = booking.indexOf("if (!inFlow && ruleConfirm && known?.id)");
    const block = booking.slice(idx, idx + 2200);
    assert.ok(block.includes("customer_confirm: 'no'"));
    assert.ok(block.includes("status: 'cancelled'"));
    assert.ok(block.includes('announceFreedSlot('));
});

test('085 yanıt sütunlarını enum ile sınırlar', () => {
    assert.match(mig085, /customer_confirm\s+TEXT/);
    assert.match(mig085, /customer_confirm IN \('yes', 'no'\)/);
    // Kısmi indeks: yalnız yanıt bekleyen satırlar taşınır.
    assert.match(mig085, /WHERE customer_confirm IS NULL AND reminder_24h_sent = true/);
});

test('bildirim gönderilemezse randevu akışı bozulmaz', () => {
    const notify = readFileSync(
        new URL('../supabase/functions/_shared/notify.ts', import.meta.url), 'utf8');
    // notifyOwner içindeki her şey try/catch'te ve hata yutuluyor.
    assert.match(notify, /export async function notifyOwner/);
    assert.match(notify, /\} catch \{/);
    // Çağrı yerleri await ETMEMELİ: bildirim müşteriye verilen sözü bekletmez.
    assert.ok(!/await notifyOwner\(/.test(booking), 'notifyOwner await edilmemeli');
    assert.ok(!/await announceFreedSlot\(/.test(booking), 'announceFreedSlot await edilmemeli');
});

test('iptal onayına gelen "Evet" hatırlatma yanıtı sanılmaz', () => {
    // GERÇEK RİSK: A1 (hatırlatma yanıtı) A2'den (iptal onayı) önce çalışıyor.
    // cancelId inFlow'a dahil edilmezse "Evet" hatırlatmaya gider ve müşterinin
    // iptal etmek istediği randevu değil, BAŞKA bir randevusu etkilenir.
    assert.match(booking, /state\.cancelId \|\| state\.pickList/);
});
