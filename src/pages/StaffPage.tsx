import { useState } from 'react';
import { Users, Plus, Edit2, Trash2, X, Phone, Mail, Briefcase, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useStaff } from '@/hooks/useStaff';
import { cn } from '@/utils/cn';
import type { Staff, WorkingHours } from '@/types';

const COLORS = [
    '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B',
    '#10B981', '#F97316', '#CCFF00', '#EF4444',
];

const DEFAULT_HOURS: WorkingHours[] = [
    { day: 0, dayName: 'Pazar',     start: '09:00', end: '18:00', isOff: true },
    { day: 1, dayName: 'Pazartesi', start: '09:00', end: '18:00', isOff: false },
    { day: 2, dayName: 'Salı',      start: '09:00', end: '18:00', isOff: false },
    { day: 3, dayName: 'Çarşamba',  start: '09:00', end: '18:00', isOff: false },
    { day: 4, dayName: 'Perşembe',  start: '09:00', end: '18:00', isOff: false },
    { day: 5, dayName: 'Cuma',      start: '09:00', end: '18:00', isOff: false },
    { day: 6, dayName: 'Cumartesi', start: '10:00', end: '15:00', isOff: false },
];

interface StaffForm {
    name: string;
    specialty: string;
    phone: string;
    email: string;
    color: string;
    useCustomHours: boolean;
    workingHours: WorkingHours[];
}

const emptyForm = (): StaffForm => ({
    name: '', specialty: '', phone: '', email: '',
    color: COLORS[0],
    useCustomHours: false,
    workingHours: DEFAULT_HOURS,
});

export const StaffPage = () => {
    const { staff, isLoading, addStaff, updateStaff, deleteStaff } = useStaff();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing]     = useState<Staff | null>(null);
    const [form, setForm]           = useState<StaffForm>(emptyForm());
    const [saving, setSaving]       = useState(false);

    const openAdd = () => {
        setEditing(null);
        setForm(emptyForm());
        setShowModal(true);
    };

    const openEdit = (member: Staff) => {
        setEditing(member);
        setForm({
            name:           member.name,
            specialty:      member.specialty || '',
            phone:          member.phone || '',
            email:          member.email || '',
            color:          member.color,
            useCustomHours: !!member.workingHours,
            workingHours:   member.workingHours || DEFAULT_HOURS,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Personel adı gerekli'); return; }
        setSaving(true);
        const payload = {
            name:         form.name.trim(),
            specialty:    form.specialty.trim() || undefined,
            phone:        form.phone.trim() || undefined,
            email:        form.email.trim() || undefined,
            color:        form.color,
            workingHours: form.useCustomHours ? form.workingHours : undefined,
            isActive:     true,
        };

        if (editing) {
            await updateStaff(editing.id, payload);
            toast.success('Personel güncellendi');
        } else {
            await addStaff(payload);
            toast.success('Personel eklendi');
        }
        setSaving(false);
        setShowModal(false);
    };

    const handleDelete = async (member: Staff) => {
        if (!confirm(`"${member.name}" personelini kaldırmak istediğinizden emin misiniz?`)) return;
        await deleteStaff(member.id);
    };

    const updateHour = (day: number, field: keyof WorkingHours, value: string | boolean) => {
        setForm(prev => ({
            ...prev,
            workingHours: prev.workingHours.map(h => h.day === day ? { ...h, [field]: value } : h),
        }));
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                            <Users className="w-5 h-5 text-[#CCFF00]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Personel</h1>
                            <p className="text-sm text-gray-400">{staff.length} aktif çalışan</p>
                        </div>
                    </div>
                    <button onClick={openAdd}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all hover:shadow-lg hover:shadow-[#CCFF00]/20">
                        <Plus className="w-4 h-4" /> Personel Ekle
                    </button>
                </div>

                {/* Liste */}
                {isLoading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-8 h-8 rounded-full border-2 border-[#CCFF00]/30 border-t-[#CCFF00] animate-spin" />
                    </div>
                ) : staff.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-white border border-gray-200/60">
                        <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4">
                            <Users className="w-7 h-7 text-slate-300" />
                        </div>
                        <p className="text-sm font-bold text-gray-700 mb-1">Henüz personel yok</p>
                        <p className="text-xs text-gray-400 mb-4">Çalışanlarınızı ekleyin, takvimlerini yönetin</p>
                        <button onClick={openAdd}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-colors">
                            <Plus className="w-4 h-4" /> İlk Personeli Ekle
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {staff.map(member => (
                            <div key={member.id}
                                className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 shadow-sm hover:shadow-md transition-all p-5">
                                {/* Renk şeridi */}
                                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                                    style={{ backgroundColor: member.color }} />

                                <div className="flex items-start justify-between mt-2">
                                    <div className="flex items-center gap-3">
                                        {/* Avatar */}
                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                                            style={{ backgroundColor: member.color }}>
                                            {member.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-base font-bold text-gray-900">{member.name}</p>
                                            {member.specialty && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Briefcase className="w-3 h-3" /> {member.specialty}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => openEdit(member)}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(member)}
                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* İletişim */}
                                {(member.phone || member.email) && (
                                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3">
                                        {member.phone && (
                                            <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                                <Phone className="w-3 h-3" /> {member.phone}
                                            </span>
                                        )}
                                        {member.email && (
                                            <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                                <Mail className="w-3 h-3" /> {member.email}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Çalışma saati */}
                                <div className="mt-3 flex items-center gap-1.5">
                                    <Clock className="w-3 h-3 text-gray-300" />
                                    <span className="text-[11px] text-gray-400">
                                        {member.workingHours ? 'Özel çalışma saatleri' : 'İşletme saatlerini kullanıyor'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Modal ──────────────────────────────────────────────────── */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
                    <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] overflow-y-auto">
                        {/* Top bar */}
                        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: form.color }} />

                        <button onClick={() => setShowModal(false)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 z-10">
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-5">
                                {editing ? 'Personeli Düzenle' : 'Yeni Personel'}
                            </h3>

                            <div className="space-y-4">
                                {/* İsim */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Ad Soyad *</label>
                                    <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                        placeholder="Personel adı"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none" />
                                </div>

                                {/* Uzmanlık */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Uzmanlık Alanı</label>
                                    <input type="text" value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))}
                                        placeholder="örn: Saç, Cilt Bakımı, Masaj..."
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none" />
                                </div>

                                {/* İletişim */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Telefon</label>
                                        <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                                            placeholder="0532 xxx xxxx"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">E-posta</label>
                                        <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                            placeholder="email@örnek.com"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none" />
                                    </div>
                                </div>

                                {/* Renk */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Takvim Rengi</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {COLORS.map(c => (
                                            <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg border-2 transition-all",
                                                    form.color === c ? "border-gray-900 scale-110" : "border-transparent hover:scale-105"
                                                )}
                                                style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                </div>

                                {/* Özel Çalışma Saatleri */}
                                <div className="rounded-xl border border-gray-200 overflow-hidden">
                                    <button
                                        onClick={() => setForm(p => ({ ...p, useCustomHours: !p.useCustomHours }))}
                                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            Özel çalışma saatleri tanımla
                                        </div>
                                        <div className={cn(
                                            "w-10 h-5 rounded-full transition-colors relative",
                                            form.useCustomHours ? "bg-[#CCFF00]" : "bg-gray-200"
                                        )}>
                                            <div className={cn(
                                                "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                                form.useCustomHours ? "translate-x-5" : "translate-x-0.5"
                                            )} />
                                        </div>
                                    </button>

                                    {form.useCustomHours && (
                                        <div className="border-t border-gray-100 p-4 space-y-2">
                                            <p className="text-xs text-gray-400 mb-3">İşletme saatlerinden farklıysa ayarlayın</p>
                                            {form.workingHours.map(h => (
                                                <div key={h.day} className={cn(
                                                    "flex items-center gap-3 p-2 rounded-lg",
                                                    h.isOff ? "opacity-50" : ""
                                                )}>
                                                    <div className="w-20 text-xs font-semibold text-gray-700">{h.dayName}</div>
                                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                                        <input type="checkbox" checked={!h.isOff}
                                                            onChange={e => updateHour(h.day, 'isOff', !e.target.checked)}
                                                            className="w-3.5 h-3.5 rounded" />
                                                        <span className="text-[11px] text-gray-500">{h.isOff ? 'Kapalı' : 'Açık'}</span>
                                                    </label>
                                                    {!h.isOff && (
                                                        <>
                                                            <input type="time" value={h.start}
                                                                onChange={e => updateHour(h.day, 'start', e.target.value)}
                                                                className="px-2 py-1 rounded border border-gray-200 text-xs focus:border-[#CCFF00] outline-none" />
                                                            <span className="text-gray-300 text-xs">—</span>
                                                            <input type="time" value={h.end}
                                                                onChange={e => updateHour(h.day, 'end', e.target.value)}
                                                                className="px-2 py-1 rounded border border-gray-200 text-xs focus:border-[#CCFF00] outline-none" />
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Kaydet */}
                                <button onClick={handleSave} disabled={saving || !form.name.trim()}
                                    className="w-full py-3 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                                    {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Personel Ekle'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
