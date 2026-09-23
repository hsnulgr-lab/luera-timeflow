import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AccessibilityInfo, Animated, Linking, PanResponder, RefreshControl, ScrollView, StyleSheet,
    useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader } from '../../src/components/CalendarParts';
import { addDaysISO, nowInMinutes, todayISO, toMinutes, type Appt } from '../../src/lib/calendar';
import { apiSource, forgetOrg } from '../../src/lib/managerSource';
import { authApi } from '../../src/api/session';
import { dialable } from '../../src/lib/phone';
import { WA_CONNECTED } from '../../src/lib/mockSend';
import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { orgDurum } from '../../src/lib/managerDurum';
import { STALE_LINE, STALE_TITLE, type WriteOutcome } from '../../src/lib/managerWriteMap';
import { sendStaffNudge, sendWaNudge } from '../../src/lib/managerWrite';
import { numberUsable, waNudgeText, type CellKey } from '../../src/lib/actionPill';
import { DayScrubber, scrubberInset } from '../../src/components/DayScrubber';
import {
    FlowDivider, FlowEnd, FlowRow, StaffStrip,
} from '../../src/components/FlowParts';
import {
    activeCountOf, applyFlowAction, applyNoshowAction, applyNudgeResult, applyPillAction, applySendResult,
    applyWaitAction, bookedEvent, cancelSend, headline, isLate, isNudgeLabel, nextInLineId, nowLineIndex,
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
import { LiveRow, type LiveMode } from '../../src/components/LiveRow';
import { useLiveList } from '../../src/lib/useLiveList';
import type { LiveDiff } from '../../src/lib/liveMotion';
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
/** Damganın saati — "son güncelleme 11:36". */
const clockAt = (ms: number) => {
    const at = new Date(ms);
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/** Canlı liste için satırın kimliği ve biçimi — modül düzeyinde: sabit referans. */
const flowIdOf = (event: FlowEvent) => event.id;
const flowShapeOf = (event: FlowEvent) => event.kind;

/** "Yeni randevu, 15:30, Deniz Arslan, cilt bakımı" — üçten fazlası sayıyla. */
function flowNewsText(added: readonly FlowEvent[], removed: readonly FlowEvent[]): string {
    const line = (event: FlowEvent) => [event.time, `${event.firstName} ${event.lastName}`.trim(), event.detail.split(' · ')[0]]
        .filter(Boolean).join(', ');
    const parts: string[] = [];
    if (added.length > 0) {
        parts.push(added.length <= 2
            ? added.map((event) => `Yeni randevu, ${line(event)}`).join('. ')
            : `${added.length} yeni randevu`);
    }
    if (removed.length > 0) {
        parts.push(removed.length <= 2
            ? removed.map((event) => `Randevu listeden çıktı, ${line(event)}`).join('. ')
            : `${removed.length} randevu listeden çıktı`);
    }
    return parts.join('. ');
}

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

    /**
     * Akış olayları SUNUCUDAN.
     *
     * Veritabanında karşılığı olan dokunuşlar GERÇEKTEN yazılıyor: "Geldi",
     * "Geç geldi", "Gelmedi" (098), geri almaları, "Onayla", "Reddet".
     * Karşılığı OLMAYAN hiçbir düğme yazıyormuş gibi yapmıyor:
     *   • Adisyon bekleyen kartta EYLEM YOK — tahsilat telefondan yapılmıyor
     *     (müdür kararı, 2026-09-17). Müdür tutarı ve bilgileri görür.
     *   • "Personele söyle" ARTIK GERÇEKTEN GÖNDERİYOR (2026-09-24):
     *     `staff-nudge` ucu personelin telefonuna bildirim düşürüyor ve damga
     *     ancak gönderim tuttuysa basılıyor.
     *   • "Beklemeye al" kaldırıldı — kimsenin okumadığı yerel bir işaretti.
     */
    const {
        events, replace, reload, write, stampNow, state, refusal, stale, at: readAt,
        presence, appointmentCount, businessName,
    } = useManagerDay();

    /**
     * Reddedilen yazmanın ekrandaki karşılığı — kart kapanmıyor, müdür neyin
     * olmadığını görüyor.
     */
    const [refused, setRefused] = useState<WriteOutcome | null>(null);



    /**
     * Reddin tek hamlesi — takvim ekranıyla AYNI karar: salon seçmesi gereken
     * müdürün oturumu DURUYOR, erişimi kaldırılmış müdürün oturumu kapanıyor.
     */
    const onRefusalAction = useCallback(async () => {
        if (refusal === 'ambiguous') {
            forgetOrg();
            router.push('/(auth)/manager/business');
            return;
        }
        await authApi.resume.signOut().catch(() => undefined);
        forgetOrg();
        router.replace('/(auth)/welcome');
    }, [refusal, router]);

    /**
     * Yazmayı dener; tutarsa yerel hâli uygular, tutmazsa HİÇBİR ŞEY
     * değişmez ve sebep söylenir. Önce yerel, sonra yazma DEĞİL: reddedilmiş
     * bir "Geldi"yi bir an için bile göstermek, personele gitmemiş bir
     * bildirimi gitmiş gibi gösterirdi.
     */
    const commit = useCallback(async (
        event: FlowEvent, next: FlowEvent, patch: Record<string, unknown>,
    ) => {
        if (!event.appointmentId) return false;
        setRefused(null);
        const outcome = await write(event.appointmentId, patch);
        if (!outcome.ok) {
            setRefused(outcome);
            return false;
        }
        replace(event.id, next);
        return true;
    }, [write, replace]);

    /**
     * "Personele söyle" — `commit`in bildirim karşılığı ve AYNI kuralı izliyor:
     * önce gönder, tutarsa damgayı bas.
     *
     * Metni sunucu kuruyor; buradan yalnız hangi randevu ve hangi kart olduğu
     * gidiyor. Telefondaki kopya bayat olabilir ve personele bayat bilgi
     * göndermek, hiç göndermemekten kötü.
     */
    const nudge = useCallback(async (event: FlowEvent, next: FlowEvent) => {
        if (!event.appointmentId) return;
        // Basış önce eski hatayı siliyor: kart, sonuç gelene kadar nötr durur.
        replace(event.id, next);
        const result = await sendStaffNudge({
            reservationId: event.appointmentId,
            kind: event.kind,
        });
        // Sonuç KARTIN KENDİ kayıt satırına yazılıyor. Ekranın tepesindeki bir
        // uyarı, listede aşağıdaki bir karta basan müdürün göremeyeceği yerde
        // kalırdı — damga basılmaz, sebep de görünmezdi.
        replace(event.id, applyNudgeResult(next, result));
    }, [replace]);

    /**
     * "Geldi"ye BU OTURUMDA basılan satır. Bekleme kartı yalnız o satırda geri
     * almayı gösterir; sunucudan gelen bir bekleme satırında geri alınacak bir
     * basış yok.
     */
    const [freshId, setFreshId] = useState<string | null>(null);

    const onAction = useCallback((event: FlowEvent, label: string) => {
        /*
         * "Yaz" penceresinde VAZGEÇMEK. Bu düğme çiziliyordu ama hiçbir şey
         * yapmıyordu: pencereyi kapatan `cancelSend` hiç çağrılmıyordu ve
         * mesaj beş saniye dolunca yine gidiyordu. İstek pencere içinde HİÇ
         * gitmediği için kapatmak iz bırakmıyor.
         */
        if (label === 'Geri al' && (event.sendingLeft ?? 0) > 0) {
            replace(event.id, cancelSend(event));
            return;
        }
        // "Karşılamayı aç" bir durum değişikliği değil, bir geçiş: randevuyu
        // açar. Masaüstünde de aynı kelime aynı işi yapıyor.
        if (label === 'Karşılamayı aç') {
            if (event.appointmentId) {
                router.push({
                    pathname: '/randevu/[id]',
                    params: { id: event.appointmentId, date: todayISO() },
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
                    date: todayISO(),
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

        const markFresh = () => {
            if (['Geldi', 'Gelmedi', 'Geç geldi', 'Onayla'].includes(label)) setFreshId(event.id);
            else if (label === 'Geri al') setFreshId((id) => (id === event.id ? null : id));
        };

        // ── Veritabanında karşılığı OLAN dokunuşlar ──────────────────────────
        if (event.kind === 'next' && label === 'Geldi') {
            // Damga SUNUCU saatiyle: cihazın saati yanlışsa bekleme süresi
            // de yanlış hesaplanırdı.
            void commit(event, next, { customer_arrived_at: stampNow() }).then((ok) => { if (ok) markFresh(); });
            return;
        }
        if (event.kind === 'noshow' && label === 'Geç geldi') {
            // Geldi damgası + "gelmedi" kararı temizleniyor (098). Geldi damgası
            // tek başına da yeterdi (okuma kuralı onu önce soruyor), ama
            // kalan bir karar masaüstünün kayıt geçmişinde yanlış okunurdu.
            void commit(event, next, { customer_arrived_at: stampNow(), no_show_at: null })
                .then((ok) => { if (ok) markFresh(); });
            return;
        }
        /*
         * "GELMEDİ" ARTIK BİR DAMGA (098).
         *
         * Eskiden yalnız telefonda bir işaretti: yenileyince randevu yeniden
         * "sıradaki" oluyor, masaüstü "Onaylandı" demeye devam ediyordu.
         */
        if (event.kind === 'next' && label === 'Gelmedi') {
            void commit(event, next, { no_show_at: stampNow() }).then((ok) => { if (ok) markFresh(); });
            return;
        }
        if (event.kind === 'noshow' && label === 'Geri al') {
            void commit(event, next, { no_show_at: null }).then((ok) => { if (ok) markFresh(); });
            return;
        }
        if (event.kind === 'arrived' && label === 'Geri al') {
            void commit(event, next, { customer_arrived_at: null }).then((ok) => { if (ok) markFresh(); });
            return;
        }
        if (event.kind === 'booked' && label === 'Onayla') {
            void commit(event, next, { status: 'confirmed' }).then((ok) => { if (ok) markFresh(); });
            return;
        }

        // ── Personele bildirim ───────────────────────────────────────────────
        // Damga ancak GERÇEKTEN gönderildiyse basılıyor. Önce basıp sonra
        // göndermek, gitmemiş bir bildirimi "söylendi" diye göstermek olurdu.
        if (isNudgeLabel(label)) {
            void nudge(event, next);
            return;
        }

        // ── Yazması SONRA yapılanlar ─────────────────────────────────────────
        // "Reddet": 5 sn'lik pencere açılıyor, yazma pencere dolunca (aşağıda).
        markFresh();
        replace(event.id, next);
    }, [router, replace, commit, stampNow, nudge]);


    const openAppointment = useCallback((event: FlowEvent) => {
        if (!event.appointmentId) return;
        router.push({
            pathname: '/randevu/[id]',
            params: { id: event.appointmentId, date: todayISO() },
        });
    }, [router]);

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
        if ((cell === 'ara' || cell === 'wa') && !numberUsable(event.customerPhone, event.waResult)) {
            // SÖNÜK göz: numara yok/geçersiz. Telefondan düzeltilmiyor; randevu
            // kartı numarayı ve müşteriyi gösteriyor.
            openAppointment(event);
            return;
        }
        if (cell === 'ara') {
            const phone = dialable(event.customerPhone);
            if (phone) void Linking.openURL(`tel:${phone}`);
        }
        const next = applyPillAction(event, cell);
        if (!next) return;
        if (cell === 'nox') {
            // Haptaki "Gelmedi" de kartınkiyle AYNI yazma (098).
            void commit(event, next, { no_show_at: stampNow() }).then((ok) => { if (ok) setFreshId(event.id); });
            return;
        }
        if (cell === 'inf') {
            // Bekleme kartındaki "Personele söyle" ile AYNI kanal ve aynı
            // dürüstlük kuralı: damga gönderim başarılıysa.
            void nudge(event, next);
            return;
        }
        replace(event.id, next);
    }, [replace, commit, stampNow, openAppointment, nudge]);

    /**
     * Gönderim penceresi — 5 saniye geri sayar, sonra SALONUN numarasından
     * hazır metni gönderir (Müdür 34 · v2).
     *
     * Pencere içinde istek HİÇ GİTMEZ; "Geri al" onu iz bırakmadan kapatır.
     * Pencere dolunca eskiden müdürün kendi WhatsApp'ı metinsiz açılıyordu:
     * müdür uygulamadan çıkıyor, mesajı elle yazıyor ve kart sonucu bilmiyordu.
     * Şimdi sunucunun GERÇEK sonucu kartın kayıt satırına yazılıyor.
     */
    useEffect(() => {
        const sending = events.filter((event) => (event.sendingLeft ?? 0) > 0);
        const rejecting = events.filter((event) => (event.rejectedLeft ?? 0) > 0);
        if (sending.length === 0 && rejecting.length === 0) return;
        const id = setTimeout(() => {
            for (const event of sending) {
                const left = (event.sendingLeft ?? 0) - 1;
                if (left > 0) { replace(event.id, { ...event, sendingLeft: left }); continue; }
                /*
                 * ÖNCE pencere kapanıyor, SONRA istek gidiyor. Ters sırada
                 * cevap beklenirken sayaç bir kez daha dönerdi ve aynı mesaj
                 * müşteriye İKİ KEZ giderdi.
                 */
                const inFlight = { ...event, sendingLeft: undefined };
                replace(event.id, inFlight);
                const text = waNudgeText({
                    salon: businessName,
                    time: event.time,
                    late: event.kind === 'noshow' || isLate(event.etaMinutes),
                });
                void sendWaNudge({
                    phone: event.customerPhone ?? '',
                    text,
                    customerId: event.customerId ?? null,
                }).then((result) => replace(event.id, applySendResult(inFlight, result)));
            }
            /*
             * Reddetme penceresi dolunca randevu GERÇEKTEN iptal ediliyor.
             * Masaüstündeki iptalle aynı yazma: sunucu tarafındaki bekleme
             * listesi bildirimi de oradan tetikleniyor.
             */
            for (const event of rejecting) {
                const left = (event.rejectedLeft ?? 0) - 1;
                if (left > 0) { replace(event.id, { ...event, rejectedLeft: left }); continue; }
                const cleared = { ...event, rejectedLeft: undefined };
                void commit(event, { ...cleared, kind: 'cancelled' }, { status: 'cancelled' })
                    .then((ok) => {
                        // Yazma tutmadıysa pencere kapanıp randevu OLDUĞU gibi kalıyor.
                        if (!ok) replace(event.id, cleared);
                    });
            }
        }, 1000);
        return () => clearTimeout(id);
    }, [events, replace, commit, businessName]);


    /**
     * Bekleyen bir satır işleme dönüştüğünde onu "taze" işaretler — canlı kart
     * o zaman dönüşerek girer. Diff burada yapılıyor çünkü `setEvents`
     * güncelleyicisi saf kalmalı: React onu iki kez çağırabilir.
     */
    const kinds = useRef(new Map<string, FlowEvent['kind']>());
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
     * uygulamanın donduğu izlenimi verir. Yenileme sunucuyu gerçekten yeniden
     * okur; müdürün kendi ekranındaki işaretler ("Gelmedi") sıfırlanır.
     */
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(() => {
        setRefreshing(true);
        reload();
        setFreshId(null);
        setRefreshing(false);
    }, [reload]);

    /** ⋮ — o olayın randevusunu açar. Randevusu olmayan olayda çizilmez. */
    // Cetvelin seçtiği gün. Bugün canlı olay akışı, başka gün o günün
    // randevuları — ikisi de veritabanından.
    const [selectedISO, setSelectedISO] = useState(() => todayISO());
    const people = useMemo(() => sortPresence(presence), [presence]);

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
    const isToday = selectedISO === todayISO();

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
        apiSource.day(selectedISO)
            .then((list) => { if (alive) setOtherDay(list); })
            // Okunamayan gün ELDEKİ listeyi bozmuyor; boş güne çevrilmiyor.
            .catch(() => undefined);
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
                presence.find((person) => person.id === appointment.staff_id)?.name,
            ));
    }, [isToday, events, otherDay, presence]);

    // Şerit ve özet ŞU ANIN gerçeği — başka bir gün seçiliyken anlamsızlar.
    // Bugünün cirosunu "14 Ağustos" başlığı altında göstermek yalan olurdu.
    const weekday = new Date(`${selectedISO}T00:00:00Z`)
        .toLocaleDateString('tr-TR', { weekday: 'long', timeZone: 'UTC' });
    // "Kaç işlem sürüyor" ŞERİTTEN türer, ayrı tutulmaz.
    /*
     * Bugünün alt başlığı ÜÇ hâli ayırıyor. Okunamayan bir gün
     * "0 randevu" diye yazılsaydı müdür salonun boş olduğunu sanardı.
     * Bayatsa sayının yerini son okumanın saati alıyor.
     */
    const subtitle = !isToday ? weekday
        : state === 'error' ? `${weekday} · okunamadı`
            : state === 'loading' && events.length === 0 ? weekday
                : stale && readAt !== null
                    ? `${weekday} · son güncelleme ${clockAt(readAt)}`
                    : headline(weekday, appointmentCount, activeCountOf(people));
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


    /*
     * BUGÜN BİLİNMİYORSA boş gün DEĞİL.
     *
     * Veri gelmeden olay listesi boş ve ekran bunu Müdür 22'nin "boş gün"
     * tasarımıyla çiziyordu — okunamayan ya da henüz okunmamış bir günü boş
     * gün diye göstermek. Bilinmeyen gün boş gün düzenine hiç girmiyor.
     */
    const todayUnknown = isToday && state !== 'ok' && events.length === 0;
    const isEmptyDay = !todayUnknown && dayEvents.length === 0;

    /*
     * CANLI DEĞİŞİM (B-canli-degisim, yalnız hareket ve güvenlik kısmı).
     * Yalnız BUGÜN ve liste okunmuşken: başka gün canlı değil, ilk okuma
     * bir olay değil. Biçim = kart türü; türü değişen satırın yüksekliği
     * değişebilir, o yüzden parmak ekrandayken bekletilir.
     */
    const rowTop = useRef(new Map<string, number>());
    const rowBottom = useRef(new Map<string, number>());
    /** Görünen alanın üst kenarı, içerik koordinatında (B2 kararı için). */
    const offsetY = useRef(0);
    /*
     * B2 · Değişen her satır görünen alanın ÜSTÜNDEyse parmak ekrandayken de
     * beklemeden girer: kaydırma sabitleme onu aynı karede düzeltiyor.
     * Eklenen satırın yeri, listede ondan sonra gelen (zaten çizilmiş) satır.
     */
    const trackOffset = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offsetY.current = e.nativeEvent.contentOffset.y;
    }, []);
    const aboveView = useCallback((diff: LiveDiff, next: readonly FlowEvent[]) => {
        const top = offsetY.current;
        for (const id of [...diff.removed, ...diff.reshaped]) {
            const bottom = rowBottom.current.get(id);
            if (bottom == null || bottom > top) return false;
        }
        for (const id of diff.added) {
            const at = next.findIndex((event) => event.id === id);
            const after = next.slice(at + 1).find((event) => !diff.added.has(event.id) && rowTop.current.has(event.id));
            const y = after ? rowTop.current.get(after.id) : undefined;
            if (y == null || y > top) return false;
        }
        return true;
    }, []);
    const live = useLiveList(dayEvents, {
        scope: selectedISO,
        idOf: flowIdOf,
        shapeOf: flowShapeOf,
        reduceMotion,
        enabled: isToday && state === 'ok',
        safeWhileTouching: aboveView,
    });

    // Sesli okuma: gelen ve giden satır BİR KEZ duyurulur; alan değişiklikleri
    // sessiz — art arda konuşma ekran okuyucuyu kullanılmaz yapar.
    useEffect(() => {
        const text = flowNewsText(live.news.added, live.news.removed);
        if (text) AccessibilityInfo.announceForAccessibility(text);
    }, [live.news]);
    const modeOf = (event: FlowEvent): LiveMode => (
        live.leaving.has(event.id) ? 'leave'
            : live.entering.has(event.id) ? 'enter'
                // Elle basılan "Gelmedi" 5 sn kartıyla kalıyor; o anın kendi
                // hareketi var. Takas yalnız kendiliğinden düşen randevuda.
                : live.reshaped.has(event.id) && event.kind === 'noshow' && event.id !== freshId ? 'swap'
                    : 'still'
    );
    const platePermanent = plateIsPermanent(isEmptyDay, isToday);
    const canScroll = scrollEnabledOnDay(isEmptyDay, isToday);
    const blank = emptyDayCopy(selectedISO, todayISO());
    const pedal = dayPedal(selectedISO, todayISO());

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
        // `contentInsetAdjustmentBehavior="automatic"` yüzünden en üst konum
        // 0 değil `-insets.top`; taban da o.
        const y = Math.max(-insets.top, top - viewport.current * 0.66 - insets.top);
        // Programla kaydırma sürükleme olayı üretmiyor; B2 konumu burada da tutuluyor.
        offsetY.current = y;
        scroller.current?.scrollTo({ y, animated: false });
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
    /*
     * GÜN de taşınıyor. Taşınmayınca personel günü ekranı hep BUGÜNÜ
     * çiziyordu: müdür şeritte yarını seçip bir avatara dokunduğunda bugünün
     * randevularını görüyor ve farkı anlamıyordu.
     */
    const openStaff = (staffId: string) => router.push({
        pathname: '/personel/[id]',
        params: { id: staffId, date: selectedISO },
    });

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
                // B2 kararı için kaydırma konumu: parmak bir kartın üstünde
                // dururken geçerli olan, son kaydırmanın bittiği yer.
                onScrollBeginDrag={trackOffset}
                onScrollEndDrag={trackOffset}
                onMomentumScrollEnd={trackOffset}
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
                /*
                 * KAYDIRMA SABİTLEME: görünen alanın ÜSTÜNE eklenen satır,
                 * eklendiği karede kaydırma konumuna eklenir — parmağın
                 * altındaki kart 0 pt oynar. Bir hareket değil, bir düzeltme.
                 */
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                {...live.touchProps}
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

                {/*
                  * BUGÜN BİLİNMİYORSA söyleniyor — boş gün çizilmiyor.
                  * Sıra önemli: red, okunamamadan ÖNCE. Birinde beklemek bir
                  * seçenek, ötekinde değil.
                  */}
                {isToday && refusal ? (
                    <DurumBlock
                        tone={orgDurum(refusal).tone}
                        title={orgDurum(refusal).title}
                        lines={orgDurum(refusal).lines}
                        actions={[{
                            label: orgDurum(refusal).action.label,
                            onPress: () => { void onRefusalAction(); },
                        }]}
                        style={{ marginHorizontal: 16, marginBottom: 16 }}
                    />
                ) : todayUnknown && state === 'error' ? (
                    <DurumUnread
                        what="Bugünün akışını"
                        notMeaning="Salonun boş olduğu"
                        onRetry={reload}
                        style={{ paddingHorizontal: 16 }}
                    />
                ) : null}

                {/* Tutmayan yazma: hiçbir şey değişmedi, sebebi burada. */}
                {refused && !refused.ok ? (
                    <DurumBlock
                        tone={refused.kind === 'stale' ? 'amber' : 'red'}
                        title={
                            refused.kind === 'stale' ? STALE_TITLE
                                : refused.kind === 'paused' ? 'Değişiklik şimdilik alınmıyor'
                                    : 'Değişiklik uygulanmadı'
                        }
                        lines={[
                            refused.kind === 'stale' ? STALE_LINE
                                : refused.kind === 'conflict' ? refused.message
                                    : refused.kind === 'paused' ? 'Kısa bir süre sonra tekrar deneyin.'
                                        : 'Bağlantı kesilmiş olabilir. Tekrar deneyin.',
                        ]}
                        actions={[{
                            label: 'Anladım',
                            onPress: () => {
                                setRefused(null);
                                // Bayat kilitte güncel hâl getiriliyor.
                                if (refused.kind === 'stale') reload();
                            },
                        }]}
                        style={{ marginHorizontal: 16, marginBottom: 16 }}
                    />
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

                {live.shown.map((event, index) => (
                    <LiveRow
                        key={event.id}
                        mode={modeOf(event)}
                        onLayout={(e) => {
                            const { y, height } = e.nativeEvent.layout;
                            rowTop.current.set(event.id, y);
                            rowBottom.current.set(event.id, y + height);
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
                    </LiveRow>
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
                        todayISO={todayISO()}
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
