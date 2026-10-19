import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { authApi, type SocialProvider } from '../../../src/api/session';
import {
    AuthField,
    AuthOfflineScreen,
    AuthPage,
    AuthStepIndicator,
} from '../../../src/components/ui';
import {
    AuthBand,
    AuthDim,
    AuthOrWait,
    AuthOtp,
    AuthPhase,
    AuthPrivacyLine,
    AuthResend,
    AuthV4Button,
    AuthV4Foot,
    AuthV4InlineLink,
    AuthV4Link,
    AuthV4Nav,
    AuthV4Note,
    AuthV4Rule,
    AuthV4Strong,
    AuthV4Title,
    SsoPair,
    type OtpState,
} from '../../../src/components/AuthSocial';
import {
    CODE_LIFETIME_MS,
    CODE_LOCK_MS,
    bridgeCopy,
    codeCopy,
    providerFailedText,
    providerWaitText,
} from '../../../src/lib/authCopy';
import { isValidEmail, passwordRuleState } from '../../../src/lib/authValidation';
import { continueManager } from '../../../src/lib/managerEntry';
import { ssoMetrics as S, useTheme } from '../../../src/theme';

type Retry = { kind: 'submit' } | { kind: 'social'; provider: SocialProvider } | { kind: 'verify'; value: string } | { kind: 'resend' };

type Phase = 'form' | 'code';

/**
 * Giriş v4 · K1 + K2 — "Hesabınızı açalım", adım 1/3.
 *
 * K1: bugünkü formun üstüne "Apple ile Kaydol" ve "Google ile kaydol" (B1
 * ile aynı düzen: kayıt ile giriş arasında geçince yalnız yazılar değişir,
 * gözün yeri değişmez). Alt satır "Zaten hesabınız var mı? Giriş yapın".
 *
 * K2: e-posta doğrulaması açıksa 6 haneli kod — adım 1'in ikinci hâli, çubuk
 * 1/3'te kalır; kabuk (geri + çubuk) yerinde, orta bölge yana kayar.
 * Otomatik onay açıkken (1.0.2'ye kadar) bu adım hiç görünmez.
 *
 * Kayıtta zaten kayıtlı bir e-posta (karar 2) ekrandan ASLA okunmaz: şifre
 * tutuyorsa kişi kendi hesabına girer ve içeride not görür; tutmuyorsa kod
 * ekranı açılır (kod gitmez) ve orada "Kod gelmediyse bu adresle zaten
 * hesabınız olabilir" satırı durur.
 *
 * Apple/Google ile kayıt: işletmesi YOKSA işletme açılır ve 2/3'e geçilir
 * (kod yok, ad sorulmaz — Apple ad vermese de); VARSA doğrudan içeri + K4
 * notu, birden çok işletmede önce "Hangi işletme?" (karar 4).
 *
 * Klavye kendiliğinden AÇILMIYOR: açılsaydı Apple ve Google ilk anda ekranın
 * üstünden çıkardı (v4 · K1 iki temada da klavyesiz çiziliyor).
 */
export default function SignupAccount() {
    const { c } = useTheme();
    const router = useRouter();
    const passwordRef = useRef<TextInput>(null);
    const codeRef = useRef<TextInput>(null);
    const [phase, setPhase] = useState<Phase>('form');
    const [back, setBack] = useState(false);
    const [ready, setReady] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    // Bağlantı gelince neyin yeniden deneneceği — kapanış değil, ADI: durum
    // güncelleyicisine kendini çağıran bir işlev verilmesin.
    const [offline, setOffline] = useState<Retry | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [apple, setApple] = useState(false);
    const [waiting, setWaiting] = useState<SocialProvider | null>(null);
    const [providerError, setProviderError] = useState<SocialProvider | null>(null);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    // K2
    const [code, setCode] = useState('');
    const [codeState, setCodeState] = useState<'idle' | 'checking' | 'error'>('idle');
    const [sentAt, setSentAt] = useState(0);
    const [resendAt, setResendAt] = useState(0);
    const [lockUntil, setLockUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    const passwordRule = useMemo(() => passwordRuleState(password), [password]);
    const valid = isValidEmail(email) && passwordRule.valid;

    useEffect(() => {
        let alive = true;
        Promise.all([authApi.signup.draft(), authApi.social.available()]).then(([draft, available]) => {
            if (!alive) return;
            setApple(available.apple);
            // Kod ekranında kapanıp açılan uygulama kod ekranına döner.
            if (draft.ok && draft.data.email && draft.data.codeSentAt) {
                setEmail(draft.data.email);
                setSentAt(draft.data.codeSentAt);
                setResendAt(draft.data.codeSentAt + CODE_LOCK_MS);
                setPhase('code');
            }
            setReady(true);
        });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    useEffect(() => {
        if (phase !== 'code') return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [phase]);

    const expired = phase === 'code' && sentAt > 0 && now - sentAt > CODE_LIFETIME_MS;
    const codeLocked = lockUntil > now;
    const otpState: OtpState = expired || codeLocked ? 'off' : codeState;

    // Kilit bitince kutular açılır ve klavye geri gelir.
    const wasOff = useRef(false);
    useEffect(() => {
        if (wasOff.current && otpState === 'idle') requestAnimationFrame(() => codeRef.current?.focus());
        wasOff.current = otpState === 'off';
    }, [otpState]);

    const toCode = (at: number) => {
        Keyboard.dismiss();
        setCode('');
        setCodeState('idle');
        setSentAt(at);
        setResendAt(at + CODE_LOCK_MS);
        setNow(Date.now());
        setBack(false);
        setPhase('code');
    };

    const submit = async () => {
        if (!valid || busy || waiting) return;
        setBusy(true);
        setProviderError(null);
        const result = await authApi.signup.account(email, password);
        setBusy(false);
        if (!result.ok && result.error === 'offline') { setOffline({ kind: 'submit' }); return; }
        if (!result.ok) {
            /*
             * HATANIN SEBEBİ SÖYLENİYOR. Ekran eskiden HER başarısızlığa "bu
             * e-posta zaten kullanılıyor" diyordu: sunucu e-posta doğrulaması
             * istediğinde de, şifre reddedildiğinde de aynı cümle. Kişi
             * olmayan bir hesabı aramaya gidiyordu. Kayıtlı e-posta artık bir
             * hata DEĞİL (karar 2) — o yol aşağıda `existing` / `code`.
             */
            setError(result.error === 'locked'
                ? codeCopy.locked
                : 'Hesap açılamadı. Bilgileri kontrol edip yeniden deneyin.');
            return;
        }
        if (result.data.next === 'existing') {
            Keyboard.dismiss();
            await continueManager(router, result.data.businesses ?? [], { offer: false, notice: 'email' });
            return;
        }
        if (result.data.next === 'code') {
            toCode(Date.now());
            return;
        }
        router.push('/(auth)/signup/business');
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
        if (result.data.businesses.length > 0) {
            // K4 — yanlış kapıdan girdi ama bir şey kaybetmedi.
            await continueManager(router, result.data.businesses, { offer: false, notice: 'social' });
            setWaiting(null);
            return;
        }
        const created = await authApi.social.createBusiness();
        setWaiting(null);
        if (!created.ok) {
            setError(bridgeCopy.failed);
            return;
        }
        router.push('/(auth)/signup/business');
    };

    const verify = async (value: string) => {
        setCodeState('checking');
        const result = await authApi.signup.verify(value);
        if (result.ok) {
            setCodeState('idle');
            setCode('');
            router.push('/(auth)/signup/business');
            return;
        }
        if (result.error === 'offline') {
            setCodeState('idle');
            setOffline({ kind: 'verify', value });
            return;
        }
        if (result.error === 'locked') {
            setCode('');
            setCodeState('idle');
            setLockUntil(Date.now() + CODE_LOCK_MS);
            setNow(Date.now());
            return;
        }
        // Rakamlar KALIYOR — kişi e-postayla karşılaştırabilsin; ilk tuş siler.
        setCodeState('error');
    };

    const resend = async () => {
        const result = await authApi.signup.resend();
        if (!result.ok) {
            if (result.error === 'offline') setOffline({ kind: 'resend' });
            return;
        }
        setCode('');
        setCodeState('idle');
        setSentAt(result.data.sentAt);
        setResendAt(result.data.resendAvailableAt);
        setNow(Date.now());
        requestAnimationFrame(() => codeRef.current?.focus());
    };

    const changeEmail = () => {
        Keyboard.dismiss();
        setBack(true);
        setPhase('form');
        setCode('');
        setCodeState('idle');
    };

    const goBack = () => {
        if (phase === 'code') { changeEmail(); return; }
        router.back();
    };

    const retry = (r: Retry) => {
        if (r.kind === 'submit') void submit();
        else if (r.kind === 'social') void social(r.provider);
        else if (r.kind === 'verify') void verify(r.value);
        else void resend();
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

    const dimmed = Boolean(waiting);
    const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

    return (
        <AuthPage keyboard={keyboardOpen || phase === 'code'}>
            <AuthV4Nav onBack={goBack} />
            <AuthStepIndicator step={1} />
            {phase === 'form' ? (
                <AuthPhase key="form" back={back} style={{ flex: 1 }}>
                    <AuthV4Title
                        title="Hesabınızı açalım"
                        body="Apple, Google ya da e-postayla açın. Bilgisayardan da aynı yolla girersiniz."
                    />
                    <View style={{ paddingHorizontal: S.formX, gap: S.formGap }}>
                        {providerError ? <AuthBand>{providerFailedText(providerError)}</AuthBand> : null}
                        <SsoPair
                            intent="signup"
                            apple={apple}
                            locked={busy || dimmed}
                            onApple={() => { void social('apple'); }}
                            onGoogle={() => { void social('google'); }}
                        />
                        <AuthOrWait waiting={waiting ? providerWaitText(waiting, 'signup') : null} />
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
                                success={passwordRule.valid}
                                value={password}
                                onChangeText={(value) => { setPassword(value); setError(null); }}
                                textContentType="newPassword"
                                autoComplete="new-password"
                                passwordRules="minlength: 8; required: digit;"
                                returnKeyType="go"
                                onSubmitEditing={submit}
                            />
                            <AuthV4Rule valid={passwordRule.valid} />
                            <AuthPrivacyLine />
                            {error ? <AuthBand>{error}</AuthBand> : null}
                            <AuthV4Button
                                label="Devam"
                                busy={busy}
                                disabled={!valid || busy}
                                onPress={submit}
                            />
                            {/*
                              * "Abonelik daha sonra BİLGİSAYARDAN seçilir" yazıyordu ve bu,
                              * uygulama dışında satın almaya çağrıydı — 3.1.3(f)
                              * muafiyetinin koşulunu deliyordu. Kalan cümle güven
                              * veriyor ve hiçbir yere yönlendirmiyor. v4'te boş formda
                              * çizilmiyor (K1 alt satırı bağlantı); form dolunca
                              * Devam'ın altında, bugünkü gibi.
                              */}
                            {valid ? (
                                <AuthV4Note center>
                                    Şimdi ödeme yapmıyorsunuz. Uygulama içinden satın alma yoktur.
                                </AuthV4Note>
                            ) : null}
                        </AuthDim>
                    </View>
                    <View style={{ flex: 1 }} />
                    <AuthDim dimmed={dimmed} stagger={3}>
                        <AuthV4Foot
                            question="Zaten hesabınız var mı?"
                            action="Giriş yapın"
                            onPress={() => router.dismissTo('/(auth)/manager/sign-in')}
                        />
                    </AuthDim>
                </AuthPhase>
            ) : (
                <AuthPhase key="code" style={{ flex: 1 }}>
                    <AuthV4Title title={codeCopy.signupTitle} stagger={false}>
                        <AuthV4Strong>{email}</AuthV4Strong>
                        {codeCopy.sentLead}
                    </AuthV4Title>
                    <View style={{ paddingHorizontal: S.formX, gap: S.formGap }}>
                        <AuthOtp
                            ref={codeRef}
                            value={code}
                            state={otpState}
                            onChange={(next) => {
                                setCode(next);
                                if (codeState === 'error') setCodeState('idle');
                            }}
                            onComplete={(value) => { void verify(value); }}
                        />
                        {codeLocked ? (
                            <AuthBand kind="warn">{codeCopy.locked}</AuthBand>
                        ) : expired ? (
                            <AuthBand kind="warn">{codeCopy.expired}</AuthBand>
                        ) : codeState === 'error' ? (
                            <AuthBand>{codeCopy.wrong}</AuthBand>
                        ) : null}
                        {codeLocked ? null : expired ? (
                            <AuthV4Button label={codeCopy.newCode} onPress={() => { void resend(); }} />
                        ) : (
                            <AuthResend seconds={resendSeconds} onPress={() => { void resend(); }} />
                        )}
                        <AuthV4Link label={codeCopy.change} onPress={changeEmail} />
                        {/* Karar 2 — her zaman: hesap varsa kod gitmemiş olabilir. */}
                        <AuthV4Note center>
                            {codeCopy.maybeAccount}{' '}
                            <AuthV4InlineLink
                                label={codeCopy.signIn}
                                onPress={() => router.dismissTo('/(auth)/manager/sign-in')}
                            />
                            {' · '}
                            <AuthV4InlineLink
                                label={codeCopy.forgot}
                                onPress={() => {
                                    authApi.manager.remember(email);
                                    router.push('/(auth)/manager/recover');
                                }}
                            />
                        </AuthV4Note>
                    </View>
                    <View style={{ flex: 1 }} />
                </AuthPhase>
            )}
        </AuthPage>
    );
}
