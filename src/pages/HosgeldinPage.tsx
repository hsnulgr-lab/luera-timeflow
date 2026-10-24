import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { cn } from '@/utils/cn';
import { supabase } from '@/lib/supabase';
import { clearAllCache } from '@/lib/swrCache';
import { clearClaimToken, functionBody, readClaimToken } from '@/lib/odemeTalebi';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { BillingSprite, Ico } from '@/components/billing/BillingIcons';
import { LueraTimeflowMark } from '@/components/brand/LueraTimeflowMark';
import './billing.css';

// /hosgeldin — Dodo'dan dönüş (ödeme önce akışı, göç 127).
//
// Dodo adrese subscription_id, status ve email ekler. Gizli talep jetonu
// sekmenin oturum deposunda (/satin-al yazdı). dodo-satin-al `claim`:
//   - hesabı bu talep açtıysa tek kullanımlık giriş jetonu → verifyOtp
//     (sihirli bağlantıyla aynı yol, /baglanti) → ödeme duvarı dönüşü
//     (/abonelik?checkout=success): abonelik aynaya gelince kurulum ya da
//     ana sayfa — PaywallPage · afterPaymentPath.
//   - e-postanın hesabı zaten varsa abonelik ona eklendi: giriş istenir.
//   - webhook henüz gelmediyse (pending) kısa aralıklarla yeniden sorulur.
//
// Bu sayfa ProtectedRoute'un DIŞINDA: gelen kişinin henüz oturumu yok.

type Phase = 'working' | 'slow' | 'existing' | 'manual' | 'expired' | 'offline' | 'notoken' | 'failed';

const DONUS = '/abonelik?checkout=success';
const TRY_MS = 2_000;
/** ~1 dakika: Dodo'nun bildirimi genelde saniyeler içinde gelir. */
const MAX_TRIES = 30;

export function HosgeldinPage() {
    const { dark } = useTheme();
    const { user, refreshOrg } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [phase, setPhase] = useState<Phase>('working');
    const [email, setEmail] = useState<string>(params.get('email') ?? '');
    // Giriş yapılan kullanıcı: yönlendirme uygulamanın oturumu da ona geçince.
    const [target, setTarget] = useState<string | null>(null);
    const started = useRef(false);
    const alive = useRef(true);

    const subscriptionId = params.get('subscription_id');
    const status = params.get('status');

    const run = async () => {
        setPhase('working');
        const token = readClaimToken();
        if (!token) {
            const { data: s } = await supabase.auth.getSession();
            if (s.session) { navigate(DONUS, { replace: true }); return; }
            setPhase('notoken');
            return;
        }
        if (status && status !== 'active' && status !== 'succeeded') { setPhase('failed'); return; }

        for (let i = 0; i < MAX_TRIES && alive.current; i++) {
            if (i === 5) setPhase('slow');
            const { data, error } = await supabase.functions.invoke('dodo-satin-al', {
                body: { action: 'claim', token, ...(subscriptionId ? { subscription_id: subscriptionId } : {}) },
            });
            const body = await functionBody(data, error);
            if (!body) {
                if (error && isAuthRetryableFetchError(error)) { setPhase('offline'); return; }
                setPhase('offline');
                return;
            }
            if (typeof body.email === 'string') setEmail(body.email);
            if (typeof body.login === 'string') {
                const { data: before } = await supabase.auth.getSession();
                const { data: v, error: vErr } = await supabase.auth.verifyOtp({ token_hash: body.login, type: 'email' });
                if (vErr || !v.user) { setPhase('existing'); return; }
                clearClaimToken();
                if (before.session && before.session.user.id !== v.user.id) clearAllCache();
                try { await refreshOrg(); } catch { /* AuthContext oturum olayında yine çözer */ }
                setTarget(v.user.id);
                return;
            }
            if (body.done) {
                clearClaimToken();
                const { data: s } = await supabase.auth.getSession();
                if (s.session) { navigate(DONUS, { replace: true }); return; }
                setPhase('existing');
                return;
            }
            if (body.manual) { setPhase('manual'); return; }
            if (body.existing) { clearClaimToken(); setPhase('existing'); return; }
            if (body.error === 'expired') { clearClaimToken(); setPhase('expired'); return; }
            if (body.error && body.error !== 'internal') { setPhase('failed'); return; }
            // pending ya da geçici hata: biraz bekle, yeniden sor.
            await new Promise((r) => setTimeout(r, TRY_MS));
        }
        if (alive.current) setPhase('slow');
    };

    useEffect(() => {
        alive.current = true;
        // Giriş jetonu TEK KULLANIMLIK: StrictMode efekti iki kez koşturur.
        if (!started.current) {
            started.current = true;
            // Adresteki e-posta ve abonelik kimliği geçmişe kalmasın.
            window.history.replaceState(null, '', window.location.pathname);
            void run();
        }
        return () => { alive.current = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (target && user?.id === target) navigate(DONUS, { replace: true });
    }, [target, user?.id, navigate]);

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

    const girisYap = (
        <div className="acts">
            <button className="btn pri big" onClick={() => navigate('/login')}>Giriş yap<Ico n="ar" s="i" /></button>
        </div>
    );
    const adres = email ? <b>{email}</b> : 'e-posta adresiniz';

    if (phase === 'existing') {
        return shell(
            <div className="wall">
                <div className="badge g"><Ico n="ck" s="i26" /></div>
                <h1>Aboneliğiniz hesabınıza eklendi.</h1>
                <p className="lede">
                    {adres} ile zaten bir hesabınız var. Giriş yapın, kaldığınız yerden devam edin. Şifrenizi hatırlamıyorsanız giriş ekranında "Şifremi unuttum"u kullanın.
                </p>
                {girisYap}
            </div>,
        );
    }

    if (phase === 'notoken') {
        return shell(
            <div className="wall">
                <div className="badge g"><Ico n="ck" s="i26" /></div>
                <h1>Ödemeniz alındı.</h1>
                <p className="lede">
                    Hesabınız {adres} ile açılıyor. Birkaç dakika içinde bu adrese tek tıkla giriş bağlantısı gönderiyoruz. Beklemek istemezseniz giriş ekranında "Şifremi unuttum"u seçin; gelen bağlantıyla şifrenizi belirleyip panele girin.
                </p>
                {girisYap}
            </div>,
        );
    }

    if (phase === 'manual' || phase === 'failed' || phase === 'expired') {
        const baslik = phase === 'failed' ? 'Ödeme tamamlanmadı.'
            : phase === 'expired' ? 'Bu bağlantının süresi dolmuş.'
            : 'Ödemeniz alındı.';
        const metin = phase === 'failed'
            ? 'Kartınızdan ücret alınmadı. Fiyat sayfasından yeniden deneyebilirsiniz.'
            : phase === 'expired'
                ? 'Hesabınız açıldıysa giriş yapın. Sorun sürerse destek@lueratech.com adresine yazın.'
                : <>{adres} ile birden fazla işletme ya da işletmesiz bir hesap görünüyor. Aboneliğinizi doğru işletmeye bağlamamız için destek@lueratech.com adresine yazın; hemen dönüyoruz.</>;
        return shell(
            <div className="wall">
                <div className="badge n"><Ico n="info" s="i26" /></div>
                <h1>{baslik}</h1>
                <p className="lede">{metin}</p>
                {phase === 'failed'
                    ? <div className="acts"><button className="btn pri big" onClick={() => navigate('/fiyatlar')}>Paketleri gör<Ico n="ar" s="i" /></button></div>
                    : girisYap}
            </div>,
        );
    }

    if (phase === 'offline') {
        return shell(
            <div className="wall">
                <div className="badge n"><Ico n="info" s="i26" /></div>
                <h1>Bağlantı kurulamadı.</h1>
                <p className="lede">Ödemeniz Dodo'da duruyor. İnternet bağlantınızı kontrol edip yeniden deneyin.</p>
                <div className="acts">
                    <button className="btn pri big" onClick={() => { void run(); }}>Yeniden dene</button>
                </div>
            </div>,
        );
    }

    return shell(
        <div className="wall" role="status" aria-live="polite">
            <div className="badge n"><Ico n="loading" s="i26" className="spin" /></div>
            <h1>Hesabınız hazırlanıyor.</h1>
            <p className="lede">
                {phase === 'slow'
                    ? 'Ödemeniz işleniyor, birkaç saniye daha sürebilir. Bu sayfayı kapatmayın.'
                    : 'Ödemeniz alındı. Sizi panele götürüyoruz.'}
            </p>
        </div>,
    );
}
