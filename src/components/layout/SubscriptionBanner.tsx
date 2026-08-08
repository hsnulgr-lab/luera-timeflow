import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { useEntitlement } from '@/hooks/useEntitlement';
import '@/pages/setupWizard.css';

// Deneme / ödeme şeridi.
//
// Sessiz kilit en kötü senaryo: kullanıcı bir sabah kapıyı kapalı bulur ve
// nedenini bilmez. Bu şerit o sürprizi ortadan kaldırıyor.
//
// KAPATILAMAZ — kurulum şeridinin aksine. Kurulumu ertelemek kullanıcının
// hakkı; ödemenin alınamadığını görmezden gelmek ise iki gün sonra işini
// durdurur. Yalnız son günlerde görünür, o yüzden ısrarı hak ediyor.

/** Kaç gün kala deneme şeridi çıksın? Erken çıkarsa gürültü olur. */
const TRIAL_NUDGE_DAYS = 3;

export function SubscriptionBanner() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const ent = useEntitlement();

    if (ent.loading) return null;

    const isTrialEnding = ent.effective === 'trial' && ent.daysLeft !== null && ent.daysLeft <= TRIAL_NUDGE_DAYS;
    const isGrace = ent.effective === 'grace';
    if (!isTrialEnding && !isGrace) return null;

    const left = ent.daysLeft ?? 0;
    const dayText = left <= 0 ? 'bugün' : `${left} gün`;

    return (
        <div className={cn('dash-theme', dark && 'dark')} style={{ padding: '12px 16px 0' }}>
            <div className="sw-resume">
                {isGrace ? <AlertTriangle size={20} /> : <Clock size={20} />}
                <div className="tx">
                    <b>{isGrace ? 'Ödeme alınamadı' : `Denemenizin ${dayText}ü kaldı`}</b>
                    <span>
                        {isGrace
                            ? `Kartınızı güncellemezseniz ${dayText} sonra hizmetiniz duracak.`
                            : 'Bir plan seçin, hizmetiniz kesintisiz devam etsin.'}
                    </span>
                </div>
                <button className="sw-btn" onClick={() => navigate('/abonelik')}>
                    {isGrace ? 'Kartı güncelle' : 'Planı seç'}<ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
