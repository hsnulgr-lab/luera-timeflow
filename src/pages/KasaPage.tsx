import { useState, useMemo } from 'react';
import { Plus, X, Trash2, Wallet, Package, Banknote, CreditCard, ArrowLeftRight, Coins } from 'lucide-react';
import { toast } from 'sonner';
import { usePayments, type NewPayment } from '@/hooks/usePayments';
import { useProducts } from '@/hooks/useProducts';
import { useReservations } from '@/hooks/useReservations';
import { useCustomers } from '@/hooks/useCustomers';
import { useTheme } from '@/contexts/ThemeContext';
import type { Payment, PaymentMethod, PaymentType } from '@/types';

// ── Design tokens (CustomersPage ile aynı palet) ─────────────────────────────
const LT = {
  ink:'#0E0E0E', cream:'#F3EDE3', orange:'#FF5A1F',
  surface:'#FAF7F3', surface2:'#F0E9DF', surface3:'#E9E1D5',
  border:'rgba(14,14,14,0.09)', border2:'rgba(14,14,14,0.14)',
  muted:'rgba(14,14,14,0.48)', muted2:'rgba(14,14,14,0.30)',
  shadow:'0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm:'0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  r:'14px', rSm:'10px', rXs:'7px',
};
const DT = {
  ink:'#F3EDE3', cream:'#0C0A08', orange:'#FF5A1F',
  surface:'#111009', surface2:'#191610', surface3:'#231E18',
  border:'rgba(243,237,227,0.08)', border2:'rgba(243,237,227,0.20)',
  muted:'rgba(243,237,227,0.45)', muted2:'rgba(243,237,227,0.28)',
  shadow:'0 2px 8px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.25)',
  shadowSm:'0 1px 3px rgba(0,0,0,0.2),0 2px 8px rgba(0,0,0,0.15)',
  r:'14px', rSm:'10px', rXs:'7px',
};

const methodMeta: Record<PaymentMethod, { label: string; icon: typeof Banknote }> = {
  cash:     { label: 'Nakit',   icon: Banknote },
  card:     { label: 'Kart',    icon: CreditCard },
  transfer: { label: 'Havale',  icon: ArrowLeftRight },
  other:    { label: 'Diğer',   icon: Coins },
};
const typeLabel: Record<PaymentType, string> = { service: 'Hizmet', product: 'Ürün', other: 'Diğer' };

function fmt(n: number) { return n.toLocaleString('tr-TR'); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const KasaPage = () => {
  const { dark } = useTheme();
  const T = dark ? DT : LT;

  const { payments, addPayment, removePayment, stats, totalForCustomer } = usePayments();
  const { products, addProduct, removeProduct } = useProducts();
  const { reservations, settings, updateReservation } = useReservations();
  const { allCustomers } = useCustomers();

  const [showPay, setShowPay]   = useState(false);
  const [showProd, setShowProd] = useState(false);

  // Tahsil edilmemiş tamamlanmış randevular (kasa kuyruğu)
  const unpaid = useMemo(
    () => reservations.filter(r => r.status === 'completed' && !r.isPaid),
    [reservations],
  );
  const priceOf = (svc: string) => settings.services.find(s => s.name === svc)?.price || 0;

  // ── Randevuyu tahsil et ──
  const collectReservation = async (resId: string) => {
    const r = reservations.find(x => x.id === resId);
    if (!r) return;
    const amount = priceOf(r.service);
    const p = await addPayment({
      amount,
      type: 'service',
      method: 'cash',
      description: r.service,
      customerId: r.customerId || undefined,
      reservationId: r.id,
    });
    if (p) {
      await updateReservation(r.id, { isPaid: true });
      toast.success(`${r.customerName} — ${fmt(amount)} ₺ tahsil edildi`);
    }
  };

  const card = (label: string, value: number, accent = false) => (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
      padding: '18px 20px', boxShadow: T.shadowSm, flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: accent ? T.orange : T.ink }}>
        {fmt(value)} <span style={{ fontSize: 15, fontWeight: 700 }}>₺</span>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', color: T.ink }}>
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: T.rSm, background: `${T.orange}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={22} color={T.orange} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>Kasa</h1>
            <p style={{ fontSize: 12, color: T.muted }}>Tahsilat ve gelir takibi</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowProd(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: T.rSm,
            background: T.surface2, border: `1px solid ${T.border}`, color: T.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}><Package size={16} /> Ürünler</button>
          <button onClick={() => setShowPay(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: T.rSm,
            background: T.orange, border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
          }}><Plus size={16} /> Tahsilat</button>
        </div>
      </div>

      {/* Özet kartlar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {card('Bugün', stats.today, true)}
        {card('Son 7 Gün', stats.week)}
        {card('Bu Ay', stats.month)}
        {card('Toplam', stats.total)}
      </div>

      {/* Yöntem dağılımı */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {(Object.keys(methodMeta) as PaymentMethod[]).map(m => {
          const Icon = methodMeta[m].icon;
          return (
            <div key={m} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999,
              background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 700, color: T.muted,
            }}>
              <Icon size={14} /> {methodMeta[m].label}: <span style={{ color: T.ink }}>{fmt(stats.byMethod[m] || 0)} ₺</span>
            </div>
          );
        })}
      </div>

      {/* Tahsil bekleyen randevular */}
      {unpaid.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Tahsil bekleyen randevular ({unpaid.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unpaid.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: '12px 14px',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.customerName}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>{r.service} · {r.date}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 800, color: T.orange }}>{fmt(priceOf(r.service))} ₺</span>
                  <button onClick={() => collectReservation(r.id)} style={{
                    padding: '7px 12px', borderRadius: T.rXs, background: T.orange, color: '#fff',
                    border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>Tahsil et</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Son tahsilatlar */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Son tahsilatlar</h2>
        {payments.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: T.muted, background: T.surface, border: `1px dashed ${T.border2}`, borderRadius: T.r }}>
            Henüz tahsilat yok. İlk ödemeyi eklemek için "Tahsilat"a bas.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {payments.map(p => <PaymentRow key={p.id} p={p} T={T} customerName={allCustomers.find(c => c.id === p.customerId)?.name} onDelete={() => removePayment(p.id)} />)}
          </div>
        )}
      </section>

      {showPay && (
        <PaymentModal
          T={T} products={products} customers={allCustomers}
          onClose={() => setShowPay(false)}
          onSave={async (np) => { const r = await addPayment(np); if (r) { toast.success('Tahsilat kaydedildi'); setShowPay(false); } }}
        />
      )}
      {showProd && (
        <ProductModal
          T={T} products={products}
          onAdd={async (n, pr) => { await addProduct(n, pr); }}
          onRemove={removeProduct}
          totalForCustomer={totalForCustomer}
          onClose={() => setShowProd(false)}
        />
      )}
    </div>
  );
};

// ── Tahsilat satırı ──
function PaymentRow({ p, T, customerName, onDelete }: { p: Payment; T: any; customerName?: string; onDelete: () => void }) {
  const Icon = methodMeta[p.method].icon;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: '11px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: T.rXs, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={15} color={T.muted} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.description || typeLabel[p.type]}{customerName ? ` · ${customerName}` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: T.muted }}>{typeLabel[p.type]} · {methodMeta[p.method].label} · {fmtDate(p.paidAt)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{fmt(p.amount)} ₺</span>
        <button onClick={onDelete} title="Sil" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted2, padding: 4 }}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Tahsilat ekle modal ──
function PaymentModal({ T, products, customers, onClose, onSave }: {
  T: any; products: any[]; customers: any[];
  onClose: () => void; onSave: (p: NewPayment) => void;
}) {
  const [type, setType]       = useState<PaymentType>('service');
  const [amount, setAmount]   = useState('');
  const [method, setMethod]   = useState<PaymentMethod>('cash');
  const [desc, setDesc]       = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId]   = useState('');

  const submit = () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast.error('Geçerli bir tutar gir'); return; }
    onSave({
      amount: amt, method, type,
      description: desc || undefined,
      customerId: customerId || undefined,
      productId: type === 'product' && productId ? productId : undefined,
    });
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: T.rSm, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 14, outline: 'none' } as const;
  const labelStyle = { fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6, display: 'block' } as const;

  return (
    <Overlay T={T} onClose={onClose} title="Yeni Tahsilat">
      {/* Tür */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(Object.keys(typeLabel) as PaymentType[]).map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            flex: 1, padding: '9px', borderRadius: T.rSm, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: type === t ? T.orange : T.surface2, color: type === t ? '#fff' : T.muted,
            border: `1px solid ${type === t ? T.orange : T.border}`,
          }}>{typeLabel[t]}</button>
        ))}
      </div>

      {type === 'product' && (
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Ürün</label>
          <select value={productId} style={inputStyle} onChange={e => {
            const id = e.target.value; setProductId(id);
            const pr = products.find(x => x.id === id);
            if (pr) { setAmount(String(pr.price)); setDesc(pr.name); }
          }}>
            <option value="">Ürün seç…</option>
            {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name} — {fmt(pr.price)} ₺</option>)}
          </select>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Tutar (₺)</label>
        <input style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" inputMode="decimal" autoFocus />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Ödeme Yöntemi</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(methodMeta) as PaymentMethod[]).map(m => (
            <button key={m} onClick={() => setMethod(m)} style={{
              flex: 1, padding: '8px', borderRadius: T.rSm, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: method === m ? T.ink : T.surface2, color: method === m ? T.cream : T.muted,
              border: `1px solid ${method === m ? T.ink : T.border}`,
            }}>{methodMeta[m].label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Müşteri (opsiyonel)</label>
        <select style={inputStyle} value={customerId} onChange={e => setCustomerId(e.target.value)}>
          <option value="">— Seçilmedi —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Açıklama (opsiyonel)</label>
        <input style={inputStyle} value={desc} onChange={e => setDesc(e.target.value)} placeholder="örn. Saç kesimi" />
      </div>

      <button onClick={submit} style={{ width: '100%', padding: '12px', borderRadius: T.rSm, background: T.orange, color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
        Kaydet
      </button>
    </Overlay>
  );
}

// ── Ürün yönetimi modal ──
function ProductModal({ T, products, onAdd, onRemove, onClose }: {
  T: any; products: any[]; onAdd: (n: string, p: number) => void; onRemove: (id: string) => void;
  totalForCustomer: (id: string) => number; onClose: () => void;
}) {
  const [name, setName]   = useState('');
  const [price, setPrice] = useState('');

  const add = () => {
    const p = parseFloat(price.replace(',', '.'));
    if (!name.trim()) { toast.error('Ürün adı gir'); return; }
    if (!p || p < 0) { toast.error('Geçerli bir fiyat gir'); return; }
    onAdd(name.trim(), p); setName(''); setPrice('');
  };
  const inputStyle = { padding: '10px 12px', borderRadius: T.rSm, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 14, outline: 'none' } as const;

  return (
    <Overlay T={T} onClose={onClose} title="Ürünler">
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <input style={{ ...inputStyle, flex: 2 }} value={name} onChange={e => setName(e.target.value)} placeholder="Ürün adı" />
        <input style={{ ...inputStyle, flex: 1, minWidth: 0 }} value={price} onChange={e => setPrice(e.target.value)} placeholder="₺" inputMode="decimal" />
        <button onClick={add} style={{ padding: '0 14px', borderRadius: T.rSm, background: T.orange, color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
          <Plus size={18} />
        </button>
      </div>
      {products.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: T.muted, fontSize: 13 }}>Henüz ürün yok.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {products.map(pr => (
            <div key={pr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: T.rSm, background: T.surface2, border: `1px solid ${T.border}` }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{pr.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 800, color: T.orange }}>{fmt(pr.price)} ₺</span>
                <button onClick={() => onRemove(pr.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted2 }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Overlay>
  );
}

// ── Ortak modal kabuğu ──
function Overlay({ T, title, children, onClose }: { T: any; title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: T.shadow, padding: 22, color: T.ink, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: 4 }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
