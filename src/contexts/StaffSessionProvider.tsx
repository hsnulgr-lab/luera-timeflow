import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import {
    normalizeStaffRole,
    permissionsForStaffRole,
    type StaffPermission,
    type StaffRole,
} from '@/lib/staffPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Cihaz-içi personel oturumu. Org Supabase oturumunun ÜSTÜNDE app-içi bir kimlik.
// localStorage'da hafif tutulur — gerçek Supabase Auth veya RLS sınırı
// değildir. `can` yalnızca kiosk arayüzünün uygulama-içi davranışını
// belirler; hassas veri güvenliği için sunucu tarafı auth gerekir.
export interface StaffSession {
    id: string;
    name: string;
    color: string;
    role: StaffRole;
    permissions: StaffPermission[];
}

interface StaffSessionContextValue {
    staff: StaffSession | null;
    login: (s: StaffSession) => void;
    logout: () => void;
    can: (permission: StaffPermission) => boolean;
}

const KEY_PREFIX = 'luera_staff_session';
const StaffSessionContext = createContext<StaffSessionContextValue | null>(null);

interface StaffDbRow {
    id?: unknown;
    organization_id?: unknown;
    name?: unknown;
    color?: unknown;
    role?: unknown;
    specialty?: unknown;
    is_active?: unknown;
}

function normalizeSession(value: unknown): StaffSession | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<StaffSession>;
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
    const role = normalizeStaffRole(raw.role);
    return {
        id: raw.id,
        name: raw.name,
        color: typeof raw.color === 'string' ? raw.color : '#8B5CF6',
        role,
        // Yetki listesini rolden yeniden üret; eski veya elle değiştirilmiş
        // localStorage verisini otorite kabul etme.
        permissions: permissionsForStaffRole(role),
    };
}

function sessionFromDb(value: unknown, expectedOrgId: string): StaffSession | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as StaffDbRow;
    if (
        typeof row.id !== 'string'
        || typeof row.organization_id !== 'string'
        || row.organization_id !== expectedOrgId
        || typeof row.name !== 'string'
        || row.is_active !== true
    ) return null;
    const role = normalizeStaffRole(
        typeof row.role === 'string' ? row.role : null,
        typeof row.specialty === 'string' ? row.specialty : null,
    );
    return {
        id: row.id,
        name: row.name,
        color: typeof row.color === 'string' ? row.color : '#8B5CF6',
        role,
        permissions: permissionsForStaffRole(role),
    };
}

function readStoredSession(key: string): StaffSession | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? normalizeSession(JSON.parse(raw)) : null;
    } catch { return null; }
}

function sameSession(a: StaffSession, b: StaffSession): boolean {
    return a.id === b.id
        && a.name === b.name
        && a.color === b.color
        && a.role === b.role
        && a.permissions.length === b.permissions.length
        && a.permissions.every((permission, index) => permission === b.permissions[index]);
}

export const StaffSessionProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, orgId } = useAuth();
    // Aynı tarayıcıda başka klinik/owner oturumu açılırsa önceki personel
    // profili taşınmasın. ProtectedRoute sonrasında provider yeniden mount olur.
    const storageKey = user && orgId ? `${KEY_PREFIX}:${orgId}:${user.id}` : null;
    const [session, setSession] = useState<{ scope: string | null; staff: StaffSession | null; validated: boolean }>(() => {
        if (!storageKey) return { scope: null, staff: null, validated: true };
        const restored = readStoredSession(storageKey);
        return { scope: storageKey, staff: restored, validated: !restored };
    });
    const staff = session.scope === storageKey && session.validated ? session.staff : null;

    // Auth/organizasyon kapsamı sonradan çözülürse o kapsama ait kaydı
    // yükle. Başka klinikten kalan personel oturumu asla taşınmaz.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSession((current) => {
                if (current.scope === storageKey) return current;
                if (!storageKey) return { scope: null, staff: null, validated: true };
                const restored = readStoredSession(storageKey);
                return { scope: storageKey, staff: restored, validated: !restored };
            });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [storageKey]);

    // localStorage yalnızca cihaz-içi kolaylıktır; rol/aktiflik için otorite
    // her zaman staff tablosudur. Realtime hızlı yolu, focus/interval ise
    // publication yapılandırılmamış ortamlardaki güvenli yedektir.
    useEffect(() => {
        if (!storageKey || !orgId || session.scope !== storageKey || !session.staff) return;
        const candidate = session.staff;
        const candidateId = candidate.id;
        let alive = true;
        let inFlight = false;

        const closeInvalidSession = () => {
            // Aynı anda başka personel giriş yaptıysa eski isteğin sonucu yeni
            // oturumun storage kaydını silmesin.
            const stored = readStoredSession(storageKey);
            if (!stored || stored.id === candidateId) {
                try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
            }
            setSession((current) => current.scope === storageKey && current.staff?.id === candidateId
                ? { scope: storageKey, staff: null, validated: true }
                : current);
        };

        const validate = async () => {
            if (!alive || inFlight) return;
            inFlight = true;
            const { data, error } = await supabase
                .from('staff')
                .select('*')
                .eq('id', candidateId)
                .eq('organization_id', orgId)
                .maybeSingle();
            inFlight = false;
            if (!alive) return;

            if (error) {
                console.error('Personel oturumu doğrulanamadı', error);
                // Daha önce DB tarafından doğrulanmış oturumu tek bir geçici
                // bağlantı hatasında düşürme; ilk açılışta ise fail-closed.
                if (!session.validated) closeInvalidSession();
                return;
            }

            const authoritative = sessionFromDb(data, orgId);
            if (!authoritative || authoritative.id !== candidateId) {
                closeInvalidSession();
                return;
            }

            if (!session.validated || !sameSession(candidate, authoritative)) {
                try { localStorage.setItem(storageKey, JSON.stringify(authoritative)); } catch { /* ignore */ }
            }
            setSession((current) => {
                if (current.scope !== storageKey || current.staff?.id !== candidateId) return current;
                if (current.validated && sameSession(current.staff, authoritative)) return current;
                return { scope: storageKey, staff: authoritative, validated: true };
            });
        };

        void validate();
        const interval = window.setInterval(() => { void validate(); }, 15_000);
        const revalidateWhenVisible = () => {
            if (document.visibilityState === 'visible') void validate();
        };
        const revalidateOnline = () => { void validate(); };
        document.addEventListener('visibilitychange', revalidateWhenVisible);
        window.addEventListener('focus', revalidateWhenVisible);
        window.addEventListener('online', revalidateOnline);

        const channel = supabase
            .channel(`staff-session:${orgId}:${candidateId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'staff', filter: `id=eq.${candidateId}`,
            }, () => { void validate(); })
            .subscribe();

        return () => {
            alive = false;
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', revalidateWhenVisible);
            window.removeEventListener('focus', revalidateWhenVisible);
            window.removeEventListener('online', revalidateOnline);
            void supabase.removeChannel(channel);
        };
    }, [storageKey, orgId, session.scope, session.staff, session.validated]);

    const login = useCallback((s: StaffSession) => {
        const normalized = normalizeSession(s);
        if (!normalized || !storageKey) return;
        // Yetkiler DB kontrolü tamamlanana kadar tüketiciye açılmaz.
        setSession({ scope: storageKey, staff: normalized, validated: false });
        try { localStorage.setItem(storageKey, JSON.stringify(normalized)); } catch { /* ignore */ }
    }, [storageKey]);

    const logout = useCallback(() => {
        setSession({ scope: storageKey, staff: null, validated: true });
        if (!storageKey) return;
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }, [storageKey]);

    const can = useCallback(
        (permission: StaffPermission) => Boolean(staff?.permissions.includes(permission)),
        [staff],
    );

    return <StaffSessionContext.Provider value={{ staff, login, logout, can }}>{children}</StaffSessionContext.Provider>;
};

export function useStaffSession(): StaffSessionContextValue {
    const ctx = useContext(StaffSessionContext);
    if (!ctx) throw new Error('useStaffSession must be used within StaffSessionProvider');
    return ctx;
}
