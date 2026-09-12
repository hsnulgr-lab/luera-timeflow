/**
 * Oturumdaki personelin kimliği.
 *
 * Kumandadaki "sık kullandıkların" ızgarası bunu istiyor: sıklık ÖNCE kişinin
 * kendi geçmişinden, yoksa salonun geçmişinden kuruluyor
 * (`adisyon.ts` · frequentFor). Ekranda sabit bir `ME = 'merve'` duruyordu;
 * canlıda hiçbir kullanım satırıyla eşleşmediği için ızgara sessizce salon
 * moduna düşüyordu — kişinin kendi alışkanlığı hiç görünmüyordu.
 *
 * `null` "henüz bilinmiyor" demek, "kimse" değil: çağıran taraf o sürede
 * salon kaydına düşüyor ve kimlik gelince kendi kaydına geçiyor.
 */

import { useEffect, useState } from 'react';

import { authApi } from '../api/session';

export function useMyStaffId(): string | null {
    const [id, setId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        authApi.resume.get()
            .then((result) => {
                if (alive && result.ok) setId(result.data.profile.id);
            })
            .catch(() => undefined);
        return () => { alive = false; };
    }, []);

    return id;
}
