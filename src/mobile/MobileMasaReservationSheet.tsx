import { useEffect, useState } from 'react';
import type { Table, Staff, TableReservation, QueueEntry } from '@/types';
import { BottomSheet } from './BottomSheet';
import { Field } from './pages/MobileStaff';
import { T } from './theme';

// Masaya rezervasyon / walk-in formu — masaüstü MasaPage.tsx'teki ResModal ile
// aynı alan seti (masa, isim, kişi, saat, telefon, garson), tek ekran (mobil
// tasarımdaki 4 adımlı wizard yerine — bkz. plan: kapsam basitleştirme kararı).
export function MobileMasaReservationSheet({ open, tables, staff, date, preTableId, walkIn, prefill, onClose, onSave }: {
    open: boolean;
    tables: Table[];
    staff: Staff[];
    date: string;
    preTableId?: string;
    walkIn?: boolean;
    prefill?: QueueEntry;
    onClose: () => void;
    onSave: (p: Omit<TableReservation, 'id' | 'createdAt' | 'organizationId'>) => void;
}) {
    const [tableId, setTableId] = useState(preTableId || tables[0]?.id || '');
    const [name, setName] = useState(prefill?.customerName || (walkIn ? 'Walk-in' : ''));
    const [phone, setPhone] = useState(prefill?.customerPhone || '');
    const [party, setParty] = useState(prefill?.partySize || 2);
    const [resDate, setResDate] = useState(date);
    const [time, setTime] = useState('19:00');
    const [staffId, setStaffId] = useState('');
    const canSave = !!tableId && name.trim().length > 0;

    // Sheet açık/kapalı arasında yeniden mount olmuyor (BottomSheet içeride
    // görünürlüğü yönetiyor) — bu yüzden alanlar her açılışta güncel props'a
    // göre sıfırlanmalı, yoksa örn. masa seçimi ilk mount anındaki (boş) hâlde
    // takılı kalır ve "Rezervasyon Oluştur" hep devre dışı görünür.
    useEffect(() => {
        if (!open) return;
        const now = new Date();
        const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setTableId(preTableId || tables[0]?.id || '');
        setName(prefill?.customerName || (walkIn ? 'Walk-in' : ''));
        setPhone(prefill?.customerPhone || '');
        setParty(prefill?.partySize || 2);
        setResDate(date);
        setTime(walkIn ? nowHM : '19:00');
        setStaffId('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, preTableId, walkIn, prefill, date]);

    return (
        <BottomSheet open={open} onClose={onClose} title={walkIn ? 'Walk-in Misafir' : 'Yeni Rezervasyon'}>
            <p style={{ fontSize: 12.5, color: T.muted, marginTop: -8, marginBottom: 18 }}>{walkIn ? 'Rezervasyonsuz gelen misafiri oturt' : 'Bir masaya rezervasyon oluştur'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Masa">
                    <select value={tableId} onChange={(e) => setTableId(e.target.value)} style={inp}>
                        {tables.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.zone} ({t.capacity} kişi)</option>)}
                    </select>
                </Field>
                <Field label="Müşteri Adı">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="İsim" style={inp} />
                </Field>
                {!walkIn && (
                    <Field label="Tarih">
                        <input type="date" min={date} value={resDate} onChange={(e) => setResDate(e.target.value)} style={inp} />
                    </Field>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                        <Field label="Kişi"><input type="number" min={1} value={party} onChange={(e) => setParty(Math.max(1, Number(e.target.value)))} style={inp} /></Field>
                    </div>
                    <div style={{ flex: 1 }}>
                        <Field label="Saat"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp} /></Field>
                    </div>
                </div>
                <Field label="Telefon (ops.)">
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx" style={inp} />
                </Field>
                {staff.length > 0 && (
                    <Field label="Garson (ops.)">
                        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={inp}>
                            <option value="">Atanmadı</option>
                            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </Field>
                )}
            </div>
            <button disabled={!canSave}
                onClick={() => onSave({ tableId, customerName: name.trim(), customerPhone: phone.trim() || undefined, staffId: staffId || undefined, partySize: party, date: walkIn ? date : resDate, startTime: time, status: walkIn ? 'seated' : 'reserved' })}
                style={primaryBtn(!canSave)}>
                {walkIn ? 'Oturt' : 'Rezervasyon Oluştur'}
            </button>
        </BottomSheet>
    );
}

const inp: React.CSSProperties = { width: '100%', height: 48, borderRadius: 14, background: T.surface2, border: `1px solid ${T.border2}`, color: T.ink, fontSize: 15, fontWeight: 600, padding: '0 15px', outline: 'none', fontFamily: T.font, boxSizing: 'border-box' };
function primaryBtn(disabled: boolean): React.CSSProperties {
    return { width: '100%', marginTop: 20, padding: '15px', borderRadius: 15, border: 'none', background: disabled ? T.surface3 : T.orange, color: disabled ? T.muted2 : '#0E0E0E', fontSize: 15, fontWeight: 850, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.font, boxShadow: disabled ? 'none' : '0 6px 18px rgba(255,90,31,0.32)' };
}
