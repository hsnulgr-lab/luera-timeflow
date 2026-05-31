import { supabase } from '@/lib/supabase';

export type IntegrationModule = 'leadflow' | 'callflow';

export interface IntegrationConnection {
    id: string;
    user_id: string;
    module: IntegrationModule;
    api_key: string;
    active: boolean;
    created_at: string;
    last_used_at: string | null;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Oturum açık değil');
    return user.id;
}

export async function getCurrentUserId(): Promise<string> {
    return currentUserId();
}

/**
 * Mevcut kullanıcının organizasyon ID'sini döner.
 * integration_connections tablosu organization_id NOT NULL olduğu için
 * her insert'te bu gerekli.
 */
async function currentOrgId(): Promise<string> {
    const uid = await currentUserId();
    const { data } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle();
    if (!data?.org_id) throw new Error('Organizasyon bulunamadı. Lütfen tekrar giriş yapın.');
    return data.org_id;
}

// ─── Connection string ────────────────────────────────────────────────────────

/** Kopyalanacak bağlantı string'i: api_key|user_id */
export function buildConnectionString(apiKey: string, userId: string): string {
    return `${apiKey}|${userId}`;
}

// ─── Key yönetimi ─────────────────────────────────────────────────────────────

/** TimeFlow'un belirtilen modül için ürettiği aktif key'i getir */
export async function getMyKey(module: IntegrationModule): Promise<IntegrationConnection | null> {
    const uid = await currentUserId();
    const { data } = await supabase
        .from('integration_connections')
        .select('id, user_id, module, api_key, active, created_at, last_used_at')
        .eq('user_id', uid)
        .eq('module', module)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return data ?? null;
}

/** Yeni key üret — eskiyi pasife al */
export async function generateMyKey(module: IntegrationModule): Promise<IntegrationConnection> {
    const uid = await currentUserId();
    const orgId = await currentOrgId();

    // Mevcut aktif key'i pasife al
    await supabase
        .from('integration_connections')
        .update({ active: false })
        .eq('user_id', uid)
        .eq('module', module)
        .eq('active', true);

    // Yeni key oluştur (organization_id dahil)
    const { data, error } = await supabase
        .from('integration_connections')
        .insert({ user_id: uid, module, organization_id: orgId })
        .select('id, user_id, module, api_key, active, created_at, last_used_at')
        .single();

    if (error || !data) throw new Error(error?.message ?? 'Key oluşturulamadı');
    return data;
}

/** Aktif key'i iptal et */
export async function revokeMyKey(module: IntegrationModule): Promise<void> {
    const uid = await currentUserId();
    await supabase
        .from('integration_connections')
        .update({ active: false })
        .eq('user_id', uid)
        .eq('module', module)
        .eq('active', true);
}

// ─── Karşı modül key yönetimi ─────────────────────────────────────────────────

/** Diğer modülden gelen key'i settings tablosuna kaydet */
export async function saveIncomingKey(module: IntegrationModule, key: string): Promise<void> {
    const uid = await currentUserId();
    const col = module === 'leadflow' ? 'leadflow_api_key' : 'callflow_api_key';
    await supabase
        .from('settings')
        .update({ [col]: key || null })
        .eq('user_id', uid);
}

/** Diğer modülden kayıtlı key'i getir */
export async function getIncomingKey(module: IntegrationModule): Promise<string | null> {
    const uid = await currentUserId();
    const col = module === 'leadflow' ? 'leadflow_api_key' : 'callflow_api_key';
    const { data } = await supabase
        .from('settings')
        .select(col)
        .eq('user_id', uid)
        .maybeSingle();
    return (data as Record<string, string | null> | null)?.[col] ?? null;
}

// ─── Bağlantı testi ───────────────────────────────────────────────────────────

/** LUERA Gateway üzerinden bağlantıyı test et */
export async function testConnection(key: string): Promise<boolean> {
    try {
        const res = await fetch('https://n8n.vps.lueratech.com/webhook/gateway/v1/event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify({ event_type: 'ping', source_module: 'timeflow' }),
        });
        return res.ok || res.status === 400 || res.status === 422;
    } catch {
        return false;
    }
}
