import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { feedback } from '../lib/feedback';
import { STAT_LABELS, tints } from '../lib/waLink';
import { font, useTheme } from '../theme';

/**
 * Müdür 37 · WhatsApp bağlama — ekranların ortak parçaları.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 37 WhatsApp Baglama.html`
 * (+ `m37-ekranlar.js`). Ölçüler tasarımın CSS'inden; renkler temanın
 * jetonlarından, tasarımın yarı saydam zeminleri (grb/rdb/amb) burada türetilir.
 * Hareket yalnız opaklık, kaydırma ve ölçek; hepsi native sürücüde.
 */

// ── Simgeler (tasarımın i-* sembolleri) ─────────────────────────────────────

export type WaIconName =
    | 'back' | 'x' | 'phn' | 'phn2' | 'arrow' | 'copy' | 'refresh' | 'out' | 'check' | 'warn' | 'lock' | 'send';

export function WaIcon({ name, color, size = 22, stroke = 1.7 }: {
    name: WaIconName; color: string; size?: number; stroke?: number;
}) {
    const p = { stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            {name === 'back' ? <Path d="M15 5l-7 7 7 7" {...p} /> : null}
            {name === 'x' ? <Path d="M6 6l12 12M18 6 6 18" {...p} /> : null}
            {name === 'phn' ? (<><Rect x={6.5} y={2.8} width={11} height={18.4} rx={2.4} {...p} /><Path d="M10.6 18h2.8" {...p} /></>) : null}
            {name === 'phn2' ? (<><Rect x={3.4} y={6} width={8.6} height={15} rx={2} {...p} /><Path d="M9 3h9.6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H15" {...p} /><Path d="M6.6 18.2h2.2" {...p} /></>) : null}
            {name === 'arrow' ? <Path d="M4.5 12h15M13.5 6l6 6-6 6" {...p} /> : null}
            {name === 'copy' ? (<><Rect x={8.5} y={8.5} width={11} height={11} rx={2} {...p} /><Path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" {...p} /></>) : null}
            {name === 'refresh' ? <Path d="M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7M17.6 3.4v3.2h-3.2M6.4 20.6v-3.2h3.2" {...p} /> : null}
            {name === 'out' ? <Path d="M7 17 17 7M9 7h8v8" {...p} /> : null}
            {name === 'check' ? <Path d="M4.5 12.6 9.4 17.5 19.5 7" {...p} /> : null}
            {name === 'warn' ? (<><Circle cx={12} cy={12} r={8.4} {...p} /><Path d="M12 7.8v5M12 16.2h.01" {...p} /></>) : null}
            {name === 'lock' ? <Path d="M6.4 10.6h11.2v9.2H6.4zM8.8 10.6V7.8a3.2 3.2 0 0 1 6.4 0v2.8" {...p} /> : null}
            {name === 'send' ? (<><Path d="M6.5 4.6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7l-4.2 3.2V14.6a2 2 0 0 1-1.8-2v-6a2 2 0 0 1 2-2z" {...p} /><Path d="M8.9 9.6h6.1" {...p} /><Path d="M12.6 7.3l2.4 2.3-2.4 2.3" {...p} /></>) : null}
        </Svg>
    );
}

// ── Yanıp sönen nokta (Gün'deki canlı noktayla aynı: .9↔.3, 1600 ms) ────────

export function PulseDot({ color, size = 7 }: { color: string; size?: number }) {
    const { reduceMotion } = useTheme();
    const [v] = useState(() => new Animated.Value(0.9));
    useEffect(() => {
        if (reduceMotion) { v.setValue(0.9); return undefined; }
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(v, { toValue: 0.3, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.9, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [reduceMotion, v]);
    return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: v }} />;
}

// ── Metin parçaları ─────────────────────────────────────────────────────────

/** Üst durum etiketi: nokta + harf aralıklı kelime (.st). */
export function StatusKicker({ tone, text }: { tone: 'no' | 'rd' | 'ok' | 'ld'; text: string }) {
    const { c } = useTheme();
    const color = tone === 'rd' ? c.rd : tone === 'ok' ? c.gr : c.tx3;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 }}>
            {tone === 'ld' ? <PulseDot color={color} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />}
            <Text style={{ color, fontSize: 12, fontFamily: font.bold, fontWeight: '700', letterSpacing: 12 * 0.2 }}>{text}</Text>
        </View>
    );
}

export function H1({ children, top = 10 }: { children: string; top?: number }) {
    const { c } = useTheme();
    return (
        <Text accessibilityRole="header" style={{
            color: c.tx, fontSize: 29, lineHeight: 32, fontFamily: font.extraBold, fontWeight: '800',
            letterSpacing: 29 * -0.035, marginTop: top,
        }}>
            {children}
        </Text>
    );
}

export function Lead({ children, center = false, top = 10 }: { children: ReactNode; center?: boolean; top?: number }) {
    const { c } = useTheme();
    return (
        <Text style={{
            color: c.tx2, fontSize: 16, lineHeight: 23, fontFamily: font.medium, fontWeight: '500',
            marginTop: top, textAlign: center ? 'center' : 'left',
        }}>
            {children}
        </Text>
    );
}

export function Eyebrow({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <Text style={{ color: c.tx3, fontSize: 11.5, fontFamily: font.bold, fontWeight: '700', letterSpacing: 11.5 * 0.2 }}>
            {children}
        </Text>
    );
}

/** Kart (.card). `tone` kırmızı/amber çerçeve ve zemin. */
export function WaCard({ children, tone, top = 16 }: { children: ReactNode; tone?: 'rd' | 'am'; top?: number }) {
    const { c, dark } = useTheme();
    const t = tints(dark);
    return (
        <View style={{
            marginTop: top, padding: 16, gap: 12, borderRadius: 22, borderWidth: 1,
            backgroundColor: tone === 'rd' ? t.rdb : tone === 'am' ? t.amb : c.surf,
            borderColor: tone === 'rd' ? t.rdd : tone === 'am' ? t.amd : c.bd,
        }}>
            {children}
        </View>
    );
}

export function Bullet({ children, dot }: { children: string; dot?: string }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot ?? c.tx, marginTop: 8.5 }} />
            <Text style={{ flex: 1, color: c.tx, fontSize: 15.5, lineHeight: 22, fontFamily: font.medium, fontWeight: '500' }}>{children}</Text>
        </View>
    );
}

/** Yan not: kısa çizgi + küçük metin (.aside). */
export function Aside({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 12 }}>
            <View style={{ width: 12, height: 1, backgroundColor: c.tx3, marginTop: 10 }} />
            <Text style={{ flex: 1, color: c.tx2, fontSize: 13.5, lineHeight: 19, fontFamily: font.medium, fontWeight: '500' }}>{children}</Text>
        </View>
    );
}

/** Kalın parçalı metin: [düz, kalın, düz, …] sırasıyla. */
export function Rich({ parts, style }: { parts: string[]; style: object }) {
    const { c } = useTheme();
    return (
        <Text style={style}>
            {parts.map((p, i) => (i % 2
                ? <Text key={i} style={{ color: c.tx, fontFamily: font.bold, fontWeight: '700' }}>{p}</Text>
                : <Text key={i}>{p}</Text>))}
        </Text>
    );
}

// ── Düğmeler ────────────────────────────────────────────────────────────────

/**
 * Ana düğme (.kbtn) — 59 pt, 26 yarıçap. `or` turuncu (eylem), `nt` mürekkep
 * (Vazgeç), `ln` çerçeveli, `rd` kırmızı çerçeveli (Bağlantıyı kes).
 */
export function WaButton({ label, onPress, variant = 'or', icon, busy = false, disabled = false }: {
    label: string; onPress: () => void; variant?: 'or' | 'nt' | 'ln' | 'rd'; icon?: WaIconName; busy?: boolean; disabled?: boolean;
}) {
    const { c, dark } = useTheme();
    const t = tints(dark);
    const bg = variant === 'or' ? c.or : variant === 'nt' ? c.tx : variant === 'rd' ? t.rdb : 'transparent';
    const ink = variant === 'or' ? '#FFFFFF' : variant === 'nt' ? c.bg : variant === 'rd' ? c.rd : c.tx;
    const border = variant === 'ln' ? c.bd2 : variant === 'rd' ? t.rdd : 'transparent';
    const off = disabled || busy;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: off, busy }}
            disabled={off}
            onPress={() => { feedback.light(); onPress(); }}
            style={({ pressed }) => ({
                height: 59, borderRadius: 26, backgroundColor: bg, borderWidth: variant === 'ln' || variant === 'rd' ? 1.5 : 0,
                borderColor: border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                opacity: disabled && !busy ? 0.45 : pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
        >
            {busy ? <ActivityIndicator color={ink} /> : null}
            <Text style={{ color: ink, fontSize: 19, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 19 * -0.02 }}>{label}</Text>
            {icon && !busy ? <WaIcon name={icon} color={ink} size={21} stroke={2} /> : null}
        </Pressable>
    );
}

/** Metin düğmesi (.kgh) — "Vazgeç", "Sonra". */
export function GhostText({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({ height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
            <Text style={{ color: color ?? c.tx2, fontSize: 16, fontFamily: font.bold, fontWeight: '700' }}>{label}</Text>
        </Pressable>
    );
}

/** Hap düğme (.cbtn / .hap) — "Kopyala", "Yenile", "Tekrar dene". */
export function PillButton({ label, icon, onPress, disabled = false }: {
    label: string; icon: WaIconName; onPress: () => void; disabled?: boolean;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                height: 40, paddingLeft: 12, paddingRight: 15, borderRadius: 999, borderWidth: 1.5, borderColor: c.tx,
                flexDirection: 'row', alignItems: 'center', gap: 7, opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
            })}
        >
            <WaIcon name={icon} color={c.tx} size={18} />
            <Text style={{ color: c.tx, fontSize: 15, fontFamily: font.extraBold, fontWeight: '800' }}>{label}</Text>
        </Pressable>
    );
}

// ── Kod hücreleri (D2, D3) ──────────────────────────────────────────────────

/**
 * İki dörtlük blok, her karakter kendi kutusunda, eşit genişlikli yazı.
 * Gelişte hücreler soldan sağa: 180 ms, 24 ms arayla (opacity 0→1, y 6→0).
 * Süre dolunca .35'e söner (240 ms, ease-out). `code` değişince yeniden gelir.
 */
export function CodeCells({ code, dead, compact }: { code: string; dead: boolean; compact: boolean }) {
    const { c, reduceMotion } = useTheme();
    const [cells] = useState(() => Array.from({ length: 8 }, () => new Animated.Value(0)));
    const [dim] = useState(() => new Animated.Value(1));

    useEffect(() => {
        if (reduceMotion) { cells.forEach((v) => v.setValue(1)); return; }
        cells.forEach((v) => v.setValue(0));
        Animated.stagger(24, cells.map((v) => Animated.timing(v, {
            toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }))).start();
    }, [code, reduceMotion, cells]);

    useEffect(() => {
        const to = dead ? 0.35 : 1;
        if (reduceMotion) { dim.setValue(to); return; }
        Animated.timing(dim, { toValue: to, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }, [dead, reduceMotion, dim]);

    const w = compact ? 34 : 36;
    const h = compact ? 52 : 58;
    const chars = code.padEnd(8).slice(0, 8).split('');
    const cell = (ch: string, i: number) => (
        <Animated.View key={i} style={{
            width: w, height: h, borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.bd2,
            alignItems: 'center', justifyContent: 'center',
            opacity: cells[i],
            transform: [{ translateY: cells[i].interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        }}>
            <Text style={{ color: c.tx, fontSize: compact ? 26 : 28, fontFamily: 'Menlo', fontWeight: '700' }}>{ch}</Text>
        </Animated.View>
    );
    return (
        <Animated.View
            accessible
            accessibilityLabel={`Bağlama kodu: ${chars.join(' ')}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, opacity: dim }}
        >
            {chars.slice(0, 4).map(cell)}
            <View style={{ width: 12, height: 2.5, borderRadius: 2, backgroundColor: c.tx3, marginHorizontal: 3 }} />
            {chars.slice(4).map((ch, i) => cell(ch, i + 4))}
        </Animated.View>
    );
}

/**
 * Sayaç (.tmr): rakam saniyede bir değişir (animasyonsuz); 3 pt'lik ray kalan
 * süreyle orantılı. Ray rengi nötr, süre bitimine yaklaşınca DEĞİŞMEZ.
 */
export function Countdown({ text, word, fraction }: { text: string; word: string; fraction: number }) {
    const { c } = useTheme();
    const f = Math.max(0, Math.min(1, fraction));
    return (
        <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
            <Text style={{ color: c.tx2, fontSize: 14, fontFamily: font.semiBold, fontWeight: '600' }}>
                <Text style={{ color: c.tx, fontFamily: font.extraBold, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{text}</Text>
                {` ${word}`}
            </Text>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: c.fld, overflow: 'hidden' }}>
                <View style={{ height: 3, width: `${f * 100}%`, backgroundColor: c.tx3 }} />
            </View>
        </View>
    );
}

/** Numaralı adımlar (.steps) — WhatsApp'taki sırayla ve kelimelerle. */
export function Steps({ items, compact }: { items: string[][]; compact: boolean }) {
    const { c } = useTheme();
    return (
        <View style={{ marginTop: 18, borderTopWidth: 1, borderColor: c.bd }}>
            {items.map((parts, i) => (
                <View key={i} style={{
                    flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: compact ? 8 : 11,
                    borderBottomWidth: 1, borderColor: c.bd,
                }}>
                    <View style={{
                        width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.bd2,
                        alignItems: 'center', justifyContent: 'center', marginTop: -1,
                    }}>
                        <Text style={{ color: c.tx, fontSize: 12.5, fontFamily: font.extraBold, fontWeight: '800' }}>{i + 1}</Text>
                    </View>
                    <Rich parts={parts} style={{
                        flex: 1, color: c.tx, fontSize: compact ? 15 : 15.5, lineHeight: 21,
                        fontFamily: font.medium, fontWeight: '500',
                    }} />
                </View>
            ))}
        </View>
    );
}

// ── Son 24 saat (F2) ────────────────────────────────────────────────────────

/** Dört sayı; sıfır olan soluk (göz sorunlu olana gider). */
export function Stats({ values }: { values: [number, number, number, number] }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row' }}>
            {values.map((v, i) => (
                <View
                    key={STAT_LABELS[i]}
                    accessible
                    accessibilityLabel={`${STAT_LABELS[i]}: ${v}`}
                    style={{ flex: 1, minWidth: 0, gap: 3, paddingLeft: i ? 12 : 0, borderLeftWidth: i ? 1 : 0, borderColor: c.bd }}
                >
                    <Text style={{
                        color: v === 0 ? c.tx3 : c.tx, fontSize: 29, lineHeight: 31, fontFamily: font.extraBold, fontWeight: '800',
                        letterSpacing: 29 * -0.03, fontVariant: ['tabular-nums'],
                    }}>{v}</Text>
                    <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontFamily: font.semiBold, fontWeight: '600' }}>{STAT_LABELS[i]}</Text>
                </View>
            ))}
        </View>
    );
}

/** Uyarı satırı: amber simge + kalın başlık + açıklama (.lerr, .res.no, .err). */
export function WarnLine({ title, body, divider = false, size = 14 }: {
    title: string; body?: string; divider?: boolean; size?: number;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', gap: 10, alignItems: 'flex-start',
            ...(divider ? { paddingTop: 12, borderTopWidth: 1, borderColor: c.bd } : null),
        }}>
            <View style={{ marginTop: 1 }}><WaIcon name="warn" color={c.am} size={19} /></View>
            <Text style={{ flex: 1, color: c.tx2, fontSize: size, lineHeight: size * 1.4, fontFamily: font.medium, fontWeight: '500' }}>
                <Text style={{ color: c.tx, fontFamily: font.bold, fontWeight: '700' }}>{title}</Text>
                {body ? ` ${body}` : ''}
            </Text>
        </View>
    );
}

/** İskelet kutusu (.sk). */
export function Skel({ w, h, top = 0 }: { w: number | `${number}%`; h: number; top?: number }) {
    const { c } = useTheme();
    return <View style={{ width: w, height: h, borderRadius: 9, backgroundColor: c.fld, marginTop: top }} />;
}

/** İşletme satırının sağındaki durum kelimesi (.ws): nokta + kelime. */
export function StatusWord({ tone, word }: { tone: 'ok' | 'no' | 'rd' | 'ld' | 'un'; word: string }) {
    const { c } = useTheme();
    const color = tone === 'ok' ? c.gr : tone === 'rd' ? c.rd : c.tx2;
    const dot = tone === 'ok' ? c.gr : tone === 'rd' ? c.rd : c.tx3;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {tone === 'ld' ? <PulseDot color={dot} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />}
            <Text numberOfLines={1} style={{ color, fontSize: 14.5, fontFamily: font.bold, fontWeight: '700' }}>{word}</Text>
        </View>
    );
}

