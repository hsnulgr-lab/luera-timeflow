import { useCallback, useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { CustomerCard } from '../../src/components/CustomerCard';
import { Empty } from '../../src/components/ui';
import { dialPhone, findCustomer } from '../../src/lib/customerCard';
import { useTheme } from '../../src/theme';

type CustomerRouteParams = {
    customerName?: string | string[];
    customerId?: string | string[];
    id?: string | string[];
    name?: string | string[];
    phone?: string | string[];
    reservationId?: string | string[];
    date?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    const clean = first?.trim();
    return clean || undefined;
}

/**
 * Müdür 23 — Müşteri kartı rotası.
 *
 * Parametreler (id / name) üzerinden `findCustomer` çağrılır.
 * Parametre yoksa veya kayıt bulunamazsa `Empty` gösterilir.
 */
export default function CustomerScreen() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<CustomerRouteParams>();

    const query = useMemo(() => ({
        id: firstParam(params.customerId) ?? firstParam(params.id),
        name: firstParam(params.customerName) ?? firstParam(params.name),
    }), [params.customerId, params.id, params.customerName, params.name]);

    const card = useMemo(() => {
        if (!query.id && !query.name) {
            return null;
        }
        return findCustomer(query);
    }, [query]);

    const close = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/mudur/calendar');
    }, [router]);

    const handleCall = useCallback(() => {
        if (!card) return;
        const phone = dialPhone(card);
        if (phone) {
            void Linking.openURL(`tel:${phone}`);
        }
    }, [card]);

    const handleWhatsApp = useCallback(() => {
        if (!card) return;
        const phone = dialPhone(card);
        if (phone) {
            const clean = phone.replace(/[^\d]/g, '');
            void Linking.openURL(`https://wa.me/${clean}`);
        }
    }, [card]);

    const handleBook = useCallback(() => {
        if (!card) return;
        router.navigate({
            pathname: '/mudur/create',
            params: { customerId: card.id },
        });
    }, [card, router]);

    if (!card) {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Geri"
                        hitSlop={8}
                        onPress={close}
                        style={({ pressed }) => ({
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: c.surf,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={c.tx} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M12 4l-6 6 6 6" />
                        </Svg>
                    </Pressable>
                </View>
                <Empty
                    title="Müşteri bulunamadı"
                    hint="Silinmiş ya da başka bir kayda taşınmış olabilir."
                />
            </View>
        );
    }

    return (
        <CustomerCard
            card={card}
            onBack={close}
            onCall={dialPhone(card) ? handleCall : undefined}
            onWhatsApp={dialPhone(card) ? handleWhatsApp : undefined}
            onBook={handleBook}
        />
    );
}
