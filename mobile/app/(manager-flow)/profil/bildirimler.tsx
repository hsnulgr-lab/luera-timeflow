import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    Foot,
    Group,
    ProfileNav,
    SwitchRow,
} from '../../../src/components/ProfileParts';
import {
    MANAGER_NOTIFICATIONS_READY,
    NOTIFICATIONS,
    NOTIFICATION_FOOT,
    type NotificationKey,
} from '../../../src/lib/managerProfile';
import { readNotifications, setNotification } from '../../../src/lib/salonSettings';
import { profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür 27 · Bildirimler.
 *
 * Ayrı bir "bildirimleri kapat" ana anahtarı YOK: dördü de kapalıysa bildirim
 * gelmez, bu zaten aynı şey. İki yerden kapatılabilen bir şey, iki yerden
 * çelişebilir.
 */
export default function ManagerNotifications() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [state, setState] = useState<Record<NotificationKey, boolean> | null>(null);

    useEffect(() => {
        let alive = true;
        void readNotifications().then((value) => { if (alive) setState(value); });
        return () => { alive = false; };
    }, []);

    /*
     * Yol KAPALI: bu anahtarların arkasında bildirim yok. Satır profilde
     * gizli; bir bağlantıyla doğrudan gelinirse de ekran açılmıyor.
     */
    if (!MANAGER_NOTIFICATIONS_READY) return <Redirect href="/mudur/profile" />;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Bildirimler" onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingBottom: M.bottomInset,
                    gap: 10,
                }}
            >
                {state ? (
                    <>
                        <Group>
                            {NOTIFICATIONS.map((item, index) => (
                                <SwitchRow
                                    key={item.key}
                                    first={index === 0}
                                    title={item.label}
                                    value={state[item.key]}
                                    onToggle={() => {
                                        const next = !state[item.key];
                                        // İyimser değil: sonuç dönene kadar
                                        // eski değer durur, sahte onay olmaz.
                                        void setNotification(item.key, next).then((result) => {
                                            if (result.ok && result.value) setState(result.value);
                                        });
                                    }}
                                />
                            ))}
                        </Group>
                        <Foot>{NOTIFICATION_FOOT}</Foot>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}
