import { useState } from 'react';
import { Plus, X, Clock, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStaff } from '@/hooks/useStaff';
import { useReservations } from '@/hooks/useReservations';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/contexts/ThemeContext';
import type { Staff, WorkingHours } from '@/types';

// ── Design tokens ────────────────────────────────────────────────────────────
const LT = {
  ink:      '#0E0E0E', cream:    '#F0EBE1', orange:   '#FF5A1F',
  surface:  '#FAF7F3', surface2: '#F3EDE4', surface3: '#EDE6DB',
  border:   'rgba(14,14,14,0.08)', border2:  'rgba(14,14,14,0.14)',
  muted:    'rgba(14,14,14,0.45)', muted2:   'rgba(14,14,14,0.28)',
  shadow:   '0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  shadowLg: '0 4px 16px rgba(14,14,14,0.10),0 16px 48px rgba(14,14,14,0.10)',
  r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
  ink:      '#F0EBE1', cream:    '#0F0D0B', orange:   '#FF5A1F',
  surface:  '#161310', surface2: '#1F1C18', surface3: '#272320',
  border:   'rgba(240,235,225,0.08)', border2:  'rgba(240,235,225,0.20)',
  muted:    'rgba(240,235,225,0.45)', muted2:   'rgba(240,235,225,0.28)',
  shadow:   '0 2px 8px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.25)',
  shadowSm: '0 1px 3px rgba(0,0,0,0.2),0 2px 8px rgba(0,0,0,0.15)',
  shadowLg: '0 4px 16px rgba(0,0,0,0.4),0 16px 48px rgba(0,0,0,0.3)',
  r: '14px', rSm: '10px', rXs: '7px',
};

function useT() {
  const { dark } = useTheme();
  return { T: dark ? DT : LT, dark };
}

// Pzt=Mon(1) Sa=Tue(2) Çr=Wed(3) Pe=Thu(4) Cm=Fri(5) Ct=Sat(6) Pz=Sun(0)
const DAY_LABELS = ['Pt','Sa','Çr','Pe','Cm','Ct','Pz'];
const DAY_JS     = [1,2,3,4,5,6,0];

function getSchedule(member: Staff): boolean[] {
  if (!member.workingHours) return [true,true,true,true,true,true,false];
  return DAY_JS.map(jsDay => {
    const h = member.workingHours!.find(wh => wh.day === jsDay);
    return h ? !h.isOff : true;
  });
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const todayIdx = (() => {
  const js = new Date().getDay();
  return DAY_JS.indexOf(js);
})();

const COLORS = ['#FF5A1F','#E8973C','#C95A3C','#CB5E84','#8E70B2','#3F9D9A','#5E9C6C','#5B7CC2'];
const DEFAULT_HOURS: WorkingHours[] = [
  { day:0, dayName:'Pazar',     start:'09:00', end:'18:00', isOff:true  },
  { day:1, dayName:'Pazartesi', start:'09:00', end:'18:00', isOff:false },
  { day:2, dayName:'Salı',      start:'09:00', end:'18:00', isOff:false },
  { day:3, dayName:'Çarşamba',  start:'09:00', end:'18:00', isOff:false },
  { day:4, dayName:'Perşembe',  start:'09:00', end:'18:00', isOff:false },
  { day:5, dayName:'Cuma',      start:'09:00', end:'18:00', isOff:false },
  { day:6, dayName:'Cumartesi', start:'10:00', end:'15:00', isOff:false },
];

interface StaffForm {
  name: string; specialty: string; phone: string; email: string;
  color: string; useCustomHours: boolean; workingHours: WorkingHours[];
}
const emptyForm = (): StaffForm => ({
  name:'', specialty:'', phone:'', email:'',
  color: COLORS[0], useCustomHours: false, workingHours: DEFAULT_HOURS,
});

// ── Inline button helper ──────────────────────────────────────────────────────
function IBtn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  const { T } = useT();
  return (
    <button
      onClick={onClick} title={title}
      style={{ width:28, height:28, borderRadius:T.rXs, display:'grid', placeItems:'center', border:`1px solid ${T.border}`, background:'none', cursor:'pointer', color:T.muted, transition:'all .15s', flexShrink:0 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surface2; (e.currentTarget as HTMLElement).style.color = T.ink; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = T.muted; }}
    >{children}</button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export const StaffPage = () => {
  const isMobile = useIsMobile();
  const { T, dark } = useT();
  const { staff, isLoading, addStaff, updateStaff, deleteStaff } = useStaff();
  const { reservations } = useReservations();

  const [selId, setSelId]         = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Staff | null>(null);
  const [form, setForm]           = useState<StaffForm>(emptyForm());
  const [saving, setSaving]       = useState(false);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const now      = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const weekStr   = (d: Date) => d.toISOString().slice(0,10);

  const weekResCount = reservations.filter(r => r.date >= weekStr(weekStart) && r.date <= weekStr(weekEnd)).length;
  const avgPerStaff  = staff.length ? (weekResCount / staff.length).toFixed(1) : '0';
  const completedPct = reservations.length
    ? Math.round((reservations.filter(r => r.status === 'completed').length / reservations.length) * 100)
    : 0;

  // ── Panel ──────────────────────────────────────────────────────────────────
  const openPanel  = (id: string) => { setSelId(id); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); setTimeout(() => setSelId(null), 300); };
  const selMember  = staff.find(s => s.id === selId) ?? null;

  // ── Modal ──────────────────────────────────────────────────────────────────
  const openAdd  = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (m: Staff) => {
    setEditing(m);
    setForm({ name:m.name, specialty:m.specialty||'', phone:m.phone||'', email:m.email||'',
      color:m.color, useCustomHours:!!m.workingHours, workingHours:m.workingHours||DEFAULT_HOURS });
    setShowModal(true);
  };
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Personel adı gerekli'); return; }
    setSaving(true);
    const payload = { name:form.name.trim(), specialty:form.specialty.trim()||undefined,
      phone:form.phone.trim()||undefined, email:form.email.trim()||undefined,
      color:form.color, workingHours:form.useCustomHours?form.workingHours:undefined, isActive:true };
    if (editing) { await updateStaff(editing.id, payload); toast.success('Personel güncellendi'); }
    else         { await addStaff(payload);                 toast.success('Personel eklendi'); }
    setSaving(false); setShowModal(false);
  };
  const handleDelete = async (m: Staff) => {
    if (!confirm(`"${m.name}" personelini kaldırmak istediğinizden emin misiniz?`)) return;
    await deleteStaff(m.id);
    if (selId === m.id) closePanel();
  };
  const updateHour = (day: number, field: keyof WorkingHours, value: string | boolean) => {
    setForm(prev => ({ ...prev, workingHours: prev.workingHours.map(h => h.day===day?{...h,[field]:value}:h) }));
  };

  const avatarBg  = dark ? '#272320' : '#0E0E0E';
  const avatarFg  = '#F0EBE1';

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const statCards = [
    { icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="5" r="2.5" stroke={T.ink} strokeWidth="1.4" opacity=".7"/><path d="M1 14c0-3 2.7-5 6-5" stroke={T.ink} strokeWidth="1.4" strokeLinecap="round" opacity=".7"/><circle cx="12" cy="5" r="2.5" stroke={T.ink} strokeWidth="1.4" opacity=".4"/><path d="M10 14c0-2.5 1.8-4.3 3.8-4.8" stroke={T.ink} strokeWidth="1.4" strokeLinecap="round" opacity=".4"/></svg>, val: staff.length, lbl:'Aktif Çalışan', icoStyle:{ background:T.surface2 }, valColor:T.ink },
    { icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke={T.orange} strokeWidth="1.4"/><path d="M5 8h6M8 5v6" stroke={T.orange} strokeWidth="1.4" strokeLinecap="round"/></svg>, val:weekResCount, lbl:'Bu Hafta', icoStyle:{ background:dark?'rgba(255,90,31,0.12)':'rgba(255,90,31,0.08)' }, valColor:T.orange },
    { icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><polyline points="2,12 6,8 9,11 14,5" stroke={T.ink} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".7"/></svg>, val:avgPerStaff, lbl:'Ort. Randevu', icoStyle:{ background:T.surface2 }, valColor:T.ink },
    { icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke={T.ink} strokeWidth="1.4" opacity=".7"/><path d="M8 5v3.5l2 1" stroke={T.ink} strokeWidth="1.4" strokeLinecap="round" opacity=".7"/></svg>, val:`%${completedPct}`, lbl:'Tamamlanma', icoStyle:{ background:T.surface2 }, valColor:T.ink },
  ];

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflowY:'auto', background:T.surface, padding:'24px 28px 40px' }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'13px' }}>
          <div style={{ width:40, height:40, background:avatarBg, borderRadius:'10px', display:'grid', placeItems:'center', flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="8" cy="7" r="3" stroke="#F3ECE0" strokeWidth="1.5"/>
              <path d="M2 17c0-2.8 2.7-5 6-5M14 12c2.2.4 3.8 2 3.8 3.5" stroke="#F3ECE0" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="14.5" cy="7" r="2.5" stroke="#F3ECE0" strokeWidth="1.5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:'21px', fontWeight:800, letterSpacing:'-0.03em', lineHeight:1.1, color:T.ink }}>Personel</div>
            <div style={{ fontSize:'11.5px', color:T.muted, marginTop:'2px' }}>{staff.length} aktif çalışan</div>
          </div>
        </div>
        <button onClick={openAdd}
          style={{ display:'flex', alignItems:'center', gap:'7px', background:avatarBg, color:avatarFg, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'9px 16px', fontSize:'13px', fontWeight:650, cursor:'pointer', fontFamily:'inherit', transition:'background .15s' }}
          onMouseEnter={e=>(e.currentTarget.style.background= dark?'#363028':'#2a2a2a')}
          onMouseLeave={e=>(e.currentTarget.style.background=avatarBg)}>
          <Plus size={13} strokeWidth={2.5}/> Personel Ekle
        </button>
      </div>

      {/* ── Stat bar ── */}
      <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)', gap:'10px', marginBottom:'18px' }}>
        {statCards.map((s,i) => (
          <div key={i} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.rSm, padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow=T.shadow;(e.currentTarget as HTMLElement).style.transform='translateY(-1px)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow='';(e.currentTarget as HTMLElement).style.transform=''}}>
            <div style={{ width:32, height:32, borderRadius:8, display:'grid', placeItems:'center', flexShrink:0, ...s.icoStyle }}>{s.icon}</div>
            <div>
              <div style={{ fontSize:'20px', fontWeight:900, letterSpacing:'-0.04em', lineHeight:1, color:s.valColor }}>{s.val}</div>
              <div style={{ fontSize:'10.5px', fontWeight:600, color:T.muted, marginTop:'2px' }}>{s.lbl}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Card grid ── */}
      {isLoading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'64px 0' }}>
          <div style={{ width:28, height:28, borderRadius:'50%', border:`2px solid ${T.surface3}`, borderTopColor:T.ink, animation:'spin 0.8s linear infinite' }}/>
        </div>
      ) : staff.length === 0 ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 24px', gap:'12px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="16" cy="14" r="6" stroke={T.muted2} strokeWidth="1.5"/><path d="M4 34c0-5.5 5.4-10 12-10" stroke={T.muted2} strokeWidth="1.5" strokeLinecap="round"/><circle cx="29" cy="14" r="5" stroke={T.muted2} strokeWidth="1.5"/><path d="M24 34c0-4.5 3.5-8 7.5-8" stroke={T.muted2} strokeWidth="1.5" strokeLinecap="round"/></svg>
          <div style={{ fontSize:'14px', fontWeight:700, color:T.ink }}>Henüz personel yok</div>
          <div style={{ fontSize:'12px', color:T.muted }}>Çalışanlarınızı ekleyin ve takvimlerini yönetin</div>
          <button onClick={openAdd} style={{ marginTop:'4px', display:'flex', alignItems:'center', gap:'6px', background:avatarBg, color:avatarFg, border:'none', borderRadius:T.rSm, padding:'9px 16px', fontSize:'13px', fontWeight:650, cursor:'pointer', fontFamily:'inherit' }}>
            <Plus size={12}/> İlk Personeli Ekle
          </button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'14px' }}>
          {staff.map(member => {
            const sched   = getSchedule(member);
            const isSel   = selId === member.id && panelOpen;
            const staffRes  = reservations.filter(r => r.staffId === member.id);
            const thisWeekR = staffRes.filter(r => r.date >= weekStr(weekStart) && r.date <= weekStr(weekEnd)).length;
            return (
              <div key={member.id}
                onClick={() => isSel ? closePanel() : openPanel(member.id)}
                style={{ background:T.surface, border:`1px solid ${isSel?T.orange:T.border}`, borderRadius:T.r, boxShadow:isSel?`0 0 0 2px rgba(255,90,31,.15),${T.shadowSm}`:T.shadowSm, overflow:'hidden', transition:'all .2s', cursor:'pointer' }}
                onMouseEnter={e=>{if(!isSel){(e.currentTarget as HTMLElement).style.boxShadow=T.shadow;(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';}}}
                onMouseLeave={e=>{if(!isSel){(e.currentTarget as HTMLElement).style.boxShadow=T.shadowSm;(e.currentTarget as HTMLElement).style.transform='';}}}
              >
                {/* Card top */}
                <div style={{ padding:'18px 18px 14px', display:'flex', alignItems:'flex-start', gap:'14px', borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ width:46, height:46, borderRadius:'50%', background:avatarBg, color:avatarFg, display:'grid', placeItems:'center', fontSize:'16px', fontWeight:900, flexShrink:0, letterSpacing:'-0.02em' }}>
                    {initials(member.name)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'15px', fontWeight:800, letterSpacing:'-0.02em', lineHeight:1.1, color:T.ink }}>{member.name}</div>
                    {member.specialty && (
                      <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:T.muted, marginTop:'4px' }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1" y="3" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 3V2a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.2"/></svg>
                        {member.specialty}
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:600, color:T.muted, marginTop:'5px' }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background: dark ? 'rgba(240,235,225,0.3)' : T.muted2, flexShrink:0 }}/>
                      Aktif
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'4px', alignItems:'flex-end' }} onClick={e=>e.stopPropagation()}>
                    <IBtn onClick={()=>openEdit(member)} title="Düzenle"><Edit2 size={12}/></IBtn>
                    <IBtn onClick={()=>handleDelete(member)} title="Sil"><Trash2 size={12}/></IBtn>
                  </div>
                </div>

                {/* Mini stats */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:`1px solid ${T.border}` }}>
                  {[
                    { val:thisWeekR, lbl:'Bu Hafta' },
                    { val:staffRes.length, lbl:'Bu Ay' },
                    { val:staffRes.filter(r=>r.status==='completed').length, lbl:'Tamamlandı' },
                  ].map((s,i) => (
                    <div key={i} style={{ padding:'12px 10px', textAlign:'center', borderRight:i<2?`1px solid ${T.border}`:'none' }}>
                      <div style={{ fontSize:'17px', fontWeight:900, letterSpacing:'-0.03em', color:T.ink }}>{s.val}</div>
                      <div style={{ fontSize:'8.5px', fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:T.muted, marginTop:'2px' }}>{s.lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Schedule */}
                <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:'6px' }}>
                  <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'4px' }}>Haftalık Program</div>
                  <div style={{ display:'flex', gap:'3px' }}>
                    {DAY_LABELS.map((d,di) => {
                      const isWork  = sched[di];
                      const isToday = di === todayIdx;
                      return (
                        <div key={di} style={{ width:26, height:26, borderRadius:6, display:'grid', placeItems:'center', fontSize:'9px', fontWeight:800,
                          background: isToday ? T.orange : isWork ? avatarBg : T.surface2,
                          color:      isToday ? (dark?'#0F0D0B':'#0E0E0E') : isWork ? avatarFg : T.muted2,
                          transition:'all .15s' }}>
                          {d}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize:'11.5px', color:T.muted, display:'flex', alignItems:'center', gap:'6px', marginTop:'2px' }}>
                    <Clock size={10}/>
                    {member.workingHours ? 'Özel çalışma saatleri' : 'İşletme saatlerini kullanıyor'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Slide-in detail panel ── */}
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:340, background:T.surface, borderLeft:`1px solid ${T.border}`, zIndex:88, transform:panelOpen?'translateX(0)':'translateX(100%)', transition:'transform .3s cubic-bezier(.4,0,.2,1)', boxShadow:panelOpen?T.shadowLg:'none', display:'flex', flexDirection:'column' }}>
        {/* Panel header */}
        <div style={{ padding:'16px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ fontSize:'13.5px', fontWeight:750, color:T.ink }}>Personel Detayı</div>
          <button onClick={closePanel} style={{ width:28, height:28, borderRadius:T.rXs, display:'grid', placeItems:'center', border:'none', background:'none', cursor:'pointer', color:T.muted }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=T.surface2;(e.currentTarget as HTMLElement).style.color=T.ink}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none';(e.currentTarget as HTMLElement).style.color=T.muted}}>
            <X size={14}/>
          </button>
        </div>

        {/* Panel body */}
        {selMember && (
          <div style={{ flex:1, overflowY:'auto', padding:'22px' }}>
            <div style={{ width:60, height:60, borderRadius:'50%', background:avatarBg, color:avatarFg, display:'grid', placeItems:'center', fontSize:'22px', fontWeight:900, margin:'0 auto 12px' }}>
              {initials(selMember.name)}
            </div>
            <div style={{ fontSize:'17px', fontWeight:800, textAlign:'center', letterSpacing:'-0.02em', color:T.ink }}>{selMember.name}</div>
            {selMember.specialty && (
              <div style={{ fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:T.muted, textAlign:'center', marginTop:'4px', marginBottom:'18px' }}>{selMember.specialty}</div>
            )}
            {!selMember.specialty && <div style={{ marginBottom:'18px' }}/>}

            {/* Stats row */}
            {(() => {
              const sRes = reservations.filter(r => r.staffId === selMember.id);
              const wRes = sRes.filter(r => r.date >= weekStr(weekStart) && r.date <= weekStr(weekEnd)).length;
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', background:T.surface2, borderRadius:T.rSm, overflow:'hidden', marginBottom:'18px' }}>
                  {[{v:wRes,l:'Hafta'},{v:sRes.length,l:'Toplam'},{v:sRes.filter(r=>r.status==='completed').length,l:'Tamam'}].map((s,i) => (
                    <div key={i} style={{ padding:'14px 10px', textAlign:'center', borderRight:i<2?`1px solid ${T.border}`:'none' }}>
                      <div style={{ fontSize:'20px', fontWeight:900, letterSpacing:'-0.04em', color:T.ink }}>{s.v}</div>
                      <div style={{ fontSize:'8.5px', fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:T.muted, marginTop:'3px' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Contact */}
            <div style={{ marginBottom:'18px' }}>
              <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'10px' }}>İletişim</div>
              {[{k:'Telefon',v:selMember.phone||'—'},{k:'E-posta',v:selMember.email||'—'}].map((row,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:i<1?`1px solid ${T.border}`:'none', fontSize:'12.5px', gap:'8px' }}>
                  <span style={{ color:T.muted, fontWeight:600, flexShrink:0 }}>{row.k}</span>
                  <span style={{ fontWeight:650, textAlign:'right', fontFamily:"'JetBrains Mono',monospace", fontSize:'11.5px', color:T.ink }}>{row.v}</span>
                </div>
              ))}
            </div>

            {/* Schedule */}
            <div style={{ marginBottom:'18px' }}>
              <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'10px' }}>Haftalık Program</div>
              <div style={{ display:'flex', gap:'3px', marginBottom:'8px' }}>
                {DAY_LABELS.map((d,di) => {
                  const sch    = getSchedule(selMember);
                  const isWork  = sch[di];
                  const isToday = di === todayIdx;
                  return (
                    <div key={di} style={{ width:26, height:26, borderRadius:6, display:'grid', placeItems:'center', fontSize:'9px', fontWeight:800,
                      background: isToday ? T.orange : isWork ? avatarBg : T.surface2,
                      color:      isToday ? (dark?'#0F0D0B':'#0E0E0E') : isWork ? avatarFg : T.muted2 }}>
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Performance */}
            {(() => {
              const sRes = reservations.filter(r => r.staffId === selMember.id);
              const total   = sRes.length || 1;
              const doluluk = Math.min(100, Math.round((sRes.filter(r=>r.status!=='cancelled').length / total) * 100));
              const tamam   = Math.min(100, Math.round((sRes.filter(r=>r.status==='completed').length / total) * 100));
              const iptal   = Math.min(100, Math.round((sRes.filter(r=>r.status==='cancelled').length / total) * 100));
              return (
                <div style={{ marginBottom:'18px' }}>
                  <div style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.14em', textTransform:'uppercase', color:T.muted, marginBottom:'10px' }}>Performans</div>
                  {[{lbl:'Doluluk',val:doluluk},{lbl:'Tamamlama',val:tamam},{lbl:'İptal Oranı',val:iptal,warn:iptal>15}].map((bar,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
                      <span style={{ fontSize:'11px', fontWeight:600, color:T.muted, width:80, flexShrink:0 }}>{bar.lbl}</span>
                      <div style={{ flex:1, height:5, background:T.surface3, borderRadius:'999px', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:'999px', background:bar.warn?T.orange:T.ink, width:`${bar.val}%`, transition:'width 1s cubic-bezier(.2,.8,.2,1)' }}/>
                      </div>
                      <span style={{ fontSize:'10px', fontWeight:800, color:T.ink, width:32, textAlign:'right' }}>%{bar.val}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Actions */}
            <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
              <button onClick={()=>{closePanel();openEdit(selMember);}}
                style={{ flex:1, padding:'10px', borderRadius:'999px', background:avatarBg, color:avatarFg, border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background .15s' }}
                onMouseEnter={e=>(e.currentTarget.style.background= dark?'#363028':'#2a2a2a')}
                onMouseLeave={e=>(e.currentTarget.style.background=avatarBg)}>
                Düzenle
              </button>
              <button onClick={()=>handleDelete(selMember)}
                style={{ padding:'10px 14px', borderRadius:'999px', background:'none', color:T.muted, border:`1px solid ${T.border2}`, fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(201,64,64,0.08)';(e.currentTarget as HTMLElement).style.color= dark?'#e07070':'#C94040';(e.currentTarget as HTMLElement).style.borderColor='rgba(201,64,64,0.3)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none';(e.currentTarget as HTMLElement).style.color=T.muted;(e.currentTarget as HTMLElement).style.borderColor=T.border2}}>
                Sil
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Overlay when panel open */}
      {panelOpen && <div style={{ position:'fixed', inset:0, zIndex:87 }} onClick={closePanel}/>}

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background: dark?'rgba(0,0,0,0.6)':'rgba(14,14,14,0.4)', backdropFilter:'blur(4px)' }} onClick={()=>setShowModal(false)}>
          <div style={{ background:T.surface, borderRadius:'20px', padding:'28px', width:480, maxWidth:'90vw', boxShadow:T.shadowLg, maxHeight:'90vh', overflowY:'auto', animation:'modalIn .3s cubic-bezier(.22,.8,.2,1) both', border:`1px solid ${T.border2}` }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'22px' }}>
              <div style={{ fontSize:'17px', fontWeight:800, letterSpacing:'-0.02em', color:T.ink }}>{editing?'Personeli Düzenle':'Yeni Personel'}</div>
              <button onClick={()=>setShowModal(false)} style={{ width:32, height:32, borderRadius:T.rXs, display:'grid', placeItems:'center', color:T.muted, border:'none', background:'none', cursor:'pointer' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=T.surface2}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='none'}}>
                <X size={16}/>
              </button>
            </div>

            {/* Form fields */}
            {[{label:'Ad Soyad *',key:'name',type:'text',placeholder:'Personel adı'},{label:'Uzmanlık',key:'specialty',type:'text',placeholder:'Saç, Cilt Bakımı…'},{label:'Telefon',key:'phone',type:'tel',placeholder:'0532 xxx xxxx'},{label:'E-posta',key:'email',type:'email',placeholder:'email@örnek.com'}].map(f=>(
              <div key={f.key} style={{ marginBottom:'14px' }}>
                <label style={{ display:'block', fontSize:'11px', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:T.muted, marginBottom:'6px' }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                  style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:T.rSm, padding:'10px 13px', fontFamily:'inherit', fontSize:'13.5px', color:T.ink, outline:'none' }}
                  onFocus={e=>{e.target.style.borderColor=T.orange;e.target.style.boxShadow='0 0 0 3px rgba(255,90,31,0.1)'}}
                  onBlur={e=>{e.target.style.borderColor=T.border2;e.target.style.boxShadow='none'}}/>
              </div>
            ))}

            {/* Color picker */}
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'11px', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:T.muted, marginBottom:'8px' }}>Takvim Rengi</label>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{ width:32, height:32, borderRadius:'8px', border:form.color===c?`2px solid ${T.ink}`:'2px solid transparent', background:c, cursor:'pointer', transition:'all .15s', transform:form.color===c?'scale(1.1)':'scale(1)' }}/>
                ))}
              </div>
            </div>

            {/* Working hours toggle */}
            <div style={{ border:`1px solid ${T.border2}`, borderRadius:T.rSm, overflow:'hidden', marginBottom:'22px' }}>
              <button onClick={()=>setForm(p=>({...p,useCustomHours:!p.useCustomHours}))} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', fontWeight:600, color:T.ink }}>
                  <Clock size={15} color={T.muted}/> Özel çalışma saatleri
                </div>
                <div style={{ width:36, height:20, borderRadius:'999px', background:form.useCustomHours?T.ink:T.surface3, transition:'background .2s', position:'relative' }}>
                  <div style={{ position:'absolute', top:2, left:form.useCustomHours?16:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                </div>
              </button>
              {form.useCustomHours && (
                <div style={{ borderTop:`1px solid ${T.border}`, padding:'12px 14px' }}>
                  {form.workingHours.map(h=>(
                    <div key={h.day} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'5px 0', opacity:h.isOff?0.5:1 }}>
                      <span style={{ width:72, fontSize:'12px', fontWeight:600, color:T.ink }}>{h.dayName}</span>
                      <label style={{ display:'flex', alignItems:'center', gap:'5px', cursor:'pointer' }}>
                        <input type="checkbox" checked={!h.isOff} onChange={e=>updateHour(h.day,'isOff',!e.target.checked)} style={{ width:13, height:13, accentColor:T.orange }}/>
                        <span style={{ fontSize:'11px', color:T.muted }}>{h.isOff?'Kapalı':'Açık'}</span>
                      </label>
                      {!h.isOff && <>
                        <input type="time" value={h.start} onChange={e=>updateHour(h.day,'start',e.target.value)} style={{ padding:'4px 8px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'11px', fontFamily:'inherit', color:T.ink, background:T.surface2, outline:'none', colorScheme:dark?'dark':'light' }}/>
                        <span style={{ color:T.muted2, fontSize:'11px' }}>—</span>
                        <input type="time" value={h.end} onChange={e=>updateHour(h.day,'end',e.target.value)} style={{ padding:'4px 8px', border:`1px solid ${T.border2}`, borderRadius:T.rXs, fontSize:'11px', fontFamily:'inherit', color:T.ink, background:T.surface2, outline:'none', colorScheme:dark?'dark':'light' }}/>
                      </>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'18px', borderTop:`1px solid ${T.border}` }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:'9px 16px', borderRadius:T.rSm, border:`1px solid ${T.border2}`, background:'none', fontSize:'13px', fontWeight:600, color:T.muted, cursor:'pointer', fontFamily:'inherit' }}>Vazgeç</button>
              <button onClick={handleSave} disabled={saving||!form.name.trim()}
                style={{ padding:'9px 18px', borderRadius:T.rSm, border:'none', background:form.name.trim()?avatarBg:T.surface3, color:form.name.trim()?avatarFg:T.muted2, fontSize:'13px', fontWeight:650, cursor:form.name.trim()?'pointer':'not-allowed', fontFamily:'inherit', transition:'background .15s' }}>
                {saving?'Kaydediliyor…':editing?'Güncelle':'Personel Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalIn{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
};
