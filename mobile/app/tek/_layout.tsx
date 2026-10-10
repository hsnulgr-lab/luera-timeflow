import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { AuthSessionErrorScreen } from '../../src/components/ui';
import { ManagerDayProvider } from '../../src/state/managerDay';
import { useActorGate } from '../../src/lib/roleGate';
import { usePushIntent } from '../../src/lib/pushSetup';
import { useShellIsRoot } from '../../src/lib/shellRoot';
import { attachSoloTokenRefresher } from '../../src/lib/soloSession';
import { useTheme } from '../../src/theme';

/**
 * ÜÇÜNCÜ KABUK — tek kişilik işletme (108).
 *
 * Kullanan kişi hem sahip hem uygulayıcı ve BİLGİSAYARI YOK. Müdür kabuğu ona
 * olmayan bir ekibi soruyor ("kim yapacak", "Ayşe ile", personel şeridi),
 * personel kabuğu ise işletmeyi yönetemiyor. Bu kabuk ikisinin harmanı.
 *
 * ── Yeni tasarım değil, yeniden bileşim ─────────────────────────────────────
 * Sekme seti müdürünkiyle aynı sayıda ve aynı sırada; ekranlar müdür ve
 * personel ekranlarından alınıyor. Dördü ŞU AN müdür ekranının kendisini
 * çiziyor (`export { default }`), çünkü aralarındaki fark tek kişiye göre
 * kısmalardan ibaret ve o kısmalar ekranların içinde yapılıyor — ikinci bir
 * kopya açmak her düzeltmeyi iki yerde yapmak olurdu.
 *
 * Tasarım: `docs/design-reference/Luera Mobil - Tek Kisilik v4.html`
 * Brief: `docs/brief-tek-kisilik-isletme.md`
 *
 * ── Rol değil, MOD ──────────────────────────────────────────────────────────
 * Tek kişi veritabanında da müdür: org sahibi, `role = 'owner'`, RLS aynı.
 * Kapı o yüzden `manager` bekliyor ve ayrımı `solo` bayrağı yapıyor
 * (`organizations.solo`, 108). `AuthActor`a üçüncü bir değer eklemek rol
 * kapısını, bildirim kaydını ve oturum okumasını birden etkilerdi.
 *
 * ── Gerçek segment, grup DEĞİL ──────────────────────────────────────────────
 * `app/tek/` adrese segment ekliyor. Grup olsaydı (`(tek)`) içindeki
 * `calendar.tsx` ve `index.tsx`, müdür ve personelinkiyle aynı adrese düşerdi;
 * `tests/mobile-rota-cakismasi.test.mjs` tam da bunu kolluyor.
 */
export default function SoloLayout() {
    const { c } = useTheme();
    useShellIsRoot('tek');
    const gate = useActorGate('manager');
    usePushIntent('manager', gate.state === 'allowed');

    /*
     * KUMANDANIN ANAHTARI BU KABUKTA TAKILI (108 · Faz 2b).
     *
     * Kumanda dar personel API'si üzerinde ve o API `x-staff-token` istiyor;
     * sahibin elinde yalnız Supabase oturumu var. Tazeleyici takılıyken
     * `src/api/staff.ts` jeton yokken ya da eskidiğinde sunucudan sessizce
     * yenisini alıyor (`solo.session`).
     *
     * Burada, ekranda değil: Gün kumandayı açıyor ama Kasa ve ileride
     * tahsilat da aynı jetonu kullanacak. Sökülmesi şart — aynı uygulama
     * oturumunda kabuk değişebiliyor ve takılı kalan tazeleyici personel
     * kabuğundaki bir 401'de org oturumuna uzanmaya çalışırdı.
     *
     * Kapılardan ÖNCE çalışıyor ve bu zararsız: tazeleyici yalnız bir
     * istek 401 alınca çağrılıyor, kendi başına hiçbir şey yapmıyor.
     */
    useEffect(() => attachSoloTokenRefresher(), []);

    if (gate.state === 'checking') return <View style={{ flex: 1, backgroundColor: c.bg }} />;
    if (gate.state === 'wrong') return <Redirect href="/personel" />;
    if (gate.state === 'unreadable') return <AuthSessionErrorScreen onRetry={gate.retry} />;
    /*
     * EKİBİ OLAN BURAYA DÜŞMEZ — müdür kabuğundaki kapının aynadaki hâli.
     *
     * `false` yönlendiriyor, `undefined` YÖNLENDİRMİYOR: ilki "okuduk, tek
     * kişilik değil", ikincisi "bilmiyoruz". Bilmediğimiz bir şeye dayanarak
     * kullanıcıyı öteki kabuğa atmak, iki kapı arasında sonsuz bir gidiş
     * geliş üretebilirdi.
     */
    if (gate.solo === false) return <Redirect href="/mudur" />;

    return (
        <ManagerDayProvider>
        <NativeTabs
            minimizeBehavior="onScrollDown"
            tintColor={c.or}
            // ETİKETLER KALIYOR — personel kabuğundaki gerekçenin aynısı:
            // kitle 40–55 yaş ve bu ikonlar ezbere bilinmiyor.
            labelVisibilityMode="labeled"
        >
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/akis.png')} />
                <NativeTabs.Trigger.Label>Gün</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="calendar">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/takvim.png')} />
                <NativeTabs.Trigger.Label>Takvim</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="create">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/randevu.png')} />
                <NativeTabs.Trigger.Label>Randevu</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="cash">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/kasa.png')} />
                <NativeTabs.Trigger.Label>Kasa</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            {/* Müdürde "Profil", burada "İşletme": ekran aynı, satırların
                tamamı işletmeye ait ve "Personel" satırı çizilmiyor. */}
            <NativeTabs.Trigger name="isletme">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/profil.png')} />
                <NativeTabs.Trigger.Label>İşletme</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
        </NativeTabs>
        </ManagerDayProvider>
    );
}
