import { cn } from '@/utils/cn';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'ghost' | 'ghost-dark' | 'ink' | 'bracket';
type Size = 'sm' | 'md' | 'lg';

interface LueraButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    children: ReactNode;
}

/**
 * Luera button — mirrors "Luera Buttons & Icons" kit.
 *  primary: cream fill / ink text, hover → orange + lift + glow
 *  accent:  orange fill / ink text (loud CTA)
 *  ghost:   transparent / ink text + hairline border
 */
const VARIANTS: Record<Variant, string> = {
    primary:
        'bg-[#F3ECE0] text-[#0E0E0E] border border-[#F3ECE0] hover:bg-[#FF5A1F] hover:border-[#FF5A1F] hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(255,90,31,0.22)]',
    accent:
        'bg-[#FF5A1F] text-[#0E0E0E] border border-[#FF5A1F] font-bold hover:-translate-y-px hover:shadow-[0_12px_32px_rgba(255,90,31,0.35)]',
    ghost:
        'bg-transparent text-[#0E0E0E] border border-[#0E0E0E]/[0.13] hover:bg-[#F3EDE4] hover:border-[#0E0E0E]',
    'ghost-dark':
        'bg-transparent text-[rgba(243,236,224,0.85)] border border-[rgba(243,236,224,0.25)] hover:bg-[rgba(243,236,224,0.06)] hover:border-[#F3ECE0]',
    ink:
        'bg-[#0E0E0E] text-[#F0EBE1] border border-[#0E0E0E] hover:bg-[#FF5A1F] hover:border-[#FF5A1F] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(255,90,31,0.25)]',
    bracket:
        'btn-bracket text-[rgba(240,235,225,0.55)] hover:text-[rgba(240,235,225,0.90)] rounded-lg',
};

const SIZES: Record<Size, string> = {
    sm: 'h-[34px] px-4 text-[12.5px] gap-1.5',
    md: 'h-11 px-[22px] text-sm gap-2',
    lg: 'h-[54px] px-7 text-[15.5px] gap-2.5',
};

export const LueraButton = ({
    variant = 'primary',
    size = 'md',
    className,
    children,
    ...rest
}: LueraButtonProps) => (
    <button
        className={cn(
            'inline-flex items-center justify-center rounded-full font-semibold tracking-[-0.005em] whitespace-nowrap select-none',
            'transition-[transform,background-color,color,border-color,box-shadow] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]',
            'active:translate-y-px active:scale-[0.98] disabled:opacity-35 disabled:pointer-events-none',
            SIZES[size],
            VARIANTS[variant],
            className,
        )}
        {...rest}
    >
        {children}
    </button>
);
