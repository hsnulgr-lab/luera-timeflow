import { useState, useEffect } from 'react';
import { Settings, Clock, Save, Plus, Trash2, Globe, Bell, Palette, Puzzle, Key, Copy, RefreshCw, CheckCircle2, Loader2, Zap, Phone } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';
import type { Service, WorkingHours } from '@/types';
import {
    getMyKey, generateMyKey, revokeMyKey,
    getIncomingKey, saveIncomingKey, testConnection,
    getCurrentUserId, buildConnectionString,
    type IntegrationModule, type IntegrationConnection,
} from '@/services/integrationApi';

/* ─────────────────────────── IntegrationCard ─────────────────────────── */

interface IntegrationCardProps {
    module: IntegrationModule;
    label: string;
    description: string;
    Icon: React.ElementType;
}

function IntegrationCard({ module, label, description, Icon }: IntegrationCardProps) {
    const [myKey, setMyKey]             = useState<IntegrationConnection | null>(null);
    const [myUserId, setMyUserId]       = useState<string>('');
    const [myKeyLoading, setMyKeyLoading] = useState(true);
    const [myKeyVisible, setMyKeyVisible] = useState(false);
    const [myKeyCopied, setMyKeyCopied]   = useState(false);
    const [generating, setGenerating]     = useState(false);
    const [revoking, setRevoking]         = useState(false);
    const [myKeyError, setMyKeyError]     = useState<string | null>(null);

    const [incomingKey, setIncomingKey]   = useState('');
    const [incomingSaved, setIncomingSaved] = useState('');
    const [savingIncoming, setSavingIncoming] = useState(false);
    const [testing, setTesting]           = useState(false);
    const [testResult, setTestResult]     = useState<boolean | null>(null);
    const [incomingError, setIncomingError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const [key, incoming, uid] = await Promise.all([
                    getMyKey(module),
                    getIncomingKey(module),
                    getCurrentUserId(),
                ]);
                setMyKey(key);
                setMyUserId(uid);
                setIncomingKey(incoming ?? '');
                setIncomingSaved(incoming ?? '');
            } catch {
                setMyKeyError('Bağlantı bilgileri yüklenemedi.');
            } finally {
                setMyKeyLoading(false);
            }
        })();
    }, [module]);

    const handleGenerate = async () => {
        setGenerating(true);
        setMyKeyError(null);
        try {
            const [key, uid] = await Promise.all([generateMyKey(module), getCurrentUserId()]);
            setMyKey(key);
            setMyUserId(uid);
            setMyKeyVisible(true);
        } catch (e: any) {
            setMyKeyError(`Key oluşturulamadı: ${e?.message ?? 'bilinmeyen hata'}`);
        } finally {
            setGenerating(false);
        }
    };

    const handleRevoke = async () => {
        if (!confirm('Bu API key\'i iptal etmek istediğinizden emin misiniz?')) return;
        setRevoking(true);
        try {
            await revokeMyKey(module);
            setMyKey(null);
            setMyKeyVisible(false);
        } catch {
            setMyKeyError('Key iptal edilemedi.');
        } finally {
            setRevoking(false);
        }
    };

    const handleCopy = () => {
        if (!myKey?.api_key) return;
        const connStr = buildConnectionString(myKey.api_key, myUserId);
        navigator.clipboard.writeText(connStr);
        setMyKeyCopied(true);
        setTimeout(() => setMyKeyCopied(false), 2000);
    };

    const handleSaveIncoming = async () => {
        setSavingIncoming(true);
        setIncomingError(null);
        setTestResult(null);
        try {
            await saveIncomingKey(module, incomingKey);
            setIncomingSaved(incomingKey);
        } catch {
            setIncomingError('Key kaydedilemedi.');
        } finally {
            setSavingIncoming(false);
        }
    };

    const handleTest = async () => {
        if (!incomingKey) return;
        setTesting(true);
        setTestResult(null);
        const ok = await testConnection(incomingKey);
        setTestResult(ok);
        setTesting(false);
    };

    const isConnected = !!incomingSaved;
    const isDirty = incomingKey !== incomingSaved;

    return (
        <div className={cn(
            'rounded-2xl border-2 p-5 transition-all space-y-5',
            isConnected ? 'border-[#CCFF00]/50 bg-[#CCFF00]/5' : 'border-gray-200 bg-white',
        )}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', isConnected ? 'bg-slate-900' : 'bg-gray-100')}>
                        <Icon className={cn('w-5 h-5', isConnected ? 'text-[#CCFF00]' : 'text-gray-400')} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900">LUERA {label}</p>
                        <p className="text-xs text-gray-500">{description}</p>
                    </div>
                </div>
                {isConnected && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Bağlı
                    </span>
                )}
            </div>

            {/* Section A: Bu modülün key'i */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Key className="w-4 h-4 text-gray-400" />
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">TimeFlow API Key</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                    Bu key'i {label} ayarlarına girerek bağlantıyı etkinleştir.
                </p>

                {myKeyLoading ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                ) : myKey ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                            <code className="flex-1 text-xs font-mono text-gray-700 truncate select-all">
                                {myKeyVisible
                                    ? myKey.api_key
                                    : `${myKey.api_key.slice(0, 8)}${'•'.repeat(20)}${myKey.api_key.slice(-4)}`}
                            </code>
                            <button
                                onClick={() => setMyKeyVisible(v => !v)}
                                className="text-[10px] font-bold text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
                            >
                                {myKeyVisible ? 'Gizle' : 'Göster'}
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCopy}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all',
                                    myKeyCopied ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-[#CCFF00] hover:bg-slate-700',
                                )}
                            >
                                {myKeyCopied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Kopyalandı</> : <><Copy className="w-3.5 h-3.5" /> Kopyala</>}
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={generating}
                                title="Yeni key üret"
                                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={cn('w-3.5 h-3.5', generating && 'animate-spin')} />
                            </button>
                            <button
                                onClick={handleRevoke}
                                disabled={revoking}
                                title="Key'i iptal et"
                                className="px-3 py-2 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Oluşturulma: {new Date(myKey.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                ) : (
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-900 text-[#CCFF00] font-bold text-xs hover:bg-slate-700 transition-colors disabled:opacity-50"
                    >
                        {generating
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Oluşturuluyor...</>
                            : <><Key className="w-3.5 h-3.5" /> API Key Oluştur</>}
                    </button>
                )}
                {myKeyError && <p className="text-xs text-red-500 mt-2">{myKeyError}</p>}
            </div>

            {/* Section B: Diğer modülün key'i */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">{label} API Key</p>
                <p className="text-xs text-gray-500 mb-3">
                    {label} → Ayarlar → Entegrasyonlar sayfasından kopyala.
                </p>
                <input
                    type="text"
                    value={incomingKey}
                    onChange={e => { setIncomingKey(e.target.value); setTestResult(null); }}
                    placeholder="API key yapıştır..."
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-mono text-xs focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none"
                />
                <div className="flex gap-2 mt-2">
                    <button
                        onClick={handleSaveIncoming}
                        disabled={savingIncoming || !isDirty}
                        className="flex-1 py-2 rounded-lg bg-[#CCFF00] text-slate-900 font-bold text-xs hover:bg-[#d4ff33] transition-colors disabled:opacity-40"
                    >
                        {savingIncoming ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                    <button
                        onClick={handleTest}
                        disabled={testing || !incomingKey}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                    >
                        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test Et'}
                    </button>
                </div>
                {testResult !== null && (
                    <p className={cn('text-xs mt-2 font-medium', testResult ? 'text-emerald-600' : 'text-red-500')}>
                        {testResult ? '✓ Bağlantı başarılı' : '✗ Bağlantı kurulamadı — key\'i kontrol edin'}
                    </p>
                )}
                {incomingError && <p className="text-xs text-red-500 mt-2">{incomingError}</p>}
            </div>
        </div>
    );
}

function IntegrationsTab() {
    return (
        <div className="space-y-5">
            <h3 className="text-base font-bold text-gray-900">Entegrasyonlar</h3>
            <p className="text-xs text-gray-500">
                Her entegrasyon için iki adım: <strong>TimeFlow API Key</strong>'ini diğer modüle gir,
                diğer modülün key'ini buraya yapıştır.
            </p>
            <IntegrationCard
                module="leadflow"
                label="LeadFlow"
                description="Lead bilgileri otomatik randevuya dönüşür"
                Icon={Zap}
            />
            <IntegrationCard
                module="callflow"
                label="CallFlow"
                description="Çağrı sonrası randevu oluşturulur"
                Icon={Phone}
            />
        </div>
    );
}

/* ─────────────────────────── SettingsPage ─────────────────────────────── */

export const SettingsPage = () => {
    const { settings, updateSettings } = useReservations();
    const [activeTab, setActiveTab] = useState<'general' | 'hours' | 'services' | 'webhooks' | 'integrations'>('general');
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
        { id: 'integrations' as const, label: 'Entegrasyonlar', icon: Puzzle },
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

                    {/* Integrations */}
                    {activeTab === 'integrations' && (
                        <IntegrationsTab />
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
