import { useState, useEffect, useRef, useCallback } from 'react';
import { Smartphone, Loader2, CheckCircle2, QrCode, Trash2, RefreshCw, Wifi, WifiOff, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import { useReservations } from '@/hooks/useReservations';
import {
    createInstance,
    getQRCode,
    getConnectionState,
    deleteInstance,
    build24hMessage,
    build2hMessage,
} from '@/services/evolutionApi';

type Status = 'idle' | 'creating' | 'qr' | 'connected' | 'checking';

export function WhatsAppTab() {
    const { settings, orgId, updateSettings } = useReservations();

    const [status, setStatus] = useState<Status>('checking');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [qrExpiry, setQrExpiry] = useState<number>(60);

    const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
    const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // TimeFlow her org için kendi instance adı: tf-{org_id ilk 8 char}
    const instanceName = orgId ? `tf-${orgId.slice(0, 8)}` : null;

    const clearPolling = () => {
        if (pollRef.current)    clearInterval(pollRef.current);
        if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    };

    // Mount: mevcut bağlantıyı kontrol et
    useEffect(() => {
        if (!instanceName) return;

        if (settings.whatsappInstance) {
            getConnectionState(instanceName).then(state => {
                setStatus(state === 'open' ? 'connected' : 'idle');
            });
        } else {
            setStatus('idle');
        }

        return clearPolling;
    }, [instanceName]); // eslint-disable-line react-hooks/exhaustive-deps

    // QR bağlantı kurulunca kaydet
    const onConnected = useCallback(() => {
        clearPolling();
        setStatus('connected');
        setQrCode(null);
        updateSettings({ ...settings, whatsappInstance: instanceName! });
        toast.success('WhatsApp başarıyla bağlandı! 🎉');
    }, [instanceName, settings, updateSettings]);

    // Bağlantı durumunu poll et
    const startPolling = useCallback((instName: string) => {
        clearPolling();
        pollRef.current = setInterval(async () => {
            const state = await getConnectionState(instName);
            if (state === 'open') onConnected();
        }, 3000);
    }, [onConnected]);

    // QR geri sayımı
    const startQrTimer = useCallback((instName: string) => {
        setQrExpiry(60);
        qrTimerRef.current = setInterval(async () => {
            setQrExpiry(prev => {
                if (prev <= 1) {
                    // QR süresi doldu — yenile
                    getQRCode(instName).then(qr => {
                        if (qr) { setQrCode(qr); setQrExpiry(60); }
                    });
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // WhatsApp bağla
    const handleConnect = async () => {
        if (!instanceName) return;
        setStatus('creating');
        setQrCode(null);

        const created = await createInstance(instanceName);
        if (!created) {
            setStatus('idle');
            toast.error('Instance oluşturulamadı');
            return;
        }

        // Kısa bekleme — instance hazırlanıyor
        await new Promise(r => setTimeout(r, 1500));

        const qr = await getQRCode(instanceName);
        if (!qr) {
            setStatus('idle');
            toast.error('QR kod alınamadı. Tekrar deneyin.');
            return;
        }

        setQrCode(qr);
        setStatus('qr');
        startPolling(instanceName);
        startQrTimer(instanceName);
    };

    // QR manuel yenile
    const handleRefreshQR = async () => {
        if (!instanceName) return;
        const qr = await getQRCode(instanceName);
        if (qr) { setQrCode(qr); setQrExpiry(60); }
        else toast.error('QR yenilenemedi');
    };

    // Bağlantıyı kes
    const handleDisconnect = async () => {
        if (!instanceName) return;
        clearPolling();
        await deleteInstance(instanceName);
        updateSettings({ ...settings, whatsappInstance: undefined });
        setStatus('idle');
        setQrCode(null);
        toast.success('WhatsApp bağlantısı kesildi');
    };

    // Örnek mesaj önizlemesi
    const preview24h = build24hMessage({
        customerName: 'Ahmet Yılmaz',
        startTime: '10:00',
        service: settings.services[0]?.name || 'Konsültasyon',
        businessName: settings.businessName,
    });
    const preview2h = build2hMessage({
        customerName: 'Ahmet Yılmaz',
        startTime: '14:00',
        service: settings.services[0]?.name || 'Konsültasyon',
        businessName: settings.businessName,
    });

    // ─── Render ───────────────────────────────────────────────────────────────

    if (status === 'checking') {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-bold text-gray-900">WhatsApp Hatırlatma</h3>
                <p className="text-xs text-gray-500 mt-1">
                    Randevudan 24 saat ve 2 saat önce müşterilere otomatik WhatsApp mesajı gönderilir.
                </p>
            </div>

            {/* ── Bağlantı Kartı ─────────────────────────────────────────── */}
            <div className={cn(
                'rounded-2xl border-2 p-5 transition-all',
                status === 'connected'
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-gray-200 bg-white',
            )}>
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'w-11 h-11 rounded-xl flex items-center justify-center',
                            status === 'connected' ? 'bg-emerald-500' : 'bg-slate-900',
                        )}>
                            <MessageCircle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">WhatsApp Business</p>
                            <p className="text-xs text-gray-500">Evolution API üzerinden</p>
                        </div>
                    </div>

                    {status === 'connected' && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
                            <Wifi className="w-3.5 h-3.5" />
                            Bağlı
                        </span>
                    )}
                    {status === 'idle' && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-3 py-1 rounded-full">
                            <WifiOff className="w-3.5 h-3.5" />
                            Bağlı Değil
                        </span>
                    )}
                </div>

                {/* ── Bağlı durumu ─────────────────────────────────────────── */}
                {status === 'connected' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-emerald-100">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-gray-900">WhatsApp aktif</p>
                                <p className="text-xs text-gray-400">Otomatik hatırlatmalar gönderilecek</p>
                            </div>
                        </div>
                        <button
                            onClick={handleDisconnect}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-100 text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Bağlantıyı Kes
                        </button>
                    </div>
                )}

                {/* ── QR kod göster ─────────────────────────────────────────── */}
                {status === 'qr' && qrCode && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-white border border-gray-200">
                            {/* QR image */}
                            <img
                                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                alt="WhatsApp QR Kod"
                                className="w-52 h-52 rounded-lg"
                            />

                            {/* Geri sayım */}
                            <div className="flex items-center gap-2">
                                <div className="w-full bg-gray-100 rounded-full h-1.5 w-32">
                                    <div
                                        className="h-1.5 rounded-full bg-[#CCFF00] transition-all duration-1000"
                                        style={{ width: `${(qrExpiry / 60) * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs text-gray-400 tabular-nums w-6">{qrExpiry}s</span>
                            </div>

                            <p className="text-xs text-gray-500 text-center">
                                WhatsApp → Bağlı Cihazlar → Cihaz Ekle → QR kodu okut
                            </p>
                        </div>

                        <button
                            onClick={handleRefreshQR}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            QR Yenile
                        </button>
                    </div>
                )}

                {/* ── Oluşturuluyor ─────────────────────────────────────────── */}
                {status === 'creating' && (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-[#CCFF00]" />
                        <p className="text-sm text-gray-500">WhatsApp bağlantısı hazırlanıyor...</p>
                    </div>
                )}

                {/* ── Bağla butonu ─────────────────────────────────────────── */}
                {status === 'idle' && (
                    <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-gray-500 space-y-1">
                            <p className="font-semibold text-gray-700">Nasıl bağlanır?</p>
                            <p>1. "WhatsApp Bağla" butonuna tıkla</p>
                            <p>2. QR kodu telefonunda WhatsApp ile okut</p>
                            <p>3. Bitti — hatırlatmalar o hattan gider</p>
                        </div>
                        <button
                            onClick={handleConnect}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-[#CCFF00] font-bold text-sm hover:bg-slate-700 transition-colors"
                        >
                            <Smartphone className="w-4 h-4" />
                            WhatsApp Bağla
                        </button>
                    </div>
                )}
            </div>

            {/* ── Mesaj Şablonları Önizleme ──────────────────────────────── */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-gray-400" />
                    <h4 className="text-sm font-bold text-gray-700">Gönderilecek Mesajlar</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* 24h */}
                    <div className="rounded-xl bg-[#CCFF00]/5 border border-[#CCFF00]/20 p-3">
                        <p className="text-[10px] font-bold text-[#7a9900] uppercase tracking-wider mb-2">
                            24 Saat Önce
                        </p>
                        <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                            {preview24h}
                        </p>
                    </div>

                    {/* 2h */}
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">
                            2 Saat Önce
                        </p>
                        <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                            {preview2h}
                        </p>
                    </div>
                </div>

                <p className="text-[11px] text-gray-400">
                    Mesajlar otomatik gönderilir. n8n üzerinden her 30 dakikada bir kontrol yapılır.
                </p>
            </div>
        </div>
    );
}
