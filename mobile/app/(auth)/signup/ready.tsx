import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { LueraTimeflowMark } from '../../../src/components/BrandMark';
import { authMetrics, font, glow, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';

/**
 * Solo kapısından gelenin listesi. Personel maddesi YOK: tek kişilik
 * işletmenin ekleyecek personeli yok; ekibe geçmek isterse yolu İşletme'de.
 */
const SOLO_READY_ITEMS = [
    'Hizmetlerinizi ekleyin',
    'Çalışma saatlerini girin',
] as const;

/**
 * Giriş 13 — kaydın son adımı.
 *
 * İki hâli var:
 *   • MOD SORUSU (Tek Kişilik v4 · S1): "Bu işletmede işi kim yapıyor?" Düzen
 *     kit'teki giriş çatallanması — marka, soru, gövde ve alt üçte birde iki
 *     eşit cevap. Biri turuncu değil: soru tarafsız. "Kurulumu bilgisayardan
 *     tamamla" hiç çıkmıyor; adım sayısı aynı.
 *   • SOLO KAPISINDAN GELİNDİYSE soru sorulmuyor (108): karşılamada verilmiş
 *     bir cevabı yeniden sormak, kullanıcının az önce bastığı düğmeyi duymamak
 *     olurdu. Onun yerine "hazır" ekranı ve tek düğme.
 *
 * Yalnız ben → tek kişilik kabuk. Ekibim var → müdür kabuğu.
 */
export default function SignupReady() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [businessName, setBusinessName] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    /**
     * Karşılamadaki "Solo" kapısından mı gelindi (108).
     *
     * `null` henüz okunmadı demek ve ekran o aralıkta hiçbir şey çizmiyor:
     * önce soruyu çizip sonra "hazır" ekranına atlamak, cevabı verilmiş
     * kişiye bir an için soruyu yeniden göstermek olurdu.
     */
    const [intentSolo, setIntentSolo] = useState<boolean | null>(null);

    useEffect(() => {
        let alive = true;
        authApi.resume.get().then(async (sessionResult) => {
            if (!alive) return;
            if (!sessionResult.ok) {
                router.replace('/(auth)/signup/account');
                return;
            }
            const draft = await authApi.signup.draft();
            if (!alive) return;
            setIntentSolo(draft.ok && draft.data.solo === true);
            setBusinessName(sessionResult.data.profile.business.name);
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

    if (!businessName || intentSolo === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    /** Ekranın alt payı — giriş paketinin kuralı: güvenli alan + boşluk. */
    const bottomPad = Math.max(insets.bottom + authMetrics.actionsGap, authMetrics.noSafeAreaBottom);

    const failure = failed ? (
        <AuthBanner style={{ marginTop: authMetrics.readyInfoTop }}>
            Cevabınız kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.
        </AuthBanner>
    ) : null;

    return (
        <View style={{
            flex: 1,
            paddingTop: insets.top,
            paddingBottom: bottomPad,
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

            {intentSolo ? (
                <>
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
                            body="Tek kişilik işletme olarak kuruluyor. Sonradan İşletme ekranından ekip ekleyebilirsiniz."
                        />
                        <AuthReadyChecklist items={SOLO_READY_ITEMS} />
                        {failure}
                        <View style={{ flex: 1 }} />
                    </ScrollView>

                    <View style={{ paddingHorizontal: authMetrics.actionsX }}>
                        <AuthActionButton
                            label="Uygulamayı kullanmaya başla"
                            disabled={busy}
                            onPress={() => { void answer(true); }}
                        />
                    </View>
                </>
            ) : (
                /* v4 · S1 — mod sorusu. Kaydırma yok: üç satır metin ve iki
                   düğme en küçük ekrana da sığıyor. */
                <View style={{
                    flex: 1,
                    paddingTop: authMetrics.modeTop,
                    paddingHorizontal: authMetrics.modeX,
                    // Düğmelerin altı ekranın kenarından tasarımın 44 pt'si:
                    // dış pay zaten verildi, kalanı burada.
                    paddingBottom: Math.max(authMetrics.modeBottom - bottomPad, 0),
                }}>
                    {/* v4 · K3 — "luera." değil "luera" + turuncu "timeflow"
                        etiketi: kişinin gördüğü ilk ekranla son kayıt
                        ekranı aynı markayı taşımalı. Gösteri yok, hap açık. */}
                    <LueraTimeflowMark size={authMetrics.modeMarkSize} animate={false} />
                    <Text
                        accessibilityRole="header"
                        style={{
                            marginTop: authMetrics.modeTitleTop,
                            color: c.tx,
                            fontSize: authMetrics.modeTitleSize,
                            lineHeight: authMetrics.modeTitleSize * authMetrics.modeTitleLine,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: authMetrics.modeTitleSize * authMetrics.modeTitleTrack,
                        }}
                    >
                        Bu işletmede işi kim yapıyor?
                    </Text>
                    <Text style={{
                        marginTop: authMetrics.modeBodyTop,
                        maxWidth: authMetrics.modeBodyWidth,
                        color: c.tx2,
                        fontSize: authMetrics.modeBodySize,
                        lineHeight: authMetrics.modeBodySize * authMetrics.modeBodyLine,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        Uygulama cevabınıza göre açılır. Sonradan İşletme’den değiştirebilirsiniz.
                    </Text>
                    {failure}

                    <View style={{ flex: 1 }} />

                    <View style={{ gap: authMetrics.modeChoiceGap }}>
                        <AuthActionButton
                            kind="tall"
                            label="Yalnız ben"
                            disabled={busy}
                            onPress={() => { void answer(true); }}
                        />
                        <AuthActionButton
                            kind="tall"
                            label="Ekibim var"
                            disabled={busy}
                            onPress={() => { void answer(false); }}
                        />
                    </View>
                </View>
            )}
        </View>
    );
}
