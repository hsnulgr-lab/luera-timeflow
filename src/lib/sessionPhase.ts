import type { Reservation } from '@/types';

// ── Seansın canlı yaşam döngüsü — TEK KAYNAK ────────────────────────────────
// Faz, yeni bir kolon değil; mevcut zaman damgalarından türetilir:
//   wait → (customerArrivedAt) arrived → (arrivedAt) active
//        → (serviceEndedAt) done → (status='completed') completed
// Dashboard'daki kabin ajandası ve Seans Takvimi aynı mantığı paylaşır; iki
// yerde ayrı türetme yapılırsa aynı randevu iki ekranda farklı faz gösterirdi.

export type SessionPhase = 'wait' | 'arrived' | 'active' | 'done' | 'completed';

export function phaseOf(r: Reservation): SessionPhase {
    // "İşlemi bitir" hem status'ü 'completed' yapıyor hem serviceEndedAt yazıyor
    // (advancePatch). Bu yüzden status kontrolü koşulsuz önce gelirse 'done'
    // fazına HİÇ düşülmez ve dashboard'daki "Kasada" sütunu hep boş kalır.
    // Doğrusu: hizmet bitti ama tahsilat yok → kasada; tahsilat da yapıldı → kapandı.
    if (r.status === 'completed') return r.isPaid ? 'completed' : 'done';
    if (r.serviceEndedAt) return 'done';
    if (r.arrivedAt) return 'active';
    if (r.customerArrivedAt) return 'arrived';
    return 'wait';
}

/** İki zaman damgası arasındaki dakika — negatif olmaz. */
export const minsSince = (iso: string, now: Date) =>
    Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));

/** Canlı sayaç metni: yalnız bekleyen ve işlemdeki seanslarda anlamlıdır. */
export function phaseTimer(r: Reservation, now: Date): string | null {
    const phase = phaseOf(r);
    if (phase === 'arrived' && r.customerArrivedAt) return `bekliyor ${minsSince(r.customerArrivedAt, now)} dk`;
    if (phase === 'active' && r.arrivedAt) return `işlemde ${minsSince(r.arrivedAt, now)} dk`;
    return null;
}

/** Faz ilerletme adımları — çubuktaki "Geldi → Başladı → Bitti" akışı. */
export const PHASE_ORDER: SessionPhase[] = ['wait', 'arrived', 'active', 'done', 'completed'];

/** Bir sonraki faza geçerken randevuya yazılacak alanlar. */
export function advancePatch(to: 'arrived' | 'active' | 'completed'): Partial<Reservation> {
    const stamp = new Date().toISOString();
    if (to === 'arrived') return { customerArrivedAt: stamp };
    if (to === 'active') return { arrivedAt: stamp, status: 'confirmed' };
    return { serviceEndedAt: stamp, status: 'completed' };
}
