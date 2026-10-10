import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader, WeekStrip } from '../../src/components/CalendarParts';
import { DurumBlock } from '../../src/components/Durum';
import { VoidBlock } from '../../src/components/EmptyDayParts';
import { SoloAppointmentCard, SoloDaySkeleton, SoloNowLine } from '../../src/components/SoloDayParts';
import {
    StaffHeroPanelCard,
    StaffListHeaderView,
} from '../../src/components/StaffDayParts';
import { nowInMinutes, todayISO, weekDays, type Appt } from '../../src/lib/calendar';
import { useManagerCalendarDay } from '../../src/lib/managerCalendarDay';
import { fetchServices } from '../../src/lib/managerSource';
import { salonServicesOf } from '../../src/lib/settingsMap';
import { orgDurum } from '../../src/lib/managerDurum';
import { SOLO_UNREAD_COPY, soloDaySubtitle, soloEmptyCopy, soloPanelAction } from '../../src/lib/soloDay';
import { buildStaffDayState } from '../../src/lib/staffDay';
import { soloDayMetrics, staffDayMetrics, useTheme } from '../../src/theme';

/**
 * Tek kişilik · GÜN (108).
 *
 * Üç mevcut ekranın harmanı, yeni bir tasarım değil:
 *
 *   • Başlık ve hafta şeridi — personel "Bugün" (`DayHeader`, `WeekStrip`)
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
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [selectedISO, setSelectedISO] = useState(() => todayISO());
    const { state, data, refusal, reload } = useManagerCalendarDay(selectedISO);
    const days = useMemo(() => weekDays(selectedISO), [selectedISO]);

    /*
     * Dakika başı ilerliyor. Saniyede bir değil: ekrandaki her şey dakika
     * çözünürlüğünde (şimdi çizgisi, geçmiş/gelecek ayrımı) ve saniyelik
     * yeniden çizim bedava değil.
     */
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        const id = setInterval(() => setNowMinutes(nowInMinutes()), 30_000);
        return () => clearInterval(id);
    }, []);

    const isToday = selectedISO === todayISO();
    const dayKnown = state === 'ok';

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

    const dayState = useMemo(
        () => (me ? buildStaffDayState(me, mine, data.presence, nowMinutes, (me.minutes ?? 0) * 60, '', selectedISO) : null),
        [me, mine, data.presence, nowMinutes, selectedISO],
    );

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

    const subtitle = soloDaySubtitle(
        selectedISO,
        dayKnown && dayState
            ? {
                done: dayState.pastAppointments.length,
                left: dayState.upcomingAppointments.length + (dayState.runningAppointment ? 1 : 0),
            }
            : null,
    );

    /*
     * Hap neyin üstünde çalışacak: süren iş, yoksa sıradaki.
     * Hiçbiri yoksa `null` ve kart hapsız kalıyor.
     */
    const panelAction = useMemo(
        () => (dayKnown && isToday && dayState
            ? soloPanelAction(dayState.runningAppointment, dayState.upcomingAppointments[0] ?? null)
            : null),
        [dayKnown, isToday, dayState],
    );

    const openAppointment = useCallback((appointment: Appt) => {
        router.push({ pathname: '/(manager-flow)/randevu/[id]', params: { id: appointment.id } });
    }, [router]);

    if (refusal) {
        const durum = orgDurum(refusal);
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
                <DurumBlock tone={durum.tone} title={durum.title} lines={durum.lines} actions={[]} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <DayHeader dateISO={selectedISO} subtitle={subtitle} transparent />
            <WeekStrip
                days={days}
                selectedISO={selectedISO}
                counts={data.counts}
                onSelect={setSelectedISO}
            />

            <ScrollView
                style={{ flex: 1 }}
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
                            copy={soloEmptyCopy(selectedISO, todayISO(), data.open, serviceCount)}
                            isToday={isToday}
                            nowMinutes={nowMinutes}
                        />
                    </View>
                ) : null}

                {!dayEmpty && dayState?.panel ? (
                    <View style={{ paddingHorizontal: staffDayMetrics.lhdPadX }}>
                        <StaffHeroPanelCard
                            panel={dayState.panel}
                            action={panelAction ? {
                                label: panelAction.label,
                                tone: panelAction.tone,
                                onPress: () => router.push({
                                    pathname: '/(staff-flow)/kumanda',
                                    // `from`: kumandanın geri okunun yazısı.
                                    // Orada `useInSoloShell()` çalışmıyor —
                                    // o ekran `(staff-flow)` segmentinde.
                                    params: { id: panelAction.appointmentId, from: 'tek' },
                                }),
                            } : undefined}
                        />
                    </View>
                ) : null}

                {!dayEmpty && dayState?.listTitle ? (
                    <StaffListHeaderView title={dayState.listTitle} />
                ) : null}

                {/* Liste gövdesi (.gl): kartlar ve şimdi hapı tek ritimde. */}
                {dayEmpty ? null : (
                    <View style={{
                        paddingHorizontal: soloDayMetrics.listPadX,
                        paddingTop: soloDayMetrics.listPadTop,
                        gap: soloDayMetrics.listGap,
                    }}>
                        {dayState?.pastAppointments.map((appointment) => (
                            <SoloAppointmentCard
                                key={appointment.id}
                                appointment={appointment}
                                nowMinutes={nowMinutes}
                                onOpen={openAppointment}
                            />
                        ))}

                        {/* Şimdi hapı YALNIZ bugün: başka günün altında yalan olur. */}
                        {dayState?.showNowLine && isToday ? (
                            <SoloNowLine time={dayState.nowLineTime} />
                        ) : null}

                        {dayState?.upcomingAppointments.map((appointment) => (
                            <SoloAppointmentCard
                                key={appointment.id}
                                appointment={appointment}
                                nowMinutes={nowMinutes}
                                onOpen={openAppointment}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
