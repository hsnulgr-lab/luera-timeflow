// Randevu durum renkleri — TEK KAYNAK (Dashboard, Takvim, Rezervasyonlar aynısını kullanır)
// Evrensel konvansiyon (müşterinin alıştığı): sarı=bekliyor, yeşil=onaylı,
// kırmızı=iptal, mavi=tamamlandı — ama krem temayla uyumlu yumuşak tonlarda.
export type ResStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export const STATUS_LABEL: Record<ResStatus, string> = {
  // 'pending' artık üretilmiyor; legacy kayıtlar 'Onaylı' gibi görünür.
  pending:   'Onaylı',
  confirmed: 'Onaylı',
  cancelled: 'İptal',
  completed: 'Tamamlandı',
};

// Rozet (arka plan + metin) — Tailwind arbitrary class
export const STATUS_BADGE: Record<ResStatus, string> = {
  pending:   'bg-[#E6F4EA] text-[#2E7D43]', // legacy → onaylı gibi
  confirmed: 'bg-[#E6F4EA] text-[#2E7D43]', // yeşil — onaylı ✓
  cancelled: 'bg-[#FCEAEA] text-[#C0392B]', // kırmızı — iptal ✗
  completed: 'bg-[#E8EFF9] text-[#2E6FB0]', // mavi — tamamlandı
};

// Renkli nokta (liste/takvim göstergesi)
export const STATUS_DOT: Record<ResStatus, string> = {
  pending:   'bg-[#2E7D43]',
  confirmed: 'bg-[#2E7D43]',
  cancelled: 'bg-[#C0392B]',
  completed: 'bg-[#2E6FB0]',
};

// Faz-duyarlı rozet — personel hizmete başlayınca (arrivedAt dolu, tamamlanmamış)
// "Hizmette" gösterir; diğer durumlar normal durum rozetine düşer.
// apptPhase ile aynı yaşam döngüsünü paylaşır (tek kaynak).
import type { Reservation } from '@/types';
import { apptPhase } from '@/lib/appointmentFlow';

export function phaseBadge(r: Pick<Reservation, 'status' | 'arrivedAt'>): { label: string; badge: string; dot: string } {
  const ph = apptPhase(r);
  if (ph === 'inService') {
    // Turuncu — "aktif/devam ediyor" hissi; bekleyen(amber) ve onaylı(yeşil)dan ayrışır
    return { label: 'Hizmette', badge: 'bg-[#FFE7D6] text-[#C2410C]', dot: 'bg-[#EA580C]' };
  }
  const map: Record<string, ResStatus> = { pending: 'pending', upcoming: 'confirmed', done: 'completed', cancelled: 'cancelled' };
  const s = map[ph] ?? 'confirmed';
  return { label: STATUS_LABEL[s], badge: STATUS_BADGE[s], dot: STATUS_DOT[s] };
}
