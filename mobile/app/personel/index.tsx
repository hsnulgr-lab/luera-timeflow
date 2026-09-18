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

import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayHeader } from '../../src/components/CalendarParts';
import { AppointmentCard, NowLineSlot } from '../../src/components/AppointmentCard';
import { StaffWeekStrip } from '../../src/components/StaffWeekStrip';
import { formatDayMonth, todayISO } from '../../src/lib/calendar';
import { cardState, nowLineAfter, stripDays } from '../../src/lib/staffCard';
import { clockOf, demoAgenda, demoAgendaFor } from '../../src/lib/staffDemo';
import { DurumBand, DurumBlock, DurumUnread } from '../../src/components/Durum';
import { useFailedWrites } from '../../src/lib/failedWrites';
import { failureAdvice, failureLine, failureTitle } from '../../src/lib/writeFailure';
import { isStale, useAgenda } from '../../src/lib/agendaSource';
import { LIVE_AUTH } from '../../src/api/session';
import { feedback } from '../../src/lib/feedback';
import { font, glow, useTheme } from '../../src/theme';
import { LiveRow } from '../../src/components/LiveRow';
import { useLiveList } from '../../src/lib/useLiveList';
import type { StaffCardState } from '../../src/lib/staffCard';

/** Canlı liste için kimlik ve biçim — modül düzeyinde: sabit referans. */
type StaffRow = {
    appointment: { id: string; start_time: string; customer_name: string; service: string };
    state: StaffCardState;
};
const staffRowId = (row: StaffRow) => row.appointment.id;
const staffRowShape = (row: StaffRow) => row.state.kind;

/** "Yeni randevu, 15:30, Deniz Arslan, cilt bakımı" — üçten fazlası sayıyla. */
function staffNewsText(added: readonly StaffRow[], removed: readonly StaffRow[]): string {
    const line = ({ appointment: a }: StaffRow) => [a.start_time.slice(0, 5), a.customer_name, a.service]
        .map((part) => part?.trim()).filter(Boolean).join(', ');
    const parts: string[] = [];
    if (added.length > 0) {
        parts.push(added.length <= 2
            ? added.map((row) => `Yeni randevu, ${line(row)}`).join('. ')
            : `${added.length} yeni randevu`);
    }
    if (removed.length > 0) {
        parts.push(removed.length <= 2
            ? removed.map((row) => `Randevu listeden çıktı, ${line(row)}`).join('. ')
            : `${removed.length} randevu listeden çıktı`);
    }
    return parts.join('. ');
}

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
    const { c, dark, reduceMotion } = useTheme();
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
    const { state: agendaState, rows: agenda, at: readAt, reload } = useAgenda(dateISO, today);

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
    // Şimdi çizgisi KİMLİĞE bağlı: gösterilen listede sönen bir kart araya girebilir.
    const lineAfterId = lineAfter >= 0 ? agenda[lineAfter]?.id ?? null : null;
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
     * o kart yuva açarak yerinde beliriyor (kartın kendi hareketi). İlk
     * çizimde hiçbir kart "yeni" sayılmaz, gün değişince de sayılmaz.
     *
     * CANLI DEĞİŞİM (B-canli-degisim): aynı karar artık `useLiveList`te —
     * tek tazelemede 4+ değişiklik varsa hiçbiri hareket etmez, parmak
     * ekrandayken yükseklik değiştiren tazeleme bekler, giden kart söner.
     * Liste OKUNMADAN karşılaştırma yapılmıyor: asenkron ilk tur boş listeyle
     * çalışıyordu ve gerçek liste gelince BÜTÜN kartlar yeni sayılıyordu.
     */
    const live = useLiveList(rows, {
        scope: dateISO,
        idOf: staffRowId,
        shapeOf: staffRowShape,
        reduceMotion,
        enabled: agendaState === 'ok',
    });

    // Sesli okuma: gelen ve giden kart BİR KEZ duyurulur.
    useEffect(() => {
        const text = staffNewsText(live.news.added, live.news.removed);
        if (text) AccessibilityInfo.announceForAccessibility(text);
    }, [live.news]);

    // Gelmeyen müşteri ne "bitti" ne "kaldı": ayrı sayılır, yoksa düşmüş iki
    // randevu "2 iş bitti" diye sayılırdı.
    const noshow = rows.filter((row) => row.state.kind === 'noshow').length;
    const done = rows.filter((row) => row.state.kind !== 'noshow'
        && (row.state.dim > 0 || row.state.kind === 'unbilled')).length;
    const left = rows.length - done - noshow;
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
                // `cached`te sayılar UYDURMA DEĞİL: kopyanın çekildiği anda
                // gerçekti. Şerit ne zaman çekildiğini söylüyor; başlıkta
                // ikinci bir uyarı kurmak aynı şeyi iki kez söylemek olurdu.
                : rows.length === 0
            ? 'randevu yok'
            : isToday
                ? [`${done} iş bitti`, noshow > 0 ? `${noshow} gelmedi` : null, `${left} kaldı`].filter(Boolean).join(', ')
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
                // Üste eklenen kart parmağın altındaki kartı oynatmaz.
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                {...live.touchProps}
            >
                <DayHeader dateISO={dateISO} subtitle={subtitle} transparent fadeSubtitle />

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

                {/* GÖNDERİLEMEYENLER — listenin üstünde, çünkü günü okumadan
                    önce bilinmesi gereken şey bu.

                    Kayıp ARKA PLANDA doğuyor: kuyruk sinyal gelince ya da
                    uygulama öne dönünce boşalıyor ve o an personel başka bir
                    ekranda olabilir. Bu yüzden geçici bir bildirim değil,
                    KABUL EDİLENE KADAR duran bir blok — ve diskte yaşıyor,
                    uygulama kapansa da duruyor.

                    Bugün ekranı seçildi çünkü personelin yaşadığı yer burası;
                    kumandaya koymak, kaybı yalnız o ziyarete dönen kişiye
                    göstermek olurdu. */}
                <FailedWrites />

                {/* SON GÜNCELLEME — yalnız bayatken.
                    Liste tek sefer okunuyor; yoklama da yok, ön plana dönünce
                    yenileme de. Sabah açılan ekran öğlene kadar donuk kalıyor
                    ve bugüne kadar bunun ekranda hiçbir izi yoktu: personel
                    iki saatlik bir listeye bakıp "boş" diye karar verebilirdi.

                    Taze veride satır ÇİZİLMİYOR. Okumanın üstünden bir saniye
                    geçmişken "son güncelleme 09:14" yazmak bilgi değil gürültü;
                    kişi zaten listenin geldiğini gördü. Satır, ancak bilgi
                    taşıdığı an beliriyor.

                    Aynı satır yenileme yolu da: başarılı bir listeyi elle
                    tazelemenin BAŞKA yolu yok — `reload` yalnız hata
                    ekranındaki düğmeye bağlıydı. */}
                {/* ÇEVRİMDIŞI KOPYA — canlı liste değil ve bunu söylemek
                    zorunda. Aşağıdaki "son güncelleme" satırının YERİNE
                    geçiyor: ikisi de amber ve ikisi de tazelikten söz ediyor,
                    yan yana durmaları hangisinin ne dediğini bulandırırdı. */}
                {agendaState === 'cached' && readAt !== null ? (
                    <CachedBand at={readAt} onRetry={reload} />
                ) : null}

                {agendaState === 'ok' && isStale(readAt, now) ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Liste ${clockOf(readAt as number)}'ten beri yenilenmedi. Yenilemek için dokunun.`}
                        onPress={() => { feedback.selection(); reload(); }}
                        style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            alignSelf: 'flex-start',
                            marginLeft: 16,
                            marginBottom: 12,
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <View style={{
                            width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.am,
                        }} />
                        <Text style={{ color: c.tx2, fontSize: 12.5, fontWeight: '500' }}>
                            Son güncelleme {clockOf(readAt as number)}
                        </Text>
                        <Text style={{ color: c.tx, fontSize: 12.5, fontWeight: '700' }}>
                            Yenile
                        </Text>
                    </Pressable>
                ) : null}

                {/* Çizgi listenin başında da durabilir: gün henüz başlamadıysa
                    ilk kartın üstünde. Yuva her konumda var, yalnız biri açık —
                    böylece çizgi kartın üstünden GEÇMİYOR, boşluktan boşluğa
                    taşınıyor. */}
                <NowLineSlot active={lineAfter < 0} time={clockOf(now)} />

                {agendaState === 'error' ? (
                    /* OKUNAMADI — "randevu yok" DEĞİL. Gövde beş ekranda
                       tekrarlanan koddan tek bileşene indi (`DurumUnread`) ve
                       düğme turun ölçüsüne çıktı: 40 → 52 pt. Durum
                       ekranlarının kendi turu (`Durumlar.html`) artık
                       uygulanıyor. */
                    <DurumUnread
                        what="Bu günü"
                        notMeaning="Randevunuz olmadığı"
                        onRetry={reload}
                        style={{ paddingHorizontal: 16 }}
                    />
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

                {live.shown.map(({ appointment, state }) => (
                    <LiveRow key={appointment.id} mode={live.leaving.has(appointment.id) ? 'leave' : 'still'}>
                        <AppointmentCard
                            appointment={appointment}
                            state={state}
                            entering={live.entering.has(appointment.id)}
                            // Dört ekran (appointment · visit · finish · sent)
                            // tek kumandaya indi; evreyi o sayfa kendi
                            // verisinden okuyor.
                            onPress={() => router.push({
                                pathname: '/(staff-flow)/kumanda',
                                params: { id: appointment.id },
                            })}
                        />
                        <NowLineSlot active={appointment.id === lineAfterId} time={clockOf(now)} />
                    </LiveRow>
                ))}
            </ScrollView>
        </View>
    );
}

/**
 * Diskten çizilen gün.
 *
 * ŞERİT, blok değil: ortada karar yok, yalnız bir olgu var — "bu liste canlı
 * değil, şu saatte okundu". Turun çevrimdışı bandıyla aynı model
 * (`Durumlar.html`): tamamı dokunulabilir, ayrı bir düğme taşımıyor. 30 pt'lik
 * bir şeride 56 pt'lik düğme sokmak turu yanlış okumak olurdu.
 *
 * Saat UYDURULMUYOR: damga kopyanın çekildiği an, şimdi değil.
 */
function CachedBand({ at, onRetry }: { at: number; onRetry: () => void }) {
    return (
        <DurumBand
            label="Çevrimdışı liste"
            tail={`${clockOf(at)}'te okundu`}
            hint="Yenilemek için dokunun"
            onPress={onRetry}
        />
    );
}

/**
 * Gönderilemeyen işlemler.
 *
 * TON KIRMIZI, amber değil. Turun kuralı: "Amber — iş durmuyor demek.
 * Kırmızı — yalnız gerçekten başarısız olan işlemde." Bu iş gerçekten
 * başarısız oldu; kuyrukta bekleyen değil ATILMIŞ bir iş. İlk yazımda amberdi
 * ve öteki amber şeritlerden ayırt edilemiyordu.
 *
 * Kapatılabilir olması şart: kalıcı bir uyarı bir süre sonra görülmeyen bir
 * şeye dönüşür. Ama KENDİLİĞİNDEN kapanmıyor — personel kaybı görmeden gün
 * geçmemeli.
 */
function FailedWrites() {
    const { items, accept } = useFailedWrites();
    if (items.length === 0) return null;
    return (
        <DurumBlock
            tone="red"
            title={failureTitle(items.length)}
            lines={items.map(failureLine)}
            note={failureAdvice(items)}
            actions={[{ label: 'Anladım', onPress: accept }]}
        />
    );
}


