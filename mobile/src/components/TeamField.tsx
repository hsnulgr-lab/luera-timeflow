import type { RefObject } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { FieldLabel } from './ProfileParts';
import { upperTR } from '../lib/text';
import { font, useTheme } from '../theme';

/**
 * Müşteriler'in arama kutusunun çizimi, büyüteçsiz (`SearchField`). Onun
 * kendisi değil: o bir ARAMA kontrolü — büyüteci, temizle düğmesi ve "ara"
 * klavye tuşu var. Boşken alan zemini, yazılınca yüzey ve çizgi.
 */
export function TeamField({ label, inputRef, value, ...input }: TextInputProps & {
    label: string;
    value: string;
    inputRef?: RefObject<TextInput | null>;
}) {
    const { c } = useTheme();
    const on = value.length > 0;
    return (
        <View style={{ gap: 7 }}>
            <FieldLabel>{upperTR(label)}</FieldLabel>
            <TextInput
                ref={inputRef}
                value={value}
                accessibilityLabel={label}
                placeholderTextColor={c.tx3}
                selectionColor={c.or}
                autoCorrect={false}
                {...input}
                style={{
                    height: 50,
                    borderRadius: 16,
                    paddingHorizontal: 15,
                    backgroundColor: on ? c.surf2 : c.fld,
                    borderWidth: 1,
                    borderColor: on ? c.bd2 : 'transparent',
                    color: c.tx,
                    fontSize: 15.5,
                    fontFamily: on ? font.semiBold : font.medium,
                    fontWeight: on ? '600' : '500',
                }}
            />
        </View>
    );
}
