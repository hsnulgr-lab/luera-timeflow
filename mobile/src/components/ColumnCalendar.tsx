import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated, Dimensions, PanResponder, Pressable, ScrollView, Text, View,
    type NativeScrollEvent, type NativeSyntheticEvent,
    type RefreshControlProps,
} from 'react-native';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { isLive } from '../lib/calendar';
import { isReschedulable } from '../lib/appointmentDetail';
import {
    blockDetail, blockLayout, columnize, COLUMN_GAP, COLUMN_WIDTH, DRAG_BANNER_RESERVE, edgeStep, HOUR_HEIGHT, HOURS_WIDTH,
    hourLabels, nowLineTop, soloBlockShape,
    type ColumnStaff, type SoloBlockShape,
} from '../lib/managerCalendar';
import {
    DIM_OPACITY, DRAG_OPACITY, GHOST_OPACITY, LIFT_BORDER, LIFT_SCALE, LONG_PRESS_MS,
    moveBanner, resolveTarget, targetLabel,
    type MoveTarget,
} from '../lib/moveAppointment';
import { calendarMetrics, columnMetrics, font, moveMetrics, radius, soloColumnMetrics, useTheme } from '../theme';
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
export function ColumnCalendar({ appointments, staff, mine, from, to, nowMinutes, isToday, readOnly = false, soloColumn = false, refreshControl, onOpen, onSlot, onMove, onMenu, focusId = null }: {
    appointments: readonly Appt[];
    staff: readonly ColumnStaff[];
    /**
     * KENDİ randevularının id'leri.
     *
     * `undefined` "sahiplik diye bir soru yok" demek — müdür görünümü böyle ve
     * orada davranış hiç değişmiyor. Boş küme ise "hiçbiri senin değil" demek;
     * ikisi ayrı cevaplar ve aynı şeye indirgenemez.
     *
     * Neden gerekli: personel takviminde kendi randevusuna dokunmak KUMANDAYI
     * açıyor, meslektaşınınki yalnız okunur bir kart. Farklı davranan iki şey
     * aynı görünüyordu; kullanıcı bunu ancak dokunduktan sonra öğreniyordu.
     */
    mine?: ReadonlySet<string>;
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
     * TEK SÜTUN kipi — tek kişilik işletme (108).
     *
     * İki şey değişiyor: sütun başlıkları çizilmiyor ve kalan tek sütun
     * ekranı dolduruyor.
     *
     * Başlık çıkıyor çünkü orada yazan şey "bu sütun kimin" ve tek sütunlu
     * bir takvimde o sorunun cevabı zaten tek: ekrana bakan kişi. Avatar ve
     * ad, 44 pt'yi ızgaradan alıp hiçbir şey söylemeyen bir satıra veriyordu.
     *
     * Sütun genişliyor çünkü 95 pt beş kişiyi yan yana sığdırmak için
     * seçilmişti. Tek sütunda o kısıt yok ve genişleyen blokta hizmet adı
     * kırpılmadan sığıyor. Tasarım: v4 · T1.
     */
    soloColumn?: boolean;
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
    /**
     * Gösterilecek randevu (2026-10-15, kullanıcı kararı): personelin başka
     * güne ait bildirimine dokununca takvim o günde açılıyor ve ızgara bu
     * randevunun saatine kayıyor. Görünüm değişmiyor — yalnız kaydırma.
     */
    focusId?: string | null;
}) {
    const { c } = useTheme();
    const dayStart = from * 60;
    const dayEnd = to * 60;
    const hours = hourLabels(from, to);
    /**
     * Izgaranın ölçüleri: ekipte Müdür 06, tek sütunda v4 · T1.
     *
     * T1 saati 74 değil 69 pt çiziyor, saat sütunu 58 pt ve etiket çizginin
     * 6 pt altında. Sürükleme hedefi ve şimdi çizgisi de AYNI saat boyuyla
     * hesaplanıyor — biri 69, öbürü 74 olsaydı blok parmağın altından kayardı.
     */
    const grid = soloColumn
        ? {
            hourHeight: soloColumnMetrics.hourHeight,
            hoursWidth: soloColumnMetrics.hoursWidth,
            hoursX: soloColumnMetrics.hourX,
            hourText: soloColumnMetrics.hourText,
            hourTop: soloColumnMetrics.hourTop,
            hourWeight: '500' as const,
            hourSpacing: 0,
            nowLine: soloColumnMetrics.nowLine,
        }
        : {
            hourHeight: HOUR_HEIGHT,
            hoursWidth: HOURS_WIDTH,
            hoursX: columnMetrics.hoursX,
            hourText: columnMetrics.hourText,
            hourTop: columnMetrics.hourTop,
            hourWeight: '600' as const,
            hourSpacing: undefined,
            nowLine: 1,
        };
    const hourHeight = grid.hourHeight;
    const gridHeight = hours.length * hourHeight;
    const byStaff = columnize(appointments, staff, dayStart, hourHeight);
    const nowTop = nowLineTop(nowMinutes, dayStart, hourHeight);
    const showNow = isToday && nowTop >= 0 && nowTop <= gridHeight;

    /*
     * Sütun genişliği — tek sütunda ekranın kalanı.
     *
     * `Dimensions` çağrılıyor, `onLayout` ölçümü DEĞİL: genişlik ilk karede
     * gerekiyor ve ölçümü beklemek ızgaranın bir kare 95 pt çizilip sonra
     * atlamasına yol açardı. Döndürmede yeniden hesaplanmıyor; bu ekran
     * dikey ve telefon.
     *
     * `Math.max` emniyet: dar bir cihazda sütun 95'in altına inmiyor,
     * blok içindeki ad ve saat o genişlik için yazılmış.
     */
    const columnWidth = soloColumn
        ? Math.max(COLUMN_WIDTH, Dimensions.get('window').width - grid.hoursWidth - columnMetrics.gridPadRight)
        : COLUMN_WIDTH;
    /**
     * Izgaranın üstündeki pay. Ekipte sütun başlıkları; tek sütunda başlık
     * yok ama T1'in 22 pt'lik payı var (`cy("10:00") = 22`): ilk saat
     * çizgisi ve o saatteki blok hafta şeridinin çizgisine yapışmıyor.
     */
    const headerHeight = soloColumn ? soloColumnMetrics.gridTop : columnMetrics.headerHeight;

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

    /*
     * KENARDA KAYDIRMA için ölçüler. Hepsi ref: sürükleme karede bir kez
     * okuyor ve hiçbiri çizimi değiştirmiyor.
     */
    const rootRef = useRef<View>(null);
    const vScrollRef = useRef<ScrollView>(null);

    /*
     * Bildirimden gelen randevu bir kez gösteriliyor: gün okunup randevu
     * listeye düşünce ızgara onun saatine kayıyor (üstte bir saatlik pay).
     * Aynı kimlik ikinci kez kaydırmıyor — kişi kendi kaydırdığı yerde kalır.
     */
    const focused = useRef<string | null>(null);
    useEffect(() => {
        if (!focusId || focused.current === focusId) return undefined;
        const target = appointments.find((appointment) => appointment.id === focusId);
        if (!target) return undefined;
        focused.current = focusId;
        const y = Math.max(0, headerHeight + blockLayout(target, dayStart, hourHeight).top - hourHeight);
        const id = setTimeout(() => vScrollRef.current?.scrollTo({ y, animated: true }), 250);
        return () => clearTimeout(id);
    }, [focusId, appointments, headerHeight, dayStart, hourHeight]);
    const hScrollRef = useRef<ScrollView>(null);
    const metrics = useRef({ vOffset: 0, hOffset: 0, rootX: 0, rootY: 0 });
    /**
     * Parmağın son hâli ve kalkıştaki kaydırma. Blok içeriğin İÇİNDE çiziliyor:
     * ızgara S kadar kayınca parmağın altında kalması için öteleme de S kadar
     * artmalı — hem çizimde hem hedef hesabında.
     */
    const drag = useRef({ dx: 0, dy: 0, pageX: Number.NaN, pageY: Number.NaN, vStart: 0, hStart: 0 });
    const loop = useRef<ReturnType<typeof setInterval> | null>(null);

    /*
     * SÜRÜKLEME BOYUNCA TUTAMAK DEĞİŞMEMELİ.
     *
     * Hedef hesabı günün randevularına ve kadroya bakıyor. Bunlar bağımlılık
     * olsaydı, sürükleme sırasında takvim yenilendiğinde (25 sn yoklama,
     * ekrana dönüş) bütün taşıma zinciri yeniden kurulurdu: bloğun
     * `PanResponder`ı parmağın altında el değiştirir, jest sıfırdan başlar ve
     * blok zıplar ya da düşerdi. Girdiler ref'ten okunuyor; tutamak hiç
     * değişmiyor, hesap her zaman en güncel veriyle yapılıyor.
     */
    const inputs = useRef({ appointments, staff, dayStart, dayEnd, onMove, soloColumn, hourHeight });
    useEffect(() => {
        inputs.current = { appointments, staff, dayStart, dayEnd, onMove, soloColumn, hourHeight };
    }, [appointments, staff, dayStart, dayEnd, onMove, soloColumn, hourHeight]);

    /** Parmağın ve kaydırmanın birleşik hâlinden hedef — tek hesap. */
    const applyDrag = useCallback(() => {
        const current = liveState.current;
        if (!current) return;
        const m = metrics.current;
        const d = drag.current;
        const input = inputs.current;
        const dx = d.dx + (m.hOffset - d.hStart);
        const dy = d.dy + (m.vOffset - d.vStart);
        pan.setValue({ x: dx, y: dy });
        const next = resolveTarget({
            appointment: current.appointment,
            appointments: input.appointments,
            staff: input.staff,
            fromIndex: current.index,
            dx,
            dy,
            dayStartMinutes: input.dayStart,
            dayEndMinutes: input.dayEnd,
            hourHeight: input.hourHeight,
            // Tek sütunda doluluk sebebi adsız (v4 · karar 3).
            solo: input.soloColumn,
        });
        const before = targetRef.current;
        targetRef.current = next;
        // Kaydırma karede bir tetikliyor; hedef DEĞİŞMEDİYSE yeniden çizim yok.
        if (before?.startMinutes === next?.startMinutes
            && before?.staffId === next?.staffId
            && before?.valid === next?.valid) return;
        setTarget(next);
    }, [pan]);

    /**
     * Bir kare: parmak kenardaysa kaydırmayı İSTE.
     *
     * ── Neden yalnız istiyor, hesaplamıyor ──────────────────────────────────
     * İlk sürüm içerik yüksekliğini ve kaydırıcının ekrandaki yerini kendisi
     * ölçüyordu (`onContentSizeChange`, `measureInWindow`). İkisinden biri
     * gelmeyince "kaydırılacak yer yok" sanıp hiç kaydırmıyordu: blok parmağı
     * izliyor, ızgara yerinde duruyordu (2026-09-17, telefon).
     *
     * Şimdi iki şey kurulu RN'e bırakılıyor (`RCTScrollViewComponentView`):
     *   • SINIR — `scrollTo` hedefi içerik + sekme çubuğu payıyla kendisi
     *     kırpıyor; kilitli (`scrollEnabled=false`) kaydırıcıda da çalışıyor.
     *   • KONUM — her programlı kaydırmada `onScroll` yayıyor. Bloğun
     *     ötelemesi o olayla güncelleniyor (`onVScroll`), tahminle değil.
     *
     * Kenarlar da ölçüme bağlı değil: alt kenar turuncu bandın üstü, ekranın
     * kendisinden; sağ kenar ekranın sağı. Yalnız üst ve sol kenar ölçülüyor
     * ve ölçüm gelmezse o yön kapalı kalıyor — aşağı ve sağa kaydırma yine
     * çalışıyor.
     */
    const edgeTick = useCallback(() => {
        if (!liveState.current) return;
        const m = metrics.current;
        const d = drag.current;
        const screen = Dimensions.get('window');
        const vStep = edgeStep(
            d.pageY,
            m.rootY,
            screen.height - calendarMetrics.bottomInset - DRAG_BANNER_RESERVE,
        );
        const hStep = edgeStep(d.pageX, m.rootX + HOURS_WIDTH, screen.width);
        if (vStep !== 0) vScrollRef.current?.scrollTo({ y: Math.max(0, m.vOffset + vStep), animated: false });
        if (hStep !== 0) hScrollRef.current?.scrollTo({ x: Math.max(0, m.hOffset + hStep), animated: false });
    }, []);

    const stopLoop = useCallback(() => {
        if (loop.current) clearInterval(loop.current);
        loop.current = null;
    }, []);
    useEffect(() => stopLoop, [stopLoop]);

    const beginLift = useCallback((appointment: Appt, index: number) => {
        feedback.medium();
        pan.setValue({ x: 0, y: 0 });
        liveState.current = { appointment, index };
        targetRef.current = null;
        const m = metrics.current;
        drag.current = { dx: 0, dy: 0, pageX: Number.NaN, pageY: Number.NaN, vStart: m.vOffset, hStart: m.hOffset };
        rootRef.current?.measureInWindow((x, y) => {
            m.rootX = Number.isFinite(x) ? x : 0;
            m.rootY = Number.isFinite(y) ? y : 0;
        });
        stopLoop();
        loop.current = setInterval(edgeTick, 16);
        setLifted({ appointment, index });
        setTarget(null);
    }, [pan, edgeTick, stopLoop]);

    const dragMove = useCallback((dx: number, dy: number, pageX: number, pageY: number) => {
        if (!liveState.current) return;
        drag.current = { ...drag.current, dx, dy, pageX, pageY };
        applyDrag();
    }, [applyDrag]);

    const endDrag = useCallback(() => {
        stopLoop();
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
        inputs.current.onMove?.(current.appointment, landing);
    }, [pan, stopLoop]);

    /*
     * Kaydırıcının BİLDİRDİĞİ konum tek doğru. Blok havadaysa öteleme ve hedef
     * aynı olayda yeniden hesaplanıyor: ızgara kaydığı karede blok parmağın
     * altında kalıyor.
     */
    const onVScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        metrics.current.vOffset = event.nativeEvent.contentOffset.y;
        if (liveState.current) applyDrag();
    }, [applyDrag]);
    const onHScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        metrics.current.hOffset = event.nativeEvent.contentOffset.x;
        if (liveState.current) applyDrag();
    }, [applyDrag]);

    // Tek sütunda "veya kişiye" ve "· Deniz" yok: taşınacak kişi yok.
    const banner = lifted ? moveBanner(lifted.appointment, target, soloColumn) : null;

    return (
        // `collapsable={false}`: yeni mimari düzen amaçlı görünümü
        // düzleştirebiliyor; ölçülecek görünüm gerçekten var olmalı.
        <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
            {/**
             * Dikey kaydırma dışta: saat sütunu ve ızgara BİRLİKTE kaymalı,
             * yoksa saatler yerinde kalıp bloklarla hizası bozulur. Onbir
             * saatlik bir gün 814 pt tutuyor; ekrana sığmadığı için bu
             * sarmalayıcı olmadan günün alt kısmı büsbütün kesiliyordu.
             *
             * `automatic`: sistemin bu kaydırıcıyı birincil sayması için.
             */}
            <ScrollView
                ref={vScrollRef}
                contentInsetAdjustmentBehavior="automatic"
                showsVerticalScrollIndicator={false}
                scrollEnabled={!lifted}
                /*
                 * iOS kaydırıcısı, içindeki bir dokunuşu kaydırmaya çevirmek
                 * için İPTAL edebiliyor. Blok havadayken bu, sürüklemenin
                 * yarıda düşmesi demekti. Blok kalkınca iptal kapanıyor.
                 */
                canCancelContentTouches={!lifted}
                // Kenarda kaydırma kaydırıcının NEREDE olduğunu bilmeli.
                onScroll={onVScroll}
                scrollEventThrottle={16}
                // Blok havadayken yenileme YOK: parmak taşıma yapıyor.
                refreshControl={lifted ? undefined : refreshControl}
                /*
                 * ALTTA SEKME ÇUBUĞU KADAR PAY.
                 *
                 * Çubuk ızgaranın üstünde yüzüyor. Pay yokken en sona
                 * kaydırılmış gün bile son saatlerini çubuğun ARKASINDA
                 * bırakıyordu: 17:00 görünmüyor, oraya ne dokunulabiliyor ne
                 * randevu taşınabiliyordu. Artık son saat çubuğun üstüne çıkıyor.
                 */
                contentContainerStyle={{ flexDirection: 'row', paddingBottom: calendarMetrics.bottomInset }}
            >
                {/* Sabit saat sütunu. Başlık satırı kadar boşlukla başlar ki
                    ilk saat ilk ızgara çizgisiyle hizalansın. */}
                <View style={{ width: grid.hoursWidth, paddingLeft: grid.hoursX }}>
                    {/* Başlık satırı kadar pay; tek sütunda T1'in 22 pt'si. */}
                    <View style={{ height: headerHeight }} />
                    {hours.map((label) => (
                        <Num
                            key={label}
                            size={grid.hourText}
                            style={{
                                height: hourHeight,
                                paddingTop: grid.hourTop,
                                color: c.tx2,
                                fontFamily: font.medium,
                                fontWeight: grid.hourWeight,
                                letterSpacing: grid.hourSpacing,
                            }}
                        >
                            {label}
                        </Num>
                    ))}
                </View>

                <ScrollView
                    ref={hScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={!lifted}
                    canCancelContentTouches={!lifted}
                    onScroll={onHScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ paddingRight: columnMetrics.gridPadRight }}
                >
                    <View>
                        {/* Tek sütunda başlığın yerinde yalnız T1'in payı. */}
                        {soloColumn ? <View style={{ height: headerHeight }} /> : null}

                        {/* Sütun başlıkları: avatar + ad. Kenarlık hizmet türünü söyler.
                            Tek sütunda hiç çizilmiyor — bkz. `soloColumn`. */}
                        {soloColumn ? null : (
                        <View style={{
                            flexDirection: 'row',
                            gap: COLUMN_GAP,
                            height: columnMetrics.headerHeight,
                            paddingBottom: columnMetrics.headerBottom,
                        }}>
                            {staff.map((person) => (
                                <View key={person.id} style={{
                                    width: columnWidth,
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
                        )}

                        <View style={{ flexDirection: 'row', gap: COLUMN_GAP, height: gridHeight }}>
                            {staff.map((person, index) => (
                                <View key={person.id} style={{ width: columnWidth }}>
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
                                                height: hourHeight,
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
                                            owned={mine ? mine.has(appointment.id) : null}
                                            solo={soloColumn}
                                            onPress={() => onOpen?.(appointment)}
                                            // Tamamlanan ve iptal edilen randevu kalkmaz:
                                            // kayıt taşınmaz (randevu kartıyla aynı kural).
                                            onLift={readOnly || !isReschedulable(appointment) ? undefined : beginLift}
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
                                    columnWidth={columnWidth}
                                    hourHeight={hourHeight}
                                    solo={soloColumn}
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
                                        height: grid.nowLine,
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

/** Hedef slotun turuncu vurgusu ve "13:30 · Deniz" etiketi (tek sütunda "13:30"). */
function TargetSlot({ target, staff, dayStartMinutes, columnWidth, hourHeight, solo = false }: {
    target: MoveTarget;
    staff: readonly ColumnStaff[];
    dayStartMinutes: number;
    /** Izgaranınkiyle AYNI genişlik; tek sütunda 95 değil. */
    columnWidth: number;
    /** Izgaranınkiyle AYNI saat boyu; tek sütunda 69. */
    hourHeight: number;
    solo?: boolean;
}) {
    const { c } = useTheme();
    const index = staff.findIndex((person) => person.id === target.staffId);
    if (index < 0) return null;

    const perMinute = hourHeight / 60;
    // Tek sütunda blok 2 pt içeriden çiziliyor; vurgu da onun yerini çiziyor.
    const inset = solo ? soloColumnMetrics.blockInset : 0;
    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: index * (columnWidth + COLUMN_GAP),
                width: columnWidth,
                top: (target.startMinutes - dayStartMinutes) * perMinute + inset,
                height: (target.endMinutes - target.startMinutes) * perMinute - inset * 2,
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
                {targetLabel(target, solo)}
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
function Block({ appointment, index, top, height, pan, lifted, dimmed, owned, solo = false, onPress, onLift, onDragMove, onDragEnd, onMenu }: {
    appointment: Appt;
    index: number;
    top: number;
    height: number;
    pan: Animated.ValueXY;
    lifted: boolean;
    dimmed: boolean;
    /** `null`: sahiplik sorusu sorulmuyor (müdür). Bkz. ColumnCalendar · mine. */
    owned: boolean | null;
    /** Tek sütun (v4 · T1) — bkz. ColumnCalendar · soloColumn. */
    solo?: boolean;
    onPress: () => void;
    /** Yoksa blok kalkmaz — personel görünümü. */
    onLift?: (appointment: Appt, index: number) => void;
    /** `pageX/Y`: parmağın EKRAN konumu — kenarda kaydırma buna bakıyor. */
    onDragMove: (dx: number, dy: number, pageX: number, pageY: number) => void;
    onDragEnd: () => void;
    onMenu?: (appointment: Appt) => void;
}) {
    const { c } = useTheme();
    const detail = blockDetail(height);
    const live = isLive(appointment);
    const done = Boolean(appointment.service_ended_at) || appointment.status === 'completed';

    /*
     * TEK SÜTUN (v4 · T1). Blok 2 pt içeriden çiziliyor — art arda iki
     * randevu birbirine yapışmıyor. Kenarlık ekiptekinin yarısı koyulukta,
     * yazı sütuna göre büyük ve içerik boya göre DİZİLİYOR, çıkarılmıyor
     * (`soloBlockShape`). Ekipte (Müdür 06) hiçbir ölçü değişmiyor.
     */
    const inset = solo ? soloColumnMetrics.blockInset : 0;
    const shown = height - inset * 2;
    const shape = solo ? soloBlockShape(shown) : null;
    const skin = solo
        ? {
            border: live ? `${c.or}${soloColumnMetrics.liveBorderAlpha}` : c.bd,
            padY: shape === 'full' ? soloColumnMetrics.blockY : shape === 'tight' ? soloColumnMetrics.blockTightY : 0,
            padX: soloColumnMetrics.blockX,
            padBarX: soloColumnMetrics.blockLiveX,
            gap: shape === 'row' ? soloColumnMetrics.rowGap : shape === 'tight' ? 0 : 1,
            doneOpacity: soloColumnMetrics.doneOpacity,
            bar: soloColumnMetrics.liveBar,
            // `.cb.live::before` köşesiz; bloğun yarıçapı onu kırpıyor.
            barRadius: 0,
        }
        : {
            border: live ? `${c.or}70` : c.bd2,
            padY: columnMetrics.blockY,
            padX: columnMetrics.blockX,
            padBarX: columnMetrics.blockLiveX,
            gap: 1,
            doneOpacity: columnMetrics.doneOpacity,
            bar: columnMetrics.liveBar,
            barRadius: columnMetrics.liveBar,
        };

    /**
     * Blok İKİ şey söylüyor ve ikisi AYRI kanalda.
     *
     *   SOL ŞERİT  → bu randevu SENİN. Rengi hâli söylüyor: işlem sürüyorsa
     *                turuncu, sürmüyorsa nötr.
     *   KENARLIK   → işlem sürüyor. Herkeste, sahiplikten bağımsız; meslektaşın
     *                çalıştığını görmek salonun şeffaflığının kendisi.
     *
     * Eskiden şerit de kenarlık da yalnız `live` demekti: sahiplik hiçbir
     * kanalda yoktu. Turuncu bu üründe EYLEM demek ve meslektaşın süren
     * işlemi turuncu bir şerit çiziyordu — dokunulduğunda hiçbir şey
     * başlamayan bir eylem işareti.
     *
     * Müdür görünümünde (`owned === null`) sahiplik diye bir soru yok:
     * şerit eskisi gibi yalnız `live`de çiziliyor.
     */
    const ownership = owned !== null;
    const bar = ownership ? owned : live;
    const barColor = live ? c.or : c.tx3;
    /** Meslektaşın randevusu: okunur kalıyor ama BAŞLIK ağırlığını bırakıyor. */
    const faded = ownership && !owned;

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
        // Yakalama aşaması bir sebeple atlanırsa kabarcık aşaması da alıyor.
        onMoveShouldSetPanResponder: () => {
            if (!liftedRef.current) return false;
            dragging.current = true;
            return true;
        },
        /*
         * Blok havadayken SAHİPLİK BIRAKILMIYOR.
         *
         * Varsayılan cevap "evet"ti: kaydırıcı ya da üst bir görünüm dokunuşu
         * istediğinde blok onu veriyor, sürükleme parmak ekrandayken bitiyor ve
         * blok bırakılmış gibi düşüyordu. Müdürün "stabil çalışmıyor" dediği
         * şeyin bir parçası buydu.
         */
        onPanResponderTerminationRequest: () => !liftedRef.current,
        onPanResponderMove: (_event, gesture) => onDragMove(gesture.dx, gesture.dy, gesture.moveX, gesture.moveY),
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
                top: top + inset,
                height: shown,
                zIndex: lifted ? 8 : 1,
                opacity: dimmed ? DIM_OPACITY : 1,
                transform: lifted
                    ? [{ translateX: pan.x }, { translateY: pan.y }, { scale: LIFT_SCALE }]
                    : [],
            }}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${appointment.start_time.slice(0, 5)} · ${appointment.customer_name} · ${appointment.service}${faded ? ' · meslektaşınızın randevusu' : ''}`}
                // Sürükleme ıslak parmakla, ayakta, tek elle yapılamaz.
                // Menü her koşulda çalışan yol; erişilebilirlik eylemi olarak
                // da veriliyor.
                accessibilityActions={onMenu ? [{ name: 'longpress', label: 'Taşı ve düzenle' }] : undefined}
                onAccessibilityAction={() => onMenu?.(appointment)}
                delayLongPress={LONG_PRESS_MS}
                onLongPress={() => {
                    dragging.current = false;
                    if (!onLift) return;
                    /*
                     * Bayrak BURADA, hemen kalkıyor — bir sonraki çizimi
                     * beklemiyor. Beklerse titreşimden hemen sonra kıpırdayan
                     * parmak için blok henüz "havada" değildi: sürüklemeyi
                     * üstlenemiyor, dokunuş kaydırıcıya gidiyor ve blok
                     * düşüyordu.
                     */
                    liftedRef.current = true;
                    onLift(appointment, index);
                }}
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
                    borderColor: lifted ? c.or : skin.border,
                    paddingVertical: skin.padY,
                    paddingLeft: bar ? skin.padBarX : skin.padX,
                    paddingRight: skin.padX,
                    gap: skin.gap,
                    // `.cb.row1`: kısa randevuda saat · ad · hizmet yan yana.
                    flexDirection: shape === 'row' ? 'row' : 'column',
                    alignItems: shape === 'row' ? 'center' : undefined,
                    overflow: 'hidden',
                    opacity: done && !lifted ? skin.doneOpacity : lifted ? DRAG_OPACITY : 1,
                }}
            >
                {/* Soldaki şerit: SENİN. Turuncu olması işlemin sürdüğünü söyler. */}
                {bar ? (
                    <View style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: skin.bar,
                        borderRadius: skin.barRadius,
                        backgroundColor: barColor,
                    }} />
                ) : null}

                {shape ? <SoloBlockText appointment={appointment} shape={shape} faded={faded} /> : null}

                {!shape && (detail === 'full' || detail === 'timeAndName') ? (
                    <Num size={columnMetrics.blockTime} style={{
                        color: c.tx2,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {appointment.start_time.slice(0, 5)}
                    </Num>
                ) : null}

                {shape ? null : <Text numberOfLines={1} style={{
                    // Boyut AYNI kalıyor, yalnız ağırlık ve renk geri çekiliyor:
                    // meslektaşın günü okunur olmalı, sadece öne çıkmamalı.
                    color: faded ? c.tx2 : c.tx,
                    fontSize: columnMetrics.blockName,
                    fontFamily: faded ? font.bold : font.extraBold,
                    fontWeight: faded ? '700' : '800',
                    letterSpacing: columnMetrics.blockName * -0.03,
                }}>
                    {appointment.customer_name.split(' ')[0]}
                </Text>}

                {!shape && detail === 'full' ? (
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
 * Tek sütunun blok yazısı (v4 · T1 · `.cb span / b / em`): saat · ad ·
 * hizmet, HER boyda üçü birden. Sütun geniş; sığdırmak için yazı küçülmüyor
 * ya da çıkmıyor, dizilişi değişiyor (`soloBlockShape`).
 */
function SoloBlockText({ appointment, shape, faded }: {
    appointment: Appt;
    shape: SoloBlockShape;
    faded: boolean;
}) {
    const { c } = useTheme();
    const m = soloColumnMetrics;
    // `.cb.tight` satırı 1,15'e indiriyor; ötekilerde yazının kendi satırı.
    const line = (size: number) => (shape === 'tight' ? size * m.tightLine : undefined);
    const row = shape === 'row';
    return (
        <>
            <Num size={m.blockTime} style={{
                color: c.tx2,
                fontFamily: font.semiBold,
                fontWeight: '600',
                letterSpacing: 0,
                lineHeight: line(m.blockTime),
            }}>
                {appointment.start_time.slice(0, 5)}
            </Num>
            <Text numberOfLines={1} style={{
                color: faded ? c.tx2 : c.tx,
                fontSize: m.blockName,
                fontFamily: faded ? font.bold : font.extraBold,
                fontWeight: faded ? '700' : '800',
                letterSpacing: m.blockName * -0.02,
                lineHeight: line(m.blockName),
                flexShrink: row ? 0 : undefined,
            }}>
                {appointment.customer_name.split(' ')[0]}
            </Text>
            {/* Tek satırda sığmayan hizmet; ad ve saat hiç kırpılmıyor. */}
            <Text numberOfLines={1} style={{
                color: c.tx2,
                fontSize: m.blockService,
                fontFamily: font.medium,
                fontWeight: '500',
                lineHeight: line(m.blockService),
                flexShrink: row ? 1 : undefined,
            }}>
                {appointment.service}
            </Text>
        </>
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
