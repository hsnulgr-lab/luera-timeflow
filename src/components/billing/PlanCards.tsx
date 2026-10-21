import { useState } from 'react';
import {
    PLANS, TRIAL_DAYS, fitsTeam, formatTRY, yearlyFreeMonths, yearlyPerMonth,
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
    /**
     * İşletmenin aktif çalışan sayısı. Sığmadığı plan (Tek kişilik) pasif
     * çizilir; sunucu da satmaz (dodo-checkout · team_too_large). Bilinmiyorsa
     * (herkese açık /fiyatlar) hepsi açık.
     */
    activeStaff?: number | null;
}

export function PlanCards({
    currentPlan, busy = false, ctaLabel, onSelect, defaultCycle = 'monthly', showToggle = true, activeStaff,
}: Props) {
    const [cycle, setCycle] = useState<Cycle>(defaultCycle);
    // "2 ay bedava" sabit yazılmıyor: fiyat değişince yazı sessizce yalan olurdu.
    const freeMonths = yearlyFreeMonths(PLANS.find((p) => p.popular) ?? PLANS[0]);

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
                    const fits = fitsTeam(p, activeStaff);
                    return (
                        <div key={p.id} className={`plan${p.popular ? ' pop' : ''}`}>
                            {p.popular && <span className="flag">En çok seçilen</span>}
                            <div>
                                <div className="pn">{p.name}</div>
                                <div className="pfor">{p.tagline}</div>
                            </div>
                            <div>
                                {/* Yıllıkta büyük rakam ÇEKİLEN tutar: yılda tek sefer.
                                    Aylığa düşen yalnız not — 7.990 / 12 kuruşlu. */}
                                <div className="price">
                                    <span className="amt num">₺{formatTRY(cycle === 'yearly' ? p.yearlyTotal : p.monthly)}</span>
                                    <span className="per">{cycle === 'yearly' ? '/ yıl' : '/ ay'}</span>
                                </div>
                                <div className="price-note">
                                    {cycle === 'monthly'
                                        ? <>Yıllık ödemede <b className="num">₺{formatTRY(p.yearlyTotal)}</b>/yıl</>
                                        : <>Aylığa düşen <b className="num">₺{formatTRY(yearlyPerMonth(p))}</b> · {yearlyFreeMonths(p)} ay bedava</>}
                                </div>
                            </div>
                            <ul className="feats">
                                {p.features.map((ft) => (
                                    <li key={ft.label}>
                                        <Ico n="ck" />
                                        {ft.label}
                                    </li>
                                ))}
                            </ul>
                            {isCurrent ? (
                                <span className="pill ok cta" style={{ alignSelf: 'flex-start' }}>Mevcut planınız</span>
                            ) : !fits ? (
                                // Not düğmenin İÇİNDE: altına düşünce bu kartın düğmesi
                                // ötekilerden yukarıda kalıyordu.
                                <button className="btn gho wide cta" disabled
                                    style={{ flexDirection: 'column', gap: 1, lineHeight: 1.25, color: 'var(--dc-muted)' }}>
                                    <span>Ekibinizde {activeStaff} kişi var</span>
                                    <span style={{ fontSize: 12, fontWeight: 500 }}>Bu paket tek çalışan içindir</span>
                                </button>
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
