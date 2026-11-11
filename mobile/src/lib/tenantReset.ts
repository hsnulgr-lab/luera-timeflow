import AsyncStorage from '@react-native-async-storage/async-storage';

import { tokens } from '../api/staff';
import { AGENDA_CACHE_KEY } from './agendaCache.ts';

/**
 * KİRACI SINIRI — önceki salonun / kişinin izini telefondan silmek (2026-11-12).
 *
 * ── Neden tek yer ────────────────────────────────────────────────────────────
 * Çıkış, hesap silme, personelin hesap ekranından çıkışı, telefonu
 * işletmeden çıkarma ve müdürün salon değiştirmesi aynı soruyu soruyor:
 * "bundan sonra ekranda başkası var — öncekinden ne kaldı?" Her yol kendi
 * listesini tutunca biri hep eksik kalıyordu: müdür çıkışı tek kişilik
 * personel jetonunu bırakıyordu ve sonraki hesap ÖNCEKİ salonun jetonuyla
 * okuyup yazıyor, canlı zil önceki salona bağlanıyordu.
 *
 * Silinenler:
 *   • personel jetonu + tek kişilik kimlik (`tokens.clearStaff`)
 *   • günün çevrimdışı kopyası
 *   • kaydolan kancalar: müdür org önbelleği + canlı kanal (`managerSource`),
 *     jeton tazeleme saati (`backgroundSync`)
 *
 * SİLİNMEYENLER, bilerek:
 *   • cihaz eşleşmesi — çıkış eşleşmeyi silmez (099); onu yalnız "telefonu
 *     işletmeden çıkar" siliyor, kendi yolunda.
 *   • bekleyen yazma kuyruğu — işler sahibinin kimliğiyle duruyor ve yalnız
 *     o kişinin jetonuyla gidiyor (`staff.ts · flushQueue`). Silmek,
 *     çevrimdışı bitirilmiş bir adisyonu kaybetmek olurdu.
 *
 * Bu modül yaprak: ekran, yönlendirici, Supabase tanımıyor. Kancalar ters
 * yönden kaydoluyor ki `auth.ts` → `managerSource` gibi döngüler kurulmasın.
 */

const hooks = new Set<() => void>();

/** Sınır geçilince çalışacak bellek temizliği. Kaydı geri almak gerekmiyor: modül ömürlü. */
export function onTenantReset(hook: () => void): void {
    hooks.add(hook);
}

/** Bellekteki izler — eşzamanlı, depoya dokunmaz. Salon değişiminde de çağrılır. */
export function announceTenantReset(): void {
    for (const hook of hooks) {
        try {
            hook();
        } catch (cause) {
            console.warn('[kiracı sınırı] kanca başarısız', String(cause));
        }
    }
}

/**
 * Bütün iz: depo + bellek. Hata yutuluyor — çıkış yarıda kalmamalı; ama
 * her adım ayrı denendiği için biri düşerse ötekiler yine siliniyor.
 */
export async function resetTenant(): Promise<void> {
    await tokens.clearStaff().catch(() => undefined);
    await AsyncStorage.removeItem(AGENDA_CACHE_KEY).catch(() => undefined);
    announceTenantReset();
}
