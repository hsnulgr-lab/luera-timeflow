import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    EmptyBlock,
    Foot,
    Group,
    PlusIcon,
    ProfileNav,
} from '../../../src/components/ProfileParts';
import { ServiceRow, ServiceSheet } from '../../../src/components/ProfileSheets';
import { priceWarning, type SalonService } from '../../../src/lib/managerProfile';
import { deleteService, readServices, saveService } from '../../../src/lib/salonSettings';
import { feedback } from '../../../src/lib/feedback';
import { profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür 27 · Hizmetler ve fiyatlar.
 *
 * Fiyat BOŞ kalabilir ve bu gerçek bir hâldir — o zaman "fiyat yok" yazar.
 * "₺0" hiçbir yerde yazılmaz: sıfır bir fiyattır (ücretsiz hizmet), boşluk
 * fiyatın girilmemiş olmasıdır.
 */
export default function ManagerServices() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [services, setServices] = useState<SalonService[] | null>(null);
    const [editing, setEditing] = useState<SalonService | null>(null);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        let alive = true;
        void readServices().then((list) => { if (alive) setServices(list); });
        return () => { alive = false; };
    }, []);

    const openNew = () => { feedback.selection(); setCreating(true); };
    const warning = services ? priceWarning(services) : null;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav
                    title="Hizmetler"
                    onBack={() => router.back()}
                    right={(
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Hizmet ekle"
                            onPress={openNew}
                            style={({ pressed }) => ({
                                width: 44,
                                height: 44,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: pressed ? 0.6 : 1,
                            })}
                        >
                            <PlusIcon color={c.tx} />
                        </Pressable>
                    )}
                />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingBottom: M.bottomInset,
                    gap: 10,
                }}
            >
                {services === null ? null : services.length === 0 ? (
                    <EmptyBlock
                        title="Henüz hizmet yok"
                        hint="Hizmet eklemeden randevu oluşturulamaz. Ad, süre ve dilerseniz fiyat girin."
                        action="İlk hizmeti ekle"
                        onAction={openNew}
                    />
                ) : (
                    <>
                        <Group>
                            {services.map((service, index) => (
                                <ServiceRow
                                    key={service.id}
                                    service={service}
                                    first={index === 0}
                                    onPress={() => setEditing(service)}
                                />
                            ))}
                        </Group>
                        {/* Eksik yoksa satır HİÇ çizilmez. */}
                        {warning ? <Foot>{warning}</Foot> : null}
                    </>
                )}
            </ScrollView>

            <ServiceSheet
                visible={editing !== null || creating}
                service={editing}
                onDismiss={() => { setEditing(null); setCreating(false); }}
                onSave={async (service) => {
                    const result = await saveService(service);
                    if (!result.ok || !result.value) return;
                    setServices(result.value);
                    setEditing(null);
                    setCreating(false);
                }}
                onDelete={async (id) => {
                    const result = await deleteService(id);
                    if (!result.ok || !result.value) return;
                    setServices(result.value);
                    setEditing(null);
                }}
            />
        </View>
    );
}
