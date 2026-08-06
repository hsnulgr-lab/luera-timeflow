import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Settings, Clock, Save, Plus, Trash2, Globe, Bell, Palette, Puzzle, Key, Copy, RefreshCw, CheckCircle2, Loader2, Zap, Phone, MessageCircle, Link2, ExternalLink, ImagePlus, X, ToggleLeft, CreditCard, Gift, Boxes, Database } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ConfirmDialog';
import { WhatsAppTab } from '@/components/settings/WhatsAppTab';
import { BillingTab } from '@/components/settings/BillingTab';
import { DataTab } from '@/components/settings/DataTab';
import { useReservations } from '@/hooks/useReservations';
import { useModules } from '@/hooks/useModules';
import { MODULE_META, modulesForSector } from '@/lib/modules';
import { SECTOR_PROFILES, profileForSector } from '@/lib/sectorProfiles';
import { eligibilityTagsFor } from '@/lib/serviceEligibility';
import { useResources } from '@/hooks/useResources';
import { useProducts } from '@/hooks/useProducts';
import { hashPin } from '@/lib/pin';
import { useOrgProfile, slugify } from '@/hooks/useOrgProfile';
import { useTheme } from '@/contexts/ThemeContext';
import type { Service, ServiceRecipeLine, WorkingHours } from '@/types';
import {
    getMyKey, generateMyKey, revokeMyKey,
    getIncomingKey, saveIncomingKey, testConnection,
    buildConnectionString,
    type IntegrationModule, type IntegrationConnection,
} from '@/services/integrationApi';

// ── Design tokens ────────────────────────────────────────────────────────────
const LT = {
  ink:      '#0E0E0E', cream:    '#F3EDE3', orange:   '#FF5A1F',
  surface:  '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
  border:   'rgba(14,14,14,0.09)', border2:  'rgba(14,14,14,0.14)',
  muted:    'rgba(14,14,14,0.48)', muted2:   'rgba(14,14,14,0.30)',
  shadow:   '0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  shadowLg: '0 4px 16px rgba(14,14,14,0.10),0 16px 48px rgba(14,14,14,0.10)',
  r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
  ink:      '#F3EDE3', cream:    '#0C0A08', orange:   '#FF5A1F',
  surface:  '#111009', surface2: '#191610', surface3: '#231E18',
  border:   'rgba(243,237,227,0.08)', border2:  'rgba(243,237,227,0.20)',
  muted:    'rgba(243,237,227,0.45)', muted2:   'rgba(243,237,227,0.28)',
  shadow:   '0 2px 8px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.25)',
  shadowSm: '0 1px 3px rgba(0,0,0,0.2),0 2px 8px rgba(0,0,0,0.15)',
  shadowLg: '0 4px 16px rgba(0,0,0,0.4),0 16px 48px rgba(0,0,0,0.3)',
  r: '14px', rSm: '10px', rXs: '7px',
};

function useT() {
  const { dark } = useTheme();
  return { T: dark ? DT : LT, dark };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  const { T } = useT();
  return <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:T.muted, marginBottom:'6px' }}>{children}</div>;
}

function Input({ value, onChange, type='text', placeholder, style }: {
  value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; style?: React.CSSProperties;
}) {
  const { T, dark } = useT();
  return (
    <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none', colorScheme:dark?'dark':'light', ...style }}
      onFocus={e=>{ e.target.style.borderColor=T.orange; e.target.style.boxShadow='0 0 0 3px rgba(255,90,31,0.1)'; }}
      onBlur={e =>{ e.target.style.borderColor=T.border2; e.target.style.boxShadow='none'; }}
    />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { T } = useT();
  return <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'14px' }}>{children}</div>;
}

// ── ImageUpload (booking görselleri) ──────────────────────────────────────────
function ImageUpload({ url, busy, square, onPick, onClear, T, inkbox, inkboxFg }: {
  label: string; url: string; busy: boolean; square?: boolean;
  onPick: (f: File|undefined) => void; onClear: () => void; T: any; inkbox: string; inkboxFg: string;
}) {
  const w = square ? 84 : '100%';
  const h = square ? 84 : 84;
  if (url) {
    return (
      <div style={{ position:'relative', width:w, height:h, borderRadius:T.rSm, background:`center/cover url(${url})`, border:`1px solid ${T.border}` }}>
        <button onClick={onClear} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:inkbox, color:inkboxFg, border:'none', cursor:'pointer', display:'grid', placeItems:'center' }}>
          <X size={11}/>
        </button>
      </div>
    );
  }
  return (
    <label style={{ width:w, height:h, borderRadius:T.rSm, border:`1.5px dashed ${T.border2}`, display:'grid', placeItems:'center', cursor:'pointer', color:T.muted, background:T.surface2, boxSizing:'border-box' }}>
      {busy ? <Loader2 size={18} className="animate-spin"/> : <ImagePlus size={18}/>}
      <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{onPick(e.target.files?.[0]); e.currentTarget.value='';}}/>
    </label>
  );
}

// ── IntegrationCard ───────────────────────────────────────────────────────────
interface IntegrationCardProps {
  module: IntegrationModule; label: string; description: string; Icon: React.ElementType;
}

function IntegrationCard({ module, label, description, Icon }: IntegrationCardProps) {
  const { T, dark } = useT();

  const [myKey, setMyKey]                   = useState<IntegrationConnection | null>(null);
  const [myKeyLoading, setMyKeyLoading]     = useState(true);
  const [myKeyVisible, setMyKeyVisible]     = useState(false);
  const [myKeyCopied, setMyKeyCopied]       = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [revoking, setRevoking]             = useState(false);
  const [myKeyError, setMyKeyError]         = useState<string | null>(null);
  const [incomingKey, setIncomingKey]       = useState('');
  const [incomingSaved, setIncomingSaved]   = useState('');
  const [savingIncoming, setSavingIncoming] = useState(false);
  const [testing, setTesting]               = useState(false);
  const [testResult, setTestResult]         = useState<boolean | null>(null);
  const [incomingError, setIncomingError]   = useState<string | null>(null);
  const [connStatus, setConnStatus]         = useState<'idle'|'checking'|'connected'|'unverified'>('idle');

  const verifyConnection = async (key: string) => {
    if (!key) { setConnStatus('idle'); return; }
    setConnStatus('checking');
    const ok = await testConnection(key);
    setConnStatus(ok ? 'connected' : 'unverified');
  };

  useEffect(() => {
    (async () => {
      try {
        const [key, incoming] = await Promise.all([getMyKey(module), getIncomingKey(module)]);
        setMyKey(key); setIncomingKey(incoming??''); setIncomingSaved(incoming??'');
        await verifyConnection(incoming??'');
      } catch { setMyKeyError('Bağlantı bilgileri yüklenemedi.'); setConnStatus('idle'); }
      finally  { setMyKeyLoading(false); }
    })();
  }, [module]);

  const handleGenerate = async () => {
    setGenerating(true); setMyKeyError(null);
    try { const key = await generateMyKey(module); setMyKey(key); setMyKeyVisible(true); }
    catch (e: any) { setMyKeyError(`Key oluşturulamadı: ${e?.message??'bilinmeyen hata'}`); }
    finally { setGenerating(false); }
  };
  const handleRevoke = async () => {
    if (!(await confirmDialog({ title: 'API key iptal edilsin mi?', description: 'Bu anahtar geçersiz olur; kullanan entegrasyonlar durur.', danger: true, confirmLabel: 'İptal Et' }))) return;
    setRevoking(true);
    try { await revokeMyKey(module); setMyKey(null); setMyKeyVisible(false); }
    catch { setMyKeyError('Key iptal edilemedi.'); }
    finally { setRevoking(false); }
  };
  const handleCopy = () => {
    if (!myKey?.api_key) return;
    navigator.clipboard.writeText(buildConnectionString(myKey.api_key, myKey.user_id));
    setMyKeyCopied(true); setTimeout(()=>setMyKeyCopied(false), 2000);
  };
  const handleSaveIncoming = async () => {
    setSavingIncoming(true); setIncomingError(null); setTestResult(null);
    try { await saveIncomingKey(module, incomingKey); setIncomingSaved(incomingKey); await verifyConnection(incomingKey); }
    catch { setIncomingError('Key kaydedilemedi.'); }
    finally { setSavingIncoming(false); }
  };
  const handleTest = async () => {
    if (!incomingKey) return; setTesting(true); setTestResult(null);
    const ok = await testConnection(incomingKey);
    setTestResult(ok); setConnStatus(ok?'connected':'unverified'); setTesting(false);
  };

  const isConnected = connStatus === 'connected';
  const isDirty     = incomingKey !== incomingSaved;

  const inkbox = dark ? '#231E18' : '#0E0E0E';
  const inkboxFg = '#F3EDE3';

  return (
    <div style={{ background:isConnected?dark?'rgba(255,90,31,0.07)':'rgba(255,90,31,0.04)':T.surface, border:`1px solid ${isConnected?T.orange:T.border}`, borderRadius:T.r, padding:'20px', transition:'all .15s' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ width:40, height:40, borderRadius:T.rSm, background:isConnected?inkbox:T.surface2, display:'grid', placeItems:'center' }}>
            <Icon size={18} color={isConnected?inkboxFg:T.muted}/>
          </div>
          <div>
            <div style={{ fontSize:'14px', fontWeight:750, color:T.ink, letterSpacing:'-0.01em' }}>LUERA {label}</div>
            <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'2px' }}>{description}</div>
          </div>
        </div>
        {connStatus==='connected' && (
          <span style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:700, color: dark?'#7AD3A0':'#2E7D43', background: dark?'rgba(45,160,50,.16)':'#E6F4EA', border:`1px solid ${dark?'rgba(122,211,160,0.2)':'rgba(46,125,67,0.2)'}`, padding:'4px 10px', borderRadius:'999px' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background: dark?'#7AD3A0':'#2E7D43', animation:'pulse 2s infinite' }}/>
            Bağlı
          </span>
        )}
        {connStatus==='checking' && (
          <span style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:600, color:T.muted, background:T.surface2, border:`1px solid ${T.border}`, padding:'4px 10px', borderRadius:'999px' }}>
            <Loader2 size={11} className="animate-spin"/> Kontrol ediliyor
          </span>
        )}
        {connStatus==='unverified' && (
          <span title="Key kayıtlı ama gateway yanıt vermedi" style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:700, color: dark?'#E0A12E':'#A66A0E', background: dark?'rgba(224,161,46,0.12)':'#FCEFD6', border:`1px solid ${dark?'rgba(224,161,46,0.2)':'rgba(166,106,14,0.2)'}`, padding:'4px 10px', borderRadius:'999px' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#E0A12E' }}/>
            Doğrulanmadı
          </span>
        )}
        {connStatus==='idle' && (
          <span style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:600, color:T.muted, background:T.surface2, border:`1px solid ${T.border}`, padding:'4px 10px', borderRadius:'999px' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:T.muted2 }}/>
            Bağlı Değil
          </span>
        )}
      </div>

      {/* TimeFlow API Key */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm, padding:'14px 16px', marginBottom:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'8px' }}>
          <Key size={13} color={T.muted}/>
          <span style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted }}>TimeFlow API Key</span>
        </div>
        <div style={{ fontSize:'11.5px', color:T.muted, marginBottom:'12px' }}>Bu key'i {label} ayarlarına girerek bağlantıyı etkinleştir.</div>
        {myKeyLoading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
            <Loader2 size={16} color={T.muted} className="animate-spin"/>
          </div>
        ) : myKey ? (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', background:T.surface, border:`1px solid ${T.border2}`, borderRadius:T.rXs, padding:'8px 12px', marginBottom:'8px' }}>
              <code style={{ flex:1, fontSize:'11px', fontFamily:"'JetBrains Mono',monospace", color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {myKeyVisible ? myKey.api_key : `${myKey.api_key.slice(0,8)}${'•'.repeat(16)}${myKey.api_key.slice(-4)}`}
              </code>
              <button onClick={()=>setMyKeyVisible(v=>!v)} style={{ fontSize:'10px', fontWeight:700, color:T.muted, padding:'2px 8px', borderRadius:T.rXs, border:`1px solid ${T.border}`, background:'none', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                {myKeyVisible?'Gizle':'Göster'}
              </button>
            </div>
            <div style={{ display:'flex', gap:'6px' }}>
              <button onClick={handleCopy} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'8px', borderRadius:T.rSm, background:myKeyCopied?'#5DBB63':inkbox, color:myKeyCopied?'#fff':inkboxFg, border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background .15s' }}>
                {myKeyCopied?<><CheckCircle2 size={13}/>Kopyalandı</>:<><Copy size={13}/>Kopyala</>}
              </button>
              <button onClick={handleGenerate} disabled={generating} title="Yeni key üret" style={{ padding:'8px 12px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.muted, cursor:'pointer', transition:'all .15s' }}>
                <RefreshCw size={13} className={generating?'animate-spin':''}/>
              </button>
              <button onClick={handleRevoke} disabled={revoking} title="Key'i iptal et" style={{ padding:'8px 12px', borderRadius:T.rSm, border:`1px solid ${dark?'rgba(224,112,112,0.3)':'rgba(201,64,64,0.2)'}`, background:T.surface, color: dark?'#e07070':'#C94040', cursor:'pointer', transition:'all .15s' }}>
                <Trash2 size={13}/>
              </button>
            </div>
            <div style={{ fontSize:'10.5px', color:T.muted2, marginTop:'8px' }}>
              Oluşturulma: {new Date(myKey.created_at).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})}
            </div>
          </div>
        ) : (
          <button onClick={handleGenerate} disabled={generating} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'10px', borderRadius:T.rSm, background:inkbox, color:inkboxFg, border:'none', fontSize:'12.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            {generating?<><Loader2 size={13} className="animate-spin"/>Oluşturuluyor...</>:<><Key size={13}/>API Key Oluştur</>}
          </button>
        )}
        {myKeyError && <div style={{ fontSize:'11.5px', color: dark?'#e07070':'#C94040', marginTop:'8px' }}>{myKeyError}</div>}
      </div>

      {/* Incoming key */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm, padding:'14px 16px' }}>
        <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'4px' }}>{label} API Key</div>
        <div style={{ fontSize:'11.5px', color:T.muted, marginBottom:'10px' }}>{label} → Ayarlar → Entegrasyonlar sayfasından kopyala.</div>
        <input type="text" value={incomingKey} onChange={e=>{setIncomingKey(e.target.value);setTestResult(null);}} placeholder="API key yapıştır..."
          style={{ width:'100%', background:T.surface, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'9px 12px', fontFamily:"'JetBrains Mono',monospace", fontSize:'11.5px', color:T.ink, outline:'none', marginBottom:'8px' }}
          onFocus={e=>{e.target.style.borderColor=T.orange;e.target.style.boxShadow='0 0 0 3px rgba(255,90,31,0.08)';}}
          onBlur={e =>{e.target.style.borderColor=T.border2;e.target.style.boxShadow='none';}}
        />
        <div style={{ display:'flex', gap:'6px' }}>
          <button onClick={handleSaveIncoming} disabled={savingIncoming||!isDirty} style={{ flex:1, padding:'9px', borderRadius:T.rSm, background:isDirty?inkbox:T.surface3, color:isDirty?inkboxFg:T.muted2, border:'none', fontSize:'12.5px', fontWeight:700, cursor:isDirty?'pointer':'not-allowed', fontFamily:'inherit', transition:'background .15s' }}>
            {savingIncoming?'Kaydediliyor...':'Kaydet'}
          </button>
          <button onClick={handleTest} disabled={testing||!incomingKey} style={{ padding:'9px 16px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:T.surface, color:T.muted, fontSize:'12.5px', fontWeight:600, cursor:incomingKey?'pointer':'not-allowed', fontFamily:'inherit', transition:'all .15s' }}>
            {testing?<Loader2 size={13} className="animate-spin"/>:'Test Et'}
          </button>
        </div>
        {testResult !== null && (
          <div style={{ fontSize:'11.5px', fontWeight:600, marginTop:'8px', color:testResult?(dark?'#7AD3A0':'#4a9e50'):(dark?'#e07070':'#C94040') }}>
            {testResult?'✓ Bağlantı başarılı':'✗ Bağlantı kurulamadı — key\'i kontrol edin'}
          </div>
        )}
        {incomingError && <div style={{ fontSize:'11.5px', color:dark?'#e07070':'#C94040', marginTop:'8px' }}>{incomingError}</div>}
      </div>
    </div>
  );
}

// ── SettingsPage ──────────────────────────────────────────────────────────────
type TabId = 'general'|'modules'|'hours'|'services'|'booking'|'webhooks'|'integrations'|'whatsapp'|'billing'|'data';

// Booking sayfasının gömülebilir (iframe) versiyonu için kopyala-yapıştır kodu.
// Script, widget'ın postMessage ile bildirdiği yüksekliğe göre iframe'i boyutlar.
function buildEmbedCode(bookingUrl: string): string {
  const src = `${bookingUrl}?embed=1`;
  return `<!-- Luera TimeFlow randevu widget'ı -->
<iframe src="${src}" title="Online Randevu" loading="lazy"
  style="width:100%;max-width:464px;height:760px;border:none;border-radius:22px;display:block"></iframe>
<script>window.addEventListener("message",function(e){
  if(e.data&&e.data.type==="tf-embed-height"){
    document.querySelectorAll('iframe[src^="${bookingUrl}"]').forEach(function(f){f.style.height=e.data.height+"px"});
  }
});</script>`;
}

export const SettingsPage = () => {
  const { T, dark } = useT();
  const { settings, updateSettings } = useReservations();
  const { modules, isEnabled, setModule, applySectorDefaults } = useModules();
  const { profile, setProfile, save: saveProfile, uploadImage } = useOrgProfile();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab]       = useState<TabId>((searchParams.get('tab') as TabId) || 'general');
  useEffect(() => { const t = searchParams.get('tab') as TabId | null; if (t) setActiveTab(t); }, [searchParams]);
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [workingHours, setWorkingHours] = useState(settings.workingHours);
  const [services, setServices]         = useState(settings.services);
  const [webhookUrl, setWebhookUrl]     = useState(settings.webhookUrl||'');
  const [sector, setSector]             = useState(settings.sector || 'genel');
  // Kaynak yönetimi (051)
  const { resources, addResource, updateResource, removeResource } = useResources();
  const { products } = useProducts();
  // Reçetede yalnız stok takibi açık ürünler seçilebilir
  const stockProducts = products.filter(p => p.tracksStock !== false);
  const [recipeOpen, setRecipeOpen] = useState<string | null>(null);
  const resourceTypes = profileForSector(sector).resourceTypes;
  // Hizmet satırındaki uygunluk etiketi seçenekleri — sektörden türetilir.
  const eligibilityTags = eligibilityTagsFor(sector);
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceCap, setNewResourceCap]   = useState(1);
  const [newResourceType, setNewResourceType] = useState(() => resourceTypes[0] || '');
  const effectiveResourceType = resourceTypes.includes(newResourceType) ? newResourceType : (resourceTypes[0] || '');
  const [managerPinInput, setManagerPinInput] = useState('');
  const [loyaltyReward, setLoyaltyReward] = useState(settings.loyaltyReward || 'Ücretsiz hizmet');
  const [rebookNote, setRebookNote]     = useState(settings.rebookNote || '');
  const [saved, setSaved]               = useState(false);
  const [uploading, setUploading]       = useState<string|null>(null);

  // Ayarlar Supabase'den asenkron gelir; form alanlarını yüklenen değerlerle
  // senkronla — yoksa varsayılanlarla dolan form "kaydedilmemiş değişiklik var" sanır
  useEffect(() => {
    setBusinessName(settings.businessName);
    setWorkingHours(settings.workingHours);
    setServices(settings.services);
    setWebhookUrl(settings.webhookUrl || '');
    setSector(settings.sector || 'genel');
    setLoyaltyReward(settings.loyaltyReward || 'Ücretsiz hizmet');
    setRebookNote(settings.rebookNote || '');
  }, [settings]);

  const inkbox   = dark ? '#231E18' : '#0E0E0E';
  const inkboxFg = '#F3EDE3';
  const bookingUrl = profile.slug ? `${window.location.origin}/book/${profile.slug}` : '';

  // Kaydedilmemiş değişiklik var mı — sayfadan çıkarken/yenilerken sessizce kaybolmasın
  const dirty = businessName !== settings.businessName
    || JSON.stringify(workingHours) !== JSON.stringify(settings.workingHours)
    || JSON.stringify(services) !== JSON.stringify(settings.services)
    || webhookUrl !== (settings.webhookUrl || '')
    || sector !== (settings.sector || 'genel')
    || loyaltyReward !== (settings.loyaltyReward || 'Ücretsiz hizmet')
    || rebookNote !== (settings.rebookNote || '')
    || managerPinInput.trim() !== '';

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const handleSave = async () => {
    // Yönetici PIN sadece girildiyse güncellenir (hash'lenir); boşsa mevcut korunur
    const managerPin = managerPinInput.trim() ? await hashPin(managerPinInput.trim()) : settings.managerPin;
    const sectorChanged = Boolean(settings.sector) && sector !== settings.sector;
    // Sektör bir tema değil, verinin anlamıdır: paketler, özel alanlar,
    // kontrendikasyon kuralları ve terminoloji ona bağlıdır. Dolu bir işletmede
    // sektör değiştirmek, eski sektörün kayıtlarını yeni sektörün ekranlarında
    // gösterir (diş tedavi planlarının güzellik "Paketler" sayfasında çıkması
    // tam olarak buydu). Bilinçli bir karar olduğundan emin olalım.
    if (sectorChanged) {
      const ok = await confirmDialog({
        title: `Sektör "${profileForSector(settings.sector).label}" → "${profileForSector(sector).label}" olarak değiştirilsin mi?`,
        description: 'Mevcut müşteri, randevu ve paket kayıtları SİLİNMEZ; ancak eski sektöre göre oluşturuldukları için yeni sektörün ekranlarında yanlış görünebilir. Dolu bir işletmede bu değişiklik önerilmez.',
        confirmLabel: 'Sektörü değiştir',
        danger: true,
      });
      if (!ok) { setSector(settings.sector || 'genel'); return; }
    }
    updateSettings({...settings, businessName, workingHours, services, webhookUrl:webhookUrl||undefined, sector, managerPin});
    await saveProfile(profile);
    setManagerPinInput('');
    setSaved(true); setTimeout(()=>setSaved(false), 2000);
    // Sektör değişimi modülleri BİLEREK sıfırlamaz — kullanıcının elle açtığı
    // modüller sessizce kapanmamalı. Bunun yerine öneri hatırlatılır.
    if (sectorChanged) {
      toast('Sektör güncellendi', {
        description: `Modülleri ${profileForSector(sector).label} varsayılanına almak için Modüller sekmesindeki "Uygula" düğmesini kullanın.`,
        duration: 7000,
      });
    }
  };
  const handleUpload = async (file: File|undefined, kind: 'logo'|'cover'|'gallery') => {
    if (!file) return;
    setUploading(kind);
    const url = await uploadImage(file, kind);
    setUploading(null);
    if (!url) return;
    if (kind === 'gallery') setProfile({ ...profile, galleryUrls: [...profile.galleryUrls, url] });
    else if (kind === 'logo') setProfile({ ...profile, logoUrl: url });
    else setProfile({ ...profile, coverUrl: url });
  };
  const updateHour = (day: number, field: keyof WorkingHours, value: string|boolean) =>
    setWorkingHours(prev => prev.map(h => h.day===day?{...h,[field]:value}:h));
  const addService = () => {
    const colors = ['#FF5A1F','#E8973C','#C95A3C','#CB5E84','#8E70B2','#3F9D9A','#5E9C6C','#5B7CC2'];
    setServices(prev=>[...prev,{id:`svc-${Date.now()}`,name:'',duration:30,color:colors[prev.length%colors.length]}]);
  };
  const updateService = (id: string, field: keyof Service, value: string|number|string[]) =>
    setServices(prev=>prev.map(s=>s.id===id?{...s,[field]:value}:s));
  const removeService = (id: string) => setServices(prev=>prev.filter(s=>s.id!==id));

  // ── Hizmet reçetesi (sarf tüketimi) ──
  // "Dip boya = 60 ml boya + 60 ml oksidan". İşlem kasaya gönderilince stok
  // defterine 'usage' hareketi olarak düşer; personel renk sayacında miktarı
  // düzeltebilir. Reçete yoksa o hizmet stoktan hiçbir şey düşürmez.
  const setRecipe = (id: string, recipe: ServiceRecipeLine[]) =>
    setServices(prev=>prev.map(s=>s.id===id?{...s,recipe}:s));
  const addRecipeLine = (svc: Service) => {
    const used = new Set((svc.recipe||[]).map(l=>l.productId));
    const next = stockProducts.find(p=>!used.has(p.id));
    if (!next) return;
    setRecipe(svc.id, [...(svc.recipe||[]), { productId: next.id, quantity: 0 }]);
  };

  const tabs: {id:TabId;label:string;icon:React.ElementType}[] = [
    {id:'general',      label:'Genel',            icon:Settings    },
    {id:'modules',      label:'Modüller',         icon:ToggleLeft  },
    {id:'hours',        label:'Çalışma Saatleri', icon:Clock       },
    {id:'services',     label:'Hizmetler',        icon:Palette     },
    {id:'booking',      label:'Booking Sayfam',   icon:Link2       },
    {id:'webhooks',     label:'Webhook',           icon:Globe       },
    {id:'whatsapp',     label:'WhatsApp',          icon:MessageCircle},
    {id:'billing',      label:'Faturalandırma',   icon:CreditCard  },
    {id:'data',         label:'Veri',             icon:Database    },
  ];
  // Entegrasyonlar bir ayar bölümü değil, eklenti/uzantı merkezi — sekme
  // listesinde değil, tab çubuğunun yanında ayrı vurgulu bir buton olarak durur.

  return (
    <div style={{ flex:1, minHeight:0, overflowY:'auto', background:T.surface, padding:'24px 28px 40px' }}>
      <div style={{ maxWidth:860, margin:'0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'13px' }}>
            <div style={{ width:40, height:40, background:inkbox, borderRadius:'10px', display:'grid', placeItems:'center', flexShrink:0 }}>
              <Settings size={18} color={inkboxFg}/>
            </div>
            <div>
              <div style={{ fontSize:'21px', fontWeight:800, letterSpacing:'-0.03em', lineHeight:1.1, color:T.ink }}>Ayarlar</div>
              <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'2px' }}>Sistem konfigürasyonu</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            {dirty && !saved && (
              <span style={{ fontSize:'11.5px', fontWeight:650, color:'#E8973C', display:'flex', alignItems:'center', gap:'5px' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#E8973C', flexShrink:0 }}/>
                Kaydedilmemiş değişiklikler var
              </span>
            )}
            {/* Entegrasyonlar: ayar sekmesi değil eklenti merkezi — başlıkta ayrı durur */}
            <button onClick={()=>setActiveTab('integrations')}
              style={{ display:'flex', alignItems:'center', gap:'7px', padding:'9px 16px', borderRadius:T.rSm,
                background: activeTab==='integrations' ? 'linear-gradient(135deg,#FF5A1F,#E04510)' : 'rgba(255,90,31,.08)',
                border:`1px solid ${activeTab==='integrations' ? 'transparent' : 'rgba(255,90,31,.35)'}`,
                boxShadow: activeTab==='integrations' ? '0 4px 14px rgba(255,90,31,.35)' : 'none',
                fontSize:'12.5px', fontWeight:750, color: activeTab==='integrations' ? '#fff' : '#FF5A1F',
                cursor:'pointer', fontFamily:'inherit', transition:'all .15s', whiteSpace:'nowrap' }}>
              <Puzzle size={14}/>
              Entegrasyonlar
            </button>
            <button onClick={handleSave}
              style={{ display:'flex', alignItems:'center', gap:'7px', background:saved?'#5DBB63':inkbox, color:saved?'#fff':inkboxFg, border:'none', borderRadius:T.rSm, padding:'9px 18px', fontSize:'13px', fontWeight:650, cursor:'pointer', fontFamily:'inherit', transition:'background .25s' }}>
              <Save size={13}/>{saved?'Kaydedildi!':'Kaydet'}
            </button>
          </div>
        </div>

        {/* ── Tab bar ── (sığmazsa sarar; Entegrasyonlar başlıkta ayrı butondur) */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'2px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm, padding:'4px', marginBottom:'18px' }}>
          {tabs.map(tab=>{
            const isActive = activeTab===tab.id;
            return (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{ flex:'1 0 auto', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'8px 10px', borderRadius:T.rXs, background:isActive?T.surface:'transparent', border:`1px solid ${isActive?T.border:'transparent'}`, boxShadow:isActive?T.shadowSm:'none', fontSize:'12px', fontWeight:isActive?700:500, color:isActive?T.ink:T.muted, cursor:'pointer', fontFamily:'inherit', transition:'all .15s', whiteSpace:'nowrap' }}>
                <tab.icon size={13}/>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, boxShadow:T.shadowSm, padding:'24px' }}>

          {/* ── Genel ── */}
          {activeTab==='general' && (
            <div>
              <SectionTitle>İşletme Bilgileri</SectionTitle>
              <div style={{ marginBottom:'14px' }}>
                <FieldLabel>İşletme Adı</FieldLabel>
                <Input value={businessName} onChange={setBusinessName} placeholder="İşletme adınız"/>
              </div>
              <div style={{ marginBottom:'22px' }}>
                <FieldLabel>Slot Süresi (dakika)</FieldLabel>
                <select value={settings.slotDuration} onChange={e=>updateSettings({...settings,slotDuration:parseInt(e.target.value)})}
                  style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none', colorScheme:dark?'dark':'light' }}>
                  <option value="15">15 dakika</option>
                  <option value="30">30 dakika</option>
                  <option value="60">60 dakika</option>
                </select>
              </div>
              <div style={{ marginBottom:'22px' }}>
                <FieldLabel>Sektör</FieldLabel>
                <select value={sector} onChange={e=>setSector(e.target.value)}
                  style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none', colorScheme:dark?'dark':'light' }}>
                  {Object.entries(SECTOR_PROFILES).map(([key, p]) => (
                    <option key={key} value={key}>{p.label}</option>
                  ))}
                </select>
                <div style={{ fontSize:'11px', color:T.muted, marginTop:'6px' }}>Terminoloji, varsayılan modüller ve AI hatırlatma tonu sektörüne göre uyarlanır.</div>
              </div>
              <div style={{ marginBottom:'22px' }}>
                <FieldLabel>Yönetici PIN (Mobil)</FieldLabel>
                <input type="text" inputMode="numeric" maxLength={6}
                  placeholder={settings.managerPin ? 'Değiştirmek için yeni PIN' : '4 haneli PIN (ör. 1234)'}
                  value={managerPinInput} onChange={e=>setManagerPinInput(e.target.value.replace(/\D/g,''))}
                  style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none', letterSpacing:'.3em' }}/>
                <div style={{ fontSize:'11px', color:T.muted, marginTop:'6px' }}>Mobil uygulamada "Yönetici Girişi" bu PIN ile açılır; ciro ve tam erişim görünür. {settings.managerPin?'Tanımlı — boş bırakırsan korunur.':'Henüz tanımlı değil.'}</div>
              </div>
              {/* ── Dijital Müşteri Kartı (sadakat) ── */}
              <div style={{ marginBottom:'22px', padding:'16px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ fontSize:'13.5px', fontWeight:700, color:T.ink, display:'flex', alignItems:'center', gap:7 }}>
                      <Gift size={15} color={T.orange}/> Dijital Müşteri Kartı
                    </div>
                    <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'3px' }}>"{settings.loyaltyThreshold ?? 10} gelişte 1 {settings.loyaltyReward || 'ödül'}" — her tamamlanan randevu 1 damga.</div>
                  </div>
                  <button onClick={()=>updateSettings({...settings, loyaltyEnabled: !(settings.loyaltyEnabled)})}
                    style={{ width:46, height:28, borderRadius:999, background:settings.loyaltyEnabled?T.orange:T.surface3, position:'relative', border:'none', cursor:'pointer', flexShrink:0, transition:'background .18s' }}>
                    <span style={{ position:'absolute', top:3, left:settings.loyaltyEnabled?21:3, width:22, height:22, borderRadius:'50%', background:'#fff', transition:'left .18s' }}/>
                  </button>
                </div>
                {settings.loyaltyEnabled && (
                  <div style={{ display:'flex', gap:12, marginTop:14 }}>
                    <div style={{ width:140 }}>
                      <FieldLabel>Eşik (ziyaret)</FieldLabel>
                      <select value={settings.loyaltyThreshold ?? 10} onChange={e=>updateSettings({...settings, loyaltyThreshold:parseInt(e.target.value)})}
                        style={{ width:'100%', background:T.surface, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none', colorScheme:dark?'dark':'light' }}>
                        {[5,6,8,10,12,15,20].map(n=><option key={n} value={n}>{n} ziyaret</option>)}
                      </select>
                    </div>
                    <div style={{ flex:1 }}>
                      <FieldLabel>Ödül</FieldLabel>
                      <input value={loyaltyReward} onChange={e=>setLoyaltyReward(e.target.value)}
                        onBlur={()=>updateSettings({...settings, loyaltyReward:loyaltyReward.trim()||'Ücretsiz hizmet'})}
                        placeholder="Örn. Ücretsiz tıraş"
                        style={{ width:'100%', background:T.surface, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none' }}/>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Sıradaki Randevu Otomasyonu ── */}
              <div style={{ marginBottom:'22px', padding:'16px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ fontSize:'13.5px', fontWeight:700, color:T.ink, display:'flex', alignItems:'center', gap:7 }}>
                      <RefreshCw size={15} color={T.orange}/> Sıradaki Randevu Otomasyonu
                    </div>
                    <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'3px' }}>Randevu "Tamamlandı" olunca müşteriye WhatsApp ile tekrar-randevu daveti gönderilir.</div>
                  </div>
                  <button onClick={()=>updateSettings({...settings, rebookEnabled: !(settings.rebookEnabled)})}
                    style={{ width:46, height:28, borderRadius:999, background:settings.rebookEnabled?T.orange:T.surface3, position:'relative', border:'none', cursor:'pointer', flexShrink:0, transition:'background .18s' }}>
                    <span style={{ position:'absolute', top:3, left:settings.rebookEnabled?21:3, width:22, height:22, borderRadius:'50%', background:'#fff', transition:'left .18s' }}/>
                  </button>
                </div>
                {settings.rebookEnabled && (
                  <div style={{ marginTop:14 }}>
                    <FieldLabel>Teşvik metni (opsiyonel)</FieldLabel>
                    <input value={rebookNote} onChange={e=>setRebookNote(e.target.value)}
                      onBlur={()=>updateSettings({...settings, rebookNote:rebookNote.trim()})}
                      placeholder="Örn. Bu hafta %10 erken rezervasyon indirimi"
                      style={{ width:'100%', background:T.surface, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none' }}/>
                    <div style={{ fontSize:'11px', color:T.muted, marginTop:'6px' }}>Mesaja "🎁 ..." satırı olarak eklenir. WhatsApp bağlı ve booking adresi (slug) tanımlı olmalı.</div>
                  </div>
                )}
              </div>

              <div style={{ display:'flex', alignItems:'flex-start', gap:'12px', padding:'14px 16px', background:'rgba(255,90,31,0.05)', border:'1px solid rgba(255,90,31,0.15)', borderRadius:T.rSm }}>
                <Bell size={16} color={T.orange} style={{ flexShrink:0, marginTop:1 }}/>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:T.ink }}>Bildirim Ayarları</div>
                  <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'3px' }}>Bildirim entegrasyonları webhook ayarlarından yapılandırılabilir.</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Modüller ── */}
          {activeTab==='modules' && (
            <div>
              <SectionTitle>Modüller</SectionTitle>
              <p style={{ fontSize:'12.5px', color:T.muted, marginBottom:'18px', lineHeight:1.5 }}>
                İşletmenize uygun modülleri açın/kapatın. Kapalı modüller menüde görünmez. Müşteriler, Dashboard ve Ayarlar her zaman açıktır.
              </p>

              {/* Sektör varsayılanlarını uygula */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'13px 16px', background:'rgba(255,90,31,0.05)', border:'1px solid rgba(255,90,31,0.15)', borderRadius:T.rSm, marginBottom:'18px' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:T.ink }}>Sektör varsayılanları</div>
                  <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'3px' }}>
                    {profileForSector(sector).label} için önerilen set: {MODULE_META.filter(m => modulesForSector(sector)[m.key]).map(m => m.label).join(', ')}.
                  </div>
                </div>
                <button onClick={async()=>{ await applySectorDefaults(sector); toast.success('Modüller sektöre göre ayarlandı'); }}
                  style={{ flexShrink:0, padding:'8px 14px', borderRadius:T.rSm, border:'none', background:T.orange, color:'#fff', fontSize:'12.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  Uygula
                </button>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {MODULE_META.map(m => {
                  const on = isEnabled(m.key);
                  // Restoran adisyonu kasadan tahsil edilir: masa açıkken kasa
                  // kapatılamaz, yoksa garsonun "Kasaya gönder" dediği hesap
                  // hiçbir ekranda açılamaz. Ters yön otomatik düzeltilir.
                  const lockedOn = m.key === 'kasa' && isEnabled('masa');
                  const toggle = () => {
                    if (lockedOn) return;
                    if (m.key === 'masa' && !on && !isEnabled('kasa')) void setModule('kasa', true);
                    void setModule(m.key, !on);
                  };
                  return (
                    <div key={m.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'14px', padding:'14px 16px', background:T.surface2, border:`1px solid ${on?'rgba(255,90,31,0.25)':T.border2}`, borderRadius:T.rSm, transition:'border-color .15s' }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:'13.5px', fontWeight:700, color:T.ink }}>{m.label}</div>
                        <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'3px' }}>
                          {lockedOn ? 'Masa modülü açıkken kapatılamaz — adisyon tahsilatı kasadan yapılır.' : m.desc}
                        </div>
                      </div>
                      <button onClick={toggle} disabled={lockedOn}
                        title={lockedOn ? 'Masa açıkken kasa kapatılamaz' : on?'Kapat':'Aç'}
                        style={{ flexShrink:0, position:'relative', width:'46px', height:'26px', borderRadius:'999px', border:'none', cursor:lockedOn?'not-allowed':'pointer', opacity:lockedOn?0.55:1, background:on?T.orange:(dark?'#3A332A':'#D6CFC4'), transition:'background .2s' }}>
                        <span style={{ position:'absolute', top:'3px', left:on?'23px':'3px', width:'20px', height:'20px', borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }}/>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize:'11px', color:T.muted, marginTop:'16px' }}>
                Aktif: {MODULE_META.filter(m=>modules[m.key]).map(m=>m.label).join(', ') || 'yok'}
              </div>

              {/* ── Kaynaklar (051) — sektör profili kaynak tanımlıyorsa ── */}
              {resourceTypes.length > 0 && (
                <div style={{ marginTop:'28px' }}>
                  <SectionTitle>Koltuk ve çalışma alanları</SectionTitle>
                  <p style={{ fontSize:'12.5px', color:T.muted, marginBottom:'14px', lineHeight:1.5 }}>
                    Randevular personelin yanı sıra fiziksel kaynağa da bağlanabilir (ör. {resourceTypes.join(', ').toLowerCase()}). Kapasite &gt; 1 ise aynı saate o kadar kişi alınır.
                  </p>
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'12px' }}>
                    {resources.map(r => (
                      <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 14px', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm }}>
                        <div style={{ flex:1, fontSize:'13px', fontWeight:700, color:T.ink }}>{r.name}</div>
                        <select value={r.type} onChange={e=>void updateResource(r.id,{type:e.target.value})}
                          aria-label={`${r.name} kaynak türü`}
                          style={{ background:T.surface, border:`1px solid ${T.border2}`, borderRadius:T.rXs, padding:'6px 8px', fontFamily:'inherit', fontSize:'11.5px', color:T.ink }}>
                          {(resourceTypes.includes(r.type)?resourceTypes:[r.type,...resourceTypes]).map(type=><option key={type} value={type}>{type}</option>)}
                        </select>
                        <div style={{ fontSize:'11.5px', color:T.muted }}>{r.capacity} kişi</div>
                        <button onClick={()=>removeResource(r.id)} title="Sil" style={{ border:'none', background:'none', color:T.muted, cursor:'pointer', display:'grid', placeItems:'center' }}>
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    ))}
                    {resources.length===0 && <div style={{ fontSize:'12px', color:T.muted }}>Henüz kaynak yok.</div>}
                  </div>
                  <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                    <select value={effectiveResourceType} onChange={e=>setNewResourceType(e.target.value)} aria-label="Kaynak türü"
                      style={{ minWidth:120, background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'9px 12px', fontFamily:'inherit', fontSize:'13px', color:T.ink, outline:'none' }}>
                      {resourceTypes.map(type=><option key={type} value={type}>{type}</option>)}
                    </select>
                    <input value={newResourceName} onChange={e=>setNewResourceName(e.target.value)} placeholder={`${effectiveResourceType} adı (ör. ${effectiveResourceType} 1)`}
                      style={{ flex:1, background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'9px 12px', fontFamily:'inherit', fontSize:'13px', color:T.ink, outline:'none' }}/>
                    <input type="number" min={1} value={newResourceCap} onChange={e=>setNewResourceCap(Math.max(1, parseInt(e.target.value)||1))} title="Kapasite"
                      style={{ width:70, background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'9px 12px', fontFamily:'inherit', fontSize:'13px', color:T.ink, outline:'none' }}/>
                    <button onClick={async()=>{ if(!newResourceName.trim()||!effectiveResourceType)return; const ok=await addResource({ type:effectiveResourceType, name:newResourceName.trim(), capacity:newResourceCap }); if(ok){ setNewResourceName(''); setNewResourceCap(1); toast.success(`${effectiveResourceType} eklendi`); } }}
                      style={{ padding:'9px 14px', borderRadius:T.rSm, border:'none', background:T.orange, color:'#fff', fontSize:'12.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                      Ekle
                    </button>
                  </div>
                </div>
              )}

              {/* ── Ürün kataloğu artık Stoklar sayfasında ──
                   Aynı tabloya iki ayrı yerden girmek "hangisi doğru" sorusunu
                   üretiyordu. Stoklar sayfası ürünün adı/fiyatı yanında birim,
                   maliyet, eşik ve stok hareketlerini de tuttuğu için katalog
                   tek yerde: orada. Burada yalnız yol tarifi kalır. ── */}
              {isEnabled('kasa') && !isEnabled('masa') && (
                <div style={{ marginTop:'28px' }}>
                  <SectionTitle>Satılan ürünler</SectionTitle>
                  <div style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap', padding:'14px 16px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm }}>
                    <Boxes size={18} style={{ color:T.orange, flexShrink:0 }}/>
                    <p style={{ flex:1, minWidth:220, margin:0, fontSize:'12.5px', color:T.muted, lineHeight:1.55 }}>
                      Ürün kataloğu <strong style={{ color:T.ink }}>Stoklar</strong> sayfasına taşındı. Ad ve fiyatın
                      yanında birim, maliyet, kritik eşik ve stok hareketleri de orada tutuluyor —
                      {products.length > 0 ? ` kayıtlı ${products.length} ürün korundu.` : ' ilk ürününüzü oradan ekleyin.'}
                    </p>
                    <button onClick={()=>navigate('/stock')}
                      style={{ padding:'9px 14px', borderRadius:T.rSm, border:'none', background:inkbox, color:inkboxFg, fontSize:'12.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                      Stoklar'a git
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Çalışma Saatleri ── */}
          {activeTab==='hours' && (
            <div>
              <SectionTitle>Çalışma Saatleri</SectionTitle>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {workingHours.map(h=>(
                  <div key={h.day} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'12px 16px', background:h.isOff?T.surface2:T.surface, border:`1px solid ${T.border}`, borderRadius:T.rSm, opacity:h.isOff?0.6:1, transition:'all .15s' }}>
                    <span style={{ width:80, fontSize:'13px', fontWeight:650, color:T.ink, flexShrink:0 }}>{h.dayName}</span>
                    <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', flexShrink:0 }}>
                      <input type="checkbox" checked={!h.isOff} onChange={e=>updateHour(h.day,'isOff',!e.target.checked)} style={{ width:14, height:14, accentColor:T.orange }}/>
                      <span style={{ fontSize:'11.5px', color:T.muted }}>{h.isOff?'Kapalı':'Açık'}</span>
                    </label>
                    {!h.isOff && <>
                      <input type="time" value={h.start} onChange={e=>updateHour(h.day,'start',e.target.value)} style={{ padding:'6px 10px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'12px', fontFamily:'inherit', color:T.ink, background:T.surface2, outline:'none', colorScheme:dark?'dark':'light' }}/>
                      <span style={{ color:T.muted2, fontSize:'12px' }}>—</span>
                      <input type="time" value={h.end} onChange={e=>updateHour(h.day,'end',e.target.value)} style={{ padding:'6px 10px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'12px', fontFamily:'inherit', color:T.ink, background:T.surface2, outline:'none', colorScheme:dark?'dark':'light' }}/>
                    </>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Hizmetler ── */}
          {activeTab==='services' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
                <SectionTitle>Hizmetler</SectionTitle>
                <button onClick={addService} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 12px', background:inkbox, color:inkboxFg, border:'none', borderRadius:T.rSm, fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  <Plus size={11}/> Ekle
                </button>
              </div>
              {/* Sütun başlıkları — alanların ne olduğu satıra bakınca anlaşılsın.
                  Önceden yalnız "dk" ve "gün dönüş" etiketleri vardı, ücret alanı
                  hiç yoktu; Kasa fiyatı buradan okuduğu için hepsi ₺0 kalıyordu. */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'0 14px 6px', fontSize:'9.5px', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:T.muted2 }}>
                <span style={{ width:32 }}>Renk</span>
                <span style={{ flex:1 }}>Hizmet adı</span>
                <span style={{ width:112 }}>Ücret</span>
                <span style={{ width:97 }}>Süre</span>
                <span style={{ width:117 }}>Dönüş</span>
                <span style={{ width:30 }}/>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {services.map(s=>(
                  <div key={s.id}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm }}>
                    <input type="color" value={s.color} onChange={e=>updateService(s.id,'color',e.target.value)} style={{ width:32, height:32, borderRadius:'8px', border:'none', cursor:'pointer', padding:0, background:'none' }}/>
                    <input type="text" value={s.name} placeholder="Hizmet adı" onChange={e=>updateService(s.id,'name',e.target.value)}
                      style={{ flex:1, padding:'8px 12px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'13px', fontFamily:'inherit', color:T.ink, background:T.surface, outline:'none' }}
                      onFocus={e=>{e.target.style.borderColor=T.orange}} onBlur={e=>{e.target.style.borderColor=T.border2}}/>
                    {/* Ücret — Kasa'da hizmet seçilince otomatik gelen tutar */}
                    <div style={{ display:'flex', alignItems:'center', gap:'5px', width:112 }} title="Hizmetin varsayılan ücreti. Kasa'da bu hizmet seçilince tutar buradan gelir; boş bırakılırsa ₺0 görünür.">
                      <span style={{ fontSize:'12.5px', color:T.muted, fontWeight:700 }}>₺</span>
                      <input type="number" value={s.price ?? ''} min={0} step={50} placeholder="0"
                        onChange={e=>updateService(s.id,'price',e.target.value?Math.max(0,parseFloat(e.target.value)):0)}
                        style={{ width:92, padding:'8px 10px', border:`1px solid ${(s.price ?? 0) > 0 ? T.border2 : 'rgba(255,90,31,0.35)'}`, borderRadius:T.rXs, fontSize:'13px', color:T.ink, background:T.surface, outline:'none', fontFamily:"'JetBrains Mono',monospace" }}
                        onFocus={e=>{e.target.style.borderColor=T.orange}}
                        onBlur={e=>{e.target.style.borderColor=(s.price ?? 0) > 0 ? T.border2 : 'rgba(255,90,31,0.35)'}}/>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'5px', width:97 }}>
                      <input type="number" value={s.duration} min={5} step={5} onChange={e=>updateService(s.id,'duration',parseInt(e.target.value))}
                        style={{ width:70, padding:'8px 10px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'13px', color:T.ink, background:T.surface, outline:'none', fontFamily:"'JetBrains Mono',monospace" }}/>
                      <span style={{ fontSize:'11px', color:T.muted }}>dk</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'5px', width:117 }} title="Dönüş periyodu — seans tamamlanınca bu kadar gün sonrasına hatırlatma kurulur (boş = kapalı)">
                      <input type="number" value={s.recallDays ?? ''} min={1} placeholder="—" onChange={e=>updateService(s.id,'recallDays',e.target.value?parseInt(e.target.value):0)}
                        style={{ width:56, padding:'8px 10px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'13px', color:T.ink, background:T.surface, outline:'none', fontFamily:"'JetBrains Mono',monospace" }}/>
                      <span style={{ fontSize:'11px', color:T.muted }}>gün sonra</span>
                    </div>
                    {/* Reçete — bu hizmette tüketilen sarf malzemesi */}
                    <button onClick={()=>setRecipeOpen(prev=>prev===s.id?null:s.id)}
                      title="Bu hizmette tüketilen sarf malzemesi (boya, oksidan…). Girilirse işlem kasaya gönderilince stoktan otomatik düşer."
                      style={{ height:30, padding:'0 10px', borderRadius:T.rXs, display:'flex', alignItems:'center', gap:'5px', border:`1px solid ${(s.recipe?.length ?? 0) > 0 ? 'rgba(255,90,31,0.35)' : T.border}`, background:'none', cursor:'pointer', color:(s.recipe?.length ?? 0) > 0 ? T.orange : T.muted, fontSize:'11px', fontWeight:700, fontFamily:'inherit', whiteSpace:'nowrap' }}>
                      <Boxes size={12}/> {(s.recipe?.length ?? 0) > 0 ? `${s.recipe?.length} sarf` : 'Reçete'}
                    </button>
                    <button onClick={()=>removeService(s.id)} style={{ width:30, height:30, borderRadius:T.rXs, display:'grid', placeItems:'center', border:`1px solid ${T.border}`, background:'none', cursor:'pointer', color:T.muted, transition:'all .15s' }}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(201,64,64,0.08)';(e.currentTarget as HTMLElement).style.color= dark?'#e07070':'#C94040';(e.currentTarget as HTMLElement).style.borderColor='rgba(201,64,64,0.3)'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none';(e.currentTarget as HTMLElement).style.color=T.muted;(e.currentTarget as HTMLElement).style.borderColor=T.border}}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                  {/* Uygunluk etiketleri — sektörün kontrendikasyon kuralları
                      hangi etiketleri kapatıyorsa seçenekler onlardır (tek kaynak:
                      sectorProfiles.riskFlags). Kuralı olmayan sektörde hiç çıkmaz.
                      Etiketsiz hizmette kural yalnız ad eşleşmesine düşer. */}
                  {eligibilityTags.length > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:'7px', flexWrap:'wrap', margin:'6px 0 0', padding:'0 14px' }}>
                      <span style={{ fontSize:'10.5px', fontWeight:700, color:T.muted2, letterSpacing:'.06em' }}
                        title="Bu etiketler, müşterinin sağlık/risk bilgisiyle çakışan işlemlerin seçilmesini engeller.">
                        Uygunluk:
                      </span>
                      {eligibilityTags.map(tag=>{
                        const on = (s.tags||[]).includes(tag);
                        return (
                          <button key={tag} onClick={()=>updateService(s.id,'tags',
                            on ? (s.tags||[]).filter(t=>t!==tag) : [...(s.tags||[]), tag])}
                            aria-pressed={on}
                            style={{ height:26, padding:'0 10px', borderRadius:999, cursor:'pointer', fontFamily:'inherit',
                              fontSize:'11px', fontWeight:700, transition:'all .15s',
                              border:`1px solid ${on ? T.orange : T.border}`,
                              background:on ? 'rgba(255,90,31,0.10)' : 'none',
                              color:on ? T.orange : T.muted }}>
                            {tag}
                          </button>
                        );
                      })}
                      {(s.tags||[]).length===0 && (
                        <span style={{ fontSize:'10.5px', color:T.muted2 }}>etiketsiz — kural yalnız hizmet adına bakar</span>
                      )}
                    </div>
                  )}
                  {recipeOpen===s.id && (
                    <div style={{ margin:'6px 0 0', padding:'12px 14px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.rSm, display:'grid', gap:'8px' }}>
                      <div style={{ fontSize:'9.5px', fontWeight:800, letterSpacing:'.16em', textTransform:'uppercase', color:T.muted2 }}>
                        Bu hizmette tüketilen sarf
                      </div>
                      {stockProducts.length===0 && (
                        <div style={{ fontSize:'11.5px', color:T.muted, lineHeight:1.55 }}>
                          Önce Stoklar sayfasından ürün ekleyin — reçete oradaki ürünlerden kurulur.
                        </div>
                      )}
                      {(s.recipe||[]).map((line,i)=>(
                        <div key={`${s.id}-${i}`} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <select value={line.productId}
                            onChange={e=>setRecipe(s.id,(s.recipe||[]).map((l,j)=>j===i?{...l,productId:e.target.value}:l))}
                            style={{ flex:1, minWidth:0, padding:'8px 10px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'12.5px', fontFamily:'inherit', color:T.ink, background:T.surface2, outline:'none' }}>
                            {stockProducts.map(p=>(<option key={p.id} value={p.id}>{p.name}</option>))}
                          </select>
                          <input type="number" min={0} step="any" value={line.quantity || ''} placeholder="0"
                            onChange={e=>setRecipe(s.id,(s.recipe||[]).map((l,j)=>j===i?{...l,quantity:Math.max(0,parseFloat(e.target.value)||0)}:l))}
                            style={{ width:88, padding:'8px 10px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'13px', color:T.ink, background:T.surface2, outline:'none', textAlign:'right', fontFamily:"'JetBrains Mono',monospace" }}/>
                          <span style={{ width:34, fontSize:'11px', color:T.muted }}>
                            {products.find(p=>p.id===line.productId)?.unit || 'adet'}
                          </span>
                          <button onClick={()=>setRecipe(s.id,(s.recipe||[]).filter((_,j)=>j!==i))}
                            style={{ width:30, height:30, borderRadius:T.rXs, display:'grid', placeItems:'center', border:`1px solid ${T.border}`, background:'none', cursor:'pointer', color:T.muted }}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      ))}
                      {stockProducts.length>0 && (s.recipe||[]).length < stockProducts.length && (
                        <button onClick={()=>addRecipeLine(s)}
                          style={{ justifySelf:'start', display:'flex', alignItems:'center', gap:'5px', padding:'6px 12px', background:'none', color:T.ink, border:`1px dashed ${T.border2}`, borderRadius:T.rSm, fontSize:'11.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                          <Plus size={11}/> Malzeme ekle
                        </button>
                      )}
                      <div style={{ fontSize:'11px', color:T.muted2, lineHeight:1.55 }}>
                        İşlem kasaya gönderilince bu miktarlar stoktan otomatik düşer. Renk sayacında
                        personel miktarı o müşteriye göre düzeltebilir; reçete yalnız başlangıç değeridir.
                      </div>
                    </div>
                  )}
                  </div>
                ))}
              </div>

              {/* Ücreti girilmemiş hizmetler Kasa'da ₺0 görünür — sessizce yanlış
                  tutar tahsil edilmesin diye burada uyarılıyor. */}
              {services.some(s => s.name.trim() && !(s.price ?? 0)) && (
                <div style={{ display:'flex', alignItems:'flex-start', gap:'9px', marginTop:'12px', padding:'11px 13px', borderRadius:T.rSm, background: dark?'rgba(255,90,31,0.07)':'rgba(255,90,31,0.05)', border:'1px solid rgba(255,90,31,0.22)' }}>
                  <span style={{ fontSize:'13px', lineHeight:1.2 }}>⚠️</span>
                  <div style={{ fontSize:'11.5px', color:T.muted, lineHeight:1.55 }}>
                    <strong style={{ color:T.ink }}>
                      {services.filter(s => s.name.trim() && !(s.price ?? 0)).length} hizmetin ücreti girilmemiş.
                    </strong>{' '}
                    Kasa'da bu hizmetler <strong style={{ color:T.ink }}>₺0</strong> olarak açılır ve hızlı hizmet
                    listesinde görünmez; tutarı her seferinde elle yazmanız gerekir.
                  </div>
                </div>
              )}
              <div style={{ fontSize:'11px', color:T.muted2, marginTop:'10px', lineHeight:1.55 }}>
                <strong style={{ color:T.muted }}>Ücret</strong> — Kasa'da hizmet seçilince gelen varsayılan tutar; adisyonda elle değiştirilebilir.
                {' · '}
                <strong style={{ color:T.muted }}>Süre</strong> — takvimde kapladığı zaman.
                {' · '}
                <strong style={{ color:T.muted }}>Dönüş</strong> — seans bitince kaç gün sonrasına hatırlatma kurulacağı (boş = kapalı).
              </div>
            </div>
          )}

          {/* ── Booking Sayfam ── */}
          {activeTab==='booking' && (
            <div>
              <SectionTitle>Online Randevu Sayfası</SectionTitle>
              <div style={{ fontSize:'12.5px', color:T.muted, marginBottom:'18px', lineHeight:1.6 }}>
                Müşterileriniz bu linkten kendi randevularını oluşturur. Linki Instagram bio'nuza, Google İşletme profilinize veya web sitenize ekleyin.
              </div>

              {/* Slug + link */}
              <div style={{ marginBottom:'16px' }}>
                <FieldLabel>Randevu Adresi</FieldLabel>
                <div style={{ display:'flex', alignItems:'stretch', border:`1px solid ${T.border2}`, borderRadius:T.rSm, overflow:'hidden', background:T.surface2 }}>
                  <span style={{ display:'flex', alignItems:'center', padding:'0 10px', fontSize:'12px', color:T.muted, background:T.surface3, whiteSpace:'nowrap' }}>/book/</span>
                  <input value={profile.slug} placeholder="isletme-adi"
                    onChange={e=>setProfile({...profile, slug:e.target.value})}
                    onBlur={e=>setProfile({...profile, slug:slugify(e.target.value)})}
                    style={{ flex:1, border:'none', background:'transparent', padding:'10px 12px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none' }}/>
                </div>
                {bookingUrl && (
                  <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
                    <button onClick={()=>{navigator.clipboard.writeText(bookingUrl); toast.success('Link kopyalandı');}}
                      style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'12px', fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:'inherit' }}>
                      <Copy size={12}/> Linki Kopyala
                    </button>
                    <a href={bookingUrl} target="_blank" rel="noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', background:inkbox, border:'none', borderRadius:T.rXs, fontSize:'12px', fontWeight:600, color:inkboxFg, cursor:'pointer', textDecoration:'none' }}>
                      <ExternalLink size={12}/> Önizle
                    </a>
                  </div>
                )}
              </div>

              {/* Siteye göm (widget) */}
              {bookingUrl && (
                <div style={{ marginBottom:'22px' }}>
                  <FieldLabel>Web Sitene Göm (Widget)</FieldLabel>
                  <div style={{ fontSize:'11.5px', color:T.muted, marginBottom:'8px', lineHeight:1.6 }}>
                    Aşağıdaki kodu web sitenin HTML'ine yapıştır; randevu ekranı sitenin içinde açılır ve yüksekliği içeriğe göre kendini ayarlar.
                  </div>
                  <pre style={{ margin:0, padding:'12px 14px', background:inkbox, color:inkboxFg, borderRadius:T.rSm, fontSize:'10.5px', lineHeight:1.55, overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {buildEmbedCode(bookingUrl)}
                  </pre>
                  <button onClick={()=>{navigator.clipboard.writeText(buildEmbedCode(bookingUrl)); toast.success('Widget kodu kopyalandı');}}
                    style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'8px', padding:'7px 12px', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'12px', fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:'inherit' }}>
                    <Copy size={12}/> Widget Kodunu Kopyala
                  </button>
                </div>
              )}

              {/* Otomatik onay */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'13px 16px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm, marginBottom:'22px' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:T.ink }}>Otomatik Onay</div>
                  <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'2px' }}>{profile.bookingAutoConfirm ? 'Randevular anında onaylanır' : 'Randevular önce onayınızı bekler'}</div>
                </div>
                <button onClick={()=>setProfile({...profile, bookingAutoConfirm:!profile.bookingAutoConfirm})}
                  style={{ width:42, height:24, borderRadius:'999px', background:profile.bookingAutoConfirm?T.orange:T.surface3, border:'none', cursor:'pointer', position:'relative', flexShrink:0, transition:'background .2s' }}>
                  <span style={{ position:'absolute', top:2, left:profile.bookingAutoConfirm?20:2, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                </button>
              </div>

              {/* Görseller */}
              <SectionTitle>Görseller</SectionTitle>
              <div style={{ display:'flex', gap:'12px', marginBottom:'8px', flexWrap:'wrap' }}>
                {/* Logo */}
                <div>
                  <div style={{ fontSize:'11px', color:T.muted, marginBottom:'6px' }}>Logo</div>
                  <ImageUpload label="Logo" url={profile.logoUrl} busy={uploading==='logo'} square
                    onPick={f=>handleUpload(f,'logo')} onClear={()=>setProfile({...profile, logoUrl:''})} T={T} inkbox={inkbox} inkboxFg={inkboxFg}/>
                </div>
                {/* Cover */}
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontSize:'11px', color:T.muted, marginBottom:'6px' }}>Kapak Fotoğrafı</div>
                  <ImageUpload label="Kapak" url={profile.coverUrl} busy={uploading==='cover'}
                    onPick={f=>handleUpload(f,'cover')} onClear={()=>setProfile({...profile, coverUrl:''})} T={T} inkbox={inkbox} inkboxFg={inkboxFg}/>
                </div>
              </div>

              {/* Galeri */}
              <div style={{ fontSize:'11px', color:T.muted, margin:'10px 0 6px' }}>Galeri</div>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'22px' }}>
                {profile.galleryUrls.map((u,i)=>(
                  <div key={i} style={{ position:'relative', width:84, height:64, borderRadius:T.rXs, background:`center/cover url(${u})`, border:`1px solid ${T.border}` }}>
                    <button onClick={()=>setProfile({...profile, galleryUrls:profile.galleryUrls.filter((_,j)=>j!==i)})}
                      style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:inkbox, color:inkboxFg, border:'none', cursor:'pointer', display:'grid', placeItems:'center' }}>
                      <X size={11}/>
                    </button>
                  </div>
                ))}
                <label style={{ width:84, height:64, borderRadius:T.rXs, border:`1.5px dashed ${T.border2}`, display:'grid', placeItems:'center', cursor:'pointer', color:T.muted, background:T.surface2 }}>
                  {uploading==='gallery' ? <Loader2 size={16} className="animate-spin"/> : <ImagePlus size={16}/>}
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{handleUpload(e.target.files?.[0],'gallery'); e.currentTarget.value='';}}/>
                </label>
              </div>

              {/* Profil alanları */}
              <SectionTitle>İşletme Bilgileri</SectionTitle>
              <div style={{ marginBottom:'12px' }}>
                <FieldLabel>Hakkında</FieldLabel>
                <textarea value={profile.bio} onChange={e=>setProfile({...profile, bio:e.target.value})} placeholder="İşletmenizi kısaca tanıtın…" rows={3}
                  style={{ width:'100%', boxSizing:'border-box', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none', resize:'vertical' }}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
                <div><FieldLabel>Adres</FieldLabel><Input value={profile.address} onChange={v=>setProfile({...profile, address:v})} placeholder="Mahalle, ilçe/il"/></div>
                <div><FieldLabel>Telefon</FieldLabel><Input value={profile.publicPhone} onChange={v=>setProfile({...profile, publicPhone:v})} placeholder="0212 xxx xx xx"/></div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div><FieldLabel>Instagram</FieldLabel><Input value={profile.instagramUrl} onChange={v=>setProfile({...profile, instagramUrl:v})} placeholder="https://instagram.com/…"/></div>
                <div><FieldLabel>Harita Linki</FieldLabel><Input value={profile.mapsUrl} onChange={v=>setProfile({...profile, mapsUrl:v})} placeholder="Google Maps linki"/></div>
                {/* KVKK aydınlatma metni işletmenin kendi hukuki beyanıdır (veri
                    sorumlusu işletme, Luera veri işleyen) — ürün metni yazamaz,
                    yayınlanmış metne bağlantı verir. Boşsa randevu sayfasında
                    rıza kutusu yine zorunludur, yalnız bağlantı çıkmaz. */}
                <div><FieldLabel>KVKK Aydınlatma Metni Linki</FieldLabel><Input value={profile.kvkkUrl} onChange={v=>setProfile({...profile, kvkkUrl:v})} placeholder="https://…/kvkk"/>
                  <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'3px' }}>Randevu sayfasındaki onay kutusunun yanında görünür. Metni siz yayınlarsınız — veri sorumlusu işletmenizdir.</div></div>
              </div>
              {/* Değerlendirme linki harita linkinden AYRI: bu, yorum formunu
                  doğrudan açan URL. Boşsa değerlendirme daveti hiç gönderilmez. */}
              <div>
                <FieldLabel>Google Değerlendirme Linki</FieldLabel>
                <Input value={profile.googleReviewUrl} onChange={v=>setProfile({...profile, googleReviewUrl:v})} placeholder="https://g.page/r/…/review"/>
                <div style={{ fontSize:'11px', color:T.muted, marginTop:'5px', lineHeight:1.5 }}>
                  Google işletme profilinizde <b>Yorum iste</b> → bağlantıyı kopyala ile alınır.
                  Girilmezse tahsilat sonrası değerlendirme daveti gönderilmez.
                </div>
              </div>
            </div>
          )}

          {/* ── WhatsApp ── */}
          {activeTab==='whatsapp' && <WhatsAppTab/>}

          {activeTab==='billing' && <BillingTab/>}

          {/* ── Veri (dışa/içe aktarma) ── */}
          {activeTab==='data' && <DataTab/>}

          {/* ── Entegrasyonlar ── */}
          {activeTab==='integrations' && (
            <div>
              <SectionTitle>Entegrasyonlar</SectionTitle>
              <div style={{ fontSize:'12.5px', color:T.muted, marginBottom:'18px', lineHeight:1.6 }}>
                Her entegrasyon için iki adım: <strong style={{ color:T.ink }}>TimeFlow API Key</strong>'ini diğer modüle gir, diğer modülün key'ini buraya yapıştır.
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                <IntegrationCard module="leadflow" label="LeadFlow" description="Lead bilgileri otomatik randevuya dönüşür" Icon={Zap}/>
                <IntegrationCard module="callflow" label="CallFlow" description="Çağrı sonrası randevu oluşturulur" Icon={Phone}/>
              </div>
            </div>
          )}

          {/* ── Webhook ── */}
          {activeTab==='webhooks' && (
            <div>
              <SectionTitle>Webhook Entegrasyonu</SectionTitle>
              <div style={{ padding:'12px 14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm, marginBottom:'16px', fontSize:'12px', color:T.muted, lineHeight:1.65 }}>
                Yeni randevu oluşturulduğunda, güncellendiğinde veya iptal edildiğinde webhook URL'nize otomatik bildirim gönderilir. Bu URL'yi n8n veya diğer otomasyon araçlarıyla kullanabilirsiniz.
              </div>
              <div style={{ marginBottom:'18px' }}>
                <FieldLabel>Webhook URL</FieldLabel>
                <Input value={webhookUrl} onChange={setWebhookUrl} type="url" placeholder="https://your-n8n-instance.com/webhook/..."/>
              </div>
              <div style={{ padding:'14px 16px', background:'rgba(255,90,31,0.04)', border:'1px solid rgba(255,90,31,0.14)', borderRadius:T.rSm }}>
                <div style={{ fontSize:'12px', fontWeight:750, color:T.ink, marginBottom:'10px' }}>Gönderilen Veri Formatı</div>
                <pre style={{ fontSize:'11px', fontFamily:"'JetBrains Mono',monospace", background: dark?'#0C0A08':'#0E0E0E', color:'rgba(243,237,227,0.75)', padding:'12px 14px', borderRadius:T.rXs, overflowX:'auto', lineHeight:1.7 }}>
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
