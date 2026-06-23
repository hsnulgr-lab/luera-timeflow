import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useManagerMode } from '@/contexts/ManagerModeProvider';
import { toISODate } from '@/utils/date';
import type { Reservation } from '@/types';
import { T, STS_COLOR, STS_BG, STS_LABEL, avatarColor } from '../theme';

// Ease-out sayaç animasyonu (handoff useTicker)
function useTicker(target: number, dur = 800, delay = 200) {
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

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmt = (n: number) => n.toLocaleString('tr-TR');

export const MobileHome = () => {
    const navigate = useNavigate();
    const { reservations, settings, getTodayReservations } = useReservations();
    const { payments } = usePayments();
    const { allCustomers } = useCustomers();
    const { staff } = useStaff();
    const { isManager, disable: exitManager } = useManagerMode();

    const now = useMemo(() => new Date(), []);
    const todayStr = toISODate(now);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const todayList = getTodayReservations();
    const active = todayList.filter((r) => r.status !== 'cancelled');
    const total = active.length;
    const done = active.filter((r) => r.status === 'completed').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Hizmet fiyatı eşlemesi
    const priceOf = useMemo(() => {
        const map = new Map(settings.services.filter((s) => s.price != null).map((s) => [s.name, s.price!]));
        return (name: string) => map.get(name) ?? 0;
    }, [settings.services]);

    // Tahsilat — bugün / dün / bu hafta
    const { todayRev, yRevPct, weekRev, weekRevPct } = useMemo(() => {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const dayMs = 86400000;
        let today = 0, yest = 0, week = 0, lastWeek = 0;
        for (const p of payments) {
            const t = new Date(p.paidAt).getTime();
            if (t >= startOfDay) today += p.amount;
            else if (t >= startOfDay - dayMs) yest += p.amount;
            if (t >= startOfDay - 6 * dayMs) week += p.amount;
            else if (t >= startOfDay - 13 * dayMs) lastWeek += p.amount;
        }
        const pctOf = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0);
        return { todayRev: today, yRevPct: pctOf(today, yest), weekRev: week, weekRevPct: pctOf(week, lastWeek) };
    }, [payments, now]);

    // Beklenen gelir (tahsilat yoksa bugünkü randevulardan)
    const expected = active.reduce((s, r) => s + priceOf(r.service), 0);
    const revToday = todayRev > 0 ? todayRev : expected;
    const revTick = useTicker(revToday, 900, 200);
    const weekTick = useTicker(weekRev, 1000, 300);

    // Bu hafta yeni müşteri
    const { weekCust, newCust } = useMemo(() => {
        const weekAgo = new Date(now.getTime() - 6 * 86400000);
        const wIso = toISODate(weekAgo);
        const created = allCustomers.filter((c) => (c.createdAt || '').slice(0, 10) >= wIso);
        return { weekCust: allCustomers.length, newCust: created.length };
    }, [allCustomers, now]);

    // Sıradaki randevu
    const nextAppt = active.find((r) => r.status !== 'completed' && r.endTime >= nowTime);
    const minsToNext = nextAppt ? Math.max(0, toMin(nextAppt.startTime) - toMin(nowTime)) : null;

    // Personel — aktifler + bugünkü randevu sayısı
    const staffToday = useMemo(() => {
        const counts = new Map<string, number>();
        active.forEach((r) => { if (r.staffName) counts.set(r.staffName, (counts.get(r.staffName) || 0) + 1); });
        return staff.slice(0, 3).map((s) => ({ ...s, apts: counts.get(s.name) || 0 }));
    }, [staff, active]);
    const activeStaffCount = staff.filter((s) => s.isActive).length;

    const [aiDismissed, setAiDismissed] = useState(false);
    const pendingCount = reservations.filter((r) => r.status === 'pending' && r.date >= todayStr).length;

    return (
        <div style={{ color: T.ink }}>
            {/* ═══ HEADER ═══ */}
            <div style={{ padding: '14px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.orange, boxShadow: `0 0 8px ${T.orange}` }} />
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>luera timeflow</span>
                    {isManager && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', background: 'rgba(255,90,31,.15)', color: T.orange, padding: '2px 7px', borderRadius: 999, fontFamily: T.mono }}>YÖNETİCİ</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Yönetici ise çıkış, değilse Personel/Yönetici girişi */}
                    {isManager ? (
                        <button onClick={exitManager} aria-label="Yönetici modundan çık" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', flexShrink: 0, color: T.muted }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                    ) : (
                        <button onClick={() => navigate('/personel')} aria-label="Giriş" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', flexShrink: 0, color: T.muted }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path d="M8 8a3 3 0 100-6 3 3 0 000 6ZM2 19c0-3.3 2.7-5 6-5s6 1.7 6 5M16 7a2.5 2.5 0 010 5M19 19c0-2.6-1.4-4.3-3.5-4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    )}
                    {/* Bildirimler */}
                    <button onClick={() => navigate('/reservations')} aria-label="Bildirimler" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', position: 'relative', flexShrink: 0 }}>
                        <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                            <path d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5.5-1.5 5.5h12s-1.5-1.5-1.5-5.5A4.5 4.5 0 0 0 10 2.5Z" stroke={T.muted} strokeWidth="1.5" strokeLinejoin="round" />
                            <path d="M8.5 15.5a1.5 1.5 0 0 0 3 0" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {pendingCount > 0 && <div style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: T.orange, border: `2px solid ${T.bg}` }} />}
                    </button>
                </div>
            </div>

            {/* ═══ TODAY OVERVIEW CARD ═══ */}
            <div style={{ margin: '16px 22px 0', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 22, overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(135deg,rgba(255,90,31,.12) 0%,rgba(255,90,31,.03) 60%,transparent 100%)', padding: '13px 16px 11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                            <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, color: T.ink }}>{total}</span>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, lineHeight: 1 }}>randevu</div>
                                <div style={{ fontSize: 10, color: T.muted2, marginTop: 2, fontFamily: T.mono }}>{done} tamam · {total - done} kaldı</div>
                            </div>
                        </div>
                        {isManager ? (
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 9.5, color: T.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 4 }}>Gelir</div>
                                <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.04em', color: T.green, lineHeight: 1 }}>{fmt(revTick)} <span style={{ fontSize: 13 }}>₺</span></div>
                                {yRevPct !== 0 && (
                                    <div style={{ fontSize: 10, color: yRevPct >= 0 ? T.green : T.red, fontWeight: 700, marginTop: 3, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ transform: yRevPct < 0 ? 'rotate(180deg)' : 'none' }}><path d="M2 8L5 2l3 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        {yRevPct > 0 ? '+' : ''}{yRevPct}% dünden
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 9.5, color: T.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 4 }}>Tamamlanan</div>
                                <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.04em', color: T.green, lineHeight: 1 }}>{done}<span style={{ fontSize: 13, color: T.muted }}>/{total}</span></div>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ flex: 1, height: 3.5, background: 'rgba(243,237,227,.07)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${T.orange},${T.orangeD})`, borderRadius: 999, transition: 'width .6s' }} />
                        </div>
                        <span style={{ fontSize: 10, color: T.orange, fontWeight: 800, fontFamily: T.mono, flexShrink: 0 }}>{pct}%</span>
                    </div>
                </div>
                {nextAppt && (
                    <div onClick={() => navigate('/calendar')} style={{ padding: '11px 18px 13px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.green, flexShrink: 0, boxShadow: `0 0 6px ${T.green}66` }} />
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 750 }}>Sonraki: </span>
                            <span style={{ fontSize: 12.5, fontWeight: 850 }}>{nextAppt.customerName}</span>
                            <span style={{ fontSize: 12, color: T.muted, fontFamily: T.mono }}> · {nextAppt.startTime}</span>
                        </div>
                        {minsToNext != null && <div style={{ background: 'rgba(255,90,31,.12)', color: T.orange, fontSize: 11, fontWeight: 800, padding: '4px 11px', borderRadius: 999, fontFamily: T.mono, border: '1px solid rgba(255,90,31,.2)', flexShrink: 0 }}>{minsToNext} dk</div>}
                    </div>
                )}
            </div>

            {/* ═══ QUICK ACTIONS ═══ */}
            <div style={{ padding: '20px 22px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isManager ? 4 : 3},1fr)`, gap: 10 }}>
                    {[
                        { lbl: 'Randevu', clr: T.orange, bg: 'rgba(255,90,31,.13)', bdg: 'rgba(255,90,31,.25)', path: 'M10 4v12M4 10h12', to: '/new' },
                        { lbl: 'Tahsilat', clr: T.green, bg: 'rgba(124,196,127,.13)', bdg: 'rgba(124,196,127,.2)', path: 'M2 6.5h16v9H2V6.5ZM2 10.5h16', to: '/kasa' },
                        { lbl: 'Müşteri', clr: T.blue, bg: 'rgba(107,159,212,.13)', bdg: 'rgba(107,159,212,.2)', path: 'M10 8a3 3 0 100-6 3 3 0 000 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5', to: '/customers' },
                        ...(isManager ? [{ lbl: 'Analiz', clr: T.purple, bg: 'rgba(201,139,219,.13)', bdg: 'rgba(201,139,219,.2)', path: 'M3 15V9M8 15V5M13 15v-5M3 15h14', to: '/analytics' }] : []),
                    ].map((a) => (
                        <button key={a.lbl} onClick={() => navigate(a.to)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '15px 4px 13px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, cursor: 'pointer' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 14, background: a.bg, border: `1px solid ${a.bdg}`, display: 'grid', placeItems: 'center' }}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d={a.path} stroke={a.clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{a.lbl}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ═══ WEEKLY STAT STRIP ═══ */}
            <div style={{ margin: '20px 22px 0', display: 'grid', gridTemplateColumns: isManager ? '1fr 1fr' : '1fr', gap: 10 }}>
                {isManager && (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 8 }}>Bu Hafta</div>
                    <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: T.ink }}>{fmt(weekTick)} <span style={{ fontSize: 14, color: T.muted }}>₺</span></div>
                    {weekRevPct !== 0 && (
                        <div style={{ fontSize: 11, color: weekRevPct >= 0 ? T.green : T.red, fontWeight: 700, marginTop: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ transform: weekRevPct < 0 ? 'rotate(180deg)' : 'none' }}><path d="M2 8L5 2l3 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            {weekRevPct > 0 ? '+' : ''}{weekRevPct}% geçen hafta
                        </div>
                    )}
                </div>
                )}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 8 }}>Müşteri</div>
                    <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: T.ink }}>{weekCust}</div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 5 }}>toplam · <span style={{ color: T.blue }}>{newCust} yeni</span></div>
                </div>
            </div>

            {/* ═══ TODAY'S SCHEDULE ═══ */}
            <div style={{ padding: '22px 22px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em' }}>Bugünün Programı</div>
                    <div onClick={() => navigate('/calendar')} style={{ fontSize: 12.5, fontWeight: 750, color: T.orange, cursor: 'pointer' }}>Tümü →</div>
                </div>
                {total === 0 ? (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '24px 16px', textAlign: 'center', color: T.muted, fontSize: 13 }}>Bugün için randevu yok</div>
                ) : (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden' }}>
                        {todayList.map((a, i) => <ScheduleRow key={a.id} r={a} last={i === todayList.length - 1} price={priceOf(a.service)} onClick={() => navigate('/calendar')} />)}
                    </div>
                )}
            </div>

            {/* ═══ STAFF ═══ */}
            {staffToday.length > 0 && (
                <div style={{ padding: '22px 22px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em' }}>Personel</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green }} />
                            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{activeStaffCount} aktif</span>
                        </div>
                    </div>
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden', display: 'flex' }}>
                        {staffToday.map((p, i, arr) => (
                            <div key={p.id} onClick={() => navigate('/staff')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', borderRight: i < arr.length - 1 ? `1px solid ${T.border}` : 'none', opacity: p.isActive ? 1 : 0.4, cursor: 'pointer' }}>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: p.color || avatarColor(p.name), display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 870, color: '#0E0E0E' }}>{p.name[0]?.toUpperCase()}</div>
                                    <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: p.isActive ? T.green : T.muted2, border: `2.5px solid ${T.surface}` }} />
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 780 }}>{p.name}</div>
                                    <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{p.specialty || 'Personel'}</div>
                                </div>
                                <div style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 750, color: p.apts > 0 ? T.orange : T.muted2, background: p.apts > 0 ? 'rgba(255,90,31,.1)' : T.surface2, padding: '3px 10px', borderRadius: 999 }}>{p.apts} apt</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ AI INSIGHT ═══ */}
            {!aiDismissed && pendingCount > 0 && (
                <div style={{ margin: '20px 22px 0', background: 'linear-gradient(145deg,rgba(255,90,31,.10),rgba(255,90,31,.02))', border: '1px solid rgba(255,90,31,.20)', borderRadius: 20, padding: '15px 16px 14px' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,90,31,.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 1.5L12.2 7.8H18.5L13.5 11.5L15.7 17.8L10 14L4.3 17.8L6.5 11.5L1.5 7.8H7.8L10 1.5Z" fill="#FF5A1F" opacity=".9" /><circle cx="15.5" cy="3.5" r="1.3" fill="#FF5A1F" opacity=".5" /></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                                <span style={{ fontSize: 13, fontWeight: 850, color: T.orange }}>AI Önerisi</span>
                                <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(255,90,31,.15)', color: T.orange, padding: '2px 6px', borderRadius: 999, fontFamily: T.mono, letterSpacing: '.06em' }}>YENİ</span>
                            </div>
                            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}><b style={{ color: T.ink }}>{pendingCount} randevu</b> onay bekliyor. Şimdi onaylansın mı?</div>
                        </div>
                        <button onClick={() => setAiDismissed(true)} style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(243,237,227,.05)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, border: 'none', color: T.muted2 }}>
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 9 }}>
                        <button onClick={() => navigate('/reservations')} style={{ flex: 1, height: 40, borderRadius: 12, background: T.orange, color: '#0E0E0E', fontSize: 13, fontWeight: 850, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,90,31,.3)' }}>İncele</button>
                        <button onClick={() => setAiDismissed(true)} style={{ flex: 1, height: 40, borderRadius: 12, background: 'rgba(243,237,227,.06)', color: T.muted, fontSize: 13, fontWeight: 700, border: `1px solid ${T.border}`, cursor: 'pointer' }}>Sonra</button>
                    </div>
                </div>
            )}

            <div style={{ height: 16 }} />
        </div>
    );
};

function ScheduleRow({ r, last, price, onClick }: { r: Reservation; last: boolean; price: number; onClick: () => void }) {
    const ac = r.staffColor || r.serviceColor || T.orange;
    return (
        <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', borderBottom: last ? 'none' : `1px solid ${T.border}`, cursor: 'pointer' }}>
            <div style={{ width: 4, alignSelf: 'stretch', background: ac, flexShrink: 0 }} />
            <div style={{ flex: 1, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, flexShrink: 0 }}>
                    <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em' }}>{r.startTime}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2, marginTop: 2 }}>{r.endTime}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 780, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{r.service}</span>
                        {price > 0 && <><span style={{ width: 3, height: 3, borderRadius: '50%', background: T.muted2, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: ac, fontWeight: 700, flexShrink: 0 }}>₺{price}</span></>}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flexShrink: 0 }}>
                    <div style={{ padding: '3px 8px', borderRadius: 999, background: STS_BG[r.status], color: STS_COLOR[r.status], fontSize: 9.5, fontWeight: 750, whiteSpace: 'nowrap' }}>{STS_LABEL[r.status]}</div>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: r.staffColor || avatarColor(r.customerName), display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 870, color: '#0E0E0E' }}>{(r.staffName || r.customerName)[0]?.toUpperCase()}</div>
                </div>
            </div>
        </div>
    );
}
