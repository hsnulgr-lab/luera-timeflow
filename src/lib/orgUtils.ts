import { supabase } from './supabase';

/**
 * Mevcut kullanıcının varsayılan organizasyon ID'sini döner.
 * handle_new_user trigger ile her yeni kullanıcıya otomatik org oluşturulur.
 */
export async function getUserOrgId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

    return data?.org_id ?? null;
}
