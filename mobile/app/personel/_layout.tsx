import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { AuthSessionErrorScreen } from '../../src/components/ui';
import { useActorGate } from '../../src/lib/roleGate';
import { useShellIsRoot } from '../../src/lib/shellRoot';
import { useTheme } from '../../src/theme';

// Personel sekme seti — tasarım: "Kabuk 01 — Tab bar · personel seti".
//
// NativeTabs kullanılıyor, kendi tab bar'ımızı çizmiyoruz: iOS 26'da bu
// bileşen gerçek Liquid Glass materyalini, iOS 18'de klasik tab bar'ı,
// Android'de Material 3'ü kendiliğinden veriyor. Taklit etmek, üç platformda
// üç kez yanlış yapmak olurdu.
//
// ETİKETLER KALIYOR. Instagram sekmelerini etiketsiz bırakabiliyor çünkü
// milyarlarca insan o ikonları ezbere biliyor; "Performans" ikonunu kimse
// bilmiyor ve kitlemiz 40–55 yaş.
//
// Tab bar her zaman tam, etiketli iOS kabuğu olarak kalır.

export default function StaffTabs() {
    const { c } = useTheme();
    // Kabuk kök yığının TEK girdisi olur: altında geri dönülecek bir
    // ekran kalmıyor. Bkz. `src/lib/shellRoot.ts`.
    useShellIsRoot('personel');
    // Ve yanlış rolün oturumuyla açıldıysa sekmeler hiç çizilmeden
    // geri gönderiliyor. Bkz. `src/lib/roleGate.ts`.
    const gate = useActorGate('staff');
    if (gate.state === 'checking') return <View style={{ flex: 1, backgroundColor: c.bg }} />;
    if (gate.state === 'wrong') return <Redirect href="/mudur" />;
    // Bkz. müdür kabuğu: okunamayan oturum yönlendirilmez, görünür durur.
    if (gate.state === 'unreadable') return <AuthSessionErrorScreen onRetry={gate.retry} />;
    return (
        <NativeTabs
            minimizeBehavior="never"
            tintColor={c.or}
            labelVisibilityMode="labeled"
        >
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
                <NativeTabs.Trigger.Label>Bugün</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="calendar">
                <NativeTabs.Trigger.Icon sf="calendar" />
                <NativeTabs.Trigger.Label>Takvim</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="customers">
                <NativeTabs.Trigger.Icon sf="person.2" />
                <NativeTabs.Trigger.Label>Müşteriler</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            {/* KAZANÇ SEKMESİ KALKTI (2026-09-05, kullanıcı kararı) ve ekran
                2026-09-14'te SİLİNDİ.

                Sekmeden çıktıktan sonra dosya bir süre durdu; deep-link ile
                hâlâ açılıyor ve baştan sona uydurma veri çiziyordu (`₺4.010`,
                sabit çubuklar). Geçmişte duruyor, gerektiğinde `git show`
                geri getirir.

                İki sebep üst üste bindi. Birincisi, gösterdiği tutar
                personelin ELİNE GEÇEN para değil, yaptığı işlerin salon
                cirosuydu ve ekran onu "Kazanç" diye adlandırıyordu.

                DÜZELTME (2026-09-14): "prim alanı yok" diye yazılıydı, YANLIŞ.
                `073_staff_commission.sql` `staff.commission_rate`i açmış
                (0–100, varsayılan 0) ve `027` ile `payments.staff_id` de var.
                Yani ekranı öldüren gerekçe teknik değil: oran GİRİLİ DEĞİLSE
                gösterilecek bir prim yok. "İşlerim" geri geldiğinde payı
                yalnız oran > 0 iken çizmeli; sıfırda o satır hiç kurulmamalı.

                İkincisi, sekme
                `staff_can_see_revenue` ile koşulluydu ve varsayılan KAPALI:
                çoğu salonda kabuk dört sekme, ayarı açanda beş oluyordu.
                Sekme çubuğu değişken olamaz.

                Prim kararı verilince (bkz. `docs/personel-yapilacaklar.md`
                E3) ekran Profil'de "İşlerim" satırı olarak geri gelir. */}

            <NativeTabs.Trigger name="profile">
                <NativeTabs.Trigger.Icon sf="person.crop.circle" />
                <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
