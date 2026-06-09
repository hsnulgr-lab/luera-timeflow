import { useMemo } from 'react';
import { TrendingUp, Users, Calendar, Clock, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useIsMobile } from '@/hooks/useIsMobile';

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const DAYS_TR   = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

// ── Design tokens ────────────────────────────────────────────────────────────
const T = {
  ink:      '#0E0E0E',
  cream:    '#F0EBE1',
  orange:   '#FF5A1F',
  orangeD:  '#E8430F',
  surface:  '#FAF7F3',
  surface2: '#F3EDE4',
  surface3: '#EDE6DB',
  border:   'rgba(14,14,14,0.08)',
  border2:  'rgba(14,14,14,0.14)',
  muted:    'rgba(14,14,14,0.45)',
  muted2:   'rgba(14,14,14,0.28)',
  shadow:   '0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  r:    '14px',
  rSm:  '10px',
};

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: T.shadowSm, ...style }}>
      {children}
    </div>
  );
}

// ── Section title ─────────────────────────────────────────────────────────────
function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted, marginBottom: '12px' }}>
      {children}
    </div>
  );
}

export const AnalyticsPage = () => {
  const { reservations } = useReservations();
  const isMobile = useIsMobile();

  const a = useMemo(() => {
    const now       = new Date();
    const today     = now.toISOString().slice(0, 10);
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

    const thisMonthRes = reservations.filter(r => r.date.startsWith(thisMonth));
    const lastMonthRes = reservations.filter(r => r.date.startsWith(lastMonth));

    const confirmed = reservations.filter(r => r.status === 'confirmed').length;
    const completed = reservations.filter(r => r.status === 'completed').length;
    const cancelled = reservations.filter(r => r.status === 'cancelled').length;
    const pending   = reservations.filter(r => r.status === 'pending').length;

    // Service distribution
    const svcMap = new Map<string, { count: number; color: string }>();
    reservations.forEach(r => {
      const ex = svcMap.get(r.service) || { count: 0, color: r.serviceColor || T.orange };
      svcMap.set(r.service, { count: ex.count + 1, color: ex.color });
    });
    const serviceDistribution = Array.from(svcMap.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.count - a.count);

    // Last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      const dateStr  = d.toISOString().slice(0, 10);
      const dayIndex = (d.getDay() + 6) % 7;
      return { date: dateStr, label: DAYS_TR[dayIndex], count: reservations.filter(r => r.date === dateStr && r.status !== 'cancelled').length };
    });

    // Monthly trend (last 6 months)
    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { month: m, label: MONTHS_TR[d.getMonth()], count: reservations.filter(r => r.date.startsWith(m) && r.status !== 'cancelled').length };
    });

    // Hour distribution
    const hourDist = Array.from({ length: 12 }, (_, i) => {
      const hour = i + 8;
      return { hour: `${String(hour).padStart(2, '0')}`, count: reservations.filter(r => parseInt(r.startTime) === hour && r.status !== 'cancelled').length };
    });

    // Day of week
    const dowDist = DAYS_TR.map((name, i) => ({
      name,
      count: reservations.filter(r => (new Date(r.date).getDay() + 6) % 7 === i && r.status !== 'cancelled').length,
    }));

    const totalNonCancelled = reservations.filter(r => r.status !== 'cancelled').length;
    const completionRate   = totalNonCancelled > 0 ? Math.round((completed / totalNonCancelled) * 100) : 0;
    const cancellationRate = reservations.length > 0 ? Math.round((cancelled / reservations.length) * 100) : 0;
    const growth = lastMonthRes.length > 0
      ? Math.round(((thisMonthRes.length - lastMonthRes.length) / lastMonthRes.length) * 100)
      : thisMonthRes.length > 0 ? 100 : 0;
    const uniqueCustomers = new Set(reservations.map(r => r.customerPhone)).size;

    // Busiest day
    const dayMap = new Map<string, number>();
    reservations.filter(r => r.status !== 'cancelled').forEach(r => dayMap.set(r.date, (dayMap.get(r.date) || 0) + 1));
    let busiestDay = '-', busiestCount = 0;
    dayMap.forEach((c, d) => { if (c > busiestCount) { busiestCount = c; busiestDay = new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); } });

    return { total: reservations.length, thisMonth: thisMonthRes.length, lastMonth: lastMonthRes.length, growth, confirmed, completed, cancelled, pending, completionRate, cancellationRate, serviceDistribution, last7Days, monthlyTrend, hourDist, dowDist, uniqueCustomers, busiestDay, busiestCount };
  }, [reservations]);

  const maxLast7   = Math.max(...a.last7Days.map(d => d.count), 1);
  const maxMonthly = Math.max(...a.monthlyTrend.map(d => d.count), 1);
  const maxHour    = Math.max(...a.hourDist.map(d => d.count), 1);
  const maxDow     = Math.max(...a.dowDist.map(d => d.count), 1);
  const totalSvc   = a.serviceDistribution.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: T.surface, padding: '24px 28px 40px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '13px', marginBottom: '24px' }}>
          <div style={{ width: 40, height: 40, background: T.ink, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <polyline points="2,16 7,10 11,13 18,5" stroke="#F3ECE0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 5h4v4" stroke="#F3ECE0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '21px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: T.ink }}>Analiz & Raporlar</div>
            <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '2px' }}>Performansınızı takip edin</div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '10px', marginBottom: '18px' }}>
          {/* Toplam Randevu */}
          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: T.surface2, display: 'grid', placeItems: 'center' }}>
                  <Calendar size={14} color={T.ink} />
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: a.growth > 0 ? 'rgba(93,187,99,0.12)' : a.growth < 0 ? 'rgba(201,64,64,0.1)' : T.surface2, color: a.growth > 0 ? '#4a9e50' : a.growth < 0 ? '#C94040' : T.muted }}>
                  {a.growth > 0 ? <ArrowUpRight size={10}/> : a.growth < 0 ? <ArrowDownRight size={10}/> : <Minus size={10}/>}
                  {Math.abs(a.growth)}%
                </span>
              </div>
              <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: T.muted, marginBottom: '4px' }}>Toplam Randevu</div>
              <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.04em', color: T.ink, lineHeight: 1 }}>{a.total}</div>
              <div style={{ fontSize: '10.5px', color: T.muted, marginTop: '6px', fontFamily: "'JetBrains Mono',monospace" }}>Bu ay: {a.thisMonth} · Geçen: {a.lastMonth}</div>
            </div>
          </Card>

          {/* Tekil Müşteri */}
          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: T.surface2, display: 'grid', placeItems: 'center' }}>
                  <Users size={14} color={T.ink} />
                </div>
              </div>
              <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: T.muted, marginBottom: '4px' }}>Tekil Müşteri</div>
              <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.04em', color: T.ink, lineHeight: 1 }}>{a.uniqueCustomers}</div>
              <div style={{ fontSize: '10.5px', color: T.muted, marginTop: '6px' }}>Farklı müşteri sayısı</div>
            </div>
          </Card>

          {/* Tamamlanma Oranı */}
          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(93,187,99,0.10)', display: 'grid', placeItems: 'center' }}>
                  <TrendingUp size={14} color="#4a9e50" />
                </div>
              </div>
              <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: T.muted, marginBottom: '4px' }}>Tamamlanma Oranı</div>
              <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.04em', color: T.ink, lineHeight: 1 }}>%{a.completionRate}</div>
              <div style={{ marginTop: '8px', height: 4, background: T.surface3, borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '999px', background: '#5DBB63', width: `${a.completionRate}%`, transition: 'width 1s cubic-bezier(.2,.8,.2,1)' }}/>
              </div>
            </div>
          </Card>

          {/* İptal Oranı */}
          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,90,31,0.08)', display: 'grid', placeItems: 'center' }}>
                  <Clock size={14} color={T.orange} />
                </div>
              </div>
              <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: T.muted, marginBottom: '4px' }}>İptal Oranı</div>
              <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.04em', color: a.cancellationRate > 20 ? T.orange : T.ink, lineHeight: 1 }}>%{a.cancellationRate}</div>
              <div style={{ marginTop: '8px', height: 4, background: T.surface3, borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '999px', background: T.orange, width: `${a.cancellationRate}%`, transition: 'width 1s cubic-bezier(.2,.8,.2,1)' }}/>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Charts row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

          {/* Son 7 Gün bar chart */}
          <Card style={{ padding: '20px 22px' }}>
            <SecTitle>Son 7 Gün</SecTitle>
            <div style={{ fontSize: '14px', fontWeight: 800, color: T.ink, marginBottom: '4px' }}>Günlük Randevu</div>
            <div style={{ fontSize: '11px', color: T.muted, marginBottom: '20px' }}>Son 7 günün dağılımı</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: 140 }}>
              {a.last7Days.map((day, i) => {
                const isToday = i === 6;
                const h = Math.max((day.count / maxLast7) * 100, 4);
                return (
                  <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%' }}>
                    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${h}%`, borderRadius: '5px 5px 0 0', background: isToday ? T.ink : T.surface3, transition: 'height .5s cubic-bezier(.2,.8,.2,1)', position: 'relative', overflow: 'hidden' }}>
                        {isToday && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${T.orange}, ${T.ink})`, opacity: 0.85 }}/>}
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: isToday ? T.ink : T.muted }}>{day.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
              {a.last7Days.map((day, i) => (
                <div key={day.date} style={{ flex: 1, textAlign: 'center', fontSize: '10px', fontWeight: 800, color: i === 6 ? T.ink : T.muted2 }}>{day.count}</div>
              ))}
            </div>
          </Card>

          {/* Hizmet Dağılımı */}
          <Card style={{ padding: '20px 22px', background: T.ink }}>
            <SecTitle><span style={{ color: 'rgba(240,235,225,0.45)' }}>Hizmet Dağılımı</span></SecTitle>
            <div style={{ fontSize: '14px', fontWeight: 800, color: T.cream, marginBottom: '18px' }}>
              {a.serviceDistribution.length} farklı hizmet
            </div>
            {a.serviceDistribution.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', gap: '8px' }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="13" stroke="rgba(240,235,225,0.2)" strokeWidth="1.5"/><path d="M16 10v6l4 2" stroke="rgba(240,235,225,0.35)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <div style={{ fontSize: '12px', color: 'rgba(240,235,225,0.35)' }}>Henüz veri yok</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {a.serviceDistribution.map(svc => {
                  const pct = Math.round((svc.count / totalSvc) * 100);
                  return (
                    <div key={svc.name}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: svc.color, flexShrink: 0 }}/>
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'rgba(240,235,225,0.8)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: T.cream }}>{svc.count}</span>
                          <span style={{ fontSize: '10px', color: 'rgba(240,235,225,0.35)' }}>%{pct}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: 'rgba(240,235,225,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '999px', background: svc.color, width: `${pct}%`, transition: 'width 1s cubic-bezier(.2,.8,.2,1)' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Bottom row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>

          {/* Aylık Trend */}
          <Card style={{ padding: '20px 22px' }}>
            <SecTitle>Aylık Trend</SecTitle>
            <div style={{ fontSize: '14px', fontWeight: 800, color: T.ink, marginBottom: '16px' }}>Son 6 Ay</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: 100 }}>
              {a.monthlyTrend.map((m, i) => {
                const isLast = i === 5;
                const h = Math.max((m.count / maxMonthly) * 100, 4);
                return (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%' }}>
                    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${h}%`, borderRadius: '4px 4px 0 0', background: isLast ? T.orange : T.surface3, transition: 'height .5s cubic-bezier(.2,.8,.2,1)' }}/>
                    </div>
                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: isLast ? T.ink : T.muted }}>{m.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              {a.monthlyTrend.map((m, i) => (
                <div key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: '9.5px', fontWeight: 800, color: i === 5 ? T.ink : T.muted2 }}>{m.count}</div>
              ))}
            </div>
          </Card>

          {/* Saat Dağılımı */}
          <Card style={{ padding: '20px 22px' }}>
            <SecTitle>Saat Dağılımı</SecTitle>
            <div style={{ fontSize: '14px', fontWeight: 800, color: T.ink, marginBottom: '16px' }}>En Yoğun Saatler</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 100 }}>
              {a.hourDist.map((h) => {
                const pct = Math.max((h.count / maxHour) * 100, 4);
                const isHot = h.count === maxHour && maxHour > 0;
                return (
                  <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', height: '100%' }}>
                    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${pct}%`, borderRadius: '3px 3px 0 0', background: isHot ? T.orange : T.surface3, transition: 'height .5s cubic-bezier(.2,.8,.2,1)' }}/>
                    </div>
                    <div style={{ fontSize: '7.5px', fontWeight: 700, color: T.muted2, fontFamily: "'JetBrains Mono',monospace" }}>{h.hour}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Gün Dağılımı */}
          <Card style={{ padding: '20px 22px' }}>
            <SecTitle>Gün Dağılımı</SecTitle>
            <div style={{ fontSize: '14px', fontWeight: 800, color: T.ink, marginBottom: '16px' }}>Haftalık Yoğunluk</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {a.dowDist.map(d => {
                const pct = maxDow > 0 ? Math.round((d.count / maxDow) * 100) : 0;
                const isMax = d.count === maxDow && maxDow > 0;
                return (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: T.muted, width: 28, flexShrink: 0 }}>{d.name}</span>
                    <div style={{ flex: 1, height: 6, background: T.surface3, borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '999px', background: isMax ? T.orange : T.ink, width: `${Math.max(pct, 2)}%`, transition: 'width 1s cubic-bezier(.2,.8,.2,1)' }}/>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: T.ink, width: 20, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{d.count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── Durum Özeti ── */}
        <Card style={{ padding: '20px 22px' }}>
          <SecTitle>Durum Özeti</SecTitle>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '10px' }}>
            {[
              { label:'Bekleyen',   count: a.pending,   dot: T.orange,               bg: 'rgba(255,90,31,0.07)',  border: 'rgba(255,90,31,0.18)' },
              { label:'Onaylı',     count: a.confirmed, dot: 'rgba(14,14,14,0.4)',    bg: T.surface2,              border: T.border },
              { label:'Tamamlandı', count: a.completed, dot: '#5DBB63',               bg: 'rgba(93,187,99,0.07)',  border: 'rgba(93,187,99,0.18)' },
              { label:'İptal',      count: a.cancelled, dot: 'rgba(14,14,14,0.18)',   bg: T.surface2,              border: T.border },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: T.rSm, background: s.bg, border: `1px solid ${s.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }}/>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.04em', color: T.ink, lineHeight: 1 }}>{s.count}</div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: T.muted, marginTop: '3px' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
};
