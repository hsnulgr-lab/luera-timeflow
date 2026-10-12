import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader } from '../../src/components/CalendarParts';
import { DurumBlock } from '../../src/components/Durum';
import { VoidBlock } from '../../src/components/EmptyDayParts';
import { SoloAppointmentCard, SoloDaySkeleton, SoloNowLine } from '../../src/components/SoloDayParts';
import { SoloPicker } from '../../src/components/SoloPicker';
import { StaffWeekStrip } from '../../src/components/StaffWeekStrip';
import {
    StaffHeroPanelCard,
    StaffListHeaderView,
} from '../../src/components/StaffDayParts';
import { waNudgeText, type CellKey } from '../../src/lib/actionPill';
import { CALL_FAILED, REMINDER_FAILED } from '../../src/lib/appointmentDetail';
import { nowInMinutes, todayISO, toMinutes, weekDays, type Appt } from '../../src/lib/calendar';
import { updateAppointment } from '../../src/lib/managerWrite';
import { dialable, waLink } from '../../src/lib/phone';
import { useManagerCalendarDay } from '../../src/lib/managerCalendarDay';
import { fetchServices } from '../../src/lib/managerSource';
import { salonServicesOf } from '../../src/lib/settingsMap';
import { orgDurum } from '../../src/lib/managerDurum';
import {
    SOLO_UNREAD_COPY, soloDayCounts, soloDayList, soloDaySubtitle, soloDayTotal, soloEmptyCopy, soloIdlePanel,
    soloOpenTicket, soloPickIndex, soloPickItems, soloStartable,
} from '../../src/lib/soloDay';
import { buildStaffDayState } from '../../src/lib/staffDay';
import { activeWait, waitIntentOf } from '../../src/lib/waitIntent';
import { useManagerDay } from '../../src/state/managerDay';
import { glow, soloDayMetrics, staffDayMetrics, useTheme } from '../../src/theme';

/**
 * Tek kişilik · GÜN (108).
 *
 * Üç mevcut ekranın harmanı, yeni bir tasarım değil:
 *
 *   • Başlık ve hafta şeridi — personel "Bugün" (`DayHeader`, `StaffWeekStrip`)
 *   • Hâl kartı — Müdür 24 "bir personelin günü" (`StaffHeroPanelCard`)
 *   • Boş gün — Müdür 22 boş hâl gövdesi (`VoidBlock`), cümlesi tek kişilik
 *   • Gün hesabı — `buildStaffDayState`, personel günüyle AYNI işlev
 *
 * Tek YENİ parça randevu kartı (`SoloAppointmentCard`): Müdür 24'ün ayırıcı
 * çizgili satırı burada kart oluyor, çünkü orada listenin payı ekranın alt
 * şeridiydi, burada gövdenin tamamı. Gerekçesi bileşenin başında.
 *
 * Tasarım: `docs/design-reference/Luera Mobil - Tek Kisilik v4.html` · G1–G4
 *
 * ── Müdür 24'ten ÇIKANLAR ───────────────────────────────────────────────────
 * Geri oku, avatar başlığı, ad ve meslek satırı, personeller arası yatay
 * sayfalama, alttaki "Randevu ver / Ara" ikilisi. Hepsi birini DIŞARIDAN
 * izlemeye ait; burada bakan kişi ile bakılan kişi aynı. Kendi adını ve
 * mesleğini okumanın bir karşılığı yok, "Ara" düğmesi kendini arardı.
 *
 * ── Eylem hapı ve kumanda (Faz 2b) ──────────────────────────────────────────
 * Hap kumandayı açıyor. Uzun süre çizilemedi çünkü kumanda dar personel
 * API'si üzerinde ve o API `x-staff-token` istiyor; sahibin elinde yalnız
 * Supabase oturumu var. Duvar sunucuda aşıldı (`solo.session`): sahip kendi
 * personel satırı için jeton alıyor, jetonu kabuk sessizce tazeliyor
 * (`src/lib/soloSession.ts`).
 *
 * Hap İŞİ BAŞLATMIYOR, kumandayı açıyor. Başlatmak `started_at` yazıyor ve
 * bu geri alınamaz; listede yanlışlıkla dokunulan bir hapın günün sayacını
 * yanlış dakikadan başlatması kabul edilemezdi. Tasarım da böyle (v4 · G1).
 */
export default function SoloDay() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [selectedISO, setSelectedISO] = useState(() => todayISO());
    const { state, data, refusal, reload } = useManagerCalendarDay(selectedISO);
    const days = useMemo(() => weekDays(selectedISO), [selectedISO]);

    const isToday = selectedISO === todayISO();
    const dayKnown = state === 'ok';

    /*
     * SÜREN İŞ — sayacın ve BEKLEMEDE kartının kaynağı.
     *
     * `buildStaffDayState` de aynı satırı buluyor, ama sayacın hızını o
     * hesaptan ÖNCE bilmek gerekiyor: süren iş varken ekran saniyede bir,
     * yokken yarım dakikada bir çiziliyor.
     */
    const runningRow = useMemo(
        () => (isToday
            ? data.rows.find((row) => row.status !== 'cancelled' && Boolean(row.arrived_at) && !row.service_ended_at) ?? null
            : null),
        [data.rows, isToday],
    );

    /*
     * Saat iki hızda ilerliyor (v4 · G2).
     *
     * Süren iş varken SANİYEDE BİR: kart "74:12" diyor ve saniye basamağı
     * donarsa sayaç durmuş görünür. Eskiden okuma anındaki dakika veriliyordu;
     * saniye hep ":00"dı ve sayı bir sonraki okumaya kadar kıpırdamıyordu.
     * Süren iş yokken yarım dakikada bir: ekrandaki her şey dakika
     * çözünürlüğünde ve saniyelik yeniden çizim bedava değil.
     */
    const [deviceNow, setDeviceNow] = useState(() => Date.now());
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        const id = setInterval(() => {
            setDeviceNow(Date.now());
            setNowMinutes(nowInMinutes());
        }, runningRow ? 1_000 : 30_000);
        return () => clearInterval(id);
    }, [runningRow]);
    /** Sunucunun saati — sayaç cihaz saatiyle değil bununla ilerliyor. */
    const serverNow = deviceNow + data.clockOffset;

    /*
     * Tek kişilik işletmede kadro TEK satır. Yine de `[0]` değil, "aktif
     * olanın ilki" alınıyor: mod sonradan değişmiş bir salonda birden fazla
     * satır kalmış olabilir ve ilk gelen pasif olabilir.
     */
    const me = useMemo(
        () => data.presence.find((person) => person.state !== 'off') ?? data.presence[0] ?? null,
        [data.presence],
    );

    /*
     * SAHİPSİZ RANDEVU DA BENİM.
     *
     * Müdür 24 yalnız `staff_id` eşleşen satırları alıyor, çünkü orada kimin
     * işi olduğu bir ayrım. Tek kişilik salonda böyle bir ayrım yok:
     * `staff_id` boş bir randevu — masaüstünden ya da mod açılmadan önce
     * kurulmuş olabilir — yine de bu kişinin günündedir. Süzüp atmak, günü
     * olduğundan boş göstermek olurdu.
     */
    const mine = useMemo(
        () => data.rows.filter((row) => !row.staff_id || row.staff_id === me?.id),
        [data.rows, me?.id],
    );

    /*
     * Geçen süre `arrived_at`ten, SUNUCU saatiyle. Okuma anındaki dakikayı
     * vermek saniyeyi kaybediyordu; aynı damga kumandada da sayacın kaynağı.
     */
    const elapsedSeconds = runningRow?.arrived_at
        ? Math.max(0, (serverNow - Date.parse(runningRow.arrived_at)) / 1000)
        : 0;

    const dayState = useMemo(
        () => (me ? buildStaffDayState(me, mine, data.presence, nowMinutes, elapsedSeconds, '', selectedISO) : null),
        [me, mine, data.presence, nowMinutes, elapsedSeconds, selectedISO],
    );

    /*
     * ADİSYON AÇIK (v4 · G4) — iş bitti, para alınmadı.
     *
     * Hangi adisyon ve tutarı KASA'NIN kaynağından (`useManagerDay`): Kasa'nın
     * turuncu şeridiyle aynı hesap, aynı rakam. Sağlayıcı kabuğun kendisinde
     * ve zaten okuyor — bu ekran fazladan sorgu atmıyor.
     *
     * Süren iş varken sorulmuyor: tasarımın sırası "süren ya da beklemedeki
     * iş, sonra açık adisyon, sonra sıradaki randevu".
     */
    const { events: flowEvents, businessName } = useManagerDay();
    const ticket = useMemo(
        () => (dayKnown && isToday && !runningRow ? soloOpenTicket(flowEvents, mine, selectedISO) : null),
        [dayKnown, isToday, runningRow, flowEvents, mine, selectedISO],
    );

    const todayCounts = useMemo(() => soloDayCounts(mine, nowMinutes), [mine, nowMinutes]);

    /*
     * G5 · HÂL KARTININ SEÇİCİSİ — yığının kartları, sırasıyla: süren işler
     * (G2/G3), açık adisyon (G4), başlatılabilirler (saati geçmiş olsa da
     * gelmedi sayılmamış olanlar). Kurallar `soloPickItems`te; tasarım
     * `docs/design-reference/Luera Mobil - Tek Kisilik G5 Secici.html`.
     *
     * Süren işler BİRDEN ÇOK olabilir: beklemedeyken (boya, krem) sıradakine
     * başlanabiliyor (G5 · Karar 3). Hepsi yığında; biri gizlenirse ona
     * dönmenin yolu kalmazdı.
     */
    const runningJobs = useMemo(
        () => (dayKnown && isToday
            ? mine
                .filter((row) => row.status !== 'cancelled' && Boolean(row.arrived_at) && !row.service_ended_at)
                .sort((a, b) => Date.parse(a.arrived_at ?? '') - Date.parse(b.arrived_at ?? ''))
            : []),
        [dayKnown, isToday, mine],
    );
    const pickItems = useMemo(
        () => (dayKnown && isToday
            ? soloPickItems({
                running: runningJobs,
                // BEKLEMEDE (v4 · G3): bu telefonda kumandanın son niyeti
                // varsa o (sinyal yokken kurulan bekleme de görünsün), yoksa
                // sunucunun damgası.
                waitOf: (job) => activeWait(job, waitIntentOf(job.id), serverNow),
                ticket,
                startable: soloStartable(mine, nowMinutes),
                nowMinutes,
                nowMs: serverNow,
            })
            : []),
        [dayKnown, isToday, runningJobs, ticket, mine, nowMinutes, serverNow],
    );

    /*
     * SEÇİM RANDEVUYA BAĞLI (G5 · Karar 2). Ekranda kalındıkça yeni randevu
     * gelse de süre geçse de aynı randevu seçili kalır — seçilen kişinin
     * altından kayması yanlış kişiyi başlatma riskiydi. Gün'den çıkılınca,
     * uygulama arka plandan dönünce ya da seçili randevu yığından düşünce
     * (başladı, gelmedi sayıldı, iptal) ilk karta dönülür.
     */
    const [pickedId, setPickedId] = useState<string | null>(null);
    // Seçili randevu yığından düştüyse seçim BIRAKILIYOR (render sırasında
    // türetme — effect'te değil): sonra yeniden başlatılabilir olsa da
    // (ör. "Geldi") kart kendiliğinden ona dönmesin.
    if (pickedId && !pickItems.some((item) => item.id === pickedId)) setPickedId(null);
    const pickIndex = soloPickIndex(pickItems, pickedId);
    useFocusEffect(useCallback(() => () => setPickedId(null), []));
    useEffect(() => {
        let previous = AppState.currentState;
        const sub = AppState.addEventListener('change', (next) => {
            if (previous.match(/inactive|background/) && next === 'active') setPickedId(null);
            previous = next;
        });
        return () => sub.remove();
    }, []);
    /** Seçici sürüklenirken sayfa kaymıyor (G5 · Karar 1). */
    const [picking, setPicking] = useState(false);

    /*
     * Yığın yokken (süren iş, adisyon, başlatılabilir — hiçbiri) tek kart:
     * kapanışa kalan süre ya da günün özeti; izin ve kapalı gün kendi kartını
     * söylüyor (personel durumunun kartı).
     */
    const idlePanel = dayState && pickItems.length === 0
        ? soloIdlePanel(dayState.kind, todayCounts, data.open, nowMinutes) ?? dayState.panel
        : null;

    /*
     * GÜN GERÇEKTEN BOŞ MU?
     *
     * `dayKnown` olmadan sorulmuyor: okunmamış bir günü boş göstermek, en
     * pahalı yalan. Üç kova birlikte bakılıyor — süren iş listede değil
     * kartta duruyor ve yalnız listeye bakmak dolu bir günü boş sayardı.
     */
    const dayEmpty = dayKnown
        && !dayState?.runningAppointment
        && (dayState?.upcomingAppointments.length ?? 0) === 0
        && (dayState?.pastAppointments.length ?? 0) === 0;

    /*
     * HİZMET SAYISI — TEMBEL ve BİR KEZ (v4 · S2).
     *
     * Yalnız boş günün cümlesini değiştiriyor, o yüzden yalnız gün boş
     * çıkınca okunuyor: dolu bir günde hiç sorulmuyor ve ilk cevaptan sonra
     * bir daha sorulmuyor. Uygulamanın en çok bakılan ekranına her odakta
     * dördüncü bir sorgu eklemek, bir cümle için ağır bir bedel olurdu.
     *
     * `null` kalırsa (okunamadı) normal cümle yazılıyor — okunamayan bir
     * sayıya dayanıp "hizmetiniz yok" demek, hizmetleri olan birine onları
     * yokmuş gibi göstermekti.
     */
    const [serviceCount, setServiceCount] = useState<number | null>(null);
    useEffect(() => {
        if (!dayEmpty || serviceCount !== null) return undefined;
        let alive = true;
        void fetchServices()
            .then((catalog) => { if (alive) setServiceCount(salonServicesOf(catalog).length); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [dayEmpty, serviceCount]);

    /*
     * Liste v4'ün kuralıyla kuruluyor: saat sırasında, süren iş varken
     * yalnız sıradakiler, bugün olmayan günde tek liste. Gerekçeler
     * `soloDayList`in başında.
     */
    const list = useMemo(
        () => soloDayList(dayState, mine, isToday, nowMinutes),
        [dayState, mine, isToday, nowMinutes],
    );

    /*
     * Alt başlık: bugün "bitti/kaldı", başka gün yalnız SAYI.
     * Gerekçesi `soloDaySubtitle`in içinde.
     */
    const subtitle = soloDaySubtitle(
        selectedISO,
        !dayKnown
            ? null
            : isToday
                ? todayCounts
                : soloDayTotal(mine),
    );

    /** Seçili kartın hapı: kumandayı aç (başlat, tahsil et, süren işe dön). */
    const openPicked = useCallback((index: number) => {
        const action = pickItems[index]?.action;
        if (!action) return;
        router.push({
            pathname: '/(staff-flow)/kumanda',
            // `from`: kumandanın geri okunun yazısı ("Gün") ve tahsilat
            // adımı. Mod değil, NEREDEN gelindiği: Kasa da `back` yolluyor.
            params: { id: action.appointmentId, from: 'tek' },
        });
    }, [pickItems, router]);

    const openAppointment = useCallback((appointment: Appt) => {
        router.push({ pathname: '/(manager-flow)/randevu/[id]', params: { id: appointment.id } });
    }, [router]);

    /*
     * EYLEM HAPI (G5 · A) — seçili kartın randevusunda. Akış'ın hapının
     * gözleri; tek kişiye göre iki fark:
     *   • Yaz KİŞİNİN KENDİ WhatsApp'ını hazır metinle açar (salonun hattı
     *     masaüstünden bağlanıyor; randevu kartının "Mesajla hatırlat"ı da
     *     böyle). Gecikmişse metin "yolda mısınız?".
     *   • Gelmedi Akış'la AYNI damga (098); kilit Gün'ün okumasından — kart
     *     neyi gösteriyorsa onu. Yazma tutunca canlı sinyal günü tazeliyor,
     *     kart yığından düşüyor. Geri almak: randevu kartında "Geldi".
     *   • Geldi'yi geri al (BEKLİYOR kartı) Akış'ın bekleme kartındaki
     *     "Geri al" ile aynı yazma: geliş damgası kalkar.
     * Sönük göz (numara yok) ve Randevu kartı gözü randevu kartını açar.
     */
    const onPickCell = useCallback((index: number, cell: CellKey) => {
        const item = pickItems[index];
        const appointment = mine.find((row) => row.id === item?.id);
        if (!item || !appointment) return;
        if (cell === 'kart' || item.menu?.off.includes(cell)) {
            openAppointment(appointment);
            return;
        }
        if (cell === 'ara') {
            const tel = dialable(appointment.customer_phone);
            if (tel) {
                Linking.openURL(`tel:${tel}`).catch(() => {
                    Alert.alert(CALL_FAILED, 'Telefonunuzun arama uygulaması açılamadı.');
                });
            }
            return;
        }
        if (cell === 'wa') {
            const late = nowMinutes - toMinutes(appointment.start_time) >= 1;
            const text = waNudgeText({ salon: businessName, time: appointment.start_time.slice(0, 5), late, day: 'bugün' });
            const url = waLink(appointment.customer_phone, text);
            if (url) {
                Linking.openURL(url).catch(() => {
                    Alert.alert(REMINDER_FAILED, 'Telefonunuzda WhatsApp ya da bir tarayıcı açılamadı.');
                });
            }
            return;
        }
        if (cell === 'nox' || cell === 'geri') {
            const lock = data.stamps.get(appointment.id);
            const patch = cell === 'nox'
                ? { no_show_at: new Date(Date.now() + data.clockOffset).toISOString() }
                : { customer_arrived_at: null };
            void (lock
                ? updateAppointment(appointment.id, lock, patch)
                : Promise.resolve({ ok: false as const, kind: 'stale' as const })
            ).catch(() => ({ ok: false as const, kind: 'failed' as const })).then((outcome) => {
                if (outcome.ok) return;
                Alert.alert(
                    cell === 'nox' ? 'Gelmedi kaydedilmedi' : 'Geldi geri alınmadı',
                    outcome.kind === 'stale'
                        ? 'Randevu bu arada değişmiş. Gün yenilendi; tekrar deneyin.'
                        : 'Bağlantı kesilmiş olabilir. Tekrar deneyin.',
                );
            });
        }
    }, [pickItems, mine, openAppointment, nowMinutes, businessName, data.stamps, data.clockOffset]);

    if (refusal) {
        const durum = orgDurum(refusal);
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
                <DurumBlock tone={durum.tone} title={durum.title} lines={durum.lines} actions={[]} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/*
              * EKRANIN SICAKLIĞI (v4 · Gün `{glow:1}` ile çiziliyor).
              *
              * Uygulamanın TEK gradyanı; müdür Takvim'i ve personel Bugün'ü
              * de aynı jetonu kullanıyor. Bu ekranda eksikti ve telefonda
              * görülen buydu: üstü düz siyah bir Gün, yanındaki Takvim ise
              * sıcak. İki ekran aynı üründen değilmiş gibi duruyordu.
              *
              * Güvenli alanın ÜSTÜNDEN başlıyor: durum çubuğunun arkası da
              * ısınmalı, yoksa parıltı başlığın altında bir şerit gibi
              * görünür.
              */}
            <LinearGradient
                pointerEvents="none"
                colors={dark ? glow.dark : glow.light}
                locations={glow.locations}
                style={[StyleSheet.absoluteFill, { height: glow.height + insets.top }]}
            />

            <View style={{ flex: 1, paddingTop: insets.top }}>
            <DayHeader dateISO={selectedISO} subtitle={subtitle} transparent />
            {/*
              * PERSONEL "BUGÜN"ÜN ŞERİDİ (v4 · G1: "personel-01/07'nin
              * ölçüsünde; şeritte bugün turuncu noktalı, pazar kapalı gün
              * olarak soluk").
              *
              * Takvimin şeridi (`WeekStrip`) "bugün" ile "seçili"yi ayırmıyor;
              * personelinki ayırıyor. Kapalı günler `open` ile aynı kaynaktan
              * (tek kişilik Takvim'in şeridi de aynı listeyi alıyor) — gün
              * okunamadıysa hiçbiri soluk çizilmiyor: bilinmeyen gün kapalı
              * gün değil.
              */}
            <StaffWeekStrip
                days={days.map((day) => day.date)}
                todayISO={todayISO()}
                selectedISO={selectedISO}
                counts={data.counts}
                offDays={dayKnown ? data.offDays : undefined}
                onSelect={setSelectedISO}
            />

            <ScrollView
                style={{ flex: 1 }}
                scrollEnabled={!picking}
                contentContainerStyle={{ paddingBottom: insets.bottom + staffDayMetrics.panelHeightMax }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void reload(); }} tintColor={c.tx3} />}
            >
                {/*
                  * OKUNAMADI, BOŞ GÜNDEN AYRI CÜMLE — ama AYNI ÇERÇEVEDE
                  * (v4 · B4).
                  *
                  * Elde veri varken sessizce bayat göstermek doğru (`stale`),
                  * ama hiç veri yokken "randevunuz yok" demek yanlış cümle:
                  * gün dolu olabilir ve ekran onu yok sayıyor olabilir.
                  *
                  * Müdürün sola yaslı `DurumUnread`u yerine boş hâl gövdesi:
                  * dört hâl (boş, kapalı, yükleniyor, okunamadı) aynı
                  * çerçevede duruyor ve biri ötekilere benzemezse ekran hata
                  * ânında başka bir uygulamaya dönüşüyor.
                  */}
                {state === 'error' && !dayKnown ? (
                    <View style={{ paddingTop: soloDayMetrics.voidTop }}>
                        <VoidBlock
                            copy={SOLO_UNREAD_COPY}
                            isToday={isToday}
                            nowMinutes={nowMinutes}
                            action={{ label: 'Tekrar dene', onPress: () => { void reload(); } }}
                        />
                    </View>
                ) : null}

                {/*
                  * YÜKLENİYOR — HENÜZ HİÇBİR ŞEY İDDİA ETMİYORUZ (v4 · B3).
                  *
                  * Tarih ve şerit gerçek (cihazdan biliniyor); özet sayısı,
                  * doluluk noktaları, hâl kartı ve kartlar iskelet. Veri
                  * gelmeden boş hâlin cümlesini çizmek, ekranın önce
                  * "randevu yok" deyip saniyeler sonra kendini yalanlaması
                  * olurdu.
                  */}
                {state === 'loading' && !dayKnown ? <SoloDaySkeleton /> : null}

                {/*
                  * BOŞ GÜNDE KART ÇİZİLMİYOR (v4 · B1).
                  *
                  * Hâl kartı günün o anki SATIRININ eylem kartı; satır yokken
                  * üzerinde iş yapılacak bir şey de yok. Boş günün eylemi
                  * sekme çubuğundaki Randevu, ekranın ortasındaki bir düğme
                  * değil.
                  *
                  * Müdür 24'ün `emptyNote`u da burada çizilmiyor: o cümleler
                  * salonu DIŞARIDAN anlatıyor ("Derya bugün hiç randevu
                  * almadı") ve bu modda muhatap Derya'nın kendisi.
                  */}
                {dayEmpty ? (
                    <View style={{ paddingTop: soloDayMetrics.voidTop }}>
                        <VoidBlock
                            copy={soloEmptyCopy(selectedISO, todayISO(), data.open, serviceCount, data.nextOpen)}
                            isToday={isToday}
                            nowMinutes={nowMinutes}
                        />
                    </View>
                ) : null}

                {/*
                  * HÂL KARTI YALNIZ BUGÜN (v4 · G1–G4 hepsi bugünün ekranı).
                  *
                  * Kart "ŞU AN BOŞ", "SÜRÜYOR", "BEKLEMEDE", "ADİSYON AÇIK"
                  * diyor; dördü de ŞU ANIN cümlesi. Dün seçiliyken "şu an boş, 9 sa 16 dk,
                  * 09:30'a kadar" yazıyordu — o gün çoktan yaşandı ve
                  * ekranın anlattığı an hiç var olmadı.
                  */}
                {!dayEmpty && isToday && pickItems.length > 0 ? (
                    <View style={{ paddingHorizontal: staffDayMetrics.lhdPadX }}>
                        <SoloPicker
                            items={pickItems}
                            index={pickIndex}
                            onSettle={(index) => setPickedId(pickItems[index]?.id ?? null)}
                            onOpen={openPicked}
                            onDrag={setPicking}
                            onCell={onPickCell}
                        />
                    </View>
                ) : null}
                {!dayEmpty && isToday && idlePanel ? (
                    <View style={{ paddingHorizontal: staffDayMetrics.lhdPadX }}>
                        <StaffHeroPanelCard panel={idlePanel} />
                    </View>
                ) : null}

                {!dayEmpty && list.title ? (
                    <StaffListHeaderView title={list.title} />
                ) : null}

                {/* Liste gövdesi (.gl): kartlar ve şimdi hapı tek ritimde. */}
                {dayEmpty ? null : (
                    <View style={{
                        paddingHorizontal: soloDayMetrics.listPadX,
                        paddingTop: soloDayMetrics.listPadTop,
                        gap: soloDayMetrics.listGap,
                    }}>
                        {list.rows.map((appointment, index) => (
                            <Fragment key={appointment.id}>
                                {/* Hap SAATE göre araya giriyor, kovaya göre değil. */}
                                {index === list.nowIndex ? (
                                    <SoloNowLine time={dayState?.nowLineTime ?? ''} />
                                ) : null}
                                <SoloAppointmentCard
                                    appointment={appointment}
                                    nowMinutes={nowMinutes}
                                    onOpen={openAppointment}
                                    selected={pickItems.length > 1 && pickItems[pickIndex]?.id === appointment.id}
                                />
                            </Fragment>
                        ))}
                    </View>
                )}
            </ScrollView>
            </View>
        </View>
    );
}
