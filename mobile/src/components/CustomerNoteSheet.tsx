import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { BottomSheet, SheetGrab } from './Sheet';
import { feedback } from '../lib/feedback';
import { saveCustomerNotes, type NoteOutcome } from '../lib/managerWrite';
import { font, onAccent, useTheme } from '../theme';

/**
 * Müdür 23 v2 · Not sayfası.
 *
 * Kayıt `customers.notes` — masaüstünün okuduğu alanın AYNISI, tek metin.
 * Kart paragrafları ayrı satır gösteriyor; sayfa ham metni açıp ham metni
 * yazıyor. Kaydedince onay mesajı YOK: kartta yeni notu görmek onayın
 * kendisi. Yazılamazsa sayfa açık kalır, metin kaybolmaz ve sebebi yazılır.
 */
export function CustomerNoteSheet({ visible, customerId, initial, onDismiss, onSaved }: {
    visible: boolean;
    customerId: string;
    initial: string;
    onDismiss: () => void;
    onSaved: () => void;
}) {
    const { c } = useTheme();
    const [text, setText] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<Exclude<NoteOutcome, { ok: true }>['kind'] | null>(null);

    // Her açılışta kayıttaki hâlden başla; önceki yarım yazı taşınmasın.
    // Efektte değil render sırasında: açılışın İLK karesi eski metni göstermesin.
    const [wasVisible, setWasVisible] = useState(visible);
    if (visible !== wasVisible) {
        setWasVisible(visible);
        if (visible) {
            setText(initial);
            setFailed(null);
        }
    }

    const changed = text.trim() !== initial.trim();

    const save = async () => {
        if (busy || !changed) return;
        setBusy(true);
        setFailed(null);
        const result = await saveCustomerNotes(customerId, text).catch(() => ({ ok: false, kind: 'failed' } as const));
        setBusy(false);
        if (!result.ok) {
            feedback.warning();
            setFailed(result.kind);
            return;
        }
        feedback.success();
        onSaved();
    };

    const failure = failed === 'paused'
        ? 'Yazma şu an kapalı. Not kaydedilmedi; metin burada duruyor.'
        : failed === 'stale'
            ? 'Bu müşteri kaydı artık yok. Not kaydedilmedi.'
            : failed
                ? 'Not kaydedilemedi. Metin burada duruyor — tekrar deneyin.'
                : null;

    return (
        <BottomSheet visible={visible} onDismiss={busy ? () => {} : onDismiss}>
            <SheetGrab />
            <View style={{ paddingHorizontal: 16, paddingBottom: 22, gap: 12 }}>
                <Text style={{
                    color: c.tx3, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800',
                    letterSpacing: 10.5 * 0.14,
                }}>
                    NOT
                </Text>
                <TextInput
                    value={text}
                    onChangeText={setText}
                    multiline
                    autoFocus
                    editable={!busy}
                    placeholder="Bu müşteri hakkında bilinmesi gereken"
                    placeholderTextColor={c.tx3}
                    accessibilityLabel="Müşteri notu"
                    style={{
                        minHeight: 120,
                        maxHeight: 260,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: failed ? c.rd : c.bd2,
                        backgroundColor: c.bg,
                        color: c.tx,
                        fontSize: 15,
                        fontFamily: font.medium,
                        lineHeight: 15 * 1.45,
                        textAlignVertical: 'top',
                    }}
                />
                {failure ? (
                    <Text accessibilityLiveRegion="polite" style={{
                        color: c.rd, fontSize: 13, fontFamily: font.semiBold, fontWeight: '600', lineHeight: 13 * 1.4,
                    }}>
                        {failure}
                    </Text>
                ) : null}
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Kaydet"
                    accessibilityState={{ disabled: busy || !changed }}
                    onPress={() => { void save(); }}
                    style={({ pressed }) => ({
                        height: 48,
                        borderRadius: 12,
                        backgroundColor: c.or,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: busy || !changed ? 0.45 : pressed ? 0.85 : 1,
                    })}
                >
                    <Text style={{ color: onAccent, fontSize: 15.5, fontFamily: font.extraBold, fontWeight: '800' }}>
                        {busy ? 'Kaydediliyor…' : 'Kaydet'}
                    </Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Vazgeç"
                    disabled={busy}
                    onPress={onDismiss}
                    style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Text style={{ color: c.tx2, fontSize: 15, fontFamily: font.bold, fontWeight: '700' }}>Vazgeç</Text>
                </Pressable>
            </View>
        </BottomSheet>
    );
}
