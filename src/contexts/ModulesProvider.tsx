import { createContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import { DEFAULT_MODULES, modulesForSector, normalizeModules } from '@/lib/modules';
import type { ModuleKey, Modules } from '@/types';

export interface ModulesContextValue {
    modules: Modules;
    isLoading: boolean;
    isEnabled: (key: ModuleKey) => boolean;
    setModule: (key: ModuleKey, value: boolean) => Promise<void>;
    applySectorDefaults: (sector: string) => Promise<void>;
}

export const ModulesContext = createContext<ModulesContextValue | null>(null);

// AuthContext, ModulesProvider mount olmadan önce orgId'yi zaten çözmüş olur
// (App.tsx: ProtectedRoute → ModulesProvider sırası, bkz. AuthContext.isLoading).
// Yine de cache'i useEffect yerine lazy state initializer'da okuyoruz: useEffect
// ilk boyamadan SONRA çalışır, o yüzden DEFAULT_MODULES ile bir kare render
// olup hemen ardından cache'e geçme riski kalırdı (Dashboard boş bir kare
// görünüp değişiyordu). Lazy init ile ilk render zaten doğru veriyle başlar.
function initialModules(orgId: string | null): Modules {
    if (!orgId) return DEFAULT_MODULES;
    const cached = readCache<Modules>(`modules:${orgId}`);
    return cached ? normalizeModules(cached) : DEFAULT_MODULES;
}

export const ModulesProvider = ({ children }: { children: React.ReactNode }) => {
    const { orgId } = useAuth();
    const [modules, setModules] = useState<Modules>(() => initialModules(orgId));
    const [isLoading, setIsLoading] = useState<boolean>(() => !orgId || readCache<Modules>(`modules:${orgId}`) == null);

    useEffect(() => {
        if (!orgId) return;
        let alive = true;
        const cached = readCache<Modules>(`modules:${orgId}`);
        if (cached) { setModules(normalizeModules(cached)); setIsLoading(false); } else setIsLoading(true);
        (async () => {
            const { data, error } = await supabase
                .from('organizations')
                .select('modules')
                .eq('id', orgId)
                .maybeSingle();
            if (!alive) return;
            if (!error && data) {
                const next = normalizeModules(data.modules);
                setModules(next);
                writeCache(`modules:${orgId}`, next);
            }
            setIsLoading(false);
        })();
        return () => { alive = false; };
    }, [orgId]);

    // Realtime: modüller başka sekme/cihazda (ör. Ayarlar > Modüller) değiştirilince
    // bu sekme reload beklemeden anında öğrensin — SWR'nin "eski değer bir an
    // görünüp kayboluyor" penceresi sadece ilk-yükte kalır, sonraki değişiklikler
    // için hiç oluşmaz (bkz. 047_organizations_realtime.sql).
    useEffect(() => {
        if (!orgId) return;
        const ch = supabase
            .channel(`organizations:${orgId}:${Math.random().toString(36).slice(2)}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'organizations', filter: `id=eq.${orgId}` },
                (payload) => {
                    const next = normalizeModules((payload.new as { modules?: unknown })?.modules);
                    setModules(next);
                    writeCache(`modules:${orgId}`, next);
                })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [orgId]);

    // Tek modülü değiştir — optimistic, hata olursa geri al
    const setModule = useCallback(async (key: ModuleKey, value: boolean) => {
        if (!orgId) return;
        const prev = modules;
        const next = { ...modules, [key]: value };
        setModules(next);
        writeCache(`modules:${orgId}`, next);
        const { error } = await supabase.from('organizations').update({ modules: next }).eq('id', orgId);
        if (error) { setModules(prev); writeCache(`modules:${orgId}`, prev); }
    }, [orgId, modules]);

    // Sektör değişince o sektörün varsayılan modüllerini uygula
    const applySectorDefaults = useCallback(async (sector: string) => {
        if (!orgId) return;
        const next = modulesForSector(sector);
        const prev = modules;
        setModules(next);
        writeCache(`modules:${orgId}`, next);
        const { error } = await supabase.from('organizations').update({ modules: next }).eq('id', orgId);
        if (error) { setModules(prev); writeCache(`modules:${orgId}`, prev); }
    }, [orgId, modules]);

    const isEnabled = useCallback((key: ModuleKey) => modules[key] !== false, [modules]);

    return (
        <ModulesContext.Provider value={{ modules, isLoading, isEnabled, setModule, applySectorDefaults }}>
            {children}
        </ModulesContext.Provider>
    );
};
