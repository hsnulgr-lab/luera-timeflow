import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { authApi } from '../../../src/api/session';
import { enterShell } from '../../../src/lib/enterShell';
import {
    AuthActionButton,
    AuthBanner,
    AuthHeader,
    AuthReadyChecklist,
    AuthStepIndicator,
} from '../../../src/components/ui';
import { authMetrics, glow, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';

const READY_ITEMS = [
    'Hizmetlerinizi ekleyin',
    'Personelinizi ekleyin',
    'Çalışma saatlerini girin',
] as const;

function DesktopIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.desktopIcon}
            height={authMetrics.desktopIcon}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M3.6 4.6h16.8v11.2H3.6zM8.6 19.4h6.8M12 15.8v3.6"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export default function SignupReady() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [businessName, setBusinessName] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        authApi.resume.get().then((sessionResult) => {
            if (!alive) return;
            if (!sessionResult.ok) {
                router.replace('/(auth)/signup/account');
                return;
            }
            setBusinessName(sessionResult.data.profile.business.name);
        });
        return () => { alive = false; };
    }, [router]);

    const startApp = () => {
        enterShell('manager');
    };

    const finishOnDesktop = () => {
        Alert.alert(
            'Bilgisayardan kurulum',
            'Bilgisayarda Luera’yı açıp aynı hesapla giriş yapın. Hizmetleri, fiyatları ve çalışma saatlerini oradan topluca ekleyebilirsiniz.',
        );
    };

    if (!businessName) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    return (
        <View style={{
            flex: 1,
            paddingTop: insets.top,
            paddingBottom: Math.max(
                insets.bottom + authMetrics.actionsGap,
                authMetrics.noSafeAreaBottom,
            ),
            backgroundColor: c.bg,
        }}>
            <LightField profile="form" />
            <Stack.Screen options={{ gestureEnabled: false }} />
            <LinearGradient
                pointerEvents="none"
                colors={dark ? glow.dark : glow.light}
                locations={glow.locations}
                style={[StyleSheet.absoluteFill, { height: glow.height + insets.top }]}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
                contentInsetAdjustmentBehavior="never"
            >
                <AuthStepIndicator step={3} />
                <AuthHeader
                    ready
                    title={`${businessName} hazır`}
                    body="Randevu almaya bugün başlayabilirsiniz. Üç şey eklendiğinde uygulama tam çalışır:"
                />
                <AuthReadyChecklist items={READY_ITEMS} />
                <AuthBanner style={{ marginTop: authMetrics.readyInfoTop }}>
                    Ayrıntılı kurulum bilgisayarda daha hızlı: hizmet listesini, fiyatları ve saatleri orada topluca girersiniz.
                </AuthBanner>
                <View style={{ flex: 1 }} />
            </ScrollView>

            <View style={{
                paddingHorizontal: authMetrics.actionsX,
                gap: authMetrics.actionsGap,
            }}>
                <AuthActionButton
                    label="Uygulamayı kullanmaya başla"
                    onPress={startApp}
                />
                <AuthActionButton
                    kind="secondary"
                    label="Kurulumu bilgisayardan tamamla"
                    left={<DesktopIcon color={c.tx} />}
                    onPress={finishOnDesktop}
                />
            </View>
        </View>
    );
}
