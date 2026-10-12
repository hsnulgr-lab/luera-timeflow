/**
 * Kök yığında bir ekranın ALTINDAKİ kabuk — saf, test edilebilir parça.
 *
 * Müşteri kartı, randevu detayı, kumanda gibi ekranlar kabuğun sekmesi
 * değil, kök yığına itilen sayfalar: `[tek, (staff-flow)/kumanda,
 * (staff-flow)/musteri]`. Hangi kabuğun üstünde açıldıklarını adreslerinden
 * bilemezler; yığından bilirler. Cevap bu ekranın altındaki EN YAKIN kabuk.
 *
 * Ekranın kendi rotası bu yığında yoksa (bir sekmenin içindeyse) cevap
 * `null`: sekmeler kabuklarını bağlamdan okuyor (`shellRoot.ts`).
 */

import type { ShellName } from './shellRoot.ts';

const SHELLS: readonly string[] = ['mudur', 'personel', 'tek'] satisfies readonly ShellName[];

export function shellBeneath(
    routes: readonly { key: string; name: string }[],
    key: string,
): ShellName | null {
    const own = routes.findIndex((route) => route.key === key);
    if (own < 0) return null;
    for (let index = own - 1; index >= 0; index -= 1) {
        const name = routes[index]?.name;
        if (name !== undefined && SHELLS.includes(name)) return name as ShellName;
    }
    return null;
}
