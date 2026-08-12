import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
    const { c, dark, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
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

    // Kart eylemleri bir sonraki adımda gerçek rotalara bağlanacak. Şimdilik
    // hedefleri görünür tutmak, tasarımın ölçülerini doğru doğrulamamızı sağlar.
    const previewActions = useMemo<AppointmentActions>(() => {
        const noOp = () => undefined;
        return {
            onOpen: noOp,
            onCall: noOp,
            onMore: noOp,
            onCustomer: noOp,
            onStart: noOp,
            onResume: noOp,
        };
    }, []);

    const elapsedSecondsById = useMemo(() => {
        if (!isToday) return {};
        const live = appointments.find((appointment) => (
            appointment.arrived_at && !appointment.service_ended_at
        ));
        return live ? { [live.id]: liveSeconds } : {};
    }, [appointments, isToday, liveSeconds]);

    const expandedOpacity = scrollY.interpolate({
        inputRange: reduceMotion ? [0, 63.99, 64] : [0, 40, 64],
        outputRange: reduceMotion ? [1, 1, 0] : [1, 1, 0],
        extrapolate: 'clamp',
    });
    const expandedTranslateY = scrollY.interpolate({
        inputRange: reduceMotion ? [0, 63.99, 64] : [0, 64],
        outputRange: reduceMotion ? [0, 0, -8] : [0, -8],
        extrapolate: 'clamp',
    });
    const compactOpacity = scrollY.interpolate({
        inputRange: reduceMotion ? [0, 63.99, 64] : [0, 40, 64],
        outputRange: reduceMotion ? [0, 0, 1] : [0, 0, 1],
        extrapolate: 'clamp',
    });
    const compactTranslateY = scrollY.interpolate({
        inputRange: reduceMotion ? [0, 63.99, 64] : [0, 64],
        outputRange: reduceMotion ? [-6, -6, 0] : [-6, 0],
        extrapolate: 'clamp',
    });
    const chromeOffset = scrollY.interpolate({
        inputRange: reduceMotion ? [0, 63.99, 64] : [0, 64],
        outputRange: reduceMotion ? [0, 0, 52] : [0, 52],
        extrapolate: 'clamp',
    });
    const glowOpacity = scrollY.interpolate({
        inputRange: reduceMotion ? [0, 63.99, 64] : [0, 64],
        outputRange: reduceMotion ? [1, 1, 0] : [1, 0],
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
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
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
                    dateISO={selectedDate}
                    subtitle={compactSubtitle}
                />
            </Animated.View>

            <Animated.ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: calendarMetrics.bottomInset + 52 }}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={[1]}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true },
                )}
            >
                <Animated.View
                    style={{
                        opacity: expandedOpacity,
                        transform: [{ translateY: expandedTranslateY }],
                    }}
                >
                    <DayHeader
                        dateISO={selectedDate}
                        subtitle={expandedSubtitle}
                    />
                </Animated.View>

                <View style={{ zIndex: 20, backgroundColor: c.bg, overflow: 'visible' }}>
                    <Animated.View style={{ transform: [{ translateY: chromeOffset }] }}>
                        <WeekStrip
                            days={days}
                            selectedISO={selectedDate}
                            counts={counts}
                            onSelect={selectDay}
                        />
                    </Animated.View>
                </View>

                <Animated.View style={{ transform: [{ translateY: chromeOffset }] }}>
                    {!loadingDay ? (
                        <Timeline
                            appointments={appointments}
                            nowMinutes={PREVIEW_NOW_MINUTES}
                            isToday={isToday}
                            elapsedSecondsById={elapsedSecondsById}
                            actions={previewActions}
                        />
                    ) : null}
                </Animated.View>
            </Animated.ScrollView>
        </View>
    );
}
