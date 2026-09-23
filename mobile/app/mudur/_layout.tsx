import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { AuthSessionErrorScreen } from '../../src/components/ui';
import { ManagerDayProvider } from '../../src/state/managerDay';
import { useActorGate } from '../../src/lib/roleGate';
import { usePushIntent } from '../../src/lib/pushSetup';
import { useShellIsRoot } from '../../src/lib/shellRoot';
import { useTheme } from '../../src/theme';

/**
 * Müdür modu — "cep masaüstü".
 *
 * Personel modu bir kumandaydı: az şey, üç dokunuş, yalnız kendi günü. Burası
 * tam erişim: randevu oluşturur, taşır, siler, personelini değiştirir.
 *
 * KABUK PERSONELLE AYNI. Tasarım belgesi yüzen, kenarlara değmeyen bir cam hap
 * çiziyordu; denendi ve BIRAKILDI. Sebep biçimsel değil teknik: gerçek Liquid
 * Glass yalnız sistemin çizdiği tab bar'a veriliyor. Barı hap yapmak için elle
 * çizince materyal opak yedeğine düşüyor ve cam donuk bir yüzeye dönüyor —
 * yani biçimi seçmek materyali kaybetmek demek.
 *
 * NativeTabs ise iOS 26'da gerçek Liquid Glass'ı, iOS 18'de klasik barı,
 * Android'de Material 3'ü kendiliğinden veriyor. Kenardan kenara duruşu da
 * zaten istenen şey.
 */
/**
 * SDK 57 tuzağı — `renderingMode="template"` KALDIRILAMAZ.
 *
 * expo-router ikonu iki kez çeviriyor (normal ve seçili) ve kipi RENGE
 * bakarak seçiyor: `renderingMode ?? (iconColor !== undefined ? 'template'
 * : 'original')`. `tintColor` yalnız SEÇİLİ hâle renk verdiği için normal
 * ikon `imageSource`, seçili ikon `templateSource` oluyor ve
 * react-native-screens ikisinin aynı tipte olmasını şart koşuyor:
 * "[RNScreens] icon and selectedIcon must be same type." Ekran açılmıyor.
 *
 * Kipi açıkça yazmak ikisini de `templateSource` yapıyor — istediğimiz de
 * bu: turuncu tint ancak şablon ikonu boyayabiliyor. Personel tarafı SF
 * Symbol kullandığı için bu tuzağa düşmüyor.
 */
export default function ManagerLayout() {
    const { c } = useTheme();
    // Kabuk kök yığının TEK girdisi olur: altında geri dönülecek bir
    // ekran kalmıyor. Bkz. `src/lib/shellRoot.ts`.
    useShellIsRoot('mudur');
    // Ve yanlış rolün oturumuyla açıldıysa sekmeler hiç çizilmeden
    // geri gönderiliyor. Bkz. `src/lib/roleGate.ts`.
    const gate = useActorGate('manager');
    // Bkz. personel kabuğu: hedef kapı geçilene kadar bekliyor (103).
    // Müdüre bildirim Tur 2'de açılıyor; yol şimdiden doğru kurulu.
    usePushIntent('manager', gate.state === 'allowed');
    if (gate.state === 'checking') return <View style={{ flex: 1, backgroundColor: c.bg }} />;
    if (gate.state === 'wrong') return <Redirect href="/personel" />;
    // Okunamayan oturum ÖTEKİ KABUĞA gönderilmiyor: personel kabuğu da aynı
    // hatayı alır ve ikisi birbirine yönlendirip döngüye girerdi.
    if (gate.state === 'unreadable') return <AuthSessionErrorScreen onRetry={gate.retry} />;
    /*
     * Günün canlı verisi YALNIZ burada, rol kapısının ARKASINDA.
     *
     * Kökteyken personel telefonunu da sarıyordu: canlı okumayla her personel
     * cihazı yirmi beş saniyede bir, oturumu olmadığı için reddedilecek bir
     * müdür sorgusu atardı. Akış, Kasa ve randevu oluşturma üçü de bu
     * sekmelerin içinde — ortak veri onlara yetiyor.
     */
    return (
        <ManagerDayProvider>
        <NativeTabs
            // Tasarım: kaydırınca bar 66 → 52 pt'ye daralır. Personel
            // tarafında bilerek "never" — orada kumandanın tek büyük butonu
            // her an erişilebilir kalmalı. Müdür uzun akış kaydırıyor; barın
            // küçülmesi ekranı ona geri veriyor.
            minimizeBehavior="onScrollDown"
            tintColor={c.or}
            labelVisibilityMode="labeled"
        >
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/akis.png')} />
                <NativeTabs.Trigger.Label>Akış</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="calendar">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/takvim.png')} />
                <NativeTabs.Trigger.Label>Takvim</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            {/* "+" ortada, başparmağın doğal yerinde. Sekme gibi görünür ama
                işi bir ekranı açık tutmak değil, randevu oluşturmayı başlatmak. */}
            <NativeTabs.Trigger name="create">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/randevu.png')} />
                <NativeTabs.Trigger.Label>Randevu</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="cash">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/kasa.png')} />
                <NativeTabs.Trigger.Label>Kasa</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="profile">
                <NativeTabs.Trigger.Icon renderingMode="template" src={require('../../assets/tabs/profil.png')} />
                <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
        </NativeTabs>
        </ManagerDayProvider>
    );
}
