/**
 * Müdür kimliğini kanıtladıktan SONRA nereye gider — tek yerde.
 *
 * Dört kapı buraya düşüyor: B1 e-postayla giriş, B1 Apple/Google, S3 yeni
 * şifre (karar 5: normal girişin yolu) ve kayıtta zaten hesabı çıkan kişi
 * (K1 · karar 2 / K4). Her kapı kendi kopyasını yazsaydı biri "Hangi
 * işletme?"yi, öteki abonelik kapısını unuturdu.
 *
 *   0 işletme → B5 köprüsü ("Bu hesapla bir işletme bulamadık")
 *   1 işletme → seçilir; Face ID teklifi ya da (kayıttan geldiyse) doğrudan içeri
 *   çok       → "Hangi işletme?" (karar 4)
 */

import type { useRouter } from 'expo-router';

import { authApi, type AuthBusiness } from '../api/session';
import { enterShell } from './enterShell';
import { queueLoginNotice, type LoginNoticeKind } from './loginNotice';

type Router = ReturnType<typeof useRouter>;

export async function continueManager(
    router: Router,
    businesses: AuthBusiness[],
    options: {
        /** Face ID teklifi gösterilsin mi — kayıt kapısından gelende yok (K4 akışı). */
        offer: boolean;
        /** Kayıttan gelip zaten hesabı olan kişiye içeride söylenecek not. */
        notice?: LoginNoticeKind;
    },
): Promise<void> {
    if (options.notice) queueLoginNotice(options.notice);
    if (businesses.length === 0) {
        router.push('/(auth)/manager/bridge');
        return;
    }
    if (businesses.length > 1) {
        router.push('/(auth)/manager/business');
        return;
    }
    const selected = await authApi.manager.selectBusiness(businesses[0].id);
    if (!selected.ok) {
        if (selected.error === 'subscription_inactive') router.replace('/(auth)/locked');
        return;
    }
    if (options.offer) router.push('/(auth)/biometric');
    else enterShell(selected.data.actor, selected.data.profile.business.solo);
}
