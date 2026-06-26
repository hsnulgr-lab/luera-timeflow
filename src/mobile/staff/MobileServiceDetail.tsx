import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, Plus, Trash2, Check, Package, Phone, StickyNote } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useProducts } from '@/hooks/useProducts';
import { priceForReservation } from '@/lib/appointmentFlow';
import type { AdisyonItem } from '@/types';
import { T, avatarColor } from '../theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const rid = () => Math.random().toString(36).slice(2, 9);

// Geçen süreyi HH:MM:SS / MM:SS olarak biçimle
function elapsed(fromISO: string, toISO?: string): string {
    const from = new Date(fromISO).getTime();
    const to = toISO ? new Date(toISO).getTime() : Date.now();
    const s = Math.max(0, Math.floor((to - from) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

type Step = 'pending' | 'idle' | 'active' | 'review' | 'done';

/**
 * Personel Hizmet Detayı — randevu kartından açılır, 4 aşamalı akış:
 *  1) Başladı   → süreyi başlatır (arrivedAt)
 *  2) Canlı adisyon → ekstra boya/ürün/işlem anında eklenir (kalıcı)
 *  3) Bitti     → süreyi durdurur (serviceEndedAt), adisyon kontrol ekranı
 *  4) Kasaya Gönder → tahsilata yönlendirir (TahsilatSheet)
 */
export const MobileServiceDetail = ({ reservationId, onBack }: { reservationId: string; onBack: () => void }) => {
    const { reservations, settings, updateReservation } = useReservations();
    const { products } = useProducts();
    const [extraName, setExtraName] = useState('');
    const [extraPrice, setExtraPrice] = useState('');
    const [, forceTick] = useState(0);

    // Canlı kaynak — listeden id ile türetilir ki güncellemeler anında yansısın
    const r = reservations.find((x) => x.id === reservationId);

    const items: AdisyonItem[] = r?.adisyonItems || [];
    const basePrice = useMemo(() => (r ? priceForReservation(r, settings.services) : 0), [r, settings.services]);
    const total = basePrice + items.reduce((s, l) => s + l.price, 0);
    const color = r?.serviceColor || avatarColor(r?.customerName || '?');

    const step: Step = useMemo(() => {
        if (!r) return 'idle';
        if (r.status === 'completed') return 'done';
        if (r.status === 'pending') return 'pending';
        if (r.serviceEndedAt) return 'review';
        if (r.arrivedAt) return 'active';
        return 'idle';
    }, [r]);

    // Aktif hizmette saniyelik tik — süre canlı görünsün
    const tick = useRef<ReturnType<typeof setInterval>>();
    useEffect(() => {
        if (step === 'active') {
            tick.current = setInterval(() => forceTick((n) => n + 1), 1000);
            return () => clearInterval(tick.current);
        }
    }, [step]);

    if (!r) {
        return (
            <div style={shell}>
                <Header onBack={onBack} title="Randevu" />
                <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Randevu bulunamadı.</div>
            </div>
        );
    }

    // ── Eylemler ──
    const start = () => updateReservation(r.id, { arrivedAt: new Date().toISOString() });
    const finish = () => updateReservation(r.id, { serviceEndedAt: new Date().toISOString() });
    // Tahsilat personelde değil — adisyon kasaya bırakılır (tamamlandı, ödenmedi).
    // Kasadaki kişi "Kasada Bekleyen" listesinden tahsil eder.
    const sendToKasa = () => { updateReservation(r.id, { status: 'completed' }); onBack(); };
    const setItems = (next: AdisyonItem[]) => updateReservation(r.id, { adisyonItems: next });
    const addProduct = (id: string) => {
        const p = products.find((x) => x.id === id);
        if (p) setItems([...items, { id: rid(), name: p.name, price: p.price, kind: 'product' }]);
    };
    const addExtra = () => {
        const price = Number(extraPrice.replace(/[^\d]/g, ''));
        if (!extraName.trim()) return;
        setItems([...items, { id: rid(), name: extraName.trim(), price, kind: 'extra' }]);
        setExtraName(''); setExtraPrice('');
    };
    const delItem = (id: string) => setItems(items.filter((l) => l.id !== id));

    return (
        <div style={shell}>
            <Header onBack={onBack} title="Hizmet" />

            {/* Müşteri başlığı */}
            <div style={{ padding: '6px 22px 0', display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 50, height: 50, borderRadius: 16, background: color, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 900, color: '#0E0E0E', flexShrink: 0 }}>
                    {(r.customerName || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.035em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName}</div>
                    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{r.startTime}–{r.endTime} · {r.service}</div>
                </div>
            </div>

            {/* İstenen / iletişim / not */}
            <div style={{ padding: '14px 22px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InfoRow icon={<Package size={15} />} label="İstenen hizmet" value={r.service} />
                {r.customerPhone && <InfoRow icon={<Phone size={15} />} label="Telefon" value={r.customerPhone} />}
                {r.notes && <InfoRow icon={<StickyNote size={15} />} label="Not" value={r.notes} />}
            </div>

            {/* Süre/durum şeridi */}
            {(step === 'active' || step === 'review' || step === 'done') && r.arrivedAt && (
                <div style={{ padding: '16px 22px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: step === 'active' ? 'rgba(255,90,31,.08)' : T.surface, border: `1px solid ${step === 'active' ? 'rgba(255,90,31,.25)' : T.border}`, borderRadius: 16, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: step === 'active' ? T.orange : T.muted2 }} />
                            <span style={{ fontSize: 13, fontWeight: 750, color: step === 'active' ? T.orange : T.muted }}>
                                {step === 'active' ? 'Hizmet sürüyor' : step === 'review' ? 'Süre durduruldu' : 'Tamamlandı'}
                            </span>
                        </div>
                        <span style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: T.ink }}>
                            {elapsed(r.arrivedAt, r.serviceEndedAt)}
                        </span>
                    </div>
                </div>
            )}

            {/* ── Adım içerikleri ── */}
            <div style={{ padding: '18px 22px 0', flex: 1 }}>
                {step === 'pending' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, margin: 0 }}>Bu randevu henüz onaylanmadı. Hizmete başlamak için önce onaylayın.</p>
                        <button onClick={() => updateReservation(r.id, { status: 'confirmed' })} style={primaryBtn(T.green, '#0a2e16')}><Check size={18} strokeWidth={2.6} /> Randevuyu Onayla</button>
                        <button onClick={() => { updateReservation(r.id, { status: 'cancelled' }); onBack(); }} style={{ ...primaryBtn(T.surface2, T.red), boxShadow: 'none', border: `1px solid ${T.border}` }}>Reddet</button>
                    </div>
                )}

                {step === 'idle' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 18 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,90,31,.12)', display: 'grid', placeItems: 'center', color: T.orange }}>
                            <Play size={28} strokeWidth={2.4} fill={T.orange} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>Hizmete hazır</div>
                            <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Başlat'a basınca süre işlemeye başlar.</div>
                        </div>
                        <button onClick={start} style={{ ...primaryBtn(T.orange, '#0E0E0E'), marginTop: 4 }}><Play size={18} strokeWidth={2.6} fill="#0E0E0E" /> Hizmete Başla</button>
                    </div>
                )}

                {(step === 'active' || step === 'review') && (
                    <>
                        <div style={{ fontSize: 14, fontWeight: 850, letterSpacing: '-0.02em', marginBottom: 11 }}>Adisyon</div>

                        {/* Kalemler */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                            <Line label={r.service} sub="Hizmet" amount={basePrice} />
                            {items.map((l) => (
                                <Line key={l.id} label={l.name} sub={l.kind === 'product' ? 'Ürün' : 'Ekstra'} amount={l.price} onDel={() => delItem(l.id)} />
                            ))}
                        </div>

                        {/* Ürün ekle */}
                        {products.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                                <label style={lbl}>Ürün ekle</label>
                                <select value="" onChange={(e) => { if (e.target.value) addProduct(e.target.value); }} style={{ ...input, width: '100%' }}>
                                    <option value="">Üründen seç…</option>
                                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} ₺</option>)}
                                </select>
                            </div>
                        )}

                        {/* Ekstra (serbest) */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={lbl}>Ekstra ekle (boya, ek işlem…)</label>
                            <div style={{ display: 'flex', gap: 7 }}>
                                <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="Açıklama" style={{ ...input, flex: 2 }} />
                                <input value={extraPrice} onChange={(e) => setExtraPrice(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="₺" style={{ ...input, flex: 1, minWidth: 0 }} />
                                <button onClick={addExtra} disabled={!extraName.trim()} style={{ width: 44, flexShrink: 0, borderRadius: 11, background: extraName.trim() ? T.orange : T.surface3, color: extraName.trim() ? '#0E0E0E' : T.muted2, border: 'none', display: 'grid', placeItems: 'center', cursor: extraName.trim() ? 'pointer' : 'not-allowed' }}><Plus size={18} strokeWidth={2.6} /></button>
                            </div>
                        </div>

                        {/* Toplam */}
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>Toplam</span>
                            <span style={{ fontSize: 27, fontWeight: 900, letterSpacing: '-0.03em', color: T.orange }}>{fmt(total)} <span style={{ fontSize: 15 }}>₺</span></span>
                        </div>
                    </>
                )}

                {step === 'done' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', paddingTop: 10 }}>
                        <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--lt-green-bg,rgba(124,196,127,.14))', display: 'grid', placeItems: 'center', color: T.green }}><Check size={30} strokeWidth={2.6} /></div>
                        <div style={{ fontSize: 17, fontWeight: 850 }}>Servis kapandı</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 999, background: r.isPaid ? 'var(--lt-green-bg,rgba(124,196,127,.14))' : 'var(--lt-red-bg,rgba(224,112,112,.12))', color: r.isPaid ? T.green : T.red }}>{r.isPaid ? 'Ödendi' : 'Ödenmedi'}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: T.surface2, color: T.muted, fontFamily: T.mono }}>{fmt(total)} ₺</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Sabit alt aksiyon */}
            {step === 'active' && (
                <Footer><button onClick={finish} style={primaryBtn(T.ink, T.bg)}><Square size={16} strokeWidth={2.6} fill={T.bg} /> Bitti</button></Footer>
            )}
            {step === 'review' && (
                <Footer><button onClick={sendToKasa} style={primaryBtn(T.green, '#0a2e16')}>Kasaya Gönder · {fmt(total)} ₺</button></Footer>
            )}
            {step === 'done' && (
                <Footer><button onClick={onBack} style={{ ...primaryBtn(T.surface2, T.ink), boxShadow: 'none', border: `1px solid ${T.border}` }}>Kapat</button></Footer>
            )}
        </div>
    );
};

// ── Düzen yardımcıları ──
const shell: React.CSSProperties = { minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: T.bg, color: T.ink, fontFamily: T.font, paddingTop: 'calc(env(safe-area-inset-top,0px))', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 90px)' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 6 };
const input: React.CSSProperties = { padding: '11px 12px', borderRadius: 11, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 14, fontFamily: T.font, outline: 'none' };

function primaryBtn(bg: string, fg: string): React.CSSProperties {
    return { width: '100%', height: 54, borderRadius: 16, border: 'none', background: bg, color: fg, fontSize: 15.5, fontWeight: 850, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', boxShadow: '0 8px 22px rgba(0,0,0,0.18)' };
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
    return (
        <div style={{ padding: '12px 18px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onBack} aria-label="Geri" style={{ width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.ink, cursor: 'pointer', flexShrink: 0 }}><ArrowLeft size={18} /></button>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</span>
        </div>
    );
}

function Footer({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 22px calc(env(safe-area-inset-bottom,0px) + 14px)', background: `linear-gradient(transparent, ${T.bg} 22%)` }}>{children}</div>
    );
}

function Line({ label, sub, amount, onDel }: { label: string; sub: string; amount: number; onDel?: () => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 12, background: T.surface, border: `1px solid ${T.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{fmt(amount)} ₺</span>
            {onDel && <button onClick={onDel} aria-label="Sil" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted2, padding: 2 }}><Trash2 size={16} /></button>}
        </div>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 12, background: T.surface, border: `1px solid ${T.border}` }}>
            <span style={{ color: T.muted2, display: 'flex', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 11.5, color: T.muted, fontWeight: 700, flexShrink: 0, minWidth: 92 }}>{label}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, marginLeft: 'auto', textAlign: 'right' }}>{value}</span>
        </div>
    );
}
