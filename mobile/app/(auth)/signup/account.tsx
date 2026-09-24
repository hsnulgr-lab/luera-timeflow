import { useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBackBar,
    AuthBanner,
    AuthField,
    AuthHeader,
    AuthPage,
    AuthPasswordRule,
    AuthStepIndicator,
    AuthOfflineScreen,
} from '../../../src/components/ui';
import { isValidEmail, passwordRuleState } from '../../../src/lib/authValidation';
import { authMetrics, font, useTheme } from '../../../src/theme';

export default function SignupAccount() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const passwordRef = useRef<TextInput>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [offline, setOffline] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const passwordRule = useMemo(() => passwordRuleState(password), [password]);
    const valid = isValidEmail(email) && passwordRule.valid;

    const submit = async () => {
        if (!valid || busy) return;
        setBusy(true);
        const result = await authApi.signup.account(email, password);
        setBusy(false);
        if (!result.ok && result.error === 'offline') { setOffline(true); return; }
        if (!result.ok) {
            /*
             * HATANIN SEBEBİ SÖYLENİYOR. Ekran eskiden HER başarısızlığa "bu
             * e-posta zaten kullanılıyor" diyordu: sunucu e-posta doğrulaması
             * istediğinde de, şifre reddedildiğinde de aynı cümle. Kişi
             * olmayan bir hesabı aramaya gidiyordu.
             */
            setError(
                result.error === 'email_confirmation_required'
                    // Doğrulama açıkken sunucu, zaten kayıtlı bir e-postayı da
                    // aynı biçimde cevaplıyor (hesap sızdırmamak için) —
                    // metin ikisini de kapsıyor.
                    ? 'E-postanıza bir doğrulama bağlantısı gönderdik. Bağlantıya dokunduktan sonra buradan giriş yapabilirsiniz.'
                    : result.error === 'email_in_use'
                        ? 'Bu e-posta zaten kullanılıyor. Bunun yerine giriş yapabilirsiniz.'
                        : result.error === 'locked'
                            ? 'Çok fazla deneme oldu. Birkaç dakika sonra tekrar deneyin.'
                            : 'Hesap açılamadı. Bilgileri kontrol edip yeniden deneyin.',
            );
            return;
        }
        router.push('/(auth)/signup/business');
    };

    if (offline) {
        return (
            <AuthOfflineScreen
                busy={busy}
                onRetry={() => { setOffline(false); requestAnimationFrame(submit); }}
            />
        );
    }

    return (
        <AuthPage>
            <AuthBackBar onPress={() => router.back()} />
            <AuthStepIndicator step={1} />
            <AuthHeader
                signup
                title="Hesabınızı açalım"
                body="Bu e-posta ve şifreyle bilgisayardan da girersiniz."
            />
            <View style={{
                paddingHorizontal: small ? authMetrics.smallFormX : authMetrics.formX,
                gap: small ? authMetrics.smallFormGap : authMetrics.formGap,
            }}>
                <AuthField
                    autoFocus
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
                <View style={{ gap: authMetrics.fieldGap }}>
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
                    <AuthPasswordRule
                        valid={passwordRule.valid}
                        message={passwordRule.message}
                    />
                </View>

                {valid ? (
                    <Text style={{
                        paddingHorizontal: authMetrics.termsX,
                        color: c.tx2,
                        fontSize: authMetrics.termsSize,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        lineHeight: authMetrics.termsSize * authMetrics.termsLine,
                    }}>
                        {/* ALTI ÇİZİLİ DEĞİL, DOKUNULABİLİR DEĞİL.
                            Metinler bağlantı gibi görünüyordu ama `onPress`
                            yoktu — dokunan herkes bozuk sanıyordu ve App Store
                            incelemesi ölü bağlantıyı reddeder. Luera'nın
                            yayımlanmış bir gizlilik politikası URL'si henüz
                            yok; URL geldiğinde bu iki metin `Linking.openURL`
                            ile bağlanacak ve altı çizili hâline dönecek. */}
                        Devam ederek Kullanım Koşulları ve Gizlilik Politikası’nı kabul ediyorsunuz.
                    </Text>
                ) : null}

                {error ? <AuthBanner kind="error" inset={false}>{error}</AuthBanner> : null}
                <View style={{ marginTop: authMetrics.buttonTop }}>
                    <AuthActionButton
                        label="Devam"
                        disabled={!valid || busy}
                        onPress={submit}
                    />
                </View>
            </View>
            <View style={{ flex: 1 }} />
            {valid ? (
                <AuthBanner style={{ marginBottom: Math.max(insets.bottom, authMetrics.noSafeAreaBottom) }}>
                    {/*
                      * "Abonelik daha sonra BİLGİSAYARDAN seçilir" yazıyordu ve bu,
                      * uygulama dışında satın almaya çağrıydı — 3.1.3(f)
                      * muafiyetinin koşulunu deliyordu. Kalan cümle güven
                      * veriyor ve hiçbir yere yönlendirmiyor.
                      */}
                    Şimdi ödeme yapmıyorsunuz. Uygulama içinden satın alma yoktur.
                </AuthBanner>
            ) : null}
        </AuthPage>
    );
}
