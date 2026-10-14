/**
 * Personel 15 · iş sürerken adisyon, sade (Yol A) — karar katmanı.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Personel 15 Adisyon Sade.html`
 * ve brief'i `docs/personel-15-adisyon-sade-claude-design-prompt.md`.
 *
 * İKİ KABUKTA (2026-10-15): önce tek kişilikte denendi, kullanıcı "gayet
 * iyi" deyince ekip personelinin kumandasına da geçti. Ekipte randevu
 * hizmetinin ücreti sunucudan geliyor (`visit.charge`).
 *
 * Saf: React yok, ağ yok. Ekranın söylediği her sayı buradan geliyor.
 */

import { QTY_MAX, addLine, liveLines, type AdisyonLine, type LineKind } from './adisyon.ts';
import type { ServiceBill } from './cashBuild.ts';
import type { FormulaDoor } from './formula.ts';

/** Randevunun kendi hizmetleri — ad ve ücret (`cashBuild.serviceLines`). */
export interface ServiceRow {
    name: string;
    /** Bilinmiyorsa `null`: satır tutar sütununu boş bırakır, uydurmaz. */
    amount: number | null;
}

const isMaterial = (line: Pick<AdisyonLine, 'kind'>) => line.kind === 'material';

/**
 * "Kalem" TEK ANLAMDA: ödenecek satır.
 *
 * Randevu hizmeti, ek hizmet ve ürün kalemdir; malzeme kalem DEĞİL (fiyatı
 * yok, toplama girmez, "malzeme" diye ayrı sayılır). Canlıda kadran "2 kalem"
 * (hizmet + Ağda), şerit "1 kalem" diyordu — iki sayı, iki anlam.
 */
export function kalemCount(services: readonly ServiceRow[], lines: readonly AdisyonLine[]): number {
    return services.length + liveLines(lines).filter((line) => !isMaterial(line)).length;
}

/** Eklenen ücretli kalemlerin toplamı — fiyat × adet, malzeme hariç. */
export function addedTotal(lines: readonly AdisyonLine[]): number {
    return liveLines(lines)
        .filter((line) => !isMaterial(line))
        .reduce((sum, line) => sum + (line.price ?? 0) * line.qty, 0);
}

/** Randevu hizmetlerinin ücreti — bilinmeyen satır 0 sayılır. */
export function serviceTotal(services: readonly ServiceRow[]): number {
    return services.reduce((sum, row) => sum + (row.amount ?? 0), 0);
}

/**
 * Müşterinin ödeyeceği TAMAMI: randevu + Σ fiyat × adet.
 *
 * Kuruş yuvarlaması sunucununkiyle aynı (`visit.collect`): tahsil edilen
 * tutar ekranda yazanla bir kuruş bile ayrışmasın.
 */
export function sadeTotal(services: readonly ServiceRow[], lines: readonly AdisyonLine[]): number {
    return Math.round((serviceTotal(services) + addedTotal(lines)) * 100) / 100;
}

/**
 * Toplamın kırılımı — yalnız tutar AÇIKKEN yazılır.
 *
 * "Saç boyama ₺1.800 + 3 kalem ₺920" · eklenen yoksa "… · eklenen kalem yok".
 */
export function breakdownLine(
    services: readonly ServiceRow[],
    lines: readonly AdisyonLine[],
    money: (value: number) => string,
): string {
    const added = liveLines(lines).filter((line) => !isMaterial(line)).length;
    const head = services.length > 0
        ? `${services.map((row) => row.name).join(' + ')} ${money(serviceTotal(services))}`
        : 'Randevu hizmeti yok';
    return added > 0
        ? `${head} + ${added} kalem ${money(addedTotal(lines))}`
        : `${head} · eklenen kalem yok`;
}

/** Şeridin üst satırı: "4 kalem · son Oksidan %6". */
export function stripLine(count: number, lastName: string | null): { count: string; tail: string } {
    return {
        count: `${count} kalem`,
        tail: lastName ? `son ${lastName}` : 'yalnız randevu hizmeti',
    };
}

/**
 * EN YENİ ÜSTTE. Eklenen kalem dokunulan kutunun hemen altına girer; göz
 * kutudan ayrılmadan satırı görür. Adet artışı satırın yerini DEĞİŞTİRMEZ
 * (dizideki sırası ekleme sırası). Silinmek üzere olan satır yerinde durur.
 */
export function newestFirst(lines: readonly AdisyonLine[]): {
    kalem: AdisyonLine[];
    malzeme: AdisyonLine[];
} {
    const reversed = [...lines].reverse();
    return {
        kalem: reversed.filter((line) => !isMaterial(line)),
        malzeme: reversed.filter(isMaterial),
    };
}

/** Eklemenin sonucu — kutu, makbuz ve satır etiketi hep bundan. */
export type AddOutcome =
    | { kind: 'new' | 'inc'; next: AdisyonLine[]; id: string; qty: number }
    | { kind: 'max'; next: AdisyonLine[]; id: string; qty: number };

/**
 * Bir dokunuşun ne yaptığı. `addLine`ın kuralı aynen: aynı kalem yeni satır
 * AÇMAZ, adedi artar; 20'de artmaz — o zaman makbuz "en çok 20" der ve liste
 * değişmez.
 */
export function addOutcome(
    lines: readonly AdisyonLine[],
    item: { name: string; kind: LineKind; price?: number; catalogId?: string },
    id: string,
): AddOutcome {
    const next = addLine(lines, item, id);
    if (next.length > lines.length) {
        return { kind: 'new', next, id, qty: 1 };
    }
    const at = next.findIndex((line, index) => line.qty !== lines[index]?.qty);
    if (at < 0) {
        // Değişen satır yok: adet zaten tavanda.
        const capped = lines.find((line) => !line.pendingDelete && line.kind === item.kind
            && (line.catalogId && item.catalogId ? line.catalogId === item.catalogId : line.name === item.name));
        return { kind: 'max', next: [...lines], id: capped?.id ?? id, qty: QTY_MAX };
    }
    return { kind: 'inc', next, id: next[at].id, qty: next[at].qty };
}

/** Makbuz satırı — kutunun altında, bir sonraki eyleme kadar KALIR. */
export interface Receipt {
    kind: 'new' | 'inc' | 'max';
    name: string;
    qty: number;
    material: boolean;
}

export function receiptParts(receipt: Receipt | null): { bold: string; rest: string } | null {
    if (!receipt) return null;
    if (receipt.kind === 'max') return { bold: receipt.name, rest: ` zaten ${QTY_MAX} adet · en çok ${QTY_MAX}` };
    if (receipt.kind === 'inc') return { bold: `${receipt.name} ×${receipt.qty} oldu`, rest: ' · satırı yerinde' };
    return {
        bold: `${receipt.name} eklendi`,
        rest: receipt.material ? ' · malzemenin en üstünde' : ' · listenin en üstünde',
    };
}

/** Makbuz boşken yalnız ne olacağını söyler. */
export const RECEIPT_IDLE = 'Dokunduğun kalem listenin en üstüne girer.';

/** Satır panelinin alt cümlesi. */
export function editNote(qty: number): string {
    if (qty <= 1) return 'En az 1 adet · silmek için Kaldır';
    if (qty >= QTY_MAX) return `En çok ${QTY_MAX} adet`;
    return `Adet 1–${QTY_MAX}`;
}

/** Geri alma satırının ikinci cümlesi. */
export function undoNote(line: Pick<AdisyonLine, 'kind'>, formulaWritten: boolean): string {
    return isMaterial(line) && formulaWritten
        ? 'Formülün malzeme yarısı değişir'
        : 'Pencere kapanınca liste gönderilir';
}

/**
 * Formül satırının yüzü — kapının (`formulaDoor`) üç tonu, tasarımın üç hâli.
 *
 *   amber → "Formül yazılmadı" · sol kenar amber
 *   nötr  → "Formül yarım"     · sol kenar yarı amber
 *   yeşil → "Formül yazıldı"   · sol kenar yeşil
 *
 * Alt satır kapının KENDİ cümlesi; gerekçe (`tail`) atılmıyor — "geçen sefer
 * formül yazılmadı" kolorist için bilgi.
 */
export function formulaFace(door: FormulaDoor): { title: string; sub: string; bar: 'am' | 'half' | 'gr' } {
    const sub = [door.value, door.tail].filter(Boolean).join(' · ');
    if (door.tone === 'ok') return { title: 'Formül yazıldı', sub, bar: 'gr' };
    if (door.tone === 'mid') return { title: 'Formül yarım', sub, bar: 'half' };
    return { title: 'Formül yazılmadı', sub, bar: 'am' };
}

/** Sık kullanılan başlığı: "Sık kullanılan · saç boyama işinde". */
export function frequentHead(label: string): string {
    return `Sık kullanılan · ${label.toLocaleLowerCase('tr-TR')}`;
}

/**
 * `visit.charge` cevabı → `ServiceBill` (ekip kumandası). Biçim tutmazsa
 * `null`: ücret BİLİNMİYOR — satırlar adla duruyor, tutar yazılmıyor.
 * Sayılar sunucudan; istemci yeniden toplamıyor, yalnız doğruluyor.
 */
export function serviceBillOf(data: unknown): ServiceBill | null {
    const body = (data ?? {}) as { lines?: unknown; amount?: unknown; count?: unknown };
    if (!Array.isArray(body.lines) || typeof body.amount !== 'number') return null;
    const lines = body.lines.flatMap((raw) => {
        const row = (raw ?? {}) as { name?: unknown; amount?: unknown };
        return typeof row.name === 'string' && typeof row.amount === 'number' && Number.isFinite(row.amount)
            ? [{ name: row.name, amount: row.amount }]
            : [];
    });
    if (lines.length !== body.lines.length) return null;
    return { amount: body.amount, count: lines.length, lines };
}
