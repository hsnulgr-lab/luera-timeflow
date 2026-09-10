/**
 * Giriş v3 · Face ID halkası — dönüş girişinin tek hareketli parçası.
 *
 * ── Bekleme ────────────────────────────────────────────────────────────────
 * Dönen hiçbir şey yok. Halkanın KENARI 2,4 s'de bir nefes alıyor
 * (.20 → .42 → .20) ve **ölçek değişmiyor**: büyüyüp küçülen bir halka
 * "yükleniyor" demek olurdu, oysa burada hiçbir şey yüklenmiyor — telefon
 * bekliyor. Hazır olma hâli, meşguliyet hâli değil.
 *
 * ── Tanınma · 200 ms ───────────────────────────────────────────────────────
 * Ürünün tek kutlama anı. 90 ms renk, 110 ms devir. Sınır serttir: günde otuz
 * kez görülen bir kutlama 200 ms'yi geçemez; geçtiği an kutlama değil
 * GECİKME olur. Konfeti yok, damga yok, ses yok.
 *
 * ── Başarısızlık ───────────────────────────────────────────────────────────
 * Suçlama yok. Halka kırmızıya geçer, ±5 pt iki sarsıntı, etiket değişir.
 * Sarsıntı BURADA duruyor ama şifre alanında kaldırıldı: halka bir cevap,
 * alan bir cevap değil — sarsılan alan "arıza", sarsılan halka "tanımadım".
 */

import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
    Easing, interpolateColor, useAnimatedStyle, useSharedValue,
    withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { glassColors } from './GlassPlate';
import { authMetrics, radius, useTheme } from '../theme';

export type FaceState = 'idle' | 'ok' | 'bad';

export function FaceRing({ state, disabled, onPress, children }: {
    state: FaceState;
    disabled?: boolean;
    onPress: () => void;
    children: React.ReactNode;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const g = glassColors(dark, 'plate');

    const breath = useSharedValue(reduceMotion ? 0.5 : 0);
    const tone = useSharedValue(0);      // 0 nötr · 1 turuncu · -1 kırmızı
    const pop = useSharedValue(1);
    const shake = useSharedValue(0);

    useEffect(() => {
        if (reduceMotion) { breath.value = 0.5; return; }
        breath.value = withRepeat(
            withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
            -1,
            true,
        );
    }, [reduceMotion, breath]);

    useEffect(() => {
        if (state === 'ok') {
            // Renk geçişi HAREKET DEĞİL — `reduceMotion` açıkken de olur,
            // çünkü taşıdığı şey bilgi: telefon seni tanıdı.
            tone.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
            if (!reduceMotion) pop.value = withSpring(1.04, { damping: 26, stiffness: 200 });
            return;
        }
        if (state === 'bad') {
            tone.value = withTiming(-1, { duration: 120 });
            if (!reduceMotion) {
                shake.value = withSequence(
                    withTiming(-5, { duration: 45 }),
                    withTiming(5, { duration: 45 }),
                    withTiming(-3, { duration: 45 }),
                    withTiming(0, { duration: 45 }),
                );
            }
            return;
        }
        tone.value = withTiming(0, { duration: 200 });
        pop.value = withTiming(1, { duration: 160 });
    }, [state, reduceMotion, tone, pop, shake]);

    const neutral = dark ? 'rgba(243,237,227,' : 'rgba(14,14,14,';
    const style = useAnimatedStyle(() => {
        'worklet';
        const calm = `${neutral}${(0.20 + breath.value * 0.22).toFixed(3)})`;
        const border = tone.value > 0
            ? interpolateColor(tone.value, [0, 1], [calm, c.or])
            : tone.value < 0
                ? interpolateColor(-tone.value, [0, 1], [calm, c.rd])
                : calm;
        return {
            borderColor: border,
            transform: [{ scale: pop.value }, { translateX: shake.value }],
        };
    });

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Face ID ile gir"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
            <Animated.View style={[{
                marginTop: authMetrics.resumeFaceTop,
                width: authMetrics.faceIdRing,
                height: authMetrics.faceIdRing,
                borderRadius: radius.pill,
                borderWidth: 1.7,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: g.fill,
            }, style]}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    {children}
                </View>
            </Animated.View>
        </Pressable>
    );
}
