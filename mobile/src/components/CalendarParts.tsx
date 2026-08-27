import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
    Animated,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
    calendarCardStates,
    elapsed,
    lateMinutes,
    monthGrid,
    nowLineAfter,
    statusWord,
    toMinutes,
    type Appt,
    type CardState,
} from '../lib/calendar';
import { feedback } from '../lib/feedback';
import {
    calendarMetrics,
    display,
    flowMetrics,
    font,
    hit,
    numeric,
    offlineBar,
    onAccent,
    radius,
    skeleton,
    space,
    type,
    useTheme,
} from '../theme';
import { lowerTR, upperTR } from '../lib/text';

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
    nameFirst: 15.5,
    nameLast: 21,
    phoneButton: 40,
    serviceSize: 13.5,
    packageChip: 42,
    summaryAction: 44,
    actionMinWidth: 118,
    // Ay ızgarası: sütun başlığı 11, gün rakamı 16, yoğunluk noktası 4.
    // Izgaranın yatay dolgusu sayfanınkinden (18) dar; yedi sütun 375 pt'de
    // sıkışmasın diye tasarım 12 kullanıyor.
    monthPageX: 12,
    monthHead: 11,
    monthNumber: 16,
    monthDot: 4,
    monthFooterLabel: 14,
} as const;

const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
const DAY_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;
/** Ay ızgarasının sütun başlıkları — hafta pazartesi başlar, DAY_SHORT'tan farklı sıra. */
const MONTH_HEAD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
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
    /**
     * Yalnız MÜDÜR modunda verilir. Personelin kendi ekranında "Saati değiştir"
     * ve "Personeli değiştir" YOKTUR — kumanda kendi gününü düzenlemez, uygular.
     * Müdürde açıkta duruyor çünkü en çok yapılan düzeltme bu ikisi.
     */
    onReschedule?: (appointment: Appt) => void;
    onReassign?: (appointment: Appt) => void;
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
    monthOpen,
    onToggleMonth,
    style,
}: {
    dateISO: string;
    subtitle: string;
    compact?: boolean;
    transparent?: boolean;
    /** Ay ızgarası açık mı? Yalnız erişilebilirlik durumunu bildirmek için. */
    monthOpen?: boolean;
    /** Verilirse başlık ay ızgarasını açıp kapatan düğmeye dönüşür. */
    onToggleMonth?: () => void;
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

    const body = (
        <>
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
        </>
    );

    // Ay ızgarasının anahtarı başlığın kendisidir; tasarımda ayrı bir düğme yok.
    // Bu yüzden erişilebilirlik durumu ve etiketi burada açıkça söylenir.
    if (onToggleMonth) {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: monthOpen }}
                accessibilityLabel={`${fullDate(dateISO)}. ${subtitle}`}
                accessibilityHint={monthOpen ? 'Hafta görünümüne döner' : 'Ay görünümünü açar'}
                onPress={onToggleMonth}
                style={({ pressed }) => [
                    styles.dayHeader,
                    { paddingHorizontal: calendarMetrics.pageX, opacity: pressed ? 0.62 : 1 },
                    style,
                ]}
            >
                {body}
            </Pressable>
        );
    }

    return (
        <View
            accessibilityRole="header"
            accessibilityLabel={`${fullDate(dateISO)}. ${subtitle}`}
            style={[styles.dayHeader, { paddingHorizontal: calendarMetrics.pageX }, style]}
        >
            {body}
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
                /*
                 * BİLİNMEYEN GÜN İLE BOŞ GÜN AYRI ŞEYDİR.
                 *
                 * Daha önce `counts[day.date] ?? 0` yazıyordu: sayılar
                 * okunamadığında bütün günler "sıfır randevu" oluyordu ve ekran
                 * müdüre olmayan bir bilgiyi söylüyordu. Sıfır bir ölçümdür,
                 * bilinmemek bir boşluktur. Anahtar yoksa nokta çizilmez ve
                 * ekran okuyucu "randevu yok" DEMEZ.
                 */
                const count = counts[day.date];
                const known = count !== undefined;
                const dotSize = known && count >= 3 ? part.weekDotDense : part.weekDot;
                return (
                    <Pressable
                        key={day.date}
                        accessibilityRole="button"
                        accessibilityLabel={`${fullDate(day.date)}, ${
                            !known ? 'randevu sayısı bilinmiyor'
                                : count ? `${count} randevu` : 'randevu yok'
                        }`}
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
                                    borderRadius: radius.md,
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
                            {upperTR(day.label)}
                        </Text>
                        <View style={styles.weekMarker}>
                            {known && count > 0 ? (
                                <View style={{
                                    width: dotSize,
                                    height: dotSize,
                                    borderRadius: radius.pill,
                                    backgroundColor: count >= 3 ? c.tx2 : c.tx3,
                                }} />
                            ) : null}
                            {known && count > 0 ? <View style={[styles.weekHair, { backgroundColor: c.bd }]} /> : null}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** İskelet bloğu. Parlama yok — tasarımın kuralı: bekleme sakin geçer. */
function Skel({ width, height, style }: {
    width?: number | `${number}%`;
    height: number;
    style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();
    return (
        <View style={[
            { width, height, borderRadius: skeleton.radius, backgroundColor: c.surf2 },
            style,
        ]} />
    );
}

/**
 * Gün listesinin iskeleti.
 *
 * ŞART (hareket sözleşmesi 12): iskelet, gerçek içeriğin geometrisini 4 pt
 * içinde tutmalı. Tutmazsa geçiş solma değil zıplama olur. Bu yüzden satır
 * yüksekliği, saat sütunu genişliği ve kart dolgusu gerçek kartla aynı
 * ölçülerden okunur — burada serbest sayı yok.
 */
export function TimelineSkeleton({ rows = 3, style }: {
    rows?: number;
    style?: StyleProp<ViewStyle>;
}) {
    const { c, small } = useTheme();
    const padding = small ? calendarMetrics.cardPaddingSmall : calendarMetrics.cardPadding;

    return (
        <View
            accessibilityLabel="Gün yükleniyor"
            style={[styles.timeline, style]}
        >
            {Array.from({ length: rows }, (_, index) => (
                <View key={index} style={styles.timelineRow}>
                    <Skel
                        width={skeleton.time.width}
                        height={skeleton.time.height}
                        style={{ marginTop: padding }}
                    />
                    <View style={[
                        styles.card,
                        { backgroundColor: c.surf, borderColor: c.bd, padding, gap: space.xs },
                    ]}>
                        <Skel width={index === 1 ? 150 : 120} height={skeleton.name.height} />
                        <Skel width={index === 1 ? 120 : 190} height={skeleton.service.height} />
                    </View>
                </View>
            ))}
        </View>
    );
}

/**
 * Gömülü müşteri özetinin iskeleti — kart gövdesi DOLUYKEN görünebilir.
 * Özet ayrı bir istekle geldiği için tasarım bu ara hâli ayrıca çiziyor.
 */
export function SummarySkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
    const { embed: e } = useTheme();
    return (
        <View style={[styles.summary, { backgroundColor: e.bg, gap: space.sm + 2 }, style]}>
            <View style={{ width: '52%', height: 14, borderRadius: 9, backgroundColor: e.skeleton }} />
            <View style={{ width: '34%', height: 12, borderRadius: 9, backgroundColor: e.skeleton }} />
        </View>
    );
}

/**
 * Çevrimdışı bandı.
 *
 * Bant HEP MONTE (hareket sözleşmesi 13): yükseklik animasyonu yok, band
 * translateY −26 → 0 ile iner ve altındaki içerik aynı miktarda aşağı kayar.
 * İkisi de dönüşüm, ikisi de native sürücüde. "Hareketi azalt" açıkken kayma
 * kalkar, bant yerini anında alır ve 140 ms'de solarak görünür.
 */
export function OfflineBar({ text, progress, style }: {
    text: string | null;
    /** 0 gizli, 1 görünür. Aynı değer alttaki içeriği de kaydırır; iki hareket
     *  ayrı ayrı zamanlanırsa bant ile içerik arasında boşluk açılır. */
    progress: Animated.Value;
    style?: StyleProp<ViewStyle>;
}) {
    const { c, reduceMotion } = useTheme();

    return (
        <Animated.View
            accessibilityLiveRegion="polite"
            pointerEvents="none"
            style={[
                styles.offlineBar,
                { backgroundColor: c.am },
                {
                    opacity: progress,
                    transform: [{
                        translateY: reduceMotion
                            ? 0
                            : progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-offlineBar.height, 0],
                            }),
                    }],
                },
                style,
            ]}
        >
            <Text numberOfLines={1} style={styles.offlineText}>{text ?? ''}</Text>
        </Animated.View>
    );
}

/** Bandın iniş/çıkış zamanlaması — bant ve içerik kaymasının TEK kaynağı. */
export function animateOfflineBar(
    progress: Animated.Value,
    shown: boolean,
    reduceMotion: boolean,
) {
    Animated.timing(progress, {
        toValue: shown ? 1 : 0,
        // Sözleşme: iniş 220 OUT, çıkış 180 IN. Hareket azaltılmışsa kayma
        // yok, yalnız 140 ms'lik solma kalır.
        duration: reduceMotion ? 140 : shown ? 220 : 180,
        easing: reduceMotion
            ? Easing.linear
            : shown ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
        useNativeDriver: true,
    }).start();
}

function ChevronUpIcon({ color }: { color: string }) {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
                d="m6 14.5 6-6 6 6"
                stroke={color}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </Svg>
    );
}

/**
 * Ay ızgarası — hafta şeridinin yerini alır, altına inmez.
 *
 * Yoğunluk noktayla anlatılır ve ÜÇ kademelidir: bir randevu tek soluk nokta,
 * iki randevu iki soluk nokta, üç ve üstü üç TURUNCU nokta. Sayı yazılmaz;
 * ızgarada rakam okumak, bakışta yoğunluk görmekten yavaştır.
 */
export function MonthGrid({
    anchorISO,
    selectedISO,
    counts,
    onSelect,
    style,
}: {
    anchorISO: string;
    selectedISO: string;
    counts: Record<string, number>;
    onSelect: (dateISO: string) => void;
    style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();
    const weeks = useMemo(() => monthGrid(anchorISO), [anchorISO]);

    return (
        <View style={[styles.month, style]}>
            <View style={styles.monthHead}>
                {MONTH_HEAD.map((label) => (
                    <Text key={label} style={[styles.monthHeadLabel, { color: c.tx3 }]}>
                        {upperTR(label)}
                    </Text>
                ))}
            </View>

            {weeks.map((week) => (
                <View key={week[0].date} style={styles.monthRow}>
                    {week.map((cell) => {
                        const selected = cell.date === selectedISO;
                        // Aynı kural: anahtar yoksa gün BİLİNMİYOR, boş değil.
                        const count = counts[cell.date];
                        const known = count !== undefined;
                        const dense = known && count >= 3;
                        const dots = known ? Math.min(3, count) : 0;
                        return (
                            <Pressable
                                key={cell.date}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                accessibilityLabel={`${fullDate(cell.date)}, ${
                                    !known ? 'randevu sayısı bilinmiyor'
                                        : count ? `${count} randevu` : 'randevu yok'
                                }`}
                                onPress={() => onSelect(cell.date)}
                                style={({ pressed }) => [
                                    styles.monthCell,
                                    selected && {
                                        backgroundColor: c.surf2,
                                        borderColor: c.bd2,
                                        borderWidth: 1,
                                    },
                                    { opacity: pressed ? 0.62 : 1 },
                                ]}
                            >
                                <Text style={[
                                    styles.monthNumber,
                                    numeric,
                                    selected
                                        ? { color: c.tx, fontWeight: '800' }
                                        : cell.inMonth
                                            ? { color: c.tx2 }
                                            // Komşu ayın günü: hem daha soluk renk hem düşük
                                            // opaklık. Tek başına renk, koyu temada yeterince
                                            // geri çekilmiyor.
                                            : { color: c.tx3, opacity: 0.5 },
                                ]}>
                                    {cell.day}
                                </Text>
                                <View style={styles.monthDots}>
                                    {Array.from({ length: dots }, (_, index) => (
                                        <View
                                            key={index}
                                            style={[
                                                styles.monthDot,
                                                { backgroundColor: dense ? c.or : c.tx3 },
                                            ]}
                                        />
                                    ))}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

/** Ay ızgarasını kapatan tek eylem. Izgaranın dışında, kendi satırında durur. */
export function MonthFooter({ onClose, style }: {
    onClose: () => void;
    style?: StyleProp<ViewStyle>;
}) {
    const { c } = useTheme();
    return (
        <View style={[styles.monthFooter, style]}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Haftaya dön"
                onPress={onClose}
                style={({ pressed }) => [
                    styles.monthFooterButton,
                    {
                        backgroundColor: c.surf2,
                        borderColor: c.bd,
                        opacity: pressed ? 0.62 : 1,
                    },
                ]}
            >
                <ChevronUpIcon color={c.tx2} />
                <Text style={[styles.monthFooterLabel, { color: c.tx2 }]}>Haftaya dön</Text>
            </Pressable>
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
            hitSlop={(hit.icon - part.phoneButton) / 2}
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

function EmptyCalendarIcon({ color }: { color: string }) {
    return (
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
            <Path
                d="M4 9.5h16M8.5 3.4v3M15.5 3.4v3M5 5.6h14a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1zM8 13h2M14 13h2M8 16.6h2"
                stroke={color}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </Svg>
    );
}

function EmptyArrowIcon({ color }: { color: string }) {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
                d="M6.5 17.5 17.5 6.5M9.5 6.5h8v8"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </Svg>
    );
}

const DAY_DATIVE = [
    'Pazara', 'Pazartesiye', 'Salıya', 'Çarşambaya',
    'Perşembeye', 'Cumaya', 'Cumartesiye',
] as const;

export function EmptyDay({
    dateISO,
    nextAppointment,
    onGoNext,
    style,
}: {
    dateISO: string;
    nextAppointment: Appt | null;
    onGoNext?: (appointment: Appt) => void;
    style?: StyleProp<ViewStyle>;
}) {
    const { c, small } = useTheme();
    const date = dateFromISO(dateISO);
    const dayName = DAY_LONG[date.getDay()];
    const nextDate = nextAppointment ? dateFromISO(nextAppointment.date) : null;
    const nextDayName = nextDate ? DAY_LONG[nextDate.getDay()] : null;
    const nextTime = nextAppointment?.start_time.slice(0, 5);

    return (
        <View
            accessibilityLabel={nextAppointment
                ? `${dayName} günü randevunuz yok. Bir sonraki randevu ${nextDayName} ${nextTime}, ${nextAppointment.customer_name}.`
                : `${dayName} günü randevunuz yok. Yaklaşan başka randevu bulunmuyor.`}
            style={[
                styles.emptyDay,
                { minHeight: small ? 300 : 390 },
                style,
            ]}
        >
            <View style={[styles.emptyRing, { backgroundColor: c.surf2, borderColor: c.bd }]}>
                <EmptyCalendarIcon color={c.tx3} />
            </View>
            <Text accessibilityRole="header" style={[type.h2, styles.emptyTitle, { color: c.tx }]}>
                Bu gün randevunuz yok.
            </Text>
            <Text style={[styles.emptyDescription, { color: c.tx2 }]}>
                {dayName} tamamen boş.{' '}
                {nextAppointment && nextDayName ? (
                    <>
                        Bir sonraki randevu{' '}
                        <Text style={styles.emptyStrong}>
                            {nextDayName.toLocaleLowerCase('tr-TR')} {nextTime},
                        </Text>
                        {' '}{nextAppointment.customer_name}.
                    </>
                ) : 'Yaklaşan başka randevu bulunmuyor.'}
            </Text>
            {nextAppointment && nextDate && onGoNext ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${nextDayName} gününe, ${nextTime} randevusuna git`}
                    onPress={() => onGoNext(nextAppointment)}
                    style={({ pressed }) => [
                        styles.emptyAction,
                        {
                            backgroundColor: c.surf2,
                            borderColor: c.bd2,
                            opacity: pressed ? 0.78 : 1,
                        },
                    ]}
                >
                    <Text style={[styles.emptyActionText, { color: c.tx }]}>
                        {DAY_DATIVE[nextDate.getDay()]} git
                    </Text>
                    <EmptyArrowIcon color={c.tx} />
                </Pressable>
            ) : null}
        </View>
    );
}

function CustomerSummary({ appointment, onCustomer }: {
    appointment: Appt;
    onCustomer?: (appointment: Appt) => void;
}) {
    const { embed: e } = useTheme();
    const info = appointment.info;
    // `undefined` ile `null` BURADA farklı anlam taşır:
    //   undefined → özet henüz gelmedi (ayrı istek), iskelet göster
    //   null      → geldi ve gösterilecek bir şey yok, hiç çizme
    if (info === undefined) return <SummarySkeleton />;
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
                    <Text style={[type.tiny, styles.liveLabel, { color: e.tx2 }]}>{lowerTR('sürüyor')}</Text>
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
                    <Text style={[styles.actionText, styles.liveActionText, { color: onAccent }]}>İşleme dön</Text>
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
                                    { color: c.tx2 },
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
                                { color: c.tx },
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
            <ManagerActions appointment={appointment} actions={actions} />
        </View>
    );
}

/**
 * Kartın altındaki müdür eylemleri — "Saati değiştir" ve "Personeli".
 *
 * Personelin kendi ekranında bu satır HİÇ ÇİZİLMEZ: kumanda kendi gününü
 * düzenlemez, uygular. Aynı kart iki modda da kullanılıyor; farkı yaratan
 * şey, müdür ekranının bu iki tutamağı vermesi.
 *
 * Ana eylem değil ikincil düzeltmeler oldukları için kartın gövdesinde değil,
 * ayrı bir şeritte ve üstlerinde saç teli var.
 */
function ManagerActions({ appointment, actions }: {
    appointment: Appt;
    actions: AppointmentActions;
}) {
    const { c } = useTheme();
    if (!actions.onReschedule && !actions.onReassign) return null;

    const mini = (label: string, icon: 'clock' | 'swap', onPress: () => void) => (
        <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`${appointment.customer_name} · ${label}`}
            onPress={() => { feedback.selection(); onPress(); }}
            style={{
                flex: 1,
                height: flowMetrics.miniHeight,
                paddingHorizontal: flowMetrics.miniButtonX,
                borderRadius: flowMetrics.miniRadius,
                backgroundColor: c.surf2,
                borderWidth: 1,
                borderColor: c.bd,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: flowMetrics.miniGapInner,
            }}
        >
            <Svg width={flowMetrics.miniIcon} height={flowMetrics.miniIcon} viewBox="0 0 24 24" fill="none">
                {icon === 'clock' ? (
                    <>
                        <Circle cx={12} cy={12} r={8.4} stroke={c.tx} strokeWidth={1.7} />
                        <Path d="M12 7.6V12l3 2" stroke={c.tx} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                    </>
                ) : (
                    <Path d="M4 8h13l-3-3M20 16H7l3 3" stroke={c.tx} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                )}
            </Svg>
            <Text style={{
                color: c.tx,
                fontSize: flowMetrics.miniText,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: flowMetrics.miniText * -0.01,
            }}>
                {label}
            </Text>
        </Pressable>
    );

    return (
        <View style={{
            flexDirection: 'row',
            gap: space.sm,
            paddingTop: flowMetrics.evActsY,
            paddingHorizontal: calendarMetrics.cardPadding,
            paddingBottom: calendarMetrics.cardPadding,
            borderTopWidth: 1,
            borderColor: c.bd,
        }}>
            {actions.onReschedule ? mini('Saati değiştir', 'clock', () => actions.onReschedule?.(appointment)) : null}
            {actions.onReassign ? mini('Personeli', 'swap', () => actions.onReassign?.(appointment)) : null}
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

/**
 * Yenilemeden sonra DEĞİŞEN satırın belirişi (hareket sözleşmesi 11).
 * Çekme hareketi sistemin; bizim tanımladığımız tek şey sonrası: yalnız değişen
 * satırlar 140 ms'de opaklıkla belirir. Değişmeyen satır hiç kıpırdamaz.
 */
function EnterFade({ active, children }: { active: boolean; children: ReactNode }) {
    const { reduceMotion } = useTheme();
    const opacity = useRef(new Animated.Value(active ? 0 : 1)).current;

    useEffect(() => {
        if (!active) {
            opacity.setValue(1);
            return;
        }
        opacity.setValue(reduceMotion ? 1 : 0);
        if (reduceMotion) return;
        Animated.timing(opacity, {
            toValue: 1,
            duration: 140,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start();
    }, [active, opacity, reduceMotion]);

    return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export function Timeline({
    appointments,
    nowMinutes,
    isToday,
    states,
    elapsedSecondsById = {},
    actions,
    showDayEnd = true,
    enteringIds,
    style,
}: {
    appointments: Appt[];
    nowMinutes: number;
    isToday: boolean;
    states?: Map<string, CardState>;
    elapsedSecondsById?: Record<string, number>;
    actions?: AppointmentActions;
    showDayEnd?: boolean;
    /** Yenilemede değişen randevular; yalnız bunlar solarak belirir. */
    enteringIds?: ReadonlySet<string>;
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
                    <EnterFade active={enteringIds?.has(appointment.id) ?? false}>
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
                    </EnterFade>
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
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekNumberText: {
        fontSize: type.h3.fontSize,
        fontWeight: '800',
        letterSpacing: type.h3.letterSpacing,
    },
    weekLabel: {
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
    offlineBar: {
        height: offlineBar.height,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs + 2,
    },
    offlineText: {
        fontSize: offlineBar.fontSize,
        fontWeight: '700',
        color: offlineBar.tx,
    },
    month: {
        paddingTop: space.sm - 2,
        paddingHorizontal: part.monthPageX,
        paddingBottom: calendarMetrics.cardGap,
        gap: 2,
    },
    monthHead: {
        flexDirection: 'row',
        paddingBottom: space.xs,
    },
    monthHeadLabel: {
        flex: 1,
        textAlign: 'center',
        fontSize: part.monthHead,
        fontWeight: '700',
        letterSpacing: part.monthHead * 0.06,
    },
    monthRow: {
        flexDirection: 'row',
    },
    monthCell: {
        flex: 1,
        height: calendarMetrics.monthCell,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: radius.md,
    },
    monthNumber: {
        fontSize: part.monthNumber,
        fontWeight: '700',
        lineHeight: part.monthNumber,
    },
    monthDots: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        height: 5,
    },
    monthDot: {
        width: part.monthDot,
        height: part.monthDot,
        borderRadius: radius.pill,
    },
    monthFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: calendarMetrics.pageX,
    },
    monthFooterButton: {
        flex: 1,
        height: hit.icon,
        borderRadius: radius.md,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs + 2,
    },
    monthFooterLabel: {
        fontSize: part.monthFooterLabel,
        fontWeight: '700',
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
        fontSize: part.nameFirst,
        fontWeight: '500',
        letterSpacing: part.nameFirst * -0.01,
        lineHeight: part.nameFirst * 1.1,
    },
    customerSurname: {
        fontSize: part.nameLast,
        fontWeight: '800',
        letterSpacing: part.nameLast * -0.03,
        lineHeight: part.nameLast * 1.1,
    },
    phoneButton: {
        width: part.phoneButton,
        height: part.phoneButton,
        borderRadius: part.phoneButton / 2,
        borderWidth: 1.5,
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
        fontSize: 13.5,
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
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: {
        fontWeight: '800',
        letterSpacing: -0.3,
        textAlign: 'center',
    },
    liveActionText: {
        fontSize: 14.5,
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
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
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
    emptyDay: {
        paddingHorizontal: 40,
        paddingBottom: 90,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.md,
    },
    emptyRing: {
        width: 66,
        height: 66,
        borderRadius: 33,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        textAlign: 'center',
    },
    emptyDescription: {
        fontSize: 14.5,
        fontWeight: '500',
        lineHeight: 21.75,
        textAlign: 'center',
    },
    emptyStrong: {
        fontWeight: '800',
    },
    emptyAction: {
        minHeight: hit.actionSm,
        marginTop: 4,
        paddingHorizontal: 22,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
    },
    emptyActionText: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.32,
    },
});
