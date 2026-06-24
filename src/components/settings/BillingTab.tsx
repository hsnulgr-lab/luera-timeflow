import { useState } from 'react';
import { CreditCard, Check, Sparkles, Download, AlertCircle, ShieldCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

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

interface Plan { id: string; name: string; tagline: string; monthly: number; yearly: number; popular?: boolean; features: string[] }

const PLANS: Plan[] = [
  { id: 'baslangic', name: 'Başlangıç', tagline: 'Yeni başlayan işletmeler', monthly: 299, yearly: 239, features: ['1 şube', '3 personele kadar', 'Randevu & takvim', 'Online booking sayfası', 'Temel raporlar'] },
  { id: 'pro', name: 'Pro', tagline: 'Büyüyen salonlar için', monthly: 599, yearly: 479, popular: true, features: ['Sınırsız personel', 'WhatsApp hatırlatma', 'Kasa & tahsilat', 'Gelişmiş analiz', 'Müşteri paketleri', 'E-posta destek'] },
  { id: 'isletme', name: 'İşletme', tagline: 'Çoklu şube & yüksek hacim', monthly: 1199, yearly: 959, features: ['Çoklu şube yönetimi', 'API erişimi', 'Öncelikli destek', 'Özel raporlar', 'Rol & yetki yönetimi', 'Onboarding desteği'] },
];

// Placeholder — Dodo Payments bağlanınca gerçek verilerle değişir
const CURRENT_PLAN = 'pro';
const INVOICES = [
  { date: '7 Haz 2026', amount: 599, status: 'Ödendi' },
  { date: '7 May 2026', amount: 599, status: 'Ödendi' },
  { date: '7 Nis 2026', amount: 599, status: 'Ödendi' },
];

const fmt = (n: number) => n.toLocaleString('tr-TR');

export function BillingTab() {
  const { dark } = useTheme();
  const T = dark ? DT : LT;
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [selected, setSelected] = useState(CURRENT_PLAN);
  const current = PLANS.find((p) => p.id === CURRENT_PLAN)!;

  const soon = () => toast('Ödeme altyapısı (Dodo Payments) yakında bağlanacak', { icon: '🔌' });

  return (
    <div>
      {/* Tasarım önizleme uyarısı */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 15px', background: 'rgba(255,90,31,0.05)', border: '1px solid rgba(255,90,31,0.15)', borderRadius: T.rSm, marginBottom: 24 }}>
        <AlertCircle size={16} color={T.orange} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: '12px', color: T.muted, lineHeight: 1.5 }}>
          <b style={{ color: T.ink }}>Tasarım önizlemesi.</b> Plan, ödeme yöntemi ve faturalar örnek verilerdir; ödeme altyapısı (<b style={{ color: T.ink }}>Dodo Payments</b>) bağlandığında canlı çalışacaktır.
        </div>
      </div>

      {/* ── Mevcut plan ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '18px 20px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: 26 }}>
        <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(255,90,31,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Sparkles size={22} color={T.orange} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.02em', color: T.ink }}>{current.name} plan</span>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: T.orange, background: 'rgba(255,90,31,0.12)', padding: '2px 9px', borderRadius: 999, letterSpacing: '.04em' }}>AKTİF</span>
          </div>
          <div style={{ fontSize: '12.5px', color: T.muted, marginTop: 3 }}>Aylık · Aboneliğiniz <b style={{ color: T.ink }}>7 Tem 2026</b> tarihinde otomatik yenilenecek.</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.04em', color: T.ink, lineHeight: 1 }}>₺{fmt(current.monthly)}</div>
          <div style={{ fontSize: '11px', color: T.muted, marginTop: 2 }}>/ ay</div>
        </div>
      </div>

      {/* ── Plan kademeleri ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SectionTitle T={T}>Planı Değiştir</SectionTitle>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 30 }}>
        {PLANS.map((p) => {
          const isCurrent = p.id === CURRENT_PLAN;
          const isSel = p.id === selected;
          const price = cycle === 'monthly' ? p.monthly : p.yearly;
          return (
            <div key={p.id} onClick={() => setSelected(p.id)}
              style={{ position: 'relative', padding: '18px 16px 16px', background: T.surface, border: `1.5px solid ${isSel ? T.orange : T.border}`, borderRadius: T.r, cursor: 'pointer', boxShadow: isSel ? '0 0 0 3px rgba(255,90,31,0.1)' : T.shadowSm, transition: 'all .15s' }}>
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
                {p.features.map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check size={14} color={green} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: T.ink }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={(e) => { e.stopPropagation(); setSelected(p.id); if (!isCurrent) soon(); }}
                disabled={isCurrent}
                style={{ width: '100%', padding: '9px', borderRadius: T.rSm, border: `1px solid ${isCurrent ? T.border : isSel ? T.orange : T.border2}`, cursor: isCurrent ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700, background: isCurrent ? T.surface2 : isSel ? T.orange : 'transparent', color: isCurrent ? T.muted : isSel ? '#fff' : T.ink, transition: 'all .15s' }}>
                {isCurrent ? 'Mevcut Plan' : 'Bu Plana Geç'}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Ödeme yöntemi ── */}
      <SectionTitle T={T}>Ödeme Yöntemi</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: T.surface2, border: `1px dashed ${T.border2}`, borderRadius: T.r, marginBottom: 30 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: T.surface3, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <CreditCard size={20} color={T.muted} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: T.ink }}>Henüz ödeme yöntemi eklenmedi</div>
          <div style={{ fontSize: '11.5px', color: T.muted, marginTop: 2 }}>Dodo Payments ile kart eklendiğinde burada görünecek.</div>
        </div>
        <button onClick={soon}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: T.rSm, border: `1px solid ${T.border2}`, background: T.surface, color: T.ink, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 650, flexShrink: 0 }}>
          <Plus size={14} /> Kart Ekle
        </button>
      </div>

      {/* ── Faturalar ── */}
      <SectionTitle T={T}>Faturalar</SectionTitle>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 30 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 12, padding: '11px 18px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
          {['Tarih', 'Tutar', 'Durum', 'İşlem'].map((h) => (
            <div key={h} style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: T.muted, textAlign: h === 'İşlem' ? 'right' : 'left' }}>{h}</div>
          ))}
        </div>
        {INVOICES.map((inv, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < INVOICES.length - 1 ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: T.ink }}>{inv.date}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: T.ink }}>₺{fmt(inv.amount)}</div>
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11.5px', fontWeight: 700, color: green, background: 'rgba(93,187,99,0.12)', padding: '3px 10px', borderRadius: 999 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: green }} /> {inv.status}
              </span>
            </div>
            <button onClick={soon} style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto', padding: '6px 11px', borderRadius: T.rXs, border: `1px solid ${T.border2}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600 }}>
              <Download size={13} /> İndir
            </button>
          </div>
        ))}
      </div>

      {/* ── Abonelik iptali ── */}
      <SectionTitle T={T}>Abonelik</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'rgba(224,112,112,0.05)', border: '1px solid rgba(224,112,112,0.18)', borderRadius: T.r }}>
        <ShieldCheck size={18} color="#E07070" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: T.ink }}>Aboneliği iptal et</div>
          <div style={{ fontSize: '11.5px', color: T.muted, marginTop: 2 }}>Dönem sonuna kadar erişiminiz devam eder; sonra ücretsiz plana geçersiniz.</div>
        </div>
        <button onClick={() => { if (confirm('Aboneliği iptal etmek istediğinize emin misiniz?')) soon(); }}
          style={{ padding: '9px 16px', borderRadius: T.rSm, border: 'none', background: '#E07070', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700, flexShrink: 0 }}>
          İptal Et
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ children, T }: { children: React.ReactNode; T: any }) {
  return <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted, marginBottom: '14px' }}>{children}</div>;
}
