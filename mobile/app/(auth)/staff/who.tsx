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
    AuthBanner,
    AuthHeader,
    AuthIdentityBar,
    AuthStaffRow,
} from '../../../src/components/ui';
import { authMetrics, useTheme } from '../../../src/theme';

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
        const result = await authApi.staff.select(staffId);
        setBusyId(null);
        if (result.ok) router.push('/(auth)/staff/pin');
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            {roster ? (
                <AuthIdentityBar
                    title={roster.business.name}
                    subtitle={roster.business.location}
                    onBack={() => router.back()}
                />
            ) : <View style={{ height: authMetrics.topBarHeight }} />}

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + authMetrics.staffListBottom }}
                showsVerticalScrollIndicator={false}
            >
                <AuthHeader selection title="Siz kimsiniz?" body="Listeden kendinizi seçin" />
                {roster ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: c.bd }}>
                        {roster.staff.map((member) => (
                            <AuthStaffRow
                                key={member.id}
                                member={member}
                                onPress={() => choose(member.id)}
                            />
                        ))}
                    </View>
                ) : null}
                <AuthBanner style={{ marginTop: authMetrics.businessInfoTop }}>
                    Listede yoksanız işletme sahibi sizi eklemeli.
                </AuthBanner>
            </ScrollView>
        </View>
    );
}
