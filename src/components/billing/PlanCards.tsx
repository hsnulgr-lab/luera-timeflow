import { useState } from 'react';
import {
    PLANS, TRIAL_DAYS, formatTRY, priceOf, yearlyDiscountPercent,
    type Cycle, type PlanId,
} from '@/lib/plans';
import { Ico } from './BillingIcons';

// Plan kartları — tasarım: "Luera Fiyatlandırma.html" Durum 1.
//
// Üç yerde aynı bileşen: herkese açık /fiyatlar, uygulama içi /abonelik duvarı
// ve Ayarlar→Faturalandırma. Fiyat ve özellikler src/lib/plans.ts'ten gelir;
// bu dosyada tek bir rakam yazılı DEĞİL. Sayfada bir fiyat gösterip başka bir
// tutar çekmek, kaybedilecek en pahalı güvendir.

interface Props {
    currentPlan?: PlanId | null;
    busy?: boolean;
    /** Kart butonunun metni. Varsayılan tasarımdaki hâli. */
    ctaLabel?: (planId: PlanId) => string;
    onSelect: (plan: PlanId, cycle: Cycle) => void;
    defaultCycle?: Cycle;
    /** Aylık/yıllık anahtarı gösterilsin mi? Duvarda dar hâlde gizlenebilir. */
    showToggle?: boolean;
}

export function PlanCards({
    currentPlan, busy = false, ctaLabel, onSelect, defaultCycle = 'monthly', showToggle = true,
}: Props) {
    const [cycle, setCycle] = useState<Cycle>(defaultCycle);
    // "2 ay bedava" sabit yazılmıyor: fiyat değişince yazı sessizce yalan olurdu.
    const save = yearlyDiscountPercent(PLANS.find((p) => p.popular) ?? PLANS[0]);
    const freeMonths = Math.round((save / 100) * 12);

    return (
        <>
            {showToggle && (
                <div className="toggle" role="tablist" aria-label="Ödeme dönemi">
                    <button role="tab" aria-selected={cycle === 'monthly'}
                        className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>
                        Aylık
                    </button>
                    <button role="tab" aria-selected={cycle === 'yearly'}
                        className={cycle === 'yearly' ? 'on' : ''} onClick={() => setCycle('yearly')}>
                        Yıllık{freeMonths > 0 && <span className="save">{freeMonths} ay bedava</span>}
                    </button>
                </div>
            )}

            <div className="plans">
                {PLANS.map((p) => {
                    const isCurrent = currentPlan === p.id;
                    const other = cycle === 'monthly' ? p.yearly : p.monthly;
                    return (
                        <div key={p.id} className={`plan${p.popular ? ' pop' : ''}`}>
                            {p.popular && <span className="flag">En çok seçilen</span>}
                            <div>
                                <div className="pn">{p.name}</div>
                                <div className="pfor">{p.tagline}</div>
                            </div>
                            <div>
                                <div className="price">
                                    <span className="amt num">₺{formatTRY(priceOf(p, cycle))}</span>
                                    <span className="per">/ ay</span>
                                </div>
                                <div className="price-note">
                                    {cycle === 'monthly'
                                        ? <>Yıllık ödemede <b className="num">₺{formatTRY(other)}</b>/ay</>
                                        : <>Yılda tek seferde <b className="num">₺{formatTRY(p.yearly * 12)}</b></>}
                                </div>
                            </div>
                            <ul className="feats">
                                {p.features.map((ft) => (
                                    <li key={ft.label} className={ft.soon ? 'soon' : ''}>
                                        <Ico n="ck" />
                                        {ft.label}
                                        {ft.soon && <span className="soon-tag">Yakında</span>}
                                    </li>
                                ))}
                            </ul>
                            {isCurrent ? (
                                <span className="pill ok cta" style={{ alignSelf: 'flex-start' }}>Mevcut planınız</span>
                            ) : (
                                <button
                                    className={`btn ${p.popular ? 'pri' : 'gho'} wide cta`}
                                    disabled={busy}
                                    onClick={() => onSelect(p.id, cycle)}
                                >
                                    {ctaLabel ? ctaLabel(p.id) : `${TRIAL_DAYS} gün ücretsiz dene`}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
