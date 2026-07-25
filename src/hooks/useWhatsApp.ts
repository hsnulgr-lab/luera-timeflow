import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// WhatsApp bağlantı durumu — org başına tek satır (org_whatsapp, migration 070).
//
// Eskiden bu bilgi settings.whatsapp_instance'taydı; settings kullanıcı başına
// tek satır olduğu için (user_id UNIQUE) 3 üyeli bir org'da 3 farklı değer
// oluşabiliyor ve sunucu "bu instance hangi org'un?" sorusunu belirsiz
// cevaplıyordu. Artık bağlantı org'a ait, instance adı org id'den türetiliyor.

export interface WaFeatures {
    winback: boolean;
    renewal: boolean;
    recall: boolean;
    assistant: boolean;
}

export interface WaConnection {
    instance: string | null;
    status: 'disconnected' | 'connecting' | 'connected';
    connectedAt: string | null;
    lastError: string | null;
    features: WaFeatures;
}

const EMPTY: WaConnection = {
    instance: null, status: 'disconnected', connectedAt: null, lastError: null,
    features: { winback: true, renewal: true, recall: true, assistant: false },
};

function mapRow(row: Record<string, unknown>): WaConnection {
    const f = (row.features ?? {}) as Partial<WaFeatures>;
    return {
        instance: (row.instance as string) ?? null,
        status: (row.status as WaConnection['status']) ?? 'disconnected',
        connectedAt: (row.connected_at as string) ?? null,
        lastError: (row.last_error as string) ?? null,
        features: {
            winback: f.winback ?? true,
            renewal: f.renewal ?? true,
            recall: f.recall ?? true,
            assistant: f.assistant ?? false,
        },
    };
}

export function useWhatsApp() {
    const { orgId } = useAuth();
    const [connection, setConnection] = useState<WaConnection>(EMPTY);
    const [loading, setLoading] = useState(true);
    // Tabloya hiç ulaşılamadığında ekran "Bağlı Değil" gösteriyordu — gerçekten
    // bağlı olmamakla, migration 070'in çalışmamış olmasını ayırt edilemiyordu.
    const [setupError, setSetupError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!orgId) return;
        const { data, error } = await supabase
            .from('org_whatsapp')
            .select('instance, status, connected_at, last_error, features')
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) {
            // 42P01 = tablo yok, PGRST205 = şema önbelleğinde yok → migration eksik
            const missing = error.code === '42P01' || error.code === 'PGRST205'
                || /org_whatsapp/i.test(error.message || '');
            setSetupError(missing
                ? 'Veritabanı kurulumu eksik: 070_whatsapp_multitenant.sql çalıştırılmamış.'
                : `WhatsApp durumu okunamadı (${error.code || 'hata'}).`);
            setConnection(EMPTY);
        } else {
            setSetupError(null);
            setConnection(data ? mapRow(data) : EMPTY);
        }
        setLoading(false);
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        (async () => { await refresh(); })();
        // Bağlantı proxy tarafından (service_role) güncelleniyor; QR okutulduğu
        // anda ekranın kendiliğinden "Bağlı"ya dönmesi için realtime dinliyoruz.
        const ch = supabase
            .channel(`org_whatsapp:${orgId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'org_whatsapp', filter: `organization_id=eq.${orgId}` },
                (payload) => { if (payload.new) setConnection(mapRow(payload.new as Record<string, unknown>)); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [orgId, refresh]);

    return {
        connection,
        loading,
        refresh,
        /** Tablo/migration seviyesinde bir sorun varsa mesajı; yoksa null. */
        setupError,
        isConnected: connection.status === 'connected',
        /** Bağlanmış ama şu an düşmüş — kullanıcıya uyarı gösterilecek durum. */
        isBroken: connection.status !== 'connected' && Boolean(connection.instance),
    };
}
