import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Users, Clock, Phone, X, Armchair } from 'lucide-react';
import { useTables } from '@/hooks/useTables';
import { useTableReservations } from '@/hooks/useTableReservations';
import { useQueue } from '@/hooks/useQueue';
import { useStaff } from '@/hooks/useStaff';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { toISODate } from '@/utils/date';
import { adisyonTotal, seatedMinutes, elapsedLabel, LONG_SIT_MIN } from '@/utils/masaAdisyon';
import type { TableReservation, QueueEntry } from '@/types';
import { BottomSheet } from '../BottomSheet';
import { MobileAdisyonSheet } from '../MobileAdisyonSheet';
import { MobileMasaReservationSheet } from '../MobileMasaReservationSheet';
import { T } from '../theme';
import { useMinuteTick } from '../hooks';

const fmt = (n: number) => n.toLocaleString('tr-TR');
type TableStatus = 'bos' | 'rezerve' | 'dolu';
function statusOf(rs: TableReservation[]): TableStatus {
    if (rs.some((r) => r.status === 'seated')) return 'dolu';
    if (rs.some((r) => r.status === 'reserved')) return 'rezerve';
    return 'bos';
}
const STATUS_C: Record<TableStatus, string> = { bos: T.green, dolu: T.orange, rezerve: T.blue };
const STATUS_L: Record<TableStatus, string> = { bos: 'Boş', dolu: 'Dolu', rezerve: 'Rezerve' };
const waitMinutes = (joinedAt: string) => Math.max(0, Math.round((Date.now() - new Date(joinedAt).getTime()) / 60000));

// Çifte rezervasyon koruması — masaüstü MasaPage.tsx'teki findClash ile aynı mantık.
const DEFAULT_SIT_MIN = 120;
const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

export const MobileMasa = () => {
    const { tables } = useTables();
    const { staff } = useStaff();
    const { allCustomers, addCustomer } = useCustomers();
    const { sendWebhook } = useReservations();
    const { waiting: waitlist, serveEntry: serveWaitlistEntry, removeEntry: removeWaitlistEntry } = useQueue();
    useMinuteTick(); // gece yarısını geçince gün otomatik güncellensin
    const date = toISODate(new Date());
    const { reservations, addReservation, setStatus } = useTableReservations(date);

    const [zone, setZone] = useState('Tümü');
    const [selTableId, setSelTableId] = useState<string | null>(null);
    const [resSheet, setResSheet] = useState<{ open: boolean; tableId?: string; walkIn?: boolean; fromWaitlist?: QueueEntry }>({ open: false });
    const [adisyonRes, setAdisyonRes] = useState<TableReservation | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    // Alt bardaki "+" FAB, /masa?new=1 ile buraya yönlenip yeni rezervasyon sheet'ini açar.
    useEffect(() => {
        if (searchParams.get('new') === '1') {
            setResSheet({ open: true });
            setSearchParams((p) => { p.delete('new'); return p; }, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const byTable = useMemo(() => {
        const m = new Map<string, TableReservation[]>();
        for (const r of reservations) (m.get(r.tableId) || m.set(r.tableId, []).get(r.tableId)!).push(r);
        for (const arr of m.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
        return m;
    }, [reservations]);

    const zones = useMemo(() => ['Tümü', ...Array.from(new Set(tables.map((t) => t.zone || 'Salon')))], [tables]);
    const zoneGroups = useMemo(() => {
        const order = zone === 'Tümü' ? Array.from(new Set(tables.map((t) => t.zone || 'Salon'))) : [zone];
        return order.map((z) => ({ zone: z, items: tables.filter((t) => (t.zone || 'Salon') === z) }));
    }, [tables, zone]);

    const doluCount = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'dolu').length;
    const rezCount = tables.filter((t) => statusOf(byTable.get(t.id) || []) === 'rezerve').length;
    const bosCount = tables.length - doluCount - rezCount;

    const selTable = tables.find((t) => t.id === selTableId) || null;
    const selRes = selTableId ? (byTable.get(selTableId) || []) : [];

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
        // findClash yalnızca görüntülenen günün (bugün) rezervasyon listesine bakar —
        // ileri tarihli seçimlerde bu liste ilgili günü yansıtmaz, bu yüzden çakışma
        // kontrolü sadece bugüne kaydederken çalışır (ileri tarih DB'ye güvenle yazılır,
        // ama anlık çakışma uyarısı gösterilemez — masaüstü MasaPage'de görülür).
        const clash = payload.date === date ? findClash(payload.tableId, payload.startTime, payload.endTime) : null;
        if (clash) { toast.error(`${tName} bu saatte dolu: ${clash.startTime} · ${clash.customerName}`); return; }
        const cap = tables.find((t) => t.id === payload.tableId)?.capacity ?? 0;
        if (cap > 0 && payload.partySize > cap) toast.warning(`Dikkat: ${payload.partySize} kişi, masa ${cap} kişilik`);
        const customerId = await linkCustomer(payload.customerName, payload.customerPhone);
        const r = await addReservation({ ...payload, customerId });
        if (r) {
            sendWebhook('table_reservation.created', { id: r.id, table: tName, customerName: r.customerName, partySize: r.partySize, date: r.date, startTime: r.startTime, walkIn: !!resSheet.walkIn });
            toast.success(resSheet.walkIn ? 'Walk-in oturtuldu' : 'Rezervasyon eklendi');
            if (resSheet.fromWaitlist) serveWaitlistEntry(resSheet.fromWaitlist.id);
            setResSheet({ open: false });
        }
    };

    return (
        <div style={{ color: T.ink, paddingBottom: 24 }}>
            {/* Header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.035em' }}>Masalar</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{tables.length} masa · {zones.length - 1} bölge</div>
            </div>

            <div style={{ padding: '10px 22px 0' }}>
                {/* 3'lü sayaç */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 16 }}>
                    {[['Dolu', doluCount, T.orange], ['Rezerve', rezCount, T.blue], ['Boş', bosCount, T.green]].map(([k, v, c]) => (
                        <div key={k as string} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15, padding: '12px 4px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: c as string }}>{v}</div>
                            <div style={{ fontSize: 9.5, color: T.muted, marginTop: 3, fontWeight: 600 }}>{k}</div>
                        </div>
                    ))}
                </div>

                {/* Bölge filtresi */}
                {zones.length > 2 && (
                    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2, marginBottom: 18, scrollbarWidth: 'none' }}>
                        {zones.map((z) => (
                            <button key={z} onClick={() => setZone(z)} style={{ padding: '8px 15px', borderRadius: 999, background: zone === z ? T.orange : T.surface, color: zone === z ? '#0E0E0E' : T.muted, fontSize: 12.5, fontWeight: 750, border: `1px solid ${zone === z ? T.orange : T.border}`, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{z}</button>
                        ))}
                    </div>
                )}

                {/* Masa grid — bölgeli */}
                {tables.length === 0 ? (
                    <div style={{ background: T.surface, border: `1px dashed ${T.border2}`, borderRadius: 18, padding: '40px 20px', textAlign: 'center', color: T.muted, fontSize: 13 }}>Henüz masa yok</div>
                ) : (
                    zoneGroups.map(({ zone: z, items }) => items.length === 0 ? null : (
                        <div key={z} style={{ marginBottom: 20 }}>
                            {zoneGroups.length > 1 && (
                                <div style={{ fontSize: 11, color: T.muted2, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 10 }}>{z}</div>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                {items.map((t) => {
                                    const rs = byTable.get(t.id) || [];
                                    const s = statusOf(rs);
                                    const c = STATUS_C[s];
                                    const active = rs.find((r) => r.status !== 'completed');
                                    return (
                                        <button key={t.id} onClick={() => setSelTableId(t.id)} style={{ width: 100, background: s === 'bos' ? T.surface : `${c}18`, border: `1.5px solid ${s === 'bos' ? T.border : c}`, borderRadius: 15, padding: '11px 9px', cursor: 'pointer', textAlign: 'left' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: 14, fontWeight: 850, color: T.ink }}>{t.name}</span>
                                                <span style={{ fontSize: 8.5, fontWeight: 700, color: T.muted2 }}>{t.capacity} kişi</span>
                                            </div>
                                            <div style={{ marginTop: 6, fontSize: 9.5, fontWeight: 750, color: c }}>{STATUS_L[s]}</div>
                                            {active && <div style={{ fontSize: 9, color: T.muted, marginTop: 2, fontFamily: T.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.startTime} · {active.customerName.split(' ')[0]}</div>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}

                {/* Bekleme Listesi */}
                {waitlist.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                            <div style={{ fontSize: 15, fontWeight: 850, letterSpacing: '-0.025em' }}>Bekleme Listesi</div>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: T.amber, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900, color: '#0E0E0E' }}>{waitlist.length}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {waitlist.map((w, i) => (
                                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: T.surface3, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700 }}>{w.customerName}</div>
                                        <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>{w.partySize} kişi</div>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 750, color: T.amber, fontFamily: T.mono, flexShrink: 0 }}>~{waitMinutes(w.joinedAt)} dk</span>
                                    <button aria-label="Otur" onClick={() => setResSheet({ open: true, walkIn: true, fromWaitlist: w })} style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', border: 'none', background: T.orange, color: '#0E0E0E', cursor: 'pointer', flexShrink: 0 }}>
                                        <Armchair size={16} />
                                    </button>
                                    <button aria-label="Bekleme listesinden çıkar" onClick={() => removeWaitlistEntry(w.id)} style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', border: 'none', background: T.surface3, color: T.muted2, cursor: 'pointer', flexShrink: 0 }}>
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* FAB — masa seçmeden walk-in oturt (yeni rezervasyon alt bardaki "+" ile açılır) */}
            <div style={{ position: 'fixed', right: 20, bottom: 96, zIndex: 30 }}>
                <button onClick={() => setResSheet({ open: true, walkIn: true })} aria-label="Walk-in"
                    style={{ width: 48, height: 48, borderRadius: 16, background: T.surface, border: `1px solid ${T.border2}`, color: T.ink, display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>
                    <Armchair size={19} />
                </button>
            </div>

            {/* Masa detay sheet */}
            <BottomSheet open={!!selTable} onClose={() => setSelTableId(null)} title={selTable?.name || ''}>
                {selTable && (
                    <div style={{ paddingBottom: 8 }}>
                        <p style={{ fontSize: 12.5, color: T.muted, marginTop: -8, marginBottom: 16 }}>{selTable.zone} · {selTable.capacity} kişilik</p>
                        {selRes.length === 0 ? (
                            <p style={{ fontSize: 13, color: T.muted, textAlign: 'center', padding: '20px 0' }}>Bu masa için rezervasyon yok</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 8 }}>
                                {selRes.map((r) => <ResCard key={r.id} r={r} onSeat={() => setStatus(r.id, 'seated')} onAdisyon={() => setAdisyonRes(r)} />)}
                            </div>
                        )}
                        <button onClick={() => setResSheet({ open: true, tableId: selTable.id })}
                            style={{ width: '100%', height: 46, borderRadius: 14, background: T.surface, border: `1px dashed ${T.border2}`, color: T.muted, fontSize: 13, fontWeight: 750, cursor: 'pointer', marginTop: 6 }}>
                            + Bu masaya rezervasyon
                        </button>
                    </div>
                )}
            </BottomSheet>

            <MobileMasaReservationSheet open={resSheet.open} tables={tables} staff={staff} date={date}
                preTableId={resSheet.tableId} walkIn={resSheet.walkIn} prefill={resSheet.fromWaitlist}
                onClose={() => setResSheet({ open: false })} onSave={saveReservation} />

            <MobileAdisyonSheet open={!!adisyonRes} reservation={adisyonRes} tableName={selTable?.name || tables.find((t) => t.id === adisyonRes?.tableId)?.name || 'Masa'}
                onClose={() => setAdisyonRes(null)}
                onClosed={() => { toast.success('Masa kapatıldı'); setSelTableId(null); }} />
        </div>
    );
};

function ResCard({ r, onSeat, onAdisyon }: { r: TableReservation; onSeat: () => void; onAdisyon: () => void }) {
    // Garson "Kasaya Gönder" ile completed'a geçmiş ama ödeme henüz alınmamış
    // olabilir (isPaid=false) — kasa/host burada tahsilatı tamamlayabilsin.
    const unpaid = r.status === 'completed' && r.isPaid === false;
    const c = r.status === 'seated' ? T.orange : unpaid ? T.amber : r.status === 'completed' ? T.green : T.blue;
    const bg = r.status === 'seated' ? 'rgba(255,90,31,.10)' : unpaid ? 'rgba(224,168,78,.12)' : r.status === 'completed' ? 'rgba(124,196,127,.08)' : 'rgba(107,159,212,.10)';
    const label = r.status === 'seated' ? 'Oturdu' : unpaid ? 'Ödenmedi' : r.status === 'completed' ? 'Tamamlandı' : 'Rezerve';
    const total = adisyonTotal(r.adisyonItems);
    const mins = r.status === 'seated' ? seatedMinutes(r.seatedAt) : null;
    return (
        <div style={{ background: bg, border: `1px solid ${c}33`, borderRadius: 16, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 780, color: T.ink }}>{r.customerName}</div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {r.startTime}{r.endTime ? `–${r.endTime}` : ''}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Users size={11} /> {r.partySize}</span>
                        {r.customerPhone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Phone size={11} /> {r.customerPhone}</span>}
                        {mins !== null && <span style={{ color: mins >= LONG_SIT_MIN ? T.red : T.muted, fontWeight: 700 }}>⏱ {elapsedLabel(mins)}</span>}
                    </div>
                </div>
                <div style={{ padding: '3px 9px', borderRadius: 999, background: c, color: '#0E0E0E', fontSize: 10, fontWeight: 750, flexShrink: 0 }}>{label}</div>
            </div>
            {r.status === 'reserved' && (
                <button onClick={onSeat} style={{ marginTop: 10, width: '100%', height: 38, borderRadius: 11, background: T.orange, color: '#0E0E0E', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Oturt</button>
            )}
            {(r.status === 'seated' || unpaid) && (
                <button onClick={onAdisyon} style={{ marginTop: 10, width: '100%', height: 38, borderRadius: 11, background: T.orange, color: '#0E0E0E', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer' }}>{unpaid ? `Tahsil Et · ${fmt(total)} ₺` : 'Adisyonu Aç'}</button>
            )}
            {r.status === 'completed' && !unpaid && total > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: T.ink, fontFamily: T.mono, textAlign: 'right' }}>{fmt(total)} ₺</div>
            )}
        </div>
    );
}
