// İşletme profili — ajanın sistem isteminde işletmeye özgü blok.
//
// Modelin bildiği her şey (hizmet, süre, fiyat, saat, adres, uzman) BURADAN
// gelir; model rakam uydurmaz. Metin belirlenimci üretilir: aynı veri aynı
// baytları verir, böylece önbellek tutar ve özet (hash) yalnız işletme bir
// şeyi değiştirince değişir. Özet değişince konuşma yeni bölüme geçer — eski
// geçmişteki h3 kodu artık başka bir hizmeti gösteriyor olabilir.
//
// Hizmet ve uzman UUID'leri modele verilmez: kısa kod (h1, p1) hem token
// tasarrufu hem de uydurma kimliğe karşı koruma. Kod → kimlik eşlemesi kodda.
//
// Saf modül: veritabanı yok, Deno yok. tests/wa-agent.test.mjs doğrudan import eder.

import type { Comms } from '../booking/messages.ts';
import type { WorkingHour } from '../booking/slots.ts';
import { formatTL } from '../booking/finance.ts';

export interface ProfileService {
    id: string;
    name: string;
    duration: number;
    price: number | null;
    color: string | null;
}

export interface ProfileStaff {
    id: string;
    name: string;
    specialty: string | null;
}

export interface ProfileInput {
    businessName: string;
    comms: Comms;
    address: string | null;
    mapsUrl: string | null;
    phone: string | null;
    hours: WorkingHour[];
    /** Oluşturulma sırasıyla — kodlar bu sıradan verilir. */
    services: ProfileService[];
    staff: ProfileStaff[];
    /** Kapalıysa randevu "onay bekliyor" düşer. */
    autoConfirm: boolean;
}

export interface Profile {
    text: string;
    hash: string;
    serviceByRef: Map<string, ProfileService>;
    staffByRef: Map<string, ProfileStaff>;
    refOfStaff: Map<string, string>;
}

/** Bu sayının üstü listelenmez; çok büyük katalog istemi şişirir. */
export const MAX_LISTED_SERVICES = 80;

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
/** İnsan sırası: pazartesiden başlar. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** 32 bit FNV-1a — kriptografik değil, yalnız "değişti mi" sorusu için. */
export function fnv1a(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

function oneLine(s: string | null | undefined): string {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function buildProfile(p: ProfileInput): Profile {
    const serviceByRef = new Map<string, ProfileService>();
    const staffByRef = new Map<string, ProfileStaff>();
    const refOfStaff = new Map<string, string>();

    const lines: string[] = [];
    lines.push('İŞLETME');
    lines.push(`Ad: ${oneLine(p.businessName) || 'İşletme'}`);
    lines.push(`Üslup: ${oneLine(p.comms.persona)}`);
    lines.push(`Hizmete verilen ad: ${p.comms.serviceWord}`);
    if (p.comms.guardrail) lines.push(`Sınır: ${oneLine(p.comms.guardrail)}`);
    lines.push(`Adres: ${oneLine(p.address) || 'kayıtlı değil'}`);
    if (p.mapsUrl) lines.push(`Harita: ${oneLine(p.mapsUrl)}`);
    lines.push(`Telefon: ${oneLine(p.phone) || 'kayıtlı değil'}`);
    lines.push(p.autoConfirm
        ? 'Randevu onayı: otomatik (randevu hemen kesinleşir).'
        : 'Randevu onayı: işletme onaylar (randevu "onay bekliyor" olarak düşer, onaylanınca müşteriye haber gider).');

    lines.push('');
    lines.push('Çalışma saatleri:');
    const hourLines = WEEK_ORDER
        .map((day) => {
            const h = p.hours.find((w) => Number(w?.day) === day);
            if (!h) return null;
            return h.isOff ? `${DAY_NAMES[day]} kapalı` : `${DAY_NAMES[day]} ${h.start}–${h.end}`;
        })
        .filter((l): l is string => l !== null);
    lines.push(...(hourLines.length > 0 ? hourLines : ['kayıtlı değil']));

    lines.push('');
    lines.push('Hizmetler (kod · ad · süre · fiyat):');
    const listed = p.services.slice(0, MAX_LISTED_SERVICES);
    listed.forEach((s, i) => {
        const ref = `h${i + 1}`;
        serviceByRef.set(ref, s);
        const price = s.price !== null && Number(s.price) > 0 ? formatTL(Number(s.price)) : 'fiyat sorunuz';
        lines.push(`${ref} · ${oneLine(s.name)} · ${s.duration} dk · ${price}`);
    });
    if (listed.length === 0) lines.push('kayıtlı hizmet yok');
    if (p.services.length > listed.length) {
        lines.push(`(+${p.services.length - listed.length} hizmet daha listelenmedi; sorulursa işletmeye yönlendir.)`);
    }

    lines.push('');
    lines.push('Uzmanlar (kod · ad):');
    p.staff.forEach((st, i) => {
        const ref = `p${i + 1}`;
        staffByRef.set(ref, st);
        refOfStaff.set(st.id, ref);
        const spec = oneLine(st.specialty);
        lines.push(spec ? `${ref} · ${oneLine(st.name)} · ${spec}` : `${ref} · ${oneLine(st.name)}`);
    });
    if (p.staff.length === 0) lines.push('kayıtlı uzman yok');

    const text = lines.join('\n');
    return { text, hash: fnv1a(text), serviceByRef, staffByRef, refOfStaff };
}
