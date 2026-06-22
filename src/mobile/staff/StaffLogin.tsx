import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Delete } from 'lucide-react';
import { useStaff } from '@/hooks/useStaff';
import { useStaffSession } from '@/contexts/StaffSessionProvider';
import { hashPin } from '@/lib/pin';
import { T, avatarColor } from '../theme';
import type { Staff } from '@/types';

// Personel Modu girişi: önce personel seç, sonra PIN gir.
export const StaffLogin = () => {
    const navigate = useNavigate();
    const { staff } = useStaff();
    const { login } = useStaffSession();

    // Sadece PIN'i tanımlı personel giriş yapabilir
    const eligible = useMemo(() => staff.filter((s) => s.isActive && s.pin), [staff]);

    const [selected, setSelected] = useState<Staff | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);
    const [checking, setChecking] = useState(false);

    const press = async (d: string) => {
        if (checking) return;
        setError(false);
        const next = (pin + d).slice(0, 6);
        setPin(next);
        if (next.length >= 4 && selected?.pin) {
            setChecking(true);
            const h = await hashPin(next);
            if (h === selected.pin) {
                login({ id: selected.id, name: selected.name, color: selected.color });
            } else {
                setError(true); setPin(''); setChecking(false);
            }
        }
    };
    const del = () => { setError(false); setPin((p) => p.slice(0, -1)); };

    return (
        <div style={{ height: '100dvh', background: T.bg, color: T.ink, fontFamily: T.font, display: 'flex', flexDirection: 'column', padding: '0 22px', paddingTop: 'calc(env(safe-area-inset-top,0px) + 24px)', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)' }}>
            <button onClick={() => (selected ? (setSelected(null), setPin('')) : navigate('/'))}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 18 }}>
                <ArrowLeft size={16} /> {selected ? 'Personel seç' : 'Çıkış'}
            </button>

            {!selected ? (
                <>
                    <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em' }}>Personel Girişi</h1>
                    <p style={{ fontSize: 13, color: T.muted, marginTop: 4, marginBottom: 22 }}>Kendi PIN'inle gir, sadece kendi randevu ve satışlarını gör.</p>
                    {eligible.length === 0 ? (
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, textAlign: 'center', color: T.muted, fontSize: 13 }}>
                            Henüz PIN tanımlı personel yok.<br />İşletme sahibi, Personel ekranından PIN atamalı.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {eligible.map((s) => (
                                <button key={s.id} onClick={() => { setSelected(s); setPin(''); setError(false); }}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, cursor: 'pointer' }}>
                                    <span style={{ width: 56, height: 56, borderRadius: '50%', background: s.color || avatarColor(s.name), display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, color: '#0E0E0E' }}>{s.name.charAt(0).toUpperCase()}</span>
                                    <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                                    {s.specialty && <span style={{ fontSize: 11, color: T.muted }}>{s.specialty}</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ textAlign: 'center', marginTop: 8 }}>
                        <span style={{ width: 64, height: 64, borderRadius: '50%', background: selected.color || avatarColor(selected.name), display: 'inline-grid', placeItems: 'center', fontSize: 26, fontWeight: 800, color: '#0E0E0E' }}>{selected.name.charAt(0).toUpperCase()}</span>
                        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 12 }}>{selected.name}</h2>
                        <p style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{error ? <span style={{ color: T.red }}>Yanlış PIN, tekrar dene</span> : 'PIN gir'}</p>
                    </div>

                    {/* PIN noktaları */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '22px 0 28px' }}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? T.orange : T.surface3, border: `1px solid ${T.border2}`, transition: 'all .15s' }} />
                        ))}
                    </div>

                    {/* Tuş takımı */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 280, margin: '0 auto', width: '100%' }}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                            <button key={d} onClick={() => press(d)} style={padBtn()}>{d}</button>
                        ))}
                        <span />
                        <button onClick={() => press('0')} style={padBtn()}>0</button>
                        <button onClick={del} style={{ ...padBtn(), background: 'transparent', border: 'none' }}><Delete size={22} color={T.muted} /></button>
                    </div>
                </div>
            )}
        </div>
    );

    function padBtn(): React.CSSProperties {
        return { height: 64, borderRadius: 18, background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontSize: 24, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer', display: 'grid', placeItems: 'center' };
    }
};
