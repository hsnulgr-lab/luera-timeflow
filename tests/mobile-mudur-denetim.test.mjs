/**
 * Müdür ekranları — denetim turunda bulunan hataların nöbetçisi.
 *
 * Buradaki her test bir kez GERÇEKTEN yaşanmış bir kusuru kilitliyor:
 * ekranda donmuş bir saat, birbirini tutmayan iki sayı, dokunulup hiçbir şey
 * olmayan bir kontrol, teslimat iddia eden bir cümle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    activeCountOf, bookedEvent, mockDay, pendingOf,
} from '../mobile/src/lib/managerFlow.ts';
import { nowInMinutes } from '../mobile/src/lib/calendar.ts';
import {
    emptyDayCopy, plateIsPermanent, staffStripVisible,
} from '../mobile/src/lib/emptyDay.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const flow = read('../mobile/app/(manager)/index.tsx');
const calendar = read('../mobile/app/(manager)/calendar.tsx');
const cash = read('../mobile/app/(manager)/cash.tsx');
const layout = read('../mobile/app/_layout.tsx');
const create = read('../mobile/app/(manager)/create.tsx');
const store = read('../mobile/src/state/managerDay.tsx');

// ── Aynı ekranda iki gerçek olmaz ───────────────────────────────────────────

test('özet şeridi akıştan KALDIRILDI', () => {
    // Ciro ve adisyon Kasa'nın işi; müdür oraya zaten bakıyor. Akışta
    // randevuların yerini yiyordu. (Sabit "3 ADİSYON" sayısı da böylece
    // listeyi yalanlamaktan tamamen çıktı.)
    assert.doesNotMatch(flow, /<StatLine/);
    assert.doesNotMatch(flow, /summary\.revenue/);
});

test('"kaç işlem sürüyor" ŞERİTTEN türer', () => {
    // Ayrı tutulan sayı, şeritte üç kişi işlemdeyken başka bir şey diyebilirdi.
    assert.equal(activeCountOf(mockDay.presence), 3);
    assert.equal(activeCountOf([]), 0);
    assert.match(flow, /activeCountOf\(people\)/);
});

test('gün özeti artık sabit sayı taşımıyor', () => {
    assert.equal(mockDay.summary.dueCount, undefined);
    assert.equal(mockDay.activeCount, undefined);
});

// ── Donmuş saat ─────────────────────────────────────────────────────────────

test('"şimdi" çizgisi cihazın saatinden gelir', () => {
    // Takvimde `11 * 60 + 24` sabiti duruyordu; çizgi hiç kıpırdamıyordu.
    assert.equal(nowInMinutes(new Date(2026, 7, 21, 14, 5)), 14 * 60 + 5);
    assert.equal(nowInMinutes(new Date(2026, 7, 21, 0, 0)), 0);
    assert.doesNotMatch(calendar, /11 \* 60 \+ 24/);
    assert.match(calendar, /nowInMinutes\(\)/);
});

test('şimdi sayacı dakika başı ilerler ve yalnız bugün çalışır', () => {
    assert.match(calendar, /setInterval\(\(\) => setNowMinutes\(nowInMinutes\(\)\), 60_000\)/);
    assert.match(calendar, /if \(!isToday\) return;/);
    assert.match(calendar, /clearInterval/);
});

// ── Dokunulup hiçbir şey olmayan kontrol ────────────────────────────────────

test('cetvel gerçekten GÜN DEĞİŞTİRİR', () => {
    // Seçim yalnız cetvelin içinde kalıyordu: başlık da liste de bugünü
    // göstermeye devam ediyordu.
    assert.match(flow, /const isToday = selectedISO === mockDay\.dateISO/);
    // Artık boş dizi değil: başka gün seçilince o günün randevuları okunur.
    assert.match(flow, /source\.day\(selectedISO\)/);
    assert.match(flow, /<DayHeader dateISO=\{selectedISO\}/);
});

test('başka gün seçiliyken personel şeridi gösterilmez', () => {
    // Şerit ŞU ANIN gerçeği: "14 Ağustos" başlığı altında bugün kimin
    // işlemde olduğunu göstermek yalan olurdu.
    // Kural artık kütüphanede: şerit YALNIZ bugün — boş olsun ya da olmasın.
    assert.match(flow, /\{staffStripVisible\(isToday\) \? \(\s*<Animated\.View style=\{\{ opacity: stripOpacity \}\}>/);
    assert.equal(staffStripVisible(true), true);
    assert.equal(staffStripVisible(false), false);
});

test('boş günde HER AN en az iki dokunmatik çıkış var', () => {
    // Geçici "Bugüne dön" hapı kalktı; yerini pedalın orta bölmesi aldı.
    // Değişmez kural: pedal ve cetvel her zaman durur, jest üçüncüsüdür.
    assert.match(flow, /<DayPedalBar pedal=\{pedal\} onGo=\{goToDay\}/);
    assert.match(flow, /platePermanent \? 1 : compactOpacity/);
    assert.equal(plateIsPermanent(true, false), true);
    // Bugün istisna: başlık ve şerit doğruyu söylüyor, levha kaydırmaya bağlı.
    assert.equal(plateIsPermanent(true, true), false);
});

test('boş hâl ÜÇ günü ayırır — geçmiş, bugün, gelecek', () => {
    // "boş geçti" yalnız geçmiş gün içindir: gelecek bir gün için geçmiş kip
    // yanlış bilgi verir, gün henüz yaşanmadı.
    const today = emptyDayCopy('2026-08-14', '2026-08-14');
    const past = emptyDayCopy('2026-08-08', '2026-08-14');
    const future = emptyDayCopy('2026-08-19', '2026-08-14');
    assert.match(today.title, /Bugün henüz/);
    assert.match(past.title, /boş geçti/);
    assert.doesNotMatch(future.title, /boş geçti/);
    assert.match(future.hint, /henüz randevu kurulmadı/);
    // Geçmişe randevu kurulmaz — düğme HİÇ çizilmez.
    assert.equal(past.action, null);
    assert.ok(today.action && future.action);
    // Nokta yalnız bugünde: bugün bir zaman bilgisidir.
    assert.equal(today.dot, true);
    assert.equal(past.dot, false);
    assert.equal(future.dot, false);
});

// ── Aşağı çekip yenileme ────────────────────────────────────────────────────

test('iki ekranda da aşağı çekip yenileme var', () => {
    // Master promptun şartı ve müdürün refleksi. Biri yapıp öteki yapmasa
    // uygulama iki ayrı ürün gibi hissettirirdi.
    assert.match(flow, /<RefreshControl/);
    assert.match(cash, /<RefreshControl/);
});

test('yenileme sahte bekleme UYDURMAZ', () => {
    // Elimizdeki tek kaynak yeniden okunuyor; sahte bir gecikme animasyonu
    // "sunucuya gidiyoruz" yalanı olurdu.
    assert.doesNotMatch(flow, /setTimeout\([^)]*setRefreshing/);
    assert.doesNotMatch(cash, /setTimeout\([^)]*setRefreshing/);
});

// ── Sekmeler arası tek gerçek ───────────────────────────────────────────────

test('Akış ve Kasa AYNI kaynaktan okur', () => {
    // Akış'ta "Tahsil et"e basınca Kasa'nın bekleyen paneli hiçbir şey
    // duymuyordu: aynı salonun iki ekranı iki farklı gerçek söylüyordu.
    assert.match(flow, /useManagerDay\(\)/);
    assert.match(cash, /useManagerDay\(\)/);
    // Sağlayıcı KÖKTE: randevu oluşturma sekmelerin dışında yaşıyor ve
    // kurduğu randevunun akışa düşmesi gerekiyor.
    assert.match(layout, /<ManagerDayProvider>/);
});

test('sağlayıcı yoksa sessizce boş güne DÜŞMEZ', () => {
    // Sessiz yedek, ekranın veriyi kaybettiğini gizler: müdür boş bir kasa
    // görür ve gerçekten boş sanır.
    assert.match(store, /throw new Error\('useManagerDay/);
});

test('bekleyen adisyon paneli akıştaki satırlardan türer', () => {
    const pending = pendingOf(mockDay.events);
    assert.equal(pending.count, mockDay.events.filter((e) => e.kind === 'due').length);
    assert.match(cash, /pendingOf\(events\)/);
});

// ── Teslimat iddiası ────────────────────────────────────────────────────────

test('iptal cümlesi müşteriye haber gittiğini İDDİA ETMEZ', () => {
    // Masaüstünde iptalde haber giden yer bekleme listesi; iptal edilen
    // müşteriye hiçbir şey gitmiyor.
    const detail = read('../mobile/src/lib/appointmentDetail.ts');
    // Yorumda gerekçe olarak geçiyor; aranan şey KULLANICIYA GÖSTERİLEN metin.
    assert.doesNotMatch(detail, /body: '[^']*Müşteriye haber gider/);
    assert.match(detail, /body: '[^']*otomatik haber gitmez/);
});

test('menüdeki yıkıcı satırlar üç noktayla biter', () => {
    // Satır işi orada yapmıyor, onayın durduğu ekranı açıyor. Noktasız hâli
    // "dokun ve olsun" vaat edip bambaşka bir ekran getiriyordu.
    const move = read('../mobile/src/lib/moveAppointment.ts');
    assert.match(move, /title: `\$\{option\.title\}…`/);
});

test('kasa iptali kim yaptığını uydurmaz', () => {
    assert.doesNotMatch(cash, /'Ayla', '11:42'/);
    assert.match(cash, /applyVoid\(list, voidingId, null, hhmm\(nowInMinutes\(\)\)\)/);
});

// ── Kurulan randevu ─────────────────────────────────────────────────────────

test('kurulan randevu AKIŞA da düşer', () => {
    // Takvim'e düşüyordu ama akışa düşmüyordu: müdür onayı görüp Akış'a
    // dönüyor ve randevu orada yoktu. "booked" türü baştan tanımlıydı ve
    // hiç üretilmiyordu.
    const event = bookedEvent(
        { id: 'a1', customer_name: 'Elif Demir', start_time: '14:00:00', service: 'Kesim', staff_id: 'ece' },
        'Ece',
    );
    assert.equal(event.kind, 'booked');
    assert.equal(event.time, '14:00');
    assert.equal(event.firstName, 'Elif');
    assert.equal(event.lastName, 'Demir');
    assert.equal(event.detail, 'Kesim · Ece ile');
    assert.equal(event.appointmentId, 'a1');
    assert.match(create, /add\(bookedEvent\(appointment, staffName\)\)/);
});

test('personel bilinmiyorsa "ile" cümlesi kurulmaz', () => {
    const event = bookedEvent(
        { id: 'a2', customer_name: 'Ali', start_time: '09:30:00', service: 'Sakal' },
        null,
    );
    assert.equal(event.detail, 'Sakal');
    assert.equal(event.lastName, '');
});

test('başka güne kurulan randevu bugünün akışına düşmez', () => {
    assert.match(create, /if \(appointment\.date !== mockDay\.dateISO\) return;/);
});

test('yeni olay kendi SAATİNİN yerine oturur, listenin başına zorlanmaz', () => {
    // NİYET AYNI, ADRES DEĞİŞTİ: sıralama 2026-08-30'da saf katmana taşındı
    // (`sortFlow`). Sebebi bu testin göremediği bir kusurdu — karşılaştırıcı
    // YALNIZ burada, ekleme yolunda çalışıyordu; ilk yükleme ve yenileme ham
    // sırayı alıyor, ekranda saat rayı kendi sırasını tutmuyordu. Test
    // uygulamanın yerini sınadığı için o kusuru yakalayamamıştı; artık
    // sıralamanın ÜÇ okumada da kullanıldığını sınıyoruz.
    assert.match(store, /sortFlow\(\[\.\.\.list, event\]\)/);
    assert.equal((store.match(/sortFlow\(/g) ?? []).length, 3);
});
