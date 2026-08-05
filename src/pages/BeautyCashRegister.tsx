import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, ArrowRight, BadgePercent, Banknote, Check, ChevronRight, CircleAlert, CircleCheck,
    CalendarDays, CreditCard, Landmark, LockKeyhole, MoreHorizontal, PackageCheck, Plus,
    Printer, ReceiptText, Search, ShieldCheck, Sparkles, Trash2, UserRound, WalletCards, Wifi, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePayments } from '@/hooks/usePayments';
import { useProducts } from '@/hooks/useProducts';
import { useStock } from '@/hooks/useStock';
import { useReservations } from '@/hooks/useReservations';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { useCustomers } from '@/hooks/useCustomers';
import { useLabels } from '@/hooks/useLabels';
import { CASH_PROFILES, type CashProfile, type CashVariant } from '@/lib/cashSectorProfiles';
import { collectAllocated } from '@/lib/allocatePayment';
import type { NewPayment } from '@/hooks/usePayments';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
// Paket tahsilatı bileti: Paketler sayfasından gönderilen bakiye, kuyrukta
// randevu bileti gibi görünür (mor şeritle ayrılır) ve tahsilat Kasa'nın kendi
// yöntem/tutar akışından geçer — böylece gün sonu kırılımı doğru olur.
import { PKG_TICKET, isPkgTicket, planIdOf, readPkgQueue, writePkgQueue } from '@/lib/kasaPackageQueue';
import type { PaymentMethod, Reservation } from '@/types';
import { buildSalonCashTickets, ticketContaining } from '@/lib/salonCashTickets';
import { todayISO, toISODate } from '@/utils/date';
import './beautyCash.css';
import { reservationServiceLines, reservationPrice } from '@/utils/reservationServices';
import { lookupDiscountCode, redeemDiscountCode, DISCOUNT_CODE_ERROR_TEXT, type DiscountCode } from '@/services/discountCodes';

// ── Ortak Kasa · 3 sütunlu ödeme deneyimi ────────────────────────────────────
// Randevulu bütün sektörler (güzellik, kuaför, berber, estetik, klinik, fizyo,
// dövme, hukuk, danışmanlık, gym, gelinlikçi, genel) aynı kabuğu kullanır;
// yetenek ve terminoloji farkı lib/cashSectorProfiles'tan gelir. Kasası
// yapısal olarak farklı olan restoran ve diş, KasaPage'in kendi yüzünde kalır.
// (Dosya adı tarihsel: yüz önce güzellik için yazıldı.)
// ÇEKİRDEK AKIŞ gerçek veriye bağlı: kuyruk=ödenmemiş tamamlanmış randevular,
// hesap=hizmet+adisyon, ödeme=usePayments. Backend'i olmayan
// yüzeyler (üyelik, hediye kartı, bahşiş, karma, iade, vardiya) görünür ama
// "yakında" ile pasif — sahte başarı üretilmez.

const tl = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const initials = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');
const paymentMethodLabel = (method: PaymentMethod) =>
    method === 'cash' ? 'Nakit' : method === 'card' ? 'Kart' : method === 'transfer' ? 'Havale' : 'Diğer';

// Kasa araç modalları için ortak yüzey
const DLG_OVERLAY: CSSProperties = { position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,16,12,.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const DLG_CARD: CSSProperties = { width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', background: 'var(--dc-surface)', border: '1px solid var(--dc-border)', borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,.28)', color: 'var(--dc-ink)' };
const DLG_INPUT: CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 11, border: '1px solid var(--dc-border2)', background: 'var(--dc-page)', color: 'var(--dc-ink)', fontSize: 14, outline: 'none' };
const DLG_PRIMARY: CSSProperties = { padding: '11px 16px', borderRadius: 11, border: 'none', background: 'var(--dc-ink)', color: 'var(--dc-cream, #fff)', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' };
const DLG_GHOST: CSSProperties = { padding: '11px 16px', borderRadius: 11, border: '1px solid var(--dc-border2)', background: 'transparent', color: 'var(--dc-ink)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };

type Stage = 'summary' | 'payment' | 'complete';
type UiMethod = 'card' | 'cash' | 'transfer' | 'gift';
type QueueTab = 'open' | 'checkout' | 'draft' | 'completed';

const METHODS: { id: UiMethod; label: string; detail: string; supported: boolean }[] = [
    { id: 'card', label: 'Kart', detail: 'Kart tahsilatı', supported: true },
    { id: 'cash', label: 'Nakit', detail: 'Nakit tahsilatı', supported: true },
    { id: 'transfer', label: 'Havale / QR', detail: 'Referans gerekli', supported: true },
    { id: 'gift', label: 'Hediye kartı', detail: 'Yakında', supported: false },
];

function MethodIcon({ m }: { m: UiMethod }) {
    if (m === 'cash') return <Banknote size={18} />;
    if (m === 'transfer') return <Landmark size={18} />;
    if (m === 'gift') return <WalletCards size={18} />;
    return <CreditCard size={18} />;
}

interface Line {
    id: string;
    name: string;
    detail: string;
    price: number;
    quantity: number;
    kind: 'Hizmet' | 'Ürün';
    locked?: boolean;
    lockLabel?: string;
    covered?: boolean;
    reservationId?: string;
    productId?: string;
    adisyonItemId?: string;
}

/** Bölünmüş tahsilatın tek parçası — bir yöntem, bir tutar. */
interface PayPart { id: string; method: UiMethod; amount: string; }

const partAmount = (p: PayPart) => parseInt(p.amount.replace(/\D/g, '') || '0', 10) || 0;
const newPart = (method: UiMethod, amount: number): PayPart =>
    ({ id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, method, amount: String(Math.max(0, Math.round(amount))) });

/** Randevu bir paket hakkından mı karşılanıyor (BeautySessionModal / Kasa bağlar). */
const coveringPlanId = (r?: Reservation | null) => String(r?.customFields?.paket_plan_id ?? '');


const CASH_DISCOUNT_AMOUNT = 'cash_discount_amount';
const CASH_DISCOUNT_CODE_ID = 'cash_discount_code_id';
const CASH_DISCOUNT_CODE = 'cash_discount_code';
const CASH_DISCOUNT_PERCENT = 'cash_discount_percent';
const CASH_DISCOUNT_REDEEMED = 'cash_discount_redeemed';

const savedDiscountOf = (r?: Reservation | null) =>
    Math.max(0, Number(r?.customFields?.[CASH_DISCOUNT_AMOUNT] ?? 0) || 0);

/** Diş varyantı: vadesi yaklaşan/geciken taksit satırı (kuyruk altı ray). */
interface DueInstallment {
    id: string;
    customerId: string;
    customerName: string;
    planTitle: string;
    seq: number;
    amount: number;
    dueDate: string;
    overdue: boolean;
}

export function BeautyCashRegister({
    onBack,
    variant = 'guzellik',
}: {
    onBack: () => void;
    variant?: CashVariant;
}) {
    const profile: CashProfile = CASH_PROFILES[variant];
    const BrandIcon = profile.icon;
    // "3 müşteri / danışan / hasta / müvekkil ödeme bekliyor" — terminoloji
    // sektör profilinden gelir, kasada ikinci bir sözlük tutulmaz.
    const { t } = useLabels();
    const queueNoun = t('customer').toLocaleLowerCase('tr');
    const customerWord = t('customer');
    // Diş: tahsilat açık tedavi planlarına FIFO mahsup edilir (allocatePayment).
    const allocatePlans = Boolean(profile.allocatePlans);
    const navigate = useNavigate();
    const { addPayment, removePayment, stats, payments } = usePayments();
    const { products } = useProducts();
    const { addMovements } = useStock();
    const { reservations, settings, updateReservation } = useReservations();
    const { packages } = useOrgPackages({ enabled: profile.packagesEnabled });
    const { customerById, updateCustomer } = useCustomers();
    const { orgId } = useAuth();
    const [params] = useSearchParams();


    const dayISO = todayISO();
    const todayPayments = useMemo(
        () => payments
            .filter((payment) => payment.paidAt && toISODate(new Date(payment.paidAt)) === dayISO)
            .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || '')),
        [payments, dayISO],
    );
    const paidReservationIdsToday = useMemo(
        () => new Set(todayPayments.map((payment) => payment.reservationId).filter(Boolean) as string[]),
        [todayPayments],
    );

    // Çoklu kuaför/güzellik hizmetleri (`groupId`) kasada tek ziyaret ve tek
    // hesap olarak görünür. Grubun bütün aktif üyeleri tamamlanmadan açılmaz.
    const salonTickets = useMemo(() => buildSalonCashTickets(reservations), [reservations]);
    const unpaidSalonTickets = useMemo(
        () => salonTickets.filter((ticket) => !ticket.isPaid),
        [salonTickets],
    );
    const paidTodaySalonTickets = useMemo(
        () => salonTickets.filter((ticket) =>
            ticket.isPaid
            && (ticket.reservationIds.some((id) => paidReservationIdsToday.has(id))
                || ticket.representative.date === dayISO)),
        [dayISO, paidReservationIdsToday, salonTickets],
    );
    const unpaidReservations = useMemo(
        () => unpaidSalonTickets.map((ticket) => ticket.representative),
        [unpaidSalonTickets],
    );
    const paidToday = useMemo(
        () => paidTodaySalonTickets.map((ticket) => ticket.representative),
        [paidTodaySalonTickets],
    );

    // ── Paket tahsilatı biletleri ─────────────────────────────────────────────
    // Paket bakiyeleri kuyruğu doldurmasın diye TAMAMI listelenmez; yalnızca
    // Paketler sayfasından "Kasaya gönder" denenler gelir — müşteri kasaya
    // gelmiş gibi. Bakiye canlı hesaplanır (plan bedeli − plana bağlı ödemeler).
    const [paidByPlan, setPaidByPlan] = useState<Map<string, number>>(new Map());
    const loadPaidByPlan = useCallback(async () => {
        if (!orgId || !profile.packagesEnabled) return;
        const { data, error } = await supabase.from('payments')
            .select('treatment_plan_id, amount')
            .eq('organization_id', orgId).not('treatment_plan_id', 'is', null);
        if (error) { console.error(error); return; }
        const m = new Map<string, number>();
        for (const p of data || []) m.set(p.treatment_plan_id, (m.get(p.treatment_plan_id) || 0) + Number(p.amount));
        setPaidByPlan(m);
    }, [orgId, profile.packagesEnabled]);
    useEffect(() => {
        if (!profile.packagesEnabled) return;
        const timer = window.setTimeout(() => { void loadPaidByPlan(); }, 0);
        return () => window.clearTimeout(timer);
    }, [loadPaidByPlan, packages, profile.packagesEnabled]);

    // ── Diş: 7 gün içinde vadesi dolan (ve gecikmiş) taksitler ────────────────
    // Kuyruğun altında listelenir; satıra tıklamak hasta dosyasını açar.
    // Taksit tahsilatının kendisi vizit ekranından yapılır — burası hatırlatma rayı.
    const [dueInstallments, setDueInstallments] = useState<DueInstallment[]>([]);
    const loadDueInstallments = useCallback(async () => {
        if (!allocatePlans || !orgId) return;
        const today = todayISO();
        const plus7 = toISODate(new Date(Date.now() + 7 * 864e5));
        const { data: rows, error } = await supabase
            .from('treatment_installments')
            .select('id, customer_id, treatment_plan_id, sequence_no, amount, due_date')
            .eq('organization_id', orgId)
            .lte('due_date', plus7)
            .order('due_date', { ascending: true })
            .limit(60);
        // Tablo yoksa (059 uygulanmamış) bölüm sessizce gizli kalır.
        if (error || !rows || rows.length === 0) { setDueInstallments([]); return; }
        const [{ data: pays }, { data: plans }] = await Promise.all([
            supabase.from('payments').select('installment_id, amount').in('installment_id', rows.map((r) => r.id)),
            supabase.from('treatment_plans').select('id, title, status').in('id', [...new Set(rows.map((r) => r.treatment_plan_id))]),
        ]);
        const paidBy = new Map<string, number>();
        for (const p of pays || []) if (p.installment_id) paidBy.set(p.installment_id, (paidBy.get(p.installment_id) || 0) + Number(p.amount));
        const planById = new Map((plans || []).map((p) => [p.id, p]));
        setDueInstallments(rows
            .filter((r) => (paidBy.get(r.id) || 0) < Number(r.amount))
            .filter((r) => ['active', 'completed'].includes(planById.get(r.treatment_plan_id)?.status ?? ''))
            .map((r) => ({
                id: r.id,
                customerId: r.customer_id,
                customerName: customerById.get(r.customer_id)?.name || customerWord,
                planTitle: planById.get(r.treatment_plan_id)?.title || 'Tedavi planı',
                seq: Number(r.sequence_no),
                amount: Number(r.amount),
                dueDate: r.due_date,
                overdue: r.due_date < today,
            })));
    }, [allocatePlans, customerById, customerWord, orgId]);
    useEffect(() => {
        const timer = window.setTimeout(() => { void loadDueInstallments(); }, 0);
        return () => window.clearTimeout(timer);
        // payments: tahsilat sonrası liste tazelensin
    }, [loadDueInstallments, payments]);

    const focused = params.get('reservation');
    const [selectedId, setSelectedId] = useState<string | null>(focused || null);
    const [pkgQueue, setPkgQueue] = useState<string[]>(() =>
        profile.packagesEnabled ? readPkgQueue() : []);
    const paketParam = params.get('paket');
    useEffect(() => {
        if (!profile.packagesEnabled || !paketParam) return;
        const timer = window.setTimeout(() => {
            setPkgQueue((prev) => {
                const next = [...new Set([paketParam, ...prev])];
                writePkgQueue(next);
                return next;
            });
            setSelectedId(PKG_TICKET + paketParam);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [paketParam, profile.packagesEnabled]);

    const planBalance = useCallback((planId: string) => {
        const plan = packages.find((p) => p.id === planId);
        if (!plan) return 0;
        return Math.max(0, plan.totalAmount - (paidByPlan.get(planId) || 0));
    }, [packages, paidByPlan]);

    const [tab, setTab] = useState<QueueTab>('open');
    const [queueSearch, setQueueSearch] = useState('');
    const [stage, setStage] = useState<Stage>('summary');
    const [method, setMethod] = useState<UiMethod>('card');
    const [discountStr, setDiscountStr] = useState('');
    const [cashReceived, setCashReceived] = useState('');
    const [transferRef, setTransferRef] = useState('');
    const [receipt, setReceipt] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [payError, setPayError] = useState('');
    // Tahsilatı bölme: boş dizi = "tamamı, seçili yöntemle" (varsayılan akış).
    // Dolu olduğunda ödeme yöntem yöntem parçalanır; parçaların toplamı kalandan
    // azsa hesap KAPANMAZ, fark müşterinin borcu olarak kuyrukta durur.
    const [parts, setParts] = useState<PayPart[]>([]);
    const [done, setDone] = useState<Record<string, { amount: number; method: string; number: string; change: number; receipt: boolean }>>({});
    const [lineBusy, setLineBusy] = useState(false);
    const [catalogSearch, setCatalogSearch] = useState('');
    const successRef = useRef<HTMLElement>(null);
    // Kasa araç modalları (Hareketler / Gün sonu / Not / Kapora / İndirim)
    const [showMoves, setShowMoves] = useState(false);
    const [showDayEnd, setShowDayEnd] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteBusy, setNoteBusy] = useState(false);
    const [kaporaOpen, setKaporaOpen] = useState(false);
    const [kaporaAmt, setKaporaAmt] = useState('');
    const [kaporaMethod, setKaporaMethod] = useState<PaymentMethod>('cash');
    const [kaporaBusy, setKaporaBusy] = useState(false);
    const [discountOpen, setDiscountOpen] = useState(false);
    const [discountSaving, setDiscountSaving] = useState(false);
    // İndirim kodu (071) — "sizi özledik" mesajıyla giden müşteriye özel kod
    const [codeStr, setCodeStr] = useState('');
    const [codeBusy, setCodeBusy] = useState(false);
    const [codeError, setCodeError] = useState('');
    const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null);
    const [coverOpen, setCoverOpen] = useState(false);
    const [coverBusy, setCoverBusy] = useState(false);
    // Son tahsilatın plan mahsup dökümü — toast'ta kaybolmasın, makbuzda dursun.
    const [lastAlloc, setLastAlloc] = useState<{ allocated: number; titles: string[] } | null>(null);

    useEffect(() => {
        if (stage === 'complete') successRef.current?.focus();
    }, [stage]);

    useEffect(() => {
        if (!showMoves && !showDayEnd && !noteOpen && !kaporaOpen && !discountOpen && !coverOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setShowMoves(false);
            setShowDayEnd(false);
            setNoteOpen(false);
            setKaporaOpen(false);
            setDiscountOpen(false);
            setCoverOpen(false);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [coverOpen, discountOpen, kaporaOpen, noteOpen, showDayEnd, showMoves]);

    // Gönderilen paketlerden kuyruk bileti üret. Tahsil edilmiş olan (done)
    // bilet, başarı ekranı bozulmasın diye görünürde kalır.
    const pkgTickets = useMemo<Reservation[]>(() => !profile.packagesEnabled ? [] : pkgQueue.flatMap((planId) => {
        const plan = packages.find((p) => p.id === planId);
        if (!plan || plan.status === 'cancelled') return [];
        const ticketId = PKG_TICKET + planId;
        if (planBalance(planId) <= 0 && !done[ticketId]) return [];
        const c = customerById.get(plan.customerId);
        return [{
            id: ticketId,
            customerId: plan.customerId,
            customerName: c?.name || 'Müşteri kaydı yok',
            customerPhone: c?.phone || '',
            date: dayISO,
            startTime: '', endTime: '',
            service: plan.title,
            status: 'completed' as const,
            isPaid: false,
            createdAt: plan.createdAt,
        }];
    }), [customerById, dayISO, done, packages, pkgQueue, planBalance, profile.packagesEnabled]);

    const unpaid = useMemo(() => [...pkgTickets, ...unpaidReservations], [pkgTickets, unpaidReservations]);

    const selectedTicket = useMemo(
        () => ticketContaining(salonTickets, selectedId),
        [salonTickets, selectedId],
    );
    const record = useMemo(() => {
        const selectedRepresentativeId = selectedTicket?.representative.id ?? selectedId;
        return unpaid.find((r) => r.id === selectedRepresentativeId)
            || paidToday.find((r) => r.id === selectedRepresentativeId)
            || unpaid[0]
            || null;
    }, [paidToday, selectedId, selectedTicket, unpaid]);
    const recordIsPkg = isPkgTicket(record?.id);
    const recordTicket = useMemo(
        () => record && !recordIsPkg
            ? ticketContaining(salonTickets, record.id)
            : undefined,
        [record, recordIsPkg, salonTickets],
    );
    const recordMembers = useMemo(
        () => recordTicket?.members ?? (record && !recordIsPkg ? [record] : []),
        [record, recordIsPkg, recordTicket],
    );
    const recordSummary = recordTicket?.serviceSummary || record?.service || '';
    const recordStaffNames = recordTicket?.staffNames ?? (record?.staffName ? [record.staffName] : []);
    // Bu randevu bir paket hakkından karşılanıyorsa hizmet satırı ÜCRETSİZDİR.
    // Eskiden fiyat yalnız hizmet adı eşleşmesinden geliyordu: paket başlığı
    // hizmet adıyla birebir aynı olduğunda (tek seanslık paketler) seans, paket
    // bedelinin üstüne bir kez daha tahsil ediliyordu. Artık bağ kaynak alınır.
    const coveredPkg = useMemo(() => {
        const planId = !profile.packagesEnabled || recordIsPkg || recordMembers.length !== 1
            ? ''
            : coveringPlanId(recordMembers[0]);
        return planId ? packages.find((p) => p.id === planId) : undefined;
    }, [packages, profile.packagesEnabled, recordIsPkg, recordMembers]);
    // Hesap kalemleri: gruptaki bütün hizmetler + kalıcı adisyon ürün/ekstraları.
    const lines: Line[] = useMemo(() => {
        if (!record) return [];
        // Paket bileti: tek kalem, kilitli — adisyon/ek hizmet eklenmez.
        if (isPkgTicket(record.id)) {
            return [{
                id: 'pkg', name: 'Paket tahsilatı', detail: record.service,
                price: planBalance(planIdOf(record.id)), quantity: 1, kind: 'Hizmet',
                locked: true, lockLabel: 'Paket',
            }];
        }
        return recordMembers.flatMap((member) => {
            const covered = profile.packagesEnabled && Boolean(coveringPlanId(member));
            const serviceLines: Line[] = reservationServiceLines(member, settings.services || []).map((line, index) => ({
                id: `svc-${member.id}-${line.id}-${index}`,
                name: line.name,
                detail: covered
                    ? 'Paket hakkından karşılandı'
                    : [member.staffName, recordMembers.length > 1 ? 'Grup hizmeti' : 'Tamamlandı'].filter(Boolean).join(' · '),
                price: covered ? 0 : line.price,
                quantity: 1,
                kind: 'Hizmet',
                locked: true,
                lockLabel: covered ? 'Pakete dahil' : t('reservation'),
                covered,
                reservationId: member.id,
            }));
            const adisyonLines: Line[] = (member.adisyonItems || []).map((item) => ({
                id: `adisyon-${member.id}-${item.id}`,
                name: item.name,
                detail: item.kind === 'product' ? 'Ürün · adisyon' : 'Ek hizmet',
                price: item.price,
                quantity: 1,
                kind: item.kind === 'product' ? 'Ürün' : 'Hizmet',
                reservationId: member.id,
                productId: item.productId,
                adisyonItemId: item.id,
            }));
            return [...serviceLines, ...adisyonLines];
        });
    }, [planBalance, profile.packagesEnabled, record, recordMembers, settings.services, t]);

    const dayEnd = useMemo(() => {
        const m: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
        for (const p of todayPayments) m[p.method] = (m[p.method] || 0) + p.amount;
        return { m, count: todayPayments.length, total: m.cash + m.card + m.transfer + m.other };
    }, [todayPayments]);
    // Bu hesaba önceden alınan tahsilat (kapora) — kapanışta çift tahsilatı önler
    // Paket biletinde bakiye zaten ödenenler düşülerek hesaplandı — tekrar düşme.
    const recordReservationIds = useMemo(
        () => new Set(recordMembers.map((member) => member.id)),
        [recordMembers],
    );
    const priorPaid = useMemo(
        () => record && !isPkgTicket(record.id)
            ? payments
                .filter((payment) => payment.reservationId && recordReservationIds.has(payment.reservationId))
                .reduce((sum, payment) => sum + payment.amount, 0)
            : 0,
        [payments, record, recordReservationIds],
    );
    const completed = useMemo(() => {
        if (!record) return undefined;
        if (done[record.id]) return done[record.id];
        if (!recordTicket?.isPaid) return undefined;
        const related = payments.filter((payment) =>
            payment.reservationId && recordReservationIds.has(payment.reservationId));
        const last = [...related].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
        return {
            amount: related.reduce((sum, payment) => sum + payment.amount, 0),
            method: related.length > 1 ? 'Karma / kayıtlı' : last ? paymentMethodLabel(last.method) : 'Kayıtlı',
            number: last ? `TF-${last.id.slice(0, 8).toLocaleUpperCase('tr')}` : 'TF-KAPALI',
            change: 0,
            receipt: false,
        };
    }, [done, payments, record, recordReservationIds, recordTicket?.isPaid]);

    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const discount = Math.min(parseInt(discountStr || '0', 10) || 0, subtotal);
    const discountCodeLabel = appliedCode?.code || String(record?.customFields?.[CASH_DISCOUNT_CODE] || '');
    const discountCodePercent = appliedCode?.percent || Number(record?.customFields?.[CASH_DISCOUNT_PERCENT] || 0);
    const totalDue = Math.max(0, subtotal - discount - priorPaid);
    const cashAmount = parseInt(cashReceived.replace(/\D/g, '') || '0', 10) || 0;

    // Bölünmüş mod: ödeme parçaların toplamı kadar. Tek yöntem modunda kalanın tamamı.
    const splitMode = parts.length > 0;
    const paidNow = splitMode ? parts.reduce((s, p) => s + partAmount(p), 0) : totalDue;
    const remainingAfter = Math.max(0, totalDue - paidNow);
    const isPartial = splitMode && remainingAfter > 0;

    const changeDue = !splitMode && method === 'cash' ? Math.max(0, cashAmount - totalDue) : 0;

    /** Gönderilecek parçalar — tek yöntem modu da tek parçalı bir bölünme sayılır. */
    const effectiveParts = (): { method: UiMethod; amount: number }[] => splitMode
        ? parts.map((p) => ({ method: p.method, amount: partAmount(p) })).filter((p) => p.amount > 0)
        : [{ method, amount: totalDue }];

    const startSplit = () => {
        setParts([newPart(method, totalDue)]);
        setPayError('');
    };
    const addPart = () => setParts((v) => [...v, newPart(v.some((p) => p.method === 'cash') ? 'card' : 'cash', Math.max(0, totalDue - v.reduce((s, p) => s + partAmount(p), 0)))]);
    const removePart = (id: string) => setParts((v) => {
        const next = v.filter((p) => p.id !== id);
        return next;   // son parça da silinirse tek yöntem moduna döner
    });
    const patchPart = (id: string, patch: Partial<PayPart>) => {
        setParts((v) => v.map((p) => p.id === id ? { ...p, ...patch } : p));
        setPayError('');
    };

    // Aktif paket (bilgi amaçlı — hak kullanımı ayrı akış, burada salt gösterim)
    const activePkg = useMemo(
        () => profile.packagesEnabled && record && !isPkgTicket(record.id) && recordMembers.length === 1
            ? packages.find((p) => p.customerId === record.customerId && p.status === 'active' && p.sessionsDone < p.sessionCount)
            : undefined,
        [packages, profile.packagesEnabled, record, recordMembers.length],
    );

    const openCount = unpaid.length;
    const visibleQueue = useMemo(() => {
        const src = tab === 'completed' ? paidToday : unpaid;
        const q = queueSearch.trim().toLocaleLowerCase('tr');
        return src.filter((queueRecord) => {
            if (!q) return true;
            const ticket = isPkgTicket(queueRecord.id) ? undefined : ticketContaining(salonTickets, queueRecord.id);
            return `${queueRecord.customerName} ${ticket?.serviceSummary || queueRecord.service}`
                .toLocaleLowerCase('tr')
                .includes(q);
        });
    }, [paidToday, queueSearch, salonTickets, tab, unpaid]);

    const chooseRecord = (id: string) => {
        if (processing) return;
        const ticket = ticketContaining(salonTickets, id);
        const representative = ticket?.representative;
        const nextId = representative?.id || id;
        setSelectedId(nextId);
        setStage(done[nextId] || ticket?.isPaid ? 'complete' : 'summary');
        setLastAlloc(null);
        setMethod('card');
        setDiscountStr(representative ? String(savedDiscountOf(representative) || '') : '');
        setCashReceived(''); setTransferRef(''); setPayError(''); setParts([]);
        setCodeStr(''); setCodeError(''); setAppliedCode(null);
    };

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (!record || recordIsPkg) {
                setDiscountStr('');
                setCodeStr('');
                return;
            }
            setDiscountStr(String(savedDiscountOf(record) || ''));
            setCodeStr(String(record.customFields?.[CASH_DISCOUNT_CODE] || ''));
        }, 0);
        return () => window.clearTimeout(timer);
    }, [record, recordIsPkg]);

    const balanceOf = (r: Reservation) => {
        if (done[r.id]) return 0;
        if (isPkgTicket(r.id)) return planBalance(planIdOf(r.id));
        const ticket = ticketContaining(salonTickets, r.id);
        const members = ticket?.members ?? [r];
        const ids = new Set(members.map((member) => member.id));
        const gross = members.reduce((sum, member) => {
            // Pakete dahil seans ücretsiz; ürün/ekstra yine ücretlenir.
            const servicePrice = profile.packagesEnabled && coveringPlanId(member)
                ? 0
                : reservationPrice(member, settings.services || []);
            return sum + servicePrice + (member.adisyonItems || []).reduce((itemSum, item) => itemSum + item.price, 0);
        }, 0);
        const savedDiscount = Math.min(savedDiscountOf(ticket?.representative || r), gross);
        // Kapora veya kısmi tahsilat alınmışsa kuyrukta KALAN görünmeli — brüt
        // tutarı göstermek "ne kadar bekliyoruz" sorusunu yanlış cevaplıyordu.
        const already = payments
            .filter((payment) => payment.reservationId && ids.has(payment.reservationId))
            .reduce((sum, payment) => sum + payment.amount, 0);
        return Math.max(0, gross - savedDiscount - already);
    };

    const removeExtra = async (line: Line) => {
        if (!record || processing || lineBusy || recordIsPkg || !line.reservationId || !line.adisyonItemId) return;
        const owner = recordMembers.find((member) => member.id === line.reservationId);
        if (!owner) return;
        setLineBusy(true);
        const updated = await updateReservation(owner.id, {
            adisyonItems: (owner.adisyonItems || []).filter((item) => item.id !== line.adisyonItemId),
        });
        setLineBusy(false);
        if (!updated) toast.error('Kalem kaldırılamadı');
    };

    const catalog = useMemo(() => {
        const q = catalogSearch.trim().toLocaleLowerCase('tr');
        const services = (settings.services || [])
            .filter((service) => (service.price ?? 0) > 0)
            .map((service) => ({
                id: `service:${service.id}`,
                sourceId: service.id,
                name: service.name,
                price: service.price || 0,
                kind: 'Hizmet' as const,
                detail: service.duration ? `${service.duration} dk` : 'Ek hizmet',
                productId: undefined as string | undefined,
            }));
        const productItems = products
            .filter((product) => product.isActive && product.price > 0)
            .map((product) => ({
                id: `product:${product.id}`,
                sourceId: product.id,
                name: product.name,
                price: product.price,
                kind: 'Ürün' as const,
                detail: product.category || 'Salon ürünü',
                productId: product.id,
            }));
        return [...services, ...productItems]
            .filter((item) => !q || `${item.name} ${item.detail}`.toLocaleLowerCase('tr').includes(q))
            .slice(0, 8);
    }, [catalogSearch, products, settings.services]);

    const addLine = async (item: (typeof catalog)[number]) => {
        // Paket bileti tek kalemdir — ek hizmet/ürün randevu hesabına aittir.
        if (!record || processing || lineBusy || recordIsPkg) {
            if (record && recordIsPkg) toast('Paket tahsilatına kalem eklenemez');
            return;
        }
        const owner = recordTicket?.representative || record;
        const existingItems = owner.adisyonItems || [];
        const idPrefix = `${item.kind === 'Ürün' ? 'product' : 'extra'}-${item.sourceId}`;
        let sequence = 1;
        while (existingItems.some((existing) => existing.id === `${idPrefix}-${sequence}`)) sequence += 1;
        setLineBusy(true);
        const updated = await updateReservation(owner.id, {
            adisyonItems: [
                ...existingItems,
                {
                    id: `${idPrefix}-${sequence}`,
                    name: item.name,
                    price: item.price,
                    kind: item.kind === 'Ürün' ? 'product' : 'extra',
                    productId: item.productId,
                },
            ],
        });
        setLineBusy(false);
        if (!updated) {
            toast.error('Kalem hesaba eklenemedi');
            return;
        }
        setCatalogSearch('');
    };

    const persistDiscount = async (amount: number, code?: DiscountCode | null) => {
        if (!record || recordIsPkg) return false;
        const owner = recordTicket?.representative || record;
        const customFields = { ...(owner.customFields || {}) };
        if (amount > 0) customFields[CASH_DISCOUNT_AMOUNT] = Math.min(Math.round(amount), subtotal);
        else delete customFields[CASH_DISCOUNT_AMOUNT];

        if (code) {
            customFields[CASH_DISCOUNT_CODE_ID] = code.id;
            customFields[CASH_DISCOUNT_CODE] = code.code;
            customFields[CASH_DISCOUNT_PERCENT] = code.percent;
            customFields[CASH_DISCOUNT_REDEEMED] = false;
        } else {
            delete customFields[CASH_DISCOUNT_CODE_ID];
            delete customFields[CASH_DISCOUNT_CODE];
            delete customFields[CASH_DISCOUNT_PERCENT];
            delete customFields[CASH_DISCOUNT_REDEEMED];
        }
        return Boolean(await updateReservation(owner.id, { customFields }));
    };

    // Kodu doğrula ve indirimi ara toplam üzerinden hesapla. Tutar sabitlenir;
    // sonradan kalem eklenirse indirim kendiliğinden büyümez (kasiyer görsün).
    const applyDiscountCode = async () => {
        if (!record || recordIsPkg || !orgId || codeBusy) return;
        setCodeBusy(true); setCodeError('');
        const res = await lookupDiscountCode(orgId, codeStr, record.customerId || undefined);
        if (!res.ok) {
            setCodeBusy(false);
            setCodeError(DISCOUNT_CODE_ERROR_TEXT[res.reason]);
            setAppliedCode(null);
            return;
        }
        const amount = Math.min(subtotal, Math.round(subtotal * res.code.percent / 100));
        if (amount <= 0) {
            setCodeBusy(false);
            setCodeError('Ara toplam sıfır — indirim uygulanamaz.');
            return;
        }
        const saved = await persistDiscount(amount, res.code);
        setCodeBusy(false);
        if (!saved) {
            setCodeError('İndirim hesaba kaydedilemedi.');
            return;
        }
        setAppliedCode(res.code);
        setDiscountStr(String(amount));
        toast.success(`%${res.code.percent} indirim uygulandı · ${tl(amount)}`);
        setDiscountOpen(false);
    };

    const resetDiscountDraft = () => {
        setAppliedCode(null); setCodeStr(''); setCodeError(''); setDiscountStr('');
    };

    const clearDiscount = async () => {
        if (discountSaving) return;
        setDiscountSaving(true);
        const saved = await persistDiscount(0, null);
        setDiscountSaving(false);
        if (!saved) {
            toast.error('İndirim kaldırılamadı');
            return;
        }
        resetDiscountDraft();
        setDiscountOpen(false);
    };

    const applyManualDiscount = async () => {
        if (discountSaving) return;
        const amount = Math.min(parseInt(discountStr || '0', 10) || 0, subtotal);
        setDiscountSaving(true);
        const saved = await persistDiscount(amount, null);
        setDiscountSaving(false);
        if (!saved) {
            toast.error('İndirim hesaba kaydedilemedi');
            return;
        }
        setAppliedCode(null);
        setCodeStr('');
        setDiscountStr(amount > 0 ? String(amount) : '');
        setDiscountOpen(false);
    };

    // Satılan ürünler stoktan düşer — miktar tek kaynaktan (stock_movements)
    // hesaplandığı için satış da bir hareket satırıdır (074). Takibi kapalı
    // ürünler ve hizmet satırları atlanır; 074 yoksa hook sessizce geçer.
    const deductSoldStock = async (paymentId?: string) => {
        const sold = lines
            .filter((line) => line.kind === 'Ürün' && line.productId && line.quantity > 0)
            .map((line) => ({ line, product: products.find((p) => p.id === line.productId) }))
            .filter(({ product }) => product && product.tracksStock !== false);
        if (sold.length === 0) return;
        await addMovements(sold.map(({ line }) => ({
            productId: line.productId as string,
            type: 'sale' as const,
            delta: -line.quantity,
            note: `Kasa · ${record?.customerName || 'Müşteri'}`,
            paymentId,
        })));
    };

    const goToPayment = () => {
        if (processing || completed || !record) return;
        if (totalDue <= 0) { void submit(); return; }   // kapora ile tamamen ödenmiş → doğrudan kapat
        setStage('payment'); setPayError('');
        if (method === 'cash' && !cashReceived) setCashReceived(String(totalDue));
    };

    const validate = (): string => {
        const used = effectiveParts();
        if (used.length === 0) return 'Tahsil edilecek bir tutar girin.';
        if (used.some((p) => p.method === 'gift')) return 'Hediye kartı ödemesi henüz aktif değil.';
        if (used.some((p) => p.method === 'transfer') && !transferRef.trim()) return 'Havale / QR referansı girin.';
        if (splitMode) {
            if (paidNow > totalDue) return `Toplam ${tl(paidNow - totalDue)} fazla — kalan ${tl(totalDue)}.`;
            if (paidNow <= 0) return 'Tahsil edilecek bir tutar girin.';
        } else if (method === 'cash' && cashAmount < totalDue) {
            return `Nakit tutarı ${tl(totalDue - cashAmount)} eksik.`;
        }
        return '';
    };

    const submit = async () => {
        if (processing || completed || !record) return;
        const err = validate();
        if (err) { setPayError(err); return; }
        setProcessing(true); setPayError('');
        const pmMap: Record<UiMethod, PaymentMethod> = { card: 'card', cash: 'cash', transfer: 'transfer', gift: 'other' };
        const used = effectiveParts();
        // Gün sonu kırılımı yöntem yöntem doğru olsun diye her parça AYRI bir
        // payment satırıdır — tek satıra "karma" yazmak raporu bozardı.
        const methodLabel = used.length === 1
            ? (METHODS.find((m) => m.id === used[0].method)?.label || 'Kart')
            : used.map((p) => `${METHODS.find((m) => m.id === p.method)?.label} ${tl(p.amount)}`).join(' + ');
        const partSuffix = (i: number) => used.length > 1 ? ` · ${i + 1}/${used.length}` : '';
        const createdPaymentIds: string[] = [];
        const rollbackCreatedPayments = async () => {
            const results = await Promise.all(createdPaymentIds.map((id) => removePayment(id)));
            return results.every(Boolean);
        };

        // Paket tahsilatı: ödeme doğrudan plana yazılır (randevu yok, isPaid yok).
        // Yöntem Kasa'dan geldiği için gün sonu kırılımı doğru olur.
        if (isPkgTicket(record.id)) {
            const planId = planIdOf(record.id);
            for (const [i, part] of used.entries()) {
                const p = await addPayment({
                    amount: part.amount, type: 'service', method: pmMap[part.method],
                    description: `Paket tahsilatı · ${record.service}${discount > 0 ? ` (indirim ${tl(discount)})` : ''}${partSuffix(i)}`,
                    customerId: record.customerId || undefined, treatmentPlanId: planId,
                });
                if (!p) {
                    const rolledBack = await rollbackCreatedPayments();
                    setProcessing(false);
                    setPayError(rolledBack
                        ? 'Tahsilat tamamlanamadı; yazılan parçalar geri alındı. Tekrar deneyin.'
                        : 'Tahsilat yarım kaldı. Hareketler listesini kontrol edip tekrar deneyin.');
                    return;
                }
                createdPaymentIds.push(p.id);
            }
            await loadPaidByPlan();
            // Kısmi tahsilatta paket bileti kuyrukta kalır — kalan bakiye canlı
            // hesaplandığı için bir sonraki tahsilat kaldığı yerden devam eder.
            if (remainingAfter <= 0) writePkgQueue(readPkgQueue().filter((x) => x !== planId));
            if (isPartial) {
                setProcessing(false); setParts([]); setStage('summary');
                toast.success(`${tl(paidNow)} alındı · ${tl(remainingAfter)} paket bakiyesi kaldı`);
                return;
            }
            const pkgSerial = `TF-PKT-${String(Object.keys(done).length + 1).padStart(2, '0')}`;
            setDone((v) => ({ ...v, [record.id]: { amount: paidNow, method: methodLabel, number: pkgSerial, change: changeDue, receipt } }));
            setProcessing(false); setStage('complete');
            toast.success(`${record.customerName} — paket tahsilatı ${tl(paidNow)}`);
            return;
        }

        // Kalan sıfırsa (kapora ile tamamen ödenmiş) yeni tahsilat yazılmaz, hesap kapatılır.
        let firstPaymentId: string | undefined;
        const description = lines.map((line) => line.name).filter(Boolean).join(' + ') || recordSummary;
        // Diş: her parça açık tedavi planlarına FIFO dağıtılarak yazılır; döküm
        // makbuzda gösterilmek üzere toplanır. Diğer sektörlerde tek satırdır.
        const allocTally = { allocated: 0, titles: [] as string[] };
        for (const [i, part] of used.entries()) {
            if (part.amount <= 0) continue;
            const base: NewPayment = {
                amount: part.amount, type: 'service', method: pmMap[part.method],
                description: `${discount > 0 ? `${description} (indirim ${tl(discount)})` : description}${partSuffix(i)}`,
                customerId: record.customerId || undefined, reservationId: record.id,
                staffId: recordMembers.length === 1 ? record.staffId : undefined,
            };
            const res = await collectAllocated(addPayment, base, { allocate: allocatePlans });
            if (!res) {
                const rolledBack = await rollbackCreatedPayments();
                setProcessing(false);
                setPayError(rolledBack
                    ? 'Tahsilat tamamlanamadı; yazılan parçalar geri alındı. Tekrar deneyin.'
                    : 'Tahsilat yarım kaldı. Hareketler listesini kontrol edip tekrar deneyin.');
                return;
            }
            for (const p of res.payments) createdPaymentIds.push(p.id);
            if (!firstPaymentId) firstPaymentId = res.payments[0]?.id;
            allocTally.allocated += res.allocated;
            for (const title of res.planTitles) if (!allocTally.titles.includes(title)) allocTally.titles.push(title);
        }
        setLastAlloc(allocTally.allocated > 0 ? allocTally : null);

        // Dijital müşteri kartı: kapanan her ziyaret 1 damga. Damga, tahsilatın
        // GERÇEKTEN bittiği tek yerde basılır — daha önce yalnız güzellik
        // dashboard'unun kendi kısa yolunda basılıyordu, kasadan tahsil edilen
        // ziyaretler (ve kuaför tarafı tümüyle) damgasız kalıyordu.
        // Grup hesabında aynı müşteri iki hizmet almışsa yine tek damga alır.
        const awardLoyaltyStamps = async () => {
            if (settings.loyaltyEnabled === false) return;
            const threshold = settings.loyaltyThreshold ?? 10;
            const customerIds = [...new Set(recordMembers.map((m) => m.customerId).filter(Boolean))] as string[];
            for (const customerId of customerIds) {
                const next = (customerById.get(customerId)?.loyaltyStamps ?? 0) + 1;
                const ok = await updateCustomer(customerId, { loyaltyStamps: next });
                // Damga tahsilatın yan etkisidir; başarısızlığı hesabı geri almaz.
                if (!ok) { console.error('Sadakat damgası yazılamadı:', customerId); continue; }
                if (next >= threshold) toast.success(`🎁 ${customerById.get(customerId)?.name || 'Müşteri'} hediye hak etti — ${next}/${threshold} damga`);
            }
        };

        const discountOwner = recordTicket?.representative || record;
        const storedCodeId = String(discountOwner.customFields?.[CASH_DISCOUNT_CODE_ID] || '');
        const storedCode = String(discountOwner.customFields?.[CASH_DISCOUNT_CODE] || '');
        const codeId = appliedCode?.id || storedCodeId;
        const codeLabel = appliedCode?.code || storedCode;
        const codeAlreadyRedeemed = discountOwner.customFields?.[CASH_DISCOUNT_REDEEMED] === true;
        const redeemAppliedCode = async () => {
            if (!codeId || codeAlreadyRedeemed) return;
            const redeemed = await redeemDiscountCode(codeId, firstPaymentId);
            if (!redeemed) {
                console.warn('Kod zaten kullanılmış olabilir:', codeLabel);
                return;
            }
            await updateReservation(discountOwner.id, {
                customFields: {
                    ...(discountOwner.customFields || {}),
                    [CASH_DISCOUNT_REDEEMED]: true,
                },
            });
            setAppliedCode(null);
        };

        // Kısmi tahsilat: hesap KAPANMAZ. Randevu kuyrukta kalır, kalan tutar
        // borç olarak görünür — "müşteri tamamını ödeyemedi, kasa karışmasın".
        if (isPartial) {
            await redeemAppliedCode();
            setProcessing(false); setParts([]); setStage('summary');
            toast.success(`${tl(paidNow)} alındı · ${tl(remainingAfter)} borç kaldı`);
            return;
        }

        // Grup hesabı ancak bütün hizmet satırları finansal olarak kapanırsa
        // kapanmış sayılır. Bir güncelleme başarısız olursa yeni ödeme parçaları
        // geri alınır ve daha önce kapanan üyeler tekrar açılır.
        const markedPaidIds: string[] = [];
        for (const member of recordMembers) {
            if (member.isPaid) continue;
            const updated = await updateReservation(member.id, { isPaid: true });
            if (!updated) {
                const rolledBack = await rollbackCreatedPayments();
                await Promise.all(markedPaidIds.map((id) => updateReservation(id, { isPaid: false })));
                setProcessing(false);
                setPayError(rolledBack
                    ? 'Hesap kapatılamadı; yeni tahsilat geri alındı. Tekrar deneyin.'
                    : 'Hesap yarım kaldı. Hareketler listesini kontrol etmeden yeniden tahsilat almayın.');
                return;
            }
            markedPaidIds.push(member.id);
        }
        await redeemAppliedCode();
        await awardLoyaltyStamps();
        await deductSoldStock(firstPaymentId);
        const serial = `TF-${(record.id.replace(/\D/g, '').slice(-4) || '0000').padStart(4, '0')}-${String(Object.keys(done).length + 1).padStart(2, '0')}`;
        setDone((v) => ({ ...v, [record.id]: { amount: paidNow, method: methodLabel, number: serial, change: changeDue, receipt } }));
        setProcessing(false); setStage('complete');
        toast.success(`${record.customerName} — ${tl(paidNow)} tahsil edildi`);
    };

    const nextOpen = unpaid.find((r) => r.id !== record?.id && !done[r.id]);

    // Kapora: hesabı kapatmadan kısmi tahsilat — kalan bakiyeden düşer
    const submitKapora = async () => {
        const amt = parseInt(kaporaAmt.replace(/\D/g, '') || '0', 10) || 0;
        if (!record || amt <= 0 || kaporaBusy) return;
        // Paket biletinde kısmi tahsilat kapora değil, doğrudan tutarı düşürmektir.
        if (isPkgTicket(record.id)) { toast('Paket tahsilatında tutarı doğrudan düzenleyin'); return; }
        if (amt > totalDue) { toast.error(`Kapora kalan tutardan (${tl(totalDue)}) fazla olamaz`); return; }
        setKaporaBusy(true);
        // Diş'te kapora da plan borcuna mahsup edilir — bakiye iki ekranda aynı kalsın.
        const res = await collectAllocated(addPayment, {
            amount: amt, type: 'service', method: kaporaMethod,
            description: `Kapora · ${recordSummary}`,
            customerId: record.customerId || undefined, reservationId: record.id,
            staffId: recordMembers.length === 1 ? record.staffId : undefined,
        }, { allocate: allocatePlans });
        setKaporaBusy(false);
        if (res) {
            toast.success(res.planTitles.length > 0
                ? `${tl(amt)} kapora alındı · ${tl(res.allocated)} plana mahsup edildi`
                : `${tl(amt)} kapora alındı`);
            setKaporaOpen(false); setKaporaAmt('');
        } else toast.error('Kapora kaydedilemedi');
    };

    // Not / belge: aktif randevuya serbest not
    const submitNote = async () => {
        if (!record || noteBusy) return;
        if (isPkgTicket(record.id)) { toast('Paket biletine not eklenemez'); return; }
        setNoteBusy(true);
        const ok = await updateReservation(record.id, { notes: noteText.trim() });
        setNoteBusy(false);
        if (ok) { toast.success('Not kaydedildi'); setNoteOpen(false); }
        else toast.error('Not kaydedilemedi');
    };

    const methodLabel = paymentMethodLabel;
    const kaporaValue = parseInt(kaporaAmt.replace(/\D/g, '') || '0', 10) || 0;

    // Paket hizmeti seçili hizmetle eşleşiyor mu (uyarı için)
    const pkgServiceMatch = useMemo(() => {
        if (!activePkg || !record) return false;
        const a = activePkg.title.toLocaleLowerCase('tr');
        const b = record.service.toLocaleLowerCase('tr');
        return a.includes(b) || b.includes(a);
    }, [activePkg, record]);

    // Bu seansı paketten karşıla: randevuyu plana bağla → mevcut motor 1 hak düşer,
    // hesap ₺0 kapanır. Çift sayımı paket_sayildi guard'ı (useReservations) önler.
    const coverFromPackage = async () => {
        if (!profile.packagesEnabled || !record || recordMembers.length !== 1 || !activePkg || coverBusy) return;
        setCoverBusy(true);
        const next = activePkg.sessionsDone + 1;
        const ok = await updateReservation(record.id, {
            status: 'completed', isPaid: true,
            customFields: { ...record.customFields, paket_plan_id: activePkg.id, paket_seans: `${next}/${activePkg.sessionCount}` },
        });
        setCoverBusy(false);
        if (!ok) { toast.error('Paketten karşılanamadı — tekrar deneyin'); return; }
        const serial = `TF-${(record.id.replace(/\D/g, '').slice(-4) || '0000').padStart(4, '0')}-P${String(next).padStart(2, '0')}`;
        setDone((v) => ({ ...v, [record.id]: { amount: 0, method: 'Paket hakkı', number: serial, change: 0, receipt: false } }));
        setCoverOpen(false); setStage('complete');
        toast.success(`${record.customerName} — seans paketten karşılandı (${next}/${activePkg.sessionCount})`);
    };

    return (
        <div className={`beauty-cash-final${profile.warmShell ? ' is-warm' : ''}`}>
            <header className="bf-header">
                <div className="bf-title">
                    <button type="button" className="bf-back" onClick={onBack} aria-label="Dashboard'a dön"><ArrowLeft size={17} /></button>
                    <span className="bf-logo"><BrandIcon size={20} /></span>
                    <div><span>{(settings.businessName || profile.fallbackBrand).toLocaleUpperCase('tr')}</span><h1>Kasa</h1></div>
                </div>
                <div className="bf-status"><span><Wifi size={14} /></span><div><strong>Kasa aktif</strong><small>{settings.businessName || 'Merkez Şube'}</small></div></div>
                <div className="bf-header-actions">
                    <button type="button" onClick={() => setShowMoves(true)}><ReceiptText size={16} /><span>Hareketler</span></button>
                    <button type="button" className="primary" onClick={() => setShowDayEnd(true)}><ShieldCheck size={16} /><span>Gün sonu</span></button>
                </div>
            </header>

            <section className="bf-nowbar" aria-label="Kasa özeti">
                <button type="button" className="bf-now" onClick={() => setTab('open')}><span><Zap size={15} /></span><p><small>ŞİMDİ</small><strong>{openCount} {queueNoun} ödeme bekliyor</strong></p><ChevronRight size={14} /></button>
                <div><small>BUGÜN TAHSİL EDİLEN</small><strong>{tl(stats.today)}</strong></div>
                <div><small>AÇIK SATIŞ</small><strong>{openCount} kayıt</strong></div>
                <div><small>BEKLEYEN TAHSİLAT</small><strong>{tl(unpaid.reduce((s, r) => s + balanceOf(r), 0))}</strong></div>
            </section>

            <main className="bf-workspace">
                {/* SOL — kuyruk */}
                <aside className="bf-queue" aria-label="Kasa kuyruğu">
                    <div className="bf-panel-head"><div><span>KASA KUYRUĞU</span><h2>Kasaya gelenler</h2></div><b>{openCount}</b></div>
                    <div className="bf-queue-tabs" role="tablist">
                        {([['open', 'Ödeme bekleyen'], ['completed', 'Bugün ödenen']] as [QueueTab, string][]).map(([id, label]) => (
                            <button type="button" role="tab" key={id} className={tab === id ? 'selected' : ''} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
                        ))}
                    </div>
                    <label className="bf-search"><Search size={16} /><input value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)} placeholder={`${customerWord} veya hizmet ara`} /></label>
                    <div className="bf-queue-list">
                        {visibleQueue.map((r, i) => {
                            const queueTicket = isPkgTicket(r.id) ? undefined : ticketContaining(salonTickets, r.id);
                            const isDone = Boolean(done[r.id] || queueTicket?.isPaid);
                            const isPkg = isPkgTicket(r.id);
                            const queueSummary = queueTicket?.serviceSummary || r.service;
                            const queueStaff = queueTicket?.staffNames.join(', ') || r.staffName;
                            return (
                                <button type="button" key={r.id} style={{ '--queue-index': i } as CSSProperties} className={`bf-queue-card${record?.id === r.id ? ' selected' : ''}${isPkg ? ' is-package' : ''}`} aria-pressed={record?.id === r.id} disabled={processing} onClick={() => chooseRecord(r.id)}>
                                    <span className={`bf-avatar ${isPkg ? 'purple' : 'blue'}`}>{isPkg ? <PackageCheck size={17} /> : initials(r.customerName)}</span>
                                    <span className="bf-queue-copy">
                                        <span><strong>{r.customerName}</strong><i className={isDone ? 'green' : isPkg ? 'purple' : 'blue'}>{isDone ? 'Ödendi' : isPkg ? 'Paket' : 'Kasada'}</i></span>
                                        <small>{isPkg ? r.service : [queueSummary, queueStaff].filter(Boolean).join(' · ')}</small>
                                        <em>{isPkg ? 'Paket bakiyesi · Paketler’den gönderildi' : `${r.startTime} · ${r.date}${queueTicket && queueTicket.members.length > 1 ? ` · ${queueTicket.members.length} hizmet` : ''}`}</em>
                                    </span>
                                    <span className="bf-queue-total"><strong>{tl(balanceOf(r))}</strong><small>{isDone ? 'kapandı' : 'kalan'}</small></span>
                                </button>
                            );
                        })}
                        {visibleQueue.length === 0 && <div className="bf-empty"><CircleCheck size={24} /><strong>Bu listede kayıt yok</strong><small>Başka bir sekme seçin.</small></div>}
                    </div>

                    {/* Diş: vadesi gelen taksitler — tıklayınca hasta dosyası açılır */}
                    {allocatePlans && dueInstallments.length > 0 && (
                        <div className="bf-inst-due">
                            <div className="bf-inst-head"><CalendarDays size={13} /><span>Vadesi gelen taksitler</span><b>{dueInstallments.length}</b></div>
                            {dueInstallments.map((inst) => (
                                <button type="button" key={inst.id} className={`bf-inst-row${inst.overdue ? ' overdue' : ''}`} onClick={() => navigate(profile.customerHref(inst.customerId))}>
                                    <span className="bf-inst-copy"><strong>{inst.customerName}</strong><small>{inst.planTitle} · {inst.seq}. taksit</small></span>
                                    <span className="bf-inst-amt"><strong>{tl(inst.amount)}</strong><small>{inst.overdue ? 'Gecikti' : new Date(`${inst.dueDate}T12:00:00`).toLocaleDateString('tr', { day: 'numeric', month: 'short' })}</small></span>
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                {/* ORTA — aktif hesap */}
                <section className="bf-order" aria-label="Aktif müşteri hesabı">
                    {!record ? (
                        <div className="bf-col-empty">
                            <span className="bf-empty-badge"><CircleCheck size={28} /></span>
                            <strong>Bekleyen tahsilat yok</strong>
                            <small>Kuyruğa bir {queueNoun} düştüğünde hesabı burada açılır.</small>
                        </div>
                    ) : (<>
                    <div className="bf-customer-head">
                        <div><span>{recordIsPkg ? 'PAKET TAHSİLATI' : `AKTİF HESAP · ${record.startTime}`}</span><h2>{record.customerName}</h2><p>{recordIsPkg ? record.service : [recordSummary, recordStaffNames.join(', ')].filter(Boolean).join(' · ')}</p></div>
                        <div className="bf-customer-actions"><span><CircleCheck size={14} />Otomatik kaydedildi</span><button type="button" onClick={() => record.customerId && navigate(profile.customerHref(record.customerId))}><UserRound size={16} />{customerWord} kartı</button></div>
                    </div>

                    {/* Paket bileti randevuya bağlı değil — randevu akışı şeridi yerine
                        nereden geldiğini söyleyen mor bir şerit gösterilir. */}
                    {recordIsPkg ? (
                        <div className="bf-pkg-note">
                            <PackageCheck size={16} />
                            <span>Paket bakiyesi tahsilatı — tahsilat <b>{record.service}</b> paketine işlenir, {t('reservation').toLocaleLowerCase('tr')} kapatılmaz.</span>
                        </div>
                    ) : (
                    <div className="bf-appointment-line">
                        <div><CalendarDays size={17} /><span><small>{t('reservation').toLocaleUpperCase('tr')} AKIŞI{recordMembers.length > 1 ? ` · ${recordMembers.length} HİZMET` : ''}</small><strong>{record.startTime}–{recordMembers[recordMembers.length - 1]?.endTime || record.endTime} · {recordSummary}</strong><em>{recordStaffNames.join(', ') || 'Uzman atanmadı'}</em></span></div>
                        <div className="bf-journey">
                            {[{ l: 'Geldi', t: record.customerArrivedAt }, { l: 'İşlem', t: record.arrivedAt }, { l: 'Kasada', t: record.serviceEndedAt }].map((s) => (
                                <span key={s.l} className={s.t ? 'done' : ''}><i>{s.t ? <Check size={10} /> : ''}</i><b>{s.l}</b><small>{s.t ? new Date(s.t).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' }) : '—'}</small></span>
                            ))}
                        </div>
                        <button type="button" aria-label={`${t('reservation')} ayrıntıları`} onClick={() => navigate('/calendar')}><MoreHorizontal size={18} /></button>
                    </div>
                    )}

                    <div className="bf-context-note blue"><CircleCheck size={15} /><span>{completed ? (recordIsPkg ? 'Tahsilat tamamlandı; pakete işlendi.' : `Satış tamamlandı; hesap ve bağlı ${t('reservation').toLocaleLowerCase('tr')} salt okunur.`) : recordIsPkg ? 'Paket bakiyesi · tahsilata hazır' : `${t('reservation')} tamamlandı · tahsilata hazır`}</span></div>

                    {/* Diş: mahsup dökümü toast'ta kaybolmasın — hesap açık kaldığı sürece görünür */}
                    {allocatePlans && lastAlloc && (
                        <div className="bf-context-note green"><CircleCheck size={15} /><span>Plan mahsubu: <b>{tl(lastAlloc.allocated)}</b> → {lastAlloc.titles.join(' · ')}</span></div>
                    )}

                    <section className="bf-lines">
                        <div className="bf-section-head"><div><h3>Hesap kalemleri</h3><span>{lines.length} kalem</span></div><strong>{tl(subtotal)}</strong></div>
                        <div className="bf-line-labels"><span>Hizmet / ürün</span><span>Tür</span><span>Tutar</span></div>
                        {lines.map((l) => (
                            <article className="bf-line" key={l.id}>
                                <span className="bf-line-icon">{l.kind === 'Hizmet' ? <Sparkles size={16} /> : <PackageCheck size={16} />}</span>
                                <span className="bf-line-copy"><strong>{l.name}{l.price <= 0 && !l.covered && l.id !== 'pkg' && ' · fiyat yok'}</strong><small>{l.detail}</small><em>{l.kind}</em></span>
                                {l.locked || completed ? <span className="bf-line-lock"><LockKeyhole size={12} />{l.lockLabel ?? 'Kilitli'}</span> : <span className="bf-quantity"><b>{l.quantity}</b></span>}
                                <strong className="bf-line-price">{tl(l.price * l.quantity)}</strong>
                                {!l.locked && !completed && <button type="button" className="bf-remove" aria-label="Kaldır" disabled={lineBusy} onClick={() => void removeExtra(l)}><Trash2 size={14} /></button>}
                            </article>
                        ))}
                    </section>

                    {!completed && (
                        <>
                            <section className="bf-catalog open">
                                <div className="bf-section-head"><div><h3>Kalem ekle</h3><span>Hizmet veya salon ürünü</span></div></div>
                                <label className="bf-catalog-search"><Search size={16} /><input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Hizmet ya da ürün ara" /></label>
                                {catalogSearch && (
                                    <div className="bf-suggestions">
                                        {catalog.map((s, i) => (
                                            <button type="button" key={s.id} disabled={lineBusy} style={{ '--suggestion-index': i } as CSSProperties} onClick={() => void addLine(s)}><span><strong>{s.name}</strong><small>{s.kind} · {s.detail}</small></span><em>{tl(s.price || 0)}</em><i><Plus size={13} /></i></button>
                                        ))}
                                        {catalog.length === 0 && <div className="bf-empty" style={{ padding: 18 }}><small>Sonuç yok</small></div>}
                                    </div>
                                )}
                            </section>

                            {/* Üç durum ayrı: (a) seans zaten paketten karşılandı — tekrar
                                karşılatma, pakete götür; (b) karşılanabilir bir paket var;
                                (c) paket yok. Eskiden (a) ve (b) aynı görünüyordu. */}
                            {profile.packagesEnabled && (() => {
                                const shownPkg = coveredPkg || (recordIsPkg ? packages.find((p) => p.id === planIdOf(record.id)) : undefined) || activePkg;
                                const isCovered = Boolean(coveredPkg) || recordIsPkg;
                                return (
                                    <button type="button" className="bf-benefits" disabled={!shownPkg}
                                        onClick={() => {
                                            if (!shownPkg) return;
                                            if (isCovered) navigate(`/packages?paket=${shownPkg.id}`);
                                            else setCoverOpen(true);
                                        }}>
                                        <span><PackageCheck size={19} /></span>
                                        <div>
                                            <strong>Haklar ve üyelik</strong>
                                            <small>{shownPkg
                                                ? `${shownPkg.title} · ${Math.max(0, shownPkg.sessionCount - shownPkg.sessionsDone)} hak kaldı${coveredPkg ? ' · bu seans paketten karşılandı' : ''}`
                                                : 'Aktif paket bulunamadı'}</small>
                                        </div>
                                        <b>{!shownPkg ? '—' : isCovered ? <>Paketi aç<ChevronRight size={14} /></> : <>Paketten karşıla<ChevronRight size={14} /></>}</b>
                                    </button>
                                );
                            })()}

                            <div className="bf-order-tools">
                                <button type="button" disabled={recordIsPkg} className={discount ? 'active' : ''} onClick={() => setDiscountOpen(true)}><BadgePercent size={16} />{recordIsPkg ? 'Paket indirimi kapalı' : discount ? `${tl(discount)} indirim` : 'İndirim'}</button>
                                <button type="button" className={record.notes ? 'active' : ''} onClick={() => { setNoteText(record.notes || ''); setNoteOpen(true); }}><ReceiptText size={16} />{record.notes ? 'Notu düzenle' : 'Not / belge'}</button>
                                <button type="button" className={priorPaid > 0 ? 'active' : ''} onClick={() => setKaporaOpen(true)}><WalletCards size={16} />{priorPaid > 0 ? `${tl(priorPaid)} kapora` : 'Kapora'}</button>
                                <button type="button" onClick={() => record.customerId && navigate(profile.customerHref(record.customerId))}><MoreHorizontal size={16} />{customerWord}</button>
                            </div>
                        </>
                    )}
                    </>)}
                </section>

                {/* SAĞ — ödeme paneli */}
                <aside className={`bf-payment${processing ? ' processing' : ''}`} aria-busy={processing}>
                    {!record ? (
                        <div className="bf-col-empty">
                            <span className="bf-empty-badge neutral"><ShieldCheck size={26} /></span>
                            <strong>Kasa hazır</strong>
                            <small>Ödeme adımı, kuyruktan bir {queueNoun} seçilince başlar.</small>
                        </div>
                    ) : (<>
                    <div className="bf-payment-steps">
                        <span className={stage === 'summary' ? 'active' : 'done'}><i>{stage === 'summary' ? '1' : <Check size={10} />}</i>Hesap</span><em />
                        <span className={stage === 'payment' ? 'active' : stage === 'complete' ? 'done' : ''}><i>{stage === 'complete' ? <Check size={10} /> : '2'}</i>Ödeme</span><em />
                        <span className={stage === 'complete' ? 'active' : ''}><i>3</i>Tamamlandı</span>
                    </div>

                    {stage === 'summary' && !completed && (
                        <section className="bf-payment-stage">
                            <div className="bf-payment-head"><div><span>HESAP KONTROLÜ</span><h2>Bugün alınacak</h2></div><i><ShieldCheck size={13} />Güvenli</i></div>
                            <div className="bf-due"><strong>{tl(totalDue)}</strong><span>{record.customerName} · {lines.length} kalem</span></div>
                            <div className="bf-breakdown">
                                <div><span>Ara toplam</span><strong>{tl(subtotal)}</strong></div>
                                {discount > 0 && <div className="green"><span>İndirim</span><strong>−{tl(discount)}</strong></div>}
                                {priorPaid > 0 && <div className="green"><span>Kapora / alınan</span><strong>−{tl(priorPaid)}</strong></div>}
                                <div className="total"><span>KALAN</span><strong>{tl(totalDue)}</strong></div>
                            </div>
                            {/* Tutar sıfırsa sebebini söyle: pakete dahil olmak ile fiyatın
                                girilmemiş olması çok farklı iki durum. Eskiden ikisine de
                                "hizmet fiyatı Ayarlar'dan girilmeli" deniyordu — bu, pakete
                                dahil seansa fiyat girmeye davet ediyordu (çift tahsilat). */}
                            {totalDue <= 0 && (coveredPkg
                                ? <div className="bf-context-note purple" style={{ margin: 0 }}><PackageCheck size={15} /><span>Bu seans <b>{coveredPkg.title}</b> paketinden karşılanıyor — tahsilat yok.</span></div>
                                : <div className="bf-context-note amber" style={{ margin: 0 }}><CircleAlert size={15} /><span>Tutar sıfır — hizmet fiyatı Ayarlar'dan girilmeli.</span></div>)}
                            <button type="button" className="bf-primary-pay" disabled={subtotal <= 0 && !coveredPkg} onClick={goToPayment}><span><ShieldCheck size={17} /></span><div><small>SONRAKİ ADIM</small><strong>{totalDue <= 0 ? (coveredPkg ? 'Hesabı kapat (pakete dahil)' : 'Satışı tamamla (kapora ile ödendi)') : `${tl(totalDue)} için ödemeye geç`}</strong></div><ArrowRight size={18} /></button>
                            <p className="bf-secure-note"><ShieldCheck size={13} />İndirimler ödeme öncesi kayda geçer.</p>
                        </section>
                    )}

                    {stage === 'payment' && !completed && (
                        <section className="bf-payment-stage">
                            <div className="bf-payment-head"><button type="button" className="bf-stage-back" onClick={() => setStage('summary')}><ArrowLeft size={15} />Hesaba dön</button><i><Wifi size={13} />Kayıt bağlantısı aktif</i></div>
                            <div className="bf-payment-amount">
                                <small>TAHSİL EDİLECEK</small>
                                <strong>{tl(splitMode ? paidNow : totalDue)}</strong>
                                <span>{splitMode ? `${parts.length} parça · toplam kalan ${tl(totalDue)}` : `${METHODS.find((m) => m.id === method)?.label} ile`}</span>
                            </div>

                            {!splitMode && (<>
                            <div className="bf-method-section">
                                <div className="bf-payment-section-title">
                                    <h3>Ödeme yöntemi</h3>
                                    <button type="button" className="bf-split-open" onClick={startSplit}>Tutarı böl / kısmi al</button>
                                </div>
                                <div className="bf-methods" role="radiogroup">
                                    {METHODS.map((m) => (
                                        <button type="button" role="radio" aria-checked={method === m.id} key={m.id} disabled={!m.supported} className={method === m.id ? 'selected' : ''} onClick={() => { if (!m.supported) { toast('Bu yöntem yakında'); return; } setMethod(m.id); setPayError(''); if (m.id === 'cash' && !cashReceived) setCashReceived(String(totalDue)); }}>
                                            <MethodIcon m={m.id} /><span><strong>{m.label}</strong><small>{m.detail}</small></span>{method === m.id && <Check size={14} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            </>)}

                            {/* Bölünmüş tahsilat: müşteri hem nakit hem kart verebilir ya da
                                tutarın bir kısmını şimdi ödeyip kalanını borç bırakabilir. */}
                            {splitMode && (
                                <div className="bf-paysplit">
                                    <div className="bf-payment-section-title">
                                        <h3>Tahsilatı böl</h3>
                                        <button type="button" className="bf-split-open" onClick={() => { setParts([]); setPayError(''); }}>Tek yönteme dön</button>
                                    </div>
                                    {parts.map((p, i) => (
                                        <div className="bf-split-row" key={p.id}>
                                            <select value={p.method} onChange={(e) => patchPart(p.id, { method: e.target.value as UiMethod })} aria-label={`${i + 1}. parça yöntemi`}>
                                                {METHODS.filter((m) => m.supported).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                                            </select>
                                            <div className="bf-split-amount"><b>₺</b>
                                                <input value={p.amount} inputMode="numeric" aria-label={`${i + 1}. parça tutarı`}
                                                    onChange={(e) => patchPart(p.id, { amount: e.target.value.replace(/\D/g, '') })} />
                                            </div>
                                            <button type="button" className="bf-split-remove" onClick={() => removePart(p.id)} aria-label="Parçayı kaldır"><Trash2 size={15} /></button>
                                        </div>
                                    ))}
                                    <button type="button" className="bf-split-add" onClick={addPart}><Plus size={14} />Yöntem ekle</button>
                                    <div className="bf-split-summary">
                                        <div><span>Şimdi alınan</span><strong>{tl(paidNow)}</strong></div>
                                        <div className={remainingAfter > 0 ? 'due' : 'green'}>
                                            <span>{remainingAfter > 0 ? 'Borç kalacak' : 'Kalan'}</span><strong>{tl(remainingAfter)}</strong>
                                        </div>
                                    </div>
                                    {isPartial && (
                                        <div className="bf-context-note amber" style={{ margin: 0 }}>
                                            <CircleAlert size={15} />
                                            <span>Hesap <b>kapanmayacak</b>. {tl(remainingAfter)} borç olarak kuyrukta kalır, sonraki tahsilatta kaldığı yerden devam eder.</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!splitMode && method === 'cash' && (
                                <div className="bf-cash-entry">
                                    <label><span>Alınan nakit</span><div><b>₺</b><input value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} inputMode="numeric" /></div></label>
                                    <span><small>PARA ÜSTÜ</small><strong>{tl(changeDue)}</strong></span>
                                    <div>{[totalDue, Math.ceil(totalDue / 100) * 100, Math.ceil(totalDue / 500) * 500].filter((v, i, a) => a.indexOf(v) === i).map((v) => <button type="button" key={v} onClick={() => setCashReceived(String(v))}>{tl(v)}</button>)}</div>
                                </div>
                            )}
                            {effectiveParts().some((p) => p.method === 'transfer') && <label className="bf-reference-field"><span>Havale / QR referansı</span><input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} placeholder="Örn. 847219" /></label>}

                            {!splitMode && <div className="bf-method-confirm"><MethodIcon m={method} /><span><small>SEÇİLİ YÖNTEM</small><strong>{METHODS.find((m) => m.id === method)?.label} · Kasa kaydı</strong></span></div>}
                            {payError && <div className="bf-payment-error" role="alert"><CircleAlert size={15} />{payError}</div>}
                            <button type="button" className={`bf-primary-pay${processing ? ' processing' : ''}`} onClick={submit} disabled={processing}>
                                <span>{processing ? <i className="bf-spinner" /> : <ShieldCheck size={17} />}</span>
                                <div>
                                    <small>{processing ? 'KAYDEDİLİYOR' : isPartial ? 'KISMİ TAHSİLAT' : 'ÖDEMEYİ TAMAMLA'}</small>
                                    <strong>{processing ? 'Lütfen bekleyin…' : isPartial ? `${tl(paidNow)} al, ${tl(remainingAfter)} borç bırak` : `${tl(paidNow)} tahsil et`}</strong>
                                </div>
                                {!processing && <ArrowRight size={18} />}
                            </button>
                            <label className="bf-receipt-default"><input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} /><span>Yazdırılabilir ödeme özeti hazırla</span></label>
                        </section>
                    )}

                    {stage === 'complete' && completed && (
                        <section ref={successRef} className="bf-payment-stage bf-success" role="status" tabIndex={-1}>
                            <span className="bf-success-icon"><Check size={28} /></span>
                            <small>ÖDEME TAMAMLANDI</small>
                            <h2>{tl(completed.amount)}</h2>
                            <p>{record.customerName} · {completed.method}</p>
                            <div className="bf-success-data"><span><small>İşlem no</small><strong>{completed.number}</strong></span>{completed.change > 0 && <span><small>Para üstü</small><strong>{tl(completed.change)}</strong></span>}</div>
                            <div className="bf-completion-checks"><span><Check size={13} />{t('reservation')} ve satış tamamlandı</span><span><Check size={13} />Tahsilat Kasa'ya işlendi</span>{allocatePlans && lastAlloc && <span><Check size={13} />{tl(lastAlloc.allocated)} tedavi planına mahsup: {lastAlloc.titles.join(' · ')}</span>}<span><Check size={13} />{completed.receipt ? 'Ödeme özeti yazdırmaya hazır' : 'Yazdırma özeti istenmedi'}</span></div>
                            <div className="bf-receipt-actions"><button type="button" onClick={() => window.print()}><Printer size={16} />Yazdır</button><button type="button" onClick={() => record.customerId && navigate(profile.customerHref(record.customerId))}><UserRound size={16} />{customerWord} kartı</button></div>
                            {nextOpen && <button type="button" className="bf-next-customer" onClick={() => chooseRecord(nextOpen.id)}><span><small>SIRADAKİ AÇIK HESAP</small><strong>{nextOpen.customerName}</strong><em>{tl(balanceOf(nextOpen))} kalan</em></span><ArrowRight size={18} /></button>}
                            <div className="bf-lock-note"><LockKeyhole size={14} />Bu işlem kilitlendi; yeniden tahsil edilemez.</div>
                        </section>
                    )}
                    </>)}
                </aside>
            </main>

            {/* Hareketler — bugünkü tahsilat listesi */}
            {showMoves && (
                <div style={DLG_OVERLAY} onClick={() => setShowMoves(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Kasa hareketleri" style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--dc-border)' }}>
                            <ReceiptText size={18} />
                            <div style={{ flex: 1 }}><strong style={{ fontSize: 15, fontWeight: 800 }}>Kasa hareketleri</strong><div style={{ fontSize: 12, color: 'var(--dc-muted)' }}>Bugün · {dayEnd.count} işlem · {tl(dayEnd.total)}</div></div>
                            <button type="button" style={{ ...DLG_GHOST, padding: '6px 10px' }} onClick={() => setShowMoves(false)}>Kapat</button>
                        </div>
                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {todayPayments.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--dc-muted)', fontSize: 13 }}>Bugün henüz tahsilat yok.</div>}
                            {todayPayments.map((p) => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, background: 'var(--dc-surface2)', border: '1px solid var(--dc-border)' }}>
                                    <span style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--dc-page)', flexShrink: 0 }}>{p.method === 'cash' ? <Banknote size={16} /> : p.method === 'transfer' ? <Landmark size={16} /> : <CreditCard size={16} />}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description || 'Tahsilat'}</div><div style={{ fontSize: 11, color: 'var(--dc-muted)' }}>{methodLabel(p.method)} · {new Date(p.paidAt).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' })}</div></div>
                                    <strong style={{ fontSize: 13.5, fontWeight: 800 }}>{tl(p.amount)}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Gün sonu — özet rapor */}
            {showDayEnd && (
                <div style={DLG_OVERLAY} onClick={() => setShowDayEnd(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Gün sonu özeti" style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--dc-border)' }}>
                            <ShieldCheck size={18} />
                            <div style={{ flex: 1 }}><strong style={{ fontSize: 15, fontWeight: 800 }}>Gün sonu özeti</strong><div style={{ fontSize: 12, color: 'var(--dc-muted)' }}>{new Date().toLocaleDateString('tr')} · {settings.businessName || 'Kasa'}</div></div>
                            <button type="button" style={{ ...DLG_GHOST, padding: '6px 10px' }} onClick={() => setShowDayEnd(false)}>Kapat</button>
                        </div>
                        <div style={{ padding: 18 }}>
                            <div style={{ textAlign: 'center', marginBottom: 16 }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--dc-muted)' }}>BUGÜN TAHSİL EDİLEN</div><div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em' }}>{tl(dayEnd.total)}</div><div style={{ fontSize: 12, color: 'var(--dc-muted)' }}>{dayEnd.count} işlem</div></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                {(['cash', 'card', 'transfer', 'other'] as PaymentMethod[]).filter((m) => dayEnd.m[m] > 0).map((m) => (
                                    <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, background: 'var(--dc-surface2)', border: '1px solid var(--dc-border)' }}>
                                        <span style={{ display: 'grid', placeItems: 'center' }}>{m === 'cash' ? <Banknote size={16} /> : m === 'transfer' ? <Landmark size={16} /> : m === 'card' ? <CreditCard size={16} /> : <WalletCards size={16} />}</span>
                                        <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{methodLabel(m)}</span>
                                        <strong style={{ fontSize: 13.5, fontWeight: 800 }}>{tl(dayEnd.m[m])}</strong>
                                    </div>
                                ))}
                                {dayEnd.count === 0 && <div style={{ padding: 18, textAlign: 'center', color: 'var(--dc-muted)', fontSize: 13 }}>Bugün tahsilat yok.</div>}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                                <button type="button" style={DLG_GHOST} onClick={() => window.print()}><Printer size={15} style={{ verticalAlign: -3, marginRight: 5 }} />Yazdır</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Not / belge */}
            {noteOpen && record && (
                <div style={DLG_OVERLAY} onClick={() => setNoteOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-label={`${t('reservation')} notu`} style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: 18 }}>
                            <strong style={{ fontSize: 15, fontWeight: 800 }}>Not / belge</strong>
                            <div style={{ fontSize: 12, color: 'var(--dc-muted)', margin: '2px 0 14px' }}>{record.customerName} · {recordSummary}</div>
                            <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder={`Bu ${t('reservation').toLocaleLowerCase('tr')} için not ekleyin…`} style={{ ...DLG_INPUT, resize: 'vertical', minHeight: 90, fontFamily: 'inherit' }} />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                                <button type="button" style={DLG_GHOST} onClick={() => setNoteOpen(false)}>Vazgeç</button>
                                <button type="button" style={DLG_PRIMARY} disabled={noteBusy} onClick={submitNote}>{noteBusy ? 'Kaydediliyor…' : 'Kaydet'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Kapora — kısmi tahsilat */}
            {kaporaOpen && record && (
                <div style={DLG_OVERLAY} onClick={() => setKaporaOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Kapora al" style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: 18 }}>
                            <strong style={{ fontSize: 15, fontWeight: 800 }}>Kapora al</strong>
                            <div style={{ fontSize: 12, color: 'var(--dc-muted)', margin: '2px 0 14px' }}>{record.customerName} · kalan {tl(totalDue)}</div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--dc-muted)', marginBottom: 6 }}>KAPORA TUTARI (₺)</label>
                            <input autoFocus inputMode="numeric" value={kaporaAmt} onChange={(e) => setKaporaAmt(e.target.value.replace(/\D/g, ''))} placeholder="0" style={DLG_INPUT} />
                            {totalDue > 0 && (
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    {[25, 50, 75].map((pct) => (
                                        <button key={pct} type="button" onClick={() => setKaporaAmt(String(Math.round(totalDue * pct / 100)))} style={{ flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--dc-border2)', background: 'transparent', color: 'var(--dc-ink)' }}>%{pct}</button>
                                    ))}
                                    <button type="button" onClick={() => setKaporaAmt(String(totalDue))} style={{ flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--dc-border2)', background: 'transparent', color: 'var(--dc-ink)' }}>Tamamı</button>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => (
                                    <button key={m} type="button" onClick={() => setKaporaMethod(m)} style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: kaporaMethod === m ? '1px solid var(--dc-ink)' : '1px solid var(--dc-border2)', background: kaporaMethod === m ? 'var(--dc-surface2)' : 'transparent', color: 'var(--dc-ink)' }}>{methodLabel(m)}</button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                                <button type="button" style={DLG_GHOST} onClick={() => setKaporaOpen(false)}>Vazgeç</button>
                                <button type="button" style={{ ...DLG_PRIMARY, opacity: (kaporaBusy || kaporaValue <= 0) ? .4 : 1, cursor: (kaporaBusy || kaporaValue <= 0) ? 'not-allowed' : 'pointer' }} disabled={kaporaBusy || kaporaValue <= 0} onClick={submitKapora}>{kaporaBusy ? 'Kaydediliyor…' : 'Kaporayı al'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Paketten karşıla — onay */}
            {profile.packagesEnabled && coverOpen && record && activePkg && (
                <div style={DLG_OVERLAY} onClick={() => setCoverOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Paketten karşıla" style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: 18 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--dc-purple-soft, #efe9fb)', color: 'var(--dc-purple, #7c5cff)' }}><PackageCheck size={20} /></span>
                                <div><strong style={{ fontSize: 15, fontWeight: 800 }}>Paketten karşıla</strong><div style={{ fontSize: 12, color: 'var(--dc-muted)' }}>{record.customerName}</div></div>
                            </div>
                            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--dc-surface2)', border: '1px solid var(--dc-border)', fontSize: 13, lineHeight: 1.5 }}>
                                <div><strong>{activePkg.title}</strong></div>
                                <div style={{ color: 'var(--dc-muted)' }}>Bu seans için <strong style={{ color: 'var(--dc-ink)' }}>1 hak</strong> düşülecek · kalan {activePkg.sessionCount - activePkg.sessionsDone} → {activePkg.sessionCount - activePkg.sessionsDone - 1}</div>
                                <div style={{ color: 'var(--dc-muted)' }}>Hesap <strong style={{ color: 'var(--dc-ink)' }}>₺0</strong> kapanır — nakit alınmaz.</div>
                            </div>
                            {!pkgServiceMatch && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 11, background: 'var(--dc-amber-soft, #fdf3e2)', color: 'var(--dc-amber-d, #a66a0e)', fontSize: 12.5, lineHeight: 1.45 }}>
                                    <CircleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>Seçili hizmet (<strong>{record.service}</strong>) paketle (<strong>{activePkg.title}</strong>) tam eşleşmiyor. Yine de bu paketten düşülsün mü?</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                                <button type="button" style={DLG_GHOST} onClick={() => setCoverOpen(false)}>Vazgeç</button>
                                <button type="button" style={DLG_PRIMARY} disabled={coverBusy} onClick={coverFromPackage}>{coverBusy ? 'İşleniyor…' : 'Paketten karşıla'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* İndirim — tutar girişli */}
            {discountOpen && (
                <div style={DLG_OVERLAY} onClick={() => setDiscountOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Hesap indirimi" style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: 18 }}>
                            <strong style={{ fontSize: 15, fontWeight: 800 }}>İndirim</strong>
                            <div style={{ fontSize: 12, color: 'var(--dc-muted)', margin: '2px 0 14px' }}>Ara toplam {tl(subtotal)}</div>
                            {/* İndirim kodu — "sizi özledik" mesajıyla giden kod (071).
                                Tutarı elle girmek yerine kod okutmak, kampanyanın
                                kimi geri getirdiğini ölçmenin tek yolu. */}
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--dc-muted)', marginBottom: 6 }}>İNDİRİM KODU</label>
                            {discountCodeLabel ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, background: 'var(--dc-green-bg)', color: 'var(--dc-green)', fontSize: 13, fontWeight: 700 }}>
                                    <BadgePercent size={16} />
                                    <span style={{ flex: 1 }}>{discountCodeLabel} · %{discountCodePercent}</span>
                                    <button type="button" disabled={discountSaving} onClick={() => void clearDiscount()}
                                        style={{ border: 'none', background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>kaldır</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input inputMode="text" autoCapitalize="characters" value={codeStr}
                                        onChange={(e) => { setCodeStr(e.target.value.toLocaleUpperCase('tr-TR')); setCodeError(''); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') void applyDiscountCode(); }}
                                        placeholder="Örn. K7RM2P"
                                        style={{ ...DLG_INPUT, flex: 1, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.08em' }} />
                                    <button type="button" style={{ ...DLG_GHOST, whiteSpace: 'nowrap' }}
                                        disabled={codeBusy || !codeStr.trim()} onClick={applyDiscountCode}>
                                        {codeBusy ? 'Kontrol…' : 'Uygula'}
                                    </button>
                                </div>
                            )}
                            {codeError && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--dc-red, #c0392b)' }}>{codeError}</div>}

                            <div style={{ height: 1, background: 'var(--dc-border)', margin: '16px 0' }} />

                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--dc-muted)', marginBottom: 6 }}>İNDİRİM TUTARI (₺)</label>
                            <input inputMode="numeric" value={discountStr} disabled={Boolean(discountCodeLabel)} onChange={(e) => { setDiscountStr(e.target.value.replace(/\D/g, '')); setAppliedCode(null); }} placeholder="0" style={{ ...DLG_INPUT, opacity: discountCodeLabel ? .55 : 1 }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
                                <button type="button" style={DLG_GHOST} disabled={discountSaving} onClick={() => void clearDiscount()}>{discountSaving ? 'Kaydediliyor…' : 'Kaldır'}</button>
                                <button type="button" style={DLG_PRIMARY} disabled={discountSaving || Boolean(discountCodeLabel)} onClick={() => void applyManualDiscount()}>{discountSaving ? 'Kaydediliyor…' : 'Uygula'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
