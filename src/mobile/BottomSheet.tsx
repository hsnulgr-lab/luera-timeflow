import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { T } from './theme';

// Alttan açılan modal (bottom sheet) — mobil form akışları için.
// Backdrop'a veya kapat'a basınca kapanır; body scroll kilidi uygular.
export function BottomSheet({ open, onClose, title, children }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm sb-fade" onClick={onClose} />
            <div
                className="relative w-full sb-sheet-up rounded-t-[28px]"
                style={{
                    background: T.bg,
                    color: T.ink,
                    fontFamily: T.font,
                    maxHeight: '92dvh',
                    paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                }}
            >
                <div className="flex justify-center pt-2.5">
                    <span className="h-1 w-10 rounded-full" style={{ background: T.border2 }} />
                </div>
                <div className="flex items-center justify-between px-5 pb-3 pt-3">
                    <h2 className="text-[20px] font-black tracking-[-0.03em]">{title}</h2>
                    <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl"
                        style={{ background: T.surface2, color: T.ink }} aria-label="Kapat">
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto px-5" style={{ maxHeight: 'calc(92dvh - 90px)' }}>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
