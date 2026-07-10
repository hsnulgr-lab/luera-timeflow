import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { clearAllCache } from '@/lib/swrCache';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    orgId: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mapSupabaseUser = (supabaseUser: SupabaseUser | null): User | null => {
    if (!supabaseUser) return null;
    return {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
        role: 'Admin',
    };
};

async function resolveOrgId(userId: string): Promise<string | null> {
    const { data } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
    return data?.org_id ?? null;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Aynı kullanıcı için orgId'yi tekrar sorgulama (TOKEN_REFRESHED vb.
    // olaylarda gereksiz sorgu + state sıfırlanması → veri "gelip gitmesin")
    const resolvedForUserRef = useRef<string | null>(null);

    const handleSession = async (supabaseUser: import('@supabase/supabase-js').User | null) => {
        const mapped = mapSupabaseUser(supabaseUser);
        setUser(mapped);
        if (supabaseUser) {
            if (resolvedForUserRef.current !== supabaseUser.id) {
                resolvedForUserRef.current = supabaseUser.id;
                const id = await resolveOrgId(supabaseUser.id);
                setOrgId(id);
            }
        } else {
            resolvedForUserRef.current = null;
            setOrgId(null);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            handleSession(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            // supabase-js v2: bu callback auth kilidini tutar; içinde await'li
            // Supabase sorgusu (resolveOrgId) deadlock yaratır → sonsuz spinner.
            // setTimeout ile kilidin dışına ertele.
            setTimeout(() => handleSession(session?.user ?? null), 0);
        });

        return () => subscription.unsubscribe();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) return { success: false, error: error.message };
            setUser(mapSupabaseUser(data.user));
            return { success: true };
        } catch {
            return { success: false, error: 'Giriş yapılırken bir hata oluştu' };
        }
    };

    const signup = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { name } },
            });
            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch {
            return { success: false, error: 'Kayıt olurken bir hata oluştu' };
        }
    };

    const logout = async () => {
        await supabase.auth.signOut();
        clearAllCache(); // SWR önbelleği — ortak cihazda sonraki kullanıcıya veri sızmasın
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                orgId,
                isAuthenticated: !!user,
                isLoading,
                login,
                signup,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
