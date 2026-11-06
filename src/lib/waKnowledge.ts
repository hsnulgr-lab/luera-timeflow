// Asistanın bilgi bankası — Ayarlar → WhatsApp (137).
//
// Sunucudaki karşılığı supabase/functions/_shared/agent/knowledge.ts; sınırlar
// orada uygulanır (whatsapp-proxy), burası yalnız formu aynı sınırla tutar.
// İkisinin sınırları tests/wa-agent.test.mjs'te karşılaştırılır.

export interface FaqItem { q: string; a: string }

export interface WaKnowledge {
    payment: string;
    policy: string;
    location: string;
    notes: string;
    faq: FaqItem[];
}

export const KNOWLEDGE_LIMITS = { text: 600, question: 150, answer: 600, faq: 20 } as const;

export const EMPTY_KNOWLEDGE: WaKnowledge = { payment: '', policy: '', location: '', notes: '', faq: [] };

/** org_whatsapp.knowledge ham JSON'u → form değeri. */
export function knowledgeFromRow(raw: unknown): WaKnowledge {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const faq = Array.isArray(r.faq)
        ? r.faq.map((f) => ({ q: str((f as FaqItem)?.q), a: str((f as FaqItem)?.a) })).filter((f) => f.q || f.a)
        : [];
    return { payment: str(r.payment), policy: str(r.policy), location: str(r.location), notes: str(r.notes), faq };
}
