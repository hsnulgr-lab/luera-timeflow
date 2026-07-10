import { useMemo, useState } from 'react';
import { useTableReservations } from '@/hooks/useTableReservations';
import { useProducts } from '@/hooks/useProducts';
import { adisyonTotal, groupMenu, addMenuItem, addExtraItem, changeQty } from '@/utils/masaAdisyon';
import type { TableReservation, Product } from '@/types';
import { D } from './hizmetDesign';

const fmt = (n: number) => n.toLocaleString('tr-TR');

/**
 * Garson masa adisyonu — menüden kalem ekler (adet), toplam birikir.
 * Randevu akışıyla tutarlı: garson tahsilat ALMAZ; hesap ana bilgisayarda/kasada
 * kapatılır. Kalemler updateAdisyon ile kaydedilir → ana bilgisayara realtime akar.
 */
export const MobileMasaDetail = ({ reservation, tableName, onBack }: { reservation: TableReservation; tableName: string; onBack: () => void }) => {
    const { reservations, updateAdisyon, setStatus } = useTableReservations(reservation.date);
    const { products } = useProducts();

    const r = reservations.find((x) => x.id === reservation.id) || reservation;
    const items = r.adisyonItems || [];
    const total = adisyonTotal(items);
    const menu = useMemo(() => groupMenu(products), [products]);
    const [cat, setCat] = useState(menu[0]?.category || '');
    const [exName, setExName] = useState('');
    const [exPrice, setExPrice] = useState('');
    const catItems = menu.find((m) => m.category === cat)?.items || [];

    const add = (p: Product) => updateAdisyon(r.id, (prev) => addMenuItem(prev, p));
    const qty = (id: string, d: number) => updateAdisyon(r.id, (prev) => changeQty(prev, id, d));
    const addExtra = () => {
        const price = parseInt(exPrice || '0', 10) || 0;
        if (!exName.trim() || price <= 0) return;
        updateAdisyon(r.id, (prev) => addExtraItem(prev, exName.trim(), price));
        setExName(''); setExPrice('');
    };

    return (
        <div style={{ position: 'relative', minHeight: '100dvh', background: D.bg, color: D.ink, fontFamily: D.font, paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)' }}>
            {/* Nav */}
            <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 14px) 18px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, background: D.s1, border: `1px solid ${D.border}`, display: 'grid', placeItems: 'center', color: D.ink, cursor: 'pointer' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 850, letterSpacing: '-.03em' }}>{tableName}</div>
                    <div style={{ fontSize: 12, color: D.muted, marginTop: 1 }}>{r.customerName} · {r.partySize} kişi · {r.startTime}</div>
                </div>
                {r.status === 'reserved' && (
                    <button onClick={() => setStatus(r.id, 'seated')} style={{ padding: '9px 14px', borderRadius: 11, background: D.orange, color: '#fff', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Oturt</button>
                )}
            </div>

            {/* Adisyon */}
            <div style={{ padding: '8px 18px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 11 }}>Adisyon</div>
                {items.length === 0 ? (
                    <div style={{ fontSize: 13, color: D.muted, padding: '18px', textAlign: 'center', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 16 }}>Menüden kalem ekle</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {items.map((it) => (
                            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 14 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                                    <div style={{ fontSize: 11, color: D.muted, fontFamily: D.mono }}>{fmt(it.price)} ₺{it.kind === 'extra' ? ' · ekstra' : ''}</div>
                                </div>
                                <button onClick={() => qty(it.id, -1)} style={qtyBtn}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
                                <span style={{ minWidth: 18, textAlign: 'center', fontSize: 14, fontWeight: 850, fontFamily: D.mono }}>{it.qty}</span>
                                <button onClick={() => qty(it.id, +1)} style={qtyBtn}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
                                <span style={{ width: 60, textAlign: 'right', fontSize: 13.5, fontWeight: 850, fontFamily: D.mono }}>{fmt(it.price * it.qty)} ₺</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Menü */}
            <div style={{ padding: '18px 18px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 11 }}>Menü</div>
                {menu.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: D.muted }}>Menü boş — yönetici Kasa &gt; Ürünler'den ekleyebilir.</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 9, overflowX: 'auto', paddingBottom: 2 }}>
                            {menu.map((m) => (
                                <button key={m.category} onClick={() => setCat(m.category)} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 750, cursor: 'pointer', fontFamily: D.font, background: cat === m.category ? D.orange : D.s1, color: cat === m.category ? '#fff' : D.muted, border: `1px solid ${cat === m.category ? D.orange : D.border}` }}>{m.category}</button>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {catItems.map((p) => (
                                <button key={p.id} onClick={() => add(p)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '12px 13px', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 15, cursor: 'pointer', fontFamily: D.font, textAlign: 'left' }}>
                                    <span style={{ fontSize: 13, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{p.name}</span>
                                    <span style={{ fontSize: 12, color: D.orange, fontWeight: 800, fontFamily: D.mono }}>{fmt(p.price)} ₺</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Serbest kalem */}
                <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
                    <input value={exName} onChange={(e) => setExName(e.target.value)} placeholder="Serbest kalem" style={{ ...inp, flex: 2 }} />
                    <input value={exPrice} onChange={(e) => setExPrice(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="₺" style={{ ...inp, flex: 1, minWidth: 0 }} />
                    <button onClick={addExtra} style={{ padding: '0 14px', borderRadius: 11, background: D.s3, color: D.ink, border: 'none', cursor: 'pointer', fontWeight: 850, fontSize: 18 }}>+</button>
                </div>
            </div>

            {/* Toplam — sabit alt bar */}
            <div style={{ position: 'sticky', bottom: 0, marginTop: 20, padding: '14px 18px calc(env(safe-area-inset-bottom,0px) + 14px)', background: `linear-gradient(to top, ${D.bg} 70%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 11, color: D.muted, fontFamily: D.mono, textTransform: 'uppercase', letterSpacing: '.08em' }}>Toplam</div>
                    <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.04em', color: D.orange }}>{fmt(total)} ₺</div>
                </div>
                <div style={{ fontSize: 11.5, color: D.muted, fontWeight: 600, textAlign: 'right', maxWidth: 150 }}>Hesap kasada kapatılır</div>
            </div>
        </div>
    );
};

const qtyBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', border: `1px solid ${D.border2}`, background: D.s2, color: D.ink, cursor: 'pointer', flexShrink: 0 };
const inp: React.CSSProperties = { background: D.s1, border: `1px solid ${D.border2}`, borderRadius: 11, padding: '11px 13px', fontFamily: D.font, fontSize: 14, color: D.ink, outline: 'none', boxSizing: 'border-box' };
