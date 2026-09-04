/**
 * Personel 02/03 — sıra kartı ve hâllerinin hareketi.
 *
 * Kaynak: Claude Design "Personel 02 Sira Kartlari" (ölçü) ve
 * "Personel 03 Hal Karakteri" (hareket). Ölçüler ve süreler o dosyalardan
 * BİREBİR alındı; bu bileşen sayı uydurmaz.
 *
 * Kart DÜZ: tek renk sıcak dolgu, gradyan/kenarlık/gölge/cam yok. Sabit
 * yükseklik yok — durum satırı ancak söylenecek bir durum varsa vardır.
 *
 * ÜÇ İLKE:
 *   1. Hareket bilgi taşımaz, bulmayı hızlandırır. Hareket kapalıyken kartın
 *      söylediği hiçbir şey kaybolmaz.
 *   2. Ekran çoğu zaman durgun. Süren iş yoksa hiçbir şey hareket etmez.
 *   3. Bir kartta aynı anda tek hareket olur.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { numeric, useTheme } from '../theme';
import { upperTR } from '../lib/text';
import { brighten, mixOklab } from '../lib/color';
import type { StaffCardState, StaffCardTone } from '../lib/staffCard';

// ── Süreler ve eğriler ──────────────────────────────────────────────────────
// Hareket sözleşmesinden; bu turda yeni süre eklenmedi.

const MS = {
    out: 140,       // çıkan metin
    in: 180,        // giren metin, çizgiler, yeni kart
    move: 240,      // yükseklik, yuva, boşluk taşınması
    dim: 260,       // dolgu + metin alfası + vurgu gücü, birlikte
    ring: 400,      // halkanın tek girişi ve tek çıkışı
    beat: 520,      // eşik nabzı
    turn: 5000,     // halka turu
    minute: 90,     // dakika takası: 90 çık + 90 gir
} as const;

/** Giriş ve taşınma — hızlı başlar, yumuşak oturur. */
const E = Easing.bezier(0.215, 0.61, 0.355, 1);
/** Çıkış — hızlanarak gider; gidenin son anı önemli değil. */
const E_IN = Easing.bezier(0.4, 0, 1, 1);
/** Yalnız sağ hattın çizilmesi — yön duygusu veriyor. */
const E_DEC = Easing.bezier(0.2, 0.9, 0.15, 1);

// ── Ölçüler ─────────────────────────────────────────────────────────────────

const M = {
    radius: 20, radiusSm: 18,
    padV: 14, padVSm: 13,
    padH: 16, padHSm: 14,
    nameSize: 18, nameSizeSm: 17,
    nameLine: 21, nameLineSm: 20,
    serviceSize: 13.5, serviceSizeSm: 13,
    serviceLine: 18, serviceLineSm: 17,
    /** Durum satırının kapladığı toplam yer: üstten 7 + yükseklik 16. */
    statusBlock: 23,
    statusGap: 7,
    statusHeight: 16,
    rail: 44, railSm: 40,
    rowGap: 10, rowGapSm: 8,
    rowPadH: 18, rowPadHSm: 14,
    rowPadB: 8,
} as const;

/**
 * Sönükleşme merdiveni: opacity DEĞİL, dolgu + metin alfası + VURGU GÜCÜ.
 *
 * Tek bir `opacity` bütün kartı zeminle karıştırır ve en sönük hâlde ad
 * okunmaz olur. `accent` bu turda eklendi: eskiden dolgu ve metin sönüyor ama
 * vurgu rengi sönmüyordu, tahsil edilmiş işin yeşili kapıda bekleyen
 * müşterinin amberiyle eşit güçte bağırıyordu.
 */
const DIM = {
    dark: [
        { fill: '#241E16', name: 1, service: 0.58, dur: 0.36, accent: 1 },
        { fill: '#211B13', name: 0.90, service: 0.50, dur: 0.30, accent: 0.78 },
        { fill: '#1E1911', name: 0.78, service: 0.42, dur: 0.26, accent: 0.58 },
    ],
    light: [
        { fill: '#FFFDFB', name: 1, service: 0.52, dur: 0.34, accent: 1 },
        { fill: '#FBF7F1', name: 0.86, service: 0.56, dur: 0.32, accent: 0.78 },
        { fill: '#F8F4EE', name: 0.74, service: 0.50, dur: 0.28, accent: 0.58 },
    ],
} as const;

/**
 * Kırmızı merdivende 22 puan daha az kısılıyor.
 *
 * Aynı yüzdede kırmızının parlaklığı yeşilin ve amberin altında kalıyor;
 * merdiven yüzdeyle değil KONTRASTLA tanımlı — üç renk aynı sayıyla değil
 * aynı okunurlukla sönüyor.
 */
const RED_BONUS = 0.22;

/** Eşik nabzında rengin parlama katsayısı. */
const BEAT_LIFT = 1.55;
/** Eşik nabzında noktanın büyüme oranı. */
const BEAT_SCALE = 1.28;

/**
 * Halkanın renkleri — tamamı paletin sıcak ekseninde.
 *
 * Mavi ve yeşil bilerek YOK: yeşil "tamam / tahsil edildi" demek ve dönen bir
 * yeşil, bitmemiş bir işi bitmiş gösterirdi.
 */
const GLOW = {
    dark: ['#FF5A1F', '#D9A43B', '#FF7A45', '#E8430F', '#FF5A1F'],
    light: ['#E8430F', '#B87A00', '#FF5A1F', '#C94040', '#E8430F'],
} as const;

/** Halka kalınlığı. Kart BÜYÜMEZ: halka dışarı taşar, yerleşim aynı kalır. */
const RING = 0.3;

/** Halka bu iki hâlde döner. UZADI'da halka SÜRÜYOR'dan devralınır. */
const RINGED = new Set(['running', 'over']);

const alpha = (rgb: string, a: number) => (a >= 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${a})`);

export interface CardAppointment {
    id: string;
    start_time: string;
    customer_name: string;
    service: string;
}

/** "Ayşe Yılmaz" → ad 500, soyad 800. Okunan şey ikisinin silueti. */
function splitName(full: string): { given: string; family: string } {
    const parts = full.trim().split(/\s+/);
    if (parts.length < 2) return { given: full.trim(), family: '' };
    return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

/**
 * Kartın toplam yüksekliği — yalnız yeni kart yuvası için gerekiyor.
 * İki satır 71 + 8 boşluk = 79 · üç satır 94 + 8 = 102.
 */
export function cardSlotHeight(hasStatus: boolean, small: boolean): number {
    const padV = small ? M.padVSm : M.padV;
    const base = padV * 2
        + (small ? M.nameLineSm : M.nameLine)
        + 4
        + (small ? M.serviceLineSm : M.serviceLine);
    return base + (hasStatus ? M.statusBlock : 0) + M.rowPadB;
}

// ── Halka ───────────────────────────────────────────────────────────────────

/**
 * Süren randevunun kenarında dönen ışık. Ekranda sürekli hareket eden TEK şey
 * ve en fazla bir tane olabilir — koltuk bir tane.
 *
 * Halka kartın ARKASINDA duruyor ve kart opak olduğu için yalnız kenarda
 * görünüyor. Dönen katman KARE ve en az kartın köşegeni kadar: kart geniş ve
 * alçak, yüzde tabanlı bir ölçü 90°'de kısa kenara düşer ve kenarlar dönerken
 * bir görünüp bir kaybolurdu.
 */
function GlowRing({ visible, children }: { visible: boolean; children: ReactNode }) {
    const { dark, reduceMotion } = useTheme();
    const spin = useRef(new Animated.Value(0)).current;
    const fade = useRef(new Animated.Value(visible ? 1 : 0)).current;
    const [box, setBox] = useState({ width: 0, height: 0 });
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        if (reduceMotion !== false) {
            // Halka ÇİZİLİR ama dönmez: sabit fazda sıcak bir kenar olarak
            // kalır. Kelime, nokta ve turuncu sayaç "bu şu anda oluyor"u zaten
            // söylüyor — halka onu hızlandırıyordu, taşımıyordu.
            spin.setValue(42 / 360);
            return;
        }
        // Faz SÜREKLİ: açılışta 0°'dan başlamıyor, geçen süreye göre
        // (t mod 5000) / 5000 fazından. Ekran bir gösteri değil, bir alet —
        // kapatıp açmak zamanı geri almaz.
        const phase = (Date.now() % MS.turn) / MS.turn;
        spin.setValue(phase);
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(spin, {
                    toValue: 1,
                    duration: MS.turn * (1 - phase),
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
                Animated.timing(spin, {
                    toValue: 0,
                    duration: 0,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [reduceMotion, spin]);

    useEffect(() => {
        if (visible) setMounted(true);
        const animation = Animated.timing(fade, {
            toValue: visible ? 1 : 0,
            duration: MS.ring,
            easing: Easing.linear,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            // Halkanın sönmesi G3'ün taşıyıcısı; bittikten sonra sökülüyor.
            if (finished && !visible) setMounted(false);
        });
        return () => animation.stop();
    }, [visible, fade]);

    const side = Math.ceil(Math.hypot(box.width, box.height));

    return (
        <View style={{ flex: 1, minWidth: 0 }}>
            {mounted ? (
                <Animated.View
                    pointerEvents="none"
                    onLayout={(e) => {
                        const { width, height } = e.nativeEvent.layout;
                        setBox((current) => (
                            current.width === width && current.height === height
                                ? current
                                : { width, height }
                        ));
                    }}
                    style={{
                        position: 'absolute',
                        top: -RING,
                        left: -RING,
                        right: -RING,
                        bottom: -RING,
                        borderRadius: M.radius + RING,
                        overflow: 'hidden',
                        opacity: fade,
                    }}
                >
                    {side > 0 ? (
                        <Animated.View style={{
                            position: 'absolute',
                            width: side,
                            height: side,
                            left: (box.width - side) / 2,
                            top: (box.height - side) / 2,
                            transform: [{
                                rotate: spin.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0deg', '360deg'],
                                }),
                            }],
                        }}>
                            <LinearGradient
                                colors={dark ? GLOW.dark : GLOW.light}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={{ width: '100%', height: '100%' }}
                            />
                        </Animated.View>
                    ) : null}
                </Animated.View>
            ) : null}

            {children}
        </View>
    );
}

// ── Kart ────────────────────────────────────────────────────────────────────

export function AppointmentCard({
    appointment,
    state,
    entering = false,
    onPress,
}: {
    appointment: CardAppointment;
    state: StaffCardState;
    /** Listeye YENİ düşen kart: yuva açılır, kart yerinde belirir. */
    entering?: boolean;
    onPress?: () => void;
}) {
    const { c, dark, small, reduceMotion } = useTheme();
    const still = reduceMotion !== false;

    const toneColor: Record<StaffCardTone, string> = {
        am: c.am, rd: c.rd, gr: c.gr, tx: c.tx,
    };
    const ladderOf = (dim: 0 | 1 | 2) => DIM[dark ? 'dark' : 'light'][dim];
    const accentOf = (s: StaffCardState) => {
        if (!s.tone) return null;
        const l = ladderOf(s.dim);
        const strength = s.tone === 'rd'
            ? Math.min(1, l.accent + RED_BONUS)
            : l.accent;
        return mixOklab(toneColor[s.tone], l.fill, strength);
    };

    /**
     * Ekranda GÖSTERİLEN hâl, gelen hâlden ayrı tutuluyor: geçişte eski
     * kelime 140 ms sönerken hâlâ okunuyor olmalı, yenisi ortada beliriyor.
     */
    const [shown, setShown] = useState(state);
    const busy = useRef(false);

    const swap = useRef(new Animated.Value(1)).current;      // metin takası
    const accentMix = useRef(new Animated.Value(1)).current; // vurgu rengi
    const dimMix = useRef(new Animated.Value(1)).current;    // sönükleşme
    const rowH = useRef(new Animated.Value(state.word ? M.statusBlock : 0)).current;
    const barY = useRef(new Animated.Value(state.word ? 1 : 0)).current;
    // Nabız TEK değer ve JS sürücüsünde: aynı görünümde hem rengi (üst
    // katmanın opaklığı) hem noktanın ölçeğini sürüyor. Nokta zaten JS
    // sürücülü bir dolgu rengi taşıdığı için ölçeği native'e alamayız —
    // tek bir view'da iki sürücü karışamaz.
    const beat = useRef(new Animated.Value(0)).current;
    const minute = useRef(new Animated.Value(1)).current;    // dakika takası
    const slot = useRef(new Animated.Value(entering ? 0 : 1)).current;

    const prevAccent = useRef(accentOf(state));
    const prevLadder = useRef(ladderOf(state.dim));
    const prevBeat = useRef(state.beatKey);

    const accent = accentOf(shown);
    const ladder = ladderOf(shown.dim);
    const from = prevAccent.current ?? accent ?? ladder.fill;
    const fromLadder = prevLadder.current;
    const textRGB = dark ? '243, 237, 227' : '14, 14, 14';

    // ── Yeni kart: yuva açılır, kart YERİNDE belirir ────────────────────────
    // Kenardan kaymıyor: kayma bir yön uydurur ve randevunun geldiği bir yön
    // yok. Listenin itilmesi zaten mümkün olan en yüksek sesli işaret.
    useEffect(() => {
        if (!entering) return;
        if (still) { slot.setValue(1); return; }
        const animation = Animated.timing(slot, {
            toValue: 1,
            duration: MS.move,
            easing: E,
            useNativeDriver: false,
        });
        animation.start();
        return () => animation.stop();
    }, [entering, still, slot]);

    // ── Hâl değişimi ────────────────────────────────────────────────────────
    const sig = `${state.kind}|${state.word}|${state.suffix}|${state.counter}|${state.duration}|${state.dim}`;
    useEffect(() => {
        if (state.kind === shown.kind) {
            // Aynı hâl, yalnız sayılar akıyor: takas yok, kart kıpırdamıyor.
            setShown(state);
            return;
        }
        if (busy.current) return;
        busy.current = true;

        const nextAccent = accentOf(state);
        const nextLadder = ladderOf(state.dim);
        prevAccent.current = accentOf(shown);
        prevLadder.current = ladderOf(shown.dim);

        const hadRow = shown.word != null;
        const hasRow = state.word != null;

        if (still) {
            // Hareketsiz hâlde yükseklik ve çizim ANINDA; yalnız solma kalıyor
            // — anında takas "bir şey bozuldu" gibi okunuyor.
            setShown(state);
            rowH.setValue(hasRow ? M.statusBlock : 0);
            barY.setValue(hasRow ? 1 : 0);
            accentMix.setValue(1);
            dimMix.setValue(1);
            prevAccent.current = nextAccent;
            prevLadder.current = nextLadder;
            busy.current = false;
            return;
        }

        accentMix.setValue(0);
        dimMix.setValue(0);

        const parallel: Animated.CompositeAnimation[] = [
            // Nokta ve sağ hat: AYNI NESNE, yalnız rengi değişiyor.
            Animated.timing(accentMix, {
                toValue: 1, duration: 200, easing: E, useNativeDriver: false,
            }),
            // Sönükleşme eğrisiz — yavaşlayan bir eğri "varış" duygusu verir;
            // kapanma bir varış değil, bir yerleşmedir.
            Animated.timing(dimMix, {
                toValue: 1, duration: MS.dim, easing: Easing.linear, useNativeDriver: false,
            }),
        ];

        if (hadRow !== hasRow) {
            parallel.push(Animated.timing(rowH, {
                toValue: hasRow ? M.statusBlock : 0,
                duration: MS.move, easing: E, useNativeDriver: false,
            }));
            // Sağ hat solmuyor, YUKARIDAN AŞAĞI çiziliyor: 3 × 94 pt'lik bir
            // şeridin bütün olarak belirmesi flaş gibi okunuyor.
            parallel.push(Animated.timing(barY, {
                toValue: hasRow ? 1 : 0,
                delay: hasRow ? 120 : 0,
                duration: MS.move, easing: E_DEC, useNativeDriver: false,
            }));
        }

        const sequence = Animated.sequence([
            Animated.timing(swap, {
                toValue: 0, duration: MS.out, easing: E_IN, useNativeDriver: true,
            }),
            Animated.timing(swap, {
                toValue: 1, duration: MS.in, easing: E, useNativeDriver: true,
            }),
        ]);

        const timer = setTimeout(() => setShown(state), MS.out);
        Animated.parallel([...parallel, sequence]).start(() => {
            prevAccent.current = nextAccent;
            prevLadder.current = nextLadder;
            busy.current = false;
        });

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sig]);

    // ── Eşik nabzı ──────────────────────────────────────────────────────────
    // Nabız yalnız eşikte var; aradaki dakikalarda kart hareketsiz ve sayı
    // sessizce büyümeye devam ediyor.
    useEffect(() => {
        const key = shown.beatKey;
        const previous = prevBeat.current;
        prevBeat.current = key;
        if (key == null || previous == null || key === previous || still) return;

        beat.setValue(0);
        const animation = Animated.timing(beat, {
            toValue: 1, duration: MS.beat, easing: E, useNativeDriver: false,
        });
        animation.start();
        return () => animation.stop();
    }, [shown.beatKey, still, beat]);

    // ── Dakika takası ───────────────────────────────────────────────────────
    // Saniye HAREKETSİZ: rakam yerine yenisi yazılıyor. Saatte 3600 kez
    // hareket eden bir sayı ekrandaki en gürültülü şey olurdu.
    // Dakikada bir olan değişim ise haber değerinde: yalnız EKİN sayısı
    // 90 ms sönüp 90 ms geri geliyor; kelime, nokta ve hat kıpırdamıyor.
    const lastSuffix = useRef(shown.suffix);
    useEffect(() => {
        const previous = lastSuffix.current;
        lastSuffix.current = shown.suffix;
        if (previous == null || shown.suffix == null || previous === shown.suffix) return;
        if (still) return;
        const animation = Animated.sequence([
            Animated.timing(minute, {
                toValue: 0, duration: MS.minute, easing: Easing.linear, useNativeDriver: true,
            }),
            Animated.timing(minute, {
                toValue: 1, duration: MS.minute, easing: Easing.linear, useNativeDriver: true,
            }),
        ]);
        animation.start();
        return () => animation.stop();
    }, [shown.suffix, still, minute]);

    // ── Renkler ─────────────────────────────────────────────────────────────

    const mixColor = (a: string, b: string) => accentMix.interpolate({
        inputRange: [0, 1], outputRange: [a, b],
    });
    const dimColor = (a: string, b: string) => dimMix.interpolate({
        inputRange: [0, 1], outputRange: [a, b],
    });

    const accentAnimated = accent ? mixColor(from, accent) : undefined;
    /** Nabzın parlayan kopyası: taban katmanın üstünde 0 → 1 → 0 sönüyor. */
    const beatFade = beat.interpolate({
        inputRange: [0, 0.48, 1], outputRange: [0, 1, 0],
    });
    const beatScale = beat.interpolate({
        inputRange: [0, 0.48, 1], outputRange: [1, BEAT_SCALE, 1],
    });
    const lit = accent ? brighten(accent, BEAT_LIFT) : undefined;

    const fill = dimColor(fromLadder.fill, ladder.fill);
    const nameColor = dimColor(alpha(textRGB, fromLadder.name), alpha(textRGB, ladder.name));
    const serviceColor = dimColor(alpha(textRGB, fromLadder.service), alpha(textRGB, ladder.service));
    const durColor = dimColor(alpha(textRGB, fromLadder.dur), alpha(textRGB, ladder.dur));
    const counterColor = dark ? c.or : c.or2;

    const { given, family } = splitName(appointment.customer_name);
    const glowing = RINGED.has(shown.kind);

    const body = (
        <Animated.View
            style={{
                borderRadius: small ? M.radiusSm : M.radius,
                backgroundColor: fill,
                overflow: 'hidden',
            }}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={[
                    appointment.start_time,
                    appointment.customer_name,
                    appointment.service,
                    shown.word,
                    shown.suffix,
                    shown.counter ? `${shown.counter} geçti` : shown.duration,
                ].filter(Boolean).join(', ')}
                onPress={onPress}
                style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    gap: small ? 12 : 14,
                    paddingVertical: small ? M.padVSm : M.padV,
                    paddingHorizontal: small ? M.padHSm : M.padH,
                    opacity: pressed ? 0.72 : 1,
                })}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                        <Animated.Text
                            numberOfLines={1}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: small ? M.nameSizeSm : M.nameSize,
                                lineHeight: small ? M.nameLineSm : M.nameLine,
                                fontWeight: '500',
                                letterSpacing: -0.36,
                                color: nameColor,
                                // İptalde çizgi renkten ÖNCE okunur.
                                textDecorationLine: shown.strike ? 'line-through' : 'none',
                            }}
                        >
                            {given}{family ? <Text style={{ fontWeight: '800' }}> {family}</Text> : null}
                        </Animated.Text>

                        {/* Sayaç süreyi DEVRALIR — ikisi aynı anda görünmez. */}
                        <Animated.View style={{ opacity: swap }}>
                            {shown.counter ? (
                                <Text style={[{
                                    fontSize: 15,
                                    fontWeight: '800',
                                    letterSpacing: -0.3,
                                    color: counterColor,
                                }, numeric]}>
                                    {shown.counter}
                                </Text>
                            ) : shown.duration ? (
                                <Animated.Text style={[{
                                    fontSize: 13,
                                    fontWeight: '600',
                                    color: durColor,
                                }, numeric]}>
                                    {shown.duration}
                                </Animated.Text>
                            ) : null}
                        </Animated.View>
                    </View>

                    <Animated.Text
                        numberOfLines={2}
                        style={{
                            marginTop: 4,
                            fontSize: small ? M.serviceSizeSm : M.serviceSize,
                            lineHeight: small ? M.serviceLineSm : M.serviceLine,
                            fontWeight: '500',
                            color: serviceColor,
                        }}
                    >
                        {appointment.service}
                    </Animated.Text>

                    {/* Durum satırı: kart aşağı doğru büyür, üst iki satır
                        hiç kıpırdamaz. */}
                    <Animated.View style={{ height: rowH, overflow: 'hidden' }}>
                        {shown.word && accent ? (
                            <Animated.View style={{
                                marginTop: M.statusGap,
                                height: M.statusHeight,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 7,
                                opacity: swap,
                            }}>
                                <Animated.View style={{
                                    width: 6,
                                    height: 6,
                                    transform: [{ scale: beatScale }],
                                }}>
                                    <Animated.View style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: accentAnimated,
                                    }} />
                                    <Animated.View style={{
                                        position: 'absolute',
                                        width: 6,
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: lit,
                                        opacity: beatFade,
                                    }} />
                                </Animated.View>

                                <View>
                                    <Animated.Text style={{
                                        fontSize: 11.5,
                                        fontWeight: '700',
                                        letterSpacing: 0.69,
                                        color: accentAnimated,
                                    }}>
                                        {upperTR(shown.word)}
                                    </Animated.Text>
                                    <Animated.Text
                                        pointerEvents="none"
                                        style={{
                                            position: 'absolute',
                                            fontSize: 11.5,
                                            fontWeight: '700',
                                            letterSpacing: 0.69,
                                            color: lit,
                                            opacity: beatFade,
                                        }}
                                    >
                                        {upperTR(shown.word)}
                                    </Animated.Text>
                                </View>
                                {shown.suffix ? (
                                    <Animated.Text numberOfLines={1} style={{
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: 12.5,
                                        fontWeight: '500',
                                        color: c.tx2,
                                        opacity: minute,
                                    }}>
                                        {shown.suffix}
                                    </Animated.Text>
                                ) : null}
                            </Animated.View>
                        ) : null}
                    </Animated.View>
                </View>

                {/* Durum işareti: KUTU DEĞİL HAT. Basılabilir bir yüzey
                    izlenimi vermiyor ve dokunulmuyor — kartın tamamı tek
                    hedef, eylem randevu sayfasında yaşıyor. */}
                {accent ? (
                    <Animated.View style={{
                        width: 3,
                        borderRadius: 2,
                        alignSelf: 'stretch',
                        overflow: 'hidden',
                        transform: [{ scaleY: barY }],
                        transformOrigin: 'top',
                    }}>
                        <Animated.View style={{
                            flex: 1,
                            borderRadius: 2,
                            backgroundColor: accentAnimated,
                        }} />
                        {/* GECİKTİ'de sağ hat da vuruyor: halkasız bir kartta
                            ikinci bir tutamağa ihtiyaç var. KAPIDA'da hat
                            sabit — orada nokta ve kelime yetiyor. */}
                        {shown.kind === 'late' ? (
                            <Animated.View style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                borderRadius: 2,
                                backgroundColor: lit,
                                opacity: beatFade,
                            }} />
                        ) : null}
                    </Animated.View>
                ) : null}
            </Pressable>
        </Animated.View>
    );

    const row = (
        <View style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: small ? M.rowGapSm : M.rowGap,
            paddingHorizontal: small ? M.rowPadHSm : M.rowPadH,
            paddingBottom: M.rowPadB,
        }}>
            {/* Saat rayı — kartın İLK SATIRININ optik hizasında. */}
            <Text style={[{
                width: small ? M.railSm : M.rail,
                paddingTop: small ? 16 : 17,
                fontSize: small ? 12.5 : 13.5,
                fontWeight: '600',
                color: c.tx2,
            }, numeric]}>
                {appointment.start_time}
            </Text>
            {glowing ? <GlowRing visible>{body}</GlowRing> : (
                <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
            )}
        </View>
    );

    if (!entering) return row;

    const height = cardSlotHeight(shown.word != null, small);
    return (
        <Animated.View style={{
            height: slot.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
            overflow: 'hidden',
            opacity: slot.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
        }}>
            {row}
        </Animated.View>
    );
}

// ── Şimdi çizgisi ───────────────────────────────────────────────────────────

/** Turuncu saat hapı + saç teli. Ekranda turuncunun iki yerinden biri. */
export function NowLine({ time }: { time: string }) {
    const { c, small } = useTheme();
    return (
        <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Şu an ${time}`}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: small ? M.rowPadHSm : M.rowPadH,
                paddingTop: 2,
                paddingBottom: 10,
            }}
        >
            <View style={{
                height: 24,
                paddingHorizontal: 10,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.or,
            }}>
                <Text style={[{
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: '800',
                    letterSpacing: -0.13,
                }, numeric]}>
                    {time}
                </Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: c.or }} />
        </View>
    );
}

/** Şimdi çizgisinin yüksekliği — yuva bu kadar açılıp kapanıyor. */
export const NOW_LINE_HEIGHT = 36;

/**
 * Çizgi gün boyunca aşağı iniyor ama KARTIN ÜSTÜNDEN GEÇMİYOR — boşluktan
 * boşluğa taşınıyor: eski boşluk kapanırken yeni boşluk açılıyor.
 *
 * Geçilen karta hiçbir şey olmuyor. Çizginin geçmesi bir olay değil, takvimin
 * sonucu; kart tepki verirse personel çizginin hareketine anlam yükler.
 */
export function NowLineSlot({ active, time }: { active: boolean; time: string }) {
    const { reduceMotion } = useTheme();
    const open = useRef(new Animated.Value(active ? 1 : 0)).current;
    const show = useRef(new Animated.Value(active ? 1 : 0)).current;

    useEffect(() => {
        if (reduceMotion !== false) {
            open.setValue(active ? 1 : 0);
            show.setValue(active ? 1 : 0);
            return;
        }
        const animation = Animated.parallel([
            Animated.timing(open, {
                toValue: active ? 1 : 0,
                duration: MS.move,
                easing: E,
                useNativeDriver: false,
            }),
            Animated.timing(show, {
                toValue: active ? 1 : 0,
                delay: active ? 60 : 0,
                duration: active ? MS.in : MS.out,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        ]);
        animation.start();
        return () => animation.stop();
    }, [active, reduceMotion, open, show]);

    return (
        <Animated.View style={{
            height: open.interpolate({ inputRange: [0, 1], outputRange: [0, NOW_LINE_HEIGHT] }),
            overflow: 'hidden',
        }}>
            <Animated.View style={{ opacity: show }}>
                <NowLine time={time} />
            </Animated.View>
        </Animated.View>
    );
}
