import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Num } from '../../../src/components/ui';
import {
    Foot,
    GhostButton,
    Group,
    PrimaryButton,
    ProfileNav,
    ProfileRow,
} from '../../../src/components/ProfileParts';
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import { authApi } from '../../../src/api/session';
import { orgDurum } from '../../../src/lib/managerDurum';
import { useManagerRead } from '../../../src/lib/managerRead';
import { forgetOrg } from '../../../src/lib/managerSource';
import { createTeamCode, fetchTeamStatus, resetStaffPin, type TeamFailure } from '../../../src/lib/teamAccess';
import {
    countdown, memberLine, spacedCode, teamSummary, type TeamCode, type TeamMember,
} from '../../../src/lib/teamAccessView';
import { feedback } from '../../../src/lib/feedback';
import { upperTR } from '../../../src/lib/text';
import { font, profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür · Profil → Personel (099).
 *
 * Personelin telefondan GİREMEMESİNİN çözümü iki şeydi ve ikisi de burada:
 *
 *   1. TELEFON BAĞLA — tek ekip kodu. Müdür bir kez basar, kod 15 dakika
 *      ekranda büyük rakamla durur, bütün ekip aynı kodu yazar ve listeden
 *      kendini seçer. Eskiden kod yalnız masaüstünden ve kişi başına tekti.
 *
 *   2. ŞİFREYİ SIFIRLA — şifreyi personel kendisi belirliyor (müdür kararı).
 *      Unutan ya da yanlış kişinin sahiplendiği hesapta müdür sıfırlar; kişi
 *      bir sonraki girişte yenisini belirler. Müdür şifre YAZMIYOR.
 *
 * Satırın alt yazısı müdürün tek sorusunu cevaplıyor: bu kişi girebilir mi,
 * girdiyse ne zaman. "Şifresini belirledi · bugün 23:31" satırı, yanlış
 * kişinin listeden seçip şifre koymasını fark etmenin yolu.
 *
 * Tasarım turu Claude Design'da yapılacak (müdür kararı): bu ekran mevcut
 * profil diliyle (Müdür 27) kuruldu.
 */
export default function ManagerStaffAccess() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const read = useCallback(() => fetchTeamStatus(), []);
    const snap = useManagerRead<TeamMember[] | null>(read, null, { poll: false });

    const [code, setCode] = useState<TeamCode | null>(null);
    const [codeBusy, setCodeBusy] = useState(false);
    const [codeError, setCodeError] = useState<TeamFailure | null>(null);
    const [now, setNow] = useState(() => Date.now());

    // Geri sayım — yalnız ekranda kod varken.
    useEffect(() => {
        if (!code) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [code]);

    const secondsLeft = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
    const expired = Boolean(code) && secondsLeft === 0;

    const makeCode = useCallback(async () => {
        if (codeBusy) return;
        setCodeBusy(true);
        setCodeError(null);
        try {
            const result = await createTeamCode();
            if (result.ok) {
                feedback.success();
                setNow(Date.now());
                setCode(result.code);
            } else {
                feedback.warning();
                setCodeError(result.reason);
            }
        } catch {
            // Salon seçimi reddi: okuma kancası aynı reddi zaten çiziyor.
            setCodeError('failed');
        } finally {
            setCodeBusy(false);
        }
    }, [codeBusy]);

    const askReset = useCallback((member: TeamMember) => {
        const given = member.name.split(/\s+/)[0] ?? member.name;
        Alert.alert(
            `${given} şifresini sıfırlasın mı?`,
            'Şifre silinir ve açık oturumu kapanır. Bir sonraki girişte yeni şifresini kendisi belirler. Telefonu işletmeye bağlı kalır.',
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Şifreyi sıfırla',
                    style: 'destructive',
                    onPress: () => {
                        void resetStaffPin(member.id).then((result) => {
                            if (result.ok) {
                                feedback.success();
                                void snap.reload();
                                return;
                            }
                            feedback.warning();
                            Alert.alert(
                                'Şifre sıfırlanamadı',
                                result.reason === 'owner_required'
                                    ? 'Şifreyi yalnız işletme sahibi sıfırlayabilir.'
                                    : result.reason === 'offline'
                                        ? 'Bağlantı yok. Şifre değişmedi; bağlanınca tekrar deneyin.'
                                        : 'Şifre değişmedi. Birazdan tekrar deneyin.',
                            );
                        }).catch(() => {
                            Alert.alert('Şifre sıfırlanamadı', 'Şifre değişmedi. Birazdan tekrar deneyin.');
                        });
                    },
                },
            ],
        );
    }, [snap]);

    const onRefusalAction = useCallback(async () => {
        if (snap.refusal === 'ambiguous') {
            forgetOrg();
            router.push('/(auth)/manager/business');
            return;
        }
        await authApi.resume.signOut().catch(() => undefined);
        forgetOrg();
        router.replace('/(auth)/welcome');
    }, [snap.refusal, router]);

    const members = snap.data;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Personel" onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingBottom: M.bottomInset,
                    gap: 10,
                }}
            >
                {snap.refusal ? (
                    <DurumBlock
                        tone={orgDurum(snap.refusal).tone}
                        title={orgDurum(snap.refusal).title}
                        lines={orgDurum(snap.refusal).lines}
                        actions={[{
                            label: orgDurum(snap.refusal).action.label,
                            onPress: () => { void onRefusalAction(); },
                        }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}

                {/* ── Telefon bağla ─────────────────────────────────────── */}
                <Group head={upperTR('Telefon bağla')}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14, gap: 12 }}>
                        {code && !expired ? (
                            <>
                                <View style={{ alignItems: 'center', gap: 6, paddingTop: 4 }}>
                                    <Num size={44} style={{
                                        color: c.tx,
                                        fontWeight: '800',
                                        letterSpacing: 44 * 0.06,
                                    }}>
                                        {spacedCode(code.code)}
                                    </Num>
                                    <Text style={{
                                        color: secondsLeft <= 60 ? c.or : c.tx2,
                                        fontSize: 14,
                                        fontFamily: font.bold,
                                        fontWeight: '700',
                                    }}>
                                        {countdown(secondsLeft)} geçerli
                                    </Text>
                                </View>
                                <Text style={{
                                    color: c.tx2,
                                    fontSize: 13.5,
                                    lineHeight: 19,
                                    fontFamily: font.semiBold,
                                    fontWeight: '600',
                                    textAlign: 'center',
                                }}>
                                    Bütün ekip bu kodu yazabilir. Personel kodu girip listeden kendini seçer.
                                </Text>
                                <GhostButton
                                    label="Kodu kapat"
                                    onPress={() => { setCode(null); setCodeError(null); }}
                                />
                            </>
                        ) : (
                            <>
                                <Text style={{
                                    color: c.tx2,
                                    fontSize: 13.5,
                                    lineHeight: 19,
                                    fontFamily: font.semiBold,
                                    fontWeight: '600',
                                }}>
                                    {expired
                                        ? 'Kodun süresi doldu. Personel henüz yazmadıysa yeni bir kod üretin.'
                                        : 'Tek kod, bütün ekip. Kod 15 dakika geçerli; personel yazar, listeden kendini seçer ve şifresini kendisi belirler.'}
                                </Text>
                                <PrimaryButton
                                    label={codeBusy ? 'Kod üretiliyor…' : expired ? 'Yeni kod üret' : 'Telefon bağla'}
                                    disabled={codeBusy}
                                    onPress={() => { void makeCode(); }}
                                />
                            </>
                        )}
                        {codeError ? (
                            <Text style={{
                                color: c.rd,
                                fontSize: 13,
                                fontFamily: font.bold,
                                fontWeight: '700',
                            }}>
                                {codeError === 'owner_required'
                                    ? 'Kodu yalnız işletme sahibi üretebilir.'
                                    : codeError === 'offline'
                                        ? 'Bağlantı yok. Kod üretilemedi.'
                                        : 'Kod üretilemedi. Tekrar deneyin.'}
                            </Text>
                        ) : null}
                    </View>
                </Group>

                {/* ── Ekip ──────────────────────────────────────────────── */}
                {!snap.refusal && members === null && snap.state === 'error' ? (
                    <DurumUnread
                        what="Ekibin giriş durumunu"
                        notMeaning="Kimsenin giremediği"
                        onRetry={() => { void snap.reload(); }}
                        style={{ paddingHorizontal: 0 }}
                    />
                ) : null}
                {members ? (
                    <Group head={upperTR(`Ekip · ${teamSummary(members)}`)}>
                        {members.map((member, index) => (
                            <ProfileRow
                                key={member.id}
                                first={index === 0}
                                title={member.name}
                                sub={memberLine(member, now).text}
                                // Şifresi olmayanda sıfırlanacak bir şey yok:
                                // satır bir beyan, kapı değil.
                                chevron={member.hasPin}
                                onPress={member.hasPin ? () => askReset(member) : undefined}
                            />
                        ))}
                    </Group>
                ) : null}

                <Foot>
                    Personel eklemek ve çıkarmak bilgisayardan: Luera → Personel. Şifreyi
                    unutan personelin satırına dokunup sıfırlayın; yenisini kendisi belirler.
                </Foot>
            </ScrollView>
        </View>
    );
}
