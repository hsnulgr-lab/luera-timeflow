import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi, type LockedDoor } from '../../src/api/session';
import { AuthActionButton, AuthRefreshIcon } from '../../src/components/ui';
import { GlassPlate } from '../../src/components/GlassPlate';
import { LightField } from '../../src/components/LightField';
import { LueraTimeflowMark } from '../../src/components/BrandMark';
import { lockedLead, subscriptionLocked as copy } from '../../src/lib/authCopy';
import { authMetrics, font, useTheme } from '../../src/theme';

/**
 * Apple Eşiği · C — erişim kapalı.
 *
 * Hata ekranı değil, KAPALI BİR KAPI. Ayrım tek işaretle söyleniyor: ekran
 * uygulamanın opak dilini bırakıp dışarının dilini — ışık alanı ve cam —
 * kullanıyor. Kullanıcı artık içeride değil. Durum rengi YOK: kırmızı, amber,
 * rozet yok. "Tekrar dene" de yok; kapının kapalı olması bir başarısızlık
 * değil. Yerine "Durumu yenile": sunucuya sorup açıldıysa içeri alıyor.
 *
 * Fiyat, plan, ödeme hiçbir hâlde geçmiyor (App Store 3.1.3(f)).
 *
 * ── Tasarımdan ALINMAYANLAR — veri yok, uydurulmadı ────────────────────────
 * • Personelde işletme sahibinin adı ve "ara" düğmesi: sahibin adını ya da
 *   numarasını veren bir uç yok. Çalışmayan düğme çizilmedi.
 * • ADRES HİÇ YAZILMIYOR (2026-09-24): bir adres göstermek, App Store
 *   3.1.3(f) muafiyetinin koşulunu ("uygulama dışında satın almaya çağrı
 *   olmaması") deliyordu. Yerine destek e-postası duruyor.
 * • Bitiş tarihi YALNIZ sunucu biliyorsa yazılıyor (`org_entitlement`).
 *
 * Veri canlı: `authApi.subscription.locked()` (bkz. `api/auth.ts` ·
 * lockedDoor). Kapının kime ait olduğu bilinmiyorsa karşılamaya dönülüyor.
 */
export default function SubscriptionLocked() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c } = useTheme();
    const [door, setDoor] = useState<LockedDoor | null>(null);
    const [busy, setBusy] = useState(false);
    const [checkedAt, setCheckedAt] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        authApi.subscription.locked().then((result) => {
            if (!alive) return;
            if (!result.ok) { router.replace('/(auth)/welcome'); return; }
            // Açılmışsa kapıda bekletmenin anlamı yok: kararı ilk ekran versin.
            if (result.data.open) { router.replace('/'); return; }
            setDoor(result.data);
        });
        return () => { alive = false; };
    }, [router]);

    // Bilgisayarda işini bitiren müdürün telefonu elinde — tek dokunuşla
    // içeri girmeli. Açıldıysa ilk ekran (`app/index.tsx`) nereye gidileceğine
    // karar veriyor; kapalıysa ne zaman bakıldığı yazılıyor.
    const refresh = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        const result = await authApi.subscription.locked();
        setBusy(false);
        if (result.ok && result.data.open) { router.replace('/'); return; }
        if (result.ok) setDoor(result.data);
        const now = new Date();
        setCheckedAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    }, [busy, router]);

    const signOut = useCallback(async () => {
        await authApi.resume.signOut();
        router.replace('/(auth)/welcome');
    }, [router]);

    if (!door) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const manager = door.actor === 'manager';

    return (
        <View style={{
            flex: 1,
            backgroundColor: c.bg,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom + authMetrics.actionsGap, authMetrics.noSafeAreaBottom),
        }}>
            {/* Sakin alan: kapalı kapı canlı bir vitrin değil. */}
            <LightField profile="lock" />

            <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 26, gap: 22 }}>
                <LueraTimeflowMark size={26} animate={false} />

                <View style={{ gap: 12, paddingTop: 18 }}>
                    <Text
                        accessibilityRole="header"
                        style={{
                            color: c.tx,
                            fontSize: 29,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: 29 * -0.03,
                            lineHeight: 29 * 1.12,
                        }}
                    >
                        {copy.title}
                    </Text>
                    <Text style={{
                        color: c.tx2,
                        fontSize: 16,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        lineHeight: 16 * 1.5,
                    }}>
                        {lockedLead(door.businessName, door.until)}
                        {' '}
                        {manager ? copy.manager.kept : copy.staff.kept}
                    </Text>
                </View>

                {manager ? (
                    <GlassPlate style={{ padding: 18, gap: 6 }}>
                        <Text style={{
                            color: c.tx3,
                            fontSize: 11.5,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: 11.5 * 0.08,
                        }}>
                            {copy.manager.cardLabel.toLocaleUpperCase('tr-TR')}
                        </Text>
                        <Text style={{
                            color: c.tx,
                            fontSize: 18,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                        }}>
                            {copy.manager.cardTitle}
                        </Text>
                        <Text style={{
                            color: c.tx2,
                            fontSize: 14.5,
                            fontFamily: font.medium,
                            fontWeight: '500',
                            lineHeight: 14.5 * 1.45,
                        }}>
                            {copy.manager.cardBody}
                        </Text>
                    </GlassPlate>
                ) : null}
            </View>

            <View style={{ paddingHorizontal: authMetrics.actionsX, gap: authMetrics.actionsGap }}>
                {checkedAt ? (
                    <Text
                        accessibilityLiveRegion="polite"
                        style={{
                            color: c.tx2,
                            textAlign: 'center',
                            fontSize: 13.5,
                            fontFamily: font.semiBold,
                            fontWeight: '600',
                        }}
                    >
                        {copy.stillClosed(checkedAt)}
                    </Text>
                ) : null}
                <AuthActionButton
                    kind="secondary"
                    label={copy.refresh}
                    disabled={busy}
                    onPress={refresh}
                    left={<AuthRefreshIcon color={c.tx} />}
                />
                <AuthActionButton kind="ghost" label={copy.signOut} onPress={signOut} />
            </View>
        </View>
    );
}
