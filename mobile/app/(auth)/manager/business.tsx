import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi, type AuthBusiness } from '../../../src/api/session';
import {
    AuthBackBar,
    AuthBanner,
    AuthBusinessRow,
    AuthField,
    AuthHeader,
    AuthPage,
    AuthTextLink,
} from '../../../src/components/ui';
import { authMetrics, useTheme } from '../../../src/theme';

export default function ManagerBusiness() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { c } = useTheme();
    const [businesses, setBusinesses] = useState<AuthBusiness[]>([]);
    const [query, setQuery] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        authApi.manager.businesses().then(async (result) => {
            if (!alive) return;
            if (!result.ok) {
                router.replace('/(auth)/manager/sign-in');
                return;
            }
            if (result.data.length === 1) {
                const selected = await authApi.manager.selectBusiness(result.data[0].id);
                if (!alive) return;
                if (!selected.ok && selected.error === 'subscription_inactive') {
                    router.replace('/(auth)/locked');
                    return;
                }
                if (selected.ok) router.replace('/(auth)/biometric');
                return;
            }
            setBusinesses(result.data);
        });
        return () => { alive = false; };
    }, [router]);

    const visible = useMemo(() => {
        const value = query.trim().toLocaleLowerCase('tr-TR');
        if (!value) return businesses;
        return businesses.filter((business) =>
            `${business.name} ${business.location}`.toLocaleLowerCase('tr-TR').includes(value));
    }, [businesses, query]);

    const select = async (business: AuthBusiness) => {
        if (busyId) return;
        setBusyId(business.id);
        const result = await authApi.manager.selectBusiness(business.id);
        setBusyId(null);
        if (!result.ok && result.error === 'subscription_inactive') {
            router.replace('/(auth)/locked');
            return;
        }
        if (result.ok) router.push('/(auth)/biometric');
    };

    /*
     * Geri düğmesi GİDİLECEK YER OLDUĞUNDA geri gider.
     *
     * Bu ekrana `replace` ile de gelinebiliyor (açılış yönlendirmesi, salon
     * okunamayınca girişe düşme): o durumda geçmiş boş olur ve `back()`
     * hiçbir şey yapmadan "GO_BACK was not handled" uyarısı bırakır — yani
     * ekranda kapısı olmayan bir düğme durur. Karşılama ekranı her zaman var.
     */
    const leave = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/(auth)/welcome');
    };

    return (
        <AuthPage contentStyle={{ paddingBottom: Math.max(insets.bottom, authMetrics.businessBottom) }}>
            <AuthBackBar onPress={leave} />
            <AuthHeader
                selection
                title="Hangi işletme?"
                body="Sonra üst çubuktan değiştirebilirsiniz"
            />
            {businesses.length > authMetrics.searchThreshold ? (
                <View style={{ paddingHorizontal: authMetrics.formX, paddingBottom: authMetrics.formGap }}>
                    <AuthField
                        label="Ara"
                        value={query}
                        onChangeText={setQuery}
                        returnKeyType="search"
                    />
                </View>
            ) : null}
            <View style={{ borderTopWidth: 1, borderTopColor: c.bd }}>
                {visible.map((business) => (
                    <View key={business.id} pointerEvents={busyId ? 'none' : 'auto'}>
                        <AuthBusinessRow business={business} onPress={() => select(business)} />
                    </View>
                ))}
            </View>
            <AuthBanner style={{ marginTop: authMetrics.businessInfoTop }}>
                Aboneliği bitmiş bir işletme listede kalır, açılınca ne olduğunu söyler.
            </AuthBanner>
            <View style={{ flex: 1 }} />
            <AuthTextLink
                label="Yeni işletme oluştur"
                onPress={() => router.push('/(auth)/signup/account')}
            />
        </AuthPage>
    );
}
