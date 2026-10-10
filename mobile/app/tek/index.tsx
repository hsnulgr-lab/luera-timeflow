import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader, WeekStrip } from '../../src/components/CalendarParts';
import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { VoidBlock } from '../../src/components/EmptyDayParts';
import { SoloAppointmentCard, SoloNowLine } from '../../src/components/SoloDayParts';
import {
    StaffHeroPanelCard,
    StaffListHeaderView,
} from '../../src/components/StaffDayParts';
import { nowInMinutes, todayISO, weekDays, type Appt } from '../../src/lib/calendar';
import { useManagerCalendarDay } from '../../src/lib/managerCalendarDay';
import { orgDurum } from '../../src/lib/managerDurum';
import { soloDaySubtitle, soloEmptyCopy } from '../../src/lib/soloDay';
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
 * ── Henüz YOK ───────────────────────────────────────────────────────────────
 * Hâl kartının eylem hapı (Başlat · Kumandayı aç). Kart dokunulabilir
 * olmasına hazır (`StaffHeroPanelCard`'ın `action`ı), ama kumanda yolu
 * bağlanmadan hap çizilmiyor: dokunulduğunda hiçbir şey yapmayan bir
 * kontrol, olmayan bir kontrolden kötü.
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

    const subtitle = soloDaySubtitle(
        selectedISO,
        dayKnown && dayState
            ? {
                done: dayState.pastAppointments.length,
                left: dayState.upcomingAppointments.length + (dayState.runningAppointment ? 1 : 0),
            }
            : null,
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
                  * OKUNAMADI, BOŞ GÜNDEN AYRI ÇİZİLİYOR.
                  *
                  * Elde veri varken sessizce bayat göstermek doğru (`stale`),
                  * ama hiç veri yokken "randevunuz yok" demek yanlış cümle:
                  * gün dolu olabilir ve ekran onu yok sayıyor olabilir.
                  */}
                {state === 'error' && !dayKnown ? (
                    <DurumUnread
                        what="Gününüzü"
                        notMeaning="Randevunuz olmadığı"
                        onRetry={() => { void reload(); }}
                    />
                ) : null}

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
                    <VoidBlock
                        copy={soloEmptyCopy(selectedISO, todayISO(), data.open)}
                        isToday={isToday}
                        nowMinutes={nowMinutes}
                    />
                ) : null}

                {!dayEmpty && dayState?.panel ? (
                    <View style={{ paddingHorizontal: staffDayMetrics.lhdPadX }}>
                        <StaffHeroPanelCard panel={dayState.panel} />
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
