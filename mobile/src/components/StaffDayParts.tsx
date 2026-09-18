import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Animated,
    Easing,
    Pressable,
    ScrollView,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { upperTR } from '../lib/text';
import { awaitsApproval } from '../lib/approval';
import { toMinutes, type Appt } from '../lib/calendar';
import type { StaffPresence } from '../lib/managerFlow';
import {
    isNoShow,
    splitStaffName,
    type StaffActionItem,
    type StaffDayState,
    type StaffGhostItem,
    type StaffHeroPanel,
    type StaffShiftBar,
} from '../lib/staffDay';
import {
    font,
    panelInk,
    radius,
    staffDayMetrics,
    staffDayMotion,
    useTheme,
} from '../theme';

/**
 * Müdür 24 — Personel günü parçaları.
 *
 * Yalnız RN Animated, useNativeDriver: true.
 * Renk ve yükseklik animasyonu yok.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 24 Personel Gunu.html`.
 */

const IN = Easing.bezier(
    staffDayMotion.inCurve[0],
    staffDayMotion.inCurve[1],
    staffDayMotion.inCurve[2],
    staffDayMotion.inCurve[3],
);
const OUT = Easing.bezier(
    staffDayMotion.outCurve[0],
    staffDayMotion.outCurve[1],
    staffDayMotion.outCurve[2],
    staffDayMotion.outCurve[3],
);

export function useStaffIntro(play: boolean, empty: boolean, reduceMotion: boolean) {
    const start = play && !reduceMotion ? 0 : 1;
    const ring = useRef(new Animated.Value(start)).current;
    const panel = useRef(new Animated.Value(start)).current;
    const list = useRef(new Animated.Value(start)).current;
    const emptyHero = useRef(new Animated.Value(start)).current;
    const emptyNote = useRef(new Animated.Value(start)).current;
    const emptyShift = useRef(new Animated.Value(start)).current;

    useEffect(() => {
        if (!play || reduceMotion) {
            ring.setValue(1);
            panel.setValue(1);
            list.setValue(1);
            emptyHero.setValue(1);
            emptyNote.setValue(1);
            emptyShift.setValue(1);
            return;
        }
        if (empty) {
            ring.setValue(1);
            panel.setValue(1);
            list.setValue(1);
            emptyHero.setValue(0);
            emptyNote.setValue(0);
            emptyShift.setValue(0);
            Animated.parallel([
                Animated.timing(emptyHero, {
                    toValue: 1,
                    duration: staffDayMotion.empty.duration,
                    delay: staffDayMotion.empty.steps[0],
                    easing: IN,
                    useNativeDriver: true,
                }),
                Animated.timing(emptyNote, {
                    toValue: 1,
                    duration: staffDayMotion.empty.duration,
                    delay: staffDayMotion.empty.steps[1],
                    easing: IN,
                    useNativeDriver: true,
                }),
                Animated.timing(emptyShift, {
                    toValue: 1,
                    duration: staffDayMotion.empty.duration,
                    delay: staffDayMotion.empty.steps[2],
                    easing: IN,
                    useNativeDriver: true,
                }),
            ]).start();
            return;
        }
        emptyHero.setValue(1);
        emptyNote.setValue(1);
        emptyShift.setValue(1);
        ring.setValue(0);
        panel.setValue(0);
        list.setValue(0);
        Animated.parallel([
            Animated.timing(ring, {
                toValue: 1,
                duration: staffDayMotion.enter.ringIn,
                delay: staffDayMotion.enter.ringDelay,
                easing: IN,
                useNativeDriver: true,
            }),
            Animated.timing(panel, {
                toValue: 1,
                duration: staffDayMotion.enter.panelIn,
                delay: staffDayMotion.enter.panelDelay,
                easing: IN,
                useNativeDriver: true,
            }),
            Animated.timing(list, {
                toValue: 1,
                duration: staffDayMotion.enter.listIn,
                delay: staffDayMotion.enter.listDelay,
                easing: IN,
                useNativeDriver: true,
            }),
        ]).start();
    }, [play, empty, reduceMotion, ring, panel, list, emptyHero, emptyNote, emptyShift]);

    return { ring, panel, list, emptyHero, emptyNote, emptyShift };
}

export function useStaffKindSwap(dayState: StaffDayState, reduceMotion: boolean) {
    const out = useRef(new Animated.Value(1)).current;
    const enter = useRef(new Animated.Value(1)).current;
    const lastKind = useRef(dayState.kind);
    const lastState = useRef(dayState);
    const [leaving, setLeaving] = useState<StaffDayState | null>(null);

    useEffect(() => {
        if (lastKind.current === dayState.kind) return;
        const from = lastState.current;
        lastKind.current = dayState.kind;
        if (reduceMotion) {
            setLeaving(null);
            out.setValue(1);
            enter.setValue(1);
            return;
        }
        setLeaving(from);
        out.setValue(1);
        enter.setValue(0);
        Animated.timing(out, {
            toValue: 0,
            duration: staffDayMotion.swap.out,
            easing: OUT,
            useNativeDriver: true,
        }).start(({ finished }) => { if (finished) setLeaving(null); });
        Animated.timing(enter, {
            toValue: 1,
            duration: staffDayMotion.swap.in,
            delay: staffDayMotion.swap.inDelay,
            easing: IN,
            useNativeDriver: true,
        }).start();
    }, [dayState.kind, reduceMotion, out, enter]);

    useEffect(() => { lastState.current = dayState; });

    return { out, enter, leaving };
}

// ── Üst Çubuk ───────────────────────────────────────────────────────────────

/**
 * Üst çubukta YALNIZ geri düğmesi var. Ad, soyad ve rol bir satır aşağıda,
 * kahraman blokta zaten yazıyor — çubukta ikinci kez yazmak aynı bilgiyi
 * iki kere okutuyordu. Çubuğun yüksekliği değişmedi: başlık zaten mutlak
 * konumluydu, yerleşimi taşımıyordu.
 */
export function StaffTopBar({
    onBack,
    topInset = 0,
}: {
    onBack: () => void;
    /**
     * Durum çubuğu boşluğu ÇUBUĞUN kendisinde durur, ekranın kabında değil:
     * üst parıltı çentiğin ardına kadar uzasın diye.
     */
    topInset?: number;
}) {
    const { c } = useTheme();

    return (
        <View style={{
            height: staffDayMetrics.topBarHeight + topInset,
            paddingTop: topInset,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: staffDayMetrics.topBarPadX,
            position: 'relative',
        }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                hitSlop={6}
                onPress={() => { feedback.selection(); onBack(); }}
                style={({ pressed }) => ({
                    width: staffDayMetrics.backButtonSize,
                    height: staffDayMetrics.backButtonSize,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: -8,
                    opacity: pressed ? 0.6 : 1,
                    zIndex: 2,
                })}
            >
                <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={c.tx} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 4l-6 6 6 6" />
                </Svg>
            </Pressable>
        </View>
    );
}

// ── İsim Şeridi (Sayfalama Göstergesi) ───────────────────────────────────────

export function StaffRail({
    presence,
    activeIndex,
    onSelect,
    scrollX,
    screenWidth,
}: {
    presence: readonly StaffPresence[];
    activeIndex: number;
    onSelect: (index: number) => void;
    scrollX: Animated.Value;
    screenWidth: number;
}) {
    const { c, small, reduceMotion } = useTheme();
    const widthAV = useRef(new Animated.Value(screenWidth)).current;
    useEffect(() => { widthAV.setValue(screenWidth); }, [screenWidth, widthAV]);
    const page = Animated.divide(scrollX, widthAV);
    const slot = staffDayMetrics.railRingActiveSize;
    const base = staffDayMetrics.railRingSize;
    const activeScale = slot / base;

    return (
        <View style={{
            height: staffDayMetrics.railHeight,
            borderBottomWidth: 1,
            borderBottomColor: c.bd,
        }}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: staffDayMetrics.railPadX,
                    gap: small ? staffDayMetrics.railGapSmall : staffDayMetrics.railGap,
                }}
            >
                {presence.map((person, index) => {
                    const isActive = index === activeIndex;
                    const tone = person.state;

                    let borderColor = c.bd2;
                    let borderStyle: 'solid' | 'dashed' = 'solid';
                    if (tone === 'busy') borderColor = c.or;
                    else if (tone === 'free') borderColor = c.gr;
                    else if (tone === 'leave') {
                        borderColor = c.am;
                        borderStyle = 'dashed';
                    } else if (tone === 'off') {
                        borderColor = c.bd;
                    }

                    const opacity = reduceMotion
                        ? (isActive ? 1 : staffDayMetrics.railDimOpacity)
                        : page.interpolate({
                            inputRange: [index - 1, index, index + 1],
                            outputRange: [staffDayMetrics.railDimOpacity, 1, staffDayMetrics.railDimOpacity],
                            extrapolate: 'clamp',
                        });
                    const scale = reduceMotion
                        ? (isActive ? activeScale : 1)
                        : page.interpolate({
                            inputRange: [index - 1, index, index + 1],
                            outputRange: [1, activeScale, 1],
                            extrapolate: 'clamp',
                        });

                    return (
                        <Pressable
                            key={person.id}
                            accessibilityRole="tab"
                            accessibilityLabel={person.name}
                            accessibilityState={{ selected: isActive }}
                            hitSlop={8}
                            onPress={() => {
                                feedback.selection();
                                onSelect(index);
                            }}
                            style={{
                                width: slot,
                                height: slot,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Animated.View style={{
                                width: base,
                                height: base,
                                borderRadius: radius.pill,
                                borderWidth: staffDayMetrics.railBorder,
                                borderColor,
                                borderStyle,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity,
                                transform: [{ scale }],
                            }}>
                                <Text style={{
                                    color: c.tx,
                                    fontSize: staffDayMetrics.railText,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                }}>
                                    {person.initials}
                                </Text>
                            </Animated.View>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ── Kahraman Blok ───────────────────────────────────────────────────────────

function ringLook(state: string, c: ReturnType<typeof useTheme>['c']) {
    let border = c.bd2;
    let style: 'solid' | 'dashed' = 'solid';
    let ink = c.tx;
    if (state === 'busy') border = c.or;
    else if (state === 'free') border = c.gr;
    else if (state === 'leave') {
        border = c.am;
        style = 'dashed';
    } else if (state === 'off') {
        border = c.bd;
        ink = c.tx2;
    }
    return { border, style, ink };
}

function stampLook(tone: 'run' | 'free' | 'am' | 'non', c: ReturnType<typeof useTheme>['c']) {
    let color = c.tx2;
    let border = c.bd2;
    let dot = c.tx3;
    if (tone === 'run') {
        color = c.or;
        border = 'rgba(255,90,31,0.42)';
        dot = c.or;
    } else if (tone === 'free') {
        color = c.gr;
        border = 'rgba(95,191,100,0.40)';
        dot = c.gr;
    } else if (tone === 'am') {
        color = c.am;
        border = 'rgba(217,164,59,0.42)';
        dot = c.am;
    }
    return { color, border, dot };
}

export function StaffHeroHead({
    initials,
    state,
    badgeText,
    given,
    family,
    role,
    stampText,
    stampTone,
    enterRing,
    swapOut,
    swapIn,
    leaving,
}: {
    initials: string;
    state: string;
    badgeText: string | null;
    given: string;
    family: string;
    role: string;
    stampText: string;
    stampTone: 'run' | 'free' | 'am' | 'non';
    enterRing?: Animated.Value;
    swapOut?: Animated.Value;
    swapIn?: Animated.Value;
    leaving?: StaffDayState | null;
}) {
    const { c, reduceMotion } = useTheme();
    const current = ringLook(state, c);
    const stamp = stampLook(stampTone, c);
    const past = leaving ? ringLook(leaving.kind === 'running' ? 'busy' : leaving.kind === 'free' ? 'free' : leaving.kind === 'leave' ? 'leave' : leaving.kind === 'off' ? 'off' : state, c) : null;
    const pastStamp = leaving ? stampLook(leaving.stampTone, c) : null;
    const swapping = Boolean(leaving && swapOut && swapIn && !reduceMotion);

    const ringScale = enterRing && !reduceMotion
        ? enterRing.interpolate({
            inputRange: [0, 1],
            outputRange: [staffDayMotion.enter.ringScaleFrom, 1],
        })
        : 1;
    const outY = swapOut?.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.swap.outShift, 0],
    });
    const inY = swapIn?.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.swap.inShift, 0],
    });
    const badgeScale = swapOut?.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.swap.badgeScale, 1],
    });

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: staffDayMetrics.heroGap,
        }}>
            {/* 76 pt Ring — renk iki halka üst üste soldurulur */}
            <Animated.View style={{
                width: staffDayMetrics.ringSize,
                height: staffDayMetrics.ringSize,
                opacity: enterRing ?? 1,
                transform: reduceMotion || !enterRing ? [] : [{ scale: ringScale }],
            }}>
                <View style={{
                    width: staffDayMetrics.ringSize,
                    height: staffDayMetrics.ringSize,
                    position: 'relative',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {swapping && past ? (
                        <Animated.View pointerEvents="none" style={{
                            position: 'absolute',
                            left: 0, top: 0, right: 0, bottom: 0,
                            borderRadius: radius.pill,
                            borderWidth: staffDayMetrics.ringBorder,
                            borderColor: past.border,
                            borderStyle: past.style,
                            opacity: swapOut,
                        }} />
                    ) : null}
                    <Animated.View style={{
                        position: 'absolute',
                        left: 0, top: 0, right: 0, bottom: 0,
                        borderRadius: radius.pill,
                        borderWidth: staffDayMetrics.ringBorder,
                        borderColor: current.border,
                        borderStyle: current.style,
                        opacity: swapping ? swapIn : 1,
                    }} />
                    <Text style={{
                        color: current.ink,
                        fontSize: staffDayMetrics.ringText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: staffDayMetrics.ringText * -0.01,
                    }}>
                        {initials}
                    </Text>

                    {swapping && leaving?.badgeText ? (
                        <Animated.View pointerEvents="none" style={{
                            position: 'absolute',
                            bottom: staffDayMetrics.badgeOffset,
                            height: staffDayMetrics.badgeHeight,
                            paddingHorizontal: staffDayMetrics.badgePadX,
                            borderRadius: radius.pill,
                            backgroundColor: c.or,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: swapOut,
                            transform: [{ scale: badgeScale ?? 1 }],
                        }}>
                            <Text style={{
                                color: '#FFFFFF',
                                fontSize: staffDayMetrics.badgeText,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                            }}>
                                {leaving.badgeText}
                            </Text>
                        </Animated.View>
                    ) : null}
                    {badgeText ? (
                        <Animated.View style={{
                            position: 'absolute',
                            bottom: staffDayMetrics.badgeOffset,
                            height: staffDayMetrics.badgeHeight,
                            paddingHorizontal: staffDayMetrics.badgePadX,
                            borderRadius: radius.pill,
                            backgroundColor: c.or,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: swapping ? swapIn : 1,
                        }}>
                            <Text style={{
                                color: '#FFFFFF',
                                fontSize: staffDayMetrics.badgeText,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                            }}>
                                {badgeText}
                            </Text>
                        </Animated.View>
                    ) : null}
                </View>
            </Animated.View>

            {/* Bilgi Sütunu */}
            <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
                <Text numberOfLines={1} style={{
                    fontSize: staffDayMetrics.nameSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    letterSpacing: staffDayMetrics.nameSize * -0.02,
                    lineHeight: staffDayMetrics.nameSize * 1.2,
                    color: c.tx,
                }}>
                    {given} <Text style={{ fontFamily: font.extraBold, fontWeight: '800' }}>{family}</Text>
                </Text>

                <View style={{ height: staffDayMetrics.stampHeight, justifyContent: 'center' }}>
                    {swapping && leaving && pastStamp ? (
                        <Animated.View pointerEvents="none" style={{
                            position: 'absolute',
                            height: staffDayMetrics.stampHeight,
                            paddingHorizontal: staffDayMetrics.stampPadX,
                            borderRadius: staffDayMetrics.stampRadius,
                            borderWidth: staffDayMetrics.stampBorder,
                            borderColor: pastStamp.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            opacity: swapOut,
                            transform: [{ translateY: outY ?? 0 }],
                        }}>
                            <View style={{
                                width: staffDayMetrics.stampDot,
                                height: staffDayMetrics.stampDot,
                                borderRadius: radius.pill,
                                backgroundColor: pastStamp.dot,
                            }} />
                            <Text style={{
                                color: pastStamp.color,
                                fontSize: staffDayMetrics.stampText,
                                fontFamily: font.bold,
                                fontWeight: '700',
                            }}>
                                {upperTR(leaving.stampText)}
                            </Text>
                        </Animated.View>
                    ) : null}
                    <Animated.View style={{
                        height: staffDayMetrics.stampHeight,
                        paddingHorizontal: staffDayMetrics.stampPadX,
                        borderRadius: staffDayMetrics.stampRadius,
                        borderWidth: staffDayMetrics.stampBorder,
                        borderColor: stamp.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        alignSelf: 'flex-start',
                        opacity: swapping ? swapIn : 1,
                        transform: swapping && inY ? [{ translateY: inY }] : [],
                    }}>
                        <View style={{
                            width: staffDayMetrics.stampDot,
                            height: staffDayMetrics.stampDot,
                            borderRadius: radius.pill,
                            backgroundColor: stamp.dot,
                        }} />
                        <Text style={{
                            color: stamp.color,
                            fontSize: staffDayMetrics.stampText,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            {upperTR(stampText)}
                        </Text>
                    </Animated.View>
                </View>

                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: staffDayMetrics.roleSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    lineHeight: staffDayMetrics.roleSize * 1.2,
                }}>
                    {role}
                </Text>
            </View>
        </View>
    );
}

// ── Gömülü Krem Kart ────────────────────────────────────────────────────────

export function StaffSwapStack({
    leaving,
    out,
    enter,
    height,
    children,
}: {
    leaving: ReactNode;
    out: Animated.Value;
    enter: Animated.Value;
    height: number;
    children: ReactNode;
}) {
    const { reduceMotion } = useTheme();
    const outY = out.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.swap.outShift, 0],
    });
    const inY = enter.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.swap.inShift, 0],
    });
    return (
        <View style={{
            marginTop: staffDayMetrics.panelMarginTop,
            height,
        }}>
            <Animated.View style={{
                opacity: enter,
                transform: reduceMotion ? [] : [{ translateY: inY }],
            }}>
                {children}
            </Animated.View>
            {leaving ? (
                <Animated.View pointerEvents="none" style={{
                    position: 'absolute',
                    left: 0, right: 0, top: 0,
                    opacity: out,
                    transform: reduceMotion ? [] : [{ translateY: outY }],
                }}>
                    {leaving}
                </Animated.View>
            ) : null}
        </View>
    );
}

export function StaffHeroPanelCard({ panel, flush = false }: { panel: StaffHeroPanel; flush?: boolean }) {
    const { c, dark, reduceMotion } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;

    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!panel.hasPulse || reduceMotion) {
            pulseAnim.setValue(1);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.35,
                    duration: staffDayMetrics.pulsePeriod / 2,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: staffDayMetrics.pulsePeriod / 2,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [panel.hasPulse, reduceMotion, pulseAnim]);

    return (
        <View style={{
            marginTop: flush ? 0 : staffDayMetrics.panelMarginTop,
            borderRadius: staffDayMetrics.panelRadius,
            backgroundColor: ink.panel,
            overflow: 'hidden',
        }}>
            <View style={{
                padding: staffDayMetrics.panelPad,
                gap: 3,
            }}>
                {/* Etiket */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    {panel.hasPulse ? (
                        <Animated.View style={{
                            width: staffDayMetrics.panelDot,
                            height: staffDayMetrics.panelDot,
                            borderRadius: radius.pill,
                            backgroundColor: c.or,
                            opacity: pulseAnim,
                        }} />
                    ) : null}
                    <Text style={{
                        color: ink.ink2,
                        fontSize: staffDayMetrics.panelLabel,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: staffDayMetrics.panelLabel * staffDayMetrics.panelLabelTrack,
                    }}>
                        {upperTR(panel.label)}
                    </Text>
                </View>

                {/* Kahraman Değer */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: 5,
                    height: staffDayMetrics.heroBox,
                }}>
                    <Num size={staffDayMetrics.heroText} style={{
                        color: ink.ink,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: staffDayMetrics.heroText * staffDayMetrics.heroTextTrack,
                        lineHeight: staffDayMetrics.heroBox,
                    }}>
                        {panel.heroValue}
                    </Num>
                    {panel.heroUnit ? (
                        <Text style={{
                            color: ink.ink2,
                            fontSize: staffDayMetrics.heroUnit,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: staffDayMetrics.heroUnit * -0.01,
                        }}>
                            {panel.heroUnit}
                        </Text>
                    ) : null}
                </View>

                {/* Alt Metin — bilinmiyorsa satır hiç çizilmez */}
                {panel.subText ? (
                    <Text numberOfLines={1} style={{
                        color: ink.ink2,
                        fontSize: staffDayMetrics.subText,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        lineHeight: staffDayMetrics.subText * staffDayMetrics.subLine,
                    }}>
                        {panel.subText}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

// ── Vardiya Çubuğu ──────────────────────────────────────────────────────────

export function StaffShiftBarView({ shift }: { shift: StaffShiftBar }) {
    const { c } = useTheme();

    return (
        <View style={{
            marginHorizontal: staffDayMetrics.shiftMarginX,
            marginTop: staffDayMetrics.shiftMarginTop,
            padding: staffDayMetrics.shiftPad,
            borderRadius: staffDayMetrics.shiftRadius,
            borderWidth: 1,
            borderColor: c.bd,
            borderStyle: shift.dash ? 'dashed' : 'solid',
            gap: staffDayMetrics.shiftGap,
        }}>
            <View style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 8,
            }}>
                <Text style={{
                    color: c.tx3,
                    fontSize: staffDayMetrics.shiftHead,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: staffDayMetrics.shiftHead * 0.06,
                }}>
                    {upperTR(shift.head)}
                </Text>
                <Text style={{
                    marginLeft: 'auto',
                    color: c.tx2,
                    fontSize: staffDayMetrics.shiftRight,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                }}>
                    {shift.right}
                </Text>
            </View>

            {/* İz Çizgisi */}
            <View style={{
                height: staffDayMetrics.trackHeight,
                justifyContent: 'center',
                position: 'relative',
            }}>
                <View style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height: staffDayMetrics.trackLine,
                    borderRadius: staffDayMetrics.trackRadius,
                    backgroundColor: shift.dash ? undefined : c.bd2,
                    borderTopWidth: shift.dash ? staffDayMetrics.trackDash : undefined,
                    borderTopColor: shift.dash ? c.bd2 : undefined,
                    borderStyle: shift.dash ? 'dashed' : 'solid',
                }} />

                <View style={{
                    position: 'absolute',
                    left: `${Math.min(Math.max(shift.nowPct, 0), 100)}%`,
                    transform: [{ translateX: -staffDayMetrics.nowWidth / 2 }],
                    width: staffDayMetrics.nowWidth,
                    height: staffDayMetrics.nowHeight,
                    borderRadius: 1,
                    backgroundColor: c.or,
                }} />
            </View>

            <Text style={{
                color: c.tx2,
                fontSize: staffDayMetrics.shiftFoot,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: staffDayMetrics.shiftFoot * 1.4,
            }}>
                {shift.foot}
            </Text>
        </View>
    );
}

// ── Boş Hâl Notu ────────────────────────────────────────────────────────────

export function StaffEmptyNoteView({ note }: { note: string }) {
    const { c } = useTheme();

    return (
        <View style={{
            paddingTop: staffDayMetrics.empPadTop,
            paddingHorizontal: staffDayMetrics.empPadX,
            gap: staffDayMetrics.empGap,
        }}>
            <Text numberOfLines={3} style={{
                color: c.tx2,
                fontSize: staffDayMetrics.empText,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: staffDayMetrics.empText * staffDayMetrics.empLine,
            }}>
                {note}
            </Text>
        </View>
    );
}

// ── Liste Başlığı & Şimdi Çizgisi ───────────────────────────────────────────

export function StaffListHeaderView({ title }: { title: string }) {
    const { c } = useTheme();

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: staffDayMetrics.lhdPadTop,
            paddingHorizontal: staffDayMetrics.lhdPadX,
            paddingBottom: staffDayMetrics.lhdPadBottom,
        }}>
            <Text style={{
                color: c.tx3,
                fontSize: staffDayMetrics.lhdText,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: staffDayMetrics.lhdText * staffDayMetrics.lhdTrack,
            }}>
                {upperTR(title)}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: c.bd }} />
        </View>
    );
}

export function StaffNowLineView({ time }: { time: string }) {
    const { c } = useTheme();

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: staffDayMetrics.lhdPadTop,
            paddingHorizontal: staffDayMetrics.lhdPadX,
            paddingBottom: staffDayMetrics.lhdPadBottom,
        }}>
            <Text style={{
                color: c.or,
                fontSize: staffDayMetrics.lhdText,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: staffDayMetrics.lhdText * staffDayMetrics.lhdTrack,
            }}>
                ŞİMDİ <Text style={{ fontFamily: font.extraBold, fontWeight: '800' }}>{time}</Text>
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,90,31,0.34)' }} />
        </View>
    );
}

// ── Randevu Satırı ──────────────────────────────────────────────────────────

export function StaffAppointmentRow({
    appointment,
    nowMinutes,
    first = false,
    fade = false,
    onOpen,
    onMore,
}: {
    appointment: Appt;
    nowMinutes: number;
    first?: boolean;
    fade?: boolean;
    onOpen: (appointment: Appt) => void;
    onMore?: (appointment: Appt) => void;
}) {
    const { c } = useTheme();
    const { given, family } = splitStaffName(appointment.customer_name);
    // Süre satırda yazar: "Kesim + fön · 60 dk".
    const minutes = toMinutes(appointment.end_time) - toMinutes(appointment.start_time);
    const serviceLine = minutes > 0
        ? `${appointment.service} · ${minutes} dk`
        : appointment.service;

    /*
     * İPTAL ile GELMEDİ ayrı rozetlerdir: iptali müdür yazar, gelmemeyi
     * müşteri yapar. İkisini tek rozete toplamak müdürün yarına taşıyacağı
     * satırı gizler.
     */
    let miniStamp: { label: string; tone: 'gr' | 'am' | 'rd' } | null = null;
    if (appointment.status === 'cancelled') {
        miniStamp = { label: 'iptal', tone: 'rd' };
    } else if (appointment.status === 'completed' || Boolean(appointment.service_ended_at)) {
        miniStamp = { label: 'tamamlandı', tone: 'gr' };
    } else if (awaitsApproval(appointment.status)) {
        miniStamp = { label: 'onay bekliyor', tone: 'am' };
    } else if (isNoShow(appointment, nowMinutes)) {
        miniStamp = { label: 'gelmedi', tone: 'rd' };
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${appointment.customer_name}, ${appointment.service}, ${appointment.start_time.slice(0, 5)}`}
            onPress={() => { feedback.selection(); onOpen(appointment); }}
            style={({ pressed }) => ({
                flexDirection: 'row',
                gap: staffDayMetrics.rowGap,
                paddingVertical: staffDayMetrics.rowPadY,
                paddingHorizontal: staffDayMetrics.rowPadX,
                borderTopWidth: first ? 0 : 1,
                borderColor: c.bd,
                opacity: pressed ? 0.7 : fade ? staffDayMetrics.fadeOpacity : 1,
            })}
        >
            <Text style={{
                width: staffDayMetrics.timeWidth,
                fontSize: staffDayMetrics.timeSize,
                fontFamily: font.bold,
                fontWeight: '700',
                color: c.tx2,
                paddingTop: 2,
            }}>
                {appointment.start_time.slice(0, 5)}
            </Text>

            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={1} style={{
                    fontSize: staffDayMetrics.nameRowSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    letterSpacing: staffDayMetrics.nameRowSize * -0.02,
                    lineHeight: staffDayMetrics.nameRowSize * 1.25,
                    color: c.tx,
                }}>
                    {given} <Text style={{ fontFamily: font.extraBold, fontWeight: '800' }}>{family}</Text>
                </Text>

                <Text numberOfLines={1} style={{
                    fontSize: staffDayMetrics.serviceSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    color: c.tx2,
                    lineHeight: staffDayMetrics.serviceSize * 1.35,
                }}>
                    {serviceLine}
                </Text>

                {appointment.notes ? (
                    <Text numberOfLines={1} style={{
                        fontSize: staffDayMetrics.noteSize,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        color: c.tx2,
                        lineHeight: staffDayMetrics.noteSize * 1.35,
                    }}>
                        “{appointment.notes}”
                    </Text>
                ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                {miniStamp ? (
                    <View style={{
                        height: staffDayMetrics.miniHeight,
                        paddingHorizontal: staffDayMetrics.miniPadX,
                        borderRadius: staffDayMetrics.miniRadius,
                        borderWidth: 1,
                        borderColor: miniStamp.tone === 'rd'
                            ? 'rgba(224,114,114,0.40)'
                            : miniStamp.tone === 'am'
                                ? 'rgba(217,164,59,0.42)'
                                : c.bd2,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        <View style={{
                            width: staffDayMetrics.miniDot,
                            height: staffDayMetrics.miniDot,
                            borderRadius: radius.pill,
                            backgroundColor: miniStamp.tone === 'rd'
                                ? c.rd
                                : miniStamp.tone === 'am'
                                    ? c.am
                                    : c.gr,
                        }} />
                        <Text style={{
                            color: miniStamp.tone === 'rd' ? c.rd : miniStamp.tone === 'am' ? c.am : c.tx2,
                            fontSize: staffDayMetrics.miniText,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            {miniStamp.label}
                        </Text>
                    </View>
                ) : null}

                {onMore ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Seçenekler"
                        hitSlop={12}
                        onPress={(e) => {
                            e.stopPropagation?.();
                            feedback.selection();
                            onMore(appointment);
                        }}
                        style={({ pressed }) => ({
                            paddingVertical: staffDayMetrics.kebabPadY,
                            paddingHorizontal: staffDayMetrics.kebabPadX,
                            marginVertical: -staffDayMetrics.kebabPadY,
                            marginHorizontal: -staffDayMetrics.kebabPadX,
                            gap: 3,
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <View style={{ width: staffDayMetrics.kebabDot, height: staffDayMetrics.kebabDot, borderRadius: radius.pill, backgroundColor: c.tx3 }} />
                        <View style={{ width: staffDayMetrics.kebabDot, height: staffDayMetrics.kebabDot, borderRadius: radius.pill, backgroundColor: c.tx3 }} />
                        <View style={{ width: staffDayMetrics.kebabDot, height: staffDayMetrics.kebabDot, borderRadius: radius.pill, backgroundColor: c.tx3 }} />
                    </Pressable>
                ) : null}
            </View>
        </Pressable>
    );
}

// ── Alt Eylem Çubuğu ────────────────────────────────────────────────────────

export function StaffFootActionsView({
    primary,
    secondary,
    ghost,
    onPrimary,
    onSecondary,
    onGhost,
    bottomInset,
}: {
    primary: StaffActionItem | null;
    secondary: StaffActionItem | null;
    ghost: StaffGhostItem | null;
    onPrimary?: () => void;
    onSecondary?: () => void;
    onGhost?: () => void;
    bottomInset: number;
}) {
    const { c, small } = useTheme();

    if (!primary && !secondary && !ghost) return null;

    return (
        <View style={{
            paddingTop: staffDayMetrics.footPadTop,
            paddingHorizontal: staffDayMetrics.footPadX,
            paddingBottom: Math.max(bottomInset, small ? staffDayMetrics.footPadBottomSmall : staffDayMetrics.footPadBottom),
            borderTopWidth: 1,
            borderTopColor: c.bd,
            backgroundColor: c.bg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: staffDayMetrics.footGap,
        }}>
            {primary ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={primary.label}
                    hitSlop={2}
                    onPress={() => { feedback.selection(); onPrimary?.(); }}
                    style={({ pressed }) => ({
                        flex: 1,
                        height: staffDayMetrics.hapHeight,
                        borderRadius: radius.pill,
                        backgroundColor: primary.filled ? c.or : 'transparent',
                        borderWidth: primary.filled ? 0 : staffDayMetrics.hapBorder,
                        borderColor: primary.filled ? undefined : c.tx,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        opacity: pressed ? 0.85 : 1,
                    })}
                >
                    <ActionIcon kind={primary.kind} color={primary.filled ? '#FFFFFF' : c.tx} />
                    <Text style={{
                        color: primary.filled ? '#FFFFFF' : c.tx,
                        fontSize: staffDayMetrics.hapText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: staffDayMetrics.hapText * -0.01,
                    }}>
                        {primary.label}
                    </Text>
                </Pressable>
            ) : null}

            {secondary ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={secondary.label}
                    hitSlop={2}
                    onPress={() => { feedback.selection(); onSecondary?.(); }}
                    style={({ pressed }) => ({
                        height: staffDayMetrics.hapHeight,
                        paddingHorizontal: staffDayMetrics.hapPadX,
                        borderRadius: radius.pill,
                        borderWidth: staffDayMetrics.hapBorder,
                        borderColor: c.tx,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <ActionIcon kind={secondary.kind} color={c.tx} />
                    <Text style={{
                        color: c.tx,
                        fontSize: staffDayMetrics.hapText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: staffDayMetrics.hapText * -0.01,
                    }}>
                        {secondary.label}
                    </Text>
                </Pressable>
            ) : null}

            {ghost ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={ghost.label}
                    hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                    onPress={() => { feedback.selection(); onGhost?.(); }}
                    style={({ pressed }) => ({
                        height: staffDayMetrics.ghostHeight,
                        paddingHorizontal: staffDayMetrics.ghostPadX,
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                    })}
                >
                    <Text style={{
                        color: c.tx2,
                        fontSize: staffDayMetrics.ghostText,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {ghost.label}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function ActionIcon({ kind, color }: { kind: 'plus' | 'phone' | 'shift'; color: string }) {
    if (kind === 'plus') {
        // Tasarımda artı ÇEMBER içinde (.ico + .ico.plus): 17 pt kutu,
        // 1.7 pt kenarlık, artı kolları 3.5 pt içeriden başlar.
        return (
            <Svg width={17} height={17} viewBox="0 0 17 17" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
                <Circle cx={8.5} cy={8.5} r={7.65} />
                <Path d="M4.35 8.5h8.3M8.5 4.35v8.3" />
            </Svg>
        );
    }
    if (kind === 'phone') {
        return (
            <Svg width={17} height={17} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M6.2 3.2h-2c-.7 0-1.2.6-1.1 1.3.3 3 1.6 5.8 3.7 7.9 2.1 2.1 4.9 3.4 7.9 3.7.7.1 1.3-.4 1.3-1.1v-2c0-.6-.4-1.1-1-1.2l-1.9-.3c-.5-.1-1 .1-1.3.5l-.7.9C9.3 12 8 10.7 7.1 9.1l.9-.7c.4-.3.6-.8.5-1.3L8.2 5.2c-.1-.6-.6-1-1.2-1z" />
            </Svg>
        );
    }
    return (
        <Svg width={17} height={17} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 4h14M3 10h14M3 16h14" />
        </Svg>
    );
}
