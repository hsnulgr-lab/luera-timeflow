import { useEffect, useRef, type ReactNode } from 'react';
import {
    Animated, Easing, Platform, Pressable, Text, View,
    type StyleProp, type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { upperTR } from '../lib/text';
import {
    formatTRY, historyMeta, type CustomerHistoryRow, type CustomerPlate, type HeroWarn,
} from '../lib/customerCard';
import {
    apptInCurve, customerGlass, customerHero, customerMetrics, customerMotion,
    font, radius, useTheme, type Curve,
} from '../theme';

/**
 * Müdür 23'ün parçaları.
 *
 * CAM YALNIZ ÜÇ YÜZEYDE: kroma satırı, iki levha, toplanmış asılı levha.
 * Üçü de kahraman alanın üstünde yüzer. Kart, liste, metin blokları ve alt
 * çubuk camsızdır — bulanık zeminde metin kontrastı düşer ve kullanıcı
 * kitlesi 40–55 yaş.
 */

function bezier(curve: Curve) {
    return Easing.bezier(curve[0], curve[1], curve[2], curve[3]);
}

// ── Cam yüzey ───────────────────────────────────────────────────────────────

/**
 * Kahraman alanın üstünde yüzen cam.
 *
 * "Saydamlığı azalt" açıkken ya da cam kullanılamadığında bulanıklık ve
 * saturasyon kaldırılır, KENARLIK VE ÖLÇÜ AYNI KALIR — düşüş sessiz olmaz.
 * Android'de `experimentalBlurMethod` güvenilmez; orada doğrudan opak yüzey.
 */
export function HeroGlass({ kind = 'chrome', style, children }: {
    kind?: 'chrome' | 'plate' | 'hang';
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
}) {
    const { glass } = useTheme();
    const hang = kind === 'hang';
    const usable = glass && Platform.OS === 'ios';

    const border: ViewStyle = {
        borderColor: hang ? customerGlass.hangBorder : customerGlass.border,
    };

    if (!usable) {
        return (
            <View style={[
                style,
                border,
                { backgroundColor: kind === 'chrome' ? customerGlass.opaqueChrome : customerGlass.opaquePlate },
            ]}>
                {children}
            </View>
        );
    }

    return (
        <View style={[style, border, { overflow: 'hidden' }]}>
            <BlurView
                tint="dark"
                intensity={hang ? customerGlass.hangBlur * 5 : customerGlass.blur * 5}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
            <View style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: hang ? customerGlass.hangFill : customerGlass.fill,
            }} />
            {children}
        </View>
    );
}

// ── Kahraman gradyanı ───────────────────────────────────────────────────────

/** Uygulamanın TEK gradyanı. Aydınlık temada da koyu kalır. */
export function HeroGradient({ radiusBottom }: { radiusBottom: number }) {
    return (
        <View style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            borderBottomLeftRadius: radiusBottom,
            borderBottomRightRadius: radiusBottom,
            overflow: 'hidden',
        }}>
            <LinearGradient
                colors={[...customerHero.stops]}
                locations={[...customerHero.locations]}
                start={customerHero.start}
                end={customerHero.end}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
            {/* Sağ üstteki %16 turuncu ışık — ayrı katman olarak biner.
                RN'de radial gradyan yok; iki eksenli iki doğrusal katman
                aynı yumuşak sönümü veriyor. */}
            <LinearGradient
                colors={[customerHero.glow, customerHero.glowClear]}
                start={{ x: 0.78, y: 0 }}
                end={{ x: 0.1, y: 0.62 }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
        </View>
    );
}

// ── Kroma satırı ────────────────────────────────────────────────────────────

/**
 * Referansta burada "Follow" var; bizde İLETİŞİM.
 *
 * Bu ekranın üç açılış nedeninden biri "telefon çalıyor" — o an müdürün eli
 * zaten telefonu tutuyor ve tek istediği aramaya dönmek. Randevu vermek ise
 * ekranı okuduktan SONRA gelen karar; o yüzden alt çubukta.
 */
export function ChromeRow({ onBack, onCall, onWhatsApp }: {
    onBack: () => void;
    onCall?: () => void;
    onWhatsApp?: () => void;
}) {
    const { small } = useTheme();
    return (
        <View style={{
            height: customerMetrics.chromeHeight,
            marginTop: customerMetrics.chromeTop,
            flexDirection: 'row',
            alignItems: 'center',
            gap: customerMetrics.chromeGap,
        }}>
            <ChromeButton label="Geri" onPress={onBack}>
                <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={customerHero.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 4l-6 6 6 6" />
                </Svg>
            </ChromeButton>

            {/* Numara kayıtlı değilse düğme çizilmez — gri değil, yok. */}
            {onCall ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Müşteriyi ara"
                    hitSlop={2}
                    onPress={() => { feedback.selection(); onCall(); }}
                    style={({ pressed }) => ({ marginLeft: 'auto', opacity: pressed ? 0.7 : 1 })}
                >
                    <HeroGlass style={{
                        height: customerMetrics.chromeButton,
                        paddingHorizontal: small ? customerMetrics.chromePillXSmall : customerMetrics.chromePillX,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke={customerHero.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M6.2 3.2h-2c-.7 0-1.2.6-1.1 1.3.3 3 1.6 5.8 3.7 7.9 2.1 2.1 4.9 3.4 7.9 3.7.7.1 1.3-.4 1.3-1.1v-2c0-.6-.4-1.1-1-1.2l-1.9-.3c-.5-.1-1 .1-1.3.5l-.7.9C9.3 12 8 10.7 7.1 9.1l.9-.7c.4-.3.6-.8.5-1.3L8.2 5.2c-.1-.6-.6-1-1.2-1z" />
                        </Svg>
                        <Text style={{
                            color: customerHero.ink,
                            fontSize: customerMetrics.chromePillText,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: customerMetrics.chromePillText * -0.01,
                        }}>
                            Ara
                        </Text>
                    </HeroGlass>
                </Pressable>
            ) : null}

            {onWhatsApp ? (
                <ChromeButton label="WhatsApp’tan yaz" onPress={onWhatsApp}>
                    <Svg width={19} height={19} viewBox="0 0 20 20" fill="none" stroke={customerHero.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M3.2 16.8l1-3.2A6.6 6.6 0 1 1 6.6 16l-3.4.8z" />
                        <Path d="M7.4 8c.2 1.4 1.4 2.6 2.8 2.9" />
                    </Svg>
                </ChromeButton>
            ) : null}
        </View>
    );
}

function ChromeButton({ label, onPress, children }: {
    label: string;
    onPress: () => void;
    children: ReactNode;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={2}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
            <HeroGlass style={{
                width: customerMetrics.chromeButton,
                height: customerMetrics.chromeButton,
                borderRadius: radius.pill,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {children}
            </HeroGlass>
        </Pressable>
    );
}

// ── Kimlik ──────────────────────────────────────────────────────────────────

/** Kimlik baş harflerden gelir — fotoğraf yok, yer tutucu yok. */
export function Monogram({ initials, style }: {
    initials: string;
    style?: StyleProp<ViewStyle>;
}) {
    const { c, small } = useTheme();
    const size = small ? customerMetrics.monoSmall : customerMetrics.mono;
    return (
        <Animated.View style={[{
            position: 'absolute',
            right: customerMetrics.padX,
            top: customerMetrics.monoTop,
            width: size,
            height: size,
            borderRadius: radius.pill,
            borderWidth: customerMetrics.monoBorder,
            borderColor: c.or,
            backgroundColor: customerMetrics.monoFill,
            alignItems: 'center',
            justifyContent: 'center',
        }, style]}>
            <Text style={{
                color: customerHero.ink,
                fontSize: small ? customerMetrics.monoTextSmall : customerMetrics.monoText,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: (small ? customerMetrics.monoTextSmall : customerMetrics.monoText) * -0.02,
            }}>
                {initials}
            </Text>
        </Animated.View>
    );
}

export function IdentityBlock({ given, family, phone }: {
    given: string;
    family: string;
    phone: string | null;
}) {
    const { small } = useTheme();
    const size = small ? customerMetrics.nameTextSmall : customerMetrics.nameText;
    return (
        <View style={{
            marginTop: 'auto',
            maxWidth: small ? customerMetrics.nameWidthSmall : customerMetrics.nameWidth,
        }}>
            {given ? (
                <Text numberOfLines={1} style={{
                    color: customerHero.ink2,
                    fontSize: size,
                    lineHeight: size,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    letterSpacing: size * -0.03,
                }}>
                    {given}
                </Text>
            ) : null}
            {/* İsim asla üçüncü satıra taşmaz: kırpılır. */}
            <Text numberOfLines={1} style={{
                color: customerHero.ink,
                fontSize: size,
                lineHeight: size * 1.06,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: size * -0.03,
            }}>
                {family}
            </Text>
            {phone ? (
                <Num size={customerMetrics.phoneText} style={{
                    marginTop: customerMetrics.phoneTop,
                    color: customerHero.ink3,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                }}>
                    {phone}
                </Num>
            ) : null}
        </View>
    );
}

// ── Risk / borç satırı ──────────────────────────────────────────────────────

/**
 * Risk ve borç AYNI ŞEKİL, farklı mürekkep.
 *
 * CAM DEĞİL: bulanık zeminde 15.5 px metnin kontrastı düşer ve bu, kırpılması
 * yasak olan tek bilgidir. Kırmızı dolgu yok, ikon yok, NABIZ YOK — müdür
 * panik yapmasın, bilsin.
 */
export function WarnRow({ warn, entering }: { warn: HeroWarn; entering?: Animated.Value }) {
    const { c } = useTheme();
    const risky = warn.kind === 'risk';
    const tone = risky ? c.rd : c.am;

    const body = (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: customerMetrics.warnGap,
            marginTop: customerMetrics.warnTop,
            borderRadius: customerMetrics.warnRadius,
            backgroundColor: customerMetrics.warnFill,
            borderWidth: 1,
            borderColor: risky ? customerMetrics.warnBorderRisk : customerMetrics.warnBorderDebt,
            paddingTop: customerMetrics.warnPadY,
            paddingBottom: customerMetrics.warnPadY,
            paddingLeft: customerMetrics.warnPadLeft,
            paddingRight: customerMetrics.warnPadRight,
        }}>
            <View style={{
                width: customerMetrics.warnStripe,
                alignSelf: 'stretch',
                borderRadius: customerMetrics.warnStripe / 2,
                backgroundColor: tone,
            }} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <View style={{
                        width: customerMetrics.warnDot,
                        height: customerMetrics.warnDot,
                        borderRadius: customerMetrics.warnDot,
                        backgroundColor: tone,
                    }} />
                    {/* Etiket kelimeyi taşır: müdür renkleri hiç ayırt etmese
                        de cümle yerinde. */}
                    <Text style={{
                        color: tone,
                        fontSize: customerMetrics.warnLabel,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: customerMetrics.warnLabel * customerMetrics.warnLabelTrack,
                    }}>
                        {upperTR(warn.label)}
                    </Text>
                </View>
                {/* numberOfLines YOK — sarar, kabı büyütür. */}
                <Text style={{
                    color: customerHero.ink,
                    fontSize: customerMetrics.warnText,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: customerMetrics.warnText * -0.01,
                    lineHeight: customerMetrics.warnText * customerMetrics.warnTextLine,
                }}>
                    {warn.text}
                </Text>
            </View>
        </View>
    );

    if (!entering) return body;
    return (
        <Animated.View style={{
            opacity: entering,
            transform: [{
                translateY: entering.interpolate({
                    inputRange: [0, 1],
                    outputRange: [customerMotion.warn.rise, 0],
                }),
            }],
        }}>
            {body}
        </Animated.View>
    );
}

/** Risk bayrağı BİR KEZ hareket eder, sonra durur. Döngü yok. */
export function useWarnEntry(active: boolean, reduceMotion: boolean) {
    const value = useRef(new Animated.Value(active && !reduceMotion ? 0 : 1)).current;

    useEffect(() => {
        if (!active) return;
        if (reduceMotion) { value.setValue(1); return; }
        Animated.timing(value, {
            toValue: 1,
            duration: customerMotion.warn.duration,
            delay: customerMotion.warn.delay,
            easing: bezier(apptInCurve),
            useNativeDriver: true,
        }).start();
    }, [active, reduceMotion, value]);

    return value;
}

// ── İki levha ───────────────────────────────────────────────────────────────

export function Plates({ plates, entry, onOpen, opacity }: {
    plates: readonly [CustomerPlate, CustomerPlate];
    entry: Animated.Value[];
    onOpen?: (key: CustomerPlate['key']) => void;
    /**
     * Toplanma sönümü. Kabın KENDİSİNE verilir: araya sarmalayıcı bir View
     * konursa levhalar o sarmalayıcıya göre konumlanır ve kahraman alanın
     * alt kenarına değil, akışın bittiği yere (uyarı satırının üstüne) düşer.
     */
    opacity?: Animated.AnimatedInterpolation<number> | Animated.Value;
}) {
    return (
        <Animated.View style={{
            position: 'absolute',
            left: customerMetrics.padX,
            right: customerMetrics.padX,
            bottom: customerMetrics.plateBottom,
            flexDirection: 'row',
            gap: customerMetrics.plateGap,
            opacity,
        }}>
            {plates.map((plate, index) => (
                <Animated.View
                    key={plate.key}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        opacity: entry[index],
                        transform: [{
                            translateY: entry[index].interpolate({
                                inputRange: [0, 1],
                                outputRange: [customerMotion.plates.rise, 0],
                            }),
                        }],
                    }}
                >
                    <PlateCard plate={plate} onOpen={onOpen} />
                </Animated.View>
            ))}
        </Animated.View>
    );
}

function PlateCard({ plate, onOpen }: {
    plate: CustomerPlate;
    onOpen?: (key: CustomerPlate['key']) => void;
}) {
    const inner = (
        <HeroGlass
            kind="plate"
            style={{
                height: customerMetrics.plateHeight,
                borderRadius: customerMetrics.plateRadius,
                borderWidth: 1,
                padding: customerMetrics.platePadding,
            }}
        >
            <Text numberOfLines={1} style={{
                color: customerHero.inkLabel,
                fontSize: customerMetrics.plateLabel,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: customerMetrics.plateLabel * 0.06,
                lineHeight: customerMetrics.plateLabel * 1.22,
            }}>
                {upperTR(plate.label)}
            </Text>

            <View style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 5,
                height: customerMetrics.plateValueHeight,
                marginTop: customerMetrics.plateValueTop,
            }}>
                {/* Rakam ölçeği yalnız GERÇEK SAYILARA ayrılmış: müdür levhaya
                    bakınca sayı olup olmadığını okumadan anlar. */}
                <PlateValue plate={plate} />
                {plate.unit ? (
                    <Num size={customerMetrics.plateUnit} style={{
                        color: customerHero.ink3,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {plate.unit}
                    </Num>
                ) : null}
            </View>

            <Text numberOfLines={1} style={{
                marginTop: customerMetrics.plateSubTop,
                color: customerHero.ink3,
                fontSize: customerMetrics.plateSub,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: customerMetrics.plateSub * 1.22,
            }}>
                {plate.sub}
            </Text>

            {/* Yalnız gidilecek bir yer varsa çizilir. */}
            {plate.opens ? (
                <View style={{
                    position: 'absolute',
                    right: customerMetrics.plateArrowInset,
                    bottom: customerMetrics.plateArrowInset,
                    width: customerMetrics.plateArrow,
                    height: customerMetrics.plateArrow,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: customerMetrics.plateArrowBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Svg width={15} height={15} viewBox="0 0 20 20" fill="none" stroke={customerHero.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M6.5 13.5l7-7M8 6.5h5.5V12" />
                    </Svg>
                </View>
            ) : null}
        </HeroGlass>
    );

    if (!plate.opens || !onOpen) return inner;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${plate.label}: ${plate.value}. ${plate.sub}`}
            onPress={() => { feedback.selection(); onOpen(plate.key); }}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
            {inner}
        </Pressable>
    );
}

function PlateValue({ plate }: { plate: CustomerPlate }) {
    const size = plate.soft ? customerMetrics.plateValueSoft : customerMetrics.plateValue;
    const style = {
        color: plate.soft ? customerHero.ink3 : customerHero.ink,
        fontFamily: font.extraBold,
        fontWeight: '800' as const,
        letterSpacing: size * -0.03,
        lineHeight: size * 1.06,
    };
    // Sayısal olmayan değer ("Yok", "Bugün") metin fontuyla yazılır; tabular
    // rakam yalnız rakamın olduğu yerde anlam taşır.
    if (plate.soft || !/^[\d.,]+$/.test(plate.value)) {
        return <Text numberOfLines={1} style={[{ fontSize: size }, style]}>{plate.value}</Text>;
    }
    return <Num size={size} style={style}>{plate.value}</Num>;
}

/** İki levha BİRLİKTE gelmez: 60 ms fark ikisinin ayrı yüzey olduğunu söyler. */
export function usePlateEntry(reduceMotion: boolean) {
    const values = useRef([new Animated.Value(0), new Animated.Value(0)]).current;

    useEffect(() => {
        if (reduceMotion) { values.forEach((value) => value.setValue(1)); return; }
        Animated.parallel(values.map((value, index) => Animated.timing(value, {
            toValue: 1,
            duration: customerMotion.plates.duration,
            delay: index * customerMotion.plates.delay,
            easing: bezier(apptInCurve),
            useNativeDriver: true,
        }))).start();
    }, [reduceMotion, values]);

    return values;
}

// ── İçerik ──────────────────────────────────────────────────────────────────

export function Section({ label, action, onAction }: {
    label: string;
    action?: string;
    onAction?: () => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            paddingTop: customerMetrics.sectPadTop,
            paddingBottom: customerMetrics.sectPadBottom,
            paddingHorizontal: customerMetrics.padX,
        }}>
            <Text style={{
                color: c.tx3,
                fontSize: customerMetrics.sectText,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: customerMetrics.sectText * customerMetrics.sectTrack,
            }}>
                {upperTR(label)}
            </Text>
            {action && onAction ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={action}
                    hitSlop={10}
                    onPress={() => { feedback.selection(); onAction(); }}
                    style={({ pressed }) => ({ marginLeft: 'auto', opacity: pressed ? 0.6 : 1 })}
                >
                    <Text style={{
                        color: c.tx2,
                        fontSize: customerMetrics.sectText,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: customerMetrics.sectText * 0.06,
                    }}>
                        {action}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/** Listede RENK YOK: renk bütçesi kahraman alanda bitti. */
export function HistoryRow({ row, first }: { row: CustomerHistoryRow; first: boolean }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: customerMetrics.rowGap,
            paddingVertical: customerMetrics.rowPadY,
            paddingHorizontal: customerMetrics.padX,
            borderTopWidth: first ? 0 : 1,
            borderColor: c.bd,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: customerMetrics.rowName,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    letterSpacing: customerMetrics.rowName * -0.01,
                }}>
                    {row.service}
                </Text>
                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: customerMetrics.rowMeta,
                    fontFamily: font.medium,
                    fontWeight: '500',
                }}>
                    {historyMeta(row)}
                </Text>
            </View>
            {/* Tutar hiçbir koşulda kırpılmaz. */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 }}>
                <Num size={customerMetrics.rowCurrency} style={{
                    color: c.tx2,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    paddingRight: 1,
                }}>
                    ₺
                </Num>
                <Num size={customerMetrics.rowAmount} style={{
                    color: c.tx,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: customerMetrics.rowAmount * -0.01,
                }}>
                    {formatTRY(row.amount)}
                </Num>
            </View>
        </View>
    );
}

export function NoteRow({ text, quiet = false, first = false }: {
    text: string;
    quiet?: boolean;
    first?: boolean;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            paddingVertical: customerMetrics.sectPadTop,
            paddingHorizontal: customerMetrics.padX,
            borderTopWidth: first ? 0 : 1,
            borderColor: c.bd,
        }}>
            <Text style={{
                color: quiet ? c.tx3 : c.tx2,
                fontSize: customerMetrics.noteText,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: customerMetrics.noteText * customerMetrics.noteLine,
            }}>
                {text}
            </Text>
        </View>
    );
}

/** Boş hâl bir HATA değil: ikon yok, uyarı rengi yok, cümle olumlu. */
export function HistoryEmptyBlock({ title, hint }: { title: string; hint: string }) {
    const { c } = useTheme();
    return (
        <View style={{ padding: customerMetrics.padX, gap: 6 }}>
            <Text style={{
                color: c.tx,
                fontSize: customerMetrics.emptyTitle,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: customerMetrics.emptyTitle * -0.01,
            }}>
                {title}
            </Text>
            <Text style={{
                color: c.tx2,
                fontSize: customerMetrics.emptySub,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: customerMetrics.emptySub * customerMetrics.noteLine,
            }}>
                {hint}
            </Text>
        </View>
    );
}
