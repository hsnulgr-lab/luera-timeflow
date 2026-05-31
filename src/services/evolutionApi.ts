const BASE_URL = import.meta.env.VITE_EVOLUTION_API_URL as string;
const API_KEY  = import.meta.env.VITE_EVOLUTION_API_KEY as string;

const headers = {
    'Content-Type': 'application/json',
    'apikey': API_KEY,
};

export type ConnectionState = 'open' | 'close' | 'connecting';

// ─── Instance yönetimi ────────────────────────────────────────────────────────

/** Yeni instance oluştur (zaten varsa hata dönmez, ignore edilir) */
export async function createInstance(instanceName: string): Promise<boolean> {
    try {
        const res = await fetch(`${BASE_URL}/instance/create`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                instanceName,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS',
            }),
        });
        // 409 = zaten var → sorun değil
        return res.ok || res.status === 409;
    } catch {
        return false;
    }
}

/** QR kod al (base64 string döner) */
export async function getQRCode(instanceName: string): Promise<string | null> {
    try {
        const res = await fetch(`${BASE_URL}/instance/connect/${instanceName}`, { headers });
        if (!res.ok) return null;
        const data = await res.json();
        // Evolution API v1 ve v2 farklı field kullanıyor
        return data.base64 || data.qrcode?.base64 || data.code || null;
    } catch {
        return null;
    }
}

/** Bağlantı durumunu kontrol et */
export async function getConnectionState(instanceName: string): Promise<ConnectionState> {
    try {
        const res = await fetch(`${BASE_URL}/instance/connectionState/${instanceName}`, { headers });
        if (!res.ok) return 'close';
        const data = await res.json();
        return data.instance?.state || 'close';
    } catch {
        return 'close';
    }
}

/** Instance'ı sil (WhatsApp bağlantısını kes) */
export async function deleteInstance(instanceName: string): Promise<void> {
    try {
        await fetch(`${BASE_URL}/instance/delete/${instanceName}`, {
            method: 'DELETE',
            headers,
        });
    } catch {
        // Sessizce devam et
    }
}

// ─── Mesaj gönderme ───────────────────────────────────────────────────────────

/** WhatsApp metin mesajı gönder */
export async function sendTextMessage(
    instanceName: string,
    phone: string,
    text: string,
): Promise<boolean> {
    try {
        const res = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ number: phone, text }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ─── Hatırlatma mesajı şablonları ────────────────────────────────────────────

export function build24hMessage(params: {
    customerName: string;
    startTime: string;
    service: string;
    businessName: string;
}): string {
    return (
        `Merhaba ${params.customerName} 👋\n\n` +
        `*${params.businessName}*'daki ${params.service} randevunuzu hatırlatmak istedik.\n\n` +
        `📅 Yarın saat *${params.startTime}*\n\n` +
        `Görüşmek üzere! 🗓️`
    );
}

export function build2hMessage(params: {
    customerName: string;
    startTime: string;
    service: string;
    businessName: string;
}): string {
    return (
        `Merhaba ${params.customerName} 👋\n\n` +
        `Bugün saat *${params.startTime}*'deki *${params.service}* randevunuz 2 saat sonra.\n\n` +
        `📍 ${params.businessName}\n\n` +
        `Görüşmek üzere! ✅`
    );
}
