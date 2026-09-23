import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated, Easing, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView,
    Text, TextInput, useWindowDimensions, View,
    type TextStyle, type ViewStyle,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet, SheetGrab } from './Sheet';
import { Chevron, Money } from './CashParts';
import {
    ACTION_CANCEL, ACTION_CORRECT, ACTION_VOID, CORRECTION_NOTE, READ_ONLY_NOTE, SHEET_SECTIONS, STAFF_ROW_LABEL,
    canCorrect, counterLine, customerCardLabel, formatAmount, methodLabel, parseAmount, periodSummaryTitle, voidDialog,
    type CashPeriod, type CashTotals, type Movement,
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

export function MovementSheet({ movement, onClose, onVoid, onCorrect, onOpenCustomer }: {
    movement: Movement; onClose: () => void;
    /**
     * İptal. VERİLMEZSE fiş salt okunur: eylem şeridi çizilmiyor, yerinde
     * `READ_ONLY_NOTE` duruyor. Kasa bugün böyle açılıyor — veritabanında
     * iptal izi yok (bkz. `cash.READ_ONLY_NOTE`).
     */
    onVoid?: () => void;
    /**
     * Müşteri kartı. VERİLMEZSE bağlantı satırı hiç çizilmiyor: satır basılır
     * görünüyordu ama `onPress`i yoktu. Müdürün müşteri ekranı henüz yok.
     */
    onOpenCustomer?: () => void;
    /**
     * Tutar düzeltildi.
     *
     * "Düzelt" düğmesi VARDI ama `onPress`i yoktu: basılıp hiçbir şey olmayan
     * bir düğme. Düzeltme ONAY İSTEMİYOR (bkz. `VoidDialog`'un gerekçesi —
     * ekranda tek onay var, o da iptalde); o yüzden ikinci bir diyalog değil,
     * eylem satırının kendi içinde açılan bir alan.
     */
    onCorrect?: (amount: number) => void;
}) {
    const { c, dark, glass, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const ink = dark ? cashInk.dark : cashInk.light;

    const sheetHeight = Math.min(cashMetrics.sheetMaxHeight, height - insets.top - 52);
    const backdrop = useRef(new Animated.Value(0)).current;
    const y = useRef(new Animated.Value(sheetHeight)).current;
    const closing = useRef(false);
    // Tutar düzeltme hâli — eylem satırının yerini alır.
    const [correcting, setCorrecting] = useState(false);
    const [draft, setDraft] = useState('');

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

    /*
     * TUTAMAÇ SÜRÜKLENİR.
     *
     * Çubuk baştan beri çizilmişti ama hiçbir jest bağlı değildi: sürüklenir
     * görünen, sürüklenmeyen bir kontrol. Kullanıcı aşağı çekiyor, sheet
     * duruyor. `gesture-handler` projede yok; jest RN'in kendi
     * `PanResponder`'ıyla kuruluyor.
     *
     * Yukarı çekiş YOK SAYILIYOR (`Math.max(0, dy)`): sheet zaten yukarı
     * gidemez, lastik bant sahte bir esneklik üretmesin.
     */
    const drag = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > cashMetrics.dragClaim
            && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => Keyboard.dismiss(),
        onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
            // Ya YETERİNCE indi ya da HIZLA atıldı: ikisi de kapatır.
            if (g.dy > cashMetrics.dragClose || g.vy > cashMetrics.dragFling) {
                close();
                return;
            }
            Animated.spring(y, {
                toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14,
            }).start();
        },
        onPanResponderTerminate: () => {
            Animated.spring(y, {
                toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14,
            }).start();
        },
    })).current;

    /*
     * KLAVYE FİŞİ ÖRTÜYORDU.
     *
     * Fiş ekranın altına yaslı; düzeltme alanı açılınca klavye tam üstüne
     * biniyor ve ne tutar ne de Kaydet görünüyordu. Fiş klavye kadar
     * KALDIRILIYOR — yalnız `translateY`, sürükleme değerinden AYRI bir
     * katman olarak: parmakla çekerken ikisi karışmasın.
     */
    const lift = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvent, (event) => {
            // Fişin alt dolgusu zaten güvenli alan kadar; iki kez sayılmasın.
            const raise = Math.max(0, event.endCoordinates.height - insets.bottom);
            Animated.timing(lift, {
                toValue: -raise,
                duration: event.duration || 250,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        });
        const hide = Keyboard.addListener(hideEvent, (event) => {
            Animated.timing(lift, {
                toValue: 0,
                duration: event.duration || 220,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        });
        return () => { show.remove(); hide.remove(); };
    }, [insets.bottom, lift]);

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
                    /*
                     * YÜKSEKLİK İÇERİKTEN TÜRER, sabit değil.
                     *
                     * `height` verilince kısa bir fiş bile ekranın dörtte
                     * üçünü kaplıyor ve altında kocaman bir boşluk kalıyordu.
                     * `maxHeight` tavanı koruyor: uzun fiş kaydırılıyor, kısa
                     * fiş kendi boyunda duruyor.
                     */
                    maxHeight: sheetHeight, overflow: 'hidden',
                    borderTopLeftRadius: cashMetrics.sheetRadius,
                    borderTopRightRadius: cashMetrics.sheetRadius,
                    borderTopWidth: 1, borderTopColor: c.bd2,
                    backgroundColor: c.surf,
                    transform: [{ translateY: y }, { translateY: lift }],
                }}
            >
                {/* Cam envanteri: sheet tutamağı camın izinli olduğu iki yerden biri.
                    Jest BU KABA bağlı — çubuğun kendisi 5 pt, parmak 26 pt'lik
                    şeridin herhangi bir yerinden tutabilmeli. */}
                <View {...drag.panHandlers} accessibilityLabel="Aşağı çekip kapat">
                    {glass
                        ? <GlassView glassEffectStyle="regular" tintColor={c.tint} style={grabStyle}>{handle}</GlassView>
                        : <View style={[grabStyle, { backgroundColor: c.surf }]}>{handle}</View>}
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14 }}
                    // `flex: 1` boşluğu DOLDURUYORDU; `flexShrink` yalnız
                    // taşarsa kısaltıyor.
                    style={{ flexShrink: 1 }}
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
                        {/* "Alan" DEĞİL: `staff_id` hizmeti vereni tutuyor,
                            parayı alanı değil (`cash.staffLine`). Bilinmiyorsa
                            satır hiç çizilmiyor. */}
                        {movement.staff.trim() ? (
                            <Row label={STAFF_ROW_LABEL}>
                                <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, color: c.tx }}>{movement.staff}</Txt>
                            </Row>
                        ) : null}
                        {movement.note ? (
                            <Row label="Açıklama">
                                <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, color: c.tx }}>{movement.note}</Txt>
                            </Row>
                        ) : null}
                    </Section>

                    {onOpenCustomer ? (
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => close(onOpenCustomer)}
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
                    ) : null}

                    {/* Dürüstlük notu eylemlerin ÜSTÜNDE: müdür butona basmadan
                        önce ne olacağını okusun. Salt okunur fişte aynı yerde
                        eylemlerin NEREDE olduğu yazıyor. */}
                    <View style={{
                        flexDirection: 'row', gap: 8, paddingTop: 12,
                        paddingBottom: onVoid ? 12 : insets.bottom + 30,
                        borderTopWidth: 1, borderTopColor: c.bd,
                    }}>
                        <View style={{ width: 13, height: 1, marginTop: 8, backgroundColor: c.tx3 }} />
                        <Txt style={{ flex: 1, fontSize: 12, lineHeight: 18, color: c.tx3 }}>
                            {onVoid ? CORRECTION_NOTE : READ_ONLY_NOTE}
                        </Txt>
                    </View>
                </ScrollView>

                {/* Düzeltme alanı — eylem satırının YERİNE geçer.
                    İkinci bir katman açmıyor: sheet zaten bir katman ve
                    düzeltme onay istemiyor. */}
                {correcting ? (
                    <View style={{
                        gap: 10,
                        paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 30,
                        borderTopWidth: 1, borderTopColor: c.bd, backgroundColor: c.surf,
                    }}>
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 7,
                            height: cashMetrics.actionHeight,
                            paddingHorizontal: 14,
                            borderRadius: cashMetrics.actionRadius,
                            backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd2,
                        }}>
                            <Txt style={{ fontFamily: font.bold, fontSize: 17, color: c.tx3 }}>₺</Txt>
                            <TextInput
                                value={draft}
                                onChangeText={setDraft}
                                autoFocus
                                keyboardType="number-pad"
                                selectionColor={c.or}
                                selectTextOnFocus
                                accessibilityLabel="Düzeltilmiş tutar"
                                style={{
                                    flex: 1, color: c.tx, fontSize: 17,
                                    fontFamily: font.semiBold, fontWeight: '600',
                                }}
                            />
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={ACTION_CANCEL}
                                onPress={() => setCorrecting(false)}
                                style={{
                                    flex: 1, alignItems: 'center', justifyContent: 'center',
                                    height: cashMetrics.actionHeight,
                                    borderRadius: cashMetrics.actionRadius,
                                    borderWidth: 1, borderColor: c.bd2,
                                }}
                            >
                                <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.actionFont, color: c.tx2 }}>
                                    {ACTION_CANCEL}
                                </Txt>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Düzeltmeyi kaydet"
                                // Aynı tutar ya da geçersiz sayı KAYDEDİLMEZ:
                                // düzeltme olmayan bir düzeltme, kasaya iki
                                // satır ekleyip hiçbir şeyi değiştirmezdi.
                                disabled={!canCorrect(draft, movement.amount)}
                                accessibilityState={{ disabled: !canCorrect(draft, movement.amount) }}
                                onPress={() => {
                                    const amount = parseAmount(draft);
                                    if (amount === null) return;
                                    close(() => onCorrect?.(amount));
                                }}
                                style={{
                                    flex: 1, alignItems: 'center', justifyContent: 'center',
                                    height: cashMetrics.actionHeight,
                                    borderRadius: cashMetrics.actionRadius,
                                    backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd2,
                                    opacity: canCorrect(draft, movement.amount) ? 1 : 0.4,
                                }}
                            >
                                <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.actionFont, color: c.tx }}>
                                    Kaydet
                                </Txt>
                            </Pressable>
                        </View>
                    </View>
                ) : !onVoid ? null : (
                /* İki eylem, iki biçim. Yıkıcı olan DOLGULU DEĞİL: yanlışlıkla
                   en cazip görünen şey olmamalı. */
                <View style={{
                    flexDirection: 'row', gap: 10,
                    paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 30,
                    borderTopWidth: 1, borderTopColor: c.bd, backgroundColor: c.surf,
                }}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={ACTION_CORRECT}
                        onPress={() => { setDraft(String(movement.amount)); setCorrecting(true); }}
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
                )}
            </Animated.View>
        </Modal>
    );
}

// ── Gün sonu / dönem özeti ───────────────────────────────────────────────────

/**
 * "Gün sonu özeti" düğmesinin sayfası — masaüstündeki `dayEnd` modalının
 * mobil karşılığı. YENİ SUNUCU UCU YOK: ekran zaten seçili dönemin
 * hareketlerini okumuş, `totals` bunlardan türemiş (`totalsOf`, `cash.tsx`).
 * Bu sayfa aynı veriyi yöntem bazında döküyor, hiçbir şey yeniden çekmiyor.
 *
 * Kapsam SEÇİLİ SEKMEYE göre değişir (2026-09-22 kararı): Bugün'deyken gün
 * sonu, Bu ay'dayken ay özeti — masaüstünün sabit "bugün" davranışından
 * BİLEREK ayrılıyor, mobilde zaten üç sekme var.
 *
 * Salt okunur, aksiyon YOK (kullanıcı kararı — "Yazdır"ın telefon karşılığı
 * istenmedi). Kapatma yalnız arka plana dokunarak; `MovementSheet`'in salt
 * okunur hâliyle aynı, kendine özgü bir "Kapat" düğmesi eklemiyor.
 */
export function DayEndSheet({ visible, period, totals, onDismiss }: {
    visible: boolean;
    period: CashPeriod;
    totals: CashTotals;
    onDismiss: () => void;
}) {
    const { c } = useTheme();

    return (
        <BottomSheet visible={visible} onDismiss={onDismiss}>
            <SheetGrab />
            <View style={{ paddingHorizontal: 20, paddingBottom: 30 }}>
                <Text style={{ fontFamily: font.extraBold, fontSize: 19, letterSpacing: -0.4, color: c.tx }}>
                    {periodSummaryTitle(period)}
                </Text>
                <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.tx2, marginTop: 2 }}>
                    {counterLine(totals)}
                </Text>

                <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                    <Money style={{ fontFamily: font.extraBold, fontSize: 34, fontWeight: '800', letterSpacing: -0.6, color: c.tx }}>
                        ₺{formatAmount(totals.total)}
                    </Money>
                </View>

                {totals.shares.length === 0 ? (
                    <Text style={{ fontFamily: font.medium, fontSize: 13.5, color: c.tx2, textAlign: 'center', paddingVertical: 12 }}>
                        Bu dönemde tahsilat yok.
                    </Text>
                ) : (
                    <Section title="Yönteme göre" color={c.tx3} border={c.bd}>
                        {totals.shares.map((s) => (
                            <View key={s.method} style={{
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                minHeight: cashMetrics.sheetRowHeight,
                            }}>
                                <Text style={{ fontFamily: font.medium, fontSize: cashMetrics.sheetRowFont, color: c.tx2 }}>
                                    {methodLabel(s.method)}
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                                    <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.tx3 }}>
                                        %{Math.round(s.percent)}
                                    </Text>
                                    <Money style={{ fontFamily: font.bold, fontSize: cashMetrics.sheetRowFont, fontWeight: '700', color: c.tx }}>
                                        ₺{formatAmount(s.amount)}
                                    </Money>
                                </View>
                            </View>
                        ))}
                    </Section>
                )}
            </View>
        </BottomSheet>
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
