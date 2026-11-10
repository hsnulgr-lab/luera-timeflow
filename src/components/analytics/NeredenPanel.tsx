import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLabels } from '@/hooks/useLabels';
import { useNeredenRaporu } from '@/hooks/useNeredenRaporu';
import { neredenLabel } from '@/lib/nereden';
import type { NeredenSatir } from '@/lib/neredenRapor';

// Analiz › Müşteriler nereden geliyor? (Kaynak Defteri, Aşama 1 — 135)
//
// Yalnız SAYI: kaç yeni müşteri nereden geldi, kaçı geldi, kaçı gelmedi.
// Reklama verilen para ve "1 TL kaç TL getirdi" burada YOK — o BrandFlow'un
// işi (karar 2026-11-01). Görünüm ProfitPanels ile aynı aile.

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

function satirAdi(key: NeredenSatir['key'], customersWord: string): string {
    if (key === 'geri_gelen') return `Geri gelen ${customersWord}`;
    if (key === 'belirtilmemis') return 'Belirtilmemiş';
    return neredenLabel(key);
}

export function NeredenPanel({ isMobile }: { isMobile: boolean }) {
    const { dark } = useTheme();
    const T = dark ? DT : LT;
    const { t } = useLabels();
    const navigate = useNavigate();
    const [days, setDays] = useState(30);
    const { rapor, loading, failed } = useNeredenRaporu(days);
    const customerWord = t('customer').toLocaleLowerCase('tr');
    const customersWord = t('customers').toLocaleLowerCase('tr');

    const cols = isMobile ? 'minmax(0,1.5fr) 1fr 0.7fr 0.7fr' : 'minmax(0,1.3fr) 1.6fr 0.7fr 0.7fr 0.7fr';
    const yeniSatirlar = rapor?.satirlar.filter((s) => s.key !== 'geri_gelen') ?? [];
    const geriGelen = rapor?.satirlar.find((s) => s.key === 'geri_gelen');
    const maxMusteri = Math.max(...yeniSatirlar.map((s) => s.musteri), 1);
    const yuzde = rapor?.bilinenOran == null ? null : Math.round(rapor.bilinenOran * 100);

    const num = { fontSize: '13px', fontWeight: 800, color: T.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;
    const head = { fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: T.muted } as const;

    const satir = (s: NeredenSatir) => {
        const geri = s.key === 'geri_gelen';
        const silik = geri || s.key === 'belirtilmemis';
        return (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: silik ? T.muted : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {satirAdi(s.key, customersWord)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                    <span style={{ ...num, minWidth: 22 }}>{s.musteri}</span>
                    {!isMobile && !geri && (
                        <span style={{ flex: 1, height: 6, borderRadius: 99, background: T.surface2, overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${(s.musteri / maxMusteri) * 100}%`, borderRadius: 99, background: silik ? T.muted2 : T.orange }} />
                        </span>
                    )}
                </span>
                {!isMobile && <span style={num}>{s.randevu}</span>}
                <span style={{ ...num, color: s.geldi ? T.green : T.muted2 }}>{s.geldi}</span>
                <span style={{ ...num, color: s.gelmedi ? T.red : T.muted2 }}>{s.gelmedi}</span>
            </div>
        );
    };

    return (
        <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: T.ink }}>{`${t('customers')} nereden geliyor?`}</div>
                    <div style={{ fontSize: '11px', color: T.muted, marginTop: '2px' }}>
                        Bu dönemde ilk kez kaydolan {customersWord}, nereden geldiklerine göre
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '2px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: '3px' }}>
                    {PERIODS.map((p) => {
                        const active = days === p.days;
                        return (
                            <button key={p.days} onClick={() => setDays(p.days)} aria-pressed={active}
                                style={{ padding: '5px 12px', borderRadius: T.rXs, border: `1px solid ${active ? T.border : 'transparent'}`, background: active ? T.surface : 'transparent', fontSize: '11.5px', fontWeight: active ? 700 : 600, color: active ? T.ink : T.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {p.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: T.shadowSm, padding: '18px 22px 14px' }}>
                {loading && !rapor ? (
                    <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: '12px', color: T.muted }}>Yükleniyor…</div>
                ) : failed ? (
                    <div style={{ padding: '26px 0', textAlign: 'center', fontSize: '12px', color: T.muted }}>Veri yüklenemedi. Sayfayı yenileyip tekrar deneyin.</div>
                ) : !rapor || (rapor.yeniToplam === 0 && !geriGelen) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '26px 0' }}>
                        <Info size={20} color={T.muted2} />
                        <div style={{ fontSize: '12px', color: T.muted, textAlign: 'center', maxWidth: 340, lineHeight: 1.5 }}>
                            Bu dönemde yeni {customerWord} yok.
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '12px', paddingBottom: '8px' }}>
                            <span style={head}>Nereden</span>
                            <span style={head}>{t('customer')}</span>
                            {!isMobile && <span style={{ ...head, textAlign: 'right' }}>Randevu</span>}
                            <span style={{ ...head, textAlign: 'right' }}>Geldi</span>
                            <span style={{ ...head, textAlign: 'right' }}>Gelmedi</span>
                        </div>
                        {rapor.satirlar.map(satir)}

                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '12px', fontSize: '11px', color: T.muted, lineHeight: 1.5 }}>
                            <Compass size={14} color={T.muted2} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>
                                Bu dönem <b style={{ color: T.ink }}>{rapor.yeniToplam}</b> yeni {customerWord}
                                {yuzde !== null && <> · nereden geldiği belli olan <b style={{ color: T.ink }}>%{yuzde}</b></>}
                                {rapor.kayitsiz > 0 && <> · kayıtsız {rapor.kayitsiz} randevu dahil değil</>}
                                {yuzde !== null && yuzde < 100 && (
                                    <>
                                        {'. '}Daha fazlasını bilmek için yeni {customerWord} açarken “Nereden geldi?” seçin ya da{' '}
                                        <button type="button" onClick={() => navigate('/settings/online-randevu')}
                                            style={{ padding: 0, border: 0, background: 'none', color: T.ink, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                                            hazır bağlantıları
                                        </button>
                                        {' '}Instagram ve Google profilinize koyun.
                                    </>
                                )}
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
