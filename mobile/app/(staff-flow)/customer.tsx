import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Appt } from '../../src/lib/calendar';
import { source } from '../../src/lib/calendarSource';
import { numeric, useTheme } from '../../src/theme';
import { upperTR } from '../../src/lib/text';

const HISTORY = [
    { name: 'Saç boyama + fön', detail: '11 Tem · Merve', amount: '₺1.800' },
    { name: 'Keratin bakım', detail: '18 Haz · Merve', amount: '₺2.200' },
    { name: 'Kesim', detail: '2 Haz · Emre', amount: '₺650' },
] as const;

function BackChevron() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 11,
            height: 11,
            borderLeftWidth: 1.8,
            borderBottomWidth: 1.8,
            borderColor: c.tx,
            transform: [{ rotate: '45deg' }],
            marginLeft: 4,
        }} />
    );
}

type CustomerRouteParams = {
    customerName?: string | string[];
    customerId?: string | string[];
    reservationId?: string | string[];
    date?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    const clean = first?.trim();
    return clean || undefined;
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '--';

    const letters = parts.length === 1
        ? Array.from(parts[0]).slice(0, 2).join('')
        : `${Array.from(parts[0])[0] ?? ''}${Array.from(parts.at(-1) ?? '')[0] ?? ''}`;
    return letters.toLocaleUpperCase('tr-TR');
}

function TopBar({ onBack, customerName }: { onBack: () => void; customerName: string }) {
    const { c, glass } = useTheme();
    const barStyle: ViewStyle = {
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: c.glassBorder,
    };
    const content = (
        <>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                onPress={onBack}
                hitSlop={6}
                style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    marginLeft: -12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.55 : 1,
                })}
            >
                <BackChevron />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: 16,
                    fontWeight: '800',
                    letterSpacing: -0.32,
                }}>
                    Müşteri
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 11.5, fontWeight: '600' }}>
                    {customerName}
                </Text>
            </View>
        </>
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={barStyle}>
                {content}
            </GlassView>
        );
    }
    return <View style={[barStyle, { backgroundColor: c.surf }]}>{content}</View>;
}

function ShieldIcon() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 20,
            height: 20,
            alignItems: 'center',
            paddingTop: 4,
            borderWidth: 1.7,
            borderColor: c.am,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
        }}>
            <View style={{ width: 1.7, height: 6, borderRadius: 1, backgroundColor: c.am }} />
            <View style={{ width: 2, height: 2, marginTop: 2, borderRadius: 1, backgroundColor: c.am }} />
        </View>
    );
}

function SectionTitle({ children, trailing }: { children: string; trailing?: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            paddingTop: 22,
            paddingHorizontal: 20,
            paddingBottom: 9,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        }}>
            <Text style={{
                color: c.tx2,
                fontSize: 11.5,
                fontWeight: '700',
                letterSpacing: 1.84,
            }}>
                {upperTR(children)}
            </Text>
            {trailing ? (
                <Text style={{ color: c.or, fontSize: 12.5, fontWeight: '700' }}>
                    {trailing}
                </Text>
            ) : null}
        </View>
    );
}

function HistoryRow({ item }: { item: typeof HISTORY[number] }) {
    const { c } = useTheme();
    return (
        <View style={{
            minHeight: 62,
            paddingVertical: 10,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ color: c.tx, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.23 }}>
                    {item.name}
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                    {item.detail}
                </Text>
            </View>
            <Text style={[{ color: c.tx, fontSize: 15, fontWeight: '700' }, numeric]}>
                {item.amount}
            </Text>
        </View>
    );
}

function NewAppointmentAction() {
    const { c, glass } = useTheme();
    const insets = useSafeAreaInsets();
    const shell: ViewStyle = {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 10,
        padding: 12,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: c.glassBorder,
        overflow: 'hidden',
    };
    const content = (
        <Pressable
            accessibilityRole="button"
            onPress={() => undefined}
            style={({ pressed }) => ({
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.bd,
                backgroundColor: c.surf2,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <Text style={{ color: c.tx, fontSize: 16, fontWeight: '700' }}>
                Yeni randevu ver
            </Text>
        </Pressable>
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={shell}>
                {content}
            </GlassView>
        );
    }
    return <View style={[shell, { backgroundColor: c.surf }]}>{content}</View>;
}

export default function CustomerCard() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const routeParams = useLocalSearchParams<CustomerRouteParams>();
    const routedName = firstParam(routeParams.customerName);
    const customerId = firstParam(routeParams.customerId);
    const reservationId = firstParam(routeParams.reservationId);
    const date = firstParam(routeParams.date);
    const hasCalendarContext = Boolean(routedName || customerId || reservationId || date);
    const lookupKey = `${date ?? ''}:${reservationId ?? ''}:${customerId ?? ''}`;
    const [lookupResult, setLookupResult] = useState<{
        key: string;
        appointment: Appt | null;
    } | null>(null);

    useEffect(() => {
        if (routedName || !date || (!reservationId && !customerId)) return undefined;

        let active = true;
        source.day(date).then((appointments) => {
            if (!active) return;
            const appointment = appointments.find((item) => (
                (reservationId && item.id === reservationId)
                || (customerId && item.customer_id === customerId)
            ));
            setLookupResult({ key: lookupKey, appointment: appointment ?? null });
        }).catch(() => {
            if (active) setLookupResult({ key: lookupKey, appointment: null });
        });

        return () => { active = false; };
    }, [customerId, date, lookupKey, reservationId, routedName]);

    const calendarAppointment = lookupResult?.key === lookupKey
        ? lookupResult.appointment
        : null;
    const customerName = routedName
        ?? calendarAppointment?.customer_name
        ?? (hasCalendarContext ? 'Müşteri' : 'Ayşe Yılmaz');
    const customerInitials = useMemo(() => initials(customerName), [customerName]);
    const profileSubtitle = hasCalendarContext
        ? calendarAppointment?.info?.visitNo
            ? `${calendarAppointment.info.visitNo}. ziyaret${calendarAppointment.info.lastVisit ? ` · Son: ${calendarAppointment.info.lastVisit}` : ''}`
            : calendarAppointment ? 'Müşteri bilgileri' : 'Müşteri bilgileri yükleniyor…'
        : "2022'den beri · 38 işlem";
    const riskText = hasCalendarContext
        ? calendarAppointment?.info?.risk
        : 'Amonyaklı boyada ciltte kızarıklık oluyor. Amonyaksız seri kullanılıyor.';
    const profileStats = hasCalendarContext
        ? [
            [calendarAppointment?.info?.pkg
                ? String(Math.max(0, calendarAppointment.info.pkg.total - calendarAppointment.info.pkg.used))
                : '—', 'Kalan seans'],
            ['—', 'Toplam'],
            [calendarAppointment?.info?.visitNo ? String(calendarAppointment.info.visitNo) : '—', 'Ziyaret'],
        ]
        : [
            ['4', 'Kalan seans'],
            ['₺12.4B', 'Toplam'],
            ['31 gün', 'Son geliş'],
        ];

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <TopBar customerName={customerName} onBack={() => router.back()} />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 126 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{
                    paddingTop: 20,
                    paddingHorizontal: 18,
                    paddingBottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                }}>
                    <View style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.surf2,
                    }}>
                        <Text style={{ color: c.tx, fontSize: 22, fontWeight: '800', letterSpacing: -0.44 }}>
                            {customerInitials}
                        </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={1} style={{ color: c.tx, fontSize: 24, fontWeight: '800', letterSpacing: -0.77 }}>
                            {customerName}
                        </Text>
                        <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 14, fontWeight: '600' }}>
                            {profileSubtitle}
                        </Text>
                    </View>
                </View>

                {riskText ? <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
                    <View style={{
                        paddingVertical: 15,
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 11,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.am + '4D',
                        backgroundColor: c.am + '14',
                    }}>
                        <View style={{ marginTop: 1 }}>
                            <ShieldIcon />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                            <Text style={{
                                color: c.am,
                                fontSize: 14,
                                fontWeight: '700',
                                letterSpacing: 0.84,
                            }}>
                                {upperTR('Bilinmesi gerekenler')}
                            </Text>
                            <Text style={{ color: c.tx, fontSize: 15, lineHeight: 22.5, fontWeight: '600' }}>
                                {riskText}
                            </Text>
                        </View>
                    </View>
                </View> : null}

                <View style={{
                    flexDirection: 'row',
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: c.bd,
                    backgroundColor: c.surf,
                }}>
                    {profileStats.map(([value, label], index) => (
                        <View key={label} style={{
                            flex: 1,
                            gap: 3,
                            paddingVertical: 16,
                            paddingHorizontal: 14,
                            borderRightWidth: index < 2 ? 1 : 0,
                            borderRightColor: c.bd,
                        }}>
                            <Text numberOfLines={1} adjustsFontSizeToFit style={[{
                                color: c.tx,
                                fontSize: 24,
                                fontWeight: '800',
                                letterSpacing: -0.84,
                            }, numeric]}>
                                {value}
                            </Text>
                            <Text numberOfLines={1} style={{
                                color: c.tx2,
                                fontSize: 11.5,
                                fontWeight: '600',
                                letterSpacing: 0.92,
                            }}>
                                {upperTR(label)}
                            </Text>
                        </View>
                    ))}
                </View>

                {(!hasCalendarContext || calendarAppointment?.info?.pkg) ? <>
                    <SectionTitle>Devam eden paket</SectionTitle>
                    <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        padding: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.card,
                    }}>
                        <View style={{
                            marginBottom: 11,
                            flexDirection: 'row',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: 10,
                        }}>
                            <Text numberOfLines={1} style={{
                                flex: 1,
                                color: c.tx,
                                fontSize: 16.5,
                                fontWeight: '700',
                                letterSpacing: -0.33,
                            }}>
                                {hasCalendarContext
                                    ? calendarAppointment?.info?.pkg?.name
                                    : "Bakım paketi 10'lu"}
                            </Text>
                            <Text numberOfLines={1} style={{ color: c.or2, fontSize: 14, fontWeight: '700' }}>
                                {hasCalendarContext && calendarAppointment?.info?.pkg
                                    ? `${Math.max(0, calendarAppointment.info.pkg.total - calendarAppointment.info.pkg.used)} / ${calendarAppointment.info.pkg.total} kaldı`
                                    : '4 / 10 kaldı'}
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                            {Array.from({
                                length: hasCalendarContext
                                    ? calendarAppointment?.info?.pkg?.total ?? 0
                                    : 10,
                            }, (_, index) => (
                                <View key={index} style={{
                                    flex: 1,
                                    height: 7,
                                    borderRadius: 4,
                                    backgroundColor: index < (hasCalendarContext
                                        ? calendarAppointment?.info?.pkg?.used ?? 0
                                        : 6) ? c.surf2 : c.or + '59',
                                }} />
                            ))}
                        </View>
                    </View>
                    </View>
                </> : null}

                {!hasCalendarContext ? <>
                    <SectionTitle trailing="Tümü">Geçmiş işlemler</SectionTitle>
                    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    {HISTORY.map((item, index) => (
                        <View key={item.name}>
                            <HistoryRow item={item} />
                            {index < HISTORY.length - 1 ? <View style={{ height: 1, backgroundColor: c.bd }} /> : null}
                        </View>
                    ))}
                    </View>
                </> : null}

                {(!hasCalendarContext || calendarAppointment?.notes) ? <>
                    <SectionTitle>Notlar</SectionTitle>
                    <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.card,
                    }}>
                        <Text style={{
                            marginBottom: 5,
                            color: c.tx3,
                            fontSize: 12,
                            fontWeight: '700',
                            letterSpacing: 1.2,
                        }}>
                            {upperTR(hasCalendarContext ? 'Randevu notu' : '11 Tem · Merve')}
                        </Text>
                        <Text style={{ color: c.tx2, fontSize: 15, lineHeight: 22.5, fontWeight: '500' }}>
                            {hasCalendarContext
                                ? calendarAppointment?.notes
                                : '7.3 kumral tercih ediyor, kökte yarım ton koyu.'}
                        </Text>
                    </View>
                    </View>
                </> : null}
            </ScrollView>

            <NewAppointmentAction />
        </View>
    );
}
