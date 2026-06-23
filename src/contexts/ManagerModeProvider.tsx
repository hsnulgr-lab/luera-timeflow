import { createContext, useContext, useCallback, useState } from 'react';

// Mobil "Yönetici Modu" bayrağı. Varsayılan görünüm operasyoneldir (para yok);
// yönetici PIN'i ile açılınca ciro + tam erişim görünür. Cihaz bazlı (localStorage).
interface ManagerModeContextValue {
    isManager: boolean;
    enable: () => void;
    disable: () => void;
}

const KEY = 'luera_manager_mode';
const ManagerModeContext = createContext<ManagerModeContextValue | null>(null);

export const ManagerModeProvider = ({ children }: { children: React.ReactNode }) => {
    const [isManager, setIsManager] = useState<boolean>(() => {
        try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
    });

    const enable = useCallback(() => {
        setIsManager(true);
        try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    }, []);

    const disable = useCallback(() => {
        setIsManager(false);
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }, []);

    return <ManagerModeContext.Provider value={{ isManager, enable, disable }}>{children}</ManagerModeContext.Provider>;
};

export function useManagerMode(): ManagerModeContextValue {
    const ctx = useContext(ManagerModeContext);
    if (!ctx) throw new Error('useManagerMode must be used within ManagerModeProvider');
    return ctx;
}
