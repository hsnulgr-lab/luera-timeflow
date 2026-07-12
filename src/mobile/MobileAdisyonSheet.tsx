import { useMemo, useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useTableReservations } from '@/hooks/useTableReservations';
import { usePayments } from '@/hooks/usePayments';
import { adisyonTotal, adisyonSummary, groupMenu, addMenuItem, addExtraItem, changeQty } from '@/utils/masaAdisyon';
import type { TableReservation, PaymentMethod, Product } from '@/types';
import { BottomSheet } from './BottomSheet';
import { T } from './theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const PAY_METHODS: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];

// Yönetici/kasiyer için ödeme alan adisyon sheet'i — masaüstü MasaPage.tsx'teki
// MasaAdisyonModal/completeTable ile aynı mantık (menüden kalem, ödeme yöntemi,
// Tahsil Et & Kapat / Tahsilatsız Kapat). Garson tarafındaki MobileMasaDetail
// (staff/) ödeme ALMAZ — hesap kasada kapanır; bu bileşen o kasa adımıdır.
export function MobileAdisyonSheet({ open, reservation, tableName, onClose, onClosed }: {
    open: boolean;
    reservation: TableReservation | null;
    tableName: string;
    onClose: () => void;
    onClosed?: () => void;
}) {
    const { products } = useProducts();
    const { reservations, updateAdisyon, setStatus } = useTableReservations(reservation?.date || '');
    const { addPayment } = usePayments();

    const r = reservation ? (reservations.find((x) => x.id === reservation.id) || reservation) : null;
    const items = r?.adisyonItems || [];
    const total = adisyonTotal(items);
    const menu = useMemo(() => groupMenu(products), [products]);
    const [cat, setCat] = useState('');
    const activeCat = cat || menu[0]?.category || '';
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [busy, setBusy] = useState(false);
    const [exName, setExName] = useState('');
    const [exPrice, setExPrice] = useState('');
    const catItems = menu.find((m) => m.category === activeCat)?.items || [];

    if (!r) return null;

    const add = (p: Product) => updateAdisyon(r.id, (prev) => addMenuItem(prev, p));
    const qty = (id: string, d: number) => updateAdisyon(r.id, (prev) => changeQty(prev, id, d));
    const addExtra = () => {
        const price = parseInt(exPrice || '0', 10) || 0;
        if (!exName.trim() || price <= 0) return;
        updateAdisyon(r.id, (prev) => addExtraItem(prev, exName.trim(), price));
        setExName(''); setExPrice('');
    };

    const close = async (amount: number, confirmedNoPayment?: boolean) => {
        if (amount === 0 && !confirmedNoPayment) {
            if (!window.confirm(`${tableName} hesabı ödemesiz kapatılacak (ikram/iptal). Emin misin?`)) return;
        }
        setBusy(true);
        try {
            if (amount > 0) {
                const p = await addPayment({
                    amount, method, type: 'service',
                    description: `${tableName} · ${adisyonSummary(items) || r.customerName}`,
                    customerId: r.customerId, staffId: r.staffId,
                });
                if (!p) return; // addPayment zaten hata toast'unu gösterdi
            }
            const ok = await setStatus(r.id, 'completed', true);
            if (!ok) return; // setStatus zaten hata toast'unu gösterdi — sheet açık kalır
            onClosed?.();
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={`${tableName} · Adisyon`}>
            <p style={{ fontSize: 12.5, color: T.muted, marginTop: -8, marginBottom: 16 }}>{r.customerName} · {r.partySize} kişi · {r.startTime}</p>

            {items.length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted, padding: '14px 12px', background: T.surface2, borderRadius: 14, marginBottom: 16, textAlign: 'center' }}>Adisyon boş — menüden kalem ekle</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                    {items.map((it) => (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 13, background: T.surface2, border: `1px solid ${T.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 750, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                                <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>{fmt(it.price)} ₺ {it.kind === 'extra' ? '· ekstra' : ''}</div>
                            </div>
                            <button onClick={() => qty(it.id, -1)} style={qtyBtn}><Minus size={13} /></button>
                            <span style={{ minWidth: 18, textAlign: 'center', fontSize: 14, fontWeight: 850, fontFamily: T.mono, color: T.ink }}>{it.qty}</span>
                            <button onClick={() => qty(it.id, +1)} style={qtyBtn}><Plus size={13} /></button>
                            <span style={{ width: 62, textAlign: 'right', fontSize: 13.5, fontWeight: 850, fontFamily: T.mono, color: T.ink }}>{fmt(it.price * it.qty)} ₺</span>
                        </div>
                    ))}
                </div>
            )}

            {menu.length > 0 ? (
                <>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 9, overflowX: 'auto', paddingBottom: 2 }}>
                        {menu.map((m) => (
                            <button key={m.category} onClick={() => setCat(m.category)} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 750, cursor: 'pointer', fontFamily: T.font, background: activeCat === m.category ? T.orange : T.surface2, color: activeCat === m.category ? '#0E0E0E' : T.muted, border: `1px solid ${activeCat === m.category ? T.orange : T.border}` }}>{m.category}</button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, maxHeight: 176, overflowY: 'auto' }}>
                        {catItems.map((p) => (
                            <button key={p.id} onClick={() => add(p)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '11px 12px', borderRadius: 14, background: T.surface2, border: `1px solid ${T.border}`, cursor: 'pointer', fontFamily: T.font, textAlign: 'left' }}>
                                <span style={{ fontSize: 12.5, fontWeight: 750, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{p.name}</span>
                                <span style={{ fontSize: 12, color: T.orange, fontWeight: 800, fontFamily: T.mono }}>{fmt(p.price)} ₺</span>
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>Menü boş — Kasa &gt; Ürünler'den ürün ekleyebilirsin.</div>
            )}

            <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
                <input value={exName} onChange={(e) => setExName(e.target.value)} placeholder="Serbest kalem" style={{ ...inp, flex: 2 }} />
                <input value={exPrice} onChange={(e) => setExPrice(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="₺" style={{ ...inp, flex: 1, minWidth: 0 }} />
                <button onClick={addExtra} style={{ padding: '0 14px', borderRadius: 12, background: T.surface3, color: T.ink, border: 'none', cursor: 'pointer', fontWeight: 850, fontSize: 18 }}>+</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '11px 0', borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>Toplam</span>
                <span style={{ fontSize: 25, fontWeight: 900, letterSpacing: '-0.03em', color: T.orange }}>{fmt(total)} <span style={{ fontSize: 15 }}>₺</span></span>
            </div>

            <div style={{ display: 'flex', gap: 6, margin: '9px 0 14px' }}>
                {PAY_METHODS.map((m) => (
                    <button key={m.key} onClick={() => setMethod(m.key)} style={{ flex: 1, padding: '9px 4px', borderRadius: 11, fontSize: 12, fontWeight: 750, cursor: 'pointer', fontFamily: T.font, background: method === m.key ? T.ink : T.surface2, color: method === m.key ? T.bg : T.muted, border: `1px solid ${method === m.key ? T.ink : T.border}` }}>{m.label}</button>
                ))}
            </div>

            <button disabled={total <= 0 || busy} onClick={() => close(total)} style={primaryBtn(total <= 0 || busy)}>
                {total > 0 ? `${fmt(total)} ₺ Tahsil Et & Kapat` : 'Adisyon boş'}
            </button>
            <button disabled={busy} onClick={() => close(0)} style={ghostBtn}>Tahsilatsız Kapat (ikram/iptal)</button>
        </BottomSheet>
    );
}

const qtyBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', border: `1px solid ${T.border2}`, background: T.surface, color: T.ink, cursor: 'pointer', flexShrink: 0 };
const inp: React.CSSProperties = { background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: 12, padding: '11px 13px', fontFamily: T.font, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box' };
function primaryBtn(disabled: boolean): React.CSSProperties {
    return { width: '100%', padding: '15px', borderRadius: 15, border: 'none', background: disabled ? T.surface3 : T.orange, color: disabled ? T.muted2 : '#0E0E0E', fontSize: 15, fontWeight: 850, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.font, boxShadow: disabled ? 'none' : '0 6px 18px rgba(255,90,31,0.32)' };
}
const ghostBtn: React.CSSProperties = { width: '100%', marginTop: 9, padding: '13px', borderRadius: 13, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font };
