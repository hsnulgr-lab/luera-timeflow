import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, ArrowRight, BadgePercent, Banknote, Check, ChevronRight, CircleAlert, CircleCheck,
    CalendarDays, CreditCard, Landmark, LockKeyhole, MoreHorizontal, PackageCheck, Plus,
    Printer, ReceiptText, Search, ShieldCheck, Sparkles, Trash2, UserRound, WalletCards, Wifi, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { useCustomers } from '@/hooks/useCustomers';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { collectAllocated } from '@/lib/allocatePayment';
// Paket tahsilatı bileti: Paketler sayfasından gönderilen bakiye, kuyrukta
// randevu bileti gibi görünür (mor şeritle ayrılır) ve tahsilat Kasa'nın kendi
// yöntem/tutar akışından geçer — böylece gün sonu kırılımı doğru olur.
import { PKG_TICKET, isPkgTicket, planIdOf, readPkgQueue, writePkgQueue } from '@/lib/kasaPackageQueue';
import type { PaymentMethod, Reservation } from '@/types';
import './beautyCash.css';
import { reservationServiceLines, reservationPrice } from '@/utils/reservationServices';

// ── Beauty Kasa · 3 sütunlu ödeme deneyimi ───────────────────────────────────
// Tasarım: timeflow-beauty-cash-final (Claude Design), bf-* sınıfları birebir.
// ÇEKİRDEK AKIŞ gerçek veriye bağlı: kuyruk=ödenmemiş tamamlanmış randevular,
// hesap=hizmet+adisyon, ödeme=usePayments/collectAllocated. Backend'i olmayan
// yüzeyler (üyelik, hediye kartı, bahşiş, karma, iade, vardiya) görünür ama
// "yakında" ile pasif — sahte başarı üretilmez.

const tl = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const initials = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');

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
    { id: 'card', label: 'Kart', detail: 'Terminal 01', supported: true },
    { id: 'cash', label: 'Nakit', detail: 'Çekmece 01', supported: true },
    { id: 'transfer', label: 'Havale / QR', detail: 'Referans gerekli', supported: true },
    { id: 'gift', label: 'Hediye kartı', detail: 'Yakında', supported: false },
];

function MethodIcon({ m }: { m: UiMethod }) {
    if (m === 'cash') return <Banknote size={18} />;
    if (m === 'transfer') return <Landmark size={18} />;
    if (m === 'gift') return <WalletCards size={18} />;
    return <CreditCard size={18} />;
}

interface Line { id: string; name: string; detail: string; price: number; quantity: number; kind: 'Hizmet' | 'Ürün'; locked?: boolean; lockLabel?: string; covered?: boolean; }

/** Bölünmüş tahsilatın tek parçası — bir yöntem, bir tutar. */
interface PayPart { id: string; method: UiMethod; amount: string; }

const partAmount = (p: PayPart) => parseInt(p.amount.replace(/\D/g, '') || '0', 10) || 0;
const newPart = (method: UiMethod, amount: number): PayPart =>
    ({ id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, method, amount: String(Math.max(0, Math.round(amount))) });

/** Randevu bir paket hakkından mı karşılanıyor (BeautySessionModal / Kasa bağlar). */
const coveringPlanId = (r?: Reservation | null) => String(r?.customFields?.paket_plan_id ?? '');

export function BeautyCashRegister({ onBack }: { onBack: () => void }) {
    const navigate = useNavigate();
    const { addPayment, stats, payments } = usePayments();
    const { reservations, settings, updateReservation } = useReservations();
    const { packages } = useOrgPackages();
    const { customerById } = useCustomers();
    const { orgId } = useAuth();
    const [params] = useSearchParams();


    // Kuyruk: tahsil bekleyen tamamlanmış randevular (gerçek)
    const unpaidReservations = useMemo(
        () => reservations.filter((r) => r.status === 'completed' && !r.isPaid)
            .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
        [reservations],
    );
    const paidToday = useMemo(
        () => reservations.filter((r) => r.status === 'completed' && r.isPaid && r.date === new Date().toISOString().slice(0, 10)),
        [reservations],
    );

    // ── Paket tahsilatı biletleri ─────────────────────────────────────────────
    // Paket bakiyeleri kuyruğu doldurmasın diye TAMAMI listelenmez; yalnızca
    // Paketler sayfasından "Kasaya gönder" denenler gelir — müşteri kasaya
    // gelmiş gibi. Bakiye canlı hesaplanır (plan bedeli − plana bağlı ödemeler).
    const [paidByPlan, setPaidByPlan] = useState<Map<string, number>>(new Map());
    const loadPaidByPlan = useCallback(async () => {
        if (!orgId) return;
        const { data, error } = await supabase.from('payments')
            .select('treatment_plan_id, amount')
            .eq('organization_id', orgId).not('treatment_plan_id', 'is', null);
        if (error) { console.error(error); return; }
        const m = new Map<string, number>();
        for (const p of data || []) m.set(p.treatment_plan_id, (m.get(p.treatment_plan_id) || 0) + Number(p.amount));
        setPaidByPlan(m);
    }, [orgId]);
    useEffect(() => { void loadPaidByPlan(); }, [loadPaidByPlan, packages]);

    const [pkgQueue, setPkgQueue] = useState<string[]>(readPkgQueue);
    const paketParam = params.get('paket');
    useEffect(() => {
        if (!paketParam) return;
        setPkgQueue((prev) => {
            const next = [...new Set([paketParam, ...prev])];
            writePkgQueue(next);
            return next;
        });
        setSelectedId(PKG_TICKET + paketParam);
    }, [paketParam]);

    const planBalance = useCallback((planId: string) => {
        const plan = packages.find((p) => p.id === planId);
        if (!plan) return 0;
        return Math.max(0, plan.totalAmount - (paidByPlan.get(planId) || 0));
    }, [packages, paidByPlan]);

    const focused = params.get('reservation');
    const [selectedId, setSelectedId] = useState<string | null>(focused || null);
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
    const [extras, setExtras] = useState<Record<string, Line[]>>({});
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
    const [coverOpen, setCoverOpen] = useState(false);
    const [coverBusy, setCoverBusy] = useState(false);

    // Gönderilen paketlerden kuyruk bileti üret. Tahsil edilmiş olan (done)
    // bilet, başarı ekranı bozulmasın diye görünürde kalır.
    const pkgTickets = useMemo<Reservation[]>(() => pkgQueue.flatMap((planId) => {
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
            date: new Date().toISOString().slice(0, 10),
            startTime: '', endTime: '',
            service: plan.title,
            status: 'completed' as const,
            isPaid: false,
            createdAt: plan.createdAt,
        }];
    }), [pkgQueue, packages, planBalance, customerById, done]);

    const unpaid = useMemo(() => [...pkgTickets, ...unpaidReservations], [pkgTickets, unpaidReservations]);

    const record = useMemo(
        () => unpaid.find((r) => r.id === selectedId) || paidToday.find((r) => r.id === selectedId) || unpaid[0] || null,
        [unpaid, paidToday, selectedId],
    );
    const recordIsPkg = isPkgTicket(record?.id);
    // Bu randevu bir paket hakkından karşılanıyorsa hizmet satırı ÜCRETSİZDİR.
    // Eskiden fiyat yalnız hizmet adı eşleşmesinden geliyordu: paket başlığı
    // hizmet adıyla birebir aynı olduğunda (tek seanslık paketler) seans, paket
    // bedelinin üstüne bir kez daha tahsil ediliyordu. Artık bağ kaynak alınır.
    const coveredPkg = useMemo(() => {
        const planId = recordIsPkg ? '' : coveringPlanId(record);
        return planId ? packages.find((p) => p.id === planId) : undefined;
    }, [packages, record, recordIsPkg]);
    const completed = record ? done[record.id] : undefined;

    // Hesap kalemleri: kilitli hizmet + adisyon + oturumda eklenen ürünler
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
        const covered = Boolean(coveringPlanId(record));
        // Bir seansta birden fazla hizmet olabilir — her biri ayrı kalem olarak
        // görünür ki müşteri neyin ne kadar tuttuğunu fişte görebilsin.
        const svcLines: Line[] = reservationServiceLines(record, settings.services || []).map((l, i) => ({
            id: `svc-${l.id}-${i}`, name: l.name,
            detail: covered ? 'Paket hakkından karşılandı' : [record.staffName, 'Tamamlandı'].filter(Boolean).join(' · '),
            price: covered ? 0 : l.price,
            quantity: 1, kind: 'Hizmet', locked: true,
            lockLabel: covered ? 'Pakete dahil' : 'Randevu', covered,
        }));
        const adis: Line[] = (record.adisyonItems || []).map((a) => ({ id: a.id, name: a.name, detail: a.kind === 'product' ? 'Ürün · adisyon' : 'Ekstra', price: a.price, quantity: 1, kind: a.kind === 'product' ? 'Ürün' : 'Hizmet' }));
        return [...svcLines, ...adis, ...(extras[record.id] || [])];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record, extras, settings.services]);

    // Bugünkü tahsilatlar (Hareketler listesi + Gün sonu raporu)
    const dayISO = new Date().toISOString().slice(0, 10);
    const todayPayments = useMemo(
        () => payments.filter((p) => (p.paidAt || '').slice(0, 10) === dayISO).sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || '')),
        [payments, dayISO],
    );
    const dayEnd = useMemo(() => {
        const m: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
        for (const p of todayPayments) m[p.method] = (m[p.method] || 0) + p.amount;
        return { m, count: todayPayments.length, total: m.cash + m.card + m.transfer + m.other };
    }, [todayPayments]);
    // Bu hesaba önceden alınan tahsilat (kapora) — kapanışta çift tahsilatı önler
    // Paket biletinde bakiye zaten ödenenler düşülerek hesaplandı — tekrar düşme.
    const priorPaid = useMemo(
        () => record && !isPkgTicket(record.id)
            ? payments.filter((p) => p.reservationId === record.id).reduce((s, p) => s + p.amount, 0) : 0,
        [payments, record],
    );

    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const discount = Math.min(parseInt(discountStr || '0', 10) || 0, subtotal);
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
        () => record && !isPkgTicket(record.id) ? packages.find((p) => p.customerId === record.customerId && p.status === 'active' && p.sessionsDone < p.sessionCount) : undefined,
        [packages, record],
    );

    const openCount = unpaid.length;
    const visibleQueue = useMemo(() => {
        const src = tab === 'completed' ? paidToday : unpaid;
        const q = queueSearch.trim().toLocaleLowerCase('tr');
        return src.filter((r) => !q || `${r.customerName} ${r.service}`.toLocaleLowerCase('tr').includes(q));
    }, [tab, unpaid, paidToday, queueSearch]);

    const chooseRecord = (id: string) => {
        if (processing) return;
        setSelectedId(id);
        setStage(done[id] ? 'complete' : 'summary');
        setMethod('card'); setDiscountStr(''); setCashReceived(''); setTransferRef(''); setPayError(''); setParts([]);
    };

    const balanceOf = (r: Reservation) => {
        if (done[r.id]) return 0;
        if (isPkgTicket(r.id)) return planBalance(planIdOf(r.id));
        // Pakete dahil seans ücretsiz; adisyon kalemleri (ürün/ekstra) ücretlenir.
        const svcPrice = coveringPlanId(r) ? 0 : reservationPrice(r, settings.services || []);
        const gross = svcPrice + (r.adisyonItems || []).reduce((s, a) => s + a.price, 0);
        // Kapora veya kısmi tahsilat alınmışsa kuyrukta KALAN görünmeli — brüt
        // tutarı göstermek "ne kadar bekliyoruz" sorusunu yanlış cevaplıyordu.
        const already = payments.filter((p) => p.reservationId === r.id).reduce((s, p) => s + p.amount, 0);
        return Math.max(0, gross - already);
    };

    const removeExtra = (id: string) => {
        if (!record || processing || isPkgTicket(record.id)) return;
        setExtras((v) => ({ ...v, [record.id]: (v[record.id] || []).filter((l) => l.id !== id) }));
    };

    const catalog = useMemo(() => {
        const q = catalogSearch.trim().toLocaleLowerCase('tr');
        return (settings.services || []).filter((s) => (s.price ?? 0) > 0)
            .filter((s) => !q || s.name.toLocaleLowerCase('tr').includes(q))
            .slice(0, 6);
    }, [settings.services, catalogSearch]);

    const addLine = (name: string, price: number) => {
        // Paket bileti tek kalemdir — ek hizmet/ürün randevu hesabına aittir.
        if (!record || processing || isPkgTicket(record.id)) { if (record && isPkgTicket(record.id)) toast('Paket tahsilatına kalem eklenemez'); return; }
        setExtras((v) => ({ ...v, [record.id]: [...(v[record.id] || []), { id: `x-${Date.now()}`, name, detail: 'Ek hizmet', price, quantity: 1, kind: 'Hizmet' }] }));
        setCatalogSearch('');
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
                if (!p) { setProcessing(false); setPayError('Tahsilat kaydedilemedi — tekrar deneyin.'); return; }
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
        for (const [i, part] of used.entries()) {
            if (part.amount <= 0) continue;
            const p = await collectAllocated(addPayment, {
                amount: part.amount, type: 'service', method: pmMap[part.method],
                description: `${discount > 0 ? `${record.service} (indirim ${tl(discount)})` : record.service}${partSuffix(i)}`,
                customerId: record.customerId || undefined, reservationId: record.id,
            }, { allocate: false });
            if (!p) { setProcessing(false); setPayError('Tahsilat kaydedilemedi — tekrar deneyin.'); return; }
        }

        // Kısmi tahsilat: hesap KAPANMAZ. Randevu kuyrukta kalır, kalan tutar
        // borç olarak görünür — "müşteri tamamını ödeyemedi, kasa karışmasın".
        if (isPartial) {
            setProcessing(false); setParts([]); setStage('summary');
            toast.success(`${tl(paidNow)} alındı · ${tl(remainingAfter)} borç kaldı`);
            return;
        }

        await updateReservation(record.id, { isPaid: true });
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
        const p = await addPayment({
            amount: amt, type: 'service', method: kaporaMethod,
            description: `Kapora · ${record.service}`,
            customerId: record.customerId || undefined, reservationId: record.id,
        });
        setKaporaBusy(false);
        if (p) { toast.success(`${tl(amt)} kapora alındı`); setKaporaOpen(false); setKaporaAmt(''); }
        else toast.error('Kapora kaydedilemedi');
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

    const methodLabel = (m: PaymentMethod) => m === 'cash' ? 'Nakit' : m === 'card' ? 'Kart' : m === 'transfer' ? 'Havale' : 'Diğer';
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
        if (!record || !activePkg || coverBusy) return;
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
        <div className="beauty-cash-final">
            <header className="bf-header">
                <div className="bf-title">
                    <button type="button" className="bf-back" onClick={onBack} aria-label="Dashboard'a dön"><ArrowLeft size={17} /></button>
                    <span className="bf-logo"><Sparkles size={20} /></span>
                    <div><span>{(settings.businessName || 'LUERA BEAUTY').toLocaleUpperCase('tr')}</span><h1>Kasa</h1></div>
                </div>
                <div className="bf-status"><span><Wifi size={14} /></span><div><strong>Terminal hazır</strong><small>{settings.businessName || 'Merkez Şube'}</small></div></div>
                <div className="bf-header-actions">
                    <button type="button" onClick={() => setShowMoves(true)}><ReceiptText size={16} /><span>Hareketler</span></button>
                    <button type="button" className="primary" onClick={() => setShowDayEnd(true)}><ShieldCheck size={16} /><span>Gün sonu</span></button>
                </div>
            </header>

            <section className="bf-nowbar" aria-label="Kasa özeti">
                <button type="button" className="bf-now" onClick={() => setTab('open')}><span><Zap size={15} /></span><p><small>ŞİMDİ</small><strong>{openCount} müşteri ödeme bekliyor</strong></p><ChevronRight size={14} /></button>
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
                    <label className="bf-search"><Search size={16} /><input value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)} placeholder="Müşteri veya hizmet ara" /></label>
                    <div className="bf-queue-list">
                        {visibleQueue.map((r, i) => {
                            const isDone = Boolean(done[r.id]);
                            const isPkg = isPkgTicket(r.id);
                            return (
                                <button type="button" key={r.id} style={{ '--queue-index': i } as CSSProperties} className={`bf-queue-card${selectedId === r.id ? ' selected' : ''}${isPkg ? ' is-package' : ''}`} aria-pressed={selectedId === r.id} disabled={processing} onClick={() => chooseRecord(r.id)}>
                                    <span className={`bf-avatar ${isPkg ? 'purple' : 'blue'}`}>{isPkg ? <PackageCheck size={17} /> : initials(r.customerName)}</span>
                                    <span className="bf-queue-copy">
                                        <span><strong>{r.customerName}</strong><i className={isDone ? 'green' : isPkg ? 'purple' : 'blue'}>{isDone ? 'Ödendi' : isPkg ? 'Paket' : 'Kasada'}</i></span>
                                        <small>{isPkg ? r.service : [r.service, r.staffName].filter(Boolean).join(' · ')}</small>
                                        <em>{isPkg ? 'Paket bakiyesi · Paketler’den gönderildi' : `${r.startTime} · ${r.date}`}</em>
                                    </span>
                                    <span className="bf-queue-total"><strong>{tl(balanceOf(r))}</strong><small>{isDone ? 'kapandı' : 'kalan'}</small></span>
                                </button>
                            );
                        })}
                        {visibleQueue.length === 0 && <div className="bf-empty"><CircleCheck size={24} /><strong>Bu listede kayıt yok</strong><small>Başka bir sekme seçin.</small></div>}
                    </div>
                    <button type="button" className="bf-new-sale" onClick={() => navigate('/calendar')}><Plus size={16} />Randevusuz satış oluştur</button>
                </aside>

                {/* ORTA — aktif hesap */}
                <section className="bf-order" aria-label="Aktif müşteri hesabı">
                    {!record ? (
                        <div className="bf-col-empty">
                            <span className="bf-empty-badge"><CircleCheck size={28} /></span>
                            <strong>Bekleyen tahsilat yok</strong>
                            <small>Kuyruğa bir müşteri düştüğünde hesabı burada açılır.</small>
                        </div>
                    ) : (<>
                    <div className="bf-customer-head">
                        <div><span>{recordIsPkg ? 'PAKET TAHSİLATI' : `AKTİF HESAP · ${record.startTime}`}</span><h2>{record.customerName}</h2><p>{recordIsPkg ? record.service : [record.service, record.staffName].filter(Boolean).join(' · ')}</p></div>
                        <div className="bf-customer-actions"><span><CircleCheck size={14} />Otomatik kaydedildi</span><button type="button" onClick={() => record.customerId && navigate(`/beauty-customer/${record.customerId}`)}><UserRound size={16} />Müşteri kartı</button></div>
                    </div>

                    {/* Paket bileti randevuya bağlı değil — randevu akışı şeridi yerine
                        nereden geldiğini söyleyen mor bir şerit gösterilir. */}
                    {recordIsPkg ? (
                        <div className="bf-pkg-note">
                            <PackageCheck size={16} />
                            <span>Paket bakiyesi tahsilatı — tahsilat <b>{record.service}</b> paketine işlenir, randevu kapatılmaz.</span>
                        </div>
                    ) : (
                    <div className="bf-appointment-line">
                        <div><CalendarDays size={17} /><span><small>RANDEVU AKIŞI</small><strong>{record.startTime}–{record.endTime} · {record.service}</strong><em>{record.staffName || 'Uzman atanmadı'}</em></span></div>
                        <div className="bf-journey">
                            {[{ l: 'Geldi', t: record.customerArrivedAt }, { l: 'İşlem', t: record.arrivedAt }, { l: 'Kasada', t: record.serviceEndedAt }].map((s) => (
                                <span key={s.l} className={s.t ? 'done' : ''}><i>{s.t ? <Check size={10} /> : ''}</i><b>{s.l}</b><small>{s.t ? new Date(s.t).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' }) : '—'}</small></span>
                            ))}
                        </div>
                        <button type="button" aria-label="Randevu ayrıntıları" onClick={() => navigate('/calendar')}><MoreHorizontal size={18} /></button>
                    </div>
                    )}

                    <div className="bf-context-note blue"><CircleCheck size={15} /><span>{completed ? (recordIsPkg ? 'Tahsilat tamamlandı; pakete işlendi.' : 'Satış tamamlandı; hesap ve bağlı randevu salt okunur.') : recordIsPkg ? 'Paket bakiyesi · tahsilata hazır' : 'Randevu tamamlandı · tahsilata hazır'}</span></div>

                    <section className="bf-lines">
                        <div className="bf-section-head"><div><h3>Hesap kalemleri</h3><span>{lines.length} kalem</span></div><strong>{tl(subtotal)}</strong></div>
                        <div className="bf-line-labels"><span>Hizmet / ürün</span><span>Tür</span><span>Tutar</span></div>
                        {lines.map((l) => (
                            <article className="bf-line" key={l.id}>
                                <span className="bf-line-icon">{l.kind === 'Hizmet' ? <Sparkles size={16} /> : <PackageCheck size={16} />}</span>
                                <span className="bf-line-copy"><strong>{l.name}{l.price <= 0 && !l.covered && l.id !== 'pkg' && ' · fiyat yok'}</strong><small>{l.detail}</small><em>{l.kind}</em></span>
                                {l.locked || completed ? <span className="bf-line-lock"><LockKeyhole size={12} />{l.lockLabel ?? 'Kilitli'}</span> : <span className="bf-quantity"><b>{l.quantity}</b></span>}
                                <strong className="bf-line-price">{tl(l.price * l.quantity)}</strong>
                                {!l.locked && !completed && <button type="button" className="bf-remove" aria-label="Kaldır" onClick={() => removeExtra(l.id)}><Trash2 size={14} /></button>}
                            </article>
                        ))}
                    </section>

                    {!completed && (
                        <>
                            <section className="bf-catalog open">
                                <div className="bf-section-head"><div><h3>Hizmet ekle</h3><span>Ek hizmet veya ürün</span></div></div>
                                <label className="bf-catalog-search"><Search size={16} /><input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Hizmet ara ve ekle" /></label>
                                {catalogSearch && (
                                    <div className="bf-suggestions">
                                        {catalog.map((s, i) => (
                                            <button type="button" key={s.id} style={{ '--suggestion-index': i } as CSSProperties} onClick={() => addLine(s.name, s.price || 0)}><span><strong>{s.name}</strong><small>{s.duration ? `${s.duration} dk` : 'Hizmet'}</small></span><em>{tl(s.price || 0)}</em><i><Plus size={13} /></i></button>
                                        ))}
                                        {catalog.length === 0 && <div className="bf-empty" style={{ padding: 18 }}><small>Sonuç yok</small></div>}
                                    </div>
                                )}
                            </section>

                            {/* Üç durum ayrı: (a) seans zaten paketten karşılandı — tekrar
                                karşılatma, pakete götür; (b) karşılanabilir bir paket var;
                                (c) paket yok. Eskiden (a) ve (b) aynı görünüyordu. */}
                            {(() => {
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
                                <button type="button" className={discount ? 'active' : ''} onClick={() => setDiscountOpen(true)}><BadgePercent size={16} />{discount ? `${tl(discount)} indirim` : 'İndirim'}</button>
                                <button type="button" className={record.notes ? 'active' : ''} onClick={() => { setNoteText(record.notes || ''); setNoteOpen(true); }}><ReceiptText size={16} />{record.notes ? 'Notu düzenle' : 'Not / belge'}</button>
                                <button type="button" className={priorPaid > 0 ? 'active' : ''} onClick={() => setKaporaOpen(true)}><WalletCards size={16} />{priorPaid > 0 ? `${tl(priorPaid)} kapora` : 'Kapora'}</button>
                                <button type="button" onClick={() => record.customerId && navigate(`/beauty-customer/${record.customerId}`)}><MoreHorizontal size={16} />Müşteri</button>
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
                            <strong>Terminal hazır</strong>
                            <small>Ödeme adımı, kuyruktan bir müşteri seçilince başlar.</small>
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
                            <div className="bf-payment-head"><button type="button" className="bf-stage-back" onClick={() => setStage('summary')}><ArrowLeft size={15} />Hesaba dön</button><i><Wifi size={13} />Terminal hazır</i></div>
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

                            {!splitMode && <div className="bf-method-confirm"><MethodIcon m={method} /><span><small>SEÇİLİ YÖNTEM</small><strong>{METHODS.find((m) => m.id === method)?.label} · Terminal 01</strong></span></div>}
                            {payError && <div className="bf-payment-error" role="alert"><CircleAlert size={15} />{payError}</div>}
                            <button type="button" className={`bf-primary-pay${processing ? ' processing' : ''}`} onClick={submit} disabled={processing}>
                                <span>{processing ? <i className="bf-spinner" /> : <ShieldCheck size={17} />}</span>
                                <div>
                                    <small>{processing ? 'KAYDEDİLİYOR' : isPartial ? 'KISMİ TAHSİLAT' : 'ÖDEMEYİ TAMAMLA'}</small>
                                    <strong>{processing ? 'Lütfen bekleyin…' : isPartial ? `${tl(paidNow)} al, ${tl(remainingAfter)} borç bırak` : `${tl(paidNow)} tahsil et`}</strong>
                                </div>
                                {!processing && <ArrowRight size={18} />}
                            </button>
                            <label className="bf-receipt-default"><input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} /><span>Makbuz oluştur</span></label>
                        </section>
                    )}

                    {stage === 'complete' && completed && (
                        <section ref={successRef} className="bf-payment-stage bf-success" role="status" tabIndex={-1}>
                            <span className="bf-success-icon"><Check size={28} /></span>
                            <small>ÖDEME TAMAMLANDI</small>
                            <h2>{tl(completed.amount)}</h2>
                            <p>{record.customerName} · {completed.method}</p>
                            <div className="bf-success-data"><span><small>İşlem no</small><strong>{completed.number}</strong></span>{completed.change > 0 && <span><small>Para üstü</small><strong>{tl(completed.change)}</strong></span>}</div>
                            <div className="bf-completion-checks"><span><Check size={13} />Randevu ve satış tamamlandı</span><span><Check size={13} />Tahsilat Kasa'ya işlendi</span><span><Check size={13} />{completed.receipt ? 'Makbuz oluşturuldu' : 'Makbuz oluşturulmadı'}</span></div>
                            <div className="bf-receipt-actions"><button type="button" onClick={() => window.print()}><Printer size={16} />Yazdır</button><button type="button" onClick={() => record.customerId && navigate(`/beauty-customer/${record.customerId}`)}><UserRound size={16} />Müşteri kartı</button></div>
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
                    <div style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
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
                    <div style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
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
                    <div style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: 18 }}>
                            <strong style={{ fontSize: 15, fontWeight: 800 }}>Not / belge</strong>
                            <div style={{ fontSize: 12, color: 'var(--dc-muted)', margin: '2px 0 14px' }}>{record.customerName} · {record.service}</div>
                            <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="Bu randevuya not ekleyin…" style={{ ...DLG_INPUT, resize: 'vertical', minHeight: 90, fontFamily: 'inherit' }} />
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
                    <div style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
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
            {coverOpen && record && activePkg && (
                <div style={DLG_OVERLAY} onClick={() => setCoverOpen(false)}>
                    <div style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
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
                    <div style={DLG_CARD} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: 18 }}>
                            <strong style={{ fontSize: 15, fontWeight: 800 }}>İndirim</strong>
                            <div style={{ fontSize: 12, color: 'var(--dc-muted)', margin: '2px 0 14px' }}>Ara toplam {tl(subtotal)}</div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--dc-muted)', marginBottom: 6 }}>İNDİRİM TUTARI (₺)</label>
                            <input autoFocus inputMode="numeric" value={discountStr} onChange={(e) => setDiscountStr(e.target.value.replace(/\D/g, ''))} placeholder="0" style={DLG_INPUT} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
                                <button type="button" style={DLG_GHOST} onClick={() => { setDiscountStr(''); setDiscountOpen(false); }}>Kaldır</button>
                                <button type="button" style={DLG_PRIMARY} onClick={() => setDiscountOpen(false)}>Uygula</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
