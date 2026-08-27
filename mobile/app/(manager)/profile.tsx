import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    Group,
    ProfileHead,
    ProfileRow,
    TodayCard,
} from '../../src/components/ProfileParts';
import {
    hoursSummary,
    legalSummary,
    notificationsSummary,
    servicesSummary,
    themeLabel,
    todayCard,
    type DaySchedule,
    type NotificationKey,
    type SalonService,
} from '../../src/lib/managerProfile';
import {
    readHours,
    readKvkkUrl,
    readNotifications,
    readServices,
} from '../../src/lib/salonSettings';
import { nowInMinutes } from '../../src/lib/calendar';
import { authApi } from '../../src/api/session';
import type { AuthSession } from '../../src/api/authStub';
import { profileMetrics as M, useTheme } from '../../src/theme';

/**
 * Müdür 27 — profil.
 *
 * Sıralamanın kuralı "değeri BUGÜN değişen şey önce": çalışma saati bir
 * cumartesi "18:00'de kapatıyoruz" denince değişir ve yanlış olduğunda para
 * kaybettirir. Fiyat ayda bir, tema bir kez, şifre yılda bir değişir.
 *
 * Bir kart + iki büyük satır + dört küçük satır: üç ağırlık, üç niyet.
 * On iki satırlık düz bir liste teknik olarak doğru, pratikte işe yaramaz.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 27 Profil.html`.
 */
export default function ManagerProfile() {
    const { c, themeMode } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [session, setSession] = useState<AuthSession | null>(null);
    const [hours, setHours] = useState<DaySchedule[]>([]);
    const [services, setServices] = useState<SalonService[]>([]);
    const [notify, setNotify] = useState<Record<NotificationKey, boolean> | null>(null);
    const [kvkkUrl, setKvkkUrl] = useState<string | null>(null);

    const load = useCallback(() => {
        let alive = true;
        void Promise.all([
            authApi.account.get(),
            readHours(),
            readServices(),
            readNotifications(),
            readKvkkUrl(),
        ]).then(([account, dayList, serviceList, notifications, url]) => {
            if (!alive) return;
            setSession(account.ok ? account.data.session : null);
            setHours(dayList);
            setServices(serviceList);
            setNotify(notifications);
            setKvkkUrl(url);
        }).catch(() => { /* okunamazsa satırlar özet yazmaz */ });
        return () => { alive = false; };
    }, []);

    // Alt ekranlardan dönünce özetler tazelenir; yoksa satır eski saati yazar.
    useFocusEffect(load);

    const [nowMinutes, setNow] = useState(() => nowInMinutes());
    useEffect(() => {
        const timer = setInterval(() => setNow(nowInMinutes()), 60_000);
        return () => clearInterval(timer);
    }, []);

    const profile = session?.profile ?? null;
    const business = profile?.business ?? null;
    // Haftanın günü: Pazartesi 0.
    const weekday = (new Date().getDay() + 6) % 7;
    const card = hours.length > 0 ? todayCard(hours, weekday, nowMinutes) : null;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingTop: insets.top + 12,
                    paddingHorizontal: M.padX,
                    paddingBottom: M.bottomInset,
                    gap: M.gap,
                }}
            >
                {business ? (
                    <ProfileHead
                        name={business.name}
                        sub={[business.location, business.sector].filter(Boolean).join(' · ')}
                    />
                ) : null}

                {/* Bugün kartı hem cümle hem kapı. Veri gelmeden çizilmez —
                    yanlış bir saat göstermektense hiç göstermemek. */}
                {card ? (
                    <TodayCard
                        card={card}
                        onPress={() => router.push('/(manager-flow)/profil/saatler')}
                    />
                ) : null}

                <Group>
                    <ProfileRow
                        first
                        big
                        title="Çalışma saatleri"
                        sub={hours.length > 0 ? hoursSummary(hours) : undefined}
                        onPress={() => router.push('/(manager-flow)/profil/saatler')}
                    />
                    <ProfileRow
                        big
                        title="Hizmetler ve fiyatlar"
                        sub={services.length > 0 ? servicesSummary(services) : undefined}
                        onPress={() => router.push('/(manager-flow)/profil/hizmetler')}
                    />
                </Group>

                <Group>
                    {/* Müdürün hesabına AÇILAN İLK YOL. */}
                    <ProfileRow
                        first
                        title="Hesap"
                        value={profile?.name}
                        onPress={() => router.push('/(staff-flow)/account')}
                    />
                    <ProfileRow
                        title="Görünüm"
                        value={themeLabel(themeMode)}
                        onPress={() => router.push('/(manager-flow)/profil/gorunum')}
                    />
                    <ProfileRow
                        title="Bildirimler"
                        value={notify ? notificationsSummary(notify) : undefined}
                        onPress={() => router.push('/(manager-flow)/profil/bildirimler')}
                    />
                    <ProfileRow
                        title="Yasal"
                        value={legalSummary(kvkkUrl)}
                        onPress={() => router.push('/(manager-flow)/profil/yasal')}
                    />
                </Group>
            </ScrollView>
        </View>
    );
}
