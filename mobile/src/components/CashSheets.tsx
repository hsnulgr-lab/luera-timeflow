import { useCallback, useEffect, useRef } from 'react';
import {
    Animated, Easing, Modal, Pressable, ScrollView, Text, useWindowDimensions, View,
    type TextStyle, type ViewStyle,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, Money } from './CashParts';
import {
    ACTION_CANCEL, ACTION_CORRECT, ACTION_VOID, CORRECTION_NOTE, SHEET_SECTIONS,
    customerCardLabel, formatAmount, methodLabel, voidDialog,
    type Movement,
} from '../lib/cash';
import { cashInk, cashMetrics, font, useTheme } from '../theme';
import { upperTR } from '../lib/text';

/**
 * Müdür 14b / 14c — hareket detayı ve iptal onayı.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 14 Kasa.html`.
 *
 * HAREKET: yalnız opaklık ve dönüşüm. Sheet `translateY` + opaklıkla giriyor,
 * diyalog opaklık + `scale` ile. Yükseklik, renk, yarıçap ve gölge ANİME
 * EDİLMİYOR. "Hareketi azalt" açıkken ikisi de yalnız sönümleniyor.
 */

function Txt({ children, style, numberOfLines }: {
    children: React.ReactNode; style?: TextStyle | TextStyle[]; numberOfLines?: number;
}) {
    return <Text numberOfLines={numberOfLines} style={[{ fontFamily: font.medium }, style]}>{children}</Text>;
}

function PenIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
    );
}

function XIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6 6 18" stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </Svg>
    );
}

// ── 14b · hareket detayı ────────────────────────────────────────────────────

export function MovementSheet({ movement, onClose, onVoid }: {
    movement: Movement; onClose: () => void; onVoid: () => void;
}) {
    const { c, dark, glass, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const ink = dark ? cashInk.dark : cashInk.light;

    const sheetHeight = Math.min(cashMetrics.sheetMaxHeight, height - insets.top - 52);
    const backdrop = useRef(new Animated.Value(0)).current;
    const y = useRef(new Animated.Value(sheetHeight)).current;
    const closing = useRef(false);

    useEffect(() => {
        closing.current = false;
        backdrop.setValue(0);
        y.setValue(reduceMotion ? 0 : sheetHeight);
        const animation = reduceMotion
            ? Animated.timing(backdrop, { toValue: 1, duration: 110, easing: Easing.out(Easing.cubic), useNativeDriver: true })
            : Animated.parallel([
                Animated.timing(backdrop, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(y, { toValue: 0, duration: cashMetrics.sheetMotion, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]);
        animation.start();
        return () => animation.stop();
    }, [backdrop, reduceMotion, sheetHeight, y]);

    const close = useCallback((after?: () => void) => {
        if (closing.current) return;
        closing.current = true;
        const animation = reduceMotion
            ? Animated.timing(backdrop, { toValue: 0, duration: 100, easing: Easing.in(Easing.cubic), useNativeDriver: true })
            : Animated.parallel([
                Animated.timing(backdrop, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                Animated.timing(y, { toValue: sheetHeight, duration: cashMetrics.sheetMotion, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
            ]);
        animation.start(({ finished }) => {
            if (!finished) { closing.current = false; return; }
            if (after) after(); else onClose();
        });
    }, [backdrop, onClose, reduceMotion, sheetHeight, y]);

    const lines = movement.lines ?? [];
    const grabStyle: ViewStyle = { height: cashMetrics.grabHeight, alignItems: 'center', justifyContent: 'center' };
    const handle = <View style={{ width: cashMetrics.grabBarWidth, height: cashMetrics.grabBarHeight, borderRadius: 3, backgroundColor: c.bd2 }} />;

    const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <View style={{
            flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 12, minHeight: cashMetrics.sheetRowHeight,
        }}>
            <Txt style={{ fontSize: cashMetrics.sheetRowFont, color: c.tx2 }}>{label}</Txt>
            {children}
        </View>
    );

    return (
        /**
         * MODAL ŞART — süs değil.
         *
         * Sekme çubuğunu sistem çiziyor (NativeTabs); ekranın içinde verilen
         * hiçbir zIndex onun üstüne çıkmıyor. Mutlak konumlu bir sheet
         * kullanılınca hem eylem butonları çubuğun arkasında yutuluyor hem de
         * karartma katmanı çubuğu karartamıyor — ekran kararmışken çubuk pırıl
         * pırıl kalıyordu. Modal ayrı bir native katmanda açılıyor ve ikisini
         * birden çözüyor.
         */
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => close()}>
            <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 70, opacity: backdrop }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Hareket detayını kapat"
                    onPress={() => close()}
                    style={{ flex: 1, backgroundColor: dark ? 'rgba(6,4,2,0.62)' : 'rgba(30,22,12,0.34)' }}
                />
            </Animated.View>

            <Animated.View
                accessibilityViewIsModal
                style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 80,
                    height: sheetHeight, overflow: 'hidden',
                    borderTopLeftRadius: cashMetrics.sheetRadius,
                    borderTopRightRadius: cashMetrics.sheetRadius,
                    borderTopWidth: 1, borderTopColor: c.bd2,
                    backgroundColor: c.surf,
                    transform: [{ translateY: y }],
                }}
            >
                {/* Cam envanteri: sheet tutamağı camın izinli olduğu iki yerden biri. */}
                {glass
                    ? <GlassView glassEffectStyle="regular" tintColor={c.tint} style={grabStyle}>{handle}</GlassView>
                    : <View style={[grabStyle, { backgroundColor: c.surf }]}>{handle}</View>}

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14 }}
                    style={{ flex: 1 }}
                >
                    {/* Başlık: kim, ne zaman, ne kadar. */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingBottom: 16 }}>
                        <View style={{
                            width: cashMetrics.avatar, height: cashMetrics.avatar, borderRadius: cashMetrics.avatar / 2,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: movement.status === 'voided' ? 'transparent' : ink[
                                movement.method === 'cash' ? 'cash' : movement.method === 'card' ? 'card' : movement.method === 'transfer' ? 'transfer' : 'other'
                            ].fill,
                        }}>
                            <Text style={{ fontFamily: font.extraBold, fontSize: cashMetrics.avatarFont, color: ink.cash.ink }}>
                                {movement.initials}
                            </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 19, letterSpacing: -0.47, color: c.tx }}>
                                {movement.customer}
                            </Txt>
                            <Txt style={{ fontSize: cashMetrics.serviceFont, color: c.tx2 }}>
                                {movement.dateLabel ?? movement.time}
                            </Txt>
                        </View>
                        <Money style={{ fontSize: cashMetrics.sheetAmountFont, fontWeight: '600', letterSpacing: -0.26, color: c.tx }}>
                            ₺{formatAmount(movement.amount)}
                        </Money>
                    </View>

                    {movement.range ? (
                        <Section title={SHEET_SECTIONS.appointment} color={c.tx3} border={c.bd}>
                            <Row label={`${movement.service} · ${movement.range}`}>
                                <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, color: c.tx }}>{movement.staff}</Txt>
                            </Row>
                        </Section>
                    ) : null}

                    {lines.length > 0 ? (
                        <Section title={SHEET_SECTIONS.lines} color={c.tx3} border={c.bd}>
                            {lines.map((l) => (
                                <Row key={l.name} label={l.name}>
                                    <Money style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, fontWeight: '700', color: c.tx }}>
                                        ₺{formatAmount(l.amount)}
                                    </Money>
                                </Row>
                            ))}
                            <View style={{ marginTop: 6, paddingTop: 9, borderTopWidth: 1, borderTopColor: c.bd, flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Txt style={{ fontFamily: font.bold, fontSize: 16, color: c.tx }}>Toplam</Txt>
                                <Money style={{ fontFamily: font.bold, fontSize: 16, fontWeight: '700', color: c.tx }}>
                                    ₺{formatAmount(movement.amount)}
                                </Money>
                            </View>
                        </Section>
                    ) : null}

                    <Section title={SHEET_SECTIONS.payment} color={c.tx3} border={c.bd}>
                        <Row label="Yöntem">
                            <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, color: c.tx }}>
                                {methodLabel(movement.method)}
                            </Txt>
                        </Row>
                        <Row label="Alan">
                            <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, color: c.tx }}>{movement.staff}</Txt>
                        </Row>
                        {movement.note ? (
                            <Row label="Açıklama">
                                <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, color: c.tx }}>{movement.note}</Txt>
                            </Row>
                        ) : null}
                    </Section>

                    <Pressable
                        accessibilityRole="button"
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            minHeight: 48, borderTopWidth: 1, borderTopColor: c.bd,
                        }}
                    >
                        <Txt style={{ fontFamily: font.bold, fontSize: 15.5, letterSpacing: -0.23, color: c.tx }}>
                            {customerCardLabel(movement.customer)}
                        </Txt>
                        <Chevron size={18} color={c.tx3} />
                    </Pressable>

                    {/* Dürüstlük notu eylemlerin ÜSTÜNDE: müdür butona basmadan
                        önce ne olacağını okusun. */}
                    <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.bd }}>
                        <View style={{ width: 13, height: 1, marginTop: 8, backgroundColor: c.tx3 }} />
                        <Txt style={{ flex: 1, fontSize: 12, lineHeight: 18, color: c.tx3 }}>{CORRECTION_NOTE}</Txt>
                    </View>
                </ScrollView>

                {/* İki eylem, iki biçim. Yıkıcı olan DOLGULU DEĞİL: yanlışlıkla
                    en cazip görünen şey olmamalı. */}
                <View style={{
                    flexDirection: 'row', gap: 10,
                    paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 30,
                    borderTopWidth: 1, borderTopColor: c.bd, backgroundColor: c.surf,
                }}>
                    <Pressable
                        accessibilityRole="button"
                        style={{
                            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                            height: cashMetrics.actionHeight, borderRadius: cashMetrics.actionRadius,
                            backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd2,
                        }}
                    >
                        <PenIcon color={c.tx} />
                        <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.actionFont, letterSpacing: -0.25, color: c.tx }}>{ACTION_CORRECT}</Txt>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => close(onVoid)}
                        style={{
                            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                            height: cashMetrics.actionHeight, borderRadius: cashMetrics.actionRadius,
                            borderWidth: 1, borderColor: ink.voidedBorder,
                        }}
                    >
                        <XIcon color={c.rd} />
                        <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.actionFont, letterSpacing: -0.25, color: c.rd }}>{ACTION_VOID}</Txt>
                    </Pressable>
                </View>
            </Animated.View>
        </Modal>
    );
}

function Section({ title, color, border, children }: {
    title: string; color: string; border: string; children: React.ReactNode;
}) {
    return (
        <View style={{ paddingVertical: 11, borderTopWidth: 1, borderTopColor: border }}>
            <Text style={{
                fontFamily: font.bold, fontSize: 10.5, letterSpacing: 1.9,
color, marginBottom: 7,
            }}>
                {upperTR(title)}
            </Text>
            {children}
        </View>
    );
}

// ── 14c · iptal onayı ───────────────────────────────────────────────────────

/**
 * Ekranda kaç onay var: BİR. Düzeltme, dönem değişimi, sheet kapama, gün sonu —
 * hiçbiri onay istemiyor. Diyaloğun gücü nadirliğinden geliyor.
 *
 * Yıkıcı eylem ÜSTTE: iOS alarm grameri. Kırmızı ve 800 ağırlık yalnız
 * "İptal et"te; odak "Vazgeç"te.
 */
export function VoidDialog({ movement, onConfirm, onCancel }: {
    movement: Movement; onConfirm: () => void; onCancel: () => void;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const copy = voidDialog(movement);
    const appear = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.timing(appear, {
            toValue: 1,
            duration: reduceMotion ? 110 : 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });
        animation.start();
        return () => animation.stop();
    }, [appear, reduceMotion]);

    return (
        // Sheet'le aynı sebep: diyalog da sekme çubuğunun üstünde durmalı.
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onCancel}>
            <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 90, opacity: appear }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.cancel}
                    onPress={onCancel}
                    style={{ flex: 1, backgroundColor: dark ? 'rgba(6,4,2,0.62)' : 'rgba(30,22,12,0.34)' }}
                />
            </Animated.View>

            <Animated.View
                accessibilityViewIsModal
                style={{
                    position: 'absolute', top: '50%', left: '50%', zIndex: 95,
                    width: cashMetrics.alertWidth,
                    marginLeft: -cashMetrics.alertWidth / 2, marginTop: -150,
                    borderRadius: cashMetrics.alertRadius, overflow: 'hidden',
                    backgroundColor: c.surf, borderWidth: 1, borderColor: c.bd2,
                    // Statik gölge — yalnız diyalogda, anime edilmiyor.
                    shadowColor: '#000', shadowOffset: { width: 0, height: 24 },
                    shadowRadius: 60, shadowOpacity: 0.4, elevation: 12,
                    opacity: appear,
                    transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
                }}
            >
                <View style={{ gap: 9, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 }}>
                    <Txt style={{ fontFamily: font.extraBold, fontSize: 18, letterSpacing: -0.36, color: c.tx, textAlign: 'center' }}>
                        {copy.title}
                    </Txt>

                    {/* Neyin iptal edildiği alıntı kutusunda. Diyalog "emin
                        misiniz" sormuyor, NE OLACAĞINI söylüyor. */}
                    <View style={{
                        gap: 1, paddingVertical: 11, paddingHorizontal: 12, marginVertical: 2,
                        borderRadius: 14, backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd,
                    }}>
                        <Txt style={{ fontFamily: font.extraBold, fontSize: 15, color: c.tx }}>{copy.who}</Txt>
                        <Money style={{ fontSize: 12.5, color: c.tx2 }}>{copy.what}</Money>
                    </View>

                    <Txt style={{ fontSize: 14, lineHeight: 20, color: c.tx2, textAlign: 'center' }}>{copy.warning}</Txt>
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: c.bd }}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onConfirm}
                        style={{ height: cashMetrics.alertActionHeight, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Txt style={{ fontFamily: font.extraBold, fontSize: 17, letterSpacing: -0.25, color: c.rd }}>{copy.confirm}</Txt>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onCancel}
                        style={{
                            height: cashMetrics.alertActionHeight, alignItems: 'center', justifyContent: 'center',
                            borderTopWidth: 1, borderTopColor: c.bd,
                        }}
                    >
                        <Txt style={{ fontFamily: font.bold, fontSize: 17, letterSpacing: -0.25, color: c.tx2 }}>{copy.cancel}</Txt>
                    </Pressable>
                </View>
            </Animated.View>
        </Modal>
    );
}
