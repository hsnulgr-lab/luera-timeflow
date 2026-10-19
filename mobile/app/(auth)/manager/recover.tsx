import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Linking, TextInput, View } from 'react-native';
import { authApi } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthField,
    AuthOfflineScreen,
    AuthPage,
    AuthStatusScreen,
} from '../../../src/components/ui';
import {
    AuthBand,
    AuthOtp,
    AuthPhase,
    AuthResend,
    AuthV4Button,
    AuthV4Link,
    AuthV4Nav,
    AuthV4Note,
    AuthV4Rule,
    AuthV4Strong,
    AuthV4Title,
    type OtpState,
} from '../../../src/components/AuthSocial';
import {
    CODE_LIFETIME_MS,
    CODE_LOCK_MS,
    EMAIL_RECOVERY_READY,
    codeCopy,
    passwordChangeProblem,
    recoverCopy,
    recoveryUnavailable,
} from '../../../src/lib/authCopy';
import { passwordRuleState } from '../../../src/lib/authValidation';
import { continueManager } from '../../../src/lib/managerEntry';
import { ssoMetrics as S, useTheme } from '../../../src/theme';

type Retry = { kind: 'send' } | { kind: 'resend' } | { kind: 'verify'; value: string } | { kind: 'save' };

type RecoverPhase = 'form' | 'code' | 'password';

/**
 * Giriş v4 · S1–S3 — şifre: bağlantı yerine KOD.
 *
 * Akış: e-posta → 6 haneli kod → yeni şifre → doğrudan içeri (yeniden giriş
 * istenmiyor; karar 5: tek işletme → Face ID teklifi, çok → "Hangi işletme?").
 *
 * Metin "unuttuysanız" değil "belirleyin" diyor: Apple/Google ile açılmış
 * hesabın hiç şifresi olmayabilir ve bu yol ona İLK şifreyi verir.
 *
 * Sızdırmama (karar 7): her e-postaya aynı "kod gönderdik". "Hesabınız varsa"
 * cümlesi bunu kişiye açıklıyor: kod gelmezse neden gelmediğini bilir.
 *
 * Kabuk (geri) yerinde kalır, orta bölge aşamadan aşamaya yana kayar.
 */
export default function ManagerRecover() {
    const router = useRouter();
    const { c } = useTheme();
    const emailRef = useRef<TextInput>(null);
    const codeRef = useRef<TextInput>(null);
    const [ready, setReady] = useState(false);
    const [phase, setPhase] = useState<RecoverPhase>('form');
    const [back, setBack] = useState(false);
    const [email, setEmail] = useState('');
    const [sentEmail, setSentEmail] = useState('');
    const [busy, setBusy] = useState(false);
    // Bağlantı gelince neyin yeniden deneneceği — kapanış değil, ADI: durum
    // güncelleyicisine kendini çağıran bir işlev verilmesin.
    const [offline, setOffline] = useState<Retry | null>(null);
    // S2
    const [code, setCode] = useState('');
    const [codeState, setCodeState] = useState<'idle' | 'checking' | 'error'>('idle');
    const [sentAt, setSentAt] = useState(0);
    const [resendAt, setResendAt] = useState(0);
    const [lockUntil, setLockUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    // S3
    const [password, setPassword] = useState('');
    const [problem, setProblem] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        authApi.manager.prefill().then((prefill) => {
            if (!alive) return;
            // B1'de yazılan e-posta hazır gelir (S1).
            setEmail(prefill.email);
            setReady(true);
            if (!prefill.email) requestAnimationFrame(() => emailRef.current?.focus());
        });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (phase !== 'code') return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [phase]);

    const expired = phase === 'code' && sentAt > 0 && now - sentAt > CODE_LIFETIME_MS;
    const codeLocked = lockUntil > now;
    const otpState: OtpState = expired || codeLocked ? 'off' : codeState;

    const wasOff = useRef(false);
    useEffect(() => {
        if (wasOff.current && otpState === 'idle') requestAnimationFrame(() => codeRef.current?.focus());
        wasOff.current = otpState === 'off';
    }, [otpState]);

    const go = (next: RecoverPhase, backwards = false) => {
        setBack(backwards);
        setPhase(next);
    };

    const send = async () => {
        if (!email || busy) return;
        setBusy(true);
        const result = await authApi.manager.recover(email);
        setBusy(false);
        if (!result.ok && result.error === 'offline') { setOffline({ kind: 'send' }); return; }
        if (!result.ok) return;
        Keyboard.dismiss();
        setSentEmail(result.data.email);
        setSentAt(Date.now());
        setResendAt(result.data.resendAvailableAt);
        setNow(Date.now());
        setCode('');
        setCodeState('idle');
        go('code');
    };

    const resend = async () => {
        const result = await authApi.manager.recover(sentEmail);
        if (!result.ok) {
            if (result.error === 'offline') setOffline({ kind: 'resend' });
            return;
        }
        setCode('');
        setCodeState('idle');
        setSentAt(Date.now());
        setResendAt(result.data.resendAvailableAt);
        setNow(Date.now());
        requestAnimationFrame(() => codeRef.current?.focus());
    };

    const verify = async (value: string) => {
        setCodeState('checking');
        const result = await authApi.manager.verifyRecovery(sentEmail, value);
        if (result.ok) {
            setCodeState('idle');
            go('password');
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
        setCodeState('error');
    };

    const rule = passwordRuleState(password);

    const save = async () => {
        if (!rule.valid || busy) return;
        setBusy(true);
        setProblem(null);
        const result = await authApi.manager.setPassword(password);
        if (!result.ok) {
            setBusy(false);
            if (result.error === 'offline') { setOffline({ kind: 'save' }); return; }
            setProblem(passwordChangeProblem(result.error));
            return;
        }
        Keyboard.dismiss();
        // Yeniden giriş İSTENMİYOR: S3 sola çekilerek solar, ürün sağdan gelir.
        await continueManager(router, result.data.businesses, { offer: true });
        setBusy(false);
    };

    const leave = () => {
        if (phase === 'code' || phase === 'password') {
            go('form', true);
            requestAnimationFrame(() => emailRef.current?.focus());
            return;
        }
        // Geçmiş boşsa (bu ekrana `replace` ile gelinmiş olabilir) geri düğmesi
        // sessizce ölü kalmasın: karşılama ekranı her zaman var.
        if (router.canGoBack()) router.back();
        else router.replace('/(auth)/welcome');
    };

    /*
     * E-POSTA GİDEMİYORSA form hiç gösterilmiyor (2026-09-25'teki dürüst hâl).
     *
     * Sunucuda SMTP yokken form bağlantıyı "gönderiyor", sonra "Bağlantıyı
     * gönderdik" diyordu; hiçbir e-posta gitmiyordu. E-posta 2026-10-18'den
     * beri gidiyor ve bayrak açık; kesilirse bu ekran yine dürüst konuşur.
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
                <AuthActionButton label={recoveryUnavailable.back} kind="ghost" onPress={leave} />
            </AuthStatusScreen>
        );
    }

    const retry = (r: Retry) => {
        if (r.kind === 'send') void send();
        else if (r.kind === 'resend') void resend();
        else if (r.kind === 'verify') void verify(r.value);
        else void save();
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

    const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

    return (
        <AuthPage keyboard={phase !== 'form'}>
            <AuthV4Nav onBack={leave} />
            {phase === 'form' ? (
                <AuthPhase key="form" back={back}>
                    <AuthV4Title title={recoverCopy.title} body={recoverCopy.body} stagger={false} />
                    <View style={{ paddingHorizontal: S.formX, gap: S.formGap }}>
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
                            onSubmitEditing={send}
                        />
                        <AuthV4Button label={recoverCopy.send} busy={busy} disabled={!email} onPress={send} />
                        <AuthV4Note center>{recoverCopy.hint}</AuthV4Note>
                    </View>
                </AuthPhase>
            ) : phase === 'code' ? (
                <AuthPhase key="code" back={back}>
                    <AuthV4Title title={codeCopy.recoverTitle} stagger={false}>
                        <AuthV4Strong>{sentEmail}</AuthV4Strong>
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
                        <AuthV4Link label={codeCopy.change} onPress={leave} />
                    </View>
                </AuthPhase>
            ) : (
                <AuthPhase key="password">
                    <AuthV4Title title={recoverCopy.passwordTitle} body={recoverCopy.passwordBody} stagger={false} />
                    <View style={{ paddingHorizontal: S.formX, gap: S.formGap }}>
                        <AuthField
                            autoFocus
                            label={recoverCopy.passwordLabel}
                            password
                            success={rule.valid}
                            value={password}
                            onChangeText={(value) => { setPassword(value); setProblem(null); }}
                            textContentType="newPassword"
                            autoComplete="new-password"
                            passwordRules="minlength: 8; required: digit;"
                            returnKeyType="go"
                            onSubmitEditing={save}
                        />
                        <AuthV4Rule valid={rule.valid} />
                        {problem ? <AuthBand>{problem}</AuthBand> : null}
                        <AuthV4Button label={recoverCopy.save} busy={busy} disabled={!rule.valid} onPress={save} />
                    </View>
                </AuthPhase>
            )}
            <View style={{ flex: 1 }} />
        </AuthPage>
    );
}
