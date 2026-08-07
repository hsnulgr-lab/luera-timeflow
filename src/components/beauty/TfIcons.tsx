// Premium V2 tasarımının ikon seti — kaynak HTML'deki SVG sprite'ın birebir portu.
//
// Neden lucide kullanılmadı: tasarımın çizgi kalınlığı 1.9 ve bazı formlar
// (kabin/kutu, cüzdan, kalkan-onay) lucide'de birebir karşılık bulmuyor.
// Sprite bir kez basılır, her ikon <use> ile referans alır — 25 ikon için
// tek DOM maliyeti.

export function TfIcon({ name, className = '' }: { name: string; className?: string }) {
    return (
        <svg className={`tfv2-icon ${className}`} aria-hidden="true">
            <use href={`#tfi-${name}`} />
        </svg>
    );
}

export function TfIconSprite() {
    return (
        <svg className="tfv2-visually-hidden" aria-hidden="true">
            <symbol id="tfi-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></symbol>
            <symbol id="tfi-box" viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5 9 5Z" /><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8M12 13v8" /></symbol>
            <symbol id="tfi-sparkles" viewBox="0 0 24 24"><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3ZM5 14l-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14ZM19 13l-.7 1.8-1.8.7 1.8.7L19 18l.7-1.8 1.8-.7-1.8-.7L19 13Z" /></symbol>
            <symbol id="tfi-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></symbol>
            <symbol id="tfi-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
            <symbol id="tfi-upload" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></symbol>
            <symbol id="tfi-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></symbol>
            <symbol id="tfi-message" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.7 9.7 0 0 1-4-.9L3 21l1.8-4.8A8.5 8.5 0 1 1 21 11.5Z" /></symbol>
            <symbol id="tfi-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
            <symbol id="tfi-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></symbol>
            <symbol id="tfi-alert" viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5M12 18h.01" /></symbol>
            <symbol id="tfi-credit" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></symbol>
            <symbol id="tfi-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
            <symbol id="tfi-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></symbol>
            <symbol id="tfi-phone" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z" /></symbol>
            {/* Operasyon merkezi (rezervasyonlar) — Premium Final setinin kalanı */}
            <symbol id="tfi-calendar" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></symbol>
            <symbol id="tfi-filter" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4" /></symbol>
            <symbol id="tfi-chevron-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></symbol>
            <symbol id="tfi-chevron-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></symbol>
            <symbol id="tfi-edit" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" /></symbol>
            <symbol id="tfi-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></symbol>
            <symbol id="tfi-door" viewBox="0 0 24 24"><path d="M4 21h16M6 21V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M14 12h.01" /></symbol>
            <symbol id="tfi-package" viewBox="0 0 24 24"><path d="m12 3 8 4-8 4-8-4 8-4ZM4 7v10l8 4 8-4V7M12 11v10" /></symbol>
            <symbol id="tfi-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></symbol>
        </svg>
    );
}
