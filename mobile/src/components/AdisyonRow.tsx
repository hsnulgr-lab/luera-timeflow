/**
 * Personel 13 · adisyonun satırı — TEK BİLEŞEN, İKİ KABUK.
 *
 * İşlem sürerken satırlar alt sayfada, işlem bitince aynı satırlar sayfanın
 * kendisinde: aynı bileşen, aynı dokunuş, aynı düzenleme yüzü. Formül gövdesi
 * (Personel 12) neden tek bileşene indiyse bu da aynı sebeple.
 *
 * DÜZENLEME KARARI: satıra dokun → satır KENDİ YERİNDE açılıyor.
 *   · kaydırarak silme reddedildi — `gesture-handler` yok, `PanResponder`
 *     alt sayfanın çekme jestiyle çakışıyor ve daha kötüsü hedefsiz:
 *     eldivenli elle yanlış satırı silmenin en kısa yolu
 *   · her satıra `···` reddedildi — en sık işi (miktar) ikinci seviyeye
 *     atıyor ve her satıra bir düğme ekliyor
 *   · toplu düzenleme kipi reddedildi — kip bu üründe şüpheli
 *
 * Yanlış satırı silmek yanlış satırı eklemekten kötü: silme geri alınabilir
 * ve pencere SATIRIN KENDİ YERİNDE duruyor, ekranın altında değil. Liste
 * zıplamıyor, geri alınan satır aynı yere dönüyor.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { Glyph } from './Glyph';
import {
    DELETE_MS, KIND_LABEL, KIND_NAME, money, secondsLeft, stepQty, type AdisyonLine,
} from '../lib/adisyon';
import { feedback } from '../lib/feedback';
import { upperTR } from '../lib/text';
import { numeric, useTheme } from '../theme';

/** Satır ve pencere AYNI yükseklikte: silme anında liste kıpırdamıyor. */
export const ROW_H = 64;
/** Açılan satırın kontrolleri — 44 pt tabanın üstünde. */
const CTL_H = 46;

/** Maskeli tutar: ekran müşterinin gözü önünde. */
function Price({ line, revealed }: { line: AdisyonLine; revealed: boolean }) {
    const { c } = useTheme();
    if (line.price == null) {
        return (
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.26, color: c.tx3, minWidth: 78, textAlign: 'right' }}>
                {upperTR('depodan düşer')}
            </Text>
        );
    }
    if (revealed) {
        return (
            <Text style={[{ fontSize: 15.5, fontWeight: '700', color: c.tx, minWidth: 78, textAlign: 'right' }, numeric]}>
                {money(line.price * line.qty)}
            </Text>
        );
    }
    return (
        <View style={{ flexDirection: 'row', gap: 5, minWidth: 78, justifyContent: 'flex-end' }}>
            {[0, 1, 2].map((index) => (
                <View key={index} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.tx3 }} />
            ))}
        </View>
    );
}

export function AdisyonRow({
    line, revealed, open, locked, onToggle, onQty, onRemove, onReveal,
}: {
    line: AdisyonLine;
    revealed: boolean;
    open: boolean;
    /** Kilitli adisyonda hiçbir düzenleme kontrolü ÇİZİLMİYOR — kısık değil, yok. */
    locked: boolean;
    onToggle: () => void;
    onQty: (next: number) => void;
    onRemove: () => void;
    onReveal: () => void;
}) {
    const { c } = useTheme();

    const head = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: ROW_H }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '600', letterSpacing: -0.23, color: c.tx }}>
                    {line.name}
                </Text>
                {/* Cümle harfi: üstteki grup başlığı zaten büyük harfle
                    aynı kelimeyi söylüyor. İkisi aynı sesle yazılınca satır
                    kendini tekrar ediyordu. */}
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.tx3 }}>
                    {KIND_NAME[line.kind]}
                </Text>
            </View>
            {line.qty > 1 ? (
                <Text style={[{ fontSize: 13.5, fontWeight: '700', color: c.tx2 }, numeric]}>×{line.qty}</Text>
            ) : null}
            <Price line={line} revealed={revealed} />
        </View>
    );

    return (
        <View style={{ borderBottomWidth: 1, borderBottomColor: c.bd }}>
            {locked ? (
                <View style={{ paddingVertical: 4 }}>{head}</View>
            ) : (
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${line.name}, ${KIND_LABEL[line.kind]}${line.qty > 1 ? `, ${line.qty} adet` : ''}`}
                    onPress={() => {
                        feedback.selection();
                        // Tutar maskesi satıra dokununca da açılıyor: iki ayrı
                        // sır gibi davranmasın.
                        if (line.price != null && !revealed) onReveal();
                        onToggle();
                    }}
                    style={({ pressed }) => ({ paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}
                >
                    {head}
                </Pressable>
            )}

            {/* Kontroller SÖNEREK geliyor; satırın yüksekliği kesme ile
                değişiyor. Yükseklik animasyonlanmıyor — sözleşme. */}
            {open && !locked ? (
                <Animated.View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 }}
                >
                    <Stepper
                        label="−"
                        on={stepQty(line.qty, -1) != null}
                        onPress={() => { const n = stepQty(line.qty, -1); if (n != null) onQty(n); }}
                    />
                    <View style={{
                        minWidth: 56, height: CTL_H, borderRadius: 14,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd,
                    }}>
                        <Text style={[{ fontSize: 16, fontWeight: '800', color: c.tx }, numeric]}>
                            {line.qty}
                        </Text>
                    </View>
                    <Stepper
                        label="+"
                        on={stepQty(line.qty, 1) != null}
                        onPress={() => { const n = stepQty(line.qty, 1); if (n != null) onQty(n); }}
                    />
                    <View style={{ flex: 1 }} />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${line.name} kalemini kaldır`}
                        onPress={() => { feedback.medium(); onRemove(); }}
                        style={({ pressed }) => ({
                            height: CTL_H, paddingHorizontal: 16, borderRadius: 14,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: 'rgba(224,114,114,0.12)',
                            borderWidth: 1, borderColor: 'rgba(224,114,114,0.34)',
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        {/* Kırmızı EYLEMİN üzerinde, sonucun üzerinde değil. */}
                        <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.rd }}>Kaldır</Text>
                    </Pressable>
                </Animated.View>
            ) : null}
        </View>
    );
}

function Stepper({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !on }}
            accessibilityLabel={label === '+' ? 'Bir artır' : 'Bir azalt'}
            onPress={on ? () => { feedback.selection(); onPress(); } : undefined}
            style={({ pressed }) => ({
                width: CTL_H, height: CTL_H, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd,
                opacity: !on ? 0.32 : pressed ? 0.7 : 1,
            })}
        >
            <Text style={{ fontSize: 20, fontWeight: '700', color: c.tx }}>{label}</Text>
        </Pressable>
    );
}

/**
 * Silme penceresi — satırın KENDİ YERİNDE, aynı yükseklikte.
 *
 * Fitil `scaleX` ile koşuyor (sözleşme içinde). `reduceMotion` açıkken fitil
 * duruyor ama BİLGİ DURMUYOR: "Geri al" düğmesinin içindeki saniye saymaya
 * devam ediyor, pencere hep okunabiliyor.
 */
export function DeleteWindow({ line, notice, startedAt, reduceMotion, onUndo }: {
    line: AdisyonLine;
    notice: { text: string; warn: boolean };
    startedAt: number;
    reduceMotion: boolean;
    onUndo: () => void;
}) {
    const { c } = useTheme();
    const fuse = useRef(new Animated.Value(1)).current;
    const [left, setLeft] = useState(() => secondsLeft(startedAt, Date.now()));

    useEffect(() => {
        if (reduceMotion) return undefined;
        fuse.setValue(1);
        Animated.timing(fuse, {
            toValue: 0,
            duration: Math.max(0, DELETE_MS - (Date.now() - startedAt)),
            easing: Easing.linear,
            useNativeDriver: true,
        }).start();
        return () => { fuse.stopAnimation(); };
    }, [fuse, reduceMotion, startedAt]);

    // Saniye HER HÂLDE sayıyor — hareket dursa da bilgi durmuyor.
    useEffect(() => {
        const id = setInterval(() => setLeft(secondsLeft(startedAt, Date.now())), 250);
        return () => clearInterval(id);
    }, [startedAt]);

    return (
        <View style={{ borderBottomWidth: 1, borderBottomColor: c.bd, overflow: 'hidden' }}>
            <View style={{
                minHeight: ROW_H, paddingVertical: 8,
                flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', color: c.tx2 }}>
                        <Text style={{ fontWeight: '700', color: c.tx }}>{line.name}</Text> kaldırıldı
                    </Text>
                    <Text numberOfLines={2} style={{
                        fontSize: 11.5, fontWeight: '600', lineHeight: 16,
                        color: notice.warn ? c.am : c.tx3,
                    }}>
                        {notice.text}
                    </Text>
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${line.name} kalemini geri al, ${left} saniye kaldı`}
                    onPress={() => { feedback.medium(); onUndo(); }}
                    style={({ pressed }) => ({
                        height: CTL_H, paddingHorizontal: 14, borderRadius: 14,
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd2,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Glyph name="undo" size={16} color={c.tx} />
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.tx }}>Geri al</Text>
                    <Text style={[{ fontSize: 13, fontWeight: '700', color: c.tx3 }, numeric]}>{left}</Text>
                </Pressable>
            </View>
            {/* Fitil: 2 pt, satırın altında. Genişlik değil ÖLÇEK animasyonu. */}
            {reduceMotion ? null : (
                <Animated.View style={{
                    height: 2, backgroundColor: c.am,
                    transform: [{ scaleX: fuse }],
                    // Sağdan değil SOLDAN kısalsın: okuma yönü.
                    alignSelf: 'stretch',
                }} />
            )}
        </View>
    );
}
