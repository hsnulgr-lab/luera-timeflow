import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentDetail } from '../../../src/components/AppointmentDetail';
import { MoveResultSheet, MoveSheet } from '../../../src/components/MoveParts';
import { Empty } from '../../../src/components/ui';
import { source, updateLocalAppointment } from '../../../src/lib/calendarSource';
import { mockDay } from '../../../src/lib/managerFlow';
import {
    applyMove, undoMove, type MoveResult, type MoveTarget,
} from '../../../src/lib/moveAppointment';
import { useTheme } from '../../../src/theme';
import { hhmm, nowInMinutes, toMinutes, todayISO, type Appt } from '../../../src/lib/calendar';
import type { StaffOption } from '../../../src/lib/createFlow';

/**
 * Müdür 25 — randevu kartı.
 *
 * Rota `(manager)` sekme grubunun DIŞINDA: o grupta her dosya bir sekmeye
 * dönüşüyor (Müdür 05'te aynı hatayla karşılaşılmıştı). Buraya takvimdeki
 * bloktan, akıştan ve personelin gününden geliniyor.
 *
 * Yol `/randevu/{id}`; gün parametre olarak taşınıyor çünkü kaynakta
 * "id ile randevu getir" diye bir uç yok, gün listesi var.
 */
export default function ManagerAppointment() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string; date?: string }>();
    const [day, setDay] = useState<Appt[]>([]);
    const [appointment, setAppointment] = useState<Appt | null>(null);
    const [loaded, setLoaded] = useState(false);
    /**
     * Okuma BAŞARISIZ mı oldu. `loaded` ile ayrı tutuluyor çünkü "gün okundu,
     * randevu içinde yok" ile "gün hiç okunamadı" ayrı şeyler ve ikincisi
     * müdüre "randevu silinmiş" diye görünüyordu.
     */
    const [failed, setFailed] = useState(false);
    const [moveMode, setMoveMode] = useState<'time' | 'staff' | null>(null);
    const [result, setResult] = useState<MoveResult | null>(null);

    const dateISO = params.date ?? mockDay.dateISO;

    // Şimdi çizgisi cihazın saatinden gelir; sabit bir saat "10 dk sonra"
    // derken aslında geçmişte olabilirdi.
    const [now, setNow] = useState(() => nowInMinutes());
    useEffect(() => {
        const timer = setInterval(() => setNow(nowInMinutes()), 60_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let alive = true;
        source.day(dateISO)
            .then((list) => {
                if (!alive) return;
                setDay(list);
                setAppointment(list.find((item) => item.id === params.id) ?? null);
                // Önceki denemede hata olmuş olabilir; okundu artık.
                setFailed(false);
                setLoaded(true);
            })
            .catch(() => {
                if (!alive) return;
                setFailed(true);
                setLoaded(true);
            });
        return () => { alive = false; };
    }, [dateISO, params.id]);

    // Sütun başlıkları ve akış aynı personel kaynağını kullanıyor; detay da
    // oradan okuyor ki üç ekranda aynı ad görünsün.
    const staffName = useMemo(
        () => mockDay.presence.find((person) => person.id === appointment?.staff_id)?.name ?? null,
        [appointment?.staff_id],
    );

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

    /**
     * Taşıma bu ekranda da yapılabiliyor (jetonlar). Sunucuda güncelleme ucu
     * olmadığı için yeni hâl şimdilik ekranda yaşıyor; takvim ekranındakiyle
     * aynı geçici katman ve aynı `applyMove`.
     */
    const commitMove = useCallback((target: MoveTarget) => {
        if (!appointment) return;
        setResult({
            appointment,
            fromStartMinutes: toMinutes(appointment.start_time),
            fromStaffName: staffName,
            toStartMinutes: target.startMinutes,
            toStaffName: target.staffName,
        });
        const moved = applyMove(appointment, target);
        setAppointment(moved);
        // Kaynağa da yaz: kartı kapatınca takvim yeni saati göstersin.
        updateLocalAppointment(moved);
    }, [appointment, staffName]);

    const close = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/mudur/calendar');
    }, [router]);

    return (
        <View style={{
            flex: 1,
            backgroundColor: c.bg,
            /*
             * ÜSTTE PAY YOK (iOS).
             *
             * Ekran `presentation: 'modal'` ile geliyor: iOS onu zaten durum
             * çubuğunun altına, köşeleri yuvarlatılmış bir yüzey olarak
             * yerleştiriyor. Üstüne bir de güvenli alan payı (34) eklenince
             * tutamakla "RANDEVU" satırı arasında ~60 pt boşluk kalıyordu ve
             * kart ekranın ortasından başlıyormuş gibi duruyordu.
             *
             * Tutamak (26 pt) tek başına yeterli üst nefes. Android'de modal
             * tam ekran çizilebildiği için orada pay korunuyor.
             */
            paddingTop: Platform.OS === 'ios' ? 0 : insets.top,
        }}>
            {appointment ? (
                <AppointmentDetail
                    appointment={appointment}
                    staffName={staffName}
                    dayAppointments={day}
                    nowMinutes={now}
                    onClose={close}
                    onCustomer={() => router.push({
                        pathname: '/(staff-flow)/customer',
                        params: {
                            customerId: appointment.customer_id ?? undefined,
                            customerName: appointment.customer_name,
                        },
                    })}
                    onMove={(mode) => setMoveMode(mode)}
                    // Hizmet ve not artık GERÇEKTEN değişiyor; satırlar
                    // chevron gösterip hiçbir şey açmıyordu.
                    onUpdate={(next) => setAppointment(next)}
                    onAttendance={(arrived) => {
                        if (!arrived) { close(); return; }
                        // Müşteri SALONA geldi. Hizmeti personel başlatır;
                        // `arrived_at` müdürün basacağı damga değil.
                        setAppointment({ ...appointment, customer_arrived_at: `${hhmm(now)}:00` });
                    }}
                    onCancel={() => setAppointment({ ...appointment, status: 'cancelled' })}
                    onDelete={close}
                />
            ) : failed ? (
                /*
                 * Okunamayan gün "randevu silinmiş" DEĞİL. Aynı bileşen, ayrı
                 * cümle: değişen tek şey söylenen söz. Ayrı bir "okunamadı"
                 * görseli (tekrar dene düğmesi vb.) müdür modunun durum
                 * ekranlarına ait ve o tur henüz yapılmadı — burada yapılan
                 * tek şey, hatanın silinmiş bir randevu gibi okunmasını
                 * engellemek.
                 */
                <Empty
                    title="Randevu okunamadı"
                    hint="Bağlantı kesilmiş olabilir. Geri dönüp tekrar açın."
                />
            ) : loaded ? (
                <Empty title="Randevu bulunamadı" hint="Silinmiş ya da başka bir güne taşınmış olabilir." />
            ) : null}

            {appointment && moveMode ? (
                <MoveSheet
                    visible
                    mode={moveMode}
                    appointment={appointment}
                    staff={staffOptions}
                    onDismiss={() => setMoveMode(null)}
                    onPick={(target) => {
                        setMoveMode(null);
                        if (!target.unchanged) commitMove(target);
                    }}
                />
            ) : null}

            {/* Müdür 25 · E. Onay değil sonuç: taşıma zaten oldu. */}
            <MoveResultSheet
                result={result}
                nowMinutes={now}
                today={todayISO()}
                onUndo={(moved) => { setAppointment(undoMove(moved)); setResult(null); }}
                onCall={(phone) => { void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`); }}
                onDone={() => setResult(null)}
            />
        </View>
    );
}
