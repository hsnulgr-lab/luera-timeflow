import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Armchair, ArrowRight, Plus, Users, Wallet } from 'lucide-react';
import { useTables } from '@/hooks/useTables';
import { useUpcomingTableReservations } from '@/hooks/useTableReservations';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, relativeDayLabel } from '@/utils/date';
import { LueraButton } from '@/components/ui/LueraButton';
import type { TableReservation } from '@/types';

const MONO = "'JetBrains Mono', monospace";
const MONTHS_SHORT = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
const fmt = (n: number) => n.toLocaleString('tr-TR');

// MasaPage.statusOf ile aynı öncelik (seated → dolu, reserved → rezerve).
// MasaPage'e dokunmamak için lokal kopya — davranış değişirse ikisi birlikte güncellenmeli.
type TableStatus = 'bos' | 'rezerve' | 'dolu';
function statusOf(rs: TableReservation[]): TableStatus {
    if (rs.some((r) => r.status === 'seated')) return 'dolu';
    if (rs.some((r) => r.status === 'reserved')) return 'rezerve';
    return 'bos';
}

const RES_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
    seated:    { label: 'Oturdu',     bg: 'rgba(255,90,31,0.12)',  fg: 'var(--dc-orange)' },
    reserved:  { label: 'Rezerve',    bg: 'var(--dc-surface2)',    fg: 'var(--dc-muted)' },
    completed: { label: 'Tamamlandı', bg: 'var(--dc-green-bg)',    fg: 'var(--dc-green)' },
};

// Masa/ciro verisini derleyen ortak hook — tam dashboard, panel ve özet paylaşır.
// Bugün: masa durumu (dolu/rezerve/boş). Liste: bugün + yaklaşan günler.
function useMasaToday() {
    const today = todayISO();
    const { tables, isLoading: tablesLoading } = useTables();
    const { reservations } = useUpcomingTableReservations();

    return useMemo(() => {
        const valid = reservations.filter((r) => tables.some((t) => t.id === r.tableId)); // hayalet koruması
        const todayRes = valid.filter((r) => r.date === today);
        const listRes = valid; // bugün + yaklaşan, hook zaten tarih+saate göre sıralı

        const byTable = new Map<string, TableReservation[]>();
        for (const r of todayRes) (byTable.get(r.tableId) || byTable.set(r.tableId, []).get(r.tableId)!).push(r);
        const dolu = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'dolu').length;
        const rezerve = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'rezerve').length;
        const doluluk = tables.length > 0 ? Math.round((dolu / tables.length) * 100) : 0;
        const tableName = (id: string) => tables.find((t) => t.id === id)?.name || 'Masa';
        const tableStatuses = tables.map((t) => ({ id: t.id, name: t.name, status: statusOf(byTable.get(t.id) || []) }));
        return { tables, tablesLoading, todayRes, listRes, dolu, rezerve, doluluk, tableName, tableStatuses };
    }, [tables, tablesLoading, reservations]);
}

// ── Kompakt özet kartı — randevu + masa İKİSİ DE açıkken randevu dash'ine eklenir ──
// Boş bant değil salon nabzı: her masa durum renkli bir kutucuk (isim baş harfiyle),
// sağda Dolu/Rezerve/Boş sayaçları. Tamamı /masa'ya götürür.
const SUMMARY_STATUS: Record<TableStatus, { bg: string; fg: string; border: string }> = {
    dolu:    { bg: 'rgba(255,90,31,0.14)',  fg: 'var(--dc-orange)', border: 'rgba(255,90,31,0.35)' },
    rezerve: { bg: 'rgba(224,168,78,0.16)', fg: 'var(--dc-amber, #B87A00)', border: 'rgba(224,168,78,0.4)' },
    bos:     { bg: 'var(--dc-surface2)',    fg: 'var(--dc-muted)',  border: 'var(--dc-border)' },
};

// Sağ kolona (Bugünün Programı'nın yanına) düşen dikey panel. Yalnızca masa
// modülü açıkken DashboardPage tarafından render edilir; kapalıyken saf TimeFlow.
export function MasaPanel() {
    const navigate = useNavigate();
    const today = todayISO();
    const { tables, tablesLoading, dolu, rezerve, todayRes, listRes, tableName, tableStatuses } = useMasaToday();
    if (tablesLoading || tables.length === 0) return null;
    const bos = tables.length - dolu - rezerve;
    const upcoming = listRes.filter((r) => r.date > today);
    return (
        <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
            {/* Başlık */}
            <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center">
                        <Armchair className="w-4 h-4 text-[var(--dc-inkbox-fg)]" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-[var(--dc-ink)]">Masalar</h2>
                        <p className="text-[11px] text-[var(--dc-muted)]">
                            bugün {todayRes.length} rezervasyon{upcoming.length > 0 && ` · +${upcoming.length} yaklaşan`}
                        </p>
                    </div>
                </div>
                <button onClick={() => navigate('/masa')}
                    className="text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                    Masa Planı <ArrowRight className="w-3 h-3" />
                </button>
            </div>

            {/* Dolu / Rezerve / Boş sayaçları (Haftalık Özet deseni) */}
            <div className="grid grid-cols-3 border-b border-[var(--dc-border)]">
                {[
                    { n: dolu, lbl: 'Dolu', clr: 'var(--dc-orange)' },
                    { n: rezerve, lbl: 'Rezerve', clr: 'var(--dc-amber, #B87A00)' },
                    { n: bos, lbl: 'Boş', clr: 'var(--dc-green)' },
                ].map((s, i) => (
                    <div key={s.lbl} className={cn('text-center py-3.5 px-3', i < 2 && 'border-r border-[var(--dc-border)]')}>
                        <p className="text-[22px] font-black tracking-[-0.04em]" style={{ color: s.clr }}>{s.n}</p>
                        <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] mt-0.5" style={{ color: s.clr }}>{s.lbl}</p>
                    </div>
                ))}
            </div>

            {/* Masa kutucukları — salon nabzı (isim + durum rengi) */}
            <div className="p-4 flex flex-wrap gap-2">
                {tableStatuses.map((t) => {
                    const s = SUMMARY_STATUS[t.status];
                    return (
                        <button key={t.id} onClick={() => navigate('/masa')}
                            title={`${t.name} · ${t.status === 'dolu' ? 'Dolu' : t.status === 'rezerve' ? 'Rezerve' : 'Boş'}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[9px] transition-transform hover:-translate-y-0.5"
                            style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.fg }} />
                            <span className="text-[12px] font-bold max-w-[90px] truncate" style={{ color: 'var(--dc-ink)' }}>{t.name}</span>
                        </button>
                    );
                })}
            </div>

            {/* Yaklaşan masa rezervasyonları (ileri tarihli) */}
            {upcoming.length > 0 && (
                <div className="px-4 pb-4 -mt-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ fontFamily: MONO, color: 'var(--dc-muted)' }}>Yaklaşan</p>
                    <div className="space-y-1.5">
                        {upcoming.slice(0, 3).map((r) => (
                            <button key={r.id} onClick={() => navigate('/masa')}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left bg-[var(--dc-surface2)] border border-[var(--dc-border-soft)] hover:border-[var(--dc-orange)] transition-colors">
                                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-[var(--dc-orange-soft)] text-[var(--dc-orange-d)]">{relativeDayLabel(r.date)}</span>
                                <span className="text-[12.5px] font-semibold text-[var(--dc-ink)] truncate flex-1 min-w-0">{r.customerName}</span>
                                <span className="text-[11px] text-[var(--dc-muted)] flex-shrink-0" style={{ fontFamily: MONO }}>{tableName(r.tableId)} · {r.startTime}</span>
                            </button>
                        ))}
                        {upcoming.length > 3 && (
                            <button onClick={() => navigate('/masa')} className="w-full text-center text-[11px] font-semibold text-[var(--dc-orange)] py-1">
                                +{upcoming.length - 3} rezervasyon daha
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── KPI kartı (DashboardPage.StatCard estetiğinde, sade) ──
function Kpi({ label, value, sublabel, accent }: { label: string; value: string; sublabel: string; accent?: boolean }) {
    return (
        <div
            className="flex flex-col rounded-[14px] px-3 py-2 shadow-[0_1px_3px_rgba(14,14,14,0.06),0_2px_8px_rgba(14,14,14,0.04)]"
            style={{
                background: accent ? 'rgba(255,90,31,0.035)' : 'var(--dc-surface)',
                border: `1px solid ${accent ? 'rgba(255,90,31,0.25)' : 'var(--dc-border)'}`,
            }}
        >
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={{ fontFamily: MONO, color: accent ? 'var(--dc-orange)' : 'var(--dc-muted)' }}>
                {label}
            </span>
            <p className="text-[25px] font-black leading-[1.05] tracking-[-0.05em]" style={{ color: accent ? 'var(--dc-orange)' : 'var(--dc-ink)' }}>
                {value}
            </p>
            <p className="text-[12px] mt-0.5 font-semibold" style={{ color: 'var(--dc-muted)' }}>{sublabel}</p>
        </div>
    );
}

// ── Tam restoran dashboard'u — masa açık + randevu KAPALI iken ana ekran ──
export function MasaDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { settings } = useReservations();
    const { stats } = usePayments();
    const today = todayISO();
    const { tables, tablesLoading, todayRes, listRes, dolu, rezerve, doluluk, tableName } = useMasaToday();

    const now = new Date();
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const monthYear = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    const activeRes = todayRes.filter((r) => r.status !== 'completed');

    return (
        <div className={cn("dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]", dark && "dark")}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto space-y-6">

                    {/* Hero — DashboardPage ile aynı desen */}
                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06),0_4px_16px_rgba(14,14,14,0.05)]">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 p-6 sm:px-7">
                            <div className={cn("flex-shrink-0 w-[72px] h-[72px] rounded-[14px] bg-[var(--dc-inkbox)] flex flex-col items-center justify-center", dark && "shadow-[0_0_0_1.5px_rgba(255,90,31,0.75),0_0_8px_rgba(255,90,31,0.18)]")}>
                                <span className="text-[28px] font-black text-[var(--dc-inkbox-fg)] leading-none tracking-[-0.03em]">{now.getDate()}</span>
                                <span className="text-[9px] font-bold text-[var(--dc-onbox-70)] tracking-[0.16em] uppercase mt-0.5">{MONTHS_SHORT[now.getMonth()]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10.5px] font-semibold text-[var(--dc-orange)] uppercase tracking-[0.12em] mb-1.5">{weekday} · {monthYear}</p>
                                <h1 className="text-[22px] font-extrabold text-[var(--dc-ink)] tracking-[-0.03em] leading-tight truncate">{settings.businessName}</h1>
                                <p className="text-[13.5px] text-[var(--dc-muted)] mt-1">
                                    {tablesLoading ? 'Yükleniyor…'
                                        : dolu > 0 ? <>Şu an <b className="text-[var(--dc-ink)]">{dolu} masa dolu</b>{rezerve > 0 && <> · {rezerve} rezerve</>}</>
                                        : activeRes.length > 0 ? <>Bugün <b className="text-[var(--dc-ink)]">{activeRes.length} rezervasyon</b> var</>
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

                    {/* KPI'lar */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Kpi label="Dolu Masa" value={`${dolu}/${tables.length}`} sublabel="Şu an" accent={dolu > 0} />
                        <Kpi label="Rezervasyon" value={String(todayRes.length)} sublabel="Bugün" />
                        <Kpi label="Ciro" value={`${fmt(stats.today)} ₺`} sublabel="Bugün" />
                        <Kpi label="Doluluk" value={`%${doluluk}`} sublabel={`${tables.length} masa`} />
                    </div>

                    {/* Bugünün rezervasyonları */}
                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)]">
                        <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center">
                                    <Wallet className="w-4 h-4 text-[var(--dc-inkbox-fg)]" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-[var(--dc-ink)]">Rezervasyonlar</h2>
                                    <p className="text-[11px] text-[var(--dc-muted)]">bugün {todayRes.length} · yaklaşan {listRes.length - todayRes.length}</p>
                                </div>
                            </div>
                            <button onClick={() => navigate('/masa')}
                                className="text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                Masa Planı <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="p-4">
                            {listRes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10">
                                    <div className="w-16 h-16 rounded-2xl bg-[var(--dc-surface3)] border border-[var(--dc-border2)] flex items-center justify-center mb-3">
                                        <Armchair className="w-7 h-7 text-[var(--dc-muted)]" />
                                    </div>
                                    <p className="text-sm font-semibold text-[var(--dc-ink)] mb-1">Rezervasyon yok</p>
                                    <LueraButton onClick={() => navigate('/masa')} variant="accent" size="sm" className="mt-2" style={{ color: 'var(--dc-cream)' }}>
                                        + Rezervasyon oluştur
                                    </LueraButton>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {listRes.map((r) => {
                                        const b = RES_BADGE[r.status] || RES_BADGE.reserved;
                                        const isFuture = r.date > today;
                                        return (
                                            <div key={r.id} onClick={() => navigate('/masa')}
                                                className="flex items-center gap-3 p-3 rounded-xl border border-[var(--dc-border-soft)] hover:border-[var(--dc-orange)] hover:shadow-sm transition-all cursor-pointer">
                                                <div className="text-center min-w-[48px]">
                                                    {isFuture
                                                        ? <p className="text-[11px] font-bold text-[var(--dc-orange-d)] leading-tight">{relativeDayLabel(r.date)}</p>
                                                        : null}
                                                    <p className="text-sm font-extrabold text-[var(--dc-ink)] tabular-nums">{r.startTime}</p>
                                                    {!isFuture && r.endTime && <p className="text-[10px] text-[var(--dc-muted)] tabular-nums">{r.endTime}</p>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-[var(--dc-ink)] truncate">{r.customerName}</p>
                                                    <p className="text-xs text-[var(--dc-muted)] truncate">{tableName(r.tableId)}</p>
                                                </div>
                                                <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--dc-muted)] flex-shrink-0" style={{ fontFamily: MONO }}>
                                                    <Users className="w-3 h-3" /> {r.partySize}
                                                </span>
                                                <span className="px-2 py-1 rounded-lg text-[10px] font-bold flex-shrink-0" style={{ background: b.bg, color: b.fg }}>
                                                    {b.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
