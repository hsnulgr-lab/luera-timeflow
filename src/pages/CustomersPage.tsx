import { useState } from 'react';
import { Search, Phone, Mail, Plus, X, Trash2, Edit2, ChevronLeft } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/contexts/ThemeContext';
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

  const { customers, allCustomers, searchQuery, setSearchQuery, addCustomer, deleteCustomer } = useCustomers();
  const { reservations } = useReservations();
  const [selId, setSelId]         = useState<string | null>(null);
  const [showNew, setShowNew]     = useState(false);
  const [newCust, setNewCust]     = useState({ name:'', phone:'', email:'', notes:'' });

  const selected    = allCustomers.find(c => c.id === selId) ?? null;
  const custHistory = selected
    ? reservations.filter(r => r.customerId === selected.id).sort((a,b) => b.date.localeCompare(a.date))
    : [];

  const handleCreate = () => {
    if (!newCust.name || !newCust.phone) return;
    addCustomer(newCust);
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
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px', gap:'8px' }}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="14" r="8" stroke={T.muted2} strokeWidth="1.5"/><path d="M5 36c0-8.3 6.7-15 15-15s15 6.7 15 15" stroke={T.muted2} strokeWidth="1.5" strokeLinecap="round"/></svg>
                <div style={{ fontSize:'13px', fontWeight:700, color:T.ink }}>Müşteri bulunamadı</div>
                <div style={{ fontSize:'11.5px', color:T.muted, textAlign:'center' }}>Yeni müşteri ekleyin veya aramayı değiştirin</div>
              </div>
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
            {[{label:'Ad Soyad',key:'name',type:'text',ph:'Müşteri adı'},{label:'Telefon',key:'phone',type:'tel',ph:'0532 xxx xxxx'},{label:'E-posta (opsiyonel)',key:'email',type:'email',ph:'email@ornek.com'}].map(f=>(
              <div key={f.key} style={{ marginBottom:'14px' }}>
                <label style={{ display:'block', fontSize:'11px', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:T.muted, marginBottom:'6px' }}>{f.label}</label>
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
              <button onClick={handleCreate} disabled={!newCust.name||!newCust.phone}
                style={{ padding:'9px 18px', borderRadius:T.rSm, border:'none', background:newCust.name&&newCust.phone?(dark?'#231E18':'#0E0E0E'):T.surface3, color:newCust.name&&newCust.phone?'#F3EDE3':T.muted2, fontSize:'13px', fontWeight:650, cursor:newCust.name&&newCust.phone?'pointer':'not-allowed', fontFamily:'inherit', transition:'background .15s' }}>
                Müşteri Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes modalIn{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
};
