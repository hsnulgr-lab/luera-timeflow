import { useMemo, useState } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { useStaffSession } from '@/contexts/StaffSessionProvider';
import { useStaffStats } from '@/hooks/useStaffStats';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { toISODate } from '@/utils/date';
import type { Reservation } from '@/types';
import { apptPhase, PHASE_LABEL, priceForReservation, type ApptPhase } from '@/lib/appointmentFlow';
import { TahsilatSheet } from '../TahsilatSheet';
import { T, STS_COLOR, STS_BG, avatarColor } from '../theme';

// Faz → rozet rengi (status anahtarına eşle, inService özel turuncu)
const PH_BADGE: Record<ApptPhase, { c: string; bg: string }> = {
    pending: { c: STS_COLOR.pending, bg: STS_BG.pending },
    upcoming: { c: STS_COLOR.confirmed, bg: STS_BG.confirmed },
    inService: { c: T.orange, bg: 'rgba(255,90,31,.14)' },
    done: { c: STS_COLOR.completed, bg: STS_BG.completed },
    cancelled: { c: STS_COLOR.cancelled, bg: STS_BG.cancelled },
};

const fmt = (n: number) => n.toLocaleString('tr-TR');
const DAY_LETTERS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];
const DLBL = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const MobileStaffHome = () => {
    const { staff, logout } = useStaffSession();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [payRes, setPayRes] = useState<Reservation | null>(null);  // tamamla&tahsilat bağlamı
    const stats = useStaffStats(staff?.id, staff?.name);
    const { payments } = usePayments();
    const { reservations, settings, getReservationsByDate, updateReservation } = useReservations();

    const now = useMemo(() => new Date(), []);
    const todayStr = toISODate(now);
    const color = staff?.color || avatarColor(staff?.name || '?');

    // Haftalık şerit (Pzt başlangıç)
    const week = useMemo(() => {
        const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday); d.setDate(monday.getDate() + i);
            const ds = toISODate(d);
            return { ds, num: d.getDate(), isToday: ds === todayStr, hasEvent: reservations.some((r) => r.date === ds && r.staffId === staff?.id && r.status !== 'cancelled') };
        });
    }, [now, todayStr, reservations, staff?.id]);

    const [selected, setSelected] = useState(todayStr);
    const selDate = useMemo(() => new Date(selected + 'T00:00:00'), [selected]);

    const selAppts = useMemo(
        () => getReservationsByDate(selected).filter((r) => r.staffId === staff?.id && r.status !== 'cancelled').sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, selected, staff?.id]
    );

    // Atanmamış havuz (personel "farketmez" / personelsiz randevular) — herkes görür, sahiplenir
    const unassigned = useMemo(
        () => getReservationsByDate(selected).filter((r) => !r.staffId && r.status !== 'cancelled' && r.status !== 'completed').sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, selected]
    );
    const claim = (a: Reservation) => { updateReservation(a.id, { staffId: staff?.id, staffName: staff?.name, staffColor: color }); };

    // Bugünkü gelir + bu hafta gelir (kendi tahsilatları)
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

    return (
        <div style={{ minHeight: '100dvh', background: T.bg, color: T.ink, fontFamily: T.font, overflowY: 'auto', paddingTop: 'calc(env(safe-area-inset-top,0px))', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)' }}>
            {/* Header */}
            <div style={{ padding: '14px 22px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 50, height: 50, borderRadius: 16, background: color, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 900, color: '#0E0E0E', flexShrink: 0 }}>{(staff?.name || '?').charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.035em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff?.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.green }} />
                        <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Çalışmada</span>
                    </div>
                </div>
                <button onClick={logout} aria-label="Çıkış" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, cursor: 'pointer' }}>
                    <LogOut size={17} />
                </button>
            </div>

            {/* My today stats */}
            <div style={{ padding: '14px 22px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
                {[
                    { lbl: 'Randevum', val: String(todayAppts.length), clr: T.orange, big: true },
                    { lbl: 'Gelir', val: `${fmt(todayRev)}₺`, clr: T.green, big: false },
                    { lbl: 'Tamamlanan', val: String(todayDone), clr: T.blue, big: true },
                ].map((s) => (
                    <div key={s.lbl} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15, padding: '12px 12px 10px' }}>
                        <div style={{ fontSize: 9.5, color: T.muted, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 7 }}>{s.lbl}</div>
                        <div style={{ fontSize: s.big ? 26 : 18, fontWeight: 900, letterSpacing: '-0.04em', color: s.clr, lineHeight: 1 }}>{s.val}</div>
                    </div>
                ))}
            </div>

            {/* Takvimim */}
            <div style={{ padding: '18px 22px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
                    <div style={{ fontSize: 16, fontWeight: 850, letterSpacing: '-0.025em' }}>Takvimim</div>
                    <div style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, fontWeight: 600 }}>{MONTHS[selDate.getMonth()]} {selDate.getFullYear()}</div>
                </div>
                <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
                    {week.map((d, i) => {
                        const sel = d.ds === selected;
                        return (
                            <div key={d.ds} onClick={() => setSelected(d.ds)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 3px 7px', borderRadius: 14, cursor: 'pointer', background: sel ? T.surface : 'transparent', boxShadow: sel ? `0 0 0 1.5px ${T.orange}, 0 0 0 3px rgba(255,90,31,.15)` : 'none' }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: T.mono, color: sel ? T.orange : T.muted2 }}>{DAY_LETTERS[i]}</div>
                                <div style={{ fontSize: 17, fontWeight: d.isToday ? 900 : 700, letterSpacing: '-0.03em', color: sel ? T.orange : d.isToday ? T.ink : T.muted, lineHeight: 1 }}>{d.num}</div>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: d.hasEvent ? (sel ? T.orange : T.muted2) : 'transparent' }} />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Atanmamış havuz — sahiplen */}
            {unassigned.length > 0 && (
                <div style={{ padding: '4px 22px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                        <div style={{ fontSize: 13, fontWeight: 850, letterSpacing: '-0.02em', color: T.orange }}>Atanmamış</div>
                        <div style={{ minWidth: 18, height: 18, borderRadius: 999, background: T.orange, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900, color: '#0E0E0E', padding: '0 5px' }}>{unassigned.length}</div>
                        <span style={{ fontSize: 11, color: T.muted }}>· sahiplen</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 4 }}>
                        {unassigned.map((a) => (
                            <div key={a.id} style={{ background: 'rgba(255,90,31,.06)', border: '1px solid rgba(255,90,31,.25)', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 800, color: T.muted, flexShrink: 0 }}>{a.startTime}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 780, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.customerName}</div>
                                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{a.service}</div>
                                </div>
                                <button onClick={() => claim(a)} style={{ height: 34, padding: '0 14px', borderRadius: 10, background: T.orange, color: '#0E0E0E', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer', flexShrink: 0 }}>Ben alıyorum</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Seçili gün randevularım */}
            <div style={{ padding: '14px 22px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.muted }}>{DLBL[(selDate.getDay() + 6) % 7]} {selDate.getDate()} {MONTHS[selDate.getMonth()]}</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{selAppts.length > 0 ? `${selAppts.length} randevu` : 'Boş gün'}</div>
                </div>

                {selAppts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 20px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, color: T.muted }}>
                        <div style={{ width: 52, height: 52, borderRadius: 16, background: T.surface2, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="3" stroke={T.muted} strokeWidth="1.6" /><path d="M3 9h18M8 2v3M16 2v3" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" /></svg>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 750, color: T.ink, marginBottom: 5 }}>Randevu yok</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>Bu gün için randevunuz bulunmuyor</div>
                    </div>
                ) : (
                    selAppts.map((a, i) => { const ph = apptPhase(a); const bd = PH_BADGE[ph]; return (
                        <div key={a.id} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                            <div style={{ width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                                <div style={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 800, color: T.muted, lineHeight: 1 }}>{a.startTime}</div>
                                {i < selAppts.length - 1 && <div style={{ width: 1.5, flex: 1, marginTop: 7, minHeight: 20, background: `linear-gradient(${a.serviceColor || color}66,transparent)` }} />}
                            </div>
                            <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '12px 14px', borderLeft: `3.5px solid ${a.serviceColor || color}` }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 780, letterSpacing: '-0.01em' }}>{a.customerName}</div>
                                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <span>{a.service}</span>
                                            <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.muted2, display: 'inline-block' }} />
                                            <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>{a.startTime}–{a.endTime}</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                        <div style={{ padding: '3px 8px', borderRadius: 999, background: bd.bg, color: bd.c, fontSize: 9.5, fontWeight: 750 }}>{PHASE_LABEL[ph]}</div>
                                        {ph === 'done' && <div style={{ padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 800, background: a.isPaid ? 'rgba(124,196,127,.14)' : 'rgba(224,112,112,.12)', color: a.isPaid ? T.green : T.red }}>{a.isPaid ? 'Ödendi' : 'Ödenmedi'}</div>}
                                    </div>
                                </div>
                                {ph === 'pending' && (
                                    <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
                                        <button onClick={() => updateReservation(a.id, { status: 'confirmed' })} style={{ flex: 1, height: 32, borderRadius: 9, background: 'rgba(124,196,127,.12)', color: T.green, fontSize: 12, fontWeight: 750, border: '1px solid rgba(124,196,127,.2)', cursor: 'pointer' }}>✓ Onayla</button>
                                        <button onClick={() => updateReservation(a.id, { status: 'cancelled' })} style={{ height: 32, padding: '0 12px', borderRadius: 9, background: 'rgba(224,112,112,.1)', color: T.red, fontSize: 12, fontWeight: 700, border: '1px solid rgba(224,112,112,.2)', cursor: 'pointer' }}>✕ Reddet</button>
                                    </div>
                                )}
                                {ph === 'upcoming' && (
                                    <button onClick={() => updateReservation(a.id, { arrivedAt: new Date().toISOString() })} style={{ width: '100%', height: 34, marginTop: 4, borderRadius: 9, background: 'rgba(107,159,212,.14)', color: T.blue, fontSize: 12.5, fontWeight: 800, border: '1px solid rgba(107,159,212,.25)', cursor: 'pointer' }}>Müşteri Geldi</button>
                                )}
                                {ph === 'inService' && (
                                    <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
                                        <button onClick={() => { setPayRes(a); setSheetOpen(true); }} style={{ flex: 1, height: 34, borderRadius: 9, background: T.orange, color: '#0E0E0E', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Tamamla & Tahsilat</button>
                                        <button onClick={() => updateReservation(a.id, { status: 'completed' })} style={{ height: 34, padding: '0 12px', borderRadius: 9, background: T.surface2, color: T.muted, fontSize: 12, fontWeight: 700, border: `1px solid ${T.border}`, cursor: 'pointer' }}>Ödemesiz</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ); })
                )}
            </div>

            {/* Bu Hafta Performansım */}
            <div style={{ padding: '20px 22px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em', marginBottom: 12 }}>Bu Hafta · Performansım</div>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
                        {([['Randevu', String(stats.thisWeek), T.ink], ['Gelir', `${fmt(weekRev)}₺`, T.green], ['Tamamlanan', String(stats.completed), T.amber]] as const).map(([k, v, c], i) => (
                            <div key={k} style={{ textAlign: 'center', padding: '4px 0', borderRight: i < 2 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: c }}>{v}</div>
                                <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>{k}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 10.5, color: T.muted, fontFamily: T.mono }}>Tamamlama oranı</span>
                            <span style={{ fontSize: 10.5, color: T.orange, fontWeight: 750, fontFamily: T.mono }}>{stats.completionRate}%</span>
                        </div>
                        <div style={{ height: 4, background: T.surface3, borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${stats.completionRate}%`, background: `linear-gradient(90deg,${T.orange},${T.orangeD})`, borderRadius: 999 }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Tahsilat Al */}
            <div style={{ padding: '16px 22px 0' }}>
                <button onClick={() => { setPayRes(null); setSheetOpen(true); }} style={{ width: '100%', height: 52, borderRadius: 16, border: 'none', background: T.green, color: '#0a2e16', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 8px 22px rgba(124,196,127,0.22)' }}>
                    <Plus size={18} strokeWidth={2.6} /> Hızlı Tahsilat
                </button>
            </div>

            <TahsilatSheet
                open={sheetOpen}
                onClose={() => { setSheetOpen(false); setPayRes(null); }}
                lockStaffId={staff?.id}
                title={payRes ? 'Tamamla & Tahsilat' : undefined}
                prefill={payRes ? {
                    amount: priceForReservation(payRes, settings.services) || undefined,
                    customerId: payRes.customerId || undefined,
                    description: payRes.service,
                    staffId: staff?.id,
                    reservationId: payRes.id,
                } : undefined}
                onPaid={payRes ? () => updateReservation(payRes.id, { status: 'completed', isPaid: true }) : undefined}
            />
        </div>
    );
};
