import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme, useWindowDimensions } from 'react-native';
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
    /**
     * Uygulama içi tema tercihi (Müdür 27 · Görünüm).
     *
     * `system` cihazın ayarını izler. Bu olmadan Görünüm ekranı ölü bir
     * kontrol olurdu: seçim yapılır, hiçbir şey değişmezdi.
     */
    themeMode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => void;
}

export type ThemeMode = 'dark' | 'light' | 'system';

const THEME_KEY = 'tf.theme.mode';

const Ctx = createContext<Theme>({
    c: light,
    embed: embed.light,
    dark: false,
    glass: false,
    small: false,
    reduceMotion: true,
    prefersCrossFade: true,
    themeMode: 'system',
    setThemeMode: () => { /* sağlayıcı dışında tercih tutulmaz */ },
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

    /*
     * Tema tercihi kalıcı: uygulama kapanıp açılınca seçim korunur. Okunana
     * kadar `system` varsayılır — cihazın ayarı, yani bugünkü davranış.
     */
    const [themeMode, setMode] = useState<ThemeMode>('system');
    useEffect(() => {
        let alive = true;
        void (async () => {
            const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
            const stored = await AsyncStorage.getItem(THEME_KEY);
            if (!alive) return;
            if (stored === 'dark' || stored === 'light' || stored === 'system') setMode(stored);
        })().catch(() => { /* okunamazsa sistem takip edilir */ });
        return () => { alive = false; };
    }, []);

    /*
     * SEÇİM SİSTEME DE İŞLENİR.
     *
     * Tema bu uygulamanın kendi ayarıydı; `Appearance` hiç dokunulmuyordu.
     * Sonuç: JS koyu çiziyor, SİSTEM açık kalıyor ve aradaki fark yerli
     * bileşenlerde görünüyordu.
     *
     * En görünür yeri alt bar: iOS 26'da gerçek Liquid Glass, yani saydam ve
     * ARKASINDAKİNİ örnekliyor. Sekme değişiminde yeni ekran boyanana kadar
     * arkada sistemin varsayılan zemini duruyor; sistem açık modda olduğu
     * için bar bir kare beyazı örnekliyor, ekran koyuya boyanınca düzeliyor.
     * Ekranda "her geçişte bir an açık moda düşüyor" diye görünen şey buydu.
     *
     * `'unspecified'` = sistemi takip et; o zaman zaten fark yok. (RN 0.86'ya
     * kadar bunun adı `null`'dı.)
     */
    useEffect(() => {
        Appearance.setColorScheme(themeMode === 'system' ? 'unspecified' : themeMode);
    }, [themeMode]);

    const setThemeMode = useCallback((mode: ThemeMode) => {
        setMode(mode);
        void (async () => {
            const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
            await AsyncStorage.setItem(THEME_KEY, mode);
        })().catch(() => { /* yazılamazsa tercih yalnız bu oturumda yaşar */ });
    }, []);

    const isDark = themeMode === 'system' ? scheme === 'dark' : themeMode === 'dark';
    const value: Theme = {
        c: isDark ? dark : light,
        embed: isDark ? embed.dark : embed.light,
        dark: isDark,
        glass: isLiquidGlassAvailable() && !reduceTransparency,
        small: width < SMALL_WIDTH,
        reduceMotion,
        prefersCrossFade,
        themeMode,
        setThemeMode,
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
export * from './tokens';
