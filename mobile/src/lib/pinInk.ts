// Personel Girişi 099 · şifre ekranlarının renkleri. Saf: React import etmez.

/** Tasarımın 099 renkleri — ürünün envanterinde karşılığı olmayan tek renk teal (kimlik). */
export function pinInk(dark: boolean) {
    return {
        teal: dark ? '#5FD3C8' : '#0C6E67',
        tealFill: dark ? 'rgba(20,150,140,0.16)' : 'rgba(20,150,140,0.14)',
        tealEdge: dark ? 'rgba(20,150,140,0.34)' : 'rgba(20,150,140,0.30)',
        errorText: dark ? '#FF9B9B' : '#C94040',
    };
}

