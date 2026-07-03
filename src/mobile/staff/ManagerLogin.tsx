import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Delete } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useManagerMode } from '@/contexts/ManagerModeProvider';
import { hashPin } from '@/lib/pin';
import { T } from '../theme';

// Yönetici Girişi: PIN varsa doğrular; yoksa ilk kullanımda PIN oluşturur
// (ölü ekran yerine — Ayarlar'a gitmeye gerek kalmadan burada belirlenir).
export const ManagerLogin = ({ onBack }: { onBack: () => void }) => {
    const navigate = useNavigate();
    const { settings, updateSettings } = useReservations();
    const { enable } = useManagerMode();
    const [pin, setPin] = useState('');
    const [firstPin, setFirstPin] = useState('');           // oluşturma: ilk giriş
    const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
    const [error, setError] = useState(false);
    const [checking, setChecking] = useState(false);

    const creating = !settings.managerPin;

    const complete = async (full: string) => {
        if (creating) {
            if (stage === 'enter') { setFirstPin(full); setStage('confirm'); setPin(''); return; }
            if (full !== firstPin) { setError(true); setPin(''); setFirstPin(''); setStage('enter'); return; }
            setChecking(true);
            // updateSettings hata durumunda kendi toast'ını gösterir; başarıda dashboard = onay.
            // PIN sonraki oturumlar için saklanır, bu oturumun yönetici modu client'ta açılır.
            const h = await hashPin(full);
            await updateSettings({ ...settings, managerPin: h });
            enable(); navigate('/');
            return;
        }
        setChecking(true);
        const h = await hashPin(full);
        if (h === settings.managerPin) { enable(); navigate('/'); }
        else { setError(true); setPin(''); setChecking(false); }
    };

    const press = async (d: string) => {
        if (checking) return;
        setError(false);
        const next = (pin + d).slice(0, 4);
        setPin(next);
        if (next.length >= 4) await complete(next);
    };
    const del = () => { setError(false); setPin((p) => p.slice(0, -1)); };
    const padBtn: React.CSSProperties = { height: 64, borderRadius: 18, background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontSize: 24, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer', display: 'grid', placeItems: 'center' };

    const subtitle = error
        ? (creating ? 'PIN\'ler eşleşmedi, tekrar dene' : 'Yanlış PIN, tekrar dene')
        : creating
            ? (stage === 'enter' ? 'İlk kez giriş — 4 haneli PIN belirle' : 'PIN\'i tekrar gir')
            : 'Tam erişim için PIN gir';

    return (
        <div style={{ height: '100dvh', background: T.bg, color: T.ink, fontFamily: T.font, display: 'flex', flexDirection: 'column', padding: '0 22px', paddingTop: 'calc(env(safe-area-inset-top,0px) + 24px)', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)' }}>
            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 18 }}>
                <ArrowLeft size={16} /> Geri
            </button>
            <div style={{ textAlign: 'center', marginTop: 8 }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(255,90,31,.15)', display: 'inline-grid', placeItems: 'center', color: T.orange }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', marginTop: 12 }}>{creating ? 'Yönetici PIN Oluştur' : 'Yönetici Girişi'}</h1>
                <p style={{ fontSize: 13, color: error ? T.red : T.muted, marginTop: 4 }}>{subtitle}</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '22px 0 28px' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? T.orange : T.surface3, border: `1px solid ${T.border2}` }} />
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 280, margin: '0 auto', width: '100%', opacity: checking ? 0.5 : 1, pointerEvents: checking ? 'none' : 'auto' }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)} style={padBtn}>{d}</button>)}
                <span />
                <button onClick={() => press('0')} style={padBtn}>0</button>
                <button onClick={del} style={{ ...padBtn, background: 'transparent', border: 'none' }}><Delete size={22} color={T.muted} /></button>
            </div>
        </div>
    );
};
