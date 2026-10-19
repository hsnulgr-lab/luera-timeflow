/**
 * Oturumdaki kullanıcının giriş yöntemleri — Hesabım ve hesap silme okur.
 * `user.identities` (GoTrue) + bizim yazdığımız `user_metadata.password_set`:
 * yalnız Apple/Google ile açılmış hesapta "şifre belirle" sonrası e-posta
 * kimliği oluşmuyor, şifrenin varlığını başka türlü bilemiyoruz.
 */
import { useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface AuthFacts { identities: UserIdentity[]; hasPassword: boolean; appleSub: string | null }

export function useAuthFacts(): { facts: AuthFacts | null; reload: () => void } {
    const [facts, setFacts] = useState<AuthFacts | null>(null);
    const [n, setN] = useState(0);
    useEffect(() => {
        let alive = true;
        void supabase.auth.getUser().then(({ data }) => {
            if (!alive || !data.user) return;
            const ids = data.user.identities ?? [];
            const apple = ids.find((i) => i.provider === 'apple');
            setFacts({
                identities: ids,
                hasPassword: ids.some((i) => i.provider === 'email') || Boolean(data.user.user_metadata?.password_set),
                appleSub: apple ? String((apple.identity_data as { sub?: string } | undefined)?.sub ?? apple.id) : null,
            });
        });
        return () => { alive = false; };
    }, [n]);
    return { facts, reload: () => setN((x) => x + 1) };
}
