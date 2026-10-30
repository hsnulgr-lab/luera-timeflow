import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, History, Pencil, RefreshCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { useProducts } from '@/hooks/useProducts';
import { useStock } from '@/hooks/useStock';
import {
    IDLE_DAYS, STATUS_RANK, consumptionCost, fillPercent, isIdle, lastMovementAt,
    marginOf, monthBounds, quantityMap, statusOf, stockTotals, valueOf, type StockStatus,
} from '@/lib/stock';
import { toISODate } from '@/utils/date';
import type { Product, ProductKind, StockMovement, StockMovementType } from '@/types';
import { localDay, presetRange, type RangePreset } from '@/lib/kasaDefteri';
import '@/components/kasa/kasaDefteri.css';
import './stockPage.css';

// ── Stok (Salon deposu) ──────────────────────────────────────────────────────
// Tasarım: Claude Design "Stok Sayfası" — düzen, sıra ve metinler birebir.
// Veri gerçek: ürünler products, miktar stock_movements toplamı (074). Miktar
// hiçbir yerde saklanmaz; sayfanın kendisi de yazmaz — her düzeltme bir hareket
// satırıdır (giriş / çıkış / fire / sayım), böylece geçmiş her zaman okunur.

const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const fmtNum = (n: number) => Number(n.toFixed(2)).toLocaleString('tr-TR');
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function dayLabel(iso: string, now: Date): string {
    const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'bugün';
    if (days === 1) return 'dün';
    if (days < 7) return `${days} gün önce`;
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const MOVE_TR: Record<StockMovementType, string> = {
    in: 'Giriş', sale: 'Satış', usage: 'Tüketim', waste: 'Fire', count: 'Sayım',
};
const MOVE_TONE: Record<StockMovementType, string> = {
    in: 'green', sale: 'blue', usage: 'mute', waste: 'red', count: 'amber',
};

interface StatusMeta { label: string; tone: string; color: string }
const STATUS_META: Record<StockStatus, StatusMeta> = {
    out: { label: 'Tükendi', tone: 'red', color: 'var(--dc-red)' },
    neg: { label: 'Sayım gerekli', tone: 'red', color: 'var(--dc-red)' },
    low: { label: 'Kritik', tone: 'orange', color: 'var(--dc-orange)' },
    ok: { label: 'Yeterli', tone: 'green', color: 'var(--dc-green)' },
    off: { label: 'Takip kapalı', tone: 'mute', color: 'transparent' },
};

type FilterKey = 'all' | 'out' | 'low' | 'ok' | 'retail' | 'consumable' | 'idle' | 'count' | 'nocost';
type SortKey = 'crit' | 'name' | 'qty' | 'value';
type ActionKey = 'in' | 'out' | 'waste' | 'count';

const VIEW_GROUPS: { title: string; items: [FilterKey, string][] }[] = [
    { title: 'DURUM', items: [['all', 'Tümü'], ['out', 'Tükendi'], ['low', 'Kritik seviye'], ['ok', 'Yeterli']] },
    { title: 'TÜR', items: [['retail', 'Satılık'], ['consumable', 'Sarf malzemesi']] },
    { title: 'DİKKAT', items: [['idle', `Hareketsiz (${IDLE_DAYS}+ gün)`], ['count', 'Sayım gerekli'], ['nocost', 'Maliyeti girilmemiş']] },
];

const ACTIONS: [ActionKey, string][] = [['in', 'Stok girişi'], ['out', 'Çıkış'], ['waste', 'Fire'], ['count', 'Sayım']];
const ACTION_TITLES: Record<ActionKey, string> = {
    in: 'STOK GİRİŞİ', out: 'ÇIKIŞ', waste: 'FİRE', count: 'SAYIM DÜZELTMESİ',
};
const ACTION_HINTS: Record<ActionKey, string> = {
    in: 'Depoya giren miktar. Tedarikçi faturasını nota yazmanız sonradan aramayı kolaylaştırır.',
    out: 'İşlemde tüketilen miktar. Kasa satışları buraya elle girilmez; satış anında kendi düşer.',
    waste: 'Dökülen, bozulan veya kullanılamaz hâle gelen miktar.',
    count: 'Rafta saydığınız gerçek miktarı yazın. Aradaki fark düzeltme hareketi olarak işlenir.',
};

interface Draft {
    name: string; kind: ProductKind; unit: string; category: string;
    cost: string; price: string; threshold: string; par: string; tracks: boolean;
    /** Yalnız eklemede: ürünle birlikte yazılan ilk giriş hareketi. */
    opening: string;
}
const EMPTY_DRAFT: Draft = {
    name: '', kind: 'retail', unit: 'adet', category: '',
    cost: '', price: '', threshold: '', par: '', tracks: true, opening: '',
};
const num = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const draftFrom = (p: Product): Draft => ({
    name: p.name,
    kind: (p.kind || 'retail') as ProductKind,
    unit: p.unit || 'adet',
    category: p.category || '',
    cost: String(p.cost || 0),
    price: String(p.price || 0),
    threshold: String(p.threshold || 0),
    par: String(p.parLevel || 0),
    tracks: p.tracksStock !== false,
    opening: '',
});

export function StockPage() {
    const { dark } = useTheme();
    const { products, addProduct, updateProduct } = useProducts();
    const { movements, isAvailable, addMovement } = useStock();

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [sort, setSort] = useState<SortKey>('crit');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [action, setAction] = useState<ActionKey | null>(null);
    const [formQty, setFormQty] = useState('');
    const [formNote, setFormNote] = useState('');
    // false = kapalı, true = tüm ürünler, string = o ürüne süzülmüş açılır
    const [ledgerOpen, setLedgerOpen] = useState<boolean | string>(false);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [editing, setEditing] = useState(false);
    const [edit, setEdit] = useState<Draft>(EMPTY_DRAFT);
    const [saving, setSaving] = useState(false);

    const now = useMemo(() => new Date(), []);
    const qty = useMemo(() => quantityMap(movements), [movements]);
    const qtyOf = (p: Product) => qty[p.id] || 0;

    const matches = (p: Product, key: FilterKey): boolean => {
        const s = statusOf(p, qtyOf(p));
        switch (key) {
            case 'all': return true;
            case 'out': return s === 'out' || s === 'neg';
            case 'low': return s === 'low';
            case 'ok': return s === 'ok';
            case 'retail': return (p.kind || 'retail') === 'retail';
            case 'consumable': return p.kind === 'consumable';
            case 'idle': return isIdle(p.id, movements, now);
            case 'count': return s === 'neg';
            case 'nocost': return !p.cost;
            default: return true;
        }
    };

    const rows = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr');
        let list = products.filter((p) => matches(p, filter));
        if (q) list = list.filter((p) => `${p.name} ${p.category || ''}`.toLocaleLowerCase('tr').includes(q));
        return list.slice().sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name, 'tr');
            if (sort === 'qty') return qtyOf(a) - qtyOf(b);
            if (sort === 'value') return valueOf(b, qtyOf(b)) - valueOf(a, qtyOf(a));
            return STATUS_RANK[statusOf(a, qtyOf(a))] - STATUS_RANK[statusOf(b, qtyOf(b))]
                || a.name.localeCompare(b.name, 'tr');
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products, movements, query, filter, sort, now]);

    const totals = useMemo(() => stockTotals(products, movements, now), [products, movements, now]);
    const spend = useMemo(() => {
        const { current, previous } = monthBounds(now);
        return {
            current: consumptionCost(products, movements, current.from, current.to),
            previous: consumptionCost(products, movements, previous.from, previous.to),
        };
    }, [products, movements, now]);

    const selected = products.find((p) => p.id === selectedId) || null;
    const categories = useMemo(() => [...new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr')), [products]);
    const history = useMemo(
        () => (selected ? movements.filter((m) => m.productId === selected.id).slice(0, 40) : []),
        [movements, selected],
    );

    const lastMoveText = (p: Product): string => {
        const last = lastMovementAt(p.id, movements);
        if (!last) return 'hiç hareket yok';
        const days = Math.floor((now.getTime() - new Date(last).getTime()) / 86_400_000);
        if (days >= IDLE_DAYS) return `${days} gündür hareket yok`;
        const move = movements.find((m) => m.productId === p.id && m.createdAt === last);
        if (!move) return dayLabel(last, now);
        const dir = move.delta > 0 ? 'giriş' : 'çıkış';
        return `${dayLabel(last, now)} · ${fmtNum(Math.abs(move.delta))} ${p.unit || 'adet'} ${dir}`;
    };

    const unitCostText = (p: Product): string => {
        if (!p.cost) return 'maliyet yok';
        const unit = p.unit || 'adet';
        // "100 birim başına" yalnız küçük ölçülerde anlamlı (ml, gr); bidon/kutu
        // gibi birimde ₺45.000/100bidon yazıyordu (2026-10-31).
        return unit === 'ml' || unit === 'gr' ? `${fmtTL(p.cost * 100)}/100 ${unit}` : `${fmtTL(p.cost)}/${unit}`;
    };

    const openAction = (p: Product, key: ActionKey) => {
        setSelectedId(p.id);
        setAction(key);
        setEditing(false);
        setFormQty('');
        setFormNote('');
    };

    const saveMovement = async () => {
        if (!selected || !action) return;
        const entered = num(formQty);
        if (!entered && action !== 'count') { toast.error('Miktar girin'); return; }
        const current = qtyOf(selected);
        const delta = action === 'in' ? entered : action === 'count' ? entered - current : -entered;
        if (!delta) { toast.message('Sayım mevcut miktarla aynı — hareket yazılmadı'); setAction(null); return; }
        const type: StockMovementType = action === 'in' ? 'in' : action === 'out' ? 'usage' : action === 'waste' ? 'waste' : 'count';
        setSaving(true);
        const saved = await addMovement({
            productId: selected.id,
            type,
            delta,
            note: formNote.trim() || (action === 'in' ? 'Elle stok girişi' : 'Elle kayıt'),
        });
        setSaving(false);
        if (!saved) return;
        toast.success(`${MOVE_TR[type]} kaydedildi · ${delta > 0 ? '+' : ''}${fmtNum(delta)} ${selected.unit || 'adet'}`);
        setAction(null);
        setFormQty('');
        setFormNote('');
    };

    const createProduct = async () => {
        if (!draft.name.trim()) { toast.error('Ürün adı girin'); return; }
        setSaving(true);
        const created = await addProduct(draft.name.trim(), num(draft.price), draft.category.trim() || undefined, {
            kind: draft.kind,
            unit: draft.unit.trim() || 'adet',
            cost: num(draft.cost),
            threshold: num(draft.threshold),
            parLevel: num(draft.par),
            tracksStock: draft.tracks,
        });
        if (!created) { setSaving(false); return; }
        // Açılış stoğu ürünle birlikte yazılır — eskiden ürün eklendikten sonra
        // ayrıca "Stok girişi" açmak gerekiyordu (2026-10-31).
        const opening = num(draft.opening);
        if (opening > 0 && draft.tracks) {
            await addMovement({ productId: created.id, type: 'in', delta: opening, note: 'Açılış stoğu' });
        }
        setSaving(false);
        toast.success('Ürün eklendi', {
            description: opening > 0 && draft.tracks ? `Açılış stoğu ${fmtNum(opening)} ${draft.unit || 'adet'} yazıldı.` : undefined,
        });
        setCreating(false);
        setDraft(EMPTY_DRAFT);
        setSelectedId(created.id);
    };

    const saveEdit = async () => {
        if (!selected) return;
        if (!edit.name.trim()) { toast.error('Ürün adı boş olamaz'); return; }
        setSaving(true);
        const ok = await updateProduct(selected.id, {
            name: edit.name.trim(),
            price: num(edit.price),
            category: edit.category.trim() || undefined,
            kind: edit.kind,
            unit: edit.unit.trim() || 'adet',
            cost: num(edit.cost),
            threshold: num(edit.threshold),
            parLevel: num(edit.par),
            tracksStock: edit.tracks,
        });
        setSaving(false);
        if (ok) { toast.success('Ürün güncellendi'); setEditing(false); }
    };

    const bar = (p: Product, q: number, s: StockStatus) => ({
        width: `${s === 'off' ? 0 : Math.max(fillPercent(p, q), q > 0 ? 4 : 0)}%`,
        background: s === 'ok' ? 'var(--dc-green)' : s === 'low' ? 'var(--dc-orange)' : 'var(--dc-red)',
    });

    const selQty = selected ? qtyOf(selected) : 0;
    const selStatus = selected ? statusOf(selected, selQty) : 'ok';
    const selMargin = selected ? marginOf(selected) : null;
    const spendTrend = spend.previous > 0
        ? Math.round(((spend.current - spend.previous) / spend.previous) * 100)
        : null;

    return (
        <div className={`stk dash-theme${dark ? ' dark' : ''}`}>
            <div className="stk-in">

                <header className="stk-head">
                    <div className="stk-head-copy">
                        <i className="stk-rail-mark" />
                        <span className="stk-eyebrow"><i />SALON DEPOSU</span>
                        <h1>Stok,<em> raftaki ve tezgâhtaki mal</em><b>.</b></h1>
                        <p>Miktar hareketlerden hesaplanır. Sipariş bekleyenleri sabah görün, gün içinde girişi tek yerden yapın.</p>
                    </div>
                    <div className="stk-head-actions">
                        <button className="stk-btn" onClick={() => setLedgerOpen(true)}>Hareket geçmişi</button>
                        <button className="stk-btn primary" onClick={() => { setDraft(EMPTY_DRAFT); setCreating(true); }}>Ürün ekle</button>
                    </div>
                </header>

                {!isAvailable && (
                    <div className="stk-warn">
                        Stok defteri tablosu bulunamadı — <code>supabase/074_stock.sql</code> uygulanana kadar
                        miktarlar boş görünür ve hareket kaydedilemez.
                    </div>
                )}

                <div className="stk-kpis">
                    <button
                        className={`stk-kpi clickable${totals.orderNeeded > 0 ? ' urgent' : ''}`}
                        onClick={() => setFilter(totals.outCount > 0 ? 'out' : 'low')}
                    >
                        <div className="stk-kpi-top"><span className="stk-kpi-label">Sipariş bekleyen</span></div>
                        <span className="stk-kpi-value">{totals.orderNeeded}</span>
                        <span className="stk-kpi-sub">{totals.outCount} tükendi · {totals.lowCount} kritik</span>
                    </button>
                    <div className="stk-kpi">
                        <div className="stk-kpi-top"><span className="stk-kpi-label">Stok değeri</span></div>
                        <span className="stk-kpi-value">{fmtTL(totals.totalValue)}</span>
                        <span className="stk-kpi-sub">maliyet üzerinden</span>
                        <span className="stk-kpi-cmp">Satılık rafın payı: <b>{fmtTL(totals.retailValue)}</b></span>
                    </div>
                    <div className="stk-kpi">
                        <div className="stk-kpi-top">
                            <span className="stk-kpi-label">Bu ay tüketim</span>
                            {spendTrend !== null && (
                                <span
                                    className="stk-trend"
                                    style={spendTrend > 0
                                        ? { background: 'var(--dc-red-bg)', color: 'var(--dc-red2)' }
                                        : { background: 'var(--dc-green-bg)', color: 'var(--dc-green)' }}
                                >
                                    {spendTrend > 0 ? '↑' : '↓'} %{Math.abs(spendTrend)}
                                </span>
                            )}
                        </div>
                        <span className="stk-kpi-value">{fmtTL(spend.current)}</span>
                        <span className="stk-kpi-sub">boya, oksidan ve sarf</span>
                        <span className="stk-kpi-cmp">Geçen ay: <b>{fmtTL(spend.previous)}</b></span>
                    </div>
                    <button className="stk-kpi clickable" onClick={() => setFilter('idle')}>
                        <div className="stk-kpi-top"><span className="stk-kpi-label">Hareketsiz ürün</span></div>
                        <span className="stk-kpi-value">{totals.idleCount}</span>
                        <span className="stk-kpi-sub">{IDLE_DAYS} gündür hareket yok</span>
                    </button>
                </div>

                <div className="stk-work">

                    <aside className="stk-panel stk-views">
                        <div className="stk-views-title">AKILLI GÖRÜNÜMLER</div>
                        {VIEW_GROUPS.map((group) => (
                            <div key={group.title} className="stk-view-group">
                                <span>{group.title}</span>
                                <div className="stk-view-items">
                                    {group.items.map(([key, label]) => {
                                        const count = products.filter((p) => matches(p, key)).length;
                                        const on = filter === key;
                                        const pill = key === 'out' ? ' red' : key === 'low' ? ' orange' : '';
                                        return (
                                            <button
                                                key={key}
                                                className={`stk-view${on ? ' on' : ''}`}
                                                aria-pressed={on}
                                                onClick={() => setFilter(key)}
                                            >
                                                <span>{label}</span>
                                                <span className={`stk-view-pill${on ? '' : pill}`}>{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        <div className="stk-note">Miktar hiçbir yerde saklanmaz; her zaman hareketlerin toplamıdır.</div>
                    </aside>

                    <section className="stk-panel stk-list">
                        <div className="stk-list-bar">
                            <div className="stk-search">
                                <Search size={14} />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Ürün adı veya kategori ara…"
                                    aria-label="Ürün ara"
                                />
                                {query && (
                                    <button onClick={() => setQuery('')} aria-label="Aramayı temizle"><X size={13} /></button>
                                )}
                            </div>
                            <label className="stk-sort">
                                SIRALA
                                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Listeyi sırala">
                                    <option value="crit">Kritiklik</option>
                                    <option value="name">İsim</option>
                                    <option value="qty">Miktar</option>
                                    <option value="value">Değer</option>
                                </select>
                            </label>
                        </div>

                        <div className="stk-cols">
                            <span>ÜRÜN</span><span>STOK DURUMU</span><span>SON HAREKET</span>
                            <span className="right">DEĞER</span><span className="right">DURUM</span>
                        </div>

                        <div className="stk-rows">
                            {rows.map((p) => {
                                const q = qtyOf(p);
                                const s = statusOf(p, q);
                                const meta = STATUS_META[s];
                                const unit = p.unit || 'adet';
                                return (
                                    <button
                                        key={p.id}
                                        className={`stk-row${selectedId === p.id ? ' sel' : ''}${s === 'off' ? ' off' : ''}`}
                                        onClick={() => { setSelectedId(p.id); setAction(null); setEditing(false); }}
                                    >
                                        <i className="stk-row-rail" style={{ background: s === 'ok' || s === 'off' ? 'transparent' : meta.color }} />
                                        <div className="stk-row-name">
                                            <span className="stk-avatar">{p.name.charAt(0).toLocaleUpperCase('tr')}</span>
                                            <div style={{ minWidth: 0 }}>
                                                <div className="stk-row-title">{p.name}</div>
                                                <div className="stk-row-meta">
                                                    {(p.kind || 'retail') === 'retail' ? 'Satılık' : 'Sarf'} · {unit}
                                                    {p.category ? ` · ${p.category}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className={`stk-qty${s === 'out' || s === 'neg' ? ' bad' : s === 'off' ? ' mute' : ''}`}>
                                                {s === 'off'
                                                    ? 'takip kapalı'
                                                    : `${fmtNum(q)}${p.parLevel ? `/${fmtNum(p.parLevel)}` : ''} ${unit}`}
                                            </div>
                                            <div className="stk-bar"><i style={bar(p, q, s)} /></div>
                                        </div>
                                        <div className="stk-last">{lastMoveText(p)}</div>
                                        <div className="stk-value">
                                            <b>{q > 0 && p.cost ? fmtTL(valueOf(p, q)) : '—'}</b>
                                            <span>{unitCostText(p)}</span>
                                        </div>
                                        <div className="stk-row-end">
                                            <span className={`stk-badge ${meta.tone}`}>{meta.label}</span>
                                            <span
                                                className="stk-link"
                                                role="button"
                                                tabIndex={-1}
                                                onClick={(e) => { e.stopPropagation(); openAction(p, 'in'); }}
                                            >
                                                Stok girişi ›
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {rows.length === 0 && (
                            <div className="stk-empty">
                                <b>{products.length === 0 ? 'Henüz ürün yok' : 'Bu görünümde ürün yok'}</b>
                                <p>
                                    {products.length === 0
                                        ? 'Depodaki ilk ürünü ekleyin; açılış stoğunu stok girişiyle yazarsınız.'
                                        : 'Seçili filtre ve aramaya uyan ürün bulunmuyor.'}
                                </p>
                                {products.length === 0
                                    ? <button className="stk-btn sm primary" onClick={() => { setDraft(EMPTY_DRAFT); setCreating(true); }}>Ürün ekle</button>
                                    : <button className="stk-btn sm" onClick={() => { setFilter('all'); setQuery(''); }}>Filtreleri sıfırla</button>}
                            </div>
                        )}

                        <div className="stk-foot">
                            <span>{rows.length} ürün görünüyor · toplam {products.length}</span>
                            <span>{movements.length} hareket</span>
                        </div>
                    </section>

                    <aside className="stk-panel stk-detail">
                        {!selected && (
                            <div className="stk-empty" style={{ minHeight: 360 }}>
                                <b>Ürün seçin</b>
                                <p>Detay, hareket geçmişi ve stok girişi için soldan bir ürün açın.</p>
                            </div>
                        )}
                        {selected && (
                            <div>
                                <div className="stk-detail-head">
                                    <div style={{ minWidth: 0 }}>
                                        <div className="stk-kicker">SEÇİLİ ÜRÜN</div>
                                        <div className="stk-detail-name">{selected.name}</div>
                                        <div className="stk-detail-meta">
                                            {(selected.kind || 'retail') === 'retail' ? 'Satılık' : 'Sarf malzemesi'}
                                            {selected.category ? ` · ${selected.category}` : ''} · birim {selected.unit || 'adet'}
                                        </div>
                                    </div>
                                    <button
                                        className="stk-icon-btn"
                                        aria-label="Ürünü düzenle"
                                        onClick={() => { setEdit(draftFrom(selected)); setEditing(true); setAction(null); }}
                                    >
                                        <Pencil size={15} />
                                    </button>
                                </div>

                                <div className="stk-detail-qty">
                                    <div className="stk-detail-qty-top">
                                        <span className={`stk-big${selStatus === 'out' || selStatus === 'neg' ? ' bad' : ''}`} aria-live="polite">
                                            {fmtNum(selQty)}
                                        </span>
                                        <span className="stk-unit">{selected.unit || 'adet'}</span>
                                        <span style={{ marginLeft: 'auto' }}>
                                            <span className={`stk-badge ${STATUS_META[selStatus].tone}`}>{STATUS_META[selStatus].label}</span>
                                        </span>
                                    </div>
                                    <div className="stk-bar"><i style={bar(selected, selQty, selStatus)} /></div>
                                    <div className="stk-threshold">
                                        {selected.tracksStock === false
                                            ? 'takip kapalı · uyarı üretmez'
                                            : (selected.threshold || 0) > 0
                                                ? `kritik eşik: ${fmtNum(selected.threshold || 0)} ${selected.unit || 'adet'}${selected.parLevel ? ` · hedef ${fmtNum(selected.parLevel)} ${selected.unit || 'adet'}` : ''}`
                                                : 'kritik eşik girilmemiş · uyarı üretmez'}
                                    </div>
                                </div>

                                <dl className="stk-facts">
                                    <div>
                                        <dt>BİRİM MALİYET</dt>
                                        <dd>{selected.cost ? unitCostText(selected) : '—'}</dd>
                                    </div>
                                    <div>
                                        <dt>TOPLAM DEĞER</dt>
                                        <dd>{fmtTL(valueOf(selected, selQty))}</dd>
                                    </div>
                                    <div>
                                        <dt>SATIŞ FİYATI</dt>
                                        <dd>{selected.price ? fmtTL(selected.price) : 'satılmaz'}</dd>
                                    </div>
                                    <div>
                                        <dt>KÂR MARJI</dt>
                                        <dd className={selMargin !== null && selMargin > 0 ? 'good' : undefined}>
                                            {selMargin === null ? '—' : `%${selMargin}`}
                                        </dd>
                                    </div>
                                </dl>

                                <div className="stk-actions">
                                    {ACTIONS.map(([key, label]) => (
                                        <button
                                            key={key}
                                            className={`stk-action${action === key ? ' on' : key === 'in' ? ' primary' : ''}`}
                                            onClick={() => {
                                                setAction((prev) => (prev === key ? null : key));
                                                setEditing(false);
                                                setFormQty('');
                                                setFormNote('');
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {action && (
                                    <div className="stk-form">
                                        <div className="stk-kicker">{ACTION_TITLES[action]}</div>
                                        <div className="stk-form-row">
                                            <input
                                                className="qty"
                                                value={formQty}
                                                onChange={(e) => setFormQty(e.target.value.replace(/[^0-9.,]/g, ''))}
                                                inputMode="decimal"
                                                aria-label="Miktar"
                                                placeholder="0"
                                            />
                                            <span className="stk-form-unit">{selected.unit || 'adet'}</span>
                                        </div>
                                        <input
                                            className="note"
                                            value={formNote}
                                            onChange={(e) => setFormNote(e.target.value)}
                                            placeholder="Not (isteğe bağlı) — örn. tedarikçi faturası 4021"
                                        />
                                        {formQty !== '' && (() => {
                                            const entered = num(formQty);
                                            const next = action === 'in' ? selQty + entered : action === 'count' ? entered : selQty - entered;
                                            const delta = next - selQty;
                                            return (
                                                <div className={`stk-preview${next < 0 ? ' bad' : ''}`}>
                                                    <span>{fmtNum(selQty)} → <b>{fmtNum(next)} {selected.unit || 'adet'}</b></span>
                                                    <em>{delta === 0 ? 'değişiklik yok' : `${delta > 0 ? '+' : ''}${fmtNum(delta)}`}</em>
                                                </div>
                                            );
                                        })()}
                                        <p className="stk-form-hint">{ACTION_HINTS[action]}</p>
                                        <div className="stk-form-actions">
                                            <button className="stk-btn sm primary" onClick={saveMovement} disabled={saving}>Kaydet</button>
                                            <button className="stk-btn sm quiet" onClick={() => setAction(null)}>Vazgeç</button>
                                        </div>
                                    </div>
                                )}

                                <div className="stk-history">
                                    <div className="stk-history-head">
                                        <span className="stk-kicker">HAREKET GEÇMİŞİ</span>
                                        <button className="stk-link" onClick={() => setLedgerOpen(selected.id)}>Tümünü gör</button>
                                    </div>
                                    <div className="stk-history-list">
                                        {history.length === 0 && (
                                            <p className="stk-form-hint" style={{ margin: '6px 0 0' }}>
                                                Bu üründe henüz hareket yok. Açılış stoğunu “Stok girişi” ile yazın.
                                            </p>
                                        )}
                                        {history.map((m) => (
                                            <div key={m.id} className="stk-move">
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="stk-move-top">
                                                        <span className={`stk-badge ${MOVE_TONE[m.type]}`}>{MOVE_TR[m.type]}</span>
                                                        <span className="stk-move-date">{dayLabel(m.createdAt, now)} · {new Date(m.createdAt).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div className="stk-move-note">{m.note || '—'}</div>
                                                </div>
                                                <div className={`stk-move-delta${m.delta > 0 ? ' up' : ''}`}>
                                                    {m.delta > 0 ? '+' : ''}{fmtNum(m.delta)} {selected.unit || 'adet'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </div>

            {creating && (
                <ProductModal title="Ürün ekle" draft={draft} setDraft={setDraft} isNew saving={saving}
                    categories={categories} onClose={() => setCreating(false)} onSave={createProduct} />
            )}
            {editing && selected && (
                <ProductModal title="Ürünü düzenle" draft={edit} setDraft={setEdit} saving={saving}
                    categories={categories} onClose={() => setEditing(false)} onSave={saveEdit} />
            )}

            {ledgerOpen && (
                <StockLedger movements={movements} products={products}
                    productId={typeof ledgerOpen === 'string' ? ledgerOpen : undefined}
                    onClose={() => setLedgerOpen(false)} />
            )}
        </div>
    );
}

// ── Ürün ekle / düzenle (2026-10-31) ─────────────────────────────────────────
// Eski form 460px'lik pencerede dokuz büyük harfli alan alt alta diziliyordu;
// "kritik eşik", "hedef (dolu raf)" ne demek açıklanmıyordu ve açılış stoğu
// için ürün eklendikten sonra ayrıca "Stok girişi" açmak gerekiyordu.
// Şimdi dört bölüm: tür (iki kart) · ürün · fiyat (canlı kâr) · stok.
const UNIT_CHOICES = ['adet', 'ml', 'gr', 'şişe', 'kutu', 'paket'];

function ProductModal({ title, draft: d, setDraft: set, isNew, saving, categories, onClose, onSave }: {
    title: string;
    draft: Draft;
    setDraft: (next: Draft) => void;
    isNew?: boolean;
    saving: boolean;
    categories: string[];
    onClose: () => void;
    onSave: () => void;
}) {
    const unit = d.unit.trim() || 'adet';
    const retail = d.kind === 'retail';
    const cost = num(d.cost);
    const price = num(d.price);
    const margin = retail && cost > 0 && price > 0 ? Math.round(((price - cost) / price) * 100) : null;
    const customUnit = !UNIT_CHOICES.includes(unit);
    return (
        <div className="stk-overlay" onClick={onClose}>
            <div className="stk-modal is-form" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
                <div className="stk-modal-head">
                    <b>{title}</b>
                    <button className="stk-icon-btn" onClick={onClose} aria-label="Kapat"><X size={15} /></button>
                </div>
                <div className="stk-pf">
                    <div className="stk-pf-kinds" role="radiogroup" aria-label="Ürün türü">
                        <button type="button" role="radio" aria-checked={retail} onClick={() => set({ ...d, kind: 'retail' })}>
                            <strong>Satılık ürün</strong><span>Rafta müşteriye satılan — şampuan, krem, serum</span>
                        </button>
                        <button type="button" role="radio" aria-checked={!retail} onClick={() => set({ ...d, kind: 'consumable', price: '' })}>
                            <strong>Sarf malzemesi</strong><span>İşlemde kullanılan — boya, oksidan, ağda</span>
                        </button>
                    </div>

                    <section>
                        <h4>Ürün</h4>
                        <div className="stk-pf-grid">
                            <label className="is-wide"><span>Ürün adı</span>
                                <input value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} placeholder="örn. Boya 7.1 Kumral" autoFocus />
                            </label>
                            <label><span>Kategori <em>isteğe bağlı</em></span>
                                <input value={d.category} onChange={(e) => set({ ...d, category: e.target.value })} placeholder="örn. Renk" list="stk-categories" />
                                <datalist id="stk-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                            </label>
                            <div className="stk-pf-unit"><span>Birim</span>
                                <div className="stk-pf-chips">
                                    {UNIT_CHOICES.map((u) => (
                                        <button key={u} type="button" aria-pressed={unit === u} onClick={() => set({ ...d, unit: u })}>{u}</button>
                                    ))}
                                    <input className={customUnit ? 'on' : ''} value={customUnit ? d.unit : ''} onChange={(e) => set({ ...d, unit: e.target.value })} placeholder="diğer" aria-label="Başka birim" />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h4>Fiyat</h4>
                        <div className="stk-pf-grid">
                            <label><span>Alış maliyeti <em>1 {unit} için</em></span>
                                <div className="stk-pf-money"><b>₺</b><input value={d.cost} onChange={(e) => set({ ...d, cost: e.target.value })} inputMode="decimal" placeholder="0" /></div>
                            </label>
                            {retail ? (
                                <label><span>Satış fiyatı <em>1 {unit}</em></span>
                                    <div className="stk-pf-money"><b>₺</b><input value={d.price} onChange={(e) => set({ ...d, price: e.target.value })} inputMode="decimal" placeholder="0" /></div>
                                </label>
                            ) : (
                                <div className="stk-pf-note">Sarf malzemesi satılmaz; maliyeti aylık tüketim hesabına girer.</div>
                            )}
                        </div>
                        {retail && (
                            <p className={`stk-pf-hint${margin !== null && margin <= 0 ? ' is-bad' : ''}`}>
                                {margin === null ? 'Maliyet ve fiyatı girince kâr marjı burada görünür.' : `Kâr marjı %${margin} · ürün başına ${fmtTL(price - cost)}`}
                            </p>
                        )}
                    </section>

                    <section>
                        <div className="stk-pf-sechead">
                            <h4>Stok</h4>
                            <label className="stk-pf-switch">
                                <input type="checkbox" checked={d.tracks} onChange={(e) => set({ ...d, tracks: e.target.checked })} />
                                <i /><span>{d.tracks ? 'Stok takibi açık' : 'Stok takibi kapalı'}</span>
                            </label>
                        </div>
                        {d.tracks ? (
                            <div className="stk-pf-grid is-three">
                                {isNew && (
                                    <label><span>Şu an elde <em>açılış stoğu</em></span>
                                        <div className="stk-pf-money"><input value={d.opening} onChange={(e) => set({ ...d, opening: e.target.value })} inputMode="decimal" placeholder="0" /><b>{unit}</b></div>
                                    </label>
                                )}
                                <label><span>Uyarı eşiği</span>
                                    <div className="stk-pf-money"><input value={d.threshold} onChange={(e) => set({ ...d, threshold: e.target.value })} inputMode="decimal" placeholder="0" /><b>{unit}</b></div>
                                    <small>Bu miktara inince "Kritik" olur</small>
                                </label>
                                <label><span>Dolu raf</span>
                                    <div className="stk-pf-money"><input value={d.par} onChange={(e) => set({ ...d, par: e.target.value })} inputMode="decimal" placeholder="0" /><b>{unit}</b></div>
                                    <small>Sipariş verince ulaşılacak miktar</small>
                                </label>
                            </div>
                        ) : (
                            <p className="stk-pf-hint">Takip kapalı ürünün miktarı tutulmaz ve uyarı üretmez — örn. pamuk, havlu.</p>
                        )}
                    </section>
                </div>
                <div className="stk-modal-foot">
                    <button className="stk-btn sm quiet" onClick={onClose}>Vazgeç</button>
                    <button className="stk-btn sm primary" onClick={onSave} disabled={saving || !d.name.trim()}>
                        {saving ? 'Kaydediliyor…' : isNew ? 'Ürünü ekle' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Hareket geçmişi (2026-10-31) ─────────────────────────────────────────────
// Eskiden 560px'lik pencerede son 200 hareket, tarih "2026-10-31" biçiminde
// ve süzgeçsizdi. Şimdi Kasa defteriyle aynı tablo: aralık, tür, ürün araması
// ve parasal özet (maliyet × miktar — birimleri farklı ürünlerin miktarı
// toplanamaz, değeri toplanır).
type LedgerKind = 'all' | 'in' | 'out' | 'waste' | 'count';
const LEDGER_PRESETS: [RangePreset | 'all', string][] = [['today', 'Bugün'], ['week', 'Bu hafta'], ['month', 'Bu ay'], ['all', 'Tümü']];
const kindOf = (t: StockMovementType): Exclude<LedgerKind, 'all'> => (t === 'in' ? 'in' : t === 'waste' ? 'waste' : t === 'count' ? 'count' : 'out');

function StockLedger({ movements, products, productId, onClose }: {
    movements: StockMovement[];
    products: Product[];
    productId?: string;
    onClose: () => void;
}) {
    const today = toISODate(new Date());
    const [preset, setPreset] = useState<RangePreset | 'all'>(productId ? 'all' : 'month');
    const [kind, setKind] = useState<LedgerKind>('all');
    const [query, setQuery] = useState(() => (productId ? products.find((p) => p.id === productId)?.name || '' : ''));
    const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

    const rows = useMemo(() => {
        const range = preset === 'all' ? null : presetRange(preset, today);
        const q = query.trim().toLocaleLowerCase('tr');
        return movements.filter((m) => {
            if (range) { const d = localDay(m.createdAt); if (d < range.from || d > range.to) return false; }
            if (kind !== 'all' && kindOf(m.type) !== kind) return false;
            if (q) {
                const p = byId.get(m.productId);
                if (!`${p?.name || ''} ${p?.category || ''} ${m.note || ''}`.toLocaleLowerCase('tr').includes(q)) return false;
            }
            return true;
        });
    }, [movements, preset, kind, query, byId, today]);

    const value = (m: StockMovement) => Math.abs(m.delta) * (byId.get(m.productId)?.cost || 0);
    const sums = useMemo(() => {
        const out = { in: 0, out: 0, waste: 0, count: 0, n: rows.length };
        for (const m of rows) out[kindOf(m.type)] += value(m) * (m.type === 'count' ? Math.sign(m.delta) : 1);
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, byId]);

    const fmtWhen = (iso: string) => {
        const d = new Date(iso);
        return { day: `${d.getDate()} ${MONTHS[d.getMonth()]}`, time: d.toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' }) };
    };

    return (
        <div className="kd-overlay" onClick={onClose}>
            <div className="kd-sheet" role="dialog" aria-modal="true" aria-label="Stok hareket geçmişi" onClick={(e) => e.stopPropagation()}>
                <header className="kd-head">
                    <span className="kd-head-icon"><History size={18} /></span>
                    <div className="kd-head-copy"><h2>Stok hareket geçmişi</h2><p>Giriş, tüketim, satış, fire ve sayım düzeltmeleri</p></div>
                    <div className="kd-head-actions">
                        <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
                    </div>
                </header>
                <div className="kd-toolbar">
                    <div className="kd-seg" role="group" aria-label="Tarih aralığı">
                        {LEDGER_PRESETS.map(([p, label]) => <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)}>{label}</button>)}
                    </div>
                    <div className="kd-seg" role="group" aria-label="Hareket türü">
                        {([['all', 'Tümü'], ['in', 'Giriş'], ['out', 'Çıkış'], ['waste', 'Fire'], ['count', 'Sayım']] as [LedgerKind, string][]).map(([k, label]) => (
                            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
                        ))}
                    </div>
                    <label className="kd-search"><Search size={15} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün, kategori veya not ara" /></label>
                </div>
                <div className="kd-stats" style={{ marginTop: 12, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                    <div><small>Giriş</small><strong className="is-green">{fmtTL(sums.in)}</strong><span>maliyet değeri</span></div>
                    <div><small>Çıkış</small><strong>{fmtTL(sums.out)}</strong><span>tüketim + satış</span></div>
                    <div><small>Fire</small><strong className={sums.waste > 0 ? 'is-red' : ''}>{fmtTL(sums.waste)}</strong><span>kayıp</span></div>
                    <div><small>Sayım farkı</small><strong className={sums.count < 0 ? 'is-red' : sums.count > 0 ? 'is-amber' : ''}>{sums.count === 0 ? fmtTL(0) : `${sums.count > 0 ? '+' : '−'}${fmtTL(Math.abs(sums.count))}`}</strong><span>{sums.n} hareket</span></div>
                </div>
                <div className="kd-table" style={{ marginTop: 12 }} role="table" aria-label="Stok hareketleri">
                    <div className="kd-row is-head" role="row"><span>Zaman</span><span>Ürün</span><span>Tür</span><span>Miktar</span><span>Değer</span></div>
                    {rows.slice(0, 500).map((m) => {
                        const p = byId.get(m.productId);
                        const w = fmtWhen(m.createdAt);
                        const k = kindOf(m.type);
                        return (
                            <div key={m.id} className={`kd-row ${m.delta > 0 ? 'is-income' : k === 'waste' ? 'is-expense' : 'is-out'}`} role="row">
                                <span className="kd-when"><b>{w.day}</b>{w.time}</span>
                                <span className="kd-what">
                                    <i className="kd-dir">{k === 'count' ? <RefreshCcw size={14} /> : m.delta > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</i>
                                    <span><strong>{p?.name || 'Silinmiş ürün'}</strong><small>{m.note || (p?.category ?? '')}</small></span>
                                </span>
                                <span><span className={`stk-badge ${MOVE_TONE[m.type]}`}>{MOVE_TR[m.type]}</span></span>
                                <span className="kd-amount" style={{ textAlign: 'left' }}>{m.delta > 0 ? '+' : ''}{fmtNum(m.delta)} {p?.unit || ''}</span>
                                <span className="kd-amount" style={{ color: 'var(--dc-muted)', fontWeight: 650 }}>{p?.cost ? fmtTL(value(m)) : '—'}</span>
                            </div>
                        );
                    })}
                    {rows.length === 0 && <div className="kd-empty">{movements.length === 0 ? 'Henüz hiç stok hareketi yok.' : 'Bu süzgece uyan hareket yok.'}</div>}
                </div>
                <footer className="kd-foot"><span>{Math.min(rows.length, 500)} / {rows.length} satır</span><span>Miktar hiçbir yerde saklanmaz; ürünün miktarı bu hareketlerin toplamıdır.</span></footer>
            </div>
        </div>
    );
}
