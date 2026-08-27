import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button, Num } from './ui';
import { BottomSheet, SheetGrab } from './Sheet';
import {
    Avatar, ChevronIcon, Hair, Kicker, PickRow, SheetBody, SheetFoot, SheetGrabber,
    SheetHead, SlotTime,
} from './CreateParts';
import { upperTR } from '../lib/text';
import { feedback } from '../lib/feedback';
import { source } from '../lib/calendarSource';
import { dayOptions, slotRows, type StaffOption } from '../lib/createFlow';
import {
    UNDO_MS, conflictAt, conflictReason, durationOf, menuRows, menuSubtitle,
    moveResultCopy, type MenuAction, type MoveResult, type MoveTarget,
} from '../lib/moveAppointment';
import {
    apptInCurve, apptCardMetrics, apptMotion, createMetrics, detailMetrics, flowMetrics,
    font, moveMetrics, radius, panelInk, useTheme,
} from '../theme';
import { toMinutes, type Appt } from '../lib/calendar';

/**
 * Müdür 07c · 07d — menüden taşıma ve taşıma sonrası.
 *
 * Sürükleme HIZLI yoldur, menü GÜVENİLİR yoldur; biri diğerinin yerine
 * geçmez. Sürükleme ıslak parmakla, ayakta, tek elle yapılamıyor — menü her
 * koşulda çalışıyor.
 */

// ── Ortak kabuk ─────────────────────────────────────────────────────────────

function CloseIconButton({ onPress }: { onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                backgroundColor: pressed ? c.surf2 : 'transparent',
            })}
        >
            <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={c.tx} strokeWidth={1.7} strokeLinecap="round">
                <Path d="M6 6l12 12M18 6L6 18" />
            </Svg>
        </Pressable>
    );
}

function MenuIcon({ kind, color }: { kind: 'clock' | 'swap' | 'note' | 'x' | 'trash'; color: string }) {
    const size = detailMetrics.rowIcon;
    if (kind === 'clock') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={8.4} stroke={color} strokeWidth={1.7} />
                <Path d="M12 7.6V12l3 2" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
        );
    }
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            {kind === 'swap' ? <Path d="M4 8h13l-3-3M20 16H7l3 3" /> : null}
            {kind === 'note' ? <Path d="M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4" /> : null}
            {kind === 'x' ? <Path d="M6 6l12 12M18 6L6 18" /> : null}
            {kind === 'trash' ? <Path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /> : null}
        </Svg>
    );
}

// ── Müdür 07c — kart menüsü ─────────────────────────────────────────────────

/**
 * Kart menüsü. Taşıma satırları (07c) ve iptal/silme (10b) TEK listede:
 * tasarım ikisini de "kart menüsü" diye tarif ediyor, kartta da tek bir üç
 * nokta var. Sıra tasarımın kendi kuralı — sık ve zararsız olan üstte, geri
 * alınamaz olan en altta, ayrı ve sessiz.
 */
export function AppointmentMenu({ visible, appointment, staffName, onDismiss, onPick }: {
    visible: boolean;
    appointment: Appt;
    staffName?: string | null;
    onDismiss: () => void;
    onPick: (action: MenuAction) => void;
}) {
    const { c } = useTheme();
    const rows = useMemo(() => menuRows(appointment, staffName), [appointment, staffName]);

    return (
        <BottomSheet visible={visible} onDismiss={onDismiss}>
            <SheetGrabber />
            <SheetHead
                title={appointment.customer_name}
                right={<CloseIconButton onPress={onDismiss} />}
            />

            <Text style={{
                color: c.tx2,
                fontSize: moveMetrics.resultSubtitle,
                fontFamily: font.medium,
                fontWeight: '500',
                paddingHorizontal: 20,
                paddingBottom: 10,
            }}>
                {menuSubtitle(appointment, staffName)}
            </Text>

            <SheetBody>
                <Hair />
                {rows.map((row) => (
                    <View key={row.action}>
                        {/* Geri alınamaz olanlar ayrı durur: araya boşluk girer. */}
                        {row.separated ? <View style={{ height: 14, backgroundColor: c.bg }} /> : null}
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={row.value ? `${row.title}. ${row.value}` : row.title}
                            onPress={() => { feedback.selection(); onPick(row.action); }}
                            style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 13,
                                minHeight: row.danger || row.action === 'cancel'
                                    ? detailMetrics.menuRowHeight
                                    : 62,
                                paddingVertical: 14,
                                paddingHorizontal: detailMetrics.padX,
                                backgroundColor: pressed ? c.surf2 : 'transparent',
                            })}
                        >
                            <MenuIcon kind={row.icon} color={row.danger ? c.rd : c.tx} />
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={{
                                    color: row.danger ? c.rd : c.tx,
                                    fontSize: 15.5,
                                    fontFamily: font.bold,
                                    fontWeight: '700',
                                }}>
                                    {row.title}
                                </Text>
                                {row.value ? (
                                    <Text style={{
                                        color: c.tx2,
                                        fontSize: 13,
                                        fontFamily: font.medium,
                                        fontWeight: '500',
                                    }}>
                                        {row.value}
                                    </Text>
                                ) : null}
                            </View>
                            {row.danger || row.action === 'cancel' ? null : <ChevronIcon color={c.tx3} />}
                        </Pressable>
                        <Hair />
                    </View>
                ))}
                <View style={{ height: createMetrics.footBottom }} />
            </SheetBody>
        </BottomSheet>
    );
}

// ── Taşıma seçici — "Saati değiştir" / "Personeli değiştir" ─────────────────

/**
 * Menüden taşımanın gövdesi. Boş saatler Müdür 09'un dördüncü adımıyla AYNI
 * hesaptan çıkıyor (`slotRows`); iki ekranda farklı "boş" tanımı olamaz.
 *
 * Taşınan randevunun kendi yeri dolu sayılmıyor — "12:00 dolu" derken sebebi
 * taşımaya çalıştığın randevunun kendisi olamaz.
 */
export function MoveSheet({ visible, mode, appointment, staff, onDismiss, onPick }: {
    visible: boolean;
    mode: 'time' | 'staff';
    appointment: Appt;
    staff: readonly StaffOption[];
    onDismiss: () => void;
    onPick: (target: MoveTarget) => void;
}) {
    const { c } = useTheme();
    const [dateISO, setDateISO] = useState(appointment.date);
    const [day, setDay] = useState<Appt[]>([]);
    const duration = durationOf(appointment);

    // Sheet her açılışta randevunun kendi gününden başlar.
    useEffect(() => {
        if (visible) setDateISO(appointment.date);
    }, [visible, appointment.date]);

    useEffect(() => {
        let alive = true;
        source.day(dateISO)
            .then((list) => { if (alive) setDay(list); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [dateISO]);

    const rows = useMemo(() => slotRows({
        appointments: day,
        staff,
        durationMinutes: duration,
        onlyStaffId: appointment.staff_id ?? undefined,
        excludeId: appointment.id,
    }), [day, staff, duration, appointment]);

    // Personel değiştirme: saat sabit, kim müsait sorusu.
    const staffRows = useMemo(() => {
        const start = toMinutes(appointment.start_time);
        const end = start + duration;
        return staff.map((person) => {
            if (!person.available) {
                return { person, free: false, reason: person.reason ?? 'çalışmıyor' };
            }
            const blocking = conflictAt(day, person.id, start, end, appointment.id);
            return {
                person,
                free: blocking === null,
                reason: blocking ? conflictReason(blocking, person.name) : undefined,
            };
        });
    }, [day, staff, appointment, duration]);

    const days = useMemo(() => dayOptions(appointment.date, 14), [appointment.date]);

    return (
        <BottomSheet visible={visible} onDismiss={onDismiss} fill>
            <SheetGrabber />
            <SheetHead
                title={mode === 'time' ? 'Yeni saat' : 'Yeni kişi'}
                right={<CloseIconButton onPress={onDismiss} />}
            />
            <Hair />

            <SheetBody>
                {mode === 'time' ? (
                    <>
                        {/* "Aynı gün veya başka gün" — gün şeridi hep görünür. */}
                        <Kicker label="Gün" />
                        <Hair />
                        {days.slice(0, 7).map((option) => (
                            <View key={option.iso}>
                                <PickRow
                                    title={option.label}
                                    subtitle={option.iso === appointment.date ? 'Şu anki gün' : option.relative ?? undefined}
                                    right={option.iso === dateISO ? <Chosen /> : <ChevronIcon color={c.tx3} />}
                                    onPress={() => setDateISO(option.iso)}
                                />
                                <Hair />
                            </View>
                        ))}

                        <Kicker label="Boş saatler" right={days.find((d) => d.iso === dateISO)?.label} />
                        <Hair />
                        {rows.map((row) => (
                            <View key={row.minutes}>
                                {row.kind === 'free' ? (
                                    <PickRow
                                        left={<SlotTime time={row.time} />}
                                        title={row.staff.name}
                                        subtitle="müsait"
                                        right={<Avatar initials={row.staff.initials} color={row.staff.color} size={30} />}
                                        onPress={() => onPick({
                                            staffId: row.staff.id,
                                            staffName: row.staff.name,
                                            startMinutes: row.minutes,
                                            endMinutes: row.minutes + duration,
                                            valid: true,
                                            unchanged: row.minutes === toMinutes(appointment.start_time)
                                                && row.staff.id === appointment.staff_id
                                                && dateISO === appointment.date,
                                        })}
                                    />
                                ) : (
                                    <PickRow
                                        left={<SlotTime time={row.time} />}
                                        title={row.kind === 'busy' ? 'Dolu' : 'Kapalı'}
                                        subtitle={row.reason}
                                        disabled
                                    />
                                )}
                                <Hair />
                            </View>
                        ))}
                    </>
                ) : (
                    <>
                        <Kicker
                            label="Kim yapsın"
                            right={`${appointment.start_time.slice(0, 5)} · ${duration} dk`}
                        />
                        <Hair />
                        {staffRows.map(({ person, free, reason }) => (
                            <View key={person.id}>
                                <PickRow
                                    left={<Avatar initials={person.initials} color={person.color} />}
                                    title={person.name}
                                    subtitle={free
                                        ? person.id === appointment.staff_id ? 'şu an bu randevuda' : 'müsait'
                                        : reason}
                                    disabled={!free}
                                    onPress={() => onPick({
                                        staffId: person.id,
                                        staffName: person.name,
                                        startMinutes: toMinutes(appointment.start_time),
                                        endMinutes: toMinutes(appointment.start_time) + duration,
                                        valid: true,
                                        unchanged: person.id === appointment.staff_id,
                                    })}
                                />
                                <Hair />
                            </View>
                        ))}
                    </>
                )}
                <View style={{ height: createMetrics.footBottom }} />
            </SheetBody>
        </BottomSheet>
    );
}

function Chosen() {
    const { c } = useTheme();
    return (
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={c.or} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7" />
        </Svg>
    );
}

// ── Müdür 25 · E — taşıma sonucu ────────────────────────────────────────────

/**
 * Randevu bırakıldıktan SONRAKİ saniye.
 *
 * Sheet üç şey söylüyor: ne oldu (hareket olarak), yanlışsa nasıl dönerim,
 * müşteriye nasıl ulaşırım. Eskiden tek düğmesi "Evet, yaz"dı ve hiçbir şey
 * yazmıyordu — uygulamanın müşteriye mesaj atacak kanalı yok, o yüzden
 * mesaj vaadi kalktı. Yerine o saniyenin iki gerçek ihtiyacı geldi.
 *
 * Sheet KENDİLİĞİNDEN KAPANMAZ: müdür telefonu indirip müşteriye bakabiliyor;
 * kendiliğinden kapanan sheet hem "ne oldu" bilgisini hem "Müşteriyi ara"yı
 * götürürdü. Kapatma her zaman elle.
 */
export function MoveResultSheet({ result, nowMinutes, today, onUndo, onCall, onDone }: {
    result: MoveResult | null;
    /** Verilmezse geçmiş saat uyarısı çıkmaz — uydurulmuş bir saat yazmayız. */
    nowMinutes?: number;
    /** Bugünse alt metne "bugün" eklenir; verilmezse eklenmez. */
    today?: string;
    onUndo?: (result: MoveResult) => void;
    /** Telefon kayıtlı değilse düğme HİÇ çizilmez — gri değil, yok. */
    onCall?: (phone: string) => void;
    onDone: () => void;
}) {
    const { c, reduceMotion } = useTheme();
    const copy = result ? moveResultCopy(result, nowMinutes, today) : null;
    const phone = result?.appointment.customer_phone ?? null;

    const enter = useMoveIntro(result !== null, reduceMotion);
    const undo = useUndoLife(result !== null, reduceMotion);

    if (!result || !copy) return null;
    const warn = copy.tone === 'warn';

    return (
        <BottomSheet visible onDismiss={onDone}>
            <SheetGrab />
            <View style={{
                paddingHorizontal: apptCardMetrics.sheetPadX,
                paddingBottom: apptCardMetrics.sheetPadBottom,
                gap: apptCardMetrics.sheetGap,
            }}>
                <View style={{ flexDirection: 'row' }}>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: apptCardMetrics.movePillGap,
                        height: apptCardMetrics.movePillHeight,
                        paddingHorizontal: apptCardMetrics.movePillX,
                        borderRadius: apptCardMetrics.movePillRadius,
                        backgroundColor: warn ? 'rgba(217,164,59,0.14)' : moveMetrics.statOkBg,
                    }}>
                        <View style={{
                            width: apptCardMetrics.movePillDot,
                            height: apptCardMetrics.movePillDot,
                            borderRadius: apptCardMetrics.movePillDot,
                            backgroundColor: warn ? c.am : c.gr,
                        }} />
                        <Text style={{
                            color: warn ? c.am : c.gr,
                            fontSize: apptCardMetrics.movePillText,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            {copy.badge}
                        </Text>
                    </View>
                </View>

                <View style={{
                    gap: apptCardMetrics.moveCardGap,
                    padding: apptCardMetrics.moveCardPadding,
                    borderRadius: apptCardMetrics.moveCardRadius,
                    backgroundColor: c.surf2,
                    // Aydınlık temada dolgu farkı yetmez; şekli kenarlık çizer.
                    borderWidth: 1,
                    borderColor: c.bd,
                }}>
                    <Text numberOfLines={1} style={{ fontSize: apptCardMetrics.moveName }}>
                        {copy.given ? (
                            <Text style={{
                                color: c.tx2,
                                fontFamily: font.medium,
                                fontWeight: '500',
                                letterSpacing: apptCardMetrics.moveName * -0.02,
                            }}>
                                {`${copy.given} `}
                            </Text>
                        ) : null}
                        <Text style={{
                            color: c.tx,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: apptCardMetrics.moveName * -0.02,
                        }}>
                            {copy.family}
                        </Text>
                    </Text>

                    {/* Taşıma bir DEĞİŞİM; ekranda da öyle okunuyor. Okuma yönü
                        hareketin yönüyle aynı: 12:00 OLDU 13:30. */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: apptCardMetrics.moveTimeGap }}>
                        <Animated.View style={{ gap: 3, opacity: enter.from }}>
                            <Num size={apptCardMetrics.moveTime} style={{
                                color: c.tx3,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: apptCardMetrics.moveTime * -0.03,
                                textDecorationLine: 'line-through',
                            }}>
                                {copy.fromTime}
                            </Num>
                            <Text numberOfLines={1} style={{
                                color: c.tx2,
                                fontSize: apptCardMetrics.moveLabel,
                                fontFamily: font.bold,
                                fontWeight: '700',
                                letterSpacing: apptCardMetrics.moveLabel * apptCardMetrics.moveLabelTrack,
                            }}>
                                {upperTR(copy.fromLabel)}
                            </Text>
                        </Animated.View>

                        <Animated.View style={{
                            opacity: enter.arrow,
                            transform: [{ translateX: enter.arrowShift }],
                        }}>
                            <Svg
                                width={apptCardMetrics.moveArrow}
                                height={apptCardMetrics.moveArrow}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={c.or}
                                strokeWidth={1.9}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <Path d="M4 12h14M13 6l6 6-6 6" />
                            </Svg>
                        </Animated.View>

                        <Animated.View style={{
                            gap: 3,
                            minWidth: 0,
                            opacity: enter.to,
                            transform: [{ translateX: enter.toShift }],
                        }}>
                            <Num size={apptCardMetrics.moveTime} style={{
                                color: c.tx,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: apptCardMetrics.moveTime * -0.03,
                            }}>
                                {copy.toTime}
                            </Num>
                            <Text numberOfLines={1} style={{
                                color: c.tx2,
                                fontSize: apptCardMetrics.moveLabel,
                                fontFamily: font.bold,
                                fontWeight: '700',
                                letterSpacing: apptCardMetrics.moveLabel * apptCardMetrics.moveLabelTrack,
                            }}>
                                {upperTR(copy.toLabel)}
                            </Text>
                        </Animated.View>
                    </View>

                    <Text style={{
                        color: c.tx2,
                        fontSize: apptCardMetrics.moveSub,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {copy.sub}
                    </Text>
                </View>

                <View style={{ gap: apptCardMetrics.moveBtnGap }}>
                    {/* Geri al en üstte ve dolu: sheet'in açıldığı saniyede en
                        olası ihtiyaç bu. Süre bitince sheet kapanmaz, yalnız
                        düğme düşer. */}
                    {undo.alive && onUndo ? (
                        <Animated.View style={{ opacity: undo.fade }}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={copy.undo}
                                onPress={() => { feedback.warning(); onUndo(result); }}
                                style={({ pressed }) => ({
                                    height: apptCardMetrics.moveBtnHeight,
                                    borderRadius: apptCardMetrics.moveBtnRadius,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10,
                                    overflow: 'hidden',
                                    backgroundColor: c.tx,
                                    opacity: pressed ? 0.85 : 1,
                                })}
                            >
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.bg} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                                    <Path d="M9 7L4 12l5 5" />
                                    <Path d="M4 12h9a6 6 0 010 12h-1" />
                                </Svg>
                                <Text style={{
                                    color: c.bg,
                                    fontSize: apptCardMetrics.moveBtnText,
                                    fontFamily: font.extraBold,
                                    fontWeight: '800',
                                    letterSpacing: apptCardMetrics.moveBtnText * -0.02,
                                }}>
                                    {copy.undo}
                                </Text>
                                {undo.counter !== null ? (
                                    <Num size={13} style={{ color: c.bg, opacity: 0.6, fontFamily: font.bold, fontWeight: '700' }}>
                                        {`${undo.counter} sn`}
                                    </Num>
                                ) : (
                                    <Animated.View style={{
                                        position: 'absolute',
                                        left: 0,
                                        bottom: 0,
                                        height: 3,
                                        width: '100%',
                                        backgroundColor: c.or,
                                        transform: [{ scaleX: undo.life }],
                                        transformOrigin: 'left center',
                                    }} />
                                )}
                            </Pressable>
                        </Animated.View>
                    ) : null}

                    {/* Uygulamanın gerçekten yapabildiği TEK bildirme yolu. */}
                    {phone && onCall ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={copy.call}
                            onPress={() => { feedback.selection(); onCall(phone); }}
                            style={({ pressed }) => ({
                                height: apptCardMetrics.moveBtnHeight,
                                borderRadius: apptCardMetrics.moveBtnRadius,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                borderWidth: 1.5,
                                borderColor: c.bd2,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.tx} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                                <Path d="M6 3h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" />
                            </Svg>
                            <Text style={{
                                color: c.tx,
                                fontSize: apptCardMetrics.moveBtnText,
                                fontFamily: font.extraBold,
                                fontWeight: '800',
                                letterSpacing: apptCardMetrics.moveBtnText * -0.02,
                            }}>
                                {copy.call}
                            </Text>
                        </Pressable>
                    ) : null}

                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.done}
                        onPress={() => { feedback.selection(); onDone(); }}
                        style={({ pressed }) => ({
                            height: apptCardMetrics.moveOkHeight,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <Text style={{
                            color: c.tx2,
                            fontSize: apptCardMetrics.moveOkText,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            {copy.done}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </BottomSheet>
    );
}

/**
 * Hareket soldan sağa okunur, taşımanın kendisi gibi: eski saat yerinde
 * kalıp soluyor, ok geliyor, yeni saat 14 pt soldan kayarak oturuyor.
 */
function useMoveIntro(active: boolean, reduceMotion: boolean) {
    const from = useRef(new Animated.Value(1)).current;
    const arrow = useRef(new Animated.Value(0)).current;
    const to = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!active) return;
        if (reduceMotion) {
            // Hareket tek karede tam görünür.
            from.setValue(apptMotion.move.fromTo);
            arrow.setValue(1);
            to.setValue(1);
            return;
        }
        from.setValue(1); arrow.setValue(0); to.setValue(0);
        Animated.parallel([
            Animated.timing(from, {
                toValue: apptMotion.move.fromTo,
                duration: apptMotion.move.fromFade,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }),
            Animated.timing(arrow, {
                toValue: 1,
                duration: apptMotion.move.arrowIn,
                delay: apptMotion.move.arrowDelay,
                easing: Easing.bezier(...apptInCurve),
                useNativeDriver: true,
            }),
            Animated.timing(to, {
                toValue: 1,
                duration: apptMotion.move.toIn,
                delay: apptMotion.move.toDelay,
                easing: Easing.bezier(...apptInCurve),
                useNativeDriver: true,
            }),
        ]).start();
    }, [active, reduceMotion, from, arrow, to]);

    return {
        from,
        arrow,
        to,
        arrowShift: arrow.interpolate({
            inputRange: [0, 1],
            outputRange: [-apptMotion.move.arrowShift, 0],
        }),
        toShift: to.interpolate({
            inputRange: [0, 1],
            outputRange: [-apptMotion.move.toShift, 0],
        }),
    };
}

/**
 * Geri al'ın ömrü — 8 saniye, düğmenin alt kenarında `scaleX` ile tükenen
 * 3 pt çubuk. Renk değişmez, yükseklik değişmez.
 *
 * "Hareketi azalt" açıkken çubuk render EDİLMEZ; yerine saniye sayar.
 * Bilgi harekete emanet edilmez.
 */
function useUndoLife(active: boolean, reduceMotion: boolean) {
    const life = useRef(new Animated.Value(1)).current;
    const fade = useRef(new Animated.Value(1)).current;
    const [alive, setAlive] = useState(true);
    const [counter, setCounter] = useState<number | null>(null);

    useEffect(() => {
        if (!active) { setAlive(true); setCounter(null); return; }
        life.setValue(1);
        fade.setValue(1);
        setAlive(true);

        if (reduceMotion) {
            let left = Math.round(UNDO_MS / 1000);
            setCounter(left);
            const tick = setInterval(() => {
                left -= 1;
                setCounter(left);
                if (left <= 0) { clearInterval(tick); setAlive(false); }
            }, 1000);
            return () => clearInterval(tick);
        }

        setCounter(null);
        const run = Animated.timing(life, {
            toValue: 0,
            duration: UNDO_MS,
            easing: Easing.linear,
            useNativeDriver: true,
        });
        run.start(({ finished }) => {
            if (!finished) return;
            Animated.timing(fade, {
                toValue: 0,
                duration: apptMotion.undo.fade,
                useNativeDriver: true,
            }).start(() => setAlive(false));
        });
        return () => run.stop();
    }, [active, reduceMotion, life, fade]);

    return { life, fade, alive, counter };
}
