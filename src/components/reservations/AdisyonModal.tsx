import { useState, useMemo } from 'react';
import { X, Plus, Trash2, Wallet, User, Check, Package, Phone, CalendarClock, ClipboardList, Pencil, Ban, ArrowRight, StickyNote, Stethoscope, UserX, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apptPhase, primaryAction } from '@/lib/appointmentFlow';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useProducts } from '@/hooks/useProducts';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useCustomerPackages } from '@/hooks/useCustomerPackages';
import { useCashEnabled } from '@/hooks/useModules';
import { useTheme } from '@/contexts/ThemeContext';
import type { Reservation, PaymentMethod } from '@/types';
import { reservationPrice } from '@/utils/reservationServices';
import { toISODate } from '@/utils/date';

const PM: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];
const fmt = (n: number) => n.toLocaleString('tr-TR');

interface Props { reservation: Reservation; onClose: () => void; onEdit?: (r: Reservation) => void; }
interface ModalTheme {
    ink: string;
    muted: string;
    muted2: string;
    surface: string;
    surface2: string;
    surface3: string;
    border: string;
    border2: string;
    orange: string;
    green: string;
}

/**
 * Takvim randevu kartından açılan sekmeli panel:
 *  • Özet     — randevu detayı, faz aksiyonu (Müşteri Geldi / …), Düzenle/İptal.
 *  • Adisyon  — hesap (hizmet + ürünler + indirim) ve Kasa'ya tahsilat.
 *  • Müşteri  — geçmiş randevular, LTV, paketler, not.
 * Varsayılan sekme faza göre: tamamlanmış+ödenmemiş → doğrudan Adisyon;
 * diğer hâllerde Özet (resepsiyonist önce detaya/aksiyona bakar).
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
    const { forCustomer } = useCustomerPackages();

    // Faza-duyarlı varsayılan sekme: tamamlanmış ama ödenmemiş → tahsilat amacı (Adisyon),
    // diğer tüm hâllerde önce Özet açılır.
    const [tab, setTab] = useState<'ozet' | 'adisyon' | 'musteri'>(
        r.status === 'completed' && !r.isPaid ? 'adisyon' : 'ozet',
    );
    const [lines, setLines] = useState<{ productId: string; name: string; price: number }[]>([]);
    const [discStr, setDiscStr] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    // Durum satırındaki "45 dk sonra / 3 gün önce" için açılış anı (render saf kalsın)
    const [nowMs] = useState(() => Date.now());

    const T = {
        ink: 'var(--dc-ink)', muted: 'var(--dc-muted)', muted2: 'var(--dc-muted2)',
        surface: 'var(--dc-surface)', surface2: 'var(--dc-surface2)', surface3: 'var(--dc-surface3)',
        border: 'var(--dc-border)', border2: 'var(--dc-border2)', orange: '#FF5A1F',
        green: 'var(--dc-green)',
    };

    const customer = allCustomers.find(c => c.id === r.customerId);
    const svcPrice = (x: Reservation) => reservationPrice(x, settings.services);

    // Çoklu hizmet booking'i: aynı group_id'li satırların hepsi tek birleşik adisyonda.
    const groupRes = useMemo(() => {
        if (!r.groupId) return [r];
        // Modalın açıldığı satır realtime listeye henüz düşmemiş olsa bile grup
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
        { name: x.service, sub: x.staffName || 'Hizmet', price: svcPrice(x) },
        ...(x.adisyonItems || []).map(it => ({
            name: it.name,
            sub: it.kind === 'product' ? 'Ürün' : it.kind === 'material' ? 'Malzeme' : 'Ekstra',
            price: it.price,
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

    // ── Özet: faz + birincil aksiyon ──
    const phase = apptPhase(r);
    const primary = primaryAction(phase);
    const confirmReservation = async () => {
        const updated = await updateReservation(r.id, { status: 'confirmed' });
        if (updated) toast.success('Randevu onaylandı');
    };
    const markArrived = async () => {
        // "Geç geldi" gelmedi damgasını da temizler (098 okuma kuralı)
        const updated = await updateReservation(r.id, { customerArrivedAt: new Date().toISOString(), ...(r.noShowAt ? { noShowAt: null } : {}) });
        if (updated) toast.success(r.staffName
            ? `${r.staffName} bilgilendirildi`
            : `${settings.sector === 'dis' ? 'Hasta' : 'Müşteri'} geldi olarak işaretlendi`);
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
    const cancelRes = async () => {
        const prev = r.status;
        const updated = await updateReservation(r.id, { status: 'cancelled' });
        if (!updated) return;
        toast('Randevu iptal edildi', { action: { label: 'Geri Al', onClick: () => updateReservation(r.id, { status: prev }) } });
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
        if (updates.every(Boolean)) toast.success('Ücretsiz tamamlandı');
    };

    // Müşteri sekmesi verileri
    const history = useMemo(
        () => (r.customerId ? reservations.filter(x => x.customerId === r.customerId).sort((a, b) => b.date.localeCompare(a.date)) : []),
        [reservations, r.customerId],
    );
    const realSpent = r.customerId ? totalForCustomer(r.customerId) : 0;
    const estSpent = history.filter(h => h.status === 'completed').reduce((s, h) => s + (settings.services.find(sv => sv.name === h.service)?.price || 0), 0);
    const ltv = realSpent > 0 ? realSpent : estSpent;
    const pkgs = r.customerId ? forCustomer(r.customerId) : [];

    const inputCss = { padding: '9px 11px', borderRadius: 9, border: `1px solid ${T.border2}`, background: T.surface2, color: T.ink, fontSize: 13.5, outline: 'none' } as const;

    // ── Özet: saat kutusu ve durum satırı ──
    const startAt = new Date(`${r.date}T${r.startTime}:00`);
    const todayStr = toISODate(new Date(nowMs));   // yerel gün (UTC gece yarısı kayması olmasın)
    const dayLabel = r.date === todayStr ? 'Bugün' : startAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    const durMin = Math.max(0, toMin(r.endTime) - toMin(r.startTime));
    const diffMin = Math.round((startAt.getTime() - nowMs) / 60_000);
    const ago = (m: number) => { const a = Math.abs(m); return a < 60 ? `${a} dk` : a < 1440 ? `${Math.round(a / 60)} saat` : `${Math.round(a / 1440)} gün`; };
    const status: { title: string; detail: string; color: string; bg: string } = (() => {
        switch (phase) {
            case 'pending': return { title: 'Onay bekliyor', detail: 'Randevu henüz onaylanmadı.', color: 'var(--dc-amber)', bg: 'var(--dc-amber-bg)' };
            case 'missed': return r.noShowAt
                ? { title: 'Gelmedi', detail: 'Gelmedi olarak kaydedildi. Müşteri gelirse "Geldi, geç kaldı" ile devam edin.', color: 'var(--dc-red)', bg: 'var(--dc-red-bg)' }
                : { title: 'Gelmedi', detail: `Randevu saati ${ago(diffMin)} önce geçti, geldi kaydı yok.`, color: 'var(--dc-red)', bg: 'var(--dc-red-bg)' };
            case 'inService': return { title: 'Hizmette', detail: 'Seans sürüyor; bitince tamamla ve tahsil et.', color: 'var(--dc-orange-d)', bg: 'var(--dc-orange-soft)' };
            case 'done': return isPaid
                ? { title: 'Tamamlandı · ödendi', detail: 'Seans kapandı.', color: T.green, bg: 'var(--dc-green-bg)' }
                : { title: 'Tamamlandı · tahsilat bekliyor', detail: 'Hesap Kasa\'da kapanınca seans tamamen biter.', color: 'var(--dc-orange-d)', bg: 'var(--dc-orange-soft)' };
            case 'cancelled': return { title: 'İptal edildi', detail: 'Bu randevu takvimde yer tutmuyor.', color: T.muted, bg: T.surface2 };
            default: return r.customerArrivedAt
                ? { title: 'Müşteri geldi · bekliyor', detail: r.staffName ? `${r.staffName} haberdar edildi.` : 'Hizmete başlanmayı bekliyor.', color: T.green, bg: 'var(--dc-green-bg)' }
                : { title: diffMin > 0 ? `Onaylandı · ${ago(diffMin)} sonra` : 'Onaylandı · şimdi', detail: 'Müşteri gelince "Müşteri geldi"ye basın.', color: 'var(--dc-blue)', bg: 'var(--dc-blue-bg)' };
        }
    })();
    // Birincil koyu düğme koyu temada TERS (krem zemin) — koyu kahve kartta kayboluyordu
    const inv = dark
        ? { bg: '#F3EDE3', fg: '#141210', sub: 'rgba(20,18,16,.6)', chip: 'rgba(20,18,16,.08)' }
        : { bg: 'var(--dc-inkbox)', fg: 'var(--dc-inkbox-fg)', sub: 'rgba(243,237,227,.62)', chip: 'rgba(255,255,255,.14)' };
    const btnCss = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px', borderRadius: 11, border: `1px solid ${T.border2}`, background: 'var(--dc-card)', color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', justifyContent: 'center' } as const;
    const bigCss = { width: '100%', height: 46, marginTop: 14, borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 } as const;
    const choiceCss = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.border2}`, background: 'var(--dc-card)', color: T.ink, textAlign: 'left', cursor: 'pointer', width: '100%' } as const;
    const choiceIcon = { width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0 } as const;
    const choiceTitle = { display: 'block', fontSize: 14.5, fontWeight: 750 } as const;
    const choiceSub = { display: 'block', fontSize: 12.5, color: T.muted, marginTop: 1 } as const;
    const linkCss = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: T.muted, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: '6px 2px' } as const;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} className={dark ? 'dash-theme dark' : 'dash-theme'} style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.45)', overflow: 'hidden', color: T.ink }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: T.surface3, border: `1px solid ${T.border2}`, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 800, fontSize: 15 }}>
                        {r.customerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                        <div style={{ fontSize: 13.5, color: T.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isGroup ? `${groupRes.length} hizmet · ${groupRes.map(x => x.staffName).filter(Boolean).join(', ')}` : [r.service, r.customFields?.paket_seans ? `paket ${r.customFields.paket_seans}` : null, r.staffName].filter(Boolean).join(' · ')}</div>
                    </div>
                    {isPaid && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: T.green, background: 'var(--dc-green-bg)', borderRadius: 999, padding: '4px 10px' }}><Check size={13} /> Ödendi</span>}
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: 4, marginLeft: 4 }}><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, margin: '12px 16px 0', padding: 3, borderRadius: 11, background: T.surface2 }}>
                    {([
                        { key: 'ozet', label: 'Özet', icon: <ClipboardList size={15} /> },
                        { key: 'adisyon', label: 'Adisyon', icon: <Wallet size={15} /> },
                        { key: 'musteri', label: settings.sector === 'dis' ? 'Hasta' : 'Müşteri', icon: <User size={15} /> },
                    ] as const).map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} style={{
                            flex: 1, padding: '8px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: tab === t.key ? 'var(--dc-card)' : 'transparent', color: tab === t.key ? T.ink : T.muted,
                            boxShadow: tab === t.key ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
                        }}>
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                    {tab === 'ozet' ? (
                        <>
                            {/* Ne zaman — saat kutusu */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}` }}>
                                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{r.startTime}</span>
                                <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.35 }}>
                                    {dayLabel} · {durMin} dk<br />{r.startTime}–{r.endTime}
                                </span>
                            </div>

                            {/* Çoklu hizmet — kalemler */}
                            {isGroup && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                                    {groupRes.map((x, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}` }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: x.serviceColor || T.orange, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.service}</div>
                                                <div style={{ fontSize: 12.5, color: T.muted }}>{x.startTime}–{x.endTime}{x.staffName ? ` · ${x.staffName}` : ''}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Durum — renkli tek satır + ne anlama geldiği. Eskiden "Gelmedi"
                                yeşil yazıyordu (renk eşlemesinde yoktu, varsayılana düşüyordu). */}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: '12px 14px', borderRadius: 12, background: status.bg }}>
                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: status.color, marginTop: 5, flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: 14.5, fontWeight: 800, color: status.color }}>{status.title}</div>
                                    <div style={{ fontSize: 13, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{status.detail}</div>
                                </div>
                            </div>

                            {/* Not */}
                            {r.notes && (
                                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 10, padding: '11px 13px', borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}` }}>
                                    <StickyNote size={14} style={{ color: T.muted2, marginTop: 2, flexShrink: 0 }} />
                                    <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{r.notes}</div>
                                </div>
                            )}

                            {confirmCancel ? (
                                /* İptal onayı — pencerenin içinde */
                                <div style={{ marginTop: 14, padding: 14, borderRadius: 12, border: '1px solid rgba(201,64,64,.28)', background: 'var(--dc-red-bg)' }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--dc-red)' }}>Bu randevu iptal edilsin mi?</div>
                                    <div style={{ fontSize: 13, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>
                                        Saat boşa çıkar.{r.customFields?.paket_plan_id ? ' Paket hakkı kullanılmamış sayılır.' : ''}{isPaid ? ' Alınan ödeme Kasa\'da kalır.' : ''}
                                    </div>
                                    {/* Otomatik WhatsApp iptal mesajı entegrasyonla gelecek (kullanıcı kararı, 2026-10-24) */}
                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13, fontWeight: 600, color: T.muted2 }}>
                                        <input type="checkbox" disabled /> Müşteriye WhatsApp'tan haber ver · yakında, otomatik mesaj
                                    </label>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                        <button onClick={() => setConfirmCancel(false)} style={{ ...btnCss, flex: 1 }}>Vazgeç</button>
                                        <button onClick={cancelRes} style={{ ...btnCss, flex: 1, background: 'var(--dc-red)', borderColor: 'var(--dc-red)', color: '#fff' }}><Ban size={14} /> İptal et</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Gelmedi: ne oldu? — üç sonuç, birincisi koyu */}
                                    {phase === 'missed' && (
                                        <>
                                            <div style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: T.muted }}>Ne oldu?</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {!r.noShowAt && (
                                                    <button onClick={markNoShow} style={{ ...choiceCss, background: inv.bg, borderColor: inv.bg, color: inv.fg }}>
                                                        <span style={{ ...choiceIcon, background: inv.chip }}><UserX size={16} /></span>
                                                        <span><b style={choiceTitle}>Gelmedi olarak kapat</b><small style={{ ...choiceSub, color: inv.sub }}>Kayıt "gelmedi" diye kalır, raporlara geçer</small></span>
                                                    </button>
                                                )}
                                                <button onClick={markArrived} style={choiceCss}>
                                                    <span style={{ ...choiceIcon, background: 'var(--dc-green-bg)', color: T.green }}><Check size={16} /></span>
                                                    <span><b style={choiceTitle}>Geldi, geç kaldı</b><small style={choiceSub}>Seans devam eder{r.staffName ? `, ${r.staffName} haberdar olur` : ''}</small></span>
                                                </button>
                                                {onEdit && (
                                                    <button onClick={() => { onEdit(r); onClose(); }} style={choiceCss}>
                                                        <span style={{ ...choiceIcon, background: 'var(--dc-blue-bg)', color: 'var(--dc-blue)' }}><RotateCcw size={16} /></span>
                                                        <span><b style={choiceTitle}>Başka güne al</b><small style={choiceSub}>Aynı hizmetle yeni saat seç</small></span>
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {/* Diğer durumlar — tek birincil adım */}
                                    {primary.kind === 'confirm' && (
                                        <button onClick={confirmReservation} style={{ ...bigCss, background: inv.bg, color: inv.fg }}>
                                            <Check size={16} /> {primary.label}
                                        </button>
                                    )}
                                    {phase === 'upcoming' && !r.customerArrivedAt && (
                                        <button onClick={markArrived} style={{ ...bigCss, background: T.green, color: '#fff' }}>
                                            <Check size={16} /> {primary.label}
                                        </button>
                                    )}
                                    {primary.kind === 'completePay' && !isPaid && (
                                        <button onClick={() => setTab('adisyon')} style={{ ...bigCss, background: T.orange, color: '#fff' }}>
                                            <Wallet size={16} /> {primary.label}
                                        </button>
                                    )}
                                    {phase === 'done' && !isPaid && (
                                        <button onClick={() => setTab('adisyon')} style={{ ...bigCss, background: T.orange, color: '#fff' }}>
                                            <Wallet size={16} /> Tahsil et
                                        </button>
                                    )}

                                    {settings.sector === 'dis' && phase !== 'cancelled' && (
                                        <button onClick={openDentalVisit} style={{ ...bigCss, background: T.ink, color: 'var(--dc-cream)' }}>
                                            <Stethoscope size={16} /> Hasta Ziyaretini Aç <ArrowRight size={15} />
                                        </button>
                                    )}

                                    {/* Hesap — yalnız para konuşulan durumlarda */}
                                    {(phase === 'inService' || phase === 'done' || (phase === 'upcoming' && r.customerArrivedAt)) && (
                                        <button onClick={() => setTab('adisyon')} style={{ ...btnCss, width: '100%', marginTop: 10, justifyContent: 'center' }}>
                                            <Wallet size={15} /> {isPaid ? 'Adisyonu gör' : 'Adisyona git'} <ArrowRight size={15} />
                                        </button>
                                    )}
                                </>
                            )}
                        </>
                    ) : tab === 'adisyon' ? (
                        <>
                            {/* Hesap satırları */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                {baseRows.map((row, i) => <Row key={`b${i}`} label={row.name} sub={row.sub} amount={row.price} T={T} />)}
                                {(isPaid ? [] : lines).map((l, i) => (
                                    <Row key={i} label={l.name} sub="Ürün" amount={l.price} T={T} onDel={() => setLines(prev => prev.filter((_, x) => x !== i))} />
                                ))}
                                {isPaid && resPayments.length > 0 && resPayments.map(p => (
                                    <Row key={p.id} label={p.description || 'Tahsilat'} sub={[staffName(p.staffId), PM.find(m => m.key === p.method)?.label].filter(Boolean).join(' · ')} amount={p.amount} T={T} />
                                ))}
                            </div>

                            {!isPaid && (
                                <>
                                    {/* Ürün ekle */}
                                    {products.length > 0 && (
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 6 }}>Ürün ekle</label>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <select style={{ ...inputCss, flex: 1 }} value="" onChange={e => { if (e.target.value) addLine(e.target.value); }}>
                                                    <option value="">Ürün seç…</option>
                                                    {products.map(p => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} ₺</option>)}
                                                </select>
                                                <span style={{ display: 'grid', placeItems: 'center', width: 38, borderRadius: 9, background: T.surface3, color: T.muted }}><Plus size={16} /></span>
                                            </div>
                                        </div>
                                    )}

                                    {/* İndirim + yöntem */}
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 6 }}>İndirim (₺)</label>
                                            <input style={{ ...inputCss, width: '100%' }} inputMode="numeric" placeholder="0" value={discStr} onChange={e => setDiscStr(e.target.value.replace(/[^0-9]/g, ''))} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 6 }}>Ödeme yöntemi</label>
                                            <div style={{ display: 'flex', gap: 5 }}>
                                                {PM.map(m => (
                                                    <button key={m.key} onClick={() => setMethod(m.key)} style={{
                                                        flex: 1, padding: '9px 4px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                                        background: method === m.key ? T.ink : T.surface2, color: method === m.key ? 'var(--dc-cream)' : T.muted,
                                                        border: `1px solid ${method === m.key ? T.ink : T.border}`,
                                                    }}>{m.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Toplam */}
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>{isPaid ? 'Tahsil edilen' : 'Toplam'}</span>
                                <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: isPaid ? T.green : T.orange }}>
                                    {fmt(isPaid ? resPayments.reduce((s, p) => s + p.amount, 0) || net : net)} <span style={{ fontSize: 15 }}>₺</span>
                                </span>
                            </div>

                            {isPaid ? (
                                <button onClick={undo} style={{ width: '100%', padding: 12, borderRadius: 11, background: T.surface2, border: `1px solid ${T.border2}`, color: T.muted, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                                    Ödemeyi geri al
                                </button>
                            ) : (
                                // Kasa modülü kapalıyken tahsilat TimeFlow'da tutulmuyordur:
                                // ödeme kaydı yazan buton gösterilmez, randevu ödeme kaydı
                                // üretmeden kapatılır (completeFree ile aynı yol).
                                !cashOn ? (
                                    hasServiceRows ? (
                                        <button onClick={completeFree} style={{ width: '100%', padding: 14, borderRadius: 12, background: T.green, color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                                            Randevuyu Tamamla
                                        </button>
                                    ) : (
                                        <button disabled style={{ width: '100%', padding: 14, borderRadius: 12, background: T.surface3, color: T.muted2, border: 'none', fontWeight: 800, fontSize: 15, cursor: 'not-allowed' }}>
                                            Hizmet ekleyin
                                        </button>
                                    )
                                ) : net > 0 ? (
                                    <button onClick={collect} style={{ width: '100%', padding: 14, borderRadius: 12, background: T.orange, color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                                        {fmt(net)} ₺ Tahsil Et
                                    </button>
                                ) : hasServiceRows ? (
                                    // Toplam 0 ama hizmet var → ücretsiz işlem; ödeme kaydı olmadan kapat.
                                    <button onClick={completeFree} style={{ width: '100%', padding: 14, borderRadius: 12, background: T.green, color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                                        Ücretsiz Tamamla
                                    </button>
                                ) : (
                                    <button disabled style={{ width: '100%', padding: 14, borderRadius: 12, background: T.surface3, color: T.muted2, border: 'none', fontWeight: 800, fontSize: 15, cursor: 'not-allowed' }}>
                                        Tutar yok
                                    </button>
                                )
                            )}
                        </>
                    ) : (
                        <>
                            {/* LTV */}
                            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                                <Stat label="Yaşam boyu değer" value={`${fmt(ltv)} ₺`} accent T={T} />
                                <Stat label="Toplam randevu" value={String(history.length)} T={T} />
                            </div>

                            {/* İletişim */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                {(customer?.phone || r.customerPhone) && <InfoRow icon={<Phone size={14} />} text={customer?.phone || r.customerPhone} T={T} />}
                                {customer?.createdAt && <InfoRow icon={<CalendarClock size={14} />} text={`${new Date(customer.createdAt).toLocaleDateString('tr-TR')} tarihinden beri müşteri`} T={T} />}
                            </div>

                            {/* Paketler */}
                            {pkgs.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Paketler</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {pkgs.map(p => (
                                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}` }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Package size={14} style={{ color: T.orange }} />{p.name}</span>
                                                <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>{p.totalSessions - p.usedSessions}/{p.totalSessions} kaldı</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Geçmiş randevular */}
                            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Randevu geçmişi</div>
                            {history.length === 0 ? (
                                <div style={{ fontSize: 13, color: T.muted, padding: '10px 0' }}>Kayıtlı geçmiş yok.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {history.slice(0, 8).map(h => (
                                        <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}` }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.service}</div>
                                                <div style={{ fontSize: 11, color: T.muted }}>{h.date} · {h.startTime}</div>
                                            </div>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted2 }}>{h.status === 'completed' ? 'Tamamlandı' : h.status === 'cancelled' ? 'İptal' : 'Onaylı'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {customer?.notes && (
                                <div style={{ marginTop: 16 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Not</div>
                                    <div style={{ fontSize: 13, color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: '10px 12px' }}>{customer.notes}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Alt şerit — iptal sade bir bağlantı; basınca pencerede onay ister */}
                {tab === 'ozet' && phase !== 'cancelled' && !confirmCancel && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px 14px', borderTop: `1px solid ${T.border}` }}>
                        {onEdit
                            ? <button onClick={() => { onEdit(r); onClose(); }} style={linkCss}><Pencil size={14} /> Düzenle</button>
                            : <span />}
                        <button onClick={() => setConfirmCancel(true)} style={{ ...linkCss, color: 'var(--dc-red)' }}><Ban size={14} /> Randevuyu iptal et</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Alt bileşenler ──
function Row({ label, sub, amount, T, onDel }: { label: string; sub?: string; amount: number; T: ModalTheme; onDel?: () => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                {sub && <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>}
            </div>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{fmt(amount)} ₺</span>
            {onDel && <button onClick={onDel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted2, padding: 2 }}><Trash2 size={15} /></button>}
        </div>
    );
}
function Stat({ label, value, accent, T }: { label: string; value: string; accent?: boolean; T: ModalTheme }) {
    return (
        <div style={{ flex: 1, padding: '13px 14px', borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: accent ? T.orange : T.ink }}>{value}</div>
        </div>
    );
}
function InfoRow({ icon, text, T }: { icon: React.ReactNode; text: string; T: ModalTheme }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: T.muted }}>
            <span style={{ color: T.muted2, display: 'flex' }}>{icon}</span>{text}
        </div>
    );
}
