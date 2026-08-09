import { View } from 'react-native';
import { T } from '../../src/components/ui';
import { space, useTheme } from '../../src/theme';

// Yer tutucu — tasarımdaki ekran bu turda yazılmadı.
export default function Screen() {
    const { c } = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, justifyContent: 'center' }}>
            <T v="h2">performance</T>
            <T v="small" c={c.tx2}>Bu ekran sıradaki turda yazılacak.</T>
        </View>
    );
}
