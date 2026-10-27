// Abonelik v2'nin çizgi ikonları — tasarımın sembol kümesi (Lucide ailesi).
// Kimlikler `ab-` ile başlar: aynı sayfada kurulumun ya da eski duvarın
// kümesiyle çakışmasın.

const P: Record<string, string> = {
    chl: '<path d="M15 5l-7 7 7 7"/>',
    arr: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    minus: '<path d="M6 12h12"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    receipt: '<path d="M5.5 21V4.5a1 1 0 0 1 1.5-.9L9 4.8l3-1.6 3 1.6 2-1.2a1 1 0 0 1 1.5.9V21l-2.2-1.3-3 1.6-3-1.6z"/><path d="M9 9h6M9 13h6"/>',
    calx: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01"/>',
    out: '<path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9M15.5 16.5 20 12l-4.5-4.5M20 12H9"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
};

const SPRITE = Object.entries(P).map(([k, d]) =>
    `<symbol id="ab-${k}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</g></symbol>`,
).join('');

export function AbonelikIkonlar() {
    return (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <defs dangerouslySetInnerHTML={{ __html: SPRITE }} />
        </svg>
    );
}

export function Ic({ n, className }: { n: string; className?: string }) {
    return <svg className={className ? `i ${className}` : 'i'} aria-hidden="true"><use href={`#ab-${n}`} /></svg>;
}

/** Zaman çizgisi durağının tiki — `stroke-dashoffset` ile çizilir. */
export function Tick() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4L18 8" /></svg>;
}
