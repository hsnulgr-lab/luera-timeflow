import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Animated,
    Easing,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View,
    type ViewStyle,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '../lib/feedback';
import { numeric, useTheme } from '../theme';
import { upperTR } from '../lib/text';

export type VisitSheet = 'service' | 'material' | null;
export type MaterialQuantities = Record<string, number>;

export const SERVICE_OPTIONS = [
    { id: 'mask', name: 'Saç bakım maskesi', duration: '20 dk', price: 210 },
    { id: 'cut', name: 'Kesim', duration: '45 dk', price: 650 },
    { id: 'keratin', name: 'Keratin bakım', duration: '60 dk', price: 2200 },
    { id: 'updo', name: 'Saç toplama', duration: '30 dk', price: 450 },
    { id: 'brows', name: 'Kaş alma', duration: '15 dk', price: 180 },
] as const;

export const MATERIAL_OPTIONS = [
    { id: 'dye', name: 'Boya · 7.3 kumral', stock: 'Depoda 14 tüp', unit: 'tüp', initial: 2 },
    { id: 'oxidant', name: 'Oksidan %6', stock: 'Depoda 8 şişe', unit: 'şişe', initial: 1 },
    { id: 'care-mask', name: 'Bakım maskesi', stock: 'Depoda 3 kutu · azalıyor', unit: 'kutu', initial: 0 },
    { id: 'gloves', name: 'Eldiven', stock: 'Depoda 60 çift', unit: 'çift', initial: 1 },
] as const;

export const DEFAULT_MATERIAL_QUANTITIES: MaterialQuantities = Object.fromEntries(
    MATERIAL_OPTIONS.map((item) => [item.id, item.initial]),
);

export const formatMoney = (value: number) =>
    `₺${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

function SearchIcon() {
    const { c } = useTheme();
    return (
        <View style={{ width: 19, height: 19 }}>
            <View style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 1.7,
                borderColor: c.tx2,
            }} />
            <View style={{
                position: 'absolute',
                right: 1,
                bottom: 2,
                width: 7,
                height: 1.7,
                borderRadius: 1,
                backgroundColor: c.tx2,
                transform: [{ rotate: '45deg' }],
            }} />
        </View>
    );
}

function AddIcon({ color, minus = false, size = 20 }: { color: string; minus?: boolean; size?: number }) {
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{
                position: 'absolute',
                width: size - 5,
                height: 1.7,
                borderRadius: 1,
                backgroundColor: color,
            }} />
            {!minus ? (
                <View style={{
                    position: 'absolute',
                    width: 1.7,
                    height: size - 5,
                    borderRadius: 1,
                    backgroundColor: color,
                }} />
            ) : null}
        </View>
    );
}

function CheckIcon({ color }: { color: string }) {
    return (
        <View style={{ width: 20, height: 20 }}>
            <View style={{
                position: 'absolute',
                left: 4,
                top: 9,
                width: 6,
                height: 2,
                borderRadius: 1,
                backgroundColor: color,
                transform: [{ rotate: '45deg' }],
            }} />
            <View style={{
                position: 'absolute',
                left: 8,
                top: 7,
                width: 10,
                height: 2,
                borderRadius: 1,
                backgroundColor: color,
                transform: [{ rotate: '-45deg' }],
            }} />
        </View>
    );
}

function Grabber() {
    const { c, glass } = useTheme();
    const style: ViewStyle = {
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: c.glassBorder,
    };
    const handle = (
        <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: c.tx, opacity: 0.24 }} />
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={style}>
                {handle}
            </GlassView>
        );
    }
    return <View style={[style, { backgroundColor: c.surf }]}>{handle}</View>;
}

function SheetShell({
    title,
    onClose,
    children,
    footer,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer: (close: (afterClose?: () => void) => void) => ReactNode;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const sheetHeight = Math.min(576, height - insets.top - 52);
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const sheetY = useRef(new Animated.Value(sheetHeight)).current;
    const closingRef = useRef(false);

    useEffect(() => {
        closingRef.current = false;
        backdropOpacity.setValue(0);
        sheetY.setValue(reduceMotion ? 0 : sheetHeight);

        const animation = reduceMotion
            ? Animated.timing(backdropOpacity, {
                toValue: 1,
                duration: 110,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            })
            : Animated.parallel([
                Animated.timing(backdropOpacity, {
                    toValue: 1,
                    duration: 180,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(sheetY, {
                    toValue: 0,
                    damping: 24,
                    stiffness: 240,
                    mass: 0.9,
                    overshootClamping: true,
                    useNativeDriver: true,
                }),
            ]);
        animation.start();
        return () => animation.stop();
    }, [backdropOpacity, reduceMotion, sheetHeight, sheetY]);

    const close = useCallback((afterClose?: () => void) => {
        if (closingRef.current) return;
        closingRef.current = true;

        const finish = () => {
            if (afterClose) afterClose();
            else onClose();
        };
        const animation = reduceMotion
            ? Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 100,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            })
            : Animated.parallel([
                Animated.timing(backdropOpacity, {
                    toValue: 0,
                    duration: 180,
                    easing: Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(sheetY, {
                    toValue: sheetHeight,
                    duration: 220,
                    easing: Easing.inOut(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]);
        animation.start(({ finished }) => {
            if (finished) finish();
            else closingRef.current = false;
        });
    }, [backdropOpacity, onClose, reduceMotion, sheetHeight, sheetY]);

    return (
        <>
            <Animated.View
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    zIndex: 70,
                    opacity: backdropOpacity,
                }}
            >
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${title} ekranını kapat`}
                    onPress={() => close()}
                    style={{
                        flex: 1,
                        backgroundColor: dark ? 'rgba(0,0,0,0.50)' : 'rgba(14,14,14,0.34)',
                    }}
                />
            </Animated.View>

            <Animated.View
                accessibilityViewIsModal
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 80,
                    height: sheetHeight,
                    overflow: 'hidden',
                    borderTopLeftRadius: 26,
                    borderTopRightRadius: 26,
                    borderTopWidth: 1,
                    borderTopColor: c.bd,
                    backgroundColor: c.surf,
                    transform: [{ translateY: sheetY }],
                }}
            >
                <Grabber />

                <View style={{
                    paddingTop: 4,
                    paddingHorizontal: 20,
                    paddingBottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <Text style={{ color: c.tx, fontSize: 21, fontWeight: '800', letterSpacing: -0.59 }}>
                        {title}
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => close()}
                        hitSlop={3}
                        style={({ pressed }) => ({
                            height: 38,
                            paddingHorizontal: 15,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: c.bd,
                            backgroundColor: c.surf2,
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <Text style={{ color: c.tx, fontSize: 14.5, fontWeight: '700', letterSpacing: -0.15 }}>
                            Kapat
                        </Text>
                    </Pressable>
                </View>

                <View style={{ flex: 1, minHeight: 0 }}>
                    {children}
                </View>

                <View style={{
                    paddingTop: 14,
                    paddingHorizontal: 18,
                    paddingBottom: Math.max(40, insets.bottom + 6),
                    gap: 10,
                    borderTopWidth: 1,
                    borderTopColor: c.bd,
                    backgroundColor: c.surf,
                }}>
                    {footer(close)}
                </View>
            </Animated.View>
        </>
    );
}

function SearchField({ value, onChangeText, placeholder }: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            height: 48,
            marginHorizontal: 18,
            marginBottom: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.bd,
            backgroundColor: c.surf2,
        }}>
            <SearchIcon />
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={c.tx2}
                selectionColor={c.or}
                returnKeyType="done"
                style={{
                    flex: 1,
                    height: 48,
                    paddingVertical: 0,
                    color: c.tx,
                    fontSize: 15.5,
                    fontWeight: '600',
                }}
            />
        </View>
    );
}

function Kicker({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <View style={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 8 }}>
            <Text style={{
                color: c.tx2,
                fontSize: 11.5,
                fontWeight: '700',
                letterSpacing: 1.84,
            }}>
                {upperTR(children)}
            </Text>
        </View>
    );
}

function PrimaryButton({ label, onPress, disabled = false }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => ({
                height: 60,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 18,
                backgroundColor: c.or,
                opacity: disabled ? 0.35 : pressed ? 0.82 : 1,
                transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
            })}
        >
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                {label}
            </Text>
        </Pressable>
    );
}

export function ServiceSheet({
    initialSelected,
    onClose,
    onCommit,
}: {
    initialSelected: string[];
    onClose: () => void;
    onCommit: (selected: string[]) => void;
}) {
    const { c } = useTheme();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>(initialSelected);
    const filtered = SERVICE_OPTIONS.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
    const selectedItems = SERVICE_OPTIONS.filter((item) => selected.includes(item.id));
    const selectedTotal = selectedItems.reduce((sum, item) => sum + item.price, 0);
    const label = selectedItems.length
        ? `${selectedItems.length} hizmet ekle · ${formatMoney(selectedTotal)}`
        : 'Hizmet seçin';

    const toggle = (id: string) => {
        feedback.selection();
        setSelected((current) => current.includes(id)
            ? current.filter((value) => value !== id)
            : [...current, id]);
    };

    return (
        <SheetShell
            title="Hizmet ekle"
            onClose={onClose}
            footer={(close) => (
                <PrimaryButton
                    label={label}
                    disabled={!selectedItems.length}
                    onPress={() => {
                        feedback.light();
                        close(() => onCommit(selected));
                    }}
                />
            )}
        >
            <SearchField value={query} onChangeText={setQuery} placeholder="Hizmet ara" />
            <Kicker>Sık kullanılanlar</Kicker>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={{ height: 1, backgroundColor: c.bd }} />
                {filtered.map((item) => {
                    const isSelected = selected.includes(item.id);
                    return (
                        <View key={item.id}>
                            <View style={{
                                minHeight: 62,
                                paddingVertical: 9,
                                paddingHorizontal: 18,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 13,
                            }}>
                                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Text numberOfLines={1} style={{
                                        color: c.tx,
                                        fontSize: 15.5,
                                        fontWeight: '700',
                                        letterSpacing: -0.23,
                                    }}>
                                        {item.name}
                                    </Text>
                                    <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                                        {item.duration}
                                    </Text>
                                </View>
                                <Text style={[{ color: c.tx, fontSize: 15, fontWeight: '700' }, numeric]}>
                                    {formatMoney(item.price)}
                                </Text>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`${item.name} ${isSelected ? 'seçimini kaldır' : 'ekle'}`}
                                    onPress={() => toggle(item.id)}
                                    style={({ pressed }) => ({
                                        width: 44,
                                        height: 44,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 14,
                                        borderWidth: isSelected ? 1 : 0,
                                        borderColor: c.gr + '38',
                                        backgroundColor: isSelected ? c.gr + '1F' : c.or,
                                        opacity: pressed ? 0.68 : 1,
                                    })}
                                >
                                    {isSelected
                                        ? <CheckIcon color={c.gr} />
                                        : <AddIcon color="#fff" />}
                                </Pressable>
                            </View>
                            <View style={{ height: 1, backgroundColor: c.bd }} />
                        </View>
                    );
                })}
            </ScrollView>
        </SheetShell>
    );
}

export function MaterialSheet({
    initialQuantities,
    onClose,
    onCommit,
}: {
    initialQuantities: MaterialQuantities;
    onClose: () => void;
    onCommit: (quantities: MaterialQuantities) => void;
}) {
    const { c } = useTheme();
    const [query, setQuery] = useState('');
    const [quantities, setQuantities] = useState<MaterialQuantities>(initialQuantities);
    const filtered = MATERIAL_OPTIONS.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
    const total = MATERIAL_OPTIONS.reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);

    const change = (id: string, amount: number) => {
        if (amount < 0 && (quantities[id] ?? 0) === 0) return;
        feedback.selection();
        setQuantities((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + amount) }));
    };

    return (
        <SheetShell
            title="Malzeme ekle"
            onClose={onClose}
            footer={(close) => (
                <>
                    <View style={{
                        paddingVertical: 13,
                        paddingHorizontal: 15,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.surf2,
                    }}>
                        <Text style={{ color: c.tx2, fontSize: 13.5, lineHeight: 19.6, fontWeight: '600' }}>
                            Bu kalemler depodan düşülecek. Müşteriye ayrı ücret yansımaz.
                        </Text>
                    </View>
                    <PrimaryButton
                        label={total ? `${total} kalemi ekle` : 'Malzeme seçin'}
                        disabled={!total}
                        onPress={() => {
                            feedback.light();
                            close(() => onCommit(quantities));
                        }}
                    />
                </>
            )}
        >
            <SearchField value={query} onChangeText={setQuery} placeholder="Malzeme ara" />
            <Kicker>Bu hizmette sık kullanılan</Kicker>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={{ height: 1, backgroundColor: c.bd }} />
                {filtered.map((item) => {
                    const quantity = quantities[item.id] ?? 0;
                    return (
                        <View key={item.id}>
                            <View style={{
                                minHeight: 62,
                                paddingVertical: 9,
                                paddingHorizontal: 18,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 13,
                            }}>
                                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Text numberOfLines={1} style={{
                                        color: c.tx,
                                        fontSize: 15.5,
                                        fontWeight: '700',
                                        letterSpacing: -0.23,
                                    }}>
                                        {item.name}
                                    </Text>
                                    <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                                        {item.stock}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${item.name} miktarını azalt`}
                                        accessibilityState={{ disabled: quantity === 0 }}
                                        disabled={quantity === 0}
                                        hitSlop={3}
                                        onPress={() => change(item.id, -1)}
                                        style={({ pressed }) => ({
                                            width: 38,
                                            height: 38,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: c.bd,
                                            backgroundColor: c.surf2,
                                            opacity: quantity === 0 ? 0.28 : pressed ? 0.58 : 1,
                                        })}
                                    >
                                        <AddIcon color={c.tx} minus size={18} />
                                    </Pressable>
                                    <Text style={[{
                                        width: 34,
                                        color: c.tx,
                                        textAlign: 'center',
                                        fontSize: 16,
                                        fontWeight: '800',
                                    }, numeric]}>
                                        {quantity}
                                    </Text>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${item.name} miktarını artır`}
                                        hitSlop={3}
                                        onPress={() => change(item.id, 1)}
                                        style={({ pressed }) => ({
                                            width: 38,
                                            height: 38,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: c.bd,
                                            backgroundColor: c.surf2,
                                            opacity: pressed ? 0.58 : 1,
                                        })}
                                    >
                                        <AddIcon color={c.tx} size={18} />
                                    </Pressable>
                                </View>
                            </View>
                            <View style={{ height: 1, backgroundColor: c.bd }} />
                        </View>
                    );
                })}
            </ScrollView>
        </SheetShell>
    );
}
