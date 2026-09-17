import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

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
import { feedback } from '../lib/feedback';
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

// ── Personel 10 · Oturumu kapat ─────────────────────────────────────────────

/**
 * Geri dönüşü PAHALI bir çıkış: personel çıkarsa telefonu yeniden bağlamak
 * için işletmeden yeni bir kod istemesi gerekiyor, eski kod çalışmıyor.
 *
 * Bu yüzden uyarı iki ağırlıkta yaşıyor — kısa hâli satırın altında (dokunmadan
 * önce bilinmeli), tam hâli burada. Bugün yalnız alt ekranda küçük gri bir
 * cümle olarak duruyordu; kimse okumadan basıyordu.
 *
 * Onay düğmesi kırmızı ama DOLU ZEMİN DEĞİL: dolu zemin birincil eylem demek
 * ve o turuncudur. Çıkış birincil eylem değil, kaçış yolu.
 */
export function LogoutSheet({ visible, businessName, onDismiss, onConfirm }: {
    visible: boolean;
    businessName: string;
    onDismiss: () => void;
    onConfirm: () => Promise<void> | void;
}) {
    const { c } = useTheme();
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (visible) setBusy(false); }, [visible]);

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
                    Oturumu kapat
                </Text>

                <Text style={{
                    color: c.tx2,
                    fontSize: 14,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    lineHeight: 21,
                }}>
                    Bu telefon <Strong>{businessName}</Strong> işletmesine <Strong>bağlı kalır</Strong>.
                    Geri dönünce yalnız şifreniz sorulur; yeni kod gerekmez.
                </Text>

                {/* Ne kaybedilmediği de söyleniyor: korku değil, ölçü. 099 tasarımı
                    listeye ŞİFREYİ de ekledi — en çok sorulan soru "çıkınca şifremi
                    yine mi belirleyeceğim?". */}
                <SheetList
                    head="Silinmeyenler"
                    dot={c.gr}
                    items={['Randevularınız', 'Müşteri geçmişi', 'Telefonun işletme bağlantısı', 'Şifreniz']}
                />
            </View>

            <View style={{
                borderTopWidth: 1,
                borderColor: c.bd,
                paddingHorizontal: M.padX,
                paddingTop: 10,
                paddingBottom: 28,
                gap: 9,
            }}>
                {/* NÖTR, kırmızı değil (099): oturum kapatmak bir yıkım değil, günün
                    sonu. Kırmızı "Bu telefonu işletmeden çıkar"a ait. */}
                <NeutralButton
                    label="Oturumu kapat"
                    busy={busy}
                    onPress={async () => { setBusy(true); await onConfirm(); }}
                />
                <GhostButton label="Vazgeç" onPress={onDismiss} />
            </View>
        </BottomSheet>
    );
}

function Strong({ children }: { children: ReactNode }) {
    const { c } = useTheme();
    return (
        <Text style={{ color: c.tx, fontFamily: font.extraBold, fontWeight: '800' }}>
            {children}
        </Text>
    );
}

/** Liste bloğu — "Silinmeyenler" / "Ne değişir". Her madde kendi rengiyle. */
function SheetList({ head, dot, items }: {
    head: string;
    dot: string;
    items: readonly (string | { text: string; dot: string })[];
}) {
    const { c } = useTheme();
    return (
        <View style={{
            borderWidth: 1, borderColor: c.bd, borderRadius: 16, backgroundColor: c.surf,
            paddingVertical: 12, paddingHorizontal: 14, gap: 8,
        }}>
            <Text style={{ color: c.tx, fontSize: 14.5, fontFamily: font.bold, fontWeight: '700', letterSpacing: 14.5 * -0.015 }}>
                {head}
            </Text>
            {items.map((item) => {
                const text = typeof item === 'string' ? item : item.text;
                const color = typeof item === 'string' ? dot : item.dot;
                return (
                    <View key={text} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                        <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 7, backgroundColor: color }} />
                        <Text style={{ flex: 1, color: c.tx2, fontSize: 13, lineHeight: 18, fontFamily: font.semiBold, fontWeight: '600' }}>
                            {text}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

/** Nötr opak onay — günlük bir iş için; turuncu ve kırmızı değil. */
function NeutralButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={busy}
            onPress={() => { feedback.medium(); onPress(); }}
            style={({ pressed }) => ({
                height: M.buttonHeight,
                borderRadius: M.buttonRadius,
                borderWidth: 1,
                borderColor: c.bd2,
                backgroundColor: c.surf2,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || busy ? 0.6 : 1,
            })}
        >
            <Text style={{ color: c.tx, fontSize: M.buttonText, fontFamily: font.bold, fontWeight: '700' }}>
                {label}
            </Text>
        </Pressable>
    );
}

/**
 * "Bu telefonu işletmeden çıkar" — GERİ DÖNÜŞSÜZ (099 §P6). Kırmızı, fiilin
 * nesnesi telefon. Bedel baştan yazılı: yeni kod. Dördüncü madde yeşil ve
 * kasıtlı — kişinin gerçek korkusu "işimi kaybeder miyim".
 *
 * Koddan düzeltilen tasarım maddesi: şifre SUNUCUDA duruyor, telefondan
 * silinmiyor — o madde yazılmadı.
 */
export function UnlinkSheet({ visible, businessName, onDismiss, onConfirm }: {
    visible: boolean;
    businessName: string;
    onDismiss: () => void;
    onConfirm: () => Promise<void> | void;
}) {
    const { c } = useTheme();
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (visible) setBusy(false); }, [visible]);
    return (
        <BottomSheet visible={visible} onDismiss={onDismiss}>
            <SheetGrab />
            <View style={{ paddingHorizontal: M.padX, paddingBottom: 14, gap: 13 }}>
                <Text style={{ color: c.rd, fontSize: 20, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 20 * -0.025 }}>
                    Bu telefonu işletmeden çıkar
                </Text>
                <Text style={{ color: c.tx2, fontSize: 14, fontFamily: font.semiBold, fontWeight: '600', lineHeight: 21 }}>
                    Bu telefon artık <Strong>{businessName || 'işletmeye'}</Strong> bağlı olmayacak. Geri dönmek için
                    müdürünüzden <Strong>yeni bir kod</Strong> istemeniz gerekir.
                </Text>
                <SheetList
                    head="Ne değişir"
                    dot={c.rd}
                    items={[
                        'Telefonun işletme bağlantısı silinir.',
                        'Geri dönüş yeni bir ekip kodu ister.',
                        { text: 'Randevularınız, müşteri geçmişi ve şifreniz işletmede kalır; hiçbiri silinmez.', dot: c.gr },
                    ]}
                />
            </View>
            <View style={{ borderTopWidth: 1, borderColor: c.bd, paddingHorizontal: M.padX, paddingTop: 10, paddingBottom: 28, gap: 9 }}>
                <DangerButton label="Telefonu çıkar" busy={busy} onPress={async () => { setBusy(true); await onConfirm(); }} />
                <GhostButton label="Vazgeç" onPress={onDismiss} />
            </View>
        </BottomSheet>
    );
}

/** `GhostButton`'ın kırmızı hâli. Dolu zemin YOK — o birincil eyleme ait. */
function DangerButton({ label, busy, onPress }: {
    label: string;
    busy: boolean;
    onPress: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={busy}
            onPress={() => { feedback.medium(); onPress(); }}
            style={({ pressed }) => ({
                height: M.buttonHeight,
                borderRadius: M.buttonRadius,
                borderWidth: 1,
                // Tasarımın `--rdbd` / `--rdfill` değerleri. Jeton yok;
                // projede bu iki değer başka yerlerde de düz yazılıyor.
                borderColor: 'rgba(224,114,114,0.50)',
                backgroundColor: 'rgba(224,114,114,0.10)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || busy ? 0.6 : 1,
            })}
        >
            <Text style={{
                color: c.rd,
                fontSize: M.buttonText,
                fontFamily: font.bold,
                fontWeight: '700',
            }}>
                {busy ? 'Kapatılıyor' : label}
            </Text>
        </Pressable>
    );
}
