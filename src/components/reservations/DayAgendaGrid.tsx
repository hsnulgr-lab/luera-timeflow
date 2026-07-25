import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import {phaseOf, phaseTimer, type SessionPhase} from '@/lib/sessionPhase';
import type { Reservation, Resource, Staff, WorkingHours } from '@/types';

// ── Seans Takvimi · premium gün görünümü ─────────────────────────────────────
// Tasarım: "Luera Seans Takvimi.html". İlke — ızgara sessiz, detay hover'da.
// Karttaki bilgi en fazla üç satır (saat · isim · hizmet); paket, telefon,
// personel ve faz sayacı hover panelinde; faz ilerletme seçili karttaki
// çubukta. Zaman ekseni DİKEY olduğu için kart genişliği sabit kalır ve kısa
// seanslar da okunur (yatay Gantt'ta bu mümkün değildi).

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const PPH = 96;        // 1 saat = 96px
const AXIS_W = 66;     // sol saat cetveli
const COL_MIN = 212;   // sütun minimum genişliği
const LANE_GAP = 4;    // çakışan randevular arası boşluk

const CARD_SHADOW = '0 1px 2px rgba(14,14,14,.05),0 4px 14px rgba(14,14,14,.06)';
const POP_SHADOW = '0 8px 24px rgba(14,14,14,.12),0 24px 60px rgba(14,14,14,.16)';

const PHASE_META: Record<SessionPhase, { label: string; color: string }> = {
    wait: { label: 'Onay bekliyor', color: 'var(--dc-muted)' },
    arrived: { label: 'Geldi · bekliyor', color: 'var(--dc-amber)' },
    active: { label: 'İşlemde', color: 'var(--dc-orange)' },
    done: { label: 'Bitti · kasada', color: 'var(--dc-green)' },
    completed: { label: 'Tamamlandı', color: 'var(--dc-green)' },
};

const timeToH = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h + (m || 0) / 60;
};
const fmtH = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');

interface Column {
    id: string | null;
    name: string;      // birincil etiket
    sub: string;       // ikincil satır (personel · kod)
    initials: string;
}

interface Placed {
    r: Reservation;
    lane: number;
    lanes: number;
}

// Çakışan randevuları aynı sütunda yan yana şeritlere yerleştirir.
// Kümedeki en yoğun nokta kaç şerit gerektiriyorsa hepsi o genişliği paylaşır —
// böylece kartlar asla üst üste binip kırpılmaz.
function packColumn(items: Reservation[]): Placed[] {
    const sorted = [...items].sort((a, b) => timeToH(a.startTime) - timeToH(b.startTime));
    const out: Placed[] = [];
    let cluster: Reservation[] = [];
    let clusterEnd = -1;

    const flush = () => {
        if (cluster.length === 0) return;
        const laneEnds: number[] = [];
        const placed: Placed[] = cluster.map((r) => {
            const a = timeToH(r.startTime);
            const b = timeToH(r.endTime);
            let lane = laneEnds.findIndex((end) => end <= a + 1e-9);
            if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
            laneEnds[lane] = b;
            return { r, lane, lanes: 1 };
        });
        for (const p of placed) { p.lanes = laneEnds.length; out.push(p); }
        cluster = [];
    };

    for (const r of sorted) {
        const a = timeToH(r.startTime);
        const b = timeToH(r.endTime);
        if (cluster.length > 0 && a < clusterEnd - 1e-9) {
            cluster.push(r);
            clusterEnd = Math.max(clusterEnd, b);
        } else {
            flush();
            cluster = [r];
            clusterEnd = b;
        }
    }
    flush();
    return out;
}

interface DayAgendaGridProps {
    dateStr: string;
    today: string;
    reservations: Reservation[];
    resources: Resource[];
    staff: Staff[];
    resourceTypeLabel: string;
    workingHours: WorkingHours[];
    /** Karttaki ↗ — müşteri kartı / adisyon */
    onOpen: (r: Reservation) => void;
    /** Boş saate tıklama — yeni seans */
    onAddAt: (hour: number, columnId: string | null, groupBy: 'resource' | 'staff') => void;
    /** Faz ilerletme — çubuktaki Geldi / Başladı / Bitti */
}

export function DayAgendaGrid({
    dateStr, today, reservations, resources, staff, resourceTypeLabel,
    workingHours, onOpen, onAddAt,
}: DayAgendaGridProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const [groupBy, setGroupBy] = useState<'resource' | 'staff'>(resources.length > 0 ? 'resource' : 'staff');
    const [staffFilter, setStaffFilter] = useState('');
    const [hover, setHover] = useState<{ r: Reservation; rect: DOMRect } | null>(null);

    // Sayaçlar canlı kalsın (bekliyor 8 dk → 9 dk)
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(t);
    }, []);

    const dayRes = useMemo(
        () => reservations.filter((r) => r.date === dateStr && r.status !== 'cancelled'),
        [reservations, dateStr],
    );

    // Görünür saat aralığı + boş-saat katlama.
    // Bir tek aykırı seans (örn. gece 00:14) tüm günü esnetmesin: mesai dışında
    // kalan 2+ saatlik tamamen boş bloklar ince bir banda katlanır. Sonuç: eksen
    // gerçek işi gösterir, ölü ızgara ekranı yemez.
    const GAP_MIN = 2;      // en az kaç boş saat katlanır
    const GAP_BAND = 46;    // katlanan bandın px yüksekliği
    const { open, close, segs, gridHeight, topPx } = useMemo(() => {
        const weekday = new Date(`${dateStr}T12:00:00`).getDay();
        const wh = workingHours.find((w) => w.day === weekday);
        const o = wh?.start ? timeToH(wh.start) : 9;
        const c = wh?.end ? timeToH(wh.end) : 19;
        let lo = o, hi = c;
        for (const r of dayRes) { lo = Math.min(lo, timeToH(r.startTime)); hi = Math.max(hi, timeToH(r.endTime)); }
        const h0 = Math.max(0, Math.floor(lo) - 1);
        const h1 = Math.min(24, Math.max(h0 + 4, Math.ceil(hi) + 1));

        // Bir saat "dolu" mu: mesai içindeyse ya da bir randevu o saati kesiyorsa
        const busy = (h: number) => {
            if (h >= Math.floor(o) && h < Math.ceil(c)) return true;
            return dayRes.some((r) => timeToH(r.startTime) < h + 1 && timeToH(r.endTime) > h);
        };

        type Seg = { type: 'hours' | 'gap'; from: number; to: number; y: number; h: number };
        const raw: { type: 'hours' | 'gap'; from: number; to: number }[] = [];
        let k = h0;
        while (k < h1) {
            if (busy(k)) { let j = k; while (j < h1 && busy(j)) j++; raw.push({ type: 'hours', from: k, to: j }); k = j; }
            else {
                let j = k; while (j < h1 && !busy(j)) j++;
                raw.push({ type: j - k >= GAP_MIN ? 'gap' : 'hours', from: k, to: j }); k = j;
            }
        }
        // Bitişik 'hours' parçalarını birleştir
        const merged: typeof raw = [];
        for (const s of raw) {
            const last = merged[merged.length - 1];
            if (s.type === 'hours' && last?.type === 'hours' && last.to === s.from) last.to = s.to;
            else merged.push({ ...s });
        }
        let y = 0;
        const segs: Seg[] = merged.map((s) => {
            const h = s.type === 'gap' ? GAP_BAND : (s.to - s.from) * PPH;
            const seg: Seg = { ...s, y, h };
            y += h;
            return seg;
        });
        const topPx = (hf: number): number => {
            for (const s of segs) {
                if (hf >= s.from && hf <= s.to) {
                    return s.type === 'gap' ? s.y + s.h / 2 : s.y + (hf - s.from) * PPH;
                }
            }
            return hf <= h0 ? 0 : y;
        };
        return { open: o, close: c, segs, gridHeight: y, topPx };
    }, [dateStr, workingHours, dayRes]);

    // Yalnız 'hours' parçalarındaki tam saatler — çizgi + etiket bunlara çizilir
    const hourTicks = useMemo(() => {
        const out: number[] = [];
        for (const s of segs) {
            if (s.type !== 'hours') continue;
            for (let h = s.from; h <= s.to; h++) out.push(h);
        }
        return [...new Set(out)];
    }, [segs]);
    const gapSegs = useMemo(() => segs.filter((s) => s.type === 'gap'), [segs]);
    const h0 = segs[0]?.from ?? 9;
    const h1 = segs[segs.length - 1]?.to ?? 19;
    // "Şimdi" katlanan banda düşüyorsa çizgi gösterilmez
    const nowInGap = (hf: number) => gapSegs.some((s) => hf > s.from && hf < s.to);

    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);
    const activeResources = useMemo(
        () => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort),
        [resources],
    );

    // Sütunlar: kaynak (kabin/ünite) veya personel; atanmamış randevu varsa ek sütun
    const columns = useMemo<Column[]>(() => {
        const staffById = new Map(activeStaff.map((s) => [s.id, s]));
        if (groupBy === 'resource' && activeResources.length > 0) {
            const cols: Column[] = activeResources.map((res) => {
                // Kabinde bugün çalışan personel(ler)
                const names = [...new Set(dayRes.filter((r) => r.resourceId === res.id).map((r) => r.staffName).filter(Boolean))] as string[];
                return {
                    id: res.id,
                    name: res.name,
                    sub: names.length > 0 ? names.join(' & ') : res.type || resourceTypeLabel,
                    initials: initialsOf(names[0] || res.name),
                };
            });
            if (dayRes.some((r) => !r.resourceId)) {
                cols.push({ id: null, name: 'Atanmamış', sub: resourceTypeLabel, initials: '—' });
            }
            return cols;
        }
        const cols: Column[] = activeStaff.map((s) => ({
            id: s.id,
            name: s.name,
            sub: s.specialty || s.role || 'Personel',
            initials: initialsOf(s.name),
        }));
        if (dayRes.some((r) => !r.staffId || !staffById.has(r.staffId))) {
            cols.push({ id: null, name: 'Atanmamış', sub: 'Personel atanmadı', initials: '—' });
        }
        return cols;
    }, [groupBy, activeResources, activeStaff, dayRes, resourceTypeLabel]);

    const visibleColumns = useMemo(
        () => (staffFilter ? columns.filter((c) => {
            if (groupBy === 'staff') return c.id === staffFilter;
            return dayRes.some((r) => (r.resourceId || null) === c.id && r.staffId === staffFilter);
        }) : columns),
        [columns, staffFilter, groupBy, dayRes],
    );

    // Sütun başına yerleşim
    const laidOut = useMemo(() => visibleColumns.map((col) => {
        const items = dayRes.filter((r) => {
            const key = groupBy === 'resource' ? (r.resourceId || null) : (r.staffId || null);
            const belongs = key === col.id
                || (col.id === null && groupBy === 'staff' && r.staffId && !activeStaff.some((s) => s.id === r.staffId));
            if (!belongs) return false;
            return !staffFilter || r.staffId === staffFilter;
        });
        return { col, placed: packColumn(items) };
    }), [visibleColumns, dayRes, groupBy, staffFilter, activeStaff]);

    const stats = useMemo(() => ({
        total: dayRes.length,
        active: dayRes.filter((r) => phaseOf(r) === 'active').length,
        waiting: dayRes.filter((r) => phaseOf(r) === 'arrived').length,
    }), [dayRes]);

    const isToday = dateStr === today;
    const nowH = now.getHours() + now.getMinutes() / 60;
    const showNow = isToday && nowH >= h0 && nowH <= h1 && !nowInGap(nowH);



    // Açılışta "şu an"a kaydır
    const scrolledRef = useRef('');
    useEffect(() => {
        if (!scrollRef.current || scrolledRef.current === dateStr) return;
        scrolledRef.current = dateStr;
        const target = isToday ? nowH : open;
        scrollRef.current.scrollTop = Math.max(0, topPx(target) - 260);
    }, [dateStr, isToday, nowH, open, topPx]);

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Sütun ekseni + filtre şeridi */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--dc-border)] flex-wrap flex-shrink-0">
                <div>
                    <div className="text-[13px] font-bold text-[var(--dc-ink)] tracking-[-0.01em]">
                        Saat ekseni · {groupBy === 'resource' ? `${resourceTypeLabel.toLocaleLowerCase('tr')} sütunları` : 'personel sütunları'}
                    </div>
                    <div className="text-[11.5px] text-[var(--dc-muted)] mt-0.5">
                        {stats.total} seans · {stats.active} işlemde · {stats.waiting} bekliyor
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2.5 flex-wrap">
                    {activeResources.length > 0 && (
                        <div className="inline-flex bg-[var(--dc-surface2)] rounded-[10px] p-[3px]">
                            {([['resource', `${resourceTypeLabel}e göre`], ['staff', 'Personele göre']] as const).map(([g, label]) => (
                                <button key={g} type="button" onClick={() => setGroupBy(g)}
                                    className={cn('text-[12px] font-semibold px-3.5 py-[7px] rounded-[7px] transition-all',
                                        groupBy === g ? 'bg-[var(--dc-card)] text-[var(--dc-ink)] shadow-[0_1px_2px_rgba(14,14,14,.06)]' : 'text-[var(--dc-muted)] hover:text-[var(--dc-ink)]')}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}
                        aria-label="Personel filtresi"
                        className="appearance-none bg-transparent border border-[var(--dc-border)] rounded-[10px] pl-3.5 pr-8 py-[9px] text-[12.5px] font-semibold text-[var(--dc-ink70)] outline-none hover:border-[var(--dc-muted2)] transition-colors">
                        <option value="">Tüm personel</option>
                        {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Izgara */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto relative">
                {/* Sticky sütun başlıkları */}
                <div className="sticky top-0 z-[12] flex bg-[var(--dc-surface)] w-max min-w-full">
                    <div className="flex-shrink-0 sticky left-0 z-[13] bg-[var(--dc-surface)]" style={{ width: AXIS_W }} />
                    {laidOut.map(({ col }, i) => (
                        <div key={col.id ?? `none-${i}`}
                            className="flex-1 flex items-center gap-2.5 px-[18px] pt-[15px] pb-[13px] border-b border-[var(--dc-border-soft)]"
                            style={{ minWidth: COL_MIN, boxShadow: i > 0 ? 'inset 1px 0 0 var(--dc-hair2)' : undefined }}>
                            <span className="w-6 h-6 rounded-full bg-[var(--dc-surface2)] grid place-items-center text-[10.5px] font-semibold text-[var(--dc-muted)] flex-shrink-0">{col.initials}</span>
                            <div className="min-w-0">
                                <div className="text-[13px] font-bold text-[var(--dc-ink)] tracking-[-0.01em] leading-[1.1] truncate">{col.name}</div>
                                <div className="text-[10px] text-[var(--dc-muted2)] mt-0.5 tracking-[.06em] truncate" style={{ fontFamily: MONO }}>{col.sub}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Zaman ızgarası */}
                <div ref={gridRef} className="relative flex w-max min-w-full">
                    {/* Sol saat cetveli */}
                    <div className="flex-shrink-0 sticky left-0 z-[8] bg-[var(--dc-surface)]" style={{ width: AXIS_W, height: gridHeight }}>
                        {hourTicks.map((h) => (
                            <span key={h} className="absolute right-3 text-[11px] font-medium text-[var(--dc-muted2)] -translate-y-1.5"
                                style={{ top: topPx(h), fontFamily: MONO }}>{fmtH(h)}</span>
                        ))}
                        {gapSegs.map((s) => (
                            <span key={`gl-${s.from}`} className="absolute right-3 text-[9px] font-medium text-[var(--dc-muted2)] -translate-y-1/2"
                                style={{ top: s.y + s.h / 2, fontFamily: MONO }}>{s.to - s.from}s</span>
                        ))}
                        {showNow && (
                            <span className="absolute right-2 z-[16] bg-[var(--dc-orange)] text-white text-[10px] font-semibold px-[7px] py-0.5 rounded-full -translate-y-1/2 pointer-events-none"
                                style={{ top: topPx(nowH), fontFamily: MONO }}>{fmtH(nowH)}</span>
                        )}
                    </div>

                    {laidOut.map(({ col, placed }, ci) => (
                        <div key={col.id ?? `none-${ci}`} className="flex-1 relative"
                            style={{ minWidth: COL_MIN, height: gridHeight, boxShadow: ci > 0 ? 'inset 1px 0 0 var(--dc-hair2)' : undefined }}>
                            {/* Mesai dışı — desen değil, çok hafif zemin */}
                            {open > h0 && <div className="absolute left-0 right-0 pointer-events-none" style={{ top: 0, height: topPx(open), background: 'var(--dc-offhrs)' }} />}
                            {close < h1 && <div className="absolute left-0 right-0 pointer-events-none" style={{ top: topPx(close), height: gridHeight - topPx(close), background: 'var(--dc-offhrs)' }} />}
                            {/* Katlanan boş saat bandı — kesikli çizgiyle "burada zaman atlandı" */}
                            {gapSegs.map((s) => (
                                <div key={`gb-${s.from}`} className="absolute left-0 right-0 pointer-events-none flex items-center justify-center"
                                    style={{ top: s.y, height: s.h, background: 'var(--dc-offhrs)', borderTop: '1px dashed var(--dc-border)', borderBottom: '1px dashed var(--dc-border)' }}>
                                    {ci === 0 && <span className="text-[9.5px] font-medium text-[var(--dc-muted2)] tracking-[.04em]" style={{ fontFamily: MONO }}>{fmtH(s.from)} – {fmtH(s.to)} · boş</span>}
                                </div>
                            ))}
                            {/* Yalnız tam saat çizgileri (katlanan aralıklar atlanır) */}
                            {hourTicks.map((h) => (
                                <div key={h} className="absolute left-0 right-0 border-t border-[var(--dc-border-soft)] pointer-events-none" style={{ top: topPx(h) }} />
                            ))}

                            <div className="absolute top-0 bottom-0 left-1.5 right-1.5">
                                {/* Boş saat yakalayıcıları */}
                                {Array.from({ length: Math.max(0, Math.ceil(close) - Math.floor(open)) }, (_, i) => Math.floor(open) + i).map((h) => (
                                    <button key={h} type="button" onClick={() => onAddAt(h, col.id, groupBy)}
                                        aria-label={`${col.name} · ${fmtH(h)} için yeni seans`}
                                        className="absolute left-0 right-0 rounded-[11px] border border-transparent grid place-items-center text-transparent hover:border-[rgba(255,90,31,.5)] hover:bg-[rgba(255,90,31,.045)] hover:text-[var(--dc-orange)] transition-all"
                                        style={{ top: topPx(h) + 3, height: PPH - 6 }}>
                                        <span className="text-[18px] font-normal leading-none">+</span>
                                    </button>
                                ))}

                                {/* Randevu kartları */}
                                {placed.map(({ r, lane, lanes }) => {
                                    const a = timeToH(r.startTime);
                                    const b = timeToH(r.endTime);
                                    const durMin = Math.round((b - a) * 60);
                                    const ph = phaseOf(r);
                                    const svc = r.serviceColor || 'var(--dc-orange)';
                                    const railW = ph === 'active' ? 4 : 3;
                                    const railColor = ph === 'arrived' ? 'var(--dc-amber)' : ph === 'active' ? 'var(--dc-orange)' : svc;
                                    const tier = durMin <= 15 ? 'micro' : durMin <= 30 ? 'short' : 'full';
                                    const width = `calc((100% - ${(lanes - 1) * LANE_GAP}px) / ${lanes})`;
                                    const left = `calc((100% - ${(lanes - 1) * LANE_GAP}px) / ${lanes} * ${lane} + ${LANE_GAP * lane}px)`;
                                    return (
                                        <div key={r.id} data-res-id={r.id} role="button" tabIndex={0}
                                            onClick={() => { setHover(null); onOpen(r); }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { setHover(null); onOpen(r); } }}
                                            onMouseEnter={(e) => setHover({ r, rect: e.currentTarget.getBoundingClientRect() })}
                                            onMouseLeave={() => setHover(null)}
                                            className={cn('group/appt absolute rounded-xl bg-[var(--dc-card)] overflow-hidden cursor-pointer flex flex-col justify-center transition-all hover:-translate-y-px hover:z-20',
                                                tier === 'micro' ? 'px-3 gap-0' : tier === 'short' ? 'px-3 py-[5px] gap-px' : 'px-[13px] py-[11px] gap-[3px]',
                                                ph === 'completed' && 'opacity-55 hover:opacity-90')}
                                            style={{
                                                top: topPx(a) + 3, height: (b - a) * PPH - 6, left, width,
                                                boxShadow: ph === 'completed' ? '0 1px 2px rgba(14,14,14,.04)' : CARD_SHADOW,
                                            }}>
                                            {/* Izgaradaki tek renk kaynağı: sol şerit */}
                                            <span className="absolute left-0 top-0 bottom-0 transition-all" style={{ width: railW, background: railColor }} />
                                            {tier !== 'micro' && (
                                                <span className="text-[11px] font-medium text-[var(--dc-muted)] leading-none tracking-[.01em]" style={{ fontFamily: MONO }}>
                                                    {tier === 'short' ? r.startTime : `${r.startTime}–${r.endTime}`}
                                                </span>
                                            )}
                                            <span className={cn('font-bold text-[var(--dc-ink)] tracking-[-0.015em] truncate',
                                                tier === 'micro' ? 'text-[13px] leading-none' : 'text-[15px] leading-[1.15]',
                                                ph === 'completed' && 'font-medium')}>{r.customerName}</span>
                                            {tier === 'full' && (
                                                <span className="text-[12px] font-medium text-[var(--dc-muted)] leading-[1.15] truncate">{r.service}</span>
                                            )}

                                            {/* Hover köşe aksiyonları */}
                                            <div className="absolute top-[7px] right-[7px] flex gap-0.5 opacity-0 group-hover/appt:opacity-100 transition-opacity">
                                                <button type="button" title="Müşteri kartı" aria-label={`${r.customerName} · müşteri kartı`}
                                                    onClick={(e) => { e.stopPropagation(); setHover(null); onOpen(r); }}
                                                    className="w-[22px] h-[22px] rounded-md grid place-items-center text-[var(--dc-muted)] bg-[var(--dc-surface)]/70 backdrop-blur-[2px] hover:bg-[var(--dc-surface2)] hover:text-[var(--dc-ink)] transition-colors">
                                                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M7 5h8v8M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                </button>
                                            </div>
                                            {/* Süre tutamağı (görsel) */}
                                            {tier === 'full' && (
                                                <span className="absolute left-0 right-0 bottom-0.5 h-2 flex items-center justify-center opacity-0 group-hover/appt:opacity-50 transition-opacity pointer-events-none">
                                                    <i className="w-[22px] h-[3px] rounded-[3px] bg-[var(--dc-muted2)]" />
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Şu an çizgisi — ızgaradaki tek turuncu öğe */}
                    {showNow && (
                        <div className="absolute z-[15] pointer-events-none" style={{ top: topPx(nowH), left: AXIS_W, right: 0, borderTop: '1.5px solid var(--dc-orange)' }}>
                            <span className="absolute -left-[3px] -top-[3.5px] w-2 h-2 rounded-full bg-[var(--dc-orange)]" />
                        </div>
                    )}
                </div>

                {laidOut.length === 0 && (
                    <div className="py-16 text-center text-[13px] text-[var(--dc-muted)]">Gösterilecek sütun yok — Ayarlar'dan {resourceTypeLabel.toLocaleLowerCase('tr')} veya personel ekleyin.</div>
                )}
            </div>

            {/* Hover paneli — detayın yaşadığı yer */}
            {hover && (() => {
                const r = hover.r;
                const ph = phaseOf(r);
                const meta = PHASE_META[ph];
                const timer = phaseTimer(r, now);
                const durMin = Math.round((timeToH(r.endTime) - timeToH(r.startTime)) * 60);
                const colName = groupBy === 'resource'
                    ? (resources.find((x) => x.id === r.resourceId)?.name || 'Atanmamış')
                    : (r.staffName || 'Atanmamış');
                const pkg = String(r.customFields?.paket_seans || '');
                const [pkgDone, pkgTotal] = pkg.includes('/') ? pkg.split('/').map(Number) : [0, 0];
                const W = 264;
                const H = pkgTotal > 0 ? 260 : 196;
                let x = hover.rect.right + 12;
                if (x + W > window.innerWidth - 12) x = hover.rect.left - W - 12;
                let y = hover.rect.top;
                if (y + H > window.innerHeight - 12) y = window.innerHeight - H - 12;
                if (y < 12) y = 12;
                return (
                    <div className="fixed z-[200] rounded-[15px] bg-[var(--dc-card)] px-[17px] py-4 pointer-events-none"
                        style={{ left: x, top: y, width: W, boxShadow: POP_SHADOW }}>
                        <div className="flex items-start gap-2.5">
                            <span className="w-[3px] self-stretch rounded-[3px] flex-shrink-0" style={{ background: r.serviceColor || 'var(--dc-orange)' }} />
                            <div className="min-w-0">
                                <div className="text-[16px] font-bold text-[var(--dc-ink)] tracking-[-0.02em] truncate">{r.customerName}</div>
                                <div className="text-[12.5px] font-medium text-[var(--dc-muted)] mt-0.5 truncate">{r.service}</div>
                                <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold mt-2" style={{ color: meta.color }}>
                                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: meta.color }} />
                                    {timer || meta.label}
                                </div>
                            </div>
                        </div>
                        <div className="mt-[13px] flex flex-col gap-2">
                            <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--dc-ink70)]">
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-[var(--dc-muted2)] flex-shrink-0"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" /><path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                <span style={{ fontFamily: MONO, fontSize: 11.5 }}>{r.startTime}–{r.endTime}</span> · {durMin} dk
                            </div>
                            <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--dc-ink70)] min-w-0">
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-[var(--dc-muted2)] flex-shrink-0"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M4.5 16c.7-2.6 2.9-4 5.5-4s4.8 1.4 5.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                <span className="truncate">{[r.staffName, colName].filter(Boolean).join(' · ')}</span>
                            </div>
                            {r.customerPhone && (
                                <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--dc-ink70)]">
                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-[var(--dc-muted2)] flex-shrink-0"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H7l1 3-1.4 1a9 9 0 0 0 4.4 4.4L12 11l3 1v1.5c0 .8-.7 1.5-1.5 1.5C8.6 15 4 10.4 4 5.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                                    <span style={{ fontFamily: MONO, fontSize: 11.5 }}>{r.customerPhone}</span>
                                </div>
                            )}
                        </div>
                        {pkgTotal > 0 && (
                            <div className="mt-3.5 pt-[13px] border-t border-[var(--dc-border-soft)]">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--dc-muted)] mb-[7px]">
                                    <span>Paket ilerlemesi</span>
                                    <span className="text-[var(--dc-ink)]" style={{ fontFamily: MONO, fontSize: 11.5 }}>{pkgDone}/{pkgTotal} seans</span>
                                </div>
                                <div className="h-[5px] rounded-full bg-[var(--dc-surface2)] overflow-hidden">
                                    <span className="block h-full rounded-full" style={{ width: `${Math.round((pkgDone / pkgTotal) * 100)}%`, background: r.serviceColor || 'var(--dc-orange)' }} />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

        </div>
    );
}
