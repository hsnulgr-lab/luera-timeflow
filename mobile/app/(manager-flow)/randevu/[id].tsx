import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentDetail } from '../../../src/components/AppointmentDetail';
import { MoveResultSheet, MoveSheet } from '../../../src/components/MoveParts';
import { Empty } from '../../../src/components/ui';
import { source } from '../../../src/lib/calendarSource';
import { mockDay } from '../../../src/lib/managerFlow';
import {
    applyMove, undoMove, type MoveResult, type MoveTarget,
} from '../../../src/lib/moveAppointment';
import { createMetrics, useTheme } from '../../../src/theme';
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
                setLoaded(true);
            })
            .catch(() => { if (alive) setLoaded(true); });
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
        setAppointment(applyMove(appointment, target));
    }, [appointment, staffName]);

    const close = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(manager)/calendar');
    }, [router]);

    return (
        <View style={{
            flex: 1,
            backgroundColor: c.bg,
            paddingTop: Math.max(insets.top, createMetrics.topGap),
        }}>
            {appointment ? (
                <AppointmentDetail
                    appointment={appointment}
                    staffName={staffName}
                    dayAppointments={day}
                    nowMinutes={now}
                    onClose={close}
                    onCustomer={() => router.push('/(staff-flow)/customer')}
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
