import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
    AlertTriangle,
    ArrowRight,
    BellRing,
    CalendarDays,
    Check,
    CheckCircle2,
    Circle,
    ClipboardList,
    Clock3,
    FileText,
    Mail,
    Phone,
    Save,
    Stethoscope,
    UserRound,
    WalletCards,
    X,
} from 'lucide-react';
import { DentalChart } from '@/components/dental/DentalChart';
import { ToothIcon } from '@/components/dental/ToothIcon';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDateEU } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { Customer, Reservation, TreatmentPlanStatus } from '@/types';

export type DentalVisitTab = 'exam' | 'chart' | 'plan' | 'sessions' | 'payment' | 'recall';
export type DentalVisitStepState = 'complete' | 'in-progress' | 'attention' | 'optional';

export interface DentalVisitEncounterDraft {
    id?: string;
    status?: 'draft' | 'in-progress' | 'completed';
    chiefComplaint?: string;
    examinationNote?: string;
    diagnosis?: string;
    medicalAlerts?: string[];
    dentalRecordCount?: number;
    plannedDentalCount?: number;
    updatedAt?: string;
}

export interface DentalVisitPlanSummary {
    id: string;
    title: string;
    totalAmount: number;
    status: TreatmentPlanStatus;
}

export interface DentalVisitFinancialSummary {
    totalAmount: number;
    paidAmount: number;
    balance: number;
    overdueAmount?: number;
    nextDueDate?: string;
}

export interface DentalVisitRecallSummary {
    date?: string;
    time?: string;
    status?: 'recommended' | 'scheduled' | 'completed';
    note?: string;
}

export interface DentalVisitExamInput {
    chiefComplaint: string;
    examinationNote: string;
    diagnosis: string;
}

export interface PatientVisitWorkspaceProps {
    customer: Customer;
    reservation?: Reservation;
    encounter?: DentalVisitEncounterDraft;
    treatmentPlans?: DentalVisitPlanSummary[];
    sessions?: Reservation[];
    financial?: DentalVisitFinancialSummary;
    recall?: DentalVisitRecallSummary;
    staffId?: string;
    readOnly?: boolean;
    canEditChart?: boolean;
    activeTab?: DentalVisitTab;
    defaultTab?: DentalVisitTab;
    stepStates?: Partial<Record<DentalVisitTab, DentalVisitStepState>>;
    onTabChange?: (tab: DentalVisitTab) => void;
    onSaveExam?: (input: DentalVisitExamInput) => Promise<boolean | void> | boolean | void;
    onOpenPatientFile?: () => void;
    onClose?: () => void;
    onScheduleRecall?: () => void;
    headerActions?: ReactNode;
    planContent?: ReactNode;
    sessionsContent?: ReactNode;
    paymentContent?: ReactNode;
    recallContent?: ReactNode;
}

const DENTAL_THEME = {
    ink: 'var(--dc-ink)',
    muted: 'var(--dc-muted)',
    surface: 'var(--dc-surface)',
    surface2: 'var(--dc-surface2)',
    border: 'var(--dc-border)',
    border2: 'var(--dc-border2)',
};

const MONEY = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
});

const PLAN_STATUS: Record<TreatmentPlanStatus, { label: string; className: string }> = {
    proposed: { label: 'Teklif', className: 'bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]' },
    active: { label: 'Aktif', className: 'bg-[var(--dc-orange-soft)] text-[var(--dc-orange)]' },
    completed: { label: 'Tamamlandı', className: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]' },
    cancelled: { label: 'İptal', className: 'bg-[var(--dc-red-bg)] text-[var(--dc-red)]' },
};

const RESERVATION_STATUS: Record<Reservation['status'], { label: string; className: string }> = {
    pending: { label: 'Onay bekliyor', className: 'bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]' },
    confirmed: { label: 'Onaylandı', className: 'bg-[var(--dc-blue-bg)] text-[var(--dc-blue)]' },
    completed: { label: 'Tamamlandı', className: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]' },
    cancelled: { label: 'İptal', className: 'bg-[var(--dc-red-bg)] text-[var(--dc-red)]' },
};

const STEP_STATE_META: Record<DentalVisitStepState, { label: string; dot: string }> = {
    complete: { label: 'Tamam', dot: 'bg-[var(--dc-green)]' },
    'in-progress': { label: 'Devam ediyor', dot: 'bg-[var(--dc-orange)]' },
    attention: { label: 'Bekliyor', dot: 'bg-[var(--dc-amber)]' },
    optional: { label: 'Gerekirse', dot: 'bg-[var(--dc-muted2)]' },
};

const TAB_META: Array<{
    id: DentalVisitTab;
    label: string;
    shortLabel: string;
    icon: ComponentType<{ size?: number; className?: string }>;
}> = [
    { id: 'exam', label: 'Muayene', shortLabel: 'Muayene', icon: Stethoscope },
    { id: 'chart', label: 'Diş Şeması', shortLabel: 'Diş Şeması', icon: ToothIcon },
    { id: 'plan', label: 'Tedavi Planı', shortLabel: 'Plan', icon: ClipboardList },
    { id: 'sessions', label: 'Seanslar', shortLabel: 'Seanslar', icon: CalendarDays },
    { id: 'payment', label: 'Tahsilat', shortLabel: 'Tahsilat', icon: WalletCards },
    { id: 'recall', label: 'Kontrol / Recall', shortLabel: 'Kontrol', icon: BellRing },
];

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toLocaleUpperCase('tr-TR')
        .slice(0, 2);
}

function customFieldText(value: string | number | boolean | undefined): string | undefined {
    if (value === undefined || value === null || value === '' || value === false) return undefined;
    return String(value);
}

function getDefaultMedicalAlerts(customer: Customer): string[] {
    const fields = customer.customFields || {};
    return [
        customFieldText(fields.alerji) ? `Alerji: ${customFieldText(fields.alerji)}` : undefined,
        customFieldText(fields.ilaclar) ? `İlaç: ${customFieldText(fields.ilaclar)}` : undefined,
        customFieldText(fields.kronik) ? `Kronik: ${customFieldText(fields.kronik)}` : undefined,
    ].filter((item): item is string => Boolean(item));
}

function defaultStepStates(
    reservation: Reservation | undefined,
    encounter: DentalVisitEncounterDraft | undefined,
    plans: DentalVisitPlanSummary[],
    sessions: Reservation[],
    financial: DentalVisitFinancialSummary | undefined,
    recall: DentalVisitRecallSummary | undefined,
): Record<DentalVisitTab, DentalVisitStepState> {
    const hasChart = (encounter?.dentalRecordCount || 0) > 0;
    const hasPlannedDentalWork = (encounter?.plannedDentalCount || 0) > 0;
    const nonCancelledSessions = sessions.filter((session) => session.status !== 'cancelled');
    const allPlansCompleted = plans.length > 0 && plans.every((plan) => plan.status === 'completed');

    return {
        exam: encounter?.status === 'completed' || reservation?.status === 'completed'
            ? 'complete'
            : encounter?.status === 'in-progress' || Boolean(reservation?.arrivedAt)
                ? 'in-progress'
                : reservation && reservation.status !== 'cancelled'
                    ? 'attention'
                    : 'optional',
        chart: hasChart ? 'complete' : hasPlannedDentalWork ? 'attention' : 'optional',
        plan: allPlansCompleted ? 'complete' : plans.some((plan) => plan.status === 'active') ? 'attention' : 'optional',
        sessions: nonCancelledSessions.some((session) => session.status === 'completed')
            ? 'complete'
            : nonCancelledSessions.length > 0
                ? 'attention'
                : 'optional',
        payment: financial && financial.totalAmount > 0
            ? financial.balance <= 0
                ? 'complete'
                : 'attention'
            : 'optional',
        recall: recall?.status === 'completed'
            ? 'complete'
            : recall?.date
                ? 'attention'
                : 'optional',
    };
}

function DetailRow({ label, value }: { label: string; value?: string }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--dc-border-soft)] last:border-0">
            <span className="text-[11px] text-[var(--dc-muted)]">{label}</span>
            <span className="text-[12px] font-semibold text-right text-[var(--dc-ink)]">{value || '—'}</span>
        </div>
    );
}

function EmptyPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
    return (
        <div className="min-h-[240px] grid place-items-center rounded-2xl border border-dashed border-[var(--dc-border2)] bg-[var(--dc-surface2)]/60 px-6 py-10 text-center">
            <div className="max-w-[360px]">
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[var(--dc-surface)] text-[var(--dc-muted)] border border-[var(--dc-border)]">
                    {icon}
                </div>
                <h3 className="text-[14px] font-bold text-[var(--dc-ink)]">{title}</h3>
                <p className="mt-1.5 text-[12px] leading-5 text-[var(--dc-muted)]">{body}</p>
            </div>
        </div>
    );
}

export function PatientVisitWorkspace(props: PatientVisitWorkspaceProps) {
    const visitKey = `${props.customer.id}:${props.reservation?.id || 'patient'}`;
    return <PatientVisitWorkspaceForVisit key={visitKey} {...props} />;
}

function PatientVisitWorkspaceForVisit({
    customer,
    reservation,
    encounter,
    treatmentPlans = [],
    sessions = [],
    financial,
    recall,
    staffId,
    readOnly = false,
    canEditChart = true,
    activeTab: controlledTab,
    defaultTab = 'exam',
    stepStates,
    onTabChange,
    onSaveExam,
    onOpenPatientFile,
    onClose,
    onScheduleRecall,
    headerActions,
    planContent,
    sessionsContent,
    paymentContent,
    recallContent,
}: PatientVisitWorkspaceProps) {
    const { dark } = useTheme();
    const [internalTab, setInternalTab] = useState<DentalVisitTab>(defaultTab);
    const [chiefComplaint, setChiefComplaint] = useState(
        encounter?.chiefComplaint || customFieldText(reservation?.customFields?.basvuru_nedeni) || '',
    );
    const [examinationNote, setExaminationNote] = useState(
        encounter?.examinationNote
        || customFieldText(reservation?.customFields?.tedavi_notu)
        || reservation?.notes
        || '',
    );
    const [diagnosis, setDiagnosis] = useState(
        encounter?.diagnosis || customFieldText(reservation?.customFields?.tani) || '',
    );
    const [savingExam, setSavingExam] = useState(false);
    const [saveMessage, setSaveMessage] = useState<'saved' | 'error' | null>(null);
    const activeTab = controlledTab ?? internalTab;

    const medicalAlerts = useMemo(() => {
        const supplied = encounter?.medicalAlerts?.filter(Boolean) || [];
        return supplied.length > 0 ? supplied : getDefaultMedicalAlerts(customer);
    }, [customer, encounter?.medicalAlerts]);

    const resolvedStepStates = useMemo(() => ({
        ...defaultStepStates(reservation, encounter, treatmentPlans, sessions, financial, recall),
        ...stepStates,
    }), [reservation, encounter, treatmentPlans, sessions, financial, recall, stepStates]);

    const selectTab = (tab: DentalVisitTab) => {
        if (controlledTab === undefined) setInternalTab(tab);
        onTabChange?.(tab);
    };

    const saveExam = async () => {
        if (!onSaveExam || readOnly || savingExam) return;
        setSavingExam(true);
        setSaveMessage(null);
        try {
            const result = await onSaveExam({ chiefComplaint, examinationNote, diagnosis });
            setSaveMessage(result === false ? 'error' : 'saved');
        } catch (error) {
            console.error('Muayene kaydı kaydedilemedi', error);
            setSaveMessage('error');
        } finally {
            setSavingExam(false);
        }
    };

    const reservationMeta = reservation ? RESERVATION_STATUS[reservation.status] : null;
    const completedStepCount = Object.values(resolvedStepStates).filter((state) => state === 'complete').length;
    const activePlans = treatmentPlans.filter((plan) => plan.status === 'active');

    return (
        <section className={cn('dash-theme min-w-0 bg-[var(--dc-page)] text-[var(--dc-ink)]', dark && 'dark')}>
            <div className="mx-auto w-full max-w-[1480px] p-3 sm:p-5 lg:p-6">
                <div className="overflow-hidden rounded-[22px] border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-[0_2px_8px_rgba(14,14,14,.05),0_16px_45px_rgba(14,14,14,.05)]">
                    <header className="border-b border-[var(--dc-border)] px-4 py-4 sm:px-5 lg:px-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-center gap-3.5">
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] bg-[var(--dc-inkbox)] text-[13px] font-extrabold tracking-[-.02em] text-[var(--dc-inkbox-fg)]">
                                    {initials(customer.name) || <UserRound size={19} />}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="truncate text-[18px] font-extrabold tracking-[-.025em] sm:text-[20px]">{customer.name}</h1>
                                        {reservationMeta && (
                                            <span className={cn('rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.06em]', reservationMeta.className)}>
                                                {reservationMeta.label}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--dc-muted)]">
                                        <span className="inline-flex items-center gap-1.5"><Phone size={11} />{customer.phone || 'Telefon yok'}</span>
                                        {customer.email && <span className="inline-flex items-center gap-1.5"><Mail size={11} />{customer.email}</span>}
                                        {reservation && <span className="inline-flex items-center gap-1.5"><CalendarDays size={11} />{formatDateEU(reservation.date)} · {reservation.startTime}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                <div className="mr-1 hidden text-right sm:block">
                                    <div className="text-[10px] font-bold uppercase tracking-[.11em] text-[var(--dc-muted)]">Ziyaret özeti</div>
                                    <div className="mt-0.5 text-[12px] font-semibold">{completedStepCount} adım kayıtlı · adımlar bağımsız</div>
                                </div>
                                {headerActions}
                                {onOpenPatientFile && (
                                    <button type="button" onClick={onOpenPatientFile}
                                        className="h-10 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-3.5 text-[11.5px] font-bold text-[var(--dc-ink)] transition-colors hover:bg-[var(--dc-surface3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)]">
                                        Hasta Dosyası
                                    </button>
                                )}
                                {onClose && (
                                    <button type="button" onClick={onClose} aria-label="Hasta ziyaretini kapat"
                                        className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] text-[var(--dc-muted)] transition-colors hover:text-[var(--dc-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)]">
                                        <X size={17} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {medicalAlerts.length > 0 && (
                            <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-[13px] border border-[color:var(--dc-amber)]/25 bg-[var(--dc-amber-bg)] px-3.5 py-3 text-[var(--dc-amber)]">
                                <AlertTriangle size={16} className="mt-px shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-[10px] font-extrabold uppercase tracking-[.1em]">Medikal uyarı</div>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] font-semibold">
                                        {medicalAlerts.map((alert) => <span key={alert}>{alert}</span>)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </header>

                    <nav aria-label="Hasta ziyareti bölümleri" className="border-b border-[var(--dc-border)] bg-[var(--dc-surface2)]/55 px-3 py-3 sm:px-5">
                        <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {TAB_META.map((tab) => {
                                const selected = activeTab === tab.id;
                                const state = resolvedStepStates[tab.id];
                                const stateMeta = STEP_STATE_META[state];
                                const Icon = tab.icon;
                                return (
                                    <button key={tab.id} type="button" role="tab" aria-selected={selected}
                                        aria-controls={`dental-visit-panel-${tab.id}`}
                                        onClick={() => selectTab(tab.id)}
                                        className={cn(
                                            'group min-w-[142px] flex-1 rounded-[13px] border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)]',
                                            selected
                                                ? 'border-[var(--dc-orange)] bg-[var(--dc-surface)] shadow-[0_2px_8px_rgba(14,14,14,.06)]'
                                                : 'border-transparent bg-transparent hover:border-[var(--dc-border)] hover:bg-[var(--dc-surface)]/70',
                                        )}>
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                'grid h-7 w-7 shrink-0 place-items-center rounded-[9px] transition-colors',
                                                selected ? 'bg-[var(--dc-orange)] text-white' : 'bg-[var(--dc-surface3)] text-[var(--dc-muted)]',
                                            )}>
                                                <Icon size={14} />
                                            </span>
                                            <span className={cn('text-[11.5px] font-extrabold', selected ? 'text-[var(--dc-ink)]' : 'text-[var(--dc-muted)]')}>
                                                {tab.shortLabel}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-1.5 pl-0.5">
                                            <span className={cn('h-1.5 w-1.5 rounded-full', stateMeta.dot)} />
                                            <span className="text-[9.5px] font-semibold text-[var(--dc-muted)]">{stateMeta.label}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </nav>

                    <div id={`dental-visit-panel-${activeTab}`} role="tabpanel" className="p-4 sm:p-5 lg:p-6">
                        {activeTab === 'exam' && (
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
                                <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] p-4 sm:p-5">
                                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Stethoscope size={16} className="text-[var(--dc-orange)]" />
                                                <h2 className="text-[14px] font-extrabold">Muayene kaydı</h2>
                                            </div>
                                            <p className="mt-1 text-[11px] text-[var(--dc-muted)]">Klinik değerlendirme bu randevu bağlamında tutulur.</p>
                                        </div>
                                        {encounter?.updatedAt && (
                                            <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--dc-muted)]">
                                                <Clock3 size={11} /> Son kayıt {new Date(encounter.updatedAt).toLocaleString('tr-TR')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <label className="block">
                                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--dc-muted)]">Başvuru nedeni</span>
                                            <textarea value={chiefComplaint} onChange={(event) => { setChiefComplaint(event.target.value); setSaveMessage(null); }}
                                                readOnly={readOnly || !onSaveExam} rows={3} placeholder="Hastanın şikâyeti veya geliş nedeni"
                                                className="w-full resize-y rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-3 py-2.5 text-[12px] leading-5 text-[var(--dc-ink)] outline-none transition-colors placeholder:text-[var(--dc-muted2)] focus:border-[var(--dc-orange)] read-only:cursor-default" />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--dc-muted)]">Tanı / değerlendirme</span>
                                            <textarea value={diagnosis} onChange={(event) => { setDiagnosis(event.target.value); setSaveMessage(null); }}
                                                readOnly={readOnly || !onSaveExam} rows={3} placeholder="Klinik değerlendirme"
                                                className="w-full resize-y rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-3 py-2.5 text-[12px] leading-5 text-[var(--dc-ink)] outline-none transition-colors placeholder:text-[var(--dc-muted2)] focus:border-[var(--dc-orange)] read-only:cursor-default" />
                                        </label>
                                    </div>
                                    <label className="mt-3 block">
                                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--dc-muted)]">Muayene notu</span>
                                        <textarea value={examinationNote} onChange={(event) => { setExaminationNote(event.target.value); setSaveMessage(null); }}
                                            readOnly={readOnly || !onSaveExam} rows={5} placeholder="Bulgular, ölçümler ve klinik notlar"
                                            className="w-full resize-y rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-3 py-2.5 text-[12px] leading-5 text-[var(--dc-ink)] outline-none transition-colors placeholder:text-[var(--dc-muted2)] focus:border-[var(--dc-orange)] read-only:cursor-default" />
                                    </label>

                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                        <button type="button" onClick={() => selectTab('chart')}
                                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-3.5 text-[11.5px] font-bold transition-colors hover:bg-[var(--dc-surface3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)]">
                                            Diş şemasına geç <ArrowRight size={14} />
                                        </button>
                                        {onSaveExam && !readOnly && (
                                            <div className="flex items-center gap-3">
                                                {saveMessage === 'saved' && <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--dc-green)]"><Check size={12} /> Kaydedildi</span>}
                                                {saveMessage === 'error' && <span className="text-[10.5px] font-semibold text-[var(--dc-red)]">Kayıt tamamlanamadı</span>}
                                                <button type="button" onClick={saveExam} disabled={savingExam}
                                                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--dc-inkbox)] px-4 text-[11.5px] font-extrabold text-[var(--dc-inkbox-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)]">
                                                    <Save size={14} />{savingExam ? 'Kaydediliyor…' : 'Muayeneyi Kaydet'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <aside className="space-y-4">
                                    <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] p-4">
                                        <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><CalendarDays size={14} /> Randevu bağlamı</div>
                                        <DetailRow label="Tarih" value={reservation ? formatDateEU(reservation.date) : undefined} />
                                        <DetailRow label="Saat" value={reservation ? `${reservation.startTime}–${reservation.endTime}` : undefined} />
                                        <DetailRow label="Tedavi" value={reservation?.service} />
                                        <DetailRow label="Hekim" value={reservation?.staffName} />
                                        <DetailRow label="Ünite" value={reservation?.resourceName} />
                                    </div>
                                    <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] p-4">
                                        <div className="mb-3 flex items-center gap-2 text-[12px] font-extrabold">
                                            <AlertTriangle size={14} className={medicalAlerts.length > 0 ? 'text-[var(--dc-amber)]' : 'text-[var(--dc-green)]'} />
                                            Hasta güvenliği
                                        </div>
                                        {medicalAlerts.length > 0 ? (
                                            <div className="space-y-2">
                                                {medicalAlerts.map((alert) => (
                                                    <div key={alert} className="rounded-xl bg-[var(--dc-amber-bg)] px-3 py-2.5 text-[11px] font-semibold leading-4 text-[var(--dc-amber)]">{alert}</div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 rounded-xl bg-[var(--dc-green-bg)] px-3 py-2.5 text-[11px] font-semibold text-[var(--dc-green)]">
                                                <CheckCircle2 size={14} /> Kayıtlı medikal uyarı yok
                                            </div>
                                        )}
                                    </div>
                                </aside>
                            </div>
                        )}

                        {activeTab === 'chart' && (
                            <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] p-4 sm:p-5">
                                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--dc-border)] pb-4">
                                    <div>
                                        <div className="flex items-center gap-2"><ToothIcon size={16} /><h2 className="text-[14px] font-extrabold">Diş Şeması</h2></div>
                                        <p className="mt-1 text-[11px] text-[var(--dc-muted)]">Bulguyu diş ve yüzey bazında kaydedin; geçmiş kayıtlar korunur.</p>
                                    </div>
                                    <div className="flex gap-2 text-[10px] font-bold">
                                        {encounter?.dentalRecordCount !== undefined && <span className="rounded-full bg-[var(--dc-surface2)] px-2.5 py-1.5 text-[var(--dc-muted)]">{encounter.dentalRecordCount} kayıtlı diş</span>}
                                        {(encounter?.plannedDentalCount || 0) > 0 && <span className="rounded-full bg-[var(--dc-orange-soft)] px-2.5 py-1.5 text-[var(--dc-orange)]">{encounter?.plannedDentalCount} planlı</span>}
                                    </div>
                                </div>
                                <DentalChart customerId={customer.id} staffId={staffId} encounterId={encounter?.id} reservationId={reservation?.id} T={DENTAL_THEME} readOnly={readOnly || !canEditChart} />
                            </div>
                        )}

                        {activeTab === 'plan' && (
                            planContent || (
                                treatmentPlans.length > 0 ? (
                                    <div className="space-y-3">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <div><h2 className="text-[14px] font-extrabold">Tedavi planları</h2><p className="mt-1 text-[11px] text-[var(--dc-muted)]">Teklif, onay ve klinik durum aynı hasta bağlamında görünür.</p></div>
                                            <span className="rounded-full bg-[var(--dc-surface2)] px-3 py-1.5 text-[10px] font-bold text-[var(--dc-muted)]">{activePlans.length} aktif plan</span>
                                        </div>
                                        {treatmentPlans.map((plan) => (
                                            <article key={plan.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] p-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0"><div className="truncate text-[13px] font-extrabold">{plan.title}</div><div className="mt-1 text-[10.5px] text-[var(--dc-muted)]">Tedavi teklifi / plan kaydı</div></div>
                                                <div className="flex items-center gap-3"><span className={cn('rounded-full px-2.5 py-1 text-[9.5px] font-extrabold', PLAN_STATUS[plan.status].className)}>{PLAN_STATUS[plan.status].label}</span><strong className="text-[14px]">{MONEY.format(plan.totalAmount)}</strong></div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyPanel icon={<ClipboardList size={19} />} title="Tedavi planı henüz oluşturulmamış" body="Muayene ve diş şeması kayıtlarından sonra gerekiyorsa fiyatlandırılmış tedavi planı hazırlanabilir." />
                                )
                            )
                        )}

                        {activeTab === 'sessions' && (
                            sessionsContent || (
                                sessions.length > 0 ? (
                                    <div>
                                        <div className="mb-4"><h2 className="text-[14px] font-extrabold">Tedavi seansları</h2><p className="mt-1 text-[11px] text-[var(--dc-muted)]">Bu hastaya bağlı randevu ve seansların özeti.</p></div>
                                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                            {sessions.map((session) => {
                                                const status = RESERVATION_STATUS[session.status];
                                                return (
                                                    <article key={session.id} className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] p-4">
                                                        <div className="flex items-start justify-between gap-3"><div><div className="text-[13px] font-extrabold">{session.service}</div><div className="mt-1 text-[10.5px] text-[var(--dc-muted)]">{formatDateEU(session.date)} · {session.startTime}–{session.endTime}</div></div><span className={cn('rounded-full px-2.5 py-1 text-[9px] font-extrabold', status.className)}>{status.label}</span></div>
                                                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-[var(--dc-muted)]"><span>{session.staffName || 'Hekim atanmamış'}</span>{session.resourceName && <span>{session.resourceName}</span>}</div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyPanel icon={<CalendarDays size={19} />} title="Bağlı tedavi seansı yok" body="Tedavi planı kabul edildiğinde ilgili işlemler doğrudan randevu seanslarına dönüştürülebilir." />
                                )
                            )
                        )}

                        {activeTab === 'payment' && (
                            paymentContent || (
                                financial ? (
                                    <div>
                                        <div className="mb-4"><h2 className="text-[14px] font-extrabold">Tahsilat özeti</h2><p className="mt-1 text-[11px] text-[var(--dc-muted)]">Klinik tamamlanma ile ödeme durumu birbirinden bağımsız izlenir.</p></div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                { label: 'Plan toplamı', value: financial.totalAmount, tone: 'text-[var(--dc-ink)]' },
                                                { label: 'Tahsil edilen', value: financial.paidAmount, tone: 'text-[var(--dc-green)]' },
                                                { label: 'Kalan bakiye', value: financial.balance, tone: financial.balance > 0 ? 'text-[var(--dc-orange)]' : 'text-[var(--dc-green)]' },
                                                { label: 'Geciken', value: financial.overdueAmount || 0, tone: (financial.overdueAmount || 0) > 0 ? 'text-[var(--dc-red)]' : 'text-[var(--dc-muted)]' },
                                            ].map((item) => (
                                                <div key={item.label} className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] p-4"><div className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--dc-muted)]">{item.label}</div><div className={cn('mt-2 text-[21px] font-black tracking-[-.03em]', item.tone)}>{MONEY.format(item.value)}</div></div>
                                            ))}
                                        </div>
                                        {financial.nextDueDate && <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--dc-amber-bg)] px-3 py-2 text-[11px] font-semibold text-[var(--dc-amber)]"><Clock3 size={13} /> Sıradaki vade: {formatDateEU(financial.nextDueDate)}</div>}
                                    </div>
                                ) : (
                                    <EmptyPanel icon={<WalletCards size={19} />} title="Finans özeti henüz oluşmadı" body="Onaylanan tedavi planının tutarı ve tahsilatlar burada tek bakiye üzerinden izlenecek." />
                                )
                            )
                        )}

                        {activeTab === 'recall' && (
                            recallContent || (
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                                    <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] p-5">
                                        <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--dc-orange-soft)] text-[var(--dc-orange)]"><BellRing size={18} /></div><div><h2 className="text-[14px] font-extrabold">Kontrol ve recall</h2><p className="mt-1 text-[11px] leading-5 text-[var(--dc-muted)]">Tedavi sonrası kısa kontrol veya periyodik hasta çağrısı, randevudan ayrı bir takip kaydıdır.</p></div></div>
                                        {recall?.date ? (
                                            <div className="mt-5 rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] p-4"><div className="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--dc-muted)]">Planlanan kontrol</div><div className="mt-2 text-[18px] font-black tracking-[-.02em]">{formatDateEU(recall.date)}{recall.time ? ` · ${recall.time}` : ''}</div>{recall.note && <p className="mt-2 text-[11px] leading-5 text-[var(--dc-muted)]">{recall.note}</p>}</div>
                                        ) : (
                                            <div className="mt-5 rounded-2xl border border-dashed border-[var(--dc-border2)] bg-[var(--dc-surface)] p-4 text-[11.5px] text-[var(--dc-muted)]">Bu ziyaret için planlanmış kontrol bulunmuyor.</div>
                                        )}
                                    </div>
                                    <aside className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] p-4">
                                        <div className="flex items-center gap-2 text-[12px] font-extrabold"><FileText size={14} /> Ziyaret durumu</div>
                                        <div className="mt-3 space-y-2">
                                            {[
                                                { label: 'Muayene kaydı', state: resolvedStepStates.exam },
                                                { label: 'Diş şeması', state: resolvedStepStates.chart },
                                                { label: 'Tedavi planı', state: resolvedStepStates.plan },
                                                { label: 'Tahsilat durumu', state: resolvedStepStates.payment },
                                            ].map((item) => (
                                                <div key={item.label} className="flex items-center gap-2 rounded-xl bg-[var(--dc-surface2)] px-3 py-2.5 text-[11px] font-semibold">
                                                    {item.state === 'complete' ? <CheckCircle2 size={14} className="text-[var(--dc-green)]" /> : <Circle size={14} className={item.state === 'attention' ? 'text-[var(--dc-amber)]' : 'text-[var(--dc-muted2)]'} />}
                                                    <span className="min-w-0 flex-1">{item.label}</span>
                                                    <span className="text-[9.5px] font-semibold text-[var(--dc-muted)]">{STEP_STATE_META[item.state].label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {onScheduleRecall && (
                                            <button type="button" onClick={onScheduleRecall}
                                                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--dc-orange)] text-[12px] font-extrabold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dc-orange)] focus-visible:ring-offset-2">
                                                <CalendarDays size={15} /> {recall?.date ? 'Kontrolü Düzenle' : 'Kontrol Planla'}
                                            </button>
                                        )}
                                    </aside>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
