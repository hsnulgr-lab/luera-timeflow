import { useMemo, useState } from 'react';
import { Search, Phone, MessageCircle, Plus, Gift, Package, CalendarClock } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useCustomerPackages } from '@/hooks/useCustomerPackages';
import { formatDateEU } from '@/utils/date';
import type { Customer } from '@/types';
import { NewCustomerSheet } from '../NewCustomerSheet';
import { BottomSheet } from '../BottomSheet';
import { T, avatarColor } from '../theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');

function waLink(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '90' + p.slice(1);
    else if (!p.startsWith('90')) p = '90' + p;
    return `https://wa.me/${p}`;
}

export const MobileCustomers = () => {
    const { customers, allCustomers, searchQuery, setSearchQuery, redeemLoyalty } = useCustomers();
    const { settings } = useReservations();
    const loyalty = settings.loyaltyEnabled ? { thr: settings.loyaltyThreshold ?? 10, reward: settings.loyaltyReward || 'Ücretsiz hizmet' } : null;
    const [sheetOpen, setSheetOpen] = useState(false);
    const [selected, setSelected] = useState<Customer | null>(null);
    const totalVisits = useMemo(() => allCustomers.reduce((s, c) => s + c.totalReservations, 0), [allCustomers]);

    return (
        <div style={{ color: T.ink, paddingBottom: 24 }}>
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>Müşteriler</h1>
                    <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{allCustomers.length} kişi · {totalVisits} ziyaret</p>
                </div>
                <button onClick={() => setSheetOpen(true)} aria-label="Yeni müşteri" style={{ width: 44, height: 44, borderRadius: 14, background: T.orange, display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px rgba(255,90,31,.4)' }}>
                    <Plus size={22} strokeWidth={2.5} color="#0E0E0E" />
                </button>
            </div>
            <div style={{ padding: '0 22px' }}>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, padding: '13px 14px', background: T.surface, border: `1px solid ${T.border2}` }}>
                <Search size={18} color={T.muted} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="İsim veya telefon ara"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 15, fontFamily: T.font }} />
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {customers.length === 0 && (
                    <div style={{ borderRadius: 16, padding: 24, textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, color: T.muted, fontSize: 13 }}>
                        {searchQuery ? 'Eşleşen müşteri yok' : 'Henüz müşteri yok'}
                    </div>
                )}
                {customers.map((c) => <CustomerRow key={c.id} c={c} loyalty={loyalty} onRedeem={redeemLoyalty} onOpen={setSelected} />)}
            </div>

            </div>

            <NewCustomerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
            <CustomerDetailSheet customer={selected} onClose={() => setSelected(null)} />
        </div>
    );
};

function CustomerRow({ c, loyalty, onRedeem, onOpen }: { c: Customer; loyalty: { thr: number; reward: string } | null; onRedeem: (id: string, thr: number) => void; onOpen: (c: Customer) => void }) {
    const color = avatarColor(c.name);
    const stamps = c.loyaltyStamps ?? 0;
    const ready = loyalty ? stamps >= loyalty.thr : false;
    const inCard = loyalty ? stamps % loyalty.thr : 0;
    return (
        <div onClick={() => onOpen(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, background: T.surface, border: `1px solid ${ready ? 'rgba(255,90,31,.35)' : T.border}`, cursor: 'pointer' }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: color, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, color: '#0E0E0E', flexShrink: 0 }}>{(c.name || '?').charAt(0).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                <p style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.phone || 'telefon yok'}</p>
                <div style={{ marginTop: 4, fontSize: 11, color: T.muted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span><span style={{ fontWeight: 700, color: T.ink }}>{c.totalReservations}</span> randevu</span>
                    {c.lastVisit && <span>· son {formatDateEU(c.lastVisit)}</span>}
                    {loyalty && !ready && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: T.muted }}><Gift size={10} /> {inCard}/{loyalty.thr}</span>}
                    {loyalty && ready && (
                        <button onClick={(e) => { e.stopPropagation(); if (confirm(`${c.name} için ödülü kullan? (${loyalty.reward})`)) onRedeem(c.id, loyalty.thr); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,90,31,.14)', border: '1px solid rgba(255,90,31,.3)', color: T.orange, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                            <Gift size={10} /> Ödül hazır
                        </button>
                    )}
                </div>
            </div>
            {c.phone && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <a onClick={(e) => e.stopPropagation()} href={`tel:${c.phone}`} aria-label="Ara" style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: T.surface2, color: T.muted }}><Phone size={16} /></a>
                    <a onClick={(e) => e.stopPropagation()} href={waLink(c.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(124,196,127,.14)', color: T.green }}><MessageCircle size={16} /></a>
                </div>
            )}
        </div>
    );
}

const STS: Record<string, { lbl: string; c: string }> = {
    completed: { lbl: 'Tamamlandı', c: T.green },
    confirmed: { lbl: 'Onaylı', c: T.blue },
    pending: { lbl: 'Bekleyen', c: T.amber },
    cancelled: { lbl: 'İptal', c: T.red },
};

// Müşteri detayı — geçmiş randevular, harcama (LTV), paketler ve not.
// Masaüstü AdisyonModal "Müşteri" sekmesinin mobil karşılığı.
function CustomerDetailSheet({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
    const { reservations, settings } = useReservations();
    const { totalForCustomer } = usePayments();
    const { forCustomer } = useCustomerPackages();

    const history = useMemo(
        () => (customer ? reservations.filter((x) => x.customerId === customer.id).sort((a, b) => b.date.localeCompare(a.date)) : []),
        [reservations, customer],
    );
    const realSpent = customer ? totalForCustomer(customer.id) : 0;
    const estSpent = useMemo(
        () => history.filter((h) => h.status === 'completed').reduce((s, h) => s + (settings.services.find((sv) => sv.name === h.service)?.price || 0), 0),
        [history, settings.services],
    );
    const ltv = realSpent > 0 ? realSpent : estSpent;
    const pkgs = customer ? forCustomer(customer.id) : [];

    if (!customer) return null;
    const color = avatarColor(customer.name);

    return (
        <BottomSheet open={!!customer} onClose={onClose} title="Müşteri Detayı">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 4, color: T.ink }}>
                {/* Başlık */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                    <span style={{ width: 50, height: 50, borderRadius: 16, background: color, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 850, color: '#0E0E0E', flexShrink: 0 }}>{(customer.name || '?').charAt(0).toUpperCase()}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 850, letterSpacing: '-0.02em' }}>{customer.name}</div>
                        {customer.phone && <div style={{ fontSize: 12.5, color: T.muted, fontFamily: T.mono, marginTop: 2 }}>{customer.phone}</div>}
                    </div>
                    {customer.phone && (
                        <div style={{ display: 'flex', gap: 6 }}>
                            <a href={`tel:${customer.phone}`} aria-label="Ara" style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: T.surface2, color: T.muted }}><Phone size={16} /></a>
                            <a href={waLink(customer.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(124,196,127,.14)', color: T.green }}><MessageCircle size={16} /></a>
                        </div>
                    )}
                </div>

                {/* İstatistik */}
                <div style={{ display: 'flex', gap: 10 }}>
                    <Stat label="Yaşam boyu değer" value={`${fmt(ltv)} ₺`} accent />
                    <Stat label="Toplam randevu" value={String(history.length)} />
                </div>

                {/* Üyelik tarihi */}
                {customer.createdAt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: T.muted }}>
                        <CalendarClock size={14} style={{ color: T.muted2 }} />
                        {new Date(customer.createdAt).toLocaleDateString('tr-TR')} tarihinden beri müşteri
                    </div>
                )}

                {/* Paketler */}
                {pkgs.length > 0 && (
                    <div>
                        <SecLbl>Paketler</SecLbl>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {pkgs.map((p) => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 12, background: T.surface, border: `1px solid ${T.border}` }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Package size={15} style={{ color: T.orange }} />{p.name}</span>
                                    <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>{p.totalSessions - p.usedSessions}/{p.totalSessions} kaldı</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Not */}
                {customer.notes && (
                    <div>
                        <SecLbl>Not</SecLbl>
                        <div style={{ fontSize: 13.5, color: T.muted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px', lineHeight: 1.5 }}>{customer.notes}</div>
                    </div>
                )}

                {/* Geçmiş randevular */}
                <div>
                    <SecLbl>Randevu geçmişi</SecLbl>
                    {history.length === 0 ? (
                        <div style={{ fontSize: 13, color: T.muted, padding: '14px', textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>Kayıtlı geçmiş yok.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {history.slice(0, 12).map((h) => {
                                const st = STS[h.status] || STS.pending;
                                return (
                                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 13px', borderRadius: 12, background: T.surface, border: `1px solid ${T.border}` }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.service}</div>
                                            <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, marginTop: 2 }}>{formatDateEU(h.date)} · {h.startTime}</div>
                                        </div>
                                        <span style={{ fontSize: 10.5, fontWeight: 800, color: st.c, flexShrink: 0 }}>{st.lbl}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div style={{ flex: 1, padding: '13px 14px', borderRadius: 14, background: T.surface, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: accent ? T.orange : T.ink }}>{value}</div>
        </div>
    );
}

function SecLbl({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 9, fontFamily: T.mono }}>{children}</div>;
}
