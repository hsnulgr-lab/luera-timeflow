import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { useLabels } from '@/hooks/useLabels';
import { todayISO } from '@/utils/date';
import { T } from '../theme';
import { ThemeToggle } from '../ThemeToggle';
import type { Reservation } from '@/types';

const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function statusMeta(r: Reservation): { label: string; fg: string; bg: string } {
    if (r.status === 'cancelled') return { label: 'İptal', fg: T.muted, bg: T.surface2 };
    if (r.status === 'completed') return { label: 'Tamamlandı', fg: T.green, bg: 'var(--lt-green-bg,rgba(124,196,127,0.14))' };
    const asama = String(r.customFields?.asama || '');
    if (asama === 'Talep Alındı') return { label: 'Talep Alındı', fg: T.blue, bg: 'var(--lt-blue-bg,rgba(107,159,212,0.14))' };
    if (asama === 'Tasarım Bekliyor') return { label: 'Tasarım Bekliyor', fg: T.amber, bg: 'var(--lt-amber-bg,rgba(224,168,78,0.14))' };
    if (asama === 'Onay Bekliyor') return { label: 'Onay Bekliyor', fg: T.purple, bg: 'rgba(201,139,219,.16)' };
    return { label: 'Onaylandı', fg: T.orange, bg: 'rgba(255,90,31,.14)' };
}

// Mobil dövme stüdyosu dashboard yüzü — masaüstü DovmeDashboard ile aynı veri
// sözleşmesi (bkz. src/components/dashboard/DovmeDashboard.tsx).
export const MobileDovmeHome = () => {
    const navigate = useNavigate();
    const { reservations, settings, getTodayReservations } = useReservations();
    const { t } = useLabels();

    const now = useMemo(() => new Date(), []);
    const dateLabel = `${DAY_SHORT[now.getDay()]} · ${now.getDate()} ${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`;
    const today = todayISO();
    const todayList = getTodayReservations();
    const active = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);

    const stats = useMemo(() => {
        const design = active.filter((r) => r.customFields?.asama === 'Tasarım Bekliyor').length;
        const approval = active.filter((r) => r.customFields?.asama === 'Onay Bekliyor').length;
        const deposit = active.reduce((s, r) => s + Number(r.customFields?.kapora_tutari || 0), 0);
        return { today: todayList.length, design, approval, deposit };
    }, [active, todayList]);

    const openCustomer = (r: Reservation) => { if (r.customerId) navigate(`/customers?open=${r.customerId}`); };

    return (
        <div style={{ color: T.ink, paddingBottom: 24 }}>
            {/* Header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div>
                    <div style={{ fontSize: 11, color: T.muted2, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono }}>{dateLabel}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 2 }}>{settings.businessName || 'Dövme Stüdyo'}</div>
                </div>
                <ThemeToggle size={44} />
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, padding: '14px 22px 0' }}>
                {[
                    { v: stats.today, l: 'Bugün' },
                    { v: stats.design, l: 'Tasarım Bekleyen', c: T.amber },
                    { v: stats.approval, l: 'Onay Bekleyen', c: T.purple },
                    { v: `${stats.deposit.toLocaleString('tr-TR')}₺`, l: 'Alınan Kapora', c: T.green },
                ].map((s, i) => (
                    <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '12px 10px' }}>
                        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: s.c || T.ink }}>{s.v}</div>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginTop: 2 }}>{s.l}</div>
                    </div>
                ))}
            </div>

            {/* Today appointments */}
            <div style={{ padding: '20px 22px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>Bugünün {t('reservations')}</span>
                <button onClick={() => navigate('/calendar')} style={{ fontSize: 12, fontWeight: 700, color: T.orange }}>Takvime Git →</button>
            </div>
            <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todayList.length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: T.muted2, fontSize: 12 }}>Bugün için {t('reservation').toLowerCase()} yok</div>
                )}
                {todayList.map((r) => {
                    const meta = statusMeta(r);
                    const tarz = r.customFields?.tarz ? String(r.customFields.tarz) : '';
                    const bolge = r.customFields?.bolge ? String(r.customFields.bolge) : '';
                    return (
                        <div key={r.id} onClick={() => openCustomer(r)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16 }}>
                            <div style={{ width: 44, flexShrink: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 800 }}>{r.startTime}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customerName}</div>
                                <div style={{ fontSize: 11, color: T.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {[r.staffName, tarz, bolge].filter(Boolean).join(' · ')}
                                </div>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 999, color: meta.fg, background: meta.bg, flexShrink: 0 }}>{meta.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
