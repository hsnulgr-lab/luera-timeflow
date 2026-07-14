// Sektör dashboard yüzlerinin ortak zengin parçaları (diş/dövme/gelecek yüzler).
// kpi.tsx ilkellerinin üstünde: haftalık gün şeridi, personel doluluk paneli,
// son-7-gün / hafta kıyas hesapları. RandevuDashboard'un görsel diliyle birebir.
import { useMemo } from 'react';
import { toISODate } from '@/utils/date';
import { MONO } from '@/components/dashboard/kpi';
import type { Reservation, Staff } from '@/types';

export const MONTHS_SHORT_TR = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];

// ── Hesap yardımcıları ────────────────────────────────────────────────────────
export interface FaceWeekStats {
    last7: number[];            // son 7 günün adetleri (son eleman = bugün)
    lastWeekSameDay: number;    // geçen hafta aynı gün
    thisWeekTotal: number;      // bu hafta (Pzt–Paz, iptal hariç)
    lastWeekTotal: number;      // geçen hafta
    thisWeekDaily: number[];    // bu haftanın günlük dağılımı (Pzt→Paz)
    todayIdx: number;           // bugünün hafta-içi indeksi (0=Pzt)
}

export function useFaceWeekStats(reservations: Reservation[], now: Date): FaceWeekStats {
    return useMemo(() => {
        const active = reservations.filter((r) => r.status !== 'cancelled');
        const iso = (dt: Date) => toISODate(dt);
        const d = new Date(now);

        const last7 = Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(d); dt.setDate(d.getDate() - (6 - i));
            const ds = iso(dt);
            return active.filter((r) => r.date === ds).length;
        });

        const lwSame = new Date(d); lwSame.setDate(d.getDate() - 7);
        const lastWeekSameDay = active.filter((r) => r.date === iso(lwSame)).length;

        const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        const lastMon = new Date(monday); lastMon.setDate(monday.getDate() - 7);
        const lastSun = new Date(monday); lastSun.setDate(monday.getDate() - 1);
        const inRange = (date: string, a: Date, b: Date) => date >= iso(a) && date <= iso(b);
        const thisWeekTotal = active.filter((r) => inRange(r.date, monday, sunday)).length;
        const lastWeekTotal = active.filter((r) => inRange(r.date, lastMon, lastSun)).length;

        const thisWeekDaily = Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(monday); dt.setDate(monday.getDate() + i);
            return active.filter((r) => r.date === iso(dt)).length;
        });

        return { last7, lastWeekSameDay, thisWeekTotal, lastWeekTotal, thisWeekDaily, todayIdx: (d.getDay() + 6) % 7 };
    }, [reservations, now]);
}

export interface FaceWeekDay { label: string; num: number; dateStr: string; isToday: boolean; hasEvent: boolean }

export function useFaceWeekDays(reservations: Reservation[], now: Date): FaceWeekDay[] {
    return useMemo(() => {
        const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        const todayStr = toISODate(now);
        const start = new Date(now);
        start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const ds = toISODate(d);
            return {
                label: labels[i], num: d.getDate(), dateStr: ds,
                isToday: ds === todayStr,
                hasEvent: reservations.some((r) => r.date === ds && r.status !== 'cancelled'),
            };
        });
    }, [reservations, now]);
}

// ── Haftalık gün şeridi (kart başlığının altına) ─────────────────────────────
export function WeekStrip({ days, selected, onSelect }: { days: FaceWeekDay[]; selected: string; onSelect: (dateStr: string) => void }) {
    return (
        <div className="flex gap-1 px-4 py-3 border-b border-[var(--dc-border)] overflow-x-auto">
            {days.map((d) => {
                const active = d.dateStr === selected;
                return (
                    <button
                        key={d.dateStr}
                        onClick={() => onSelect(d.dateStr)}
                        className="flex-1 min-w-[40px] flex flex-col items-center gap-1 py-2 px-1 rounded-[11px] transition-colors"
                        style={{ background: active ? 'var(--dc-inkbox)' : 'transparent', color: active ? 'var(--dc-inkbox-fg)' : 'var(--dc-ink)' }}
                    >
                        <span className="text-[9px] font-bold uppercase tracking-[.08em]" style={{ color: active ? 'var(--dc-onbox-60)' : 'var(--dc-muted)' }}>
                            {d.label}
                        </span>
                        <span className="text-[15px] font-extrabold leading-none">{d.num}</span>
                        <span className="w-[4px] h-[4px] rounded-full" style={{ background: d.hasEvent ? 'var(--dc-orange)' : 'transparent' }} />
                    </button>
                );
            })}
        </div>
    );
}

// ── Personel doluluk paneli (Hekim/Artist Doluluğu) ──────────────────────────
// Bugünkü randevu adedi + toplam dakika → çalışma gününe oranla doluluk çubuğu.
export function StaffLoadPanel({ title, staff, todayReservations, workdayMinutes = 480 }: {
    title: string; staff: Staff[]; todayReservations: Reservation[]; workdayMinutes?: number;
}) {
    const rows = useMemo(() => {
        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
        return staff.filter((s) => s.isActive).map((s) => {
            const mine = todayReservations.filter((r) => r.staffId === s.id && r.status !== 'cancelled');
            const mins = mine.reduce((sum, r) => sum + Math.max(0, toMin(r.endTime) - toMin(r.startTime)), 0);
            return { id: s.id, name: s.name, color: s.color, count: mine.length, pct: Math.min(100, Math.round((mins / workdayMinutes) * 100)) };
        }).sort((a, b) => b.pct - a.pct);
    }, [staff, todayReservations, workdayMinutes]);

    if (rows.length === 0) return null;
    return (
        <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--dc-border)]">
                <div className="w-8 h-8 rounded-[9px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 17c0-3.4 3-5.5 6.5-5.5s6.5 2.1 6.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </div>
                <div>
                    <div className="text-[13.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">{title}</div>
                    <div className="text-[11px] text-[var(--dc-muted)] mt-0.5">Bugünkü yoğunluk</div>
                </div>
            </div>
            <div className="px-5 py-3.5 flex flex-col gap-3.5">
                {rows.map((r) => (
                    <div key={r.id}>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--dc-ink)]">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                                {r.name}
                            </span>
                            <span className="text-[10.5px] font-bold" style={{ fontFamily: MONO, color: 'var(--dc-muted)' }}>
                                {r.count} randevu · %{r.pct}
                            </span>
                        </div>
                        <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'var(--dc-surface3)' }}>
                            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${r.pct}%`, background: r.color }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
