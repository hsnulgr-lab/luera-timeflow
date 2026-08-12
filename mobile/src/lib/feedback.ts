import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Haptic hiçbir zaman bir akışı veya navigasyonu bekletmemeli. iOS; Düşük Güç
// Modu, kamera/dikte kullanımı ya da Sistem Haptikleri kapalıyken bunu sessizce
// yok sayabilir. Görsel geri bildirim bu yüzden her zaman tek başına anlaşılır.
const fire = (effect: () => Promise<void>) => {
    if (Platform.OS === 'web') return;
    try {
        void effect().catch(() => undefined);
    } catch {
        // Donanım/native modül yoksa etkileşim yine çalışmaya devam eder.
    }
};

const android = (type: Haptics.AndroidHaptics, ios: () => Promise<void>) => {
    fire(() => Platform.OS === 'android'
        ? Haptics.performAndroidHapticsAsync(type)
        : ios());
};

export const feedback = {
    key: () => android(Haptics.AndroidHaptics.Keyboard_Tap, Haptics.selectionAsync),
    selection: () => android(Haptics.AndroidHaptics.Segment_Tick, Haptics.selectionAsync),
    light: () => android(
        Haptics.AndroidHaptics.Context_Click,
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    ),
    medium: () => android(
        Haptics.AndroidHaptics.Gesture_End,
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    ),
    toggle: (enabled: boolean) => android(
        enabled ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off,
        Haptics.selectionAsync,
    ),
    success: () => android(
        Haptics.AndroidHaptics.Confirm,
        () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
    warning: () => android(
        Haptics.AndroidHaptics.Context_Click,
        () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    ),
    error: () => android(
        Haptics.AndroidHaptics.Reject,
        () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    ),
};
