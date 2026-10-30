import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, Clock, UserRound, Sparkles, Check, X, RefreshCw, Phone, MapPin, CalendarPlus, AlertCircle } from 'lucide-react';
import { icsHref } from '@/lib/icsFile';
import { BookingCSS } from './bookingStyles';

// ── Randevu yönetimi · /booking/:token (2026-10-30 rötuşu) ───────────────────
// Müşteri buraya WhatsApp'taki onay/hatırlatma bağlantısından gelir. Kullanıcı
// eski açık renkli sayfayı "çok vasat" buldu; online randevu sayfasının koyu
// ailesine taşındı (ortak stil bookingStyles). Düzeltilenler: "Onay bekliyor"
// artık yeşil değil; hatalar tarayıcı kutusu yerine sayfa içinde; iptal onayı
// sayfada; salonu arama, yol tarifi, takvime ekle, yeni randevu al.
// Salon bilgileri (logo, telefon, adres, harita, randevu adresi) booking-manage
// 'get' cevabından gelir; eski sunucuda yoksa ilgili düğmeler hiç çıkmaz.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/booking-manage`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const DAY = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const DAY_FULL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MON = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

async function callFn(body: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Türkiye'nin bugünü (UTC+3) — sunucunun "geçmiş mi" hesabıyla aynı. */
const trToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = (iso: string, short = false) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${(short ? DAY : DAY_FULL)[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const initials = (n: string) => n.trim().split(/\s+/).map(w => w[0]).join('').toLocaleUpperCase('tr').slice(0, 2);

type Resv = { service: string; date: string; time: string; endTime: string; staffName: string | null; status: string };
type Biz = { name: string; logoUrl?: string | null; phone?: string | null; address?: string | null; mapsUrl?: string | null; slug?: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Onaylandı', cls: 'confirmed' },
  pending: { label: 'Onay bekliyor', cls: 'pending' },
  completed: { label: 'Tamamlandı', cls: 'completed' },
  cancelled: { label: 'İptal edildi', cls: 'cancelled' },
};

export function BookingManagePage() {
  const { token = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [resv, setResv] = useState<Resv | null>(null);
  const [biz, setBiz] = useState<Biz>({ name: '' });
  const [canModify, setCanModify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view');
  const [outcome, setOutcome] = useState<null | 'cancelled' | 'rescheduled'>(null);
  const [prev, setPrev] = useState<{ date: string; time: string } | null>(null);
  const [notice, setNotice] = useState<{ text: string; call?: boolean } | null>(null);

  // yeniden planlama
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState<string | null>(null);

  const today = useMemo(() => trToday(), []);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i)), [today]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { ok, json } = await callFn({ action: 'get', token });
      if (!alive) return;
      if (!ok || !json.reservation) { setNotFound(true); setLoading(false); return; }
      setResv(json.reservation);
      setBiz({ name: json.business?.name || '', ...json.business });
      setCanModify(!!json.canModify);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  const pickDay = useCallback(async (d: string) => {
    setDate(d); setTime(null); setSlots([]); setSlotsLoading(true);
    const { ok, json } = await callFn({ action: 'slots', token, date: d });
    setSlots(ok && Array.isArray(json.slots) ? json.slots : []);
    setSlotsLoading(false);
  }, [token]);

  const startReschedule = () => {
    if (!resv) return;
    setNotice(null); setMode('reschedule');
    void pickDay(resv.date >= today ? resv.date : today);
  };

  const doCancel = async () => {
    setBusy(true); setNotice(null);
    const { ok, json } = await callFn({ action: 'cancel', token });
    setBusy(false);
    if (ok) { setOutcome('cancelled'); setMode('view'); window.scrollTo({ top: 0 }); }
    else setNotice({ text: json.error || 'Randevu iptal edilemedi. Bağlantınızı kontrol edip tekrar deneyin.', call: true });
  };

  const doReschedule = async () => {
    if (!resv || !date || !time) return;
    setBusy(true); setNotice(null);
    const { ok, status, json } = await callFn({ action: 'reschedule', token, date, time });
    setBusy(false);
    if (ok && json.success) {
      setPrev({ date: resv.date, time: resv.time });
      setResv({ ...resv, date: json.date, time: json.time, endTime: json.endTime });
      setOutcome('rescheduled'); setMode('view'); window.scrollTo({ top: 0 });
    } else if (status === 409) {
      setNotice({ text: json.error || 'Seçtiğiniz saat az önce doldu. Lütfen başka bir saat seçin.' });
      void pickDay(date);
    } else {
      // 403: salon şu anda çevrim içi değişiklik almıyor → aramaya yönlendir
      setNotice({ text: json.error || 'Randevu güncellenemedi. Lütfen tekrar deneyin.', call: status === 403 });
    }
  };

  // ── kabuk: online randevuyla aynı üst alan ve salon satırı ──
  const shell = (body: React.ReactNode, sub = 'Randevu yönetimi') => (
    <div className="tf-page">
      <div className="tf-shell">
        <div className="tf-hero">
          <div className="tf-orb1" /><div className="tf-orb2" /><div className="tf-orb3" />
          <div className="tf-hlogo">luera<span className="tf-hdot" /></div>
          <div className="tf-hmark">TIMEFLOW</div>
        </div>
        <div className="tf-profile">
          <div className="tf-appicon" style={biz.logoUrl ? { background: `center/cover url(${biz.logoUrl})`, color: 'transparent' } : undefined}>
            {!biz.logoUrl && (biz.name ? initials(biz.name) : <CalendarDays size={18} />)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="tf-pname">{biz.name || 'Randevunuz'}</div>
            <div className="tf-pmeta">{sub}</div>
          </div>
        </div>
        <div className="tf-bd">{body}</div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(243,237,227,.28)', margin: '22px 0 6px' }}>
          <span style={{ fontWeight: 600, color: 'rgba(243,237,227,.42)' }}>Luera TimeFlow</span> ile güçlendirildi
        </div>
      </div>
      <BookingCSS />
    </div>
  );

  if (loading) return shell(
    <div aria-busy="true" aria-label="Yükleniyor" style={{ paddingTop: 22 }}>
      <div className="tf-skel" style={{ height: 26, width: '55%' }} />
      <div className="tf-skel" style={{ height: 196, marginTop: 16 }} />
      <div className="tf-skel" style={{ height: 48, marginTop: 16 }} />
    </div>, ' ',
  );

  if (notFound || !resv) return shell(
    <div className="tf-cfm">
      <div className="tf-cring red"><AlertCircle size={34} color="#F29A86" /></div>
      <div className="tf-ct">Randevu bulunamadı</div>
      <div className="tf-cs">Bu bağlantı geçersiz ya da randevu kaldırılmış olabilir. Salonla iletişime geçebilirsiniz.</div>
    </div>, ' ',
  );

  const st = STATUS[resv.status] ?? { label: resv.status, cls: 'other' };
  const dur = Math.max(0, toMin(resv.endTime) - toMin(resv.time));
  const isPast = resv.date < today;
  const callHref = biz.phone ? `tel:${biz.phone.replace(/\s+/g, '')}` : null;
  const ics = icsHref([{
    title: `${cap(resv.service)}${biz.name ? ` · ${biz.name}` : ''}`, date: resv.date, start: resv.time, end: resv.endTime,
    location: biz.address, description: resv.staffName ? `Uzman: ${resv.staffName}` : null,
  }]);
  const calendarOk = !isPast && (resv.status === 'confirmed' || resv.status === 'pending');
  const lockedReason = resv.status === 'cancelled' ? 'Bu randevu iptal edilmiş.'
    : resv.status === 'completed' ? 'Bu randevu tamamlandı.'
    : isPast ? 'Bu randevunun tarihi geçti.'
    : 'Bu randevu artık buradan değiştirilemiyor.';

  // Tek başına kalan düğme satırı boydan boya uzar (full)
  const callBtn = (full = false) => callHref && <a className={`tf-btn${full ? ' full' : ''}`} href={callHref}><Phone size={15} /> Salonu ara</a>;
  const newBookingBtn = (full = false) => biz.slug && (
    <a className={`tf-btn${full ? ' full' : ''}`} href={`/book/${encodeURIComponent(biz.slug)}`}><CalendarPlus size={15} /> Yeni randevu al</a>
  );
  const noticeEl = notice && (
    <div className="tf-note err" role="alert">
      <AlertCircle size={15} />
      <span>{notice.text}{notice.call && callHref && <>{' '}<a href={callHref}>Salonu arayın</a></>}</span>
    </div>
  );

  // ── sonuç ekranları ──
  if (outcome === 'cancelled') return shell(
    <div className="tf-cfm">
      <div className="tf-cring red"><X size={34} color="#F29A86" strokeWidth={2.6} /></div>
      <div className="tf-ct">Randevunuz iptal edildi</div>
      <div className="tf-cs">{cap(resv.service)} · {dayLabel(resv.date)} · {resv.time}<br />Salon bilgilendirildi.</div>
      {(callHref || biz.slug) && <div className="tf-acts">{newBookingBtn(!callHref)}{callBtn(!biz.slug)}</div>}
    </div>,
  );

  if (outcome === 'rescheduled') return shell(
    <div className="tf-cfm">
      <div className="tf-cring"><svg width="38" height="38" viewBox="0 0 38 38" fill="none"><path d="M10 20l7 7 13-15" stroke="#7CC47F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      <div className="tf-ct">Randevunuz güncellendi</div>
      <div className="tf-cs">{cap(resv.service)}{resv.staffName ? ` · ${resv.staffName}` : ''}</div>
      {prev && (
        <div className="tf-change" style={{ width: '100%', justifyContent: 'center' }}>
          <s>{dayLabel(prev.date, true)} {prev.time}</s><span aria-hidden>→</span>
          <span className="to">{dayLabel(resv.date, true)} {resv.time}</span>
        </div>
      )}
      <div className="tf-acts">
        <a className={`tf-btn${biz.mapsUrl ? '' : ' full'}`} href={ics} download="randevu.ics"><CalendarPlus size={15} /> Takvime ekle</a>
        {biz.mapsUrl && <a className="tf-btn" href={biz.mapsUrl} target="_blank" rel="noopener noreferrer"><MapPin size={15} /> Yol tarifi</a>}
      </div>
    </div>,
  );

  // ── randevu kartı ──
  const card = (
    <div className="tf-sumc" style={{ marginTop: 4 }}>
      <div className="tf-kv"><Sparkles size={16} /><span className="tf-kk">Hizmet</span><span className="tf-kval">{cap(resv.service)}</span></div>
      {resv.staffName && <div className="tf-kv"><UserRound size={16} /><span className="tf-kk">Uzman</span><span className="tf-kval">{resv.staffName}</span></div>}
      <div className="tf-kv"><CalendarDays size={16} /><span className="tf-kk">Tarih</span><span className="tf-kval">{dayLabel(resv.date)}</span></div>
      <div className="tf-kv"><Clock size={16} /><span className="tf-kk">Saat</span>
        <span className="tf-kval">{resv.time}–{resv.endTime}{dur > 0 && <small>{dur} dk</small>}</span></div>
      {(biz.address || biz.mapsUrl) && (
        <div className="tf-kv"><MapPin size={16} /><span className="tf-kk">Adres</span>
          <span className="tf-kval" style={{ whiteSpace: 'normal' }}>
            {biz.address || ''}
            {biz.mapsUrl && <small><a href={biz.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#FF8050', fontWeight: 800 }}>Yol tarifi</a></small>}
          </span>
        </div>
      )}
    </div>
  );

  return shell(
    <>
      <div className="tf-h1">
        <span>{mode === 'reschedule' ? 'Yeni saat seçin' : mode === 'cancel' ? 'İptal edilsin mi?' : 'Randevunuz'}</span>
        {mode === 'view' && <span className={`tf-chip ${st.cls}`}><i />{st.label}</span>}
      </div>
      {mode === 'view' && resv.status === 'pending' && (
        <p className="tf-lead" style={{ marginTop: 0 }}>Salon onaylayınca WhatsApp'tan haber verilecek.</p>
      )}

      {mode !== 'reschedule' && <>{card}{noticeEl}</>}

      {/* görünüm: eylemler */}
      {mode === 'view' && (canModify ? (
        <div className="tf-acts">
          <button className="tf-btn" onClick={startReschedule}><RefreshCw size={15} /> Yeniden planla</button>
          <button className="tf-btn danger" onClick={() => { setNotice(null); setMode('cancel'); }}><X size={15} /> İptal et</button>
          {calendarOk && <a className={`tf-btn${callHref ? '' : ' full'}`} href={ics} download="randevu.ics"><CalendarPlus size={15} /> Takvime ekle</a>}
          {callBtn(!calendarOk)}
        </div>
      ) : (
        <>
          <div className="tf-note" style={{ background: 'rgba(243,237,227,.05)', borderColor: 'rgba(243,237,227,.10)', color: 'rgba(243,237,227,.62)' }}>
            <AlertCircle size={15} /><span>{lockedReason}</span>
          </div>
          {(callHref || biz.slug) && <div className="tf-acts">{newBookingBtn(!callHref)}{callBtn(!biz.slug)}</div>}
        </>
      ))}

      {/* iptal onayı — sayfanın içinde, tarayıcı kutusu değil */}
      {mode === 'cancel' && (
        <>
          <p className="tf-lead" style={{ margin: '14px 0 0' }}>Bu işlem geri alınamaz. Başka bir saate almak isterseniz yeniden planlayabilirsiniz.</p>
          <div className="tf-acts">
            <button className="tf-btn" onClick={() => setMode('view')} disabled={busy}>Vazgeç</button>
            <button className="tf-btn danger" onClick={doCancel} disabled={busy}>
              {busy ? <span className="tf-spin tf-spin-sm" /> : <><X size={15} /> Evet, iptal et</>}
            </button>
          </div>
        </>
      )}

      {/* yeniden planla */}
      {mode === 'reschedule' && (
        <>
          <p className="tf-lead">Şu anki: {cap(resv.service)} · {dayLabel(resv.date, true)} {resv.time}</p>
          <div className="tf-slbl" style={{ marginTop: 6 }}>Gün</div>
          <div className="tf-dstrip">
            {days.map(d => (
              <button key={d} className={`tf-day${date === d ? ' sel' : ''}`} onClick={() => void pickDay(d)} aria-pressed={date === d}>
                <small>{d === today ? 'Bugün' : DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}</small>
                <b>{Number(d.slice(8, 10))}</b>
              </button>
            ))}
          </div>
          <div className="tf-slbl">Saat</div>
          {slotsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}><div className="tf-spin" /></div>
          ) : slots.length === 0 ? (
            <p className="tf-lead" style={{ margin: 0 }}>Bu gün için boş saat yok. Başka bir gün seçin.</p>
          ) : (
            <div className="tf-tgrid">
              {slots.map(t => <button key={t} className={`tf-ts${time === t ? ' sel' : ''}`} onClick={() => setTime(t)}>{t}</button>)}
            </div>
          )}
          {date && time && (
            <div className="tf-change">
              <s>{dayLabel(resv.date, true)} {resv.time}</s><span aria-hidden>→</span>
              <span className="to">{dayLabel(date, true)} {time}</span>
            </div>
          )}
          {noticeEl}
          <button className="tf-cta" onClick={doReschedule} disabled={busy || !date || !time}>
            {busy ? <span className="tf-spin tf-spin-sm" /> : <><Check size={17} strokeWidth={2.6} /> Yeni saati onayla</>}
          </button>
          <button className="tf-btn" style={{ width: '100%' }} onClick={() => { setMode('view'); setNotice(null); setTime(null); }}>Vazgeç</button>
        </>
      )}
    </>,
  );
}
