import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Check, Sparkles, Download, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { useBilling } from '@/hooks/useBilling';
import { confirmDialog } from '@/components/ConfirmDialog';

// ── Design tokens (SettingsPage ile birebir) ─────────────────────────────────
const LT = {
  ink: '#0E0E0E', orange: '#FF5A1F', surface: '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
  border: 'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)', muted: 'rgba(14,14,14,0.48)', muted2: 'rgba(14,14,14,0.30)',
  shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)', r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
  ink: '#F3EDE3', orange: '#FF5A1F', surface: '#111009', surface2: '#191610', surface3: '#231E18',
  border: 'rgba(243,237,227,0.08)', border2: 'rgba(243,237,227,0.20)', muted: 'rgba(243,237,227,0.45)', muted2: 'rgba(243,237,227,0.28)',
  shadowSm: '0 1px 3px rgba(0,0,0,0.2),0 2px 8px rgba(0,0,0,0.15)', r: '14px', rSm: '10px', rXs: '7px',
};

const green = '#5DBB63';

type Cycle = 'monthly' | 'yearly';

interface PlanFeature { label: string; soon?: boolean }
interface Plan { id: string; name: string; tagline: string; monthly: number; yearly: number; popular?: boolean; features: PlanFeature[] }

const f = (label: string, soon?: boolean): PlanFeature => ({ label, soon });

const PLANS: Plan[] = [
  { id: 'baslangic', name: 'Başlangıç', tagline: 'Yeni başlayan işletmeler', monthly: 299, yearly: 239, features: [f('1 şube'), f('3 personele kadar'), f('Randevu & takvim'), f('Online booking sayfası'), f('Temel raporlar')] },
  { id: 'pro', name: 'Pro', tagline: 'Büyüyen salonlar için', monthly: 599, yearly: 479, popular: true, features: [f('Sınırsız personel'), f('WhatsApp hatırlatma'), f('Kasa & tahsilat'), f('Gelişmiş analiz'), f('Müşteri paketleri'), f('E-posta destek')] },
  { id: 'isletme', name: 'İşletme', tagline: 'Çoklu şube & yüksek hacim', monthly: 1199, yearly: 959, features: [f('Çoklu şube yönetimi', true), f('API erişimi'), f('Öncelikli destek'), f('Özel raporlar'), f('Rol & yetki yönetimi', true), f('Onboarding desteği')] },
];

const fmt = (n: number) => n.toLocaleString('tr-TR');
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function BillingTab() {
  const { dark } = useTheme();
  const T = dark ? DT : LT;
  const { subscription, invoices, loading, busy, startCheckout, cancelSubscription, pollAfterCheckout } = useBilling();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const checkoutHandled = useRef(false);

  const hasActiveSub = !!subscription && (subscription.status === 'active' || subscription.status === 'on_hold');
  const currentPlan = hasActiveSub ? PLANS.find((p) => p.id === subscription!.plan) : undefined;

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

  useEffect(() => {
    if (subscription) setCycle(subscription.billing_period === 'yearly' ? 'yearly' : 'monthly');
  }, [subscription]);

  const onSelectPlan = async (planId: string) => {
    setPendingPlan(planId);
    await startCheckout(planId, cycle);
    setPendingPlan(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 0', color: T.muted }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: '13px' }}>Abonelik bilgileri yükleniyor…</span>
      </div>
    );
  }

  return (
    <div>
      {/* ── Mevcut plan ── */}
      {hasActiveSub && currentPlan ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '18px 20px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: 26 }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(255,90,31,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles size={22} color={T.orange} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.02em', color: T.ink }}>{currentPlan.name} plan</span>
              {subscription!.status === 'on_hold' ? (
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#E8973C', background: 'rgba(232,151,60,0.12)', padding: '2px 9px', borderRadius: 999, letterSpacing: '.04em' }}>ÖDEME BEKLENİYOR</span>
              ) : subscription!.cancel_at_period_end ? (
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#E07070', background: 'rgba(224,112,112,0.12)', padding: '2px 9px', borderRadius: 999, letterSpacing: '.04em' }}>DÖNEM SONUNDA İPTAL</span>
              ) : (
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: T.orange, background: 'rgba(255,90,31,0.12)', padding: '2px 9px', borderRadius: 999, letterSpacing: '.04em' }}>AKTİF</span>
              )}
            </div>
            <div style={{ fontSize: '12.5px', color: T.muted, marginTop: 3 }}>
              {subscription!.billing_period === 'yearly' ? 'Yıllık' : 'Aylık'} ·{' '}
              {subscription!.cancel_at_period_end
                ? <>Erişiminiz <b style={{ color: T.ink }}>{fmtDate(subscription!.expires_at)}</b> tarihine kadar devam edecek.</>
                : <>Aboneliğiniz <b style={{ color: T.ink }}>{fmtDate(subscription!.expires_at)}</b> tarihinde otomatik yenilenecek.</>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.04em', color: T.ink, lineHeight: 1 }}>
              ₺{fmt(subscription!.billing_period === 'yearly' ? currentPlan.yearly : currentPlan.monthly)}
            </div>
            <div style={{ fontSize: '11px', color: T.muted, marginTop: 2 }}>/ ay</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '18px 20px', background: T.surface2, border: `1px dashed ${T.border2}`, borderRadius: T.r, marginBottom: 26 }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, background: T.surface3, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles size={22} color={T.muted} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: T.ink }}>Aktif abonelik yok</div>
            <div style={{ fontSize: '12.5px', color: T.muted, marginTop: 3 }}>Aşağıdan size uygun planı seçerek aboneliğinizi başlatabilirsiniz.</div>
          </div>
        </div>
      )}

      {/* ── Plan kademeleri ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SectionTitle T={T}>{hasActiveSub ? 'Planlar' : 'Plan Seçin'}</SectionTitle>
        {/* Aylık / Yıllık */}
        <div style={{ display: 'flex', gap: 3, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999, padding: 3 }}>
          {(['monthly', 'yearly'] as Cycle[]).map((c) => (
            <button key={c} onClick={() => setCycle(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 700, background: cycle === c ? T.orange : 'transparent', color: cycle === c ? '#fff' : T.muted, transition: 'all .15s' }}>
              {c === 'monthly' ? 'Aylık' : 'Yıllık'}
              {c === 'yearly' && <span style={{ fontSize: '9.5px', fontWeight: 800, color: cycle === c ? '#fff' : green, background: cycle === c ? 'rgba(255,255,255,0.2)' : 'rgba(93,187,99,0.15)', padding: '1px 6px', borderRadius: 999 }}>%20</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 10 }}>
        {PLANS.map((p) => {
          const isCurrent = hasActiveSub && p.id === subscription!.plan;
          const isPending = pendingPlan === p.id;
          const price = cycle === 'monthly' ? p.monthly : p.yearly;
          // v1: aktif abonelik varken plan değişikliği checkout ile yapılmıyor (proration — Faz B)
          const locked = hasActiveSub && !isCurrent;
          return (
            <div key={p.id}
              style={{ position: 'relative', padding: '18px 16px 16px', background: T.surface, border: `1.5px solid ${isCurrent ? T.orange : T.border}`, borderRadius: T.r, boxShadow: isCurrent ? '0 0 0 3px rgba(255,90,31,0.1)' : T.shadowSm, transition: 'all .15s' }}>
              {p.popular && (
                <div style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', fontSize: '9.5px', fontWeight: 800, letterSpacing: '.06em', color: '#fff', background: T.orange, padding: '3px 11px', borderRadius: 999, whiteSpace: 'nowrap' }}>EN POPÜLER</div>
              )}
              <div style={{ fontSize: '15px', fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' }}>{p.name}</div>
              <div style={{ fontSize: '11px', color: T.muted, marginTop: 2, minHeight: 28 }}>{p.tagline}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8, marginBottom: 14 }}>
                <span style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.04em', color: T.ink }}>₺{fmt(price)}</span>
                <span style={{ fontSize: '12px', color: T.muted }}>/ ay</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {p.features.map((ft) => (
                  <div key={ft.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ft.soon
                      ? <span style={{ width: 14, flexShrink: 0 }} />
                      : <Check size={14} color={green} style={{ flexShrink: 0 }} />}
                    <span style={{ fontSize: '12px', color: ft.soon ? T.muted : T.ink }}>{ft.label}</span>
                    {ft.soon && (
                      <span style={{ fontSize: '9.5px', fontWeight: 800, color: T.orange, background: 'rgba(255,90,31,0.12)', padding: '1px 7px', borderRadius: 999, letterSpacing: '.04em', flexShrink: 0 }}>YAKINDA</span>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => { if (!isCurrent && !locked && !busy) onSelectPlan(p.id); }}
                disabled={isCurrent || locked || busy}
                title={locked ? 'Plan değişikliği için destek ekibiyle iletişime geçin' : undefined}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: T.rSm, border: `1px solid ${isCurrent || locked ? T.border : T.orange}`, cursor: isCurrent || locked || busy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700, background: isCurrent || locked ? T.surface2 : T.orange, color: isCurrent || locked ? T.muted : '#fff', transition: 'all .15s' }}>
                {isPending && <Loader2 size={13} className="animate-spin" />}
                {isCurrent ? 'Mevcut Plan' : locked ? 'Destek ile İletişime Geçin' : 'Bu Plana Geç'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Fiyatlar USD bazlı tutuluyor (Dodo sabit TL desteklemiyor) — kur notu */}
      <div style={{ fontSize: '11px', color: T.muted, marginBottom: 30, lineHeight: 1.5 }}>
        Fiyatlar TL karşılığı olarak gösterilmektedir; tahsilat, ödeme günündeki döviz kuruna göre TL olarak yapılır ve küçük farklılıklar gösterebilir.
      </div>

      {/* ── Ödeme yöntemi ── */}
      <SectionTitle T={T}>Ödeme Yöntemi</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: 30 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: T.surface3, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <CreditCard size={20} color={T.muted} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: T.ink }}>Güvenli ödeme</div>
          <div style={{ fontSize: '11.5px', color: T.muted, marginTop: 2 }}>Kart bilgileriniz Dodo Payments güvencesinde saklanır; ödeme sayfasında güncelleyebilirsiniz.</div>
        </div>
      </div>

      {/* ── Faturalar ── */}
      <SectionTitle T={T}>Faturalar</SectionTitle>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 30 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 12, padding: '11px 18px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
          {['Tarih', 'Tutar', 'Durum', 'İşlem'].map((h) => (
            <div key={h} style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: T.muted, textAlign: h === 'İşlem' ? 'right' : 'left' }}>{h}</div>
          ))}
        </div>
        {invoices.length === 0 && (
          <div style={{ padding: '20px 18px', fontSize: '12.5px', color: T.muted }}>Henüz fatura bulunmuyor.</div>
        )}
        {invoices.map((inv, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < invoices.length - 1 ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: T.ink }}>{fmtDate(inv.date)}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: T.ink }}>{inv.amount != null ? `₺${fmt(inv.amount)}` : '—'}</div>
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11.5px', fontWeight: 700, color: green, background: 'rgba(93,187,99,0.12)', padding: '3px 10px', borderRadius: 999 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: green }} /> Ödendi
              </span>
            </div>
            {inv.invoiceUrl ? (
              <a href={inv.invoiceUrl} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto', padding: '6px 11px', borderRadius: T.rXs, border: `1px solid ${T.border2}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
                <Download size={13} /> İndir
              </a>
            ) : <span />}
          </div>
        ))}
      </div>

      {/* ── Abonelik iptali ── */}
      {hasActiveSub && !subscription!.cancel_at_period_end && (
        <>
          <SectionTitle T={T}>Abonelik</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'rgba(224,112,112,0.05)', border: '1px solid rgba(224,112,112,0.18)', borderRadius: T.r }}>
            <ShieldCheck size={18} color="#E07070" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: T.ink }}>Aboneliği iptal et</div>
              <div style={{ fontSize: '11.5px', color: T.muted, marginTop: 2 }}>Dönem sonuna kadar erişiminiz devam eder; sonra aboneliğiniz sonlanır.</div>
            </div>
            <button onClick={async () => { if (await confirmDialog({ title: 'Abonelik iptal edilsin mi?', description: 'Dönem sonuna kadar erişiminiz devam eder.', danger: true, confirmLabel: 'İptal Et' })) cancelSubscription(); }}
              disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: T.rSm, border: 'none', background: '#E07070', color: '#fff', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700, flexShrink: 0, opacity: busy ? 0.7 : 1 }}>
              {busy && <Loader2 size={13} className="animate-spin" />} İptal Et
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SectionTitle({ children, T }: { children: React.ReactNode; T: any }) {
  return <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted, marginBottom: '14px' }}>{children}</div>;
}
