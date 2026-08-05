import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { apptPhase, DEFAULT_ARRIVAL_TOLERANCE_MIN } from '@/lib/appointmentFlow';
import { Search, CheckCircle2, XCircle, Clock, Trash2, Edit2, MessageCircle, MoreHorizontal, Plus, Stethoscope, ChevronDown, History } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useLabels } from '@/hooks/useLabels';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDateEU, todayISO } from '@/utils/date';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import { EmptyState } from '@/components/EmptyState';
import type { Reservation } from '@/types';

// ── Design tokens ──────────────────────────────────────────────────────────
const LT = {
  ink:     '#0E0E0E', cream:  '#F3EDE3', orange: '#FF5A1F',
  surface:  '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
  border:  'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)',
  muted:   'rgba(14,14,14,0.48)', muted2:  'rgba(14,14,14,0.30)',
  shadow:  '0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm:'0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  shadowLg:'0 4px 16px rgba(14,14,14,0.10),0 16px 48px rgba(14,14,14,0.10)',
  r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
  ink:     '#F3EDE3', cream:  '#0C0A08', orange: '#FF5A1F',
  surface:  '#111009', surface2: '#191610', surface3: '#231E18',
  border:  'rgba(243,237,227,0.08)', border2: 'rgba(243,237,227,0.20)',
  muted:   'rgba(243,237,227,0.45)', muted2:  'rgba(243,237,227,0.28)',
  shadow:  '0 2px 8px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.25)',
  shadowSm:'0 1px 3px rgba(0,0,0,0.2),0 2px 8px rgba(0,0,0,0.15)',
  shadowLg:'0 4px 16px rgba(0,0,0,0.4),0 16px 48px rgba(0,0,0,0.3)',
  r: '14px', rSm: '10px', rXs: '7px',
};

// Status badge config — light + dark variants
const L_RSB: Record<Reservation['status'], { label: string; style: React.CSSProperties }> = {
  confirmed: { label: 'Onaylı',     style: { background:'#E6F4EA', color:'#2E7D43', border:'1px solid rgba(46,125,67,0.18)' } },
  pending:   { label: 'Bekleyen',   style: { background:'#FCEFD6', color:'#A66A0E', border:'1px solid rgba(166,106,14,0.18)' } },
  completed: { label: 'Tamamlandı', style: { background:'#E8EFF9', color:'#2E6FB0', border:'1px solid rgba(46,111,176,0.18)' } },
  cancelled: { label: 'İptal',      style: { background:'#FCEAEA', color:'#C0392B', border:'1px solid rgba(192,57,43,0.18)', textDecoration:'line-through', opacity:0.75 } },
};
const D_RSB: Record<Reservation['status'], { label: string; style: React.CSSProperties }> = {
  confirmed: { label: 'Onaylı',     style: { background:'rgba(45,160,50,.16)',   color:'#7AD3A0', border:'1px solid rgba(122,211,160,0.2)' } },
  pending:   { label: 'Bekleyen',   style: { background:'rgba(255,90,31,0.14)',  color:'#FF7A45', border:'1px solid rgba(255,90,31,0.25)' } },
  completed: { label: 'Tamamlandı', style: { background:'rgba(46,111,176,0.14)', color:'#6EA8DD', border:'1px solid rgba(110,168,221,0.18)' } },
  cancelled: { label: 'İptal',      style: { background:'rgba(224,112,112,0.14)',color:'#e07070', border:'1px solid rgba(224,112,112,0.18)', textDecoration:'line-through', opacity:0.75 } },
};

type StatusFilter = 'all' | Reservation['status'];

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export const ReservationsPage = () => {
  const { reservations, updateReservation, deleteReservation, settings } = useReservations();
  const { t, sector } = useLabels();
  // Geç-kalma toleransı (dk) — Ayarlar'dan gelirse onu kullan, yoksa varsayılan 2s
  const toleranceMin = settings.arrivalToleranceMin ?? DEFAULT_ARRIVAL_TOLERANCE_MIN;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { dark } = useTheme();
  const T = dark ? DT : LT;
  const RSB = dark ? D_RSB : L_RSB;
  const svcDot: Record<Reservation['status'], string> = dark ? {
    pending:   '#FF5A1F',
    confirmed: 'rgba(243,237,227,0.4)',
    completed: 'rgba(243,237,227,0.28)',
    cancelled: 'rgba(243,237,227,0.18)',
  } : {
    pending:   '#FF5A1F',
    confirmed: 'rgba(14,14,14,0.35)',
    completed: 'rgba(14,14,14,0.30)',
    cancelled: 'rgba(14,14,14,0.18)',
  };

  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showPast, setShowPast]         = useState(false);
  const [showActions, setShowActions]   = useState<string | null>(null);
  const [menuPos, setMenuPos]           = useState({ top: 0, left: 0 });
  const actionBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuRef       = useRef<HTMLDivElement | null>(null);
  const [editReservation, setEditReservation] = useState<Reservation | null>(null);
  // Silme geri alınamaz (DB'den kalıcı siler) — menüde iki adımlı onay istenir
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // counts
  const counts = {
    all:       reservations.length,
    pending:   reservations.filter(r => r.status === 'pending').length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
    completed: reservations.filter(r => r.status === 'completed').length,
  };

  // close dropdown on outside click
  useEffect(() => {
    if (!showActions) return;
    const handler = (e: MouseEvent) => {
      const btn = actionBtnRefs.current[showActions];
      if (btn && btn.contains(e.target as Node)) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setShowActions(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActions]);

  // close dropdown on Escape
  useEffect(() => {
    if (!showActions) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowActions(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showActions]);

  const openActions = useCallback((id: string) => {
    setConfirmDelete(null);
    if (showActions === id) { setShowActions(null); return; }
    const btn = actionBtnRefs.current[id];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: rect.right - 168 });
    }
    setShowActions(id);
  }, [showActions]);

  const filtered = reservations.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        r.service.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Zaman gruplaması: Bugün / Yaklaşan / Geçmiş ──────────────────────────
  const todayStr = todayISO();
  const byTimeAsc  = (a: Reservation, b: Reservation) => a.startTime.localeCompare(b.startTime);
  const today    = filtered.filter(r => r.date === todayStr).sort(byTimeAsc);
  const upcoming = filtered.filter(r => r.date > todayStr)
    .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : byTimeAsc(a, b));
  const past     = filtered.filter(r => r.date < todayStr)
    .sort((a, b) => a.date !== b.date ? b.date.localeCompare(a.date) : byTimeAsc(b, a));

  // Filtre/arama aktifken geçmiş otomatik açılır (aksi halde her şey gizlenir)
  const pastForced = Boolean(search) || statusFilter !== 'all';
  const pastVisible = pastForced || showPast;

  // Başlık bağlam satırı — gerçek bugüne göre (filtreden bağımsız)
  const todayReal = reservations.filter(r => r.date === todayStr && r.status !== 'cancelled').sort(byTimeAsc);
  const nextToday = todayReal.find(r => r.status !== 'completed');
  const nextUpcoming = reservations.filter(r => r.date > todayStr && r.status !== 'cancelled')
    .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : byTimeAsc(a, b))[0];

  const handleStatusChange = (id: string, status: Reservation['status']) => {
    updateReservation(id, { status });
    setShowActions(null);
  };

  const openDentalVisit = (id: string) => {
    setShowActions(null);
    navigate(`/dental-visit/${encodeURIComponent(id)}`);
  };

  // ── Tek satır (mobil + masaüstü) — Bugün/Yaklaşan/Geçmiş gruplarında kullanılır
  const renderRow = (res: Reservation, isLast: boolean) => {
    const phase  = apptPhase(res, { toleranceMin });
    const badge  = RSB[res.status];
    // 'missed' türetilmiş — rozet metnini/rengini override et (DB'de status hâlâ confirmed)
    const missedBadgeStyle: React.CSSProperties = dark
      ? { background: 'rgba(224,112,112,0.14)', color: '#e79a9a', border: '1px solid rgba(224,112,112,0.18)' }
      : { background: '#FBECEC', color: '#B23B32', border: '1px solid rgba(178,59,50,0.18)' };
    const badgeStyle = phase === 'missed' ? missedBadgeStyle : badge.style;
    const badgeLabel = phase === 'missed' ? 'Gelmedi' : phase === 'inService' ? 'Hizmette' : badge.label;
    const av     = res.status === 'pending'
      ? { bg: T.orange, fg: dark ? '#0C0A08' : '#0E0E0E' }
      : { bg: dark ? '#231E18' : '#0E0E0E', fg: '#F3EDE3' };
    const rowOpacity = res.status === 'cancelled' ? 0.55 : phase === 'missed' ? 0.72 : 1;
    const isMenuOpen = showActions === res.id;

    if (isMobile) {
      return (
        <div key={res.id} role={sector === 'dis' ? 'button' : undefined} tabIndex={sector === 'dis' ? 0 : undefined}
          onClick={() => { if (sector === 'dis') openDentalVisit(res.id); else setEditReservation(res); }}
          onKeyDown={(event) => { if (sector === 'dis' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDentalVisit(res.id); } }}
          style={{
          display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 16px',
          borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
          opacity: rowOpacity, position: 'relative', cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: av.bg, color: av.fg, display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 800, flexShrink: 0 }}>{initials(res.customerName)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.customerName}</div>
                <div style={{ fontSize: '11px', color: T.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: '1px' }}>{res.customerPhone}</div>
              </div>
            </div>
            <button
              ref={el => { actionBtnRefs.current[res.id] = el; }}
              onClick={e => { e.stopPropagation(); openActions(res.id); }}
              style={{ width: 32, height: 32, borderRadius: T.rXs, display: 'grid', placeItems: 'center', color: T.muted, background: isMenuOpen ? T.surface2 : 'none', border: isMenuOpen ? `1px solid ${T.border2}` : '1px solid transparent', cursor: 'pointer', flexShrink: 0 }}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: T.ink }}>{formatDateEU(res.date)}</span>
              <span style={{ fontSize: '11.5px', color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{res.startTime}–{res.endTime}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 750, whiteSpace: 'nowrap', ...badgeStyle }}>{badgeLabel}</span>
              {res.status === 'completed' && <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: res.isPaid ? 'rgba(46,138,53,.12)' : 'rgba(192,57,43,.10)', color: res.isPaid ? (dark ? '#7CC47F' : '#2E8A35') : (dark ? '#e07070' : '#C0392B') }}>{res.isPaid ? 'Ödendi' : 'Ödenmedi'}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '12.5px', color: T.ink }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: svcDot[res.status] }} />
            <span>{res.service}</span>
            {res.staffName && <span style={{ color: T.muted }}>· {res.staffName}</span>}
          </div>
        </div>
      );
    }

    return (
      <div
        key={res.id}
        style={{
          display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1.4fr 1fr 110px 150px',
          alignItems: 'center', padding: '12px 18px',
          borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
          cursor: sector === 'dis' ? 'pointer' : 'default', transition: 'background .15s',
          opacity: rowOpacity, position: 'relative',
        }}
        role={sector === 'dis' ? 'button' : undefined}
        tabIndex={sector === 'dis' ? 0 : undefined}
        onClick={() => { if (sector === 'dis') openDentalVisit(res.id); else setEditReservation(res); }}
        onKeyDown={(event) => { if (sector === 'dis' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDentalVisit(res.id); } }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surface2; const btn = e.currentTarget.querySelector<HTMLElement>('.row-menu-btn'); if (btn) btn.style.opacity = '1'; }}
        onMouseLeave={e => { if (!isMenuOpen) { (e.currentTarget as HTMLElement).style.background = ''; const btn = e.currentTarget.querySelector<HTMLElement>('.row-menu-btn'); if (btn) btn.style.opacity = '0'; } }}
      >
        {/* Customer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: av.bg, color: av.fg, display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 800, flexShrink: 0, letterSpacing: '-0.01em' }}>
            {initials(res.customerName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 650, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.customerName}</span>
              {(res.reminder24hSent || res.reminder2hSent) && (
                <span title={[res.reminder24hSent ? '24h hatırlatma' : '', res.reminder2hSent ? '2h hatırlatma' : ''].filter(Boolean).join(' · ')} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '6px', background: 'rgba(255,90,31,0.08)', border: '1px solid rgba(255,90,31,0.18)', color: T.orange }}>
                  <MessageCircle size={10} />
                  <span style={{ fontSize: '9px', fontWeight: 800 }}>{res.reminder24hSent && res.reminder2hSent ? '24h+2h' : res.reminder24hSent ? '24h' : '2h'}</span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: T.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M5 2C4.4 2 4 2.5 3.5 3.5c-.5 1 0 3 1.5 4.5S8.5 11 9.5 10.5C10.5 10 11 9.5 11 9c0-.5-.5-1.5-1-1.5s-1 .5-1 .5c-.5 0-1.5-1-2-1.5S5.5 5.5 5.5 5c0-.5.5-1 .5-1.5 0-.5-1-1.5-1-1.5z" stroke="currentColor" strokeWidth="1.2"/></svg>
              {res.customerPhone}
            </div>
          </div>
        </div>

        {/* Date / Time */}
        <div>
          <div style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: T.ink }}>{formatDateEU(res.date)}</div>
          <div style={{ fontSize: '11px', color: T.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>{res.startTime}–{res.endTime}</div>
        </div>

        {/* Service */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: T.ink }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: svcDot[res.status] }} />
          {res.service}
        </div>

        {/* Staff */}
        <div style={{ fontSize: '12.5px', color: T.muted }}>{res.staffName || '—'}</div>

        {/* Status badge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 750, whiteSpace: 'nowrap', ...badgeStyle }}>
            {badgeLabel}
          </span>
          {res.status === 'completed' && (
            <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: res.isPaid ? 'rgba(46,138,53,.12)' : 'rgba(192,57,43,.10)', color: res.isPaid ? (dark ? '#7CC47F' : '#2E8A35') : (dark ? '#e07070' : '#C0392B') }}>{res.isPaid ? 'Ödendi' : 'Ödenmedi'}</span>
          )}
        </div>

        {/* Inline birincil aksiyon + menü */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          {(() => {
            if (phase === 'upcoming' && res.customerArrivedAt) {
              return (
                <span style={{ padding: '5px 10px', borderRadius: T.rXs, fontSize: '11px', fontWeight: 700, background: 'rgba(224,168,78,.14)', color: '#E0A84E', whiteSpace: 'nowrap' }}>
                  👋 Bekliyor
                </span>
              );
            }
            // Gelmedi: sadece geç gelen hastayı kurtaran ikincil "Geç Geldi" (turuncu değil)
            if (phase === 'missed') {
              return (
                <button onClick={e => { e.stopPropagation(); updateReservation(res.id, { customerArrivedAt: new Date().toISOString() }); }}
                  style={{ padding: '5px 11px', borderRadius: T.rXs, fontSize: '11.5px', fontWeight: 700, background: 'none', color: T.muted, border: `1px solid ${T.border2}`, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                  Geç Geldi
                </button>
              );
            }
            const act = phase === 'upcoming' ? { l: sector === 'dis' ? 'Hasta Geldi' : 'Müşteri Geldi', fn: () => { updateReservation(res.id, { customerArrivedAt: new Date().toISOString() }); } }
              : phase === 'inService' ? (sector === 'dis'
                ? { l: 'Muayeneyi Aç', fn: () => openDentalVisit(res.id) }
                : { l: 'Tamamla', fn: () => handleStatusChange(res.id, 'completed') })
              : null;
            return act ? (
              <button onClick={e => { e.stopPropagation(); act.fn(); }}
                style={{ padding: '5px 11px', borderRadius: T.rXs, fontSize: '11.5px', fontWeight: 700, background: T.orange, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                {act.l}
              </button>
            ) : null;
          })()}
          <button
            ref={el => { actionBtnRefs.current[res.id] = el; }}
            onClick={e => { e.stopPropagation(); openActions(res.id); }}
            className="row-menu-btn"
            style={{
              opacity: isMenuOpen ? 1 : 0,
              transition: 'opacity .15s',
              width: 28, height: 28, borderRadius: T.rXs,
              display: 'grid', placeItems: 'center',
              color: T.muted, background: isMenuOpen ? T.surface2 : 'none',
              border: isMenuOpen ? `1px solid ${T.border2}` : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>
    );
  };

  // Grup başlığı + satır listesi kartı
  const groupCard = (items: Reservation[]) => (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden', boxShadow: T.shadowSm }}>
      {items.map((res, i) => renderRow(res, i === items.length - 1))}
    </div>
  );

  const sectionHeader = (label: string, count: number, accent?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 9px' }}>
      <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.08em', color: accent ? T.orange : T.muted }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{ fontSize: '11px', color: T.muted2 }}>{count} {t('reservation').toLocaleLowerCase('tr')}</span>
    </div>
  );

  const anyResults = today.length + upcoming.length + past.length > 0;

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: T.surface, padding: '24px 28px 40px' }}>

      {/* ── Kompakt başlık + bağlam satırı ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 40, height: 40, background: dark ? '#231E18' : '#0E0E0E', borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="3" width="14" height="14" rx="2" stroke="#F3ECE0" strokeWidth="1.5"/>
              <path d="M7 8h6M7 12h4" stroke="#F3ECE0" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '21px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: T.ink }}>{t('reservations')}</div>
            <div style={{ fontSize: '12px', color: T.muted, marginTop: '3px' }}>
              {todayReal.length > 0 ? (
                <>Bugün <b style={{ color: T.ink, fontWeight: 700 }}>{todayReal.length}</b> {t('reservation').toLocaleLowerCase('tr')}{nextToday ? <> · sıradaki <b style={{ color: T.orange, fontWeight: 700 }}>{nextToday.startTime}</b> {nextToday.customerName}</> : ' · tümü tamamlandı'}</>
              ) : nextUpcoming ? (
                <>Bugün {t('reservation').toLocaleLowerCase('tr')} yok · yaklaşan <b style={{ color: T.ink, fontWeight: 700 }}>{formatDateEU(nextUpcoming.date)}</b> {nextUpcoming.customerName}</>
              ) : (
                <>{reservations.length} toplam {t('reservation').toLocaleLowerCase('tr')}</>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate('/calendar')}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: dark ? '#231E18' : '#0E0E0E', color: '#F3EDE3',
            border: `1px solid ${T.border2}`, borderRadius: T.rSm,
            padding: '9px 16px', fontSize: '13px', fontWeight: 650,
            cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em',
            transition: 'background .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = dark ? '#363028' : '#2a2a2a')}
          onMouseLeave={e => (e.currentTarget.style.background = dark ? '#231E18' : '#0E0E0E')}
        >
          <Plus size={13} strokeWidth={2.5} />
          {t('newReservation')}
        </button>
      </div>

      {/* ── Araç çubuğu: arama + durum çipleri ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '380px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted2, pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="İsim, telefon veya hizmet ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', background: T.surface,
              border: `1px solid ${T.border2}`, borderRadius: '999px',
              padding: '9px 14px 9px 36px', fontFamily: 'inherit',
              fontSize: '13px', color: T.ink, outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = T.orange; e.target.style.boxShadow = '0 0 0 3px rgba(255,90,31,0.08)'; }}
            onBlur={e  => { e.target.style.borderColor = T.border2; e.target.style.boxShadow = 'none'; }}
          />
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {([
            ['all', 'Tümü', counts.all],
            ['pending', 'Bekleyen', counts.pending],
            ['confirmed', 'Onaylı', counts.confirmed],
            ['completed', 'Tamamlandı', counts.completed],
          ] as [StatusFilter, string, number][]).map(([key, label, n]) => {
            const active = statusFilter === key;
            return (
              <button key={key} onClick={() => setStatusFilter(key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: active ? (dark ? '#231E18' : '#0E0E0E') : T.surface,
                  color: active ? '#F3EDE3' : T.muted,
                  border: `1px solid ${active ? 'transparent' : T.border2}`,
                  borderRadius: '999px', padding: '7px 13px', fontSize: '12px',
                  fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}>
                {label}
                {key !== 'all' && <span style={{ fontSize: '11px', fontWeight: 700, color: active ? (key === 'pending' ? T.orange : '#F3EDE3') : (key === 'pending' ? T.orange : T.muted2) }}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Gruplar: Bugün / Yaklaşan / Geçmiş ── */}
      {!anyResults ? (
        (search || statusFilter !== 'all') ? (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: T.shadowSm }}>
            <EmptyState T={T} icon={<Clock size={24} />} title="Sonuç bulunamadı"
              description="Arama veya filtre kriterlerinizi değiştirin"
              actionLabel="Filtreleri Temizle" onAction={() => { setSearch(''); setStatusFilter('all'); }} />
          </div>
        ) : (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: T.shadowSm }}>
            <EmptyState T={T} icon={<Clock size={24} />} title={`Henüz ${t('reservation').toLocaleLowerCase('tr')} yok`}
              description={`İlk ${t('reservation').toLocaleLowerCase('tr')} kaydını oluşturarak başla`}
              actionLabel={t('newReservation')} onAction={() => navigate('/calendar')} />
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {today.length > 0 && (
            <div>
              {sectionHeader(`BUGÜN · ${formatDateEU(todayStr)}`, today.length, true)}
              {groupCard(today)}
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              {sectionHeader('YAKLAŞAN', upcoming.length)}
              {groupCard(upcoming)}
            </div>
          )}
          {past.length > 0 && (
            pastVisible ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 9px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.08em', color: T.muted }}>GEÇMİŞ</span>
                  <span style={{ flex: 1, height: 1, background: T.border }} />
                  {!pastForced && (
                    <button onClick={() => setShowPast(false)} style={{ fontSize: '11px', fontWeight: 650, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Gizle</button>
                  )}
                  <span style={{ fontSize: '11px', color: T.muted2 }}>{past.length} {t('reservation').toLocaleLowerCase('tr')}</span>
                </div>
                {groupCard(past)}
              </div>
            ) : (
              <button onClick={() => setShowPast(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
                  padding: '13px 18px', color: T.muted, fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', boxShadow: T.shadowSm,
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={15} /> Geçmiş {t('reservations').toLocaleLowerCase('tr')} · {past.length} kayıt</span>
                <ChevronDown size={16} />
              </button>
            )
          )}
        </div>
      )}

      {/* ── Portal dropdown ── */}
      {showActions && (() => {
        const res = reservations.find(r => r.id === showActions);
        if (!res) return null;
        return createPortal(
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
            onClick={() => { setShowActions(null); setConfirmDelete(null); }}
          >
            <div
              ref={menuRef}
              style={{
                position: 'absolute', top: menuPos.top, left: menuPos.left,
                width: 168, background: T.surface, border: `1px solid ${T.border2}`,
                borderRadius: T.rSm, boxShadow: T.shadowLg, overflow: 'hidden',
                animation: 'modalIn .18s cubic-bezier(.22,.8,.2,1) both',
              }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { icon: <Edit2 size={13} color={T.orange} />, label: 'Düzenle', action: () => { setEditReservation(res); setShowActions(null); } },
                sector === 'dis' && { icon: <Stethoscope size={13} color={T.orange} />, label: 'Hasta Ziyaretini Aç', action: () => openDentalVisit(res.id) },
                res.status === 'pending' && { icon: <CheckCircle2 size={13} color={T.muted} />, label: 'Onayla', action: () => handleStatusChange(res.id, 'confirmed') },
                res.status === 'confirmed' && !res.customerArrivedAt && !res.arrivedAt && { icon: <CheckCircle2 size={13} color={T.muted} />, label: sector === 'dis' ? 'Hasta Geldi' : 'Müşteri Geldi', action: () => { updateReservation(res.id, { customerArrivedAt: new Date().toISOString() }); setShowActions(null); } },
                res.status === 'confirmed' && !res.arrivedAt && { icon: <Clock size={13} color={T.muted} />, label: sector === 'dis' ? 'Muayeneyi Başlat' : 'Hizmete Başla', action: async () => { const updated = await updateReservation(res.id, { arrivedAt: new Date().toISOString() }); setShowActions(null); if (updated && sector === 'dis') openDentalVisit(res.id); } },
                res.status !== 'completed' && sector !== 'dis' && { icon: <Clock size={13} color={T.muted} />, label: 'Tamamlandı', action: () => handleStatusChange(res.id, 'completed') },
                res.status !== 'cancelled' && { icon: <XCircle size={13} color={T.muted2} />, label: 'İptal Et', action: () => handleStatusChange(res.id, 'cancelled') },
              ].filter(Boolean).map((item, i) => item && (
                <button key={i} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 14px', fontSize: '12.5px', fontWeight: 500, color: T.ink, cursor: 'pointer', transition: 'background .12s', border: 'none', background: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {item.icon} {item.label}
                </button>
              ))}
              <div style={{ height: 1, background: T.border, margin: '3px 0' }} />
              <button
                onClick={() => {
                  if (confirmDelete !== res.id) { setConfirmDelete(res.id); return; }
                  deleteReservation(res.id);
                  setConfirmDelete(null);
                  setShowActions(null);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 14px', fontSize: '12.5px', fontWeight: confirmDelete === res.id ? 700 : 500, color: dark ? '#e07070' : '#C94040', cursor: 'pointer', transition: 'background .12s', border: 'none', background: confirmDelete === res.id ? (dark ? 'rgba(224,112,112,0.14)' : '#FBECEC') : 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.background = confirmDelete === res.id ? (dark ? 'rgba(224,112,112,0.2)' : '#F7DEDE') : T.surface2)}
                onMouseLeave={e => (e.currentTarget.style.background = confirmDelete === res.id ? (dark ? 'rgba(224,112,112,0.14)' : '#FBECEC') : 'none')}
              >
                <Trash2 size={13} /> {confirmDelete === res.id ? 'Emin misiniz? Kalıcı sil' : 'Sil'}
              </button>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* ── Edit Modal ── */}
      {editReservation && (
        <EditReservationModal
          reservation={editReservation}
          isOpen={!!editReservation}
          onClose={() => setEditReservation(null)}
        />
      )}

      <style>{`@keyframes modalIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
};
