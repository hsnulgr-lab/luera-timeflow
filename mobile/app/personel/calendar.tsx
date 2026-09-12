import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader, OfflineBar, WeekStrip, animateOfflineBar } from '../../src/components/CalendarParts';
import { ColumnCalendar } from '../../src/components/ColumnCalendar';
import { hourRange, type ColumnStaff } from '../../src/lib/managerCalendar';
import { useSalonDay } from '../../src/lib/salonDay';
import { clockOf } from '../../src/lib/staffDemo';
import { nowInMinutes, todayISO, weekDays, type Appt } from '../../src/lib/calendar';
import { offlineBannerText, useConnectivity } from '../../src/lib/connectivity';
import { feedback } from '../../src/lib/feedback';
import { glow, numeric, offlineBar, useTheme } from '../../src/theme';

/**
 * Personel · Takvim — SALONUN günü, salt okunur.
 *
 * İşletmenin kararı: personel salonun tamamını görür. Gövde müdürünkiyle
 * AYNI bileşen (`ColumnCalendar`), çünkü ikinci bir takvim dili üretmek iki
 * ekranın zamanla ayrışması demekti.
 *
 * Tek fark `readOnly`: sürükleme yok, boş saate dokunma yok, menü yok.
 * Bunları yalnız geri çağırmayı boş bırakarak kapatmak yetmezdi — blok yine
 * kalkar, sürüklenir, bırakılır ve hiçbir şey olmazdı. Ölü bir jest,
 * kullanıcıya denediğini sandırır.
 *
 * BU EKRANDA EYLEM YOK. Kaydır-başlat, bitir, adisyon — hepsi kumandada
 * yaşıyor. Aynı işi iki yerden başlatabilen personel, iki kez başlatır.
 * Kendi randevusuna dokunmak kumandayı AÇAR; meslektaşınınki yalnız okunur.
 *
 * Sunucu tarafı `staff-api → calendar`: ad ve hizmet döner, TELEFON ve NOT
 * dönmez. Ayrım orada, burada değil — istek elle de atılabilir.
 *
 * DEVRALINMAYANLAR. Bu ekranın liste hâlinde çalışan dört davranışı vardı ve
 * sütunlu ızgarada karşılıkları henüz ÇİZİLMEDİ: ay ızgarası, çevrimdışı
 * bandı, yüklenme iskeleti ve boş gün ekranı. Bileşenler silinmedi
 * (`CalendarParts`), ızgaranın bu hâlleri tasarlandığında geri takılacak.
 * Yarım çizilmiş bir hâli buraya koymak, kullanıcıya yanlış bilgi vermekti.
 */

/**
 * iOS 26'nın yüzen sekme çubuğu içeriğin ÜSTÜNDE duruyor; güvenli alan onu
 * kapsamıyor ve eksik bırakılırsa kartın son satırı çubuğun altında kalıyor.
 *
 * Sayı SABİT: `NativeTabs` gerçek yüksekliği bir bağlama yazmıyor, ve SDK 57
 * ile `@react-navigation/bottom-tabs` expo-router'ın içine gömüldü — dışa
 * açık bir yolu yok. Yanlış bir yerden okumaktansa ölçüyü burada tutmak
 * dürüst: değişirse tek yer değişiyor.
 */
const TAB_BAR = 64;

export default function StaffCalendar() {
    const { c, dark, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    /**
     * Bugün ekranındaki gün şeridinden gelen tarih. Şeritteki dokunuş ölü
     * olamaz: dokunulan gün burada AÇILMALI.
     */
    const params = useLocalSearchParams<{ date?: string }>();

    const today = todayISO();
    /**
     * Seçili gün — parametreyi state'e AYNALAMADAN.
     *
     * Eskiden `params.date` bir efektle state'e kopyalanıyordu; derleyici bunu
     * "efektin içinde senkron setState" diye reddediyor ve haklı: bir kopya
     * daha tutmak, iki gerçeğin ayrışabileceği bir yer açmak demek.
     *
     * Seçim, hangi parametrenin üstüne yapıldığını da saklıyor. Böylece
     * Bugün'ün şeridinden YENİ bir gün gelince kullanıcının eski seçimi
     * kendiliğinden düşüyor — parametre değişti, seçim artık ona ait değil.
     */
    const [pick, setPick] = useState<{ over: string | undefined; date: string } | null>(null);
    const selectedDate = pick && pick.over === params.date
        ? pick.date
        : params.date ?? today;
    const selectDay = useCallback(
        (date: string) => setPick({ over: params.date, date }),
        [params.date],
    );
    const [peek, setPeek] = useState<Appt | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

    /**
     * Salonun günü. Kaynak `agendaSource` ile AYNI deseni taşıyor: üç hâl,
     * sessiz yoklama, öne dönüş, sekmeye dönüş. Ekranda üç şey değişti —
     * sütunlar, "kimin randevusu" kararı ve şerit sayıları artık SUNUCUDAN
     * geliyor; üçü de sahte sabitlerdi.
     */
    const {
        state: dayState, rows: fetched, crew, mine, counts, at: readAt, stale, reload,
    } = useSalonDay(selectedDate);

    /**
     * Çevrimdışı bandı. Bu ekran bodrum katta, kötü sinyalde açılıyor;
     * sessizce eski veri göstermek, personelin yanlış saate güvenmesi demek.
     * Bant indiğinde içerik aynı miktarda aşağı kayıyor — yükseklik değil
     * DÖNÜŞÜM, ikisi de native sürücüde kalsın.
     */
    const { offline, queued } = useConnectivity();
    const bannerText = offlineBannerText(offline, queued);
    // `useRef(new Animated.Value(0)).current` DEĞİL: derleyici ref'in çizim
    // sırasında okunmasını reddediyor (react-hooks/refs) ve bu değer tam da
    // çizimde, `transform` içinde okunuyor. Durum başlatıcısı aynı kalıcılığı
    // veriyor — değer bir kez kuruluyor ve bir daha değişmiyor.
    const [barProgress] = useState(() => new Animated.Value(0));
    useEffect(() => {
        animateOfflineBar(barProgress, bannerText !== null, reduceMotion);
    }, [bannerText, barProgress, reduceMotion]);

    /**
     * Aşağı çekip yenileme. Çekme hareketi sistemin `RefreshControl`'ü —
     * parmağı birebir takip eder, bizim eğrimiz yoktur. Kaydırıcı ızgaranın
     * İÇİNDE olduğu için kontrol de oraya veriliyor.
     */
    const refresh = useCallback(async () => {
        setRefreshing(true);
        feedback.light();
        // Hata YUTULMUYOR ama ayrı da çizilmiyor: `reload` başarısızlığı
        // ekranın kendi `error` hâline yazıyor ve kaydırıcı orada duruyor.
        await reload();
        setRefreshing(false);
    }, [reload]);

    const staff: ColumnStaff[] = crew;

    const { from, to } = useMemo(() => hourRange(fetched), [fetched]);
    const isToday = selectedDate === today;

    /**
     * Şimdi çizgisi dakika başı ilerler.
     *
     * Sayaç artık `isToday`e BAĞLI DEĞİL. Bağlıyken, başka günden bugüne
     * dönüldüğünde çizgi 60 saniyeye kadar eski dakikada kalıyordu; bunu
     * önleyen "hemen bir kez ayarla" satırı ise efektin içinde senkron bir
     * setState'ti ve derleyici onu reddediyor. Sayacı sürekli döndürmek, o
     * satırı da `isToday` bağımlılığını da gereksiz kılıyor — değer zaten
     * yalnız bugüne bakarken ÇİZİLİYOR.
     */
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        const id = setInterval(() => setNowMinutes(nowInMinutes()), 60_000);
        return () => clearInterval(id);
    }, []);

    /**
     * Başlığın cümlesi. Müdür "6 personel" der; personelin sorusu farklı:
     * bu günün kaçı bende?
     *
     * OKUNAMADIYSA sayıdan söz edilmiyor. Eskiden `fetched.length` yazıyordu
     * ve hata hâlinde onu sıfır görüp "0 randevu" diyordu — okuyamadığı bir
     * günü BOŞ bir gün gibi göstermek, personelin gününü kapatmasına yol
     * açar (`personel/index.tsx` ile aynı kural).
     *
     * BAYATSA sayının yerini saat alıyor. Yoklama sessizce cevap alamıyorsa
     * ızgara donuyor ve bunun tek izi bu satır: "kaçı sizin"i kaybetmek,
     * bayat bir saate güvenmekten iyi.
     */
    const subtitle = dayState === 'error'
        ? 'okunamadı'
        : dayState === 'loading'
            ? '…'
            : stale && readAt
                ? `${fetched.length} randevu · son güncelleme ${clockOf(readAt)}`
                : `${fetched.length} randevu · ${mine.size} tanesi sizin`;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <LinearGradient
                colors={dark ? glow.dark : glow.light}
                locations={glow.locations}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { height: glow.height + insets.top }]}
            />

            <Animated.View
                // Yalnız dönüşüm taşıyan bir görünüm: RN onu ELEYEBİLİR ve
                // dönüşüm de onunla birlikte düşer.
                collapsable={false}
                style={{
                flex: 1,
                zIndex: 1,
                paddingTop: insets.top,
                transform: [{
                    translateY: barProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, offlineBar.height],
                    }),
                }],
                }}
            >
                <DayHeader dateISO={selectedDate} subtitle={subtitle} transparent />

                <WeekStrip
                    days={days}
                    selectedISO={selectedDate}
                    counts={counts}
                    onSelect={selectDay}
                />

                <View style={{ height: 1, backgroundColor: c.bd }} />

                <ColumnCalendar
                    appointments={fetched}
                    staff={staff}
                    from={from}
                    to={to}
                    nowMinutes={nowMinutes}
                    isToday={isToday}
                    readOnly
                    refreshControl={(
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={refresh}
                            tintColor={c.tx2}
                            colors={[c.or]}
                            progressBackgroundColor={c.surf}
                        />
                    )}
                    onOpen={(appointment) => {
                        // Karar SUNUCUDAN: sabit bir 'merve' duruyordu ve
                        // canlıda herkesin takvimi ya "hepsi benim" ya
                        // "hiçbiri benim değil" diye okunurdu.
                        if (mine.has(appointment.id)) {
                            router.push({ pathname: '/(staff-flow)/kumanda', params: { id: appointment.id } });
                            return;
                        }
                        setPeek(appointment);
                    }}
                />
            </Animated.View>

            {/* Bant en üstte: söylediği şey ekranın tamamını ilgilendiriyor. */}
            <OfflineBar
                text={bannerText}
                progress={barProgress}
                style={{ position: 'absolute', zIndex: 40, top: insets.top, left: 0, right: 0 }}
            />

            {peek ? <Peek appointment={peek} staff={staff} onClose={() => setPeek(null)} /> : null}
        </View>
    );
}

/**
 * Meslektaşın randevusu — okunur, dokunulmaz.
 *
 * Boş bir dokunuş bırakmamak için var: blok basılabiliyorsa bir şey
 * söylemeli. Söylediği, takvimde zaten yazandan fazlası değil; telefon, not
 * ve adisyon YOK, çünkü sunucu da göndermiyor.
 */
function Peek({ appointment, staff, onClose }: {
    appointment: Appt;
    staff: readonly ColumnStaff[];
    onClose: () => void;
}) {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const owner = staff.find((person) => person.id === appointment.staff_id)?.name ?? 'Personel';

    return (
        // İçerik katmanı `zIndex: 1` taşıyor (bant onun da üstünde, 40).
        // Buraya bir sıra verilmezse kart varsayılan sıfırda kalıyor ve
        // TAKVİM KARTIN ÜSTÜNE çiziliyor: perde kararmıyor, saatler yazının
        // içinden geçiyordu. Ağaçta sonra gelmek yetmiyor.
        <View style={{ position: 'absolute', zIndex: 60, top: 0, left: 0, right: 0, bottom: 0 }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kapat"
                onPress={onClose}
                // RN 0.86: `absoluteFillObject` kalktı, `absoluteFill` duruyor.
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
            />
            <View style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                backgroundColor: c.card,
                borderTopWidth: 1, borderTopColor: c.bd2,
                borderTopLeftRadius: 30, borderTopRightRadius: 30,
                paddingHorizontal: 22, paddingTop: 22,
                paddingBottom: insets.bottom + TAB_BAR + 16,
                gap: 5,
            }}>
                <Text style={[{ fontSize: 13, fontWeight: '700', color: c.tx3, letterSpacing: 1.2 }, numeric]}>
                    {appointment.start_time.slice(0, 5)} – {appointment.end_time.slice(0, 5)}
                </Text>
                <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.7, color: c.tx }}>
                    {appointment.customer_name}
                </Text>
                <Text style={{ fontSize: 15.5, fontWeight: '600', color: c.tx2 }}>
                    {appointment.service}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.tx3, paddingTop: 10 }}>
                    {owner} · bu randevu sizin değil
                </Text>
                <Pressable
                    accessibilityRole="button"
                    onPress={onClose}
                    style={({ pressed }) => ({ height: 50, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.tx2 }}>Kapat</Text>
                </Pressable>
            </View>
        </View>
    );
}
