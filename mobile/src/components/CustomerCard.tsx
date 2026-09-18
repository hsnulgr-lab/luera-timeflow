import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    Animated, Easing, Pressable, ScrollView, Text, View,
    type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { feedback } from '../lib/feedback';
import {
    displayPhone, formatTRY, nameLines,
    type CustomerCard as CustomerCardType,
} from '../lib/customerCard';
import { font, onAccent, useTheme } from '../theme';

/**
 * Müdür 23 v2 — Müşteri kartı, sıfırdan.
 *
 * Kart bir belge değil, bir CEVAP. İlk sorusu: bu hizmeti bu kişiye verebilir
 * miyim? v1'in kahraman alanı 852 pt'lik ekranda ~440 pt harcıyor ve
 * karşılığında ad, telefon ve tek satır uyarı veriyordu. v2'de kimlik 123
 * pt'lik bir başlık: gradyan yok, monogram yok. Kazanılan yer iki soruya
 * gidiyor — bu kişide bilmem gereken ne var, bu kişiye ne veremem.
 *
 * ── Risk bir BLOK, borç bir SATIR ───────────────────────────────────────────
 * Risk kartın en üstünde, kendi yüzeyi, 4 pt kırmızı omurgası ve kapalı
 * hizmetleri taşıyan alt bölmesiyle. Borç Hesap bölümünde bir satır: yüzey
 * yok, omurga yok. Para kaybı geri alınabilir, zarar geri alınamaz.
 *
 * ── Ölü kontrol sayımı: sıfır ───────────────────────────────────────────────
 * Her hedef bir yere gidiyor: Ara · WhatsApp (çubukta) · yaklaşan randevu
 * satırı → randevu kartı · Randevu ver · Not ekle/düzenle → not sayfası ·
 * Tüm geçmişi aç → geçmiş listesi. Tahsilat YOK: para tek yerde, Kasa'da.
 *
 * ── Müdür 35 · iki kapı ─────────────────────────────────────────────────────
 * • "Randevu ver" kimliğin ve risk bloğunun HEMEN ALTINDA, 48 pt, kartın tek
 *   dolu turuncu yüzeyi: kaydırmasız, yaklaşan randevu olsun olmasın aynı
 *   yerde. Müdür düğmeye basmadan önce neyin kapalı olduğunu okumuş olur.
 * • "Paket sat" Hesap bölümünün eylemi — yalnız güzellik/kuaför (masaüstü de
 *   çekmeceyi yalnız orada açıyor).
 *
 * ── Borç: müşterinin toplamı DEĞİL, paketin kendi kalanı ────────────────────
 * Tasarım (A3) ayrı bir "borç" satırı çiziyor. Masaüstünün toplam formülü
 * (`patientBalance.ts`) salonda serbest hizmet ödemesini de paket borcundan
 * düşüyor — 500 ₺'lik saç kesimi 9.000 ₺'lik ödenmemiş paketi 8.500 ₺ gösterir.
 * Kullanıcı kararı (2026-09-18): her paket satırı KENDİ kalanını söyler
 * (bedel − o pakete bağlı tahsilat). Toplam borç satırı ve "Borç yok" YOK.
 *
 * Kaynak: `Downloads/123/Luera Mobil - Mudur 23 Musteri Karti v2.html` ·
 * `Downloads/finalssooo/A-paket-sat.html`.
 */

export interface CustomerCardProps {
    card: CustomerCardType;
    onBack: () => void;
    onCall?: () => void;
    onWhatsApp?: () => void;
    onBook?: () => void;
    /** Yaklaşan randevu satırı → Müdür 25 randevu kartı. */
    onOpenUpcoming?: (id: string) => void;
    /** Not sayfası — ham metni düzenler. */
    onEditNote?: () => void;
    onOpenHistory?: () => void;
    /** Müdür 35 · Paket sat sayfası. */
    onSellPackage?: () => void;
    /**
     * Son satışın izi: yeni satır bir kez belirir; yazılamadıysa sebep ve
     * "Yeniden dene". Onay mesajı YOK — satırın kendisi onay.
     */
    sale?: { freshPlanId: string | null; failure: string | null; retrying: boolean };
    onRetrySale?: () => void;
}

/** Hareket sözlüğü — tasarımın "Hareket" tablosu. */
const EASE = Easing.bezier(0.215, 0.61, 0.355, 1);
const RISK_IN = { ms: 180, delay: 60, lift: 8 };
const CHIP_IN = { ms: 140, delays: [50, 90], lift: 6 };
const TITLE_FADE_MS = 140;

export function CustomerCard({
    card, onBack, onCall, onWhatsApp, onBook, onOpenUpcoming, onEditNote, onOpenHistory,
    onSellPackage, sale, onRetrySale,
}: CustomerCardProps) {
    const { c, dark, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();

    const { given, family } = useMemo(() => nameLines(card.name), [card.name]);
    const phone = useMemo(() => displayPhone(card), [card]);
    const flags = card.flags ?? [];
    const closed = card.closed ?? [];
    const fields = card.fields ?? [];
    const packages = card.packages ?? [];
    const visits = card.visitCount ?? 0;

    // ── Kaydırınca çubuk başlığı ────────────────────────────────────────────
    // Kimlik bloğunun alt kenarı çubuğun altına geçince ad çubukta belirir.
    // 8 pt histerezis: sınırda titremez.
    const [identityBottom, setIdentityBottom] = useState(0);
    const [scrolled, setScrolled] = useState(false);
    const titleFade = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(titleFade, {
            toValue: scrolled ? 1 : 0,
            duration: reduceMotion ? 0 : TITLE_FADE_MS,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start();
    }, [scrolled, reduceMotion, titleFade]);
    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (identityBottom <= 0) return;
        const y = event.nativeEvent.contentOffset.y;
        if (!scrolled && y > identityBottom + 4) setScrolled(true);
        else if (scrolled && y < identityBottom - 4) setScrolled(false);
    };

    // ── Risk bloğu girişi: bir kez, nabız yok ───────────────────────────────
    const riskIn = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
    const chipIn = useRef([0, 1].map(() => new Animated.Value(reduceMotion ? 1 : 0))).current;
    useEffect(() => {
        if (reduceMotion || flags.length === 0) {
            riskIn.setValue(1);
            chipIn.forEach((value) => value.setValue(1));
            return;
        }
        Animated.parallel([
            Animated.timing(riskIn, {
                toValue: 1, duration: RISK_IN.ms, delay: RISK_IN.delay, easing: EASE, useNativeDriver: true,
            }),
            ...chipIn.map((value, index) => Animated.timing(value, {
                toValue: 1,
                duration: CHIP_IN.ms,
                delay: RISK_IN.delay + CHIP_IN.delays[index],
                easing: EASE,
                useNativeDriver: true,
            })),
        ]).start();
    // Kart bellekte kalıyor; blok dönüşte yeniden OYNAMAZ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const riskFill = dark ? 'rgba(224,114,114,0.10)' : 'rgba(201,64,64,0.07)';
    const riskEdge = dark ? 'rgba(224,114,114,0.30)' : 'rgba(201,64,64,0.30)';
    const riskDivider = dark ? 'rgba(224,114,114,0.22)' : 'rgba(201,64,64,0.20)';
    const chipEdge = dark ? 'rgba(224,114,114,0.44)' : 'rgba(201,64,64,0.40)';

    const riskSpeech = flags.length > 0
        ? [
            'Uyarı, hizmet kapalı.',
            ...flags.map((flag) => (flag.note ? `${flag.label}, ${flag.note}.` : `${flag.label}.`)),
            closed.length > 0 ? `Bu müşteriye verilemez: ${closed.join(', ')}.` : '',
        ].filter(Boolean).join(' ')
        : '';

    const metrics = [
        card.frequency ? { label: 'SIKLIK', value: card.frequency, num: false } : null,
        card.totalPaid != null && visits > 0
            ? { label: 'TOPLAM ÖDENEN', value: `₺${formatTRY(card.totalPaid)}`, num: true }
            : null,
        card.topService ? { label: 'EN ÇOK', value: card.topService, num: false } : null,
    ].filter((cell): cell is { label: string; value: string; num: boolean } => cell !== null);

    const canSell = Boolean(card.canSellPackage && onSellPackage);
    const failure = sale?.failure ?? null;
    const hasAccount = packages.length > 0 || canSell || Boolean(failure);

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            {/* ── Kabuk çubuğu — opak, camsız ────────────────────────────── */}
            <View style={{
                height: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 4,
                paddingRight: 10,
                backgroundColor: c.bg,
            }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Geri"
                    onPress={() => { feedback.selection(); onBack(); }}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                        <Path d="M15 5l-7 7 7 7" stroke={c.tx} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                </Pressable>
                <Animated.Text
                    numberOfLines={1}
                    importantForAccessibility="no"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        opacity: titleFade,
                        color: c.tx,
                        fontSize: 15.5,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: 15.5 * -0.02,
                    }}
                >
                    {card.name}
                </Animated.Text>
                {/* Telefon yoksa haplar HİÇ çizilmez; yokluğu kimlik söylüyor. */}
                {phone && onCall ? <Tap label="Ara" onPress={onCall} /> : null}
                {phone && onWhatsApp ? <Tap label="WhatsApp" onPress={onWhatsApp} /> : null}
                {/* Alt kenarlık ayrı bir katman olarak solar — renk animasyonu yok. */}
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0, height: 1,
                        backgroundColor: c.bd, opacity: titleFade,
                    }}
                />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={onScroll}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
            >
                {/* ── Kimlik ───────────────────────────────────────────────── */}
                <View
                    onLayout={(event) => {
                        const { y, height } = event.nativeEvent.layout;
                        setIdentityBottom(y + height);
                    }}
                    accessible
                    accessibilityLabel={[card.name, phone ?? 'telefon yok', card.since].filter(Boolean).join(', ')}
                    style={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 13, gap: 3 }}
                >
                    <Text style={{
                        color: c.tx,
                        fontSize: 26,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: 26 * -0.03,
                        lineHeight: 26 * 1.1,
                    }}>
                        {given ? (
                            <Text style={{ color: c.tx2, fontFamily: font.medium, fontWeight: '500' }}>
                                {given}{' '}
                            </Text>
                        ) : null}
                        {family}
                    </Text>
                    <Text style={{
                        color: phone ? c.tx2 : c.tx3,
                        fontSize: phone ? 13 : 12,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        fontVariant: ['tabular-nums'],
                    }}>
                        {phone ?? 'telefon yok'}
                    </Text>
                    {card.since ? (
                        <Text style={{ color: c.tx3, fontSize: 12, fontFamily: font.semiBold, fontWeight: '600' }}>
                            {card.since}
                            {visits > 0 ? ` · ${visits} ziyaret` : ''}
                        </Text>
                    ) : null}
                </View>

                {/* ── Risk bloğu — okunmadan geçilemeyecek yerde ───────────── */}
                {flags.length > 0 ? (
                    <Animated.View
                        accessible
                        accessibilityLabel={riskSpeech}
                        style={{
                            marginTop: 1,
                            marginHorizontal: 16,
                            marginBottom: 14,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: riskEdge,
                            backgroundColor: riskFill,
                            flexDirection: 'row',
                            overflow: 'hidden',
                            opacity: riskIn,
                            transform: [{
                                translateY: riskIn.interpolate({ inputRange: [0, 1], outputRange: [RISK_IN.lift, 0] }),
                            }],
                        }}
                    >
                        <View style={{ width: 4, backgroundColor: c.rd }} />
                        <View style={{ flex: 1, minWidth: 0, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 11, gap: 9 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.rd }} />
                                <Caps color={c.rd}>UYARI · HİZMET KAPALI</Caps>
                            </View>
                            {flags.map((flag) => (
                                <View key={flag.label} style={{ gap: 2 }}>
                                    <Text style={{
                                        color: c.tx, fontSize: 15.5, fontFamily: font.extraBold, fontWeight: '800',
                                        letterSpacing: 15.5 * -0.02, lineHeight: 15.5 * 1.2,
                                    }}>
                                        {flag.label}
                                    </Text>
                                    {flag.note ? (
                                        <Text style={{
                                            color: c.tx2, fontSize: 13, fontFamily: font.medium, fontWeight: '500',
                                            lineHeight: 13 * 1.35,
                                        }}>
                                            {flag.note}
                                        </Text>
                                    ) : null}
                                </View>
                            ))}
                            {closed.length > 0 ? (
                                <>
                                    <View style={{ height: 1, backgroundColor: riskDivider }} />
                                    <View style={{ gap: 7 }}>
                                        <Caps color={c.tx3}>BU MÜŞTERİYE VERİLEMEZ</Caps>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                            {closed.map((label, index) => {
                                                // Basamak yalnız ilk iki çipte; ötekiler ikinciye biner.
                                                const value = chipIn[Math.min(index, 1)];
                                                return (
                                                    <Animated.View
                                                        key={label}
                                                        style={{
                                                            height: 30,
                                                            paddingHorizontal: 10,
                                                            borderRadius: 8,
                                                            borderWidth: 1,
                                                            borderColor: chipEdge,
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            opacity: value,
                                                            transform: [{
                                                                translateY: value.interpolate({
                                                                    inputRange: [0, 1], outputRange: [CHIP_IN.lift, 0],
                                                                }),
                                                            }],
                                                        }}
                                                    >
                                                        <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
                                                            <Path d="M6 6l12 12M18 6L6 18" stroke={c.rd} strokeWidth={3.4} strokeLinecap="round" />
                                                        </Svg>
                                                        <Text style={{
                                                            color: c.tx, fontSize: 13, fontFamily: font.bold, fontWeight: '700',
                                                        }}>
                                                            {label}
                                                        </Text>
                                                    </Animated.View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </>
                            ) : null}
                        </View>
                    </Animated.View>
                ) : null}

                {/* ── Randevu ver — kimlik ve riskin altında, tek dolu turuncu ── */}
                {onBook ? <BookButton onPress={onBook} /> : null}

                {/* ── Yaklaşan randevu → randevu kartı ─────────────────────── */}
                {card.upcoming ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Yaklaşan randevu, ${card.upcoming.date} ${card.upcoming.time}, ${card.upcoming.service}`}
                        disabled={!card.upcomingId || !onOpenUpcoming}
                        onPress={() => {
                            if (!card.upcomingId || !onOpenUpcoming) return;
                            feedback.selection();
                            onOpenUpcoming(card.upcomingId);
                        }}
                        style={({ pressed }) => ({
                            minHeight: 52,
                            paddingVertical: 9,
                            paddingHorizontal: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 11,
                            borderTopWidth: 1,
                            borderBottomWidth: 1,
                            borderColor: c.bd,
                            backgroundColor: pressed ? c.surf2 : 'transparent',
                        })}
                    >
                        <Dot color={c.or} />
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Text style={{
                                color: c.or, fontSize: 15, fontFamily: font.extraBold, fontWeight: '800',
                                letterSpacing: 15 * -0.02, fontVariant: ['tabular-nums'],
                            }}>
                                {card.upcoming.date} · {card.upcoming.time}
                            </Text>
                            <Sub>
                                {[card.upcoming.service, card.upcoming.staff ? `${card.upcoming.staff} ile` : null]
                                    .filter(Boolean).join(' · ')}
                            </Sub>
                        </View>
                        {card.upcomingId && onOpenUpcoming ? <Chevron color={c.tx3} /> : null}
                    </Pressable>
                ) : null}

                {/* ── Hesap: paketler; her satır kendi kalanını söyler (bkz. başlık) ── */}
                {hasAccount ? (
                    <>
                        <SectionHead title="HESAP" />
                        {failure ? (
                            <>
                                <FadeIn>
                                    <View
                                        accessible
                                        accessibilityLiveRegion="polite"
                                        accessibilityLabel={`Paket oluşturulamadı, ${failure}`}
                                        style={{
                                            minHeight: 52, paddingVertical: 9, paddingHorizontal: 16,
                                            flexDirection: 'row', alignItems: 'center', gap: 11,
                                        }}
                                    >
                                        <Dot color={c.rd} />
                                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                            <Title>Paket oluşturulamadı</Title>
                                            <Text style={{
                                                color: c.rd, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500',
                                                lineHeight: 12.5 * 1.3,
                                            }}>
                                                {failure}
                                            </Text>
                                        </View>
                                    </View>
                                </FadeIn>
                                {onRetrySale ? (
                                    <Act
                                        label={sale?.retrying ? 'Deneniyor…' : 'Yeniden dene'}
                                        onPress={() => { if (!sale?.retrying) onRetrySale(); }}
                                        style={{ marginBottom: 10 }}
                                    />
                                ) : null}
                            </>
                        ) : null}
                        {packages.map((pack, index) => {
                            const left = Math.max(0, pack.total - pack.used);
                            const owed = pack.owed != null && pack.owed > 0 ? pack.owed : null;
                            const row = (
                                <View
                                    accessible
                                    accessibilityLabel={[
                                        pack.name,
                                        `${left} seans kaldı`,
                                        owed != null ? `${formatTRY(owed)} lira ödenmedi` : null,
                                        pack.closedBy ? `kapalı, ${pack.closedBy}` : null,
                                    ].filter(Boolean).join(', ')}
                                    style={{
                                        minHeight: 52, paddingVertical: 9, paddingHorizontal: 16,
                                        flexDirection: 'row', alignItems: 'center', gap: 11,
                                        borderTopWidth: index === 0 && !failure ? 0 : 1, borderColor: c.bd,
                                    }}
                                >
                                    <Dot color={owed != null ? c.am : c.tx3} />
                                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                                            <Title>{pack.name}</Title>
                                            {/* Parası ödenmiş bir hak: satır silinmiyor, KAPALI yazıyor. */}
                                            {pack.closedBy ? <ClosedTag edge={chipEdge} /> : null}
                                        </View>
                                        <Sub>
                                            {left} seans kaldı
                                            {owed != null ? (
                                                <Text style={{ color: c.am, fontFamily: font.semiBold, fontWeight: '600' }}>
                                                    {` · ₺${formatTRY(owed)} ödenmedi`}
                                                </Text>
                                            ) : null}
                                        </Sub>
                                    </View>
                                    <Amount>{pack.used}/{pack.total}</Amount>
                                </View>
                            );
                            const key = pack.planId ?? `${pack.name}-${index}`;
                            return pack.planId && pack.planId === sale?.freshPlanId
                                ? <FadeIn key={key}>{row}</FadeIn>
                                : <View key={key}>{row}</View>;
                        })}
                        {packages.some((pack) => pack.owed != null && pack.owed > 0) ? (
                            <Quiet>Tahsilat Kasa’dan yapılır</Quiet>
                        ) : null}
                        {canSell && onSellPackage ? (
                            <Act label="Paket sat" plus onPress={onSellPackage} style={{ marginTop: 6, marginBottom: 16 }} />
                        ) : null}
                    </>
                ) : null}

                {/* ── Sektör alanları — veri kadar hücre, sıfırsa başlık da yok ── */}
                {fields.length > 0 ? (
                    <>
                        <SectionHead title="MÜŞTERİ BİLGİLERİ" />
                        <View style={{
                            flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 12,
                            paddingTop: 3, paddingHorizontal: 16, paddingBottom: 14,
                        }}>
                            {fields.map((cell) => (
                                <View key={cell.label} style={{ width: '47%', flexGrow: 1, gap: 2, minWidth: 0 }}>
                                    <Caps color={c.tx3}>{cell.label.toLocaleUpperCase('tr-TR')}</Caps>
                                    <Text style={{
                                        color: c.tx, fontSize: 14.5, fontFamily: font.semiBold, fontWeight: '600',
                                        letterSpacing: 14.5 * -0.01, lineHeight: 14.5 * 1.25,
                                    }}>
                                        {cell.value}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </>
                ) : null}

                {/* ── Notlar ───────────────────────────────────────────────── */}
                <SectionHead title="NOTLAR" />
                {card.notes.length > 0 ? (
                    <View style={{ paddingTop: 2, paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
                        {card.notes.map((note, index) => (
                            <Text key={index} style={{
                                color: c.tx, fontSize: 14, fontFamily: font.medium, fontWeight: '500',
                                lineHeight: 14 * 1.45,
                            }}>
                                {note}
                            </Text>
                        ))}
                    </View>
                ) : null}
                {onEditNote ? (
                    <Act
                        label={card.notes.length > 0 ? 'Notu düzenle' : 'Not ekle'}
                        plus={card.notes.length === 0}
                        onPress={onEditNote}
                        style={{ marginBottom: 16 }}
                    />
                ) : null}

                {/* ── Geçmiş ───────────────────────────────────────────────── */}
                <SectionHead title="GEÇMİŞ" count={visits > 0 ? `${visits} ziyaret` : undefined} />
                {visits === 0 && card.history.length === 0 ? (
                    <Quiet>Henüz ziyaret yok</Quiet>
                ) : (
                    <>
                        {metrics.length > 0 ? (
                            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2, paddingHorizontal: 16, paddingBottom: 12 }}>
                                {metrics.map((cell) => (
                                    <View key={cell.label} style={{ flex: 1, minWidth: 0, gap: 3 }}>
                                        <Caps color={c.tx3}>{cell.label}</Caps>
                                        <Text numberOfLines={1} style={{
                                            color: c.tx, fontSize: 15.5, fontFamily: font.extraBold, fontWeight: '800',
                                            letterSpacing: 15.5 * -0.025,
                                            fontVariant: cell.num ? ['tabular-nums'] : undefined,
                                        }}>
                                            {cell.value}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                        {card.history.slice(0, 3).map((row, index) => (
                            <View
                                key={row.id || String(index)}
                                accessible
                                accessibilityLabel={`${row.service}, ${row.date}${row.staff ? `, ${row.staff} ile` : ''}, ${formatTRY(row.amount)} lira`}
                                style={{
                                    minHeight: 52, paddingVertical: 9, paddingHorizontal: 16,
                                    flexDirection: 'row', alignItems: 'center', gap: 11,
                                    borderTopWidth: 1, borderColor: c.bd,
                                }}
                            >
                                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Title>{row.service}</Title>
                                    <Sub numberOfLines={1}>
                                        {[row.date, row.staff ? `${row.staff} ile` : null].filter(Boolean).join(' · ')}
                                    </Sub>
                                </View>
                                <Amount>₺{formatTRY(row.amount)}</Amount>
                            </View>
                        ))}
                        {/* Açılacak geçmiş yoksa düğme YOK — ölü olurdu. */}
                        {visits > 0 && onOpenHistory ? (
                            <Act label="Tüm geçmişi aç" onPress={onOpenHistory} style={{ marginTop: 8, marginBottom: 16 }} />
                        ) : null}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ── Parçalar ────────────────────────────────────────────────────────────────

/**
 * Yeni satır ve başarısızlık satırı: 40 ms sonra, 200 ms, yalnız opacity.
 * Yükseklik animasyonlanmıyor — hiçbir şey aşağı kaymıyor (A3).
 */
function FadeIn({ children }: { children: ReactNode }) {
    const { reduceMotion } = useTheme();
    const value = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
    useEffect(() => {
        if (reduceMotion) { value.setValue(1); return; }
        Animated.timing(value, {
            toValue: 1, duration: 200, delay: 40, easing: Easing.linear, useNativeDriver: true,
        }).start();
    // Bir kez: satır yeniden çizilince tekrar oynamaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <Animated.View style={{ opacity: value }}>{children}</Animated.View>;
}

/** Müdür 35 · A4 — 48 pt, tam genişlik, kartın tek dolu turuncu yüzeyi. */
function BookButton({ onPress }: { onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Randevu ver"
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                marginTop: 8,
                marginHorizontal: 16,
                marginBottom: 14,
                height: 48,
                borderRadius: 12,
                backgroundColor: c.or,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
        >
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path d="M3 8a3 3 0 013-3h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V8zM8 3v4M16 3v4M3 11h18"
                    stroke={onAccent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={{ color: onAccent, fontSize: 16, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 16 * -0.01 }}>
                Randevu ver
            </Text>
        </Pressable>
    );
}

/** Büyük harf METİN KATMANINDA — `textTransform` Türkçe i → İ'yi bozuyor. */
function Caps({ children, color }: { children: ReactNode; color: string }) {
    return (
        <Text style={{
            color, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800',
            letterSpacing: 10.5 * 0.14, lineHeight: 12,
        }}>
            {children}
        </Text>
    );
}

function SectionHead({ title, count }: { title: string; count?: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'baseline', gap: 9,
            paddingTop: 15, paddingHorizontal: 16, paddingBottom: 7,
        }}>
            <Caps color={c.tx3}>{title}</Caps>
            {count ? (
                <Text style={{
                    marginLeft: 'auto', color: c.tx2, fontSize: 11.5, fontFamily: font.semiBold, fontWeight: '600',
                    fontVariant: ['tabular-nums'],
                }}>
                    {count}
                </Text>
            ) : null}
        </View>
    );
}

function Title({ children }: { children: ReactNode }) {
    const { c } = useTheme();
    return (
        <Text style={{
            color: c.tx, fontSize: 15, fontFamily: font.semiBold, fontWeight: '600',
            letterSpacing: 15 * -0.01, lineHeight: 15 * 1.25,
        }}>
            {children}
        </Text>
    );
}

function Sub({ children, numberOfLines }: { children: ReactNode; numberOfLines?: number }) {
    const { c } = useTheme();
    return (
        <Text numberOfLines={numberOfLines} style={{
            color: c.tx2, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500', lineHeight: 12.5 * 1.3,
        }}>
            {children}
        </Text>
    );
}

/** Tutar hiç kırpılmaz: sayı kırpmak yalan üretir. */
function Amount({ children }: { children: ReactNode }) {
    const { c } = useTheme();
    return (
        <Text style={{
            flexShrink: 0, color: c.tx, fontSize: 16, fontFamily: font.extraBold, fontWeight: '800',
            letterSpacing: 16 * -0.02, fontVariant: ['tabular-nums'],
        }}>
            {children}
        </Text>
    );
}

function Quiet({ children }: { children: ReactNode }) {
    const { c } = useTheme();
    return (
        <Text style={{
            paddingTop: 4, paddingHorizontal: 16, paddingBottom: 10,
            color: c.tx3, fontSize: 12.5, fontFamily: font.semiBold, fontWeight: '600',
        }}>
            {children}
        </Text>
    );
}

function Dot({ color }: { color: string }) {
    return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

function Chevron({ color }: { color: string }) {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

function ClosedTag({ edge }: { edge: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            height: 22, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: edge,
            justifyContent: 'center',
        }}>
            <Text style={{
                color: c.rd, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 10.5 * 0.1,
            }}>
                KAPALI
            </Text>
        </View>
    );
}

/** Kabuk çubuğundaki hap: 36 çizilir, `hitSlop` ile 44 dokunur. */
function Tap({ label, onPress }: { label: string; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: c.bd2,
                backgroundColor: pressed ? c.surf2 : c.surf,
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
        >
            <Text style={{ color: c.tx, fontSize: 14, fontFamily: font.bold, fontWeight: '700', letterSpacing: 14 * -0.01 }}>
                {label}
            </Text>
        </Pressable>
    );
}

/** Bölüm eylemi — 44 pt, çerçeveli, nötr. */
function Act({ label, plus = false, onPress, style }: {
    label: string;
    plus?: boolean;
    onPress: () => void;
    style?: { marginTop?: number; marginBottom?: number };
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                marginHorizontal: 16,
                marginTop: style?.marginTop ?? 2,
                marginBottom: style?.marginBottom ?? 6,
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.bd2,
                backgroundColor: pressed ? c.surf2 : c.surf,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
        >
            {plus ? (
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                    <Path d="M12 5v14M5 12h14" stroke={c.tx} strokeWidth={2} strokeLinecap="round" />
                </Svg>
            ) : null}
            <Text style={{ color: c.tx, fontSize: 14.5, fontFamily: font.bold, fontWeight: '700', letterSpacing: 14.5 * -0.01 }}>
                {label}
            </Text>
        </Pressable>
    );
}
