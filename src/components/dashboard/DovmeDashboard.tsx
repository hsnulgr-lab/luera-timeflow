import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, Clock, MessageCircle, Phone, Plus } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { formatDateEU, todayISO, toISODate } from '@/utils/date';
import { LueraButton } from '@/components/ui/LueraButton';
import { MONO, ProgressBar, Sparkline, StatCard } from '@/components/dashboard/kpi';
import type { Reservation } from '@/types';

const MONTHS_SHORT = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];

function stageOf(r: Reservation): 'request' | 'design' | 'approval' | 'approved' | 'done' | 'cancelled' {
    if (r.status === 'cancelled') return 'cancelled';
    if (r.status === 'completed') return 'done';
    const stage = String(r.customFields?.asama || '');
    if (stage === 'Talep Alındı') return 'request';
    if (stage === 'Tasarım Bekliyor') return 'design';
    if (stage === 'Onay Bekliyor') return 'approval';
    if (stage === 'Onaylandı') return 'approved';
    return r.status === 'pending' ? 'request' : 'approved';
}

function stageMeta(r: Reservation): { label: string; fg: string; bg: string } {
    const stage = stageOf(r);
    if (stage === 'cancelled') return { label: 'İptal', fg: 'var(--dc-muted)', bg: 'var(--dc-surface2)' };
    if (stage === 'done') return { label: 'Tamamlandı', fg: 'var(--dc-green)', bg: 'var(--dc-green-bg)' };
    if (stage === 'request') return { label: 'Talep Alındı', fg: 'var(--dc-blue)', bg: 'var(--dc-blue-bg)' };
    if (stage === 'design') return { label: 'Tasarım Bekliyor', fg: 'var(--dc-amber)', bg: 'var(--dc-amber-bg)' };
    if (stage === 'approval') return { label: 'Onay Bekliyor', fg: 'var(--dc-purple)', bg: 'var(--dc-purple-bg)' };
    return { label: 'Onaylandı', fg: 'var(--dc-orange)', bg: 'var(--dc-orange-soft)' };
}

function depositMeta(r: Reservation): { label: string; fg: string; bg: string } | null {
    const status = String(r.customFields?.kapora_durumu || '');
    const amount = Number(r.customFields?.kapora_tutari || 0);
    if (!status) return null;
    const amountLabel = amount > 0 ? ` · ${amount.toLocaleString('tr-TR')}₺` : '';
    if (status === 'Tam Alındı') return { label: `Kapora alındı${amountLabel}`, fg: 'var(--dc-green)', bg: 'var(--dc-green-bg)' };
    if (status === 'Kısmi Alındı') return { label: `Kısmi kapora${amountLabel}`, fg: 'var(--dc-amber)', bg: 'var(--dc-amber-bg)' };
    return { label: 'Kapora bekliyor', fg: 'var(--dc-orange)', bg: 'var(--dc-orange-soft)' };
}

function waLink(phone: string): string {
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) normalized = `90${normalized.slice(1)}`;
    else if (!normalized.startsWith('90')) normalized = `90${normalized}`;
    return `https://wa.me/${normalized}`;
}

export function DovmeDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, getReservationsByDate } = useReservations();
    const today = todayISO();
    const now = useMemo(() => new Date(), []);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const [selectedDate, setSelectedDate] = useState(today);

    const active = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    const openWork = useMemo(() => active.filter((r) => r.status !== 'completed'), [active]);
    const todayList = useMemo(
        () => [...getReservationsByDate(today)].filter((r) => r.status !== 'cancelled').sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, today],
    );
    const selectedReservations = useMemo(
        () => [...getReservationsByDate(selectedDate)].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, selectedDate],
    );

    const stats = useMemo(() => {
        const design = openWork.filter((r) => stageOf(r) === 'design').length;
        const approval = openWork.filter((r) => stageOf(r) === 'approval').length;
        const depositWaiting = openWork.filter((r) => r.customFields?.kapora_durumu === 'Alınmadı').length;
        const deposit = active.reduce((sum, r) => {
            const status = r.customFields?.kapora_durumu;
            return status === 'Tam Alındı' || status === 'Kısmi Alındı'
                ? sum + Number(r.customFields?.kapora_tutari || 0)
                : sum;
        }, 0);
        const upcoming = openWork.filter((r) => r.date > today).length;
        return { design, approval, depositWaiting, deposit, upcoming };
    }, [active, openWork, today]);

    const cardData = useMemo(() => {
        const last7 = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(now);
            date.setDate(now.getDate() - (6 - index));
            const iso = toISODate(date);
            return active.filter((r) => r.date === iso).length;
        });
        const stageTotal = Math.max(1, stats.design + stats.approval);
        const designShare = Math.round((stats.design / stageTotal) * 100);
        const approvalShare = Math.round((stats.approval / stageTotal) * 100);
        return { last7, designShare, approvalShare };
    }, [active, now, stats.approval, stats.design]);

    const weekDays = useMemo(() => {
        const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        const start = new Date(now);
        start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        return labels.map((label, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const dateStr = toISODate(date);
            return {
                label,
                num: date.getDate(),
                dateStr,
                hasEvent: reservations.some((r) => r.date === dateStr && r.status !== 'cancelled'),
            };
        });
    }, [now, reservations]);

    const upcoming = useMemo(() => openWork
        .filter((r) => r.date > today)
        .sort((a, b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date))
        .slice(0, 4), [openWork, today]);

    const weekSummary = useMemo(() => {
        const start = weekDays[0]?.dateStr || today;
        const end = weekDays[6]?.dateStr || today;
        const week = reservations.filter((r) => r.date >= start && r.date <= end);
        return {
            completed: week.filter((r) => r.status === 'completed').length,
            design: week.filter((r) => stageOf(r) === 'design').length,
            approval: week.filter((r) => stageOf(r) === 'approval').length,
        };
    }, [reservations, today, weekDays]);

    const firstTime = todayList.find((r) => r.endTime >= nowTime)?.startTime || todayList[0]?.startTime;
    const dayNum = now.getDate();
    const monthShort = MONTHS_SHORT[now.getMonth()];
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const monthYear = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    const selectedIsToday = selectedDate === today;
    const selectedDay = weekDays.find((day) => day.dateStr === selectedDate);
    const selectedLabel = selectedDay ? `${selectedDay.num} ${monthShort.charAt(0)}${monthShort.slice(1).toLowerCase()}` : '';
    const openCustomer = (r: Reservation) => r.customerId ? navigate(`/customers?open=${r.customerId}`) : navigate('/reservations');

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto space-y-6">

                    {/* Hero — genel TimeFlow dashboard ile aynı tasarım dili */}
                    <section className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06),0_4px_16px_rgba(14,14,14,0.05)]">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 p-6 sm:px-7">
                            <div className={cn('flex-shrink-0 w-[72px] h-[72px] rounded-[14px] bg-[var(--dc-inkbox)] flex flex-col items-center justify-center', dark && 'shadow-[0_0_0_1.5px_rgba(255,90,31,0.75),0_0_8px_rgba(255,90,31,0.18)]')}>
                                <span className="text-[28px] font-black text-[var(--dc-inkbox-fg)] leading-none tracking-[-0.03em]">{dayNum}</span>
                                <span className="text-[9px] font-bold text-[var(--dc-onbox-70)] tracking-[0.16em] uppercase mt-0.5">{monthShort}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10.5px] font-semibold text-[var(--dc-orange)] uppercase tracking-[0.12em] mb-1.5">{weekday} · {monthYear}</p>
                                <h1 className="text-[22px] font-extrabold text-[var(--dc-ink)] tracking-[-0.03em] leading-tight truncate">{settings.businessName || 'Dövme Stüdyosu'}</h1>
                                <p className="text-[13.5px] text-[var(--dc-muted)] mt-1">
                                    {todayList.length > 0 ? <>
                                        Bugün <span className="font-bold text-[var(--dc-ink)]">{todayList.length} seansın</span> var
                                        {firstTime && <> · ilki <span className="font-bold text-[var(--dc-orange-d)]">{firstTime}</span>'de</>}
                                        {stats.approval > 0 && <> · {stats.approval} onay bekliyor</>}
                                    </> : <>Bugün için planlanmış seans yok</>}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <LueraButton onClick={() => navigate('/calendar')} variant={dark ? 'ghost-dark' : 'ghost'} size="md">Takvimi Gör</LueraButton>
                                <LueraButton onClick={() => navigate('/calendar?new=1')} variant="ink" size="md"><Plus className="w-[15px] h-[15px]" />Yeni Seans</LueraButton>
                            </div>
                        </div>
                    </section>

                    {/* Dövme stüdyosuna özel KPI'lar */}
                    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatCard label="Bugün" value={todayList.length} sublabel="Seans" compareLabel="Yaklaşan" compareValue={stats.upcoming} trend={{ kind: 'neutral', text: 'program' }} onClick={() => navigate('/calendar')}>
                            <Sparkline data={cardData.last7} />
                        </StatCard>
                        <StatCard label="Tasarım" value={stats.design} sublabel="Tasarım bekliyor" compareLabel="Açık iş" compareValue={stats.design + stats.approval} trend={stats.design ? { kind: 'warn', text: 'işlem gerekli' } : { kind: 'neutral', text: '✓ temiz' }} urgent={stats.design > 0} onClick={() => navigate('/reservations')}>
                            <ProgressBar label="Açık iş dağılımı" pct={cardData.designShare} urgent={stats.design > 0} />
                        </StatCard>
                        <StatCard label="Onay" value={stats.approval} sublabel="Müşteri onayı" compareLabel="Açık iş" compareValue={stats.design + stats.approval} trend={stats.approval ? { kind: 'warn', text: 'yanıt bekliyor' } : { kind: 'neutral', text: '✓ temiz' }} onClick={() => navigate('/reservations')}>
                            <ProgressBar label="Açık iş dağılımı" pct={cardData.approvalShare} urgent={stats.approval > 0} />
                        </StatCard>
                        <StatCard label="Kapora" value={`${stats.deposit.toLocaleString('tr-TR')}₺`} sublabel="Alınan kapora" compareLabel="Bekleyen" compareValue={stats.depositWaiting} trend={stats.depositWaiting ? { kind: 'warn', text: 'tahsilat var' } : { kind: 'neutral', text: '✓ temiz' }} onClick={() => navigate('/kasa')}>
                            <div className="mt-[5px] text-[10px]" style={{ fontFamily: MONO, color: 'var(--dc-muted)' }}>Kayıtlı seans kaporaları</div>
                        </StatCard>
                    </section>

                    <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        {/* Program */}
                        <div className="lg:col-span-3 relative overflow-hidden rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)]">
                            <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center"><Clock className="w-4 h-4 text-[var(--dc-inkbox-fg)]" /></div>
                                    <div>
                                        <h2 className="text-base font-bold text-[var(--dc-ink)]">{selectedIsToday ? 'Bugünün Programı' : `${selectedLabel} Programı`}</h2>
                                        <p className="text-[11px] text-[var(--dc-muted)]">{selectedReservations.filter((r) => r.status !== 'cancelled').length} seans planlandı</p>
                                    </div>
                                </div>
                                <button onClick={() => navigate('/calendar')} className="text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1">Tümünü Gör <ArrowRight className="w-3 h-3" /></button>
                            </div>

                            <div className="flex gap-[3px] px-4 py-3 border-b border-[var(--dc-border)] overflow-x-auto">
                                {weekDays.map((day) => {
                                    const selected = selectedDate === day.dateStr;
                                    return (
                                        <button key={day.dateStr} onClick={() => setSelectedDate(day.dateStr)} aria-pressed={selected} className={cn('flex-1 min-w-[38px] flex flex-col items-center gap-1 py-2 px-1 rounded-[10px] transition-all', selected ? cn('bg-[var(--dc-inkbox)] -translate-y-px', dark ? 'shadow-[0_0_0_1.5px_rgba(255,90,31,0.75),0_0_8px_rgba(255,90,31,0.15)]' : 'shadow-[0_3px_10px_rgba(14,14,14,0.15)]') : 'hover:bg-[var(--dc-surface2)]')}>
                                            <span className={cn('text-[9px] font-bold uppercase tracking-[0.08em]', selected ? 'text-[var(--dc-onbox-50)]' : 'text-[var(--dc-muted)]')}>{day.label}</span>
                                            <span className={cn('text-[14px] font-extrabold leading-none', selected ? 'text-[var(--dc-inkbox-fg)]' : 'text-[var(--dc-ink)]')}>{day.num}</span>
                                            <span className={cn('w-1 h-1 rounded-full', day.hasEvent ? (selected ? 'bg-[var(--dc-onbox-60)]' : 'bg-[var(--dc-orange)]') : 'bg-transparent')} />
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="p-4">
                                {selectedReservations.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <div className="w-14 h-14 rounded-2xl bg-[var(--dc-surface3)] border border-[var(--dc-border2)] flex items-center justify-center mb-3"><Calendar className="w-6 h-6 text-[var(--dc-muted)]" /></div>
                                        <p className="text-sm font-semibold text-[var(--dc-ink)]">Bu gün için seans yok</p>
                                        <LueraButton onClick={() => navigate('/calendar?new=1')} variant="accent" size="sm" className="mt-3" style={{ color: 'var(--dc-cream)' }}>+ Seans oluştur</LueraButton>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {selectedReservations.map((r) => {
                                            const meta = stageMeta(r);
                                            const deposit = depositMeta(r);
                                            const style = r.customFields?.tarz ? String(r.customFields.tarz) : '';
                                            const region = r.customFields?.bolge ? String(r.customFields.bolge) : '';
                                            return (
                                                <div key={r.id} onClick={() => openCustomer(r)} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--dc-border-soft)] hover:border-[var(--dc-orange)] hover:shadow-sm transition-all group cursor-pointer">
                                                    <div className="text-center min-w-[48px]"><p className="text-sm font-extrabold text-[var(--dc-ink)] tabular-nums">{r.startTime}</p><p className="text-[10px] text-[var(--dc-muted)] tabular-nums">{r.endTime}</p></div>
                                                    <div className="w-1 h-11 rounded-full flex-shrink-0" style={{ backgroundColor: r.serviceColor || 'var(--dc-orange)' }} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-[var(--dc-ink)] truncate">{r.customerName}</p>
                                                        <p className="text-xs text-[var(--dc-muted)] truncate">{[r.staffName, style, region].filter(Boolean).join(' · ') || r.service}</p>
                                                        {deposit && <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ color: deposit.fg, background: deposit.bg }}>{deposit.label}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        {r.customerPhone && <>
                                                            <a href={waLink(r.customerPhone)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`${r.customerName} müşterisine WhatsApp'tan yaz`} className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 dark:text-emerald-300 flex items-center justify-center transition-all hover:scale-105"><MessageCircle className="w-4 h-4" /></a>
                                                            <a href={`tel:${r.customerPhone.replace(/\s+/g, '')}`} onClick={(e) => e.stopPropagation()} aria-label={`${r.customerName} müşterisini ara`} className="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:hover:bg-blue-500/25 dark:text-blue-300 flex items-center justify-center transition-all hover:scale-105"><Phone className="w-4 h-4" /></a>
                                                        </>}
                                                        <span className="hidden sm:inline px-2 py-1 rounded-lg text-[10px] font-bold" style={{ color: meta.fg, background: meta.bg }}>{meta.label}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sağ panel */}
                        <div className="lg:col-span-2 flex flex-col gap-4">
                            <div className="flex-1 relative overflow-hidden rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)]">
                                <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border)] flex items-center justify-center"><Calendar className="w-4 h-4 text-[var(--dc-ink)]" /></div>
                                    <div><h2 className="text-base font-bold text-[var(--dc-ink)]">Yaklaşan</h2><p className="text-[11px] text-[var(--dc-muted)]">{upcoming.length} seans</p></div>
                                </div>
                                <div className="p-3 space-y-2">
                                    {upcoming.length === 0 ? <div className="text-center py-8"><p className="text-sm text-[var(--dc-muted)]">Yaklaşan seans yok</p></div> : upcoming.map((r) => (
                                        <div key={r.id} onClick={() => openCustomer(r)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border-soft)] hover:bg-[var(--dc-orange-soft)] hover:border-[var(--dc-orange)] transition-all cursor-pointer">
                                            <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: r.serviceColor || 'var(--dc-orange)' }} />
                                            <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[var(--dc-ink)] truncate">{r.customerName}</p><p className="text-[11px] text-[var(--dc-muted)] truncate">{formatDateEU(r.date)} · {r.staffName || r.service}</p></div>
                                            <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[var(--dc-orange-soft)] text-[var(--dc-orange-d)] flex-shrink-0 tabular-nums">{r.startTime}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
                                <div className="px-5 pt-4 pb-3"><h2 className="text-[13.5px] font-bold text-[var(--dc-ink)]">Stüdyo Özeti</h2><p className="text-[11px] text-[var(--dc-muted)] mt-0.5">Bu hafta</p></div>
                                <div className="grid grid-cols-3 border-t border-[var(--dc-border)]">
                                    <div className="text-center py-3.5 px-2 border-r border-[var(--dc-border)]"><p className="text-[20px] font-black text-[var(--dc-green)] tracking-[-0.04em]">{weekSummary.completed}</p><p className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--dc-green)] mt-0.5">Tamamlandı</p></div>
                                    <div className="text-center py-3.5 px-2 border-r border-[var(--dc-border)]"><p className="text-[20px] font-black text-[var(--dc-amber)] tracking-[-0.04em]">{weekSummary.design}</p><p className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--dc-amber)] mt-0.5">Tasarım</p></div>
                                    <div className="text-center py-3.5 px-2"><p className="text-[20px] font-black text-[var(--dc-purple)] tracking-[-0.04em]">{weekSummary.approval}</p><p className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--dc-purple)] mt-0.5">Onay</p></div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
