import type { SectorComms } from '@/lib/sectorProfiles';

// WhatsApp mesaj şablonları — SAF fonksiyonlar, ağ erişimi yok.
//
// Gönderim src/services/whatsapp.ts üzerinden whatsapp-proxy edge function'ına
// gider; Evolution anahtarı tarayıcıya asla girmez. Bu dosya eskiden hem şablon
// hem de doğrudan Evolution çağrıları içeriyordu (evolutionApi.ts) — o çağrılar
// VITE_EVOLUTION_API_URL okuyordu ve .env'de böyle bir değişken olmadığı için
// tüm gönderim sessizce ölüydü.

// ─── Randevu onayı ───────────────────────────────────────────────────────────

/** "27 Temmuz Pazartesi" — şablonlarda okunabilir tarih. */
export function formatTrDate(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}

// Randevu oluşturulur oluşturulmaz gider — müşteri elinde yazılı bir kayıt olsun
// diye. 24s/2s hatırlatmalarından farkı: anlık ve tek seferlik.
// Edge function'lardaki (public-booking, whatsapp-booking) eşi aynı metni üretir.
export function buildConfirmationMessage(params: {
    customerName: string;
    date: string;              // ISO (YYYY-MM-DD)
    startTime: string;
    service: string;
    businessName: string;
    staffName?: string;
    mapsUrl?: string;
    comms?: SectorComms;
}): string {
    const firstName = (params.customerName || '').split(' ')[0];
    const c = params.comms;
    const svcWord = c?.serviceWord ?? 'randevu';
    return (
        `Merhaba ${firstName} 👋\n\n` +
        `*${params.businessName}* — ${svcWord} kaydınız oluşturuldu ✅\n\n` +
        `📅 ${formatTrDate(params.date)}\n` +
        `🕐 Saat *${params.startTime}*\n` +
        `💠 ${params.service}` +
        (params.staffName ? `\n👤 ${params.staffName}` : '') +
        `\n\nDeğişiklik gerekirse bu mesaja yanıt vermeniz yeterli. Görüşmek üzere! ${c?.emoji ?? '🗓️'}` +
        (params.mapsUrl ? `\n\n📍 Konum: ${params.mapsUrl}` : '')
    );
}

// ─── Google değerlendirme daveti ─────────────────────────────────────────────

// Tahsilat kapandıktan ~3 saat sonra gider (remind cron). İşletme puanı
// büyümenin en ucuz kaldıracı ama kimse elle istemiyor. Edge function'daki
// (remind) eşi aynı metni üretir — ikisi aynı görünmeli.
export function buildReviewMessage(params: {
    customerName: string;
    businessName: string;
    reviewUrl: string;
    comms?: SectorComms;
}): string {
    const firstName = (params.customerName || '').split(' ')[0];
    return (
        `Merhaba ${firstName} ${params.comms?.emoji ?? '😊'}\n\n` +
        `Bugün *${params.businessName}*'i tercih ettiğiniz için teşekkür ederiz!\n\n` +
        `Memnun kaldıysanız Google'da kısa bir değerlendirme bırakmanız bizim için çok değerli — ` +
        `bir dakikanızı bile almaz 🙏\n\n👉 ${params.reviewUrl}`
    );
}

// ─── Hatırlatma mesajı şablonları ────────────────────────────────────────────

// Hatırlatma şablonları — sektörün iletişim profiline göre (bkz. sectorProfiles).
// Edge function (supabase/functions/remind) aynı biçimi üretir; buradaki
// sürüm Ayarlar'daki önizleme içindir, ikisi aynı görünmeli.
export function build24hMessage(params: {
    customerName: string;
    startTime: string;
    service: string;
    businessName: string;
    mapsUrl?: string;
    comms?: SectorComms;
}): string {
    const c = params.comms;
    const svcWord = c?.servicePhrase ?? 'randevunuzu';
    return (
        `Merhaba ${params.customerName} 👋\n\n` +
        `*${params.businessName}*'daki ${params.service} ${svcWord} hatırlatmak istedik.\n\n` +
        `📅 Yarın saat *${params.startTime}*\n\n` +
        `Görüşmek üzere! ${c?.emoji ?? '🗓️'}` +
        (params.mapsUrl ? `\n\n📍 Konum: ${params.mapsUrl}` : '')
    );
}

export function build2hMessage(params: {
    customerName: string;
    startTime: string;
    service: string;
    businessName: string;
    mapsUrl?: string;
    comms?: SectorComms;
}): string {
    return (
        `Merhaba ${params.customerName} 👋\n\n` +
        `Bugün saat *${params.startTime}*'deki *${params.service}* randevunuz 2 saat sonra.\n\n` +
        `📍 ${params.businessName}\n\n` +
        `Görüşmek üzere! ${params.comms?.emoji ?? '✅'}` +
        (params.mapsUrl ? `\n\n📍 Konum: ${params.mapsUrl}` : '')
    );
}

// Dönüş (recall) şablonu — sektörün kavramıyla: diş kontrolü / dip boyası…
export function buildRecallMessage(params: {
    customerName: string;
    businessName: string;
    comms?: SectorComms;
}): string {
    const firstName = (params.customerName || '').split(' ')[0];
    const concept = params.comms?.recall?.concept ?? 'dönüş';
    return (
        `Merhaba ${firstName} 👋\n\n` +
        `*${params.businessName}*'den yazıyoruz. *${concept}* zamanınız geldi ${params.comms?.emoji ?? '😊'}\n\n` +
        `Size uygun bir güne randevu oluşturmak için bu mesaja yanıt vermeniz yeterli. İyi günler dileriz! 😊`
    );
}

// Sırasız bekleme — sıraya eklenince konum/ETA bilgisi
export function buildQueueJoinMessage(params: {
    customerName: string;
    businessName: string;
    position: number;     // önünde kaç kişi + 1 (1 = sıradaki)
    etaMin: number;
}): string {
    const pos = params.position <= 1
        ? `Sıradaki sizsiniz, birazdan çağıracağız.`
        : `Sıranız: *${params.position}.* — tahmini bekleme *~${params.etaMin} dk*`;
    return (
        `Merhaba ${params.customerName} 👋\n\n` +
        `*${params.businessName}* sırasına eklendiniz.\n${pos}\n\n` +
        `Sıranız gelince size haber vereceğiz ✅`
    );
}

// Sırasız bekleme — sıra geldiğinde çağrı
export function buildQueueReadyMessage(params: { customerName: string; businessName: string }): string {
    return (
        `Merhaba ${params.customerName} 🔔\n\n` +
        `Sıranız geldi! *${params.businessName}* sizi bekliyor, buyurun 🙌`
    );
}

// Randevu tamamlandıktan sonra "tekrar randevu al" daveti (Sıradaki Randevu Otomasyonu)
export function buildRebookMessage(params: {
    customerName: string;
    service: string;
    businessName: string;
    note?: string;        // teşvik satırı (ör. "%10 erken rezervasyon indirimi")
    bookingUrl?: string;
}): string {
    const noteLine = params.note?.trim() ? `\n\n🎁 ${params.note.trim()}` : '';
    const linkLine = params.bookingUrl ? `\n\n👉 ${params.bookingUrl}` : '';
    return (
        `Merhaba ${params.customerName} 👋\n\n` +
        `*${params.businessName}*'daki *${params.service}* hizmetiniz tamamlandı, teşekkür ederiz! 🙏\n\n` +
        `Bir sonraki randevunuzu şimdiden ayırtmak ister misiniz?${noteLine}${linkLine}`
    );
}

/**
 * "Sizi özledik" mesajının sonuna eklenen indirim teklifi — 071.
 * Kodu remind edge function üretir (müşteriye özel, Kasa'da tanınır); buradaki
 * sürüm Ayarlar'daki önizleme içindir, ikisi aynı görünmeli.
 */
export function buildDiscountLine(percent: number, days: number, code: string): string {
    const until = days > 0
        ? ` (${new Date(Date.now() + days * 86400_000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar)`
        : '';
    return `\n\n🎁 Size özel *%${percent} indirim*${until}\nKod: *${code}*\nRandevunuzda bu kodu söylemeniz yeterli.`;
}

// "Sizi özledik" (winback) — 60+ gündür gelmeyen müşteriye. remind edge
// function'ındaki buildWinbackMessage ile aynı metni üretir; buradaki sürüm
// Ayarlar'daki önizleme içindir, ikisi aynı görünmeli.
export function buildWinbackMessage(params: {
    customerName: string;
    businessName: string;
    comms?: SectorComms;
}): string {
    const firstName = (params.customerName || '').split(' ')[0];
    const c = params.comms;
    return (
        `Merhaba ${firstName} ${c?.emoji ?? '😊'}\n\n` +
        `*${params.businessName}* olarak sizi özledik! Bir süredir uğramadınız — ` +
        `size uygun bir güne ${c?.serviceWord ?? 'randevu'} planlamak isterseniz bu mesaja yanıt vermeniz yeterli. 😊`
    );
}

// Biten pakete yenileme teklifi — remind'daki buildRenewalMessage'ın eşi.
export function buildRenewalMessage(params: {
    customerName: string;
    packageTitle: string;
    businessName: string;
    comms?: SectorComms;
}): string {
    const firstName = (params.customerName || '').split(' ')[0];
    return (
        `Merhaba ${firstName} ${params.comms?.emoji ?? '😊'}\n\n` +
        `*${params.businessName}*'daki *${params.packageTitle}* paketiniz tamamlandı — emeğinize sağlık! 🎉\n\n` +
        `Devam etmek isterseniz yenileme için bu mesaja yanıt vermeniz yeterli; size uygun bir plan hazırlayalım. 😊`
    );
}
