import { useMemo, useState } from 'react';
import { Sparkles, ChevronDown, Heart, CalendarPlus, ArrowRight, TrendingUp, UserPlus, BarChart2, X } from 'lucide-react';
import { useInsight } from '@/hooks/useInsight';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { AiMessageModal, type MsgTarget } from './AiMessageModal';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { todayISO, toISODate } from '@/utils/date';
import { useNavigate } from 'react-router-dom';

const RISK_DAYS = 30;
const ENGAGED_DAYS = 90;
const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Parse **bold** markdown; time patterns (HH:MM) get orange
function RichText({ text, ink, muted, orange }: { text: string; ink: string; muted: string; orange: string }) {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;
    while (remaining.length > 0) {
        const boldStart = remaining.indexOf('**');
        if (boldStart === -1) {
            parts.push(<span key={key++} style={{ color: muted }}>{remaining}</span>);
            break;
        }
        if (boldStart > 0) parts.push(<span key={key++} style={{ color: muted }}>{remaining.slice(0, boldStart)}</span>);
        const boldEnd = remaining.indexOf('**', boldStart + 2);
        if (boldEnd === -1) {
            parts.push(<span key={key++} style={{ color: muted }}>{remaining.slice(boldStart)}</span>);
            break;
        }
        const content = remaining.slice(boldStart + 2, boldEnd);
        const isTimeRef = /\d{1,2}:\d{2}/.test(content);
        parts.push(<strong key={key++} style={{ color: isTimeRef ? orange : ink, fontWeight: 700 }}>{content}</strong>);
        remaining = remaining.slice(boldEnd + 2);
    }
    return <>{parts}</>;
}

export function AiAssistant() {
    const { dark } = useTheme();
    const navigate = useNavigate();
    const { insight, loading: insightLoading } = useInsight();
    const { allCustomers } = useCustomers();
    const { reservations, settings, orgId } = useReservations();

    const [open, setOpen] = useState(false);
    const [modal, setModal] = useState<null | 'winback' | 'campaign'>(null);

    // Theme tokens
    const T = {
        ink:     dark ? '#F3EDE3'                      : '#0E0E0E',
        muted:   dark ? 'rgba(243,237,227,0.55)'       : 'rgba(14,14,14,0.50)',
        muted2:  dark ? 'rgba(243,237,227,0.35)'       : 'rgba(14,14,14,0.32)',
        surface: dark ? '#141209'                      : '#FFFFFF',
        surface2:dark ? 'rgba(243,237,227,0.04)'       : '#F3EDE4',
        surface3:dark ? 'rgba(243,237,227,0.065)'      : '#EDE6DB',
        border:  dark ? 'rgba(243,237,227,0.09)'       : 'rgba(14,14,14,0.08)',
        border2: dark ? 'rgba(243,237,227,0.18)'       : 'rgba(14,14,14,0.12)',
        orange:  '#FF5A1F',
        green:   dark ? '#86EFAC'                      : '#16a34a',
        amber:   dark ? '#fbbf24'                      : '#d97706',
        blue:    dark ? '#93C5FD'                      : '#2563eb',
        purple:  dark ? '#D8B4FE'                      : '#7c3aed',
        btnHover:dark ? 'rgba(243,237,227,0.06)'       : 'rgba(14,14,14,0.05)',
    };

    const today = todayISO();

    // Week bounds (Mon–Sun)
    const { weekStart, prevWeekStart } = useMemo(() => {
        const d = new Date(today + 'T12:00:00');
        const dow = (d.getDay() + 6) % 7;
        const ws = new Date(d); ws.setDate(d.getDate() - dow);
        const pw = new Date(ws); pw.setDate(ws.getDate() - 7);
        return { weekStart: ws, prevWeekStart: pw };
    }, [today]);

    const weekEnd   = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);
    const prevWeekEnd = useMemo(() => { const d = new Date(prevWeekStart); d.setDate(d.getDate() + 7); return d; }, [prevWeekStart]);

    // Saturday of current week
    const satISO = useMemo(() => {
        const d = new Date(weekStart); d.setDate(d.getDate() + 5); return toISODate(d);
    }, [weekStart]);

    // Month label
    const monthLabel = useMemo(() => {
        const d = new Date(weekStart);
        return `${MONTHS_TR[d.getMonth()]} ${d.getFullYear()} Özeti`;
    }, [weekStart]);

    // Stats
    const { weekCount, prevWeekCount, estRevenue, satFree, occupancy } = useMemo(() => {
        let weekCount = 0, prevCount = 0, revenue = 0;
        for (const r of reservations) {
            if (r.status === 'cancelled') continue;
            const d = new Date(r.date + 'T12:00:00');
            if (d >= weekStart && d < weekEnd) {
                weekCount++;
                const svc = settings.services.find(s => s.name === r.service);
                revenue += svc?.price ?? (svc?.duration ? Math.round(svc.duration * 3.5) : 150);
            }
            if (d >= prevWeekStart && d < prevWeekEnd) prevCount++;
        }
        const satBooked = reservations.filter(r => r.date === satISO && r.status !== 'cancelled').length;
        const satFree = Math.max(0, 8 - satBooked);
        const occupancy = Math.min(100, Math.round((weekCount / (7 * 8)) * 100));
        return { weekCount, prevWeekCount: prevCount, estRevenue: revenue, satFree, occupancy };
    }, [reservations, settings.services, weekStart, weekEnd, prevWeekStart, prevWeekEnd, satISO]);

    const pctChange = prevWeekCount > 0 ? Math.round(((weekCount - prevWeekCount) / prevWeekCount) * 100) : null;

    // Format revenue
    const revenueLabel = estRevenue >= 1000
        ? `₺${(estRevenue / 1000).toFixed(1).replace('.0', '')}K`
        : `₺${estRevenue}`;

    // Müşteri hedefleri
    const { winback, campaign } = useMemo(() => {
        const now = Date.now();
        const base = allCustomers
            .filter(c => c.phone && c.lastVisit && c.totalReservations > 0)
            .map<MsgTarget>(c => ({
                id: c.id, name: c.name, phone: c.phone,
                days: Math.floor((now - new Date(c.lastVisit!).getTime()) / 86_400_000),
            }));
        return {
            winback: base.filter(c => c.days >= RISK_DAYS).sort((a, b) => b.days - a.days),
            campaign: base.filter(c => c.days <= ENGAGED_DAYS).sort((a, b) => a.days - b.days).slice(0, 15),
        };
    }, [allCustomers]);

    // Sakin gün
    const quietDay = useMemo(() => {
        const now = Date.now();
        const counts = new Array(7).fill(0);
        let any = false;
        for (const r of reservations) {
            if (r.status === 'cancelled') continue;
            const t = new Date(r.date + 'T12:00:00').getTime();
            if (now - t > 30 * 86_400_000) continue;
            counts[new Date(r.date + 'T12:00:00').getDay()]++;
            any = true;
        }
        if (!any) return 'Pazartesi';
        let minDay = 1, minVal = Infinity;
        for (let d = 1; d <= 6; d++) if (counts[d] < minVal) { minVal = counts[d]; minDay = d; }
        return DAYS_TR[minDay];
    }, [reservations]);

    const hasData = weekCount > 0 || (insight && !insightLoading);
    if (!hasData && !insightLoading && winback.length === 0 && campaign.length === 0) return null;

    // Stat tiles config
    const stats = [
        {
            value: String(weekCount),
            badge: pctChange !== null ? `↑${Math.abs(pctChange)}%` : null,
            badgeUp: pctChange !== null && pctChange >= 0,
            label: 'Bu hafta randevu',
        },
        {
            value: revenueLabel,
            badge: null,
            label: 'Tahmini gelir',
        },
        {
            value: `${occupancy}%`,
            badge: 'dolu',
            badgeUp: occupancy >= 60,
            label: 'Doluluk oranı',
        },
        {
            value: String(satFree),
            badge: 'boş',
            badgeUp: false,
            label: 'Cumartesi slotu',
        },
    ];

    // Quick action tiles
    const actions = [
        {
            label: 'Cumartesi doldur',
            sub: `${campaign.length > 0 ? campaign.length : satFree} slota hatırlatma gönder`,
            icon: <CalendarPlus className="w-4 h-4" />,
            iconBg: dark ? 'rgba(255,90,31,0.15)' : 'rgba(255,90,31,0.10)',
            iconBorder: dark ? 'rgba(255,90,31,0.25)' : 'rgba(255,90,31,0.15)',
            iconColor: T.orange,
            onClick: () => { setModal('campaign'); setOpen(false); },
            disabled: campaign.length === 0,
        },
        {
            label: 'Müşteri geri kazan',
            sub: winback.length > 0 ? `${winback.length} müşteri ${RISK_DAYS}+ gündür uğramadı` : 'Kayıp müşteri yok',
            icon: <Heart className="w-4 h-4" />,
            iconBg: dark ? 'rgba(244,63,94,0.15)' : 'rgba(244,63,94,0.10)',
            iconBorder: dark ? 'rgba(244,63,94,0.25)' : 'rgba(244,63,94,0.15)',
            iconColor: '#f43f5e',
            onClick: () => { setModal('winback'); setOpen(false); },
            disabled: winback.length === 0,
        },
        {
            label: 'Rapor oluştur',
            sub: `${MONTHS_TR[new Date(today + 'T12:00:00').getMonth()]} performansı`,
            icon: <BarChart2 className="w-4 h-4" />,
            iconBg: dark ? 'rgba(74,222,128,0.12)' : 'rgba(22,163,74,0.10)',
            iconBorder: dark ? 'rgba(74,222,128,0.22)' : 'rgba(22,163,74,0.15)',
            iconColor: T.green,
            onClick: () => { navigate('/analytics'); setOpen(false); },
        },
        {
            label: 'Tahmin gör',
            sub: `${MONTHS_TR[(new Date(today + 'T12:00:00').getMonth() + 1) % 12]} ${new Date(today + 'T12:00:00').getFullYear()} öngörüsü`,
            icon: <TrendingUp className="w-4 h-4" />,
            iconBg: dark ? 'rgba(192,132,252,0.12)' : 'rgba(124,58,237,0.10)',
            iconBorder: dark ? 'rgba(192,132,252,0.22)' : 'rgba(124,58,237,0.15)',
            iconColor: T.purple,
            onClick: () => { navigate('/analytics'); setOpen(false); },
        },
    ];

    return (
        <>
            <div className="relative min-w-0 flex-1">
                <button
                    onClick={() => setOpen(o => !o)}
                    className="group flex items-center gap-2.5 w-full min-w-0 pl-1 pr-2.5 py-1 rounded-full transition-all"
                    style={{ background: open ? (dark ? 'rgba(243,237,227,0.06)' : 'rgba(14,14,14,0.05)') : 'transparent' }}
                    onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = dark ? 'rgba(243,237,227,0.04)' : 'rgba(14,14,14,0.03)'; }}
                    onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
                >
                    <span className="flex items-center gap-1.5 text-[9.5px] font-extrabold tracking-[0.1em] px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ background: T.ink, color: dark ? '#0E0E0E' : '#F3EDE3' }}>
                        <Sparkles className="w-2.5 h-2.5 opacity-85" />
                        AI
                    </span>
                    {insightLoading && !insight ? (
                        <span className="h-2.5 w-32 rounded-full animate-pulse" style={{ background: dark ? 'rgba(243,237,227,0.10)' : 'rgba(14,14,14,0.10)' }} />
                    ) : (
                        <span className="text-[12.5px] truncate" style={{ color: T.muted }}>{insight ?? 'AI Asistan'}</span>
                    )}
                    <ChevronDown className={cn("w-3.5 h-3.5 flex-shrink-0 transition-transform", open && "rotate-180")} style={{ color: T.muted2 }} />
                </button>

                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <div
                            className="absolute top-full z-50 left-0 mt-2 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
                            style={{
                                width: 460,
                                maxWidth: '92vw',
                                background: T.surface,
                                border: `1px solid ${T.border}`,
                                borderRadius: 18,
                                boxShadow: dark
                                    ? '0 0 0 1px rgba(255,90,31,0.06), 0 24px 64px rgba(0,0,0,0.90), 0 8px 24px rgba(0,0,0,0.60), 0 0 80px rgba(255,90,31,0.04)'
                                    : '0 8px 40px rgba(14,14,14,0.14), 0 2px 8px rgba(14,14,14,0.07)',
                            }}
                        >
                            {/* Ambient glow blob — dark only */}
                            {dark && (
                                <div style={{
                                    position: 'absolute', top: -40, left: -40,
                                    width: 220, height: 160, pointerEvents: 'none', zIndex: 0,
                                    background: 'radial-gradient(ellipse, rgba(255,90,31,0.12) 0%, transparent 70%)',
                                }} />
                            )}
                            <div style={{ position: 'relative', zIndex: 1, borderTop: dark ? '1.5px solid rgba(255,90,31,0.35)' : 'none' }}>
                            {/* Header */}
                            <div className="flex items-start justify-between" style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${T.border}` }}>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center flex-shrink-0" style={{
                                        width: 36, height: 36, borderRadius: 11,
                                        background: dark ? 'linear-gradient(135deg, rgba(255,90,31,0.22) 0%, rgba(255,90,31,0.06) 100%)' : 'rgba(255,90,31,0.12)',
                                        border: dark ? '1px solid rgba(255,90,31,0.30)' : '1px solid rgba(255,90,31,0.15)',
                                        boxShadow: dark ? '0 0 16px rgba(255,90,31,0.20)' : 'none',
                                        color: T.orange,
                                    }}>
                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M9 2l1.8 4.2L15 7.5l-3.15 3.1.75 4.4L9 12.8l-3.6 2.2.75-4.4L3 7.5l4.2-.3L9 2z"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.orange }}>AI İçgörüsü</p>
                                        <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.022em', color: T.ink, marginTop: 2 }}>{monthLabel}</p>
                                    </div>
                                </div>
                                <button onClick={() => setOpen(false)} className="transition-all" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted2, background: 'transparent', border: 'none', cursor: 'pointer' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.color = T.ink; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted2; }}>
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Stats row */}
                            <div className="flex gap-2" style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
                                {stats.map((s, i) => (
                                    <div key={i} style={{
                                        flex: '1 1 80px', minWidth: 80,
                                        background: dark ? 'rgba(243,237,227,0.04)' : '#F3EDE4',
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 12, padding: '11px 14px',
                                    }}>
                                        <div className="flex items-baseline gap-1.5" style={{ marginBottom: 4 }}>
                                            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.05em', color: T.ink, lineHeight: 1 }}>{s.value}</span>
                                            {s.badge && (
                                                <span style={{
                                                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.02em',
                                                    color: s.badgeUp ? T.green : T.muted,
                                                    background: s.badgeUp
                                                        ? (dark ? 'rgba(74,222,128,0.14)' : 'rgba(22,163,74,0.10)')
                                                        : (dark ? 'rgba(243,237,227,0.08)' : 'rgba(14,14,14,0.07)'),
                                                    padding: '2px 5px', borderRadius: 999,
                                                }}>
                                                    {s.badge}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: 10.5, color: T.muted, fontWeight: 600 }}>{s.label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Insight text */}
                            {(insight || insightLoading) && (
                                <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${T.border}` }}>
                                    {insightLoading && !insight ? (
                                        <div className="space-y-2">
                                            {[80, 100, 64].map((w, i) => (
                                                <div key={i} className="h-3 rounded-full animate-pulse" style={{ width: `${w}%`, background: dark ? 'rgba(243,237,227,0.08)' : 'rgba(14,14,14,0.07)' }} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
                                            <RichText text={insight!} ink={T.ink} muted={T.muted} orange={T.orange} />
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Action grid */}
                            <div className="grid grid-cols-2" style={{ padding: '10px 12px 12px', gap: 6 }}>
                                {actions.map((a, i) => (
                                    <button
                                        key={i}
                                        onClick={a.onClick}
                                        disabled={a.disabled}
                                        className="flex items-center gap-3 text-left transition-all rounded-xl"
                                        style={{
                                            padding: '11px 13px',
                                            background: T.surface2,
                                            border: `1px solid ${T.border}`,
                                            opacity: a.disabled ? 0.4 : 1,
                                            cursor: a.disabled ? 'default' : 'pointer',
                                        }}
                                        onMouseEnter={(e) => { if (!a.disabled) { e.currentTarget.style.background = T.surface3; e.currentTarget.style.borderColor = T.border2; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; } }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.borderColor = T.border; (e.currentTarget as HTMLElement).style.transform = ''; }}
                                    >
                                        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 9, background: a.iconBg, border: `1px solid ${a.iconBorder ?? 'transparent'}`, color: a.iconColor }}>
                                            {a.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>{a.label}</p>
                                            <p style={{ fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.3 }} className="truncate">{a.sub}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            </div>{/* inner z-1 wrapper */}
                        </div>
                    </>
                )}
            </div>

            <AiMessageModal
                mode="winback"
                open={modal === 'winback'}
                onClose={() => setModal(null)}
                orgId={orgId}
                whatsappInstance={settings.whatsappInstance}
                targets={winback}
            />
            <AiMessageModal
                mode="campaign"
                open={modal === 'campaign'}
                onClose={() => setModal(null)}
                orgId={orgId}
                whatsappInstance={settings.whatsappInstance}
                targets={campaign}
                context={`${quietDay} günü`}
            />
        </>
    );
}
