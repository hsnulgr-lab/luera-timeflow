import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBackBar,
    AuthBanner,
    AuthField,
    AuthHeader,
    AuthPage,
    AuthSentHero,
    AuthOfflineScreen,
    AuthStatusScreen,
} from '../../../src/components/ui';
import { EMAIL_RECOVERY_READY, recoveryUnavailable } from '../../../src/lib/authCopy';
import { authMetrics, useTheme } from '../../../src/theme';

type RecoverPhase = 'form' | 'sent';

function resendLabel(seconds: number): string {
    if (seconds <= 0) return 'Yeniden gönder';
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `Yeniden gönder · ${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export default function ManagerRecover() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c, small } = useTheme();
    const emailRef = useRef<TextInput>(null);
    const [ready, setReady] = useState(false);
    const [phase, setPhase] = useState<RecoverPhase>('form');
    const [email, setEmail] = useState('');
    const [sentEmail, setSentEmail] = useState('');
    const [resendAt, setResendAt] = useState(0);
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        let alive = true;
        authApi.manager.prefill().then((prefill) => {
            if (!alive) return;
            setEmail(prefill.email);
            setReady(true);
            requestAnimationFrame(() => emailRef.current?.focus());
        });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (phase !== 'sent') return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [phase]);

    const remaining = useMemo(
        () => Math.max(0, Math.ceil((resendAt - now) / 1000)),
        [now, resendAt],
    );

    const submit = async () => {
        if (!email || busy) return;
        setBusy(true);
        const result = await authApi.manager.recover(email);
        setBusy(false);
        if (!result.ok && result.error === 'offline') { setOffline(true); return; }
        if (!result.ok) return;
        setSentEmail(result.data.email);
        setResendAt(result.data.resendAvailableAt);
        setNow(Date.now());
        setPhase('sent');
    };

    const back = () => {
        if (phase === 'sent') {
            setPhase('form');
            requestAnimationFrame(() => emailRef.current?.focus());
            return;
        }
        // Geçmiş boşsa (bu ekrana `replace` ile gelinmiş olabilir) geri düğmesi
        // sessizce ölü kalmasın: karşılama ekranı her zaman var.
        if (router.canGoBack()) router.back();
        else router.replace('/(auth)/welcome');
    };

    /*
     * E-POSTA GİDEMİYOR — form hiç gösterilmiyor (2026-09-25).
     *
     * Sunucuda SMTP yok. Form bağlantıyı "gönderiyor", sonra "Bağlantıyı
     * gönderdik" diyordu; hiçbir e-posta gitmiyordu ve kişi bunu bilmeden
     * gelen kutusunu bekliyordu. Şimdi durumu söylüyor ve iki gerçek yol
     * veriyor. SMTP gelince `EMAIL_RECOVERY_READY` açılır, aşağıdaki akış
     * olduğu gibi geri gelir.
     */
    if (!EMAIL_RECOVERY_READY) {
        return (
            <AuthStatusScreen
                tone="amber"
                icon="lock"
                title={recoveryUnavailable.title}
                body={recoveryUnavailable.body}
            >
                <AuthActionButton
                    label={recoveryUnavailable.action}
                    // Posta uygulaması yoksa açılamaz; adres metinde yazılı.
                    onPress={() => { void Linking.openURL(recoveryUnavailable.mailto).catch(() => undefined); }}
                />
                <AuthActionButton label={recoveryUnavailable.back} kind="ghost" onPress={back} />
            </AuthStatusScreen>
        );
    }

    if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    if (phase === 'sent') {
        return (
            <AuthPage contentStyle={{ paddingBottom: Math.max(
                insets.bottom + authMetrics.actionsGap,
                authMetrics.noSafeAreaBottom,
            ) }}>
                <AuthBackBar onPress={back} />
                <AuthSentHero
                    email={sentEmail}
                    title="Bağlantıyı gönderdik"
                    questions={[
                        ['Gelen kutusunda yok mu?', 'Spam / önemsiz klasörüne de bakın'],
                        ['Adres yanlış mıydı?', 'Geri dönüp yeniden yazabilirsiniz'],
                    ]}
                />
                <View style={{
                    paddingHorizontal: authMetrics.actionsX,
                    gap: authMetrics.actionsGap,
                }}>
                    <AuthActionButton
                        label={resendLabel(remaining)}
                        kind="secondary"
                        disabled={busy || remaining > 0}
                        onPress={submit}
                    />
                    <AuthActionButton
                        label="Girişe dön"
                        kind="ghost"
                        onPress={() => router.replace('/(auth)/manager/sign-in')}
                    />
                </View>
            </AuthPage>
        );
    }

    if (offline) {
        return (
            <AuthOfflineScreen
                busy={busy}
                onRetry={() => { setOffline(false); requestAnimationFrame(submit); }}
            />
        );
    }

    return (
        <AuthPage contentStyle={{ paddingBottom: Math.max(insets.bottom, authMetrics.noSafeAreaBottom) }}>
            <AuthBackBar onPress={back} />
            <AuthHeader
                title="Şifrenizi yenileyelim"
                body="E-postanızı yazın, yeni şifre bağlantısını oraya gönderelim."
            />
            <View style={{
                paddingHorizontal: small ? authMetrics.smallFormX : authMetrics.formX,
                gap: small ? authMetrics.smallFormGap : authMetrics.formGap,
            }}>
                <AuthField
                    ref={emailRef}
                    label="E-posta"
                    icon="email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    autoComplete="email"
                    returnKeyType="go"
                    onSubmitEditing={submit}
                />
                <View style={{ marginTop: authMetrics.buttonTop }}>
                    <AuthActionButton
                        label="Bağlantıyı gönder"
                        onPress={submit}
                        disabled={busy || !email}
                    />
                </View>
            </View>
            <AuthBanner style={{ marginTop: authMetrics.recoverInfoTop }}>
                Bilgisayardan giriş yapabiliyorsanız şifrenizi orada da değiştirebilirsiniz.
            </AuthBanner>
            <View style={{ flex: 1 }} />
        </AuthPage>
    );
}
