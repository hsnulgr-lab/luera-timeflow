import { useEffect, useMemo, useState } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { useProducts } from '@/hooks/useProducts';
import { priceForReservation } from '@/lib/appointmentFlow';
import type { AdisyonItem } from '@/types';
import { D, STS, fmtNum, fmtTimer, HizmetKeyframes, SlideToStart } from './hizmetDesign';

const rid = () => Math.random().toString(36).slice(2, 9);

/**
 * Personel Hizmet Detayı — design_handoff_personel_hizmet birebir.
 * Akış: ready → (slide) → running → (pause) → paused → Kasaya Gönder → done.
 * "Bitti" (running) ve "Kasaya Gönder" (paused) → servis kapanır (completed,
 * ödenmedi) ve Kasa'daki "Bekleyen"e düşer; personel tahsilat almaz.
 */
export const MobileServiceDetail = ({ reservationId, onBack }: { reservationId: string; onBack: () => void }) => {
    const { reservations, settings, updateReservation } = useReservations();
    const { products } = useProducts();
    const [paused, setPaused] = useState(false);
    const [justFinished, setJustFinished] = useState(false);
    const [secs, setSecs] = useState(0);
    const [selProd, setSelProd] = useState('');
    const [exDesc, setExDesc] = useState('');
    const [exPrice, setExPrice] = useState('');
    const [itemBusy, setItemBusy] = useState(false);

    // Canlı kaynak — listeden id ile türetilir ki güncellemeler anında yansısın
    const r = reservations.find((x) => x.id === reservationId);

    const items: AdisyonItem[] = r?.adisyonItems || [];
    const basePrice = useMemo(() => (r ? priceForReservation(r, settings.services) : 0), [r, settings.services]);
    const total = basePrice + items.reduce((s, l) => s + l.price, 0);
    const color = r?.serviceColor || D.orange;

    // Faz türetimi
    const completed = r?.status === 'completed';
    const pending = r?.status === 'pending';
    const started = !!r?.arrivedAt && !completed && !pending;
    const phase: 'pending' | 'ready' | 'running' | 'paused' | 'done' =
        (justFinished || completed) ? 'done' : pending ? 'pending' : started ? (paused ? 'paused' : 'running') : 'ready';

    // Süre: arrivedAt'tan tohumla; çalışırken saniyelik artır
    useEffect(() => {
        if (r?.arrivedAt) setSecs(Math.max(0, Math.floor((Date.now() - new Date(r.arrivedAt).getTime()) / 1000)));
    }, [r?.arrivedAt]);
    useEffect(() => {
        if (phase !== 'running') return;
        const id = setInterval(() => setSecs((s) => s + 1), 1000);
        return () => clearInterval(id);
    }, [phase]);

    // Gerçek süre: bu oturumda bitirildiyse (justFinished) canlı sayaç; daha önce
    // bitmiş randevuda arrivedAt→serviceEndedAt. İkisi de yoksa süre gösterme.
    const hasDuration = (justFinished && !!r?.arrivedAt) || (!!r?.arrivedAt && !!r?.serviceEndedAt);
    const doneSecs = r?.arrivedAt && r?.serviceEndedAt
        ? Math.max(0, Math.floor((new Date(r.serviceEndedAt).getTime() - new Date(r.arrivedAt).getTime()) / 1000))
        : secs;

    if (!r) {
        return (
            <div style={shell}>
                <Nav onBack={onBack} />
                <div style={{ padding: 40, textAlign: 'center', color: D.muted }}>Randevu bulunamadı.</div>
            </div>
        );
    }

    // ── Eylemler ──
    const start = () => updateReservation(r.id, { arrivedAt: new Date().toISOString() });
    const finalize = () => { updateReservation(r.id, { status: 'completed', serviceEndedAt: new Date().toISOString() }); setJustFinished(true); };
    const setItems = async (next: AdisyonItem[]) => { setItemBusy(true); await updateReservation(r.id, { adisyonItems: next }); setItemBusy(false); };
    const addProd = () => {
        if (itemBusy) return;
        const p = products.find((x) => x.id === selProd);
        if (p) { setItems([...items, { id: rid(), name: p.name, price: p.price, kind: 'product' }]); setSelProd(''); }
    };
    const addExtra = () => {
        if (itemBusy) return;
        const price = Number(exPrice.replace(/[^\d]/g, ''));
        if (!exDesc.trim()) return;
        setItems([...items, { id: rid(), name: exDesc.trim(), price, kind: 'extra' }]);
        setExDesc(''); setExPrice('');
    };
    const delItem = (id: string) => setItems(items.filter((l) => l.id !== id));

    const isRunning = phase === 'running', isPaused = phase === 'paused';

    return (
        <div style={shell}>
            <HizmetKeyframes />

            {/* ══ DONE OVERLAY ══ */}
            {phase === 'done' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: D.overlay, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', animation: 'lz-fadeUp .35s both' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: STS.done.bg, border: `2px solid ${D.greenBorder}`, display: 'grid', placeItems: 'center', marginBottom: 22, boxShadow: '0 0 0 12px rgba(124,196,127,.05)' }}>
                        <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
                            <path d="M9 21l9 9 14-16" stroke={D.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="32" strokeDashoffset="32" style={{ animation: 'lz-checkDraw .6s .15s cubic-bezier(.2,.8,.2,1) forwards' }} />
                        </svg>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 8 }}>Hizmet Tamamlandı</div>
                    <div style={{ fontSize: 13.5, color: D.muted, lineHeight: 1.6, textAlign: 'center', marginBottom: 10 }}>{r.customerName} için hizmet kasaya gönderildi.</div>
                    <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-.05em', color: D.orange, fontFamily: D.mono, marginBottom: 28 }}>{fmtNum(total)} ₺</div>
                    <div style={{ width: '100%', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 18, overflow: 'hidden', marginBottom: 20 }}>
                        {[...(hasDuration ? [{ k: 'Süre', v: fmtTimer(doneSecs) }] : []), { k: 'Toplam', v: `${fmtNum(total)} ₺` }, { k: 'Ödeme', v: r.isPaid ? 'Ödendi' : 'Kasada bekliyor' }].map((row, i, a) => (
                            <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderBottom: i < a.length - 1 ? `1px solid ${D.border}` : 'none' }}>
                                <span style={{ fontSize: 12.5, color: D.muted, fontWeight: 600 }}>{row.k}</span>
                                <span style={{ fontSize: 13.5, fontWeight: 750, fontFamily: D.mono }}>{row.v}</span>
                            </div>
                        ))}
                    </div>
                    <button onClick={onBack} style={{ width: '100%', height: 54, borderRadius: 17, background: D.orange, color: '#fff', fontSize: 15, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 6px 24px rgba(255,90,31,.38)', letterSpacing: '-.01em' }}>Takvime Dön</button>
                </div>
            )}

            {/* ══ BODY ══ */}
            <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 124px)' }}>
                <Nav onBack={onBack} />

                {/* Müşteri header */}
                <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 58, height: 58, borderRadius: 19, flexShrink: 0, background: `linear-gradient(145deg,${color}25,${color}10)`, border: `1.5px solid ${color}40`, display: 'grid', placeItems: 'center', fontSize: 23, fontWeight: 900, color }}>{(r.customerName || '?')[0].toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 19, fontWeight: 860, letterSpacing: '-.028em', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                        <div style={{ fontSize: 12, color: D.muted, fontFamily: D.mono, letterSpacing: '-.01em' }}>{r.startTime}–{r.endTime} · {r.service}</div>
                    </div>
                </div>

                {/* Info rows */}
                <div style={{ margin: '0 20px', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 18, overflow: 'hidden' }}>
                    <InfoRow icon={<IconDoc />} lbl="İstenen hizmet" val={r.service} bb />
                    <InfoRow icon={<IconPhone />} lbl="Telefon" val={r.customerPhone || '—'} bb={!!r.notes} />
                    {r.notes && <InfoRow icon={<IconNote />} lbl="Not" val={r.notes} />}
                </div>

                {/* PENDING gate */}
                {phase === 'pending' && (
                    <div style={{ margin: '22px 20px 0', animation: 'lz-fadeUp .3s both' }}>
                        <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.55, textAlign: 'center', marginBottom: 16 }}>Bu randevu henüz onaylanmadı. Hizmete başlamak için önce onaylayın.</div>
                    </div>
                )}

                {/* READY empty state */}
                {phase === 'ready' && (
                    <div style={{ margin: '22px 20px 0', textAlign: 'center', padding: '24px 0 8px', animation: 'lz-fadeUp .3s both' }}>
                        <div style={{ width: 76, height: 76, borderRadius: 24, margin: '0 auto 18px', background: 'rgba(255,90,31,.10)', border: '1.5px solid rgba(255,90,31,.22)', display: 'grid', placeItems: 'center', boxShadow: '0 8px 30px rgba(255,90,31,.12)' }}>
                            <svg width="30" height="30" viewBox="0 0 28 28" fill="none"><path d="M6 4l16 10L6 24V4z" fill="rgba(255,90,31,.75)" stroke={D.orange} strokeWidth="1.5" strokeLinejoin="round" /></svg>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 820, letterSpacing: '-.025em', marginBottom: 7 }}>Hizmete hazır</div>
                        <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.55 }}>Başlat'a basınca süre işlemeye başlar.</div>
                    </div>
                )}

                {/* TIMER card */}
                {(isRunning || isPaused) && (
                    <div style={{ margin: '16px 20px 0', animation: 'lz-fadeUp .3s both' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderRadius: 17, background: isRunning ? 'rgba(255,90,31,.09)' : D.s2, border: `1.5px solid ${isRunning ? 'rgba(255,90,31,.26)' : D.border}`, transition: 'all .3s cubic-bezier(.2,.8,.2,1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12 }}>
                                    {isRunning && <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: D.orange, opacity: .4, animation: 'lz-ripple 1.4s infinite' }} />}
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isRunning ? D.orange : D.muted2, animation: isRunning ? 'lz-pulse 1.4s ease-in-out infinite' : 'none', position: 'relative', zIndex: 1 }} />
                                </div>
                                <span style={{ fontSize: 13.5, fontWeight: 720, color: isRunning ? D.orange : D.muted }}>{isRunning ? 'Hizmet sürüyor' : 'Süre durduruldu'}</span>
                            </div>
                            <div style={{ fontFamily: D.mono, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', color: isRunning ? D.ink : D.muted }}>{fmtTimer(secs)}</div>
                        </div>
                    </div>
                )}

                {/* ADISYON */}
                {(isRunning || isPaused) && (
                    <div style={{ padding: '20px 20px 0' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 11 }}>Adisyon</div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Item name={r.service} type="Hizmet" price={basePrice} />
                            {items.map((l, i) => (
                                <Item key={l.id} name={l.name} type={l.kind === 'product' ? 'Ürün' : 'Ekstra'} price={l.price} onDel={() => delItem(l.id)} delay={i * 0.05} />
                            ))}
                        </div>

                        {/* Ürün ekle */}
                        {products.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <Cap>Ürün ekle</Cap>
                                <div style={{ display: 'flex', alignItems: 'center', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 14, padding: '0 14px', gap: 8 }}>
                                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: .4 }}><rect x="2" y="2" width="12" height="12" rx="2" stroke={D.ink} strokeWidth="1.4" /><path d="M2 6h12M6 2v12" stroke={D.ink} strokeWidth="1.4" strokeLinecap="round" /></svg>
                                    <select value={selProd} onChange={(e) => setSelProd(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', color: selProd ? D.ink : D.muted2, fontSize: 13.5, fontFamily: D.font, fontWeight: 600, cursor: 'pointer', outline: 'none', height: 46 }}>
                                        <option value="" style={{ background: D.s2 }}>Üründen seç…</option>
                                        {products.map((p) => <option key={p.id} value={p.id} style={{ background: D.s2 }}>{p.name} — {fmtNum(p.price)} ₺</option>)}
                                    </select>
                                    <button onClick={addProd} disabled={itemBusy} aria-label="Ürün ekle" style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: selProd ? D.orange : D.s3, border: 'none', cursor: itemBusy ? 'not-allowed' : 'pointer', opacity: itemBusy ? .5 : 1, display: 'grid', placeItems: 'center', transition: 'background .15s' }}>
                                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke={selProd ? '#fff' : D.muted2} strokeWidth="1.9" strokeLinecap="round" /></svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Ekstra ekle */}
                        <div style={{ marginTop: 14 }}>
                            <Cap>Ekstra ekle (boya, ek işlem…)</Cap>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={exDesc} onChange={(e) => setExDesc(e.target.value)} placeholder="Açıklama" style={{ flex: 1, height: 46, borderRadius: 12, background: D.s1, border: `1px solid ${D.border}`, color: D.ink, fontFamily: D.font, fontSize: 13, padding: '0 12px', outline: 'none' }} />
                                <input value={exPrice} onChange={(e) => setExPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder="₺" inputMode="numeric" style={{ width: 68, height: 46, borderRadius: 12, background: D.s1, border: `1px solid ${D.border}`, color: D.ink, fontFamily: D.mono, fontSize: 14, padding: '0 10px', outline: 'none', textAlign: 'center' }} />
                                <button onClick={addExtra} disabled={itemBusy} aria-label="Ekstra ekle" style={{ width: 46, height: 46, borderRadius: 12, background: D.s2, border: `1px solid ${D.border}`, cursor: itemBusy ? 'not-allowed' : 'pointer', opacity: itemBusy ? .5 : 1, display: 'grid', placeItems: 'center', color: D.muted2, flexShrink: 0 }}>
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Toplam */}
                        <div style={{ marginTop: 22, paddingTop: 17, borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: 13, color: D.muted, fontWeight: 650 }}>Toplam</span>
                            <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-.05em', color: D.orange, fontFamily: D.mono }}>{fmtNum(total)} ₺</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ══ BOTTOM CTA ══ */}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px calc(env(safe-area-inset-bottom,0px) + 24px)', background: `linear-gradient(transparent,${D.bg} 32%)` }}>
                {phase === 'pending' && (
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => { updateReservation(r.id, { status: 'cancelled' }); onBack(); }} style={{ width: 90, height: 56, borderRadius: 16, background: D.s2, border: `1px solid ${D.border}`, color: D.red, fontSize: 14, fontWeight: 750, cursor: 'pointer' }}>Reddet</button>
                        <button onClick={() => updateReservation(r.id, { status: 'confirmed' })} style={ctaGreen}>Randevuyu Onayla</button>
                    </div>
                )}
                {phase === 'ready' && <SlideToStart onComplete={start} />}
                {isRunning && (
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setPaused(true)} style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, background: D.s2, border: `1px solid ${D.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: D.muted }}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="4" height="12" rx="1.5" fill="currentColor" /><rect x="9" y="1" width="4" height="12" rx="1.5" fill="currentColor" /></svg>
                        </button>
                        <button onClick={finalize} style={{ flex: 1, height: 56, borderRadius: 16, background: D.btnInkBg, color: '#F3EDE3', fontSize: 15.5, fontWeight: 800, border: `1.5px solid ${D.border2}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, letterSpacing: '-.01em' }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2" fill="#F3EDE3cc" /></svg>
                            Bitti
                        </button>
                    </div>
                )}
                {isPaused && (
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setPaused(false)} style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, background: 'rgba(255,90,31,.12)', border: '1.5px solid rgba(255,90,31,.25)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: D.orange }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 1.5l10 5.5-10 5.5V1.5z" fill="currentColor" /></svg>
                        </button>
                        <button onClick={finalize} style={ctaGreen}>Kasaya Gönder · {fmtNum(total)} ₺</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Düzen ──
const shell: React.CSSProperties = { position: 'relative', minHeight: '100dvh', background: D.bg, color: D.ink, fontFamily: D.font };
const ctaGreen: React.CSSProperties = { flex: 1, height: 56, borderRadius: 16, background: 'linear-gradient(145deg,#2E7C31,#1A5E1D)', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 6px 24px rgba(46,124,49,.38)', letterSpacing: '-.01em' };

function Nav({ onBack }: { onBack: () => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(env(safe-area-inset-top,0px) + 10px) 16px 10px', position: 'sticky', top: 0, zIndex: 10, background: D.overlay, backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderBottom: `1px solid ${D.border}` }}>
            <button onClick={onBack} aria-label="Geri" style={{ width: 36, height: 36, borderRadius: 11, background: D.s2, border: `1px solid ${D.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: D.muted, flexShrink: 0 }}>
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>Hizmet</div>
        </div>
    );
}

function InfoRow({ icon, lbl, val, bb }: { icon: React.ReactNode; lbl: string; val: string; bb?: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: bb ? `1px solid ${D.border}` : 'none' }}>
            <div style={{ flexShrink: 0, opacity: .7 }}>{icon}</div>
            <div style={{ flex: 1, fontSize: 12.5, color: D.muted, fontWeight: 600 }}>{lbl}</div>
            <div style={{ fontSize: 13.5, fontWeight: 720, letterSpacing: '-.01em', textAlign: 'right', maxWidth: '55%' }}>{val}</div>
        </div>
    );
}

function Item({ name, type, price, onDel, delay = 0 }: { name: string; type: string; price: number; onDel?: () => void; delay?: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', background: D.s1, border: `1px solid ${D.border}`, borderRadius: 15, padding: '12px 14px', animation: `lz-fadeUp .25s ${delay}s both` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 760, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                <div style={{ fontSize: 11, color: D.muted2, fontWeight: 650 }}>{type}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, fontFamily: D.mono, letterSpacing: '-.02em' }}>{fmtNum(price)} ₺</div>
                {onDel && (
                    <button onClick={onDel} aria-label="Sil" style={{ width: 28, height: 28, borderRadius: 9, background: STS.cancelled.bg, border: 'none', cursor: 'pointer', color: D.red, display: 'grid', placeItems: 'center' }}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
}

function Cap({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 10.5, color: D.muted2, fontWeight: 750, letterSpacing: '.09em', textTransform: 'uppercase', fontFamily: D.mono, marginBottom: 8 }}>{children}</div>;
}

const IconDoc = () => <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="2" y="1" width="14" height="16" rx="2" stroke={D.muted2} strokeWidth="1.4" /><path d="M5 6h8M5 9.5h5" stroke={D.muted2} strokeWidth="1.4" strokeLinecap="round" /></svg>;
const IconPhone = () => <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M3 4.5A1.5 1.5 0 014.5 3h1.2A1.5 1.5 0 017.2 4.5v.6a1.5 1.5 0 01-1.1 1.45L5.4 6.7A11 11 0 0011.3 12.5l.65-.7A1.5 1.5 0 0113.4 10.8h.6A1.5 1.5 0 0115 12.3v1.2A1.5 1.5 0 0113.5 15 13 13 0 013 4.5z" stroke={D.muted2} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const IconNote = () => <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M3 3h12v8l-3 4H3V3z" stroke={D.muted2} strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 7h6M6 10h4" stroke={D.muted2} strokeWidth="1.4" strokeLinecap="round" /></svg>;
