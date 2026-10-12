import { useRef, useState, type RefObject } from 'react';
import { ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldLabel, Foot, Group, PrimaryButton, ProfileNav } from '../../../src/components/ProfileParts';
import { authApi } from '../../../src/api/session';
import { TEAM_NAME_MAX, teamStart, teamStartProblem } from '../../../src/lib/authCopy';
import { enterShell } from '../../../src/lib/enterShell';
import { feedback } from '../../../src/lib/feedback';
import { upperTR } from '../../../src/lib/text';
import { font, profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * İşletme › Ekip ekle — tek kişilik işletmenin ekibe geçiş kapısı (113 · v4 P2).
 *
 * Önce neyin değişeceği, sonra tek form. Mod KENDİLİĞİNDEN değişmez, yalnız
 * bu düğmeyle (v4 karar 2): yarı zamanlı bir çalışan için ekranın kendiliğinden
 * değişmesi, her seferinde başka bir uygulama demekti.
 *
 * Yeni bileşen yok (v4 · bileşen envanteri): iki kart canlı Personel
 * sayfasının kart dili (`Group` + başlık), alanlar Müşteriler'in arama
 * kutusunun çizimi, düğme ve dipnot Profil'in kendi parçaları.
 *
 * Çalışan eklenince personel satırı ve mod bayrağı sunucuda TEK işlemde
 * yazılıyor (`start_team`); ekran ancak ikisi de yazıldıktan sonra ekip
 * düzenine geçiyor. Hata hâlinde cümle düğmenin üstünde ve işletmenin hangi
 * düzende kaldığını söylüyor.
 */
export default function TeamStart() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const nameRef = useRef<TextInput>(null);
    const specialtyRef = useRef<TextInput>(null);

    const [ownerName, setOwnerName] = useState('');
    const [name, setName] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    /*
     * "ZATEN EKİP" — sunucu başka bir cihazdan geçildiğini söyledi ve çalışan
     * bu dokunuşla EKLENMEDİ (aynı adla eklenmişse `team.start` onu başarı
     * sayıyor). Saklı profil yenilendi; düğmenin artık tek dürüst işi ekip
     * düzenine geçmek. Aynı formu yeniden göndermek aynı hayırı alırdı.
     */
    const alreadyTeam = problem === 'already_team';
    // İki ad da şart: sahibin adı olmadan ekip takviminde sütunu salonun
    // adıyla görünürdü (115 · kullanıcı kararı).
    const ready = ownerName.trim().length > 0 && name.trim().length > 0;

    const submit = async () => {
        if (busy) return;
        if (alreadyTeam) {
            enterShell('manager', false);
            return;
        }
        if (!ready) return;
        setBusy(true);
        setProblem(null);
        const result = await authApi.team.start(name, specialty, ownerName);
        if (result.ok) {
            feedback.success();
            // Kabuk değişiyor: geçmiş siliniyor ve müdür kabuğu Akış'la açılıyor.
            enterShell('manager', false);
            return;
        }
        feedback.error();
        setProblem(result.error);
        setBusy(false);
    };

    const body = { color: c.tx2, fontSize: 13.5, lineHeight: 19, fontFamily: font.semiBold, fontWeight: '600' as const };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title={teamStart.title} onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={{ paddingHorizontal: M.padX, paddingBottom: M.bottomInset, gap: 10 }}
            >
                <Group head={upperTR(teamStart.changeHead)}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14 }}>
                        <Text style={body}>{teamStart.change}</Text>
                    </View>
                </Group>

                {/* SİZ — sahibin adı (115). Kayıt kişinin adını hiç sormuyor;
                    tek kişilikte görünmeyen ad ekipte sütun başlığı oluyor. */}
                <Group head={upperTR(teamStart.ownerHead)}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14, gap: 8 }}>
                        <TeamField
                            label={teamStart.ownerName}
                            value={ownerName}
                            onChangeText={(next) => { setOwnerName(next); if (problem && !alreadyTeam) setProblem(null); }}
                            placeholder={teamStart.ownerPlaceholder}
                            maxLength={TEAM_NAME_MAX}
                            autoCapitalize="words"
                            autoComplete="name"
                            textContentType="name"
                            returnKeyType="next"
                            submitBehavior="submit"
                            onSubmitEditing={() => nameRef.current?.focus()}
                            editable={!busy && !alreadyTeam}
                        />
                        <Text style={{ color: c.tx3, fontSize: 12.5, lineHeight: 17, fontFamily: font.medium, fontWeight: '500' }}>
                            {teamStart.ownerHint}
                        </Text>
                    </View>
                </Group>

                <Group head={upperTR(teamStart.formHead)}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14, gap: 12 }}>
                        <TeamField
                            inputRef={nameRef}
                            label={teamStart.name}
                            value={name}
                            onChangeText={(next) => { setName(next); if (problem && !alreadyTeam) setProblem(null); }}
                            placeholder={teamStart.namePlaceholder}
                            maxLength={TEAM_NAME_MAX}
                            autoCapitalize="words"
                            autoComplete="name"
                            textContentType="name"
                            returnKeyType="next"
                            submitBehavior="submit"
                            onSubmitEditing={() => specialtyRef.current?.focus()}
                            editable={!busy && !alreadyTeam}
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
                            editable={!busy && !alreadyTeam}
                        />

                        {problem ? (
                            <Text
                                accessibilityLiveRegion="polite"
                                style={{ color: alreadyTeam ? c.am : c.rd, fontSize: 13, lineHeight: 18, fontFamily: font.bold, fontWeight: '700' }}
                            >
                                {teamStartProblem(problem)}
                            </Text>
                        ) : null}

                        <PrimaryButton
                            label={alreadyTeam ? teamStart.enterTeam : busy ? teamStart.busy : teamStart.action}
                            disabled={busy || (!alreadyTeam && !ready)}
                            onPress={() => { void submit(); }}
                        />
                    </View>
                </Group>

                <Foot>{teamStart.foot}</Foot>
            </ScrollView>
        </View>
    );
}

/**
 * Müşteriler'in arama kutusunun çizimi, büyüteçsiz (`SearchField`). Onun
 * kendisi değil: o bir ARAMA kontrolü — büyüteci, temizle düğmesi ve "ara"
 * klavye tuşu var. Boşken alan zemini, yazılınca yüzey ve çizgi.
 */
function TeamField({ label, inputRef, value, ...input }: TextInputProps & {
    label: string;
    value: string;
    inputRef?: RefObject<TextInput | null>;
}) {
    const { c } = useTheme();
    const on = value.length > 0;
    return (
        <View style={{ gap: 7 }}>
            <FieldLabel>{upperTR(label)}</FieldLabel>
            <TextInput
                ref={inputRef}
                value={value}
                accessibilityLabel={label}
                placeholderTextColor={c.tx3}
                selectionColor={c.or}
                autoCorrect={false}
                {...input}
                style={{
                    height: 50,
                    borderRadius: 16,
                    paddingHorizontal: 15,
                    backgroundColor: on ? c.surf2 : c.fld,
                    borderWidth: 1,
                    borderColor: on ? c.bd2 : 'transparent',
                    color: c.tx,
                    fontSize: 15.5,
                    fontFamily: on ? font.semiBold : font.medium,
                    fontWeight: on ? '600' : '500',
                }}
            />
        </View>
    );
}
