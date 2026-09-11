import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * "Bugün" ekranının veri kaynağı.
 *
 * Ekran `demoAgenda`yı doğrudan çağırıyordu ve bu SENKRONDU: veri her zaman
 * anında, doğru ve hatasız geliyordu. Gerçek sunucu öyle davranmıyor ve
 * ekranın "yükleniyor" ile "hata" diye bir hâli yoktu — bağlandığı gün
 * okunamayan bir gün, RANDEVUSUZ bir gün gibi görünecekti.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const source = read('src/lib/agendaSource.ts');
const screen = read('app/personel/index.tsx');

test('ekran artık DOĞRUDAN sahte veriyi çağırmıyor', () => {
    assert.doesNotMatch(screen, /const agenda = useMemo\(\s*\(\) => \(isToday \? demoAgenda/);
    assert.match(screen, /const \{ state: agendaState, rows: agenda, reload \} = useAgenda\(dateISO, today\)/);
});

test('okunamadı ile randevusuz AYRI çiziliyor', () => {
    // İkisi aynı görünürse personel gününü kapatır.
    assert.match(screen, /agendaState === 'error' \? \(/);
    assert.match(screen, /okuyamadık/);
    assert.match(screen, /Randevunuz olmadığı anlamına gelmez/);
    // "Randevunuz yok" hâli DURUYOR — gerçekten boş gün için doğru cevap.
    assert.match(screen, /randevunuz yok/);
});

test('hata ekranında TEK eylem: tekrar dene', () => {
    const cut = screen.slice(screen.indexOf("agendaState === 'error'"), screen.indexOf("agendaState === 'loading'"));
    assert.equal((cut.match(/<Pressable/g) ?? []).length, 1);
    assert.match(cut, /reload\(\)/);
});

test('hata ELDEKİ listeyi silmiyor', () => {
    // `setRows` hata dalında çağrılmamalı: okunamayan bir gün, boş bir gün
    // değildir ve ekranda duran liste bayat da olsa yoktan iyidir.
    const cut = source.slice(source.indexOf('.catch(()'), source.indexOf('return () => { alive = false; };'));
    assert.doesNotMatch(cut, /setRows\(/);
    assert.match(cut, /setState\('error'\)/);
});

test('geç dönen cevap BAŞKA GÜNÜN listesini ezmiyor', () => {
    // Şeritte hızlı gezinirken önceki günün cevabı sonra dönebiliyor.
    assert.match(source, /const wanted = useRef\(dateISO\)/);
    // HER İKİ dalda da: başarı da hata da geç dönebilir.
    const guards = (source.match(/if \(!alive \|\| wanted\.current !== dateISO\) return;/g) ?? []).length;
    assert.equal(guards, 2, 'koruma hem .then hem .catch dalında olmalı');
});

test('canlıya geçiş TEK değişkenle geri alınabiliyor', () => {
    // Sahte kaynak duruyor: geliştirme akışı bozulmuyor ve dönüş yolu açık.
    assert.match(source, /if \(!LIVE_AUTH\) \{/);
    assert.match(source, /api\.agenda\(dateISO\)/);
});

test('şerit sayıları canlıda UYDURULMUYOR', () => {
    // Sunucuda aralık ucu yok (`agenda` tek gün). Sahte sayıları çizmek
    // düpedüz yalan olurdu; şerit eksik günü "bilinmiyor" diye çiziyor.
    assert.match(screen, /LIVE_AUTH\s*\?\s*\(agendaState === 'ok' \? \{ \[dateISO\]: agenda\.length \} : \{\}\)/);
});

test('son okuma ANI taşınıyor', () => {
    // Bayat veriye bakıp karar vermek, hiç veri görmemekten tehlikeli.
    // Etiketin kendisi Müdür 28'in turuna ait; taşıyıcı hazır.
    assert.match(source, /at: number \| null;/);
    assert.match(source, /setAt\(Date\.now\(\)\)/);
});

test('İLK okuma "yeni kart" sayılmıyor', () => {
    // Kaynak asenkron olunca karşılaştırma önce BOŞ listeyle çalışıyordu;
    // gerçek liste gelince bütün kartlar yeni sayılıyor ve hepsi yuva açarak
    // beliriyordu. Üstelik halka kendini kart büyürken ölçüp dönen degradeyi
    // kaymış oturtuyordu. İlk okuma bir olay değil, başlangıç durumudur.
    const cut = screen.slice(screen.indexOf('const seen = useRef'), screen.indexOf('}, [agenda, dateISO, agendaState]);'));
    assert.match(cut, /if \(agendaState !== 'ok'\) return;/);
    assert.match(screen, /\}, \[agenda, dateISO, agendaState\]\);/);
});
