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

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi } from '../../src/api/session';
import { AuthChoiceButton, AuthTextLink, T } from '../../src/components/ui';
import { LueraTimeflowMark } from '../../src/components/BrandMark';
import { AView, useEntrance } from '../../src/components/Entrance';
import { LightField } from '../../src/components/LightField';
import { GlassPlate } from '../../src/components/GlassPlate';
import { Glyph } from '../../src/components/Glyph';
import { DELETED_NOTICE_MS, deletedNotice, type DeletedNotice } from '../../src/lib/deletedNotice';
import { hideSplash, takeSplashHandoff } from '../../src/lib/splashHandoff';
import { authMetrics, font, space, type, useTheme } from '../../src/theme';

// Görüntüler `scripts/render-splash.swift` çıktısı; `app.json`daki sistem
// karesiyle AYNI dosyalar.
const SPLASH = {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    dark: require('../../assets/splash-dark.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    light: require('../../assets/splash-light.png'),
};
/** Splash kopyasının solması — `authMotion` ekran ileri süresi. */
const HANDOFF_MS = 240;

/**
 * Sistem karesinin JS'deki ikizi. Aynı görüntü, aynı `cover`: çizildiği an
 * sistem karesi kaldırılıyor ve fark görünmüyor. Sonra solup altındaki canlı
 * karşılamayı açıyor. Neden gerekli: `src/lib/splashHandoff.ts`.
 */
function SplashTwin({ dark, still }: { dark: boolean; still: boolean }) {
    const fade = useSharedValue(1);
    const [gone, setGone] = useState(false);
    const style = useAnimatedStyle(() => ({ opacity: fade.value }));
    useEffect(() => {
        if (!gone) return;
        // reanimated'in paylaşılan değeri; kural bu yazımı tanımıyor.
        // eslint-disable-next-line react-hooks/immutability
        fade.value = withTiming(0, { duration: still ? 0 : HANDOFF_MS });
    }, [gone, still, fade]);
    return (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
            <Image
                source={dark ? SPLASH.dark : SPLASH.light}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
                onLoad={() => { hideSplash(); setGone(true); }}
                onError={() => { hideSplash(); setGone(true); }}
            />
        </Animated.View>
    );
}

/**
 * Apple Eşiği · B — silme bittikten sonra olan biteni söyleyen cam plaka.
 * Geliş 240 ms, 6 s durur, çıkış 240 ms; dokununca hemen kapanır. Yeşil
 * yalnız küçük onay halkasında — "tebrikler" tonu yok.
 */
function DeletedPlate({ notice, top, still }: {
    notice: DeletedNotice;
    top: number;
    still: boolean;
}) {
    const { c } = useTheme();
    const [open, setOpen] = useState(true);
    const shown = useSharedValue(0);
    const style = useAnimatedStyle(() => ({
        opacity: shown.value,
        transform: [{ translateY: still ? 0 : -12 * (1 - shown.value) }],
    }));
    useEffect(() => {
        // eslint-disable-next-line react-hooks/immutability
        shown.value = withSequence(
            withTiming(1, { duration: still ? 0 : HANDOFF_MS }),
            withDelay(DELETED_NOTICE_MS, withTiming(0, { duration: HANDOFF_MS })),
        );
        // Solma bitince ağaçtan da çıksın — dokunulamaz bir cam kalmasın.
        const id = setTimeout(() => setOpen(false), DELETED_NOTICE_MS + HANDOFF_MS * 2);
        return () => clearTimeout(id);
    }, [shown, still]);
    if (!open) return null;
    return (
        <Animated.View style={[{ position: 'absolute', top, left: 14, right: 14 }, style]}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${notice.title}. ${notice.body}`}
                accessibilityHint="Kapatmak için dokunun"
                onPress={() => setOpen(false)}
            >
                <GlassPlate radius={20} style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                        <View style={{
                            width: 26, height: 26, borderRadius: 13,
                            borderWidth: 1.5, borderColor: c.gr,
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Glyph name="check" size={15} color={c.gr} />
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                            <Text style={{
                                color: c.tx, fontSize: 16, fontFamily: font.extraBold, fontWeight: '800',
                            }}>
                                {notice.title}
                            </Text>
                            <Text style={{
                                color: c.tx2, fontSize: 14, fontFamily: font.semiBold, fontWeight: '600',
                                lineHeight: 14 * 1.45,
                            }}>
                                {notice.body}
                            </Text>
                        </View>
                    </View>
                </GlassPlate>
            </Pressable>
        </Animated.View>
    );
}

export default function Welcome() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c, small, dark, reduceMotion } = useTheme();
    // Soğuk açılışta sistem karesi buraya devrediliyor — bir kez.
    const [handoff] = useState(takeSplashHandoff);
    // Hesap silme buraya düşüyor; plaka yalnız sunucu onayından sonra gelir.
    const { gone } = useLocalSearchParams<{ gone?: string }>();
    const notice = deletedNotice(gone);
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
                        from={handoff ? 'dot' : 'start'}
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
                            // Telefon ZATEN bağlıysa kod istenmez (099): çıkış
                            // yapıp geri gelen personel her seferinde kod
                            // ekranına düşüyordu — "sürekli eşleşmiyor"un sebebi.
                            onPress={() => {
                                void authApi.staff.entry().then((entry) => {
                                    router.push(entry === 'pin'
                                        ? '/(auth)/staff/pin'
                                        : entry === 'who' ? '/(auth)/staff/who' : '/(auth)/staff/pair');
                                });
                            }}
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

            {notice ? (
                <DeletedPlate notice={notice} top={insets.top + 66} still={reduceMotion} />
            ) : null}

            {handoff ? <SplashTwin dark={dark} still={reduceMotion} /> : null}
        </View>
    );
}
