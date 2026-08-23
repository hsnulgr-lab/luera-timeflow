import { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useTheme } from '../../src/theme';

/**
 * "+" sekmesi — bir ekran değil, bir DÜĞME.
 *
 * Randevu oluşturma akışı sekmelerin dışında yaşıyor (bkz.
 * `(manager-flow)/randevu-olustur`): sistem sekme çubuğu akışın yüzen özet
 * çubuğunu yutuyordu ve tasarımın hiçbir karesinde sekme çubuğu yok.
 *
 * Bu sekme her odaklanışında akışı açar — koşulsuz. Daha önce bir "zaten
 * açıldı" bayrağı vardı ve akış kapanınca sekme boş siyah bir ekran olarak
 * kalıyordu. Koşul kaldırıldı: bu ekranın görünür bir hâli yok, dolayısıyla
 * boş kalması da mümkün değil. Akış kapanırken kendi nereye gideceğini
 * söylüyor (takvime ya da geldiği sekmeye), buraya geri dönmüyor.
 */
export default function ManagerCreateTab() {
    const { c } = useTheme();
    const router = useRouter();

    useFocusEffect(useCallback(() => {
        router.push({
            pathname: '/(manager-flow)/randevu-olustur',
            params: { back: '/(manager)' },
        });
    }, [router]));

    // Akış üstte açılana kadar bir kare görünür; boş sayfa değil, zemin.
    return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}
