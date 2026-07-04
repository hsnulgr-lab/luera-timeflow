import { useState, useMemo } from 'react';
import { X, Plus, Trash2, Wallet, User, Check, Package, Phone, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useProducts } from '@/hooks/useProducts';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useCustomerPackages } from '@/hooks/useCustomerPackages';
import { useTheme } from '@/contexts/ThemeContext';
import type { Reservation, PaymentMethod } from '@/types';

const PM: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];
const fmt = (n: number) => n.toLocaleString('tr-TR');

interface Props { reservation: Reservation; onClose: () => void; }

/**
 * Takvim randevu kartından açılan sekmeli panel:
 *  • Adisyon  — hesap (hizmet + ürünler + indirim) ve Kasa'ya tahsilat.
 *  • Müşteri  — geçmiş randevular, LTV, paketler, not.
 */
export const AdisyonModal = ({ reservation: r, onClose }: Props) => {
    const { dark } = useTheme();
    const { settings, reservations, updateReservation } = useReservations();
    const { payments, addPayment, removeByReservation, totalForCustomer } = usePayments();
    const { products } = useProducts();
    const { allCustomers } = useCustomers();
    const { staff } = useStaff();
    const staffName = (id?: string) => (id ? staff.find(s => s.id === id)?.name : undefined);
    const { forCustomer } = useCustomerPackages();

    const [tab, setTab] = useState<'adisyon' | 'musteri'>('adisyon');
    const [lines, setLines] = useState<{ productId: string; name: string; price: number }[]>([]);
    const [discStr, setDiscStr] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');

    const T = {
        ink: 'var(--dc-ink)', muted: 'var(--dc-muted)', muted2: 'var(--dc-muted2)',
        surface: 'var(--dc-surface)', surface2: 'var(--dc-surface2)', surface3: 'var(--dc-surface3)',
        border: 'var(--dc-border)', border2: 'var(--dc-border2)', orange: '#FF5A1F',
        green: 'var(--dc-green)',
    };

    const customer = allCustomers.find(c => c.id === r.customerId);
    const svcPrice = (x: Reservation) => settings.services.find(s => s.name === x.service)?.price || 0;

    // Çoklu hizmet booking'i: aynı group_id'li satırların hepsi tek birleşik adisyonda.
    const groupRes = useMemo(
        () => (r.groupId ? reservations.filter(x => x.groupId === r.groupId).sort((a, b) => a.startTime.localeCompare(b.startTime)) : [r]),
        [reservations, r.groupId, r.id],
    );
    const isGroup = groupRes.length > 1;

    // Adisyon satırları: her randevu için hizmet + personelin canlı eklediği kalemler.
    const baseRows = useMemo(() => groupRes.flatMap(x => [
        { name: x.service, sub: x.staffName || 'Hizmet', price: svcPrice(x) },
        ...(x.adisyonItems || []).map(it => ({ name: it.name, sub: it.kind === 'product' ? 'Ürün' : 'Ekstra', price: it.price })),
    ]), [groupRes, settings.services]);
    const baseTotal = baseRows.reduce((s, row) => s + row.price, 0);

    const resPayments = useMemo(() => payments.filter(p => p.reservationId === r.id), [payments, r.id]);
    const isPaid = groupRes.every(x => x.isPaid) || resPayments.length > 0;

    const discount = parseInt(discStr || '0', 10) || 0;
    const subtotal = baseTotal + lines.reduce((s, l) => s + l.price, 0);
    const net = Math.max(0, subtotal - discount);

    const addLine = (id: string) => {
        const p = products.find(x => x.id === id);
        if (p) setLines(prev => [...prev, { productId: p.id, name: p.name, price: p.price }]);
    };

    const collect = async () => {
        if (net <= 0) return;
        const summary = [...groupRes.map(x => x.service), ...lines.map(l => l.name)].join(' + ');
        const desc = discount > 0 ? `${summary} (indirim ${fmt(discount)}₺)` : summary;
        const type = baseTotal > 0 ? 'service' : (lines.length ? 'product' : 'other');
        const p = await addPayment({
            amount: net, method, type, description: desc,
            customerId: r.customerId || undefined, reservationId: r.id,
            productId: lines.length === 1 && baseTotal === 0 ? lines[0].productId : undefined,
        });
        if (p) { for (const x of groupRes) await updateReservation(x.id, { isPaid: true }); toast.success(`${fmt(net)} ₺ tahsil edildi`); }
    };
    const undo = async () => {
        await removeByReservation(r.id);
        for (const x of groupRes) await updateReservation(x.id, { isPaid: false });
        toast.success('Tahsilat geri alındı');
    };

    // Müşteri sekmesi verileri
    const history = useMemo(
        () => (r.customerId ? reservations.filter(x => x.customerId === r.customerId).sort((a, b) => b.date.localeCompare(a.date)) : []),
        [reservations, r.customerId],
    );
    const realSpent = r.customerId ? totalForCustomer(r.customerId) : 0;
    const estSpent = history.filter(h => h.status === 'completed').reduce((s, h) => s + (settings.services.find(sv => sv.name === h.service)?.price || 0), 0);
    const ltv = realSpent > 0 ? realSpent : estSpent;
    const pkgs = r.customerId ? forCustomer(r.customerId) : [];

    const inputCss = { padding: '9px 11px', borderRadius: 9, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 13.5, outline: 'none' } as const;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} className={dark ? 'dash-theme dark' : 'dash-theme'} style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.45)', overflow: 'hidden', color: T.ink }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: T.surface3, border: `1px solid ${T.border2}`, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 800, fontSize: 15 }}>
                        {r.customerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                        <div style={{ fontSize: 12, color: T.muted }}>{r.date} · {isGroup ? `${groupRes.length} hizmet · ${groupRes.map(x => x.staffName).filter(Boolean).join(', ')}` : `${r.startTime}–${r.endTime} · ${r.service}${r.staffName ? ` · ${r.staffName}` : ''}`}</div>
                    </div>
                    {isPaid && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: T.green, background: 'var(--dc-green-bg)', borderRadius: 999, padding: '4px 10px' }}><Check size={13} /> Ödendi</span>}
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: 4, marginLeft: 4 }}><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0' }}>
                    {(['adisyon', 'musteri'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            flex: 1, padding: '9px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: tab === t ? T.orange : T.surface2, color: tab === t ? '#fff' : T.muted,
                        }}>
                            {t === 'adisyon' ? <Wallet size={15} /> : <User size={15} />}{t === 'adisyon' ? 'Adisyon' : 'Müşteri'}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                    {tab === 'adisyon' ? (
                        <>
                            {/* Hesap satırları */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                {baseRows.map((row, i) => <Row key={`b${i}`} label={row.name} sub={row.sub} amount={row.price} T={T} />)}
                                {(isPaid ? [] : lines).map((l, i) => (
                                    <Row key={i} label={l.name} sub="Ürün" amount={l.price} T={T} onDel={() => setLines(prev => prev.filter((_, x) => x !== i))} />
                                ))}
                                {isPaid && resPayments.length > 0 && resPayments.map(p => (
                                    <Row key={p.id} label={p.description || 'Tahsilat'} sub={[staffName(p.staffId), PM.find(m => m.key === p.method)?.label].filter(Boolean).join(' · ')} amount={p.amount} T={T} />
                                ))}
                            </div>

                            {!isPaid && (
                                <>
                                    {/* Ürün ekle */}
                                    {products.length > 0 && (
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 6 }}>Ürün ekle</label>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <select style={{ ...inputCss, flex: 1 }} value="" onChange={e => { if (e.target.value) addLine(e.target.value); }}>
                                                    <option value="">Ürün seç…</option>
                                                    {products.map(p => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} ₺</option>)}
                                                </select>
                                                <span style={{ display: 'grid', placeItems: 'center', width: 38, borderRadius: 9, background: T.surface3, color: T.muted }}><Plus size={16} /></span>
                                            </div>
                                        </div>
                                    )}

                                    {/* İndirim + yöntem */}
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 6 }}>İndirim (₺)</label>
                                            <input style={{ ...inputCss, width: '100%' }} inputMode="numeric" placeholder="0" value={discStr} onChange={e => setDiscStr(e.target.value.replace(/[^0-9]/g, ''))} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 6 }}>Ödeme yöntemi</label>
                                            <div style={{ display: 'flex', gap: 5 }}>
                                                {PM.map(m => (
                                                    <button key={m.key} onClick={() => setMethod(m.key)} style={{
                                                        flex: 1, padding: '9px 4px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                                        background: method === m.key ? T.ink : T.surface2, color: method === m.key ? 'var(--dc-cream)' : T.muted,
                                                        border: `1px solid ${method === m.key ? T.ink : T.border}`,
                                                    }}>{m.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Toplam */}
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>{isPaid ? 'Tahsil edilen' : 'Toplam'}</span>
                                <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: isPaid ? T.green : T.orange }}>
                                    {fmt(isPaid ? resPayments.reduce((s, p) => s + p.amount, 0) || net : net)} <span style={{ fontSize: 15 }}>₺</span>
                                </span>
                            </div>

                            {isPaid ? (
                                <button onClick={undo} style={{ width: '100%', padding: 12, borderRadius: 11, background: T.surface2, border: `1px solid ${T.border2}`, color: T.muted, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                                    Ödemeyi geri al
                                </button>
                            ) : (
                                <button onClick={collect} disabled={net <= 0} style={{ width: '100%', padding: 14, borderRadius: 12, background: net > 0 ? T.orange : T.surface3, color: net > 0 ? '#fff' : T.muted2, border: 'none', fontWeight: 800, fontSize: 15, cursor: net > 0 ? 'pointer' : 'not-allowed' }}>
                                    {net > 0 ? `${fmt(net)} ₺ Tahsil Et` : 'Tutar yok'}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {/* LTV */}
                            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                                <Stat label="Yaşam boyu değer" value={`${fmt(ltv)} ₺`} accent T={T} />
                                <Stat label="Toplam randevu" value={String(history.length)} T={T} />
                            </div>

                            {/* İletişim */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                {(customer?.phone || r.customerPhone) && <InfoRow icon={<Phone size={14} />} text={customer?.phone || r.customerPhone} T={T} />}
                                {customer?.createdAt && <InfoRow icon={<CalendarClock size={14} />} text={`${new Date(customer.createdAt).toLocaleDateString('tr-TR')} tarihinden beri müşteri`} T={T} />}
                            </div>

                            {/* Paketler */}
                            {pkgs.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Paketler</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {pkgs.map(p => (
                                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}` }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Package size={14} style={{ color: T.orange }} />{p.name}</span>
                                                <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>{p.totalSessions - p.usedSessions}/{p.totalSessions} kaldı</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Geçmiş randevular */}
                            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Randevu geçmişi</div>
                            {history.length === 0 ? (
                                <div style={{ fontSize: 13, color: T.muted, padding: '10px 0' }}>Kayıtlı geçmiş yok.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {history.slice(0, 8).map(h => (
                                        <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}` }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.service}</div>
                                                <div style={{ fontSize: 11, color: T.muted }}>{h.date} · {h.startTime}</div>
                                            </div>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted2 }}>{h.status === 'completed' ? 'Tamamlandı' : h.status === 'cancelled' ? 'İptal' : h.status === 'pending' ? 'Bekleyen' : 'Onaylı'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {customer?.notes && (
                                <div style={{ marginTop: 16 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Not</div>
                                    <div style={{ fontSize: 13, color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: '10px 12px' }}>{customer.notes}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Alt bileşenler ──
function Row({ label, sub, amount, T, onDel }: { label: string; sub?: string; amount: number; T: any; onDel?: () => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                {sub && <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>}
            </div>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{fmt(amount)} ₺</span>
            {onDel && <button onClick={onDel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted2, padding: 2 }}><Trash2 size={15} /></button>}
        </div>
    );
}
function Stat({ label, value, accent, T }: { label: string; value: string; accent?: boolean; T: any }) {
    return (
        <div style={{ flex: 1, padding: '13px 14px', borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: accent ? T.orange : T.ink }}>{value}</div>
        </div>
    );
}
function InfoRow({ icon, text, T }: { icon: React.ReactNode; text: string; T: any }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: T.muted }}>
            <span style={{ color: T.muted2, display: 'flex' }}>{icon}</span>{text}
        </div>
    );
}
