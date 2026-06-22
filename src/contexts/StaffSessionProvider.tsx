import { createContext, useContext, useCallback, useState } from 'react';

// Cihaz-içi personel oturumu. Org Supabase oturumunun ÜSTÜNDE app-içi bir kimlik.
// localStorage'da hafif tutulur (id/ad/renk) — gerçek auth değil, kiosk modu.
export interface StaffSession { id: string; name: string; color: string }

interface StaffSessionContextValue {
    staff: StaffSession | null;
    login: (s: StaffSession) => void;
    logout: () => void;
}

const KEY = 'luera_staff_session';
const StaffSessionContext = createContext<StaffSessionContextValue | null>(null);

export const StaffSessionProvider = ({ children }: { children: React.ReactNode }) => {
    const [staff, setStaff] = useState<StaffSession | null>(() => {
        try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
    });

    const login = useCallback((s: StaffSession) => {
        setStaff(s);
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
    }, []);

    const logout = useCallback(() => {
        setStaff(null);
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }, []);

    return <StaffSessionContext.Provider value={{ staff, login, logout }}>{children}</StaffSessionContext.Provider>;
};

export function useStaffSession(): StaffSessionContextValue {
    const ctx = useContext(StaffSessionContext);
    if (!ctx) throw new Error('useStaffSession must be used within StaffSessionProvider');
    return ctx;
}
