/**
 * Işık alanının katmanı — OS'a değil CİHAZ YAŞINA bakar.
 *
 * 2024 model bir Android beş kütleyi rahat çeviriyor, 2019 model bir telefon
 * zorlanıyor. Kararı markaya bağlamak, kullanıcıların yarısına sebepsiz yere
 * sönük bir ürün vermek olurdu.
 *
 * `deviceYearClass` bilinmiyorsa DÜŞÜK katman varsayılır: şüphede akıcılık
 * kazanır, gösteri değil.
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';

import { tierForYear, type FieldTier } from './lightField';

export function useFieldTier(): { tier: FieldTier; android: boolean } {
    return {
        tier: tierForYear(Device.deviceYearClass),
        android: Platform.OS === 'android',
    };
}
