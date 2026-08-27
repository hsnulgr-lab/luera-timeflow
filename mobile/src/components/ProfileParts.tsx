import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
    AccessibilityInfo,
    Alert,
    Animated,
    Easing,
    Pressable,
    Text,
    View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { upperTR } from '../lib/text';
import {
    cardSkin,
    font,
    profileMetrics as M,
    profileMotion as MO,
    radius,
    useTheme,
} from '../theme';

/**
 * Müdür 27 — profilin parçaları.
 *
 * Üç ağırlık, üç niyet: bir kart, iki büyük satır, dört küçük satır. Uzun bir
 * ayar listesi REDDEDİLDİ — hepsi aynı ağırlıkta olunca hiçbiri öne çıkmıyor.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 27 Profil.html`.
 */

const IN = Easing.bezier(0.2, 0.8, 0.25, 1);
const OUT = Easing.bezier(0.4, 0, 1, 1);

// ── Simgeler ────────────────────────────────────────────────────────────────

export function Chevron({ color, size = 20 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M8 4l6 6-6 6" />
        </Svg>
    );
}

export function BackIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 4l-6 6 6 6" />
        </Svg>
    );
}

export function PlusIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M10 4v12M4 10h12" />
        </Svg>
    );
}

export function MinusIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M4 10h12" />
        </Svg>
    );
}

export function TrashIcon({ color }: { color: string }) {
    return (
        <Svg width={19} height={19} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3.5 5.5h13M8 5.5V4h4v1.5M5.5 5.5l.8 10.2a1 1 0 0 0 1 .8h5.4a1 1 0 0 0 1-.8l.8-10.2" />
        </Svg>
    );
}

export function CheckIcon({ color, size = 15 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 10.5l4 4 8-9" />
        </Svg>
    );
}

export function ExternalIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M12 4h4v4M16 4l-7 7" />
        </Svg>
    );
}

// ── Üst çubuk ───────────────────────────────────────────────────────────────

export function ProfileNav({ title, onBack, right }: {
    title: string;
    onBack: () => void;
    right?: ReactNode;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            minHeight: M.navHeight,
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: 8,
            paddingLeft: 2,
        }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                onPress={() => { feedback.selection(); onBack(); }}
                style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                })}
            >
                <BackIcon color={c.tx} />
            </Pressable>
            <Text numberOfLines={1} style={{
                flex: 1,
                color: c.tx,
                fontSize: 19,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: 19 * -0.025,
            }}>
                {title}
            </Text>
            {right}
        </View>
    );
}

// ── Başlık bloğu ────────────────────────────────────────────────────────────

/**
 * Kartvizit başlık REDDEDİLDİ. Kimlik görünür ama üç satır ve 74 pt:
 * monogram, kapak görseli, büyük logo yok — hem veri modelinde görsel yok,
 * hem de sahip kendi salonunun adını tanımak için bakmıyor.
 */
export function ProfileHead({ name, sub }: { name: string; sub: string }) {
    const { c } = useTheme();
    return (
        <View style={{ gap: 3 }}>
            <Text style={{
                color: c.tx3,
                fontSize: M.kicker,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: M.kicker * M.kickerTrack,
            }}>
                {upperTR('Profil')}
            </Text>
            <Text numberOfLines={2} style={{
                color: c.tx,
                fontSize: M.headName,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: M.headName * M.headNameTrack,
                lineHeight: M.headName * 1.12,
            }}>
                {name}
            </Text>
            <Text numberOfLines={1} style={{
                color: c.tx2,
                fontSize: M.headSub,
                fontFamily: font.semiBold,
                fontWeight: '600',
            }}>
                {sub}
            </Text>
        </View>
    );
}

// ── Bugün kartı ─────────────────────────────────────────────────────────────

/**
 * Hem cümle hem kapı: hangi gün, hangi saatler, şu an açık mı.
 *
 * Kart iki temada da KOYU (Müdür 18'in malzemesi), o yüzden mürekkebi de
 * sabit: `c.tx` gibi temaya bakan jetonlar kullanılmaz.
 */
export function TodayCard({ card, onPress }: {
    card: {
        kicker: string;
        range: string | null;
        open: boolean;
        statusWord: string;
        countdown: string | null;
    };
    onPress: () => void;
}) {
    const { small } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${card.kicker}, ${card.range ?? 'kapalı'}, ${card.statusWord}`}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                gap: M.cardGap,
                paddingTop: M.cardPadTop,
                paddingHorizontal: M.cardPadX,
                paddingBottom: M.cardPadBottom,
                borderRadius: M.cardRadius,
                backgroundColor: cardSkin.bg,
                borderWidth: 1,
                borderColor: cardSkin.border,
                opacity: pressed ? 0.9 : 1,
            })}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{
                    color: cardSkin.tx2,
                    fontSize: M.cardKicker,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: M.cardKicker * M.cardKickerTrack,
                }}>
                    {card.kicker}
                </Text>
                {/* Durum KELİMEYLE yazılır; nokta yalnız ona eşlik eder. */}
                <View style={{
                    marginLeft: 'auto',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                }}>
                    <View style={{
                        width: M.cardDot,
                        height: M.cardDot,
                        borderRadius: radius.pill,
                        backgroundColor: card.open ? '#5FBF64' : cardSkin.tx2,
                    }} />
                    <Text style={{
                        color: card.open ? '#5FBF64' : cardSkin.tx2,
                        fontSize: M.cardStatus,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {card.statusWord}
                    </Text>
                </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                <Num
                    size={small ? M.cardHourSmall : M.cardHour}
                    style={{
                        color: cardSkin.tx,
                        fontWeight: '800',
                        letterSpacing: (small ? M.cardHourSmall : M.cardHour) * M.cardHourTrack,
                    }}
                >
                    {card.range ?? 'Kapalı'}
                </Num>
                <View style={{ marginLeft: 'auto', paddingBottom: 5 }}>
                    <Chevron color={cardSkin.tx2} />
                </View>
            </View>

            {/* Geri sayım yalnız açıkken. Turuncu, çünkü bu bir ZAMAN. */}
            {card.countdown ? (
                <Text style={{
                    color: cardSkin.tx2,
                    fontSize: M.cardFoot,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                }}>
                    {card.countdown.split(/(\d+ sa|\d+ dk)/).map((part, index) => (
                        /^\d/.test(part) ? (
                            <Text key={index} style={{ color: cardSkin.or, fontFamily: font.extraBold, fontWeight: '800' }}>
                                {part}
                            </Text>
                        ) : part
                    ))}
                </Text>
            ) : null}
        </Pressable>
    );
}

// ── Satır grubu ─────────────────────────────────────────────────────────────

export function Group({ head, children }: { head?: string; children: ReactNode }) {
    const { c } = useTheme();
    return (
        <View style={{
            borderWidth: 1,
            borderColor: c.bd,
            borderRadius: M.groupRadius,
            backgroundColor: c.surf,
            overflow: 'hidden',
        }}>
            {head ? (
                <Text style={{
                    paddingTop: 11,
                    paddingHorizontal: M.rowPadX,
                    paddingBottom: 7,
                    color: c.tx3,
                    fontSize: M.groupHead,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: M.groupHead * M.groupHeadTrack,
                }}>
                    {head}
                </Text>
            ) : null}
            {children}
        </View>
    );
}

export function ProfileRow({
    title,
    sub,
    value,
    big = false,
    danger = false,
    icon,
    chevron = true,
    first = false,
    right,
    onPress,
}: {
    title: string;
    sub?: string;
    value?: string;
    big?: boolean;
    danger?: boolean;
    icon?: ReactNode;
    chevron?: boolean;
    first?: boolean;
    right?: ReactNode;
    onPress?: () => void;
}) {
    const { c } = useTheme();
    const ink = danger ? c.rd : c.tx;

    const body = (
        <>
            {icon ? <View>{icon}</View> : null}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{
                    color: ink,
                    fontSize: big ? M.rowTitleBig : M.rowTitle,
                    fontFamily: big ? font.extraBold : font.bold,
                    fontWeight: big ? '800' : '700',
                    letterSpacing: (big ? M.rowTitleBig : M.rowTitle) * (big ? -0.025 : -0.015),
                }}>
                    {title}
                </Text>
                {sub ? (
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: M.rowSub,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {sub}
                    </Text>
                ) : null}
            </View>
            {value ? (
                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: M.rowValue,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                }}>
                    {value}
                </Text>
            ) : null}
            {right}
            {chevron ? <Chevron color={c.tx3} /> : null}
        </>
    );

    const style = ({ pressed }: { pressed: boolean }) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: M.rowGap,
        minHeight: big ? M.rowBigHeight : M.rowHeight,
        paddingHorizontal: M.rowPadX,
        borderTopWidth: first ? 0 : 1,
        borderColor: c.bd,
        backgroundColor: pressed && onPress ? c.surf2 : 'transparent',
    });

    if (!onPress) {
        return <View style={style({ pressed: false })}>{body}</View>;
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={value ? `${title}, ${value}` : title}
            onPress={() => { feedback.selection(); onPress(); }}
            style={style}
        >
            {body}
        </Pressable>
    );
}

// ── Anahtar ─────────────────────────────────────────────────────────────────

/**
 * Renk animasyonu YOK: iki ray üst üste duruyor, açık olan `opacity` ile
 * çapraz solar. Knob `translateX` ile kayar.
 *
 * Anahtarın rengi bilgi TAŞIMAZ — durumu knob'un yeri ve yanına yazılan
 * kelime taşır. Dokunma hedefi satırın tamamıdır; anahtar ayrı bir hedef
 * değil.
 */
export function ProfileSwitch({ value }: { value: boolean }) {
    const { c, reduceMotion } = useTheme();
    const on = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        if (reduceMotion) { on.setValue(value ? 1 : 0); return; }
        Animated.timing(on, {
            toValue: value ? 1 : 0,
            duration: MO.switchMs,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [value, reduceMotion, on]);

    const inset = (M.switchHeight - M.switchKnob) / 2;

    return (
        <View
            pointerEvents="none"
            style={{
                width: M.switchWidth,
                height: M.switchHeight,
                borderRadius: radius.pill,
            }}
        >
            {/* Kapalı ray */}
            <View style={{
                ...ABS,
                borderRadius: radius.pill,
                backgroundColor: c.surf2,
                borderWidth: 1,
                borderColor: c.bd2,
            }} />
            {/* Açık ray — üstte, opacity ile gelir */}
            <Animated.View style={{
                ...ABS,
                borderRadius: radius.pill,
                backgroundColor: c.tx,
                opacity: on,
            }} />
            <Animated.View style={{
                position: 'absolute',
                top: inset,
                left: inset,
                width: M.switchKnob,
                height: M.switchKnob,
                borderRadius: radius.pill,
                backgroundColor: c.surf,
                transform: [{
                    translateX: on.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, M.switchTravel],
                    }),
                }],
            }} />
        </View>
    );
}

const ABS = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

/** Anahtarlı satır — hedef satırın tamamı, kelime her hâlde ekranda. */
export function SwitchRow({ title, value, first = false, onToggle }: {
    title: string;
    value: boolean;
    first?: boolean;
    onToggle: () => void;
}) {
    const { c } = useTheme();
    const word = value ? 'Açık' : 'Kapalı';
    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: value }}
            accessibilityLabel={`${title}, ${word}`}
            onPress={() => { feedback.toggle(!value); onToggle(); }}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: M.rowGap,
                minHeight: M.rowHeight,
                paddingHorizontal: M.rowPadX,
                borderTopWidth: first ? 0 : 1,
                borderColor: c.bd,
                backgroundColor: pressed ? c.surf2 : 'transparent',
            })}
        >
            <Text numberOfLines={1} style={{
                flex: 1,
                color: c.tx,
                fontSize: M.rowTitle,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: M.rowTitle * -0.015,
            }}>
                {title}
            </Text>
            <Text style={{
                color: c.tx2,
                fontSize: M.rowValue,
                fontFamily: font.semiBold,
                fontWeight: '600',
            }}>
                {word}
            </Text>
            <ProfileSwitch value={value} />
        </Pressable>
    );
}

// ── Basamak ─────────────────────────────────────────────────────────────────

/**
 * Rakam SAYILMAZ, takas edilir: eski değer yukarı çıkıp söner, yeni değer
 * aşağıdan gelir. İki `Text` üst üste, kutu yüksekliği sabit.
 *
 * Düğmelerde `hitSlop` YOK — yanlışlıkla 15 dk kaymasın.
 */
export function Stepper({ label, value, onStep, disabled = false }: {
    label: string;
    value: string;
    onStep: (direction: -1 | 1) => void;
    disabled?: boolean;
}) {
    const { c, reduceMotion } = useTheme();
    const [shown, setShown] = useState(value);
    const [leaving, setLeaving] = useState<string | null>(null);
    const enter = useRef(new Animated.Value(1)).current;
    const exit = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (value === shown) return;
        if (reduceMotion) { setShown(value); setLeaving(null); return; }
        setLeaving(shown);
        setShown(value);
        exit.setValue(1);
        enter.setValue(0);
        Animated.timing(exit, {
            toValue: 0,
            duration: MO.digitOut,
            easing: OUT,
            useNativeDriver: true,
        }).start(({ finished }) => { if (finished) setLeaving(null); });
        Animated.timing(enter, {
            toValue: 1,
            duration: MO.digitIn,
            delay: MO.digitDelay,
            easing: IN,
            useNativeDriver: true,
        }).start();
    }, [value, shown, reduceMotion, enter, exit]);

    const button = (direction: -1 | 1) => (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={direction < 0 ? `${label} azalt` : `${label} artır`}
            disabled={disabled}
            onPress={() => { feedback.selection(); onStep(direction); }}
            style={({ pressed }) => ({
                width: M.stepperButton,
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
            })}
        >
            {direction < 0 ? <MinusIcon color={c.tx} /> : <PlusIcon color={c.tx} />}
        </Pressable>
    );

    return (
        <View style={{ gap: 7 }}>
            <Text style={{
                color: c.tx3,
                fontSize: M.groupHead,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: M.groupHead * M.groupHeadTrack,
            }}>
                {label}
            </Text>
            <View
                accessible
                accessibilityRole="adjustable"
                accessibilityValue={{ text: value }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) => {
                    if (disabled) return;
                    onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1);
                }}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: M.stepperHeight,
                    borderWidth: 1,
                    borderColor: c.bd2,
                    borderRadius: M.stepperRadius,
                    backgroundColor: c.surf2,
                    overflow: 'hidden',
                }}
            >
                {button(-1)}
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: c.bd }} />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    {leaving ? (
                        <Animated.View style={{
                            ...ABS,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: exit,
                            transform: [{
                                translateY: exit.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-MO.digitRise, 0],
                                }),
                            }],
                        }}>
                            <StepNumber text={leaving} />
                        </Animated.View>
                    ) : null}
                    <Animated.View style={{
                        opacity: enter,
                        transform: [{
                            translateY: enter.interpolate({
                                inputRange: [0, 1],
                                outputRange: [MO.digitRise, 0],
                            }),
                        }],
                    }}>
                        <StepNumber text={shown} />
                    </Animated.View>
                </View>
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: c.bd }} />
                {button(1)}
            </View>
        </View>
    );
}

function StepNumber({ text }: { text: string }) {
    const { c } = useTheme();
    return (
        <Num size={M.stepperNumber} style={{
            color: c.tx,
            fontWeight: '800',
            letterSpacing: M.stepperNumber * -0.02,
        }}>
            {text}
        </Num>
    );
}

// ── Haplar, alanlar, renkler ────────────────────────────────────────────────

export function Chips({ values, selected, onPick, suffix }: {
    values: readonly number[];
    selected: number;
    onPick: (value: number) => void;
    suffix?: string;
}) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
            {values.map((value) => {
                const on = value === selected;
                return (
                    <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${value}${suffix ? ` ${suffix}` : ''}`}
                        onPress={() => { feedback.selection(); onPick(value); }}
                        style={{
                            height: M.chipHeight,
                            paddingHorizontal: 15,
                            borderRadius: M.chipRadius,
                            borderWidth: 1,
                            borderColor: on ? c.tx : c.bd2,
                            backgroundColor: on ? c.tx : c.surf2,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Num size={M.chipText} style={{
                            color: on ? c.surf : c.tx,
                            fontWeight: '700',
                        }}>
                            {String(value)}
                        </Num>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function FieldLabel({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <Text style={{
            color: c.tx3,
            fontSize: M.groupHead,
            fontFamily: font.extraBold,
            fontWeight: '800',
            letterSpacing: M.groupHead * M.groupHeadTrack,
        }}>
            {children}
        </Text>
    );
}

export function ColorPicker({ colors, selected, onPick }: {
    colors: readonly { hex: string; name: string }[];
    selected: string;
    onPick: (hex: string) => void;
}) {
    const { c } = useTheme();
    const name = colors.find((color) => color.hex === selected)?.name;
    return (
        <View style={{ gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <FieldLabel>{upperTR('Takvim rengi')}</FieldLabel>
                {/* Renk tek başına anlam taşımaz: seçilenin ADI yanında yazar. */}
                {name ? (
                    <Text style={{
                        color: c.tx2,
                        fontSize: M.rowValue,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {name}
                    </Text>
                ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {colors.map((color) => (
                    <Pressable
                        key={color.hex}
                        accessibilityRole="button"
                        accessibilityState={{ selected: color.hex === selected }}
                        accessibilityLabel={color.name}
                        onPress={() => { feedback.selection(); onPick(color.hex); }}
                        style={{
                            width: M.swatch,
                            height: M.swatch,
                            borderRadius: M.swatchRadius,
                            backgroundColor: color.hex,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {color.hex === selected ? <CheckIcon color="#FFFFFF" size={18} /> : null}
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

// ── Onay kutusu ─────────────────────────────────────────────────────────────

/** Kutu bir uyarı değil, bir BEYAN — o yüzden kırmızı değil, mürekkep rengi. */
export function Checkbox({ checked, label, onToggle, shake }: {
    checked: boolean;
    label: string;
    onToggle: () => void;
    shake?: Animated.Value;
}) {
    const { c } = useTheme();
    return (
        <Animated.View style={shake ? { transform: [{ translateX: shake }] } : undefined}>
            <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={label}
                onPress={() => { feedback.selection(); onToggle(); }}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: M.checkRowHeight,
                }}
            >
                <View style={{
                    width: M.checkbox,
                    height: M.checkbox,
                    borderRadius: M.checkboxRadius,
                    borderWidth: 1.8,
                    borderColor: checked ? c.tx : c.bd2,
                    backgroundColor: checked ? c.tx : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {checked ? <CheckIcon color={c.surf} /> : null}
                </View>
                <Text style={{
                    flex: 1,
                    color: c.tx,
                    fontSize: M.rowValue,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    lineHeight: M.rowValue * 1.4,
                }}>
                    {label}
                </Text>
            </Pressable>
        </Animated.View>
    );
}

// ── Amber not ───────────────────────────────────────────────────────────────

/** Amber UYARIDIR: "30 gün" bir uyarı, silme değil. */
export function AmberNote({ label, text, action }: {
    label: string;
    text: string;
    /**
     * İsteğe bağlı eylem. `null` ise HİÇ ÇİZİLMEZ — pasif bir düğme
     * bırakılmaz: gidilecek adres bilinmiyorsa düğme de olmaz.
     */
    action?: { label: string; onPress: () => void } | null;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            gap: 4,
            paddingVertical: M.amberPadY,
            paddingHorizontal: M.amberPadX,
            borderWidth: 1,
            borderColor: cardSkin.amBorder,
            borderRadius: M.amberRadius,
            backgroundColor: cardSkin.amBg,
        }}>
            <Text style={{
                color: c.am,
                fontSize: M.amberLabel,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: M.amberLabel * M.amberLabelTrack,
            }}>
                {label}
            </Text>
            <Text style={{
                color: c.tx2,
                fontSize: M.amberText,
                fontFamily: font.semiBold,
                fontWeight: '600',
                lineHeight: M.amberText * 1.45,
            }}>
                {text}
            </Text>
            {action ? (
                <Pressable
                    accessibilityRole="link"
                    onPress={action.onPress}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, paddingTop: 4 })}
                >
                    <Text style={{
                        color: c.am,
                        fontSize: M.amberText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        textDecorationLine: 'underline',
                    }}>
                        {action.label}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

export function Foot({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <Text style={{
            paddingHorizontal: 4,
            color: c.tx3,
            fontSize: M.footText,
            fontFamily: font.semiBold,
            fontWeight: '600',
            lineHeight: M.footText * M.footLine,
        }}>
            {children}
        </Text>
    );
}

// ── Düğmeler ────────────────────────────────────────────────────────────────

export function PrimaryButton({ label, disabled = false, busy = false, onPress }: {
    label: string;
    disabled?: boolean;
    busy?: boolean;
    onPress: () => void;
}) {
    const { c } = useTheme();
    const off = disabled || busy;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: off }}
            disabled={off}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                height: M.buttonHeight,
                borderRadius: M.buttonRadius,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: off ? c.surf2 : c.or,
                borderWidth: off ? 1 : 0,
                borderColor: c.bd,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed && !off ? 0.98 : 1 }],
            })}
        >
            <Text style={{
                color: off ? c.tx3 : '#FFFFFF',
                fontSize: M.buttonText,
                fontFamily: font.extraBold,
                fontWeight: '800',
            }}>
                {busy ? 'Kaydediliyor' : label}
            </Text>
        </Pressable>
    );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                height: M.buttonHeight,
                borderRadius: M.buttonRadius,
                borderWidth: 1,
                borderColor: c.bd2,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <Text style={{
                color: c.tx,
                fontSize: M.buttonText,
                fontFamily: font.bold,
                fontWeight: '700',
            }}>
                {label}
            </Text>
        </Pressable>
    );
}

// ── Basılı tutarak sil ──────────────────────────────────────────────────────

/**
 * İki saniye basılı tutma.
 *
 * "SİL yazdırmak" REDDEDİLDİ: salonda ayakta, tek elle, gözlüksüz bir müdüre
 * klavye açtırıyor — ve Türkçede büyük harf tuzağı var (sil → SİL, noktalı İ).
 *
 * Düğmenin KENDİSİ hiç değişmiyor: ne renk, ne ölçek, ne yazı. Dolum ayrı bir
 * rayda, çünkü kırmızı zeminde okunabilir bir etiket rengi iki temada birden
 * yok.
 *
 * VoiceOver açıkken basılı tutma tamamen devre dışı: basılı tutma bir
 * hassasiyet korumasıdır, ekran okuyucuda yanlış basma riski zaten yok.
 */
export function HoldToDelete({ label, enabled, busy, onFire, onBlocked }: {
    label: string;
    enabled: boolean;
    busy: boolean;
    onFire: () => void;
    onBlocked: () => void;
}) {
    const { c } = useTheme();
    const fill = useRef(new Animated.Value(0)).current;
    const [holding, setHolding] = useState(false);
    const [screenReader, setScreenReader] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isScreenReaderEnabled()
            .then((on) => { if (alive) setScreenReader(on); })
            .catch(() => { /* okunamazsa basılı tutma kalır */ });
        const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
        return () => { alive = false; sub.remove(); };
    }, []);

    const cancel = useCallback(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setHolding(false);
        Animated.timing(fill, {
            toValue: 0,
            duration: MO.holdRelease,
            easing: OUT,
            useNativeDriver: true,
        }).start();
    }, [fill]);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const start = () => {
        if (busy) return;
        if (!enabled) { onBlocked(); return; }
        if (screenReader) {
            // Basılı tutma yerine iki basamaklı uyarı.
            Alert.alert(label, undefined, [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Hesabı sil', style: 'destructive', onPress: onFire },
            ]);
            return;
        }
        setHolding(true);
        feedback.selection();
        fill.setValue(0);
        Animated.timing(fill, {
            toValue: 1,
            duration: MO.holdMs,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start();
        timer.current = setTimeout(() => {
            timer.current = null;
            setHolding(false);
            feedback.warning();
            onFire();
        }, MO.holdMs);
    };

    return (
        <View style={{ gap: 8 }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: busy }}
                onPressIn={start}
                onPressOut={cancel}
                style={{
                    height: M.dangerHeight,
                    borderRadius: M.dangerRadius,
                    borderWidth: 1,
                    borderColor: cardSkin.rd,
                    backgroundColor: 'rgba(224,114,114,0.10)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 9,
                }}
            >
                <TrashIcon color={c.rd} />
                <Text style={{
                    color: c.rd,
                    fontSize: M.dangerText,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                }}>
                    {label}
                </Text>
            </Pressable>

            {/* Dolum rayı — düğmenin İÇİNDE değil ALTINDA. */}
            <View style={{
                height: M.holdBarHeight,
                borderRadius: M.holdBarHeight / 2,
                backgroundColor: c.bd,
                overflow: 'hidden',
            }}>
                <Animated.View style={{
                    ...ABS,
                    backgroundColor: c.rd,
                    // Köken SOL: `scaleX` varsayılan olarak merkezden büyür,
                    // dolum ortadan iki yana açılırdı.
                    transformOrigin: 'left',
                    transform: [{ scaleX: fill }],
                }} />
            </View>

            {holding ? (
                <Text style={{
                    color: c.tx3,
                    fontSize: M.footText,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    textAlign: 'center',
                }}>
                    Bırakmayın
                </Text>
            ) : null}
        </View>
    );
}

// ── Boş hâl ─────────────────────────────────────────────────────────────────

export function EmptyBlock({ title, hint, action, onAction }: {
    title: string;
    hint: string;
    action?: string;
    onAction?: () => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            gap: 10,
            paddingVertical: 26,
            paddingHorizontal: 18,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: c.bd2,
            borderRadius: M.emptyRadius,
            alignItems: 'flex-start',
        }}>
            <Text style={{
                color: c.tx,
                fontSize: 17,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: 17 * -0.02,
            }}>
                {title}
            </Text>
            <Text style={{
                color: c.tx2,
                fontSize: M.rowValue,
                fontFamily: font.semiBold,
                fontWeight: '600',
                lineHeight: M.rowValue * 1.45,
            }}>
                {hint}
            </Text>
            {action && onAction ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={action}
                    onPress={() => { feedback.selection(); onAction(); }}
                    style={({ pressed }) => ({
                        height: 48,
                        paddingHorizontal: 20,
                        borderRadius: M.buttonRadius,
                        backgroundColor: c.or,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 4,
                        opacity: pressed ? 0.9 : 1,
                    })}
                >
                    <Text style={{
                        color: '#FFFFFF',
                        fontSize: 15.5,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                    }}>
                        {action}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}
