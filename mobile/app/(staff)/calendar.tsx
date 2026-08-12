import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    Alert,
    Animated,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    DayHeader,
    Timeline,
    WeekStrip,
    type AppointmentActions,
} from '../../src/components/CalendarParts';
import { headline, weekDays, type Appt } from '../../src/lib/calendar';
import { source } from '../../src/lib/calendarSource';
import { feedback } from '../../src/lib/feedback';
import { calendarMetrics, glow, useTheme } from '../../src/theme';

// Gerçek agenda bağlanana kadar “bugün” ve saat tasarım senaryosuna sabit.
// Hafta içindeki gün seçimi ise gerçek etkileşimdir ve aynı veri kaynağını okur.
const PREVIEW_TODAY = '2026-09-24';
const PREVIEW_NOW_MINUTES = 11 * 60 + 24;
const PREVIEW_LIVE_SECONDS = 24 * 60 + 18;

interface DayResult {
    date: string;
    items: Appt[];
}

export default function Calendar() {
    const { c, dark, glass, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const scrollY = useRef(new Animated.Value(0)).current;
    const scrollRef = useRef<ScrollView>(null);
    const [selectedDate, setSelectedDate] = useState(PREVIEW_TODAY);
    const days = useMemo(() => weekDays(selectedDate), [selectedDate]);
    const weekFrom = days[0]?.date ?? selectedDate;
    const weekTo = days.at(-1)?.date ?? selectedDate;
    const [dayResult, setDayResult] = useState<DayResult | null>(null);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [liveSeconds, setLiveSeconds] = useState(PREVIEW_LIVE_SECONDS);
    const appointments = dayResult?.date === selectedDate ? dayResult.items : [];
    const loadingDay = dayResult?.date !== selectedDate;
    const isToday = selectedDate === PREVIEW_TODAY;

    useEffect(() => {
        let alive = true;
        source.day(selectedDate).then((dayAppointments) => {
            if (!alive) return;
            setDayResult({ date: selectedDate, items: dayAppointments });
        }).catch(() => {
            if (alive) setDayResult({ date: selectedDate, items: [] });
        });
        return () => { alive = false; };
    }, [selectedDate]);

    useEffect(() => {
        let alive = true;
        setCounts({});
        source.range(weekFrom, weekTo).then((dayCounts) => {
            if (alive) setCounts(dayCounts);
        }).catch(() => {
            if (alive) setCounts({});
        });
        return () => { alive = false; };
    }, [weekFrom, weekTo]);

    useEffect(() => {
        const id = setInterval(() => setLiveSeconds((value) => value + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const callCustomer = useCallback((appointment: Appt) => {
        const dialable = appointment.customer_phone
            ?.trim()
            .replace(/[^\d+]/g, '')
            .replace(/(?!^)\+/g, '');

        if (!dialable) {
            Alert.alert('Telefon numarası yok', 'Bu müşterinin kayıtlı bir telefon numarası bulunmuyor.');
            return;
        }

        void Linking.openURL(`tel:${dialable}`).catch(() => {
            Alert.alert('Arama başlatılamadı', 'Telefon uygulaması şu anda açılamadı.');
        });
    }, []);

    const unavailableAction = useCallback((title: string) => {
        Alert.alert(
            title,
            'Bu işlem gerçek takvim verisi ve sunucu bağlantısı tamamlandığında etkinleştirilecek.',
        );
    }, []);

    const openAppointmentMenu = useCallback((appointment: Appt) => {
        const menuItems = [
            ...(appointment.customer_phone ? [{ label: 'Ara', run: () => callCustomer(appointment) }] : []),
            { label: 'Notu düzenle', run: () => unavailableAction('Notu düzenle') },
            { label: 'İptal talebi', run: () => unavailableAction('İptal talebi') },
        ];

        if (Platform.OS === 'ios') {
            const cancelIndex = menuItems.length;
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    title: appointment.customer_name,
                    options: [...menuItems.map((item) => item.label), 'Vazgeç'],
                    cancelButtonIndex: cancelIndex,
                    destructiveButtonIndex: menuItems.findIndex((item) => item.label === 'İptal talebi'),
                },
                (buttonIndex) => menuItems[buttonIndex]?.run(),
            );
            return;
        }

        Alert.alert(
            appointment.customer_name,
            undefined,
            menuItems.map((item) => ({ text: item.label, onPress: item.run })),
            { cancelable: true },
        );
    }, [callCustomer, unavailableAction]);

    const appointmentActions = useMemo<AppointmentActions>(() => {
        return {
            onOpen: (appointment) => router.push({
                pathname: '/appointment',
                params: { reservationId: appointment.id, date: appointment.date },
            }),
            onCall: callCustomer,
            onMore: openAppointmentMenu,
            onCustomer: (appointment) => {
                if (!appointment.customer_id) {
                    Alert.alert('Müşteri kartı bulunamadı');
                    return;
                }
                router.push({
                    pathname: '/customer',
                    params: {
                        customerId: appointment.customer_id,
                        reservationId: appointment.id,
                        date: appointment.date,
                    },
                });
            },
            onStart: (appointment) => router.push({
                pathname: '/visit',
                params: { reservationId: appointment.id, date: appointment.date },
            }),
            onResume: (appointment) => router.push({
                pathname: '/visit',
                params: { reservationId: appointment.id, date: appointment.date },
            }),
        };
    }, [callCustomer, openAppointmentMenu, router]);

    const elapsedSecondsById = useMemo(() => {
        if (!isToday) return {};
        const live = appointments.find((appointment) => (
            appointment.arrived_at && !appointment.service_ended_at
        ));
        return live ? { [live.id]: liveSeconds } : {};
    }, [appointments, isToday, liveSeconds]);

    const expandedOpacity = scrollY.interpolate({
        inputRange: [0, 48],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });
    const compactOpacity = scrollY.interpolate({
        inputRange: [32, 64],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });
    const compactTranslateY = scrollY.interpolate({
        inputRange: [32, 64],
        outputRange: [6, 0],
        extrapolate: 'clamp',
    });
    const compactChromeOpacity = scrollY.interpolate({
        inputRange: [0, 24],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });
    const glowOpacity = scrollY.interpolate({
        inputRange: [0, 64],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const compactSubtitle = useMemo(() => {
        const [, month] = selectedDate.split('-').map(Number);
        const monthName = [
            'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
        ][month - 1] ?? '';
        const count = appointments.length === 0 ? 'randevu yok' : `${appointments.length} randevu`;
        return `${monthName} · ${loadingDay ? 'Yükleniyor…' : count}`;
    }, [appointments.length, loadingDay, selectedDate]);

    const expandedSubtitle = useMemo(() => {
        if (!loadingDay) return headline(selectedDate, PREVIEW_TODAY, appointments);
        const [year, month] = selectedDate.split('-').map(Number);
        const monthName = [
            'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
        ][month - 1] ?? '';
        return `${monthName} ${year} · yükleniyor…`;
    }, [appointments, loadingDay, selectedDate]);

    const selectDay = useCallback((dateISO: string) => {
        if (dateISO === selectedDate) return;
        feedback.selection();
        setSelectedDate(dateISO);
        scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
    }, [reduceMotion, selectedDate]);

    return (
        <View
            collapsable={false}
            style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}
        >
            <Animated.ScrollView
                ref={scrollRef}
                style={{ flex: 1, zIndex: 1 }}
                contentContainerStyle={{ paddingBottom: calendarMetrics.bottomInset }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true },
                )}
            >
                <Animated.View style={{ opacity: expandedOpacity }}>
                    <DayHeader
                        dateISO={selectedDate}
                        subtitle={expandedSubtitle}
                    />
                </Animated.View>

                <WeekStrip
                    days={days}
                    selectedISO={selectedDate}
                    counts={counts}
                    onSelect={selectDay}
                />

                <View>
                    {!loadingDay ? (
                        <Timeline
                            appointments={appointments}
                            nowMinutes={PREVIEW_NOW_MINUTES}
                            isToday={isToday}
                            elapsedSecondsById={elapsedSecondsById}
                            actions={appointmentActions}
                        />
                    ) : null}
                </View>
            </Animated.ScrollView>

            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    zIndex: 0,
                    top: 0,
                    left: 0,
                    right: 0,
                    height: glow.height + insets.top,
                    opacity: glowOpacity,
                }}
            >
                <LinearGradient
                    colors={dark ? glow.dark : glow.light}
                    locations={glow.locations}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    zIndex: 29,
                    top: insets.top,
                    left: 0,
                    right: 0,
                    height: 52,
                    opacity: compactChromeOpacity,
                }}
            >
                {glass ? (
                    <GlassView
                        glassEffectStyle="regular"
                        tintColor={c.tint}
                        style={StyleSheet.absoluteFill}
                    />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surf }]} />
                )}
                <View style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: c.bd,
                }} />
            </Animated.View>

            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    zIndex: 30,
                    top: insets.top,
                    left: 0,
                    right: 0,
                    opacity: compactOpacity,
                    transform: [{ translateY: compactTranslateY }],
                }}
            >
                <DayHeader
                    compact
                    transparent
                    dateISO={selectedDate}
                    subtitle={compactSubtitle}
                />
            </Animated.View>

        </View>
    );
}
