import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    DRAG_BANNER_RESERVE, DRAG_EDGE_MAX_STEP, DRAG_EDGE_ZONE, edgeStep,
} from '../mobile/src/lib/managerCalendar.ts';

/**
 * MÜDÜR TAKVİMİ · İLERİ SAATE TAŞINAMIYORDU (2026-09-17, telefon).
 *
 * İki kusur üst üsteydi:
 *   1. Izgara randevulara göre DARALIYORDU — tek randevulu günde 07–09.
 *   2. Blok kalkınca kaydırıcılar kilitleniyor ve kenarda KAYDIRMA YOKTU:
 *      ekrana sığmayan bir saate ya da ekran dışındaki personelin sütununa
 *      tek hamlede taşımak imkânsızdı.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// ── Kenar hesabı ────────────────────────────────────────────────────────────

test('ortada kaydırma YOK', () => {
    assert.equal(edgeStep(400, 100, 800), 0);
});

test('alt kenara yaklaşınca İLERİ, üst kenara yaklaşınca GERİ kayar', () => {
    assert.ok(edgeStep(790, 100, 800) > 0);
    assert.ok(edgeStep(110, 100, 800) < 0);
});

test('kenara ne kadar yakınsa o kadar HIZLI', () => {
    const enter = edgeStep(800 - DRAG_EDGE_ZONE + 4, 100, 800);
    const deep = edgeStep(800 - 4, 100, 800);
    assert.ok(deep > enter, `${deep} > ${enter}`);
    assert.equal(edgeStep(900, 100, 800), DRAG_EDGE_MAX_STEP, 'kenarın ötesi en hızlı, daha fazla değil');
    assert.equal(edgeStep(-50, 100, 800), -DRAG_EDGE_MAX_STEP);
});

test('bölgeye giren parmak en az bir punto ilerletiyor', () => {
    assert.equal(edgeStep(800 - DRAG_EDGE_ZONE + 0.1, 100, 800), 1);
});

test('henüz kıpırdanmamış parmak (NaN) ve minik alan kaydırmıyor', () => {
    assert.equal(edgeStep(Number.NaN, 100, 800), 0);
    assert.equal(edgeStep(105, 100, 100 + DRAG_EDGE_ZONE * 2), 0);
});

// ── Bileşen ─────────────────────────────────────────────────────────────────

const grid = code('src/components/ColumnCalendar.tsx');

test('blok kalkınca kenar döngüsü BAŞLIYOR, bırakınca DURUYOR', () => {
    const begin = grid.slice(grid.indexOf('const beginLift'), grid.indexOf('const dragMove'));
    assert.match(begin, /loop\.current = setInterval\(edgeTick, 16\);/);
    assert.match(begin, /measureInWindow/);
    const end = grid.slice(grid.indexOf('const endDrag'), grid.indexOf('const onVScroll'));
    assert.match(end, /stopLoop\(\);/);
    // Ekrandan çıkınca da döngü kalmıyor.
    assert.match(grid, /useEffect\(\(\) => stopLoop, \[stopLoop\]\);/);
});

test('ızgara kayınca blok parmağın ALTINDA kalıyor — hedef de aynı ötelemeyle', () => {
    const apply = grid.slice(grid.indexOf('const applyDrag'), grid.indexOf('const edgeTick'));
    assert.match(apply, /const dx = d\.dx \+ \(m\.hOffset - d\.hStart\);/);
    assert.match(apply, /const dy = d\.dy \+ \(m\.vOffset - d\.vStart\);/);
    assert.match(apply, /pan\.setValue\(\{ x: dx, y: dy \}\);/);
    assert.match(apply, /resolveTarget\(\{[\s\S]*?dx,\s*dy,/);
});

test('İKİ eksen de kayıyor — ileri saat VE ekran dışındaki personel', () => {
    const tick = grid.slice(grid.indexOf('const edgeTick'), grid.indexOf('const stopLoop'));
    assert.match(tick, /vScrollRef\.current\?\.scrollTo\(\{ y: Math\.max\(0, m\.vOffset \+ vStep\), animated: false \}\)/);
    assert.match(tick, /hScrollRef\.current\?\.scrollTo\(\{ x: Math\.max\(0, m\.hOffset \+ hStep\), animated: false \}\)/);
});

test('ALT ve SAĞ kenar ölçüme bağlı DEĞİL — ekranın kendisinden', () => {
    /*
     * İlk sürüm kenarları ve içerik yüksekliğini ölçüyordu; ölçüm gelmeyince
     * hiç kaydırmıyordu (2026-09-17: blok parmağı izliyor, ızgara duruyor).
     */
    const tick = grid.slice(grid.indexOf('const edgeTick'), grid.indexOf('const stopLoop'));
    assert.match(tick, /screen\.height - calendarMetrics\.bottomInset - DRAG_BANNER_RESERVE/);
    assert.match(tick, /edgeStep\(d\.pageX, m\.rootX \+ HOURS_WIDTH, screen\.width\)/);
    // Sınırı kaydırıcının kendisi koyuyor; JS'te içerik yüksekliği tahmini YOK.
    assert.doesNotMatch(grid, /onContentSizeChange|vContent|hViewport/);
    // Ölçülen görünüm düzleştirilemez.
    assert.match(grid, /<View ref=\{rootRef\} collapsable=\{false\}/);
});

test('konum kaydırıcının OLAYINDAN — kaydığı karede blok parmağın altında', () => {
    const v = grid.slice(grid.indexOf('const onVScroll'), grid.indexOf('const onHScroll'));
    assert.match(v, /metrics\.current\.vOffset = event\.nativeEvent\.contentOffset\.y;/);
    assert.match(v, /if \(liveState\.current\) applyDrag\(\);/);
    const h = grid.slice(grid.indexOf('const onHScroll'), grid.indexOf('const banner'));
    assert.match(h, /metrics\.current\.hOffset = event\.nativeEvent\.contentOffset\.x;/);
    assert.match(h, /if \(liveState\.current\) applyDrag\(\);/);
});

test('parmağın EKRAN konumu bloğun jestinden geliyor', () => {
    assert.match(grid, /onDragMove\(gesture\.dx, gesture\.dy, gesture\.moveX, gesture\.moveY\)/);
    // Kaydırıcılar konumlarını bildiriyor; yoksa kenar hesabı kör kalırdı.
    assert.match(grid, /ref=\{vScrollRef\}[\s\S]{0,400}onScroll=\{onVScroll\}/);
    assert.match(grid, /ref=\{hScrollRef\}[\s\S]{0,300}onScroll=\{onHScroll\}/);
});

// ── Saat aralığı ekrana ve menüye bağlı ─────────────────────────────────────

test('takvim ızgarayı SALONUN saatleriyle çiziyor', () => {
    const screen = code('app/mudur/calendar.tsx');
    assert.match(screen, /hourRange\(appointments, data\.open\)/);
    const day = code('src/lib/managerCalendarDay.ts');
    // Salon + personel saatleri — randevu oluşturmanın boş saat kaynağıyla aynı.
    assert.match(day, /const open = dayWindowOf\(/);
    // Saat okunamazsa takvim "okunamadı"ya düşmüyor.
    assert.match(day, /fetchHoursRow\(\)\.catch\(\(\) => null\)/);
});

test('taşıma menüsü de AYNI saatleri listeliyor — üç yerden', () => {
    const parts = code('src/components/MoveParts.tsx');
    assert.match(parts, /excludeId: appointment\.id,\s*\n\s*hours,/);
    assert.match(code('app/mudur/calendar.tsx'), /day=\{appointments\}\s*\n\s*hours=\{data\.open\}/);
    assert.match(code('app/(manager-flow)/randevu/[id].tsx'), /day=\{data\.dayRows\}\s*\n\s*hours=\{data\.open\}/);
    assert.match(code('app/(manager-flow)/personel/[id].tsx'), /openHours=\{data\.open\}/);
    assert.match(code('src/components/StaffDay.tsx'), /hours=\{openHours\}/);
});

// ── Kararlılık: sürükleme yarıda düşmüyor ───────────────────────────────────

test('blok havadayken sahipliği BIRAKMIYOR', () => {
    // Varsayılan "evet": kaydırıcı dokunuşu istediğinde blok veriyor ve
    // sürükleme parmak ekrandayken bitiyordu.
    assert.match(grid, /onPanResponderTerminationRequest: \(\) => !liftedRef\.current,/);
});

test('iOS kaydırıcısı havadaki bloğun dokunuşunu İPTAL EDEMİYOR', () => {
    assert.equal((grid.match(/canCancelContentTouches=\{!lifted\}/g) ?? []).length, 2);
});

test('"havada" bayrağı uzun basışta HEMEN kalkıyor — çizimi beklemiyor', () => {
    const long = grid.slice(grid.indexOf('onLongPress={() => {'), grid.indexOf('onPressOut='));
    assert.match(long, /liftedRef\.current = true;\s*\n\s*onLift\(appointment, index\);/);
    // Ama personel takviminde (salt okunur) kalkmıyor.
    assert.ok(long.indexOf('if (!onLift) return;') < long.indexOf('liftedRef.current = true;'));
});

test('takvim yenilense de sürükleme tutamağı DEĞİŞMİYOR', () => {
    // Gün verisi bağımlılık olsaydı 25 sn'lik yoklama taşımanın ortasında
    // bloğun jest tutucusunu yeniden kurardı.
    const apply = grid.slice(grid.indexOf('const applyDrag'), grid.indexOf('const edgeTick'));
    assert.match(apply, /\}, \[pan\]\);/);
    assert.match(apply, /appointments: input\.appointments,/);
    assert.match(grid, /const dragMove = useCallback\([\s\S]*?\}, \[applyDrag\]\);/);
    assert.match(grid, /const endDrag = useCallback\([\s\S]*?\}, \[pan, stopLoop\]\);/);
    assert.match(grid, /inputs\.current\.onMove\?\.\(current\.appointment, landing\)/);
});

// ── Son saatler sekme çubuğunun üstüne çıkıyor (2026-09-17, telefon) ────────

test('ızgaranın altında sekme çubuğu kadar PAY var', () => {
    // Pay yokken en sona kaydırılmış gün bile 17:00'yi çubuğun arkasında
    // bırakıyordu: oraya ne dokunulabiliyor ne randevu taşınabiliyordu.
    assert.match(grid, /contentContainerStyle=\{\{ flexDirection: 'row', paddingBottom: calendarMetrics\.bottomInset \}\}/);
});

test('kaydırma bölgesi TURUNCU BANDIN üstünde başlıyor', () => {
    /*
     * Bant sekme çubuğunun üstünde duruyor ve müdür parmağını onun ÜSTÜNDE
     * tutuyor. Bölge bandın altındaydı; parmak hiç girmiyordu.
     *
     * 932 pt'lik ekranda (sekme payı 118): bant üstü 742, bölge 646'da başlıyor.
     * Ekran görüntüsündeki parmak (~757 pt) artık en hızlı kaydırmada.
     */
    const H = 932;
    const bottom = H - 118 - DRAG_BANNER_RESERVE;
    assert.ok(bottom - DRAG_EDGE_ZONE <= 660, 'bölge bandın epey üstünde başlamalı');
    assert.equal(edgeStep(757, 245, bottom), DRAG_EDGE_MAX_STEP);
    assert.ok(edgeStep(700, 245, bottom) > 0, 'bandın hemen üstü de kaydırıyor');
    assert.equal(edgeStep(500, 245, bottom), 0, 'ızgaranın ortası kaydırmıyor');
});

