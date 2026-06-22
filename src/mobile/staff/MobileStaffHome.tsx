import { useMemo } from 'react';
import { LogOut, CheckCircle2, Wallet, Calendar, ShoppingBag } from 'lucide-react';
import { useStaffSession } from '@/contexts/StaffSessionProvider';
import { useStaffStats } from '@/hooks/useStaffStats';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { toISODate, formatDateEU } from '@/utils/date';
import { T, STS_COLOR, STS_BG, STS_LABEL } from '../theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const MONO = "'JetBrains Mono', monospace";
const PM_TR: Record<string, string> = { cash: 'Nakit', card: 'Kart', transfer: 'Havale', other: 'Diğer' };

export const MobileStaffHome = () => {
    const { staff, logout } = useStaffSession();
    const stats = useStaffStats(staff?.id, staff?.name);
    const { payments } = usePayments();
    const { getReservationsByDate } = useReservations();

    const todayStr = useMemo(() => toISODate(new Date()), []);
    const myToday = useMemo(
        () => getReservationsByDate(todayStr).filter((r) => r.staffId === staff?.id && r.status !== 'cancelled').sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, todayStr, staff?.id]
    );

    // Kendi satışları (payments.staff_id)
    const mySales = useMemo(
        () => payments.filter((p) => p.staffId === staff?.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
        [payments, staff?.id]
    );
    const salesTotal = mySales.reduce((s, p) => s + p.amount, 0);
    const color = staff?.color || T.orange;

    return (
        <div style={{ minHeight: '100dvh', background: T.bg, color: T.ink, fontFamily: T.font, paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)' }}>
            {/* Üst bar */}
            <div style={{ padding: '14px 22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 'calc(env(safe-area-inset-top,0px) + 14px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 42, height: 42, borderRadius: '50%', background: color, display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 800, color: '#0E0E0E' }}>{(staff?.name || '?').charAt(0).toUpperCase()}</span>
                    <div>
                        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: T.muted, fontFamily: MONO }}>PERSONEL MODU</p>
                        <h1 style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.02em' }}>{staff?.name}</h1>
                    </div>
                </div>
                <button onClick={logout} aria-label="Çıkış" style={{ width: 40, height: 40, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, cursor: 'pointer' }}>
                    <LogOut size={17} />
                </button>
            </div>

            {/* KPI'lar */}
            <div style={{ padding: '18px 22px 0', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                <Kpi icon={<Calendar size={14} />} label="Bugün" value={String(myToday.length)} sub="randevu" />
                <Kpi icon={<CheckCircle2 size={14} />} label="Tamamlanan" value={String(stats.completed)} sub="toplam" color={T.green} />
                <Kpi icon={<Wallet size={14} />} label="Ciro" value={`₺${fmt(stats.revenue)}`} sub="hizmet" color={T.green} />
                <Kpi icon={<ShoppingBag size={14} />} label="Satışlarım" value={`₺${fmt(salesTotal)}`} sub={`${mySales.length} işlem`} color={T.green} />
            </div>

            {/* Bugünkü randevularım */}
            <div style={{ padding: '24px 22px 0' }}>
                <h2 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12 }}>Bugünkü Randevularım</h2>
                {myToday.length === 0 ? (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 22, textAlign: 'center', color: T.muted, fontSize: 13 }}>Bugün randevun yok</div>
                ) : (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
                        {myToday.map((r, i) => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', borderBottom: i < myToday.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ width: 4, alignSelf: 'stretch', background: r.serviceColor || color }} />
                                <div style={{ flex: 1, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 46, flexShrink: 0 }}>
                                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{r.startTime}</div>
                                        <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.muted2 }}>{r.endTime}</div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{r.service}</div>
                                    </div>
                                    <span style={{ padding: '3px 8px', borderRadius: 999, background: STS_BG[r.status], color: STS_COLOR[r.status], fontSize: 9.5, fontWeight: 750 }}>{STS_LABEL[r.status]}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Hizmet dağılımım */}
            {stats.services.length > 0 && (
                <div style={{ padding: '22px 22px 0' }}>
                    <h2 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12 }}>Sattığım Hizmetler</h2>
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {stats.services.map((s) => (
                            <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                <span style={{ fontSize: 12, color: T.muted, fontFamily: MONO }}>{s.count}×</span>
                                <span style={{ fontSize: 13.5, fontWeight: 800, color: T.green, minWidth: 64, textAlign: 'right' }}>₺{fmt(s.revenue)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Satışlarım */}
            {mySales.length > 0 && (
                <div style={{ padding: '22px 22px 0' }}>
                    <h2 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12 }}>Satışlarım</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {mySales.slice(0, 15).map((p) => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '11px 14px' }}>
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description || (p.type === 'product' ? 'Ürün' : 'Tahsilat')}</p>
                                    <p style={{ fontSize: 11, color: T.muted, fontFamily: MONO }}>{PM_TR[p.method] || p.method} · {formatDateEU(p.paidAt.slice(0, 10))}</p>
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 900, color: T.green }}>+₺{fmt(p.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color?: string }) {
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.muted, marginBottom: 8 }}>
                {icon}
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: MONO }}>{label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: color || T.ink }}>{value}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>
        </div>
    );
}
