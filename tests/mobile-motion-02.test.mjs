import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const calendar = readFileSync(
    new URL('../mobile/app/(staff)/calendar.tsx', import.meta.url),
    'utf8',
);
const tabs = readFileSync(
    new URL('../mobile/app/(staff)/_layout.tsx', import.meta.url),
    'utf8',
);

test('hareket 02 başlık eşikleri sözleşmedeki scroll aralıklarını kullanır', () => {
    assert.match(calendar, /inputRange: \[0, 48\],[\s\S]*?outputRange: \[1, 0\]/);
    assert.match(calendar, /inputRange: \[32, 64\],[\s\S]*?outputRange: \[0, 1\]/);
    assert.match(calendar, /inputRange: \[32, 64\],[\s\S]*?outputRange: \[6, 0\]/);
    assert.match(calendar, /inputRange: \[0, 24\],[\s\S]*?outputRange: \[0, 1\]/);
    assert.match(calendar, /inputRange: \[0, 64\],[\s\S]*?outputRange: \[1, 0\]/);
    assert.doesNotMatch(calendar, /63\.99/);
});

test('native tab bar kaydırılabilir görünümü bulur ve hafta yapışmaz', () => {
    assert.match(calendar, /collapsable=\{false\}/);
    assert.ok(
        calendar.indexOf('<Animated.ScrollView') < calendar.indexOf('<LinearGradient'),
        'ScrollView native hiyerarşide parıltı ve üst çubuktan önce gelmeli',
    );
    assert.doesNotMatch(calendar, /stickyHeaderIndices/);
    assert.match(tabs, /minimizeBehavior="onScrollDown"/);
});
