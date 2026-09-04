/**
 * Tasarımın ikon seti — yolları Claude Design "Personel 05/06" çıktısının
 * `<defs>` bloğundan BİREBİR alındı.
 *
 * Daha önce bu ikonlar `View` kenarlıklarıyla taklit ediliyordu; telefon bir
 * döndürülmüş kare, göz bir daire oluyordu. İkon taklidi ölçüyü de tutmuyor:
 * hepsi 24×24 kutuda çizilmiş ve çizgi kalınlıkları farklı.
 */

import Svg, { Circle, Path } from 'react-native-svg';

export type GlyphName =
    | 'back' | 'chev' | 'arrow' | 'phone' | 'note' | 'plus' | 'minus'
    | 'eye' | 'eyeoff' | 'timer' | 'user' | 'search' | 'check'
    | 'box' | 'cash' | 'swap' | 'cloud'
    // Personel 07 · müşteri defteri
    | 'msg' | 'close' | 'trash' | 'arrowr'
    // Personel 08 · plaka işareti ve formül kilidi
    | 'warn' | 'lock';

export function Glyph({ name, size = 21, color, width }: {
    name: GlyphName;
    size?: number;
    color: string;
    /** Çizgi kalınlığı; her ikonun tasarımdaki kendi değeri var. */
    width?: number;
}) {
    const common = {
        stroke: color,
        fill: 'none' as const,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    const sw = width ?? DEFAULT_WIDTH[name];

    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            {name === 'back' ? <Path {...common} strokeWidth={sw} d="M15 5l-7 7 7 7" /> : null}
            {name === 'chev' ? <Path {...common} strokeWidth={sw} d="M9 5l7 7-7 7" /> : null}
            {name === 'arrow' ? <Path {...common} strokeWidth={sw} d="M4 12h15M13 6l6 6-6 6" /> : null}
            {name === 'phone' ? (
                <Path {...common} strokeWidth={sw} d="M7.2 3.6h2.2l1.4 3.6-1.8 1.4a10.6 10.6 0 0 0 5 5l1.4-1.8 3.6 1.4v2.2c0 1.4-1.1 2.4-2.5 2.3C10.4 17.2 6.8 13.6 4.9 6.1 4.8 4.7 5.8 3.6 7.2 3.6z" />
            ) : null}
            {name === 'note' ? (
                <Path {...common} strokeWidth={sw} d="M6 3.6h9L19 8v12.4H6zM15 3.6V8h4M9 12.5h7M9 16h5" />
            ) : null}
            {name === 'plus' ? <Path {...common} strokeWidth={sw} d="M12 5v14M5 12h14" /> : null}
            {name === 'minus' ? <Path {...common} strokeWidth={sw} d="M5 12h14" /> : null}
            {name === 'eye' ? (
                <>
                    <Path {...common} strokeWidth={sw} d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z" />
                    <Circle cx={12} cy={12} r={2.7} {...common} strokeWidth={sw} />
                </>
            ) : null}
            {name === 'eyeoff' ? (
                <Path {...common} strokeWidth={sw} d="M3 3.4 20.6 21M9.4 9.6a3.4 3.4 0 0 0 4.8 4.8M6.2 6.6C3.9 8.2 2.6 12 2.6 12s3.4 5.6 9.4 5.6c1.5 0 2.8-.3 3.9-.8M17.5 15.2c2.3-1.6 3.9-3.2 3.9-3.2S18 6.4 12 6.4c-.6 0-1.2.1-1.7.2" />
            ) : null}
            {name === 'timer' ? (
                <>
                    <Circle cx={12} cy={13.4} r={7.6} {...common} strokeWidth={sw} />
                    <Path {...common} strokeWidth={sw} d="M12 9.6v3.8M9.4 3.4h5.2" />
                </>
            ) : null}
            {name === 'user' ? (
                <>
                    <Circle cx={12} cy={8.5} r={3.6} {...common} strokeWidth={sw} />
                    <Path {...common} strokeWidth={sw} d="M5.4 20c.6-3.6 3.3-5.8 6.6-5.8s6 2.2 6.6 5.8" />
                </>
            ) : null}
            {name === 'search' ? (
                <>
                    <Circle cx={10.8} cy={10.8} r={6.4} {...common} strokeWidth={sw} />
                    <Path {...common} strokeWidth={sw} d="M15.6 15.6 20 20" />
                </>
            ) : null}
            {name === 'check' ? <Path {...common} strokeWidth={sw} d="M4.5 12.6 9.4 17.5 19.5 7" /> : null}
            {name === 'box' ? (
                <Path {...common} strokeWidth={sw} d="M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2V8.2zM4 8.2 12 12.4l8-4.2M12 12.4V20" />
            ) : null}
            {name === 'cash' ? (
                <>
                    <Path {...common} strokeWidth={sw} d="M3.6 7.4h16.8v9.2H3.6z" />
                    <Circle cx={12} cy={12} r={2.4} {...common} strokeWidth={sw} />
                </>
            ) : null}
            {name === 'swap' ? (
                <Path {...common} strokeWidth={sw} d="M4 8h13l-3.4-3.4M20 16H7l3.4 3.4" />
            ) : null}
            {name === 'cloud' ? (
                <Path {...common} strokeWidth={sw} d="M7 17.4h9.4a3.6 3.6 0 0 0 .4-7.2A5.4 5.4 0 0 0 6.6 11 3.2 3.2 0 0 0 7 17.4z" />
            ) : null}
            {name === 'msg' ? (
                <Path {...common} strokeWidth={sw} d="M4 5.4h16v10.2h-7.4L8 19.4v-3.8H4z" />
            ) : null}
            {name === 'close' ? (
                <Path {...common} strokeWidth={sw} d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" />
            ) : null}
            {name === 'trash' ? (
                <Path {...common} strokeWidth={sw} d="M4.6 7h14.8M9 7V4.6h6V7M6.4 7l.9 12.4h9.4L17.6 7M10.2 10.4v6M13.8 10.4v6" />
            ) : null}
            {name === 'arrowr' ? (
                <Path {...common} strokeWidth={sw} d="M4.5 12h13M12.5 7l5 5-5 5" />
            ) : null}
            {name === 'warn' ? (
                <>
                    <Circle cx={12} cy={12} r={8.6} {...common} strokeWidth={sw} />
                    <Path {...common} strokeWidth={1.9} d="M12 7.6v5.2" />
                    <Circle cx={12} cy={16.2} r={1.05} fill={color} stroke="none" />
                </>
            ) : null}
            {name === 'lock' ? (
                <Path {...common} strokeWidth={sw} d="M6.4 10.6h11.2v9.4H6.4zM8.8 10.6V7.8a3.2 3.2 0 0 1 6.4 0v2.8" />
            ) : null}
        </Svg>
    );
}

const DEFAULT_WIDTH: Record<GlyphName, number> = {
    back: 1.9, chev: 1.8, arrow: 2.2, phone: 1.7, note: 1.7,
    plus: 2, minus: 2, eye: 1.6, eyeoff: 1.6, timer: 1.7, user: 1.7,
    search: 1.8, check: 2.2, box: 1.7, cash: 1.7, swap: 1.8, cloud: 1.7,
    msg: 1.7, close: 1.8, trash: 1.7, arrowr: 1.8, warn: 1.7, lock: 1.7,
};
