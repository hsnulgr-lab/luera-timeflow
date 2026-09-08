/**
 * Personel 12 · formülün GÖVDESİ — tek bileşen, iki kabuk.
 *
 * Aynı formül iki yerde yazılıyor: kumandadaki alt sayfa (`kumanda.tsx`) ve
 * müşteri kartından açılan tam sayfa (`formul.tsx`). Bu iki yüzey ALTI yerde
 * ayrışmıştı — başlık, mod kaynağı, malzeme kaynağı, kaydet etiketleri, kilit
 * satırı ve serbest not. Aynı formülün iki farklı söz vermesi demekti.
 *
 * Artık dört alan, sıra, etiket dili ve kaydet kuralı BURADA. Kabuklara kalan
 * yalnız kimliğin nerede yazıldığı: sayfa tarih · hizmet · imza taşıyor çünkü
 * kart bağlamında kimlik ekranda yok; alt sayfada o üç bilgi arkadaki plakada
 * duruyor ve tekrarlanmıyor.
 *
 * KARŞILAŞTIRMA bu gövdenin asıl işi. Kuaförün altı ay sonra sorduğu tek soru
 * "geçen sefer bu saça ne yapmıştım?" ve karar geçmişe bakarak veriliyor.
 * Kaydırılabilir bir geçmiş şeridi REDDEDİLDİ: dört alanın üstüne beşinci bir
 * bölge kurar ve karşılaştırmayı hafızaya bırakırdı. Onun yerine iki kanal —
 * üstte tek satır hangi ziyaretle karşılaştırıldığını söylüyor, farkın kendisi
 * her alanın KENDİ etiket satırında okunuyor. Dokunuş bedeli sıfır.
 */

import { Pressable, Text, TextInput, View } from 'react-native';

import { Auto, F, Field, Grid, GridButton } from './FormulaFields';
import { Glyph } from './Glyph';
import {
    RATIOS, RESULTS, TONES, WAITS,
    fieldCompare, offList, stepRatio, stepWait,
    type HistoryState, type VisitFormula,
} from '../lib/formula';
import { feedback } from '../lib/feedback';
import { numeric, useTheme } from '../theme';

/** Personelin dokunduğu dört değer. Malzeme burada yok: o adisyondan geliyor. */
export interface FormulaDraft {
    ratio: string | null;
    wait: number | null;
    result: string | null;
    tags: string[];
    note: string;
}

/** Geçen seferin formülü — karşılaştırmanın kaynağı. */
export interface FormulaPrevious {
    dateLabel: string;
    initials: string;
    ratio: string | null;
    waitMinutes: number | null;
    result: string | null;
}

export const emptyDraft = (from?: VisitFormula | null): FormulaDraft => ({
    ratio: from?.ratio ?? null,
    wait: from?.waitMinutes ?? null,
    result: from?.result ?? null,
    tags: from?.tags ?? [],
    note: from?.note ?? '',
});

/**
 * Geçmiş satırı — DOKUNULMAZ.
 *
 * Dokunulsa önceki formülün sayfasını açardı; o da alt sayfayı kapatıp
 * arkadaki sayacı ve adisyonu örterdi. Değerler zaten etiketlerde: bu satır
 * kimlik taşıyor, kapı değil.
 *
 * Üç hâl, üç ayrı cümle. "Geçmiş yok" ile "geçmişte formül yazılmamış" aynı
 * şey değil ve ikisi de boş bir alan olamaz — sıfır bir ölçümdür.
 */
export function HistoryLine({ state, previous, missText }: {
    state: HistoryState;
    previous?: FormulaPrevious | null;
    /** `yok` hâlinde hangi ziyaret olduğunu söyleyen cümle. */
    missText?: string;
}) {
    const { c } = useTheme();
    const flat = (title: string, body: string) => (
        <View
            accessible
            accessibilityLabel={`${title}. ${body}`}
            style={{ gap: 2, minHeight: 42, justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.fld }}
        >
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.tx2 }}>{title}</Text>
            <Text style={{ fontSize: 11.5, fontWeight: '500', color: c.tx3 }}>{body}</Text>
        </View>
    );

    if (state === 'ilk') {
        return flat('Bu müşterinin ilk formülü', 'Karşılaştırma bir sonraki ziyarette başlıyor.');
    }
    if (state === 'yok' || !previous) {
        return flat(
            'Son ziyarette formül yazılmadı',
            missText ?? 'Malzeme geçmemiş, karşılaştıracak değer yok.',
        );
    }

    const values = [previous.ratio, previous.waitMinutes != null ? `${previous.waitMinutes} dk` : null, previous.result]
        .filter(Boolean).join(' · ');
    return (
        <View
            accessible
            accessibilityLabel={`Geçen sefer, ${previous.dateLabel}, ${values}`}
            style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                minHeight: 42, paddingVertical: 9, paddingHorizontal: 12,
                borderRadius: 12, backgroundColor: c.fld,
            }}
        >
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: c.tx3 }}>
                GEÇEN SEFER
            </Text>
            <View style={{
                width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: c.bd2,
            }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: c.tx2 }}>{previous.initials}</Text>
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.tx }}>{previous.dateLabel}</Text>
            <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '500', color: c.tx2 }}>
                {values}
            </Text>
        </View>
    );
}

/**
 * Adım satırı — YALNIZ bir kutu seçildikten sonra çiziliyor.
 *
 * Bu, dördüncü bir kutu açmadan liste dışı değeri mümkün kılan şey:
 * varsayılan yerleşimde tek punto yer tutmuyor, yani seyrek değer sık
 * kararın 68 puntosunu almıyor.
 *
 * Sınırdaki düğme SÖNÜYOR ama duruyor: kaybolan bir düğme, yerleşimi
 * her basışta oynatırdı.
 */
function StepRow({ minus, plus, onMinus, onPlus }: {
    minus: string; plus: string; onMinus: (() => void) | null; onPlus: (() => void) | null;
}) {
    const { c } = useTheme();
    const one = (label: string, action: (() => void) | null) => (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !action }}
            accessibilityLabel={label}
            onPress={action ? () => { feedback.selection(); action(); } : undefined}
            style={({ pressed }) => ({
                flex: 1, height: 52, borderRadius: 16,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd,
                opacity: !action ? 0.32 : pressed ? 0.7 : 1,
            })}
        >
            <Text style={[{ fontSize: 15.5, fontWeight: '700', color: c.tx }, numeric]}>{label}</Text>
        </Pressable>
    );
    return (
        <View style={{ flexDirection: 'row', gap: F.gap, marginTop: F.gap }}>
            {one(minus, onMinus)}
            {one(plus, onPlus)}
        </View>
    );
}

/**
 * Sonucun İKİNCİ ekseni — yalnız bir sonuç seçildikten sonra.
 *
 * Üç kelime tek eksende doğru: derinlik. "Turuncumsu" ve "eşit çıkmadı" o
 * eksende değil; üçe eklemek listeyi altıya çıkarıp ilk kararı
 * bulanıklaştırırdı. Ayrı satır, ayrı alan (`formula.tags`), isteğe bağlı.
 */
function ToneRow({ tags, onToggle }: { tags: string[]; onToggle: (tag: string) => void }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', gap: F.gap, marginTop: F.gap }}>
            {TONES.map((tone) => {
                const on = tags.includes(tone);
                return (
                    <Pressable
                        key={tone}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => { feedback.selection(); onToggle(tone); }}
                        style={({ pressed }) => ({
                            height: 48, paddingHorizontal: 17, borderRadius: 16,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: on ? 'rgba(217,164,59,0.14)' : c.fld,
                            borderWidth: 1,
                            borderColor: on ? 'rgba(217,164,59,0.38)' : c.bd,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text style={{ fontSize: 14.5, fontWeight: on ? '700' : '600', color: on ? c.am : c.tx2 }}>
                            {tone}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Alanın etiketi — sağında karşılaştırma. Fark burada okunuyor. */
function cmpNote(state: HistoryState, previous: string | null, current: string | null) {
    return fieldCompare(state, previous, current);
}

export function FormulaBody({
    materials, draft, locked, written, history, previous, missText,
    measured, waitSpan, fixing, onFix, onChange, onNote, materialNote, onMaterial,
}: {
    /** Adisyondan gelen malzeme — personelin girdisi DEĞİL. */
    materials: [string, string][];
    draft: FormulaDraft;
    locked: boolean;
    written: boolean;
    history: HistoryState;
    previous?: FormulaPrevious | null;
    missText?: string;
    /** Sayaçtan ölçülen bekleme. Doluysa alan okunur ve "Düzelt" çıkıyor. */
    measured: number | null;
    waitSpan?: string;
    /** "Düzelt"e basıldı: bedelin cümlesi açıldı, ızgara elle girişe döndü. */
    fixing: boolean;
    onFix: () => void;
    onChange: (next: FormulaDraft) => void;
    /** Serbest not AYRI ADIM — klavye gövdenin üstüne değil, yerine geliyor. */
    onNote: () => void;
    materialNote: string;
    /** Malzeme yanlışsa düzeltme adisyonda. Yol yoksa satır dokunulmaz. */
    onMaterial?: () => void;
}) {
    const { c } = useTheme();
    const set = (patch: Partial<FormulaDraft>) => onChange({ ...draft, ...patch });

    // Sayaç çalıştıysa ve düzeltilmiyorsa bekleme OKUNUR.
    const waitRead = measured != null && !fixing;
    const ratioOff = offList.ratio(draft.ratio);
    const waitOff = offList.wait(draft.wait);
    // Liste dışı değerde hangi kutudan çıkıldığı işaretli kalıyor.
    const ratioBox = ratioOff ? RATIOS[RATIOS.length - 1] : draft.ratio;
    const waitBox = waitOff ? WAITS[WAITS.length - 1] : draft.wait;

    const label = (text: string, note: { text: string; strong: boolean }) => (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89, color: c.tx3 }}>
                {text}
            </Text>
            {note.text ? (
                <Text style={{
                    marginLeft: 'auto', fontSize: 11,
                    fontWeight: note.strong ? '700' : '600',
                    color: note.strong ? c.tx2 : c.tx3,
                }}>
                    {note.text}
                </Text>
            ) : null}
        </View>
    );

    /** Geçen sefer basılan kutunun altındaki 5 pt nokta. */
    const Mark = ({ on }: { on: boolean }) => (on ? (
        <View style={{
            position: 'absolute', bottom: 8, alignSelf: 'center',
            width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.tx3,
        }} />
    ) : null);

    const prevRatio = history === 'var' ? previous?.ratio ?? null : null;
    const prevWait = history === 'var' && previous?.waitMinutes != null ? `${previous.waitMinutes} dk` : null;
    const prevResult = history === 'var' ? previous?.result ?? null : null;

    return (
        <>
            {/* 1 · MALZEME — her modda okunur, adisyondan geliyor. */}
            <Field label="kullanılan malzeme" note={materialNote}>
                {onMaterial && !locked ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Malzemeyi adisyonda düzelt"
                        onPress={() => { feedback.selection(); onMaterial(); }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                        <Auto rows={materials} />
                    </Pressable>
                ) : <Auto rows={materials} />}
            </Field>

            {/* 2 · ORAN — üç kutu; liste dışı değer ADIM satırıyla giriliyor. */}
            <View style={{ gap: 8, paddingTop: 8, paddingHorizontal: 2 }}>
                {label('oran', locked
                    ? { text: '', strong: false }
                    : ratioOff && prevRatio
                        ? { text: `${prevRatio} → ${draft.ratio} · liste dışı`, strong: true }
                        : cmpNote(history, prevRatio, draft.ratio))}
                {locked ? (
                    <Auto rows={[[draft.ratio ?? '—', ratioOff ? 'liste dışı' : '']]} />
                ) : (
                    <>
                        <Grid>
                            {RATIOS.map((value) => (
                                <View key={value}>
                                    <GridButton
                                        label={ratioOff && value === ratioBox ? (draft.ratio ?? value) : value}
                                        big
                                        on={value === ratioBox}
                                        onPress={() => { feedback.selection(); set({ ratio: value }); }}
                                    />
                                    <Mark on={history === 'var' && value === prevRatio && !ratioOff} />
                                </View>
                            ))}
                        </Grid>
                        {draft.ratio ? (
                            <StepRow
                                minus="− 0,5"
                                plus="+ 0,5"
                                onMinus={stepRatio(draft.ratio, -1) ? () => set({ ratio: stepRatio(draft.ratio, -1) }) : null}
                                onPlus={stepRatio(draft.ratio, 1) ? () => set({ ratio: stepRatio(draft.ratio, 1) }) : null}
                            />
                        ) : null}
                    </>
                )}
            </View>

            {/* 3 · BEKLEME — üç hâl: ölçüldü · elle girildi · sayaç kurulmadı. */}
            <View style={{ gap: 8, paddingTop: 8, paddingHorizontal: 2 }}>
                {label('bekleme', locked
                    ? { text: '', strong: false }
                    : waitOff && prevWait
                        ? { text: `${prevWait} → ${draft.wait} dk · liste dışı`, strong: true }
                        : cmpNote(history, prevWait, draft.wait != null ? `${draft.wait} dk` : null))}

                {locked || waitRead ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                            <Auto rows={[[
                                `${(locked ? draft.wait : measured) ?? '—'} dk`,
                                measured != null ? (waitSpan ? `ölçüldü · ${waitSpan}` : 'ölçüldü') : 'elle girildi',
                            ]]} />
                        </View>
                        {/* Ölçülen değer SALT OKUNUR DEĞİL: boya son 10 dakikada
                            erken yıkanmış olabilir ve altı ay sonra okunacak kayıt
                            yanlış kalır. */}
                        {!locked ? (
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => { feedback.selection(); onFix(); }}
                                style={({ pressed }) => ({
                                    height: 44, paddingHorizontal: 15, borderRadius: 14,
                                    alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd2,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.tx }}>Düzelt</Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : (
                    <>
                        {/* Kayıt İKİ DEĞERİ birden saklayamıyor: `waitSource`
                            yalnız 'timer' | 'manual'. O yüzden bedel düzeltmeden
                            ÖNCE söyleniyor. */}
                        {fixing && measured != null ? (
                            <Text style={{ fontSize: 11.5, fontWeight: '500', lineHeight: 17.25, color: c.am, maxWidth: 320, paddingBottom: 4 }}>
                                Düzeltirsen kayıt <Text style={{ fontWeight: '700' }}>elle girildi</Text> der —
                                sayacın ölçtüğü {measured} dk saklanmıyor, kayıtta iki değer yok.
                            </Text>
                        ) : null}
                        <Grid>
                            {WAITS.map((value) => (
                                <View key={value}>
                                    <GridButton
                                        label={String(waitOff && value === waitBox ? draft.wait : value)}
                                        unit="dk"
                                        big
                                        on={value === waitBox}
                                        onPress={() => { feedback.selection(); set({ wait: value }); }}
                                    />
                                    <Mark on={history === 'var' && `${value} dk` === prevWait && !waitOff} />
                                </View>
                            ))}
                        </Grid>
                        {draft.wait != null ? (
                            <StepRow
                                minus="− 5 dk"
                                plus="+ 5 dk"
                                onMinus={stepWait(draft.wait, -1) != null ? () => set({ wait: stepWait(draft.wait, -1) }) : null}
                                onPlus={stepWait(draft.wait, 1) != null ? () => set({ wait: stepWait(draft.wait, 1) }) : null}
                            />
                        ) : null}
                        {measured == null && !fixing ? (
                            <Text style={{ fontSize: 11.5, fontWeight: '500', lineHeight: 17.25, color: c.tx3 }}>
                                Sayaç kurulmadı — kayda <Text style={{ fontWeight: '700' }}>elle</Text> düşüyor.
                            </Text>
                        ) : null}
                    </>
                )}
            </View>

            {/* 4 · SONUÇ — üç kelime, artı isteğe bağlı ikinci eksen. */}
            <View style={{ gap: 8, paddingTop: 8, paddingHorizontal: 2 }}>
                {label('sonuç', locked ? { text: '', strong: false } : cmpNote(history, prevResult, draft.result))}
                {locked ? (
                    <Auto rows={[[
                        [draft.result, ...draft.tags].filter(Boolean).join(' · ') || '—', '',
                    ]]} />
                ) : (
                    <>
                        <Grid>
                            {RESULTS.map((option) => (
                                <View key={option.label}>
                                    <GridButton
                                        label={option.label}
                                        on={draft.result === option.label}
                                        tone={option.tone}
                                        onPress={() => { feedback.selection(); set({ result: option.label }); }}
                                    />
                                    <Mark on={history === 'var' && option.label === prevResult} />
                                </View>
                            ))}
                        </Grid>
                        {draft.result ? (
                            <ToneRow
                                tags={draft.tags}
                                onToggle={(tone) => set({
                                    tags: draft.tags.includes(tone)
                                        ? draft.tags.filter((t) => t !== tone)
                                        : [...draft.tags, tone],
                                })}
                            />
                        ) : null}
                    </>
                )}
            </View>

            {/* 5 · SERBEST NOT — kilitliyken okunur, açıkken AYRI ADIM.
                Klavye gövdenin üstüne değil YERİNE geliyor: eskiden not alanı
                ve kaydet düğmesi 375 pt'lik telefonda klavyenin altında
                kalıyordu. */}
            {locked ? (
                <Field label="serbest not" note="yazıldığı gibi">
                    <Auto long={draft.note || '—'} />
                </Field>
            ) : (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={draft.note ? `Serbest not: ${draft.note}` : 'Serbest not yaz'}
                    onPress={() => { feedback.selection(); onNote(); }}
                    style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        minHeight: 44, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10,
                        borderRadius: 16, backgroundColor: c.surf2,
                        borderWidth: 1, borderColor: c.bd,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89, color: c.tx3 }}>
                        NOT
                    </Text>
                    <Text numberOfLines={1} style={{
                        flex: 1, fontSize: 13.5, fontWeight: '500',
                        color: draft.note ? c.tx : c.tx3,
                    }}>
                        {draft.note || 'Kendi cümlenle yaz…'}
                    </Text>
                    <Glyph name="chev" size={16} color={c.tx3} />
                </Pressable>
            )}
            {/* `written` yalnız kaydet etiketini belirliyor; gövde onu okumuyor. */}
            {written ? null : null}
        </>
    );
}

/** Serbest notun kendi adımı — kaydet düğmesi burada ÇİZİLMİYOR. */
export function NoteStep({ value, onChange, onDone }: {
    value: string; onChange: (next: string) => void; onDone: () => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <TextInput
                value={value}
                onChangeText={onChange}
                autoFocus
                placeholder="Kendi cümlenle yaz…"
                placeholderTextColor={c.tx3}
                selectionColor={c.or}
                multiline
                style={{
                    padding: 14, paddingHorizontal: 15, borderRadius: 18,
                    backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd,
                    minHeight: 96, fontSize: 15, fontWeight: '500', lineHeight: 21.75, color: c.tx,
                }}
            />
            <Text style={{ fontSize: 11.5, fontWeight: '500', lineHeight: 17.25, color: c.tx3 }}>
                Kaydet düğmesi bu adımda çizilmiyor — klavyenin altında kalan bir düğme yok.
            </Text>
            <Pressable
                accessibilityRole="button"
                onPress={() => { feedback.medium(); onDone(); }}
                style={({ pressed }) => ({
                    height: F.button, borderRadius: F.buttonRadius, backgroundColor: c.surf2,
                    borderWidth: 1, borderColor: c.bd2,
                    alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.9 : 1,
                })}
            >
                <Text style={{ fontSize: 17, fontWeight: '800', color: c.tx }}>Bitti</Text>
            </Pressable>
        </View>
    );
}
