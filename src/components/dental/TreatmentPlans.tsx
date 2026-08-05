import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { useInstallmentSchedules } from '@/hooks/useInstallmentSchedules';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import type { InstallmentCadence, PaymentMethod, TreatmentInstallment, TreatmentPlan } from '@/types';
import './treatmentPlans.css';

const PAY_METHODS: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];
const fmt = (n: number) => n.toLocaleString('tr-TR');
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_META: Record<TreatmentPlan['status'], { label: string; cls: string }> = {
    proposed: { label: 'Teklif', cls: 'offer' },
    active: { label: 'Aktif', cls: 'active' },
    completed: { label: 'Tamamlandı', cls: 'done' },
    cancelled: { label: 'İptal', cls: 'cancelled' },
};

interface TreatmentPlansProps {
    customerId: string;
    staffId?: string;
    reservationId?: string;
    encounterId?: string;
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

function TreatmentPlansForCustomer({ customerId, staffId, reservationId, encounterId, readOnly = false, canCollect = true }: TreatmentPlansProps) {
    const { dark } = useTheme();
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
    const doctorNameOf = (id?: string) => staff.find((member) => member.id === id)?.name;

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
            encounterId,
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
                encounterId: plan.encounterId || encounterId,
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

    const closePay = () => { setPayingId(null); setPayingInstallmentId(null); setPayStaffId(''); };

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
                encounterId: plan.encounterId || encounterId,
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
        if (p) closePay();
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

    // Kalan bakiye — aktif planların toplamı − plana bağlı ödemeler (denormalize
    // kolon yok; tek kaynak payments). Hastanın borcu bir bakışta görünsün.
    const totalRemaining = plans
        .filter((p) => p.status !== 'cancelled' && p.status !== 'proposed')
        .reduce((s, p) => s + Math.max(0, p.totalAmount - paidFor(p.id)), 0);
    const today = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();
    const activeCount = plans.filter((p) => p.status === 'active').length;
    const offerCount = plans.filter((p) => p.status === 'proposed').length;
    const lastPayment = payments.reduce<string | null>((latest, p) => (
        !latest || (p.paidAt || '') > latest ? (p.paidAt || latest) : latest
    ), null);

    // ── Kısmi tahsilat formu ──────────────────────────────────────────────────
    const renderPaymentForm = (plan: TreatmentPlan, remaining: number) => {
        const targetInstallment = payingInstallmentId
            ? installments.find((item) => item.id === payingInstallmentId)
            : undefined;
        const disabled = paying || staffLoading || !(plan.staffId || payStaffId || contextStaffId);
        const amountValue = Number(payAmount || '0') || 0;
        const installmentRemaining = targetInstallment
            ? Math.max(0, targetInstallment.amount - paidForInstallment(targetInstallment.id))
            : remaining;
        const cap = Math.min(remaining, installmentRemaining);
        const overCap = amountValue > cap;
        return (
            <div className="tp-form">
                {targetInstallment && (
                    <div className="tp-note-warn" style={{ color: 'var(--dc-blue)', background: 'var(--dc-blue-bg)' }}>
                        {targetInstallment.sequenceNo}. taksit · vade {fmtDate(targetInstallment.dueDate)}
                    </div>
                )}
                <div className="tp-field">
                    <label className="field-label" htmlFor={`tp-pay-${plan.id}`}>Tahsil edilecek tutar</label>
                    <div className="tp-input-wrap">
                        <input
                            id={`tp-pay-${plan.id}`}
                            value={payAmount}
                            inputMode="decimal"
                            aria-invalid={overCap}
                            onChange={(event) => {
                                const normalized = event.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                                setPayAmount(normalized.replace(/(\..*)\./g, '$1'));
                            }}
                        />
                        <span className="tp-input-suffix">₺</span>
                    </div>
                    {overCap && <p style={{ marginTop: 5, color: 'var(--dc-red2)', fontSize: 10, fontWeight: 700 }}>! En fazla {fmt(cap)} ₺ tahsil edilebilir.</p>}
                </div>
                {doctors.length > 0 && !plan.staffId && (
                    <div className="tp-field">
                        <label className="field-label" htmlFor={`tp-paydoc-${plan.id}`}>Sorumlu hekim</label>
                        <select id={`tp-paydoc-${plan.id}`} value={payStaffId || contextStaffId || ''} onChange={(event) => setPayStaffId(event.target.value)}>
                            <option value="">Hekim seçin…</option>
                            {doctors.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                    </div>
                )}
                <div className="tp-field">
                    <span className="field-label">Ödeme yöntemi</span>
                    <div className="tp-segmented" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        {PAY_METHODS.map((method) => (
                            <button key={method.key} type="button" className={cn(payMethod === method.key && 'is-on')} onClick={() => setPayMethod(method.key)}>
                                {method.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="tp-form-actions">
                    <button type="button" className="tp-button secondary" onClick={closePay}>Vazgeç</button>
                    <button type="button" className="tp-button primary" disabled={disabled} onClick={() => collectPayment(plan, remaining)}>
                        {paying ? 'Kaydediliyor…' : 'Tahsilatı Kaydet'}
                    </button>
                </div>
            </div>
        );
    };

    // ── Taksit planlama formu ─────────────────────────────────────────────────
    const renderScheduleForm = (plan: TreatmentPlan, remaining: number) => (
        <div className="tp-form">
            <div className="tp-note-warn" style={{ color: 'var(--dc-muted)', background: 'transparent', padding: '0 0 9px', fontWeight: 600 }}>
                {fmt(remaining)} ₺ kalan bakiye için vade oluşturulur.
            </div>
            <div className="tp-field-row">
                <div className="tp-field">
                    <label className="field-label" htmlFor={`tp-count-${plan.id}`}>Taksit sayısı (2–24)</label>
                    <input id={`tp-count-${plan.id}`} value={scheduleCount} inputMode="numeric"
                        onChange={(event) => setScheduleCount(event.target.value.replace(/[^0-9]/g, '').slice(0, 2))} />
                </div>
                <div className="tp-field">
                    <label className="field-label" htmlFor={`tp-due-${plan.id}`}>İlk vade tarihi</label>
                    <input id={`tp-due-${plan.id}`} type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} />
                </div>
            </div>
            <div className="tp-field">
                <span className="field-label">Ödeme sıklığı</span>
                <div className="tp-segmented two">
                    {([['monthly', 'Aylık'], ['weekly', 'Haftalık']] as const).map(([value, label]) => (
                        <button key={value} type="button" className={cn(scheduleCadence === value && 'is-on')} onClick={() => setScheduleCadence(value)}>{label}</button>
                    ))}
                </div>
            </div>
            <div className="tp-form-actions">
                <button type="button" className="tp-button secondary" onClick={() => setSchedulePlanId(null)}>Vazgeç</button>
                <button type="button" className="tp-button primary" disabled={scheduling} onClick={() => saveSchedule(plan, remaining)}>
                    {scheduling ? 'Oluşturuluyor…' : 'Planı Oluştur'}
                </button>
            </div>
        </div>
    );

    return (
        <div className={cn('tp-root dash-theme', dark && 'dark')}>
            {plans.length > 0 && (
                <section className="tp-balance" aria-label="Toplam kalan bakiye">
                    <div className="eyebrow">Toplam kalan bakiye</div>
                    <strong className="tp-balance-amount">{fmt(totalRemaining)} ₺</strong>
                    <div className="tp-balance-foot">
                        <span>{lastPayment ? `Son tahsilat: ${new Date(lastPayment).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}` : 'Henüz tahsilat yok'}</span>
                        <span className="mono">{activeCount} aktif{offerCount > 0 ? ` · ${offerCount} teklif` : ''}</span>
                    </div>
                </section>
            )}

            {plans.length > 0 && (
                <div className="tp-section-heading">
                    <h2>Tedavi planları</h2>
                    <span className="tp-count-pill">{plans.length} plan</span>
                </div>
            )}

            {plansLoading && (
                <div className="tp-skeleton-card" role="status" aria-live="polite" aria-label="Tedavi planları yükleniyor">
                    <div className="tp-skeleton-row"><span className="tp-skeleton title" /><span className="tp-skeleton badge" /></div>
                    <span className="tp-skeleton line" />
                    <span className="tp-skeleton progress" />
                    <span className="tp-skeleton short" />
                </div>
            )}

            {plans.length === 0 && !showNew && !plansLoading && (
                <div className="tp-empty">
                    <div className="tp-empty-icon" aria-hidden="true">＋</div>
                    <h3>Aktif tedavi planı yok</h3>
                    <p>Hasta için ilk tedavi planını ekleyerek ödeme ve seans takibini başlatın.</p>
                </div>
            )}

            <div className="tp-list">
                {plans.map((plan) => {
                    const paid = paidFor(plan.id);
                    const remaining = Math.max(0, plan.totalAmount - paid);
                    const pct = plan.totalAmount > 0 ? Math.min(100, Math.round((paid / plan.totalAmount) * 100)) : 0;
                    const financiallyPaid = remaining <= 0;
                    const clinicallyCompleted = plan.status === 'completed';
                    const cancelled = plan.status === 'cancelled';
                    const proposed = plan.status === 'proposed';
                    const planInstallments = installments
                        .filter((item) => item.treatmentPlanId === plan.id)
                        .sort((a, b) => a.sequenceNo - b.sequenceNo);
                    const hasSchedule = planInstallments.length > 0;
                    const meta = STATUS_META[plan.status];
                    const doctorName = doctorNameOf(plan.staffId);
                    const busy = clinicalUpdatingId === plan.id;
                    const payOpen = payingId === plan.id;
                    const scheduleOpen = schedulePlanId === plan.id && !hasSchedule;
                    const canPlanSchedule = !readOnly && !proposed && !cancelled && !financiallyPaid
                        && installmentEngineAvailable && !installmentsLoading && !hasSchedule;
                    const canPayNow = canCollect && !proposed && !cancelled && !financiallyPaid;

                    return (
                        <article key={plan.id} className={cn('tp-card', plan.status === 'active' && 'is-active', cancelled && 'is-cancelled')}>
                            <div className="tp-card-head">
                                <div style={{ minWidth: 0 }}>
                                    <h3>{plan.title}</h3>
                                    <p className="tp-doctor">{doctorName ? `Sorumlu hekim · ${doctorName}` : 'Sorumlu hekim atanmadı'}</p>
                                </div>
                                <span className={cn('tp-status', meta.cls)}>{meta.label}</span>
                            </div>

                            <div className="tp-progress">
                                <div className="tp-progress-meta">
                                    <span>Ödenen / toplam</span>
                                    <span className="money">{fmt(paid)} ₺ / {fmt(plan.totalAmount)} ₺</span>
                                </div>
                                <div className="tp-progress-track" role="progressbar" aria-label={`${plan.title} ödeme ilerlemesi`}
                                    aria-valuemin={0} aria-valuemax={plan.totalAmount} aria-valuenow={paid}>
                                    <div className={cn('tp-progress-bar', financiallyPaid && 'is-green', cancelled && 'is-muted')} style={{ width: `${pct}%` }} />
                                </div>
                            </div>

                            {(plan.sessionCount > 1 || hasSchedule) && (
                                <div className="tp-details-row">
                                    {plan.sessionCount > 1
                                        ? <span className="tp-session-pill">Seans {plan.sessionsDone}/{plan.sessionCount}</span>
                                        : <span />}
                                    {hasSchedule && <span className="tp-schedule-pill">{planInstallments.length} vadeli</span>}
                                </div>
                            )}

                            {/* Klinik durum: teklif onayı ayrı bir aksiyon, diğerlerinde anahtar */}
                            {proposed ? (
                                <div className="tp-switch-row" style={{ borderTop: '1px solid var(--dc-border)' }}>
                                    <span className="tp-switch-copy">
                                        <strong>Teklif · onay bekliyor</strong>
                                        <small>Hasta onaylayınca tedavi aktifleşir</small>
                                    </span>
                                    {!readOnly && (
                                        <button type="button" className="tp-approve" disabled={busy}
                                            onClick={async () => {
                                                setClinicalUpdatingId(plan.id);
                                                const ok = await setPlanStatus(plan.id, 'active');
                                                setClinicalUpdatingId(null);
                                                if (ok) toast.success('Teklif onaylandı — tedavi aktif');
                                            }}>
                                            {busy ? 'Onaylanıyor…' : 'Teklifi Onayla'}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <button type="button" className="tp-switch-row" disabled={readOnly || cancelled || busy || staffLoading}
                                    aria-pressed={clinicallyCompleted}
                                    onClick={() => changeClinicalStatus(plan)}>
                                    <span className="tp-switch-copy">
                                        <strong>Klinik: {clinicallyCompleted ? 'Tamamlandı' : cancelled ? 'İptal' : 'Devam ediyor'}</strong>
                                        <small>{busy ? 'Güncelleniyor…' : cancelled ? 'İptal edilen planda düzenlenemez' : clinicallyCompleted ? 'Planı yeniden açmak için dokunun' : 'Tüm klinik işlemler bittiğinde işaretleyin'}</small>
                                    </span>
                                    <span className={cn('tp-switch', clinicallyCompleted && 'is-on')} aria-hidden="true" />
                                </button>
                            )}

                            {hasSchedule && (
                                <div className="tp-installments" role="table" aria-label={`${plan.title} taksitleri`}>
                                    <div className="tp-inst-head" role="row">
                                        <span role="columnheader">No</span>
                                        <span role="columnheader">Tutar</span>
                                        <span role="columnheader">Vade</span>
                                        <span role="columnheader">Durum</span>
                                    </div>
                                    {planInstallments.map((installment) => {
                                        const installmentPaid = paidForInstallment(installment.id);
                                        const installmentRemaining = Math.max(0, installment.amount - installmentPaid);
                                        const isPaid = installmentRemaining <= 0;
                                        const overdue = !isPaid && installment.dueDate < today;
                                        const partial = installmentPaid > 0 && !isPaid;
                                        return (
                                            <div key={installment.id} className="tp-inst-row" role="row">
                                                <span className="number mono" role="cell">{installment.sequenceNo}</span>
                                                <strong className="money" role="cell">{fmt(installment.amount)} ₺</strong>
                                                <span className="due mono" role="cell">{fmtDate(installment.dueDate)}</span>
                                                <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                                                    <span className={cn('tp-inst-status', isPaid ? 'paid' : partial ? 'partial' : overdue ? 'overdue' : 'waiting')}>
                                                        {isPaid ? 'Ödendi' : partial ? `${fmt(installmentRemaining)} ₺ kaldı` : overdue ? 'Gecikti' : 'Bekliyor'}
                                                    </span>
                                                    {canCollect && !isPaid && !payOpen && !cancelled && (
                                                        <button type="button" className="tp-inst-pay" onClick={() => openPay(plan, remaining, installment)}>Öde</button>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {financiallyPaid && !cancelled && plan.totalAmount > 0 && (
                                <div className="tp-note-paid"><span className="mono">0 ₺</span> bakiye yok — tüm ödemeler alındı</div>
                            )}

                            {cancelled && <p className="tp-note-locked">Plan iptal edildiği için tahsilat ve taksit aksiyonları kapalı.</p>}

                            {(canPayNow || canPlanSchedule) && (
                                <div className="tp-actions">
                                    {canPayNow && (
                                        <div className={cn('tp-disclosure', payOpen && 'is-open')}>
                                            <button type="button" className="tp-disclosure-title" aria-expanded={payOpen}
                                                onClick={() => (payOpen ? closePay() : openPay(plan, remaining))}>
                                                Kısmi Tahsilat
                                            </button>
                                            {payOpen && renderPaymentForm(plan, remaining)}
                                        </div>
                                    )}
                                    {canPlanSchedule && (
                                        <div className={cn('tp-disclosure', scheduleOpen && 'is-open')}>
                                            <button type="button" className="tp-disclosure-title" aria-expanded={scheduleOpen}
                                                onClick={() => (scheduleOpen ? setSchedulePlanId(null) : openSchedule(plan.id))}>
                                                Taksit Planla
                                            </button>
                                            {scheduleOpen && renderScheduleForm(plan, remaining)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            {!readOnly && !plansLoading && (
                <div className="tp-new">
                    {!showNew ? (
                        <button type="button" className="tp-new-summary" onClick={() => {
                            setPlanStaffId(contextStaffId || (doctors.length === 1 ? doctors[0].id : ''));
                            setShowNew(true);
                        }}>
                            + Yeni Tedavi Planı
                        </button>
                    ) : (
                        <div className="tp-new-form">
                            <h3>Yeni plan bilgileri</h3>
                            {!staffLoading && doctors.length === 0 && !contextStaffId && (
                                <div className="tp-note-warn">Plan oluşturmak için Personel ekranından hekim rolü tanımlayın.</div>
                            )}
                            <div className="tp-field">
                                <label className="field-label" htmlFor="tp-new-title">Tedavi planı adı</label>
                                <input id="tp-new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. 46 Kanal tedavisi" autoComplete="off" />
                            </div>
                            <div className="tp-field">
                                <label className="field-label" htmlFor="tp-new-total">Toplam tutar</label>
                                <div className="tp-input-wrap">
                                    <input id="tp-new-total" value={total} inputMode="numeric" placeholder="0"
                                        onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ''))} />
                                    <span className="tp-input-suffix">₺</span>
                                </div>
                            </div>
                            {doctors.length > 0 && (
                                <div className="tp-field">
                                    <label className="field-label" htmlFor="tp-new-doctor">Sorumlu hekim</label>
                                    <select id="tp-new-doctor" value={planStaffId || contextStaffId || ''} onChange={(e) => setPlanStaffId(e.target.value)}>
                                        <option value="">Hekim seçin…</option>
                                        {contextStaffId && !doctors.some((member) => member.id === contextStaffId) && (
                                            <option value={contextStaffId}>{appointmentContext?.staffName || 'Randevu hekimi'}</option>
                                        )}
                                        {doctors.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="tp-form-actions">
                                <button type="button" className="tp-button secondary" onClick={() => { setShowNew(false); setTitle(''); setTotal(''); setPlanStaffId(''); }}>
                                    Vazgeç
                                </button>
                                <button type="button" className="tp-button orange" onClick={createPlan}
                                    disabled={savingPlan || staffLoading || !(planStaffId || contextStaffId)}>
                                    {savingPlan ? 'Kaydediliyor…' : 'Planı Kaydet'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
