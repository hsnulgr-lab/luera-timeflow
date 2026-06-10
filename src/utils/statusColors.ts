// Randevu durum renkleri — TEK KAYNAK (Dashboard, Takvim, Rezervasyonlar aynısını kullanır)
// Evrensel konvansiyon (müşterinin alıştığı): sarı=bekliyor, yeşil=onaylı,
// kırmızı=iptal, mavi=tamamlandı — ama krem temayla uyumlu yumuşak tonlarda.
export type ResStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export const STATUS_LABEL: Record<ResStatus, string> = {
  pending:   'Bekleyen',
  confirmed: 'Onaylı',
  cancelled: 'İptal',
  completed: 'Tamamlandı',
};

// Rozet (arka plan + metin) — Tailwind arbitrary class
export const STATUS_BADGE: Record<ResStatus, string> = {
  pending:   'bg-[#FCEFD6] text-[#A66A0E]', // amber — bekliyor ⏳
  confirmed: 'bg-[#E6F4EA] text-[#2E7D43]', // yeşil — onaylı ✓
  cancelled: 'bg-[#FCEAEA] text-[#C0392B]', // kırmızı — iptal ✗
  completed: 'bg-[#E8EFF9] text-[#2E6FB0]', // mavi — tamamlandı
};

// Renkli nokta (liste/takvim göstergesi)
export const STATUS_DOT: Record<ResStatus, string> = {
  pending:   'bg-[#E0A12E]',
  confirmed: 'bg-[#2E7D43]',
  cancelled: 'bg-[#C0392B]',
  completed: 'bg-[#2E6FB0]',
};
