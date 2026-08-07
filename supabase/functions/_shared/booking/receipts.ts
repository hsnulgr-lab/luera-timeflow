// Teslimat makbuzları — Evolution MESSAGES_UPDATE olayının okunması.
//
// wa_message_log'daki status='sent' bugüne kadar "Evolution isteği kabul etti"
// demekti; müşteriye ULAŞTIĞI anlamına gelmiyordu. Telefon kapalıysa da, numara
// WhatsApp'ta yoksa da 'sent' yazıyordu. Salon "müşteri mesaj gelmedi diyor"
// dediğinde elde kanıt yoktu.
//
// Evolution durumu hem sayı hem metin olarak gönderebiliyor (sürüm ve olay
// kaynağına göre değişiyor); ikisi de karşılanır.

export type Receipt = 'delivered' | 'read' | null;

// Baileys durum merdiveni: 0/1 bekliyor, 2 sunucuya ulaştı, 3 cihaza teslim,
// 4 okundu, 5 (sesli mesaj) dinlendi. Teslim ve okundu dışındakiler bizim için
// yeni bilgi taşımıyor — 'sent' zaten yazılıydı.
const NUMERIC: Record<number, Receipt> = {
    3: 'delivered',
    4: 'read',
    5: 'read',
};

const TEXTUAL: Record<string, Receipt> = {
    DELIVERY_ACK: 'delivered',
    READ: 'read',
    PLAYED: 'read',
};

export function parseReceiptStatus(raw: unknown): Receipt {
    if (typeof raw === 'number') return NUMERIC[raw] ?? null;
    if (typeof raw === 'string') {
        const t = raw.trim().toUpperCase();
        if (TEXTUAL[t]) return TEXTUAL[t];
        // "3" gibi sayısal metin
        const n = Number(t);
        if (Number.isFinite(n)) return NUMERIC[n] ?? null;
    }
    return null;
}

export interface ReceiptUpdate {
    providerMsgId: string;
    receipt: Exclude<Receipt, null>;
}

/**
 * MESSAGES_UPDATE gövdesinden işlenecek makbuzları çıkarır.
 *
 * Evolution `data`'yı bazen tek nesne, bazen dizi olarak yolluyor; durum bazen
 * `status`, bazen `update.status` altında. Hepsi tek yerde karşılanır ki
 * çağıran taraf şekil tahmini yapmasın.
 */
export function parseReceiptEvent(payload: {
    event?: string;
    data?: unknown;
}): ReceiptUpdate[] {
    const event = String(payload?.event || '').toLowerCase().replace(/_/g, '.');
    if (event !== 'messages.update') return [];

    const rows = Array.isArray(payload.data) ? payload.data : [payload.data];
    const out: ReceiptUpdate[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, any>;
        // Kendi gönderdiğimiz mesajın makbuzu gelir; gelen mesajın değil.
        const id = r.key?.id ?? r.keyId ?? null;
        if (typeof id !== 'string' || !id) continue;
        const receipt = parseReceiptStatus(r.status ?? r.update?.status ?? null);
        if (!receipt) continue;
        out.push({ providerMsgId: id, receipt });
    }
    return out;
}

/**
 * Makbuz için yazılacak alanlar. Okundu, teslim edilmişliği de ima eder —
 * WhatsApp bazen yalnız READ yolluyor ve teslim damgası boş kalıyordu.
 */
export function receiptPatch(receipt: Exclude<Receipt, null>, now: string): Record<string, string> {
    return receipt === 'read'
        ? { delivered_at: now, read_at: now }
        : { delivered_at: now };
}
