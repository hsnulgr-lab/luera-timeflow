import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Plus, ArrowRight, Phone, MessageCircle, Bell } from 'lucide-react';
import { LNotifications } from '@/components/icons/LueraIcons';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { LueraButton } from '@/components/ui/LueraButton';

// Durum rozetleri — Luera sıcak paleti
const statusConfig = {
    pending:   { label: 'Bekleyen',    color: 'bg-[#FFF1E8] text-[#E8430F]',           dot: 'bg-[#FF5A1F]' },
    confirmed: { label: 'Onaylı',      color: 'bg-[#E8F5EA] text-[#2A8A30]',           dot: 'bg-[#2A8A30]' },
    cancelled: { label: 'İptal',       color: 'bg-[#FBECEC] text-[#C0392B]',           dot: 'bg-[#C0392B]' },
    completed: { label: 'Tamamlandı',  color: 'bg-[#F3EDE4] text-[#0E0E0E]/[0.55]',    dot: 'bg-[#0E0E0E]/40' },
};

// Telefonu WhatsApp (wa.me) formatına çevir — TR numaraları için
function waLink(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '90' + p.slice(1);
    else if (!p.startsWith('90')) p = '90' + p;
    return `https://wa.me/${p}`;
}

const MONO = "'JetBrains Mono', monospace";

// ── KPI kart yardımcıları (Luera Dashboard v2) ────────────────────────────────
type TrendKind = 'up' | 'down' | 'neutral' | 'warn';

const TREND_STYLE: Record<TrendKind, React.CSSProperties> = {
    up:      { background: '#E8F5EA',               color: '#2A8A30' },
    down:    { background: '#FBECEC',               color: '#C0392B' },
    neutral: { background: '#F3EDE4',               color: 'rgba(14,14,14,0.45)' },
    warn:    { background: 'rgba(255,90,31,0.10)',  color: '#FF5A1F' },
};

function TrendChip({ kind, text }: { kind: TrendKind; text: string }) {
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
function compareTrend(curr: number, prev: number): { kind: TrendKind; text: string } {
    if (prev === 0 && curr === 0) return { kind: 'neutral', text: '= geçen hafta' };
    if (prev === 0)               return { kind: 'up',      text: '↑ yeni' };
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (pct === 0) return { kind: 'neutral', text: '= geçen hafta' };
    if (pct > 0)   return { kind: 'up',      text: `↑ %${pct}` };
    return { kind: 'down', text: `↓ %${Math.abs(pct)}` };
}

// 7 çubuklu sparkline — vurgulu çubuk activeIndex (yoksa son çubuk)
function Sparkline({ data, urgent, activeIndex }: { data: number[]; urgent?: boolean; activeIndex?: number }) {
    const max = Math.max(1, ...data);
    const ai = activeIndex ?? data.length - 1;
    return (
        <div className="flex items-end gap-[2px] h-[11px] mt-[5px]">
            {data.map((v, i) => {
                const active = i === ai;
                const h = Math.max(14, Math.round((v / max) * 100));
                return (
                    <div
                        key={i}
                        className="flex-1 rounded-t-[2px] transition-[height] duration-500"
                        style={{ height: `${h}%`, background: active ? (urgent ? '#FF5A1F' : '#0E0E0E') : '#EDE6DB' }}
                    />
                );
            })}
        </div>
    );
}

// İlerleme çubuğu — etiket + yüzde
function ProgressBar({ label, pct, urgent }: { label: string; pct: number; urgent?: boolean }) {
    return (
        <div className="mt-[5px]">
            <div className="flex justify-between text-[9.5px] mb-[3px]" style={{ fontFamily: MONO, color: 'rgba(14,14,14,0.5)' }}>
                <span>{label}</span><span className="font-semibold" style={{ color: 'rgba(14,14,14,0.7)' }}>%{pct}</span>
            </div>
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: '#EDE6DB' }}>
                <div
                    className="h-full rounded-full transition-[width] duration-1000"
                    style={{
                        width: `${pct}%`,
                        background: urgent
                            ? 'linear-gradient(90deg,#FF5A1F,#ff8a52)'
                            : 'linear-gradient(90deg,#0E0E0E,rgba(14,14,14,.6))',
                    }}
                />
            </div>
        </div>
    );
}

// Tek bir KPI kartı
function StatCard({ label, value, sublabel, compareLabel, compareValue, trend, urgent, onClick, children }: {
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
                background: urgent ? 'rgba(255,90,31,0.035)' : '#FAF7F3',
                border: `1px solid ${urgent ? 'rgba(255,90,31,0.25)' : 'rgba(14,14,14,0.08)'}`,
            }}
        >
            <div className="flex items-center justify-between mb-1">
                <span
                    className="text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ fontFamily: MONO, color: urgent ? '#FF5A1F' : 'rgba(14,14,14,0.55)' }}
                >
                    {label}
                </span>
                <TrendChip kind={trend.kind} text={trend.text} />
            </div>
            <p
                className="text-[25px] font-black leading-[1.05] tracking-[-0.05em]"
                style={{ color: urgent ? '#FF5A1F' : '#0E0E0E' }}
            >
                {value}
            </p>
            <p className="text-[12px] mt-0.5 font-semibold" style={{ color: 'rgba(14,14,14,0.62)' }}>{sublabel}</p>
            <p className="text-[10.5px] mt-[3px] font-medium" style={{ color: 'rgba(14,14,14,0.45)' }}>
                {compareLabel}: <b style={{ color: '#0E0E0E' }}>{compareValue}</b>
            </p>
            {children}
        </button>
    );
}

export const DashboardPage = () => {
    const navigate = useNavigate();
    const { reservations, settings, getStats, getTodayReservations, getUpcomingReservations, getReservationsByDate } = useReservations();
    const stats                = getStats();
    const todayReservations    = getTodayReservations();
    const upcomingReservations = getUpcomingReservations(5);

    // now bir kez hesaplanır — yoksa her render'da değişip tüm useMemo'ları boşa geçersizleştirir
    const now      = useMemo(() => new Date(), []);
    const todayStr = toISODate(now);
    const nowTime  = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Takvim yaprağı için tarih parçaları
    const MONTHS_SHORT = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
    const dayNum    = now.getDate();
    const monthShort = MONTHS_SHORT[now.getMonth()];
    const weekday   = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const monthYear = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

    // Bugün kalan (henüz geçmemiş) randevular + en yakını
    const remainingTodayList = todayReservations.filter(r => r.status !== 'cancelled' && r.endTime >= nowTime);
    const remainingToday = remainingTodayList.length;
    const nextAppt = remainingTodayList[0]; // getTodayReservations saate göre sıralı

    // Otomatik gönderilen hatırlatma sayısı (güven göstergesi)
    const remindersSent = useMemo(() =>
        reservations.filter(r =>
            r.status !== 'cancelled' && r.date >= todayStr && (r.reminder24hSent || r.reminder2hSent)
        ).length,
        [reservations, todayStr]
    );

    // Bu hafta
    const weekStats = useMemo(() => {
        const startOfWeek = new Date(now);
        // Pazartesi başlangıç — (getDay()+6)%7 Pazar dahil doğru çalışır
        startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const weekRes = reservations.filter(r => r.date >= toISODate(startOfWeek)
            && r.date <= toISODate(endOfWeek));
        const completed = weekRes.filter(r => r.status === 'completed').length;
        const noShow    = weekRes.filter(r => r.status === 'cancelled').length;
        const total     = weekRes.filter(r => r.status !== 'cancelled').length;
        const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;

        return { total: weekRes.length, completed, noShow, rate };
    }, [reservations, now]);

    // ── KPI kart verileri (gerçek veriden) ────────────────────────────────────
    const cardData = useMemo(() => {
        const active = reservations.filter(r => r.status !== 'cancelled');
        const iso = (dt: Date) => toISODate(dt);
        const d = new Date(now);

        // Son 7 günün günlük adetleri (son eleman = bugün)
        const last7 = Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(d); dt.setDate(d.getDate() - (6 - i));
            const ds = iso(dt);
            return active.filter(r => r.date === ds).length;
        });

        // Bugün vs geçen hafta aynı gün
        const lwSame = new Date(d); lwSame.setDate(d.getDate() - 7);
        const lastWeekSameDay = active.filter(r => r.date === iso(lwSame)).length;

        // Bu hafta / geçen hafta toplamları (Pzt–Paz)
        const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        const lastMon = new Date(monday); lastMon.setDate(monday.getDate() - 7);
        const lastSun = new Date(monday); lastSun.setDate(monday.getDate() - 1);
        const inRange = (date: string, a: Date, b: Date) => date >= iso(a) && date <= iso(b);
        const thisWeekTotal = active.filter(r => inRange(r.date, monday, sunday)).length;
        const lastWeekTotal = active.filter(r => inRange(r.date, lastMon, lastSun)).length;

        // Yanıt oranı (Bekliyor): bu haftaki randevuların yanıtlanma yüzdesi
        const weekRes = active.filter(r => inRange(r.date, monday, sunday));
        const answered = weekRes.filter(r => r.status !== 'pending').length;
        const responseRate = weekRes.length > 0 ? Math.round((answered / weekRes.length) * 100) : 0;

        // Bekleyen — geçen hafta vs bu hafta (elma-elma kıyas)
        const pendingThisWeek = reservations.filter(r => r.status === 'pending' && inRange(r.date, monday, sunday)).length;
        const pendingLastWeek = reservations.filter(r => r.status === 'pending' && inRange(r.date, lastMon, lastSun)).length;

        // Bu haftanın günlük dağılımı (Pzt→Paz) — BU HAFTA kartının sparkline'ı
        const thisWeekDaily = Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(monday); dt.setDate(monday.getDate() + i);
            return active.filter(r => r.date === iso(dt)).length;
        });
        const todayIdx = (d.getDay() + 6) % 7; // bugünün hafta-içi indeksi (0=Pzt)

        // Bu ay / geçen ay tamamlanan
        const ym = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const thisYM = ym(d);
        const lastYM = ym(new Date(d.getFullYear(), d.getMonth() - 1, 1));
        const completedThisMonth = reservations.filter(r => r.status === 'completed' && r.date.startsWith(thisYM)).length;
        const completedLastMonth = reservations.filter(r => r.status === 'completed' && r.date.startsWith(lastYM)).length;
        const goal = Math.max(completedLastMonth, 1);
        const goalPct = Math.min(100, Math.round((completedThisMonth / goal) * 100));

        return {
            last7, lastWeekSameDay, lastWeekTotal, thisWeekTotal,
            responseRate, weekResCount: weekRes.length,
            pendingThisWeek, pendingLastWeek, thisWeekDaily, todayIdx,
            completedThisMonth, completedLastMonth, goalPct,
        };
    }, [reservations, now]);

    // Haftalık şerit (Pzt–Paz) — bugün seçili, etkinlikli günde turuncu nokta
    const weekDays = useMemo(() => {
        const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        const start = new Date(now);
        start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Pazartesi
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const ds = toISODate(d);
            return {
                label: labels[i],
                num: d.getDate(),
                dateStr: ds,
                isToday: ds === todayStr,
                hasEvent: reservations.some(r => r.date === ds && r.status !== 'cancelled'),
            };
        });
    }, [reservations, now, todayStr]);

    const [selectedDate, setSelectedDate] = useState(todayStr);

    // Haftalık şeritte seçili güne ait randevular (saate göre sıralı)
    const selectedReservations = useMemo(
        () => [...getReservationsByDate(selectedDate)].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, selectedDate]
    );
    const selIsToday = selectedDate === todayStr;
    const selDay = weekDays.find(d => d.dateStr === selectedDate);
    const selDateLabel = selDay ? `${selDay.num} ${monthShort.charAt(0)}${monthShort.slice(1).toLowerCase()}` : '';

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F5F0E6]">
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* ── Hero: Takvim Yaprağı + İşletme + Akıllı Özet ─────────────── */}
                <div className="rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_1px_3px_rgba(14,14,14,0.06),0_4px_16px_rgba(14,14,14,0.05)]">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 p-6 sm:px-7">
                        {/* Takvim yaprağı (ink) */}
                        <div className="flex-shrink-0 w-[72px] h-[72px] rounded-[14px] bg-[#0E0E0E] flex flex-col items-center justify-center">
                            <span className="text-[28px] font-black text-[#F0EBE1] leading-none tracking-[-0.03em]">{dayNum}</span>
                            <span className="text-[9px] font-bold text-[#F0EBE1]/70 tracking-[0.16em] uppercase mt-0.5">{monthShort}</span>
                        </div>

                        {/* İşletme + özet */}
                        <div className="flex-1 min-w-0">
                            <p className="text-[10.5px] font-semibold text-[#FF5A1F] uppercase tracking-[0.12em] mb-1.5">
                                {weekday} · {monthYear}
                            </p>
                            <h1 className="text-[22px] font-extrabold text-[#0E0E0E] tracking-[-0.03em] leading-tight truncate">
                                {settings.businessName}
                            </h1>
                            <p className="text-[13.5px] text-[#0E0E0E]/[0.44] mt-1">
                                {remainingToday > 0 ? (
                                    <>
                                        Bugün <span className="font-bold text-[#0E0E0E]">{remainingToday} randevun</span> var
                                        {nextAppt && <> · ilki <span className="font-bold text-[#E8430F]">{nextAppt.startTime}</span>'te</>}
                                        {stats.pending > 0 && <> · {stats.pending} onay bekliyor</>}
                                    </>
                                ) : todayReservations.length > 0 ? (
                                    <>Bugünkü randevuların tamamlandı 🎉</>
                                ) : (
                                    <>Bugün için planlanmış randevu yok</>
                                )}
                            </p>
                        </div>

                        {/* CTA */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <LueraButton onClick={() => navigate('/calendar')} variant="ghost" size="md">
                                Takvimi Gör
                            </LueraButton>
                            <LueraButton onClick={() => navigate('/calendar')} variant="ink" size="md">
                                <Plus className="w-[15px] h-[15px]" />
                                Yeni Randevu
                            </LueraButton>
                        </div>
                    </div>
                </div>

                {/* ── Hatırlatma Güven Şeridi ──────────────────────────────────── */}
                {remindersSent > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <Bell className="w-4 h-4 text-emerald-600" />
                        </div>
                        <p className="text-sm text-emerald-800">
                            <span className="font-bold">{remindersSent} müşteriye</span> otomatik WhatsApp hatırlatması gönderildi — senin yerine sistem hatırlattı ✅
                        </p>
                    </div>
                )}

                {/* ── KPI Kartları (Luera Dashboard v2) ─────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

                    {/* Bugün */}
                    <StatCard
                        label="Bugün"
                        value={stats.today}
                        sublabel="Randevu"
                        compareLabel="Geçen hafta"
                        compareValue={cardData.lastWeekSameDay}
                        trend={compareTrend(stats.today, cardData.lastWeekSameDay)}
                        onClick={() => navigate('/calendar')}
                    >
                        <Sparkline data={cardData.last7} />
                    </StatCard>

                    {/* Onay bekliyor — urgent */}
                    <StatCard
                        label="Bekliyor"
                        value={stats.pending}
                        sublabel="Onay bekliyor"
                        compareLabel="Geçen hafta bekleyen"
                        compareValue={cardData.pendingLastWeek}
                        trend={stats.pending > 0
                            ? { kind: 'warn', text: '↑ işlem gerekli' }
                            : { kind: 'neutral', text: '✓ temiz' }}
                        urgent
                        onClick={() => navigate('/reservations')}
                    >
                        {cardData.weekResCount > 0 ? (
                            <ProgressBar label="Yanıt oranı" pct={cardData.responseRate} urgent />
                        ) : (
                            <div className="mt-[5px] text-[10px]" style={{ fontFamily: MONO, color: 'rgba(14,14,14,0.45)' }}>
                                Bu hafta yanıt bekleyen yok
                            </div>
                        )}
                    </StatCard>

                    {/* Bu hafta */}
                    <StatCard
                        label="Bu hafta"
                        value={cardData.thisWeekTotal}
                        sublabel="Randevu"
                        compareLabel="Geçen hafta"
                        compareValue={cardData.lastWeekTotal}
                        trend={compareTrend(cardData.thisWeekTotal, cardData.lastWeekTotal)}
                        onClick={() => navigate('/analytics')}
                    >
                        <Sparkline data={cardData.thisWeekDaily} activeIndex={cardData.todayIdx} />
                    </StatCard>

                    {/* Tamamlandı */}
                    <StatCard
                        label="Tamamlandı"
                        value={cardData.completedThisMonth}
                        sublabel="Bu ay"
                        compareLabel="Geçen ay"
                        compareValue={cardData.completedLastMonth}
                        trend={compareTrend(cardData.completedThisMonth, cardData.completedLastMonth)}
                        onClick={() => navigate('/analytics')}
                    >
                        <ProgressBar label="Hedef" pct={cardData.goalPct} />
                    </StatCard>

                </div>

                {/* ── Ana İçerik ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Bugünün Programı — ana panel */}
                    <div className="lg:col-span-3 relative overflow-hidden rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_1px_3px_rgba(14,14,14,0.06)]">
                        <div className="px-5 py-4 border-b border-[#0E0E0E]/[0.08] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[#0E0E0E] flex items-center justify-center">
                                    <Clock className="w-4 h-4 text-[#F0EBE1]" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-[#0E0E0E]">{selIsToday ? 'Bugünün Programı' : `${selDateLabel} Programı`}</h2>
                                    <p className="text-[11px] text-[#0E0E0E]/[0.45]">{selectedReservations.length} randevu planlandı</p>
                                </div>
                            </div>
                            <button onClick={() => navigate('/calendar')}
                                className="text-xs font-semibold text-[#FF5A1F] hover:bg-[#FF5A1F]/[0.08] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                Tümünü Gör <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Haftalık şerit */}
                        <div className="flex gap-[3px] px-4 py-3 border-b border-[#0E0E0E]/[0.08] overflow-x-auto">
                            {weekDays.map((d) => {
                                const sel = selectedDate === d.dateStr;
                                return (
                                    <button key={d.dateStr} onClick={() => setSelectedDate(d.dateStr)}
                                        className={cn(
                                            "flex-1 min-w-[38px] flex flex-col items-center gap-1 py-2 px-1 rounded-[10px] transition-all",
                                            sel ? "bg-[#0E0E0E] -translate-y-px shadow-[0_3px_10px_rgba(14,14,14,0.15)]" : "hover:bg-[#F3EDE4]"
                                        )}>
                                        <span className={cn("text-[9px] font-bold uppercase tracking-[0.08em]", sel ? "text-[#F0EBE1]/50" : "text-[#0E0E0E]/[0.45]")}>{d.label}</span>
                                        <span className={cn("text-[14px] font-extrabold leading-none", sel ? "text-[#F0EBE1]" : "text-[#0E0E0E]")}>{d.num}</span>
                                        <span className={cn(
                                            "w-1 h-1 rounded-full",
                                            d.hasEvent ? (sel ? "bg-[#F0EBE1]/60" : "bg-[#FF5A1F]") : "bg-transparent"
                                        )} />
                                    </button>
                                );
                            })}
                        </div>

                        <div className="p-4">
                            {selectedReservations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-16 h-16 rounded-2xl bg-[#F3EDE4] border border-[#0E0E0E]/[0.08] flex items-center justify-center mb-3">
                                        <Calendar className="w-7 h-7 text-[#0E0E0E]/[0.28]" />
                                    </div>
                                    <p className="text-sm font-semibold text-[#0E0E0E] mb-1">{selIsToday ? 'Bugün randevu yok' : `${selDateLabel} randevu yok`}</p>
                                    <LueraButton onClick={() => navigate('/calendar')} variant="accent" size="sm" className="mt-2" style={{ color: '#F3ECE0' }}>
                                        + Randevu oluştur
                                    </LueraButton>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {selectedReservations.map((res) => {
                                        const s = statusConfig[res.status];
                                        const isPast = selIsToday && res.endTime < nowTime;
                                        return (
                                            <div key={res.id}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-xl border transition-all group",
                                                    isPast
                                                        ? "border-[#0E0E0E]/[0.06] bg-[#F3EDE4]/60 opacity-60"
                                                        : "border-[#0E0E0E]/[0.06] hover:border-[#FF5A1F]/40 hover:shadow-sm"
                                                )}
                                            >
                                                <div className="text-center min-w-[48px]">
                                                    <p className="text-sm font-extrabold text-[#0E0E0E] tabular-nums">{res.startTime}</p>
                                                    <p className="text-[10px] text-[#0E0E0E]/[0.45] tabular-nums">{res.endTime}</p>
                                                </div>
                                                <div className="w-1 h-11 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: res.serviceColor || '#FF5A1F' }} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-[#0E0E0E] truncate">{res.customerName}</p>
                                                    <p className="text-xs text-[#0E0E0E]/[0.45] truncate">{res.service}</p>
                                                </div>

                                                {/* Tek-tık aksiyonlar */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {res.customerPhone && (
                                                        <>
                                                            <a
                                                                href={waLink(res.customerPhone)}
                                                                target="_blank" rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                title="WhatsApp'tan yaz"
                                                                className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center text-emerald-600 transition-all hover:scale-105 active:scale-95"
                                                            >
                                                                <MessageCircle className="w-4 h-4" />
                                                            </a>
                                                            <a
                                                                href={`tel:${res.customerPhone.replace(/\s+/g, '')}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                title="Ara"
                                                                className="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 transition-all hover:scale-105 active:scale-95"
                                                            >
                                                                <Phone className="w-4 h-4" />
                                                            </a>
                                                        </>
                                                    )}
                                                    <span className={cn("hidden sm:inline px-2 py-1 rounded-lg text-[10px] font-bold", s.color)}>
                                                        {s.label}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sağ Panel — açık tema */}
                    <div className="lg:col-span-2 flex flex-col gap-4">

                        {/* Yaklaşan Randevular */}
                        <div className="flex-1 relative overflow-hidden rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_1px_3px_rgba(14,14,14,0.06)]">
                            <div className="px-5 py-4 border-b border-[#0E0E0E]/[0.08] flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[#F3EDE4] border border-[#0E0E0E]/[0.08] flex items-center justify-center">
                                    <Calendar className="w-4 h-4 text-[#0E0E0E]" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-[#0E0E0E]">Yaklaşan</h2>
                                    <p className="text-[11px] text-[#0E0E0E]/[0.45]">{upcomingReservations.length} randevu</p>
                                </div>
                            </div>

                            <div className="p-3 space-y-2">
                                {upcomingReservations.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-sm text-[#0E0E0E]/[0.45]">Yaklaşan randevu yok</p>
                                    </div>
                                ) : (
                                    upcomingReservations.map((res) => (
                                        <div key={res.id}
                                            onClick={() => navigate('/reservations')}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#F3EDE4] border border-[#0E0E0E]/[0.06] hover:bg-[#FF5A1F]/[0.07] hover:border-[#FF5A1F]/30 transition-all cursor-pointer">
                                            <div className="w-1.5 h-8 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: res.serviceColor || '#FF5A1F' }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-[#0E0E0E] truncate">{res.customerName}</p>
                                                <p className="text-[11px] text-[#0E0E0E]/[0.45] truncate">{formatDateEU(res.date)} · {res.service}</p>
                                            </div>
                                            <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#FF5A1F]/15 text-[#E8430F] flex-shrink-0 tabular-nums">
                                                {res.startTime}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Haftalık Özet */}
                        <div className="rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
                            <div className="px-5 pt-4 pb-3">
                                <h2 className="text-[13.5px] font-bold text-[#0E0E0E]">Haftalık Özet</h2>
                                <p className="text-[11px] text-[#0E0E0E]/[0.45] mt-0.5">Bu hafta</p>
                            </div>
                            <div className="grid grid-cols-3 border-t border-[#0E0E0E]/[0.08]">
                                <div className="text-center py-3.5 px-3 border-r border-[#0E0E0E]/[0.08]">
                                    <p className="text-[20px] font-black text-[#2D8F32] tracking-[-0.04em]">{weekStats.completed}</p>
                                    <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#2D8F32] mt-0.5">Tamamlandı</p>
                                </div>
                                <div className="text-center py-3.5 px-3 border-r border-[#0E0E0E]/[0.08]">
                                    <p className="text-[20px] font-black text-[#C94040] tracking-[-0.04em]">{weekStats.noShow}</p>
                                    <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#C94040] mt-0.5">İptal</p>
                                </div>
                                <div className="text-center py-3.5 px-3">
                                    <p className="text-[20px] font-black text-[#B87A00] tracking-[-0.04em]">%{weekStats.rate}</p>
                                    <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#B87A00] mt-0.5">Oran</p>
                                </div>
                            </div>
                            <div className="px-[18px] pt-3 pb-4 border-t border-[#0E0E0E]/[0.08]">
                                <div className="flex justify-between text-[11px] font-semibold mb-[7px]">
                                    <span className="text-[#0E0E0E]/[0.45]">Tamamlanma oranı</span>
                                    <span className="text-[#0E0E0E]">%{weekStats.rate}</span>
                                </div>
                                <div className="h-[6px] bg-[#EDE6DB] rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-[#FF5A1F] to-[#FF8052] transition-[width] duration-1000 ease-out"
                                        style={{ width: `${weekStats.rate}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};
