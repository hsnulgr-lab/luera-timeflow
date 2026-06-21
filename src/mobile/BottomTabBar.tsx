import { useLocation, useNavigate } from 'react-router-dom';
import { T } from './theme';

// Alt sekme çubuğu — handoff README birebir: 82px yükseklik, ortada FAB.
// Ana / Takvim / [+] / Müşteri / Kasa
const TABS = [
    { id: '/', label: 'Ana', path: 'M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5ZM9 22V12h6v10' },
    { id: '/calendar', label: 'Takvim', path: 'M3 4h18v17a0 0 0 01 3H3V4ZM3 9h18M8 2v3M16 2v3' },
    { id: '__fab__', label: '', path: '' },
    { id: '/customers', label: 'Müşteri', path: 'M8 8a3.5 3.5 0 100-7 3.5 3.5 0 000 7ZM2 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 6a3 3 0 010 6M19 20c0-3-1.5-5.2-3.5-6' },
    { id: '/kasa', label: 'Kasa', path: 'M2.5 6h19v13a0 0 0 01 2.5H2.5V6ZM2.5 11h19' },
] as const;

export const BottomTabBar = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path: string) =>
        path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-40 flex items-start"
            style={{
                height: 82,
                paddingTop: 10,
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
                background: T.surface,
                borderTop: `1px solid ${T.border}`,
            }}
        >
            {TABS.map((tab) => {
                if (tab.id === '__fab__') {
                    return (
                        <div key="fab" className="flex flex-1 items-center justify-center" style={{ marginTop: -6 }}>
                            <button
                                type="button"
                                aria-label="Yeni randevu"
                                onClick={() => navigate('/new')}
                                className="grid place-items-center transition-transform active:scale-95"
                                style={{
                                    width: 52, height: 52, borderRadius: 17, background: T.orange,
                                    boxShadow: '0 6px 22px rgba(255,90,31,.40), 0 0 0 1.5px rgba(255,90,31,.6)',
                                }}
                            >
                                <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 4v12M4 10h12" stroke="#0E0E0E" strokeWidth="2.4" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>
                    );
                }

                const on = isActive(tab.id);
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => navigate(tab.id)}
                        className="flex flex-1 flex-col items-center gap-1 transition-colors"
                        style={{ color: on ? T.orange : T.muted2 }}
                    >
                        <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                            <path d={tab.path} stroke="currentColor" strokeWidth={on ? 1.9 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span style={{ fontSize: 9.5, fontWeight: on ? 750 : 600, letterSpacing: '.02em' }}>{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};
