import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ringStrokes, RING_SPENT_OPACITY } from '../lib/sessionRing';
import { font, numeric, useTheme } from '../theme';

/**
 * Müdür 36 · Yol 1 — paketin halkası. Kurallar `lib/sessionRing.ts`te.
 *
 * DURAĞAN çizilir: dolma animasyonu (çizgi uzunluğu) yerli sürücüde yok.
 * İlk çizimde bir kez belirir — opacity 0 → 1 ve scale .96 → 1, 180 ms
 * (tasarımın notu). "Hareketi azalt" açıksa doğrudan yerinde.
 *
 * Döndürme SVG'de değil dış kutuda (-90°: saat 12'den başlasın); rakam o
 * kutunun DIŞINDA, üstte durur — dönmez.
 */
export function SessionRing({ size, stroke, total, left, color, number, numberSize = 15 }: {
    size: number;
    stroke: number;
    total: number;
    left: number;
    color: string;
    /** Ortada kalan yazılsın mı (randevu kartının Ø18'i rakamsız). */
    number?: boolean;
    numberSize?: number;
}) {
    const { reduceMotion } = useTheme();
    const [appear] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
    useEffect(() => {
        if (reduceMotion) { appear.setValue(1); return; }
        Animated.timing(appear, {
            toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start();
    }, [appear, reduceMotion]);

    const c = size / 2;
    const r = (size - stroke) / 2;
    const strokes = ringStrokes({ size, stroke, total, left });

    return (
        <Animated.View
            accessible={false}
            style={{
                width: size,
                height: size,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: appear,
                transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
            }}
        >
            <View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {strokes.map((part, index) => (
                        <Circle
                            key={index}
                            cx={c}
                            cy={c}
                            r={r}
                            fill="none"
                            stroke={color}
                            strokeOpacity={part.on ? 1 : RING_SPENT_OPACITY}
                            strokeWidth={stroke}
                            strokeDasharray={part.dash}
                            strokeDashoffset={part.offset}
                        />
                    ))}
                </Svg>
            </View>
            {number ? (
                <Text style={[{
                    color,
                    fontSize: numberSize,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: numberSize * -0.02,
                }, numeric]}>
                    {Math.max(0, Math.round(left))}
                </Text>
            ) : null}
        </Animated.View>
    );
}
