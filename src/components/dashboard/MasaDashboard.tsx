import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Armchair, ArrowRight, Clock, Plus, Users, Calendar } from 'lucide-react';
import { useTables } from '@/hooks/useTables';
import { useTableReservations, useUpcomingTableReservations } from '@/hooks/useTableReservations';
import { useQueue } from '@/hooks/useQueue';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, toISODate, relativeDayLabel } from '@/utils/date';
import { adisyonTotal, seatedMinutes, elapsedLabel, LONG_SIT_MIN } from '@/utils/masaAdisyon';
import { LueraButton } from '@/components/ui/LueraButton';
import { MONO, compareTrend, Sparkline, ProgressBar, StatCard } from '@/components/dashboard/kpi';
import type { TableReservation } from '@/types';

function waitMinutes(joinedAt: string): number {
    return Math.max(0, Math.round((Date.now() - new Date(joinedAt).getTime()) / 60000));
}

const MONTHS_SHORT = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
const fmt = (n: number) => n.toLocaleString('tr-TR');

// MasaPage.statusOf ile aynı öncelik (seated → dolu, reserved → rezerve).
type TableStatus = 'bos' | 'rezerve' | 'dolu';
function statusOf(rs: TableReservation[]): TableStatus {
    if (rs.some((r) => r.status === 'seated')) return 'dolu';
    if (rs.some((r) => r.status === 'reserved')) return 'rezerve';
    return 'bos';
}

const RES_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
    seated:    { label: 'Oturdu',     bg: 'rgba(255,90,31,0.12)', fg: 'var(--dc-orange)' },
    reserved:  { label: 'Rezerve',    bg: 'var(--dc-blue-bg)',    fg: 'var(--dc-blue)' },
    completed: { label: 'Tamamlandı', bg: 'var(--dc-green-bg)',   fg: 'var(--dc-green)' },
    // Garson "Kasaya Gönder" ile completed'a geçmiş ama ödeme henüz alınmamış (isPaid=false — 049)
    unpaid:    { label: 'Ödenmedi',   bg: 'var(--dc-amber-bg)',   fg: 'var(--dc-amber)' },
};

// ── Restoran dashboard'u — randevu dashboard'unun zengin iskeletinde, masa
// verisiyle. Masa açık → DashboardPage bunu render eder. Bugünün Programı
// (haftalık gün şeridi), sparkline'lı KPI'lar, Yaklaşan ve Salon Özeti hepsi
// randevu ekranıyla aynı görsel dilde. ──
export function MasaDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const today = todayISO();
    const { tables, isLoading: tablesLoading } = useTables();
    const { waiting: waitlist } = useQueue();
    const { reservations: upcoming } = useUpcomingTableReservations();
    const { settings } = useReservations();
    const { stats, payments } = usePayments();
    const { staff } = useStaff();

    // now dakikada bir tazelenir (⏱ oturma süresi + tarih metinleri bayatlamasın)
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
    const todayStr = toISODate(now);

    const dayNum = now.getDate();
    const monthShort = MONTHS_SHORT[now.getMonth()];
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const monthYear = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

    // Hayalet koruması: silinmiş masaya bağlı rezervasyonları ele
    const validUpcoming = useMemo(() => upcoming.filter((r) => tables.some((t) => t.id === r.tableId)), [upcoming, tables]);
    const todayRes = useMemo(() => validUpcoming.filter((r) => r.date === today), [validUpcoming, today]);
    const futureRes = useMemo(() => validUpcoming.filter((r) => r.date > today), [validUpcoming, today]);

    // Bugünkü salon durumu (dolu/rezerve/boş, doluluk) + masa krokisi için masa→rezervasyon haritası
    const { dolu, rezerve, bos, doluluk, byTableToday } = useMemo(() => {
        const byTable = new Map<string, TableReservation[]>();
        for (const r of todayRes) (byTable.get(r.tableId) || byTable.set(r.tableId, []).get(r.tableId)!).push(r);
        const dolu = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'dolu').length;
        const rezerve = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'rezerve').length;
        return { dolu, rezerve, bos: tables.length - dolu - rezerve, doluluk: tables.length > 0 ? Math.round((dolu / tables.length) * 100) : 0, byTableToday: byTable };
    }, [todayRes, tables]);

    // Masa krokisi bölgelere göre gruplu (Salon/Teras/Bar) — Masalar kartı
    const zoneGroups = useMemo(() => {
        const order = Array.from(new Set(tables.map((t) => t.zone || 'Salon')));
        return order.map((zone) => ({ zone, items: tables.filter((t) => (t.zone || 'Salon') === zone) }));
    }, [tables]);

    // Bu haftanın günlük rezervasyon dağılımı (Pzt→Paz) — Bugün kartının sparkline'ı.
    // Yalnız bugün + ileri günler elde var; geçmiş günler 0 (randevu sparkline'ı da 0'ı ince çizgi gösterir).
    const { thisWeekDaily, todayIdx, weekDays } = useMemo(() => {
        const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday); d.setDate(monday.getDate() + i);
            const ds = toISODate(d);
            const count = validUpcoming.filter((r) => r.date === ds).length;
            return { label: labels[i], num: d.getDate(), dateStr: ds, isToday: ds === todayStr, hasEvent: count > 0, count };
        });
        return { thisWeekDaily: days.map((d) => d.count), todayIdx: (now.getDay() + 6) % 7, weekDays: days };
    }, [validUpcoming, now, todayStr]);

    // Son 7 günün günlük cirosu (ödemelerden) — Ciro kartının sparkline'ı + dün kıyası
    const { revLast7, revYesterday } = useMemo(() => {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const buckets = Array(7).fill(0);
        for (const p of payments) {
            const t = new Date(p.paidAt).getTime();
            const dayDiff = Math.floor((startOfDay - new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime()) / 86_400_000);
            if (dayDiff >= 0 && dayDiff <= 6) buckets[6 - dayDiff] += p.amount;
        }
        return { revLast7: buckets, revYesterday: buckets[5] };
    }, [payments, now]);

    // Bugünün Programı: haftalık şeritte seçili gün. Seçili günün rezervasyonları
    // ayrı çekilir (geçmiş günler dahil herhangi bir tarih).
    const [selectedDate, setSelectedDate] = useState(today);
    const { reservations: dayReservations } = useTableReservations(selectedDate);
    const selRes = useMemo(
        () => dayReservations.filter((r) => tables.some((t) => t.id === r.tableId)).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [dayReservations, tables],
    );
    const selIsToday = selectedDate === todayStr;
    const selDay = weekDays.find((d) => d.dateStr === selectedDate);
    const selDateLabel = selDay ? `${selDay.num} ${monthShort.charAt(0)}${monthShort.slice(1).toLowerCase()}` : relativeDayLabel(selectedDate);

    const tableName = (id: string) => tables.find((t) => t.id === id)?.name || 'Masa';
    const staffName = (id?: string) => (id ? staff.find((s) => s.id === id)?.name : undefined);

    const activeToday = todayRes.filter((r) => r.status !== 'completed');

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto space-y-6">

                    {/* ── Hero ── */}
                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06),0_4px_16px_rgba(14,14,14,0.05)]">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 p-6 sm:px-7">
                            <div className={cn('flex-shrink-0 w-[72px] h-[72px] rounded-[14px] bg-[var(--dc-inkbox)] flex flex-col items-center justify-center', dark && 'shadow-[0_0_0_1.5px_rgba(255,90,31,0.75),0_0_8px_rgba(255,90,31,0.18)]')}>
                                <span className="text-[28px] font-black text-[var(--dc-inkbox-fg)] leading-none tracking-[-0.03em]">{dayNum}</span>
                                <span className="text-[9px] font-bold text-[var(--dc-onbox-70)] tracking-[0.16em] uppercase mt-0.5">{monthShort}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10.5px] font-semibold text-[var(--dc-orange)] uppercase tracking-[0.12em] mb-1.5">{weekday} · {monthYear}</p>
                                <h1 className="text-[22px] font-extrabold text-[var(--dc-ink)] tracking-[-0.03em] leading-tight truncate">{settings.businessName}</h1>
                                <p className="text-[13.5px] text-[var(--dc-muted)] mt-1">
                                    {tablesLoading ? 'Yükleniyor…'
                                        : dolu > 0 ? <>Şu an <b className="text-[var(--dc-ink)]">{dolu} masa dolu</b>{rezerve > 0 && <> · {rezerve} rezerve</>}</>
                                        : activeToday.length > 0 ? <>Bugün <b className="text-[var(--dc-ink)]">{activeToday.length} rezervasyon</b> var</>
                                        : <>Bugün için rezervasyon yok</>}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <LueraButton onClick={() => navigate('/masa')} variant={dark ? 'ghost-dark' : 'ghost'} size="md">
                                    <Armchair className="w-[15px] h-[15px]" /> Masa Planı
                                </LueraButton>
                                <LueraButton onClick={() => navigate('/masa')} variant="ink" size="md">
                                    <Plus className="w-[15px] h-[15px]" /> Yeni Rezervasyon
                                </LueraButton>
                            </div>
                        </div>
                    </div>

                    {/* ── KPI kartları — randevu dashboard'u ile aynı görsel dil ── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatCard
                            label="Dolu Masa" value={`${dolu}/${tables.length}`} sublabel="Şu an"
                            compareLabel="Rezerve" compareValue={rezerve}
                            trend={doluluk >= 70 ? { kind: 'warn', text: '↑ yoğun' } : dolu > 0 ? { kind: 'neutral', text: 'aktif' } : { kind: 'neutral', text: 'sakin' }}
                            urgent={doluluk >= 70}
                            onClick={() => navigate('/masa')}
                        >
                            <ProgressBar label="Doluluk" pct={doluluk} urgent={doluluk >= 70} />
                        </StatCard>

                        <StatCard
                            label="Bugün" value={todayRes.length} sublabel="Rezervasyon"
                            compareLabel="Yaklaşan" compareValue={futureRes.length}
                            trend={{ kind: 'neutral', text: 'canlı' }}
                            onClick={() => navigate('/masa')}
                        >
                            <Sparkline data={thisWeekDaily} activeIndex={todayIdx} />
                        </StatCard>

                        <StatCard
                            label="Ciro" value={`${fmt(stats.today)} ₺`} sublabel="Bugün"
                            compareLabel="Bu hafta" compareValue={`${fmt(stats.week)} ₺`}
                            trend={compareTrend(stats.today, revYesterday)}
                            onClick={() => navigate('/kasa')}
                        >
                            <Sparkline data={revLast7} />
                        </StatCard>

                        <StatCard
                            label="Doluluk" value={`%${doluluk}`} sublabel={`${tables.length} masa`}
                            compareLabel="Boş masa" compareValue={bos}
                            trend={bos === 0 && tables.length > 0 ? { kind: 'warn', text: 'dolu' } : { kind: 'neutral', text: 'uygun' }}
                            onClick={() => navigate('/masa')}
                        >
                            <ProgressBar label="Salon" pct={doluluk} />
                        </StatCard>
                    </div>

                    {/* ── Ana içerik: Bugünün Programı + sağ panel ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                        {/* Bugünün Programı — haftalık şerit + seçili gün rezervasyonları */}
                        <div className="lg:col-span-3 relative overflow-hidden rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)]">
                            <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-[var(--dc-inkbox-fg)]" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-[var(--dc-ink)]">{selIsToday ? 'Bugünün Programı' : `${selDateLabel} Programı`}</h2>
                                        <p className="text-[11px] text-[var(--dc-muted)]">{selRes.length} rezervasyon</p>
                                    </div>
                                </div>
                                <button onClick={() => navigate('/masa')}
                                    className="text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                    Masa Planı <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>

                            {/* Haftalık şerit */}
                            <div className="flex gap-[3px] px-4 py-3 border-b border-[var(--dc-border)] overflow-x-auto">
                                {weekDays.map((d) => {
                                    const sel = selectedDate === d.dateStr;
                                    return (
                                        <button key={d.dateStr} onClick={() => setSelectedDate(d.dateStr)}
                                            aria-pressed={sel}
                                            aria-label={`${d.num} ${monthShort} ${d.label}${d.hasEvent ? ', rezervasyon var' : ', rezervasyon yok'}`}
                                            className={cn(
                                                'flex-1 min-w-[38px] flex flex-col items-center gap-1 py-2 px-1 rounded-[10px] transition-all',
                                                sel
                                                    ? cn('bg-[var(--dc-inkbox)] -translate-y-px', dark ? 'shadow-[0_0_0_1.5px_rgba(255,90,31,0.75),0_0_8px_rgba(255,90,31,0.15)]' : 'shadow-[0_3px_10px_rgba(14,14,14,0.15)]')
                                                    : 'hover:bg-[var(--dc-surface2)]',
                                            )}>
                                            <span className={cn('text-[9px] font-bold uppercase tracking-[0.08em]', sel ? 'text-[var(--dc-onbox-50)]' : 'text-[var(--dc-muted)]')}>{d.label}</span>
                                            <span className={cn('text-[14px] font-extrabold leading-none', sel ? 'text-[var(--dc-inkbox-fg)]' : 'text-[var(--dc-ink)]')}>{d.num}</span>
                                            <span className={cn('w-1 h-1 rounded-full', d.hasEvent ? (sel ? 'bg-[var(--dc-onbox-60)]' : 'bg-[var(--dc-orange)]') : 'bg-transparent')} />
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="p-4">
                                {selRes.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <div className="w-16 h-16 rounded-2xl bg-[var(--dc-surface3)] border border-[var(--dc-border2)] flex items-center justify-center mb-3">
                                            <Armchair className="w-7 h-7 text-[var(--dc-muted)]" />
                                        </div>
                                        <p className="text-sm font-semibold text-[var(--dc-ink)] mb-1">{selIsToday ? 'Bugün rezervasyon yok' : `${selDateLabel} rezervasyon yok`}</p>
                                        <LueraButton onClick={() => navigate('/masa')} variant="accent" size="sm" className="mt-2" style={{ color: 'var(--dc-cream)' }}>
                                            + Rezervasyon oluştur
                                        </LueraButton>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {selRes.map((r) => {
                                            const b = (r.status === 'completed' && r.isPaid === false) ? RES_BADGE.unpaid : (RES_BADGE[r.status] || RES_BADGE.reserved);
                                            const mins = r.status === 'seated' ? seatedMinutes(r.seatedAt, now.getTime()) : null;
                                            const waiter = staffName(r.staffId);
                                            const total = adisyonTotal(r.adisyonItems);
                                            return (
                                                <div key={r.id} onClick={() => navigate('/masa')}
                                                    className="flex items-center gap-3 p-3 rounded-xl border border-[var(--dc-border-soft)] hover:border-[var(--dc-orange)] hover:shadow-sm transition-all cursor-pointer">
                                                    <div className="text-center min-w-[48px]">
                                                        <p className="text-sm font-extrabold text-[var(--dc-ink)] tabular-nums">{r.startTime}</p>
                                                        {r.endTime && <p className="text-[10px] text-[var(--dc-muted)] tabular-nums">{r.endTime}</p>}
                                                    </div>
                                                    <div className="w-1 h-11 rounded-full flex-shrink-0" style={{ backgroundColor: b.fg }} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-[var(--dc-ink)] truncate">{r.customerName}</p>
                                                        <p className="text-xs text-[var(--dc-muted)] truncate">{tableName(r.tableId)}{waiter && ` · ${waiter}`}</p>
                                                    </div>
                                                    {total > 0 && <span className="hidden sm:inline text-[11px] font-bold text-[var(--dc-ink)] flex-shrink-0" style={{ fontFamily: MONO }}>{fmt(total)} ₺</span>}
                                                    {mins !== null && (
                                                        <span className="flex items-center gap-1 text-[11px] font-bold flex-shrink-0" style={{ fontFamily: MONO, color: mins >= LONG_SIT_MIN ? 'var(--dc-red)' : 'var(--dc-muted)' }}>
                                                            <Clock className="w-3 h-3" /> {elapsedLabel(mins)}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--dc-muted)] flex-shrink-0" style={{ fontFamily: MONO }}>
                                                        <Users className="w-3 h-3" /> {r.partySize}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold flex-shrink-0" style={{ background: b.bg, color: b.fg }}>{b.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sağ panel */}
                        <div className="lg:col-span-2 flex flex-col gap-4">

                            {/* Yaklaşan masa rezervasyonları */}
                            <div className="flex-1 relative overflow-hidden rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)]">
                                <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border)] flex items-center justify-center">
                                        <Calendar className="w-4 h-4 text-[var(--dc-ink)]" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-[var(--dc-ink)]">Yaklaşan</h2>
                                        <p className="text-[11px] text-[var(--dc-muted)]">{futureRes.length} rezervasyon</p>
                                    </div>
                                </div>
                                <div className="p-3 space-y-2">
                                    {futureRes.length === 0 ? (
                                        <div className="text-center py-8"><p className="text-sm text-[var(--dc-muted)]">Yaklaşan rezervasyon yok</p></div>
                                    ) : (
                                        futureRes.slice(0, 6).map((r) => (
                                            <div key={r.id} onClick={() => navigate('/masa')}
                                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border-soft)] hover:bg-[var(--dc-orange-soft)] hover:border-[var(--dc-orange)] transition-all cursor-pointer">
                                                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-[var(--dc-orange-soft)] text-[var(--dc-orange-d)]">{relativeDayLabel(r.date)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-[var(--dc-ink)] truncate">{r.customerName}</p>
                                                    <p className="text-[11px] text-[var(--dc-muted)] truncate">{tableName(r.tableId)}</p>
                                                </div>
                                                <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[var(--dc-orange-soft)] text-[var(--dc-orange-d)] flex-shrink-0 tabular-nums">{r.startTime}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Masalar — Dolu / Rezerve / Boş sayaçları + bölgeli masa krokisi (hover'da misafir/saat) */}
                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
                                <div className="px-5 pt-4 pb-3 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center flex-shrink-0">
                                        <Armchair className="w-4 h-4 text-[var(--dc-inkbox-fg)]" />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-[13.5px] font-bold text-[var(--dc-ink)]">Masalar</h2>
                                        <p className="text-[11px] text-[var(--dc-muted)] mt-0.5">{tables.length} masa · {zoneGroups.length} bölge</p>
                                    </div>
                                    <button onClick={() => navigate('/masa')}
                                        className="ml-auto text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0">
                                        Masa Planı <ArrowRight className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 border-t border-[var(--dc-border)]">
                                    <div className="text-center py-3.5 px-3 border-r border-[var(--dc-border)]">
                                        <p className="text-[20px] font-black text-[var(--dc-orange)] tracking-[-0.04em]">{dolu}</p>
                                        <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--dc-orange)] mt-0.5">Dolu</p>
                                    </div>
                                    <div className="text-center py-3.5 px-3 border-r border-[var(--dc-border)]">
                                        <p className="text-[20px] font-black text-[var(--dc-blue)] tracking-[-0.04em]">{rezerve}</p>
                                        <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--dc-blue)] mt-0.5">Rezerve</p>
                                    </div>
                                    <div className="text-center py-3.5 px-3">
                                        <p className="text-[20px] font-black text-[var(--dc-green)] tracking-[-0.04em]">{bos}</p>
                                        <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--dc-green)] mt-0.5">Boş</p>
                                    </div>
                                </div>

                                {tables.length > 0 && (
                                    <div className="px-4 pt-3.5 pb-2 border-t border-[var(--dc-border)]">
                                        {zoneGroups.map(({ zone, items }) => (
                                            <div key={zone} className="mb-3 last:mb-0">
                                                {zoneGroups.length > 1 && (
                                                    <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--dc-muted)] mb-2">{zone}</p>
                                                )}
                                                <div className="flex flex-wrap gap-2">
                                                    {items.map((t) => {
                                                        const rs = byTableToday.get(t.id) || [];
                                                        const s = statusOf(rs);
                                                        const seated = rs.find((r) => r.status === 'seated');
                                                        const nextRes = rs.find((r) => r.status === 'reserved');
                                                        const tip = s === 'dolu' && seated ? `${seated.customerName} · ${seated.startTime}`
                                                            : s === 'rezerve' && nextRes ? `${nextRes.customerName} · ${nextRes.startTime}`
                                                            : `Boş · ${t.capacity} kişilik`;
                                                        return (
                                                            <button key={t.id} onClick={() => navigate('/masa')}
                                                                className={cn(
                                                                    'group relative flex flex-col items-center justify-center gap-0.5 w-[46px] h-[46px] rounded-xl border-[1.5px] transition-all hover:-translate-y-0.5 hover:shadow-[var(--dc-shadow,0_2px_6px_rgba(14,14,14,0.08))]',
                                                                    s === 'bos' && 'bg-[var(--dc-surface2)] border-[var(--dc-border2)] text-[var(--dc-muted)]',
                                                                )}
                                                                style={s !== 'bos' ? { background: s === 'dolu' ? 'var(--dc-orange)' : 'var(--dc-blue)', borderColor: s === 'dolu' ? 'var(--dc-orange)' : 'var(--dc-blue)', color: '#fff' } : undefined}>
                                                                <span className="text-[11.5px] font-extrabold leading-none">{t.name.replace(/^Masa\s*/i, '')}</span>
                                                                <span className="text-[8px] font-semibold opacity-70 leading-none">{t.capacity} kişi</span>
                                                                <span className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[9px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-semibold px-2.5 py-1.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all z-10 shadow-[var(--dc-shadow-lg,0_8px_24px_rgba(14,14,14,0.18))]">
                                                                    <b className="font-bold">{t.name}</b> · {tip}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex flex-wrap gap-3.5 pt-2 pb-1">
                                            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--dc-muted)]"><span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--dc-surface3)]" />Boş</span>
                                            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--dc-muted)]"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: 'var(--dc-orange)' }} />Dolu</span>
                                            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--dc-muted)]"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: 'var(--dc-blue)' }} />Rezerve</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bekleme Listesi */}
                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
                                <div className="px-5 py-4 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center flex-shrink-0">
                                        <Clock className="w-4 h-4 text-[var(--dc-inkbox-fg)]" />
                                    </div>
                                    <div>
                                        <h2 className="text-[13.5px] font-bold text-[var(--dc-ink)]">Bekleme Listesi</h2>
                                        <p className="text-[11px] text-[var(--dc-muted)] mt-0.5">{waitlist.length} grup bekliyor</p>
                                    </div>
                                </div>
                                {waitlist.length > 0 && (
                                    <div className="px-3 pb-3 space-y-2">
                                        {waitlist.slice(0, 5).map((w, i) => (
                                            <div key={w.id} onClick={() => navigate('/masa')}
                                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border-soft)] hover:bg-[var(--dc-orange-soft)] hover:border-[var(--dc-orange)] transition-all cursor-pointer">
                                                <div className="w-6 h-6 rounded-full bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] flex items-center justify-center text-[10.5px] font-extrabold flex-shrink-0">{i + 1}</div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-[var(--dc-ink)] truncate">{w.customerName}</p>
                                                    <p className="text-[11px] text-[var(--dc-muted)]">{w.partySize} kişi</p>
                                                </div>
                                                <span className="text-[11px] font-bold text-[var(--dc-amber)] flex-shrink-0">~{waitMinutes(w.joinedAt)} dk</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
