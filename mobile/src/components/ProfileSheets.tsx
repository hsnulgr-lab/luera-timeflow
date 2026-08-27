import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { BottomSheet, SheetGrab } from './Sheet';
import {
    Chips,
    ColorPicker,
    FieldLabel,
    Foot,
    GhostButton,
    PrimaryButton,
    ProfileRow,
    Stepper,
    SwitchRow,
    TrashIcon,
} from './ProfileParts';
import { upperTR } from '../lib/text';
import {
    DURATION_CHIPS,
    SERVICE_COLORS,
    dayName,
    formatPrice,
    hhmm,
    parsePrice,
    serviceValid,
    stepDuration,
    stepHour,
    type DaySchedule,
    type SalonService,
} from '../lib/managerProfile';
import { font, profileMetrics as M, useTheme } from '../theme';

/**
 * Müdür 27 — düzenleme yüzeyleri.
 *
 * Her düzenleme ALT SAYFADA: `LayoutAnimation` projede yok, o yüzden hiçbir
 * liste satırı yerinde açılıp kapanmıyor.
 *
 * Kaydet, bir değişiklik olana kadar pasif; basıldığında "Kaydediliyor" olur
 * ve sayfa ancak sonuç döndükten sonra kapanır. Kaydedilmemiş bir değer
 * hiçbir yerde yeni değermiş gibi çizilmez.
 */

// ── Gün düzenleme ───────────────────────────────────────────────────────────

export function DaySheet({ visible, day, onDismiss, onSave }: {
    visible: boolean;
    day: DaySchedule | null;
    onDismiss: () => void;
    onSave: (day: DaySchedule, spread: boolean) => Promise<void>;
}) {
    const { c } = useTheme();
    const [draft, setDraft] = useState<DaySchedule | null>(day);
    const [spread, setSpread] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (visible) { setDraft(day); setSpread(false); setBusy(false); }
    }, [visible, day]);

    if (!draft || !day) return null;

    const changed = draft.open !== day.open
        || draft.close !== day.close
        || draft.closed !== day.closed
        || spread;

    const name = dayName(draft.day);

    return (
        <BottomSheet visible={visible} onDismiss={onDismiss}>
            <SheetGrab />
            <View style={{ paddingHorizontal: M.padX, paddingBottom: 14, gap: 13 }}>
                <Text style={{
                    color: c.tx,
                    fontSize: 20,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: 20 * -0.025,
                }}>
                    {name}
                </Text>

                {/* Kapalı günde saat basamakları pasif — kapalı bir günün
                    açılış saati düzenlenemez, ama SAKLANIR: gün açılınca geri
                    gelir. */}
                <Stepper
                    label={upperTR('Açılış')}
                    value={hhmm(draft.open)}
                    disabled={draft.closed}
                    onStep={(direction) => setDraft(stepHour(draft, 'open', direction))}
                />
                <Stepper
                    label={upperTR('Kapanış')}
                    value={hhmm(draft.close)}
                    disabled={draft.closed}
                    onStep={(direction) => setDraft(stepHour(draft, 'close', direction))}
                />

                <View style={{
                    borderWidth: 1,
                    borderColor: c.bd,
                    borderRadius: M.groupRadius,
                    backgroundColor: c.surf,
                    overflow: 'hidden',
                }}>
                    <SwitchRow
                        first
                        title={`${name} kapalı`}
                        value={draft.closed}
                        onToggle={() => setDraft({ ...draft, closed: !draft.closed })}
                    />
                </View>

                {/* Saatleri kopyalar, KAPALI GÜNLERİ AÇMAZ. */}
                <View style={{
                    borderWidth: 1,
                    borderColor: c.bd,
                    borderRadius: M.groupRadius,
                    backgroundColor: c.surf,
                    overflow: 'hidden',
                }}>
                    <SwitchRow
                        first
                        title="Bu saatleri tüm günlere uygula"
                        value={spread}
                        onToggle={() => setSpread(!spread)}
                    />
                </View>

                <Foot>
                    Saatler her hafta aynı tekrar eder. Kapalı günler bu düğmeyle açılmaz.
                </Foot>

                <PrimaryButton
                    label="Kaydet"
                    disabled={!changed}
                    busy={busy}
                    onPress={() => {
                        setBusy(true);
                        void onSave(draft, spread).finally(() => setBusy(false));
                    }}
                />
            </View>
        </BottomSheet>
    );
}

// ── Hizmet düzenleme ────────────────────────────────────────────────────────

export function ServiceSheet({ visible, service, onDismiss, onSave, onDelete }: {
    visible: boolean;
    /** `null` yeni hizmet demek — o zaman silme satırı çizilmez. */
    service: SalonService | null;
    onDismiss: () => void;
    onSave: (service: SalonService) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}) {
    const { c } = useTheme();
    const [name, setName] = useState('');
    const [minutes, setMinutes] = useState(30);
    const [priceText, setPriceText] = useState('');
    const [color, setColor] = useState<string>(SERVICE_COLORS[0].hex);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setName(service?.name ?? '');
        setMinutes(service?.minutes ?? 30);
        setPriceText(service && service.price !== null ? String(service.price) : '');
        setColor(service?.color ?? SERVICE_COLORS[0].hex);
        setBusy(false);
    }, [visible, service]);

    const price = parsePrice(priceText);
    const valid = serviceValid({ name, minutes });

    return (
        <BottomSheet visible={visible} onDismiss={onDismiss} fill>
            <SheetGrab />
            {/*
              * GÖVDE KAYAR — ve bu bir süs değil, kaçış yolu.
              *
              * Sabit bir `View` idi: hizmet adına dokununca klavye açılıyor,
              * "Kaydet" ve "Vazgeç" klavyenin altında kalıyordu. Ne kaydetmek
              * ne vazgeçmek mümkündü; sayfadan çıkmanın tek yolu uygulamayı
              * tamamen kapatmaktı. Kaydırılabilir gövde ikisini de erişilebilir
              * tutuyor.
              *
              * Klavye payını sayfanın kabuğu (`Sheet.tsx`, KeyboardAvoidingView)
              * zaten veriyor; burada İKİNCİ bir pay eklenmiyor, yoksa altta
              * boş bir şerit kalırdı. `keyboardShouldPersistTaps` ise klavye
              * açıkken düğmeye İLK dokunuşun çalışmasını sağlıyor — yoksa ilk
              * dokunuş yalnız klavyeyi kapatır, müdür iki kez basmak zorunda
              * kalır.
              */}
            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingHorizontal: M.padX,
                    paddingBottom: 14,
                    gap: 13,
                }}
            >
                <Text style={{
                    color: c.tx,
                    fontSize: 20,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: 20 * -0.025,
                }}>
                    {service ? service.name : 'Yeni hizmet'}
                </Text>

                <View style={{ gap: 7 }}>
                    <FieldLabel>{upperTR('Hizmet adı')}</FieldLabel>
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="Örn. Saç boyama"
                        placeholderTextColor={c.tx3}
                        selectionColor={c.or}
                        style={{
                            height: M.fieldHeight,
                            borderWidth: 1,
                            borderColor: c.bd2,
                            borderRadius: M.fieldRadius,
                            backgroundColor: c.surf2,
                            paddingHorizontal: 14,
                            color: c.tx,
                            fontSize: M.fieldText,
                            fontFamily: font.semiBold,
                            fontWeight: '600',
                        }}
                    />
                </View>

                <Stepper
                    label={upperTR('Süre')}
                    value={`${minutes} dk`}
                    onStep={(direction) => setMinutes(stepDuration(minutes, direction))}
                />
                <Chips values={DURATION_CHIPS} selected={minutes} onPick={setMinutes} suffix="dakika" />

                <View style={{ gap: 7 }}>
                    <FieldLabel>{upperTR('Fiyat')}</FieldLabel>
                    <View style={{
                        height: M.fieldHeight,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 7,
                        borderWidth: 1,
                        borderColor: c.bd2,
                        borderRadius: M.fieldRadius,
                        backgroundColor: c.surf2,
                        paddingHorizontal: 14,
                    }}>
                        <Text style={{
                            color: c.tx3,
                            fontSize: M.fieldText,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            ₺
                        </Text>
                        <TextInput
                            value={priceText}
                            onChangeText={setPriceText}
                            keyboardType="decimal-pad"
                            placeholder="boş bırakılabilir"
                            placeholderTextColor={c.tx3}
                            selectionColor={c.or}
                            style={{
                                flex: 1,
                                color: c.tx,
                                fontSize: M.fieldText,
                                fontFamily: font.semiBold,
                                fontWeight: '600',
                            }}
                        />
                    </View>
                    {/* Sıfır bir FİYATTIR, boşluk fiyat yok demektir. */}
                    <Foot>
                        Boş bırakılırsa fiyat müşteriye gösterilmez. ₺0 yazmayın — sıfır bir fiyattır.
                    </Foot>
                </View>

                <ColorPicker colors={SERVICE_COLORS} selected={color} onPick={setColor} />

                {service ? (
                    <View style={{
                        borderWidth: 1,
                        borderColor: c.bd,
                        borderRadius: M.groupRadius,
                        backgroundColor: c.surf,
                        overflow: 'hidden',
                    }}>
                        <ProfileRow
                            first
                            danger
                            chevron={false}
                            title="Hizmeti sil"
                            icon={<TrashIcon color={c.rd} />}
                            onPress={() => {
                                setBusy(true);
                                void onDelete(service.id).finally(() => setBusy(false));
                            }}
                        />
                    </View>
                ) : null}

                <View style={{ marginTop: 'auto', gap: 9 }}>
                    <PrimaryButton
                        label="Kaydet"
                        disabled={!valid}
                        busy={busy}
                        onPress={() => {
                            setBusy(true);
                            void onSave({
                                id: service?.id ?? `svc-${Date.now()}`,
                                name: name.trim(),
                                minutes,
                                price,
                                color,
                            }).finally(() => setBusy(false));
                        }}
                    />
                    <GhostButton label="Vazgeç" onPress={onDismiss} />
                </View>
            </ScrollView>
        </BottomSheet>
    );
}

/** Liste satırı — fiyatsızda "fiyat yok" KELİMESİ, asla ₺0. */
export function ServiceRow({ service, first, onPress }: {
    service: SalonService;
    first: boolean;
    onPress: () => void;
}) {
    const { c } = useTheme();
    const priced = service.price !== null;
    return (
        <ProfileRow
            first={first}
            title={service.name}
            sub={`${service.minutes} dk`}
            onPress={onPress}
            icon={(
                <View style={{
                    width: M.serviceBar,
                    height: M.serviceBarHeight,
                    borderRadius: M.serviceBar / 2,
                    backgroundColor: service.color,
                }} />
            )}
            right={(
                <Text style={{
                    color: priced ? c.tx : c.tx3,
                    fontSize: priced ? M.servicePrice : M.servicePriceNone,
                    fontFamily: priced ? font.bold : font.bold,
                    fontWeight: '700',
                }}>
                    {formatPrice(service.price)}
                </Text>
            )}
        />
    );
}
