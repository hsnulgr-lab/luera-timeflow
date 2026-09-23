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

/**
 * Kanca olmayan yol — arka plan işleri için (`backgroundSync` · bildirim jetonu).
 *
 * MÜDÜR OTURUMUNDA `null` DÖNER, bilerek: müdürün `profile.id`si bir Supabase
 * kullanıcı kimliği, `staff.id` DEĞİL. Onu personel jetonuna kaydetmek, o
 * cihaza başka birinin bildirimlerini göndermek demekti.
 */
export async function myActor(): Promise<'manager' | 'staff' | null> {
    try {
        const result = await authApi.resume.get();
        return result.ok ? result.data.actor : null;
    } catch {
        return null;
    }
}

export async function myStaffId(): Promise<string | null> {
    try {
        const result = await authApi.resume.get();
        if (!result.ok || result.data.actor !== 'staff') return null;
        return result.data.profile.id;
    } catch {
        return null;
    }
}

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
