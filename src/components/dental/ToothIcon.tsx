// Diş hekimi sektörünün kimlik ikonu — design_handoff_dis_klinigi_dashboard.
// Hero, sidebar nav, dashboard kart ikonları arasında ortak kullanılır.
export function ToothIcon({ size, className }: { size?: number; className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" width={size} height={size} className={className}>
            <path d="M10 3c-2.2 0-3.6 1.3-3.8 3.3c-.2 1.7.4 3.1.9 4.6l.7 2.1c.3.9.6 1.9 1.1 2.6c.3.4.7.7 1.1.7s.8-.3 1.1-.7c.5-.7.8-1.7 1.1-2.6l.7-2.1c.5-1.5 1.1-2.9.9-4.6C13.6 4.3 12.2 3 10 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
    );
}
