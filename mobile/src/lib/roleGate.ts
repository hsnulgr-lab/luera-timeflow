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
 *
 * Ama oturum YOK ile oturum OKUNAMADI ayrı şeylerdir. Kapı eskiden ikisini
 * de `allowed` sayıyordu: depolama okunamadığında bir yetki kapısının
 * varsayılanı "izin ver" oluyordu. Okunamayan artık `unreadable` — ve
 * `wrong` DEĞİL: iki kabuk birbirine yönlendirdiği için (`/mudur` → `/personel`
 * → `/mudur`) okunamayan oturumu `wrong` saymak sonsuz bir döngü üretirdi.
 */

import { useEffect, useState } from 'react';
import { authApi, type AuthActor } from '../api/session';

export type GateState =
    /** Oturum henüz okunmadı — kabuk çizilmiyor, boş zemin duruyor. */
    | 'checking'
    /** Doğru kabuk ya da karar verecek bilgi yok. */
    | 'allowed'
    /** Oturum ötekine ait — çağıran taraf yönlendirmeli. */
    | 'wrong'
    /** Oturum OKUNAMADI. Yönlendirme değil, görünür bir duraklama. */
    | 'unreadable';

export function useActorGate(expected: AuthActor): { state: GateState; retry: () => void } {
    const [state, setState] = useState<GateState>('checking');
    /** Artınca etki yeniden çalışır — "tekrar dene" düğmesinin tek işi bu. */
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let alive = true;
        authApi.resume.get().then((result) => {
            if (!alive) return;
            if (result.ok) {
                setState(result.data.actor === expected ? 'allowed' : 'wrong');
                return;
            }
            // `no_session`: oturum gerçekten yok — yukarıdaki gerekçeyle geçilir.
            // `subscription_inactive`: oturum OKUNDU, yalnız abonelik bitmiş;
            //   rolü burada karşılaştıramıyoruz ama o kapı başka yerde (paywall)
            //   çalışıyor ve kabuğu burada durdurmak onu bozardı.
            // Geri kalan her şey: okunamadı.
            const readable = result.error === 'no_session' || result.error === 'subscription_inactive';
            setState(readable ? 'allowed' : 'unreadable');
        }).catch(() => { if (alive) setState('unreadable'); });
        return () => { alive = false; };
    }, [expected, attempt]);

    // Sıfırlama EFEKTTE değil burada: efektin içinde senkron `setState`
    // zincirleme render tetikler (react-hooks/set-state-in-effect). Olay
    // işleyicisinde aynı iş bedelsiz.
    const retry = () => {
        setState('checking');
        setAttempt((n) => n + 1);
    };

    return { state, retry };
}
