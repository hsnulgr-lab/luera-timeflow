import { useEffect, useMemo, useState } from 'react';
import { useTableReservations } from '@/hooks/useTableReservations';
import { useProducts } from '@/hooks/useProducts';
import { adisyonTotal, groupMenu, addMenuItem, addExtraItem, changeQty } from '@/utils/masaAdisyon';
import type { TableReservation, Product } from '@/types';
import { D, fmtNum, fmtTimer, HizmetKeyframes, SlideToStart } from './hizmetDesign';

/**
 * Garson masa detayı — design_handoff_restoran_personel birebir.
 * Akış: rezerve → (kaydır) → oturdu → "Adisyonu Kasaya Gönder" → onay ekranı → geri.
 * Hizmet (randevu) akışıyla aynı desen: gönderince status→completed ama
 * isPaid=false (garson tahsilat ALMAZ) — masa dashboard'da serbest kalır,
 * gerçek ödeme Kasa/yönetici tarafında (MobileAdisyonSheet/MasaPage) alınır.
 */
export const MobileMasaDetail = ({ reservation, tableName, onBack }: { reservation: TableReservation; tableName: string; onBack: () => void }) => {
    const { reservations, updateAdisyon, setStatus } = useTableReservations(reservation.date);
    const { products } = useProducts();

    const r = reservations.find((x) => x.id === reservation.id) || reservation;
    const items = r.adisyonItems || [];
    const total = adisyonTotal(items);
    const menu = useMemo(() => groupMenu(products), [products]);
    const [cat, setCat] = useState(menu[0]?.category || '');
    const activeCat = cat || menu[0]?.category || '';
    const catItems = menu.find((m) => m.category === activeCat)?.items || [];
    const [exName, setExName] = useState('');
    const [exPrice, setExPrice] = useState('');
    const [sent, setSent] = useState(false);

    const isBekliyor = r.status === 'reserved';
    const isOturdu = r.status === 'seated';
    const isDone = r.status === 'completed';

    // Canlı süre — masaya oturulduğu andan itibaren saniyelik sayaç
    const [secs, setSecs] = useState(() => (r.seatedAt ? Math.max(0, Math.floor((Date.now() - new Date(r.seatedAt).getTime()) / 1000)) : 0));
    useEffect(() => {
        if (r.seatedAt) setSecs(Math.max(0, Math.floor((Date.now() - new Date(r.seatedAt).getTime()) / 1000)));
    }, [r.id, r.seatedAt]);
    useEffect(() => {
        if (!isOturdu) return;
        const t = setInterval(() => setSecs((s) => s + 1), 1000);
        return () => clearInterval(t);
    }, [isOturdu]);

    const add = (p: Product) => updateAdisyon(r.id, (prev) => addMenuItem(prev, p));
    const qty = (id: string, d: number) => updateAdisyon(r.id, (prev) => changeQty(prev, id, d));
    const removeItem = (id: string) => updateAdisyon(r.id, (prev) => prev.filter((it) => it.id !== id));
    const addExtra = () => {
        const price = parseInt(exPrice || '0', 10) || 0;
        if (!exName.trim() || price <= 0) return;
        updateAdisyon(r.id, (prev) => addExtraItem(prev, exName.trim(), price));
        setExName(''); setExPrice('');
    };

    const [sending, setSending] = useState(false);
    const handleSend = async () => {
        setSending(true);
        const ok = await setStatus(r.id, 'completed', false);
        setSending(false);
        if (!ok) return; // toast zaten setStatus içinde gösterildi — garson tekrar deneyebilir
        setSent(true);
        setTimeout(() => { setSent(false); onBack(); }, 1300);
    };

    return (
        <div style={shell}>
            <HizmetKeyframes />

            {/* ══ GÖNDERİLDİ ONAYI ══ */}
            {sent && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: D.overlay, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', animation: 'lz-fadeUp .3s both' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(46,124,49,.10)', border: `2px solid ${D.greenBorder}`, display: 'grid', placeItems: 'center', marginBottom: 22 }}>
                        <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
                            <path d="M9 21l9 9 14-16" stroke={D.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="32" strokeDashoffset="32" style={{ animation: 'lz-checkDraw .6s .15s cubic-bezier(.2,.8,.2,1) forwards' }} />
                        </svg>
                    </div>
                    <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 8 }}>Kasaya İletildi</div>
                    <div style={{ fontSize: 13.5, color: D.muted, lineHeight: 1.6, textAlign: 'center', marginBottom: 26 }}>{tableName} hesabı kasada kapatılmak üzere bildirildi.</div>
                    <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-.05em', color: D.orange, fontFamily: D.mono }}>{fmtNum(total)} ₺</div>
                </div>
            )}

            {/* ══ BODY ══ */}
            <div style={{ paddingBottom: isBekliyor || isOturdu ? 'calc(env(safe-area-inset-bottom,0px) + 124px)' : 'calc(env(safe-area-inset-bottom,0px) + 28px)' }}>
                <Nav onBack={onBack} tableName={tableName} r={r} isOturdu={isOturdu} secs={secs} />

                {isBekliyor && (
                    <>
                        <div style={{ margin: '18px 20px 0', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 18, overflow: 'hidden' }}>
                            <InfoRow lbl="Müşteri" val={r.customerName} bb />
                            <InfoRow lbl="Kişi Sayısı" val={`${r.partySize} kişi`} bb />
                            <InfoRow lbl="Saat" val={r.startTime} bb />
                            <InfoRow lbl="Telefon" val={r.customerPhone || '—'} />
                        </div>
                        <div style={{ margin: '26px 20px 0', textAlign: 'center', padding: '20px 0 6px', animation: 'lz-fadeUp .3s both' }}>
                            <div style={{ width: 76, height: 76, borderRadius: 24, margin: '0 auto 18px', background: 'rgba(255,90,31,.08)', border: '1.5px solid rgba(255,90,31,.24)', display: 'grid', placeItems: 'center' }}>
                                <svg width="30" height="30" viewBox="0 0 28 28" fill="none"><path d="M4 8h20M4 14h20M4 20h14" stroke={D.orange} strokeWidth="2" strokeLinecap="round" /></svg>
                            </div>
                            <div style={{ fontSize: 17, fontWeight: 820, letterSpacing: '-.025em', marginBottom: 7 }}>Masaya oturmaya hazır</div>
                            <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.55 }}>Misafirler geldiğinde kaydırarak masaya oturtun.</div>
                        </div>
                    </>
                )}

                {!isBekliyor && (
                    <>
                        {isOturdu && (
                            <div style={{ margin: '16px 20px 0', animation: 'lz-fadeUp .3s both' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderRadius: 17, background: 'rgba(255,90,31,.07)', border: '1.5px solid rgba(255,90,31,.28)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12 }}>
                                            <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: D.orange, opacity: .4, animation: 'lz-ripple 1.4s infinite' }} />
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: D.orange, animation: 'lz-pulse 1.4s ease-in-out infinite', position: 'relative', zIndex: 1 }} />
                                        </div>
                                        <span style={{ fontSize: 13.5, fontWeight: 720, color: D.orange }}>Masa dolu</span>
                                    </div>
                                    <div style={{ fontFamily: D.mono, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{fmtTimer(secs)}</div>
                                </div>
                            </div>
                        )}

                        {isDone && (
                            <div style={{ margin: '16px 20px 0', padding: '12px 16px', borderRadius: 14, background: r.isPaid === false ? 'rgba(184,122,0,.08)' : 'rgba(46,124,49,.08)', border: `1px solid ${r.isPaid === false ? D.amber + '40' : D.greenBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-8.5" stroke={r.isPaid === false ? D.amber : D.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: r.isPaid === false ? D.amber : D.green }}>{r.isPaid === false ? 'Kasaya gönderildi · ödeme bekleniyor' : 'Masa kasada kapatıldı'}</span>
                            </div>
                        )}

                        {/* ADISYON */}
                        <div style={{ padding: '20px 20px 0' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 11 }}>Adisyon</div>
                            {items.length === 0 ? (
                                <div style={{ textAlign: 'center', color: D.muted2, fontSize: 12.5, padding: '18px 0', background: D.s1, border: `1px dashed ${D.border2}`, borderRadius: 15 }}>Adisyon boş — menüden ürün ekleyin</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {items.map((item, i) => (
                                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 15, padding: '11px 12px', animation: `lz-fadeUp .22s ${i * .04}s both` }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13.5, fontWeight: 760, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                                <div style={{ fontSize: 11, color: D.muted2, fontWeight: 650 }}>{fmtNum(item.price)} ₺ {item.kind === 'extra' ? '· ekstra' : ''}</div>
                                            </div>
                                            {!isDone && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 10, flexShrink: 0 }}>
                                                    <button onClick={() => qty(item.id, -1)} style={qtyBtn}>−</button>
                                                    <span style={{ fontSize: 13.5, fontWeight: 800, minWidth: 14, textAlign: 'center' }}>{item.qty}</span>
                                                    <button onClick={() => qty(item.id, 1)} style={qtyBtn}>+</button>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: D.mono, letterSpacing: '-.02em' }}>{fmtNum(item.price * item.qty)} ₺</div>
                                                {!isDone && (
                                                    <button aria-label="Kalemi sil" onClick={() => removeItem(item.id)} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(192,57,43,.10)', border: 'none', cursor: 'pointer', color: D.red, display: 'grid', placeItems: 'center' }}>
                                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {!isDone && (
                            <>
                                {/* MENÜ */}
                                <div style={{ padding: '20px 20px 0' }}>
                                    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 11 }}>Menü</div>
                                    {menu.length === 0 ? (
                                        <div style={{ fontSize: 12.5, color: D.muted }}>Menü boş — yönetici Kasa &gt; Ürünler'den ekleyebilir.</div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', marginBottom: 12 }}>
                                                {menu.map((m) => (
                                                    <button key={m.category} onClick={() => setCat(m.category)} style={{ padding: '7px 13px', borderRadius: 999, background: activeCat === m.category ? D.orange : D.s1, color: activeCat === m.category ? '#fff' : D.muted, fontSize: 12, fontWeight: 750, border: `1px solid ${activeCat === m.category ? D.orange : D.border}`, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: D.font }}>{m.category}</button>
                                                ))}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                {catItems.map((p) => (
                                                    <button key={p.id} onClick={() => add(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 12px', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 12, cursor: 'pointer', color: D.ink, textAlign: 'left', fontFamily: D.font }}>
                                                        <span style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                                        <span style={{ fontSize: 12, fontWeight: 750, color: D.orange, fontFamily: D.mono, flexShrink: 0, marginLeft: 6 }}>₺{fmtNum(p.price)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* SERBEST KALEM */}
                                <div style={{ padding: '16px 20px 0' }}>
                                    <div style={{ fontSize: 10.5, color: D.muted2, fontWeight: 750, letterSpacing: '.09em', textTransform: 'uppercase', fontFamily: D.mono, marginBottom: 8 }}>Serbest kalem</div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input value={exName} onChange={(e) => setExName(e.target.value)} placeholder="Serbest kalem" style={{ flex: 1, height: 46, borderRadius: 12, background: D.s1, border: `1px solid ${D.border}`, color: D.ink, fontFamily: D.font, fontSize: 13, padding: '0 12px', outline: 'none' }} />
                                        <input value={exPrice} onChange={(e) => setExPrice(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="₺" style={{ width: 68, height: 46, borderRadius: 12, background: D.s1, border: `1px solid ${D.border}`, color: D.ink, fontFamily: D.mono, fontSize: 14, padding: '0 10px', outline: 'none', textAlign: 'center' }} />
                                        <button onClick={addExtra} style={{ width: 46, height: 46, borderRadius: 12, background: D.s2, border: `1px solid ${D.border}`, cursor: 'pointer', display: 'grid', placeItems: 'center', color: D.muted2, flexShrink: 0 }}>
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* TOPLAM */}
                        <div style={{ padding: '22px 20px 0' }}>
                            <div style={{ paddingTop: 17, borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontSize: 13, color: D.muted, fontWeight: 650 }}>Toplam</span>
                                <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-.05em', color: D.orange, fontFamily: D.mono }}>{fmtNum(total)} ₺</span>
                            </div>
                            {isDone && <div style={{ textAlign: 'right', fontSize: 11.5, color: D.muted, marginTop: 4 }}>Hesap kasada kapatıldı</div>}
                        </div>
                    </>
                )}
            </div>

            {/* ══ ALT SABİT CTA ══ */}
            {(isBekliyor || isOturdu || isDone) && (
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px calc(env(safe-area-inset-bottom,0px) + 24px)', background: `linear-gradient(transparent,${D.bg} 32%)` }}>
                    {isBekliyor && <SlideToStart label="Masaya Otur" onComplete={() => setStatus(r.id, 'seated')} />}
                    {isOturdu && (
                        <>
                            <button disabled={items.length === 0 || sending} onClick={handleSend} style={ctaGreen(items.length === 0 || sending)}>
                                {sending ? 'Gönderiliyor…' : `Adisyonu Kasaya Gönder${items.length ? ` · ${fmtNum(total)} ₺` : ''}`}
                            </button>
                            <div style={{ textAlign: 'center', fontSize: 11, color: D.muted, marginTop: 9 }}>Ödeme kasada alınır</div>
                        </>
                    )}
                    {isDone && (
                        <button onClick={onBack} style={{ width: '100%', height: 54, borderRadius: 17, background: D.orange, color: '#fff', fontSize: 15, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 6px 24px rgba(255,90,31,.32)', letterSpacing: '-.01em' }}>
                            Masalarıma Dön
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Düzen ──
const shell: React.CSSProperties = { position: 'relative', minHeight: '100dvh', background: D.bg, color: D.ink, fontFamily: D.font };
const qtyBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, background: D.s2, border: `1px solid ${D.border}`, cursor: 'pointer', color: D.ink, fontSize: 15, fontWeight: 700, display: 'grid', placeItems: 'center' };
const ctaGreen = (disabled: boolean): React.CSSProperties => ({
    width: '100%', height: 56, borderRadius: 16,
    background: disabled ? D.s3 : 'linear-gradient(145deg,#2E7C31,#1A5E1D)',
    color: disabled ? D.muted2 : '#fff',
    fontSize: 15, fontWeight: 800, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : '0 6px 24px rgba(46,124,49,.34)',
    letterSpacing: '-.01em',
});

function Nav({ onBack, tableName, r, isOturdu, secs }: { onBack: () => void; tableName: string; r: TableReservation; isOturdu: boolean; secs: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(env(safe-area-inset-top,0px) + 10px) 16px 10px', position: 'sticky', top: 0, zIndex: 10, background: D.overlay, backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderBottom: `1px solid ${D.border}` }}>
            <button onClick={onBack} aria-label="Geri" style={{ width: 36, height: 36, borderRadius: 11, background: D.s2, border: `1px solid ${D.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: D.muted, flexShrink: 0 }}>
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>{tableName}</div>
                <div style={{ fontSize: 11, color: D.muted, fontFamily: D.mono, marginTop: 1 }}>
                    {r.customerName} · {r.partySize} kişi · {r.startTime}{isOturdu ? ` · ⏱ ${fmtTimer(secs)}` : ''}
                </div>
            </div>
        </div>
    );
}

function InfoRow({ lbl, val, bb }: { lbl: string; val: string; bb?: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: bb ? `1px solid ${D.border}` : 'none' }}>
            <div style={{ flex: 1, fontSize: 12.5, color: D.muted, fontWeight: 600 }}>{lbl}</div>
            <div style={{ fontSize: 13.5, fontWeight: 720, letterSpacing: '-.01em' }}>{val}</div>
        </div>
    );
}
