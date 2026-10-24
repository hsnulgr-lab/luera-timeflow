import { Toaster } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import './appToaster.css';

// ── Bildirimler · üstte ortada tek satırlık hap (2026-10-24) ──────────────────
// Kullanıcı eski siyah kutuları "vasat" buldu; Instagram gibi az ve öz istedi.
// Üç taslaktan A (Hap) seçildi, yeri "üstten ortada" olarak düzeltildi.
// İkon yok: yalnız hata kırmızı, uyarı amber noktayla ayrılır. Düğme sağda
// turuncu yazı. Aynı anda tek bildirim görünür; yenisi eskisinin yerini alır.
// Koyu temada hap ters döner (krem zemin, koyu yazı) — panelin birincil düğmesi gibi.

export function AppToaster() {
    const { dark } = useTheme();
    return (
        <Toaster
            position="top-center"
            theme={dark ? 'dark' : 'light'}
            visibleToasts={1}
            offset={{ top: 16 }}
            mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 12, right: 12 }}
            icons={{
                success: null,
                info: null,
                error: <span className="lt-dot is-err" />,
                warning: <span className="lt-dot is-warn" />,
                loading: <span className="lt-spin" />,
            }}
            toastOptions={{
                unstyled: true,
                classNames: {
                    toast: 'lt-toast',
                    icon: 'lt-icon',
                    content: 'lt-content',
                    title: 'lt-title',
                    description: 'lt-desc',
                    actionButton: 'lt-act',
                    cancelButton: 'lt-cancel',
                },
            }}
        />
    );
}
