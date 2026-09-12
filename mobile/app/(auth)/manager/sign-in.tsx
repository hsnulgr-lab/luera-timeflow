import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBackBar,
    AuthBanner,
    AuthField,
    AuthHeader,
    AuthOfflineScreen,
    AuthPage,
} from '../../../src/components/ui';
import { lockCountdownText, remainingAttemptText } from '../../../src/lib/authCopy';
import { authMetrics, useTheme } from '../../../src/theme';

interface LoginError {
    message: string;
    lockedUntil?: number;
}

/**
 * Giriş v3: **sarsıntı kalktı.**
 *
 * Hedef kitle 40–55 yaş; sarsılan bir alan onlar için "hata" değil
 * "arıza" gibi görünüyor. Yerine gelen: şifre alanının kenarı 160 ms'de
 * kırmızıya geçiyor (`GlassPlate error`) ve hata bandı `entering` ile
 * yüksekliğini açıyor. Bilgi aynı, ton farklı.
 *
 * Face ID'de sarsıntı DURUYOR — orada "tanımadım" demek gerekiyor ve
 * halka bir alan değil bir cevap.
 */
export default function ManagerSignIn() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c, small } = useTheme();
    const emailRef = useRef<TextInput>(null);
    const passwordRef = useRef<TextInput>(null);
    const [ready, setReady] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<LoginError | null>(null);
    // Çevrimdışı hâli forma AİT bir hata değil, formun ÖNÜNE geçen bir ekran.
    // Ayrı tutuluyor ki e-posta ve şifre state'i yerinde kalsın: bağlantı
    // gelince kullanıcı kaldığı yerden devam eder, baştan yazmaz.
    const [offline, setOffline] = useState(false);
    const [busy, setBusy] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
        let alive = true;
        authApi.manager.prefill().then((prefill) => {
            if (!alive) return;
            setEmail(prefill.email);
            setPassword(prefill.password);
            setReady(true);
            requestAnimationFrame(() => {
                if (prefill.email && prefill.password) passwordRef.current?.focus();
                else emailRef.current?.focus();
            });
        });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    useEffect(() => {
        if (!error?.lockedUntil) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [error?.lockedUntil]);

    const lockedSeconds = useMemo(() => error?.lockedUntil
        ? Math.max(0, (error.lockedUntil - now) / 1000)
        : 0, [error?.lockedUntil, now]);
    const locked = Boolean(error?.lockedUntil && lockedSeconds > 0);


    const submit = async () => {
        if (busy || locked || !email || !password) return;
        setBusy(true);
        const result = await authApi.manager.start(email, password);
        setBusy(false);

        if (!result.ok && result.error === 'offline') {
            setOffline(true);
            Keyboard.dismiss();
            return;
        }

        if (!result.ok) {
            // `?? 0` DEĞİL. Müdür yolunda kimliği doğrulayan katman kalan
            // deneme sayısı diye bir şey bildirmiyor; alan her zaman boş
            // geliyor. Sıfıra düşürmek ilk yanlış şifrede "0 denemeniz kaldı;
            // sonra hesap kapanır" yazdırıyordu — sayı da uydurmaydı, ardından
            // gelen tehdit de. Bilinmeyen sayı YAZILMIYOR.
            const remaining = result.remainingAttempts ?? null;
            setError({
                message: remainingAttemptText('manager', remaining),
                lockedUntil: result.lockedUntil,
            });
            return;
        }

        setError(null);
        const { businesses } = result.data;
        if (businesses.length === 1) {
            const selected = await authApi.manager.selectBusiness(businesses[0].id);
            if (!selected.ok && selected.error === 'subscription_inactive') {
                router.replace('/(auth)/locked');
                return;
            }
            if (selected.ok) router.push('/(auth)/biometric');
            return;
        }
        router.push('/(auth)/manager/business');
    };

    if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    if (offline) {
        return (
            <AuthOfflineScreen
                busy={busy}
                onRetry={() => { setOffline(false); requestAnimationFrame(submit); }}
            />
        );
    }

    return (
        <AuthPage
            keyboard={keyboardOpen}
            contentStyle={{ paddingBottom: Math.max(insets.bottom, authMetrics.noSafeAreaBottom) }}
        >
            <AuthBackBar onPress={() => router.back()} />
            <AuthHeader
                title="Hesabınıza girin"
                body="Bilgisayarda kullandığınız e-posta ve şifre."
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
                    onChangeText={(value) => { setEmail(value); setError(null); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    autoComplete="email"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    blurOnSubmit={false}
                />
                <View style={{ gap: authMetrics.formGap }}>
                    <AuthField
                        ref={passwordRef}
                        label="Şifre"
                        password
                        error={Boolean(error)}
                        value={password}
                        onChangeText={(value) => { setPassword(value); setError(null); }}
                        textContentType="password"
                        autoComplete="password"
                        returnKeyType="go"
                        onSubmitEditing={submit}
                    />
                    {error ? (
                        <AuthBanner kind="error" inset={false}>
                            {error.message}
                        </AuthBanner>
                    ) : null}
                </View>
                <View style={{ marginTop: authMetrics.buttonTop }}>
                    <AuthActionButton
                        label={locked ? lockCountdownText(lockedSeconds) : error ? 'Yeniden dene' : 'Gir'}
                        onPress={submit}
                        disabled={busy || locked || !email || !password}
                    />
                </View>
                {!(small && keyboardOpen) ? (
                    <AuthActionButton
                        label="Şifremi unuttum"
                        kind="ghost"
                        onPress={() => router.push('/(auth)/manager/recover')}
                    />
                ) : null}
            </View>
            <View style={{ flex: 1 }} />
            {error ? (
                <AuthBanner style={{ marginBottom: authMetrics.infoBottom }}>
                    Şifrenizi bilgisayardan da değiştirebilirsiniz. Değiştirdiğinizde ikisi birlikte değişir.
                </AuthBanner>
            ) : null}
        </AuthPage>
    );
}
