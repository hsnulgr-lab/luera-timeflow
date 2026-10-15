/**
 * Personel 15 · iş sürerken adisyon, sade (Yol A) — iki kabukta (tek kişilik ve ekip).
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Personel 15 Adisyon Sade.html`.
 * Ölçüler o dosyanın CSS'inden; kararlar `lib/adisyonSade.ts`te.
 *
 * Kullanıcının dört derdi ve buradaki cevabı:
 *   çok fazla bölüm     → sayfa dokuz katmandan dörde: toplam · ekleme · kalemler · malzeme
 *   soluk / küçük yazı  → okunan hiçbir yazı 13 pt altında değil; `tx2` koyulaştı
 *                         (YALNIZ bu ekranlarda — kullanıcı kararı), `tx3` yazıda yok
 *   tutar anlaşılmıyor  → maske adını ve süresini söylüyor ("Göster · 6 sn");
 *                         toplam randevu hizmetini de içeriyor
 *   ekleme zor          → "eklendi" üç yerde ve KALICI; adet / kaldırma ayrı panelde
 *
 * Renk işarette, yazı mürekkepte: açık temada turuncu, amber, yeşil ve kırmızı
 * yazı 4.5:1'i tutmuyor — orada yazı mürekkep, renk nokta / çizgi / çerçevede.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';

import { Glyph } from './Glyph';
import { DOOR_H } from './FormulaDoorRow';
import { DELETE_MS, KIND_NAME, money, type AdisyonLine, type CatalogItem } from '../lib/adisyon';
import {
    RECEIPT_IDLE, editNote, formulaFace, frequentHead, newestFirst, receiptParts, stripLine, undoNote,
    type Receipt, type ServiceRow,
} from '../lib/adisyonSade';
import type { FormulaDoor } from '../lib/formula';
import { feedback } from '../lib/feedback';
import { SADE_MS, sadeFont as hk, useSadeInk } from '../lib/sadeInk';
import { numeric, useTheme } from '../theme';

// ── Zaman ───────────────────────────────────────────────────────────────────

/**
 * Kalan saniye — fitil dursa da (hareketi azalt) bilgi durmuyor. Üst sınır
 * pencerenin kendisi: saat geride kalmış bir ilk çizim "9" yazamasın.
 */
function useSecondsLeft(until: number | null, total = SADE_MS): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (until == null) return undefined;
        const id = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(id);
    }, [until]);
    if (until == null) return 0;
    return Math.min(Math.ceil(total / 1000), Math.max(1, Math.ceil((until - now) / 1000)));
}

/**
 * Fitil — SOL UÇ SABİT, sağ uç sola yürür.
 *
 * Eski geri alma fitili `scaleX` ile ORTAYA kısalıyordu (telefonda görüldü).
 * Burada kaplayıcı `overflow: hidden`, çizgi kendi genişliği kadar sola
 * kayıyor: `translateX 0 → −genişlik · linear`. Hareketi azaltınca çizgi yok;
 * kalan saniye düğmede yazılı.
 */
export function LeftFuse({ until, total = SADE_MS, height = 3 }: { until: number; total?: number; height?: number }) {
    const { c, reduceMotion } = useTheme();
    const [width, setWidth] = useState(0);
    const [x] = useState(() => new Animated.Value(0));

    useEffect(() => {
        if (reduceMotion || width === 0) return undefined;
        const left = Math.max(0, until - Date.now());
        x.setValue(-width * (1 - left / total));
        const run = Animated.timing(x, {
            toValue: -width, duration: left, easing: Easing.linear, useNativeDriver: true,
        });
        run.start();
        return () => run.stop();
    }, [until, total, width, reduceMotion, x]);

    if (reduceMotion) return null;
    return (
        <View
            pointerEvents="none"
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height, overflow: 'hidden' }}
        >
            <Animated.View style={{
                width: '100%', height, backgroundColor: c.am, transform: [{ translateX: x }],
            }} />
        </View>
    );
}

// ── Tutar ───────────────────────────────────────────────────────────────────

/**
 * Tutar — AÇIK. Maske YOK (kullanıcı kararları, 2026-10-15): önce tek
 * kişilikte kalktı — tutarı müşteriye sahip zaten kendisi söylüyor; "Göster"e
 * basıp 6 sn beklemek her tahsilatta fazladan bir adımdı ve "tutar
 * anlaşılmıyor" derdinin yarısıydı. Sonra ekipte de: "açık, tek kişilik gibi".
 */
/**
 * `null`: tutarı KASA hesaplıyor (D6 — paket, indirim, ön ödeme, grup).
 * Yerine sönük bir çizgi; neden olduğunu güvertenin üstündeki satır söylüyor.
 * Bir rakam yazmak, Kasa'nın tahsil edeceğinden farklı bir rakam olurdu.
 */
function Amount({ value, size, weight = 800, spacing = 0, color }: {
    value: number | null;
    size: number;
    weight?: 700 | 800;
    spacing?: number;
    color?: string;
}) {
    const ink = useSadeInk();
    return (
        <Text style={[{
            ...hk(weight), fontSize: size, letterSpacing: spacing,
            color: value === null ? ink.tx2 : color ?? ink.c.tx,
        }, numeric]}>
            {value === null ? '—' : money(value)}
        </Text>
    );
}

// ── Şerit ───────────────────────────────────────────────────────────────────

/**
 * Kumandadaki adisyon şeridi.
 *
 *   iş sürerken  → üstte ne var ("4 kalem · son …"), altta ne kadar ("Toplam ₺2.720")
 *   kapanışta    → yalnız "Kalem ekle": sayı ve tutar hemen üstteki kadranda,
 *                  son eklenen listenin en üstünde — üçünü ikinci kez yazmak
 *                  ekranı kalabalıklaştırıyordu (kullanıcı kararı, 2026-10-15)
 *   mühürlü      → bir etiket
 */
export function SadeStrip({ count, lastName, total, onOpen, variant = 'running' }: {
    count: number;
    lastName: string | null;
    /** `null`: tutarı Kasa hesaplıyor (D6). */
    total: number | null;
    onOpen: () => void;
    variant?: 'running' | 'closing' | 'sealed';
}) {
    const ink = useSadeInk();
    const line = stripLine(count, lastName);
    const sealed = variant === 'sealed';
    const plus = (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kalem ekle"
            onPress={onOpen}
            style={({ pressed }) => ({
                width: 56, height: 44, borderRadius: 15,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: ink.orbg, borderWidth: 1, borderColor: ink.c.or,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <Glyph name="plus" size={24} color={ink.c.or2} width={2} />
        </Pressable>
    );
    const row = {
        flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
        minHeight: 56, paddingVertical: 6, paddingRight: 6, paddingLeft: 16,
    };
    return (
        <View style={{
            marginHorizontal: 20, borderRadius: 24, overflow: 'hidden',
            backgroundColor: sealed ? 'transparent' : ink.c.surf,
            borderWidth: 1, borderColor: sealed ? 'transparent' : ink.c.bd2,
        }}>
            {sealed ? (
                <View style={row}>
                    <Text numberOfLines={1} style={{ flex: 1, ...hk(600), fontSize: 15, color: ink.tx2 }}>
                        Mühürlü · değiştirilemez
                    </Text>
                    <View style={{ marginRight: 10 }}>
                        <Glyph name="lock" size={22} color={ink.tx2} />
                    </View>
                </View>
            ) : variant === 'closing' ? (
                <View style={row}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Adisyona kalem ekle"
                        onPress={onOpen}
                        style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                    >
                        <Text style={{ ...hk(600), fontSize: 15, color: ink.c.tx }}>Kalem ekle</Text>
                    </Pressable>
                    {plus}
                </View>
            ) : (
                <>
                    <View style={row}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Adisyon, ${line.count}, ${line.tail}`}
                            onPress={onOpen}
                            style={({ pressed }) => ({
                                flex: 1, minWidth: 0, minHeight: 44,
                                flexDirection: 'row', alignItems: 'center', gap: 4,
                                opacity: pressed ? 0.6 : 1,
                            })}
                        >
                            <Text numberOfLines={1} style={{ flexShrink: 1, ...hk(500), fontSize: 15, color: ink.tx2 }}>
                                <Text style={{ ...hk(700), color: ink.c.tx }}>{line.count}</Text>
                                {` · ${line.tail}`}
                            </Text>
                            <Glyph name="chev" size={18} color={ink.tx2} />
                        </Pressable>
                        {plus}
                    </View>
                    <View style={{ ...row, paddingRight: 16, borderTopWidth: 1, borderTopColor: ink.c.bd }}>
                        <Text style={{ flex: 1, ...hk(600), fontSize: 15, color: ink.tx2 }}>Toplam</Text>
                        <Amount value={total} size={20} spacing={-0.4} />
                    </View>
                </>
            )}
        </View>
    );
}

// ── Formül satırı ───────────────────────────────────────────────────────────

/**
 * Formülün kapısı, sade yüzü. Sol kenar hâli söylüyor: amber yazılmadı,
 * yarı amber yarım, yeşil yazıldı. Kumandada şeridin altında bir kart;
 * adisyon sayfasında malzeme başlığının hemen altında bir satır.
 */
export function SadeFormulaRow({ door, materials, card = false, onPress }: {
    door: FormulaDoor;
    /** Kartta alt satırın başında "2 malzeme". */
    materials?: number;
    card?: boolean;
    onPress: () => void;
}) {
    const ink = useSadeInk();
    const face = formulaFace(door);
    const sub = card && materials != null ? `${materials} malzeme · ${face.sub}` : face.sub;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${face.title}, ${sub}`}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10,
                minHeight: card ? 52 : Math.max(56, DOOR_H),
                paddingVertical: 8, paddingRight: 14, paddingLeft: 20,
                ...(card ? {
                    marginTop: 8, marginHorizontal: 20, borderRadius: 18, overflow: 'hidden' as const,
                    backgroundColor: ink.c.surf, borderWidth: 1, borderColor: ink.c.bd,
                } : {}),
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <View style={{
                position: 'absolute', left: 0, top: 10, bottom: 10, width: 4,
                borderTopRightRadius: 3, borderBottomRightRadius: 3, overflow: 'hidden',
                backgroundColor: face.bar === 'gr' ? ink.c.gr : ink.c.am,
            }}>
                {face.bar === 'half' ? (
                    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', backgroundColor: ink.c.bd2 }} />
                ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={1} style={{ ...hk(700), fontSize: 16, letterSpacing: -0.24, color: ink.c.tx }}>
                    {face.title}
                </Text>
                <Text numberOfLines={1} style={{ ...hk(500), fontSize: 14, color: ink.tx2 }}>{sub}</Text>
            </View>
            <Glyph name="chev" size={20} color={ink.tx2} />
        </Pressable>
    );
}

// ── Satırlar ────────────────────────────────────────────────────────────────

/** Satır yüksekliği — geri alma penceresiyle aynı: liste kıpırdamıyor. */
const SADE_ROW_H = 64;

/** Etiketin ve adet rozetinin kısa sıçraması: 1 → 1.18 → 1 · 240 ms. */
function usePop(key: number | null) {
    const { reduceMotion } = useTheme();
    const [scale] = useState(() => new Animated.Value(1));
    useEffect(() => {
        if (key == null || reduceMotion) return;
        scale.setValue(1);
        Animated.sequence([
            Animated.timing(scale, { toValue: 1.18, duration: 108, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 132, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
    }, [key, reduceMotion, scale]);
    return scale;
}

/**
 * Kalem satırı. Ok dokunulabilirliği söyleyen TEK işaret: varsa dokunulur
 * (satır paneli açılır), randevu satırında ve mühürlü adisyonda yok.
 */
export function SadeRow({ line, tag, editing, locked, enter, popKey, onPress }: {
    line: AdisyonLine;
    tag: 'new' | 'inc' | null;
    editing: boolean;
    locked: boolean;
    /** Az önce eklendi: satır yukarıdan süzülerek girer. */
    enter: boolean;
    popKey: number | null;
    onPress: () => void;
}) {
    const ink = useSadeInk();
    const material = line.kind === 'material';
    const [fade] = useState(() => new Animated.Value(enter && !ink.reduceMotion ? 0 : 1));
    useEffect(() => {
        if (!enter || ink.reduceMotion) return;
        Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        // Yalnız girişte.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const pop = usePop(popKey);

    const body = (
        <>
            {editing ? (
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: ink.c.or }} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={1} style={{ ...hk(700), fontSize: 17, letterSpacing: -0.26, color: ink.c.tx }}>
                    {line.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={{ ...hk(500), fontSize: 14, color: ink.tx2 }}>
                        {KIND_NAME[line.kind]}{tag ? ' · ' : ''}
                    </Text>
                    {tag ? (
                        <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, transform: [{ scale: pop }] }}>
                            <Glyph name="check" size={16} color={ink.c.gr} width={2.4} />
                            <Text style={[{ ...hk(700), fontSize: 14, color: ink.grT }, numeric]}>
                                {tag === 'new' ? 'Yeni' : `×${line.qty} oldu`}
                            </Text>
                        </Animated.View>
                    ) : null}
                </View>
            </View>
            {material || line.qty > 1 ? (
                <Animated.View style={{
                    minWidth: 42, height: 32, paddingHorizontal: 8, borderRadius: 10,
                    borderWidth: 1.5, borderColor: ink.c.bd2,
                    alignItems: 'center', justifyContent: 'center',
                    transform: [{ scale: pop }],
                }}>
                    <Text style={[{ ...hk(800), fontSize: 16, color: ink.c.tx }, numeric]}>×{line.qty}</Text>
                </Animated.View>
            ) : null}
            {material ? null : (
                <Amount value={(line.price ?? 0) * line.qty} size={17} weight={700} spacing={-0.17} />
            )}
            {locked ? <View style={{ width: 20 }} /> : <Glyph name="chev" size={20} color={ink.tx2} />}
        </>
    );

    const frame = {
        flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
        minHeight: SADE_ROW_H, paddingVertical: 9, paddingRight: 14, paddingLeft: 20,
        borderTopWidth: 1, borderTopColor: ink.c.bd,
        backgroundColor: editing ? ink.orbg : 'transparent',
    };

    return (
        <Animated.View style={{
            opacity: fade,
            transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        }}>
            {locked ? (
                <View style={frame}>{body}</View>
            ) : (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${line.name}, ${KIND_NAME[line.kind]}${line.qty > 1 || material ? `, ${line.qty} adet` : ''}, adedi değiştir ya da kaldır`}
                    onPress={() => { feedback.selection(); onPress(); }}
                    style={({ pressed }) => ({ ...frame, backgroundColor: editing ? ink.orbg : pressed ? ink.c.fld : 'transparent' })}
                >
                    {body}
                </Pressable>
            )}
        </Animated.View>
    );
}

/** Randevu hizmeti satırı — "Randevu hizmeti" der, oku yoktur. */
export function SadeServiceRow({ row }: { row: ServiceRow }) {
    const ink = useSadeInk();
    return (
        <View
            accessible
            accessibilityLabel={`${row.name}, randevu hizmeti`}
            style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                minHeight: SADE_ROW_H, paddingVertical: 9, paddingRight: 14, paddingLeft: 20,
                borderTopWidth: 1, borderTopColor: ink.c.bd,
            }}
        >
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={1} style={{ ...hk(700), fontSize: 17, letterSpacing: -0.26, color: ink.c.tx }}>
                    {row.name}
                </Text>
                <Text style={{ ...hk(500), fontSize: 14, color: ink.tx2 }}>Randevu hizmeti</Text>
            </View>
            {row.amount != null ? (
                <Amount value={row.amount} size={17} weight={700} spacing={-0.17} />
            ) : null}
            <View style={{ width: 20 }} />
        </View>
    );
}

/**
 * Geri alma penceresi — satırın KENDİ yerinde, aynı yükseklikte. Liste
 * zıplamaz, geri alınan satır aynı yere döner.
 */
export function SadeUndoRow({ line, until, formulaWritten, onUndo }: {
    line: AdisyonLine;
    until: number;
    formulaWritten: boolean;
    onUndo: () => void;
}) {
    const ink = useSadeInk();
    const left = useSecondsLeft(until);
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            minHeight: SADE_ROW_H, paddingVertical: 9, paddingRight: 14, paddingLeft: 20,
            borderTopWidth: 1, borderTopColor: ink.c.bd, backgroundColor: ink.ambg,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={1} style={{ ...hk(700), fontSize: 17, letterSpacing: -0.26, color: ink.c.tx }}>
                    {line.name} kaldırıldı
                </Text>
                <Text numberOfLines={1} style={{ ...hk(500), fontSize: 14, color: ink.tx2 }}>
                    {undoNote(line, formulaWritten)}
                </Text>
            </View>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${line.name} kalemini geri al, ${left} saniye kaldı`}
                onPress={() => { feedback.medium(); onUndo(); }}
                style={({ pressed }) => ({
                    height: 44, paddingHorizontal: 14, borderRadius: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    backgroundColor: ink.c.surf2, borderWidth: 1, borderColor: ink.c.bd2,
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                <Glyph name="undo" size={19} color={ink.c.tx} />
                <Text style={{ ...hk(700), fontSize: 16, color: ink.c.tx }}>Geri al</Text>
                <Text style={[{ ...hk(700), fontSize: 16, color: ink.tx2, minWidth: 10 }, numeric]}>{left}</Text>
            </Pressable>
            <LeftFuse until={until} total={DELETE_MS} />
        </View>
    );
}

// ── Liste ───────────────────────────────────────────────────────────────────

/**
 * Kalemler (en yeni üstte) · randevu hizmeti · malzeme bölümü.
 *
 * KALEMLER, RANDEVU, EK HİZMET başlıkları yok: tür satırın içinde yazılı.
 * "Depodan düşer" malzeme başlığında; tutar sütununda yalnız para durur.
 */
export function SadeList({
    lines, services, tags, editing, locked, flash, pending, door, formulaWritten,
    onEdit, onUndo, onDoor,
}: {
    lines: readonly AdisyonLine[];
    services: readonly ServiceRow[];
    tags: Readonly<Record<string, 'new' | 'inc'>>;
    editing: string | null;
    locked: boolean;
    flash: { id: string; at: number } | null;
    pending: { id: string; at: number } | null;
    door: FormulaDoor | null;
    formulaWritten: boolean;
    onEdit: (id: string) => void;
    onUndo: (id: string) => void;
    onDoor: () => void;
}) {
    const ink = useSadeInk();
    const { kalem, malzeme } = newestFirst(lines);
    const row = (line: AdisyonLine) => (line.pendingDelete ? (
        <SadeUndoRow
            key={line.id}
            line={line}
            until={(pending?.at ?? 0) + DELETE_MS}
            formulaWritten={formulaWritten}
            onUndo={() => onUndo(line.id)}
        />
    ) : (
        <SadeRow
            key={line.id}
            line={line}
            tag={tags[line.id] ?? null}
            editing={editing === line.id}
            locked={locked}
            enter={flash?.id === line.id && tags[line.id] === 'new'}
            popKey={flash?.id === line.id && tags[line.id] === 'inc' ? flash.at : null}
            onPress={() => onEdit(line.id)}
        />
    ));

    return (
        <View>
            {kalem.map(row)}
            {services.map((service, index) => (
                <SadeServiceRow key={`svc-${index}-${service.name}`} row={service} />
            ))}
            {malzeme.length > 0 ? (
                <>
                    <View style={{ gap: 2, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 10, borderTopWidth: 1, borderTopColor: ink.c.bd }}>
                        <Text style={{ ...hk(800), fontSize: 16, color: ink.c.tx }}>Malzeme</Text>
                        <Text style={{ ...hk(500), fontSize: 14, color: ink.tx2 }}>Toplama girmez · iş bitince depodan düşer</Text>
                    </View>
                    {door ? <SadeFormulaRow door={door} onPress={onDoor} /> : null}
                    {malzeme.map(row)}
                </>
            ) : null}
        </View>
    );
}

// ── Adisyon sayfası ─────────────────────────────────────────────────────────

/**
 * Sayfanın başlığı — FİŞ SATIRI (2026-10-15, kullanıcı seçimi "3"): solda
 * "Toplam" ve kalem sayısı, sağda tutar. Tutarın sağ kenarı satırların tutar
 * sütunuyla AYNI hizada (satır: sağ dolgu 14 + ok 20 + aralık 10 = 44), göz
 * toplamı yukarıdan aşağı tek sütunda doğruluyor. Kırılım satırı yok: liste
 * her tutarı zaten yazıyor. "Kapat" yok: başlık tutamağın parçası.
 */
export function SadeSheetHead({ count, total }: { count: number; total: number | null }) {
    const ink = useSadeInk();
    return (
        // Çizgi yok: başlık ile gövdeyi iki ton ayırıyor (`Sheet look="sade"`).
        <View style={{
            flexDirection: 'row', alignItems: 'flex-end', gap: 12,
            paddingTop: 8, paddingLeft: 20, paddingRight: 44, paddingBottom: 18,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ ...hk(700), fontSize: 16, color: ink.c.tx }}>Toplam</Text>
                <Text style={[{ ...hk(500), fontSize: 14, color: ink.tx2 }, numeric]}>{count} kalem</Text>
            </View>
            <Amount value={total} size={30} spacing={-0.9} />
        </View>
    );
}

/** Bir sık kullanılan kutusu. Eklenince DURUM olur: "✓ Adisyonda ×2". */
function Tile({ item, width, inQty, popKey, onPress }: {
    item: CatalogItem;
    width: number;
    inQty: number;
    popKey: number | null;
    onPress: () => void;
}) {
    const ink = useSadeInk();
    const [press] = useState(() => new Animated.Value(1));
    const pop = usePop(popKey);
    const to = (value: number, duration: number) => {
        if (ink.reduceMotion) return;
        Animated.timing(press, { toValue: value, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    };
    const on = inQty > 0;
    return (
        <Animated.View style={{ width, transform: [{ scale: press }] }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${on ? `adisyonda ${inQty} adet` : item.inBooking ? 'randevuda var' : KIND_NAME[item.kind]}`}
                onPressIn={() => to(0.96, 90)}
                onPressOut={() => to(1, 140)}
                onPress={onPress}
                style={{
                    height: 74, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 11,
                    justifyContent: 'space-between',
                    backgroundColor: on ? ink.grbg : ink.c.surf2,
                    borderWidth: on ? 1.5 : 1, borderColor: on ? ink.c.gr : ink.c.bd,
                }}
            >
                <Text numberOfLines={2} style={{ ...hk(700), fontSize: 15, lineHeight: 17.25, letterSpacing: -0.15, color: ink.c.tx }}>
                    {item.name}
                </Text>
                {on ? (
                    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, transform: [{ scale: pop }] }}>
                        <Glyph name="check" size={15} color={ink.c.gr} width={2.4} />
                        <Text style={[{ ...hk(800), fontSize: 13, color: ink.grT }, numeric]}>
                            Adisyonda{inQty > 1 ? ` ×${inQty}` : ''}
                        </Text>
                    </Animated.View>
                ) : (
                    <Text style={{ ...hk(600), fontSize: 13, color: ink.tx2 }}>
                        {item.inBooking ? 'Randevuda var' : KIND_NAME[item.kind]}
                    </Text>
                )}
            </Pressable>
        </Animated.View>
    );
}

/** Makbuz — ne olduğunu YAZAR ve bir sonraki eyleme kadar kalır. */
function ReceiptRow({ receipt }: { receipt: Receipt | null }) {
    const ink = useSadeInk();
    const parts = receiptParts(receipt);
    const [fade] = useState(() => new Animated.Value(1));
    useEffect(() => {
        if (!receipt || ink.reduceMotion) return;
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }, [receipt, ink.reduceMotion, fade]);
    const max = receipt?.kind === 'max';
    return (
        <Animated.View style={{
            opacity: fade,
            flexDirection: 'row', alignItems: 'center', gap: 10,
            minHeight: 52, marginTop: 12, marginHorizontal: 16, marginBottom: 2,
            paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14,
            borderStyle: parts && !max ? 'solid' : 'dashed',
            borderWidth: parts && !max ? 1.5 : 1,
            borderColor: !parts ? ink.c.bd2 : max ? ink.c.am : ink.c.gr,
            backgroundColor: !parts ? 'transparent' : max ? ink.ambg : ink.grbg,
        }}>
            {parts ? <Glyph name="check" size={22} color={max ? ink.c.am : ink.c.gr} width={2.4} /> : null}
            <Text style={{ flex: 1, ...hk(500), fontSize: 15, lineHeight: 19.5, color: parts ? ink.c.tx : ink.tx2 }}>
                {parts ? (
                    <>
                        <Text style={{ ...hk(800), color: ink.c.tx }}>{parts.bold}</Text>
                        {parts.rest}
                    </>
                ) : RECEIPT_IDLE}
            </Text>
        </Animated.View>
    );
}

/**
 * Sayfanın gövdesi: ekleme (arama kapısı + kutular + makbuz) ve liste.
 * "Bitti" yok: yazma 0,7 sn'de kendiliğinden; kapatmak üstteki "Kapat",
 * dışarı dokunmak ya da aşağı çekmek.
 */
export function SadeSheetBody({
    frequent, lines, receipt, flash, onSearch, onTile, list,
}: {
    frequent: { items: CatalogItem[]; source: 'staff' | 'salon' | 'none'; label: string };
    lines: readonly AdisyonLine[];
    receipt: Receipt | null;
    flash: { id: string; at: number } | null;
    onSearch: () => void;
    onTile: (item: CatalogItem) => void;
    list: ReactNode;
}) {
    const ink = useSadeInk();
    const [gridW, setGridW] = useState(0);
    const tileW = gridW > 0 ? (gridW - 16) / 3 : 0;
    const qtyOf = (item: CatalogItem) => lines.find((line) => !line.pendingDelete && line.kind === item.kind
        && (line.catalogId ? line.catalogId === item.id : line.name === item.name))?.qty ?? 0;
    const lineIdOf = (item: CatalogItem) => lines.find((line) => !line.pendingDelete && line.kind === item.kind
        && (line.catalogId ? line.catalogId === item.id : line.name === item.name))?.id;

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 14, paddingBottom: 44 }}
            showsVerticalScrollIndicator={false}
        >
            <Pressable
                accessibilityRole="search"
                accessibilityLabel="Katalogda ara"
                onPress={() => { feedback.selection(); onSearch(); }}
                style={({ pressed }) => ({
                    height: 52, marginHorizontal: 16, paddingHorizontal: 16, borderRadius: 16,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: ink.c.fld, borderWidth: 1, borderColor: ink.c.bd2,
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                <Glyph name="search" size={20} color={ink.tx2} />
                <Text style={{ ...hk(600), fontSize: 16, color: ink.tx2 }}>Katalogda ara</Text>
            </Pressable>

            {frequent.source === 'none' ? (
                <View style={{ paddingTop: 14, paddingHorizontal: 20, gap: 4 }}>
                    <Text style={{ ...hk(700), fontSize: 15, color: ink.c.tx }}>Sık kullanılanlar henüz yok</Text>
                    <Text style={{ ...hk(500), fontSize: 14, lineHeight: 19.6, color: ink.tx2 }}>
                        Kutular ilk adisyonlar yazıldıkça kendiliğinden doluyor. Şimdilik katalogda arayın.
                    </Text>
                </View>
            ) : (
                <>
                    <Text style={{ ...hk(600), fontSize: 14, color: ink.tx2, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 8 }}>
                        {frequentHead(frequent.label)}
                    </Text>
                    <View
                        onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
                        style={{ marginHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                    >
                        {tileW > 0 ? frequent.items.map((item) => {
                            const id = lineIdOf(item);
                            return (
                                <Tile
                                    key={item.id}
                                    item={item}
                                    width={tileW}
                                    inQty={qtyOf(item)}
                                    popKey={flash && id && flash.id === id ? flash.at : null}
                                    onPress={() => onTile(item)}
                                />
                            );
                        }) : null}
                    </View>
                </>
            )}

            <ReceiptRow receipt={receipt} />
            <View style={{ height: 12 }} />
            {list}
        </ScrollView>
    );
}

// ── Satır paneli ────────────────────────────────────────────────────────────

/**
 * Adet ve kaldırma — satır yerinde açılmaz, alttan kısa bir panel.
 * 68 × 64 pt − / +, 1'de − kapalı; ayrı ve kırmızı çerçeveli "Kaldır".
 * Değişiklik anında yazılır; "Tamam" yalnız kapatır.
 */
export function SadeEditPanel({ line, onStep, onRemove, onClose }: {
    line: AdisyonLine;
    onStep: (dir: 1 | -1) => void;
    onRemove: () => void;
    onClose: () => void;
}) {
    const ink = useSadeInk();
    const material = line.kind === 'material';
    const [popKey, setPopKey] = useState<number | null>(null);
    const pop = usePop(popKey);
    const step = (dir: 1 | -1) => { onStep(dir); setPopKey((k) => (k ?? 0) + 1); };
    const minOff = line.qty <= 1;
    const maxOff = line.qty >= 20;
    const stepper = (dir: 1 | -1, off: boolean) => (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={dir === 1 ? 'Bir artır' : 'Bir azalt'}
            accessibilityState={{ disabled: off }}
            onPress={off ? undefined : () => { feedback.selection(); step(dir); }}
            style={({ pressed }) => ({
                width: 68, height: 64, borderRadius: 20,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: ink.c.surf2, borderWidth: 1, borderColor: ink.c.bd2,
                opacity: off ? 0.38 : pressed ? 0.7 : 1,
            })}
        >
            <Glyph name={dir === 1 ? 'plus' : 'minus'} size={28} color={ink.c.tx} width={2.2} />
        </Pressable>
    );

    return (
        <View style={{ paddingHorizontal: 20, paddingBottom: 4, gap: 14 }}>
            <View style={{ gap: 3 }}>
                <Text numberOfLines={1} style={{ ...hk(800), fontSize: 22, letterSpacing: -0.44, color: ink.c.tx }}>{line.name}</Text>
                {material ? (
                    <Text style={{ ...hk(500), fontSize: 15, color: ink.tx2 }}>Malzeme · toplama girmez, depodan düşer</Text>
                ) : (
                    <Text style={[{ ...hk(500), fontSize: 15, color: ink.tx2 }, numeric]}>
                        {KIND_NAME[line.kind]} · birim {money(line.price ?? 0)}
                    </Text>
                )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {stepper(-1, minOff)}
                <Animated.Text style={[{
                    flex: 1, textAlign: 'center', ...hk(800), fontSize: 42, letterSpacing: -1.26, color: ink.c.tx,
                    transform: [{ scale: pop }],
                }, numeric]}>
                    {line.qty}
                </Animated.Text>
                {stepper(1, maxOff)}
            </View>
            <Text style={[{ ...hk(500), fontSize: 15, color: ink.tx2, textAlign: 'center' }, numeric]}>
                {editNote(line.qty)}
                {material || minOff || maxOff ? '' : ` · satır ${money((line.price ?? 0) * line.qty)}`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${line.name} kalemini kaldır`}
                    onPress={() => { feedback.warning(); onRemove(); }}
                    style={({ pressed }) => ({
                        flex: 1, height: 56, borderRadius: 18,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        backgroundColor: ink.rdbg, borderWidth: 1.5, borderColor: ink.c.rd,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Glyph name="trash" size={22} color={ink.c.rd} />
                    <Text style={{ ...hk(800), fontSize: 17, color: ink.rdT }}>Kaldır</Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => { feedback.selection(); onClose(); }}
                    style={({ pressed }) => ({
                        flex: 1.3, height: 56, borderRadius: 18,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: ink.c.tx, opacity: pressed ? 0.8 : 1,
                    })}
                >
                    <Text style={{ ...hk(800), fontSize: 17, color: ink.c.bg }}>Tamam</Text>
                </Pressable>
            </View>
        </View>
    );
}

// ── Kapanış kadranı ─────────────────────────────────────────────────────────

/**
 * Kapanışta toplam kadranda: 64 pt, AÇIK, altında "TOPLAM · n KALEM" —
 * şeritle aynı sayı. Saat satırı yok: plaka zaten "00:30 – 01:04 · 11 dk
 * sürdü" diyor (kullanıcı kararı, 2026-10-15 — tekrarlar silindi).
 */
export function SadeClosingDial({ total, count }: { total: number | null; count: number }) {
    const ink = useSadeInk();
    return (
        // Tutar YALNIZ dursun, adisyon biraz aşağıdan başlasın (kullanıcı,
        // 2026-10-15: "premium görüntü"). Yer listenin altındaki boşluktan.
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 34, paddingHorizontal: 20, paddingBottom: 40 }}>
            <Amount value={total} size={64} spacing={-2.88} />
            <Text style={{ ...hk(700), fontSize: 13, letterSpacing: 2.6, color: ink.tx2 }}>
                {total === null ? 'TUTARI KASA HESAPLIYOR' : 'TOPLAM'} · {count} KALEM
            </Text>
        </View>
    );
}
