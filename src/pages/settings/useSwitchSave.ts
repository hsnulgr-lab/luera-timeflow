import { useEffect, useRef, useState } from 'react';

export type SwitchStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Anında kaydeden anahtar. `onToggle` sunucunun cevabını döndürür:
 *   true  → 2 sn "Kaydedildi ✓"
 *   false → kontrol eski hâline döner (değeri çağıran tutuyor, biz yalnız
 *           iyimser gösterimi geri alıyoruz) + satırda "Kaydedilemedi".
 * Sunucu onaylamadan "Kaydedildi" yazılmaz.
 */
export function useSwitchSave() {
    const [status, setStatus] = useState<SwitchStatus>('idle');
    const [pending, setPending] = useState<boolean | null>(null);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const run = async (next: boolean, save: (v: boolean) => Promise<boolean>) => {
        if (status === 'saving') return;
        window.clearTimeout(timer.current);
        setPending(next);
        setStatus('saving');
        let ok = false;
        try { ok = await save(next); } catch { ok = false; }
        setPending(null);
        if (ok) {
            setStatus('saved');
            timer.current = window.setTimeout(() => setStatus('idle'), 2000);
        } else {
            setStatus('error');
        }
    };
    return { status, pending, run };
}
