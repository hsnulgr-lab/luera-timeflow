/**
 * Salonun KVKK aydınlatma metni adresi — kim sorarsa sorsun TEK yol.
 *
 * Müdürde canlı: `organizations.kvkk_url` (081). Personelin Supabase oturumu
 * yok ve `staff-api` bu alanı dönmüyor; personelde `null` — satır çizilmez,
 * uydurulmaz. Sahte kaynaktaki (`salonSettings.readKvkkUrl`) sabit `null` ile
 * aynı sonuç, ama müdür için artık gerçek.
 *
 * Okunamazsa da `null`: bu satır bir bağlantı, bir iddia değil. Olmayan bir
 * bağlantıyı göstermemek, "metin yok" DEMEK değildir.
 */

import { authApi, LIVE_AUTH } from '../api/session';
import { readKvkkUrl as readStubKvkkUrl } from './salonSettings';
import { fetchKvkkUrl } from './managerSource';

export async function readKvkkUrl(): Promise<string | null> {
    if (!LIVE_AUTH) return readStubKvkkUrl();
    const resumed = await authApi.resume.get().catch(() => null);
    if (!resumed?.ok || resumed.data.profile.actor !== 'manager') return null;
    return fetchKvkkUrl().catch(() => null);
}
