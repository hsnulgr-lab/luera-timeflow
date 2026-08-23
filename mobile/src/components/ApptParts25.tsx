import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import type { ApptIdentity, ChangeRow, ChangeTile, StateLine, VisitSummary } from '../lib/appointmentDetail';
import { upperTR } from '../lib/text';
import {
    apptInCurve, apptCardMetrics, apptMotion, font, hit, radius, panelInk, useTheme,
} from '../theme';

/**
 * Müdür 25'in parçaları.
 *
 * Hareket sözleşmesi: yalnız opaklık, translate ve scale — hepsi
 * `useNativeDriver` ile. Yükseklik, renk, yarıçap, gölge animasyonu YOK.
 * Renk değişimi iki yüzeyin üst üste soldurulmasıyla yapılır.
 */

const IN = Easing.bezier(...apptInCurve);

// ── Kademeli giriş ──────────────────────────────────────────────────────────

/**
 * Sayfanın içeriği üç kademede gelir: kim ve ne zaman → durum ve karar →
 * geçmiş ve düzenleme. Yıkıcı bölge kademesizdir; son kademeyle birlikte
 * gelir ve dikkat çekmez.
 */
export function useStagger(reduceMotion: boolean) {
    const values = useRef(apptMotion.stage.steps.map(() => new Animated.Value(0))).current;

    useEffect(() => {
        if (reduceMotion) {
            // Hareketi azalt: kademe yok, sayfa tek karede tam gelir.
            values.forEach((value) => value.setValue(1));
            return;
        }
        const runs = values.map((value, index) => Animated.timing(value, {
            toValue: 1,
            duration: apptMotion.stage.duration,
            delay: apptMotion.stage.steps[index],
            easing: IN,
            useNativeDriver: true,
        }));
        Animated.parallel(runs).start();
    }, [reduceMotion, values]);

    return values;
}

export function Stage({ at, values, style, children }: {
    at: 0 | 1 | 2;
    values: Animated.Value[];
    style?: StyleProp<ViewStyle>;
    children: ReactNode;
}) {
    const value = values[at] ?? values[values.length - 1];
    return (
        <Animated.View style={[style, {
            opacity: value,
            transform: [{
                translateY: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [apptMotion.stage.rise, 0],
                }),
            }],
        }]}>
            {children}
        </Animated.View>
    );
}

// ── Kimlik: gün MUTLAKA görünür ─────────────────────────────────────────────

export function Identity({ identity }: { identity: ApptIdentity }) {
    const { c, small } = useTheme();
    return (
        <View style={{ gap: apptCardMetrics.identGap }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: apptCardMetrics.dayText,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: apptCardMetrics.dayText * apptCardMetrics.dayTrack,
                }}>
                    {upperTR(identity.day)}
                </Text>
                {/* Turuncu YALNIZ zaman ve eylem taşır; "Bugün" bir zaman. */}
                {identity.isToday ? (
                    <Text style={{
                        color: c.or,
                        fontSize: apptCardMetrics.dayText,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: apptCardMetrics.dayText * apptCardMetrics.dayTrack,
                    }}>
                        {upperTR('Bugün')}
                    </Text>
                ) : null}
            </View>

            {/* Saat KIRPILMAZ: 375'te punto iner, metin kısalmaz. */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: apptCardMetrics.spanGap,
                flexShrink: 0,
            }}>
                <Num size={small ? apptCardMetrics.spanTextSmall : apptCardMetrics.spanText} style={{
                    color: c.tx,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: apptCardMetrics.spanText * -0.03,
                }}>
                    {identity.from}
                </Num>
                <Num size={small ? apptCardMetrics.spanTextSmall : apptCardMetrics.spanText} style={{
                    color: c.tx3,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: apptCardMetrics.spanText * -0.03,
                }}>
                    {`– ${identity.to}`}
                </Num>
                <Text style={{
                    color: c.tx2,
                    fontSize: apptCardMetrics.spanDur,
                    fontFamily: font.bold,
                    fontWeight: '700',
                }}>
                    {`· ${identity.duration} dk`}
                </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <IdentPill text={identity.service} />
                <IdentPill
                    text={identity.staff ?? 'Atanmamış'}
                    initials={identity.staff ? identity.initials : '—'}
                    assigned={identity.staff !== null}
                />
            </View>
        </View>
    );
}

function IdentPill({ text, initials, assigned = true }: {
    text: string;
    initials?: string;
    assigned?: boolean;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 32,
            paddingLeft: initials ? 6 : 12,
            paddingRight: 12,
            borderRadius: 10,
            maxWidth: 220,
            backgroundColor: c.surf2,
        }}>
            {initials ? (
                <View style={{
                    width: 20,
                    height: 20,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    // Atanmamışlık ne zaman ne eylem: turuncu halka almaz.
                    borderColor: assigned ? c.or : c.tx3,
                }}>
                    <Text style={{
                        color: assigned ? c.tx : c.tx2,
                        fontSize: 9,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                    }}>
                        {initials}
                    </Text>
                </View>
            ) : null}
            <Text numberOfLines={1} style={{
                color: c.tx,
                fontSize: 13,
                fontFamily: font.semiBold,
                fontWeight: '600',
                flexShrink: 1,
            }}>
                {text}
            </Text>
        </View>
    );
}

// ── Durum şeridi ────────────────────────────────────────────────────────────

/**
 * Şeridin YÜZEYİ hiç kıpırdamaz — r14, h52, aynı yerde. "Geldi"ye basınca
 * yalnız içeriği takas edilir; dönüşüm izlenimi bundan çıkar.
 */
export function StateStrip({ line, entering }: { line: StateLine; entering: Animated.Value }) {
    const { c } = useTheme();
    const pulse = usePulse(line.pulse);

    const tone = line.kind === 'done' ? c.gr
        : line.kind === 'cancelled' ? c.rd
            : line.kind === 'waiting' ? c.tx
                : c.am;
    const dot = line.kind === 'waiting' ? c.tx3 : tone;

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: apptCardMetrics.stateGap,
            height: apptCardMetrics.stateHeight,
            paddingHorizontal: apptCardMetrics.statePadX,
            borderRadius: apptCardMetrics.stateRadius,
            backgroundColor: c.surf2,
        }}>
            <Animated.View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: apptCardMetrics.stateGap,
                flex: 1,
                opacity: entering,
                transform: [{
                    translateY: entering.interpolate({
                        inputRange: [0, 1],
                        outputRange: [apptMotion.arrive.rise, 0],
                    }),
                }],
            }}>
                <Animated.View style={{
                    width: apptCardMetrics.stateDot,
                    height: apptCardMetrics.stateDot,
                    borderRadius: apptCardMetrics.stateDot,
                    backgroundColor: dot,
                    opacity: pulse,
                }} />
                <Text numberOfLines={1} style={{
                    color: tone,
                    fontSize: apptCardMetrics.stateWord,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: apptCardMetrics.stateWord * -0.01,
                    flexShrink: 1,
                }}>
                    {line.word}
                </Text>
                {line.context ? (
                    <Text numberOfLines={1} style={{
                        marginLeft: 'auto',
                        color: c.tx2,
                        fontSize: apptCardMetrics.stateContext,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {line.context}
                    </Text>
                ) : null}
            </Animated.View>
        </View>
    );
}

/** İşlem sürerken nabız. Opaklık — renk animasyonu değil. */
function usePulse(active: boolean) {
    const { reduceMotion } = useTheme();
    const value = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!active || reduceMotion) {
            value.setValue(1);
            return;
        }
        const half = apptCardMetrics.statePulse / 2;
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(value, { toValue: 0.45, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(value, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [active, reduceMotion, value]);

    return value;
}

// ── Geldi / Gelmedi ─────────────────────────────────────────────────────────

export function AttendanceRow({ leaving, onAnswer }: {
    leaving: Animated.Value;
    onAnswer: (arrived: boolean) => void;
}) {
    return (
        <Animated.View style={{
            flexDirection: 'row',
            gap: apptCardMetrics.actGap,
            opacity: leaving,
            transform: [{
                translateY: leaving.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-apptMotion.arrive.lift, 0],
                }),
            }],
        }}>
            <AttendanceButton label="Geldi" fill onPress={() => onAnswer(true)} />
            <AttendanceButton label="Gelmedi" onPress={() => onAnswer(false)} />
        </Animated.View>
    );
}

function AttendanceButton({ label, fill = false, onPress }: {
    label: string;
    fill?: boolean;
    onPress: () => void;
}) {
    const { c, reduceMotion } = useTheme();
    const press = useRef(new Animated.Value(1)).current;

    const tap = () => {
        if (fill) feedback.success(); else feedback.warning();
        if (!reduceMotion) {
            Animated.sequence([
                Animated.timing(press, {
                    toValue: apptMotion.arrive.pressScale,
                    duration: apptMotion.arrive.press / 2,
                    useNativeDriver: true,
                }),
                Animated.timing(press, { toValue: 1, duration: apptMotion.arrive.press / 2, useNativeDriver: true }),
            ]).start();
        }
        onPress();
    };

    return (
        <Animated.View style={{ flex: 1, transform: [{ scale: press }] }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={tap}
                style={({ pressed }) => ({
                    height: apptCardMetrics.actHeight,
                    borderRadius: apptCardMetrics.actRadius,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: fill ? c.or : 'transparent',
                    borderWidth: fill ? 0 : apptCardMetrics.actBorder,
                    borderColor: c.bd2,
                    opacity: pressed ? 0.85 : 1,
                })}
            >
                <Text style={{
                    color: fill ? '#FFFFFF' : c.tx,
                    fontSize: apptCardMetrics.actText,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: apptCardMetrics.actText * -0.02,
                }}>
                    {label}
                </Text>
            </Pressable>
        </Animated.View>
    );
}

// ── Müşteri özeti ───────────────────────────────────────────────────────────

/**
 * İki anatomi, tek çerçeve.
 *
 * `known` krem kart: sayfanın TERSİ düzlem — "başka bir yere açılan kapı".
 * `new` kenarlıklı kart: sayfanın kendi düzlemi — açacak bir şey yok, o
 * yüzden OK DA YOK.
 */
export function VisitPanel({ summary, onOpen }: {
    summary: VisitSummary;
    onOpen?: () => void;
}) {
    const { c, dark } = useTheme();
    const known = summary.kind === 'known';
    const ink = dark ? panelInk.dark : panelInk.light;

    const bodyInk = known ? ink.ink : c.tx;
    const subInk = known ? ink.ink2 : c.tx2;

    return (
        <View style={{
            gap: apptCardMetrics.newGap,
            padding: apptCardMetrics.newPadding,
            borderRadius: apptCardMetrics.newRadius,
            backgroundColor: known ? ink.panel : 'transparent',
            borderWidth: known ? 0 : 1,
            borderColor: c.bd,
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                    width: 42,
                    height: 42,
                    borderRadius: radius.pill,
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    justifyContent: 'center',
                    backgroundColor: known ? 'rgba(14,14,14,0.07)' : 'transparent',
                    borderWidth: known ? 0 : apptCardMetrics.newTokenDash,
                    borderStyle: known ? 'solid' : 'dashed',
                    borderColor: c.bd2,
                }}>
                    {known ? (
                        <>
                            <Num size={21} style={{
                                color: ink.ink,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                            }}>
                                {summary.lead}
                            </Num>
                            <Num size={13.5} style={{
                                color: ink.ink,
                                opacity: 0.42,
                                fontFamily: font.bold,
                                fontWeight: '700',
                            }}>
                                {summary.trailing}
                            </Num>
                        </>
                    ) : (
                        // Sıfır bir ÖLÇÜM, "İlk" bir HÂL.
                        <Text style={{
                            color: c.tx2,
                            fontSize: apptCardMetrics.newTokenText,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            alignSelf: 'center',
                        }}>
                            {summary.lead}
                        </Text>
                    )}
                </View>

                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={1} style={{
                        color: bodyInk,
                        fontSize: 16,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: -0.32,
                    }}>
                        {summary.headline}
                    </Text>
                    <Text numberOfLines={1} style={{
                        color: subInk,
                        fontSize: 13,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {summary.sub}
                    </Text>
                </View>

                {/* Ok VAR çünkü açacak bir şey var. Yoksa hiç çizilmez. */}
                {summary.opens && onOpen ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Müşteri kartını aç"
                        onPress={() => { feedback.selection(); onOpen(); }}
                        style={({ pressed }) => ({
                            width: 36,
                            height: 36,
                            borderRadius: radius.pill,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: ink.pill,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ink.pillInk} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M5 12h13M12 6l6 6-6 6" />
                        </Svg>
                    </Pressable>
                ) : null}
            </View>

            {summary.chips.length + summary.quiet.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {summary.chips.map((label) => (
                        <VisitChip key={label} label={label} known={known} />
                    ))}
                    {summary.quiet.map((label) => (
                        <VisitChip key={label} label={label} known={known} quiet />
                    ))}
                </View>
            ) : null}
        </View>
    );
}

function VisitChip({ label, known, quiet = false }: {
    label: string;
    known: boolean;
    quiet?: boolean;
}) {
    const { c, dark } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;
    const solid = known && !quiet;
    return (
        <View style={{
            height: 36,
            paddingHorizontal: 13,
            borderRadius: 14,
            justifyContent: 'center',
            backgroundColor: solid ? ink.pill : 'transparent',
            borderWidth: solid ? 0 : 1,
            borderColor: known ? ink.line : c.bd,
        }}>
            <Text style={{
                color: solid ? ink.pillInk : known ? ink.ink2 : c.tx2,
                fontSize: 13,
                fontFamily: font.bold,
                fontWeight: '700',
            }}>
                {label}
            </Text>
        </View>
    );
}

// ── Jetonlar: saat · personel ───────────────────────────────────────────────

export function ChangeTiles({ tiles, onPress }: {
    tiles: ChangeTile[];
    onPress: (action: 'time' | 'staff') => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', gap: apptCardMetrics.tileGap }}>
            {tiles.map((tile) => (
                <Pressable
                    key={tile.action}
                    accessibilityRole="button"
                    accessibilityLabel={`${tile.kicker}. Şu an ${tile.value}`}
                    onPress={() => { feedback.selection(); onPress(tile.action); }}
                    style={({ pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        height: apptCardMetrics.tileHeight,
                        borderRadius: apptCardMetrics.tileRadius,
                        paddingVertical: apptCardMetrics.tilePadY,
                        paddingHorizontal: apptCardMetrics.tilePadX,
                        justifyContent: 'space-between',
                        backgroundColor: c.surf2,
                        opacity: pressed ? 0.75 : 1,
                    })}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: apptCardMetrics.tileKickerGap }}>
                        <TileIcon kind={tile.icon} />
                        <Text numberOfLines={1} style={{
                            color: c.tx2,
                            fontSize: apptCardMetrics.tileKicker,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: apptCardMetrics.tileKicker * apptCardMetrics.tileKickerTrack,
                            flexShrink: 1,
                        }}>
                            {upperTR(tile.kicker)}
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {tile.initials ? (
                            <View style={{
                                width: apptCardMetrics.tileAvatar,
                                height: apptCardMetrics.tileAvatar,
                                borderRadius: radius.pill,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: apptCardMetrics.tileAvatarBorder,
                                borderColor: c.or,
                            }}>
                                <Text style={{
                                    color: c.tx,
                                    fontSize: apptCardMetrics.tileAvatarText,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                }}>
                                    {tile.initials}
                                </Text>
                            </View>
                        ) : null}
                        {tile.action === 'time' ? (
                            <Num size={apptCardMetrics.tileValue} style={{
                                color: c.tx,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: apptCardMetrics.tileValue * -0.02,
                            }}>
                                {tile.value}
                            </Num>
                        ) : (
                            <Text numberOfLines={1} style={{
                                color: c.tx,
                                fontSize: apptCardMetrics.tileValue,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: apptCardMetrics.tileValue * -0.02,
                                flexShrink: 1,
                            }}>
                                {tile.value}
                            </Text>
                        )}
                    </View>
                </Pressable>
            ))}
        </View>
    );
}

function TileIcon({ kind }: { kind: 'clock' | 'swap' }) {
    const { c } = useTheme();
    const size = apptCardMetrics.tileIcon;
    if (kind === 'clock') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={9} stroke={c.tx2} strokeWidth={1.7} />
                <Path d="M12 7v5l3 2" stroke={c.tx2} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
        );
    }
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.tx2} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 8h13l-3-3M20 16H7l3 3" />
        </Svg>
    );
}

// ── Satırlar: hizmet · not ──────────────────────────────────────────────────

export function ChangeRows({ rows, onPress }: {
    rows: ChangeRow[];
    onPress: (action: 'service' | 'note') => void;
}) {
    const { c } = useTheme();
    return (
        <View>
            {rows.map((row, index) => (
                <Pressable
                    key={row.action}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.title}. Şu an ${row.value}`}
                    onPress={() => { feedback.selection(); onPress(row.action); }}
                    style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: apptCardMetrics.rowGap,
                        height: apptCardMetrics.rowHeight,
                        borderTopWidth: 1,
                        borderBottomWidth: index === rows.length - 1 ? 1 : 0,
                        borderColor: c.bd,
                        opacity: pressed ? 0.6 : 1,
                    })}
                >
                    <Text style={{
                        color: c.tx,
                        fontSize: apptCardMetrics.rowTitle,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: apptCardMetrics.rowTitle * -0.01,
                    }}>
                        {row.title}
                    </Text>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={{
                        marginLeft: 'auto',
                        maxWidth: apptCardMetrics.rowValueMax,
                        textAlign: 'right',
                        color: c.tx2,
                        fontSize: apptCardMetrics.rowValue,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {row.value}
                    </Text>
                    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={c.tx3} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M9 5l7 7-7 7" />
                    </Svg>
                </Pressable>
            ))}
        </View>
    );
}

// ── Yıkıcı bölge ────────────────────────────────────────────────────────────

export function DangerAction({ label, hint, icon, danger, onPress }: {
    label: string;
    hint: string;
    icon: 'ban' | 'trash';
    danger: boolean;
    onPress: () => void;
}) {
    const { c } = useTheme();
    // Kırmızı DOLU buton yok: yıkıcı eylem metin olarak, sola dayalı durur.
    const color = danger ? c.rd : c.tx2;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={hint}
            onPress={onPress}
            style={({ pressed }) => ({
                minHeight: hit.icon,
                flexDirection: 'row',
                alignItems: 'center',
                gap: apptCardMetrics.dangerRowGap,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <Svg
                width={apptCardMetrics.dangerIcon}
                height={apptCardMetrics.dangerIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {icon === 'trash'
                    ? <Path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                    : <Path d="M6 6l12 12M18 6L6 18" />}
            </Svg>
            <View style={{ gap: 2 }}>
                <Text style={{
                    color,
                    fontSize: apptCardMetrics.dangerText,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: apptCardMetrics.dangerText * -0.01,
                }}>
                    {label}
                </Text>
                <Text style={{
                    color: c.tx3,
                    fontSize: apptCardMetrics.dangerHint,
                    fontFamily: font.medium,
                    fontWeight: '500',
                }}>
                    {hint}
                </Text>
            </View>
        </Pressable>
    );
}

/** "Burada bir şey yok" demenin en sessiz yolu: kutu değil, kenarlıklı satır. */
export function InfoLine({ text }: { text: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            justifyContent: 'center',
            minHeight: apptCardMetrics.infoHeight,
            paddingHorizontal: apptCardMetrics.statePadX,
            paddingVertical: 10,
            borderRadius: apptCardMetrics.stateRadius,
            borderWidth: 1,
            borderColor: c.bd,
        }}>
            <Text style={{
                color: c.tx2,
                fontSize: apptCardMetrics.infoText,
                fontFamily: font.semiBold,
                fontWeight: '600',
            }}>
                {text}
            </Text>
        </View>
    );
}
