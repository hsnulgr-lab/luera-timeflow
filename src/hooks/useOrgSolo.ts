import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Telefondaki tek kişilik kip mi (`organizations.solo`, göç 108). O kipte
 * işletme sahibi TEK personel satırıdır; paket sınırı kişileri sayarken
 * (`teamSize`) sahibi iki kez saymamak için gerekir. Okunamazsa null.
 *
 * Her çağrı tazedir: kip telefondan değişebilir (ekibe geçiş, göç 113).
 */
export async function readOrgSolo(orgId: string): Promise<boolean | null> {
    const { data, error } = await supabase.from('organizations').select('solo').eq('id', orgId).maybeSingle();
    return error || !data ? null : Boolean(data.solo);
}

/** Sayfa açılışında bir kez okunan kip; okunana dek (ya da okunamazsa) null. */
export function useOrgSolo(): boolean | null {
    const { orgId } = useAuth();
    const [solo, setSolo] = useState<boolean | null>(null);
    useEffect(() => {
        if (!orgId) return;
        let live = true;
        void readOrgSolo(orgId).then((v) => { if (live) setSolo(v); });
        return () => { live = false; };
    }, [orgId]);
    return solo;
}
