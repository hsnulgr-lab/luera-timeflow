// Müşteri ajanının araçları — yalnız tanımlar.
//
// Hiçbir araç telefon ya da müşteri kimliği ALMAZ: "kimin randevusu" sorusunun
// cevabı yazan numaradır ve kod belirler. Model başkasının numarasını yazarak
// başkasının randevusunu göremez, iptal edemez.
//
// Yazan araçlar ikiye bölünmüş: propose_* yalnız öneri kaydı açar, randevuya
// dokunmaz; commit_proposal müşteri bir SONRAKİ mesajında onay verince uygular
// (bkz. guard.ts · commitBlock).
//
// Sıra sabit ve araç listesi konuşma boyunca değişmez: önbellek ve düşünce
// bloklarının bağlı olduğu önek bu listeyle başlıyor.
//
// strict: true → model şemaya uymayan argüman üretemez. Bu kipte her alan
// `required`'da olmalı; isteğe bağlı alanlar null alabilen alan olarak yazıldı.
//
// Saf modül: tests/wa-agent.test.mjs doğrudan import eder.

export interface ToolDef {
    name: string;
    description: string;
    strict: true;
    input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: false;
    };
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

const DATE = { type: 'string', description: 'YYYY-MM-DD (İstanbul takvimi).' };
const TIME = { type: 'string', description: 'HH:MM, 24 saat.' };
const SERVICE_REF = { type: 'string', description: 'İŞLETME listesindeki hizmet kodu, ör. "h3".' };
const STAFF_REF = { type: 'string', description: 'İŞLETME listesindeki uzman kodu, ör. "p2".' };
const APPOINTMENT_REF = {
    type: 'string',
    description: 'Randevu kodu, ör. "r-520ddeb2" (BAĞLAM ya da my_appointments sonucundan).',
};

export const TOOLS: ToolDef[] = [
    {
        name: 'find_slots',
        description:
            'Bir hizmet için boş saatleri getirir; müşteriye sonuçtaki suggested saatlerini öner. '
            + 'date null ise önümüzdeki boş günleri ve her birinin önerilen saatlerini döner. '
            + 'Saat önermeden önce mutlaka bunu çağır; saat uydurma.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: {
                service_ref: SERVICE_REF,
                date: nullable(DATE),
                part_of_day: nullable({
                    type: 'string', enum: ['sabah', 'ogle', 'aksam'],
                    description: 'sabah: 12:00 öncesi · ogle: 12–17 · aksam: 17 sonrası.',
                }),
                staff_ref: nullable(STAFF_REF),
            },
            required: ['service_ref', 'date', 'part_of_day', 'staff_ref'],
            additionalProperties: false,
        },
    },
    {
        name: 'my_appointments',
        description: 'Yazan müşterinin yaklaşan randevularını getirir. Müşteri kayıtlı değilse known=false döner.',
        strict: true,
        input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
    {
        name: 'my_packages_and_balance',
        description: 'Yazan müşterinin paketlerini (kalan seans) ve ödenmemiş bakiyesini getirir.',
        strict: true,
        input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
    {
        name: 'propose_booking',
        description:
            'Yeni randevu ÖNERİSİ açar; randevu henüz oluşmaz. Dönen özeti müşteriye gösterip onay iste. '
            + 'Müşteri bir sonraki mesajında açıkça onaylarsa commit_proposal çağır.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: {
                service_ref: SERVICE_REF,
                date: DATE,
                time: TIME,
                staff_ref: nullable(STAFF_REF),
                customer_name: nullable({
                    type: 'string',
                    description: 'Yalnız kayıtlı olmayan müşteride, müşterinin söylediği ad.',
                }),
            },
            required: ['service_ref', 'date', 'time', 'staff_ref', 'customer_name'],
            additionalProperties: false,
        },
    },
    {
        name: 'propose_reschedule',
        description: 'Mevcut bir randevuyu başka gün/saate taşıma ÖNERİSİ açar. Onay akışı propose_booking ile aynı.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: { appointment_ref: APPOINTMENT_REF, date: DATE, time: TIME },
            required: ['appointment_ref', 'date', 'time'],
            additionalProperties: false,
        },
    },
    {
        name: 'propose_cancel',
        description: 'Mevcut bir randevuyu iptal ÖNERİSİ açar. Onay akışı propose_booking ile aynı.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: { appointment_ref: APPOINTMENT_REF },
            required: ['appointment_ref'],
            additionalProperties: false,
        },
    },
    {
        name: 'commit_proposal',
        description:
            'Müşterinin açıkça onayladığı öneriyi uygular. Başarılı olursa onay mesajını SİSTEM gönderir; '
            + 'sen randevu bilgilerini tekrar yazma.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: { proposal_id: { type: 'string', description: 'Öneri kodu, ör. "o-1a2b3c4d".' } },
            required: ['proposal_id'],
            additionalProperties: false,
        },
    },
    {
        name: 'confirm_attendance',
        description: 'Hatırlatması gitmiş randevuya müşteri "geleceğim" dediğinde katılımı işaretler.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: { appointment_ref: APPOINTMENT_REF },
            required: ['appointment_ref'],
            additionalProperties: false,
        },
    },
    {
        name: 'request_human',
        description:
            'Müşteri bir insanla görüşmek istiyor, şikâyeti var ya da isteği senin yapabileceğin bir şey '
            + 'değil: işletmeye bildirim gönderir.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: { reason: { type: 'string', description: 'Tek cümle: müşteri ne istiyor.' } },
            required: ['reason'],
            additionalProperties: false,
        },
    },
];
