import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { SplashScreen } from '@/components/SplashScreen';
import { useIsMobile } from '@/hooks/useIsMobile';

// ── Design tokens (dark theme) ────────────────────────────────────────────────
const T = {
  ink:            '#0E0E0E',
  cream:          '#F3ECE0',
  orange:         '#FF5A1F',
  muted:          'rgba(243,236,224,0.55)',
  hairline:       'rgba(243,236,224,0.10)',
  hairlineStrong: 'rgba(243,236,224,0.20)',
  panel:          '#0a0a0a',
  success:        '#7ad3a0',
};

// ── Luera wordmark ─────────────────────────────────────────────────────────────
function LueraMark({ size = 32 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 0.82, color: T.cream, fontFamily: 'Hanken Grotesk, sans-serif' }}>
      luera
      <span style={{ width: '0.22em', height: '0.22em', borderRadius: '50%', background: T.orange, marginLeft: '0.02em', marginBottom: '0.02em', display: 'inline-block', flexShrink: 0 }}/>
    </span>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
function IconMail() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 5H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/>
      <path d="m3.5 6.5 6.5 4.5 6.5-4.5"/>
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 7a4 4 0 1 0-8 0v3H4v7h12v-7h-2V7z"/>
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="6.5" r="3.5"/>
      <path d="M3.5 18c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/>
    </svg>
  );
}
function IconEye({ off }: { off: boolean }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l14 14M8.5 8.6A3 3 0 0 0 13.4 13M6.3 6.4C4.3 7.7 3 10 3 10s2.7 5 7 5c1.4 0 2.7-.4 3.7-1M10 5c4.3 0 7 5 7 5a12.8 12.8 0 0 1-1.4 2"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10s2.7-5 7-5 7 5 7 5-2.7 5-7 5-7-5-7-5z"/>
      <circle cx="10" cy="10" r="2.5"/>
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h12M12 6l4 4-4 4"/>
    </svg>
  );
}

// ── Field component ────────────────────────────────────────────────────────────
function Field({ label, linkText, onLinkClick, icon, type, value, onChange, placeholder, right }: {
  label: string; linkText?: string; onLinkClick?: () => void;
  icon?: React.ReactNode; type?: string;
  value: string; onChange: (v: string) => void;
  placeholder?: string; right?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.16em', color: T.muted, textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}>
          {label}
        </label>
        {linkText && (
          <button type="button" onClick={onLinkClick}
            style={{ fontSize: 11, color: T.cream, background: 'none', border: 'none', opacity: 0.65, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em' }}>
            {linkText}
          </button>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && (
          <span style={{ position: 'absolute', left: 13, color: T.muted, display: 'flex', pointerEvents: 'none', zIndex: 1 }}>{icon}</span>
        )}
        <input
          type={type || 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'name'}
          style={{
            width: '100%', height: 48,
            padding: icon ? '0 44px 0 44px' : '0 16px',
            background: T.panel,
            border: `1px solid ${focused ? T.orange : T.hairline}`,
            borderRadius: 10, fontSize: 14.5, color: T.cream,
            fontFamily: 'Hanken Grotesk, sans-serif', outline: 'none',
            boxShadow: focused ? '0 0 0 4px rgba(255,90,31,0.10)' : 'none',
            transition: 'all 200ms',
          }}
        />
        {right && <div style={{ position: 'absolute', right: 8 }}>{right}</div>}
      </div>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: T.hairline }}/>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.muted }}>veya</span>
      <div style={{ flex: 1, height: 1, background: T.hairline }}/>
    </div>
  );
}

// ── Left panel geometric SVG ──────────────────────────────────────────────────
function GeometricArt() {
  return (
    <div style={{ marginBottom: 44, position: 'relative', height: 240 }}>
      <svg width="420" height="240" viewBox="0 0 420 240" fill="none" style={{ overflow: 'visible' }}>
        {/* Grid lines */}
        {[0,60,120,180,240,300,360,420].map(x => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2="240" stroke={T.hairline} strokeWidth="1"/>
        ))}
        {[0,40,80,120,160,200,240].map(y => (
          <line key={`h${y}`} x1="0" y1={y} x2="420" y2={y} stroke={T.hairline} strokeWidth="1"/>
        ))}
        {/* Orange circles */}
        <circle cx="210" cy="120" r="88" stroke={T.orange} strokeWidth="1" strokeDasharray="6 6" opacity="0.35"/>
        <circle cx="210" cy="120" r="55" stroke={T.orange} strokeWidth="0.8" opacity="0.18"/>
        <circle cx="210" cy="120" r="14" fill={T.orange} opacity="0.9"/>
        <circle cx="210" cy="120" r="6"  fill={T.ink}/>
        {/* Corner marks */}
        {([[30,30],[390,30],[30,210],[390,210]] as [number,number][]).map(([x,y],i) => (
          <g key={i}>
            <line x1={x-8} y1={y} x2={x+8} y2={y} stroke={T.hairlineStrong} strokeWidth="1"/>
            <line x1={x} y1={y-8} x2={x} y2={y+8} stroke={T.hairlineStrong} strokeWidth="1"/>
          </g>
        ))}
        {/* Radial lines from center */}
        <line x1="210" y1="120" x2="30"  y2="30"  stroke={T.orange} strokeWidth="0.6" opacity="0.25"/>
        <line x1="210" y1="120" x2="390" y2="30"  stroke={T.orange} strokeWidth="0.6" opacity="0.25"/>
        <line x1="210" y1="120" x2="30"  y2="210" stroke={T.orange} strokeWidth="0.6" opacity="0.25"/>
        <line x1="210" y1="120" x2="390" y2="210" stroke={T.orange} strokeWidth="0.6" opacity="0.25"/>
        {/* Accent dots */}
        <circle cx="298" cy="65"  r="5" fill={T.orange} opacity="0.6"/>
        <circle cx="122" cy="175" r="3" fill={T.cream}  opacity="0.25"/>
      </svg>
    </div>
  );
}

// ── Main LoginPage ────────────────────────────────────────────────────────────
export const LoginPage = () => {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [isSignup, setIsSignup]     = useState(false);
  const [error, setError]           = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [shake, setShake]           = useState(false);
  const [mounted, setMounted]       = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Splash gösteriliyorsa user değişimi navigate'i tetiklememeli —
    // navigasyon SplashScreen.onDone'dan gelir
    if (user && !showSplash) navigate('/');
  }, [user, navigate, showSplash]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessMsg('');
    if (!email || !password || (isSignup && !name)) {
      triggerShake(); setError('Tüm alanları doldurun'); return;
    }
    setIsLoading(true);
    if (isSignup) {
      const result = await signup(email, password, name);
      setIsLoading(false);
      if (result.success) {
        setSuccessMsg('Hesabınız oluşturuldu! Giriş yapabilirsiniz.');
        setIsSignup(false); setName('');
      } else {
        setError(result.error || 'Kayıt başarısız'); triggerShake();
      }
    } else {
      const result = await login(email, password);
      setIsLoading(false);
      if (result.success) { setShowSplash(true); }
      else { setError(result.error || 'Giriş başarısız'); triggerShake(); }
    }
  };

  // Splash gösteriliyorsa sadece onu render et
  if (showSplash) {
    return <SplashScreen onDone={() => navigate('/')} />;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
        html, body, #root { height: 100%; margin: 0; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        .login-shake { animation: shake 0.35s ease-in-out; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .login-fadein { animation: fadeUp 0.55s cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
      <div style={{
        minHeight: '100vh', background: T.panel,
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        fontFamily: 'Hanken Grotesk, sans-serif',
        overflow: 'hidden',
      }}>
        {/* ── LEFT BRAND PANEL ── (mobilde gizli) */}
        <div style={{
          background: T.panel, position: 'relative', overflow: 'hidden',
          display: isMobile ? 'none' : 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '52px 60px',
        }}>
          {/* Ambient glow top-left */}
          <div style={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,90,31,0.13), transparent 65%)', filter: 'blur(10px)', pointerEvents: 'none' }}/>
          {/* Ambient glow bottom-right */}
          <div style={{ position: 'absolute', bottom: -160, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,90,31,0.07), transparent 65%)', filter: 'blur(20px)', pointerEvents: 'none' }}/>
          {/* Grain */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.035, mixBlendMode: 'overlay', backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`, pointerEvents: 'none' }}/>

          {/* Logo */}
          <LueraMark size={36}/>

          {/* Center content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <GeometricArt/>
            <h2 style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.04, color: T.cream, marginBottom: 18 }}>
              İşi büyüt.<br/>
              Zamanı<br/>
              <span style={{ color: T.orange }}>geri kazan.</span>
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: T.muted, maxWidth: 380 }}>
              Luera, ekibinin randevu süreçlerini otomatikleştirir — siz müşterilere odaklanın, gerisini biz halledelim.
            </p>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.muted, opacity: 0.6 }}>
            <span>© 2026 Luera</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.orange, display: 'inline-block' }}/>
            <span>TimeFlow</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.orange, display: 'inline-block' }}/>
            <span>v2</span>
          </div>
        </div>

        {/* ── RIGHT FORM PANEL ── */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Subtle center glow */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,90,31,0.05), transparent 65%)', pointerEvents: 'none' }}/>

          {/* Top-right "Kayıt ol" link */}
          {!isSignup && (
            <div style={{ position: 'absolute', top: isMobile ? 20 : 40, right: isMobile ? 20 : 60, fontSize: 13.5, color: T.cream }}>
              <span style={{ opacity: 0.55 }}>Hesabın yok mu? </span>
              <button type="button" onClick={() => { setIsSignup(true); setError(''); setSuccessMsg(''); }}
                style={{ color: T.cream, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${T.orange}`, paddingBottom: 1, fontFamily: 'inherit', fontSize: 13.5 }}>
                Kayıt ol
              </button>
            </div>
          )}

          {/* Form container */}
          <div className={`login-fadein${shake ? ' login-shake' : ''}`} style={{
            width: '100%', maxWidth: 420, padding: isMobile ? '0 24px' : '0 40px',
            display: 'flex', flexDirection: 'column', gap: 28,
            opacity: mounted ? 1 : 0, transition: 'opacity 0.4s',
          }}>
            {/* Mobil logo — sol panel gizli olduğu için */}
            {isMobile && (
              <div style={{ marginBottom: 4 }}>
                <LueraMark size={30}/>
              </div>
            )}

            {/* Heading */}
            <div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.orange, marginBottom: 12, opacity: 0.9 }}>
                {isSignup ? 'Yeni hesap' : 'Hesabına dön'}
              </div>
              <h1 style={{ fontSize: isMobile ? 34 : 42, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, color: T.cream }}>
                {isSignup ? 'Aramıza katıl.' : 'Tekrar hoş geldin.'}
              </h1>
            </div>

            {/* Error / Success banners */}
            {error && (
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(201,64,64,0.1)', border: '1px solid rgba(201,64,64,0.25)', fontSize: 13, color: '#e07070' }}>
                {error}
              </div>
            )}
            {successMsg && (
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(122,211,160,0.1)', border: '1px solid rgba(122,211,160,0.25)', fontSize: 13, color: T.success }}>
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Name field (signup only) */}
              {isSignup && (
                <Field
                  label="İsim Soyisim"
                  icon={<IconUser/>}
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder="Adınız Soyadınız"
                />
              )}

              <Field
                label="E-posta"
                icon={<IconMail/>}
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="sen@luera.ai"
              />

              <Field
                label="Şifre"
                linkText={!isSignup ? 'Unuttum?' : undefined}
                icon={<IconLock/>}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                right={
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 7, background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', transition: 'color .15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = T.cream}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = T.muted}>
                    <IconEye off={showPw}/>
                  </button>
                }
              />

              {/* CTA button */}
              <button type="submit" disabled={isLoading}
                onMouseEnter={() => setBtnHovered(true)}
                onMouseLeave={() => setBtnHovered(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', height: 50, marginTop: 4,
                  background: T.orange, border: `1px solid ${T.orange}`,
                  color: T.ink, fontWeight: 700, fontSize: 15,
                  borderRadius: 999, cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Hanken Grotesk, sans-serif',
                  transform: btnHovered && !isLoading ? 'translateY(-1px)' : 'none',
                  boxShadow: btnHovered && !isLoading ? '0 14px 36px rgba(255,90,31,0.28)' : 'none',
                  transition: 'all 200ms cubic-bezier(.2,.8,.2,1)',
                  letterSpacing: '-0.005em', opacity: isLoading ? 0.7 : 1,
                }}>
                {isLoading ? (
                  <><Loader2 size={18} className="animate-spin"/>{isSignup ? 'Kayıt yapılıyor...' : 'Giriş yapılıyor...'}</>
                ) : (
                  <>{isSignup ? 'Kayıt Ol' : 'Giriş Yap'}<IconArrow/></>
                )}
              </button>
            </form>

            {/* Toggle login/signup */}
            <div style={{ textAlign: 'center' }}>
              <button type="button"
                onClick={() => { setIsSignup(v => !v); setError(''); setSuccessMsg(''); }}
                style={{ fontSize: 13, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = T.cream}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = T.muted}>
                {isSignup ? 'Zaten hesabın var mı? Giriş Yap' : 'Hesabın yok mu? Kayıt Ol'}
              </button>
            </div>

            {/* Bottom footer */}
            <div style={{ textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.06em', color: T.muted, opacity: 0.5 }}>
              © 2026 Luera · Tüm hakları saklıdır
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
