import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { StaffDay } from '../../../src/components/StaffDay';
import { source } from '../../../src/lib/calendarSource';
import { mockDay } from '../../../src/lib/managerFlow';
import type { Appt } from '../../../src/lib/calendar';
import { useTheme } from '../../../src/theme';

/**
 * Müdür 24 — Bir personelin günü (Müdür 05 yeniden tasarımı).
 *
 * Şeritten avatara dokununca açılır.
 * Personeller arası yatay sayfalama (pagingEnabled) ve tek sayaç mimarisi.
 */
export default function ManagerStaffDay() {
    const { c } = useTheme();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [day, setDay] = useState<Appt[]>([]);
    // Gün okunmadan boş hâl çizilmez — yanlış cümle görünmesin.
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        source.day(mockDay.dateISO).then((list) => {
            if (!alive) return;
            setDay(list);
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    const openDetail = (appointment: Appt) => router.push({
        pathname: '/randevu/[id]',
        params: { id: appointment.id, date: appointment.date },
    });

    /*
     * Randevu akışı `staff` ve `date` bekliyor — `staffId` diye gönderilince
     * ön dolgu sessizce boş kalıyordu. "Yarına randevu ver" için tarih de
     * gitmeli, yoksa yarınki randevu bugüne yazılırdı.
     */
    const createAppointment = (staffId: string, dateISO: string) => router.navigate({
        pathname: '/mudur/create',
        params: { staff: staffId, date: dateISO },
    });

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <StaffDay
                initialStaffId={id}
                presence={mockDay.presence}
                appointments={day}
                loading={loading}
                onBack={() => router.back()}
                onOpenAppointment={openDetail}
                onCreateAppointment={createAppointment}
            />
        </View>
    );
}
