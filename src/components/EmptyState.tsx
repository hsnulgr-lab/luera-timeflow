import type { ReactNode } from 'react';

interface EmptyStateTokens {
    ink: string;
    muted: string;
    muted2: string;
    border: string;
    surface2: string;
    orange: string;
}

// Ortak boş-durum bileşeni — desktop (useT) ve mobil (T) tema token'ları
// yapısal olarak uyumlu olduğu için aynı bileşen ikisinde de kullanılabiliyor.
export function EmptyState({ T, icon, title, description, actionLabel, onAction }: {
    T: EmptyStateTokens;
    icon: ReactNode;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 10, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted2 }}>
                {icon}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{title}</div>
            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 260 }}>{description}</div>
            {actionLabel && onAction && (
                <button onClick={onAction} style={{ marginTop: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: T.orange, color: '#0E0E0E', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {actionLabel}
                </button>
            )}
        </div>
    );
}
