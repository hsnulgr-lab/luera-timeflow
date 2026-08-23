import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthChoiceButton, AuthTextLink, LueraMark, T } from '../../src/components/ui';
import { authMetrics, font, glow, space, type, useTheme } from '../../src/theme';

export default function Welcome() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c, dark, small } = useTheme();
    const pageX = small ? authMetrics.welcomePageXSmall : authMetrics.welcomePageX;
    const choiceGap = small
        ? authMetrics.welcomeChoiceGapSmall
        : authMetrics.welcomeChoiceGap;
    const bottom = Math.max(
        insets.bottom,
        small ? authMetrics.welcomeBottomSmall : authMetrics.welcomeBottom,
    );

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <LinearGradient
                pointerEvents="none"
                colors={dark ? glow.dark : glow.light}
                locations={glow.locations}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: glow.height,
                }}
            />

            <View style={{
                flex: 1,
                paddingTop: insets.top,
                paddingBottom: bottom,
            }}>
                <View style={{
                    paddingTop: small
                        ? authMetrics.welcomeBrandTopSmall
                        : authMetrics.welcomeBrandTop,
                    paddingHorizontal: authMetrics.welcomeBrandX,
                    gap: space.md,
                }}>
                    <LueraMark />
                    <T
                        c={c.tx2}
                        style={{
                            maxWidth: authMetrics.welcomeTaglineWidth,
                            fontSize: type.h3.fontSize,
                            fontFamily: font.medium,
                            lineHeight: type.h3.fontSize * 1.45,
                            fontWeight: '500',
                            letterSpacing: 0,
                        }}
                    >
                        Salonunuzun randevuları, kasası ve ekibi tek yerde.
                    </T>
                </View>

                <View style={{ flex: 1 }} />

                <View style={{ paddingHorizontal: pageX, gap: choiceGap }}>
                    <AuthChoiceButton
                        title="İşletmemi yönetiyorum"
                        subtitle="E-posta ve şifrenizle girin"
                        onPress={() => router.push('/(auth)/manager/sign-in')}
                    />
                    <AuthChoiceButton
                        title="Burada çalışıyorum"
                        subtitle="İşletmeden aldığınız kodla girin"
                        onPress={() => router.push('/(auth)/staff/pair')}
                    />
                    <Text style={{
                        color: c.tx3,
                        paddingTop: authMetrics.welcomeHelperTop,
                        textAlign: 'center',
                        fontSize: small
                            ? authMetrics.welcomeHelperSizeSmall
                            : authMetrics.welcomeHelperSize,
                        fontWeight: '500',
                    }}>
                        Sonradan değiştirebilirsiniz.
                    </Text>
                    <AuthTextLink
                        label="Yeni işletme oluştur"
                        onPress={() => router.push('/(auth)/signup/account')}
                    />
                </View>
            </View>
        </View>
    );
}
