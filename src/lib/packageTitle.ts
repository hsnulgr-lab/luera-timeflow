// Paket satışının başlığı — telefonun `mobile/src/lib/packageSale.ts ·
// planTitle`ıyla AYNI kural. Çok seansta "Lazer · 10 seans", tekte yalnız ad;
// ad sayıyı ZATEN söylüyorsa ("Lazer Epilasyon · 6 Seans", "10 seanslık
// bakım") eklenmez. Eski kural "… · 6 Seans · 6 seans" yazıyordu (2026-10-16).

function mentionsSessions(text: string, count: number): boolean {
    return new RegExp(`(^|[^0-9])${count}\\s*seans`).test(text.toLocaleLowerCase('tr-TR'));
}

export function planTitle(name: string, count: number): string {
    const clean = name.trim();
    if (count <= 1 || mentionsSessions(clean, count)) return clean;
    return `${clean} · ${count} seans`;
}
