/**
 * A11 · Abonelik ve faturalar — "Luera Fiyatlandırma · Durum 6"nın Ayarlar
 * çerçevesine oturmuş hâli (eski BillingTab'ın yerini aldı).
 *
 * Ekran ÜÇ soruyu cevaplar: hangi plandayım, ne zaman ne kadar çekilecek,
 * geçmiş faturalarım nerede. İptal bağlantısı dipnot değil, ana kutunun
 * içinde — gizlemek karanlık desendir.
 *
 * Karşılığı olmayanlar ÇİZİLMEZ (v1.1): ödeme yöntemi/kart son 4 hane,
 * fatura bilgisi/VKN, "mahsup", "kullanılmayan aylar iade", "e-arşiv".
 * Bunların hiçbiri bugün Core'dan gelmiyor.
 *
 * Durum iki yerden okunur ve bu bilinçli: `useBilling` Core'daki faturalama
 * gerçeğini (fatura geçmişi, iptal bayrağı), `useEntitlement` kapının
 * kararını verir. Fiyatlar `lib/plans.ts`'ten (üç ekranda tek kaynak).
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useBilling } from '@/hooks/useBilling';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useStaff } from '@/hooks/useStaff';
import { PLANS, TRIAL_DAYS, formatTRY, planById, type Cycle, type Plan, type PlanId } from '@/lib/plans';
import { dayLocative, trDate } from '../ayarlarModel';
import { Dots, Head, I, Modal, Seg } from '../parcalar';

export function Abonelik() {
    const { subscription, invoices, loading, error, busy, refresh, startCheckout, cancelSubscription, pollAfterCheckout } = useBilling();
    const ent = useEntitlement();
    const { staff } = useStaff();
    const [params, setParams] = useSearchParams();
    const [showPlans, setShowPlans] = useState(false);
    const [askCancel, setAskCancel] = useState(false);
    // Sayfanın açıldığı an — render saf kalsın diye bir kez okunur.
    const [openedAt] = useState(() => Date.now());
    const handled = useRef(false);

    // Ödeme dönüşü: webhook birkaç saniye gecikebilir → yoklama + bilgi notu.
    useEffect(() => {
        if (handled.current) return;
        if (params.get('checkout') === 'success') {
            handled.current = true;
            toast.success('Ödeme alındı! Aboneliğiniz birkaç saniye içinde etkinleşecek.');
            pollAfterCheckout();
            params.delete('checkout');
            setParams(params, { replace: true });
        }
    }, [params, setParams, pollAfterCheckout]);

    const onSelect = (planId: PlanId, c: Cycle) => { void startCheckout(planId, c); };

    if (loading) {
        return (
            <div className="ay-col w940">
                <Head title="Abonelik ve faturalar" />
                <div className="ay-help" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0' }}><Dots />Abonelik bilgileri yükleniyor…</div>
            </div>
        );
    }

    const hasSub = !!subscription && (subscription.status === 'active' || subscription.status === 'on_hold');
    const onTrial = ent.effective === 'trial';
    const plan = planById(subscription?.plan) ?? planById(ent.plan);
    const cycle: Cycle = (subscription?.billing_period ?? ent.cycle) === 'yearly' ? 'yearly' : 'monthly';
    const monthly = plan ? (cycle === 'yearly' ? plan.yearly : plan.monthly) : 0;
    const yearlySave = plan ? (plan.monthly - plan.yearly) * 12 : 0;
    const until = ent.until ?? subscription?.expires_at ?? null;
    const untilDay = until ? new Date(until).getDate() : null;
    // Dönem sonu geçmiş ama abonelik "aktif" görünüyorsa yenileme kaydı
    // gelmemiştir; geçmiş tarih "Sonraki tahsilat" diye yazılmaz.
    const periodPast = Boolean(until) && new Date(until as string).getTime() < openedAt;

    if (error && !hasSub && !onTrial) {
        return (
            <div className="ay-col w940">
                <Head title="Abonelik ve faturalar" lead="Hangi plandasınız, ne zaman ne kadar çekilecek, geçmiş faturalarınız." />
                <div role="status" className="ay-box plain" style={{ justifyContent: 'space-between', padding: '14px 16px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="ay-dot unk" />Abonelik bilgisi okunamadı — yenileyin.</span>
                    <button type="button" className="ay-btn" style={{ height: 38, padding: '0 12px', fontSize: 14 }} onClick={() => void refresh()}><I n="refresh" size={16} />Yenile</button>
                </div>
            </div>
        );
    }

    if (!hasSub && !onTrial) {
        return (
            <div className="ay-col w940" style={{ gap: 20 }}>
                <h1 className="ay-h1">Abonelik ve faturalar</h1>
                <div role="status" className="ay-box info"><I n="info" />Aktif aboneliğiniz yok. Bir plan seçin — ilk {TRIAL_DAYS} gün ücretsiz, deneme içinde iptal ederseniz ücret alınmaz.</div>
                <PlanKartlari busy={busy} onSelect={onSelect} cta={() => `${TRIAL_DAYS} gün ücretsiz dene`} />
            </div>
        );
    }

    const pill = subscription?.status === 'on_hold' ? { t: 'Ödeme bekleniyor', tone: 'warn' }
        : onTrial ? { t: 'Deneme', tone: 'warn' }
            : subscription?.cancel_at_period_end ? { t: 'Dönem sonunda iptal', tone: 'warn' }
                : { t: 'Aktif', tone: 'ok' };

    return (
        <>
            <div className="ay-col w940" style={{ gap: 18 }}>
                <div className="ay-head" style={{ paddingBottom: 6 }}>
                    <h1 className="ay-h1">Abonelik ve faturalar</h1>
                    <p className="ay-lead">Hangi plandasınız, ne zaman ne kadar çekilecek, geçmiş faturalarınız.</p>
                </div>

                <div className="ay-bill">
                    <div className="ay-card" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '22px 24px 18px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>Mevcut plan</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>
                                    {plan?.name ?? '—'}
                                    <span className="ay-tag" style={{ color: 'var(--tx)', fontSize: 13, fontWeight: 800, letterSpacing: 0 }}>
                                        <span className={`ay-dot ${pill.tone}`} style={{ width: 7, height: 7 }} />{pill.t}
                                    </span>
                                </span>
                                <span className="ay-help">{cycle === 'yearly' ? 'Yıllık' : 'Aylık'} ödeme</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em' }}>₺{formatTRY(monthly)}</span>
                                <span className="ay-help sm">{cycle === 'yearly' ? 'aylık karşılığı' : untilDay ? `her ayın ${dayLocative(untilDay)}` : '/ ay'}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderTop: '1px solid var(--bd)', fontSize: 15 }}>
                                <span style={{ color: 'var(--tx2)' }}>{periodPast ? 'Dönem sonu' : onTrial ? 'Deneme bitiyor' : subscription?.cancel_at_period_end ? 'Erişim bitiyor' : 'Sonraki tahsilat'}</span>
                                <span style={{ fontWeight: 700 }}>{trDate(until)}{!subscription?.cancel_at_period_end && !periodPast && ` · ₺${formatTRY(monthly)}`}</span>
                            </div>
                            {periodPast && (
                                <div role="status" className="ay-box warn" style={{ margin: '0 0 12px', fontSize: 14 }}>
                                    <I n="alert" />Bu tarih geçti; yeni dönem henüz görünmüyor.
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderTop: '1px solid var(--bd)', fontSize: 15 }}>
                                <span style={{ color: 'var(--tx2)' }}>Kullanım</span>
                                <span style={{ fontWeight: 700 }}>{staff.filter((s) => s.isActive).length} personel</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 24px 22px', borderTop: '1px solid var(--bd)' }}>
                            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                                <button type="button" className="ay-btn plain" aria-expanded={showPlans} onClick={() => setShowPlans((v) => !v)}>Planı değiştir</button>
                                <button type="button" className="ay-btn plain" disabled={busy} onClick={() => onSelect((plan?.id ?? 'pro') as PlanId, cycle)}>Kartı güncelle</button>
                            </div>
                            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.5, color: 'var(--tx2)' }}>
                                <I n="info" size={17} style={{ marginTop: 2 }} />
                                {subscription?.cancel_at_period_end
                                    ? <span>Aboneliğiniz dönem sonunda sona erecek. Devam etmek isterseniz bir plan seçmeniz yeterli.</span>
                                    : <span>Aboneliğinizi <a href="#iptal" style={{ fontWeight: 700 }} onClick={(e) => { e.preventDefault(); setAskCancel(true); }}>istediğiniz an iptal edebilirsiniz</a>. İptalde dönem sonuna kadar kullanmaya devam edersiniz.</span>}
                            </div>
                        </div>
                    </div>

                    {cycle === 'monthly' && plan && yearlySave > 0 && (
                        <div className="ay-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 800 }}>Yıllığa geçin</h3>
                            <span style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>₺{formatTRY(plan.yearly)}</span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>/ ay</span>
                            </span>
                            <p className="ay-help" style={{ lineHeight: 1.5, textWrap: 'pretty' }}>Aynı plan, yılda <b>₺{formatTRY(yearlySave)}</b> daha az. 12 ay yerine 10 ay ödersiniz.</p>
                            <button type="button" className="ay-btn-pri wide h46" disabled={busy} onClick={() => onSelect(plan.id, 'yearly')}>Yıllığa geç</button>
                            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--tx2)' }}>Yıllık planda da iptal hakkınız aynı.</span>
                        </div>
                    )}
                </div>

                {showPlans && (
                    <div className="ay-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 800 }}>Planlar</h3>
                        <PlanKartlari busy={busy} current={(plan?.id ?? null) as PlanId | null} defaultCycle={cycle} onSelect={onSelect} cta={() => 'Bu plana geç'} />
                    </div>
                )}

                <div className="ay-card" style={{ padding: '20px 24px 10px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 800, paddingBottom: 10 }}>Fatura geçmişi</h3>
                    {invoices.length === 0 ? (
                        <span className="ay-help" style={{ padding: '4px 0 14px', fontSize: 14.5 }}>Henüz fatura yok. İlk tahsilattan sonra burada listelenir.</span>
                    ) : invoices.map((inv) => (
                        <div key={`${inv.date}-${inv.amount}`} className="ay-inv">
                            <I n="doc" style={{ color: 'var(--tx2)' }} />
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontSize: 15, fontWeight: 700 }}>{trDate(inv.date)}</span>
                                <span className="ay-help sm">{plan?.name ?? 'Abonelik'} · {cycle === 'yearly' ? 'yıllık' : 'aylık'}</span>
                            </span>
                            <span style={{ fontSize: 15, fontWeight: 700 }}>{inv.amount != null ? `₺${formatTRY(inv.amount)}` : '—'}</span>
                            {inv.invoiceUrl
                                ? <a className="ay-icon-btn" href={inv.invoiceUrl} target="_blank" rel="noreferrer" aria-label="Faturayı indir"><I n="dl" /></a>
                                : <span />}
                        </div>
                    ))}
                </div>
            </div>

            {askCancel && (
                <Modal labelledBy="ay-iptal" small alert onClose={() => setAskCancel(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 28px 20px' }}>
                        <h2 id="ay-iptal" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Abonelik iptal edilsin mi?</h2>
                        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)' }}>Dönem sonuna kadar erişiminiz devam eder, verileriniz silinmez.</p>
                    </div>
                    <div className="ay-modal-f">
                        <button type="button" className="ay-btn" autoFocus disabled={busy} onClick={() => setAskCancel(false)}>Vazgeç</button>
                        <button type="button" className="ay-btn-danger" disabled={busy} onClick={async () => { await cancelSubscription(); setAskCancel(false); }}>İptal et</button>
                    </div>
                </Modal>
            )}
        </>
    );
}

function PlanKartlari({ busy, current, defaultCycle = 'monthly', onSelect, cta }: {
    busy: boolean; current?: PlanId | null; defaultCycle?: Cycle; onSelect: (p: PlanId, c: Cycle) => void; cta: (p: Plan) => string;
}) {
    const [cycle, setCycle] = useState<Cycle>(defaultCycle);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ alignSelf: 'center' }}>
                <Seg wide label="Ödeme dönemi" value={cycle} onChange={setCycle} options={[
                    { v: 'monthly', t: 'Aylık' },
                    { v: 'yearly', t: <>Yıllık<span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)', padding: '3px 8px', borderRadius: 7, border: '1px solid var(--bd2)' }}>2 ay bedava</span></> },
                ]} />
            </div>
            <div className="ay-plans">
                {PLANS.map((p) => {
                    const isCurrent = current === p.id && cycle === defaultCycle;
                    return (
                        <div key={p.id} className={p.popular ? 'ay-plan pop' : 'ay-plan'}>
                            {p.popular && <span className="badge">EN ÇOK SEÇİLEN</span>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{ fontSize: 20, fontWeight: 800 }}>{p.name}</span>
                                <span className="ay-help">{p.tagline}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
                                    <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>₺{formatTRY(cycle === 'yearly' ? p.yearly : p.monthly)}</span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>/ ay</span>
                                </span>
                                <span className="ay-help sm">{cycle === 'yearly' ? `Aylık ödemede ₺${formatTRY(p.monthly)} /ay` : `Yıllık ödemede ₺${formatTRY(p.yearly)} /ay`}</span>
                            </div>
                            <div className="ft">
                                {p.features.map((f) => (
                                    <span key={f.label} className={f.soon ? 'soon' : undefined}>
                                        <I n="check" /><span style={{ flex: 1 }}>{f.label}</span>
                                        {f.soon && <span className="soon-tag">YAKINDA</span>}
                                    </span>
                                ))}
                            </div>
                            {isCurrent
                                ? <span className="cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--bd2)', color: 'var(--tx2)' }}>Mevcut plan</span>
                                : <button type="button" disabled={busy} className={p.popular ? 'ay-btn-pri cta' : 'ay-btn cta'} style={{ height: 48 }}
                                    onClick={() => onSelect(p.id, cycle)}>{cta(p)}</button>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
