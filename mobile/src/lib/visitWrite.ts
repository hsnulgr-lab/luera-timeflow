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

import { ApiError, api, flushQueue } from '../api/staff';
import { linesDiffer, linesFromItems, sendableOf, type AdisyonLine } from './adisyon.ts';
import { formulaOutcome, formulaPatch, type VisitFormula } from './formula.ts';
import { todayISO } from './calendar.ts';
import { observationOf, type StampObservation } from './visitStamp.ts';

export interface WriteOutcome {
    /** Sunucunun hayırının kodu. `null` ise sunucu konuşmadı. */
    code: string | null;
    /** İş kuyruğa girdi — sinyal yok, sonra gidecek. */
    queued: boolean;
    /**
     * Sunucunun cevabındaki YENİ damga ve kalemler. Kumanda bunu gözlem
     * olarak işlemezse kendi yazmasını yabancı değişiklik sanıyordu.
     */
    observation?: StampObservation | null;
    /** Kalem yazmasından mı geldi — kumandanın kendi listesi mi. */
    ownItems?: boolean;
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
    let observation: StampObservation | null = null;
    try {
        const written = await api.visitItems(reservationId, items, expectedUpdatedAt);
        // Kuyruğa giren yazma `{ ok: false, queued: true }` dönüyor.
        if ((written as { queued?: boolean } | null)?.queued) queued = true;
        observation = observationOf(written, items);
    } catch (cause) {
        const code = codeOf(cause);
        /*
         * "ZATEN KAPANDI" HER ZAMAN BİR HATA DEĞİL.
         *
         * Zayıf sinyalde ilk istek sunucuya ulaşıp adisyonu kasaya düşürüyor
         * ama cevabı telefona dönmüyor ya da gönderim ikinci kez tetikleniyor.
         * Sonraki deneme `already_finished` alıyor ve ekran "gönderilemedi"
         * diyordu — adisyon kasada dururken. Sunucudaki kalemler bizim
         * gönderdiklerimizle AYNIYSA iş gerçekten gitmiş demek.
         */
        if (code === 'already_finished' && (await landedAsSent(reservationId, lines))) {
            return { code: null, queued: false };
        }
        return { code, queued: false };
    }

    // Kalemler kuyrukta beklerken kapanışı göndermek, sunucuda BOŞ bir
    // adisyonun kapanması demek. Sıra korunuyor: kuyruk boşalınca ikisi de
    // kendi sırasında gidiyor.
    if (queued) return { code: null, queued: true };

    try {
        const closed = await api.visitFinish(reservationId);
        if ((closed as { queued?: boolean } | null)?.queued) return { code: null, queued: true, observation, ownItems: true };
    } catch (cause) {
        // Kalemler YAZILDI; kapanış takıldı. Damga yine de işlenmeli, yoksa
        // bir sonraki deneme kendi kalem yazmamıza takılırdı.
        return { code: codeOf(cause), queued: false, observation, ownItems: true };
    }
    return { code: null, queued: false, observation, ownItems: true };
}

/**
 * Sunucudaki ziyaret kapanmış ve kalemleri bizim gönderdiklerimiz mi?
 *
 * Okunamazsa `false`: emin olmadan "gitti" demek, gitmemiş bir adisyonu
 * gitmiş gibi göstermek olurdu — asıl kaçınılan şey o.
 */
/**
 * KALEMLER ANINDA KAYDEDİLİYOR (2026-10-14 · kullanıcının notu 2).
 *
 * Telefonda bulundu: kumandada eklenen kalemler yalnız "kasaya gönder"de
 * yazılıyordu; personel ya da tek kişilik sahip geri çıkınca hepsi
 * gidiyordu. Kullanıcı: "veritabanına anında yazılması lazım" ve ekipte
 * müdür ile masaüstü de anında görsün.
 *
 * Gönderimin ilk yarısının (`visit.items`) aynısı, kapanış YOK: adisyon açık
 * kalıyor, "kasaya gönder"e kadar değiştirilebiliyor. Yazma kuyruğa
 * girebiliyor (`write`): bodrum katında eklenen kalem sinyal gelince gider;
 * liste her seferinde TAMAMI olduğu için sonraki yazma öncekini kapsıyor.
 *
 * İyimser kilit aynı (`expectedUpdatedAt`): başka bir cihaz arada yazdıysa
 * sunucu reddedip güncel listeyi dönüyor — o `stale` olarak geri veriliyor,
 * kumanda onu yabancı değişiklik sayıp "Adisyon başka bir cihazda değişti"
 * şeridini çiziyor. Kimsenin kalemi sessizce ezilmiyor.
 */
export interface ItemsSaveOutcome extends WriteOutcome {
    /** Sunucunun güncel listesi ve damgası — "başka cihaz yazdı". */
    stale?: StampObservation | null;
}

export async function saveVisitItems(
    reservationId: string,
    lines: readonly AdisyonLine[],
    expectedUpdatedAt: string | null,
): Promise<ItemsSaveOutcome> {
    const { items, skipped } = sendableOf(lines);
    if (skipped > 0) return { code: 'items_unsendable', queued: false };
    try {
        const written = await api.visitItems(reservationId, items, expectedUpdatedAt);
        if ((written as { queued?: boolean } | null)?.queued) return { code: null, queued: true };
        return { code: null, queued: false, observation: observationOf(written, items), ownItems: true };
    } catch (cause) {
        const code = codeOf(cause);
        if (code === 'items_stale' && cause instanceof ApiError) {
            const stamp = typeof cause.body.updatedAt === 'string' ? cause.body.updatedAt : null;
            return {
                code,
                queued: false,
                stale: stamp ? { stamp, items: Array.isArray(cause.body.items) ? cause.body.items : [] } : null,
            };
        }
        return { code, queued: false };
    }
}

/**
 * YENİDEN GÖNDERİMDEN ÖNCE (D3, 2026-10-16) — "Tekrar dene" doğrudan
 * yeniden göndermiyor.
 *
 * 1. KUYRUK ÖNCE. Kuyrukta bu adisyonun eski bir yazması durabilir (kalemler
 *    ya da kapanış). Yenisi doğrudan giderse eskisi sonradan boşalıp onun
 *    üstüne düşer; kuyruktan geçerse sıra korunur.
 * 2. DAMGA TAZE. Kuyruk boşaldıysa sunucudaki damga ilerledi; ekrandaki eski
 *    damgayla giden yazma kendi işimize takılıp `items_stale` alırdı.
 *
 * Kuyruk hâlâ doluysa (sinyal yok) yeni istek ATILMIYOR: aynı adisyonun
 * ikinci bir kopyası kuyruğa girerdi. Sonuç yine "sırada".
 */
export async function prepareResend(
    reservationId: string,
    date: string,
): Promise<{ queued: boolean; observation: StampObservation | null }> {
    let left = 0;
    try {
        left = (await flushQueue()).left;
    } catch {
        // Kuyruk okunamadıysa bilinmiyor: gönderim eskisi gibi kendi yolundan
        // gider, yazma katmanı gerekirse kuyruğa alır.
        left = 0;
    }
    if (left > 0) return { queued: true, observation: null };
    return { queued: false, observation: await readObservation(reservationId, date) };
}

/** Sunucudaki satırın damgası ve kalemleri; okunamazsa `null` (uydurulmuyor). */
async function readObservation(reservationId: string, date: string): Promise<StampObservation | null> {
    try {
        const data = await api.agenda(date) as {
            appointments?: { id: string; updated_at?: string | null; adisyon_items?: unknown }[];
        };
        const row = (data.appointments ?? []).find((item) => item.id === reservationId);
        return row?.updated_at ? { stamp: row.updated_at, items: row.adisyon_items ?? [] } : null;
    } catch {
        return null;
    }
}

async function landedAsSent(reservationId: string, lines: readonly AdisyonLine[]): Promise<boolean> {
    try {
        const data = await api.agenda(todayISO()) as {
            appointments?: { id: string; status?: string; adisyon_items?: unknown }[];
        };
        const row = (data.appointments ?? []).find((item) => item.id === reservationId);
        if (!row || row.status !== 'completed') return false;
        return !linesDiffer(lines, linesFromItems(row.adisyon_items));
    } catch {
        return false;
    }
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
        return { code: null, queued: false, observation: observationOf(started) };
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
        return { code: null, ...formulaOutcome(out), observation: observationOf(out) };
    } catch (cause) {
        return { code: codeOf(cause), queued: false, saved: null };
    }
}

/**
 * BEKLEME (112 · v4 G3).
 *
 * Kumandanın halkası bu yazmayı BEKLEMİYOR: sayaç telefonda hemen dönüyor,
 * bugüne kadar olduğu gibi internetsiz de. Yazmanın işi beklemeyi Gün
 * ekranına ve kumandaya geri dönüşe taşımak. Sunucu kabul edince onun bitişi
 * benimseniyor — telefonun saati yanlış olabilir, sunucununki değil.
 */
export interface WaitWriteOutcome extends WriteOutcome {
    /** Sunucunun yazdığı bitiş. Hatada ya da kaldırmada `null`. */
    endsAt: string | null;
}

export async function writeVisitWait(reservationId: string, minutes: number | null): Promise<WaitWriteOutcome> {
    try {
        const out = await api.visitWait(reservationId, minutes) as
            { reservation?: { wait_ends_at?: string | null } | null } | null;
        return {
            code: null,
            queued: false,
            observation: observationOf(out),
            endsAt: out?.reservation?.wait_ends_at ?? null,
        };
    } catch (cause) {
        return { code: codeOf(cause), queued: false, endsAt: null };
    }
}

export interface NoteWriteOutcome extends WriteOutcome {
    /** Sunucunun kaydettiği not. Kuyrukta ya da hatada `null`. */
    saved: string | null;
}

/**
 * Randevunun serbest notu.
 *
 * Formülden farklı: iyimser kilit yok, `reservation.updated_at`i bir gözlem
 * olarak işlemiyoruz — not adisyonun kilidine dahil değil, çakışsa da
 * kaydeden kazanır (masaüstü ve müdür telefonuyla aynı kural).
 */
export async function writeVisitNote(reservationId: string, note: string): Promise<NoteWriteOutcome> {
    try {
        const out = await api.visitNote(reservationId, note) as
            { queued?: boolean; reservation?: { notes?: string | null } | null } | null;
        if (out?.queued) return { code: null, queued: true, saved: null };
        return { code: null, queued: false, saved: out?.reservation?.notes ?? null };
    } catch (cause) {
        return { code: codeOf(cause), queued: false, saved: null };
    }
}
