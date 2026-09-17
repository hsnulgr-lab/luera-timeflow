import { Pressable, TextInput, View } from 'react-native';

import { Glyph } from './Glyph';
import { useTheme } from '../theme';

/** Defter satırı 76 pt; arama alanı onunla aynı ailede duruyor. */
const SEARCH_HEIGHT = 50;

/**
 * Defterin tek kontrolü. Filtre satırı, segment ya da sıralama menüsü YOK:
 * 200 kayıtta arama tek başına yetiyor ve telefonun son dört hanesi de
 * buradan aranıyor.
 *
 * Gerçek bir `TextInput` — tasarımda düğme gibi çizilmiş olması onu ölü bir
 * kontrole çevirmez.
 *
 * İKİ DEFTER, TEK ALAN: personelin defteri (Personel 09) ve müdürünki aynı
 * kontrolü kullanıyor. İkinci bir kopya, aynı arama kuralının iki yerde
 * ayrışması demekti — "İnci" aramasının bir defterde çalışıp ötekinde
 * çalışmaması gibi.
 */
export function SearchField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const { c } = useTheme();
    const on = value.length > 0;
    return (
        <View style={{
            height: SEARCH_HEIGHT,
            borderRadius: 16,
            paddingHorizontal: 15,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            backgroundColor: on ? c.surf2 : c.fld,
            borderWidth: 1,
            borderColor: on ? c.bd2 : 'transparent',
        }}>
            <Glyph name="search" size={19} color={on ? c.tx2 : c.tx3} />
            <TextInput
                value={value}
                onChangeText={onChange}
                placeholder="Ad ya da telefonun son 4 hanesi"
                placeholderTextColor={c.tx3}
                selectionColor={c.or}
                autoCorrect={false}
                returnKeyType="search"
                style={{
                    flex: 1, minWidth: 0, padding: 0,
                    fontSize: 15.5,
                    fontWeight: on ? '600' : '500',
                    color: c.tx,
                }}
            />
            {on ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Aramayı temizle"
                    hitSlop={12}
                    onPress={() => onChange('')}
                >
                    <Glyph name="close" size={17} color={c.tx3} />
                </Pressable>
            ) : null}
        </View>
    );
}
