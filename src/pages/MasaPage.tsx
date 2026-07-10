import { useMemo, useState } from 'react';
import { Plus, Minus, Users, X, Clock, Phone, Trash2, Armchair, Wallet, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { useTables } from '@/hooks/useTables';
import { useTableReservations } from '@/hooks/useTableReservations';
import { useTheme } from '@/contexts/ThemeContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePayments } from '@/hooks/usePayments';
import { useProducts } from '@/hooks/useProducts';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useReservations } from '@/hooks/useReservations';
import { toISODate, formatDateEU } from '@/utils/date';
import { adisyonTotal, adisyonSummary, groupMenu, addMenuItem, addExtraItem, changeQty } from '@/utils/masaAdisyon';
import type { Table, TableReservation, PaymentMethod, Staff, Product, MasaAdisyonItem } from '@/types';
import { confirmDialog } from '@/components/ConfirmDialog';

// ── Tokens (LT/DT deseni) ─────────────────────────────────────────────────────
const LT = {
    ink: '#0E0E0E', orange: '#FF5A1F', surface: '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
    border: 'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)', muted: 'rgba(14,14,14,0.48)', muted2: 'rgba(14,14,14,0.30)',
    page: '#F3ECE0', green: '#2D8F32', greenBg: 'rgba(45,160,50,0.10)', amber: '#B87A00', amberBg: 'rgba(224,168,78,0.14)',
    red: '#C94040', redBg: 'rgba(201,64,64,0.10)', shadowSm: '0 1px 3px rgba(14,14,14,0.06),0 2px 8px rgba(14,14,14,0.04)',
    shadowLg: '0 4px 16px rgba(14,14,14,0.10),0 16px 48px rgba(14,14,14,0.10)',
};
const DT = {
    ink: '#F3EDE3', orange: '#FF5A1F', surface: '#1C1710', surface2: '#252015', surface3: '#30281A',
    border: 'rgba(243,237,227,0.10)', border2: 'rgba(243,237,227,0.22)', muted: 'rgba(243,237,227,0.55)', muted2: 'rgba(243,237,227,0.30)',
    page: '#120E08', green: '#7AD3A0', greenBg: 'rgba(45,160,50,0.16)', amber: '#E0A84E', amberBg: 'rgba(224,168,78,0.16)',
    red: '#e07070', redBg: 'rgba(224,112,112,0.16)', shadowSm: '0 1px 3px rgba(0,0,0,0.20),0 2px 8px rgba(0,0,0,0.18)',
    shadowLg: '0 4px 16px rgba(0,0,0,0.4),0 16px 48px rgba(0,0,0,0.3)',
};
const MONO = "'JetBrains Mono', monospace";
const fmt = (n: number) => n.toLocaleString('tr-TR');
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

type TableStatus = 'bos' | 'rezerve' | 'dolu';

export const MasaPage = () => {
    const { dark } = useTheme();
    const T = dark ? DT : LT;
    const isMobile = useIsMobile();
    const { tables, isLoading: tablesLoading, addTable, deleteTable } = useTables();
    const { addPayment } = usePayments();
    const { products } = useProducts();
    const { allCustomers, addCustomer } = useCustomers();
    const { staff } = useStaff();
    const { sendWebhook } = useReservations();
    const [date, setDate] = useState(() => toISODate(new Date()));
    const { reservations: allReservations, addReservation, setStatus, removeReservation, updateAdisyon } = useTableReservations(date);

    // Hayalet koruması: silinmiş (artık listede olmayan) masaya bağlı rezervasyonlar
    // sayaçta görünüp kartta görünmesin — yalnızca görünür masaların kayıtları.
    const reservations = useMemo(
        () => allReservations.filter((r) => tables.some((t) => t.id === r.tableId)),
        [allReservations, tables],
    );

    const [selTableId, setSelTableId] = useState<string | null>(null);
    const [showTableModal, setShowTableModal] = useState(false);
    const [resModal, setResModal] = useState<{ open: boolean; tableId?: string; walkIn?: boolean }>({ open: false });

    // Önümüzdeki 7 gün
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() + i);
        return { ds: toISODate(d), num: d.getDate(), dow: DAY_SHORT[d.getDay()] };
    }), []);

    // Masa → o günkü rezervasyonlar
    const byTable = useMemo(() => {
        const m = new Map<string, TableReservation[]>();
        for (const r of reservations) {
            (m.get(r.tableId) || m.set(r.tableId, []).get(r.tableId)!).push(r);
        }
        for (const arr of m.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
        return m;
    }, [reservations]);

    const statusOf = (tableId: string): TableStatus => {
        const rs = byTable.get(tableId) || [];
        if (rs.some((r) => r.status === 'seated')) return 'dolu';
        if (rs.some((r) => r.status === 'reserved')) return 'rezerve';
        return 'bos';
    };
    const statusColor = (s: TableStatus) => s === 'dolu' ? T.orange : s === 'rezerve' ? T.amber : T.green;
    const statusBg = (s: TableStatus) => s === 'dolu' ? 'rgba(255,90,31,0.10)' : s === 'rezerve' ? T.amberBg : T.greenBg;
    const statusLabel = (s: TableStatus) => s === 'dolu' ? 'Dolu' : s === 'rezerve' ? 'Rezerve' : 'Boş';

    const selTable = tables.find((t) => t.id === selTableId) || null;
    const selRes = selTableId ? (byTable.get(selTableId) || []) : [];

    const totalRes = reservations.length;
    const fullCount = tables.filter((t) => statusOf(t.id) === 'dolu').length;
    const dObj = new Date(date + 'T00:00:00');

    // Masa yoksa rezervasyon modalı boş açılmasın
    const openResModal = (opts: { tableId?: string; walkIn?: boolean }) => {
        if (tables.length === 0) { toast.error('Önce bir masa ekle'); setShowTableModal(true); return; }
        setResModal({ open: true, ...opts });
    };

    // Çifte rezervasyon koruması: aynı masada zaman penceresi çakışan aktif
    // (rezerve/oturmuş) kayıt varsa engelle. end_time yoksa 2 saatlik oturma varsay.
    const DEFAULT_SIT_MIN = 120;
    const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
    const findClash = (tableId: string, startTime: string, endTime?: string): TableReservation | null => {
        const s = toMin(startTime);
        const e = endTime ? toMin(endTime) : s + DEFAULT_SIT_MIN;
        return (byTable.get(tableId) || []).find((r) => {
            if (r.status === 'completed') return false;
            const rs = toMin(r.startTime);
            const re = r.endTime ? toMin(r.endTime) : rs + DEFAULT_SIT_MIN;
            return s < re && rs < e;
        }) || null;
    };

    // Telefon varsa müşteri kartına bağla: eşleşen kayıt varsa onu kullan,
    // yoksa sessizce oluştur. LTV/geçmiş masa ziyaretlerini de görsün.
    const linkCustomer = async (name: string, phone?: string): Promise<string | undefined> => {
        const norm = phone?.replace(/\s+/g, '').trim();
        if (!norm) return undefined;
        const existing = allCustomers.find((c) => c.phone.replace(/\s+/g, '') === norm);
        if (existing) return existing.id;
        const created = await addCustomer({ name: name || 'Misafir', phone: norm });
        return created?.id;
    };

    const saveReservation = async (payload: Omit<TableReservation, 'id' | 'createdAt' | 'organizationId'>) => {
        const tName = tables.find((t) => t.id === payload.tableId)?.name || 'Masa';
        const clash = findClash(payload.tableId, payload.startTime, payload.endTime);
        if (clash) {
            toast.error(`${tName} bu saatte dolu: ${clash.startTime} · ${clash.customerName}`);
            return;
        }
        const cap = tables.find((t) => t.id === payload.tableId)?.capacity ?? 0;
        if (cap > 0 && payload.partySize > cap) {
            toast.warning(`Dikkat: ${payload.partySize} kişi, masa ${cap} kişilik`);
        }
        const customerId = await linkCustomer(payload.customerName, payload.customerPhone);
        const r = await addReservation({ ...payload, customerId });
        if (r) {
            sendWebhook('table_reservation.created', {
                id: r.id, table: tName, customerName: r.customerName, partySize: r.partySize,
                date: r.date, startTime: r.startTime, walkIn: !!resModal.walkIn,
            });
            toast.success(resModal.walkIn ? 'Walk-in oturtuldu' : 'Rezervasyon eklendi');
            setResModal({ open: false });
        }
    };

    // Adisyon: masaya kalem eklenir (birikir), "Hesabı Kapat" ile Kasa'ya yazılır.
    const [adisyonRes, setAdisyonRes] = useState<TableReservation | null>(null);
    // Modal açıkken canlı satırı yansıt (realtime kalem eklendiğinde güncel kalsın)
    const adisyonLive = adisyonRes ? reservations.find((x) => x.id === adisyonRes.id) || adisyonRes : null;
    const handleStatus = (id: string, s: TableReservation['status']) => {
        if (s === 'completed') {
            const r = reservations.find((x) => x.id === id);
            if (r) { setAdisyonRes(r); return; }
        }
        setStatus(id, s);
    };
    const completeTable = async (r: TableReservation, amount: number, method: PaymentMethod, summary: string) => {
        const tName = tables.find((t) => t.id === r.tableId)?.name || 'Masa';
        if (amount > 0) {
            const p = await addPayment({
                amount, method, type: 'service',
                description: `${tName} · ${summary || r.customerName}`,
                customerId: r.customerId, staffId: r.staffId,
            });
            if (!p) return; // hata toast'ı addPayment içinde
        }
        await setStatus(r.id, 'completed');
        sendWebhook('table_reservation.completed', { id: r.id, table: tName, amount });
        toast.success(amount > 0 ? `${amount.toLocaleString('tr-TR')} ₺ tahsil edildi · masa kapatıldı` : 'Masa kapatıldı');
        setAdisyonRes(null);
    };

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: T.page, padding: isMobile ? '16px 14px 96px' : '24px 28px 48px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                {/* Başlık */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: T.ink }}>Masa Yönetimi</h1>
                        <p style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>
                            {tablesLoading
                                ? `${dObj.getDate()} ${MONTHS[dObj.getMonth()]} · yükleniyor…`
                                : `${tables.length} masa · ${dObj.getDate()} ${MONTHS[dObj.getMonth()]} · ${totalRes} rezervasyon · ${fullCount} dolu`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowTableModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.surface, color: T.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            <Plus size={15} /> Masa Ekle
                        </button>
                        <button onClick={() => openResModal({ walkIn: true })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: 'none', background: T.surface3, color: T.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            <Armchair size={15} /> Walk-in
                        </button>
                        <button onClick={() => openResModal({})} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: 'none', background: T.orange, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 16px rgba(255,90,31,0.3)' }}>
                            <Plus size={15} /> Yeni Rezervasyon
                        </button>
                    </div>
                </div>

                {/* Gün şeridi */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 22, overflowX: 'auto', paddingBottom: 4 }}>
                    {days.map((d) => {
                        const sel = d.ds === date;
                        return (
                            <button key={d.ds} onClick={() => { setDate(d.ds); setSelTableId(null); }}
                                style={{ minWidth: 58, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 4px', borderRadius: 12, border: `1px solid ${sel ? T.orange : T.border}`, background: sel ? T.orange : T.surface, color: sel ? '#fff' : T.ink, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <span style={{ fontSize: 11, opacity: 0.8 }}>{d.dow}</span>
                                <span style={{ fontSize: 18, fontWeight: 800 }}>{d.num}</span>
                            </button>
                        );
                    })}
                </div>

                {tablesLoading ? (
                    /* İlk yükleme: "Henüz masa yok" flaşı yerine iskelet kartlar */
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
                        {[0, 1, 2].map((i) => (
                            <div key={i} style={{ height: 96, borderRadius: 16, background: T.surface2, border: `1.5px solid ${T.border}`, animation: 'pulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
                        ))}
                        <style>{`@keyframes pulse { 0%,100% { opacity: .45 } 50% { opacity: .9 } }`}</style>
                    </div>
                ) : tables.length === 0 ? (
                    <div style={{ background: T.surface, border: `1px dashed ${T.border2}`, borderRadius: 16, padding: '48px 20px', textAlign: 'center' }}>
                        <Armchair size={32} color={T.muted2} style={{ margin: '0 auto 12px' }} />
                        <p style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Henüz masa yok</p>
                        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Salonunu kurmak için ilk masanı ekle.</p>
                        <button onClick={() => setShowTableModal(true)} style={{ marginTop: 16, padding: '10px 18px', borderRadius: 10, border: 'none', background: T.orange, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Masa Ekle</button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: selTable && !isMobile ? '1fr 320px' : '1fr', gap: 18, alignItems: 'start' }}>
                        {/* Floor plan */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
                            {tables.map((t) => {
                                const s = statusOf(t.id);
                                const rs = byTable.get(t.id) || [];
                                const active = selTableId === t.id;
                                return (
                                    <button key={t.id} onClick={() => setSelTableId(active ? null : t.id)}
                                        style={{ textAlign: 'left', background: statusBg(s), border: `1.5px solid ${active ? statusColor(s) : T.border}`, borderRadius: 16, padding: '16px', cursor: 'pointer', transition: 'all .15s', boxShadow: T.shadowSm, position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{t.name}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: T.muted, fontFamily: MONO }}><Users size={12} /> {t.capacity}</span>
                                        </div>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, padding: '3px 9px', borderRadius: 999, background: statusColor(s), color: '#fff', fontSize: 11, fontWeight: 700 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} /> {statusLabel(s)}
                                        </div>
                                        {rs.length > 0 && <div style={{ fontSize: 11, color: T.muted, marginTop: 8, fontFamily: MONO }}>{rs.length} rezervasyon · ilki {rs[0].startTime}</div>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Seçili masa paneli */}
                        {selTable && (
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '18px 18px', boxShadow: T.shadowSm }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <h3 style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{selTable.name}</h3>
                                    <button onClick={() => setSelTableId(null)} style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center', border: 'none', background: 'none', color: T.muted, cursor: 'pointer' }}><X size={16} /></button>
                                </div>
                                <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>{selTable.capacity} kişilik · {formatDateEU(date)}</p>

                                {selRes.length === 0 ? (
                                    <p style={{ fontSize: 13, color: T.muted, padding: '12px 0' }}>Bu gün rezervasyon yok</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {selRes.map((r) => (
                                            <ResRow key={r.id} r={r} T={T} staffName={staff.find((s) => s.id === r.staffId)?.name} onStatus={handleStatus} onRemove={removeReservation} onAdisyon={() => setAdisyonRes(r)} />
                                        ))}
                                    </div>
                                )}

                                <button onClick={() => openResModal({ tableId: selTable.id })}
                                    style={{ width: '100%', marginTop: 14, padding: '10px', borderRadius: 10, border: `1px solid ${T.border2}`, background: 'none', color: T.orange, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    + Bu masaya rezervasyon
                                </button>
                                <button onClick={async () => { if (await confirmDialog({ title: `${selTable.name} silinsin mi?`, danger: true, confirmLabel: 'Sil' })) { deleteTable(selTable.id); setSelTableId(null); } }}
                                    style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 10, border: 'none', background: 'none', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Masayı sil
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showTableModal && <TableModal T={T} onClose={() => setShowTableModal(false)} onSave={async (n, c) => { const r = await addTable({ name: n, capacity: c }); if (r) { toast.success('Masa eklendi'); setShowTableModal(false); } }} />}
            {resModal.open && <ResModal T={T} tables={tables} staff={staff} date={date} preTableId={resModal.tableId} walkIn={resModal.walkIn}
                onClose={() => setResModal({ open: false })}
                onSave={saveReservation} />}
            {adisyonLive && <MasaAdisyonModal T={T} r={adisyonLive} products={products}
                tableName={tables.find((t) => t.id === adisyonLive.tableId)?.name || 'Masa'}
                onClose={() => setAdisyonRes(null)}
                onUpdateItems={(updater) => updateAdisyon(adisyonLive.id, updater)}
                onComplete={completeTable} />}
        </div>
    );
};

// ── Rezervasyon satırı ────────────────────────────────────────────────────────
function ResRow({ r, T, staffName, onStatus, onRemove, onAdisyon }: { r: TableReservation; T: typeof LT; staffName?: string; onStatus: (id: string, s: any) => void; onRemove: (id: string) => void; onAdisyon: () => void }) {
    const stColor = r.status === 'seated' ? T.orange : r.status === 'completed' ? T.green : T.amber;
    const stLabel = r.status === 'seated' ? 'Oturdu' : r.status === 'completed' ? 'Tamamlandı' : 'Rezerve';
    const total = adisyonTotal(r.adisyonItems);
    const open = r.status !== 'completed';
    return (
        <div style={{ background: T.surface2, borderRadius: 12, padding: '11px 12px', borderLeft: `3px solid ${stColor}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customerName}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: stColor }}>{stLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, fontSize: 11.5, color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>
                <span><Clock size={11} style={{ verticalAlign: -1 }} /> {r.startTime}{r.endTime ? `–${r.endTime}` : ''}</span>
                <span><Users size={11} style={{ verticalAlign: -1 }} /> {r.partySize}</span>
                {r.customerPhone && <span><Phone size={11} style={{ verticalAlign: -1 }} /> {r.customerPhone}</span>}
                {staffName && <span>· {staffName}</span>}
            </div>
            {total > 0 && (
                <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: T.muted, fontWeight: 600 }}>Adisyon</span>
                    <span style={{ fontWeight: 800, color: T.ink, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(total)} ₺</span>
                </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                {r.status === 'reserved' && <MiniBtn T={T} onClick={() => onStatus(r.id, 'seated')} primary>Oturt</MiniBtn>}
                {open && <MiniBtn T={T} onClick={onAdisyon} primary><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ReceiptText size={13} /> Adisyon</span></MiniBtn>}
                <MiniBtn T={T} onClick={() => onRemove(r.id)}><Trash2 size={12} /></MiniBtn>
            </div>
        </div>
    );
}
function MiniBtn({ T, onClick, children, primary }: { T: typeof LT; onClick: () => void; children: React.ReactNode; primary?: boolean }) {
    return <button onClick={onClick} style={{ flex: primary ? 1 : '0 0 auto', padding: '6px 10px', borderRadius: 8, border: primary ? 'none' : `1px solid ${T.border2}`, background: primary ? T.orange : 'none', color: primary ? '#fff' : T.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center' }}>{children}</button>;
}

// ── Masa ekle modalı ──────────────────────────────────────────────────────────
function TableModal({ T, onClose, onSave }: { T: typeof LT; onClose: () => void; onSave: (name: string, capacity: number) => void }) {
    const [name, setName] = useState('');
    const [capacity, setCapacity] = useState(4);
    return (
        <ModalShell T={T} title="Masa Ekle" onClose={onClose}>
            <Field T={T} label="Masa Adı"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Masa 1 / Bahçe 3" style={inp(T)} autoFocus /></Field>
            <Field T={T} label="Kapasite (kişi)">
                <div style={{ display: 'flex', gap: 8 }}>
                    {[2, 4, 6, 8].map((c) => (
                        <button key={c} onClick={() => setCapacity(c)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${capacity === c ? T.orange : T.border2}`, background: capacity === c ? 'rgba(255,90,31,0.08)' : T.surface2, color: capacity === c ? T.orange : T.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{c}</button>
                    ))}
                </div>
            </Field>
            <button disabled={!name.trim()} onClick={() => onSave(name.trim(), capacity)} style={primaryBtn(T, !name.trim())}>Ekle</button>
        </ModalShell>
    );
}

// ── Rezervasyon / walk-in modalı ──────────────────────────────────────────────
function ResModal({ T, tables, staff, date, preTableId, walkIn, onClose, onSave }: {
    T: typeof LT; tables: Table[]; staff: Staff[]; date: string; preTableId?: string; walkIn?: boolean;
    onClose: () => void; onSave: (p: Omit<TableReservation, 'id' | 'createdAt' | 'organizationId'>) => void;
}) {
    const now = new Date();
    const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const [tableId, setTableId] = useState(preTableId || tables[0]?.id || '');
    const [name, setName] = useState(walkIn ? 'Walk-in' : '');
    const [phone, setPhone] = useState('');
    const [party, setParty] = useState(2);
    const [time, setTime] = useState(walkIn ? nowHM : '19:00');
    const [staffId, setStaffId] = useState('');
    const canSave = !!tableId && name.trim().length > 0;
    return (
        <ModalShell T={T} title={walkIn ? 'Walk-in' : 'Yeni Rezervasyon'} onClose={onClose}>
            <Field T={T} label="Masa">
                <select value={tableId} onChange={(e) => setTableId(e.target.value)} style={inp(T)}>
                    {tables.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.capacity} kişi)</option>)}
                </select>
            </Field>
            <Field T={T} label="Müşteri Adı"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="İsim" style={inp(T)} /></Field>
            <div style={{ display: 'flex', gap: 12 }}>
                <Field T={T} label="Kişi"><input type="number" min={1} value={party} onChange={(e) => setParty(Math.max(1, Number(e.target.value)))} style={inp(T)} /></Field>
                <Field T={T} label="Saat"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp(T)} /></Field>
            </div>
            <Field T={T} label="Telefon (ops.)"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx" style={inp(T)} /></Field>
            {staff.length > 0 && (
                <Field T={T} label="Garson (ops.)">
                    <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={inp(T)}>
                        <option value="">Atanmadı</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </Field>
            )}
            <button disabled={!canSave} onClick={() => onSave({ tableId, customerName: name.trim(), customerPhone: phone.trim() || undefined, staffId: staffId || undefined, partySize: party, date, startTime: time, status: walkIn ? 'seated' : 'reserved' })} style={primaryBtn(T, !canSave)}>
                {walkIn ? 'Oturt' : 'Rezervasyon Oluştur'}
            </button>
        </ModalShell>
    );
}

// ── Masa adisyon modalı ───────────────────────────────────────────────────────
// Menüden kalem eklenir (adet), toplam birikir, "Hesabı Kapat" ile Kasa'ya yazılır.
// Kalemler updateAdisyon ile kaydedilir → garson ile ana bilgisayar realtime paylaşır.
const PAY_METHODS: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' }, { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' }, { key: 'other', label: 'Diğer' },
];
function MasaAdisyonModal({ T, r, products, tableName, onClose, onUpdateItems, onComplete }: {
    T: typeof LT; r: TableReservation; products: Product[]; tableName: string;
    onClose: () => void; onUpdateItems: (updater: (prev: MasaAdisyonItem[]) => MasaAdisyonItem[]) => void;
    onComplete: (r: TableReservation, amount: number, method: PaymentMethod, summary: string) => Promise<void>;
}) {
    const items = r.adisyonItems || [];
    const total = adisyonTotal(items);
    const menu = useMemo(() => groupMenu(products), [products]);
    const [cat, setCat] = useState(menu[0]?.category || '');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [busy, setBusy] = useState(false);
    const [extraName, setExtraName] = useState('');
    const [extraPrice, setExtraPrice] = useState('');
    const catItems = menu.find((m) => m.category === cat)?.items || [];

    const add = (p: Product) => onUpdateItems((prev) => addMenuItem(prev, p));
    const qty = (id: string, d: number) => onUpdateItems((prev) => changeQty(prev, id, d));
    const addExtra = () => {
        const price = parseInt(extraPrice || '0', 10) || 0;
        if (!extraName.trim() || price <= 0) return;
        onUpdateItems((prev) => addExtraItem(prev, extraName.trim(), price));
        setExtraName(''); setExtraPrice('');
    };
    const close = async (amt: number) => { setBusy(true); try { await onComplete(r, amt, method, adisyonSummary(items)); } finally { setBusy(false); } };

    return (
        <ModalShell T={T} title={`${tableName} · Adisyon`} onClose={onClose}>
            <p style={{ fontSize: 13, color: T.muted, marginTop: -8, marginBottom: 14 }}>{r.customerName} · {r.partySize} kişi · {r.startTime}</p>

            {/* Adisyon kalemleri */}
            {items.length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted, padding: '10px 12px', background: T.surface2, borderRadius: 10, marginBottom: 14, textAlign: 'center' }}>Adisyon boş — menüden kalem ekle</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    {items.map((it) => (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                                <div style={{ fontSize: 11, color: T.muted, fontFamily: MONO }}>{fmt(it.price)} ₺ {it.kind === 'extra' ? '· ekstra' : ''}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button onClick={() => qty(it.id, -1)} style={qtyBtn(T)}><Minus size={13} /></button>
                                <span style={{ minWidth: 18, textAlign: 'center', fontSize: 13.5, fontWeight: 800, fontFamily: MONO }}>{it.qty}</span>
                                <button onClick={() => qty(it.id, +1)} style={qtyBtn(T)}><Plus size={13} /></button>
                            </div>
                            <span style={{ width: 62, textAlign: 'right', fontSize: 13.5, fontWeight: 800, fontFamily: MONO }}>{fmt(it.price * it.qty)} ₺</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Menü — kategori sekmeleri + ürünler */}
            {menu.length > 0 ? (
                <>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
                        {menu.map((m) => (
                            <button key={m.category} onClick={() => setCat(m.category)} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: cat === m.category ? T.orange : T.surface2, color: cat === m.category ? '#fff' : T.muted, border: `1px solid ${cat === m.category ? T.orange : T.border2}` }}>{m.category}</button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14, maxHeight: 160, overflowY: 'auto' }}>
                        {catItems.map((p) => (
                            <button key={p.id} onClick={() => add(p)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '9px 11px', borderRadius: 10, background: T.surface2, border: `1px solid ${T.border2}`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{p.name}</span>
                                <span style={{ fontSize: 11.5, color: T.orange, fontWeight: 700, fontFamily: MONO }}>{fmt(p.price)} ₺</span>
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Menü boş — Kasa &gt; Ürünler'den ürün ekleyebilirsin.</div>
            )}

            {/* Serbest kalem */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="Serbest kalem" style={{ ...inp(T), flex: 2 }} />
                <input value={extraPrice} onChange={(e) => setExtraPrice(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="₺" style={{ ...inp(T), flex: 1, minWidth: 0 }} />
                <button onClick={addExtra} style={{ padding: '0 12px', borderRadius: 9, background: T.surface3, color: T.ink, border: 'none', cursor: 'pointer', fontWeight: 800 }}><Plus size={16} /></button>
            </div>

            {/* Toplam */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>Toplam</span>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: T.orange }}>{fmt(total)} <span style={{ fontSize: 15 }}>₺</span></span>
            </div>

            {/* Ödeme yöntemi */}
            <div style={{ display: 'flex', gap: 6, margin: '8px 0 12px' }}>
                {PAY_METHODS.map((m) => (
                    <button key={m.key} onClick={() => setMethod(m.key)} style={{ flex: 1, padding: '8px 4px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: method === m.key ? T.ink : T.surface2, color: method === m.key ? T.surface : T.muted, border: `1px solid ${method === m.key ? T.ink : T.border2}` }}>{m.label}</button>
                ))}
            </div>

            <button disabled={total <= 0 || busy} onClick={() => close(total)} style={primaryBtn(T, total <= 0 || busy)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Wallet size={16} /> {total > 0 ? `${fmt(total)} ₺ Tahsil Et & Kapat` : 'Adisyon boş'}</span>
            </button>
            <button disabled={busy} onClick={() => close(0)} style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 10, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Tahsilatsız Kapat (ikram/iptal)
            </button>
        </ModalShell>
    );
}
function qtyBtn(T: typeof LT): React.CSSProperties {
    return { width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', border: `1px solid ${T.border2}`, background: T.surface, color: T.ink, cursor: 'pointer' };
}

// ── Ortak modal/parça yardımcıları ────────────────────────────────────────────
function ModalShell({ T, title, onClose, children }: { T: typeof LT; title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: 20, padding: 24, width: 420, maxWidth: '92vw', boxShadow: T.shadowLg, border: `1px solid ${T.border2}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>{title}</h2>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', border: 'none', background: 'none', color: T.muted, cursor: 'pointer' }}><X size={18} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
function Field({ T, label, children }: { T: typeof LT; label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 14, flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</label>
            {children}
        </div>
    );
}
function inp(T: typeof LT): React.CSSProperties {
    return { width: '100%', background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: 10, padding: '10px 13px', fontFamily: 'inherit', fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box' };
}
function primaryBtn(T: typeof LT, disabled: boolean): React.CSSProperties {
    return { width: '100%', marginTop: 6, padding: '12px', borderRadius: 12, border: 'none', background: disabled ? T.surface3 : T.orange, color: disabled ? T.muted2 : '#fff', fontSize: 14, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: disabled ? 'none' : '0 6px 16px rgba(255,90,31,0.3)' };
}
