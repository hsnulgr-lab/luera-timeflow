import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * MÜDÜR · TAKVİM CANLIYA BAĞLANDI.
 *
 * Ekran altı sahte şeyden besleniyordu: randevular, kadro, hafta sayıları,
 * "bugün"ün tarihi, taşıma seçenekleri ve izin durumu. Hepsi `mockDay` ile
 * geliyordu ve `mockDay.presence` altı uydurma isim taşıyordu.
 *
 * ── Ortak `source` NEDEN çevrilmedi ─────────────────────────────────────────
 * `calendarSource.source` altı ekranla ortak. Tek satırda canlıya çevirmek,
 * akış ekranını YARI canlı bırakırdı: bugünün olayları `mockDay.events`ten
 * gelmeye devam ederken başka günlerin randevuları veritabanından gelirdi ve
 * personel adları sahte listede aranacağı için hiçbiri eşleşmezdi.
 *
 * Bu yüzden ekran ekran geçiliyor: takvim kendi canlı kaynağını kullanıyor,
 * ötekiler kendi adımları gelene kadar sahte kalıyor.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = strip(read('app/mudur/calendar.tsx'));
const day = strip(read('src/lib/managerCalendarDay.ts'));

// ── Sahte kaynak kesildi ────────────────────────────────────────────────────

test('ekran mockDay’den TAMAMEN koptu', () => {
    assert.doesNotMatch(screen, /mockDay/);
    assert.doesNotMatch(screen, /managerFlow/);
});

test('"bugün" CİHAZIN günü', () => {
    // `mockDay.dateISO` sahte günü veriyordu; şimdi çizgisi, boş gün metni ve
    // gün seçimi ondan türüyordu.
    assert.match(screen, /const isToday = selectedDate === todayISO\(\);/);
    assert.match(screen, /useState\(params\.date \?\? todayISO\(\)\)/);
});

// ── Kadro ───────────────────────────────────────────────────────────────────

test('sütunlar CANLI kadrodan ve kural columnsFor’da', () => {
    assert.match(day, /const \{ columns, unassigned \} = columnsFor\(crew, rows\);/);
    assert.match(screen, /data\.columns\.map/);
    // Sunucu adı gönderiyor, baş harfi göndermiyor — tek `initialsOf`.
    assert.match(screen, /initials: initialsOf\(person\.name\)/);
});

test('taşıma sayfası İZİNLİYİ gerçekten biliyor', () => {
    // Eskiden izin sahte `presence.state`ten geliyordu. Şimdi `staff_time_off`
    // tablosundan — izin orada gün gün duruyor.
    assert.match(day, /fetchLeave\(dateISO, addDaysISO\(dateISO, LEAVE_WINDOW_DAYS\)\)/);
    assert.match(screen, /available: person\.active && !data\.onLeave\.has\(person\.id\)/);
    assert.match(screen, /reason: data\.onLeave\.has\(person\.id\) \? 'izinli' : undefined/);
});

test('"çalışmıyor" hâli UYDURULMUYOR', () => {
    // O hâl personelin kendi çalışma saatlerinden türüyor ve o okuma henüz
    // açılmadı. Bilinmeyeni "çalışmıyor" saymak, çalışan birini seçilemez
    // yapardı.
    assert.doesNotMatch(screen, /'çalışmıyor'/);
});

// ── Tek okuma ───────────────────────────────────────────────────────────────

test('günün bütün parçaları TEK okumada ve PARALEL', () => {
    /*
     * Ayrı ayrı gelselerdi ekranda birbirini tutmayan bir an olurdu:
     * randevular yeni günün, sütunlar eski günün.
     *
     * Parça SAYISI pinlenmiyor — yeni bir okuma eklendiğinde kırılması gereken
     * şey sayı değil, paralelliğin kendisi. Kural: her okuma TEK `Promise.all`
     * içinde ve dışarıda başıboş `await` yok.
     */
    const block = day.slice(day.indexOf('await Promise.all(['), day.indexOf(']);') + 3);
    for (const call of ['fetchDayWithStamps(dateISO)', 'fetchCrew()', 'fetchLeave(', 'apiSource.range(from, to)', 'fetchServerNow()']) {
        assert.ok(block.includes(call), `${call} paralel blokta değil`);
    }
    // `Promise.all` dışında ikinci bir bekleme yok: sıraya girmiş bir okuma
    // paralelliği sessizce bozar.
    const body = day.slice(day.indexOf('const read = useCallback'));
    assert.equal((body.match(/await /g) ?? []).length, 1);
});

test('hafta sayıları ŞERİDİN gördüğü haftadan', () => {
    assert.match(day, /const week = weekDays\(dateISO\);/);
    assert.match(screen, /counts=\{data\.counts\}/);
});

// ── Üç hâl ──────────────────────────────────────────────────────────────────

test('RED, okunamamadan ÖNCE ele alınıyor', () => {
    // "Bu salona artık giremiyorsunuz" ile "okuyamadık" aynı blok olamaz:
    // birinde beklemek bir seçenek, ötekinde değil. Sıra ters olsaydı red
    // hiç görünmezdi — çünkü red de `state === 'error'` üretiyor.
    const refusalAt = screen.indexOf('{refusal ? (');
    const errorAt = screen.indexOf("state === 'error' ? (");
    assert.ok(refusalAt > -1 && errorAt > -1);
    assert.ok(refusalAt < errorAt);
});

test('okunamayan gün BOŞ ızgara çizmiyor', () => {
    assert.match(screen, /<DurumUnread/);
    assert.match(screen, /what="Günü"/);
    // Boş ızgara ancak okuma BAŞARILIYSA çizilir.
    assert.match(screen, /\) : \(\s*\n\s*<ColumnCalendar/);
});

test('bayat listede sayı yerine SAAT yazıyor', () => {
    // Yoklama sessizce cevap alamıyorsa ızgara donuyor ve bunun tek izi bu
    // satır. Bayat bir sayıya güvenmek, saati kaybetmekten kötü.
    assert.match(screen, /stale && readAt !== null/);
    assert.match(screen, /son güncelleme \$\{clockAt\(readAt\)\}/);
});

test('saat damgası SAHTE dosyadan alınmıyor', () => {
    // `clockOf` `staffDemo.ts`'te yaşıyor ve o dosya sahte veri taşıyor;
    // canlı bir müdür ekranının oradan bir şey içe aktarması, sahteyi canlıya
    // bağlayan bir iplik bırakırdı.
    assert.doesNotMatch(screen, /staffDemo/);
});

// ── Reddin hamlesi ──────────────────────────────────────────────────────────

test('salon seçimi ŞİFRE SORMUYOR, erişim reddi oturumu KAPATIYOR', () => {
    // İki salonlu müdürün oturumu geçerli — yalnız hangisi olduğunu
    // söylememiş. Onu çıkışa yollamak şifresini yeniden yazdırmak olurdu.
    // Erişimi kaldırılmış müdürde ise cihazda duran salon artık yanlış.
    const fn = screen.slice(screen.indexOf('const onRefusalAction'));
    const body = fn.slice(0, fn.indexOf('const onMenuPick'));
    assert.match(body, /if \(refusal === 'ambiguous'\) \{[\s\S]*?router\.push\('\/\(auth\)\/manager\/business'\)/);
    assert.doesNotMatch(body.slice(0, body.indexOf('return;')), /signOut/);
    assert.match(body, /await authApi\.resume\.signOut\(\)/);
});

test('her iki yolda da org önbelleği UNUTULUYOR', () => {
    // Unutulmazsa müdür başka salona geçse bile önceki org kimliğiyle sorgu
    // kurulur: RLS boş döner, ekran sebepsiz boşalır.
    const fn = screen.slice(screen.indexOf('const onRefusalAction'));
    const body = fn.slice(0, fn.indexOf('const onMenuPick'));
    assert.equal((body.match(/forgetOrg\(\)/g) ?? []).length, 2);
});

// ── Atanmamış ───────────────────────────────────────────────────────────────

test('ATANMAMIŞ randevu sessiz kalmıyor', () => {
    /*
     * Sütunu olmayan randevu ızgarada görünmüyor ve görünemez — tasarımında
     * "atanmamış" diye bir kavram yok. Kendi başıma bir sütun uydurmak yerine
     * SAYI söyleniyor: müdür en azından eksik bir şey olduğunu biliyor.
     *
     * Sıfırsa hiç yazılmıyor — her gün sonuna "· 0 atanmamış" eklemek gürültü,
     * ve gürültü uyarıyı öldürür.
     */
    assert.match(screen, /const orphanTail = \(count: number\) => \(count > 0 \? ` · \$\{count\} atanmamış` : ''\)/);
    assert.match(screen, /\$\{orphanTail\(data\.unassigned\)\}/);
});
