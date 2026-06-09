import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, RefreshCw, Trash2, RotateCcw, Smartphone, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import {
    createInstance,
    getQRCode,
    getConnectionState,
    deleteInstance,
    build24hMessage,
    build2hMessage,
} from '@/services/evolutionApi';

// ── Design tokens ────────────────────────────────────────────────────────────
const T = {
  ink:      '#0E0E0E',
  cream:    '#F0EBE1',
  orange:   '#FF5A1F',
  surface:  '#FAF7F3',
  surface2: '#F3EDE4',
  surface3: '#EDE6DB',
  border:   'rgba(14,14,14,0.08)',
  border2:  'rgba(14,14,14,0.14)',
  muted:    'rgba(14,14,14,0.45)',
  muted2:   'rgba(14,14,14,0.28)',
  shadow:   '0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  r:        '14px',
  rSm:      '10px',
  rXs:      '7px',
};

// WhatsApp yeşilleri
const WA = { bg: '#075E54', green: '#25D366', chat: '#ECE5DD' };

type Status = 'checking' | 'idle' | 'creating' | 'qr' | 'connected';

// ── WhatsApp SVG icon ─────────────────────────────────────────────────────────
function WaIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l4.93-1.38A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill={WA.green}/>
      <path d="M17 14.5c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.57-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1.01-1.03 2.46s1.05 2.85 1.2 3.05c.15.2 2.07 3.16 5.01 4.43.7.3 1.25.48 1.68.62.7.22 1.34.19 1.84.12.56-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z" fill="white"/>
    </svg>
  );
}

export function WhatsAppTab() {
    const { settings, updateSettings } = useReservations();

    const [status, setStatus]               = useState<Status>('checking');
    const [qrCode, setQrCode]               = useState<string | null>(null);
    const [qrExpiry, setQrExpiry]           = useState(60);
    const [instanceInput, setInstanceInput] = useState('');

    const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
    const qrTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const savedInstance = settings.whatsappInstance ?? '';

    // Message previews
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

    const checkStatus = useCallback(async (instName: string) => {
        if (!instName) { setStatus('idle'); return; }
        const state = await getConnectionState(instName);
        setStatus(state === 'open' ? 'connected' : 'idle');
    }, []);

    useEffect(() => {
        if (savedInstance) {
            setInstanceInput(savedInstance);
            checkStatus(savedInstance);
            statusPollRef.current = setInterval(() => checkStatus(savedInstance), 30000);
        } else {
            setStatus('idle');
        }
        return () => {
            if (pollRef.current)       clearInterval(pollRef.current);
            if (qrTimerRef.current)    clearInterval(qrTimerRef.current);
            if (statusPollRef.current) clearInterval(statusPollRef.current);
        };
    }, [savedInstance]); // eslint-disable-line react-hooks/exhaustive-deps

    const onConnected = useCallback((instName: string) => {
        if (pollRef.current)    clearInterval(pollRef.current);
        if (qrTimerRef.current) clearInterval(qrTimerRef.current);
        setStatus('connected');
        setQrCode(null);
        updateSettings({ ...settings, whatsappInstance: instName });
        toast.success('WhatsApp başarıyla bağlandı! 🎉');
    }, [settings, updateSettings]);

    const startConnectPolling = useCallback((instName: string) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            const state = await getConnectionState(instName);
            if (state === 'open') onConnected(instName);
        }, 3000);
    }, [onConnected]);

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

    const handleConnect = async () => {
        const instName = instanceInput.trim();
        if (!instName) { toast.error('Instance adı gir'); return; }
        setStatus('creating'); setQrCode(null);
        const currentState = await getConnectionState(instName);
        if (currentState === 'open') { onConnected(instName); return; }
        await createInstance(instName);
        await new Promise(r => setTimeout(r, 1500));
        const qr = await getQRCode(instName);
        if (!qr) { setStatus('idle'); toast.error('QR kod alınamadı. Instance adını kontrol edin.'); return; }
        setQrCode(qr); setStatus('qr');
        startConnectPolling(instName); startQrTimer(instName);
    };

    const handleRefreshStatus = async () => {
        const instName = savedInstance || instanceInput.trim();
        if (!instName) return;
        setStatus('checking');
        await checkStatus(instName);
        toast.info('Durum güncellendi');
    };

    const handleRefreshQR = async () => {
        const instName = savedInstance || instanceInput.trim();
        const qr = await getQRCode(instName);
        if (qr) { setQrCode(qr); setQrExpiry(60); }
        else toast.error('QR yenilenemedi');
    };

    const handleDisconnect = async () => {
        if (pollRef.current)       clearInterval(pollRef.current);
        if (qrTimerRef.current)    clearInterval(qrTimerRef.current);
        if (statusPollRef.current) clearInterval(statusPollRef.current);
        if (savedInstance) await deleteInstance(savedInstance);
        updateSettings({ ...settings, whatsappInstance: undefined });
        setStatus('idle'); setQrCode(null); setInstanceInput('');
        toast.success('WhatsApp bağlantısı kesildi');
    };

    const isConnected = status === 'connected';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Header ── */}
            <div style={{ marginBottom: '4px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.02em', color: T.ink, marginBottom: '5px' }}>WhatsApp Hatırlatma</div>
                <div style={{ fontSize: '12.5px', color: T.muted, lineHeight: 1.55 }}>
                    Randevudan <strong style={{ color: T.ink }}>24 saat</strong> ve <strong style={{ color: T.ink }}>2 saat</strong> önce müşterilere otomatik WhatsApp mesajı gönderilir.
                </div>
            </div>

            {/* ── Bağlantı kartı ── */}
            <div style={{
                background: isConnected ? 'rgba(37,211,102,0.04)' : T.surface,
                border: `1px solid ${isConnected ? 'rgba(37,211,102,0.25)' : T.border}`,
                borderRadius: T.r, padding: '20px', transition: 'all .2s',
            }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 44, height: 44, borderRadius: T.rSm, background: WA.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <WaIcon size={24}/>
                        </div>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 750, color: T.ink, letterSpacing: '-0.01em' }}>WhatsApp Business</div>
                            <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '1px' }}>Evolution API üzerinden</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {status === 'connected' && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: '#2a8a40', background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.22)', padding: '4px 10px', borderRadius: '999px' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: WA.green, animation: 'pulse 2s infinite' }}/>
                                Bağlı
                            </span>
                        )}
                        {status === 'idle' && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, padding: '4px 10px', borderRadius: '999px' }}>
                                Bağlı Değil
                            </span>
                        )}
                        {status === 'checking' && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, padding: '4px 10px', borderRadius: '999px' }}>
                                <Loader2 size={11} className="animate-spin"/> Kontrol ediliyor
                            </span>
                        )}
                        {(status === 'connected' || status === 'idle') && (
                            <button onClick={handleRefreshStatus} title="Durumu yenile"
                                style={{ width: 30, height: 30, borderRadius: T.rXs, border: `1px solid ${T.border}`, background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: T.muted, transition: 'all .15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surface2; (e.currentTarget as HTMLElement).style.color = T.ink; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = T.muted; }}>
                                <RotateCcw size={12}/>
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Bağlı ── */}
                {status === 'connected' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: T.surface, border: `1px solid rgba(37,211,102,0.15)`, borderRadius: T.rSm }}>
                            <CheckCircle2 size={18} color={WA.green} style={{ flexShrink: 0 }}/>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: T.ink }}>WhatsApp aktif</div>
                                <div style={{ fontSize: '11px', color: T.muted, marginTop: '2px' }}>
                                    Instance: <code style={{ fontFamily: "'JetBrains Mono',monospace", background: T.surface2, padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px' }}>{savedInstance}</code>
                                    <span style={{ marginLeft: '8px', color: T.muted2 }}>• Her 30sn kontrol edilir</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={handleDisconnect}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', borderRadius: T.rSm, border: '1px solid rgba(201,64,64,0.2)', background: 'none', color: '#C94040', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(201,64,64,0.06)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                            <Trash2 size={13}/> Bağlantıyı Kes
                        </button>
                    </div>
                )}

                {/* ── QR Kod ── */}
                {status === 'qr' && qrCode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '18px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rSm }}>
                            <img
                                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                alt="WhatsApp QR"
                                style={{ width: 200, height: 200, borderRadius: T.rSm }}
                            />
                            <div style={{ width: 200 }}>
                                <div style={{ height: 4, background: T.surface3, borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: '999px', background: T.orange, width: `${(qrExpiry / 60) * 100}%`, transition: 'width 1s linear' }}/>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '10.5px', color: T.muted }}>
                                    <span>QR süresi</span>
                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: T.orange }}>{qrExpiry}s</span>
                                </div>
                            </div>
                            <div style={{ fontSize: '11.5px', color: T.muted, textAlign: 'center', lineHeight: 1.5 }}>
                                WhatsApp → Bağlı Cihazlar → Cihaz Ekle → QR kodu okut
                            </div>
                        </div>
                        <button onClick={handleRefreshQR}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', borderRadius: T.rSm, border: `1px solid ${T.border2}`, background: T.surface, color: T.muted, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
                            <RefreshCw size={13}/> QR Yenile
                        </button>
                    </div>
                )}

                {/* ── Oluşturuluyor ── */}
                {status === 'creating' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '28px 0' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: T.surface2, display: 'grid', placeItems: 'center' }}>
                            <Loader2 size={22} color={T.orange} className="animate-spin"/>
                        </div>
                        <div style={{ fontSize: '13px', color: T.muted }}>WhatsApp bağlantısı hazırlanıyor...</div>
                    </div>
                )}

                {/* ── Bağla formu ── */}
                {status === 'idle' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: '14px 16px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted, marginBottom: '8px' }}>
                                Evolution API Instance Adı
                            </div>
                            <input
                                type="text"
                                value={instanceInput}
                                onChange={e => setInstanceInput(e.target.value)}
                                placeholder="örn: timeflow"
                                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                                style={{ width: '100%', background: T.surface, border: `1px solid ${T.border2}`, borderRadius: T.rXs, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: '12.5px', color: T.ink, outline: 'none', marginBottom: '6px' }}
                                onFocus={e => { e.target.style.borderColor = T.orange; e.target.style.boxShadow = '0 0 0 3px rgba(255,90,31,0.08)'; }}
                                onBlur={e  => { e.target.style.borderColor = T.border2; e.target.style.boxShadow = 'none'; }}
                            />
                            <div style={{ fontSize: '10.5px', color: T.muted }}>Evolution API Manager'dan oluşturduğun instance adı</div>
                        </div>
                        <button onClick={handleConnect} disabled={!instanceInput.trim()}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: T.rSm, background: instanceInput.trim() ? T.ink : T.surface3, color: instanceInput.trim() ? T.cream : T.muted2, border: 'none', fontSize: '13px', fontWeight: 700, cursor: instanceInput.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'background .15s' }}>
                            <Smartphone size={15}/>
                            WhatsApp Bağla
                        </button>
                    </div>
                )}
            </div>

            {/* ── Mesaj Şablonları ── */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: T.rXs, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center' }}>
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                                <rect x="1" y="1" width="14" height="14" rx="3" stroke={T.muted} strokeWidth="1.4"/>
                                <path d="M4 5h8M4 8h6M4 11h4" stroke={T.muted} strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontSize: '13.5px', fontWeight: 750, color: T.ink }}>Gönderilecek Mesajlar</div>
                            <div style={{ fontSize: '11px', color: T.muted, marginTop: '1px' }}>Otomatik hatırlatma şablonları</div>
                        </div>
                    </div>
                </div>

                {/* 2-column templates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '20px', gap: '20px' }}>

                    {/* 24 saat */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ background: T.ink, color: T.cream, fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: '999px' }}>24 saat önce</span>
                            <span style={{ fontSize: '10.5px', color: T.muted }}>Hatırlatma</span>
                        </div>
                        {/* Phone preview */}
                        <div style={{ background: WA.chat, borderRadius: T.rSm, padding: '14px', marginBottom: '12px', minHeight: 140 }}>
                            <div style={{ background: 'white', borderRadius: '0 10px 10px 10px', padding: '11px 13px', fontSize: '12px', lineHeight: 1.6, color: '#111', maxWidth: '92%', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                                <div style={{ whiteSpace: 'pre-line' }}>{preview24h}</div>
                                <div style={{ fontSize: '9px', color: 'rgba(0,0,0,.35)', textAlign: 'right', marginTop: '5px' }}>14:22 ✔✔</div>
                            </div>
                        </div>
                        <div style={{ fontSize: '10.5px', color: T.muted, marginTop: '5px' }}>Randevudan 24 saat önce gönderilir</div>
                    </div>

                    {/* 2 saat */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ background: 'rgba(255,90,31,0.12)', color: T.orange, fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: '999px', border: '1px solid rgba(255,90,31,0.2)' }}>2 saat önce</span>
                            <span style={{ fontSize: '10.5px', color: T.muted }}>Son hatırlatma</span>
                        </div>
                        {/* Phone preview */}
                        <div style={{ background: WA.chat, borderRadius: T.rSm, padding: '14px', marginBottom: '12px', minHeight: 140 }}>
                            <div style={{ background: 'white', borderRadius: '0 10px 10px 10px', padding: '11px 13px', fontSize: '12px', lineHeight: 1.6, color: '#111', maxWidth: '92%', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                                <div style={{ whiteSpace: 'pre-line' }}>{preview2h}</div>
                                <div style={{ fontSize: '9px', color: 'rgba(0,0,0,.35)', textAlign: 'right', marginTop: '5px' }}>09:58 ✔✔</div>
                            </div>
                        </div>
                        <div style={{ fontSize: '10.5px', color: T.muted, marginTop: '5px' }}>Randevudan 2 saat önce gönderilir</div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '7px', background: T.surface2 }}>
                    <Info size={11} color={T.muted}/>
                    <span style={{ fontSize: '10.5px', color: T.muted }}>n8n üzerinden her 30 dakikada bir kontrol edilerek otomatik gönderilir.</span>
                </div>
            </div>
        </div>
    );
}
