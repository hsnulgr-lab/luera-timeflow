import { memo } from 'react';
import { UPPER_ORDER, LOWER_ORDER, type ToothType } from '@/components/dental/ToothSVG';
import { STATUS_LEGEND, DENTAL_STATUS_LABEL } from '@/components/dental/dentalStatusMeta';
import { cn } from '@/utils/cn';
import type { DentalStatus } from '@/types';
import './tooth.css';

// Anatomik diş glifi — her diş iki görünümden oluşur: yandan kesit (kök, kron,
// pulpa kanalları) ve üstten çiğneme yüzeyi. Renk bilgisi path'lerde DEĞİL,
// durum sınıflarının set ettiği CSS değişkenlerinde (bkz. tooth.css) — bir
// durumun rengini değiştirmek için SVG'ye dokunmak gerekmez.
//
// Semboller <symbol>/<use> sprite'ı yerine satır içi çizilir: panel aynı
// sayfada birden çok kez açılabiliyor ve sprite id'leri çakışırdı.

const SIDE_CROWN_MOLAR = 'M8 56C4 60 4 69 6 80C8 90 15 94 24 94C33 94 40 90 42 80C44 69 44 60 40 56C32 52 16 52 8 56Z';
const SIDE_CROWN_PREMOLAR = 'M12 57C8 62 9 73 12 82C15 91 19 94 24 94C30 94 35 91 38 82C41 73 40 62 36 57C30 53 18 53 12 57Z';
const SIDE_DETAIL_MOLAR = 'M9 76C14 72 19 72 24 76C29 72 34 72 39 76M15 87C18 84 21 83 24 86C27 83 31 84 34 87';
const SIDE_DETAIL_PREMOLAR = 'M14 76C19 73 22 73 24 77C27 73 31 73 36 76M18 87C21 84 27 84 31 87';
const SIDE_PATCH_MOLAR = 'M28 59C34 58 38 61 37 66C36 70 30 71 27 68C25 65 25 61 28 59Z';
const SIDE_PATCH_PREMOLAR = 'M25 60C30 59 34 62 33 66C32 70 27 71 24 68C22 66 22 62 25 60Z';
const SIDE_PATCH_FRONT = 'M25 61C29 61 32 64 31 67C30 70 26 71 23 68C21 66 22 62 25 61Z';

interface SideShape { root: string; pulp: string; crown: string; detail: string; patch: string }

const SIDE: Record<string, SideShape> = {
    // Üst azı — üç köklü
    molarUpper: {
        root: 'M8 58C10 45 6 26 8 8C9 2 14 1 16 7C19 19 19 34 22 45C23 29 22 14 25 5C27 0 31 1 32 7C34 20 31 35 29 45C34 35 36 19 39 10C41 5 45 7 44 14C43 32 39 47 40 59Z',
        pulp: 'M13 57C14 44 11 27 12 10M24 57C25 42 26 23 28 7M34 57C36 43 39 27 41 13',
        crown: SIDE_CROWN_MOLAR, detail: SIDE_DETAIL_MOLAR, patch: SIDE_PATCH_MOLAR,
    },
    // Alt azı — iki köklü
    molarLower: {
        root: 'M8 58C11 45 8 25 10 8C11 3 16 2 18 8C21 20 21 35 23 45C27 34 28 18 31 8C33 2 38 3 39 9C41 27 37 45 40 59Z',
        pulp: 'M15 57C17 43 14 25 15 9M32 57C33 42 35 25 35 9',
        crown: SIDE_CROWN_MOLAR, detail: SIDE_DETAIL_MOLAR, patch: SIDE_PATCH_MOLAR,
    },
    // Üst birinci küçük azı — iki köklü
    premolarDouble: {
        root: 'M13 59C15 44 11 24 14 7C15 2 20 2 22 8C24 19 24 35 24 46C27 33 28 18 30 8C31 3 36 3 36 10C36 28 33 45 35 59Z',
        pulp: 'M19 57C20 42 18 24 19 9M29 57C30 42 32 24 33 10',
        crown: SIDE_CROWN_PREMOLAR, detail: SIDE_DETAIL_PREMOLAR, patch: SIDE_PATCH_PREMOLAR,
    },
    premolarSingle: {
        root: 'M16 59C19 44 17 24 20 7C21 2 27 2 29 7C32 24 29 44 32 59Z',
        pulp: 'M24 57C25 41 24 23 25 7',
        crown: SIDE_CROWN_PREMOLAR, detail: SIDE_DETAIL_PREMOLAR, patch: SIDE_PATCH_PREMOLAR,
    },
    canine: {
        root: 'M17 61C19 48 17 27 20 7C21 2 26 1 28 7C31 26 29 47 31 61Z',
        pulp: 'M24 59C25 43 24 25 25 7',
        crown: 'M15 59C11 65 13 79 18 87C20 91 22 94 24 95C27 93 29 90 31 87C36 79 38 65 33 59C28 55 20 55 15 59Z',
        detail: 'M18 78C21 76 23 78 24 83C26 78 28 76 31 78',
        patch: SIDE_PATCH_FRONT,
    },
    incisor: {
        root: 'M17 61C19 47 18 27 20 7C21 2 27 2 28 7C31 27 29 47 31 61Z',
        pulp: 'M24 59C25 43 24 24 25 7',
        crown: 'M14 59C11 64 12 78 14 88C18 93 30 94 34 88C36 78 37 64 34 59C28 55 20 55 14 59Z',
        detail: 'M17 84C21 86 27 86 31 84',
        patch: SIDE_PATCH_FRONT,
    },
};

interface TopShape { shell: string; detail: string; patch: string }

const TOP_SHELL_MOLAR = 'M7 7C12 2 36 2 41 7C45 12 44 22 39 26C33 31 15 31 9 26C4 22 3 12 7 7Z';

const TOP: Record<ToothType, TopShape> = {
    molar: {
        shell: TOP_SHELL_MOLAR,
        detail: 'M12 11C17 13 20 15 24 20C28 15 31 13 36 11M13 23C18 20 20 20 24 20C28 20 31 20 36 23',
        patch: 'M26 8C32 7 36 10 35 15C34 19 29 20 25 17C22 14 22 10 26 8Z',
    },
    premolar: {
        shell: 'M11 6C17 2 31 2 37 6C42 10 41 22 36 27C30 31 18 31 12 27C7 22 6 10 11 6Z',
        detail: 'M15 10C20 12 22 16 24 22C26 16 28 12 33 10M16 24C21 21 27 21 32 24',
        patch: 'M25 7C30 7 33 10 32 14C31 18 27 19 24 16C22 14 22 9 25 7Z',
    },
    canine: {
        shell: 'M24 3C31 4 39 13 38 20C36 27 30 30 24 30C18 30 12 27 10 20C9 13 17 4 24 3Z',
        detail: 'M15 20C19 17 21 14 24 8C27 14 29 17 34 20',
        patch: 'M25 8C29 8 31 11 30 14C29 17 25 18 23 15C21 13 22 9 25 8Z',
    },
    incisor: {
        shell: 'M12 7C18 3 30 3 36 7C40 12 39 23 34 27C28 30 20 30 14 27C9 23 8 12 12 7Z',
        detail: 'M16 12C21 10 27 10 32 12M16 23C21 25 27 25 32 23',
        patch: 'M25 7C29 7 32 10 31 14C30 17 26 18 23 15C21 13 22 9 25 7Z',
    },
};

/** Kesit görünümü, dişin numarasına ve tipine göre doğru kök sayısıyla. */
function sideShapeKey(n: number, type: ToothType): string {
    const upper = n < 30;
    if (type === 'molar') return upper ? 'molarUpper' : 'molarLower';
    // Üst birinci küçük azı çift köklüdür; diğer küçük azılar tek kök.
    if (type === 'premolar') return upper && n % 10 === 4 ? 'premolarDouble' : 'premolarSingle';
    return type;
}

export const AnatomicTooth = memo(function AnatomicTooth({
    n, type, status = 'saglam', planned = false, selected = false, disabled = false, onSelect,
}: {
    n: number;
    type: ToothType;
    status?: DentalStatus;
    planned?: boolean;
    selected?: boolean;
    disabled?: boolean;
    onSelect?: (n: number) => void;
}) {
    const implant = status === 'implant';
    const side = SIDE[sideShapeKey(n, type)];
    const top = TOP[type];
    // Sol çeyrekler (2x/3x) aynalanır — ark simetrik görünsün.
    const quadrant = Math.floor(n / 10);
    const mirror = quadrant === 2 || quadrant === 3;

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(n)}
            aria-pressed={selected}
            aria-label={`${n} numaralı diş, ${DENTAL_STATUS_LABEL[status]}${planned ? ', planlı işlem' : ''}`}
            className={cn('dt-tooth', `is-${status}`, planned && 'is-planned', selected && 'is-selected',
                mirror && 'mirror', n % 10 === 8 && 'is-wisdom', n % 10 === 2 && 'is-lateral')}
        >
            <svg className="dt-side" viewBox="0 0 48 96" aria-hidden="true">
                {implant ? (
                    <>
                        <rect className="dt-implant-body" x={20} y={7} width={8} height={50} rx={4} />
                        <path className="dt-implant-thread" d="M19 14H29M19 21H29M19 28H29M19 35H29M19 42H29M19 49H29" />
                        <path className="dt-crown-shell" d={SIDE_CROWN_MOLAR} />
                        <path className="dt-detail" d="M10 76C16 72 20 72 24 76C29 72 34 72 39 76" />
                    </>
                ) : (
                    <>
                        <path className="dt-root-shell" d={side.root} />
                        <path className="dt-pulp" d={side.pulp} />
                        <path className="dt-crown-shell" d={side.crown} />
                        <path className="dt-detail" d={side.detail} />
                        <path className="dt-patch" d={side.patch} />
                    </>
                )}
            </svg>
            <svg className="dt-top" viewBox="0 0 48 32" aria-hidden="true">
                {implant ? (
                    <>
                        <path className="dt-top-shell" d={TOP_SHELL_MOLAR} />
                        <circle className="dt-implant-body" cx={24} cy={16} r={6} />
                        <path className="dt-implant-thread" d="M20 16H28M24 12V20" />
                    </>
                ) : (
                    <>
                        <path className="dt-top-shell" d={top.shell} />
                        <path className="dt-detail" d={top.detail} />
                        <path className="dt-patch" d={top.patch} />
                    </>
                )}
            </svg>
            <span className="dt-num">{n}</span>
        </button>
    );
});

/** Üst + alt ark — yatay kaydırmalı anatomik odontogram. */
export function ToothArchBoard({ statusOf, plannedOf, selected, onSelect, disabled }: {
    statusOf: (n: number) => DentalStatus | undefined;
    plannedOf?: (n: number) => boolean;
    selected?: number | null;
    onSelect?: (n: number) => void;
    disabled?: boolean;
}) {
    const arch = (rows: typeof UPPER_ORDER, lower: boolean, label: string, range: string) => (
        <div className={cn('dt-arch', lower ? 'lower' : 'upper')}>
            <div className="dt-arch-heading">
                <span className="dt-arch-label">{label}</span>
                <span className="dt-arch-range">{range}</span>
            </div>
            <div className="dt-grid" role="group" aria-label={`${label} dişleri`}>
                {rows.map((t) => (
                    <AnatomicTooth
                        key={t.n} n={t.n} type={t.type}
                        status={statusOf(t.n) ?? 'saglam'}
                        planned={plannedOf?.(t.n) ?? false}
                        selected={selected === t.n}
                        disabled={disabled}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <div className="dt-scroll" tabIndex={0} aria-label="Anatomik diş şeması, dar ekranda yatay kaydırılabilir">
            <div className="dt-scroll-inner">
                <div className="dt-board">
                    <div className="dt-orientation" aria-hidden="true">
                        <span>Hastanın sağı</span>
                        <span>Hastanın solu</span>
                    </div>
                    {arch(UPPER_ORDER, false, 'Üst ark', '18 → 28')}
                    {arch(LOWER_ORDER, true, 'Alt ark', '48 → 38')}
                </div>
            </div>
        </div>
    );
}

export function ToothLegend() {
    return (
        <div className="dt-legend" role="list" aria-label="Diş durumları lejantı">
            {STATUS_LEGEND.map((item) => (
                <span className="dt-legend-item" role="listitem" key={item.status}>
                    <span className={cn('dt-swatch', item.cls)} />{item.label}
                </span>
            ))}
        </div>
    );
}
