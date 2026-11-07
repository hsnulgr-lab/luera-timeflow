import { useState, useMemo, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
    X, Plus, Wallet, User, Check, Phone, CalendarDays, Pencil, Ban, ArrowRight, DoorOpen,
    MessageCircle, Globe, Layers, Clock, UserX, CalendarClock, Undo2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apptPhase, PHASE_LABEL } from '@/lib/appointmentFlow';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { sendWhatsApp } from '@/services/whatsapp';
import { buildCancelMessage } from '@/services/waTemplates';
import { commsForSector } from '@/lib/sectorProfiles';
import { usePayments } from '@/hooks/usePayments';
import { useProducts } from '@/hooks/useProducts';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { useCashEnabled } from '@/hooks/useModules';
import { useTheme } from '@/contexts/ThemeContext';
import { computePatientFinance } from '@/lib/patientBalance';
import type { Reservation, PaymentMethod } from '@/types';
import { reservationPrice } from '@/utils/reservationServices';
import { toISODate } from '@/utils/date';
import { buildCustomerCard } from '../../../supabase/functions/_shared/agent/customerCard.ts';
import { withTitle } from '../../../supabase/functions/_shared/booking/hitap.ts';
import { timeLocative } from '../../../supabase/functions/_shared/booking/tr.ts';
import './randevuCekmecesi.css';

/** İptalden sonra "Geri Al" süresi; WhatsApp iptal mesajı bu süre dolunca gider. */
const CANCEL_UNDO_MS = 8000;

const PM: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];
const fmt = (n: number) => n.toLocaleString('tr-TR');
const tl = (n: number) => `${fmt(n)} ₺`;
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '');
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
/** "+90 542 602 60 48" — kayıtlı biçim ne olursa olsun okunur yazılır. */
const phoneTR = (p: string) => {
    const d = p.replace(/\D/g, '');
    const n = d.startsWith('90') ? d.slice(2) : d.startsWith('0') ? d.slice(1) : d;
    return n.length === 10 ? `+90 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}` : p;
};

interface Props { reservation: Reservation; onClose: () => void; onEdit?: (r: Reservation) => void; }

/** C bloğunun tonları — durum adı, renk ve zemin tasarımdaki sözlükten (TN). */
type Tone = 'ok' | 'pend' | 'here' | 'run' | 'due' | 'late' | 'paid' | 'cx';
const TONE: Record<Tone, { c: string; b: string; d?: string }> = {
    ok: { c: 'var(--tx)', b: 'var(--s2)', d: 'var(--m2)' },
    pend: { c: 'var(--am)', b: 'var(--amT)' },
    here: { c: 'var(--am)', b: 'var(--amT)' },
    run: { c: 'var(--ord)', b: 'var(--orT)' },
    due: { c: 'var(--ord)', b: 'var(--orT)' },
    late: { c: 'var(--rd)', b: 'var(--rdT)' },
    paid: { c: 'var(--gr)', b: 'var(--grT)' },
    cx: { c: 'var(--m1)', b: 'var(--s2)', d: 'var(--m2)' },
};

interface Btn { label: string; icon?: ReactNode; tone: 'ink' | 'or' | 'o'; onClick?: () => void; disabled?: boolean }

/**
 * Randevu penceresi — takvimde (ve panoda) bir randevuya tıklayınca sağdan
 * açılan çekmece. Tasarım: "Luera Masaustu - Randevu Penceresi v1"
 * (docs/randevu-penceresi-claude-design-prompt.md, 2026-11-08).
 *
 * Sekme yok: A kimlik · B zaman ve yer · C durum + sıradaki adım (sabit) ·
 * D hesap → müşteri (kendi içinde kayar) · E iptal (sabit). Davranış eski
 * pencereyle aynı (tahsilat, geri al, gelmedi, iptal + WhatsApp haberi);
 * değişen görünüm ve yerleşim.
 */
export const AdisyonModal = ({ reservation: r, onClose, onEdit }: Props) => {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { settings, reservations, updateReservation } = useReservations();
    const { payments, addPayment, removeByReservations, totalForCustomer } = usePayments();
    const cashOn = useCashEnabled();
    const { products } = useProducts();
    const { allCustomers } = useCustomers();
    const { staff } = useStaff();
    const staffName = (id?: string) => (id ? staff.find(s => s.id === id)?.name : undefined);
    const { packages } = useOrgPackages();
    const isDental = settings.sector === 'dis';
    const K = isDental ? 'Hasta' : 'Müşteri';
    const kDat = isDental ? 'Hastaya' : 'Müşteriye';

    const [lines, setLines] = useState<{ productId: string; name: string; price: number }[]>([]);
    const [discStr, setDiscStr] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [picking, setPicking] = useState(false);
    // Durum satırındaki "45 dk sonra / 3 gün önce" için açılış anı (render saf kalsın)
    const [nowMs] = useState(() => Date.now());

    const customer = allCustomers.find(c => c.id === r.customerId);
    const svcPrice = (x: Reservation) => reservationPrice(x, settings.services);

    // Çoklu hizmet booking'i: aynı group_id'li satırların hepsi tek birleşik adisyonda.
    const groupRes = useMemo(() => {
        if (!r.groupId) return [r];
        // Pencerenin açıldığı satır realtime listeye henüz düşmemiş olsa bile grup
        // hesabından ve toplu geri almadan kaybolmasın.
        const byId = new Map(
            [...reservations.filter((item) => item.groupId === r.groupId), r]
                .map((item) => [item.id, item]),
        );
        return [...byId.values()].sort((a, b) => (
            a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)
        ));
    }, [reservations, r]);
    const isGroup = groupRes.length > 1;
    const groupReservationIds = useMemo(() => groupRes.map((item) => item.id), [groupRes]);
    // Birleşik hesap tek finans kaydıdır; her zaman grubun kronolojik ilk
    // randevusuna bağlanır. Böylece hangi grup kartından açıldığı sonucu değiştirmez.
    const billingReservation = groupRes[0] || r;
    const billingReservationId = billingReservation.id;

    // Adisyon satırları: her randevu için hizmet + personelin canlı eklediği kalemler.
    const baseRows = groupRes.flatMap(x => [
        { name: x.service, sub: `${x.startTime}–${x.endTime}${x.staffName ? ` · ${x.staffName}` : ''}`, price: svcPrice(x), tag: undefined as string | undefined },
        ...(x.adisyonItems || []).map(it => ({
            name: it.name,
            sub: x.staffName ? `${x.staffName} seans sırasında ekledi` : 'Seans sırasında eklendi',
            price: it.price,
            tag: it.kind === 'product' ? 'Ürün' : it.kind === 'material' ? 'Malzeme' : 'Ekstra',
        })),
    ]);
    const baseTotal = baseRows.reduce((s, row) => s + row.price, 0);

    // Tedavi planı/taksit ödemesi kaynak randevuya bağlı olabilir; bu, o
    // randevunun adisyon tahsilatı değildir ve "geri al" kapsamına girmez.
    const resPayments = useMemo(
        () => {
            const reservationIdSet = new Set(groupReservationIds);
            return payments.filter(payment => payment.reservationId && reservationIdSet.has(payment.reservationId) && !payment.treatmentPlanId);
        },
        [payments, groupReservationIds],
    );
    const isPaid = groupRes.every(x => x.isPaid) || resPayments.length > 0;

    const discount = parseInt(discStr || '0', 10) || 0;
    const subtotal = baseTotal + lines.reduce((s, l) => s + l.price, 0);
    const net = Math.max(0, subtotal - discount);

    const addLine = (id: string) => {
        const p = products.find(x => x.id === id);
        if (p) setLines(prev => [...prev, { productId: p.id, name: p.name, price: p.price }]);
        setPicking(false);
    };

    const collect = async () => {
        if (net <= 0) return;
        const summary = [...groupRes.map(x => x.service), ...lines.map(l => l.name)].join(' + ');
        const desc = discount > 0 ? `${summary} (indirim ${fmt(discount)}₺)` : summary;
        const type = baseTotal > 0 ? 'service' : (lines.length ? 'product' : 'other');
        const p = await addPayment({
            amount: net, method, type, description: desc,
            customerId: billingReservation.customerId || undefined, reservationId: billingReservationId,
            productId: lines.length === 1 && baseTotal === 0 ? lines[0].productId : undefined,
        });
        // Tahsilat = randevu yaşam döngüsünün sonu; mobil finalize ile aynı şekilde tamamlanmış işaretlenir.
        if (p) {
            const updates = await Promise.all(groupRes.map((item) => updateReservation(item.id, { isPaid: true, status: 'completed' })));
            if (updates.every(Boolean)) toast.success(`${fmt(net)} ₺ tahsil edildi`);
        }
    };
    const undo = async () => {
        // Önce grubun bütün finans kayıtlarını atomik olarak sil; ancak ondan
        // sonra tüm randevuları ödenmedi yap. Böylece başka grup üyesinde ödeme
        // bırakıp bütün grubu ödenmedi işaretlemek mümkün değildir.
        // Genel kasa listesi son-N kayıtla sınırlı olabilir; ekranda ödeme
        // görünmese bile sunucu bütün grup kimliklerini kontrol edip temizler.
        const removed = await removeByReservations(groupReservationIds, true);
        if (!removed) return;
        const updates = await Promise.all(groupRes.map((item) => updateReservation(item.id, { isPaid: false })));
        if (updates.every(Boolean)) toast.success(resPayments.length > 0 ? 'Tahsilat geri alındı' : 'Ücretsiz tamamlama geri alındı');
    };

    // ── Faz + eylemler ──
    const phase = apptPhase(r);
    const confirmReservation = async () => {
        const updated = await updateReservation(r.id, { status: 'confirmed' });
        if (updated) toast.success('Randevu onaylandı');
    };
    const markArrived = async () => {
        // "Geç geldi" gelmedi damgasını da temizler (098 okuma kuralı)
        const updated = await updateReservation(r.id, { customerArrivedAt: new Date().toISOString(), ...(r.noShowAt ? { noShowAt: null } : {}) });
        if (updated) toast.success(r.staffName
            ? `${r.staffName} bilgilendirildi`
            : `${K} geldi olarak işaretlendi`);
    };
    // Gelmedi: randevu iptal EDİLMEZ, damga basılır (098) — raporlar ve
    // telefon aynı durumu görür. Yanlış basılırsa toast'tan geri alınır.
    const markNoShow = async () => {
        const updated = await updateReservation(r.id, { noShowAt: new Date().toISOString() });
        if (!updated) return;
        toast('Gelmedi olarak kaydedildi', { action: { label: 'Geri Al', onClick: () => updateReservation(r.id, { noShowAt: null }) } });
        onClose();
    };
    // İptal pencerenin içinde onay ister — tek tıkla yanlışlıkla iptal olmasın
    const [confirmCancel, setConfirmCancel] = useState(false);
    const { isConnected: waOn } = useWhatsApp();
    // İptalde müşteriye haber: varsayılan AÇIK (kullanıcı kararı, 2026-11-08).
    const [notifyCancel, setNotifyCancel] = useState(true);
    const canNotify = waOn && Boolean(r.customerPhone);
    const cancelRes = async () => {
        const prev = r.status;
        const updated = await updateReservation(r.id, { status: 'cancelled' });
        if (!updated) return;
        // Mesaj "Geri Al" süresi dolunca gider: geri alınan iptal için müşteriye
        // "iptal ettik" yazılmasın. Pencere kapansa da zamanlayıcı çalışır.
        const notify = notifyCancel && canNotify;
        let undone = false;
        const timer = notify ? window.setTimeout(() => {
            if (undone) return;
            const text = buildCancelMessage({
                customerName: r.customerName, date: r.date, startTime: r.startTime, service: r.service,
                businessName: settings.businessName, comms: commsForSector(settings.sector),
            });
            void sendWhatsApp(r.customerPhone, text, 'cancellation', r.customerId || undefined).then((res) => {
                if (!res.ok && res.reason !== 'not_connected') toast.error('İptal mesajı gönderilemedi', { description: 'Randevu iptal edildi; müşteriye ayrıca haber verin.' });
            });
        }, CANCEL_UNDO_MS) : null;
        toast('Randevu iptal edildi', {
            description: notify ? "Müşteriye birkaç saniye içinde WhatsApp'tan haber verilecek." : undefined,
            duration: CANCEL_UNDO_MS,
            action: { label: 'Geri Al', onClick: () => { undone = true; if (timer) window.clearTimeout(timer); void updateReservation(r.id, { status: prev }); } },
        });
        onClose();
    };
    const openDentalVisit = () => {
        onClose();
        navigate(`/dental-visit/${encodeURIComponent(r.id)}`);
    };
    // Ücretsiz kapatma: hizmet(ler) var ama toplam 0 → ödeme kaydı oluşturmadan kapat.
    const hasServiceRows = baseRows.length > 0;
    const completeFree = async () => {
        const updates = await Promise.all(groupRes.map((item) => updateReservation(item.id, { isPaid: true, status: 'completed' })));
        if (updates.every(Boolean)) toast.success(cashOn ? 'Ücretsiz tamamlandı' : 'Randevu tamamlandı');
    };

    // ── Müşteri verileri ──
    const groupIds = useMemo(() => new Set(groupReservationIds), [groupReservationIds]);
    const history = useMemo(
        () => (r.customerId ? reservations.filter(x => x.customerId === r.customerId).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime)) : []),
        [reservations, r.customerId],
    );
    const others = useMemo(() => history.filter(h => !groupIds.has(h.id)), [history, groupIds]);
    const isNewCustomer = Boolean(r.customerId) && others.length === 0;
    const realSpent = r.customerId ? totalForCustomer(r.customerId) : 0;
    const estSpent = history.filter(h => h.status === 'completed').reduce((s, h) => s + (settings.services.find(sv => sv.name === h.service)?.price || 0), 0);
    const ltv = realSpent > 0 ? realSpent : estSpent;
    const plans = useMemo(
        () => (r.customerId ? packages.filter(p => p.customerId === r.customerId && p.status !== 'cancelled') : []),
        [packages, r.customerId],
    );
    // Paket = çok seanslı ve süren plan; diş sektöründe bu "tedavi"dir, paket çipi çıkmaz.
    const activePkgs = isDental ? [] : plans.filter(p => p.status === 'active' && p.sessionCount > 1);
    const finance = useMemo(() => computePatientFinance(
        plans.map(p => ({ id: p.id, totalAmount: p.totalAmount, status: p.status })),
        r.customerId ? payments.filter(p => p.customerId === r.customerId) : [],
    ), [plans, payments, r.customerId]);
    const todayStr = toISODate(new Date(nowMs));   // yerel gün (UTC gece yarısı kayması olmasın)
    const lastVisit = others.find(h => h.status === 'completed' && h.date <= todayStr);
    // Tercih: WhatsApp asistanının müşteri kartıyla aynı hesap (tekrar etmeyen tercih yazılmaz).
    const pref = useMemo(() => {
        const visits = others
            .filter(h => h.status === 'completed' && h.date <= todayStr)
            .map(h => ({ date: h.date, start_time: h.startTime, service: h.service, staff_id: h.staffId ?? null }));
        if (visits.length < 2) return null;
        const card = buildCustomerCard(visits, new Map(staff.map(s => [s.id, s.name])));
        const parts = [
            card.topService ? `En sık: ${card.topService.name}` : null,
            card.topStaff ? `${withTitle(card.topStaff.name.split(' ')[0]) ?? card.topStaff.name} ile` : null,
            card.usualDay || card.usualTime ? `genelde ${[card.usualDay, card.usualTime].filter(Boolean).join(' ')}` : null,
        ].filter(Boolean);
        return parts.length ? parts.join(' · ') : null;
    }, [others, staff, todayStr]);

    // ── B: zaman ve yer ──
    const first = groupRes[0];
    const last = groupRes[groupRes.length - 1];
    const startAt = new Date(`${r.date}T${first.startTime}:00`);
    const durMin = groupRes.reduce((s, x) => s + Math.max(0, toMin(x.endTime) - toMin(x.startTime)), 0);
    const tomorrowStr = toISODate(new Date(nowMs + 86_400_000));
    const yesterdayStr = toISODate(new Date(nowMs - 86_400_000));
    const rel = r.date === todayStr ? 'Bugün' : r.date === tomorrowStr ? 'Yarın' : r.date === yesterdayStr ? 'Dün' : null;
    const dayLine = rel ? `${rel} · ${longDate(r.date)}` : longDate(r.date);
    const staffNames = [...new Set(groupRes.map(x => x.staffName).filter(Boolean))].join(', ');
    const svcLine = isGroup
        ? `${groupRes.length} hizmet${staffNames ? ` · ${staffNames}` : ''}`
        : `${r.service}${r.staffName ? ` · ${r.staffName}` : ''}`;
    const diffMin = Math.round((startAt.getTime() - nowMs) / 60_000);
    const ago = (m: number) => { const a = Math.abs(m); return a < 60 ? `${a} dk` : a < 1440 ? `${Math.round(a / 60)} saat` : `${Math.round(a / 1440)} gün`; };
    // "16:02’de", "16:30’da" — ek okunuşa göre (tr.ts)
    const at = (iso?: string | null) => { const t = hhmm(iso); return t ? `${t}${timeLocative(t).replace("'", '’')}` : ''; };

    // ── D: hesap ──
    const [hesapOpen, setHesapOpen] = useState(phase === 'done' && !isPaid);
    const dDRef = useRef<HTMLDivElement>(null);
    const hesapRef = useRef<HTMLDivElement>(null);
    const openHesap = () => {
        setHesapOpen(true);
        window.setTimeout(() => {
            if (dDRef.current && hesapRef.current) dDRef.current.scrollTo({ top: hesapRef.current.offsetTop - 8, behavior: 'smooth' });
        }, 30);
    };
    const payBtn: Btn = !cashOn
        ? (hasServiceRows
            ? { label: 'Randevuyu Tamamla', icon: <Check size={16} />, tone: 'ink', onClick: completeFree }
            : { label: 'Hizmet ekleyin', tone: 'ink', disabled: true })
        : net > 0
            ? { label: `${fmt(net)} ₺ Tahsil Et`, icon: <Wallet size={16} />, tone: 'or', onClick: collect }
            : hasServiceRows
                ? { label: 'Ücretsiz Tamamla', icon: <Check size={16} />, tone: 'ink', onClick: completeFree }
                : { label: 'Tutar yok', tone: 'ink', disabled: true };

    // ── C: durum + sıradaki adım ──
    const reschedule: Btn[] = onEdit ? [{ label: 'Başka güne al', icon: <CalendarClock size={16} />, tone: 'o', onClick: () => { onEdit(r); onClose(); } }] : [];
    const st: { tone: Tone; w: string; x?: string; d: string; btn?: Btn; alt?: Btn[] } = (() => {
        switch (phase) {
            case 'pending':
                return {
                    tone: 'pend', w: PHASE_LABEL.pending, x: diffMin > 0 ? `${ago(diffMin)} sonra` : undefined,
                    d: 'Randevu henüz onaylanmadı.',
                    btn: { label: 'Randevuyu Onayla', icon: <Check size={16} />, tone: 'ink', onClick: confirmReservation },
                };
            case 'missed': return r.noShowAt
                ? {
                    tone: 'late', w: PHASE_LABEL.missed, x: 'kaydedildi',
                    d: `Gelmedi olarak kaydedildi. ${K} gelirse “Geldi, geç kaldı” ile devam edin.`,
                    btn: { label: 'Geldi, geç kaldı', icon: <Check size={16} />, tone: 'ink', onClick: markArrived },
                    alt: reschedule,
                }
                : {
                    tone: 'late', w: PHASE_LABEL.missed, x: `${ago(diffMin)} geçti`,
                    d: `Randevu saati ${ago(diffMin)} önce geçti.`,
                    btn: { label: 'Gelmedi olarak kapat', icon: <UserX size={16} />, tone: 'ink', onClick: markNoShow },
                    alt: [{ label: 'Geldi, geç kaldı', icon: <Check size={16} />, tone: 'o', onClick: markArrived }, ...reschedule],
                };
            case 'inService':
                return {
                    tone: 'run', w: PHASE_LABEL.inService, x: r.arrivedAt ? `${at(r.arrivedAt)} başladı` : undefined,
                    d: cashOn ? 'Seans sürüyor. Bitince tamamlayıp tahsil edin.' : 'Seans sürüyor. Bitince tamamlayın.',
                    btn: !cashOn || hesapOpen ? payBtn : { label: 'Tamamla & Tahsilat', icon: <Wallet size={16} />, tone: 'or', onClick: openHesap },
                };
            case 'done': return isPaid
                ? { tone: 'paid', w: PHASE_LABEL.done, x: cashOn ? 'ödendi' : undefined, d: 'Seans kapandı.' }
                : { tone: 'due', w: PHASE_LABEL.done, x: 'tahsilat bekliyor', d: 'Hesap Kasa’da kapanınca seans biter.', btn: payBtn };
            case 'cancelled':
                return { tone: 'cx', w: 'İptal edildi', d: 'Takvimde yer tutmuyor.' };
            default: return r.customerArrivedAt
                ? {
                    tone: 'here', w: `${K} geldi · bekliyor`, x: `${at(r.customerArrivedAt)} geldi`,
                    d: r.staffName ? `${r.staffName} haberdar edildi.` : 'Hizmete başlanmayı bekliyor.',
                    btn: hesapOpen ? payBtn : { label: 'Hesabı aç', icon: <Wallet size={16} />, tone: 'ink', onClick: openHesap },
                }
                : {
                    tone: 'ok', w: PHASE_LABEL.upcoming, x: diffMin > 0 ? `${ago(diffMin)} sonra` : 'şimdi',
                    d: `${K} gelince “${K} Geldi”ye basın.`,
                    btn: { label: `${K} Geldi`, icon: <Check size={16} />, tone: 'ink', onClick: markArrived },
                };
        }
    })();
    // Diş: hasta ziyareti birincilin yanında ikincil düğme
    const dentalBtn: Btn | null = isDental && phase !== 'cancelled'
        ? { label: 'Hasta Ziyaretini Aç', icon: <ArrowRight size={15} />, tone: 'o', onClick: openDentalVisit }
        : null;
    const T = TONE[st.tone];
    const altBtns = [...(st.alt ?? []), ...(dentalBtn ? [dentalBtn] : [])];
    // Diş + tek birincil: yan yana (1fr auto); gelmedi: birincil üstte, ikinciller altta
    const cbsClass = !st.btn ? ' one' : dentalBtn && !(st.alt?.length) ? ' two' : '';

    // ── A: çipler ──
    const chips: { icon: ReactNode; text: string; color?: string }[] = [];
    if (r.source === 'whatsapp') chips.push({ icon: <MessageCircle size={14} />, text: 'WhatsApp’tan' });
    else if (r.source === 'booking') chips.push({ icon: <Globe size={14} />, text: 'Online randevu' });
    else if (r.source === 'leadflow') chips.push({ icon: <Globe size={14} />, text: 'LeadFlow’dan' });
    if ((phase === 'upcoming' || phase === 'pending') && r.customerConfirm === 'yes') chips.push({ icon: <Check size={14} />, text: 'Gelirim dedi', color: 'var(--gr)' });
    if ((phase === 'upcoming' || phase === 'pending') && r.customerConfirm === 'no') chips.push({ icon: <X size={14} />, text: 'Gelemem dedi', color: 'var(--rd)' });
    if (finance.balance > 0) chips.push({ icon: <Wallet size={14} />, text: `Borç ${tl(finance.balance)}`, color: 'var(--rd)' });
    if (activePkgs.length === 1) chips.push({ icon: <Layers size={14} />, text: `Paket · ${Math.max(0, activePkgs[0].sessionCount - activePkgs[0].sessionsDone)}/${activePkgs[0].sessionCount} kaldı` });
    else if (activePkgs.length > 1) chips.push({ icon: <Layers size={14} />, text: `${activePkgs.length} paket` });
    if (lastVisit) chips.push({ icon: <Clock size={14} />, text: `Son ziyaret ${shortDate(lastVisit.date)}` });
    const initials = r.customerName.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr');

    // ── Geçmiş: yaklaşan ve geçmiş ayrı, insan diliyle ──
    const nowKey = `${todayStr} ${new Date(nowMs).toTimeString().slice(0, 5)}`;
    const upcomingList = others.filter(h => h.status !== 'cancelled' && `${h.date} ${h.startTime}` >= nowKey).reverse().slice(0, 4);
    const pastList = others.filter(h => !upcomingList.includes(h)).slice(0, Math.max(0, 8 - upcomingList.length));
    const histKind = (h: Reservation): [string, string] => {
        const p = apptPhase(h, { now: new Date(nowMs) });
        if (p === 'done') return ['Tamamlandı', 'var(--gr)'];
        if (p === 'cancelled') return ['İptal', 'var(--m1)'];
        if (p === 'missed') return ['Gelmedi', 'var(--rd)'];
        return [PHASE_LABEL[p], 'var(--tx)'];
    };
    const histRow = (h: Reservation) => {
        const [label, color] = histKind(h);
        return (
            <div className="hi" key={h.id}>
                <div className="a"><span className="d">{longDate(h.date)} · {h.startTime}</span><span className="s">{h.service}</span></div>
                <span className="k" style={{ color }}>{label}</span>
            </div>
        );
    };

    // ── Konum: perde üst çubuğun altından, seçili blok delikten görünür ──
    const [geo, setGeo] = useState<{ top: number; hole: { l: number; t: number; w: number; h: number } | null }>({ top: 0, hole: null });
    useLayoutEffect(() => {
        const update = () => {
            const bar = document.querySelector('[data-cal-topbar]');
            const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom + 6) : 0;
            const el = document.querySelector(`[data-res-id="${CSS.escape(r.id)}"]`);
            const b = el?.getBoundingClientRect();
            setGeo({ top, hole: b && b.width > 0 ? { l: b.left, t: b.top - top, w: b.width, h: b.height } : null });
        };
        update();
        // Takvim açılışta hâlâ yerleşiyor olabilir (görünüm değişimi, realtime); kısa bir gecikmeyle bir kez daha ölç.
        const late = window.setTimeout(update, 250);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => { window.clearTimeout(late); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
    }, [r.id]);

    // ── Klavye: Esc önce açık olanı, sonra pencereyi kapatır; açılışta odak pencerede ──
    const dwRef = useRef<HTMLElement>(null);
    const keepRef = useRef<HTMLButtonElement>(null);
    useEffect(() => { dwRef.current?.focus(); }, []);
    useEffect(() => { if (confirmCancel) keepRef.current?.focus(); }, [confirmCancel]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            if (picking) setPicking(false);
            else if (confirmCancel) setConfirmCancel(false);
            else onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [confirmCancel, picking, onClose]);
    // Enter birincili tetiklemez — yanlışlıkla tahsilat olmasın (yalnız tıklama ve Boşluk)
    const noEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault(); };
    const button = (b: Btn, primary = false) => (
        <button type="button" key={b.label} className={`b44 ${b.tone}`} disabled={b.disabled} onClick={b.onClick}
            onKeyDown={primary ? noEnter : undefined} data-primary={primary ? '1' : undefined}>
            {b.tone !== 'o' && b.icon}{b.label}{b.tone === 'o' && b.icon}
        </button>
    );
    const cancelLines = [
        'Saat boşa çıkar.',
        ...(r.customFields?.paket_plan_id ? ['Paket hakkı kullanılmamış sayılır.'] : []),
        ...(isPaid ? ['Alınan ödeme Kasa’da kalır.'] : []),
    ];
    const discPct = subtotal > 0 && discount > 0 ? `%${Math.round((discount / subtotal) * 100)}` : null;
    const showPayFields = hesapOpen && phase !== 'cancelled';

    return (
        <div className={`rcw${dark ? ' dark' : ''}`}>
            <div className={`rcw-scr${geo.hole ? '' : ' full'}`} style={{ top: geo.top }} onClick={onClose} aria-hidden="true">
                {geo.hole && <div className="rcw-hole" style={{ left: geo.hole.l, top: geo.hole.t, width: geo.hole.w, height: geo.hole.h }} />}
            </div>
            <section ref={dwRef} className={`rcw-dw${confirmCancel ? ' cfo' : ''}`} role="dialog" aria-modal="true"
                aria-label={`${K} randevusu · ${r.customerName}`} tabIndex={-1} style={{ top: geo.top ? geo.top + 6 : 16 }}>
                <span className="rcw-grab" />

                {/* A · kimlik */}
                <div className="dA">
                    <span className={`av${isNewCustomer ? ' nw' : ''}`}>{initials || '?'}</span>
                    <div className="who">
                        <span className="ey">{isNewCustomer ? `Yeni ${K.toLocaleLowerCase('tr')}` : K}</span>
                        <h3 className="nm">{r.customerName}</h3>
                        {chips.length > 0 && (
                            <div className="chips">
                                {chips.map(c => <span key={c.text} className="cp"><span className="ic">{c.icon}</span><span style={c.color ? { color: c.color } : undefined}>{c.text}</span></span>)}
                            </div>
                        )}
                    </div>
                    <div className="hbt">
                        {onEdit && phase !== 'cancelled' && (
                            <button type="button" className="b36 o" onClick={() => { onEdit(r); onClose(); }}><Pencil size={14} />Düzenle</button>
                        )}
                        <button type="button" className="b36 ic" aria-label="Kapat (Esc)" onClick={onClose}><X size={18} /></button>
                    </div>
                </div>

                {/* B · zaman ve yer */}
                <div className="dB">
                    <span className={`ey${rel === 'Bugün' ? ' or' : ''}`}>{dayLine}</span>
                    <div className="tm">
                        <span className="tt">{first.startTime}<i>–</i>{last.endTime}</span>
                        <span className="du">{durMin} dk</span>
                    </div>
                    <div className="lc">
                        <span>{svcLine}</span>
                        {r.resourceName && <span><DoorOpen size={15} className="ic" />{r.resourceName}</span>}
                    </div>
                </div>

                {/* C · durum + sıradaki adım */}
                <div className={`dC${altBtns.length ? ' col' : ''}`} style={{ background: T.b }}>
                    <div className="cx">
                        <div className="cw">
                            <i style={{ background: T.d || T.c }} />
                            <b style={{ color: T.c }}>{st.w}</b>
                            {st.x && <span style={{ color: T.c }}>· {st.x}</span>}
                        </div>
                        <p>{st.d}</p>
                    </div>
                    {altBtns.length > 0 ? (
                        <div className={`cbs${cbsClass}`}>
                            {st.btn && button(st.btn, true)}
                            {altBtns.map(b => button(b))}
                        </div>
                    ) : st.btn && button(st.btn, true)}
                </div>

                {/* D · hesap → müşteri */}
                <div className="dD" ref={dDRef}>
                    {r.notes && (
                        <div className="sec"><div className="note"><span className="ey">Randevu notu</span><span>{r.notes}</span></div></div>
                    )}

                    <div className="sec" ref={hesapRef}>
                        {!cashOn ? (
                            <>
                                <div className="sh"><span className="ey">Seans</span><span className="kl">Kasa modülü kapalı · para tutulmaz</span></div>
                                <div className="hl">
                                    {baseRows.map((row, i) => (
                                        <div className="hr" key={i}><div className="hm"><div className="hn">{row.tag && <span className="tg">{row.tag}</span>}<span>{row.name}</span></div><div className="hs">{row.sub}</div></div></div>
                                    ))}
                                </div>
                            </>
                        ) : isPaid ? (
                            <>
                                <div className="sh"><span className="ey">Hesap</span><span className="pd"><Check size={14} />Ödendi</span></div>
                                <div className="hl">
                                    {resPayments.map(p => (
                                        <div className="hr" key={p.id}>
                                            <div className="hm"><div className="hn"><span>{p.description || 'Tahsilat'}</span></div><div className="hs">{[staffName(p.staffId), PM.find(m => m.key === p.method)?.label].filter(Boolean).join(' · ')}</div></div>
                                            <div className="hp">{tl(p.amount)}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="sums"><div className="sm t2"><span>Tahsil edilen</span><span>{tl(resPayments.reduce((s, p) => s + p.amount, 0) || net)}</span></div></div>
                                <button type="button" className="b36 q" style={{ margin: '8px 0 0 -10px' }} onClick={undo}><Undo2 size={15} />Ödemeyi geri al</button>
                            </>
                        ) : (
                            <>
                                <div className="sh"><span className="ey">Hesap</span><span className={`tot${phase === 'cancelled' ? ' mu' : ''}`}>{tl(net)}</span></div>
                                <div className="hl">
                                    {baseRows.map((row, i) => (
                                        <div className="hr" key={`b${i}`}>
                                            <div className="hm"><div className="hn">{row.tag && <span className="tg">{row.tag}</span>}<span>{row.name}</span></div><div className="hs">{row.sub}</div></div>
                                            <div className="hp">{tl(row.price)}</div>
                                        </div>
                                    ))}
                                    {lines.map((l, i) => (
                                        <div className="hr" key={`l${i}`}>
                                            <div className="hm"><div className="hn"><span className="tg">Ürün</span><span>{l.name}</span></div><div className="hs">Masada eklendi</div></div>
                                            <div className="hp">{tl(l.price)}<button type="button" className="ib" aria-label={`${l.name} kalemini kaldır`} onClick={() => setLines(prev => prev.filter((_, x) => x !== i))}><X size={14} /></button></div>
                                        </div>
                                    ))}
                                </div>
                                {phase !== 'cancelled' && products.length > 0 && (
                                    <>
                                        <button type="button" className="add" aria-expanded={picking} onClick={() => setPicking(v => !v)}><Plus size={15} className="ic" />Ürün ekle</button>
                                        {picking && (
                                            <div className="pick" role="listbox" aria-label="Ürün seç">
                                                {products.map(p => (
                                                    <button type="button" role="option" aria-selected={false} key={p.id} onClick={() => addLine(p.id)}><span>{p.name}</span><b>{tl(p.price)}</b></button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                                {showPayFields && (
                                    <>
                                        <div className="kv">
                                            <span className="kl">İndirim</span>
                                            <span className="fld">
                                                {discPct && <span className="fh">{discPct}</span>}
                                                <input className="fi" inputMode="numeric" aria-label="İndirim, lira" placeholder="0 ₺"
                                                    value={discStr ? `${fmt(discount)} ₺` : ''}
                                                    onChange={e => setDiscStr(e.target.value.replace(/[^0-9]/g, ''))} />
                                            </span>
                                        </div>
                                        <div className="kv">
                                            <span className="kl">Ödeme yöntemi</span>
                                            <div className="seg" role="radiogroup" aria-label="Ödeme yöntemi">
                                                {PM.map(m => (
                                                    <button type="button" key={m.key} role="radio" aria-checked={method === m.key} className={method === m.key ? 'on' : ''} onClick={() => setMethod(m.key)}>{m.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                        {discount > 0 && (
                                            <div className="sums">
                                                <div className="sm"><span>Ara toplam</span><span>{tl(subtotal)}</span></div>
                                                <div className="sm"><span>İndirim</span><span>−{tl(discount)}</span></div>
                                                <div className="sm t2"><span>Toplam</span><span>{tl(net)}</span></div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {r.customerId && (
                        <div className="sec">
                            <div className="sh">
                                <span className="ey">{K}</span>
                                <button type="button" className="lk" onClick={() => { onClose(); navigate(`/customers?open=${encodeURIComponent(r.customerId!)}`); }}>{K} kartını aç<ArrowRight size={14} /></button>
                            </div>
                            {isNewCustomer ? (
                                <p className="nw1"><b>Yeni {K.toLocaleLowerCase('tr')}</b> · ilk randevu · geçmiş kayıt yok</p>
                            ) : (
                                <div className="stt">
                                    <div className="sv"><span className="ey">Yaşam boyu değer</span><b>{tl(ltv)}</b></div>
                                    <div className="sv"><span className="ey">Toplam randevu</span><b>{history.length}</b></div>
                                    {finance.balance > 0 && <div className="sv"><span className="ey">Bakiye</span><b style={{ color: 'var(--rd)' }}>{tl(finance.balance)} borç</b></div>}
                                </div>
                            )}
                            {activePkgs.map(p => {
                                const left = Math.max(0, p.sessionCount - p.sessionsDone);
                                return (
                                    <div className="pk" key={p.id}>
                                        <div className="r"><span>{p.title}</span><span>{left}/{p.sessionCount} kaldı</span></div>
                                        <span className="bar"><i style={{ width: `${(left / p.sessionCount) * 100}%` }} /></span>
                                    </div>
                                );
                            })}
                            {pref && <div className="ln"><User size={15} className="ic" /><span>{pref}</span></div>}
                            {(customer?.phone || r.customerPhone)
                                ? <div className="ln"><Phone size={15} className="ic" /><span>{phoneTR(customer?.phone || r.customerPhone)}</span></div>
                                : <div className="ln mu"><Phone size={15} className="ic" /><span>Telefon kayıtlı değil</span></div>}
                            {customer?.createdAt && <div className="ln"><CalendarDays size={15} className="ic" /><span>{new Date(customer.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihinden beri {K.toLocaleLowerCase('tr')}</span></div>}
                            {customer?.notes && <div className="cn"><span className="ey">{K} notu</span>{customer.notes}</div>}
                            {upcomingList.length > 0 && <><div className="hh">Yaklaşan</div>{upcomingList.map(histRow)}</>}
                            {pastList.length > 0 && <><div className="hh">Geçmiş</div>{pastList.map(histRow)}</>}
                        </div>
                    )}
                </div>

                {/* E · iptal (alt şerit sade bir bağlantı; basınca onay yaprağı açılır) */}
                <div className="dE">
                    {phase !== 'cancelled'
                        ? <button type="button" className="b36 rd" onClick={() => setConfirmCancel(true)}><Ban size={15} />Randevuyu iptal et</button>
                        : <span />}
                    <span className="kh"><kbd>Esc</kbd>kapatır</span>
                </div>

                {confirmCancel && (
                    <div className="cf" role="alertdialog" aria-label="İptal onayı">
                        <h4>Bu randevu iptal edilsin mi?</h4>
                        <ul>{cancelLines.map(l => <li key={l}>{l}</li>)}</ul>
                        {r.customerPhone && (
                            <label className={`ck${canNotify ? '' : ' dis'}`}>
                                <input type="checkbox" checked={canNotify && notifyCancel} disabled={!canNotify} onChange={(e) => setNotifyCancel(e.target.checked)} />
                                <span className="bx"><Check size={14} /></span>
                                <span className="ctx"><b>{kDat} WhatsApp’tan haber ver</b>{canNotify && <span>{phoneTR(r.customerPhone)}</span>}</span>
                                {!canNotify && <span className="nc">WhatsApp bağlı değil</span>}
                            </label>
                        )}
                        <div className="cfb">
                            <button type="button" ref={keepRef} className="b44 o" onClick={() => setConfirmCancel(false)}>Vazgeç</button>
                            <button type="button" className="b44 dg" onClick={cancelRes}><Ban size={16} />Randevuyu iptal et</button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};
