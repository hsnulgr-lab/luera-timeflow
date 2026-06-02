import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, CheckCircle2, XCircle, AlertCircle, Clock, Trash2, ChevronDown, Phone, Mail, MoreHorizontal, Edit2, MessageCircle } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import type { Reservation } from '@/types';

const statusConfig = {
    pending: { label: 'Bekleyen', color: 'bg-amber-100 text-amber-700', icon: AlertCircle, dot: 'bg-amber-500' },
    confirmed: { label: 'Onaylı', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, dot: 'bg-emerald-500' },
    cancelled: { label: 'İptal', color: 'bg-red-100 text-red-700', icon: XCircle, dot: 'bg-red-500' },
    completed: { label: 'Tamamlandı', color: 'bg-blue-100 text-blue-700', icon: Clock, dot: 'bg-blue-500' },
};

type StatusFilter = 'all' | Reservation['status'];

export const ReservationsPage = () => {
    const { reservations, updateReservation, deleteReservation } = useReservations();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [showActions, setShowActions] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const actionBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [editReservation, setEditReservation] = useState<Reservation | null>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!showActions) return;
        const handler = (e: MouseEvent) => {
            const btn = actionBtnRefs.current[showActions];
            if (btn && btn.contains(e.target as Node)) return;
            if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
            setShowActions(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showActions]);

    const openActions = useCallback((id: string) => {
        if (showActions === id) { setShowActions(null); return; }
        const btn = actionBtnRefs.current[id];
        if (btn) {
            const rect = btn.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 6, left: rect.right - 176 }); // 176 = w-44 = 11rem
        }
        setShowActions(id);
    }, [showActions]);

    const filtered = reservations
        .filter(r => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (search) {
                const q = search.toLowerCase();
                return r.customerName.toLowerCase().includes(q) || r.customerPhone.includes(q) || r.service.toLowerCase().includes(q);
            }
            return true;
        })
        .sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return a.startTime.localeCompare(b.startTime);
        });

    const handleStatusChange = (id: string, status: Reservation['status']) => {
        updateReservation(id, { status });
        setShowActions(null);
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
            <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 flex flex-col p-6">
                {/* Header */}
                <div className="mb-6 flex-shrink-0">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-[#CCFF00]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Rezervasyonlar</h1>
                            <p className="text-sm text-gray-400">{reservations.length} toplam kayıt</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-shrink-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="İsim, telefon veya hizmet ara..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all bg-white"
                        />
                    </div>
                    <div className="flex gap-2">
                        {(['all', 'pending', 'confirmed', 'completed', 'cancelled'] as StatusFilter[]).map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={cn(
                                    "px-3 py-2 rounded-xl text-xs font-semibold transition-all border",
                                    statusFilter === s
                                        ? "bg-[#CCFF00] text-slate-900 border-[#CCFF00]"
                                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                )}
                            >
                                {s === 'all' ? 'Tümü' : statusConfig[s].label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm flex-1 min-h-0 overflow-y-auto">
                    {/* Desktop Table */}
                    <div className="hidden md:block">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Müşteri</th>
                                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tarih / Saat</th>
                                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Hizmet</th>
                                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Durum</th>
                                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((res) => {
                                    const status = statusConfig[res.status];
                                    return (
                                        <tr key={res.id} className="border-b border-gray-50 hover:bg-[#CCFF00]/[0.02] transition-colors group">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                                                        style={{ backgroundColor: res.serviceColor || '#CCFF00', color: res.serviceColor === '#CCFF00' ? '#000' : '#fff' }}>
                                                        {res.customerName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-semibold text-gray-900">{res.customerName}</p>
                                                            {/* WhatsApp hatırlatma göstergesi */}
                                                            {(res.reminder24hSent || res.reminder2hSent) && (
                                                                <span
                                                                    title={[
                                                                        res.reminder24hSent ? '24h hatırlatma gönderildi' : '',
                                                                        res.reminder2hSent  ? '2h hatırlatma gönderildi'  : '',
                                                                    ].filter(Boolean).join(' · ')}
                                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-emerald-600"
                                                                >
                                                                    <MessageCircle className="w-3 h-3" />
                                                                    <span className="text-[10px] font-bold">
                                                                        {res.reminder24hSent && res.reminder2hSent ? '24h+2h' : res.reminder24hSent ? '24h' : '2h'}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[11px] text-gray-400">
                                                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{res.customerPhone}</span>
                                                            {res.customerEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{res.customerEmail}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-sm font-medium text-gray-900">{res.date}</p>
                                                <p className="text-xs text-gray-400">{res.startTime} - {res.endTime}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: res.serviceColor || '#CCFF00' }} />
                                                    <span className="text-sm text-gray-700">{res.service}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold", status.color)}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <button
                                                    ref={(el) => { actionBtnRefs.current[res.id] = el; }}
                                                    onClick={() => openActions(res.id)}
                                                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                                                >
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden p-4 space-y-3">
                        {filtered.map((res) => {
                            const status = statusConfig[res.status];
                            return (
                                <div key={res.id} className="p-4 rounded-xl border border-gray-100 hover:border-[#CCFF00]/30 transition-all">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                                style={{ backgroundColor: res.serviceColor || '#CCFF00', color: res.serviceColor === '#CCFF00' ? '#000' : '#fff' }}>
                                                {res.customerName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-semibold text-gray-900">{res.customerName}</p>
                                                    {(res.reminder24hSent || res.reminder2hSent) && (
                                                        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-600">
                                                            <MessageCircle className="w-2.5 h-2.5" />
                                                            <span className="text-[9px] font-bold">
                                                                {res.reminder24hSent && res.reminder2hSent ? '24h+2h' : res.reminder24hSent ? '24h' : '2h'}
                                                            </span>
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-gray-400">{res.customerPhone}</p>
                                            </div>
                                        </div>
                                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", status.color)}>
                                            {status.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        <span>{res.date}</span>
                                        <span>{res.startTime} - {res.endTime}</span>
                                        <span className="flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: res.serviceColor || '#CCFF00' }} />
                                            {res.service}
                                        </span>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        {res.status === 'pending' && (
                                            <button onClick={() => handleStatusChange(res.id, 'confirmed')} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                                                Onayla
                                            </button>
                                        )}
                                        {res.status !== 'cancelled' && (
                                            <button onClick={() => handleStatusChange(res.id, 'cancelled')} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                                                İptal
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Clock className="w-10 h-10 text-gray-200 mb-3" />
                            <p className="text-sm font-semibold text-gray-700">Sonuç bulunamadı</p>
                            <p className="text-xs text-gray-400">Arama veya filtre kriterlerinizi değiştirin</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Portal Dropdown Menu */}
            {showActions && (() => {
                const res = reservations.find(r => r.id === showActions);
                if (!res) return null;
                const status = statusConfig[res.status];
                return createPortal(
                    <div
                        className="fixed inset-0"
                        style={{ zIndex: 9999 }}
                        onClick={() => setShowActions(null)}
                    >
                        <div
                            ref={menuRef}
                            className="absolute w-44 bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 animate-in fade-in"
                            style={{ top: menuPos.top, left: menuPos.left }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button onClick={() => { setEditReservation(res); setShowActions(null); }} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <Edit2 className="w-3.5 h-3.5 text-[#7a9900]" /> Düzenle
                            </button>
                            {res.status !== 'confirmed' && (
                                <button onClick={() => handleStatusChange(res.id, 'confirmed')} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Onayla
                                </button>
                            )}
                            {res.status !== 'completed' && (
                                <button onClick={() => handleStatusChange(res.id, 'completed')} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-blue-500" /> Tamamlandı
                                </button>
                            )}
                            {res.status !== 'cancelled' && (
                                <button onClick={() => handleStatusChange(res.id, 'cancelled')} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <XCircle className="w-3.5 h-3.5 text-red-500" /> İptal Et
                                </button>
                            )}
                            <div className="border-t border-gray-100 my-1" />
                            <button onClick={() => { deleteReservation(res.id); setShowActions(null); }} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                                <Trash2 className="w-3.5 h-3.5" /> Sil
                            </button>
                        </div>
                    </div>,
                    document.body
                );
            })()}

            {/* Edit Modal */}
            {editReservation && (
                <EditReservationModal
                    reservation={editReservation}
                    isOpen={!!editReservation}
                    onClose={() => setEditReservation(null)}
                />
            )}
        </div>
    );
};
