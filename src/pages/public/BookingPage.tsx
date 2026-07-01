import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';

// ── Backend (public-booking edge fn) — veri katmanı korunur ───────────────────
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-booking`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const WDL = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];          // getDay() 0=Pazar
const WD_LBL = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];        // takvim başlığı (Pzt başlangıçlı)
const MON = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

type Svc = { id: string; name: string; duration: number; color: string; price: number | null };
type Stf = { id: string; name: string; specialty: string | null; color: string };
type WH = { day: number; start: string; end: string; isOff: boolean; dayName: string };
type Biz = {
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
const pad = (n: number) => String(n).padStart(2, '0');
const t2m = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const m2t = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const uid = () => Math.random().toString(36).slice(2, 10);

// Sepet satırı — bir hizmet + seçilen personel/tarih/saat
type Line = { id: string; serviceId: string; svcName: string; duration: number; price: number | null; color: string; staffId: string; staffName: string; date: string; time: string; endTime: string };

const AVATAR_BG: Record<string, string> = {}; // staff color → soft bg (hesaplanır)
function softBg(hex: string) {
  if (AVATAR_BG[hex]) return AVATAR_BG[hex];
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  const s = `rgba(${r},${g},${b},0.20)`;
  AVATAR_BG[hex] = s;
  return s;
}

export function BookingPage() {
  const { slug = '' } = useParams();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [services, setServices] = useState<Svc[]>([]);
  const [staff, setStaff] = useState<Stf[]>([]);

  const [step, setStep] = useState(1);                 // 1,2,3,4(onay)
  const [svcId, setSvcId] = useState<string | null>(null);
  const [stfId, setStfId] = useState<string>('any');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);          // sepet — eklenen hizmetler
  const [done, setDone] = useState<null | { status: string; lines: { service: string; date: string; time: string }[] }>(null);

  // bekleme listesi (dolu gün)
  const [wlName, setWlName] = useState('');
  const [wlPhone, setWlPhone] = useState('');
  const [wlBusy, setWlBusy] = useState(false);
  const [wlJoined, setWlJoined] = useState(false);

  // takvim ay durumu
  const [calY, setCalY] = useState(() => new Date().getFullYear());
  const [calM, setCalM] = useState(() => new Date().getMonth());

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
  const selStf = useMemo(() => staff.find(s => s.id === stfId) || null, [staff, stfId]);

  // ── slot getir ──
  const fetchSlots = useCallback(async (d: string) => {
    if (!svcId) return;
    setSlotsLoading(true); setSlots([]); setTime(null); setWlJoined(false);
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

  // ── sepet (İşlemler) ──
  const buildLine = (): Line | null => {
    if (!selSvc || !date || !time) return null;
    return {
      id: uid(), serviceId: selSvc.id, svcName: selSvc.name, duration: selSvc.duration,
      price: selSvc.price, color: selSvc.color, staffId: stfId,
      staffName: stfId === 'any' ? 'Fark etmez' : (selStf?.name || '—'),
      date, time, endTime: m2t(t2m(time) + selSvc.duration),
    };
  };
  const clearDraft = () => { setSvcId(null); setStfId('any'); setDate(null); setTime(null); setSlots([]); };
  const addAnother = () => { const l = buildLine(); if (!l) return; setLines(p => [...p, l]); clearDraft(); goStep(1); };
  const continueInfo = () => { const l = buildLine(); if (!l) return; setLines(p => [...p, l]); clearDraft(); goStep(3); };
  const removeLine = (id: string) => setLines(p => p.filter(l => l.id !== id));
  const cartTotal = lines.reduce((s, l) => s + (l.price || 0), 0) + (selSvc?.price || 0);

  // sepetteki seçimlere göre çakışan saatleri süz
  const shownSlots = useMemo(() => {
    if (!selSvc) return slots;
    const dur = selSvc.duration;
    return slots.filter(t => {
      const s = t2m(t), e = s + dur;
      return !lines.some(l => {
        if (l.date !== date) return false;
        const ls = t2m(l.time), le = t2m(l.endTime);
        const sameStaff = stfId !== 'any' && l.staffId !== 'any' && stfId === l.staffId;
        return sameStaff ? (s < le && ls < e) : (s === ls);
      });
    });
  }, [slots, lines, date, stfId, selSvc]);

  const submit = async () => {
    if (lines.length === 0 || !name.trim() || phone.trim().length < 7) return;
    setSubmitting(true);
    const { ok, status, json } = await callFn({
      action: 'book', slug,
      lines: lines.map(l => ({ serviceId: l.serviceId, staffId: l.staffId, date: l.date, time: l.time })),
      customerName: name.trim(), customerPhone: phone.replace(/\s/g, ''), customerEmail: email.trim(), note: note.trim(),
    });
    setSubmitting(false);
    if (ok && json.success) {
      setDone({ status: json.status, lines: json.lines || [] });
      setStep(4);
    } else if (status === 409) {
      if (typeof json.lineIndex === 'number') setLines(p => p.filter((_, i) => i !== json.lineIndex));
      alert(json.error || 'Seçtiğiniz saatlerden biri az önce dolmuş olabilir. Lütfen tekrar seçin.');
      goStep(1);
    } else {
      alert(json.error || 'Randevu oluşturulamadı. Lütfen tekrar deneyin.');
    }
  };

  const reset = () => {
    setStep(1); setSvcId(null); setStfId('any'); setDate(null); setTime(null);
    setSlots([]); setName(''); setPhone(''); setEmail(''); setNote(''); setDone(null);
    setLines([]); setWlName(''); setWlPhone(''); setWlJoined(false);
    window.scrollTo({ top: 0 });
  };

  // ── durum ekranları ──
  if (loading) return <div className="tf-page"><div className="tf-shell" style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}><div className="tf-spin" /></div><BookingCSS /></div>;
  if (notFound || !biz) return (
    <div className="tf-page"><div className="tf-shell" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#F3EDE3' }}>İşletme bulunamadı</div>
      <div style={{ fontSize: 13, marginTop: 8, color: 'rgba(243,237,227,.48)' }}>Bu randevu bağlantısı geçersiz veya kaldırılmış olabilir.</div>
    </div><BookingCSS /></div>
  );

  const fmtFull = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const openDays = biz.workingHours.filter(h => !h.isOff).sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7));
  const hoursLabel = openDays.length > 0
    ? `${DAY_SHORT[openDays[0].day]}–${DAY_SHORT[openDays[openDays.length - 1].day]} · ${openDays[0].start}–${openDays[0].end}`
    : 'Randevu ile';

  // takvim hücreleri
  const daysInMonth = new Date(calY, calM + 1, 0).getDate();
  const firstOffset = ((new Date(calY, calM, 1).getDay()) + 6) % 7; // Pzt=0
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);

  return (
    <div className="tf-page">
      <div className="tf-shell">
        {/* Hero */}
        <div className="tf-hero">
          <div className="tf-orb1" /><div className="tf-orb2" /><div className="tf-orb3" />
          <div className="tf-hlogo">luera<span className="tf-hdot" /></div>
          <div className="tf-hmark">TIMEFLOW</div>
        </div>

        {/* Profile */}
        <div className="tf-profile">
          <div className="tf-appicon" style={biz.logoUrl ? { background: `center/cover url(${biz.logoUrl})`, color: 'transparent' } : undefined}>
            {!biz.logoUrl && initials(biz.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="tf-pname">{biz.name}</div>
            <div className="tf-pmeta"><span className="tf-pdot" />{hoursLabel}</div>
          </div>
        </div>

        {/* Progress */}
        {step !== 4 && (
          <div className="tf-progress">
            {['Hizmet', 'Tarih & Saat', 'Bilgiler'].map((lbl, i) => {
              const n = i + 1;
              const cls = step > n ? 'done' : step === n ? 'act' : 'pend';
              return (
                <div key={lbl} className="tf-ps" style={i < 2 ? { flex: 1 } : undefined}>
                  <div className={`tf-pn ${cls}`}>{step > n ? '✓' : n}</div>
                  <div className={`tf-pl ${step === n ? 'act' : 'pend'}`}>{lbl}</div>
                  {i < 2 && <div className={`tf-pline ${step > n ? 'on' : ''}`} />}
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="tf-bd">

          {/* STEP 1 — Hizmet & Personel */}
          {step === 1 && (
            <div className="tf-sin">
              <div className="tf-slbl">Hizmet seçin</div>
              <div className="tf-sgrid">
                {services.map(s => (
                  <button key={s.id} className={`tf-sc${svcId === s.id ? ' sel' : ''}`} onClick={() => setSvcId(s.id)}>
                    <span className="tf-bar" style={{ background: `linear-gradient(90deg,${s.color},${s.color}99)`, opacity: svcId === s.id ? 1 : 0 }} />
                    <div className="tf-sdot" style={{ background: s.color, boxShadow: svcId === s.id ? `0 0 6px ${s.color}66` : 'none' }} />
                    <div className="tf-sname">{s.name}</div>
                    <div className="tf-smeta">{ClockSvg} {s.duration} dk</div>
                    {s.price != null && <div className="tf-sprice">{s.price.toLocaleString('tr-TR')} ₺</div>}
                  </button>
                ))}
              </div>

              {staff.length > 0 && <>
                <div className="tf-slbl">Personel</div>
                <div className="tf-staffrow">
                  <button className={`tf-sc2${stfId === 'any' ? ' sel' : ''}`} onClick={() => setStfId('any')}>
                    <div className="tf-sav" style={{ background: 'rgba(255,90,31,.18)', color: '#FF5A1F' }}>★</div>
                    <div className="tf-sn">Fark etmez</div><div className="tf-srole">İlk müsait</div>
                  </button>
                  {staff.map(s => (
                    <button key={s.id} className={`tf-sc2${stfId === s.id ? ' sel' : ''}`} onClick={() => setStfId(s.id)}>
                      <div className="tf-sav" style={{ background: softBg(s.color), color: s.color }}>{initials(s.name)}</div>
                      <div className="tf-sn">{s.name}</div>{s.specialty && <div className="tf-srole">{s.specialty}</div>}
                    </button>
                  ))}
                </div>
              </>}

              {lines.length > 0 && <CartList lines={lines} onRemove={removeLine} />}

              <button className="tf-cta" onClick={() => goStep(2)} disabled={!svcId}>
                {lines.length > 0 ? 'Bu hizmet için saat seç' : 'Devam et'} <span className="tf-arr">→</span>
              </button>
            </div>
          )}

          {/* STEP 2 — Tarih & Saat */}
          {step === 2 && (
            <div className="tf-sin">
              <button className="tf-back" onClick={() => goStep(1)}>{ChevSvg} Geri</button>
              <div className="tf-slbl">Tarih seçin</div>
              <div className="tf-cal">
                <div className="tf-chdr">
                  <button className="tf-cnav" onClick={() => { let m = calM - 1, y = calY; if (m < 0) { m = 11; y--; } setCalM(m); setCalY(y); }}>‹</button>
                  <div className="tf-cmon">{MON[calM]} {calY}</div>
                  <button className="tf-cnav" onClick={() => { let m = calM + 1, y = calY; if (m > 11) { m = 0; y++; } setCalM(m); setCalY(y); }}>›</button>
                </div>
                <div className="tf-cgrid">
                  {WD_LBL.map(w => <div key={w} className="tf-dn">{w}</div>)}
                  {Array.from({ length: firstOffset }).map((_, i) => <div key={'e' + i} className="tf-cd emp" />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dt = new Date(calY, calM, day);
                    const ds = `${calY}-${pad(calM + 1)}-${pad(day)}`;
                    const wh = biz.workingHours.find(h => h.day === dt.getDay());
                    const closed = !wh || wh.isOff;
                    const past = dt < today0;
                    const disabled = past || closed;
                    const today = dt.getTime() === today0.getTime();
                    const sel = date === ds;
                    let cls = 'tf-cd';
                    if (disabled) cls += ' past';
                    else if (sel) cls += ' sel';
                    else if (today) cls += ' today';
                    return <div key={ds} className={cls} onClick={disabled ? undefined : () => setDate(ds)}>{day}</div>;
                  })}
                </div>
              </div>

              <div className="tf-slbl" style={{ marginTop: 20 }}>{date ? 'Saat seçin' : 'Önce tarih seçin'}</div>
              {!date ? (
                <div style={{ fontSize: 12.5, color: 'rgba(243,237,227,.28)', paddingBottom: 4 }}>Müsait saatleri görmek için bir gün seçin.</div>
              ) : slotsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><div className="tf-spin" /></div>
              ) : shownSlots.length === 0 ? (
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontSize: 12.5, color: 'rgba(243,237,227,.42)', marginBottom: 12, lineHeight: 1.5 }}>Bu gün için müsait saat yok. Başka gün deneyebilir ya da bekleme listesine katılabilirsin.</div>
                  {wlJoined ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'rgba(124,196,127,.10)', border: '1px solid rgba(124,196,127,.3)', borderRadius: 14, fontSize: 13, fontWeight: 600, color: '#7CC47F' }}>✓ Bekleme listesine eklendin! Yer açılınca WhatsApp'tan haber vereceğiz.</div>
                  ) : (
                    <div className="tf-cal" style={{ padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, color: '#F3EDE3', letterSpacing: '.04em' }}>Yer açılınca haber ver</div>
                      <input className="tf-inp" value={wlName} onChange={e => setWlName(e.target.value)} placeholder="Adın" style={{ marginBottom: 8 }} />
                      <input className="tf-inp" value={wlPhone} onChange={e => setWlPhone(e.target.value)} placeholder="05XX XXX XX XX" inputMode="tel" style={{ marginBottom: 10 }} />
                      <button className="tf-cta" style={{ marginTop: 0 }} onClick={joinWaitlist} disabled={wlBusy || !wlName.trim() || wlPhone.trim().length < 7}>
                        {wlBusy ? <span className="tf-spin tf-spin-sm" /> : 'Bekleme listesine katıl'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="tf-tgrid">
                  {shownSlots.map(t => (
                    <button key={t} className={`tf-ts${time === t ? ' sel' : ''}`} onClick={() => setTime(t)}>{t}</button>
                  ))}
                </div>
              )}

              {lines.length > 0 && <CartList lines={lines} onRemove={removeLine} />}

              <button className="tf-cta2" onClick={addAnother} disabled={!date || !time}>+ Başka hizmet ekle</button>
              <button className="tf-cta" onClick={continueInfo} disabled={!date || !time}>
                Devam et {lines.length > 0 && <span style={{ opacity: .8, fontWeight: 600 }}>· {lines.length + 1} işlem</span>} <span className="tf-arr">→</span>
              </button>
            </div>
          )}

          {/* STEP 3 — Bilgiler & Özet */}
          {step === 3 && (
            <div className="tf-sin">
              <button className="tf-back" onClick={() => goStep(1)}>{ChevSvg} Hizmet ekle</button>
              <div className="tf-slbl">Özet · {lines.length} işlem</div>
              <div className="tf-sumc">
                {lines.map((l) => (
                  <div key={l.id} className="tf-lr">
                    <div className="tf-ldot" style={{ background: l.color }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tf-lname">{l.svcName}</div>
                      <div className="tf-lmeta">{fmtFull(l.date)} · {l.time} · {l.staffName}</div>
                    </div>
                    {l.price != null && <span className="tf-lprice">{l.price.toLocaleString('tr-TR')} ₺</span>}
                    {lines.length > 1 && <button className="tf-lx" onClick={() => removeLine(l.id)} aria-label="Kaldır">×</button>}
                  </div>
                ))}
                {cartTotal > 0 && (
                  <div className="tf-sr" style={{ borderTop: '1px solid rgba(243,237,227,.10)' }}>
                    <span className="tf-sk" style={{ fontWeight: 700 }}>Toplam</span>
                    <span className="tf-sv" style={{ color: '#FF5A1F', fontSize: 15 }}>{cartTotal.toLocaleString('tr-TR')} ₺</span>
                  </div>
                )}
              </div>

              <div className="tf-slbl" style={{ marginTop: 20 }}>İletişim</div>
              <div className="tf-ig"><label className="tf-ilbl">Ad Soyad *</label><input className="tf-inp" value={name} onChange={e => setName(e.target.value)} placeholder="Adınızı girin" /></div>
              <div className="tf-ig"><label className="tf-ilbl">Telefon *</label><input className="tf-inp" value={phone} onChange={e => setPhone(e.target.value)} placeholder="05XX XXX XX XX" inputMode="tel" /></div>
              <div className="tf-ig"><label className="tf-ilbl">E-posta</label><input className="tf-inp" value={email} onChange={e => setEmail(e.target.value)} placeholder="ornek@mail.com" inputMode="email" /></div>
              <div className="tf-ig" style={{ marginBottom: 4 }}><label className="tf-ilbl">Not (isteğe bağlı)</label><textarea className="tf-inp" value={note} onChange={e => setNote(e.target.value)} placeholder="Özel bir isteğiniz var mı?" /></div>

              <div style={{ fontSize: 11.5, color: 'rgba(243,237,227,.42)', margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>Onay ve hatırlatma WhatsApp üzerinden gönderilecek.</div>

              <button className="tf-cta" onClick={submit} disabled={submitting || !name.trim() || phone.trim().length < 7}>
                {submitting ? <span className="tf-spin tf-spin-sm" /> : <>Randevuyu Onayla&nbsp;&nbsp;✓</>}
              </button>
            </div>
          )}

          {/* STEP 4 — Onay */}
          {step === 4 && done && (
            <div className="tf-sin tf-cfm">
              <div className="tf-cring">
                <svg width="38" height="38" viewBox="0 0 38 38" fill="none"><path d="M10 20l7 7 13-15" stroke="#7CC47F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="tf-ct">{done.status === 'confirmed' ? 'Randevu Onaylandı!' : 'Randevu Talebiniz Alındı!'}</div>
              <div className="tf-cs" style={{ marginBottom: 24 }}>
                {done.status === 'confirmed' ? 'WhatsApp üzerinden onay mesajı gönderildi.' : `${biz.name} talebinizi onaylayınca WhatsApp'tan bilgilendirileceksiniz.`}
              </div>
              <div className="tf-sumc" style={{ width: '100%', textAlign: 'left' }}>
                {done.lines.map((l, i) => (
                  <div key={i} className="tf-lr">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tf-lname">{l.service}</div>
                      <div className="tf-lmeta">{fmtFull(l.date)}</div>
                    </div>
                    <span className="tf-lprice" style={{ color: '#FF5A1F' }}>{l.time}</span>
                  </div>
                ))}
              </div>
              <button className="tf-cta" style={{ width: '100%' }} onClick={reset}>Yeni Randevu Al</button>
            </div>
          )}

          <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(243,237,227,.28)', margin: '22px 0 6px' }}>
            <span style={{ fontWeight: 600, color: 'rgba(243,237,227,.42)' }}>Luera TimeFlow</span> ile güçlendirildi
          </div>
        </div>
      </div>
      <BookingCSS />
    </div>
  );
}

const fmtShort = (d: string) => { const dt = new Date(d + 'T00:00:00Z'); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`; };

function CartList({ lines, onRemove }: { lines: Line[]; onRemove: (id: string) => void }) {
  return (
    <div className="tf-cart">
      <div className="tf-cartlbl">Eklenen işlemler</div>
      {lines.map(l => (
        <div key={l.id} className="tf-lr">
          <div className="tf-ldot" style={{ background: l.color }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tf-lname">{l.svcName}</div>
            <div className="tf-lmeta">{fmtShort(l.date)} · {l.time} · {l.staffName}</div>
          </div>
          <button className="tf-lx" onClick={() => onRemove(l.id)} aria-label="Kaldır">×</button>
        </div>
      ))}
    </div>
  );
}

const ClockSvg = <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: .55, flexShrink: 0 }}><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M6 3.5v2.8l1.6 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ChevSvg = <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

// Handoff CSS — birebir port (dark, premium booking)
function BookingCSS() {
  return <style>{`
.tf-page{min-height:100vh;background:#080604;color:#F3EDE3;font-family:'Hanken Grotesk',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative;padding-bottom:calc(48px + env(safe-area-inset-bottom))}
.tf-page::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 100% 55% at 50% -5%,rgba(255,90,31,.16) 0%,transparent 68%),radial-gradient(ellipse 50% 35% at 85% 90%,rgba(201,139,219,.06) 0%,transparent 60%),radial-gradient(ellipse 40% 30% at 10% 70%,rgba(107,159,212,.05) 0%,transparent 55%)}
.tf-shell{position:relative;z-index:1;width:100%;background:#0E0A06}
@media(min-width:540px){.tf-page{padding-top:52px;padding-bottom:80px}.tf-shell{width:464px;margin:0 auto;border-radius:30px;box-shadow:0 0 0 1px rgba(243,237,227,.09),0 40px 100px rgba(0,0,0,.80),0 12px 32px rgba(0,0,0,.55)}.tf-hero{border-radius:30px 30px 0 0}}
.tf-hero{height:164px;position:relative;overflow:hidden;background:linear-gradient(150deg,#2E2010 0%,#1A1208 45%,#0C0906 100%)}
.tf-orb1{position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(255,90,31,.32) 0%,transparent 62%);top:-130px;left:-70px;animation:tff1 11s ease-in-out infinite}
.tf-orb2{position:absolute;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(201,139,219,.14) 0%,transparent 60%);top:20px;right:-30px;animation:tff2 15s ease-in-out infinite}
.tf-orb3{position:absolute;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(224,168,78,.10) 0%,transparent 60%);bottom:-60px;left:30%;animation:tff1 13s ease-in-out infinite reverse}
@keyframes tff1{0%,100%{transform:translate(0,0)}40%{transform:translate(40px,28px)}75%{transform:translate(-18px,35px)}}
@keyframes tff2{0%,100%{transform:translate(0,0)}35%{transform:translate(-30px,20px)}70%{transform:translate(15px,-25px)}}
.tf-hlogo{position:absolute;bottom:14px;left:20px;display:flex;align-items:flex-end;gap:.05em;font-weight:900;font-size:13px;letter-spacing:-.04em;color:rgba(243,237,227,.13)}
.tf-hdot{width:.18em;height:.18em;border-radius:50%;background:rgba(255,90,31,.35);margin-bottom:.05em}
.tf-hmark{position:absolute;bottom:15px;right:20px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:rgba(243,237,227,.11)}
.tf-profile{display:flex;align-items:center;gap:14px;padding:15px 20px 14px;background:rgba(12,8,4,.78);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-bottom:1px solid rgba(243,237,227,.09)}
.tf-appicon{width:46px;height:46px;border-radius:13px;flex-shrink:0;background:linear-gradient(145deg,#2C2010,#1A1208);border:1.5px solid rgba(243,237,227,.15);display:grid;place-items:center;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:14px;color:#F3EDE3}
.tf-pname{font-size:16px;font-weight:800;letter-spacing:-.025em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf-pmeta{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:11.5px;color:rgba(243,237,227,.48)}
.tf-pdot{width:6px;height:6px;border-radius:50%;background:#7CC47F;flex-shrink:0}
.tf-progress{display:flex;align-items:center;padding:13px 20px 11px;background:rgba(10,6,3,.55);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid rgba(243,237,227,.07)}
.tf-ps{display:flex;align-items:center;gap:7px}
.tf-pn{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-size:11px;font-weight:800;transition:all .4s cubic-bezier(.2,.8,.2,1)}
.tf-pn.act{background:#FF5A1F;color:#fff;box-shadow:0 0 0 4px rgba(255,90,31,.22)}
.tf-pn.done{background:#FF5A1F;color:#fff;font-size:12px}
.tf-pn.pend{background:rgba(243,237,227,.08);color:rgba(243,237,227,.28)}
.tf-pl{font-size:11px;font-weight:600;white-space:nowrap;transition:color .3s}
.tf-pl.act{color:#F3EDE3}.tf-pl.pend{color:rgba(243,237,227,.28)}
.tf-pline{flex:1;height:1px;margin:0 6px;background:rgba(243,237,227,.10);position:relative;overflow:hidden}
.tf-pline::after{content:'';position:absolute;inset:0;background:#FF5A1F;transform-origin:left;transform:scaleX(0);transition:transform .55s cubic-bezier(.2,.8,.2,1)}
.tf-pline.on::after{transform:scaleX(1)}
.tf-bd{padding:0 16px 4px}
@media(min-width:540px){.tf-bd{padding-bottom:20px}}
.tf-slbl{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(243,237,227,.32);margin:22px 0 10px}
.tf-sgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.tf-sgrid .tf-sc:last-child:nth-child(odd){grid-column:1/-1}
.tf-sc{background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);border-radius:17px;padding:13px 14px 12px;cursor:pointer;position:relative;overflow:hidden;text-align:left;color:#F3EDE3;font-family:inherit;transition:border-color .22s,background .22s,box-shadow .22s,transform .15s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-sc:active{transform:scale(.97)}
.tf-sc:hover:not(.sel){border-color:rgba(243,237,227,.17);transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,0,0,.45)}
.tf-sc.sel{border-color:rgba(255,90,31,.52);background:rgba(255,90,31,.10);box-shadow:0 0 0 1px rgba(255,90,31,.22),0 8px 30px rgba(255,90,31,.16)}
.tf-bar{position:absolute;top:0;left:0;right:0;height:2px;border-radius:17px 17px 0 0;transition:opacity .25s}
.tf-sdot{width:7px;height:7px;border-radius:50%;margin-bottom:9px}
.tf-sname{font-size:13.5px;font-weight:700;letter-spacing:-.015em;margin-bottom:5px}
.tf-smeta{display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(243,237,227,.42)}
.tf-sprice{font-size:13px;font-weight:800;color:#FF5A1F;margin-top:5px}
.tf-staffrow{display:flex;gap:5px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}
.tf-staffrow::-webkit-scrollbar{display:none}
.tf-sc2{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 8px 6px;border-radius:16px;min-width:63px;cursor:pointer;flex-shrink:0;border:1.5px solid transparent;background:none;font-family:inherit;transition:all .2s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-sc2:hover{background:rgba(243,237,227,.05)}
.tf-sc2.sel{border-color:rgba(255,90,31,.42);background:rgba(255,90,31,.08)}
.tf-sav{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;font-size:16px;font-weight:800;flex-shrink:0;font-family:'JetBrains Mono',monospace;transition:box-shadow .2s}
.tf-sc2.sel .tf-sav{box-shadow:0 0 0 2.5px rgba(255,90,31,.75)}
.tf-sn{font-size:10.5px;font-weight:700;white-space:nowrap;color:#F3EDE3}
.tf-srole{font-size:9.5px;color:rgba(243,237,227,.36);white-space:nowrap}
.tf-cta{width:100%;height:54px;border-radius:17px;background:linear-gradient(145deg,#FF5A1F,#E84010);color:#fff;font-size:15px;font-weight:700;letter-spacing:.01em;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin:20px 0 4px;box-shadow:0 4px 24px rgba(255,90,31,.38),0 1px 0 rgba(255,255,255,.14) inset;font-family:inherit;transition:all .22s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-cta:hover:not(:disabled){transform:translateY(-1.5px);box-shadow:0 10px 36px rgba(255,90,31,.48)}
.tf-cta:active:not(:disabled){transform:scale(.98)}
.tf-cta:disabled{opacity:.28;cursor:not-allowed;box-shadow:none;transform:none}
.tf-arr{font-size:16px;transition:transform .2s}.tf-cta:hover:not(:disabled) .tf-arr{transform:translateX(3px)}
.tf-back{display:flex;align-items:center;gap:5px;padding:14px 0 0;font-size:13px;font-weight:600;color:rgba(243,237,227,.42);background:none;border:none;cursor:pointer;font-family:inherit;transition:color .15s}
.tf-back:hover{color:#F3EDE3}
.tf-cal{background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);border-radius:19px;padding:15px}
.tf-chdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.tf-cmon{font-size:14px;font-weight:800;letter-spacing:-.015em}
.tf-cnav{width:32px;height:32px;border-radius:10px;background:rgba(243,237,227,.07);border:none;cursor:pointer;color:#F3EDE3;font-size:18px;display:grid;place-items:center;transition:background .15s}
.tf-cnav:hover{background:rgba(243,237,227,.14)}
.tf-cgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;text-align:center}
.tf-dn{font-size:9.5px;font-weight:800;letter-spacing:.07em;color:rgba(243,237,227,.30);padding:2px 0 10px;text-transform:uppercase}
.tf-cd{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:500;cursor:pointer;position:relative;transition:background .15s,box-shadow .2s;-webkit-tap-highlight-color:transparent}
.tf-cd:hover:not(.past):not(.emp):not(.sel){background:rgba(243,237,227,.09)}
.tf-cd.past{color:rgba(243,237,227,.17);cursor:default;pointer-events:none}
.tf-cd.emp{cursor:default;pointer-events:none}
.tf-cd.today{color:#FF5A1F;font-weight:700}
.tf-cd.today::after{content:'';position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:3px;height:3px;border-radius:50%;background:#FF5A1F}
.tf-cd.sel{background:#FF5A1F;color:#fff;font-weight:700;box-shadow:0 0 0 3px rgba(255,90,31,.28)}
.tf-tgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tf-ts{height:44px;border-radius:12px;background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);font-size:12.5px;font-weight:600;color:#F3EDE3;cursor:pointer;display:grid;place-items:center;font-family:inherit;transition:all .17s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-ts:hover{border-color:rgba(243,237,227,.22);background:rgba(243,237,227,.05)}
.tf-ts.sel{background:rgba(255,90,31,.13);border-color:rgba(255,90,31,.52);color:#FF8050}
.tf-ig{display:flex;flex-direction:column;gap:5px;margin-top:12px}
.tf-ilbl{font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:rgba(243,237,227,.36)}
.tf-inp{height:50px;border-radius:14px;background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);padding:0 16px;font-family:inherit;font-size:15px;font-weight:500;color:#F3EDE3;width:100%;box-sizing:border-box;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none}
.tf-inp::placeholder{color:rgba(243,237,227,.20)}
.tf-inp:focus{border-color:rgba(255,90,31,.52);box-shadow:0 0 0 3px rgba(255,90,31,.11);outline:none}
textarea.tf-inp{height:88px;padding:13px 16px;resize:none;line-height:1.5}
.tf-sumc{background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);border-radius:16px;padding:2px 0}
.tf-sr{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(243,237,227,.06)}
.tf-sr:last-child{border-bottom:none}
.tf-sk{font-size:12px;color:rgba(243,237,227,.42);font-weight:500}
.tf-sv{font-size:13px;font-weight:700}
.tf-cfm{display:flex;flex-direction:column;align-items:center;padding:44px 0 20px;text-align:center}
.tf-cring{width:88px;height:88px;border-radius:50%;background:rgba(124,196,127,.10);border:2px solid rgba(124,196,127,.32);display:grid;place-items:center;margin-bottom:20px;animation:tfRing .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes tfRing{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
.tf-cring svg path{stroke-dasharray:30;stroke-dashoffset:30;animation:tfDraw .6s cubic-bezier(.2,.8,.2,1) .25s forwards}
@keyframes tfDraw{to{stroke-dashoffset:0}}
.tf-ct{font-size:23px;font-weight:900;letter-spacing:-.03em;margin-bottom:7px}
.tf-cs{font-size:13.5px;color:rgba(243,237,227,.50);line-height:1.55}
.tf-sin{opacity:1}
@media(prefers-reduced-motion:no-preference){.tf-sin{animation:tfIn .32s cubic-bezier(.2,.8,.2,1)}@keyframes tfIn{from{transform:translateY(14px)}to{transform:translateY(0)}}}
.tf-cta2{width:100%;height:48px;border-radius:15px;background:rgba(243,237,227,.06);border:1.5px dashed rgba(243,237,227,.20);color:rgba(243,237,227,.72);font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:16px;transition:all .18s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-cta2:hover:not(:disabled){border-color:rgba(255,90,31,.45);color:#F3EDE3}
.tf-cta2:active:not(:disabled){transform:scale(.98)}
.tf-cta2:disabled{opacity:.28;cursor:not-allowed}
.tf-cart{margin-top:18px;background:rgba(24,18,10,.6);border:1.5px solid rgba(243,237,227,.08);border-radius:16px;padding:6px 0 4px}
.tf-cartlbl{font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(243,237,227,.32);padding:8px 14px 4px}
.tf-lr{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(243,237,227,.06)}
.tf-lr:last-child{border-bottom:none}
.tf-ldot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.tf-lname{font-size:13px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf-lmeta{font-size:11px;color:rgba(243,237,227,.42);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf-lprice{font-size:12.5px;font-weight:800;color:#F3EDE3;flex-shrink:0}
.tf-lx{width:24px;height:24px;border-radius:8px;background:rgba(243,237,227,.06);border:none;color:rgba(243,237,227,.55);font-size:17px;line-height:1;cursor:pointer;flex-shrink:0;display:grid;place-items:center;font-family:inherit;transition:all .15s}
.tf-lx:hover{background:rgba(232,64,16,.18);color:#FF7040}
.tf-spin{width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,90,31,.25);border-top-color:#FF5A1F;animation:tfspin .8s linear infinite}
.tf-spin-sm{width:18px;height:18px;border-width:2.5px}
@keyframes tfspin{to{transform:rotate(360deg)}}
`}</style>;
}
