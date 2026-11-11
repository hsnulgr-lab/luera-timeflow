// staff-api · istemci IP'si (142). Ayrı dosya: node testleri içe aktarabilsin.

/**
 * İSTEMCİNİN GERÇEK IP'Sİ (142).
 *
 * Eskiden `x-forwarded-for`un İLK değeri alınıyordu — o değeri istemci
 * kendisi yazabilir; her istekte başka bir "IP" uydurup sayacı atlıyordu.
 * Zincir (self-hosted, DNS doğrudan VPS'e, Cloudflare yok):
 *   istemci → Traefik (Coolify; gördüğü adresi SONA ekler) → Kong (kendi
 *   gördüğü iç docker adresini sona ekler) → edge runtime.
 * İstemcinin yazdığı her şey SOLDA kalır. Bu yüzden sağdan sola gidip ilk
 * GENEL (özel/loopback olmayan) adres alınır: Traefik'in gördüğü adres.
 * Genel adres yoksa en sağdaki değer; hiçbiri yoksa null (→ ortak kova).
 */
export function clientIp(forwardedFor: string | null): string | null {
    const hops = (forwardedFor ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) {
        if (!isPrivateIp(hops[i])) return hops[i];
    }
    return hops.length > 0 ? hops[hops.length - 1] : null;
}

function isPrivateIp(ip: string): boolean {
    const v = ip.toLowerCase().replace(/^::ffff:/, '');
    const m = v.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
    if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        return a === 10 || a === 127 || a === 0
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 169 && b === 254)
            || (a === 100 && b >= 64 && b <= 127);
    }
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
        || !/^[0-9a-f:.]+$/.test(v);
}
