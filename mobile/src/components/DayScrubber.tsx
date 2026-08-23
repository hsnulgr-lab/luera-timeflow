import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FlatList, Pressable, StyleSheet, Text, View,
    type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { feedback } from '../lib/feedback';
import {
    boundsFor, crossedMonth, dateAt, indexFromOffset, indexOf, offsetForIndex,
    majorTickOffset, railCell, smallTickOffsets, stepFor,
    type TickKind,
} from '../lib/dayScrubber';
import { addDaysISO } from '../lib/calendar';
import { numeric, scrubberMetrics, useTheme } from '../theme';

/**
 * Müdür 13 — toplanmış çubuğun gün cetveli.
 *
 * Levha ekranın tepesinden başlar ve durum çubuğunu içine alır; bu yüzden
 * içerik camın ardından geçebiliyor ve ayrıca bir ölü banda gerek kalmıyor.
 *
 * BÜTÜN ÖLÇÜLER TÜRETİLİR. Gün adımı pencere genişliğinin yedide biri, çentik
 * aralığı da gün adımının onda biri. Sabit pt yazılsaydı panel genişliği
 * değişince gün merkezi çentiği rakamın altından kayardı.
 */
export function DayScrubber({ selectedISO, todayISO, width, onSelect }: {
    selectedISO: string;
    todayISO: string;
    /** Ray penceresinin genişliği — levhanın kendi genişliği. */
    width: number;
    onSelect: (dateISO: string) => void;
}) {
    const { small } = useTheme();
    const listRef = useRef<FlatList<string>>(null);
    const padX = small ? scrubberMetrics.padXSmall : scrubberMetrics.padX;
    /**
     * Gün adımı: `(levha genişliği − 2 × yan boşluk) / 7`.
     * Yan boşluk rakam dizisine ait; çentik bandı kenardan kenara gider.
     */
    const step = stepFor(width - padX * 2);

    const bounds = useMemo(() => boundsFor(todayISO), [todayISO]);
    const days = useMemo(() => {
        const total = indexOf(bounds.lastISO, bounds) + 1;
        return Array.from({ length: total }, (_, index) => addDaysISO(bounds.firstISO, index));
    }, [bounds]);

    /**
     * Ortada duran gün — HAPIN yeri.
     *
     * Kaydırma sırasında ebeveyne HABER VERİLMEZ. Önceden her kaydırma
     * karesinde `onSelect` çağrılıyordu; ebeveynin durumu değişiyor, bu bileşen
     * baştan çizilliyor ve `initialScrollIndex` yeni bir değer alıyordu.
     * FlatList o sırada kendi konumunu yeniden uyguluyor, kullanıcının parmağı
     * hâlâ ekrandayken liste bir sağa bir sola zıplıyordu.
     *
     * Artık iş bölümü net: kaydırırken YEREL durum (hap ve titreşim), parmak
     * kalkıp liste oturunca EBEVEYNE bildirim.
     */
    const [centered, setCentered] = useState(selectedISO);
    /** Son oturan gün: titreşim gün DEĞİŞTİĞİNDE atılır, her karede değil. */
    const settled = useRef(selectedISO);

    /**
     * Başlangıç konumu MONTAJDA donar.
     *
     * `initialScrollIndex` her çizimde yeniden hesaplanırsa FlatList onu prop
     * değişikliği sanıp listeyi yeniden konumlandırıyor. Kaydırmanın ortasında
     * bu, geri sıçrama olarak görünüyordu.
     */
    const initialIndex = useRef(indexOf(selectedISO, bounds)).current;

    /**
     * Programatik hareketin HEDEFİ.
     *
     * Rakama dokunduğunda hap anında oraya taşınıyor, ama listenin animasyonu
     * ESKİ konumdan başlıyor. Araya giren ilk `onScroll` karesi hapı eski güne
     * geri çekiyor, animasyon da onu tekrar yeni güne yürütüyordu: tek bir
     * dokunuşta gidip-gelen bir seçim.
     *
     * Hedef doluyken `onScroll` karışmıyor; ray hedefe varınca kendi kendini
     * temizliyor. Zaman aşımına gerek yok — ne kadar sürerse sürsün doğru
     * anda biter, ve kullanıcı parmağını değdirdiği an zaten iptal olur.
     */
    const jumpTarget = useRef<string | null>(null);

    const scrollToDay = useCallback((dateISO: string, animated: boolean) => {
        jumpTarget.current = animated ? dateISO : null;
        listRef.current?.scrollToOffset({
            offset: offsetForIndex(indexOf(dateISO, bounds), step),
            animated,
        });
    }, [bounds, step]);

    const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const index = indexFromOffset(event.nativeEvent.contentOffset.x, step, bounds);
        const next = dateAt(index, bounds);
        // Programatik hareket yolda: hedef zaten belli, aradan geçen günler
        // seçim değil. Varınca bayrak düşer ve ray tekrar kullanıcınındır.
        if (jumpTarget.current) {
            if (next === jumpTarget.current) jumpTarget.current = null;
            return;
        }
        if (next === settled.current) return;
        // Ay sınırında daha yumuşak ve tek seferlik bir titreşim; gün
        // oturmasının titreşimiyle karışmasın.
        if (crossedMonth(settled.current, next)) feedback.light();
        else feedback.selection();
        settled.current = next;
        setCentered(next);
    }, [step, bounds]);

    /** Liste durdu: seçimi ŞİMDİ ebeveyne bildir. */
    const commit = useCallback(() => {
        jumpTarget.current = null;
        if (settled.current === selectedISO) return;
        onSelect(settled.current);
    }, [onSelect, selectedISO]);

    const jumpTo = useCallback((dateISO: string) => {
        if (dateISO === settled.current) return;
        // Dokunuşun kendi tepkisi. Aradan geçen günler için titreşim ATILMAZ:
        // bir dokunuş, bir cevap.
        feedback.selection();
        settled.current = dateISO;
        setCentered(dateISO);
        scrollToDay(dateISO, true);
        onSelect(dateISO);
    }, [scrollToDay, onSelect]);

    /**
     * Seçim DIŞARIDAN değişti (derin bağlantı, bildirim, bugüne dön). Ray o
     * güne kayar. Kaydırmanın kendi ürettiği değişiklikte `settled` zaten
     * eşit olduğu için burası çalışmaz — döngü kurulmaz.
     */
    useEffect(() => {
        if (selectedISO === settled.current) return;
        settled.current = selectedISO;
        setCentered(selectedISO);
        scrollToDay(selectedISO, true);
    }, [selectedISO, scrollToDay]);

    /**
     * Hücre NESNE DEĞİL, ilkel değerlerle çiziliyor.
     *
     * `railCell` her çizimde yeni bir nesne üretiyor; `memo` referans
     * karşılaştırdığı için hiçbir hücre önbelleğe girmiyordu ve her kaydırma
     * karesinde ekrandaki dokuz gün birden yeniden çiziliyordu. İlkel
     * değerlerle yalnız DEĞİŞEN iki hücre (eski seçili, yeni seçili) çizilir.
     */
    const numberRow = small ? scrubberMetrics.numberRowSmall : scrubberMetrics.numberRow;
    const railHeight = small ? scrubberMetrics.railHeightSmall : scrubberMetrics.railHeight;
    /** Ray levhanın yan boşluğunu aşar; kırpmayı alt köşe yarıçapı yapar. */
    const railWidth = width + padX * 2;

    const renderDay = useCallback(({ item }: { item: string }) => {
        const cell = railCell(item, centered, todayISO, bounds);
        return (
            <RailDay
                dateISO={cell.dateISO}
                label={cell.label}
                selected={cell.selected}
                today={cell.today}
                centerTick={cell.centerTick}
                step={step}
                numberRow={numberRow}
                onPress={jumpTo}
            />
        );
    }, [centered, todayISO, bounds, step, numberRow, jumpTo]);

    return (
        <>
            {/* Ray levhanın yan boşluğunu YOK SAYAR: kenarlarda gün yarım
                kırpılır ve rayın devam ettiği görünür. Kırpmayı levhanın alt
                köşe yarıçapı yapıyor. */}
            <View style={{ height: railHeight, marginHorizontal: -padX }}>
                <FlatList
                    ref={listRef}
                    data={days}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item}
                    initialScrollIndex={initialIndex}
                    getItemLayout={(_data, index) => ({
                        length: step,
                        offset: offsetForIndex(index, step),
                        index,
                    })}
                    // Ara konum yok: ray bir kadran gibi güne oturur.
                    //
                    // `disableIntervalMomentum` KALDIRILDI. Hızlı bir savuruşta
                    // bile listeyi tek güne kilitliyordu; el bir hafta ötesine
                    // atmak isterken ray bir gün gidip duruyor, sonra sürtünme
                    // onu geri çekiyordu. Hareket sözleşmesi de yalnız
                    // `snapToInterval` + `decelerationRate` yazıyor.
                    snapToInterval={step}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    scrollEventThrottle={16}
                    onScroll={onScroll}
                    onMomentumScrollEnd={commit}
                    onScrollEndDrag={commit}
                    // Parmak değdi: programatik hareket ne durumda olursa olsun
                    // iptal. Ray her koşulda kullanıcıya geri döner.
                    onScrollBeginDrag={() => { jumpTarget.current = null; }}
                    // Seçili gün ORTADA durur; iki yandaki boşluk onu ortalıyor.
                    contentContainerStyle={{ paddingHorizontal: (railWidth - step) / 2 }}
                    renderItem={renderDay}
                />
            </View>
        </>
    );
}

/**
 * Bir gün hücresi: rakam · çentikler · (seçiliyse hap ve dikey çizgi) ·
 * (bugünse turuncu nokta ve çizgisi).
 *
 * Çentikler TEK `Svg` ile çiziliyor — hücre başına on ayrı `View` açmak
 * listeyi gereksiz yere ağırlaştırırdı.
 */
/**
 * Turuncu iki temada da aynı: #FF5A1F. Levhanın zemini camdan geliyor, sayfa
 * paletinden değil — bu yüzden vurgu da tema jetonu üzerinden okunmuyor.
 */
const ACCENT = '#FF5A1F';

const RailDay = memo(function RailDay({
    dateISO, label, selected, today, centerTick, step, numberRow, onPress,
}: {
    dateISO: string;
    label: string;
    selected: boolean;
    today: boolean;
    centerTick: TickKind;
    step: number;
    numberRow: number;
    onPress: (dateISO: string) => void;
}) {
    const { dark } = useTheme();
    const ticks = useMemo(() => smallTickOffsets(step), [step]);
    const M = scrubberMetrics;

    /**
     * Renkler LEVHANIN kendi paletinden, sayfanınkinden değil.
     *
     * Levha buzlu cam: arkasından geçen içerik her karede farklı bir zemin
     * yapıyor. `c.tx2` gibi sayfa jetonları o zemine göre değil kâğıda göre
     * seçilmişti; camın üstünde kimi karede kayboluyordu.
     */
    const ink = dark ? M.numDark : M.numLight;
    const inkSel = dark ? M.numSelDark : M.numSelLight;
    const tickColor = dark ? M.tickDark : M.tickLight;
    const tickMajorColor = dark ? M.tickMajorDark : M.tickMajorLight;
    const playhead = dark ? M.playheadDark : M.playheadLight;

    // Üç kademe: gün merkezi uzun, ay sınırı daha uzun, aradakiler kısa.
    const centerHeight = centerTick === 'major' ? M.tickMajor : M.tickMonth;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}. gün${today ? ', bugün' : ''}`}
            accessibilityState={{ selected: selected }}
            onPress={() => onPress(dateISO)}
            style={{ width: step, height: '100%' }}
        >
            {/* Rakam satırı. Seçili gün ÇERÇEVELİ bir hapın içinde — dolgu
                değil, kenar. Turuncu hap yok; turuncu yalnız bugüne ait. */}
            <View style={{ height: numberRow, alignItems: 'center', justifyContent: 'center' }}>
                {selected ? (
                    <View style={{
                        width: M.pillWidth,
                        height: M.pillHeight,
                        borderRadius: M.pillRadius,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: dark ? M.pillFillDark : M.pillFillLight,
                        borderWidth: 1,
                        borderColor: dark ? M.pillBorderDark : M.pillBorderLight,
                    }}>
                        <Text style={[{
                            color: inkSel,
                            fontSize: M.numberSize,
                            fontWeight: '700',
                            letterSpacing: M.numberSize * -0.01,
                        }, numeric]}>
                            {label}
                        </Text>
                    </View>
                ) : (
                    <Text style={[{
                        color: ink,
                        fontSize: M.numberSize,
                        fontWeight: '500',
                        letterSpacing: M.numberSize * -0.01,
                    }, numeric]}>
                        {label}
                    </Text>
                )}
            </View>

            {/*
              * Çentik bandı — hücrenin ALTINA oturur, levhanın alt kenarında
              * biter. Alt iç boşluk yok; köşe yarıçapı kırpar.
              *
              * Bir gün periyodu = 1 uzun + 9 kısa. `smallTickOffsets` gün
              * merkezini zaten HARİÇ TUTUYOR, o yüzden uzun çentiğin altında
              * ikinci bir çizgi kalmıyor ve üst üste binen iki yarı saydam
              * çizginin ürettiği ton farkı bizde oluşmuyor.
              */}
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Svg width={step} height={M.tickBand}>
                    {ticks.map((x) => (
                        <Line
                            key={x}
                            x1={x}
                            x2={x}
                            y1={M.tickBand}
                            y2={M.tickBand - M.tickSmall}
                            stroke={tickColor}
                            strokeWidth={1}
                        />
                    ))}
                    {/* Gün merkezi: hücrenin ortası, rakamın TAM altı. */}
                    <Line
                        x1={majorTickOffset(step)}
                        x2={majorTickOffset(step)}
                        y1={M.tickBand}
                        y2={M.tickBand - centerHeight}
                        stroke={tickMajorColor}
                        strokeWidth={1}
                    />
                </Svg>
            </View>

            {/*
              * Oynatma çizgisi hapın alt kenarından iner ve UZUN ÇENTİĞİN
              * TEPESİNDE biter: 5 + 9 = 14 pt kesintisiz tek eksen. Bandın
              * dibine kadar inseydi uzun çentiğin üstünden geçer ve iki ayrı
              * çizgi gibi görünürdü.
              */}
            {selected ? (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: (step - M.playheadWidth) / 2,
                        bottom: M.tickMajor,
                        width: M.playheadWidth,
                        height: M.playheadHeight,
                        backgroundColor: playhead,
                    }}
                />
            ) : null}

            {/* Bugün — bu ekranda turuncunun TEK yeri. */}
            {today ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={{
                        position: 'absolute',
                        left: (step - M.playheadWidth) / 2,
                        bottom: M.tickMajor,
                        width: M.playheadWidth,
                        height: M.todayLine,
                        backgroundColor: ACCENT,
                    }} />
                    {/* Nokta merkezi hapın alt kenarı hizasında. */}
                    <View style={{
                        position: 'absolute',
                        left: (step - M.todayDot) / 2,
                        bottom: M.todayDotBottom,
                        width: M.todayDot,
                        height: M.todayDot,
                        borderRadius: M.todayDot,
                        backgroundColor: ACCENT,
                    }} />
                </View>
            ) : null}
        </Pressable>
    );
});

/** Levhanın güvenli alanın altındaki görünür payı. Akışın üst boşluğu bu. */
export function scrubberInset(small: boolean): number {
    const topGap = small ? scrubberMetrics.topGapSmall : scrubberMetrics.topGap;
    const railHeight = small ? scrubberMetrics.railHeightSmall : scrubberMetrics.railHeight;
    // Başlık satırı yok (Müdür 19 · A): levha yalnız rakamları ve cetveli taşır.
    return topGap + railHeight;
}
