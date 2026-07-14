import { useState } from 'react';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { usePayments } from '@/hooks/usePayments';
import type { PaymentMethod, TreatmentPlan } from '@/types';

const PAY_METHODS: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];
const fmt = (n: number) => n.toLocaleString('tr-TR');

interface T { ink: string; muted: string; surface: string; surface2: string; border: string; border2: string }

// Tedavi planı + taksit takibi — hasta detayına gömülür (masaüstü + mobil
// paylaşır). Taksitler ayrı bir defter değil, mevcut payments (Kasa) tablosuna
// treatmentPlanId ile bağlanır — gelir raporları tek kaynaktan beslenir.
export function TreatmentPlans({ customerId, staffId, T }: { customerId: string; staffId?: string; T: T }) {
    const { plans, addPlan, setPlanStatus } = useTreatmentPlans(customerId);
    const { payments, addPayment } = usePayments();

    const paidFor = (planId: string) => payments.filter((p) => p.treatmentPlanId === planId).reduce((s, p) => s + p.amount, 0);

    const [showNew, setShowNew] = useState(false);
    const [title, setTitle] = useState('');
    const [total, setTotal] = useState('');
    const [savingPlan, setSavingPlan] = useState(false);

    const createPlan = async () => {
        const amount = parseInt(total || '0', 10) || 0;
        if (!title.trim() || amount <= 0) return;
        setSavingPlan(true);
        const p = await addPlan(title.trim(), amount, staffId);
        setSavingPlan(false);
        if (p) { setTitle(''); setTotal(''); setShowNew(false); }
    };

    const [payingId, setPayingId] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
    const [paying, setPaying] = useState(false);

    const openPay = (plan: TreatmentPlan, remaining: number) => {
        setPayingId(plan.id); setPayAmount(String(remaining)); setPayMethod('cash');
    };

    const addInstallment = async (plan: TreatmentPlan, remaining: number) => {
        const amount = parseInt(payAmount || '0', 10) || 0;
        if (amount <= 0) return;
        setPaying(true);
        const p = await addPayment({ amount, method: payMethod, type: 'service', description: `${plan.title} · taksit`, customerId, treatmentPlanId: plan.id, staffId });
        setPaying(false);
        if (p) {
            setPayingId(null);
            if (amount >= remaining) await setPlanStatus(plan.id, 'completed');
        }
    };

    // Kalan bakiye — aktif planların toplamı − plana bağlı ödemeler (denormalize
    // kolon yok; tek kaynak payments). Hastanın borcu bir bakışta görünsün.
    const totalRemaining = plans
        .filter((p) => p.status === 'active')
        .reduce((s, p) => s + Math.max(0, p.totalAmount - paidFor(p.id)), 0);

    return (
        <div>
            {/* v5: kalan bakiye — büyük mono sayı, kırmızı; sıfırsa sakin */}
            {plans.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: totalRemaining > 0 ? '#C0392B' : T.muted, fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(totalRemaining)} ₺
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, marginTop: 3 }}>
                        {totalRemaining > 0 ? 'kalan bakiye' : 'bakiye yok — tüm ödemeler alındı'}
                    </div>
                </div>
            )}
            {plans.length === 0 && !showNew && (
                <div style={{ fontSize: 12.5, color: T.muted, textAlign: 'center', padding: '14px 0' }}>Aktif tedavi planı yok</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {plans.map((plan) => {
                    const paid = paidFor(plan.id);
                    const remaining = Math.max(0, plan.totalAmount - paid);
                    const pct = plan.totalAmount > 0 ? Math.min(100, Math.round((paid / plan.totalAmount) * 100)) : 0;
                    const done = plan.status === 'completed' || remaining <= 0;
                    return (
                        <div key={plan.id} style={{ padding: '13px 14px', borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                                <div style={{ fontSize: 13, fontWeight: 750, color: T.ink, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.title}</div>
                                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: T.muted, flexShrink: 0 }}>%{pct}</span>
                            </div>
                            <div style={{ height: 6, background: T.border, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: '#FF5A1F', borderRadius: 999 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: T.ink }}>{fmt(paid)} ₺ / {fmt(plan.totalAmount)} ₺</span>
                                {done ? (
                                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2E8A35' }}>Ödendi</span>
                                ) : payingId !== plan.id ? (
                                    <button type="button" onClick={() => openPay(plan, remaining)}
                                        style={{ fontSize: 12, fontWeight: 700, color: T.ink, border: `1px solid ${T.border2}`, background: 'none', padding: '7px 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        Taksit Al
                                    </button>
                                ) : null}
                            </div>
                            {payingId === plan.id && (
                                <div style={{ marginTop: 9 }}>
                                    <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="₺"
                                        style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                        {PAY_METHODS.map((m) => (
                                            <button key={m.key} type="button" onClick={() => setPayMethod(m.key)}
                                                style={{ flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                    background: payMethod === m.key ? '#0E0E0E' : T.surface2, color: payMethod === m.key ? '#F3EDE3' : T.muted, border: `1px solid ${T.border2}` }}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button type="button" onClick={() => setPayingId(null)}
                                            style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                            Vazgeç
                                        </button>
                                        <button type="button" disabled={paying} onClick={() => addInstallment(plan, remaining)}
                                            style={{ flex: 2, padding: '8px', borderRadius: 10, border: 'none', background: paying ? T.border2 : '#FF5A1F', color: '#0E0E0E', fontSize: 12, fontWeight: 800, cursor: paying ? 'not-allowed' : 'pointer' }}>
                                            {paying ? 'Kaydediliyor…' : 'Ödemeyi Kaydet'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {!showNew ? (
                <button type="button" onClick={() => setShowNew(true)}
                    style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 10, border: `1px dashed ${T.border2}`, background: 'none', color: T.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    + Yeni Tedavi Planı
                </button>
            ) : (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 14, border: `1px solid ${T.border2}`, background: T.surface }}>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tedavi adı (örn. Kanal Tedavisi - 46)"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                    <input value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Toplam ücret (₺)"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => { setShowNew(false); setTitle(''); setTotal(''); }}
                            style={{ flex: 1, padding: '9px', borderRadius: 10, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Vazgeç
                        </button>
                        <button type="button" disabled={savingPlan} onClick={createPlan}
                            style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none', background: savingPlan ? T.border2 : '#0E0E0E', color: '#F3EDE3', fontSize: 12, fontWeight: 800, cursor: savingPlan ? 'not-allowed' : 'pointer' }}>
                            {savingPlan ? 'Kaydediliyor…' : 'Plan Oluştur'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
