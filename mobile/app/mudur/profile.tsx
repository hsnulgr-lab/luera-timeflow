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
    MANAGER_NOTIFICATIONS_READY,
    NOTIFICATIONS,
    notificationsSummary,
    servicesSummary,
    themeLabel,
    todayCard,
    type NotificationKey,
} from '../../src/lib/managerProfile';
import { fetchNotificationPrefs } from '../../src/lib/managerSource';
import { prefsOf } from '../../src/lib/notificationPrefs';
import { readKvkkUrl } from '../../src/lib/legalSource';
import { useManagerRead } from '../../src/lib/managerRead';
import { fetchCustomerCount, fetchHoursRow, fetchServices } from '../../src/lib/managerSource';
import { salonServicesOf, schedulesOf } from '../../src/lib/settingsMap';
import { nowInMinutes } from '../../src/lib/calendar';
import { authApi } from '../../src/api/session';
import { activeTeamCodeExpiry, fetchTeamStatus } from '../../src/lib/teamAccess';
import { profileTeamLine, type TeamMember } from '../../src/lib/teamAccessView';
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
    const [notify, setNotify] = useState<Record<NotificationKey, boolean> | null>(null);
    const [kvkkUrl, setKvkkUrl] = useState<string | null>(null);
    /** 099 · Personel satırının canlı özeti. Okunamazsa satır özetsiz kalır. */
    const [team, setTeam] = useState<TeamMember[] | null>(null);
    /** Defterin büyüklüğü — yalnız SAYI iniyor, kayıtlar değil. */
    const [customers, setCustomers] = useState<number | null>(null);
    const [clock, setClock] = useState(() => Date.now());

    /*
     * Saatler ve hizmetler CANLI (8. adım). Okunamazsa özet satırı YAZILMAZ
     * ve bugün kartı çizilmez — yanlış bir saati göstermektense hiç
     * göstermemek. Odağa dönüşte kanca kendisi tazeliyor: alt ekranda
     * değiştirilen saat buraya da yansıyor.
     */
    const readSalon = useCallback(async () => {
        const [row, catalog] = await Promise.all([fetchHoursRow(), fetchServices()]);
        return {
            hours: row ? schedulesOf(row.raw) ?? [] : [],
            services: salonServicesOf(catalog),
        };
    }, []);
    const salon = useManagerRead(readSalon, { hours: [], services: [] },
        { poll: false, tables: ['settings', 'services'] });
    const { hours, services } = salon.data;

    const load = useCallback(() => {
        let alive = true;
        void Promise.all([
            authApi.account.get(),
            // Özet satırı GERÇEK tercihten (105). Okunamazsa satır özetsiz
            // kalıyor — "Kapalı" yazmak, bilmediğimizi bilgi gibi göstermekti.
            fetchNotificationPrefs().catch(() => null),
            readKvkkUrl(),
            fetchTeamStatus().catch(() => null),
            // Okunamazsa satır özetsiz kalıyor — kaynak hatayı yutmuyor.
            fetchCustomerCount().catch(() => null),
        ]).then(([account, notifications, url, members, customerCount]) => {
            if (!alive) return;
            setSession(account.ok ? account.data.session : null);
            setNotify(notifications
                ? prefsOf(notifications.raw, NOTIFICATIONS.map((item) => item.key))
                : null);
            setKvkkUrl(url);
            setTeam(Array.isArray(members) ? members : null);
            setCustomers(typeof customerCount === 'number' ? customerCount : null);
            setClock(Date.now());
        }).catch(() => { /* okunamazsa satırlar özet yazmaz */ });
        return () => { alive = false; };
    }, []);

    // Alt ekranlardan dönünce hesap özetleri tazelenir.
    useFocusEffect(load);

    const [nowMinutes, setNow] = useState(() => nowInMinutes());
    useEffect(() => {
        const timer = setInterval(() => setNow(nowInMinutes()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Kod açıkken satırın geri sayımı saniyede bir; kapalıyken sayaç yok.
    const codeExpiry = activeTeamCodeExpiry(clock);
    useEffect(() => {
        if (!codeExpiry) return undefined;
        const id = setInterval(() => setClock(Date.now()), 1000);
        return () => clearInterval(id);
    }, [codeExpiry]);
    const teamLine = profileTeamLine(team, codeExpiry ? Math.ceil((codeExpiry - clock) / 1000) : 0, clock);

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
                    {/* 099 · telefon bağla (ekip kodu) + şifre sıfırlama. */}
                    {/*
                      * MÜŞTERİLER buraya, Personel'in altına.
                      *
                      * Altıncı sekme açılmadı: iOS'ta beş sekme sınır ve
                      * altıncısı "Randevu"nun ortadaki eylem olma niteliğini
                      * bozardı. Bu grup zaten ayar değil, İŞLETMENİN
                      * KAYITLARI — saatler, hizmetler, personel. Müşteriler
                      * aynı cinsten.
                      */}
                    <ProfileRow
                        big
                        title="Personel"
                        // Tasarım §M2: tek canlı özet — kod açıksa süresi, yoksa
                        // kilitli/girmeyen sayısı. Kodun KENDİSİ yazılmaz.
                        sub={teamLine?.text ?? 'Telefon bağla · giriş durumu'}
                        subAccent={teamLine?.accent ?? false}
                        onPress={() => router.push('/(manager-flow)/profil/personel')}
                    />
                    <ProfileRow
                        big
                        title="Müşteriler"
                        // Okunamazsa özet YAZILMAZ: "0 kişi" diyen bir satır,
                        // okunamayan defteri boş defter gibi gösterirdi.
                        sub={customers === null ? undefined : `${customers} kişi`}
                        onPress={() => router.push('/(manager-flow)/musteriler')}
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
                        onPress={() => router.push('/(ortak)/profil/gorunum')}
                    />
                    {/* Müdüre bildirim yolu yok — satır gizli
                        (`MANAGER_NOTIFICATIONS_READY`). */}
                    {MANAGER_NOTIFICATIONS_READY ? (
                        <ProfileRow
                            title="Bildirimler"
                            value={notify ? notificationsSummary(notify) : undefined}
                            onPress={() => router.push('/(manager-flow)/profil/bildirimler')}
                        />
                    ) : null}
                    <ProfileRow
                        title="Yasal"
                        value={legalSummary(kvkkUrl)}
                        onPress={() => router.push('/(ortak)/profil/yasal')}
                    />
                </Group>
            </ScrollView>
        </View>
    );
}
