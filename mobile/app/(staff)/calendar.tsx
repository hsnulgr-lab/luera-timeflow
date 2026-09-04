import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader, OfflineBar, WeekStrip, animateOfflineBar } from '../../src/components/CalendarParts';
import { ColumnCalendar } from '../../src/components/ColumnCalendar';
import { source } from '../../src/lib/calendarSource';
import { hourRange, type ColumnStaff } from '../../src/lib/managerCalendar';
import { mockDay } from '../../src/lib/managerFlow';
import { nowInMinutes, weekDays, type Appt } from '../../src/lib/calendar';
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
 * kapsamıyor. Ölçüyü `BottomTabBarHeightContext` verirse ondan alıyoruz —
 * `NativeTabs` o bağlamı doldurmayabilir, o zaman bu sayı devreye giriyor.
 * Eksik kalırsa alt sayfanın son satırı çubuğun altında kalıyordu.
 */
const TAB_BAR_FALLBACK = 64;

/** Oturumdaki personel. Sunucuya bağlanınca `me.id` buraya gelecek. */
const ME = 'merve';

export default function StaffCalendar() {
    const { c, dark, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    /**
     * Bugün ekranındaki gün şeridinden gelen tarih. Şeritteki dokunuş ölü
     * olamaz: dokunulan gün burada AÇILMALI.
     */
    const params = useLocalSearchParams<{ date?: string }>();

    const [fetched, setFetched] = useState<Appt[]>([]);
    const [selectedDate, setSelectedDate] = useState(params.date ?? mockDay.dateISO);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [peek, setPeek] = useState<Appt | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

    /**
     * Çevrimdışı bandı. Bu ekran bodrum katta, kötü sinyalde açılıyor;
     * sessizce eski veri göstermek, personelin yanlış saate güvenmesi demek.
     * Bant indiğinde içerik aynı miktarda aşağı kayıyor — yükseklik değil
     * DÖNÜŞÜM, ikisi de native sürücüde kalsın.
     */
    const { offline, queued } = useConnectivity();
    const bannerText = offlineBannerText(offline, queued);
    const barProgress = useRef(new Animated.Value(0)).current;
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
        try {
            const [day, map] = await Promise.all([
                source.day(selectedDate),
                source.range(days[0]?.date ?? selectedDate, days.at(-1)?.date ?? selectedDate)
                    .catch(() => null),
            ]);
            setFetched(day);
            // Sayılar okunamadıysa ELDEKİ sayılar durur; boş harita yazmak
            // dolu bir haftayı boş gösterirdi.
            if (map) setCounts(map);
        } catch {
            // Yenileme başarısızsa ekranda ne varsa o kalır. Hatanın kendisi
            // çevrimdışı bandında zaten görünüyor.
        } finally {
            setRefreshing(false);
        }
    }, [days, selectedDate]);

    useEffect(() => {
        let alive = true;
        // Okuma başarısız olursa ELDEKİ liste durur; yerine boş bir gün yazılmaz.
        source.day(selectedDate).then((list) => { if (alive) setFetched(list); }).catch(() => undefined);
        return () => { alive = false; };
    }, [selectedDate]);

    useEffect(() => {
        if (params.date) setSelectedDate(params.date);
    }, [params.date]);

    useEffect(() => {
        let alive = true;
        // Sayılar okunamazsa `counts` BOŞ kalır ve şerit o günleri "bilinmiyor"
        // diye çizer — sıfır diye değil.
        source.range(days[0]?.date ?? selectedDate, days.at(-1)?.date ?? selectedDate)
            .then((map) => { if (alive) setCounts(map); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [selectedDate]);

    const staff: ColumnStaff[] = useMemo(
        () => mockDay.presence.map((person) => ({
            id: person.id, initials: person.initials, name: person.name,
        })),
        [],
    );

    const { from, to } = useMemo(() => hourRange(fetched), [fetched]);
    const isToday = selectedDate === mockDay.dateISO;

    // Şimdi çizgisi dakika başı ilerler; yalnız bugüne bakarken sayar.
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        if (!isToday) return;
        setNowMinutes(nowInMinutes());
        const id = setInterval(() => setNowMinutes(nowInMinutes()), 60_000);
        return () => clearInterval(id);
    }, [isToday]);

    // Müdür "6 personel" der; personelin sorusu farklı: bu günün kaçı bende?
    const mine = fetched.filter((appointment) => appointment.staff_id === ME).length;
    const subtitle = `${fetched.length} randevu · ${mine} tanesi sizin`;

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
                    onSelect={setSelectedDate}
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
                        if (appointment.staff_id === ME) {
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
    const tabBar = useContext(BottomTabBarHeightContext) ?? TAB_BAR_FALLBACK;
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
                style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' }}
            />
            <View style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                backgroundColor: c.card,
                borderTopWidth: 1, borderTopColor: c.bd2,
                borderTopLeftRadius: 30, borderTopRightRadius: 30,
                paddingHorizontal: 22, paddingTop: 22,
                paddingBottom: insets.bottom + tabBar + 16,
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
