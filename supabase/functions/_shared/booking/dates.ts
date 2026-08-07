// Türkçe tarih/saat çözücü — LLM'DEN ÖNCE çalışır.
//
// Neden kodda: "yarın", "haftaya salı", "3 buçuk" gibi ifadeler kural bilgisiyle
// kesin çözülür. Bunu modele sormak üç bedel ödetiyordu: her mesajda bir ağ
// çağrısı, sağlayıcı düştüğünde botun dilsizleşmesi (whatsapp-booking'de
// aiExtract hata durumunda hep null dönüyor ve akış sonsuza kadar "hangi gün?"
// diye soruyor), ve modelin uydurduğu tarihin randevuya dönüşme riski.
//
// Model artık yalnız buradan çözülemeyen cümleler için devreye giriyor.
// Saf modül: Deno/Node ayrımı yok, tests/wa-booking.test.mjs doğrudan import eder.

const DAYS_TR: Record<string, number> = {
    pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6,
};

const MONTHS_TR: Record<string, number> = {
    ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
    temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};

// Yazıyla saat — "üçte", "on birde" salonda sık yazılıyor.
const NUM_TR: Record<string, number> = {
    bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8,
    dokuz: 9, on: 10, onbir: 11, oniki: 12,
};

/**
 * Türkçe metni ASCII'ye katlar. JS'in /i bayrağı İ/ı çiftini katlamıyor;
 * serviceEligibility.foldTr ile aynı gerekçe.
 */
export function foldTr(s: string): string {
    return s
        .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/Ş/g, 's').replace(/ş/g, 's')
        .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
        .replace(/Ü/g, 'u').replace(/ü/g, 'u')
        .replace(/Ö/g, 'o').replace(/ö/g, 'o')
        .replace(/Ç/g, 'c').replace(/ç/g, 'c')
        .toLowerCase();
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function addDays(iso: string, n: number): string {
    const t = Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
}

function dowOf(iso: string): number {
    return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * AI'dan ya da çözücüden gelen tarih güvenilir mi? Biçim doğru, gerçek bir gün,
 * bugünden önce değil ve 90 günden uzağa değil.
 *
 * 90 gün sınırı keyfi değil: daha uzağı için çalışma saatleri, personel izni ve
 * fiyat bilgisi bugünden kestirilemez — o randevuyu salonun kendisi almalı.
 */
export function isSaneDate(v: string, todayStr: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const t = Date.parse(`${v}T00:00:00Z`);
    if (Number.isNaN(t)) return false;
    if (new Date(t).toISOString().slice(0, 10) !== v) return false; // 2026-02-31 gibi
    const today = Date.parse(`${todayStr}T00:00:00Z`);
    if (Number.isNaN(today)) return false;
    return t >= today && t <= today + 90 * 86_400_000;
}

/**
 * Metinden tarih çıkarır. Bulamazsa null döner — çağıran o zaman modele sorar.
 * Dönen değer HER ZAMAN isSaneDate'ten geçmiştir.
 */
export function parseTurkishDate(text: string, todayStr: string): string | null {
    const s = foldTr(text);
    const ok = (iso: string | null) => (iso && isSaneDate(iso, todayStr) ? iso : null);

    // ISO doğrudan yazılmışsa
    const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return ok(iso[0]);

    // Göreli günler. "obur gun" iki gün sonrası; "ertesi gun" tek başına
    // belirsizdir (neyin ertesi?) — yalnız yarınla eş anlamlı kullanımı alınır.
    if (/\bbugun\b/.test(s)) return ok(todayStr);
    if (/\byarin(?!\s*degil)\b/.test(s)) return ok(addDays(todayStr, 1));
    if (/\bobur\s*gun\b/.test(s)) return ok(addDays(todayStr, 2));

    // "20 haziran", "20 haziran 2026"
    const dm = s.match(/\b(\d{1,2})\s*(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\b(?:\s*(\d{4}))?/);
    if (dm) {
        const day = Number(dm[1]);
        const month = MONTHS_TR[dm[2]];
        const yearGiven = dm[3] ? Number(dm[3]) : null;
        const thisYear = Number(todayStr.slice(0, 4));
        // Yıl yazılmadıysa: bu yıl geçmişte kaldıysa gelecek yıl kastediliyordur.
        for (const y of yearGiven ? [yearGiven] : [thisYear, thisYear + 1]) {
            const cand = `${y}-${pad(month)}-${pad(day)}`;
            if (isSaneDate(cand, todayStr)) return cand;
        }
        return null;
    }

    // "20.06", "20/06/2026"
    const num = s.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
    if (num) {
        const day = Number(num[1]);
        const month = Number(num[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const thisYear = Number(todayStr.slice(0, 4));
            let years: number[];
            if (num[3]) {
                const y = Number(num[3]);
                years = [y < 100 ? 2000 + y : y];
            } else {
                years = [thisYear, thisYear + 1];
            }
            for (const y of years) {
                const cand = `${y}-${pad(month)}-${pad(day)}`;
                if (isSaneDate(cand, todayStr)) return cand;
            }
        }
        return null;
    }

    // Gün adı: "sali", "bu cumartesi", "haftaya sali"
    const dayName = s.match(/\b(pazartesi|sali|carsamba|persembe|cumartesi|cuma|pazar)\b/);
    if (dayName) {
        const target = DAYS_TR[dayName[1]];
        const today = dowOf(todayStr);
        let diff = (target - today + 7) % 7;
        // Bugünün adı söylendiyse "bu" olmadıkça haftaya kastediliyordur:
        // cumartesi günü "cumartesi" yazan biri çoğunlukla gelecek haftayı diyor.
        const thisWeek = /\bbu\s+(pazartesi|sali|carsamba|persembe|cumartesi|cuma|pazar)\b/.test(s);
        if (diff === 0 && !thisWeek) diff = 7;
        if (/\b(haftaya|gelecek\s*hafta|onumuzdeki)\b/.test(s) && diff < 7) diff += 7;
        return ok(addDays(todayStr, diff));
    }

    return null;
}

/**
 * Metinden saati çıkarır (HH:MM). Bulamazsa null.
 *
 * Çıplak sayıyı saat saymaz: "2 kişiyiz" mesajı 14:00 randevusuna dönüşmesin
 * diye ayraç ya da bir zaman ipucu (saat, buçuk, sabah/akşam, -de/-da eki) şart.
 */
export function parseTurkishTime(text: string): string | null {
    const s = foldTr(text);

    const period = /oglenden\s*sonra|ogleden\s*sonra|aksam|geceleyin|gece/.test(s)
        ? 'pm'
        : /sabah|sabahleyin/.test(s)
            ? 'am'
            : /oglen|ogle/.test(s)
                ? 'noon'
                : null;

    const apply = (h: number, m: number): string | null => {
        if (h < 0 || h > 23 || m < 0 || m > 59) return null;
        let hh = h;
        if (period === 'pm' && hh < 12) hh += 12;
        else if (period === 'noon' && hh < 12 && hh >= 1 && hh <= 3) hh += 12;
        else if (period === null && hh >= 1 && hh <= 7) {
            // Saat dilimi belirtilmemiş 1–7 salonda öğleden sonradır: "3'te
            // gelirim" diyen kimse sabahın 3'ünü kastetmiyor.
            hh += 12;
        }
        if (hh > 23) return null;
        return `${pad(hh)}:${pad(m)}`;
    };

    // Ayraçla yazılmış saat kendini açıklar; 1–7'yi öğleden sonraya çevirme
    // kuralı yalnız çıplak sayı için geçerli.
    const explicit = (h: number, m: number): string | null => {
        if (h > 23 || m > 59) return null;
        let hh = h;
        if (period === 'pm' && hh < 12) hh += 12;
        return `${pad(hh)}:${pad(m)}`;
    };

    // İki nokta tartışmasız saattir.
    const colon = s.match(/\b(\d{1,2}):(\d{1,2})\b/);
    if (colon) return explicit(Number(colon[1]), Number(colon[2]));

    // Nokta belirsiz: "20.08" hem 20 Ağustos hem 20:08 okunabilir ve Türkiye'de
    // tarih yazımı çok daha yaygın. Yalnız ikinci sayı ay olamıyorsa (>12) ya da
    // cümlede açık bir saat ipucu varsa saat sayılır.
    const dot = s.match(/\b(\d{1,2})\.(\d{2})\b(?!\s*[./]\d)/);
    if (dot) {
        const h = Number(dot[1]);
        const m = Number(dot[2]);
        const hint = period !== null || /\bsaat\b|bucuk|civari|sularinda|gibi/.test(s);
        if (m > 12 || hint) return explicit(h, m);
        return null;
    }

    // "3 bucuk", "uc bucuk"
    const half = s.match(/\b(\d{1,2}|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on|onbir|oniki)\s*bucuk\b/);
    if (half) {
        const raw = half[1];
        const h = /^\d+$/.test(raw) ? Number(raw) : NUM_TR[raw];
        if (h !== undefined) return apply(h, 30);
    }

    // "saat 3", "3'te", "3 te", "ucte", "sabah 10"
    const hinted = s.match(/\bsaat\s*(\d{1,2})\b/)
        || s.match(/\b(\d{1,2})\s*['’]?\s*(?:te|ta|de|da)\b/)
        || (period ? s.match(/\b(\d{1,2})\b/) : null);
    if (hinted) {
        const h = Number(hinted[1]);
        return apply(h, 0);
    }

    // Yazıyla: "ucte", "on birde"
    const worded = s.match(/\b(bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on\s*bir|on\s*iki|on)\s*(?:te|ta|de|da)\b/);
    if (worded) {
        const key = worded[1].replace(/\s+/g, '');
        const h = NUM_TR[key];
        if (h !== undefined) return apply(h, 0);
    }

    return null;
}

/**
 * Sunulmuş saat listesinden seçim. Bot "09:00 · 09:45 · 10:30…" dedikten
 * SONRA gelen çıplak sayı tartışmasız bir seçimdir.
 *
 * parseTurkishTime çıplak sayıyı bilinçli olarak saat saymıyor ("2 kişiyiz"
 * 14:00 randevusuna dönüşmesin diye) — ama bu kural liste sunulduktan sonra
 * müşteriyi kilitliyordu: canlıda "9" yazan kullanıcıya bot aynı listeyi
 * tekrar gönderdi. Bağlam varken kural gevşetilir.
 */
export function matchOfferedTime(text: string, offered: string[]): string | null {
    if (!offered?.length) return null;
    const s = foldTr(text);

    // Tam yazım: "09:00", "9:00"
    const colon = s.match(/\b(\d{1,2}):(\d{2})\b/);
    if (colon) {
        const want = `${pad(Number(colon[1]))}:${colon[2]}`;
        return offered.includes(want) ? want : null;
    }

    // Çıplak sayı: saati eşleşen ilk slot. "9" → 09:00, "10" → 10:30 (o saatte
    // tek slot varsa). Aynı saatte iki slot varsa (09:00 ve 09:45) ilki alınır;
    // müşteri onay adımında saati görüyor ve düzeltebiliyor.
    const bare = s.match(/^\s*(\d{1,2})\s*[.,]?\s*$/) || s.match(/\b(\d{1,2})\b/);
    if (!bare) return null;
    const h = Number(bare[1]);
    if (!Number.isFinite(h) || h < 0 || h > 23) return null;
    return offered.find((t) => Number(t.slice(0, 2)) === h) ?? null;
}

/** Kolaylık: bir mesajdan hem tarih hem saat. */
export function parseWhen(text: string, todayStr: string): { date: string | null; time: string | null } {
    return { date: parseTurkishDate(text, todayStr), time: parseTurkishTime(text) };
}
