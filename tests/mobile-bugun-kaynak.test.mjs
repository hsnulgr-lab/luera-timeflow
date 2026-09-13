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
    assert.match(screen, /const \{ state: agendaState, rows: agenda, at: readAt, reload \} = useAgenda\(dateISO, today\)/);
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
    // JSX'e demirleniyor: aynı koşul artık başlıkta da geçiyor ve metinsel
    // ilk eşleşme oraya düşüyordu.
    const cut = screen.slice(screen.indexOf("agendaState === 'error' ? ("), screen.indexOf("agendaState === 'loading' ? ("));
    assert.equal((cut.match(/<Pressable/g) ?? []).length, 1);
    assert.match(cut, /reload\(\)/);
});

test('hata ELDEKİ listeyi silmiyor', () => {
    // Kural: okunamayan bir gün BOŞ bir gün değildir. Eskiden bu "hata dalında
    // `setRows` hiç çağrılmasın" diye ölçülüyordu; çevrimdışı kopya geldiğinde
    // o dal artık `setRows(hit.rows)` çağırıyor — liste SİLİNMİYOR, tersine
    // dolduruluyor. Ölçü kuralın kendisine çevrildi.
    const cut = source.slice(source.indexOf('.catch(()'), source.indexOf('return () => { alive = false; };'));
    // Boşaltan hiçbir yazma yok.
    assert.doesNotMatch(cut, /setRows\(\[\]\)/);
    // Ve hata dalı asla "okuduk" demiyor.
    assert.doesNotMatch(cut, /setState\('ok'\)/);
    assert.match(cut, /setState\('error'\)/);
});

test('geç dönen cevap BAŞKA GÜNÜN listesini ezmiyor', () => {
    // Şeritte hızlı gezinirken önceki günün cevabı sonra dönebiliyor.
    assert.match(source, /const wanted = useRef\(dateISO\)/);
    // İstenen gün okumanın BAŞINDA yakalanıyor: `read` artık dört yerden
    // çağrılıyor (açılış, yoklama, öne dönüş, sekmeye dönüş) ve her biri
    // kendi anındaki günü soruyor.
    assert.match(source, /const target = dateISO;/);
    // ASKIYA GİREN her dalda koruma olmak zorunda: başarı, hata ve çevrimdışı
    // kopyanın diskten okunması — üçü de geç dönebilir. Sayı sabitlenmiyor,
    // çünkü yeni bir dal eklendiğinde testin patlaması değil KAPSAMASI
    // gerekiyor; ölçü `.then(`/`.catch(` başına düşen koruma.
    const chain = source.slice(source.indexOf('return fetchAgenda('), source.indexOf('}, [dateISO, todayISO]);'));
    const branches = (chain.match(/\.then\(|\.catch\(/g) ?? []).length;
    const guards = (chain.match(/if \(wanted\.current [!=]== target\)/g) ?? []).length;
    assert.ok(branches >= 2, `zincir okunamadı (${branches})`);
    assert.ok(guards >= branches - 1,
        `${branches} dal var ama yalnız ${guards} koruma — geç dönen cevap başka günü ezebilir`);
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
    assert.match(source, /setAt\(now\)/, 'canlı okumada okumanın anı');
    // Çevrimdışı kopyada damga ŞİMDİ DEĞİL, kopyanın kendi anı — yoksa
    // diskten gelen liste taze görünürdü.
    assert.match(source, /setAt\(hit\.at\)/);
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

test('sunucunun saati EKRANIN biçimine indirgeniyor', () => {
    // Postgres `time` kolonu "13:00:00" gönderiyor, sahte veri "13:00"
    // üretiyordu ve sözleşmede hangisinin geçerli olduğu yazmamıştı. Kart
    // saati ham bastığı için ekranda "13:00:" / "00" diye ikiye kırılıyordu.
    assert.match(source, /start_time: clockText\(appointment\.start_time\)/);
    assert.match(source, /end_time: clockText\(appointment\.end_time\)/);
});

test('başlık hata hâlinde "randevu yok" DEMİYOR', () => {
    // Gövde "okuyamadık" derken başlık "randevu yok" diyordu: aynı ekranda
    // iki farklı gerçek, ikisinden biri yalan.
    assert.match(screen, /agendaState === 'error'\s*\?\s*'okunamadı'/);
});


// ── Bayat liste ─────────────────────────────────────────────────────────────

test('son başarılı okumanın anı TÜKETİLİYOR, yalnız üretilmiyor', () => {
    // `at` alanı yazılmıştı ama ekran onu destructure bile etmiyordu: kaynak
    // "son güncelleme"yi biliyor, kullanıcı bilmiyordu.
    assert.match(source, /setAt\(now\);/);
    assert.match(source, /export \{ isStale, POLL_MS, STALE_AFTER_MS \} from '\.\/freshness\.ts';/);
    assert.match(screen, /at: readAt/);
    assert.match(screen, /Son güncelleme \{clockOf\(readAt as number\)\}/);
});

test('bayatlık eşiği saf ve tek yerde', async () => {
    const { isStale, STALE_AFTER_MS } = await import('../mobile/src/lib/freshness.ts');
    assert.equal(STALE_AFTER_MS, 120_000);

    const now = 1_700_000_000_000;
    assert.equal(isStale(now, now), false);
    assert.equal(isStale(now - 119_000, now), false);
    assert.equal(isStale(now - 120_000, now), true);
    assert.equal(isStale(now - 3_600_000, now), true);
});

test('hiç okunmamış liste BAYAT değil — o ayrı bir hâl', () => {
    // "Bilinmiyor"u "eski" diye göstermek iki gerçeği aynı cümleye sıkıştırır;
    // okunmamışlığın kendi hâlleri var: loading ve error.
    return import('../mobile/src/lib/freshness.ts').then(({ isStale }) => {
        assert.equal(isStale(null, Date.now()), false);
    });
});

test('taze veride satır ÇİZİLMİYOR, bayatta hem satır hem yenileme var', () => {
    // Okumanın üstünden bir saniye geçmişken "son güncelleme 09:14" yazmak
    // bilgi değil gürültü; gürültü uyarıyı öldürür.
    assert.match(screen, /agendaState === 'ok' && isStale\(readAt, now\) \? \(/);
    // Satır aynı zamanda tek elle yenileme yolu: `reload` bugüne kadar
    // YALNIZ hata ekranındaki düğmeye bağlıydı, başarılı bir listeyi
    // tazelemenin hiçbir yolu yoktu.
    const band = screen.slice(
        screen.indexOf("agendaState === 'ok' && isStale(readAt, now)"),
        screen.indexOf('<NowLineSlot active={lineAfter < 0}'),
    );
    assert.match(band, /onPress=\{\(\) => \{ feedback\.selection\(\); reload\(\); \}\}/);
    assert.match(band, /Yenile/);
    assert.match(band, /accessibilityRole="button"/);
});


// ── Yoklama ─────────────────────────────────────────────────────────────────

test('yoklama aralığı bayatlık eşiğinin ALTINDA — sözleşme, tesadüf değil', async () => {
    const { POLL_MS, STALE_AFTER_MS } = await import('../mobile/src/lib/freshness.ts');
    assert.equal(POLL_MS, 25_000);
    assert.ok(POLL_MS < STALE_AFTER_MS, 'yoklama eşikten sık olmalı');
    // Sonuç: yoklama çalıştığı sürece "son güncelleme" satırı HİÇ görünmüyor.
    // Satırın belirmesi tek bir şey anlatıyor — yoklama cevap alamıyor.
});

test('uygulama ARKA PLANDAYKEN yoklama istek atmıyor', () => {
    // Cebindeki telefonun salonun takvimini saniye saniye çekmesi için bir
    // sebep yok; öne dönüldüğünde zaten bir kez okunuyor.
    assert.match(source, /if \(AppState\.currentState !== 'active'\) return;/);
    assert.match(source, /setInterval\([\s\S]{0,220}POLL_MS\)/);
});

test('öne dönüş ve sekmeye dönüş ayrı ayrı okuyor', () => {
    // Arka planda geçen süre yoklama aralığından uzun olabilir; sekme
    // değiştirip dönen personel de 25 saniye beklemek istemiyor.
    assert.match(source, /AppState\.addEventListener\('change'[\s\S]{0,160}next === 'active'[\s\S]{0,60}read\(false\)/);
    assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{ void read\(false\); \}, \[read\]\)\)/);
});

test('SESSİZ yenilemenin hatası çalışan ekranı BOZMUYOR', () => {
    // Elde bayat ama doğru bir liste varken onu "okuyamadık" ekranıyla
    // değiştirmek, çalışan bir ekranı bozmak olurdu. Görünür okumalar
    // (açılış, "tekrar dene") hatayı söylemeye devam ediyor.
    // Kural aynı, yazımı değişti: eskiden tek satırdı (`if (visible)
    // setState('error')`), şimdi sessiz okuma daha en başta dönüyor — çünkü
    // görünür başarısızlığın arkasında artık çevrimdışı kopya araması var ve
    // arka plan turu ona da girmemeli.
    assert.match(source, /void read\(true\);/);
    assert.match(source, /read\(false\)/);
    // Sessiz dalda HİÇBİR durum yazması yok.
    const quiet = source.slice(source.indexOf('if (!visible) return;'));
    assert.ok(source.indexOf('if (!visible) return;') < source.indexOf("setState('error')", source.indexOf('.catch(() => {')),
        'sessiz dönüş, hata yazmasından ÖNCE olmalı');
    assert.ok(quiet.length > 0);
    // Yoklama başarısızken hiçbir şeye DOKUNULMUYOR: kopyaya düşme bile
    // yalnız görünür okumada oluyor, çünkü elde canlı liste duruyor ve onu
    // diskteki kopyayla değiştirmek çalışan ekranı geriye almak olurdu.
    const fail = source.slice(source.indexOf('.catch(() => {'), source.indexOf('}, [dateISO, todayISO]);'));
    assert.match(fail, /if \(!visible\) return;/);
    assert.doesNotMatch(fail, /setRows\(\[\]\)/);
});
