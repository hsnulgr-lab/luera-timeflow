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

// Duyurulmuş adisyonlar tarayıcıda saklanır: sayfa yenilenince aynı adisyon
// "yeni gelmiş" gibi tekrar duyurulmasın. Org bazlı, çünkü aynı tarayıcıda
// başka bir işletmeye geçilebiliyor.
const seenKey = (orgId: string | null | undefined) => `pendingBillsSeen:${orgId ?? 'anon'}`;

function readSeen(orgId: string | null | undefined): Set<string> {
    try {
        const raw = localStorage.getItem(seenKey(orgId));
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
}

function writeSeen(orgId: string | null | undefined, ids: Set<string>) {
    // Yalnız hâlâ bekleyen adisyonların id'si saklanır → liste kendi kendini budar
    try { localStorage.setItem(seenKey(orgId), JSON.stringify([...ids])); } catch { /* kota dolu */ }
}

// Personelden geleni "taze" sayma penceresi. Müdür bir süre uygulamayı açmadıysa
// dönüşte eski adisyonlar için toast yağmuruna tutulmasın.
const FRESH_MIN = 20;

const fmtTL = (n: number) => `₺${n.toLocaleString('tr-TR')}`;

// Köprünün personel → masaüstü ayağı: personel mobilde hizmeti bitirip adisyonu
// kasaya gönderince (serviceEndedAt set) masaüstünde bildirim belirir.
// Yalnızca masaüstü kabuğunda (Layout) bir kez çağrılır.
// serviceEndedAt koşulu: manuel masaüstü "Tamamla" bunu set etmez → müdür kendi
// tamamladığı randevu için kendine bildirim almaz, sadece personelden geleni görür.
export function usePendingBillsAlert() {
    const bills = usePendingBills();
    const { settings, isLoading, orgId } = useReservations();
    const navigate = useNavigate();
    const ready = useRef(false);

    useEffect(() => {
        // Veri gelmeden karar verme. Eskiden bu kontrol yoktu: ilk render'da
        // liste boşken "görülenler" boş kaydediliyor, SWR'ın ikinci dalgası
        // gelince tüm adisyonlar yeni sanılıp her yenilemede toast atılıyordu.
        if (isLoading || !orgId) return;

        const seen = readSeen(orgId);
        const current = new Set(bills.map(b => b.id));

        // İlk geçişte yalnız referansı tazele — mevcut adisyonlar duyurulmaz.
        if (!ready.current) {
            ready.current = true;
            writeSeen(orgId, current);
            return;
        }

        const priceOf = (svc: string) => settings.services?.find(s => s.name === svc)?.price || 0;
        const totalOf = (b: typeof bills[number]) =>
            priceOf(b.service) + (b.adisyonItems || []).reduce((s, a) => s + a.price, 0);

        const freshLimit = Date.now() - FRESH_MIN * 60_000;
        const fresh = bills.filter(b =>
            !seen.has(b.id)
            && b.serviceEndedAt
            && new Date(b.serviceEndedAt).getTime() >= freshLimit);

        if (fresh.length > 0) {
            // Uygulamanın toast dili tek satır başlık + tek satır açıklama
            // (App.tsx'teki Toaster global biçimi). Kendi kartını çizmek dar
            // alanda başlığı ve tutarı ortadan bölüyordu — yerel biçim kullan.
            const sum = fresh.reduce((s, b) => s + totalOf(b), 0);
            const money = sum > 0 ? ` · ${fmtTL(sum)}` : '';

            const title = fresh.length > 1
                ? `💰 ${fresh.length} adisyon kasada${money}`
                : `💰 Adisyon kasada${money}`;

            const description = fresh.length > 1
                ? fresh.map(b => b.customerName).join(', ')
                : [fresh[0].staffName, fresh[0].customerName, fresh[0].service]
                    .filter(Boolean).join(' · ');

            toast(title, {
                description,
                action: { label: 'Kasaya git', onClick: () => navigate('/kasa') },
                duration: 8000,
            });
        }

        writeSeen(orgId, current);
    }, [bills, isLoading, orgId, settings, navigate]);
}
