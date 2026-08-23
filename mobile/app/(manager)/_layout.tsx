import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

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
export default function ManagerLayout() {
    const { c } = useTheme();
    return (
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
                <Icon src={require('../../assets/tabs/akis.png')} />
                <Label>Akış</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="calendar">
                <Icon src={require('../../assets/tabs/takvim.png')} />
                <Label>Takvim</Label>
            </NativeTabs.Trigger>

            {/* "+" ortada, başparmağın doğal yerinde. Sekme gibi görünür ama
                işi bir ekranı açık tutmak değil, randevu oluşturmayı başlatmak. */}
            <NativeTabs.Trigger name="create">
                <Icon src={require('../../assets/tabs/randevu.png')} />
                <Label>Randevu</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="cash">
                <Icon src={require('../../assets/tabs/kasa.png')} />
                <Label>Kasa</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="profile">
                <Icon src={require('../../assets/tabs/profil.png')} />
                <Label>Profil</Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
