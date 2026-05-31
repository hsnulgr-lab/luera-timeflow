import { useState, useEffect, useRef, useCallback } from 'react';
import { Smartphone, Loader2, CheckCircle2, QrCode, Trash2, RefreshCw, Wifi, WifiOff, MessageCircle, RotateCcw } from 'lucide-react';
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

type Status = 'checking' | 'idle' | 'creating' | 'qr' | 'connected';

export function WhatsAppTab() {
    const { settings, updateSettings } = useReservations();

    const [status, setStatus]               = useState<Status>('checking');
    const [qrCode, setQrCode]               = useState<string | null>(null);
    const [qrExpiry, setQrExpiry]           = useState(60);
    const [instanceInput, setInstanceInput] = useState('');

    const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
    const qrTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const savedInstance = settings.whatsappInstance ?? '';

    // ─── Gerçek zamanlı durum kontrolü ──────────────────────────────────────
    const checkStatus = useCallback(async (instName: string) => {
        if (!instName) { setStatus('idle'); return; }
        const state = await getConnectionState(instName);
        setStatus(state === 'open' ? 'connected' : 'idle');
    }, []);

    // Mount: DB'deki instance ile Evolution API'yi sorgula
    useEffect(() => {
        if (savedInstance) {
            setInstanceInput(savedInstance);
            checkStatus(savedInstance);

            // Her 30 saniyede bir durumu yenile
            statusPollRef.current = setInterval(() => {
                checkStatus(savedInstance);
            }, 30000);
        } else {
            setStatus('idle');
        }

        return () => {
            if (pollRef.current)       clearInterval(pollRef.current);
            if (qrTimerRef.current)    clearInterval(qrTimerRef.current);
            if (statusPollRef.current) clearInterval(statusPollRef.current);
        };
    }, [savedInstance]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── QR bağlantı kurulunca ───────────────────────────────────────────────
    const onConnected = useCallback((instName: string) => {
        if (pollRef.current)    clearInterval(pollRef.current);
        if (qrTimerRef.current) clearInterval(qrTimerRef.current);
        setStatus('connected');
        setQrCode(null);
        // DB'ye kaydet
        updateSettings({ ...settings, whatsappInstance: instName });
        toast.success('WhatsApp başarıyla bağlandı! 🎉');
    }, [settings, updateSettings]);

    // ─── Bağlantı polling (QR tarandıktan sonra) ────────────────────────────
    const startConnectPolling = useCallback((instName: string) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            const state = await getConnectionState(instName);
            if (state === 'open') onConnected(instName);
        }, 3000);
    }, [onConnected]);

    // ─── QR geri sayım + otomatik yenileme ──────────────────────────────────
    const startQrTimer = useCallback((instName: string) => {
        setQrExpiry(60);
        if (qrTimerRef.current) clearInterval(qrTimerRef.current);
        qrTimerRef.current = setInterval(() => {
            setQrExpiry(prev => {
                if (prev <= 1) {
                    getQRCode(instName).then(qr => { if (qr) { setQrCode(qr); setQrExpiry(60); } });
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // ─── WhatsApp bağla ──────────────────────────────────────────────────────
    const handleConnect = async () => {
        const instName = instanceInput.trim();
        if (!instName) { toast.error('Instance adı gir'); return; }

        setStatus('creating');
        setQrCode(null);

        // Önce mevcut bağlantıyı kontrol et
        const currentState = await getConnectionState(instName);
        if (currentState === 'open') {
            onConnected(instName);
            return;
        }

        // Instance oluştur (409 = zaten var, sorun değil)
        await createInstance(instName);
        await new Promise(r => setTimeout(r, 1500));

        const qr = await getQRCode(instName);
        if (!qr) {
            setStatus('idle');
            toast.error('QR kod alınamadı. Instance adını kontrol edin.');
            return;
        }

        setQrCode(qr);
        setStatus('qr');
        startConnectPolling(instName);
        startQrTimer(instName);
    };

    // ─── Manuel durum yenile ─────────────────────────────────────────────────
    const handleRefreshStatus = async () => {
        const instName = savedInstance || instanceInput.trim();
        if (!instName) return;
        setStatus('checking');
        await checkStatus(instName);
        toast.info('Durum güncellendi');
    };

    // ─── QR yenile ───────────────────────────────────────────────────────────
    const handleRefreshQR = async () => {
        const instName = savedInstance || instanceInput.trim();
        const qr = await getQRCode(instName);
        if (qr) { setQrCode(qr); setQrExpiry(60); }
        else toast.error('QR yenilenemedi');
    };

    // ─── Bağlantıyı kes ──────────────────────────────────────────────────────
    const handleDisconnect = async () => {
        if (pollRef.current)       clearInterval(pollRef.current);
        if (qrTimerRef.current)    clearInterval(qrTimerRef.current);
        if (statusPollRef.current) clearInterval(statusPollRef.current);

        if (savedInstance) await deleteInstance(savedInstance);
        updateSettings({ ...settings, whatsappInstance: undefined });
        setStatus('idle');
        setQrCode(null);
        setInstanceInput('');
        toast.success('WhatsApp bağlantısı kesildi');
    };

    // ─── Mesaj önizlemeleri ──────────────────────────────────────────────────
    const preview24h = build24hMessage({
        customerName: 'Ahmet Yılmaz', startTime: '10:00',
        service: settings.services[0]?.name || 'Konsültasyon',
        businessName: settings.businessName,
    });
    const preview2h = build2hMessage({
        customerName: 'Ahmet Yılmaz', startTime: '14:00',
        service: settings.services[0]?.name || 'Konsültasyon',
        businessName: settings.businessName,
    });

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-bold text-gray-900">WhatsApp Hatırlatma</h3>
                <p className="text-xs text-gray-500 mt-1">
                    Randevudan 24 saat ve 2 saat önce müşterilere otomatik WhatsApp mesajı gönderilir.
                </p>
            </div>

            {/* ── Bağlantı Kartı ─────────────────────────────────────── */}
            <div className={cn(
                'rounded-2xl border-2 p-5 transition-all',
                status === 'connected' ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-white',
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

                    <div className="flex items-center gap-2">
                        {/* Durum badge */}
                        {status === 'connected' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Bağlı
                            </span>
                        )}
                        {status === 'idle' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-3 py-1 rounded-full">
                                <WifiOff className="w-3.5 h-3.5" /> Bağlı Değil
                            </span>
                        )}
                        {status === 'checking' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Kontrol ediliyor
                            </span>
                        )}

                        {/* Yenile butonu */}
                        {(status === 'connected' || status === 'idle') && (
                            <button
                                onClick={handleRefreshStatus}
                                title="Durumu yenile"
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Bağlı durumu ─────────────────────────────────────── */}
                {status === 'connected' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-emerald-100">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-gray-900">WhatsApp aktif</p>
                                <p className="text-xs text-gray-400">
                                    Instance: <code className="font-mono bg-gray-100 px-1 rounded">{savedInstance}</code>
                                    <span className="ml-2 text-gray-300">• Her 30sn kontrol edilir</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleDisconnect}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-100 text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Bağlantıyı Kes
                        </button>
                    </div>
                )}

                {/* ── QR kod ───────────────────────────────────────────── */}
                {status === 'qr' && qrCode && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-white border border-gray-200">
                            <img
                                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                alt="WhatsApp QR"
                                className="w-52 h-52 rounded-lg"
                            />
                            <div className="flex items-center gap-2 w-full max-w-[200px]">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-[#CCFF00] transition-all duration-1000"
                                        style={{ width: `${(qrExpiry / 60) * 100}%` }} />
                                </div>
                                <span className="text-xs text-gray-400 tabular-nums w-6">{qrExpiry}s</span>
                            </div>
                            <p className="text-xs text-gray-500 text-center">
                                WhatsApp → Bağlı Cihazlar → Cihaz Ekle → QR kodu okut
                            </p>
                        </div>
                        <button onClick={handleRefreshQR}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" /> QR Yenile
                        </button>
                    </div>
                )}

                {/* ── Oluşturuluyor ────────────────────────────────────── */}
                {status === 'creating' && (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-[#CCFF00]" />
                        <p className="text-sm text-gray-500">WhatsApp bağlantısı hazırlanıyor...</p>
                    </div>
                )}

                {/* ── Bağla ────────────────────────────────────────────── */}
                {(status === 'idle') && (
                    <div className="space-y-3">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                                Evolution API Instance Adı
                            </p>
                            <input
                                type="text"
                                value={instanceInput}
                                onChange={e => setInstanceInput(e.target.value)}
                                placeholder="örn: timeflow"
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-mono text-sm focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 outline-none"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">
                                Evolution API Manager'dan oluşturduğun instance adı
                            </p>
                        </div>

                        <button
                            onClick={handleConnect}
                            disabled={!instanceInput.trim()}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-[#CCFF00] font-bold text-sm hover:bg-slate-700 transition-colors disabled:opacity-40"
                        >
                            <Smartphone className="w-4 h-4" /> WhatsApp Bağla
                        </button>
                    </div>
                )}
            </div>

            {/* ── Mesaj Önizleme ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-gray-400" />
                    <h4 className="text-sm font-bold text-gray-700">Gönderilecek Mesajlar</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#CCFF00]/5 border border-[#CCFF00]/20 p-3">
                        <p className="text-[10px] font-bold text-[#7a9900] uppercase tracking-wider mb-2">24 Saat Önce</p>
                        <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{preview24h}</p>
                    </div>
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">2 Saat Önce</p>
                        <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{preview2h}</p>
                    </div>
                </div>
                <p className="text-[11px] text-gray-400">
                    n8n üzerinden her 30 dakikada bir kontrol edilerek otomatik gönderilir.
                </p>
            </div>
        </div>
    );
}
