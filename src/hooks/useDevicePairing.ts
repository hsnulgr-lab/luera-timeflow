import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Personelin telefonunu işletmeye bağlamak için tek kullanımlık kod.
 *
 * Neden bu var: `device.pair` cihazın başına SAHİBİN geçmesini istiyor — ortak
 * tablet için doğru, kişisel telefon için değil. Sahibin beş personelin
 * telefonunda tek tek oturum açması, şifresini beş kişinin yanında girmesi
 * demek. Kod bu boşluğu kapatıyor: sahip burada üretir, personel telefonuna
 * yazar.
 *
 * Kod sunucuda AÇIK SAKLANMAZ; yalnız bu cevapta bir kez görünür. Ekrandan
 * kaybolursa yenisi üretilir — saklamaya çalışmaktan iyidir.
 */
export interface PairCode {
    code: string;
    expiresAt: number;
}

const FN = 'staff-api';

export function useDevicePairing(staffId: string | null) {
    const [code, setCode] = useState<PairCode | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const owner = useRef(staffId);

    // Başka bir personele geçilince önceki kod ekranda kalmasın: yanlış kişiye
    // okunan kod, o kişinin telefonunu başkasının adına bağlar.
    useEffect(() => {
        if (owner.current !== staffId) {
            owner.current = staffId;
            setCode(null);
            setError(null);
        }
    }, [staffId]);

    useEffect(() => {
        if (!code) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [code]);

    const secondsLeft = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
    const expired = Boolean(code) && secondsLeft === 0;

    const create = useCallback(async () => {
        if (!staffId || busy) return;
        setBusy(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(FN, {
                body: { action: 'device.code.create', staffId },
            });
            if (fnError || !data?.ok) {
                setError(data?.error === 'owner_required'
                    ? 'Kod üretmek için işletme sahibi olmanız gerekiyor.'
                    : 'Kod üretilemedi. Tekrar deneyin.');
                return;
            }
            setNow(Date.now());
            setCode({ code: String(data.code), expiresAt: new Date(data.expiresAt).getTime() });
        } catch {
            setError('Kod üretilemedi. Bağlantınızı kontrol edin.');
        } finally {
            setBusy(false);
        }
    }, [busy, staffId]);

    const clear = useCallback(() => { setCode(null); setError(null); }, []);

    return { code, secondsLeft, expired, busy, error, create, clear };
}
