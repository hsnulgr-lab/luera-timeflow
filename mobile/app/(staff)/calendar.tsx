import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { numeric, space, type, useTheme } from '../../src/theme';

// Bu ilk adım yalnızca yeni sekmenin NativeTabs içinde güvenle açıldığını
// doğruluyor. Takvimin gerçek parçaları sonraki küçük adımlarda bu rotaya
// eklenecek; böylece mevcut Kumanda ekranıyla aynı anda büyük bir değişiklik
// yapıp hatanın kaynağını belirsizleştirmiyoruz.
export default function Calendar() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <View style={{ paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.xs }}>
                <Text style={[type.h1, { color: c.tx }]}>Takvim</Text>
                <Text style={[type.small, { color: c.tx2 }]}>Eylül 2026</Text>
            </View>

            <View style={{
                margin: space.lg,
                minHeight: 132,
                padding: space.lg,
                justifyContent: 'space-between',
                backgroundColor: c.surf,
                borderColor: c.bd,
                borderWidth: 1,
                borderRadius: 22,
            }}>
                <Text style={[type.tiny, { color: c.tx2, textTransform: 'uppercase' }]}>İlk adım hazır</Text>
                <Text style={[type.h2, { color: c.tx }]}>Takvim sekmesi Kumanda'ya eklendi.</Text>
                <Text style={[type.small, numeric, { color: c.tx2 }]}>Sırada gün başlığı ve hafta şeridi var.</Text>
            </View>
        </View>
    );
}
