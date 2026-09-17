import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi } from '../../src/api/session';
import { AuthKeypad, AuthTextLink } from '../../src/components/ui';
import { ProfileNav } from '../../src/components/ProfileParts';
import {
    HintSlot, PinDotRow, StepBar, SwapTitle, type DotTone, type HintTone,
} from '../../src/components/PinParts';
import { lockCountdownText } from '../../src/lib/authCopy';
import { feedback } from '../../src/lib/feedback';
import { pinProblem, PIN_LENGTH } from '../../src/lib/pinRules';
import { authMetrics, profileMetrics as M, useTheme } from '../../src/theme';

/**
 * Personel · Profil › Şifreyi değiştir — Personel Girişi 099 tasarımı (§P5).
 *
 * Turun tek DİL değişikliği: ekran ışık alanından çıktı, uygulama içi opak
 * yüzeyde. Işık alanı "oturumun yok" demek; Profil'den buraya gelen kişi
 * içeride ve ona "çıkış yaptın" hissi verilmemeli. Mekanik şifre ekranıyla
 * aynı (4 nokta, adım geçişinde boşalma, 40 pt ipucu yuvası).
 *
 * Üç adım, üç parçalı çubuk:
 *   current · şu anki şifre — açık kalmış telefonu eline alan başkası şifreyi
 *             değiştirip personeli dışarıda bırakamasın
 *   next    · yeni şifre
 *   confirm · yeni şifre bir kez daha; tutmazsa 2. adıma döner (eski şifre
 *             bir daha sorulmaz)
 *
 * Eski şifre ANCAK son adımda sunucuya gidiyor; yanlışsa 1. adıma dönülür.
 * Kilit girişteki kilitle aynı sayaç — ama oturum kapanmıyor, kişi içeride kalır.
 */
type Step = 'current' | 'next' | 'confirm';

const TITLE: Record<Step, string> = {
    current: 'Şu anki şifreniz',
    next: 'Yeni şifreniz',
    confirm: 'Yeni şifre bir kez daha',
};

const HINT: Record<Step, string> = {
    current: 'Şimdi kullandığınız dört hane',
    next: '4 hane · bundan sonra girişte bunu yazacaksınız',
    confirm: 'Aynı dört haneyi bir kez daha',
};

const STEP_INDEX: Record<Step, number> = { current: 1, next: 2, confirm: 3 };
/** "Şifreniz değişti" okunma süresi — kutlama değil (tasarım: bu bir bakım işi). */
const DONE_MS = 900;
const SETTLE_MS = 120;

export default function ChangePin() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [step, setStep] = useState<Step>('current');
    const [stepKey, setStepKey] = useState(0);
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [hint, setHint] = useState<{ text: string; tone: HintTone } | null>(null);
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [done, setDone] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const current = useRef('');
    const next = useRef('');
    const settling = useRef(false);

    // Kilit bitince tuş takımı kendiliğinden açılır.
    useEffect(() => {
        if (lockedUntil === null) return;
        const id = setInterval(() => {
            const t = Date.now();
            setNow(t);
            if (t >= lockedUntil) { setLockedUntil(null); setHint(null); }
        }, 1000);
        return () => clearInterval(id);
    }, [lockedUntil]);

    const locked = lockedUntil !== null && lockedUntil > now;

    const go = (to: Step, message: { text: string; tone: HintTone } | null = null) => {
        if (to === 'current') current.current = '';
        if (to !== 'confirm') next.current = '';
        setStep(to);
        setPin('');
        setStepKey((k) => k + 1);
        setHint(message);
    };

    const settle = (then: () => void) => {
        settling.current = true;
        setTimeout(() => { settling.current = false; then(); }, SETTLE_MS);
    };

    const submit = async () => {
        setBusy(true);
        setHint({ text: 'Kaydediliyor…', tone: 'quiet' });
        const result = await authApi.staff.changePin(current.current, next.current);
        setBusy(false);
        if (result.ok) {
            feedback.success();
            setHint(null);
            setDone(true);
            setTimeout(() => router.back(), DONE_MS);
            return;
        }
        feedback.warning();
        switch (result.error) {
            case 'offline':
                // Noktalar dolu kalır; YANLIŞ ONAY yok — "sonra eşitlenecek" denmiyor.
                setHint({ text: 'Bağlantı yok. Şifreniz değişmedi.', tone: 'warn' });
                return;
            case 'invalid_pin':
            case 'invalid_credentials': {
                const left = result.remainingAttempts;
                go('current', {
                    text: typeof left === 'number'
                        ? `Şu anki şifreniz bu değil. ${left} denemeniz kaldı.`
                        : 'Şu anki şifreniz bu değil.',
                    tone: 'error',
                });
                return;
            }
            case 'locked':
                setNow(Date.now());
                setLockedUntil(result.lockedUntil ?? Date.now() + 15 * 60_000);
                go('current', { text: 'Çok fazla yanlış deneme. Şifre değiştirme 15 dakika kapalı.', tone: 'error' });
                return;
            case 'weak_pin':
                go('next', { text: 'Bu şifre çok kolay tahmin edilir. Başka dört hane seçin.', tone: 'warn' });
                return;
            case 'same_pin':
                go('next', { text: 'Yeni şifre eskisinden farklı olmalı.', tone: 'warn' });
                return;
            case 'no_session':
                // Müdür şifreyi sıfırladı ya da oturum başka yerden düştü.
                router.replace('/(auth)/staff/pin');
                return;
            case 'subscription_inactive':
                router.replace('/(auth)/locked');
                return;
            default:
                go('current', { text: 'Şifre değiştirilemedi. Baştan deneyin.', tone: 'error' });
        }
    };

    const keyPress = (key: string) => {
        if (busy || done || locked || settling.current) return;
        if (key === 'backspace') {
            if (hint?.tone !== 'quiet') setHint(null);
            setPin((value) => value.slice(0, -1));
            return;
        }
        const failed = hint !== null && hint.tone !== 'quiet';
        const value = `${failed ? '' : pin}${key}`.slice(0, PIN_LENGTH);
        if (failed) setHint(null);
        setPin(value);
        if (value.length < PIN_LENGTH) return;

        if (step === 'current') {
            current.current = value;
            settle(() => go('next'));
            return;
        }
        if (step === 'next') {
            // Aynı adımda kalınır: "değiştirmedin" demek için ekran değiştirmek gereksiz.
            if (value === current.current) {
                feedback.warning();
                settle(() => go('next', { text: 'Yeni şifre eskisinden farklı olmalı.', tone: 'warn' }));
                return;
            }
            if (pinProblem(value) === 'weak') {
                feedback.warning();
                settle(() => go('next', { text: 'Bu şifre çok kolay tahmin edilir. Başka dört hane seçin.', tone: 'warn' }));
                return;
            }
            next.current = value;
            settle(() => go('confirm'));
            return;
        }
        if (value !== next.current) {
            feedback.warning();
            settle(() => go('next', { text: 'İki yeni şifre aynı olmadı. Yeni şifreyi baştan yazın.', tone: 'error' }));
            return;
        }
        void submit();
    };

    const dotTone: DotTone = done ? 'ok' : hint?.tone === 'error' ? 'error' : 'normal';
    const hintText = done
        ? 'Bir sonraki girişte yeni şifrenizi yazacaksınız.'
        : locked && lockedUntil
            ? `${hint?.text ?? ''} ${lockCountdownText(Math.ceil((lockedUntil - now) / 1000))}`.trim()
            : hint?.text ?? HINT[step];

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Şifreyi değiştir" onBack={() => router.back()} />
            </View>
            <StepBar count={3} done={done ? 3 : STEP_INDEX[step]} />

            <View style={{ flex: 1, minHeight: 0 }}>
                <View style={{
                    flex: 1,
                    minHeight: 0,
                    paddingTop: small ? authMetrics.pinTopSmall : authMetrics.pinTop,
                    alignItems: 'center',
                }}>
                    <SwapTitle text={done ? 'Şifreniz değişti' : TITLE[step]} slide={!done} />
                    <View style={{ marginTop: small ? authMetrics.pinGapSmall : authMetrics.pinGap }}>
                        <PinDotRow length={done ? PIN_LENGTH : pin.length} tone={dotTone} drainKey={String(stepKey)} />
                    </View>
                    <HintSlot text={hintText} tone={done ? 'quiet' : hint?.tone ?? 'quiet'} />
                </View>

                <View style={{ opacity: busy || done ? authMetrics.pinKeypadDim : 1 }}>
                    <AuthKeypad opaque onKey={keyPress} disabled={busy || done || locked} />
                </View>
                <View style={{
                    paddingTop: authMetrics.pinHelpTop,
                    paddingBottom: Math.max(insets.bottom, small ? authMetrics.pinHelpBottomSmall : authMetrics.pinHelpBottom),
                    alignItems: 'center',
                }}>
                    <AuthTextLink quiet label="Vazgeç" onPress={() => router.back()} />
                </View>
            </View>
        </View>
    );
}
