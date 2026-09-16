import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Linking,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView as RNScrollView,
    Text,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    StaffAppointmentRow,
    StaffEmptyNoteView,
    StaffFootActionsView,
    StaffHeroHead,
    StaffHeroPanelCard,
    StaffListHeaderView,
    StaffNowLineView,
    StaffRail,
    StaffShiftBarView,
    StaffSwapStack,
    StaffTopBar,
    useStaffIntro,
    useStaffKindSwap,
} from './StaffDayParts';
import {
    AppointmentMenu,
    MoveResultSheet,
    MoveSheet,
} from './MoveParts';
import {
    buildStaffDayState,
    type StaffActionCode,
    type StaffDayState,
} from '../lib/staffDay';
import {
    addDaysISO,
    nowInMinutes,
    toMinutes,
    todayISO,
    type Appt,
} from '../lib/calendar';
import {
    applyMove,
    undoMove,
    type MoveResult,
    type MoveTarget,
} from '../lib/moveAppointment';
import type { StaffOption } from '../lib/createFlow';
import type { StaffPresence } from '../lib/managerFlow';
import { DaySkeleton } from './EmptyDayParts';
import {
    calendarMetrics,
    font,
    staffDayGlow,
    staffDayMetrics,
    staffDayMotion,
    useTheme,
} from '../theme';

const ScrollView = Animated.ScrollView;

/**
 * Müdür 24 — Personel Günü Ana Bileşeni.
 *
 * Yatay ScrollView (pagingEnabled) ile personeller arası geçiş.
 * Her sayfa kendi bağımsız düşey ScrollView'una sahiptir.
 * Sürmekte olan randevu listeden çıkarılıp kahraman karta alınır.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 24 Personel Gunu.html`.
 */

export interface StaffDayProps {
    initialStaffId?: string;
    presence: readonly StaffPresence[];
    appointments: readonly Appt[];
    /**
     * Gün henüz okunmadı. Boş dizi ile yükleniyor AYNI ŞEY DEĞİL: veri
     * gelmeden "bugün randevu yok" yazmak yanlış cümledir ve saniyeler sonra
     * kendini yalanlar — ekran iki kez yükleniyormuş gibi görünür.
     */
    loading?: boolean;
    /**
     * Taşımayı SUNUCUYA yazar; `true` dönerse yazıldı.
     *
     * Ekran bunu kendisi yapmıyordu: taşıma yalnız yerel bir katmana
     * düşüyor, sonuç sayfası "taşındı" diyordu ve ekrandan çıkınca randevu
     * eski yerine dönüyordu. Yazma yolu sayfanın değil, onu açan ekranın işi
     * — kilit damgaları orada okunuyor (`useMoveWriter`).
     */
    onCommitMove: (appointment: Appt, next: Appt, staffName?: string | null) => Promise<boolean>;
    /** Salonun o günkü açık aralığı — taşıma menüsünün saatleri (`dayWindowOf`). */
    openHours?: { from: number; to: number } | null;
    onBack: () => void;
    onOpenAppointment: (appointment: Appt) => void;
    onCreateAppointment?: (staffId: string, dateISO: string) => void;
}

export function StaffDay({
    initialStaffId,
    presence,
    appointments,
    loading = false,
    onCommitMove,
    openHours,
    onBack,
    onOpenAppointment,
    onCreateAppointment,
}: StaffDayProps) {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width);

    // Başlangıç index'i
    const initialIndex = useMemo(() => {
        if (!initialStaffId) return 0;
        const found = presence.findIndex((p) => p.id === initialStaffId);
        return found >= 0 ? found : 0;
    }, [initialStaffId, presence]);

    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const scrollRef = useRef<RNScrollView>(null);
    const scrollX = useRef(new Animated.Value(initialIndex * Dimensions.get('window').width)).current;

    // Ekran genişliği değişirse (veya başlangıçta) doğru sayfaya kaydır
    useEffect(() => {
        const sub = Dimensions.addEventListener('change', ({ window }) => {
            setScreenWidth(window.width);
        });
        return () => sub.remove();
    }, []);

    // İlk açılışta seçili personelin sayfasına git
    useEffect(() => {
        if (initialIndex > 0 && scrollRef.current) {
            setTimeout(() => {
                scrollRef.current?.scrollTo({ x: initialIndex * screenWidth, animated: false });
            }, 50);
        }
    }, [initialIndex, screenWidth]);

    const handleSelectRail = useCallback((index: number) => {
        setActiveIndex(index);
        scrollRef.current?.scrollTo({ x: index * screenWidth, animated: !reduceMotion });
    }, [screenWidth, reduceMotion]);

    const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const page = Math.round(offsetX / screenWidth);
        if (page >= 0 && page < presence.length && page !== activeIndex) {
            setActiveIndex(page);
        }
    }, [activeIndex, presence.length, screenWidth]);

    // Taşıma (MoveSheet / MoveResultSheet) durumu
    const [menuFor, setMenuFor] = useState<Appt | null>(null);
    const [moveFor, setMoveFor] = useState<{ appointment: Appt; mode: 'time' | 'staff' } | null>(null);
    const [result, setResult] = useState<MoveResult | null>(null);

    const staffOptions: StaffOption[] = useMemo(
        () => presence.map((candidate) => ({
            id: candidate.id,
            initials: candidate.initials,
            name: candidate.name,
            available: candidate.state === 'busy' || candidate.state === 'free',
            reason: candidate.state === 'leave' ? 'izinli' : candidate.state === 'off' ? 'çalışmıyor' : undefined,
        })),
        [presence],
    );

    const commitMove = async (appointment: Appt, target: MoveTarget) => {
        const currentPerson = presence[activeIndex] ?? presence[0];
        const ok = await onCommitMove(appointment, applyMove(appointment, target), target.staffName);
        // Sonuç sayfası YALNIZ gerçekten taşındıysa açılıyor.
        if (!ok) return;
        setResult({
            appointment,
            fromStartMinutes: toMinutes(appointment.start_time),
            fromStaffName: currentPerson.name,
            toStartMinutes: target.startMinutes,
            toStaffName: target.staffName,
        });
    };

    // Zaman güncellemesi (dakikada bir)
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        const timer = setInterval(() => setNowMinutes(nowInMinutes()), 60_000);
        return () => clearInterval(timer);
    }, []);

    const activePerson = presence[activeIndex] ?? presence[0];

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Üst parıltı — üst çubuk ve şeridin arkasında, 120 pt */}
            <LinearGradient
                colors={staffDayGlow.colors}
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: staffDayGlow.height + insets.top,
                }}
            />

            {/* Üst çubuk: yalnız geri — kimlik kahraman blokta */}
            <StaffTopBar onBack={onBack} topInset={insets.top} />

            {/* İsim şeridi */}
            <StaffRail
                presence={presence}
                activeIndex={activeIndex}
                onSelect={handleSelectRail}
                scrollX={scrollX}
                screenWidth={screenWidth}
            />

            {/* Yatay Paging ScrollView */}
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: true },
                )}
                onMomentumScrollEnd={handleScrollEnd}
                style={{ flex: 1 }}
            >
                {presence.map((person, index) => {
                    const isCurrentPage = index === activeIndex;
                    const staffAppts = appointments.filter((a) => a.staff_id === person.id);

                    return (
                        <View key={person.id} style={{ width: screenWidth, flex: 1 }}>
                            <StaffDayPage
                                person={person}
                                presence={presence}
                                appointments={staffAppts}
                                loading={loading}
                                nowMinutes={nowMinutes}
                                isActive={isCurrentPage}
                                isEntry={index === initialIndex}
                                onOpenAppointment={onOpenAppointment}
                                onMoreAppointment={setMenuFor}
                                onCreateAppointment={onCreateAppointment}
                                onGoFreeStaff={() => {
                                    const freeIdx = presence.findIndex((p) => p.state === 'free');
                                    if (freeIdx >= 0) handleSelectRail(freeIdx);
                                }}
                                bottomInset={insets.bottom}
                            />
                        </View>
                    );
                })}
            </ScrollView>

            {/* Seçenekler Menüsü */}
            {menuFor ? (
                <AppointmentMenu
                    visible
                    appointment={menuFor}
                    staffName={activePerson.name}
                    onDismiss={() => setMenuFor(null)}
                    onPick={(action) => {
                        const appointment = menuFor;
                        setMenuFor(null);
                        if (action === 'time' || action === 'staff') {
                            setMoveFor({ appointment, mode: action });
                            return;
                        }
                        onOpenAppointment(appointment);
                    }}
                />
            ) : null}

            {/* Taşıma Sayfası */}
            {moveFor ? (
                <MoveSheet
                    visible
                    mode={moveFor.mode}
                    appointment={moveFor.appointment}
                    day={appointments}
                    hours={openHours}
                    staff={staffOptions}
                    onDismiss={() => setMoveFor(null)}
                    onPick={(target) => {
                        const { appointment } = moveFor;
                        setMoveFor(null);
                        if (!target.unchanged) void commitMove(appointment, target);
                    }}
                />
            ) : null}

            {/* Taşıma Sonuç Kartı */}
            <MoveResultSheet
                result={result}
                nowMinutes={nowMinutes}
                today={todayISO()}
                onUndo={(done) => {
                    // Geri al da bir YAZMA: yerel katmanı silmek randevuyu
                    // sunucuda eski saatine döndürmezdi.
                    void onCommitMove(done.appointment, undoMove(done), done.fromStaffName);
                    setResult(null);
                }}
                onCall={(phone) => { void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`); }}
                onDone={() => setResult(null)}
            />
        </View>
    );
}

// ── Tek Bir Personelin Düşey Sayfası ────────────────────────────────────────

function StaffDayPage({
    person,
    presence,
    appointments,
    loading,
    nowMinutes,
    isActive,
    isEntry,
    onOpenAppointment,
    onMoreAppointment,
    onCreateAppointment,
    onGoFreeStaff,
    bottomInset,
}: {
    person: StaffPresence;
    presence: readonly StaffPresence[];
    appointments: readonly Appt[];
    loading: boolean;
    nowMinutes: number;
    isActive: boolean;
    isEntry: boolean;
    onOpenAppointment: (appointment: Appt) => void;
    onMoreAppointment: (appointment: Appt) => void;
    onCreateAppointment?: (staffId: string, dateISO: string) => void;
    onGoFreeStaff: () => void;
    bottomInset: number;
}) {
    const { c, reduceMotion } = useTheme();

    // Canlı sayaç: Yalnız aktif sayfadaysa saniyede bir artar
    const [liveSeconds, setLiveSeconds] = useState(() => (person.minutes ?? 0) * 60);

    useEffect(() => {
        if (!isActive || person.state !== 'busy') return;
        const timer = setInterval(() => {
            setLiveSeconds((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [isActive, person.state]);

    /*
     * Durum değişimi hareketi (3. an) GERÇEK durum değişikliğiyle tetiklenir:
     * useStaffKindSwap zaten dayState.kind değişimini dinliyor. Zamanlayıcıyla
     * "işlemde → müsait" oynatmak salonun hâlini yalan söylemek olurdu.
     */
    const dayState: StaffDayState = useMemo(() => {
        return buildStaffDayState(
            person,
            appointments,
            presence,
            nowMinutes,
            liveSeconds,
            'Kuaför',
        );
    }, [person, appointments, presence, nowMinutes, liveSeconds]);

    const emptyKind = dayState.kind === 'empty' || dayState.kind === 'leave' || dayState.kind === 'off';
    const intro = useStaffIntro(isEntry, emptyKind, reduceMotion);
    const swap = useStaffKindSwap(dayState, reduceMotion);

    const panelRise = intro.panel.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.enter.panelRise, 0],
    });
    const listRise = intro.list.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.enter.listRise, 0],
    });
    const emptyHeroY = intro.emptyHero.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.empty.rise, 0],
    });
    const emptyNoteY = intro.emptyNote.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.empty.rise, 0],
    });
    const emptyShiftY = intro.emptyShift.interpolate({
        inputRange: [0, 1],
        outputRange: [staffDayMotion.empty.rise, 0],
    });

    /*
     * Eylem ETİKETE göre değil koda göre dallanır. Etiketle dallanınca
     * "Yarına randevu ver" hiçbir dala girmiyordu — düğme ölüydü.
     */
    const runAction = useCallback((action: StaffActionCode | undefined) => {
        if (!action) return;
        if (action === 'book-today') {
            onCreateAppointment?.(person.id, todayISO());
            return;
        }
        if (action === 'book-tomorrow') {
            onCreateAppointment?.(person.id, addDaysISO(todayISO(), 1));
            return;
        }
        if (action === 'call') {
            // Numara yoksa düğme zaten çizilmedi; yine de uydurma numara yok.
            if (!person.phone) return;
            void Linking.openURL(`tel:${person.phone.replace(/\s/g, '')}`);
            return;
        }
        if (action === 'free-staff') onGoFreeStaff();
    }, [onCreateAppointment, onGoFreeStaff, person.id, person.phone]);

    const handlePrimary = () => runAction(dayState.primaryAction?.action);
    const handleSecondary = () => runAction(dayState.secondaryAction?.action);
    const handleGhost = () => runAction(dayState.ghostAction?.action);

    /*
     * Gün okunmadan hiçbir cümle kurulmaz. Boş dizi ile "randevu yok" yazmak
     * yanlış bilgidir ve veri gelince kendini yalanlar — kullanıcı bunu
     * "sayfa iki kez yüklendi" diye görür. İskelet iddia etmez, yer tutar.
     */
    if (loading) {
        return (
            <View style={{ flex: 1 }}>
                <DaySkeleton />
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingBottom: calendarMetrics.bottomInset,
                }}
            >
                {/* Kahraman Bölümü */}
                <View style={{
                    paddingTop: staffDayMetrics.padTop,
                    paddingHorizontal: staffDayMetrics.padX,
                }}>
                    {emptyKind ? (
                        <Animated.View style={{
                            opacity: intro.emptyHero,
                            transform: reduceMotion ? [] : [{ translateY: emptyHeroY }],
                        }}>
                            <StaffHeroHead
                                initials={dayState.initials}
                                state={person.state}
                                badgeText={dayState.badgeText}
                                given={dayState.given}
                                family={dayState.family}
                                role={dayState.role}
                                stampText={dayState.stampText}
                                stampTone={dayState.stampTone}
                            />
                            {dayState.panel ? (
                                <StaffHeroPanelCard panel={dayState.panel} />
                            ) : null}
                        </Animated.View>
                    ) : (
                        <>
                            <StaffHeroHead
                                initials={dayState.initials}
                                state={person.state}
                                badgeText={dayState.badgeText}
                                given={dayState.given}
                                family={dayState.family}
                                role={dayState.role}
                                stampText={dayState.stampText}
                                stampTone={dayState.stampTone}
                                enterRing={intro.ring}
                                swapOut={swap.out}
                                swapIn={swap.enter}
                                leaving={swap.leaving}
                            />
                            {dayState.panel || swap.leaving?.panel ? (
                                <Animated.View style={{
                                    opacity: intro.panel,
                                    transform: reduceMotion ? [] : [{ translateY: panelRise }],
                                }}>
                                    <StaffSwapStack
                                        leaving={swap.leaving?.panel
                                            ? <StaffHeroPanelCard panel={swap.leaving.panel} flush />
                                            : null}
                                        out={swap.out}
                                        enter={swap.enter}
                                        height={staffDayMetrics.panelHeight}
                                    >
                                        {dayState.panel ? (
                                            <StaffHeroPanelCard panel={dayState.panel} flush />
                                        ) : null}
                                    </StaffSwapStack>
                                </Animated.View>
                            ) : null}
                        </>
                    )}
                </View>

                {/* Boş Hâl Cümlesi (Varsa) */}
                {dayState.emptyNote ? (
                    <Animated.View style={{
                        opacity: emptyKind ? intro.emptyNote : intro.list,
                        transform: reduceMotion ? [] : [{
                            translateY: emptyKind ? emptyNoteY : listRise,
                        }],
                    }}>
                        <StaffEmptyNoteView note={dayState.emptyNote} />
                    </Animated.View>
                ) : null}

                {/* Vardiya Çubuğu (Varsa) */}
                {dayState.shift ? (
                    <Animated.View style={{
                        opacity: emptyKind ? intro.emptyShift : intro.list,
                        transform: reduceMotion ? [] : [{
                            translateY: emptyKind ? emptyShiftY : listRise,
                        }],
                    }}>
                        <StaffShiftBarView shift={dayState.shift} />
                    </Animated.View>
                ) : null}

                {/* Randevu Listesi (Varsa) */}
                {dayState.listTitle ? (
                    <Animated.View style={{
                        opacity: intro.list,
                        transform: reduceMotion ? [] : [{ translateY: listRise }],
                    }}>
                        <StaffListHeaderView title={dayState.listTitle} />

                        {/* H2: Geçmiş randevular (İptal/Tamamlanan) */}
                        {dayState.pastAppointments.map((appt, idx) => (
                            <StaffAppointmentRow
                                key={appt.id}
                                appointment={appt}
                                nowMinutes={nowMinutes}
                                first={idx === 0}
                                fade={appt.status === 'cancelled' || appt.status === 'completed' || Boolean(appt.service_ended_at)}
                                onOpen={onOpenAppointment}
                                onMore={onMoreAppointment}
                            />
                        ))}

                        {/* Şimdi Çizgisi */}
                        {dayState.showNowLine ? (
                            <StaffNowLineView time={dayState.nowLineTime} />
                        ) : null}

                        {/* Gelecek randevular */}
                        {dayState.upcomingAppointments.map((appt, idx) => (
                            <StaffAppointmentRow
                                key={appt.id}
                                appointment={appt}
                                nowMinutes={nowMinutes}
                                first={idx === 0 && dayState.pastAppointments.length === 0 && !dayState.showNowLine}
                                fade={false}
                                onOpen={onOpenAppointment}
                                onMore={onMoreAppointment}
                            />
                        ))}
                    </Animated.View>
                ) : null}

                {/* H6: Günün Sonu */}
                {dayState.isDayEnded ? (
                    <View style={{
                        paddingVertical: staffDayMetrics.endDayPadY,
                        paddingHorizontal: staffDayMetrics.endDayPadX,
                        alignItems: 'center',
                    }}>
                        <Text style={{
                            color: c.tx3,
                            fontSize: staffDayMetrics.endDayText,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: staffDayMetrics.endDayText * staffDayMetrics.endDayTrack,
                        }}>
                            GÜNÜN SONU
                        </Text>
                    </View>
                ) : null}
            </ScrollView>

            {/* Alt Eylem Çubuğu (Scroll Dışında) */}
            <StaffFootActionsView
                primary={dayState.primaryAction}
                secondary={dayState.secondaryAction}
                ghost={dayState.ghostAction}
                onPrimary={handlePrimary}
                onSecondary={handleSecondary}
                onGhost={handleGhost}
                bottomInset={bottomInset}
            />
        </View>
    );
}
