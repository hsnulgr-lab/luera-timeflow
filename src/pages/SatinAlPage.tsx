import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { supabase } from '@/lib/supabase';
import { planById, TRIAL_DAYS } from '@/lib/plans';
import { functionBody, saveClaimToken } from '@/lib/odemeTalebi';
import { useTheme } from '@/contexts/ThemeContext';
import { BillingSprite, Ico } from '@/components/billing/BillingIcons';
import { LueraTimeflowMark } from '@/components/brand/LueraTimeflowMark';
import './billing.css';

// /satin-al?plan=pro&cycle=yearly — lueratech.com'daki "Planı seç".
//
// Kullanıcı kararı 2026-10-23: kayıt ekranı yok, DOĞRUDAN Dodo. Hesap ödeme
// bitince Dodo'ya yazılan e-postayla açılır (/hosgeldin · dodo-satin-al ·
// göç 127). Oturumu olan kişi için talep gerekmez: kendi işletmesinin ödeme
// duvarına gider, o da aynı paketle Dodo'yu açar (PaywallPage · plan).
//
// Bu sayfa ProtectedRoute'un DIŞINDA.

type Phase = 'opening' | 'invalid' | 'error' | 'busy';

export function SatinAlPage() {
    const { dark } = useTheme();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const plan = planById(params.get('plan'));
    const cycle = params.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
    const [phase, setPhase] = useState<Phase>(plan ? 'opening' : 'invalid');
    const started = useRef(false);

    const open = async () => {
        if (!plan) return;
        setPhase('opening');
        const { data: s } = await supabase.auth.getSession();
        if (s.session) {
            navigate(`/abonelik?plan=${plan.id}&cycle=${cycle}`, { replace: true });
            return;
        }
        const { data, error } = await supabase.functions.invoke('dodo-satin-al', {
            body: { action: 'start', plan: plan.id, cycle },
        });
        const body = await functionBody(data, error);
        if (typeof body?.url === 'string' && typeof body?.token === 'string') {
            saveClaimToken(body.token);
            window.location.replace(body.url);
            return;
        }
        setPhase(body?.error === 'too_many' ? 'busy' : 'error');
    };

    useEffect(() => {
        // StrictMode efekti iki kez koşturur: iki talep, iki Dodo oturumu açılmasın.
        if (started.current) return;
        started.current = true;
        void open();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const shell = (body: React.ReactNode) => (
        <div className={cn('bl dash-theme', dark && 'dark')}
            style={{ minHeight: '100vh', padding: '24px 20px 70px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <BillingSprite />
            <div className="frame" style={{ width: '100%', maxWidth: 560 }}>
                <div className="appbar">
                    <LueraTimeflowMark size={28} animate={false} pillHeightRatio={0.5556} textRatio={0.62} dark={dark} />
                </div>
                {body}
            </div>
        </div>
    );

    if (phase === 'invalid') {
        return shell(
            <div className="wall">
                <div className="badge n"><Ico n="info" s="i26" /></div>
                <h1>Paket bulunamadı.</h1>
                <p className="lede">Paketler ve fiyatlar için fiyat sayfasına göz atın.</p>
                <div className="acts">
                    <button className="btn pri big" onClick={() => navigate('/fiyatlar')}>Paketleri gör<Ico n="ar" s="i" /></button>
                </div>
            </div>,
        );
    }

    if (phase === 'error' || phase === 'busy') {
        return shell(
            <div className="wall">
                <div className="badge n"><Ico n="info" s="i26" /></div>
                <h1>Ödeme sayfası açılamadı.</h1>
                <p className="lede">
                    {phase === 'busy'
                        ? 'Kısa sürede çok deneme yapıldı. Birkaç dakika sonra yeniden deneyin.'
                        : 'Bağlantınızı kontrol edip yeniden deneyin. Sorun sürerse destek@lueratech.com adresine yazın.'}
                </p>
                <div className="acts">
                    <button className="btn pri big" onClick={() => { void open(); }}>Yeniden dene</button>
                </div>
            </div>,
        );
    }

    return shell(
        <div className="wall" role="status" aria-live="polite">
            <div className="badge n"><Ico n="loading" s="i26" className="spin" /></div>
            <h1>Ödeme sayfası açılıyor.</h1>
            <p className="lede">
                {plan?.name} · {cycle === 'yearly' ? 'yıllık' : 'aylık'}. {TRIAL_DAYS} gün ücretsiz; bugün kartınızdan ücret alınmaz.
            </p>
        </div>,
    );
}
