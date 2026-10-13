import { useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Foot, Group, PrimaryButton, ProfileNav } from '../../../src/components/ProfileParts';
import { TeamField } from '../../../src/components/TeamField';
import { TEAM_NAME_MAX, teamStart } from '../../../src/lib/authCopy';
import { addStaffMember } from '../../../src/lib/managerWrite';
import { addProblem, staffAdd } from '../../../src/lib/teamAdd';
import { feedback } from '../../../src/lib/feedback';
import { upperTR } from '../../../src/lib/text';
import { font, profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * İşletme › Personel › Personel ekle (2026-10-13).
 *
 * Personel sayfası "Personel eklemek bilgisayardan" diyordu; tek kişilikten
 * ekibe geçen sahibin bilgisayarı yok. Form Ekip ekle'nin yeni çalışan
 * kartının AYNISI (ad soyad + meslek, aynı alanlar ve aynı sınır): iki
 * kapıdan eklenen kişi aynı satır. Rol ve renk sunucunun `start_team`
 * kuralıyla (`teamAdd.ts`); çalışma saati işletmenin, şifreyi kişi Telefon
 * bağla ile kendisi belirliyor.
 *
 * Eklenince sayfa kapanıyor; Personel listesi `staff` tablosunu dinlediği
 * için yeni satır kendiliğinden düşüyor. Hata hâlinde cümle düğmenin
 * üstünde ve kimsenin eklenmediğini söylüyor.
 */
export default function StaffAdd() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const specialtyRef = useRef<TextInput>(null);

    const [name, setName] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const ready = name.trim().length > 0;

    const submit = async () => {
        if (busy || !ready) return;
        setBusy(true);
        setProblem(null);
        const result = await addStaffMember({ name, specialty })
            .catch(() => ({ ok: false as const, reason: 'failed' as const }));
        if (result.ok) {
            feedback.success();
            router.back();
            return;
        }
        feedback.error();
        setProblem(addProblem(result.reason));
        setBusy(false);
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title={staffAdd.title} onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={{ paddingHorizontal: M.padX, paddingBottom: M.bottomInset, gap: 10 }}
            >
                <Group head={upperTR(staffAdd.formHead)}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14, gap: 12 }}>
                        <TeamField
                            label={teamStart.name}
                            value={name}
                            onChangeText={(next) => { setName(next); if (problem) setProblem(null); }}
                            placeholder={teamStart.namePlaceholder}
                            maxLength={TEAM_NAME_MAX}
                            autoCapitalize="words"
                            autoComplete="name"
                            textContentType="name"
                            autoFocus
                            returnKeyType="next"
                            submitBehavior="submit"
                            onSubmitEditing={() => specialtyRef.current?.focus()}
                            editable={!busy}
                        />
                        <TeamField
                            inputRef={specialtyRef}
                            label={teamStart.specialty}
                            value={specialty}
                            onChangeText={setSpecialty}
                            placeholder={teamStart.specialtyPlaceholder}
                            maxLength={TEAM_NAME_MAX}
                            autoCapitalize="sentences"
                            returnKeyType="go"
                            onSubmitEditing={() => { void submit(); }}
                            editable={!busy}
                        />

                        {problem ? (
                            <Text
                                accessibilityLiveRegion="polite"
                                style={{ color: c.rd, fontSize: 13, lineHeight: 18, fontFamily: font.bold, fontWeight: '700' }}
                            >
                                {problem}
                            </Text>
                        ) : null}

                        <PrimaryButton
                            label={busy ? staffAdd.busy : staffAdd.action}
                            disabled={busy || !ready}
                            onPress={() => { void submit(); }}
                        />
                    </View>
                </Group>

                <Foot>{staffAdd.foot}</Foot>
            </ScrollView>
        </View>
    );
}
