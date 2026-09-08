import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated, Linking, PanResponder, RefreshControl, ScrollView, StyleSheet,
    useWindowDimensions, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader } from '../../src/components/CalendarParts';
import { addDaysISO, nowInMinutes, toMinutes, type Appt } from '../../src/lib/calendar';
import { source } from '../../src/lib/calendarSource';
import { dialable } from '../../src/lib/phone';
import { mockSendResult, WA_CONNECTED } from '../../src/lib/mockSend';
import type { CellKey } from '../../src/lib/actionPill';
import { DayScrubber, scrubberInset } from '../../src/components/DayScrubber';
import {
    FlowDivider, FlowEnd, FlowRow, StaffStrip,
} from '../../src/components/FlowParts';
import {
    activeCountOf, applyFlowAction, applyNoshowAction, applyPillAction, applySendResult,
    applyWaitAction, DEMO_FLOW,
    bookedEvent, DEMO_TICK_MS, headline, mockDay, nextInLineId, nowLineIndex,
    sortPresence, type FlowEvent,
} from '../../src/lib/managerFlow';
import {
    DayPedalBar,
    EmptyDayAction,
    SwipeHints,
    VoidBlock,
    useVoidSwap,
} from '../../src/components/EmptyDayParts';
import {
    dayPedal,
    emptyDayCopy,
    flowEndLabel,
    pedalIsFixed,
    pedalVisible,
    plateIsPermanent,
    scrollEnabledOnDay,
    staffStripVisible,
    swipeClaims,
    swipeResult,
} from '../../src/lib/emptyDay';
import { useManagerDay } from '../../src/state/managerDay';
import { calendarMetrics, emptyDayMetrics, glow, scrubberMetrics, useTheme } from '../../src/theme';

/**
 * Müdür 03 / 04 — Bugünün akışı ve kaydırılmış hâli.
 *
 * Yerleşim dili Instagram ana ekranından SEÇEREK alıntı. Alınanlar: hikâye
 * şeridi (burada personel durumu), kronolojik akış, kenardan kenara satırlar,
 * kartın içinde eylem.
 *
 * Alınmayanlar ve nedenleri:
 *   • Sonsuz kaydırma YOK — akış günde biter, dünü görmek ayrı bir eylem.
 *   • Görsel ağırlıklı düzen YOK — Instagram'ın kartı fotoğraf, bizimki rakam.
 *   • Araya araç çubuğu, filtre satırı, sekme grubu YOK.
 *
 * Toplanma (Müdür 13): dev başlık ve personel şeridi söner, parıltı kalkar ve
 * yerlerine ASILI CAM LEVHA gelir — ekranın tepesinden başlayan, üst kenarı
 * olmayan, alt köşeleri yuvarlak bir yüzey. İçinde yalnız iki şey var: günün
 * tarihi ve gün cetveli.
 *
 * Şerit neden kayboluyor: levha 95 pt yer kaplıyor, eski kabuk 138 pt
 * kaplıyordu (52 çubuk + 86 şerit). Toplanmanın amacı ekranı geri vermek;
 * şerit kalsaydı toplanma kazanç değil kayıp olurdu. Ekibi görmek yukarı
 * çıkmakla bir dokunuş uzakta.
 *
 * Eşikler Takvim ekranıyla birebir aynı — iki ekran farklı hızda toplanırsa
 * uygulama iki ayrı ürün gibi hissettirir.
 */
export default function ManagerFlow() {
    const { c, dark, glass, small, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    const router = useRouter();
    const scrollY = useRef(new Animated.Value(0)).current;
    // Yapışkan şerit görünmezken dokunuşları YAKALAMAMALI: açık hâlde
    // başlığın üstünde duran şeffaf bir katman, dev başlığa dokunmayı
    // engellerdi. Opaklık native sürücüde, bu bayrak yalnız dokunma için.
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        const id = scrollY.addListener(({ value }) => {
            const past = value + insets.top > 48;
            setCollapsed((current) => (current === past ? current : past));
        });
        return () => scrollY.removeListener(id);
    }, [insets.top, scrollY]);

    const day = mockDay;
    /**
     * Akış olayları YEREL durumda.
     *
     * "Geldi", "Gelmedi" ve "Tahsil et" sunucuya gitmiyor — müdür ucu henüz
     * yazılmadı. Ama butonlar da ÖLÜ DEĞİL: dokununca olayın türü gerçekten
     * değişiyor, satır kendi rengini ve eylemlerini yeniden kuruyor. Sahte bir
     * "kaydedildi" mesajı YOK; değişen şey ekranda görünen şeyin ta kendisi.
     *
     * Uç yazıldığında bu state sunucudan beslenecek ve `applyFlowAction`
     * iyimser güncelleme katmanına dönüşecek.
     */
    const { events, replace, reload, tick } = useManagerDay();

    /**
     * "Geldi"ye BU OTURUMDA basılan satır. Bekleme kartı yalnız o satırda geri
     * almayı gösterir; sunucudan gelen bir bekleme satırında geri alınacak bir
     * basış yok.
     */
    const [freshId, setFreshId] = useState<string | null>(null);

    const onAction = useCallback((event: FlowEvent, label: string) => {
        // "Karşılamayı aç" bir durum değişikliği değil, bir geçiş: randevuyu
        // açar. Masaüstünde de aynı kelime aynı işi yapıyor.
        if (label === 'Karşılamayı aç') {
            if (event.appointmentId) {
                router.push({
                    pathname: '/randevu/[id]',
                    params: { id: event.appointmentId, date: mockDay.dateISO },
                });
            }
            return;
        }
        // "Yeniden randevu" da bir geçiş: düşmüş kayıt için tek yol yeni bir
        // randevu, o da kendi ekranında açılır.
        if (label === 'Yeniden randevu') {
            router.navigate({ pathname: '/mudur/create' });
            return;
        }
        // "Saati doldur" — boşalan saat randevu sekmesinde ÖN DOLU açılır.
        // Bekleme listesine ayrıca sormuyoruz: iptal, sunucuda `notify-waitlist`i
        // kendisi tetikliyor. İkinci bir düğme ikinci kez mesaj atardı.
        if (label === 'Saati doldur') {
            router.navigate({
                pathname: '/mudur/create',
                params: {
                    date: mockDay.dateISO,
                    start: String(toMinutes(event.time)),
                    staff: event.staffId ?? '',
                },
            });
            return;
        }
        const next = event.kind === 'arrived' ? applyWaitAction(event, label)
            : event.kind === 'noshow' ? applyNoshowAction(event, label)
                : applyFlowAction(event, label);
        if (!next) return;
        // Beklemeyi ya da gelmediyi BU OTURUMDA başlatan basış geri alma
        // penceresini açar; "Geri al" onu kapatır. Kalan eylemler dokunmaz.
        if (['Geldi', 'Gelmedi', 'Geç geldi', 'Tahsil et', 'Onayla'].includes(label)) setFreshId(event.id);
        else if (label === 'Geri al') setFreshId((id) => (id === event.id ? null : id));
        replace(event.id, next);
    }, [router, replace]);


    /**
     * Eylem hapından seçilen göz.
     *
     * `Ara` telefonu açar — uygulamadan çıkılır, sonucu bilinmez; kart yalnız
     * müdürün ne yaptığını yazar. `Yaz` uygulamada kalır ve 5 saniyelik
     * pencereyi açar: istek o pencere içinde HİÇ GİTMEZ.
     */
    const onPill = useCallback((event: FlowEvent, cell: CellKey) => {
        if (cell === 'waoff') {
            // Onarım gözü — ama gidilecek ekran HENÜZ YAZILMADI. Bu göz bugün
            // hiç çizilmiyor (`WA_CONNECTED` true) ve çizilmemeli: hedefi
            // olmayan bir düğme, dokunulup hiçbir şey olmayan bir noktadır.
            // Ekran yazıldığında buraya `router.navigate` gelir.
            return;
        }
        if (cell === 'ara') {
            const phone = dialable(event.customerPhone);
            if (phone) void Linking.openURL(`tel:${phone}`);
        }
        const next = applyPillAction(event, cell);
        if (!next) return;
        if (cell === 'nox') setFreshId(event.id);
        replace(event.id, next);
    }, [router, replace]);

    /**
     * Gönderim penceresi — 5 saniye geri sayar, sonra gönderir.
     *
     * SUNUCU UCU HENÜZ YOK. Müdür modunun tamamı sahte kaynak üstünde çalışıyor
     * ("Geldi" bile sunucuya gitmiyor); `Yaz` da aynı katmanda duruyor ve
     * sonucu `mockSendResult` üretiyor. Uç yazıldığında değişecek tek yer o
     * fonksiyon — pencere, damga ve beş hâlin tamamı olduğu gibi kalır.
     */
    useEffect(() => {
        const sending = events.filter((event) => (event.sendingLeft ?? 0) > 0);
        const rejecting = events.filter((event) => (event.rejectedLeft ?? 0) > 0);
        if (sending.length === 0 && rejecting.length === 0) return;
        const id = setTimeout(() => {
            for (const event of sending) {
                const left = (event.sendingLeft ?? 0) - 1;
                replace(event.id, left > 0
                    ? { ...event, sendingLeft: left }
                    : applySendResult(event, mockSendResult(event)));
            }
            // Reddetme penceresi de aynı kalıpta: dolunca randevu iptal olur.
            for (const event of rejecting) {
                const left = (event.rejectedLeft ?? 0) - 1;
                replace(event.id, left > 0
                    ? { ...event, rejectedLeft: left }
                    : { ...event, rejectedLeft: undefined, kind: 'cancelled' });
            }
        }, 1000);
        return () => clearTimeout(id);
    }, [events, replace]);

    /**
     * DEMO SAATİ — sunucu bağlanınca silinecek.
     *
     * Tasarımın iki hareketi canlı veriye bağlıydı: eşik geçişi dakikanın
     * akmasını, BEKLİYOR → SÜRÜYOR dönüşümü personelin işlemi başlatmasını
     * bekliyor. `visit.arrive` ucu yazılana kadar ikisi de cihazda hiç
     * görülemezdi; bu sayaç onları görülebilir kılıyor.
     */
    useEffect(() => {
        if (!DEMO_FLOW) return;
        const id = setInterval(tick, DEMO_TICK_MS);
        return () => clearInterval(id);
    }, [tick]);

    /**
     * Bekleyen bir satır işleme dönüştüğünde onu "taze" işaretler — canlı kart
     * o zaman dönüşerek girer. Diff burada yapılıyor çünkü `setEvents`
     * güncelleyicisi saf kalmalı: React onu iki kez çağırabilir.
     */
    const kinds = useRef(new Map(mockDay.events.map((event) => [event.id, event.kind])));
    useEffect(() => {
        for (const event of events) {
            if (kinds.current.get(event.id) === 'arrived' && event.kind === 'started') {
                setFreshId(event.id);
            }
            kinds.current.set(event.id, event.kind);
        }
    }, [events]);

    /**
     * Aşağı çekip yenileme.
     *
     * Müdür telefonu açtığında refleksle aşağı çeker; hiçbir şey olmaması
     * uygulamanın donduğu izlenimi verir. Uç yazılana kadar tek kaynağımız
     * `mockDay` — yenileme onu gerçekten yeniden okur, yani yerel dokunuşlar
     * sıfırlanır. Sahte bir bekleme animasyonu YOK.
     */
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(() => {
        setRefreshing(true);
        reload();
        setFreshId(null);
        setRefreshing(false);
    }, [reload]);

    /** ⋮ — o olayın randevusunu açar. Randevusu olmayan olayda çizilmez. */
    const openAppointment = useCallback((event: FlowEvent) => {
        if (!event.appointmentId) return;
        router.push({
            pathname: '/randevu/[id]',
            params: { id: event.appointmentId, date: mockDay.dateISO },
        });
    }, [router]);
    // Cetvelin seçtiği gün. Akış listesi BU DEĞERE BAĞLI DEĞİL: sunucuda
    // "o günün olayları" ucu yok, sahte bir gün üretmek çalışıyor izlenimi
    // verirdi. Uç yazıldığında liste buradan beslenecek.
    const [selectedISO, setSelectedISO] = useState(mockDay.dateISO);
    const people = useMemo(() => sortPresence(day.presence), [day.presence]);

    /**
     * Cetvel gerçekten GÜN DEĞİŞTİRİR.
     *
     * Önce seçim yalnız cetvelin içinde kalıyordu: başka bir güne dokunuyordun,
     * başlık da liste de bugünü göstermeye devam ediyordu. Dokunup hiçbir şey
     * olmayan bir kontrol, olmayan bir kontrolden kötüdür.
     *
     * Elimizde tek gün var; başka güne geçince liste boş çıkar ve bunu dürüst
     * bir cümleyle söyler. Uç yazıldığında yalnız bu filtre sunucuya döner.
     */
    const isToday = selectedISO === mockDay.dateISO;

    /**
     * Başka günün randevuları.
     *
     * Bugünün akışı canlı olay akışıdır (geldi, başladı, tahsilat); başka
     * günün akışı ise o günün RANDEVULARIdır — henüz yaşanmamış ya da artık
     * yaşanmış bir gün için "şu an" diye bir şey yok.
     *
     * Kaynak zaten güne göre sorgulanabiliyordu; ekran sormuyordu. Randevu
     * kurulduğunda takvimde görünüp akışta görünmemesinin sebebi buydu.
     */
    const [otherDay, setOtherDay] = useState<Appt[]>([]);
    const loadOtherDay = useCallback(() => {
        if (isToday) { setOtherDay([]); return undefined; }
        let alive = true;
        void source.day(selectedISO).then((list) => {
            if (alive) setOtherDay(list);
        });
        return () => { alive = false; };
    }, [isToday, selectedISO]);

    // Randevu kurup geri dönünce o günün listesi yeniden okunur; yoksa yeni
    // randevu takvimde görünüp akışta görünmezdi.
    useFocusEffect(loadOtherDay);

    const dayEvents = useMemo(() => {
        if (isToday) return events;
        return otherDay
            .filter((appointment) => appointment.status !== 'cancelled')
            .map((appointment) => bookedEvent(
                appointment,
                day.presence.find((person) => person.id === appointment.staff_id)?.name,
            ));
    }, [isToday, events, otherDay, day.presence]);

    // Şerit ve özet ŞU ANIN gerçeği — başka bir gün seçiliyken anlamsızlar.
    // Bugünün cirosunu "14 Ağustos" başlığı altında göstermek yalan olurdu.
    const weekday = new Date(`${selectedISO}T00:00:00Z`)
        .toLocaleDateString('tr-TR', { weekday: 'long', timeZone: 'UTC' });
    // "Kaç işlem sürüyor" ŞERİTTEN türer, ayrı tutulmaz.
    const subtitle = isToday
        ? headline(weekday, day.appointmentCount, activeCountOf(people))
        : weekday;
    /**
     * Müdür 22 — boş gün.
     *
     * Boş günde levha KALICI olur (dev başlığın taşıyacağı bir şey yok),
     * düşey kaydırma kapanır (kaydırılacak içerik yok, lastik bant sahte bir
     * hareket üretmesin) ve gezinme başparmak bölgesine iner.
     *
     * Tek istisna bugün: bugün boş olsa da başlık ve şerit doğruyu söylüyor,
     * orada levha yine kaydırmaya bağlı kalır.
     */
    /*
     * "Sıradaki" bir SIRA İDDİASIDIR ve tekildir. Kararı EKRAN verir: bir
     * satır tek başına ötekilere bakıp "ben sıradayım" diyemez, o yüzden
     * kimlik burada hesaplanıp aşağı iniyor.
     */
    const inLineId = useMemo(() => nextInLineId(dayEvents), [dayEvents]);


    const isEmptyDay = dayEvents.length === 0;
    const platePermanent = plateIsPermanent(isEmptyDay, isToday);
    const canScroll = scrollEnabledOnDay(isEmptyDay, isToday);
    const blank = emptyDayCopy(selectedISO, mockDay.dateISO);
    const pedal = dayPedal(selectedISO, mockDay.dateISO);

    // Gün değişiminin YÖNÜ: cümle bu yöne doğru takas edilir.
    const [slideDir, setSlideDir] = useState(0);
    const goToDay = useCallback((iso: string) => {
        setSlideDir(iso > selectedISO ? 1 : iso < selectedISO ? -1 : 0);
        setSelectedISO(iso);
    }, [selectedISO]);

    const shiftDay = useCallback((step: -1 | 1) => {
        goToDay(addDaysISO(selectedISO, step));
    }, [goToDay, selectedISO]);

    /**
     * Yatay kaydırma — üçüncü çıkış ve YALNIZ hızlandırıcı.
     *
     * `react-native-gesture-handler` projede yok; jest RN'in kendi
     * `PanResponder`'ıyla kurulur. Eşik yüksek: yanılma payı yüksek bir jestin
     * tek çıkış olması kabul edilemezdi — o yüzden pedal var.
     */
    const voidSwap = useVoidSwap(selectedISO, slideDir, reduceMotion);

    // Saat rayındaki "şu an" — dakikada bir tazelenir, saniye saymaz.
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        const timer = setInterval(() => setNowMinutes(nowInMinutes()), 60_000);
        return () => clearInterval(timer);
    }, []);

    /*
     * AÇILIŞ ŞİMDİ-ÇİZGİSİNDE.
     *
     * Akış artan sıralı: geçmiş yukarıda, gelecek aşağıda. Tepeden açılsaydı
     * müdür sabahın ilk randevusunu görürdü; oysa telefonu açma sebebi ŞU AN.
     *
     * Çizgi ekranın üstüne değil, ALT ÜÇTE BİRİNE oturuyor: "şu an"ın kendisi
     * biraz geçmişte yaşıyor — bekleyen müşteri, geciken randevu, kasada
     * duran adisyon hep birkaç dakika önce başladı. Çizgiyi tepeye koysaydık
     * ekran boş bir geleceği gösterip olan biteni katlardı.
     */
    const scroller = useRef<ScrollView>(null);
    const rowTop = useRef(new Map<string, number>());
    const viewport = useRef(0);
    const jumped = useRef(false);

    // Gün değişince atlama hakkı yenilenir: bugüne dönünce yine şimdiye gider.
    useEffect(() => { jumped.current = false; }, [selectedISO]);

    const jumpToNow = useCallback(() => {
        if (jumped.current || !isToday || viewport.current === 0) return;
        const index = nowLineIndex(dayEvents, nowMinutes);
        // Hepsi geçmişteyse hedef son satır: akşam, gelecek satır kalmamıştır.
        const target = dayEvents[Math.min(index, dayEvents.length - 1)];
        if (!target) return;
        const top = rowTop.current.get(target.id);
        if (top == null) return;
        jumped.current = true;
        scroller.current?.scrollTo({
            // `contentInsetAdjustmentBehavior="automatic"` yüzünden en üst
            // konum 0 değil `-insets.top`; taban da o.
            y: Math.max(-insets.top, top - viewport.current * 0.66 - insets.top),
            animated: false,
        });
    }, [dayEvents, insets.top, isToday, nowMinutes]);

    /**
     * Başparmak bölgesinin yüksekliği. Pedal ALTTAN hizalı, birincil eylem
     * onun üstüne eklenir: böylece eylemi olan ve olmayan gün arasında pedal
     * hiç kıpırdamaz.
     */
    const emptyFootHeight = calendarMetrics.bottomInset
        + emptyDayMetrics.pedalHeight
        + emptyDayMetrics.actionGap * 2
        + (blank.action ? emptyDayMetrics.actionHeight + emptyDayMetrics.actionGap : 0);

    const swipe = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => canScroll === false && swipeClaims(g.dx, g.dy),
        onPanResponderRelease: (_e, g) => {
            const step = swipeResult(g.dx, g.vx);
            if (step !== 0) shiftDay(step);
        },
    }), [canScroll, shiftDay]);

    /**
     * `contentInsetAdjustmentBehavior="automatic"` verildiğinde iOS güvenli
     * alanı kendi ekliyor ve `contentOffset` `-insets.top`'tan başlıyor. Bu
     * ayar, sistemin bu kaydırma görünümünü BİRİNCİL sayması ve tab bar'ı ona
     * göre daraltması için gerekli.
     *
     * `scrolled` o kaymayı geri alıyor: eşikler (0 · 24 · 32 · 48 · 64) Takvim
     * ekranıyla birebir aynı kalıyor. İki ekran farklı hızda toplanırsa
     * uygulama iki ayrı ürün gibi hissettirir.
     */
    const scrolled = Animated.add(scrollY, insets.top);

    const expandedOpacity = scrolled.interpolate({
        inputRange: [0, 48], outputRange: [1, 0], extrapolate: 'clamp',
    });
    const compactOpacity = scrolled.interpolate({
        inputRange: [32, 64], outputRange: [0, 1], extrapolate: 'clamp',
    });
    const compactTranslateY = scrolled.interpolate({
        inputRange: [32, 64], outputRange: [6, 0], extrapolate: 'clamp',
    });
    const compactChromeOpacity = scrolled.interpolate({
        inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp',
    });
    const glowOpacity = scrolled.interpolate({
        inputRange: [0, 64], outputRange: [1, 0], extrapolate: 'clamp',
    });
    // Personel şeridi kendi eşiğinde söner: levha belirmeden önce çekilir.
    const stripOpacity = scrolled.interpolate({
        inputRange: [0, 40], outputRange: [1, 0], extrapolate: 'clamp',
    });

    // Levhanın ölçüleri ekran genişliğinden türer; gün adımı ve çentik
    // aralığı da onun içinde türetilir.
    const panelWidth = screenWidth - scrubberMetrics.sideMargin * 2;
    const topGap = small ? scrubberMetrics.topGapSmall : scrubberMetrics.topGap;
    const panelInset = scrubberInset(small);

    // Şeritten avatara dokununca o personelin günü açılır (Müdür 05).
    const openStaff = (staffId: string) => router.push(`/personel/${staffId}`);

    /**
     * Akıştaki müşteri balonu → Müdür 23 müşteri kartı.
     *
     * Kimlik VE ad birlikte gider: kimlik doğru kaydı seçer, ad kayıt
     * bulunamazsa ekranın ne arandığını söyleyebilmesi için.
     */
    const openCustomer = (event: FlowEvent) => {
        if (!event.customerId) return;
        router.push({
            pathname: '/(staff-flow)/customer',
            params: {
                customerId: event.customerId,
                customerName: `${event.firstName} ${event.lastName}`,
            },
        });
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <Animated.ScrollView
                ref={scroller}
                onLayout={(e) => {
                    viewport.current = e.nativeEvent.layout.height;
                    jumpToNow();
                }}
                collapsable={false}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true },
                )}
                // Sistemin bu kaydırıcıyı birincil sayması için: güvenli alanı
                // iOS ekliyor, biz elle doldurmuyoruz. Tab bar'ın daralması
                // buna bağlı.
                refreshControl={(
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={c.tx2}
                        progressViewOffset={panelInset}
                    />
                )}
                contentInsetAdjustmentBehavior="automatic"
                // Boş günde kaydırılacak bir şey yok; lastik bant sahte bir
                // hareket üretmesin.
                scrollEnabled={canScroll}
                contentContainerStyle={{
                    /*
                     * Levha kalıcıyken içerik ONUN ALTINDAN başlar. Kaydırmaya
                     * bağlı levhada içerik altından geçer (o zaten geçici bir
                     * örtü); kalıcı levhada geçseydi ilk satırın saati ve
                     * etiketi sürekli örtülü kalırdı.
                     */
                    paddingTop: platePermanent ? panelInset + insets.top : 0,
                    paddingBottom: isEmptyDay ? emptyFootHeight : calendarMetrics.bottomInset,
                    flexGrow: isEmptyDay ? 1 : undefined,
                }}
                style={{ flex: 1 }}
                {...(isEmptyDay ? swipe.panHandlers : null)}
            >
                {/**
                 * Uygulamanın TEK gradyanı — ve KAYDIRICININ İÇİNDE.
                 *
                 * Ekranın kökünde, kaydırıcıdan ÖNCE duruyordu. iOS 26'da
                 * sekme çubuğunun kaydırınca küçülmesi (`minimizeBehavior`)
                 * UIKit'in kaydırıcıyı ilk-alt-görünüm zincirini yürüyerek
                 * bulmasına bağlı; zincirin başında gradyan olduğu sürece
                 * kaydırıcı hiç bulunamıyor ve bar hiç küçülmüyordu
                 * (react-native-screens#4145).
                 *
                 * İçeri alındı, ama EKRANDA SABİT KALIYOR: `translateY`
                 * kaydırma miktarını geri veriyor, yani gradyan içerikle
                 * birlikte yukarı kaymıyor. Görünüş birebir eskisi gibi;
                 * değişen tek şey görünümlerin sırası.
                 */}
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        // Kalıcı levhada içerik aşağıdan başlıyor; gradyan
                        // yine sayfanın en üstünden başlamalı.
                        top: platePermanent ? -(panelInset + insets.top) : 0,
                        // Boş günde kaydırma olmadığı için gradyan HİÇ sönmez
                        // ve yüksekliği sabitlenir: cümle gradyanın son
                        // diliminde, düz zemine oturur.
                        height: isEmptyDay
                            ? (isToday ? emptyDayMetrics.glowHeightToday : emptyDayMetrics.glowHeight) + insets.top
                            : glow.height + insets.top,
                        opacity: isEmptyDay ? 1 : glowOpacity,
                        transform: [{ translateY: scrollY }],
                    }}
                >
                    <LinearGradient
                        colors={dark ? glow.dark : glow.light}
                        locations={glow.locations}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>

                {/* Dev başlık YALNIZ bugün: başka günde söyleyebileceği tek
                    şey gün adı, kimliği levha taşıyor. */}
                {platePermanent ? null : (
                    <Animated.View style={{ opacity: expandedOpacity }}>
                        <DayHeader dateISO={selectedISO} subtitle={subtitle} transparent />
                    </Animated.View>
                )}

                {/* Şerit kendi eşiğiyle söner (0–40) ve toplanmış hâlde
                    kaybolur; levhanın altına yapışkan bir kopya çizilmez. */}
                {staffStripVisible(isToday) ? (
                    <Animated.View style={{ opacity: stripOpacity }}>
                        <StaffStrip people={people} onOpen={openStaff} />
                    </Animated.View>
                ) : null}

                {isEmptyDay ? (
                    <View style={{
                        flex: 1,
                        justifyContent: 'center',
                        paddingTop: platePermanent
                            ? emptyDayMetrics.topFromPlate
                            : emptyDayMetrics.topFromStrip,
                    }}>
                        <VoidBlock
                            copy={blank}
                            isToday={isToday}
                            nowMinutes={nowMinutes}
                            entering={voidSwap}
                        />
                    </View>
                ) : null}

                {dayEvents.map((event, index) => (
                    <View
                        key={event.id}
                        onLayout={(e) => {
                            rowTop.current.set(event.id, e.nativeEvent.layout.y);
                            jumpToNow();
                        }}
                    >
                        {index > 0 ? <FlowDivider /> : null}
                        <FlowRow
                            event={index === 0 ? { ...event, firstInList: true } : event}
                            presence={people}
                            fresh={event.id === freshId}
                            inLine={event.id === inLineId}
                            onAction={(label) => onAction(event, label)}
                            onPill={(cell) => onPill(event, cell)}
                            waConnected={WA_CONNECTED}
                            onMore={event.appointmentId ? openAppointment : undefined}
                            onOpenCustomer={openCustomer}
                        />
                    </View>
                ))}

                {dayEvents.length > 0 ? <FlowEnd label={flowEndLabel(isToday)} /> : null}

                {/* Dolu günde pedal listenin ALTINDA, sayfayla birlikte kayar.
                    Gezinme boş hâlin özel öğesi değil — bir yerde öğrenilen
                    şey her yerde bulunur. */}
                {pedalVisible(isEmptyDay, isToday) && !pedalIsFixed(isEmptyDay) ? (
                    <View style={{ paddingTop: emptyDayMetrics.actionGap * 2 }}>
                        <DayPedalBar pedal={pedal} onGo={goToDay} />
                    </View>
                ) : null}
            </Animated.ScrollView>

            {/* Jest okları — jesti öğretir, dokunulamaz. Yalnız boş ekranda:
                dolu günde düşey kaydırma var, çakışır. */}
            {isEmptyDay ? <SwipeHints /> : null}

            {/**
             * Başparmak bölgesi. Cetvel tepede duruyor; 393 × 852'de ekranın
             * üst 150 pt'si tek elle ulaşılmaz, o yüzden gezinme buraya iner.
             *
             * Pedal ALTTAN hizalı ve her boş günde AYNI y'de durur; birincil
             * eylem onun üstüne eklenir. Geçmiş günde eylem satırı silinmez,
             * HİÇ render edilmez — yerine boşluk da bırakılmaz.
             */}
            {pedalIsFixed(isEmptyDay) ? (
                <View
                    pointerEvents="box-none"
                    style={{
                        position: 'absolute',
                        left: emptyDayMetrics.padX,
                        right: emptyDayMetrics.padX,
                        bottom: calendarMetrics.bottomInset,
                        gap: emptyDayMetrics.actionGap,
                        zIndex: 2,
                    }}
                >
                    {blank.action ? (
                        <EmptyDayAction
                            label={blank.action}
                            onPress={() => router.navigate({
                                pathname: '/mudur/create',
                                params: { date: selectedISO },
                            })}
                        />
                    ) : null}
                    <DayPedalBar pedal={pedal} onGo={goToDay} />
                </View>
            ) : null}

            {/**
             * Müdür 13 — asılı cam levha.
             *
             * KAPALI BİR HAP DEĞİL: ekranın tepesinden başlıyor, üst kenarı ve
             * üst köşeleri yok, durum çubuğu içinde kalıyor. Bu yüzden güvenli
             * alanı yeniden örtüyor — içeriğin altından geçmesi sorun değil,
             * okunabilirlik geometriden değil malzemeden geliyor.
             *
             * Personel şeridi toplanınca KAYBOLUYOR; ekranda yalnız levha
             * kalıyor. Şeridi görmek için yukarı çıkılır.
             */}
            <Animated.View
                style={{
                    position: 'absolute',
                    zIndex: 29,
                    top: 0,
                    left: scrubberMetrics.sideMargin,
                    right: scrubberMetrics.sideMargin,
                    height: insets.top + panelInset,
                    borderBottomLeftRadius: scrubberMetrics.bottomRadius,
                    borderBottomRightRadius: scrubberMetrics.bottomRadius,
                    // Çentikler ve dikey çizgiler alt kenarda biter; hiçbir
                    // şey levhanın dışına taşmaz.
                    overflow: 'hidden',
                    // Levhanın kuralı İÇERİĞE bağlı, kaydırmaya değil:
                    // boş günde dev başlığın taşıyacağı bir şey yok, levha
                    // doğrudan gelir ve gitmez.
                    opacity: platePermanent ? 1 : compactOpacity,
                    transform: [{ translateY: platePermanent ? 0 : compactTranslateY }],
                }}
                pointerEvents={platePermanent || collapsed ? 'auto' : 'none'}
            >
                {/**
                  * BUZLU CAM — üç katman (Müdür 19 · 01).
                  *
                  * `expo-glass-effect` DEĞİL: o iOS 26 istiyor ve altındaki
                  * sürümlerde opak yüzeye düşüyordu; levha siyah bir blok gibi
                  * duruyor, altından geçen özet satırı ortadan biçiliyordu.
                  * Referanstaki efekt zaten Liquid Glass değil — kenarda ışık
                  * kırılması ve mercek etkisi yok. Klasik buzlu cam, yani
                  * `UIVisualEffectView`; Expo karşılığı `expo-blur`.
                  *
                  *   1. bulanıklık — arkadaki içeriğin rengi ve kütlesi kalır
                  *   2. ton örtüsü — okunurluk BURADAN gelir, yoğunluktan değil
                  *   3. kenar      — levhanın nerede bittiğini söyler (aşağıda)
                  *
                  * "Saydamlığı azalt" açıkken bulanıklık düşer; örtü tek başına
                  * okunurluğu taşır, o yüzden opak yedeğe gerek yok.
                  */}
                {glass ? (
                    <BlurView
                        tint={dark ? 'dark' : 'light'}
                        intensity={scrubberMetrics.blurIntensity}
                        style={StyleSheet.absoluteFill}
                    />
                ) : null}
                <View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, {
                        backgroundColor: glass
                            ? (dark ? scrubberMetrics.toneDark : scrubberMetrics.toneLight)
                            : c.surf,
                    }]}
                />
                {/* Kenarlık ayrı katmanda: üst kenar YOK, yalnız yanlar ve
                    alt. Dokunuşları yakalamamalı — altındaki cetvel çalışsın. */}
                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        {
                            borderBottomLeftRadius: scrubberMetrics.bottomRadius,
                            borderBottomRightRadius: scrubberMetrics.bottomRadius,
                            borderWidth: 1,
                            borderTopWidth: 0,
                            borderColor: dark ? scrubberMetrics.edgeDark : scrubberMetrics.edgeLight,
                        },
                    ]}
                />

                <View style={{ flex: 1, paddingTop: insets.top + topGap }}>
                    <DayScrubber
                        selectedISO={selectedISO}
                        todayISO={day.dateISO}
                        width={panelWidth}
                        // Cetvel ŞİMDİLİK yalnız görünüş: seçili gün değişiyor
                        // ama akış listesi aynı kalıyor. Sunucuda "o günün
                        // olayları" diye bir uç yok; sahte bir gün üretmek
                        // çalışıyor izlenimi verirdi.
                        onSelect={setSelectedISO}
                    />
                </View>
            </Animated.View>
        </View>
    );
}
