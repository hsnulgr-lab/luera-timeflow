import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DentalChart } from '@/components/dental/DentalChart';
import { TreatmentPlans } from '@/components/dental/TreatmentPlans';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useStaffSession } from '@/contexts/StaffSessionProvider';
import type { Reservation } from '@/types';
import { D } from './hizmetDesign';

type EncounterTab = 'chart' | 'plans' | 'control';

const DENTAL_THEME = {
    ink: D.ink,
    muted: D.muted,
    surface: D.s1,
    surface2: D.s2,
    border: D.border,
    border2: D.border2,
};

function addDays(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + days);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
}

function minutesToTime(value: number): string {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function MobileDentalEncounter({ reservation, locked = false }: { reservation: Reservation; locked?: boolean }) {
    const { staff, can } = useStaffSession();
    const { staff: clinicStaff } = useStaff();
    const { reservations, ensureReservationCustomer, addReservation, checkConflict } = useReservations();
    const [tab, setTab] = useState<EncounterTab>('chart');
    const [linkResult, setLinkResult] = useState<{ id: string; failed: boolean } | null>(null);
    const customerId = reservation.customerId || linkResult?.id || '';
    const linking = !reservation.customerId && can('patients:view') && linkResult === null;
    const linkFailed = linkResult?.failed ?? false;

    useEffect(() => {
        if (reservation.customerId || linkResult !== null || !can('patients:view')) return;
        let alive = true;
        ensureReservationCustomer(reservation).then((id) => {
            if (!alive) return;
            setLinkResult({ id: id || '', failed: !id });
        });
        return () => { alive = false; };
    }, [reservation, linkResult, ensureReservationCustomer, can]);

    const today = useMemo(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }, []);
    const defaultControlDate = useMemo(() => {
        const followUp = addDays(reservation.date, 3);
        return followUp < today ? today : followUp;
    }, [reservation.date, today]);
    const [controlDate, setControlDate] = useState(defaultControlDate);
    const [controlTime, setControlTime] = useState(reservation.startTime);
    const [savingControl, setSavingControl] = useState(false);
    const [createdControlId, setCreatedControlId] = useState('');

    const controlEnd = useMemo(
        () => minutesToTime(Math.min(23 * 60 + 59, timeToMinutes(controlTime) + 15)),
        [controlTime],
    );
    // Kontrol randevusu giriş yapan asistana değil, kaynak muayenenin hekimine
    // yazılır. Atanmamış bir randevuyu yalnız hekim kendi adına takip edebilir.
    const sourceDoctor = reservation.staffId
        ? clinicStaff.find((member) => member.id === reservation.staffId && member.role === 'doctor')
        : undefined;
    const sourceIsCurrentDoctor = Boolean(
        reservation.staffId && staff && reservation.staffId === staff.id && staff.role === 'doctor',
    );
    const controlStaffId = reservation.staffId
        ? (sourceDoctor?.id || (sourceIsCurrentDoctor ? staff?.id : undefined))
        : (staff?.role === 'doctor' ? staff.id : undefined);
    const controlStaffName = sourceDoctor?.name || (sourceIsCurrentDoctor ? staff?.name : (!reservation.staffId && staff?.role === 'doctor' ? staff.name : undefined));
    const conflict = controlStaffId
        ? checkConflict(controlDate, controlTime, controlEnd, undefined, controlStaffId, reservation.resourceId)
        : null;
    const existingControl = useMemo(() => reservations.find((item) =>
        item.id !== reservation.id
        && item.status !== 'cancelled'
        && item.customerId === customerId
        && item.date === controlDate
        && item.service.toLocaleLowerCase('tr-TR').includes('kontrol')),
    [reservations, reservation.id, customerId, controlDate]);

    const findAvailableTime = () => {
        if (!controlStaffId) return;
        const first = Math.max(8 * 60, timeToMinutes(controlTime) + 15);
        for (let start = first; start <= 19 * 60 + 45; start += 15) {
            const candidate = minutesToTime(start);
            const end = minutesToTime(start + 15);
            if (!checkConflict(controlDate, candidate, end, undefined, controlStaffId, reservation.resourceId)) {
                setControlTime(candidate);
                return;
            }
        }
        toast.error('Bu gün için uygun 15 dakikalık aralık bulunamadı');
    };

    const createControl = async () => {
        if (!can('appointments:create') || !controlStaffId || !customerId || controlDate < today || conflict || existingControl || savingControl) return;
        setSavingControl(true);
        const created = await addReservation({
            customerId,
            customerName: reservation.customerName,
            customerPhone: reservation.customerPhone,
            customerEmail: reservation.customerEmail,
            date: controlDate,
            startTime: controlTime,
            endTime: controlEnd,
            service: 'Kontrol',
            serviceColor: '#6B9FD4',
            status: 'confirmed',
            notes: `Kontrol randevusu · kaynak randevu ${reservation.id}`,
            staffId: controlStaffId,
            staffName: controlStaffName,
            staffColor: reservation.staffColor,
            resourceId: reservation.resourceId,
        });
        setSavingControl(false);
        if (created) {
            setCreatedControlId(created.id);
            toast.success(`Kontrol randevusu ${controlDate} ${controlTime} için oluşturuldu`);
        }
    };

    const tabs: Array<{ id: EncounterTab; label: string; visible: boolean }> = [
        { id: 'chart', label: 'Diş Şeması', visible: can('dental-chart:view') },
        { id: 'plans', label: 'Plan & Ödeme', visible: can('treatment-plans:view') },
        { id: 'control', label: 'Kontrol', visible: !locked && can('appointments:create') },
    ];
    const visibleTabs = tabs.filter((item) => item.visible);

    if (visibleTabs.length === 0) return null;
    const activeTab = visibleTabs.some((item) => item.id === tab) ? tab : visibleTabs[0].id;

    return (
        <section style={{ margin: '22px 20px 0', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ padding: '16px 16px 13px', borderBottom: `1px solid ${D.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 850, letterSpacing: '-.025em' }}>Hasta Muayene Alanı</div>
                        <div style={{ fontSize: 11.5, color: D.muted, marginTop: 3 }}>{reservation.customerName} · {locked ? 'onaylanana kadar salt okunur' : 'randevu, şema ve finans aynı kayıtta'}</div>
                    </div>
                    <span style={{ padding: '4px 9px', borderRadius: 999, background: customerId ? 'rgba(124,196,127,.14)' : 'rgba(224,168,78,.14)', color: customerId ? D.green : D.amber, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {linking ? 'Bağlanıyor…' : customerId ? 'Hasta bağlı' : 'Bağlantı yok'}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 13, overflowX: 'auto' }}>
                    {visibleTabs.map((item) => (
                        <button key={item.id} type="button" onClick={() => setTab(item.id)}
                            style={{ flex: '1 0 auto', height: 36, padding: '0 10px', borderRadius: 10, border: `1px solid ${activeTab === item.id ? D.orange : D.border}`, background: activeTab === item.id ? 'rgba(255,90,31,.12)' : D.s2, color: activeTab === item.id ? D.orange : D.muted, fontSize: 11.5, fontWeight: 780, cursor: 'pointer' }}>
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: 15 }}>
                {!customerId ? (
                    <div style={{ padding: '22px 14px', textAlign: 'center', borderRadius: 14, background: D.s2, color: linkFailed ? D.red : D.muted, fontSize: 12.5, lineHeight: 1.55 }}>
                        {linking ? 'Randevu hasta kaydına bağlanıyor…' : 'Bu randevunun hasta kaydı bağlanamadı. Telefon bilgisini kontrol edin.'}
                    </div>
                ) : activeTab === 'chart' ? (
                    <DentalChart customerId={customerId} staffId={staff?.id} T={DENTAL_THEME} readOnly={locked || !can('dental-chart:edit')} />
                ) : activeTab === 'plans' ? (
                    <TreatmentPlans
                        customerId={customerId}
                        // Hekim planın klinik sorumlusudur. Kasa tahsilat
                        // yaparken kendi kimliğini planın hekimi diye yazmaz.
                        staffId={can('treatment-plans:edit') ? staff?.id : reservation.staffId}
                        reservationId={reservation.id}
                        T={DENTAL_THEME}
                        readOnly={locked || !can('treatment-plans:edit')}
                        canCollect={!locked && can('payments:collect')}
                    />
                ) : (
                    <div>
                        <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, marginBottom: 13 }}>Varsayılan tarih muayeneden 3 gün sonrası; saat ve tarih gerektiğinde değiştirilebilir.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 112px', gap: 8 }}>
                            <label style={fieldLabel}>
                                <span>Tarih</span>
                                <input type="date" min={today} value={controlDate} onChange={(event) => { setControlDate(event.target.value); setCreatedControlId(''); }} style={fieldInput} />
                            </label>
                            <label style={fieldLabel}>
                                <span>Saat</span>
                                <input type="time" value={controlTime} onChange={(event) => { setControlTime(event.target.value); setCreatedControlId(''); }} style={fieldInput} />
                            </label>
                        </div>
                        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: D.s2, color: D.muted, fontFamily: D.mono, fontSize: 11.5 }}>
                            {controlDate} · {controlTime}–{controlEnd} · Kontrol · {controlStaffName || 'hekim atanmadı'}
                        </div>
                        {!controlStaffId && (
                            <div style={{ marginTop: 9, padding: '10px 12px', borderRadius: 12, background: 'rgba(224,168,78,.12)', color: D.amber, fontSize: 12, fontWeight: 700 }}>
                                Kontrol oluşturmak için önce kaynak randevuya bir hekim atayın.
                            </div>
                        )}
                        {existingControl && (
                            <div style={{ marginTop: 9, padding: '10px 12px', borderRadius: 12, background: 'rgba(107,159,212,.12)', color: D.blue, fontSize: 12, fontWeight: 700 }}>
                                Bu gün için kontrol zaten var: {existingControl.startTime}–{existingControl.endTime}
                            </div>
                        )}
                        {conflict && !existingControl && (
                            <div style={{ marginTop: 9, padding: '10px 12px', borderRadius: 12, background: 'rgba(224,168,78,.12)', color: D.amber, fontSize: 12, lineHeight: 1.45 }}>
                                <div style={{ fontWeight: 780 }}>Bu saatte çakışma var: {conflict.customerName} · {conflict.startTime}–{conflict.endTime}</div>
                                <button type="button" onClick={findAvailableTime} style={{ marginTop: 7, padding: 0, border: 0, background: 'none', color: D.amber, textDecoration: 'underline', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>İlk uygun saati bul →</button>
                            </div>
                        )}
                        <button type="button" onClick={createControl}
                            disabled={savingControl || !controlStaffId || controlDate < today || !!conflict || !!existingControl || !!createdControlId}
                            style={{ width: '100%', height: 46, marginTop: 12, borderRadius: 14, border: 'none', background: savingControl || !controlStaffId || controlDate < today || conflict || existingControl || createdControlId ? D.s3 : D.orange, color: savingControl || !controlStaffId || controlDate < today || conflict || existingControl || createdControlId ? D.muted : '#fff', fontSize: 13.5, fontWeight: 820, cursor: savingControl || !controlStaffId || controlDate < today || conflict || existingControl || createdControlId ? 'not-allowed' : 'pointer' }}>
                            {savingControl ? 'Oluşturuluyor…' : createdControlId ? 'Kontrol Randevusu Oluşturuldu ✓' : existingControl ? 'Kontrol Randevusu Zaten Var' : '3 Gün Sonraya Kontrol Oluştur'}
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, color: D.muted, fontSize: 10.5, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '.06em' };
const fieldInput: React.CSSProperties = { width: '100%', height: 42, borderRadius: 11, border: `1px solid ${D.border}`, background: D.s2, color: D.ink, padding: '0 10px', fontFamily: D.mono, fontSize: 12, outline: 'none', boxSizing: 'border-box', colorScheme: 'var(--lt-scheme)' as React.CSSProperties['colorScheme'] };
