/**
 * Personel 11 · Kasaya gönderme — eylem bölgesi.
 *
 * PROJEDE reanimated'İN İLK KULLANIMI. Paket bu an için kuruldu
 * (`docs/personel-11-kasaya-gonderme.md` §0): burada renk ve YÜKSEKLİK
 * gerçekten animasyonlanıyor, çünkü düğme 64'ten 84 pt'ye açılırken içine
 * ikinci bir satır ve 96 pt'lik bir kapı alıyor. RN'in kendi `Animated`'iyle
 * bu geçiş JS köprüsünden geçerdi.
 *
 * Yazılmış ekranlar taşınmıyor — kadran, halka, kaydırma çubuğu ve para
 * maskesi hâlâ RN `Animated` ile çiziliyor ve öyle kalıyor.
 *
 * Fitil PARA MASKESİNDEN ödünç: aynı amber, aynı 6 saniye, aynı yönde erime.
 * Personel o şeridi "kendi kendine kapanacak" diye okumayı zaten öğrendi.
 */

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    Easing,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import { Glyph } from './Glyph';
import { feedback } from '../lib/feedback';
import {
    WINDOW_MS, barFoot, barTitle, canUndo, secondsLeft, windowLine,
    type SendState,
} from '../lib/sendToCash';
import { font, numeric, useTheme } from '../theme';

const M = {
    height: 64, heightSm: 60,
    open: 84, openSm: 76,
    radius: 22,
    undoWidth: 96, undoWidthSm: 84,
    fuse: 2.5,
} as const;

/** Renk geçişinin kaynağı: her hâlin kendi durağı. */
const STOP = { idle: 0, window: 1, done: 2 } as const;

export function SendToCash({ state, at, errorWord, small, reduceMotion, onSend, onUndo }: {
    state: SendState;
    /** `sealed` hâlinde başlıkta yazan saat. */
    at?: string;
    errorWord?: string;
    small: boolean;
    reduceMotion: boolean;
    onSend: () => void;
    onUndo: () => void;
}) {
    const { c } = useTheme();
    const height: number = small ? M.heightSm : M.height;
    const open: number = small ? M.openSm : M.open;

    const windowOpen = state === 'window';
    const going = state === 'going';
    const done = state === 'sent';
    /**
     * Renk durağı HÂLDEN türüyor.
     *
     * Önce tek bir `done` bayrağından türüyordu ve iki hâl sessizce turuncuya
     * düşüyordu: `going` (istek yolda) ve `sealed` (mühür). Turuncu bu üründe
     * EYLEM demek — ikisinde de yapılacak bir şey yok.
     */
    const stopOf = windowOpen || going ? STOP.window : done ? STOP.done : STOP.idle;

    // ── Paylaşılan değerler ────────────────────────────────────────────────
    const stop = useSharedValue<number>(STOP.idle);
    const box = useSharedValue(height);
    const press = useSharedValue(1);
    const pop = useSharedValue(1);
    const fuse = useSharedValue(1);

    /*
     * `react-hooks/immutability` reanimated'in paylaşılan değerlerini bilmiyor:
     * `sv.value = ...` kütüphanenin TEK yazma yolu ve efekt içinde yapılması
     * doğru kullanım. Kural bu dosyada kapalı; başka hiçbir yerde değil.
     */
    /* eslint-disable react-hooks/immutability */
    useEffect(() => {
        const instant = reduceMotion;
        stop.value = instant ? stopOf : withTiming(stopOf, { duration: done ? 220 : 180 });
        box.value = instant
            ? (windowOpen ? open : height)
            : withSpring(windowOpen ? open : height, { damping: 20, stiffness: 210 });
        if (done && !instant) {
            // Tek vurgu, tek kez. Yeşil dolgu yalnız burada.
            pop.value = withSequence(withSpring(1.03, { damping: 14 }), withSpring(1, { damping: 18 }));
        }
    }, [windowOpen, done, stopOf, reduceMotion, height, open, stop, box, pop]);

    useEffect(() => {
        if (!windowOpen) { fuse.value = 1; return; }
        fuse.value = 1;
        // reduceMotion'da fitil ÇİZİLMİYOR ama süre işlemeye devam ediyor:
        // sayaç aşağıdaki `left` ile ayrıca akıyor.
        if (reduceMotion) return;
        fuse.value = withTiming(0, { duration: WINDOW_MS, easing: Easing.linear });
    }, [windowOpen, reduceMotion, fuse]);

    /*
     * Rakam ve fitil AYNI kaynaktan türüyor: pencerenin açıldığı an. Fitil
     * native sürücüde erirken rakam JS'te saniyede bir düşüyor; ikisi de aynı
     * `began` damgasından hesaplandığı için asla ayrışmıyorlar.
     *
     * Rakamı da paylaşılan değerden okumak `react-native-redash` isterdi ve
     * saniyede dört kare için bir paket kurmaya değmez.
     */
    const [left, setLeft] = useState(WINDOW_MS / 1000);
    useEffect(() => {
        if (!windowOpen) return undefined;
        const began = Date.now();
        setLeft(secondsLeft(began, began));
        const id = setInterval(() => setLeft(secondsLeft(began, Date.now())), 250);
        return () => clearInterval(id);
    }, [windowOpen]);

    /* eslint-enable react-hooks/immutability */

    const skin = useAnimatedStyle(() => ({
        height: box.value,
        transform: [{ scale: press.value * pop.value }],
        backgroundColor: interpolateColor(
            stop.value,
            [STOP.idle, STOP.window, STOP.done],
            [c.or, 'rgba(217,164,59,0.16)', c.gr],
        ),
        borderColor: interpolateColor(
            stop.value,
            [STOP.idle, STOP.window, STOP.done],
            ['rgba(0,0,0,0)', 'rgba(217,164,59,0.42)', 'rgba(0,0,0,0)'],
        ),
    }));

    const fuseStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fuse.value }] }));

    const foot = barFoot(state);

    // ── Gövde ──────────────────────────────────────────────────────────────
    if (state === 'queued' || state === 'error') {
        return <Frozen state={state} at={at} errorWord={errorWord} small={small} foot={foot} />;
    }

    /*
     * Mühür AYRI bir gövde, rengin son durağı değil. Yeşil DOLGU "az önce
     * oldu" demek ve 2.6 saniye yaşıyor; mühür kalıcı bir kayıt, o yüzden
     * sönük çerçeve ve küçük punto. İkisi aynı yeşille çizilseydi ekran
     * saatlerce "az önce oldu" demeye devam ederdi.
     */
    if (state === 'sealed') {
        return (
            <View style={{ alignSelf: 'stretch', gap: 9 }}>
                <View style={{
                    height: small ? M.heightSm : M.height,
                    borderRadius: M.radius,
                    borderWidth: 1,
                    borderColor: 'rgba(95,191,100,0.30)',
                    backgroundColor: 'rgba(95,191,100,0.10)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                }}>
                    <Glyph name="check" size={16} color={c.gr} />
                    <Text style={{ color: c.gr, fontSize: 15, fontFamily: font.bold, fontWeight: '700' }}>
                        {barTitle(state, at)}
                    </Text>
                </View>
                {foot ? <Foot tone="tx3">{foot}</Foot> : null}
            </View>
        );
    }

    const body = (
        <>
            {windowOpen ? (
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ color: c.am, fontSize: 17.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: -0.35 }}>
                        {barTitle(state)}
                    </Text>
                    <Text style={{ color: c.tx2, fontSize: 12.5, fontFamily: font.semiBold, fontWeight: '600' }}>
                        {windowLine(left, reduceMotion, small).split(String(left)).map((part, index, all) => (
                            <Text key={index}>
                                {part}
                                {index < all.length - 1 ? (
                                    <Text style={[{ color: c.am, fontFamily: font.extraBold, fontWeight: '800' }, numeric]}>
                                        {left}
                                    </Text>
                                ) : null}
                            </Text>
                        ))}
                    </Text>
                </View>
            ) : going ? (
                <>
                    <Pulse reduceMotion={reduceMotion} />
                    <Text style={{ color: c.am, fontSize: small ? 17 : 18, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: -0.36 }}>
                        {barTitle(state)}
                    </Text>
                </>
            ) : (
                <>
                    <Glyph name={done ? 'check' : 'cash'} size={21} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: small ? 17 : 18, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: -0.36 }}>
                        {barTitle(state, at)}
                    </Text>
                </>
            )}
        </>
    );

    return (
        // `alignSelf: 'stretch'` BURADA, çağırana bırakılmıyor: eylem bölgesi
        // ortalayan bir kap ve dolgusuz bir düğme orada iki piksellik dikey
        // bir şeride çöküyor. Genişlik bu bileşenin kendi sözü.
        <View style={{ alignSelf: 'stretch', gap: 9 }}>
            <Animated.View
                style={[{
                    borderRadius: M.radius,
                    borderWidth: 1.5,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: windowOpen ? 'flex-start' : 'center',
                    gap: windowOpen ? 12 : 10,
                    paddingLeft: windowOpen ? 18 : 0,
                    paddingRight: windowOpen ? 8 : 0,
                    overflow: 'hidden',
                }, skin]}
            >
                {state === 'idle' ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Adisyonu kasaya gönder"
                        onPressIn={() => {
                            if (reduceMotion) return;
                            // eslint-disable-next-line react-hooks/immutability
                            press.value = withTiming(0.985, { duration: 90, easing: Easing.linear });
                        }}
                        // eslint-disable-next-line react-hooks/immutability
                        onPressOut={() => { press.value = withTiming(1, { duration: 90, easing: Easing.linear }); }}
                        onPress={() => { feedback.medium(); onSend(); }}
                        style={{
                            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                        }}
                    >
                        {body}
                    </Pressable>
                ) : body}

                {canUndo(state) ? (
                    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Kasaya göndermeyi geri al"
                            onPress={() => { feedback.medium(); onUndo(); }}
                            style={({ pressed }) => ({
                                minWidth: small ? M.undoWidthSm : M.undoWidth,
                                height: small ? 56 : 64,
                                paddingHorizontal: 16,
                                borderRadius: 17,
                                backgroundColor: c.fld,
                                borderWidth: 1,
                                borderColor: c.bd2,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 7,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Glyph name="undo" size={18} color={c.tx} />
                            <Text style={{ color: c.tx, fontSize: small ? 14.5 : 15, fontFamily: font.extraBold, fontWeight: '800' }}>
                                Geri al
                            </Text>
                        </Pressable>
                    </Animated.View>
                ) : null}

                {/* Fitil: reduceMotion'da hiç çizilmiyor, süre yerine rakam akıyor. */}
                {windowOpen && !reduceMotion ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: M.fuse,
                            backgroundColor: c.am,
                            transformOrigin: 'left',
                        }, fuseStyle]}
                    />
                ) : null}
            </Animated.View>

            {foot ? <Foot tone="tx3">{foot}</Foot> : null}
        </View>
    );
}

/**
 * Kuyruk ve hata: hareketsiz hâller.
 *
 * `queued` amber ÇERÇEVE — dolgu yok, çünkü dolgu bu üründe "bitti" demek.
 * `error` kırmızı ve TİTREMİYOR: kötü haberi duyurmak için sallanan bir
 * kutu, cümlenin kendisinden daha az şey anlatıyor.
 */
function Frozen({ state, at, errorWord, small, foot }: {
    state: SendState;
    at?: string;
    errorWord?: string;
    small: boolean;
    foot: string | null;
}) {
    const { c } = useTheme();
    const bad = state === 'error';
    const tone = bad ? c.rd : c.am;
    return (
        <View style={{ alignSelf: 'stretch', gap: 9 }}>
            <View style={{
                height: small ? M.heightSm : M.height,
                borderRadius: M.radius,
                borderWidth: 1.5,
                borderColor: bad ? 'rgba(224,114,114,0.50)' : 'rgba(217,164,59,0.50)',
                backgroundColor: bad ? 'rgba(224,114,114,0.09)' : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                paddingHorizontal: 18,
            }}>
                <Glyph name={bad ? 'warn' : 'queue'} size={21} color={tone} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text numberOfLines={1} style={{ color: tone, fontSize: 16.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: -0.33 }}>
                        {barTitle(state, at)}
                    </Text>
                    <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 12.5, fontFamily: font.semiBold, fontWeight: '600' }}>
                        {bad ? errorWord : 'sinyal gelince gidecek'}
                    </Text>
                </View>
            </View>
            {foot ? <Foot tone={bad ? 'rd' : 'am'}>{foot}</Foot> : null}
        </View>
    );
}

/**
 * Üç nokta — istek yolda.
 *
 * Halka DEĞİL: halka bu üründe bekleme sayacının işi ve 238 pt'lik bir
 * kahraman. Buradaki bekleme bir saniyeden kısa; nefes alan üç nokta
 * "duruyorum" değil "sürüyor" diyor ve gözü kendine çekmiyor.
 */
function Pulse({ reduceMotion }: { reduceMotion: boolean }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 160, 320].map((delay) => (
                <Dot key={delay} delay={delay} color={c.am} still={reduceMotion} />
            ))}
        </View>
    );
}

function Dot({ delay, color, still }: { delay: number; color: string; still: boolean }) {
    const life = useSharedValue(0.28);
    /* eslint-disable react-hooks/immutability -- bkz. dosya başındaki not */
    useEffect(() => {
        if (still) { life.value = 1; return; }
        life.value = withDelay(delay, withRepeat(
            withSequence(
                withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
                withTiming(0.28, { duration: 600, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
        ));
    }, [delay, still, life]);
    /* eslint-enable react-hooks/immutability */
    const style = useAnimatedStyle(() => ({ opacity: life.value }));
    return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, style]} />;
}

function Foot({ tone, children }: { tone: 'tx3' | 'am' | 'rd'; children: string }) {
    const { c } = useTheme();
    return (
        <Text style={{
            paddingHorizontal: 8,
            fontSize: 11.5,
            fontFamily: font.semiBold,
            fontWeight: '600',
            lineHeight: 11.5 * 1.45,
            color: tone === 'tx3' ? c.tx3 : tone === 'am' ? 'rgba(217,164,59,0.8)' : 'rgba(224,114,114,0.8)',
        }}>
            {children}
        </Text>
    );
}
