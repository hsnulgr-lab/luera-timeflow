import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBanner,
    AuthField,
    AuthPage,
    AuthPasswordRule,
} from '../../../src/components/ui';
import { ProfileNav } from '../../../src/components/ProfileParts';
import { passwordChange, passwordChangeProblem } from '../../../src/lib/authCopy';
import { passwordRuleState } from '../../../src/lib/authValidation';
import { feedback } from '../../../src/lib/feedback';
import { authMetrics, profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür · Profil › Hesap › Şifreyi değiştir — E-POSTASIZ (2026-09-25).
 *
 * Bu satır eskiden kurtarma ekranına gidiyordu: "e-postanıza bağlantı
 * gönderelim". Sunucuda SMTP yok, bağlantı hiç gitmiyordu ve ekran
 * "gönderdik" diyordu. App Store hakemini hesap silme için tam bu ekrana
 * yönlendiriyoruz; en çok dokunacağı satırlardan biri buydu.
 *
 * Oturumu açık kişinin kimliği biliniyor, e-postaya gerek yok. İki alan:
 * ŞU ANKİ şifre (açık kalmış telefonu eline alan başkası değiştiremesin —
 * personelin `sifre.tsx`iyle aynı ilke) ve yenisi. Kural kayıttakiyle aynı
 * (`passwordRuleState`), son söz sunucunun.
 *
 * Işık alanı YOK (`field={false}`): kişi içeride; ışık alanı "oturumun yok"
 * demek. Profil alt sayfalarının opak yüzeyi.
 */
const DONE_MS = 900;

export default function ManagerChangePassword() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { small } = useTheme();
    const nextRef = useRef<TextInput>(null);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const rule = passwordRuleState(next);
    const canSubmit = current.length > 0 && rule.valid && !busy && !done;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setProblem(null);
        const result = await authApi.account.changePassword(current, next);
        setBusy(false);
        if (result.ok) {
            feedback.success();
            setDone(true);
            setTimeout(() => router.back(), DONE_MS);
            return;
        }
        feedback.warning();
        setProblem(passwordChangeProblem(result.error));
        // Yanlış yazılan şifre alanda bırakılmıyor; yenisi korunuyor.
        if (result.error === 'invalid_credentials') setCurrent('');
    };

    return (
        <AuthPage
            field={false}
            contentStyle={{ paddingBottom: Math.max(insets.bottom, authMetrics.noSafeAreaBottom) }}
        >
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title={passwordChange.title} onBack={() => router.back()} />
            </View>
            <View style={{
                paddingTop: authMetrics.formGap,
                paddingHorizontal: small ? authMetrics.smallFormX : authMetrics.formX,
                gap: small ? authMetrics.smallFormGap : authMetrics.formGap,
            }}>
                <AuthField
                    label={passwordChange.current}
                    password
                    value={current}
                    onChangeText={(value) => { setCurrent(value); setProblem(null); }}
                    textContentType="password"
                    autoComplete="current-password"
                    returnKeyType="next"
                    onSubmitEditing={() => nextRef.current?.focus()}
                    autoFocus
                />
                <View style={{ gap: authMetrics.fieldGap }}>
                    <AuthField
                        ref={nextRef}
                        label={passwordChange.next}
                        password
                        success={rule.valid}
                        value={next}
                        onChangeText={(value) => { setNext(value); setProblem(null); }}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        passwordRules="minlength: 8; required: digit;"
                        returnKeyType="go"
                        onSubmitEditing={submit}
                    />
                    <AuthPasswordRule valid={rule.valid} message={rule.message} />
                </View>

                {problem ? <AuthBanner kind="error" inset={false}>{problem}</AuthBanner> : null}
                {done ? <AuthBanner inset={false}>{passwordChange.done}</AuthBanner> : null}

                <View style={{ marginTop: authMetrics.buttonTop }}>
                    <AuthActionButton
                        label={busy ? passwordChange.busy : passwordChange.action}
                        onPress={submit}
                        disabled={!canSubmit}
                    />
                </View>
            </View>
            <AuthBanner style={{ marginTop: authMetrics.recoverInfoTop }}>
                {passwordChange.note}
            </AuthBanner>
            <View style={{ flex: 1 }} />
        </AuthPage>
    );
}
