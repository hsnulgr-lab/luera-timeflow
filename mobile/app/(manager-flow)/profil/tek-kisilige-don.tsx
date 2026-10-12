import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Foot, Group, PrimaryButton, ProfileNav } from '../../../src/components/ProfileParts';
import { authApi } from '../../../src/api/session';
import { teamEnd, teamEndNotice, teamEndProblem } from '../../../src/lib/authCopy';
import { enterShell } from '../../../src/lib/enterShell';
import { feedback } from '../../../src/lib/feedback';
import { upperTR } from '../../../src/lib/text';
import { font, profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * İşletme › Tek kişiliğe dön — Ekip ekle kapısının öbür yönü (115).
 *
 * Satır İşletme'de yalnız ekipte sahipten başka aktif kimse kalmayınca
 * çiziliyor. Ekip ekle'nin dili: önce neyin değişeceği, sonra tek düğme.
 * Form yok — sorulacak bir şey yok.
 *
 * Sunucu tek işlemde bayrağı çeviriyor ve ayrılan çalışanların ileri
 * randevularını kalan kişiye geçiriyor (`end_team`). Hepsi geçtiyse ekran
 * doğrudan Gün'e geçiyor; kimseye atanamayan ya da başlamış bir işleme bağlı
 * kalan randevu varsa kişi önce bunu okuyor, düğme "Gün’e geç" oluyor.
 */
export default function TeamEnd() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const submit = async () => {
        if (busy) return;
        if (notice) {
            enterShell('manager', true);
            return;
        }
        setBusy(true);
        setProblem(null);
        const result = await authApi.team.end();
        if (result.ok) {
            feedback.success();
            const next = teamEndNotice(result.data.counts);
            if (!next) {
                // Kabuk değişiyor: geçmiş siliniyor ve tek kişilik kabuk Gün'le açılıyor.
                enterShell('manager', true);
                return;
            }
            setNotice(next);
            setBusy(false);
            return;
        }
        feedback.error();
        setProblem(teamEndProblem(result.error));
        setBusy(false);
    };

    const body = { color: c.tx2, fontSize: 13.5, lineHeight: 19, fontFamily: font.semiBold, fontWeight: '600' as const };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title={teamEnd.title} onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: M.padX, paddingBottom: M.bottomInset, gap: 10 }}
            >
                <Group head={upperTR(teamEnd.changeHead)}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14 }}>
                        <Text style={body}>{teamEnd.change}</Text>
                    </View>
                </Group>

                <Group head={upperTR(teamEnd.appointmentsHead)}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14, gap: 12 }}>
                        <Text style={body}>{teamEnd.appointments}</Text>

                        {problem || notice ? (
                            <Text
                                accessibilityLiveRegion="polite"
                                style={{ color: notice ? c.am : c.rd, fontSize: 13, lineHeight: 18, fontFamily: font.bold, fontWeight: '700' }}
                            >
                                {notice ?? problem}
                            </Text>
                        ) : null}

                        <PrimaryButton
                            label={notice ? teamEnd.enterSolo : busy ? teamEnd.busy : teamEnd.action}
                            disabled={busy}
                            onPress={() => { void submit(); }}
                        />
                    </View>
                </Group>

                <Foot>{teamEnd.foot}</Foot>
            </ScrollView>
        </View>
    );
}
