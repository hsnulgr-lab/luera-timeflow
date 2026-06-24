import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Reservation, Service } from '@/types';
import { BottomSheet } from './BottomSheet';
import { STS_BG, STS_COLOR, STS_LABEL, T } from './theme';

type ReservationStatus = Reservation['status'];

// Dakika ekleyerek bitiş saatini hesapla (HH:MM)
function addMinutes(hhmm: string, mins: number): string {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + mins;
    const nh = Math.floor((total % 1440) / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

const STATUSES: ReservationStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

// Randevu detay + düzenle. Yönetici ve operatör ortak kullanır; düzenleme alanları
// updateReservation/deleteReservation ile mevcut veri katmanına bağlanır.
export function ReservationSheet({ reservation, services, onClose, onUpdate, onDelete, checkConflict }: {
    reservation: Reservation | null;
    services: Service[];
    onClose: () => void;
    onUpdate: (id: string, updates: Partial<Reservation>) => Promise<void> | void;
    onDelete: (id: string) => Promise<void> | void;
    checkConflict?: (date: string, startTime: string, endTime: string, excludeId?: string, staffId?: string) => Reservation | null;
}) {
    const [edit, setEdit] = useState(false);
    const [date, setDate] = useState('');
    const [start, setStart] = useState('');
    const [service, setService] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (reservation) {
            setEdit(false);
            setDate(reservation.date);
            setStart(reservation.startTime);
            setService(reservation.service);
            setNotes(reservation.notes || '');
        }
    }, [reservation]);

    if (!reservation) return null;
    const r = reservation;

    const setStatus = async (s: ReservationStatus) => { await onUpdate(r.id, { status: s }); toast.success(STS_LABEL[s]); };

    const saveEdit = async () => {
        if (!service.trim()) { toast.error('Hizmet seçin'); return; }
        const svc = services.find((x) => x.name === service);
        const dur = svc?.duration ?? 30;
        const end = addMinutes(start, dur);
        // Çakışma kontrolü — kendi randevusu hariç, aynı personel için
        const clash = checkConflict?.(date, start, end, r.id, r.staffId);
        if (clash) {
            toast.error(`Bu saat ${r.staffName || 'personel'} için dolu (${clash.startTime}–${clash.endTime}). Başka saat seçin.`);
            return;
        }
        setSaving(true);
        await onUpdate(r.id, {
            date,
            startTime: start,
            endTime: end,
            service,
            serviceColor: svc?.color ?? r.serviceColor,
            notes: notes.trim(),
        });
        setSaving(false);
        setEdit(false);
        toast.success('Randevu güncellendi');
    };

    const remove = async () => {
        if (!confirm(`${r.customerName} randevusu silinsin mi?`)) return;
        await onDelete(r.id);
        onClose();
    };

    return (
        <BottomSheet open={!!reservation} onClose={onClose} title={edit ? 'Randevuyu Düzenle' : 'Randevu Detayı'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4, paddingBottom: 4 }}>
                {/* Müşteri başlığı */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 15, background: r.staffColor || r.serviceColor || T.orange, display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{r.customerName[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 850, letterSpacing: '-0.02em' }}>{r.customerName}</div>
                        {r.customerPhone && <div style={{ fontSize: 12.5, color: T.muted, fontFamily: T.mono, marginTop: 2 }}>{r.customerPhone}</div>}
                    </div>
                    <div style={{ padding: '4px 11px', borderRadius: 999, background: STS_BG[r.status], color: STS_COLOR[r.status], fontSize: 11, fontWeight: 800 }}>{STS_LABEL[r.status]}</div>
                </div>

                {!edit ? (
                    <>
                        {/* Detay satırları */}
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }}>
                            <Row label="Hizmet" value={r.service} />
                            <Row label="Tarih" value={new Date(r.date + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} />
                            <Row label="Saat" value={`${r.startTime} – ${r.endTime}`} />
                            {r.staffName && <Row label="Personel" value={r.staffName} />}
                            {r.notes && <Row label="Not" value={r.notes} last />}
                        </div>

                        {/* Durum aksiyonları */}
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 9, fontFamily: T.mono }}>Durum</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                                {STATUSES.map((s) => {
                                    const on = r.status === s;
                                    return (
                                        <button key={s} onClick={() => setStatus(s)} style={{ height: 44, borderRadius: 13, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', background: on ? STS_BG[s] : T.surface, color: on ? STS_COLOR[s] : T.muted, border: `1px solid ${on ? STS_COLOR[s] : T.border}` }}>{STS_LABEL[s]}</button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setEdit(true)} style={{ flex: 1, height: 50, borderRadius: 15, background: T.orange, color: '#0E0E0E', fontSize: 15, fontWeight: 850, border: 'none', cursor: 'pointer' }}>Düzenle</button>
                            <button onClick={remove} aria-label="Sil" style={{ width: 56, height: 50, borderRadius: 15, background: 'rgba(224,112,112,.10)', color: T.red, border: '1px solid rgba(224,112,112,.22)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                                <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <Lbl t="Hizmet" />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {services.map((s) => (
                                <button key={s.id} onClick={() => setService(s.name)} style={{ padding: '9px 13px', borderRadius: 11, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: service === s.name ? 'rgba(255,90,31,.14)' : T.surface, color: service === s.name ? T.orange : T.muted, border: `1px solid ${service === s.name ? T.orange : T.border}` }}>{s.name}</button>
                            ))}
                            {services.length === 0 && <span style={{ fontSize: 12.5, color: T.muted }}>Önce Ayarlar’dan hizmet ekleyin.</span>}
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1 }}><Lbl t="Tarih" /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, colorScheme: 'var(--lt-scheme,dark)' as any }} /></div>
                            <div style={{ width: 130 }}><Lbl t="Saat" /><input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...inp, colorScheme: 'var(--lt-scheme,dark)' as any, fontFamily: T.mono }} /></div>
                        </div>

                        <div><Lbl t="Not" /><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Not ekle…" style={{ ...inp, height: 'auto', padding: '12px 15px', resize: 'none' }} /></div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                            <button onClick={() => setEdit(false)} style={{ flex: 1, height: 50, borderRadius: 15, background: T.surface2, color: T.ink, fontSize: 15, fontWeight: 750, border: `1px solid ${T.border2}`, cursor: 'pointer' }}>Vazgeç</button>
                            <button onClick={saveEdit} disabled={saving} style={{ flex: 1, height: 50, borderRadius: 15, background: T.orange, color: '#0E0E0E', fontSize: 15, fontWeight: 850, border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
                        </div>
                    </>
                )}
            </div>
        </BottomSheet>
    );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: last ? 'none' : `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, width: 70, flexShrink: 0 }}>{label}</div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{value}</div>
        </div>
    );
}
function Lbl({ t }: { t: string }) {
    return <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 8, fontFamily: T.mono }}>{t}</div>;
}
const inp: React.CSSProperties = { width: '100%', height: 48, borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontSize: 15, fontWeight: 600, padding: '0 15px', outline: 'none', fontFamily: T.font };
