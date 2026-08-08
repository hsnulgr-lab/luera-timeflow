import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import { computeAccess, type Access, type EntitlementRow } from '@shared/entitlement';

// "Bu işletme şu an TimeFlow'u kullanabilir mi?" — istemci tarafı.
//
// Karar MANTIĞI kopyalanmıyor: aynı computeAccess fonksiyonu edge
// fonksiyonlarında da çalışıyor. İki ayrı hesap, kullanıcının ekranı görüp
// kaydedememesi demekti.
//
// Bu kontrol bir GÜVENLİK ÖNLEMİ DEĞİL, bir arayüz kararıdır. Gerçek kapı
// RLS'te (has_timeflow_access) ve edge fonksiyonlarında; buradaki iş
// kullanıcıyı çalışmayan bir uygulamanın içinde dolaştırmamak.

export interface Entitlement extends Access {
    loading: boolean;
    /** Kapı kapalı — /abonelik'e yönlendirilmeli. */
    locked: boolean;
    refresh: () => Promise<void>;
}

/** Satır YOK ile satır OKUNAMADI'yı ayırmak için: ikisi farklı kararlar. */
type Loaded = { row: EntitlementRow | null } | null;

export function useEntitlement(): Entitlement {
    const { orgId } = useAuth();
    const [loaded, setLoaded] = useState<Loaded>(null);
    const [loading, setLoading] = useState(true);

    const fetchRow = useCallback(async (id: string) => {
        const { data, error } = await supabase
            .from('org_entitlement')
            .select('state, plan, cycle, trial_ends_at, expires_at, grace_until')
            .eq('organization_id', id)
            .maybeSingle();
        if (error) {
            // Geçici bir ağ/şema hatası yüzünden ödemesini yapmış bir salonu iş
            // saatinin ortasında dışarı atmak, kaçırılan bir aboneden pahalıya
            // patlar. Okunamadıysa KİLİTLEME — gerçek kapı zaten sunucuda.
            console.error('org_entitlement:', error.message);
            setLoaded(null);
        } else {
            const row = (data as EntitlementRow | null) ?? null;
            setLoaded({ row });
            writeCache(`entitlement:${id}`, row);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!orgId) return;
        (async () => {
            // SWR: son bilinen durum anında gösterilir. Bu olmadan her sayfa
            // yenilemesinde bir kare "durum bilinmiyor" geçer ve şerit
            // yanıp söner.
            const cached = readCache<EntitlementRow | null>(`entitlement:${orgId}`);
            if (cached !== null) { setLoaded({ row: cached }); setLoading(false); }
            await fetchRow(orgId);
        })();
    }, [orgId, fetchRow]);

    const refresh = useCallback(async () => {
        if (orgId) await fetchRow(orgId);
    }, [orgId, fetchRow]);

    const access = computeAccess(loaded?.row);
    return {
        ...access,
        loading,
        // Yalnız satır GERÇEKTEN okunduysa kilitlenir.
        locked: !loading && loaded !== null && !access.ok,
        refresh,
    };
}
