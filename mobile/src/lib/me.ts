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
import { tokens } from '../api/staff';

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

/**
 * Kanca — `myStaffId()` ile AYNI sözleşme.
 *
 * Eskiden `profile.id`yi koşulsuz döndürüyordu ve müdür oturumunda o bir
 * Supabase KULLANICI kimliği, `staff.id` değil. Önemsizdi çünkü kancayı tek
 * kullanan kumanda personel kabuğuna aitti. 108'le kumanda tek kişilik
 * kabuktan da açılıyor ve orada oturum müdür oturumu: kanca yanlış bir
 * kimliği doğru kimlik gibi veriyordu.
 *
 * Tek kişilikte doğru cevap sunucudan geliyor: `solo.session` jetonu
 * basarken personel satırının kimliğini de söylüyor ve o saklanıyor
 * (`tokens.soloStaffId`). Ne o var ne personel oturumu varsa `null` —
 * "bilinmiyor", ve çağıran taraf salon geneline düşüyor.
 *
 * ── Kanca ile FONKSİYON burada AYRIŞIYOR, bilerek ───────────────────────────
 * Yukarıdaki `myStaffId()` müdür oturumunda hâlâ `null` dönüyor ve öyle
 * kalmalı: onu BİLDİRİM KAYDI çağırıyor (`syncPush`) ve orada bir kimlik
 * döndürmek, tek kişilik sahibin cihazını hem müdür hem personel kanalına
 * kaydetmek olurdu — aynı bildirimi iki kez alırdı.
 *
 * Bu kanca ise yalnız kumandanın "sık kullandıkların" ızgarasını besliyor;
 * oradaki kimlik bir yazma değil, bir arama anahtarı.
 */
export function useMyStaffId(): string | null {
    const [id, setId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        void (async () => {
            try {
                const result = await authApi.resume.get();
                if (result.ok && result.data.actor === 'staff') {
                    if (alive) setId(result.data.profile.id);
                    return;
                }
                // Müdür oturumu: kimlik oturumda değil, jetonun yanında.
                const solo = await tokens.soloStaffId();
                if (alive) setId(solo);
            } catch {
                /* okunamadıysa `null` kalıyor — uydurulmuyor */
            }
        })();
        return () => { alive = false; };
    }, []);

    return id;
}
