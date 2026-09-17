/**
 * Personel Girişi 099 · şifre ekranlarının ortak parçaları.
 *
 * Tasarım: `Luera Mobil - Personel Girisi 099.html` §P3 · §P4 · §P5.
 *
 * Parçalar ve tasarımdaki karşılıkları:
 *   StepBar     `.steps`      3 pt çizgiler, aralık 6, dolan parça 200 ms
 *   PinDotRow   `.pin-dots`   16 pt, aralık 16; adım değişince 4→1 SÖNEREK boşalır
 *   SwapTitle   başlık        yeni metin ±24 pt kayarak gelir, 220 ms
 *   HintSlot    `.sub`        noktaların 18 pt altında, 40 pt SABİT yuva — hata
 *                             buraya yazılır, ekranda zıplayan hiçbir şey olmaz
 *   InfoBand    teal bant     "şifreniz sıfırlanmış" gibi BİLGİ; hata değil
 *   BottomPlate cam plaka     bilgi → plaka (Alert'in yerine), dokununca kapanır
 *
 * Tasarımın kuralı: 40–55 yaş için sarsılan alan arıza gibi görünüyor — şifre
 * ekranlarında SARSINTI YOK, hata rengi var.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, {
    Easing, interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthActionButton } from './ui';
import { GlassPlate } from './GlassPlate';
import { authMetrics, font, radius, useTheme } from '../theme';
import { pinInk } from '../lib/pinInk';

/*
 * `react-hooks/immutability` reanimated'in paylaşılan değerlerini bilmiyor:
 * `sv.value = ...` kütüphanenin TEK yazma yolu ve efekt içinde yapılması doğru
 * kullanım. Kural bu dosyada kapalı (SendToCash.tsx ile aynı gerekçe).
 */
/* eslint-disable react-hooks/immutability */

// ── Adım çubuğu ─────────────────────────────────────────────────────────────

function StepSegment({ on }: { on: boolean }) {
    const { c, reduceMotion } = useTheme();
    const fill = useSharedValue(on ? 1 : 0);
    useEffect(() => {
        fill.value = reduceMotion
            ? (on ? 1 : 0)
            : withTiming(on ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
    }, [on, reduceMotion, fill]);
    const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
    return (
        <View style={{ flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: c.bd2, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 3, borderRadius: radius.pill, backgroundColor: c.tx }, style]} />
        </View>
    );
}

/** Kalıcı adım göstergesi — kişi 20 saniye sonra bakınca da hangi adımda olduğunu görür. */
export function StepBar({ count, done }: { count: number; done: number }) {
    return (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingTop: 2, paddingBottom: 12 }}>
            {Array.from({ length: count }, (_, i) => <StepSegment key={i} on={i < done} />)}
        </View>
    );
}

// ── Noktalar ────────────────────────────────────────────────────────────────

export type DotTone = 'normal' | 'error' | 'ok';

function Dot({ filled, tone, drainDelay }: { filled: boolean; tone: DotTone; drainDelay: number | null }) {
    const { c, reduceMotion } = useTheme();
    const ink = pinInk(useTheme().dark);
    // `on`: dolgu (0 boş → 1 dolu). `err`: kenarın kırmızıya geçişi (140 ms).
    const on = useSharedValue(filled ? 1 : 0);
    const err = useSharedValue(tone === 'error' ? 1 : 0);

    useEffect(() => {
        if (drainDelay !== null && !filled) {
            // BOŞALARAK SÖNME — adım değişti. Kişi alanın temizlendiğini görür;
            // bu bir hareket değil bilgi, reduceMotion'da da kalır (yalnız opaklık).
            on.value = withDelay(drainDelay, withTiming(0, { duration: 90, easing: Easing.linear }));
            return;
        }
        on.value = filled ? withTiming(1, { duration: reduceMotion ? 0 : 90 }) : 0;
    }, [filled, drainDelay, reduceMotion, on]);

    useEffect(() => {
        err.value = reduceMotion ? (tone === 'error' ? 1 : 0) : withTiming(tone === 'error' ? 1 : 0, { duration: 140 });
    }, [tone, reduceMotion, err]);

    const fillColor = tone === 'ok' ? c.or : c.tx;
    const ring = useAnimatedStyle(() => ({
        borderColor: interpolateColor(err.value, [0, 1], [on.value > 0.5 ? fillColor : c.bd2, ink.errorText]),
    }));
    const inner = useAnimatedStyle(() => ({ opacity: tone === 'error' ? 0 : on.value }));

    return (
        <Animated.View style={[{
            width: authMetrics.pinDot,
            height: authMetrics.pinDot,
            borderRadius: radius.pill,
            borderWidth: authMetrics.pinDotBorder,
            overflow: 'hidden',
        }, ring]}>
            <Animated.View style={[{ flex: 1, backgroundColor: fillColor }, inner]} />
        </Animated.View>
    );
}

/**
 * Dört nokta. `drainKey` değişince (adım geçti) DOLU noktalar 4. noktadan
 * 1.'ye 45 ms arayla söner — bugünkü hatanın kaynağı noktaların anında
 * sıfırlanması ve ekranın birebir aynı kalmasıydı.
 */
export function PinDotRow({ length, tone = 'normal', drainKey }: {
    length: number;
    tone?: DotTone;
    drainKey?: string;
}) {
    const [draining, setDraining] = useState<{ key: string | undefined; from: number } | null>(null);
    const [lastKey, setLastKey] = useState(drainKey);
    const [lastLength, setLastLength] = useState(length);

    // Türetilmiş durum (render sırasında, efekt değil): anahtar değiştiyse
    // bir önceki doluluktan boşaltma başlar.
    if (drainKey !== lastKey) {
        setLastKey(drainKey);
        setDraining({ key: drainKey, from: Math.max(lastLength, 4) });
    }
    if (length !== lastLength) setLastLength(length);

    useEffect(() => {
        if (!draining) return undefined;
        const id = setTimeout(() => setDraining(null), 4 * 45 + 90);
        return () => clearTimeout(id);
    }, [draining]);

    return (
        <View style={{ flexDirection: 'row', gap: authMetrics.pinDotGap, justifyContent: 'center' }}>
            {Array.from({ length: 4 }, (_, i) => {
                const drainingThis = draining !== null && length === 0 && i < draining.from;
                return (
                    <Dot
                        key={i}
                        filled={tone === 'ok' || i < length}
                        tone={tone}
                        drainDelay={drainingThis ? (3 - i) * 45 : null}
                    />
                );
            })}
        </View>
    );
}

// ── Başlık ──────────────────────────────────────────────────────────────────

/** Yeni başlık +24 pt'den gelir (220 ms). `slide: false` → yalnız opaklık (sonuç, adım değil). */
export function SwapTitle({ text, slide = true, size = authMetrics.staffPinTitle }: {
    text: string; slide?: boolean; size?: number;
}) {
    const { c, reduceMotion } = useTheme();
    const t = useSharedValue(1);
    const [shown, setShown] = useState(text);
    if (text !== shown) setShown(text);

    useEffect(() => {
        t.value = 0;
        t.value = reduceMotion || !slide
            ? withTiming(1, { duration: 120 })
            : withSpring(1, { damping: 22, stiffness: 190 });
    }, [shown, reduceMotion, slide, t]);

    const style = useAnimatedStyle(() => ({
        opacity: t.value,
        transform: [{ translateX: reduceMotion || !slide ? 0 : (1 - t.value) * 24 }],
    }));

    return (
        <Animated.Text style={[{
            color: c.tx,
            fontSize: size,
            lineHeight: size * 1.08,
            fontFamily: font.extraBold,
            fontWeight: '800',
            letterSpacing: size * -0.03,
            textAlign: 'center',
        }, style]}>
            {shown}
        </Animated.Text>
    );
}

// ── İpucu yuvası ────────────────────────────────────────────────────────────

export type HintTone = 'quiet' | 'error' | 'warn';

/** 40 pt sabit yuva: iki satıra çıksa da noktalar, avatar ve başlık kıpırdamaz. */
export function HintSlot({ text, tone = 'quiet' }: { text: string | null; tone?: HintTone }) {
    const { c, dark } = useTheme();
    const ink = pinInk(dark);
    const color = tone === 'error' ? ink.errorText : tone === 'warn' ? c.am : c.tx2;
    return (
        <View style={{ minHeight: 40, marginTop: 18, paddingHorizontal: 28, alignSelf: 'stretch' }}>
            {text ? (
                <Text style={{
                    color,
                    fontSize: 14,
                    lineHeight: 14 * 1.45,
                    fontFamily: tone === 'quiet' ? font.medium : font.semiBold,
                    fontWeight: tone === 'quiet' ? '500' : '600',
                    textAlign: 'center',
                }}>
                    {text}
                </Text>
            ) : null}
        </View>
    );
}

// ── Bilgi bandı ─────────────────────────────────────────────────────────────

/** Teal BİLGİ bandı — kırmızı değil: kişi bir şey kaybetmedi. Kapatılamaz. */
export function InfoBand({ children }: { children: ReactNode }) {
    const { dark } = useTheme();
    const ink = pinInk(dark);
    return (
        <View style={{
            marginHorizontal: 18,
            marginBottom: 8,
            paddingVertical: 11,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: ink.tealEdge,
            backgroundColor: ink.tealFill,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
        }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: ink.teal }} />
            <Text style={{
                flex: 1,
                color: ink.teal,
                fontSize: 13.5,
                lineHeight: 13.5 * 1.45,
                fontFamily: font.semiBold,
                fontWeight: '600',
            }}>
                {children}
            </Text>
        </View>
    );
}

// ── Alt plaka ───────────────────────────────────────────────────────────────

/**
 * Bilgi → plaka (tasarım kuralı: bilgi plaka, karar sayfa). Alttan yükselir
 * (260 ms yay), arkası %42 kararır, dışına dokununca ya da "Anladım"la kapanır.
 * Tek düğme ve o düğme hiçbir şey yapmıyor — yalnız kapatıyor.
 */
export function BottomPlate({ visible, title, body, onDismiss, tone = 'plain' }: {
    visible: boolean;
    title: string;
    body: string;
    onDismiss: () => void;
    tone?: 'plain' | 'teal';
}) {
    const { c, dark, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const ink = pinInk(dark);
    const t = useSharedValue(0);

    useEffect(() => {
        if (!visible) { t.value = 0; return; }
        t.value = reduceMotion ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 24, stiffness: 200 });
    }, [visible, reduceMotion, t]);

    const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value) }));
    const plate = useAnimatedStyle(() => ({
        transform: [{ translateY: reduceMotion ? 0 : (1 - t.value) * 320 }],
        opacity: reduceMotion ? t.value : 1,
    }));

    return (
        <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
            <Animated.View style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)' }, scrim]}>
                <Pressable accessibilityLabel="Kapat" style={{ flex: 1 }} onPress={onDismiss} />
            </Animated.View>
            <Animated.View style={[{
                position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12),
            }, plate]}>
                <GlassPlate radius={24}>
                    <View style={{ padding: 20, gap: 12 }}>
                        <Text style={{
                            color: tone === 'teal' ? ink.teal : c.tx,
                            fontSize: 19,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: 19 * -0.02,
                        }}>
                            {title}
                        </Text>
                        <Text style={{
                            color: c.tx2,
                            fontSize: 14.5,
                            lineHeight: 14.5 * 1.45,
                            fontFamily: font.medium,
                            fontWeight: '500',
                        }}>
                            {body}
                        </Text>
                        <AuthActionButton kind="secondary" label="Anladım" onPress={onDismiss} />
                    </View>
                </GlassPlate>
            </Animated.View>
        </Modal>
    );
}
