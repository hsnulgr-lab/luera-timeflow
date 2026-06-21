import { useMemo, useState } from 'react';
import { Plus, Banknote, CreditCard, Building2, Wallet } from 'lucide-react';
import { usePayments } from '@/hooks/usePayments';
import { useCustomers } from '@/hooks/useCustomers';
import type { Payment, PaymentMethod, PaymentType } from '@/types';
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

export const MobileKasa = () => {
    const { payments, stats } = usePayments();
    const { allCustomers } = useCustomers();
    const [sheetOpen, setSheetOpen] = useState(false);

    const custName = useMemo(() => {
        const m = new Map(allCustomers.map((c) => [c.id, c.name]));
        return (id?: string) => (id ? m.get(id) : undefined);
    }, [allCustomers]);

    const recent = useMemo(() => [...payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, 25), [payments]);
    const methods: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

    return (
        <div style={{ padding: '14px 22px 0', color: T.ink }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>Kasa</h1>
                    <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{payments.length} işlem</p>
                </div>
                <button onClick={() => setSheetOpen(true)} style={{ height: 44, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 14, padding: '0 16px', background: T.orange, color: '#0E0E0E', fontSize: 14, fontWeight: 800, boxShadow: '0 6px 16px rgba(255,90,31,.4)' }}>
                    <Plus size={18} strokeWidth={2.5} /> Tahsilat
                </button>
            </div>

            {/* Bugün */}
            <div style={{ marginTop: 20, borderRadius: 20, padding: 20, background: 'linear-gradient(145deg,rgba(255,90,31,.10),rgba(255,90,31,.02))', border: '1px solid rgba(255,90,31,.20)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.16em', color: T.orange, fontFamily: T.mono }}>BUGÜN · TAHSİLAT</p>
                <p style={{ marginTop: 8, fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: T.green }}>{fmt(stats.today)} ₺</p>
                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                    <PeriodChip label="Bu hafta" value={stats.week} />
                    <PeriodChip label="Bu ay" value={stats.month} />
                </div>
            </div>

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

            <TahsilatSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
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
