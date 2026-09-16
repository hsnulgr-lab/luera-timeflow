import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi, LIVE_AUTH } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBanner,
    AuthCodeBoxes,
    AuthDetailList,
    AuthKeypad,
    AuthTextLink,
    AuthOfflineScreen,
    AuthStatusScreen,
} from '../../../src/components/ui';
import { expiredPairCode, lockWaitText, pairLocked, usedPairCode } from '../../../src/lib/authCopy';
import { formatPairingCode } from '../../../src/lib/authValidation';
import { feedback } from '../../../src/lib/feedback';
import { authMetrics, authMotion, font, radius, type, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';
import { LueraTimeflowMark } from '../../../src/components/BrandMark';

interface PairOwner { name: string; title: string; phone: string }

/**
 * İşletme sahibinin kartı — YALNIZ sahte katmanda.
 *
 * `authApi.staff.owner()` canlıda karşılığı olmayan bir uç: `auth.ts`'in
 * `staff` yüzeyinde yok, o yüzden çağrı sessizce sahte katmana düşüyor ve
 * UYDURMA bir ad ile UYDURMA bir telefon dönüyor. "İşletme sahibini ara"
 * düğmesi canlıda tanımadığı birini arardı.
 *
 * Sunucu bu bilgiyi veremez de: eşleştirme başarısızken telefonun hiçbir
 * kimliği yok — hangi işletmeye ait olduğu bilinmiyor ki sahibi söylensin.
 * Doğru davranış kartı ÇİZMEMEK; ekran onsuz da tam anlamlı.
 */
async function ownerOrNull(): Promise<PairOwner | null> {
    if (LIVE_AUTH) return null;
    return authApi.staff.owner();
}

/*
 * EKİP KODU (099): tek kod, bütün ekip. Kod ister masaüstünden ister müdürün
 * telefonundan üretilir; personel yazdıktan sonra listeden kendini seçer.
 */
const HELP_STEPS = [
    'Müdür Luera’da Personel ekranını açar — bilgisayarda ya da kendi telefonunda.',
    'Telefon bağla’ya basar; ekranda altı haneli kod çıkar.',
    'Kodu buraya yazıp listeden kendinizi seçin. Kod 15 dakika geçerli, bütün ekip aynı kodu kullanır.',
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
                                {step}
                            </Text>
                        </View>
                    ))}
                </View>

                <AuthBanner inset={false}>
                    Kodu yalnız müdür üretebilir. Uygulamadan istek gönderemezsiniz.
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
    const [expired, setExpired] = useState<{ owner: PairOwner | null; used?: boolean } | null>(null);
    /**
     * Kilidin bitiş anı. `owner` ayrı tutuluyor çünkü kilit ekranı onsuz da
     * çizilebilmeli: sahibin bilgisi okunamazsa kişi en azından ne kadar
     * bekleyeceğini görsün.
     */
    const [locked, setLocked] = useState<{ until: number | null; owner: PairOwner | null } | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [helpOpen, setHelpOpen] = useState(false);
    const shake = useRef(new Animated.Value(0)).current;
    const complete = code.length === 6;

    /**
     * Sayaç. Kilit BİTİNCE ekran kendiliğinden açılıyor: kişiyi "bitti mi
     * acaba" diye denemeye zorlamak, her denemesi kilidi uzatan bir uçta
     * tam olarak yapılmaması gereken şey.
     */
    useEffect(() => {
        const until = locked?.until;
        if (!until) return;
        const id = setInterval(() => {
            const next = Date.now();
            setNow(next);
            if (next >= until) setLocked(null);
        }, 1000);
        return () => clearInterval(id);
    }, [locked?.until]);

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
            /*
             * Kod BİR PERSONELE bağlıysa (masaüstü Personel sayfasının "Telefon
             * bağla"sı hep böyle üretiyor) "Siz kimsiniz?" adımı ATLANIR —
             * sunucu da bunu söylüyordu, istemci dinlemiyordu. Seçim tutmazsa
             * (ör. personelin PIN'i yok) liste ekranı sebebi söyler.
             */
            if (result.data.staffId) {
                const chosen = await authApi.staff.select(result.data.staffId);
                if (chosen.ok) { router.push('/(auth)/staff/pin'); return; }
            }
            router.push('/(auth)/staff/who');
            return;
        }
        if (result.error === 'offline') { setOffline(true); return; }
        /*
         * ABONELİK — kod DOĞRUYDU. Eskiden bu da "Bu kod eşleşmedi" bandına
         * düşüyordu: kişi doğru kodu tekrar tekrar yazıyor, her deneme kilit
         * sayacını besliyordu. PIN ekranıyla aynı yere gidiyor.
         */
        if (result.error === 'subscription_inactive') {
            router.replace('/(auth)/locked');
            return;
        }
        // Süresi dolmuş kod aynı ekranda çözülemez: yeni kodu ancak işletme
        // sahibi üretebilir. Bu yüzden banner değil, kendi ekranı.
        if (result.error === 'expired_pair_code' || result.error === 'used_pair_code') {
            feedback.warning();
            setExpired({ owner: await ownerOrNull(), used: result.error === 'used_pair_code' });
            return;
        }
        /*
         * KİLİT — kodu suçlamıyor.
         *
         * Yirmi yanlış denemeden sonra (099, önce on) sunucu koda BAKMIYOR; doğru kod da
         * reddediliyor. Buradaki eski davranış kodu suçlayan kırmızı banttı:
         * kişi aynı doğru kodu yeniden yazıyor, her yazışı kilidi besliyordu.
         * Sarsıntı da yok — sarsıntı "yanlış yazdın" demek.
         */
        if (result.error === 'locked') {
            feedback.warning();
            setNow(Date.now());
            setLocked({ until: result.lockedUntil ?? null, owner: await ownerOrNull() });
            return;
        }

        feedback.warning();
        setInvalid(true);
        runPairErrorShake(shake, reduceMotion);
    };

    if (locked) {
        const waiting = locked.until ? Math.max(0, (locked.until - now) / 1000) : 0;
        return (
            <AuthStatusScreen
                tone="amber"
                icon="lock"
                align="top"
                title={pairLocked.title}
                body={pairLocked.body}
                detail={(
                    <AuthBanner inset={false}>
                        {locked.until ? lockWaitText(waiting) : pairLocked.hint}
                    </AuthBanner>
                )}
                extra={locked.until ? (
                    <Text style={{
                        color: c.tx2,
                        textAlign: 'center',
                        fontSize: authMetrics.pairLockHintSize,
                        lineHeight: authMetrics.pairLockHintSize * 1.5,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {pairLocked.hint}
                    </Text>
                ) : undefined}
            >
                {/* Düğme YOK denecek kadar az: kilitliyken yapılabilecek tek
                    şey beklemek, ikincisi de sahibi aramak. "Tekrar dene"
                    çizmek, denenebilirmiş gibi göstermek olurdu. */}
                {locked.owner ? (
                    <AuthActionButton
                        kind="ghost"
                        label={pairLocked.call}
                        onPress={() => { void Linking.openURL(`tel:${locked.owner?.phone ?? ''}`); }}
                    />
                ) : null}
            </AuthStatusScreen>
        );
    }

    if (expired) {
        return (
            <AuthStatusScreen
                tone="amber"
                icon="clock"
                title={expired.used ? usedPairCode.title : expiredPairCode.title}
                body={expired.used ? usedPairCode.body : expiredPairCode.body}
                detail={expired.owner ? (
                    <AuthDetailList rows={[{
                        title: expired.owner.name,
                        subtitle: expired.owner.title,
                        status: expiredPairCode.ownerStatus,
                    }]} />
                ) : undefined}
            >
                <AuthActionButton
                    kind="secondary"
                    label={expiredPairCode.retype}
                    onPress={() => { setExpired(null); updateCode(''); }}
                />
                {expired.owner ? (
                    <AuthActionButton
                        kind="ghost"
                        label={expiredPairCode.call}
                        onPress={() => { void Linking.openURL(`tel:${expired.owner?.phone ?? ''}`); }}
                    />
                ) : null}
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
                        Müdürün ekranındaki altı haneli kodu yazın — bilgisayarda ya da müdürün telefonunda çıkar.
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
