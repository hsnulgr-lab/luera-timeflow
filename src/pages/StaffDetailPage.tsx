import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, TrendingUp, CheckCircle2, XCircle, Wallet, Calendar } from 'lucide-react';
import { useStaff } from '@/hooks/useStaff';
import { useStaffStats } from '@/hooks/useStaffStats';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDateEU } from '@/utils/date';

// ── Design tokens (mevcut sayfalarla aynı LT/DT deseni) ───────────────────────
const LT = {
    ink: '#0E0E0E', orange: '#FF5A1F', surface: '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
    border: 'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)', muted: 'rgba(14,14,14,0.48)', muted2: 'rgba(14,14,14,0.30)',
    page: '#F3ECE0', green: '#2D8F32', greenBg: 'rgba(45,160,50,0.10)', red: '#C94040', redBg: 'rgba(201,64,64,0.10)',
    shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
};
const DT = {
    ink: '#F3EDE3', orange: '#FF5A1F', surface: '#1C1710', surface2: '#252015', surface3: '#30281A',
    border: 'rgba(243,237,227,0.10)', border2: 'rgba(243,237,227,0.22)', muted: 'rgba(243,237,227,0.55)', muted2: 'rgba(243,237,227,0.30)',
    page: '#120E08', green: '#7AD3A0', greenBg: 'rgba(45,160,50,0.16)', red: '#e07070', redBg: 'rgba(224,112,112,0.16)',
    shadowSm: '0 1px 3px rgba(0,0,0,0.20),0 2px 8px rgba(0,0,0,0.18)',
};
const MONO = "'JetBrains Mono', monospace";
const fmt = (n: number) => n.toLocaleString('tr-TR');

export const StaffDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { dark } = useTheme();
    const T = dark ? DT : LT;
    const { staff } = useStaff();
    const member = useMemo(() => staff.find((s) => s.id === id), [staff, id]);
    const stats = useStaffStats(id, member?.name);

    if (!member) {
        return (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: T.page, color: T.muted, padding: 40 }}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Personel bulunamadı</p>
                    <button onClick={() => navigate('/staff')} style={{ marginTop: 14, padding: '9px 16px', borderRadius: 10, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Personele dön</button>
                </div>
            </div>
        );
    }

    const color = member.color || T.orange;
    const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: T.shadowSm } as const;
    const maxBar = Math.max(1, ...stats.last7);

    // Yaklaşanları tarihe göre grupla
    const grouped = stats.upcomingList.reduce<Record<string, typeof stats.upcomingList>>((acc, r) => {
        (acc[r.date] = acc[r.date] || []).push(r); return acc;
    }, {});

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: T.page, padding: '24px 28px 48px' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
                {/* Geri + başlık */}
                <button onClick={() => navigate('/staff')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 18, fontFamily: 'inherit' }}>
                    <ArrowLeft size={16} /> Personel
                </button>

                {/* Profil başlığı */}
                <div style={{ ...card, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: color, display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 800, color: '#0E0E0E' }}>{member.name.charAt(0).toUpperCase()}</div>
                        <div style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: member.isActive ? T.green : T.muted2, border: `2.5px solid ${T.surface}` }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: T.ink }}>{member.name}</h1>
                        <p style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>{member.specialty || 'Personel'} · {member.isActive ? 'Aktif' : 'Pasif'}</p>
                        <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                            {member.phone && <a href={`tel:${member.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: T.muted, textDecoration: 'none' }}><Phone size={13} /> {member.phone}</a>}
                            {member.email && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: T.muted }}><Mail size={13} /> {member.email}</span>}
                        </div>
                    </div>
                </div>

                {/* KPI'lar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
                    <Kpi T={T} icon={<Calendar size={15} />} label="Toplam" value={String(stats.total)} />
                    <Kpi T={T} icon={<CheckCircle2 size={15} />} label="Tamamlanan" value={String(stats.completed)} color={T.green} />
                    <Kpi T={T} icon={<XCircle size={15} />} label="İptal" value={String(stats.cancelled)} color={T.red} />
                    <Kpi T={T} icon={<Wallet size={15} />} label="Ciro" value={`₺${fmt(stats.revenue)}`} color={T.green} />
                </div>

                {/* Performans + sparkline */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                    <div style={{ ...card, padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.muted, fontFamily: MONO }}>Tamamlama Oranı</span>
                            <span style={{ fontSize: 18, fontWeight: 900, color: T.orange }}>{stats.completionRate}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: T.surface3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${stats.completionRate}%`, background: `linear-gradient(90deg,${T.orange},#FF7A45)`, borderRadius: 999 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 18, marginTop: 16 }}>
                            <div><div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>{stats.thisWeek}</div><div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Bu hafta</div></div>
                            <div><div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>{stats.thisMonth}</div><div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Bu ay</div></div>
                            <div><div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>{stats.upcoming}</div><div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Yaklaşan</div></div>
                        </div>
                    </div>
                    <div style={{ ...card, padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            <TrendingUp size={14} color={T.muted} />
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.muted, fontFamily: MONO }}>Son 7 Gün</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70 }}>
                            {stats.last7.map((v, i) => (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                                    <div style={{ width: '100%', height: `${(v / maxBar) * 56}px`, minHeight: 3, borderRadius: 4, background: i === 6 ? T.orange : T.surface3 }} />
                                    <span style={{ fontSize: 10, color: T.muted2, fontFamily: MONO }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Hizmet dağılımı */}
                <div style={{ ...card, padding: '18px 20px', marginBottom: 18 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 14 }}>Sattığı Hizmetler</h2>
                    {stats.services.length === 0 ? (
                        <p style={{ fontSize: 13, color: T.muted }}>Henüz randevu yok</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {stats.services.map((s) => (
                                <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                    <span style={{ fontSize: 12, color: T.muted, fontFamily: MONO }}>{s.count}×</span>
                                    <span style={{ fontSize: 13.5, fontWeight: 800, color: T.green, minWidth: 70, textAlign: 'right' }}>₺{fmt(s.revenue)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Kişisel takvim — yaklaşan randevular */}
                <div style={{ ...card, padding: '18px 20px' }}>
                    <h2 style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 14 }}>Kişisel Takvim · Yaklaşan</h2>
                    {stats.upcomingList.length === 0 ? (
                        <p style={{ fontSize: 13, color: T.muted }}>Yaklaşan randevu yok</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {Object.entries(grouped).map(([date, rows]) => (
                                <div key={date}>
                                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted, fontFamily: MONO, marginBottom: 8 }}>{formatDateEU(date)}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {rows.map((r) => (
                                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: T.surface2, borderRadius: 12, borderLeft: `3px solid ${r.serviceColor || color}` }}>
                                                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: MONO, color: T.ink, width: 90 }}>{r.startTime}–{r.endTime}</span>
                                                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customerName}</span>
                                                <span style={{ fontSize: 12, color: T.muted }}>{r.service}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

function Kpi({ T, icon, label, value, color }: { T: typeof LT; icon: React.ReactNode; label: string; value: string; color?: string }) {
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 16px', boxShadow: T.shadowSm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.muted, marginBottom: 8 }}>
                {icon}
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: MONO }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: color || T.ink }}>{value}</div>
        </div>
    );
}
