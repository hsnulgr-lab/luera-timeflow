import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { LOGIN_NOTICE_EVENT } from '@/lib/loginNotice';
import '@/pages/login/giris.css';

/**
 * M11 — "zaten işletmeniz var" notu. Opak, nötr, onay istemiyor: kişi bir şey
 * kaybetmedi; not bunu söylüyor ve kayboluyor.
 *   belirme · opacity + translateY −8→0 · 200 ms
 *   kaybolma · 6 sn sonra · 200 ms · üzerine gelinirken sayaç durur
 */
const SHOW_MS = 6000;
const FADE_MS = 200;

export function LoginNotice() {
    const { dark } = useTheme();
    const [text, setText] = useState<string | null>(null);
    const [gone, setGone] = useState(false);
    const remaining = useRef(SHOW_MS);
    const startedAt = useRef(0);
    const timer = useRef<number | undefined>(undefined);

    const clear = () => { if (timer.current !== undefined) window.clearTimeout(timer.current); timer.current = undefined; };

    const run = useCallback(() => {
        clear();
        startedAt.current = Date.now();
        timer.current = window.setTimeout(() => {
            setGone(true);
            timer.current = window.setTimeout(() => { setText(null); setGone(false); }, FADE_MS);
        }, remaining.current);
    }, []);

    useEffect(() => {
        const onNotice = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail;
            if (!detail) return;
            remaining.current = SHOW_MS;
            setGone(false);
            setText(detail);
            run();
        };
        window.addEventListener(LOGIN_NOTICE_EVENT, onNotice);
        return () => { window.removeEventListener(LOGIN_NOTICE_EVENT, onNotice); clear(); };
    }, [run]);

    if (!text) return null;
    return (
        <div
            className={`lg-notice${gone ? ' lg-gone' : ''}`}
            data-theme={dark ? 'dark' : 'light'}
            role="status"
            onMouseEnter={() => {
                if (gone) return;
                clear();
                remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
            }}
            onMouseLeave={() => { if (!gone) run(); }}
        >
            <span className="lg-ck">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.6 9.4 17.5 19.5 7" /></svg>
            </span>
            {text}
        </div>
    );
}
