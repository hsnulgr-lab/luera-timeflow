/**
 * WhatsApp asistanı · davranış kilidi (kullanıcı kararı, 2026-11-08).
 *
 * "Testlerde tam istediğim gibi cevap veriyor ve zeki — bu yapıyı koru."
 * Asistanın ne bildiğini ve ne söylediğini belirleyen her şey tek bir metne
 * dökülür ve tests/golden/wa-asistan.txt ile karşılaştırılır:
 *   - kurallar (RULES), araç tanımları (TOOLS)
 *   - örnek işletmenin profili ve tur bağlamı
 *   - kodun kendi gönderdiği mesajlar (tanıtım, onay, hatırlatma, iptal…)
 *   - model, efor, token sınırı ve koruma sabitleri
 *
 * Altyapı değişikliği (ayarın hangi satırdan okunduğu, yönlendirme, kayıt)
 * bu testi KIRMAZ. Kırıyorsa asistanın konuşması değişmiş demektir.
 * Bilerek değiştirildiyse ve kullanıcı onayladıysa:
 *     UPDATE_GOLDEN=1 node --test tests/wa-asistan-kilidi.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { buildProfile } from '../supabase/functions/_shared/agent/profile.ts';
import { TOOLS } from '../supabase/functions/_shared/agent/tools.ts';
import {
    AGENT_COOLDOWN_MS, DEFAULT_MONTHLY_BUDGET_USD, EPISODE_IDLE_MS, EPISODE_MAX_MESSAGES, PROPOSAL_TTL_MS,
} from '../supabase/functions/_shared/agent/guard.ts';
import {
    agentFallback, buildTurnContext, consentAsk, consentDeclined, consentRepeat, consentThanks,
    CONSENT_VERSION, introMessage, istanbulClock, RULES,
} from '../supabase/functions/_shared/agent/prompt.ts';
import { buildCustomerCard, cardLines } from '../supabase/functions/_shared/agent/customerCard.ts';
import * as M from '../supabase/functions/_shared/booking/messages.ts';

const GOLDEN = new URL('./golden/wa-asistan.txt', import.meta.url);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── Örnek işletme (sabit; değiştirmek kilidi yeniden yazdırır) ─────────────
const HOURS = [
    { day: 1, start: '09:00', end: '21:00', isOff: false },
    { day: 2, start: '09:00', end: '21:00', isOff: false },
    { day: 3, start: '09:00', end: '21:00', isOff: false },
    { day: 4, start: '09:00', end: '21:00', isOff: false },
    { day: 5, start: '09:00', end: '21:00', isOff: false },
    { day: 6, start: '10:00', end: '19:00', isOff: false },
    { day: 0, start: '00:00', end: '00:00', isOff: true },
];
const SERVICES = [
    {
        id: '11111111-aaaa-bbbb-cccc-000000000001', name: 'Lazer epilasyon', duration: 45, price: 1200, color: null,
        description: 'Buz lazer; tüm vücut bölgelerine uygulanır.',
        prep_note: 'Seanstan bir gün önce bölgeyi tıraş edin.',
    },
    { id: '11111111-aaaa-bbbb-cccc-000000000002', name: 'Cilt bakımı', duration: 60, price: 900, color: null },
    { id: '11111111-aaaa-bbbb-cccc-000000000003', name: 'Kaş alımı', duration: 15, price: null, color: null },
];
const STAFF = [
    { id: '22222222-aaaa-bbbb-cccc-000000000001', name: 'Ayşe Demir', specialty: 'Lazer' },
    { id: '22222222-aaaa-bbbb-cccc-000000000002', name: 'Zeynep Kaya', specialty: null },
];
const KNOWLEDGE = {
    payment: 'Nakit ve kredi kartı geçerli.',
    policy: 'İptal için en az 24 saat önce haber verin.',
    location: 'Moda iskelesinin karşısı, 2. kat.',
    notes: '',
    faq: [{ q: 'Otopark var mı?', a: 'Sokakta ücretsiz park yeri var.' }],
};
const CLOCK = istanbulClock(Date.UTC(2026, 10, 8, 7, 0)); // 8 Kasım 2026 Pazar 10:00
const C = { comms: M.NEUTRAL_COMMS, businessName: 'Test Salon 2', firstName: 'Nisa Hanım' };
const C0 = { comms: M.NEUTRAL_COMMS, businessName: 'Test Salon 2', firstName: null };
const APPT = { service: 'Lazer epilasyon', dateLabel: 'Yarın, 9 Kasım Pazartesi', time: '13:30' };

function constant(src, name) {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`));
    assert.ok(m, `${name} wa-agent/index.ts içinde bulunamadı`);
    return m[1].trim();
}

function render() {
    const out = [];
    const sec = (title, body) => out.push(`══════ ${title} ══════\n${body}\n`);

    const agentSrc = read('supabase/functions/wa-agent/index.ts');
    sec('MODEL', [
        `DEFAULT_MODEL = ${constant(agentSrc, 'DEFAULT_MODEL')}`,
        `DEFAULT_EFFORT = ${constant(agentSrc, 'DEFAULT_EFFORT')}`,
        `MAX_TOKENS = ${constant(agentSrc, 'MAX_TOKENS')}`,
        `EPISODE_IDLE_MS = ${EPISODE_IDLE_MS}`,
        `EPISODE_MAX_MESSAGES = ${EPISODE_MAX_MESSAGES}`,
        `PROPOSAL_TTL_MS = ${PROPOSAL_TTL_MS}`,
        `AGENT_COOLDOWN_MS = ${AGENT_COOLDOWN_MS}`,
        `DEFAULT_MONTHLY_BUDGET_USD = ${DEFAULT_MONTHLY_BUDGET_USD}`,
        `CONSENT_VERSION = ${CONSENT_VERSION}`,
    ].join('\n'));

    sec('KURALLAR (RULES)', RULES);
    sec('ARAÇLAR (TOOLS)', JSON.stringify(TOOLS, null, 2));

    const profile = buildProfile({
        businessName: 'Test Salon 2', comms: M.NEUTRAL_COMMS, address: 'Moda Cd. 1, Kadıköy',
        mapsUrl: 'https://maps.example/test', phone: '0216 000 00 00', hours: HOURS,
        services: SERVICES, staff: STAFF, autoConfirm: true, knowledge: KNOWLEDGE,
    });
    sec('İŞLETME PROFİLİ', profile.text);

    const card = buildCustomerCard([
        { date: '2026-10-30', start_time: '13:30:00', service: 'Lazer epilasyon', staff_id: STAFF[0].id },
        { date: '2026-10-02', start_time: '13:00:00', service: 'Lazer epilasyon', staff_id: STAFF[0].id },
        { date: '2026-09-04', start_time: '14:00:00', service: 'Cilt bakımı', staff_id: STAFF[1].id },
    ], new Map(STAFF.map((s) => [s.id, s.name])));
    const lines = cardLines(card, {
        packages: [{ title: 'Lazer 6 seans', available: 3, total: 6 }], balanceText: null, overpaidText: null,
    });
    sec('BAĞLAM · kayıtlı müşteri', buildTurnContext({
        clock: CLOCK,
        customer: { known: true, name: 'Nisa Yılmaz', pushName: 'Nisa', hitap: 'Nisa Hanım' },
        upcoming: [{ ref: 'R1', service: 'Lazer epilasyon', dateLabel: 'Yarın, 9 Kasım Pazartesi', time: '13:30',
            staff: 'Ayşe Demir', pending: false, awaitingReminderReply: true }],
        openProposal: { ref: 'P1', summary: 'Cilt bakımı · 11 Kasım Çarşamba 15:00' },
        card: lines,
    }));
    sec('BAĞLAM · yeni numara', buildTurnContext({
        clock: CLOCK, customer: { known: false, name: null, pushName: 'Ali' }, upcoming: [],
        openProposal: null, firstContact: true,
    }));

    sec('TANITIM', [
        introMessage({ businessName: 'Test Salon 2', firstName: 'Nisa Hanım', known: true, clock: CLOCK,
            upcoming: { date: '2026-11-09', time: '13:30' }, salam: false, emoji: '✨' }),
        introMessage({ businessName: 'Test Salon 2', firstName: null, known: false, clock: CLOCK,
            upcoming: null, salam: true }),
    ].join('\n—\n'));
    sec('ONAY (KVKK)', [
        consentAsk({ businessName: 'Test Salon 2', firstName: 'Nisa Hanım' }),
        consentThanks({ firstName: 'Nisa Hanım' }), consentRepeat(),
        consentDeclined({ phone: '0216 000 00 00' }), agentFallback(),
    ].join('\n—\n'));

    const msgs = {
        created: M.created(C, { ...APPT, prep: SERVICES[0].prep_note, manageUrl: 'https://t.example/m/x' }),
        createdPending: M.created(C0, { ...APPT, pending: true }),
        bookingConfirmation: M.bookingConfirmation(C, {
            items: [{ ...APPT, staff: 'Ayşe Demir', prep: SERVICES[0].prep_note },
                { service: 'Cilt bakımı', dateLabel: '11 Kasım Çarşamba', time: '15:00' }],
            manageUrl: 'https://t.example/m/x', mapsUrl: 'https://maps.example/test',
        }),
        reminder24h: M.reminder24h(C, { ...APPT, askConfirm: true, prep: SERVICES[0].prep_note, mapsUrl: 'https://maps.example/test' }),
        reminder2h: M.reminder2h(C, { service: APPT.service, time: APPT.time }),
        attendanceNudge: M.attendanceNudge(C, { when: 'yarın 13:30' }),
        reminderConfirmed: M.reminderConfirmed(C, APPT),
        reminderDeclined: M.reminderDeclined(C),
        cancelledByBusiness: M.cancelledByBusiness(C, APPT),
        cancelledByCustomer: M.cancelledByCustomer(C, APPT),
        rescheduledByCustomer: M.rescheduledByCustomer(C, APPT),
        satisfactionAsk: M.satisfactionAsk(C, { sameDay: true }),
        feedbackHappy: M.feedbackHappy(C, { reviewUrl: 'https://g.example/r' }),
        feedbackUnhappy: M.feedbackUnhappy(C, { reviewUrl: null }),
        reviewInvite: M.reviewInvite(C, { reviewUrl: 'https://g.example/r' }),
        recallInvite: M.recallInvite(C),
        winback: M.winback(C),
        discountLine: M.discountLine({ percent: 15, code: 'NISA15', until: '30 Kasım' }),
        renewalInvite: M.renewalInvite(C, { packageTitle: 'Lazer 6 seans' }),
        rebookInvite: M.rebookInvite(C, { service: 'Lazer epilasyon', bookingUrl: 'https://t.example/b' }),
        queueJoined: M.queueJoined(C, { position: 2, etaMin: 20 }),
        queueReady: M.queueReady(C),
        waitlistOpening: M.waitlistOpening(C, { bookingUrl: 'https://t.example/b' }),
        handoff: M.handoff(C, '0216 000 00 00'),
        optedOut: M.optedOut(C),
        optedIn: M.optedIn(C),
    };
    for (const [k, v] of Object.entries(msgs)) sec(`MESAJ · ${k}`, v);
    return out.join('\n');
}

test('WhatsApp asistanı kilitli hâliyle aynı konuşuyor', () => {
    const now = render();
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) {
        writeFileSync(GOLDEN, now);
        return;
    }
    const want = readFileSync(GOLDEN, 'utf8');
    if (now === want) return;
    // İlk farklı bölümü göster: neyin değiştiği tek bakışta okunsun.
    const a = want.split('\n'); const b = now.split('\n');
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    const head = a.slice(0, i).reverse().find((l) => l.startsWith('══════')) ?? '';
    assert.fail(
        `WhatsApp asistanının konuşması değişti (${head.replace(/═/g, '').trim()}, satır ${i + 1}).\n`
        + `  kilit : ${a[i] ?? '(yok)'}\n  şimdi : ${b[i] ?? '(yok)'}\n`
        + 'Bilerek ve kullanıcı onayıyla değiştiyse: UPDATE_GOLDEN=1 node --test tests/wa-asistan-kilidi.test.mjs',
    );
});
