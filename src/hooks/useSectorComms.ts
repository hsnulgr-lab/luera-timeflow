import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { commsForSector, type SectorComms } from '@/lib/sectorProfiles';

// settings.comms (066) okuma/yazma. Sektör varsayılanı src/lib/sectorProfiles.ts'te;
// burada yalnız org'un o varsayılanı ezmesi yönetilir.
//
// custom=true olan kayda useReservations'taki senkron dokunmaz — yani klinik
// kendi metnini yazdıktan sonra sektör varsayılanı onu geri ezmez.
export interface StoredComms extends SectorComms {
    sector?: string;
    custom?: boolean;
}

export function useSectorComms(sector: string) {
    const { orgId } = useAuth();
    const fallback = commsForSector(sector);
    const [stored, setStored] = useState<StoredComms | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    /** 066 uygulanmamışsa düzenleme UI'ı gizlenir. */
    const [available, setAvailable] = useState(true);

    useEffect(() => {
        if (!orgId) return;
        let alive = true;
        (async () => {
            const { data, error } = await supabase
                .from('settings').select('comms').eq('organization_id', orgId).maybeSingle();
            if (!alive) return;
            if (error) {
                if (error.code === '42703' || error.code === 'PGRST204') setAvailable(false);
                setLoading(false);
                return;
            }
            setStored((data?.comms as StoredComms) ?? null);
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [orgId, sector]);

    /** Görüntülenecek etkin profil: org override'ı varsa o, yoksa sektör varsayılanı. */
    const effective: StoredComms = stored?.persona ? stored : { ...fallback, sector };
    const isCustom = Boolean(stored?.custom);

    const save = useCallback(async (next: SectorComms) => {
        if (!orgId) return false;
        setSaving(true);
        const payload: StoredComms = { ...next, sector, custom: true };
        const { error } = await supabase.from('settings').update({ comms: payload }).eq('organization_id', orgId);
        setSaving(false);
        if (error) { toast.error('Mesaj dili kaydedilemedi'); console.error(error); return false; }
        setStored(payload);
        toast.success('Mesaj dili kaydedildi');
        return true;
    }, [orgId, sector]);

    /** Override'ı bırak, sektör varsayılanına dön. */
    const reset = useCallback(async () => {
        if (!orgId) return false;
        setSaving(true);
        const payload: StoredComms = { ...commsForSector(sector), sector, custom: false };
        const { error } = await supabase.from('settings').update({ comms: payload }).eq('organization_id', orgId);
        setSaving(false);
        if (error) { toast.error('Varsayılana dönülemedi'); return false; }
        setStored(payload);
        toast.success('Sektör varsayılanına dönüldü');
        return true;
    }, [orgId, sector]);

    return { effective, fallback, isCustom, loading, saving, available, save, reset };
}
