import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayHeader, WeekStrip } from '../../src/components/CalendarParts';
import { ColumnCalendar } from '../../src/components/ColumnCalendar';
import { AppointmentMenu, MoveResultSheet, MoveSheet } from '../../src/components/MoveParts';
import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { hourRange, type ColumnStaff } from '../../src/lib/managerCalendar';
import { useManagerCalendarDay } from '../../src/lib/managerCalendarDay';
import { orgDurum } from '../../src/lib/managerDurum';
import { useMoveWriter } from '../../src/lib/managerMove';
import { STALE_LINE, STALE_TITLE } from '../../src/lib/managerWriteMap';
import {
    applyMove, undoMove, type MenuAction, type MoveResult, type MoveTarget,
} from '../../src/lib/moveAppointment';
import { hhmm, nowInMinutes, toMinutes, todayISO, weekDays, type Appt } from '../../src/lib/calendar';
import { authApi } from '../../src/api/session';
import { forgetOrg } from '../../src/lib/managerSource';
import { initialsOf } from '../../src/lib/text';
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
/** "· 2 atanmamış". Sıfırsa HİÇ yazılmıyor: her gün sonuna "· 0" eklemek gürültü. */
const orphanTail = (count: number) => (count > 0 ? ` · ${count} atanmamış` : '');

/** Damganın saati. `staffDemo`'dan çekmemek için burada — o dosya sahte. */
const clockAt = (ms: number) => {
    const at = new Date(ms);
    return hhmm(at.getHours() * 60 + at.getMinutes());
};

export default function ManagerCalendar() {
    const { c, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    /** Takvim belirli bir günle açılabiliyor (derin bağlantı, bildirim). */
    const params = useLocalSearchParams<{ date?: string }>();
    const [selectedDate, setSelectedDate] = useState(params.date ?? todayISO());
    const days = useMemo(() => weekDays(selectedDate), [selectedDate]);
    const {
        state, data, refusal, at: readAt, stale, reload,
    } = useManagerCalendarDay(selectedDate);

    // Taşıma durumu
    const [menuFor, setMenuFor] = useState<Appt | null>(null);
    const [moveMode, setMoveMode] = useState<'time' | 'staff' | null>(null);
    const [result, setResult] = useState<MoveResult | null>(null);
    /**
     * Taşıma artık SUNUCUYA YAZILIYOR — randevu kartındaki yolun aynısı.
     * Kural `useMoveWriter`da, tek yerde: iyimserlik, iyimser kilit ve reddin
     * yerel hâli geri alması. Bu ekranda bir zamanlar yalnız yerel bir katman
     * vardı ve sonuç sayfası "taşındı" diyordu.
     */
    const {
        appointments, commit, refused, clearRefusal,
    } = useMoveWriter(data.rows, data.stamps, reload);

    useEffect(() => {
        if (params.date) setSelectedDate(params.date);
    }, [params.date]);


    // Sütunlar salonun GERÇEK kadrosundan. Kural `columnsFor`'da: aktif kadro
    // her zaman sütun alır, ayrılmış personel yalnız o gün randevusu varsa —
    // yoksa onun randevuları takvimden sessizce düşerdi.
    const staff: ColumnStaff[] = useMemo(
        () => data.columns.map((person) => ({
            id: person.id,
            initials: initialsOf(person.name),
            name: person.name,
            color: person.color ?? undefined,
        })),
        [data.columns],
    );

    /*
     * Taşıma sayfası izinliyi de bilmek zorunda; sütunlar bunu sormuyor.
     *
     * "Çalışmıyor" hâli HENÜZ YOK: o, personelin kendi çalışma saatlerinden
     * (`staff.working_hours`) türüyor ve o okuma ayarlar adımında açılacak.
     * Bilinmeyen bir hâli "çalışıyor" saymak, izinli olmayan birini yanlışlıkla
     * seçilemez yapmaktan iyi — seçim yine de sunucudaki çakışma korumasına
     * çarpar.
     */
    const staffOptions: StaffOption[] = useMemo(
        () => data.columns.map((person) => ({
            id: person.id,
            initials: initialsOf(person.name),
            name: person.name,
            color: person.color ?? undefined,
            available: person.active && !data.onLeave.has(person.id),
            reason: data.onLeave.has(person.id) ? 'izinli' : undefined,
        })),
        [data.columns, data.onLeave],
    );

    // Aralık SALONUN günü; randevular yalnız dışarı taşarsa genişletiyor.
    const { from, to } = useMemo(() => hourRange(appointments, data.open), [appointments, data.open]);
    const isToday = selectedDate === todayISO();
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

    /*
     * Alt başlık ÜÇ hâli ayırıyor.
     *
     * Eskiden her hâlde sayı yazıyordu: okunamayan gün "0 randevu · 0 personel"
     * diye, yani BOŞ bir gün gibi görünüyordu. Müdür o ekrana bakıp salonun
     * bugün boş olduğunu sanabilirdi.
     *
     * Bayatsa sayının yerini saat alıyor: yoklama sessizce cevap alamıyorsa
     * ızgara donuyor ve bunun tek izi bu satır.
     */
    const subtitle = state === 'error'
        ? 'okunamadı'
        : state === 'loading'
            ? '…'
            : stale && readAt !== null
                ? `${appointments.length} randevu · son güncelleme ${clockAt(readAt)}`
                : `${appointments.length} randevu · ${staff.length} personel${orphanTail(data.unassigned)}`;

    /*
     * ATANMAMIŞ randevu ızgarada GÖRÜNMÜYOR — sütunu yok.
     *
     * `staff_id` null olabiliyor ve personel silinince kendiliğinden oluyor
     * (`ON DELETE SET NULL`). Böyle bir randevu hiçbir sütuna düşemiyor.
     *
     * Bunun tasarımı henüz yok: on dokuz turun hiçbirinde "atanmamış" diye
     * bir kavram geçmiyor. Kendi başıma bir sütun uydurmuyorum — ama sessiz
     * de bırakmıyorum. Sayı burada duruyor; nereye konacağına tasarım karar
     * verince satır oraya taşınır.
     */

    const nameOf = useCallback(
        (staffId?: string | null) => staff.find((person) => person.id === staffId)?.name ?? null,
        [staff],
    );

    /** Sürükleme ve menü AYNI yere düşer: tek taşıma yolu, tek sonuç ekranı. */
    const commitMove = useCallback(async (appointment: Appt, target: MoveTarget) => {
        const fromStaffName = nameOf(appointment.staff_id);
        const ok = await commit(appointment, applyMove(appointment, target), target.staffName);
        // Sonuç sayfası YALNIZ gerçekten taşındıysa açılıyor: reddedilmiş bir
        // taşıma için "geri al" sunmak anlamsız.
        if (!ok) return;
        setResult({
            appointment,
            fromStartMinutes: toMinutes(appointment.start_time),
            fromStaffName,
            toStartMinutes: target.startMinutes,
            toStaffName: target.staffName,
        });
    }, [commit, nameOf]);

    /**
     * Reddin tek hamlesi.
     *
     * Üçü de sonunda giriş akışına çıkıyor ama AYNI yere değil: erişimi
     * kaldırılmış müdürün oturumu da kapanmalı (cihazda duran salon artık
     * yanlış), salon seçmesi gerekenin oturumu DURMALI — yoksa şifresini
     * yeniden yazdırmış olurduk.
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
                    counts={data.counts}
                    onSelect={setSelectedDate}
                />

                <View style={{ height: 1, backgroundColor: c.bd }} />

                {/*
                  * REDDEDİLEN TAŞIMA. Randevu kartındaki blokla aynı dil:
                  * bayat kilit amber (düzeltilebilir), ötekiler kırmızı.
                  * Sessiz kalmak, taşıma olmuş gibi görünmesi demekti.
                  */}
                {refused && !refused.ok ? (
                    <DurumBlock
                        tone={refused.kind === 'stale' ? 'amber' : 'red'}
                        title={
                            refused.kind === 'stale' ? STALE_TITLE
                                : refused.kind === 'conflict' ? 'O saate taşınamadı'
                                    : refused.kind === 'paused' ? 'Değişiklik şimdilik alınmıyor'
                                        : 'Taşıma uygulanmadı'
                        }
                        lines={[
                            refused.kind === 'stale' ? STALE_LINE
                                : refused.kind === 'conflict' ? refused.message
                                    : refused.kind === 'paused' ? 'Kısa bir süre sonra tekrar deneyin.'
                                        : 'Bağlantı kesilmiş olabilir. Tekrar deneyin.',
                        ]}
                        actions={[{ label: 'Anladım', onPress: clearRefusal }]}
                        style={{ marginHorizontal: 16, marginBottom: 16 }}
                    />
                ) : null}

                {/*
                  * ÜÇ HÂL ÜÇ ÇİZİM.
                  *
                  * Eskiden üçü de aynıydı: okunamayan gün boş ızgara olarak
                  * çiziliyordu ve müdür salonun boş olduğunu sanıyordu.
                  *
                  * Sıra önemli — red, okunamamadan ÖNCE. "Bu salona artık
                  * giremiyorsunuz" ile "okuyamadık" aynı blok olamaz: birinde
                  * beklemek bir seçenek, ötekinde değil.
                  */}
                {refusal ? (
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
                ) : state === 'error' ? (
                    <DurumUnread
                        what="Günü"
                        notMeaning="Randevu olmadığı"
                        onRetry={() => { void reload(); }}
                        style={{ flex: 1, paddingHorizontal: 16 }}
                    />
                ) : (
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
                        pathname: '/mudur/create',
                        params: { date: selectedDate, start: String(minutes), staff: staffId },
                    })}
                    // Basılı tutup sürükleme (Müdür 07a/b).
                    onMove={(appointment, target) => { void commitMove(appointment, target); }}
                    // Güvenilir yol (Müdür 07c).
                    onMenu={setMenuFor}
                />
                )}
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
                    day={appointments}
                    hours={data.open}
                    staff={staffOptions}
                    onDismiss={() => { setMoveMode(null); setMenuFor(null); }}
                    onPick={(target) => {
                        const appointment = menuFor;
                        setMoveMode(null);
                        setMenuFor(null);
                        // Aynı yere "taşımak" bir taşıma değil; sonuç ekranı
                        // açılmaz.
                        if (!target.unchanged) void commitMove(appointment, target);
                    }}
                />
            ) : null}

            {/* Müdür 07d. Onay değil sonuç: taşıma yazıldı. */}
            {/* Müdür 25 · E — geri al ve müşteriyi ara. "Evet, yaz" kalktı:
                uygulamanın müşteriye mesaj atacak kanalı yok. */}
            <MoveResultSheet
                result={result}
                nowMinutes={isToday ? nowMinutes : undefined}
                today={todayISO()}
                onUndo={(done) => {
                    // Geri al da bir YAZMA: yerel katmanı silmek randevuyu
                    // sunucuda eski saatine döndürmezdi.
                    void commit(done.appointment, undoMove(done), done.fromStaffName);
                    setResult(null);
                }}
                onCall={(phone) => { void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`); }}
                onDone={() => setResult(null)}
            />
        </View>
    );
}
