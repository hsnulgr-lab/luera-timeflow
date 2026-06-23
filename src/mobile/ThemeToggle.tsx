import { useTheme } from '@/contexts/ThemeContext';
import { T } from './theme';

const SunIcon = ({ s = 18 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.7" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
);
const MoonIcon = ({ s = 18 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Header ikon butonu — tek dokunuşla açık/koyu geçişi. Mevcut modun ikonunu gösterir.
export function ThemeToggle({ size = 38 }: { size?: number }) {
    const { dark, toggle } = useTheme();
    return (
        <button onClick={toggle} aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
            style={{ width: size, height: size, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: dark ? T.amber : T.muted, cursor: 'pointer', flexShrink: 0 }}>
            {dark ? <MoonIcon /> : <SunIcon />}
        </button>
    );
}

// Ayarlar içi segment kontrolü — Açık / Koyu.
export function ThemeSegment() {
    const { dark, toggle } = useTheme();
    const opts = [
        { id: 'light', label: 'Açık', icon: <SunIcon s={16} />, active: !dark },
        { id: 'dark', label: 'Koyu', icon: <MoonIcon s={16} />, active: dark },
    ];
    return (
        <div style={{ display: 'flex', gap: 6, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 5 }}>
            {opts.map((o) => (
                <button key={o.id} onClick={() => { if (!o.active) toggle(); }}
                    style={{ flex: 1, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', border: 'none', background: o.active ? T.orange : 'transparent', color: o.active ? '#0E0E0E' : T.muted }}>
                    {o.icon}{o.label}
                </button>
            ))}
        </div>
    );
}
