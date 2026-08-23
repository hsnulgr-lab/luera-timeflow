import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
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
    return (
        <NativeTabs
            minimizeBehavior="never"
            tintColor={c.or}
            labelVisibilityMode="labeled"
        >
            <NativeTabs.Trigger name="index">
                <Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
                <Label>Bugün</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="calendar">
                <Icon sf="calendar" />
                <Label>Takvim</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="customers">
                <Icon sf="person.2" />
                <Label>Müşteriler</Label>
            </NativeTabs.Trigger>

            {/* Performans sekmesi, işletme ayarı kapalıysa HİÇ render edilmez.
                Gri/kilitli bir sekme, personele patronunun ondan bir şey
                sakladığını söyler. Kapı sunucuda (staff-api → 403 'disabled');
                burada da gizlenmesi ikinci katman. */}
            <NativeTabs.Trigger name="performance">
                <Icon sf="chart.bar" />
                <Label>Kazanç</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="profile">
                <Icon sf="person.crop.circle" />
                <Label>Profil</Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
