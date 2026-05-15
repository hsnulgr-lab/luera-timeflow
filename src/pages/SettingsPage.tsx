import { useState } from 'react';
import { Settings, Clock, Save, Plus, Trash2, Globe, Bell, Palette } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';
import type { Service, WorkingHours } from '@/types';

export const SettingsPage = () => {
    const { settings, updateSettings } = useReservations();
    const [activeTab, setActiveTab] = useState<'general' | 'hours' | 'services' | 'webhooks'>('general');
    const [businessName, setBusinessName] = useState(settings.businessName);
    const [workingHours, setWorkingHours] = useState(settings.workingHours);
    const [services, setServices] = useState(settings.services);
    const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl || '');
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        updateSettings({
            ...settings,
            businessName,
            workingHours,
            services,
            webhookUrl: webhookUrl || undefined,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const updateHour = (day: number, field: keyof WorkingHours, value: string | boolean) => {
        setWorkingHours(prev => prev.map(h => h.day === day ? { ...h, [field]: value } : h));
    };

    const addService = () => {
        const colors = ['#CCFF00', '#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#10B981', '#F97316'];
        setServices(prev => [...prev, {
            id: `svc-${Date.now()}`,
            name: '',
            duration: 30,
            color: colors[prev.length % colors.length],
        }]);
    };

    const updateService = (id: string, field: keyof Service, value: string | number) => {
        setServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const removeService = (id: string) => {
        setServices(prev => prev.filter(s => s.id !== id));
    };

    const tabs = [
        { id: 'general' as const, label: 'Genel', icon: Settings },
        { id: 'hours' as const, label: 'Çalışma Saatleri', icon: Clock },
        { id: 'services' as const, label: 'Hizmetler', icon: Palette },
        { id: 'webhooks' as const, label: 'Webhook', icon: Globe },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                            <Settings className="w-5 h-5 text-[#CCFF00]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>
                            <p className="text-sm text-gray-400">Sistem konfigürasyonu</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
                            saved
                                ? "bg-emerald-500 text-white"
                                : "bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] hover:shadow-lg hover:shadow-[#CCFF00]/20"
                        )}
                    >
                        <Save className="w-4 h-4" />
                        {saved ? 'Kaydedildi!' : 'Kaydet'}
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center",
                                activeTab === tab.id
                                    ? "bg-[#CCFF00] text-slate-900"
                                    : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-6">
                    {/* General */}
                    {activeTab === 'general' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-base font-bold text-gray-900 mb-4">İşletme Bilgileri</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">İşletme Adı</label>
                                        <input
                                            type="text"
                                            value={businessName}
                                            onChange={(e) => setBusinessName(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Slot Süresi (dakika)</label>
                                        <select
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all bg-white"
                                            value={settings.slotDuration}
                                            onChange={(e) => updateSettings({ ...settings, slotDuration: parseInt(e.target.value) })}
                                        >
                                            <option value="15">15 dakika</option>
                                            <option value="30">30 dakika</option>
                                            <option value="60">60 dakika</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-[#CCFF00]/5 border border-[#CCFF00]/20">
                                <div className="flex items-start gap-3">
                                    <Bell className="w-5 h-5 text-[#CCFF00] mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900">Bildirim Ayarları</h4>
                                        <p className="text-xs text-gray-400 mt-1">Bildirim entegrasyonları webhook ayarlarından yapılandırılabilir.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Working Hours */}
                    {activeTab === 'hours' && (
                        <div>
                            <h3 className="text-base font-bold text-gray-900 mb-4">Çalışma Saatleri</h3>
                            <div className="space-y-3">
                                {workingHours.map((h) => (
                                    <div key={h.day}
                                        className={cn(
                                            "flex items-center gap-4 p-4 rounded-xl border transition-all",
                                            h.isOff ? "border-gray-100 bg-gray-50/50 opacity-60" : "border-gray-200"
                                        )}
                                    >
                                        <div className="w-24">
                                            <span className="text-sm font-semibold text-gray-900">{h.dayName}</span>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={!h.isOff}
                                                onChange={(e) => updateHour(h.day, 'isOff', !e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-300 text-[#CCFF00] focus:ring-[#CCFF00]"
                                            />
                                            <span className="text-xs text-gray-500">{h.isOff ? 'Kapalı' : 'Açık'}</span>
                                        </label>
                                        {!h.isOff && (
                                            <>
                                                <input
                                                    type="time" value={h.start}
                                                    onChange={(e) => updateHour(h.day, 'start', e.target.value)}
                                                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#CCFF00] outline-none"
                                                />
                                                <span className="text-gray-400">—</span>
                                                <input
                                                    type="time" value={h.end}
                                                    onChange={(e) => updateHour(h.day, 'end', e.target.value)}
                                                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#CCFF00] outline-none"
                                                />
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Services */}
                    {activeTab === 'services' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-bold text-gray-900">Hizmetler</h3>
                                <button onClick={addService} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all">
                                    <Plus className="w-3 h-3" /> Ekle
                                </button>
                            </div>
                            <div className="space-y-3">
                                {services.map((s) => (
                                    <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border border-gray-200">
                                        <input
                                            type="color" value={s.color}
                                            onChange={(e) => updateService(s.id, 'color', e.target.value)}
                                            className="w-8 h-8 rounded-lg border-0 cursor-pointer"
                                        />
                                        <input
                                            type="text" value={s.name} placeholder="Hizmet adı"
                                            onChange={(e) => updateService(s.id, 'name', e.target.value)}
                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#CCFF00] outline-none"
                                        />
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number" value={s.duration} min={5} step={5}
                                                onChange={(e) => updateService(s.id, 'duration', parseInt(e.target.value))}
                                                className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#CCFF00] outline-none"
                                            />
                                            <span className="text-xs text-gray-400">dk</span>
                                        </div>
                                        <button onClick={() => removeService(s.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Webhooks */}
                    {activeTab === 'webhooks' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-base font-bold text-gray-900 mb-4">Webhook Entegrasyonu</h3>
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4">
                                    <p className="text-xs text-gray-500">
                                        Yeni randevu oluşturulduğunda, güncellendiğinde veya iptal edildiğinde webhook URL'nize otomatik bildirim gönderilir.
                                        Bu URL'yi n8n veya diğer otomasyon araçlarıyla kullanabilirsiniz.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Webhook URL</label>
                                    <input
                                        type="url"
                                        value={webhookUrl}
                                        onChange={(e) => setWebhookUrl(e.target.value)}
                                        placeholder="https://your-n8n-instance.com/webhook/..."
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-[#CCFF00]/5 border border-[#CCFF00]/20">
                                <h4 className="text-sm font-bold text-gray-900 mb-2">Gönderilen Veri Formatı</h4>
                                <pre className="text-[11px] text-gray-500 bg-slate-900 text-slate-300 p-3 rounded-lg overflow-x-auto">
                                    {`{
  "event": "reservation.created",
  "data": {
    "id": "res-123",
    "customerName": "Ahmet Yılmaz",
    "date": "2026-02-20",
    "startTime": "10:00",
    "service": "Konsültasyon"
  }
}`}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
