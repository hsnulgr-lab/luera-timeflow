import { useState } from 'react';
import { Search, Phone, Mail, Plus, X, Trash2, Edit2, ChevronLeft, Package, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import { useCustomerPackages } from '@/hooks/useCustomerPackages';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/contexts/ThemeContext';
import { EmptyState } from '@/components/EmptyState';
import type { Customer } from '@/types';

// ── Design tokens ────────────────────────────────────────────────────────────
const LT = {
  ink:      '#0E0E0E', cream:    '#F3EDE3', orange:   '#FF5A1F',
  surface:  '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
  border:   'rgba(14,14,14,0.09)', border2:  'rgba(14,14,14,0.14)',
  muted:    'rgba(14,14,14,0.48)', muted2:   'rgba(14,14,14,0.30)',
  shadow:   '0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  shadowLg: '0 4px 16px rgba(14,14,14,0.10),0 16px 48px rgba(14,14,14,0.10)',
  r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
  ink:      '#F3EDE3', cream:    '#0C0A08', orange:   '#FF5A1F',
  surface:  '#111009', surface2: '#191610', surface3: '#231E18',
  border:   'rgba(243,237,227,0.08)', border2:  'rgba(243,237,227,0.20)',
  muted:    'rgba(243,237,227,0.45)', muted2:   'rgba(243,237,227,0.28)',
  shadow:   '0 2px 8px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.25)',
  shadowSm: '0 1px 3px rgba(0,0,0,0.2),0 2px 8px rgba(0,0,0,0.15)',
  shadowLg: '0 4px 16px rgba(0,0,0,0.4),0 16px 48px rgba(0,0,0,0.3)',
  r: '14px', rSm: '10px', rXs: '7px',
};

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

// ── Component ────────────────────────────────────────────────────────────────
export const CustomersPage = () => {
  const isMobile = useIsMobile();
  const { dark } = useTheme();
  const T = dark ? DT : LT;

  const statusDot: Record<string, string> = dark ? {
    confirmed: 'rgba(243,237,227,0.4)',
    pending:   '#FF5A1F',
    completed: 'rgba(243,237,227,0.28)',
    cancelled: 'rgba(243,237,227,0.18)',
  } : {
    confirmed: 'rgba(14,14,14,0.4)',
    pending:   '#FF5A1F',
    completed: 'rgba(14,14,14,0.30)',
    cancelled: 'rgba(14,14,14,0.18)',
  };

  const { customers, allCustomers, searchQuery, setSearchQuery, addCustomer, deleteCustomer, redeemLoyalty } = useCustomers();
  const { reservations, settings } = useReservations();
  const { forCustomer: pkgsForCustomer, addPackage, removePackage } = useCustomerPackages();
  const { totalForCustomer } = usePayments();
  const [selId, setSelId]         = useState<string | null>(null);
  const [showNew, setShowNew]     = useState(false);
  const [creatingCust, setCreatingCust] = useState(false);
  const [newCust, setNewCust]     = useState({ name:'', phone:'', email:'', notes:'' });
  const [pkgForm, setPkgForm]     = useState({ name:'', total:'10' });
  const [showPkgForm, setShowPkgForm] = useState(false);

  const selected    = allCustomers.find(c => c.id === selId) ?? null;
  const custHistory = selected
    ? reservations.filter(r => r.customerId === selected.id).sort((a,b) => b.date.localeCompare(a.date))
    : [];

  // ── Müşteri Yaşam Boyu Değeri (LTV) ──
  // Gerçek tahsilat (Kasa) varsa onu kullan; yoksa tamamlanan randevuların
  // hizmet fiyatından tahmin et (kasaya geçilmeden önceki kayıtlar için fallback).
  const priceOf = (svcName: string) => settings.services.find(s => s.name === svcName)?.price || 0;
  const realSpent = selected ? totalForCustomer(selected.id) : 0;
  const estSpent = custHistory.filter(r => r.status === 'completed').reduce((sum, r) => sum + priceOf(r.service), 0);
  const ltvSpent = realSpent > 0 ? realSpent : estSpent;
  const ltvMonths = selected?.createdAt
    ? Math.max(0, Math.round((Date.now() - new Date(selected.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)))
    : 0;
  const ltvSource = (() => {
    if (custHistory.some(r => r.source === 'leadflow')) return { lbl: 'LeadFlow', color: '#8E70B2' };
    if (custHistory.some(r => r.source === 'booking'))  return { lbl: 'Online Booking', color: '#FF5A1F' };
    return null;
  })();

  // ── No-show riski (iptal geçmişinden) ──
  const noShowRisk = (() => {
    const cancelled = custHistory.filter(r => r.status === 'cancelled').length;
    const completed = custHistory.filter(r => r.status === 'completed').length;
    const decided = cancelled + completed;
    if (decided < 2) return null;
    const rate = cancelled / decided;
    if (cancelled >= 2 && rate >= 0.5)  return { lvl: 'Yüksek', color: '#C94040', rate };
    if (cancelled >= 1 && rate >= 0.34) return { lvl: 'Orta',   color: '#E8973C', rate };
    return null;
  })();

  // ── Paketler ──
  const selPackages    = selected ? pkgsForCustomer(selected.id) : [];
  const totalRemaining = selPackages.reduce((sum, p) => sum + (p.totalSessions - p.usedSessions), 0);
  const handleAddPkg = async () => {
    if (!selected || !pkgForm.name.trim()) return;
    const total = parseInt(pkgForm.total) || 0;
    if (total < 1) { toast.error('Seans sayısı en az 1 olmalı'); return; }
    const ok = await addPackage(selected.id, pkgForm.name.trim(), total);
    if (ok) { setPkgForm({ name:'', total:'10' }); setShowPkgForm(false); toast.success('Paket eklendi'); }
  };

  const handleCreate = async () => {
    if (!newCust.name || !newCust.phone || creatingCust) return;
    setCreatingCust(true);
    await addCustomer(newCust);
    setCreatingCust(false);
    setShowNew(false);
    setNewCust({ name:'', phone:'', email:'', notes:'' });
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden', background:T.surface, padding:'24px 28px 0' }}>

      {/* ── Page header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px', flexWrap:'wrap', gap:'10px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'13px' }}>
          <div style={{ width:40, height:40, background: dark ? '#231E18' : '#0E0E0E', borderRadius:'10px', display:'grid', placeItems:'center', flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="#F3ECE0" strokeWidth="1.5"/>
              <path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="#F3ECE0" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:'21px', fontWeight:800, letterSpacing:'-0.03em', lineHeight:1.1, color:T.ink }}>Müşteriler</div>
            <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'2px' }}>{allCustomers.length} müşteri</div>
          </div>
        </div>
        <button onClick={()=>setShowNew(true)}
          style={{ display:'flex', alignItems:'center', gap:'7px', background: dark ? '#231E18' : '#0E0E0E', color:'#F3EDE3', border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'9px 16px', fontSize:'13px', fontWeight:650, cursor:'pointer', fontFamily:'inherit', transition:'background .15s' }}
          onMouseEnter={e=>(e.currentTarget.style.background= dark ? '#363028' : '#2a2a2a')}
          onMouseLeave={e=>(e.currentTarget.style.background= dark ? '#231E18' : '#0E0E0E')}>
          <Plus size={13} strokeWidth={2.5}/> Yeni Müşteri
        </button>
      </div>

      {/* ── Split layout ── */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', gap:0, flex:1, minHeight:0, overflow:'hidden', background:T.surface, border:`1px solid ${T.border}`, borderRadius:`${T.r} ${T.r} 0 0`, boxShadow:T.shadowSm }}>

        {/* ── LIST column ── */}
        <div style={{ display: (isMobile && selected) ? 'none' : 'flex', flexDirection:'column', borderRight: isMobile ? 'none' : `1px solid ${T.border}`, overflow:'hidden' }}>
          {/* Search */}
          <div style={{ padding:'14px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ position:'relative' }}>
              <Search size={14} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:T.muted2, pointerEvents:'none' }}/>
              <input type="text" placeholder="İsim, telefon veya e-posta ara..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.rSm, padding:'9px 14px 9px 34px', fontFamily:'inherit', fontSize:'13px', color:T.ink, outline:'none', transition:'all .15s' }}
                onFocus={e=>{e.target.style.borderColor=T.orange;e.target.style.background=T.surface;e.target.style.boxShadow='0 0 0 3px rgba(255,90,31,0.07)'}}
                onBlur={e=>{e.target.style.borderColor=T.border;e.target.style.background=T.surface2;e.target.style.boxShadow='none'}}/>
            </div>
          </div>

          {/* List body */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {customers.length === 0 ? (
              searchQuery ? (
                <EmptyState T={T} icon={<Search size={22} />} title="Müşteri bulunamadı"
                  description="Aramanızla eşleşen müşteri yok"
                  actionLabel="Aramayı Temizle" onAction={() => setSearchQuery('')} />
              ) : (
                <EmptyState T={T} icon={<Search size={22} />} title="Henüz müşteri yok"
                  description="İlk müşterini ekleyerek başla"
                  actionLabel="Yeni Müşteri" onAction={() => setShowNew(true)} />
              )
            ) : (
              customers.map(cust => {
                const isSel  = selId === cust.id;
                const newC   = isNew(cust.createdAt);
                const avBg   = newC ? T.orange : (dark ? '#231E18' : '#0E0E0E');
                const avFg   = newC ? (dark ? '#0C0A08' : '#0E0E0E') : '#F3EDE3';
                const badge  = cust.totalReservations === 0 ? 'zero' : cust.totalReservations >= 3 ? 'hot' : '';
                return (
                  <div key={cust.id} onClick={()=>setSelId(isSel ? null : cust.id)}
                    style={{ display:'flex', alignItems:'center', gap:'12px', padding:'13px 16px', paddingLeft: isSel ? '13px' : '16px', borderLeft: isSel ? `3px solid ${T.orange}` : '3px solid transparent', borderBottom:`1px solid ${T.border}`, cursor:'pointer', transition:'background .15s', background: isSel ? T.surface2 : 'transparent' }}
                    onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background=T.surface2}}
                    onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent'}}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:avBg, color:avFg, display:'grid', placeItems:'center', fontSize:'13px', fontWeight:800, flexShrink:0, letterSpacing:'-0.01em' }}>{initials(cust.name)}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13.5px', fontWeight:650, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cust.name}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'3px' }}>
                        <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10.5px', color:T.muted, fontFamily:"'JetBrains Mono',monospace", maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          <Phone size={9}/>{cust.phone}
                        </span>
                        {cust.email && (
                          <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10.5px', color:T.muted, fontFamily:"'JetBrains Mono',monospace", maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            <Mail size={9}/>{cust.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px', flexShrink:0 }}>
                      <span style={{ background: badge==='hot'?T.orange : badge==='zero'?T.surface3 : (dark?'#231E18':'#0E0E0E'), color: badge==='hot'?(dark?'#0C0A08':'#0E0E0E') : badge==='zero'?T.muted : '#F3EDE3', fontSize:'9px', fontWeight:800, padding:'3px 7px', borderRadius:'999px', minWidth:28, textAlign:'center' }}>
                        {cust.totalReservations} randevu
                      </span>
                      {newC && <span style={{ fontSize:'8.5px', fontWeight:800, color:T.orange, letterSpacing:'.06em', textTransform:'uppercase' }}>YENİ</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{ padding:'10px 16px', borderTop:`1px solid ${T.border}`, fontSize:'10.5px', color:T.muted, flexShrink:0, display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 5v3.5l2 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            {customers.length} müşteri listeleniyor
          </div>
        </div>

        {/* ── DETAIL panel ── */}
        <div style={{ display: (isMobile && !selected) ? 'none' : 'flex', flexDirection:'column', overflow:'hidden' }}>
          {!selected ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px', background: dark ? '#231E18' : '#0E0E0E', padding:'40px' }}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="20" r="12" stroke="#F3EDE3" strokeWidth="2" opacity=".35"/>
                <path d="M8 48c0-11 9-20 20-20s20 9 20 20" stroke="#F3EDE3" strokeWidth="2" strokeLinecap="round" opacity=".35"/>
              </svg>
              <div>
                <div style={{ fontSize:'14px', fontWeight:700, color:'#F3EDE3', opacity:.65, textAlign:'center' }}>Müşteri Seçin</div>
                <div style={{ fontSize:'12px', color:'#F3EDE3', opacity:.38, textAlign:'center', lineHeight:1.55, maxWidth:180, margin:'2px auto 0' }}>Detayları görmek için listeden bir müşteri seçin</div>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', overflow:'hidden', flex:1 }}>
              {/* Detail header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.surface }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', minWidth:0 }}>
                  {isMobile && (
                    <button onClick={()=>setSelId(null)} title="Geri" style={{ width:30, height:30, borderRadius:T.rXs, display:'grid', placeItems:'center', border:`1px solid ${T.border}`, background:'none', cursor:'pointer', color:T.ink, flexShrink:0 }}>
                      <ChevronLeft size={16}/>
                    </button>
                  )}
                  <div style={{ fontSize:'12.5px', fontWeight:750, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{selected.name}</div>
                </div>
                <div style={{ display:'flex', gap:'6px' }}>
                  {[
                    { icon:<Edit2 size={12}/>, title:'Düzenle', action:()=>{}, danger:false },
                    { icon:<Trash2 size={12}/>, title:'Sil', action:()=>{ deleteCustomer(selected.id); setSelId(null); }, danger:true },
                  ].map((btn,i)=>(
                    <button key={i} title={btn.title} onClick={btn.action}
                      style={{ width:28, height:28, borderRadius:T.rXs, display:'grid', placeItems:'center', border:`1px solid ${T.border}`, background:'none', cursor:'pointer', color:T.muted, transition:'all .15s' }}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=btn.danger?'rgba(201,64,64,0.08)':T.surface2;(e.currentTarget as HTMLElement).style.color=btn.danger?(dark?'#e07070':'#C94040'):T.ink;(e.currentTarget as HTMLElement).style.borderColor=btn.danger?'rgba(201,64,64,0.3)':T.border2}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none';(e.currentTarget as HTMLElement).style.color=T.muted;(e.currentTarget as HTMLElement).style.borderColor=T.border}}>
                      {btn.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{ flex:1, overflowY:'auto', background:T.surface }}>
                {/* Hero */}
                <div style={{ padding:'26px 22px 18px', display:'flex', alignItems:'center', gap:'16px', borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ width:54, height:54, borderRadius:'50%', background: dark ? '#231E18' : '#0E0E0E', color:'#F3EDE3', display:'grid', placeItems:'center', fontSize:'19px', fontWeight:900, flexShrink:0 }}>{initials(selected.name)}</div>
                  <div>
                    <div style={{ fontSize:'17px', fontWeight:800, letterSpacing:'-0.02em', lineHeight:1.1, color:T.ink }}>{selected.name}</div>
                    <div style={{ fontSize:'12px', color:T.muted, marginTop:'4px' }}>{selected.lastVisit ? `Son ziyaret: ${selected.lastVisit}` : 'Henüz ziyaret yok'}</div>
                  </div>
                </div>

                {/* Müşteri Değeri (LTV) */}
                <div style={{ padding:'16px 22px', borderBottom:`1px solid ${T.border}`, background: dark ? 'rgba(255,90,31,0.06)' : 'rgba(255,90,31,0.04)' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                    <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted }}>Müşteri Değeri</div>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', justifyContent:'flex-end' }}>
                      {noShowRisk && (
                        <span title={`İptal oranı %${Math.round(noShowRisk.rate*100)}`} style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'10px', fontWeight:700, color:noShowRisk.color, background:`${noShowRisk.color}1A`, borderRadius:999, padding:'3px 9px' }}>
                          ⚠ {noShowRisk.lvl} no-show riski
                        </span>
                      )}
                      {ltvSource && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'10px', fontWeight:700, color:ltvSource.color, background:`${ltvSource.color}1A`, borderRadius:999, padding:'3px 9px' }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:ltvSource.color }}/> {ltvSource.lbl}'dan geldi
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:'8px' }}>
                    <span style={{ fontSize:'26px', fontWeight:900, letterSpacing:'-0.04em', color:T.orange }}>{ltvSpent.toLocaleString('tr-TR')} ₺</span>
                    <span style={{ fontSize:'11px', color:T.muted }}>toplam harcama</span>
                  </div>
                  <div style={{ display:'flex', gap:'16px', marginTop:'8px', fontSize:'11.5px', color:T.muted, flexWrap:'wrap' }}>
                    <span>{ltvMonths > 0 ? `${ltvMonths} aydır müşteri` : 'Yeni müşteri'}</span>
                    <span>·</span>
                    <span>{custHistory.filter(r=>r.status==='completed').length} tamamlanan randevu</span>
                    {totalRemaining > 0 && <><span>·</span><span style={{ color:T.orange, fontWeight:700 }}>{totalRemaining} seans hakkı</span></>}
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:`1px solid ${T.border}` }}>
                  {[
                    { val:selected.totalReservations, lbl:'Toplam' },
                    { val:custHistory.filter(r=>r.status==='completed').length, lbl:'Tamamlanan' },
                    { val:custHistory.filter(r=>r.status==='cancelled').length, lbl:'İptal' },
                  ].map((s,i)=>(
                    <div key={i} style={{ padding:'14px 16px', textAlign:'center', borderRight:i<2?`1px solid ${T.border}`:'none' }}>
                      <div style={{ fontSize:'21px', fontWeight:900, letterSpacing:'-0.04em', color:T.ink }}>{s.val}</div>
                      <div style={{ fontSize:'9px', fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:T.muted, marginTop:'3px' }}>{s.lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Sadakat kartı */}
                {settings.loyaltyEnabled && (() => {
                  const thr = settings.loyaltyThreshold ?? 10;
                  const stamps = selected.loyaltyStamps ?? 0;
                  const inCard = stamps % thr;
                  const ready = stamps >= thr;
                  return (
                    <div style={{ padding:'16px 22px', borderBottom:`1px solid ${T.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'11px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted }}>
                          <Gift size={11}/> Sadakat Kartı
                        </div>
                        <span style={{ fontSize:'11px', fontWeight:700, color:ready?T.orange:T.muted, fontFamily:"'JetBrains Mono',monospace" }}>{ready?`${Math.floor(stamps/thr)} ödül hazır`:`${inCard}/${thr}`}</span>
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom: ready?'11px':0 }}>
                        {Array.from({length:thr}).map((_,i)=>{
                          const filled = i < (ready ? thr : inCard);
                          return <div key={i} style={{ width:24, height:24, borderRadius:'50%', display:'grid', placeItems:'center', background:filled?'rgba(255,90,31,0.14)':T.surface2, border:`1.5px solid ${filled?T.orange:T.border2}` }}>
                            {filled ? <Gift size={11} color={T.orange}/> : <span style={{ fontSize:'9px', color:T.muted2, fontWeight:700 }}>{i+1}</span>}
                          </div>;
                        })}
                      </div>
                      {ready && (
                        <button onClick={()=>redeemLoyalty(selected.id, thr)}
                          style={{ width:'100%', padding:'9px', borderRadius:T.rSm, border:'none', background:T.orange, color:'#fff', fontSize:'12.5px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          <Gift size={13}/> Ödülü Kullan ({settings.loyaltyReward || 'Ücretsiz hizmet'})
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Contact */}
                <div style={{ padding:'16px 22px', borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'10px' }}>İletişim</div>
                  {[{k:'Telefon',v:selected.phone},{k:'E-posta',v:selected.email||'—'},{k:'Kayıt',v:selected.createdAt?.slice(0,10)||'—'}].map((row,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 0', borderBottom:i<2?`1px solid ${T.border}`:'none' }}>
                      <span style={{ fontSize:'10.5px', fontWeight:700, color:T.muted, width:64, flexShrink:0 }}>{row.k}</span>
                      <span style={{ fontSize:'12px', fontWeight:600, fontFamily:"'JetBrains Mono',monospace", color:T.ink }}>{row.v}</span>
                    </div>
                  ))}
                </div>

                {/* Paketler */}
                <div style={{ padding:'16px 22px', borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted }}>
                      <Package size={11}/> Paketler
                    </div>
                    <button onClick={()=>setShowPkgForm(v=>!v)} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'4px 9px', borderRadius:T.rXs, border:`1px solid ${T.border2}`, background:'none', fontSize:'11px', fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:'inherit' }}>
                      <Plus size={11}/> Paket
                    </button>
                  </div>

                  {showPkgForm && (
                    <div style={{ display:'flex', gap:'6px', marginBottom:'10px' }}>
                      <input value={pkgForm.name} onChange={e=>setPkgForm(p=>({...p,name:e.target.value}))} placeholder="Paket adı (örn. 10 Seans Lazer)"
                        style={{ flex:1, minWidth:0, padding:'7px 9px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'11.5px', fontFamily:'inherit', color:T.ink, background:T.surface2, outline:'none' }}/>
                      <input value={pkgForm.total} onChange={e=>setPkgForm(p=>({...p,total:e.target.value.replace(/\D/g,'')}))} placeholder="10" inputMode="numeric"
                        style={{ width:'48px', padding:'7px 9px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'11.5px', fontFamily:'inherit', color:T.ink, background:T.surface2, outline:'none', textAlign:'center' }}/>
                      <button onClick={handleAddPkg} disabled={!pkgForm.name.trim()}
                        style={{ width:30, height:30, flexShrink:0, borderRadius:T.rXs, display:'grid', placeItems:'center', border:'none', background:pkgForm.name.trim()?(dark?'#231E18':'#0E0E0E'):T.surface3, color:pkgForm.name.trim()?'#F3EDE3':T.muted2, cursor:pkgForm.name.trim()?'pointer':'not-allowed' }}>
                        <Plus size={14} strokeWidth={2.5}/>
                      </button>
                    </div>
                  )}

                  {selPackages.length > 0 ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                      {selPackages.map(p=>{
                        const remaining = p.totalSessions - p.usedSessions;
                        const pct = Math.round((p.usedSessions / p.totalSessions) * 100);
                        const done = remaining <= 0;
                        return (
                          <div key={p.id} style={{ background:T.surface2, borderRadius:T.rSm, padding:'10px 12px' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', marginBottom:'7px' }}>
                              <span style={{ fontSize:'12.5px', fontWeight:700, color:T.ink }}>{p.name}</span>
                              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                                <span style={{ fontSize:'11.5px', fontWeight:700, color:done?T.muted2:T.orange }}>{done?'Bitti':`${remaining}/${p.totalSessions} kaldı`}</span>
                                <button onClick={()=>removePackage(p.id)} title="Kaldır" style={{ width:20, height:20, borderRadius:T.rXs, display:'grid', placeItems:'center', border:'none', background:'none', cursor:'pointer', color:T.muted2 }}>
                                  <X size={11}/>
                                </button>
                              </div>
                            </div>
                            <div style={{ height:5, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background:done?T.muted2:T.orange, borderRadius:999, transition:'width .5s' }}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : !showPkgForm && (
                    <div style={{ fontSize:'11.5px', color:T.muted2 }}>Paket yok</div>
                  )}
                </div>

                {/* History */}
                {custHistory.length > 0 && (
                  <div style={{ padding:'16px 22px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'10px' }}>Randevu Geçmişi</div>
                    {custHistory.slice(0,8).map((r,i,arr)=>(
                      <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'9px 0', borderBottom:i<arr.length-1?`1px solid ${T.border}`:'none' }}>
                        <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background:statusDot[r.status]||T.muted2 }}/>
                        <div style={{ fontSize:'12.5px', fontWeight:650, flex:1, color:T.ink }}>{r.service}</div>
                        <div style={{ fontSize:'10px', color:T.muted, fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>{r.date} · {r.startTime}–{r.endTime}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes */}
                {selected.notes && (
                  <div style={{ padding:'16px 22px' }}>
                    <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'10px' }}>Not</div>
                    <div style={{ background:T.surface2, borderRadius:T.rSm, padding:'11px 13px', fontSize:'12.5px', lineHeight:1.6, color:T.muted, fontStyle:'italic' }}>{selected.notes}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Customer Modal ── */}
      {showNew && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background: dark ? 'rgba(0,0,0,0.6)' : 'rgba(14,14,14,0.4)', backdropFilter:'blur(4px)' }} onClick={()=>setShowNew(false)}>
          <div style={{ background:T.surface, borderRadius:'20px', padding:'28px', width:440, maxWidth:'90vw', boxShadow:T.shadowLg, animation:'modalIn .3s cubic-bezier(.22,.8,.2,1) both', border:`1px solid ${T.border2}` }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'22px' }}>
              <div style={{ fontSize:'17px', fontWeight:800, letterSpacing:'-0.02em', color:T.ink }}>Yeni Müşteri</div>
              <button onClick={()=>setShowNew(false)} style={{ width:32, height:32, borderRadius:T.rXs, display:'grid', placeItems:'center', color:T.muted, border:'none', background:'none', cursor:'pointer' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=T.surface2}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none'}}>
                <X size={16}/>
              </button>
            </div>
            {[{label:'Ad Soyad',key:'name',type:'text',ph:'Müşteri adı',required:true},{label:'Telefon',key:'phone',type:'tel',ph:'0532 xxx xxxx',required:true},{label:'E-posta (opsiyonel)',key:'email',type:'email',ph:'email@ornek.com',required:false}].map(f=>(
              <div key={f.key} style={{ marginBottom:'14px' }}>
                <label style={{ display:'block', fontSize:'11px', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:T.muted, marginBottom:'6px' }}>{f.label}{f.required && <span style={{ color:'#C94040' }}> *</span>}</label>
                <input type={f.type} placeholder={f.ph} value={(newCust as any)[f.key]} onChange={e=>setNewCust(p=>({...p,[f.key]:e.target.value}))}
                  style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none' }}
                  onFocus={e=>{e.target.style.borderColor=T.orange;e.target.style.boxShadow='0 0 0 3px rgba(255,90,31,0.1)'}}
                  onBlur={e=>{e.target.style.borderColor=T.border2;e.target.style.boxShadow='none'}}/>
              </div>
            ))}
            <div style={{ marginBottom:'22px' }}>
              <label style={{ display:'block', fontSize:'11px', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:T.muted, marginBottom:'6px' }}>Not</label>
              <textarea placeholder="Müşteri hakkında notlar..." rows={2} value={newCust.notes} onChange={e=>setNewCust(p=>({...p,notes:e.target.value}))}
                style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none', resize:'vertical', height:70 }}
                onFocus={e=>{e.target.style.borderColor=T.orange;e.target.style.boxShadow='0 0 0 3px rgba(255,90,31,0.1)'}}
                onBlur={e=>{e.target.style.borderColor=T.border2;e.target.style.boxShadow='none'}}/>
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'18px', borderTop:`1px solid ${T.border}` }}>
              <button onClick={()=>setShowNew(false)} style={{ padding:'9px 16px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:'none', fontSize:'13px', fontWeight:600, color:T.muted, cursor:'pointer', fontFamily:'inherit' }}>Vazgeç</button>
              <button onClick={handleCreate} disabled={!newCust.name||!newCust.phone||creatingCust}
                style={{ padding:'9px 18px', borderRadius:T.rSm, border:'none', background:newCust.name&&newCust.phone?(dark?'#231E18':'#0E0E0E'):T.surface3, color:newCust.name&&newCust.phone?'#F3EDE3':T.muted2, fontSize:'13px', fontWeight:650, cursor:(newCust.name&&newCust.phone&&!creatingCust)?'pointer':'not-allowed', fontFamily:'inherit', transition:'background .15s' }}>
                {creatingCust?'Ekleniyor…':'Müşteri Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes modalIn{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
};
