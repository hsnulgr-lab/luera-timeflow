import { useMemo, useState } from 'react';
import { Gauge, Coins, Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useStaff } from '@/hooks/useStaff';
import { useProducts } from '@/hooks/useProducts';
import { useLabels } from '@/hooks/useLabels';
import { serviceProfitability, staffProductivity, lastDaysRange } from '@/lib/profitability';

// Analiz → Kârlılık. Gider defteri İSTEMEYEN iki blok:
//   1) Uzman verimliliği — dolu saat başına ciro
//   2) Hizmet bazlı brüt kâr — tahsilat eksi reçete sarfı
//
// Salon sahibinin ilk sorduğu iki soru bunlar. Kira/maaş dahil NET kâr ayrı bir
// iş ve gider verisi her gün elle girilmedikçe yanlış rakam gösterir; bu yüzden
// başlıkta da metinde de bilerek "brüt" deniyor.

const LT = {
    ink: '#0E0E0E', surface: '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
    border: 'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)',
    muted: 'rgba(14,14,14,0.48)', muted2: 'rgba(14,14,14,0.30)',
    shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
    green: '#2D8F32', red: '#C94040', orange: '#FF5A1F',
    r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
    ink: '#F3EDE3', surface: '#111009', surface2: '#191610', surface3: '#231E18',
    border: 'rgba(243,237,227,0.10)', border2: 'rgba(243,237,227,0.22)',
    muted: 'rgba(243,237,227,0.55)', muted2: 'rgba(243,237,227,0.30)',
    shadowSm: '0 1px 3px rgba(0,0,0,0.20),0 2px 8px rgba(0,0,0,0.18)',
    green: '#7AD3A0', red: '#e07070', orange: '#FF5A1F',
    r: '14px', rSm: '10px', rXs: '7px',
};

const PERIODS = [
    { days: 30, label: '30 gün' },
    { days: 90, label: '90 gün' },
    { days: 365, label: '1 yıl' },
];

const money = (n: number) => `₺${n.toLocaleString('tr-TR')}`;
const hours = (min: number) => (min >= 60 ? `${Math.round(min / 60)} sa` : `${min} dk`);

export function ProfitPanels({ isMobile }: { isMobile: boolean }) {
    const { dark } = useTheme();
    const T = dark ? DT : LT;
    const { t } = useLabels();
    const { reservations, settings } = useReservations();
    const { payments } = usePayments();
    const { staff } = useStaff();
    const { products } = useProducts();
    const [days, setDays] = useState(30);

    const { byStaff, byService } = useMemo(() => {
        const ctx = {
            payments,
            reservations,
            services: settings.services || [],
            products,
            staff,
            range: lastDaysRange(days),
        };
        return { byStaff: staffProductivity(ctx), byService: serviceProfitability(ctx) };
    }, [payments, reservations, settings.services, products, staff, days]);

    const maxPerHour = Math.max(...byStaff.map((s) => s.perHour), 1);
    const maxGross = Math.max(...byService.map((s) => Math.abs(s.gross)), 1);

    const card = {
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: T.r, boxShadow: T.shadowSm, padding: '20px 22px',
    } as const;
    const secTitle = {
        fontSize: '9px', fontWeight: 800, letterSpacing: '.14em',
        textTransform: 'uppercase', color: T.muted, marginBottom: '12px',
    } as const;

    const empty = (text: string) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '30px 0' }}>
            <Info size={20} color={T.muted2} />
            <div style={{ fontSize: '12px', color: T.muted, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>{text}</div>
        </div>
    );

    return (
        <div style={{ marginBottom: '14px' }}>
            {/* Başlık + dönem seçici */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: T.ink }}>Kârlılık</div>
                    <div style={{ fontSize: '11px', color: T.muted, marginTop: '2px' }}>
                        Tahsil edilen tutar eksi malzeme — kira ve maaş dahil değildir
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '2px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: '3px' }}>
                    {PERIODS.map((p) => {
                        const active = days === p.days;
                        return (
                            <button key={p.days} onClick={() => setDays(p.days)}
                                style={{ padding: '5px 12px', borderRadius: T.rXs, border: `1px solid ${active ? T.border : 'transparent'}`, background: active ? T.surface : 'transparent', fontSize: '11.5px', fontWeight: active ? 700 : 600, color: active ? T.ink : T.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {p.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>

                {/* ── Uzman verimliliği ── */}
                <div style={card}>
                    <div style={secTitle}>{t('staffPlural')} Verimliliği</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                        <Gauge size={15} color={T.orange} />
                        <span style={{ fontSize: '14px', fontWeight: 800, color: T.ink }}>Dolu saat başına ciro</span>
                    </div>
                    <div style={{ fontSize: '11px', color: T.muted, marginBottom: '18px' }}>
                        Toplam ciro değil — çok çalışan doğal olarak öndedir, asıl soru saatin ne kazandırdığı
                    </div>

                    {byStaff.length === 0 ? empty(`Bu dönemde ${t('staff').toLocaleLowerCase('tr')} bazlı tahsilat yok. Randevulara ${t('staff').toLocaleLowerCase('tr')} atandıkça burası dolar.`) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                            {byStaff.map((s) => (
                                <div key={s.staffId}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '5px', gap: '8px' }}>
                                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                        <span style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '-0.02em', color: T.ink, flexShrink: 0 }}>
                                            {money(s.perHour)}<span style={{ fontSize: '10px', fontWeight: 700, color: T.muted }}>/sa</span>
                                        </span>
                                    </div>
                                    <div style={{ height: 5, background: T.surface3, borderRadius: '999px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: '999px', background: T.orange, width: `${Math.max((s.perHour / maxPerHour) * 100, 3)}%`, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: T.muted, marginTop: '4px' }}>
                                        {money(s.revenue)} · {hours(s.minutes)} dolu · {s.visits} {t('reservation').toLocaleLowerCase('tr')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Hizmet brüt kârı ── */}
                <div style={card}>
                    <div style={secTitle}>Hizmet Bazlı Brüt Kâr</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                        <Coins size={15} color={T.orange} />
                        <span style={{ fontSize: '14px', fontWeight: 800, color: T.ink }}>Hangi işlem ne bırakıyor</span>
                    </div>
                    <div style={{ fontSize: '11px', color: T.muted, marginBottom: '18px' }}>
                        Tahsilat eksi reçetedeki sarf malzemesi. Reçetesi olmayan hizmette maliyet ₺0 görünür
                    </div>

                    {byService.length === 0 ? empty('Bu dönemde randevuya bağlı tahsilat yok. Kasadan seans tahsil edildikçe burası dolar.') : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                            {byService.slice(0, 8).map((s) => (
                                <div key={s.name}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '5px', gap: '8px' }}>
                                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                        <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexShrink: 0 }}>
                                            <span style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '-0.02em', color: s.gross >= 0 ? T.ink : T.red }}>{money(s.gross)}</span>
                                            <span style={{ fontSize: '10px', fontWeight: 800, color: s.margin >= 50 ? T.green : s.margin > 0 ? T.muted : T.red }}>%{s.margin}</span>
                                        </span>
                                    </div>
                                    <div style={{ height: 5, background: T.surface3, borderRadius: '999px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: '999px', background: s.gross >= 0 ? T.green : T.red, width: `${Math.max((Math.abs(s.gross) / maxGross) * 100, 3)}%`, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: T.muted, marginTop: '4px' }}>
                                        {s.count} seans · {money(s.revenue)} ciro{s.cost > 0 ? ` · ${money(s.cost)} malzeme` : ''}
                                    </div>
                                </div>
                            ))}
                            {byService.length > 8 && (
                                <div style={{ fontSize: '11px', color: T.muted2 }}>…ve {byService.length - 8} hizmet daha</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
