// Not: bu modüldeki runtime import'lar bilinçli olarak göreli — tests/*.test.mjs
// node'un tip sıyırma loader'ıyla çalışıyor ve '@/...' alias'ını çözemiyor.
import { apptPhase } from './appointmentFlow.ts';
import { phaseOf } from './sessionPhase.ts';
import type { Reservation } from '@/types';

export type KuaforStage = 'waiting' | 'service' | 'processing' | 'finish' | 'checkout';
export type KuaforLiveStage =
    | KuaforStage
    | 'pending'
    | 'confirmed'
    | 'missed'
    | 'completed'
    | 'cancelled';

/** Saat/tolerans gerektiren türetmeler için — 'missed' kararı buna bağlı. */
export interface KuaforStageOptions {
    now?: Date;
    toleranceMin?: number;
}

export const KF_STAGE_KEY = 'kf_stage';
export const KF_TIMER_KEY = 'kf_timer_end';
export const KF_FORMULA_KEY = 'kf_formula';

export const KUAFOR_COLOR_SERVICE_RE = /boya|renk|balyaj|r[öo]fle|ombre|somb?re|a[çc]ma|toner|me[çc]|perma|keratin|highlight|k[üu]ll[üu]/i;

export const isKuaforColorService = (name: string) => KUAFOR_COLOR_SERVICE_RE.test(name || '');
export const isKuaforWashUnit = (name: string, type?: string) => /y[ıi]kama|wash/i.test(`${name} ${type || ''}`);

/** Dashboard'un gerçek salon akışı. Salon dışındaki rezervasyon null döner. */
export function kuaforStageOf(reservation: Reservation): KuaforStage | null {
    const phase = phaseOf(reservation);
    if (phase === 'arrived') return 'waiting';
    if (phase === 'active') {
        const stage = reservation.customFields?.[KF_STAGE_KEY];
        if (stage === 'processing') return 'processing';
        if (stage === 'finish') return 'finish';
        return 'service';
    }
    if (phase === 'done') return 'checkout';
    return null;
}

/**
 * Liste/takvim rozetleri için salon dışı durumları da kapsayan tek görünüm.
 *
 * 'missed' (Gelmedi) türetilmiş durumdur ve kararı apptPhase verir — geç-kalma
 * toleransı orada tanımlı, burada ikinci kez uygulanmaz. Müşteri geç gelirse
 * (customerArrivedAt) randevu kendiliğinden salon akışına döner.
 */
export function kuaforLiveStageOf(reservation: Reservation, options?: KuaforStageOptions): KuaforLiveStage {
    if (reservation.status === 'cancelled') return 'cancelled';
    const salonStage = kuaforStageOf(reservation);
    if (salonStage) return salonStage;
    if (apptPhase(reservation, options) === 'missed') return 'missed';
    return reservation.status;
}
