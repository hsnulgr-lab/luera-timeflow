import { ReservationsProvider } from '@/contexts/ReservationsProvider';
import { StaffSessionProvider, useStaffSession } from '@/contexts/StaffSessionProvider';
import { StaffLogin } from './StaffLogin';
import { MobileStaffHome } from './MobileStaffHome';

// Personel Modu kökü: oturum yoksa PIN girişi, varsa kişisel panel.
// Org Supabase oturumu ProtectedRoute ile zaten sağlanmıştır.
function StaffModeInner() {
    const { staff } = useStaffSession();
    return staff ? <MobileStaffHome /> : <StaffLogin />;
}

export const StaffModeRoot = () => (
    <StaffSessionProvider>
        <ReservationsProvider>
            <StaffModeInner />
        </ReservationsProvider>
    </StaffSessionProvider>
);
