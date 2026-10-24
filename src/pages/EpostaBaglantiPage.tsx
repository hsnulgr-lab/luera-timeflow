import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { cn } from '@/utils/cn';
import { supabase } from '@/lib/supabase';
import { clearAllCache } from '@/lib/swrCache';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { afterPaymentPath } from '@/lib/odemeSonrasi';
import { BillingSprite, Ico } from '@/components/billing/BillingIcons';
import { LueraTimeflowMark } from '@/components/brand/LueraTimeflowMark';
import './billing.css';

// Sihirli bağlantı — /baglanti#t=<hashed_token>
//
// Abonelik e-postalarındaki düğme buraya gelir (supabase/functions/
// abonelik-eposta). Bilgisayarı olmayan salon sahibi telefonun tarayıcısında
// şifre yazmadan paket ekranına (/abonelik) düşer: docs/abonelik-kurallari.md §2.
// Tek istisna `&git=panel`: siteden ödeme önce açılan hesabın hoş geldiniz
// e-postası (göç 127) — o kişi panele gelir: kurulum ya da ana sayfa.
//
// ── Neden giriş servisinin kendi bağlantısı değil ───────────────────────────
// GoTrue'nun `action_link`i API_EXTERNAL_URL'e gider ve o adres iç ağda
// (http://supabase-kong:8000) — kimsenin tarayıcısında açılmaz. Fonksiyon
// yalnız `hashed_token`ı alır; doğrulamayı bu sayfa `verifyOtp` ile yapar.
//
// ── Neden parça (#) ─────────────────────────────────────────────────────────
// Parça sunucuya GİTMEZ: jeton erişim günlüğüne düşmez, e-posta
// tarayıcılarının bağlantı önizleyicisi (JS çalıştırmaz) jetonu yakmaz.
// supabase-js yalnız `access_token` / `error_description` taşıyan parçayı
// oturum sanar; `#t=` ona dokunmaz.
//
// Bu sayfa ProtectedRoute'un DIŞINDA: gelen kişinin henüz oturumu yok.

type Phase = 'checking' | 'offline' | 'expired';

/**
 * Paket ekranı, e-posta kipinde: kişi orada KALIR, uygulamanın (telefonda
 * telefon sürümünün) ana sayfasına gönderilmez — PaywallPage · fromEmail.
 */
const PAKET = '/abonelik?kaynak=eposta';

/** Parçadaki hedef: hoş geldiniz e-postası panele, öteki her şey paket ekranına. */
function panelFromHash(hash: string): boolean {
    return new URLSearchParams(hash.replace(/^#/, '')).get('git') === 'panel';
}

/** Parçadaki jeton (#t=…); yoksa null. */
function tokenFromHash(hash: string): string | null {
    const t = new URLSearchParams(hash.replace(/^#/, '')).get('t');
    return t && t.trim() ? t.trim() : null;
}

export function EpostaBaglantiPage() {
    const { dark } = useTheme();
    const { user, orgId, refreshOrg } = useAuth();
    const navigate = useNavigate();
    const [phase, setPhase] = useState<Phase>('checking');
    // İlk çizimde okunur: parça birazdan adres çubuğundan silinir.
    const [panel] = useState(() => panelFromHash(window.location.hash));
    const routed = useRef(false);
    // Doğrulanan kullanıcı: yönlendirme ancak uygulamanın oturumu da ona
    // geçince yapılır — aynı tarayıcıda başka biri açıksa paket ekranı bir
    // an ESKİ kullanıcının işletmesiyle açılmasın.
    const [target, setTarget] = useState<string | null>(null);
    const token = useRef<string | null>(null);
    const started = useRef(false);

    const verify = async () => {
        setPhase('checking');
        const { data: before } = await supabase.auth.getSession();
        const t = token.current;
        if (!t) {
            // Jetonsuz açıldı (yer imi, geri tuşu): oturum varsa zaten içeride.
            if (before.session) setTarget(before.session.user.id);
            else setPhase('expired');
            return;
        }

        const { data, error } = await supabase.auth.verifyOtp({ token_hash: t, type: 'email' });
        if (error || !data.user) {
            // Ağ hatası "süresi dolmuş" değildir: jeton bellekte durur, yeniden
            // denenebilir. Sunucu cevabı geldiyse jeton bitmiştir.
            if (error && isAuthRetryableFetchError(error)) { setPhase('offline'); return; }
            token.current = null;
            // İkinci tıklama: ilk tıklama kişiyi zaten içeri almıştı.
            if (before.session) { setTarget(before.session.user.id); return; }
            setPhase('expired');
            return;
        }

        token.current = null;
        // Ortak bilgisayar: önceki kişinin önbelleği bu kişiye görünmesin.
        if (before.session && before.session.user.id !== data.user.id) clearAllCache();
        // İşletme kullanıcı başına bir kez çözülüyor; yeni oturumda yeniden oku
        // (AuthContext · refreshOrg — köprüdeki "Kaydedilemedi" dersi).
        try { await refreshOrg(); } catch { /* AuthContext oturum olayında yine çözer */ }
        setTarget(data.user.id);
    };

    useEffect(() => {
        // Jeton TEK KULLANIMLIK: StrictMode efekti iki kez koşturur, ikinci
        // doğrulama ilkinin yaktığı jetonla "süresi dolmuş" derdi.
        if (started.current) return;
        started.current = true;
        token.current = tokenFromHash(window.location.hash);
        // Adres çubuğundan HEMEN silinir: geçmişe, paylaşılan ekrana düşmesin.
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        void verify();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!target || user?.id !== target || routed.current) return;
        if (!panel) { routed.current = true; navigate(PAKET, { replace: true }); return; }
        // Panel: işletme çözülünce, ödeme dönüşüyle aynı kural (kurulum ya da ana sayfa).
        if (!orgId) return;
        routed.current = true;
        void afterPaymentPath(orgId).then((to) => navigate(to, { replace: true }));
    }, [target, user?.id, orgId, panel, navigate]);

    const shell = (body: React.ReactNode) => (
        <div className={cn('bl dash-theme', dark && 'dark')}
            style={{ minHeight: '100vh', padding: '24px 20px 70px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <BillingSprite />
            <div className="frame" style={{ width: '100%', maxWidth: 560 }}>
                {/* Tam marka (luera + "timeflow" hapı): e-postadan gelen kişi
                    hangi ürüne girdiğini görsün — giriş sayfasındakiyle aynı.
                    Oran kenar çubuğuyla aynı (kullanıcı kararı, 2026-10-20). */}
                <div className="appbar">
                    <LueraTimeflowMark size={28} animate={false} pillHeightRatio={0.5556} textRatio={0.62} dark={dark} />
                </div>
                {body}
            </div>
        </div>
    );

    if (phase === 'offline') {
        return shell(
            <div className="wall">
                <div className="badge n"><Ico n="info" s="i26" /></div>
                <h1>Bağlantı kurulamadı.</h1>
                <p className="lede">İnternet bağlantınızı kontrol edip yeniden deneyin.</p>
                <div className="acts">
                    <button className="btn pri big" onClick={() => { void verify(); }}>
                        Yeniden dene
                    </button>
                </div>
            </div>,
        );
    }

    if (phase === 'expired') {
        return shell(
            <div className="wall">
                <div className="badge n"><Ico n="clock" s="i26" /></div>
                <h1>Bu bağlantı artık geçerli değil.</h1>
                <p className="lede">
                    {panel
                        ? 'Bağlantının süresi dolmuş ya da daha önce kullanılmış. Giriş ekranında e-postanızı yazıp "Şifremi unuttum"u seçin; gelen bağlantıyla şifrenizi belirleyin.'
                        : 'Bağlantının süresi dolmuş ya da daha önce kullanılmış. Giriş yapın, sizi paket ekranına götürelim.'}
                </p>
                <div className="acts">
                    <button className="btn pri big" onClick={() => navigate(panel ? '/login' : '/login?sonra=abonelik')}>
                        Giriş yap<Ico n="ar" s="i" />
                    </button>
                </div>
            </div>,
        );
    }

    return shell(
        <div className="wall" role="status" aria-live="polite">
            <div className="badge n"><Ico n="loading" s="i26" className="spin" /></div>
            <h1>Giriş yapılıyor.</h1>
            <p className="lede">{panel ? 'Sizi panele götürüyoruz.' : 'Sizi paket ekranına götürüyoruz.'}</p>
        </div>,
    );
}
