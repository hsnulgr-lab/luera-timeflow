import { useState } from 'react';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import {
    PLANS, TRIAL_DAYS, firstChargeDate, formatTRY, priceOf, yearlyDiscountPercent,
    type Cycle, type PlanId,
} from '@/lib/plans';
import './plans.css';

// Plan kartları — üç yerde aynı bileşen: herkese açık /fiyatlar, uygulama içi
// /abonelik duvarı ve Ayarlar→Faturalandırma.
//
// Fiyat ve özellikler src/lib/plans.ts'ten gelir; bu dosyada tek bir rakam
// yazılı DEĞİL. Sayfada bir fiyat gösterip başka bir tutar çekmek, kaybedilecek
// en pahalı güvendir.

interface Props {
    /** Kullanıcının şu anki planı (varsa) — o kart "mevcut planınız" der. */
    currentPlan?: PlanId | null;
    /** Deneme vaadi gösterilsin mi? Aktif abonelikte anlamsız. */
    showTrial?: boolean;
    busy?: boolean;
    ctaLabel?: (planId: PlanId) => string;
    onSelect: (plan: PlanId, cycle: Cycle) => void;
    defaultCycle?: Cycle;
}

export function PlanCards({
    currentPlan, showTrial = true, busy = false, ctaLabel, onSelect, defaultCycle = 'monthly',
}: Props) {
    const [cycle, setCycle] = useState<Cycle>(defaultCycle);
    // "%20 indirim" sabit yazılmıyor: fiyat değişince yazı sessizce yalan olurdu.
    const save = yearlyDiscountPercent(PLANS.find((p) => p.popular) ?? PLANS[0]);
    const charge = firstChargeDate().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

    return (
        <div className="pc-wrap">
            <div className="pc-cycle" role="tablist" aria-label="Ödeme dönemi">
                <button role="tab" aria-selected={cycle === 'monthly'}
                    className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>
                    Aylık
                </button>
                <button role="tab" aria-selected={cycle === 'yearly'}
                    className={cycle === 'yearly' ? 'on' : ''} onClick={() => setCycle('yearly')}>
                    Yıllık{save > 0 && <span className="pc-save">%{save} indirim</span>}
                </button>
            </div>

            {showTrial && (
                <div className="pc-trial">
                    <ShieldCheck size={19} />
                    <div>
                        <b>{TRIAL_DAYS} gün ücretsiz.</b> Kart bilgilerinizi şimdi alıyoruz ama
                        ilk tahsilat <b>{charge}</b> tarihinde yapılacak. Deneme bitmeden iptal
                        ederseniz hiçbir ücret alınmaz.
                    </div>
                </div>
            )}

            <div className="pc-grid">
                {PLANS.map((p) => {
                    const isCurrent = currentPlan === p.id;
                    return (
                        <div key={p.id} className={`pc-card${p.popular ? ' pop' : ''}`}>
                            {p.popular && <span className="pc-badge">En çok seçilen</span>}
                            <div>
                                <div className="pc-name">{p.name}</div>
                                <div className="pc-tag">{p.tagline}</div>
                            </div>
                            <div className="pc-price">
                                <b>₺{formatTRY(priceOf(p, cycle))}</b>
                                <span>/ ay</span>
                            </div>
                            {cycle === 'yearly' && (
                                <div className="pc-yearly-note">
                                    Yıllık ₺{formatTRY(p.yearly * 12)} tek seferde
                                </div>
                            )}
                            <ul className="pc-feats">
                                {p.features.map((ft) => (
                                    <li key={ft.label} className={ft.soon ? 'soon' : ''}>
                                        <Check size={16} />
                                        <span>
                                            {ft.label}
                                            {ft.soon && <span className="pc-soon">yakında</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {isCurrent ? (
                                <span className="pc-current"><Check size={17} />Mevcut planınız</span>
                            ) : (
                                <button
                                    className={`pc-btn${p.popular ? ' pri' : ''}`}
                                    disabled={busy}
                                    onClick={() => onSelect(p.id, cycle)}
                                >
                                    {busy && <Loader2 size={17} className="animate-spin" />}
                                    {ctaLabel ? ctaLabel(p.id) : `${p.name} ile başla`}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
