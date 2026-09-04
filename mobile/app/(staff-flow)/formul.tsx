/**
 * Personel 08 — ziyaretin formül sayfası.
 *
 * Dört alan, SABİT SIRA: malzeme · oran · bekleme · sonuç. Sıra her yerde
 * aynı — yazarken, kartta, farkta — çünkü karşılaştırmayı mümkün kılan şey
 * sabit hiza.
 *
 * Dört mod, hepsi aynı gövde:
 *   edit        formül var, adisyon açık → düzeltilebilir
 *   new         formül yok, adisyon açık → sonradan yazılıyor
 *   locked      adisyon kasada, formül var → yalnız okunur
 *   lockedEmpty adisyon kasada, formül yok → boşluk kayda böyle düştü
 *
 * KİLİT VERİDEN geliyor (`isLocked`), saklanan bir bayraktan değil. Kısık
 * bir "düzelt" düğmesi YOK: yapılamayan görünmüyor, sebebi görünüyor.
 *
 * Klavye yalnız serbest notta açılıyor. Oran ve sonuç hazır seçenek, çünkü
 * eller boyalı ve eldivenli — klavye bu kullanıcı için düşmanca.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph } from '../../src/components/Glyph';
import {
    Auto, F, Field, Grid, GridButton, LockLine, Signature,
} from '../../src/components/FormulaFields';
import { RATIOS, RESULTS, WAITS, type FormulaMode } from '../../src/lib/formula';
import { feedback } from '../../src/lib/feedback';
import { font, useTheme } from '../../src/theme';

const PAD = 20;

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
    const measured = params.wait ? Number(params.wait) : null;

    const [ratio, setRatio] = useState<string | null>(params.ratio ?? null);
    const [result, setResult] = useState<string | null>(params.result ?? null);
    const [wait, setWait] = useState<number | null>(measured);
    const [note, setNote] = useState(params.note ?? '');

    const pad = small ? 16 : PAD;
    const dateParts = (params.date ?? '').split(' ');

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
                {/* 1 · MALZEME — her modda okunur, adisyondan geliyor. */}
                <Field label="kullanılan malzeme" note="adisyondan">
                    <Auto rows={[['Boya · 7.3 kumral', '×2'], ['Oksidan %6', '×1']]} />
                </Field>

                {mode === 'lockedEmpty' ? (
                    <>
                        <Text style={{
                            fontSize: 11.5, fontWeight: '500', lineHeight: 17.25,
                            color: c.tx2, maxWidth: 320, paddingTop: 10,
                        }}>
                            <Text style={{ fontWeight: '700' }}>Oran, bekleme ve sonuç girilmemiş.</Text>
                            {' '}Bu ziyarette malzeme geçmiş ama formül yazılmamış; boşluk kayda böyle
                            düşüyor ve artık doldurulamıyor.
                        </Text>
                        <LockLine at={params.lockedAt} />
                    </>
                ) : (
                    <>
                        {/* 2 · ORAN — klavye yok, hazır seçenek. */}
                        <Field label="oran">
                            {locked ? <Auto rows={[[ratio ?? '—', '']]} /> : (
                                <Grid columns={4}>
                                    {RATIOS.map((value) => (
                                        <GridButton
                                            key={value}
                                            label={value}
                                            big
                                            on={ratio === value}
                                            onPress={() => { feedback.selection(); setRatio(value); }}
                                        />
                                    ))}
                                    <GridButton label="±" sub="adım" big on={false} onPress={() => feedback.selection()} />
                                </Grid>
                            )}
                        </Field>

                        {/* 3 · BEKLEME — sayaçtan geldiyse okunur, gelmediyse elle.
                            Alan HER İKİ hâlde de çiziliyor: kaldırmak dört alanın
                            sabit sırasını bozardı, boş bırakmak ölçülmemişle sıfırı
                            karıştırırdı. */}
                        <Field
                            label="bekleme"
                            note={measured != null ? 'sayaçtan' : locked ? '' : 'sayaç kurulmadı'}
                        >
                            {locked || measured != null ? (
                                <Auto rows={[[`${wait ?? measured} dk`, params.waitSpan ?? '']]} />
                            ) : (
                                <Grid columns={4}>
                                    {WAITS.map((value) => (
                                        <GridButton
                                            key={value}
                                            label={String(value)}
                                            unit="dk"
                                            big
                                            on={wait === value}
                                            onPress={() => { feedback.selection(); setWait(value); }}
                                        />
                                    ))}
                                    <GridButton label="±" sub="adım" big on={false} onPress={() => feedback.selection()} />
                                </Grid>
                            )}
                        </Field>

                        {/* 4 · SONUÇ — ölçek değil, üç kelime. */}
                        <Field label="sonuç">
                            {locked ? <Auto rows={[[result ?? '—', '']]} /> : (
                                <Grid columns={3}>
                                    {RESULTS.map((option) => (
                                        <GridButton
                                            key={option.label}
                                            label={option.label}
                                            on={result === option.label}
                                            tone={option.tone}
                                            onPress={() => { feedback.selection(); setResult(option.label); }}
                                        />
                                    ))}
                                </Grid>
                            )}
                        </Field>

                        {/* Klavyenin açıldığı TEK alan — ve en sonda. */}
                        <Field label="serbest not" note={locked ? 'yazıldığı gibi' : 'isteğe bağlı'}>
                            {locked ? (
                                <Auto long={note || '—'} />
                            ) : (
                                <TextInput
                                    value={note}
                                    onChangeText={setNote}
                                    placeholder="Kendi cümlenle yaz…"
                                    placeholderTextColor={c.tx3}
                                    selectionColor={c.or}
                                    multiline
                                    style={{
                                        padding: 14, paddingHorizontal: 15,
                                        borderRadius: F.radius,
                                        backgroundColor: c.surf2,
                                        borderWidth: 1, borderColor: c.bd,
                                        minHeight: 52,
                                        fontSize: 15, fontWeight: '500', lineHeight: 21.75,
                                        color: c.tx,
                                    }}
                                />
                            )}
                        </Field>

                        {!locked && measured == null ? (
                            <Text style={{
                                fontSize: 11.5, fontWeight: '500', lineHeight: 17.25,
                                color: c.am, maxWidth: 320, paddingTop: 10,
                            }}>
                                Sayaç kurulmadığı için bekleme ölçülmedi. Alan çizilmeye devam ediyor —
                                dört alanın sırası her yerde aynı — ama tek dokunuşla elle giriliyor ve
                                kayda <Text style={{ fontWeight: '700' }}>elle</Text> düşüyor.
                            </Text>
                        ) : null}

                        {locked ? <LockLine at={params.lockedAt} /> : null}
                    </>
                )}
            </ScrollView>

            {/* Kaydet düğmesi yalnız açık adisyonda. Kilitliyken kısık bir
                düğme DEĞİL, hiç düğme yok: ölü kontrol yok. */}
            {locked ? null : (
                <View style={{ paddingHorizontal: pad, paddingTop: 14, paddingBottom: 30 + insets.bottom }}>
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
                            {mode === 'new'
                                ? 'Formülü yaz'
                                : ratio && result ? 'Düzeltmeyi kaydet' : 'Şimdilik böyle kaydet'}
                        </Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

