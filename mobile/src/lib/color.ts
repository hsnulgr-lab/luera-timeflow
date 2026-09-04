/**
 * Renk karışımı — saf, React'siz.
 *
 * Tasarım vurgu sönükleşmesini `color-mix(in oklab, …)` ile tanımlıyor.
 * React Native'de böyle bir işlev yok ve sRGB'de doğrusal karıştırmak aynı
 * sonucu VERMİYOR: sRGB karışımı orta tonlarda çamurlaşır, sıcak turuncu
 * griye kayar. Oklab algısal olarak düzgün olduğu için tasarımın hesapladığı
 * kontrast oranları ancak burada tutuyor.
 *
 * Kaynak: Björn Ottosson, Oklab (2020).
 */

export interface RGB { r: number; g: number; b: number }

/** "#241E16" → {r,g,b} 0–1 aralığında, gama uygulanmış (sRGB) hâliyle. */
export function parseHex(hex: string): RGB {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map((ch) => ch + ch).join('')
        : clean;
    return {
        r: parseInt(full.slice(0, 2), 16) / 255,
        g: parseInt(full.slice(2, 4), 16) / 255,
        b: parseInt(full.slice(4, 6), 16) / 255,
    };
}

const hex2 = (value: number) => {
    const byte = Math.max(0, Math.min(255, Math.round(value * 255)));
    return byte.toString(16).padStart(2, '0');
};

export function toHex({ r, g, b }: RGB): string {
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
}

/** sRGB → doğrusal ışık. Karışım ve parlaklık burada yapılır, gamada değil. */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

interface Lab { L: number; a: number; b: number }

function toOklab({ r, g, b }: RGB): Lab {
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);

    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    return {
        L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    };
}

function fromOklab({ L, a, b }: Lab): RGB {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    return {
        r: clamp(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
        g: clamp(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
        b: clamp(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)),
    };
}

/**
 * `color-mix(in oklab, top strength%, bottom)` karşılığı.
 *
 * `strength` 1 ise sonuç `top`, 0 ise `bottom`. Sönükleşme opaklıkla değil
 * dolguyla karışım olarak kuruluyor: renk sönerken sıcak eksenden çıkmıyor ve
 * kartın dolgusu değişmiş gibi görünmüyor.
 */
export function mixOklab(top: string, bottom: string, strength: number): string {
    const t = Math.max(0, Math.min(1, strength));
    if (t >= 1) return top.toUpperCase();
    const A = toOklab(parseHex(top));
    const B = toOklab(parseHex(bottom));
    return toHex(fromOklab({
        L: B.L + (A.L - B.L) * t,
        a: B.a + (A.a - B.a) * t,
        b: B.b + (A.b - B.b) * t,
    }));
}

/**
 * CSS `filter: brightness(k)` karşılığı — doğrusal ışıkta çarpım.
 *
 * Eşik nabzında rengi "parlatmak" için kullanılıyor. RN'de filtre yok, o
 * yüzden parlak hâl önceden hesaplanıp üst üste bindirilmiş ikinci bir katman
 * olarak çapraz sönüyor.
 */
export function brighten(hex: string, factor: number): string {
    const { r, g, b } = parseHex(hex);
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    return toHex({
        r: clamp(toGamma(toLinear(r) * factor)),
        g: clamp(toGamma(toLinear(g) * factor)),
        b: clamp(toGamma(toLinear(b) * factor)),
    });
}

/** WCAG bağıl parlaklık — kontrast testleri için. */
export function luminance(hex: string): number {
    const { r, g, b } = parseHex(hex);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** İki rengin kontrast oranı (1–21). */
export function contrast(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
