import { View } from 'react-native';

import { T } from '../../src/components/ui';
import { useTheme } from '../../src/theme';

// Yer tutucu — bu turda yalnız müdür kabuğu kuruldu.
export default function ManagerProfil() {
    const { c } = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <T v="h2">Profil</T>
        </View>
    );
}
