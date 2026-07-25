import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, RefreshCw, Trash2, RotateCcw, Smartphone, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { useTheme } from '@/contexts/ThemeContext';
import {
    build24hMessage,
    build2hMessage,
    buildRecallMessage,
    buildWinbackMessage,
    buildRenewalMessage,
} from '@/services/waTemplates';
import { waConnect, waState, waDisconnect, waHealth, waSetFeatures, lastProxyError, type WaHealth } from '@/services/whatsapp';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { commsForSector, type SectorComms } from '@/lib/sectorProfiles';
import { useSectorComms } from '@/hooks/useSectorComms';

// ── Design tokens ────────────────────────────────────────────────────────────
const LT = {
  ink:      '#0E0E0E', cream:    '#F3EDE3', orange:   '#FF5A1F',
  surface:  '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
  border:   'rgba(14,14,14,0.09)', border2:  'rgba(14,14,14,0.14)',
  muted:    'rgba(14,14,14,0.48)', muted2:   'rgba(14,14,14,0.30)',
  r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
  ink:      '#F3EDE3', cream:    '#0C0A08', orange:   '#FF5A1F',
  surface:  '#111009', surface2: '#191610', surface3: '#231E18',
  border:   'rgba(243,237,227,0.08)', border2:  'rgba(243,237,227,0.20)',
  muted:    'rgba(243,237,227,0.45)', muted2:   'rgba(243,237,227,0.28)',
  r: '14px', rSm: '10px', rXs: '7px',
};

// WhatsApp yeşilleri (sabit — temadan bağımsız)
const WA = { bg: '#075E54', green: '#25D366', chat: '#ECE5DD', chatDark: '#1A2733' };

type Status = 'checking'|'idle'|'creating'|'qr'|'connected';

function WaIcon({ size=22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l4.93-1.38A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill={WA.green}/>
      <path d="M17 14.5c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.57-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1.01-1.03 2.46s1.05 2.85 1.2 3.05c.15.2 2.07 3.16 5.01 4.43.7.3 1.25.48 1.68.62.7.22 1.34.19 1.84.12.56-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z" fill="white"/>
    </svg>
  );
}

export function WhatsAppTab() {
    const { settings } = useReservations();
    const { profile } = useOrgProfile();
    const { dark } = useTheme();
    const T = dark ? DT : LT;
    const inkbox   = dark ? '#231E18' : '#0E0E0E';
    const inkboxFg = '#F3EDE3';

    // Bağlantı artık org_whatsapp'ta (org başına tek satır) ve instance adı
    // org id'den türetiliyor — kullanıcı ad yazmıyor, iki işletme çakışamıyor.
    const { connection, loading, setupError, isConnected, isBroken, refresh } = useWhatsApp();

    // Ekran durumu bağlantıdan TÜRETİLİR; uiStatus yalnız geçici yerel adımları
    // (QR bekleme, oluşturuluyor) tutar. Böylece realtime'dan gelen bağlantı
    // değişikliğini bir efektle kopyalamaya gerek kalmıyor.
    const [uiStatus, setUiStatus] = useState<'creating' | 'qr' | 'checking' | null>(null);
    const [qrCode, setQrCode]   = useState<string | null>(null);
    const [qrExpiry, setQrExpiry] = useState(60);
    const [health, setHealth]   = useState<WaHealth | null>(null);
    const [busyFeature, setBusyFeature] = useState<string | null>(null);
    // Webhook kaydı başarısızsa hat bağlı görünür ama gelen mesaj botu sessiz kalır.
    const [webhookWarn, setWebhookWarn] = useState<string | null>(null);

    const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
    const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const savedInstance = connection.instance ?? '';

    // Önizleme sektörün gerçek dilinden üretilir — kuaför kuaför mesajını görsün.
    // Klinik kendi metnini yazdıysa (override) önizleme de onu gösterir.
    const sectorDefault = commsForSector(settings.sector);
    const commsApi = useSectorComms(settings.sector || 'genel');
    const comms = commsApi.effective;
    const [editOpen, setEditOpen] = useState(false);
    const [draft, setDraft] = useState<SectorComms | null>(null);
    const edit = draft ?? comms;
    const setEdit = (patch: Partial<SectorComms>) => setDraft({ ...edit, ...patch });
    const sampleName = settings.sector === 'avukat' ? 'Ahmet Yılmaz' : 'Ayşe Demir';
    const preview24h = build24hMessage({
        comms,
        customerName: sampleName, startTime: '10:00',
        service: settings.services[0]?.name || 'Konsültasyon',
        businessName: settings.businessName,
        mapsUrl: profile.mapsUrl || undefined,
    });
    const preview2h = build2hMessage({
        comms,
        customerName: sampleName, startTime: '14:00',
        service: settings.services[0]?.name || 'Konsültasyon',
        businessName: settings.businessName,
        mapsUrl: profile.mapsUrl || undefined,
    });

    const previewRecall = comms.recall
        ? buildRecallMessage({ customerName: sampleName, businessName: settings.businessName, comms })
        : null;
    const previewWinback = buildWinbackMessage({ customerName: sampleName, businessName: settings.businessName, comms });
    const previewRenewal = buildRenewalMessage({
        customerName: sampleName, packageTitle: '10 Seans Lazer', businessName: settings.businessName, comms,
    });

    const stopTimers = useCallback(() => {
        if (pollRef.current)    clearInterval(pollRef.current);
        if (qrTimerRef.current) clearInterval(qrTimerRef.current);
        pollRef.current = null; qrTimerRef.current = null;
    }, []);

    const loadHealth = useCallback(async () => { setHealth(await waHealth()); }, []);

    const status: Status = uiStatus
        ?? (loading ? 'checking' : isConnected ? 'connected' : 'idle');

    // Bağlıyken son 24 saatin özetini getir.
    useEffect(() => {
        if (loading || !isConnected) return;
        let alive = true;
        (async () => {
            const h = await waHealth();
            if (alive) setHealth(h);
        })();
        return () => { alive = false; };
    }, [loading, isConnected]);

    useEffect(() => stopTimers, [stopTimers]);

    const startQrLoop = useCallback(() => {
        // Bağlanma anını yakalamak için durumu proxy'den soruyoruz; proxy
        // org_whatsapp'ı günceller, realtime da ekranı çevirir.
        stopTimers();
        pollRef.current = setInterval(async () => {
            const res = await waState();
            if (res?.connected) {
                stopTimers(); setQrCode(null); setUiStatus(null);
                setWebhookWarn(res.webhook && !res.webhook.ok ? (res.webhook.reason ?? 'bilinmiyor') : null);
                refresh(); loadHealth();
                toast.success('WhatsApp başarıyla bağlandı! 🎉');
            }
        }, 3000);
        setQrExpiry(60);
        qrTimerRef.current = setInterval(() => {
            setQrExpiry(prev => {
                if (prev <= 1) {
                    waConnect().then(r => { if (r?.qr) setQrCode(r.qr); });
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
    }, [stopTimers, refresh, loadHealth]);

    const handleConnect = async () => {
        setUiStatus('creating'); setQrCode(null);
        const res = await waConnect();
        if (!res) {
            setUiStatus(null);
            toast.error(lastProxyError || 'Bağlantı başlatılamadı');
            return;
        }
        setWebhookWarn(res.webhook && !res.webhook.ok ? (res.webhook.reason ?? 'bilinmiyor') : null);
        if (res.connected) {
            setUiStatus(null); refresh(); loadHealth();
            toast.success('WhatsApp zaten bağlı 🎉');
            return;
        }
        if (!res.qr) {
            setUiStatus(null);
            toast.error('QR kod alınamadı, tekrar deneyin');
            return;
        }
        setQrCode(res.qr); setUiStatus('qr'); startQrLoop();
    };

    const handleRefreshStatus = async () => {
        setUiStatus('checking');
        const res = await waState();
        setWebhookWarn(res?.webhook && !res.webhook.ok ? (res.webhook.reason ?? 'bilinmiyor') : null);
        await refresh(); await loadHealth();
        setUiStatus(null);
        toast.info('Durum güncellendi');
    };

    const handleRefreshQR = async () => {
        const res = await waConnect();
        if (res?.qr) { setQrCode(res.qr); setQrExpiry(60); }
        else toast.error('QR yenilenemedi');
    };

    const handleDisconnect = async () => {
        stopTimers();
        await waDisconnect();
        await refresh();
        setUiStatus(null); setQrCode(null); setHealth(null);
        toast.success('WhatsApp bağlantısı kesildi');
    };

    const toggleFeature = async (key: 'winback' | 'renewal' | 'recall') => {
        setBusyFeature(key);
        const next = !connection.features[key];
        const res = await waSetFeatures({ [key]: next });
        setBusyFeature(null);
        if (res?.ok) refresh();
        else toast.error('Ayar kaydedilemedi');
    };

    const chatBg = dark ? WA.chatDark : WA.chat;

    return (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

            {/* ── Header ── */}
            <div style={{ marginBottom:'4px' }}>
                <div style={{ fontSize:'15px', fontWeight:800, letterSpacing:'-0.02em', color:T.ink, marginBottom:'5px' }}>WhatsApp Hatırlatma</div>
                <div style={{ fontSize:'12.5px', color:T.muted, lineHeight:1.55 }}>
                    Randevudan <strong style={{ color:T.ink }}>24 saat</strong> ve <strong style={{ color:T.ink }}>2 saat</strong> önce müşterilere otomatik WhatsApp mesajı gönderilir.
                </div>
            </div>

            {/* ── Bağlantı kartı ── */}
            <div style={{
                background: isConnected ? dark?'rgba(37,211,102,0.06)':'rgba(37,211,102,0.04)' : T.surface,
                border: `1px solid ${isConnected?'rgba(37,211,102,0.25)':T.border}`,
                borderRadius:T.r, padding:'20px', transition:'all .2s',
            }}>
                {/* Card header */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                        <div style={{ width:44, height:44, borderRadius:T.rSm, background:WA.bg, display:'grid', placeItems:'center', flexShrink:0 }}>
                            <WaIcon size={24}/>
                        </div>
                        <div>
                            <div style={{ fontSize:'14px', fontWeight:750, color:T.ink, letterSpacing:'-0.01em' }}>WhatsApp Business</div>
                            <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'1px' }}>Evolution API üzerinden</div>
                        </div>
                    </div>

                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        {status==='connected' && (
                            <span style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:700, color:'#2a8a40', background:'rgba(37,211,102,0.12)', border:'1px solid rgba(37,211,102,0.22)', padding:'4px 10px', borderRadius:'999px' }}>
                                <span style={{ width:6, height:6, borderRadius:'50%', background:WA.green, animation:'pulse 2s infinite' }}/>
                                Bağlı
                            </span>
                        )}
                        {status==='idle' && (
                            <span style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:600, color:T.muted, background:T.surface2, border:`1px solid ${T.border}`, padding:'4px 10px', borderRadius:'999px' }}>
                                Bağlı Değil
                            </span>
                        )}
                        {status==='checking' && (
                            <span style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:600, color:T.muted, background:T.surface2, border:`1px solid ${T.border}`, padding:'4px 10px', borderRadius:'999px' }}>
                                <Loader2 size={11} className="animate-spin"/> Kontrol ediliyor
                            </span>
                        )}
                        {(status==='connected'||status==='idle') && (
                            <button onClick={handleRefreshStatus} title="Durumu yenile"
                                style={{ width:30, height:30, borderRadius:T.rXs, border:`1px solid ${T.border}`, background:'none', cursor:'pointer', display:'grid', placeItems:'center', color:T.muted, transition:'all .15s' }}
                                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=T.surface2;(e.currentTarget as HTMLElement).style.color=T.ink;}}
                                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none';(e.currentTarget as HTMLElement).style.color=T.muted;}}>
                                <RotateCcw size={12}/>
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Bağlı ── */}
                {status==='connected' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 14px', background:T.surface, border:'1px solid rgba(37,211,102,0.15)', borderRadius:T.rSm }}>
                            <CheckCircle2 size={18} color={WA.green} style={{ flexShrink:0 }}/>
                            <div>
                                <div style={{ fontSize:'13px', fontWeight:700, color:T.ink }}>WhatsApp aktif</div>
                                <div style={{ fontSize:'11px', color:T.muted, marginTop:'2px' }}>
                                    Hat: <code style={{ fontFamily:"'JetBrains Mono',monospace", background:T.surface2, padding:'1px 6px', borderRadius:'4px', fontSize:'10.5px' }}>{savedInstance}</code>
                                    <span style={{ marginLeft:'8px', color:T.muted2 }}>• işletmenize özel</span>
                                </div>
                            </div>
                        </div>

                        {/* Sağlık: son 24 saatte ne gitti? Bugüne kadar hiçbir
                            gönderim kaydı tutulmuyordu, arıza sessiz kalıyordu. */}
                        {health && (
                            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                                {([
                                    ['Gönderildi', health.last24h.sent, WA.green],
                                    ['Başarısız', health.last24h.failed, dark?'#e07070':'#C94040'],
                                    ['Atlandı', health.last24h.skipped, T.muted],
                                    ['Gelen', health.last24h.inbound, T.orange],
                                ] as [string, number, string][]).map(([label, n, color]) => (
                                    <div key={label} style={{ flex:'1 1 90px', padding:'10px 12px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.rSm }}>
                                        <div style={{ fontSize:'17px', fontWeight:800, color, letterSpacing:'-0.02em' }}>{n}</div>
                                        <div style={{ fontSize:'10.5px', color:T.muted, marginTop:'1px' }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {webhookWarn && (
                            <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px 14px', background: dark?'rgba(255,170,60,0.08)':'rgba(200,120,0,0.06)', border:`1px solid ${dark?'rgba(255,170,60,0.28)':'rgba(200,120,0,0.22)'}`, borderRadius:T.rSm }}>
                                <AlertTriangle size={16} color={dark?'#E0A050':'#B47000'} style={{ flexShrink:0, marginTop:1 }}/>
                                <div style={{ fontSize:'11.5px', color:T.muted, lineHeight:1.5 }}>
                                    <strong style={{ color: dark?'#E0A050':'#B47000' }}>Hat bağlı ama gelen mesajlar dinlenmiyor.</strong>{' '}
                                    Müşteriler yazdığında bot cevap veremez. Sebep: <code style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'10.5px' }}>{webhookWarn}</code>
                                </div>
                            </div>
                        )}
                        {health?.lastError && (
                            <div style={{ fontSize:'10.5px', color:T.muted, padding:'8px 10px', borderRadius:T.rXs, background:T.surface2, border:`1px solid ${T.border}` }}>
                                Son hata: <code style={{ fontFamily:"'JetBrains Mono',monospace" }}>{health.lastError}</code>
                            </div>
                        )}
                        <div style={{ fontSize:'10.5px', color:T.muted2 }}>Son 24 saat · sayılar Ayarlar her açıldığında tazelenir</div>
                        <button onClick={handleDisconnect}
                            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'10px', borderRadius:T.rSm, border:`1px solid ${dark?'rgba(224,112,112,0.3)':'rgba(201,64,64,0.2)'}`, background:'none', color: dark?'#e07070':'#C94040', fontSize:'12.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(201,64,64,0.06)';}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none';}}>
                            <Trash2 size={13}/> Bağlantıyı Kes
                        </button>
                    </div>
                )}

                {/* ── QR Kod ── */}
                {status==='qr' && qrCode && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', padding:'18px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.rSm }}>
                            <img
                                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                alt="WhatsApp QR"
                                style={{ width:200, height:200, borderRadius:T.rSm }}
                            />
                            <div style={{ width:200 }}>
                                <div style={{ height:4, background:T.surface3, borderRadius:'999px', overflow:'hidden' }}>
                                    <div style={{ height:'100%', borderRadius:'999px', background:T.orange, width:`${(qrExpiry/60)*100}%`, transition:'width 1s linear' }}/>
                                </div>
                                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'5px', fontSize:'10.5px', color:T.muted }}>
                                    <span>QR süresi</span>
                                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:T.orange }}>{qrExpiry}s</span>
                                </div>
                            </div>
                            <div style={{ fontSize:'11.5px', color:T.muted, textAlign:'center', lineHeight:1.5 }}>
                                WhatsApp → Bağlı Cihazlar → Cihaz Ekle → QR kodu okut
                            </div>
                        </div>
                        <button onClick={handleRefreshQR}
                            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'10px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.muted, fontSize:'12.5px', fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}>
                            <RefreshCw size={13}/> QR Yenile
                        </button>
                    </div>
                )}

                {/* ── Oluşturuluyor ── */}
                {status==='creating' && (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', padding:'28px 0' }}>
                        <div style={{ width:44, height:44, borderRadius:'50%', background:T.surface2, display:'grid', placeItems:'center' }}>
                            <Loader2 size={22} color={T.orange} className="animate-spin"/>
                        </div>
                        <div style={{ fontSize:'13px', color:T.muted }}>WhatsApp bağlantısı hazırlanıyor...</div>
                    </div>
                )}

                {/* ── Bağla ── */}
                {/* Instance adı artık sorulmuyor: org id'den türetiliyor. Elle ad
                    yazıldığında iki işletme aynı adı verip aynı WhatsApp hattına
                    bağlanabiliyordu. */}
                {status==='idle' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                        {isBroken && (
                            <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px 14px', background: dark?'rgba(224,112,112,0.08)':'rgba(201,64,64,0.05)', border:`1px solid ${dark?'rgba(224,112,112,0.28)':'rgba(201,64,64,0.2)'}`, borderRadius:T.rSm }}>
                                <AlertTriangle size={16} color={dark?'#e07070':'#C94040'} style={{ flexShrink:0, marginTop:1 }}/>
                                <div>
                                    <div style={{ fontSize:'12.5px', fontWeight:700, color: dark?'#e07070':'#C94040' }}>Bağlantı düştü</div>
                                    <div style={{ fontSize:'11px', color:T.muted, marginTop:'2px', lineHeight:1.5 }}>
                                        Hatırlatmalar gönderilmiyor. Telefonda WhatsApp açık ve internete bağlı mı kontrol edip QR'ı yeniden okutun.
                                        {connection.lastError && <> <code style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'10px' }}>{connection.lastError}</code></>}
                                    </div>
                                </div>
                            </div>
                        )}
                        {setupError && (
                            <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px 14px', background: dark?'rgba(224,112,112,0.08)':'rgba(201,64,64,0.05)', border:`1px solid ${dark?'rgba(224,112,112,0.28)':'rgba(201,64,64,0.2)'}`, borderRadius:T.rSm }}>
                                <AlertTriangle size={16} color={dark?'#e07070':'#C94040'} style={{ flexShrink:0, marginTop:1 }}/>
                                <div style={{ fontSize:'11.5px', color:T.muted, lineHeight:1.5 }}>
                                    <strong style={{ color: dark?'#e07070':'#C94040' }}>Kurulum tamamlanmamış.</strong> {setupError}
                                </div>
                            </div>
                        )}
                        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm, padding:'14px 16px' }}>
                            <div style={{ fontSize:'12.5px', color:T.muted, lineHeight:1.6 }}>
                                Bağla'ya bastığınızda işletmenize özel bir WhatsApp hattı hazırlanır ve QR kod çıkar.
                                Telefonunuzdan <strong style={{ color:T.ink }}>WhatsApp → Bağlı Cihazlar → Cihaz Ekle</strong> ile okutmanız yeterli.
                            </div>
                            {/* Daha önce elle "timeflow" gibi bir ad yazılmışsa o hat
                                artık kullanılmıyor; QR'ın yeniden okutulması gerekir. */}
                            <div style={{ fontSize:'10.5px', color:T.muted2, marginTop:'8px', lineHeight:1.5 }}>
                                Daha önce Evolution'da elle bir instance adı tanımladıysanız o hat artık kullanılmıyor —
                                hat adı işletmenizden türetiliyor ve QR'ı bir kez yeniden okutmanız gerekiyor.
                            </div>
                        </div>
                        <button onClick={handleConnect}
                            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'12px', borderRadius:T.rSm, background:inkbox, color:inkboxFg, border:'none', fontSize:'13px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background .15s' }}>
                            <Smartphone size={15}/>
                            {isBroken ? 'Yeniden Bağlan' : 'WhatsApp Bağla'}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Mesaj Şablonları ── */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ width:32, height:32, borderRadius:T.rXs, background:T.surface2, border:`1px solid ${T.border}`, display:'grid', placeItems:'center' }}>
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                                <rect x="1" y="1" width="14" height="14" rx="3" stroke={T.muted} strokeWidth="1.4"/>
                                <path d="M4 5h8M4 8h6M4 11h4" stroke={T.muted} strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontSize:'13.5px', fontWeight:750, color:T.ink }}>Gönderilecek Mesajlar</div>
                            <div style={{ fontSize:'11px', color:T.muted, marginTop:'1px' }}>
                                {commsApi.isCustom ? 'Kendi mesaj diliniz' : 'Sektör varsayılanı — düzenlenebilir'}
                            </div>
                        </div>
                    </div>
                    {commsApi.available && (
                        <button onClick={() => { setDraft(null); setEditOpen(o => !o); }}
                            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', borderRadius:'999px', border:`1px solid ${T.border2}`, background:'none', color:T.ink, fontSize:'11.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                            {editOpen ? 'Kapat' : 'Mesaj dilini düzenle'}
                        </button>
                    )}
                </div>

                {/* ── Mesaj dili override'ı ──
                    Sektör varsayılanı src/lib/sectorProfiles.ts'te; burada kaydedilen
                    metin settings.comms'a custom=true ile yazılır ve sektör senkronu
                    onu bir daha ezmez. Edge function (remind) aynı kaydı okur. */}
                {editOpen && (
                    <div style={{ padding:'18px 20px', borderBottom:`1px solid ${T.border}`, background:T.surface2, display:'grid', gap:'14px' }}>
                        <label style={{ display:'grid', gap:'6px' }}>
                            <span style={{ fontSize:'10.5px', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.muted }}>Karakter — AI bu tonu kullanır</span>
                            <textarea value={edit.persona} onChange={e => setEdit({ persona: e.target.value })} rows={2}
                                style={{ width:'100%', padding:'10px 12px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.ink, fontSize:'12.5px', fontFamily:'inherit', resize:'vertical' }} />
                        </label>

                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:'10px' }}>
                            <label style={{ display:'grid', gap:'6px' }}>
                                <span style={{ fontSize:'10.5px', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.muted }}>Muhatap</span>
                                <input value={edit.audience} onChange={e => setEdit({ audience: e.target.value })} placeholder="hastamız"
                                    style={{ width:'100%', padding:'10px 12px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.ink, fontSize:'12.5px', fontFamily:'inherit' }} />
                            </label>
                            <label style={{ display:'grid', gap:'6px' }}>
                                <span style={{ fontSize:'10.5px', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.muted }}>"…hatırlatmak istedik"</span>
                                <input value={edit.servicePhrase} onChange={e => setEdit({ servicePhrase: e.target.value })} placeholder="tedavinizi"
                                    style={{ width:'100%', padding:'10px 12px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.ink, fontSize:'12.5px', fontFamily:'inherit' }} />
                            </label>
                            <label style={{ display:'grid', gap:'6px' }}>
                                <span style={{ fontSize:'10.5px', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.muted }}>Emoji</span>
                                <input value={edit.emoji} onChange={e => setEdit({ emoji: e.target.value.slice(0, 4) })} maxLength={4}
                                    style={{ width:'100%', padding:'10px 12px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.ink, fontSize:'14px', textAlign:'center', fontFamily:'inherit' }} />
                            </label>
                        </div>

                        {edit.recall && (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:'10px' }}>
                                <label style={{ display:'grid', gap:'6px' }}>
                                    <span style={{ fontSize:'10.5px', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.muted }}>Dönüş hatırlatması</span>
                                    <input value={edit.recall.concept} onChange={e => setEdit({ recall: { ...edit.recall!, concept: e.target.value } })} placeholder="diş kontrolü"
                                        style={{ width:'100%', padding:'10px 12px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.ink, fontSize:'12.5px', fontFamily:'inherit' }} />
                                </label>
                                <label style={{ display:'grid', gap:'6px' }}>
                                    <span style={{ fontSize:'10.5px', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.muted }}>Kaç gün sonra</span>
                                    <input value={String(edit.recall.afterDays)} inputMode="numeric"
                                        onChange={e => setEdit({ recall: { ...edit.recall!, afterDays: Number(e.target.value.replace(/\D/g, '')) || 0 } })}
                                        style={{ width:'100%', padding:'10px 12px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.ink, fontSize:'12.5px', textAlign:'center', fontFamily:'inherit' }} />
                                </label>
                            </div>
                        )}

                        {edit.guardrail && (
                            <div style={{ fontSize:'10.5px', color:T.muted, padding:'8px 10px', borderRadius:T.rXs, background:T.surface, border:`1px solid ${T.border}` }}>
                                Güvenlik kuralı korunur: “{edit.guardrail}”
                            </div>
                        )}

                        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                            <button disabled={commsApi.saving || !draft}
                                onClick={async () => { if (draft && await commsApi.save(draft)) { setDraft(null); setEditOpen(false); } }}
                                style={{ padding:'10px 18px', borderRadius:T.rSm, border:'none', background: draft ? inkbox : T.surface3, color: draft ? inkboxFg : T.muted2, fontSize:'12.5px', fontWeight:700, cursor: draft ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
                                Kaydet
                            </button>
                            {commsApi.isCustom && (
                                <button disabled={commsApi.saving}
                                    onClick={async () => { if (await commsApi.reset()) { setDraft(null); setEditOpen(false); } }}
                                    style={{ padding:'10px 14px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:'none', color:T.muted, fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                                    Sektör varsayılanına dön
                                </button>
                            )}
                            <span style={{ fontSize:'10.5px', color:T.muted2, marginLeft:'auto' }}>
                                Varsayılan: {sectorDefault.persona.slice(0, 40)}…
                            </span>
                        </div>
                    </div>
                )}

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', padding:'20px', gap:'20px' }}>
                    {/* 24 saat */}
                    <div>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                            <span style={{ background:inkbox, color:inkboxFg, fontSize:'9px', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', padding:'4px 9px', borderRadius:'999px' }}>24 saat önce</span>
                            <span style={{ fontSize:'10.5px', color:T.muted }}>Hatırlatma</span>
                        </div>
                        <div style={{ background:chatBg, borderRadius:T.rSm, padding:'14px', marginBottom:'12px', minHeight:140 }}>
                            <div style={{ background: dark?'#2a3942':'white', borderRadius:'0 10px 10px 10px', padding:'11px 13px', fontSize:'12px', lineHeight:1.6, color: dark?'#e9edef':'#111', maxWidth:'92%', boxShadow:'0 1px 3px rgba(0,0,0,.12)' }}>
                                <div style={{ whiteSpace:'pre-line' }}>{preview24h}</div>
                                <div style={{ fontSize:'9px', color: dark?'rgba(233,237,239,0.4)':'rgba(0,0,0,.35)', textAlign:'right', marginTop:'5px' }}>14:22 ✔✔</div>
                            </div>
                        </div>
                        <div style={{ fontSize:'10.5px', color:T.muted, marginTop:'5px' }}>Randevudan 24 saat önce gönderilir</div>
                    </div>

                    {/* 2 saat */}
                    <div>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                            <span style={{ background:T.orange, color: dark?'#0C0A08':'#0E0E0E', fontSize:'9px', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', padding:'4px 9px', borderRadius:'999px' }}>2 saat önce</span>
                            <span style={{ fontSize:'10.5px', color:T.muted }}>Hatırlatma</span>
                        </div>
                        <div style={{ background:chatBg, borderRadius:T.rSm, padding:'14px', marginBottom:'12px', minHeight:140 }}>
                            <div style={{ background: dark?'#2a3942':'white', borderRadius:'0 10px 10px 10px', padding:'11px 13px', fontSize:'12px', lineHeight:1.6, color: dark?'#e9edef':'#111', maxWidth:'92%', boxShadow:'0 1px 3px rgba(0,0,0,.12)' }}>
                                <div style={{ whiteSpace:'pre-line' }}>{preview2h}</div>
                                <div style={{ fontSize:'9px', color: dark?'rgba(233,237,239,0.4)':'rgba(0,0,0,.35)', textAlign:'right', marginTop:'5px' }}>08:01 ✔✔</div>
                            </div>
                        </div>
                        <div style={{ fontSize:'10.5px', color:T.muted, marginTop:'5px' }}>Randevudan 2 saat önce gönderilir</div>
                    </div>

                    {/* Kapatılabilir otomatik mesajlar.
                        Winback ve yenileme bugüne kadar kullanıcıya hiç
                        gösterilmeden onun adına gidiyordu; artık hem önizleniyor
                        hem de kapatılabiliyor. */}
                    {([
                        previewRecall && {
                            key: 'recall' as const, badge: comms.recall!.concept, label: 'Dönüş hatırlatması',
                            text: previewRecall, time: '11:30',
                            note: `Son ziyaretten ~${comms.recall!.afterDays} gün sonra, tarihe 2 gün kala bir kez gönderilir`,
                        },
                        {
                            key: 'winback' as const, badge: 'Sizi özledik', label: 'Geri kazanım',
                            text: previewWinback, time: '12:05',
                            note: '60 günden uzun süredir gelmeyen, ileri tarihli randevusu olmayan müşteriye bir kez gönderilir',
                        },
                        {
                            key: 'renewal' as const, badge: 'Paket yenileme', label: 'Biten pakete teklif',
                            text: previewRenewal, time: '16:40',
                            note: 'Tüm seansları tamamlanan paketin sahibine paket başına bir kez gönderilir',
                        },
                    ].filter(Boolean) as { key: 'recall'|'winback'|'renewal'; badge: string; label: string; text: string; time: string; note: string }[])
                    .map(card => {
                        const on = connection.features[card.key];
                        return (
                            <div key={card.key} style={{ gridColumn:'1 / -1', opacity: on ? 1 : 0.55, transition:'opacity .15s' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                                    <span style={{ background:T.orange, color: dark?'#0C0A08':'#0E0E0E', fontSize:'9px', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', padding:'4px 9px', borderRadius:'999px' }}>{card.badge}</span>
                                    <span style={{ fontSize:'10.5px', color:T.muted }}>{card.label}</span>
                                    <button onClick={() => toggleFeature(card.key)} disabled={busyFeature === card.key}
                                        style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px', padding:'5px 11px', borderRadius:'999px', border:`1px solid ${on ? 'rgba(37,211,102,0.3)' : T.border2}`, background: on ? 'rgba(37,211,102,0.1)' : 'none', color: on ? '#2a8a40' : T.muted, fontSize:'11px', fontWeight:700, cursor: busyFeature === card.key ? 'wait' : 'pointer', fontFamily:'inherit' }}>
                                        {busyFeature === card.key && <Loader2 size={11} className="animate-spin"/>}
                                        {on ? 'Açık' : 'Kapalı'}
                                    </button>
                                </div>
                                <div style={{ background:chatBg, borderRadius:T.rSm, padding:'14px', marginBottom:'12px' }}>
                                    <div style={{ background: dark?'#2a3942':'white', borderRadius:'0 10px 10px 10px', padding:'11px 13px', fontSize:'12px', lineHeight:1.6, color: dark?'#e9edef':'#111', maxWidth:'92%', boxShadow:'0 1px 3px rgba(0,0,0,.12)' }}>
                                        <div style={{ whiteSpace:'pre-line' }}>{card.text}</div>
                                        <div style={{ fontSize:'9px', color: dark?'rgba(233,237,239,0.4)':'rgba(0,0,0,.35)', textAlign:'right', marginTop:'5px' }}>{card.time} ✔✔</div>
                                    </div>
                                </div>
                                <div style={{ fontSize:'10.5px', color:T.muted, marginTop:'5px' }}>
                                    {on ? card.note : 'Kapalı — bu mesaj gönderilmiyor'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
