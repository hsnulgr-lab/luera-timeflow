import { useEffect, useState } from 'react';
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
import {
    dayName,
    dayValueLabel,
    type DaySchedule,
} from '../../../src/lib/managerProfile';
import { readHours, saveDay } from '../../../src/lib/salonSettings';
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
 */
export default function ManagerHours() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [hours, setHours] = useState<DaySchedule[]>([]);
    const [editing, setEditing] = useState<DaySchedule | null>(null);

    useEffect(() => {
        let alive = true;
        void readHours().then((list) => { if (alive) setHours(list); });
        return () => { alive = false; };
    }, []);

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

                <Foot>
                    Saatler her hafta aynı tekrar eder. Randevular kapanış saatinden sonraya alınamaz.
                </Foot>
            </ScrollView>

            <DaySheet
                visible={editing !== null}
                day={editing}
                onDismiss={() => setEditing(null)}
                onSave={async (day, spread) => {
                    const result = await saveDay(day, spread);
                    // Sayfa YALNIZ sonuç döndükten sonra kapanır; kaydedilmemiş
                    // bir değer listede yeni değermiş gibi çizilmez.
                    if (!result.ok || !result.value) return;
                    setHours(result.value);
                    setEditing(null);
                }}
            />
        </View>
    );
}
