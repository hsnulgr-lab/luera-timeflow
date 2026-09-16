import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi } from '../../src/api/session';
import {
    AuthBanner,
    AuthIdentityBar,
    AuthKeypad,
    AuthPinDots,
} from '../../src/components/ui';
import { LightField } from '../../src/components/LightField';
import { lockCountdownText, remainingAttemptText } from '../../src/lib/authCopy';
import { feedback } from '../../src/lib/feedback';
import { pinProblem, PIN_LENGTH } from '../../src/lib/pinRules';
import { authMetrics, authMotion, font, useTheme } from '../../src/theme';

/**
 * Personel · şifreyi değiştir (099).
 *
 * Müdür kararı: şifreyi personel kendisi belirler, değiştirmek isterse
 * ayarlardan değiştirir. Üç adım, giriş ekranının aynı tuş takımıyla:
 *
 *   current · eski şifre — açık kalmış telefonu eline alan başkası şifreyi
 *             değiştirip personeli dışarıda bırakamasın
 *   next    · yeni şifre (kural telefonda da kontrol ediliyor)
 *   confirm · yeni şifre bir kez daha
 *
 * Eski şifre ANCAK son adımda sunucuya gidiyor: yanlışsa kişi baştan başlar ve
 * sayaç girişteki sayaçla aynı (sunucu `pin.change`).
 */
type Step = 'current' | 'next' | 'confirm';

const TITLE: Record<Step, string> = {
    current: 'Şu anki şifreniz',
    next: 'Yeni şifreniz',
    confirm: 'Yeni şifre bir kez daha',
};

export default function ChangePin() {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [step, setStep] = useState<Step>('current');
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [done, setDone] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const current = useRef('');
    const next = useRef('');
    const [shake] = useState(() => new Animated.Value(0));

    const fail = (message: string, restartAt: Step) => {
        feedback.warning();
        if (!reduceMotion) {
            const leg = authMotion.errorShake / 3;
            Animated.sequence([
                Animated.timing(shake, { toValue: -authMotion.errorOffset, duration: leg, useNativeDriver: true }),
                Animated.timing(shake, { toValue: authMotion.errorOffset, duration: leg, useNativeDriver: true }),
                Animated.timing(shake, { toValue: 0, duration: leg, useNativeDriver: true }),
            ]).start();
        }
        if (restartAt === 'current') current.current = '';
        next.current = '';
        setStep(restartAt);
        setPin('');
        setError(message);
    };

    const submit = async () => {
        setBusy(true);
        const result = await authApi.staff.changePin(current.current, next.current);
        setBusy(false);
        if (result.ok) {
            feedback.success();
            setDone(true);
            setTimeout(() => router.back(), 900);
            return;
        }
        switch (result.error) {
            case 'offline':
                fail('Bağlantı yok. Şifreniz değişmedi; bağlanınca tekrar deneyin.', 'current');
                return;
            case 'invalid_pin':
            case 'invalid_credentials':
                fail(remainingAttemptText('staff', result.remainingAttempts ?? null), 'current');
                return;
            case 'locked':
                setNow(Date.now());
                setLockedUntil(result.lockedUntil ?? Date.now() + 15 * 60_000);
                fail('Çok fazla yanlış deneme. Şifre değiştirme 15 dakika kapalı.', 'current');
                return;
            case 'weak_pin':
                fail('Bu şifre çok kolay tahmin edilir. Başka bir şifre seçin.', 'next');
                return;
            case 'same_pin':
                fail('Yeni şifre eskisiyle aynı. Başka bir şifre seçin.', 'next');
                return;
            case 'no_session':
                // Müdür şifreyi sıfırladı ya da oturum başka yerden düştü.
                router.replace('/(auth)/staff/pin');
                return;
            case 'subscription_inactive':
                router.replace('/(auth)/locked');
                return;
            default:
                fail('Şifre değiştirilemedi. Baştan deneyin.', 'current');
        }
    };

    // Kilit bitince tuş takımı kendiliğinden açılır.
    useEffect(() => {
        if (lockedUntil === null) return;
        const id = setInterval(() => {
            const t = Date.now();
            setNow(t);
            if (t >= lockedUntil) { setLockedUntil(null); setError(null); }
        }, 1000);
        return () => clearInterval(id);
    }, [lockedUntil]);

    const locked = lockedUntil !== null && lockedUntil > now;

    const keyPress = (key: string) => {
        if (busy || done || locked) return;
        if (key === 'backspace') {
            setError(null);
            setPin((value) => value.slice(0, -1));
            return;
        }
        const value = `${error ? '' : pin}${key}`.slice(0, PIN_LENGTH);
        setError(null);
        setPin(value);
        if (value.length < PIN_LENGTH) return;

        if (step === 'current') {
            current.current = value;
            setStep('next');
            setPin('');
            return;
        }
        if (step === 'next') {
            if (value === current.current) { fail('Yeni şifre eskisiyle aynı. Başka bir şifre seçin.', 'next'); return; }
            if (pinProblem(value) === 'weak') { fail('Bu şifre çok kolay tahmin edilir. Başka bir şifre seçin.', 'next'); return; }
            next.current = value;
            setStep('confirm');
            setPin('');
            return;
        }
        if (value !== next.current) { fail('İki yeni şifre aynı değil. Yeni şifreyi baştan yazın.', 'next'); return; }
        void submit();
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <LightField profile="form" />
            <AuthIdentityBar
                overField
                title="Şifreyi değiştir"
                subtitle="4 hane · girişte kullandığınız şifre"
                onBack={() => router.back()}
            />

            <View style={{ flex: 1, minHeight: 0 }}>
                <View style={{
                    flex: 1,
                    minHeight: 0,
                    paddingTop: authMetrics.pinTop,
                    gap: authMetrics.pinGap,
                    alignItems: 'center',
                }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: authMetrics.staffPinTitle,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.staffPinTitle * -0.03,
                    }}>
                        {done ? 'Şifreniz değişti' : TITLE[step]}
                    </Text>
                    <Animated.View style={{ transform: [{ translateX: shake }] }}>
                        <AuthPinDots length={done ? PIN_LENGTH : pin.length} error={Boolean(error)} />
                    </Animated.View>
                </View>

                {error ? (
                    <View style={{ marginBottom: authMetrics.pinErrorBottom }}>
                        <AuthBanner kind="error">
                            {locked && lockedUntil
                                ? `${error} ${lockCountdownText(Math.ceil((lockedUntil - now) / 1000))}`
                                : error}
                        </AuthBanner>
                    </View>
                ) : null}

                <AuthKeypad onKey={keyPress} disabled={busy || done || locked} />
                <View style={{ height: Math.max(insets.bottom, authMetrics.pinHelpBottom) }} />
            </View>
        </View>
    );
}
