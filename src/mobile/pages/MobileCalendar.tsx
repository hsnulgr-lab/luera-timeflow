import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { toISODate } from '@/utils/date';
import type { Reservation } from '@/types';
import { ReservationSheet } from '../ReservationSheet';
import { TahsilatSheet } from '../TahsilatSheet';
import { priceForReservation } from '@/lib/appointmentFlow';
import { T, STS_COLOR, STS_BG, STS_LABEL, avatarColor } from '../theme';

const DAY_LETTERS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P']; // Pzt..Paz
const DLBL = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const MobileCalendar = () => {
    const navigate = useNavigate();
    const { reservations, settings, getReservationsByDate, updateReservation, deleteReservation, checkConflict } = useReservations();
    const [selected, setSelected] = useState(() => toISODate(new Date()));
    const [activeId, setActiveId] = useState<string | null>(null);
    const [payRes, setPayRes] = useState<Reservation | null>(null);   // Tamamla & Tahsilat bağlamı
    const active = useMemo(() => reservations.find((r) => r.id === activeId) ?? null, [reservations, activeId]);
    const sel = useMemo(() => new Date(selected + 'T00:00:00'), [selected]);
    const todayStr = useMemo(() => toISODate(new Date()), []);

    const week = useMemo(() => {
        const monday = new Date(sel);
        monday.setDate(sel.getDate() - ((sel.getDay() + 6) % 7));
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday); d.setDate(monday.getDate() + i);
            const ds = toISODate(d);
            return { ds, num: d.getDate(), isSelected: ds === selected, isToday: ds === todayStr, hasEvent: reservations.some((r) => r.date === ds && r.status !== 'cancelled') };
        });
    }, [sel, selected, reservations, todayStr]);

    const dayList = useMemo(
        () => [...getReservationsByDate(selected)].filter((r) => r.status !== 'cancelled').sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getReservationsByDate, selected]
    );

    const ym = selected.slice(0, 7);
    const monthRes = reservations.filter((r) => r.date.startsWith(ym));
    const monthTotal = monthRes.length;
    const monthDone = monthRes.filter((r) => r.status === 'completed').length;
    const monthCancel = monthRes.filter((r) => r.status === 'cancelled').length;

    const shiftWeek = (dir: number) => { const d = new Date(sel); d.setDate(sel.getDate() + dir * 7); setSelected(toISODate(d)); };
    const navBtn = { width: 38, height: 38, borderRadius: 11, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.muted } as const;

    return (
        <div style={{ color: T.ink }}>
            {/* Month header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <button onClick={() => shiftWeek(-1)} style={navBtn}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.04em' }}>{MONTHS[sel.getMonth()]} {sel.getFullYear()}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2, fontFamily: T.mono }}>Bu Hafta</div>
                </div>
                <button onClick={() => shiftWeek(1)} style={navBtn}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
            </div>

            {/* Week strip */}
            <div style={{ padding: '0 16px 20px', display: 'flex', gap: 5 }}>
                {week.map((d, i) => (
                    <div key={d.ds} onClick={() => setSelected(d.ds)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 3px 8px', borderRadius: 15, cursor: 'pointer', position: 'relative', background: d.isSelected ? T.surface : 'transparent', transition: 'all .18s', boxShadow: d.isSelected ? `0 0 0 1.5px ${T.orange}, 0 0 0 3.5px rgba(255,90,31,.15), 0 4px 14px rgba(0,0,0,.35)` : 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: T.mono, color: d.isSelected ? T.orange : T.muted2 }}>{DAY_LETTERS[i]}</div>
                        <div style={{ fontSize: 18, fontWeight: d.isToday ? 900 : 700, letterSpacing: '-0.03em', color: d.isSelected ? T.orange : d.isToday ? T.ink : T.muted, lineHeight: 1 }}>{d.num}</div>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: d.hasEvent ? (d.isSelected ? T.orange : T.muted2) : 'transparent' }} />
                    </div>
                ))}
            </div>

            {/* Day header */}
            <div style={{ padding: '0 22px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 15.5, fontWeight: 850, letterSpacing: '-0.025em' }}>{DLBL[(sel.getDay() + 6) % 7]}, {sel.getDate()} {MONTHS[sel.getMonth()]}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{dayList.length > 0 ? `${dayList.length} randevu` : 'Randevu yok'}</div>
                </div>
                <div onClick={() => navigate('/new')} style={{ width: 36, height: 36, borderRadius: 11, background: T.orange, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="#0E0E0E" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </div>
            </div>

            {/* Timeline */}
            {dayList.length > 0 ? (
                <div style={{ padding: '0 22px' }}>
                    {dayList.map((a, i) => <TimelineRow key={a.id} r={a} last={i === dayList.length - 1} onClick={() => setActiveId(a.id)} />)}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '36px 20px 20px', color: T.muted }}>
                    <div style={{ width: 60, height: 60, borderRadius: 18, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="3" stroke={T.muted} strokeWidth="1.6" /><path d="M3 9h18" stroke={T.muted} strokeWidth="1.6" /></svg>
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 750, color: T.ink, marginBottom: 6 }}>Randevu yok</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>Bu güne randevu eklemek<br />için + butonuna bas</div>
                </div>
            )}

            {/* Month stats */}
            <div style={{ margin: '12px 22px 8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 17, padding: '15px 17px' }}>
                <div style={{ fontSize: 10.5, color: T.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 13 }}>Bu Ay · {MONTHS[sel.getMonth()]}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
                    {([['Toplam', monthTotal, T.ink], ['Tamamlanan', monthDone, T.green], ['İptal', monthCancel, T.red]] as const).map(([k, v, c], i) => (
                        <div key={k} style={{ textAlign: 'center', padding: '4px 0', borderRight: i < 2 ? `1px solid ${T.border}` : 'none' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: c }}>{v}</div>
                            <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>{k}</div>
                        </div>
                    ))}
                </div>
            </div>

            <ReservationSheet
                reservation={active}
                services={settings.services}
                onClose={() => setActiveId(null)}
                onUpdate={updateReservation}
                onDelete={deleteReservation}
                onCollect={(r) => { setActiveId(null); setPayRes(r); }}
                checkConflict={checkConflict}
            />

            <TahsilatSheet
                open={!!payRes}
                onClose={() => setPayRes(null)}
                title={payRes ? 'Tamamla & Tahsilat' : undefined}
                prefill={payRes ? {
                    amount: priceForReservation(payRes, settings.services) || undefined,
                    customerId: payRes.customerId || undefined,
                    description: payRes.service,
                    staffId: payRes.staffId,
                    reservationId: payRes.id,
                } : undefined}
                onPaid={payRes ? () => updateReservation(payRes.id, { status: 'completed', isPaid: true }) : undefined}
            />
        </div>
    );
};

function TimelineRow({ r, last, onClick }: { r: Reservation; last: boolean; onClick: () => void }) {
    const ac = r.staffColor || r.serviceColor || T.orange;
    return (
        <div style={{ display: 'flex', gap: 14, paddingBottom: last ? 4 : 14 }}>
            <div style={{ width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                <div style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.muted, lineHeight: 1 }}>{r.startTime}</div>
                {!last && <div style={{ width: 1.5, flex: 1, marginTop: 8, minHeight: 20, background: `linear-gradient(${ac}99,transparent)` }} />}
            </div>
            <div onClick={onClick} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '12px 13px', display: 'flex', gap: 10, alignItems: 'center', borderLeft: `3.5px solid ${ac}`, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 750, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{r.service}</span>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.muted2, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontFamily: T.mono, fontSize: 10.5, flexShrink: 0 }}>{r.startTime}–{r.endTime}</span>
                    </div>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ padding: '3px 8px', borderRadius: 999, background: STS_BG[r.status], color: STS_COLOR[r.status], fontSize: 10, fontWeight: 750 }}>{STS_LABEL[r.status]}</div>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: r.staffColor || avatarColor(r.customerName), display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 850, color: '#0E0E0E' }}>{(r.staffName || r.customerName)[0]?.toUpperCase()}</div>
                </div>
            </div>
        </div>
    );
}
