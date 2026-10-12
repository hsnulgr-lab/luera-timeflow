/**
 * Tek Kişilik v4 · s-duvar `actionPill.ts:39` — MESAJLA HATIRLAT (2026-10-12).
 *
 * Akış'taki WhatsApp gözü hat bağlı değilken "masaüstünden bağlanır" diyor;
 * tek kişinin masaüstü yok. v4: "Bağlamadan. Satırın ⋮ menüsünde Mesajla
 * hatırlat: wa.me, hazır metin randevu saatiyle. Otomatik hatırlatma kapsam
 * dışı." Satırın menüsü randevu kartı — Akış'ta ⋮ de onu açıyor; yeri
 * kullanıcı kararı (müşteri panelinin altında).
 *
 * Kural DAVRANIŞLA, bağlantı kaynak metniyle sınanıyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { REMINDER_TITLE, reminderAction } from '../mobile/src/lib/appointmentDetail.ts';
import { waNudgeText } from '../mobile/src/lib/actionPill.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const route = code('mobile/app/(manager-flow)/randevu/[id].tsx');
const card = code('mobile/src/components/AppointmentDetail.tsx');
const parts = code('mobile/src/components/ApptParts25.tsx');
const hook = code('mobile/src/lib/managerAppointment.ts');
const source = code('mobile/src/lib/managerSource.ts');

const TODAY = '2026-10-12';
const appt = {
    id: 'a1', customer_id: 'c1', customer_name: 'Elif Demir', customer_phone: '0532 111 22 33',
    date: '2026-10-13', start_time: '14:00:00', end_time: '15:00:00', service: 'Kesim',
    service_color: null, status: 'confirmed', staff_id: 'owner', notes: null,
    customer_arrived_at: null, arrived_at: null, service_ended_at: null,
};
const at = (patch, nowMinutes = 10 * 60, salon = 'Derya Güzellik') => reminderAction({
    appointment: { ...appt, ...patch }, salon, today: TODAY, nowMinutes,
});

test('metin randevunun GÜNÜYLE: bugün · yarın · tarih', () => {
    assert.equal(
        at({ date: TODAY }).text,
        'Derya Güzellik’ten merhaba — bugün 14:00 randevunuzu hatırlatmak istedik, görüşmek üzere.',
    );
    assert.match(at({}).text, /— yarın 14:00 randevunuzu hatırlatmak istedik/);
    assert.match(at({ date: '2026-10-16' }).text, /— Cuma 16 Ekim 14:00 randevunuzu/);
    // Ad yoksa uydurulmuyor.
    assert.match(at({}, 600, '').text, /^Merhaba — yarın 14:00/);
});

test('başlamış ama müşterisi gelmemiş randevuda Akış’ın cümlesi', () => {
    assert.equal(
        at({ date: TODAY }, 14 * 60 + 10).text,
        'Derya Güzellik’ten merhaba — 14:00 randevunuz için sizi bekliyoruz, yolda mısınız?',
    );
});

test('bağlantı wa.me — numara 90 ile, metin kodlanmış', () => {
    const action = at({});
    assert.equal(action.title, REMINDER_TITLE);
    assert.equal(action.title, 'Mesajla hatırlat');
    assert.ok(action.url.startsWith('https://wa.me/905321112233?text='));
    assert.equal(decodeURIComponent(action.url.split('?text=')[1]), action.text);
});

test('yalnız HATIRLATILACAK randevuda — öbürlerinde satır yok', () => {
    // Geçmiş gün, bugün bitmiş randevu.
    assert.equal(at({ date: '2026-10-11' }), null);
    assert.equal(at({ date: TODAY }, 15 * 60), null);
    // Müşteri geldi, işlem sürüyor, bitti, iptal.
    assert.equal(at({ customer_arrived_at: '2026-10-13T10:58:00Z' }), null);
    assert.equal(at({ arrived_at: '2026-10-13T11:00:00Z' }), null);
    assert.equal(at({ status: 'completed' }), null);
    assert.equal(at({ status: 'cancelled' }), null);
    // Yazılamayan numara: satır sessizce bozulacağına hiç çizilmiyor.
    assert.equal(at({ customer_phone: null }), null);
    assert.equal(at({ customer_phone: '212 555 00 00' }), null);
});

test('Akış’ın hazır metni değişmedi — gün verilmezse "bugün"', () => {
    assert.equal(
        waNudgeText({ salon: 'Derya Güzellik', time: '11:30', late: false }),
        'Derya Güzellik’ten merhaba — bugün 11:30 randevunuzu hatırlatmak istedik, görüşmek üzere.',
    );
});

test('satır YALNIZ tek kişilikte, müşteri panelinin hemen altında', () => {
    assert.match(route, /const reminder = solo && appointment\s*\? reminderAction\(\{ appointment, salon: data\.businessName, today: todayISO\(\), nowMinutes: now \}\)\s*: null;/);
    assert.match(route, /reminder=\{reminder\}\s*onRemind=\{remind\}/);
    // Açılamazsa sessiz kalmıyor.
    assert.match(route, /Linking\.openURL\(action\.url\)\.catch\(\(\) => \{\s*Alert\.alert\(REMINDER_FAILED,/);
    // Satır artık "Müşteriyi ara" ile aynı listede (ContactRows), aramanın altında.
    assert.match(card, /<VisitPanel summary=\{summary\} onOpen=\{onCustomer\} \/>\s*<ContactRows rows=\{\[/);
    assert.match(card, /\.\.\.\(reminder && onRemind \? \[\{\s*key: 'remind' as const,[\s\S]*?onPress: \(\) => onRemind\(reminder\),/);
    // Uçtaki simge DIŞARI ok: dokununca uygulamadan çıkılıyor.
    assert.match(parts, /accessibilityRole="link"/);
    assert.match(parts, /<Path d="M8 16L16 8M10 8h6v6" \/>/);
});

test('selam için işletme adı aynı ayar okumasından geliyor', () => {
    assert.match(source, /fetchOrgSettings\('user_id, working_hours, updated_at, business_name'\)/);
    assert.match(hook, /businessName: hours\?\.businessName \?\? '',/);
});
