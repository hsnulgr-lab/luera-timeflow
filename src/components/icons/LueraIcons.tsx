/**
 * Luera minimal icon set — extracted from "Luera Buttons & Icons" design.
 * All icons: 20×20 grid, 1.6 stroke, round caps/joins, currentColor.
 * A handful (Clipboard, Users, Chart, Logout) are drawn in the identical
 * style to fill gaps the original kit didn't cover.
 */
import type { CSSProperties } from 'react';

export interface LueraIconProps {
    size?: number;
    className?: string;
    strokeWidth?: number;
    style?: CSSProperties;
}

interface SvgProps extends LueraIconProps {
    children: React.ReactNode;
}

const Svg = ({ size = 20, className, strokeWidth = 1.6, style, children }: SvgProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
    >
        {children}
    </svg>
);

/* ── kit icons ── */
export const LDashboard = (p: LueraIconProps) => (
    <Svg {...p}>
        <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
    </Svg>
);

export const LSearch = (p: LueraIconProps) => (
    <Svg {...p}>
        <circle cx="9" cy="9" r="6" />
        <path d="m17 17-3.5-3.5" />
    </Svg>
);

export const LHome = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M3 8.5 10 3l7 5.5V16a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16V8.5z" />
        <path d="M8 17.5v-5h4v5" />
    </Svg>
);

export const LProfile = (p: LueraIconProps) => (
    <Svg {...p}>
        <circle cx="10" cy="7" r="3" />
        <path d="M3.5 17c.7-3.5 3.3-5.5 6.5-5.5s5.8 2 6.5 5.5" />
    </Svg>
);

export const LSettings = (p: LueraIconProps) => (
    <Svg {...p}>
        <circle cx="10" cy="10" r="2.2" />
        <path d="M16.4 11.6a1.4 1.4 0 0 0 .3 1.5l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-1.5-.3 1.4 1.4 0 0 0-.85 1.3V17a1.7 1.7 0 1 1-3.4 0v-.05a1.4 1.4 0 0 0-.95-1.3 1.4 1.4 0 0 0-1.5.3l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0 .3-1.5 1.4 1.4 0 0 0-1.3-.85H3a1.7 1.7 0 1 1 0-3.4h.05a1.4 1.4 0 0 0 1.3-.95 1.4 1.4 0 0 0-.3-1.5l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 1.5.3h.05a1.4 1.4 0 0 0 .85-1.3V3a1.7 1.7 0 1 1 3.4 0v.05a1.4 1.4 0 0 0 .85 1.3 1.4 1.4 0 0 0 1.5-.3l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0-.3 1.5v.05a1.4 1.4 0 0 0 1.3.85H17a1.7 1.7 0 1 1 0 3.4h-.05a1.4 1.4 0 0 0-1.3.85z" />
    </Svg>
);

export const LNotifications = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M15.5 13.5V8a5.5 5.5 0 0 0-11 0v5.5L3 15.5h14z" />
        <path d="M8 18a2 2 0 0 0 4 0" />
    </Svg>
);

export const LCalendar = (p: LueraIconProps) => (
    <Svg {...p}>
        <rect x="3" y="5" width="14" height="11" rx="1.5" />
        <path d="M3 8h14M7 3v4M13 3v4" />
    </Svg>
);

export const LMenu = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M3 6h14M3 10h14M3 14h9" />
    </Svg>
);

export const LAdd = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M10 3v14M3 10h14" />
    </Svg>
);

export const LArrow = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M3 10h14M11 4l6 6-6 6" />
    </Svg>
);

export const LClose = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M5 5l10 10M15 5L5 15" />
    </Svg>
);

export const LCheck = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M4 11l4 4 8-9" />
    </Svg>
);

export const LSend = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="m11 3 7 7-7 7M18 10H2" />
    </Svg>
);

export const LMail = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M16 5H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
        <path d="m3.5 6.5 6.5 4.5 6.5-4.5" />
    </Svg>
);

export const LSpark = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="m17 17-1.5-1.5M14 4.5l1.5 1.5M3 17l1.5-1.5M3 4.5 4.5 6M10 14.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
    </Svg>
);

export const LLayout = (p: LueraIconProps) => (
    <Svg {...p}>
        <rect x="3" y="3" width="14" height="14" rx="1.5" />
        <path d="M3 8h14M8 3v14" />
    </Svg>
);

export const LTime = (p: LueraIconProps) => (
    <Svg {...p}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6v4l3 2" />
    </Svg>
);

export const LFlag = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M3 16V4M3 4h11l-2 3 2 3H3" />
    </Svg>
);

export const LStar = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M10 2.5 12.5 8 18 8.5l-4.2 3.7L15 18 10 15l-5 3 1.2-5.8L2 8.5 7.5 8z" />
    </Svg>
);

export const LHeart = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M10 17s-6-4-6-9a4 4 0 0 1 6-3.5A4 4 0 0 1 16 8c0 5-6 9-6 9z" />
    </Svg>
);

export const LUpload = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M10 3v10M5 8l5-5 5 5M3 17h14" />
    </Svg>
);

export const LDownload = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M10 13V3M5 8l5 5 5-5M3 17h14" />
    </Svg>
);

export const LInfo = (p: LueraIconProps) => (
    <Svg {...p}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6.5v4M10 13.5v.01" />
    </Svg>
);

export const LLock = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M14 7a4 4 0 1 0-8 0v3H4v7h12v-7h-2V7z" />
    </Svg>
);

export const LFocus = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M10 4v3M10 13v3M4 10h3M13 10h3" />
        <circle cx="10" cy="10" r="2" />
    </Svg>
);

export const LWorkspace = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M3 17V8.5l7-5 7 5V17M8 17v-5h4v5" />
    </Svg>
);

export const LPackage = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z" />
        <path d="M3 6.5 10 10l7-3.5M10 10v7" />
    </Svg>
);

/* ── chevrons (explicit per-direction paths, no CSS transform) ── */
export const LChevronDown = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M4 7l6 6 6-6" />
    </Svg>
);
export const LChevronUp = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M4 13l6-6 6 6" />
    </Svg>
);
export const LChevronLeft = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M13 4l-6 6 6 6" />
    </Svg>
);
export const LChevronRight = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M7 4l6 6-6 6" />
    </Svg>
);

/* ── style-matched additions (fill gaps the kit didn't cover) ── */
export const LClipboard = (p: LueraIconProps) => (
    <Svg {...p}>
        <rect x="4" y="4.5" width="12" height="13" rx="1.5" />
        <path d="M7.5 4.5v-.8a.7.7 0 0 1 .7-.7h3.6a.7.7 0 0 1 .7.7v.8" />
        <path d="M7 9h6M7 12h6M7 15h4" />
    </Svg>
);

export const LUsers = (p: LueraIconProps) => (
    <Svg {...p}>
        <circle cx="7.5" cy="7.5" r="2.4" />
        <path d="M3.2 16c.5-2.6 2.2-4 4.3-4s3.8 1.4 4.3 4" />
        <path d="M13.2 5.4a2.4 2.4 0 0 1 0 4.4" />
        <path d="M14.6 12.2c1.6.4 2.7 1.6 3.2 3.8" />
    </Svg>
);

export const LChart = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M3.5 16.5h13" />
        <path d="M6 16.5v-4" />
        <path d="M10 16.5v-8" />
        <path d="M14 16.5v-5.5" />
    </Svg>
);

export const LLogout = (p: LueraIconProps) => (
    <Svg {...p}>
        <path d="M8.5 4.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
        <path d="M12 13l3-3-3-3" />
        <path d="M15 10H8" />
    </Svg>
);
