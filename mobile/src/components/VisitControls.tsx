/**
 * Personel 05/06 — işlem kumandasının kontrolleri.
 *
 * Ölçüler Claude Design "Personel 05" ve "Personel 06" çıktılarından BİREBİR.
 *
 * Üç teknik çeviri var, hiçbiri tasarımı değiştirmiyor:
 *   konik gradyan → `react-native-svg` yay (strokeDasharray)
 *   radyal gradyan → `react-native-svg` RadialGradient
 *   pointer olayları → `PanResponder` (gesture-handler kurulu değil)
 */

import { useEffect, useRef, useState } from 'react';
import {
    Animated, Easing, PanResponder, Pressable, Text, View,
    type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { numeric, useTheme } from '../theme';
import { feedback } from '../lib/feedback';
import { Glyph } from './Glyph';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Sıcak ışık ──────────────────────────────────────────────────────────────

/**
 * Kadranın arkasındaki radyal ışık — ekranın tek süslemesi.
 *
 * İşi süs değil aslında: rengi hâlle değişiyor ve personel 80 cm'den
 * OKUMADAN durumu anlıyor. Turuncu normal, amber bekleme, kırmızı son beş
 * dakika.
 */
export function WarmGlow({ tone, top = 340 }: { tone: 'or' | 'am' | 'rd'; top?: number }) {
    const { dark } = useTheme();
    const size = 540;
    const rgb = tone === 'am'
        ? (dark ? '217,164,59' : '184,122,0')
        : tone === 'rd' ? '224,114,114' : '255,90,31';
    const a0 = tone === 'rd' ? 0.17 : tone === 'am' ? 0.15 : 0.14;
    const a1 = tone === 'rd' ? 0.055 : tone === 'am' ? 0.05 : 0.045;

    return (
        <View pointerEvents="none" style={{
            position: 'absolute',
            left: '50%',
            top,
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
        }}>
            <Svg width={size} height={size}>
                <Defs>
                    <RadialGradient id="warm" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={dark ? a0 : a0 - 0.01} />
                        <Stop offset="0.46" stopColor={`rgb(${rgb})`} stopOpacity={a1} />
                        <Stop offset="0.74" stopColor={`rgb(${rgb})`} stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Rect x="0" y="0" width={size} height={size} fill="url(#warm)" />
            </Svg>
        </View>
    );
}

// ── Kaydırarak başlat ───────────────────────────────────────────────────────

const SL = {
    height: 88, heightSm: 76,
    handle: 76, handleSm: 64,
    inset: 6,
    /** Tutamağın sağda durduğu boşluk — yuvaya oturuyor. */
    dock: 22,
    threshold: 0.72,
    label: 19, labelSm: 17,
} as const;

/**
 * Korunan tek jest. iPhone'un slide to answer çubuğu.
 *
 * Eşik %72: personel bırakmadan ÖNCE geçtiğini anlamalı, o yüzden eşikte
 * dolgu koyulaşıyor, etiket değişiyor ve yuva doluyor.
 *
 * Eşiğin altında bırakılırsa çubuk başa döner — bu "olmadı" der,
 * "yanlış yaptın" demez: 260 ms yumuşak bir geri dönüş.
 */
export function SlideToStart({
    label = 'Kaydır ve başlat',
    releaseLabel = 'Bırak · başlıyor',
    onStart,
    disabled = false,
}: {
    label?: string;
    releaseLabel?: string;
    onStart: () => void;
    disabled?: boolean;
}) {
    const { c, small, reduceMotion } = useTheme();
    const height = small ? SL.heightSm : SL.height;
    const handle = small ? SL.handleSm : SL.handle;

    const [width, setWidth] = useState(0);
    const [past, setPast] = useState(false);
    const p = useRef(new Animated.Value(0)).current;
    const breath = useRef(new Animated.Value(0)).current;
    const value = useRef(0);
    const travel = Math.max(1, width - SL.inset - handle - SL.dock);
    const travelRef = useRef(travel);
    travelRef.current = travel;
    const pastRef = useRef(false);
    const fired = useRef(false);
    const [held, setHeld] = useState(false);

    const set = (next: number) => {
        const clamped = Math.max(0, Math.min(1, next));
        value.current = clamped;
        p.setValue(clamped);
        const over = clamped >= SL.threshold;
        if (over !== pastRef.current) {
            pastRef.current = over;
            setPast(over);
            if (over) feedback.light();
        }
    };

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !fired.current,
            onMoveShouldSetPanResponder: (_e, gs) => !fired.current && Math.abs(gs.dx) > 2,
            onPanResponderGrant: () => setHeld(true),
            onPanResponderMove: (_e, gs) => set(value.current + gs.dx / travelRef.current - (value.current - startRef.current)),
            onPanResponderRelease: () => release(),
            onPanResponderTerminate: () => release(),
        }),
    ).current;

    // PanResponder kapanışı taze `set`/`release` görsün diye ref üstünden.
    const startRef = useRef(0);
    const releaseRef = useRef(() => { /* ilk çizimde boş */ });
    const release = () => releaseRef.current();

    releaseRef.current = () => {
        if (fired.current) return;
        setHeld(false);
        if (value.current >= SL.threshold) {
            fired.current = true;
            feedback.medium();
            Animated.timing(p, {
                toValue: 1, duration: 120, easing: Easing.linear, useNativeDriver: false,
            }).start(() => onStart());
            return;
        }
        Animated.timing(p, {
            toValue: 0,
            duration: reduceMotion === false ? 260 : 0,
            easing: Easing.bezier(0.2, 0.9, 0.15, 1),
            useNativeDriver: false,
        }).start();
        value.current = 0;
        pastRef.current = false;
        setPast(false);
    };

    // Okun nefesi: iPhone'da yazının üstünden geçen parlaklığın ucuz karşılığı.
    // Metin maskesi RN'de pahalı; 3 pt'lik bir salınım aynı cümleyi kuruyor:
    // "bu kayar". Parmak değdiği an susuyor — artık söyleyecek şeyi kalmadı.
    useEffect(() => {
        if (reduceMotion || disabled || held) { breath.stopAnimation(() => breath.setValue(0)); return; }
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(breath, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(breath, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.delay(700),
        ]));
        loop.start();
        return () => loop.stop();
    }, [breath, reduceMotion, disabled, held]);

    // Sürükleme başlangıcını yakalamak için: her dokunuşta o anki değeri sakla.
    const onTouchStart = () => { startRef.current = value.current; };

    return (
        <View
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            onTouchStart={onTouchStart}
            {...(disabled ? {} : pan.panHandlers)}
            accessibilityRole="button"
            accessibilityLabel={`${label}. Çubuğu kaydırın ya da iki kez dokunun.`}
            // Kaydıramayan kullanıcı: ekran okuyucu bu çubuğu sürükleyemez.
            // Kaydırma TEK YOL olamaz — etkinleştirme de başlatıyor.
            onAccessibilityTap={() => { if (!fired.current && !disabled) { fired.current = true; onStart(); } }}
            style={{
                height,
                borderRadius: height / 2,
                backgroundColor: c.fld,
                borderWidth: 1,
                borderColor: c.glassBorder,
                overflow: 'hidden',
                opacity: disabled ? 0.4 : 1,
            }}
        >
            <Animated.View style={{
                position: 'absolute',
                left: 0, top: 0, bottom: 0,
                borderRadius: height / 2,
                backgroundColor: past ? 'rgba(255,90,31,0.40)' : 'rgba(255,90,31,0.20)',
                width: p.interpolate({
                    inputRange: [0, 1],
                    outputRange: [handle + SL.inset, handle + SL.inset + travel],
                }),
            }} />

            <Animated.Text numberOfLines={1} style={{
                position: 'absolute',
                left: handle + SL.inset + 12,
                right: 56,
                top: 0, bottom: 0,
                textAlignVertical: 'center',
                lineHeight: height,
                fontSize: small ? SL.labelSm : SL.label,
                fontWeight: '700',
                letterSpacing: -0.38,
                color: c.tx2,
                opacity: p.interpolate({ inputRange: [0, 0.59], outputRange: [1, 0], extrapolate: 'clamp' }),
            }}>
                {label}
            </Animated.Text>

            {past ? (
                <Text numberOfLines={1} style={{
                    position: 'absolute',
                    left: handle + SL.inset + 12,
                    right: 56,
                    top: 0, bottom: 0,
                    lineHeight: height,
                    fontSize: small ? SL.labelSm : SL.label,
                    fontWeight: '800',
                    letterSpacing: -0.38,
                    color: c.or2,
                }}>
                    {releaseLabel}
                </Text>
            ) : null}

            {/* Yuva: tutamağın oturacağı yer. Eşik geçilince doluyor. */}
            <View style={{
                position: 'absolute',
                right: 26,
                top: height / 2 - 4.5,
                width: 9, height: 9,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: past ? c.or : c.tx3,
                backgroundColor: past ? c.or : 'transparent',
            }} />

            <Animated.View style={{
                position: 'absolute',
                left: SL.inset,
                top: SL.inset,
                width: handle,
                height: handle,
                borderRadius: handle / 2,
                backgroundColor: c.or,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{
                    translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }),
                }],
            }}>
                <Animated.View style={{
                    transform: [{ translateX: breath.interpolate({ inputRange: [0, 1], outputRange: [0, 3] }) }],
                }}>
                    <Glyph name="arrow" size={small ? 26 : 30} color="#fff" />
                </Animated.View>
            </Animated.View>
        </View>
    );
}

// ── Uzun basarak bitir ──────────────────────────────────────────────────────

const FIN = { size: 112, sizeSm: 100, rail: 4, inset: 9, hold: 900 } as const;

/**
 * Bitirme jesti. Etrafında cam kabuk YOK — düğme zeminin üstünde yalnız
 * duruyor, iPhone'un konuşma ekranındaki END gibi.
 *
 * Basılı tutulur, yay dolar, dolunca biter. Bırakılırsa yay 200 ms'de geri
 * boşalır ve hiçbir şey olmaz.
 */
export function HoldToFinish({ onFinish }: { onFinish: () => void }) {
    const { c, small, reduceMotion } = useTheme();
    const size = small ? FIN.sizeSm : FIN.size;
    const radius = (size - FIN.rail) / 2;
    const circumference = 2 * Math.PI * radius;

    const arc = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(1)).current;
    const [holding, setHolding] = useState(false);
    const [done, setDone] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const down = () => {
        if (done) return;
        setHolding(true);
        feedback.light();
        Animated.timing(scale, {
            toValue: 0.95, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
        Animated.timing(arc, {
            toValue: 1,
            duration: reduceMotion === false ? FIN.hold : 0,
            easing: Easing.linear,
            useNativeDriver: false,
        }).start();
        timer.current = setTimeout(() => {
            setDone(true);
            setHolding(false);
            feedback.medium();
            timer.current = setTimeout(onFinish, 420);
        }, reduceMotion === false ? FIN.hold : 120);
    };

    const up = () => {
        if (done) return;
        if (timer.current) clearTimeout(timer.current);
        setHolding(false);
        Animated.timing(scale, {
            toValue: 1, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
        Animated.timing(arc, {
            toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: false,
        }).start();
    };

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="İşlemi bitir. Basılı tutun ya da iki kez dokunun."
            onPressIn={down}
            onPressOut={up}
            onAccessibilityTap={() => { if (!done) { setDone(true); onFinish(); } }}
            style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        >
            <Svg width={size} height={size} style={{ position: 'absolute' }}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={c.bd2} strokeWidth={FIN.rail} fill="none" opacity={0.6}
                />
                <AnimatedCircle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={c.or} strokeWidth={FIN.rail} fill="none"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={arc.interpolate({
                        inputRange: [0, 1], outputRange: [circumference, 0],
                    })}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>

            <Animated.View style={{
                position: 'absolute',
                top: FIN.inset, left: FIN.inset,
                width: size - FIN.inset * 2,
                height: size - FIN.inset * 2,
                borderRadius: (size - FIN.inset * 2) / 2,
                backgroundColor: done ? c.gr : c.or,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale }],
            }}>
                {done ? (
                    <Glyph name="check" size={36} color="#fff" />
                ) : (
                    <>
                        <Text style={{
                            color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 1.36,
                        }}>
                            BİTİR
                        </Text>
                        <Text style={{
                            color: 'rgba(255,255,255,0.66)',
                            fontSize: 9.5,
                            fontWeight: '700',
                            letterSpacing: 1.24,
                            marginTop: 1,
                        }}>
                            {holding ? 'BIRAKMA' : 'BASILI TUT'}
                        </Text>
                    </>
                )}
            </Animated.View>
        </Pressable>
    );
}

// ── Bekleme halkası ─────────────────────────────────────────────────────────

const RING = { size: 238, sizeSm: 196, rail: 11 } as const;

/**
 * Bekleme sayacı — kadranın kahramanı olduğu tek hâl.
 *
 * Geçen süre yukarı sayar, bu aşağı; ve aciliyet BURADADIR: geçen sürede
 * 10 dakika sarkmak normal, beklemede 5 dakika gecikmek saç yakar.
 *
 * Son beş dakikada RENK değişir, biçim değişmez — halkanın ölçüsü ve yeri
 * sabit kalır, hareket eden tek şey çevresindeki 1 punto hat.
 */
export function WaitRing({
    remaining,
    total,
    source,
    level,
    onPress,
}: {
    remaining: number;
    total: number;
    source: string;
    level: 'calm' | 'hot' | 'zero';
    onPress?: () => void;
}) {
    const { c, small, reduceMotion } = useTheme();
    const size = small ? RING.sizeSm : RING.size;
    const radius = (size - RING.rail) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = level === 'zero' ? 1 : Math.max(0, Math.min(1, remaining / Math.max(1, total)));
    const color = level === 'calm' ? c.am : level === 'hot' ? c.rd : c.am;

    const pulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (level !== 'hot' || reduceMotion !== false) {
            pulse.setValue(0);
            return;
        }
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [level, reduceMotion, pulse]);

    const mins = String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0');
    const secs = String(Math.max(0, remaining) % 60).padStart(2, '0');

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={level === 'zero'
                ? `Bekleme bitti. ${source}`
                : `Bekleme kalan ${mins} dakika ${secs} saniye. ${source}`}
            onPress={onPress}
            style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        >
            {/* Son beş dakikanın nabzı: halkanın DIŞINDA ince bir hat. */}
            {level === 'hot' ? (
                <Animated.View style={{
                    position: 'absolute',
                    top: -9, left: -9, right: -9, bottom: -9,
                    borderRadius: (size + 18) / 2,
                    borderWidth: 1,
                    borderColor: 'rgba(224,114,114,0.45)',
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.85] }),
                    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
                }} />
            ) : null}

            <Svg width={size} height={size} style={{ position: 'absolute' }}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={level === 'zero' ? c.am : c.bd}
                    strokeWidth={RING.rail}
                    fill="none"
                    opacity={level === 'zero' ? 1 : 1}
                />
                {level === 'zero' ? null : (
                    <Circle
                        cx={size / 2} cy={size / 2} r={radius}
                        stroke={color} strokeWidth={RING.rail} fill="none"
                        strokeDasharray={`${circumference} ${circumference}`}
                        strokeDashoffset={circumference * (1 - progress)}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                )}
            </Svg>

            <Text style={[{
                fontSize: level === 'zero' ? 52 : (small ? 60 : 74),
                fontWeight: '800',
                letterSpacing: level === 'zero' ? -1.5 : -3.7,
                lineHeight: level === 'zero' ? 56 : (small ? 62 : 76),
                color: level === 'hot' ? c.rd : level === 'zero' ? c.am : c.tx,
            }, numeric]}>
                {level === 'zero' ? 'YIKA' : `${mins}:${secs}`}
            </Text>
            <Text style={{
                fontSize: 11.5,
                fontWeight: '700',
                letterSpacing: 2.07,
                color: level === 'zero' ? c.am : c.tx3,
            }}>
                {level === 'zero' ? 'BEKLEME BİTTİ' : 'BEKLEME KALAN'}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.am, marginTop: 3 }}>
                {source}
            </Text>
        </Pressable>
    );
}
