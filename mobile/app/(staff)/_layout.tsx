import { NativeTabs } from 'expo-router/unstable-native-tabs';
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
// minimizeBehavior: kaydırınca kabuk küçülür — tasarımdaki "küçülmüş hâl".

export default function StaffTabs() {
    const { c } = useTheme();
    return (
        <NativeTabs
            minimizeBehavior="onScrollDown"
            tintColor={c.or}
            labelVisibilityMode="labeled"
        >
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} />
                <NativeTabs.Trigger.Label>Bugün</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="customers">
                <NativeTabs.Trigger.Icon sf="person.2" />
                <NativeTabs.Trigger.Label>Müşteriler</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            {/* Performans sekmesi, işletme ayarı kapalıysa HİÇ render edilmez.
                Gri/kilitli bir sekme, personele patronunun ondan bir şey
                sakladığını söyler. Kapı sunucuda (staff-api → 403 'disabled');
                burada da gizlenmesi ikinci katman. */}
            <NativeTabs.Trigger name="performance">
                <NativeTabs.Trigger.Icon sf="chart.bar" />
                <NativeTabs.Trigger.Label>Performans</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="profile">
                <NativeTabs.Trigger.Icon sf="person.crop.circle" />
                <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
