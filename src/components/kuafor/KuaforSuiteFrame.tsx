import type { ElementType, ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import './kuaforSuite.css';

interface KuaforSuiteFrameProps {
    eyebrow: string;
    title: string;
    accent: string;
    description: string;
    icon: ElementType;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function KuaforSuiteFrame({
    eyebrow,
    title,
    accent,
    description,
    icon: Icon,
    actions,
    children,
    className,
}: KuaforSuiteFrameProps) {
    const { dark } = useTheme();

    return (
        <div className={cn('dash-theme ks-shell', dark && 'dark', className)}>
            <div className="ks-ambient ks-ambient-one" />
            <div className="ks-ambient ks-ambient-two" />
            <div className="ks-scroll">
                <header className="ks-page-head">
                    <div className="ks-head-symbol" aria-hidden="true">
                        <Icon size={21} strokeWidth={2.1} />
                        <span />
                    </div>
                    <div className="ks-head-copy">
                        <span className="ks-eyebrow"><Sparkles size={12} /> {eyebrow}</span>
                        <h1>{title} <em>{accent}</em></h1>
                        <p>{description}</p>
                    </div>
                    {actions && <div className="ks-head-actions">{actions}</div>}
                </header>
                {children}
            </div>
        </div>
    );
}

export function initialsOf(name: string) {
    return name.trim().split(/\s+/).map((word) => word[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr') || '?';
}

export function minutesOf(time: string) {
    const [hour, minute = 0] = time.split(':').map(Number);
    return hour * 60 + minute;
}

export function timeOf(total: number) {
    const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function addMinutes(time: string, minutes: number) {
    return timeOf(minutesOf(time) + minutes);
}

export function moneyOf(value: number) {
    return `₺${Math.round(value).toLocaleString('tr-TR')}`;
}

export function dateLabel(iso: string, options?: Intl.DateTimeFormatOptions) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', options || {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
}
