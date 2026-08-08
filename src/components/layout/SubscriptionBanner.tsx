import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { useEntitlement } from '@/hooks/useEntitlement';
import { BillingSprite, Ico } from '@/components/billing/BillingIcons';
import { firstChargeDate } from '@/lib/plans';
import '@/pages/billing.css';

// Deneme / ödeme şeridi — tasarım: "Luera Fiyatlandırma.html" · Durum 4.
//
// Sessiz kilit en kötü senaryo: kullanıcı bir sabah kapıyı kapalı bulur ve
// nedenini bilmez. Bu şerit o sürprizi ortadan kaldırıyor.
//
// Tasarımın kuralı: "gün sayısı azaldıkça metin SERTLEŞMİYOR, sadece
// SOMUTLAŞIYOR." Üç günde nötr mürekkep zemin ve kapatılabilir; son gün amber
// zemin ve kapatılamaz — çünkü ertesi gün uygulama duracak.

const HIDE_KEY = 'tf_sub_banner_hidden';
const todayKey = () => new Date().toISOString().slice(0, 10);
const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

/** Kaç gün kala şerit çıksın? Erken çıkarsa gürültü olur. */
const NUDGE_DAYS = 3;

export function SubscriptionBanner() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { dark } = useTheme();
    const ent = useEntitlement();
    // Gizleme bir güne yazılır, ertesi gün geri gelir (kurulum şeridiyle aynı
    // desen). Ödeme uyarısını kalıcı olarak susturmak kullanıcıya iyilik olmaz.
    const [hidden, setHidden] = useState(() => localStorage.getItem(HIDE_KEY) === todayKey());

    if (ent.loading || pathname.startsWith('/abonelik')) return null;

    const isGrace = ent.effective === 'grace';
    const isTrial = ent.effective === 'trial' && ent.daysLeft !== null && ent.daysLeft <= NUDGE_DAYS;
    if (!isGrace && !isTrial) return null;

    const left = ent.daysLeft ?? 0;
    // Son gün ve ek süre kapatılamaz: ertesi gün iş duruyor.
    const urgent = isGrace || left <= 1;
    if (hidden && !urgent) return null;

    const charge = ent.until ? new Date(ent.until) : firstChargeDate();

    return (
        <div className={cn('bl dash-theme', dark && 'dark')}>
            <BillingSprite />
            <div className="strip" style={urgent && !isGrace
                ? { background: 'var(--dc-amber-bg)', color: 'var(--dc-ink)' }
                : undefined}>
                <span className="tx">
                    {isGrace
                        ? <svg className="i18" style={{ color: 'var(--dc-amber)' }}><use href="#bl-card" /></svg>
                        : <Ico n="clock" />}
                    {isGrace ? (
                        <>
                            <b>Ödemeniz alınamadı.</b> Kartınızı güncellemezseniz {left <= 0 ? 'bugün' : `${left} gün sonra`} uygulama salt okunur olur.
                        </>
                    ) : left <= 1 ? (
                        <>
                            <b>Denemeniz {left <= 0 ? 'bugün bitiyor' : 'yarın bitiyor'}.</b> Plan seçmezseniz uygulama salt okunur olur.
                        </>
                    ) : (
                        <>
                            <b>Denemenizin {left} günü kaldı.</b> İlk tahsilat {dayFmt.format(charge)}'ta.
                        </>
                    )}
                </span>
                <button className="btn" onClick={() => navigate('/abonelik')}>
                    {isGrace ? 'Kartı güncelle' : 'Planı seç'}
                </button>
                {!urgent && (
                    <button className="x" aria-label="Şimdilik gizle"
                        onClick={() => { localStorage.setItem(HIDE_KEY, todayKey()); setHidden(true); }}>
                        <Ico n="x" />
                    </button>
                )}
            </div>
        </div>
    );
}
