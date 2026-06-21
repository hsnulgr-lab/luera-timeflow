// Luera mobil tasarım token'ları — design_handoff_luera_mobile/README.md ile birebir.
// Mobil deneyim koyu temadır (iPhone 15 Pro dark). Bu sabitler, dashboard'un
// --dc-* değişkenlerinden bağımsız tutulur ki tasarımla piksel-uyum bozulmasın.
export const T = {
    ink: '#F3EDE3',
    orange: '#FF5A1F',
    orangeD: '#FF7A45',
    surface: '#1C1710',
    surface2: '#252015',
    surface3: '#30281A',
    border: 'rgba(243,237,227,0.12)',
    border2: 'rgba(243,237,227,0.22)',
    muted: 'rgba(243,237,227,0.50)',
    muted2: 'rgba(243,237,227,0.28)',
    green: '#7CC47F',
    blue: '#6B9FD4',
    amber: '#E0A84E',
    purple: '#C98BDB',
    red: '#E07070',
    bg: '#120E08',
    font: "'Hanken Grotesk',system-ui,sans-serif",
    mono: "'JetBrains Mono',monospace",
} as const;

// Randevu durumu → tasarım rozet renkleri (status string TR)
export const STS_COLOR: Record<string, string> = {
    completed: '#7CC47F',
    confirmed: '#6B9FD4',
    pending: '#E0A84E',
    cancelled: '#E07070',
};
export const STS_BG: Record<string, string> = {
    completed: 'rgba(124,196,127,.14)',
    confirmed: 'rgba(107,159,212,.14)',
    pending: 'rgba(224,168,78,.14)',
    cancelled: 'rgba(224,112,112,.14)',
};
export const STS_LABEL: Record<string, string> = {
    completed: 'Tamamlandı',
    confirmed: 'Onaylandı',
    pending: 'Bekliyor',
    cancelled: 'İptal',
};

// Ada göre tutarlı avatar rengi (palet)
const AVATAR_COLORS = [T.orange, T.purple, T.blue, T.amber, T.green, '#CB5E84'];
export function avatarColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
