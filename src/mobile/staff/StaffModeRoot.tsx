import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReservationsProvider } from '@/contexts/ReservationsProvider';
import { StaffSessionProvider, useStaffSession } from '@/contexts/StaffSessionProvider';
import { StaffLogin } from './StaffLogin';
import { ManagerLogin } from './ManagerLogin';
import { MobileStaffHome } from './MobileStaffHome';
import { T } from '../theme';

// Giriş kapısı: Yönetici mi Personel mi? Org Supabase oturumu ProtectedRoute ile sağlanmış.
function GateInner() {
    const navigate = useNavigate();
    const { staff } = useStaffSession();
    const [view, setView] = useState<'choose' | 'manager' | 'staff'>('choose');

    if (staff) return <MobileStaffHome />;
    if (view === 'manager') return <ManagerLogin onBack={() => setView('choose')} />;
    if (view === 'staff') return <StaffLogin onBack={() => setView('choose')} />;

    return (
        <div style={{ height: '100dvh', background: T.bg, color: T.ink, fontFamily: T.font, display: 'flex', flexDirection: 'column', padding: '0 22px', paddingTop: 'calc(env(safe-area-inset-top,0px) + 24px)' }}>
            <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 22 }}>
                <span style={{ fontSize: 16 }}>←</span> Ana sayfa
            </button>
            <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em' }}>Giriş</h1>
            <p style={{ fontSize: 13, color: T.muted, marginTop: 4, marginBottom: 24 }}>Yönetici tam erişime, personel kendi paneline girer.</p>

            <button onClick={() => setView('manager')} style={card(T)}>
                <div style={iconWrap('rgba(255,90,31,.15)', T.orange)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Yönetici Girişi</div>
                    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>Ciro, tüm randevular, tam erişim</div>
                </div>
                <span style={{ color: T.muted2, fontSize: 20 }}>›</span>
            </button>

            <button onClick={() => setView('staff')} style={{ ...card(T), marginTop: 12 }}>
                <div style={iconWrap('rgba(107,159,212,.15)', T.blue)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M8 8a3 3 0 100-6 3 3 0 000 6ZM2 19c0-3.3 2.7-5 6-5s6 1.7 6 5M16 7a2.5 2.5 0 010 5M19 19c0-2.6-1.4-4.3-3.5-4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Personel Girişi</div>
                    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>Kendi randevuları ve satışları</div>
                </div>
                <span style={{ color: T.muted2, fontSize: 20 }}>›</span>
            </button>
        </div>
    );
}

function card(t: typeof T): React.CSSProperties {
    return { display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '18px 16px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 18, cursor: 'pointer' };
}
function iconWrap(bg: string, color: string): React.CSSProperties {
    return { width: 48, height: 48, borderRadius: 14, background: bg, color, display: 'grid', placeItems: 'center', flexShrink: 0 };
}

export const StaffModeRoot = () => (
    <StaffSessionProvider>
        <ReservationsProvider>
            <GateInner />
        </ReservationsProvider>
    </StaffSessionProvider>
);
