/**
 * Kabuk yığının TEK girdisi olur.
 *
 * `enterShell` girişte geçmişi siliyor ama bu, o an hangi yığında
 * olduğumuza bağlı: kimlik akışının kendi `Stack`'i var
 * (`app/(auth)/_layout.tsx`) ve `dismissAll` en yakın yığında çalışıyor.
 * Kökte `index` ve `(auth)` girdileri kalabiliyor, hatta bir önceki
 * oturumun kabuğu da orada durabiliyor — telefonda görülen buydu: geri
 * kaydırınca ALTTAN aynı ekranın ya da öteki rolün kopyası çıkıyordu.
 *
 * Bu kanca sebebi değil SONUCU garanti ediyor: kabuk ekrana geldiği anda
 * kök yığında ondan başka girdi bırakmıyor. Nasıl gelindiğinden bağımsız
 * çalışıyor — Fast Refresh'in yeniden kurduğu ağaçta da.
 */

import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

/**
 * `reset` React Navigation'ın kök parametre listesine göre tipleniyor ve o
 * liste burada `never`; rota adları çalışma zamanında dosya ağacından
 * geliyor. Tek gevşetilen yer bu.
 */
type RootNav = {
    getState(): { index: number; routes: { name: string; params?: object }[] } | undefined;
    reset(state: { index: number; routes: { name: string; params?: object }[] }): void;
};

/** Kök yığındaki kabuk rotalarının adları — `app/_layout.tsx` ile aynı. */
export type ShellName = 'mudur' | 'personel';

export function useShellIsRoot(shell: ShellName): void {
    // '/' kök düzeni: kabuklar onun çocukları.
    const root = useNavigation<RootNav>('/');

    useEffect(() => {
        const state = root.getState();
        if (!state || state.routes.length <= 1) return;
        const current = state.routes[state.index];
        if (!current) return;

        /*
         * KABUK EN ÜSTTE DEĞİLSE DOKUNULMUYOR — bu satır bir düzeltme.
         *
         * Önceki hâli `routes[state.index]`i koşulsuz koruyordu, yani "en
         * üstteki rota" ne ise onu. Ama kabuk, üstüne bir sayfa itildiğinde
         * SÖKÜLMÜYOR: sekmeler takılı kalıyor ve React Navigation yığın
         * durumu değişince gezinme nesnelerini yeniden ürettiği için kabuk
         * yeniden çiziliyor. Efektin bağımlılık dizisi de yok (Fast Refresh
         * için bilerek), dolayısıyla o çizimde tekrar koşuyordu.
         *
         * Sonuç: `[personel, kumanda]` yığını `[kumanda]`ya iniyordu —
         * kabuk kumandanın ALTINDAN siliniyordu. Telefonda görülen buydu:
         * kumandada "‹ Bugün"e basınca
         * `The action 'GO_BACK' was not handled by any navigator`.
         *
         * Kancanın işi kabuğu kök yapmak; en üstteki rotayı kök yapmak
         * değil. İkisi yalnız kabuk en üstteyken aynı şey.
         */
        if (current.name !== shell) return;

        // Kabuk korunuyor, altındaki her şey siliniyor.
        root.reset({ index: 0, routes: [{ name: current.name, params: current.params }] });
    });
}
