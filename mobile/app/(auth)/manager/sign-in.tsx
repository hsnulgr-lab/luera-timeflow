import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi, type SocialProvider } from '../../../src/api/session';
import { AuthField, AuthOfflineScreen, AuthPage } from '../../../src/components/ui';
import {
    AuthBand,
    AuthDim,
    AuthOrWait,
    AuthV4Button,
    AuthV4Foot,
    AuthV4Link,
    AuthV4Nav,
    AuthV4Title,
    SsoPair,
} from '../../../src/components/AuthSocial';
import {
    CODE_LOCK_MS,
    codeCopy,
    providerFailedText,
    providerWaitText,
    remainingAttemptText,
} from '../../../src/lib/authCopy';
import { continueManager } from '../../../src/lib/managerEntry';
import { ssoMetrics as S, useTheme } from '../../../src/theme';

type Retry = { kind: 'submit' } | { kind: 'social'; provider: SocialProvider };

interface LoginError {
    message: string;
    lockedUntil?: number;
}

/**
 * Giriş v4 · B1–B4 — "Hesabınıza girin".
 *
 * Apple ve Google formun ÜSTÜNDE (çoğu kişinin yolu tek dokunuş; e-posta
 * yazan zaten aşağı iner), sonra "ya da" ve e-posta formu. Bütün form tek
 * bir 14'lük ızgarada; ayraç ayrı boşluk istemiyor.
 *
 *   B2 — yazarken içerik, ayraç ekranın üstüne gelecek kadar kayar; Apple ve
 *        Google yukarıda kalır, klavye kapanınca geri gelir.
 *   B3 — hata: opak kırmızı bant şifrenin altında, kenar kırmızı. SARSINTI
 *        YOK (v3): 40–55 yaş için sarsılan alan "hata" değil "arıza" gibi.
 *   B4 — Apple/Google sürerken bekleme ayracın yerinde; form ve alt satır
 *        %42'ye iner. Sağlayıcı hatası düğmelerin ÜSTÜNDE, çünkü o düğmeyle
 *        ilgili. Pencereyi kişi kapattıysa bant yok, ses yok.
 *
 * Form soğuk açılışta BOŞ ve klavye kendiliğinden AÇILMIYOR: açılırsa Apple
 * ve Google ilk anda ekranın üstünden çıkardı.
 */
export default function ManagerSignIn() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const { c } = useTheme();
    const scrollRef = useRef<ScrollView>(null);
    const passwordRef = useRef<TextInput>(null);
    const [ready, setReady] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<LoginError | null>(null);
    // Çevrimdışı hâli forma AİT bir hata değil, formun ÖNÜNE geçen bir ekran.
    // Ayrı tutuluyor ki e-posta ve şifre state'i yerinde kalsın: bağlantı
    // gelince kullanıcı kaldığı yerden devam eder, baştan yazmaz.
    // Bağlantı gelince neyin yeniden deneneceği — kapanış değil, ADI: durum
    // güncelleyicisine kendini çağıran bir işlev verilmesin.
    const [offline, setOffline] = useState<Retry | null>(null);
    const [busy, setBusy] = useState(false);
    const [apple, setApple] = useState(false);
    const [waiting, setWaiting] = useState<SocialProvider | null>(null);
    const [providerError, setProviderError] = useState<SocialProvider | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [extraBottom, setExtraBottom] = useState(0);
    const layout = useRef({ pad: 0, divider: 0, content: 0 });

    useEffect(() => {
        let alive = true;
        Promise.all([authApi.manager.prefill(), authApi.social.available()]).then(([prefill, available]) => {
            if (!alive) return;
            setEmail(prefill.email);
            setPassword(prefill.password);
            setApple(available.apple);
            setReady(true);
        });
        return () => { alive = false; };
    }, []);

    /*
     * B2 — klavye açılınca içerik "ya da" ayracı güvenli alanın 28 pt altına
     * gelecek kadar kayar (Google'ın alt kenarı görünür kalır: kişi neyin
     * yukarıda kaldığını bilir). Kaydırmaya yetecek içerik yoksa altına o
     * kadar boşluk eklenir — kural küçük ekranda da aynı.
     */
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvent, (event) => {
            setKeyboardOpen(true);
            const { pad, divider, content } = layout.current;
            const target = Math.max(0, pad + divider - insets.top - S.keyboardDividerTop);
            const viewport = windowHeight - event.endCoordinates.height;
            const missing = Math.max(0, target + viewport - (content - extraBottom));
            setExtraBottom(missing);
            requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: target, animated: true }));
        });
        const hide = Keyboard.addListener(hideEvent, () => {
            setKeyboardOpen(false);
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            setExtraBottom(0);
        });
        return () => { show.remove(); hide.remove(); };
    }, [extraBottom, insets.top, windowHeight]);

    useEffect(() => {
        if (!error?.lockedUntil) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [error?.lockedUntil]);

    const locked = Boolean(error?.lockedUntil && error.lockedUntil > now);

    const submit = async () => {
        if (busy || waiting || locked || !email || !password) return;
        setBusy(true);
        setProviderError(null);
        const result = await authApi.manager.start(email, password);
        setBusy(false);

        if (!result.ok && result.error === 'offline') {
            setOffline({ kind: 'submit' });
            Keyboard.dismiss();
            return;
        }

        if (!result.ok) {
            // Giriş servisi istek sınırına takıldı: "hatalı" demek yanlış olurdu.
            // Süre sunucudan gelmiyor; düğme 60 sn kapalı, bant süre yazmıyor.
            if (result.error === 'locked') {
                setError({
                    message: codeCopy.locked,
                    lockedUntil: result.lockedUntil ?? Date.now() + CODE_LOCK_MS,
                });
                return;
            }
            // `?? 0` DEĞİL. Müdür yolunda kimliği doğrulayan katman kalan
            // deneme sayısı diye bir şey bildirmiyor; alan her zaman boş
            // geliyor. Bilinmeyen sayı YAZILMIYOR.
            const remaining = result.remainingAttempts ?? null;
            setError({
                message: remainingAttemptText('manager', remaining),
                lockedUntil: result.lockedUntil,
            });
            return;
        }

        setError(null);
        Keyboard.dismiss();
        await continueManager(router, result.data.businesses, { offer: true });
    };

    const social = async (provider: SocialProvider) => {
        if (busy || waiting) return;
        setProviderError(null);
        setError(null);
        Keyboard.dismiss();
        const result = await authApi.social.start(provider, () => setWaiting(provider));
        if (!result.ok) {
            setWaiting(null);
            if (result.error === 'cancelled') return;
            if (result.error === 'offline') { setOffline({ kind: 'social', provider }); return; }
            setProviderError(provider);
            return;
        }
        await continueManager(router, result.data.businesses, { offer: true });
        setWaiting(null);
    };

    const retry = (r: Retry) => {
        if (r.kind === 'submit') void submit();
        else void social(r.provider);
    };

    if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    if (offline) {
        return (
            <AuthOfflineScreen
                busy={busy}
                onRetry={() => { const r = offline; setOffline(null); requestAnimationFrame(() => retry(r)); }}
            />
        );
    }

    /*
     * Geri düğmesi GİDİLECEK YER OLDUĞUNDA geri gider.
     *
     * Bu ekrana `replace` ile de gelinebiliyor (açılış yönlendirmesi, salon
     * okunamayınca girişe düşme): o durumda geçmiş boş olur ve `back()`
     * hiçbir şey yapmadan "GO_BACK was not handled" uyarısı bırakır — yani
     * ekranda kapısı olmayan bir düğme durur. Karşılama ekranı her zaman var.
     */
    const leave = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/(auth)/welcome');
    };

    const dimmed = Boolean(waiting);

    return (
        <AuthPage
            keyboard={keyboardOpen}
            scrollRef={scrollRef}
            scrollProps={{
                onContentSizeChange: (_w, h) => { layout.current.content = h; },
            }}
            // Alt satırın payı kendi içinde (`.bot` 30 · 14); burada yalnız B2'nin
            // kaydırma boşluğu.
            contentStyle={{ paddingBottom: extraBottom }}
        >
            <AuthV4Nav onBack={leave} />
            <AuthV4Title title="Hesabınıza girin" body="Apple, Google ya da e-postanızla girin." />
            <View
                onLayout={(event) => { layout.current.pad = event.nativeEvent.layout.y; }}
                style={{ paddingHorizontal: S.formX, gap: S.formGap }}
            >
                {providerError ? <AuthBand>{providerFailedText(providerError)}</AuthBand> : null}
                <SsoPair
                    intent="login"
                    apple={apple}
                    locked={busy || dimmed}
                    onApple={() => { void social('apple'); }}
                    onGoogle={() => { void social('google'); }}
                />
                <View onLayout={(event) => { layout.current.divider = event.nativeEvent.layout.y; }}>
                    <AuthOrWait waiting={waiting ? providerWaitText(waiting, 'login') : null} />
                </View>
                <AuthDim dimmed={dimmed} stagger={3} style={{ gap: S.formGap }}>
                    <AuthField
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
                    {error ? <AuthBand>{error.message}</AuthBand> : null}
                    <AuthV4Button
                        // "Gir" değil "Giriş yap" (kullanıcı, 2026-10-19): Apple ve
                        // Google düğmeleriyle ve masaüstüyle aynı fiil.
                        label={error ? 'Tekrar dene' : 'Giriş yap'}
                        onPress={submit}
                        busy={busy}
                        disabled={locked || !email || !password}
                    />
                    <AuthV4Link
                        label="Şifremi unuttum"
                        onPress={() => {
                            // S1'e yazılmış e-posta hazır gelsin.
                            authApi.manager.remember(email);
                            router.push('/(auth)/manager/recover');
                        }}
                    />
                </AuthDim>
            </View>
            <View style={{ flex: 1 }} />
            <AuthDim dimmed={dimmed} stagger={3}>
                <AuthV4Foot
                    question="Hesabınız yok mu?"
                    action="Yeni işletme oluşturun"
                    onPress={() => {
                        // `dismissTo`: K1'in "Giriş yapın"ı da öyle — iki ekran
                        // arasında gidip gelmek yığını büyütmesin.
                        void authApi.signup.intent(false).then(() => {
                            router.dismissTo('/(auth)/signup/account');
                        });
                    }}
                />
            </AuthDim>
        </AuthPage>
    );
}
