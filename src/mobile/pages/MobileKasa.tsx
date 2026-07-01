import { useMemo, useState } from 'react';
import { Plus, Banknote, CreditCard, Building2, Wallet, Receipt } from 'lucide-react';
import { usePayments } from '@/hooks/usePayments';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { priceForReservation } from '@/lib/appointmentFlow';
import type { Payment, PaymentMethod, PaymentType, Reservation } from '@/types';
import { TahsilatSheet } from '../TahsilatSheet';
import { T } from '../theme';

const PM_TR: Record<PaymentMethod, string> = { cash: 'Nakit', card: 'Kart', transfer: 'Havale', other: 'Diğer' };
const TYPE_TR: Record<PaymentType, string> = { service: 'Hizmet', product: 'Ürün', other: 'Tahsilat' };
const fmt = (n: number) => n.toLocaleString('tr-TR');

function MethodIcon({ m, size = 16 }: { m: PaymentMethod; size?: number }) {
    if (m === 'cash') return <Banknote size={size} />;
    if (m === 'card') return <CreditCard size={size} />;
    if (m === 'transfer') return <Building2 size={size} />;
    return <Wallet size={size} />;
}

// Kasada bekleyen birleşik adisyon — tekli randevu veya gruplu (çoklu hizmet) booking.
interface Bill { key: string; reservationIds: string[]; customerId?: string; customerName: string; staffNames: string[]; total: number; summary: string; firstId: string; staffId?: string; endedAt: string; }

export const MobileKasa = () => {
    const { payments, stats } = usePayments();
    const { allCustomers } = useCustomers();
    const { reservations, settings, updateReservation } = useReservations();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [bill, setBill] = useState<Bill | null>(null);   // kasada bekleyen (gruplu/tekli) adisyon

    const custName = useMemo(() => {
        const m = new Map(allCustomers.map((c) => [c.id, c.name]));
        return (id?: string) => (id ? m.get(id) : undefined);
    }, [allCustomers]);

    const billTotal = (r: Reservation) => priceForReservation(r, settings.services) + (r.adisyonItems || []).reduce((s, l) => s + l.price, 0);
    const billSummary = (r: Reservation) => [r.service, ...(r.adisyonItems || []).map((l) => l.name)].join(' + ');

    // Personel hizmeti bitirip "Kasaya Gönder" dedi → tamamlandı + ödenmedi + süre durmuş.
    // Çoklu hizmet booking'lerinde (group_id) satırlar tek birleşik adisyonda toplanır;
    // her satır bitince gruba eklenir, kasada tek seferde tahsil edilir.
    const bills = useMemo(() => {
        const lines = reservations.filter((r) => r.status === 'completed' && !r.isPaid && r.serviceEndedAt && billTotal(r) > 0);
        const groups = new Map<string, Reservation[]>();
        const out: Bill[] = [];
        for (const r of lines) {
            if (r.groupId) { const a = groups.get(r.groupId) || []; a.push(r); groups.set(r.groupId, a); }
            else out.push({ key: r.id, reservationIds: [r.id], customerId: r.customerId || undefined, customerName: r.customerName, staffNames: r.staffName ? [r.staffName] : [], total: billTotal(r), summary: billSummary(r), firstId: r.id, staffId: r.staffId, endedAt: r.serviceEndedAt || '' });
        }
        for (const [g, arr] of groups) {
            arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
            out.push({
                key: 'g-' + g, reservationIds: arr.map((r) => r.id), customerId: arr[0].customerId || undefined, customerName: arr[0].customerName,
                staffNames: [...new Set(arr.map((r) => r.staffName).filter(Boolean) as string[])],
                total: arr.reduce((s, r) => s + billTotal(r), 0), summary: arr.map((r) => r.service).join(' + '),
                firstId: arr[0].id, staffId: arr[0].staffId, endedAt: arr.reduce((m, r) => (r.serviceEndedAt || '') > m ? (r.serviceEndedAt || '') : m, ''),
            });
        }
        return out.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reservations, settings.services]);

    const recent = useMemo(() => [...payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, 25), [payments]);
    const methods: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

    return (
        <div style={{ color: T.ink, paddingBottom: 24 }}>
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>Kasa</h1>
                    <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{payments.length} işlem</p>
                </div>
                <button onClick={() => setSheetOpen(true)} style={{ height: 44, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 14, padding: '0 16px', background: T.orange, color: '#0E0E0E', fontSize: 14, fontWeight: 800, boxShadow: '0 6px 16px rgba(255,90,31,.4)' }}>
                    <Plus size={18} strokeWidth={2.5} /> Tahsilat
                </button>
            </div>
            <div style={{ padding: '0 22px' }}>

            {/* Bugün */}
            <div style={{ marginTop: 20, borderRadius: 20, padding: 20, background: 'linear-gradient(145deg,rgba(255,90,31,.10),rgba(255,90,31,.02))', border: '1px solid rgba(255,90,31,.20)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.16em', color: T.orange, fontFamily: T.mono }}>BUGÜN · TAHSİLAT</p>
                <p style={{ marginTop: 8, fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: T.green }}>{fmt(stats.today)} ₺</p>
                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                    <PeriodChip label="Bu hafta" value={stats.week} />
                    <PeriodChip label="Bu ay" value={stats.month} />
                </div>
            </div>

            {/* Kasada bekleyen adisyonlar — personelin gönderdiği, tahsil edilmeyi bekleyen */}
            {bills.length > 0 && (
                <div style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Receipt size={18} style={{ color: T.orange }} />
                        <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Kasada Bekleyen</h2>
                        <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: T.orange, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900, color: '#0E0E0E', padding: '0 6px' }}>{bills.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {bills.map((b) => (
                            <button key={b.key} onClick={() => { setBill(b); setSheetOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, background: 'rgba(255,90,31,.06)', border: '1px solid rgba(255,90,31,.22)', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {b.customerName}
                                        {b.reservationIds.length > 1 && <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 800, color: T.orange, background: 'rgba(255,90,31,.14)', borderRadius: 999, padding: '1px 7px' }}>{b.reservationIds.length} hizmet</span>}
                                    </p>
                                    <p style={{ fontSize: 11.5, color: T.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.summary}{b.staffNames.length ? ` · ${b.staffNames.join(', ')}` : ''}</p>
                                </div>
                                <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: T.orange, flexShrink: 0 }}>₺{fmt(b.total)}</span>
                                <span style={{ fontSize: 20, color: T.muted2, flexShrink: 0 }}>›</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Yöntem dağılımı */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {methods.map((m) => (
                    <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, background: T.surface, border: `1px solid ${T.border}` }}>
                        <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: T.surface2, color: T.orange }}><MethodIcon m={m} size={18} /></span>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: T.muted }}>{PM_TR[m]}</p>
                            <p style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em' }}>₺{fmt(stats.byMethod[m] || 0)}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Son işlemler */}
            <h2 style={{ marginTop: 28, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Son İşlemler</h2>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recent.length === 0 && (
                    <div style={{ borderRadius: 16, padding: 24, textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, color: T.muted, fontSize: 13 }}>Henüz tahsilat kaydı yok</div>
                )}
                {recent.map((p) => <PaymentRow key={p.id} p={p} name={custName(p.customerId)} />)}
            </div>

            </div>

            <TahsilatSheet
                open={sheetOpen}
                onClose={() => { setSheetOpen(false); setBill(null); }}
                title={bill ? 'Adisyonu Tahsil Et' : undefined}
                prefill={bill ? { amount: bill.total || undefined, customerId: bill.customerId || undefined, description: bill.summary, staffId: bill.staffId, reservationId: bill.firstId } : undefined}
                onPaid={bill ? async () => { for (const id of bill.reservationIds) await updateReservation(id, { isPaid: true }); } : undefined}
            />
        </div>
    );
};

function PeriodChip({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ flex: 1, borderRadius: 14, padding: 12, background: T.surface, border: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: T.muted, fontFamily: T.mono }}>{label.toUpperCase()}</p>
            <p style={{ marginTop: 4, fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>₺{value.toLocaleString('tr-TR')}</p>
        </div>
    );
}

function PaymentRow({ p, name }: { p: Payment; name?: string }) {
    const time = new Date(p.paidAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, background: T.surface, border: `1px solid ${T.border}` }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(124,196,127,.14)', color: T.green, flexShrink: 0 }}><MethodIcon m={p.method} size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || p.description || TYPE_TR[p.type]}</p>
                <p style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>{PM_TR[p.method]} · {time}</p>
            </div>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em', color: T.green, flexShrink: 0 }}>+₺{p.amount.toLocaleString('tr-TR')}</span>
        </div>
    );
}
