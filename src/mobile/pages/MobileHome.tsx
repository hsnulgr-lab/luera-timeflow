import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useStaff } from '@/hooks/useStaff';
import { useModules } from '@/hooks/useModules';
import { toISODate } from '@/utils/date';
import type { Reservation } from '@/types';
import { ThemeToggle } from '../ThemeToggle';
import { T, STS_COLOR, STS_BG, STS_LABEL, avatarColor } from '../theme';

// Ease-out sayaç animasyonu
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
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export const MobileHome = () => {
    const navigate = useNavigate();
    const { reservations, settings, getTodayReservations, updateReservation } = useReservations();
    const { stats } = usePayments();
    const { staff } = useStaff();
    const { isEnabled } = useModules();

    const now = useMemo(() => new Date(), []);
    const todayStr = toISODate(now);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateLabel = `${DAY_SHORT[now.getDay()]} · ${now.getDate()} ${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`;

    const todayList = getTodayReservations();
    const active = todayList.filter((r) => r.status !== 'cancelled');
    const total = active.length;
    const done = active.filter((r) => r.status === 'completed').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const priceOf = useMemo(() => {
        const map = new Map(settings.services.filter((s) => s.price != null).map((s) => [s.name, s.price!]));
        return (name: string) => map.get(name) ?? 0;
    }, [settings.services]);

    const revTick = useTicker(stats.today, 900, 200);

    const nextAppt = active.find((r) => r.status !== 'completed' && r.endTime >= nowTime);
    const minsToNext = nextAppt ? Math.max(0, toMin(nextAppt.startTime) - toMin(nowTime)) : null;

    const staffToday = useMemo(() => {
        const counts = new Map<string, number>();
        active.forEach((r) => { if (r.staffName) counts.set(r.staffName, (counts.get(r.staffName) || 0) + 1); });
        return staff.filter((s) => s.isActive).slice(0, 3).map((s) => ({ ...s, apts: counts.get(s.name) || 0 }));
    }, [staff, active]);
    const activeStaffCount = staff.filter((s) => s.isActive).length;

    const [expanded, setExpanded] = useState<string | null>(null);
    const [aiDismissed, setAiDismissed] = useState(false);
    const pendingCount = reservations.filter((r) => r.status === 'pending' && r.date >= todayStr).length;

    return (
        <div style={{ color: T.ink }}>
            {/* Header */}
            <div style={{ padding: '14px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.orange, boxShadow: `0 0 8px ${T.orange}` }} />
                    <span style={{ fontSize: 13, fontWeight: 750, letterSpacing: '-0.01em' }}>luera timeflow</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <ThemeToggle />
                    <button onClick={() => navigate('/personel')} aria-label="Giriş" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.muted }}>
                        <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </button>
                    <button onClick={() => navigate('/reservations')} aria-label="Bildirimler" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', position: 'relative', cursor: 'pointer', color: T.muted }}>
                        <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5.5-1.5 5.5h12s-1.5-1.5-1.5-5.5A4.5 4.5 0 0 0 10 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8.5 15.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        {pendingCount > 0 && <div style={{ position: 'absolute', top: 9, right: 9, width: 7, height: 7, borderRadius: '50%', background: T.orange, border: `2px solid ${T.bg}` }} />}
                    </button>
                </div>
            </div>

            {/* Date + mini stats */}
            <div style={{ padding: '14px 22px 0', display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: T.muted2, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono }}>{dateLabel}</div>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                    {[
                        { val: `${fmt(revTick)}₺`, lbl: 'gelir', clr: T.green },
                        { val: String(total), lbl: 'randevu', clr: T.orange },
                    ].map((s) => (
                        <div key={s.lbl} style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.04em', color: s.clr, lineHeight: 1 }}>{s.val}</div>
                            <div style={{ fontSize: 9.5, color: T.muted2, fontFamily: T.mono, marginTop: 1 }}>{s.lbl}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Progress */}
            <div style={{ padding: '10px 22px 0', display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ flex: 1, height: 3, background: T.surface3, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${T.orange},${T.orangeD})`, borderRadius: 999, transition: 'width .6s' }} />
                </div>
                <span style={{ fontSize: 10, color: T.orange, fontWeight: 800, fontFamily: T.mono, flexShrink: 0 }}>{done}/{total} tamam</span>
            </div>

            {/* Bugünün Programı */}
            <div style={{ padding: '18px 22px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
                    <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.035em' }}>Bugünün Programı</div>
                    <div onClick={() => navigate('/calendar')} style={{ fontSize: 12, fontWeight: 750, color: T.orange, cursor: 'pointer' }}>Tümü →</div>
                </div>

                {/* Sonraki randevu */}
                {nextAppt && (
                    <div onClick={() => navigate('/calendar')} style={{ background: 'linear-gradient(135deg,rgba(255,90,31,.10),rgba(255,90,31,.03))', border: '1px solid rgba(255,90,31,.20)', borderRadius: 18, padding: '13px 16px', marginBottom: 11, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.green, flexShrink: 0, boxShadow: `0 0 6px ${T.green}66` }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 3 }}>Sonraki Randevu</div>
                            <div style={{ fontSize: 15, fontWeight: 860, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextAppt.customerName}</div>
                            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{nextAppt.service} · <span style={{ fontFamily: T.mono }}>{nextAppt.startTime}–{nextAppt.endTime}</span></div>
                        </div>
                        {minsToNext != null && <div style={{ background: 'rgba(255,90,31,.14)', color: T.orange, fontSize: 12, fontWeight: 850, padding: '5px 12px', borderRadius: 999, fontFamily: T.mono, border: '1px solid rgba(255,90,31,.22)', flexShrink: 0 }}>{minsToNext} dk</div>}
                    </div>
                )}

                {/* Randevu listesi — açılır aksiyonlu */}
                {total === 0 && !nextAppt ? (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '24px 16px', textAlign: 'center', color: T.muted, fontSize: 13 }}>Bugün için randevu yok</div>
                ) : (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden' }}>
                        {todayList.map((a, i) => (
                            <ApptRow key={a.id} r={a} last={i === todayList.length - 1} price={priceOf(a.service)} expanded={expanded === a.id}
                                onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                                onComplete={() => updateReservation(a.id, { status: 'completed' })}
                                onConfirm={() => updateReservation(a.id, { status: 'confirmed' })}
                                onCancel={() => { updateReservation(a.id, { status: 'cancelled' }); setExpanded(null); }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Hızlı aksiyonlar */}
            <div style={{ padding: '20px 22px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9 }}>
                {[
                    { lbl: 'Randevu', clr: T.orange, bg: 'rgba(255,90,31,.12)', path: 'M10 4v12M4 10h12', to: '/new' },
                    { lbl: 'Tahsilat', clr: T.green, bg: 'rgba(124,196,127,.12)', path: 'M2 6.5h16v9H2V6.5ZM2 10.5h16', to: '/kasa' },
                    { lbl: 'Müşteri', clr: T.blue, bg: 'rgba(107,159,212,.12)', path: 'M10 8a3 3 0 100-6 3 3 0 000 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5', to: '/customers' },
                    isEnabled('sira')
                        ? { lbl: 'Sıra', clr: T.amber, bg: 'rgba(224,168,78,.12)', path: 'M7 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5ZM2 17c0-2.5 2.2-4.5 5-4.5M13 5a2.5 2.5 0 010 5M18 17c0-2.5-1.5-4.3-4-4.5', to: '/queue' }
                        : { lbl: 'Analiz', clr: T.purple, bg: 'rgba(201,139,219,.12)', path: 'M3 15V9M8 15V5M13 15v-5M3 15h14', to: '/analytics' },
                ].map((a) => (
                    <button key={a.lbl} onClick={() => navigate(a.to)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '13px 4px 11px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, cursor: 'pointer' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 13, background: a.bg, display: 'grid', placeItems: 'center' }}>
                            <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d={a.path} stroke={a.clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted }}>{a.lbl}</span>
                    </button>
                ))}
            </div>

            {/* Personel */}
            {staffToday.length > 0 && (
                <div style={{ padding: '20px 22px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em' }}>Personel</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green }} /><span style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>{activeStaffCount} aktif</span></div>
                    </div>
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden', display: 'flex' }}>
                        {staffToday.map((p, i, arr) => (
                            <div key={p.id} onClick={() => navigate('/staff')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '15px 6px', borderRight: i < arr.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: p.color || avatarColor(p.name), display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 900, color: '#0E0E0E' }}>{p.name[0]?.toUpperCase()}</div>
                                    <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: T.green, border: '2.5px solid #1C1710' }} />
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, fontWeight: 780 }}>{p.name}</div>
                                    <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{p.specialty || 'Personel'}</div>
                                </div>
                                <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 750, color: p.apts > 0 ? T.orange : T.muted2, background: p.apts > 0 ? 'rgba(255,90,31,.1)' : T.surface2, padding: '2px 10px', borderRadius: 999 }}>{p.apts} apt</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Önerisi */}
            {!aiDismissed && pendingCount > 0 && (
                <div style={{ margin: '18px 22px 0', background: 'linear-gradient(145deg,rgba(255,90,31,.10),rgba(255,90,31,.02))', border: '1px solid rgba(255,90,31,.20)', borderRadius: 20, padding: '14px 15px 13px' }}>
                    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 11 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,90,31,.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 1.5L12.2 7.8H18.5L13.5 11.5L15.7 17.8L10 14L4.3 17.8L6.5 11.5L1.5 7.8H7.8L10 1.5Z" fill="#FF5A1F" opacity=".9" /><circle cx="15.5" cy="3.5" r="1.3" fill="#FF5A1F" opacity=".5" /></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 850, color: T.orange }}>AI Önerisi</span>
                                <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(255,90,31,.15)', color: T.orange, padding: '2px 6px', borderRadius: 999, fontFamily: T.mono }}>YENİ</span>
                            </div>
                            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}><b style={{ color: T.ink }}>{pendingCount} randevu</b> onay bekliyor. Şimdi onaylansın mı?</div>
                        </div>
                        <button onClick={() => setAiDismissed(true)} style={{ width: 22, height: 22, borderRadius: 7, background: T.surface2, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, border: 'none', color: T.muted2 }}>
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => navigate('/reservations')} style={{ flex: 1, height: 38, borderRadius: 11, background: T.orange, color: '#0E0E0E', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>İncele</button>
                        <button onClick={() => setAiDismissed(true)} style={{ flex: 1, height: 38, borderRadius: 11, background: T.surface2, color: T.muted, fontSize: 12.5, fontWeight: 700, border: `1px solid ${T.border}`, cursor: 'pointer' }}>Sonra</button>
                    </div>
                </div>
            )}

            <div style={{ height: 16 }} />
        </div>
    );
};

function ApptRow({ r, last, price, expanded, onToggle, onComplete, onConfirm, onCancel }: {
    r: Reservation; last: boolean; price: number; expanded: boolean;
    onToggle: () => void; onComplete: () => void; onConfirm: () => void; onCancel: () => void;
}) {
    const ac = r.staffColor || r.serviceColor || T.orange;
    return (
        <div onClick={onToggle} style={{ borderBottom: last ? 'none' : `1px solid ${T.border}`, cursor: 'pointer', background: expanded ? T.surface2 : 'transparent', transition: 'background .12s' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 4, alignSelf: 'stretch', background: ac, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 46, flexShrink: 0 }}>
                        <div style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 850, letterSpacing: '-0.02em' }}>{r.startTime}</div>
                        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2, marginTop: 1.5 }}>{r.endTime}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 780, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{r.service}</span>
                            {price > 0 && <><span style={{ width: 3, height: 3, borderRadius: '50%', background: T.muted2, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: ac, fontWeight: 700, flexShrink: 0 }}>₺{price}</span></>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <div style={{ padding: '3px 8px', borderRadius: 999, background: STS_BG[r.status], color: STS_COLOR[r.status], fontSize: 9.5, fontWeight: 750 }}>{STS_LABEL[r.status]}</div>
                        <div style={{ width: 27, height: 27, borderRadius: '50%', background: r.staffColor || avatarColor(r.customerName), display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 870, color: '#0E0E0E' }}>{(r.staffName || r.customerName)[0]?.toUpperCase()}</div>
                    </div>
                </div>
            </div>
            {expanded && r.status !== 'completed' && r.status !== 'cancelled' && (
                <div onClick={(e) => e.stopPropagation()} style={{ padding: '0 16px 13px 20px', display: 'flex', gap: 8 }}>
                    <button onClick={onComplete} style={{ flex: 1, height: 36, borderRadius: 10, background: 'rgba(124,196,127,.12)', color: T.green, fontSize: 12.5, fontWeight: 750, border: '1px solid rgba(124,196,127,.2)', cursor: 'pointer' }}>✓ Tamamla</button>
                    {r.status === 'pending' && <button onClick={onConfirm} style={{ flex: 1, height: 36, borderRadius: 10, background: T.orange, color: '#0E0E0E', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Onayla</button>}
                    <button onClick={onCancel} style={{ height: 36, width: 36, borderRadius: 10, background: 'rgba(224,112,112,.12)', color: '#E07070', border: '1px solid rgba(224,112,112,.2)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                </div>
            )}
        </div>
    );
}
