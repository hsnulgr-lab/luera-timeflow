import { useMemo, useState } from 'react';
import { X, User, Phone, Mail, Clock, Calendar, FileText, Check, Trash2, Wallet } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import type { Reservation } from '@/types';

interface EditReservationModalProps {
    reservation: Reservation;
    isOpen: boolean;
    onClose: () => void;
}

const MONO = "'JetBrains Mono','SFMono-Regular',Consolas,monospace";
// Yeni tasarım dili: krem/siyah/turuncu (--dc-*). Durum seçili rengi token'lardan.
const statusConfig = {
    confirmed: { label: 'Onaylı', bg: 'var(--dc-green-bg)', fg: 'var(--dc-green)' },
    cancelled: { label: 'İptal', bg: 'var(--dc-red-bg)', fg: 'var(--dc-red)' },
    completed: { label: 'Tamamlandı', bg: 'var(--dc-blue-bg)', fg: 'var(--dc-blue)' },
};
// Ortak input sınıfı — krem zemin, turuncu odak
const INPUT = 'w-full px-3.5 py-3 rounded-xl bg-[var(--dc-page)] border border-[var(--dc-border2)] text-[13.5px] text-[var(--dc-ink)] outline-none focus:outline-2 focus:outline-[var(--dc-orange)] focus:-outline-offset-1 transition-all disabled:opacity-60';
const LABEL = 'text-[10px] font-bold text-[var(--dc-muted)] uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2';

export const EditReservationModal = (props: EditReservationModalProps) => (
    <EditReservationModalContent key={`${props.reservation.id}:${props.isOpen ? 'open' : 'closed'}`} {...props} />
);

const EditReservationModalContent = ({ reservation, isOpen, onClose }: EditReservationModalProps) => {
    const { updateReservation, deleteReservation, ensureReservationCustomer, settings, checkConflict } = useReservations();
    const { addPayment, removeByReservation } = usePayments();
    const { dark } = useTheme();
    const [form, setForm] = useState({
        customerName: reservation.customerName,
        customerPhone: reservation.customerPhone,
        customerEmail: reservation.customerEmail || '',
        date: reservation.date,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        service: reservation.service,
        status: reservation.status,
        notes: reservation.notes || '',
        isPaid: reservation.isPaid ?? false,
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    const conflict = useMemo(() => {
        if (!form.date || !form.startTime || !form.endTime) return null;
        const conflicting = checkConflict(form.date, form.startTime, form.endTime, reservation.id, reservation.staffId);
        return conflicting
            ? `${conflicting.customerName} - ${conflicting.startTime}/${conflicting.endTime} ile çakışıyor!`
            : null;
    }, [form.date, form.startTime, form.endTime, reservation.id, reservation.staffId, checkConflict]);

    const handleSave = async () => {
        if (saving || saved || !form.customerName || !form.customerPhone) return;
        if (conflict) return;

        setSaving(true);
        const wasPaid = reservation.isPaid ?? false;
        const paidFlagChanged = form.isPaid !== wasPaid;
        const restorePaidFlag = async () => {
            if (!paidFlagChanged) return;
            await updateReservation(reservation.id, { isPaid: wasPaid });
        };

        try {
            const svc = settings.services.find(s => s.name === form.service);
            const updated = await updateReservation(reservation.id, {
                // Bağlı hastanın kimliği randevu içinden değiştirilmez; aksi halde
                // karttaki isim ile customer_id farklı kişileri gösterebilir.
                ...(!reservation.customerId ? {
                    customerName: form.customerName,
                    customerPhone: form.customerPhone,
                    customerEmail: form.customerEmail || undefined,
                } : {}),
                date: form.date,
                startTime: form.startTime,
                endTime: form.endTime,
                service: form.service,
                serviceColor: svc?.color || reservation.serviceColor,
                status: form.status as Reservation['status'],
                notes: form.notes || undefined,
                isPaid: form.isPaid,
            });
            if (!updated) return;
            let linkedCustomerId = updated.customerId || reservation.customerId || null;
            if (!linkedCustomerId) {
                linkedCustomerId = await ensureReservationCustomer(updated);
                if (!linkedCustomerId) {
                    await restorePaidFlag();
                    return;
                }
            }

            // Kasa senkronizasyonu: ödendi durumu değiştiyse tahsilat oluştur/geri al
            if (form.isPaid && !wasPaid) {
                const payment = await addPayment({
                    amount: svc?.price || 0,
                    type: 'service',
                    method: 'cash',
                    description: form.service,
                    customerId: linkedCustomerId,
                    reservationId: reservation.id,
                });
                if (!payment) {
                    await restorePaidFlag();
                    return;
                }
            } else if (!form.isPaid && wasPaid) {
                // Eski/ücretsiz kayıtlarda isPaid=true olup ayrı bir tahsilat
                // satırı bulunmayabilir. Sunucu DELETE'i bunu doğruladıysa
                // işaretin geri alınmasına izin ver.
                const removed = await removeByReservation(reservation.id, true);
                if (!removed) {
                    await restorePaidFlag();
                    return;
                }
            }

            setSaved(true);
            setTimeout(() => {
                setSaved(false);
                onClose();
            }, 800);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        if (confirmDelete) {
            deleteReservation(reservation.id);
            onClose();
        } else {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={cn('dash-theme fixed inset-0 z-[100] flex items-center justify-center p-4', dark && 'dark')}>
            <div className="absolute inset-0 bg-[rgba(14,14,14,0.48)] backdrop-blur-[2px]" onClick={onClose} />
            <div className="relative w-full max-w-lg max-h-[calc(100vh-32px)] bg-[var(--dc-surface)] rounded-3xl shadow-2xl border border-[var(--dc-border2)] overflow-hidden flex flex-col">
                {/* Başlık */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--dc-border)] flex-shrink-0">
                    <div className="w-[38px] h-[38px] rounded-xl bg-[var(--dc-inkbox)] flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-[var(--dc-inkbox-fg)]" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-extrabold text-[var(--dc-ink)] tracking-[-0.02em]">Randevu Düzenle</h3>
                        <p className="text-[11.5px] text-[var(--dc-muted)] truncate">{reservation.customerName}</p>
                    </div>
                    <button onClick={onClose} aria-label="Kapat" className="ml-auto w-[38px] h-[38px] rounded-lg flex items-center justify-center text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)] hover:text-[var(--dc-ink)] transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
                    {/* Çakışma uyarısı */}
                    {conflict && (
                        <div className="p-3 rounded-xl bg-[var(--dc-red-bg)] text-[var(--dc-red)] text-[13px] font-semibold flex items-center gap-2">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            {conflict}
                        </div>
                    )}
                    {reservation.customerId && (
                        <div className="rounded-xl bg-[var(--dc-amber-bg)] px-3.5 py-2.5 text-[12px] font-semibold text-[var(--dc-amber)] leading-snug">
                            Hasta kimliği bu randevuya bağlıdır. Ad, telefon ve e-posta değişikliklerini Hasta Detayı'ndan yapın.
                        </div>
                    )}

                    {/* Müşteri */}
                    <div>
                        <label className={LABEL}><User className="w-3 h-3" /> Müşteri Adı</label>
                        <input type="text" value={form.customerName} disabled={!!reservation.customerId}
                            onChange={(e) => setForm(p => ({ ...p, customerName: e.target.value }))} className={INPUT} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={LABEL}><Phone className="w-3 h-3" /> Telefon</label>
                            <input type="tel" value={form.customerPhone} disabled={!!reservation.customerId}
                                onChange={(e) => setForm(p => ({ ...p, customerPhone: e.target.value }))} className={INPUT} style={{ fontFamily: MONO }} />
                        </div>
                        <div>
                            <label className={LABEL}><Mail className="w-3 h-3" /> E-posta</label>
                            <input type="email" value={form.customerEmail} disabled={!!reservation.customerId}
                                onChange={(e) => setForm(p => ({ ...p, customerEmail: e.target.value }))} className={INPUT} />
                        </div>
                    </div>

                    {/* Tarih & saat */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className={LABEL}>Tarih</label>
                            <input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} className={INPUT} style={{ fontFamily: MONO }} />
                        </div>
                        <div>
                            <label className={LABEL}><Clock className="w-3 h-3" /> Başlangıç</label>
                            <input type="time" value={form.startTime} onChange={(e) => setForm(p => ({ ...p, startTime: e.target.value }))} className={INPUT} style={{ fontFamily: MONO }} />
                        </div>
                        <div>
                            <label className={LABEL}>Bitiş</label>
                            <input type="time" value={form.endTime} onChange={(e) => setForm(p => ({ ...p, endTime: e.target.value }))} className={INPUT} style={{ fontFamily: MONO }} />
                        </div>
                    </div>

                    {/* Hizmet */}
                    <div>
                        <label className={LABEL}>Hizmet</label>
                        <div className="flex flex-wrap gap-2">
                            {settings.services.map((s) => {
                                const active = form.service === s.name;
                                return (
                                    <button key={s.id} type="button"
                                        onClick={() => {
                                            setForm(p => ({ ...p, service: s.name }));
                                            const [h, m] = form.startTime.split(':').map(Number);
                                            const endMin = h * 60 + m + s.duration;
                                            setForm(p => ({ ...p, endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` }));
                                        }}
                                        className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-bold border transition-colors',
                                            active ? 'bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] border-[var(--dc-inkbox)]'
                                                : 'bg-[var(--dc-surface2)] border-[var(--dc-border)] text-[var(--dc-ink)] hover:border-[var(--dc-ink)]')}>
                                        <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                                        {s.name} <span className="opacity-70" style={{ fontFamily: MONO }}>{s.duration}dk</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Durum */}
                    <div>
                        <label className={LABEL}>Durum</label>
                        <div className="flex gap-2">
                            {(Object.keys(statusConfig) as (keyof typeof statusConfig)[]).map((s) => {
                                const active = form.status === s;
                                return (
                                    <button key={s} type="button" onClick={() => setForm(p => ({ ...p, status: s }))}
                                        className={cn('px-3.5 py-2 rounded-full text-[12px] font-bold border transition-colors',
                                            active ? 'border-transparent' : 'bg-[var(--dc-surface2)] border-[var(--dc-border)] text-[var(--dc-muted)] hover:border-[var(--dc-ink)] hover:text-[var(--dc-ink)]')}
                                        style={active ? { background: statusConfig[s].bg, color: statusConfig[s].fg } : undefined}>
                                        {statusConfig[s].label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Ödeme */}
                    <div>
                        <label className={LABEL}>Ödeme</label>
                        <button type="button" onClick={() => setForm(p => ({ ...p, isPaid: !p.isPaid }))}
                            className={cn('w-full flex items-center justify-between px-4 py-3 rounded-xl text-[13.5px] font-bold transition-colors border',
                                form.isPaid ? 'bg-[var(--dc-green-bg)] text-[var(--dc-green)] border-transparent'
                                    : 'bg-[var(--dc-surface2)] text-[var(--dc-muted)] border-[var(--dc-border2)] hover:border-[var(--dc-ink)]')}>
                            <span className="flex items-center gap-2"><Wallet className="w-4 h-4" />{form.isPaid ? 'Ödendi' : 'Ödenmedi'}</span>
                            <span className={cn('relative inline-flex h-[20px] w-[36px] items-center rounded-full transition-colors flex-shrink-0', form.isPaid ? 'bg-[var(--dc-green)]' : 'bg-[var(--dc-border2)]')}>
                                <span className={cn('inline-block h-[16px] w-[16px] rounded-full bg-white transition-transform', form.isPaid ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
                            </span>
                        </button>
                    </div>

                    {/* Not */}
                    <div>
                        <label className={LABEL}><FileText className="w-3 h-3" /> Not</label>
                        <textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                            placeholder="Ek bilgiler…" rows={2}
                            className={cn(INPUT, 'resize-none placeholder:text-[var(--dc-muted2)]')} />
                    </div>
                </div>

                {/* Alt bar */}
                <div className="flex gap-3 px-5 py-4 border-t border-[var(--dc-border)] flex-shrink-0">
                    <button type="button" onClick={handleDelete}
                        className={cn('px-4 py-3 rounded-full text-[13px] font-bold transition-colors flex items-center gap-2',
                            confirmDelete ? 'bg-[var(--dc-red)] text-white' : 'bg-[var(--dc-red-bg)] text-[var(--dc-red)] hover:brightness-95')}>
                        <Trash2 className="w-4 h-4" />{confirmDelete ? 'Emin misin?' : 'Sil'}
                    </button>
                    <button type="button" onClick={handleSave}
                        disabled={saving || saved || !form.customerName || !form.customerPhone || !!conflict}
                        className={cn('flex-1 py-3 rounded-full font-bold text-[13.5px] transition-all flex items-center justify-center gap-2 hover:-translate-y-px disabled:opacity-35 disabled:cursor-not-allowed disabled:translate-y-0',
                            saved ? 'bg-[var(--dc-green)] text-white' : 'bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] hover:bg-[var(--dc-orange)]')}>
                        <Check className="w-4 h-4" />{saved ? 'Kaydedildi!' : saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
};
