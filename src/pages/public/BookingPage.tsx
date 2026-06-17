import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  MapPin, Clock, Instagram, Phone, Check, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, User, Loader2, ArrowRight, PartyPopper,
} from 'lucide-react';

// ── Müşteriye dönük sabit light tema ──────────────────────────
const C = {
  page:    '#F3ECE0',
  surface: '#FFFFFF',
  surface2:'#FAF7F3',
  ink:     '#0E0E0E',
  orange:  '#FF5A1F',
  border:  'rgba(14,14,14,0.10)',
  border2: 'rgba(14,14,14,0.16)',
  muted:   'rgba(14,14,14,0.52)',
  muted2:  'rgba(14,14,14,0.32)',
  ok:      '#2D8F32',
  r:  '16px', rSm: '11px', rXs: '8px',
  shadow:  '0 2px 10px rgba(14,14,14,0.06),0 10px 30px rgba(14,14,14,0.07)',
};

const FN_URL  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-booking`;
const ANON    = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const DAY_TR  = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MON_TR  = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

type Svc   = { id: string; name: string; duration: number; color: string; price: number | null };
type Stf   = { id: string; name: string; specialty: string | null; color: string };
type WH     = { day: number; start: string; end: string; isOff: boolean; dayName: string };
type Biz   = {
  name: string; bio: string | null; logoUrl: string | null; coverUrl: string | null;
  galleryUrls: string[]; address: string | null; phone: string | null;
  instagramUrl: string | null; mapsUrl: string | null; workingHours: WH[];
};

async function callFn(body: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }

export function BookingPage() {
  const { slug = '' } = useParams();

  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [biz, setBiz]           = useState<Biz | null>(null);
  const [services, setServices] = useState<Svc[]>([]);
  const [staff, setStaff]       = useState<Stf[]>([]);

  const [step, setStep]         = useState(1);                 // 1,2,3
  const [svcId, setSvcId]       = useState<string | null>(null);
  const [stfId, setStfId]       = useState<string>('any');
  const [date, setDate]         = useState<string | null>(null);
  const [time, setTime]         = useState<string | null>(null);

  const [slots, setSlots]       = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [note, setNote]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState<null | { date: string; time: string; service: string; status: string }>(null);

  // bekleme listesi (dolu gün)
  const [wlName, setWlName]     = useState('');
  const [wlPhone, setWlPhone]   = useState('');
  const [wlBusy, setWlBusy]     = useState(false);
  const [wlJoined, setWlJoined] = useState(false);

  // ── profil yükle ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { ok, json } = await callFn({ action: 'profile', slug });
      if (!ok || !json.business) { setNotFound(true); setLoading(false); return; }
      setBiz(json.business); setServices(json.services || []); setStaff(json.staff || []);
      setLoading(false);
    })();
  }, [slug]);

  const selSvc = useMemo(() => services.find(s => s.id === svcId) || null, [services, svcId]);

  // ── gelecek 21 gün (açık günler) ──
  const days = useMemo(() => {
    const out: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 28 && out.length < 21; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const wh = biz?.workingHours.find(h => h.day === d.getDay());
      if (wh && !wh.isOff) out.push(d);
    }
    return out;
  }, [biz]);

  // ── slot getir ──
  const fetchSlots = useCallback(async (d: string) => {
    if (!svcId) return;
    setSlotsLoading(true); setSlots([]); setTime(null);
    const { ok, json } = await callFn({ action: 'slots', slug, serviceId: svcId, staffId: stfId, date: d });
    setSlots(ok && Array.isArray(json.slots) ? json.slots : []);
    setSlotsLoading(false);
  }, [slug, svcId, stfId]);

  useEffect(() => { if (step === 2 && date) fetchSlots(date); }, [step, date, stfId, fetchSlots]);

  const goStep = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const joinWaitlist = async () => {
    if (!svcId || !date || !wlName.trim() || wlPhone.trim().length < 7) return;
    setWlBusy(true);
    const { ok } = await callFn({ action: 'waitlist', slug, serviceId: svcId, date, customerName: wlName.trim(), customerPhone: wlPhone.replace(/\s/g, '') });
    setWlBusy(false);
    if (ok) setWlJoined(true);
  };

  const submit = async () => {
    if (!svcId || !date || !time || !name.trim() || phone.trim().length < 7) return;
    setSubmitting(true);
    const { ok, status, json } = await callFn({
      action: 'book', slug, serviceId: svcId, staffId: stfId, date, time,
      customerName: name.trim(), customerPhone: phone.replace(/\s/g, ''), customerEmail: email.trim(), note: note.trim(),
    });
    setSubmitting(false);
    if (ok && json.success) {
      setDone({ date: json.date, time: json.time, service: json.service, status: json.status });
    } else if (status === 409) {
      setStep(2); setTime(null); if (date) fetchSlots(date);
      alert('Seçtiğiniz saat az önce dolmuş olabilir. Lütfen tekrar bir saat seçin.');
    } else {
      alert(json.error || 'Randevu oluşturulamadı. Lütfen tekrar deneyin.');
    }
  };

  // ── durum ekranları ──
  if (loading) return (
    <div style={sFull}><Loader2 size={30} color={C.orange} style={{ animation: 'tfspin 0.8s linear infinite' }} /><style>{spinKf}</style></div>
  );
  if (notFound || !biz) return (
    <div style={sFull}>
      <div style={{ textAlign: 'center', color: C.muted }}>
        <CalendarIcon size={40} color={C.muted2} />
        <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginTop: 14 }}>İşletme bulunamadı</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Bu randevu bağlantısı geçersiz veya kaldırılmış olabilir.</div>
      </div>
    </div>
  );

  const fmtFull = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const openDays = biz.workingHours.filter(h => !h.isOff);

  return (
    <div style={{ minHeight: '100vh', background: C.page, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', color: C.ink, paddingBottom: 40 }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* ── KAPAK + PROFİL ── */}
        <div style={{ position: 'relative' }}>
          <div style={{ height: 150, background: biz.coverUrl ? `center/cover url(${biz.coverUrl})` : `linear-gradient(120deg,${C.ink},#2a2018)` }} />
          <div style={{ padding: '0 20px', marginTop: -38, position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <div style={{ width: 76, height: 76, borderRadius: 20, background: biz.logoUrl ? `center/cover url(${biz.logoUrl})` : C.ink, color: '#F3ECE0', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 800, border: `3px solid ${C.page}`, flexShrink: 0, boxShadow: C.shadow }}>
              {!biz.logoUrl && initials(biz.name)}
            </div>
            <div style={{ paddingBottom: 4, minWidth: 0 }}>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{biz.name}</div>
              {biz.address && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.muted, marginTop: 3 }}><MapPin size={13} /> {biz.address}</div>}
            </div>
          </div>
        </div>

        {/* meta satırı */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 20px 0' }}>
          {openDays.length > 0 && (
            <Chip><Clock size={13} /> {DAY_TR[openDays[0].day]}–{DAY_TR[openDays[openDays.length - 1].day]} · {openDays[0].start}–{openDays[0].end}</Chip>
          )}
          {biz.phone && <Chip><Phone size={13} /> {biz.phone}</Chip>}
          {biz.instagramUrl && <a href={biz.instagramUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Chip><Instagram size={13} /> Instagram</Chip></a>}
          {biz.mapsUrl && <a href={biz.mapsUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Chip><MapPin size={13} /> Haritada Gör</Chip></a>}
        </div>

        {biz.bio && <div style={{ padding: '12px 20px 0', fontSize: 13.5, lineHeight: 1.6, color: 'rgba(14,14,14,0.7)' }}>{biz.bio}</div>}

        {/* galeri */}
        {biz.galleryUrls.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 20px 0', scrollbarWidth: 'none' }}>
            {biz.galleryUrls.map((u, i) => (
              <div key={i} style={{ width: 110, height: 80, borderRadius: C.rSm, background: `center/cover url(${u})`, flexShrink: 0, border: `1px solid ${C.border}` }} />
            ))}
          </div>
        )}

        {/* ── STEPPER ── */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '22px 20px 4px' }}>
          {['Hizmet', 'Tarih & Saat', 'Bilgiler'].map((lbl, i) => {
            const n = i + 1; const active = step === n; const past = step > n;
            return (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : '0 0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
                    background: active || past ? C.orange : C.surface, color: active || past ? '#fff' : C.muted2,
                    border: active || past ? 'none' : `1px solid ${C.border2}`, boxShadow: active ? '0 0 0 3px rgba(255,90,31,0.16)' : 'none' }}>
                    {past ? <Check size={13} /> : n}
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? C.ink : C.muted, whiteSpace: 'nowrap' }}>{lbl}</span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: 1.5, background: past ? C.orange : C.border, margin: '0 10px' }} />}
              </div>
            );
          })}
        </div>

        {/* ── İÇERİK ── */}
        <div style={{ padding: '14px 20px 0' }}>

          {done ? (
            <SuccessCard biz={biz} done={done} />
          ) : (
          <div style={card}>
            {/* STEP 1 */}
            {step === 1 && (
              <>
                <Title>Hizmet seçin</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
                  {services.map(s => {
                    const sel = svcId === s.id;
                    return (
                      <button key={s.id} onClick={() => setSvcId(s.id)} style={{ textAlign: 'left', padding: 13, borderRadius: C.rSm, cursor: 'pointer', background: sel ? '#FFF4EF' : C.surface2, border: sel ? `1.5px solid ${C.orange}` : `1px solid ${C.border}`, fontFamily: 'inherit', transition: 'all .15s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={11} /> {s.duration} dk</div>
                        {s.price != null && <div style={{ fontSize: 12.5, fontWeight: 700, color: C.orange, marginTop: 4 }}>{s.price.toLocaleString('tr-TR')} ₺</div>}
                      </button>
                    );
                  })}
                </div>

                <Title>Personel</Title>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  <StaffChip sel={stfId === 'any'} onClick={() => setStfId('any')} initials="★" name="Fark etmez" sub="İlk müsait" color={C.ink} />
                  {staff.map(s => <StaffChip key={s.id} sel={stfId === s.id} onClick={() => setStfId(s.id)} initials={initials(s.name)} name={s.name} sub={s.specialty || ''} color={s.color} />)}
                </div>

                <PrimaryBtn disabled={!svcId} onClick={() => goStep(2)}>Devam et <ArrowRight size={16} /></PrimaryBtn>
              </>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <>
                <Title>Tarih seçin</Title>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 18, scrollbarWidth: 'none' }}>
                  {days.map(d => {
                    const ds = ymd(d); const sel = date === ds;
                    return (
                      <button key={ds} onClick={() => setDate(ds)} style={{ flexShrink: 0, width: 58, padding: '10px 0', borderRadius: C.rSm, cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
                        background: sel ? C.orange : C.surface2, color: sel ? '#fff' : C.ink, border: sel ? 'none' : `1px solid ${C.border}`, transition: 'all .15s' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.7 }}>{DAY_TR[d.getDay()]}</div>
                        <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.1, margin: '2px 0' }}>{d.getDate()}</div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>{MON_TR[d.getMonth()]}</div>
                      </button>
                    );
                  })}
                </div>

                <Title>{date ? 'Saat seçin' : 'Önce tarih seçin'}</Title>
                {!date ? (
                  <div style={{ fontSize: 12.5, color: C.muted2, padding: '6px 0 18px' }}>Müsait saatleri görmek için yukarıdan bir gün seçin.</div>
                ) : slotsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><Loader2 size={22} color={C.orange} style={{ animation: 'tfspin .8s linear infinite' }} /></div>
                ) : slots.length === 0 ? (
                  <div style={{ padding: '4px 0 18px' }}>
                    <div style={{ fontSize: 12.5, color: C.muted2, marginBottom: 12 }}>Bu gün için müsait saat yok 😔 Başka bir gün deneyebilir ya da bekleme listesine katılabilirsin.</div>
                    {wlJoined ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: '#EAF3DE', borderRadius: C.rSm, fontSize: 13, fontWeight: 600, color: C.ok }}>
                        <Check size={16} /> Bekleme listesine eklendin! Yer açılınca WhatsApp'tan haber vereceğiz.
                      </div>
                    ) : (
                      <div style={{ background: C.surface2, borderRadius: C.rSm, padding: 13 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 9 }}>Yer açılınca haber ver</div>
                        <input value={wlName} onChange={e => setWlName(e.target.value)} placeholder="Adın" style={{ ...input, marginBottom: 8 }} />
                        <input value={wlPhone} onChange={e => setWlPhone(e.target.value)} placeholder="05XX XXX XX XX" inputMode="tel" style={{ ...input, marginBottom: 10 }} />
                        <button onClick={joinWaitlist} disabled={wlBusy || !wlName.trim() || wlPhone.trim().length < 7}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 11, borderRadius: C.rSm, border: 'none', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: (wlBusy || !wlName.trim() || wlPhone.trim().length < 7) ? '#E9E1D5' : C.ink, color: (wlBusy || !wlName.trim() || wlPhone.trim().length < 7) ? C.muted2 : '#fff' }}>
                          {wlBusy ? <Loader2 size={15} style={{ animation: 'tfspin .8s linear infinite' }} /> : 'Bekleme listesine katıl'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 22 }}>
                    {slots.map(t => {
                      const sel = time === t;
                      return (
                        <button key={t} onClick={() => setTime(t)} style={{ padding: '9px 0', borderRadius: C.rXs, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                          background: sel ? C.orange : C.surface, color: sel ? '#fff' : C.ink, border: sel ? `1px solid ${C.orange}` : `1px solid ${C.border}`, transition: 'all .12s' }}>{t}</button>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <GhostBtn onClick={() => goStep(1)}><ChevronLeft size={16} /> Geri</GhostBtn>
                  <PrimaryBtn disabled={!time} onClick={() => goStep(3)}>Devam et <ArrowRight size={16} /></PrimaryBtn>
                </div>
              </>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <>
                <div style={{ background: C.surface2, borderRadius: C.rSm, padding: 14, marginBottom: 18 }}>
                  <SummaryRow k="Hizmet" v={selSvc?.name || '—'} />
                  <SummaryRow k="Personel" v={stfId === 'any' ? 'Fark etmez' : (staff.find(s => s.id === stfId)?.name || '—')} />
                  <SummaryRow k="Tarih" v={date ? fmtFull(date) : '—'} />
                  <SummaryRow k="Saat" v={time || '—'} last />
                </div>

                <Title>İletişim bilgileriniz</Title>
                <Field label="Ad Soyad *"><input value={name} onChange={e => setName(e.target.value)} placeholder="Adınız" style={input} /></Field>
                <Field label="Telefon *"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="05XX XXX XX XX" inputMode="tel" style={input} /></Field>
                <Field label="E-posta (opsiyonel)"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="ornek@mail.com" inputMode="email" style={input} /></Field>
                <Field label="Not (opsiyonel)"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Eklemek istediğiniz bir şey?" style={input} /></Field>

                <div style={{ fontSize: 11.5, color: C.muted, margin: '4px 0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={12} /> Onay ve hatırlatma WhatsApp üzerinden gönderilecek.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <GhostBtn onClick={() => goStep(2)}><ChevronLeft size={16} /> Geri</GhostBtn>
                  <PrimaryBtn disabled={submitting || !name.trim() || phone.trim().length < 7} onClick={submit}>
                    {submitting ? <Loader2 size={16} style={{ animation: 'tfspin .8s linear infinite' }} /> : <>Randevuyu onayla <Check size={16} /></>}
                  </PrimaryBtn>
                </div>
              </>
            )}
          </div>
          )}

          {/* footer */}
          <div style={{ textAlign: 'center', fontSize: 11, color: C.muted2, marginTop: 22 }}>
            <span style={{ fontWeight: 600 }}>Luera TimeFlow</span> ile güçlendirildi
          </div>
        </div>
      </div>
      <style>{spinKf}</style>
    </div>
  );
}

// ── küçük bileşenler ──
const sFull: React.CSSProperties = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.page };
const spinKf = '@keyframes tfspin{to{transform:rotate(360deg)}}';
const card: React.CSSProperties = { background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, padding: 20, boxShadow: C.shadow };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: C.rXs, border: `1px solid ${C.border2}`, fontSize: 14, fontFamily: 'inherit', color: C.ink, background: C.surface2, outline: 'none' };

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 11 }}>{children}</div>;
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'rgba(14,14,14,0.62)', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 11px' }}>{children}</span>;
}
function StaffChip({ sel, onClick, initials, name, sub, color }: { sel: boolean; onClick: () => void; initials: string; name: string; sub: string; color: string }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px 8px 8px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
      background: sel ? '#FFF4EF' : C.surface2, border: sel ? `1.5px solid ${C.orange}` : `1px solid ${C.border}`, transition: 'all .15s' }}>
      <span style={{ width: 30, height: 30, borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</span>
      <span style={{ textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>{name}</span>
        {sub && <span style={{ display: 'block', fontSize: 10.5, color: C.muted }}>{sub}</span>}
      </span>
    </button>
  );
}
function SummaryRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: last ? 'none' : `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12.5, color: C.muted }}>{k}</span>
      <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'rgba(14,14,14,0.7)' }}>{label}</label>{children}</div>;
}
function PrimaryBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '13px', borderRadius: C.rSm, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? '#E9E1D5' : C.orange, color: disabled ? C.muted2 : '#fff', transition: 'all .15s' }}>{children}</button>
  );
}
function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '13px 18px', borderRadius: C.rSm, border: `1px solid ${C.border2}`, background: 'none', fontSize: 14, fontWeight: 600, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
  );
}
function SuccessCard({ biz, done }: { biz: Biz; done: { date: string; time: string; service: string; status: string } }) {
  const fmtFull = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const confirmed = done.status === 'confirmed';
  return (
    <div style={{ ...card, textAlign: 'center', padding: '34px 22px' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FFF4EF', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
        <PartyPopper size={30} color={C.orange} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 800 }}>{confirmed ? 'Randevunuz onaylandı!' : 'Randevu talebiniz alındı!'}</div>
      <div style={{ fontSize: 13.5, color: C.muted, marginTop: 7, marginBottom: 20 }}>
        {confirmed ? 'WhatsApp üzerinden onay mesajı gönderildi.' : `${biz.name} talebinizi onaylayınca WhatsApp'tan bilgilendirileceksiniz.`}
      </div>
      <div style={{ background: C.surface2, borderRadius: C.rSm, padding: 14, textAlign: 'left', maxWidth: 320, margin: '0 auto' }}>
        <SummaryRow k="Hizmet" v={done.service} />
        <SummaryRow k="Tarih" v={fmtFull(done.date)} />
        <SummaryRow k="Saat" v={done.time} last />
      </div>
    </div>
  );
}
