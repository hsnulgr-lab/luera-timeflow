import AsyncStorage from '@react-native-async-storage/async-storage';

// staff-api istemcisi.
//
// Personel cihazında Supabase oturumu YOKTUR. Elindeki tek şey iki token:
//   cihaz token'ı  — org sahibi kurulumda bir kez verir, 90 gün
//   personel token'ı — PIN girişinden sonra, 12 saat
// Sunucu her istekte kimliği kendi çözer; gövdeden gelen kimliğe güvenilmez.
//
// ÇEVRİMDIŞI: salonun bodrumunda sinyal yok. Yazma istekleri düşerse veri
// KAYBOLMAZ — yerel kuyruğa alınır, bağlantı gelince sırayla gönderilir.
// Her isteğin bir idempotency anahtarı var; tekrar gönderim çift kayıt
// oluşturmaz (sunucu tarafında visit.finish zaten idempotent).

const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ENDPOINT = `${BASE}/functions/v1/staff-api`;

const K_DEVICE = 'tf.device.token';
const K_STAFF = 'tf.staff.token';
const K_QUEUE = 'tf.queue';

export interface StaffMe { id: string; name: string; color: string | null; role: string }

export interface Appointment {
    id: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    date: string;
    start_time: string;
    end_time: string;
    service: string;
    service_color: string | null;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    staff_id: string | null;
    notes: string | null;
    arrived_at: string | null;
    service_ended_at: string | null;
    adisyon_items: AdisyonItem[] | null;
    is_paid: boolean;
}

export interface AdisyonItem {
    id: string;
    name: string;
    price: number;
    kind: 'product' | 'extra';
    productId?: string;
    qty?: number;
}

export class ApiError extends Error {
    constructor(public code: string, public status: number) {
        super(code);
    }
}

async function raw(action: string, body: Record<string, unknown> = {}, token?: string | null) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-staff-token': token } : {}),
        },
        body: JSON.stringify({ action, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(String(data?.error ?? 'server_error'), res.status);
    return data;
}

export const tokens = {
    device: () => AsyncStorage.getItem(K_DEVICE),
    staff: () => AsyncStorage.getItem(K_STAFF),
    setDevice: (t: string) => AsyncStorage.setItem(K_DEVICE, t),
    setStaff: (t: string) => AsyncStorage.setItem(K_STAFF, t),
    /** Çıkış: personel oturumu düşer, CİHAZ EŞLEŞMESİ KALIR. Aksi hâlde her
     *  vardiya değişiminde org sahibinin gelip cihazı yeniden eşlemesi
     *  gerekirdi. */
    clearStaff: () => AsyncStorage.removeItem(K_STAFF),
};

/** Kimlik gerektirmeyen çağrılar (giriş akışı). */
export const auth = {
    roster: (deviceToken: string) => raw('roster', {}, deviceToken),
    start: (deviceToken: string, staffId: string, pin: string) =>
        raw('session.start', { staffId, pin }, deviceToken),
};

/** Kimlikli çağrı: personel token'ı ile. */
async function call(action: string, body: Record<string, unknown> = {}) {
    const t = await tokens.staff();
    if (!t) throw new ApiError('no_session', 401);
    return raw(action, body, t);
}

export const api = {
    me: () => call('me'),
    agenda: (date?: string) => call('agenda', date ? { date } : {}),
    catalog: () => call('catalog'),
    customer: (customerId: string) => call('customer', { customerId }),
    performance: () => call('performance'),
    // Yazma uçları kuyruğa düşebilir — aşağıya bakın.
    visitStart: (reservationId: string) => write('visit.start', { reservationId }),
    visitItems: (reservationId: string, items: AdisyonItem[]) =>
        write('visit.items', { reservationId, items }),
    visitFinish: (reservationId: string) => write('visit.finish', { reservationId }),
};

// ── Çevrimdışı kuyruk ───────────────────────────────────────────────────────

interface QueuedJob {
    key: string;
    action: string;
    body: Record<string, unknown>;
    at: number;
}

async function readQueue(): Promise<QueuedJob[]> {
    try { return JSON.parse((await AsyncStorage.getItem(K_QUEUE)) || '[]'); } catch { return []; }
}
async function writeQueue(q: QueuedJob[]) {
    await AsyncStorage.setItem(K_QUEUE, JSON.stringify(q.slice(-50)));
}

/**
 * Yazma isteği. Ağ hatasında kuyruğa alınır ve `{ queued: true }` döner —
 * çağıran arayüz bunu görüp "sıraya alındı" der.
 *
 * SUNUCU HATASI KUYRUĞA GİRMEZ: 403/409 tekrar denemeyle düzelmez, kuyrukta
 * sonsuza kadar dönerdi. Yalnız AĞ hatası (fetch reddi) kuyruğa alınır.
 */
async function write(action: string, body: Record<string, unknown>) {
    const key = `${action}:${body.reservationId}:${Date.now()}`;
    try {
        return await call(action, { ...body, idempotencyKey: key });
    } catch (e) {
        if (e instanceof ApiError) throw e;   // sunucu konuştu, kuyruk çözmez
        const q = await readQueue();
        q.push({ key, action, body, at: Date.now() });
        await writeQueue(q);
        return { ok: false, queued: true };
    }
}

/** Bağlantı gelince çağrılır. Sırayla dener, ilk ağ hatasında durur. */
export async function flushQueue(): Promise<{ sent: number; left: number }> {
    const q = await readQueue();
    let sent = 0;
    while (q.length > 0) {
        const job = q[0];
        try {
            await call(job.action, { ...job.body, idempotencyKey: job.key });
            q.shift(); sent++;
        } catch (e) {
            // Sunucu reddettiyse bu iş asla geçmeyecek: kuyruğu tıkamasın, at.
            if (e instanceof ApiError) { q.shift(); continue; }
            break;  // ağ hâlâ yok
        }
    }
    await writeQueue(q);
    return { sent, left: q.length };
}

export async function queueLength(): Promise<number> {
    return (await readQueue()).length;
}
