/**
 * A3 · Hizmetler.
 *
 * Tablo yalnız beş sütun taşır (renk · ad · ücret · süre · dönüş); reçete,
 * uygunluk ve ayrıntılar sağdan açılan panelde. Eski satır altı "Uygunluk"
 * şeridi kalktı.
 *
 * Boş ücret "₺0" yazılmaz: satırda "Ücret yok" rozeti, tablonun üstünde tek
 * uyarı — Kasa'da ₺0 açılır ve hızlı listede görünmez.
 *
 * Panel kendi taslağını tutar; kaydet çubuğu panelin dibine oturur. Kayıt
 * bütün listeyi `updateSettings` ile yazar (diff-upsert, kimlikler korunur).
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { recipeUnsaved, useReservations } from '@/hooks/useReservations';
import { useProducts } from '@/hooks/useProducts';
import { eligibilityTagsFor } from '@/lib/serviceEligibility';
import { formatTRY } from '@/lib/plans';
import type { Service, ServiceRecipeLine } from '@/types';
import { SERVICE_SWATCHES, recipeChangeSummary } from '../ayarlarModel';
import { useTaslak } from '../useTaslak';
import { Head, I, Modal, SaveBar } from '../parcalar';


interface Draft {
    name: string;
    color: string;
    price: string;
    duration: number;
    recallDays: string;
    recipe: ServiceRecipeLine[];
    tags: string[];
}

const toDraft = (s: Service): Draft => ({
    name: s.name,
    color: s.color,
    price: s.price ? String(s.price) : '',
    duration: s.duration || 30,
    recallDays: s.recallDays ? String(s.recallDays) : '',
    recipe: s.recipe ?? [],
    tags: s.tags ?? [],
});

export function Hizmetler() {
    const { settings, updateSettings } = useReservations();
    const [open, setOpen] = useState<{ id: string; isNew: boolean } | null>(null);
    const [menu, setMenu] = useState<string | null>(null);
    const [toDelete, setToDelete] = useState<Service | null>(null);
    const [deleting, setDeleting] = useState(false);

    const services = settings.services.filter((s) => s.id);
    const noPrice = services.filter((s) => s.name.trim() && !(s.price ?? 0)).length;

    const newService = (): Service => ({
        id: `svc-${Date.now()}`, name: '', duration: 30,
        color: SERVICE_SWATCHES[services.length % SERVICE_SWATCHES.length],
    });
    const [fresh, setFresh] = useState<Service | null>(null);
    const target = open ? (open.isNew ? fresh : services.find((s) => s.id === open.id) ?? null) : null;

    const remove = async (s: Service) => {
        setDeleting(true);
        const ok = await updateSettings({ ...settings, services: settings.services.filter((x) => x.id !== s.id) });
        setDeleting(false);
        if (ok) { setToDelete(null); setOpen(null); toast.success(`“${s.name || 'Hizmet'}” silindi`); }
    };

    return (
        <>
            <div className="ay-col w860">
                <div className="ay-head-row">
                    <Head title="Hizmetler" lead="Takvimde, Kasa'da ve online randevu sayfasında seçilen hizmetler." />
                    <button type="button" className="ay-btn-pri" onClick={() => { const s = newService(); setFresh(s); setOpen({ id: s.id, isNew: true }); }}>
                        <I n="plus" />Hizmet ekle
                    </button>
                </div>

                {noPrice > 0 && (
                    <div role="status" className="ay-box warn" style={{ marginBottom: 18 }}>
                        <I n="alert" />{noPrice} hizmetin ücreti yok — Kasa'da ₺0 açılır ve hızlı listede görünmez.
                    </div>
                )}

                {services.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, padding: '32px 0', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)' }}>
                        <span style={{ fontSize: 18, fontWeight: 800 }}>Henüz hizmet yok.</span>
                        <span className="ay-help" style={{ fontSize: 15 }}>İlk hizmetinizi ekleyin; randevu alırken ve Kasa'da buradan seçilir.</span>
                    </div>
                ) : (
                    <div role="table" aria-label="Hizmetler" id="ay-hizmet-tablo" className="ay-table">
                        <div role="row" className="ay-th ay-svc">
                            <span /><span>Ad</span><span className="r">Ücret</span><span className="r">Süre</span><span className="r dn-col">Dönüş</span><span />
                        </div>
                        {services.map((s) => {
                            const sel = open?.id === s.id;
                            return (
                                <div role="row" key={s.id} aria-selected={sel || undefined} className="ay-tr ay-svc click"
                                    onClick={() => { setMenu(null); setOpen({ id: s.id, isNew: false }); }}>
                                    <span className="sw" style={{ background: s.color }} />
                                    <span className="nm">{s.name || 'Adsız hizmet'}</span>
                                    {(s.price ?? 0) > 0
                                        ? <span className="r pr">₺{formatTRY(s.price!)}</span>
                                        : <span style={{ display: 'flex', justifyContent: 'flex-end' }}><span className="ay-nopr">Ücret yok</span></span>}
                                    <span className="r mt">{s.duration} dk</span>
                                    <span className={`r mt dn-col${s.recallDays ? '' : ' none'}`}>{s.recallDays ? `${s.recallDays} gün` : '—'}</span>
                                    {sel ? <span /> : (
                                        <span style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                            <button type="button" className="ay-icon-btn sm" aria-label="Satır menüsü" aria-haspopup="menu" aria-expanded={menu === s.id}
                                                onClick={() => setMenu((m) => (m === s.id ? null : s.id))}><I n="dots" /></button>
                                            {menu === s.id && (
                                                <SatirMenusu onClose={() => setMenu(null)}
                                                    onEdit={() => { setMenu(null); setOpen({ id: s.id, isNew: false }); }}
                                                    onDelete={() => { setMenu(null); setToDelete(s); }} />
                                            )}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20, fontSize: 14, lineHeight: 1.5, color: 'var(--tx2)', maxWidth: 700 }}>
                    <span><b style={{ color: 'var(--tx)' }}>Ücret</b> — Kasa'da hizmet seçilince gelen tutar; adisyonda değiştirilebilir.</span>
                    <span><b style={{ color: 'var(--tx)' }}>Süre</b> — takvimde kapladığı zaman.</span>
                    <span><b style={{ color: 'var(--tx)' }}>Dönüş</b> — seans bitince kaç gün sonrasına hatırlatma kurulacağı; boş = kapalı.</span>
                </div>
            </div>

            {target && open && (
                <HizmetPaneli key={target.id} service={target} isNew={open.isNew}
                    onClose={() => setOpen(null)} onDelete={() => setToDelete(target)} />
            )}

            {toDelete && (
                <Modal labelledBy="ay-hsil" small alert onClose={() => { if (!deleting) setToDelete(null); }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 28px 20px' }}>
                        <h2 id="ay-hsil" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>“{toDelete.name || 'Hizmet'}” silinsin mi?</h2>
                        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)' }}>
                            Hizmet listeden kalkar; geçmiş randevular ve tahsilatlar silinmez.
                        </p>
                    </div>
                    <div className="ay-modal-f">
                        <button type="button" className="ay-btn" autoFocus disabled={deleting} onClick={() => setToDelete(null)}>Vazgeç</button>
                        <button type="button" className="ay-btn-danger" disabled={deleting} onClick={() => void remove(toDelete)}>
                            {deleting ? 'Siliniyor…' : 'Hizmeti sil'}
                        </button>
                    </div>
                </Modal>
            )}
        </>
    );
}

function SatirMenusu({ onEdit, onDelete, onClose }: { onEdit: () => void; onDelete: () => void; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('mousedown', close);
        window.addEventListener('keydown', esc);
        return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
    }, [onClose]);
    return (
        <div ref={ref} role="menu" style={{ position: 'absolute', right: 0, top: 40, zIndex: 20, width: 170, background: 'var(--card)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: 'var(--sh)', padding: 6, display: 'flex', flexDirection: 'column' }}>
            <button type="button" role="menuitem" className="ay-po" onClick={onEdit}>Düzenle</button>
            <button type="button" role="menuitem" className="ay-po" style={{ color: 'var(--rdt)' }} onClick={onDelete}>Sil…</button>
        </div>
    );
}

/** Reçeteye eklenecek stok ürünü — yalnız reçetede olmayanlar listelenir. */
function UrunSecici({ products, onPick, onClose }: {
    products: { id: string; name: string; unit?: string }[]; onPick: (id: string) => void; onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const close = (e: MouseEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('mousedown', close);
        window.addEventListener('keydown', esc, true);
        return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc, true); };
    }, [onClose]);
    return (
        <div ref={ref} role="listbox" aria-label="Stok ürünleri" style={{ position: 'absolute', left: 0, top: 42, zIndex: 20, width: 280, maxHeight: 280, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: 'var(--sh)', padding: 6, display: 'flex', flexDirection: 'column' }}>
            {products.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={false} className="ay-po" onClick={() => onPick(p.id)}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx)' }}>{p.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--tx2)', flex: 'none' }}>{p.unit || 'adet'}</span>
                </button>
            ))}
        </div>
    );
}

function HizmetPaneli({ service, isNew, onClose, onDelete }: {
    service: Service; isNew: boolean; onClose: () => void; onDelete: () => void;
}) {
    const navigate = useNavigate();
    const { settings, updateSettings } = useReservations();
    const { products } = useProducts();
    const stockProducts = products.filter((p) => p.tracksStock !== false);
    const tagOptions = eligibilityTagsFor(settings.sector);
    const [askClose, setAskClose] = useState(false);

    const t = useTaslak<Draft>({
        saved: toDraft(service),
        sectionLabel: 'Hizmetler',
        labels: { name: 'Ad', color: 'Renk', price: 'Ücret', duration: 'Süre', recallDays: 'Dönüş', recipe: 'Reçete', tags: 'Uygunluk etiketleri' },
        validate: (d) => (!d.name.trim() ? 'Hizmetin adı boş olamaz.'
            : d.duration < 5 ? 'Süre en az 5 dakika.'
                : d.recipe.some((l) => !(l.quantity > 0)) ? 'Reçetede miktarı boş satır var.' : null),
        save: async (d) => {
            const next: Service = {
                ...service,
                name: d.name.trim(),
                color: d.color,
                price: d.price ? Math.max(0, Number(d.price.replace(',', '.'))) || undefined : undefined,
                duration: d.duration,
                recallDays: d.recallDays ? Math.max(1, parseInt(d.recallDays, 10)) || undefined : undefined,
                recipe: d.recipe.filter((l) => l.productId && l.quantity > 0),
                tags: d.tags,
            };
            const list = isNew ? [...settings.services, next] : settings.services.map((s) => (s.id === service.id ? next : s));
            const ok = await updateSettings({ ...settings, services: list });
            if (ok && recipeUnsaved() && next.recipe && next.recipe.length > 0) {
                toast.warning('Reçete şu an kaydedilemiyor', { description: 'Hizmetin diğer bilgileri kaydedildi.' });
            }
            if (ok && isNew) window.setTimeout(onClose, 600);
            return ok;
        },
    });
    const d = t.draft;
    const isCustom = !SERVICE_SWATCHES.includes(d.color.toUpperCase()) && !SERVICE_SWATCHES.includes(d.color);
    const unitOf = (id: string) => products.find((p) => p.id === id)?.unit || 'adet';
    const nameOf = (id: string) => products.find((p) => p.id === id)?.name;
    const usedIds = new Set(d.recipe.map((l) => l.productId));
    const addable = stockProducts.filter((p) => !usedIds.has(p.id));
    const [picking, setPicking] = useState(false);
    const savedQty = new Map((service.recipe ?? []).map((l) => [l.productId, l.quantity]));
    const lineChanged = (l: ServiceRecipeLine) => savedQty.get(l.productId) !== l.quantity;
    const addLine = (productId: string) => {
        setPicking(false);
        t.set({ recipe: [...d.recipe, { productId, quantity: 1 }] });
        // Yeni satırın miktarına geç — tasarımdaki gibi miktar hemen yazılır.
        window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-recipe-qty="${productId}"]`)?.select(), 0);
    };
    // Yalnız reçete değiştiyse çubuk satırı sayar (tasarım A3: "Reçete · 1 satır eklendi").
    const summary = t.changedKeys.length === 1 && t.changedKeys[0] === 'recipe'
        ? `Reçete · ${recipeChangeSummary(service.recipe ?? [], d.recipe) || 'değişti'}`
        : t.summary;

    const tryClose = () => { if (t.dirty) setAskClose(true); else onClose(); };

    return (
        <div role="dialog" aria-label={d.name || 'Yeni hizmet'} className="ay-panel">
            <div className="ay-panel-h">
                <div><small>{isNew ? 'Yeni hizmet' : 'Hizmet'}</small><strong>{d.name || (isNew ? 'Adsız hizmet' : service.name)}</strong></div>
                <button type="button" className="ay-icon-btn" aria-label="Paneli kapat" onClick={tryClose}><I n="x" size={20} /></button>
            </div>
            <div className="ay-panel-b">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="ay-lbl sm" htmlFor="ay-h-ad">Ad</label>
                    <input id="ay-h-ad" className="ay-input sm" value={d.name} autoFocus={isNew} placeholder="ör. Cilt bakımı"
                        onChange={(e) => t.set({ name: e.target.value })} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className="ay-lbl sm">Renk</span>
                    <span className="ay-help sm">Takvimde randevunun rengi.</span>
                    <div role="radiogroup" aria-label="Renk" className="ay-swatches">
                        {SERVICE_SWATCHES.map((c) => (
                            <button key={c} type="button" role="radio" aria-checked={d.color.toUpperCase() === c} aria-label={c}
                                className="ay-swatch" style={{ background: c }} onClick={() => t.set({ color: c })} />
                        ))}
                        <label className="ay-swatch-custom" role="radio" aria-checked={isCustom}>
                            {isCustom && <i style={{ background: d.color }} />}Özel
                            <input type="color" value={d.color.length === 7 ? d.color : '#888888'} aria-label="Özel renk"
                                onChange={(e) => t.set({ color: e.target.value })} />
                        </label>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label className="ay-lbl sm" htmlFor="ay-h-ucret">Ücret</label>
                        <div className="ay-affix sm">
                            <span className="pre">₺</span>
                            <input id="ay-h-ucret" inputMode="decimal" value={d.price} placeholder="—"
                                onChange={(e) => t.set({ price: e.target.value.replace(/[^\d.,]/g, '') })} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span className="ay-lbl sm">Süre</span>
                        <div className="ay-stepper sm">
                            <button type="button" aria-label="5 dakika azalt" disabled={d.duration <= 5} onClick={() => t.set({ duration: Math.max(5, d.duration - 5) })}><I n="minus" /></button>
                            <span>{d.duration} dk</span>
                            <button type="button" aria-label="5 dakika artır" onClick={() => t.set({ duration: d.duration + 5 })}><I n="plus" /></button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label className="ay-lbl sm" htmlFor="ay-h-donus">Dönüş</label>
                        <div className="ay-affix sm">
                            <input id="ay-h-donus" inputMode="numeric" value={d.recallDays} placeholder="—"
                                onChange={(e) => t.set({ recallDays: e.target.value.replace(/\D/g, '') })} />
                            <span className="suf">gün</span>
                        </div>
                    </div>
                </div>
                <span className="ay-help sm" style={{ marginTop: -12, lineHeight: 1.5 }}>
                    Ücret boşsa “Ücret yok” olur, ₺0 değil. Süre 5'er dakika. Dönüş: seans bitince kaç gün sonrasına hatırlatma kurulsun; boş = kapalı.
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20, borderTop: '1px solid var(--bd)' }}>
                    <span style={{ fontSize: 17, fontWeight: 800 }}>Reçete</span>
                    <span className="ay-help" style={{ lineHeight: 1.5 }}>Bu hizmette tüketilen sarf. İşlem kasaya gönderilince stoktan düşer; personel o müşteri için düzeltebilir.</span>
                    {stockProducts.length === 0 ? (
                        <span className="ay-help">Önce <a href="/stock" onClick={(e) => { e.preventDefault(); navigate('/stock'); }} style={{ fontWeight: 700 }}>Stoklar</a>'dan ürün ekleyin — reçete oradaki ürünlerden kurulur.</span>
                    ) : (
                        <>
                            {d.recipe.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {d.recipe.map((line, i) => (
                                        <div key={line.productId} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 72px 60px 32px', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--bd)' }}>
                                            {lineChanged(line) && <span aria-hidden="true" className="ay-changed" style={{ left: -14, top: 10, bottom: 10 }} />}
                                            <span style={{ fontSize: 15, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: nameOf(line.productId) ? undefined : 'var(--tx2)' }}>
                                                {nameOf(line.productId) ?? 'Stoklarda bulunamayan ürün'}
                                            </span>
                                            <input aria-label={`${nameOf(line.productId) ?? 'Ürün'} miktarı`} data-recipe-qty={line.productId} inputMode="decimal" className="ay-input"
                                                style={{ height: 38, borderRadius: 10, textAlign: 'center', padding: 0, fontSize: 15, fontWeight: 700 }}
                                                value={line.quantity || ''} placeholder="0" aria-invalid={!(line.quantity > 0) || undefined}
                                                onChange={(e) => t.set({ recipe: d.recipe.map((l, j) => (j === i ? { ...l, quantity: Math.max(0, parseFloat(e.target.value.replace(',', '.')) || 0) } : l)) })} />
                                            <span className="ay-help">{unitOf(line.productId)}</span>
                                            <button type="button" className="ay-icon-btn sm" aria-label={`${nameOf(line.productId) ?? 'Satırı'} reçeteden çıkar`} style={{ width: 32, height: 32 }}
                                                onClick={() => t.set({ recipe: d.recipe.filter((_, j) => j !== i) })}><I n="trash" size={17} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {addable.length > 0 && (
                                <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
                                    <button type="button" className="ay-btn-ghost" aria-haspopup="listbox" aria-expanded={picking}
                                        style={{ padding: '0 4px', height: 38, color: 'var(--tx)', fontSize: 14.5 }}
                                        onClick={() => setPicking((v) => !v)}>
                                        <I n="plus" />Stoklar'dan ürün ekle
                                    </button>
                                    {picking && <UrunSecici products={addable} onPick={addLine} onClose={() => setPicking(false)} />}
                                </div>
                            )}
                            <span className="ay-help sm" style={{ fontSize: 13 }}>Yalnız stok takipli ürünler listelenir.</span>
                        </>
                    )}
                </div>

                {tagOptions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20, borderTop: '1px solid var(--bd)' }}>
                        <span style={{ fontSize: 17, fontWeight: 800 }}>Uygunluk etiketleri</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {tagOptions.map((tag) => {
                                const on = d.tags.includes(tag);
                                return (
                                    <button key={tag} type="button" role="checkbox" aria-checked={on} className="ay-pill"
                                        onClick={() => t.set({ tags: on ? d.tags.filter((x) => x !== tag) : [...d.tags, tag] })}>
                                        {on && <I n="check" />}{tag}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="ay-help" style={{ lineHeight: 1.5 }}>Müşterinin sağlık bilgisiyle çakışan işlem seçilemez. Etiketsiz hizmette kural yalnız hizmet adına bakar.</span>
                    </div>
                )}

                {!isNew && (
                    <button type="button" className="ay-btn-ghost danger" style={{ alignSelf: 'flex-start', height: 40, fontSize: 14.5 }} onClick={onDelete}>
                        <I n="trash" />Hizmeti sil…
                    </button>
                )}
            </div>
            <SaveBar inPanel state={t.state} summary={summary} error={t.error} onSave={() => void t.save()} onDiscard={() => { t.discard(); if (isNew) onClose(); }} />

            {askClose && (
                <Modal labelledBy="ay-hkap" small alert onClose={() => setAskClose(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 28px 20px' }}>
                        <h2 id="ay-hkap" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Değişiklikler kaydedilmedi</h2>
                        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)' }}>{t.summary || 'Bu hizmette kaydedilmemiş değişiklik var'}. Paneli kapatmadan ne yapalım?</p>
                    </div>
                    <div className="ay-modal-f">
                        <button type="button" className="ay-btn" autoFocus onClick={() => setAskClose(false)}>Kal</button>
                        <button type="button" className="ay-btn-danger" onClick={() => { t.discard(); setAskClose(false); onClose(); }}>Değişiklikleri at</button>
                        <button type="button" className="ay-btn-pri" onClick={async () => { setAskClose(false); if (await t.save()) onClose(); }}>Kaydet ve kapat</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
