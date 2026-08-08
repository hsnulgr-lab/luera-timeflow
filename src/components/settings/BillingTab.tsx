import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { useBilling } from '@/hooks/useBilling';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useStaff } from '@/hooks/useStaff';
import { confirmDialog } from '@/components/ConfirmDialog';
import { PlanCards } from '@/components/billing/PlanCards';
import { BillingSprite, Ico } from '@/components/billing/BillingIcons';
import { TRIAL_DAYS, formatTRY, planById, type Cycle, type PlanId } from '@/lib/plans';
import '@/pages/billing.css';

// Ayarlar → Faturalandırma
// Tasarım: "Luera Fiyatlandırma.html" · Durum 6.
//
// Tasarımın kuralı: bu ekran ÜÇ soruyu cevaplar — hangi plandayım, ne zaman ne
// kadar çekilecek, geçmiş faturalarım nerede. İptal linki dipnot değil, sayfada
// açıkça durur; gizlemek karanlık desendir.
//
// Fiyatlar src/lib/plans.ts'ten gelir (üç ekranda tek kaynak). Durum İKİ yerden
// okunur ve bu bilinçli: `useBilling` Core'daki faturalama gerçeğini (fatura
// geçmişi, iptal bayrağı) getirir, `useEntitlement` kapının kararını verir.
// İkisi ayrı sorular; tek kaynağa indirmek erişim kararını faturalama
// gecikmesine bağlardı.

const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export function BillingTab() {
    const { dark } = useTheme();
    const { subscription, invoices, loading, busy, startCheckout, cancelSubscription, pollAfterCheckout } = useBilling();
    const ent = useEntitlement();
    const { staff } = useStaff();
    const [searchParams, setSearchParams] = useSearchParams();
    const [showPlans, setShowPlans] = useState(false);
    const checkoutHandled = useRef(false);

    // Checkout dönüşü: webhook birkaç saniye gecikebilir → poll + bilgi toast'ı
    useEffect(() => {
        if (checkoutHandled.current) return;
        if (searchParams.get('checkout') === 'success') {
            checkoutHandled.current = true;
            toast.success('Ödeme alındı! Aboneliğiniz birkaç saniye içinde etkinleşecek.');
            pollAfterCheckout();
            searchParams.delete('checkout');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams, pollAfterCheckout]);

    const onSelectPlan = (planId: PlanId, c: Cycle) => { void startCheckout(planId, c); };

    const onCancel = async () => {
        const ok = await confirmDialog({
            title: 'Abonelik iptal edilsin mi?',
            description: 'Dönem sonuna kadar erişiminiz devam eder, verileriniz silinmez.',
            danger: true,
            confirmLabel: 'İptal Et',
        });
        if (ok) await cancelSubscription();
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 0', color: 'var(--dc-muted)' }}>
                <Loader2 size={18} className="animate-spin" />
                <span style={{ fontSize: 13 }}>Abonelik bilgileri yükleniyor…</span>
            </div>
        );
    }

    const hasSub = !!subscription && (subscription.status === 'active' || subscription.status === 'on_hold');
    const onTrial = ent.effective === 'trial';
    const plan = planById(subscription?.plan) ?? planById(ent.plan);
    const cycle: Cycle = (subscription?.billing_period ?? ent.cycle) === 'yearly' ? 'yearly' : 'monthly';
    const monthly = plan ? (cycle === 'yearly' ? plan.yearly : plan.monthly) : 0;
    const yearlySave = plan ? (plan.monthly - plan.yearly) * 12 : 0;

    return (
        <div className={cn('bl dash-theme', dark && 'dark')} style={{ background: 'transparent' }}>
            <BillingSprite />

            {hasSub || onTrial ? (
                <div className="pad" style={{ padding: 0, gap: 18 }}>
                    <div className="two">
                        <div className="box hero-box">
                            <div className="bh">
                                <div className="who">
                                    <span className="lbl">Mevcut plan</span>
                                    <span className="nm">
                                        {plan?.name ?? '—'}
                                        {subscription?.status === 'on_hold'
                                            ? <span className="pill warn">Ödeme bekleniyor</span>
                                            : onTrial
                                                ? <span className="pill warn">Deneme</span>
                                                : subscription?.cancel_at_period_end
                                                    ? <span className="pill warn">Dönem sonunda iptal</span>
                                                    : <span className="pill ok">Aktif</span>}
                                    </span>
                                    <span className="cyc">{cycle === 'yearly' ? 'Yıllık' : 'Aylık'} ödeme</span>
                                </div>
                                <div className="amtwrap">
                                    <span className="amt num">₺{formatTRY(monthly)}</span>
                                    <span className="amtc">/ ay</span>
                                </div>
                            </div>
                            <div className="brows">
                                <div className="kvrow" style={{ borderTop: 'none' }}>
                                    <span className="k">
                                        {onTrial ? 'Deneme bitiyor'
                                            : subscription?.cancel_at_period_end ? 'Erişim bitiyor'
                                                : 'Sonraki tahsilat'}
                                    </span>
                                    <span className="v">
                                        {fmtDate(ent.until ?? subscription?.expires_at ?? null)}
                                        {!subscription?.cancel_at_period_end && (
                                            <> · <span className="num">₺{formatTRY(monthly)}</span></>
                                        )}
                                    </span>
                                </div>
                                <div className="kvrow">
                                    <span className="k">Kullanım</span>
                                    <span className="v">{staff.filter((s) => s.isActive).length} personel</span>
                                </div>
                            </div>
                            <div className="bf">
                                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                                    <button className="btn gho" onClick={() => setShowPlans((v) => !v)}>Planı değiştir</button>
                                    <button className="btn gho" disabled={busy}
                                        onClick={() => onSelectPlan((plan?.id ?? 'pro') as PlanId, cycle)}>
                                        Kartı güncelle
                                    </button>
                                </div>
                                <div className="danger">
                                    <Ico n="info" s="i16" />
                                    {subscription?.cancel_at_period_end ? (
                                        <span>Aboneliğiniz dönem sonunda sona erecek. Devam etmek isterseniz bir plan seçmeniz yeterli.</span>
                                    ) : (
                                        <span>
                                            Aboneliğinizi{' '}
                                            <a href="#iptal" onClick={(e) => { e.preventDefault(); void onCancel(); }}>
                                                istediğiniz an iptal edebilirsiniz
                                            </a>. İptalde dönem sonuna kadar kullanmaya devam edersiniz.
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {cycle === 'monthly' && plan && yearlySave > 0 && (
                            <div className="box">
                                <h3>Yıllığa geçin</h3>
                                <div className="curplan">
                                    <span className="nm num">₺{formatTRY(plan.yearly)}</span>
                                    <span style={{ fontSize: 14, color: 'var(--dc-muted)', fontWeight: 600, paddingBottom: 3 }}>/ ay</span>
                                </div>
                                <p style={{ fontSize: 13.5, color: 'var(--dc-muted)', textWrap: 'pretty' }}>
                                    Aynı plan, yılda <b className="num">₺{formatTRY(yearlySave)}</b> daha az.
                                    12 ay yerine 10 ay ödersiniz.
                                </p>
                                <button className="btn pri wide" disabled={busy}
                                    onClick={() => onSelectPlan(plan.id, 'yearly')}>
                                    Yıllığa geç
                                </button>
                                <span style={{ fontSize: 12.5, color: 'var(--dc-muted2)', textWrap: 'pretty' }}>
                                    Yıllık planda da iptal hakkınız aynı.
                                </span>
                            </div>
                        )}
                    </div>

                    {showPlans && (
                        <div className="box" style={{ padding: 20 }}>
                            <h3>Planlar</h3>
                            <PlanCards busy={busy} currentPlan={(plan?.id ?? null) as PlanId | null}
                                defaultCycle={cycle} onSelect={onSelectPlan} ctaLabel={() => 'Bu plana geç'} />
                        </div>
                    )}

                    <div className="box">
                        <h3>Fatura geçmişi</h3>
                        {invoices.length === 0 ? (
                            <span style={{ fontSize: 13.5, color: 'var(--dc-muted)' }}>
                                Henüz fatura yok. İlk tahsilattan sonra burada listelenir.
                            </span>
                        ) : (
                            <div className="inv">
                                {invoices.map((inv) => (
                                    <div className="invrow" key={`${inv.date}-${inv.amount}`}>
                                        <Ico n="doc" />
                                        <div>
                                            <div className="d">{fmtDate(inv.date)}</div>
                                            <div className="s">{plan?.name ?? 'Abonelik'} · {cycle === 'yearly' ? 'yıllık' : 'aylık'}</div>
                                        </div>
                                        <span className="amt num">
                                            {inv.amount != null ? `₺${formatTRY(inv.amount)}` : '—'}
                                        </span>
                                        {inv.invoiceUrl && (
                                            <a className="dl" href={inv.invoiceUrl} target="_blank" rel="noreferrer" aria-label="Faturayı indir">
                                                <Ico n="dl" />
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // Aboneliği olmayan kullanıcı: doğrudan plan seçimi. Boş bir
                // "abonelik yok" kutusu göstermek, tek yapılacak işi bir tık
                // uzağa koymak olurdu.
                <div className="pad" style={{ padding: 0, gap: 18 }}>
                    <div className="call plain" style={{ textAlign: 'left' }}>
                        <Ico n="info" />
                        <span>
                            Aktif aboneliğiniz yok. Bir plan seçin — ilk {TRIAL_DAYS} gün ücretsiz,
                            deneme içinde iptal ederseniz ücret alınmaz.
                        </span>
                    </div>
                    <PlanCards busy={busy} onSelect={onSelectPlan}
                        ctaLabel={() => `${TRIAL_DAYS} gün ücretsiz dene`} />
                </div>
            )}
        </div>
    );
}
