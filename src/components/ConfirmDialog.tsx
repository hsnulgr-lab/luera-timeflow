import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useIsMobile } from '@/hooks/useIsMobile';

// Promise tabanlı onay diyaloğu — yerel confirm() yerine markalı, tema-uyumlu.
// Kullanım:  if (!(await confirmDialog({ title, description, danger: true }))) return;
// Mobilde alttan sheet, masaüstünde ortalanmış modal olarak açılır.

export interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;       // kırmızı onay butonu (silme vb.)
}

type Pending = { opts: ConfirmOptions; resolve: (v: boolean) => void };

let notify: ((p: Pending | null) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
    if (!notify) return Promise.resolve(window.confirm(opts.title));  // host yoksa güvenli fallback
    return new Promise<boolean>((resolve) => notify!({ opts, resolve }));
}

export function ConfirmDialogHost() {
    const [pending, setPending] = useState<Pending | null>(null);
    const { dark } = useTheme();
    const isMobile = useIsMobile();

    useEffect(() => {
        notify = setPending;
        return () => { notify = null; };
    }, []);

    useEffect(() => {
        if (!pending) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [pending]);

    if (!pending) return null;
    const { opts, resolve } = pending;
    const close = (v: boolean) => { resolve(v); setPending(null); };

    const bg = dark ? '#1A1510' : '#FAF7F3';
    const ink = dark ? '#F3EDE3' : '#0E0E0E';
    const muted = dark ? 'rgba(243,237,227,.55)' : 'rgba(14,14,14,.55)';
    const border = dark ? 'rgba(243,237,227,.12)' : 'rgba(14,14,14,.10)';
    const surface2 = dark ? '#252015' : '#F0E9DF';
    const orange = '#FF5A1F';
    const red = '#E0554A';
    const confirmBg = opts.danger ? red : orange;

    const card = (
        <div style={{
            position: 'relative', width: '100%', maxWidth: isMobile ? '100%' : 400,
            background: bg, color: ink, border: `1px solid ${border}`,
            borderRadius: isMobile ? '24px 24px 0 0' : 20,
            padding: isMobile ? '10px 22px calc(env(safe-area-inset-bottom,0px) + 20px)' : '24px',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.3)',
            fontFamily: "'Hanken Grotesk',system-ui,sans-serif",
        }}>
            {isMobile && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 14 }}>
                    <span style={{ width: 40, height: 4, borderRadius: 999, background: border }} />
                </div>
            )}
            <div style={{ fontSize: isMobile ? 19 : 17, fontWeight: 850, letterSpacing: '-0.02em', marginBottom: opts.description ? 8 : 18 }}>{opts.title}</div>
            {opts.description && (
                <div style={{ fontSize: 13.5, color: muted, lineHeight: 1.5, marginBottom: 20 }}>{opts.description}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => close(false)}
                    style={{ flex: 1, height: 48, borderRadius: 14, background: surface2, color: ink, border: `1px solid ${border}`, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {opts.cancelLabel || 'Vazgeç'}
                </button>
                <button autoFocus onClick={() => close(true)}
                    style={{ flex: 1, height: 48, borderRadius: 14, background: confirmBg, color: '#fff', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 4px 16px ${confirmBg}55` }}>
                    {opts.confirmLabel || (opts.danger ? 'Sil' : 'Onayla')}
                </button>
            </div>
        </div>
    );

    return createPortal(
        <div role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) close(false); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
                alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
                padding: isMobile ? 0 : 20,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            }}>
            {card}
        </div>,
        document.body,
    );
}
