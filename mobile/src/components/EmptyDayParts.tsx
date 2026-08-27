import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import type { DayPedal, EmptyDayCopy } from '../lib/emptyDay';
import { hourRailRows } from '../lib/emptyDay';
import {
    emptyDayMetrics,
    emptyDayMotion,
    font,
    radius,
    skeletonMetrics,
    useTheme,
} from '../theme';

/**
 * Müdür 22 — boş günün parçaları.
 *
 * Üç ayrı çıkış, üç mesafeden: cetvel (levhada, "neredeyim?"), gün pedalı
 * (başparmakta, "şimdi ne yapayım?") ve yatay kaydırma ("hızlı geç").
 * Hiçbiri diğerinin ön koşulu değil — biri kaybolursa ekran hâlâ terk
 * edilebilir.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 22 Bos Gun.html`.
 */

const IN = Easing.bezier(0.2, 0.8, 0.25, 1);
const OUT = Easing.bezier(0.4, 0, 1, 1);

// ── Boş hâl bloğu ───────────────────────────────────────────────────────────

/**
 * Gün değişiminde cümle YATAY takas edilir, çapraz soldurulmaz: yön bilgisini
 * hareketin kendisi taşır. Gidiş yönü `direction` ile gelir (+1 ileri).
 */
export function useVoidSwap(key: string, direction: number, reduceMotion: boolean) {
    const shift = useRef(new Animated.Value(0)).current;
    const first = useRef(true);

    useEffect(() => {
        if (first.current) { first.current = false; return; }
        if (reduceMotion) { shift.setValue(0); return; }
        const from = direction >= 0 ? 1 : -1;
        shift.setValue(from);
        Animated.timing(shift, {
            toValue: 0,
            duration: emptyDayMotion.slide.in,
            delay: emptyDayMotion.slide.delay,
            easing: IN,
            useNativeDriver: true,
        }).start();
    }, [key, direction, reduceMotion, shift]);

    return {
        opacity: shift.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [0, 1, 0],
        }),
        translateX: shift.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-emptyDayMotion.slide.shift, 0, emptyDayMotion.slide.shift],
        }),
    };
}

export function VoidBlock({ copy, isToday, nowMinutes, entering }: {
    copy: EmptyDayCopy;
    isToday: boolean;
    nowMinutes: number;
    entering?: { opacity: Animated.AnimatedInterpolation<number>; translateX: Animated.AnimatedInterpolation<number> };
}) {
    const { c } = useTheme();

    return (
        <Animated.View
            accessible
            accessibilityLabel={copy.spoken}
            accessibilityLiveRegion="polite"
            style={{
                alignItems: 'center',
                paddingHorizontal: emptyDayMetrics.padX,
                opacity: entering?.opacity ?? 1,
                transform: entering ? [{ translateX: entering.translateX }] : undefined,
            }}
        >
            {/* Etiket — günü sınıflar. Renk ve nokta TEK BAŞINA anlam taşımaz;
                BOŞ, BUGÜN, İLERİDEKİ GÜN kelimeleri yazılı. */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: emptyDayMetrics.labelGap,
            }}>
                {copy.dot ? (
                    <View style={{
                        width: emptyDayMetrics.dot,
                        height: emptyDayMetrics.dot,
                        borderRadius: radius.pill,
                        backgroundColor: c.or,
                    }} />
                ) : null}
                <Text style={{
                    color: c.tx3,
                    fontSize: emptyDayMetrics.label,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: emptyDayMetrics.label * emptyDayMetrics.labelTrack,
                }}>
                    {copy.label}
                </Text>
            </View>

            <Text numberOfLines={2} style={{
                marginTop: emptyDayMetrics.titleTop,
                color: c.tx,
                fontSize: emptyDayMetrics.title,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: emptyDayMetrics.title * emptyDayMetrics.titleTrack,
                lineHeight: emptyDayMetrics.title * emptyDayMetrics.titleLine,
                textAlign: 'center',
            }}>
                {copy.title}
            </Text>

            {/* Cümle kırpılmaz — sarar. */}
            <Text style={{
                marginTop: emptyDayMetrics.hintTop,
                maxWidth: emptyDayMetrics.hintWidth,
                color: c.tx2,
                fontSize: emptyDayMetrics.hint,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: emptyDayMetrics.hint * emptyDayMetrics.hintLine,
                textAlign: 'center',
            }}>
                {copy.hint}
            </Text>

            <HourRail isToday={isToday} nowMinutes={nowMinutes} />
        </Animated.View>
    );
}

// ── Saat rayı ───────────────────────────────────────────────────────────────

/**
 * Boşluğun ölçüsü. Bir illüstrasyon değil — cetvelin dikey kardeşi: aynı
 * çentik dili, aynı tabular-nums. Gün geçmiş olsa da 24 saatti; geçmiş gün
 * için sönük bir varyant YAPILMADI.
 */
export function HourRail({ isToday, nowMinutes }: {
    isToday: boolean;
    nowMinutes: number;
}) {
    const { c, small } = useTheme();
    const rows = hourRailRows(isToday, nowMinutes);

    return (
        <View style={{
            marginTop: emptyDayMetrics.railTop,
            width: small ? emptyDayMetrics.railWidthSmall : emptyDayMetrics.railWidth,
        }}>
            {rows.map((row) => (
                <View
                    key={row.hour}
                    style={{
                        height: small ? emptyDayMetrics.railRowSmall : emptyDayMetrics.railRow,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: emptyDayMetrics.railGap,
                    }}
                >
                    <Num
                        size={emptyDayMetrics.railNumber}
                        style={{
                            width: emptyDayMetrics.railNumberWidth,
                            color: row.now ? c.or : c.tx3,
                            fontWeight: '700',
                        }}
                    >
                        {row.hour}
                    </Num>
                    <View style={{
                        flex: 1,
                        height: emptyDayMetrics.railLine,
                        backgroundColor: c.bd,
                        // Bugünde geçmiş saatin çizgisi turuncudan söner.
                        opacity: row.past ? 0.5 : 1,
                    }} />
                </View>
            ))}
        </View>
    );
}

// ── Gün pedalı ──────────────────────────────────────────────────────────────

/**
 * Üç bölme, tek yüzey. Basış tek bir yüzey farkıyla belli: hiçbir şey
 * büyümez ya da kaymaz — pedal bir gezinme yüzeyi, bir karar düğmesi değil.
 * `scale(.96)` yalnız haplarda.
 */
export function DayPedalBar({ pedal, onGo }: {
    pedal: DayPedal;
    onGo: (iso: string) => void;
}) {
    const { c, small } = useTheme();
    const side = small ? emptyDayMetrics.pedalSideSmall : emptyDayMetrics.pedalSide;
    const mid = small ? emptyDayMetrics.pedalMidSmall : emptyDayMetrics.pedalMid;

    const section = (
        part: DayPedal['prev'],
        width: number,
        tone: 'side' | 'mid',
    ) => (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={part.spoken}
            accessibilityState={{ disabled: part.disabled }}
            disabled={part.disabled || !part.targetISO}
            onPress={() => {
                if (!part.targetISO) return;
                feedback.selection();
                onGo(part.targetISO);
            }}
            style={({ pressed }) => ({
                width,
                height: emptyDayMetrics.pedalHeight,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed && !part.disabled
                    ? emptyDayMetrics.pedalPressFill
                    : 'transparent',
            })}
        >
            <Text numberOfLines={1} style={{
                color: part.disabled ? c.tx3 : tone === 'mid' ? c.or : c.tx,
                fontSize: emptyDayMetrics.pedalText,
                fontFamily: font.bold,
                fontWeight: '700',
            }}>
                {tone === 'side' && part === pedal.prev ? `‹ ${part.label}` : null}
                {tone === 'side' && part === pedal.next ? `${part.label} ›` : null}
                {tone === 'mid' ? part.label : null}
            </Text>
        </Pressable>
    );

    const divider = (
        <View style={{
            width: 1,
            alignSelf: 'stretch',
            marginVertical: emptyDayMetrics.pedalDividerInset,
            backgroundColor: c.bd,
        }} />
    );

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
            height: emptyDayMetrics.pedalHeight,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: c.bd2,
            overflow: 'hidden',
        }}>
            {section(pedal.prev, side, 'side')}
            {divider}
            {section(pedal.mid, mid, 'mid')}
            {divider}
            {section(pedal.next, side, 'side')}
        </View>
    );
}

// ── Birincil eylem ──────────────────────────────────────────────────────────

/**
 * Pedalın ÜSTÜNDE durur: yıkıcı olmayan gezinme daha alta, karar veren eylem
 * daha yukarı. Cümlenin altına konsaydı boşluk bir arızaya, düğme bir çareye
 * benzerdi.
 */
export function EmptyDayAction({ label, onPress }: {
    label: string;
    onPress: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={{ top: 2, bottom: 2 }}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                height: emptyDayMetrics.actionHeight,
                borderRadius: radius.pill,
                backgroundColor: c.or,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
        >
            <Text numberOfLines={1} style={{
                color: '#FFFFFF',
                fontSize: emptyDayMetrics.actionText,
                fontFamily: font.extraBold,
                fontWeight: '800',
            }}>
                {label}
            </Text>
        </Pressable>
    );
}

// ── Jest okları ─────────────────────────────────────────────────────────────

/**
 * Jesti ÖĞRETİR, jestin varlığı hiçbir zaman tek bilgi kaynağı değildir.
 * Dokunulamaz: jest çalışmasa da pedal duruyor.
 */
export function SwipeHints() {
    const { c } = useTheme();
    const arrow = (dir: 'left' | 'right') => (
        <Svg
            width={emptyDayMetrics.arrowSize}
            height={emptyDayMetrics.arrowSize}
            viewBox="0 0 20 20"
            fill="none"
            stroke={c.tx}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <Path d={dir === 'left' ? 'M12 4l-6 6 6 6' : 'M8 4l6 6-6 6'} />
        </Svg>
    );

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: emptyDayMetrics.arrowInset,
                right: emptyDayMetrics.arrowInset,
                top: emptyDayMetrics.arrowTop,
                flexDirection: 'row',
                justifyContent: 'space-between',
                opacity: emptyDayMetrics.arrowOpacity,
            }}
        >
            {arrow('left')}
            {arrow('right')}
        </View>
    );
}

export { IN as emptyDayInCurve, OUT as emptyDayOutCurve };

// ── Yükleme iskeleti ────────────────────────────────────────────────────────

/**
 * Yükleniyor hâli boş hâl DEĞİLDİR.
 *
 * Veri gelmeden boş hâlin cümlesi çizilirse ekran önce "randevu yok" diyor,
 * saniyeler sonra kendini yalanlıyor — kullanıcı bunu "iki defa yüklendi"
 * diye görüyor. İskelet hiçbir şey iddia etmez, yalnız yer tutar.
 */
export function DaySkeleton() {
    const { c } = useTheme();
    return (
        <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
                paddingHorizontal: skeletonMetrics.padX,
                paddingTop: skeletonMetrics.top,
                gap: skeletonMetrics.gap,
            }}
        >
            {Array.from({ length: skeletonMetrics.rows }, (_, index) => (
                <View
                    key={index}
                    style={{
                        height: skeletonMetrics.height,
                        borderRadius: skeletonMetrics.radius,
                        backgroundColor: c.tx,
                        opacity: skeletonMetrics.opacity,
                    }}
                />
            ))}
        </View>
    );
}
