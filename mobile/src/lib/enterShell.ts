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

export const shellHref = (actor: AuthActor): '/mudur' | '/personel' =>
    (actor === 'manager' ? '/mudur' : '/personel');

export function enterShell(actor: AuthActor): void {
    // `canDismiss` yığında kapatılacak bir şey kalmadığında false döner;
    // koşulsuz `dismissAll` orada hata atardı.
    if (router.canDismiss()) router.dismissAll();
    router.replace(shellHref(actor));
}
