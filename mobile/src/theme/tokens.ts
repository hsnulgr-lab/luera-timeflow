// Tasarım jetonları — kaynak: Claude Design "Luera Mobil - Kumanda.html".
//
// Değerler web'deki `src/index.css` (.dash-theme) ile BİREBİR aynı. İki kopya
// tutuyoruz çünkü RN'de CSS değişkeni yok; ayrışmamaları için tests/ altındaki
// karşılaştırma testi iki tarafı da okuyor.
//
// Cam katmanın kendi jetonları var (glass, glassBorder, tint): tasarımda cam
// YALNIZ kabukta kullanılıyor — üst bar, tab bar, sheet tutamağı, yüzen buton.
// İçerik yüzeyleri opak ve sıcak; bulanık zeminde metin kontrastı düşüyor ve
// hedef kitle 40–55 yaş.

export interface Palette {
    bg: string; surf: string; surf2: string; card: string;
    tx: string; tx2: string; tx3: string;
    bd: string; bd2: string;
    or: string; or2: string;
    gr: string; am: string; rd: string;
    /** Cam katman — yalnız kabukta. */
    glass: string; glassBorder: string; tint: string; sheen: string;
}

export const light: Palette = {
    bg: '#F3ECE0', surf: '#FAF7F3', surf2: '#F0E9DF', card: '#FFFDFB',
    tx: '#0E0E0E', tx2: 'rgba(14,14,14,0.52)', tx3: 'rgba(14,14,14,0.34)',
    bd: 'rgba(14,14,14,0.10)', bd2: 'rgba(14,14,14,0.18)',
    or: '#FF5A1F', or2: '#E8430F',
    gr: '#2D8F32', am: '#B87A00', rd: '#C94040',
    glass: 'rgba(250,247,243,0.72)', glassBorder: 'rgba(14,14,14,0.09)',
    tint: 'rgba(240,233,223,0.55)', sheen: 'rgba(255,255,255,0.55)',
};

export const dark: Palette = {
    bg: '#120E08', surf: '#1C1710', surf2: '#252015', card: '#241E16',
    tx: '#F3EDE3', tx2: 'rgba(243,237,227,0.58)', tx3: 'rgba(243,237,227,0.36)',
    bd: 'rgba(243,237,227,0.11)', bd2: 'rgba(243,237,227,0.20)',
    or: '#FF5A1F', or2: '#FF7A45',
    gr: '#5FBF64', am: '#D9A43B', rd: '#E07272',
    glass: 'rgba(28,23,16,0.66)', glassBorder: 'rgba(243,237,227,0.13)',
    tint: 'rgba(37,32,21,0.50)', sheen: 'rgba(243,237,227,0.09)',
};

/**
 * Dokunma hedefleri — tasarımın ölçü sözleşmesi.
 *
 * Personel ayakta, tek elle, çoğu zaman ıslak ya da eldivenli parmakla
 * dokunuyor. Bu sayılar tahmin değil, tasarım dosyasının sonundaki "React
 * Native notları" bölümünden geliyor ve hiçbiri 44'ün altına inmez.
 */
export const hit = {
    row: 62,        // liste satırı
    action: 66,     // kritik buton (İşleme başla, İşlemi bitir)
    actionSm: 60,
    icon: 44,       // ikon butonu
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;

export const space = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 } as const;

/**
 * Tipografi. Hanken Grotesk yüklenene kadar sistem yazı tipine düşer —
 * font dosyası eklendiğinde yalnız burası değişir.
 */
export const type = {
    h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.9 },
    h2: { fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
    h3: { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
    body: { fontSize: 15.5, fontWeight: '500', letterSpacing: -0.1 },
    small: { fontSize: 13.5, fontWeight: '500' },
    tiny: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6 },
} as const;

/**
 * Sayaç ve tutarlar — rakamlar zıplamasın.
 *
 * `as const` DEĞİL: RN'in TextStyle'ı değiştirilebilir bir dizi bekliyor,
 * dondurulmuş dizi tip hatası veriyor.
 */
export const numeric: { fontVariant: ['tabular-nums'] } = { fontVariant: ['tabular-nums'] };

/** 375 × 667 sıkışması — tasarımın verdiği ölçüler. */
export const SMALL_WIDTH = 380;
