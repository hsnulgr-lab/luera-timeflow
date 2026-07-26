import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { waState } from '@/services/whatsapp';

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
    /** Randevu oluşturulur oluşturulmaz giden onay mesajı. */
    confirmation: boolean;
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
    features: { winback: true, renewal: true, recall: true, assistant: false, confirmation: true },
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
            confirmation: f.confirmation ?? true,
        },
    };
}

// Oturum başına bir kez doğrulanan org'lar. Kanca hem Layout'ta (her sayfa) hem
// Ayarlar'da kullanılıyor; her mount'ta Evolution'a gitmemek için modül düzeyinde.
const verifiedOrgs = new Set<string>();

export function useWhatsApp() {
    const { orgId } = useAuth();
    const [connection, setConnection] = useState<WaConnection>(EMPTY);
    const [loading, setLoading] = useState(true);
    // Bayat satırı Evolution'a doğrulatana kadar "düştü" uyarısı gösterilmez.
    const [verifying, setVerifying] = useState(false);
    const verifyingRef = useRef(false);
    // Tabloya hiç ulaşılamadığında ekran "Bağlı Değil" gösteriyordu — gerçekten
    // bağlı olmamakla, migration 070'in çalışmamış olmasını ayırt edilemiyordu.
    const [setupError, setSetupError] = useState<string | null>(null);

    const refresh = useCallback(async (): Promise<WaConnection | null> => {
        if (!orgId) return null;
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
            setLoading(false);
            return null;
        }
        setSetupError(null);
        const next = data ? mapRow(data) : EMPTY;
        setConnection(next);
        setLoading(false);
        return next;
    }, [orgId]);

    /**
     * org_whatsapp satırı yalnızca proxy (service_role) tarafından yazılıyor ve
     * pratikte sadece Ayarlar'daki QR ekranı açıkken tazeleniyordu. Kullanıcı
     * hattı Evolution tarafında ayağa kaldırdığında ya da 'connecting' aşamasında
     * sayfayı kapattığında satır bayat kalıyor; sonuç: tüm sayfalarda yanlış
     * "bağlantı düştü" bandı VE proxy'nin sendWA'da mesajı 'not_connected' diye
     * atlaması. Açılışta bir kez gerçek durumu sorup satırı onartıyoruz —
     * 'state' action'ı Evolution 'open' derse satırı connected'a çekiyor.
     */
    const verifyStale = useCallback(async (row: WaConnection) => {
        if (!orgId || verifyingRef.current) return;
        if (!row.instance || row.status === 'connected') return;   // sorulacak bir şey yok
        if (verifiedOrgs.has(orgId)) return;
        verifiedOrgs.add(orgId);
        verifyingRef.current = true;
        setVerifying(true);
        try {
            const res = await waState();
            if (res?.connected) await refresh();
        } catch {
            // Evolution'a ulaşılamadı — satır ne diyorsa o geçerli.
        } finally {
            verifyingRef.current = false;
            setVerifying(false);
        }
    }, [orgId, refresh]);

    useEffect(() => {
        if (!orgId) return;
        (async () => {
            const row = await refresh();
            if (row) await verifyStale(row);
        })();
        // Bağlantı proxy tarafından (service_role) güncelleniyor; QR okutulduğu
        // anda ekranın kendiliğinden "Bağlı"ya dönmesi için realtime dinliyoruz.
        const ch = supabase
            .channel(`org_whatsapp:${orgId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'org_whatsapp', filter: `organization_id=eq.${orgId}` },
                (payload) => { if (payload.new) setConnection(mapRow(payload.new as Record<string, unknown>)); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [orgId, refresh, verifyStale]);

    return {
        connection,
        loading,
        refresh,
        /** Tablo/migration seviyesinde bir sorun varsa mesajı; yoksa null. */
        setupError,
        isConnected: connection.status === 'connected',
        /**
         * Bağlanmış ama şu an düşmüş — kullanıcıya uyarı gösterilecek durum.
         * Doğrulama sürerken bastırılır: bayat satır yüzünden her açılışta bir
         * anlığına yanlış alarm çalıyordu.
         */
        isBroken: !loading && !verifying
            && connection.status !== 'connected' && Boolean(connection.instance),
    };
}
