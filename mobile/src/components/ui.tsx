import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Animated,
    Easing,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
    type ScrollViewProps,
    type StyleProp,
    type TextInputProps,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import RAnimated, { type AnimatedStyle } from 'react-native-reanimated';
import { GlassPlate } from './GlassPlate';
import { LightField } from './LightField';
import { GlassView } from 'expo-glass-effect';
import { offlineGate, sessionGate } from '../lib/authCopy';
import { feedback } from '../lib/feedback';
import { authMetrics, authMotion, font, hit, numeric, onAccent, pressMotion, radius, space, type, useTheme } from '../theme';
import { upperTR } from '../lib/text';

// Kumandanın temel parçaları. Tasarımdaki ölçüler burada TEK yerde;
// üç ekranda üç farklı buton yüksekliği çıkmasın.

export function T({ v = 'body', c: color, style, children, numberOfLines }: {
    v?: keyof typeof type; c?: string; style?: StyleProp<TextStyle>;
    children: ReactNode; numberOfLines?: number;
}) {
    const { c } = useTheme();
    const base = type[v] as TextStyle;
    return (
        <Text
            numberOfLines={numberOfLines}
            style={[base, { color: color ?? c.tx }, style]}
        >
            {children}
        </Text>
    );
}

/** Tutar ve sayaç — rakamlar zıplamasın diye tabular. */
export function Num({ children, style, size = 15.5 }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number }) {
    const { c } = useTheme();
    return (
        <Text style={[{ color: c.tx, fontSize: size, fontWeight: '800', letterSpacing: -0.4 }, numeric, style]}>
            {children}
        </Text>
    );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    const { c } = useTheme();
    // Gölge YOK — ayrım kenarlık ve yüzey farkıyla. RN'de gölge platformlar
    // arası tutarsız, tasarım da bu yüzden gölgesiz kuruldu.
    return (
        <View style={[{
            backgroundColor: c.card, borderColor: c.bd, borderWidth: 1,
            borderRadius: radius.lg, padding: space.lg,
        }, style]}>
            {children}
        </View>
    );
}

type BtnKind = 'pri' | 'gho' | 'bare' | 'danger';

export function Button({ label, onPress, kind = 'pri', big = false, disabled, left, right }: {
    label: string; onPress: () => void; kind?: BtnKind; big?: boolean;
    disabled?: boolean; left?: ReactNode; right?: ReactNode;
}) {
    const { c } = useTheme();
    const bg = kind === 'pri' ? c.or : kind === 'gho' ? 'transparent' : 'transparent';
    const fg = kind === 'pri' ? '#fff' : kind === 'danger' ? c.rd : c.tx;
    const border = kind === 'gho' ? c.bd2 : kind === 'danger' ? c.rd : 'transparent';
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            // Kritik buton 66, normal 60 — hiçbiri 44'ün altına inmez.
            style={({ pressed }) => ({
                minHeight: big ? hit.action : hit.actionSm,
                borderRadius: radius.md,
                backgroundColor: bg,
                borderWidth: kind === 'gho' || kind === 'danger' ? 1.5 : 0,
                borderColor: border,
                alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
                gap: space.xs, paddingHorizontal: space.lg,
                opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
        >
            {left}
            <Text style={{ color: fg, fontSize: big ? 17 : 15.5, fontWeight: '800', letterSpacing: -0.3 }}>
                {label}
            </Text>
            {right}
        </Pressable>
    );
}

/** Liste satırı — 62 pt, tasarımın ölçüsü. */
export function Row({ children, onPress, style }: {
    children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();
    const inner = (
        <View style={[{
            minHeight: hit.row, flexDirection: 'row', alignItems: 'center',
            gap: space.md, paddingHorizontal: space.lg,
            borderBottomWidth: 1, borderBottomColor: c.bd,
        }, style]}>
            {children}
        </View>
    );
    return onPress
        ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{inner}</Pressable>
        : inner;
}

/** Boş durum — "hiçbir şey yok" demek yetmez, ne yapılacağını söyler. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
    const { c } = useTheme();
    return (
        <View style={{ padding: space.xxl, alignItems: 'center', gap: space.sm }}>
            <T v="h3">{title}</T>
            {hint ? <T v="small" c={c.tx2} style={{ textAlign: 'center' }}>{hint}</T> : null}
        </View>
    );
}

function usePressValue() {
    return useRef(new Animated.Value(0)).current;
}

function runPress(value: Animated.Value, pressed: boolean, reduced: boolean) {
    value.stopAnimation();
    Animated.timing(value, {
        toValue: pressed ? 1 : 0,
        duration: reduced ? pressMotion.reduced : pressed ? pressMotion.in : pressMotion.out,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
    }).start();
}

function runRowPress(value: Animated.Value, pressed: boolean) {
    value.stopAnimation();
    Animated.timing(value, {
        toValue: pressed ? 1 : 0,
        duration: pressed ? pressMotion.rowIn : pressMotion.rowOut,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
    }).start();
}

/** Giriş 01'in iki eşit kapısı; turuncu birincil/ikincil ayrımı yapmaz. */
/**
 * Giriş v3 · iki kapı.
 *
 * Aynı yükseklik, aynı cam, aynı tipografi, aynı beyaz. Ayrım SICAKLIKTA:
 * üst kapının simgesi kor, alt kapının simgesi teal — ve ışık alanı iki
 * kapının arkasına farklı kütle gönderiyor.
 *
 * Bu ekranda turuncu birincil düğme YOK ve olmayacak: iki kapıdan biri
 * "doğru cevap" gibi görünmemeli. Personel bu ürünün ikinci sınıf kullanıcısı
 * değil — kumandası ürünün en özenli parçası.
 */
export function AuthChoiceButton({ title, subtitle, onPress, glyph }: {
    title: string;
    subtitle: string;
    onPress: () => void;
    glyph?: 'shop' | 'person';
}) {
    const { c, dark, reduceMotion, small } = useTheme();
    const press = usePressValue();
    const height = small ? authMetrics.choiceHeightSmall : authMetrics.choiceHeight;
    const titleSize = small ? authMetrics.welcomeChoiceTitleSmall : authMetrics.welcomeChoiceTitle;
    const subtitleSize = small
        ? authMetrics.welcomeChoiceSubtitleSmall
        : authMetrics.welcomeChoiceSubtitle;
    const cool = glyph === 'person';
    const tint = cool
        ? (dark ? '#5FD3C8' : '#0C6E67')
        : c.or2;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${subtitle}`}
            onPress={onPress}
            onPressIn={() => runPress(press, true, reduceMotion)}
            onPressOut={() => runPress(press, false, reduceMotion)}
        >
            <Animated.View style={{
                opacity: press.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                        1,
                        reduceMotion ? pressMotion.reducedOpacity : pressMotion.primaryOpacity,
                    ],
                }),
                transform: [{
                    scale: press.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, reduceMotion ? 1 : pressMotion.primaryScale],
                    }),
                }],
            }}>
                <GlassPlate
                    radius={small
                        ? authMetrics.welcomeChoiceRadiusSmall
                        : authMetrics.welcomeChoiceRadius}
                >
                    <View style={{
                        height,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        paddingHorizontal: small
                            ? authMetrics.welcomeChoiceXSmall
                            : authMetrics.welcomeChoiceX,
                    }}>
                        {glyph ? (
                            <View style={{
                                width: 40, height: 40, borderRadius: 13,
                                alignItems: 'center', justifyContent: 'center',
                                backgroundColor: cool
                                    ? 'rgba(20,150,140,0.18)'
                                    : 'rgba(255,90,31,0.16)',
                                borderWidth: 1,
                                borderColor: cool
                                    ? 'rgba(20,150,140,0.34)'
                                    : 'rgba(255,90,31,0.30)',
                            }}>
                                <DoorGlyph kind={glyph} color={tint} />
                            </View>
                        ) : null}
                        <View style={{
                            flex: 1, minWidth: 0,
                            gap: authMetrics.welcomeChoiceInnerGap,
                        }}>
                            <Text style={{
                                color: c.tx,
                                fontSize: titleSize,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: titleSize * -0.025,
                            }}>
                                {title}
                            </Text>
                            <Text style={{
                                color: c.tx2,
                                fontSize: subtitleSize,
                                fontFamily: font.medium,
                                lineHeight: subtitleSize * 1.35,
                                fontWeight: '500',
                            }}>
                                {subtitle}
                            </Text>
                        </View>
                    </View>
                </GlassPlate>
            </Animated.View>
        </Pressable>
    );
}

function DoorGlyph({ kind, color }: { kind: 'shop' | 'person'; color: string }) {
    return (
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
            {kind === 'shop' ? (
                <Path
                    d="M4 9.5 5.4 5h13.2L20 9.5M4 9.5h16M4 9.5V19h16V9.5M9.5 19v-5h5v5"
                    stroke={color}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ) : (
                <Path
                    d="M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 19.5c0-3.2 3.1-5 7-5s7 1.8 7 5"
                    stroke={color}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
        </Svg>
    );
}

/** Sessiz üçüncü yol; 44 pt hedefi ve alt çizgisi görünürlüğü korur. */
export function AuthTextLink({ label, onPress, quiet = false }: {
    label: string;
    onPress: () => void;
    quiet?: boolean;
}) {
    const { c, reduceMotion } = useTheme();
    const press = usePressValue();
    return (
        <Pressable
            accessibilityRole="link"
            accessibilityLabel={label}
            onPress={onPress}
            onPressIn={() => runPress(press, true, reduceMotion)}
            onPressOut={() => runPress(press, false, reduceMotion)}
            style={{ alignSelf: 'center' }}
        >
            <Animated.View style={{
                minHeight: hit.icon,
                justifyContent: 'center',
                paddingHorizontal: authMetrics.welcomeLinkX,
                opacity: press.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, pressMotion.ghostOpacity],
                }),
            }}>
                <Text style={{
                    color: quiet ? c.tx2 : c.tx,
                    fontSize: quiet ? authMetrics.scanTextSize : type.body.fontSize,
                    fontFamily: quiet ? font.semiBold : font.bold,
                    fontWeight: quiet ? '600' : '700',
                    letterSpacing: (quiet ? authMetrics.scanTextSize : type.body.fontSize) * -0.01,
                    textDecorationLine: 'underline',
                }}>
                    {label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

type AuthActionKind = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Giriş paketinin 66 / 60 / 52 pt eylemleri. */
export function AuthActionButton({ label, onPress, kind = 'primary', disabled = false, compact = false, left }: {
    label: string;
    onPress: () => void;
    kind?: AuthActionKind;
    disabled?: boolean;
    compact?: boolean;
    left?: ReactNode;
}) {
    const { c, reduceMotion, small } = useTheme();
    const press = usePressValue();
    const primary = kind === 'primary';
    const secondary = kind === 'secondary';
    const danger = kind === 'danger';
    const height = primary
        ? compact || small ? authMetrics.smallPrimaryHeight : hit.action
        : secondary ? hit.actionSm : danger ? hit.actionSm : authMetrics.secondaryActionHeight;
    const textSize = primary
        ? compact ? authMetrics.actionTextSize : authMetrics.primaryTextSize
        : secondary || danger ? authMetrics.actionTextSize : authMetrics.ghostTextSize;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            onPressIn={() => {
                if (primary && !disabled) feedback.light();
                runPress(press, true, reduceMotion);
            }}
            onPressOut={() => runPress(press, false, reduceMotion)}
        >
            <Animated.View style={{
                height,
                paddingHorizontal: space.lg,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: left ? authMetrics.actionIconGap : 0,
                borderRadius: primary && small ? authMetrics.smallPrimaryRadius : radius.lg,
                borderWidth: secondary || danger ? 1 : 0,
                borderColor: danger ? `${c.rd}57` : secondary ? c.bd : 'transparent',
                // Devre dışı turuncu SOLDURULMUYOR. Işık alanının üstünde %40
                // opak bir turuncu çamurlu bir kahveye dönüyordu — kırık bir
                // renk gibi. Yerine nötr bir yüzey: "henüz değil" demenin
                // dürüst yolu, ve hangi zeminde olursa olsun aynı okunuyor.
                backgroundColor: disabled && primary
                    ? c.surf2
                    : primary ? c.or : secondary ? c.surf2 : 'transparent',
                opacity: disabled
                    ? (primary ? 1 : 0.4)
                    : press.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                            1,
                            primary
                                ? reduceMotion
                                    ? pressMotion.reducedOpacity
                                    : pressMotion.primaryOpacity
                                : pressMotion.ghostOpacity,
                        ],
                    }),
                transform: [{
                    scale: press.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                            1,
                            primary && !reduceMotion ? pressMotion.primaryScale : 1,
                        ],
                    }),
                }],
            }}>
                {left}
                <Text style={{
                    color: disabled && primary ? c.tx3
                        : primary ? '#FFFFFF' : danger ? c.rd : secondary ? c.tx : c.tx2,
                    fontSize: textSize,
                    fontFamily: primary || secondary || danger ? font.extraBold : font.bold,
                    fontWeight: primary || secondary || danger ? '800' : '700',
                    letterSpacing: textSize * -0.02,
                }}>
                    {label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

/** Klavye ile güvenli alanı tek yerde yöneten düz giriş kabuğu. */
/**
 * Giriş v3: bütün auth ekranları ışık alanının üstünde duruyor.
 *
 * Tasarım dört ekranı çiziyor (karşılama · müdür girişi · personel girişi ·
 * dönüş), ama alanı yalnız onlara verip kayıt akışını düz zeminde bırakmak
 * aynı akış içinde iki ayrı ürün gibi görünürdü. Kuralın kendisi zaten
 * kapsayıcı: **cam ve alan, içeriğin olmadığı ekranlarda serbest** — kayıt
 * akışında da okunacak bir tutar, saat ya da isim yok.
 */
export function AuthPage({ children, contentStyle, scrollProps, keyboard, field = true }: {
    children: ReactNode;
    contentStyle?: StyleProp<ViewStyle>;
    scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
    /** Klavye açık: alan durmaz, bir kademe daha geriye çekilir. */
    keyboard?: boolean;
    field?: boolean;
}) {
    const insets = useSafeAreaInsets();
    const { c } = useTheme();
    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: c.bg }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {field ? <LightField profile="form" keyboard={keyboard} /> : null}
            <ScrollView
                {...scrollProps}
                style={{ flex: 1 }}
                contentContainerStyle={[
                    { flexGrow: 1, paddingTop: insets.top },
                    contentStyle,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                // `automaticallyAdjustKeyboardInsets` KALDIRILDI: dıştaki
                // `KeyboardAvoidingView` zaten klavyeyi telafi ediyordu ve
                // ikisi üst üste binince içerik iki kez yukarı kayıyor —
                // başlık durum çubuğunun altına giriyordu. Telafi tek yerde.
                contentInsetAdjustmentBehavior="never"
            >
                {children}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function BackIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.selectionChevron}
            height={authMetrics.selectionChevron}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M15 5 8 12l7 7"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** Giriş ekranlarının gölgesiz, camsız 52 pt geri çubuğu. */
export function AuthBackBar({ onPress }: { onPress: () => void }) {
    const { c, reduceMotion, small } = useTheme();
    const press = usePressValue();
    return (
        <View style={{
            height: small ? authMetrics.topBarHeightSmall : authMetrics.topBarHeight,
            paddingHorizontal: authMetrics.topBarX,
            alignItems: 'center',
            flexDirection: 'row',
        }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                hitSlop={space.xs}
                onPress={onPress}
                onPressIn={() => runPress(press, true, reduceMotion)}
                onPressOut={() => runPress(press, false, reduceMotion)}
                style={{ marginLeft: authMetrics.backOffset }}
            >
                <Animated.View style={{
                    width: hit.icon,
                    height: hit.icon,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: press.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, pressMotion.iconOpacity],
                    }),
                    transform: [{
                        scale: press.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, reduceMotion ? 1 : pressMotion.iconScale],
                        }),
                    }],
                }}>
                    <BackIcon color={c.tx} />
                </Animated.View>
            </Pressable>
        </View>
    );
}

/** Form ve seçim ekranı başlığının CSS-esaslı iki çeşidi. */
export function AuthHeader({
    title,
    body,
    selection = false,
    signup = false,
    compact = false,
    ready = false,
    account = false,
}: {
    title: string;
    body: string;
    selection?: boolean;
    signup?: boolean;
    compact?: boolean;
    ready?: boolean;
    account?: boolean;
}) {
    const { c, small } = useTheme();
    const titleSize = selection || account
        ? authMetrics.businessTitleSize
        : small ? authMetrics.smallPageTitleSize : authMetrics.pageTitleSize;
    const bodySize = selection || account
        ? authMetrics.businessSubtitleSize
        : small ? authMetrics.smallPageBodySize : type.body.fontSize;
    return (
        <View style={selection || account ? {
            paddingTop: account
                ? authMetrics.accountPageTitleTop
                : authMetrics.businessTitleTop,
            paddingHorizontal: authMetrics.businessTitleX,
            paddingBottom: authMetrics.businessTitleBottom,
            gap: authMetrics.businessTitleGap,
        } : ready ? {
            paddingTop: authMetrics.readyHeaderTop,
            paddingHorizontal: authMetrics.signupHeaderX,
            paddingBottom: authMetrics.readyHeaderBottom,
            gap: authMetrics.readyHeaderGap,
        } : signup ? {
            paddingHorizontal: authMetrics.signupHeaderX,
            paddingBottom: compact
                ? authMetrics.signupHeaderCompactBottom
                : authMetrics.signupHeaderBottom,
            gap: authMetrics.signupHeaderGap,
        } : {
            paddingTop: authMetrics.pageTitleTop,
            paddingHorizontal: small ? authMetrics.smallPageTitleX : authMetrics.pageTitleX,
            paddingBottom: small
                ? authMetrics.smallPageTitleBottom
                : authMetrics.pageTitleBottom,
            gap: small ? authMetrics.smallPageTitleGap : authMetrics.pageTitleGap,
        }}>
            <Text style={{
                color: c.tx,
                fontSize: titleSize,
                fontFamily: font.extraBold,
                fontWeight: '800',
                lineHeight: titleSize * (selection || account ? 1.05 : 1.1),
                letterSpacing: selection || account
                    ? titleSize * -0.035
                    : small ? titleSize * -0.03 : authMetrics.pageTitleTracking,
            }}>
                {title}
            </Text>
            <Text style={{
                color: c.tx2,
                fontSize: bodySize,
                fontFamily: selection || account ? font.semiBold : font.medium,
                fontWeight: selection || account ? '600' : '500',
                lineHeight: bodySize * (ready
                    ? authMetrics.readyBodyLine
                    : selection || account
                    ? 1.4
                    : small ? authMetrics.smallPageBodyLine : authMetrics.pageTitleBodyLine),
            }}>
                {body}
            </Text>
        </View>
    );
}

function MailIcon({ color, sent = false }: { color: string; sent?: boolean }) {
    return (
        <Svg
            width={sent ? authMetrics.heroIcon : authMetrics.fieldIcon}
            height={sent ? authMetrics.heroIcon : authMetrics.fieldIcon}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M3.6 6.4h16.8v11.2H3.6zM3.6 6.4 12 13l8.4-6.6"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {sent ? (
                <Path
                    d="m8.6 12.4 2.4 2.4 4.6-4.8"
                    stroke={color}
                    strokeWidth={authMetrics.iconStroke}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ) : null}
        </Svg>
    );
}

function EyeIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.fieldActionIcon}
            height={authMetrics.fieldActionIcon}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M2.6 12S6 6.6 12 6.6 21.4 12 21.4 12 18 17.4 12 17.4 2.6 12 2.6 12Z"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Circle
                cx="12"
                cy="12"
                r="2.8"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
            />
        </Svg>
    );
}

type AuthFieldProps = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
    label: string;
    icon?: 'email';
    password?: boolean;
    error?: boolean;
    success?: boolean;
};

/** Otomatik doldurma ve yapıştırmayı engellemeyen gerçek native giriş alanı. */
export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField({
    label,
    icon,
    password = false,
    error = false,
    success = false,
    onFocus,
    onBlur,
    ...inputProps
}, ref) {
    const { c, small } = useTheme();
    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(password);
    const fieldHeight = small ? authMetrics.inputHeightSmall : authMetrics.inputHeight;
    return (
        <View style={{ gap: small ? authMetrics.smallFieldGap : authMetrics.fieldGap }}>
            <Text style={{
                color: c.tx2,
                fontSize: type.tiny.fontSize,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: type.tiny.fontSize * 0.1,
            }}>
                {upperTR(label)}
            </Text>
            {/* Alan da cam — ama plakadan KALIN (blur 14, dolgu .58): içine
                yazı yazılacak ve ışık alanının hareketi imlecin arkasında
                görünürse dikkat dağıtıyor. */}
            <GlassPlate
                kind="input"
                focus={focused && !error}
                error={error}
                radius={small ? authMetrics.smallFieldRadius : authMetrics.fieldRadius}
            >
            <View style={{
                height: fieldHeight,
                paddingHorizontal: authMetrics.fieldX,
                flexDirection: 'row',
                alignItems: 'center',
                gap: authMetrics.fieldInnerGap,
            }}>
                {icon === 'email' ? <MailIcon color={c.tx3} /> : null}
                <TextInput
                    {...inputProps}
                    ref={ref}
                    secureTextEntry={password && hidden}
                    onFocus={(event) => {
                        setFocused(true);
                        onFocus?.(event);
                    }}
                    onBlur={(event) => {
                        setFocused(false);
                        onBlur?.(event);
                    }}
                    selectionColor={c.or}
                    placeholderTextColor={c.tx3}
                    style={{
                        flex: 1,
                        color: c.tx,
                        fontSize: authMetrics.fieldTextSize,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        padding: 0,
                    }}
                />
                {password ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={hidden ? 'Şifreyi göster' : 'Şifreyi gizle'}
                        hitSlop={space.sm}
                        onPress={() => setHidden((value) => !value)}
                    >
                        <View style={{
                            width: hit.icon,
                            height: hit.icon,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: authMetrics.backOffset,
                        }}>
                            <EyeIcon color={c.tx2} />
                        </View>
                    </Pressable>
                ) : null}
            </View>
            </GlassPlate>
        </View>
    );
});

/** Üç aşamalı yeni işletme ilerlemesi; yükseklik ve renk durumla sıçramaz. */
export function AuthStepIndicator({ step }: { step: 1 | 2 | 3 }) {
    const { c } = useTheme();
    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${step} / 3`}
            accessibilityValue={{ min: 1, max: 3, now: step, text: `${step} / 3` }}
            style={{
            flexDirection: 'row',
            gap: authMetrics.signupStepsGap,
            paddingTop: step === 3 ? authMetrics.readyStepsTop : authMetrics.signupStepsTop,
            paddingHorizontal: authMetrics.signupStepsX,
            paddingBottom: authMetrics.signupStepsBottom,
        }}>
            {[1, 2, 3].map((value) => (
                <View
                    key={value}
                    style={{
                        flex: 1,
                        height: authMetrics.signupStepHeight,
                        borderRadius: radius.pill,
                        backgroundColor: value <= step ? c.tx : c.bd2,
                    }}
                />
            ))}
        </View>
    );
}

/** Şifre kuralı aynı yerde kalır; yalnız nötr durum yeşil onaya dönüşür. */
function AuthCheckIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M4.5 12.6 9.4 17.5 19.5 7"
                stroke={color}
                strokeWidth={authMetrics.passwordHintCheckStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export function AuthPasswordRule({ valid, message }: { valid: boolean; message: string }) {
    const { c, reduceMotion } = useTheme();
    const statusProgress = useRef(new Animated.Value(valid ? 1 : 0)).current;

    useEffect(() => {
        statusProgress.stopAnimation();

        if (!valid) {
            statusProgress.setValue(0);
            return;
        }

        statusProgress.setValue(0);
        Animated.timing(statusProgress, {
            toValue: 1,
            duration: reduceMotion ? authMotion.statusReduced : authMotion.statusIn,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false,
        }).start();
    }, [reduceMotion, statusProgress, valid]);

    const statusTransform = valid && !reduceMotion
        ? [{
            translateY: statusProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [authMetrics.passwordHintCircleTop * 2, 0],
            }),
        }]
        : undefined;

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: authMetrics.passwordHintGap,
            paddingHorizontal: authMetrics.passwordHintX,
        }}>
            <Animated.View style={{
                width: authMetrics.passwordHintCircle,
                height: authMetrics.passwordHintCircle,
                marginTop: authMetrics.passwordHintCircleTop,
                borderRadius: radius.pill,
                borderWidth: valid ? 0 : authMetrics.passwordHintBorder,
                borderColor: valid ? 'transparent' : c.bd2,
                backgroundColor: valid ? `${c.gr}29` : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: valid ? statusProgress : 1,
                transform: statusTransform,
            }}>
                {valid ? <AuthCheckIcon color={c.gr} size={authMetrics.passwordHintCheck} /> : null}
            </Animated.View>
            <Animated.Text style={{
                flex: 1,
                color: valid ? c.gr : c.tx2,
                fontSize: authMetrics.passwordHintSize,
                fontFamily: valid ? font.semiBold : font.medium,
                fontWeight: valid ? '600' : '500',
                lineHeight: authMetrics.passwordHintSize * authMetrics.passwordHintLine,
                opacity: valid ? statusProgress : 1,
                transform: statusTransform,
            }}>
                {message}
            </Animated.Text>
        </View>
    );
}

/** Tek seçimli sektör satırı; onay işareti anlamı renkten bağımsızlaştırır. */
export function AuthSectorOption({ label, selected, onPress, disabled = false }: {
    label: string;
    selected: boolean;
    onPress: () => void;
    disabled?: boolean;
}) {
    const { c } = useTheme();
    const press = usePressValue();
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => {
                feedback.selection();
                onPress();
            }}
            onPressIn={() => runRowPress(press, true)}
            onPressOut={() => runRowPress(press, false)}
        >
            <Animated.View style={{
                height: authMetrics.sectorRowHeight,
                paddingHorizontal: authMetrics.sectorX,
                borderRadius: authMetrics.sectorRadius,
                borderWidth: selected ? authMetrics.passwordHintBorder : 1,
                borderColor: selected ? c.or : c.bd,
                backgroundColor: selected ? c.card : c.surf,
                flexDirection: 'row',
                alignItems: 'center',
                gap: authMetrics.welcomeChoiceGap,
                opacity: disabled ? 0.5 : press.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, pressMotion.ghostOpacity],
                }),
            }}>
                <View style={{
                    width: authMetrics.sectorRadio,
                    height: authMetrics.sectorRadio,
                    borderRadius: radius.pill,
                    borderWidth: authMetrics.sectorRadioBorder,
                    borderColor: selected ? c.or : c.bd2,
                    backgroundColor: selected ? c.or : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {selected ? (
                        <AuthCheckIcon color="#FFFFFF" size={authMetrics.sectorCheck} />
                    ) : null}
                </View>
                <Text style={{
                    color: c.tx,
                    fontSize: authMetrics.sectorTextSize,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: authMetrics.sectorTextSize * -0.02,
                }}>
                    {label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

/** Hazır ekranındaki yapılacaklar; rakamlar tamamlanmış onayı değildir. */
export function AuthReadyChecklist({ items }: { items: readonly string[] }) {
    const { c } = useTheme();
    return (
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
            {items.map((item, index) => (
                <View key={item} style={{
                    minHeight: authMetrics.readyRowHeight,
                    paddingVertical: authMetrics.readyRowY,
                    paddingHorizontal: authMetrics.readyRowX,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: c.bd,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: authMetrics.readyRowGap,
                }}>
                    <View style={{
                        width: authMetrics.readyNumberCircle,
                        height: authMetrics.readyNumberCircle,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: c.bd2,
                        backgroundColor: c.surf2,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Text style={{
                            color: c.tx2,
                            fontSize: authMetrics.readyNumberSize,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                        }}>
                            {index + 1}
                        </Text>
                    </View>
                    <Text style={{
                        flex: 1,
                        color: c.tx,
                        fontSize: type.body.fontSize,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: type.body.fontSize * -0.015,
                    }}>
                        {item}
                    </Text>
                </View>
            ))}
        </View>
    );
}

/** Hata/bilgi yüzeyi; renk tema paletinden, ölçü tokenlardan gelir. */
export function AuthBanner({ children, kind = 'info', inset = true, style }: {
    children: ReactNode;
    kind?: 'info' | 'error';
    inset?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const { c, dark } = useTheme();
    const error = kind === 'error';
    return (
        <View style={[{
            marginHorizontal: inset ? authMetrics.bannerX : 0,
            paddingVertical: authMetrics.bannerY,
            paddingHorizontal: authMetrics.bannerX,
            borderRadius: authMetrics.bannerRadius,
            borderWidth: 1,
            borderColor: error ? `${c.rd}5C` : c.bd,
            // OPAK. Kural: bilgi taşıyan renk camdan geçmez. Cam arkasındaki
            // alanın rengini içeri alıyor; kırmızının kırmızı kalması gerek.
            backgroundColor: error ? (dark ? '#3A1414' : '#FBE7E7') : c.surf2,
        }, style]}>
            <Text style={{
                color: error ? c.rd : c.tx2,
                fontSize: authMetrics.bannerTextSize,
                fontFamily: font.semiBold,
                lineHeight: authMetrics.bannerTextSize * authMetrics.bannerLine,
                fontWeight: '600',
            }}>
                {children}
            </Text>
        </View>
    );
}

/** Giriş 04b üst başarı alanı. */
export function AuthSentHero({ email, title, questions }: {
    email: string;
    title: string;
    questions: readonly (readonly [string, string])[];
}) {
    const { c } = useTheme();
    return (
        <View style={{
            flex: 1,
            alignItems: 'center',
            paddingTop: authMetrics.heroTop,
            paddingHorizontal: authMetrics.heroX,
            gap: authMetrics.heroGap,
        }}>
            <View style={{
                width: authMetrics.heroRing,
                height: authMetrics.heroRing,
                borderRadius: radius.pill,
                borderWidth: authMetrics.iconStroke,
                borderColor: `${c.gr}4D`,
                backgroundColor: `${c.gr}1C`,
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <MailIcon color={c.gr} sent />
            </View>
            <Text style={{
                color: c.tx,
                textAlign: 'center',
                fontSize: authMetrics.heroTitle,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: authMetrics.heroTitle * -0.035,
                lineHeight: authMetrics.heroTitle * 1.14,
            }}>
                {title}
            </Text>
            <Text style={{
                color: c.tx2,
                textAlign: 'center',
                fontSize: type.body.fontSize,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: type.body.fontSize * authMetrics.heroBodyLine,
            }}>
                {email} adresine yeni şifre bağlantısı gitti. Bağlantı 1 saat geçerli;
                {' '}açıp yeni şifrenizi yazın, sonra buraya dönün.
            </Text>
            <View style={{
                alignSelf: 'stretch',
                marginTop: space.xs,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: c.bd,
            }}>
                {questions.map(([questionTitle, subtitle], index) => (
                    <View key={questionTitle} style={{
                        paddingVertical: authMetrics.questionRowY,
                        paddingHorizontal: authMetrics.questionRowX,
                        gap: authMetrics.businessTitleGap,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderColor: c.bd,
                    }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: authMetrics.questionTitle,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: authMetrics.questionTitle * -0.015,
                        }}>
                            {questionTitle}
                        </Text>
                        <Text style={{
                            color: c.tx2,
                            fontSize: authMetrics.questionSubtitle,
                            fontFamily: font.medium,
                            fontWeight: '500',
                        }}>
                            {subtitle}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

function OfflineIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M2.6 3.4 21.4 20.6M5 10.4a11 11 0 0 1 3.4-2.1M2.5 7.6A14.6 14.6 0 0 1 8 4.4M12 4c3.4 0 6.6 1.2 9.2 3.4M15.8 10.6c1 .4 1.9 1 2.7 1.7M8.6 14.2A6.6 6.6 0 0 1 12 13M12 19.4h.01"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

function LockIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M6.2 10.4h11.6a1.4 1.4 0 0 1 1.4 1.4v7a1.4 1.4 0 0 1-1.4 1.4H6.2a1.4 1.4 0 0 1-1.4-1.4v-7a1.4 1.4 0 0 1 1.4-1.4ZM8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8M12 14.6v2"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** Etiketli bilgi kartı: büyük harf üst satır + gövde. Eylem taşımaz. */
export function AuthNoteCard({ label, body }: { label: string; body: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            borderRadius: authMetrics.fieldRadius,
            borderWidth: 1,
            borderColor: c.bd,
            backgroundColor: c.card,
            padding: authMetrics.noteCardPadding,
            gap: authMetrics.noteCardGap,
        }}>
            <Text style={{
                color: c.tx2,
                fontSize: authMetrics.noteCardLabel,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: authMetrics.noteCardLabel * 0.16,
            }}>
                {upperTR(label)}
            </Text>
            <Text style={{
                color: c.tx2,
                fontSize: authMetrics.noteCardBody,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: authMetrics.noteCardBody * 1.5,
            }}>
                {body}
            </Text>
        </View>
    );
}

function ClockIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Circle
                cx={12}
                cy={12}
                r={8.4}
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
            />
            <Path
                d="M12 7.6V12l3 2"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/**
 * Durum ekranındaki üst/alt çizgili bilgi listesi. Kart değil: kart, ekranın
 * tek cümlesiyle yarışan ikinci bir yüzey olurdu.
 */
export function AuthDetailList({ rows }: {
    rows: readonly { title: string; subtitle: string; status?: string }[];
}) {
    const { c } = useTheme();
    return (
        <View style={{
            alignSelf: 'stretch',
            marginTop: space.xs,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: c.bd,
        }}>
            {rows.map((row, index) => (
                <View key={row.title} style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: authMetrics.detailRowGap,
                    paddingVertical: authMetrics.questionRowY,
                    paddingHorizontal: authMetrics.questionRowX,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderColor: c.bd,
                }}>
                    <View style={{ flex: 1, minWidth: 0, gap: authMetrics.businessTitleGap }}>
                        <Text
                            numberOfLines={1}
                            style={{
                                color: c.tx,
                                fontSize: authMetrics.questionTitle,
                                fontFamily: font.bold,
                                fontWeight: '700',
                                letterSpacing: authMetrics.questionTitle * -0.015,
                            }}
                        >
                            {row.title}
                        </Text>
                        <Text style={{
                            color: c.tx2,
                            fontSize: authMetrics.questionSubtitle,
                            fontFamily: font.medium,
                            fontWeight: '500',
                        }}>
                            {row.subtitle}
                        </Text>
                    </View>
                    {row.status ? (
                        <Text style={{
                            color: c.tx2,
                            fontSize: authMetrics.detailStatusSize,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            {row.status}
                        </Text>
                    ) : null}
                </View>
            ))}
        </View>
    );
}

export function AuthRefreshIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.fieldActionIcon}
            height={authMetrics.fieldActionIcon}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7M17.6 3.4v3.2h-3.2M6.4 20.6v-3.2h3.2"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/**
 * Girişin tam ekran durum sayfası: halka, iki satırlık başlık, gövde, eylemler.
 *
 * Gövde dikeyde ORTALANIR (`AuthSentHero` gibi üstten değil): burada okunacak
 * ikinci bir bölüm yok, ekranın tamamı tek bir cümleyi taşıyor. Eylemler alt
 * üçte birde kalır — tek elle, başparmakla.
 */
export function AuthStatusScreen({
    tone,
    icon = 'offline',
    align = 'center',
    identity,
    title,
    body,
    detail,
    extra,
    children,
}: {
    tone: 'amber' | 'red';
    icon?: 'offline' | 'clock' | 'lock';
    /** 'top': altında okunacak başka bölüm var (kart, bant). 'center': tek cümle. */
    align?: 'center' | 'top';
    identity?: { title: string; subtitle: string };
    title: string;
    body: string;
    detail?: ReactNode;
    extra?: ReactNode;
    children?: ReactNode;
}) {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const accent = tone === 'amber' ? c.am : c.rd;
    const ring = small ? authMetrics.heroRingSmall : authMetrics.heroRing;
    const titleSize = small ? authMetrics.heroTitleSmall : authMetrics.heroTitle;
    const Glyph = icon === 'clock' ? ClockIcon : icon === 'lock' ? LockIcon : OfflineIcon;
    const top = align === 'top';

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <LightField profile="form" />
            {identity ? (
                <View style={{
                    height: authMetrics.topBarHeight,
                    justifyContent: 'center',
                    paddingHorizontal: authMetrics.topBarX,
                    gap: authMetrics.resumeIdentityGap,
                }}>
                    <Text numberOfLines={1} style={{
                        color: c.tx,
                        fontSize: authMetrics.topBarTitleSize,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.topBarTitleSize * -0.02,
                    }}>
                        {identity.title}
                    </Text>
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: authMetrics.topBarSubtitleSize,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {identity.subtitle}
                    </Text>
                </View>
            ) : null}
            <View style={{
                flex: top ? 0 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: top ? authMetrics.statusTopHeroTop : 0,
                paddingHorizontal: authMetrics.heroX,
                gap: authMetrics.heroGap,
            }}>
                <View style={{
                    width: ring,
                    height: ring,
                    borderRadius: radius.pill,
                    borderWidth: authMetrics.iconStroke,
                    borderColor: `${accent}4D`,
                    backgroundColor: `${accent}1A`,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Glyph
                        color={accent}
                        size={small ? authMetrics.heroIconSmall : authMetrics.heroIcon}
                    />
                </View>
                <Text style={{
                    color: c.tx,
                    textAlign: 'center',
                    fontSize: titleSize,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: titleSize * -0.035,
                    lineHeight: titleSize * 1.14,
                }}>
                    {title}
                </Text>
                <Text style={{
                    color: c.tx2,
                    textAlign: 'center',
                    fontSize: type.body.fontSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    lineHeight: type.body.fontSize * authMetrics.heroBodyLine,
                }}>
                    {body}
                </Text>
                {detail}
            </View>
            {extra ? (
                <View style={{
                    paddingTop: authMetrics.statusExtraTop,
                    paddingHorizontal: authMetrics.actionsX,
                    gap: authMetrics.bannerTop,
                }}>
                    {extra}
                </View>
            ) : null}
            {top ? <View style={{ flex: 1 }} /> : null}
            <View style={{
                paddingHorizontal: authMetrics.actionsX,
                paddingBottom: Math.max(insets.bottom, authMetrics.actionsBottom),
                gap: authMetrics.actionsGap,
            }}>
                {children}
            </View>
        </View>
    );
}

/**
 * Giriş 15a. Formun yerine geçer, formu SİLMEZ — çağıran ekran kendi state'ini
 * tutmaya devam ettiği için bağlantı gelince yazılanlar yerinde durur.
 */
export function AuthOfflineScreen({ onRetry, busy = false }: {
    onRetry: () => void;
    busy?: boolean;
}) {
    return (
        <AuthStatusScreen tone="amber" title={offlineGate.title} body={offlineGate.body}>
            <AuthActionButton
                label={offlineGate.action}
                onPress={onRetry}
                disabled={busy}
                left={<AuthRefreshIcon color={onAccent} />}
            />
        </AuthStatusScreen>
    );
}

/**
 * Oturum okunamadı — rol kapısının kapalı hâli (`roleGate`).
 *
 * Bağlantı ekranıyla aynı iskelet ama AYRI metin ve AYRI ikon: sorun
 * internette değil, cihazda. `lock` ikonu bunu söylüyor.
 */
export function AuthSessionErrorScreen({ onRetry, busy = false }: {
    onRetry: () => void;
    busy?: boolean;
}) {
    return (
        <AuthStatusScreen tone="amber" icon="lock" title={sessionGate.title} body={sessionGate.body}>
            <AuthActionButton
                label={sessionGate.action}
                onPress={onRetry}
                disabled={busy}
                left={<AuthRefreshIcon color={onAccent} />}
            />
        </AuthStatusScreen>
    );
}

function ChevronIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.selectionChevron}
            height={authMetrics.selectionChevron}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="m9 5 7 7-7 7"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** 74 pt işletme satırı; basılı yüzey ayrı opaklık katmanıdır. */
export function AuthBusinessRow({ business, onPress }: {
    business: {
        name: string;
        location: string;
        initials: string;
        staffCount: number;
    };
    onPress: () => void;
}) {
    const { c } = useTheme();
    const press = usePressValue();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${business.name}, ${business.location}, ${business.staffCount} personel`}
            onPress={onPress}
            onPressIn={() => runRowPress(press, true)}
            onPressOut={() => runRowPress(press, false)}
        >
            <View style={{
                minHeight: authMetrics.selectionRowHeight,
                paddingHorizontal: authMetrics.selectionRowX,
                flexDirection: 'row',
                alignItems: 'center',
                gap: authMetrics.selectionRowGap,
                borderBottomWidth: 1,
                borderBottomColor: c.bd,
            }}>
                <Animated.View pointerEvents="none" style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: c.surf2,
                    opacity: press,
                }} />
                <View style={{
                    width: authMetrics.selectionAvatar,
                    height: authMetrics.selectionAvatar,
                    borderRadius: radius.pill,
                    backgroundColor: c.surf2,
                    borderWidth: authMetrics.selectionAvatarBorder,
                    borderColor: c.bd2,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: authMetrics.selectionAvatarText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.selectionAvatarText * -0.02,
                    }}>
                        {business.initials}
                    </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: authMetrics.businessTitleGap }}>
                    <Text numberOfLines={1} style={{
                        color: c.tx,
                        fontSize: authMetrics.selectionTitle,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {business.name}
                    </Text>
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: authMetrics.selectionSubtitle,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {business.location} · {business.staffCount} personel
                    </Text>
                </View>
                <ChevronIcon color={c.tx3} />
            </View>
        </Pressable>
    );
}

/** Giriş 07–08'in kimliği stub cevabından alan cam üst çubuğu. */
export function AuthIdentityBar({
    title, subtitle, onBack, contentGap = authMetrics.topBarGap, overField = false,
}: {
    title: string;
    subtitle: string;
    onBack: () => void;
    contentGap?: number;
    /**
     * Bant IŞIK ALANININ üstünde mi duruyor.
     *
     * Liquid Glass yoksa bant opak `c.surf` boyuyordu; ışık alanlı giriş
     * ekranlarında bu, tepeye yapışmış gri bir dikiş demekti — alan bandın
     * altında kesiliyordu. Cam varken zaten saydam; yokken de saydam olmalı,
     * çünkü arkasında gösterilecek bir şey VAR.
     *
     * Varsayılan `false`: `account.tsx` gibi alanı olmayan ekranlarda opak
     * yüzey doğru — orada bandın işi içeriği kaydırmadan ayırmak.
     */
    overField?: boolean;
}) {
    const { c, glass, reduceMotion } = useTheme();
    const press = usePressValue();
    const content = (
        <>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                hitSlop={space.xs}
                onPress={onBack}
                onPressIn={() => runPress(press, true, reduceMotion)}
                onPressOut={() => runPress(press, false, reduceMotion)}
                style={{ marginLeft: authMetrics.backOffset }}
            >
                <Animated.View style={{
                    width: hit.icon,
                    height: hit.icon,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: press.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, pressMotion.iconOpacity],
                    }),
                    transform: [{
                        scale: press.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, reduceMotion ? 1 : pressMotion.iconScale],
                        }),
                    }],
                }}>
                    <BackIcon color={c.tx} />
                </Animated.View>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: authMetrics.topBarTitleSize,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: authMetrics.topBarTitleSize * -0.02,
                }}>
                    {title}
                </Text>
                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: authMetrics.topBarSubtitleSize,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                }}>
                    {subtitle}
                </Text>
            </View>
        </>
    );
    // Alanın üstünde ne dolgu, ne çizgi, NE DE CAM.
    //
    // İlk yazımda `overField && !glass` idi — yani yalnız cam yokken saydam.
    // Yanlıştı: cam VARKEN de bant bir yüzey çiziyor ve ışık alanının üstünde
    // gri bir levha gibi duruyor. Alanın işi arkada görünmek; üstüne konan
    // her yüzey onu keser, cam olsa bile.
    const bare = overField;
    const barStyle: ViewStyle = {
        height: authMetrics.topBarHeight,
        paddingLeft: authMetrics.topBarX,
        paddingRight: authMetrics.topBarRight,
        flexDirection: 'row',
        alignItems: 'center',
        gap: contentGap,
        borderBottomWidth: bare ? 0 : 1,
        borderBottomColor: glass ? c.glassBorder : c.bd2,
        backgroundColor: glass || bare ? 'transparent' : c.surf,
    };
    return glass && !bare ? (
        <GlassView glassEffectStyle="regular" tintColor={c.tint} style={barStyle}>
            {content}
        </GlassView>
    ) : <View style={barStyle}>{content}</View>;
}

/**
 * Giriş v3 · personel satırı — 74 pt CAM PLAKA.
 *
 * Dört satır arka arkaya dururken aralarındaki 10 pt boşluktan ışık alanı
 * görünüyor: liste "yüzen plakalar" gibi okunuyor, tek bir kart bloğu gibi
 * değil. Eski hâlinde satırlar alt kenarlıkla birbirine dikilmişti.
 */
export function AuthStaffRow({ member, onPress }: {
    member: { initials: string; name: string; role: string };
    onPress: () => void;
}) {
    const { c, dark } = useTheme();
    const press = usePressValue();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${member.name}, ${member.role}`}
            onPress={onPress}
            onPressIn={() => runRowPress(press, true)}
            onPressOut={() => runRowPress(press, false)}
        >
            <GlassPlate radius={18}>
            <View style={{
                minHeight: authMetrics.selectionRowHeight,
                paddingHorizontal: authMetrics.selectionRowX,
                flexDirection: 'row',
                alignItems: 'center',
                gap: authMetrics.selectionRowGap,
            }}>
                <Animated.View pointerEvents="none" style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: dark ? 'rgba(18,14,8,0.28)' : 'rgba(255,255,255,0.30)',
                    opacity: press,
                }} />
                <View style={{
                    width: authMetrics.selectionAvatar,
                    height: authMetrics.selectionAvatar,
                    borderRadius: radius.pill,
                    backgroundColor: c.surf2,
                    borderWidth: authMetrics.selectionAvatarBorder,
                    borderColor: c.bd2,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: authMetrics.selectionAvatarText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.selectionAvatarText * -0.02,
                    }}>
                        {member.initials}
                    </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: authMetrics.businessTitleGap }}>
                    <Text numberOfLines={1} style={{
                        color: c.tx,
                        fontSize: authMetrics.selectionTitle,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {member.name}
                    </Text>
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: authMetrics.selectionSubtitle,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {member.role}
                    </Text>
                </View>
                <ChevronIcon color={c.tx3} />
            </View>
            </GlassPlate>
        </Pressable>
    );
}

function AuthPinDot({ filled, error }: { filled: boolean; error: boolean }) {
    const { c, reduceMotion } = useTheme();
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(filled ? 1 : 0)).current;

    useEffect(() => {
        if (!filled) {
            scale.setValue(1);
            opacity.setValue(0);
            return;
        }
        if (reduceMotion) {
            scale.setValue(1);
            opacity.setValue(0);
            Animated.timing(opacity, {
                toValue: 1,
                duration: authMotion.digitReduced,
                easing: Easing.linear,
                useNativeDriver: true,
            }).start();
            return;
        }
        scale.setValue(authMotion.pinDigitStartScale);
        opacity.setValue(1);
        Animated.spring(scale, {
            toValue: 1,
            damping: authMotion.pinDigitDamping,
            stiffness: authMotion.pinDigitStiffness,
            mass: authMotion.pinDigitMass,
            useNativeDriver: true,
        }).start();
    }, [filled, opacity, reduceMotion, scale]);

    return (
        <View style={{
            width: authMetrics.pinDot,
            height: authMetrics.pinDot,
            borderRadius: radius.pill,
            borderWidth: authMetrics.pinDotBorder,
            borderColor: error ? c.rd : filled ? c.tx : c.bd2,
            overflow: 'hidden',
        }}>
            <Animated.View style={{
                flex: 1,
                borderRadius: radius.pill,
                backgroundColor: error ? c.rd : c.tx,
                opacity,
                transform: [{ scale }],
            }} />
        </View>
    );
}

/** Dört haneli şifre göstergesi; hata sarsıntısı ekran katmanındadır. */
export function AuthPinDots({ length, error = false }: { length: number; error?: boolean }) {
    return (
        <View style={{ flexDirection: 'row', gap: authMetrics.pinDotGap }}>
            {Array.from({ length: 4 }, (_, index) => (
                <AuthPinDot key={index} filled={index < length} error={error} />
            ))}
        </View>
    );
}

/** Concept 08 marka işareti. Nokta bu turda hareket etmez. */
export function LueraMark({ staff = false, resume = false, dotStyle, glow = false }: {
    staff?: boolean;
    resume?: boolean;
    /** Giriş v3: nokta markadan AYRI geliyor — 300 ms'de, hafif taşarak. */
    dotStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
    /** Işık alanının üstünde nokta kendi ışığını taşıyor. */
    glow?: boolean;
}) {
    const { c, small } = useTheme();
    const plain = staff || resume;
    const size = resume
        ? authMetrics.resumeMarkSize
        : staff
        ? authMetrics.staffMarkSize
        : small ? authMetrics.welcomeBrandSizeSmall : authMetrics.welcomeBrandSize;
    const dot = size * (plain
        ? authMetrics.staffMarkDotRatio
        : authMetrics.brandDotRatio);
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            alignSelf: resume ? 'center' : 'flex-start',
        }}>
            <Text style={{
                color: c.tx,
                fontSize: size,
                fontFamily: plain ? font.extraBold : font.black,
                lineHeight: size * (plain ? 0.82 : 1),
                fontWeight: plain ? '800' : '900',
                letterSpacing: size * -0.05,
            }}>
                luera
            </Text>
            <RAnimated.View style={[{
                width: dot,
                height: dot,
                marginLeft: size * (staff
                    || resume
                    ? authMetrics.staffMarkDotLeftRatio
                    : authMetrics.brandDotLeftRatio),
                marginBottom: size * (staff
                    || resume
                    ? authMetrics.staffMarkDotBottomRatio
                    : authMetrics.brandDotBottomRatio),
                borderRadius: radius.pill,
                backgroundColor: c.or,
            }, glow ? {
                // 32 px turuncu ışıma. Android'de renkli gölge yok (yalnız
                // `elevation`); orada nokta ışımasız duruyor ve bu kabul —
                // ışıma markanın parçası değil, alanın üstündeki okunurluk payı.
                shadowColor: c.or,
                shadowOpacity: 1,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 0 },
            } : null, dotStyle]} />
        </View>
    );
}

function DeleteIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.keypadDeleteIcon}
            height={authMetrics.keypadDeleteIcon}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M9.2 5.5H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2L3 12l6.2-6.5Z"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Path
                d="m12 9 6 6m0-6-6 6"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
            />
        </Svg>
    );
}

function AuthCodeDigit({ value, error }: { value?: string; error: boolean }) {
    const { c, reduceMotion } = useTheme();
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        if (!value) {
            scale.setValue(1);
            opacity.setValue(0);
            return;
        }
        if (reduceMotion) {
            scale.setValue(1);
            opacity.setValue(0);
            Animated.timing(opacity, {
                toValue: 1,
                duration: authMotion.digitReduced,
                easing: Easing.linear,
                useNativeDriver: true,
            }).start();
            return;
        }
        scale.setValue(authMotion.codeDigitStartScale);
        opacity.setValue(1);
        Animated.spring(scale, {
            toValue: 1,
            damping: authMotion.codeDigitDamping,
            stiffness: authMotion.codeDigitStiffness,
            mass: authMotion.codeDigitMass,
            useNativeDriver: true,
        }).start();
    }, [opacity, reduceMotion, scale, value]);

    return (
        <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
        <GlassPlate
            kind="key"
            radius={authMetrics.codeRadius}
            error={error}
            focus={Boolean(value) && !error}
        >
        <View style={{
            height: authMetrics.codeHeight,
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <Animated.Text style={[{
                color: c.tx,
                opacity,
                fontSize: authMetrics.codeTextSize,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: authMetrics.codeTextSize * -0.02,
            }, numeric]}>
                {value ?? ''}
            </Animated.Text>
        </View>
        </GlassPlate>
        </Animated.View>
    );
}

/** Altı haneli kodun yalnız görsel alanı; doğrulama authStub'a aittir. */
export function AuthCodeBoxes({ code, error = false }: { code: string; error?: boolean }) {
    return (
        <View
            accessibilityLabel={`Eşleştirme kodu, ${code.length} hane girildi`}
            style={{ flexDirection: 'row', gap: authMetrics.codeGap }}
        >
            {Array.from({ length: 6 }, (_, index) => {
                const value = code[index];
                return <AuthCodeDigit key={index} value={value} error={error} />;
            })}
        </View>
    );
}

const AUTH_DIGITS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'backspace'],
] as const;

function AuthKeypadKey({ value, onPress, disabled }: {
    value: string;
    onPress: () => void;
    disabled: boolean;
}) {
    const { c, reduceMotion, small } = useTheme();
    const press = usePressValue();
    const blank = value === '';
    return (
        <Pressable
            accessibilityRole={blank ? undefined : 'button'}
            accessibilityLabel={value === 'backspace' ? 'Son haneyi sil' : value || undefined}
            disabled={blank || disabled}
            onPress={onPress}
            onPressIn={() => runPress(press, true, reduceMotion)}
            onPressOut={() => runPress(press, false, reduceMotion)}
            style={{ flex: 1 }}
        >
            <Animated.View style={{
                opacity: disabled ? 0.4 : 1,
                transform: [{
                    scale: press.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, reduceMotion || blank ? 1 : pressMotion.primaryScale],
                    }),
                }],
            }}>
            <KeyShell blank={blank} press={press}>
                {value === 'backspace' ? <DeleteIcon color={c.tx} /> : blank ? null : (
                    <Text style={[{
                        color: c.tx,
                        fontSize: small
                            ? authMetrics.keypadTextSizeSmall
                            : authMetrics.keypadTextSize,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }, numeric]}>
                        {value}
                    </Text>
                )}
            </KeyShell>
            </Animated.View>
        </Pressable>
    );
}

/**
 * On iki plaka aynı alanın üstünde yüzüyor. Basılan tuş dolgusunu .52'den
 * .66'ya açıyor — sönmüyor, AYDINLANIYOR: cam bir yüzeyin sönmesi onu
 * arkasındaki alanla karıştırıyordu.
 */
function KeyShell({ blank, press, children }: {
    blank: boolean;
    press: Animated.Value;
    children: ReactNode;
}) {
    const { dark, small } = useTheme();
    const height = small ? authMetrics.keypadKeyHeightSmall : authMetrics.keypadKeyHeight;
    if (blank) return <View style={{ height }} />;
    return (
        <GlassPlate kind="key" radius={authMetrics.keypadRadius}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: dark ? 'rgba(18,14,8,0.28)' : 'rgba(255,255,255,0.28)',
                    opacity: press,
                }}
            />
            <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
                {children}
            </View>
        </GlassPlate>
    );
}

/** Giriş 06 ve 08'in tek ortak sayısal tuş takımı. */
export function AuthKeypad({ onKey, disabled = false }: {
    onKey: (key: string) => void;
    disabled?: boolean;
}) {
    return (
        <View style={{
            paddingHorizontal: authMetrics.keypadX,
            paddingBottom: authMetrics.keypadBottom,
            gap: authMetrics.keypadGap,
        }}>
            {AUTH_DIGITS.map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', gap: authMetrics.keypadGap }}>
                    {row.map((value, keyIndex) => (
                        <AuthKeypadKey
                            key={`${rowIndex}-${keyIndex}`}
                            value={value}
                            disabled={disabled}
                            onPress={() => {
                                if (!value || disabled) return;
                                feedback.key();
                                onKey(value);
                            }}
                        />
                    ))}
                </View>
            ))}
        </View>
    );
}

/** Giriş 14'ün 62 pt hesap satırı; satırın kendisi kimlik veya rota bilmez. */
export function AuthAccountRow({ title, subtitle, onPress }: {
    title: string;
    subtitle?: string;
    onPress: () => void;
}) {
    const { c } = useTheme();
    const press = usePressValue();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
            onPress={onPress}
            onPressIn={() => runRowPress(press, true)}
            onPressOut={() => runRowPress(press, false)}
        >
            <View style={{
                minHeight: hit.row,
                paddingVertical: space.md,
                paddingHorizontal: space.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: authMetrics.accountRowGap,
                borderBottomWidth: 1,
                borderBottomColor: c.bd,
            }}>
                <Animated.View pointerEvents="none" style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: c.surf2,
                    opacity: press,
                }} />
                <View style={{ flex: 1, minWidth: 0, gap: authMetrics.businessTitleGap }}>
                    <Text numberOfLines={1} style={{
                        color: c.tx,
                        fontSize: type.body.fontSize,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: type.body.fontSize * -0.015,
                    }}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text numberOfLines={1} style={{
                            color: c.tx2,
                            fontSize: type.small.fontSize,
                            fontFamily: font.medium,
                            fontWeight: '500',
                        }}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                <ChevronIcon color={c.tx3} />
            </View>
        </Pressable>
    );
}

export function AuthDeleteDialog({
    items,
    reauth = false,
    password = '',
    passwordError = false,
    busy = false,
    onPasswordChange,
    onConfirm,
    onCancel,
}: {
    items: readonly string[];
    reauth?: boolean;
    password?: string;
    passwordError?: boolean;
    busy?: boolean;
    onPasswordChange?: (value: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const reveal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(reveal, {
            toValue: 1,
            duration: reduceMotion ? authMotion.statusReduced : authMotion.statusIn,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false,
        }).start();
    }, [reduceMotion, reveal]);

    return (
        <View
            accessibilityViewIsModal
            importantForAccessibility="yes"
            style={{ position: 'absolute', inset: 0 }}
        >
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: dark ? 'rgba(0,0,0,0.5)' : 'rgba(14,14,14,0.34)',
                    opacity: reveal,
                }}
            />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{
                    flex: 1,
                    justifyContent: 'center',
                    paddingHorizontal: authMetrics.deleteDialogX,
                }}
            >
                <Animated.View
                    accessibilityRole="alert"
                    style={{
                        width: '100%',
                        padding: authMetrics.deleteDialogPadding,
                        gap: authMetrics.deleteDialogGap,
                        borderRadius: radius.xl,
                        borderWidth: 1,
                        borderColor: c.bd2,
                        backgroundColor: c.card,
                        opacity: reveal,
                    }}
                >
                    <Text style={{
                        color: c.tx,
                        fontSize: authMetrics.deleteDialogTitleSize,
                        lineHeight: authMetrics.deleteDialogTitleSize
                            * authMetrics.deleteDialogTitleLine,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.deleteDialogTitleSize * -0.03,
                    }}>
                        {reauth ? 'Şifrenizi girin' : 'Hesabınızı silelim mi?'}
                    </Text>
                    <Text style={{
                        color: c.tx2,
                        fontSize: authMetrics.deleteDialogBodySize,
                        lineHeight: authMetrics.deleteDialogBodySize
                            * authMetrics.deleteDialogBodyLine,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {reauth
                            ? 'Hesabınızı silme isteğini korumak için şifrenizi bir kez daha yazın.'
                            : 'Bu işlem geri alınamaz. Silinince aynı e-postayla yeniden açsanız bile eski bilgileriniz gelmez.'}
                    </Text>

                    {reauth ? (
                        <>
                            <AuthField
                                label="Şifre"
                                value={password}
                                onChangeText={onPasswordChange}
                                password
                                error={passwordError}
                                textContentType="password"
                                autoComplete="current-password"
                                returnKeyType="go"
                                onSubmitEditing={onConfirm}
                            />
                            {passwordError ? (
                                <AuthBanner kind="error" inset={false}>
                                    Şifre eşleşmedi. Yeniden deneyin.
                                </AuthBanner>
                            ) : null}
                        </>
                    ) : (
                        <View style={{ gap: authMetrics.deleteDialogListGap }}>
                            {items.map((item) => (
                                <View key={item} style={{
                                    flexDirection: 'row',
                                    alignItems: 'flex-start',
                                    gap: authMetrics.deleteDialogItemGap,
                                }}>
                                    <View style={{
                                        width: authMetrics.deleteDialogDot,
                                        height: authMetrics.deleteDialogDot,
                                        marginTop: authMetrics.deleteDialogDotTop,
                                        borderRadius: radius.pill,
                                        backgroundColor: c.tx3,
                                    }} />
                                    <Text style={{
                                        flex: 1,
                                        color: c.tx2,
                                        fontSize: authMetrics.deleteDialogItemSize,
                                        lineHeight: authMetrics.deleteDialogItemSize
                                            * authMetrics.deleteDialogItemLine,
                                        fontFamily: font.medium,
                                        fontWeight: '500',
                                    }}>
                                        {item}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}

                    <View style={{ gap: authMetrics.deleteDialogActionsGap }}>
                        <AuthActionButton
                            kind="danger"
                            label="Hesabımı sil"
                            disabled={busy || (reauth && !password)}
                            onPress={onConfirm}
                        />
                        <AuthActionButton
                            kind="secondary"
                            label="Vazgeç"
                            disabled={busy}
                            onPress={onCancel}
                        />
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </View>
    );
}
