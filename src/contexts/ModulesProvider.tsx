import { createContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
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

export const ModulesProvider = ({ children }: { children: React.ReactNode }) => {
    const { orgId } = useAuth();
    const [modules, setModules] = useState<Modules>(DEFAULT_MODULES);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!orgId) return;
        let alive = true;
        (async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('organizations')
                .select('modules')
                .eq('id', orgId)
                .maybeSingle();
            if (alive && !error && data) setModules(normalizeModules(data.modules));
            if (alive) setIsLoading(false);
        })();
        return () => { alive = false; };
    }, [orgId]);

    // Tek modülü değiştir — optimistic, hata olursa geri al
    const setModule = useCallback(async (key: ModuleKey, value: boolean) => {
        if (!orgId) return;
        const prev = modules;
        const next = { ...modules, [key]: value };
        setModules(next);
        const { error } = await supabase.from('organizations').update({ modules: next }).eq('id', orgId);
        if (error) setModules(prev);
    }, [orgId, modules]);

    // Sektör değişince o sektörün varsayılan modüllerini uygula
    const applySectorDefaults = useCallback(async (sector: string) => {
        if (!orgId) return;
        const next = modulesForSector(sector);
        const prev = modules;
        setModules(next);
        const { error } = await supabase.from('organizations').update({ modules: next }).eq('id', orgId);
        if (error) setModules(prev);
    }, [orgId, modules]);

    const isEnabled = useCallback((key: ModuleKey) => modules[key] !== false, [modules]);

    return (
        <ModulesContext.Provider value={{ modules, isLoading, isEnabled, setModule, applySectorDefaults }}>
            {children}
        </ModulesContext.Provider>
    );
};
