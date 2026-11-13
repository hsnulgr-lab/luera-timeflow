/**
 * BEKLEME SAYACI — Dinamik Ada + kilit ekranı (Live Activity), 1. aşama
 * yalnız YEREL (2026-11-12).
 *
 * Kullanıcı kararı: boya beklerken kalan süre kilit ekranında ve Dinamik
 * Ada'da canlı görünsün. Bekleme kurulunca başlıyor, bitiş değişince
 * güncelleniyor, bekleme kalkınca / iş bitince / süresi geçince / çıkışta
 * bitiyor. Expo Go'da ve Android'de özellik yok ve uygulama ÇÖKMÜYOR.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
    WAIT_ACTIVITY_NAME, firstNameOf, waitActivitiesToEnd, waitActivityDue, waitActivityProps,
    waitActivityStep, waitActivityTarget, waitActivityUrl, waitTapMove, markKumandaOnTop, kumandaOnTopId,
} from '../mobile/src/lib/waitActivity.ts';
import { waitAlarmData, waitAlarmText } from '../mobile/src/lib/waitAlarm.ts';
import { pushTargetOf } from '../mobile/src/lib/pushRoute.ts';

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const ID = '0b6c1f8e-3a2d-4e5f-9a7b-1c2d3e4f5a6b';
const ID2 = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const NOW = 1_800_000_000_000;

test('kilit ekranında yalnız İLK AD — bekleme bildirimiyle aynı kural', () => {
    assert.equal(firstNameOf('Tuğçe Erden'), 'Tuğçe');
    assert.equal(firstNameOf('  Ayşe   Nur Kaya '), 'Ayşe');
    assert.equal(firstNameOf('   '), 'Müşteri');
    for (const name of ['Tuğçe Erden', '  ', 'Deniz']) {
        assert.equal(waitAlarmText({ customerName: name, service: 'Boya', minutes: 30 }).body.split(' · ')[0], firstNameOf(name));
    }
    const props = waitActivityProps({ customerName: 'Tuğçe Erden', service: ' Kalıcı Makyaj ', endsAt: NOW + 30 * 60_000, minutes: 30 });
    assert.deepEqual(props, {
        name: 'Tuğçe', service: 'Kalıcı Makyaj', startsAt: NOW, endsAt: NOW + 30 * 60_000, minutes: 30,
    });
    // Soyad props'a hiç girmiyor.
    assert.doesNotMatch(JSON.stringify(props), /Erden/);
});

test('başlangıç bitişten geri sayılıyor: sunucunun saati benimsenince süre aynı kalıyor', () => {
    const local = waitActivityProps({ customerName: 'A', service: 'B', endsAt: NOW + 20 * 60_000, minutes: 20 });
    const server = waitActivityProps({ customerName: 'A', service: 'B', endsAt: NOW + 20 * 60_000 + 4_000, minutes: 20 });
    assert.equal(local.endsAt - local.startsAt, server.endsAt - server.startsAt);
});

test('başlat / güncelle / bitir kararı — randevu başına TEK etkinlik', () => {
    const next = { endsAt: NOW + 30 * 60_000, minutes: 30 };
    const current = { props: { name: 'A', service: 'B', startsAt: NOW, endsAt: next.endsAt, minutes: 30 } };
    // Bitiş gelecekte, etkinlik yok → başlat.
    assert.equal(waitActivityStep(null, next, NOW), 'start');
    // Aynısı → dokunma.
    assert.equal(waitActivityStep(current, next, NOW), 'none');
    // Sunucunun saati ya da yeni bekleme → güncelle (ikinci etkinlik açılmıyor).
    assert.equal(waitActivityStep(current, { ...next, endsAt: next.endsAt + 3_000 }, NOW), 'update');
    assert.equal(waitActivityStep(current, { endsAt: NOW + 45 * 60_000, minutes: 45 }, NOW), 'update');
    // Bekleme kalktı / süresi geçti → bitir; zaten yoksa hiçbir şey.
    assert.equal(waitActivityStep(current, null, NOW), 'end');
    assert.equal(waitActivityStep(current, { ...next, endsAt: NOW - 1 }, NOW), 'end');
    assert.equal(waitActivityStep(null, null, NOW), 'none');
    assert.equal(waitActivityStep(null, { ...next, endsAt: NOW + 500 }, NOW), 'none');
    // Eşik bildirimle aynı: en az bir saniye.
    assert.equal(waitActivityDue(NOW + 1000, NOW), true);
    assert.equal(waitActivityDue(NOW + 999, NOW), false);
    assert.equal(waitActivityDue(Number.NaN, NOW), false);
});

test('açılış adresi: dokununca O İŞİN kumandası — bekleme bildirimiyle BİREBİR aynı hedef', () => {
    for (const actor of ['staff', 'solo']) {
        const url = waitActivityUrl(ID, '2026-11-12', actor);
        assert.match(url, /^luera:\/\/bekleme\?/);
        const target = waitActivityTarget(url);
        assert.deepEqual(target, { href: pushTargetOf(waitAlarmData(ID, '2026-11-12'), actor), actor, id: ID });
    }
    assert.equal(waitActivityTarget(waitActivityUrl(ID, '2026-11-12', 'solo')).href, `/kumanda?id=${ID}&from=tek&date=2026-11-12`);
    assert.equal(waitActivityTarget(waitActivityUrl(ID, '2026-11-12', 'staff')).href, `/kumanda?id=${ID}&date=2026-11-12`);
    // Bozuk tarih taşınmıyor.
    assert.equal(waitActivityTarget(waitActivityUrl(ID, 'dün', 'staff')).href, `/kumanda?id=${ID}`);
    // Üç eğik çizgili biçim de tanınıyor.
    assert.equal(waitActivityTarget(`luera:///bekleme?id=${ID}&kim=personel`).href, `/kumanda?id=${ID}`);
});

test('başka adresler dokunulmadan geçiyor; uydurma kimlik ekrana gitmiyor', () => {
    for (const url of [null, undefined, '', '/', 'luera://', 'luera:///', '/kumanda?id=x', 'exp://192.168.1.2:8081/--/',
        'com.googleusercontent.apps.1:/oauth2redirect', 'luera://bekleme?id=../../mudur', 'luera://bekleme?id=%E0%A4%A',
        'https://lueratech.com/bekleme?id=' + ID]) {
        assert.equal(waitActivityTarget(url), null, String(url));
    }
});

test('mutabakat: liste OKUNMADIYSA yalnız sahipsiz ve süresi geçmiş olanlar biter', () => {
    const live = (id, endsAt) => ({ activityId: `a-${id}`, reservationId: id, props: { name: 'A', service: 'B', startsAt: endsAt - 60_000, endsAt, minutes: 1 } });
    const records = [live(ID, NOW + 10 * 60_000), live(ID2, NOW - 1)];
    assert.deepEqual(waitActivitiesToEnd(['a-' + ID, 'a-' + ID2, 'yabanci'], records, null, NOW), ['a-' + ID2, 'yabanci']);
});

test('mutabakat: okunmuş günde randevu yoksa ya da beklemesi kalktıysa biter', () => {
    const rec = (activityId, id, endsAt) => ({ activityId, reservationId: id, props: { name: 'A', service: 'B', startsAt: endsAt - 60_000, endsAt, minutes: 1 } });
    const endsAt = NOW + 10 * 60_000;
    const records = [rec('a1', ID, endsAt), rec('a2', ID2, endsAt)];
    // İkisi de sürüyor → hiçbiri bitmiyor.
    assert.deepEqual(waitActivitiesToEnd(['a1', 'a2'], records, [{ reservationId: ID, endsAt }, { reservationId: ID2, endsAt }], NOW), []);
    // İki bekleme aynı anda: biri başka cihazdan kaldırıldı → yalnız o.
    assert.deepEqual(waitActivitiesToEnd(['a1', 'a2'], records, [{ reservationId: ID, endsAt }, { reservationId: ID2, endsAt: null }], NOW), ['a2']);
    // Randevu listede yok (silindi, başkasına geçti) → biter.
    assert.deepEqual(waitActivitiesToEnd(['a1', 'a2'], records, [{ reservationId: ID, endsAt }], NOW), ['a2']);
    // Gün boş okundu → hepsi.
    assert.deepEqual(waitActivitiesToEnd(['a1', 'a2'], records, [], NOW), ['a1', 'a2']);
    // Listede bekleme süresi geçmiş → biter.
    assert.deepEqual(waitActivitiesToEnd(['a1'], records, [{ reservationId: ID, endsAt: NOW - 5 }], NOW), ['a1']);
});

test('mutabakat: aynı randevuya iki etkinlik (yarış) — biri kalıyor', () => {
    const endsAt = NOW + 60_000 * 5;
    const records = [
        { activityId: 'a1', reservationId: ID, props: { name: 'A', service: 'B', startsAt: NOW, endsAt, minutes: 5 } },
        { activityId: 'a2', reservationId: ID, props: { name: 'A', service: 'B', startsAt: NOW, endsAt, minutes: 5 } },
    ];
    assert.deepEqual(waitActivitiesToEnd(['a1', 'a2'], records, null, NOW), ['a2']);
});

// ── Sözleşmeler ──────────────────────────────────────────────────────────────

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
}
const mobileRoot = new URL('../mobile/', import.meta.url).pathname;
const sources = [...walk(join(mobileRoot, 'app')), ...walk(join(mobileRoot, 'src'))]
    .map((file) => ({ file: file.slice(mobileRoot.length), text: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') }));

test('dinamik import YOK (2026-09-25 mağaza paketi dersi)', () => {
    for (const p of ['src/lib/waitActivity.ts', 'src/lib/waitActivityDevice.ts', 'src/lib/waitActivityView.tsx', 'app/+native-intent.tsx']) {
        assert.doesNotMatch(code(p), /\bimport\s*\(/, p);
    }
});

test('Expo Go / Android koruması: yerel modül zorunlu tutulan paketler yalnız korumalı require ile', () => {
    // expo-widgets ve @expo/ui modül yüklenirken `requireNativeModule` çağırıyor.
    const native = readFileSync(new URL('../mobile/node_modules/expo-widgets/build/ExpoWidgets.native.js', import.meta.url), 'utf8');
    assert.match(native, /requireNativeModule\('ExpoWidgets'\)/);

    // Değer olarak içe aktaranlar yalnız görünümler (bekleme sayacı + 144'ün
    // "Müşteri bekliyor"u); onları da kimse `import` etmiyor.
    for (const { file, text } of sources) {
        if (file === 'src/lib/waitActivityView.tsx' || file === 'src/lib/arrivalActivityView.tsx') continue;
        assert.doesNotMatch(text, /import\s+(?!type\b)[^;]*from\s+'(expo-widgets|@expo\/ui[^']*)'/, file);
        assert.doesNotMatch(text, /from\s+'[^']*waitActivityView'/, file);
    }

    const device = code('src/lib/waitActivityDevice.ts');
    assert.match(device, /import type \{ LiveActivity, LiveActivityFactory \} from 'expo-widgets';/);
    assert.match(device, /if \(Platform\.OS !== 'ios'\) return null;/);
    assert.match(device, /Number\.parseFloat\(String\(Platform\.Version\)\) < MIN_IOS/);
    // Önce varlık (fırlatmayan), sonra eşzamanlı require — try/catch içinde.
    assert.match(device, /try \{\s*if \(!requireOptionalNativeModule\('ExpoWidgets'\) \|\| !requireOptionalNativeModule\('ExpoUI'\)\) return null;[\s\S]{0,200}require\('\.\/waitActivityView'\)[\s\S]{0,120}\} catch/);
    assert.equal((device.match(/require\(/g) || []).length, 1);
    // Kurulamazsa her iş boş dönüyor; hata kullanıcıya düşmüyor.
    assert.match(device, /if \(!factory\) return Promise\.resolve\(\);/);
    assert.doesNotMatch(device, /Alert|throw /);
});

test('görünüm: widget yönergesi, sistem sayacı, ilk ad, emoji yok', () => {
    const view = read('src/lib/waitActivityView.tsx');
    assert.match(view, /function BeklemeSayaci\(props: WaitActivityProps, environment: LiveActivityEnvironment\) \{\s*'widget';/);
    assert.match(view, new RegExp(`createLiveActivity<WaitActivityProps>\\('${WAIT_ACTIVITY_NAME}', BeklemeSayaci\\)`));
    for (const region of ['banner', 'compactLeading', 'compactTrailing', 'minimal', 'expandedLeading', 'expandedTrailing', 'expandedBottom']) {
        assert.match(view, new RegExp(`\\b${region}:`), region);
    }
    assert.match(view, /<Text timerInterval=\{range\} countsDown/);
    assert.match(view, /<ProgressView timerInterval=\{range\} countsDown/);
    assert.match(view, /monospacedDigit\(\)/);
    assert.match(view, /<Text modifiers=\{\[hidden\(\)\]\}>\{widest\}<\/Text>/);
    assert.match(view, /environment\.isLuminanceReduced/);
    assert.match(view, /'#FF5A1F'/);
    assert.match(view, />Bekleme</);
    // Soyad hiç gelmiyor: görünüm yalnız props.name (ilk ad) okuyor.
    assert.doesNotMatch(view, /customer_name|customerName/);
    assert.doesNotMatch(view, /\p{Extended_Pictographic}/u);
    // Uzantı fonksiyonun dışını görmüyor: renk sabitleri gövdenin İÇİNDE.
    const body = view.slice(view.indexOf("'widget';"));
    assert.match(body, /const accent = /);
});

test('app.json: Live Activity için widgets[] YOK; sık güncelleme kapalı (itme 144 ile AÇIK)', () => {
    const app = JSON.parse(read('app.json'));
    const entry = app.expo.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-widgets');
    assert.ok(Array.isArray(entry), 'expo-widgets eklentisi');
    assert.equal(entry[1].widgets, undefined);
    // 144 · "Müşteri bekliyor" sunucudan başlatılıyor (push-to-start).
    assert.equal(entry[1].enablePushNotifications, true);
    assert.equal(entry[1].frequentUpdates, false);
    assert.equal(entry[1].bundleIdentifier, 'ai.luera.timeflow.ExpoWidgetsTarget');
    assert.equal(entry[1].groupIdentifier, 'group.ai.luera.timeflow');
    // NSSupportsLiveActivities'i eklentinin kendisi yazıyor.
    const plist = readFileSync(new URL('../mobile/node_modules/expo-widgets/plugin/build/ios/withAppInfoPlist.js', import.meta.url), 'utf8');
    assert.match(plist, /infoPlist\.NSSupportsLiveActivities = true;/);
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.dependencies['expo-widgets']);
    assert.ok(pkg.dependencies['@expo/ui']);
});

test('kiracı sınırı: çıkışta / işletme değişiminde bütün sayaçlar bitiyor; kanca açılışta kurulu', () => {
    const device = code('src/lib/waitActivityDevice.ts');
    assert.match(device, /onTenantReset\(\(\) => \{ void endAllWaitActivities\(\); \}\);/);
    assert.match(code('app/_layout.tsx'), /import '\.\.\/src\/lib\/waitActivityDevice';/);
    // Kilit ekranından HEMEN kalksın.
    assert.match(device, /\.end\('immediate'\)/);
});

test('kumanda: kurulunca başlıyor, sunucu saatine çekiliyor; kaldırılınca ve bitince bitiyor', () => {
    const kumanda = code('app/(staff-flow)/kumanda.tsx');
    assert.match(kumanda, /void armWaitAlarm\(\{ \.\.\.alarm, endsAt \}\);[\s\S]{0,400}void startWaitActivity\(\{ \.\.\.activity, endsAt \}\);/);
    assert.match(kumanda, /void armWaitAlarm\(\{ \.\.\.alarm, endsAt: serverEnds \}\);\s*void startWaitActivity\(\{ \.\.\.activity, endsAt: serverEnds \}\);/);
    assert.match(kumanda, /actor: params\.from === 'tek' \? 'solo' as const : 'staff' as const/);
    assert.equal((kumanda.match(/endWaitActivity\(appointment\.id\)/g) || []).length, 2);
    assert.match(kumanda, /setEndedAt\(new Date\(\)\.toISOString\(\)\);[\s\S]{0,300}void endWaitActivity\(appointment\.id\);/);
    // Açılınca süresi geçmiş sayaç temizleniyor.
    assert.match(kumanda, /useEffect\(\(\) => \{ void reconcileWaitActivities\(null\); \}, \[\]\);/);
});

test('mutabakat günün OKUNMUŞ listesiyle — yeni istek yok, yalnız bugün ve yalnız taze okuma', () => {
    const staff = code('app/personel/index.tsx');
    assert.match(staff, /const dayWaitsKey = agendaState === 'ok' && isToday/);
    const solo = code('app/tek/index.tsx');
    assert.match(solo, /const dayWaitsKey = dayKnown && isToday/);
    for (const screen of [staff, solo]) {
        assert.match(screen, /void reconcileWaitActivities\(JSON\.parse\(dayWaitsKey\) as DayWait\[\]\)/);
    }
    // Personelin satırı beklemeyi artık taşıyor (sunucu zaten gönderiyordu).
    assert.match(code('src/lib/agendaSource.ts'), /wait_ends_at: appointment\.wait_ends_at \?\? null,/);
});

test('+native-intent: yalnız bekleme bağlantısı; soğuk açılışta bildirimle aynı niyet yolu', () => {
    const intent = code('app/+native-intent.tsx');
    assert.match(intent, /const target = waitActivityTarget\(path\)(?: \?\? arrivalActivityTarget\(path\))?;\s*if \(!target\) return path;/);
    assert.match(intent, /if \(initial\) \{\s*rememberIntent\(\{ href: target\.href, actor: target\.actor, at: Date\.now\(\) \}\);\s*return '\/';/);
    assert.match(intent, /catch \{\s*return path;\s*\}/);
});

test('sayaca dokunuş: önde kumanda varken yenisi üstüne binmez (telefon bulgusu 2026-11-12)', () => {
    assert.equal(waitTapMove(null, ID), 'push');
    assert.equal(waitTapMove(ID, ID), 'stay');
    assert.equal(waitTapMove('baska', ID), 'replace');
    const off = markKumandaOnTop(ID);
    assert.equal(kumandaOnTopId(), ID);
    const offOther = markKumandaOnTop('baska');
    off(); // eski ekranın temizliği yenisini silmez
    assert.equal(kumandaOnTopId(), 'baska');
    offOther();
    assert.equal(kumandaOnTopId(), null);
    const intent = code('app/+native-intent.tsx');
    assert.match(intent, /waitTapMove\(kumandaOnTopId\(\), target\.id\)/);
    assert.match(intent, /router\.replace\(target\.href/);
    assert.match(code('app/(staff-flow)/kumanda.tsx'), /useFocusEffect\(useCallback\(\(\) => markKumandaOnTop\(params\.id\)/);
});

test('kilit ekranı kartı her zaman koyu zemin + açık yazı', () => {
    const view = code('src/lib/waitActivityView.tsx');
    assert.match(view, /activityBackgroundTint\(ground\)/);
    assert.doesNotMatch(view, /colorScheme/);
});
