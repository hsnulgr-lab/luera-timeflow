import { useMemo, useRef } from 'react';
import {
    Animated, Pressable, Text, View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { upperTR } from '../lib/text';
import {
    displayPhone, dialPhone, hangRisk, heroGrows, heroWarns, historyEmpty,
    monogramOf, nameLines, customerPlates, trayReminder, upcomingSub,
    NOTES_EMPTY, TRAY_MAIN, TRAY_GHOST,
    type CustomerCard as CustomerCardType, type CustomerPlate, type CustomerUpcoming,
} from '../lib/customerCard';
import {
    ChromeRow, HeroGlass, HeroGradient, HistoryEmptyBlock, HistoryRow,
    Monogram, NoteRow, Plates, Section, WarnRow, usePlateEntry, useWarnEntry,
} from './CustomerParts';
import {
    customerHero, customerMetrics, customerMotion, font, panelInk, radius, useTheme,
} from '../theme';

/**
 * Müdür 23 — Müşteri kartı.
 *
 * Ekran tek bir soruya cevap verir: "bu müşteri kim ve ona nasıl davranmalıyım?"
 * Kimlik baş harflerden gelir; fotoğraf yok, yer tutucu yok.
 *
 * Kahraman alan uygulamanın TEK gradyanını taşır.
 * Toplanma: scrollY.interpolate ile 0 · 24 · 32 · 48 · 64 eşiklerinde.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 23 Musteri Karti.html`.
 */

export interface CustomerCardProps {
    card: CustomerCardType;
    onBack: () => void;
    onCall?: () => void;
    onWhatsApp?: () => void;
    onBook?: () => void;
    onAddNote?: () => void;
    onOpenHistoryAll?: () => void;
    onOpenPlate?: (key: CustomerPlate['key']) => void;
    onChangeUpcoming?: (upcoming: CustomerUpcoming) => void;
}

export function CustomerCard({
    card,
    onBack,
    onCall,
    onWhatsApp,
    onBook,
    onAddNote,
    onOpenHistoryAll,
    onOpenPlate,
    onChangeUpcoming,
}: CustomerCardProps) {
    const { c, reduceMotion, small } = useTheme();
    const insets = useSafeAreaInsets();

    const scrollY = useRef(new Animated.Value(0)).current;

    const initials = useMemo(() => monogramOf(card.name), [card.name]);
    const { given, family } = useMemo(() => nameLines(card.name), [card.name]);
    const phone = useMemo(() => displayPhone(card), [card]);
    const rawPhone = useMemo(() => dialPhone(card), [card]);
    const warns = useMemo(() => heroWarns(card), [card]);
    const hasRisk = warns.some((w) => w.kind === 'risk');
    const grows = heroGrows(card);
    const plates = useMemo(() => customerPlates(card, small), [card, small]);
    const reminder = useMemo(() => trayReminder(card), [card]);
    const riskText = useMemo(() => hangRisk(card), [card]);
    const isRiskyHang = Boolean(riskText);

    // Kahraman alan yüksekliği ANİMASYONLU DEĞİL: mount yerleşimi.
    const heroHeight = grows
        ? (small ? customerMetrics.heroHeightWarnSmall : customerMetrics.heroHeightWarn)
        : (small ? customerMetrics.heroHeightSmall : customerMetrics.heroHeight);

    const hangHeight = isRiskyHang ? customerMetrics.hangHeightRisk : customerMetrics.hangHeight;

    const collapse = customerMotion.collapse; // [0, 24, 32, 48, 64]

    // 0→24 tam · 24→32 kroma ve telefon söner
    const chromeOpacity = scrollY.interpolate({
        inputRange: [collapse[0], collapse[1], collapse[2], collapse[3], collapse[4]],
        outputRange: [1, 1, 0, 0, 0],
        extrapolate: 'clamp',
    });

    // 32→48 isim ve monogram söner + translateY 0→-10
    const identityOpacity = scrollY.interpolate({
        inputRange: [collapse[0], collapse[1], collapse[2], collapse[3], collapse[4]],
        outputRange: [1, 1, 1, 0, 0],
        extrapolate: 'clamp',
    });

    const identityTranslateY = scrollY.interpolate({
        inputRange: [collapse[0], collapse[1], collapse[2], collapse[3], collapse[4]],
        outputRange: [0, 0, 0, -customerMotion.collapseLift, -customerMotion.collapseLift],
        extrapolate: 'clamp',
    });

    // 48→64 levhalar YALNIZ söner (kaymaz, sınırın üstündeki yer sabittir)
    const platesOpacity = scrollY.interpolate({
        inputRange: [collapse[0], collapse[1], collapse[2], collapse[3], collapse[4]],
        outputRange: [1, 1, 1, 1, 0],
        extrapolate: 'clamp',
    });

    // 48→64 asılı cam levha girer: translateY -hangHeight→0, opacity 0→1
    const hangOpacity = scrollY.interpolate({
        inputRange: [collapse[0], collapse[1], collapse[2], collapse[3], collapse[4]],
        outputRange: [0, 0, 0, 0, 1],
        extrapolate: 'clamp',
    });

    const hangTranslateY = scrollY.interpolate({
        inputRange: [collapse[0], collapse[1], collapse[2], collapse[3], collapse[4]],
        outputRange: [-hangHeight, -hangHeight, -hangHeight, -hangHeight, 0],
        extrapolate: 'clamp',
    });

    const plateEntry = usePlateEntry(reduceMotion);
    const warnEntry = useWarnEntry(hasRisk, reduceMotion);

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Toplanmış asılı cam levha — mutlak üst katman */}
            <HangingBar
                card={card}
                onBack={onBack}
                onCall={rawPhone && onCall ? onCall : undefined}
                hangOpacity={hangOpacity}
                hangTranslateY={hangTranslateY}
            />

            <Animated.ScrollView
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true },
                )}
                contentContainerStyle={{ flexGrow: 1 }}
            >
                {/* ══ KAHRAMAN ALAN ══ */}
                <View style={{
                    height: heroHeight,
                    paddingTop: Math.max(insets.top, small ? 20 : 59),
                    paddingHorizontal: customerMetrics.padX,
                    paddingBottom: customerMetrics.heroPadBottom,
                    position: 'relative',
                }}>
                    <HeroGradient radiusBottom={customerMetrics.heroRadius} />

                    {/* Kroma satırı — toplanmada 24→32 söner */}
                    <Animated.View style={{ opacity: chromeOpacity }}>
                        <ChromeRow
                            onBack={onBack}
                            onCall={rawPhone && onCall ? onCall : undefined}
                            onWhatsApp={rawPhone && onWhatsApp ? onWhatsApp : undefined}
                        />
                    </Animated.View>

                    {/* Monogram — toplanmada 32→48 söner ve yukarı kayar */}
                    <Monogram
                        initials={initials}
                        style={{
                            opacity: identityOpacity,
                            transform: [{ translateY: identityTranslateY }],
                        }}
                    />

                    {/* İsim ve telefon bloğu — toplanmada 32→48 söner ve yukarı kayar */}
                    <Animated.View style={{
                        marginTop: 'auto',
                        maxWidth: small ? customerMetrics.nameWidthSmall : customerMetrics.nameWidth,
                        opacity: identityOpacity,
                        transform: [{ translateY: identityTranslateY }],
                    }}>
                        {given ? (
                            <Text numberOfLines={1} style={{
                                color: customerHero.ink2,
                                fontSize: small ? customerMetrics.nameTextSmall : customerMetrics.nameText,
                                lineHeight: small ? customerMetrics.nameTextSmall : customerMetrics.nameText,
                                fontFamily: font.medium,
                                fontWeight: '500',
                                letterSpacing: (small ? customerMetrics.nameTextSmall : customerMetrics.nameText) * -0.03,
                            }}>
                                {given}
                            </Text>
                        ) : null}
                        <Text numberOfLines={1} style={{
                            color: customerHero.ink,
                            fontSize: small ? customerMetrics.nameTextSmall : customerMetrics.nameText,
                            lineHeight: (small ? customerMetrics.nameTextSmall : customerMetrics.nameText) * 1.06,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: (small ? customerMetrics.nameTextSmall : customerMetrics.nameText) * -0.03,
                        }}>
                            {family}
                        </Text>
                        {phone ? (
                            <Num size={customerMetrics.phoneText} style={{
                                marginTop: customerMetrics.phoneTop,
                                color: customerHero.ink3,
                                fontFamily: font.semiBold,
                                fontWeight: '600',
                            }}>
                                {phone}
                            </Num>
                        ) : null}
                    </Animated.View>

                    {/* Risk / Borç satırları */}
                    {warns.map((w, idx) => (
                        <WarnRow
                            key={`${w.kind}-${idx}`}
                            warn={w}
                            entering={w.kind === 'risk' ? warnEntry : undefined}
                        />
                    ))}

                    {/* İki Levha — sınırın üstünde, toplanmada 48→64 yalnız söner */}
                    <Animated.View style={{ opacity: platesOpacity }}>
                        <Plates
                            plates={plates}
                            entry={plateEntry}
                            onOpen={onOpenPlate}
                        />
                    </Animated.View>
                </View>

                {/* ══ İÇERİK — sakin, koyu, camsız ══ */}
                <View style={{
                    paddingTop: customerMetrics.contentTop,
                    paddingBottom: 24,
                }}>
                    {/* Gömülü krem kart (yaklaşan randevu) */}
                    {card.upcoming ? (
                        <UpcomingEmbedCard
                            upcoming={card.upcoming}
                            onChange={onChangeUpcoming}
                        />
                    ) : null}

                    {/* Son İşlemler */}
                    <Section
                        label="Son İşlemler"
                        action={card.history.length > 0 ? 'Tümü' : undefined}
                        onAction={card.history.length > 0 ? onOpenHistoryAll : undefined}
                    />
                    {card.history.length > 0 ? (
                        card.history.map((row, idx) => (
                            <HistoryRow key={row.id || String(idx)} row={row} first={idx === 0} />
                        ))
                    ) : (
                        <HistoryEmptyBlock
                            title={historyEmpty().title}
                            hint={historyEmpty().hint}
                        />
                    )}

                    {/* Notlar */}
                    <Section label="Notlar" />
                    {card.notes.length > 0 ? (
                        card.notes.map((note, idx) => (
                            <NoteRow key={String(idx)} text={note} first={idx === 0} />
                        ))
                    ) : (
                        <NoteRow text={NOTES_EMPTY} quiet first />
                    )}
                </View>
            </Animated.ScrollView>

            {/* ══ ALT EYLEM ÇUBUĞU — BAŞPARMAK BÖLGESİ (Hiç toplanmaz) ══ */}
            <View style={{
                paddingTop: customerMetrics.trayPadTop,
                paddingHorizontal: customerMetrics.padX,
                paddingBottom: Math.max(insets.bottom, customerMetrics.trayPadBottom),
                borderTopWidth: 1,
                borderTopColor: c.bd,
                backgroundColor: c.bg,
                gap: customerMetrics.trayGap,
            }}>
                {reminder ? (
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <View style={{
                            width: 7,
                            height: 7,
                            borderRadius: 7,
                            backgroundColor: c.am,
                        }} />
                        <Text numberOfLines={1} style={{
                            flex: 1,
                            color: c.am,
                            fontSize: customerMetrics.trayRemind,
                            fontFamily: font.semiBold,
                            fontWeight: '600',
                            lineHeight: customerMetrics.trayRemind * 1.3,
                        }}>
                            {reminder}
                        </Text>
                    </View>
                ) : null}

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                }}>
                    {onAddNote ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={TRAY_GHOST}
                            hitSlop={6}
                            onPress={() => { feedback.selection(); onAddNote(); }}
                            style={({ pressed }) => ({
                                height: customerMetrics.trayMainHeight,
                                paddingHorizontal: 4,
                                justifyContent: 'center',
                                opacity: pressed ? 0.6 : 1,
                            })}
                        >
                            <Text style={{
                                color: c.tx2,
                                fontSize: customerMetrics.trayGhost,
                                fontFamily: font.bold,
                                fontWeight: '700',
                            }}>
                                {TRAY_GHOST}
                            </Text>
                        </Pressable>
                    ) : null}

                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={TRAY_MAIN}
                        hitSlop={2}
                        onPress={() => { feedback.selection(); onBook?.(); }}
                        style={({ pressed }) => ({
                            flex: 1,
                            height: customerMetrics.trayMainHeight,
                            borderRadius: radius.pill,
                            backgroundColor: c.or,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.85 : 1,
                        })}
                    >
                        <Text style={{
                            color: '#FFFFFF',
                            fontSize: customerMetrics.trayMainText,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: customerMetrics.trayMainText * -0.01,
                        }}>
                            {TRAY_MAIN}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

// ── Gömülü Kart: Yaklaşan Randevu ───────────────────────────────────────────

function UpcomingEmbedCard({
    upcoming,
    onChange,
}: {
    upcoming: CustomerUpcoming;
    onChange?: (upcoming: CustomerUpcoming) => void;
}) {
    const { c, dark } = useTheme();
    // Koyu temada krem kart (#FAF3E9 / #0E0E0E), aydınlık temada tersine döner (#1C1710 / #F3EDE3)
    const ink = dark ? panelInk.dark : panelInk.light;

    return (
        <View style={{
            marginHorizontal: customerMetrics.padX,
            marginBottom: 6,
            borderRadius: customerMetrics.embedRadius,
            backgroundColor: ink.panel,
            overflow: 'hidden',
        }}>
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: customerMetrics.embedGap,
                padding: customerMetrics.embedPadding,
            }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 7,
                    }}>
                        <View style={{
                            width: 7,
                            height: 7,
                            borderRadius: 7,
                            backgroundColor: c.or,
                        }} />
                        <Text style={{
                            color: ink.ink2,
                            fontSize: customerMetrics.embedLabel,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: customerMetrics.embedLabel * 0.06,
                        }}>
                            {upperTR('Yaklaşan Randevu')}
                        </Text>
                    </View>

                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        gap: 5,
                        height: customerMetrics.embedHeroHeight,
                        marginTop: 2,
                    }}>
                        <Num size={customerMetrics.embedHero} style={{
                            color: ink.ink,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: customerMetrics.embedHero * -0.03,
                            lineHeight: customerMetrics.embedHeroHeight,
                        }}>
                            {upcoming.date}
                        </Num>
                        <Num size={customerMetrics.embedUnit} style={{
                            color: ink.ink2,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            {upcoming.time}
                        </Num>
                    </View>

                    <Text numberOfLines={1} style={{
                        color: ink.ink2,
                        fontSize: customerMetrics.embedSub,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        lineHeight: customerMetrics.embedSub * 1.22,
                        marginTop: 2,
                    }}>
                        {upcomingSub(upcoming)}
                    </Text>
                </View>

                {onChange ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Yaklaşan randevuyu değiştir"
                        hitSlop={4}
                        onPress={() => { feedback.selection(); onChange(upcoming); }}
                        style={({ pressed }) => ({
                            height: customerMetrics.embedPillHeight,
                            paddingHorizontal: customerMetrics.embedPillX,
                            borderRadius: radius.pill,
                            borderWidth: customerMetrics.embedPillBorder,
                            borderColor: ink.ink,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text style={{
                            color: ink.ink,
                            fontSize: customerMetrics.embedPillText,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: customerMetrics.embedPillText * -0.01,
                        }}>
                            Değiştir
                        </Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

// ── Toplanmış Asılı Levha ───────────────────────────────────────────────────

function HangingBar({
    card,
    onBack,
    onCall,
    hangOpacity,
    hangTranslateY,
}: {
    card: CustomerCardType;
    onBack: () => void;
    onCall?: () => void;
    hangOpacity: Animated.AnimatedInterpolation<number>;
    hangTranslateY: Animated.AnimatedInterpolation<number>;
}) {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const { given, family } = useMemo(() => nameLines(card.name), [card.name]);
    const riskText = hangRisk(card);
    const rawPhone = dialPhone(card);

    return (
        <Animated.View
            pointerEvents="box-none"
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                zIndex: 10,
                opacity: hangOpacity,
                transform: [{ translateY: hangTranslateY }],
            }}
        >
            <HeroGlass
                kind="hang"
                style={{
                    borderBottomLeftRadius: customerMetrics.hangRadius,
                    borderBottomRightRadius: customerMetrics.hangRadius,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    borderBottomWidth: 1,
                    paddingTop: Math.max(insets.top, 20) + customerMetrics.hangPadTop,
                    paddingHorizontal: customerMetrics.padX,
                    paddingBottom: customerMetrics.hangPadBottom,
                    gap: customerMetrics.hangGap,
                }}
            >
                <View style={{
                    height: customerMetrics.hangRowHeight,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Geri"
                        hitSlop={4}
                        onPress={() => { feedback.selection(); onBack(); }}
                        style={({ pressed }) => ({
                            width: customerMetrics.hangButton,
                            height: customerMetrics.hangButton,
                            borderRadius: radius.pill,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: customerMetrics.hangButtonFill,
                            borderWidth: 1,
                            borderColor: customerMetrics.hangButtonBorder,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={customerHero.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M12 4l-6 6 6 6" />
                        </Svg>
                    </Pressable>

                    <View style={{
                        flex: 1,
                        minWidth: 0,
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        gap: 6,
                    }}>
                        {given ? (
                            <Text numberOfLines={1} style={{
                                color: customerHero.ink2,
                                fontSize: customerMetrics.hangName,
                                fontFamily: font.medium,
                                fontWeight: '500',
                                letterSpacing: customerMetrics.hangName * -0.02,
                            }}>
                                {given}
                            </Text>
                        ) : null}
                        <Text numberOfLines={1} style={{
                            color: customerHero.ink,
                            fontSize: customerMetrics.hangName,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: customerMetrics.hangName * -0.02,
                        }}>
                            {family}
                        </Text>
                    </View>

                    {rawPhone && onCall ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Müşteriyi ara"
                            hitSlop={4}
                            onPress={() => { feedback.selection(); onCall(); }}
                            style={({ pressed }) => ({
                                width: customerMetrics.hangButton,
                                height: customerMetrics.hangButton,
                                borderRadius: radius.pill,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: customerMetrics.hangButtonFill,
                                borderWidth: 1,
                                borderColor: customerMetrics.hangButtonBorder,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke={customerHero.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                                <Path d="M6.2 3.2h-2c-.7 0-1.2.6-1.1 1.3.3 3 1.6 5.8 3.7 7.9 2.1 2.1 4.9 3.4 7.9 3.7.7.1 1.3-.4 1.3-1.1v-2c0-.6-.4-1.1-1-1.2l-1.9-.3c-.5-.1-1 .1-1.3.5l-.7.9C9.3 12 8 10.7 7.1 9.1l.9-.7c.4-.3.6-.8.5-1.3L8.2 5.2c-.1-.6-.6-1-1.2-1z" />
                            </Svg>
                        </Pressable>
                    ) : null}
                </View>

                {/* Risk satırı — Borç YOK, yalnız risk! */}
                {riskText ? (
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingBottom: 2,
                    }}>
                        <View style={{
                            width: 7,
                            height: 7,
                            borderRadius: 7,
                            backgroundColor: c.rd,
                        }} />
                        <Text style={{
                            flex: 1,
                            color: c.rd,
                            fontSize: customerMetrics.hangRisk,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            lineHeight: customerMetrics.hangRisk * 1.25,
                        }}>
                            {riskText}
                        </Text>
                    </View>
                ) : null}
            </HeroGlass>
        </Animated.View>
    );
}
