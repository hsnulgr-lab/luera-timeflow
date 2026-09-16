import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { enterShell } from '../../src/lib/enterShell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { authApi, type AuthSession } from '../../src/api/session';
import { businessLine } from '../../src/lib/accountMap';
import { AuthActionButton, LueraMark } from '../../src/components/ui';
import { authMetrics, font, radius, useTheme } from '../../src/theme';
import { FaceRing, type FaceState } from '../../src/components/FaceRing';
import { LightField } from '../../src/components/LightField';

function FaceIdIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.faceIdIcon}
            height={authMetrics.faceIdIcon}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M4 8.6V5.8A1.8 1.8 0 0 1 5.8 4h2.8M20 8.6V5.8A1.8 1.8 0 0 0 18.2 4h-2.8M4 15.4v2.8A1.8 1.8 0 0 0 5.8 20h2.8M20 15.4v2.8a1.8 1.8 0 0 1-1.8 1.8h-2.8M9.2 9.6v2.2M14.8 9.6v2.2M12 9.6v3.6h-1.2M9.4 15.6a3.9 3.9 0 0 0 5.2 0"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** Tanınma anında yüzün yerini alan onay. */
function TickIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.faceIdIcon}
            height={authMetrics.faceIdIcon}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="m5 12.5 4.5 4.5L19 7.5"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export default function ResumeSignIn() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [session, setSession] = useState<AuthSession | null>(null);
    const [busy, setBusy] = useState(false);
    const [face, setFace] = useState<FaceState>('idle');
    const biometricFailures = useRef(0);

    const enterApp = (next: AuthSession) => {
        // Geçmişi silerek: bkz. `src/lib/enterShell.ts`.
        enterShell(next.actor);
    };

    const openFallback = async () => {
        const result = await authApi.resume.prepareFallback();
        if (!result.ok) {
            router.replace(result.error === 'not_paired'
                ? '/(auth)/staff/pair'
                : '/(auth)/welcome');
            return;
        }
        router.replace(result.data.actor === 'manager'
            ? '/(auth)/manager/sign-in'
            : '/(auth)/staff/pin');
    };

    useEffect(() => {
        let alive = true;
        authApi.resume.get().then((result) => {
            if (!alive) return;
            if (!result.ok && result.error === 'subscription_inactive') {
                router.replace('/(auth)/locked');
                return;
            }
            if (!result.ok) {
                router.replace('/(auth)/welcome');
                return;
            }
            if (!result.data.biometricEnabled) {
                void openFallback();
                return;
            }
            setSession(result.data);
        });
        return () => { alive = false; };
        // openFallback only delegates to the stable auth seam and router.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const authenticate = async () => {
        if (busy) return;
        setBusy(true);
        const result = await authApi.biometric.authenticate();
        setBusy(false);
        if (result.ok) {
            biometricFailures.current = 0;
            // Kutlama alanda yaşıyor, arayüzde değil — ve 200 ms'yi geçmiyor.
            // Geçtiği an kutlama değil gecikme olur.
            setFace('ok');
            setTimeout(() => enterApp(result.data), 200);
            return;
        }
        setFace('bad');
        biometricFailures.current += 1;
        if (biometricFailures.current >= 2) { await openFallback(); return; }
        // Halka iki saniye sonra kendiliğinden nötre döner: hata bir hâl,
        // bir damga değil.
        setTimeout(() => setFace('idle'), 2000);
    };

    const unlinkPhone = async () => {
        setBusy(true);
        await authApi.staff.unlinkDevice();
        router.replace('/(auth)/staff/pair');
    };

    const changeAccount = async () => {
        if (!session || busy) return;
        if (session.actor === 'staff') {
            // ONAY İSTİYOR. "Bu telefon benim değil" telefonu işletmeden
            // ÇIKARIYOR: eşleşme siliniyor ve geri dönmek için işletme
            // sahibinden yeni bir kod almak gerekiyor. Geri alınamayan bir
            // işlem tek dokunuşta duruyordu ve kazayla basılıyordu —
            // uygulamayı denerken defalarca buna takıldık.
            //
            // Etiket doğru, eylem doğru; eksik olan SORMAKTI.
            Alert.alert(
                'Bu telefonu işletmeden çıkaralım mı?',
                'Bağlantı silinir ve geri dönmek için işletme sahibinden yeni bir kod istemeniz gerekir. Yalnız oturumu kapatmak istiyorsanız bunu seçmeyin.',
                [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Telefonu çıkar', style: 'destructive', onPress: () => { void unlinkPhone(); } },
                ],
            );
            return;
        }
        setBusy(true);
        await authApi.resume.signOut();
        router.replace('/(auth)/welcome');
    };

    if (!session) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const { profile } = session;
    return (
        <View style={{
            flex: 1,
            paddingTop: insets.top,
            paddingBottom: Math.max(
                insets.bottom + authMetrics.actionsGap,
                authMetrics.noSafeAreaBottom,
            ),
            backgroundColor: c.bg,
        }}>
            {/* Kilit ekranı: iki kütle, iki buçuk kat yavaş, bulanıklık 76. */}
            <LightField profile="lock" />

            <View style={{
                flex: 0,
                paddingTop: authMetrics.resumeMarkTop,
                paddingHorizontal: authMetrics.resumeMarkX,
                alignItems: 'center',
            }}>
                <LueraMark resume />
            </View>

            <View style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: authMetrics.resumeHeroGap,
                paddingHorizontal: authMetrics.biometricHeroX,
            }}>
                <View style={{
                    width: authMetrics.resumeAvatar,
                    height: authMetrics.resumeAvatar,
                    borderRadius: radius.pill,
                    borderWidth: authMetrics.selectionAvatarBorder,
                    borderColor: c.bd2,
                    backgroundColor: c.surf2,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: authMetrics.resumeAvatarText,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: authMetrics.resumeAvatarText * -0.02,
                    }}>
                        {profile.initials}
                    </Text>
                </View>

                <View style={{ alignItems: 'center', gap: authMetrics.resumeIdentityGap }}>
                    <Text
                        numberOfLines={1}
                        style={{
                            color: c.tx,
                            fontSize: authMetrics.resumeNameSize,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: authMetrics.resumeNameSize * -0.035,
                        }}
                    >
                        {profile.name}
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={{
                            color: c.tx2,
                            fontSize: authMetrics.resumeBusinessSize,
                            fontFamily: font.medium,
                            fontWeight: '500',
                        }}
                    >
                        {businessLine(profile.business)}
                    </Text>
                </View>

                <FaceRing
                    state={face}
                    disabled={busy}
                    onPress={authenticate}
                >
                    {face === 'ok'
                        ? <TickIcon color={c.or} />
                        : <FaceIdIcon color={face === 'bad' ? c.rd : c.tx} />}
                </FaceRing>
                <Text style={{
                    color: face === 'bad' ? c.rd : c.tx2,
                    fontSize: authMetrics.resumePromptSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                }}>
                    {face === 'ok' ? 'Hoş geldiniz'
                        : face === 'bad' ? 'Tanınmadı. Halkaya dokunup tekrar deneyin.'
                        : 'Girmek için bakın'}
                </Text>
            </View>

            <View style={{
                paddingHorizontal: authMetrics.actionsX,
                gap: authMetrics.actionsGap,
                // 90 → 200 ms: ekran devredilirken alt eylemler geri çekilir.
                opacity: face === 'ok' ? 0.35 : 1,
            }}>
                <AuthActionButton
                    kind="secondary"
                    label={session.actor === 'manager' ? 'Şifreyle gir' : 'PIN ile gir'}
                    disabled={busy}
                    onPress={openFallback}
                />
                <AuthActionButton
                    kind="ghost"
                    label={session.actor === 'manager' ? 'Oturumu değiştir' : 'Bu telefon benim değil'}
                    disabled={busy}
                    onPress={changeAccount}
                />
            </View>
        </View>
    );
}
