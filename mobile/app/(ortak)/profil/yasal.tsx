import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    const version = Constants.expoConfig?.version ?? null;
    const build = Constants.expoConfig?.ios?.buildNumber
        ?? Constants.expoConfig?.android?.versionCode
        ?? null;

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
                        {`Luera ${version}${build ? ` (${build})` : ''}`}
                    </Text>
                ) : null}
            </ScrollView>
        </View>
    );
}
