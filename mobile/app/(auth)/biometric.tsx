import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { enterShell } from '../../src/lib/enterShell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { authApi, type AuthResult, type AuthSession } from '../../src/api/session';
import { AuthActionButton } from '../../src/components/ui';
import { authMetrics, font, radius, type, useTheme } from '../../src/theme';

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

export default function BiometricOffer() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const finish = (result: AuthResult<AuthSession>) => {
        setBusy(false);
        if (!result.ok) {
            router.replace('/(auth)/welcome');
            return;
        }
        // Kabuğa girerken geçmiş siliniyor: aksi hâlde bir önceki oturumun
        // kabuğu yığında kalıyor ve geri kaydırınca öteki rol çıkıyor.
        enterShell(result.data.actor);
    };

    const enable = async () => {
        if (busy) return;
        setBusy(true);
        finish(await authApi.biometric.enable());
    };

    const skip = async () => {
        if (busy) return;
        setBusy(true);
        finish(await authApi.biometric.skip());
    };

    return (
        <View style={{
            flex: 1,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, authMetrics.biometricActionsBottom),
            backgroundColor: c.bg,
        }}>
            <View style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: authMetrics.biometricHeroX,
                gap: authMetrics.biometricHeroGap,
            }}>
                <View style={{
                    width: authMetrics.faceIdRing,
                    height: authMetrics.faceIdRing,
                    borderRadius: radius.pill,
                    borderWidth: authMetrics.iconStroke,
                    borderColor: c.or,
                    backgroundColor: `${c.or}14`,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <FaceIdIcon color={c.or2} />
                </View>
                <Text style={{
                    color: c.tx,
                    textAlign: 'center',
                    fontSize: authMetrics.heroTitle,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: authMetrics.heroTitle * -0.035,
                    lineHeight: authMetrics.heroTitle * 1.14,
                }}>
                    Bir dahaki sefere{`\n`}Face ID ile açalım mı?
                </Text>
                <Text style={{
                    color: c.tx2,
                    textAlign: 'center',
                    fontSize: type.body.fontSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                    lineHeight: type.body.fontSize * authMetrics.heroBodyLine,
                }}>
                    Şifrenizi her açılışta yazmak zorunda kalmazsınız. Telefonunuzu tanıdıktan sonra tek bakışta girer.
                </Text>
            </View>

            <View style={{
                paddingHorizontal: authMetrics.biometricActionsX,
                gap: authMetrics.biometricActionsGap,
            }}>
                <AuthActionButton
                    label="Face ID’yi aç"
                    disabled={busy}
                    onPress={enable}
                />
                <AuthActionButton
                    kind="secondary"
                    label="Şimdi değil"
                    disabled={busy}
                    onPress={skip}
                />
                <Text style={{
                    paddingTop: authMetrics.biometricNoteTop,
                    color: c.tx3,
                    textAlign: 'center',
                    fontSize: authMetrics.biometricNoteSize,
                    fontFamily: font.medium,
                    fontWeight: '500',
                }}>
                    Bunu daha sonra Profil’den de açabilirsiniz.
                </Text>
            </View>
        </View>
    );
}
