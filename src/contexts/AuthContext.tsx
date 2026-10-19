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
    signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }>;
    logout: () => Promise<void>;
    /** İşletme oturum AÇILDIKTAN sonra kurulduysa (Apple/Google köprüsü) yeniden oku. */
    refreshOrg: () => Promise<string | null>;
    /**
     * Bu işletmedeki GERÇEK rol (`organization_members.role`): 'owner' |
     * 'admin' | 'member'; okunamadıysa null. `user.role` tarihsel olarak sabit
     * 'Admin' — onu okuyan yerler (BeautyPackages) değişmesin diye ayrı alan.
     * Sol alttaki etiket ve Ayarlar → Hesabım bunu gösterir.
     */
    orgRole: string | null;
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

async function resolveOrg(userId: string): Promise<{ id: string | null; role: string | null }> {
    const { data } = await supabase
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
    return { id: data?.org_id ?? null, role: (data as { role?: string | null } | null)?.role ?? null };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [orgRole, setOrgRole] = useState<string | null>(null);
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
                const org = await resolveOrg(supabaseUser.id);
                setOrgId(org.id);
                setOrgRole(org.role);
            }
        } else {
            resolvedForUserRef.current = null;
            setOrgId(null);
            setOrgRole(null);
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

    /*
     * OTURUM DÖNDÜ MÜ — bu ayrım yapılmıyordu.
     *
     * Eskiden yalnız `error`a bakılıyor, `data` atılıyordu: e-posta doğrulaması
     * açıkken sunucu kullanıcıyı AÇIYOR ama oturum VERMİYOR. Hata olmadığı için
     * ekran "Hesabınız oluşturuldu! Giriş yapabilirsiniz." diyordu ve kişi
     * giremiyordu. Mobil bu ayrımı baştan yapıyor
     * (mobile/src/api/auth.ts → `if (!data.session) ... email_confirmation_required`);
     * masaüstü yapmıyordu.
     *
     * Not: GoTrue bu kipte ZATEN KAYITLI bir e-postayı da oturumsuz cevaplıyor
     * (hesap sızdırmamak için). İkisi ayırt edilemiyor, metin ikisini de kapsar.
     */
    const signup = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }> => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { name } },
            });
            if (error) return { success: false, error: error.message };
            return { success: true, needsConfirmation: !data.session };
        } catch {
            return { success: false, error: 'Kayıt olurken bir hata oluştu' };
        }
    };

    /*
     * İŞLETME SONRADAN AÇILDIYSA — 2026-10-19, canlıda Apple ile denendi.
     *
     * orgId kullanıcı başına BİR KEZ çözülüyor (resolvedForUserRef). Apple/Google
     * ile ilk kez giren kişinin o an işletmesi YOK; köprüde "Yeni işletme
     * oluştur" deyince işletme sunucuda açılıyor ama burada null kalıyordu →
     * Kurulum sihirbazı "Kaydedilemedi" diyordu (updateSettings orgId ister).
     */
    const refreshOrg = async (): Promise<string | null> => {
        const { data: { user: current } } = await supabase.auth.getUser();
        if (!current) return null;
        resolvedForUserRef.current = current.id;
        const org = await resolveOrg(current.id);
        setOrgId(org.id);
        setOrgRole(org.role);
        return org.id;
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
                orgRole,
                refreshOrg,
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
