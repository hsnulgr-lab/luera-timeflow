import { useEffect, useRef, useState } from 'react';
import {
    Animated, Easing, Modal, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Num } from './ui';
import { BottomSheet, SheetGrab } from './Sheet';
import { feedback } from '../lib/feedback';
import {
    NOTE_HINT, NOTE_SCOPE, NOTE_TITLE, SERVICE_SHEET_TITLE, confirmCopy,
    serviceChoices, serviceSheetSubtitle,
    type DestructiveAction, type ServiceChoice,
} from '../lib/appointmentDetail';
import {
    NOTE_MAX, NOTE_WARN, apptInCurve, apptCardMetrics, apptMotion, apptOutCurve,
    font, radius, useTheme, type Curve,
} from '../theme';
import type { Appt } from '../lib/calendar';


/** Eğriyi `Easing.bezier`'e uygular — üçlü koşulda demet tipi kaybolmasın. */
function bezier(curve: Curve) {
    return Easing.bezier(curve[0], curve[1], curve[2], curve[3]);
}

/**
 * Müdür 25 · B, C, D — hizmeti değiştir, notu düzenle, iki onay.
 *
 * Üçü de bu turdan önce HİÇ YOKTU: "Hizmeti değiştir" ve "Notu düzenle"
 * satırları chevron gösterip hiçbir şey açmıyordu, iptal ise onay sormadan
 * ekranı kapatıyordu. Ölü kontrol kalmadı.
 */

// ── Ortak sheet başlığı ─────────────────────────────────────────────────────

function SheetHeading({ title, action, actionOn, onAction }: {
    title: string;
    action: string;
    /** Değişiklik yokken SÖNÜK — ölü değil, sönük. */
    actionOn: boolean;
    onAction: () => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{
                flex: 1,
                color: c.tx,
                fontSize: apptCardMetrics.sheetTitle,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: apptCardMetrics.sheetTitle * -0.03,
                lineHeight: apptCardMetrics.sheetTitle * 1.15,
            }}>
                {title}
            </Text>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={action}
                accessibilityState={{ disabled: !actionOn }}
                disabled={!actionOn}
                onPress={() => { feedback.success(); onAction(); }}
                hitSlop={10}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 3 })}
            >
                <Text style={{
                    color: actionOn ? c.or : c.tx3,
                    fontSize: apptCardMetrics.sheetSave,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                }}>
                    {action}
                </Text>
            </Pressable>
        </View>
    );
}

function SheetSub({ text }: { text: string }) {
    const { c } = useTheme();
    return (
        <Text style={{
            color: c.tx2,
            fontSize: apptCardMetrics.sheetSub,
            fontFamily: font.medium,
            fontWeight: '500',
            lineHeight: apptCardMetrics.sheetSub * apptCardMetrics.sheetSubLine,
        }}>
            {text}
        </Text>
    );
}

// ── B · Hizmeti değiştir ────────────────────────────────────────────────────

export function ServiceSheet({ visible, appointment, dayAppointments, staffName, onDismiss, onPick }: {
    visible: boolean;
    appointment: Appt;
    dayAppointments: readonly Appt[];
    staffName?: string | null;
    onDismiss: () => void;
    onPick: (choice: ServiceChoice) => void;
}) {
    const { c } = useTheme();
    const [picked, setPicked] = useState<string | null>(null);
    const choices = serviceChoices(appointment, dayAppointments, staffName);
    const chosen = choices.find((choice) => choice.id === picked) ?? null;

    useEffect(() => { if (!visible) setPicked(null); }, [visible]);

    return (
        <BottomSheet visible={visible} onDismiss={onDismiss}>
            <SheetGrab />
            <View style={{
                paddingHorizontal: apptCardMetrics.sheetPadX,
                paddingBottom: apptCardMetrics.sheetPadBottom,
                gap: apptCardMetrics.sheetGap,
            }}>
                <SheetHeading
                    title={SERVICE_SHEET_TITLE}
                    action="Kaydet"
                    actionOn={chosen !== null}
                    onAction={() => { if (chosen) onPick(chosen); }}
                />
                {/* Sheet sayfanın üstünde açılıyor ve sayfa görünmüyor:
                    hangi randevuyu değiştirdiğini sheet KENDİ söylüyor. */}
                <SheetSub text={serviceSheetSubtitle(appointment, staffName)} />

                <ScrollView style={{ maxHeight: 396 }} showsVerticalScrollIndicator={false}>
                    {choices.map((choice, index) => {
                        const selected = picked === null ? choice.selected : picked === choice.id;
                        return (
                            <Pressable
                                key={choice.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                accessibilityLabel={`${choice.name}, ${choice.minutes} dakika, ${choice.price} lira${choice.clash ? `. ${choice.clash}` : ''}`}
                                onPress={() => { feedback.selection(); setPicked(choice.id); }}
                                style={({ pressed }) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: apptCardMetrics.optGap,
                                    paddingVertical: apptCardMetrics.optPadY,
                                    borderTopWidth: index === 0 ? 0 : 1,
                                    borderColor: c.bd,
                                    opacity: pressed ? 0.6 : 1,
                                })}
                            >
                                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                                    <Text numberOfLines={1} style={{
                                        color: c.tx,
                                        fontSize: apptCardMetrics.optName,
                                        fontFamily: font.bold,
                                        fontWeight: '700',
                                        letterSpacing: apptCardMetrics.optName * -0.01,
                                    }}>
                                        {choice.name}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                        {/* Uzayan süre KALIN: değişimin yönü rakamda okunuyor. */}
                                        <Num size={apptCardMetrics.optMeta} style={{
                                            color: choice.longer ? c.tx : c.tx2,
                                            fontFamily: choice.longer ? font.bold : font.medium,
                                            fontWeight: choice.longer ? '700' : '500',
                                        }}>
                                            {`${choice.minutes} dk`}
                                        </Num>
                                        <Num size={apptCardMetrics.optMeta} style={{
                                            color: c.tx2,
                                            fontFamily: font.medium,
                                            fontWeight: '500',
                                        }}>
                                            {`· ₺${choice.price.toLocaleString('tr-TR')}`}
                                        </Num>
                                    </View>
                                    {/* Çakışan seçenek ENGELLENMEZ: müdür bilerek
                                        çakıştırabilir, engellemek onu uygulamanın
                                        dışına iter. */}
                                    {choice.clash ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 1 }}>
                                            <View style={{
                                                width: apptCardMetrics.optClashDot,
                                                height: apptCardMetrics.optClashDot,
                                                borderRadius: apptCardMetrics.optClashDot,
                                                backgroundColor: c.am,
                                            }} />
                                            <Text numberOfLines={1} style={{
                                                color: c.am,
                                                fontSize: apptCardMetrics.optClash,
                                                fontFamily: font.semiBold,
                                                fontWeight: '600',
                                                flexShrink: 1,
                                            }}>
                                                {choice.clash}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>

                                <View style={{
                                    width: apptCardMetrics.optTick,
                                    height: apptCardMetrics.optTick,
                                    borderRadius: radius.pill,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: apptCardMetrics.optTickBorder,
                                    borderColor: selected ? c.tx : c.bd2,
                                    backgroundColor: selected ? c.tx : 'transparent',
                                }}>
                                    {selected ? (
                                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c.bg} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                                            <Path d="M5 12.5l4.5 4.5L19 7" />
                                        </Svg>
                                    ) : null}
                                </View>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>
        </BottomSheet>
    );
}

// ── C · Notu düzenle ────────────────────────────────────────────────────────

export function NoteSheet({ visible, appointment, onDismiss, onSave }: {
    visible: boolean;
    appointment: Appt;
    onDismiss: () => void;
    onSave: (text: string) => void;
}) {
    const { c } = useTheme();
    const [text, setText] = useState(appointment.notes ?? '');

    useEffect(() => { if (visible) setText(appointment.notes ?? ''); }, [visible, appointment.notes]);

    const changed = text.trim() !== (appointment.notes ?? '').trim();
    const warn = text.length > NOTE_WARN;

    return (
        <BottomSheet visible={visible} onDismiss={onDismiss}>
            <SheetGrab />
            <View style={{
                paddingHorizontal: apptCardMetrics.sheetPadX,
                paddingBottom: apptCardMetrics.sheetPadBottom,
                gap: apptCardMetrics.sheetGap,
            }}>
                {/* Kaydet klavyenin üstünde DEĞİL, başlığın sağında: alan
                    büyüdükçe düğme kaymaz ve yanlışlıkla basılması zorlaşır. */}
                <SheetHeading
                    title={NOTE_TITLE}
                    action="Kaydet"
                    actionOn={changed}
                    onAction={() => onSave(text)}
                />
                <SheetSub text={NOTE_HINT} />

                <View style={{
                    borderRadius: apptCardMetrics.fieldRadius,
                    padding: apptCardMetrics.fieldPadding,
                    minHeight: apptCardMetrics.fieldMinHeight,
                    backgroundColor: c.surf2,
                }}>
                    <TextInput
                        value={text}
                        onChangeText={setText}
                        multiline
                        autoFocus={visible}
                        maxLength={NOTE_MAX}
                        placeholder="Salonun notu…"
                        placeholderTextColor={c.tx3}
                        selectionColor={c.or}
                        style={{
                            flex: 1,
                            color: c.tx,
                            fontSize: apptCardMetrics.fieldText,
                            fontFamily: font.medium,
                            fontWeight: '500',
                            lineHeight: apptCardMetrics.fieldText * apptCardMetrics.fieldLine,
                            textAlignVertical: 'top',
                        }}
                    />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{
                        color: c.tx3,
                        fontSize: apptCardMetrics.countText,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {NOTE_SCOPE}
                    </Text>
                    <Num size={apptCardMetrics.countText} style={{
                        color: warn ? c.am : c.tx3,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {`${text.length} / ${NOTE_MAX}`}
                    </Num>
                </View>
            </View>
        </BottomSheet>
    );
}

// ── D · İki onay, aynı iskelet, farklı ağırlık ──────────────────────────────

export function ConfirmDialog({ visible, action, appointment, staffName, onDismiss, onConfirm }: {
    visible: boolean;
    action: DestructiveAction;
    appointment: Appt;
    staffName?: string | null;
    onDismiss: () => void;
    onConfirm: () => void;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const copy = confirmCopy(action, appointment, staffName);
    const enter = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduceMotion) {
            enter.setValue(visible ? 1 : 0);
            return;
        }
        Animated.timing(enter, {
            toValue: visible ? 1 : 0,
            duration: visible ? apptMotion.dialog.in : apptMotion.dialog.out,
            easing: bezier(visible ? apptInCurve : apptOutCurve),
            useNativeDriver: true,
        }).start();
    }, [visible, reduceMotion, enter]);

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
            <Animated.View style={{ flex: 1, opacity: enter }}>
                <Pressable
                    accessibilityLabel="Kapat"
                    onPress={onDismiss}
                    style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: apptCardMetrics.dlgInset,
                        backgroundColor: dark ? 'rgba(0,0,0,0.55)' : 'rgba(14,14,14,0.34)',
                    }}
                >
                    {/* Sheet DEĞİL, ortada: sheet "devam eden bir iş", diyalog
                        "duran bir karar". */}
                    <Animated.View style={{
                        width: '100%',
                        transform: [{
                            scale: enter.interpolate({
                                inputRange: [0, 1],
                                outputRange: [apptMotion.dialog.from, 1],
                            }),
                        }],
                    }}>
                        <Pressable
                            onPress={(event) => event.stopPropagation()}
                            style={{
                                gap: apptCardMetrics.dlgGap,
                                padding: apptCardMetrics.dlgPadding,
                                borderRadius: apptCardMetrics.dlgRadius,
                                backgroundColor: c.surf,
                                borderWidth: 1,
                                borderColor: c.bd,
                            }}
                        >
                            <Text style={{
                                color: c.tx,
                                fontSize: apptCardMetrics.dlgTitle,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: apptCardMetrics.dlgTitle * -0.03,
                                lineHeight: apptCardMetrics.dlgTitle * 1.15,
                            }}>
                                {copy.title}
                            </Text>

                            <Text style={{
                                color: c.tx2,
                                fontSize: apptCardMetrics.dlgBody,
                                fontFamily: font.medium,
                                fontWeight: '500',
                                lineHeight: apptCardMetrics.dlgBody * apptCardMetrics.dlgBodyLine,
                            }}>
                                {copy.body}
                            </Text>

                            {/* Neyin iptal/silineceği yazılı: "emin misiniz?" bir cevap değil. */}
                            <View style={{
                                gap: 3,
                                padding: apptCardMetrics.dlgSumPadding,
                                borderRadius: apptCardMetrics.dlgSumRadius,
                                backgroundColor: c.surf2,
                            }}>
                                <Text style={{
                                    color: c.tx,
                                    fontSize: apptCardMetrics.dlgSumName,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                    letterSpacing: apptCardMetrics.dlgSumName * -0.02,
                                }}>
                                    {copy.name}
                                </Text>
                                <Text style={{
                                    color: c.tx2,
                                    fontSize: apptCardMetrics.dlgSumLine,
                                    fontFamily: font.medium,
                                    fontWeight: '500',
                                }}>
                                    {copy.line}
                                </Text>
                            </View>

                            <View style={{ gap: apptCardMetrics.dlgBtnGap }}>
                                {/* Dolu buton KALICI olanı değil GÜVENLİ olanı taşır. */}
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={copy.cancel}
                                    onPress={onDismiss}
                                    style={({ pressed }) => ({
                                        height: apptCardMetrics.dlgBtnHeight,
                                        borderRadius: apptCardMetrics.dlgBtnRadius,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: c.tx,
                                        opacity: pressed ? 0.85 : 1,
                                    })}
                                >
                                    <Text style={{
                                        color: c.bg,
                                        fontSize: apptCardMetrics.dlgBtnText,
                                        fontFamily: font.extraBold,
                                        fontWeight: '800',
                                    }}>
                                        {copy.cancel}
                                    </Text>
                                </Pressable>

                                <DestructiveButton copy={copy} onConfirm={onConfirm} />
                            </View>
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </Animated.View>
        </Modal>
    );
}

/**
 * İptalde tek dokunuş yeter, silmede parmağın KALMASI gerekir.
 *
 * Fark bir kelimede değil bir jestte — okumadan geçen müdür bile duruyor.
 * Basılı tut çubuğu uygulamanın başka hiçbir yerinde yok; tek geri alınamaz
 * iş bu.
 */
function DestructiveButton({ copy, onConfirm }: {
    copy: ReturnType<typeof confirmCopy>;
    onConfirm: () => void;
}) {
    const { c, reduceMotion } = useTheme();
    const fill = useRef(new Animated.Value(0)).current;
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const cancelHold = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        Animated.timing(fill, { toValue: 0, duration: 140, useNativeDriver: true }).start();
    };

    const startHold = () => {
        feedback.warning();
        Animated.timing(fill, {
            toValue: 1,
            duration: apptMotion.hold,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start();
        timer.current = setTimeout(() => { feedback.error(); onConfirm(); }, apptMotion.hold);
    };

    if (!copy.hold) {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.confirm}
                onPress={() => { feedback.warning(); onConfirm(); }}
                style={({ pressed }) => ({
                    height: apptCardMetrics.dlgBtnHeight,
                    borderRadius: apptCardMetrics.dlgBtnRadius,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: c.bd2,
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                <Text style={{
                    color: c.rd,
                    fontSize: apptCardMetrics.dlgBtnText,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                }}>
                    {copy.confirm}
                </Text>
            </Pressable>
        );
    }

    return (
        <View style={{ gap: apptCardMetrics.dlgBtnGap }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.confirm}
                accessibilityHint="Silmek için basılı tutun"
                delayLongPress={apptMotion.hold}
                onPressIn={reduceMotion ? undefined : startHold}
                onPressOut={reduceMotion ? undefined : cancelHold}
                onPress={reduceMotion ? () => { feedback.error(); onConfirm(); } : undefined}
                style={({ pressed }) => ({
                    height: apptCardMetrics.dlgBtnHeight,
                    borderRadius: apptCardMetrics.dlgBtnRadius,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: apptCardMetrics.holdBorder,
                    opacity: pressed ? 0.85 : 1,
                })}
            >
                <Text style={{
                    color: c.rd,
                    fontSize: apptCardMetrics.dlgBtnText,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                }}>
                    {reduceMotion ? copy.confirm : `${copy.confirm} · basılı tut`}
                </Text>
            </Pressable>

            {!reduceMotion ? (
                <View style={{
                    height: apptCardMetrics.holdHeight,
                    borderRadius: apptCardMetrics.holdRadius,
                    backgroundColor: c.bd,
                    overflow: 'hidden',
                }}>
                    <Animated.View style={{
                        height: '100%',
                        width: '100%',
                        backgroundColor: c.rd,
                        transform: [{ scaleX: fill }],
                        // Sol kökenli: çubuk soldan sağa dolar.
                        alignSelf: 'flex-start',
                        transformOrigin: 'left center',
                    }} />
                </View>
            ) : null}
        </View>
    );
}
