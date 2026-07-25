import { useMemo, useState } from 'react';
import { Activity, Droplet, History } from 'lucide-react';
import { usePeriodontal, type PerioInput } from '@/hooks/usePeriodontal';
import { UPPER_ORDER, LOWER_ORDER } from '@/components/dental/ToothSVG';
import { PERIO_SITES, type PerioTooth } from '@/types';
import { cn } from '@/utils/cn';
import { formatDateEU } from '@/utils/date';

// Cep derinliği renk skalası — sağlık eşiği: ≤3mm sağlıklı, 4-5mm dikkat, ≥6mm hastalıklı
function depthColor(mm: number | null | undefined): string {
    if (mm == null) return 'var(--dc-surface3)';
    if (mm <= 3) return 'var(--dc-green)';
    if (mm <= 5) return 'var(--dc-amber)';
    return 'var(--dc-red2)';
}
function maxDepth(t: PerioTooth | undefined): number | null {
    if (!t || t.pocketDepth.length === 0) return null;
    const vals = t.pocketDepth.filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.max(...vals) : null;
}
function bopCount(t: PerioTooth | undefined): number {
    return t ? t.bleeding.filter(Boolean).length : 0;
}

const SITE_LABEL: Record<string, string> = { db: 'DB', b: 'B', mb: 'MB', dl: 'DL', l: 'L', ml: 'ML' };
const emptySix = <T,>(v: T): T[] => [v, v, v, v, v, v];

interface PerioChartProps {
    customerId: string;
    staffId?: string;
}

// Periodontal cep haritası — diş başına 6 nokta (bukkal DB·B·MB / lingual DL·L·ML)
// cep derinliği + sondalamada kanama (BOP) + sallanma. Diş şeması sekmesinin
// yanında "Periodontal" görünümü olarak açılır. Klinik özet: BOP% ve ort. cep.
export function PerioChart({ customerId, staffId }: PerioChartProps) {
    const { chart, isLoading, available, setTooth } = usePeriodontal(customerId);
    const [activeTooth, setActiveTooth] = useState<number | null>(null);
    const [draft, setDraft] = useState<PerioInput | null>(null);
    const [saving, setSaving] = useState(false);

    const summary = useMemo(() => {
        let sites = 0, bop = 0, depthSum = 0, depthCount = 0, deepPockets = 0;
        for (const t of chart.values()) {
            for (let i = 0; i < 6; i++) {
                const pd = t.pocketDepth[i];
                if (typeof pd === 'number') { depthSum += pd; depthCount++; if (pd >= 6) deepPockets++; }
                if (t.bleeding[i] !== undefined) { sites++; if (t.bleeding[i]) bop++; }
            }
        }
        return {
            bopPct: sites ? Math.round((bop / sites) * 100) : 0,
            avgDepth: depthCount ? (depthSum / depthCount).toFixed(1) : '—',
            deepPockets,
            measured: chart.size,
        };
    }, [chart]);

    const pick = (n: number) => {
        setActiveTooth(n);
        const t = chart.get(n);
        setDraft({
            pocketDepth: t ? [...t.pocketDepth, ...emptySix<number | null>(null)].slice(0, 6) : emptySix<number | null>(null),
            recession: t ? [...t.recession, ...emptySix<number | null>(null)].slice(0, 6) : emptySix<number | null>(null),
            bleeding: t ? [...t.bleeding, ...emptySix(false)].slice(0, 6) : emptySix(false),
            mobility: t?.mobility,
            note: t?.note,
        });
    };

    const save = async () => {
        if (activeTooth == null || !draft) return;
        setSaving(true);
        const ok = await setTooth(activeTooth, { ...draft, measuredBy: staffId });
        setSaving(false);
        if (ok) setActiveTooth(null);
    };

    if (available === false) {
        return (
            <div className="py-14 px-6 text-center">
                <Activity className="mx-auto mb-2 text-[var(--dc-muted2)]" size={22} />
                <div className="text-[13px] font-bold text-[var(--dc-ink)]">Periodontal modül hazırlanıyor</div>
                <div className="mt-1 text-[12px] text-[var(--dc-muted)]">Veritabanı güncellemesi (063) uygulandığında cep haritası aktif olur.</div>
            </div>
        );
    }

    const renderTooth = (n: number) => {
        const t = chart.get(n);
        const md = maxDepth(t);
        const bop = bopCount(t);
        return (
            <button key={n} type="button" onClick={() => pick(n)}
                aria-label={`Diş ${n} periodontal${md != null ? `, en derin cep ${md}mm` : ''}`}
                className={cn('w-[34px] flex flex-col items-center gap-0.5 rounded-md py-1 cursor-pointer outline-none transition-colors hover:bg-[var(--dc-surface2)] focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)]',
                    activeTooth === n && 'bg-[rgba(255,90,31,.08)] ring-1 ring-[var(--dc-orange)]')}>
                <span className="font-mono text-[10px] font-bold text-[var(--dc-muted)]">{n}</span>
                <span className="grid h-6 w-6 place-items-center rounded-md text-[10px] font-extrabold text-white" style={{ background: depthColor(md) }}>{md ?? '·'}</span>
                <span className="h-[6px] w-[6px] rounded-full" style={{ background: bop > 0 ? 'var(--dc-red2)' : 'transparent' }} title={bop > 0 ? `${bop} noktada kanama` : ''} />
            </button>
        );
    };

    const activeT = activeTooth != null ? chart.get(activeTooth) : undefined;

    return (
        <div>
            {/* Klinik özet */}
            <div className="grid grid-cols-4 gap-px bg-[var(--dc-border)] border-y border-[var(--dc-border)]">
                {([['BOP', `%${summary.bopPct}`, summary.bopPct >= 20 ? 'var(--dc-red2)' : 'var(--dc-green)'],
                   ['Ort. cep', `${summary.avgDepth} mm`, 'var(--dc-ink)'],
                   ['Derin cep (≥6)', String(summary.deepPockets), summary.deepPockets > 0 ? 'var(--dc-red2)' : 'var(--dc-ink)'],
                   ['Ölçülen diş', String(summary.measured), 'var(--dc-ink)']] as const).map(([k, v, c]) => (
                    <div key={k} className="bg-[var(--dc-surface)] px-3 py-3 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[.05em] text-[var(--dc-muted)]">{k}</div>
                        <div className="mt-0.5 font-mono text-[16px] font-extrabold" style={{ color: c }}>{v}</div>
                    </div>
                ))}
            </div>

            {isLoading && <div className="py-6 text-center text-[12px] text-[var(--dc-muted)]">Yükleniyor…</div>}

            {/* Editör */}
            {activeTooth != null && draft && (
                <div className="mx-5 mt-4 rounded-[14px] bg-[var(--dc-surface2)] border border-[var(--dc-border)] overflow-hidden" style={{ animation: 'dc-panel-in 180ms ease' }}>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--dc-border)]">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] font-mono text-[13px] font-extrabold">{activeTooth}</span>
                        <div className="flex-1">
                            <div className="text-[14px] font-extrabold text-[var(--dc-ink)]">Diş {activeTooth} · Periodontal ölçüm</div>
                            <div className="text-[11px] text-[var(--dc-muted)]">Cep derinliği (mm) ve kanama — bukkal ve lingual 3'er nokta</div>
                        </div>
                        <button type="button" onClick={() => setActiveTooth(null)} aria-label="Kapat"
                            className="w-[34px] h-[34px] rounded-lg grid place-items-center text-[var(--dc-muted)] hover:bg-[var(--dc-surface3)] hover:text-[var(--dc-ink)]">✕</button>
                    </div>
                    <div className="p-4 flex flex-col gap-4">
                        {([['Bukkal', 0], ['Lingual', 3]] as const).map(([face, offset]) => (
                            <div key={face}>
                                <div className="text-[11px] font-bold uppercase tracking-[.05em] text-[var(--dc-muted)] mb-2">{face} yüzey</div>
                                <div className="grid grid-cols-3 gap-2">
                                    {[0, 1, 2].map((j) => {
                                        const idx = offset + j;
                                        const site = PERIO_SITES[idx];
                                        const bleeding = draft.bleeding[idx];
                                        return (
                                            <div key={site} className="rounded-[10px] bg-[var(--dc-surface)] border border-[var(--dc-border2)] p-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-mono text-[10px] font-bold text-[var(--dc-muted)]">{SITE_LABEL[site]}</span>
                                                    <button type="button" role="checkbox" aria-checked={bleeding} title="Sondalamada kanama"
                                                        onClick={() => setDraft((d) => d && ({ ...d, bleeding: d.bleeding.map((b, k) => k === idx ? !b : b) }))}
                                                        className={cn('grid h-5 w-5 place-items-center rounded-md border transition-colors',
                                                            bleeding ? 'bg-[var(--dc-red2)] border-[var(--dc-red2)] text-white' : 'border-[var(--dc-border2)] text-[var(--dc-muted2)]')}>
                                                        <Droplet size={11} />
                                                    </button>
                                                </div>
                                                <input inputMode="numeric" placeholder="mm" aria-label={`${SITE_LABEL[site]} cep derinliği`}
                                                    value={draft.pocketDepth[idx] ?? ''}
                                                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); const n = v === '' ? null : Math.min(15, parseInt(v, 10)); setDraft((d) => d && ({ ...d, pocketDepth: d.pocketDepth.map((x, k) => k === idx ? n : x) })); }}
                                                    className="w-full rounded-md bg-[var(--dc-surface2)] px-2 py-1.5 text-center font-mono text-[15px] font-bold text-[var(--dc-ink)] outline-none border border-transparent focus:border-[var(--dc-orange)]" />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[11px] font-bold uppercase tracking-[.05em] text-[var(--dc-muted)]">Sallanma</span>
                            {[0, 1, 2, 3].map((m) => (
                                <button key={m} type="button" onClick={() => setDraft((d) => d && ({ ...d, mobility: d.mobility === m ? undefined : m }))}
                                    className={cn('h-8 w-8 rounded-lg text-[13px] font-extrabold border transition-colors',
                                        draft.mobility === m ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]' : 'bg-[var(--dc-surface)] text-[var(--dc-muted)] border-[var(--dc-border2)] hover:border-[var(--dc-ink)]')}>
                                    {m}
                                </button>
                            ))}
                            <input value={draft.note ?? ''} onChange={(e) => setDraft((d) => d && ({ ...d, note: e.target.value }))} placeholder="Kısa not…"
                                className="flex-1 min-w-[140px] rounded-[9px] border border-[var(--dc-border2)] bg-[var(--dc-surface)] px-3 py-2 text-[12.5px] text-[var(--dc-ink)] outline-none" />
                            <button type="button" disabled={saving} onClick={save}
                                className="px-5 py-2 rounded-full text-[12.5px] font-bold text-white disabled:opacity-50 hover:bg-[var(--dc-orange)] transition-colors" style={{ background: 'var(--dc-ink)' }}>
                                {saving ? 'Kaydediliyor…' : 'Kaydet'}
                            </button>
                        </div>
                        {activeT && (
                            <div className="flex items-center gap-1.5 text-[11px] text-[var(--dc-muted2)]">
                                <History size={12} /> Son ölçüm: {formatDateEU(activeT.updatedAt.slice(0, 10))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Arklar */}
            <div className="px-5 pt-6 pb-5 overflow-x-auto">
                <div className="flex justify-center gap-0.5" style={{ minWidth: 920 }}>
                    {UPPER_ORDER.map((t) => renderTooth(t.n))}
                </div>
                <div className="rounded-md my-1.5 h-[26px] flex items-center justify-center" style={{ minWidth: 920, background: 'linear-gradient(180deg, rgba(255,90,31,.14), transparent)' }}>
                    <span className="text-[9px] font-bold tracking-[.12em] uppercase text-[var(--dc-muted2)]">Diş Eti</span>
                </div>
                <div className="flex justify-center gap-0.5" style={{ minWidth: 920 }}>
                    {LOWER_ORDER.map((t) => renderTooth(t.n))}
                </div>
            </div>

            {/* Lejant */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pb-5">
                {([['≤3 mm sağlıklı', 'var(--dc-green)'], ['4-5 mm dikkat', 'var(--dc-amber)'], ['≥6 mm derin cep', 'var(--dc-red2)']] as const).map(([l, c]) => (
                    <div key={l} className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--dc-muted)]">
                        <span className="w-[8px] h-[8px] rounded-sm" style={{ background: c }} />{l}
                    </div>
                ))}
                <div className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--dc-muted)]">
                    <span className="w-[8px] h-[8px] rounded-full bg-[var(--dc-red2)]" /> Kanama (BOP)
                </div>
                <span className="ml-auto text-[9.5px] text-[var(--dc-muted2)] font-semibold">Dişe tıklayarak 6 noktayı ölçün</span>
            </div>
        </div>
    );
}
