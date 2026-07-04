import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStaffSession } from '@/contexts/StaffSessionProvider';
import { useStaffStats } from '@/hooks/useStaffStats';
import { usePush } from '@/hooks/usePush';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { toISODate } from '@/utils/date';
import type { Reservation } from '@/types';
import { apptPhase } from '@/lib/appointmentFlow';
import { MobileServiceDetail } from './MobileServiceDetail';
import { D, fmtNum, useTicker, HizmetKeyframes, STS } from './hizmetDesign';

const WD = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const DLBL = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const MobileStaffHome = () => {
    const { staff, logout } = useStaffSession();
    const navigate = useNavigate();
    // Çıkışta personel giriş kapısında kalma — doğrudan ana sayfaya dön
    const handleLogout = () => { logout(); navigate('/'); };
    const push = usePush('staff', staff?.id);
    const [detailId, setDetailId] = useState<string | null>(null);
    const stats = useStaffStats(staff?.id, staff?.name);
    const { payments } = usePayments();
    const { reservations, getReservationsByDate, updateReservation, claimReservation } = useReservations();

    const now = useMemo(() => new Date(), []);
    const todayStr = toISODate(now);
    const color = staff?.color || D.orange;

    // Sürekli tarih şeridi — yatay kaydırmalı (geçmiş 21 gün → gelecek 120 gün)
    const days = useMemo(() => {
        const start = new Date(now); start.setDate(now.getDate() - 21);
        return Array.from({ length: 141 }, (_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const ds = toISODate(d);
            return { ds, num: d.getDate(), wd: WD[(d.getDay() + 6) % 7], isToday: ds === todayStr, hasEvent: reservations.some((r) => r.date === ds && r.staffId === staff?.id && r.status !== 'cancelled') };
        });
    }, [now, todayStr, reservations, staff?.id]);

    const [selected, setSelected] = useState(todayStr);
    const selDate = useMemo(() => new Date(selected + 'T00:00:00'), [selected]);

    // İlk açılışta bugünü/seçili günü şeritte ortala (sayfa zıplamadan)
    const stripRef = useRef<HTMLDivElement>(null);
    const didCenter = useRef(false);
    useEffect(() => {
        const c = stripRef.current;
        if (!c || didCenter.current) return;
        const el = c.querySelector('[data-sel="1"]') as HTMLElement | null;
        if (el) {
            const er = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
            c.scrollLeft += (er.left - cr.left) - cr.width / 2 + er.width / 2;
            didCenter.current = true;
        }
    }, [days]);

    const selAppts = useMemo(
        () => getReservationsByDate(selected).filter((r) => r.staffId === staff?.id && r.status !== 'cancelled').sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, selected, staff?.id]
    );

    const unassigned = useMemo(
        () => getReservationsByDate(selected).filter((r) => !r.staffId && r.status !== 'cancelled' && r.status !== 'completed').sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, selected]
    );
    // Yarış-korumalı sahiplenme: sunucu tarafında atomik (yalnızca hâlâ atanmamışsa),
    // diğer cihazlarda realtime ile kart zaten kaybolur.
    const [claiming, setClaiming] = useState<string | null>(null);
    const claim = async (a: Reservation) => {
        if (!staff?.id || claiming) return;
        setClaiming(a.id);
        await claimReservation(a.id, staff.id);
        setClaiming(null);
    };

    const { todayRev, weekRev } = useMemo(() => {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const weekAgo = startOfDay - 6 * 86400000;
        let today = 0, wk = 0;
        for (const p of payments) {
            if (p.staffId !== staff?.id) continue;
            const t = new Date(p.paidAt).getTime();
            if (t >= startOfDay) today += p.amount;
            if (t >= weekAgo) wk += p.amount;
        }
        return { todayRev: today, weekRev: wk };
    }, [payments, staff?.id, now]);

    const todayAppts = getReservationsByDate(todayStr).filter((r) => r.staffId === staff?.id && r.status !== 'cancelled');
    const todayDone = todayAppts.filter((r) => r.status === 'completed').length;

    const todayRevAnim = useTicker(todayRev, 700, 200);
    const weekRevAnim = useTicker(weekRev, 1300, 450);

    if (detailId) return <MobileServiceDetail reservationId={detailId} onBack={() => setDetailId(null)} />;

    return (
        <div style={{ position: 'relative', minHeight: '100dvh', background: D.bg, color: D.ink, fontFamily: D.font }}>
            <HizmetKeyframes />
            <div style={{ overflowY: 'auto', overflowX: 'hidden', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 28px)' }}>

                {/* ══ AMBIENT HERO ══ */}
                <div style={{ height: 120, position: 'relative', overflow: 'hidden', background: `linear-gradient(160deg,${D.hero1} 0%,${D.hero2} 50%,${D.bg} 100%)`, paddingTop: 'env(safe-area-inset-top,0px)' }}>
                    <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle,${D.orb1} 0%,transparent 65%)`, top: -100, left: -50, animation: 'lz-floatOrb1 11s ease-in-out infinite' }} />
                    <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: `radial-gradient(circle,${D.orb2} 0%,transparent 60%)`, top: 0, right: -30, animation: 'lz-floatOrb2 15s ease-in-out infinite' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
                        <div style={{ width: 46, height: 46, borderRadius: 15, flexShrink: 0, background: 'linear-gradient(145deg,#FF5A1F,#CC3A0A)', display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 900, color: '#fff', boxShadow: '0 4px 20px rgba(255,90,31,.40)' }}>{(staff?.name || '?').charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 18, fontWeight: 850, letterSpacing: '-.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff?.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: D.green, boxShadow: `0 0 6px ${D.green}` }} />
                                <span style={{ fontSize: 11.5, color: D.muted, fontWeight: 600 }}>Çalışmada</span>
                            </div>
                        </div>
                        {push.supported && (
                            <button onClick={() => push.enabled ? push.disable() : push.enable()} disabled={push.busy} aria-label="Bildirimler" style={{ width: 38, height: 38, borderRadius: 12, background: push.enabled ? 'rgba(255,90,31,.14)' : D.chipBg, border: `1px solid ${push.enabled ? 'rgba(255,90,31,.3)' : D.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: push.enabled ? D.orange : D.muted2, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                                <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5.5-1.5 5.5h12s-1.5-1.5-1.5-5.5A4.5 4.5 0 0 0 10 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8.5 15.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                            </button>
                        )}
                        <button onClick={handleLogout} aria-label="Çıkış" style={{ width: 38, height: 38, borderRadius: 12, background: D.chipBg, border: `1px solid ${D.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: D.muted2, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                            <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><path d="M2 9h14M12 4l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                    </div>
                </div>

                {/* ══ STATS ══ */}
                <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
                    {[
                        { lbl: 'RANDEVUM', val: String(todayAppts.length), clr: D.orange, big: true },
                        { lbl: 'GELİR', val: `${fmtNum(todayRevAnim)}₺`, clr: D.green, big: false },
                        { lbl: 'TAMAMLANAN', val: String(todayDone), clr: D.blue, big: true },
                    ].map((s) => (
                        <div key={s.lbl} style={{ background: D.s1, border: `1px solid ${D.border}`, borderRadius: 18, padding: '13px 14px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, borderRadius: '50%', background: `radial-gradient(circle,${s.clr}15 0%,transparent 70%)`, transform: 'translate(20px,-20px)' }} />
                            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.13em', color: D.muted2, textTransform: 'uppercase', fontFamily: D.mono, marginBottom: 9 }}>{s.lbl}</div>
                            <div style={{ fontSize: s.big ? 28 : 18, fontWeight: 900, letterSpacing: '-.04em', color: s.clr, lineHeight: 1, fontFamily: s.big ? D.font : D.mono }}>{s.val}</div>
                        </div>
                    ))}
                </div>

                {/* ══ CALENDAR ══ */}
                <div style={{ padding: '22px 20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 15 }}>
                        <div style={{ fontSize: 17, fontWeight: 850, letterSpacing: '-.025em' }}>Takvimim</div>
                        <div style={{ fontFamily: D.mono, fontSize: 11.5, color: D.muted2, fontWeight: 500 }}>{MONTHS[selDate.getMonth()]} {selDate.getFullYear()}</div>
                    </div>
                    <div ref={stripRef} style={{ display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', margin: '0 -20px', padding: '2px 20px' }}>
                        {days.map((d) => {
                            const sel = d.ds === selected;
                            return (
                                <div key={d.ds} data-sel={sel ? '1' : '0'} onClick={() => setSelected(d.ds)} style={{ flex: '0 0 auto', width: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                    <div style={{ fontSize: 9.5, fontWeight: 700, color: d.isToday ? D.orange : D.muted2, letterSpacing: '.04em' }}>{d.wd}</div>
                                    <div style={{ width: 35, height: 35, borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 13.5, fontWeight: d.isToday || sel ? 800 : 500, background: sel ? D.orange : 'transparent', border: d.isToday && !sel ? `2px solid ${D.orange}` : `1.5px solid ${sel ? 'transparent' : D.border}`, color: sel ? '#fff' : d.isToday ? D.orange : D.ink, transition: 'all .18s cubic-bezier(.2,.8,.2,1)', boxShadow: sel ? '0 4px 16px rgba(255,90,31,.38)' : 'none' }}>{d.num}</div>
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: d.hasEvent ? (d.isToday ? D.orange : D.muted3) : 'transparent' }} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ══ ATANMAMIŞ (sahiplen) ══ */}
                {unassigned.length > 0 && (
                    <div style={{ padding: '22px 20px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 850, letterSpacing: '-.02em', color: D.orange }}>Atanmamış</div>
                            <div style={{ minWidth: 18, height: 18, borderRadius: 999, background: D.orange, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900, color: '#fff', padding: '0 5px' }}>{unassigned.length}</div>
                            <span style={{ fontSize: 11, color: D.muted }}>· sahiplen</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {unassigned.map((a) => (
                                <div key={a.id} style={{ background: 'rgba(255,90,31,.06)', border: '1px solid rgba(255,90,31,.22)', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontFamily: D.mono, fontSize: 12.5, fontWeight: 800, color: D.muted, flexShrink: 0 }}>{a.startTime}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 780, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.customerName}</div>
                                        <div style={{ fontSize: 11.5, color: D.muted, marginTop: 2, fontFamily: D.mono }}>{a.service}</div>
                                    </div>
                                    <button onClick={() => claim(a)} disabled={claiming === a.id} style={{ height: 34, padding: '0 14px', borderRadius: 10, background: D.orange, color: '#fff', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: claiming === a.id ? 'default' : 'pointer', opacity: claiming === a.id ? .6 : 1, flexShrink: 0 }}>{claiming === a.id ? 'Alınıyor…' : 'Ben alıyorum'}</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ══ RANDEVU LİSTESİ ══ */}
                <div style={{ padding: '22px 20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em' }}>{DLBL[(selDate.getDay() + 6) % 7]} {selDate.getDate()} {MONTHS[selDate.getMonth()]}</div>
                        <div style={{ fontSize: 12, color: D.muted, fontWeight: 650 }}>{selAppts.length > 0 ? `${selAppts.length} randevu` : 'Boş gün'}</div>
                    </div>

                    {selAppts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '36px 20px', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 18, color: D.muted }}>
                            <div style={{ width: 52, height: 52, borderRadius: 16, background: D.s2, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="3" stroke={D.muted} strokeWidth="1.6" /><path d="M3 9h18M8 2v3M16 2v3" stroke={D.muted} strokeWidth="1.6" strokeLinecap="round" /></svg>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 750, color: D.ink, marginBottom: 5 }}>Randevu yok</div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>Bu gün için randevunuz bulunmuyor</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {selAppts.map((a, i) => {
                                const ph = apptPhase(a);
                                const st = STS[ph];
                                const accent = a.serviceColor || color;
                                return (
                                    <div key={a.id} style={{ display: 'flex', alignItems: 'stretch', animation: `lz-fadeUp .4s ${i * .06}s both` }}>
                                        <div style={{ width: 48, flexShrink: 0, paddingTop: 13, paddingRight: 6 }}>
                                            <div style={{ fontFamily: D.mono, fontSize: 12, fontWeight: 700, color: D.muted2 }}>{a.startTime}</div>
                                        </div>
                                        <div style={{ width: 3, borderRadius: 99, background: accent, flexShrink: 0, margin: '7px 0', opacity: .8 }} />
                                        <div onClick={() => setDetailId(a.id)} style={{ flex: 1, marginLeft: 10, background: D.s1, border: `1px solid ${D.border}`, borderRadius: 17, padding: '12px 14px', cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 14.5, fontWeight: 780, letterSpacing: '-.015em', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.customerName}</div>
                                                    <div style={{ fontSize: 11.5, color: D.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <span>{a.service}</span>
                                                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: D.muted3, display: 'inline-block' }} />
                                                        <span style={{ fontFamily: D.mono }}>{a.startTime}–{a.endTime}</span>
                                                    </div>
                                                    {ph === 'upcoming' && (
                                                        <div style={{ marginTop: 7, fontSize: 12, fontWeight: 750, color: D.orange, letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 4-8 4V2z" fill="currentColor" /></svg>
                                                            {a.customerArrivedAt ? 'Müşterin geldi 👋 · Hizmete başla' : 'Hizmete başla'}
                                                        </div>
                                                    )}
                                                    {ph === 'inService' && (
                                                        <div style={{ marginTop: 7, fontSize: 12, fontWeight: 750, color: D.orange, letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 4-8 4V2z" fill="currentColor" /></svg>
                                                            Devam et
                                                        </div>
                                                    )}
                                                    {ph === 'pending' && (
                                                        <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                                                            <button onClick={(e) => { e.stopPropagation(); updateReservation(a.id, { status: 'confirmed' }); }} style={{ flex: 1, height: 32, borderRadius: 9, background: STS.done.bg, color: D.green, fontSize: 12, fontWeight: 750, border: `1px solid ${D.greenBorder}`, cursor: 'pointer' }}>✓ Onayla</button>
                                                            <button onClick={(e) => { e.stopPropagation(); updateReservation(a.id, { status: 'cancelled' }); }} style={{ height: 32, padding: '0 12px', borderRadius: 9, background: STS.cancelled.bg, color: D.red, fontSize: 12, fontWeight: 700, border: `1px solid ${D.redBorder}`, cursor: 'pointer' }}>✕ Reddet</button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                                                    <div style={{ padding: '3px 9px', borderRadius: 999, background: st?.bg, color: st?.c, fontSize: 10, fontWeight: 750 }}>{st?.lbl}</div>
                                                    {ph === 'done' && <div style={{ padding: '3px 9px', borderRadius: 999, background: a.isPaid ? STS.done.bg : STS.cancelled.bg, color: a.isPaid ? D.green : D.red, fontSize: 10, fontWeight: 750 }}>{a.isPaid ? 'Ödendi' : 'Ödenmedi'}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ══ PERFORMANS ══ */}
                <div style={{ padding: '22px 20px 0' }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.025em', marginBottom: 12 }}>Bu Hafta · Performansım</div>
                    <div style={{ background: D.s1, border: `1px solid ${D.border}`, borderRadius: 20, padding: 18, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${D.border}` }}>
                            {([['Randevu', String(stats.thisWeek), D.ink, false], ['Gelir', `${fmtNum(weekRevAnim)}₺`, D.green, true], ['Tamamlanan', String(stats.completed), D.orange, false]] as const).map(([k, v, c, mono], i, arr) => (
                                <div key={k} style={{ textAlign: 'center', borderRight: i < arr.length - 1 ? `1px solid ${D.border}` : 'none', padding: '0 10px' }}>
                                    <div style={{ fontSize: mono ? 14 : 22, fontWeight: 900, letterSpacing: '-.04em', color: c, lineHeight: 1.1, fontFamily: mono ? D.mono : 'inherit' }}>{v}</div>
                                    <div style={{ fontSize: 10.5, color: D.muted2, marginTop: 6, fontWeight: 650 }}>{k}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                            <span style={{ fontSize: 11.5, color: D.muted, fontWeight: 600, fontFamily: D.mono }}>Tamamlama oranı</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: D.orange, fontFamily: D.mono }}>{stats.completionRate}%</span>
                        </div>
                        <div style={{ height: 5, background: D.s3, borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${stats.completionRate}%`, borderRadius: 999, background: `linear-gradient(90deg,${D.orange},${D.orangeD})`, boxShadow: '0 0 10px rgba(255,90,31,.45)', animation: 'lz-progressFill 1.1s .6s cubic-bezier(.2,.8,.2,1) both' }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
