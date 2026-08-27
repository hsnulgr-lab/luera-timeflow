import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    calendarLargeTypeMetrics,
    calendarMetrics,
    display,
    embed,
} from '../mobile/src/theme/tokens.ts';

const parts = readFileSync(
    new URL('../mobile/src/components/CalendarParts.tsx', import.meta.url),
    'utf8',
);

function style(name) {
    const match = parts.match(new RegExp(`\\n    ${name}: \\{([\\s\\S]*?)\\n    \\},`));
    assert.ok(match, `${name} stili bulunamadı`);
    return match[1];
}

test('Takvim normal ölçüleri CSS seçicilerini esas alır', () => {
    assert.deepEqual(display.day, {
        fontSize: 44,
        fontWeight: '800',
        letterSpacing: -1.3,
    });
    assert.equal(display.daySmall.fontSize, 34);
    assert.equal(calendarMetrics.weekTarget, 34);
    assert.equal(calendarMetrics.weekSelected, 38);
    assert.equal(calendarMetrics.avatar, 40);
    assert.equal(calendarMetrics.liveActionHeight, 44);
});

test('büyük yazı hafta ölçüleri normal varyanttan ayrı kalır', () => {
    assert.deepEqual(calendarLargeTypeMetrics, {
        weekSelected: 56,
        weekTarget: 52,
        weekNumber: 22,
        weekNumberSelected: 24,
    });
});

test('Takvim kart ayrıntıları CSS punto ve hedef ölçülerini korur', () => {
    assert.match(parts, /nameFirst:\s*15\.5/);
    assert.match(parts, /nameLast:\s*21/);
    assert.doesNotMatch(parts, /nameSize:/);

    assert.match(style('weekNumber'), /width: calendarMetrics\.weekTarget/);
    assert.match(style('weekNumber'), /height: calendarMetrics\.weekTarget/);
    assert.match(style('weekNumber'), /borderRadius: radius\.md/);
    assert.match(parts, /hitSlop=\{space\.xs\}/);

    assert.match(style('customerGiven'), /fontSize: part\.nameFirst/);
    assert.match(style('customerGiven'), /fontWeight: '500'/);
    assert.match(style('customerGiven'), /letterSpacing: part\.nameFirst \* -0\.01/);
    assert.match(style('customerGiven'), /lineHeight: part\.nameFirst \* 1\.1/);
    assert.match(style('customerSurname'), /fontSize: part\.nameLast/);
    assert.match(style('customerSurname'), /fontWeight: '800'/);
    assert.match(style('customerSurname'), /letterSpacing: part\.nameLast \* -0\.03/);

    assert.match(style('phoneButton'), /width: part\.phoneButton/);
    assert.match(style('phoneButton'), /height: part\.phoneButton/);
    assert.match(style('phoneButton'), /borderWidth: 1\.5/);
    assert.match(parts, /hitSlop=\{\(hit\.icon - part\.phoneButton\) \/ 2\}/);
    assert.match(style('avatarText'), /fontSize: 13\.5/);
    assert.match(style('avatarText'), /fontWeight: '800'/);
});

test('canlı ve sıradaki eylemleri birbirinin puntosunu değiştirmez', () => {
    assert.match(style('liveAction'), /height: calendarMetrics\.liveActionHeight/);
    assert.match(style('liveAction'), /paddingHorizontal: 16/);
    assert.match(style('liveAction'), /borderRadius: radius\.pill/);
    assert.match(style('liveActionText'), /fontSize: 14\.5/);
    assert.match(parts, /styles\.actionText, styles\.liveActionText/);

    assert.match(style('dueAction'), /height: calendarMetrics\.dueActionHeight/);
    assert.match(style('dueAction'), /paddingHorizontal: space\.lg/);
    assert.match(style('dueAction'), /borderRadius: radius\.pill/);
    assert.match(parts, /<Text style=\{\[type\.body, styles\.actionText/);
});

test('ters gömülü yüzeylerin tema renkleri CSS ile aynıdır', () => {
    assert.equal(embed.dark.bg, '#FAF7F3');
    assert.equal(embed.light.bg, '#241E16');
    assert.equal(embed.light.tx, '#F7F2EA');
});

test('dokunulmaması istenen temel ölçüler sabit kalır', () => {
    assert.equal(display.counter.fontSize, 44);
    assert.equal(calendarMetrics.cardPadding, 18);
    assert.equal(calendarMetrics.nowHeight, 24);
    assert.equal(calendarMetrics.dueActionHeight, 40);
    assert.match(parts, /liveBar:\s*3/);
    assert.match(parts, /liveDot:\s*6/);
    assert.match(parts, /serviceSize:\s*13\.5/);
    assert.match(parts, /packageChip:\s*42/);
    assert.match(style('card'), /borderRadius: radius\.xl/);
    assert.match(style('summary'), /padding: space\.md/);
    assert.match(style('summary'), /borderRadius: radius\.lg/);
    assert.match(style('nowText'), /fontSize: 13/);
});

test('ay ızgarası CSS ölçülerini birebir taşır', () => {
    // Tasarım: .mcell 52 / radius 14 · .mcell b 16/700 · .mdots i 4 ·
    // .mhead span 11/700/+.06em · .month padding 8 12 14 · .mfoot .grab 44/14.
    assert.equal(calendarMetrics.monthCell, 52);
    assert.match(parts, /monthPageX:\s*12/);
    assert.match(parts, /monthHead:\s*11/);
    assert.match(parts, /monthNumber:\s*16/);
    assert.match(parts, /monthDot:\s*4/);
    assert.match(parts, /monthFooterLabel:\s*14/);

    assert.match(style('monthCell'), /height: calendarMetrics\.monthCell/);
    assert.match(style('monthCell'), /borderRadius: radius\.md/);
    assert.match(style('monthCell'), /gap: 4/);
    assert.match(style('monthNumber'), /fontSize: part\.monthNumber/);
    assert.match(style('monthNumber'), /fontWeight: '700'/);
    assert.match(style('monthHeadLabel'), /letterSpacing: part\.monthHead \* 0\.06/);
    // Büyütme STİLDE değil metin katmanında: `textTransform` Türkçe bilmiyor,
    // "i" harfini "I" yapıyor. Yerel duyarlı `upperTR` kullanılıyor.
    assert.match(parts, /\{upperTR\(label\)\}/);
    assert.match(style('monthDots'), /gap: 2/);
    assert.match(style('monthDots'), /height: 5/);
    assert.match(style('monthFooterButton'), /height: hit\.icon/);
    assert.match(style('monthFooterButton'), /borderRadius: radius\.md/);
});

test('ay ızgarasının yoğunluk noktaları üç kademelidir', () => {
    // 1 randevu tek soluk nokta, 2 randevu iki soluk, 3+ ÜÇ TURUNCU nokta.
    // Rakam yazılmaz: ızgarada sayı okumak yoğunluğu görmekten yavaştır.
    // `known` kapısı: sayı BİLİNMİYORSA nokta hiç çizilmez (bkz. bilinmeyen
    // gün ≠ boş gün).
    assert.match(parts, /const dense = known && count >= 3;/);
    assert.match(parts, /const dots = known \? Math\.min\(3, count\) : 0;/);
    assert.match(parts, /backgroundColor: dense \? c\.or : c\.tx3/);
});
