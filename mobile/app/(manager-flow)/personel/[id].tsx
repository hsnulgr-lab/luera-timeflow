import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthIdentityBar } from '../../../src/components/ui';
import { AppointmentMenu, MoveResultSheet, MoveSheet } from '../../../src/components/MoveParts';
import { StaffLiveHero } from '../../../src/components/FlowParts';
import { Timeline } from '../../../src/components/CalendarParts';
import { source } from '../../../src/lib/calendarSource';
import { mockDay } from '../../../src/lib/managerFlow';
import { isLive, nowInMinutes, toMinutes, todayISO, type Appt } from '../../../src/lib/calendar';
import { applyMove, type MoveResult, type MoveTarget } from '../../../src/lib/moveAppointment';
import type { StaffOption } from '../../../src/lib/createFlow';
import { calendarMetrics, useTheme } from '../../../src/theme';

/**
 * Müdür 05 — Bir personelin günü.
 *
 * SEKME GRUBUNUN DIŞINDA. `(manager)` altındaki her rota `NativeTabs` için bir
 * sekme sayılıyor; tetikleyicisi olmayan bir rota oraya konulunca gezinme
 * çalışmıyordu. Personel modunda aynı ihtiyaç için `(staff-flow)` var, bu
 * onun müdür karşılığı.
 *
 * Şeritten avatara dokununca açılır. Personelin kendi "Bugün" ekranının müdür
 * gözünden hâli: AYNI KART DİLİ, ama personelde olmayan eylemler burada var.
 *
 * O eylemler "Saati değiştir" ve "Personeli". Personelin kendi ekranında
 * yokturlar çünkü kumanda kendi gününü düzenlemez, uygular. Müdürde açıkta
 * duruyorlar çünkü en çok yapılan düzeltme bu ikisi — üç nokta menüsüne
 * gömülmeleri onları görünmez yapardı.
 */
export default function ManagerStaffDay() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [day, setDay] = useState<Appt[]>([]);
    const [menuFor, setMenuFor] = useState<Appt | null>(null);
    const [moveFor, setMoveFor] = useState<{ appointment: Appt; mode: 'time' | 'staff' } | null>(null);
    const [result, setResult] = useState<MoveResult | null>(null);
    // Sunucuda güncelleme ucu yok; taşıma şimdilik ekranda yaşıyor. Takvim
    // ekranındakiyle aynı geçici katman.
    const [moved, setMoved] = useState<Record<string, Appt>>({});

    const person = useMemo(
        () => mockDay.presence.find((candidate) => candidate.id === id) ?? mockDay.presence[0],
        [id],
    );

    useEffect(() => {
        let alive = true;
        source.day(mockDay.dateISO).then((list) => {
            if (alive) setDay(list);
        });
        return () => { alive = false; };
    }, []);

    // "Bir personelin günü" — o kişinin günü. Kaynak bütün salonun listesini
    // döndürüyor; süzgeç burada, yoksa ekran altı kişinin randevularını tek
    // kişinin günü diye gösteriyordu.
    const appointments = useMemo(
        () => day
            .map((appointment) => moved[appointment.id] ?? appointment)
            .filter((appointment) => appointment.staff_id === person.id),
        [day, moved, person.id],
    );

    const staffOptions: StaffOption[] = useMemo(
        () => mockDay.presence.map((candidate) => ({
            id: candidate.id,
            initials: candidate.initials,
            name: candidate.name,
            available: candidate.state === 'busy' || candidate.state === 'free',
            reason: candidate.state === 'leave' ? 'izinli' : candidate.state === 'off' ? 'çalışmıyor' : undefined,
        })),
        [],
    );

    const openDetail = (appointment: Appt) => router.push({
        pathname: '/randevu/[id]',
        params: { id: appointment.id, date: appointment.date },
    });

    const commitMove = (appointment: Appt, target: MoveTarget) => {
        setMoved((current) => ({ ...current, [appointment.id]: applyMove(appointment, target) }));
        setResult({
            appointment,
            fromStartMinutes: toMinutes(appointment.start_time),
            fromStaffName: person.name,
            toStartMinutes: target.startMinutes,
            toStaffName: target.staffName,
        });
    };

    // Sürmekte olan işlem başlığın altındaki kartta; listede ayrıca canlı kart
    // olarak da görünür. Aynı bilgi iki yerde DEĞİL: yukarıdaki kim ve ne kadar
    // süredir, aşağıdaki hangi randevu.
    const live = appointments.find(isLive);
    /**
     * "Şimdi" TEK bir şeydir.
     *
     * Burada her personelin kendi geçen süresinden türetiliyordu
     * (`başlangıç + geçen dakika`): Deniz'in sayfasında saat 10:21, Selin'in
     * sayfasında 10:38, Merve'nin sayfasında 11:24 yazıyordu — aynı salonun
     * aynı anında üç farklı saat. Yedek değer de donmuş bir sabitti.
     */
    const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        const id = setInterval(() => setNowMinutes(nowInMinutes()), 60_000);
        return () => clearInterval(id);
    }, []);

    const subtitle = `Kuaför · bugün ${appointments.length} randevu`;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <AuthIdentityBar
                title={person.name}
                subtitle={subtitle}
                onBack={() => router.back()}
            />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: calendarMetrics.bottomInset }}
            >
                <StaffLiveHero
                    person={person}
                    customerName={live?.customer_name}
                    service={live?.service}
                    startedAt={live ? `${live.start_time.slice(0, 5)}’de başladı` : undefined}
                    elapsedSeconds={(person.minutes ?? 0) * 60}
                />

                <View style={{ height: 1, backgroundColor: c.bd }} />

                <Timeline
                    appointments={appointments}
                    nowMinutes={nowMinutes}
                    isToday
                    elapsedSecondsById={live ? { [live.id]: (person.minutes ?? 0) * 60 } : {}}
                    actions={{
                        onCall: (appointment) => {
                            if (appointment.customer_phone) {
                                void Linking.openURL(`tel:${appointment.customer_phone}`);
                            }
                        },
                        // Karta dokunmak randevu detayını açar (Müdür 08).
                        onOpen: openDetail,
                        // Üç nokta: taşıma satırları ve iptal/silme birlikte
                        // (Müdür 07c + 10b).
                        onMore: setMenuFor,
                        // Müdüre özel iki tutamak — kartın içinde, menüye
                        // gömülmeden. Personelin kendi ekranında bu iki eylem
                        // HİÇ verilmiyor.
                        onReschedule: (appointment) => setMoveFor({ appointment, mode: 'time' }),
                        onReassign: (appointment) => setMoveFor({ appointment, mode: 'staff' }),
                    }}
                    style={{ paddingTop: calendarMetrics.cardPadding }}
                />
            </ScrollView>

            {/* Kart menüsü: taşıma satırları ve iptal/silme birlikte
                (Müdür 07c + 10b). Taşıma ve silme akışları randevu detayında
                yürüyor — onay diyaloğu tek yerde kalsın. */}
            {menuFor ? (
                <AppointmentMenu
                    visible
                    appointment={menuFor}
                    staffName={person.name}
                    onDismiss={() => setMenuFor(null)}
                    onPick={(action) => {
                        const appointment = menuFor;
                        setMenuFor(null);
                        if (action === 'time' || action === 'staff') {
                            setMoveFor({ appointment, mode: action });
                            return;
                        }
                        // Detay, iptal ve silme aynı ekrana gidiyor: onay
                        // diyaloğu tek yerde kalsın.
                        openDetail(appointment);
                    }}
                />
            ) : null}

            {moveFor ? (
                <MoveSheet
                    visible
                    mode={moveFor.mode}
                    appointment={moveFor.appointment}
                    staff={staffOptions}
                    onDismiss={() => setMoveFor(null)}
                    onPick={(target) => {
                        const { appointment } = moveFor;
                        setMoveFor(null);
                        if (!target.unchanged) commitMove(appointment, target);
                    }}
                />
            ) : null}

            {/* Müdür 07d. Onay değil tercih: taşıma zaten oldu. */}
            {/* Müdür 25 · E — geri al ve müşteriyi ara. */}
            <MoveResultSheet
                result={result}
                nowMinutes={nowMinutes}
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
