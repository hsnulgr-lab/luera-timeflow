import { useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
    calendarCardStates,
    elapsed,
    lateMinutes,
    nowLineAfter,
    statusWord,
    toMinutes,
    type Appt,
    type CardState,
} from '../lib/calendar';
import {
    calendarMetrics,
    display,
    hit,
    numeric,
    onAccent,
    radius,
    space,
    type,
    useTheme,
} from '../theme';

/**
 * Bu ölçüler yalnız Takvim parçalarına ait. Genel ölçü sözleşmesi tokens'ta;
 * burada kalanlar ise birden fazla kart içinde farklılaşmasın diye tek yerde.
 */
const part = {
    liveBar: 3,
    liveDot: 6,
    headerDot: 9,
    weekDot: 4,
    weekDotDense: 7,
    weekMarker: 24,
    nameSize: 19,
    serviceSize: 13.5,
    packageChip: 42,
    summaryAction: 44,
    actionMinWidth: 118,
} as const;

const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
const DAY_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;
const MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

export interface CalendarWeekDay {
    date: string;
    num: number;
    label: string;
}

export interface AppointmentActions {
    onOpen?: (appointment: Appt) => void;
    onCall?: (appointment: Appt) => void;
    onMore?: (appointment: Appt) => void;
    onCustomer?: (appointment: Appt) => void;
    onStart?: (appointment: Appt) => void;
    onResume?: (appointment: Appt) => void;
}

function dateFromISO(dateISO: string) {
    const [year, month, day] = dateISO.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
}

function fullDate(dateISO: string) {
    const date = dateFromISO(dateISO);
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${DAY_LONG[date.getDay()]}`;
}

function splitName(name: string) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return { given: '', family: words[0] ?? '' };
    return {
        given: words.slice(0, -1).join(' '),
        family: words.at(-1) ?? '',
    };
}

function initials(name: string) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    return [words[0], words.at(-1)]
        .filter(Boolean)
        .map((word) => word?.slice(0, 1).toLocaleUpperCase('tr-TR'))
        .join('');
}

function durationMinutes(appointment: Appt) {
    let duration = toMinutes(appointment.end_time) - toMinutes(appointment.start_time);
    if (duration < 0) duration += 24 * 60;
    return duration;
}

function serviceDescription(appointment: Appt) {
    const duration = durationMinutes(appointment);
    const hasDuration = /\b\d+\s*dk\b/i.test(appointment.service);
    return [
        appointment.service,
        hasDuration || duration <= 0 ? null : `${duration} dk`,
        appointment.notes?.replace(/[.!?]+$/, '') || null,
    ].filter(Boolean).join(' · ');
}

function appointmentLabel(appointment: Appt, state: CardState, seconds: number) {
    const duration = durationMinutes(appointment);
    const status = statusWord(appointment);
    const stateLabel = state === 'live'
        ? `işlem sürüyor ${Math.floor(seconds / 60)} dakika`
        : state === 'due'
            ? 'sırası geldi'
            : status;
    return [
        appointment.start_time.slice(0, 5),
        appointment.customer_name,
        appointment.service,
        duration > 0 && !/\b\d+\s*dk\b/i.test(appointment.service) ? `${duration} dakika` : null,
        stateLabel,
    ].filter(Boolean).join(', ');
}

export function DayHeader({
    dateISO,
    subtitle,
    compact = false,
    transparent = false,
    style,
}: {
    dateISO: string;
    subtitle: string;
    compact?: boolean;
    transparent?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const { c, small } = useTheme();
    const date = dateFromISO(dateISO);
    const day = DAY_SHORT[date.getDay()];
    const titleStyle = compact ? display.dayMini : small ? display.daySmall : display.day;

    if (compact) {
        return (
            <View
                accessibilityRole="header"
                accessibilityLabel={`${fullDate(dateISO)}. ${subtitle}`}
                style={[
                    styles.compactHeader,
                    !transparent && { borderBottomColor: c.bd, borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: c.glass },
                    style,
                ]}
            >
                <Text style={[titleStyle, { color: c.tx }]}>{day}. {date.getDate()}</Text>
                <Text numberOfLines={1} style={[type.small, styles.compactSubtitle, { color: c.tx2 }]}>
                    {subtitle}
                </Text>
            </View>
        );
    }

    return (
        <View
            accessibilityRole="header"
            accessibilityLabel={`${fullDate(dateISO)}. ${subtitle}`}
            style={[styles.dayHeader, { paddingHorizontal: calendarMetrics.pageX }, style]}
        >
            <View style={styles.dayTitleRow}>
                <View style={styles.dayWord}>
                    <Text style={[titleStyle, { color: c.tx, lineHeight: titleStyle.fontSize }]}>{day}</Text>
                    <View style={[styles.headerDot, { backgroundColor: c.or }]} />
                </View>
                <Text style={[titleStyle, numeric, { color: c.tx3, lineHeight: titleStyle.fontSize }]}>
                    {date.getDate()}
                </Text>
            </View>
            <Text style={[type.small, { color: c.tx2 }]}>{subtitle}</Text>
        </View>
    );
}

export function WeekStrip({
    days,
    selectedISO,
    counts,
    onSelect,
    style,
}: {
    days: CalendarWeekDay[];
    selectedISO: string;
    counts: Record<string, number>;
    onSelect: (dateISO: string) => void;
    style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();

    return (
        <View style={[styles.weekStrip, { borderBottomColor: c.bd }, style]}>
            {days.map((day) => {
                const selected = day.date === selectedISO;
                const count = counts[day.date] ?? 0;
                const dotSize = count >= 3 ? part.weekDotDense : part.weekDot;
                return (
                    <Pressable
                        key={day.date}
                        accessibilityRole="button"
                        accessibilityLabel={`${fullDate(day.date)}, ${count ? `${count} randevu` : 'randevu yok'}`}
                        accessibilityState={{ selected }}
                        hitSlop={space.xs}
                        onPress={() => onSelect(day.date)}
                        style={({ pressed }) => [
                            styles.weekDay,
                            { opacity: pressed ? 0.62 : 1 },
                        ]}
                    >
                        <View
                            style={[
                                styles.weekNumber,
                                selected && {
                                    width: calendarMetrics.weekSelected,
                                    height: calendarMetrics.weekSelected,
                                    borderRadius: radius.lg,
                                    borderColor: c.bd2,
                                    borderWidth: 1,
                                    backgroundColor: c.surf2,
                                },
                            ]}
                        >
                            <Text style={[
                                styles.weekNumberText,
                                numeric,
                                { color: selected ? c.tx : c.tx2 },
                            ]}>
                                {day.num}
                            </Text>
                        </View>
                        <Text style={[
                            type.tiny,
                            styles.weekLabel,
                            { color: selected ? c.or : c.tx3 },
                        ]}>
                            {day.label}
                        </Text>
                        <View style={styles.weekMarker}>
                            {count > 0 ? (
                                <View style={{
                                    width: dotSize,
                                    height: dotSize,
                                    borderRadius: radius.pill,
                                    backgroundColor: count >= 3 ? c.tx2 : c.tx3,
                                }} />
                            ) : null}
                            {count > 0 ? <View style={[styles.weekHair, { backgroundColor: c.bd }]} /> : null}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

function PhoneReceiverIcon({ color }: { color: string }) {
    return (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <Path
                d="M6.6 3.8h3l1.5 3.7-1.9 1.5a10.6 10.6 0 0 0 4.8 4.8l1.5-1.9 3.7 1.5v3a2 2 0 0 1-2.2 2A15.6 15.6 0 0 1 4.6 6a2 2 0 0 1 2-2.2z"
                stroke={color}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </Svg>
    );
}

function PhoneButton({ label, onPress }: { label: string; onPress?: () => void }) {
    const { c } = useTheme();
    if (!onPress) return null;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={space.xs}
            onPress={onPress}
            style={({ pressed }) => [
                styles.phoneButton,
                { borderColor: c.bd2, opacity: pressed ? 0.62 : 1 },
            ]}
        >
            <PhoneReceiverIcon color={c.tx2} />
        </Pressable>
    );
}

function MoreButton({ label, onPress }: { label: string; onPress?: () => void }) {
    const { c } = useTheme();
    if (!onPress) return null;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={space.xs}
            onPress={onPress}
            style={({ pressed }) => [styles.moreButton, { opacity: pressed ? 0.62 : 1 }]}
        >
            <View style={styles.moreDots}>
                {[0, 1, 2].map((dot) => (
                    <View key={dot} style={[styles.moreDot, { backgroundColor: c.tx3 }]} />
                ))}
            </View>
        </Pressable>
    );
}

function SummaryArrowIcon({ color }: { color: string }) {
    return (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <Path
                d="M6.5 17.5 17.5 6.5M9.5 6.5h8v8"
                stroke={color}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </Svg>
    );
}

function CustomerSummary({ appointment, onCustomer }: {
    appointment: Appt;
    onCustomer?: (appointment: Appt) => void;
}) {
    const { embed: e } = useTheme();
    const info = appointment.info;
    if (!info || (!info.pkg && info.visitNo == null)) return null;

    const main = info.visitNo === 1
        ? 'İlk ziyaret'
        : info.visitNo != null
            ? `${info.visitNo}. ziyaret`
            : info.pkg?.name ?? '';

    return (
        <View
            accessibilityLabel={[
                info.pkg ? `${info.pkg.name}, ${info.pkg.used}/${info.pkg.total}` : null,
                main,
                info.lastVisit ? `Son ziyaret ${info.lastVisit}` : null,
            ].filter(Boolean).join(', ')}
            style={[styles.summary, { backgroundColor: e.bg }]}
        >
            {info.pkg ? (
                <View style={[styles.packageChip, { backgroundColor: e.chipBg }]}>
                    <Text style={[styles.packageNumber, numeric, { color: e.chipTx }]}>
                        {info.pkg.used}<Text style={styles.packageTotal}>/{info.pkg.total}</Text>
                    </Text>
                </View>
            ) : (
                <View style={[styles.packageChip, { backgroundColor: e.chipBg }]}>
                    <Text style={[styles.packageNumber, numeric, { color: e.chipTx }]}>{info.visitNo}</Text>
                </View>
            )}
            <View style={styles.summaryCopy}>
                <Text numberOfLines={1} style={[type.body, styles.summaryTitle, { color: e.tx }]}>{main}</Text>
                {info.lastVisit ? (
                    <Text numberOfLines={1} style={[type.tiny, { color: e.tx2 }]}>Son: {info.lastVisit}</Text>
                ) : info.pkg ? (
                    <Text numberOfLines={1} style={[type.tiny, { color: e.tx2 }]}>{info.pkg.name}</Text>
                ) : null}
            </View>
            {onCustomer ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${appointment.customer_name} müşteri kartını aç`}
                    hitSlop={space.xs}
                    onPress={() => onCustomer(appointment)}
                    style={({ pressed }) => [
                        styles.summaryAction,
                        { backgroundColor: e.chipBg, opacity: pressed ? 0.78 : 1 },
                    ]}
                >
                    <SummaryArrowIcon color={e.chipTx} />
                </Pressable>
            ) : null}
        </View>
    );
}

function LivePanel({ appointment, seconds, onResume }: {
    appointment: Appt;
    seconds: number;
    onResume?: (appointment: Appt) => void;
}) {
    const { c, embed: e, reduceMotion } = useTheme();
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (reduceMotion) {
            pulse.stopAnimation();
            pulse.setValue(1);
            return;
        }
        const animation = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 0.35, duration: 800, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]));
        animation.start();
        return () => animation.stop();
    }, [pulse, reduceMotion]);

    return (
        <View style={[styles.livePanel, { backgroundColor: e.bg }]}>
            <View style={styles.liveCopy}>
                <View style={styles.liveLabelRow}>
                    <Animated.View style={[
                        styles.liveDot,
                        { backgroundColor: c.or, opacity: pulse },
                    ]} />
                    <Text style={[type.tiny, styles.liveLabel, { color: e.tx2 }]}>sürüyor</Text>
                </View>
                <Text
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={`İşlem süresi ${Math.floor(seconds / 60)} dakika`}
                    style={[display.counter, numeric, styles.liveCounter, { color: e.tx }]}
                >
                    {elapsed(seconds)}
                </Text>
                <Text style={[type.tiny, styles.liveStarted, { color: e.tx3 }]}>
                    {appointment.start_time.slice(0, 5)}'de başladı
                </Text>
            </View>
            {onResume ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${appointment.customer_name} işlemine dön`}
                    onPress={() => onResume(appointment)}
                    style={({ pressed }) => [
                        styles.liveAction,
                        { backgroundColor: c.or, opacity: pressed ? 0.84 : 1 },
                    ]}
                >
                    <Text style={[type.body, styles.actionText, { color: onAccent }]}>İşleme dön</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function DueRow({ appointment, nowMinutes, onStart }: {
    appointment: Appt;
    nowMinutes: number;
    onStart?: (appointment: Appt) => void;
}) {
    const { c } = useTheme();
    const late = lateMinutes(appointment, nowMinutes);
    return (
        <View style={[styles.dueRow, { borderTopColor: c.bd }]}>
            <Text style={[
                type.tiny,
                styles.dueLabel,
                { color: late > 0 ? c.am : c.tx2 },
            ]}>
                {late > 0 ? `${late} dk gecikti` : 'sırası geldi'}
            </Text>
            {onStart ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${appointment.customer_name} işlemini başlat`}
                    onPress={() => onStart(appointment)}
                    style={({ pressed }) => [
                        styles.dueAction,
                        { backgroundColor: c.or, opacity: pressed ? 0.84 : 1 },
                    ]}
                >
                    <Text style={[type.body, styles.actionText, { color: onAccent }]}>İşleme başla</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

export function AppointmentCard({
    appointment,
    state,
    nowMinutes,
    elapsedSeconds,
    actions = {},
    dimmed,
    style,
}: {
    appointment: Appt;
    state: CardState;
    nowMinutes: number;
    elapsedSeconds?: number;
    actions?: AppointmentActions;
    dimmed?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const { c, embed: e, small } = useTheme();
    const name = splitName(appointment.customer_name);
    const seconds = elapsedSeconds ?? Math.max(0, (nowMinutes - toMinutes(appointment.start_time)) * 60);
    const status = statusWord(appointment);
    const statusColor = status === 'onay bekliyor' ? c.am : c.rd;
    const isDimmed = dimmed ?? (appointment.status === 'completed' || appointment.service_ended_at != null);
    const padding = small ? calendarMetrics.cardPaddingSmall : calendarMetrics.cardPadding;

    return (
        <View style={[
            styles.card,
            {
                backgroundColor: c.surf,
                borderColor: c.bd,
                opacity: isDimmed ? 0.55 : 1,
            },
            style,
        ]}>
            {state === 'live' ? (
                <View pointerEvents="none" style={[styles.liveBar, { borderLeftColor: c.or }]} />
            ) : null}
            {appointment.info?.risk ? (
                <View style={[styles.risk, { backgroundColor: e.riskBg, paddingHorizontal: padding }]}>
                    <Text numberOfLines={2} style={[type.tiny, styles.riskText, { color: e.riskTx }]}>
                        {appointment.info.risk}
                    </Text>
                </View>
            ) : null}
            <View style={{ padding }}>
                <View style={styles.cardHeader}>
                    <Pressable
                        accessible
                        accessibilityLabel={appointmentLabel(appointment, state, seconds)}
                        disabled={!actions.onOpen}
                        onPress={() => actions.onOpen?.(appointment)}
                        style={({ pressed }) => [styles.nameButton, { opacity: pressed ? 0.62 : 1 }]}
                    >
                        {name.given ? (
                            <Text
                                numberOfLines={1}
                                ellipsizeMode="tail"
                                style={[
                                    styles.customerGiven,
                                    { color: c.tx2, fontSize: small ? 17 : part.nameSize },
                                ]}
                            >
                                {name.given}
                            </Text>
                        ) : null}
                        <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={[
                                styles.customerSurname,
                                { color: c.tx, fontSize: small ? 17 : part.nameSize },
                            ]}
                        >
                            {name.family}
                        </Text>
                    </Pressable>
                    {appointment.customer_phone ? (
                        <PhoneButton
                            label={`${appointment.customer_name} müşterisini ara`}
                            onPress={actions.onCall ? () => actions.onCall?.(appointment) : undefined}
                        />
                    ) : null}
                    <View
                        accessible={false}
                        style={[
                            styles.avatar,
                            {
                                backgroundColor: c.surf2,
                                borderColor: appointment.service_color ?? c.bd2,
                            },
                        ]}
                    >
                        <Text style={[type.small, styles.avatarText, { color: c.tx }]}>{initials(appointment.customer_name)}</Text>
                    </View>
                    <MoreButton
                        label={`${appointment.customer_name} randevu seçenekleri`}
                        onPress={actions.onMore ? () => actions.onMore?.(appointment) : undefined}
                    />
                </View>
                <Text numberOfLines={2} style={[styles.service, { color: c.tx2 }]}>
                    {serviceDescription(appointment)}
                    {status ? <Text style={[styles.statusWord, { color: statusColor }]}> · {status}</Text> : null}
                </Text>

                {state === 'live' ? (
                    <LivePanel appointment={appointment} seconds={seconds} onResume={actions.onResume} />
                ) : (
                    <CustomerSummary appointment={appointment} onCustomer={actions.onCustomer} />
                )}
            </View>
            {state === 'due' ? (
                <DueRow appointment={appointment} nowMinutes={nowMinutes} onStart={actions.onStart} />
            ) : null}
        </View>
    );
}

export function NowLine({ time, style }: { time: string; style?: StyleProp<ViewStyle> }) {
    const { c } = useTheme();
    return (
        <View
            accessible
            accessibilityLabel={`Şu an saat ${time}`}
            style={[styles.nowLine, { paddingHorizontal: calendarMetrics.pageX }, style]}
        >
            <View style={[styles.nowPill, { backgroundColor: c.or }]}>
                <Text style={[styles.nowText, numeric, { color: onAccent }]}>{time}</Text>
            </View>
            <View style={[styles.nowHair, { backgroundColor: c.or }]} />
        </View>
    );
}

export function DayEnd({ label = 'Günün sonu', style }: {
    label?: string;
    style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();
    return (
        <View style={[styles.dayEnd, { paddingHorizontal: calendarMetrics.pageX }, style]}>
            <View style={[styles.dayEndHair, { backgroundColor: c.bd }]} />
            <Text style={[type.tiny, styles.dayEndLabel, { color: c.tx3 }]}>{label}</Text>
        </View>
    );
}

export function Timeline({
    appointments,
    nowMinutes,
    isToday,
    states,
    elapsedSecondsById = {},
    actions,
    showDayEnd = true,
    style,
}: {
    appointments: Appt[];
    nowMinutes: number;
    isToday: boolean;
    states?: Map<string, CardState>;
    elapsedSecondsById?: Record<string, number>;
    actions?: AppointmentActions;
    showDayEnd?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();
    const sorted = useMemo(
        () => [...appointments].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
        [appointments],
    );
    const resolvedStates = useMemo(
        () => states ?? calendarCardStates(sorted, nowMinutes, isToday),
        [isToday, nowMinutes, sorted, states],
    );
    const lineAfter = nowLineAfter(sorted, nowMinutes, isToday);
    const time = `${String(Math.floor(nowMinutes / 60) % 24).padStart(2, '0')}:${String(nowMinutes % 60).padStart(2, '0')}`;

    return (
        <View style={[styles.timeline, style]}>
            {lineAfter === -1 ? <NowLine time={time} /> : null}
            {sorted.map((appointment, index) => (
                <View key={appointment.id}>
                    <View style={[
                        styles.timelineRow,
                        {
                            paddingHorizontal: calendarMetrics.pageX,
                            marginBottom: calendarMetrics.cardGap,
                        },
                    ]}>
                        <Text style={[
                            styles.time,
                            numeric,
                            { color: c.tx2, width: calendarMetrics.timeWidth },
                        ]}>
                            {appointment.start_time.slice(0, 5)}
                        </Text>
                        <AppointmentCard
                            appointment={appointment}
                            state={resolvedStates.get(appointment.id) ?? 'plain'}
                            nowMinutes={nowMinutes}
                            elapsedSeconds={elapsedSecondsById[appointment.id]}
                            actions={actions}
                            style={styles.timelineCard}
                        />
                    </View>
                    {lineAfter === index ? <NowLine time={time} /> : null}
                </View>
            ))}
            {showDayEnd ? <DayEnd /> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    dayHeader: {
        paddingTop: space.xs,
        gap: space.xs,
    },
    dayTitleRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    dayWord: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    headerDot: {
        width: part.headerDot,
        height: part.headerDot,
        borderRadius: radius.pill,
        marginLeft: space.xs,
        marginBottom: space.sm,
    },
    compactHeader: {
        minHeight: 52,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    compactSubtitle: {
        flex: 1,
    },
    weekStrip: {
        flexDirection: 'row',
        paddingTop: space.lg,
        paddingHorizontal: space.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    weekDay: {
        flex: 1,
        minWidth: 0,
        minHeight: calendarMetrics.weekSelected + part.weekMarker + space.lg,
        alignItems: 'center',
    },
    weekNumber: {
        width: calendarMetrics.weekTarget,
        height: calendarMetrics.weekTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekNumberText: {
        fontSize: type.h3.fontSize,
        fontWeight: '800',
        letterSpacing: type.h3.letterSpacing,
    },
    weekLabel: {
        textTransform: 'uppercase',
    },
    weekMarker: {
        width: '100%',
        height: part.weekMarker,
        alignItems: 'center',
        paddingTop: space.xs,
    },
    weekHair: {
        width: StyleSheet.hairlineWidth,
        flex: 1,
    },
    card: {
        flex: 1,
        minWidth: 0,
        borderWidth: 1,
        borderRadius: radius.xl,
        overflow: 'hidden',
    },
    liveBar: {
        position: 'absolute',
        zIndex: 2,
        left: -1,
        top: -1,
        bottom: -1,
        width: radius.xl + 1,
        borderLeftWidth: part.liveBar,
        borderTopLeftRadius: radius.xl + 1,
        borderBottomLeftRadius: radius.xl + 1,
    },
    risk: {
        minHeight: calendarMetrics.statusHeight,
        justifyContent: 'center',
        paddingVertical: space.xs,
    },
    riskText: {
        letterSpacing: 0,
        lineHeight: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    nameButton: {
        flex: 1,
        minWidth: 0,
        minHeight: hit.icon,
        justifyContent: 'center',
    },
    customerGiven: {
        fontWeight: '500',
        letterSpacing: -0.2,
        lineHeight: 21,
    },
    customerSurname: {
        fontSize: part.nameSize,
        fontWeight: '800',
        letterSpacing: -0.6,
        lineHeight: 21,
    },
    phoneButton: {
        width: hit.icon,
        height: hit.icon,
        borderRadius: hit.icon / 2,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    moreButton: {
        width: hit.icon,
        height: hit.icon,
        borderRadius: hit.icon / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    moreDots: {
        gap: 3,
    },
    moreDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
    },
    avatar: {
        width: calendarMetrics.avatar,
        height: calendarMetrics.avatar,
        borderRadius: radius.pill,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    service: {
        marginTop: space.xs,
        fontSize: part.serviceSize,
        fontWeight: '500',
        lineHeight: 19,
    },
    statusWord: {
        fontWeight: '600',
    },
    summary: {
        minHeight: calendarMetrics.summaryMinHeight,
        marginTop: space.md,
        padding: space.md,
        borderRadius: radius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
    },
    packageChip: {
        width: part.packageChip,
        height: part.packageChip,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    packageNumber: {
        fontSize: type.h2.fontSize,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    packageTotal: {
        fontSize: type.small.fontSize,
        fontWeight: '700',
        opacity: 0.54,
    },
    summaryCopy: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    summaryTitle: {
        fontWeight: '800',
    },
    summaryAction: {
        width: part.summaryAction,
        height: part.summaryAction,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    livePanel: {
        minHeight: calendarMetrics.liveActionHeight + space.md,
        marginTop: space.md,
        padding: space.md,
        borderRadius: radius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    liveCopy: {
        flex: 1,
        minWidth: 0,
    },
    liveLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    liveDot: {
        width: part.liveDot,
        height: part.liveDot,
        borderRadius: radius.pill,
    },
    liveLabel: {
        letterSpacing: 0,
        textTransform: 'lowercase',
    },
    liveCounter: {
        lineHeight: display.counter.fontSize + space.xs,
    },
    liveStarted: {
        fontWeight: '500',
        letterSpacing: 0,
    },
    liveAction: {
        minWidth: part.actionMinWidth,
        height: calendarMetrics.liveActionHeight,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: {
        fontWeight: '800',
        letterSpacing: -0.3,
        textAlign: 'center',
    },
    dueRow: {
        minHeight: calendarMetrics.dueRowHeight,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: calendarMetrics.cardPadding,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.sm,
    },
    dueLabel: {
        flex: 1,
        fontWeight: '600',
        letterSpacing: 0,
    },
    dueAction: {
        minWidth: part.actionMinWidth,
        height: calendarMetrics.dueActionHeight,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nowLine: {
        minHeight: calendarMetrics.nowHeight + space.sm,
        paddingBottom: space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: calendarMetrics.timeGap,
    },
    nowPill: {
        height: calendarMetrics.nowHeight,
        paddingHorizontal: space.sm,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nowText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: -0.1,
    },
    nowHair: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
    dayEnd: {
        alignItems: 'center',
        gap: space.sm,
    },
    dayEndHair: {
        width: '100%',
        height: StyleSheet.hairlineWidth,
    },
    dayEndLabel: {
        fontWeight: '600',
        letterSpacing: 0,
    },
    timeline: {
        paddingTop: space.xs,
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: calendarMetrics.timeGap,
    },
    time: {
        paddingTop: calendarMetrics.cardPadding,
        fontSize: type.small.fontSize,
        fontWeight: '600',
    },
    timelineCard: {
        flex: 1,
    },
});
