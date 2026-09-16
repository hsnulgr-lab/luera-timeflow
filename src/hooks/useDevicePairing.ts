import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * EKİP KODU — personelin telefonunu işletmeye bağlamak için (099).
 *
 * Müdür kararı: tek kod, bütün ekip. Kod 15 dakika geçerli; personel yazar,
 * telefonda listeden kendini seçer ve şifresini KENDİSİ belirler. Eskiden kod
 * kişi başına ve tek kullanımlıktı: beş personel = beş ayrı kod.
 *
 * Aynı kod müdürün telefonundan da üretilebiliyor (Profil → Personel); yenisi
 * hangi cihazdan üretilirse üretilsin eskisini kapatır.
 *
 * Kod sunucuda AÇIK SAKLANMAZ; yalnız bu cevapta bir kez görünür. Ekrandan
 * kaybolursa yenisi üretilir — saklamaya çalışmaktan iyidir.
 */
export interface PairCode {
    code: string;
    expiresAt: number;
}

const FN = 'staff-api';

async function errorCodeOf(fnError: unknown): Promise<string | null> {
    const context = (fnError as { context?: { json?: () => Promise<unknown> } } | null)?.context;
    const body = context?.json ? await context.json().catch(() => null) : null;
    return (body as { error?: string } | null)?.error ?? null;
}

export function useDevicePairing() {
    const [code, setCode] = useState<PairCode | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!code) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [code]);

    const secondsLeft = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
    const expired = Boolean(code) && secondsLeft === 0;

    const create = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(FN, {
                body: { action: 'device.code.create' },
            });
            if (fnError || !data?.ok) {
                const reason = data?.error ?? await errorCodeOf(fnError);
                setError(reason === 'owner_required'
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
    }, [busy]);

    const clear = useCallback(() => { setCode(null); setError(null); }, []);

    return { code, secondsLeft, expired, busy, error, create, clear };
}

/**
 * Personelin şifresini SIFIRLA (099) — müdür yeni şifre yazmıyor; personel bir
 * sonraki girişte yenisini telefonundan kendisi belirliyor. Açık oturumları
 * anında düşer (082 tetikleyicisi).
 */
export async function resetStaffPin(staffId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
        const { data, error: fnError } = await supabase.functions.invoke(FN, {
            body: { action: 'staff.pin.reset', staffId },
        });
        if (!fnError && data?.ok) return { ok: true };
        const reason = data?.error ?? await errorCodeOf(fnError);
        return {
            ok: false,
            message: reason === 'owner_required'
                ? 'Şifreyi yalnız işletme sahibi sıfırlayabilir.'
                : 'Şifre sıfırlanamadı. Tekrar deneyin.',
        };
    } catch {
        return { ok: false, message: 'Şifre sıfırlanamadı. Bağlantınızı kontrol edin.' };
    }
}
