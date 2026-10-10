import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Animated, Easing, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView,
    Text, TextInput, useWindowDimensions, View,
    type TextStyle, type ViewStyle,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet, SheetGrab } from './Sheet';
import { Chevron, Money } from './CashParts';
import {
    ACTION_CORRECT, ACTION_CORRECT_SUB, ACTION_SAVE, ACTION_VOID, ACTION_VOID_SUB,
    ACTIONS_NOTE, CORRECTION_NOTE, READ_ONLY_NOTE, SHEET_SECTIONS, STAFF_ROW_LABEL,
    canCorrect, counterLine, customerCardLabel, formatAmount, formatMoney, methodLabel, parseAmount,
    periodSummaryTitle,
    type CashMethod, type CashPeriod, type CashTotals, type Movement,
} from '../lib/cash';
import { COLLECT_METHODS } from '../lib/collect';
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
     * Düzeltme KAYDEDİLDİ — tutar ve yöntem birlikte (v4 · C3).
     *
     * Hata mesajı döndürüyor, `void` değil: "ret gelirse sayfa AÇIK KALIR,
     * sebep düğmenin üstünde." Başarıda `null` dönüyor ve sheet kapanıyor.
     * Ekranı yöneten taraf sunucuyu çağırıyor; sheet yalnız sonucu gösteriyor.
     *
     * Düzeltme ONAY İSTEMİYOR: geri alınabilir bir iş (yanlış düzeltme yine
     * düzeltilir). Onay yalnız "Geri al"da, çünkü o adisyonu açıyor.
     */
    onCorrect?: (amount: number, method: CashMethod) => Promise<string | null>;
}) {
    const { c, dark, glass, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const ink = dark ? cashInk.dark : cashInk.light;

    const sheetHeight = Math.min(cashMetrics.sheetMaxHeight, height - insets.top - 52);
    const backdrop = useRef(new Animated.Value(0)).current;
    const y = useRef(new Animated.Value(sheetHeight)).current;
    const closing = useRef(false);
    // Düzeltme hâli — sheet'in İÇERİĞİNİN yerini alır (v4 · C3 ayrı bir sayfa).
    const [correcting, setCorrecting] = useState(false);
    const [draft, setDraft] = useState('');
    const [methodDraft, setMethodDraft] = useState<CashMethod | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    /*
     * Seçicide YERİ OLAN yöntem. Masaüstü `other` yazabiliyor ve o üçlüde
     * yok: seçili hiçbir şey olmadan açılıyor, yani kaydetmek için kullanıcı
     * bilerek bir yöntem seçmek zorunda. Rastgele birini işaretlemek, hiç
     * sorulmadan yöntemi değiştirmek olurdu.
     */
    const correctableMethod: CashMethod | null =
        COLLECT_METHODS.some((item) => item.key === movement.method) ? movement.method : null;
    const canSave = canCorrect(draft, movement.amount, methodDraft, movement.method);

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

                    {/*
                      * Salt okunur fişte eylemlerin NEREDE olduğu yazıyor.
                      * Eylemler açıkken bu cümle YOK: v4 notu satırların
                      * ALTINA koyuyor ve satırların kendi alt yazıları zaten
                      * ne yapacaklarını söylüyor (C2).
                      */}
                    {onVoid ? null : (
                        <View style={{
                            flexDirection: 'row', gap: 8, paddingTop: 12,
                            paddingBottom: insets.bottom + 30,
                            borderTopWidth: 1, borderTopColor: c.bd,
                        }}>
                            <View style={{ width: 13, height: 1, marginTop: 8, backgroundColor: c.tx3 }} />
                            <Txt style={{ flex: 1, fontSize: 12, lineHeight: 18, color: c.tx3 }}>
                                {READ_ONLY_NOTE}
                            </Txt>
                        </View>
                    )}
                </ScrollView>

                {/*
                  * DÜZELTME SAYFASI (v4 · C3).
                  *
                  * İki alan: tutar ve yöntem. Başkası yok — yanlış müşteriye
                  * yazılan tahsilat düzeltilmez, GERİ ALINIR ve doğru
                  * adisyondan yeniden alınır.
                  */}
                {correcting ? (
                    <View style={{
                        gap: 16,
                        paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 26,
                        borderTopWidth: 1, borderTopColor: c.bd, backgroundColor: c.surf,
                    }}>
                        <View style={{ gap: 7 }}>
                            <Txt style={{
                                fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: c.tx3,
                            }}>
                                TUTAR
                            </Txt>
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
                                    onChangeText={(next) => { setDraft(next); setSaveError(null); }}
                                    autoFocus
                                    keyboardType="number-pad"
                                    selectionColor={c.or}
                                    selectTextOnFocus
                                    editable={!saving}
                                    accessibilityLabel="Düzeltilmiş tutar"
                                    style={{
                                        flex: 1, color: c.tx, fontSize: 17,
                                        fontFamily: font.semiBold, fontWeight: '600',
                                    }}
                                />
                                {/* ESKİ TUTAR ÜSTÜ ÇİZİLİ, yanında duruyor: neyin
                                    değiştiği karşılaştırmasız anlaşılmaz. */}
                                <Txt style={{
                                    fontFamily: font.semiBold, fontSize: 15, color: c.tx3,
                                    textDecorationLine: 'line-through',
                                }}>
                                    {formatMoney(movement.amount)}
                                </Txt>
                            </View>
                        </View>

                        <View style={{ gap: 7 }}>
                            <Txt style={{
                                fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: c.tx3,
                            }}>
                                YÖNTEM
                            </Txt>
                            {/* Tahsilat güvertesiyle AYNI üçlü (`COLLECT_METHODS`):
                                para hangi adla alındıysa o adla düzeltilir. */}
                            <View style={{
                                flexDirection: 'row', padding: 3, gap: 3,
                                borderRadius: cashMetrics.actionRadius,
                                backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd,
                            }}>
                                {COLLECT_METHODS.map((item) => {
                                    const on = item.key === methodDraft;
                                    return (
                                        <Pressable
                                            key={item.key}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: on }}
                                            accessibilityLabel={`Ödeme yöntemi: ${item.label}`}
                                            disabled={saving}
                                            onPress={() => { setMethodDraft(item.key); setSaveError(null); }}
                                            style={({ pressed }) => ({
                                                flex: 1, height: cashMetrics.actionHeight - 10,
                                                alignItems: 'center', justifyContent: 'center',
                                                borderRadius: cashMetrics.actionRadius - 3,
                                                backgroundColor: on ? c.card : 'transparent',
                                                opacity: pressed ? 0.7 : 1,
                                            })}
                                        >
                                            <Txt style={{
                                                fontFamily: font.bold, fontSize: 14.5,
                                                color: on ? c.tx : c.tx2,
                                            }}>
                                                {item.label}
                                            </Txt>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>

                        {/* RET SEBEBİ DÜĞMENİN ÜSTÜNDE — parmağın baktığı yer. */}
                        {saveError ? (
                            <Txt style={{
                                fontFamily: font.semiBold, fontSize: 13, lineHeight: 19, color: c.rd,
                            }}>
                                {saveError}
                            </Txt>
                        ) : null}

                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={ACTION_SAVE}
                            accessibilityState={{ disabled: !canSave || saving, busy: saving }}
                            disabled={!canSave || saving}
                            onPress={async () => {
                                const amount = parseAmount(draft);
                                if (amount === null || methodDraft === null) return;
                                setSaving(true);
                                setSaveError(null);
                                const failure = await onCorrect?.(amount, methodDraft) ?? null;
                                setSaving(false);
                                if (failure === null) close();
                                else setSaveError(failure);
                            }}
                            style={({ pressed }) => ({
                                height: cashMetrics.actionHeight,
                                alignItems: 'center', justifyContent: 'center',
                                borderRadius: cashMetrics.actionRadius,
                                backgroundColor: canSave && !saving ? c.or : c.fld,
                                borderWidth: canSave && !saving ? 0 : 1, borderColor: c.bd2,
                                opacity: pressed ? 0.9 : 1,
                            })}
                        >
                            {saving ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Txt style={{
                                    fontFamily: font.extraBold, fontSize: cashMetrics.actionFont,
                                    color: canSave ? '#FFFFFF' : c.tx3,
                                }}>
                                    {ACTION_SAVE}
                                </Txt>
                            )}
                        </Pressable>

                        <Txt style={{
                            fontSize: 12, lineHeight: 18, color: c.tx3, textAlign: 'center',
                        }}>
                            {CORRECTION_NOTE}
                        </Txt>
                    </View>
                ) : !onVoid ? null : (
                /*
                 * İKİ EYLEM, İKİ SATIR (v4 · C2).
                 *
                 * Düğme değil satır: alt yazı olmadan "Düzelt" neyin
                 * düzeltilebildiğini, "Geri al" da sonucunu söylemiyordu.
                 * Yıkıcı olan DOLGULU DEĞİL — yanlışlıkla en cazip görünen
                 * şey olmamalı; yalnız yazısı kırmızı.
                 */
                <View style={{
                    paddingTop: 4, paddingBottom: insets.bottom + 26,
                    borderTopWidth: 1, borderTopColor: c.bd, backgroundColor: c.surf,
                }}>
                    {([
                        { key: 'correct', title: ACTION_CORRECT, sub: ACTION_CORRECT_SUB, danger: false },
                        { key: 'void', title: ACTION_VOID, sub: ACTION_VOID_SUB, danger: true },
                    ] as const).map((row) => (
                        <Pressable
                            key={row.key}
                            accessibilityRole="button"
                            accessibilityLabel={row.title}
                            accessibilityHint={row.sub}
                            onPress={() => {
                                if (row.danger) { close(onVoid); return; }
                                setDraft(String(movement.amount));
                                setMethodDraft(correctableMethod);
                                setSaveError(null);
                                setCorrecting(true);
                            }}
                            style={({ pressed }) => ({
                                paddingHorizontal: 20, paddingVertical: 13,
                                opacity: pressed ? 0.6 : 1,
                            })}
                        >
                            <Txt style={{
                                fontFamily: font.bold, fontSize: 16, letterSpacing: -0.25,
                                color: row.danger ? c.rd : c.tx,
                            }}>
                                {row.title}
                            </Txt>
                            <Txt style={{ fontSize: 13, lineHeight: 18, color: c.tx3, marginTop: 1 }}>
                                {row.sub}
                            </Txt>
                        </Pressable>
                    ))}

                    {/* v4 notu satırların ALTINDA (C2). */}
                    <Txt style={{
                        paddingHorizontal: 20, paddingTop: 8,
                        fontSize: 12, lineHeight: 18, color: c.tx3,
                    }}>
                        {ACTIONS_NOTE}
                    </Txt>
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
