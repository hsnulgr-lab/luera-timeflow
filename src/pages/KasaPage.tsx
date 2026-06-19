import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { usePayments } from '@/hooks/usePayments';
import { useProducts } from '@/hooks/useProducts';
import { useReservations } from '@/hooks/useReservations';
import { useCustomers } from '@/hooks/useCustomers';
import { useTheme } from '@/contexts/ThemeContext';
import type { Payment, PaymentMethod, PaymentType } from '@/types';

// ── Yardımcılar ───────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('tr-TR');
const AV_COLORS = ['#C98BDB', '#6B9FD4', '#7CC47F', '#E0A84E', '#D67B7B', '#8B7FD4'];

const PM_TR: Record<PaymentMethod, string> = { cash: 'Nakit', card: 'Kart', transfer: 'Havale', other: 'Diğer' };
const PM_CLS: Record<PaymentMethod, string> = { cash: 'cash', card: 'card', transfer: 'bank', other: 'other' };
const TR_PM: Record<string, PaymentMethod> = { Nakit: 'cash', Kart: 'card', Havale: 'transfer', 'Diğer': 'other' };
const TYPE_TR: Record<PaymentType, string> = { service: 'Hizmet', product: 'Ürün', other: 'Tahsilat' };

function initials(name: string) {
    return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
function fmtMeta(p: Payment) {
    const d = new Date(p.paidAt);
    const date = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' ' +
        d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `${TYPE_TR[p.type]} · ${PM_TR[p.method]} · ${date}`;
}

// Ödeme yöntemi ikonları (tasarımdan birebir)
const PmSvg = ({ m, size = 18 }: { m: PaymentMethod; size?: number }) => {
    if (m === 'cash') return <svg width={size} height={size} viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" /></svg>;
    if (m === 'card') return <svg width={size} height={size} viewBox="0 0 20 20" fill="none"><rect x="2" y="4.5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M2 8h16" stroke="currentColor" strokeWidth="1.5" /></svg>;
    if (m === 'transfer') return <svg width={size} height={size} viewBox="0 0 20 20" fill="none"><path d="M4 9v5M8 9v5M12 9v5M16 9v5M2.5 16.5h15M10 3l7 4H3l7-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
    return <svg width={size} height={size} viewBox="0 0 20 20" fill="none"><circle cx="5" cy="10" r="1.5" fill="currentColor" /><circle cx="10" cy="10" r="1.5" fill="currentColor" /><circle cx="15" cy="10" r="1.5" fill="currentColor" /></svg>;
};

// ── Sayfa ────────────────────────────────────────────────────────────────────
export const KasaPage = () => {
    const { dark } = useTheme();
    const { payments, stats, addPayment, removePayment } = usePayments();
    const { products, addProduct, removeProduct } = useProducts();
    const { reservations, settings, updateReservation } = useReservations();
    const { allCustomers } = useCustomers();

    const [sheetOpen, setSheetOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [prodOpen, setProdOpen] = useState(false);

    // Tahsilat formu state'i
    const [amtStr, setAmtStr] = useState('');
    const [discStr, setDiscStr] = useState('');
    const [note, setNote] = useState('');
    const [showDisc, setShowDisc] = useState(false);
    const [showNote, setShowNote] = useState(false);
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [selItem, setSelItem] = useState<number | null>(null);
    const [selCust, setSelCust] = useState<{ id: string; name: string; phone: string } | null>(null);
    const [custQuery, setCustQuery] = useState('');
    const [success, setSuccess] = useState<{ amt: number; cust: string; pm: string; date: string } | null>(null);

    // Hızlı seçim: önce fiyatlı hizmetler, sonra ürünler
    const quickItems = useMemo(() => {
        const svc = (settings.services || []).filter(s => (s.price ?? 0) > 0)
            .map(s => ({ label: s.name, price: s.price as number, kind: 'service' as PaymentType, productId: undefined as string | undefined }));
        const prod = products.map(p => ({ label: p.name, price: p.price, kind: 'product' as PaymentType, productId: p.id }));
        return [...svc, ...prod];
    }, [settings.services, products]);

    const amount = parseInt(amtStr || '0', 10) || 0;
    const discount = parseInt(discStr || '0', 10) || 0;
    const net = Math.max(0, amount - discount);

    // Tahsil bekleyen tamamlanmış randevular
    const unpaid = useMemo(() => reservations.filter(r => r.status === 'completed' && !r.isPaid), [reservations]);
    const priceOf = (svc: string) => settings.services.find(s => s.name === svc)?.price || 0;

    // İstatistik ek hesaplamalar (adet + önceki hafta %)
    const extra = useMemo(() => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const weekAgo = startOfDay - 6 * 864e5;
        const prevStart = startOfDay - 13 * 864e5, prevEnd = startOfDay - 6 * 864e5;
        let todayN = 0, monthN = 0, prevWeek = 0;
        for (const p of payments) {
            const t = new Date(p.paidAt).getTime();
            if (t >= startOfDay) todayN++;
            if (t >= startOfMonth) monthN++;
            if (t >= prevStart && t < prevEnd) prevWeek += p.amount;
        }
        const wow = prevWeek > 0 ? Math.round(((stats.week - prevWeek) / prevWeek) * 100) : null;
        return { todayN, monthN, wow };
    }, [payments, stats.week]);

    const totalDisp = stats.total >= 10000
        ? { num: (stats.total / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }), cur: 'K₺' }
        : { num: fmt(stats.total), cur: '₺' };

    const filteredCusts = useMemo(() => {
        const q = custQuery.toLowerCase().trim();
        if (!q) return allCustomers;
        return allCustomers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }, [allCustomers, custQuery]);

    // Klavye desteği (sheet açıkken): Enter ile onayla, Esc ile kapat
    useEffect(() => {
        if (!sheetOpen || pickerOpen || success) return;
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && net > 0) confirm();
            else if (e.key === 'Escape') closeSheet();
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sheetOpen, pickerOpen, success, net, method, selItem, selCust, note]);

    // ── Aksiyonlar ──
    const toggleItem = (i: number) => {
        if (selItem === i) { setSelItem(null); setAmtStr(''); return; }
        setSelItem(i);
        const it = quickItems[i];
        setAmtStr(String(it.price));
        if (!note) setNote(it.label);
    };
    const resetSheet = () => {
        setAmtStr(''); setDiscStr(''); setNote(''); setShowDisc(false); setShowNote(false);
        setMethod('cash'); setSelItem(null); setSelCust(null); setSuccess(null); setCustQuery('');
    };
    const openSheet = () => { resetSheet(); setSheetOpen(true); };
    const closeSheet = () => { setSheetOpen(false); setPickerOpen(false); setTimeout(resetSheet, 350); };

    const confirm = async () => {
        if (net <= 0) return;
        const it = selItem !== null ? quickItems[selItem] : null;
        const type: PaymentType = it ? it.kind : (note ? 'service' : 'other');
        let desc = note || it?.label || undefined;
        if (discount > 0) desc = `${desc ?? 'Tahsilat'} (indirim ${fmt(discount)}₺)`;
        const p = await addPayment({
            amount: net, method, type, description: desc,
            customerId: selCust?.id, productId: it?.productId,
        });
        if (!p) return;
        const now = new Date();
        const date = now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' ' +
            now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        setSuccess({ amt: net, cust: selCust?.name || 'Genel müşteri', pm: PM_TR[method], date });
    };

    const collect = async (resId: string) => {
        const r = reservations.find(x => x.id === resId);
        if (!r) return;
        const amt = priceOf(r.service);
        const p = await addPayment({ amount: amt, type: 'service', method: 'cash', description: r.service, customerId: r.customerId || undefined, reservationId: r.id });
        if (p) { await updateReservation(r.id, { isPaid: true }); toast.success(`${r.customerName} — ${fmt(amt)} ₺ tahsil edildi`); }
    };

    const confirmTxt = net > 0 ? `${fmt(net)} ₺ Tahsil Et` : 'Tutar girin';
    const amtHint = (discount > 0 && amount > 0)
        ? `${fmt(amount)} ₺ − ${fmt(discount)} ₺ indirim`
        : (net === 0 ? 'Tutar girin veya hizmet seçin' : `${PM_TR[method]} ile tahsilat`);

    return (
        <div className={`kasa-root dash-theme${dark ? ' dark' : ''}`}>
            <style>{KASA_CSS}</style>

            <div className="page-wrap">
                {/* HEADER */}
                <div className="kasa-hd">
                    <div className="kasa-hd-ico">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="19" height="13" rx="2.5" stroke="var(--orange)" strokeWidth="1.6" /><path d="M2.5 10.5h19" stroke="var(--orange)" strokeWidth="1.6" /><circle cx="17.5" cy="14.5" r="1.4" fill="var(--orange)" /></svg>
                    </div>
                    <div className="kasa-hd-txt">
                        <div className="kasa-hd-title">Kasa</div>
                        <div className="kasa-hd-sub">Tahsilat ve gelir takibi</div>
                    </div>
                    <div className="kasa-hd-btns">
                        <button className="btn-outline" onClick={() => setProdOpen(true)}>
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 6l7-3.5L17 6v8l-7 3.5L3 14V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M3 6l7 3.5L17 6M10 9.5v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>Ürünler
                        </button>
                        <button className="btn-tahsilat" onClick={openSheet}>
                            <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>Tahsilat
                        </button>
                    </div>
                </div>

                {/* STATS */}
                <div className="kasa-stats">
                    <div className="kstat primary">
                        <div className="kstat-lbl">Bugün</div>
                        <div className="kstat-val">{fmt(stats.today)}<span className="kstat-cur">₺</span></div>
                        <div className="kstat-cmp"><b>{extra.todayN}</b> tahsilat</div>
                    </div>
                    <div className="kstat">
                        <div className="kstat-lbl">Son 7 Gün</div>
                        <div className="kstat-val">{fmt(stats.week)}<span className="kstat-cur">₺</span></div>
                        <div className="kstat-cmp">{extra.wow !== null ? <><b>{extra.wow >= 0 ? '+' : ''}{extra.wow}%</b> önceki hafta</> : 'önceki hafta —'}</div>
                    </div>
                    <div className="kstat">
                        <div className="kstat-lbl">Bu Ay</div>
                        <div className="kstat-val">{fmt(stats.month)}<span className="kstat-cur">₺</span></div>
                        <div className="kstat-cmp"><b>{extra.monthN}</b> tahsilat</div>
                    </div>
                    <div className="kstat">
                        <div className="kstat-lbl">Toplam</div>
                        <div className="kstat-val">{totalDisp.num}<span className="kstat-cur">{totalDisp.cur}</span></div>
                        <div className="kstat-cmp">tüm zamanlar</div>
                    </div>
                </div>

                {/* METHOD BREAKDOWN */}
                <div className="method-row">
                    {(['cash', 'card', 'transfer', 'other'] as PaymentMethod[]).map(m => (
                        <div className="mchip" key={m}>
                            <div className={`mchip-ico ${PM_CLS[m]}`}><PmSvg m={m} /></div>
                            <div><div className="mchip-lbl">{PM_TR[m]}</div><div className="mchip-val">{fmt(stats.byMethod[m] || 0)} ₺</div></div>
                        </div>
                    ))}
                </div>

                {/* TAHSİL BEKLEYEN RANDEVULAR */}
                {unpaid.length > 0 && (
                    <>
                        <div className="section-hd"><div className="section-title">Tahsil bekleyen randevular</div></div>
                        <div className="txn-list" style={{ marginBottom: 26 }}>
                            {unpaid.map(r => (
                                <div className="txn" key={r.id}>
                                    <div className="txn-ico"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M2.5 7.5h15" stroke="currentColor" strokeWidth="1.5" /></svg></div>
                                    <div className="txn-body"><div className="txn-name">{r.customerName}</div><div className="txn-meta">{r.service} · {r.date}</div></div>
                                    <div className="txn-amt">{fmt(priceOf(r.service))} ₺</div>
                                    <button className="txn-collect" onClick={() => collect(r.id)}>Tahsil et</button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* RECENT */}
                <div className="section-hd"><div className="section-title">Son tahsilatlar</div></div>
                <div className="txn-list">
                    {payments.length === 0 ? (
                        <div className="empty-state">
                            <div className="es-ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="19" height="13" rx="2.5" stroke="var(--muted)" strokeWidth="1.6" /><path d="M2.5 10.5h19" stroke="var(--muted)" strokeWidth="1.6" /></svg></div>
                            <div className="es-t">Henüz tahsilat yok</div>
                            <div className="es-s">İlk tahsilatını almak için "Tahsilat" butonuna bas</div>
                        </div>
                    ) : payments.map(p => {
                        const cust = allCustomers.find(c => c.id === p.customerId)?.name;
                        const name = p.description || cust || TYPE_TR[p.type];
                        return (
                            <div className="txn" key={p.id}>
                                <div className={`txn-ico ${PM_CLS[p.method]}`}><PmSvg m={p.method} size={20} /></div>
                                <div className="txn-body"><div className="txn-name">{name}{cust && p.description ? ` · ${cust}` : ''}</div><div className="txn-meta">{fmtMeta(p)}</div></div>
                                <div className={`txn-amt${p.amount === 0 ? ' zero' : ''}`}>{fmt(p.amount)} ₺</div>
                                <button className="txn-del" onClick={() => removePayment(p.id)} title="Sil"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═══ TAHSİLAT SHEET ═══ */}
            <div className={`sheet-overlay${sheetOpen ? ' open' : ''}`} onClick={closeSheet} />
            <div className={`sheet${sheetOpen ? ' open' : ''}`}>
                <div className="sheet-hd">
                    <div>
                        <div className="sheet-hd-title">Yeni Tahsilat</div>
                        <div className="sheet-hd-sub">Tutarı gir, ödemeyi al</div>
                    </div>
                    <button className="sheet-close" onClick={closeSheet}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
                </div>

                <div className="sheet-body">
                    <div className="amt-display">
                        <div className={`amt-big${net === 0 ? ' empty' : ''}`}>{fmt(net)}<span className="amt-cur">₺</span></div>
                        <div className="amt-hint">{(discount > 0 && amount > 0) ? <>{fmt(amount)} ₺ − <b>{fmt(discount)} ₺</b> indirim</> : amtHint}</div>
                    </div>

                    {quickItems.length > 0 && <>
                        <div className="fld-lbl">Hızlı Hizmet / Ürün</div>
                        <div className="svc-grid">
                            {quickItems.map((it, i) => (
                                <div className={`svc${selItem === i ? ' sel' : ''}`} key={i} onClick={() => toggleItem(i)}>
                                    <div className="svc-nm">{it.label}</div>
                                    <div className="svc-pr">{fmt(it.price)} ₺</div>
                                </div>
                            ))}
                        </div>
                    </>}

                    <div className="fld-lbl">Müşteri</div>
                    <button className="cust-btn" onClick={() => { setPickerOpen(true); setCustQuery(''); }}>
                        <div className={`cust-av${selCust ? ' filled' : ''}`} style={selCust ? { background: AV_COLORS[0] } : undefined}>{selCust ? initials(selCust.name) : '?'}</div>
                        <span className={`cust-nm${selCust ? '' : ' placeholder'}`}>{selCust ? selCust.name : 'Müşteri seç (opsiyonel)'}</span>
                        <span className="cust-chevron"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                    </button>

                    <div className="fld-lbl">Ödeme Yöntemi</div>
                    <div className="pm-grid">
                        {(['cash', 'card', 'transfer', 'other'] as PaymentMethod[]).map(m => (
                            <div className={`pm${method === m ? ' sel' : ''}`} key={m} onClick={() => setMethod(m)}>
                                <span className="pm-ico"><PmSvg m={m} size={22} /></span>
                                <span className="pm-lbl">{PM_TR[m]}</span>
                            </div>
                        ))}
                    </div>

                    <div className="extra-row">
                        <button className={`extra-btn${showDisc ? ' active' : ''}`} onClick={() => { setShowDisc(v => { if (v) setDiscStr(''); return !v; }); }}>
                            <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M6 14L14 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.4" /><circle cx="13" cy="13" r="1.6" stroke="currentColor" strokeWidth="1.4" /></svg>İndirim
                        </button>
                        <button className={`extra-btn${showNote ? ' active' : ''}`} onClick={() => setShowNote(v => !v)}>
                            <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 17v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>Not
                        </button>
                    </div>
                    {showDisc && <div className="extra-field show"><input className="txt-input mono" type="number" inputMode="numeric" placeholder="İndirim tutarı (₺)" value={discStr} onChange={e => setDiscStr(e.target.value)} /></div>}
                    {showNote && <div className="extra-field show"><input className="txt-input" type="text" placeholder="Not ekle (örn. saç + sakal)" value={note} onChange={e => setNote(e.target.value)} /></div>}

                    <div className="fld-lbl">Tutar (₺)</div>
                    <input
                        className="txt-input amt-input mono"
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={amtStr}
                        onChange={e => { setSelItem(null); setAmtStr(e.target.value.replace(/[^0-9]/g, '').slice(0, 7)); }}
                    />
                </div>

                <div className="sheet-ft">
                    <button className="confirm-btn" disabled={net <= 0} onClick={confirm}><span>{confirmTxt}</span></button>
                </div>

                {/* SUCCESS */}
                <div className={`success${success ? ' show' : ''}`}>
                    <div className="check-ring">
                        <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><path className="check-svg" d="M5 12.5l4.5 4.5L19 7" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    <div className="success-amt">{fmt(success?.amt || 0)}<span className="amt-cur">₺</span></div>
                    <div className="success-title">Tahsilat alındı</div>
                    <div className="success-card">
                        <div className="sc-row"><span className="sc-k">Müşteri</span><span className="sc-v">{success?.cust}</span></div>
                        <div className="sc-row"><span className="sc-k">Ödeme</span><span className="sc-v">{success?.pm}</span></div>
                        <div className="sc-row"><span className="sc-k">Tarih</span><span className="sc-v mono">{success?.date}</span></div>
                    </div>
                    <div className="success-actions">
                        <div className="sa-row">
                            <button className="sa-sec" onClick={closeSheet}>Kapat</button>
                            <button className="sa-sec accent" onClick={() => { setSuccess(null); resetSheet(); }}><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>Yeni</button>
                        </div>
                    </div>
                </div>

                {/* CUSTOMER PICKER */}
                <div className={`picker${pickerOpen ? ' open' : ''}`}>
                    <div className="picker-hd">
                        <button className="picker-back" onClick={() => setPickerOpen(false)}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                        <div className="picker-title">Müşteri Seç</div>
                    </div>
                    <div className="picker-search">
                        <div className="search-box">
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke="var(--muted)" strokeWidth="1.6" /><path d="M13.5 13.5l3 3" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" /></svg>
                            <input type="text" placeholder="İsim veya telefon ara…" value={custQuery} onChange={e => setCustQuery(e.target.value)} />
                        </div>
                    </div>
                    <div className="pl-walk" onClick={() => { setSelCust(null); setPickerOpen(false); }}>
                        <div className="cust-av"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M4 16.5c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: '13.5px', fontWeight: 650, color: 'var(--ink)' }}>Genel / Geçici müşteri</div><div style={{ fontSize: 11 }}>Kayıt olmadan devam et</div></div>
                    </div>
                    <div className="picker-list">
                        {filteredCusts.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 30, fontSize: 13 }}>Müşteri bulunamadı</div>
                        ) : filteredCusts.map((c, i) => (
                            <div className="pl-item" key={c.id} onClick={() => { setSelCust({ id: c.id, name: c.name, phone: c.phone }); setPickerOpen(false); }}>
                                <div className="pl-av" style={{ background: AV_COLORS[i % AV_COLORS.length] }}>{initials(c.name)}</div>
                                <div className="pl-nm">{c.name}</div>
                                <div className="pl-meta">{c.phone}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══ ÜRÜNLER MODAL ═══ */}
            {prodOpen && <ProductsModal products={products} onAdd={addProduct} onRemove={removeProduct} onClose={() => setProdOpen(false)} />}
        </div>
    );
};

// ── Ürün yönetimi modalı ──
function ProductsModal({ products, onAdd, onRemove, onClose }: {
    products: { id: string; name: string; price: number }[];
    onAdd: (name: string, price: number) => void;
    onRemove: (id: string) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const add = () => {
        const p = parseFloat(price.replace(',', '.'));
        if (!name.trim()) { toast.error('Ürün adı gir'); return; }
        if (!p || p < 0) { toast.error('Geçerli bir fiyat gir'); return; }
        onAdd(name.trim(), p); setName(''); setPrice('');
    };
    return (
        <div className="pmodal-overlay open" onClick={onClose}>
            <div className="pmodal" onClick={e => e.stopPropagation()}>
                <div className="sheet-hd">
                    <div><div className="sheet-hd-title">Ürünler</div><div className="sheet-hd-sub">Hızlı satış için ürün kataloğu</div></div>
                    <button className="sheet-close" onClick={onClose}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
                </div>
                <div className="pmodal-body">
                    <div className="pmodal-add">
                        <input className="txt-input" placeholder="Ürün adı" value={name} onChange={e => setName(e.target.value)} />
                        <input className="txt-input mono" style={{ width: 92 }} placeholder="₺" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
                        <button className="pmodal-addbtn" onClick={add}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg></button>
                    </div>
                    {products.length === 0 ? (
                        <div className="empty-state" style={{ padding: '30px 20px' }}><div className="es-t">Henüz ürün yok</div><div className="es-s">Yukarıdan ilk ürünü ekle</div></div>
                    ) : (
                        <div className="txn-list">
                            {products.map(p => (
                                <div className="txn" key={p.id}>
                                    <div className="txn-ico"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6l7-3.5L17 6v8l-7 3.5L3 14V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M3 6l7 3.5L17 6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></div>
                                    <div className="txn-body"><div className="txn-name">{p.name}</div></div>
                                    <div className="txn-amt">{fmt(p.price)} ₺</div>
                                    <button className="txn-del" onClick={() => onRemove(p.id)} title="Sil"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Tasarım CSS'i (Luera Kasa.html — --dc-* token sistemine bağlandı) ──────────
const KASA_CSS = `
.kasa-root{
  --ink:var(--dc-ink);--cream:var(--dc-cream);--orange:var(--dc-orange);--orange-d:var(--dc-orange-d);
  --surface:var(--dc-surface);--surface2:var(--dc-surface2);--surface3:var(--dc-surface3);
  --border:var(--dc-border);--border2:var(--dc-border2);--muted:var(--dc-muted);--muted2:var(--dc-muted2);
  --green:var(--dc-green);--blue:#3B7CC2;
  --shadow-sm:0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04);
  --shadow:0 2px 8px rgba(14,14,14,0.08),0 8px 24px rgba(14,14,14,0.06);
  --shadow-lg:0 4px 16px rgba(14,14,14,0.12),0 16px 48px rgba(14,14,14,0.12);
  --r:14px;--r-sm:10px;--r-xs:7px;
  color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;
  flex:1;overflow-y:auto;padding:26px 30px 48px;background:var(--dc-page);
}
.kasa-root.dark{
  --blue:#6B9FD4;
  --shadow-sm:0 1px 3px rgba(0,0,0,0.5),0 2px 8px rgba(0,0,0,0.35);
  --shadow:0 2px 8px rgba(0,0,0,0.6),0 8px 24px rgba(0,0,0,0.45);
  --shadow-lg:0 4px 16px rgba(0,0,0,0.7),0 16px 48px rgba(0,0,0,0.55);
}
.kasa-root .mono{font-family:'JetBrains Mono',monospace}
.kasa-root button{border:none;background:none;font-family:inherit;cursor:pointer;color:inherit}
.kasa-root ::selection{background:rgba(255,90,31,.3)}
.kasa-root .page-wrap{max-width:980px;margin:0 auto}

.kasa-root .kasa-hd{display:flex;align-items:center;gap:14px;margin-bottom:22px}
.kasa-root .kasa-hd-ico{width:52px;height:52px;border-radius:14px;background:var(--surface3);border:1px solid var(--border2);display:grid;place-items:center;flex-shrink:0}
.kasa-root .kasa-hd-txt{flex:1;min-width:0}
.kasa-root .kasa-hd-title{font-size:27px;font-weight:900;letter-spacing:-0.04em;line-height:1}
.kasa-root .kasa-hd-sub{font-size:13px;color:var(--muted);margin-top:4px}
.kasa-root .kasa-hd-btns{display:flex;gap:10px;flex-shrink:0}
.kasa-root .btn-outline{background:transparent;color:var(--ink);padding:11px 17px;border-radius:999px;font-size:13px;font-weight:650;border:1px solid var(--border2);transition:all .15s;display:flex;align-items:center;gap:7px;white-space:nowrap}
.kasa-root .btn-outline:hover{border-color:var(--ink);background:var(--surface2)}
.kasa-root .btn-tahsilat{background:var(--orange);color:#0E0E0E;padding:11px 20px;border-radius:999px;font-size:13.5px;font-weight:800;display:flex;align-items:center;gap:7px;transition:all .2s;white-space:nowrap;box-shadow:0 4px 16px rgba(255,90,31,.28)}
.kasa-root .btn-tahsilat:hover{background:var(--orange-d);transform:translateY(-1px);box-shadow:0 8px 24px rgba(255,90,31,.4)}
.kasa-root .btn-tahsilat:active{transform:translateY(0)}

.kasa-root .kasa-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.kasa-root .kstat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;box-shadow:var(--shadow-sm);transition:all .22s;position:relative;overflow:hidden}
.kasa-root .kstat:hover{box-shadow:var(--shadow);transform:translateY(-2px)}
.kasa-root .kstat.primary{border-color:rgba(255,90,31,0.28);background:linear-gradient(160deg,rgba(255,90,31,.07),var(--surface) 55%)}
.kasa-root .kstat-lbl{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.kasa-root .kstat.primary .kstat-lbl{color:var(--orange)}
.kasa-root .kstat-val{font-size:28px;font-weight:900;letter-spacing:-0.04em;line-height:1;display:flex;align-items:baseline;gap:3px}
.kasa-root .kstat.primary .kstat-val{color:var(--orange)}
.kasa-root .kstat-cur{font-size:16px;font-weight:800;opacity:.6}
.kasa-root .kstat-cmp{font-size:11px;color:var(--muted);margin-top:7px;font-weight:500}
.kasa-root .kstat-cmp b{color:var(--green);font-weight:700}

.kasa-root .method-row{display:flex;gap:10px;margin-bottom:26px;flex-wrap:wrap}
.kasa-root .mchip{flex:1;min-width:140px;display:flex;align-items:center;gap:11px;padding:13px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);transition:all .18s}
.kasa-root .mchip:hover{border-color:var(--border2)}
.kasa-root .mchip-ico{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex-shrink:0}
.kasa-root .mchip-ico.cash{background:rgba(124,196,127,.13);color:var(--green)}
.kasa-root .mchip-ico.card{background:rgba(107,159,212,.13);color:var(--blue)}
.kasa-root .mchip-ico.bank{background:rgba(255,90,31,.12);color:var(--orange)}
.kasa-root .mchip-ico.other{background:var(--surface3);color:var(--muted)}
.kasa-root .mchip-lbl{font-size:11px;color:var(--muted);font-weight:600}
.kasa-root .mchip-val{font-size:16px;font-weight:850;letter-spacing:-0.02em;margin-top:1px}

.kasa-root .section-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.kasa-root .section-title{font-size:16px;font-weight:800;letter-spacing:-0.02em}
.kasa-root .txn-list{display:flex;flex-direction:column;gap:8px}
.kasa-root .txn{display:flex;align-items:center;gap:13px;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);transition:all .16s}
.kasa-root .txn:hover{border-color:var(--border2);background:var(--surface2)}
.kasa-root .txn-ico{width:40px;height:40px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);display:grid;place-items:center;flex-shrink:0;color:var(--muted)}
.kasa-root .txn-ico.cash{color:var(--green);background:rgba(124,196,127,.1)}
.kasa-root .txn-ico.card{color:var(--blue);background:rgba(107,159,212,.1)}
.kasa-root .txn-ico.bank{color:var(--orange);background:rgba(255,90,31,.1)}
.kasa-root .txn-body{flex:1;min-width:0}
.kasa-root .txn-name{font-size:14px;font-weight:700;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kasa-root .txn-meta{font-size:11.5px;color:var(--muted);margin-top:2px;font-family:'JetBrains Mono',monospace}
.kasa-root .txn-amt{font-size:16px;font-weight:850;letter-spacing:-0.02em;flex-shrink:0}
.kasa-root .txn-amt.zero{color:var(--muted2)}
.kasa-root .txn-del{width:32px;height:32px;border-radius:var(--r-xs);display:grid;place-items:center;color:var(--muted2);transition:all .15s;flex-shrink:0}
.kasa-root .txn-del:hover{background:rgba(224,112,112,.13);color:#E07070}
.kasa-root .txn-collect{background:var(--orange);color:#0E0E0E;padding:8px 14px;border-radius:999px;font-size:12.5px;font-weight:800;white-space:nowrap;flex-shrink:0;transition:all .15s}
.kasa-root .txn-collect:hover{background:var(--orange-d)}
.kasa-root .empty-state{text-align:center;padding:50px 20px;color:var(--muted)}
.kasa-root .empty-state .es-ico{width:60px;height:60px;border-radius:16px;background:var(--surface2);border:1px solid var(--border);display:grid;place-items:center;margin:0 auto 14px}
.kasa-root .empty-state .es-t{font-size:14px;font-weight:700;color:var(--ink)}
.kasa-root .empty-state .es-s{font-size:12.5px;margin-top:4px}

.kasa-root .sheet-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(3px);z-index:100;opacity:0;pointer-events:none;transition:opacity .3s}
.kasa-root .sheet-overlay.open{opacity:1;pointer-events:auto}
.kasa-root .sheet{position:fixed;z-index:101;background:var(--surface);display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden;top:50%;left:50%;width:440px;max-width:calc(100vw - 40px);height:min(760px,calc(100vh - 48px));border-radius:20px;border:1px solid var(--border2);transform:translate(-50%,-48%) scale(.97);opacity:0;pointer-events:none;transition:opacity .3s,transform .3s cubic-bezier(.2,.8,.2,1)}
.kasa-root .sheet.open{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}
.kasa-root .sheet-hd{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border);flex-shrink:0}
.kasa-root .sheet-hd-title{font-size:17px;font-weight:850;letter-spacing:-0.02em}
.kasa-root .sheet-hd-sub{font-size:11.5px;color:var(--muted);margin-top:1px}
.kasa-root .sheet-close{margin-left:auto;width:34px;height:34px;border-radius:var(--r-xs);display:grid;place-items:center;color:var(--muted);transition:all .15s}
.kasa-root .sheet-close:hover{background:var(--surface2);color:var(--ink)}
.kasa-root .sheet-body{flex:1;overflow-y:auto;padding:18px 20px 8px}
.kasa-root .sheet-body::-webkit-scrollbar{width:7px}
.kasa-root .sheet-body::-webkit-scrollbar-thumb{background:rgba(243,237,227,.1);border-radius:4px}

.kasa-root .amt-display{text-align:center;padding:8px 0 18px}
.kasa-root .amt-big{font-size:52px;font-weight:900;letter-spacing:-0.04em;line-height:1;display:inline-flex;align-items:baseline;gap:6px;transition:color .2s}
.kasa-root .amt-big.empty{color:var(--muted2)}
.kasa-root .amt-cur{font-size:26px;font-weight:800;opacity:.55}
.kasa-root .amt-hint{font-size:11.5px;color:var(--muted);margin-top:8px;font-weight:600;min-height:16px}
.kasa-root .amt-hint b{color:var(--orange)}
.kasa-root .fld-lbl{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:18px 0 9px;font-family:'JetBrains Mono',monospace}
.kasa-root .svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.kasa-root .svc{padding:11px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);text-align:center;transition:all .15s;cursor:pointer}
.kasa-root .svc:hover{border-color:var(--border2);background:var(--surface3)}
.kasa-root .svc.sel{border-color:var(--orange);background:rgba(255,90,31,.1)}
.kasa-root .svc-nm{font-size:12px;font-weight:700;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kasa-root .svc-pr{font-size:11px;color:var(--muted);margin-top:2px;font-family:'JetBrains Mono',monospace}
.kasa-root .svc.sel .svc-pr{color:var(--orange)}
.kasa-root .cust-btn{width:100%;display:flex;align-items:center;gap:11px;padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);transition:all .15s;text-align:left}
.kasa-root .cust-btn:hover{border-color:var(--border2)}
.kasa-root .cust-av{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;flex-shrink:0;background:var(--surface3);color:var(--muted)}
.kasa-root .cust-av.filled{color:#fff}
.kasa-root .cust-nm{font-size:13.5px;font-weight:650;flex:1}
.kasa-root .cust-nm.placeholder{color:var(--muted)}
.kasa-root .cust-chevron{color:var(--muted2);flex-shrink:0;display:flex}
.kasa-root .pm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.kasa-root .pm{display:flex;flex-direction:column;align-items:center;gap:6px;padding:13px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);transition:all .15s;cursor:pointer}
.kasa-root .pm:hover{border-color:var(--border2)}
.kasa-root .pm.sel{border-color:var(--orange);background:rgba(255,90,31,.1)}
.kasa-root .pm-ico{color:var(--muted);transition:color .15s;display:flex}
.kasa-root .pm.sel .pm-ico{color:var(--orange)}
.kasa-root .pm-lbl{font-size:11px;font-weight:700}
.kasa-root .pm.sel .pm-lbl{color:var(--orange)}
.kasa-root .extra-row{display:flex;gap:8px;margin-top:9px}
.kasa-root .extra-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:11px;background:var(--surface2);border:1px dashed var(--border2);border-radius:var(--r-sm);font-size:12.5px;font-weight:650;color:var(--muted);transition:all .15s}
.kasa-root .extra-btn:hover{color:var(--ink);border-color:var(--ink)}
.kasa-root .extra-btn.active{border-style:solid;border-color:var(--orange);color:var(--orange);background:rgba(255,90,31,.08)}
.kasa-root .extra-field{margin-top:9px;animation:kSlideDown .25s ease}
@keyframes kSlideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.kasa-root .txt-input{width:100%;padding:12px 14px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);color:var(--ink);font-family:inherit;font-size:13.5px;transition:all .15s}
.kasa-root .txt-input:focus{outline:none;border-color:var(--orange);box-shadow:0 0 0 3px rgba(255,90,31,.12)}
.kasa-root .txt-input::placeholder{color:var(--muted2)}
.kasa-root .amt-input{height:54px;font-size:22px;font-weight:800;text-align:center;letter-spacing:-0.02em;-moz-appearance:textfield}
.kasa-root .amt-input::-webkit-outer-spin-button,.kasa-root .amt-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.kasa-root .sheet-ft{padding:14px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--border);flex-shrink:0;background:var(--surface)}
.kasa-root .confirm-btn{width:100%;height:56px;border-radius:14px;background:var(--orange);color:#0E0E0E;font-size:16px;font-weight:850;letter-spacing:-0.01em;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .18s;box-shadow:0 6px 20px rgba(255,90,31,.32);white-space:nowrap}
.kasa-root .confirm-btn:hover:not(:disabled){background:var(--orange-d);transform:translateY(-1px);box-shadow:0 10px 28px rgba(255,90,31,.42)}
.kasa-root .confirm-btn:active:not(:disabled){transform:translateY(0)}
.kasa-root .confirm-btn:disabled{background:var(--surface3);color:var(--muted2);box-shadow:none;cursor:not-allowed}

.kasa-root .success{position:absolute;inset:0;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 28px;text-align:center;opacity:0;pointer-events:none;transition:opacity .35s;z-index:5}
.kasa-root .success.show{opacity:1;pointer-events:auto}
.kasa-root .check-ring{width:96px;height:96px;border-radius:50%;background:rgba(124,196,127,.12);display:grid;place-items:center;margin-bottom:24px;position:relative}
.kasa-root .check-ring::after{content:'';position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(124,196,127,.25);animation:kRingPulse 2s ease-out infinite}
@keyframes kRingPulse{0%{transform:scale(.9);opacity:.8}100%{transform:scale(1.25);opacity:0}}
.kasa-root .success.show .check-svg{stroke-dasharray:48;stroke-dashoffset:48;animation:kDrawCheck .5s .25s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes kDrawCheck{to{stroke-dashoffset:0}}
.kasa-root .success-amt{font-size:46px;font-weight:900;letter-spacing:-0.04em;line-height:1;color:var(--green);display:inline-flex;align-items:baseline;gap:5px}
.kasa-root .success-amt .amt-cur{color:var(--green)}
.kasa-root .success-title{font-size:15px;font-weight:750;margin-top:14px}
.kasa-root .success-card{width:100%;max-width:300px;margin-top:22px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:4px 16px}
.kasa-root .sc-row{display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border);font-size:13px}
.kasa-root .sc-row:last-child{border-bottom:none}
.kasa-root .sc-k{color:var(--muted);font-weight:550}
.kasa-root .sc-v{font-weight:700}
.kasa-root .success-actions{width:100%;max-width:300px;margin-top:22px;display:flex;flex-direction:column;gap:9px}
.kasa-root .sa-primary{height:50px;border-radius:13px;background:#25D366;color:#0a2e16;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s}
.kasa-root .sa-primary:hover{filter:brightness(1.08);transform:translateY(-1px)}
.kasa-root .sa-row{display:flex;gap:9px}
.kasa-root .sa-sec{flex:1;height:48px;border-radius:13px;background:var(--surface3);border:1px solid var(--border2);color:var(--ink);font-size:13.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:7px;transition:all .15s}
.kasa-root .sa-sec:hover{background:var(--surface);border-color:var(--ink)}
.kasa-root .sa-sec.accent{background:var(--orange);color:#0E0E0E;border-color:var(--orange)}
.kasa-root .sa-sec.accent:hover{background:var(--orange-d)}

.kasa-root .picker{position:absolute;inset:0;background:var(--surface);z-index:6;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.kasa-root .picker.open{transform:translateX(0)}
.kasa-root .picker-hd{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border);flex-shrink:0}
.kasa-root .picker-back{width:34px;height:34px;border-radius:var(--r-xs);display:grid;place-items:center;color:var(--muted);transition:all .15s}
.kasa-root .picker-back:hover{background:var(--surface2);color:var(--ink)}
.kasa-root .picker-title{font-size:15px;font-weight:800}
.kasa-root .picker-search{padding:14px 18px 10px;flex-shrink:0}
.kasa-root .search-box{display:flex;align-items:center;gap:9px;padding:11px 14px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm)}
.kasa-root .search-box input{flex:1;background:none;border:none;outline:none;color:var(--ink);font-family:inherit;font-size:13.5px}
.kasa-root .search-box input::placeholder{color:var(--muted2)}
.kasa-root .picker-list{flex:1;overflow-y:auto;padding:0 12px 16px}
.kasa-root .pl-item{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s}
.kasa-root .pl-item:hover{background:var(--surface2)}
.kasa-root .pl-av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0}
.kasa-root .pl-nm{font-size:14px;font-weight:650;flex:1}
.kasa-root .pl-meta{font-size:11.5px;color:var(--muted);font-family:'JetBrains Mono',monospace}
.kasa-root .pl-walk{margin:4px 12px 10px;padding:11px 12px;border-radius:var(--r-sm);border:1px dashed var(--border2);display:flex;align-items:center;gap:11px;cursor:pointer;color:var(--muted);transition:all .15s}
.kasa-root .pl-walk:hover{border-color:var(--ink);color:var(--ink)}

.kasa-root .pmodal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(3px);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
.kasa-root .pmodal{width:100%;max-width:440px;max-height:min(720px,90vh);background:var(--surface);border:1px solid var(--border2);border-radius:20px;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;overflow:hidden}
.kasa-root .pmodal-body{flex:1;overflow-y:auto;padding:18px 20px 22px}
.kasa-root .pmodal-add{display:flex;gap:8px;margin-bottom:16px}
.kasa-root .pmodal-addbtn{flex-shrink:0;width:46px;border-radius:var(--r-sm);background:var(--orange);color:#0E0E0E;display:grid;place-items:center;transition:all .15s}
.kasa-root .pmodal-addbtn:hover{background:var(--orange-d)}

@media (max-width:860px){
  .kasa-root{padding:18px 16px 96px}
  .kasa-root .kasa-hd{flex-wrap:wrap}
  .kasa-root .kasa-hd-btns{width:100%;order:3}
  .kasa-root .btn-outline,.kasa-root .btn-tahsilat{flex:1;justify-content:center}
  .kasa-root .kasa-hd-title{font-size:23px}
  .kasa-root .kasa-stats{grid-template-columns:1fr 1fr;gap:9px}
  .kasa-root .kstat-val{font-size:24px}
  .kasa-root .mchip{min-width:calc(50% - 4px);flex:1 1 calc(50% - 4px)}
  .kasa-root .sheet{top:auto;left:0;bottom:0;width:100%;max-width:100%;height:94dvh;border-radius:24px 24px 0 0;border:none;border-top:1px solid var(--border2);transform:translateY(100%);opacity:1;transition:transform .35s cubic-bezier(.2,.85,.2,1)}
  .kasa-root .sheet.open{transform:translateY(0)}
  .kasa-root .amt-big{font-size:46px}
}
@media (max-width:380px){
  .kasa-root .svc-grid{grid-template-columns:repeat(2,1fr)}
  .kasa-root .amt-big{font-size:40px}
}
`;
