/**
 * Giriş v4 · Apple ve Google — v3 kitinin ÜSTÜNE gelen parçalar.
 *
 * Kaynak `Luera Mobil - Giris v4 Apple Google.html`. v3'ün malzemesi (ışık
 * alanı, cam alan kutuları, `AuthField`) `ui.tsx`'te olduğu gibi duruyor; bu
 * dosya yalnız v4'ün eklerini taşıyor:
 *
 *   SsoPair      Apple (sistemin düğmesi) + Google (Google'ın özel tarifi)
 *   AuthOrWait   "ya da" ayracı ↔ "Apple ile giriş yapılıyor" — aynı 20 pt
 *   AuthBand     opak hata / uyarı bandı (`.berr` / `.bwarn`)
 *   AuthOtp      tek gizli alan + 6 cam kutu (K2 · S2)
 *   AuthAccountPlate  köprünün "hangi hesapla geldiniz" satırı (B5)
 *   AuthV4…      v4 sayfa başlığı, geri, düğme, alt satır, kural, gizlilik
 *
 * ── Cam nerede biter (karar 4) ──────────────────────────────────────────────
 * Alan, form alanları ve kod kutuları cam. Apple, Google, Gir ve bütün
 * bantlar OPAK: eylem ve bilgi taşıyan renk camdan geçmez.
 *
 * ── Hareket (karar 9) ───────────────────────────────────────────────────────
 * Yalnız opacity / translate. Yeni gösteri hareketi yok: doğuş 80 ms
 * ritminde, durum 140, ileri 240, geri 200; yay sönüm 20 · sertlik 330.
 * reduceMotion'da yay ve kayma yok, her şey 140 ms opaklıkla gelir; bekleme
 * noktaları durur, metni kalır.
 */

/*
 * `react-hooks/immutability` reanimated'in paylaşılan değerini (`sv.value = …`)
 * bilmiyor; bu dosyadaki bütün yazımlar o türden. Kural yalnız burada kapalı.
 */
/* eslint-disable react-hooks/immutability */

import * as AppleAuthentication from 'expo-apple-authentication';
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import {
    Animated as RNAnimated,
    Easing as RNEasing,
    Keyboard,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { GlassPlate, glassColors } from './GlassPlate';
import { feedback } from '../lib/feedback';
import { PRIVACY_URL } from '../lib/managerProfile';
import { upperTR } from '../lib/text';
import { PASSWORD_RULE_TEXT, formatCountdown } from '../lib/authCopy';
import {
    font, numeric, pressMotion, ssoInk, ssoMetrics as S, ssoMotion as MO, useTheme,
} from '../theme';

// ── Doğuş ───────────────────────────────────────────────────────────────────

/**
 * B1 · K1 doğuşu: başlık 0 · Apple 80 · Google 160 · ayraç + form 240 ms —
 * `opacity 0→1 + translateY 20→0`, yay sönüm 20 · sertlik 330.
 */
function useStagger(step: number) {
    const { reduceMotion } = useTheme();
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = 0;
        t.value = reduceMotion
            ? withTiming(1, { duration: MO.reduced, easing: Easing.linear })
            : withDelay(step * MO.stagger, withSpring(1, { damping: MO.damping, stiffness: MO.stiffness }));
    }, [reduceMotion, step, t]);
    return useAnimatedStyle(() => {
        'worklet';
        const opacity = Math.min(1, Math.max(0, t.value));
        if (reduceMotion) return { opacity };
        return { opacity, transform: [{ translateY: MO.rise * (1 - t.value) }] };
    });
}

/**
 * Ekran içi aşama — K1 → K2, S1 → S2 → S3. Kabuk (geri, çubuk) yerinde
 * kalır; orta bölge `translateX ∓40 + opacity` ile gelir. Anahtar değişince
 * yeniden kurulur (`key={phase}`).
 */
export function AuthPhase({ back = false, children, style }: {
    back?: boolean;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const { reduceMotion } = useTheme();
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = withTiming(1, {
            duration: reduceMotion ? MO.reduced : back ? MO.back : MO.forward,
            easing: reduceMotion ? Easing.linear : Easing.out(Easing.cubic),
        });
    }, [back, reduceMotion, t]);
    const animated = useAnimatedStyle(() => {
        'worklet';
        if (reduceMotion) return { opacity: t.value };
        return {
            opacity: t.value,
            transform: [{ translateX: (back ? -MO.shift : MO.shift) * (1 - t.value) }],
        };
    });
    return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

// ── Başlık, geri, alt satır ────────────────────────────────────────────────

function BackIcon({ color }: { color: string }) {
    return (
        <Svg width={S.navIcon} height={S.navIcon} viewBox="0 0 24 24" fill="none">
            <Path
                d="M15 5l-7 7 7 7"
                stroke={color}
                strokeWidth={S.navStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** `.nav` — 6 pt üst, 12 pt yan, 44 pt dokunma hedefi. */
export function AuthV4Nav({ onBack }: { onBack: () => void }) {
    const { c } = useTheme();
    return (
        <View style={{ paddingTop: S.navTop, paddingHorizontal: S.navX }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                onPress={onBack}
                style={({ pressed }) => ({
                    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
                    opacity: pressed ? pressMotion.iconOpacity : 1,
                })}
            >
                <BackIcon color={c.tx} />
            </Pressable>
        </View>
    );
}

/**
 * `.pgtitle` — v4'ün sayfa başlığı. Gövde metni çocuk olarak da verilebilir:
 * K2'de e-posta adresi kalın yazılıyor.
 */
export function AuthV4Title({ title, body, children, stagger = true }: {
    title: string;
    body?: string;
    children?: ReactNode;
    /** Doğuşun ilk adımı (0 ms). Aşama içinde gelen başlıkta kapalı. */
    stagger?: boolean;
}) {
    const { c } = useTheme();
    const rise = useStagger(0);
    const content = (
        <>
            <Text
                accessibilityRole="header"
                style={{
                    color: c.tx,
                    fontSize: S.titleSize,
                    lineHeight: S.titleSize * S.titleLine,
                    letterSpacing: S.titleSize * S.titleTrack,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                }}
            >
                {title}
            </Text>
            <Text style={{
                color: c.tx2,
                fontSize: S.bodySize,
                lineHeight: S.bodySize * S.bodyLine,
                fontFamily: font.semiBold,
                fontWeight: '600',
            }}>
                {body ?? children}
            </Text>
        </>
    );
    const frame: ViewStyle = {
        paddingTop: S.titleTop,
        paddingHorizontal: S.titleX,
        paddingBottom: S.titleBottom,
        gap: S.titleGap,
    };
    return stagger
        ? <Animated.View style={[frame, rise]}>{content}</Animated.View>
        : <View style={frame}>{content}</View>;
}

/** Başlık gövdesindeki kalın parça (`.pgtitle span b`). */
export function AuthV4Strong({ children }: { children: ReactNode }) {
    const { c } = useTheme();
    return <Text style={{ color: c.tx, fontFamily: font.bold, fontWeight: '700' }}>{children}</Text>;
}

/** Metnin içindeki bağlantı — kalın, altı çizili (`.foot u` dili). */
export function AuthV4InlineLink({ label, onPress }: { label: string; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Text
            accessibilityRole="link"
            onPress={onPress}
            suppressHighlighting={false}
            style={{ color: c.tx, fontFamily: font.bold, fontWeight: '700', textDecorationLine: 'underline' }}
        >
            {label}
        </Text>
    );
}

/** `.bot .foot` — "Hesabınız yok mu? Yeni işletme oluşturun". */
export function AuthV4Foot({ question, action, onPress }: {
    question: string;
    action: string;
    onPress: () => void;
}) {
    const { c, small } = useTheme();
    return (
        <View style={{
            paddingHorizontal: S.formX,
            paddingBottom: small ? S.footBottomSmall : S.footBottom,
        }}>
            <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${question} ${action}`}
                onPress={onPress}
                style={({ pressed }) => ({
                    height: S.footHeight,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: S.footGap,
                    opacity: pressed ? pressMotion.ghostOpacity : 1,
                })}
            >
                <Text style={{ color: c.tx2, fontSize: S.footText, fontFamily: font.medium, fontWeight: '500' }}>
                    {question}
                </Text>
                <Text style={{
                    color: c.tx,
                    fontSize: S.footText,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                }}>
                    {action}
                </Text>
            </Pressable>
        </View>
    );
}

/** `.tlink` — "Şifremi unuttum", "E-postayı değiştir" (sessiz) ve diğerleri. */
export function AuthV4Link({ label, onPress, quiet = true }: {
    label: string;
    onPress: () => void;
    quiet?: boolean;
}) {
    const { c, small } = useTheme();
    return (
        <Pressable
            accessibilityRole="link"
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => ({
                alignSelf: 'center',
                height: small ? S.linkHeightSmall : S.linkHeight,
                paddingHorizontal: S.linkX,
                justifyContent: 'center',
                opacity: pressed ? pressMotion.ghostOpacity : 1,
            })}
        >
            <Text style={{
                color: quiet ? c.tx2 : c.tx,
                fontSize: S.linkText,
                fontFamily: quiet ? font.semiBold : font.bold,
                fontWeight: quiet ? '600' : '700',
                textDecorationLine: 'underline',
            }}>
                {label}
            </Text>
        </Pressable>
    );
}

// ── Düğmeler ────────────────────────────────────────────────────────────────

function usePress() {
    const [value] = useState(() => new RNAnimated.Value(0));
    const { reduceMotion } = useTheme();
    const run = (pressed: boolean) => {
        value.stopAnimation();
        RNAnimated.timing(value, {
            toValue: pressed ? 1 : 0,
            duration: reduceMotion ? pressMotion.reduced : pressed ? pressMotion.in : pressMotion.out,
            easing: RNEasing.out(RNEasing.cubic),
            useNativeDriver: true,
            isInteraction: false,
        }).start();
    };
    return { value, run };
}

/**
 * `.btn` — Gir, Devam, Kod gönder, Şifreyi kaydet, Yeni işletme oluştur.
 *
 * v4 karar 1: Apple, Google ve bu düğme AYNI boy (60 · 56), yarıçap 18.
 * Pasif hâl bugünkü opak koyu zemin (açık nokta 12), turuncunun soluğu değil.
 * `busy` — sunucu beklenirken `opacity 1→.42` · 140 ms (S3).
 * `glass` — köprünün ikinci çıkışı: cam, 52 pt (`.btn.glass.sec`).
 */
export function AuthV4Button({ label, onPress, disabled = false, busy = false, glass = false }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
    glass?: boolean;
}) {
    const { c, small, reduceMotion } = useTheme();
    const press = usePress();
    const dim = useSharedValue(busy ? 1 : 0);
    useEffect(() => {
        dim.value = withTiming(busy ? 1 : 0, { duration: MO.state, easing: Easing.linear });
    }, [busy, dim]);
    const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - (1 - S.dimmed) * dim.value }));

    const off = disabled && !busy;
    const height = glass ? S.secondaryHeight : small ? S.buttonHeightSmall : S.buttonHeight;
    const size = glass ? S.secondaryText : small ? S.buttonTextSmall : S.buttonText;
    const text = (
        <Text style={{
            color: glass ? c.tx : off ? c.tx3 : '#FFFFFF',
            fontSize: size,
            fontFamily: font.extraBold,
            fontWeight: '800',
            letterSpacing: size * -0.02,
        }}>
            {label}
        </Text>
    );
    return (
        <Animated.View style={dimStyle}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: disabled || busy, busy }}
                disabled={disabled || busy}
                onPress={onPress}
                onPressIn={() => {
                    if (!glass) feedback.light();
                    press.run(true);
                }}
                onPressOut={() => press.run(false)}
            >
                <RNAnimated.View style={{
                    opacity: press.value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, glass
                            ? pressMotion.ghostOpacity
                            : reduceMotion ? pressMotion.reducedOpacity : pressMotion.primaryOpacity],
                    }),
                    transform: [{
                        scale: press.value.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, glass || reduceMotion ? 1 : pressMotion.primaryScale],
                        }),
                    }],
                }}>
                    {glass ? (
                        <GlassPlate radius={S.buttonRadius}>
                            <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>{text}</View>
                        </GlassPlate>
                    ) : (
                        <View style={{
                            height,
                            borderRadius: S.buttonRadius,
                            backgroundColor: off ? c.surf2 : c.or,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {text}
                        </View>
                    )}
                </RNAnimated.View>
            </Pressable>
        </Animated.View>
    );
}

/** Google'ın çok renkli G'si — değiştirilmeden, 20 pt (karar 3). */
function GoogleMark({ size }: { size: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
            <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </Svg>
    );
}

/**
 * Google — kendi çizimimiz, Google'ın özel düğme kuralıyla: dolgu / kenar /
 * yazı koyu `#131314 / #8E918F / #E3E3E3`, açık `#FFFFFF / #747775 /
 * #1F1F1F`; kenar 1 pt içeri; G 20 pt; Google Sans Medium 17 (açık nokta 5);
 * iOS dolgusu 16 · G · 12 · yazı · 16. Opak — cam değil.
 */
function GoogleButton({ label, onPress }: { label: string; onPress: () => void }) {
    const { dark, small } = useTheme();
    const ink = dark ? ssoInk.dark : ssoInk.light;
    const press = usePress();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            onPressIn={() => press.run(true)}
            onPressOut={() => press.run(false)}
        >
            <RNAnimated.View style={{
                height: small ? S.buttonHeightSmall : S.buttonHeight,
                borderRadius: S.buttonRadius,
                borderWidth: 1,
                borderColor: ink.googleBorder,
                backgroundColor: ink.googleBg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: S.googleGap,
                paddingHorizontal: S.googleX,
                opacity: press.value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, pressMotion.reducedOpacity],
                }),
            }}>
                <GoogleMark size={S.googleIcon} />
                <Text style={{
                    color: ink.googleText,
                    fontSize: S.googleText,
                    fontFamily: font.googleMedium,
                    fontWeight: '500',
                }}>
                    {label}
                </Text>
            </RNAnimated.View>
        </Pressable>
    );
}

/**
 * Apple üstte, Google altında, aralarında 10 (karar 1).
 *
 * Apple sistemin `AppleAuthenticationButton`'ı: B1'de SIGN_IN, K1'de SIGN_UP;
 * koyu temada WHITE, açık temada BLACK; yarıçap 18. Yazı, logo, yazı tipi ve
 * basılı hâl iOS'un — dili `app.json`'daki Türkçe yerelleştirmeden (açık
 * nokta 6). Android'de Apple yok (karar 8): `apple={false}`.
 *
 * Bekleme sürerken (B4) iki düğme olduğu gibi kalır, yalnız dokunuşları kapanır.
 */
export function SsoPair({ intent, apple, locked, onApple, onGoogle }: {
    intent: 'login' | 'signup';
    apple: boolean;
    locked: boolean;
    onApple: () => void;
    onGoogle: () => void;
}) {
    const { dark, small } = useTheme();
    const appleRise = useStagger(1);
    const googleRise = useStagger(apple ? 2 : 1);
    const signup = intent === 'signup';
    return (
        <View style={{ gap: S.pairGap }} pointerEvents={locked ? 'none' : 'auto'}>
            {apple && Platform.OS === 'ios' ? (
                <Animated.View style={appleRise}>
                    <AppleAuthentication.AppleAuthenticationButton
                        buttonType={signup
                            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={dark
                            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={S.buttonRadius}
                        style={{ width: '100%', height: small ? S.buttonHeightSmall : S.buttonHeight }}
                        onPress={onApple}
                    />
                </Animated.View>
            ) : null}
            <Animated.View style={googleRise}>
                {/* Açık nokta 4: Google yerelleştirmeye izin veriyor; brief'teki yazı. */}
                <GoogleButton label={signup ? 'Google ile kaydol' : 'Google ile giriş yap'} onPress={onGoogle} />
            </Animated.View>
        </View>
    );
}

// ── Ayraç ↔ bekleme ─────────────────────────────────────────────────────────

function WaitDot({ index }: { index: number }) {
    const { c, reduceMotion } = useTheme();
    const t = useSharedValue(reduceMotion ? 1 : MO.waitDotLow);
    useEffect(() => {
        if (reduceMotion) { t.value = 1; return undefined; }
        t.value = MO.waitDotLow;
        t.value = withDelay(index * MO.waitDotStagger, withRepeat(
            withTiming(1, { duration: MO.waitDot, easing: Easing.inOut(Easing.quad) }),
            -1,
            true,
        ));
        return () => cancelAnimation(t);
    }, [index, reduceMotion, t]);
    const style = useAnimatedStyle(() => ({ opacity: t.value }));
    return (
        <Animated.View style={[{
            width: S.waitDot, height: S.waitDot, borderRadius: S.waitDot / 2, backgroundColor: c.tx2,
        }, style]} />
    );
}

/**
 * B4 — bekleme AYRACIN YERİNE geçiyor: aynı 20 pt satır, düzen kaymıyor,
 * gözün baktığı yer düğmenin hemen altı. İkisi arasında 140 ms çapraz solma.
 * Bekleme sağlayıcının penceresi kapanıp sunucuya gidildiği anda başlar.
 */
export function AuthOrWait({ waiting }: { waiting: string | null }) {
    const { c } = useTheme();
    const rise = useStagger(3);
    const t = useSharedValue(waiting ? 1 : 0);
    const [label, setLabel] = useState(waiting);
    useEffect(() => {
        if (waiting) setLabel(waiting);
        t.value = withTiming(waiting ? 1 : 0, { duration: MO.state, easing: Easing.linear });
    }, [t, waiting]);
    const orStyle = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
    const waitStyle = useAnimatedStyle(() => ({ opacity: t.value }));
    return (
        <Animated.View style={[{ height: S.orHeight }, rise]}>
            <Animated.View
                importantForAccessibility={waiting ? 'no-hide-descendants' : 'auto'}
                style={[StyleSheet.absoluteFill, {
                    flexDirection: 'row', alignItems: 'center', gap: S.orGap,
                }, orStyle]}
            >
                <View style={{ flex: 1, height: 1, backgroundColor: c.bd2 }} />
                <Text style={{ color: c.tx3, fontSize: S.orText, fontFamily: font.semiBold, fontWeight: '600' }}>
                    ya da
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.bd2 }} />
            </Animated.View>
            <Animated.View
                pointerEvents="none"
                accessibilityLiveRegion="polite"
                style={[StyleSheet.absoluteFill, {
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.waitGap,
                }, waitStyle]}
            >
                {waiting ? (
                    <View style={{ flexDirection: 'row', gap: S.waitDotGap }}>
                        <WaitDot index={0} />
                        <WaitDot index={1} />
                        <WaitDot index={2} />
                    </View>
                ) : null}
                <Text style={{ color: c.tx2, fontSize: S.waitText, fontFamily: font.semiBold, fontWeight: '600' }}>
                    {label ?? ''}
                </Text>
            </Animated.View>
        </Animated.View>
    );
}

/**
 * B4 — bekleme sürerken form ve alt bağlantı %42'ye iner ve dokunmaya
 * kapanır: `opacity 1→.42` · 140 ms. Doğuşun son adımını (240 ms) da taşır.
 */
export function AuthDim({ dimmed, stagger, children, style }: {
    dimmed: boolean;
    stagger?: number;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const rise = useStagger(stagger ?? 0);
    const t = useSharedValue(dimmed ? 1 : 0);
    useEffect(() => {
        t.value = withTiming(dimmed ? 1 : 0, { duration: MO.state, easing: Easing.linear });
    }, [dimmed, t]);
    const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - (1 - S.dimmed) * t.value }));
    return (
        <Animated.View style={stagger === undefined ? undefined : rise}>
            <Animated.View pointerEvents={dimmed ? 'none' : 'auto'} style={[dimStyle, style]}>
                {children}
            </Animated.View>
        </Animated.View>
    );
}

// ── Bantlar ─────────────────────────────────────────────────────────────────

/**
 * `.berr` (kırmızı) ve `.bwarn` (amber) — opak, kendi kenarıyla.
 *
 * Geliş `opacity 0→1 + translateY −6→0` · 140 ms · `Easing.out(cubic)`.
 * Sarsıntı yok. Amber "kişi yanlış bir şey yapmadı" demek (süresi dolan kod,
 * çok deneme); kırmızı yalnız hatada.
 */
export function AuthBand({ kind = 'error', children }: {
    kind?: 'error' | 'warn';
    children: ReactNode;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const ink = dark ? ssoInk.dark : ssoInk.light;
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = withTiming(1, {
            duration: MO.state,
            easing: reduceMotion ? Easing.linear : Easing.out(Easing.cubic),
        });
    }, [reduceMotion, t]);
    const style = useAnimatedStyle(() => {
        'worklet';
        if (reduceMotion) return { opacity: t.value };
        return { opacity: t.value, transform: [{ translateY: -MO.bandRise * (1 - t.value) }] };
    });
    const warn = kind === 'warn';
    return (
        <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[{
                paddingVertical: S.bandY,
                paddingHorizontal: S.bandX,
                borderRadius: S.bandRadius,
                borderWidth: 1,
                borderColor: warn ? c.am : ink.errBorder,
                backgroundColor: warn ? c.surf2 : ink.errBg,
            }, style]}
        >
            <Text style={[{
                color: warn ? ink.warnText : ink.errText,
                fontSize: S.bandText,
                lineHeight: S.bandText * S.bandLine,
                fontFamily: font.semiBold,
                fontWeight: '600',
            }, numeric]}>
                {children}
            </Text>
        </Animated.View>
    );
}

// ── Kural, gizlilik, ipucu ─────────────────────────────────────────────────

function CheckIcon({ color, size, stroke }: { color: string; size: number; stroke: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path d="M4.5 12.6 9.4 17.5 19.5 7" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

/** `.rule` — kural sağlanınca daire yeşil dolar; yazı aynı kalır (S3). */
export function AuthV4Rule({ valid }: { valid: boolean }) {
    const { c } = useTheme();
    return (
        <View
            accessible
            accessibilityLabel={`${PASSWORD_RULE_TEXT}${valid ? ' Sağlandı.' : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: S.ruleGap, paddingHorizontal: S.ruleX }}
        >
            <View style={{
                width: S.ruleCircle,
                height: S.ruleCircle,
                borderRadius: S.ruleCircle / 2,
                borderWidth: S.ruleBorder,
                borderColor: valid ? c.gr : c.bd2,
                backgroundColor: valid ? c.gr : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {valid ? <CheckIcon color="#FFFFFF" size={S.ruleCheck} stroke={S.ruleCheckStroke} /> : null}
            </View>
            <Text style={{
                flex: 1,
                color: c.tx2,
                fontSize: S.ruleText,
                fontFamily: font.medium,
                fontWeight: '500',
            }}>
                {PASSWORD_RULE_TEXT}
            </Text>
        </View>
    );
}

/**
 * Gizlilik satırı (karar 6) — KVKK'da gizlilik metni KABUL ETTİRİLMEZ, bilgi
 * verilir. Tasarımın yer tutucusu ("… kabul edersiniz") bu yüzden değişti.
 * Yeri tasarımdaki gibi Devam'ın üstü; Apple/Google'a basan da onu ekranda
 * görüyor (açık nokta 11).
 */
export function AuthPrivacyLine() {
    const { c } = useTheme();
    return (
        <Text style={{
            paddingHorizontal: S.legalX,
            color: c.tx3,
            fontSize: S.legalText,
            lineHeight: S.legalText * S.legalLine,
            fontFamily: font.medium,
            fontWeight: '500',
        }}>
            Bilgileriniz{' '}
            <Text
                accessibilityRole="link"
                onPress={() => { void Linking.openURL(PRIVACY_URL); }}
                style={{ color: c.tx2, textDecorationLine: 'underline' }}
            >
                Gizlilik Politikası
            </Text>
            'na göre işlenir.
        </Text>
    );
}

/** `.hint` (S1) ve `.small` (B5) — ortalanmış / sola dayalı küçük metin. */
export function AuthV4Note({ children, center = false }: { children: ReactNode; center?: boolean }) {
    const { c } = useTheme();
    const size = center ? S.hintText : S.noteText;
    return (
        <Text style={{
            paddingHorizontal: center ? S.hintX : S.noteX,
            textAlign: center ? 'center' : 'left',
            color: c.tx2,
            fontSize: size,
            lineHeight: size * (center ? S.hintLine : S.noteLine),
            fontFamily: font.medium,
            fontWeight: '500',
        }}>
            {children}
        </Text>
    );
}

// ── Köprü · hesap satırı ───────────────────────────────────────────────────

function MailIcon({ color }: { color: string }) {
    return (
        <Svg width={S.acctIcon} height={S.acctIcon} viewBox="0 0 24 24" fill="none">
            <Path d="M3.6 6.4h16.8v11.2H3.6zM3.6 6.4 12 13l8.4-6.6" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

/** `.gp.in.acct` — B5: hangi adresle geldiğini gösteren tek cam satır. */
export function AuthAccountPlate({ label, email }: { label: string; email: string }) {
    const { c } = useTheme();
    return (
        <GlassPlate kind="input" radius={S.acctRadius}>
            <View
                accessible
                accessibilityLabel={`${label}: ${email}`}
                style={{
                    minHeight: S.acctMinHeight,
                    paddingVertical: S.acctY,
                    paddingHorizontal: S.acctX,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: S.acctGap,
                }}
            >
                <MailIcon color={c.tx2} />
                <View style={{ flex: 1, minWidth: 0, gap: S.acctInnerGap }}>
                    <Text style={{
                        color: c.tx2,
                        fontSize: S.acctLabel,
                        letterSpacing: S.acctLabel * S.acctLabelTrack,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {upperTR(label)}
                    </Text>
                    <Text style={{ color: c.tx, fontSize: S.acctValue, fontFamily: font.semiBold, fontWeight: '600' }}>
                        {email}
                    </Text>
                </View>
            </View>
        </GlassPlate>
    );
}

// ── 6 haneli kod ────────────────────────────────────────────────────────────

/** Kutunun kenar katmanı: turuncu (dolu) ve kırmızı (yanlış) `opacity` 140 ms. */
function EdgeLayer({ on, color, radius }: { on: boolean; color: string; radius: number }) {
    const t = useSharedValue(on ? 1 : 0);
    useEffect(() => {
        t.value = withTiming(on ? 1 : 0, { duration: MO.state, easing: Easing.linear });
    }, [on, t]);
    const style = useAnimatedStyle(() => ({ opacity: t.value }));
    return (
        <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: color }, style]}
        />
    );
}

/** İlk boş kutudaki turuncu imleç — `steps(1)` yanıp sönme, 1,1 sn. */
function Cursor() {
    const { c, reduceMotion } = useTheme();
    const t = useSharedValue(1);
    useEffect(() => {
        if (reduceMotion) { t.value = 1; return undefined; }
        t.value = withRepeat(withSequence(
            withDelay(550, withTiming(0, { duration: 0 })),
            withDelay(550, withTiming(1, { duration: 0 })),
        ), -1);
        return () => cancelAnimation(t);
    }, [reduceMotion, t]);
    const style = useAnimatedStyle(() => ({ opacity: t.value }));
    return (
        <Animated.View style={[{
            width: S.codeCursorWidth, height: S.codeCursorHeight, backgroundColor: c.or,
        }, style]} />
    );
}

export type OtpState = 'idle' | 'checking' | 'error' | 'off';

/**
 * K2 · S2 — tek gizli `TextInput` + 6 cam kutu ÇİZİMİ (karar 5).
 *
 * Yapıştırma, iOS'un "Mail'den" önerisi ve silme tek alanda çalışıyor;
 * kutular yalnız görüntü. Klavye sistemin sayı klavyesi. 6. hane dolunca
 * `onComplete` — ayrı "Doğrula" düğmesi yok.
 *
 * Yanlış kodda rakamlar KALIYOR (kişi e-postayla karşılaştırabilsin); İLK
 * tuş hepsini siler ve yeni haneyle başlar. Gmail kullanan kişi öneri
 * şeridini görmez, kodu kopyalayıp yapıştırır: "482 107" gibi boşluklu
 * yapıştırma da tek seferde kabul ediliyor (açık nokta 8).
 */
export const AuthOtp = forwardRef<TextInput, {
    value: string;
    onChange: (next: string) => void;
    onComplete: (code: string) => void;
    state: OtpState;
}>(function AuthOtp({ value, onChange, onComplete, state }, ref) {
    const { c, small, dark } = useTheme();
    const [focused, setFocused] = useState(false);
    const off = state === 'off';
    const error = state === 'error';
    // Kapalı (.42) ve kontrol (.6) aynı katmanda, 140 ms.
    const opacity = useSharedValue(off ? S.dimmed : 1);
    useEffect(() => {
        opacity.value = withTiming(off ? S.dimmed : state === 'checking' ? MO.codeChecking : 1, {
            duration: MO.state, easing: Easing.linear,
        });
        if (off) Keyboard.dismiss();
    }, [off, opacity, state]);
    const rowStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    const height = small ? S.codeHeightSmall : S.codeHeight;
    const boxRadius = small ? S.codeRadiusSmall : S.codeRadius;
    const textSize = small ? S.codeTextSmall : S.codeText;
    const now = glassColors(dark, 'input').border;

    const change = (raw: string) => {
        // Kontrol sürerken yazılan yok sayılır; alan KAPANMAZ — kapansaydı
        // klavye iner ve yanlış kodda kişi yeniden alana dokunmak zorunda kalırdı.
        if (state === 'checking') return;
        const digits = raw.replace(/\D/g, '');
        // Yanlış koddan sonra ilk tuş: eski altı hane silinir, yeni hane kalır.
        const next = error
            ? (digits.length > value.length ? digits.slice(value.length).slice(0, 1) : '')
            : digits.slice(0, S.codeLength);
        if (next === value) return;
        onChange(next);
        if (!error && next.length === S.codeLength) onComplete(next);
    };

    return (
        <Animated.View style={rowStyle}>
            <View
                accessible={false}
                style={{ flexDirection: 'row', gap: S.codeGap }}
            >
                {Array.from({ length: S.codeLength }, (_, index) => {
                    const digit = value[index];
                    const current = focused && !off && !error && index === value.length;
                    return (
                        <View key={index} style={{ flex: 1 }}>
                            <GlassPlate kind="key" radius={boxRadius}>
                                <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
                                    {current ? <Cursor /> : (
                                        <Text style={[{
                                            color: c.tx,
                                            fontSize: textSize,
                                            fontFamily: font.extraBold,
                                            fontWeight: '800',
                                        }, numeric]}>
                                            {digit ?? ''}
                                        </Text>
                                    )}
                                </View>
                            </GlassPlate>
                            {current ? (
                                <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
                                    borderRadius: boxRadius, borderWidth: 1, borderColor: now,
                                }]} />
                            ) : null}
                            <EdgeLayer on={Boolean(digit) && !error} color={c.or} radius={boxRadius} />
                            <EdgeLayer on={error} color={c.rd} radius={boxRadius} />
                        </View>
                    );
                })}
            </View>
            {/* Gizli tek alan kutuların ÜSTÜNDE: kutuya dokunmak onu odaklar. */}
            <TextInput
                ref={ref}
                value={value}
                onChangeText={change}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                editable={!off}
                autoFocus={!off}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                caretHidden
                accessibilityLabel={`E-postadaki 6 haneli kod, ${value.length} hane girildi`}
                style={[StyleSheet.absoluteFill, { color: 'transparent', opacity: 0.02 }]}
            />
        </Animated.View>
    );
});

/** `.resend` — "Kod gelmedi mi? Yeniden gönder · 0:59" (60 sn sunucu sınırı). */
export function AuthResend({ seconds, onPress }: { seconds: number; onPress: () => void }) {
    const { c } = useTheme();
    const waiting = seconds > 0;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={waiting ? `Yeniden gönder, ${formatCountdown(seconds)} sonra` : 'Yeniden gönder'}
            accessibilityState={{ disabled: waiting }}
            disabled={waiting}
            onPress={onPress}
            style={({ pressed }) => ({
                height: S.resendHeight,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: S.resendGap,
                opacity: pressed ? pressMotion.ghostOpacity : 1,
            })}
        >
            <Text style={{ color: c.tx2, fontSize: S.resendText, fontFamily: font.medium, fontWeight: '500' }}>
                Kod gelmedi mi?
            </Text>
            <Text style={{
                color: waiting ? c.tx3 : c.tx,
                fontSize: S.resendText,
                fontFamily: font.bold,
                fontWeight: '700',
                textDecorationLine: waiting ? 'none' : 'underline',
            }}>
                Yeniden gönder
            </Text>
            {waiting ? (
                <Text style={[{
                    color: c.tx3, fontSize: S.resendText, fontFamily: font.semiBold, fontWeight: '600',
                }, numeric]}>
                    · {formatCountdown(seconds)}
                </Text>
            ) : null}
        </Pressable>
    );
}
