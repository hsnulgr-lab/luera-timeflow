import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    authApi,
    type AuthBusiness,
    type StaffRosterMember,
} from '../../../src/api/session';
import {
    AuthBackBar,
    AuthBanner,
    AuthHeader,
    AuthIdentityBar,
    AuthStaffRow,
} from '../../../src/components/ui';
import { authMetrics, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';

interface RosterView {
    business: AuthBusiness;
    staff: StaffRosterMember[];
}

export default function ChooseStaff() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [roster, setRoster] = useState<RosterView | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        authApi.staff.roster().then((result) => {
            if (!alive) return;
            if (!result.ok) {
                router.replace('/(auth)/staff/pair');
                return;
            }
            setRoster({
                business: result.data.business,
                staff: result.data.staff,
            });
        });
        return () => { alive = false; };
    }, [router]);

    const choose = async (staffId: string) => {
        if (busyId) return;
        setBusyId(staffId);
        setFailed(false);
        const result = await authApi.staff.select(staffId);
        setBusyId(null);
        // Başarısızlıkta eskiden HİÇBİR ŞEY olmuyordu: personel adına
        // dokunuyor, ekran duruyordu. Sessizce çalışmayan bir kontrol,
        // kullanıcıya uygulamanın bozuk olduğunu düşündürür.
        if (!result.ok) { setFailed(true); return; }
        router.push('/(auth)/staff/pin');
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <LightField profile="form" />
            {/* İşletme adı YOKSA kimlik bandı çizilmiyor, yalnız geri düğmesi.
                Sunucunun `roster` ucu işletme bilgisi dönmüyor ve istemci onu
                boş bir nesneyle dolduruyordu: ekranın tepesinde adı ve yeri
                olmayan boş bir şerit kalıyordu. Boş bir bant bilgi vermez,
                yalnız yer kaplar. */}
            {roster?.business.name ? (
                <AuthIdentityBar
                    title={roster.business.name}
                    subtitle={roster.business.location}
                    onBack={() => router.back()}
                />
            ) : (
                <AuthBackBar onPress={() => router.back()} />
            )}

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + authMetrics.staffListBottom }}
                showsVerticalScrollIndicator={false}
            >
                <AuthHeader selection title="Siz kimsiniz?" body="Listeden kendinizi seçin" />
                {roster ? (
                    // Plakalar arası 10 pt: aradan ışık alanı görünsün diye.
                    <View style={{
                        paddingHorizontal: authMetrics.selectionRowX,
                        gap: authMetrics.staffRowGap,
                    }}>
                        {roster.staff.map((member) => (
                            <AuthStaffRow
                                key={member.id}
                                member={member}
                                onPress={() => choose(member.id)}
                            />
                        ))}
                    </View>
                ) : null}
                {failed ? (
                    <AuthBanner kind="error" style={{ marginTop: authMetrics.businessInfoTop }}>
                        Seçim kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.
                    </AuthBanner>
                ) : null}
                <AuthBanner style={{ marginTop: authMetrics.businessInfoTop }}>
                    Listede yoksanız işletme sahibi sizi eklemeli.
                </AuthBanner>
            </ScrollView>
        </View>
    );
}
