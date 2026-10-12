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

import { createContext, useContext, useEffect } from 'react';
import { useNavigation, useRoute } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';

import { shellBeneath } from './shellBeneath';

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
export type ShellName = 'mudur' | 'personel' | 'tek';

/**
 * Kabuğun sekmelerini saran bağlam. Yalnız `app/tek/_layout.tsx` takıyor:
 * sorulan tek soru "tek kişilik mi" ve öbür iki kabukta cevap zaten hayır.
 */
const ShellContext = createContext<ShellName | null>(null);
export const ShellScope = ShellContext.Provider;

/**
 * Ekran TEK KİŞİLİK kabukta mı — ya da onun ÜSTÜNE itilmiş mi (108)?
 *
 * Birkaç ekran iki kabukta ortak: müdürün Akış'ı tek kişilikte Gün, Profil'i
 * İşletme oluyor. Aralarındaki fark birkaç satırın çizilip çizilmemesi; ayrı
 * dosya açmak her düzeltmeyi iki yerde yapmak olurdu.
 *
 * Cevap OTURUMDAN DEĞİL YERDEN okunuyor: oturumu yeniden okusaydık ilk
 * karede mod bilinmezdi ve ekip satırları bir an görünüp kaybolurdu. Kabuk
 * zaten `solo` bayrağına bakan bir kapının arkasında — yani "tek kabuktayım"
 * demek, "bu işletme tek kişilik" demenin ta kendisi.
 *
 * ── ADRES DEĞİL, YER — bu bir düzeltme ──────────────────────────────────────
 * İlk hâli `useSegments()[0] === 'tek'` idi. `useSegments` GENEL adresi
 * okuyor: kumanda ya da randevu detayı açılınca adres `(staff-flow)/…`
 * oluyor ve alttaki sekmeler — sökülmeden yerinde duran ve yığın değişince
 * yeniden çizilen sekmeler — o çizimde kendini EKİP ekranı sanıyordu. Geri
 * kaydırırken, modalın arkasında ve geçiş boyunca Takvim personel başlığını,
 * İşletme "Personel" satırını, Kasa "X verdi"yi gösteriyordu. Üstüne itilen
 * sayfalar ise hiç bilemiyordu.
 *
 * Şimdi iki kaynak, ikisi de yerinden kıpırdamıyor:
 *   • Sekme, kabuğun bağlamını okur (`ShellScope`) — üstüne ne itilirse
 *     itilsin değişmez.
 *   • Kök yığına itilmiş sayfa, altındaki en yakın kabuğa bakar
 *     (`shellBeneath`) — kumandanın üstündeki müşteri dosyası da dahil.
 */
export function useInSoloShell(): boolean {
    const inside = useContext(ShellContext);
    const { key } = useRoute();
    const beneath = useNavigationState((state) => shellBeneath(state.routes, key));
    return (inside ?? beneath) === 'tek';
}

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
