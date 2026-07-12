import { useLocation, useNavigate } from 'react-router-dom';
import { useModules } from '@/hooks/useModules';
import { useManagerMode } from '@/contexts/ManagerModeProvider';
import type { ModuleKey } from '@/types';
import { T } from './theme';

// İkon path'leri (handoff README)
const ICONS: Record<string, string> = {
    home: 'M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5ZM9 22V12h6v10',
    takvim: 'M3 5h18v16H3V5ZM3 10h18M8 3v3M16 3v3M8 14h1M12 14h1M16 14h1M8 18h1M12 18h1',
    masa: 'M3 9h18M5 9V7a2 2 0 012-2h10a2 2 0 012 2v2M6 9v10M18 9v10M4 14h16',
    mus: 'M8 8a3.5 3.5 0 100-7 3.5 3.5 0 000 7ZM2 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 6a3 3 0 010 6M19 20c0-3-1.5-5.2-3.5-6',
    kasa: 'M3 8h18M3 8a2 2 0 00-2 2v9a2 2 0 002 2h18a2 2 0 002-2v-9a2 2 0 00-2-2M3 8V6a2 2 0 012-2h14a2 2 0 012 2v2M16 14a2 2 0 11-4 0 2 2 0 014 0Z',
    analiz: 'M4 20V10M10 20V4M16 20v-7M3 20h18',
};

interface Tab { id: string; label: string; icon: string; module?: ModuleKey; prio: number }

// Bar kapasitesi: ortada FAB varken 4 yan sekme; 5 modül açıkken FAB gizlenir
// ve 5 sekme tam gösterilir (hiçbiri düşmez). 5'ten fazlaysa (Yönetici+Analiz)
// PRIO ile en düşük öncelikli (Analiz — Yönetim grid'inde zaten var) elenir.
// Gösterilenler her zaman doğal bar sırasına göre dizilir.
const BAR_ORDER = ['/', '/calendar', '/masa', '/customers', '/kasa', '/analytics'];

export const BottomTabBar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isEnabled, isLoading: modulesLoading } = useModules();
    const { isManager } = useManagerMode();

    // Aday sekmeler — core (module yok) + açık modüller. Analiz finansal olduğu
    // için sadece Yönetici modunda görünür.
    const candidates: Tab[] = [
        { id: '/', label: 'Ana', icon: ICONS.home, prio: 0 },
        { id: '/kasa', label: 'Kasa', icon: ICONS.kasa, module: 'kasa', prio: 1 },
        { id: '/customers', label: 'Müşteri', icon: ICONS.mus, prio: 2 },
        { id: '/calendar', label: 'Takvim', icon: ICONS.takvim, module: 'randevu', prio: 3 },
        { id: '/masa', label: 'Masa', icon: ICONS.masa, module: 'masa', prio: 4 },
        ...(isManager ? [{ id: '/analytics', label: 'Analiz', icon: ICONS.analiz, module: 'analiz' as ModuleKey, prio: 5 }] : []),
    ];
    // Restoran kimliği: masa açıkken randevu-yüzü sekmesi (Takvim) gizlenir —
    // ANCAK randevu modülü de bilinçli açılmışsa (hibrit işletme: masa + randevu
    // birlikte) Takvim'e alt bardan erişim kaybolmasın diye gösterilmeye devam eder.
    const restaurant = !modulesLoading && isEnabled('masa');
    const hybrid = restaurant && !modulesLoading && isEnabled('randevu');
    const byBarOrder = (a: Tab, b: Tab) => BAR_ORDER.indexOf(a.id) - BAR_ORDER.indexOf(b.id);
    const enabledTabs = candidates
        .filter((t) => (!t.module || (!modulesLoading && isEnabled(t.module))) && !(restaurant && !hybrid && t.id === '/calendar'))
        .sort(byBarOrder);

    // ≤4 sekme → FAB göster (4 yan slot). 5+ sekme → FAB gizle, en fazla 5 sekme.
    const useFab = enabledTabs.length <= 4;
    const cap = useFab ? 4 : 5;
    const shown = enabledTabs.length <= cap
        ? enabledTabs
        : [...enabledTabs].sort((a, b) => a.prio - b.prio).slice(0, cap).sort(byBarOrder);

    const mid = Math.ceil(shown.length / 2);
    const left = shown.slice(0, mid);
    const right = shown.slice(mid);

    // FAB hedefi: restoran (masa) modunda yeni masa rezervasyonu öncelikli;
    // aksi hâlde randevu → yeni randevu, yoksa kasa, o da yoksa müşteri.
    const fabTarget = restaurant ? '/masa?new=1' : !modulesLoading && isEnabled('randevu') ? '/new' : !modulesLoading && isEnabled('kasa') ? '/kasa' : '/customers';

    const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

    const renderTab = (tab: Tab) => {
        const on = isActive(tab.id);
        return (
            <button key={tab.id} type="button" onClick={() => navigate(tab.id)}
                className="flex flex-1 flex-col items-center gap-1 transition-colors" style={{ color: on ? T.orange : T.muted2 }}>
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                    <path d={tab.icon} stroke="currentColor" strokeWidth={on ? 1.9 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 9.5, fontWeight: on ? 750 : 600, letterSpacing: '.02em' }}>{tab.label}</span>
            </button>
        );
    };

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-start"
            style={{ height: 82, paddingTop: 10, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', background: T.surface, borderTop: `1px solid ${T.border}` }}>
            {useFab ? (
                <>
                    {left.map(renderTab)}
                    <div className="flex flex-1 items-center justify-center" style={{ marginTop: -6 }}>
                        <button type="button" aria-label={restaurant ? 'Yeni rezervasyon' : 'Yeni randevu'} onClick={() => navigate(fabTarget)}
                            className="grid place-items-center transition-transform active:scale-95"
                            style={{ width: 52, height: 52, borderRadius: 17, background: T.orange, boxShadow: '0 6px 22px rgba(255,90,31,.40), 0 0 0 1.5px rgba(255,90,31,.6)' }}>
                            <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="#0E0E0E" strokeWidth="2.4" strokeLinecap="round" /></svg>
                        </button>
                    </div>
                    {right.map(renderTab)}
                </>
            ) : (
                shown.map(renderTab)
            )}
        </nav>
    );
};
