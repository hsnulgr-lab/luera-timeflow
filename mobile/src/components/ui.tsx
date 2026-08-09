import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { hit, numeric, radius, space, type, useTheme } from '../theme';

// Kumandanın temel parçaları. Tasarımdaki ölçüler burada TEK yerde;
// üç ekranda üç farklı buton yüksekliği çıkmasın.

export function T({ v = 'body', c: color, style, children, numberOfLines }: {
    v?: keyof typeof type; c?: string; style?: StyleProp<TextStyle>;
    children: ReactNode; numberOfLines?: number;
}) {
    const { c } = useTheme();
    const base = type[v] as TextStyle;
    return (
        <Text
            numberOfLines={numberOfLines}
            style={[base, { color: color ?? c.tx }, style]}
        >
            {children}
        </Text>
    );
}

/** Tutar ve sayaç — rakamlar zıplamasın diye tabular. */
export function Num({ children, style, size = 15.5 }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number }) {
    const { c } = useTheme();
    return (
        <Text style={[{ color: c.tx, fontSize: size, fontWeight: '800', letterSpacing: -0.4 }, numeric, style]}>
            {children}
        </Text>
    );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    const { c } = useTheme();
    // Gölge YOK — ayrım kenarlık ve yüzey farkıyla. RN'de gölge platformlar
    // arası tutarsız, tasarım da bu yüzden gölgesiz kuruldu.
    return (
        <View style={[{
            backgroundColor: c.card, borderColor: c.bd, borderWidth: 1,
            borderRadius: radius.lg, padding: space.lg,
        }, style]}>
            {children}
        </View>
    );
}

type BtnKind = 'pri' | 'gho' | 'bare' | 'danger';

export function Button({ label, onPress, kind = 'pri', big = false, disabled, left, right }: {
    label: string; onPress: () => void; kind?: BtnKind; big?: boolean;
    disabled?: boolean; left?: ReactNode; right?: ReactNode;
}) {
    const { c } = useTheme();
    const bg = kind === 'pri' ? c.or : kind === 'gho' ? 'transparent' : 'transparent';
    const fg = kind === 'pri' ? '#fff' : kind === 'danger' ? c.rd : c.tx;
    const border = kind === 'gho' ? c.bd2 : kind === 'danger' ? c.rd : 'transparent';
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            // Kritik buton 66, normal 60 — hiçbiri 44'ün altına inmez.
            style={({ pressed }) => ({
                minHeight: big ? hit.action : hit.actionSm,
                borderRadius: radius.md,
                backgroundColor: bg,
                borderWidth: kind === 'gho' || kind === 'danger' ? 1.5 : 0,
                borderColor: border,
                alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
                gap: space.xs, paddingHorizontal: space.lg,
                opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
        >
            {left}
            <Text style={{ color: fg, fontSize: big ? 17 : 15.5, fontWeight: '800', letterSpacing: -0.3 }}>
                {label}
            </Text>
            {right}
        </Pressable>
    );
}

/** Liste satırı — 62 pt, tasarımın ölçüsü. */
export function Row({ children, onPress, style }: {
    children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();
    const inner = (
        <View style={[{
            minHeight: hit.row, flexDirection: 'row', alignItems: 'center',
            gap: space.md, paddingHorizontal: space.lg,
            borderBottomWidth: 1, borderBottomColor: c.bd,
        }, style]}>
            {children}
        </View>
    );
    return onPress
        ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{inner}</Pressable>
        : inner;
}

/** Boş durum — "hiçbir şey yok" demek yetmez, ne yapılacağını söyler. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
    const { c } = useTheme();
    return (
        <View style={{ padding: space.xxl, alignItems: 'center', gap: space.sm }}>
            <T v="h3">{title}</T>
            {hint ? <T v="small" c={c.tx2} style={{ textAlign: 'center' }}>{hint}</T> : null}
        </View>
    );
}
