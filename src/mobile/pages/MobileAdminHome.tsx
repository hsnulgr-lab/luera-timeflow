import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useManagerMode } from '@/contexts/ManagerModeProvider';
import { useModules } from '@/hooks/useModules';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { toISODate } from '@/utils/date';
import { ThemeToggle } from '../ThemeToggle';
import { T } from '../theme';

function useTicker(target: number, dur = 900, delay = 200) {
    const [v, setV] = useState(0);
    useEffect(() => {
        const id = setTimeout(() => {
            let start: number | undefined, raf: number;
            const tick = (now: number) => {
                if (!start) start = now;
                const p = Math.min((now - start) / dur, 1);
                setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
                if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            return () => cancelAnimationFrame(raf);
        }, delay);
        return () => clearTimeout(id);
    }, [target, dur, delay]);
    return v;
}

const fmt = (n: number) => n.toLocaleString('tr-TR');
const PM_TR: Record<string, string> = { cash: 'Nakit', card: 'Kart', transfer: 'Havale', other: 'Diğer' };

export const MobileAdminHome = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { reservations, settings, getTodayReservations, updateReservation } = useReservations();
    const { payments, stats } = usePayments();
    const { allCustomers } = useCustomers();
    const { staff } = useStaff();
    const { disable: exitManager } = useManagerMode();
    const { isEnabled } = useModules();
    const setup = useSetupStatus();
    const [setupDismissed, setSetupDismissed] = useState(() => { try { return localStorage.getItem('luera_setup_dismissed') === '1'; } catch { return false; } });
    const dismissSetup = () => { try { localStorage.setItem('luera_setup_dismissed', '1'); } catch { /* yoksay */ } setSetupDismissed(true); };

    const totalRev = useTicker(stats.total, 1200, 200);
    const monthRev = useTicker(stats.month, 900, 300);

    const todayStr = useMemo(() => toISODate(new Date()), []);
    const todayList = getTodayReservations();
    const todayActive = todayList.filter((r) => r.status !== 'cancelled');

    const pending = useMemo(
        () => reservations.filter((r) => r.status === 'pending' && r.date >= todayStr).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 4),
        [reservations, todayStr]
    );

    const activeStaff = staff.filter((s) => s.isActive).length;
    const todayCustomers = new Set(todayActive.map((r) => r.customerName)).size;
    const todayCancelled = todayList.filter((r) => r.status === 'cancelled').length;

    // Son aktivite — son tahsilatlar + bugün tamamlanan/iptal
    const activity = useMemo(() => {
        const items: { icon: string; c: string; bg: string; txt: string; sub: string; t: string }[] = [];
        payments.slice().sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, 3).forEach((p) => {
            items.push({ icon: '₺', c: T.orange, bg: 'rgba(255,90,31,.12)', txt: 'Tahsilat alındı', sub: `${PM_TR[p.method] || p.method} · ₺${fmt(p.amount)}`, t: new Date(p.paidAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) });
        });
        todayList.filter((r) => r.status === 'completed').slice(0, 2).forEach((r) => {
            items.push({ icon: '✓', c: T.green, bg: 'rgba(124,196,127,.12)', txt: `${r.customerName} tamamlandı`, sub: `${r.startTime} · ${r.service}`, t: r.startTime });
        });
        return items.slice(0, 4);
    }, [payments, todayList]);

    const MGMT = [
        ...(isEnabled('sira') ? [{ lbl: 'Sıra', clr: T.amber, bg: 'rgba(224,168,78,.13)', path: 'M7 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5ZM2 18c0-2.5 2.2-4.5 5-4.5M13 6a2.5 2.5 0 010 5M18 18c0-2.5-1.5-4.3-4-4.5', badge: null, to: '/queue' }] : []),
        { lbl: 'Personel', clr: T.purple, bg: 'rgba(201,139,219,.13)', path: 'M10 9a3 3 0 100-6 3 3 0 000 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5', badge: activeStaff || null, to: '/staff' },
        { lbl: 'Müşteriler', clr: T.blue, bg: 'rgba(107,159,212,.13)', path: 'M10 8a3 3 0 100-6 3 3 0 000 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5', badge: allCustomers.length || null, to: '/customers' },
        { lbl: 'Hizmetler', clr: T.amber, bg: 'rgba(224,168,78,.13)', path: 'M3 6h14M3 10h14M3 14h8', badge: settings.services.length || null, to: '/settings?tab=services' },
        { lbl: 'Çalışma Saat.', clr: T.green, bg: 'rgba(124,196,127,.13)', path: 'M10 6v4l3 3M10 2a8 8 0 100 16A8 8 0 0010 2', badge: null, to: '/settings?tab=hours' },
        { lbl: 'Analiz', clr: T.orange, bg: 'rgba(255,90,31,.13)', path: 'M3 15V9M8 15V5M13 15v-5M3 15h14', badge: null, to: '/analytics' },
        { lbl: 'Ayarlar', clr: T.muted, bg: T.surface3, path: 'M10 13a3 3 0 100-6 3 3 0 000 6ZM10 3v1M10 16v1M3 10h1M16 10h1M5.4 5.4l.7.7M13.9 13.9l.7.7M5.4 14.6l.7-.7M13.9 6.1l.7-.7', badge: null, to: '/settings' },
    ] as const;

    return (
        <div style={{ color: T.ink, paddingBottom: 16 }}>
            {/* Header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: 'linear-gradient(135deg,#C98BDB,#9B5FB8)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{(user?.name || 'Y').charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.025em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Yönetici'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <div style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(255,90,31,.13)', border: '1px solid rgba(255,90,31,.25)', fontSize: 10, fontWeight: 800, color: T.orange }}>YÖNETİCİ</div>
                        <span style={{ fontSize: 10.5, color: T.muted, fontFamily: T.mono }}>Tam Erişim</span>
                    </div>
                </div>
                <ThemeToggle />
                <button onClick={exitManager} aria-label="Yönetici modundan çık" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, cursor: 'pointer' }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
            </div>

            {/* Kurulum checklist (tamamlanana kadar) */}
            {setup.ready && !setup.complete && !setupDismissed && (
                <div style={{ margin: '16px 22px 0', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 15 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,90,31,.13)', display: 'grid', placeItems: 'center' }}>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 5.4L20 8l-4 4 1 6-5-2.8L7 18l1-6-4-4 5.6-.6L12 2Z" stroke={T.orange} strokeWidth="1.6" strokeLinejoin="round" /></svg>
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 850, letterSpacing: '-0.02em' }}>Kurulumu tamamla</div>
                                <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, marginTop: 1 }}>{setup.doneCount}/{setup.total} adım</div>
                            </div>
                        </div>
                        <button onClick={dismissSetup} aria-label="Gizle" style={{ width: 30, height: 30, borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted2, cursor: 'pointer' }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                        </button>
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: T.surface3, overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{ height: '100%', width: `${(setup.doneCount / setup.total) * 100}%`, background: T.orange, borderRadius: 999 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {setup.steps.map((s) => (
                            <button key={s.id} onClick={() => !s.done && navigate(s.to)} disabled={s.done}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: s.done ? 'transparent' : T.surface2, border: `1px solid ${T.border}`, cursor: s.done ? 'default' : 'pointer', textAlign: 'left' }}>
                                <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: s.done ? T.green : 'transparent', border: s.done ? 'none' : `1.5px solid ${T.border2}` }}>
                                    {s.done && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#0E0E0E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </span>
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: s.done ? T.muted : T.ink, textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
                                {!s.done && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: T.orange }}>Ayarla →</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Revenue hero */}
            <div style={{ margin: '16px 22px 0', background: 'linear-gradient(145deg,#2A1C10,#1C1710)', border: '1px solid rgba(255,90,31,.18)', borderRadius: 22, padding: 18, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: '50%', border: '1px solid rgba(255,90,31,.08)', pointerEvents: 'none' }} />
                <div style={{ fontSize: 10.5, color: 'rgba(255,90,31,.7)', fontWeight: 750, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 10 }}>Toplam Gelir</div>
                <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>{fmt(totalRev)} <span style={{ fontSize: 22, color: T.muted }}>₺</span></div>
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                    {[
                        { lbl: 'Bu Ay', val: `${fmt(monthRev)}₺`, clr: T.green, a: 'left' as const },
                        { lbl: 'Bu Hafta', val: `${fmt(stats.week)}₺`, clr: T.ink, a: 'center' as const },
                        { lbl: 'Bugün', val: `${fmt(stats.today)}₺`, clr: T.orange, a: 'right' as const },
                    ].map((s) => (
                        <div key={s.lbl} style={{ textAlign: s.a }}>
                            <div style={{ fontSize: 9.5, color: T.muted, fontFamily: T.mono, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{s.lbl}</div>
                            <div style={{ fontSize: 16, fontWeight: 850, letterSpacing: '-0.03em', color: s.clr }}>{s.val}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pending approvals */}
            {pending.length > 0 && (
                <div style={{ margin: '16px 22px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em' }}>Onay Bekliyor</div>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: T.orange, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900, color: '#0E0E0E' }}>{pending.length}</div>
                        </div>
                        <div onClick={() => navigate('/reservations')} style={{ fontSize: 12, fontWeight: 750, color: T.orange, cursor: 'pointer' }}>Tümü →</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {pending.map((p) => (
                            <div key={p.id} style={{ background: T.surface, border: '1px solid rgba(224,168,78,.18)', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(224,168,78,.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                    <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke={T.amber} strokeWidth="1.5" /><path d="M2.5 7.5h15M6.5 1.5v3M13.5 1.5v3" stroke={T.amber} strokeWidth="1.5" strokeLinecap="round" /></svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.customerName}</div>
                                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{p.service} · {p.startTime}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 7 }}>
                                    <button onClick={() => updateReservation(p.id, { status: 'confirmed' })} style={{ height: 32, padding: '0 12px', borderRadius: 9, background: T.orange, color: '#0E0E0E', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer' }}>✓</button>
                                    <button onClick={() => updateReservation(p.id, { status: 'cancelled' })} style={{ height: 32, padding: '0 12px', borderRadius: 9, background: 'rgba(224,112,112,.12)', color: '#E07070', fontSize: 13, fontWeight: 800, border: '1px solid rgba(224,112,112,.2)', cursor: 'pointer' }}>✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Management grid */}
            <div style={{ padding: '18px 22px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em', marginBottom: 13 }}>Yönetim</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
                    {MGMT.map((m) => (
                        <button key={m.lbl} onClick={() => navigate(m.to)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '16px 6px 14px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, cursor: 'pointer', position: 'relative' }}>
                            {m.badge && <div style={{ position: 'absolute', top: 8, right: 8, minWidth: 18, height: 18, borderRadius: 999, background: T.orange, display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 900, color: '#0E0E0E', padding: '0 4px' }}>{m.badge}</div>}
                            <div style={{ width: 44, height: 44, borderRadius: 14, background: m.bg, display: 'grid', placeItems: 'center' }}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d={m.path} stroke={m.clr} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, textAlign: 'center', lineHeight: 1.3 }}>{m.lbl}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Today stats */}
            <div style={{ padding: '18px 22px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
                {[
                    { lbl: 'Randevu', val: String(todayActive.length), clr: T.orange },
                    { lbl: 'Müşteri', val: String(todayCustomers), clr: T.blue },
                    { lbl: 'İptal', val: String(todayCancelled), clr: '#E07070' },
                ].map((s) => (
                    <div key={s.lbl} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15, padding: '13px 12px 11px' }}>
                        <div style={{ fontSize: 9.5, color: T.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 7 }}>{s.lbl}</div>
                        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: s.clr, lineHeight: 1 }}>{s.val}</div>
                    </div>
                ))}
            </div>

            {/* Recent activity */}
            {activity.length > 0 && (
                <div style={{ padding: '18px 22px 0' }}>
                    <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em', marginBottom: 12 }}>Son Aktivite</div>
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
                        {activity.map((a, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < activity.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 11, background: a.bg, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: a.c, flexShrink: 0 }}>{a.icon}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.txt}</div>
                                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{a.sub}</div>
                                </div>
                                <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: T.mono, flexShrink: 0 }}>{a.t}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
