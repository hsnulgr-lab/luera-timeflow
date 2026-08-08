import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Clock, LogOut } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBilling } from '@/hooks/useBilling';
import { useEntitlement } from '@/hooks/useEntitlement';
import { PlanCards } from '@/components/billing/PlanCards';
import { TRIAL_DAYS, type Cycle, type PlanId } from '@/lib/plans';
import './paywall.css';

// Uygulama içi ödeme duvarı — /abonelik
//
// Bu ekran bir CEZA DEĞİL, bir kapı. Karşısındaki kişi zaten bir sürtünme
// yaşıyor: ya denemesi bitmiş ya kartından çekilememiş. Tasarım onu
// suçlamamalı, korkutmamalı ve tek bir şeyi kolaylaştırmalı — ödemeyi
// tamamlamak.
//
// Verinin durduğu AÇIKÇA yazılır. Türkiye'de küçük işletme sahibinin ilk
// korkusu "müşteri listem gitti mi" olur; o cümle yazmazsa sayfayı kapatıp
// telefonla arar.

export function PaywallPage() {
    const { dark } = useTheme();
    const { logout } = useAuth();
    const navigate = useNavigate();
    const { busy, startCheckout, pollAfterCheckout } = useBilling();
    const ent = useEntitlement();
    const [params, setParams] = useSearchParams();
    const autoStarted = useRef(false);

    // Kayıt sırasında plan seçilmişse (/fiyatlar → /login?plan=pro) doğrudan
    // ödemeye geç: kullanıcı planı bir kez seçti, ikinci kez sormak sürtünme.
    useEffect(() => {
        if (autoStarted.current) return;
        const plan = params.get('plan');
        const cycle = params.get('cycle');
        if (plan === 'baslangic' || plan === 'pro' || plan === 'isletme') {
            autoStarted.current = true;
            void startCheckout(plan, cycle === 'yearly' ? 'yearly' : 'monthly');
        }
    }, [params, startCheckout]);

    // Ödeme dönüşü: webhook birkaç saniye gecikebilir.
    useEffect(() => {
        if (params.get('checkout') !== 'success') return;
        pollAfterCheckout();
        params.delete('checkout');
        setParams(params, { replace: true });
    }, [params, setParams, pollAfterCheckout]);

    // Abonelik canlandığı an duvarı kaldır — kullanıcı sayfayı yenilemek
    // zorunda kalmasın.
    useEffect(() => {
        if (!ent.loading && ent.ok) navigate('/', { replace: true });
    }, [ent.loading, ent.ok, navigate]);

    const onSelect = (plan: PlanId, cycle: Cycle) => { void startCheckout(plan, cycle); };

    const head = headline(ent.state, ent.until);

    return (
        <div className={cn('pw-page dash-theme', dark && 'dark')}>
            <div className="pw-shell">
                <div className="pw-head">
                    <span className="pw-logo">luera<i /></span>
                    <button className="pw-out" onClick={() => { void logout(); }}>
                        <LogOut size={16} />Çıkış
                    </button>
                </div>

                <div className={cn('pw-notice', head.tone)}>
                    {head.tone === 'warn' ? <AlertTriangle size={20} /> : <Clock size={20} />}
                    <div>
                        <b>{head.title}</b>
                        <p>{head.body}</p>
                    </div>
                </div>

                <h1 className="pw-h1">Planınızı seçin</h1>
                <p className="pw-sub">
                    Verileriniz olduğu gibi duruyor — müşterileriniz, randevularınız ve
                    ayarlarınız yerinde. Ödemeyi tamamladığınız an kaldığınız yerden
                    devam edersiniz.
                </p>

                <PlanCards
                    busy={busy}
                    showTrial={ent.state === 'none'}
                    ctaLabel={() => (ent.state === 'grace' ? 'Kartı güncelle' : 'Devam et')}
                    onSelect={onSelect}
                />

                <div className="pw-foot">
                    Sorunuz mu var? <a href="mailto:destek@lueratech.com">destek@lueratech.com</a>
                    <ArrowRight size={14} />
                </div>
            </div>
        </div>
    );
}

/** Duvarın üstündeki tek cümlelik açıklama — neden buradasınız? */
function headline(state: string, until: string | null): { tone: 'info' | 'warn'; title: string; body: string } {
    const day = until
        ? new Date(until).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
        : null;
    if (state === 'grace') {
        return {
            tone: 'warn',
            title: 'Ödeme alınamadı',
            body: day
                ? `Kartınızdan tahsilat yapılamadı. ${day} tarihine kadar hizmetiniz açık kalacak; bu süre içinde kartınızı güncellerseniz hiçbir şey kesintiye uğramaz.`
                : 'Kartınızdan tahsilat yapılamadı. Kartınızı güncellediğinizde hizmetiniz kaldığı yerden devam eder.',
        };
    }
    if (state === 'trial') {
        return { tone: 'info', title: 'Deneme süreniz doldu', body: `${TRIAL_DAYS} günlük ücretsiz denemeniz tamamlandı. Devam etmek için bir plan seçin.` };
    }
    if (state === 'none') {
        return { tone: 'info', title: `${TRIAL_DAYS} gün ücretsiz deneyin`, body: 'Bir plan seçin, kurulum sihirbazıyla işletmenizi 6 dakikada hazır hâle getirelim.' };
    }
    return { tone: 'info', title: 'Aboneliğiniz sona erdi', body: 'Devam etmek için bir plan seçin. Verileriniz duruyor.' };
}
