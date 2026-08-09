import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '../theme';

// Cam yüzey — YALNIZ kabukta kullanılır.
//
// Tasarımın kuralı pazarlık konusu değil: cam üst barda, tab bar'da, sheet
// tutamağında ve yüzen butonda. Kartlara, listelere, formlara uygulanmaz —
// bulanık zeminde metin kontrastı düşer ve kullanıcı kitlesi 40–55 yaş.
//
// Cam kullanılamadığında (iOS 26 altı ya da "saydamlığı azalt" açık) opak bir
// yüzeye düşer. Bu düşüşün SESSİZ olmaması önemli: zemin ve kenarlık verilmezse
// kabuk tamamen görünmez olur.

interface Props {
    children?: ReactNode;
    style?: ViewStyle | ViewStyle[];
    /** Dokunulabilir cam — Apple'ın kendi etkileşim parlaması. */
    interactive?: boolean;
    /** 'regular' varsayılan; 'clear' daha saydam (yalnız koyu içerik üstünde). */
    effect?: 'regular' | 'clear';
}

export function Glass({ children, style, interactive = false, effect = 'regular' }: Props) {
    const { c, glass } = useTheme();

    if (!glass) {
        return (
            <View style={[{ backgroundColor: c.surf, borderColor: c.bd, borderWidth: 1 }, style]}>
                {children}
            </View>
        );
    }
    return (
        <GlassView
            glassEffectStyle={effect}
            isInteractive={interactive}
            // Tint nötr kremden alınır, TURUNCUDAN DEĞİL: turuncu tek vurgu
            // rengimiz ve kabuğa yayılırsa vurgu olmaktan çıkar.
            tintColor={c.tint}
            style={style}
        >
            {children}
        </GlassView>
    );
}
