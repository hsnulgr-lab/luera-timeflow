import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    authApi,
    type AuthBusiness,
    type StaffRosterMember,
} from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBanner,
    AuthIdentityBar,
    AuthKeypad,
    AuthPinDots,
    AuthOfflineScreen,
    AuthTextLink,
} from '../../../src/components/ui';
import { lockCountdownText, remainingAttemptText } from '../../../src/lib/authCopy';
import { pinProblem } from '../../../src/lib/pinRules';
import { feedback } from '../../../src/lib/feedback';
import { authMetrics, authMotion, font, radius, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';

interface PendingIdentity {
    business: AuthBusiness;
    member: StaffRosterMember;
}

/**
 * Şifre ekranının üç hâli (099).
 *
 *   enter   · şifresi olan personel girer
 *   create  · şifresi olmayan personel İLK şifresini yazar (müdür kararı:
 *             şifreyi personel kendisi belirler)
 *   confirm · aynı şifreyi ikinci kez — yazım hatasıyla kendini kilitlemesin
 */
type PinMode = 'enter' | 'create' | 'confirm';

const PIN_TITLE: Record<PinMode, string> = {
    enter: 'Şifrenizi girin',
    create: 'Şifrenizi belirleyin',
    confirm: 'Şifrenizi tekrar girin',
};

export default function StaffPin() {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [identity, setIdentity] = useState<PendingIdentity | null>(null);
    const [mode, setMode] = useState<PinMode>('enter');
    /** İlk yazılan şifre — yalnız `confirm` hâlinde dolu, ekrandan hiç okunmaz. */
    const firstPin = useRef('');
    /** Hata değil, bilgi: "şifreniz sıfırlanmış" gibi. Kırmızı çizilmez. */
    const [notice, setNotice] = useState<string | null>(null);
    const [pin, setPin] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [offline, setOffline] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [lockedUntil, setLockedUntil] = useState<number | undefined>();
    const [now, setNow] = useState(Date.now());
    const verifyingRef = useRef(false);
    const shake = useRef(new Animated.Value(0)).current;
    const reveal = useRef(new Animated.Value(0)).current;
    const complete = pin.length === 4;

    useEffect(() => {
        let alive = true;
        authApi.staff.pending().then((result) => {
            if (!alive) return;
            if (!result.ok) {
                router.replace(result.error === 'not_paired'
                    ? '/(auth)/staff/pair'
                    : '/(auth)/staff/who');
                return;
            }
            setIdentity(result.data);
            if (result.data.member.hasPin === false) setMode('create');
        });
        return () => { alive = false; };
    }, [router]);

    // Açılış doğrudan buraya yönlendirdiyse geri gidilecek ekran yok.
    const notMe = () => { router.replace('/(auth)/staff/who'); };
    const leave = () => {
        if (router.canGoBack()) router.back();
        else notMe();
    };

    const startOver = (message: string | null) => {
        firstPin.current = '';
        setMode('create');
        setPin('');
        setErrorMessage(message);
    };

    /** İlk şifre: iki kez yazıldı ve aynı → sunucuya. */
    const createPin = async (nextPin: string) => {
        if (verifyingRef.current) return;
        verifyingRef.current = true;
        setVerifying(true);
        const result = await authApi.staff.setupPin(nextPin);
        verifyingRef.current = false;
        setVerifying(false);

        if (result.ok) {
            router.replace('/(auth)/biometric');
            return;
        }
        if (result.error === 'offline') { setOffline(true); setPin(''); setMode('confirm'); return; }
        if (result.error === 'subscription_inactive') { router.replace('/(auth)/locked'); return; }
        if (result.error === 'not_paired') { router.replace('/(auth)/staff/pair'); return; }
        if (result.error === 'staff_not_found' || result.error === 'invalid_credentials') { notMe(); return; }
        // Başka bir telefon bu kişi için az önce şifre belirledi. Yarışı
        // kaybeden ekran GİRİŞE döner: şifreyi bilen kendisiyse girer.
        if (result.error === 'pin_already_set') {
            firstPin.current = '';
            setMode('enter');
            setPin('');
            setErrorMessage(null);
            setNotice('Bu kişi için şifre az önce belirlendi. Şifreyi biliyorsanız girin; bilmiyorsanız müdürden sıfırlamasını isteyin.');
            return;
        }
        feedback.warning();
        runPinErrorShake(shake, reduceMotion);
        startOver(result.error === 'weak_pin'
            ? 'Bu şifre çok kolay tahmin edilir. Başka bir şifre seçin.'
            : 'Şifre kaydedilemedi. Baştan belirleyin.');
    };

    useEffect(() => {
        if (!lockedUntil) return;
        const tick = () => {
            const next = Date.now();
            setNow(next);
            if (next >= lockedUntil) {
                setLockedUntil(undefined);
                setErrorMessage(null);
                setPin('');
            }
        };
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [lockedUntil]);

    useEffect(() => {
        if (!errorMessage) {
            reveal.setValue(0);
            return;
        }
        revealPinError(reveal, reduceMotion);
    }, [errorMessage, reduceMotion, reveal]);

    const verify = async (nextPin: string) => {
        if (verifyingRef.current) return;
        verifyingRef.current = true;
        setVerifying(true);
        const result = await authApi.staff.start(nextPin);
        verifyingRef.current = false;
        setVerifying(false);

        if (result.ok) {
            router.replace('/(auth)/biometric');
            return;
        }
        // Çevrimdışı bir "yanlış PIN" değil: sayaç artmaz, nokta kızarmaz.
        // Aksi hâlde metroda uygulamayı açan personel kendini kilitlerdi.
        if (result.error === 'offline') {
            setOffline(true);
            setPin('');
            return;
        }
        // Abonelik bitmişse PIN doğruydu: sayaç artmaz, sarsıntı olmaz.
        if (result.error === 'subscription_inactive') {
            router.replace('/(auth)/locked');
            return;
        }
        if (result.error === 'not_paired' || result.error === 'staff_not_found') {
            router.replace(result.error === 'not_paired'
                ? '/(auth)/staff/pair'
                : '/(auth)/staff/who');
            return;
        }
        // Müdür şifreyi sıfırladı (099): yanlış şifre DEĞİL — yenisi belirlenir.
        if (result.error === 'pin_not_set') {
            startOver(null);
            setNotice('Şifreniz sıfırlanmış. Yeni şifrenizi belirleyin.');
            return;
        }

        feedback.warning();
        runPinErrorShake(shake, reduceMotion);
        if (result.error === 'locked' && result.lockedUntil) {
            setLockedUntil(result.lockedUntil);
            setNow(Date.now());
            setErrorMessage('Bu telefon 15 dakika kilitlendi. İşletme sahibinden yardım isteyin.');
            return;
        }
        // Personel yolunda sayı GERÇEK: yanlış PIN'de kalan hak bildiriliyor
        // ve kimlik katmanı onu buraya taşıyor. Ama gelmediği durum da var
        // (beklenmeyen bir hata kodu) ve o zaman sıfır yazmak "son hakkınız"
        // demek olurdu. Bilinmeyen sayı YAZILMIYOR.
        const remainingAttempts = result.remainingAttempts ?? null;
        setErrorMessage(remainingAttemptText('staff', remainingAttempts));
    };

    const keyPress = (key: string) => {
        if (verifying || lockedUntil) return;
        if (key === 'backspace') {
            if (!pin.length) return;
            setErrorMessage(null);
            setPin((current) => current.slice(0, -1));
            return;
        }

        const next = errorMessage ? key : `${pin}${key}`.slice(0, 4);
        setErrorMessage(null);
        setPin(next);
        if (next.length < 4) return;

        if (mode === 'enter') { void verify(next); return; }
        if (mode === 'create') {
            // Kural telefonda da: kişi ağ beklemeden hemen duysun.
            if (pinProblem(next) === 'weak') {
                feedback.warning();
                runPinErrorShake(shake, reduceMotion);
                startOver('Bu şifre çok kolay tahmin edilir. Başka bir şifre seçin.');
                return;
            }
            firstPin.current = next;
            setNotice(null);
            setMode('confirm');
            setPin('');
            return;
        }
        if (next !== firstPin.current) {
            feedback.warning();
            runPinErrorShake(shake, reduceMotion);
            startOver('İki şifre aynı değil. Baştan belirleyin.');
            return;
        }
        void createPin(next);
    };

    const secondsRemaining = lockedUntil
        ? Math.max(0, Math.ceil((lockedUntil - now) / 1000))
        : 0;
    const locked = Boolean(lockedUntil && secondsRemaining > 0);

    if (offline) {
        return (
            <AuthOfflineScreen
                busy={verifying}
                onRetry={() => { setOffline(false); }}
            />
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <LightField profile="form" />
            {identity ? (
                <AuthIdentityBar
                    overField
                    title={identity.member.name}
                    subtitle={identity.member.role}
                    onBack={leave}
                />
            ) : <View style={{ height: authMetrics.topBarHeight }} />}

            <TextInput
                value={pin}
                onChangeText={() => undefined}
                secureTextEntry
                showSoftInputOnFocus={false}
                keyboardType="number-pad"
                maxLength={4}
                editable={!complete && !locked}
                caretHidden
                style={{
                    position: 'absolute',
                    width: authMetrics.hiddenInputSize,
                    height: authMetrics.hiddenInputSize,
                    opacity: 0,
                }}
            />

            <View style={{ flex: 1, minHeight: 0 }}>
                <View style={{
                    flex: 1,
                    minHeight: 0,
                    paddingTop: authMetrics.pinTop,
                    gap: authMetrics.pinGap,
                    alignItems: 'center',
                }}>
                    {identity ? (
                        <View style={{
                            width: authMetrics.staffAvatar,
                            height: authMetrics.staffAvatar,
                            borderRadius: radius.pill,
                            borderWidth: authMetrics.selectionAvatarBorder,
                            borderColor: `${c.or}57`,
                            backgroundColor: `${c.or}24`,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Text style={{
                                color: c.or2,
                                fontSize: authMetrics.staffAvatarText,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: authMetrics.staffAvatarText * -0.02,
                            }}>
                                {identity.member.initials}
                            </Text>
                        </View>
                    ) : null}
                    <Text style={{
                        color: c.tx,
                        fontSize: authMetrics.staffPinTitle,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.staffPinTitle * -0.03,
                    }}>
                        {PIN_TITLE[mode]}
                    </Text>
                    {mode !== 'enter' ? (
                        <Text style={{
                            color: c.tx2,
                            fontSize: authMetrics.pinSetupHint,
                            fontFamily: font.medium,
                            fontWeight: '500',
                            textAlign: 'center',
                        }}>
                            {mode === 'create'
                                ? '4 hane · girişte yalnız siz kullanacaksınız'
                                : 'Aynı dört haneyi bir kez daha'}
                        </Text>
                    ) : null}
                    <Animated.View style={{ transform: [{ translateX: shake }] }}>
                        <AuthPinDots length={pin.length} error={Boolean(errorMessage)} />
                    </Animated.View>
                </View>

                {notice && !errorMessage ? (
                    <View style={{ marginBottom: authMetrics.pinErrorBottom }}>
                        <AuthBanner>{notice}</AuthBanner>
                    </View>
                ) : null}
                {errorMessage ? (
                    <Animated.View style={{
                        marginBottom: authMetrics.pinErrorBottom,
                        opacity: reveal,
                        transform: [{
                            translateY: reveal.interpolate({
                                inputRange: [0, 1],
                                outputRange: reduceMotion ? [0, 0] : [4, 0],
                            }),
                        }],
                    }}>
                        <AuthBanner kind="error">
                            {locked
                                ? `${errorMessage} ${lockCountdownText(secondsRemaining)}`
                                : errorMessage}
                        </AuthBanner>
                    </Animated.View>
                ) : null}

                <AuthKeypad onKey={keyPress} disabled={verifying || locked} />
                <View style={{
                    paddingTop: authMetrics.pinHelpTop,
                    paddingHorizontal: authMetrics.keypadX,
                    paddingBottom: Math.max(insets.bottom, authMetrics.pinHelpBottom),
                }}>
                    {mode === 'enter' ? (
                        <AuthActionButton
                            kind="ghost"
                            label="Şifremi hatırlamıyorum"
                            onPress={() => Alert.alert(
                                'Müdürden sıfırlamasını isteyin',
                                'Müdür Luera’da Personel ekranından şifrenizi sıfırlar. Sonra buradan yeni şifrenizi kendiniz belirlersiniz.',
                            )}
                        />
                    ) : null}
                    {/* Kişisel telefon başkasının eline geçtiyse ya da yanlış
                        kişi seçildiyse: liste. Telefon bağlı KALIR. */}
                    <AuthTextLink quiet label="Ben değilim" onPress={notMe} />
                </View>
            </View>
        </View>
    );
}

function revealPinError(reveal: Animated.Value, reduceMotion: boolean) {
    reveal.setValue(0);
    Animated.timing(reveal, {
        toValue: 1,
        duration: reduceMotion ? authMotion.statusReduced : authMotion.statusIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
    }).start();
}

function runPinErrorShake(shake: Animated.Value, reduceMotion: boolean) {
    if (reduceMotion) return;
    const leg = authMotion.errorShake / 3;
    Animated.sequence([
        Animated.timing(shake, {
            toValue: -authMotion.errorOffset,
            duration: leg,
            useNativeDriver: true,
        }),
        Animated.timing(shake, {
            toValue: authMotion.errorOffset,
            duration: leg,
            useNativeDriver: true,
        }),
        Animated.timing(shake, { toValue: 0, duration: leg, useNativeDriver: true }),
    ]).start();
}
