import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type LayoutChangeEvent } from 'react-native';

import { LIVE_MOTION } from '../lib/liveMotion';
import { useTheme } from '../theme';

export type LiveMode = 'enter' | 'leave' | 'swap' | 'still';

/** Kartların ailesinin eğrisi (Giriş v3 · authMotion). */
const EASE = Easing.bezier(0.215, 0.61, 0.355, 1);

/**
 * Canlı listenin satır sarmalayıcısı — yalnız opacity ve translateY, native.
 *
 *   enter · yerinde doğar: opacity 0→1 + translateY 8→0, 240 ms. Yandan
 *           girmiyor — "başka bir ekrandan geldi" derdi.
 *   leave · 200 ms'de söner; yeri sönme bitince kapanır (`useLiveList`).
 *           Basılamaz: sönen bir karta dokunmak hiçbir yere gitmemeli.
 *   swap  · kart soluk satıra indi (30 dk kuralı): yeni biçim 200 ms'de belirir.
 *
 * Yükseklik HİÇ animasyonlanmıyor. Kartın içi bu sarmalayıcının işi değil —
 * kart mutasyonlarının kendi hareketi var.
 */
export function LiveRow({ mode, children, onLayout }: {
    mode: LiveMode;
    children: ReactNode;
    onLayout?: (event: LayoutChangeEvent) => void;
}) {
    const { reduceMotion } = useTheme();
    const [fade] = useState(() => new Animated.Value(mode === 'enter' && !reduceMotion ? 0 : 1));
    const [lift] = useState(() => new Animated.Value(mode === 'enter' && !reduceMotion ? LIVE_MOTION.lift : 0));

    useEffect(() => {
        if (reduceMotion) {
            fade.setValue(mode === 'leave' ? 0 : 1);
            lift.setValue(0);
            return undefined;
        }
        let run: Animated.CompositeAnimation | null = null;
        if (mode === 'enter') {
            run = Animated.parallel([
                Animated.timing(fade, { toValue: 1, duration: LIVE_MOTION.enterMs, easing: EASE, useNativeDriver: true }),
                Animated.timing(lift, { toValue: 0, duration: LIVE_MOTION.enterMs, easing: EASE, useNativeDriver: true }),
            ]);
        } else if (mode === 'leave') {
            run = Animated.timing(fade, { toValue: 0, duration: LIVE_MOTION.exitMs, easing: Easing.linear, useNativeDriver: true });
        } else if (mode === 'swap') {
            fade.setValue(0);
            run = Animated.timing(fade, { toValue: 1, duration: LIVE_MOTION.swapMs, easing: Easing.linear, useNativeDriver: true });
        }
        run?.start();
        return () => run?.stop();
    }, [mode, reduceMotion, fade, lift]);

    return (
        <Animated.View
            onLayout={onLayout}
            pointerEvents={mode === 'leave' ? 'none' : 'auto'}
            importantForAccessibility={mode === 'leave' ? 'no-hide-descendants' : 'auto'}
            accessibilityElementsHidden={mode === 'leave'}
            style={{ opacity: fade, transform: [{ translateY: lift }] }}
        >
            {children}
        </Animated.View>
    );
}
