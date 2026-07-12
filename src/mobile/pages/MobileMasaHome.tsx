import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePayments } from '@/hooks/usePayments';
import { useStaff } from '@/hooks/useStaff';
import { useTables } from '@/hooks/useTables';
import { useUpcomingTableReservations } from '@/hooks/useTableReservations';
import { useQueue } from '@/hooks/useQueue';
import { useModules } from '@/hooks/useModules';
import { todayISO, relativeDayLabel } from '@/utils/date';
import { seatedMinutes, elapsedLabel } from '@/utils/masaAdisyon';
import type { TableReservation } from '@/types';
import { ThemeToggle } from '../ThemeToggle';
import { T, avatarColor } from '../theme';
import { useTicker, useMinuteTick } from '../hooks';

// Restoran modu mobil ana ekran — masa açık + randevu kapalı işletmeler.
// MobileHome ile aynı iskelet (header, gelir ticker, personel şeridi);
// randevu bölümleri masa/doluluk karşılıklarıyla değiştirilmiştir.

const fmt = (n: number) => n.toLocaleString('tr-TR');
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// MasaPage.statusOf ile aynı öncelik — lokal kopya, MasaPage'e dokunulmaz
type TableStatus = 'bos' | 'rezerve' | 'dolu';
function statusOf(rs: TableReservation[]): TableStatus {
    if (rs.some((r) => r.status === 'seated')) return 'dolu';
    if (rs.some((r) => r.status === 'reserved')) return 'rezerve';
    return 'bos';
}

const waitMinutes = (joinedAt: string) => Math.max(0, Math.round((Date.now() - new Date(joinedAt).getTime()) / 60000));

const RES_STS: Record<string, { label: string; clr: string; bg: string }> = {
    seated:    { label: 'Oturdu',     clr: T.orange, bg: 'rgba(255,90,31,.12)' },
    reserved:  { label: 'Rezerve',    clr: T.amber,  bg: 'rgba(224,168,78,.12)' },
    completed: { label: 'Tamamlandı', clr: T.green,  bg: 'rgba(124,196,127,.12)' },
    // Garson "Kasaya Gönder" ile completed'a geçmiş ama ödeme henüz alınmamış (isPaid=false — 049)
    unpaid:    { label: 'Ödenmedi',   clr: T.amber,  bg: 'rgba(224,168,78,.12)' },
};

// Mobil admin ana ekranında (randevu+masa hibrit) kompakt masa şeridi.
// MobileHome tarafından isEnabled('masa') ile gated render edilir.
export const MobileMasaStrip = () => {
    const navigate = useNavigate();
    const { tables } = useTables();
    const { reservations } = useUpcomingTableReservations();
    const today = todayISO();

    const { dolu, rezerve, bos, todayCount, upcomingCount } = useMemo(() => {
        const valid = reservations.filter((r) => tables.some((t) => t.id === r.tableId));
        const todayRes = valid.filter((r) => r.date === today);
        const byTable = new Map<string, TableReservation[]>();
        for (const r of todayRes) (byTable.get(r.tableId) || byTable.set(r.tableId, []).get(r.tableId)!).push(r);
        const dolu = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'dolu').length;
        const rezerve = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'rezerve').length;
        return { dolu, rezerve, bos: tables.length - dolu - rezerve, todayCount: todayRes.length, upcomingCount: valid.length - todayRes.length };
    }, [tables, reservations, today]);

    if (tables.length === 0) return null;

    return (
        <div style={{ padding: '18px 22px 0' }}>
            <button onClick={() => navigate('/masa')} style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '15px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: T.font }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 13, background: 'rgba(255,90,31,.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M3 9h14M5 9V7a2 2 0 012-2h6a2 2 0 012 2v2M6 9v7M14 9v7M4 13h12" stroke={T.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.02em' }}>Masalar</div>
                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>bugün {todayCount} rezervasyon{upcomingCount > 0 && ` · +${upcomingCount} yaklaşan`}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexShrink: 0, fontFamily: T.mono }}>
                        {[{ n: dolu, c: T.orange }, { n: rezerve, c: T.amber }, { n: bos, c: T.green }].map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.c }} />
                                <span style={{ fontSize: 14, fontWeight: 850 }}>{s.n}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </button>
        </div>
    );
};

export const MobileMasaHome = () => {
    const navigate = useNavigate();
    const { stats } = usePayments();
    const { staff } = useStaff();
    const { tables } = useTables();
    const { reservations } = useUpcomingTableReservations();
    const { waiting: waitlist } = useQueue();
    const { isEnabled, isLoading: modulesLoading } = useModules();
    const hybrid = !modulesLoading && isEnabled('randevu'); // masa + randevu birlikte açık — hibrit işletme
    useMinuteTick(); // gün değişimi + ⏱ süre etiketlerini canlı tutar
    const today = todayISO();

    const now = new Date();
    const dateLabel = `${DAY_SHORT[now.getDay()]} · ${now.getDate()} ${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`;
    const revTick = useTicker(stats.today, 900, 200);

    const { listRes, dolu, rezerve, bos, doluluk } = useMemo(() => {
        const valid = reservations.filter((r) => tables.some((t) => t.id === r.tableId)); // hayalet koruması
        const todayRes = valid.filter((r) => r.date === today);
        const byTable = new Map<string, TableReservation[]>();
        for (const r of todayRes) (byTable.get(r.tableId) || byTable.set(r.tableId, []).get(r.tableId)!).push(r);
        const dolu = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'dolu').length;
        const rezerve = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'rezerve').length;
        return { listRes: valid, dolu, rezerve, bos: tables.length - dolu - rezerve, doluluk: tables.length > 0 ? Math.round((dolu / tables.length) * 100) : 0 };
    }, [tables, reservations, today]);

    const tableName = (id: string) => tables.find((t) => t.id === id)?.name || 'Masa';
    const staffToday = staff.filter((s) => s.isActive).slice(0, 3);
    const activeStaffCount = staff.filter((s) => s.isActive).length;

    return (
        <div style={{ color: T.ink }}>
            {/* Header — MobileHome ile aynı */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.orange, boxShadow: `0 0 8px ${T.orange}` }} />
                    <span style={{ fontSize: 13, fontWeight: 750, letterSpacing: '-0.01em' }}>luera timeflow</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <ThemeToggle size={44} />
                    <button onClick={() => navigate('/personel')} aria-label="Personel modu girişi" style={{ height: 44, padding: '0 12px', borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: T.muted }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        <span style={{ fontSize: 11.5, fontWeight: 750 }}>Personel</span>
                    </button>
                </div>
            </div>

            {/* Date + mini stats: gelir + dolu masa */}
            <div style={{ padding: '14px 22px 0', display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: T.muted2, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono }}>{dateLabel}</div>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                    {[
                        { val: `${fmt(revTick)}₺`, lbl: 'gelir', clr: T.green },
                        { val: `${dolu}/${tables.length}`, lbl: 'dolu masa', clr: T.orange },
                    ].map((s) => (
                        <div key={s.lbl} style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.04em', color: s.clr, lineHeight: 1 }}>{s.val}</div>
                            <div style={{ fontSize: 9.5, color: T.muted2, fontFamily: T.mono, marginTop: 1 }}>{s.lbl}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Doluluk çubuğu */}
            <div style={{ padding: '10px 22px 0', display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ flex: 1, height: 3, background: T.surface3, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${doluluk}%`, background: `linear-gradient(90deg,${T.orange},${T.orangeD})`, borderRadius: 999, transition: 'width .6s' }} />
                </div>
                <span style={{ fontSize: 10, color: T.orange, fontWeight: 800, fontFamily: T.mono, flexShrink: 0 }}>%{doluluk} doluluk</span>
            </div>

            {/* Bugünün Rezervasyonları */}
            <div style={{ padding: '18px 22px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
                    <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.035em' }}>Rezervasyonlar</div>
                    <button onClick={() => navigate('/masa')} style={{ fontSize: 12, fontWeight: 750, color: T.orange, cursor: 'pointer', background: 'none', border: 'none', padding: '8px 4px', fontFamily: T.font }}>Masa Planı →</button>
                </div>

                {listRes.length === 0 ? (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '24px 16px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
                        Yaklaşan rezervasyon yok
                        <button onClick={() => navigate('/masa')} style={{ display: 'block', margin: '10px auto 0', color: T.orange, fontWeight: 750, fontSize: 12.5, cursor: 'pointer', background: 'none', border: 'none', padding: '8px', fontFamily: T.font }}>+ Rezervasyon oluştur</button>
                    </div>
                ) : (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden' }}>
                        {listRes.map((r, i) => {
                            const s = (r.status === 'completed' && r.isPaid === false) ? RES_STS.unpaid : (RES_STS[r.status] || RES_STS.reserved);
                            const isFuture = r.date > today;
                            const mins = r.status === 'seated' ? seatedMinutes(r.seatedAt) : null;
                            return (
                                <button key={r.id} onClick={() => navigate('/masa')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', cursor: 'pointer', background: 'none', border: 'none', borderBottom: i < listRes.length - 1 ? `1px solid ${T.border}` : 'none', textAlign: 'left', fontFamily: T.font }}>
                                    <div style={{ width: 52, flexShrink: 0 }}>
                                        {isFuture && <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 800, color: T.orange, marginBottom: 1 }}>{relativeDayLabel(r.date)}</div>}
                                        <div style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 850, letterSpacing: '-0.02em' }}>{r.startTime}</div>
                                        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2, marginTop: 1.5 }}>{r.partySize} kişi</div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 780, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2.5 }}>{tableName(r.tableId)}{mins !== null ? ` · ⏱ ${elapsedLabel(mins)}` : ''}</div>
                                    </div>
                                    <div style={{ padding: '3px 8px', borderRadius: 999, background: s.bg, color: s.clr, fontSize: 9.5, fontWeight: 750, flexShrink: 0 }}>{s.label}</div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Masalar — Dolu/Rezerve/Boş özet */}
            <div style={{ padding: '20px 22px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em' }}>Masalar</div>
                    <button onClick={() => navigate('/masa')} style={{ fontSize: 12, fontWeight: 750, color: T.orange, cursor: 'pointer', background: 'none', border: 'none', padding: '8px 4px', fontFamily: T.font }}>Masa Planı →</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
                    {[['Dolu', dolu, T.orange], ['Rezerve', rezerve, T.blue], ['Boş', bos, T.green]].map(([k, v, c]) => (
                        <div key={k as string} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15, padding: '12px 4px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: c as string }}>{v}</div>
                            <div style={{ fontSize: 9.5, color: T.muted, marginTop: 3, fontWeight: 600 }}>{k}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bekleme Listesi */}
            {waitlist.length > 0 && (
                <div style={{ padding: '20px 22px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                        <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em' }}>Bekleme Listesi</div>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: T.amber, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900, color: '#0E0E0E' }}>{waitlist.length}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {waitlist.map((w, i) => (
                            <button key={w.id} onClick={() => navigate('/masa')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15, cursor: 'pointer', textAlign: 'left', fontFamily: T.font }}>
                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: T.surface3, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>{w.customerName}</div>
                                    <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>{w.partySize} kişi</div>
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 750, color: T.amber, fontFamily: T.mono }}>~{waitMinutes(w.joinedAt)} dk</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Hızlı aksiyonlar — restoran seti (+ hibritte Takvim). Ayarlar buradan
                kaldırıldı — Yönetim ekranından (Personel girişi > Yönetici) erişilir. */}
            <div style={{ padding: '20px 22px 0', display: 'grid', gridTemplateColumns: `repeat(${hybrid ? 4 : 3},1fr)`, gap: 9 }}>
                {[
                    { lbl: 'Masa', clr: T.orange, bg: 'rgba(255,90,31,.12)', path: 'M3 9h14M5 9V7a2 2 0 012-2h6a2 2 0 012 2v2M6 9v7M14 9v7M4 13h12', to: '/masa' },
                    ...(hybrid ? [{ lbl: 'Takvim', clr: T.purple, bg: 'rgba(201,139,219,.12)', path: 'M3 5h14v12H3V5ZM3 8h14M7 3v3M13 3v3', to: '/calendar' }] : []),
                    { lbl: 'Tahsilat', clr: T.green, bg: 'rgba(124,196,127,.12)', path: 'M2 6.5h16v9H2V6.5ZM2 10.5h16', to: '/kasa' },
                    { lbl: 'Müşteri', clr: T.blue, bg: 'rgba(107,159,212,.12)', path: 'M10 8a3 3 0 100-6 3 3 0 000 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5', to: '/customers' },
                ].map((a) => (
                    <button key={a.lbl} onClick={() => navigate(a.to)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '13px 4px 11px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, cursor: 'pointer' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 13, background: a.bg, display: 'grid', placeItems: 'center' }}>
                            <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d={a.path} stroke={a.clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted }}>{a.lbl}</span>
                    </button>
                ))}
            </div>

            {/* Personel — MobileHome ile aynı şerit (randevu sayacı yerine sade) */}
            {staffToday.length > 0 && (
                <div style={{ padding: '20px 22px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em' }}>Personel · Bugün</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green }} /><span style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>{activeStaffCount} aktif</span></div>
                    </div>
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden', display: 'flex' }}>
                        {staffToday.map((p, i, arr) => (
                            <div key={p.id} onClick={() => navigate('/staff')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '15px 6px', borderRight: i < arr.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: p.color || avatarColor(p.name), display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 900, color: '#0E0E0E' }}>{p.name[0]?.toUpperCase()}</div>
                                    <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: T.green, border: `2.5px solid ${T.surface}` }} />
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, fontWeight: 780 }}>{p.name}</div>
                                    <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{p.specialty || 'Personel'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ height: 16 }} />
        </div>
    );
};
