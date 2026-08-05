import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, LoaderCircle, Stethoscope, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import { useDentalChart } from '@/hooks/useDentalChart';
import { useInstallmentSchedules } from '@/hooks/useInstallmentSchedules';
import { useLabels } from '@/hooks/useLabels';
import { usePatientEncounter } from '@/hooks/usePatientEncounter';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { PerioChart } from '@/components/dental/PerioChart';
import { resolveDentalVisitAccess } from '@/lib/dentalVisit';
import { sendRecallReminder } from '@/lib/recallReminder';
import { computePatientFinance, isBillablePlan, planRemaining } from '@/lib/patientBalance';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/cn';
import { todayISO } from '@/utils/date';
import type { Customer, DentalStatus, InstallmentCadence, Reservation, ToothSurface } from '@/types';

// Muayene formu girişi (kaldırılan eski vizit workspace'i ile aynı sözleşme)
export interface DentalVisitExamInput {
    chiefComplaint: string;
    diagnosis: string;
    examinationNote: string;
}

interface Lookup<T> {
    id: string;
    done: boolean;
    value: T | null;
}

function PageState({ title, body, action }: { title: string; body: string; action?: () => void }) {
    return (
        <div className="dash-theme flex min-h-full flex-1 items-center justify-center bg-[var(--dc-page)] p-6">
            <div className="w-full max-w-[470px] rounded-[22px] border border-[var(--dc-border)] bg-[var(--dc-surface)] p-7 text-center shadow-[0_2px_8px_rgba(14,14,14,.05),0_16px_45px_rgba(14,14,14,.05)]">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--dc-surface2)] text-[var(--dc-orange)]"><Stethoscope size={20} /></div>
                <h1 className="mt-4 text-[18px] font-extrabold text-[var(--dc-ink)]">{title}</h1>
                <p className="mt-2 text-[12.5px] leading-5 text-[var(--dc-muted)]">{body}</p>
                {action && <button type="button" onClick={action} className="mt-5 h-11 rounded-xl bg-[var(--dc-inkbox)] px-5 text-[12px] font-extrabold text-[var(--dc-inkbox-fg)]">Geri dön</button>}
            </div>
        </div>
    );
}

function MissingPatientCard({ reservation, onLinked }: { reservation: Reservation; onLinked: () => void }) {
    const { updateReservation, ensureReservationCustomer } = useReservations();
    const [phone, setPhone] = useState(reservation.customerPhone || '');
    const [saving, setSaving] = useState(false);

    const linkPatient = async () => {
        if (!phone.trim() || saving) return;
        setSaving(true);
        const updated = await updateReservation(reservation.id, { customerPhone: phone.trim() });
        const customerId = updated
            ? await ensureReservationCustomer({ ...reservation, ...updated, customerPhone: phone.trim() })
            : null;
        setSaving(false);
        if (!customerId) return;
        toast.success('Hasta dosyası randevuya bağlandı');
        onLinked();
    };

    return (
        <div className="dash-theme flex min-h-full flex-1 items-center justify-center bg-[var(--dc-page)] p-5">
            <div className="w-full max-w-[520px] rounded-[22px] border border-[var(--dc-border)] bg-[var(--dc-surface)] p-6">
                <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--dc-orange-soft)] text-[var(--dc-orange)]"><UserPlus size={19} /></div>
                    <div><h1 className="text-[17px] font-extrabold text-[var(--dc-ink)]">Hasta dosyasını bağla</h1><p className="mt-1 text-[12px] leading-5 text-[var(--dc-muted)]">{reservation.customerName} için randevu var; klinik kayıtların karışmaması için önce telefonla tek bir hasta dosyası oluşturacağız veya mevcut dosyayı bulacağız.</p></div>
                </div>
                <label className="mt-5 block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--dc-muted)]">Telefon</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="0532 xxx xxxx" className="h-12 w-full rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-4 text-[14px] text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]" /></label>
                <button type="button" onClick={linkPatient} disabled={!phone.trim() || saving} className="mt-4 h-12 w-full rounded-xl bg-[var(--dc-inkbox)] text-[13px] font-extrabold text-[var(--dc-inkbox-fg)] disabled:opacity-40">{saving ? 'Bağlanıyor…' : 'Hasta Dosyasını Bağla'}</button>
            </div>
        </div>
    );
}

// ── v7 Vizit çalışma alanı ──────────────────────────────────────────────────
// 9 adımlı şerit kaldırıldı; vizitin 3 gerçek durumu var (Bekliyor → Koltukta
// → Tamamlandı). Muayene + diş işlemleri tek odontogram-merkezli ekranda
// birleşti; teklif sağ sütunda bulgulardan canlı türetilir, tahsilat ve recall
// kapanışın yan etkisidir.

// Şikayetlerin ~%90'ı bu kümededir; serbest yazı yalnız "Diğer" ile açılır.
const COMPLAINT_CHIPS = ['Ağrı', 'Sıcak/soğuk hassasiyeti', 'Kırık diş', 'Dolgu düştü', 'Diş eti kanaması', 'Şişlik', 'Estetik', 'Kontrol', 'Kötü koku', 'Çene ağrısı'] as const;
const CHIP_SEP = ' · ';

// FDI diş dizilimi (üst / alt çene, ortada gap)
const ODONTO_TOP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ODONTO_BOT = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

// Bulgu durumları → gerçek dental_records durumu + önerilen işlem/fiyat (v6)
const FINDING_STATUSES: { k: string; l: string; color: string; dental: DentalStatus; proc: string; fee: number }[] = [
    { k: 'curuk', l: 'Çürük', color: 'var(--dc-red2)', dental: 'curuk', proc: 'Kompozit dolgu', fee: 1800 },
    { k: 'dolgu', l: 'Dolgu', color: 'var(--dc-blue)', dental: 'dolgu', proc: 'Dolgu yenileme', fee: 1600 },
    { k: 'kanal', l: 'Kanal', color: 'var(--dc-amber)', dental: 'kanal', proc: 'Kanal tedavisi', fee: 4500 },
    { k: 'kron', l: 'Kron', color: 'var(--dc-green)', dental: 'kron', proc: 'Zirkonyum kron', fee: 6500 },
    { k: 'eksik', l: 'Eksik', color: 'var(--dc-muted2)', dental: 'cekildi', proc: 'İmplant', fee: 18000 },
];
const STATUS_TO_COLOR: Record<string, string> = {
    curuk: 'var(--dc-red2)', dolgu: 'var(--dc-blue)', kanal: 'var(--dc-amber)', kron: 'var(--dc-green)',
    implant: 'var(--dc-green)', cekildi: 'var(--dc-muted2)', saglam: 'var(--dc-surface3)',
};
const SURF_LAYOUT: { s: ToothSurface; area: string; label: string }[] = [
    { s: 'B', area: 'b', label: 'Bukkal' }, { s: 'M', area: 'm', label: 'Mesial' },
    { s: 'O', area: 'o', label: 'Oklüzal' }, { s: 'D', area: 'd', label: 'Distal' }, { s: 'L', area: 'l', label: 'Lingual' },
];
const RECALL_OPTS: { k: string; add: (d: Date) => void }[] = [
    { k: '1 hafta', add: (d) => d.setDate(d.getDate() + 7) },
    { k: '1 ay', add: (d) => d.setMonth(d.getMonth() + 1) },
    { k: '3 ay', add: (d) => d.setMonth(d.getMonth() + 3) },
    { k: '6 ay', add: (d) => d.setMonth(d.getMonth() + 6) },
];
const PAY_METHOD_MAP: Record<string, 'cash' | 'card' | 'transfer'> = { Nakit: 'cash', Kart: 'card', Havale: 'transfer' };

function toothTypeLabel(n: number): string {
    const q = Math.floor(n / 10), p = n % 10;
    const side = (q === 1 || q === 4) ? 'Sağ' : 'Sol';
    const jaw = q <= 2 ? 'üst' : 'alt';
    const type = p <= 2 ? 'Kesici' : p === 3 ? 'Kanin' : p <= 5 ? 'Premolar' : 'Molar';
    return `${type} · ${side} ${jaw}`;
}

interface OfferLine { tooth: number; label: string; surfaces: ToothSurface[]; price: number; dental: DentalStatus; sessions: number; }

interface VisitJourneyProps {
    reservation: Reservation;
    customer: Customer;
    doctorName?: string;
    encounterApi: ReturnType<typeof usePatientEncounter>;
    plans: ReturnType<typeof useTreatmentPlans>['plans'];
    financial: { totalAmount: number; paidAmount: number; balance: number; overpaid?: number; unallocatedPaid?: number; orphanPaid?: number; overdueAmount?: number; nextDueDate?: string };
    // Taksitlendirilebilir planlar (aktif + kalanı olan + henüz vadesi kurulmamış)
    installmentTargets: { id: string; title: string; remaining: number }[];
    installmentsAvailable: boolean;
    pastVisits: { id: string; dateISO: string; label: string; status: string }[];
    doctorId?: string;
    dentalCount: number;
    plannedCount: number;
    dentalCurrent: Map<number, { status: DentalStatus }>;
    clinicName: string;
    patientPhone?: string;
    services: { id: string; name: string; price?: number }[];
    readOnly: boolean;
    readOnlyReason?: string;
    onOpenStaff: () => void;
    onSaveExam: (input: DentalVisitExamInput) => Promise<boolean>;
    onAddFinding: (tooth: number, dental: DentalStatus, surfaces: ToothSurface[]) => Promise<boolean>;
    onPropose: (lines: OfferLine[]) => Promise<boolean>;
    onApprove: (lines: OfferLine[]) => Promise<boolean>;
    onCompleteSession: (planId: string) => Promise<boolean>;
    onCollect: (amount: number, method: 'cash' | 'card' | 'transfer') => Promise<boolean>;
    onCreateInstallments: (planId: string, count: number, firstDueDate: string, cadence: InstallmentCadence) => Promise<boolean>;
    onSetRecall: (dateISO: string) => Promise<boolean>;
    onArrived: () => Promise<void>;
    onStartVisit: () => Promise<void>;
    onCompleteVisit: () => Promise<void>;
    onOpenPatientFile: () => void;
    onClose: () => void;
}

function VisitJourney(props: VisitJourneyProps) {
    const { reservation, customer, doctorName, encounterApi, plans, financial, dentalCount, plannedCount, dentalCurrent, clinicName, patientPhone, services = [], installmentTargets = [], installmentsAvailable, pastVisits = [], doctorId, readOnly, readOnlyReason, onOpenStaff, onSaveExam, onAddFinding, onPropose, onApprove, onCompleteSession, onCollect, onCreateInstallments, onSetRecall, onArrived, onStartVisit, onCompleteVisit, onOpenPatientFile, onClose } = props;
    const encounter = encounterApi.encounter;
    const arrived = Boolean(reservation.arrivedAt || reservation.customerArrivedAt);
    const visitCompleted = reservation.status === 'completed' || encounter?.status === 'completed';
    const stage: 'waiting' | 'chair' | 'done' = visitCompleted ? 'done' : arrived ? 'chair' : 'waiting';

    const cf = useMemo(() => customer.customFields || {}, [customer.customFields]);
    const medical = [cf.alerji ? `Alerji: ${cf.alerji}` : null, cf.ilaclar ? `İlaç: ${cf.ilaclar}` : null, cf.kronik ? `Kronik: ${cf.kronik}` : null].filter(Boolean) as string[];

    // Kayıtlı muayene notu — encounter yoksa (062 uygulanmadıysa) kayıt randevunun
    // custom alanlarına yazılır (saveExam'deki compatibility yolu); okuma da aynı
    // sırayla bakar: encounter → randevu → hasta dosyası. Parent, encounter
    // yüklenmeden render etmez; state'i ilk render'da buradan kurmak güvenlidir.
    const rcf = (reservation.customFields || {}) as Record<string, unknown>;
    const savedChief = encounter?.chiefComplaint || String(rcf.basvuru_nedeni || cf.basvuru_nedeni || '');
    const savedDiag = encounter?.diagnosis || String(rcf.tani || cf.tani || '');
    const savedNote = encounter?.clinicalNotes || String(rcf.tedavi_notu || cf.tedavi_notu || '');

    // Şikayet: chip taxonomy. Kayıtlı serbest metin chip'lere ayrıştırılır;
    // eşleşmeyen kısım "Diğer" alanında yaşamaya devam eder.
    const [chiefParsed] = useState(() => {
        const parts = savedChief.split(CHIP_SEP).map((s) => s.trim()).filter(Boolean);
        const known = COMPLAINT_CHIPS as readonly string[];
        return {
            chips: parts.filter((p) => known.includes(p)),
            custom: parts.filter((p) => !known.includes(p)).join(CHIP_SEP),
        };
    });
    const [selChips, setSelChips] = useState<string[]>(chiefParsed.chips);
    const [customChief, setCustomChief] = useState(chiefParsed.custom);
    const [showCustom, setShowCustom] = useState(Boolean(chiefParsed.custom));
    const [note, setNote] = useState(savedNote);
    const [savingExam, setSavingExam] = useState(false);
    const [busy, setBusy] = useState(false);

    // Odontogram — bulgu ekleme (yerel liste + gerçek dental_records)
    const [selTooth, setSelTooth] = useState<number | null>(null);
    const [selStatus, setSelStatus] = useState<string | null>(null);
    const [selSurf, setSelSurf] = useState<ToothSurface[]>([]);
    // Önerilen işlem: kliniğin hizmet kataloğundan ('' = FINDING varsayılanı,
    // 'none' = teklife kalem düşmeden yalnız klinik kayıt)
    const [selSvcId, setSelSvcId] = useState('');
    const [selSessions, setSelSessions] = useState('1');
    const [findings, setFindings] = useState<OfferLine[]>([]);
    const [perioOpen, setPerioOpen] = useState(false);
    // Dişe bağlı olmayan işlem (detertraj, hijyen, gece plağı…) — tooth: 0
    const [genSvcId, setGenSvcId] = useState('');

    // Durum → katalogda aranacak anahtar kelimeler; eşleşme yoksa sabit varsayılan kalır
    const SVC_HINTS: Record<string, string[]> = {
        curuk: ['kompozit', 'dolgu'], dolgu: ['dolgu', 'kompozit'], kanal: ['kanal'],
        kron: ['kron', 'zirkon'], eksik: ['implant', 'protez'],
    };
    const defaultSvcFor = (statusKey: string) => {
        const hints = SVC_HINTS[statusKey] || [];
        return services.find((s) => hints.some((h) => s.name.toLowerCase().includes(h)))?.id || '';
    };
    // Tahsilat (sağ sütunda kapalı bölüm — birincil akışın parçası değil)
    const [payMethod, setPayMethod] = useState<'Nakit' | 'Kart' | 'Havale'>('Nakit');
    const [payAmount, setPayAmount] = useState('');
    // Taksitlendirme — Finans kartındaki motorun (treatment_installments) aynısı
    const [instPlanId, setInstPlanId] = useState('');
    const [instCount, setInstCount] = useState('3');
    const [instCadence, setInstCadence] = useState<InstallmentCadence>('monthly');
    const defaultFirstDue = useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);
    const [instFirstDue, setInstFirstDue] = useState(defaultFirstDue);
    // Kontrol — kapanışta tek seçim; 'Yok' seçilirse recall yazılmaz
    const [recallOpt, setRecallOpt] = useState('1 ay');

    const fmtTL = (n: number) => `₺${n.toLocaleString('tr-TR')}`;

    const composeChief = () => [...selChips, customChief.trim()].filter(Boolean).join(CHIP_SEP);
    // Tanı elle yazılmaz: odontogram bulgularından türetilir, kayıtlı tanının
    // üzerine (tekrar etmeden) eklenir.
    const composeDiag = () => {
        const auto = findings.filter((f) => f.tooth > 0).map((f) => {
            const st = FINDING_STATUSES.find((s) => s.dental === f.dental);
            return `${f.tooth} — ${st?.l || f.label}${f.surfaces.length ? ` (${f.surfaces.join('')})` : ''}`;
        });
        const base = savedDiag.trim();
        return [...(base ? [base] : []), ...auto.filter((a) => !base.includes(a))].join('; ');
    };
    const examInput = (): DentalVisitExamInput => ({ chiefComplaint: composeChief(), diagnosis: composeDiag(), examinationNote: note });

    // Otomatik kayıt: chip/not değiştikçe 1.2sn sükûnetten sonra yazılır.
    // "Kaydet" butonu yok — hekim kaydetmeyi düşünmek zorunda değil.
    const dirtyRef = useRef(false);
    useEffect(() => {
        if (readOnly || !dirtyRef.current) return;
        const t = window.setTimeout(async () => {
            dirtyRef.current = false;
            setSavingExam(true);
            await onSaveExam(examInput());
            setSavingExam(false);
        }, 1200);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selChips, customChief, note, findings]);
    const markDirty = () => { dirtyRef.current = true; };

    const toggleChip = (chip: string) => {
        if (readOnly) return;
        markDirty();
        setSelChips((p) => p.includes(chip) ? p.filter((c) => c !== chip) : [...p, chip]);
    };

    const addFinding = async () => {
        if (selTooth == null || !selStatus || busy) return;
        const st = FINDING_STATUSES.find((s) => s.k === selStatus)!;
        setBusy(true);
        const ok = await onAddFinding(selTooth, st.dental, selSurf);
        setBusy(false);
        if (!ok) return;
        markDirty(); // tanı bulgudan türediği için muayene notu da güncellenir
        if (selSvcId !== 'none') {
            const svc = services.find((s) => s.id === selSvcId);
            setFindings((p) => [...p, {
                tooth: selTooth,
                label: svc?.name || st.proc,
                surfaces: selSurf,
                price: svc ? (svc.price ?? 0) : st.fee,
                dental: st.dental,
                sessions: Math.min(50, Math.max(1, parseInt(selSessions, 10) || 1)),
            }]);
        }
        setSelTooth(null); setSelStatus(null); setSelSurf([]); setSelSvcId(''); setSelSessions('1');
    };

    // Genel işlem: diş kaydı üretmez, doğrudan teklif kalemi olur
    const addGeneral = () => {
        const svc = services.find((s) => s.id === genSvcId);
        if (!svc) return;
        setFindings((p) => [...p, { tooth: 0, label: svc.name, surfaces: [], price: svc.price ?? 0, dental: 'dolgu', sessions: 1 }]);
        setGenSvcId('');
    };

    // Kalıcı teklif (063): 'proposed' planlar hastaya sunulmuş ama onaylanmamış
    // tekliftir; sayfa yenilense de kaybolmaz, bakiyeye yazılmaz. Onaylanınca
    // 'active' olur. Proposed varsa özet bunlardan türetilir.
    const proposed = useMemo(() => plans.filter((p) => p.status === 'proposed'), [plans]);
    const hasProposed = proposed.length > 0;
    const offerRows: OfferLine[] = hasProposed
        ? proposed.map((p) => { const [tooth, ...rest] = p.title.split(' '); return { tooth: Number(tooth) || 0, label: rest.join(' ') || p.title, price: p.totalAmount, surfaces: [], dental: 'dolgu' as DentalStatus, sessions: p.sessionCount }; })
        : findings;
    const offerLocked = readOnly || hasProposed;
    const offerTotal = offerRows.reduce((s, o) => s + o.price, 0);

    // 064: seans sayacı plan bazında — tamamlanmış plan tüm seanslarıyla sayılır
    // Koltuk başı panel yalnız "bu vizitte iş kalan" planları gösterir:
    // devam eden (active) planlar + bu encounter'da tamamlananlar. Önceki
    // vizitlerde bitmiş planlar aşağıdaki "Geçmiş tedaviler" bölümüne düşer.
    const sessionPlans = plans.filter((p) =>
        p.status === 'active' || (p.status === 'completed' && !!encounter && p.encounterId === encounter.id));
    const archivedPlans = plans.filter((p) =>
        p.status === 'completed' && !(encounter && p.encounterId === encounter.id));
    const planDone = (p: (typeof plans)[number]) => p.status === 'completed' ? p.sessionCount : Math.min(p.sessionsDone, p.sessionCount);
    const sessionsTotal = sessionPlans.reduce((s, p) => s + p.sessionCount, 0);
    const sessionsDone = sessionPlans.reduce((s, p) => s + planDone(p), 0);
    const nextSession = sessionPlans.find((p) => p.status === 'active');

    const propose = async () => {
        if (busy || findings.length === 0) return;
        setBusy(true);
        await onSaveExam(examInput());
        const ok = await onPropose(findings);
        setBusy(false);
        if (ok) {
            // Kalemler artık kalıcı 'proposed' planlarda yaşıyor; yerel listeyi
            // temizle ki onay sonrasında aynı teklif ikinci kez sunulamasın.
            setFindings([]);
            toast.success('Teklif sunuldu — hasta onayı bekleniyor');
        }
    };

    const approve = async () => {
        if (busy || offerRows.length === 0) return;
        setBusy(true);
        const ok = await onApprove(findings);
        setBusy(false);
        if (ok) {
            setFindings([]);
            toast.success('Tedavi planı onaylandı');
        }
    };

    // Boş bırakılırsa tüm kalan bakiye tahsil edilir (v6 davranışı)
    const payAmountValue = payAmount !== '' ? payAmount : (financial.balance > 0 ? financial.balance.toLocaleString('tr-TR') : '');
    const collect = async () => {
        const raw = payAmount.trim() ? payAmount : String(financial.balance);
        const amt = Math.min(parseInt(raw.replace(/\D/g, ''), 10) || 0, financial.balance);
        if (amt <= 0 || busy) { if (amt <= 0) toast.error('Geçerli bir tutar girin'); return; }
        setBusy(true);
        const ok = await onCollect(amt, PAY_METHOD_MAP[payMethod]);
        setBusy(false);
        if (ok) { setPayAmount(''); toast.success(`${fmtTL(amt)} tahsil edildi · ${payMethod}`); }
    };

    // Etkin taksit hedefi: seçim yoksa ilk uygun plan
    const instTarget = installmentTargets.find((t) => t.id === instPlanId) || installmentTargets[0];
    const instCountNum = parseInt(instCount, 10) || 0;
    const scheduleInstallments = async () => {
        if (busy || !instTarget || instCountNum < 2) return;
        setBusy(true);
        const ok = await onCreateInstallments(instTarget.id, instCountNum, instFirstDue, instCadence);
        setBusy(false);
        if (ok) { setInstPlanId(''); setInstCount('3'); }
    };

    // Geçmişte kalmış kontrol tarihi "planlı" sayılmaz — hasta recall
    // döngüsünden düşmesin diye yeni kontrol seçilebilir olmalı.
    const recallActive = Boolean(customer.recallDate && customer.recallDate >= todayISO());
    const recallDate = useMemo(() => { const d = new Date(); RECALL_OPTS.find((o) => o.k === recallOpt)?.add(d); return d; }, [recallOpt]);
    const recallDateStr = recallDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const recallDateISO = `${recallDate.getFullYear()}-${String(recallDate.getMonth() + 1).padStart(2, '0')}-${String(recallDate.getDate()).padStart(2, '0')}`;

    const advance = async (fn: () => Promise<void> | Promise<boolean>) => {
        if (busy) return;
        setBusy(true);
        await fn();
        setBusy(false);
    };

    // Bekleyen hastayı tek dokunuşla koltuğa al: geliş + muayene başlangıcı
    // ayrı adımlar değil, tek eylemin iki saat damgası.
    const startChair = () => advance(async () => {
        if (!arrived) await onArrived();
        await onStartVisit();
    });

    // Tek kapanış: notları yaz, (seçiliyse) kontrolü planla, viziti tamamla.
    // Karşılama/tahsilat/recall ayrı "adımlar" değil; kapanışın yan etkileri.
    const closeVisit = () => advance(async () => {
        if (!readOnly && !visitCompleted) {
            const hasExam = composeChief() || composeDiag() || note.trim();
            if (hasExam) await onSaveExam(examInput());
            if (recallOpt !== 'Yok' && !recallActive) await onSetRecall(recallDateISO);
            await onCompleteVisit();
        }
        onClose();
    });

    // wa.me deep-link'i sendWA kapısını (opt-out, kota, wa_message_log)
    // atlıyordu — gönderim artık remind fonksiyonunun manuel modundan geçer.
    // Tarih önce kaydedilir ki gönderilen hatırlatma planlanan kontrole bağlansın.
    const openWhatsApp = () => advance(async () => {
        if (!patientPhone) return;
        await onSetRecall(recallDateISO);
        const res = await sendRecallReminder(customer.id);
        if (res.ok) toast.success(res.queued
            ? 'Bağlantı şu an sorunlu — hatırlatma kuyruğa alındı, birazdan gönderilecek'
            : 'Kontrol hatırlatması WhatsApp\'tan gönderildi');
        else if (res.reason === 'no_whatsapp') toast.error('WhatsApp bağlı değil — Ayarlar → WhatsApp bölümünden bağlayın');
        else toast.error('Hatırlatma gönderilemedi');
    });

    const colorForTooth = (n: number): string => {
        const f = [...findings].reverse().find((x) => x.tooth === n);
        if (f) return FINDING_STATUSES.find((s) => s.dental === f.dental)?.color || 'var(--dc-surface3)';
        const rec = dentalCurrent.get(n);
        return rec && rec.status !== 'saglam' ? (STATUS_TO_COLOR[rec.status] || 'var(--dc-surface3)') : 'var(--dc-surface3)';
    };

    const ToothCell = ({ n }: { n: number }) => {
        const color = colorForTooth(n);
        const filled = color !== 'var(--dc-surface3)';
        const top = n < 30;
        return (
            <button disabled={readOnly} onClick={() => { setSelTooth(n); setSelStatus(null); setSelSurf([]); }}
                aria-label={`Diş ${n}`}
                className={cn('w-9 flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors disabled:cursor-not-allowed',
                    selTooth === n ? 'bg-[rgba(255,90,31,.1)] ring-1 ring-[var(--dc-orange)]' : 'bg-[var(--dc-surface2)] hover:bg-[var(--dc-surface3)]')}>
                {top && <span className="font-mono text-[10px] font-bold text-[var(--dc-muted)]">{n}</span>}
                <span className="w-3.5 h-3.5 rounded-[3px]" style={{ background: filled ? color : 'transparent', border: filled ? 'none' : '1.5px solid var(--dc-border2)' }} />
                {!top && <span className="font-mono text-[10px] font-bold text-[var(--dc-muted)]">{n}</span>}
            </button>
        );
    };

    const STAGE_META = {
        waiting: { label: 'Bekliyor', cls: 'bg-[var(--dc-surface3)] text-[var(--dc-muted)]' },
        chair: { label: 'Koltukta', cls: 'bg-[var(--dc-orange)] text-white' },
        done: { label: 'Tamamlandı', cls: 'bg-[var(--dc-green)] text-white' },
    } as const;

    const primaryStyle = 'inline-flex items-center justify-center rounded-full bg-[var(--dc-orange)] px-6 h-12 text-[13px] font-extrabold text-white transition-colors hover:brightness-95 disabled:opacity-40';
    const sectionLabel = 'text-[10px] font-bold uppercase tracking-[.08em] text-[var(--dc-muted)]';

    return (
        <div className="mx-auto w-full max-w-[1432px] px-3 py-4 space-y-4">
            {/* Başlık: hasta + durum pill'i + bağlam. Adım şeridi yok. */}
            <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)]">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <button onClick={onClose} aria-label="Geri" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)] hover:text-[var(--dc-ink)] transition-colors"><ArrowLeft size={16} /></button>
                    <button onClick={onOpenPatientFile} className="text-[18px] font-extrabold tracking-[-0.02em] text-[var(--dc-ink)] hover:text-[var(--dc-orange)] transition-colors">{customer.name}</button>
                    <span className={cn('inline-flex items-center rounded-full px-3 h-7 text-[11px] font-extrabold', STAGE_META[stage].cls)}>{STAGE_META[stage].label}</span>
                    <span className="text-[11.5px] font-semibold text-[var(--dc-muted)]">{reservation.date} · {reservation.startTime}–{reservation.endTime} · {reservation.service}</span>
                    {medical.map((m) => (
                        <span key={m} className="inline-flex items-center gap-1 rounded-full bg-[var(--dc-red-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--dc-red2)]"><AlertTriangle size={12} />{m}</span>
                    ))}
                    <div className="ml-auto flex items-center gap-5">
                        {stage === 'waiting' && !readOnly && (
                            <button disabled={busy} onClick={startChair} className={cn(primaryStyle, 'h-10 px-5')}>Hastayı Koltuğa Al</button>
                        )}
                        <div className="text-right"><div className={sectionLabel}>Kalan bakiye</div><div className={cn('font-mono text-[15px] font-black', financial.balance > 0 ? 'text-[var(--dc-red2)]' : 'text-[var(--dc-muted2)]')}>{fmtTL(financial.balance)}</div></div>
                        <div className="text-right"><div className={sectionLabel}>Hekim</div><div className="text-[13px] font-bold text-[var(--dc-ink)]">{doctorName || '—'}</div></div>
                        {reservation.resourceName && <div className="text-right"><div className={sectionLabel}>Ünite</div><div className="font-mono text-[13px] font-bold text-[var(--dc-ink)]">{reservation.resourceName}</div></div>}
                    </div>
                </div>
            </div>

            {/* Salt-okunur kilidi — sessiz kalmasın, nedeni ve çözümü göster */}
            {readOnly && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--dc-amber)]/30 bg-[var(--dc-amber-bg)] px-4 py-3">
                    <AlertTriangle size={16} className="text-[var(--dc-amber)] flex-shrink-0" />
                    <p className="flex-1 min-w-[200px] text-[12px] font-semibold text-[var(--dc-amber)]">
                        {readOnlyReason || 'Bu ziyaret salt-okunur — klinik kayıt yalnız aktif hekim rolüyle düzenlenebilir.'}
                    </p>
                    <button onClick={onOpenStaff} className="inline-flex h-9 items-center rounded-full bg-[var(--dc-amber)] px-4 text-[11.5px] font-extrabold text-white">Personel ayarlarını aç →</button>
                </div>
            )}

            {/* Çalışma alanı: sol = giriş (şikayet + odontogram), sağ = sonuç (canlı teklif) */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
                <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)]">
                    {/* Şikayet — tek tık chip'ler; klavye yalnız "Diğer"de */}
                    <div className="px-5 pt-5 pb-4 border-b border-[var(--dc-border)]">
                        <div className="flex items-center gap-2 mb-2.5">
                            <span className={sectionLabel}>Şikayet</span>
                            {savingExam && <span className="text-[10px] font-semibold text-[var(--dc-muted2)]">kaydediliyor…</span>}
                            {!savingExam && (selChips.length > 0 || customChief) && <span className="text-[10px] font-semibold text-[var(--dc-green)]">✓ otomatik kaydedilir</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {COMPLAINT_CHIPS.map((chip) => {
                                const on = selChips.includes(chip);
                                return (
                                    <button key={chip} disabled={readOnly} onClick={() => toggleChip(chip)}
                                        className={cn('px-3.5 h-9 rounded-full text-[12.5px] font-bold border transition-colors disabled:cursor-not-allowed',
                                            on ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]' : 'bg-[var(--dc-surface)] text-[var(--dc-muted)] border-[var(--dc-border2)] hover:text-[var(--dc-ink)] hover:border-[var(--dc-ink)]')}>
                                        {chip}
                                    </button>
                                );
                            })}
                            <button disabled={readOnly} onClick={() => setShowCustom((v) => !v)}
                                className={cn('px-3.5 h-9 rounded-full text-[12.5px] font-bold border border-dashed transition-colors',
                                    showCustom ? 'text-[var(--dc-ink)] border-[var(--dc-ink)]' : 'text-[var(--dc-muted2)] border-[var(--dc-border2)] hover:text-[var(--dc-ink)]')}>
                                + Diğer
                            </button>
                        </div>
                        {showCustom && (
                            <input value={customChief} readOnly={readOnly} onChange={(e) => { markDirty(); setCustomChief(e.target.value); }}
                                placeholder="Listede olmayan şikayet…"
                                className="mt-2.5 h-10 w-full max-w-[420px] rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-3.5 text-[13px] text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]" />
                        )}
                    </div>

                    {/* Odontogram — tanı buradan türer, ayrı tanı kutusu yok */}
                    <div className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className={sectionLabel}>Odontogram — dişe tıklayın, bulgu tanıya ve teklife dönüşür</span>
                            <span className="text-[11px] font-semibold text-[var(--dc-muted2)]">{dentalCount} kayıtlı · {plannedCount} planlı</span>
                        </div>
                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mb-4">
                            {FINDING_STATUSES.map((s) => (
                                <span key={s.k} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--dc-muted)]"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.k === 'eksik' ? 'transparent' : s.color, border: s.k === 'eksik' ? '1.5px dashed var(--dc-muted2)' : 'none' }} />{s.l}</span>
                            ))}
                        </div>
                        <div className="overflow-x-auto">
                            <div className="flex flex-col items-center gap-1.5 min-w-[820px]">
                                {[ODONTO_TOP, ODONTO_BOT].map((rowNums, ri) => (
                                    <div key={ri} className="flex gap-1">
                                        {rowNums.map((n, idx) => (
                                            <div key={n} className="flex">{idx === 8 && <span className="w-3" />}<ToothCell n={n} /></div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {selTooth != null && (
                            <div className="mt-4 rounded-2xl bg-[var(--dc-surface2)] border border-[var(--dc-border)] p-4" style={{ animation: 'dc-panel-in 180ms ease' }}>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-[14px] font-extrabold text-[var(--dc-ink)]">Diş {selTooth}</span>
                                    <span className="text-[11px] font-semibold text-[var(--dc-muted)]">{toothTypeLabel(selTooth)}</span>
                                    <button onClick={() => setSelTooth(null)} aria-label="Kapat" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-[var(--dc-muted)] hover:bg-[var(--dc-surface3)]">✕</button>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
                                    <div>
                                        <div className={cn(sectionLabel, 'mb-2')}>Durum</div>
                                        <div className="flex flex-wrap gap-1.5 mb-3">
                                            {FINDING_STATUSES.map((s) => (
                                                <button key={s.k} onClick={() => { setSelStatus(s.k); setSelSvcId(defaultSvcFor(s.k)); }}
                                                    className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold border transition-all',
                                                        selStatus === s.k ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]' : 'bg-[var(--dc-surface)] text-[var(--dc-muted)] border-[var(--dc-border)] hover:text-[var(--dc-ink)]')}>
                                                    <span className="w-2 h-2 rounded-[2px]" style={{ background: s.color }} />{s.l}
                                                </button>
                                            ))}
                                        </div>
                                        {selStatus && services.length > 0 && (
                                            <div className="mb-3 flex flex-wrap items-end gap-2">
                                                <div className="flex-1 min-w-[200px] max-w-[340px]">
                                                    <div className={cn(sectionLabel, 'mb-1.5')}>Önerilen işlem</div>
                                                    <select value={selSvcId} onChange={(e) => setSelSvcId(e.target.value)} aria-label="Önerilen işlem"
                                                        className="w-full h-10 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface)] px-3 text-[12.5px] font-semibold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]">
                                                        <option value="">{FINDING_STATUSES.find((s) => s.k === selStatus)?.proc} · ₺{FINDING_STATUSES.find((s) => s.k === selStatus)?.fee.toLocaleString('tr-TR')} (varsayılan)</option>
                                                        {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.price ? ` · ₺${s.price.toLocaleString('tr-TR')}` : ''}</option>)}
                                                        <option value="none">İşlem önerme — yalnız kayıt</option>
                                                    </select>
                                                </div>
                                                {selSvcId !== 'none' && (
                                                    <div>
                                                        <div className={cn(sectionLabel, 'mb-1.5')}>Seans</div>
                                                        <input value={selSessions} onChange={(e) => setSelSessions(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" aria-label="Seans sayısı"
                                                            className="w-14 h-10 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface)] text-center font-mono text-[13px] font-bold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]" />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <button disabled={!selStatus || busy} onClick={addFinding} className={cn(primaryStyle, 'w-full sm:w-auto')}>Bulgu Ekle</button>
                                        <p className="mt-2 text-[11px] text-[var(--dc-muted2)]">Bulgu; tanıya yazılır, sağdaki teklife kalem olarak düşer. Aynı dişe birden fazla bulgu eklenebilir.</p>
                                    </div>
                                    <div>
                                        <div className={cn(sectionLabel, 'mb-2')}>Yüzey (MODBL)</div>
                                        <div className="grid gap-1" style={{ gridTemplateColumns: '40px 40px 40px', gridTemplateRows: '40px 40px 40px', gridTemplateAreas: "'. b .' 'm o d' '. l .'" }} role="group" aria-label="Yüzey seçici">
                                            {SURF_LAYOUT.map(({ s, area, label }) => {
                                                const on = selSurf.includes(s);
                                                return <button key={s} title={label} aria-label={label} onClick={() => setSelSurf((p) => on ? p.filter((x) => x !== s) : [...p, s])}
                                                    className={cn('rounded-[9px] text-[13px] font-extrabold border transition-all', on ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]' : 'bg-[var(--dc-surface)] text-[var(--dc-muted)] border-[var(--dc-border2)] hover:border-[var(--dc-ink)]')}
                                                    style={{ gridArea: area }}>{s}</button>;
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Periodontal şema — açılınca yüklenir (perio verisi her vizitte gerekmez) */}
                    <details className="border-t border-[var(--dc-border)] group" onToggle={(e) => setPerioOpen((e.currentTarget as HTMLDetailsElement).open)}>
                        <summary className="flex items-center gap-2 px-5 py-3.5 cursor-pointer select-none text-[12px] font-bold text-[var(--dc-muted)] hover:text-[var(--dc-ink)] transition-colors list-none [&::-webkit-details-marker]:hidden">
                            <span className="transition-transform group-open:rotate-90">▸</span> Periodontal şema
                        </summary>
                        {perioOpen && <div className="px-3 pb-4">
                            <PerioChart customerId={customer.id} staffId={doctorId} />
                        </div>}
                    </details>

                    {/* Klinik not — %95 boş kalır; varsayılan kapalı */}
                    <details className="border-t border-[var(--dc-border)] group" open={Boolean(savedNote)}>
                        <summary className="flex items-center gap-2 px-5 py-3.5 cursor-pointer select-none text-[12px] font-bold text-[var(--dc-muted)] hover:text-[var(--dc-ink)] transition-colors list-none [&::-webkit-details-marker]:hidden">
                            <span className="transition-transform group-open:rotate-90">▸</span> Klinik not ekle
                            {note.trim() && <span className="text-[10px] font-semibold text-[var(--dc-green)]">✓ dolu</span>}
                        </summary>
                        <div className="px-5 pb-4">
                            <textarea value={note} readOnly={readOnly} onChange={(e) => { markDirty(); setNote(e.target.value); }} rows={3}
                                placeholder={readOnly ? 'Salt-okunur — düzenlemek için hekim rolü gerekir' : 'Serbest klinik not… (opsiyonel)'}
                                className={cn('w-full rounded-xl border border-[var(--dc-border2)] px-3.5 py-2.5 text-[13px] text-[var(--dc-ink)] outline-none resize-y',
                                    readOnly ? 'bg-[var(--dc-surface3)]/40 cursor-not-allowed opacity-70' : 'bg-[var(--dc-surface2)] focus:border-[var(--dc-orange)]')} />
                        </div>
                    </details>
                </div>

                {/* Sağ sütun: vizit özeti — bulgular canlı teklife dönüşür */}
                <aside className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] lg:sticky lg:top-4">
                    <div className="px-4 pt-4 pb-3 border-b border-[var(--dc-border)] flex items-center justify-between">
                        <span className="text-[13px] font-extrabold text-[var(--dc-ink)]">Vizit özeti</span>
                        <button onClick={onOpenPatientFile} className="text-[11.5px] font-bold text-[var(--dc-orange)]">Hasta dosyası →</button>
                    </div>
                    <div className="p-4 space-y-3">
                        {/* Tanı — odontogram bulgularından türetilen metin burada okunur kalır */}
                        {composeDiag() && (
                            <div>
                                <div className={cn(sectionLabel, 'mb-1')}>Tanı</div>
                                <p className="text-[12px] leading-5 font-semibold text-[var(--dc-ink)]">{composeDiag()}</p>
                            </div>
                        )}

                        {hasProposed && (
                            <div className="flex items-center gap-2 rounded-xl bg-[var(--dc-amber-bg)] px-3 py-2.5 text-[11.5px] font-bold text-[var(--dc-amber)]"><Clock size={13} />Teklif sunuldu — hasta onayı bekleniyor</div>
                        )}
                        {offerRows.length === 0 && sessionPlans.length === 0 && (
                            <div className="rounded-xl border border-dashed border-[var(--dc-border2)] p-5 text-center text-[11.5px] text-[var(--dc-muted)]">Henüz bulgu yok. Odontogramdan bir dişe tıklayın; her bulgu buraya teklif kalemi olarak düşer.</div>
                        )}
                        {offerRows.length > 0 && (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    {offerRows.map((o, i) => (
                                        <div key={i} className="flex items-center gap-2 rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border)] px-2.5 py-2">
                                            <span className="font-mono text-[10px] font-bold px-1.5 py-1 rounded-md bg-[var(--dc-surface3)] text-[var(--dc-muted)] flex-shrink-0">{o.tooth > 0 ? `${o.tooth}${o.surfaces.length ? `·${o.surfaces.join('')}` : ''}` : 'GNL'}</span>
                                            <span className="flex-1 min-w-0 text-[12px] font-bold text-[var(--dc-ink)] truncate">{o.label}{o.sessions > 1 && <span className="font-mono text-[10px] font-bold text-[var(--dc-muted2)]"> · {o.sessions} seans</span>}</span>
                                            <div className="flex items-center gap-1 rounded-lg bg-[var(--dc-surface)] border border-[var(--dc-border2)] px-2 h-8">
                                                <span className="text-[11px] text-[var(--dc-muted)]">₺</span>
                                                <input value={o.price.toLocaleString('tr-TR')} inputMode="numeric" readOnly={offerLocked}
                                                    onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0; setFindings((p) => p.map((x, j) => j === i ? { ...x, price: v } : x)); }}
                                                    className="w-16 bg-transparent text-right font-mono text-[12px] font-bold text-[var(--dc-ink)] outline-none" />
                                            </div>
                                            {!offerLocked && <button onClick={() => setFindings((p) => p.filter((_, j) => j !== i))} aria-label="Sil" className="grid h-7 w-7 place-items-center rounded-lg text-[var(--dc-muted2)] hover:bg-[var(--dc-surface3)] hover:text-[var(--dc-red2)]">✕</button>}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-baseline justify-between pt-1"><span className={sectionLabel}>Teklif toplamı</span><span className="font-mono text-[19px] font-black text-[var(--dc-ink)]">{fmtTL(offerTotal)}</span></div>
                            </>
                        )}

                        {/* Dişe bağlı olmayan işlem (detertraj, hijyen…) — kataloğdan teklife düşer */}
                        {!offerLocked && services.length > 0 && (
                            <div className="flex gap-1.5">
                                <select value={genSvcId} onChange={(e) => setGenSvcId(e.target.value)} aria-label="Genel işlem"
                                    className="flex-1 min-w-0 h-9 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-2.5 text-[11.5px] font-semibold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]">
                                    <option value="">+ Genel işlem (dişsiz)…</option>
                                    {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.price ? ` · ₺${s.price.toLocaleString('tr-TR')}` : ''}</option>)}
                                </select>
                                <button disabled={!genSvcId} onClick={addGeneral} className="flex-shrink-0 inline-flex h-9 items-center rounded-full border border-[var(--dc-border2)] px-3 text-[11.5px] font-extrabold text-[var(--dc-ink)] hover:border-[var(--dc-ink)] disabled:opacity-40 transition-colors">Ekle</button>
                            </div>
                        )}

                        {!readOnly && !hasProposed && findings.length > 0 && (
                            <button disabled={busy} onClick={propose} className={cn(primaryStyle, 'w-full')}>Teklifi Onaya Sun</button>
                        )}
                        {!readOnly && hasProposed && (
                            <button disabled={busy} onClick={approve} className={cn(primaryStyle, 'w-full')}>Hasta Onayladı</button>
                        )}

                        {/* Onaylı tedavi planı — kalemler durum rozetiyle kalıcı görünür,
                            teklif onaylanınca özetten kaybolmaz */}
                        {sessionPlans.length > 0 && (
                            <div className="rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border)] p-3">
                                <div className="flex items-baseline justify-between mb-1.5">
                                    <span className={sectionLabel}>Tedavi planı · Seanslar</span>
                                    <span className="font-mono text-[12px] font-black text-[var(--dc-ink)]">{sessionsDone}/{sessionsTotal}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--dc-surface3)] overflow-hidden mb-2"><div className="h-full rounded-full bg-[var(--dc-orange)]" style={{ width: `${(sessionsDone / (sessionsTotal || 1)) * 100}%` }} /></div>
                                <div className="flex flex-col gap-1">
                                    {sessionPlans.map((p) => {
                                        const isDone = p.status === 'completed';
                                        return (
                                            <div key={p.id} className="flex items-center gap-2">
                                                <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold flex-shrink-0', isDone ? 'bg-[var(--dc-green)] text-white' : 'bg-[var(--dc-surface3)] text-[var(--dc-muted)]')}>{isDone ? '✓' : ''}</span>
                                                <span className="flex-1 min-w-0 text-[11.5px] font-semibold text-[var(--dc-ink)] truncate">{p.title}</span>
                                                {p.sessionCount > 1 && <span className="font-mono text-[10px] font-bold text-[var(--dc-muted2)] flex-shrink-0">{planDone(p)}/{p.sessionCount}</span>}
                                                <span className="font-mono text-[11px] font-bold text-[var(--dc-muted)]">{fmtTL(p.totalAmount)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {nextSession && !readOnly && (
                                    <button disabled={busy} onClick={() => advance(() => onCompleteSession(nextSession.id))} className="mt-2.5 inline-flex h-9 w-full items-center justify-center rounded-full bg-[var(--dc-ink)] px-3 text-[11.5px] font-extrabold text-white">
                                        Seansı Tamamla — {nextSession.title}{nextSession.sessionCount > 1 ? ` (${planDone(nextSession) + 1}/${nextSession.sessionCount})` : ''}
                                    </button>
                                )}
                                {!nextSession && <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--dc-green)]"><CheckCircle2 size={13} />Tüm seanslar tamamlandı</div>}
                            </div>
                        )}

                        {/* Ödeme dökümü — toplam/ödenen/kalan her durumda görünür */}
                        {financial.totalAmount > 0 && (
                            <div className="rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border)] p-3 space-y-1.5">
                                <div className="flex items-baseline justify-between text-[11.5px]"><span className="font-semibold text-[var(--dc-muted)]">Toplam</span><span className="font-mono font-bold text-[var(--dc-ink)]">{fmtTL(financial.totalAmount)}</span></div>
                                <div className="flex items-baseline justify-between text-[11.5px]"><span className="font-semibold text-[var(--dc-muted)]">Ödenen</span><span className="font-mono font-bold text-[var(--dc-green)]">{fmtTL(financial.paidAmount)}</span></div>
                                <div className="flex items-baseline justify-between text-[11.5px] border-t border-[var(--dc-border)] pt-1.5"><span className="font-semibold text-[var(--dc-muted)]">Kalan</span><span className={cn('font-mono font-black', financial.balance > 0 ? 'text-[var(--dc-red2)]' : 'text-[var(--dc-muted2)]')}>{fmtTL(financial.balance)}</span></div>
                                {(financial.overdueAmount ?? 0) > 0 && (
                                    <div className="flex items-baseline justify-between text-[10.5px]"><span className="font-semibold text-[var(--dc-red2)]">Gecikmiş vade</span><span className="font-mono font-bold text-[var(--dc-red2)]">{fmtTL(financial.overdueAmount!)}</span></div>
                                )}
                                {financial.nextDueDate && (
                                    <div className="flex items-baseline justify-between text-[10.5px]"><span className="font-semibold text-[var(--dc-muted)]">Sonraki vade</span><span className="font-mono font-bold text-[var(--dc-ink)]">{financial.nextDueDate}</span></div>
                                )}
                            </div>
                        )}

                        {/* Tahsilat: birincil akışta değil — bakiye varsa kapalı bölüm.
                            Asıl tahsilat yeri Kasa; bu, koltuk başı hızlı tahsilat içindir. */}
                        {financial.balance > 0 && !readOnly && (
                            <details className="rounded-xl border border-[var(--dc-border)] group">
                                <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                    <span className="text-[11.5px] font-bold text-[var(--dc-muted)] group-hover:text-[var(--dc-ink)]"><span className="inline-block transition-transform group-open:rotate-90">▸</span> Hızlı tahsilat</span>
                                    <span className="font-mono text-[12px] font-black text-[var(--dc-red2)]">{fmtTL(financial.balance)}</span>
                                </summary>
                                <div className="px-3 pb-3 space-y-2">
                                    <div className="flex items-center gap-1.5 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-3 h-10 focus-within:border-[var(--dc-orange)]">
                                        <span className="text-[12px] text-[var(--dc-muted)]">₺</span>
                                        <input value={payAmountValue} onChange={(e) => setPayAmount(e.target.value)} inputMode="numeric"
                                            className="flex-1 min-w-0 bg-transparent text-right font-mono text-[14px] font-bold text-[var(--dc-ink)] outline-none" />
                                    </div>
                                    <div className="flex gap-1">
                                        {(['Nakit', 'Kart', 'Havale'] as const).map((m) => (
                                            <button key={m} onClick={() => setPayMethod(m)} className={cn('flex-1 h-8 rounded-full text-[11px] font-bold transition-colors border', payMethod === m ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]' : 'text-[var(--dc-muted)] border-[var(--dc-border2)] hover:text-[var(--dc-ink)]')}>{m}</button>
                                        ))}
                                    </div>
                                    <button disabled={busy} onClick={collect} className={cn(primaryStyle, 'w-full h-10')}>Tahsil Et</button>
                                </div>
                            </details>
                        )}

                        {/* Taksitlendirme — kalan bakiyeyi vadelere böler; tahsilat yine
                            Kasa/hızlı tahsilat üzerinden vade bazında yapılır */}
                        {!readOnly && installmentsAvailable && installmentTargets.length > 0 && (
                            <details className="rounded-xl border border-[var(--dc-border)] group">
                                <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                    <span className="text-[11.5px] font-bold text-[var(--dc-muted)] group-hover:text-[var(--dc-ink)]"><span className="inline-block transition-transform group-open:rotate-90">▸</span> Taksitlendir</span>
                                    <span className="text-[10.5px] font-semibold text-[var(--dc-muted2)]">{installmentTargets.length} plan uygun</span>
                                </summary>
                                <div className="px-3 pb-3 space-y-2">
                                    {installmentTargets.length > 1 && (
                                        <select value={instTarget?.id || ''} onChange={(e) => setInstPlanId(e.target.value)} aria-label="Taksitlenecek plan"
                                            className="w-full h-9 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-2.5 text-[11.5px] font-semibold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]">
                                            {installmentTargets.map((t) => <option key={t.id} value={t.id}>{t.title} · kalan {fmtTL(t.remaining)}</option>)}
                                        </select>
                                    )}
                                    {installmentTargets.length === 1 && instTarget && (
                                        <div className="flex items-baseline justify-between text-[11.5px]"><span className="font-semibold text-[var(--dc-ink)] truncate">{instTarget.title}</span><span className="font-mono font-bold text-[var(--dc-muted)]">{fmtTL(instTarget.remaining)}</span></div>
                                    )}
                                    <div className="flex gap-1.5">
                                        <input value={instCount} onChange={(e) => setInstCount(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" aria-label="Taksit sayısı"
                                            className="w-14 h-9 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] text-center font-mono text-[12px] font-bold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]" />
                                        <div className="flex flex-1 rounded-full border border-[var(--dc-border2)] p-0.5 gap-0.5">
                                            {([['monthly', 'Aylık'], ['weekly', 'Haftalık']] as const).map(([k, l]) => (
                                                <button key={k} onClick={() => setInstCadence(k)} className={cn('flex-1 h-7 rounded-full text-[11px] font-bold transition-colors', instCadence === k ? 'bg-[var(--dc-ink)] text-white' : 'text-[var(--dc-muted)] hover:text-[var(--dc-ink)]')}>{l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <label className="block">
                                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.06em] text-[var(--dc-muted)]">İlk vade</span>
                                        <input type="date" value={instFirstDue} onChange={(e) => setInstFirstDue(e.target.value)}
                                            className="w-full h-9 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-2.5 text-[12px] font-semibold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]" />
                                    </label>
                                    {instTarget && instCountNum >= 2 && (
                                        <p className="text-[10.5px] text-[var(--dc-muted2)]">{instCountNum} × ~{fmtTL(Math.ceil(instTarget.remaining / instCountNum))} · hatırlatmalar vadeden önce otomatik</p>
                                    )}
                                    <button disabled={busy || !instTarget || instCountNum < 2} onClick={scheduleInstallments} className={cn(primaryStyle, 'w-full h-10 bg-[var(--dc-ink)]')}>Taksit Planla</button>
                                </div>
                            </details>
                        )}

                        {/* Geçmiş tedaviler — önceki vizitlerde biten planlar; bu vizitin
                            akışını kalabalıklaştırmasın diye kapalı durur */}
                        {archivedPlans.length > 0 && (
                            <details className="rounded-xl border border-[var(--dc-border)] group">
                                <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                    <span className="text-[11.5px] font-bold text-[var(--dc-muted)] group-hover:text-[var(--dc-ink)]"><span className="inline-block transition-transform group-open:rotate-90">▸</span> Geçmiş tedaviler</span>
                                    <span className="text-[10.5px] font-semibold text-[var(--dc-muted2)]">{archivedPlans.length}</span>
                                </summary>
                                <div className="px-3 pb-3 flex flex-col gap-1">
                                    {archivedPlans.map((p) => (
                                        <div key={p.id} className="flex items-center gap-2">
                                            <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--dc-surface3)] text-[10px] font-extrabold text-[var(--dc-green)] flex-shrink-0">✓</span>
                                            <span className="flex-1 min-w-0 text-[11.5px] font-semibold text-[var(--dc-ink)] truncate">{p.title}</span>
                                            <span className="font-mono text-[11px] font-bold text-[var(--dc-muted)]">{fmtTL(p.totalAmount)}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}

                        {/* Geçmiş vizitler — encounter tabanlı özet; detay hasta dosyasında */}
                        {pastVisits.length > 0 && (
                            <details className="rounded-xl border border-[var(--dc-border)] group">
                                <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                    <span className="text-[11.5px] font-bold text-[var(--dc-muted)] group-hover:text-[var(--dc-ink)]"><span className="inline-block transition-transform group-open:rotate-90">▸</span> Geçmiş vizitler</span>
                                    <span className="text-[10.5px] font-semibold text-[var(--dc-muted2)]">{pastVisits.length}</span>
                                </summary>
                                <div className="px-3 pb-3 space-y-1.5">
                                    {pastVisits.map((v) => (
                                        <div key={v.id} className="flex items-baseline gap-2 text-[11px]">
                                            <span className="font-mono font-bold text-[var(--dc-muted2)] flex-shrink-0">{new Date(v.dateISO).toLocaleDateString('tr-TR')}</span>
                                            <span className="flex-1 min-w-0 truncate font-semibold text-[var(--dc-ink)]">{v.label}</span>
                                            {v.status === 'completed' && <span className="text-[var(--dc-green)] flex-shrink-0">✓</span>}
                                        </div>
                                    ))}
                                    <button onClick={onOpenPatientFile} className="text-[11px] font-bold text-[var(--dc-orange)]">Tümü — hasta dosyası →</button>
                                </div>
                            </details>
                        )}
                    </div>
                </aside>
            </div>

            {/* Kapanış: kontrol seçimi + tek buton. Recall/WhatsApp/tamamlama yan etki. */}
            <div className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                    {recallActive ? (
                        <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--dc-green)]"><CheckCircle2 size={15} />Kontrol planlandı: <span className="font-mono">{customer.recallDate}</span></div>
                    ) : (
                        <>
                            <span className={sectionLabel}>Kontrol</span>
                            <div className="flex flex-wrap gap-1.5">
                                {[...RECALL_OPTS.map((o) => o.k), 'Yok'].map((k) => (
                                    <button key={k} disabled={readOnly} onClick={() => setRecallOpt(k)}
                                        className={cn('px-3.5 h-9 rounded-full text-[12px] font-bold border transition-colors',
                                            recallOpt === k ? 'bg-[var(--dc-ink)] text-white border-[var(--dc-ink)]' : 'bg-[var(--dc-surface)] text-[var(--dc-muted)] border-[var(--dc-border2)] hover:text-[var(--dc-ink)]')}>
                                        {k}
                                    </button>
                                ))}
                            </div>
                            {recallOpt !== 'Yok' && <span className="font-mono text-[11.5px] font-bold text-[var(--dc-muted)]">→ {recallDateStr}</span>}
                        </>
                    )}
                    <div className="ml-auto flex items-center gap-2.5">
                        {!readOnly && !visitCompleted && recallOpt !== 'Yok' && !recallActive && patientPhone && (
                            <button disabled={busy} onClick={openWhatsApp} className="inline-flex items-center justify-center rounded-full border border-[var(--dc-border2)] px-4 h-12 text-[12.5px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">WhatsApp ile Hatırlat</button>
                        )}
                        <button disabled={busy} onClick={closeVisit} className={primaryStyle}>
                            {visitCompleted || readOnly ? 'Kapat' : 'Viziti Bitir'}
                        </button>
                    </div>
                </div>
                {!recallActive && !readOnly && !visitCompleted && recallOpt !== 'Yok' && (
                    <p className="mt-2 text-[11px] text-[var(--dc-muted2)]">"Viziti Bitir" notları kaydeder, kontrolü planlar ve ziyareti kapatır. Hatırlatma, kontrol tarihinden 2 gün önce otomatik gönderilir.</p>
                )}
            </div>
        </div>
    );
}

export function DentalVisitPage() {
    const navigate = useNavigate();
    const { reservationId = '' } = useParams<{ reservationId: string }>();
    const { sector, isLoading: labelsLoading } = useLabels();
    const {
        reservations, isLoading: reservationsLoading, fetchReservationById,
        ensureReservationCustomer, updateReservation, settings,
    } = useReservations();
    const { allCustomers, isLoading: customersLoading, fetchCustomerById, updateCustomer } = useCustomers();
    const { staff, isLoading: staffLoading } = useStaff();
    const [reservationLookup, setReservationLookup] = useState<Lookup<Reservation>>({ id: '', done: false, value: null });
    const [customerLookup, setCustomerLookup] = useState<Lookup<Customer>>({ id: '', done: false, value: null });
    const linkAttemptRef = useRef('');

    const listedReservation = reservations.find((item) => item.id === reservationId);
    const reservation = listedReservation || (reservationLookup.id === reservationId ? reservationLookup.value : null);

    useEffect(() => {
        if (!reservationId || listedReservation) return;
        let active = true;
        const timer = window.setTimeout(() => {
            setReservationLookup({ id: reservationId, done: false, value: null });
            void fetchReservationById(reservationId).then((value) => {
                if (active) setReservationLookup({ id: reservationId, done: true, value });
            });
        }, 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, [fetchReservationById, listedReservation, reservationId]);

    useEffect(() => {
        if (!reservation || reservation.customerId || !reservation.customerPhone?.trim() || linkAttemptRef.current === reservation.id) return;
        linkAttemptRef.current = reservation.id;
        void ensureReservationCustomer(reservation).then((customerId) => {
            if (customerId) void fetchReservationById(reservation.id);
        });
    }, [ensureReservationCustomer, fetchReservationById, reservation]);

    const customerId = reservation?.customerId || '';
    const listedCustomer = allCustomers.find((item) => item.id === customerId);
    const customer = listedCustomer || (customerLookup.id === customerId ? customerLookup.value : null);

    useEffect(() => {
        if (!customerId || listedCustomer) return;
        let active = true;
        const timer = window.setTimeout(() => {
            setCustomerLookup({ id: customerId, done: false, value: null });
            void fetchCustomerById(customerId).then((value) => {
                if (active) setCustomerLookup({ id: customerId, done: true, value });
            });
        }, 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, [customerId, fetchCustomerById, listedCustomer]);

    const encounterApi = usePatientEncounter(reservation?.customerId ? reservation.id : undefined, reservation?.customerId);
    const { current: dentalCurrent, planned: dentalPlanned, setTooth } = useDentalChart(customer?.id);
    const { plans, addPlan, setPlanStatus, completeSession } = useTreatmentPlans(customer?.id);
    const planIds = useMemo(() => plans.map((plan) => plan.id), [plans]);
    const { payments, addPayment } = usePayments({ treatmentPlanIds: planIds });
    const { installments, available: installmentsAvailable, createSchedule } = useInstallmentSchedules(planIds);
    const assignedStaff = reservation?.staffId ? staff.find((item) => item.id === reservation.staffId) : undefined;
    const access = reservation ? resolveDentalVisitAccess(reservation, assignedStaff) : null;

    // Geçmiş vizitler — hastanın önceki encounter'ları (062 yoksa bölüm gizli kalır)
    const { orgId } = useAuth();
    const [pastVisits, setPastVisits] = useState<{ id: string; dateISO: string; label: string; status: string }[]>([]);
    useEffect(() => {
        if (!orgId || !customerId) { setPastVisits([]); return; }
        let alive = true;
        const t = window.setTimeout(async () => {
            const { data, error } = await supabase.from('patient_encounters')
                .select('id, created_at, reservation_id, status, visit_type, chief_complaint, diagnosis')
                .eq('organization_id', orgId).eq('customer_id', customerId)
                .order('created_at', { ascending: false }).limit(9);
            if (!alive || error) { if (alive) setPastVisits([]); return; }
            setPastVisits((data || [])
                .filter((e) => e.reservation_id !== reservationId)
                .slice(0, 8)
                .map((e) => ({
                    id: e.id, dateISO: e.created_at, status: e.status,
                    label: e.diagnosis || e.chief_complaint || e.visit_type || 'Muayene',
                })));
        }, 0);
        return () => { alive = false; window.clearTimeout(t); };
    }, [orgId, customerId, reservationId]);

    const financial = useMemo(() => {
        // Bakiye kuralları tek yerde: lib/patientBalance.ts
        const fin = computePatientFinance(plans, payments);
        const totalAmount = fin.total;
        const paidAmount = fin.paid;
        const activeIds = new Set(plans.filter((p) => isBillablePlan(p.status)).map((p) => p.id));
        const relevantPayments = payments.filter((payment) => payment.treatmentPlanId && activeIds.has(payment.treatmentPlanId));
        const paidByInstallment = new Map<string, number>();
        for (const payment of relevantPayments) if (payment.installmentId) paidByInstallment.set(payment.installmentId, (paidByInstallment.get(payment.installmentId) || 0) + payment.amount);
        const openInstallments = installments.filter((item) => activeIds.has(item.treatmentPlanId) && (paidByInstallment.get(item.id) || 0) < item.amount);
        const overdueAmount = openInstallments.filter((item) => item.dueDate < todayISO()).reduce((sum, item) => sum + item.amount - (paidByInstallment.get(item.id) || 0), 0);
        return {
            totalAmount, paidAmount, balance: fin.balance, overpaid: fin.overpaid,
            unallocatedPaid: fin.unallocatedPaid, orphanPaid: fin.orphanPaid,
            overdueAmount, nextDueDate: openInstallments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate,
        };
    }, [installments, payments, plans]);

    // Taksitlendirilebilir planlar: aktif, kalanı olan, vadesi henüz kurulmamış
    const installmentTargets = useMemo(() => {
        const scheduled = new Set(installments.map((item) => item.treatmentPlanId));
        const { paidByPlan } = computePatientFinance(plans, payments);
        return plans
            .filter((p) => p.status === 'active' && !scheduled.has(p.id))
            .map((p) => ({ id: p.id, title: p.title, remaining: planRemaining(p, paidByPlan) }))
            .filter((p) => p.remaining > 0);
    }, [installments, payments, plans]);

    const saveExam = async (input: DentalVisitExamInput) => {
        if (!reservation || !access || access.readOnly) return false;
        if (encounterApi.available === false) {
            const updated = await updateReservation(reservation.id, {
                arrivedAt: reservation.arrivedAt || new Date().toISOString(),
                customFields: {
                    ...(reservation.customFields || {}),
                    basvuru_nedeni: input.chiefComplaint.trim(),
                    tani: input.diagnosis.trim(),
                    tedavi_notu: input.examinationNote.trim(),
                },
            });
            return Boolean(updated);
        }
        const encounter = await encounterApi.ensureEncounter('examination');
        if (!encounter) return false;
        const saved = await encounterApi.updateClinicalSummary({
            chiefComplaint: input.chiefComplaint.trim() || null,
            diagnosis: input.diagnosis.trim() || null,
            clinicalNotes: input.examinationNote.trim() || null,
        });
        if (!saved) return false;
        if (encounter.status === 'scheduled' || encounter.status === 'checked_in') await encounterApi.setStatus('in_progress');
        if (!reservation.arrivedAt) await updateReservation(reservation.id, { arrivedAt: new Date().toISOString() });
        return true;
    };

    const startVisit = async () => {
        if (!reservation || access?.readOnly) return;
        if (encounterApi.available === false) {
            const updated = await updateReservation(reservation.id, { arrivedAt: new Date().toISOString() });
            if (updated) toast.success('Muayene başlatıldı');
            return;
        }
        const encounter = await encounterApi.ensureEncounter('examination');
        if (!encounter) return;
        const [encounterStarted, reservationStarted] = await Promise.all([
            encounterApi.setStatus('in_progress'),
            reservation.arrivedAt ? Promise.resolve(reservation) : updateReservation(reservation.id, { arrivedAt: new Date().toISOString() }),
        ]);
        if (encounterStarted && reservationStarted) toast.success('Muayene başlatıldı');
    };

    const completeVisit = async () => {
        if (!reservation || access?.readOnly) return;
        if (encounterApi.available === false) {
            const updated = await updateReservation(reservation.id, { status: 'completed', serviceEndedAt: new Date().toISOString() });
            if (updated) toast.success('Ziyaret tamamlandı; tahsilat klinik kayıttan ayrı bekliyor');
            return;
        }
        const encounter = await encounterApi.ensureEncounter('examination');
        if (!encounter) return;
        const completed = await encounterApi.setStatus('completed');
        if (!completed) return;
        const updated = await updateReservation(reservation.id, { status: 'completed', serviceEndedAt: new Date().toISOString() });
        if (updated) toast.success('Ziyaret tamamlandı; tahsilat klinik kayıttan ayrı bekliyor');
    };

    if (!reservationId) return <PageState title="Randevu seçilmedi" body="Hasta ziyareti, güvenli bağlam için bir randevu üzerinden açılır." action={() => navigate('/calendar')} />;
    if (labelsLoading || reservationsLoading || (!listedReservation && reservationLookup.id !== reservationId) || (!listedReservation && reservationLookup.id === reservationId && !reservationLookup.done)) {
        return <div className="dash-theme flex min-h-full flex-1 items-center justify-center bg-[var(--dc-page)] text-[var(--dc-muted)]"><LoaderCircle className="animate-spin" size={24} /></div>;
    }
    if (sector !== 'dis') return <PageState title="Bu alan diş kliniğine özeldir" body="Hasta ziyareti çalışma alanı yalnız Diş Kliniği sektör profilinde açılır." action={() => navigate('/')} />;
    if (!reservation) return <PageState title="Randevu bulunamadı" body="Kayıt silinmiş olabilir veya bu kliniğe ait değildir." action={() => navigate('/calendar')} />;
    if (!reservation.customerId) return <MissingPatientCard reservation={reservation} onLinked={() => void fetchReservationById(reservation.id)} />;
    const customerLookupPending = !listedCustomer
        && (customerLookup.id !== reservation.customerId || !customerLookup.done);
    // Mevcut muayene notları asenkron geldikten sonra formu ilk kez kur.
    // Böylece eski ziyaret açıldığında boş ilk state, kayıtlı klinik notların
    // üstünü örtmez; şema yoksa hook hızlıca compatibility moduna geçer.
    if (customersLoading || customerLookupPending || staffLoading || encounterApi.isLoading) {
        return <div className="dash-theme flex min-h-full flex-1 items-center justify-center bg-[var(--dc-page)] text-[var(--dc-muted)]"><LoaderCircle className="animate-spin" size={24} /></div>;
    }
    if (!customer) return <PageState title="Hasta dosyası bulunamadı" body="Randevudaki hasta bağlantısı artık geçerli değil. Hasta dosyasını onarıp yeniden deneyin." action={() => navigate(`/customers`)} />;

    const workspaceReadOnly = (access?.readOnly ?? true) || encounterApi.isLoading;

    return (
        <div className="dash-theme min-h-full flex-1 overflow-y-auto bg-[var(--dc-page)]">
            <VisitJourney
                key={`${reservation.id}:${customer.id}`}
                reservation={reservation}
                customer={customer}
                doctorName={access?.assignedDoctor?.name || reservation.staffName}
                encounterApi={encounterApi}
                plans={plans}
                financial={financial}
                dentalCount={dentalCurrent.size}
                plannedCount={dentalPlanned.size}
                dentalCurrent={dentalCurrent}
                clinicName={settings.businessName || 'Kliniğimiz'}
                patientPhone={customer.phone}
                services={settings.services}
                installmentTargets={installmentTargets}
                installmentsAvailable={installmentsAvailable}
                pastVisits={pastVisits}
                doctorId={access?.assignedDoctor?.id}
                readOnly={workspaceReadOnly}
                readOnlyReason={access?.reason}
                onOpenStaff={() => navigate('/staff')}
                onSaveExam={saveExam}
                onAddFinding={async (tooth, dental, surfaces) => {
                    const enc = encounterApi.available === false ? undefined : (encounterApi.encounter || await encounterApi.ensureEncounter('treatment'));
                    return setTooth(tooth, dental, { surfaces, staffId: access?.assignedDoctor?.id, encounterId: enc?.id, reservationId: reservation.id });
                }}
                onPropose={async (lines) => {
                    // Teklifi kalıcı 'proposed' plan olarak kaydet — sayfa yenilense de kaybolmaz
                    const enc = encounterApi.available === false ? undefined : (encounterApi.encounter || await encounterApi.ensureEncounter('treatment'));
                    let ok = true;
                    for (const l of lines) {
                        const plan = await addPlan(l.tooth > 0 ? `${l.tooth} ${l.label}` : l.label, l.price, { staffId: access?.assignedDoctor?.id, reservationId: reservation.id, encounterId: enc?.id, status: 'proposed', sessionCount: l.sessions });
                        if (!plan) ok = false;
                    }
                    return ok;
                }}
                onApprove={async (lines) => {
                    // Kalıcı teklif varsa (proposed) onu 'active'e çevir; yoksa (eski
                    // akış / doğrudan onay) satırlardan yeni aktif plan oluştur.
                    const proposedPlans = plans.filter((p) => p.status === 'proposed');
                    if (proposedPlans.length > 0) {
                        let ok = true;
                        for (const p of proposedPlans) if (!(await setPlanStatus(p.id, 'active'))) ok = false;
                        return ok;
                    }
                    const enc = encounterApi.available === false ? undefined : (encounterApi.encounter || await encounterApi.ensureEncounter('treatment'));
                    let ok = true;
                    for (const l of lines) {
                        const plan = await addPlan(l.tooth > 0 ? `${l.tooth} ${l.label}` : l.label, l.price, { staffId: access?.assignedDoctor?.id, reservationId: reservation.id, encounterId: enc?.id, sessionCount: l.sessions });
                        if (!plan) ok = false;
                    }
                    return ok;
                }}
                onCompleteSession={(planId) => completeSession(planId, access?.assignedDoctor?.id)}
                onCollect={async (amount, method) => {
                    // Tahsilatı planlara sırayla dağıt; hiçbir planın kalanını aşma.
                    // 061 finans bütünlüğü trigger'ı plan başına fazla ödemeyi reddeder.
                    const { paidByPlan } = computePatientFinance(plans, payments);
                    const targets = plans
                        .filter((p) => isBillablePlan(p.status))
                        .map((p) => ({ id: p.id, remaining: planRemaining(p, paidByPlan) }))
                        .filter((p) => p.remaining > 0);
                    let left = amount;
                    let anyOk = false;
                    for (const t of targets) {
                        if (left <= 0) break;
                        const chunk = Math.min(left, t.remaining);
                        const pay = await addPayment({ amount: chunk, method, type: 'service', description: 'Tedavi tahsilatı', customerId: customer.id, reservationId: reservation.id, staffId: access?.assignedDoctor?.id, treatmentPlanId: t.id });
                        if (pay) { anyOk = true; left -= chunk; }
                    }
                    return anyOk;
                }}
                onCreateInstallments={async (planId, count, firstDueDate, cadence) => {
                    const target = installmentTargets.find((t) => t.id === planId);
                    if (!target) return false;
                    const created = await createSchedule({ planId, customerId: customer.id, totalAmount: target.remaining, count, firstDueDate, cadence });
                    return Boolean(created);
                }}
                onSetRecall={async (dateISO) => { await updateCustomer(customer.id, { recallDate: dateISO }); return true; }}
                onArrived={async () => { await updateReservation(reservation.id, { customerArrivedAt: new Date().toISOString() }); toast.success('Geliş kaydedildi'); }}
                onStartVisit={startVisit}
                onCompleteVisit={completeVisit}
                onOpenPatientFile={() => navigate(`/patient-file/${customer.id}`)}
                onClose={() => navigate(-1)}
            />
        </div>
    );
}
