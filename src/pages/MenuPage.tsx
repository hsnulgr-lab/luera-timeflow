import { useMemo, useState } from 'react';
import { UtensilsCrossed, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { MENU_CATEGORIES, groupMenu } from '@/utils/masaAdisyon';

const MONO = "'JetBrains Mono', monospace";
const fmt = (n: number) => n.toLocaleString('tr-TR');

// Restoran menüsü — basit yemek/ürün yönetimi. Kasa ile AYNI ürün kataloğu
// (useProducts), ayrı tablo değil: buradan eklenen yemek adisyon menüsünde,
// garson mobilinde ve Kasa'da anında görünür. Yalnız restoran (masa) modunda
// nav'dan erişilir; masa kapalıyken route ModuleRoute('masa') ile /'e yönlenir.
export const MenuPage = () => {
    const { dark } = useTheme();
    const { products, addProduct, removeProduct } = useProducts();
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState('');

    const groups = useMemo(() => groupMenu(products), [products]);

    const add = () => {
        const p = parseFloat(price.replace(',', '.'));
        if (!name.trim()) { toast.error('Yemek adı gir'); return; }
        if (!p || p < 0) { toast.error('Geçerli bir fiyat gir'); return; }
        addProduct(name.trim(), p, category || undefined);
        setName(''); setPrice('');
    };

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto space-y-5">

                    {/* Başlık */}
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[var(--dc-inkbox)] flex items-center justify-center">
                            <UtensilsCrossed className="w-5 h-5 text-[var(--dc-inkbox-fg)]" />
                        </div>
                        <div>
                            <h1 className="text-[22px] font-extrabold text-[var(--dc-ink)] tracking-[-0.03em] leading-tight">Menü</h1>
                            <p className="text-[12.5px] text-[var(--dc-muted)]">Yemek ve içecekleri ekle — adisyonda ve kasada kullanılır</p>
                        </div>
                    </div>

                    {/* Ekleme formu */}
                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] p-4">
                        <div className="flex gap-2">
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yemek / içecek adı"
                                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                                className="flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm outline-none bg-[var(--dc-surface2)] border border-[var(--dc-border2)] text-[var(--dc-ink)]" />
                            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="₺"
                                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                                style={{ fontFamily: MONO }}
                                className="w-24 rounded-xl px-3 py-2.5 text-sm outline-none bg-[var(--dc-surface2)] border border-[var(--dc-border2)] text-[var(--dc-ink)]" />
                            <button onClick={add} aria-label="Ekle"
                                className="flex-shrink-0 w-11 rounded-xl grid place-items-center text-white" style={{ background: 'var(--dc-orange)' }}>
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                        {/* Kategori seçimi (opsiyonel) */}
                        <div className="flex gap-1.5 mt-2.5 flex-wrap">
                            {MENU_CATEGORIES.map((c) => (
                                <button key={c} onClick={() => setCategory(category === c ? '' : c)}
                                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
                                    style={{
                                        background: category === c ? 'var(--dc-orange)' : 'var(--dc-surface2)',
                                        color: category === c ? '#fff' : 'var(--dc-muted)',
                                        border: `1px solid ${category === c ? 'var(--dc-orange)' : 'var(--dc-border)'}`,
                                    }}>{c}</button>
                            ))}
                        </div>
                    </div>

                    {/* Menü listesi — kategoriye göre gruplu */}
                    {products.length === 0 ? (
                        <div className="rounded-2xl bg-[var(--dc-surface)] border border-dashed border-[var(--dc-border2)] py-12 text-center">
                            <UtensilsCrossed className="w-8 h-8 text-[var(--dc-muted)] mx-auto mb-3" />
                            <p className="text-sm font-semibold text-[var(--dc-ink)]">Menü boş</p>
                            <p className="text-[13px] text-[var(--dc-muted)] mt-1">Yukarıdan ilk yemeği ekle</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groups.map((g) => (
                                <div key={g.category}>
                                    <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] mb-2 px-1" style={{ fontFamily: MONO, color: 'var(--dc-muted)' }}>{g.category}</p>
                                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] overflow-hidden">
                                        {g.items.map((p, i) => (
                                            <div key={p.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-[var(--dc-border-soft)]')}>
                                                <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--dc-ink)] truncate">{p.name}</span>
                                                <span className="text-sm font-extrabold text-[var(--dc-ink)]" style={{ fontFamily: MONO }}>{fmt(p.price)} ₺</span>
                                                <button onClick={() => removeProduct(p.id)} aria-label="Sil"
                                                    className="w-8 h-8 rounded-lg grid place-items-center text-[var(--dc-muted)] hover:text-[var(--dc-red)] transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
