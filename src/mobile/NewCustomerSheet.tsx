import { useState } from 'react';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import { BottomSheet } from './BottomSheet';
import { T } from './theme';

export function NewCustomerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { addCustomer } = useCustomers();
    const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
    const [saving, setSaving] = useState(false);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const canSave = form.name.trim().length > 0 && form.phone.trim().length > 0 && !saving;

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        const res = await addCustomer({
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim() || undefined,
            notes: form.notes.trim() || undefined,
        });
        setSaving(false);
        if (res) { toast.success('Müşteri eklendi'); setForm({ name: '', phone: '', email: '', notes: '' }); onClose(); }
    };

    const field = { background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontFamily: T.font } as const;

    return (
        <BottomSheet open={open} onClose={onClose} title="Yeni Müşteri">
            <div className="space-y-4 pb-2" style={{ color: T.ink }}>
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Ad Soyad</label>
                    <input autoFocus value={form.name} onChange={set('name')} placeholder="Müşteri adı" className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none" style={field} />
                </div>
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Telefon</label>
                    <input type="tel" value={form.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none" style={field} />
                </div>
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>E-posta <span style={{ opacity: 0.6 }}>(opsiyonel)</span></label>
                    <input type="email" value={form.email} onChange={set('email')} placeholder="ornek@mail.com" className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none" style={field} />
                </div>
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: T.muted }}>Not <span style={{ opacity: 0.6 }}>(opsiyonel)</span></label>
                    <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Müşteri hakkında not" className="w-full resize-none rounded-2xl px-4 py-3.5 text-[15px] outline-none" style={field} />
                </div>

                <button disabled={!canSave} onClick={handleSave}
                    className="mt-2 flex h-14 w-full items-center justify-center rounded-[18px] text-[16px] font-bold transition-opacity disabled:opacity-40"
                    style={{ background: T.orange, color: '#0E0E0E', boxShadow: '0 8px 22px rgba(255,90,31,.4)' }}>
                    {saving ? 'Kaydediliyor…' : 'Müşteri Ekle'}
                </button>
            </div>
        </BottomSheet>
    );
}
