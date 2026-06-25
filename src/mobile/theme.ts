// Luera mobil tasarım token'ları — design_handoff_luera_mobile/README.md ile birebir.
// Mobil deneyim hem koyu (iPhone 15 Pro dark) hem açık (light) temayı destekler.
// Tokenlar CSS değişkenleri (--lt-*) üzerinden okunur; tema değişimi yalnızca
// :root değişken setini değiştirir, hiçbir component kodu değişmeden adapte olur.
// var() inline style'larda VE SVG presentation attribute'larında (stroke/fill) çözülür.

// Temaya göre uygulanacak ham değerler (handoff: dark = ana, light = Mobile App Light.html)
export const DARK_VARS: Record<string, string> = {
    '--lt-ink': '#F3EDE3',
    '--lt-orange': '#FF5A1F',
    '--lt-orangeD': '#FF7A45',
    '--lt-surface': '#1C1710',
    '--lt-surface2': '#252015',
    '--lt-surface3': '#30281A',
    '--lt-border': 'rgba(243,237,227,0.12)',
    '--lt-border2': 'rgba(243,237,227,0.22)',
    '--lt-muted': 'rgba(243,237,227,0.50)',
    '--lt-muted2': 'rgba(243,237,227,0.28)',
    '--lt-green': '#7CC47F',
    '--lt-blue': '#6B9FD4',
    '--lt-amber': '#E0A84E',
    '--lt-purple': '#C98BDB',
    '--lt-red': '#E07070',
    '--lt-bg': '#120E08',
    // Durum rozet zeminleri (accent tint)
    '--lt-green-bg': 'rgba(124,196,127,0.14)',
    '--lt-blue-bg': 'rgba(107,159,212,0.14)',
    '--lt-amber-bg': 'rgba(224,168,78,0.14)',
    '--lt-red-bg': 'rgba(224,112,112,0.14)',
};

export const LIGHT_VARS: Record<string, string> = {
    '--lt-ink': '#1A1208',
    '--lt-orange': '#FF5A1F',
    '--lt-orangeD': '#E04510',
    '--lt-surface': '#F8F4EE',
    '--lt-surface2': '#E4DDD0',
    '--lt-surface3': '#E4DDD0',
    '--lt-border': 'rgba(26,18,8,0.09)',
    '--lt-border2': 'rgba(26,18,8,0.18)',
    '--lt-muted': 'rgba(26,18,8,0.50)',
    '--lt-muted2': 'rgba(26,18,8,0.28)',
    '--lt-green': '#2E8A35',
    '--lt-blue': '#2870B0',
    '--lt-amber': '#B8720A',
    '--lt-purple': '#7B44A8',
    '--lt-red': '#C0392B',
    '--lt-bg': '#F0EBE1',
    '--lt-green-bg': 'rgba(46,138,53,0.12)',
    '--lt-blue-bg': 'rgba(40,112,176,0.12)',
    '--lt-amber-bg': 'rgba(184,114,10,0.12)',
    '--lt-red-bg': 'rgba(192,57,43,0.12)',
};

// :root üzerine ilgili tema değişkenlerini uygula (ThemeProvider'dan çağrılır).
export function applyMobileThemeVars(dark: boolean) {
    const vars = dark ? DARK_VARS : LIGHT_VARS;
    const root = document.documentElement;
    for (const k in vars) root.style.setProperty(k, vars[k]);
    // Native form kontrolleri (time/date picker, spinner) tema ile uyumlu olsun
    root.style.setProperty('--lt-scheme', dark ? 'dark' : 'light');
    // PWA durum çubuğu rengi tema ile uyumlu olsun:
    const bg = vars['--lt-bg'];
    // 1) html/body arka planı tema rengi (status bar bölgesi/overscroll beyaz kalmasın)
    root.style.backgroundColor = bg;
    if (document.body) document.body.style.backgroundColor = bg;
    // 2) theme-color meta (Android standalone status bar zemini)
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = bg;
}

// Token erişimi — değerler CSS değişkenine işaret eder; fallback dark değeridir
// (ilk boyamada flash olmaması için ThemeProvider useLayoutEffect ile set eder).
export const T = {
    ink: 'var(--lt-ink,#F3EDE3)',
    orange: 'var(--lt-orange,#FF5A1F)',
    orangeD: 'var(--lt-orangeD,#FF7A45)',
    surface: 'var(--lt-surface,#1C1710)',
    surface2: 'var(--lt-surface2,#252015)',
    surface3: 'var(--lt-surface3,#30281A)',
    border: 'var(--lt-border,rgba(243,237,227,0.12))',
    border2: 'var(--lt-border2,rgba(243,237,227,0.22))',
    muted: 'var(--lt-muted,rgba(243,237,227,0.50))',
    muted2: 'var(--lt-muted2,rgba(243,237,227,0.28))',
    green: 'var(--lt-green,#7CC47F)',
    blue: 'var(--lt-blue,#6B9FD4)',
    amber: 'var(--lt-amber,#E0A84E)',
    purple: 'var(--lt-purple,#C98BDB)',
    red: 'var(--lt-red,#E07070)',
    bg: 'var(--lt-bg,#120E08)',
    font: "'Hanken Grotesk',system-ui,sans-serif",
    mono: "'JetBrains Mono',monospace",
} as const;

// Randevu durumu → tasarım rozet renkleri (tema değişkeniyle açık/koyu uyumlu)
export const STS_COLOR: Record<string, string> = {
    completed: T.green,
    confirmed: T.blue,
    pending: T.amber,
    cancelled: T.red,
};
export const STS_BG: Record<string, string> = {
    completed: 'var(--lt-green-bg,rgba(124,196,127,0.14))',
    confirmed: 'var(--lt-blue-bg,rgba(107,159,212,0.14))',
    pending: 'var(--lt-amber-bg,rgba(224,168,78,0.14))',
    cancelled: 'var(--lt-red-bg,rgba(224,112,112,0.14))',
};
export const STS_LABEL: Record<string, string> = {
    completed: 'Tamamlandı',
    confirmed: 'Onaylandı',
    pending: 'Bekliyor',
    cancelled: 'İptal',
};

// Ada göre tutarlı avatar rengi (palet — tema bağımsız accent)
const AVATAR_COLORS = ['#FF5A1F', '#C98BDB', '#6B9FD4', '#E0A84E', '#7CC47F', '#CB5E84'];
export function avatarColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
