// Tasarımın ikon seti — "Luera Fiyatlandırma.html" içindeki SVG sprite'ı.
//
// Neden lucide değil: tasarımdaki ikonların çoğu (fiş, veritabanı, duraklat,
// kalkan-tik) lucide karşılıklarıyla birebir aynı değil ve çizgi kalınlıkları
// tasarımın kendi ölçüsünde (1.7). Sayfanın dokusu bu ayrıntıdan geliyor.
//
// Sprite bir kez basılır, ikonlar `<use>` ile çağrılır. id'ler `bl-` önekli:
// uygulamada başka bir sprite aynı adı kullanırsa ikonlar sessizce karışırdı.

const P = 'bl-';

export function BillingSprite() {
    return (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
            <symbol id={`${P}ck`} viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></symbol>
            <symbol id={`${P}ar`} viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
            <symbol id={`${P}x`} viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></symbol>
            <symbol id={`${P}info`} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></symbol>
            <symbol id={`${P}clock`} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
            <symbol id={`${P}cal`} viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></symbol>
            <symbol id={`${P}card`} viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20M6 15h4" /></symbol>
            <symbol id={`${P}lock`} viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></symbol>
            <symbol id={`${P}shield`} viewBox="0 0 24 24"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6z" /><path d="M9.5 12.2 11.3 14l3.5-3.5" /></symbol>
            <symbol id={`${P}undo`} viewBox="0 0 24 24"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></symbol>
            <symbol id={`${P}db`} viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></symbol>
            <symbol id={`${P}doc`} viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></symbol>
            <symbol id={`${P}dl`} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></symbol>
            <symbol id={`${P}settings`} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" /></symbol>
            <symbol id={`${P}pause`} viewBox="0 0 24 24" style={{ fill: 'currentColor', stroke: 'none' }}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></symbol>
            <symbol id={`${P}loading`} viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 1-6.4 2.6" /><path d="M12 3v4" /></symbol>
            <symbol id={`${P}receipt-ok`} viewBox="0 0 24 24"><path d="M5 21V4.5a1 1 0 0 1 1.5-.9L9 5l2.5-1.4a1 1 0 0 1 1 0L15 5l2.5-1.4a1 1 0 0 1 1.5.9V21l-2.5-1.4a1 1 0 0 0-1 0L13 21l-2.5-1.4a1 1 0 0 0-1 0z" /><path d="M9 11.8 11 13.8l4.2-4.2" /></symbol>
            <symbol id={`${P}users`} viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.6" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M17 4.5a3.6 3.6 0 0 1 0 7M18.5 14.5A6.6 6.6 0 0 1 22 21" /></symbol>
            <symbol id={`${P}logout`} viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></symbol>
        </defs></svg>
    );
}

export type IconName =
    | 'ck' | 'ar' | 'x' | 'info' | 'clock' | 'cal' | 'card' | 'lock' | 'shield'
    | 'undo' | 'db' | 'doc' | 'dl' | 'settings' | 'pause' | 'loading'
    | 'receipt-ok' | 'users' | 'logout';

/** Boyut sınıfı tasarımın kendi ölçeğinden: i16 / i18 / i (20) / i26. */
export function Ico({ n, s = 'i18', className = '' }: { n: IconName; s?: 'i16' | 'i18' | 'i' | 'i26'; className?: string }) {
    return <svg className={`${s} ${className}`.trim()}><use href={`#${P}${n}`} /></svg>;
}
