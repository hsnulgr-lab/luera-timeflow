import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { BottomSheet, SheetGrab } from './Sheet';
import { COLLECT_METHODS } from '../lib/collect';
import { feedback } from '../lib/feedback';
import { collectPlanPayment } from '../lib/managerWrite';
import { newPlanId } from '../lib/packageSale';
import {
    defaultAmountText, parsePlanAmount, payLabel, planPaymentFailureLine, remainingLine,
    type PlanPaymentFailure, type PlanPaymentMethod,
} from '../lib/planPayment';
import { cashMetrics, font, onAccent, useTheme } from '../theme';

/**
 * Paket ödemesi — peşinat ya da kalan borç, TELEFONDAN (1.0.1).
 *
 * Kullanıcı kararı: tek kişilik işletmenin bilgisayarı yok; paket bedeli de
 * telefonda alınmalı. İki kapıdan açılıyor: müşteri kartındaki paket
 * satırının "Ödeme al"ı ve satıştan dönüşte (yeni paket — başlık "Peşinat al",
 * altta "Sonra").
 *
 * İki alan, Kasa'daki düzeltme sayfasıyla aynı dil: TUTAR (kalan borçla dolu
 * gelir, peşinat için düzenlenir) ve YÖNTEM (tahsilat güvertesinin üçlüsü,
 * varsayılan YOK). Düğme tutarı ve yöntemi birlikte söylüyor; ret sebebi
 * düğmenin üstünde.
 *
 * Kimlik açılışta üretiliyor ve sayfa açıkken DEĞİŞMİYOR: cevap kaybolup
 * "tekrar"a basılırsa aynı satır ikinci kez yazılamaz.
 */
export function PackagePaymentSheet({ visible, pack, customerId, fresh = false, onDismiss, onPaid }: {
    visible: boolean;
    pack: { planId: string; title: string; owed: number } | null;
    customerId: string;
    /** Satıştan dönüş: başlık "Peşinat al", vazgeçme "Sonra". */
    fresh?: boolean;
    onDismiss: () => void;
    onPaid: () => void;
}) {
    const { c } = useTheme();
    const owed = pack?.owed ?? 0;
    const [text, setText] = useState(() => defaultAmountText(owed));
    const [method, setMethod] = useState<PlanPaymentMethod | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<PlanPaymentFailure | null>(null);
    const [paymentId, setPaymentId] = useState(() => newPlanId());

    // Her açılış TEMİZ: önceki yöntem ve yarım tutar taşınmaz, kimlik yenilenir.
    // Render sırasında: açılışın ilk karesi eski hâli göstermesin.
    const [wasKey, setWasKey] = useState<string | null>(visible ? pack?.planId ?? null : null);
    const key = visible ? pack?.planId ?? null : null;
    if (key !== wasKey) {
        setWasKey(key);
        if (key) {
            setText(defaultAmountText(owed));
            setMethod(null);
            setFailed(null);
            setPaymentId(newPlanId());
        }
    }

    const amount = parsePlanAmount(text);
    const action = payLabel(amount, owed, method);

    const pay = async () => {
        if (!pack || busy || !action.enabled || amount === null || !method) return;
        setBusy(true);
        setFailed(null);
        const result = await collectPlanPayment({
            id: paymentId, planId: pack.planId, customerId, title: pack.title, amount, method,
        }).catch(() => ({ ok: false, failure: 'failed' } as const));
        setBusy(false);
        if (!result.ok) {
            feedback.warning();
            setFailed(result.failure);
            return;
        }
        feedback.success();
        onPaid();
    };

    return (
        <BottomSheet visible={visible} onDismiss={busy ? () => {} : onDismiss}>
            <SheetGrab />
            <View style={{ paddingHorizontal: 16, paddingBottom: 22, gap: 14 }}>
                <View style={{ gap: 3 }}>
                    <Text style={{
                        color: c.tx3, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800',
                        letterSpacing: 10.5 * 0.14,
                    }}>
                        {fresh ? 'PEŞİNAT AL' : 'ÖDEME AL'}
                    </Text>
                    <Text numberOfLines={1} style={{
                        color: c.tx, fontSize: 19, fontFamily: font.extraBold, fontWeight: '800',
                        letterSpacing: 19 * -0.02,
                    }}>
                        {pack ? `${pack.title} paketi` : ''}
                    </Text>
                </View>

                <View style={{ gap: 7 }}>
                    <Text style={{ fontFamily: font.bold, fontWeight: '700', fontSize: 11, letterSpacing: 0.6, color: c.tx3 }}>
                        TUTAR
                    </Text>
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 7,
                        height: cashMetrics.actionHeight,
                        paddingHorizontal: 14,
                        borderRadius: cashMetrics.actionRadius,
                        backgroundColor: c.surf2, borderWidth: 1, borderColor: failed === 'over' ? c.rd : c.bd2,
                    }}>
                        <Text style={{ fontFamily: font.bold, fontWeight: '700', fontSize: 17, color: c.tx3 }}>₺</Text>
                        <TextInput
                            value={text}
                            onChangeText={(next) => { setText(next); setFailed(null); }}
                            keyboardType="number-pad"
                            selectionColor={c.or}
                            selectTextOnFocus
                            editable={!busy}
                            accessibilityLabel="Tahsil edilecek tutar"
                            style={{
                                flex: 1, color: c.tx, fontSize: 17,
                                fontFamily: font.semiBold, fontWeight: '600',
                            }}
                        />
                    </View>
                    <Text style={{ fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, color: c.tx3 }}>
                        {remainingLine(owed, amount)}
                    </Text>
                </View>

                <View style={{ gap: 7 }}>
                    <Text style={{ fontFamily: font.bold, fontWeight: '700', fontSize: 11, letterSpacing: 0.6, color: c.tx3 }}>
                        YÖNTEM
                    </Text>
                    {/* Tahsilat güvertesiyle AYNI üçlü; varsayılan yok. */}
                    <View style={{
                        flexDirection: 'row', padding: 3, gap: 3,
                        borderRadius: cashMetrics.actionRadius,
                        backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd,
                    }}>
                        {COLLECT_METHODS.map((item) => {
                            const on = item.key === method;
                            return (
                                <Pressable
                                    key={item.key}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: on }}
                                    accessibilityLabel={`Ödeme yöntemi: ${item.label}`}
                                    disabled={busy}
                                    onPress={() => { feedback.selection(); setMethod(item.key); setFailed(null); }}
                                    style={({ pressed }) => ({
                                        flex: 1, height: cashMetrics.actionHeight - 10,
                                        alignItems: 'center', justifyContent: 'center',
                                        borderRadius: cashMetrics.actionRadius - 3,
                                        backgroundColor: on ? c.card : 'transparent',
                                        opacity: pressed ? 0.7 : 1,
                                    })}
                                >
                                    <Text style={{
                                        fontFamily: font.bold, fontWeight: '700', fontSize: 14.5,
                                        color: on ? c.tx : c.tx2,
                                    }}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* RET SEBEBİ DÜĞMENİN ÜSTÜNDE — parmağın baktığı yer. */}
                {failed ? (
                    <Text accessibilityLiveRegion="polite" style={{
                        color: c.rd, fontSize: 13, fontFamily: font.semiBold, fontWeight: '600', lineHeight: 13 * 1.4,
                    }}>
                        {planPaymentFailureLine(failed)}
                    </Text>
                ) : null}

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    accessibilityState={{ disabled: !action.enabled || busy, busy }}
                    disabled={!action.enabled || busy}
                    onPress={() => { feedback.light(); void pay(); }}
                    style={({ pressed }) => ({
                        height: cashMetrics.actionHeight,
                        alignItems: 'center', justifyContent: 'center',
                        borderRadius: cashMetrics.actionRadius,
                        backgroundColor: action.enabled && !busy ? c.or : c.fld,
                        borderWidth: action.enabled && !busy ? 0 : 1, borderColor: c.bd2,
                        opacity: pressed ? 0.9 : 1,
                    })}
                >
                    {busy ? (
                        <ActivityIndicator color={onAccent} />
                    ) : (
                        <Text numberOfLines={1} style={{
                            fontFamily: font.extraBold, fontWeight: '800', fontSize: cashMetrics.actionFont,
                            color: action.enabled ? onAccent : c.tx3,
                        }}>
                            {action.label}
                        </Text>
                    )}
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={fresh ? 'Sonra' : 'Vazgeç'}
                    accessibilityHint={fresh ? 'Ödeme müşteri kartındaki paket satırından alınır' : undefined}
                    disabled={busy}
                    onPress={onDismiss}
                    style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Text style={{ color: c.tx2, fontSize: 15, fontFamily: font.bold, fontWeight: '700' }}>
                        {fresh ? 'Sonra' : 'Vazgeç'}
                    </Text>
                </Pressable>
            </View>
        </BottomSheet>
    );
}
