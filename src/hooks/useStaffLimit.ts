import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlement } from '@/hooks/useEntitlement';
import { requestPlanChange } from '@/hooks/useBilling';
import { confirmDialog } from '@/components/ConfirmDialog';
import { readOrgSolo } from '@/hooks/useOrgSolo';
import { planById, planChangeCopy, teamSize } from '@/lib/plans';

/**
 * Paketin personel sınırı (kullanıcı kararı 2026-10-22): Tek kişilik'te
 * tek çalışan işletme sahibinin kendisi; personel eklenmek istenince ekleme
 * yerine Ekip'e yükseltme sorulur, onaylanırsa paket hemen değişir ve ekleme
 * sürer. Sahip `teamSize` ile sayılır — Test B'de sahip + 1 personel "1"
 * sayılıyordu ve Tek kişilik alan salon personel ekleyebildi.
 *
 * Yalnız WEB (masaüstü ve telefon tarayıcısı). Telefon uygulamasında paket
 * konuşulamaz (Apple 3.1.1); orada Apple'a uygun yol (e-posta) ayrı iş.
 * Paketi olmayan işletme (kartsız telefon denemesi) sınırlanmaz.
 *
 * `active`: sayfanın zaten okuduğu aktif personel sayısı (useStaff her
 * çağrıda listeyi yeniden çeker; ikinci kez çekilmesin).
 */
export function useStaffLimit(active: number) {
    const { orgId } = useAuth();
    const ent = useEntitlement();
    const plan = planById(ent.plan);

    /** `adding` kişi daha eklenebilir mi; sınırdaysa yükseltme sorulur. */
    const ensureRoom = useCallback(async (adding = 1): Promise<boolean> => {
        if (!plan || plan.maxStaff == null || !ent.ok) return true;
        // Kip okunamazsa sahip ayrı sayılır: en kötü ihtimalle soru fazladan
        // çıkar, ücretsiz personel eklenmez.
        const solo = orgId ? await readOrgSolo(orgId) : null;
        if (teamSize(active, solo === true) + adding <= plan.maxStaff) return true;
        const team = planById('pro');
        const intro = `${plan.name} paketi yalnız sizin içindir. ${team?.name ?? 'Ekip'} paketinde personel sınırı yok; her biri telefonundaki uygulamadan kendi takvimini görür.`;
        // Kendi kendine değişebilen yalnız süren Dodo aboneliği; hediye ya da
        // askıdaki abonelikte yol destek.
        if (!ent.dodoManaged || (ent.effective !== 'trial' && ent.effective !== 'active')) {
            await confirmDialog({
                title: `Ekibinize kişi eklemek için ${team?.name ?? 'Ekip'} paketi gerekiyor`,
                description: `${intro} Paket değişikliği için destek@lueratech.com adresine yazın.`,
                confirmLabel: 'Tamam',
            });
            return false;
        }
        const cycle = ent.cycle === 'yearly' ? 'yearly' : 'monthly';
        const copy = planChangeCopy({ plan: plan.id, cycle }, { plan: 'pro', cycle }, ent.shownUntil, ent.effective === 'trial');
        const ok = await confirmDialog({
            title: `Ekibinize kişi eklemek için ${team?.name ?? 'Ekip'} paketi`,
            description: `${intro} ${copy.description}`,
            confirmLabel: copy.confirmLabel,
        });
        if (!ok) return false;
        const when = await requestPlanChange(orgId, 'pro', cycle);
        if (when !== 'now') return false;
        await ent.refresh();
        toast.success(`${team?.name ?? 'Ekip'} paketine geçtiniz`, { description: 'Artık ekibinize kişi ekleyebilirsiniz.' });
        return true;
    }, [plan, active, ent, orgId]);

    return { ensureRoom };
}
