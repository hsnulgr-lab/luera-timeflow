import type { ReactNode } from 'react';
import { ReservationsContext, useReservationsState } from '@/hooks/useReservations';

/**
 * Rezervasyon verisi için TEK kaynak.
 * Ağır mantık (Supabase fetch + state + CRUD) burada bir kez çalışır;
 * altındaki tüm bileşenler useReservations() ile aynı veriyi paylaşır.
 */
export function ReservationsProvider({ children }: { children: ReactNode }) {
    const value = useReservationsState();
    return (
        <ReservationsContext.Provider value={value}>
            {children}
        </ReservationsContext.Provider>
    );
}
