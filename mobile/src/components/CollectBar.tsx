import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';

import { Glyph } from './Glyph';
import { feedback } from '../lib/feedback';
import {
    COLLECT_METHODS,
    collectErrorLine,
    collectLabel,
    collectRetryLabel,
    collectView,
    collectedLabel,
    type CollectMethod,
    type CollectStage,
} from '../lib/collect';
import { SEAL_MS, barFoot, barTitle } from '../lib/sendToCash';
import { font, soloDayMetrics as M, useTheme } from '../theme';

/**
 * Kumandanın son adımı, TEK KİŞİLİK modda (108 · v4 K3/K4).
 *
 * ── Neyin yerine geçiyor ────────────────────────────────────────────────────
 * Ekip modunda burada `SendToCash` duruyor: "Adisyonu kasaya gönder". Personel
 * işi kapatır, parayı başkası alır. Tek kişilik modda o başkası yok — aynı
 * kişi hem bitiriyor hem tahsil ediyor ve bilgisayarı da yok. Tasarımın kendi
 * cümlesi: "Değişen yalnız son adım."
 *
 * İki düğme, iki ayrı iş:
 *   Kartla tahsil et → adisyon kasaya gider VE para kaydı yazılır
 *   Sonra tahsil et  → adisyon kasaya gider, para bekler (Gün'de G4 kartı)
 *
 * ── Tutar NEDEN yazmıyor ────────────────────────────────────────────────────
 * Ekran müşterinin gözünün önünde; rakam yukarıda maskeli duruyor ve burada
 * da yazılmıyor. Tutarı sunucu hesaplıyor, kullanıcı rakam girmiyor. Yanlışsa
 * düzeltme yeri Kasa (v4 · C3) — kasiyerin önünde pazarlık ekranı değil.
 *
 * ── Yöntem seçilmeden düğme KAPALI ──────────────────────────────────────────
 * Varsayılan bir yöntem koymak, nakit alınan işi karta yazmanın en kolay yolu
 * olurdu. Kapalı düğme eksiğin ne olduğunu da söylüyor.
 */
export function CollectBar({
    method, stage, paid, errorCode, onPick, onCollect, onLater,
}: {
    method: CollectMethod | null;
    stage: CollectStage;
    /**
     * Sunucunun gerçeği: ziyaret TAHSİL EDİLMİŞ (`cardState` · `paid`).
     * Yerel `stage` her açılışta `idle` başlıyor; bu olmadan tahsil edilmiş
     * bir ziyarette düğme yine "Kartla tahsil et" derdi.
     */
    paid: boolean;
    /** Sunucunun ya da ağın söylediği sebep; `null` "bilinmiyor". */
    errorCode: string | null;
    onPick: (next: CollectMethod) => void;
    onCollect: () => void;
    onLater: () => void;
}) {
    const { c, dark, reduceMotion } = useTheme();

    /*
     * SEÇİLİ ZEMİN KAYIYOR — üç ayrı zemin değil, tek bir parça.
     *
     * Yöntem değişince zemin yeni yönteme yayla kayıyor (yalnız `translateX`,
     * native sürücü). İlk seçimde kaymıyor, yerinde beliriyor: "Nakit"ten
     * gelmiş gibi görünmesin. Seçim yokken zemin yok — varsayılan yöntem
     * olmadığı gibi, varsayılan bir vurgu da yok. "Hareketi azalt"ta anlık.
     */
    const index = COLLECT_METHODS.findIndex((item) => item.key === method);
    const [track, setTrack] = useState(0);
    const [slide] = useState(() => new Animated.Value(Math.max(0, index)));
    const [shown] = useState(() => new Animated.Value(index >= 0 ? 1 : 0));
    const had = useRef(index >= 0);
    useEffect(() => {
        if (index < 0) {
            had.current = false;
            shown.setValue(0);
            return;
        }
        if (reduceMotion || !had.current) {
            had.current = true;
            slide.setValue(index);
            shown.setValue(1);
            return;
        }
        Animated.spring(slide, { toValue: index, useNativeDriver: true, ...M.segSpring }).start();
    }, [index, reduceMotion, shown, slide]);
    // Bir yöntemin genişliği: kabın içi, aralar düşülünce üçe bölünmüş.
    const count = COLLECT_METHODS.length;
    const itemWidth = track > 0 ? (track - 2 - M.segPad * 2 - M.segGap * (count - 1)) / count : 0;

    /*
     * TAHSİLATTAN SONRA — personel kumandasının "Kasaya gönderildi"si gibi.
     *
     *   collected  turuncu düğme yeşile döner, küçük bir vurgu, "Kartla
     *              tahsil edildi". Seçici solar ama YERİNDE durur: düğme
     *              kıpırdamasın. `SEAL_MS` sürer.
     *   paid       sönük yeşil kayıt "Tahsil edildi" ve altında cümlesi.
     *              Kumanda tahsil edilmiş ziyarette yeniden açılınca DOĞRUDAN
     *              bu — ikinci kez tahsil etmeye davet eden düğme yok.
     *
     * Yalnız opaklık ve ölçek, native sürücü. Renk geçişi bir katmanın
     * opaklığı: yeşil, turuncunun üstünde belirir.
     */
    const [settled, setSettled] = useState(false);
    useEffect(() => {
        if (stage !== 'done') return undefined;
        const id = setTimeout(() => setSettled(true), SEAL_MS);
        return () => clearTimeout(id);
    }, [stage]);
    const view = collectView(stage, paid, settled);
    const collected = view === 'collected';
    const [fill] = useState(() => new Animated.Value(0));
    const [pop] = useState(() => new Animated.Value(1));
    useEffect(() => {
        if (!collected) return;
        feedback.success();
        if (reduceMotion) {
            fill.setValue(1);
            return;
        }
        Animated.parallel([
            Animated.timing(fill, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.sequence([
                Animated.spring(pop, { toValue: 1.03, useNativeDriver: true, ...M.paidPop }),
                Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...M.paidSettle }),
            ]),
        ]).start();
    }, [collected, reduceMotion, fill, pop]);

    const busy = stage === 'sending';
    /*
     * PAKETE DAHİL (1.0.1): para alınmıyor — yöntem seçici ve "Sonra tahsil
     * et" YOK. ₺0'lık bir adisyonu "sonra" bırakmak, onu hiç kapanmayacak bir
     * yere bırakmaktı; seçici de alınmayan paranın yolunu sorardı.
     */
    const closing = method === 'package';
    const { enabled } = collectLabel(method);
    const label = collectRetryLabel(stage, method);
    const error = collectErrorLine(stage, errorCode);
    // Gönderim bir kez olduysa "Sonra tahsil et" yapacak bir iş kalmıyor.
    const laterUseful = !closing && stage !== 'collect_failed' && stage !== 'done' && stage !== 'pending';

    // Kalıcı kayıt: dolgudan geliyorsa belirerek, yeniden açılışta olduğu gibi.
    if (view === 'paid') return <PaidPlate appear={settled && !reduceMotion} />;

    return (
        /*
          * TAM GENİŞLİK — `alignSelf: 'stretch'` BURADA, çağırana bırakılmıyor.
          *
          * Kumandanın eylem bölgesi ortalıyor (`alignItems: 'center'`). Bu
          * güverte genişliğini kendisi istemeyince yazısı kadar daralıyordu:
          * seçici ve düğme her seçimde boy değiştiriyor, "Kartla tahsil et"
          * kenara yapışıyordu (2026-10-13, telefon). Ekip modundaki
          * `SendToCash` aynı kuralı kendisi koyuyor.
          */
        <View style={{
            alignSelf: 'stretch',
            marginTop: 'auto',
            paddingBottom: M.collectPadBottom,
            gap: M.collectGap,
        }}>
            {/* Yöntem seçici — `.seg`: üç eşit yöntem, seçili zemin kayıyor.
                Tahsil edilince solar ama yerinde durur. Pakete dahil
                kapanışta yok. */}
            {closing ? null : (
            <Animated.View
                onLayout={(event) => setTrack(event.nativeEvent.layout.width)}
                pointerEvents={collected ? 'none' : 'auto'}
                style={{
                    opacity: fill.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    flexDirection: 'row',
                    padding: M.segPad,
                    gap: M.segGap,
                    borderRadius: M.segRadius,
                    backgroundColor: c.fld,
                    borderWidth: 1,
                    borderColor: c.bd,
                }}
            >
                {itemWidth > 0 ? (
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            top: M.segPad,
                            left: M.segPad,
                            width: itemWidth,
                            height: M.segItemHeight,
                            borderRadius: M.segItemRadius,
                            backgroundColor: dark ? M.segOnDark : c.card,
                            opacity: shown,
                            transform: [{
                                translateX: slide.interpolate({
                                    inputRange: [0, count - 1],
                                    outputRange: [0, (count - 1) * (itemWidth + M.segGap)],
                                }),
                            }],
                        }}
                    />
                ) : null}
                {COLLECT_METHODS.map((item) => {
                    const on = item.key === method;
                    return (
                        <Pressable
                            key={item.key}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={`Ödeme yöntemi: ${item.label}`}
                            disabled={busy}
                            onPress={() => { feedback.selection(); onPick(item.key); }}
                            style={({ pressed }) => ({
                                flex: 1,
                                height: M.segItemHeight,
                                borderRadius: M.segItemRadius,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text style={{
                                color: on ? c.tx : c.tx2,
                                fontSize: M.segText,
                                fontFamily: font.bold,
                                fontWeight: '700',
                            }}>
                                {item.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </Animated.View>
            )}

            {/*
              * SEBEP DÜĞMENİN HEMEN ÜSTÜNDE (v4 · K4).
              *
              * "Ekran sunucu kabul etmeden değişmez. Ret sebebi kullanıcının
              * baktığı yerde." Üstte bir bildirim şeridi olsaydı, parmağı
              * düğmede olan kişi onu hiç görmezdi.
              */}
            {error ? (
                <View style={{
                    flexDirection: 'row',
                    gap: M.errGap,
                    paddingHorizontal: M.errPadX,
                    alignItems: 'flex-start',
                }}>
                    <View style={{ paddingTop: 1 }}>
                        <Glyph name="warn" size={M.errIcon} color={c.rd} />
                    </View>
                    <Text style={{
                        flex: 1,
                        color: c.rd,
                        fontSize: M.errText,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: M.errText * M.errLine,
                    }}>
                        {error}
                    </Text>
                </View>
            ) : null}

            <Animated.View style={{ transform: [{ scale: pop }] }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !enabled || busy || collected, busy }}
                    accessibilityLabel={collected ? collectedLabel(method) : label}
                    disabled={!enabled || busy || collected}
                    onPress={() => { feedback.light(); onCollect(); }}
                    style={({ pressed }) => ({
                        height: M.payHeight,
                        borderRadius: M.payRadius,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: M.payGap,
                        overflow: 'hidden',
                        backgroundColor: enabled ? c.or : c.fld,
                        borderWidth: enabled ? 0 : M.payBorder,
                        borderColor: c.bd2,
                        opacity: pressed && !collected ? 0.9 : 1,
                    })}
                >
                    {/* Yeşil dolgu turuncunun ÜSTÜNDE belirir — renk geçişi bir opaklık. */}
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
                            backgroundColor: c.gr,
                            opacity: fill,
                        }}
                    />
                    {busy ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Glyph name={collected ? 'check' : 'cash'} size={M.payIcon} color={enabled ? '#FFFFFF' : c.tx3} />
                    )}
                    <Text numberOfLines={1} style={{
                        color: enabled ? '#FFFFFF' : c.tx3,
                        fontSize: M.payText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: M.payText * M.payTrack,
                    }}>
                        {busy ? 'Kaydediliyor…' : collected ? collectedLabel(method) : label}
                    </Text>
                </Pressable>
            </Animated.View>

            {/*
              * "SONRA TAHSİL ET" bir vazgeçme değil, geçerli bir iş: müşteri
              * parayı sonra verecek. Adisyon açık kalıyor ve Gün'de kart
              * "ADİSYON AÇIK"a dönüyor — kaybolmuyor, hatırlatıyor.
              *
              * Tahsilat denenip düştükten SONRA çizilmiyor: gönderim o anda
              * zaten olmuştu, yapacağı bir iş kalmadı ve basılınca hiçbir şey
              * olmayan bir düğme olurdu.
              */}
            {laterUseful ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sonra tahsil et"
                    accessibilityHint="Adisyon açık kalır, Gün ekranında hatırlatılır"
                    disabled={busy}
                    onPress={() => { feedback.selection(); onLater(); }}
                    style={({ pressed }) => ({
                        height: M.ghostHeight,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                    })}
                >
                    <Text style={{
                        color: c.tx2,
                        fontSize: M.ghostText,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        Sonra tahsil et
                    </Text>
                </Pressable>
            ) : collected ? (
                // Dolgu anında "Sonra tahsil et"in yeri boş kalıyor: düğme
                // yerinden kaymasın, mühre dönerken kayıt aynı yerde dursun.
                <View style={{ height: M.ghostHeight }} />
            ) : null}
        </View>
    );
}

/**
 * Tahsil edilmiş ziyaretin KALICI kaydı — personel kumandasının mührüyle
 * aynı dil (`SendToCash` · `paid`): sönük yeşil çerçeve, küçük punto, altında
 * cümlesi. Yeşil DOLGU "az önce oldu" demek ve yalnız `SEAL_MS` yaşıyor;
 * bu ise saatler sonra açılan kumandada da aynı kalıyor. Düğme değil, cümle.
 */
function PaidPlate({ appear }: { appear: boolean }) {
    const { c } = useTheme();
    const [enter] = useState(() => new Animated.Value(appear ? 0 : 1));
    useEffect(() => {
        if (!appear) return;
        Animated.timing(enter, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [appear, enter]);
    const foot = barFoot('paid');
    return (
        <Animated.View
            accessible
            accessibilityLabel={`${barTitle('paid')}. ${foot ?? ''}`}
            style={{
                alignSelf: 'stretch',
                marginTop: 'auto',
                paddingBottom: M.collectPadBottom,
                gap: 9,
                opacity: enter,
            }}
        >
            <View style={{
                height: M.payHeight,
                borderRadius: M.payRadius,
                borderWidth: 1,
                borderColor: M.paidBorder,
                backgroundColor: M.paidFill,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
            }}>
                <Glyph name="check" size={M.paidIcon} color={c.gr} />
                <Text style={{ color: c.gr, fontSize: M.paidText, fontFamily: font.bold, fontWeight: '700' }}>
                    {barTitle('paid')}
                </Text>
            </View>
            {foot ? (
                <Text style={{
                    paddingHorizontal: 8,
                    textAlign: 'center',
                    color: c.tx3,
                    fontSize: M.paidFoot,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    lineHeight: M.paidFoot * 1.45,
                }}>
                    {foot}
                </Text>
            ) : null}
        </Animated.View>
    );
}
