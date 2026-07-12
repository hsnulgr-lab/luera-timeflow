// Dashboard KPI ilkelleri — randevu (DashboardPage) ve restoran (MasaDashboard)
// dashboard'ları PAYLAŞIR. Tek kaynak: kart/sparkline/progress görünümü iki
// dashboard'da birebir aynı olsun ("hibrit" restoran dashboard'u randevu
// dashboard'unun zenginliğini aynen kullansın).
import { cn } from '@/utils/cn';

export const MONO = "'JetBrains Mono', monospace";

export type TrendKind = 'up' | 'down' | 'neutral' | 'warn';

const TREND_STYLE: Record<TrendKind, React.CSSProperties> = {
    up:      { background: 'var(--dc-green-bg)',   color: 'var(--dc-green)' },
    down:    { background: 'var(--dc-red-bg)',     color: 'var(--dc-red2)' },
    neutral: { background: 'var(--dc-surface2)',   color: 'var(--dc-muted)' },
    warn:    { background: 'rgba(255,90,31,0.10)', color: 'var(--dc-orange)' },
};

export function TrendChip({ kind, text }: { kind: TrendKind; text: string }) {
    return (
        <span
            className="inline-flex items-center gap-0.5 rounded-full px-[8px] py-[3px] text-[9.5px] font-bold whitespace-nowrap flex-shrink-0"
            style={{ fontFamily: MONO, ...TREND_STYLE[kind] }}
        >
            {text}
        </span>
    );
}

// Mevcut & önceki değere göre trend chip üret
export function compareTrend(curr: number, prev: number): { kind: TrendKind; text: string } {
    if (prev === 0 && curr === 0) return { kind: 'neutral', text: '= geçen hafta' };
    if (prev === 0)               return { kind: 'up',      text: '↑ yeni' };
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (pct === 0) return { kind: 'neutral', text: '= geçen hafta' };
    if (pct > 0)   return { kind: 'up',      text: `↑ %${pct}` };
    return { kind: 'down', text: `↓ %${Math.abs(pct)}` };
}

// 7 çubuklu sparkline — vurgulu çubuk activeIndex (yoksa son çubuk)
export function Sparkline({ data, urgent, activeIndex }: { data: number[]; urgent?: boolean; activeIndex?: number }) {
    const max = Math.max(1, ...data);
    const ai = activeIndex ?? data.length - 1;
    return (
        <div className="flex items-end gap-[2px] h-[11px] mt-[5px]">
            {data.map((v, i) => {
                const active = i === ai;
                const h = v === 0 ? '2px' : `${Math.max(14, Math.round((v / max) * 100))}%`;
                return (
                    <div
                        key={i}
                        className="flex-1 rounded-t-[2px] transition-[height] duration-500"
                        style={{ height: h, background: active ? (urgent ? 'var(--dc-orange)' : 'var(--dc-ink)') : 'var(--dc-surface3)' }}
                    />
                );
            })}
        </div>
    );
}

// İlerleme çubuğu — etiket + yüzde
export function ProgressBar({ label, pct, urgent }: { label: string; pct: number; urgent?: boolean }) {
    return (
        <div className="mt-[5px]">
            <div className="flex justify-between text-[9.5px] mb-[3px]" style={{ fontFamily: MONO, color: 'var(--dc-muted)' }}>
                <span>{label}</span><span className="font-semibold" style={{ color: 'var(--dc-ink)' }}>%{pct}</span>
            </div>
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--dc-surface3)' }}>
                <div
                    className="h-full rounded-full transition-[width] duration-1000"
                    style={{
                        width: `${pct}%`,
                        background: urgent
                            ? 'linear-gradient(90deg,#FF5A1F,#ff8a52)'
                            : 'linear-gradient(90deg,var(--dc-ink),var(--dc-muted))',
                    }}
                />
            </div>
        </div>
    );
}

// Tek bir KPI kartı
export function StatCard({ label, value, sublabel, compareLabel, compareValue, trend, urgent, onClick, children }: {
    label: string; value: number | string; sublabel: string;
    compareLabel: string; compareValue: number | string;
    trend: { kind: TrendKind; text: string };
    urgent?: boolean; onClick?: () => void; children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col text-left rounded-[14px] px-3 py-2 transition-all hover:-translate-y-0.5",
                "shadow-[0_1px_3px_rgba(14,14,14,0.06),0_2px_8px_rgba(14,14,14,0.04)]",
                "hover:shadow-[0_2px_8px_rgba(14,14,14,0.08),0_8px_24px_rgba(14,14,14,0.06)]",
            )}
            style={{
                background: urgent ? 'rgba(255,90,31,0.035)' : 'var(--dc-surface)',
                border: `1px solid ${urgent ? 'rgba(255,90,31,0.25)' : 'var(--dc-border)'}`,
            }}
        >
            <div className="flex items-center justify-between mb-1">
                <span
                    className="text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ fontFamily: MONO, color: urgent ? 'var(--dc-orange)' : 'var(--dc-muted)' }}
                >
                    {label}
                </span>
                <TrendChip kind={trend.kind} text={trend.text} />
            </div>
            <p
                className="text-[25px] font-black leading-[1.05] tracking-[-0.05em]"
                style={{ color: urgent ? 'var(--dc-orange)' : 'var(--dc-ink)' }}
            >
                {value}
            </p>
            <p className="text-[12px] mt-0.5 font-semibold" style={{ color: 'var(--dc-muted)' }}>{sublabel}</p>
            <p className="text-[10.5px] mt-[3px] font-medium" style={{ color: 'var(--dc-muted)' }}>
                {compareLabel}: <b style={{ color: 'var(--dc-ink)' }}>{compareValue}</b>
            </p>
            {children}
        </button>
    );
}
