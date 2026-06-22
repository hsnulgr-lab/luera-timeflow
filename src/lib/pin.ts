// Personel PIN'i için hafif hash (SHA-256). Gerçek güvenlik değil — cihaz-içi
// mod için düz metin saklamamak adına. Aynı fonksiyon hem atama hem doğrulamada.
export async function hashPin(pin: string): Promise<string> {
    const data = new TextEncoder().encode(pin.trim());
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
