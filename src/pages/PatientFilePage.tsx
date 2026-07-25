import { useEffect, useMemo, useState } from 'react';
import { normalizePhone } from '@/lib/phone';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, ChevronRight, Clock3, CreditCard, FileText, LoaderCircle, MessageCircle, Plus, RotateCcw, Stethoscope } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useDentalChart } from '@/hooks/useDentalChart';
import { useInstallmentSchedules } from '@/hooks/useInstallmentSchedules';
import { useLabels } from '@/hooks/useLabels';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO } from '@/utils/date';
import type { Customer, PatientEncounterStatus, PatientEncounterVisitType } from '@/types';

// v7 Hasta Dosyası — dişçinin dashboard'dan sonra en çok açtığı ekran: kimlik +
// medikal uyarılar + kalan bakiye + ziyaret bazlı tedavi geçmişi + finans + recall.
// Veri: patient_encounters/clinical_procedures (062); şema yoksa randevulardan
// geriye uyumlu bir zaman çizelgesi kurulur.

const VISIT_TYPE_LABEL: Record<PatientEncounterVisitType, string> = {
    examination: 'Muayene', treatment: 'Tedavi', control: 'Kontrol',
    emergency: 'Acil', consultation: 'Konsültasyon', other: 'Ziyaret',
};
const VISIT_DOT: Record<PatientEncounterVisitType, string> = {
    examination: 'var(--dc-blue)', treatment: 'var(--dc-orange)', control: 'var(--dc-green)',
    emergency: 'var(--dc-red2)', consultation: 'var(--dc-blue)', other: 'var(--dc-muted2)',
};
const ENC_STATUS: Record<PatientEncounterStatus, { label: string; cls: string }> = {
    scheduled: { label: 'Planlandı', cls: 'bg-[var(--dc-blue-bg)] text-[var(--dc-blue)]' },
    checked_in: { label: 'Klinikte', cls: 'bg-[var(--dc-surface3)] text-[var(--dc-ink)]' },
    in_progress: { label: 'Devam ediyor', cls: 'bg-[var(--dc-orange-soft)] text-[var(--dc-orange)]' },
    completed: { label: 'Tamamlandı', cls: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]' },
    cancelled: { label: 'İptal', cls: 'bg-[var(--dc-surface2)] text-[var(--dc-muted)]' },
};
const MONTHS_TR = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
const ODONTO_TOP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ODONTO_BOT = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const STATUS_TO_COLOR: Record<string, string> = {
    curuk: 'var(--dc-red2)', dolgu: 'var(--dc-blue)', kanal: 'var(--dc-amber)', kron: 'var(--dc-green)',
    implant: 'var(--dc-green)', cekildi: 'var(--dc-muted2)',
};

interface TimelineEntry {
    key: string;
    dateISO: string;
    visitType: PatientEncounterVisitType;
    status: PatientEncounterStatus;
    doctorName?: string;
    procs: { tooth?: number; title: string }[];
    diagnosis?: string;
    amount: number;
    reservationId?: string;
}

interface EncounterRow {
    id: string; reservation_id?: string | null; attending_staff_id?: string | null;
    visit_type: PatientEncounterVisitType; status: PatientEncounterStatus;
    chief_complaint?: string | null; diagnosis?: string | null; clinical_notes?: string | null;
    created_at: string;
}
interface ProcedureRow { encounter_id?: string | null; title: string; tooth_number?: number | null; status: string }

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || error.code === 'PGRST205'
        || `${error.message || ''}`.toLowerCase().includes('does not exist');
}

function dateParts(iso: string) {
    const d = new Date(iso);
    return { d: String(d.getDate()).padStart(2, '0'), m: MONTHS_TR[d.getMonth()], y: String(d.getFullYear()) };
}

const fmtTL = (n: number) => `₺${n.toLocaleString('tr-TR')}`;

function waLinkTR(phone: string, text: string) {
    return `https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

function Card({ icon, title, sub, right, children }: { icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--dc-border)]">
                <div className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] flex-shrink-0">{icon}</div>
                <div className="min-w-0"><div className="text-[14px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">{title}</div>{sub && <div className="text-[11.5px] text-[var(--dc-muted)] mt-px">{sub}</div>}</div>
                {right && <div className="ml-auto flex-shrink-0">{right}</div>}
            </div>
            {children}
        </section>
    );
}

export function PatientFilePage() {
    const navigate = useNavigate();
    const { customerId = '' } = useParams<{ customerId: string }>();
    const { dark } = useTheme();
    const { orgId } = useAuth();
    const { sector, isLoading: labelsLoading } = useLabels();
    const { allCustomers, isLoading: customersLoading, fetchCustomerById } = useCustomers();
    const { reservations } = useReservations();
    const { staff } = useStaff();
    const { plans } = useTreatmentPlans(customerId || undefined);
    const planIds = useMemo(() => plans.map((p) => p.id), [plans]);
    const { payments } = usePayments({ treatmentPlanIds: planIds });
    const { installments } = useInstallmentSchedules(planIds);
    const { current: dentalCurrent } = useDentalChart(customerId || undefined);

    const [lookup, setLookup] = useState<{ id: string; done: boolean; value: Customer | null }>({ id: '', done: false, value: null });
    const listed = allCustomers.find((c) => c.id === customerId);
    const customer = listed || (lookup.id === customerId ? lookup.value : null);
    useEffect(() => {
        if (!customerId || listed) return;
        let alive = true;
        const t = window.setTimeout(() => {
            setLookup({ id: customerId, done: false, value: null });
            void fetchCustomerById(customerId).then((v) => { if (alive) setLookup({ id: customerId, done: true, value: v }); });
        }, 0);
        return () => { alive = false; window.clearTimeout(t); };
    }, [customerId, fetchCustomerById, listed]);

    // Ziyaret geçmişi — encounters + klinik işlemler (062 yoksa randevu fallback'i)
    const [history, setHistory] = useState<{ key: string; encounters: EncounterRow[]; procs: ProcedureRow[]; available: boolean | null }>({ key: '', encounters: [], procs: [], available: null });
    useEffect(() => {
        if (!orgId || !customerId) return;
        const key = `${orgId}:${customerId}`;
        let alive = true;
        const t = window.setTimeout(async () => {
            const enc = await supabase.from('patient_encounters').select('*')
                .eq('organization_id', orgId).eq('customer_id', customerId)
                .order('created_at', { ascending: false }).limit(50);
            if (!alive) return;
            if (enc.error) {
                if (!isMissingSchema(enc.error)) console.error(enc.error);
                setHistory({ key, encounters: [], procs: [], available: false });
                return;
            }
            const rows = (enc.data || []) as EncounterRow[];
            let procs: ProcedureRow[] = [];
            if (rows.length > 0) {
                const pr = await supabase.from('clinical_procedures')
                    .select('encounter_id, title, tooth_number, status')
                    .eq('organization_id', orgId).eq('customer_id', customerId).limit(400);
                if (!pr.error) procs = (pr.data || []) as ProcedureRow[];
            }
            if (alive) setHistory({ key, encounters: rows, procs, available: true });
        }, 0);
        return () => { alive = false; window.clearTimeout(t); };
    }, [orgId, customerId]);

    const staffName = (id?: string | null) => (id ? staff.find((s) => s.id === id)?.name : undefined);
    const customerReservations = useMemo(
        () => reservations.filter((r) => r.customerId === customerId)
            .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)),
        [reservations, customerId],
    );

    const timeline = useMemo<TimelineEntry[]>(() => {
        if (history.available && history.encounters.length > 0) {
            const procsByEnc = new Map<string, ProcedureRow[]>();
            for (const p of history.procs) {
                if (!p.encounter_id || p.status === 'cancelled') continue;
                const arr = procsByEnc.get(p.encounter_id) || [];
                arr.push(p); procsByEnc.set(p.encounter_id, arr);
            }
            return history.encounters.map((e) => ({
                key: e.id, dateISO: e.created_at, visitType: e.visit_type, status: e.status,
                doctorName: staffName(e.attending_staff_id),
                procs: (procsByEnc.get(e.id) || []).slice(0, 4).map((p) => ({ tooth: p.tooth_number ?? undefined, title: p.title })),
                diagnosis: e.diagnosis || e.chief_complaint || e.clinical_notes || undefined,
                amount: plans.filter((pl) => pl.encounterId === e.id && pl.status !== 'cancelled').reduce((s, pl) => s + pl.totalAmount, 0),
                reservationId: e.reservation_id ?? undefined,
            }));
        }
        // Fallback: randevulardan kronoloji (062 uygulanmamış ortam)
        return customerReservations.filter((r) => r.status !== 'pending').map((r) => ({
            key: r.id, dateISO: `${r.date}T${r.startTime}:00`,
            visitType: (r.service.toLocaleLowerCase('tr-TR').includes('kontrol') ? 'control'
                : r.service.toLocaleLowerCase('tr-TR').includes('muayene') ? 'examination' : 'treatment') as PatientEncounterVisitType,
            status: (r.status === 'cancelled' ? 'cancelled' : r.status === 'completed' ? 'completed' : r.arrivedAt ? 'in_progress' : 'scheduled') as PatientEncounterStatus,
            doctorName: r.staffName,
            procs: [{ title: r.service }], diagnosis: undefined,
            amount: plans.filter((pl) => pl.reservationId === r.id && pl.status !== 'cancelled').reduce((s, pl) => s + pl.totalAmount, 0),
            reservationId: r.id,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, customerReservations, plans, staff]);

    // Finans — DentalVisitPage ile aynı hesap (tek kaynak: planlar + ödemeler)
    const financial = useMemo(() => {
        // 'proposed' onaylanmamış teklif — bakiyeye yazılmaz — 063
        const active = plans.filter((p) => p.status !== 'cancelled' && p.status !== 'proposed');
        const total = active.reduce((s, p) => s + p.totalAmount, 0);
        const ids = new Set(active.map((p) => p.id));
        const rel = payments.filter((p) => p.treatmentPlanId && ids.has(p.treatmentPlanId));
        const paid = rel.reduce((s, p) => s + p.amount, 0);
        const paidByInst = new Map<string, number>();
        for (const p of rel) if (p.installmentId) paidByInst.set(p.installmentId, (paidByInst.get(p.installmentId) || 0) + p.amount);
        const open = installments.filter((i) => ids.has(i.treatmentPlanId) && (paidByInst.get(i.id) || 0) < i.amount)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const next = open[0];
        const paidForPlan = (planId: string) => payments.filter((p) => p.treatmentPlanId === planId).reduce((s, p) => s + p.amount, 0);
        return { total, paid, balance: Math.max(0, total - paid), next, paidForPlan };
    }, [plans, payments, installments]);

    const cf = customer?.customFields || {};
    const medical = [cf.alerji ? `Alerji: ${cf.alerji}` : null, cf.ilaclar ? `İlaç: ${cf.ilaclar}` : null, cf.kronik ? `Kronik: ${cf.kronik}` : null].filter(Boolean) as string[];
    const latestOpenReservation = customerReservations.find((r) => r.status !== 'cancelled');
    const doctorName = staffName(latestOpenReservation?.staffId) || latestOpenReservation?.staffName;
    const futureAppts = customerReservations.filter((r) => r.date >= todayISO() && r.status !== 'cancelled' && r.status !== 'completed');

    if (labelsLoading || (!customer && (customersLoading || lookup.id !== customerId || !lookup.done))) {
        return <div className={cn('dash-theme flex min-h-full flex-1 items-center justify-center bg-[var(--dc-page)] text-[var(--dc-muted)]', dark && 'dark')}><LoaderCircle className="animate-spin" size={24} /></div>;
    }
    if (sector !== 'dis') return <Navigate to="/customers" replace />;
    if (!customer) {
        return (
            <div className={cn('dash-theme flex min-h-full flex-1 items-center justify-center bg-[var(--dc-page)] p-6', dark && 'dark')}>
                <div className="text-center">
                    <div className="text-[15px] font-extrabold text-[var(--dc-ink)]">Hasta bulunamadı</div>
                    <button onClick={() => navigate('/customers')} className="mt-4 h-11 rounded-full bg-[var(--dc-inkbox)] px-5 text-[12px] font-extrabold text-[var(--dc-inkbox-fg)]">Hastalara dön</button>
                </div>
            </div>
        );
    }

    const initials = customer.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

    return (
        <div className={cn('dash-theme min-h-full flex-1 overflow-y-auto bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="mx-auto w-full max-w-[1280px] px-4 py-5 flex flex-col gap-4">

                {/* ═══ Kimlik şeridi ═══ */}
                <section className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)]">
                    <div className="flex flex-wrap gap-6 items-start px-[22px] pt-5 pb-0">
                        <div className="flex gap-4 min-w-[280px] flex-1">
                            <div className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[var(--dc-inkbox)] text-[21px] font-extrabold text-[var(--dc-inkbox-fg)] flex-shrink-0">{initials}</div>
                            <div className="min-w-0">
                                <div className="text-[21px] font-extrabold tracking-[-0.025em] leading-[1.15] text-[var(--dc-ink)]">{customer.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-semibold text-[var(--dc-muted)]">
                                    <span className="font-mono text-[12px]">{customer.phone || '—'}</span>
                                    {customer.lastVisit && <><span className="w-[3px] h-[3px] rounded-full bg-[var(--dc-muted2)]" /><span>Son ziyaret: <b className="font-mono text-[var(--dc-ink)]">{customer.lastVisit}</b></span></>}
                                </div>
                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    {medical.length === 0
                                        ? <span className="text-[11.5px] text-[var(--dc-muted2)] font-semibold">Medikal uyarı yok</span>
                                        : medical.map((m) => (
                                            <span key={m} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dc-red2)]/25 bg-[var(--dc-red-bg)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--dc-red2)]"><AlertTriangle size={12} />{m}</span>
                                        ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-start gap-5">
                            <div className="min-w-[96px]"><div className="text-[11px] font-bold uppercase tracking-[.05em] text-[var(--dc-muted)]">Kalan bakiye</div>
                                <div className={cn('font-mono text-[26px] font-black tracking-[-0.03em] leading-[1.1]', financial.balance > 0 ? 'text-[var(--dc-red2)]' : 'text-[var(--dc-green)]')}>{fmtTL(financial.balance)}</div></div>
                            <div className="w-px self-stretch bg-[var(--dc-border)]" />
                            <div className="min-w-[96px]"><div className="text-[11px] font-bold uppercase tracking-[.05em] text-[var(--dc-muted)]">Hekim</div>
                                <div className="text-[14px] font-bold text-[var(--dc-ink)] mt-0.5">{doctorName || '—'}</div></div>
                            <div className="w-px self-stretch bg-[var(--dc-border)]" />
                            <div className="min-w-[96px]"><div className="text-[11px] font-bold uppercase tracking-[.05em] text-[var(--dc-muted)]">Kontrol</div>
                                <div className="mt-1">{customer.recallDate
                                    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dc-green-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--dc-green)]"><span className="w-[5px] h-[5px] rounded-full bg-current" />{customer.recallDate}</span>
                                    : <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dc-surface2)] px-2.5 py-1 text-[11px] font-bold text-[var(--dc-muted)]">Planlanmadı</span>}</div></div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 px-[22px] py-4">
                        <button onClick={() => navigate('/calendar?new=1')} className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--dc-orange)] px-5 text-[13px] font-bold text-white transition-all hover:brightness-95"><Plus size={14} />Yeni Randevu</button>
                        {latestOpenReservation && (
                            <button onClick={() => navigate(`/dental-visit/${encodeURIComponent(latestOpenReservation.id)}`)} className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--dc-border2)] px-4 text-[12.5px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors"><Stethoscope size={14} />Ziyareti Aç</button>
                        )}
                        <button onClick={() => navigate(`/dental-chart?patient=${customer.id}`)} className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--dc-border2)] px-4 text-[12.5px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">Tam Diş Şeması</button>
                        <button onClick={() => navigate('/customers')} className="ml-auto inline-flex h-12 items-center gap-2 rounded-full px-4 text-[12.5px] font-bold text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)] hover:text-[var(--dc-ink)] transition-colors"><ArrowLeft size={14} />Hastalar</button>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 items-start">
                    {/* ═══ Sol kolon ═══ */}
                    <div className="flex flex-col gap-4 min-w-0">
                        <Card icon={<Clock3 size={16} />} title="Tedavi Geçmişi" sub="Ziyaret bazlı kronoloji · en yeni üstte · satıra tıklayınca ziyaret detayı açılır"
                            right={<span className="rounded-full bg-[var(--dc-surface2)] px-2.5 py-1 text-[11px] font-bold text-[var(--dc-muted)]">{timeline.length} ziyaret</span>}>
                            {timeline.length === 0 ? (
                                <div className="p-8 text-center text-[12px] text-[var(--dc-muted2)]">Henüz tedavi kaydı yok — ilk ziyareti randevudan açın.</div>
                            ) : (
                                <div className="py-1.5">
                                    {timeline.map((t) => {
                                        const dp = dateParts(t.dateISO);
                                        const st = ENC_STATUS[t.status];
                                        return (
                                            <button key={t.key} disabled={!t.reservationId}
                                                onClick={() => t.reservationId && navigate(`/dental-visit/${encodeURIComponent(t.reservationId)}`)}
                                                className="group flex w-full gap-4 border-b border-[var(--dc-border)] px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-[var(--dc-surface2)] disabled:cursor-default">
                                                <div className="w-[52px] flex-shrink-0 text-center pt-0.5">
                                                    <div className="font-mono text-[17px] font-extrabold text-[var(--dc-ink)] leading-[1.1]">{dp.d}</div>
                                                    <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-[var(--dc-muted)]">{dp.m}</div>
                                                    <div className="font-mono text-[10.5px] text-[var(--dc-muted2)]">{dp.y}</div>
                                                </div>
                                                <div className="relative w-[2px] flex-shrink-0 rounded bg-[var(--dc-surface3)] my-0.5">
                                                    <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-[var(--dc-surface)]" style={{ background: VISIT_DOT[t.visitType] }} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-[14px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">{VISIT_TYPE_LABEL[t.visitType]}</span>
                                                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold', st.cls)}><span className="w-[5px] h-[5px] rounded-full bg-current" />{st.label}</span>
                                                        {t.doctorName && <span className="text-[12px] font-semibold text-[var(--dc-muted)]">{t.doctorName}</span>}
                                                    </div>
                                                    {t.procs.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {t.procs.map((p, i) => (
                                                                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dc-border)] bg-[var(--dc-surface2)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--dc-ink)]">
                                                                    {p.tooth && <span className="font-mono text-[11px] text-[var(--dc-orange)]">{p.tooth}</span>}{p.title}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {t.diagnosis && <p className="mt-2 max-w-[560px] text-[12.5px] leading-[1.5] text-[var(--dc-muted)] line-clamp-2">{t.diagnosis}</p>}
                                                </div>
                                                <div className="flex flex-shrink-0 flex-col items-end gap-1.5 pt-0.5">
                                                    <span className="font-mono text-[14px] font-bold text-[var(--dc-ink)]">{t.amount > 0 ? fmtTL(t.amount) : '—'}</span>
                                                    {t.reservationId && <ChevronRight size={15} className="mt-auto text-[var(--dc-muted2)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--dc-ink)]" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>

                        <Card icon={<Stethoscope size={16} />} title="Diş Şeması Özeti" sub="Güncel durum"
                            right={<button onClick={() => navigate(`/dental-chart?patient=${customer.id}`)} className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--dc-border2)] px-3.5 text-[12px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">Tam şemayı aç <ChevronRight size={12} /></button>}>
                            <div className="flex flex-col items-center gap-1.5 px-3 pt-4 pb-2 overflow-x-auto">
                                {[ODONTO_TOP, ODONTO_BOT].map((row, ri) => (
                                    <div key={ri} className="flex gap-[3px]">
                                        {row.map((n, idx) => {
                                            const rec = dentalCurrent.get(n);
                                            const color = rec && rec.status !== 'saglam' ? STATUS_TO_COLOR[rec.status] : undefined;
                                            return (
                                                <div key={n} className="flex">
                                                    {idx === 8 && <span className="w-3" />}
                                                    <div className="flex w-[31px] min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border border-[var(--dc-border)] bg-[var(--dc-surface2)] py-1" aria-label={`Diş ${n}`}>
                                                        {ri === 0 && <span className="font-mono text-[9.5px] font-bold text-[var(--dc-muted)]">{n}</span>}
                                                        <span className="h-3 w-3 rounded-[3.5px]" style={{ background: color || 'var(--dc-surface3)' }} />
                                                        {ri === 1 && <span className="font-mono text-[9.5px] font-bold text-[var(--dc-muted)]">{n}</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1 px-3 pb-4 pt-1.5">
                                {[['Çürük', 'var(--dc-red2)'], ['Dolgu', 'var(--dc-blue)'], ['Kanal', 'var(--dc-amber)'], ['Kron/İmplant', 'var(--dc-green)'], ['Çekilmiş', 'var(--dc-muted2)']].map(([l, c]) => (
                                    <span key={l} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--dc-muted)]"><i className="h-[9px] w-[9px] rounded-[2px]" style={{ background: c }} />{l}</span>
                                ))}
                            </div>
                        </Card>

                        <Card icon={<FileText size={16} />} title="Belgeler & Röntgen" sub="Panoramik, periapikal ve onam formları"
                            right={<span className="rounded-full bg-[var(--dc-surface2)] px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[.05em] text-[var(--dc-muted)]">Yakında</span>}>
                            <div className="m-5 flex flex-col items-center gap-2 rounded-[11px] border-[1.5px] border-dashed border-[var(--dc-border2)] px-5 py-6 text-center text-[var(--dc-muted2)]">
                                <FileText size={24} />
                                <div className="text-[12.5px] font-semibold text-[var(--dc-muted)]">Belge yükleme bu sürümde kapalı</div>
                                <div className="text-[11.5px]">Röntgen ve onam formu arşivi bir sonraki sürümde eklenecek.</div>
                            </div>
                        </Card>
                    </div>

                    {/* ═══ Sağ kolon ═══ */}
                    <div className="flex flex-col gap-4">
                        <Card icon={<CreditCard size={16} />} title="Finans" sub="Tüm tedavi planları toplamı">
                            <div className="grid grid-cols-3 border-b border-[var(--dc-border)]">
                                {[['Toplam', fmtTL(financial.total), 'text-[var(--dc-ink)]'], ['Ödenen', fmtTL(financial.paid), 'text-[var(--dc-green)]'], ['Kalan', fmtTL(financial.balance), financial.balance > 0 ? 'text-[var(--dc-red2)]' : 'text-[var(--dc-muted2)]']].map(([k, v, c], i) => (
                                    <div key={k} className={cn('px-3 py-3.5 text-center', i < 2 && 'border-r border-[var(--dc-border)]')}>
                                        <div className="text-[10.5px] font-bold uppercase tracking-[.05em] text-[var(--dc-muted)]">{k}</div>
                                        <div className={cn('mt-1 font-mono text-[16px] font-extrabold tracking-[-0.02em]', c)}>{v}</div>
                                    </div>
                                ))}
                            </div>
                            {plans.filter((p) => p.status !== 'cancelled').length > 0 && (
                                <div className="flex flex-col gap-3.5 px-[18px] pt-3.5 pb-1.5">
                                    {plans.filter((p) => p.status !== 'cancelled').slice(0, 4).map((p) => {
                                        const paid = financial.paidForPlan(p.id);
                                        const remaining = Math.max(0, p.totalAmount - paid);
                                        const pct = p.totalAmount > 0 ? Math.min(100, Math.round((paid / p.totalAmount) * 100)) : 0;
                                        const proposed = p.status === 'proposed';
                                        return (
                                            <div key={p.id}>
                                                <div className="flex items-baseline gap-2"><span className="flex-1 truncate text-[13px] font-bold text-[var(--dc-ink)]">{p.title}</span>
                                                    {proposed
                                                        ? <span className="rounded-full bg-[var(--dc-amber-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em] text-[var(--dc-amber)]">Teklif · onay bekliyor</span>
                                                        : <span className={cn('font-mono text-[11.5px] font-semibold', remaining > 0 ? 'text-[var(--dc-muted)]' : 'text-[var(--dc-green)]')}>{remaining > 0 ? `${fmtTL(remaining)} kaldı` : 'Ödendi'}</span>}</div>
                                                {!proposed && <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-[var(--dc-surface3)]"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: remaining > 0 ? 'var(--dc-orange)' : 'var(--dc-green)' }} /></div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {financial.next && (
                                <div className="mx-[18px] mt-3 flex items-center gap-2 rounded-[9px] bg-[var(--dc-amber-bg)] px-3.5 py-2.5 text-[12px] font-bold text-[var(--dc-amber)]">
                                    <Clock3 size={13} /> Yaklaşan taksit: <b className="font-mono">{fmtTL(financial.next.amount)} · {financial.next.dueDate.slice(5).split('-').reverse().join('.')}</b>
                                </div>
                            )}
                            <div className="p-[18px] pt-3.5">
                                {latestOpenReservation
                                    ? <button onClick={() => navigate(`/dental-visit/${encodeURIComponent(latestOpenReservation.id)}`)} className="h-12 w-full rounded-full bg-[var(--dc-orange)] text-[13px] font-bold text-white transition-all hover:brightness-95">Tahsilat Al</button>
                                    : <button onClick={() => navigate('/kasa')} className="h-12 w-full rounded-full bg-[var(--dc-orange)] text-[13px] font-bold text-white transition-all hover:brightness-95">Tahsilat Al</button>}
                            </div>
                        </Card>

                        <Card icon={<RotateCcw size={16} />} title="Kontrol" sub="Recall planı"
                            right={customer.recallDate
                                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dc-green-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--dc-green)]"><span className="w-[5px] h-[5px] rounded-full bg-current" />Planlandı</span>
                                : <span className="inline-flex items-center rounded-full bg-[var(--dc-surface2)] px-2.5 py-1 text-[11px] font-bold text-[var(--dc-muted)]">Yok</span>}>
                            <div className="flex flex-col gap-3 p-[18px]">
                                {customer.recallDate ? (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-[50px] w-[46px] flex-shrink-0 flex-col items-center justify-center rounded-[10px] border border-[var(--dc-border2)] bg-[var(--dc-surface2)]">
                                                <span className="font-mono text-[16px] font-extrabold leading-none text-[var(--dc-ink)]">{customer.recallDate.slice(8, 10)}</span>
                                                <span className="mt-0.5 font-mono text-[9.5px] tracking-[.08em] text-[var(--dc-muted)]">{MONTHS_TR[Number(customer.recallDate.slice(5, 7)) - 1]}</span>
                                            </div>
                                            <div><div className="text-[13.5px] font-bold text-[var(--dc-ink)]">Kontrol randevusu</div>
                                                <div className="mt-0.5 text-[11.5px] text-[var(--dc-muted)]">Hatırlatma kontrolden 2 gün önce gönderilir</div></div>
                                        </div>
                                        {customer.phone && (
                                            <a href={waLinkTR(customer.phone, `Merhaba ${customer.name}, kontrol randevunuzun tarihi ${customer.recallDate}. Uygunluğunuzu onaylamak için EVET yazmanız yeterli.`)} target="_blank" rel="noreferrer"
                                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--dc-border2)] text-[12.5px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">
                                                <MessageCircle size={14} />WhatsApp ile Hatırlat
                                            </a>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-[12px] text-[var(--dc-muted)]">Kontrol tarihi ziyaret kapanışında (Kontrol adımı) veya diş şeması sayfasından planlanır.</div>
                                )}
                            </div>
                        </Card>

                        <Card icon={<CalendarDays size={16} />} title="Randevular" sub="Gelecek + geçmiş">
                            {customerReservations.length === 0 ? (
                                <div className="p-6 text-center text-[12px] text-[var(--dc-muted2)]">Randevu kaydı yok</div>
                            ) : (
                                <div className="py-1">
                                    {customerReservations.slice(0, 8).map((r) => {
                                        const future = futureAppts.some((f) => f.id === r.id);
                                        const st = r.status === 'cancelled' ? { l: 'İptal', c: 'bg-[var(--dc-surface2)] text-[var(--dc-muted)]' }
                                            : r.status === 'completed' ? { l: 'Tamamlandı', c: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]' }
                                                : r.status === 'pending' ? { l: 'Onay bekliyor', c: 'bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]' }
                                                    : r.arrivedAt || r.customerArrivedAt ? { l: 'Geldi', c: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]' }
                                                        : { l: 'Planlandı', c: 'bg-[var(--dc-blue-bg)] text-[var(--dc-blue)]' };
                                        return (
                                            <div key={r.id} className={cn('flex min-h-[44px] items-center gap-3 border-b border-[var(--dc-border)] px-[18px] py-2.5 last:border-b-0', future && 'bg-[var(--dc-surface2)]')}>
                                                <div className="w-[86px] flex-shrink-0 font-mono text-[11.5px] font-bold text-[var(--dc-ink)]">
                                                    {r.date.slice(8, 10)} {MONTHS_TR[Number(r.date.slice(5, 7)) - 1]}
                                                    <small className="mt-px block text-[10px] font-medium text-[var(--dc-muted2)]">{r.startTime}</small>
                                                </div>
                                                <div className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--dc-ink)]">{r.service}</div>
                                                <span className={cn('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold', st.c)}><span className="w-[5px] h-[5px] rounded-full bg-current" />{st.l}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
