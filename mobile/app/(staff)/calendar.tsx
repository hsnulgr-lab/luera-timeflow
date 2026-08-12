import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
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
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
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

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <LinearGradient
                pointerEvents="none"
                colors={dark ? glow.dark : glow.light}
                style={{
                    position: 'absolute',
                    top: insets.top,
                    left: 0,
                    right: 0,
                    height: glow.height,
                }}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: calendarMetrics.bottomInset }}
                showsVerticalScrollIndicator={false}
            >
                <DayHeader
                    dateISO={PREVIEW_DATE}
                    subtitle={headline(PREVIEW_DATE, PREVIEW_DATE, appointments)}
                />
                <WeekStrip
                    days={days}
                    selectedISO={PREVIEW_DATE}
                    counts={counts}
                    onSelect={() => undefined}
                />
                <Timeline
                    appointments={appointments}
                    nowMinutes={PREVIEW_NOW_MINUTES}
                    isToday
                    elapsedSecondsById={elapsedSecondsById}
                    actions={previewActions}
                />
            </ScrollView>
        </View>
    );
}
