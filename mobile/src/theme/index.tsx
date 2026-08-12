import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { dark, embed, light, SMALL_WIDTH, type EmbedPalette, type Palette } from './tokens';

// Tema ve cam yeteneği — tek kaynak.
//
// CAM İKİ KOŞULA BAĞLI ve ikisi de zorunlu:
//   1. isLiquidGlassAvailable() — iOS 26 altında GlassView sessizce düz bir
//      View'a dönüyor. Biz o hâlde zemin/kenarlık vermezsek kabuk görünmez
//      olur, yani "cam yok" değil "kabuk yok" durumuna düşeriz.
//   2. Saydamlığı azalt AÇIK DEĞİL — bu bir tercih değil okunabilirlik şartı.
//      Kullanıcı bu ayarı açtıysa bulanıklığı görmek istemiyordur.

interface Theme {
    c: Palette;
    /** Sayfanın tersinde kalan opak takvim bilgi yüzeyi. */
    embed: EmbedPalette;
    dark: boolean;
    /** Cam gerçekten kullanılabilir mi? false ise opak kabuk çizilir. */
    glass: boolean;
    /** 375×667 sınıfı küçük telefon — tasarımın sıkışma kuralları devreye girer. */
    small: boolean;
    /** Sistem “Hareketi Azalt” tercihi. Özel animasyonların tek kaynağı. */
    reduceMotion: boolean;
    /** iOS hareket yerine çapraz solmayı tercih ediyor mu? */
    prefersCrossFade: boolean;
}

const Ctx = createContext<Theme>({
    c: light,
    embed: embed.light,
    dark: false,
    glass: false,
    small: false,
    reduceMotion: true,
    prefersCrossFade: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const scheme = useColorScheme();
    const { width } = useWindowDimensions();
    const [reduceTransparency, setReduce] = useState(false);
    // Tercih okunana kadar hareketi azaltılmış kabul etmek daha güvenli.
    const [reduceMotion, setReduceMotion] = useState(true);
    const [prefersCrossFade, setPrefersCrossFade] = useState(true);

    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isReduceTransparencyEnabled()
            .then((v) => { if (alive) setReduce(v); })
            .catch(() => { /* okunamazsa camı açık bırak */ });
        const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
        return () => { alive = false; sub.remove(); };
    }, []);

    useEffect(() => {
        let alive = true;
        Promise.all([
            AccessibilityInfo.isReduceMotionEnabled(),
            AccessibilityInfo.prefersCrossFadeTransitions(),
        ]).then(([reduced, crossFade]) => {
            if (!alive) return;
            setReduceMotion(reduced);
            setPrefersCrossFade(crossFade);
        }).catch(() => {
            // Tercih okunamazsa hareketi azaltılmış tut.
        });

        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        return () => { alive = false; sub.remove(); };
    }, []);

    const isDark = scheme === 'dark';
    const value: Theme = {
        c: isDark ? dark : light,
        embed: isDark ? embed.dark : embed.light,
        dark: isDark,
        glass: isLiquidGlassAvailable() && !reduceTransparency,
        small: width < SMALL_WIDTH,
        reduceMotion,
        prefersCrossFade,
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
export * from './tokens';
