/**
 * Giriş v3 · ışık alanı.
 *
 * Beş renkli kütle bağımsız gezinir, üstlerinde tek bir tam ekran bulanıklık,
 * onun da üstünde bir perde. Kütlelerin kenarı hiçbir zaman görünmez;
 * görünen tek şey alanın kendisidir.
 *
 * ── İki uygulama kararı, tasarımdan sapma DEĞİL ─────────────────────────────
 *
 * 1. **Kütle bir SVG radyal gradyanı.** RN'de radyal gradyan yok;
 *    `expo-linear-gradient` yalnız doğrusal. Yarıçapı yarısı kadar bir daireyi
 *    boyayıp bulanıklaştırmak da olmazdı: 440 pt'lik bir dairenin kenarı
 *    58'lik bulanıklıkta hâlâ seçiliyor. `react-native-svg` zaten kurulu.
 *
 * 2. **Kor'un renk gezinmesi iki katmanın çapraz solmasıyla.** Tasarım
 *    `interpolateColor` diyor; SVG'nin `Stop` rengini reanimated ile
 *    sürmek kanıtlanmamış bir yol. Üst üste iki kor (#FF5A1F ve #FF7A45) ve
 *    aralarında opaklık geçişi **gözle aynı sonucu** veriyor, üstelik hiçbir
 *    riski yok. Bu tasarımın "yedek"i değil, eşdeğer bir yazımı.
 *
 * `reduceMotion` açıkken alan boş bir zemine düşmez: elle seçilmiş t = 3,2 s
 * karesinde donar (bkz. `lightField.ts` · FROZEN_AT).
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
    Easing, useAnimatedStyle, useSharedValue,
    withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import {
    fieldClock, fieldPlan, frozenFrame, introFactor, veilStops, INTRO_SECONDS,
    type FieldPlan, type FieldProfile,
} from '../lib/lightField';
import { useFieldTier } from '../lib/fieldTier';
import { useTheme } from '../theme';

/** Kor'un ısındığı ikinci renk — gezinmenin öteki ucu. */
const KOR_WARM = '#FF7A45';

function MassBody({ color, size }: { color: string; size: number }) {
    const id = `g${color.slice(1)}${size}`;
    return (
        <Svg width={size} height={size} pointerEvents="none">
            <Defs>
                <RadialGradient id={id} cx="50%" cy="50%" r="50%">
                    {/* Blur kalktığı için sönümlenme uzadı: dört durak, %78'e
                        kadar. Kütlenin kenarı hiçbir yerde çizgi olmuyor. */}
                    <Stop offset="0%" stopColor={color} stopOpacity={1} />
                    <Stop offset="30%" stopColor={color} stopOpacity={0.72} />
                    <Stop offset="55%" stopColor={color} stopOpacity={0.30} />
                    <Stop offset="78%" stopColor={color} stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
        </Svg>
    );
}

function MovingMass({ entry, still, intro, breath }: {
    entry: FieldPlan['masses'][number];
    still: boolean;
    /** Olgunlaşma sayacı, saniye. Yoksa kütle doğrudan tavanında. */
    intro: SharedValue<number> | null;
    /** Alanın nefesi, 0–1. Yoksa kütle sabit saydamlıkta. */
    breath: SharedValue<number> | null;
}) {
    const { mass, duration, ceiling, amp, scaleAmp, size } = entry;
    const t = useSharedValue(0);

    // Döngü bir kez kurulur ve bir daha dokunulmaz. Faz `offset` ile kaydırılır:
    // beş kütlenin aynı anda başlaması, hepsinin aynı anda dönmesi demekti.
    //
    // `useEffect` — `useMemo` DEĞİL: paylaşılan değere render sırasında yazmak
    // React 19 + reanimated 4'te çalışma zamanı hatası. Animasyon bir yan
    // etkidir, bir hesap değil.
    useEffect(() => {
        if (still) return;
        // Faz mount anından değil KÜRESEL saatten geliyor: ekran değişince
        // kütle kaldığı yerden devam ediyor, baştan başlamıyor.
        const phase = (((fieldClock() + mass.offset) % duration) + duration) / duration % 1;
        t.value = phase;
        t.value = withRepeat(
            withTiming(phase + 1, { duration: duration * 1000, easing: Easing.linear }),
            -1,
            false,
        );
    }, [still, duration, mass.offset, t]);

    const ins = mass.keys.map((k) => k.at);
    const frozen = frozenFrame(entry);

    const style = useAnimatedStyle(() => {
        'worklet';
        const ripe = intro ? introFactor(mass.id, intro.value) : 1;
        const breathe = breath ? 0.94 + breath.value * 0.12 : 1;
        if (still) {
            return {
                opacity: ceiling * frozen.opacity,
                transform: [
                    { translateX: (frozen.x / 100) * size },
                    { translateY: (frozen.y / 100) * size },
                    { scale: frozen.scale },
                ],
            };
        }
        const p = t.value % 1;
        // Anahtarlar arasında el ile doğrusal geçiş: `interpolate` worklet
        // içinde dizi kabul ediyor ama beş kütle × dört alan için bu daha ucuz.
        let i = 0;
        for (let k = 0; k < ins.length - 1; k++) if (p >= ins[k]) i = k;
        const a = mass.keys[i];
        const b = mass.keys[Math.min(i + 1, mass.keys.length - 1)];
        const span = b.at - a.at || 1;
        const u = Math.min(Math.max((p - a.at) / span, 0), 1);
        const lerp = (x: number, y: number) => x + (y - x) * u;
        return {
            // Nefes: alan 14 saniyede ±%6 açılıp kapanıyor. Eskiden
            // bulanıklığın yoğunluğundaydı; blur kalkınca buraya taşındı.
            opacity: ceiling * lerp(a.opacity, b.opacity) * ripe * breathe,
            transform: [
                { translateX: (lerp(a.x, b.x) * amp / 100) * size },
                { translateY: (lerp(a.y, b.y) * amp / 100) * size },
                { scale: 1 + (lerp(a.scale, b.scale) - 1) * scaleAmp },
            ],
        };
    });

    const warm = mass.id === 'kor';
    const warmStyle = useAnimatedStyle(() => {
        'worklet';
        if (!warm) return { opacity: 0 };
        // Kor ısınıp soğuyor: gezinme kütlenin kendi turuna bağlı, ayrı bir
        // sayaca değil — iki hareket ayrı ritimde olsaydı göz ikisini de görürdü.
        if (still) return { opacity: 0.35 };
        return { opacity: 0.5 - 0.5 * Math.cos(t.value * 2 * Math.PI) };
    });

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: 'absolute', width: size, height: size,
                    left: mass.left as number, right: mass.right as number,
                    top: mass.top as number, bottom: mass.bottom as number,
                },
                style,
            ]}
        >
            <MassBody color={mass.color} size={size} />
            {warm ? (
                <Animated.View style={[StyleSheet.absoluteFill, warmStyle]}>
                    <MassBody color={KOR_WARM} size={size} />
                </Animated.View>
            ) : null}
        </Animated.View>
    );
}

export function LightField({ profile, keyboard, intro: wantIntro, style }: {
    profile: FieldProfile;
    keyboard?: boolean;
    /** Karşılamada alan 5 saniye boyunca olgunlaşır. Ötekilerde kapalı. */
    intro?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const { dark, small, reduceMotion } = useTheme();
    const { tier, android } = useFieldTier();

    const plan = useMemo(
        () => fieldPlan({ profile, tier, dark, small, android, keyboard }),
        [profile, tier, dark, small, android, keyboard],
    );

    // Olgunlaşma sayacı: 0 → 5 sn, doğrusal. Kütleler kendi pencerelerinde
    // açılıyor, bulanıklık 34'ten plandaki değerine çıkıyor.
    const introT = useSharedValue(wantIntro && !reduceMotion ? 0 : INTRO_SECONDS);
    useEffect(() => {
        if (!wantIntro || reduceMotion) return;
        introT.value = 0;
        introT.value = withTiming(INTRO_SECONDS, {
            duration: INTRO_SECONDS * 1000, easing: Easing.linear,
        });
    }, [wantIntro, reduceMotion, introT]);
    const introRef = wantIntro && !reduceMotion ? introT : null;

    // Bulanıklığın nefesi — belgenin kendi deyişiyle "en riskli parça".
    // `plan.breathe` kapalıysa paylaşılan değer hiç kurulmuyor: Android'de ve
    // düşük katmanda her karede yeni bir çizim geçişi tetiklenmesin diye.
    const breath = useSharedValue(0);
    useEffect(() => {
        if (!plan.breathe || reduceMotion) return;
        breath.value = withRepeat(
            withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.quad) }),
            -1,
            true,
        );
    }, [plan.breathe, reduceMotion, breath]);

    const veil = veilStops(dark);
    const still = reduceMotion;

    return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
            {plan.masses.map((entry) => (
                <MovingMass
                    key={entry.mass.id}
                    entry={entry}
                    still={still}
                    intro={introRef}
                    breath={plan.breathe && !reduceMotion ? breath : null}
                />
            ))}

            {/* ── Tam ekran bulanıklık YOK. Kaldırıldı, ve sebebi ölçülebilir ──
                CSS'te `filter: blur(48px)` yalnız BULANIKLAŞTIRIR. `expo-blur`
                ise `tint="dark"` ile aynı anda KARARTIYOR — yoğunlukla orantılı
                bir koyu perde ekliyor. 58'de bu perde alanın rengini yiyordu:
                mock'ta turuncudan mora giden zengin bir süpürme, telefonda
                donuk bir kahve lekesine dönüşüyordu.

                Bulanıklığa zaten ihtiyaç yok: kütlelerimiz CSS'in sert kenarlı
                radyal gradyanı değil, %78'e kadar sönümlenen yumuşak SVG
                gradyanları. Kenar görünmüyor, kütleler birbirine zaten
                karışıyor. Blur'ün tek işi karartmaktı.

                Bulanıklığın "nefesi" de kütle saydamlığına taşındı — tasarımın
                kendi yedeği bu (bkz. §09). */}

            {/* Perde bulanıklığın ÜSTÜNDE ve kütlelerden bağımsız: camın
                altındaki en parlak an bile buradan geçiyor. */}
            <LinearGradient
                colors={veil.colors}
                locations={veil.locations}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
}
