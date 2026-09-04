import { useCallback, useMemo, useRef, useState } from 'react';
import {
    Animated, PanResponder, Pressable, ScrollView, Text, View,
    type RefreshControlProps,
} from 'react-native';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { isLive } from '../lib/calendar';
import {
    blockDetail, columnize, COLUMN_GAP, COLUMN_WIDTH, HOUR_HEIGHT, HOURS_WIDTH,
    hourLabels, nowLineTop,
    type ColumnStaff,
} from '../lib/managerCalendar';
import {
    DIM_OPACITY, DRAG_OPACITY, GHOST_OPACITY, LIFT_BORDER, LIFT_SCALE, LONG_PRESS_MS,
    moveBanner, resolveTarget, targetLabel,
    type MoveTarget,
} from '../lib/moveAppointment';
import { calendarMetrics, columnMetrics, font, moveMetrics, radius, useTheme } from '../theme';
import type { Appt } from '../lib/calendar';

/**
 * Müdür 06 — personel sütunlu gün görünümü. Müdür 07a/b — sürükleyerek taşıma.
 *
 * Personel takvimi tek sütundur çünkü personel yalnız kendi gününü görür.
 * Müdürünki aynı ekranın gövdesi değişmiş hâli: dev başlık, hafta şeridi ve
 * şimdi çizgisi aynı kalır, gövde sütunlara bölünür.
 *
 * SOL SAAT SÜTUNU SABİT. Yana kaydırmada sütunlar onun altından geçer —
 * saatler de kaysaydı müdür üçüncü sütundayken hangi saate baktığını
 * kaybederdi.
 *
 * SÜRÜKLEME çekirdek `PanResponder` ile yazıldı, yeni bir yerel bağımlılık
 * eklenmeden. Basılı tutma 250 ms sürüyor ve titreşimle bildiriliyor; kısa
 * dokunuş detayı açıyor, iki hareket birbirine karışmıyor. Blok kalktığı
 * anda iki kaydırıcı da kilitleniyor, yoksa parmak hem bloğu hem sayfayı
 * çekerdi.
 */
export function ColumnCalendar({ appointments, staff, from, to, nowMinutes, isToday, readOnly = false, refreshControl, onOpen, onSlot, onMove, onMenu }: {
    appointments: readonly Appt[];
    staff: readonly ColumnStaff[];
    /** Görünen saat aralığı (tam saat). */
    from: number;
    to: number;
    nowMinutes: number;
    isToday: boolean;
    /**
     * Personel görünümü: salonun tamamı görünür ama HİÇBİR ŞEY oynatılamaz.
     * Sadece `onMove`'u boş bırakmak yetmezdi — blok yine kalkar, sürüklenir,
     * bırakılır ve hiçbir şey olmazdı. Ölü bir jest, ölü bir düğmeden daha
     * kötüdür: kullanıcı denediğini sanır.
     */
    readOnly?: boolean;
    /**
     * Aşağı çekip yenileme. Dikey kaydırıcı BU bileşenin içinde yaşıyor;
     * dışarıdan bir `ScrollView` sarmak ikisini birbiriyle yarıştırırdı.
     * Kontrolü çağıran kurar, çünkü yenilemenin ne yaptığını o bilir.
     */
    refreshControl?: React.ReactElement<RefreshControlProps>;
    onOpen?: (appointment: Appt) => void;
    /** Boş saate dokunmak: o personel ve o saatle randevu oluşturma açılır. */
    onSlot?: (staffId: string, minutes: number) => void;
    /** Sürükleme bitti ve hedef geçerli. Kaynağa yazma işi çağırana ait. */
    onMove?: (appointment: Appt, target: MoveTarget) => void;
    /** Basılı tutmanın erişilebilir karşılığı ve güvenilir yol: kart menüsü. */
    onMenu?: (appointment: Appt) => void;
}) {
    const { c } = useTheme();
    const dayStart = from * 60;
    const dayEnd = to * 60;
    const hours = hourLabels(from, to);
    const gridHeight = hours.length * HOUR_HEIGHT;
    const byStaff = columnize(appointments, staff, dayStart);
    const nowTop = nowLineTop(nowMinutes, dayStart);
    const showNow = isToday && nowTop >= 0 && nowTop <= gridHeight;

    const [lifted, setLifted] = useState<{ appointment: Appt; index: number } | null>(null);
    const [target, setTarget] = useState<MoveTarget | null>(null);
    const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

    // Sürükleme sırasında sıkça okunuyor; her karede yeniden kurulan bir
    // closure yerine ref, aksi hâlde PanResponder eski değerleri görürdü.
    const liveState = useRef<{ appointment: Appt; index: number } | null>(null);
    // Hedef de ref'te: `endDrag` bağımlılık değiştirmesin. Değişseydi her
    // parmak hareketinde yeni bir PanResponder kurulurdu — sürüklemenin tam
    // ortasında el değiştiren bir tutamak.
    const targetRef = useRef<MoveTarget | null>(null);

    const beginLift = useCallback((appointment: Appt, index: number) => {
        feedback.medium();
        pan.setValue({ x: 0, y: 0 });
        liveState.current = { appointment, index };
        targetRef.current = null;
        setLifted({ appointment, index });
        setTarget(null);
    }, [pan]);

    const dragMove = useCallback((dx: number, dy: number) => {
        const current = liveState.current;
        if (!current) return;
        pan.setValue({ x: dx, y: dy });
        const next = resolveTarget({
            appointment: current.appointment,
            appointments,
            staff,
            fromIndex: current.index,
            dx,
            dy,
            dayStartMinutes: dayStart,
            dayEndMinutes: dayEnd,
        });
        targetRef.current = next;
        setTarget(next);
    }, [appointments, staff, dayStart, dayEnd, pan]);

    const endDrag = useCallback(() => {
        const current = liveState.current;
        const landing = targetRef.current;
        liveState.current = null;
        targetRef.current = null;
        setLifted(null);
        setTarget(null);
        pan.setValue({ x: 0, y: 0 });

        // Hedef dolu ya da değişmemişse HİÇBİR ŞEY OLMAZ. Sessizce üst üste
        // bindirme yok; blok bıraktığı yere geri döner.
        if (!current || !landing || !landing.valid || landing.unchanged) {
            if (landing && !landing.valid) feedback.error();
            return;
        }
        feedback.success();
        onMove?.(current.appointment, landing);
    }, [pan, onMove]);

    const banner = lifted ? moveBanner(lifted.appointment, target) : null;

    return (
        <View style={{ flex: 1 }}>
            {/**
             * Dikey kaydırma dışta: saat sütunu ve ızgara BİRLİKTE kaymalı,
             * yoksa saatler yerinde kalıp bloklarla hizası bozulur. Onbir
             * saatlik bir gün 814 pt tutuyor; ekrana sığmadığı için bu
             * sarmalayıcı olmadan günün alt kısmı büsbütün kesiliyordu.
             *
             * `automatic`: sistemin bu kaydırıcıyı birincil sayması için.
             */}
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                showsVerticalScrollIndicator={false}
                scrollEnabled={!lifted}
                // Blok havadayken yenileme YOK: parmak taşıma yapıyor.
                refreshControl={lifted ? undefined : refreshControl}
                contentContainerStyle={{ flexDirection: 'row' }}
            >
                {/* Sabit saat sütunu. Başlık satırı kadar boşlukla başlar ki
                    ilk saat ilk ızgara çizgisiyle hizalansın. */}
                <View style={{ width: HOURS_WIDTH, paddingLeft: columnMetrics.hoursX }}>
                    <View style={{ height: columnMetrics.headerHeight }} />
                    {hours.map((label) => (
                        <Num
                            key={label}
                            size={columnMetrics.hourText}
                            style={{
                                height: HOUR_HEIGHT,
                                paddingTop: columnMetrics.hourTop,
                                color: c.tx2,
                                fontFamily: font.medium,
                                fontWeight: '600',
                            }}
                        >
                            {label}
                        </Num>
                    ))}
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={!lifted}
                    contentContainerStyle={{ paddingRight: columnMetrics.gridPadRight }}
                >
                    <View>
                        {/* Sütun başlıkları: avatar + ad. Kenarlık hizmet türünü söyler. */}
                        <View style={{
                            flexDirection: 'row',
                            gap: COLUMN_GAP,
                            height: columnMetrics.headerHeight,
                            paddingBottom: columnMetrics.headerBottom,
                        }}>
                            {staff.map((person) => (
                                <View key={person.id} style={{
                                    width: COLUMN_WIDTH,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: columnMetrics.headerGap,
                                    minWidth: 0,
                                }}>
                                    <View style={{
                                        width: columnMetrics.headAvatar,
                                        height: columnMetrics.headAvatar,
                                        borderRadius: radius.pill,
                                        borderWidth: columnMetrics.headAvatarBorder,
                                        borderColor: person.color ?? c.bd2,
                                        backgroundColor: c.surf2,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Text style={{
                                            color: c.tx,
                                            fontSize: columnMetrics.headAvatarText,
                                            fontFamily: font.extraBold,
                                            fontWeight: '800',
                                        }}>
                                            {person.initials}
                                        </Text>
                                    </View>
                                    <Text numberOfLines={1} style={{
                                        flex: 1,
                                        color: c.tx,
                                        fontSize: columnMetrics.headName,
                                        fontFamily: font.bold,
                                        fontWeight: '700',
                                        letterSpacing: columnMetrics.headName * -0.02,
                                    }}>
                                        {person.name}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <View style={{ flexDirection: 'row', gap: COLUMN_GAP, height: gridHeight }}>
                            {staff.map((person, index) => (
                                <View key={person.id} style={{ width: COLUMN_WIDTH }}>
                                    {hours.map((label, hourIndex) => (
                                        <Pressable
                                            key={label}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${person.name} · ${label} · boş`}
                                            disabled={readOnly || Boolean(lifted)}
                                            onPress={() => {
                                                feedback.selection();
                                                onSlot?.(person.id, dayStart + hourIndex * 60);
                                            }}
                                            style={{
                                                height: HOUR_HEIGHT,
                                                borderTopWidth: 1,
                                                borderColor: c.bd,
                                            }}
                                        />
                                    ))}

                                    {(byStaff.get(person.id) ?? []).map(({ appointment, top, height }) => (
                                        <Block
                                            key={appointment.id}
                                            appointment={appointment}
                                            index={index}
                                            top={top}
                                            height={height}
                                            pan={pan}
                                            lifted={lifted?.appointment.id === appointment.id}
                                            dimmed={Boolean(lifted) && lifted?.appointment.id !== appointment.id}
                                            onPress={() => onOpen?.(appointment)}
                                            onLift={readOnly ? undefined : beginLift}
                                            onDragMove={dragMove}
                                            onDragEnd={endDrag}
                                            onMenu={readOnly ? undefined : onMenu}
                                        />
                                    ))}
                                </View>
                            ))}

                            {/* Hedef vurgusu: turuncu slot, yeni saati söyleyen etiket.
                                Hedef DOLUYSA çizilmez — vurgu bir söz veriyor. */}
                            {target && target.valid && !target.unchanged ? (
                                <TargetSlot
                                    target={target}
                                    staff={staff}
                                    dayStartMinutes={dayStart}
                                />
                            ) : null}

                            {/* Şimdi çizgisi BÜTÜN sütunları keser; saat hapı solda,
                                sabit saat sütununda duruyor. */}
                            {showNow ? (
                                <View
                                    pointerEvents="none"
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: nowTop,
                                        height: 1,
                                        backgroundColor: c.or,
                                        zIndex: 6,
                                    }}
                                />
                            ) : null}
                        </View>
                    </View>
                </ScrollView>
            </ScrollView>

            {/* Alt bant HER AN ne olacağını yazar: ipucu, hedef ya da doluluk
                sebebi. Sürükleme sırasında ekranda değişen tek metin bu. */}
            {banner ? <MoveBanner text={banner.text} tone={banner.tone} /> : null}
        </View>
    );
}

/** Hedef slotun turuncu vurgusu ve "13:30 · Deniz" etiketi. */
function TargetSlot({ target, staff, dayStartMinutes }: {
    target: MoveTarget;
    staff: readonly ColumnStaff[];
    dayStartMinutes: number;
}) {
    const { c } = useTheme();
    const index = staff.findIndex((person) => person.id === target.staffId);
    if (index < 0) return null;

    const perMinute = HOUR_HEIGHT / 60;
    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: index * (COLUMN_WIDTH + COLUMN_GAP),
                width: COLUMN_WIDTH,
                top: (target.startMinutes - dayStartMinutes) * perMinute,
                height: (target.endMinutes - target.startMinutes) * perMinute,
                borderRadius: moveMetrics.targetRadius,
                borderWidth: moveMetrics.targetBorder,
                borderColor: c.or,
                backgroundColor: moveMetrics.targetBg,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 4,
            }}
        >
            <Num size={moveMetrics.targetLabel} style={{
                color: c.or,
                fontFamily: font.extraBold,
                fontWeight: '800',
            }}>
                {targetLabel(target)}
            </Num>
        </View>
    );
}

function MoveBanner({ text, tone }: { text: string; tone: 'neutral' | 'orange' | 'red' }) {
    const { c } = useTheme();
    const skin = tone === 'orange'
        ? { bg: moveMetrics.bannerOkBg, border: moveMetrics.bannerOkBorder, fg: c.or2 }
        : tone === 'red'
            ? { bg: moveMetrics.bannerBadBg, border: moveMetrics.bannerBadBorder, fg: c.rd }
            : { bg: c.surf2, border: c.bd, fg: c.tx2 };

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: moveMetrics.bannerX,
                right: moveMetrics.bannerX,
                // Tab bar ekranın altını örtüyor; bant onun ÜSTÜNDE durmalı,
                // yoksa sürüklerken okunacak tek metin camın arkasında kalır.
                bottom: calendarMetrics.bottomInset,
                paddingVertical: moveMetrics.bannerY,
                paddingHorizontal: moveMetrics.bannerPadX,
                borderRadius: moveMetrics.bannerRadius,
                backgroundColor: skin.bg,
                borderWidth: 1,
                borderColor: skin.border,
            }}
        >
            <Text style={{
                color: skin.fg,
                fontSize: moveMetrics.bannerText,
                fontFamily: font.semiBold,
                fontWeight: '600',
                lineHeight: moveMetrics.bannerText * moveMetrics.bannerLine,
            }}>
                {text}
            </Text>
        </View>
    );
}

/**
 * Randevu bloğu. İçerik YÜKSEKLİĞE göre azalır — sığmayan metni küçültmek
 * yerine çıkarıyoruz, 11 pt'nin altına inen yazı zaten okunmuyor.
 *
 * Süre hiçbir hâlde yazılmaz: blok yüksekliği onu zaten söylüyor.
 *
 * Basılı tutunca kalkar: kenarlık turuncuya döner, %4 büyür ve parmağı
 * izler; diğer bloklar geri çekilir.
 */
function Block({ appointment, index, top, height, pan, lifted, dimmed, onPress, onLift, onDragMove, onDragEnd, onMenu }: {
    appointment: Appt;
    index: number;
    top: number;
    height: number;
    pan: Animated.ValueXY;
    lifted: boolean;
    dimmed: boolean;
    onPress: () => void;
    /** Yoksa blok kalkmaz — personel görünümü. */
    onLift?: (appointment: Appt, index: number) => void;
    onDragMove: (dx: number, dy: number) => void;
    onDragEnd: () => void;
    onMenu?: (appointment: Appt) => void;
}) {
    const { c } = useTheme();
    const detail = blockDetail(height);
    const live = isLive(appointment);
    const done = Boolean(appointment.service_ended_at) || appointment.status === 'completed';

    // Parmak kımıldadıysa kalkış bırakma sayılmaz; `onPressOut` sürüklemeyi
    // iptal etmemeli.
    const dragging = useRef(false);
    const liftedRef = useRef(false);
    liftedRef.current = lifted;

    const responder = useMemo(() => PanResponder.create({
        // Dokunuş her zaman `Pressable`'a gider: kısa dokunuş detayı açar.
        onStartShouldSetPanResponderCapture: () => false,
        // Blok kalktıysa ilk kıpırdamada sorumluluğu alırız; `Pressable`
        // orada sonlanır ve basma hâli düşer.
        onMoveShouldSetPanResponderCapture: () => {
            if (!liftedRef.current) return false;
            /**
             * Bayrak BURADA kalkıyor, `onPanResponderGrant`'ta değil.
             *
             * Sorumluluk el değiştirirken React Native önce ESKİ sahibi
             * sonlandırıyor: `Pressable` `onPressOut` yayıyor ve o da
             * "kaldırdı ama kımıldatmadan bıraktı" sanıp taşımayı iptal
             * ediyordu. Yani blok kalkıyor, ilk kıpırdamada geri düşüyordu.
             * Grant, terminate'ten SONRA geldiği için orada geç kalıyor.
             */
            dragging.current = true;
            return true;
        },
        onPanResponderMove: (_event, gesture) => onDragMove(gesture.dx, gesture.dy),
        onPanResponderRelease: () => { dragging.current = false; onDragEnd(); },
        onPanResponderTerminate: () => { dragging.current = false; onDragEnd(); },
    }), [onDragMove, onDragEnd]);

    return (
        <Animated.View
            {...responder.panHandlers}
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top,
                height,
                zIndex: lifted ? 8 : 1,
                opacity: dimmed ? DIM_OPACITY : 1,
                transform: lifted
                    ? [{ translateX: pan.x }, { translateY: pan.y }, { scale: LIFT_SCALE }]
                    : [],
            }}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${appointment.start_time.slice(0, 5)} · ${appointment.customer_name} · ${appointment.service}`}
                // Sürükleme ıslak parmakla, ayakta, tek elle yapılamaz.
                // Menü her koşulda çalışan yol; erişilebilirlik eylemi olarak
                // da veriliyor.
                accessibilityActions={onMenu ? [{ name: 'longpress', label: 'Taşı ve düzenle' }] : undefined}
                onAccessibilityAction={() => onMenu?.(appointment)}
                delayLongPress={LONG_PRESS_MS}
                onLongPress={() => { dragging.current = false; onLift?.(appointment, index); }}
                onPressOut={() => {
                    // Kaldırdı ama kımıldatmadan bıraktı: taşıma iptal.
                    if (liftedRef.current && !dragging.current) onDragEnd();
                }}
                onPress={() => { feedback.selection(); onPress(); }}
                style={{
                    flex: 1,
                    borderRadius: radius.lg,
                    backgroundColor: lifted ? c.card : c.surf,
                    borderWidth: lifted ? LIFT_BORDER : 1,
                    borderColor: lifted ? c.or : live ? `${c.or}70` : c.bd2,
                    paddingVertical: columnMetrics.blockY,
                    paddingLeft: live ? columnMetrics.blockLiveX : columnMetrics.blockX,
                    paddingRight: columnMetrics.blockX,
                    gap: 1,
                    overflow: 'hidden',
                    opacity: done && !lifted ? columnMetrics.doneOpacity : lifted ? DRAG_OPACITY : 1,
                }}
            >
                {/* Canlı işlem: soldaki turuncu şerit. Takvim kartındaki dille aynı. */}
                {live ? (
                    <View style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: columnMetrics.liveBar,
                        borderRadius: columnMetrics.liveBar,
                        backgroundColor: c.or,
                    }} />
                ) : null}

                {detail === 'full' || detail === 'timeAndName' ? (
                    <Num size={columnMetrics.blockTime} style={{
                        color: c.tx2,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {appointment.start_time.slice(0, 5)}
                    </Num>
                ) : null}

                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: columnMetrics.blockName,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: columnMetrics.blockName * -0.03,
                }}>
                    {appointment.customer_name.split(' ')[0]}
                </Text>

                {detail === 'full' ? (
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: columnMetrics.blockService,
                        fontFamily: font.medium,
                        fontWeight: '600',
                    }}>
                        {appointment.service}
                    </Text>
                ) : null}
            </Pressable>

            {/* Bıraktığı yerde duran kesik çizgili hayalet. */}
            {lifted ? <Ghost pan={pan} /> : null}
        </Animated.View>
    );
}

/**
 * Hayalet, kalkan bloğun ÇOCUĞU ve onun kaymasını tersine çevirerek yerinde
 * kalıyor. Ayrı bir kardeş olarak çizmek, sütunun mutlak konumunu ikinci kez
 * hesaplamak demekti.
 */
function Ghost({ pan }: { pan: Animated.ValueXY }) {
    const { c } = useTheme();
    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: c.bd2,
                opacity: GHOST_OPACITY,
                transform: [
                    { translateX: Animated.multiply(pan.x, -1) },
                    { translateY: Animated.multiply(pan.y, -1) },
                    { scale: 1 / LIFT_SCALE },
                ],
            }}
        />
    );
}
