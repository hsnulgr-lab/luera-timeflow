/**
 * Giriş v3 · Karşılama.
 *
 * Ömürde BİR KEZ görülüyor — gösterinin tamamı burada. Marka üstte ve ağır,
 * ışık alanı ortada ve canlı, iki cam kapı altta.
 *
 * Ortadaki 600 pt artık boş değil ama DOLU DA DEĞİL: oraya bir kart koymak
 * yerine alanı bırakmak bilinçli. Kullanıcının gözü markadan iki kapıya
 * inerken hiçbir şey onu durdurmuyor — alan gözü tutmuyor, ortamı kuruyor.
 * Ürünün parçası (randevu kartı, personel halkası) da yok: kullanıcı henüz
 * içeri girmedi, ona işini göstermek erken.
 *
 * Koreografi `Entrance.tsx`'te, alanın kendisi `LightField.tsx`'te.
 */

import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthChoiceButton, AuthTextLink, T } from '../../src/components/ui';
import { LueraTimeflowMark } from '../../src/components/BrandMark';
import { AView, useEntrance } from '../../src/components/Entrance';
import { LightField } from '../../src/components/LightField';
import { authMetrics, font, space, type, useTheme } from '../../src/theme';

export default function Welcome() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c, small } = useTheme();
    const pageX = small ? authMetrics.welcomePageXSmall : authMetrics.welcomePageX;
    const choiceGap = small
        ? authMetrics.welcomeChoiceGapSmall
        : authMetrics.welcomeChoiceGap;
    const bottom = Math.max(
        insets.bottom,
        small ? authMetrics.welcomeBottomSmall : authMetrics.welcomeBottom,
    );

    const tagline = useEntrance('tagline');
    const door1 = useEntrance('door1');
    const door2 = useEntrance('door2');
    const foot = useEntrance('foot');

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Alan sıfırıncı saniyede zaten orada — doğmuyor, olgunlaşıyor. */}
            <LightField profile="welcome" intro />

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
                    {/* Marka kendi koreografisini taşıyor: kelime gelir,
                        nokta patlar, hap açılır, "timeflow" belirir. Bu yüzden
                        `Entrance`'ın marka ve nokta adımları burada YOK. */}
                    <LueraTimeflowMark
                        size={small
                            ? authMetrics.welcomeBrandSizeSmall
                            : authMetrics.welcomeBrandSize}
                        animate
                    />
                    <AView style={tagline}>
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
                    </AView>
                </View>

                <View style={{ flex: 1 }} />

                <View style={{ paddingHorizontal: pageX, gap: choiceGap }}>
                    <AView style={door1}>
                        <AuthChoiceButton
                            glyph="shop"
                            title="İşletmemi yönetiyorum"
                            subtitle="E-posta ve şifrenizle girin"
                            onPress={() => router.push('/(auth)/manager/sign-in')}
                        />
                    </AView>
                    <AView style={door2}>
                        <AuthChoiceButton
                            glyph="person"
                            title="Burada çalışıyorum"
                            subtitle="İşletmeden aldığınız kodla girin"
                            onPress={() => router.push('/(auth)/staff/pair')}
                        />
                    </AView>
                    <AView style={foot}>
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
                    </AView>
                </View>
            </View>
        </View>
    );
}
