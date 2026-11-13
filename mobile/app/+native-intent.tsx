import { router } from 'expo-router';

import { rememberIntent } from '../src/lib/pushIntent';
import { kumandaOnTopId, waitActivityTarget, waitTapMove } from '../src/lib/waitActivity';
import { arrivalActivityTarget } from '../src/lib/arrivalActivity';

/**
 * Sistemin verdiği adresler — YALNIZ iki Live Activity bağlantısı ele
 * alınıyor: bekleme sayacı (`luera://bekleme?…`) ve "Müşteri bekliyor"
 * (`luera://bekliyor?…`, 144). Geri kalan her adres OLDUĞU GİBİ geçiyor;
 * bu dosya yokken de aynısı oluyordu.
 *
 * Sayaca dokunmak bekleme bildirimine dokunmakla AYNI yere gidiyor: o işin
 * kumandası (`waitActivity.waitActivityTarget` → `pushRoute.pushTargetOf`).
 *   • soğuk açılış — doğrudan `/kumanda` açılsaydı oturum kapısı ve kabuk
 *     atlanırdı. Niyet saklanıyor, açılış köke gidiyor; kabuk yerleşince
 *     `usePushIntent` tüketiyor (bildirimle aynı yol, aynı TTL ve rol kuralı).
 *   • uygulama açıkken — kabuk zaten yerinde: doğrudan kumandaya. Önde bir
 *     kumanda varsa yenisi onun YERİNE geçer (üst üste binmez), aynı işse
 *     yerinde kalır (`waitTapMove`).
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
    try {
        const target = waitActivityTarget(path) ?? arrivalActivityTarget(path);
        if (!target) return path;
        if (initial) {
            rememberIntent({ href: target.href, actor: target.actor, at: Date.now() });
            return '/';
        }
        // Yönlendiricinin olayı bitmeden gezinilmiyor (`usePushIntent` ile aynı).
        setTimeout(() => {
            try {
                const move = waitTapMove(kumandaOnTopId(), target.id);
                if (move === 'replace') router.replace(target.href as never);
                else if (move === 'push') router.push(target.href as never);
            } catch (cause) {
                console.warn('bekleme sayacı: kumanda açılamadı', String(cause));
            }
        }, 0);
        return null;
    } catch {
        return path;
    }
}
