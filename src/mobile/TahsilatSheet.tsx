import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Building2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { usePayments } from '@/hooks/usePayments';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import type { PaymentMethod } from '@/types';
import { BottomSheet } from './BottomSheet';
import { T } from './theme';

const METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: 'Nakit', icon: <Banknote size={18} /> },
    { id: 'card', label: 'Kart', icon: <CreditCard size={18} /> },
    { id: 'transfer', label: 'Havale', icon: <Building2 size={18} /> },
    { id: 'other', label: 'Diğer', icon: <Wallet size={18} /> },
];

// Adisyon satırı — hangi hizmeti hangi personel yaptı, tutarı ne.
// Birden fazla personel varsa tahsilat satır bazında bölünüp her personele yazılır.
export interface TahsilatLine {
    reservationId: string;
    staffId?: string;
    staffName?: string;
    amount: number;
    name: string;
}

// Randevu "Tamamla & Tahsilat" akışında bağlamı önceden doldurmak için.
export interface TahsilatPrefill {
    amount?: number;
    customerId?: string;
    description?: string;
    staffId?: string;
    reservationId?: string;
    lines?: TahsilatLine[];
}

export function TahsilatSheet({ open, onClose, lockStaffId, prefill, onPaid, title }: {
    open: boolean; onClose: () => void; lockStaffId?: string;
    prefill?: TahsilatPrefill;
    onPaid?: () => void;        // ödeme başarılıysa (randevu tamamlama vb.)
    title?: string;
}) {
    const { addPayment } = usePayments();
    const { allCustomers } = useCustomers();
    const { staff } = useStaff();

    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [customerId, setCustomerId] = useState('');
    const [custQuery, setCustQuery] = useState('');
    const [description, setDescription] = useState('');
    const [staffId, setStaffId] = useState(lockStaffId || '');
    const [saving, setSaving] = useState(false);

    // Açılışta prefill ile bağlamı doldur (randevudan gelince)
    useEffect(() => {
        if (!open) return;
        setAmount(prefill?.amount ? String(prefill.amount) : '');
        setCustomerId(prefill?.customerId || '');
        setDescription(prefill?.description || '');
        setStaffId(prefill?.staffId || lockStaffId || '');
        setMethod('cash'); setCustQuery('');
        // open değişimini izle; prefill referansı her render değişebileceğinden alanlara bak
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const matches = useMemo(() => {
        const q = custQuery.trim().toLowerCase();
        if (!q) return [];
        return allCustomers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 5);
    }, [custQuery, allCustomers]);

    const selectedCustomer = allCustomers.find((c) => c.id === customerId);
    const amountNum = Number(amount.replace(/[^\d]/g, ''));
    const canSave = amountNum > 0 && !saving;

    // Adisyonda birden fazla personel varsa tahsilat satır bazında bölünür.
    // Tutar değiştirilirse (indirim vb.) paylar oransal dağıtılır, küsurat son satıra.
    const splitLines = useMemo(() => {
        const lines = prefill?.lines;
        if (!lines || lines.length < 2) return null;
        if (new Set(lines.map((l) => l.staffId || '')).size < 2) return null;
        return lines;
    }, [prefill?.lines]);
    const splitShares = useMemo(() => {
        if (!splitLines) return null;
        const base = splitLines.reduce((s, l) => s + l.amount, 0);
        if (base <= 0) return null;
        let remaining = amountNum;
        return splitLines.map((l, i) => {
            const amt = i === splitLines.length - 1 ? remaining : Math.round(amountNum * (l.amount / base));
            remaining -= amt;
            return { ...l, share: amt };
        });
    }, [splitLines, amountNum]);

    const reset = () => { setAmount(''); setMethod('cash'); setCustomerId(''); setCustQuery(''); setDescription(''); setStaffId(lockStaffId || ''); };

    const handleSave = async () => {
        if (amountNum <= 0) return;
        setSaving(true);
        let ok: boolean;
        if (splitShares) {
            // Çok personelli adisyon: her hizmet satırı kendi personeline yazılır
            const results = [];
            for (const l of splitShares) {
                if (l.share <= 0) continue;
                results.push(await addPayment({ amount: l.share, method, type: 'service', customerId: customerId || undefined, description: l.name, staffId: l.staffId, reservationId: l.reservationId }));
            }
            ok = results.length > 0 && results.every(Boolean);
        } else {
            const res = await addPayment({ amount: amountNum, method, type: 'service', customerId: customerId || undefined, description: description.trim() || undefined, staffId: staffId || undefined, reservationId: prefill?.reservationId });
            ok = !!res;
        }
        setSaving(false);
        if (ok) { toast.success('Tahsilat kaydedildi'); reset(); onPaid?.(); onClose(); }
        else { toast.error('Tahsilat kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.'); }
    };

    const activeStaff = staff.filter((s) => s.isActive);

    const field = { background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontFamily: T.font } as const;

    return (
        <BottomSheet open={open} onClose={onClose} title={title || 'Yeni Tahsilat'}>
            <div className="space-y-5 pb-2" style={{ color: T.ink }}>
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Tutar</label>
                    <div className="flex items-center rounded-2xl px-4 py-3.5" style={field}>
                        <span className="text-[24px] font-black" style={{ color: T.green }}>₺</span>
                        <input type="text" inputMode="numeric" autoFocus value={amount}
                            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0"
                            className="ml-2 w-full bg-transparent text-[26px] font-black outline-none" style={{ color: T.ink }} />
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Ödeme Yöntemi</label>
                    <div className="grid grid-cols-4 gap-2">
                        {METHODS.map((m) => {
                            const sel = method === m.id;
                            return (
                                <button key={m.id} onClick={() => setMethod(m.id)} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors"
                                    style={{ background: sel ? T.orange : T.surface, border: `1px solid ${sel ? T.orange : T.border}`, color: sel ? '#0E0E0E' : T.ink }}>
                                    {m.icon}
                                    <span className="text-[11px] font-bold">{m.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Müşteri <span style={{ opacity: 0.6 }}>(opsiyonel)</span></label>
                    {selectedCustomer ? (
                        <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={field}>
                            <span className="text-[15px] font-bold">{selectedCustomer.name}</span>
                            <button onClick={() => { setCustomerId(''); setCustQuery(''); }} className="text-[13px] font-semibold" style={{ color: T.orange }}>Kaldır</button>
                        </div>
                    ) : (
                        <>
                            <input value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="İsim veya telefon ara"
                                className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none" style={field} />
                            {matches.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                    {matches.map((c) => (
                                        <button key={c.id} onClick={() => { setCustomerId(c.id); setCustQuery(''); }} className="flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left" style={{ background: T.surface2 }}>
                                            <span className="text-[14px] font-semibold">{c.name}</span>
                                            <span className="text-[12px]" style={{ color: T.muted }}>{c.phone}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Açıklama <span style={{ opacity: 0.6 }}>(opsiyonel)</span></label>
                    <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Açıklama (ops.)"
                        className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none" style={field} />
                </div>

                {splitShares ? (
                    <div>
                        <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Personel Dağılımı</label>
                        <div className="space-y-1.5">
                            {splitShares.map((l) => (
                                <div key={l.reservationId} className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                                    <div style={{ minWidth: 0 }}>
                                        <span className="text-[13.5px] font-bold">{l.staffName || 'Atanmamış'}</span>
                                        <span className="ml-2 text-[11.5px]" style={{ color: T.muted }}>{l.name}</span>
                                    </div>
                                    <span className="text-[13.5px] font-black" style={{ color: T.green, flexShrink: 0 }}>₺{l.share.toLocaleString('tr-TR')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : !lockStaffId && activeStaff.length > 0 && (
                    <div>
                        <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Personel <span style={{ opacity: 0.6 }}>(opsiyonel)</span></label>
                        <div className="flex flex-wrap gap-2">
                            {activeStaff.map((s) => {
                                const sel = staffId === s.id;
                                return (
                                    <button key={s.id} onClick={() => setStaffId(sel ? '' : s.id)}
                                        className="rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors"
                                        style={{ background: sel ? T.orange : T.surface, border: `1px solid ${sel ? T.orange : T.border}`, color: sel ? '#0E0E0E' : T.ink }}>
                                        {s.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <button disabled={!canSave} onClick={handleSave}
                    className="mt-2 flex h-14 w-full items-center justify-center rounded-[18px] text-[16px] font-bold transition-opacity disabled:opacity-40"
                    style={{ background: T.green, color: '#0a2e16', boxShadow: '0 8px 22px rgba(124,196,127,0.25)' }}>
                    {saving ? 'Kaydediliyor…' : `₺${amountNum.toLocaleString('tr-TR')} Tahsil Et`}
                </button>
            </div>
        </BottomSheet>
    );
}
