import { useEffect, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    DEFAULT_MATERIAL_QUANTITIES,
    MATERIAL_OPTIONS,
    MaterialSheet,
    SERVICE_OPTIONS,
    ServiceSheet,
    formatMoney,
    type MaterialQuantities,
    type VisitSheet,
} from '../../src/components/VisitSheets';
import type { Appt } from '../../src/lib/calendar';
import { source } from '../../src/lib/calendarSource';
import { feedback } from '../../src/lib/feedback';
import { numeric, useTheme } from '../../src/theme';

const TEST_ELAPSED_SECONDS = 24 * 60 + 18;

const param = (value: string | string[] | undefined) => (
    typeof value === 'string' && value ? value : null
);

interface VisitLine {
    id: string;
    name: string;
    detail: string;
    amount?: string;
}

const BASE_ITEMS: VisitLine[] = [
    { id: 'base-dye', name: 'Saç boyama', detail: 'Hizmet · 90 dk', amount: '₺1.450' },
    { id: 'base-blowdry', name: 'Fön', detail: 'Hizmet · 30 dk', amount: '₺350' },
];

const NOTE_ITEM: VisitLine = {
    id: 'note',
    name: 'Not eklendi',
    detail: 'Kökte yarım ton koyu uygulandı',
};

const formatElapsed = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
};

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

function TopBar({ customerName, onBack }: { customerName: string; onBack: () => void }) {
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
                    İşlem sürüyor
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

function PlusIcon() {
    const { c } = useTheme();
    return (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', width: 17, height: 1.7, borderRadius: 1, backgroundColor: c.tx }} />
            <View style={{ position: 'absolute', width: 1.7, height: 17, borderRadius: 1, backgroundColor: c.tx }} />
        </View>
    );
}

function BoxIcon() {
    const { c } = useTheme();
    return (
        <View style={{ width: 24, height: 24, alignItems: 'center' }}>
            <View style={{
                position: 'absolute',
                top: 6,
                width: 19,
                height: 15,
                borderWidth: 1.7,
                borderColor: c.tx,
                borderRadius: 3,
            }} />
            <View style={{ position: 'absolute', top: 6, width: 19, height: 1.7, backgroundColor: c.tx }} />
            <View style={{ position: 'absolute', top: 3, width: 12, height: 4, borderWidth: 1.7, borderColor: c.tx }} />
        </View>
    );
}

function NoteIcon() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 20,
            height: 23,
            paddingTop: 6,
            paddingHorizontal: 4,
            gap: 3,
            borderWidth: 1.7,
            borderColor: c.tx,
            borderRadius: 3,
        }}>
            <View style={{ height: 1.5, borderRadius: 1, backgroundColor: c.tx }} />
            <View style={{ width: 8, height: 1.5, borderRadius: 1, backgroundColor: c.tx }} />
        </View>
    );
}

function QuickActionIcon({ icon }: { icon: 'plus' | 'box' | 'note' }) {
    if (icon === 'plus') return <PlusIcon />;
    if (icon === 'box') return <BoxIcon />;
    return <NoteIcon />;
}

function QuickAction({
    label,
    icon,
    onPress,
}: {
    label: string;
    icon: 'plus' | 'box' | 'note';
    onPress: () => void;
}) {
    const { c, small } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => ({
                flex: 1,
                height: small ? 66 : 78,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: c.bd,
                backgroundColor: c.surf2,
                opacity: pressed ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
        >
            <QuickActionIcon icon={icon} />
            <Text numberOfLines={1} style={{ color: c.tx, fontSize: 13, fontWeight: '700', letterSpacing: -0.13 }}>
                {label}
            </Text>
        </Pressable>
    );
}

function LineItem({ item }: { item: VisitLine }) {
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
            {'amount' in item ? (
                <Text numberOfLines={1} style={[{ color: c.tx, fontSize: 15, fontWeight: '700' }, numeric]}>
                    {item.amount}
                </Text>
            ) : null}
        </View>
    );
}

function FinishAction() {
    const { c, glass } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
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
            onPress={() => {
                feedback.medium();
                router.push('/finish');
            }}
            style={({ pressed }) => ({
                height: 64,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 18,
                backgroundColor: c.or,
                opacity: pressed ? 0.82 : 1,
                transform: [{ scale: pressed ? 0.988 : 1 }],
            })}
        >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                İşlemi bitir
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

export default function ActiveVisit() {
    const { c, small, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ reservationId?: string; date?: string }>();
    const reservationId = param(params.reservationId);
    const date = param(params.date);
    const lookupKey = reservationId && date ? `${date}:${reservationId}` : null;
    const [calendarResult, setCalendarResult] = useState<{
        key: string;
        appointment: Appt | null;
    } | null>(null);
    const [elapsed, setElapsed] = useState(TEST_ELAPSED_SECONDS);
    const [sheet, setSheet] = useState<VisitSheet>(null);
    const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(['mask']);
    const [materialQuantities, setMaterialQuantities] = useState<MaterialQuantities>({ dye: 2 });
    const calendarAppointment = calendarResult?.key === lookupKey
        ? calendarResult.appointment
        : null;
    const hasCalendarRoute = lookupKey !== null;
    const customerName = calendarAppointment?.customer_name
        ?? (hasCalendarRoute ? 'Randevu' : 'Ayşe Yılmaz');
    const serviceName = calendarAppointment?.service
        ?? (hasCalendarRoute ? 'Hizmet bilgisi yükleniyor…' : 'Saç boyama + fön');

    const selectedServices = SERVICE_OPTIONS.filter((item) => selectedServiceIds.includes(item.id));
    const totalAmount = 1800 + selectedServices.reduce((sum, item) => sum + item.price, 0);
    const serviceItems: VisitLine[] = selectedServices.map((item) => ({
        id: `service-${item.id}`,
        name: item.name,
        detail: 'Hizmet · sonradan eklendi',
        amount: formatMoney(item.price),
    }));
    const materialItems: VisitLine[] = MATERIAL_OPTIONS
        .filter((item) => (materialQuantities[item.id] ?? 0) > 0)
        .map((item) => ({
            id: `material-${item.id}`,
            name: item.name,
            detail: `Malzeme · ${materialQuantities[item.id]} ${item.unit}`,
            amount: 'Stoktan',
        }));
    const items: VisitLine[] = [...BASE_ITEMS, ...serviceItems, ...materialItems, NOTE_ITEM];
    const materialSheetInitial = { ...DEFAULT_MATERIAL_QUANTITIES, ...materialQuantities };

    useEffect(() => {
        const id = setInterval(() => setElapsed((current) => current + 1), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        let cancelled = false;

        if (!lookupKey || !reservationId || !date) {
            setCalendarResult(null);
            return () => { cancelled = true; };
        }

        source.day(date).then((appointments) => {
            if (cancelled) return;
            const appointment = appointments.find((item) => item.id === reservationId) ?? null;
            setCalendarResult({ key: lookupKey, appointment });
        }).catch(() => {
            if (!cancelled) setCalendarResult({ key: lookupKey, appointment: null });
        });

        return () => { cancelled = true; };
    }, [date, lookupKey, reservationId]);

    const animateItems = () => {
        if (reduceMotion) return;
        LayoutAnimation.configureNext({
            duration: 220,
            create: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
            update: { type: LayoutAnimation.Types.easeInEaseOut },
            delete: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
        });
    };

    const openSheet = (next: Exclude<VisitSheet, null>) => {
        feedback.light();
        setSheet(next);
    };

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <TopBar customerName={customerName} onBack={() => router.back()} />
            <View style={{
                alignItems: 'center',
                gap: 6,
                paddingTop: small ? 14 : 26,
                paddingHorizontal: 20,
                paddingBottom: small ? 14 : 22,
            }}>
                <Text style={{ color: c.tx2, fontSize: 15, fontWeight: '700', letterSpacing: -0.15 }}>
                    {customerName}
                </Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={[{
                    color: c.tx,
                    fontSize: small ? 58 : 76,
                    lineHeight: small ? 58 : 76,
                    fontWeight: '800',
                    letterSpacing: -3.8,
                }, numeric]}>
                    {formatElapsed(elapsed)}
                </Text>
                <Text style={{ color: c.tx, fontSize: 16, fontWeight: '600' }}>
                    {serviceName}
                </Text>
            </View>

            <View style={{ paddingTop: 4, paddingHorizontal: 18, paddingBottom: 16, flexDirection: 'row', gap: 10 }}>
                <QuickAction label="Hizmet ekle" icon="plus" onPress={() => openSheet('service')} />
                <QuickAction label="Malzeme ekle" icon="box" onPress={() => openSheet('material')} />
                <QuickAction label="Not / foto" icon="note" onPress={() => undefined} />
            </View>

            <View style={{
                paddingVertical: 14,
                paddingHorizontal: 20,
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: c.bd,
                backgroundColor: c.surf2,
            }}>
                <Text style={{
                    color: c.tx2,
                    fontSize: 13,
                    fontWeight: '700',
                    letterSpacing: 1.82,
                    textTransform: 'uppercase',
                }}>
                    Şu anki tutar
                </Text>
                <Text style={[{
                    color: c.tx,
                    fontSize: 28,
                    fontWeight: '800',
                    letterSpacing: -0.98,
                }, numeric]}>
                    {formatMoney(totalAmount)}
                </Text>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 112 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {items.map((item) => (
                    <View key={item.id}>
                        <LineItem item={item} />
                        <View style={{ height: 1, backgroundColor: c.bd }} />
                    </View>
                ))}
            </ScrollView>

            <FinishAction />

            {sheet === 'service' ? (
                <ServiceSheet
                    initialSelected={selectedServiceIds}
                    onClose={() => setSheet(null)}
                    onCommit={(selected) => {
                        animateItems();
                        setSelectedServiceIds(selected);
                        setSheet(null);
                    }}
                />
            ) : null}

            {sheet === 'material' ? (
                <MaterialSheet
                    initialQuantities={materialSheetInitial}
                    onClose={() => setSheet(null)}
                    onCommit={(quantities) => {
                        animateItems();
                        setMaterialQuantities(quantities);
                        setSheet(null);
                    }}
                />
            ) : null}
        </View>
    );
}
