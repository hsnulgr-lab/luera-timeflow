/**
 * Personel 09b — sunucunun `customer` cevabını ekranın dosyasına indirgeyen
 * SAF katman.
 *
 * `fileSource.ts`'ten ayrı bir dosya olmasının sebebi `freshness.ts` ile aynı:
 * orası React, react-native ve api katmanına bağlı, yani testten doğrudan
 * çağrılamıyor — yalnız kaynak metni olarak okunabiliyor. Eşleme burada
 * durunca gerçekten ÇALIŞTIRARAK sınanabiliyor.
 */

import type { FormulaPrevious, HistoryState, VisitFormula } from './formula.ts';
import { formatDayMonth } from './calendar.ts';
import { agoLabel } from './customerBook.ts';
import {
    detailOf,
    type CustomerFile, type FileHistoryRow, type FileMask, type FilePackage,
} from './customerFile.ts';
import { initialsOf } from './text.ts';

/** Sunucunun `customer` cevabının okunan kısmı. */
export interface ServerFile {
    customer?: { id?: string; name?: string; phone?: string | null; notes?: string | null;
        custom_fields?: Record<string, unknown> | null };
    history?: Record<string, unknown>[];
    packages?: Record<string, unknown>[];
    riskRules?: { key?: string; label?: string; note?: string | null }[];
}

/**
 * Risk maskesi — kural motoru İSTEMCİDE, ve tek yerde.
 *
 * Sunucu iki şeyi ayrı gönderiyor: org'un kuralları (`settings.risk_rules`) ve
 * müşterinin işaretleri (`custom_fields`). Eşleme masaüstündekiyle aynı
 * (`BeautyCustomersPage` · riskOf): kuralın anahtarı müşteride doluysa kural
 * işliyor. Motoru sunucuya taşımak, iki tarafın bir gün ayrışması demekti.
 */
/** Tek bir risk kuralının okunabilir hâli. */
export interface RiskLine { kind: string; text: string }

/**
 * İşleyen risk kuralları — kumandanın uyarı satırları bundan doğuyor.
 *
 * `riskMask` ile AYNI kaynaktan: müşteri sayfası bunları tek bir maskede
 * topluyor, kumanda ayrı satırlar hâlinde gösteriyor. İki ekran aynı kuralı
 * iki ayrı yerden türetseydi bir gün biri alerji der öteki demezdi.
 */
export function riskList(
    rules: readonly { key?: string; label?: string; note?: string | null }[],
    fields: Record<string, unknown> | null | undefined,
): RiskLine[] {
    return rules
        .filter((rule) => rule.key && Boolean(fields?.[rule.key]))
        .map((rule) => ({
            kind: String(rule.label ?? '').trim() || 'Risk',
            // Notu olmayan kural etiketini tekrar ediyor: boş bir uyarı
            // satırı, uyarının kendisinden kötü.
            text: String(rule.note ?? '').trim() || String(rule.label ?? '').trim(),
        }));
}

export function riskMask(
    rules: readonly { key?: string; label?: string; note?: string | null }[],
    fields: Record<string, unknown> | null | undefined,
): FileMask | null {
    const active = riskList(rules, fields);
    if (active.length === 0) return null;
    const labels = active.map((line) => line.kind).filter(Boolean);
    const notes = active.map((line) => line.text).filter(Boolean);
    return {
        label: labels.length > 0 ? `Risk · ${labels.join(' · ')}` : 'Risk',
        sub: `${active.length} kural`,
        // Kuralın notu yoksa etiketin kendisi yazılıyor: maskenin ardında boş
        // bir kutu açmak, dokunan kişiye hiçbir şey söylememek olurdu.
        text: notes.length > 0 ? notes.join(' ') : labels.join(', '),
    };
}

/** Serbest not maskesi. Satır sayısı METİNDEN sayılıyor, ayrıca tutulmuyor. */
export function noteMask(notes: string | null | undefined): FileMask | null {
    const text = String(notes ?? '').trim();
    if (!text) return null;
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).length;
    return { label: 'Not', sub: `${lines} satır`, text };
}

function toPackage(row: Record<string, unknown>): FilePackage {
    const total = Number(row.total_sessions ?? 0);
    const used = Number(row.used_sessions ?? 0);
    const left = Math.max(0, total - used);
    return {
        name: String(row.name ?? ''),
        used,
        total,
        // Demo "son kullanım 12 Mart" diyordu; sunucu o tarihi GÖNDERMİYOR.
        // Uydurmak yerine gerçekten bilinen şey yazılıyor.
        sub: `${left} seans kaldı`,
    };
}

function toHistoryRow(row: Record<string, unknown>): FileHistoryRow {
    const formula = (row.formula ?? null) as VisitFormula | null;
    const staffName = (row.staffName as string | null) ?? null;
    return {
        id: String(row.id),
        date: formatDayMonth(String(row.date)),
        service: String(row.service ?? ''),
        formula: Boolean(formula),
        hadMaterial: row.hadMaterial === true,
        ...(row.status === 'no_show' ? { status: 'no_show' as const } : {}),
        locked: row.locked === true,
        who: staffName ?? '',
        initials: staffName ? initialsOf(staffName) : '',
        mine: row.mine === true,
        // Sunucu ziyaretin SÜRESİNİ göndermiyor (`customer` ucu damgaları
        // seçmiyor). Sıfır "bilinmiyor" demek ve çağıran taraf onu hiç
        // yazmıyor — "0 dk" uydurma bir ölçüm olurdu.
        minutes: 0,
        detail: formula ? detailOf(formula) : null,
        saved: formula,
        // Sunucu bu alanı GÖNDERMİYORSA boş kalıyor ve `hadMaterial` ile
        // birlikte "okunamadı" anlamına geliyor — uydurma bir liste değil.
        materials: Array.isArray(row.materials)
            ? (row.materials as Record<string, unknown>[])
                .map((item) => ({
                    name: String(item?.name ?? '').trim(),
                    qty: typeof item?.qty === 'number' ? item.qty : 1,
                }))
                .filter((item) => item.name)
            : [],
    };
}

/** Sunucunun cevabını ekranın beklediği dosyaya indirger. */
export function toCustomerFile(data: ServerFile, today: string): CustomerFile | null {
    const person = data.customer;
    if (!person?.id) return null;

    const history = (data.history ?? []).map(toHistoryRow);
    const rawDates = (data.history ?? []).map((row) => String(row.date ?? ''));
    const newest = history[0] ?? null;

    return {
        id: String(person.id),
        name: String(person.name ?? ''),
        phone: person.phone ? String(person.phone) : null,
        lastVisit: newest?.date ?? null,
        ago: rawDates[0] ? agoLabel(rawDates[0], today).text : null,
        lastService: newest?.service ?? null,
        lastStaff: newest?.who || null,
        lastStaffInitials: newest?.initials ?? '',
        visits: history.length,
        formulas: history.filter((row) => row.formula).length,
        risk: riskMask(data.riskRules ?? [], person.custom_fields),
        note: noteMask(person.notes),
        // "Son formül" kartı en yeni FORMÜLLÜ ziyaretten türüyor; en yeni
        // ziyaretten değil. Aradaki kesimlerde formül olmaması bir eksik değil.
        formula: (() => {
            const at = history.findIndex((row) => row.detail !== null);
            if (at < 0) return null;
            const line = history[at];
            return { ...line.detail!, date: line.date, who: line.who, initials: line.initials, mine: line.mine };
        })(),
        packages: (data.packages ?? []).map(toPackage),
        history,
    };
}

/**
 * Geçmiş TAVANA dayandı mı?
 *
 * Sunucu son 10 ziyareti dönüyor. Tam onsa daha fazlası olabilir ve "10
 * randevu" yazmak makul bir yalan olurdu; ekran "10+" diyor.
 */
export const HISTORY_LIMIT = 10;


// ── Karşılaştırma · saf karar ───────────────────────────────────────────────
//
// "Geçen sefer bu saça ne yapmıştım?" — Personel 12'nin dayandığı tek soru.
// Cevabı bugüne kadar SABİTTİ: `12 Mart · MK · 1:1,5 · 35 dk · açık kaldı`,
// hangi müşteri açılırsa açılsın aynı. Uydurma bir geçmiş, hiç geçmiş
// olmamasından kötü: kolorist bir sonraki karışımı ona bakarak ayarlıyor.

/** Karşılaştırma satırının girdisi — değer ve hangi hâlde olduğu. */
export interface Comparison {
    previous: FormulaPrevious | null;
    state: HistoryState;
}

/**
 * Açık olan ziyaretin karşılaştırması — müşterinin kendi geçmişinden.
 *
 * ── "Geçen sefer" hangi ziyaret ─────────────────────────────────────────────
 * Bakılan ziyaretten ESKİ, formülü OLAN ilk ziyaret. Aradaki kesimler
 * atlanıyor: formülsüz bir kesim karşılaştırılacak bir değer taşımıyor ve onu
 * "geçen sefer" saymak, gerçekten karşılaştırılabilir olanı gizlerdi.
 *
 * ── Üç hâl ──────────────────────────────────────────────────────────────────
 *   var  eski bir formül bulundu
 *   yok  daha eski ziyaret VAR ama hiçbirinde formül yazılmamış
 *   ilk  daha eski ziyaret YOK — bu müşterinin ilk formülü
 *
 * "Geçmiş yok" ile "geçmişte formül yazılmamış" aynı şey değil ve ikisi de
 * boş bir satır olamaz.
 *
 * ── Bakılan ziyaret listede yoksa ───────────────────────────────────────────
 * Sunucu son 10 ziyareti dönüyor; daha eski bir kayda bakılıyorsa `visitId`
 * listede bulunmuyor. O zaman karşılaştırma yapılmıyor (`ilk` DEĞİL, `yok`
 * da değil — hiçbiri doğru olmazdı): listenin en yenisini "geçen sefer" diye
 * göstermek, GELECEKTEKİ bir ziyareti geçmiş gibi okutmak olurdu.
 */
export function comparisonFor(
    history: readonly FileHistoryRow[],
    visitId: string | null | undefined,
): Comparison {
    // Liste sunucudan YENİDEN ESKİYE geliyor (`order('date', desc)`), yani
    // "daha eski" demek "dizide daha sonra" demek.
    const at = visitId ? history.findIndex((row) => row.id === visitId) : -1;
    if (at < 0) return { previous: null, state: 'ilk' };

    const older = history.slice(at + 1);
    const found = older.find((row) => row.saved !== null);
    if (!found) return { previous: null, state: older.length > 0 ? 'yok' : 'ilk' };

    const formula = found.saved!;
    return {
        previous: {
            dateLabel: found.date,
            // İmzası okunamayan ziyaret pil ÇİZMİYOR — baş harfi uydurmak,
            // formülü yazmayan kişiyi yazmış gibi göstermek olurdu.
            initials: found.initials,
            ratio: formula.ratio,
            waitMinutes: formula.waitMinutes,
            result: formula.result,
        },
        state: 'var',
    };
}

/**
 * Malzeme alanının ÜÇ hâli.
 *
 * `bilinmiyor` sessizce `yok` gibi çizilemez: personele adisyonunda olmayan
 * bir boşluk göstermek, adisyonu yeniden açtırır.
 */
export function materialField(row: {
    materials: readonly { name: string; qty: number }[];
    hadMaterial: boolean;
} | null | undefined): { rows: [string, string][]; unknown: boolean } {
    const list = row?.materials ?? [];
    if (list.length > 0) {
        return { rows: list.map((item) => [item.name, `×${item.qty}`] as [string, string]), unknown: false };
    }
    return { rows: [], unknown: row?.hadMaterial === true };
}
