/**
 * Bildirime dokunuldu ama HENÜZ GİDİLEMEZ — niyeti tut, sırası gelince tüket.
 * Saf karar katmanı, React'siz.
 *
 * ── Neden bekletiliyor ──────────────────────────────────────────────────────
 * Bildirime dokunma anı ile ekranın gidilebilir olma anı AYNI DEĞİL. Uygulama
 * kapalıyken dokunulduğunda sırayla şunlar oluyor: açılış → oturum okuma →
 * rol kapısı → kabuğun yerleşmesi. Bu zincirde iki tuzak var ve ikisi de
 * yaşandı:
 *
 *   1. `roleGate` oturumu okurken `checking` hâlinde ve yanlış rolü
 *      `<Redirect>` ile öteki kabuğa atıyor. O sırada gidilen hedef kayboluyor.
 *   2. `enterShell` yığını `dismissAll()` + `replace` ile sıfırlıyor,
 *      `shellRoot` da kabuğu köke çekiyor. Erken yapılan bir gezinme bu
 *      sıfırlamalarla siliniyor.
 *
 * Çözüm: dokunma anında GİDİLMİYOR, yalnız yazılıyor. Kabuk yerleşip rol
 * belli olunca tüketiliyor.
 *
 * ── Neden TTL var ───────────────────────────────────────────────────────────
 * Bildirime basıp on dakika sonra şifresini giren birini bir yere ışınlamak,
 * hiçbir şey yapmamaktan kötü: o kişi artık başka bir iş yapıyor.
 */

import type { PushActor } from './pushRoute.ts';

export interface PushIntent {
    href: string;
    actor: PushActor;
    at: number;
}

/** Bu kadar beklemiş bir niyet düşer. */
export const INTENT_TTL_MS = 120_000;

let pending: PushIntent | null = null;

export function rememberIntent(intent: PushIntent): void {
    pending = intent;
}

/**
 * Niyeti okur ve SİLER — bir kez tüketilir.
 *
 * Yeniden çizim ikinci kez gezinmesin diye silme okuma ile aynı adımda.
 * Rol uyuşmuyorsa niyet DÜŞER: personele gelen bir bildirim müdür kabuğunda
 * tüketilmemeli, çünkü hedefi o kabukta başka bir ekran olabilir.
 */
export function takeIntent(actor: PushActor, now: number): string | null {
    const found = pending;
    if (!found) return null;
    pending = null;
    if (found.actor !== actor) return null;
    if (now - found.at > INTENT_TTL_MS) return null;
    return found.href;
}

/** Çıkışta ve salon değişiminde: bekleyen hedef başka bir oturuma taşınmasın. */
export function forgetIntent(): void {
    pending = null;
}

/** Yalnız test ve teşhis için — tüketmeden bakar. */
export function peekIntent(): PushIntent | null {
    return pending;
}
