/**
 * Rol kapısı — müdür kabuğu personel oturumuyla, personel kabuğu müdür
 * oturumuyla çizilmesin.
 *
 * Asıl hata rota adlarının çakışmasıydı: `(manager)` ve `(staff)` birer GRUP
 * olduğu için URL'ye segment eklemiyorlardı ve `/calendar`, `/profile`, `/`
 * iki dosyaya birden denk geliyordu. Gruplar `mudur/` ve `personel/` diye
 * gerçek segmentlere çevrildi; bu kapı ise ikinci savunma hattı: adres bir
 * şekilde yanlış kabuğa düşerse ekran çizilmeden geri gönderiliyor.
 *
 * Oturum YOKSA engellenmiyor. Uygulamanın büyük kısmı hâlâ stub kimlikle
 * geziliyor ve orada oturum kaydı olmayabiliyor; olmayan bir bilgiye
 * dayanarak kullanıcıyı dışarı atmak, çözdüğünden çok şey kırardı.
 */

import { useEffect, useState } from 'react';
import { authApi, type AuthActor } from '../api/session';

export type GateState =
    /** Oturum henüz okunmadı — kabuk çizilmiyor, boş zemin duruyor. */
    | 'checking'
    /** Doğru kabuk ya da karar verecek bilgi yok. */
    | 'allowed'
    /** Oturum ötekine ait — çağıran taraf yönlendirmeli. */
    | 'wrong';

export function useActorGate(expected: AuthActor): GateState {
    const [state, setState] = useState<GateState>('checking');

    useEffect(() => {
        let alive = true;
        authApi.resume.get().then((result) => {
            if (!alive) return;
            if (!result.ok) { setState('allowed'); return; }
            setState(result.data.actor === expected ? 'allowed' : 'wrong');
        }).catch(() => { if (alive) setState('allowed'); });
        return () => { alive = false; };
    }, [expected]);

    return state;
}
