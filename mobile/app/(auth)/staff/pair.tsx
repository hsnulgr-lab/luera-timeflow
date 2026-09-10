import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBanner,
    AuthCodeBoxes,
    AuthDetailList,
    AuthKeypad,
    AuthScanButton,
    AuthTextLink,
    AuthOfflineScreen,
    AuthStatusScreen,
} from '../../../src/components/ui';
import { expiredPairCode } from '../../../src/lib/authCopy';
import { formatPairingCode } from '../../../src/lib/authValidation';
import { feedback } from '../../../src/lib/feedback';
import { authMetrics, authMotion, font, radius, type, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';
import { LueraTimeflowMark } from '../../../src/components/BrandMark';

const HELP_STEPS = [
    'İşletme sahibi bilgisayarda Luera’yı açar.',
    'Personel listesinde adınızın yanındaki Telefon bağla’ya basar.',
    'Ekranda çıkan altı haneli kodu size söyler. Kod 10 dakika geçerlidir.',
] as const;

function PairHelp({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
    const { c, dark, reduceMotion } = useTheme();
    const progress = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        if (!visible || mounted) return;
        setMounted(true);
        progress.setValue(0);
        const frame = requestAnimationFrame(() => {
            runSheetTransition(progress, true, reduceMotion);
        });
        return () => cancelAnimationFrame(frame);
    }, [mounted, progress, reduceMotion, visible]);

    if (!mounted) return null;

    const close = () => runSheetTransition(progress, false, reduceMotion, () => {
        setMounted(false);
        onDismiss();
    });
    return (
        <View style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
            <Pressable
                accessibilityLabel="Yardımı kapat"
                onPress={close}
                style={{ position: 'absolute', inset: 0 }}
            >
                <Animated.View style={{
                    flex: 1,
                    backgroundColor: dark ? 'rgba(0,0,0,0.50)' : 'rgba(14,14,14,0.34)',
                    opacity: progress,
                }} />
            </Pressable>
            <Animated.View
                accessibilityViewIsModal
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    paddingTop: authMetrics.helpSheetTop,
                    paddingHorizontal: authMetrics.helpSheetX,
                    paddingBottom: authMetrics.helpSheetBottom,
                    gap: authMetrics.helpSheetGap,
                    borderTopLeftRadius: authMetrics.helpSheetRadius,
                    borderTopRightRadius: authMetrics.helpSheetRadius,
                    borderTopWidth: 1,
                    borderColor: c.bd,
                    backgroundColor: c.surf,
                    opacity: progress,
                    transform: [{
                        translateY: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: reduceMotion ? [0, 0] : [authMetrics.helpSheetTravel, 0],
                        }),
                    }],
                }}
            >
                <Text style={{
                    color: c.tx,
                    fontSize: authMetrics.helpSheetTitle,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: authMetrics.helpSheetTitle * -0.03,
                }}>
                    Kodu nereden alacaksınız?
                </Text>

                <View style={{ gap: authMetrics.helpStepGap }}>
                    {HELP_STEPS.map((step, index) => (
                        <View key={step} style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: authMetrics.helpStepGap,
                        }}>
                            <View style={{
                                width: authMetrics.helpStepCircle,
                                height: authMetrics.helpStepCircle,
                                borderRadius: radius.pill,
                                borderWidth: 1,
                                borderColor: c.bd2,
                                backgroundColor: c.surf2,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Text style={{
                                    color: c.tx2,
                                    fontSize: authMetrics.helpStepNumber,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                }}>
                                    {index + 1}
                                </Text>
                            </View>
                            <Text style={{
                                flex: 1,
                                color: c.tx2,
                                fontSize: authMetrics.helpStepText,
                                fontFamily: font.medium,
                                fontWeight: '500',
                                lineHeight: authMetrics.helpStepText * authMetrics.helpStepLine,
                            }}>
                                {index === 1 ? (
                                    <>
                                        Personel listesinde adınızın yanındaki{' '}
                                        <Text style={{ color: c.tx, fontFamily: font.bold, fontWeight: '700' }}>
                                            Telefon bağla
                                        </Text>
                                        ’ya basar.
                                    </>
                                ) : step}
                            </Text>
                        </View>
                    ))}
                </View>

                <AuthBanner inset={false}>
                    Kodu yalnız işletme sahibi üretebilir. Uygulamadan istek gönderemezsiniz.
                </AuthBanner>
                <AuthActionButton label="Anladım" kind="secondary" onPress={close} />
            </Animated.View>
        </View>
    );
}

export default function PairDevice() {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [code, setCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [offline, setOffline] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const [expired, setExpired] = useState<{ name: string; title: string; phone: string } | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const shake = useRef(new Animated.Value(0)).current;
    const complete = code.length === 6;

    const updateCode = (next: string) => {
        setInvalid(false);
        setCode(formatPairingCode(next));
    };

    const keyPress = (key: string) => {
        if (key === 'backspace') {
            if (code.length) updateCode(code.slice(0, -1));
            return;
        }
        if (code.length < 6) updateCode(code + key);
    };

    const submit = async () => {
        if (submitting || !complete) return;
        setSubmitting(true);
        const result = await authApi.staff.pair(code);
        setSubmitting(false);
        if (result.ok) {
            router.push('/(auth)/staff/who');
            return;
        }
        if (result.error === 'offline') { setOffline(true); return; }
        // Süresi dolmuş kod aynı ekranda çözülemez: yeni kodu ancak işletme
        // sahibi üretebilir. Bu yüzden banner değil, kendi ekranı.
        if (result.error === 'expired_pair_code') {
            feedback.warning();
            setExpired(await authApi.staff.owner());
            return;
        }

        feedback.warning();
        setInvalid(true);
        runPairErrorShake(shake, reduceMotion);
    };

    if (expired) {
        return (
            <AuthStatusScreen
                tone="amber"
                icon="clock"
                title={expiredPairCode.title}
                body={expiredPairCode.body}
                detail={(
                    <AuthDetailList rows={[{
                        title: expired.name,
                        subtitle: expired.title,
                        status: expiredPairCode.ownerStatus,
                    }]} />
                )}
            >
                <AuthActionButton
                    kind="secondary"
                    label={expiredPairCode.retype}
                    onPress={() => { setExpired(null); updateCode(''); }}
                />
                <AuthActionButton
                    kind="ghost"
                    label={expiredPairCode.call}
                    onPress={() => { void Linking.openURL(`tel:${expired.phone}`); }}
                />
            </AuthStatusScreen>
        );
    }

    if (offline) {
        return (
            <AuthOfflineScreen
                busy={submitting}
                onRetry={() => { setOffline(false); requestAnimationFrame(submit); }}
            />
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <LightField profile="form" />
            <TextInput
                value={code}
                onChangeText={updateCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                showSoftInputOnFocus={false}
                maxLength={6}
                caretHidden
                style={{
                    position: 'absolute',
                    width: authMetrics.hiddenInputSize,
                    height: authMetrics.hiddenInputSize,
                    opacity: 0,
                }}
            />
            <View style={{
                flex: 1,
                minHeight: 0,
                paddingTop: authMetrics.staffHeroTop,
                paddingHorizontal: authMetrics.staffHeroX,
                gap: authMetrics.staffHeroGap,
            }}>
                <LueraTimeflowMark size={authMetrics.welcomeBrandSizeSmall} animate />
                <View style={{ gap: authMetrics.codeGap }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: authMetrics.staffTitleSize,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.staffTitleSize * -0.035,
                        lineHeight: authMetrics.staffTitleSize * authMetrics.staffTitleLine,
                    }}>
                        Bu telefonu{`\n`}işletmeye bağlayın
                    </Text>
                    <Text style={{
                        color: c.tx2,
                        fontSize: type.body.fontSize,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        lineHeight: type.body.fontSize * authMetrics.staffBodyLine,
                    }}>
                        Bilgisayardaki Luera ekranında görünen altı haneli kodu yazın. Kodu işletme sahibi verir.
                    </Text>
                </View>
                <Animated.View style={{ transform: [{ translateX: shake }] }}>
                    <AuthCodeBoxes code={code} error={invalid} />
                </Animated.View>
                {invalid ? (
                    <AuthBanner inset={false} kind="error">
                        Bu kod eşleşmedi. Rakamları bir daha kontrol edip yeniden yazın.
                    </AuthBanner>
                ) : null}
                <AuthScanButton onPress={() => undefined} />
            </View>

            <AuthKeypad onKey={keyPress} disabled={submitting} />
            <View style={{
                paddingTop: authMetrics.pairActionTop,
                paddingHorizontal: authMetrics.keypadX,
                paddingBottom: authMetrics.pairActionBottom,
            }}>
                <AuthActionButton
                    compact
                    // Geçersiz kod bir yazım hatasıdır: çözüm kullanıcının elinde,
                    // o yüzden buton "yeniden dene" der ve aynı ekranda kalınır.
                    label={invalid ? 'Yeniden dene' : 'Devam'}
                    disabled={!complete || submitting}
                    onPress={submit}
                />
            </View>
            <View style={{
                paddingHorizontal: authMetrics.keypadX,
                paddingBottom: Math.max(insets.bottom, authMetrics.pairHelpBottom),
            }}>
                <AuthTextLink quiet label="Kodum yok" onPress={() => setHelpOpen(true)} />
            </View>
            <PairHelp visible={helpOpen} onDismiss={() => setHelpOpen(false)} />
        </View>
    );
}

function runSheetTransition(
    progress: Animated.Value,
    open: boolean,
    reduceMotion: boolean,
    onFinished?: () => void,
) {
    progress.stopAnimation();
    Animated.timing(progress, {
        toValue: open ? 1 : 0,
        duration: reduceMotion
            ? authMotion.statusIn
            : open ? authMotion.sheetIn : authMotion.sheetOut,
        easing: reduceMotion
            ? Easing.linear
            : open ? Easing.bezier(0.2, 0.9, 0.15, 1) : Easing.in(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
    }).start(({ finished }) => {
        if (finished) onFinished?.();
    });
}

function runPairErrorShake(shake: Animated.Value, reduceMotion: boolean) {
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
