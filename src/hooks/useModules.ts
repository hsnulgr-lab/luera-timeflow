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

/**
 * Kasa yüzeylerinin TEK kapısı — "Kasaya gönder", "Tahsilat al", adisyon rozeti
 * ve /kasa'ya giden her buton bunu kullanır.
 *
 * Ayrı bir isim, ayrı bir hook: kasa linkleri kod tabanına dağılmış durumda ve
 * tek sembolle aranabilir olmaları hem denetimi (tests/module-gating) hem de
 * yeni gate'siz link eklenmesini fark etmeyi mümkün kılıyor.
 *
 * Yüklenirken KAPALI döner (useModuleGate politikası) — Sidebar ve BottomTabBar
 * ile aynı davranış: kasası olmayan işletmede bir kare görünüp kaybolan buton
 * olmaz. Modül cache'i lazy-init olduğu için bu yalnız ilk açılışta geçerli.
 */
export const useCashEnabled = (): boolean => useModuleGate('kasa');
