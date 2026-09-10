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
} from '../../../src/components/ui';
import { lockCountdownText, remainingAttemptText } from '../../../src/lib/authCopy';
import { feedback } from '../../../src/lib/feedback';
import { authMetrics, authMotion, font, radius, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';

interface PendingIdentity {
    business: AuthBusiness;
    member: StaffRosterMember;
}

export default function StaffPin() {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [identity, setIdentity] = useState<PendingIdentity | null>(null);
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
        });
        return () => { alive = false; };
    }, [router]);

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

        feedback.warning();
        runPinErrorShake(shake, reduceMotion);
        if (result.error === 'locked' && result.lockedUntil) {
            setLockedUntil(result.lockedUntil);
            setNow(Date.now());
            setErrorMessage('Bu telefon 15 dakika kilitlendi. İşletme sahibinden yardım isteyin.');
            return;
        }
        const remainingAttempts = result.remainingAttempts ?? 0;
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
        if (next.length === 4) void verify(next);
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
                    title={identity.member.name}
                    subtitle={identity.member.role}
                    onBack={() => router.back()}
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
                        Şifrenizi girin
                    </Text>
                    <Animated.View style={{ transform: [{ translateX: shake }] }}>
                        <AuthPinDots length={pin.length} error={Boolean(errorMessage)} />
                    </Animated.View>
                </View>

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
                    <AuthActionButton
                        kind="ghost"
                        label="Şifremi hatırlamıyorum"
                        onPress={() => Alert.alert(
                            'İşletme sahibinden yardım isteyin',
                            'Şifrenizi işletme sahibi Luera’nın bilgisayar ekranından yenileyebilir.',
                        )}
                    />
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
