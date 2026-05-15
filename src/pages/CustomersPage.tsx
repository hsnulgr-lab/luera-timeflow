import { useState } from 'react';
import { Users, Search, Plus, Phone, Mail, Calendar, Star, Trash2, X, Edit2, ChevronRight } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { cn } from '@/utils/cn';

export const CustomersPage = () => {
    const { customers, searchQuery, setSearchQuery, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
    const [newCust, setNewCust] = useState({ name: '', phone: '', email: '', notes: '' });

    const handleCreate = () => {
        if (!newCust.name || !newCust.phone) return;
        addCustomer(newCust);
        setShowNewDialog(false);
        setNewCust({ name: '', phone: '', email: '', notes: '' });
    };

    const selected = customers.find(c => c.id === selectedCustomer);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                            <Users className="w-5 h-5 text-[#CCFF00]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Müşteriler</h1>
                            <p className="text-sm text-gray-400">{customers.length} müşteri</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowNewDialog(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all hover:shadow-lg hover:shadow-[#CCFF00]/20"
                    >
                        <Plus className="w-4 h-4" />
                        Yeni Müşteri
                    </button>
                </div>

                {/* Search */}
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="İsim, telefon veya e-posta ile arayın..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all bg-white"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Customer List */}
                    <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-200/60 shadow-sm overflow-hidden">
                        <div className="divide-y divide-gray-50">
                            {customers.map((cust) => (
                                <button
                                    key={cust.id}
                                    onClick={() => setSelectedCustomer(cust.id)}
                                    className={cn(
                                        "w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#CCFF00]/[0.03] transition-all group",
                                        selectedCustomer === cust.id && "bg-[#CCFF00]/[0.05]"
                                    )}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 group-hover:from-[#CCFF00]/20 group-hover:to-[#CCFF00]/10 transition-colors">
                                        {cust.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{cust.name}</p>
                                        <div className="flex items-center gap-3 text-[11px] text-gray-400">
                                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{cust.phone}</span>
                                            {cust.email && <span className="hidden sm:flex items-center gap-1"><Mail className="w-3 h-3" />{cust.email}</span>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-bold text-gray-900">{cust.totalReservations}</span>
                                        <p className="text-[10px] text-gray-400">randevu</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#CCFF00] transition-colors" />
                                </button>
                            ))}

                            {customers.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Users className="w-10 h-10 text-gray-200 mb-3" />
                                    <p className="text-sm font-semibold text-gray-700">Müşteri bulunamadı</p>
                                    <p className="text-xs text-gray-400">Yeni müşteri ekleyin veya arama kriterlerinizi değiştirin</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Customer Detail */}
                    <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00]/60 to-transparent" />
                        <div className="absolute top-6 right-6 w-24 h-24 bg-[#CCFF00]/10 rounded-full blur-3xl" />

                        {selected ? (
                            <>
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-[#CCFF00] flex items-center justify-center text-lg font-bold text-slate-900">
                                            {selected.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                                            <p className="text-xs text-slate-400">Kayıt: {selected.createdAt}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { deleteCustomer(selected.id); setSelectedCustomer(null); }}
                                        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-3 mb-6">
                                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
                                        <Phone className="w-4 h-4 text-[#CCFF00]" />
                                        <span className="text-sm text-slate-300">{selected.phone}</span>
                                    </div>
                                    {selected.email && (
                                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
                                            <Mail className="w-4 h-4 text-[#CCFF00]" />
                                            <span className="text-sm text-slate-300">{selected.email}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                        <p className="text-2xl font-bold text-[#CCFF00]">{selected.totalReservations}</p>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Randevu</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                        <p className="text-sm font-bold text-white">{selected.lastVisit || '-'}</p>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Son Ziyaret</p>
                                    </div>
                                </div>

                                {selected.notes && (
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                        <p className="text-[10px] text-[#CCFF00] uppercase tracking-wide font-semibold mb-1">Not</p>
                                        <p className="text-xs text-slate-300">{selected.notes}</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Users className="w-10 h-10 text-slate-600 mb-3" />
                                <p className="text-sm font-semibold text-slate-400">Müşteri Seçin</p>
                                <p className="text-xs text-slate-500 mt-1">Detayları görmek için listeden bir müşteri seçin</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* New Customer Dialog */}
                {showNewDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewDialog(false)} />
                        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
                            <button onClick={() => setShowNewDialog(false)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                                <X className="w-4 h-4" />
                            </button>

                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-[#CCFF00] flex items-center justify-center">
                                    <Plus className="w-5 h-5 text-slate-900" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">Yeni Müşteri</h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Ad Soyad</label>
                                    <input
                                        type="text" placeholder="Müşteri adı"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all"
                                        value={newCust.name} onChange={(e) => setNewCust(p => ({ ...p, name: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Telefon</label>
                                    <input
                                        type="tel" placeholder="0532 xxx xxxx"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all"
                                        value={newCust.phone} onChange={(e) => setNewCust(p => ({ ...p, phone: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">E-posta (opsiyonel)</label>
                                    <input
                                        type="email" placeholder="email@örnek.com"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all"
                                        value={newCust.email} onChange={(e) => setNewCust(p => ({ ...p, email: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Not</label>
                                    <textarea
                                        placeholder="Müşteri hakkında notlar..."
                                        rows={2}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all resize-none"
                                        value={newCust.notes} onChange={(e) => setNewCust(p => ({ ...p, notes: e.target.value }))}
                                    />
                                </div>
                                <button
                                    onClick={handleCreate}
                                    disabled={!newCust.name || !newCust.phone}
                                    className="w-full py-3 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all hover:shadow-lg hover:shadow-[#CCFF00]/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Müşteri Ekle
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
