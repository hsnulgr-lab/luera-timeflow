import { useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useReservations } from './useReservations';

// Tahsil bekleyen adisyonlar — tamamlanmış ama henüz tahsil edilmemiş randevular.
// Masaüstü Kasa listesi ve sidebar rozeti bunu kullanır.
export function usePendingBills() {
    const { reservations } = useReservations();
    return useMemo(
        () => reservations.filter(r => r.status === 'completed' && !r.isPaid),
        [reservations],
    );
}

// Köprünün personel → masaüstü ayağı: personel mobilde hizmeti bitirip adisyonu
// kasaya gönderince (serviceEndedAt set) masaüstünde toast belirir.
// Yalnızca masaüstü kabuğunda (Layout) bir kez çağrılır.
// serviceEndedAt koşulu: manuel masaüstü "Tamamla" bunu set etmez → müdür kendi
// tamamladığı randevu için kendine bildirim almaz, sadece personelden geleni görür.
export function usePendingBillsAlert() {
    const bills = usePendingBills();
    const navigate = useNavigate();
    const seen = useRef<Set<string> | null>(null);

    useEffect(() => {
        const ids = new Set(bills.map(b => b.id));
        // İlk yüklemede mevcut adisyonlar için toast atma — sadece referansı doldur
        if (seen.current === null) { seen.current = ids; return; }
        for (const b of bills) {
            if (!seen.current.has(b.id) && b.serviceEndedAt) {
                const who = b.staffName ? `${b.staffName} · ` : '';
                toast(`💰 Adisyon kasada`, {
                    description: `${who}${b.customerName} · ${b.service}`,
                    action: { label: 'Kasaya git', onClick: () => navigate('/kasa') },
                    duration: 8000,
                });
            }
        }
        seen.current = ids;
    }, [bills, navigate]);
}
