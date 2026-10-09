/**
 * Rol kabuğuna giriş — GEÇMİŞİ SİLEREK.
 *
 * `router.replace` yalnız yığının EN ÜSTÜNÜ değiştiriyor; altında ne varsa
 * duruyor. Kimlik akışı birkaç yerde `push` kullandığı için (karşılama →
 * giriş → işletme → biyometri) kabuğa varıldığında yığın hâlâ doluydu; bir
 * önceki oturumun kabuğu da orada kalabiliyordu. Sonuç telefonda şuydu:
 * müdür profilinden sağa kaydırınca ALTTAN PERSONEL PROFİLİ çıkıyordu.
 *
 * Kabuk bir sayfa değil, uygulamanın kendisi: arkasında geri dönülecek bir
 * yer yok. O yüzden giriş önce yığını boşaltıyor, sonra kökü kabukla
 * değiştiriyor — geriye tek girdi kalıyor.
 *
 * İkinci kilit `app/_layout.tsx` içinde: iki kabuk da `gestureEnabled: false`.
 * Üçüncüsü `src/lib/roleGate.ts`: yanlış kabuk çizilmeden geri gönderiliyor.
 */

import { router } from 'expo-router';
import type { AuthActor } from '../api/session';

export type ShellHref = '/mudur' | '/personel' | '/tek';

/**
 * Üçüncü kabuk ROLDEN değil, işletmenin modundan geliyor.
 *
 * Tek kişilik işletmenin sahibi veritabanında da müdür: org sahibi,
 * `organization_members.role = 'owner'`, RLS aynı. `AuthActor`a üçüncü bir
 * değer eklemek rol kapısını, bildirim kaydını ve oturum okumasını birden
 * etkilerdi — hepsi iki değeri varsayıyor. Mod ayrı bir bayrak olarak
 * taşınıyor: `actor = 'manager'` + `solo = true`.
 *
 * `solo` YALNIZ müdürde bakılıyor. Personelin org'u tek kişilik olsa bile
 * (olamaz, ama veri öyle görünebilir) personelin kabuğu değişmez.
 */
export const shellHref = (actor: AuthActor, solo?: boolean): ShellHref => {
    if (actor !== 'manager') return '/personel';
    return solo ? '/tek' : '/mudur';
};

export function enterShell(actor: AuthActor, solo?: boolean): void {
    // `canDismiss` yığında kapatılacak bir şey kalmadığında false döner;
    // koşulsuz `dismissAll` orada hata atardı.
    if (router.canDismiss()) router.dismissAll();
    router.replace(shellHref(actor, solo));
}
