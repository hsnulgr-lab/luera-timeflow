/**
 * Klavyenin kapladığı yükseklik.
 *
 * Alt sayfalar `position: absolute; bottom: 0` ile duruyor ve klavye onların
 * üstüne biniyordu: katalog aramasında sonuç listesinin yarısı, serbest notta
 * kaydet düğmesi klavyenin altında kalıyordu. Telefonda görüldü.
 *
 * `KeyboardAvoidingView` bu yerleşime uymuyor — mutlak konumlu bir kabuğu
 * itmiyor, kendi çocuklarına dolgu veriyor. Reanimated'in `useAnimatedKeyboard`ı
 * da var ama bu ekranlar RN'in kendi `Animated`'iyle yazıldı ve taşınmıyorlar.
 * Kalan doğru yol, klavyenin kendi olaylarını dinlemek.
 *
 * `Will` olayları iOS'ta klavye HAREKET ETMEDEN önce geliyor, yani sayfa
 * klavyeyle birlikte kalkıyor — arkasından koşmuyor. Android'de `Will` yok,
 * `Did` kullanılıyor.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardInset(): number {
    const [inset, setInset] = useState(0);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const subs = [
            Keyboard.addListener(showEvent, (event) => {
                // `endCoordinates.height` klavyenin TAM yüksekliği: tahmin
                // satırı ve emoji çubuğu dahil. Sabit bir sayı yazmak, Türkçe
                // klavyenin tahmin satırı açıldığında yanlış olurdu.
                setInset(event.endCoordinates?.height ?? 0);
            }),
            Keyboard.addListener(hideEvent, () => setInset(0)),
        ];
        return () => { for (const sub of subs) sub.remove(); };
    }, []);

    return inset;
}
