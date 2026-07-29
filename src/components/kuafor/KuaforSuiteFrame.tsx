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
