// Hizmet notları (138) — açıklama + hazırlık notu.
//
// Ayrı sorgu, bilerek: notlar asıl hizmet sorgusuna eklenseydi göç 138
// çalışmadan yüklenen bir fonksiyonda hizmet listesi BOŞ gelirdi (kolon yok
// hatası). Burada hata sessizce boş haritaya düşer: mesaj notsuz gider, akış
// durmaz.

import type { Admin } from '../wa.ts';

export interface ServiceNote {
    name: string;
    description: string | null;
    prep_note: string | null;
}

/** Org'un notlu hizmetleri, kimliğe göre. Kolon yoksa ya da hata olursa boş. */
export async function loadServiceNotes(admin: Admin, orgId: string): Promise<Map<string, ServiceNote>> {
    const out = new Map<string, ServiceNote>();
    try {
        const { data, error } = await admin.from('services')
            .select('id, name, description, prep_note')
            .eq('organization_id', orgId);
        if (error || !data) return out;
        for (const r of data as { id: string; name: string; description: string | null; prep_note: string | null }[]) {
            const description = r.description?.trim() || null;
            const prep_note = r.prep_note?.trim() || null;
            if (description || prep_note) out.set(r.id, { name: r.name, description, prep_note });
        }
    } catch { /* not yoksa mesaj notsuz gider */ }
    return out;
}

/**
 * Randevu satırında hizmet adı metin olarak durur (reservations.service);
 * ada göre hazırlık notu. Aynı adlı iki hizmet varsa ilki.
 */
export function prepByName(notes: Map<string, ServiceNote>, name: string | null | undefined): string | null {
    const n = String(name ?? '').trim().toLocaleLowerCase('tr');
    if (!n) return null;
    for (const v of notes.values()) {
        if (v.name.trim().toLocaleLowerCase('tr') === n) return v.prep_note;
    }
    return null;
}
