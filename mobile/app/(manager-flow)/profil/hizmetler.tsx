import { useCallback, useState } from 'react';
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
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import { authApi } from '../../../src/api/session';
import type { CatalogService } from '../../../src/lib/cashBuild';
import { priceWarning, type SalonService } from '../../../src/lib/managerProfile';
import { orgDurum } from '../../../src/lib/managerDurum';
import { useManagerRead } from '../../../src/lib/managerRead';
import { fetchServices, forgetOrg } from '../../../src/lib/managerSource';
import { deleteSalonService, saveSalonService } from '../../../src/lib/managerWrite';
import {
    isNewService, salonServicesOf, settingsRefusal, type SettingsOutcome,
} from '../../../src/lib/settingsMap';
import { feedback } from '../../../src/lib/feedback';
import { profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Müdür 27 · Hizmetler ve fiyatlar.
 *
 * Fiyat BOŞ kalabilir ve bu gerçek bir hâldir — o zaman "fiyat yok" yazar.
 * "₺0" hiçbir yerde yazılmaz: sıfır bir fiyattır (ücretsiz hizmet), boşluk
 * fiyatın girilmemiş olmasıdır.
 *
 * VERİ CANLI (müdür planı 8. adım): `services` tablosu — masaüstünün,
 * randevu ekranının, Kasa'nın ve çevrim içi randevunun okuduğu katalog.
 * Yazma yalnız ad, süre, fiyat ve rengi değiştiriyor; uygunluk etiketleri ve
 * dönüş periyodu masaüstünde kaldığı gibi kalıyor.
 */
export default function ManagerServices() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [editing, setEditing] = useState<SalonService | null>(null);
    const [creating, setCreating] = useState(false);
    const [refused, setRefused] = useState<'stale' | 'paused' | 'failed' | null>(null);

    const read = useCallback(() => fetchServices(), []);
    const snap = useManagerRead<CatalogService[] | null>(read, null, { poll: false });
    /*
     * Yazmanın döndürdüğü katalog, sonraki okumaya kadar. Yazma zaten
     * yazdıktan SONRA kataloğu okuyor; bu kopya o okumanın sonucu, tahmin
     * değil.
     */
    const [written, setWritten] = useState<{ list: CatalogService[]; at: number | null } | null>(null);
    // Yeni bir okuma geldiği an (`at` değişti) sunucunun listesi esas.
    const catalog = written && written.at === snap.at ? written.list : snap.data;
    const services = catalog ? salonServicesOf(catalog) : null;

    const onRefusalAction = useCallback(async () => {
        if (snap.refusal === 'ambiguous') {
            forgetOrg();
            router.push('/(auth)/manager/business');
            return;
        }
        await authApi.resume.signOut().catch(() => undefined);
        forgetOrg();
        router.replace('/(auth)/welcome');
    }, [snap.refusal, router]);

    /** Yazmanın sonucu: başarıda liste yenilenir, değilse sebep yazılır. */
    const settle = (result: SettingsOutcome<CatalogService[]>): boolean => {
        if (!result.ok) {
            setRefused(result.kind);
            setWritten(null);
            if (result.kind === 'stale') void snap.reload();
            return false;
        }
        setRefused(null);
        setWritten({ list: result.value, at: snap.at });
        return true;
    };

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
                {snap.refusal ? (
                    <DurumBlock
                        tone={orgDurum(snap.refusal).tone}
                        title={orgDurum(snap.refusal).title}
                        lines={orgDurum(snap.refusal).lines}
                        actions={[{
                            label: orgDurum(snap.refusal).action.label,
                            onPress: () => { void onRefusalAction(); },
                        }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}
                {refused ? (
                    <DurumBlock
                        tone={settingsRefusal(refused).tone}
                        title={refused === 'stale' ? 'Hizmet başka bir cihazda değişti' : settingsRefusal(refused).title}
                        lines={[refused === 'stale'
                            ? 'Değişikliğiniz uygulanmadı. Güncel listeyi getirdik.'
                            : settingsRefusal(refused).line]}
                        actions={[{ label: 'Anladım', onPress: () => setRefused(null) }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}
                {/* Okunamayan katalog "henüz hizmet yok" DEĞİL: boş blok
                    müdüre ilk hizmeti yeniden ekletirdi. */}
                {services === null ? (
                    !snap.refusal && snap.state === 'error' ? (
                        <DurumUnread
                            what="Hizmetleri"
                            notMeaning="Hizmet olmadığı"
                            onRetry={() => { void snap.reload(); }}
                            style={{ paddingHorizontal: 0 }}
                        />
                    ) : null
                ) : services.length === 0 ? (
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
                    const result = await saveSalonService(service, isNewService(service.id, services ?? []));
                    setEditing(null);
                    setCreating(false);
                    settle(result);
                }}
                onDelete={async (id) => {
                    const result = await deleteSalonService(id);
                    setEditing(null);
                    settle(result);
                }}
            />
        </View>
    );
}
