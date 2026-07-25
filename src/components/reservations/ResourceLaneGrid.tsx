import { Plus } from 'lucide-react';
import { cn } from '@/utils/cn';
import { STATUS_BADGE, STATUS_LABEL } from '@/utils/statusColors';
import type { Reservation, Resource } from '@/types';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00 - 19:00

interface ResourceLaneGridProps {
    dateStr: string;
    today: string;
    resources: Resource[];
    resourceTypeLabel: string;
    reservations: Reservation[];
    onOpenReservation: (r: Reservation) => void;
    onAddAt: (hour: number, resourceId: string | null) => void;
}

// Ünite/koltuk-şeritli gün görünümü: sütunlar = kaynaklar (ünite/koltuk/oda),
// satırlar = saatler. Her randevu bağlı olduğu kaynağın sütununda görünür;
// kaynağı olmayanlar "Atanmamış" sütununda. Boş hücreye tıkla → o kaynak+saat
// için yeni randevu. Klinikte hangi ünitenin dolu/boş olduğu tek bakışta görünür.
export function ResourceLaneGrid({ dateStr, today, resources, resourceTypeLabel, reservations, onOpenReservation, onAddAt }: ResourceLaneGridProps) {
    const activeResources = resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort);
    const dayRes = reservations.filter((r) => r.date === dateStr && r.status !== 'cancelled');
    const hasUnassigned = dayRes.some((r) => !r.resourceId);
    // Sütun tanımı: her aktif kaynak + gerekiyorsa "Atanmamış"
    const columns: { id: string | null; name: string }[] = [
        ...activeResources.map((r) => ({ id: r.id as string | null, name: r.name })),
        ...(hasUnassigned ? [{ id: null as string | null, name: 'Atanmamış' }] : []),
    ];
    const nowHour = dateStr === today ? new Date().getHours() : -1;

    const cellRes = (hour: number, resId: string | null) =>
        dayRes.filter((r) => parseInt(r.startTime.split(':')[0], 10) === hour && (r.resourceId || null) === resId);

    return (
        <div className="flex-1 min-h-0 overflow-auto">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(140px, 1fr))`, minWidth: 56 + columns.length * 140 }}>
                {/* Başlık satırı */}
                <div className="sticky top-0 z-20 bg-[var(--dc-surface2)] border-b border-r border-[var(--dc-border)]" />
                {columns.map((c) => (
                    <div key={c.id ?? 'none'} className="sticky top-0 z-20 bg-[var(--dc-surface2)] border-b border-r border-[var(--dc-border)] px-3 py-2.5 text-center">
                        <div className="text-[12px] font-bold text-[var(--dc-ink)] truncate" title={c.name}>{c.name}</div>
                        <div className="text-[9.5px] uppercase tracking-[.06em] text-[var(--dc-muted2)] font-bold">{c.id ? resourceTypeLabel : '—'}</div>
                    </div>
                ))}

                {/* Saat satırları */}
                {HOURS.map((hour) => (
                    <div key={hour} className="contents">
                        <div className={cn('border-b border-r border-[var(--dc-border)] bg-[var(--dc-surface2)] px-2 py-2 text-right', hour === nowHour && 'bg-[#FF5A1F]/[0.06]')}>
                            <span className={cn('text-[11px] font-bold tabular-nums', hour === nowHour ? 'text-[#FF5A1F]' : 'text-[var(--dc-muted)]')}>{String(hour).padStart(2, '0')}:00</span>
                        </div>
                        {columns.map((c) => {
                            const items = cellRes(hour, c.id);
                            return (
                                <div key={c.id ?? 'none'}
                                    className={cn('group border-b border-r border-[var(--dc-border)] min-h-[64px] p-1.5 space-y-1.5 transition-colors',
                                        items.length === 0 && 'cursor-pointer hover:bg-[var(--dc-surface2)]', hour === nowHour && items.length === 0 && 'bg-[#FF5A1F]/[0.04]')}
                                    onClick={() => { if (items.length === 0) onAddAt(hour, c.id); }}>
                                    {items.map((r) => (
                                        <button key={r.id} type="button"
                                            onClick={(e) => { e.stopPropagation(); onOpenReservation(r); }}
                                            className="w-full text-left rounded-lg border border-[var(--dc-border)] bg-[var(--dc-surface)] px-2.5 py-2 shadow-sm hover:shadow-md hover:bg-[var(--dc-surface2)] transition-all">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: r.serviceColor || '#FF5A1F' }} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[12px] font-bold text-[var(--dc-ink)] truncate">{r.customerName}</div>
                                                    <div className="text-[10px] text-[var(--dc-muted)] tabular-nums truncate">{r.startTime}-{r.endTime} · {r.service}</div>
                                                </div>
                                            </div>
                                            <span className={cn('mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold', STATUS_BADGE[r.status])}>{STATUS_LABEL[r.status]}</span>
                                        </button>
                                    ))}
                                    {items.length === 0 && (
                                        <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] text-[var(--dc-muted2)] flex items-center gap-1"><Plus className="w-3 h-3" />Ekle</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
