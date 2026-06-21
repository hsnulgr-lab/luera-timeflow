import { useContext } from 'react';
import { ModulesContext, type ModulesContextValue } from '@/contexts/ModulesProvider';

// Modül durumunu okuyan/değiştiren hook. ModulesProvider içinde kullanılmalı.
export function useModules(): ModulesContextValue {
    const ctx = useContext(ModulesContext);
    if (!ctx) throw new Error('useModules must be used within ModulesProvider');
    return ctx;
}
