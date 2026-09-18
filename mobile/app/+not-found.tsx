import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi } from '../src/api/session';
import { AuthActionButton } from '../src/components/ui';
import { LightField } from '../src/components/LightField';
import { LueraTimeflowMark } from '../src/components/BrandMark';
import { notFoundCopy, type NotFoundRole } from '../src/lib/notFound';
import { authMetrics, font, useTheme } from '../src/theme';

/**
 * Apple Eşiği · D — bulunamadı.
 *
 * Önceden expo-router'ın çıplak İngilizce "Unmatched Route" ekranı çıkıyordu.
 * Kişi bir yere gitmek istedi, orası yok: TEK ÇIKIŞ veriliyor — iki eşit
 * düğme kaybolmuş birine ikinci bir karar vermek olurdu. "404", "route",
 * "hata kodu" geçmiyor; cümle kişinin yaptığını değil bağlantının hâlini
 * anlatıyor.
 *
 * ── Dil oturumdan geliyor ───────────────────────────────────────────────────
 * İçerideyken (geri yığını var, rol biliniyor) uygulamanın opak dili ve
 * rolün ana ekranı: müdür → Akış, personel → Bugün. Dışarıdaysa ışık alanı
 * ve cam, çıkış ilk ekran. Soğuk açılan bir bağlantı doğrudan Akış'a
 * GÖTÜRMÜYOR: ilk ekran oturum kapısından (Face ID / şifre) geçiriyor.
 */
export default function NotFound() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c } = useTheme();
    const [role, setRole] = useState<NotFoundRole | null>(null);

    useEffect(() => {
        let alive = true;
        const inside = router.canGoBack();
        authApi.getLaunchState()
            .then((launch) => {
                if (!alive) return;
                const actor = launch.target === 'resume' ? launch.session.actor : null;
                setRole(inside && actor ? actor : 'outside');
            })
            .catch(() => { if (alive) setRole('outside'); });
        return () => { alive = false; };
    }, [router]);

    if (!role) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const copy = notFoundCopy(role);
    const outside = role === 'outside';

    return (
        <View style={{
            flex: 1,
            backgroundColor: c.bg,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom + authMetrics.actionsGap, authMetrics.noSafeAreaBottom),
        }}>
            {outside ? <LightField profile="lock" /> : null}

            <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 26 }}>
                {outside ? <LueraTimeflowMark size={26} animate={false} /> : null}
                <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
                    <Text
                        accessibilityRole="header"
                        style={{
                            color: c.tx,
                            fontSize: 29,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: 29 * -0.03,
                        }}
                    >
                        {copy.title}
                    </Text>
                    <Text style={{
                        color: c.tx2,
                        fontSize: 16,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        lineHeight: 16 * 1.5,
                    }}>
                        {copy.body}
                    </Text>
                </View>
            </View>

            <View style={{ paddingHorizontal: authMetrics.actionsX }}>
                <AuthActionButton
                    kind="primary"
                    label={copy.action}
                    onPress={() => router.replace(copy.href)}
                />
            </View>
        </View>
    );
}
