// Bilgi bankası — işletmenin asistana öğrettikleri (137).
//
// Kullanıcı kararı (2026-11-06): asistan "otopark var mı", "kartla ödeyebilir
// miyim", "geç kalırsam ne olur" gibi sorulara işletmenin kendi yazdığıyla
// cevap versin; yazılmamışsa uydurmasın, "sorup döneyim" desin.
//
// Saf modül: veritabanı yok, Deno yok. whatsapp-proxy (kayıt), profile.ts
// (istem) ve tests/wa-agent.test.mjs kullanır.

export interface FaqItem { q: string; a: string }

export interface Knowledge {
    /** Ödeme yöntemleri: nakit, kart, havale, taksit… */
    payment: string;
    /** İptal ve gecikme kuralı. */
    policy: string;
    /** Ulaşım ve otopark. */
    location: string;
    /** Başka her şey: kapora, hijyen, çocukla gelmek… */
    notes: string;
    faq: FaqItem[];
}

export const KNOWLEDGE_LIMITS = { text: 600, question: 150, answer: 600, faq: 20 } as const;

export const EMPTY_KNOWLEDGE: Knowledge = { payment: '', policy: '', location: '', notes: '', faq: [] };

function clean(v: unknown, max: number): string {
    return String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

/** Ham JSON'dan güvenli bilgi bankası: bilinmeyen alan atılır, sınırlar uygulanır. */
// deno-lint-ignore no-explicit-any
export function sanitizeKnowledge(raw: any): Knowledge {
    const r = raw && typeof raw === 'object' ? raw : {};
    const L = KNOWLEDGE_LIMITS;
    const faq = (Array.isArray(r.faq) ? r.faq : [])
        // deno-lint-ignore no-explicit-any
        .map((f: any) => ({ q: clean(f?.q, L.question), a: clean(f?.a, L.answer) }))
        .filter((f: FaqItem) => f.q && f.a)
        .slice(0, L.faq);
    return {
        payment: clean(r.payment, L.text),
        policy: clean(r.policy, L.text),
        location: clean(r.location, L.text),
        notes: clean(r.notes, L.text),
        faq,
    };
}

/** Profil satırları. Boş bilgi bankası tek satır: asistan uydurmasın diye. */
export function knowledgeLines(k: Knowledge): string[] {
    const one = (s: string) => s.replace(/\s*\n\s*/g, ' / ');
    const lines: string[] = ['BİLGİ BANKASI (işletmenin kendi yazdığı; yalnız bunu kullan)'];
    const field = (label: string, v: string) => lines.push(`${label}: ${v ? one(v) : 'yazılmamış'}`);
    field('Ödeme', k.payment);
    field('İptal ve gecikme', k.policy);
    field('Ulaşım ve otopark', k.location);
    if (k.notes) field('Notlar', k.notes);
    if (k.faq.length) {
        lines.push('Sık sorulanlar:');
        for (const f of k.faq) lines.push(`- S: ${one(f.q)} → C: ${one(f.a)}`);
    }
    return lines;
}
