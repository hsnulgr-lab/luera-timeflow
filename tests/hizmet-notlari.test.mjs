/**
 * C adımı (2026-11-07): hizmet açıklaması + hazırlık notu (göç 138).
 * Asistan istemde görür; hazırlık notu onay ve 24 saat hatırlatmasına eklenir.
 * Notlar ayrı sorguda okunur: göç yoksa hizmet listesi boş gelmesin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as M from '../supabase/functions/_shared/booking/messages.ts';
import { buildProfile } from '../supabase/functions/_shared/agent/profile.ts';
import { prepByName } from '../supabase/functions/_shared/booking/serviceNotes.ts';
import * as T from '../src/services/waTemplates.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const CTX = { comms: { ...M.NEUTRAL_COMMS, emoji: '✨' }, businessName: 'Test Salon 2', firstName: 'Nisa Hanım' };
const PREP = 'Seanstan bir gün önce bölgeyi tıraş edin.\n48 saat güneşe çıkmayın.';

test('onay: hazırlık notu künyeden sonra tek satır; yoksa satır yok', () => {
    const withPrep = M.bookingConfirmation(CTX, { items: [{ service: 'Lazer', dateLabel: 'Yarın', time: '10:00', prep: PREP }] });
    assert.match(withPrep, /\*Saat:\* 10:00\n\n\*Hazırlık:\* Seanstan bir gün önce bölgeyi tıraş edin\. 48 saat güneşe çıkmayın\.\n\nSizi bekliyoruz/);
    assert.doesNotMatch(M.bookingConfirmation(CTX, { items: [{ service: 'Lazer', dateLabel: 'Yarın', time: '10:00', prep: '  ' }] }), /Hazırlık/);
});

test('konuşmadaki onay (created) ve 24 saat hatırlatması da notu taşır', () => {
    assert.match(M.created(CTX, { service: 'Lazer', dateLabel: 'Yarın', time: '10:00', prep: PREP }), /\*Saat:\* 10:00\n\n\*Hazırlık:\* /);
    const r = M.reminder24h(CTX, { service: 'Lazer', dateLabel: 'Yarın', time: '10:00', askConfirm: true, prep: PREP });
    assert.match(r, /\*Hazırlık:\* [^\n]+\n\nGelebilecek misiniz\?/);
    assert.doesNotMatch(M.reminder2h(CTX, { service: 'Lazer', time: '10:00' }), /Hazırlık/);
});

test('panel önizlemesi notu gösterir', () => {
    assert.match(T.buildConfirmationMessage({ customerName: 'Ayşe', date: '2026-12-02', startTime: '10:00', service: 'Lazer', businessName: 'X', prepNote: PREP }), /\*Hazırlık:\* /);
    assert.match(T.build24hMessage({ customerName: 'Ayşe', startTime: '10:00', service: 'Lazer', businessName: 'X', prepNote: PREP }), /\*Hazırlık:\* /);
});

test('asistan istemi: açıklama ve hazırlık hizmetin altında; boşsa satır yok', () => {
    const p = buildProfile({
        businessName: 'X', comms: M.NEUTRAL_COMMS, address: null, mapsUrl: null, phone: null, hours: [], staff: [], autoConfirm: true,
        services: [
            { id: 'a', name: 'Lazer', duration: 30, price: 500, color: null, description: 'Diyot lazer.', prep_note: PREP },
            { id: 'b', name: 'Manikür', duration: 45, price: null, color: null },
        ],
    });
    assert.match(p.text, /h1 · Lazer · 30 dk · [^\n]+\n   açıklama: Diyot lazer\.\n   hazırlık: Seanstan bir gün önce bölgeyi tıraş edin\. 48 saat güneşe çıkmayın\.\nh2 · Manikür/);
    const rules = read('supabase/functions/_shared/agent/prompt.ts');
    assert.match(rules, /"açıklama" ya da "hazırlık"/);
});

test('randevu satırındaki hizmet adından hazırlık notu (büyük/küçük harf duyarsız)', () => {
    const notes = new Map([['a', { name: 'Lazer Epilasyon', description: null, prep_note: 'Tıraş olun.' }]]);
    assert.equal(prepByName(notes, 'lazer epilasyon'), 'Tıraş olun.');
    assert.equal(prepByName(notes, 'Manikür'), null);
    assert.equal(prepByName(notes, ''), null);
});

test('notlar ayrı sorguda: asıl hizmet sorguları kolonları SEÇMEZ (göç yoksa liste boş kalmasın)', () => {
    for (const f of ['wa-agent/index.ts', 'whatsapp-booking/index.ts', 'public-booking/index.ts', 'wa-scheduler/index.ts', 'remind/index.ts']) {
        const src = read(`supabase/functions/${f}`);
        assert.match(src, /loadServiceNotes\(/, f);
        assert.doesNotMatch(src, /\.select\([^)]*prep_note/, f);
    }
    const loader = read('supabase/functions/_shared/booking/serviceNotes.ts');
    assert.match(loader, /if \(error \|\| !data\) return out;/);
    const mig = read('supabase/138_hizmet_notlari.sql');
    assert.match(mig, /ADD COLUMN IF NOT EXISTS description text/);
    assert.match(mig, /ADD COLUMN IF NOT EXISTS prep_note\s+text/);
    assert.match(mig, /char_length\(prep_note\) <= 300/);
});

test('masaüstü: kolon yoksa hizmet notsuz kaydedilir', () => {
    const src = read('src/hooks/useReservations.ts');
    assert.match(src, /function isMissingNotesColumn/);
    assert.match(src, /else if \(isMissingNotesColumn\(error\)\) notesColumns = false;/);
    assert.match(src, /prepNote: typeof s\.prep_note === 'string'/);
});
