import { useCallback, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    Foot,
    Group,
    ProfileNav,
    ProfileRow,
    SwitchRow,
} from '../../../src/components/ProfileParts';
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import {
    MANAGER_NOTIFICATIONS_READY,
    NOTIFICATIONS,
    NOTIFICATION_FOOT,
    type NotificationKey,
} from '../../../src/lib/managerProfile';
import { prefsOf } from '../../../src/lib/notificationPrefs';
import { orgDurum } from '../../../src/lib/managerDurum';
import { settingsRefusal } from '../../../src/lib/settingsMap';
import { useManagerRead } from '../../../src/lib/managerRead';
import { fetchNotificationPrefs, forgetOrg, type PrefsRow } from '../../../src/lib/managerSource';
import { saveNotificationPref } from '../../../src/lib/managerWrite';
import { askPushPermission, readPushState, syncManagerPush } from '../../../src/lib/push';
import { isLive, opensSettings, permissionText, shouldAsk, type PushState } from '../../../src/lib/pushPermission';
import { authApi } from '../../../src/api/session';
import { profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür 27 · Bildirimler.
 *
 * ── Ekran 2026-09-23'e kadar KAPALIYDI ──────────────────────────────────────
 * Anahtarların arkasında hiçbir şey yoktu: yalnız telefonun belleğinde
 * duruyorlardı, uygulama kapanınca kayboluyorlardı ve hiçbir bildirimi
 * etkilemiyorlardı. Şimdi üçü de gerçek: tercih `settings.notification_prefs`
 * satırında (105), cihaz jetonu `push_subscriptions`ta (103), tetikleyici
 * müdür olaylarını geri gönderiyor (106).
 *
 * ── İki ayrı kapı, ikisi de görünür ─────────────────────────────────────────
 * İZİN (işletim sistemi) ve TERCİH (bizim anahtarlarımız) farklı şeyler.
 * Anahtar açıkken izin kapalıysa bildirim GELMEZ — ve ekran bunu söylemek
 * zorunda. Anahtarın tek başına "açık" demesi, ekranın söyleyebileceği en
 * sessiz yalan olurdu.
 *
 * Ayrı bir "hepsini kapat" ana anahtarı YOK: üçü de kapalıysa bildirim gelmez,
 * bu zaten aynı şey. İki yerden kapatılabilen bir şey, iki yerden çelişebilir.
 */
export default function ManagerNotifications() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [refused, setRefused] = useState<'stale' | 'paused' | 'failed' | null>(null);
    const [push, setPush] = useState<PushState>('error');

    const read = useCallback(() => fetchNotificationPrefs(), []);
    const snap = useManagerRead<PrefsRow | null>(read, null,
        { poll: false, tables: ['settings'] });

    /*
     * YAZILAN satır, okuma yetişene kadar. `from` yazmadan önceki damga:
     * sunucu yeni damgayı döndürdüğü an yerel kopya kendiliğinden düşüyor.
     * `saatler.tsx` ile aynı desen — müdür ikinci bir davranış öğrenmesin.
     */
    const [local, setLocal] = useState<{ row: PrefsRow; from: string | null } | null>(null);
    const row = local && snap.data && snap.data.stamp === local.from ? local.row : snap.data;
    const prefs = row ? prefsOf(row.raw, NOTIFICATIONS.map((item) => item.key)) : null;

    // İzin durumu odağa her dönüşte: kullanıcı telefon ayarlarından değiştirip
    // geri gelmiş olabilir.
    useFocusEffect(useCallback(() => {
        let alive = true;
        void readPushState().then((state) => { if (alive) setPush(state); });
        return () => { alive = false; };
    }, []));

    const onToggle = useCallback(async (key: NotificationKey, next: boolean) => {
        if (!row) return;
        const outcome = await saveNotificationPref(key, next, row).catch(() => null);
        if (!outcome) return;
        if (!outcome.ok) { setRefused(outcome.kind); return; }
        setLocal({ row: outcome.value, from: row.stamp });
        /*
         * İlk anahtar açılınca izin de istensin: müdür niyetini zaten söyledi.
         * iOS bu soruyu ömründe bir kez soruyor, o yüzden ancak gerçekten
         * sorulmamışken açılıyor.
         */
        if (next && shouldAsk(push)) {
            const state = await askPushPermission();
            setPush(state);
            if (state === 'granted') await syncManagerPush();
        }
    }, [row, push]);

    const onPushRow = useCallback(async () => {
        if (opensSettings(push)) { await Linking.openSettings().catch(() => undefined); return; }
        if (!shouldAsk(push)) return;
        const state = await askPushPermission();
        setPush(state);
        if (state === 'granted') await syncManagerPush();
    }, [push]);

    const onRefusalAction = useCallback(async () => {
        if (snap.refusal === 'ambiguous') {
            forgetOrg();
            router.push('/(auth)/manager/business');
            return;
        }
        await authApi.resume.signOut().catch(() => undefined);
        forgetOrg();
        router.replace('/(auth)/welcome');
    }, [snap.refusal, router]);

    // Yol kapalıysa ekran hiç açılmıyor — bir bağlantıyla doğrudan gelinse de.
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
                {snap.refusal ? (
                    <DurumBlock
                        tone={orgDurum(snap.refusal).tone}
                        title={orgDurum(snap.refusal).title}
                        lines={orgDurum(snap.refusal).lines}
                        actions={[{
                            label: orgDurum(snap.refusal).action.label,
                            onPress: () => { void onRefusalAction(); },
                        }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}

                {refused ? (
                    <DurumBlock
                        tone={settingsRefusal(refused).tone}
                        title={settingsRefusal(refused).title}
                        lines={[settingsRefusal(refused).line]}
                        actions={[{ label: 'Anladım', onPress: () => setRefused(null) }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}

                {/* Okunamayan tercih "hepsi kapalı" DEĞİL. Satır bulunamadıysa
                    (`null`) da aynı: anahtar uydurulmuyor. */}
                {!snap.refusal && prefs === null
                    && (snap.state === 'error' || (snap.state === 'ok' && snap.data === null)) ? (
                    <DurumUnread
                        what="Bildirim ayarlarını"
                        notMeaning="Bildirimlerin kapalı olduğu"
                        onRetry={() => { void snap.reload(); }}
                        style={{ paddingHorizontal: 0 }}
                    />
                ) : null}

                {prefs ? (
                    <>
                        <Group>
                            {NOTIFICATIONS.map((item, index) => (
                                <SwitchRow
                                    key={item.key}
                                    first={index === 0}
                                    title={item.label}
                                    value={prefs[item.key]}
                                    // İyimser DEĞİL: sonuç dönene kadar eski değer
                                    // durur, sahte onay olmaz.
                                    onToggle={() => { void onToggle(item.key, !prefs[item.key]); }}
                                />
                            ))}
                        </Group>
                        <Foot>{NOTIFICATION_FOOT}</Foot>

                        {/*
                          * İZİN — anahtarlardan AYRI bir grup, çünkü ayrı bir kapı.
                          * Açık anahtar + kapalı izin = hiçbir bildirim; bunu
                          * söylemeyen bir ekran yalan söylerdi.
                          */}
                        <Group head="TELEFON İZNİ">
                            <ProfileRow
                                first
                                title="Bu telefon"
                                value={permissionText(push)}
                                chevron={shouldAsk(push) || opensSettings(push)}
                                onPress={shouldAsk(push) || opensSettings(push)
                                    ? () => { void onPushRow(); }
                                    : undefined}
                            />
                        </Group>
                        {!isLive(push) ? (
                            <Foot>
                                Telefon izni olmadan yukarıdaki anahtarlar çalışmaz —
                                bildirim bu cihaza düşmez.
                            </Foot>
                        ) : null}
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}
