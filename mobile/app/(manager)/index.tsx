import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader } from '../../src/components/CalendarParts';
import { formatDayLong } from '../../src/lib/calendar';
import { DayScrubber, scrubberInset } from '../../src/components/DayScrubber';
import {
    FlowDivider, FlowEmpty, FlowEnd, FlowRow, StaffStrip,
} from '../../src/components/FlowParts';
import {
    activeCountOf, applyFlowAction, applyNoshowAction, applyWaitAction, DEMO_FLOW,
    DEMO_TICK_MS, emptyFlow, FLOW_END, headline, mockDay,
    sortPresence, type FlowEvent,
} from '../../src/lib/managerFlow';
import { useManagerDay } from '../../src/state/managerDay';
import { calendarMetrics, glow, scrubberMetrics, useTheme } from '../../src/theme';

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
    const { c, dark, glass, small } = useTheme();
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
            router.push({ pathname: '/(manager-flow)/randevu-olustur' });
            return;
        }
        const next = event.kind === 'arrived' ? applyWaitAction(event, label)
            : event.kind === 'noshow' ? applyNoshowAction(event, label)
                : applyFlowAction(event, label);
        if (!next) return;
        // Beklemeyi ya da gelmediyi BU OTURUMDA başlatan basış geri alma
        // penceresini açar; "Geri al" onu kapatır. Kalan eylemler dokunmaz.
        if (['Geldi', 'Gelmedi', 'Geç geldi', 'Tahsil et'].includes(label)) setFreshId(event.id);
        else if (label === 'Geri al') setFreshId((id) => (id === event.id ? null : id));
        replace(event.id, next);
    }, [router, replace]);

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
    const dayEvents = isToday ? events : [];

    // Şerit ve özet ŞU ANIN gerçeği — başka bir gün seçiliyken anlamsızlar.
    // Bugünün cirosunu "14 Ağustos" başlığı altında göstermek yalan olurdu.
    const weekday = new Date(`${selectedISO}T00:00:00Z`)
        .toLocaleDateString('tr-TR', { weekday: 'long', timeZone: 'UTC' });
    // "Kaç işlem sürüyor" ŞERİTTEN türer, ayrı tutulmaz.
    const subtitle = isToday
        ? headline(weekday, day.appointmentCount, activeCountOf(people))
        : weekday;
    const blank = emptyFlow(isToday, formatDayLong(selectedISO));

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

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Uygulamanın TEK gradyanı; kaydırınca söner. */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { height: glow.height + insets.top, zIndex: 0, opacity: glowOpacity },
                ]}
            >
                <LinearGradient
                    colors={dark ? glow.dark : glow.light}
                    locations={glow.locations}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            <Animated.ScrollView
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
                contentContainerStyle={{ paddingBottom: calendarMetrics.bottomInset }}
                style={{ flex: 1, zIndex: 1 }}
            >
                <Animated.View style={{ opacity: expandedOpacity }}>
                    <DayHeader dateISO={selectedISO} subtitle={subtitle} transparent />
                </Animated.View>

                {/* Şerit kendi eşiğiyle söner (0–40) ve toplanmış hâlde
                    kaybolur; levhanın altına yapışkan bir kopya çizilmez. */}
                {isToday ? (
                    <Animated.View style={{ opacity: stripOpacity }}>
                        <StaffStrip people={people} onOpen={openStaff} />
                    </Animated.View>
                ) : null}

                {dayEvents.length === 0 ? (
                    <FlowEmpty
                        label={blank.label}
                        hint={blank.hint}
                        // Boş günde cetvel görünmüyor (levha kaydırınca geliyor,
                        // kaydıracak içerik yok): çıkış kartın kendisinde.
                        action={isToday ? undefined : 'Bugüne dön'}
                        onAction={() => setSelectedISO(mockDay.dateISO)}
                    />
                ) : null}

                {dayEvents.map((event, index) => (
                    <Fragment key={event.id}>
                        {index > 0 ? <FlowDivider /> : null}
                        <FlowRow
                            event={event}
                            presence={people}
                            fresh={event.id === freshId}
                            onAction={(label) => onAction(event, label)}
                            onMore={event.appointmentId ? openAppointment : undefined}
                        />
                    </Fragment>
                ))}

                {dayEvents.length > 0 ? <FlowEnd label={FLOW_END} /> : null}
            </Animated.ScrollView>

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
                    opacity: compactOpacity,
                    transform: [{ translateY: compactTranslateY }],
                }}
                pointerEvents={collapsed ? 'auto' : 'none'}
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
