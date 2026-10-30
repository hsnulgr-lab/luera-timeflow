import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { icsHref } from '@/lib/icsFile';
import { BookingCSS } from './bookingStyles';

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
  /** İşletmenin KVKK aydınlatma metni adresi — girilmemişse bağlantı çıkmaz. */
  kvkkUrl?: string | null;
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
/** Salonun yazdığı "ağda" ekranda "Ağda" görünür; kayıt değişmez. */
const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);
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
  const [searchParams] = useSearchParams();
  // Embed modu (?embed=1): hero gizlenir, shell iframe'i doldurur,
  // yükseklik postMessage ile host sayfaya bildirilir
  const embed = searchParams.get('embed') === '1';

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // 403: işletme var ama aboneliği yok/bitmiş (public-booking · checkAccess).
  const [closed, setClosed] = useState(false);
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
  // KVKK açık rızası — işaretlenmeden randevu gönderilemez (bkz. step 3).
  const [kvkkOk, setKvkkOk] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);          // sepet — eklenen hizmetler
  // Tarayıcının uyarı kutusu yerine sayfa içinde sakin bir satır (2026-10-30)
  const [notice, setNotice] = useState<string | null>(null);
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
      const { ok, status, json } = await callFn({ action: 'profile', slug });
      if (!ok || !json.business) { setClosed(status === 403); setNotFound(true); setLoading(false); return; }
      setBiz(json.business); setServices(json.services || []); setStaff(json.staff || []);
      setLoading(false);
    })();
  }, [slug]);

  // Embed: içerik yüksekliğini host sayfaya bildir (iframe otomatik boyutlansın)
  useEffect(() => {
    if (!embed || window.parent === window) return;
    const post = () => window.parent.postMessage({ type: 'tf-embed-height', height: document.documentElement.scrollHeight }, '*');
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [embed, loading]);

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

  /** Tarih adımına geçerken ilk açık gün hazır seçili gelir — saatler hemen
   *  görünür ("Önce tarih seçin" boşluğu kalkar). Bugün kapanışa 30 dk'dan az
   *  kaldıysa yarından başlar. */
  const toDateStep = () => {
    setNotice(null);
    if (!date && biz) {
      const now = new Date();
      for (let i = 0; i < 60; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const wh = biz.workingHours.find(h => h.day === d.getDay());
        if (!wh || wh.isOff) continue;
        if (i === 0 && t2m(wh.end) - (now.getHours() * 60 + now.getMinutes()) < 30) continue;
        setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        setCalY(d.getFullYear()); setCalM(d.getMonth());
        break;
      }
    }
    goStep(2);
  };

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
    if (!kvkkOk) return;
    setSubmitting(true);
    const { ok, status, json } = await callFn({
      action: 'book', slug,
      lines: lines.map(l => ({ serviceId: l.serviceId, staffId: l.staffId, date: l.date, time: l.time })),
      customerName: name.trim(), customerPhone: phone.replace(/\s/g, ''), customerEmail: email.trim(), note: note.trim(),
      // Rızanın kanıtı kaydın kendisinde durmalı — sonradan "onay alındı mı?"
      // sorusunun cevabı loglarda aranmasın.
      kvkkConsentAt: new Date().toISOString(),
    });
    setSubmitting(false);
    if (ok && json.success) {
      setDone({ status: json.status, lines: json.lines || [] });
      setStep(4);
    } else if (status === 409) {
      if (typeof json.lineIndex === 'number') setLines(p => p.filter((_, i) => i !== json.lineIndex));
      goStep(1);
      setNotice(json.error || 'Seçtiğiniz saatlerden biri az önce doldu. Lütfen o hizmet için yeniden saat seçin.');
    } else {
      setNotice(json.error || 'Randevu oluşturulamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    }
  };

  const reset = () => {
    setStep(1); setSvcId(null); setStfId('any'); setDate(null); setTime(null);
    setSlots([]); setName(''); setPhone(''); setEmail(''); setNote(''); setDone(null);
    setLines([]); setWlName(''); setWlPhone(''); setWlJoined(false);
    // KVKK onayı her randevuda yeniden verilir; önceki onay taşınmaz
    setKvkkOk(false); setNotice(null);
    window.scrollTo({ top: 0 });
  };

  // ── durum ekranları ──
  const pageCls = embed ? 'tf-page tf-emb' : 'tf-page';

  if (loading) return <div className={pageCls}><div className="tf-shell" style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}><div className="tf-spin" /></div><BookingCSS /></div>;
  if (notFound || !biz) return (
    <div className={pageCls}><div className="tf-shell" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#F3EDE3' }}>{closed ? 'Online randevu şu anda kapalı' : 'İşletme bulunamadı'}</div>
      <div style={{ fontSize: 13, marginTop: 8, color: 'rgba(243,237,227,.48)' }}>
        {closed ? 'Bu işletme şu anda online randevu almıyor. Randevu için işletmeyle doğrudan iletişime geçebilirsiniz.' : 'Bu randevu bağlantısı geçersiz veya kaldırılmış olabilir.'}
      </div>
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
    <div className={pageCls}>
      <div className="tf-shell">
        {/* Hero — embed modunda gizli (host sayfada yer kaplamasın) */}
        {!embed && (
          <div className="tf-hero">
            <div className="tf-orb1" /><div className="tf-orb2" /><div className="tf-orb3" />
            <div className="tf-hlogo">luera<span className="tf-hdot" /></div>
            <div className="tf-hmark">TIMEFLOW</div>
          </div>
        )}

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
          {notice && step !== 4 && (
            <div className="tf-note err" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><path d="M12 16.2h.01" /></svg>
              <span>{notice}</span>
            </div>
          )}

          {/* STEP 1 — Hizmet & Personel */}
          {step === 1 && (
            <div className="tf-sin">
              <div className="tf-slbl">Hizmet seçin</div>
              <div className="tf-sgrid">
                {services.map(s => (
                  <button key={s.id} className={`tf-sc${svcId === s.id ? ' sel' : ''}`} onClick={() => setSvcId(s.id)}>
                    <span className="tf-bar" style={{ background: `linear-gradient(90deg,${s.color},${s.color}99)`, opacity: svcId === s.id ? 1 : 0 }} />
                    <div className="tf-sdot" style={{ background: s.color, boxShadow: svcId === s.id ? `0 0 6px ${s.color}66` : 'none' }} />
                    <div className="tf-sname">{cap(s.name)}</div>
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

              <button className="tf-cta" onClick={toDateStep} disabled={!svcId}>
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
                  <div style={{ fontSize: 12.5, color: 'rgba(243,237,227,.42)', marginBottom: 12, lineHeight: 1.5 }}>Bu gün için boş saat yok. Başka bir gün seçebilir ya da bekleme listesine katılabilirsiniz.</div>
                  {wlJoined ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'rgba(124,196,127,.10)', border: '1px solid rgba(124,196,127,.3)', borderRadius: 14, fontSize: 13, fontWeight: 600, color: '#7CC47F' }}>Bekleme listesine eklendiniz. Yer açılınca WhatsApp'tan haber vereceğiz.</div>
                  ) : (
                    <div className="tf-cal" style={{ padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, color: '#F3EDE3', letterSpacing: '.04em' }}>Yer açılınca haber ver</div>
                      <input className="tf-inp" value={wlName} onChange={e => setWlName(e.target.value)} placeholder="Adınız" style={{ marginBottom: 8 }} />
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
                      <div className="tf-lname">{cap(l.svcName)}</div>
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

              {/* KVKK — aydınlatma verinin ALINDIĞI anda yapılır; onay zaman
                  damgasıyla randevuya yazılır (custom_fields.kvkk_onay). */}
              <label className="tf-kvkk" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', margin: '14px 0 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={kvkkOk} onChange={e => setKvkkOk(e.target.checked)}
                  style={{ marginTop: 2, width: 17, height: 17, accentColor: '#FF5A1F', flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(243,237,227,.62)' }}>
                  Ad, telefon ve randevu bilgilerimin randevu yönetimi ve hatırlatma amacıyla
                  {biz?.name ? ` ${biz.name}` : ''} tarafından işlenmesini kabul ediyorum.
                  {/* Aydınlatma metni bağlantısı işletme Ayarlar'dan URL girince çıkar.
                      Sabit bir /kvkk bağlantısı 404 verirdi; metnin içeriği de
                      işletmenin kendi hukuki beyanıdır, ürün tarafından yazılamaz. */}
                  {biz?.kvkkUrl && (
                    <>{' '}<a href={biz.kvkkUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#FF5A1F', textDecoration: 'underline' }}>Aydınlatma metni</a></>
                  )}
                </span>
              </label>

              <button className="tf-cta" onClick={submit} disabled={submitting || !kvkkOk || !name.trim() || phone.trim().length < 7}>
                {submitting ? <span className="tf-spin tf-spin-sm" /> : 'Randevuyu onayla'}
              </button>
            </div>
          )}

          {/* STEP 4 — Onay */}
          {step === 4 && done && (
            <div className="tf-sin tf-cfm">
              <div className="tf-cring">
                <svg width="38" height="38" viewBox="0 0 38 38" fill="none"><path d="M10 20l7 7 13-15" stroke="#7CC47F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="tf-ct">{done.status === 'confirmed' ? 'Randevunuz onaylandı' : 'Talebiniz alındı'}</div>
              <div className="tf-cs" style={{ marginBottom: 24 }}>
                {done.status === 'confirmed' ? 'WhatsApp üzerinden onay mesajı gönderildi.' : `${biz.name} talebinizi onaylayınca WhatsApp'tan bilgilendirileceksiniz.`}
              </div>
              <div className="tf-sumc" style={{ width: '100%', textAlign: 'left' }}>
                {done.lines.map((l, i) => (
                  <div key={i} className="tf-lr">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tf-lname">{cap(l.service)}</div>
                      <div className="tf-lmeta">{fmtFull(l.date)}</div>
                    </div>
                    <span className="tf-lprice" style={{ color: '#FF5A1F' }}>{l.time}</span>
                  </div>
                ))}
              </div>
              <div className="tf-acts">
                <a className={`tf-btn${biz.mapsUrl ? '' : ' full'}`} download="randevu.ics"
                  href={icsHref(lines.map(l => ({
                    title: `${cap(l.svcName)} · ${biz.name}`, date: l.date, start: l.time, end: l.endTime,
                    location: biz.address, description: l.staffName !== 'Fark etmez' ? `Uzman: ${l.staffName}` : null,
                  })))}>
                  {CalSvg} Takvime ekle
                </a>
                {biz.mapsUrl && (
                  <a className="tf-btn" href={biz.mapsUrl} target="_blank" rel="noopener noreferrer">{PinSvg} Yol tarifi</a>
                )}
              </div>
              <button className="tf-cta" style={{ width: '100%' }} onClick={reset}>Yeni randevu al</button>
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
            <div className="tf-lname">{cap(l.svcName)}</div>
            <div className="tf-lmeta">{fmtShort(l.date)} · {l.time} · {l.staffName}</div>
          </div>
          <button className="tf-lx" onClick={() => onRemove(l.id)} aria-label="Kaldır">×</button>
        </div>
      ))}
    </div>
  );
}

const ClockSvg = <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: .55, flexShrink: 0 }}><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M6 3.5v2.8l1.6 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const CalSvg = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M12 13.5v4M10 15.5h4" /></svg>;
const PinSvg = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
const ChevSvg = <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
