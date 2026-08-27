import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader, WeekStrip } from '../../src/components/CalendarParts';
import { ColumnCalendar } from '../../src/components/ColumnCalendar';
import { AppointmentMenu, MoveResultSheet, MoveSheet } from '../../src/components/MoveParts';
import { source, updateLocalAppointment } from '../../src/lib/calendarSource';
import { hourRange, type ColumnStaff } from '../../src/lib/managerCalendar';
import { mockDay } from '../../src/lib/managerFlow';
import { applyMove, type MenuAction, type MoveResult, type MoveTarget } from '../../src/lib/moveAppointment';
import { nowInMinutes, toMinutes, todayISO, weekDays, type Appt } from '../../src/lib/calendar';
import type { StaffOption } from '../../src/lib/createFlow';
import { glow, useTheme } from '../../src/theme';

/**
 * Müdür 06 — Takvim · personel sütunlu gün görünümü.
 * Müdür 07 — randevuyu taşıma (sürükleyerek ve menüden).
 *
 * Personel takvimiyle aynı ekran; TEK farkı gövde. Dev başlık, hafta şeridi,
 * yoğunluk noktaları ve şimdi çizgisi olduğu gibi duruyor — ikinci bir takvim
 * dili üretmek, iki ekranın zamanla ayrışması demekti.
 *
 * Gövde neden farklı: personel yalnız kendi gününü görüyor, o yüzden tek
 * sütun yetiyor. Müdür bütün ekibi aynı anda görmek zorunda; "kim boşta,
 * kim dolu" sorusunun cevabı sütunların yan yana durmasıyla veriliyor.
 */
export default function ManagerCalendar() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    /** Takvim belirli bir günle açılabiliyor (derin bağlantı, bildirim). */
    const params = useLocalSearchParams<{ date?: string }>();
    const [fetched, setFetched] = useState<Appt[]>([]);
    const [selectedDate, setSelectedDate] = useState(params.date ?? mockDay.dateISO);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

    // Taşıma durumu
    const [menuFor, setMenuFor] = useState<Appt | null>(null);
    const [moveMode, setMoveMode] = useState<'time' | 'staff' | null>(null);
    const [result, setResult] = useState<MoveResult | null>(null);
    /**
     * Taşınan randevuların yerel karşılığı.
     *
     * Sunucuda randevu güncelleme ucu YOK; yazılacak. Taşımayı yalnız
     * ekranda tutmak, hareketin gerçekten çalıştığını göstermenin dürüst
     * yolu: ekran "taşındı" diyorsa blok gerçekten oraya gidiyor. Uç
     * yazıldığında bu katman kalkacak.
     */
    const [moved, setMoved] = useState<Record<string, Appt>>({});

    useEffect(() => {
        let alive = true;
        source.day(selectedDate)
            .then((list) => { if (alive) setFetched(list); })
            // Okuma başarısız olursa ELDEKİ liste durur; yerine boş bir gün
            // YAZILMAZ. Ekranda "okunamadı" diye bir hâl henüz yok (müdür
            // modunun durum ekranları tasarlanmadı) — burada yapılan tek şey,
            // hatanın sessizce boş güne dönüşmesini engellemek.
            .catch(() => undefined);
        return () => { alive = false; };
    }, [selectedDate]);

    useEffect(() => {
        if (params.date) setSelectedDate(params.date);
    }, [params.date]);

    useEffect(() => {
        let alive = true;
        source.range(days[0]?.date ?? selectedDate, days.at(-1)?.date ?? selectedDate)
            .then((map) => { if (alive) setCounts(map); })
            /*
             * Sayılar okunamazsa `counts` BOŞ kalır ve şerit o günleri
             * "bilinmiyor" diye çizer — sıfır diye değil. Eskiden ikisi aynıydı
             * ve dolu bir hafta boş görünüyordu.
             */
            .catch(() => undefined);
        return () => { alive = false; };
        // `days` seçili günden türüyor; ikinci bir bağımlılık gereksiz.
    }, [selectedDate]);

    const appointments = useMemo(
        () => fetched.map((appointment) => moved[appointment.id] ?? appointment),
        [fetched, moved],
    );


    // Şeritteki personel sırası akış ekranıyla AYNI kaynaktan; müdür iki
    // ekranda farklı sıra görmemeli.
    const staff: ColumnStaff[] = useMemo(
        () => mockDay.presence.map((person) => ({
            id: person.id,
            initials: person.initials,
            name: person.name,
        })),
        [],
    );

    // Menüden taşıma izinli/çalışmayanları da bilmeli; sütunlar bunu
    // sormuyordu.
    const staffOptions: StaffOption[] = useMemo(
        () => mockDay.presence.map((person) => ({
            id: person.id,
            initials: person.initials,
            name: person.name,
            available: person.state === 'busy' || person.state === 'free',
            reason: person.state === 'leave' ? 'izinli' : person.state === 'off' ? 'çalışmıyor' : undefined,
        })),
        [],
    );

    const { from, to } = useMemo(() => hourRange(appointments), [appointments]);
    const isToday = selectedDate === mockDay.dateISO;
    // "Şimdi" çizgisi cihazın saatinden gelir ve DAKİKA BAŞI ilerler. Sabit
    // bir sayı duruyordu; çizgi kıpırdamayınca ekran donmuş görünüyordu.
    // Sayaç yalnız bugün görünürken çalışır — arka planda pil yakmaz.
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        if (!isToday) return;
        setNowMinutes(nowInMinutes());
        const id = setInterval(() => setNowMinutes(nowInMinutes()), 60_000);
        return () => clearInterval(id);
    }, [isToday]);

    const subtitle = `${appointments.length} randevu · ${staff.length} personel`;

    const nameOf = useCallback(
        (staffId?: string | null) => staff.find((person) => person.id === staffId)?.name ?? null,
        [staff],
    );

    /** Sürükleme ve menü AYNI yere düşer: tek taşıma yolu, tek sonuç ekranı. */
    const commitMove = useCallback((appointment: Appt, target: MoveTarget) => {
        const moved = applyMove(appointment, target);
        setMoved((current) => ({ ...current, [appointment.id]: moved }));
        // Kaynağa da yaz: başka ekrana gidip dönünce taşıma yerinde kalsın.
        updateLocalAppointment(moved);
        setResult({
            appointment,
            fromStartMinutes: toMinutes(appointment.start_time),
            fromStaffName: nameOf(appointment.staff_id),
            toStartMinutes: target.startMinutes,
            toStaffName: target.staffName,
        });
    }, [nameOf]);

    const onMenuPick = useCallback((action: MenuAction) => {
        const appointment = menuFor;
        setMenuFor(null);
        if (!appointment) return;
        if (action === 'time' || action === 'staff') { setMoveMode(action); setMenuFor(appointment); return; }
        if (action === 'detail') {
            router.push({ pathname: '/randevu/[id]', params: { id: appointment.id, date: appointment.date } });
        }
        // İptal ve silme detay ekranından yürüyor: onay diyaloğu orada, tek
        // yerde duruyor.
        if (action === 'cancel' || action === 'delete') {
            router.push({ pathname: '/randevu/[id]', params: { id: appointment.id, date: appointment.date } });
        }
    }, [menuFor, router]);

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Uygulamanın tek gradyanı; Takvim ekranındakiyle aynı. */}
            <LinearGradient
                pointerEvents="none"
                colors={dark ? glow.dark : glow.light}
                locations={glow.locations}
                style={[StyleSheet.absoluteFill, { height: glow.height + insets.top }]}
            />

            <View style={{ flex: 1, paddingTop: insets.top }}>
                <DayHeader dateISO={selectedDate} subtitle={subtitle} transparent />

                <WeekStrip
                    days={days}
                    selectedISO={selectedDate}
                    counts={counts}
                    onSelect={setSelectedDate}
                />

                <View style={{ height: 1, backgroundColor: c.bd }} />

                <ColumnCalendar
                    appointments={appointments}
                    staff={staff}
                    from={from}
                    to={to}
                    nowMinutes={nowMinutes}
                    isToday={isToday}
                    // Bloğa dokunmak randevu detayını açar (Müdür 08).
                    onOpen={(appointment) => router.push({
                        pathname: '/randevu/[id]',
                        params: { id: appointment.id, date: appointment.date },
                    })}
                    // Boş saate dokunmak: o personel ve o saatle randevu
                    // oluşturma açılır — müdürün en hızlı yolu. Gün, saat ve
                    // personel ön dolu gider; akış yalnız müşteri ve hizmeti
                    // sorar, sonra doğrudan özete düşer.
                    onSlot={(staffId, minutes) => router.navigate({
                        pathname: '/(manager)/create',
                        params: { date: selectedDate, start: String(minutes), staff: staffId },
                    })}
                    // Basılı tutup sürükleme (Müdür 07a/b).
                    onMove={commitMove}
                    // Güvenilir yol (Müdür 07c).
                    onMenu={setMenuFor}
                />
            </View>

            {menuFor && moveMode === null ? (
                <AppointmentMenu
                    visible
                    appointment={menuFor}
                    staffName={nameOf(menuFor.staff_id)}
                    onDismiss={() => setMenuFor(null)}
                    onPick={onMenuPick}
                />
            ) : null}

            {menuFor && moveMode ? (
                <MoveSheet
                    visible
                    mode={moveMode}
                    appointment={menuFor}
                    staff={staffOptions}
                    onDismiss={() => { setMoveMode(null); setMenuFor(null); }}
                    onPick={(target) => {
                        const appointment = menuFor;
                        setMoveMode(null);
                        setMenuFor(null);
                        // Aynı yere "taşımak" bir taşıma değil; sonuç ekranı
                        // açılmaz.
                        if (!target.unchanged) commitMove(appointment, target);
                    }}
                />
            ) : null}

            {/* Müdür 07d. Onay değil tercih: taşıma zaten oldu. */}
            {/* Müdür 25 · E — geri al ve müşteriyi ara. "Evet, yaz" kalktı:
                uygulamanın müşteriye mesaj atacak kanalı yok. */}
            <MoveResultSheet
                result={result}
                nowMinutes={isToday ? nowMinutes : undefined}
                today={todayISO()}
                onUndo={(moved) => {
                    setMoved((current) => {
                        const next = { ...current };
                        delete next[moved.appointment.id];
                        return next;
                    });
                    setResult(null);
                }}
                onCall={(phone) => { void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`); }}
                onDone={() => setResult(null)}
            />
        </View>
    );
}
