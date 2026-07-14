import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { useInstallmentSchedules } from '@/hooks/useInstallmentSchedules';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import type { InstallmentCadence, PaymentMethod, TreatmentInstallment, TreatmentPlan } from '@/types';

const PAY_METHODS: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];
const fmt = (n: number) => n.toLocaleString('tr-TR');

interface T { ink: string; muted: string; surface: string; surface2: string; border: string; border2: string }

interface TreatmentPlansProps {
    customerId: string;
    staffId?: string;
    reservationId?: string;
    T: T;
    readOnly?: boolean;
    canCollect?: boolean;
}

// Tedavi planı + taksit takibi — hasta detayına gömülür (masaüstü + mobil
// paylaşır). Taksitler ayrı bir defter değil, mevcut payments (Kasa) tablosuna
// treatmentPlanId ile bağlanır — gelir raporları tek kaynaktan beslenir.
export function TreatmentPlans(props: TreatmentPlansProps) {
    // Hasta değişirken açık plan/ödeme/taksit formlarının yeni hastaya taşınmasını
    // engelle. İç bileşen customerId anahtarıyla tamamen yeniden kurulur.
    return <TreatmentPlansForCustomer key={props.customerId} {...props} />;
}

function TreatmentPlansForCustomer({ customerId, staffId, reservationId, T, readOnly = false, canCollect = true }: TreatmentPlansProps) {
    const { plans, isLoading: plansLoading, addPlan, setPlanStatus, setPlanAttribution } = useTreatmentPlans(customerId);
    const planIds = useMemo(() => plans.map((plan) => plan.id), [plans]);
    const { installments, isLoading: installmentsLoading, available: installmentEngineAvailable, createSchedule } = useInstallmentSchedules(planIds);
    const { payments, addPayment } = usePayments({ treatmentPlanIds: planIds });
    const { reservations } = useReservations();
    const { staff, isLoading: staffLoading } = useStaff();
    const doctors = useMemo(
        () => staff.filter((member) => member.isActive && member.role === 'doctor'),
        [staff],
    );

    const appointmentContext = useMemo(() => {
        if (reservationId) {
            const requested = reservations.find((r) => r.id === reservationId && r.customerId === customerId);
            if (requested) return requested;
        }
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const matches = reservations.filter((r) =>
            r.customerId === customerId && r.date === today && r.status !== 'cancelled');
        return matches.length === 1 ? matches[0] : undefined;
    }, [customerId, reservationId, reservations]);
    const requestedContextStaffId = staffId || appointmentContext?.staffId;
    const contextStaffId = !requestedContextStaffId || staffLoading
        ? requestedContextStaffId
        : doctors.some((member) => member.id === requestedContextStaffId)
            ? requestedContextStaffId
            : undefined;
    // URL/query bağlamını doğrudan güvenilir kabul etme: yalnız gerçekten bu
    // hastaya ait olduğu doğrulanan randevuyu finans kayıtlarına bağla.
    const contextReservationId = appointmentContext?.id;

    const paidFor = (planId: string) => payments.filter((p) => p.treatmentPlanId === planId).reduce((s, p) => s + p.amount, 0);
    const paidForInstallment = (installmentId: string) => payments
        .filter((payment) => payment.installmentId === installmentId)
        .reduce((sum, payment) => sum + payment.amount, 0);

    const [showNew, setShowNew] = useState(false);
    const [title, setTitle] = useState('');
    const [total, setTotal] = useState('');
    const [planStaffId, setPlanStaffId] = useState('');
    const [savingPlan, setSavingPlan] = useState(false);
    const [clinicalUpdatingId, setClinicalUpdatingId] = useState<string | null>(null);

    const createPlan = async () => {
        if (readOnly || plansLoading) return;
        const amount = parseInt(total || '0', 10) || 0;
        const responsibleStaffId = planStaffId || contextStaffId;
        if (!title.trim() || amount <= 0 || !responsibleStaffId) return;
        setSavingPlan(true);
        const p = await addPlan(title.trim(), amount, {
            staffId: responsibleStaffId,
            reservationId: contextReservationId,
        });
        setSavingPlan(false);
        if (p) { setTitle(''); setTotal(''); setPlanStaffId(''); setShowNew(false); }
    };

    const changeClinicalStatus = async (plan: TreatmentPlan) => {
        if (readOnly || plansLoading || staffLoading || clinicalUpdatingId) return;

        const assignedDoctorId = plan.staffId && doctors.some((member) => member.id === plan.staffId)
            ? plan.staffId
            : undefined;
        // Hekim çalışma alanında başka hekime atanmış bir plan klinik olarak
        // kapatılamaz. Yönetici/hasta detayı ekranı staffId göndermediği için
        // gerektiğinde sorumlu hekim adına yönetim yapmaya devam edebilir.
        if (staffId && assignedDoctorId && assignedDoctorId !== staffId) {
            toast.error('Bu tedaviyi yalnız sorumlu hekim tamamlayabilir');
            return;
        }
        const responsibleStaffId = assignedDoctorId
            || contextStaffId
            || (doctors.length === 1 ? doctors[0].id : undefined);
        if (!responsibleStaffId) {
            toast.error('Klinik durum için sorumlu hekim seçilmelidir');
            return;
        }

        const reopening = plan.status === 'completed';
        const confirmed = window.confirm(reopening
            ? 'Plan yeniden aktif duruma alınacak. Gerçekleşmiş diş kayıtları klinik geçmişte korunur. Devam edilsin mi?'
            : 'Planlı diş işlemleri mevcut duruma aktarılacak ve tedavi klinik olarak tamamlanacak. Devam edilsin mi?');
        if (!confirmed) return;

        setClinicalUpdatingId(plan.id);
        if (plan.staffId !== responsibleStaffId) {
            const attributed = await setPlanAttribution(plan.id, {
                staffId: responsibleStaffId,
                reservationId: plan.reservationId || contextReservationId,
            });
            if (!attributed) { setClinicalUpdatingId(null); return; }
        }
        const nextStatus = plan.status === 'completed' ? 'active' : 'completed';
        const updated = await setPlanStatus(plan.id, nextStatus, responsibleStaffId);
        setClinicalUpdatingId(null);
        if (updated) {
            toast.success(nextStatus === 'completed'
                ? 'Tedavi klinik olarak tamamlandı'
                : 'Tedavi planı yeniden açıldı; gerçekleşmiş diş kayıtları korundu');
        }
    };

    const [payingId, setPayingId] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
    const [payStaffId, setPayStaffId] = useState('');
    const [payingInstallmentId, setPayingInstallmentId] = useState<string | null>(null);
    const [paying, setPaying] = useState(false);

    const openPay = (plan: TreatmentPlan, remaining: number, installment?: TreatmentInstallment) => {
        setPayingId(plan.id);
        setPayingInstallmentId(installment?.id || null);
        const installmentRemaining = installment
            ? Math.max(0, installment.amount - paidForInstallment(installment.id))
            : remaining;
        setPayAmount(String(installmentRemaining));
        setPayMethod('cash');
        setPayStaffId(plan.staffId || contextStaffId || (doctors.length === 1 ? doctors[0].id : ''));
    };

    const collectPayment = async (plan: TreatmentPlan, remaining: number) => {
        if (!canCollect) return;
        const amount = Number(payAmount || '0') || 0;
        const targetInstallment = payingInstallmentId
            ? installments.find((item) => item.id === payingInstallmentId)
            : undefined;
        const installmentRemaining = targetInstallment
            ? Math.max(0, targetInstallment.amount - paidForInstallment(targetInstallment.id))
            : remaining;
        const responsibleStaffId = plan.staffId || payStaffId || contextStaffId;
        if (amount <= 0 || amount > Math.min(remaining, installmentRemaining)) {
            toast.error(`En fazla ${fmt(Math.min(remaining, installmentRemaining))} ₺ tahsil edilebilir`);
            return;
        }
        if (!responsibleStaffId) return;
        setPaying(true);
        if (!plan.staffId && responsibleStaffId) {
            const attributed = await setPlanAttribution(plan.id, {
                staffId: responsibleStaffId,
                reservationId: plan.reservationId || contextReservationId,
            });
            if (!attributed) { setPaying(false); return; }
        }
        const p = await addPayment({
            amount,
            method: payMethod,
            type: 'service',
            description: targetInstallment
                ? `${plan.title} · ${targetInstallment.sequenceNo}. taksit`
                : `${plan.title} · ödeme`,
            customerId,
            treatmentPlanId: plan.id,
            installmentId: targetInstallment?.id,
            // Tahsilat hangi ekrandan alınırsa alınsın planın sorumlu
            // hekimi ve kaynak randevusu korunur. Eski plansa ekran bağlamına dön.
            staffId: responsibleStaffId,
            reservationId: plan.reservationId || contextReservationId,
        });
        setPaying(false);
        if (p) {
            setPayingId(null);
            setPayingInstallmentId(null);
        }
    };

    const [schedulePlanId, setSchedulePlanId] = useState<string | null>(null);
    const [scheduleCount, setScheduleCount] = useState('3');
    const [firstDueDate, setFirstDueDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });
    const [scheduleCadence, setScheduleCadence] = useState<InstallmentCadence>('monthly');
    const [scheduling, setScheduling] = useState(false);

    const openSchedule = (planId: string) => {
        setSchedulePlanId(planId);
        setScheduleCount('3');
        setScheduleCadence('monthly');
    };

    const saveSchedule = async (plan: TreatmentPlan, remaining: number) => {
        if (readOnly || !installmentEngineAvailable || scheduling) return;
        setScheduling(true);
        const created = await createSchedule({
            planId: plan.id,
            customerId,
            totalAmount: remaining,
            count: Number(scheduleCount),
            firstDueDate,
            cadence: scheduleCadence,
        });
        setScheduling(false);
        if (created) setSchedulePlanId(null);
    };

    const renderPaymentForm = (plan: TreatmentPlan, remaining: number) => {
        if (payingId !== plan.id) return null;
        const targetInstallment = payingInstallmentId
            ? installments.find((item) => item.id === payingInstallmentId)
            : undefined;
        const disabled = paying || staffLoading || !(plan.staffId || payStaffId || contextStaffId);
        return (
            <div style={{ marginTop: 9, padding: 10, borderRadius: 11, border: `1px solid ${T.border}` }}>
                {targetInstallment && (
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 7 }}>
                        {targetInstallment.sequenceNo}. taksit · vade {new Date(`${targetInstallment.dueDate}T12:00:00`).toLocaleDateString('tr-TR')}
                    </div>
                )}
                <input value={payAmount} onChange={(event) => {
                    const normalized = event.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                    setPayAmount(normalized.replace(/(\..*)\./g, '$1'));
                }} inputMode="decimal" placeholder="₺" aria-label="Tahsilat tutarı"
                    style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                {doctors.length > 0 && !plan.staffId && (
                    <select value={payStaffId || contextStaffId || ''} onChange={(event) => setPayStaffId(event.target.value)} aria-label="Taksit sorumlusu hekim"
                        style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}>
                        <option value="">Sorumlu hekim seçin…</option>
                        {doctors.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                )}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {PAY_METHODS.map((method) => (
                        <button key={method.key} type="button" onClick={() => setPayMethod(method.key)}
                            style={{ flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: payMethod === method.key ? '#0E0E0E' : T.surface2, color: payMethod === method.key ? '#F3EDE3' : T.muted, border: `1px solid ${T.border2}` }}>
                            {method.label}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => { setPayingId(null); setPayingInstallmentId(null); setPayStaffId(''); }}
                        style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Vazgeç
                    </button>
                    <button type="button" disabled={disabled} onClick={() => collectPayment(plan, remaining)}
                        style={{ flex: 2, padding: '8px', borderRadius: 10, border: 'none', background: disabled ? T.border2 : '#FF5A1F', color: '#0E0E0E', fontSize: 12, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                        {paying ? 'Kaydediliyor…' : 'Ödemeyi Kaydet'}
                    </button>
                </div>
            </div>
        );
    };

    // Kalan bakiye — aktif planların toplamı − plana bağlı ödemeler (denormalize
    // kolon yok; tek kaynak payments). Hastanın borcu bir bakışta görünsün.
    const totalRemaining = plans
        .filter((p) => p.status !== 'cancelled')
        .reduce((s, p) => s + Math.max(0, p.totalAmount - paidFor(p.id)), 0);
    const today = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    return (
        <div>
            {/* v5: kalan bakiye — büyük mono sayı, kırmızı; sıfırsa sakin */}
            {plans.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: totalRemaining > 0 ? '#C0392B' : T.muted, fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(totalRemaining)} ₺
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, marginTop: 3 }}>
                        {totalRemaining > 0 ? 'kalan bakiye' : 'bakiye yok — tüm ödemeler alındı'}
                    </div>
                </div>
            )}
            {plansLoading && (
                <div style={{ fontSize: 12.5, color: T.muted, textAlign: 'center', padding: '14px 0' }}>Tedavi planları yükleniyor…</div>
            )}
            {plans.length === 0 && !showNew && !plansLoading && (
                <div style={{ fontSize: 12.5, color: T.muted, textAlign: 'center', padding: '14px 0' }}>Aktif tedavi planı yok</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {plans.map((plan) => {
                    const paid = paidFor(plan.id);
                    const remaining = Math.max(0, plan.totalAmount - paid);
                    const pct = plan.totalAmount > 0 ? Math.min(100, Math.round((paid / plan.totalAmount) * 100)) : 0;
                    const financiallyPaid = remaining <= 0;
                    const clinicallyCompleted = plan.status === 'completed';
                    const planInstallments = installments
                        .filter((item) => item.treatmentPlanId === plan.id)
                        .sort((a, b) => a.sequenceNo - b.sequenceNo);
                    const hasSchedule = planInstallments.length > 0;
                    return (
                        <div key={plan.id} style={{ padding: '13px 14px', borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                                <div style={{ fontSize: 13, fontWeight: 750, color: T.ink, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.title}</div>
                                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: T.muted, flexShrink: 0 }}>%{pct}</span>
                            </div>
                            <div style={{ height: 6, background: T.border, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: '#FF5A1F', borderRadius: 999 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: T.ink }}>{fmt(paid)} ₺ / {fmt(plan.totalAmount)} ₺</span>
                                {financiallyPaid ? (
                                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2E8A35' }}>Ödendi</span>
                                ) : hasSchedule ? (
                                    <span style={{ fontSize: 11, fontWeight: 750, color: '#B8720A' }}>{planInstallments.length} vadeli</span>
                                ) : (
                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        {!readOnly && installmentEngineAvailable && !installmentsLoading && schedulePlanId !== plan.id && (
                                            <button type="button" onClick={() => openSchedule(plan.id)}
                                                style={{ fontSize: 11, fontWeight: 750, color: '#B8720A', border: `1px solid ${T.border2}`, background: 'none', padding: '6px 10px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                Taksit Planla
                                            </button>
                                        )}
                                        {canCollect && payingId !== plan.id && (
                                            <button type="button" onClick={() => openPay(plan, remaining)}
                                                style={{ fontSize: 11, fontWeight: 750, color: T.ink, border: `1px solid ${T.border2}`, background: 'none', padding: '6px 10px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                Ödeme Al
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 10.5, fontWeight: 750, color: clinicallyCompleted ? '#2E8A35' : plan.status === 'cancelled' ? '#C0392B' : T.muted }}>
                                    Klinik: {clinicallyCompleted ? 'Tamamlandı' : plan.status === 'cancelled' ? 'İptal' : 'Devam ediyor'}
                                </span>
                                {!readOnly && plan.status !== 'cancelled' && (
                                    <button
                                        type="button"
                                        disabled={clinicalUpdatingId === plan.id || staffLoading}
                                        onClick={() => changeClinicalStatus(plan)}
                                        style={{ padding: '6px 9px', borderRadius: 8, border: `1px solid ${T.border2}`, background: clinicallyCompleted ? 'none' : '#0E0E0E', color: clinicallyCompleted ? T.muted : '#F3EDE3', fontSize: 10.5, fontWeight: 800, cursor: clinicalUpdatingId === plan.id || staffLoading ? 'not-allowed' : 'pointer', opacity: clinicalUpdatingId === plan.id || staffLoading ? .6 : 1 }}
                                    >
                                        {clinicalUpdatingId === plan.id ? 'Güncelleniyor…' : clinicallyCompleted ? 'Planı yeniden aç' : 'Tedaviyi tamamla'}
                                    </button>
                                )}
                            </div>
                            {schedulePlanId === plan.id && !hasSchedule && (
                                <div style={{ marginTop: 10, padding: 10, borderRadius: 11, border: `1px solid ${T.border2}` }}>
                                    <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.45, marginBottom: 8 }}>{fmt(remaining)} ₺ kalan bakiye için vade oluşturulur.</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 7, marginBottom: 7 }}>
                                        <input value={scheduleCount} onChange={(event) => setScheduleCount(event.target.value.replace(/[^0-9]/g, '').slice(0, 2))} inputMode="numeric" aria-label="Taksit sayısı" placeholder="3"
                                            style={{ minWidth: 0, padding: '8px 9px', borderRadius: 9, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12, outline: 'none' }} />
                                        <input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} aria-label="İlk taksit vadesi"
                                            style={{ minWidth: 0, padding: '8px 9px', borderRadius: 9, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12, outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                        {([['monthly', 'Aylık'], ['weekly', 'Haftalık']] as const).map(([value, label]) => (
                                            <button key={value} type="button" onClick={() => setScheduleCadence(value)}
                                                style={{ flex: 1, padding: '7px', borderRadius: 9, border: `1px solid ${T.border2}`, background: scheduleCadence === value ? '#0E0E0E' : T.surface2, color: scheduleCadence === value ? '#F3EDE3' : T.muted, fontSize: 11, fontWeight: 750, cursor: 'pointer' }}>{label}</button>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button type="button" onClick={() => setSchedulePlanId(null)} style={{ flex: 1, padding: 8, borderRadius: 9, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Vazgeç</button>
                                        <button type="button" disabled={scheduling} onClick={() => saveSchedule(plan, remaining)} style={{ flex: 2, padding: 8, borderRadius: 9, border: 0, background: scheduling ? T.border2 : '#0E0E0E', color: '#F3EDE3', fontSize: 11.5, fontWeight: 800, cursor: scheduling ? 'not-allowed' : 'pointer' }}>{scheduling ? 'Oluşturuluyor…' : 'Vadeleri Oluştur'}</button>
                                    </div>
                                </div>
                            )}
                            {hasSchedule && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                                    {planInstallments.map((installment) => {
                                        const installmentPaid = paidForInstallment(installment.id);
                                        const installmentRemaining = Math.max(0, installment.amount - installmentPaid);
                                        const isPaid = installmentRemaining <= 0;
                                        const overdue = !isPaid && installment.dueDate < today;
                                        const partial = installmentPaid > 0 && !isPaid;
                                        return (
                                            <div key={installment.id} style={{ padding: '9px 10px', borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 9 }}>
                                                <div style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', background: isPaid ? 'rgba(46,138,53,.12)' : overdue ? 'rgba(192,57,43,.12)' : T.surface2, color: isPaid ? '#2E8A35' : overdue ? '#C0392B' : T.muted, fontSize: 10, fontWeight: 850 }}>{installment.sequenceNo}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 11.5, fontWeight: 750, color: T.ink }}>{fmt(installment.amount)} ₺ <span style={{ color: T.muted, fontWeight: 600 }}>· {new Date(`${installment.dueDate}T12:00:00`).toLocaleDateString('tr-TR')}</span></div>
                                                    <div style={{ marginTop: 2, fontSize: 10.5, color: isPaid ? '#2E8A35' : overdue ? '#C0392B' : T.muted }}>{isPaid ? 'Ödendi' : partial ? `${fmt(installmentPaid)} ₺ ödendi · ${fmt(installmentRemaining)} ₺ kaldı` : overdue ? 'Vadesi geçti' : 'Bekliyor'}</div>
                                                </div>
                                                {canCollect && !isPaid && payingId !== plan.id && (
                                                    <button type="button" onClick={() => openPay(plan, remaining, installment)} style={{ padding: '6px 9px', borderRadius: 8, border: `1px solid ${T.border2}`, background: 'none', color: T.ink, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>Öde</button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {renderPaymentForm(plan, remaining)}
                        </div>
                    );
                })}
            </div>

            {!readOnly && !plansLoading && (!showNew ? (
                <button type="button" onClick={() => {
                    setPlanStaffId(contextStaffId || (doctors.length === 1 ? doctors[0].id : ''));
                    setShowNew(true);
                }}
                    style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 10, border: `1px dashed ${T.border2}`, background: 'none', color: T.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    + Yeni Tedavi Planı
                </button>
            ) : (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 14, border: `1px solid ${T.border2}`, background: T.surface }}>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tedavi adı (örn. Kanal Tedavisi - 46)"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                    <input value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Toplam ücret (₺)"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                    {doctors.length > 0 && (
                        <select value={planStaffId || contextStaffId || ''} onChange={(e) => setPlanStaffId(e.target.value)} aria-label="Sorumlu hekim"
                            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}>
                            <option value="">Sorumlu hekim seçin…</option>
                            {contextStaffId && !doctors.some((member) => member.id === contextStaffId) && (
                                <option value={contextStaffId}>{appointmentContext?.staffName || 'Randevu hekimi'}</option>
                            )}
                            {doctors.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                    )}
                    {!staffLoading && doctors.length === 0 && !contextStaffId && (
                        <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(184,114,10,.10)', color: '#B8720A', fontSize: 11.5, fontWeight: 700 }}>
                            Plan oluşturmak için Personel ekranından hekim rolü tanımlayın.
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => { setShowNew(false); setTitle(''); setTotal(''); setPlanStaffId(''); }}
                            style={{ flex: 1, padding: '9px', borderRadius: 10, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Vazgeç
                        </button>
                        <button type="button" disabled={savingPlan || staffLoading || !(planStaffId || contextStaffId)} onClick={createPlan}
                            style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none', background: savingPlan || staffLoading || !(planStaffId || contextStaffId) ? T.border2 : '#0E0E0E', color: '#F3EDE3', fontSize: 12, fontWeight: 800, cursor: savingPlan || staffLoading || !(planStaffId || contextStaffId) ? 'not-allowed' : 'pointer' }}>
                            {savingPlan ? 'Kaydediliyor…' : 'Plan Oluştur'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
