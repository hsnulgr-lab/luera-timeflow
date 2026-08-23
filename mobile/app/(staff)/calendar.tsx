import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    Alert,
    Animated,
    LayoutAnimation,
    Linking,
    Platform,
    RefreshControl,
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
    EmptyDay,
    MonthFooter,
    MonthGrid,
    OfflineBar,
    Timeline,
    TimelineSkeleton,
    WeekStrip,
    animateOfflineBar,
    type AppointmentActions,
} from '../../src/components/CalendarParts';
import { headline, monthGrid, weekDays, type Appt } from '../../src/lib/calendar';
import { source } from '../../src/lib/calendarSource';
import { offlineBannerText, useConnectivity } from '../../src/lib/connectivity';
import { feedback } from '../../src/lib/feedback';
import { calendarMetrics, glow, offlineBar, useTheme } from '../../src/theme';

// Gerçek agenda bağlanana kadar “bugün” ve saat tasarım senaryosuna sabit.
// Hafta içindeki gün seçimi ise gerçek etkileşimdir ve aynı veri kaynağını okur.
const PREVIEW_TODAY = '2026-09-24';
const PREVIEW_NOW_MINUTES = 11 * 60 + 24;
const PREVIEW_LIVE_SECONDS = 24 * 60 + 18;

interface DayResult {
    date: string;
    items: Appt[];
    next: Appt | null;
}

/**
 * Bir randevunun "değişti mi?" imzası. Yalnız kartta GÖRÜNEN alanlar sayılır;
 * görünmeyen bir alanın değişmesi satırı yanıp söndürmemeli.
 */
function signatureOf(a: Appt): string {
    return [
        a.start_time, a.end_time, a.service, a.status, a.customer_name,
        a.arrived_at ?? '', a.service_ended_at ?? '', a.notes ?? '',
        a.info?.risk ?? '', a.info?.pkg?.used ?? '', a.info?.visitNo ?? '',
    ].join('|');
}

export default function Calendar() {
    const { c, dark, glass, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const scrollY = useRef(new Animated.Value(0)).current;
    const scrollRef = useRef<ScrollView>(null);
    const [selectedDate, setSelectedDate] = useState(PREVIEW_TODAY);
    const [monthOpen, setMonthOpen] = useState(false);
    const days = useMemo(() => weekDays(selectedDate), [selectedDate]);
    // Nokta göstergeleri için istenen aralık: ay açıkken ızgaranın 42 hücresi,
    // kapalıyken yalnız görünen hafta. Tek `range` çağrısı ikisini de karşılar.
    const monthCells = useMemo(() => monthGrid(selectedDate).flat(), [selectedDate]);
    const weekFrom = monthOpen ? monthCells[0].date : (days[0]?.date ?? selectedDate);
    const weekTo = monthOpen ? monthCells[monthCells.length - 1].date : (days.at(-1)?.date ?? selectedDate);
    const [dayResult, setDayResult] = useState<DayResult | null>(null);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [liveSeconds, setLiveSeconds] = useState(PREVIEW_LIVE_SECONDS);
    const [refreshing, setRefreshing] = useState(false);
    // Yenilemeden sonra yalnız DEĞİŞEN satırlar solarak belirir; değişmeyen
    // satır kıpırdamaz. Karşılaştırma için bir önceki listenin imzası tutulur.
    const [enteringIds, setEnteringIds] = useState<ReadonlySet<string>>(new Set());
    const signatures = useRef(new Map<string, string>());
    const { offline, queued } = useConnectivity();
    const bannerText = offlineBannerText(offline, queued);
    const barProgress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        animateOfflineBar(barProgress, bannerText !== null, reduceMotion);
    }, [bannerText, barProgress, reduceMotion]);
    const appointments = dayResult?.date === selectedDate ? dayResult.items : [];
    const nextAppointment = dayResult?.date === selectedDate ? dayResult.next : null;
    const loadingDay = dayResult?.date !== selectedDate;
    const isToday = selectedDate === PREVIEW_TODAY;

    useEffect(() => {
        let alive = true;
        Promise.all([
            source.day(selectedDate),
            source.nextAfter(selectedDate).catch(() => null),
        ]).then(([dayAppointments, next]) => {
            if (!alive) return;
            // Gün değişiminde beliriş animasyonu YOK: zaten yeni bir gün, her
            // satır yeni. Solma yalnız yenilemede anlam taşır.
            signatures.current = new Map(dayAppointments.map((a) => [a.id, signatureOf(a)]));
            setEnteringIds(new Set());
            setDayResult({ date: selectedDate, items: dayAppointments, next });
        }).catch(() => {
            if (alive) setDayResult({ date: selectedDate, items: [], next: null });
        });
        return () => { alive = false; };
    }, [selectedDate]);

    /**
     * Aşağı çekip yenileme. Çekme hareketi sistemin `RefreshControl`'ü —
     * parmağı birebir takip eder, bizim eğrimiz yoktur. Bizim tanımladığımız
     * tek şey sonrası: yalnız değişen satırlar 140 ms'de opaklıkla belirir.
     */
    const refresh = useCallback(async () => {
        setRefreshing(true);
        feedback.light();
        try {
            const [dayAppointments, next, dayCounts] = await Promise.all([
                source.day(selectedDate),
                source.nextAfter(selectedDate).catch(() => null),
                source.range(weekFrom, weekTo).catch(() => null),
            ]);

            const previous = signatures.current;
            const changed = new Set<string>();
            const nextSignatures = new Map<string, string>();
            for (const appointment of dayAppointments) {
                const signature = signatureOf(appointment);
                nextSignatures.set(appointment.id, signature);
                if (previous.get(appointment.id) !== signature) changed.add(appointment.id);
            }

            signatures.current = nextSignatures;
            setEnteringIds(changed);
            setDayResult({ date: selectedDate, items: dayAppointments, next });
            if (dayCounts) setCounts(dayCounts);
        } finally {
            setRefreshing(false);
        }
    }, [selectedDate, weekFrom, weekTo]);

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
        const [year, month] = selectedDate.split('-').map(Number);
        const monthName = [
            'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
        ][month - 1] ?? '';
        // Ay açıkken alt satır günü değil GÖRÜNÜMÜ anlatır; gün sayısı zaten
        // ızgarada. Tasarım: "Eylül 2026 · ay görünümü".
        if (monthOpen) return `${monthName} ${year} · ay görünümü`;
        if (!loadingDay) return headline(selectedDate, PREVIEW_TODAY, appointments);
        return `${monthName} ${year} · yükleniyor…`;
    }, [appointments, loadingDay, monthOpen, selectedDate]);

    const selectDay = useCallback((dateISO: string) => {
        if (dateISO === selectedDate) return;
        feedback.selection();
        setSelectedDate(dateISO);
        scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
    }, [reduceMotion, selectedDate]);

    /**
     * Ay ızgarasının açılıp kapanması. Hareket sözleşmesi 08: 260 ms
     * easeInEaseOut, tek `LayoutAnimation`. Yükseklik animasyonu burada
     * kaçınılmaz — sözleşme bunu bilerek `LayoutAnimation`'a devrediyor.
     * "Hareketi azalt" açıkken `configureNext` hiç çağrılmaz.
     */
    const setMonthOpenAnimated = useCallback((open: boolean) => {
        if (!reduceMotion) {
            LayoutAnimation.configureNext({
                duration: 260,
                create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                update: { type: LayoutAnimation.Types.easeInEaseOut },
                delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            });
        }
        setMonthOpen(open);
    }, [reduceMotion]);

    const toggleMonth = useCallback(() => {
        feedback.selection();
        setMonthOpenAnimated(!monthOpen);
        scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
    }, [monthOpen, reduceMotion, setMonthOpenAnimated]);

    /** Izgaradan gün seçmek ızgarayı kapatır: seçim yapıldı, şerit o haftaya kayar. */
    const selectFromMonth = useCallback((dateISO: string) => {
        feedback.selection();
        setSelectedDate(dateISO);
        setMonthOpenAnimated(false);
        scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
    }, [reduceMotion, setMonthOpenAnimated]);

    return (
        <View
            collapsable={false}
            style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}
        >
            <Animated.ScrollView
                ref={scrollRef}
                style={{
                    flex: 1,
                    zIndex: 1,
                    // Bant indiğinde içerik aynı miktarda aşağı kayar. Yükseklik
                    // değil DÖNÜŞÜM: ikisi de native sürücüde kalsın.
                    transform: [{
                        translateY: barProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, offlineBar.height],
                        }),
                    }],
                }}
                contentContainerStyle={{
                    paddingBottom: calendarMetrics.bottomInset + offlineBar.height,
                }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                refreshControl={(
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={refresh}
                        tintColor={c.tx2}
                        colors={[c.or]}
                        progressBackgroundColor={c.surf}
                    />
                )}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true },
                )}
            >
                <Animated.View style={{ opacity: expandedOpacity }}>
                    <DayHeader
                        dateISO={selectedDate}
                        subtitle={expandedSubtitle}
                        monthOpen={monthOpen}
                        onToggleMonth={toggleMonth}
                    />
                </Animated.View>

                {monthOpen ? (
                    <>
                        <MonthGrid
                            anchorISO={selectedDate}
                            selectedISO={selectedDate}
                            counts={counts}
                            onSelect={selectFromMonth}
                        />
                        <MonthFooter onClose={toggleMonth} />
                        {/* Tasarımdaki `.hairfull`: ızgarayı listeden ayıran tam
                            genişlik saç teli. Hafta şeridinde bu çizgi şeridin
                            kendi alt kenarlığıdır; ay görünümünde ayrı durur. */}
                        <View style={{
                            marginTop: calendarMetrics.cardGap,
                            height: StyleSheet.hairlineWidth,
                            backgroundColor: c.bd,
                        }} />
                    </>
                ) : (
                    <WeekStrip
                        days={days}
                        selectedISO={selectedDate}
                        counts={counts}
                        onSelect={selectDay}
                    />
                )}

                <View>
                    {loadingDay ? (
                        <TimelineSkeleton />
                    ) : appointments.length > 0 ? (
                        <Timeline
                            appointments={appointments}
                            nowMinutes={PREVIEW_NOW_MINUTES}
                            isToday={isToday}
                            elapsedSecondsById={elapsedSecondsById}
                            actions={appointmentActions}
                            enteringIds={enteringIds}
                        />
                    ) : (
                        <EmptyDay
                            dateISO={selectedDate}
                            nextAppointment={nextAppointment}
                            onGoNext={(appointment) => selectDay(appointment.date)}
                        />
                    )}
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

            {/* Bant en üstte: toplanmış başlık da dâhil her şeyin önünde durur,
                çünkü söylediği şey ekranın tamamını ilgilendiriyor. */}
            <OfflineBar
                text={bannerText}
                progress={barProgress}
                style={{
                    position: 'absolute',
                    zIndex: 40,
                    top: insets.top,
                    left: 0,
                    right: 0,
                }}
            />

        </View>
    );
}
