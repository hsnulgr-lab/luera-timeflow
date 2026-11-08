import { useEffect, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { normalizePhone, waLink } from '@/lib/phone';

// Bildirimlerin açtığı adresler (2026-11-08). Sunucu "/mesajlar" ve
// "/takvim?date=" yolluyordu; masaüstünde bu sayfalar yoktu ve tıklanan
// bildirim ana sayfaya düşüyordu. Telefon uygulaması bu adresleri kendi
// eşlemesiyle açar (mobile/src/lib/pushRoute.ts); burası yalnız masaüstü.

/** "/takvim?date=…" → takvim. */
export function TakvimYonlendir() {
    const { search } = useLocation();
    return <Navigate to={`/calendar${search}`} replace />;
}

/**
 * "/mesajlar?phone=905…" (müşteri sizinle görüşmek istiyor) → o numaranın
 * müşteri kartı. Numara müşteri listesinde yoksa Müşteriler açılır ve
 * WhatsApp'ta yazışmayı açan bir düğme gösterilir.
 */
export function MesajlarYonlendir() {
    const [params] = useSearchParams();
    const { orgId } = useAuth();
    const [to, setTo] = useState<string | null>(null);
    const phone = normalizePhone(params.get('phone'));

    useEffect(() => {
        if (!phone || !orgId) return;
        let alive = true;
        void (async () => {
            const local = phone.startsWith('90') ? phone.slice(2) : phone;
            const variants = [phone, `+${phone}`, `0${local}`, local];
            const { data } = await supabase.from('customers').select('id, is_active')
                .eq('organization_id', orgId).in('phone', variants).limit(10);
            if (!alive) return;
            const rows = (data ?? []) as { id: string; is_active?: boolean | null }[];
            const hit = rows.find((r) => r.is_active !== false) ?? rows[0];
            if (hit) { setTo(`/customers?open=${encodeURIComponent(hit.id)}`); return; }
            const link = waLink(phone);
            toast('Bu numara müşteri listenizde yok', {
                description: 'Asistan konuşmayı size devretti; WhatsApp\'tan yanıtlayabilirsiniz.',
                ...(link ? { action: { label: 'WhatsApp\'ta aç', onClick: () => window.open(link, '_blank', 'noopener') } } : {}),
                duration: 12_000,
            });
            setTo('/customers');
        })();
        return () => { alive = false; };
    }, [orgId, phone]);

    if (!phone) return <Navigate to="/customers" replace />;
    return to ? <Navigate to={to} replace /> : null;
}
