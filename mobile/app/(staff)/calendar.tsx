import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
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
import { calendarMetrics, glow, useTheme } from '../../src/theme';

// Bu tur yalnız ana kompozisyonu doğruluyor. Tarih ve saat bilinçli olarak
// tasarım senaryosuna sabit; sonraki adımda gün seçimi devreye girdiğinde aynı
// bileşenler seçilen tarihle beslenecek.
const PREVIEW_DATE = '2026-09-24';
const PREVIEW_NOW_MINUTES = 11 * 60 + 24;
const PREVIEW_LIVE_SECONDS = 24 * 60 + 18;

export default function Calendar() {
    const { c, dark, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;
    const days = useMemo(() => weekDays(PREVIEW_DATE), []);
    const [appointments, setAppointments] = useState<Appt[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [liveSeconds, setLiveSeconds] = useState(PREVIEW_LIVE_SECONDS);

    useEffect(() => {
        let alive = true;
        Promise.all([
            source.day(PREVIEW_DATE),
            source.range(days[0].date, days[days.length - 1].date),
        ]).then(([dayAppointments, dayCounts]) => {
            if (!alive) return;
            setAppointments(dayAppointments);
            setCounts(dayCounts);
        });
        return () => { alive = false; };
    }, [days]);

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
        const live = appointments.find((appointment) => (
            appointment.arrived_at && !appointment.service_ended_at
        ));
        return live ? { [live.id]: liveSeconds } : {};
    }, [appointments, liveSeconds]);

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
        const [, month] = PREVIEW_DATE.split('-').map(Number);
        const monthName = [
            'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
        ][month - 1] ?? '';
        return `${monthName} · ${appointments.length} randevu`;
    }, [appointments.length]);

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
                    dateISO={PREVIEW_DATE}
                    subtitle={compactSubtitle}
                />
            </Animated.View>

            <Animated.ScrollView
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
                        dateISO={PREVIEW_DATE}
                        subtitle={headline(PREVIEW_DATE, PREVIEW_DATE, appointments)}
                    />
                </Animated.View>

                <View style={{ zIndex: 20, backgroundColor: c.bg, overflow: 'visible' }}>
                    <Animated.View style={{ transform: [{ translateY: chromeOffset }] }}>
                        <WeekStrip
                            days={days}
                            selectedISO={PREVIEW_DATE}
                            counts={counts}
                            onSelect={() => undefined}
                        />
                    </Animated.View>
                </View>

                <Animated.View style={{ transform: [{ translateY: chromeOffset }] }}>
                    <Timeline
                        appointments={appointments}
                        nowMinutes={PREVIEW_NOW_MINUTES}
                        isToday
                        elapsedSecondsById={elapsedSecondsById}
                        actions={previewActions}
                    />
                </Animated.View>
            </Animated.ScrollView>
        </View>
    );
}
