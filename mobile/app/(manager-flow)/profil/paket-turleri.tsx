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
import { PackageTypeRow, PackageTypeSheet } from '../../../src/components/ProfileSheets';
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import { authApi } from '../../../src/api/session';
import { orgDurum } from '../../../src/lib/managerDurum';
import { useManagerRead } from '../../../src/lib/managerRead';
import { fetchPackageTypes, forgetOrg } from '../../../src/lib/managerSource';
import { removePackageType, savePackageType } from '../../../src/lib/managerWrite';
import type { PackageType } from '../../../src/lib/packageBook';
import { settingsRefusal, type SettingsOutcome } from '../../../src/lib/settingsMap';
import { feedback } from '../../../src/lib/feedback';
import { profileMetrics as M, useTheme } from '../../../src/theme';

/**
 * Paket türleri (1.0.1) — satışta seçilen şablonlar.
 *
 * Masaüstünün "Paket tanımları"yla AYNI satır (`package_templates`, 069).
 * Telefon ad, seans ve bedeli yazıyor; renk ve geçerlilik masaüstünde kaldığı
 * gibi kalıyor. Kaldırmak pasifleştirmek demek: satılmış paketlerin izi
 * silinmesin.
 *
 * Tür yoksa satış hizmetlerden çalışır (`saleOptions`) — boş liste bir eksik
 * değil, bir seçim. Kalıp hizmetler sayfasının kendisi
 * (`profil/hizmetler.tsx`).
 */
export default function ManagerPackageTypes() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [editing, setEditing] = useState<PackageType | null>(null);
    const [creating, setCreating] = useState(false);
    const [refused, setRefused] = useState<'stale' | 'paused' | 'failed' | null>(null);

    const read = useCallback(() => fetchPackageTypes(), []);
    const snap = useManagerRead<PackageType[] | null>(read, null,
        { poll: false, tables: ['package_templates'] });
    /*
     * Yazmanın döndürdüğü liste, sonraki okumaya kadar. Yazma zaten yazdıktan
     * SONRA listeyi okuyor; bu kopya o okumanın sonucu, tahmin değil.
     */
    const [written, setWritten] = useState<{ list: PackageType[]; at: number | null } | null>(null);
    const types = written && written.at === snap.at ? written.list : snap.data;

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
    const settle = (result: SettingsOutcome<PackageType[]>) => {
        if (!result.ok) {
            setRefused(result.kind);
            setWritten(null);
            if (result.kind === 'stale') void snap.reload();
            return;
        }
        setRefused(null);
        setWritten({ list: result.value, at: snap.at });
    };

    const openNew = () => { feedback.selection(); setCreating(true); };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav
                    title="Paket türleri"
                    onBack={() => router.back()}
                    right={(
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Paket türü ekle"
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
                        title={refused === 'stale' ? 'Paket türü başka bir cihazda değişti' : settingsRefusal(refused).title}
                        lines={[refused === 'stale'
                            ? 'Değişikliğiniz uygulanmadı. Güncel listeyi getirdik.'
                            : settingsRefusal(refused).line]}
                        actions={[{ label: 'Anladım', onPress: () => setRefused(null) }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}
                {/* Okunamayan liste "henüz tür yok" DEĞİL: boş blok müdüre
                    var olan türü yeniden ekletirdi. */}
                {types === null ? (
                    !snap.refusal && snap.state === 'error' ? (
                        <DurumUnread
                            what="Paket türlerini"
                            notMeaning="Paket türü olmadığı"
                            onRetry={() => { void snap.reload(); }}
                            style={{ paddingHorizontal: 0 }}
                        />
                    ) : null
                ) : types.length === 0 ? (
                    <EmptyBlock
                        title="Henüz paket türü yok"
                        hint="Tür yokken paket hizmetlerden satılır: seans ve bedel her satışta elle girilir. İlk türü eklediğinizde satış yalnız türlerden yapılır — sık sattığınız paketlerin hepsini ekleyin."
                        action="İlk türü ekle"
                        onAction={openNew}
                    />
                ) : (
                    <>
                        <Group>
                            {types.map((type, index) => (
                                <PackageTypeRow
                                    key={type.id}
                                    type={type}
                                    first={index === 0}
                                    onPress={() => setEditing(type)}
                                />
                            ))}
                        </Group>
                        {/* Masaüstünün kuralı (`saleOptions`): tür varsa satış YALNIZ
                            türlerden. Bilmeyen müdür, eklemediği paketi
                            satış ekranında arardı. */}
                        <Foot>Satışta yalnız bu türler listelenir. Seans sayısı türden gelir; bedel satarken değiştirilebilir.</Foot>
                    </>
                )}
            </ScrollView>

            <PackageTypeSheet
                visible={editing !== null || creating}
                type={editing}
                onDismiss={() => { setEditing(null); setCreating(false); }}
                onSave={async (input) => {
                    const result = await savePackageType(input);
                    setEditing(null);
                    setCreating(false);
                    settle(result);
                }}
                onRemove={async (id) => {
                    const result = await removePackageType(id);
                    setEditing(null);
                    settle(result);
                }}
            />
        </View>
    );
}
