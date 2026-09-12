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

/**
 * Arayüz kapısı AÇIK mı?
 *
 * Sunucu tarafındaki kapı `ENTITLEMENT_ENFORCE` bayrağına bakıyor ve kapalıyken
 * satıra HİÇ bakmadan herkesi geçiriyor (`_shared/entitlement.ts` · checkAccess).
 * Tarayıcı kapısı o bayrağı hiç tanımıyordu: sunucu "gölge kipteyim, kimseyi
 * durdurmuyorum" derken tarayıcı kullanıcıyı `/abonelik`e atıyordu. Gölge kip
 * gölge değildi — uygulamanın tamamı kapalıydı.
 *
 * Bayrak `app_secrets`te ve orayı yalnız service_role okuyabiliyor (doğrusu da
 * bu). O yüzden tarayıcı tarafında derleme zamanı bir eş var.
 *
 * VARSAYILAN KAPALI. Değişkeni koymayı unutan bir dağıtım, bütün müşterileri
 * kilitlemek yerine kapıyı açık bırakır. Yanlış tarafta hata yapmanın ucuz
 * olanı bu: gerçek kapı zaten RLS'te ve edge fonksiyonlarında.
 */
const ENFORCE = String(import.meta.env.VITE_ENTITLEMENT_ENFORCE ?? '').trim() === 'true';

export interface Entitlement extends Access {
    loading: boolean;
    /** Kapı kapalı — /abonelik'e yönlendirilmeli. */
    locked: boolean;
    /** Satırdaki plan/dönem — duvar "Pro planı aktif" diyebilsin diye. */
    plan: string | null;
    cycle: string | null;
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
        plan: loaded?.row?.plan ?? null,
        cycle: loaded?.row?.cycle ?? null,
        loading,
        // Yalnız satır GERÇEKTEN okunduysa VE kapı açıksa kilitlenir.
        locked: ENFORCE && !loading && loaded !== null && !access.ok,
        refresh,
    };
}
