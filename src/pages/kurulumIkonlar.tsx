/**
 * Kurulum v2 simgeleri — tasarımın ("Luera Masaustu - Kurulum v2") kendi
 * sembolleri: 1.8 çizgi, yuvarlak uç. Ayarlar'ın `AyIkonlar`'ıyla aynı
 * yöntem: sprite kökte bir kez çizilir, her yer `<KurulumIkon n="…" />`.
 *
 * Sektör simgeleri `sector-<anahtar>` adıyla; anahtarlar `SECTOR_PROFILES`
 * ile aynı. Uygulamanın geri kalanı lucide'den okur (`lib/sectorIcons`);
 * tasarım kurulum için kendi çizimini verdi, ölçü ve çizgi kalınlığı da farklı.
 */

const PATHS: Record<string, string> = {
    chl: '<path d="M15 5l-7 7 7 7"/>', chr: '<path d="M9 5l7 7-7 7"/>', chd: '<path d="M5 9l7 7 7-7"/>',
    arr: '<path d="M5 12h14M13 6l6 6-6 6"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    link: '<path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    sheet: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17"/>',
    pin: '<path d="M19 10c0 5.5-7 11-7 11s-7-5.5-7-11a7 7 0 0 1 14 0z"/><circle cx="12" cy="10" r="2.6"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4.5M9 14h.01M15 14h.01"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
    'sector-guzellik': '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15v4M17 17h4"/>',
    'sector-kuafor': '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8 7.6 20 18M8 16.4 20 6"/>',
    'sector-berber': '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M7 8l10-3M7 13l10-3M7 18l10-3"/>',
    'sector-estetik': '<path d="M18 2l4 4M20 4l-9.5 9.5-4-4L16 0"/><path d="M8.5 11.5 3 17l4 4 5.5-5.5"/>',
    'sector-dis': '<path d="M8.5 3C6 3 4 5 4 8c0 4 1.5 6 2 10 .3 2 2.5 2.4 3-.5.3-2 .7-3.5 3-3.5s2.7 1.5 3 3.5c.5 2.9 2.7 2.5 3 .5.5-4 2-6 2-10 0-3-2-5-4.5-5-1.5 0-2.5 1-3.5 1s-2-1-3.5-1z"/>',
    'sector-saglik': '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M5 3h3M12 3h3M10 14v1a5 5 0 0 0 9 3"/><circle cx="20" cy="16" r="2.2"/>',
    'sector-fizyoterapi': '<path d="M3 12h3l2-5 3 10 3-13 3 16 2-8h2"/>',
    'sector-tattoo': '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><circle cx="11" cy="11" r="2"/>',
    'sector-avukat': '<path d="M12 3v18M7 21h10M4 8h16M6.5 8 4 14h5zM17.5 8 15 14h5z"/>',
    'sector-danismanlik': '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2.5 13h19"/>',
    'sector-gym': '<path d="M4 8v8M8 6v12M16 6v12M20 8v8M8 12h8"/>',
    'sector-gelinlikci': '<path d="M9 3l3 4 3-4M12 7l-5 14h10z"/>',
    'sector-restoran': '<path d="M5 3v8a2.5 2.5 0 0 0 5 0V3M7.5 11v10"/><path d="M17 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
};

/** Bir kez, kökte. İki kez çizilirse aynı `id` iki kez olurdu. */
export function KurulumIkonlar() {
    let s = '';
    for (const [k, d] of Object.entries(PATHS)) {
        s += `<symbol id="kv-i-${k}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</g></symbol>`;
    }
    return (
        <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0 }}
            dangerouslySetInnerHTML={{ __html: `<defs>${s}</defs>` }} />
    );
}

export function KurulumIkon({ n, className }: { n: string; className?: string }) {
    return (
        <svg className={className ? `i ${className}` : 'i'} aria-hidden="true">
            <use href={`#kv-i-${PATHS[n] ? n : 'info'}`} />
        </svg>
    );
}
