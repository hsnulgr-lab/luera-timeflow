import { useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    Animated,
    Easing,
    LayoutAnimation,
    PixelRatio,
    Pressable,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
    type ViewStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '../../src/lib/feedback';
import { numeric, useTheme } from '../../src/theme';

const REST = [
    { time: '12:30', name: 'Zeynep Ak', service: 'Fön · 30 dk' },
    { time: '14:00', name: 'Fatma Kurt', service: 'Keratin bakım · 60 dk' },
    { time: '15:30', name: 'Elif Şahin', service: 'Kesim · 45 dk' },
] as const;

const TEST_ELAPSED_SECONDS = 24 * 60 + 18;

type MorphRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const VISIT_LAYOUT_ANIMATION = {
    duration: 510,
    create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
    },
    update: {
        type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
    },
};

const formatElapsed = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

const param = (value: string | string[] | undefined, fallback: string) =>
    typeof value === 'string' && value ? value : fallback;

function BellIcon() {
    const { c } = useTheme();
    return (
        <View style={{ width: 23, height: 23, alignItems: 'center' }}>
            <View style={{
                position: 'absolute',
                top: 2,
                width: 14,
                height: 15,
                borderWidth: 1.7,
                borderBottomWidth: 0,
                borderColor: c.tx,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 5,
                borderBottomRightRadius: 5,
            }} />
            <View style={{
                position: 'absolute',
                top: 16,
                width: 18,
                height: 1.7,
                borderRadius: 1,
                backgroundColor: c.tx,
            }} />
            <View style={{
                position: 'absolute',
                top: 19,
                width: 4,
                height: 2,
                borderRadius: 2,
                backgroundColor: c.tx,
            }} />
        </View>
    );
}

function ClockIcon() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 17,
            height: 17,
            borderRadius: 8.5,
            borderWidth: 1.7,
            borderColor: c.or,
        }}>
            <View style={{
                position: 'absolute',
                left: 7,
                top: 3,
                width: 1.5,
                height: 5,
                borderRadius: 1,
                backgroundColor: c.or,
            }} />
            <View style={{
                position: 'absolute',
                left: 7,
                top: 7,
                width: 4,
                height: 1.5,
                borderRadius: 1,
                backgroundColor: c.or,
                transform: [{ rotate: '35deg' }],
                transformOrigin: 'left center',
            }} />
        </View>
    );
}

function NextChevron() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 10,
            height: 10,
            borderRightWidth: 1.7,
            borderTopWidth: 1.7,
            borderColor: c.tx3,
            transform: [{ rotate: '45deg' }],
            marginRight: 3,
        }} />
    );
}

function LiveVisitContent({ elapsed }: { elapsed: number }) {
    const { c } = useTheme();
    return (
        <>
            <View style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.or + '2E',
            }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.or }} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: 14.5,
                    fontWeight: '800',
                    letterSpacing: -0.29,
                }}>
                    Ayşe Yılmaz · işlemde
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 12, fontWeight: '600' }}>
                    Saç boyama + fön
                </Text>
            </View>

            <Text style={[{
                color: c.or2,
                fontSize: 19,
                fontWeight: '800',
                letterSpacing: -0.57,
            }, numeric]}>
                {formatElapsed(elapsed)}
            </Text>
            <View style={{ transform: [{ rotate: '0deg' }] }}>
                <NextChevron />
            </View>
        </>
    );
}

function LiveVisit({
    elapsed,
    hidden,
    reduceMotion,
    reveal,
    onPress,
}: {
    elapsed: number;
    hidden: boolean;
    reduceMotion: boolean;
    reveal: Animated.Value;
    onPress: () => void;
}) {
    const { c } = useTheme();
    return (
        <Animated.View
            pointerEvents={hidden ? 'none' : 'auto'}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
            style={{
                opacity: reveal,
                transform: [{
                    translateY: reveal.interpolate({
                        inputRange: [0, 1],
                        outputRange: reduceMotion ? [0, 0] : [6, 0],
                    }),
                }],
            }}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ayşe Yılmaz devam eden işlem"
                onPress={onPress}
                style={({ pressed }) => ({
                    minHeight: 58,
                    marginTop: 10,
                    marginHorizontal: 14,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: c.or + '42',
                    backgroundColor: c.or + '1A',
                    opacity: pressed ? 0.72 : 1,
                })}
            >
                <LiveVisitContent elapsed={elapsed} />
            </Pressable>
        </Animated.View>
    );
}

function VisitStartMorph({
    elapsed,
    progress,
    source,
    target,
}: {
    elapsed: number;
    progress: Animated.Value;
    source: MorphRect;
    target: MorphRect;
}) {
    const { c } = useTheme();
    const labelOpacity = progress.interpolate({
        inputRange: [0, 0.18, 0.48, 1],
        outputRange: [1, 0.8, 0, 0],
    });
    const liveOpacity = progress.interpolate({
        inputRange: [0, 0.5, 0.76, 1],
        outputRange: [0, 0, 1, 1],
    });
    const containerOpacity = progress.interpolate({
        inputRange: [0, 0.84, 1],
        outputRange: [1, 1, 0],
    });

    return (
        <View
            pointerEvents="box-only"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                zIndex: 200,
                elevation: 20,
            }}
        >
            <Animated.View style={{
                position: 'absolute',
                left: progress.interpolate({ inputRange: [0, 1], outputRange: [source.x, target.x] }),
                top: progress.interpolate({ inputRange: [0, 1], outputRange: [source.y, target.y] }),
                width: progress.interpolate({ inputRange: [0, 1], outputRange: [source.width, target.width] }),
                height: progress.interpolate({ inputRange: [0, 1], outputRange: [source.height, target.height] }),
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 11,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: progress.interpolate({
                    inputRange: [0, 0.55, 1],
                    outputRange: [c.or, c.or, c.or + '42'],
                }),
                backgroundColor: progress.interpolate({
                    inputRange: [0, 0.55, 1],
                    outputRange: [c.or, c.or, c.or + '1A'],
                }),
                opacity: containerOpacity,
                overflow: 'hidden',
            }}>
                <Animated.View style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: labelOpacity,
                }}>
                    <Text style={{
                        color: '#fff',
                        fontSize: 19,
                        fontWeight: '800',
                        letterSpacing: -0.38,
                    }}>
                        İşleme başla
                    </Text>
                </Animated.View>

                <Animated.View style={{
                    alignSelf: 'stretch',
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    opacity: liveOpacity,
                    transform: [{
                        translateY: progress.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [6, 6, 0],
                        }),
                    }],
                }}>
                    <LiveVisitContent elapsed={elapsed} />
                </Animated.View>
            </Animated.View>
        </View>
    );
}

function TopBar({ staffName, role }: { staffName: string; role: string }) {
    const { c, glass } = useTheme();
    const barStyle: ViewStyle = {
        height: 52,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: c.glassBorder,
    };
    const content = (
        <>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: 16,
                    fontWeight: '800',
                    letterSpacing: -0.32,
                }}>
                    {staffName} · {role}
                </Text>
                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: 11.5,
                    fontWeight: '600',
                }}>
                    Studio Ayla — Kadıköy
                </Text>
            </View>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bildirimler"
                onPress={() => undefined}
                style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.55 : 1,
                })}
            >
                <BellIcon />
                <View style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: c.glass,
                    backgroundColor: c.or,
                }} />
            </Pressable>
        </>
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={barStyle}>
                {content}
            </GlassView>
        );
    }

    return <View style={[barStyle, { backgroundColor: c.surf }]}>{content}</View>;
}

function Chip({
    children,
    warning = false,
    success = false,
}: {
    children: string;
    warning?: boolean;
    success?: boolean;
}) {
    const { c } = useTheme();
    const color = warning ? c.am : success ? c.gr : c.tx2;
    return (
        <View style={{
            height: 32,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 11,
            backgroundColor: warning ? c.am + '21' : success ? c.gr + '1F' : c.surf2,
        }}>
            <Text style={{
                color,
                fontSize: 13,
                fontWeight: '600',
            }}>
                {children}
            </Text>
        </View>
    );
}

export default function Today() {
    const { c, small, reduceMotion, prefersCrossFade } = useTheme();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const router = useRouter();
    const params = useLocalSearchParams<{ name?: string; role?: string }>();
    const fullName = param(params.name, 'Merve Kaya');
    const staffName = fullName.split(' ')[0] || fullName;
    const role = param(params.role, 'Kuaför');
    const [active, setActive] = useState(false);
    const [timerRunning, setTimerRunning] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    const [morphSource, setMorphSource] = useState<MorphRect | null>(null);
    const [elapsed, setElapsed] = useState(TEST_ELAPSED_SECONDS);
    const rootRef = useRef<View>(null);
    const ctaRef = useRef<View>(null);
    const scrollOffsetRef = useRef(0);
    const mountedRef = useRef(true);
    const transitionLockRef = useRef(false);
    const transitionRef = useRef<Animated.CompositeAnimation | null>(null);
    const morphProgress = useRef(new Animated.Value(0)).current;
    const liveReveal = useRef(new Animated.Value(1)).current;
    const cardContentOpacity = useRef(new Animated.Value(1)).current;
    const pressScale = useRef(new Animated.Value(1)).current;

    const morphTarget: MorphRect = {
        x: 14,
        y: insets.top + 52 + 10,
        width: windowWidth - 28,
        height: 58,
    };
    const fontScale = PixelRatio.getFontScale();

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            transitionRef.current?.stop();
        };
    }, []);

    useEffect(() => {
        if (!timerRunning) return;
        const id = setInterval(() => setElapsed((current) => current + 1), 1000);
        return () => clearInterval(id);
    }, [timerRunning]);

    const finishStartTransition = () => {
        if (!mountedRef.current) return;
        liveReveal.setValue(1);
        cardContentOpacity.setValue(1);
        pressScale.setValue(1);
        setMorphSource(null);
        setTimerRunning(true);
        setTransitioning(false);
        transitionLockRef.current = false;
        AccessibilityInfo.announceForAccessibility('Ayşe Yılmaz işlemi başladı');
    };

    const revealWithoutMorph = () => {
        const shouldCrossFade = reduceMotion !== true || prefersCrossFade;
        liveReveal.setValue(shouldCrossFade ? 0 : 1);
        setElapsed(TEST_ELAPSED_SECONDS);

        const showActiveLayout = () => {
            if (!mountedRef.current) return;
            if (reduceMotion === false) {
                LayoutAnimation.configureNext(VISIT_LAYOUT_ANIMATION);
            }
            setActive(true);

            if (!shouldCrossFade) {
                finishStartTransition();
                return;
            }

            requestAnimationFrame(() => {
                const animation = Animated.parallel([
                    Animated.timing(liveReveal, {
                        toValue: 1,
                        duration: reduceMotion === true ? 130 : 220,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: true,
                    }),
                    Animated.timing(cardContentOpacity, {
                        toValue: 1,
                        duration: reduceMotion === true ? 100 : 170,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: true,
                    }),
                ]);
                transitionRef.current = animation;
                animation.start(() => finishStartTransition());
            });
        };

        if (!shouldCrossFade) {
            showActiveLayout();
            return;
        }

        Animated.timing(cardContentOpacity, {
            toValue: 0,
            duration: reduceMotion === true ? 50 : 80,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
        }).start(showActiveLayout);
    };

    const beginMorph = (source: MorphRect) => {
        const validSource = source.width > 0
            && source.height > 0
            && source.y > morphTarget.y
            && source.y < windowHeight
            && scrollOffsetRef.current <= 2
            && fontScale <= 1.2;

        if (!validSource || reduceMotion !== false) {
            revealWithoutMorph();
            return;
        }

        morphProgress.setValue(0);
        liveReveal.setValue(0);
        setElapsed(TEST_ELAPSED_SECONDS);
        setMorphSource(source);

        requestAnimationFrame(() => {
            if (!mountedRef.current) return;
            const animation = Animated.parallel([
                    Animated.timing(morphProgress, {
                        toValue: 1,
                        duration: 600,
                        easing: Easing.bezier(0.22, 1, 0.36, 1),
                        useNativeDriver: false,
                    }),
                    Animated.timing(liveReveal, {
                        toValue: 1,
                        delay: 450,
                        duration: 150,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]);
            transitionRef.current = animation;
            animation.start(() => finishStartTransition());

            Animated.timing(cardContentOpacity, {
                toValue: 0,
                duration: 80,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            }).start(() => {
                if (!mountedRef.current) return;
                LayoutAnimation.configureNext(VISIT_LAYOUT_ANIMATION);
                setActive(true);
                requestAnimationFrame(() => {
                    Animated.timing(cardContentOpacity, {
                        toValue: 1,
                        duration: 180,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: true,
                    }).start();
                });
            });
        });
    };

    const startVisit = () => {
        if (active || transitionLockRef.current) return;
        transitionLockRef.current = true;
        setTransitioning(true);
        feedback.medium();

        Animated.timing(pressScale, {
            toValue: 1,
            duration: 70,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();

        const node = ctaRef.current;
        if (!node) {
            revealWithoutMorph();
            return;
        }

        requestAnimationFrame(() => {
            node.measureInWindow((x, y, width, height) => {
                if (!mountedRef.current) return;
                const root = rootRef.current;
                if (!root) {
                    revealWithoutMorph();
                    return;
                }
                root.measureInWindow((rootX, rootY) => {
                    if (!mountedRef.current) return;
                    beginMorph({
                        x: x - rootX,
                        y: y - rootY,
                        width,
                        height,
                    });
                });
            });
        });
    };

    const appointments = active ? REST.slice(1) : REST;

    return (
        <View ref={rootRef} collapsable={false} style={{ flex: 1, backgroundColor: c.bg }}>
            <View style={{ flex: 1, paddingTop: insets.top }}>
                <TopBar staffName={staffName} role={role} />

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 122 }}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!transitioning}
                    scrollEventThrottle={16}
                    onScroll={(event) => {
                        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
                    }}
                >
                    {active ? (
                        <LiveVisit
                            elapsed={elapsed}
                            hidden={transitioning}
                            reduceMotion={reduceMotion !== false}
                            reveal={liveReveal}
                            onPress={() => router.push('/visit')}
                        />
                    ) : null}

                    <View style={{ paddingTop: active ? 14 : 18, paddingHorizontal: 20, paddingBottom: 12, gap: 3 }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: 30,
                        lineHeight: 31.5,
                        fontWeight: '800',
                        letterSpacing: -1.05,
                    }}>
                        Bugün
                    </Text>
                    <Text style={{ color: c.tx2, fontSize: 14, fontWeight: '600' }}>
                        {active ? 'Salı, 11 Ağustos · 4 randevu kaldı' : 'Salı, 11 Ağustos · 5 randevunuz var'}
                    </Text>
                </View>

                <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        minHeight: small ? 190 : undefined,
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.card,
                        overflow: 'hidden',
                    }}>
                        <Animated.View style={{ opacity: cardContentOpacity }}>
                            <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={active ? 'Zeynep Ak randevusu' : 'Ayşe Yılmaz randevu detayı'}
                            disabled={transitioning}
                            onPress={() => router.push('/appointment')}
                            style={({ pressed }) => ({
                                paddingTop: 20,
                                paddingHorizontal: 20,
                                paddingBottom: 18,
                                gap: 14,
                                opacity: pressed ? 0.62 : 1,
                            })}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                                <ClockIcon />
                                <Text style={{
                                    color: c.or,
                                    fontSize: 12.5,
                                    fontWeight: '700',
                                    letterSpacing: 1.25,
                                    textTransform: 'uppercase',
                                }}>
                                    {active ? 'Sıradaki · 12:30' : 'Sıradaki · 10:00'}
                                </Text>
                            </View>

                            <View style={{ gap: 5 }}>
                                <Text numberOfLines={1} style={{
                                    color: c.tx,
                                    fontSize: 34,
                                    lineHeight: 35,
                                    fontWeight: '800',
                                    letterSpacing: -1.36,
                                }}>
                                    {active ? 'Zeynep Ak' : 'Ayşe Yılmaz'}
                                </Text>
                                <Text numberOfLines={1} style={{
                                    color: c.tx,
                                    fontSize: 18,
                                    fontWeight: '600',
                                    letterSpacing: -0.27,
                                }}>
                                    {active ? 'Fön' : 'Saç boyama + fön'}
                                </Text>
                            </View>

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                <Chip>{active ? '30 dk' : '120 dk'}</Chip>
                                <Chip>{active ? '₺350' : '₺1.800'}</Chip>
                                {active ? <Chip success>Paketli müşteri</Chip> : <Chip warning>Alerji notu var</Chip>}
                            </View>
                            </Pressable>

                            <View style={{ height: 1, backgroundColor: c.bd }} />

                            <View style={{ padding: 14 }}>
                                <Animated.View style={{ transform: [{ scale: pressScale }] }}>
                                    <View ref={ctaRef} collapsable={false}>
                                        <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={active ? 'Sırası gelince başlat' : 'İşleme başla'}
                                        accessibilityState={{ disabled: active || transitioning }}
                                        disabled={active || transitioning}
                                        onPress={startVisit}
                                        onPressIn={() => {
                                            if (active || transitioning || reduceMotion !== false) return;
                                            Animated.timing(pressScale, {
                                                toValue: 0.98,
                                                duration: 80,
                                                easing: Easing.out(Easing.cubic),
                                                useNativeDriver: true,
                                            }).start();
                                        }}
                                        onPressOut={() => {
                                            Animated.timing(pressScale, {
                                                toValue: 1,
                                                duration: 120,
                                                easing: Easing.out(Easing.cubic),
                                                useNativeDriver: true,
                                            }).start();
                                        }}
                                        style={({ pressed }) => ({
                                            height: 66,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: 18,
                                            borderWidth: active ? 1 : 0,
                                            borderColor: c.bd,
                                            backgroundColor: active ? c.surf2 : c.or,
                                            opacity: pressed ? 0.9 : 1,
                                        })}
                                        >
                                            <Text style={{
                                            color: active ? c.tx : '#fff',
                                            fontSize: 19,
                                            fontWeight: '800',
                                            letterSpacing: -0.38,
                                            }}>
                                                {active ? 'Sırası gelince başlat' : 'İşleme başla'}
                                            </Text>
                                        </Pressable>
                                    </View>
                                </Animated.View>
                            </View>
                        </Animated.View>
                    </View>
                </View>

                <View style={{
                    paddingTop: 22,
                    paddingHorizontal: 20,
                    paddingBottom: 9,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <Text style={{
                        color: c.tx2,
                        fontSize: 11.5,
                        fontWeight: '700',
                        letterSpacing: 1.84,
                        textTransform: 'uppercase',
                    }}>
                        Günün kalanı
                    </Text>
                    <Text style={{ color: c.or, fontSize: 12.5, fontWeight: '700' }}>
                        {active ? '4 randevu' : 'Tümü'}
                    </Text>
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: c.bd }}>
                    {appointments.map((appointment) => (
                        <Pressable
                            key={appointment.time}
                            accessibilityRole="button"
                            disabled={transitioning}
                            onPress={() => undefined}
                            style={({ pressed }) => ({
                                minHeight: 62,
                                paddingVertical: 10,
                                paddingHorizontal: 18,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 13,
                                borderBottomWidth: 1,
                                borderBottomColor: c.bd,
                                opacity: pressed ? 0.58 : 1,
                            })}
                        >
                            <Text style={[{
                                width: 46,
                                color: c.tx,
                                fontSize: 14.5,
                                fontWeight: '800',
                                letterSpacing: -0.29,
                            }, numeric]}>
                                {appointment.time}
                            </Text>
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Text numberOfLines={1} style={{
                                    color: c.tx,
                                    fontSize: 15.5,
                                    fontWeight: '700',
                                    letterSpacing: -0.23,
                                }}>
                                    {appointment.name}
                                </Text>
                                <Text numberOfLines={1} style={{
                                    color: c.tx2,
                                    fontSize: 13,
                                    fontWeight: '500',
                                }}>
                                    {appointment.service}
                                </Text>
                            </View>
                            <NextChevron />
                        </Pressable>
                    ))}
                </View>
            </ScrollView>
            </View>

            {morphSource ? (
                <VisitStartMorph
                    elapsed={elapsed}
                    progress={morphProgress}
                    source={morphSource}
                    target={morphTarget}
                />
            ) : null}
        </View>
    );
}
