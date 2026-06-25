import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomTabBar } from './BottomTabBar';
import { T } from './theme';

// Mobil kabuk: cihaz durum çubuğu yok, içerik scroll alanı + alt sekme çubuğu.
// Tasarım koyu temadır (iPhone 15 Pro dark) — tema her zaman dark, handoff token'ları.
// "/new" (yeni randevu) tam ekran akış olduğu için alt çubuk gizlenir.
export const MobileShell = () => {
    const location = useLocation();
    const fullscreenFlow = location.pathname.startsWith('/new');

    return (
        <div className="flex flex-col h-[100dvh] overflow-hidden"
            style={{ background: T.bg, color: T.ink, fontFamily: T.font }}
        >
            <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
                style={{ paddingBottom: fullscreenFlow ? 0 : 'calc(env(safe-area-inset-bottom,0px) + 82px)' }}
            >
                <ErrorBoundary>
                    <Outlet />
                </ErrorBoundary>
            </main>

            {!fullscreenFlow && <BottomTabBar />}
        </div>
    );
};
