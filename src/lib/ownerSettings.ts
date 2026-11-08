import { supabase } from '@/lib/supabase';

// İşletmenin ayar satırı = SAHİBİNİN satırı (sunucudaki karşılığı
// supabase/functions/_shared/org.ts · ownerSettings).
//
// settings kullanıcı başına bir satır, işletme başına değil. Bir işletmeye
// ikinci bir giriş (ekip üyesi) eklenince panel onun için varsayılan değerlerle
// yeni bir satır açıyor, sektör eşitlemesi de üyenin satırına göre sahibin
// tonunu eziyordu. Okuma ve yazma artık sahibin satırına (2026-11-08).

/** İşletme sahibinin kullanıcı kimliği; okunamazsa null (çağıran kendi satırına düşer). */
export async function orgOwnerId(orgId: string | null | undefined): Promise<string | null> {
    if (!orgId) return null;
    const { data, error } = await supabase.from('organizations').select('owner_id').eq('id', orgId).maybeSingle();
    if (error) return null;
    return (data as { owner_id?: string | null } | null)?.owner_id ?? null;
}

/**
 * Ayar satırından kolonlar: sahibin satırı, yoksa işletmenin en eski satırı.
 * `.maybeSingle()` işletme filtresiyle tek başına iki satırda hata veriyordu.
 */
export async function readOwnerSettings<T>(orgId: string, cols: string) {
    const owner = await orgOwnerId(orgId);
    if (owner) {
        const res = await supabase.from('settings').select(cols)
            .eq('organization_id', orgId).eq('user_id', owner).maybeSingle();
        if (res.error || res.data) return { data: (res.data as T | null) ?? null, error: res.error };
    }
    const res = await supabase.from('settings').select(cols)
        .eq('organization_id', orgId).order('created_at', { ascending: true }).limit(1).maybeSingle();
    return { data: (res.data as T | null) ?? null, error: res.error };
}
