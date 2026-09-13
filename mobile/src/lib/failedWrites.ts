/**
 * Gönderilemeyen yazmaların EKRANA açılan ucu.
 *
 * Şekil ve dil `writeFailure.ts`te ve saf; depolama `api/staff.ts`te, kuyruğun
 * yanında. Burası yalnız okuma ve kabul etme.
 *
 * ── Neden yoklama ───────────────────────────────────────────────────────────
 * Kayıp ARKA PLANDA doğuyor: kuyruk uygulama öne dönünce ya da sinyal gelince
 * boşalıyor ve o an personel hangi ekranda olursa olsun. Bir olay yayını
 * kurmak yerine `useConnectivity`nin kuyruk sayacıyla aynı ritim kullanılıyor
 * — aynı dosyadan okunan iki şey için iki ayrı mekanizma, ikisinin bir gün
 * ayrışması demekti.
 */

import { useCallback, useEffect, useState } from 'react';

import { clearFailures, readFailures } from '../api/staff';
import type { WriteFailure } from './writeFailure.ts';

/** `useConnectivity` ile AYNI aralık: ikisi aynı depoyu yokluyor. */
const POLL_MS = 5000;

export interface FailedWrites {
    items: WriteFailure[];
    /** Personel gördü ve kabul etti — liste siliniyor. */
    accept: () => void;
}

export function useFailedWrites(): FailedWrites {
    const [items, setItems] = useState<WriteFailure[]>([]);

    useEffect(() => {
        let alive = true;
        const read = () => {
            readFailures()
                .then((list) => { if (alive) setItems(list); })
                .catch(() => { /* okunamazsa liste değişmez */ });
        };
        read();
        const id = setInterval(read, POLL_MS);
        return () => { alive = false; clearInterval(id); };
    }, []);

    const accept = useCallback(() => {
        // Ekran ÖNCE boşalıyor: kabul bir istek değil, bir okuma onayı.
        // Diskteki silme başarısız olursa liste bir sonraki yoklamada geri
        // gelir — kaybı unutmaktansa iki kez göstermek yeğ.
        setItems([]);
        void clearFailures().catch(() => undefined);
    }, []);

    return { items, accept };
}
