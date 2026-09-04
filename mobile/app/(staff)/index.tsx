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
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayHeader } from '../../src/components/CalendarParts';
import { AppointmentCard, NowLineSlot } from '../../src/components/AppointmentCard';
import { StaffWeekStrip } from '../../src/components/StaffWeekStrip';
import { formatDayMonth, todayISO } from '../../src/lib/calendar';
import { cardState, nowLineAfter, stripDays } from '../../src/lib/staffCard';
import { clockOf, demoAgenda } from '../../src/lib/staffDemo';
import { glow, useTheme } from '../../src/theme';

/**
 * SAHTE HAFTA — şeridin yoğunluk noktaları için.
 *
 * Bugünün sayısı `demoAgenda`dan geliyor; diğer günler uydurma. Sunucuya
 * bağlanınca `agenda` uçları ya da bir aralık ucu bunu doldurur. Bilinmeyen
 * gün anahtarı TAŞIMAZ — nokta çizilmemesi "randevu yok" demek değil.
 */
function demoCounts(days: readonly string[], todayCount: number): Record<string, number> {
    const fake = [2, 0, 4, 0, 1, 3, 0];
    const out: Record<string, number> = {};
    days.forEach((iso, index) => { out[iso] = fake[index] ?? 0; });
    out[days[3]] = todayCount;
    return out;
}

export default function Today() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const dateISO = todayISO();

    const [now, setNow] = useState(() => Date.now());
    const agenda = useMemo(() => demoAgenda(now, dateISO), [dateISO]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const lineAfter = nowLineAfter(agenda, now);
    const days = useMemo(() => stripDays(dateISO), [dateISO]);
    const counts = useMemo(() => demoCounts(days, agenda.length), [days, agenda.length]);

    /**
     * Listeye YENİ düşen randevular. Müdür gün içinde randevu ekleyebiliyor;
     * o kart yuva açarak yerinde beliriyor. İlk çizimde hiçbir kart "yeni"
     * sayılmaz — açılışta liste canlanmıyor, zaten oradaydı.
     */
    const seen = useRef<Set<string> | null>(null);
    const fresh = useMemo(() => {
        const ids = new Set(agenda.map((item) => item.id));
        const before = seen.current;
        seen.current = ids;
        if (before == null) return new Set<string>();
        return new Set([...ids].filter((id) => !before.has(id)));
    }, [agenda]);

    const done = rows.filter((row) => row.state.dim > 0 || row.state.kind === 'unbilled').length;
    const left = rows.length - done;
    const subtitle = `${formatDayMonth(dateISO)} · ${done} iş bitti, ${left} kaldı`;

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
                    todayISO={dateISO}
                    selectedISO={dateISO}
                    counts={counts}
                    onSelect={(iso) => {
                        // Bugüne dokunmak zaten burada olduğun sayfayı yeniden
                        // açmaz; başka gün Takvim sekmesinde açılır. Şeridin işi
                        // bu hafta, ayın tamamı Takvim'in işi.
                        if (iso === dateISO) return;
                        router.navigate({
                            pathname: '/(staff)/calendar',
                            params: { date: iso },
                        });
                    }}
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
