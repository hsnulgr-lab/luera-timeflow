/**
 * Giriş v4 · K4 — "Bu hesapla zaten işletmeniz var — giriş yaptınız."
 *
 * İçeride, ekranın üstünde kısa bir cam plaka: 6 sn durur, dokununca kapanır,
 * onay istemez. Kişi yanlış kapıdan girdi ama bir şey kaybetmedi; not bunu
 * söylüyor ve kayboluyor. Simge nötr (bilgi taşıyan renk camdan geçmez).
 *
 * Kökte duruyor ki hangi kabuğa girilirse girilsin aynı yerde çıksın; sırası
 * `src/lib/loginNotice.ts`'te (`enterShell` bırakır).
 *
 * Hareket: `translateY −16→0 + opacity 0→1` · yay sönüm 20 · sertlik 330;
 * çıkış `opacity 1→0` · 200 ms. reduceMotion'da yalnız opaklık.
 */

/* `react-hooks/immutability` reanimated'in paylaşılan değerini bilmiyor. */
/* eslint-disable react-hooks/immutability */

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { GlassPlate } from './GlassPlate';
import { onLoginNotice } from '../lib/loginNotice';
import { font, ssoMetrics as S, ssoMotion as MO, useTheme } from '../theme';

function Plate({ text, onGone }: { text: string; onGone: () => void }) {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const shown = useSharedValue(0);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        shown.value = reduceMotion
            ? withTiming(1, { duration: MO.reduced, easing: Easing.linear })
            : withSpring(1, { damping: MO.damping, stiffness: MO.stiffness });
        const id = setTimeout(() => setClosing(true), MO.toastHold);
        return () => clearTimeout(id);
    }, [reduceMotion, shown]);

    useEffect(() => {
        if (!closing) return undefined;
        shown.value = withTiming(0, { duration: MO.toastOut, easing: Easing.linear });
        // Solma bitince ağaçtan da çıksın — dokunulamaz bir cam kalmasın.
        const id = setTimeout(onGone, MO.toastOut);
        return () => clearTimeout(id);
    }, [closing, onGone, shown]);

    const style = useAnimatedStyle(() => {
        'worklet';
        const opacity = Math.min(1, Math.max(0, shown.value));
        if (reduceMotion || closing) return { opacity };
        return { opacity, transform: [{ translateY: -MO.toastRise * (1 - shown.value) }] };
    });

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[{
                position: 'absolute',
                top: insets.top + S.toastTop,
                left: S.toastX,
                right: S.toastX,
            }, style]}
        >
            <Pressable
                accessibilityRole="alert"
                accessibilityLabel={text}
                accessibilityHint="Kapatmak için dokunun"
                onPress={() => setClosing(true)}
            >
                <GlassPlate radius={S.toastRadius}>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: S.toastGap,
                        paddingVertical: S.toastY,
                        paddingHorizontal: S.toastPadX,
                    }}>
                        <Svg width={S.toastIcon} height={S.toastIcon} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M4.5 12.6 9.4 17.5 19.5 7"
                                stroke={c.tx}
                                strokeWidth={S.toastStroke}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </Svg>
                        <Text style={{
                            flex: 1,
                            color: c.tx,
                            fontSize: S.toastText,
                            lineHeight: S.toastText * S.toastLine,
                            fontFamily: font.semiBold,
                            fontWeight: '600',
                        }}>
                            {text}
                        </Text>
                    </View>
                </GlassPlate>
            </Pressable>
        </Animated.View>
    );
}

export function LoginNoticeHost() {
    const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
    useEffect(() => onLoginNotice((text) => setNotice({ id: Date.now(), text })), []);
    if (!notice) return null;
    return <Plate key={notice.id} text={notice.text} onGone={() => setNotice(null)} />;
}
