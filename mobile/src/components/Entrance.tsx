/**
 * Giriş v3 · karşılamanın açılış koreografisi.
 *
 * Sıra okuma sırasıyla aynı: **marka → cümle → kapılar → küçük satırlar.**
 * Kapıların markadan önce gelmesi denendi ve bırakıldı — kullanıcı önce
 * seçenekleri görüp sonra "burası neresi" diye yukarı bakıyordu.
 *
 * ── İki eşik ────────────────────────────────────────────────────────────────
 * **1,0 s** — arayüzde her şey son yerinde, son boyutunda, tam opak. Bundan
 * sonra hiçbir arayüz öğesi hareket etmiyor.
 * **1,0 → 5,0 s** — yalnız ışık alanı olgunlaşır. Kullanıcının kaçırabileceği
 * bir şey yok; kaçırırsa da bir şey kaybetmiyor.
 *
 * **Dokunma hedefleri t = 0'da kayıtlı**, görünürlükten önce. 0,8. saniyede
 * basılan düğme animasyonu KESER: plaka 120 ms'de son hâline gider, geri
 * kalan her şey olduğu yerde bırakılır ve geçiş başlar. Reanimated'in
 * kesintiye uğratılabilir hareketi bunu bedava veriyor — yay bulunduğu hızdan
 * devam ediyor, dokunma animasyonu sıfırlamıyor.
 */

import { useEffect } from 'react';
import Animated, {
    Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme';

export type EntranceRole = 'brand' | 'dot' | 'tagline' | 'door1' | 'door2' | 'foot';

/** Gecikmeler, ms. Kapılar 80 ms arayla: aynı anda gelirlerse tek bir blok olurlar. */
const DELAY: Record<EntranceRole, number> = {
    brand: 0, tagline: 240, dot: 300, door1: 420, door2: 500, foot: 620,
};

/** `reduceMotion` açıkken tek adım: 120 ms opaklık, yay yok, kayma yok, ölçek yok. */
const REDUCED_MS = 120;

export function useEntrance(role: EntranceRole) {
    const { reduceMotion } = useTheme();
    const t = useSharedValue(0);

    useEffect(() => {
        const delay = reduceMotion ? 0 : DELAY[role];
        t.value = 0;
        t.value = withDelay(delay, withTiming(1, {
            duration: reduceMotion ? REDUCED_MS : 180,
            easing: Easing.linear,
        }));
    }, [role, reduceMotion, t]);

    const shift = useSharedValue(0);
    useEffect(() => {
        if (reduceMotion) { shift.value = 1; return; }
        shift.value = 0;
        const delay = DELAY[role];
        if (role === 'brand') {
            shift.value = withDelay(delay, withSpring(1, { damping: 18, stiffness: 150 }));
        } else if (role === 'tagline') {
            shift.value = withDelay(delay, withTiming(1, {
                duration: 320, easing: Easing.out(Easing.cubic),
            }));
        } else if (role === 'door1' || role === 'door2') {
            shift.value = withDelay(delay, withSpring(1, { damping: 20, stiffness: 180 }));
        } else if (role === 'dot') {
            // Nokta ayrı gelir ve hafifçe taşar: mass .6 ile 1,24'e çıkıp yerine oturur.
            shift.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 190, mass: 0.6 }));
        } else {
            // Alt iki satır sessiz; hareketleri de sessiz — yalnız opaklık.
            shift.value = withDelay(delay, withTiming(1, { duration: 260, easing: Easing.linear }));
        }
    }, [role, reduceMotion, shift]);

    return useAnimatedStyle(() => {
        'worklet';
        if (reduceMotion) return { opacity: t.value };
        if (role === 'dot') return { opacity: t.value, transform: [{ scale: shift.value }] };
        const from = role === 'brand' ? 14 : role === 'tagline' ? 8
            : role === 'foot' ? 0 : 20;
        return {
            opacity: t.value,
            transform: [{ translateY: from * (1 - shift.value) }],
        };
    });
}

export const AView = Animated.View;
