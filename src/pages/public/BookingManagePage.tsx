import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar as CalendarIcon, Clock, User, Loader2, Check, X, RefreshCw, ChevronLeft } from 'lucide-react';
import { confirmDialog } from '@/components/ConfirmDialog';

const C = {
  page: '#F3ECE0', surface: '#FFFFFF', surface2: '#FAF7F3', ink: '#0E0E0E', orange: '#FF5A1F',
  border: 'rgba(14,14,14,0.10)', border2: 'rgba(14,14,14,0.16)', muted: 'rgba(14,14,14,0.52)', muted2: 'rgba(14,14,14,0.32)',
  ok: '#2D8F32', red: '#C94040', r: '16px', rSm: '11px', rXs: '8px', shadow: '0 2px 10px rgba(14,14,14,0.06),0 10px 30px rgba(14,14,14,0.07)',
};
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/booking-manage`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const DAY_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MON_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

async function callFn(body: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function fmtFull(d: string) { return new Date(d + 'T00:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }

type Resv = { service: string; date: string; time: string; endTime: string; staffName: string | null; status: string };

export function BookingManagePage() {
  const { token = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [resv, setResv] = useState<Resv | null>(null);
  const [bizName, setBizName] = useState('');
  const [canModify, setCanModify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<null | 'cancelled' | 'rescheduled'>(null);

  // reschedule state
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, json } = await callFn({ action: 'get', token });
    if (!ok || !json.reservation) { setNotFound(true); setLoading(false); return; }
    setResv(json.reservation); setBizName(json.business?.name || ''); setCanModify(!!json.canModify);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const out: Date[] = []; const today = new Date();
    for (let i = 0; i < 21; i++) { const d = new Date(today); d.setDate(today.getDate() + i); out.push(d); }
    return out;
  }, []);

  const fetchSlots = useCallback(async (d: string) => {
    setSlotsLoading(true); setSlots([]); setTime(null);
    const { ok, json } = await callFn({ action: 'slots', token, date: d });
    setSlots(ok && Array.isArray(json.slots) ? json.slots : []);
    setSlotsLoading(false);
  }, [token]);
  useEffect(() => { if (rescheduling && date) fetchSlots(date); }, [rescheduling, date, fetchSlots]);

  const doCancel = async () => {
    if (!(await confirmDialog({ title: 'Randevunuz iptal edilsin mi?', description: 'Bu işlem geri alınamaz.', danger: true, confirmLabel: 'İptal Et', cancelLabel: 'Vazgeç' }))) return;
    setBusy(true);
    const { ok } = await callFn({ action: 'cancel', token });
    setBusy(false);
    if (ok) setOutcome('cancelled');
    else alert('İptal edilemedi. Lütfen tekrar deneyin.');
  };
  const doReschedule = async () => {
    if (!date || !time) return;
    setBusy(true);
    const { ok, json } = await callFn({ action: 'reschedule', token, date, time });
    setBusy(false);
    if (ok && json.success) { setResv(r => r ? { ...r, date: json.date, time: json.time, endTime: json.endTime } : r); setOutcome('rescheduled'); }
    else alert(json.error || 'Güncellenemedi. Lütfen tekrar deneyin.');
  };

  if (loading) return <div style={sFull}><Loader2 size={30} color={C.orange} style={{ animation: 'tfspin .8s linear infinite' }} /><style>{kf}</style></div>;
  if (notFound || !resv) return (
    <div style={sFull}><div style={{ textAlign: 'center', color: C.muted }}>
      <CalendarIcon size={40} color={C.muted2} />
      <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginTop: 14 }}>Randevu bulunamadı</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>Bu bağlantı geçersiz veya randevu kaldırılmış olabilir.</div>
    </div></div>
  );

  const statusLabel: Record<string, string> = { pending: 'Onay bekliyor', confirmed: 'Onaylandı', completed: 'Tamamlandı', cancelled: 'İptal edildi' };

  return (
    <div style={{ minHeight: '100vh', background: C.page, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', color: C.ink, padding: '0 20px 40px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 36 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: C.muted }}>{bizName}</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>Randevu Yönetimi</div>
        </div>

        {outcome ? (
          <div style={{ ...card, textAlign: 'center', padding: '32px 22px' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: outcome === 'cancelled' ? '#FBECEC' : '#FFF4EF', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              {outcome === 'cancelled' ? <X size={28} color={C.red} /> : <Check size={28} color={C.orange} />}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{outcome === 'cancelled' ? 'Randevunuz iptal edildi' : 'Randevunuz güncellendi'}</div>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 7 }}>
              {outcome === 'cancelled' ? 'Yeni randevu için işletmeyle iletişime geçebilirsiniz.' : `${fmtFull(resv.date)} · ${resv.time}`}
            </div>
          </div>
        ) : (
          <div style={card}>
            {/* özet */}
            <Row icon={<User size={15} />} k="Hizmet" v={resv.service} />
            {resv.staffName && <Row icon={<User size={15} />} k="Personel" v={resv.staffName} />}
            <Row icon={<CalendarIcon size={15} />} k="Tarih" v={fmtFull(resv.date)} />
            <Row icon={<Clock size={15} />} k="Saat" v={`${resv.time} – ${resv.endTime}`} last />
            <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: resv.status === 'cancelled' ? C.red : C.ok, background: resv.status === 'cancelled' ? '#FBECEC' : '#EAF3DE', borderRadius: 999, padding: '4px 11px' }}>
              {statusLabel[resv.status] || resv.status}
            </div>

            {!canModify ? (
              <div style={{ marginTop: 18, fontSize: 12.5, color: C.muted2, textAlign: 'center' }}>Bu randevu artık değiştirilemiyor.</div>
            ) : !rescheduling ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button onClick={() => setRescheduling(true)} style={btnGhost}><RefreshCw size={15} /> Yeniden Planla</button>
                <button onClick={doCancel} disabled={busy} style={btnDanger}>{busy ? <Loader2 size={15} style={{ animation: 'tfspin .8s linear infinite' }} /> : <><X size={15} /> İptal Et</>}</button>
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                <div style={lbl}>Yeni tarih</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14, scrollbarWidth: 'none' }}>
                  {days.map(d => { const ds = ymd(d); const sel = date === ds; return (
                    <button key={ds} onClick={() => setDate(ds)} style={{ flexShrink: 0, width: 56, padding: '9px 0', borderRadius: C.rSm, cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', background: sel ? C.orange : C.surface2, color: sel ? '#fff' : C.ink, border: sel ? 'none' : `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 10.5, opacity: .7 }}>{DAY_TR[d.getDay()]}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, margin: '2px 0' }}>{d.getDate()}</div>
                      <div style={{ fontSize: 9.5, opacity: .7 }}>{MON_TR[d.getMonth()]}</div>
                    </button>); })}
                </div>
                {date && (<>
                  <div style={lbl}>Yeni saat</div>
                  {slotsLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}><Loader2 size={20} color={C.orange} style={{ animation: 'tfspin .8s linear infinite' }} /></div>
                    : slots.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted2, padding: '4px 0 14px' }}>Bu gün için müsait saat yok.</div>
                    : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
                        {slots.map(t => { const sel = time === t; return <button key={t} onClick={() => setTime(t)} style={{ padding: '9px 0', borderRadius: C.rXs, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: sel ? C.orange : C.surface, color: sel ? '#fff' : C.ink, border: `1px solid ${sel ? C.orange : C.border}` }}>{t}</button>; })}
                      </div>}
                </>)}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setRescheduling(false); setDate(null); setTime(null); }} style={btnGhost}><ChevronLeft size={15} /> Vazgeç</button>
                  <button onClick={doReschedule} disabled={busy || !time} style={{ ...btnPrimary, opacity: (busy || !time) ? .5 : 1 }}>{busy ? <Loader2 size={15} style={{ animation: 'tfspin .8s linear infinite' }} /> : <><Check size={15} /> Onayla</>}</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: C.muted2, marginTop: 22 }}><span style={{ fontWeight: 600 }}>Luera TimeFlow</span> ile güçlendirildi</div>
      </div>
      <style>{kf}</style>
    </div>
  );
}

const sFull: React.CSSProperties = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.page };
const kf = '@keyframes tfspin{to{transform:rotate(360deg)}}';
const card: React.CSSProperties = { background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, padding: 20, boxShadow: C.shadow };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 10 };
const btnBase: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: C.rSm, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { ...btnBase, border: 'none', background: C.orange, color: '#fff' };
const btnGhost: React.CSSProperties = { ...btnBase, border: `1px solid ${C.border2}`, background: 'none', color: C.muted };
const btnDanger: React.CSSProperties = { ...btnBase, border: `1px solid rgba(201,64,64,0.3)`, background: 'rgba(201,64,64,0.06)', color: C.red };

function Row({ icon, k, v, last }: { icon: React.ReactNode; k: string; v: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${C.border}` }}>
      <span style={{ color: C.muted2, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: C.muted, width: 64, flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
