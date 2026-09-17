import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    authApi,
    type AuthBusiness,
    type StaffRosterMember,
} from '../../../src/api/session';
import {
    AuthActionButton,
    AuthIdentityBar,
    AuthKeypad,
    AuthOfflineScreen,
    AuthTextLink,
} from '../../../src/components/ui';
import {
    BottomPlate, HintSlot, InfoBand, PinDotRow, StepBar, SwapTitle,
    type DotTone, type HintTone,
} from '../../../src/components/PinParts';
import { lockWaitText, remainingAttemptText } from '../../../src/lib/authCopy';
import { feedback } from '../../../src/lib/feedback';
import { pinProblem } from '../../../src/lib/pinRules';
import { authMetrics, font, radius, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';

/**
 * Personel · şifre ekranı — Personel Girişi 099 tasarımı (§P3 · §P4).
 *
 * Üç hâl, tek kabuk:
 *   enter   · şifresi olan personel girer (her vardiya — sakin alan `lock`)
 *   create  · şifresi olmayan personel İLK şifresini yazar (müdür kararı)
 *   confirm · aynı şifre bir kez daha
 *
 * Tasarımın dört kararı burada:
 *   1. Adım değişince noktalar 4→1 SÖNEREK boşalır, başlık kayar, adım çubuğu
 *      dolar — eskiden ekran birebir aynı kalıyor, kişi ikinci kez yazdığını
 *      ilk kez sanıyordu.
 *   2. Hata ALTTAKİ BANTTA değil, noktaların 18 pt altındaki 40 pt'lik yuvada:
 *      dördüncü haneye basıldığında göz noktalarda.
 *   3. Şifre ekranlarında SARSINTI YOK — renk var. Zayıf şifre amber (riskli
 *      seçim), aynı olmayan iki şifre ve yanlış şifre kırmızı.
 *   4. Uyarı pencereleri (Alert) yerine alttan yükselen cam plaka.
 *
 * Koddan düzeltilen tasarım iddiası: kilit TELEFONA değil KİŞİYE ait (sunucu
 * `staff.pin_locked_until`) ve müdür şifreyi sıfırlayınca kilit de kalkıyor.
 */

interface PendingIdentity {
    business: AuthBusiness;
    member: StaffRosterMember;
}

type PinMode = 'enter' | 'create' | 'confirm';

const PIN_TITLE: Record<PinMode, string> = {
    enter: 'Şifrenizi girin',
    create: 'Şifrenizi belirleyin',
    confirm: 'Şifrenizi tekrar girin',
};

const PIN_HINT: Record<PinMode, string | null> = {
    enter: null,
    create: '4 hane · girişte yalnız siz kullanacaksınız',
    confirm: 'Aynı dört haneyi bir kez daha',
};

/** "Şifreniz hazır" ne kadar ekranda: tasarımın kutlama bütçesi 220 ms. */
const READY_MS = 220;
/** Dördüncü hane yazıldıktan sonra adım geçişine kadar — nokta dolu görünür. */
const SETTLE_MS = 120;

export default function StaffPin() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [identity, setIdentity] = useState<PendingIdentity | null>(null);
    const [mode, setMode] = useState<PinMode>('enter');
    /** Adım geçişi sayacı — noktaların boşalarak sönmesini tetikler. */
    const [stepKey, setStepKey] = useState(0);
    /** İlk yazılan şifre — yalnız `confirm` hâlinde dolu, ekrandan hiç okunmaz. */
    const firstPin = useRef('');
    /** Kalıcı bilgi bandı: "şifreniz sıfırlanmış". Şifre belirlenince gider. */
    const [resetBand, setResetBand] = useState(false);
    const [plate, setPlate] = useState<'forgot' | 'taken' | null>(null);
    const [pin, setPin] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [ready, setReady] = useState(false);
    const [offline, setOffline] = useState(false);
    const [hint, setHint] = useState<{ text: string; tone: HintTone } | null>(null);
    const [lockedUntil, setLockedUntil] = useState<number | undefined>();
    const [now, setNow] = useState(() => Date.now());
    const verifyingRef = useRef(false);
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

    // Kilit bitince ekran kendiliğinden açılır.
    useEffect(() => {
        if (!lockedUntil) return;
        const interval = setInterval(() => {
            const next = Date.now();
            setNow(next);
            if (next >= lockedUntil) {
                setLockedUntil(undefined);
                setHint(null);
                setPin('');
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [lockedUntil]);

    const notMe = () => { router.replace('/(auth)/staff/who'); };

    const goStep = (next: PinMode) => {
        setMode(next);
        setPin('');
        setStepKey((k) => k + 1);
    };

    /** Baştan belirleme — ilk şifre silinir (sessizce saklamak ikinci adımı bozar). */
    const startOver = (message: { text: string; tone: HintTone } | null) => {
        firstPin.current = '';
        goStep('create');
        setHint(message);
    };

    // Geri: 2. adımda 1. adıma döner ve ilk şifreyi siler (tasarım §P3).
    const back = () => {
        if (mode === 'confirm') { startOver(null); return; }
        if (router.canGoBack()) router.back();
        else notMe();
    };

    const enterApp = () => {
        feedback.success();
        setReady(true);
        setTimeout(() => router.replace('/(auth)/biometric'), READY_MS);
    };

    /** İlk şifre: iki kez yazıldı ve aynı → sunucuya. */
    const createPin = async (nextPin: string) => {
        if (verifyingRef.current) return;
        verifyingRef.current = true;
        setVerifying(true);
        setHint({ text: 'Kaydediliyor…', tone: 'quiet' });
        const slow = setTimeout(() => setHint({ text: 'Bağlantı yavaş, bekliyoruz.', tone: 'quiet' }), 1200);
        const result = await authApi.staff.setupPin(nextPin);
        clearTimeout(slow);
        verifyingRef.current = false;
        setVerifying(false);

        if (result.ok) { setHint(null); setResetBand(false); enterApp(); return; }
        if (result.error === 'offline') { setHint(null); setOffline(true); setPin(''); return; }
        if (result.error === 'subscription_inactive') { router.replace('/(auth)/locked'); return; }
        if (result.error === 'not_paired') { router.replace('/(auth)/staff/pair'); return; }
        if (result.error === 'staff_not_found' || result.error === 'invalid_credentials') { notMe(); return; }
        // Başka bir telefon bu kişi için az önce şifre belirledi. Hata değil,
        // BİLGİ — ama "şifreniz" denmiyor: belirleyen başkası olabilir.
        if (result.error === 'pin_already_set') {
            firstPin.current = '';
            setHint(null);
            setResetBand(false);
            setPlate('taken');
            return;
        }
        feedback.warning();
        startOver(result.error === 'weak_pin'
            ? { text: 'Bu şifre çok kolay tahmin edilir. Başka dört hane seçin.', tone: 'warn' }
            : { text: 'Şifre kaydedilemedi. Dört haneyi baştan yazın.', tone: 'error' });
    };

    const verify = async (nextPin: string) => {
        if (verifyingRef.current) return;
        verifyingRef.current = true;
        setVerifying(true);
        const result = await authApi.staff.start(nextPin);
        verifyingRef.current = false;
        setVerifying(false);

        if (result.ok) { enterApp(); return; }
        // Çevrimdışı bir "yanlış şifre" değil: sayaç artmaz, nokta kızarmaz.
        if (result.error === 'offline') { setOffline(true); setPin(''); return; }
        if (result.error === 'subscription_inactive') { router.replace('/(auth)/locked'); return; }
        if (result.error === 'not_paired' || result.error === 'staff_not_found') {
            router.replace(result.error === 'not_paired' ? '/(auth)/staff/pair' : '/(auth)/staff/who');
            return;
        }
        // Müdür şifreyi sıfırladı: yanlış şifre DEĞİL — ekran belirlemeye döner.
        if (result.error === 'pin_not_set') {
            setResetBand(true);
            startOver(null);
            return;
        }

        feedback.warning();
        if (result.error === 'locked') {
            setNow(Date.now());
            setLockedUntil(result.lockedUntil ?? Date.now() + 15 * 60_000);
            setPin('');
            return;
        }
        // Kalan hak GERÇEK: sayaç bu kişinin. Bilinmeyen sayı yazılmıyor.
        setHint({ text: remainingAttemptText('staff', result.remainingAttempts ?? null), tone: 'error' });
    };

    /** Adım geçişinden önce dolu dört noktanın görüldüğü kısa an. */
    const settling = useRef(false);
    const settle = (then: () => void) => {
        settling.current = true;
        setTimeout(() => { settling.current = false; then(); }, SETTLE_MS);
    };

    const keyPress = (key: string) => {
        if (verifying || lockedUntil || ready || settling.current) return;
        if (key === 'backspace') {
            if (!pin.length) return;
            if (hint?.tone !== 'quiet') setHint(null);
            setPin((current) => current.slice(0, -1));
            return;
        }

        const failed = hint !== null && hint.tone !== 'quiet';
        const next = failed ? key : `${pin}${key}`.slice(0, 4);
        if (failed) setHint(null);
        setPin(next);
        if (next.length < 4) return;

        if (mode === 'enter') { void verify(next); return; }
        if (mode === 'create') {
            // Kural telefonda da: kişi ağ beklemeden hemen duysun.
            if (pinProblem(next) === 'weak') {
                feedback.warning();
                startOver({ text: 'Bu şifre çok kolay tahmin edilir. Başka dört hane seçin.', tone: 'warn' });
                return;
            }
            firstPin.current = next;
            // Dördüncü nokta önce DOLU görünsün, sonra alan boşalsın (tasarım
            // 02b · 0 ms karesi). Aradaki tuşlar yutulur.
            settle(() => goStep('confirm'));
            return;
        }
        if (next !== firstPin.current) {
            feedback.warning();
            settle(() => startOver({ text: 'İki şifre aynı olmadı. Dört haneyi baştan yazın.', tone: 'error' }));
            return;
        }
        void createPin(next);
    };

    const secondsRemaining = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
    const locked = Boolean(lockedUntil && secondsRemaining > 0);

    if (offline) {
        return (
            <AuthOfflineScreen
                busy={verifying}
                onRetry={() => {
                    setOffline(false);
                    // Belirlemenin ortasında bağlantı gittiyse ikinci adımdan devam.
                    if (mode === 'confirm' && firstPin.current) setPin('');
                }}
            />
        );
    }

    const setting = mode !== 'enter';
    const dotTone: DotTone = ready ? 'ok' : hint?.tone === 'error' ? 'error' : 'normal';
    const hintText = ready
        ? (setting ? 'Bundan sonra girişte yalnız bu dört haneyi yazacaksınız.' : null)
        : hint?.text ?? PIN_HINT[mode];
    const title = ready ? (setting ? 'Şifreniz hazır' : PIN_TITLE.enter) : PIN_TITLE[mode];
    const avatar = small ? authMetrics.staffAvatarSmall : authMetrics.staffAvatar;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            {/* Her vardiya görülen giriş SAKİN (`lock`), ilk şifre `form`. */}
            <LightField profile={setting ? 'form' : 'lock'} />
            {identity ? (
                <AuthIdentityBar
                    overField
                    title={identity.member.name}
                    subtitle={identity.member.role}
                    onBack={back}
                />
            ) : <View style={{ height: authMetrics.topBarHeight }} />}
            {setting ? <StepBar count={2} done={mode === 'confirm' || ready ? 2 : 1} /> : null}
            {resetBand ? (
                <InfoBand>Müdürünüz şifrenizi sıfırladı. Yenisini şimdi siz belirleyeceksiniz.</InfoBand>
            ) : null}

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
                {locked ? (
                    /*
                     * KİLİT — kişiye ait (sunucu `staff.pin_locked_until`). Tuş
                     * takımı yok: yapılacak iş yazmak değil, beklemek ya da
                     * müdüre gitmek. O yüzden "Şifremi hatırlamıyorum" burada
                     * sessiz bağlantı değil, düğme.
                     */
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: authMetrics.pinLockX, gap: authMetrics.pinLockGap }}>
                        <Text style={{
                            color: c.tx, fontSize: authMetrics.pinLockTitle, fontFamily: font.extraBold, fontWeight: '800',
                            letterSpacing: authMetrics.pinLockTitle * -0.03, textAlign: 'center',
                        }}>
                            Şifre girişi 15 dakika kilitli
                        </Text>
                        <Text style={{
                            color: c.tx, fontSize: authMetrics.pinLockCount, fontFamily: font.extraBold, fontWeight: '800',
                            letterSpacing: authMetrics.pinLockCount * -0.04, fontVariant: ['tabular-nums'],
                        }}>
                            {`${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`}
                        </Text>
                        <Text style={{
                            color: c.tx2, fontSize: authMetrics.pinLockBody, lineHeight: authMetrics.pinLockBody * 1.45, fontFamily: font.medium,
                            fontWeight: '500', textAlign: 'center',
                        }}>
                            {lockWaitText(secondsRemaining)}. Beklemek istemiyorsanız müdürünüz şifrenizi sıfırlayabilir; sıfırlayınca kilit de kalkar.
                        </Text>
                        <View style={{ alignSelf: 'stretch', marginTop: authMetrics.pinLockActionTop }}>
                            <AuthActionButton kind="secondary" label="Şifremi hatırlamıyorum" onPress={() => setPlate('forgot')} />
                        </View>
                    </View>
                ) : (
                    <>
                        <View style={{
                            flex: 1,
                            minHeight: 0,
                            paddingTop: small ? authMetrics.pinTopSmall : authMetrics.pinTop,
                            alignItems: 'center',
                        }}>
                            {identity && !(small && resetBand) ? (
                                <View style={{
                                    width: avatar,
                                    height: avatar,
                                    borderRadius: radius.pill,
                                    borderWidth: authMetrics.selectionAvatarBorder,
                                    borderColor: `${c.or}57`,
                                    backgroundColor: `${c.or}24`,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: small ? authMetrics.pinAvatarBottomSmall : authMetrics.pinAvatarBottom,
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
                            <SwapTitle text={title} slide={!ready} />
                            <View style={{ marginTop: small ? authMetrics.pinGapSmall : authMetrics.pinGap }}>
                                <PinDotRow length={pin.length} tone={dotTone} drainKey={String(stepKey)} />
                            </View>
                            <HintSlot text={hintText} tone={ready ? 'quiet' : hint?.tone ?? 'quiet'} />
                        </View>

                        <View style={{ opacity: verifying || ready ? authMetrics.pinKeypadDim : 1 }}>
                            <AuthKeypad onKey={keyPress} disabled={verifying || ready} />
                        </View>
                    </>
                )}

                <View style={{
                    paddingTop: authMetrics.pinHelpTop,
                    paddingHorizontal: authMetrics.keypadX,
                    paddingBottom: Math.max(insets.bottom, small ? authMetrics.pinHelpBottomSmall : authMetrics.pinHelpBottom),
                    alignItems: 'center',
                }}>
                    {mode === 'enter' && !locked ? (
                        <AuthTextLink quiet label="Şifremi hatırlamıyorum" onPress={() => setPlate('forgot')} />
                    ) : null}
                    {/* Yanlış satıra basan ya da telefonu değişen kişi için: liste.
                        Telefon işletmeye bağlı KALIR. */}
                    <AuthTextLink label="Ben değilim" onPress={notMe} />
                </View>
            </View>

            <BottomPlate
                visible={plate === 'forgot'}
                title="Müdürünüz sıfırlayabilir"
                body="Müdürünüz Luera’da Personel ekranından şifrenizi sıfırlar. Sonra bu ekranda yeni şifrenizi kendiniz belirlersiniz. Telefonunuz işletmeye bağlı kalır; yeni kod gerekmez."
                onDismiss={() => setPlate(null)}
            />
            <BottomPlate
                visible={plate === 'taken'}
                tone="teal"
                title="Bu kişinin şifresi az önce belirlendi"
                body="Başka bir telefonda bu kişi için şifre belirlendi. Siz belirlediyseniz o şifreyle girin; siz değilseniz müdürünüze söyleyin."
                onDismiss={() => { setPlate(null); goStep('enter'); }}
            />
        </View>
    );
}
