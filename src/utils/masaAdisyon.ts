// Masa adisyonu ortak yardımcıları — masaüstü (MasaPage) ve mobil garson paylaşır.
import type { MasaAdisyonItem, Product } from '@/types';

export const MENU_CATEGORIES = ['Başlangıç', 'Yemek', 'İçecek', 'Tatlı', 'Diğer'] as const;

// Uzun oturan masa eşiği (dk) — bu süreyi aşan dolu masa vurgulanır
export const LONG_SIT_MIN = 90;

// Masaya oturuldu damgasından (seated_at) bu ana kadar geçen dakika.
// Damga yoksa (044 uygulanmadı / henüz oturmadı) null → ⏱ gizlenir.
export function seatedMinutes(seatedAt?: string, now: number = Date.now()): number | null {
    if (!seatedAt) return null;
    const t = new Date(seatedAt).getTime();
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((now - t) / 60000));
}

// Süre etiketi: "0dk" / "34dk" / "1s 20dk"
export function elapsedLabel(min: number): string {
    if (min < 60) return `${min}dk`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}s` : `${h}s ${m}dk`;
}

// Adisyon toplamı = Σ(adet × birim fiyat)
export function adisyonTotal(items: MasaAdisyonItem[] | undefined): number {
    return (items || []).reduce((s, it) => s + it.price * it.qty, 0);
}

// Kasa açıklaması için kısa kalem dökümü: "2× Çay, 1× Kola"
export function adisyonSummary(items: MasaAdisyonItem[] | undefined): string {
    return (items || []).map((it) => `${it.qty}× ${it.name}`).join(', ');
}

// Menüden bir ürün ekle — aynı ürün varsa adedini artır (id = product:<pid>)
export function addMenuItem(items: MasaAdisyonItem[], p: Product): MasaAdisyonItem[] {
    const key = `product:${p.id}`;
    const idx = items.findIndex((it) => it.id === key);
    if (idx >= 0) {
        const next = [...items];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
    }
    return [...items, { id: key, name: p.name, price: p.price, qty: 1, kind: 'product' }];
}

// Serbest kalem ekle
export function addExtraItem(items: MasaAdisyonItem[], name: string, price: number): MasaAdisyonItem[] {
    return [...items, { id: `extra:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`, name, price, qty: 1, kind: 'extra' }];
}

// Bir kalemin adedini değiştir; 0'a düşerse sil
export function changeQty(items: MasaAdisyonItem[], id: string, delta: number): MasaAdisyonItem[] {
    return items
        .map((it) => (it.id === id ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0);
}

// Ürünleri kategoriye göre grupla (boş kategori → "Diğer"); menü sekmeleri için
export function groupMenu(products: Product[]): { category: string; items: Product[] }[] {
    const map = new Map<string, Product[]>();
    for (const p of products) {
        const c = p.category || 'Diğer';
        (map.get(c) || map.set(c, []).get(c)!).push(p);
    }
    // Standart sıra önce, bilinmeyen kategoriler sona
    const ordered = [...MENU_CATEGORIES.filter((c) => map.has(c)), ...[...map.keys()].filter((c) => !MENU_CATEGORIES.includes(c as any))];
    return ordered.map((category) => ({ category, items: map.get(category)! }));
}
