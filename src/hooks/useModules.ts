import { useContext } from 'react';
import { ModulesContext, type ModulesContextValue } from '@/contexts/ModulesProvider';

// Modül durumunu okuyan/değiştiren hook. ModulesProvider içinde kullanılmalı.
export function useModules(): ModulesContextValue {
    const ctx = useContext(ModulesContext);
    if (!ctx) throw new Error('useModules must be used within ModulesProvider');
    return ctx;
}

// Veri hook'larının modül kapısı: modül kapalıysa fetch/realtime başlatılmaz.
// Provider DIŞINDA (örn. /personel staff modu) fail-open: true döner — staff
// modu zaten yalnız ilgili yüzeyleri mount eder, orada modül kapısı gerekmez.
// Modüller yüklenene kadar false: erken fetch yerine yüklenince tetiklenir.
export function useModuleGate(key: Parameters<ModulesContextValue['isEnabled']>[0]): boolean {
    const ctx = useContext(ModulesContext);
    if (!ctx) return true;
    return !ctx.isLoading && ctx.isEnabled(key);
}
