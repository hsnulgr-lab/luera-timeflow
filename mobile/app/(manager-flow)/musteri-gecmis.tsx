import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DurumUnread } from '../../src/components/Durum';
import { ProfileNav } from '../../src/components/ProfileParts';
import { formatTRY } from '../../src/lib/customerCard';
import { fullHistoryOf, type FullHistoryRow } from '../../src/lib/customerCardLive';
import { localClock } from '../../src/lib/createLive';
import { useManagerRead } from '../../src/lib/managerRead';
import { fetchCustomerHistory } from '../../src/lib/managerSource';
import { font, profileMetrics as M, useTheme } from '../../src/theme';

type Groups = { month: string; rows: FullHistoryRow[] }[];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || null;

/**
 * Müdür 23 v2 · Tüm geçmiş.
 *
 * Kartın "Tüm geçmişi aç"ı buraya geliyor. Kart üç satır gösteriyor; burada
 * müşterinin iptal olmayan BÜTÜN ziyaretleri, ay başlıklı, yeniden eskiye.
 * Tutar o ziyarete bağlı tahsilatların toplamı; bağlı tahsilat yoksa tutar
 * YAZILMIYOR — "₺0" ödenmemiş bir işi bedava gösterirdi.
 *
 * Standart itme: kendi başlığı var, kart altta bekliyor.
 */
export default function CustomerHistory() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();
    const customerId = first(params.customerId);
    const customerName = first(params.customerName);

    const read = useCallback(async (): Promise<Groups | null> => {
        if (!customerId) return null;
        const today = localClock(Date.now()).dateISO;
        const rows = await fetchCustomerHistory(customerId, today);
        return fullHistoryOf({ ...rows, todayISO: today });
    }, [customerId]);
    const snap = useManagerRead<Groups | null>(read, null,
        { poll: false, tables: ['reservations', 'payments'] });
    const groups = snap.data;
    const total = groups?.reduce((sum, group) => sum + group.rows.length, 0) ?? 0;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title={customerName ?? 'Geçmiş'} onBack={() => router.back()} />
            </View>

            {snap.state === 'error' && !groups ? (
                <DurumUnread
                    what="Geçmişi"
                    notMeaning="Hiç ziyaret olmadığı"
                    onRetry={() => { void snap.reload(); }}
                    style={{ paddingHorizontal: M.padX }}
                />
            ) : groups ? (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
                >
                    <Text style={{
                        paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6,
                        color: c.tx2, fontSize: 13, fontFamily: font.semiBold, fontWeight: '600',
                        fontVariant: ['tabular-nums'],
                    }}>
                        {total > 0 ? `${total} ziyaret` : 'Henüz ziyaret yok'}
                    </Text>
                    {groups.map((group) => (
                        <View key={group.month}>
                            <Text style={{
                                paddingTop: 15, paddingHorizontal: 16, paddingBottom: 7,
                                color: c.tx3, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800',
                                letterSpacing: 10.5 * 0.14,
                            }}>
                                {group.month.toLocaleUpperCase('tr-TR')}
                            </Text>
                            {group.rows.map((row, index) => (
                                <View
                                    key={row.id}
                                    accessible
                                    accessibilityLabel={[
                                        row.service, row.date, row.staff ? `${row.staff} ile` : null,
                                        row.amount != null ? `${formatTRY(row.amount)} lira` : null,
                                    ].filter(Boolean).join(', ')}
                                    style={{
                                        minHeight: 52, paddingVertical: 9, paddingHorizontal: 16,
                                        flexDirection: 'row', alignItems: 'center', gap: 11,
                                        borderTopWidth: index === 0 ? 0 : 1, borderColor: c.bd,
                                    }}
                                >
                                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                        <Text style={{
                                            color: c.tx, fontSize: 15, fontFamily: font.semiBold, fontWeight: '600',
                                        }}>
                                            {row.service}
                                        </Text>
                                        <Text numberOfLines={1} style={{
                                            color: c.tx2, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500',
                                        }}>
                                            {[row.date, row.staff ? `${row.staff} ile` : null].filter(Boolean).join(' · ')}
                                        </Text>
                                    </View>
                                    {row.amount != null ? (
                                        <Text style={{
                                            flexShrink: 0, color: c.tx, fontSize: 16, fontFamily: font.extraBold,
                                            fontWeight: '800', fontVariant: ['tabular-nums'],
                                        }}>
                                            ₺{formatTRY(row.amount)}
                                        </Text>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    ))}
                </ScrollView>
            ) : null}
        </View>
    );
}
