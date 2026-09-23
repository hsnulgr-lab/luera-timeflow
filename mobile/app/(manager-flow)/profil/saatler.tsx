import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Num } from '../../../src/components/ui';
import {
    Chevron,
    Foot,
    Group,
    ProfileNav,
} from '../../../src/components/ProfileParts';
import { DaySheet } from '../../../src/components/ProfileSheets';
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import { authApi } from '../../../src/api/session';
import {
    dayName,
    dayValueLabel,
    type DaySchedule,
} from '../../../src/lib/managerProfile';
import { orgDurum } from '../../../src/lib/managerDurum';
import { useManagerRead } from '../../../src/lib/managerRead';
import { fetchHoursRow, forgetOrg, type HoursRow } from '../../../src/lib/managerSource';
import { saveWorkingHours } from '../../../src/lib/managerWrite';
import { schedulesOf, settingsRefusal } from '../../../src/lib/settingsMap';
import { upperTR } from '../../../src/lib/text';
import { font, profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür 27 · Çalışma saatleri.
 *
 * Yedi günü TEK EKRANDA görmek bu ekranın şartı: müdür günleri
 * karşılaştırarak okuyor. 52 + (7 × 60) = 472 pt — 375 pt'de bile kaydırma
 * gerekmiyor.
 *
 * "Bugünü kapat" düğmesi YOK ve olmayacak: model haftanın gününü tutuyor,
 * tarihi değil. O düğme bugünü değil HER PERŞEMBEYİ kapatırdı.
 *
 * VERİ CANLI (müdür planı 8. adım): `settings.working_hours`, org sahibinin
 * satırı — masaüstü, çevrim içi randevu, WhatsApp botu ve personelin telefonu
 * aynı satırı okuyor. Gün numarası ve biçim çevirisi `settingsMap.ts`te;
 * yazma iyimser kilitli (`saveWorkingHours`).
 */
export default function ManagerHours() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [editing, setEditing] = useState<DaySchedule | null>(null);
    const [refused, setRefused] = useState<'stale' | 'paused' | 'failed' | null>(null);

    const read = useCallback(() => fetchHoursRow(), []);
    const snap = useManagerRead<HoursRow | null>(read, null,
        { poll: false, tables: ['settings'] });
    /*
     * YAZILAN satır, okuma yetişene kadar. `from` yazmadan önceki damga:
     * sunucu yeni damgayı döndürdüğü an yerel kopya kendiliğinden düşüyor.
     * Efekt yok — türetme.
     */
    const [local, setLocal] = useState<{ row: HoursRow; from: string | null } | null>(null);
    const row = local && snap.data && snap.data.stamp === local.from ? local.row : snap.data;
    const hours = row ? schedulesOf(row.raw) : null;

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

    const weekday = (new Date().getDay() + 6) % 7;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Çalışma saatleri" onBack={() => router.back()} />
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
                {refused ? (
                    <DurumBlock
                        tone={settingsRefusal(refused).tone}
                        title={settingsRefusal(refused).title}
                        lines={[settingsRefusal(refused).line]}
                        actions={[{ label: 'Anladım', onPress: () => setRefused(null) }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}
                {/* Okunamayan saat "hepsi kapalı" DEĞİL. Satır bulunamadıysa
                    (`null`) ya da dizi bozuksa da aynı: saat uydurulmuyor. */}
                {!snap.refusal && hours === null && (snap.state === 'error' || (snap.state === 'ok' && snap.data === null)) ? (
                    <DurumUnread
                        what="Çalışma saatlerini"
                        notMeaning="Salonun kapalı olduğu"
                        onRetry={() => { void snap.reload(); }}
                        style={{ paddingHorizontal: 0 }}
                    />
                ) : null}
                {hours ? (
                <Group>
                    {hours.map((day, index) => {
                        const today = day.day === weekday;
                        const closed = day.closed;
                        return (
                            <Pressable
                                key={day.day}
                                accessibilityRole="button"
                                accessibilityLabel={`${dayName(day.day)}, ${dayValueLabel(day)}`}
                                onPress={() => setEditing(day)}
                                style={({ pressed }) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 10,
                                    minHeight: M.dayHeight,
                                    paddingHorizontal: M.rowPadX,
                                    borderTopWidth: index === 0 ? 0 : 1,
                                    borderColor: c.bd,
                                    backgroundColor: pressed
                                        ? c.surf2
                                        : today ? c.surf2 : 'transparent',
                                })}
                            >
                                {/* Bugünün omurgası — turuncu, çünkü bu bir ZAMAN işareti. */}
                                {today ? (
                                    <View style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 9,
                                        bottom: 9,
                                        width: M.daySpine,
                                        borderTopRightRadius: 2,
                                        borderBottomRightRadius: 2,
                                        backgroundColor: c.or,
                                    }} />
                                ) : null}
                                <Text style={{
                                    color: c.tx,
                                    fontSize: M.dayName,
                                    fontFamily: font.bold,
                                    fontWeight: '700',
                                    letterSpacing: M.dayName * -0.02,
                                }}>
                                    {dayName(day.day)}
                                </Text>
                                {today ? (
                                    <Text style={{
                                        color: c.or,
                                        fontSize: M.dayBadge,
                                        fontFamily: font.extraBold,
                                        fontWeight: '800',
                                        letterSpacing: M.dayBadge * M.dayBadgeTrack,
                                    }}>
                                        {upperTR('Bugün')}
                                    </Text>
                                ) : null}
                                <View style={{ flex: 1 }} />
                                {closed ? (
                                    <Text style={{
                                        color: c.tx3,
                                        fontSize: M.dayClosed,
                                        fontFamily: font.bold,
                                        fontWeight: '700',
                                    }}>
                                        Kapalı
                                    </Text>
                                ) : (
                                    <Num size={M.dayTime} style={{
                                        color: c.tx,
                                        fontWeight: '600',
                                        letterSpacing: M.dayTime * -0.01,
                                    }}>
                                        {dayValueLabel(day)}
                                    </Num>
                                )}
                                <Chevron color={c.tx3} />
                            </Pressable>
                        );
                    })}
                </Group>
                ) : null}

                <Foot>
                    Saatler her hafta aynı tekrar eder. Randevular kapanış saatinden sonraya alınamaz.
                </Foot>
            </ScrollView>

            <DaySheet
                visible={editing !== null}
                day={editing}
                onDismiss={() => setEditing(null)}
                onSave={async (day, spread) => {
                    if (!row || !hours) return;
                    // "Tüm günlere uygula" KAPALI GÜNLERİ AÇMAZ.
                    const replaced = hours.map((candidate) => (candidate.day === day.day ? day : candidate));
                    const next = spread
                        ? replaced.map((candidate) => (candidate.day === day.day || candidate.closed
                            ? candidate
                            : { ...candidate, open: day.open, close: day.close }))
                        : replaced;
                    const result = await saveWorkingHours(next, row);
                    // Sayfa YALNIZ sonuç döndükten sonra kapanır; yazılmamış
                    // bir değer listede yeni değermiş gibi çizilmez.
                    setEditing(null);
                    if (!result.ok) {
                        setRefused(result.kind);
                        // Başka cihaz değiştirdiyse güncel saatler gelsin.
                        if (result.kind === 'stale') void snap.reload();
                        return;
                    }
                    setRefused(null);
                    setLocal({ row: result.value, from: row.stamp });
                    void snap.reload();
                }}
            />
        </View>
    );
}
