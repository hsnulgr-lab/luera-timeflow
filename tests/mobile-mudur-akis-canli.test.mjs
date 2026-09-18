import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    buildFlow, DEFAULT_ARRIVAL_TOLERANCE_MIN, NO_SHOW_AFTER_MIN, etaFor, kindOf, occupancyOf, revenueOf,
} from '../mobile/src/lib/flowBuild.ts';

/**
 * MÜDÜR · AKIŞ CANLIYA BAĞLANDI.
 *
 * `managerFlow.ts`in 1375 satırı sağlamdı; sahte olan yalnız `mockDay` idi.
 * Bu dosya onun yerine geçen türetmeyi ve ekranın canlı veriyle kurduğu
 * sözleşmeyi kilitliyor.
 *
 * En ağır kural: "gelmedi" ve "adisyon bekliyor" MASAÜSTÜYLE AYNI tanımda.
 * İkisi ayrışsaydı aynı müşteri bir ekranda "bekleniyor", ötekinde "gelmedi"
 * görünürdü; Kasa iki adisyon, akış üç adisyon derdi.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = strip(read('mobile/app/mudur/index.tsx'));
const store = strip(read('mobile/src/state/managerDay.tsx'));
const day = strip(read('mobile/src/lib/managerFlowDay.ts'));
const desktop = read('src/lib/appointmentFlow.ts');
const kasa = read('src/pages/KasaPage.tsx');

const GUN = '2026-09-15';
const at = (clock) => Date.parse(`${GUN}T${clock}:00`);
const row = (over = {}) => ({
    id: 'r1', customer_id: 'c1', customer_name: 'Zeynep Kaya', customer_phone: '+905321110402',
    start_time: '11:00:00', end_time: '12:30:00', service: 'Saç boyama', status: 'confirmed',
    staff_id: 's1', customer_arrived_at: null, arrived_at: null, service_ended_at: null,
    is_paid: false, ...over,
});

// ── Masaüstüyle AYNI tanım ──────────────────────────────────────────────────

test('varsayılan tolerans MASAÜSTÜYLE aynı sayı', () => {
    // Mobil 30 dakika sabit kullanıyordu, masaüstü salon ayarını (vars. 120).
    // Aynı müşteri 31. dakikada telefonda "gelmedi", masaüstünde "bekleniyor"du.
    const m = /DEFAULT_ARRIVAL_TOLERANCE_MIN = (\d+)/.exec(desktop);
    assert.ok(m, 'masaüstü sabiti bulunamadı');
    assert.equal(DEFAULT_ARRIVAL_TOLERANCE_MIN, Number(m[1]));
    // "Gelmedi" eşiği de iki yüzeyde aynı sayı (2026-09-18: 30 dk).
    const n = /NO_SHOW_AFTER_MIN = (\d+)/.exec(desktop);
    assert.ok(n, 'masaüstü gelmedi eşiği bulunamadı');
    assert.equal(NO_SHOW_AFTER_MIN, Number(n[1]));
});

test('"gelmedi" SALONUN toleransıyla', () => {
    const r = row();
    // Varsayılan eşik 30 dk (2026-09-18): randevu 11:00 → 11:30'a kadar açık.
    assert.equal(kindOf(r, GUN, at('11:29')), 'next', 'varsayılanla 29 dk henüz gelmedi değil');
    assert.equal(kindOf(r, GUN, at('11:31')), 'noshow', '30. dakikadan sonra düşer');
    assert.equal(kindOf(r, GUN, at('11:45'), 60), 'next', 'salonun 60 dk ayarı geçerli');
});

test('salona GİRMİŞ müşteri ne kadar geç kalsa da "gelmedi" değil', () => {
    const r = row({ customer_arrived_at: `${GUN}T13:30:00` });
    assert.equal(kindOf(r, GUN, at('14:00')), 'arrived');
});

test('"adisyon bekliyor" KASA’nın süzgeciyle aynı', () => {
    // Masaüstü Kasa: status === 'completed' && !isPaid.
    assert.match(kasa, /r\.status === 'completed' && !r\.isPaid/);
    assert.equal(kindOf(row({ status: 'completed', is_paid: false }), GUN, at('14:00')), 'due');
    assert.equal(kindOf(row({ status: 'completed', is_paid: true }), GUN, at('14:00')), 'paid');
    // Bitiş damgası olup tamamlanmamış satır Kasa'da yok — akışta da
    // "kasada bekliyor" DEĞİL.
    const legacy = row({ arrived_at: `${GUN}T11:00:00`, service_ended_at: `${GUN}T12:20:00` });
    assert.notEqual(kindOf(legacy, GUN, at('14:00')), 'due');
});

test('sıra kural: tahsil edilmiş randevu hiçbir saatte "gelmedi" olmuyor', () => {
    assert.equal(kindOf(row({ status: 'completed', is_paid: true }), GUN, at('23:00')), 'paid');
    assert.equal(kindOf(row({ status: 'cancelled' }), GUN, at('23:00')), 'cancelled');
    assert.equal(kindOf(row({ status: 'pending' }), GUN, at('23:00')), 'booked');
});

// ── Saat ────────────────────────────────────────────────────────────────────

test('geri sayım GÜNÜ de hesaba katıyor', () => {
    // Yalnız saatle çıkarılsaydı dünün 11:00'i "birazdan" görünürdü.
    assert.equal(etaFor(GUN, '11:00', at('10:50')), 10);
    assert.ok(etaFor('2026-09-14', '11:00', at('10:50')) < -1000);
});

test('bekleme dakikası SUNUCU saatinden', () => {
    const [event] = buildFlow({
        rows: [row({ customer_arrived_at: `${GUN}T11:02:00` })],
        payments: [], crew: new Map(), context: new Map(), dateISO: GUN, nowMs: at('11:09'),
    });
    assert.equal(event.kind, 'arrived');
    assert.equal(event.waitMinutes, 7);
    assert.doesNotMatch(strip(read('mobile/src/lib/flowBuild.ts')), /Date\.now\(\)/);
});

test('ekran saati sunucu saati + geçen cihaz süresi', () => {
    assert.match(store, /data\.serverNow \+ \(Math\.max\(clock, data\.deviceAt\) - data\.deviceAt\)/);
    // Damgalar cihazdan değil.
    assert.match(store, /new Date\(data\.serverNow \+ \(Date\.now\(\) - data\.deviceAt\)\)\.toISOString\(\)/);
    assert.match(screen, /customer_arrived_at: stampNow\(\)/);
});

// ── Satır içeriği ───────────────────────────────────────────────────────────

test('kısmi tahsilatlar TOPLANIYOR', () => {
    const [event] = buildFlow({
        rows: [row({ status: 'completed', is_paid: true })],
        payments: [
            { reservation_id: 'r1', amount: 400, paid_at: `${GUN}T12:40:00` },
            { reservation_id: 'r1', amount: 250, paid_at: `${GUN}T12:45:00` },
        ],
        crew: new Map([['s1', 'Merve']]), context: new Map(), dateISO: GUN, nowMs: at('13:00'),
    });
    assert.equal(event.amountValue, 650);
    assert.equal(event.servedBy, 'Merve');
});

test('bilinmeyen personel AD üretmiyor', () => {
    const [event] = buildFlow({
        rows: [row({ staff_id: 'yok' })], payments: [], crew: new Map(),
        context: new Map(), dateISO: GUN, nowMs: at('10:00'),
    });
    assert.equal(event.staffName, undefined);
    assert.doesNotMatch(event.detail, /ile/);
});

test('boş bağlam A2 kartını AÇMIYOR', () => {
    const [event] = buildFlow({
        rows: [row()], payments: [], crew: new Map(),
        context: new Map([['c1', {}]]), dateISO: GUN, nowMs: at('10:00'),
    });
    assert.equal(event.context, undefined);
});

test('ciro TAHSİLATTAN, doluluk bilinmeyen paydayla hesaplanmıyor', () => {
    assert.equal(revenueOf([{ amount: 400 }, { amount: 250 }]), 650);
    assert.equal(occupancyOf([row()], null, 3), null);
    // İptal vakit almıyor: 90 dk dolu / (600 dk × 1 kişi) = %15.
    assert.equal(occupancyOf([row(), row({ id: 'r2', status: 'cancelled' })], 600, 1), 15);
});

// ── Sağlayıcı ───────────────────────────────────────────────────────────────

test('yerel dokunuş YALNIZ sunucu aynı yerdeyken geçerli', () => {
    // Sunucu ilerlediyse — bizim yazmamız ya da başka bir cihaz — gerçek o.
    assert.match(store, /return local && local\.basedOn === event\.kind \? mergeLocal\(event, local\.event\) : event;/);
    // Efektle değil türetmeyle.
    for (const block of store.split('useEffect(').slice(1)) {
        assert.doesNotMatch(block.slice(0, block.indexOf('}, [')), /setOverlay/);
    }
});

test('saniyelik pencere dayanağı KAYDIRMIYOR', () => {
    assert.match(store, /const basedOn = current\.get\(id\)\?\.basedOn \?\? serverKind\.get\(id\) \?\? null;/);
});

test('ardışık iki yazma kendi ilk yazmasına TAKILMIYOR', () => {
    // "Geldi" → "Geri al" beş saniye içinde: ikincisi eski damgayla yazılsaydı
    // kilit sıfır satır günceller ve geri alma sessizce reddedilirdi.
    assert.match(store, /const lock = local && local\.from === fromRead \? local\.to : fromRead;/);
    assert.match(store, /if \(!lock\) return \{ ok: false, kind: 'stale' \}/);
});

test('günün tarihi okuma ANINDA belirleniyor', () => {
    // Gece yarısını geçen açık ekran dünü okumaya devam etmesin.
    const body = day.slice(day.indexOf('const read = useCallback'));
    assert.match(body.slice(0, 200), /const dateISO = todayISO\(\);/);
});

test('müşteri bağlamı TEK turda', () => {
    // Randevu başına sorgu on beş randevuda otuz istek demekti.
    const src = strip(read('mobile/src/lib/managerSource.ts'));
    const fn = src.slice(src.indexOf('export async function fetchDayContext'));
    assert.match(fn.slice(0, 900), /\.in\('id', ids\)/);
    // Paketler de tek turda: ortak okuyucu kimlik listesini `.in` ile soruyor.
    assert.match(fn.slice(0, 900), /fetchPackageRows\(organizationId, ids\)/);
    const pk = src.slice(src.indexOf('export async function fetchPackageRows'));
    assert.match(pk.slice(0, 1800), /\.in\('customer_id', ids\)/);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('ekran mockDay’den TAMAMEN koptu', () => {
    assert.doesNotMatch(screen, /mockDay/);
    assert.doesNotMatch(screen, /calendarSource/);
    assert.doesNotMatch(screen, /mockSendResult/);
});

test('bilinmeyen bugün BOŞ GÜN diye çizilmiyor', () => {
    assert.match(screen, /const todayUnknown = isToday && state !== 'ok' && events\.length === 0;/);
    assert.match(screen, /const isEmptyDay = !todayUnknown && dayEvents\.length === 0;/);
    assert.match(screen, /todayUnknown && state === 'error' \? \(\s*\n\s*<DurumUnread/);
    assert.match(screen, /notMeaning="Salonun boş olduğu"/);
});

test('karşılığı olan dokunuşlar GERÇEKTEN yazılıyor', () => {
    assert.match(screen, /commit\(event, next, \{ customer_arrived_at: stampNow\(\) \}\)/);
    assert.match(screen, /commit\(event, next, \{ customer_arrived_at: null \}\)/);
    assert.match(screen, /commit\(event, next, \{ status: 'confirmed' \}\)/);
    assert.match(screen, /\{ status: 'cancelled' \}/);
});

test('yazma TUTMAZSA ekranda hiçbir şey değişmiyor', () => {
    // Önce yerel sonra yazma değil: reddedilmiş bir "Geldi"yi bir an için
    // bile göstermek, personele gitmemiş bildirimi gitmiş gibi gösterirdi.
    const fn = screen.slice(screen.indexOf('const commit = useCallback'));
    const body = fn.slice(0, fn.indexOf('}, [write, replace]);'));
    assert.ok(body.indexOf('await write(') < body.indexOf('replace(event.id, next)'));
    assert.match(body, /if \(!outcome\.ok\) \{\s*\n\s*setRefused\(outcome\);\s*\n\s*return false;/);
});

test('reddetme yazmazsa randevu OLDUĞU gibi kalıyor', () => {
    assert.match(screen, /if \(!ok\) replace\(event\.id, cleared\);/);
});

test('"Yaz" SONUÇ UYDURMUYOR — sonuç sunucunun cevabı', () => {
    // `mockSendResult` gerçek bir müşteriye gitmemiş mesajı "iletildi"
    // gösteriyordu. v2: pencere dolunca salonun hattından GERÇEKTEN gönderiliyor
    // ve kayıt satırı whatsapp-proxy'nin cevabını yazıyor.
    assert.doesNotMatch(screen, /mockSendResult/);
    assert.match(screen, /replace\(event\.id, cancelSend\(event\)\);/);
    assert.match(screen, /const inFlight = \{ \.\.\.event, sendingLeft: undefined \};\s*replace\(event\.id, inFlight\);/);
    assert.match(screen, /\.then\(\(result\) => replace\(event\.id, applySendResult\(inFlight, result\)\)\)/);
});

test('adisyon bekleyen kartta tahsilat YOK — müdür görür, telefondan tahsil etmez', () => {
    /*
     * Müdür kararı (2026-09-17): telefondan tahsilat yapılmaz. "Tahsil et"
     * Kasa'ya götürüyordu; Kasa salt okunur ve bekleyeni Akış'a geri
     * yolluyordu — basılan düğme bir döngüydü.
     */
    assert.doesNotMatch(screen, /label === 'Tahsil et'/);
    assert.doesNotMatch(screen, /pathname: '\/mudur\/cash'/);
});

test('sıradaki kartın geri sayımı SALONUN toleransıyla', () => {
    // Kart "X dk sonra gelmedi sayılır" diyor; X, akışın o randevuyu gerçekten
    // "gelmedi"ye çevireceği dakikayla aynı olmak zorunda.
    const [withSetting] = buildFlow({
        rows: [row()], payments: [], crew: new Map(), context: new Map(),
        dateISO: GUN, nowMs: at('11:10'), toleranceMin: 45,
    });
    assert.equal(withSetting.toleranceMinutes, 45);
    const [fallback] = buildFlow({
        rows: [row()], payments: [], crew: new Map(), context: new Map(),
        dateISO: GUN, nowMs: at('11:10'),
    });
    assert.equal(fallback.toleranceMinutes, NO_SHOW_AFTER_MIN);
    assert.equal(NO_SHOW_AFTER_MIN, 30);
});

test('varsayılan tolerans TEK yerde — kart ile türetme aynı sayıyı okuyor', () => {
    const src = read('mobile/src/lib/flowBuild.ts');
    assert.match(src, /export \{ DEFAULT_ARRIVAL_TOLERANCE_MIN, NO_SHOW_AFTER_MIN \} from '\.\/managerFlow\.ts';/);
    assert.doesNotMatch(src, /(DEFAULT_ARRIVAL_TOLERANCE_MIN|NO_SHOW_AFTER_MIN) = \d+/);
    // Gelmedi eşiği ile geç kayıt sınırı AYRI: eşik inince geçmişe kayıt kapanmasın.
    const flow = read('mobile/src/lib/managerFlow.ts');
    assert.match(flow, /export const NO_SHOW_AFTER_MIN = 30;/);
    assert.match(flow, /export const DEFAULT_ARRIVAL_TOLERANCE_MIN = 120;/);
    const web = read('src/lib/appointmentFlow.ts');
    assert.match(web, /export const NO_SHOW_AFTER_MIN = 30;/);
    assert.match(web, /const tol = opts\?\.toleranceMin \?\? NO_SHOW_AFTER_MIN;/);
});
