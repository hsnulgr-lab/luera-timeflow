import { memo, useMemo, useState, type ReactNode } from 'react';
import type { ToothSurface } from '@/types';

// Gerçekçi diş silüeti (kron + kök) — design_handoff_dis_klinigi_dashboard v3
// içindeki toothSVG() JS fonksiyonunun React/SVG karşılığı. Diş tipine göre
// (azı/küçük azı/kanin/kesici) kron genişliği ve kök sayısı değişir.
export type ToothType = 'molar' | 'premolar' | 'canine' | 'incisor';

export const TYPE_LABEL_TR: Record<ToothType, string> = {
    molar: 'Azı', premolar: 'Küçük Azı', canine: 'Kanin', incisor: 'Kesici',
};
// Grup etiketi vurgu rengi (tam şema sayfasındaki tip başlıkları için)
export const TYPE_ACCENT: Record<ToothType, string> = {
    molar: '#9c5a5a', premolar: '#4f9c6a', canine: '#E8430F', incisor: '#3B6FB0',
};

// FDI numaralandırma + diş tipi, soldan sağa tasarımdaki gibi dizilmiş.
export const UPPER_ORDER: { n: number; type: ToothType }[] = [
    { n: 18, type: 'molar' }, { n: 17, type: 'molar' }, { n: 16, type: 'molar' },
    { n: 15, type: 'premolar' }, { n: 14, type: 'premolar' },
    { n: 13, type: 'canine' },
    { n: 12, type: 'incisor' }, { n: 11, type: 'incisor' }, { n: 21, type: 'incisor' }, { n: 22, type: 'incisor' },
    { n: 23, type: 'canine' },
    { n: 24, type: 'premolar' }, { n: 25, type: 'premolar' },
    { n: 26, type: 'molar' }, { n: 27, type: 'molar' }, { n: 28, type: 'molar' },
];
export const LOWER_ORDER: { n: number; type: ToothType }[] = [
    { n: 48, type: 'molar' }, { n: 47, type: 'molar' }, { n: 46, type: 'molar' },
    { n: 45, type: 'premolar' }, { n: 44, type: 'premolar' },
    { n: 43, type: 'canine' },
    { n: 42, type: 'incisor' }, { n: 41, type: 'incisor' }, { n: 31, type: 'incisor' }, { n: 32, type: 'incisor' },
    { n: 33, type: 'canine' },
    { n: 34, type: 'premolar' }, { n: 35, type: 'premolar' },
    { n: 36, type: 'molar' }, { n: 37, type: 'molar' }, { n: 38, type: 'molar' },
];
export const TOOTH_TYPE_BY_NUMBER: Record<number, ToothType> = Object.fromEntries(
    [...UPPER_ORDER, ...LOWER_ORDER].map((t) => [t.n, t.type]),
);

function buildToothPaths(type: ToothType) {
    const cx = 11, top = 2, crownH = 13;
    const crownW = { incisor: 9, canine: 10, premolar: 12, molar: 16 }[type];
    const roots = { incisor: 1, canine: 1, premolar: 2, molar: 3 }[type];
    const cxL = cx - crownW / 2, cxR = cx + crownW / 2;
    let crown: string;
    if (type === 'canine') {
        crown = `M${cxL} ${top + crownH} Q${cxL} ${top + 3} ${cx} ${top} Q${cxR} ${top + 3} ${cxR} ${top + crownH} Q${cx} ${top + crownH + 3} ${cxL} ${top + crownH} Z`;
    } else if (type === 'molar') {
        crown = `M${cxL} ${top + 4} Q${cxL} ${top} ${cxL + 4} ${top} L${cxR - 4} ${top} Q${cxR} ${top} ${cxR} ${top + 4} L${cxR} ${top + crownH - 3} Q${cxR} ${top + crownH + 2} ${cx} ${top + crownH + 2} Q${cxL} ${top + crownH + 2} ${cxL} ${top + crownH - 3} Z`;
    } else {
        crown = `M${cxL} ${top + 3} Q${cxL} ${top} ${cxL + 3} ${top} L${cxR - 3} ${top} Q${cxR} ${top} ${cxR} ${top + 3} L${cxR} ${top + crownH - 2} Q${cxR} ${top + crownH + 2} ${cx} ${top + crownH + 2} Q${cxL} ${top + crownH + 2} ${cxL} ${top + crownH - 2} Z`;
    }
    const rTop = top + crownH, rBot = 34;
    let rootPaths: string[];
    if (roots === 1) {
        rootPaths = [`M${cx - 3} ${rTop} L${cx + 3} ${rTop} L${cx + 1.3} ${rBot} Q${cx} ${rBot + 1.5} ${cx - 1.3} ${rBot} Z`];
    } else if (roots === 2) {
        rootPaths = [
            `M${cx - 5} ${rTop} L${cx - 1} ${rTop} L${cx - 2} ${rBot - 3} Q${cx - 3} ${rBot - 1} ${cx - 4.3} ${rBot - 3} Z`,
            `M${cx + 1} ${rTop} L${cx + 5} ${rTop} L${cx + 4.3} ${rBot - 3} Q${cx + 3} ${rBot - 1} ${cx + 2} ${rBot - 3} Z`,
        ];
    } else {
        rootPaths = [
            `M${cx - 7} ${rTop} L${cx - 2.5} ${rTop} L${cx - 3.5} ${rBot - 5} Q${cx - 4.5} ${rBot - 3} ${cx - 5.8} ${rBot - 5} Z`,
            `M${cx - 1.5} ${rTop} L${cx + 1.5} ${rTop} L${cx + 0.8} ${rBot} Q${cx} ${rBot + 1.5} ${cx - 0.8} ${rBot} Z`,
            `M${cx + 2.5} ${rTop} L${cx + 7} ${rTop} L${cx + 5.8} ${rBot - 5} Q${cx + 4.5} ${rBot - 3} ${cx + 3.5} ${rBot - 5} Z`,
        ];
    }
    return { crown, roots: rootPaths };
}

// Yüzey işaretleri (MODBL) — kron kutusu içine çizilen küçük şekiller. Kron
// geometrisi buildToothPaths ile aynı sabitlerden türetilir (cx=11, top=2, h=13).
function surfaceMarks(type: ToothType, surfaces: ToothSurface[], color: string) {
    const cx = 11, top = 2, crownH = 13;
    const crownW = { incisor: 9, canine: 10, premolar: 12, molar: 16 }[type];
    const midY = top + crownH / 2;
    const halfW = crownW / 2;
    const marks: ReactNode[] = [];
    const r = Math.min(2.4, crownW * 0.17); // oklüzal nokta yarıçapı
    for (const s of surfaces) {
        if (s === 'O') marks.push(<circle key="O" cx={cx} cy={midY} r={r} fill={color} />);
        if (s === 'M') marks.push(<rect key="M" x={cx - halfW + 0.8} y={top + 3} width={2.2} height={crownH - 5.5} rx={1.1} fill={color} />);
        if (s === 'D') marks.push(<rect key="D" x={cx + halfW - 3} y={top + 3} width={2.2} height={crownH - 5.5} rx={1.1} fill={color} />);
        if (s === 'B') marks.push(<rect key="B" x={cx - halfW + 2.2} y={top + 1.4} width={crownW - 4.4} height={2.2} rx={1.1} fill={color} />);
        if (s === 'L') marks.push(<rect key="L" x={cx - halfW + 2.2} y={top + crownH - 2.2} width={crownW - 4.4} height={2.2} rx={1.1} fill={color} />);
    }
    return marks;
}

// Yüzeyli durumlar (çürük/dolgu) yüzey seçiliyse tüm kron BOYANMAZ — sadece
// ilgili yüzey işaretlenir (klinik doğruluk: ufak oklüzal çürük ≠ tüm diş kırmızı).
export const ToothSVG = memo(function ToothSVG({ type, color, size = 28, flip = false, className, surfaces, neutralColor = 'var(--dc-surface3)', ring }: {
    type: ToothType; color: string; size?: number; flip?: boolean; className?: string;
    surfaces?: ToothSurface[];    // dolu ise kron nötr kalır, yüzeyler renklenir
    neutralColor?: string;        // yüzey modunda kron zemin rengi
    ring?: string;                // planlı işlem vurgusu — kesikli çerçeve rengi
}) {
    const { crown, roots } = useMemo(() => buildToothPaths(type), [type]);
    const surfaceMode = !!surfaces && surfaces.length > 0;
    const fill = surfaceMode ? neutralColor : color;
    return (
        <svg width={size * 0.65} height={size} viewBox="0 0 22 36" className={className} style={flip ? { transform: 'scaleY(-1)' } : undefined}>
            {ring && <rect x={0.8} y={0.8} width={20.4} height={34.4} rx={5} fill="none" stroke={ring} strokeWidth={1.1} strokeDasharray="2.6 2" />}
            <path d={crown} fill={fill} stroke="rgba(14,14,14,.35)" strokeWidth={0.7} />
            {roots.map((d, i) => <path key={i} d={d} fill={fill} stroke="rgba(14,14,14,.3)" strokeWidth={0.6} />)}
            {surfaceMode && surfaceMarks(type, surfaces!, color)}
        </svg>
    );
});

// MODBL yüzey seçici — klasik odontogram karesi: ortada Oklüzal, çevresinde
// Bukkal (üst), Lingual (alt), Mesial (sol), Distal (sağ). Düzenleme panellerinde
// kullanılır; seçim durumu dışarıdan yönetilir (controlled).
export const SURFACE_LABEL_TR: Record<ToothSurface, string> = {
    M: 'Mesial (ön komşu)', O: 'Oklüzal (çiğneme)', D: 'Distal (arka komşu)', B: 'Bukkal (yanak)', L: 'Lingual (dil)',
};
export function SurfaceSelector({ value, onChange, color, size = 92, border = 'rgba(14,14,14,.25)' }: {
    value: ToothSurface[]; onChange: (next: ToothSurface[]) => void; color: string; size?: number; border?: string;
}) {
    const toggle = (s: ToothSurface) =>
        onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
    const on = (s: ToothSurface) => value.includes(s);
    const [hovered, setHovered] = useState<ToothSurface | null>(null);
    const cell = (s: ToothSurface, d: string, lx: number, ly: number) => (
        <g key={s} role="checkbox" aria-checked={on(s)} aria-label={SURFACE_LABEL_TR[s]} tabIndex={0}
            onClick={() => toggle(s)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s); } }}
            onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'pointer', outline: 'none' }}>
            <path d={d} fill={on(s) ? color : hovered === s ? `${color}33` : 'transparent'} stroke={border} strokeWidth={hovered === s ? 1.6 : 1} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                fontSize={9} fontWeight={800} fill={on(s) ? '#fff' : 'currentColor'} style={{ pointerEvents: 'none' }}>{s}</text>
        </g>
    );
    // 60×60 dış kare, 24×24 iç kare (O)
    return (
        <svg width={size} height={size} viewBox="0 0 60 60" role="group" aria-label="Diş yüzeyi seçici">
            {cell('B', 'M2 2 L58 2 L42 18 L18 18 Z', 30, 10)}
            {cell('L', 'M2 58 L58 58 L42 42 L18 42 Z', 30, 50)}
            {cell('M', 'M2 2 L18 18 L18 42 L2 58 Z', 10, 30)}
            {cell('D', 'M58 2 L42 18 L42 42 L58 58 Z', 50, 30)}
            {cell('O', 'M18 18 L42 18 L42 42 L18 42 Z', 30, 30)}
        </svg>
    );
}

// Kompakt önizleme (dashboard özet kartları, hasta listesi satırları) — üst +
// alt çene tek satırda, küçük diş boyutunda. Renk mantığı çağırana bırakılır
// (dashboard --dc-* değişkeni, hasta detayında hex kullanır).
export function MiniArch({ current, toothSize = 15, colorFor }: {
    current: Map<number, { status: string }>;
    toothSize?: number;
    colorFor: (status: string) => string;
}) {
    const neutral = 'var(--dc-surface3)';
    const colorOf = (n: number) => {
        const rec = current.get(n);
        return rec && rec.status !== 'saglam' ? colorFor(rec.status) : neutral;
    };
    // Anatomik çene kavisi (U formu) — kesiciler ortada birbirinden uzaklaşır,
    // azılar uçlarda hizada kalır. transform layout'u etkilemediği için kavis
    // payı kadar dikey padding bırakılır.
    const maxArc = toothSize * 0.45;
    const arcOf = (i: number) => maxArc * (1 - Math.pow((i - 7.5) / 7.5, 2));
    return (
        <div style={{ padding: `${Math.ceil(maxArc)}px 0` }}>
            <div style={{ display: 'flex' }}>
                {UPPER_ORDER.map((t, i) => (
                    <span key={t.n} style={{ display: 'inline-flex', transform: `translateY(${-arcOf(i)}px)` }}>
                        <ToothSVG type={t.type} color={colorOf(t.n)} size={toothSize} flip />
                    </span>
                ))}
            </div>
            <div style={{ display: 'flex' }}>
                {LOWER_ORDER.map((t, i) => (
                    <span key={t.n} style={{ display: 'inline-flex', transform: `translateY(${arcOf(i)}px)` }}>
                        <ToothSVG type={t.type} color={colorOf(t.n)} size={toothSize} />
                    </span>
                ))}
            </div>
        </div>
    );
}
