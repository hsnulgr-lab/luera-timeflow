import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    CheckIcon,
    Foot,
    Group,
    ProfileNav,
    ProfileRow,
} from '../../../src/components/ProfileParts';
import { THEME_FOOT, THEME_OPTIONS } from '../../../src/lib/managerProfile';
import { upperTR } from '../../../src/lib/text';
import { profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür 27 · Görünüm.
 *
 * Tercih gerçekten uygulanır ve kalıcıdır — sağlayıcıda saklanır. Seçim
 * yapılıp hiçbir şeyin değişmediği bir ekran ölü kontroldür.
 *
 * Geçiş iki yüzeyin çapraz solmasıyla olur; renk animasyonu yok.
 */
export default function ManagerAppearance() {
    const { c, themeMode, setThemeMode } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Görünüm" onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingBottom: M.bottomInset,
                    gap: 10,
                }}
            >
                <Group head={upperTR('Tema')}>
                    {THEME_OPTIONS.map((option, index) => (
                        <ProfileRow
                            key={option.key}
                            first={index === 0}
                            chevron={false}
                            title={option.label}
                            onPress={() => setThemeMode(option.key)}
                            right={option.key === themeMode
                                ? <CheckIcon color={c.or} size={18} />
                                : undefined}
                        />
                    ))}
                </Group>

                <Foot>{THEME_FOOT}</Foot>
            </ScrollView>
        </View>
    );
}
