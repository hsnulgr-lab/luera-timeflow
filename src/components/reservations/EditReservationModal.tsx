import { useState, useEffect } from 'react';
import { X, User, Phone, Mail, Clock, Calendar, FileText, Save, Trash2, Wallet } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { cn } from '@/utils/cn';
import type { Reservation } from '@/types';

interface EditReservationModalProps {
    reservation: Reservation;
    isOpen: boolean;
    onClose: () => void;
}

const statusConfig = {
    confirmed: { label: 'Onaylı', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'İptal', color: 'bg-red-100 text-red-700 border-red-200' },
    completed: { label: 'Tamamlandı', color: 'bg-blue-100 text-blue-700 border-blue-200' },
};

export const EditReservationModal = ({ reservation, isOpen, onClose }: EditReservationModalProps) => {
    const { updateReservation, deleteReservation, settings, checkConflict } = useReservations();
    const { addPayment, removeByReservation } = usePayments();
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
    const [conflict, setConflict] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setForm({
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
        setConflict(null);
        setConfirmDelete(false);
        setSaved(false);
    }, [reservation, isOpen]);

    // Check conflicts when time or date changes
    useEffect(() => {
        if (form.date && form.startTime && form.endTime) {
            const conflicting = checkConflict(form.date, form.startTime, form.endTime, reservation.id, reservation.staffId);
            if (conflicting) {
                setConflict(`${conflicting.customerName} - ${conflicting.startTime}/${conflicting.endTime} ile çakışıyor!`);
            } else {
                setConflict(null);
            }
        }
    }, [form.date, form.startTime, form.endTime, reservation.id, reservation.staffId, checkConflict]);

    const handleSave = () => {
        if (!form.customerName || !form.customerPhone) return;
        if (conflict) return;

        const svc = settings.services.find(s => s.name === form.service);
        updateReservation(reservation.id, {
            customerName: form.customerName,
            customerPhone: form.customerPhone,
            customerEmail: form.customerEmail || undefined,
            date: form.date,
            startTime: form.startTime,
            endTime: form.endTime,
            service: form.service,
            serviceColor: svc?.color || reservation.serviceColor,
            status: form.status as Reservation['status'],
            notes: form.notes || undefined,
            isPaid: form.isPaid,
        });

        // Kasa senkronizasyonu: ödendi durumu değiştiyse tahsilat oluştur/geri al
        const wasPaid = reservation.isPaid ?? false;
        if (form.isPaid && !wasPaid) {
            addPayment({
                amount: svc?.price || 0,
                type: 'service',
                method: 'cash',
                description: form.service,
                customerId: reservation.customerId || undefined,
                reservationId: reservation.id,
            });
        } else if (!form.isPaid && wasPaid) {
            removeByReservation(reservation.id);
        }

        setSaved(true);
        setTimeout(() => {
            setSaved(false);
            onClose();
        }, 800);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                {/* Top gradient line */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#CCFF00] via-blue-400/40 to-purple-400/40" />

                {/* Close button */}
                <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all z-10">
                    <X className="w-4 h-4" />
                </button>

                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center shadow-lg">
                            <Calendar className="w-5 h-5 text-[#CCFF00]" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Randevu Düzenle</h3>
                            <p className="text-xs text-gray-400">{reservation.customerName}</p>
                        </div>
                    </div>

                    {/* Conflict Warning */}
                    {conflict && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium flex items-center gap-2">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            {conflict}
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Customer Info */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
                                <User className="w-3 h-3" /> Müşteri Adı
                            </label>
                            <input
                                type="text" value={form.customerName}
                                onChange={(e) => setForm(p => ({ ...p, customerName: e.target.value }))}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
                                    <Phone className="w-3 h-3" /> Telefon
                                </label>
                                <input
                                    type="tel" value={form.customerPhone}
                                    onChange={(e) => setForm(p => ({ ...p, customerPhone: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
                                    <Mail className="w-3 h-3" /> E-posta
                                </label>
                                <input
                                    type="email" value={form.customerEmail}
                                    onChange={(e) => setForm(p => ({ ...p, customerEmail: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Date & Time */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Tarih</label>
                                <input
                                    type="date" value={form.date}
                                    onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                                    className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
                                    <Clock className="w-3 h-3" /> Başlangıç
                                </label>
                                <input
                                    type="time" value={form.startTime}
                                    onChange={(e) => setForm(p => ({ ...p, startTime: e.target.value }))}
                                    className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Bitiş</label>
                                <input
                                    type="time" value={form.endTime}
                                    onChange={(e) => setForm(p => ({ ...p, endTime: e.target.value }))}
                                    className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Service */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Hizmet</label>
                            <div className="flex flex-wrap gap-2">
                                {settings.services.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => {
                                            setForm(p => ({ ...p, service: s.name }));
                                            const [h, m] = form.startTime.split(':').map(Number);
                                            const endMin = h * 60 + m + s.duration;
                                            setForm(p => ({ ...p, endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` }));
                                        }}
                                        className={cn(
                                            "px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 border",
                                            form.service === s.name
                                                ? "text-slate-900 shadow-md"
                                                : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 bg-gray-50"
                                        )}
                                        style={form.service === s.name ? { backgroundColor: s.color, borderColor: s.color, boxShadow: `0 4px 14px ${s.color}30` } : {}}
                                    >
                                        {s.name} ({s.duration}dk)
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Status */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Durum</label>
                            <div className="flex gap-2">
                                {(Object.keys(statusConfig) as (keyof typeof statusConfig)[]).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setForm(p => ({ ...p, status: s }))}
                                        className={cn(
                                            "px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                                            form.status === s
                                                ? statusConfig[s].color
                                                : "border-gray-200 text-gray-400 hover:border-gray-300 bg-gray-50"
                                        )}
                                    >
                                        {statusConfig[s].label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Ödeme durumu */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Ödeme</label>
                            <button
                                type="button"
                                onClick={() => setForm(p => ({ ...p, isPaid: !p.isPaid }))}
                                className={cn(
                                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all border",
                                    form.isPaid
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    <Wallet className="w-4 h-4" />
                                    {form.isPaid ? 'Ödendi' : 'Ödenmedi'}
                                </span>
                                <span className={cn(
                                    "relative inline-flex h-[20px] w-[36px] items-center rounded-full transition-colors flex-shrink-0",
                                    form.isPaid ? "bg-emerald-500" : "bg-gray-300"
                                )}>
                                    <span className={cn(
                                        "inline-block h-[16px] w-[16px] rounded-full bg-white transition-transform",
                                        form.isPaid ? "translate-x-[18px]" : "translate-x-[2px]"
                                    )} />
                                </span>
                            </button>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
                                <FileText className="w-3 h-3" /> Not
                            </label>
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                                placeholder="Ek bilgiler..."
                                rows={2}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleDelete}
                                className={cn(
                                    "px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                                    confirmDelete
                                        ? "bg-red-500 text-white hover:bg-red-600"
                                        : "bg-red-50 text-red-500 hover:bg-red-100"
                                )}
                            >
                                <Trash2 className="w-4 h-4" />
                                {confirmDelete ? 'Emin misin?' : 'Sil'}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!form.customerName || !form.customerPhone || !!conflict}
                                className={cn(
                                    "flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2",
                                    saved
                                        ? "bg-emerald-500 text-white"
                                        : "bg-gradient-to-r from-[#CCFF00] to-[#b8e600] text-slate-900 hover:shadow-xl hover:shadow-[#CCFF00]/25 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                                )}
                            >
                                <Save className="w-4 h-4" />
                                {saved ? 'Kaydedildi!' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
