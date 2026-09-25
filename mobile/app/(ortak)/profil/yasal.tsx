import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import {
    ExternalIcon,
    Group,
    ProfileNav,
    ProfileRow,
} from '../../../src/components/ProfileParts';
import { legalLinks } from '../../../src/lib/managerProfile';
import { readKvkkUrl } from '../../../src/lib/legalSource';
import { font, profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür 27 · Yasal.
 *
 * KVKK aydınlatma metni ürüne gömülü DEĞİL, org başına bir URL: veri
 * sorumlusu her salonun kendisidir, Luera yalnız veri işleyendir. Metin
 * salonun kendi beyanıdır — unvanı, adresi, saklama süresi kendi bilgileri.
 *
 * URL girilmemişse o satır PASİF DEĞİL, HİÇ ÇİZİLMEZ. Masaüstünden girilince
 * belirir.
 */
export default function ManagerLegal() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [kvkkUrl, setKvkkUrl] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let alive = true;
        void readKvkkUrl().then((url) => {
            if (!alive) return;
            setKvkkUrl(url);
            setLoaded(true);
        });
        return () => { alive = false; };
    }, []);

    const links = legalLinks(kvkkUrl);
    /**
     * Sürüm PAKETTEN okunuyor, `app.json`'dan DEĞİL.
     *
     * EAS derleme numarasını uzaktan yönetiyor (`appVersionSource: "remote"`):
     * `app.json`'daki `ios.buildNumber` YOK SAYILIYOR ama manifeste yazılmaya
     * devam ediyordu. Yani `Constants.expoConfig` donmuş bir sayı gösteriyordu.
     * 2026-09-26'da tam bunu yaptı: paket 2 iken ekran "1" diyordu ve fark her
     * derlemede büyüyecekti. Destek için işe yaramaz, üstelik ekran yalan söyler.
     *
     * `expo-application` yerel değerleri okuyor — imzalı pakette Info.plist'te
     * ne yazıyorsa o. Geliştirme kabuğunda yerel değer kabuğun kendisine ait
     * olabilir; o yüzden yapılandırma yedekte duruyor.
     */
    const version = Application.nativeApplicationVersion
        ?? Constants.expoConfig?.version
        ?? null;
    const build = Application.nativeBuildVersion ?? null;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Yasal" onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingBottom: M.bottomInset,
                    gap: 10,
                }}
            >
                {loaded ? (
                    <Group>
                        {links.map((link, index) => (
                            <ProfileRow
                                key={link.key}
                                first={index === 0}
                                chevron={false}
                                title={link.label}
                                value={link.host}
                                right={<ExternalIcon color={c.tx3} />}
                                onPress={() => { void Linking.openURL(link.url); }}
                            />
                        ))}
                    </Group>
                ) : null}

                {/* Sürüm bandı burada, ANA EKRANDA değil. */}
                {version ? (
                    <Text style={{
                        paddingHorizontal: 4,
                        color: c.tx3,
                        fontSize: M.footText,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                    }}>
                        {`TimeFlow ${version}${build ? ` (${build})` : ''}`}
                    </Text>
                ) : null}
            </ScrollView>
        </View>
    );
}
