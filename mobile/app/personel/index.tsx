/**
 * Personel 01 · Bugün — personelin gün akışı.
 *
 * Kaynak: `docs/personel-02-sira-kartlari.md` ve Claude Design
 * "Luera Mobil - Personel 02 Sira Kartlari.html".
 *
 * Ekran tek bir soruya cevap veriyor: "bugün ne yapacağım, neredeyim?"
 *
 * Eski tasarım (Kumanda.html · Personel 04/05) kaldırıldı: kahraman kart,
 * 66 pt'lik "İşleme başla" düğmesi ve onun morph animasyonu gitti. Eylem artık
 * karta dokununca açılan randevu sayfasında yaşıyor; kartın içinde ikinci bir
 * dokunulur şey YOK. `LayoutAnimation` da bu ekrandan bu turda çıktı.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayHeader } from '../../src/components/CalendarParts';
import { AppointmentCard, NowLineSlot } from '../../src/components/AppointmentCard';
import { StaffWeekStrip } from '../../src/components/StaffWeekStrip';
import { formatDayMonth, todayISO } from '../../src/lib/calendar';
import { cardState, nowLineAfter, stripDays } from '../../src/lib/staffCard';
import { clockOf, demoAgenda, demoAgendaFor } from '../../src/lib/staffDemo';
import { useAgenda } from '../../src/lib/agendaSource';
import { LIVE_AUTH } from '../../src/api/session';
import { feedback } from '../../src/lib/feedback';
import { font, glow, useTheme } from '../../src/theme';

/**
 * Şeridin yoğunluk noktaları.
 *
 * Sayılar artık uydurma bir diziden değil, o günün KENDİ listesinden geliyor:
 * şeritte üç nokta gören personel o güne dokunduğunda üç kart görüyor. Uydurma
 * sayı, gün seçimi bu ekranda açılır açılmaz görünür bir yalana dönüştü.
 *
 * Bilinmeyen gün anahtarı TAŞIMAZ — nokta çizilmemesi "randevu yok" demek
 * değil. Burada her gün biliniyor, çünkü hepsi yerelde üretiliyor.
 */
function demoCounts(
    days: readonly string[],
    todayISO: string,
    todayCount: number,
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const iso of days) {
        out[iso] = iso === todayISO ? todayCount : demoAgendaFor(iso, todayISO).length;
    }
    return out;
}

export default function Today() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const today = todayISO();

    /**
     * Şeritteki gün Takvim sekmesine ATLAMAZ, bu ekranda açılır.
     *
     * Önceki karar başka günü Takvim'e devrediyordu; sahada personel şeride
     * "yarın kaç işim var" diye bakıyor ve sekme değiştirmek o soruyu üç
     * dokunuşa çıkarıyordu. Şeridin işi bu hafta, Takvim'in işi salonun
     * tamamı ve ayın tamamı — bölüşme orada, gün seçiminde değil.
     */
    const [dateISO, setDateISO] = useState(today);
    const isToday = dateISO === today;

    const [now, setNow] = useState(() => Date.now());
    // Liste artık SENKRON DEĞİL. Sahte kaynak anında dönüyordu; gerçek sunucu
    // dönmeyebilir de. "Okunamadı" ile "randevu yok" ayrı hâller ve ikincisi
    // personelin gününü kapatmasına yol açardı.
    const { state: agendaState, rows: agenda, reload } = useAgenda(dateISO, today);

    const rows = useMemo(
        () => agenda.map((appointment) => ({ appointment, state: cardState(appointment, now) })),
        [agenda, now],
    );
    const running = rows.some((row) => row.state.counter != null);

    // Sayaç saniye saniye ilerliyor; sayaç yoksa saniyede bir yeniden çizmenin
    // tek kazancı şimdi çizgisinin dakikası olurdu — o 30 saniye bekleyebilir.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), running ? 1000 : 30_000);
        return () => clearInterval(id);
    }, [running]);

    // Şimdi çizgisi YALNIZ bugün çizilir: başka günde "şimdi" diye bir yer yok.
    const lineAfter = isToday ? nowLineAfter(agenda, now) : -2;
    const days = useMemo(() => stripDays(today), [today]);
    const todayCount = useMemo(() => demoAgenda(now, today).length, [today]); // eslint-disable-line react-hooks/exhaustive-deps
    /**
     * Şeridin gün sayıları.
     *
     * Sunucuda ARALIK ucu yok — `agenda` tek gün dönüyor. Canlıda sahte
     * sayıları çizmek düpedüz yalan olurdu; onun yerine YALNIZ okunan gün
     * sayı taşıyor. Şerit eksik günü "bilinmiyor" diye çiziyor, sıfır diye
     * değil (`personel/calendar.tsx` ile aynı kural).
     */
    const counts = useMemo(
        () => (LIVE_AUTH
            ? (agendaState === 'ok' ? { [dateISO]: agenda.length } : {})
            : demoCounts(days, today, todayCount)),
        [agendaState, agenda.length, dateISO, days, today, todayCount],
    );

    /**
     * Listeye YENİ düşen randevular. Müdür gün içinde randevu ekleyebiliyor;
     * o kart yuva açarak yerinde beliriyor. İlk çizimde hiçbir kart "yeni"
     * sayılmaz — açılışta liste canlanmıyor, zaten oradaydı.
     */
    const seen = useRef<{ day: string; ids: Set<string> } | null>(null);
    const [fresh, setFresh] = useState<Set<string>>(() => new Set());
    // Karşılaştırma ÇİZİMDE değil, çizimden sonra yapılıyor: `seen` bir ref ve
    // render sırasında yazılması React'in kendi kuralını çiğniyordu.
    useEffect(() => {
        // Liste HENÜZ OKUNMADIYSA karşılaştırma yapılmıyor.
        //
        // Kaynak asenkron olunca ilk tur boş listeyle çalışıyordu; gerçek
        // liste gelince "aynı gün, önceki liste boştu" görünüyor ve BÜTÜN
        // kartlar yeni sayılıyordu. Her açılışta hepsi yuva açarak beliriyor,
        // üstelik halka kendini kart büyürken ölçüp degradeyi kaymış
        // oturtuyordu. İlk okuma bir olay değil, başlangıç durumudur.
        if (agendaState !== 'ok') return;
        const ids = new Set(agenda.map((item) => item.id));
        const before = seen.current;
        seen.current = { day: dateISO, ids };
        // GÜN DEĞİŞTİYSE hiçbir kart yeni sayılmaz: liste baştan aşağı
        // değişiyor ama bu "randevu düştü" demek değil, "başka güne baktın"
        // demek. Bütün kartların yuva açarak belirmesi yalan bir olay anlatırdı.
        setFresh(before == null || before.day !== dateISO
            ? new Set<string>()
            : new Set([...ids].filter((id) => !before.ids.has(id))));
    }, [agenda, dateISO, agendaState]);

    const done = rows.filter((row) => row.state.dim > 0 || row.state.kind === 'unbilled').length;
    const left = rows.length - done;
    // Cümle güne göre değişiyor: "bitti / kaldı" bugünün ölçüsü. Geçmiş günde
    // kalan iş yok, gelecek günde bitmiş iş yok — ikisinde de o cümle yalan.
    const subtitle = `${formatDayMonth(dateISO)} · ${
        // Liste OKUNAMADIYSA sayıdan söz edilmiyor. Başlık `rows.length`e
        // bakıyordu ve hata hâlinde onu sıfır görüp "randevu yok" yazıyordu:
        // gövde "okuyamadık" derken başlık "yok" diyordu. Aynı ekranda iki
        // farklı gerçek, ikisinden biri yalan.
        agendaState === 'error'
            ? 'okunamadı'
            : agendaState === 'loading'
                ? '…'
                : rows.length === 0
            ? 'randevu yok'
            : isToday
                ? `${done} iş bitti, ${left} kaldı`
                : dateISO < today
                    ? `${rows.length} iş yapıldı`
                    : `${rows.length} randevu`
    }`;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Ekranın sıcaklığı başlıktan iniyor ve listede biter. Müdür
                akışıyla AYNI jeton: iki mod aynı ürün. */}
            <LinearGradient
                colors={dark ? glow.dark : glow.light}
                locations={glow.locations}
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: glow.height + insets.top,
                }}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingTop: insets.top + 2, paddingBottom: 122 }}
                showsVerticalScrollIndicator={false}
            >
                <DayHeader dateISO={dateISO} subtitle={subtitle} transparent />

                <StaffWeekStrip
                    days={days}
                    todayISO={today}
                    selectedISO={dateISO}
                    counts={counts}
                    onSelect={setDateISO}
                />

                <View style={{
                    height: 1,
                    marginTop: 8,
                    marginBottom: 12,
                    backgroundColor: c.bd,
                }} />

                {/* Çizgi listenin başında da durabilir: gün henüz başlamadıysa
                    ilk kartın üstünde. Yuva her konumda var, yalnız biri açık —
                    böylece çizgi kartın üstünden GEÇMİYOR, boşluktan boşluğa
                    taşınıyor. */}
                <NowLineSlot active={lineAfter < 0} time={clockOf(now)} />

                {agendaState === 'error' ? (
                    /* OKUNAMADI — "randevu yok" DEĞİL. Ayrı bir görsel
                       icat edilmiyor: aynı yerleşim, ayrı cümle ve tek bir
                       eylem. Durum ekranlarının kendi turu (Müdür 28) hâlâ
                       rafta; burada yapılan tek şey, hatanın boş bir gün
                       gibi okunmasını engellemek. */
                    <View style={{ paddingHorizontal: 16, paddingTop: 26, gap: 7 }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: 19,
                            lineHeight: 22.8,
                            letterSpacing: -0.38,
                            fontFamily: font.extraLight,
                        }}>
                            Bu günü <Text style={{ fontFamily: font.bold }}>okuyamadık</Text>.
                        </Text>
                        <Text style={{
                            color: c.tx2,
                            fontSize: 13.5,
                            lineHeight: 20.25,
                            fontWeight: '500',
                            maxWidth: 310,
                        }}>
                            Randevunuz olmadığı anlamına gelmez. Bağlantınızı kontrol edip
                            tekrar deneyin.
                        </Text>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => { feedback.selection(); reload(); }}
                            style={({ pressed }) => ({
                                alignSelf: 'flex-start', marginTop: 6,
                                paddingHorizontal: 16, height: 40, borderRadius: 20,
                                alignItems: 'center', justifyContent: 'center',
                                backgroundColor: c.fld, opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text style={{ color: c.tx, fontSize: 14, fontWeight: '700' }}>
                                Tekrar dene
                            </Text>
                        </Pressable>
                    </View>
                ) : agendaState === 'loading' ? (
                    /* Yükleniyor SESSİZ: iskelet ya da dönen çark yok. Liste
                       çoğu zaman bir saniyeden kısa sürede geliyor ve o kadar
                       kısa süre için ekranı doldurmak, gelen listeyi zıplatır. */
                    null
                ) : rows.length === 0 ? (
                    /* Randevusuz gün artık ULAŞILABİLİR bir hâl: şerit her
                       güne açıyor. Boş bir liste bırakmak "yüklenmedi mi,
                       yok mu" sorusunu doğururdu. */
                    <View style={{ paddingHorizontal: 16, paddingTop: 26, gap: 7 }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: 19,
                            lineHeight: 22.8,
                            letterSpacing: -0.38,
                            fontFamily: font.extraLight,
                        }}>
                            {dateISO < today ? (
                                <>Bu gün <Text style={{ fontFamily: font.bold }}>randevu almamışsınız</Text>.</>
                            ) : (
                                <>Bu gün <Text style={{ fontFamily: font.bold }}>randevunuz yok</Text>.</>
                            )}
                        </Text>
                        <Text style={{
                            color: c.tx2,
                            fontSize: 13.5,
                            lineHeight: 20.25,
                            fontWeight: '500',
                            maxWidth: 310,
                        }}>
                            {dateISO < today
                                ? 'Geçmiş günün listesi değişmez.'
                                : 'Randevu eklendiğinde burada görünür; şeritteki nokta da o gün belirir.'}
                        </Text>
                    </View>
                ) : null}

                {rows.map(({ appointment, state }, index) => (
                    <View key={appointment.id}>
                        <AppointmentCard
                            appointment={appointment}
                            state={state}
                            entering={fresh.has(appointment.id)}
                            // Dört ekran (appointment · visit · finish · sent)
                            // tek kumandaya indi; evreyi o sayfa kendi
                            // verisinden okuyor.
                            onPress={() => router.push({
                                pathname: '/(staff-flow)/kumanda',
                                params: { id: appointment.id },
                            })}
                        />
                        <NowLineSlot active={index === lineAfter} time={clockOf(now)} />
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
