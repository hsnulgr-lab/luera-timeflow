// Sahte gönderim sonucu — SİLİNECEK.
//
// `Yaz` sunucudan gidiyor ama mobilde o uç HENÜZ YOK. Müdür modunun tamamı
// sahte kaynak üstünde çalışıyor ("Geldi" bile sunucuya gitmiyor), `Yaz` da
// aynı katmanda duruyor. Uç yazıldığında değişecek tek yer burası: pencere,
// damga ve beş hâlin tamamı olduğu gibi kalır.
//
// Sonuçları RASTGELE değil, olayın kendi verisinden türetiyoruz — aynı kart
// her yenilemede farklı sonuç göstermesin ve tasarımın beş hâli de cihazda
// görülebilsin.
//
// SAF KATMAN: React, react-native ve Expo import edilmez.

import { normalizePhone } from './phone.ts';
import type { WaResult } from './actionPill.ts';

/**
 * Salonun WhatsApp bağlantısı. Uç gelince `org_whatsapp`tan okunacak.
 *
 * DİKKAT — BUNU FALSE YAPMADAN ÖNCE EKRANI YAZ. `false` olduğunda hapta
 * `waoff` gözü çizilir ve o göz "Ayarlar → WhatsApp"a götürür; mobilde böyle
 * bir ekran HENÜZ YOK. Bağlantı ekranı yazılmadan bayrak çevrilirse hiçbir
 * yere gitmeyen bir düğme doğar — ürünün en sert kuralı bu.
 *
 * Model ve kart tarafı hazır (`pillCells` `waoff` üretiyor, testi de var);
 * eksik olan yalnız gidilecek yer.
 */
export const WA_CONNECTED = true;

export function mockSendResult(event: {
    id: string;
    customerPhone?: string | null;
    waOptOut?: boolean;
}): WaResult {
    if (!normalizePhone(event.customerPhone)) return 'invalid_phone';
    if (event.waOptOut) return 'opt_out';
    if (!WA_CONNECTED) return 'not_connected';
    // Kimlikten türeyen sabit bir dağılım: her onuncu kart kuyruğa düşer.
    const seed = [...event.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return seed % 10 === 0 ? 'failed' : 'ok';
}
