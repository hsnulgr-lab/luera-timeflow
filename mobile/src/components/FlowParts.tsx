import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { ActionPill } from './ActionPill';
import { pillCells, pillOff, pillOpens, type CellKey, type PillRecord } from '../lib/actionPill';
import { splitStaffName, upperTR } from '../lib/text';
import { elapsed } from '../lib/calendar';
import {
    actionsOf, contextRows, durationBadge, etaColumn, etaPanel, initialsOf,
    isLate, isSettled, labelOf, nextCardKind, nextRowLabel, staffConflict, toneOf,
    dueCard, dueLevel, noshowCard, noshowRowLabel, paidCard, paidLine, waitCard,
    bookedCard, cancelledCard,
    nextSlots, pillInputOf, pillRecordOf, overrunLine,
    type FlowEvent, type StaffPresence,
    type WaitAction, type WaitCard as WaitCardModel,
} from '../lib/managerFlow';
import {
    actionPillMetrics, cardSkin, cardSwap, customerBubble, dueCardMetrics, flowMetrics, font, nextCardMetrics, numeric, onAccent, panelInk,
    pressMotion, radius, staffDayMotion, swapInCurve, swapOutCurve, useTheme, waitCardMetrics, type PanelInk,
} from '../theme';

/**
 * Müdür ana ekranının üç katmanı: personel şeridi, özet şeridi, olay akışı.
 *
 * Hiçbiri CAM DEĞİL. Tasarımın notu açık: "Başlık, personel şeridi, özet
 * şeridi ve akış satırları opak — bulanık zemin üstünde rakam okunmaz."
 * Camlı olan yalnız tab bar.
 */

// ── Müşteri balonu ──────────────────────────────────────────────────────────

/**
 * Akışta müşteri kartına açılan tek kapı.
 *
 * Baş harf yuvarlağı hem kimliği söyler hem "burası basılır" der; ayrı bir ok
 * ya da "detay" etiketi çizilmez — akışta okunan asıl şey olayın kendisi,
 * müşteri ikinci sırada durur.
 *
 * Müşteri kimliği YOKSA balon hiç çizilmez: basılınca hiçbir şey açmayan bir
 * daire, olmayan bir daireden kötüdür.
 */
export function CustomerBubble({ event, onOpen, children }: {
    event: FlowEvent;
    onOpen?: (event: FlowEvent) => void;
    /** Adın kendisi — balonla aynı dokunma hedefinde durur. */
    children: ReactNode;
}) {
    const { c, small } = useTheme();
    const size = small ? customerBubble.sizeSmall : customerBubble.size;
    const openable = Boolean(event.customerId && onOpen);

    const ring = (
        <View style={{
            width: size,
            height: size,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.surf2,
            borderWidth: customerBubble.border,
            borderColor: c.bd2,
        }}>
            <Text style={{
                color: c.tx,
                fontSize: small ? customerBubble.textSmall : customerBubble.text,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: (small ? customerBubble.textSmall : customerBubble.text) * -0.02,
            }}>
                {initialsOf(event)}
            </Text>
        </View>
    );

    if (!openable) {
        return (
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: customerBubble.gap,
                minWidth: 0,
            }}>
                {ring}
                <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
            </View>
        );
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${event.firstName} ${event.lastName} · müşteri kartını aç`}
            hitSlop={customerBubble.hitSlop}
            onPress={() => { feedback.selection(); onOpen?.(event); }}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: customerBubble.gap,
                minWidth: 0,
                opacity: pressed ? pressMotion.ghostOpacity : 1,
            })}
        >
            {ring}
            <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        </Pressable>
    );
}

// ── Personel şeridi ─────────────────────────────────────────────────────────

/**
 * Instagram'ın hikâye şeridi, ama halka "yeni içerik var" demiyor — DURUM
 * diyor. Turuncu dolu = şu an işlemde (içinde geçen süre), yeşil = müsait,
 * kesik çizgi = izinli, gri = bugün çalışmıyor.
 *
 * Durum hem renkle hem KELİMEYLE yazılıyor: renk tek başına anlam taşımaz.
 */
export function StaffStrip({ people, onOpen, compact = false }: {
    people: readonly StaffPresence[];
    onOpen?: (id: string) => void;
    /** Kaydırılmış hâlde şerit daralır; ekranın üstünü boğmasın. */
    compact?: boolean;
}) {
    const { c, small, reduceMotion } = useTheme();
    const size = small ? flowMetrics.ringSmall : flowMetrics.ring;

    /*
     * 1. hareket anının ÇIKAN yarısı. Sayfa şeritteki halkadan doğuyor;
     * o yüzden şerit dokunulunca yerinde büyüyerek söner (160 ms), sonra
     * personel günü açılır ve orada kahraman halka 0.684'ten 1'e büyür.
     * Yığın kaydırması bu ekranda kapalı, yoksa büyüme görünmezdi.
     */
    const exit = useRef(new Animated.Value(1)).current;
    useFocusEffect(useCallback(() => { exit.setValue(1); }, [exit]));

    const open = useCallback((id: string) => {
        if (!onOpen) return;
        if (reduceMotion) { onOpen(id); return; }
        Animated.timing(exit, {
            toValue: 0,
            duration: staffDayMotion.enter.stripOut,
            easing: Easing.bezier(0.4, 0, 1, 1),
            useNativeDriver: true,
        }).start(() => {
            onOpen(id);
            /*
             * Şeridi HEMEN dinlenme hâline al. Geride opacity 0'da bırakılırsa
             * geri dönüşte önce yığının anlık görüntüsü (şerit görünür), sonra
             * canlı ekran (şerit sönük), sonra sıçrayarak geri gelme görünüyor
             * — kullanıcı bunu "halkalar iki kez yüklendi" diye okuyor.
             */
            exit.setValue(1);
        });
    }, [exit, onOpen, reduceMotion]);

    const border = (state: StaffPresence['state']) => {
        if (state === 'busy') return { borderColor: c.or, borderWidth: flowMetrics.ringBorderBusy };
        if (state === 'free') return { borderColor: c.gr, borderWidth: flowMetrics.ringBorder };
        if (state === 'leave') {
            return { borderColor: c.am, borderWidth: flowMetrics.ringBorder, borderStyle: 'dashed' as const };
        }
        return { borderColor: c.bd2, borderWidth: flowMetrics.ringBorder };
    };

    const word = (state: StaffPresence['state']) => (
        state === 'busy' ? 'işlemde'
            : state === 'free' ? 'müsait'
                : state === 'leave' ? 'izinli' : 'çalışmıyor'
    );

    return (
        <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
                opacity: exit,
                transform: [{
                    scale: exit.interpolate({
                        inputRange: [0, 1],
                        outputRange: [staffDayMotion.enter.stripScale, 1],
                    }),
                }],
            }}
            contentContainerStyle={{
                gap: flowMetrics.stripGap,
                paddingHorizontal: flowMetrics.stripX,
                paddingTop: compact ? flowMetrics.stripYCompact : flowMetrics.stripY,
                paddingBottom: compact ? flowMetrics.stripYCompact : flowMetrics.stripBottom,
            }}
        >
            {people.map((person) => (
                <StaffAvatar
                    key={person.id}
                    label={`${person.name} · ${word(person.state)}`}
                    dim={person.state === 'off'}
                    onPress={() => open(person.id)}
                >
                    <View style={{
                        width: size,
                        height: size,
                        borderRadius: radius.pill,
                        backgroundColor: c.surf2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...border(person.state),
                    }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: flowMetrics.ringText,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: flowMetrics.ringText * -0.02,
                        }}>
                            {person.initials}
                        </Text>

                        {person.state === 'busy' && person.minutes != null ? (
                            <View style={{
                                position: 'absolute',
                                bottom: flowMetrics.badgeOffset,
                                height: flowMetrics.badgeHeight,
                                paddingHorizontal: flowMetrics.badgeX,
                                borderRadius: radius.pill,
                                backgroundColor: c.or,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Text style={{
                                    color: '#FFFFFF',
                                    fontSize: flowMetrics.badgeText,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                    ...numeric,
                                }}>
                                    {durationBadge(person.minutes)}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <Text numberOfLines={1} style={{
                        maxWidth: flowMetrics.itemWidth,
                        color: c.tx,
                        fontSize: flowMetrics.nameSize,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {splitStaffName(person.name).given}
                    </Text>
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: flowMetrics.stateSize,
                        fontFamily: font.medium,
                        fontWeight: '600',
                    }}>
                        {word(person.state)}
                    </Text>
                </StaffAvatar>
            ))}
        </Animated.ScrollView>
    );
}

/**
 * Şeritteki dokunma hedefi ve BASMA TEPKİSİ.
 *
 * Şeridin dokunulabilir olduğunu söyleyen görsel bir işaret yok — Instagram'ın
 * hikâye şeridinde de yok, ama o kalıbı milyarlarca insan biliyor, bizim
 * kitlemiz bilmiyor. Chevron ya da başlık eklemek tasarımda olmayan bir öğe
 * getirirdi; bunun yerine parmak değdiği an cevap veriyor.
 *
 * Hareket sözleşmesi 02: yalnız opaklık ve ölçek, native sürücüde.
 */
function StaffAvatar({ label, dim, onPress, children }: {
    label: string;
    dim: boolean;
    onPress: () => void;
    children: ReactNode;
}) {
    const { reduceMotion } = useTheme();
    const press = useRef(new Animated.Value(0)).current;

    const run = (pressed: boolean) => {
        press.stopAnimation();
        Animated.timing(press, {
            toValue: pressed ? 1 : 0,
            duration: reduceMotion ? pressMotion.reduced : pressed ? pressMotion.in : pressMotion.out,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    const base = dim ? flowMetrics.dimOpacity : 1;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPressIn={() => run(true)}
            onPressOut={() => run(false)}
            onPress={() => { feedback.selection(); onPress(); }}
        >
            <Animated.View style={{
                width: flowMetrics.itemWidth,
                alignItems: 'center',
                gap: flowMetrics.itemGap,
                opacity: press.interpolate({
                    inputRange: [0, 1],
                    outputRange: [base, base * pressMotion.primaryOpacity],
                }),
                transform: [{
                    scale: press.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, reduceMotion ? 1 : pressMotion.primaryScale],
                    }),
                }],
            }}>
                {children}
            </Animated.View>
        </Pressable>
    );
}

// ── Özet şeridi ─────────────────────────────────────────────────────────────

/**
 * Üç rakam, TEK SATIR — kart ızgarası değil. Kart ızgarası telefonda üç küçük
 * kutuya bölünüp okunmaz hâle gelirdi; burada rakam büyük, etiket küçük.
 */
export function StatLine({ items, onOpen }: {
    items: readonly { value: string; label: string }[];
    onOpen?: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Günün özeti — raporu aç"
            onPress={() => { feedback.selection(); onOpen?.(); }}
            style={{
                flexDirection: 'row',
                backgroundColor: c.surf,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: c.bd,
            }}
        >
            {items.map((item, index) => (
                <View key={item.label} style={{
                    flex: 1,
                    gap: flowMetrics.statGap,
                    paddingVertical: flowMetrics.statY,
                    paddingHorizontal: flowMetrics.statX,
                    borderRightWidth: index === items.length - 1 ? 0 : 1,
                    borderColor: c.bd,
                }}>
                    <Num size={flowMetrics.statValue} style={{
                        color: c.tx,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: flowMetrics.statValue * -0.035,
                    }}>
                        {item.value}
                    </Num>
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: flowMetrics.statLabel,
                        fontFamily: font.medium,
                        fontWeight: '600',
                        letterSpacing: flowMetrics.statLabel * 0.08,
                    }}>
                        {upperTR(item.label)}
                    </Text>
                </View>
            ))}
        </Pressable>
    );
}

// ── Olay akışı ──────────────────────────────────────────────────────────────

function KindDot({ tone }: { tone: ReturnType<typeof toneOf> }) {
    const { c } = useTheme();
    const fill = tone === 'orange' ? c.or
        : tone === 'green' ? c.gr
            : tone === 'amber' ? c.am
                : tone === 'red' ? c.rd : c.tx3;
    const r = flowMetrics.dot / 2;
    return (
        <Svg width={flowMetrics.dot} height={flowMetrics.dot}>
            <Circle cx={r} cy={r} r={r} fill={fill} />
        </Svg>
    );
}

/**
 * Gömülü canlı işlem şeridi — akışın "işlem başladı" satırının içinde.
 *
 * İKİ TEMADA DA KREM. Takvim'in gömülü kartı sayfanın tersidir (açık sayfada
 * koyu, koyu sayfada açık); buradaki öyle değil, tasarımda tema varyantı yok.
 * Kontrast oyunu bu kartla korunuyor: akışın en canlı satırı en çok ayrışan
 * yüzeyi taşıyor.
 *
 * Nokta nabız gibi atar — çalışan tek animasyon bu. Hareket azaltılmışsa
 * durur ve tam opaklıkta kalır: "sürüyor" bilgisi harekete emanet edilmez.
 */
function LiveStrip({ event, enter = false }: {
    event: FlowEvent;
    /**
     * BEKLİYOR → SÜRÜYOR dönüşümü: personel işlemi BU OTURUMDA başlattı.
     *
     * Takas değil DÖNÜŞÜM. Kart aynı kart — yüzey, yarıçap, dolgu ve kartın
     * yeri sabit; yalnız içerik değişir. Bekleme kartı da bu ölçüleri
     * paylaştığı için gözde tek bir kart dönüşmüş gibi okunur.
     */
    enter?: boolean;
}) {
    const { c, dark, reduceMotion } = useTheme();
    // Gömülü kahraman panel: SAYFANIN TERSİ düzlem. Koyu temada krem,
    // aydınlıkta koyu. Eskiden iki temada da kremdi; aydınlıkta krem sayfa
    // üstünde krem panel düzlem değiştirmediği için yıkanıp kayboluyordu.
    const ink = dark ? panelInk.dark : panelInk.light;
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (reduceMotion) {
            pulse.stopAnimation();
            pulse.setValue(1);
            return;
        }
        const animation = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 0.35, duration: 800, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]));
        animation.start();
        return () => animation.stop();
    }, [pulse, reduceMotion]);

    // Kartın kendisi CardSwap ile soldurulup giriyor; burada YALNIZ personel
    // hapı var. Tasarımın M6'sında ayrı bir ölçüsü olan tek parça o: sağdan
    // kayarak girer, çünkü "kim çalışıyor" bilgisi beklemede yoktu.
    const morph = useRef(new Animated.Value(enter && !reduceMotion ? 0 : 1)).current;
    useEffect(() => {
        if (!enter || reduceMotion) { morph.setValue(1); return; }
        Animated.timing(morph, {
            toValue: 1,
            duration: waitCardMetrics.morphPill,
            easing: Easing.bezier(...swapInCurve),
            useNativeDriver: true,
        }).start();
    }, [enter, morph, reduceMotion]);

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: flowMetrics.liveGap,
            padding: flowMetrics.livePadding,
            borderRadius: flowMetrics.liveRadius,
            backgroundColor: ink.panel,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: flowMetrics.liveInnerGap }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Animated.View style={{
                        width: flowMetrics.liveDot,
                        height: flowMetrics.liveDot,
                        borderRadius: radius.pill,
                        backgroundColor: c.or,
                        opacity: pulse,
                    }} />
                    <Text style={{
                        color: ink.ink2,
                        fontSize: flowMetrics.liveLabel,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: flowMetrics.liveLabel * 0.06,
                    }}>
                        {upperTR('sürüyor')}
                    </Text>
                </View>

                <Num
                    fit
                    size={flowMetrics.liveCounter}
                    style={{
                        color: ink.ink,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: flowMetrics.liveCounter * -0.04,
                        lineHeight: flowMetrics.liveCounter,
                    }}
                >
                    {elapsed(event.elapsedSeconds ?? 0)}
                </Num>

                {/* SÜRE AŞIMI — BİLGİ, EYLEM DEĞİL.
                    Müdür süren bir işlemi kısaltamaz; aşımın tek gerçek sonucu
                    SIRADAKİ müşteride ve o müşterinin kendi kartı zaten
                    "gecikti" diyor — eylem de orada. Buraya düğme koymak
                    tiyatro olurdu. Aşımı kelime taşıyor, rakam değil: sayaç
                    renk değiştirmiyor, çünkü ölçtüğü şey değişmedi. */}
                {overrunLine(event) ? (
                    <Text numberOfLines={1} style={{
                        color: ink.am,
                        fontSize: flowMetrics.liveSub,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {overrunLine(event)}
                    </Text>
                ) : event.startedAt ? (
                    <Text style={{
                        color: ink.ink2,
                        fontSize: flowMetrics.liveSub,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {event.startedAt}
                    </Text>
                ) : null}
            </View>

            {event.staffName ? (
                // Personel hapı SAĞDAN girer: "kim çalışıyor" bilgisi
                // beklemede yoktu, işlem başlayınca doğdu.
                <Animated.View style={{
                    opacity: morph,
                    transform: [{
                        translateX: morph.interpolate({
                            inputRange: [0, 1],
                            outputRange: [waitCardMetrics.morphPillShift, 0],
                        }),
                    }],
                    height: flowMetrics.whoHeight,
                    paddingHorizontal: flowMetrics.whoX,
                    borderRadius: radius.pill,
                    backgroundColor: ink.pill,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: flowMetrics.whoGap,
                }}>
                    <View style={{
                        width: flowMetrics.whoAvatar,
                        height: flowMetrics.whoAvatar,
                        borderRadius: radius.pill,
                        borderWidth: flowMetrics.ringBorder,
                        borderColor: c.or,
                        backgroundColor: ink.pillAvatarBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Text style={{
                            color: ink.pillInk,
                            fontSize: flowMetrics.whoAvatarText,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                        }}>
                            {event.staffInitials}
                        </Text>
                    </View>
                    <Text style={{
                        color: ink.pillInk,
                        fontSize: flowMetrics.whoText,
                        fontFamily: font.bold,
                        fontWeight: '700',
                        letterSpacing: flowMetrics.whoText * -0.02,
                    }}>
                        {event.staffName}
                    </Text>
                </Animated.View>
            ) : null}
        </View>
    );
}

/** Üç nokta — YALNIZ ikincil işler. Ana eylem hiçbir zaman menüye girmez. */
function DotsButton({ onPress }: { onPress?: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Diğer işlemler"
            onPress={() => { feedback.selection(); onPress?.(); }}
            hitSlop={8}
            style={{
                marginLeft: 'auto',
                width: flowMetrics.dotsButton,
                height: flowMetrics.dotsButton,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Svg width={flowMetrics.dotsIcon} height={flowMetrics.dotsIcon} viewBox="0 0 24 24">
                <Circle cx={12} cy={5.4} r={1.5} fill={c.tx3} />
                <Circle cx={12} cy={12} r={1.5} fill={c.tx3} />
                <Circle cx={12} cy={18.6} r={1.5} fill={c.tx3} />
            </Svg>
        </Pressable>
    );
}

/**
 * Akış satırı. Kart DEĞİL: kenardan kenara, aralarında saç teli ayırıcı.
 * Kart içinde kart yığını telefonda daralır; nefes boşlukla veriliyor.
 *
 * Eylem satırın İÇİNDE — "Geldi", "Tahsil et". Üç nokta menüsüne gömülmez;
 * menü yalnız ikincil işleri taşır.
 */
// ── Müdür 17 · sıradaki randevu kartı ───────────────────────────────────────

/**
 * Ters panel — A1'in malzemesi.
 *
 * Koyu temada krem, aydınlık temada koyu. Tasarımın gerekçesi: krem zemin
 * üstünde krem panel DÜZLEM DEĞİŞTİRMEZ, ters düzlem değiştirir. Kartın
 * ayrışması renginden değil, sayfanın tersi olmasından gelir.
 *
 * Cam DEĞİL: cam yalnız yüzen kontrol katmanına ait, bu kart içerik katmanında.
 *
 * ÇÖZÜLMÜŞ ÇELİŞKİ (2026-08-21). Müdür 03 canlı işlem şeridi için "iki temada
 * da krem" diyordu, Müdür 17 bu panel için "temanın tersi" diyordu; aydınlık
 * temada aynı ekranda biri koyu biri krem duruyordu. Kullanıcı kararı: gömülü
 * kahraman panellerin HEPSİ temanın tersi. `LiveStrip` de artık `panelInk`
 * kullanıyor, `flowMetrics.liveBg/liveTx*` jetonları ölü.
 */
function EtaPanel({ event, ink, onAction, onPill, waConnected = true }: {
    event: FlowEvent; ink: PanelInk; onAction?: (label: string) => void;
    onPill?: (cell: CellKey) => void; waConnected?: boolean;
}) {
    const { c } = useTheme();
    const panel = etaPanel(event);
    const value = panel.late ? ink.red : ink.ink;
    const slots = nextSlots(event);
    const record = pillRecordOf(event);
    const pillIn = pillInputOf(event, waConnected);
    const cells = pillCells(pillIn);
    const offCells = pillOff(pillIn);

    // Hap açık mı, ve hangi yöne. Yön AÇILIŞTA BİR KEZ seçilir: kaydırırken
    // zıplamasın. Varsayılan yukarı — aynı müşterinin kartını örtmek, başka
    // müşterinin satırını örtmekten iyi.
    const [open, setOpen] = useState(false);
    const [below, setBelow] = useState(false);
    const [triggerWidth, setTriggerWidth] = useState(nextCardMetrics.goX * 2 + 62);

    return (
        <View style={{
            flexDirection: 'row',
            // ÜSTE YASLI, ortalı değil. Kayıt satırı geldiğinde sol sütun
            // 70'ten 85'e çıkıyor; ortalı olsaydı kahraman rakam 7,5 pt
            // yukarı kayıp geri inerdi — bir randevunun ömründe iki kez, ve
            // yerleşim değişimi animasyonlanamaz. Şimdi etiket ve rakam 14'te
            // çakılı, kayıt satırı boştaki 20 pt'ye AŞAĞI doğru büyüyor.
            alignItems: 'flex-start',
            gap: nextCardMetrics.panelGap,
            padding: nextCardMetrics.panelPad,
            borderRadius: nextCardMetrics.panelRadius,
            backgroundColor: ink.panel,
            // Gecikme çizgisi ayrı katmanda, panelin içinde kırpılıyor.
            // `borderLeftWidth` + `borderRadius` iOS'ta köşeleri bozuyor.
            overflow: 'hidden',
        }}>
            {panel.late ? (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: 0, top: 0, bottom: 0,
                        width: nextCardMetrics.lateBar,
                        backgroundColor: ink.red,
                    }}
                />
            ) : null}

            {/* `.a1t{gap:1px}` — etiket, rakam ve alt satır tek blok. */}
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={{
                    color: panel.late ? ink.red : ink.ink2,
                    fontSize: nextCardMetrics.label,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: nextCardMetrics.label * 0.06,
                }}>
                    {upperTR(panel.label)}
                </Text>
                <Num size={nextCardMetrics.eta} style={{
                    color: value,
                    fontWeight: '800',
                    letterSpacing: nextCardMetrics.eta * -0.04,
                    lineHeight: nextCardMetrics.eta,
                }}>
                    {panel.value}
                </Num>
                <Num size={nextCardMetrics.sub} style={{
                    color: ink.ink2,
                    fontWeight: '500',
                    letterSpacing: 0,
                }}>
                    {panel.sub}
                </Num>

                {/* Dördüncü satır — son hamle. Defter değil: yalnız SON
                    hamle yazılı, ve bayatlayınca düşüyor. Sol sütunun boştaki
                    20 pt'sine giriyor, kart 118'de kalıyor. */}
                {record ? (
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        gap: waitCardMetrics.stampGap, height: nextCardMetrics.sub + 2.5,
                    }}>
                        <View style={{
                            width: waitCardMetrics.stampDot,
                            height: waitCardMetrics.stampDot,
                            borderRadius: waitCardMetrics.stampDot / 2,
                            backgroundColor: record.tone === 'warn' ? ink.red
                                : record.tone === 'live' ? c.or : ink.ink2,
                            opacity: record.tone === 'quiet' ? 0.7 : 1,
                        }} />
                        <Num size={nextCardMetrics.sub} style={{
                            color: ink.ink2, fontWeight: '700', letterSpacing: 0,
                        }}>
                            {record.text}
                        </Num>
                    </View>
                ) : null}
            </View>

            {/* Eylemler DİKEY: turuncu dolgu üstte, sessiz metin altta.
                İkisi de 44 — ağırlık farkı boyuttan değil malzemeden.

                SÜTUN GERİLİR (`stretch`). İkinci yuva hayalet metinken
                genişlik farkı görünmüyordu; `Yönet` bir KUTU ve üst üste duran
                iki kutunun kenarları hizalanmak zorunda. Sağa yaslı olsaydı
                9,4 pt'lik fark tamamen sol kenara binerdi.

                Hapın çapası da buna dayanıyor: sütunun sağ kenarı = 
                tetikleyicinin sağ kenarı, yani hap `right: 0` ile tam yerine
                oturuyor. */}
            <View style={{ gap: nextCardMetrics.actsGap, alignItems: 'stretch' }}>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => { feedback.medium(); onAction?.('Geldi'); }}
                    style={{
                        height: nextCardMetrics.goHeight,
                        paddingHorizontal: nextCardMetrics.goX,
                        borderRadius: radius.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: c.or,
                    }}
                >
                    <Text style={{
                        color: onAccent,
                        fontSize: nextCardMetrics.goText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: nextCardMetrics.goText * -0.02,
                    }}>
                        Geldi
                    </Text>
                </Pressable>
                {/* İKİNCİ YUVA GÜNÜN HER ANINDA `Yönet` (Müdür 34 · v2).
                    "Takas öldü, sütun sabit": zamanında hap Ara · Yaz,
                    gecikince + Gelmedi. Zamanında `Gelmedi` henüz gelebilecek
                    bir müşteriyi atmak olurdu. Tek istisna 5 sn'lik gönderim
                    penceresi: yuva `Geri al` olur. */}
                {slots.secondary === 'undo' ? (
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => { feedback.medium(); onAction?.('Geri al'); }}
                        style={{
                            height: nextCardMetrics.noHeight,
                            paddingHorizontal: nextCardMetrics.goX,
                            borderRadius: radius.pill,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: waitCardMetrics.hapBorder,
                            borderColor: ink.ink,
                        }}
                    >
                        <Text style={{
                            color: ink.ink, fontSize: nextCardMetrics.noText,
                            fontFamily: font.bold, fontWeight: '700',
                        }}>
                            Geri al
                        </Text>
                    </Pressable>
                ) : slots.secondary === 'pill' && pillOpens(cells) ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Yönet — eylemleri aç"
                        accessibilityState={{ expanded: open }}
                        onLayout={(e) => setTriggerWidth(e.nativeEvent.layout.width)}
                        onPress={() => {
                            feedback.selection();
                            // Yön açılışta bir kez seçilir. Kart akışın en
                            // üstündeyse yukarıda yer yok, aşağı açılır.
                            setBelow(event.firstInList === true);
                            setOpen(true);
                        }}
                        style={{
                            height: nextCardMetrics.noHeight,
                            paddingHorizontal: nextCardMetrics.goX,
                            borderRadius: radius.pill,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            borderWidth: waitCardMetrics.hapBorder,
                            borderColor: ink.ink,
                            backgroundColor: open ? ink.line : undefined,
                        }}
                    >
                        <Text style={{
                            color: ink.ink, fontSize: nextCardMetrics.noText,
                            fontFamily: font.bold, fontWeight: '700',
                        }}>
                            Yönet
                        </Text>
                        <Chevron color={ink.ink} down={open ? below : false} />
                    </Pressable>
                ) : null}

                {/* Hap SÜTUNUN İÇİNDE: koordinat sistemi tetikleyicininki.
                    Kart `overflow` almıyor, yoksa ok ucu kırpılırdı. */}
                {open ? (
                    <ActionPill
                        cells={cells}
                        offCells={offCells}
                        below={below}
                        triggerWidth={triggerWidth}
                        triggerTop={nextCardMetrics.goHeight + nextCardMetrics.actsGap}
                        triggerHeight={nextCardMetrics.noHeight}
                        staffInitials={event.staffInitials
                            ?? initialsOfName(event.staffName)}
                        staffGiven={event.staffName
                            ? splitStaffName(event.staffName).given : undefined}
                        onPick={(cell) => { setOpen(false); onPill?.(cell); }}
                        onDismiss={() => setOpen(false)}
                    />
                ) : null}
            </View>
        </View>
    );
}

/**
 * Personelin baş harfleri — hapın personel gözünde duran şey.
 *
 * Veri `staffInitials` taşımıyorsa addan türetilir; ad da yoksa `undefined`
 * döner ve göz baş harf yerine kendi simgesine düşer. Uydurulmuyor.
 */
function initialsOfName(name?: string): string | undefined {
    const clean = name?.trim();
    if (!clean) return undefined;
    const { given, family } = splitStaffName(clean);
    const first = given.charAt(0);
    const last = family.charAt(0) || given.charAt(1) || '';
    const pair = `${first}${last}`.toLocaleUpperCase('tr-TR');
    return pair.length === 2 ? pair : undefined;
}

/** Tetikleyicinin yön oku. Hap aşağı açılınca 180° döner — `transform`, yasal. */
function Chevron({ color, down }: { color: string; down: boolean }) {
    return (
        <View style={{ transform: [{ rotate: down ? '180deg' : '0deg' }] }}>
            <Svg width={14} height={9} viewBox="0 0 18 12">
                <Polyline
                    points="3 8.5 9 3.5 15 8.5"
                    stroke={color}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </Svg>
        </View>
    );
}

/**
 * A2 — müşteri dosyası.
 *
 * A1 ile aynı olayın bağlamlı hâli. Gövde artık geri sayım değil MÜŞTERİ:
 * bakiye, not, paket. Boş alan satır üretmez, kart bağlam kadar uzar.
 *
 * Yarıçap eşmerkezli: 22 − 12 (dolgu) = 10 → not kutusu 10.
 */
function CustomerCard({ event, presence, onAction, onOpenCustomer, onPill, waConnected = true }: {
    event: FlowEvent; presence: readonly StaffPresence[]; onAction?: (label: string) => void;
    onOpenCustomer?: (event: FlowEvent) => void;
    onPill?: (cell: CellKey) => void; waConnected?: boolean;
}) {
    const column = etaColumn(event);
    /*
     * YÖNET BU KARTTA DA (Müdür 34 · v2: "ikinci yuva günün her anında Yönet").
     *
     * A2 eskiden yalnız "Geldi · Gelmedi" taşıyordu ve gecikince de A2
     * kalıyordu: paketi ya da uyarısı olan GECİKMİŞ müşteriyi aramanın, ona
     * yazmanın hiçbir yolu yoktu. Tetikleyici, hap ve kayıt satırı A1'in
     * aynısı — aynı ailede ikinci bir dil yok.
     */
    const pillIn = pillInputOf(event, waConnected);
    const cells = pillCells(pillIn);
    const offCells = pillOff(pillIn);
    const record = pillRecordOf(event);
    const slots = nextSlots(event);
    const [open, setOpen] = useState(false);
    const [triggerWidth, setTriggerWidth] = useState(0);
    const openable = Boolean(event.customerId && onOpenCustomer);
    const rows = contextRows(event.context);
    const conflict = staffConflict(event, presence);

    return (
        <View style={{
            gap: nextCardMetrics.cardGap,
            padding: nextCardMetrics.cardPad,
            borderRadius: nextCardMetrics.cardRadius,
            backgroundColor: cardSkin.bg,
            borderWidth: 1,
            borderColor: cardSkin.border,
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: nextCardMetrics.headGap }}>
                {/*
                  Yuvarlak ve ad TEK dokunma hedefi. Sağdaki geri sayım
                  sütunu dışarıda kalır: müdür saate bakarken yanlışlıkla
                  müşteri kartını açmasın.
                */}
                <Pressable
                    accessibilityRole={openable ? 'button' : undefined}
                    accessibilityLabel={openable
                        ? `${event.firstName} ${event.lastName} · müşteri kartını aç`
                        : undefined}
                    disabled={!openable}
                    hitSlop={customerBubble.hitSlop}
                    onPress={() => { feedback.selection(); onOpenCustomer?.(event); }}
                    style={({ pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: nextCardMetrics.headGap,
                        opacity: pressed && openable ? pressMotion.ghostOpacity : 1,
                    })}
                >
                <View style={{
                    width: nextCardMetrics.avatar,
                    height: nextCardMetrics.avatar,
                    borderRadius: nextCardMetrics.avatar / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: cardSkin.avatarBg,
                    borderWidth: nextCardMetrics.avatarBorder,
                    borderColor: cardSkin.border2,
                }}>
                    <Text style={{
                        color: cardSkin.tx,
                        fontSize: nextCardMetrics.avatarText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: nextCardMetrics.avatarText * -0.02,
                    }}>
                        {initialsOf(event)}
                    </Text>
                </View>

                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    {/* Tek metin bloğu: uzun soyadı kendi içinde sarar,
                        ayrı iki satır kutusu olsaydı ortadan kırpılırdı. */}
                    <Text style={{
                        color: cardSkin.tx,
                        fontSize: nextCardMetrics.nameSize,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: nextCardMetrics.nameSize * -0.03,
                        lineHeight: nextCardMetrics.nameSize * nextCardMetrics.nameLine,
                    }}>
                        <Text style={{ fontFamily: font.medium, fontWeight: '500' }}>
                            {event.firstName}
                        </Text>
                        {' '}
                        {event.lastName}
                    </Text>
                    <Text style={{
                        color: cardSkin.tx2,
                        fontSize: nextCardMetrics.detailSize,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {event.detail}
                    </Text>
                </View>
                </Pressable>

                <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Num size={nextCardMetrics.etaRight} style={{
                        color: column.late ? cardSkin.rd : cardSkin.or,
                        fontWeight: '800',
                        letterSpacing: nextCardMetrics.etaRight * -0.03,
                        lineHeight: nextCardMetrics.etaRight,
                    }}>
                        {column.value}
                    </Num>
                    <Num size={nextCardMetrics.etaRightSub} style={{
                        color: cardSkin.tx2, fontWeight: '600', letterSpacing: 0,
                    }}>
                        {column.sub}
                    </Num>
                </View>
            </View>

            {rows.length > 0 ? (
                <View style={{
                    gap: nextCardMetrics.noteGap,
                    padding: nextCardMetrics.notePad,
                    borderRadius: nextCardMetrics.noteRadius,
                    backgroundColor: cardSkin.note,
                    borderWidth: 1,
                    borderColor: cardSkin.border,
                }}>
                    {rows.map((row) => (
                        <View key={row.label} style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: nextCardMetrics.liGap,
                        }}>
                            <Text style={{
                                width: nextCardMetrics.liLabelWidth,
                                paddingTop: nextCardMetrics.liLabelTop,
                                color: cardSkin.tx2,
                                fontSize: nextCardMetrics.liLabel,
                                fontFamily: font.bold,
                                fontWeight: '700',
                                letterSpacing: nextCardMetrics.liLabel * 0.08,
                            }}>
                                {upperTR(row.label)}
                            </Text>
                            <Text style={{
                                flex: 1,
                                minWidth: 0,
                                color: cardSkin.tx,
                                fontSize: nextCardMetrics.liText,
                                fontFamily: font.semiBold,
                                fontWeight: '600',
                                lineHeight: nextCardMetrics.liText * nextCardMetrics.liLine,
                            }}>
                                {row.text}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}

            {conflict ? (
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: nextCardMetrics.confGap,
                }}>
                    <View style={{
                        width: nextCardMetrics.confDot,
                        height: nextCardMetrics.confDot,
                        borderRadius: nextCardMetrics.confDot / 2,
                        backgroundColor: cardSkin.am,
                    }} />
                    <Text style={{
                        flex: 1,
                        color: cardSkin.am,
                        fontSize: nextCardMetrics.confText,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: nextCardMetrics.confText * 1.35,
                    }}>
                        {`${conflict.name} şu an işlemde · ${conflict.badge}`}
                    </Text>
                </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: nextCardMetrics.actGap }}>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => { feedback.medium(); onAction?.('Geldi'); }}
                    style={{
                        height: nextCardMetrics.pillHeight,
                        paddingHorizontal: nextCardMetrics.pillX,
                        borderRadius: radius.pill,
                        justifyContent: 'center',
                        backgroundColor: cardSkin.or,
                    }}
                >
                    <Text style={{
                        color: onAccent,
                        fontSize: nextCardMetrics.pillText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: nextCardMetrics.pillText * -0.02,
                    }}>
                        Geldi
                    </Text>
                </Pressable>
                {slots.secondary === 'undo' ? (
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => { feedback.medium(); onAction?.('Geri al'); }}
                        style={{ height: nextCardMetrics.ghostHeight, justifyContent: 'center' }}
                    >
                        <Text style={{
                            color: cardSkin.tx, fontSize: nextCardMetrics.ghostText,
                            fontFamily: font.bold, fontWeight: '700',
                        }}>
                            Geri al
                        </Text>
                    </Pressable>
                ) : pillOpens(cells) ? (
                    // Hap bu kutunun İÇİNDE: `right: 0` tetikleyicinin kenarı.
                    <View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Yönet — eylemleri aç"
                            accessibilityState={{ expanded: open }}
                            onLayout={(e) => setTriggerWidth(e.nativeEvent.layout.width)}
                            onPress={() => { feedback.selection(); setOpen(true); }}
                            style={{
                                height: nextCardMetrics.ghostHeight,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            <Text style={{
                                color: cardSkin.tx2, fontSize: nextCardMetrics.ghostText,
                                fontFamily: font.bold, fontWeight: '700',
                            }}>
                                Yönet
                            </Text>
                            <Chevron color={cardSkin.tx2} down={open && event.firstInList === true} />
                        </Pressable>
                        {open ? (
                            <ActionPill
                                cells={cells}
                                offCells={offCells}
                                below={event.firstInList === true}
                                triggerWidth={triggerWidth}
                                triggerTop={0}
                                triggerHeight={nextCardMetrics.ghostHeight}
                                staffInitials={event.staffInitials ?? initialsOfName(event.staffName)}
                                staffGiven={event.staffName ? splitStaffName(event.staffName).given : undefined}
                                onPick={(cell) => { setOpen(false); onPill?.(cell); }}
                                onDismiss={() => setOpen(false)}
                            />
                        ) : null}
                    </View>
                ) : null}
            </View>

            {/* Son hamle — A1'in kayıt satırıyla aynı söz ("Arandı · 2 dk",
                "Yazıldı · şimdi"); bayatlayan düşer, bitmemiş iş kalır. */}
            {record ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: nextCardMetrics.confGap }}>
                    <View style={{
                        width: nextCardMetrics.confDot,
                        height: nextCardMetrics.confDot,
                        borderRadius: nextCardMetrics.confDot / 2,
                        backgroundColor: record.tone === 'warn' ? cardSkin.rd
                            : record.tone === 'live' ? cardSkin.or : cardSkin.tx2,
                    }} />
                    <Text style={{
                        flex: 1,
                        color: cardSkin.tx2,
                        fontSize: nextCardMetrics.confText,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {record.text}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

// ── Müdür 20 · bekleme ──────────────────────────────────────────────────────

/**
 * Bekleme nabzı — canlı sayacın nabzından BİLEREK farklı.
 *
 * Canlı işlem 800 ms'de 1 ↔ 0.35 atar; bekleme 2600 ms'de 1 ↔ 0.45. Üç kat
 * yavaş ve daha sönük, çünkü iki kart aynı ekranda üst üste duruyor: biri
 * tikliyor, öteki nefes alıyor. Aynı ritmi paylaşsalardı ikisi tek bir şey
 * gibi okunurdu.
 */
function useWaitPulse(reduceMotion: boolean) {
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (reduceMotion) {
            pulse.stopAnimation();
            // Hareket durur, bilgi durmaz: nokta sabit ve görünür kalır.
            pulse.setValue(waitCardMetrics.reducedOpacity);
            return;
        }
        const half = waitCardMetrics.pulse / 2;
        const animation = Animated.loop(Animated.sequence([
            Animated.timing(pulse, {
                toValue: waitCardMetrics.pulseLow, duration: half,
                easing: Easing.inOut(Easing.ease), useNativeDriver: true,
            }),
            Animated.timing(pulse, {
                toValue: 1, duration: half,
                easing: Easing.inOut(Easing.ease), useNativeDriver: true,
            }),
        ]));
        animation.start();
        return () => animation.stop();
    }, [pulse, reduceMotion]);
    return pulse;
}

/**
 * Dakika dönüşü — rakam değişirken görünür biçimde döner.
 *
 * Saniyelik sayaç dönmez, yerinde değişir; dakikalık sayaç ayda bir kıpırdadığı
 * için kıpırdadığını göstermek zorunda. Eski değer yukarı çıkarken yeni değer
 * aşağıdan gelir — iki katman, tek yükseklik, yeniden yerleşim yok.
 */
function RollingHero({ value, unit, color, unitColor, unitFade }: {
    value: string; unit: string; color: string; unitColor: string; unitFade: number;
}) {
    const { reduceMotion } = useTheme();
    const shown = useRef(value);
    const roll = useRef(new Animated.Value(0)).current;
    const [pair, setPair] = useState({ from: value, to: value });

    useEffect(() => {
        if (shown.current === value) return;
        const from = shown.current;
        shown.current = value;
        setPair({ from, to: value });
        if (reduceMotion) { roll.setValue(1); return; }
        roll.setValue(0);
        Animated.timing(roll, {
            toValue: 1,
            duration: waitCardMetrics.rollDuration,
            easing: Easing.bezier(0.2, 0.8, 0.25, 1),
            useNativeDriver: true,
        }).start();
    }, [value, roll, reduceMotion]);

    const numStyle = {
        color,
        fontSize: waitCardMetrics.hero,
        fontWeight: '800' as const,
        letterSpacing: waitCardMetrics.hero * -0.03,
        lineHeight: waitCardMetrics.heroBox,
    };
    const shift = waitCardMetrics.rollShift;

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: waitCardMetrics.heroGap,
            height: waitCardMetrics.heroBox,
            // Sütunun genişliğini AŞMIYOR: uzun bir değer ("11 sa 40") kırılıp
            // alttaki satırın üstüne binmek yerine küçülüyor.
            minWidth: 0,
        }}>
            {/* Sarmalayıcının TEK akıştaki çocuğu yer tutucu: birim "dk" onun
                temel çizgisine oturur (Yoga baseline'ı ilk çocuktan alır). */}
            <View style={{ flexShrink: 1, minWidth: 0 }}>
                {/* Yer tutucu: iki katman mutlak konumlu, kutuyu bu belirler. */}
                <Num fit size={waitCardMetrics.hero} style={[numStyle, { opacity: 0 }]}>
                    {pair.to}
                </Num>
                <Animated.View style={{
                    position: 'absolute', left: 0, right: 0,
                    opacity: roll.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -shift] }) }],
                }}>
                    <Num fit size={waitCardMetrics.hero} style={numStyle}>{pair.from}</Num>
                </Animated.View>
                <Animated.View style={{
                    position: 'absolute', left: 0, right: 0,
                    opacity: roll,
                    transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }],
                }}>
                    <Num fit size={waitCardMetrics.hero} style={numStyle}>{pair.to}</Num>
                </Animated.View>
            </View>
            <Text numberOfLines={1} style={{
                // Birim hiçbir zaman sıkışmıyor; küçülen rakam oluyor.
                flexShrink: 0,
                // Sakin hâlde birim ikincil mürekkep; gecikmede rakamla aynı
                // kırmızıya döner ve hafifçe geri çekilir (tasarım: opacity .72).
                color: unitColor,
                opacity: unitFade,
                fontSize: waitCardMetrics.unit,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: waitCardMetrics.unit * -0.01,
            }}>
                {unit}
            </Text>
        </View>
    );
}

/** Hap ve hayalet eylem — görünen 40/22, dokunulan 44 (hitSlop). */
function WaitAct({ action, ink, onPress, expanded, onLayout }: {
    action: WaitAction; ink: PanelInk; onPress: () => void;
    /** Hap tetikleyicisiyse: açık mı — çevron ona göre döner. */
    expanded?: boolean;
    /**
     * Düğmenin sütun içindeki KUTUSU. Yalnız genişlik yetmiyordu: hapın
     * çapası düğmenin `y`sine ve yüksekliğine de bağlı, ikisi de kartın
     * hâline göre değişiyor.
     */
    onLayout?: (box: { width: number; y: number; height: number }) => void;
}) {
    const { c } = useTheme();

    if (action.kind === 'stamp') {
        // Basılamaz — Pressable DEĞİL. Damga bir eylem değil bir kayıt; dolu
        // zemin onu düğmeye benzetirdi, o yüzden saydam zemin + ince kenarlık.
        // Hapın 40 pt'lik yuvasında ortalanır: düğme damgaya dönüşürken kart
        // yüksekliği kıpırdamaz, sağ sütunda boşluk açılmaz.
        return (
            <View style={{
                height: waitCardMetrics.hapHeight,
                alignItems: 'flex-end',
                justifyContent: 'center',
            }}>
                <View style={{
                    height: waitCardMetrics.stampHeight,
                    paddingHorizontal: waitCardMetrics.stampX,
                    borderRadius: waitCardMetrics.stampRadius,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: waitCardMetrics.stampGap,
                    borderWidth: waitCardMetrics.stampBorder,
                    borderColor: ink.line,
                }}>
                    {action.done ? (
                        <View style={{
                            width: waitCardMetrics.stampDot,
                            height: waitCardMetrics.stampDot,
                            borderRadius: radius.pill,
                            backgroundColor: ink.green,
                        }} />
                    ) : null}
                    <Text numberOfLines={1} style={{
                        color: ink.ink2,
                        fontSize: waitCardMetrics.stampText,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {action.label}
                    </Text>
                </View>
            </View>
        );
    }

    if (action.kind === 'ghost') {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityState={expanded == null ? undefined : { expanded }}
                hitSlop={{ top: waitCardMetrics.ghostSlop, bottom: waitCardMetrics.ghostSlop }}
                onLayout={(e) => onLayout?.(e.nativeEvent.layout)}
                onPress={onPress}
                style={{
                    height: waitCardMetrics.ghostHeight,
                    paddingHorizontal: waitCardMetrics.ghostX,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    justifyContent: 'center',
                }}
            >
                <Text style={{
                    color: ink.ink2,
                    fontSize: waitCardMetrics.ghostText,
                    fontFamily: font.bold,
                    fontWeight: '700',
                }}>
                    {action.label}
                </Text>
                {expanded != null ? <Chevron color={ink.ink2} down={expanded} /> : null}
            </Pressable>
        );
    }
    const filled = action.kind === 'fill';
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={expanded == null ? undefined : { expanded }}
            hitSlop={{ top: waitCardMetrics.hapSlop, bottom: waitCardMetrics.hapSlop }}
            onLayout={(e) => onLayout?.(e.nativeEvent.layout)}
            onPress={onPress}
            style={{
                height: waitCardMetrics.hapHeight,
                paddingHorizontal: waitCardMetrics.hapX,
                borderRadius: radius.pill,
                flexDirection: 'row',
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: waitCardMetrics.hapBorder,
                // Dolu hap kartın TEK dolu yüzeyi ve yalnız 10. dakikada çıkar;
                // turuncu burada "bastırılması gereken eylem" demek.
                borderColor: filled ? c.or : ink.ink,
                backgroundColor: filled ? c.or : 'transparent',
            }}
        >
            <Text style={{
                color: filled ? onAccent : ink.ink,
                fontSize: waitCardMetrics.hapText,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: waitCardMetrics.hapText * -0.01,
            }}>
                {action.label}
            </Text>
            {expanded != null ? <Chevron color={filled ? onAccent : ink.ink} down={expanded} /> : null}
        </Pressable>
    );
}

/**
 * Bekleme kartı — "Geldi" ile "Sürüyor" arasındaki tek kart.
 *
 * Çerçevesi A1 paneliyle ve canlı şeritle AYNI (14 · 18 · 12): üç hâl aynı
 * karttır. "Geldi"ye basınca satır kıpırdamaz, içerik dönüşür.
 *
 * Eşik geçişi (5 ve 10. dakika) iki yüzeyin çapraz soldurulmasıyla yapılır —
 * renk değeri animasyona GİRMEZ, çünkü renk interpolasyonu native sürücüde
 * çalışmaz ve her karede yeniden yerleşim ister.
 */
/**
 * Değeri SÖNDÜRÜP değiştiren küçük geçiş.
 *
 * Satır etiketi eşik aşılınca hem kelimesini hem rengini değiştiriyor
 * ("GELDİ · BEKLİYOR" → "BEKLİYOR · KARŞILA"). Altındaki kart 900 ms boyunca
 * yumuşakça solduğu hâlde etiket tek karede zıplıyordu; yan yana duran iki
 * geçişten biri sert olunca ikisi de kaba görünüyor.
 *
 * Kartın çapraz soldurması iki katman ister, bu tek satır için ağır kaçar:
 * burada tek düğüm sönüp yeni değerle geri açılıyor. Süreler aynı tablodan.
 */
function useSwapped<T>(key: string, value: T): { shown: T; opacity: Animated.Value } {
    const { reduceMotion } = useTheme();
    const [shown, setShown] = useState(value);
    const fade = useRef(new Animated.Value(1)).current;
    const lastKey = useRef(key);
    const latest = useRef(value);

    useEffect(() => { latest.current = value; });

    useEffect(() => {
        if (lastKey.current === key) return;
        lastKey.current = key;
        if (reduceMotion) { setShown(latest.current); return; }
        Animated.timing(fade, {
            toValue: 0,
            duration: cardSwap.press.out,
            easing: Easing.bezier(...swapOutCurve),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (!finished) return;
            setShown(latest.current);
            Animated.timing(fade, {
                toValue: 1,
                duration: cardSwap.press.in,
                easing: Easing.bezier(...swapInCurve),
                useNativeDriver: true,
            }).start();
        });
    }, [key, reduceMotion, fade]);

    return { shown, opacity: fade };
}

/**
 * Bir durumu belirli süre TUTAR, sonra bırakır.
 *
 * Onay kartı için: basışın sonucu bir an ekranda durmalı, yoksa müdür ne
 * olduğunu göremeden satır ince hâline iner.
 */
function useHold(active: boolean, ms: number) {
    const [holding, setHolding] = useState(active);
    useEffect(() => {
        if (!active) { setHolding(false); return; }
        setHolding(true);
        const timer = setTimeout(() => setHolding(false), ms);
        return () => clearTimeout(timer);
    }, [active, ms]);
    return holding;
}

/**
 * Kart türü değişimlerinin ÇAPRAZ SOLDURMASI.
 *
 * Akış satırında kartın türü değişince (geri sayım → bekleme → devir →
 * canlı işlem) eski bileşen sökülüp yenisi takılıyordu; sonuç bir karelik
 * sert kesmeydi. Tasarımın altı hareketinin hepsi ise iki şeyin ÜST ÜSTE
 * binmesine dayanıyor — biri sönerken öteki açılıyor.
 *
 * Burada eski düğüm bir süre daha ekranda tutulur: MUTLAK konumda, üstte,
 * dokunuşlara kapalı. Yeni düğüm akışta durur, yani kartın yüksekliğini
 * hep O belirler; eski düğüm yerleşimi etkilemez.
 *
 * Süreler kart çiftine göre değişir (`cardSwap`), çünkü tasarım her geçiş
 * için ayrı ölçü veriyor: basış 160/220, devir 260/300, işlem başlangıcı
 * 180/240.
 */
function CardSwap({ id, timing, children }: {
    /** Kart türünün kimliği. Değişince soldurma başlar. */
    id: string;
    timing: { out: number; in: number; delay: number; lift: number; rise: number };
    children: ReactNode;
}) {
    const { reduceMotion } = useTheme();
    const [past, setPast] = useState<ReactNode | null>(null);
    const lastId = useRef(id);
    const lastNode = useRef<ReactNode>(children);
    const out = useRef(new Animated.Value(1)).current;
    const enter = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (lastId.current === id) return;
        const from = lastNode.current;
        lastId.current = id;
        if (reduceMotion) {
            // Hareket azaltılmışsa anında takas — tasarımın kendi notu bu.
            setPast(null);
            out.setValue(1);
            enter.setValue(1);
            return;
        }
        setPast(from);
        out.setValue(1);
        Animated.timing(out, {
            toValue: 0,
            duration: timing.out,
            easing: Easing.bezier(...swapOutCurve),
            useNativeDriver: true,
        }).start(({ finished }) => { if (finished) setPast(null); });
        enter.setValue(0);
        Animated.timing(enter, {
            toValue: 1,
            duration: timing.in,
            delay: timing.delay,
            easing: Easing.bezier(...swapInCurve),
            useNativeDriver: true,
        }).start();
    }, [id, timing, reduceMotion, out, enter]);

    // Her renderdan SONRA; yukarıdaki etki bu yüzden hâlâ bir önceki düğümü
    // görüyor. Sıra önemli, yer değiştirmesinler.
    useEffect(() => { lastNode.current = children; });

    return (
        <View>
            <Animated.View style={{
                opacity: enter,
                transform: [{
                    translateY: enter.interpolate({
                        inputRange: [0, 1], outputRange: [timing.rise, 0],
                    }),
                }],
            }}>
                {children}
            </Animated.View>

            {past ? (
                <Animated.View pointerEvents="none" style={{
                    position: 'absolute', left: 0, right: 0, top: 0,
                    opacity: out,
                    transform: [{
                        translateY: out.interpolate({
                            inputRange: [0, 1], outputRange: [-timing.lift, 0],
                        }),
                    }],
                }}>
                    {past}
                </Animated.View>
            ) : null}
        </View>
    );
}

/**
 * Kartın İÇİ.
 *
 * Ayrı bileşen, çünkü eşik geçişinde İKİ KOPYASI üst üste konup çapraz
 * soldurulur: nötr yüzey sönerken amber/kırmızı yüzey açılır. Renk değerinin
 * kendisi animasyona girmez — `interpolateColor` native sürücüde çalışmaz ve
 * her karede yeniden yerleşim ister.
 */
/**
 * Animated stiline verilebilen sayı türleri. `Animated.multiply` sonucu düz
 * `AnimatedInterpolation` değil, o yüzden birlik açıkça yazılıyor.
 */
type Motion =
    | number
    | Animated.Value
    | Animated.AnimatedInterpolation<number>
    | Animated.AnimatedMultiplication<number>;

/**
 * Gömülü kartın ÇERÇEVESİ — bekleme, tahsilat ve gelmedi kartlarının ortağı.
 *
 * Üçü de aynı kart: `padding 14 · radius 18 · gap 12`. Tek yerde durmasının
 * sebebi görsel değil yapısal — üç ayrı kopya bir gün üç ayrı ölçüye kayar.
 * Değişen her şey (nokta, kahraman rakam, alt satır, eylemler) düğüm olarak
 * dışarıdan gelir.
 *
 * Eşik geçişinde İKİ KOPYASI üst üste konup çapraz soldurulur; bu yüzden
 * opaklık ve kayma da dışarıdan sürülür.
 */
function PanelCard({ ink, warn, stripe, dot, label, labelColor, hero, sub, record, actions, spoken, opacity, lift }: {
    ink: PanelInk;
    /** Soldan uyarı çizgisi çizilsin mi. */
    warn: boolean;
    stripe: string;
    dot: ReactNode;
    label: string;
    labelColor: string;
    hero: ReactNode;
    sub: ReactNode;
    /** Dördüncü satır — son hamlenin kaydı. Yoksa hiç çizilmez. */
    record?: ReactNode;
    actions: ReactNode;
    spoken: string;
    opacity: Motion;
    lift: Motion;
}) {
    return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
            {warn ? (
                // Çizgi AYRI KATMAN: `borderLeftWidth` + `borderRadius` iOS'ta
                // köşeleri bozuyor (A1 panelinde de aynı çözüm).
                <Animated.View pointerEvents="none" style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: waitCardMetrics.stripe,
                    backgroundColor: stripe,
                    opacity,
                }} />
            ) : null}
            <View style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: waitCardMetrics.gap,
                // Dolgu HER HÂLDE 14 ve çizgi onun ÜSTÜNE biniyor: 4 çizgi +
                // 10 boşluk = 14, metin uyarı hâline geçerken kıpırdamıyor.
                //
                // Tasarımın CSS'i burada kendiyle çelişiyordu: çizgiyi mutlak
                // katmana koyup dolguyu da 10'a indirmiş, ikisi birden olunca
                // metin 4 pt sola sıçrıyor. Belgenin kendi cümlesi ("metin
                // yerinden oynamaz") ve ölçü tablosu ("çizgi 4 + dolgu 10 =
                // 14") niyeti açıkça söylüyor; A1 paneli de yıllardır böyle.
                padding: waitCardMetrics.pad,
                minWidth: 0,
            }}>
                {/* Etiket METİN SÜTUNUNDA, kartın tamamında değil: `accessible`
                    bir kabı tek öğeye indirger ve içindeki düğmeleri VoiceOver'a
                    kapatırdı. Düğmeler kendi başlarına okunmaya devam ediyor. */}
                <Animated.View accessible accessibilityLabel={spoken} style={{
                    flex: 1,
                    minWidth: 0,
                    opacity,
                    transform: [{ translateY: lift }],
                }}>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: waitCardMetrics.labelGap,
                    }}>
                        {dot}
                        <Text numberOfLines={1} style={{
                            flex: 1,
                            color: labelColor,
                            fontSize: waitCardMetrics.label,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: waitCardMetrics.label * 0.06,
                            lineHeight: waitCardMetrics.label * waitCardMetrics.labelLine,
                        }}>
                            {upperTR(label)}
                        </Text>
                    </View>

                    {hero}
                    {sub}
                    {record}
                </Animated.View>

                <Animated.View style={{
                    alignItems: 'flex-end',
                    // ÜSTE YASLI: kayıt satırı geldiğinde sol sütun uzuyor;
                    // ortalı olsaydı kahraman rakam yerinden oynardı.
                    justifyContent: record ? 'flex-start' : 'center',
                    opacity,
                    transform: [{ translateY: lift }],
                }}>
                    {actions}
                </Animated.View>
            </View>
        </View>
    );
}

/** Kartın alt satırı — tek satır, kırpmalı. */
function PanelSub({ ink, text }: { ink: PanelInk; text: string }) {
    return (
        <Text numberOfLines={1} style={{
            color: ink.ink2,
            fontSize: waitCardMetrics.sub,
            fontFamily: font.medium,
            fontWeight: '500',
            lineHeight: waitCardMetrics.sub * waitCardMetrics.subLine,
        }}>
            {text}
        </Text>
    );
}

/** Nabız atan durum noktası. Nabız yoksa `pulse` verilmez. */
function PanelDot({ color, pulse }: { color: string; pulse?: Animated.Value }) {
    return (
        <Animated.View style={{
            width: waitCardMetrics.dot,
            height: waitCardMetrics.dot,
            borderRadius: radius.pill,
            backgroundColor: color,
            opacity: pulse ?? 1,
        }} />
    );
}

function WaitFace({ card, ink, pulse, opacity, lift, spoken, actions }: {
    card: WaitCardModel;
    ink: PanelInk;
    pulse: Animated.Value;
    /** Canlı yüz için çapraz soldurma değeri, geçmiş yüz için tersi. */
    opacity: Motion;
    lift: Motion;
    spoken: string;
    actions: ReactNode;
}) {
    const hot = card.level === 'late';
    const accent = hot ? ink.red : ink.am;
    const dotColor = hot ? ink.red : ink.amDot;

    return (
        <PanelCard
            ink={ink}
            warn={card.level !== 'calm'}
            stripe={dotColor}
            dot={<PanelDot color={dotColor} pulse={pulse} />}
            label={card.label}
            labelColor={card.level !== 'calm' ? accent : ink.ink2}
            hero={(
                <RollingHero
                    value={card.value}
                    unit={card.unit}
                    color={hot ? ink.red : ink.ink}
                    unitColor={hot ? ink.red : ink.ink2}
                    unitFade={hot ? 0.72 : 1}
                />
            )}
            sub={card.conflict ? (
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: waitCardMetrics.confGap,
                }}>
                    <PanelDot color={ink.amDot} />
                    <Text numberOfLines={1} style={{
                        flex: 1,
                        color: ink.am,
                        fontSize: waitCardMetrics.conf,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: waitCardMetrics.conf * waitCardMetrics.subLine,
                    }}>
                        {card.conflict}
                    </Text>
                </View>
            ) : <PanelSub ink={ink} text={card.sub ?? ''} />}
            actions={actions}
            spoken={spoken}
            opacity={opacity}
            lift={lift}
        />
    );
}


function WaitCardView({ event, presence, fresh, onAction }: {
    event: FlowEvent;
    presence: readonly StaffPresence[];
    fresh: boolean;
    onAction?: (label: string) => void;
}) {
    const { dark, reduceMotion } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;
    const pulse = useWaitPulse(reduceMotion);

    // Geri alma penceresi: 5 sn görünür, sonra sakin biçimde söner ve yerini
    // eylemlere bırakır. Sönerken de basılabilir — dokunulursa uygulanır.
    const [undoDone, setUndoDone] = useState(!fresh);
    const undoFade = useRef(new Animated.Value(fresh ? 1 : 0)).current;
    const actsFade = useRef(new Animated.Value(fresh ? 0 : 1)).current;

    useEffect(() => {
        if (!fresh) return;
        if (reduceMotion) {
            const t = setTimeout(() => {
                undoFade.setValue(0); actsFade.setValue(1); setUndoDone(true);
            }, waitCardMetrics.undoHold);
            return () => clearTimeout(t);
        }
        const timer = setTimeout(() => {
            Animated.timing(undoFade, {
                toValue: 0,
                duration: waitCardMetrics.undoFade,
                easing: Easing.bezier(0.4, 0, 0.6, 1),
                useNativeDriver: true,
            }).start(({ finished }) => { if (finished) setUndoDone(true); });
            Animated.timing(actsFade, {
                toValue: 1,
                duration: waitCardMetrics.undoNext,
                delay: waitCardMetrics.undoNextDelay,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();
        }, waitCardMetrics.undoHold);
        return () => clearTimeout(timer);
    }, [fresh, reduceMotion, undoFade, actsFade]);

    const card = waitCard(event, presence, fresh && !undoDone);

    // ── Eşik geçişi (5 → 10 dk) ─────────────────────────────────────────
    // Seviye değiştiğinde ESKİ YÜZ üstte kalır ve söner; yenisi altından
    // açılır. Üstünden bir kez ışık geçer: müdür ekrana bakmıyorken de
    // geçişin olduğunu kenar görüşüyle fark eder.
    const [width, setWidth] = useState(0);
    const [past, setPast] = useState<WaitCardModel | null>(null);
    const cross = useRef(new Animated.Value(1)).current;
    const sweep = useRef(new Animated.Value(0)).current;
    const lastLevel = useRef(card.level);
    const lastCard = useRef(card);

    useEffect(() => {
        if (lastLevel.current === card.level) return;
        const from = lastCard.current;
        lastLevel.current = card.level;
        if (reduceMotion) { setPast(null); return; }
        setPast(from);
        cross.setValue(0);
        Animated.timing(cross, {
            toValue: 1,
            duration: waitCardMetrics.crossFade,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
        }).start(({ finished }) => { if (finished) setPast(null); });
        sweep.setValue(0);
        Animated.timing(sweep, {
            toValue: 1,
            duration: waitCardMetrics.sweep,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start();
    }, [card.level, reduceMotion, cross, sweep]);

    // Her renderdan SONRA çalışır; yukarıdaki etki bu yüzden hâlâ bir önceki
    // renderın kartını görüyor. Sıra önemli, yer değiştirmesinler.
    useEffect(() => { lastCard.current = card; });

    const press = (label: string) => { feedback.medium(); onAction?.(label); };

    const spoken = [
        `${event.firstName} ${event.lastName}`,
        card.label,
        `${card.value} ${card.unit}`,
        card.conflict ?? card.sub,
    ].filter(Boolean).join(', ');

    const faceActions = (face: WaitCardModel, live: boolean) => (
        live && fresh && !undoDone ? (
            <Animated.View style={{ opacity: undoFade }}>
                <WaitAct
                    action={{ label: 'Geri al', kind: 'ghost' }}
                    ink={ink}
                    onPress={() => press('Geri al')}
                />
            </Animated.View>
        ) : (
            <Animated.View style={{
                opacity: live && fresh ? actsFade : 1,
                alignItems: 'flex-end',
                gap: waitCardMetrics.actGap,
            }}>
                {face.actions.map((action) => (
                    <WaitAct
                        key={action.label}
                        action={action}
                        ink={ink}
                        onPress={() => press(action.label)}
                    />
                ))}
            </Animated.View>
        )
    );

    // Kartın GİRİŞİ artık CardSwap'in işi; burada yalnız eşik geçişinin
    // çapraz soldurması var. İki animasyon aynı düğüme binmiyor.
    const liveOpacity = cross;

    return (
        <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{
                borderRadius: waitCardMetrics.radius,
                backgroundColor: ink.panel,
                overflow: 'hidden',
                flexDirection: 'row',
            }}
        >
            <WaitFace
                card={card}
                ink={ink}
                pulse={pulse}
                opacity={liveOpacity}
                lift={0}
                spoken={spoken}
                actions={faceActions(card, true)}
            />

            {past ? (
                <View pointerEvents="none" style={{
                    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                    flexDirection: 'row',
                }}>
                    <WaitFace
                        card={past}
                        ink={ink}
                        pulse={pulse}
                        opacity={cross.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })}
                        lift={0}
                        spoken=""
                        actions={faceActions(past, false)}
                    />
                </View>
            ) : null}

            {past && width > 0 ? (
                <Animated.View pointerEvents="none" style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0,
                    width,
                    opacity: sweep.interpolate({
                        inputRange: [0, 0.18, 0.55, 1],
                        outputRange: [0, waitCardMetrics.sweepPeak, waitCardMetrics.sweepPeak, 0],
                    }),
                    transform: [{
                        translateX: sweep.interpolate({
                            inputRange: [0, 1], outputRange: [-width, width],
                        }),
                    }],
                }}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ flex: 1 }}
                    />
                </Animated.View>
            ) : null}
        </View>
    );
}

// ── Müdür 21 · tahsilat ve gelmedi ──────────────────────────────────────────

/**
 * Para rakamı — ₺ AYRI düğüm.
 *
 * Bekleme kartında birim ("dk") ikincil mürekkeptedir çünkü bilgi rakamdadır.
 * Parada tersine döner: ₺ rakamın kimliğinin parçası, soldurulursa tutar bir
 * süreye benzemeye başlar. Rengi aynı, boyu küçük — 34 pt'de ₺ glifi
 * rakamlardan optik taşıyor ve alt alta duran iki adisyonda hizayı bozuyor.
 */
function MoneyHero({ currency, value, color }: {
    currency: string; value: string; color: string;
}) {
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            height: waitCardMetrics.heroBox,
        }}>
            <Text style={{
                color,
                fontSize: dueCardMetrics.currency,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: dueCardMetrics.currency * -0.02,
                paddingRight: dueCardMetrics.currencyGap,
                top: -dueCardMetrics.currencyLift,
            }}>
                {currency}
            </Text>
            <Num size={waitCardMetrics.hero} style={{
                color,
                fontWeight: '800',
                letterSpacing: waitCardMetrics.hero * -0.03,
                lineHeight: waitCardMetrics.heroBox,
            }}>
                {value}
            </Num>
        </View>
    );
}

/**
 * D1/D2 — tahsilat kartı.
 *
 * Tek eylem, o da dolu hap: ikinci bir KARAR yok. Ödeme yöntemi, indirim ve
 * kalem listesi `Tahsil et`in açtığı Kasa ekranının işi — kart bir kapı.
 */
function DueCardView({ event, onAction }: {
    event: FlowEvent;
    onAction?: (label: string) => void;
}) {
    const { dark, reduceMotion } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;
    const pulse = useWaitPulse(reduceMotion);
    const card = dueCard(event);

    const hot = card.level === 'hot';
    const accent = hot ? ink.red : ink.am;
    const dotColor = hot ? ink.red : ink.amDot;

    const spoken = [
        `${event.firstName} ${event.lastName}`,
        `${card.currency}${card.value}`,
        card.label,
        card.sub,
    ].filter(Boolean).join(', ');

    return (
        <View style={{
            borderRadius: waitCardMetrics.radius,
            backgroundColor: ink.panel,
            overflow: 'hidden',
            flexDirection: 'row',
        }}>
            <PanelCard
                ink={ink}
                warn={card.level !== 'calm'}
                stripe={dotColor}
                dot={<PanelDot color={dotColor} pulse={pulse} />}
                label={card.label}
                labelColor={card.level !== 'calm' ? accent : ink.ink2}
                // Tutar HİÇBİR HÂLDE renk değiştirmez: rakam parayı gösteriyor,
                // para geciktiği için kötüleşmiyor. Yaşlanmayı çizgi, etiket ve
                // alt satır taşır.
                hero={<MoneyHero currency={card.currency} value={card.value} color={ink.ink} />}
                sub={<PanelSub ink={ink} text={card.sub} />}
                actions={(
                    <View style={{ alignItems: 'flex-end', gap: waitCardMetrics.actGap }}>
                        {card.actions.map((action) => (
                            <WaitAct
                                key={action.label}
                                action={action}
                                ink={ink}
                                onPress={() => { feedback.medium(); onAction?.(action.label); }}
                            />
                        ))}
                    </View>
                )}
                spoken={spoken}
                opacity={1}
                lift={0}
            />
        </View>
    );
}

/**
 * Tahsilatın ONAY KARTI — "Tahsil et"e basıldıktan hemen sonra.
 *
 * Kart yüzeyi, yarıçapı ve TUTAR yerinde kalır; yalnız etrafı değişir.
 * 1,6 saniye durur, sonra ince satıra iner. Bu adım olmadan müdür bastığı
 * düğmenin sonucunu göremiyordu.
 */
function PaidCardView({ event }: { event: FlowEvent }) {
    const { dark } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;
    const card = paidCard(event);

    return (
        <View style={{
            borderRadius: waitCardMetrics.radius,
            backgroundColor: ink.panel,
            overflow: 'hidden',
            flexDirection: 'row',
        }}>
            <PanelCard
                ink={ink}
                warn={false}
                stripe={ink.green}
                // Nabız YOK: bekleyen bir şey kalmadı.
                dot={<PanelDot color={ink.green} />}
                label={card.label}
                labelColor={ink.ink2}
                hero={<MoneyHero currency={card.currency} value={card.value} color={ink.ink} />}
                sub={<PanelSub ink={ink} text={card.sub} />}
                actions={(
                    <View style={{ alignItems: 'flex-end', gap: waitCardMetrics.actGap }}>
                        {card.actions.map((action) => (
                            <WaitAct key={action.label} action={action} ink={ink} onPress={() => {}} />
                        ))}
                    </View>
                )}
                spoken={`${event.firstName} ${event.lastName}, ${card.label}, ${card.currency}${card.value}, ${card.sub}`}
                opacity={1}
                lift={0}
            />
        </View>
    );
}

/**
 * D3 — tahsilat alındı. KART DEĞİL, 34 pt ince satır.
 *
 * Kart çerçevesi "burada bir şey oluyor, bak" demek için var; alınmış tahsilat
 * olmuş bitmiş bir şey. Krem yüzey ona ayrılırsa akış kalabalıklaşır ve
 * BEKLEYEN adisyonlar sıradanlaşır. Tutar kalır — müdürün gün sonunda gözle
 * toplayacağı tek şey o.
 */
function PaidLine({ event }: { event: FlowEvent }) {
    const { c } = useTheme();
    const line = paidLine(event);
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: dueCardMetrics.paidGap,
            height: dueCardMetrics.paidHeight,
            paddingHorizontal: 2,
        }}>
            <Text style={{
                color: c.tx3,
                fontSize: dueCardMetrics.paidLabel,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: dueCardMetrics.paidLabel * 0.14,
            }}>
                {upperTR(line.label)}
            </Text>
            {/* Yeşil burada MEŞRU: bu üründe yeşil "bitti" demek ve gerçekten
                bitti. Yeşil yalnız noktada; anlamı kelime taşıyor. */}
            <View style={{
                width: dueCardMetrics.paidDot,
                height: dueCardMetrics.paidDot,
                borderRadius: radius.pill,
                backgroundColor: c.gr,
            }} />
            <Text numberOfLines={1} style={{
                flex: 1,
                color: c.tx2,
                fontSize: dueCardMetrics.paidText,
                fontFamily: font.semiBold,
                fontWeight: '600',
                letterSpacing: dueCardMetrics.paidText * -0.01,
            }}>
                <Text style={{ color: c.tx, fontFamily: font.bold, fontWeight: '700' }}>
                    {line.text.split(' · ')[0]}
                </Text>
                {line.text.includes(' · ') ? ` · ${line.text.split(' · ')[1]}` : ''}
            </Text>
        </View>
    );
}

/**
 * E1/E2/E3 — gelmedi kartı.
 *
 * Kahraman rakam PARA DEĞİL, tolerans sayacı. Rakam KIRMIZI DEĞİL: kırmızı
 * etikette ve noktada, yani "ne oldu"da; rakam yalnız ölçüm. Müdür 20'de
 * rakam kırmızıya dönüyordu çünkü orada sorunun kendisi süreydi.
 *
 * NABIZ YOK — bekleyen bir şey yok, geçen bir şey var.
 */
function NoshowCardView({ event, fresh, onAction, onPill, waConnected = true }: {
    event: FlowEvent;
    fresh: boolean;
    onAction?: (label: string) => void;
    onPill?: (cell: CellKey) => void;
    waConnected?: boolean;
}) {
    const { dark } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;
    const card = noshowCard(event, fresh);
    const pillIn = pillInputOf(event, waConnected);
    const cells = pillCells(pillIn);
    const offCells = pillOff(pillIn);
    const record = pillRecordOf(event);
    const [open, setOpen] = useState(false);
    /**
     * `Yönet`in SÜTUN İÇİNDEKİ kutusu — ölçülür, varsayılmaz.
     *
     * Düğme kartın hâline göre yer DEĞİŞTİRİYOR: randevu düşmeden önce ikinci
     * sırada ve hayalet, düştükten sonra birinci sırada ve hap. Sabit bir
     * `triggerTop` ikisinden birini mutlaka ıskalar, ok ucu düğmenin kenarına
     * değmezdi.
     */
    const [trigger, setTrigger] = useState<{ width: number; y: number; height: number }>({
        width: waitCardMetrics.hapX * 2 + 48,
        y: 0,
        height: waitCardMetrics.hapHeight,
    });

    const spoken = [
        `${event.firstName} ${event.lastName}`,
        card.label,
        `${card.value} ${card.unit}`,
        card.sub,
    ].filter(Boolean).join(', ');

    return (
        // KIRPMA YOK. Burada `overflow: 'hidden'` vardı ve kırpacak bir şeyi
        // yoktu — `warn` bu kartta hep `false`, yani sol çizgi hiç çizilmiyor.
        // Kırptığı tek şey HAPIN KENDİSİYDİ: kartın üstüne açılan balonun
        // 48 pt'si kesiliyor, ekranda halkaların alt kırıntısı kalıyordu.
        <View style={{
            borderRadius: waitCardMetrics.radius,
            backgroundColor: ink.panel,
            flexDirection: 'row',
        }}>
            <PanelCard
                ink={ink}
                warn={false}
                stripe={ink.red}
                dot={<PanelDot color={ink.red} />}
                label={card.label}
                labelColor={ink.red}
                hero={(
                    <RollingHero
                        value={card.value}
                        unit={card.unit}
                        // Tükenmiş süre ikincil mürekkepte: ölçüm bitti, artık
                        // bir bilgi değil bir kayıt. Tam mürekkep kalsaydı
                        // hâlâ sayıyor gibi görünürdü.
                        color={card.spent ? ink.ink2 : ink.ink}
                        unitColor={ink.ink2}
                        unitFade={1}
                    />
                )}
                sub={<PanelSub ink={ink} text={card.sub} />}
                record={record ? <PanelRecord ink={ink} record={record} /> : null}
                actions={(
                    <View style={{ alignItems: 'flex-end', gap: waitCardMetrics.actGap }}>
                        {card.actions.flatMap((action) => {
                            /*
                             * `Yönet` açılamıyorsa ÇİZİLMİYOR (hiç göz yoksa).
                             * Numarasız müşteride Ara ve Yaz sönük durur,
                             * dokununca randevu kartı açılır (Müdür 34 · v2).
                             */
                            if (action.label === 'Yönet' && !pillOpens(cells)) return [];
                            return [(
                                <WaitAct
                                    key={action.label}
                                    action={action}
                                    ink={ink}
                                    expanded={action.label === 'Yönet' ? open : undefined}
                                    onLayout={action.label === 'Yönet' ? setTrigger : undefined}
                                    onPress={() => {
                                        if (action.label === 'Yönet') {
                                            feedback.selection();
                                            setOpen(true);
                                            return;
                                        }
                                        feedback.medium();
                                        onAction?.(action.label);
                                    }}
                                />
                            )];
                        })}

                        {/* Hap SÜTUNUN İÇİNDE — A1 paneliyle aynı yer.
                            Dışarıda dururken koordinat sistemi KARTINDI: hap
                            kartın sağ kenarına yaslanıyor, oysa `Yönet` 14 pt
                            içeride; ok ucu düğmenin ortasını 14 pt kaçırıyordu.
                            Sütunun içinde `right: 0` düğmenin kenarı demek. */}
                        {open ? (
                            <ActionPill
                                cells={cells}
                                offCells={offCells}
                                below={event.firstInList === true}
                                triggerWidth={trigger.width}
                                triggerTop={trigger.y}
                                triggerHeight={trigger.height}
                                staffInitials={event.staffInitials
                                    ?? initialsOfName(event.staffName)}
                                staffGiven={event.staffName
                                    ? splitStaffName(event.staffName).given : undefined}
                                onPick={(cell) => { setOpen(false); onPill?.(cell); }}
                                onDismiss={() => setOpen(false)}
                            />
                        ) : null}
                    </View>
                )}
                spoken={spoken}
                opacity={1}
                lift={0}
            />
        </View>
    );
}

/** Kartın dördüncü satırı — son hamle. Bayatlayınca düşer. */
function PanelRecord({ ink, record }: { ink: PanelInk; record: PillRecord }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: waitCardMetrics.stampGap,
        }}>
            <View style={{
                width: waitCardMetrics.stampDot,
                height: waitCardMetrics.stampDot,
                borderRadius: waitCardMetrics.stampDot / 2,
                backgroundColor: record.tone === 'warn' ? ink.red
                    : record.tone === 'live' ? c.or : ink.ink2,
                opacity: record.tone === 'quiet' ? 0.7 : 1,
            }} />
            <Num size={waitCardMetrics.sub} style={{
                color: ink.ink2, fontWeight: '700', letterSpacing: 0,
            }}>
                {record.text}
            </Num>
        </View>
    );
}


/**
 * Müdür 33 · iptal ve online randevu — aynı iskelet, iki farklı olay.
 *
 * İkisi de tek ya da iki eylemli, yani HAP AÇILMAZ: hap seçim sunmak için var,
 * tek eylemde düz düğme doğru olan.
 */
function SimpleCardView({ event, kind, fresh, onAction }: {
    event: FlowEvent;
    kind: 'cancelled' | 'booked';
    fresh: boolean;
    onAction?: (label: string) => void;
}) {
    const { dark } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;
    const card = kind === 'cancelled' ? cancelledCard(event) : bookedCard(event, fresh);
    const pending = kind === 'booked' && event.pending === true;
    const tone = kind === 'cancelled' ? ink.red : pending ? ink.am : ink.green;

    const spoken = [
        `${event.firstName} ${event.lastName}`,
        card.label,
        `${card.value} ${card.unit}`,
        card.sub,
    ].filter(Boolean).join(', ');

    return (
        <View style={{
            borderRadius: waitCardMetrics.radius,
            backgroundColor: ink.panel,
            overflow: 'hidden',
            flexDirection: 'row',
        }}>
            <PanelCard
                ink={ink}
                warn={kind === 'cancelled'}
                stripe={ink.red}
                dot={<PanelDot color={kind === 'cancelled' ? ink.red : pending ? ink.amDot : ink.green} />}
                label={card.label}
                labelColor={tone}
                hero={(
                    <RollingHero
                        value={card.value}
                        unit={card.unit}
                        color={card.spent ? ink.ink2 : ink.ink}
                        unitColor={ink.ink2}
                        unitFade={1}
                    />
                )}
                sub={<PanelSub ink={ink} text={card.sub} />}
                actions={(
                    <View style={{ alignItems: 'flex-end', gap: waitCardMetrics.actGap }}>
                        {card.actions.map((action) => (
                            <WaitAct
                                key={action.label}
                                action={action}
                                ink={ink}
                                onPress={() => { feedback.medium(); onAction?.(action.label); }}
                            />
                        ))}
                    </View>
                )}
                spoken={spoken}
                opacity={1}
                lift={0}
            />
        </View>
    );
}

/**
 * Devir satırı — KART DEĞİL, bilerek.
 *
 * Kart bir soru sorar ("bak ve karar ver"); devirde karar yok, saniyeler var.
 * Krem yüzey burada yalancı bir aciliyet üretirdi. Sayaç da yok: devir 5-20
 * saniyelik bir aralık, dakika birimli sayaç "0 dk" gösterirdi.
 */
function HandoffRow({ event }: { event: FlowEvent }) {
    const { c, reduceMotion } = useTheme();
    const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

    useEffect(() => {
        if (reduceMotion) { enter.setValue(1); return; }
        Animated.timing(enter, {
            toValue: 1,
            duration: 320,
            delay: 80,
            easing: Easing.bezier(0.2, 0.8, 0.25, 1),
            useNativeDriver: true,
        }).start();
    }, [enter, reduceMotion]);

    const name = event.staffName?.trim() ?? '';
    return (
        <Animated.View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: waitCardMetrics.handGap,
            height: waitCardMetrics.handHeight,
            paddingHorizontal: 2,
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        }}>
            <Text style={{
                color: c.tx3,
                fontSize: waitCardMetrics.handLabel,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: waitCardMetrics.handLabel * 0.14,
            }}>
                {upperTR('devir')}
            </Text>
            <Animated.View style={{
                width: waitCardMetrics.handAvatar,
                height: waitCardMetrics.handAvatar,
                borderRadius: radius.pill,
                borderWidth: waitCardMetrics.handAvatarBorder,
                borderColor: c.or,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }],
            }}>
                <Text style={{
                    color: c.tx,
                    fontSize: waitCardMetrics.handAvatarText,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                }}>
                    {event.staffInitials ?? ''}
                </Text>
            </Animated.View>
            <Text numberOfLines={1} style={{
                flex: 1,
                color: c.tx2,
                fontSize: waitCardMetrics.handText,
                fontFamily: font.semiBold,
                fontWeight: '600',
                letterSpacing: waitCardMetrics.handText * -0.01,
            }}>
                <Text style={{ color: c.tx, fontFamily: font.bold, fontWeight: '700' }}>{name}</Text>
                {' boşaldı, buna geçiyor'}
            </Text>
        </Animated.View>
    );
}

export function FlowRow({
    event, onAction, onMore, onOpenCustomer, onPill, presence = [], fresh = false,
    waConnected = true, inLine = false,
}: {
    event: FlowEvent;
    onAction?: (label: string) => void;
    /** Eylem hapından seçilen göz. Hap yalnız A1 ve gelmedi kartlarında var. */
    onPill?: (cell: CellKey) => void;
    /** Salonun WhatsApp bağlantısı — `Yaz` gözünün hâlini belirler. */
    waConnected?: boolean;
    onMore?: (event: FlowEvent) => void;
    /** Müşteri balonu buraya bağlanır; verilmezse balon basılmaz olur. */
    onOpenCustomer?: (event: FlowEvent) => void;
    /**
     * Personel şeridinin gerçek durumu. A2 kartındaki "Selin şu an işlemde"
     * satırı buradan TÜRETİLİR; sabit metin yazılmaz, personel boşsa satır
     * hiç çizilmez.
     */
    presence?: readonly StaffPresence[];
    /**
     * Müdür "Geldi"ye BU OTURUMDA bastı. Bekleme kartı o zaman önce geri almayı
     * sunar (5 sn), sonra eylemlere geçer. Sunucudan gelen bir bekleme satırı
     * taze DEĞİLDİR: geri alınacak bir basış yok.
     */
    fresh?: boolean;
    /**
     * Zamanında giden randevular arasında SIRADA olan bu mu? Ekran hesaplar
     * (`nextInLineId`), satır yalnız taşır — bir satır tek başına ötekilere
     * bakıp "ben sıradayım" diyemez.
     */
    inLine?: boolean;
}) {
    const { c, dark } = useTheme();
    const actions = actionsOf(event.kind);

    // Müdür 17 — sıradaki randevu kendi kartını çizer. Hangi kart olduğu
    // VERİDEN gelir: bağlam yoksa A1 (ters panel + geri sayım), bağlam varsa
    // A2 (müşteri dosyası). Gecikme ikisinin de bir hâli, üçüncü kart değil.
    const isNext = event.kind === 'next';
    const card = isNext ? nextCardKind(event) : null;
    const ink = dark ? panelInk.dark : panelInk.light;

    // Müdür 20 — bekleme satırının etiketi seviyeye göre değişir; satır ve
    // kart AYNI kelimeyi söyler, iki ayrı sözlük olmaz.
    const waiting = event.kind === 'arrived' ? waitCard(event, presence, fresh) : null;
    // Müdür 21 — düşmüş randevu "gelmedi"den başka bir şeydir; etiketi de öyle.
    // Dünden devreden adisyonun satırı da kırmızıya döner: kapanmamış bir gün
    // bugünün akışında amber kalamaz.
    const gone = event.kind === 'noshow';
    const carried = event.kind === 'due' && dueLevel(event) === 'hot';
    // Müdür 35 — "sıradaki" bir SIRA İDDİASIDIR ve tekildir: iki satır aynı
    // anda sıradaki olamaz. Geciken satır kartla aynı kelimeyi söyler.
    const overdue = isNext && isLate(event.etaMinutes);
    const kindLabel = waiting ? waiting.label
        : gone ? noshowRowLabel()
            : isNext ? nextRowLabel(event, inLine === true)
                : labelOf(event.kind);
    const kindColor = waiting
        ? (waiting.level === 'late' ? c.rd : c.am)
        // Geciken randevu da kırmızı: kelime "GECİKTİ" derken nokta ve yazı
        // sakin kalamaz — `arrived` ve `noshow` da böyle yapıyor.
        : gone || carried || overdue ? c.rd
            : event.kind === 'due' ? c.am
                : c.tx2;

    // Yuvada şu an hangi kart var? Kimlik değişimi soldurmayı tetikler.
    // Tahsilat alındığında kart ÖNCE onay hâlinde durur (1,6 sn), sonra ince
    // satıra iner. İki ayrı yuva kimliği, iki ayrı geçiş.
    const holding = useHold(event.kind === 'paid' && fresh, dueCardMetrics.settleHold);
    const slot = event.elapsedSeconds != null ? 'live'
        : waiting ? (event.handoff ? 'hand' : 'wait')
            : event.kind === 'due' ? 'due'
                : event.kind === 'paid' ? (holding ? 'settled' : 'paid')
                    : gone ? 'gone'
                        : event.kind === 'cancelled' ? 'cancelled'
                            : event.kind === 'booked' ? 'booked'
                                : card ?? 'none';
    // Süre ÇİFTE göre değişir; tasarım her geçişe ayrı ölçü veriyor.
    // Tahsilat kartının ince satıra dönüşü kendi ölçüsünde (300/240): kart
    // önce tamamen kaybolur, yükseklik GÖRÜNMEZKEN düşer, sonra satır belirir.
    const slotTiming = slot === 'live' ? cardSwap.start
        : slot === 'hand' ? cardSwap.handoff
            : slot === 'paid' ? cardSwap.settle
                : cardSwap.press;

    // Nokta da kelimeyle aynı şeyi söyler: satır "GECİKTİ" derken nokta
    // turuncu kalamazdı — turuncu bu üründe zaman ve eylem, risk değil.
    const kindTone = (waiting && waiting.level === 'late') || carried || overdue
        ? 'red' : toneOf(event.kind);
    const kind = useSwapped(`${kindLabel}|${kindColor}`, {
        label: kindLabel, color: kindColor, tone: kindTone,
    });

    return (
        <View style={{
            flexDirection: 'row',
            gap: flowMetrics.rowGap,
            paddingVertical: flowMetrics.rowY,
            paddingHorizontal: flowMetrics.rowX,
            // Alınmış tahsilat akışın geri kalanından daha sönük (0.5 · 0.62):
            // tasarımın gerekçesi, bekleyen adisyonların yanında sıradanlaşması.
            opacity: event.kind === 'paid' ? dueCardMetrics.paidOpacity
                : isSettled(event.kind) ? flowMetrics.settledOpacity : 1,
        }}>
            <Num size={flowMetrics.timeSize} style={{
                width: flowMetrics.timeWidth,
                paddingTop: flowMetrics.timeTop,
                color: c.tx2,
                fontFamily: font.medium,
                fontWeight: '600',
            }}>
                {event.time}
            </Num>

            <View style={{ flex: 1, minWidth: 0, gap: flowMetrics.bodyGap }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: flowMetrics.kindGap }}>
                    {/* Nokta ve kelime birlikte söner; ⋮ dışarıda kalır —
                        etiket değişirken menünün de yanıp sönmesi gereksiz. */}
                    <Animated.View style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: flowMetrics.kindGap,
                        opacity: kind.opacity,
                    }}>
                        <KindDot tone={kind.shown.tone} />
                        <Text numberOfLines={1} style={{
                            flexShrink: 1,
                            color: kind.shown.color,
                            fontSize: flowMetrics.kindSize,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: flowMetrics.kindSize * 0.06,
                        }}>
                            {upperTR(kind.shown.label)}
                        </Text>
                    </Animated.View>
                    {onMore ? <DotsButton onPress={() => onMore(event)} /> : null}
                </View>

                {card === 'a2' ? null : (
                <CustomerBubble event={event} onOpen={onOpenCustomer}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: flowMetrics.nameFirst,
                            fontFamily: font.medium,
                            fontWeight: '500',
                            letterSpacing: flowMetrics.nameFirst * -0.02,
                        }}>
                            {event.firstName}
                        </Text>
                        <Text numberOfLines={1} style={{
                            flex: 1,
                            color: c.tx,
                            fontSize: flowMetrics.nameLast,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: flowMetrics.nameLast * -0.03,
                        }}>
                            {event.lastName}
                        </Text>
                    </View>
                </CustomerBubble>
                )}

                {card === 'a2' ? null : (
                <Text style={{
                    color: c.tx2,
                    fontSize: flowMetrics.detailSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    lineHeight: flowMetrics.detailSize * flowMetrics.detailLine,
                }}>
                    {event.detail}
                </Text>
                )}

                {/* Kartlar TEK YUVADA durur ve birbirine dönüşür.
                    Ayrı ayrı takılıp sökülselerdi her geçiş bir karelik sert
                    kesme olurdu; tasarımın altı hareketi de iki şeyin üst üste
                    binmesine dayanıyor. Yuvanın kimliği değişince soldurma
                    kendiliğinden başlar. */}
                <CardSwap id={slot} timing={slotTiming}>
                    {card === 'a1' ? (
                        <EtaPanel
                            event={event}
                            ink={ink}
                            onAction={onAction}
                            onPill={onPill}
                            waConnected={waConnected}
                        />
                    ) : null}
                    {card === 'a2' ? <CustomerCard event={event} presence={presence} onAction={onAction} onOpenCustomer={onOpenCustomer} onPill={onPill} waConnected={waConnected} /> : null}
                    {/* Müdür 20 — devir anında kart yerine ince satır: müdürün
                        yapacağı bir şey yok, kart yalancı aciliyet üretirdi. */}
                    {waiting && event.handoff ? <HandoffRow event={event} /> : null}
                    {waiting && !event.handoff ? (
                        <WaitCardView
                            event={event}
                            presence={presence}
                            fresh={fresh}
                            onAction={onAction}
                        />
                    ) : null}
                    {event.elapsedSeconds != null ? <LiveStrip event={event} enter={fresh} /> : null}
                    {/* Müdür 21 — tahsilat kartı, alınmış tahsilatın ince
                        satırı ve gelmedi kartı. Üçü de aynı yuvada. */}
                    {slot === 'due' ? <DueCardView event={event} onAction={onAction} /> : null}
                    {slot === 'settled' ? <PaidCardView event={event} /> : null}
                    {slot === 'paid' ? <PaidLine event={event} /> : null}
                    {slot === 'gone' ? (
                        <NoshowCardView
                            event={event}
                            fresh={fresh}
                            onAction={onAction}
                            onPill={onPill}
                            waConnected={waConnected}
                        />
                    ) : null}
                    {slot === 'cancelled' ? (
                        <SimpleCardView event={event} kind="cancelled" fresh={fresh} onAction={onAction} />
                    ) : null}
                    {slot === 'booked' ? (
                        <SimpleCardView event={event} kind="booked" fresh={fresh} onAction={onAction} />
                    ) : null}
                </CardSwap>

                {/* Tolerans rozeti KALDIRILDI: geri sayım artık kartın kendi
                    alt satırında ("22 dk sonra düşer"). Kartın ALTINDA ayrı
                    bir şerit, kart bitip başka bir şey başlıyor gibi
                    okunuyordu — Müdür 32 · §2.1'de reddedildi. */}

                {!isNext && slot !== 'due' && slot !== 'paid' && slot !== 'settled' && slot !== 'gone'
                    && (actions.length > 0 || event.amount) ? (
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: flowMetrics.actionsGap,
                        marginTop: flowMetrics.actionsTop,
                    }}>
                        {event.amount ? (
                            <Num size={flowMetrics.amountSize} style={{
                                color: c.tx,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: flowMetrics.amountSize * -0.03,
                            }}>
                                {event.amount}
                            </Num>
                        ) : null}
                        {actions.map((action) => (
                            <Pressable
                                key={action.label}
                                accessibilityRole="button"
                                onPress={() => { feedback.medium(); onAction?.(action.label); }}
                                style={{
                                    height: flowMetrics.pillHeight,
                                    paddingHorizontal: flowMetrics.pillX,
                                    borderRadius: radius.pill,
                                    justifyContent: 'center',
                                    backgroundColor: action.kind === 'primary' ? c.or : c.surf2,
                                    borderWidth: action.kind === 'primary' ? 0 : 1,
                                    borderColor: c.bd2,
                                }}
                            >
                                <Text style={{
                                    color: action.kind === 'primary' ? '#FFFFFF' : c.tx,
                                    fontSize: flowMetrics.pillText,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                    letterSpacing: flowMetrics.pillText * -0.02,
                                }}>
                                    {action.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                ) : null}
            </View>
        </View>
    );
}

/** Saç teli ayırıcı — satırlar arasında, kenarlardan içeride. */
export function FlowDivider() {
    const { c } = useTheme();
    return (
        <View style={{ height: 1, marginHorizontal: flowMetrics.rowX, backgroundColor: c.bd }} />
    );
}

/** Akış GÜNDE BİTER. Sonsuz kaydırma yok; dünü görmek ayrı bir eylem. */
/**
 * Akışın BOŞ hâli.
 *
 * Boş ekran bir son değil bir davettir: ne olduğunu değil, NE OLACAĞINI
 * söyler. Müdür bunu günün başında görür — o an bir hata olduğunu değil,
 * günün henüz başlamadığını anlamalı.
 *
 * Tasarım dosyasında müdür akışının boş hâli YOK (Durumlar.html yalnız
 * personel modunu çiziyor); burası aynı sözlükle kurulmuş sade bir karşılık.
 */
export function FlowEnd({ label }: { label: string }) {
    const { c } = useTheme();
    return (
        <Text style={{
            textAlign: 'center',
            paddingVertical: flowMetrics.endY,
            color: c.tx3,
            fontSize: flowMetrics.endSize,
            fontFamily: font.medium,
            fontWeight: '600',
        }}>
            {label}
        </Text>
    );
}

/**
 * Müdür 05'in başlık kartı: kim, hangi durumda, ne kadar süredir.
 *
 * Personelin kendi ekranında böyle bir kart YOK — kendi kim olduğunu bilir.
 * Müdür şeritten bir avatara dokunup geldiği için ilk soru "kime baktım": kart
 * onu cevaplıyor, altındaki canlı şerit de "şu an ne yapıyor"u.
 */
export function StaffLiveHero({ person, customerName, service, startedAt, elapsedSeconds }: {
    person: StaffPresence;
    customerName?: string;
    service?: string;
    startedAt?: string;
    elapsedSeconds?: number;
}) {
    const { c } = useTheme();
    const busy = person.state === 'busy';
    const tone = busy ? c.gr : person.state === 'free' ? c.gr : person.state === 'leave' ? c.am : c.tx2;
    const word = busy
        ? `işlemde${customerName ? ` · ${customerName}` : ''}`
        : person.state === 'free' ? 'müsait'
            : person.state === 'leave' ? 'izinli' : 'bugün çalışmıyor';

    return (
        <View style={{ paddingHorizontal: flowMetrics.rowX, paddingVertical: flowMetrics.stripY }}>
            <View style={{
                borderRadius: radius.xl,
                borderWidth: 1,
                borderColor: c.bd,
                backgroundColor: c.card,
                padding: flowMetrics.heroCardPadding,
                gap: flowMetrics.heroCardGap,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{
                        width: flowMetrics.heroRingBig,
                        height: flowMetrics.heroRingBig,
                        borderRadius: radius.pill,
                        borderWidth: busy ? flowMetrics.ringBorderBusy : flowMetrics.ringBorder,
                        borderColor: busy ? c.or : c.bd2,
                        borderStyle: person.state === 'leave' ? 'dashed' : 'solid',
                        backgroundColor: c.surf2,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: flowMetrics.heroRingBigText,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                        }}>
                            {person.initials}
                        </Text>
                        {busy && person.minutes != null ? (
                            <View style={{
                                position: 'absolute',
                                bottom: flowMetrics.badgeOffset,
                                height: flowMetrics.badgeHeight,
                                paddingHorizontal: flowMetrics.badgeX,
                                borderRadius: radius.pill,
                                backgroundColor: c.or,
                                justifyContent: 'center',
                            }}>
                                <Text style={{
                                    color: '#FFFFFF',
                                    fontSize: flowMetrics.badgeText,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                    ...numeric,
                                }}>
                                    {durationBadge(person.minutes)}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={1} style={{
                            color: c.tx,
                            fontSize: flowMetrics.heroNameSize,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: flowMetrics.heroNameSize * -0.03,
                        }}>
                            {person.name}
                        </Text>
                        {/* Durum çipi: renk ve KELİME birlikte. */}
                        <View style={{
                            alignSelf: 'flex-start',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: flowMetrics.miniGapInner,
                            height: flowMetrics.statChipHeight,
                            paddingHorizontal: flowMetrics.statChipX,
                            borderRadius: flowMetrics.statChipRadius,
                            backgroundColor: `${tone}22`,
                        }}>
                            <View style={{
                                width: flowMetrics.statChipDot,
                                height: flowMetrics.statChipDot,
                                borderRadius: radius.pill,
                                backgroundColor: tone,
                            }} />
                            <Text numberOfLines={1} style={{
                                color: tone,
                                fontSize: flowMetrics.statChipText,
                                fontFamily: font.bold,
                                fontWeight: '700',
                            }}>
                                {word}
                            </Text>
                        </View>
                    </View>
                </View>

                {busy && elapsedSeconds != null ? (
                    <LiveStrip
                        event={{
                            id: person.id,
                            time: '',
                            kind: 'started',
                            firstName: '',
                            lastName: '',
                            detail: '',
                            elapsedSeconds,
                            startedAt: service && startedAt ? `${service} · ${startedAt}` : startedAt,
                        }}
                    />
                ) : null}
            </View>
        </View>
    );
}
