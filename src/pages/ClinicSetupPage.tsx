import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2, Stethoscope, Boxes, Users, BellRing,
  ChevronLeft, ChevronRight, Plus, Trash2, Check, Lock, Loader2, ShieldCheck,
} from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useStaff } from '@/hooks/useStaff';
import { useTheme } from '@/contexts/ThemeContext';
import { SECTOR_PROFILES, profileForSector } from '@/lib/sectorProfiles';
import { STAFF_ROLE_OPTIONS, STAFF_ROLE_PERMISSIONS, inferStaffRoleFromSpecialty } from '@/lib/staffPermissions';
import type { Service, StaffRole } from '@/types';

// ── Design tokens (SettingsPage ile aynı) ────────────────────────────────────
const LT = {
  ink: '#0E0E0E', cream: '#F3EDE3', orange: '#FF5A1F',
  surface: '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
  border: 'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)',
  muted: 'rgba(14,14,14,0.48)', muted2: 'rgba(14,14,14,0.30)',
  shadow: '0 2px 8px rgba(14,14,14,0.07),0 8px 24px rgba(14,14,14,0.06)',
  shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
  r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
  ink: '#F3EDE3', cream: '#0C0A08', orange: '#FF5A1F',
  surface: '#111009', surface2: '#191610', surface3: '#231E18',
  border: 'rgba(243,237,227,0.08)', border2: 'rgba(243,237,227,0.20)',
  muted: 'rgba(243,237,227,0.45)', muted2: 'rgba(243,237,227,0.28)',
  shadow: '0 2px 8px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.25)',
  shadowSm: '0 1px 3px rgba(0,0,0,0.2),0 2px 8px rgba(0,0,0,0.15)',
  r: '14px', rSm: '10px', rXs: '7px',
};
const useT = () => { const { dark } = useTheme(); return { T: dark ? DT : LT, dark }; };

const SERVICE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#0E7490', '#DB2777'];
const uid = () => Math.random().toString(36).slice(2, 10);

const STEPS = [
  { key: 'clinic', label: 'Klinik', sub: 'Ad · sektör · saatler', Icon: Building2 },
  { key: 'services', label: 'Tedaviler', sub: 'Süre & ücret', Icon: Stethoscope },
  { key: 'resources', label: 'Üniteler', sub: 'Koltuk / oda', Icon: Boxes },
  { key: 'staff', label: 'Ekip & Roller', sub: 'Yetki kilidi', Icon: Users },
  { key: 'recall', label: 'Kontrol Çağrısı', sub: 'Recall', Icon: BellRing },
] as const;

export function ClinicSetupPage() {
  const navigate = useNavigate();
  const { T } = useT();
  const { settings, updateSettings } = useReservations();
  const { resources, addResource, updateResource, removeResource } = useResources();
  const { staff, updateStaff } = useStaff();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Step 1: Klinik ──
  const [businessName, setBusinessName] = useState(settings.businessName || '');
  const [sector, setSector] = useState(settings.sector || 'genel');
  const [slotDuration, setSlotDuration] = useState(settings.slotDuration || 30);
  const [workingHours, setWorkingHours] = useState(settings.workingHours);

  // ── Step 2: Tedaviler ──
  const [services, setServices] = useState<Service[]>(settings.services);

  // ── Step 5: Recall (mevcut rebook otomasyonu alanına yazılır) ──
  const [recallOn, setRecallOn] = useState(settings.rebookEnabled ?? false);
  const [recallNote, setRecallNote] = useState(settings.rebookNote || '');

  const profile = profileForSector(sector);
  const resourceType = profile.resourceTypes[0] || 'Kaynak';
  const resourceLabel = profile.resourceTypes.length ? profile.resourceTypes[0] : 'Kaynak';

  // Hekim olması gerektiği halde rolü hekim olmayan personel (kilit sorunu)
  const lockedStaff = useMemo(
    () => staff.filter(s => s.isActive && inferStaffRoleFromSpecialty(s.specialty) === 'doctor' && s.role !== 'doctor'),
    [staff],
  );

  // ── Persist helpers ──
  async function persistSettings(extra?: Partial<typeof settings>) {
    setSaving(true);
    const ok = await updateSettings({
      ...settings,
      businessName, sector, slotDuration, workingHours, services,
      rebookEnabled: recallOn, rebookNote: recallNote,
      ...extra,
    });
    setSaving(false);
    return ok;
  }

  async function next() {
    // Her adımda ilgili veri kaydedilir; kaynak/rol adımları anlık kaydeder.
    if (step === 0 || step === 1 || step === 4) {
      const ok = await persistSettings();
      if (!ok) return;
    }
    if (step === 3 && lockedStaff.length > 0) {
      toast.error(`${lockedStaff.length} hekimin rolü atanmadı — muayene ekranı kilitli kalır`);
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else { toast.success('Klinik kurulumu tamamlandı'); navigate('/'); }
  }

  const card: React.CSSProperties = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: T.shadow,
  };

  return (
    <div style={{ background: T.cream, minHeight: '100vh', padding: 28, color: T.ink }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: '264px 1fr', gap: 22 }}>
        {/* RAIL */}
        <aside style={{ ...card, boxShadow: T.shadowSm, padding: 20, height: 'fit-content', position: 'sticky', top: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: T.ink, color: T.cream, display: 'grid', placeItems: 'center', fontWeight: 800 }}>L</div>
            <div><b style={{ fontSize: 16 }}>Luera</b><small style={{ display: 'block', color: T.muted, fontSize: 11.5 }}>Klinik Kurulumu</small></div>
          </div>
          <div style={{ margin: '18px 0 16px' }}>
            <div style={{ height: 6, borderRadius: 99, background: T.surface3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`, background: T.orange, borderRadius: 99, transition: 'width .35s' }} />
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 7, fontWeight: 600 }}>{step + 1} / {STEPS.length} · {STEPS[step].label}</div>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {STEPS.map((s, i) => {
              const active = i === step, done = i < step;
              return (
                <button key={s.key} onClick={() => setStep(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: T.rSm,
                  cursor: 'pointer', border: '1px solid transparent', textAlign: 'left',
                  background: active ? T.ink : 'transparent', color: active ? T.cream : T.ink,
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 7, flex: '0 0 auto', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
                    background: active || done ? T.orange : T.surface3, color: active || done ? '#fff' : T.ink,
                  }}>{done ? <Check size={13} /> : i + 1}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 }}>{s.label}
                    <small style={{ display: 'block', fontWeight: 500, fontSize: 11, color: active ? 'rgba(243,237,227,.6)' : T.muted }}>{s.sub}</small>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* PANEL */}
        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid ${T.border}` }}>
            <h1 style={{ fontSize: 21, letterSpacing: '-.02em', fontWeight: 800 }}>{StepHead[STEPS[step].key].title}</h1>
            <p style={{ color: T.muted, fontSize: 13.5, marginTop: 5, maxWidth: '64ch', lineHeight: 1.5 }}>{StepHead[STEPS[step].key].desc}</p>
          </div>

          <div style={{ padding: '22px 26px' }}>
            {/* STEP 0 · Klinik */}
            {step === 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field T={T} label="Klinik adı"><Inp T={T} value={businessName} onChange={setBusinessName} placeholder="Ör. Luera Ağız & Diş Sağlığı" /></Field>
                  <Field T={T} label="Sektör">
                    <Sel T={T} value={sector} onChange={setSector} options={Object.entries(SECTOR_PROFILES).map(([k, p]) => ({ value: k, label: p.label }))} />
                  </Field>
                </div>
                <Field T={T} label="Randevu slotu">
                  <Sel T={T} value={String(slotDuration)} onChange={v => setSlotDuration(Number(v))}
                    options={[15, 20, 30, 45, 60].map(m => ({ value: String(m), label: `${m} dakika` }))} />
                </Field>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.muted, margin: '6px 0 9px' }}>Çalışma günleri</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {workingHours.map((d, i) => (
                    <button key={d.day} onClick={() => setWorkingHours(workingHours.map((x, k) => k === i ? { ...x, isOff: !x.isOff } : x))}
                      style={chip(T, !d.isOff)}>{d.dayName} {d.isOff ? '· Kapalı' : `· ${d.start}–${d.end}`}</button>
                  ))}
                </div>
              </>
            )}

            {/* STEP 1 · Tedaviler */}
            {step === 1 && (
              <>
                {services.map((s, i) => (
                  <div key={s.id} style={row(T)}>
                    <input type="color" value={s.color} onChange={e => setServices(services.map((x, k) => k === i ? { ...x, color: e.target.value } : x))}
                      style={{ width: 22, height: 22, border: 'none', borderRadius: 99, background: 'none', cursor: 'pointer', padding: 0 }} />
                    <input value={s.name} onChange={e => setServices(services.map((x, k) => k === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Tedavi adı" style={{ ...inpBase(T), flex: 1, border: 'none', background: 'transparent', fontWeight: 700 }} />
                    <input type="number" value={s.duration} onChange={e => setServices(services.map((x, k) => k === i ? { ...x, duration: Number(e.target.value) } : x))}
                      style={{ ...inpBase(T), width: 78 }} /> <span style={{ color: T.muted, fontSize: 12 }}>dk</span>
                    <input type="number" value={s.price ?? ''} placeholder="₺" onChange={e => setServices(services.map((x, k) => k === i ? { ...x, price: e.target.value ? Number(e.target.value) : undefined } : x))}
                      style={{ ...inpBase(T), width: 92 }} />
                    <button onClick={() => setServices(services.filter((_, k) => k !== i))} style={xBtn(T)}><Trash2 size={15} /></button>
                  </div>
                ))}
                <button onClick={() => setServices([...services, { id: uid(), name: '', duration: slotDuration, color: SERVICE_COLORS[services.length % SERVICE_COLORS.length] }])} style={addBtn(T)}><Plus size={15} /> Tedavi ekle</button>
              </>
            )}

            {/* STEP 2 · Üniteler */}
            {step === 2 && (
              <>
                {resources.length === 0 && <div style={callout(T)}>Henüz {resourceLabel.toLowerCase()} eklenmedi. Aynı anda kaç hastaya bakabileceğinizi bu kaynaklar belirler.</div>}
                {resources.map(r => (
                  <div key={r.id} style={row(T)}>
                    <span style={{ width: 11, height: 11, borderRadius: 99, background: T.orange, flex: '0 0 auto' }} />
                    <input value={r.name} onChange={e => updateResource(r.id, { name: e.target.value })}
                      style={{ ...inpBase(T), flex: 1, border: 'none', background: 'transparent', fontWeight: 700 }} />
                    <span style={{ color: T.muted, fontSize: 12.5, fontWeight: 600 }}>Kapasite</span>
                    <input type="number" min={1} value={r.capacity} onChange={e => updateResource(r.id, { capacity: Math.max(1, Number(e.target.value)) })} style={{ ...inpBase(T), width: 70 }} />
                    <button onClick={() => removeResource(r.id)} style={xBtn(T)}><Trash2 size={15} /></button>
                  </div>
                ))}
                <button onClick={() => addResource({ type: resourceType, name: `${resourceLabel} ${resources.length + 1}`, capacity: 1 })} style={addBtn(T)}><Plus size={15} /> {resourceLabel} ekle</button>
              </>
            )}

            {/* STEP 3 · Ekip & Roller */}
            {step === 3 && (
              <>
                {staff.filter(s => s.isActive).length === 0 && <div style={callout(T)}>Aktif ekip üyesi yok. Personel sayfasından üye ekledikten sonra rollerini buradan atayın.</div>}
                {staff.filter(s => s.isActive).map(m => {
                  const needsDoctor = inferStaffRoleFromSpecialty(m.specialty) === 'doctor';
                  const locked = needsDoctor && m.role !== 'doctor';
                  return (
                    <div key={m.id} style={{ border: `1px solid ${locked ? 'rgba(255,90,31,.45)' : T.border}`, borderRadius: T.r, padding: 16, marginBottom: 12, background: T.surface, boxShadow: locked ? '0 0 0 3px rgba(255,90,31,.08)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', fontWeight: 800, color: '#fff', background: m.color || '#0E7490' }}>
                          {m.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <b style={{ fontSize: 15 }}>{m.name}</b>
                          <span style={{ display: 'block', color: T.muted, fontSize: 12.5 }}>{m.specialty || 'Ekip üyesi'}</span>
                        </div>
                        <span style={chip(T, !locked)}>{locked ? 'Rol seçin' : `✓ ${STAFF_ROLE_OPTIONS.find(o => o.value === m.role)?.label}`}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 14 }}>
                        {STAFF_ROLE_OPTIONS.map(opt => {
                          const sel = m.role === opt.value;
                          return (
                            <button key={opt.value} onClick={() => updateStaff(m.id, { role: opt.value as StaffRole })}
                              style={{ border: `1px solid ${sel ? T.orange : T.border2}`, borderRadius: T.rSm, padding: 10, cursor: 'pointer', textAlign: 'center', background: sel ? 'rgba(255,90,31,.06)' : T.surface, boxShadow: sel ? `inset 0 0 0 1px ${T.orange}` : 'none' }}>
                              <b style={{ fontSize: 13, display: 'block' }}>{opt.label}</b>
                              <small style={{ fontSize: 10.5, color: T.muted, display: 'block', marginTop: 2, lineHeight: 1.3 }}>{opt.description}</small>
                            </button>
                          );
                        })}
                      </div>
                      {locked ? (
                        <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: T.rSm, background: 'rgba(255,90,31,.08)', border: '1px solid rgba(255,90,31,.25)', fontSize: 12.5, color: '#a8360d', display: 'flex', gap: 9, lineHeight: 1.45 }}>
                          <Lock size={15} style={{ flex: '0 0 auto', marginTop: 1 }} />
                          <div><b>Muayene ekranı kilitli.</b> {m.name.split(' ')[0]} hekim olarak çalışıyor ama rolü atanmadığı için diş şemasını ve tedavi planını açamıyor. <b>Hekim</b>'i seçtiğinizde kilit kalkar.</div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 13, paddingTop: 13, borderTop: `1px dashed ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {STAFF_ROLE_PERMISSIONS[m.role].map(p => <span key={p} style={{ ...chip(T, true), fontSize: 11 }}>{PERM_LABEL[p] || p}</span>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* STEP 4 · Recall */}
            {step === 4 && (
              <>
                <div style={row(T)}>
                  <span style={{ width: 11, height: 11, borderRadius: 99, background: recallOn ? T.orange : T.muted2 }} />
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 14 }}>Kontrol çağrısı otomasyonu</b>
                    <span style={{ display: 'block', color: T.muted, fontSize: 12 }}>Tedavi bitince hasta “Çağrılacaklar” listesine düşer</span>
                  </div>
                  <button onClick={() => setRecallOn(!recallOn)} style={chip(T, recallOn)}>{recallOn ? 'Açık' : 'Kapalı'}</button>
                </div>
                <Field T={T} label="Hatırlatma notu (opsiyonel)">
                  <Inp T={T} value={recallNote} onChange={setRecallNote} placeholder="Ör. 6 ay sonra ücretsiz kontrol" />
                </Field>
                <div style={callout(T)}>Kontrol tarihi her hasta / tedavi planında ayrıca belirlenir. Tarihi gelenler Panel'deki <b>“Çağrılacaklar”</b> kartında toplanır ve tek dokunuşla WhatsApp hatırlatması gönderilir.</div>
              </>
            )}
          </div>

          {/* FOOTER */}
          <div style={{ padding: '18px 26px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surface2 }}>
            <button onClick={() => step === 0 ? navigate('/') : setStep(step - 1)} style={{ ...btn(T), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ChevronLeft size={16} /> {step === 0 ? 'Vazgeç' : 'Geri'}
            </button>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {step === 3 && lockedStaff.length > 0 && <span style={{ fontSize: 12, color: '#c53f10', fontWeight: 600, display: 'inline-flex', gap: 5, alignItems: 'center' }}><ShieldCheck size={14} />{lockedStaff.length} rol eksik</span>}
              <span style={{ fontSize: 12, color: T.muted, alignSelf: 'center' }}>Adım {step + 1} / {STEPS.length}</span>
              <button onClick={next} disabled={saving} style={{ ...btn(T), background: T.ink, color: T.cream, borderColor: T.ink, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: saving ? .6 : 1 }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                {step === STEPS.length - 1 ? 'Kurulumu bitir' : 'İleri'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Step headers ──
const StepHead: Record<string, { title: string; desc: string }> = {
  clinic: { title: 'Klinik bilgileri', desc: 'Kliniğinizin adı ve çalışma düzeni. Sektörü Diş Hekimliği seçtiğinizde hasta dosyası, diş şeması ve kontrol çağrısı otomatik açılır.' },
  services: { title: 'Tedaviler', desc: 'Sunduğunuz tedavileri süre, ücret ve renkleriyle tanımlayın. Randevu takviminde bu renkler kullanılır.' },
  resources: { title: 'Üniteler', desc: 'Aynı anda kaç hastaya bakabileceğinizi belirleyen fiziksel kaynaklar. Bir randevu bir üniteyi işgal eder.' },
  staff: { title: 'Ekip & Roller', desc: 'Her ekip üyesine bir rol atayın. Rol; kişinin diş şemasına, tedavi planına ve tahsilata erişimini belirler. Hekim rolü verilmeyen kullanıcı muayene ekranını açamaz — burada çözülür.' },
  recall: { title: 'Kontrol çağrısı (Recall)', desc: 'Tedavi biten hastalar için otomatik kontrol hatırlatması. Belirlediğiniz süre sonunda hasta “Çağrılacaklar” listesine düşer.' },
};

const PERM_LABEL: Record<string, string> = {
  'appointments:view-own': 'Kendi randevusu', 'appointments:view-all': 'Randevu (tümü)',
  'appointments:create': 'Randevu oluştur', 'appointments:update-own': 'Randevu düzenle',
  'appointments:update-all': 'Randevu düzenle (tümü)', 'patients:view': 'Hasta görüntüle',
  'patients:edit': 'Hasta düzenle', 'dental-chart:view': 'Diş şeması (görüntüle)',
  'dental-chart:edit': 'Diş şeması', 'treatment-plans:view': 'Tedavi planı (görüntüle)',
  'treatment-plans:edit': 'Tedavi planı', 'payments:view': 'Tahsilat (görüntüle)', 'payments:collect': 'Tahsilat',
};

// ── UI atoms ──
const inpBase = (T: typeof LT): React.CSSProperties => ({ padding: '11px 13px', border: `1px solid ${T.border2}`, borderRadius: T.rSm, background: T.surface, fontSize: 14, color: T.ink, fontFamily: 'inherit', outline: 'none' });
const row = (T: typeof LT): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: `1px solid ${T.border}`, borderRadius: T.rSm, background: T.surface, marginBottom: 9 });
const chip = (T: typeof LT, on: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? 'rgba(255,90,31,.3)' : T.border}`, background: on ? 'rgba(255,90,31,.1)' : T.surface2, color: on ? '#c53f10' : T.ink });
const xBtn = (T: typeof LT): React.CSSProperties => ({ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto' });
const addBtn = (T: typeof LT): React.CSSProperties => ({ width: '100%', padding: 12, border: `1.5px dashed ${T.border2}`, borderRadius: T.rSm, background: 'transparent', color: T.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 });
const btn = (T: typeof LT): React.CSSProperties => ({ padding: '11px 20px', borderRadius: T.rSm, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', border: `1px solid ${T.border2}`, background: T.surface, color: T.ink });
const callout = (T: typeof LT): React.CSSProperties => ({ padding: '14px 16px', borderRadius: T.rSm, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 13, color: T.muted, lineHeight: 1.55, marginTop: 6 });

function Field({ T, label, children }: { T: typeof LT; label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}>
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.muted, marginBottom: 6, display: 'block' }}>{label}</span>
    {children}
  </div>;
}
function Inp({ T, value, onChange, placeholder }: { T: typeof LT; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{ ...inpBase(T), width: '100%' }} />;
}
function Sel({ T, value, onChange, options }: { T: typeof LT; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inpBase(T), width: '100%' }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}
