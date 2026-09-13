/**
 * Personel 05/11 — ziyaretin YAZMA yolu.
 *
 * Ekranın karar katmanı saf dosyalarda (`sendToCash.ts`, `formula.ts`); burası
 * o kararların sunucuya dönüşmesi. Üç yazma var: başlatma, gönderim ve formül.
 *
 * Ayrı durmasının sebebi, gönderimin TEK bir uç değil İKİ yazma olması —
 * önce kalemler, sonra kapanış. Ekranın bu sırayı bilmesi gerekmiyor.
 *
 * Burada KARAR verilmiyor: ne gönderileceği (`formulaPatch`), cevabın ne
 * anlama geldiği (`formulaOutcome`) ve hayırın nasıl söyleneceği
 * (`formulaErrorLine`) saf katmanda duruyor. Bu dosya react-native taşıyan
 * api katmanına bağlı, yani Node testleri onu ÇALIŞTIRAMIYOR; kararlar
 * burada olsaydı yalnız kaynak metni olarak sınanabilirlerdi.
 */

import { ApiError, api } from '../api/staff';
import { sendableOf, type AdisyonLine } from './adisyon.ts';
import { formulaOutcome, formulaPatch, type VisitFormula } from './formula.ts';

export interface WriteOutcome {
    /** Sunucunun hayırının kodu. `null` ise sunucu konuşmadı. */
    code: string | null;
    /** İş kuyruğa girdi — sinyal yok, sonra gidecek. */
    queued: boolean;
}

function codeOf(cause: unknown): string {
    return cause instanceof ApiError ? cause.code : 'write_failed';
}

/**
 * Adisyonu kasaya gönderir: önce kalemler, sonra kapanış.
 *
 * ── Neden İKİ yazma ─────────────────────────────────────────────────────────
 * `visit.items` adisyonu yazıyor ve iyimser kilitle korunuyor; `visit.finish`
 * ziyareti kapatıyor. Tek uçta birleştirmek, kalemleri yazıp kapanışta
 * takılan bir isteği "hiç olmamış" gibi göstermek olurdu — oysa kalemler
 * gerçekten yazıldı.
 *
 * ── YARIM adisyon gönderilmiyor ─────────────────────────────────────────────
 * Kimliği olmayan bir satır sunucuda TÜM isteği reddediyor. Onu atıp geri
 * kalanı göndermek, kasaya EKSİK bir hesap düşürmek demek — müşteri az öder
 * ve kimse fark etmez. O yüzden tek bir satır bile gönderilemiyorsa istek
 * hiç yola çıkmıyor.
 */
export async function sendVisitToCash(
    reservationId: string,
    lines: readonly AdisyonLine[],
    expectedUpdatedAt: string | null,
): Promise<WriteOutcome> {
    const { items, skipped } = sendableOf(lines);
    if (skipped > 0) return { code: 'items_unsendable', queued: false };

    let queued = false;
    try {
        const written = await api.visitItems(reservationId, items, expectedUpdatedAt);
        // Kuyruğa giren yazma `{ ok: false, queued: true }` dönüyor.
        if ((written as { queued?: boolean } | null)?.queued) queued = true;
    } catch (cause) {
        return { code: codeOf(cause), queued: false };
    }

    // Kalemler kuyrukta beklerken kapanışı göndermek, sunucuda BOŞ bir
    // adisyonun kapanması demek. Sıra korunuyor: kuyruk boşalınca ikisi de
    // kendi sırasında gidiyor.
    if (queued) return { code: null, queued: true };

    try {
        const closed = await api.visitFinish(reservationId);
        if ((closed as { queued?: boolean } | null)?.queued) return { code: null, queued: true };
    } catch (cause) {
        return { code: codeOf(cause), queued: false };
    }
    return { code: null, queued: false };
}

/**
 * İşleme başlama damgası.
 *
 * Damga önce EKRANA konuyor, sonra sunucuya gidiyor: iş gerçekten başladı ve
 * sayacın ağ cevabını beklemesi için bir sebep yok. Ama sunucu KALICI olarak
 * reddederse (403, `already_finished`) damga bir yalana dönüşüyor ve geri
 * alınması gerekiyor — geçici hatalar kuyruğa giriyor, damga duruyor.
 */
export async function startVisit(reservationId: string): Promise<WriteOutcome> {
    try {
        const started = await api.visitStart(reservationId);
        if ((started as { queued?: boolean } | null)?.queued) return { code: null, queued: true };
        return { code: null, queued: false };
    } catch (cause) {
        return { code: codeOf(cause), queued: false };
    }
}

/**
 * Ziyaretin formülü.
 *
 * ── Neden dönen formül GEÇERLİ olan ─────────────────────────────────────────
 * Ekranın elindeki taslak üç alanı UYDURUYOR: `materials: []`, `staffId:
 * null`, `writtenAt: <telefonun saati>`. Sunucu üçünü de kendi doğrusuyla
 * dolduruyor — malzemeyi adisyondan, imzayı token'dan, damgayı kendi
 * saatinden. Ekranın taslağını saklamak, malzemesi boş ve imzasız bir formül
 * göstermek olurdu; oysa kayıtta ikisi de var.
 *
 * ── Kuyruk KAYDEDİLMİŞ SAYILMIYOR ───────────────────────────────────────────
 * Sinyal yokken iş kuyruğa giriyor ve gerçekten gidecek. Ama o ana kadar
 * müşterinin dosyasında formül YOK: personel sayfayı kapatıp geçmişe baksa
 * satırı boş görürdü. `queued` bunu çağırana söylüyor ki ekran "gitti"
 * diyemesin.
 */
export interface FormulaWriteOutcome extends WriteOutcome {
    /** Sunucunun kaydettiği formül. Kuyrukta ya da hatada `null`. */
    saved: VisitFormula | null;
}

export async function writeVisitFormula(
    reservationId: string,
    draft: VisitFormula,
): Promise<FormulaWriteOutcome> {
    try {
        const out = await api.visitFormula(reservationId, formulaPatch(draft));
        return { code: null, ...formulaOutcome(out) };
    } catch (cause) {
        return { code: codeOf(cause), queued: false, saved: null };
    }
}
