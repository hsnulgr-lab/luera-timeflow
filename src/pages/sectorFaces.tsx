import type { ComponentType } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { calendarProfileFor, type FaceKey } from '@/lib/calendarSectorProfiles';
import { CalendarPage } from '@/pages/CalendarPage';
import { ReservationsPage } from '@/pages/ReservationsPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { BeautyCustomersPage } from '@/pages/BeautyCustomersPage';
import { KuaforCalendarPage } from '@/components/kuafor/KuaforCalendarPage';
import { KuaforReservationsPage } from '@/components/kuafor/KuaforReservationsPage';
import { KuaforCustomersPage } from '@/components/kuafor/KuaforCustomersPage';
import { MobileCalendar } from '@/mobile/pages/MobileCalendar';

// ── Sektör yüzleri (masaüstü) ────────────────────────────────────────────────
// DashboardPage'in DASHBOARD_FACES deseni: sektör → anahtar → bileşen.
// Sektör eşlemesi lib/calendarSectorProfiles'ta (saf, node ile test edilebilir),
// bileşen haritası burada. App.tsx yalnız bu üç yüzü route'a bağlar; ikinci bir
// sektör yüzü eklemek artık App.tsx'e dokunmayı gerektirmiyor.
//
// Yükleme politikası eski davranışın aynısı: sektör bilinene kadar hiçbir yüz
// çizilmez — yoksa genel takvim bir kare görünüp kuaför takvimine zıplar.

const CALENDAR_FACES: Record<FaceKey, ComponentType> = {
    genel: CalendarPage,
    salon: KuaforCalendarPage,
    guzellik: CalendarPage,
};

const RESERVATIONS_FACES: Record<FaceKey, ComponentType> = {
    genel: ReservationsPage,
    salon: KuaforReservationsPage,
    guzellik: ReservationsPage,
};

const CUSTOMERS_FACES: Record<FaceKey, ComponentType> = {
    genel: CustomersPage,
    salon: KuaforCustomersPage,
    guzellik: BeautyCustomersPage,
};

// Mobilde bugün tek takvim yüzü var; harita yine de profilden okur ki sektöre
// özel bir mobil takvim geldiğinde App.tsx'e dokunmak gerekmesin.
const MOBILE_CALENDAR_FACES: Record<FaceKey, ComponentType> = {
    genel: MobileCalendar,
    salon: MobileCalendar,
    guzellik: MobileCalendar,
};

export const DesktopCalendarFace = () => {
    const { settings, isSettingsLoading } = useReservations();
    if (isSettingsLoading) return null;
    const Face = CALENDAR_FACES[calendarProfileFor(settings.sector).calendar] ?? CalendarPage;
    return <Face />;
};

export const DesktopReservationsFace = () => {
    const { settings, isSettingsLoading } = useReservations();
    if (isSettingsLoading) return null;
    const Face = RESERVATIONS_FACES[calendarProfileFor(settings.sector).reservations] ?? ReservationsPage;
    return <Face />;
};

export const DesktopCustomersFace = () => {
    const { settings, isSettingsLoading } = useReservations();
    if (isSettingsLoading) return null;
    const Face = CUSTOMERS_FACES[calendarProfileFor(settings.sector).customers] ?? CustomersPage;
    return <Face />;
};

export const MobileCalendarFace = () => {
    const { settings, isSettingsLoading } = useReservations();
    if (isSettingsLoading) return null;
    const Face = MOBILE_CALENDAR_FACES[calendarProfileFor(settings.sector).mobileCalendar] ?? MobileCalendar;
    return <Face />;
};
