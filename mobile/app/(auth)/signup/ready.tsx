import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function SignupReady() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [businessName, setBusinessName] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    /**
     * Karşılamadaki "Solo" kapısından gelindiyse mod SORULMUYOR (108).
     *
     * `null` henüz okunmadı demek; ekran o aralıkta hiçbir şey çizmiyor
     * (aşağıdaki `businessName` kapısı zaten bekletiyor). Verilmiş bir
     * cevabı yeniden sormak, kullanıcının az önce bastığı düğmeyi
     * duymamak olurdu.
     */
    const [intentSolo, setIntentSolo] = useState(false);

    useEffect(() => {
        let alive = true;
        authApi.resume.get().then((sessionResult) => {
            if (!alive) return;
            if (!sessionResult.ok) {
                router.replace('/(auth)/signup/account');
                return;
            }
            setBusinessName(sessionResult.data.profile.business.name);
            void authApi.signup.draft().then((draft) => {
                if (alive && draft.ok) setIntentSolo(draft.data.solo === true);
            });
        });
        return () => { alive = false; };
    }, [router]);

    /**
     * Cevap önce SUNUCUYA gidiyor, sonra kabuk açılıyor (108).
     *
     * Sıra tersine çevrilemez. "Yalnız ben" diyen kişi için sunucu iki şey
     * yapıyor: bayrağı yazmak ve sahibe bir personel satırı açmak. Yazma
     * tutmadan kabuğu açsaydık kullanıcı tek kişilik modda ama personelsiz
     * kalırdı — randevu bir personele bağlanmak zorunda, yani hiç randevu
     * kuramazdı.
     *
     * Red hâlinde HİÇBİR ŞEY değişmiyor: ekran yerinde duruyor, sebep
     * düğmelerin üstünde yazıyor ve iki cevap da yeniden denenebiliyor.
     */
    const answer = async (solo: boolean) => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        const result = await authApi.signup.mode(solo);
        if (!result.ok) {
            setBusy(false);
            setFailed(true);
            return;
        }
        enterShell(result.data.actor, result.data.profile.business.solo);
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
                    body={intentSolo
                        ? 'Tek kişilik işletme olarak kuruluyor. Sonradan İşletme ekranından ekip ekleyebilirsiniz.'
                        : 'Son bir soru: bu işletmede işi kim yapıyor? Uygulama cevabınıza göre açılır, sonradan değiştirebilirsiniz.'}
                />
                <AuthReadyChecklist items={READY_ITEMS} />
                {failed ? (
                    <AuthBanner style={{ marginTop: authMetrics.readyInfoTop }}>
                        Cevabınız kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.
                    </AuthBanner>
                ) : null}
                <View style={{ flex: 1 }} />
            </ScrollView>

            <View style={{
                paddingHorizontal: authMetrics.actionsX,
                gap: authMetrics.actionsGap,
            }}>
                {intentSolo ? (
                    <AuthActionButton
                        label="Uygulamayı kullanmaya başla"
                        disabled={busy}
                        onPress={() => { void answer(true); }}
                    />
                ) : (
                    <>
                        <AuthActionButton
                            label="Yalnız ben"
                            disabled={busy}
                            onPress={() => { void answer(true); }}
                        />
                        <AuthActionButton
                            kind="secondary"
                            label="Ekibim var"
                            disabled={busy}
                            onPress={() => { void answer(false); }}
                        />
                    </>
                )}
            </View>
        </View>
    );
}
