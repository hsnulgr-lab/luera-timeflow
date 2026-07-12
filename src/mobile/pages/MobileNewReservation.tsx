import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { toISODate, formatDateEU } from '@/utils/date';
import type { Service, Customer } from '@/types';
import { T, avatarColor } from '../theme';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DOW = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
const STEPS = ['Hizmet', 'Zaman', 'İşlemler', 'Müşteri', 'Özet'];

function addMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const rid = () => Math.random().toString(36).slice(2, 9);
const gid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
function waLink(phone: string): string {
    let p = (phone || '').replace(/\D/g, '');
    if (p.startsWith('0')) p = '90' + p.slice(1); else if (!p.startsWith('90')) p = '90' + p;
    return `https://wa.me/${p}`;
}

// Sepetteki bir hizmet satırı (hizmet + personel + saat). Tarih booking geneli.
interface Line { id: string; service: Service; staffId?: string; staffName?: string; staffColor?: string; time: string; endTime: string; }

export const MobileNewReservation = () => {
    const navigate = useNavigate();
    const { settings, addReservation, checkConflict } = useReservations();
    const { allCustomers } = useCustomers();
    const { staff } = useStaff();
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive), [staff]);

    const [step, setStep] = useState(0);
    const [lines, setLines] = useState<Line[]>([]);          // sepet
    const [svc, setSvc] = useState<Service | null>(null);    // taslak hizmet
    const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
    const [date, setDate] = useState(() => toISODate(new Date()));   // booking geneli tarih
    const [time, setTime] = useState<string | null>(null);   // taslak saat
    const [staffIdx, setStaffIdx] = useState(0);             // taslak personel
    const [cust, setCust] = useState<Customer | null>(null);
    const [custQuery, setCustQuery] = useState('');
    const [note, setNote] = useState('');
    const [showNote, setShowNote] = useState(false);
    const [done, setDone] = useState(false);
    const [savedLines, setSavedLines] = useState<Line[]>([]); // başarı ekranında gösterilecek — kaydedilenler
    const [saving, setSaving] = useState(false);

    const selStaff = activeStaff[staffIdx];
    const grandTotal = lines.reduce((s, l) => s + (l.service.price ?? 0), 0);

    // Saat slotları — çakışma (DB) + sepet (aynı personel) + çalışma saatleri + geçmiş
    const slots = useMemo(() => {
        const out: { t: string; avail: boolean }[] = [];
        const dur = svc?.duration || settings.slotDuration || 30;
        const stepM = settings.slotDuration || 30;
        const wd = new Date(date + 'T00:00:00').getDay();
        const wh = settings.workingHours?.find((w) => w.day === wd);
        if (wh?.isOff) return out;
        const dayStart = wh ? toMin(wh.start) : 9 * 60;
        const dayEnd = wh ? toMin(wh.end) : 18 * 60;
        const todayIso = toISODate(new Date());
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        for (let m = dayStart; m + dur <= dayEnd; m += stepM) {
            const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            const isPast = date === todayIso && m < nowMin;
            const conflict = checkConflict(date, t, addMinutes(t, dur), undefined, selStaff?.id);
            const s1 = m, e1 = m + dur;
            const cartBusy = lines.some((l) => l.staffId === selStaff?.id && toMin(l.time) < e1 && s1 < toMin(l.endTime));
            out.push({ t, avail: !isPast && !conflict && !cartBusy });
        }
        return out;
    }, [date, svc?.duration, settings.slotDuration, settings.workingHours, selStaff?.id, checkConflict, lines]);

    const monthGrid = useMemo(() => {
        const first = new Date(month.y, month.m, 1);
        const offset = (first.getDay() + 6) % 7;
        const daysIn = new Date(month.y, month.m + 1, 0).getDate();
        const todayIso = toISODate(new Date());
        const cells: ({ d: number; ds: string; past: boolean; today: boolean; dow: number } | null)[] = [];
        for (let i = 0; i < offset; i++) cells.push(null);
        for (let d = 1; d <= daysIn; d++) {
            const ds = toISODate(new Date(month.y, month.m, d));
            cells.push({ d, ds, past: ds < todayIso, today: ds === todayIso, dow: (new Date(month.y, month.m, d).getDay() + 6) % 7 });
        }
        return cells;
    }, [month]);

    const custMatches = useMemo(() => {
        const q = custQuery.trim().toLowerCase();
        const base = q ? allCustomers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)) : allCustomers;
        return base.slice(0, 8);
    }, [custQuery, allCustomers]);

    // Taslak satırı sepete ekle
    const addLine = () => {
        if (!svc || !time || !selStaff) return;
        const endTime = addMinutes(time, svc.duration);
        const clash = checkConflict(date, time, endTime, undefined, selStaff.id);
        if (clash) { toast.error(`${selStaff.name} bu saatte dolu (${clash.startTime}–${clash.endTime}). Başka saat veya personel seçin.`); return; }
        const s1 = toMin(time), e1 = toMin(endTime);
        if (lines.some((l) => l.staffId === selStaff.id && toMin(l.time) < e1 && s1 < toMin(l.endTime))) {
            toast.error(`${selStaff.name} bu saatte zaten ekli`); return;
        }
        setLines((p) => [...p, { id: rid(), service: svc, staffId: selStaff.id, staffName: selStaff.name, staffColor: selStaff.color, time, endTime }]);
        setSvc(null); setTime(null);
        setStep(2);
    };
    const removeLine = (id: string) => setLines((p) => p.filter((l) => l.id !== id));
    const addAnother = () => { setSvc(null); setTime(null); setStep(0); };

    const back = () => {
        if (step === 1) setStep(0);
        else if (step === 3) setStep(2);
        else if (step === 4) setStep(3);
    };

    const handleNext = async () => {
        if (step === 0) { if (svc) setStep(1); return; }
        if (step === 1) { addLine(); return; }
        if (step === 2) { if (lines.length) setStep(3); return; }
        if (step === 3) { setStep(4); return; }
        // step 4 — oluştur
        if (!lines.length) return;
        setSaving(true);
        const groupId = lines.length > 1 ? gid() : undefined;
        const succeeded: Line[] = [];
        const remaining: Line[] = [];
        for (const ln of lines) {
            const clash = checkConflict(date, ln.time, ln.endTime, undefined, ln.staffId);
            if (clash) { remaining.push(ln); toast.error(`${ln.staffName || 'Personel'} ${ln.time} dolu, atlandı`); continue; }
            const res = await addReservation({
                customerId: cust?.id || '', customerName: cust?.name || 'Geçici / Walk-in', customerPhone: cust?.phone || '',
                date, startTime: ln.time, endTime: ln.endTime, service: ln.service.name, serviceColor: ln.service.color,
                status: 'confirmed', staffId: ln.staffId, staffName: ln.staffName, staffColor: ln.staffColor,
                notes: note.trim() || undefined, source: 'manual', groupId,
            });
            if (res) succeeded.push(ln); else remaining.push(ln);
        }
        setSaving(false);
        // Başarılı satırlar sepetten çıkar — "Randevuyu Oluştur"a tekrar basınca
        // zaten kaydedilenler ikinci kez yazılmasın (yalnızca kalanlar tekrar denenir).
        setLines(remaining);
        if (remaining.length === 0) {
            setSavedLines(succeeded);
            setDone(true);
        } else if (succeeded.length > 0) {
            toast.success(`${succeeded.length} hizmet kaydedildi · ${remaining.length} hizmet çakıştığı için beklemede`);
            setStep(2);
        }
    };

    const reset = () => { setStep(0); setLines([]); setSvc(null); setTime(null); setCust(null); setNote(''); setShowNote(false); setDone(false); setSavedLines([]); };

    const dObj = new Date(date + 'T00:00:00');
    const dateChip = `${dObj.getDate()} ${MONTHS[dObj.getMonth()].slice(0, 3)}`;

    // ── BAŞARI EKRANI ──
    if (done) {
        return (
            <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', background: T.bg, color: T.ink }}>
              <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 28px' }}>
                <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(124,196,127,.12)', border: '1px solid rgba(124,196,127,.25)', display: 'grid', placeItems: 'center', marginBottom: 22, position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1.5px solid rgba(124,196,127,.15)' }} />
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', marginBottom: 6 }}>Randevu Oluşturuldu!</div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 24, textAlign: 'center', lineHeight: 1.5 }}>
                    {cust?.name || 'Müşteri'} için {dObj.getDate()} {MONTHS[dObj.getMonth()]} · {savedLines.length} hizmet eklendi.
                </div>
                <div style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden', marginBottom: 22 }}>
                    {savedLines.map((l, i) => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderBottom: i < savedLines.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 750 }}>{l.service.name}</div>
                                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{l.time}–{l.endTime} · {l.staffName || 'Atanmadı'}</div>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.mono }}>₺{l.service.price ?? 0}</span>
                        </div>
                    ))}
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {cust?.phone && (
                        <a href={waLink(cust.phone)} target="_blank" rel="noreferrer" style={{ height: 52, borderRadius: 15, background: '#25D366', color: '#0a2e16', fontSize: 14.5, fontWeight: 850, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
                            WhatsApp ile Hatırlatıcı Gönder
                        </a>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => { reset(); navigate('/calendar'); }} style={{ flex: 1, height: 48, borderRadius: 14, background: T.surface2, color: T.muted, fontSize: 13.5, fontWeight: 700, border: `1px solid ${T.border}`, cursor: 'pointer' }}>Kapat</button>
                        <button onClick={reset} style={{ flex: 1, height: 48, borderRadius: 14, background: T.orange, color: '#0E0E0E', fontSize: 13.5, fontWeight: 850, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,90,31,.35)' }}>+ Yeni</button>
                    </div>
                </div>
              </div>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', height: '100%', background: T.bg, color: T.ink, display: 'flex', flexDirection: 'column' }}>
            {/* Sticky header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 20px 14px', position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    {(step === 1 || step === 3 || step === 4) ? (
                        <button onClick={back} style={{ width: 36, height: 36, borderRadius: 11, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, color: T.muted }}>
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                    ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: T.surface3, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke={T.orange} strokeWidth="1.5" /><path d="M2.5 7.5h15M6.5 1.5v3M13.5 1.5v3" stroke={T.orange} strokeWidth="1.5" strokeLinecap="round" /></svg>
                        </div>
                    )}
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.04em' }}>Yeni Randevu</div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{STEPS[step]} · Adım {step + 1} / {STEPS.length}</div>
                    </div>
                    <button onClick={() => navigate(-1)} style={{ width: 36, height: 36, borderRadius: 11, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.muted2 }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {STEPS.map((_, i) => (
                        <div key={i} style={{ height: 4, flex: i === step ? 3 : 1, borderRadius: 2, background: i <= step ? T.orange : T.surface3, opacity: i === step ? 1 : i < step ? 0.7 : 0.3, transition: 'all .35s cubic-bezier(.2,.8,.2,1)' }} />
                    ))}
                </div>
                {/* Seçim özeti — geri dönüldüğünde önceki adımlarda ne seçildiği görünsün */}
                {step >= 1 && (svc || lines.length > 0) && (
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', marginTop: 10 }}>
                        {(svc || lines[0]?.service) && (
                            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: T.surface2, border: `1px solid ${T.border}`, color: T.ink }}>
                                {lines.length > 1 ? `${lines.length} hizmet` : (svc?.name || lines[0]?.service.name)}
                            </span>
                        )}
                        {step >= 1 && (
                            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: T.surface2, border: `1px solid ${T.border}`, color: T.ink }}>
                                {dateChip}
                            </span>
                        )}
                        {time && (
                            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: T.surface2, border: `1px solid ${T.border}`, color: T.ink, fontFamily: T.mono }}>
                                {time}
                            </span>
                        )}
                        {selStaff && (
                            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: T.surface2, border: `1px solid ${T.border}`, color: T.ink }}>
                                {selStaff.name}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Scroll body */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {/* STEP 0 — service */}
                {step === 0 && (
                    <div style={{ padding: '4px 20px 24px' }}>
                        <Label>{lines.length ? 'Yeni hizmet ekle' : 'Hizmet Seç'}</Label>
                        {settings.services.map((s) => {
                            const on = svc?.id === s.id;
                            return (
                                <div key={s.id} onClick={() => { setSvc(s); setTimeout(() => setStep(1), 220); }} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 14px 14px 16px', background: on ? 'rgba(255,90,31,.08)' : T.surface, border: `1.5px solid ${on ? T.orange : T.border}`, borderRadius: 17, marginBottom: 9, cursor: 'pointer', transition: 'all .15s' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 13, background: on ? 'rgba(255,90,31,.15)' : T.surface2, border: `1px solid ${on ? 'rgba(255,90,31,.3)' : T.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                        <div style={{ width: 16, height: 16, borderRadius: 5, background: s.color || T.orange }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14.5, fontWeight: 780, letterSpacing: '-0.015em' }}>{s.name}</div>
                                        <div style={{ fontSize: 12, color: T.muted, marginTop: 3, fontFamily: T.mono }}>{s.duration} dk</div>
                                    </div>
                                    {s.price != null && <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.03em', color: on ? T.orange : T.ink, flexShrink: 0 }}>₺{s.price}</div>}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* STEP 1 — date & staff & time (taslak) */}
                {step === 1 && (
                    <div style={{ padding: '4px 20px 24px' }}>
                        {svc && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(255,90,31,.07)', border: '1px solid rgba(255,90,31,.2)', borderRadius: 14, marginBottom: 16 }}>
                                <div style={{ width: 14, height: 14, borderRadius: 4, background: svc.color || T.orange, flexShrink: 0 }} />
                                <span style={{ fontSize: 13.5, fontWeight: 780 }}>{svc.name}</span>
                                <span style={{ fontSize: 11.5, color: T.muted, fontFamily: T.mono, marginLeft: 'auto' }}>{svc.duration} dk · ₺{svc.price ?? 0}</span>
                            </div>
                        )}
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '18px 16px 14px', marginBottom: 18 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <button onClick={() => setMonth((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: (p.m + 11) % 12 }))} style={{ width: 32, height: 32, borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.muted }}><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                                <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.02em' }}>{MONTHS[month.m]} {month.y}</div>
                                <button onClick={() => setMonth((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: (p.m + 1) % 12 }))} style={{ width: 32, height: 32, borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.muted }}><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', marginBottom: 6 }}>
                                {DOW.map((d, i) => <div key={i} style={{ fontSize: 10, fontWeight: 700, color: i >= 5 ? T.muted2 : T.muted, padding: '2px 0', fontFamily: T.mono }}>{d}</div>)}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px 0', textAlign: 'center' }}>
                                {monthGrid.map((c, i) => c === null ? <div key={i} /> : (
                                    <div key={c.ds} onClick={() => !c.past && (setDate(c.ds), setTime(null))} style={{ position: 'relative', padding: '6px 2px', borderRadius: 10, fontSize: 13, fontWeight: c.today ? 900 : 650, color: c.ds === date ? '#0E0E0E' : c.past ? T.muted2 : c.dow >= 5 ? T.muted : T.ink, background: c.ds === date ? T.orange : 'transparent', cursor: c.past ? 'default' : 'pointer', transition: 'all .14s' }}>
                                        {c.d}
                                        {c.today && c.ds !== date && <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: T.orange }} />}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {activeStaff.length > 0 && (
                            <>
                                <Label>Personel</Label>
                                <div style={{ display: 'flex', gap: 9, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', margin: '0 -20px 18px', padding: '2px 20px' }}>
                                    {activeStaff.map((p, i) => {
                                        const on = staffIdx === i;
                                        return (
                                            <div key={p.id} onClick={() => { setStaffIdx(i); setTime(null); }} style={{ flex: '0 0 auto', width: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '12px 8px', background: on ? 'rgba(255,90,31,.08)' : T.surface, border: `1.5px solid ${on ? T.orange : T.border}`, borderRadius: 15, cursor: 'pointer', transition: 'all .15s' }}>
                                                <div style={{ position: 'relative' }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.color || avatarColor(p.name), display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 850, color: '#0E0E0E' }}>{p.name[0]?.toUpperCase()}</div>
                                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: T.green, border: `2px solid ${T.surface}` }} />
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 11.5, fontWeight: 750 }}>{p.name}</div>
                                                    <div style={{ fontSize: 9.5, color: T.muted, marginTop: 1 }}>{p.specialty || 'Personel'}</div>
                                                </div>
                                                {on && <div style={{ width: 18, height: 18, borderRadius: '50%', background: T.orange, display: 'grid', placeItems: 'center' }}><svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#0E0E0E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        <Label>Müsait Saatler · {dObj.getDate()} {MONTHS[dObj.getMonth()]}</Label>
                        {slots.length === 0 ? (
                            <div style={{ padding: '20px 16px', textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                                Bu gün için uygun saat yok.<br />Çalışma saatleri kapalı olabilir veya hizmet süresi sığmıyor.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                                {slots.map((s) => <SlotTile key={s.t} s={s} on={time === s.t} onPick={() => s.avail && setTime(s.t)} />)}
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2 — sepet */}
                {step === 2 && (
                    <div style={{ padding: '4px 20px 24px' }}>
                        <Label>İşlemler · {lines.length} hizmet</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
                            {lines.map((l) => (
                                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${l.service.color || T.orange}22`, border: `1px solid ${(l.service.color || T.orange)}44`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                        <div style={{ width: 15, height: 15, borderRadius: 5, background: l.service.color || T.orange }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 780, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.service.name}</div>
                                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2.5, fontFamily: T.mono }}>{l.time}–{l.endTime} · {l.staffName || 'Atanmadı'}</div>
                                    </div>
                                    <span style={{ fontSize: 14.5, fontWeight: 850, fontFamily: T.mono }}>₺{l.service.price ?? 0}</span>
                                    <button onClick={() => removeLine(l.id)} aria-label="Çıkar" style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(224,112,112,.1)', border: 'none', cursor: 'pointer', color: T.red, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button onClick={addAnother} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: T.surface, border: `1.5px dashed ${T.orange}`, borderRadius: 15, cursor: 'pointer', color: T.orange, fontSize: 13.5, fontWeight: 800, marginBottom: 16 }}>
                            <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                            Başka hizmet ekle
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'linear-gradient(135deg,rgba(255,90,31,.08),rgba(255,90,31,.03))', border: '1px solid rgba(255,90,31,.2)', borderRadius: 15 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.muted }}>Toplam</span>
                            <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: T.orange }}>₺{grandTotal}</span>
                        </div>
                    </div>
                )}

                {/* STEP 3 — customer */}
                {step === 3 && (
                    <div style={{ padding: '4px 20px 24px' }}>
                        <div style={{ display: 'flex', gap: 10, background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 14, padding: '13px 14px', marginBottom: 16 }}>
                            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1, color: T.muted }}><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" /><path d="M13.5 13.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                            <input value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="İsim veya telefon ara…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13.5, fontFamily: T.font }} />
                        </div>
                        <div onClick={() => { setCust(null); setStep(4); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: T.surface, border: `1px dashed ${T.border2}`, borderRadius: 16, marginBottom: 12, cursor: 'pointer' }}>
                            <div style={{ width: 42, height: 42, borderRadius: '50%', background: T.surface3, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke={T.muted} strokeWidth="1.5" /><path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" /></svg>
                            </div>
                            <div>
                                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Geçici / Walk-in</div>
                                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>Kayıtlı müşteri olmadan devam et</div>
                            </div>
                        </div>
                        <Label>{custQuery ? 'Sonuçlar' : 'Müşteriler'}</Label>
                        {custMatches.map((c) => {
                            const on = cust?.id === c.id;
                            return (
                                <div key={c.id} onClick={() => { setCust(c); setTimeout(() => setStep(4), 220); }} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', borderRadius: 17, cursor: 'pointer', background: on ? 'rgba(255,90,31,.07)' : T.surface, border: `1.5px solid ${on ? T.orange : T.border}`, marginBottom: 9, transition: 'all .15s' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: avatarColor(c.name), display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 870, color: '#0E0E0E', flexShrink: 0 }}>{c.name[0]?.toUpperCase()}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 750, letterSpacing: '-0.01em' }}>{c.name}</div>
                                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontFamily: T.mono }}>{c.phone || '—'}</span>
                                            {c.lastVisit && <><span style={{ width: 3, height: 3, borderRadius: '50%', background: T.muted2, display: 'inline-block' }} /><span>{formatDateEU(c.lastVisit)}</span></>}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 10.5, fontFamily: T.mono, fontWeight: 700, color: T.muted2, flexShrink: 0 }}>{c.totalReservations} ziyaret</div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* STEP 4 — confirm */}
                {step === 4 && (
                    <div style={{ padding: '4px 20px 24px' }}>
                        <Label>Randevu Özeti</Label>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden', marginBottom: 14 }}>
                            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 850 }}>{cust?.name || 'Geçici / Walk-in'}</div>
                                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{dObj.getDate()} {MONTHS[dObj.getMonth()]} {dObj.getFullYear()}</div>
                                </div>
                                <div style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>{lines.length} hizmet</div>
                            </div>
                            {lines.map((l, i) => (
                                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: i < lines.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                    <div style={{ width: 12, height: 12, borderRadius: 4, background: l.service.color || T.orange, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 760 }}>{l.service.name}</div>
                                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{l.time}–{l.endTime} · {l.staffName || 'Atanmadı'}</div>
                                    </div>
                                    <span style={{ fontSize: 13.5, fontWeight: 800, fontFamily: T.mono }}>₺{l.service.price ?? 0}</span>
                                </div>
                            ))}
                        </div>

                        <button onClick={() => setShowNote((n) => !n)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: T.surface, border: `1px dashed ${showNote ? T.orange : T.border2}`, borderRadius: 14, cursor: 'pointer', color: showNote ? T.orange : T.muted, marginBottom: showNote ? 8 : 12 }}>
                            <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 17v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{showNote ? 'Not' : 'Not ekle (opsiyonel)'}</span>
                        </button>
                        {showNote && <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn: Saç uzunluğu kısa…" style={{ width: '100%', minHeight: 80, padding: '12px 14px', background: T.surface2, border: `1.5px solid ${T.orange}`, borderRadius: 14, color: T.ink, fontFamily: T.font, fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5, marginBottom: 12 }} />}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'linear-gradient(135deg,rgba(255,90,31,.08),rgba(255,90,31,.03))', border: '1px solid rgba(255,90,31,.2)', borderRadius: 15 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.muted }}>Toplam</span>
                            <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: T.orange }}>₺{grandTotal}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky CTA */}
            <div style={{ padding: '12px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 14px)', background: `${T.bg}f5`, backdropFilter: 'blur(14px)', borderTop: `1px solid ${T.border}` }}>
                <button onClick={handleNext} disabled={(step === 1 ? !time : step === 2 ? lines.length === 0 : step === 0 ? !svc : false) || saving} style={ctaStyle((step === 1 ? !!time : step === 2 ? lines.length > 0 : step === 0 ? !!svc : true) && !saving)}>
                    {step === 0 && (svc ? 'Devam →' : 'Hizmet seçin')}
                    {step === 1 && (time ? `İşleme Ekle · ${dateChip} ${time}` : 'Saat seçin')}
                    {step === 2 && `Devam → (${lines.length} hizmet · ₺${grandTotal})`}
                    {step === 3 && 'Özeti Gör →'}
                    {step === 4 && (saving ? 'Kaydediliyor…' : <><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5 10l4 4 6-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>Randevuyu Oluştur</>)}
                </button>
            </div>
        </div>
    );
};

function ctaStyle(active: boolean): React.CSSProperties {
    return { width: '100%', height: 54, borderRadius: 16, background: active ? T.orange : T.surface3, color: active ? '#0E0E0E' : T.muted2, fontSize: 15.5, fontWeight: 860, border: 'none', cursor: active ? 'pointer' : 'not-allowed', boxShadow: active ? '0 6px 22px rgba(255,90,31,.36)' : 'none', letterSpacing: '-0.01em', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };
}

function Label({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 10.5, color: T.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 13 }}>{children}</div>;
}

function SlotTile({ s, on, onPick }: { s: { t: string; avail: boolean }; on: boolean; onPick: () => void }) {
    return (
        <div onClick={onPick} style={{ padding: '11px 4px', background: !s.avail ? T.surface3 : on ? 'rgba(255,90,31,.1)' : T.surface, border: `1.5px solid ${on ? T.orange : s.avail ? T.border : 'transparent'}`, borderRadius: 13, textAlign: 'center', fontFamily: T.mono, fontSize: 12.5, fontWeight: 750, color: !s.avail ? T.muted2 : on ? T.orange : T.ink, cursor: s.avail ? 'pointer' : 'not-allowed', transition: 'all .14s' }}>
            {s.t}
            {!s.avail && <div style={{ fontSize: 8, color: T.muted2, fontFamily: T.mono, marginTop: 1 }}>dolu</div>}
        </div>
    );
}
