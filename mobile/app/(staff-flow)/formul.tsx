/**
 * Personel 08/12 — ziyaretin formül SAYFASI.
 *
 * Gövde artık burada değil: dört alan, sıra, etiket dili ve kaydet kuralı
 * `src/components/FormulaBody.tsx` içinde ve kumandadaki alt sayfayla AYNI
 * bileşen. İki yüzey altı yerde ayrışmıştı; ayrışma kabuğun dışına taşındı.
 *
 * Bu kabuğun taşıdığı fazlalık tarih · hizmet · imza: müşteri kartından
 * açıldığında ekranda başka hiçbir kimlik yok, kaydın kime ve hangi güne ait
 * olduğunu sayfanın kendisi söylemek zorunda. Alt sayfada o üç bilgi arkadaki
 * plakada duruyor, o yüzden orada tekrarlanmıyor.
 *
 * Dört mod, hepsi aynı gövde:
 *   edit        formül var, adisyon açık → düzeltilebilir
 *   new         formül yok, adisyon açık → sonradan yazılıyor
 *   locked      adisyon kasada, formül var → yalnız okunur
 *   lockedEmpty adisyon kasada, formül yok → boşluk kayda böyle düştü
 *
 * KİLİT VERİDEN geliyor (`isLocked`), saklanan bir bayraktan değil. Kısık bir
 * "düzelt" düğmesi YOK: yapılamayan görünmüyor, sebebi görünüyor.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph } from '../../src/components/Glyph';
import { F, LockLine, Signature } from '../../src/components/FormulaFields';
import {
    FormulaBody, HistoryLine, NoteStep, emptyDraft,
    type FormulaDraft, type FormulaPrevious,
} from '../../src/components/FormulaBody';
import { historyState, saveLabel, type FormulaMode } from '../../src/lib/formula';
import { feedback } from '../../src/lib/feedback';
import { font, useTheme } from '../../src/theme';

const PAD = 20;

/**
 * `customer` ucu bağlanana kadar sahte. Malzeme ve geçen seferin formülü
 * sunucudan gelecek — `090_visit_formula.sql` müşterinin formül geçmişi için
 * indeksi zaten açtı.
 */
const DEMO_MATERIALS: [string, string][] = [
    ['Boya · 7.3 kumral', '×2'],
    ['Oksidan %6', '×1'],
];
const DEMO_PREVIOUS: FormulaPrevious = {
    dateLabel: '12 Mart',
    initials: 'MK',
    ratio: '1:1,5',
    waitMinutes: 35,
    result: 'açık kaldı',
};

type Params = {
    /** Ziyaret kimliği — sunucuya bağlanınca formül buradan yüklenecek. */
    id?: string;
    from?: string;
    mode?: FormulaMode;
    date?: string;
    service?: string;
    minutes?: string;
    /** Bekleme sayaçtan ölçüldüyse dakikası ve aralığı. */
    wait?: string;
    waitSpan?: string;
    ratio?: string;
    result?: string;
    note?: string;
    who?: string;
    initials?: string;
    mine?: string;
    lockedAt?: string;
};

export default function FormulaScreen() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<Params>();

    const mode: FormulaMode = params.mode ?? 'new';
    const locked = mode === 'locked' || mode === 'lockedEmpty';
    const written = mode === 'edit' || mode === 'locked';
    const measured = params.wait ? Number(params.wait) : null;

    const [draft, setDraft] = useState<FormulaDraft>(() => ({
        ...emptyDraft(),
        ratio: params.ratio ?? null,
        result: params.result ?? null,
        wait: measured,
        note: params.note ?? '',
    }));
    const [fixing, setFixing] = useState(false);
    const [noteStep, setNoteStep] = useState(false);

    const pad = small ? 16 : PAD;
    const dateParts = (params.date ?? '').split(' ');
    const history = historyState(
        // Kilitli-boş hâlde karşılaştırma çizilmiyor: ortada karar yok, belge var.
        mode === 'lockedEmpty' ? null : { ...emptyDraft(), materials: [], waitSource: 'manual', staffId: null, writtenAt: null, ratio: DEMO_PREVIOUS.ratio, waitMinutes: DEMO_PREVIOUS.waitMinutes, result: DEMO_PREVIOUS.result, note: null },
        true,
    );
    const save = saveLabel(written, draft, measured != null && !fixing);

    if (noteStep) {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: pad, height: 52 }}>
                    <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: c.tx }}>Serbest not</Text>
                </View>
                <NoteStep
                    value={draft.note}
                    onChange={(note) => setDraft({ ...draft, note })}
                    onDone={() => setNoteStep(false)}
                />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={({ pressed }) => ({
                    height: 44, flexDirection: 'row', alignItems: 'center', gap: 2,
                    paddingHorizontal: 14, opacity: pressed ? 0.55 : 1,
                })}
            >
                <Glyph name="back" size={22} color={c.tx2} />
                <Text style={{ color: c.tx2, fontSize: 15, fontWeight: '600' }}>
                    {params.from ?? 'Geri'}
                </Text>
            </Pressable>

            {/* Başlık ziyaretin kendisi: tarih, hizmet, süre — ve imza. */}
            <View style={{ gap: 7, paddingHorizontal: pad, paddingTop: 2, paddingBottom: 10 }}>
                <Text style={{
                    // 1.02 büyük harfin üstündeki işareti kırpıyor (bkz. müşteri
                    // sayfası): "Ö" noktasız çıkıyordu.
                    fontSize: small ? 26 : 30, lineHeight: (small ? 26 : 30) * 1.22,
                    letterSpacing: -(small ? 26 : 30) * 0.035,
                    fontFamily: font.extraLight, color: c.tx2,
                }}>
                    {dateParts[0]}{' '}
                    <Text style={{ fontFamily: font.bold, color: c.tx }}>{dateParts.slice(1).join(' ')}</Text>
                </Text>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.tx3 }}>
                    {params.service}{params.minutes ? ` · ${params.minutes} dk` : ''}
                </Text>
                <Signature
                    initials={params.initials ?? '??'}
                    mine={params.mine === '1'}
                    text={
                        mode === 'lockedEmpty'
                            ? `${params.mine === '1' ? 'Sen baktın' : `${params.who} baktı`} · formül yazılmadı`
                            : mode === 'new'
                                ? 'Bu ziyarette formül yazılmamış · adisyon açık'
                                : `${params.mine === '1' ? 'Sen yazdın' : `${params.who} yazdı`} · ${params.date}`
                    }
                />
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {mode === 'lockedEmpty' ? (
                    <>
                        <Text style={{
                            fontSize: 11.5, fontWeight: '500', lineHeight: 17.25,
                            color: c.tx2, maxWidth: 320, paddingTop: 10,
                        }}>
                            {/* Kilitli-boş hâlin TEK kararlaştırılmış cümlesi —
                                kumandadaki alt sayfa da birebir aynısını yazıyor. */}
                            <Text style={{ fontWeight: '700' }}>Bu ziyarette formül yazılmadı.</Text>
                            {' '}Malzeme geçti, oran · bekleme · sonuç girilmedi; adisyon kasaya
                            gittiğinde boşluk kayda böyle düştü.
                        </Text>
                        <LockLine at={params.lockedAt} />
                    </>
                ) : (
                    <>
                        {locked ? null : (
                            <View style={{ paddingBottom: 2 }}>
                                <HistoryLine state={history} previous={DEMO_PREVIOUS} />
                            </View>
                        )}
                        <FormulaBody
                            materials={DEMO_MATERIALS}
                            draft={draft}
                            locked={locked}
                            written={written}
                            history={locked ? 'ilk' : history}
                            previous={DEMO_PREVIOUS}
                            measured={measured}
                            waitSpan={params.waitSpan}
                            fixing={fixing}
                            onFix={() => setFixing(true)}
                            onChange={setDraft}
                            onNote={() => setNoteStep(true)}
                            // Kart bağlamında adisyona inecek bir yol YOK: satır
                            // dokunulmaz ve etiket sebebini söylüyor.
                            materialNote={locked ? 'adisyondan · kilitli' : 'adisyondan'}
                        />
                        {locked ? <LockLine at={params.lockedAt} /> : null}
                    </>
                )}
            </ScrollView>

            {/* Kaydet düğmesi yalnız açık adisyonda. Kilitliyken kısık bir
                düğme DEĞİL, hiç düğme yok: ölü kontrol yok. */}
            {locked ? null : (
                <View style={{ paddingHorizontal: pad, paddingTop: 14, paddingBottom: 30 + insets.bottom, gap: 8 }}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => { feedback.medium(); router.back(); }}
                        style={({ pressed }) => ({
                            height: F.button, borderRadius: F.buttonRadius,
                            backgroundColor: c.or,
                            alignItems: 'center', justifyContent: 'center',
                            opacity: pressed ? 0.9 : 1,
                        })}
                    >
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                            {save.label}
                        </Text>
                    </Pressable>
                    {/* "Şimdilik" kaldırıldı: tutulamayan sözü etiketin kendisi
                        veriyordu. Alt satır imkânı söylüyor, tehdit etmiyor. */}
                    {save.note ? (
                        <Text style={{ fontSize: 11.5, fontWeight: '500', lineHeight: 17.25, color: c.tx3, textAlign: 'center' }}>
                            {save.note}
                        </Text>
                    ) : null}
                </View>
            )}
        </View>
    );
}
