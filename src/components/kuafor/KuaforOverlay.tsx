import type { MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';

// Modal/drawer katmanı her zaman document.body'ye portallanır. Sayfa kabuğu
// (.ks-shell → .ks-scroll) overflow:hidden ve giriş animasyonları taşıdığı
// için katman DOM'da yerinde bırakılırsa position:fixed sayfa gövdesine
// hapsolabiliyor: scrim üst barları örtmüyor, pencere üstten/alttan kırpılıyor.
// Portal bu sınıfın tamamını kapatır. Tema sınıfları burada yeniden verilir —
// portal DOM ağacında .dash-theme'in dışına çıkar, --dc-* değişkenleri onunla gelir.
export function KuaforOverlay({ className, onClick, children }: {
    className: string;
    onClick?: (event: MouseEvent<HTMLDivElement>) => void;
    children: ReactNode;
}) {
    const { dark } = useTheme();
    return createPortal((
        <div className={cn('dash-theme ks-shell ks-shell-overlay', dark && 'dark')}>
            <div className={className} onClick={onClick}>{children}</div>
        </div>
    ), document.body);
}
